# Validação C0/C1 — 03/11/2026

Ambiente: Node 24.22.1, npm 11.9.0, Next 16.4.4, React 19.3.1, TypeScript 6.0.3; versões completas no lockfile. Navegador: Chromium existente em /usr/bin/chromium, controlado pelo Playwright.

| Verificação                                                              | Resultado                                                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `npm run lint`                                                           | Passou, sem erros ou avisos                                                   |
| `npm run typecheck`                                                      | Passou, strict habilitado                                                     |
| `npm test`                                                               | 12 testes passaram, nenhum ignorado                                           |
| `npm run build`                                                          | Passou, webpack, 13 páginas estáticas geradas e rotas dinâmicas listadas      |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` | 5 testes passaram, nenhum ignorado                                            |
| Axe WCAG 2 A/AA + 2.1 AA                                                 | Zero violações nas páginas verificadas: dashboard desktop e formulário mobile |
| Console de runtime                                                       | Nenhum pageerror nos cinco cenários de navegador                              |
| Rede/armazenamento do wizard                                             | Nenhuma requisição externa, localStorage e sessionStorage vazios              |
| Responsividade                                                           | Sem overflow horizontal no dashboard e formulário a 390px                     |
| Inspeção visual                                                          | Dashboard desktop e sucesso do formulário mobile conferidos                   |

Os testes de domínio verificam escopo por clínica, relacionamento cruzado recusado, cópias defensivas, claim mock repetido, reuso explícito, campos reservados, snapshots imutáveis, duplicação com novos IDs, validação dos valores, proveniência, allowlist analítica sem PII, recorder local e funil 100/55/38.

Os cinco cenários E2E percorrem dashboard → seleção de clínica → CRM; wizard de cinco etapas com erro e conclusão; edição de versão e criação/reuso de campo; fila/Inbox/portal/Meta; estados de erro/vazio e acessibilidade.

## Falhas diagnosticadas e resolvidas

- Turbopack não pôde abrir subprocesso/porta local neste ambiente. Dev/build usam a opção suportada `--webpack`; build completo executado com a permissão de processo local necessária.
- Build detectou prop de feature exportada diretamente como página; corrigido com adapter de rota sem props extras.
- Primeira execução E2E: três testes passaram e dois falharam por seletor de alerta ambíguo com o route announcer do Next. Seletores corrigidos; execução final 5/5 passou sem remover assertions.
- Download adicional do Chromium pelo Playwright recebeu 403 de política de domínio. Usado Chromium já instalado; não houve contorno da rede, alteração da allowlist ou desativação de verificação.

## Limites da evidência

C1 visual, não produção. Testes de isolamento exercitam apenas mocks, não Auth/RLS. Não há teste de concorrência real, webhook, WhatsApp, banco, Pixel, n8n ou agenda externa porque não estão implementados. Axe automático não substitui auditoria completa de acessibilidade ou teste humano com leitor de tela. Screenshots em `screenshots/` são dados fictícios.

O ambiente salvo ainda depende de revisão/publicação pelo produto. Não foi validada restauração em uma nova tarefa. Nenhum deploy ou push remoto foi executado.
