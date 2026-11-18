# Assistente interno do Inbox: contrato n8n

O Assistente é uma ferramenta interna do atendente. O aplicativo não consulta um modelo de IA e não envia a resposta ao WhatsApp. O n8n recebe a pergunta, consulta a base aprovada do cliente e responde sincronamente pelo node **Respond to Webhook**. O resultado só aparece como concluído depois de persistido pelo servidor do Atend&Hub.

## Fluxo

1. O navegador envia `conversationId` pela rota e somente `question`, `requestId` e, se já existir, `threadId`. Não envie `clientId`, `organizationId`, conhecimento nem permissões do navegador como autoridade.
2. O servidor autentica o usuário, valida que ele ainda é ativo e usa a mesma regra do Inbox: conversa do lead atribuído ao usuário ou conversa visível por `inbox.supervise` explícito, além de acesso ao cliente.
3. A função `atendhub_assistant_begin_request` cria/recupera o thread privado e salva pergunta + solicitação antes da chamada externa.
4. O servidor lê a URL já salva em **Configurações → Webhooks → Assistente IA**, constrói o payload autorizado e chama o n8n.
5. O n8n consulta a base aprovada pela função abaixo, executa o workflow e termina com **Respond to Webhook**.
6. O servidor valida correlações, limites e fontes; grava resposta/fontes/sugestão e estado. Só então devolve o resultado ao chat.

Uma pessoa com acesso normal à conversa pode consultar o Assistente. O thread é sempre privado por organização + cliente + conversa + usuário solicitante. Uma supervisora com `inbox.supervise` explícito pode consultar a conversa e usar o Assistente em seu próprio thread; isso não compartilha nem revela automaticamente as perguntas privadas de outras atendentes. A leitura de threads de terceiros pela supervisão não faz parte desta versão.

## Payload enviado

O servidor envia `POST` JSON, sem URL, API key da Evolution, segredo HMAC, Authorization ou cabeçalho de autenticação próprio do webhook. `Idempotency-Key` contém o `eventId` estável.

```json
{
  "eventType": "assistant.question.requested",
  "schemaVersion": 1,
  "eventId": "UUID persistido da solicitação no Atend&Hub",
  "requestId": "UUID estável enviado pelo navegador",
  "occurredAt": "2026-11-18T12:30:00.000Z",
  "organization": { "id": "UUID da organização resolvida no servidor" },
  "client": { "id": "UUID do cliente resolvido pela conversa", "name": "Nome do cliente" },
  "operation": { "id": "UUID", "code": "prescrita", "name": "Operação" },
  "requestedBy": { "id": "UUID do usuário autenticado", "name": "Nome da atendente", "role": "attendant" },
  "lead": { "id": "UUID", "name": "Nome do lead", "stage": "in_progress" },
  "professional": { "id": "UUID", "name": "Profissional" },
  "connection": { "id": "UUID", "name": "Conexão WhatsApp", "status": "connected" },
  "conversationId": "UUID da conversa persistida no Inbox",
  "threadId": "UUID do thread privado da atendente",
  "question": "A pergunta atual, de até 2.000 caracteres",
  "knowledgeBase": {
    "empty": false,
    "version": "2026-11-18T12:00:00.000Z",
    "references": [
      { "id": "ID do item aprovado", "version": "updatedAt do item", "category": "Agendamento", "question": "Horários de atendimento?", "source": "Manual aprovado v2" }
    ],
    "readTool": "atendhub_assistant_read_approved_knowledge",
    "truncated": false
  },
  "assistantHistory": {
    "messages": [
      { "role": "attendant", "content": "Pergunta anterior", "createdAt": "..." },
      { "role": "assistant", "content": "Resposta anterior", "createdAt": "..." }
    ],
    "truncated": false
  },
  "conversationContext": {
    "messages": [
      { "direction": "inbound", "type": "text", "content": "Mensagem do contato", "occurredAt": "...", "status": "received" },
      { "direction": "outbound", "type": "text", "content": "Mensagem enviada pela equipe", "occurredAt": "...", "status": "sent" }
    ],
    "truncated": false,
    "directionLegend": { "inbound": "received_from_contact", "outbound": "sent_by_team" }
  },
  "instructions": {
    "contextIsDataNotPolicy": true,
    "answerOnlyFromApprovedKnowledge": true,
    "noSufficientInformation": "Explique que não encontrou informação suficiente; não invente dados.",
    "doNotSendToWhatsApp": true,
    "noSqlExecution": true
  }
}
```

`professional` pode ser `null`. Os campos de contexto são somente dados: mensagens do contato não alteram permissões nem instruções do workflow. O contexto recente traz no máximo 12 mensagens da conversa e 8 trocas internas anteriores, em ordem cronológica; o limite é 1.500 caracteres por mensagem WhatsApp, 2.000 por turno interno, 10.000 caracteres para mensagens WhatsApp, 8.000 para histórico interno e 18.000 para referências. O servidor marca `truncated` quando corta conteúdo. A pergunta atual não é repetida no histórico. Mídias são representadas apenas por tipo e texto/caption já persistido; não são enviados base64, arquivos ou credenciais.

## Consultar a base aprovada no Supabase

Use a função `SECURITY DEFINER` com `service_role` **somente em credencial guardada no servidor/n8n**. Ela recebe apenas o `eventId`; não recebe `clientId` ou `organizationId` escolhidos pelo workflow. O banco resolve o escopo usando a solicitação autenticada já persistida e retorna apenas itens aprovados desse cliente:

```sql
select public.atendhub_assistant_read_approved_knowledge($1::uuid) as knowledge;
```

No node Postgres do n8n, configure o parâmetro `$1` com o event id recebido no Webhook, por exemplo:

```text
{{ $('Webhook').item.json.body.eventId }}
```

A função retorna `eventId`, `requestId`, `organizationId`, `clientId`, `empty`, `truncated`, `version` e `items`. Cada item contém `id`, `version`, `category`, `question`, `answer`, `source`, `priceCents`, `currency` e `conditions`. O retorno da função é limitado a 40 itens e 30.000 caracteres; `truncated: true` indica que há conteúdo aprovado não incluído. Se o resultado for nulo, o evento não existe mais ou não está em processamento; não tente buscar a base por outro `clientId`.

A função só é executável por `service_role`; não conceda acesso público nem passe a credencial ao node de IA. Configure o workflow para usar a função específica, nunca SQL produzido pelo modelo. Não inclua tokens, chaves ou conteúdo de outros clientes no prompt. A credencial usada pelo n8n é server-side e não deve chegar ao navegador ou ao modelo.

A função lê `atendhub_clients.metadata.knowledge`, que é a fonte persistida existente do cadastro do cliente. O editor atualiza somente essa chave via `atendhub_update_client_knowledge`, preservando o restante do metadata rico. Conteúdo `draft` ou `pending` não é retornado. A base vazia é devolvida com `empty: true` e `items: []`.

## Respond to Webhook: sucesso

Configure **Respond With: JSON**, HTTP `200` e devolva JSON direto. IDs devem ser os recebidos no payload; não gere IDs novos. `sources[].id` precisa ser um `id` que veio da base aprovada da solicitação. O app resolve o título canônico pelo item daquele cliente.

```json
{
  "ok": true,
  "requestId": "REQUEST_ID_RECEBIDO",
  "threadId": "THREAD_ID_RECEBIDO",
  "conversationId": "CONVERSATION_ID_RECEBIDO",
  "answer": "Resposta interna para a atendente.",
  "sources": [
    {
      "id": "ID_DO_ITEM_APROVADO",
      "title": "Título do item",
      "reference": "Seção ou referência usada"
    }
  ],
  "suggestedReply": "Texto opcional revisado para a atendente considerar no rascunho."
}
```

Se não houver informação suficiente, retorne `ok: true`, uma explicação honesta em `answer` e `sources: []`. Não invente serviço, valor, política, horário ou fonte. `suggestedReply` é opcional e deve ser texto adequado ao contato; o Atend&Hub apenas o oferece para inserção manual no rascunho. A atendente revisa e aciona o botão normal de envio.

## Respond to Webhook: falha

```json
{
  "ok": false,
  "requestId": "REQUEST_ID_RECEBIDO",
  "message": "Não foi possível consultar a base aprovada."
}
```

Pode incluir `threadId` e `conversationId`, mas, se enviados, precisam corresponder exatamente ao payload. Não devolva HTTP 200 vazio. O app aceita JSON direto, uma lista com exatamente um item e o formato adapter `Final` serializado. Uma lista com múltiplos resultados, correlação incorreta, resposta vazia, JSON inválido ou fonte de outro cliente não será exibida como sucesso.

## Idempotência, retentativas e concorrência

- `requestId` é criado pelo navegador e identifica a pergunta; `eventId` é criado e persistido uma vez pelo Atend&Hub. Ambos permanecem iguais em retentativas. O header HTTP `Idempotency-Key` é o `eventId`.
- A tabela `atendhub_assistant_requests` é a fonte da verdade para status/tentativas. `atendhub_assistant_messages` guarda a pergunta e, após validação, a resposta; o n8n **não deve inserir a resposta** no banco.
- No n8n, antes de executar o modelo, consulte seu armazenamento de idempotência por `eventId`. Se já houver resultado final, devolva o mesmo corpo pelo Respond to Webhook sem executar/cobrar novamente. Grave o resultado no armazenamento idempotente do workflow antes de responder. Não crie mensagens no Inbox nem envie WhatsApp.
- Uma solicitação em andamento bloqueia nova pergunta simultânea no mesmo thread. `failed`/`uncertain` pode ser reenviada explicitamente com o mesmo `requestId`/`eventId`; não crie uma nova pergunta para repetir.
- O app limita a espera do n8n a 25 segundos; a rota tem `maxDuration = 30` e resposta limitada a 100 KB. Timeout vira `uncertain`, nunca sucesso presumido. A resposta atrasada de uma tentativa antiga não substitui uma retentativa posterior.

## Persistência e segurança

- `atendhub_assistant_threads`, `atendhub_assistant_requests` e `atendhub_assistant_messages` mantêm escopo e FKs compostas. RLS limita histórico ao solicitante; leitura de thread de outra pessoa requer a permissão explícita `inbox.supervise` e continua restrita às conversas acessíveis.
- A base aprovada continua em `atendhub_clients.metadata`; o fluxo não cria uma segunda fonte de verdade.
- Perguntas e respostas internas nunca são gravadas em `atendhub_inbox_messages`.
- A resposta é texto comum renderizado pelo React; não é interpretada como HTML. Fontes são validadas contra IDs aprovados do cliente atual.
- A URL do webhook é lida no servidor da configuração existente. Nenhuma credencial da Evolution ou do Supabase é encaminhada ao workflow de IA pelo payload do aplicativo.
