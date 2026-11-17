# WhatsApp → n8n → Evolution

## Configuração

1. Em Atend&Hub, abra **Configurações → Webhooks → Conexão WhatsApp** e salve a URL HTTPS do webhook n8n. O campo é salvo por organização. `ATENDHUB_WHATSAPP_CONNECTION_WEBHOOK_URL` é um fallback opcional; nenhum segredo WhatsApp é exigido.
2. No nó **Webhook** do n8n, configure `Authentication: None` e método `POST`.
3. Configure o fluxo para executar a operação na Evolution de forma síncrona e terminar em **Respond to Webhook**. A resposta deve ser HTTP `200` com `Content-Type: application/json`.
4. Configure a deduplicação pelo `id` do evento (também enviado no header `Idempotency-Key`). Em retentativas, devolva o resultado armazenado para esse ID em vez de executar a mesma criação/alteração/exclusão duas vezes.

Não configure HMAC, Bearer, Header Auth ou callback. A aplicação continua usando Supabase Auth para usuários, exige superadministrador ativo, aplica RLS e restringe cada consulta à organização autenticada. A Service Role, se usada pelo servidor para persistência, não é exposta ao navegador.

## Fluxo síncrono

Atend&Hub cria a conexão e o evento de forma transacional, envia o POST e aguarda até 45 segundos pelo `Respond to Webhook`. Só depois valida e persiste a resposta. HTTP 200, por si só, não significa conexão ativa. Uma resposta sem `status` apenas confirma o recebimento: a conexão mantém o estado atual e a interface informa que o resultado da Evolution ainda não foi confirmado.

Se houver falha de rede, timeout, HTTP de erro, JSON inválido ou `ok: false`, o evento permanece salvo e pode ser reenviado com o mesmo ID. O botão sempre é liberado ao terminar a tentativa. Resultados atrasados são aceitos apenas para o evento ainda associado à última ação da conexão; eventos antigos não sobrescrevem ações recentes. Se a resposta do n8n não puder ser persistida, a interface não declara sucesso e permite reenviar/verificar.

## Eventos

Todos os eventos são enviados como JSON para o mesmo destino:

- `whatsapp.connection.create_requested`
- `whatsapp.connection.confirm_requested`
- `whatsapp.connection.update_requested`
- `whatsapp.connection.delete_requested`

Exemplo exato do payload (valores ilustrativos; os IDs reais são UUIDs gerados pelo servidor):

```json
{
  "id": "01934a70-2a11-7e91-8df0-123456789abc",
  "schemaVersion": 1,
  "eventType": "whatsapp.connection.create_requested",
  "occurredAt": "2026-11-17T12:00:00.000Z",
  "organizationId": "11111111-2222-4333-8444-555555555555",
  "actorId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "client": {
    "id": "22222222-3333-4444-8555-666666666666",
    "name": "Dra. Ana Luíza",
    "operationId": "33333333-4444-4555-8666-777777777777"
  },
  "connection": {
    "id": "44444444-5555-4666-8777-888888888888",
    "instanceName": "dra-ana-luiza-recepcao",
    "name": "recepcao",
    "phone": "551633334444",
    "apiKey": "<incluída pelo servidor quando já existe credencial salva>"
  }
}
```

Headers enviados:

```text
Content-Type: application/json
Idempotency-Key: <mesmo UUID do campo id>
```

O Atend&Hub monta `instanceName` no servidor a partir de cliente + nome informado (`nome-do-cliente-nome-informado`), normalizando para minúsculas e removendo acentos. O telefone contém `55 + DDD + número de 8 ou 9 dígitos`, sem pontuação. Não é acrescentado automaticamente um nono dígito.

## Respostas no Respond to Webhook

Use **Respond With: JSON**, **Response Code: 200** e estes corpos. A confirmação deve ocorrer depois de consultar a Evolution e conhecer o resultado real.

Criação concluída:

```json
{
  "ok": true,
  "status": "awaiting_confirmation",
  "message": "Instância criada."
}
```

Confirmação concluída após verificar a Evolution:

```json
{
  "ok": true,
  "status": "connected",
  "message": "Conexão confirmada."
}
```

Atualização concluída:

```json
{
  "ok": true,
  "status": "connected",
  "message": "Conexão atualizada."
}
```

Uma atualização também pode retornar `disconnected` ou `awaiting_confirmation`, conforme o estado real da Evolution. Confirmação aceita `connected`, `disconnected` ou `awaiting_confirmation`.

Exclusão concluída:

```json
{
  "ok": true,
  "status": "deleted",
  "message": "Instância excluída."
}
```

Falha da operação (mantenha HTTP 200 e informe a falha no JSON):

```json
{
  "ok": false,
  "message": "A Evolution recusou a atualização do número."
}
```

Se o fluxo só puder confirmar o recebimento, sem resultado final, devolva por exemplo:

```json
{
  "ok": true,
  "message": "Evento recebido; resultado da Evolution ainda está sendo verificado."
}
```

Resposta genérica não altera o status da conexão. Uma resposta `ok: true` com `status` deve incluir `message`; statuses incompatíveis com a ação serão recusados. Campos extras são ignorados, exceto `apikey`, que é validada e capturada exclusivamente no servidor. A mensagem é exibida como texto, nunca como HTML.

Quando a Evolution retornar a API key da instância, o `Respond to Webhook` pode incluí-la como `apikey` no JSON de resultado. O Atend&Hub salva esse valor na tabela privada vinculada à conexão e à organização do evento; ele não é devolvido ao navegador, adicionado à outbox ou registrado em logs. Em eventos posteriores, o servidor consulta a credencial e envia o nome exato `connection.apiKey` no payload para o n8n. Na criação inicial, esse campo é omitido enquanto não houver credencial salva. Nunca envie a chave como dado fornecido pelo navegador.

## Persistência e segurança

A criação da conexão e do evento é transacional. Os comandos de ação derivam usuário e organização da sessão Supabase, verificam superadministrador ativo e validam cliente/conexão na mesma organização. A RLS existente é preservada. A RPC síncrona tem `SECURITY DEFINER`, `search_path = ''` e execução concedida somente a `service_role`; a RPC de callback foi removida. Nenhuma resposta do n8n pode escolher organização, cliente ou conexão: o servidor usa exclusivamente o `eventId` enviado e a relação persistida no banco.

A URL por organização continua armazenada em Configurações → Webhooks. Nenhuma chamada é feita ao salvar essa URL. Não use webhook real em testes: criar, atualizar, confirmar ou excluir pode alterar uma instância real da Evolution. Testes automatizados usam transporte simulado.

## QR Code na criação e renovação

O servidor aceita também a resposta Evolution/n8n abaixo, diretamente ou encapsulada em uma lista de um item com `Final` contendo o JSON serializado:

```json
{
  "success": true,
  "status": "connecting",
  "qr_code": "data:image/png;base64,...",
  "pairing_code": null,
  "message": "QR Code gerado",
  "expires_in": 60
}
```

- `connecting` é normalizado para `awaiting_confirmation`. Nunca significa conectado.
- `qr_code` aceita Data URL PNG/JPEG/WebP ou base64 PNG puro, com limite de tamanho e validação da assinatura do formato. SVG e URLs externas são recusados.
- O campo `expires_in` é opcional (15 a 300 segundos). Sem ele, o código tem limite de exibição de 60 segundos no app, sem comprovar a validade exata na Evolution.
- A imagem e o pairing code são transitórios: não são salvos no banco, logs, outbox ou localStorage. Recarregar a página descarta o QR e exige nova solicitação.
- “Gerar novo QR Code” envia um novo `whatsapp.connection.update_requested` para a mesma instância e telefone. O handler de atualização no n8n deve consultar/gerar o QR atual na Evolution e devolvê-lo, sem criar outra instância. A chave de idempotência é nova para essa nova solicitação; reenvios de um evento antigo não devem criar outra instância.
- Somente a confirmação efetiva devolvendo `connected` conclui o pareamento. A imagem é ocultada quando a conexão está conectada ou excluída.
- Campos desconhecidos da resposta não são repassados ao navegador. A `apikey`, se retornada, é persistida em tabela privada e nunca incluída no resultado HTTP da aplicação.
- A resposta de produção fornecida pelo usuário foi analisada localmente (sem chamada ao n8n) e aceita: JSON em Final, success, connecting e imagem PNG em Data URL. Nenhum conteúdo dessa credencial ou QR foi incorporado aos fixtures do repositório.

## Inbox: envio de mensagens de texto

O Inbox lê conversas e mensagens de `atendhub_inbox_conversations` / `atendhub_inbox_messages` (RLS por organização, cliente e responsável do lead). Mensagens recebidas entram pelo webhook de ingestão (`atendhub_ingest_whatsapp_message`); recibos (`delivered`/`read`) por `atendhub_inbox_record_message_status`.

**Envio.** Somente o responsável pelo lead, com a conexão `connected`, pode enviar. O app grava a mensagem como `pending` e um evento em `atendhub_inbox_send_events` (sem `apiKey`) e chama a URL salva em Configurações → Webhooks → "Envio de mensagens do Inbox" com `Idempotency-Key = id do evento`. A `apiKey` da Evolution é lida no servidor apenas nesse momento e nunca é gravada no histórico.

Resposta esperada do workflow (Respond to Webhook):

```json
{ "ok": true, "messageId": "<id retornado pela Evolution>", "status": "sent" }
```

- `ok:true` com `messageId` -> `sent`. Qualquer outro formato, HTTP não-2xx com `ok:true`, resposta vazia ou timeout (30 s) -> `uncertain` ("não confirmada"): o usuário confere no WhatsApp e pode reenviar com a mesma solicitação.
- `ok:false` + `message` -> `failed`; "Tentar novamente" reutiliza o mesmo `requestId`.
- O workflow deve deduplicar por `Idempotency-Key`/`message.id`, pois o reenvio de uma mensagem `uncertain` repete a chamada.
- Se a Evolution devolver o eco `fromMe` com o mesmo `messageId`, a mensagem é reconciliada em vez de duplicada.

Fora do escopo desta etapa: mídia, áudio, reações, grupos, IA, templates e Realtime (o app faz polling a cada 3–5 s).
