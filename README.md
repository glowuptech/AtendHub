# Prescrita — C0/C1

**Dados fictícios — MVP visual — integrações ainda não conectadas.**

Plataforma administrativa para aquisição, atendimento humano e agendamento de clínicas. Operadora GlowUp; repositório AtendHub. Interface e domínio de demonstração com duas clínicas, CRM, Inbox, fila, formulários nativos, campos reutilizáveis, analytics e portal. Não é prontuário nem agenda clínica.

## Executar

Node.js 22 ou superior (validado com Node 24.22.1), npm e lockfile versionado. Nenhuma variável ou credencial necessária.

```sh
cd /workspace/AtendHub
npm ci
npm run dev
```

Porta padrão 3000. Entrar na rota `/app`. Para validar produção:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run start
```

Build/dev usam webpack para compatibilidade com o ambiente gerenciado. Processos locais podem exigir execução fora do sandbox de comandos. Isso não muda código nem configura rede de produção.

```sh
# Navegador instalado pelo Playwright, em ambiente com os domínios permitidos:
npx playwright install chromium
npm run test:e2e
# Alternativa validada no ambiente cloud, que já possui Chromium:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Playwright inicia `npm run start` quando necessário; exige build anterior. Não é necessário baixar outro Chromium no cloud. `npm run format` formata código e documentação. Versões efetivas são fixadas pelo package-lock.json.

## Estrutura

```text
src/app/                 rotas e layouts App Router
src/components/          shell, estados e UI shadcn (Button/Radix/CVA)
src/features/            clients, leads, inbox, forms, custom-fields,
                         analytics e appointments
src/domain/              entidades, Zod, contratos e validação
src/lib/mocks/           fixtures e repositórios com guards de escopo
src/lib/tracking/        recorder em memória e marketing desativado
src/design-system/theme/ mapa tipado de temas
src/styles/tokens.css    identidade oficial
src/providers/           portas futuras, sem implementação de rede
src/server/              fronteira futura C2
supabase/migrations/     reservado, sem SQL
n8n/workflows/           reservado, sem workflows
 tests/unit/              regras de domínio e isolamento mock
 tests/e2e/               navegação, editor, wizard, portal e acessibilidade
 docs/adr/                auditoria, arquitetura e mapeamento de rotas
 docs/contracts/          plano de backend e integrações
 docs/runbooks/           demonstração e validação
 docs/blueprint/           PDF normativo v1.2
```

## Rotas

| Rota                                                   | Entrega                                            |
| ------------------------------------------------------ | -------------------------------------------------- |
| `/app`                                                 | Dashboard, filtros, indicadores e estados mock     |
| `/app/clientes` e `/app/clientes/[clientId]`           | Busca, filtros, perfil com sete seções             |
| `/app/leads` e `/app/leads/[leadId]`                   | CRM, campos, proveniência e edição em memória      |
| `/app/inbox` e `/app/fila`                             | Conversas fictícias e atribuição simulada          |
| `/app/clientes/[clientId]/formularios`                 | Lista, duplicação e arquivo mock                   |
| `.../formularios/novo` e `.../[formId]/editar`         | Editor, todos os tipos, reuso explícito, snapshots |
| `.../[formId]/preview`                                 | Prévia do rascunho em memória                      |
| `.../[formId]/analytics` e `.../[formId]/tracking`     | Métricas fictícias e Meta desativada               |
| `/f/ana-luiza-ginecologia-demo`                        | Prévia pública de cinco etapas                     |
| `/f/ana-luiza-obstetricia-demo`, `/f/horizonte-demo`   | Outras prévias administrativas                     |
| `/app/agendamentos`, `/portal`, `/portal/agendamentos` | Espelhos e comparecimento mock, portal reduzido    |
| `/login`                                               | Aviso de modo demonstração, sem autenticação       |
| `/app/configuracoes`                                   | Scaffold “Em desenvolvimento”                      |

Funcionalidade real nesta fase: renderização, navegação, filtros, validação, edição e simulação em memória. Nenhuma ação persiste no servidor. Recarregar o navegador restaura fixtures. Links entre telas preservam contexto durante navegação; URL de detalhe de outra clínica é recusada até seleção correta. Rotas públicas são prévias abertas, não publicação de captação.

## Arquitetura e fontes

Auditoria: repositório inicialmente vazio. App único modular Next.js/React/TS estrito/Tailwind/shadcn/Zod. Leia [ADR 0001](docs/adr/0001-foundation-and-routing.md), [contratos futuros](docs/contracts/future-boundaries.md) e [roteiro de demonstração](docs/runbooks/demo-walkthrough.md). O PDF v1.2 foi lido, com precedência do adendo e limite explícito de C0/C1.

Frontend recebe repositórios tipados via DemoProvider; mocks isolam organização/clínica e preservam snapshots. Guardas são apenas coerência demonstrativa: fixtures são públicas, não há autorização/RLS. Na fase C2, adapters/cache assíncronos carregarão DTOs de serviços autenticados, preservando componentes de apresentação. Datas em UTC, exibição America/Sao_Paulo.

## Integrações e limites

**Não conectados:** Supabase/PostgreSQL/Auth/RLS/Storage, Evolution/WhatsApp, n8n, Meta Pixel/CAPI e agenda externa. Sem credenciais, migrations, endpoints de produção, IA autônoma ou workflows. `example.com` é link seguro de demonstração. Nenhuma resposta em localStorage/sessionStorage. Eventos strict sem PII; prévia não emite form_submitted porque não há transação real. Engajamento interno visível/ativo em memória; abandono é fixture estimada após timeout.

Não há deploy/push automático. Continuar no mesmo repositório no GitHub/v0. A base independe do runtime Codex. Cada tarefa cloud já é isolada: usar este checkout, não criar worktree sem pedido explícito.

## Próxima revisão

C2 requer decisão humana: revisar domínio/UX e estratégia de carregamento assíncrono, configurar staging separado, implementar Auth, autorização e RLS com testes negativos. C3 implementará publicação/submissão transacional, idempotência e dedupe; C4 conectará operação. Retenção, política Meta, LGPD, consentimento e acesso à agenda precisam de validação antes de dados reais.

Evidências de execução e limitações: [relatório de validação](docs/runbooks/validation.md).
