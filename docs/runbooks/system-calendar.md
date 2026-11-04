# Calendário geral do Sistema

`/app/calendario` substitui o espaço reservado por uma visão semanal de domingo a sábado, em sete colunas com cartões e contagem por dia. Agrega somente clientes permitidos pelo escopo, independentemente do cliente selecionado no Workspace. Não cria dados para preencher o layout. Prescrita é identificada por bordô, Veredite por verde, e o dia atual por contorno/texto roxo e “Hoje”. A agenda do Workspace também recebe um contorno sobre a coluna inteira de hoje, sem alterar as cores dos horários disponíveis, bloqueados ou reservados.

Semana anterior/próxima/atual e data manual; filtros por cliente, operação, etapa e busca de contato/cliente/profissional. Cada cartão mostra horário, contato, cliente, profissional quando vinculado, operação e tag. O dia e a hora são calculados em America/Sao_Paulo. Em mobile a grade rola horizontalmente dentro do painel.

Ao abrir um cartão, o modal permite registrar confirmação/andamento (a confirmar, confirmado ou em reagendamento) e comparecimento (não informado, compareceu ou não compareceu). As alterações usam o repositório existente e persistem em memória enquanto a aplicação permanece aberta. O serviço valida escopo e valores. Não há sincronização externa ou persistência no banco.

Confirmação foi adicionada como campo opcional do agendamento, separado da etapa do lead: agendar/confirmar outro atendimento do mesmo lead não altera implicitamente os demais. Registros anteriores sem confirmação exibem “Confirmação não informada”; novos agendamentos manuais começam em “A confirmar”. Comparecimento conhecido tem precedência no resumo e no filtro por tag, sem apagar a confirmação armazenada. Não se infere confirmação ou presença pela etapa do lead. Agendamentos sem término mantêm a duração de referência já documentada na agenda do Workspace.

Marcar “Em reagendamento” identifica a pendência e conserva a reserva original; mover/cancelar a reserva e suas notificações dependem de um fluxo posterior. A alteração de tag não emite automaticamente novos eventos de webhook. O evento appointment.created continua sendo gerado apenas na criação manual aceita, na fila em memória.

O Calendário geral não substitui a disponibilidade por profissional nem o calendário de expediente/SLA nas configurações. As permissões/RLS continuarão a exigir aplicação no backend quando houver autenticação e persistência reais.

Validação: 48 testes unitários aprovados, lint, TypeScript e build aprovados. E2E do Calendário geral, navegação de Sistema e agenda do Workspace aprovados. Verificados agregação de clientes independente do Workspace, alteração/filtro de confirmação, semana vazia, destaque de hoje nas duas agendas, mobile sem overflow global e axe sem violações nos cenários exercitados. Capturas desktop, mobile e destaque do Workspace revisadas visualmente e salvas em `docs/runbooks/screenshots/system-calendar/`.
