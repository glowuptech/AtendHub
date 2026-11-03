# Fila geral

Sistema → Fila de atendimento aparece antes de Workspace. Kanban agrega leads dos clientes autorizados no escopo da organização, independente do seletor de contexto. Colunas mantêm os estágios atuais: sem atendimento, em atendimento, aguardando resposta, agendado e perdido. A busca e o filtro de cliente operam nessa carteira. Abrir um cartão seleciona o contexto correspondente antes de navegar ao lead.

Prazo de retirada: 10 minutos úteis, conforme instrução atual do usuário, substituindo a hipótese de 15 min do blueprint (§26). Calendário inicial 09–17h segunda a sexta (horário escolhido para demonstração da jornada de oito horas do §33); configurável por equipe, com feriados/exceções cadastráveis manualmente. Não há calendário nacional presumido. America/Sao_Paulo, UTC-03 na operação moderna; não cobre horários históricos de verão antes de 2019 nem outros fusos. Não há pausas intrajornada nesta versão.

Claim grava claimedAt e claimAudit com prazo, tempo útil consumido, atraso e cópia do calendário. Registros históricos não mudam ao editar a política; leads abertos recalculam pelo calendário atual. Só um lead novo e sem responsável pode ser assumido. Movimentos subsequentes exigem responsável e deixam histórico. Nenhuma comissão ou penalidade financeira é calculada; os fatos ficam disponíveis para a regra futura, sem atribuir culpa por lead sem responsável.

A carteira inclui cadastros parciais identificáveis já criados pelo formulário. O relógio parte de createdAt. Novas fontes que criem leads no repositório entram no mesmo quadro. Na memória, todos os operadores são representados por Operadora; login real, equipe habilitada, identificação do ator, autorização no servidor, claim transacional, auditoria persistida e execução de penalidades dependem do próximo estágio. Não agrega outras organizações nem expande permissões de usuários.

A vertical jurídica permanece futura; os cartões atuais identificam as categorias de saúde existentes no cadastro.

Validação: 27 testes unitários aprovados; cenários E2E do Kanban e da integração fila/Inbox/portal aprovados. Axe WCAG 2A/AA/2.1AA sem violações no Kanban. Build, lint e TypeScript aprovados. Captura em `screenshots/queue-kanban.png`.

## Consulta rápida do lead e cores

Abrir lead agora abre dialog nativo sobre a fila, com Escape, foco contido e retorno ao botão de origem. Abas: resumo, respostas com rótulos da versão capturada, últimas 20 mensagens ordenadas por data, tarefas criadas/concluídas na memória do lead, agendamentos registrados e histórico. Ausência de registro não é interpretada como fato clínico ou comparecimento.

Conversar usa leadId e clientId para localizar/criar uma conversa única no Inbox; seleciona o cliente e o contato solicitado. Conversa nova começa sem mensagens e continua com conexão desconectada. O Inbox também permite consultar o modal sem sair da conversa.

Estágios adicionais: aguardando agendamento, agendamento confirmado, reagendamento e recuperação. Estágios mantêm histórico e não criam/confirmam agendamentos nem comparecimento automaticamente. Colunas usam cores por estágio: âmbar (novos/aguardando agendamento), azul (atendimento), lilás (aguardando resposta), verdes (agendado/confirmado), laranja (reagendamento), vermelhos (recuperação/perdido). Nomes textuais continuam identificando cada estágio.

Validação desta revisão: 28 testes unitários aprovados, fluxo E2E do modal (respostas, tarefas, Escape/foco, Inbox correto) e fluxo anterior fila/Inbox/portal aprovados. Contraste WCAG aprovado após ajustar os títulos das colunas; build, lint e TypeScript aprovados. Capturas atualizadas em `screenshots/queue-kanban.png` e `screenshots/lead-modal.png`.
