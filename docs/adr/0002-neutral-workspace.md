# ADR 0002 — Workspace neutro e cores de dados

Decisão solicitada pelo usuário após revisão visual de C1. Substitui a restrição anterior de paleta no painel: fundo branco, bordas cinza neutro, texto grafite e bordô mais vivo (#882e43) em marca e ações. Áreas secundárias têm fundo cinza claro. O card lateral deixa de ser um bloco bordô de grande área.

Gráficos adotam azul, verde, âmbar, violeta e coral moderadamente saturados, independentes da identidade da vertical. Os tokens estão centralizados em tokens.css e workspaceTheme. Séries são identificadas explicitamente, sem depender da posição acidental no DOM. Rótulos e valores permanecem necessários: cor não é a única fonte de informação.

Prescrita continua a vertical ativa. O workspace compartilhado é neutro para receber Veredite; a marca jurídica continua pendente, sem paleta inventada. Esta alteração é visual, sem mudança de domínio, dados, contratos ou integrações.

Validação: lint, typecheck e build passaram; cinco testes E2E passaram. Axe não encontrou violações WCAG nas duas telas verificadas (dashboard desktop e formulário mobile). Captura do novo dashboard em `docs/runbooks/screenshots/dashboard-neutral.png`.
