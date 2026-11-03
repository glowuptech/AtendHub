# Revisão da lista de clínicas — 03/11/2026

Escopo: /app/clientes. Perfil detalhado permanece para revisão posterior.

- Criar clínica abre diálogo nativo acessível por teclado/Escape. Cadastro mock com categoria (clínica/médico/médica), status, CNPJ opcional, descrição, especialidades e vários profissionais com CRM/UF.
- Logotipos DEMO locais; cadastro aceita PNG/JPG/WebP até 1 MB, valida decodificação e mantém somente data URL em memória. Não há upload a servidor.
- Cards mostram nome, categoria, status, logotipo, CNPJ, especialidades e médicos. Atalhos copiam nome da clínica, CNPJ formatado, todos os nomes dos médicos, cada nome individual e CRM/UF. Clipboard informa sucesso somente após resolução; em falha orienta seleção manual. Campos ausentes desabilitam cópia.
- Busca sem distinção de acentos em nome, CNPJ, médico, CRM e especialidade. Filtros por status/categoria/especialidade, contagem de resultados e limpeza.
- Novos cadastros entram no escopo administrativo da sessão DEMO e aparecem no seletor, com listas de leads/formulários vazias. Fixtures e outras sessões não são alteradas. Autorização real e cadastro persistente são futuros; não confundir mutação do escopo mock com concessão de acesso de produção.
- Zod valida formato de CNPJ (14 dígitos) e CRM/UF; não consulta Receita/CFM nem valida registros reais. Números das fixtures são marcadores fictícios.

Validação: lint/typecheck/build passaram; 13 testes unitários passaram. Cinco E2E anteriores passaram; o novo cenário de clínicas passou após correção do seletor do filtro. Ele cobre clipboard real, busca/filtro, campo obrigatório, cadastro, logotipo, médico/CRM, perfil, mobile e Escape. Axe sem violações WCAG 2 A/AA e 2.1 AA na listagem. Sem overflow horizontal a 390px.

Alterações salvas localmente; envio GitHub depende de instrução do usuário.
