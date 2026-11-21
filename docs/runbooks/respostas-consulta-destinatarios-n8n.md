# Enviar a resposta da consulta ao paciente, à clínica e à GlowUp

## 1. Receber o clique

Crie um nó **Webhook da consulta** com método **POST**, path `resposta-consulta` e resposta **Using Respond to Webhook Node**. Ative o workflow e cole a Production URL em **Configurações → Webhooks → Respostas de agendamento**. Para usar Header Auth, configure essa mesma URL também em `ATENDHUB_APPOINTMENT_RESPONSE_WEBHOOK_URL` e o token de `Authorization: Bearer <token>` em `ATENDHUB_APPOINTMENT_RESPONSE_WEBHOOK_TOKEN`. A URL do ambiente também serve como destino padrão se a organização ainda não tiver configurado o campo.

O webhook recebe o evento em `$json.body`. O clique **Confirmar presença** gera `appointment.patient_confirmed`; **Pedir reagendamento** gera `appointment.reschedule_requested`. A resposta do paciente já está gravada quando o webhook chega.

## 2. Postgres — Buscar dados da consulta

Use a credencial **ATEND&HUB**, operação **Execute Query** e o SQL abaixo depois da migration `20261121190000_atendhub_appointment_response_contacts.sql`.

```sql
select public.atendhub_appointment_response_contacts($1::uuid) as details;
```

Em **Options → Query Parameters → Expression**:

```javascript
{{ [$json.body.id] }}
```

A função usa o ID do evento para localizar o agendamento. Ela retorna o nome do paciente, o nome do profissional, a data e hora no fuso da consulta e os destinatários. O número do paciente vem da conversa vinculada ao evento. O número da clínica vem de **Perfil do cliente → Informações → Contato administrativo → Telefone administrativo**. O telefone oficial da GlowUp fica na configuração do workflow. Se `details` vier vazio, preserve a pendência e confira se o evento ainda está reservado. O webhook recebe eventos que o app já reservou por cinco minutos.

## 3. Edit Fields — Configurar destinatários internos

Mantenha **Include Other Input Fields** ativado e adicione três campos String:

| Campo | Valor |
|---|---|
| `numeroGlowUp` | Número oficial da GlowUp com DDI e DDD, só dígitos |
| `instanciaAvisos` | Instância Evolution que enviará os avisos internos |
| `instanciaAvisosPhone` | Número da própria instância interna com DDI e DDD, para impedir envio para si mesma |

A resposta ao paciente sai pela instância da conversa original. Os avisos internos saem pela instância configurada aqui. Se o oficial da GlowUp for o próprio número da linha que dispara os avisos, escolha outra instância remetente.

## 4. Code — Preparar envios

Use **Run Once for Each Item** apenas para etapas que devolvam um único item. Para este nó, selecione **Run Once for All Items** e cole:

```javascript
const normalize = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  // Os contatos administrativos cadastrados sem DDI são números brasileiros.
  const phone = /^\d{10,11}$/.test(digits) ? '55' + digits : digits;
  return /^[1-9]\d{7,14}$/.test(phone) ? phone : null;
};

return $input.all().flatMap(({ json }, index) => {
  const d = json.details;
  if (!d?.id) throw new Error('Evento sem dados de consulta. Confira o nó Postgres.');
  if (!['appointment.patient_confirmed', 'appointment.reschedule_requested'].includes(d.eventType)) {
    throw new Error('Tipo de resposta de consulta desconhecido.');
  }
  const confirmed = d.eventType === 'appointment.patient_confirmed';
  const internalText = [
    confirmed ? '✅ Consulta confirmada' : '🔁 Pedido de reagendamento',
    'Paciente: ' + d.patientName,
    'Clínica: ' + d.clinicName,
    'Profissional: ' + d.professionalName,
    'Consulta: ' + d.appointmentLocal,
  ].join('\n');
  const sender = normalize(json.instanciaAvisosPhone);
  const already = new Set();
  return [
    { recipient: 'paciente', phone: normalize(d.patient?.phone), instance: d.patient?.instance, text: d.patient?.body },
    { recipient: 'clinica', phone: normalize(d.clinicPhone), instance: json.instanciaAvisos, text: internalText },
    { recipient: 'glowup', phone: normalize(json.numeroGlowUp), instance: json.instanciaAvisos, text: internalText },
  ].flatMap((item) => {
    if (item.recipient === 'glowup' && (!item.phone || !item.instance || item.phone === sender)) {
      throw new Error('Configure o número oficial da GlowUp e uma instância interna com outro número.');
    }
    if (!item.phone || !item.instance || !item.text || (item.recipient !== 'paciente' && item.phone === sender)) return [];
    const key = item.instance + ':' + item.phone;
    if (already.has(key)) return [];
    already.add(key);
    return [{ json: { ...item, eventId: d.id, deliveryKey: d.id + ':' + item.recipient }, pairedItem: { item: index } }];
  });
});
```

O nó omite a clínica quando o telefone administrativo não estiver preenchido e omite o paciente quando o evento não contém um destino WhatsApp identificado. Os outros destinatários seguem normalmente.

## 5. Evolution — Enviar mensagens e registrar o paciente

Use **Loop Over Items** com lote 1 se for persistir o resultado individual. Antes de enviar, consulte uma **Data Table** por `deliveryKey`. Registre o retorno da Evolution por destinatário após o envio e reutilize esse retorno em uma retentativa do Postgres. Se houver falha de rede com resultado incerto, confira se o provedor aceitou o envio antes de tentar enviar novamente.

Configure **Enviar Texto** com instância `{{ $json.instance }}`, destinatário `{{ $json.phone }}` e mensagem `{{ $json.text }}`.

Depois do envio, coloque um **IF** com **Boolean → is true** e valor `{{ $('Preparar envios').item.json.recipient === 'paciente' }}`. Somente esse ramo registra a mensagem na conversa do paciente. No **Postgres — Registrar resposta no Inbox**, use:

```sql
select public.atendhub_record_appointment_response_message(
  $1::uuid, $2::text, $3::timestamptz, $4::text
) as ack;
```

**Query Parameters → Expression**

```javascript
{{ [
  $('Preparar envios').item.json.eventId,
  $json.data.key.id,
  new Date(Number($json.data.messageTimestamp) * 1000).toISOString(),
  $json.data.message.conversation
] }}
```

A expressão usa o formato Evolution já observado, com `data.messageTimestamp` em Unix segundos. Ligue os ramos de paciente e equipe de volta ao Loop. Na saída **done**, conecte **Respond to Webhook**, com código HTTP 200 e corpo `{"ok":true}`. Assim, o app registra o evento como entregue após o processamento. Se um envio falhar, deixe o evento pendente para retentativa e preserve os resultados individuais já aceitos.

Para retentativas pelo agendador, use as consultas de reserva e ACK do guia [Respostas da consulta no n8n](respostas-consulta-n8n.md). O ID reservado deve chegar ao Postgres de dados da consulta.
