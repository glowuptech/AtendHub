# Runbook AtendHub

## Estado por módulo

| Módulo | Estado | Observação |
|---|---|---|
| Organizações, equipe, clientes e profissionais | Persistido e funcional | Lidos pelo Supabase com autorização por organização/cliente. |
| Leads e fila | Persistido e funcional (base) | Tabelas `atendhub_leads`, `atendhub_lead_events` e APIs de criação, consulta, edição, assunção atômica e movimentação. |
| Calendário de SLA | Sem dados fictícios, ainda não conectado | A estrutura `atendhub_service_calendars` existe; a tela ainda precisa ler/gravar o calendário persistido para substituir o calendário em memória. |
| Formulários e respostas | Sem dados fictícios, ainda não conectado | A origem do Lead aceita IDs reais, mas o fluxo público ainda não cria Leads. |
| Inbox e mensagens | Dependente de integração externa | Nenhuma mensagem é simulada; WhatsApp/SMS permanecem desligados. |
| Agendamentos | Sem dados fictícios, ainda não conectado | Não são criados automaticamente por Leads. |
| Indicadores, gráficos e investimentos | Sem dados fictícios, ainda não conectado | Não usar os valores demonstrativos restantes em telas não migradas. |
| Tarefas, automações, histórico e base de conhecimento | Sem dados fictícios, ainda não conectado | Persistência específica ainda não foi implementada. |

## Migration aplicada

- `atendhub_leads_queue_foundation`: calendário, Leads, histórico, índices, RLS e RPCs `atendhub_claim_lead`/`atendhub_move_lead`.
- `atendhub_leads_permissions`: autorização de criação/edição por função/permissão explícita.

Nenhum registro foi inserido ou removido.

## Regras importantes

- A fila consulta todos os Leads retornados pelo RLS para clientes autorizados; o CRM filtra pelo cliente selecionado.
- Assumir atendimento usa UPDATE condicional (`owner_id is null` e `stage = 'new'`) e registra evento no mesmo fluxo.
- A API usa a sessão autenticada e o cliente Supabase com RLS; não usa Service Role para comprovar autorização.
- Formulários públicos ainda não estão conectados à criação de Leads. O próximo passo é persistir sessões/submissões reais e criar o Lead com `origin_submission_id` e `field_values` validados, mantendo idempotência por origem.

## Verificações

- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado.
- `npm run build`: aprovado.
- Testes autenticados e concorrência real: não executados nesta sessão, pois não havia sessão de navegador disponível.
