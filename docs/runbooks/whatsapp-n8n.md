# WhatsApp → n8n → Evolution

## Ativação necessária

Código implementado; não ativado no Supabase de produção nesta sessão.

1. Aplicar `supabase/migrations/20261117000000_atendhub_whatsapp_connections.sql` no banco compartilhado, após conferir conflitos. A migration cria somente objetos atendhub_. Não recriar o banco nem alterar objetos de outros sistemas.
2. Acessar como super_admin ativo da organização. Em Configurações → Webhooks, salvar o destino Conexão WhatsApp. URLs antigas existiam somente na memória do navegador: recuperar pela opção disponível enquanto ainda estiverem nessa sessão, ou cadastrar novamente. Salvar não cria variáveis de ambiente.
3. Configurar no servidor (nunca NEXT_PUBLIC):
   - SUPABASE_SERVICE_ROLE_KEY (já utilizada nas integrações administrativas; somente no servidor).
   - ATENDHUB_WHATSAPP_WEBHOOK_SECRET: segredo para assinar os eventos enviados ao n8n.
   - ATENDHUB_WHATSAPP_CALLBACK_SECRET: segredo independente para autenticar o retorno do n8n.
   - ATENDHUB_WHATSAPP_CONNECTION_WEBHOOK_URL: fallback opcional quando o destino não estiver salvo por organização.
4. Usar a URL pública do aplicativo para o retorno: POST /api/whatsapp/callback.
5. Criar número em Configurações → Conexão WhatsApp, confirmar recebimento no n8n e fazer o pareamento na Evolution pelo fluxo existente. A tela não cria QR Code nem pareia sozinha.

## Contrato de saída

POST JSON ao mesmo destino para todos os eventos:

- whatsapp.connection.create_requested
- whatsapp.connection.confirm_requested
- whatsapp.connection.update_requested
- whatsapp.connection.delete_requested

Exemplo (IDs ilustrativos):

```json
{
  "id": "UUID do evento",
  "schemaVersion": 1,
  "eventType": "whatsapp.connection.create_requested",
  "occurredAt": "2026-11-17T12:00:00Z",
  "organizationId": "UUID",
  "actorId": "UUID do usuário autenticado",
  "client": {"id": "UUID", "name": "Dra. Ana Luíza", "operationId": "UUID"},
  "connection": {"id": "UUID", "instanceName": "dra-ana-luiza-recepcao", "name": "recepcao", "phone": "551633334444"}
}
```

Headers:
- Content-Type: application/json
- Idempotency-Key: mesmo UUID de id
- X-AtendHub-Signature: HMAC-SHA256 hexadecimal do corpo JSON exato, usando ATENDHUB_WHATSAPP_WEBHOOK_SECRET.

O n8n deve verificar a assinatura e deduplicar por id antes de chamar a Evolution. HTTP 2xx significa somente recebimento do evento. Não significa WhatsApp conectado.

O nome da instância é derivado no banco a partir do cliente autorizado e do nome digitado, em minúsculas sem acentos/espaços. Fica estável após criar; atualizar modifica o telefone. Para mudar o identificador, criar nova conexão. O telefone enviado contém 55 + DDD + 8/9 dígitos, sem pontuação. Não é adicionado nono dígito automaticamente.

## Retorno do n8n

```json
{"connectionId":"UUID","eventId":"UUID do evento que originou a ação","status":"connected"}
```

Statuses: awaiting_confirmation, connected, disconnected, error, deleted.

Headers:
- X-AtendHub-Timestamp: segundos Unix atuais.
- X-AtendHub-Signature: HMAC-SHA256 hexadecimal de `${timestamp}.${rawBody}`, usando ATENDHUB_WHATSAPP_CALLBACK_SECRET.

Exemplo Node.js para assinatura, executado somente em ambiente seguro do n8n:

```js
const rawBody = JSON.stringify({connectionId, eventId, status});
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = require('node:crypto').createHmac('sha256', callbackSecret)
  .update(timestamp + '.' + rawBody).digest('hex');
// Enviar rawBody sem serializá-lo novamente, junto aos dois headers acima.
```

Janela de assinatura: 5 minutos. O retorno só altera a conexão se eventId corresponder à última ação daquela conexão. Resultado final repetido é idempotente; resultado diferente para o mesmo evento é ignorado. `connected` só é aceito para confirm_requested/update_requested; `deleted` somente para delete_requested. Eventos antigos não podem reverter uma ação mais recente.

## Estados e reenvio

- Cadastro gera conexão aguardando confirmação e evento na mesma transação.
- Confirmar solicita ao n8n a verificação/configuração da instância; somente o callback altera para conectado.
- Exclusão é lógica e só se conclui após callback, preservando histórico.
- Evento não recebido deve ser reenviado antes de iniciar a próxima ação, para manter a ordem criação → confirmação.
- Falha HTTP, timeout ou configuração ausente: evento fica persistido. “Reenviar evento” reutiliza o id original; não cria uma segunda instância.
- A entrega é feita na requisição, com timeout de 10s e reenvio manual. Não há worker/cron automático nesta etapa. Eventos persistidos não significam tentativa automática futura.
- Após HTTP 2xx, o botão de reenvio não dispara novamente esse evento. Se a execução falhar depois de aceitar o evento, o n8n precisa concluir sua retentativa interna ou informar error via callback; uma nova confirmação pode então ser solicitada.
- Recebimento de mensagens e envio pelo Inbox não foram implementados nesta etapa. Configuração dos eventos e webhook da Evolution permanece no n8n.

## Segurança e validação

Sessão e super_admin ativo exigidos para APIs e comandos. Organização/ator derivam da sessão. FK composta impede cliente de outra organização. RLS nos novos objetos. Command RPC transacional controla mutações e idempotência. Callback exige HMAC e usa Service Role somente no servidor para a função estreita de retorno. Nenhuma chave Evolution é solicitada ou armazenada no navegador.

Testes locais: PostgreSQL embarcado aplica a migration e verifica comando/idempotência, normalização, isolamento, políticas e callbacks; testes de callback usam assinatura real com banco simulado; navegador usa persistência simulada. Não comprovam policies do Supabase compartilhado nem conexão Evolution real.

Checklist autenticado pendente após aplicar migration:
- salvar URL e recarregar configurações;
- cadastrar e recarregar número;
- verificar evento recebido no n8n e nome/telefone reais;
- confirmar, retornar callback assinado e recarregar conectado;
- atualizar telefone e excluir via callback;
- testar usuário sem permissão e cliente de outra organização;
- verificar retry com mesmo id e ausência de instância duplicada.
