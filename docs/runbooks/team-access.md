# Equipe e login interno

Configurações → Equipe agora mantém funcionários em memória no DemoProvider, separados da sessão de atendimento e de usuários de portal. Cadastro com nome, e-mail normalizado/único, cargo, status, matriz de ações, exceções individuais e escopo de clientes. Seleção inicial sem clientes; opção explícita todos atuais/futuros. Troca de cargo com exceções pede confirmação; restaurar padrão remove exceções. Alterações sobrevivem à navegação interna e são perdidas ao recarregar.

`features/team/access.ts` centraliza catálogo, padrões, validação e avaliação. Atendente assume leads, mas distribuir é permissão distinta. Inbox próprio e supervisão da equipe são ações distintas. Próprios/equipe exigem relação explícita com o registro. Inativos, outra organização, cliente não permitido, chave desconhecida e ausência de cliente em ações de registro são negados. Cargos não ampliam o escopo de clientes. Gerenciar funcionários é reservado ao superadministrador, sem delegação por exceção individual.

Não há login real, convite, criação de credenciais, proteção de rota ou RLS nesta etapa. A sessão existente não é trocada e as permissões cadastradas não são aplicadas parcialmente aos menus ou repositórios existentes. O editor atual é uma configuração em memória para revisão. `canAccess` está preparado para reutilização por um backend confiável, não constitui segurança no browser.

`/login` oferece formulário de e-mail e senha, visibilidade da senha e validação. Nenhuma credencial é enviada ou persistida. Não há `/cadastro` nem link de cadastro público. O submit explica a integração pendente em vez de simular autenticação.

## Próxima conexão com Supabase

Desabilitar signup público no provedor, criar usuários por operação administrativa autenticada do superadministrador no servidor, sem expor service-role no browser. Vincular auth.user a membership/organização e funcionário, carregar permissões e clientes autorizados no servidor, verificar cada mutação e configurar RLS por organização, cliente e atribuição. Resolver relação próprio/equipe no backend; IDs vindos do navegador não são autoridade. Para consultas gerais, filtrar todos os resultados pelo escopo efetivo (não chamar uma avaliação global e retornar registros de todos os clientes). Definir equipes reais antes de habilitar supervisão. Não permitir que o cliente público escolha cargo, permissões ou tenant.

Persistir cargos/permissões/exceções/escopos em tabelas próprias, manter auditoria, revogar sessões de inativos e proteger o último superadministrador. Os membros em memória não são usuários Auth e deverão ser migrados via fluxo administrativo. Clientes de portal continuam separados e terão autenticação própria no futuro.

## Validação

41 testes unitários aprovados, incluindo padrões de cargo, escopo, inativos, exceções e reserva de gerenciamento da equipe ao superadministrador. E2E de Equipe, Login e Calendário de atendimento aprovados; cobertura de cadastro/edição, duplicidade, troca/restauração de cargos, status, navegação, mobile e axe. Lint e build aprovados. O teste de Equipe teve o seletor acessível corrigido e foi reexecutado com sucesso. Capturas da equipe revisadas em desktop e mobile. Validação com Chromium; autenticação real e RLS dependem da conexão futura.
