# Auditoria de persistência do AtendHub

Data: 2026-11-09

## Critério

A execução normal é considerada real somente quando a leitura e a gravação passam por uma API/cliente Supabase autenticado, com `organization_id`, cliente e atribuição validados no servidor. Fixtures e `src/lib/mocks` são dados de teste/demonstração e não são evidência de CRUD persistido.

## Inventário por página e recurso

| Área | Leitura atual | Gravação atual | Fixture/memória em execução | Autorização/RLS | Estado |
|---|---|---|---|---|---|
| Dashboard geral `/app/sistema` | `system-dashboard/service` e repositórios mock para vários cards | investimentos ainda mock | Sim, indicadores e investimentos | Membership server; revisar por consulta | Parcial |
| Visão geral `/app` | Leads reais migrados nesta auditoria; filtro por cliente/período | Nenhuma | `DemoProvider` ainda fornece contexto | `/api/leads` + RLS | Parcial |
| Fila `/app/fila` | Repositório mock | tarefas/status mock | Sim | Membership, sem CRUD real completo | Pendente bloco D |
| Clientes e perfis | `/api/clients`, `/api/clients/[clientId]` para identidade; overview ainda mistura repositório | perfil/profissional usam APIs/RPC existentes | Leads, agenda e formulários do overview ainda mock | Membership, cliente/organização e RLS | Parcial bloco A |
| Inbox | Apresentação e mensagens em repositório mock | rascunhos em `useState`; envio externo não configurado | Sim | Sem persistência real de conversa | Pendente bloco D |
| Calendário | Configuração Supabase; calendário operacional mock | status/comparecimento mock | Sim | Configuração protegida; eventos não migrados | Pendente bloco C |
| Tráfego Pago | Página/configuração local | Nenhuma integração | Estado de apresentação | Sem integração externa configurada | Dependência externa documentada |
| Configurações | Calendário real; equipe via `/api/team`; webhooks em memória | calendário/equipe persistem; webhook ainda local | Sim em webhooks e algumas abas | Membership e cargo; revisar RLS | Parcial bloco A/E |
| Workspace/Equipe | `/api/team` e access helpers | `/api/team` | `teamMembers` inicial vazio no provider | cargo, organização e RLS | Parcial bloco A |
| CRM/Leads | `/api/leads` e rotas de ações | criação, edição, estágio, claim e notas com idempotência/RPC | componentes secundários ainda usam mock | permissões, organização, atribuição e RLS | Parcial bloco B |
| Agendamentos | serviço de schedule real apenas em partes; UI usa mock | disponibilidade/configuração parcial | appointments/schedule mock | Membership; eventos ainda sem contrato real | Pendente bloco C |
| Formulários/editor/prévia | APIs de forms, versões, paths e assets | rascunho/publicação e escolha de assets persistem | wizard/capture/analytics ainda usam `capture` mock | cliente/organização, RLS e validação server | Parcial bloco B |
| Rota pública `/f/[slug]` | definição do formulário real | respostas/capture ainda precisam de persistência completa | métricas/capture mock | precisa separar token público de sessão | Pendente bloco B |
| Base de conhecimento | componente e repositório local/mock | memória | Sim | Sem tabela/API AtendHub confirmada | Pendente bloco B |
| Automações | engine local | memória/reconcile por intervalo | Sim | Sem worker/outbox real | Pendente bloco E |
| Follow-up/confirmações | telas apoiadas em mock | memória | Sim | Sem execução externa | Pendente bloco E |
| Portal | layout autenticado e agenda parcial | regras de portal não concluídas | agenda/consultas ainda misturadas | membership/RLS parcial | Pendente bloco C/D |

## Persistência versus estado temporário

Persistem: clientes, profissionais, equipe, leads, eventos de lead, formulários/versões/paths/assets, configurações de calendário e ações com efeito de negócio.

Não precisam persistir: modal aberto, filtros, etapa visual do wizard, menu lateral, seleção de período enquanto não for uma preferência salva e mensagens de erro transitórias.

Dependem de worker/serviço externo: WhatsApp/SMS/e-mail, webhooks, automações fora da página, confirmações, cobrança, IA, tráfego pago e execução de outbox. Salvar a configuração não significa que o evento foi entregue.

## Banco e segurança

Migrations AtendHub aplicadas observadas no projeto: foundation, auth/RLS hardening, client/professional persistence, leads/queue, lead permissions/actions/idempotency/notes, forms/versions/responses, atomic lead RPC e `atendhub_form_paths_and_choice_assets`.

O banco compartilhado contém tabelas legadas sem RLS. Elas não foram alteradas nesta auditoria porque não são objetos próprios AtendHub e uma correção ampla poderia afetar outros sistemas. Os advisories também apontam funções públicas com `search_path` mutável e FKs sem índices; devem ser tratados em migrations separadas, com revisão dos proprietários dos objetos.

Objetos próprios AtendHub devem manter o prefixo `atendhub_`, RLS habilitado, validação de organização/cliente/atribuição no servidor e nunca usar Service Role como bypass de autorização.

## Evidências e testes

- Schema/migrations/advisors Supabase consultados em 2026-11-09.
- `pnpm run typecheck`: aprovado.
- `pnpm run lint`: aprovado com warning existente de `<img>` no editor.
- `pnpm run build`: aprovado.
- `pnpm test`: aprovado (51 testes unitários).
- Testes CRUD autenticados, nova sessão, isolamento entre organizações e concorrência ainda pendentes: o ambiente não possui uma sessão Supabase de teste confirmada.
- Playwright autenticado pendente quando Chromium/credenciais de teste estiverem disponíveis; redirecionamento anônimo não conta como CRUD validado.

## Continuidade explícita

O bloco A está parcialmente concluído; o Dashboard geral, overview de clientes e configurações restantes ainda precisam deixar os repositórios mockados. O bloco B está parcialmente concluído em leads e formulários, mas respostas/capture e conhecimento ainda não têm persistência completa. C, D, E e F não devem ser declarados concluídos: faltam contratos/tabelas ou worker externo. Próximo passo seguro: finalizar A por dependência, depois respostas/conhecimento de B, aplicando migrations incrementais e testes autenticados por bloco.
