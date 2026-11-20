# Lembretes de confirmação pelo n8n

O workflow de envio começa no Schedule Trigger. O primeiro Postgres lê do Supabase as instâncias conectadas e o cliente associado a cada uma. O workflow de entrada começa no webhook da Evolution e grava a mensagem recebida no Inbox.

## Workflow de envio

**Schedule Trigger → Buscar conexões (Postgres) → Reservar lembrete (Postgres) → IF há lembrete → Enviar pela Evolution → Registrar envio (Postgres).**

Em cada nó Postgres, selecione **Execute Query**. Cole o bloco SQL em **Query**. Quando houver `$1`, `$2` etc., abra **Options → Query Parameters**, selecione **Expression** e cole a expressão completa, incluindo `{{ }}`. A expressão deve produzir um array com um valor por posição. Configure **Query Batching → Independently** quando o nó receber vários itens, para manter uma reserva e um resultado por linha.

### 1. Buscar conexões

Ligue este nó diretamente ao agendador. Cole a consulta inteira e deixe **Query Parameters** vazio.

```sql
select
  w.client_id as "clientId",
  w.instance_name as "instance"
from public.atendhub_whatsapp_connections as w
where w.status = 'connected'
order by w.instance_name;
```

Cada conexão visível para a credencial gera um item. Desative **Always Output Data** para encerrar o ramo se a consulta voltar vazia. A etapa seguinte verifica se cada conexão tem um lembrete elegível.

A credencial Postgres precisa de leitura sobre a tabela e de visibilidade sobre as linhas. O papel `atendhub_integration` tem execução das funções de lembrete. A leitura dessa tabela depende dos grants e das políticas RLS efetivamente aplicados no banco.

### 2. Reservar um lembrete

**Query**

```sql
select public.atendhub_eve_claim($1::uuid, $2::text) as reminder;
```

**Query Parameters → Expression**

```javascript
{{ [$json.clientId, $json.instance] }}
```

**Para diagnosticar “there is no parameter $1”**, selecione primeiro o nó anterior e confira seu OUTPUT. Depois, no nó de reserva, mantenha a expressão acima e troque temporariamente apenas a Query pela consulta abaixo. Ela deve devolver o par recebido e pode ser executada sem reservar uma consulta.

```sql
select $1::uuid as "clientId", $2::text as "instance";
```

Restabeleça a query de reserva após o teste. A resposta tem uma coluna JSON chamada `reminder`. Configure um nó IF com a expressão booleana `{{ $json.reminder != null }}`. No ramo falso, encerre o processamento desse item. `reminder: null` é um retorno válido. A reserva procura um envio pendente para uma consulta futura, dentro da janela configurada, com conexão ativa e atendimento aberto do lead nessa linha. Em **Confirmações e lembretes → Configurar lembretes**, defina a antecedência para consultas marcadas no mesmo dia, a antecedência para consultas marcadas em um dia anterior e se deseja enviar também o lembrete da consulta. Os padrões são 120 minutos no mesmo dia, 1.440 minutos para outro dia e um lembrete. Se a consulta for criada dentro da janela, a próxima execução pode reservar o primeiro lembrete. O pedido de confirmação sai enquanto a consulta aguarda resposta. O lembrete da consulta tem horários próprios e pode sair mesmo após a confirmação, independentemente do envio do pedido. Duas conversas abertas com destinos diferentes para o mesmo lead nessa linha exigem conciliação.

No ramo verdadeiro, preserve os campos de `reminder` antes da chamada à Evolution:

| Campo | Uso no envio |
|---|---|
| `requestId` | Identificador estável da reserva e chave de idempotência do workflow |
| `instance` | Instância selecionada pelo banco |
| `phone` | Número do destinatário |
| `body` | Texto completo a enviar, com horário e código da consulta |
| `purpose` | `confirmation` para pedido de confirmação ou `reminder` para aviso da consulta |
| `replyText` | Retorno do botão opcional “Confirmar presença” para `confirmation`. Para `reminder`, o campo vem vazio |

### 3. Registrar o envio aceito pela Evolution

A chamada à Evolution é um nó de envio, sem SQL. Depois dela, reúna em um único item do n8n os quatro campos abaixo. Use **Edit Fields** e o item vinculado do nó de reserva se o nó de envio substituir a entrada pela resposta da API.

| Posição | Campo do item | Origem |
|---|---|---|
| `$1` | `requestId` | `reminder.requestId` da reserva deste envio |
| `$2` | `instance` | `reminder.instance` da mesma reserva |
| `$3` | `providerMessageId` | ID da mensagem de saída que a Evolution aceitou |
| `$4` | `sentAt` | Horário real desse envio em ISO 8601 com fuso |

Os caminhos exatos do JSON da Evolution dependem do nó e da versão instalados. Verifique o OUTPUT de um envio controlado para mapear o ID e o horário. Se o provedor entregar Unix em segundos, converta com `new Date(Number(valor) * 1000).toISOString()`; para milissegundos, use `new Date(Number(valor)).toISOString()`.

**Query**

```sql
select public.atendhub_eve_sent(
  $1::uuid, $2::text, $3::text, $4::timestamptz
) as ack;
```

**Query Parameters → Expression**

```javascript
{{ [$json.requestId, $json.instance, $json.providerMessageId, $json.sentAt] }}
```

A função retorna `void`. A conclusão da query sem erro registra o envio. Se só o registro no Postgres falhar, repita esse nó com os mesmos quatro valores. Se o envio à Evolution ficar incerto, reconcilie o resultado antes de reenviar: a reserva expira após dez minutos e pode voltar com o mesmo `requestId`. Mantenha o ID e o horário do provedor em armazenamento durável do workflow. Programe novas execuções dentro da janela comercial ou repita a reserva para o mesmo par cliente/instância até receber `null`. Cada chamada reserva no máximo um lembrete.

## Workflow de entrada

**Webhook Evolution → normalizar um item por evento → Switch por tipo de evento → Postgres.** Os nomes dos campos nas expressões a seguir são o contrato do item preparado pelo workflow. Confira a estrutura real do webhook no seu n8n antes de mapear os valores.

### 4. Registrar mensagem ou resposta do paciente

Use este nó para a mensagem recebida e para o eco de uma mensagem enviada pelo aparelho. Para uma confirmação por botão, encaminhe em `body` o valor de retorno efetivamente escolhido pelo contato e use `messageType = text`. Para texto livre, preserve o texto recebido.

**Query**

```sql
select public.atendhub_ingest_whatsapp_message(
  p_instance_name       => $1::text,
  p_provider_message_id => $2::text,
  p_remote_jid          => $3::text,
  p_from_me             => $4::boolean,
  p_message_type        => $5::text,
  p_body                => $6::text,
  p_provider_timestamp  => $7::timestamptz,
  p_correlation_id      => $8::uuid,
  p_remote_phone        => $9::text,
  p_contact_name        => $10::text,
  p_media               => $11::jsonb,
  p_provider_meta       => $12::jsonb
) as result;
```

**Query Parameters → Expression**

```javascript
{{ [$json.instance, $json.providerMessageId, $json.remoteJid, $json.fromMe, $json.messageType, $json.body ?? '', $json.occurredAt, $json.correlationId || null, $json.remotePhone || null, $json.contactName || null, JSON.stringify($json.media ?? {}), JSON.stringify($json.providerMeta ?? {})] }}
```

- `providerMessageId` é o ID **da mensagem que acabou de chegar**. `remoteJid` é o identificador WhatsApp do contato remoto. `fromMe` deve ser booleano: `false` para mensagem do paciente e `true` para saída. Preserve o timestamp original do evento em `occurredAt`, em ISO com fuso, inclusive em reentregas.
- `correlationId` é opcional e serve ao eco de um envio feito pelo Inbox quando vier o UUID interno da mensagem enviada. Para resposta do paciente, use `null`. Para `@lid`, informe em `remotePhone` o telefone internacional do contato quando fornecido pela integração.
- `media` e `providerMeta` são objetos no item normalizado. Para texto simples, podem ser omitidos. O argumento opcional `p_lead_id` fica com o padrão SQL `null` no fluxo automático.
- Leia `result.outcome`. `recorded`, `reconciled` e `duplicate` são resultados esperados. `ambiguous_lead` encaminha o caso para **Escolher atendimento**. `pending_identity` indica que faltou identificar o contato. `instance_not_found` requer conferir a configuração da instância.

A confirmação exige a resposta `CONFIRMO <código>` associada ao envio aceito, à linha, ao contato e ao horário válido da consulta. O próprio banco relaciona a resposta à oportunidade, inclusive quando o ACK chega depois dela. Um “sim” solto permanece no Inbox. O registro de confirmação por telefone fica no Atend&Hub, com a sessão da recepção. A qualificação adquirida é preservada após falta ou cancelamento posterior.

### 5. Atualizar recibo de mensagem, se o webhook trouxer eventos de status

Use este ramo para recibos da mensagem de saída. Normalize `status` para `sent`, `delivered`, `read` ou `failed`, conforme o evento recebido. O recibo de leitura acompanha a entrega da mensagem; a presença do paciente continua dependendo da resposta ao lembrete.

**Query**

```sql
select public.atendhub_inbox_record_message_status(
  $1::text, $2::text, $3::text, $4::timestamptz, $5::text
) as result;
```

**Query Parameters → Expression**

```javascript
{{ [$json.instance, $json.providerMessageId, $json.status, $json.occurredAt || null, $json.reason || null] }}
```

Use o ID da mensagem cujo status mudou. O banco pode retornar `stored_for_later` se o recibo chegar antes do registro da mensagem. Nenhum desses nós envia dados à Meta.
