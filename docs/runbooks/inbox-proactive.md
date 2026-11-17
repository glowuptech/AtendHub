# Atendimentos atribuídos antes da primeira mensagem

Base: branch v0/atualizacao-do-app-42a5b6c7, commit 7a2ca57.

O Inbox listava somente linhas de atendhub_inbox_conversations. Leads atribuídos manualmente ou pela Fila ficavam ausentes até uma mensagem recebida criar a conversa.

## Comportamento

- GET /api/inbox/assigned-leads lista leads visíveis por sessão/RLS, com owner_id igual ao usuário autenticado, que ainda não têm conversa visível. Traz rótulos não sensíveis das conexões do mesmo cliente; não traz credenciais.
- A lateral inclui os atendimentos sem mensagens no filtro Todas. Os filtros de cliente/operação/conexão/estágio e busca também contemplam esses atendimentos.
- Ao abrir o atendimento, a conta comercial pode ser escolhida. Uma única linha conectada é pré-selecionada; múltiplas linhas conectadas exigem seleção. Sem linha ou telefone, o lead continua visível com orientação.
- Abrir conversa é uma ação explícita. Não cria mensagens, não chama n8n/Evolution e não altera responsável, etapa ou SLA.
- Conexão não conectada permite histórico vazio; o envio continua bloqueado pelo fluxo existente até conectar.
- Fila → Conversar abre /app/inbox?leadId=UUID. Atendimentos fora do acesso não selecionam silenciosamente outra pessoa.
- Responsável da Fila e contexto do Inbox usam display_name da equipe quando permitido por RLS, com fallback sem UUID.

## Migration necessária no servidor real

Aplicar SOMENTE `supabase/migrations/20261118010000_atendhub_start_inbox_conversation.sql` após confirmar que a migration original do Inbox está aplicada. Não reaplicar as migrations antigas nem recriar tabelas. O registro anterior do Inbox no Supabase pode ter uma versão diferente do nome do arquivo no checkout; conferir o histórico antes de usar um push global do CLI.

A nova RPC `atendhub_inbox_start_conversation(uuid,uuid)`:
- exige sessão, membro ativo, cliente autorizado e responsabilidade atual pelo lead;
- valida conexão do mesmo cliente/organização;
- normaliza o telefone e reutiliza o lock da ingestão para conciliar abertura e chegada de mensagens;
- é idempotente por conexão/JID;
- bloqueia associação automática se a conversa já pertencer a outro lead;
- usa SECURITY DEFINER com search_path vazio e execução restrita a authenticated.

## Validação

Testes PostgreSQL embarcado executam a migration e verificam criação sem mensagem/envio, idempotência, proibição para outro responsável/conexão de outro cliente e conflito de lead.

Navegador: lead atribuído visível sem mensagens, seleção obrigatória entre duas linhas, abertura do chat vazio com envio habilitado, recarregamento; responsável na Fila exibido por nome. Persistência do navegador usa API simulada.

Supabase real: migration não aplicada nesta sessão. Pendentes teste autenticado de listagem de Adriele, abertura/reload, permissões reais e primeiro envio via n8n.
