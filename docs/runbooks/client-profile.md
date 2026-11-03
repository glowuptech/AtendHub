# Perfil da clínica: visão geral e informações

Revisão visual solicitada em 03/11/2026. Continua C1, dados fictícios e estado apenas em memória.

## Organização

Visão geral concentra os resultados e elimina a aba duplicada Resultados. Informações é o cadastro administrativo editável. Serviços/FAQ, Leads, Formulários e Agendamento externo continuam nas suas abas.

## Cadastro

Editar/salvar/cancelar identificação, categoria, status, CNPJ demonstrativo, especialidades, contato administrativo, endereço estruturado, datas do projeto/contrato, responsável e observações. Corpo clínico permite editar nomes/CRM/UF/especialidades e adicionar profissional. IDs/organização não são editáveis; profissionais com histórico não podem ser removidos pelo repositório. O logotipo cadastrado é exibido. Não armazenar senhas, pacientes ou informações de saúde.

Campos de parceria separados: início do projeto, assinatura efetiva, prazo para assinatura, próxima renovação. Renovação posterior à assinatura e ao início; campos ausentes ficam Não informado. Nenhuma assinatura, envio de contrato ou renovação é executada por esta tela. Mudança de nome/cadastro aparece nos demais consumidores do repositório da sessão.

## Datas e indicadores

Referência fixa e explícita de simulação: 03/11/2026; timezone America/Sao_Paulo. Contagens de parceria não acompanham o filtro de métricas. Assinatura ausente mostra pendente; prazo passado mostra atraso, prazo futuro dias restantes. Datas futuras não mostram duração negativa como se fosse tempo decorrido. Renovação vencida e próxima são avisos distintos; nunca renovação automática.

Dashboard filtra período inclusivo (presets 7/30/90 dias, personalizado até 366 dias) e profissional com vínculo explícito. Não inferir médico pela especialidade. Sem vínculo é um filtro separado; médicos de outra clínica são recusados.

- Leads: criados no período local.
- Conversão lead → agendamento: leads dessa coorte com pelo menos um espelho / leads da coorte, mesmo se a consulta cair fora do período.
- Agendamentos: espelhos cuja data/hora da consulta está no período.
- Primeira resposta: média corrida entre chegada e resposta humana registrada; cobertura explícita. Não é SLA em horário útil.
- Atendimento: duração registrada em minutos; não é tempo desde último contato. Cobertura explícita.
- Formulários: agregados diários fictícios de 01–03/11/2026 para v1 das três fixtures iniciais. Cada formulário soma 100 sessões e 38 envios. Novos formulários não recebem métricas fabricadas. Período/profissional aplicados ao agregado.
- Comparecimento: presentes / (presentes + ausentes informados); cobertura sobre espelhos do período. Pendente não conta como falta. Divisor zero = N/D.

Movimento diário tem legenda, rótulos, tabela alternativa e região rolável acessível por teclado. Pipeline e próximos passos mantêm links aos registros da clínica.

## Validação

18 testes unitários cobrem contratos existentes e novos: datas, timezone, vazio, médias, filtros de profissional, escopo, alteração do cadastro, IDs imutáveis e renovação inválida. Seis cenários E2E existentes passaram. O novo teste de perfil verifica filtros, cadastro, cancelamento, alertas e mobile; a primeira execução apontou gráfico rolável sem foco, corrigido com acesso por teclado. Consulte as capturas client-overview, client-information e client-overview-mobile na pasta screenshots.

Sem persistência, banco, assinatura eletrônica ou alertas enviados. Atualizações em memória desaparecem ao recarregar. Revisão local, sem envio automático ao GitHub/v0.

Validação final: novo cenário E2E do perfil aprovado após ajuste de foco por teclado no gráfico; os seis cenários anteriores também passaram. Build de produção aprovado. Capturas finais em `screenshots/client-overview.png`, `screenshots/client-information.png` e `screenshots/client-overview-mobile.png`.
