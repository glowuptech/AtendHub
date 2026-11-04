# Atend&Hub — interface Soft Minimal Bento

## Direção

Superfícies brancas sobre fundo #F5F6F8, tipografia Geist variável local e roxo concentrado nas ações e na navegação. Prescrita usa bordô e Veredite verde apenas em identificações e séries de dados. Estados operacionais mantêm sua própria semântica.

O arquivo da nova logomarca não acompanhou o briefing. A interface usa um wordmark Atend&Hub com símbolo geométrico Lucide, substituível pelo ativo oficial quando fornecido.

## Fontes e tokens

- `src/styles/tokens.css`: paleta semântica, bordas, superfícies e elevação.
- `src/app/globals.css`: primitives compartilhados, composições por recurso e breakpoints. As regras de responsividade estão agrupadas ao final.
- `src/components/ui/button.tsx`: primary, outline, ghost e destructive.
- `src/components/layout/shared.tsx`: cards, badges, títulos, estados vazios e skeletons.
- `public/fonts/geist-latin.woff2`: Geist variável já distribuída com Next, copiada para hospedagem local. Licença OFL acompanha o arquivo. Não depende de Google Fonts ou de downloads durante build.

O roxo #7868E6 é o acento; controles com texto branco e links usam #6756D8 para contraste. Texto auxiliar usa #626778. Verde #5FAE88 fica nos gráficos; texto verde usa #397B5C. Não substituir cores de status por cores das operações.

## Composição e interação

- Sidebar compacta com recolhimento desktop, nomes acessíveis, identificação da rota mais específica e menu mobile com Escape, foco contido, fundo inerte e retorno ao acionador.
- Header contextual e perfil da sessão. Destinos, escopos e indisponibilidade da operação jurídica permanecem os existentes.
- Visão geral: funil maior, prioridade operacional e mensagens em módulos menores; tabela de oportunidades preservada.
- Dashboard geral: KPIs e comparação das frentes em composição Bento; ausência de investimento segue explícita e não vira zero.
- Perfil: indicadores ao lado do resumo contratual; gráficos, tabelas e ações preservados.
- Kanban: colunas neutras, marcadores de estágio e ações agrupadas por lead. Nenhuma alteração em estados, SLA ou prioridade.
- Editor: navegação por seções, ações de salvar acessíveis durante a edição e prévia mobile/ampliada. A mesma implementação renderiza prévia e formulário público; medidas tipográficas usam largura do contêiner. Cores e fontes personalizadas dos formulários continuam independentes do app.
- Login, portal, CRM, Inbox, agendas, formulários e configurações usam as mesmas primitives.
- Animações curtas e skeletons respeitam `prefers-reduced-motion`.

## Limites preservados

Dados continuam em memória. Não foram criados banco de dados, autenticação, RLS, integrações de pagamento nem envios externos. A alteração é de apresentação e navegação.

## Verificação

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e Playwright com Chromium do ambiente. `tests/e2e/redesign.spec.ts` valida menu recolhido/mobile, teclado, auditoria axe e largura nas principais rotas a 1440, 768 e 390 px. Capturas são geradas em `test-results/redesign-*.png`; seleções ficam em `docs/runbooks/screenshots/redesign/`.

Resultado em 04/11/2026: lint sem avisos, TypeScript e build aprovados, 33 testes unitários e 15 testes E2E aprovados. Auditoria axe nas 12 telas principais e navegação recolhida sem violações WCAG A/AA detectadas; overflow verificado a 1440, 768 e 390 px. Revisão visual das capturas de dashboard, perfil, fila e editor realizada. A validação automatizada usou Chromium; outros navegadores e aparelhos físicos não foram exercitados.
