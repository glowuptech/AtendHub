# Runbook AtendHub

## Estado por módulo

| Módulo | Estado | Observação |
|---|---|---|
| Organizações, equipe, clientes e profissionais | Persistido e funcional | Lidos pelo Supabase com autorização por organização/cliente. |
| Leads e fila | Persistido e funcional (base) | Tabelas `atendhub_leads`, `atendhub_lead_events` e APIs de criação, consulta, edição, assunção atômica e movimentação. Assunção, distribuição e movimentação usam permissões distintas no servidor. |
| Calendário de SLA | Persistido e funcional | `atendhub_service_calendars` é lido/salvo pela configuração; o cálculo usa `created_at` do servidor, fuso, dias, feriados e exceções. Sem calendário salvo, assumir fica indisponível. |
| Formulários e respostas | Editor/listagem persistidos; público pendente | CRUD de formulários e versões usa Supabase/RLS; cadastro manual usa versão, respostas históricas e estado incompleto. A rota pública ainda não está conectada. |
| Inbox e mensagens | Dependente de integração externa | Nenhuma mensagem é simulada; WhatsApp/SMS permanecem desligados. |
| Agendamentos | Sem dados fictícios, ainda não conectado | Não são criados automaticamente por Leads. |
| Indicadores, gráficos e investimentos | Sem dados fictícios, ainda não conectado | Não usar os valores demonstrativos restantes em telas não migradas. |
| Tarefas, automações, histórico e base de conhecimento | Sem dados fictícios, ainda não conectado | Persistência específica ainda não foi implementada. |

## Migration aplicada

- `atendhub_leads_queue_foundation`: calendário, Leads, histórico, índices, RLS e RPCs `atendhub_claim_lead`/`atendhub_move_lead`.
- `atendhub_leads_permissions`: autorização de criação/edição por função/permissão explícita.
- `atendhub_lead_manual_idempotency`: chave única opcional por organização para retentativas seguras no cadastro manual.
- `atendhub_lead_manual_notes`: observações persistidas no próprio registro de Lead.
- `atendhub_forms_versions_and_lead_responses_v2`: formulários, versões imutáveis/snapshot, respostas com pergunta/opções históricas, timestamps do Lead e RLS.
- `atendhub_manual_lead_atomic_rpc`: operação transacional `atendhub_create_manual_lead` para Lead manual, respostas e evento inicial com idempotência.

Nenhum registro foi inserido ou removido.

## Regras importantes

- A fila consulta todos os Leads retornados pelo RLS para clientes autorizados; o CRM filtra pelo cliente selecionado.
- Assumir atendimento usa UPDATE condicional (`owner_id is null` e `stage = 'new'`) e registra evento no mesmo fluxo.
- As APIs de Leads, fila e calendário usam a sessão autenticada e o cliente Supabase com RLS; não usam Service Role para comprovar autorização. O cadastro manual valida o cliente e o profissional pelas FKs/RLS, grava fonte `manual`, status `completed`, etapa `new` (Sem atendimento) e evento de criação com o ator autenticado. Retentativas usam `Idempotency-Key` e não duplicam Lead/evento. O helper compartilhado ainda mantém uma instância administrativa para rotas legadas de equipe/clientes, fora da validação dos Leads.
- A falha `PGRST201` no CRM vinha de relações ambíguas entre Leads e clientes/profissionais (FK simples e composta). A API agora nomeia explicitamente `atendhub_leads_client_id_fkey` e `atendhub_leads_professional_id_fkey`; erro e retentativa permanecem estados distintos na tela, com diagnóstico seguro por `supportId`.
- A contagem de SLA é derivada de `created_at`/timestamps do servidor após cada recarga, não de um cronômetro iniciado no navegador. Tempo até assumir e primeiro contato são campos distintos (`claimed_at` e `first_response_at`).
- O editor completo (identidade, descrição, slug, status, contatos, perguntas, opções, aparência, imagens e Pixel/eventos) agora salva rascunhos e versões no Supabase; versões publicadas não são sobrescritas ao editar.
- O cadastro manual permite “Sem formulário — cadastro livre”, ou seleciona uma versão do cliente, valida tipo/opções/obrigatoriedade no servidor, evita duplicar contato, registra respostas com snapshot da pergunta/opções e permite salvar explicitamente como incompleto. `created_at` é sempre do servidor; `original_captured_at` é validado contra o futuro e `queue_entered_at` permanece separado para SLA.
- Formulários públicos ainda não estão conectados à criação de Leads; a prévia persistida informa essa limitação e não simula sucesso ou dispara eventos externos.

## Verificações

- `npm run typecheck`: aprovado após a implementação do SLA persistido.
- `npm run lint`: aprovado.
- `npm run build`: aprovado; rotas `/api/forms`, `/api/forms/[formId]`, `/api/leads`, `/api/leads/[leadId]`, `/claim` e `/stage` compiladas.
- `npm run typecheck`: aprovado após a integração persistida de Formulários, versões e respostas.
- `npm run lint`: aprovado.
- Navegador desktop 1103x671: `/app/fila` e `/app/clientes/:clientId/formularios` redirecionaram corretamente para login sem sessão; o fluxo autenticado não foi simulado.
- `GET /api/leads` sem sessão: protegido por 401; fluxos autenticados de cadastro, persistência após reload, CRM/fila, isolamento, permissão e retentativa idempotente continuam pendentes de sessão/test users nesta sessão.
  - Proteção sem sessão: `GET /api/leads` retornou `401 {"error":"Não autorizado."}`.
  - Correção de sincronização do Workspace: `DemoProvider` inicia sem fixture, valida o UUID contra `/api/clients` autorizados e seleciona o primeiro cliente somente após o carregamento. O seletor, Leads, filtros e cadastro manual compartilham esse UUID; o GET de clientes usa sessão/RLS e acesso por cliente, sem Service Role. Sem sessão, `/app/leads` redirecionou corretamente para login.
- Testes autenticados de CRUD, isolamento entre duas organizações, usuário inativo/sem vínculo e concorrência de duas sessões: preparados pelas APIs/RPCs, mas não aprovados nesta sessão porque não havia sessão autenticada/test users disponíveis.
- Nenhum registro de produção foi criado, alterado ou removido durante os testes.

## Pendências explícitas

- Executar com duas contas autenticadas o teste de concorrência: uma chamada a `/claim` deve retornar 200, a outra 409 `LEAD_ALREADY_CLAIMED`; depois confirmar um único evento `assigned`.
- Confirmar no banco que `first_response_at` é preenchido somente pelo primeiro contato efetivo quando o provedor de mensagens for conectado.
- Remover fixtures dos módulos ainda não persistidos (Inbox, formulários, agendamentos, analytics e sistema) em uma etapa separada; eles devem continuar exibindo indisponibilidade/estado vazio, nunca sucesso simulado.
