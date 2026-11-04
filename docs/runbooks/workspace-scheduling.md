# Agenda semanal do Workspace

A rota existente `/app/agendamentos` usa grade semanal clara por profissional, com sete colunas (segunda a domingo), semana selecionável e navegação anterior/próxima/atual. Disponível em branco, indisponível em cinza e reservado em bordô, sempre acompanhado por texto. A grade rola dentro do painel em telas menores. O portal mantém os registros e ações de comparecimento anteriores.

Disponibilidade separada por organização, cliente, profissional e semana. Cada semana começa vazia, sem horários presumidos. A configuração permite adicionar intervalos por dia, vários intervalos para pausas, limpar um dia e marcar/desmarcar blocos individualmente. Precisão interna de um minuto, duração padrão configurável de 1 a 480 minutos e intervalo visual de 5 a 120 minutos. A duração também pode ser ajustada na criação. A última duração e intervalo visual salvos para o profissional são usados como padrão em semanas ainda não configuradas, sem copiar os horários. Semanas já salvas mantêm sua configuração. Configuração de horários vale só para a semana/profissional atual; não implica repetição automática nem cancela reservas existentes.

Criar agendamento exige um lead já cadastrado no cliente, profissional válido, data, horário e duração. O agendamento tem vínculo próprio com o profissional escolhido; não reatribui o lead nem altera sua etapa automaticamente. Todos os minutos precisam estar liberados, o término deve estar no mesmo dia e sobreposições por profissional são rejeitadas. Intervalos contíguos são permitidos. É possível registrar agendamentos passados manualmente.

`MemorySchedule` centraliza validação e gravação síncrona. Compartilha o array com o repositório de agendamentos existente; CRM, modal de lead, Inbox e dashboards veem os registros criados. O ID de solicitação é estável no formulário; repetir uma reserva com o mesmo ID e dados retorna o registro existente, sem duplicar o evento. Payload diferente com ID reutilizado é rejeitado.

Depois de gravar, gera um evento `appointment.created` em uma fila em memória, com ID próprio, organização, cliente, operação, lead, profissional, agendamento, início/término e fuso America/Sao_Paulo. O URL de agendamentos cadastrado em Webhooks ainda não recebe chamadas; falta worker/servidor durável, assinatura e autenticação. Não confundir fila local com notificação entregue.

Reservas antigas sem profissional explícito usam o vínculo do lead. Sem qualquer vínculo, aparecem em lista separada e não são atribuídas a um médico arbitrário. Registros antigos sem término adotam 30 minutos de referência, sinalizados nos detalhes; essa duração deve ser revisada na migração. Novos registros sempre guardam início e término. Selecionar outro cliente remonta o Workspace, sem carregar rascunhos do anterior.

## Persistência futura

Tudo ainda em memória; recarregar perde dados. O backend deve validar organização/cliente/profissional/lead e permissões, usar transação/constraint de exclusão de intervalos para impedir reservas concorrentes, gravar reserva e outbox atomicamente, deduplicar por ID e aplicar RLS. Endereços de webhook e credenciais ficam no servidor. Não há sincronização com agenda externa nem confirmação de comparecimento por mudança de estágio.

Fuso atual America/Sao_Paulo (-03). Conversão civil usa o regime atual; datas históricas com horário de verão exigem conversor IANA no backend antes de importar dados antigos. O calendário geral de Sistema continua uma página-base e não foi implementado nesta alteração.

Validação: lint, TypeScript e build aprovados; 46 testes unitários e 22 testes E2E da suite completa aprovados. Após refinamentos de apresentação e preferência de duração para semanas novas, o fluxo da agenda foi reexecutado e aprovado. Verificados duração de 37 minutos, intervalo visual de 20 minutos, conflito de reserva, semana sem horários presumidos, persistência na navegação interna, acessibilidade axe e ausência de overflow global no celular. Capturas finais revisadas em `docs/runbooks/screenshots/schedule/`.

## Busca de leads no agendamento

O cadastro agora usa LeadPicker, com busca por nome (ignorando acentos), telefone (incluindo dígitos sem formatação) e e-mail. Filtros: todos, sem agendamento registrado, cadastros nos últimos 7 dias e nos últimos 30 dias. Todos são ordenados pela criação mais recente. O histórico de agendamentos é consultado somente para o cliente atual; “sem agendamento” não significa apenas sem consulta futura. Recentes usa a data de cadastro em America/Sao_Paulo e exclui datas futuras.

São renderizados 25 resultados por vez, com ação de mostrar mais. Os dados ainda são carregados em memória; paginação e busca no servidor serão necessárias ao conectar a persistência. A escolha não muda automaticamente ao pesquisar/filtrar; se ficar fora do resultado, um resumo identifica a seleção mantida e permite limpá-la. O agendamento continua validando o lead e o cliente no serviço central.

Validação da busca: 51 testes unitários aprovados, incluindo pesquisa em 500 contatos e recorte por cliente; E2E do seletor e do agendamento aprovados. Verificados filtros, seleção mantida fora do resultado, busca sem acentos, telefone normalizado, e-mail, mobile sem overflow e auditoria axe. Lint, TypeScript e build aprovados. Captura mobile revisada em `docs/runbooks/screenshots/booking-lead-picker/mobile.png`.
