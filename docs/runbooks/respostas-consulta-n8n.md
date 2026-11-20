# Respostas da consulta no n8n

Aplique a migration `20261121180000_atendhub_appointment_response_events.sql` após a migration de links curtos. Depois de publicar o app, configure a URL de produção do nó **Webhook** em `ATENDHUB_APPOINTMENT_RESPONSE_WEBHOOK_URL`. Se usar autenticação Header Auth no n8n, configure `ATENDHUB_APPOINTMENT_RESPONSE_WEBHOOK_TOKEN` com o valor esperado no cabeçalho `Authorization: Bearer ...`.

## Workflow disparado pelo clique

**Webhook POST → Verificar ID do evento → Switch → Evolution → Postgres → Respond to Webhook.**

O endereço da página de confirmação usa GET para mostrar a consulta. Apertar **Confirmar presença** ou **Pedir reagendamento** faz POST e grava a decisão antes da chamada ao webhook. O evento contém `id`, `eventType`, `appointmentId`, `clientId`, `leadId`, `professionalId`, `startsAt`, `timezone`, `conversationId` e `patient` com `instance`, `phone` e `body`. Use o ID do evento como chave para deduplicar os envios e manter separados os resultados de cada destinatário. Guarde o retorno da Evolution no workflow antes de registrar no banco para permitir retentativa somente do Postgres.

No nó **Switch**, use o valor `{{ $json.body.eventType }}` com as duas regras abaixo:

- `appointment.patient_confirmed` registra confirmação. O texto do paciente já vem em `body.patient.body`.
- `appointment.reschedule_requested` marca **Em reagendamento** e pergunta ao paciente qual horário prefere. O horário atual continua reservado.

O nó **Evolution** recebe a instância, o telefone e a mensagem de `body.patient`. Se telefone ou instância estiver ausente, pule o envio ao paciente e encaminhe o evento para a equipe. Use `professionalId` para escolher o destinatário interno que você configurou no n8n. O evento contém o identificador do profissional para que você defina a linha e número de destino da equipe; esses dados de roteamento não são enviados automaticamente.

Após o envio ao paciente, registre o texto que a Evolution devolveu. Com o nó inicial nomeado **Webhook da consulta** e o retorno da Evolution no formato `{ success, data }`, use no Postgres:

```sql
select public.atendhub_record_appointment_response_message(
  $1::uuid, $2::text, $3::timestamptz, $4::text
) as ack;
```

**Query Parameters → Expression**

```javascript
{{ [
  $('Webhook da consulta').item.json.body.id,
  $json.data.key.id,
  new Date(Number($json.data.messageTimestamp) * 1000).toISOString(),
  $json.data.message.conversation
] }}
```

O valor de data supõe timestamp Unix em segundos, conforme o retorno do seu nó Evolution. Retorne HTTP 2xx apenas quando o evento tiver sido processado ou guardado de forma durável. A confirmação na página já foi gravada mesmo se o envio do aviso falhar.

## Retentativas

Se o webhook falhar, o evento fica pendente. Depois da reserva de cinco minutos expirar, um Schedule Trigger no n8n pode reservar a próxima pendência com:

```sql
select public.atendhub_claim_appointment_response() as event;
```

Processe somente quando `event` estiver preenchido. Passe o objeto `event` como entrada do mesmo processamento e deduplique pelo ID. Depois de concluir, registre:

```sql
select public.atendhub_ack_appointment_response($1::uuid) as ack;
```

**Query Parameters** recebe `{{ [$json.id] }}` se o ID do evento estiver no item corrente.

## Atualizar o Postgres de registro do lembrete já existente

O ACK do workflow de lembrete agora pode receber a mensagem real da Evolution. Em **Registrar envio**, use:

```sql
select public.atendhub_eve_sent(
  $1::uuid, $2::text, $3::text, $4::timestamptz, $5::text
) as ack;
```

```javascript
{{ [
  $('Reservar lembrete').item.json.reminder.requestId,
  $('Reservar lembrete').item.json.reminder.instance,
  $json.data.key.id,
  new Date(Number($json.data.messageTimestamp) * 1000).toISOString(),
  $json.data.message.conversation
] }}
```

Use o nome exato do nó de reserva e os dados da mesma execução. O quinto parâmetro registra o texto exato no Inbox, inclusive quando o n8n formatou a mensagem. Se a reserva contém um link de confirmação, a mensagem precisa conter esse link para o ACK ser aceito. O ACK pode ser repetido com a resposta original da Evolution para corrigir o histórico do mesmo envio. Mantenha o envio anterior fora da retentativa.
