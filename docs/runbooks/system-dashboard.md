# Dashboard geral do Atend Hub

Sistema → Dashboard geral (`/app/sistema`) agrega a carteira autorizada da organização. O seletor de cliente do topo não limita a visão de Sistema. Filtros próprios por período (até 366 dias), frente e cliente; presets de 7/30/90 dias e exportação CSV agregada. Prescrita/healthcare usa bordô; Veredite/legal usa verde esmeralda. Não ativa funcionalidades jurídicas, nem cria clientes fictícios jurídicos para preencher o painel.

## Métricas

Clientes: contas atualmente cadastradas na carteira filtrada, incluindo clínicas e contas médicas na saúde; escritórios/contas de advocacia no jurídico. Não conta médicos individuais dentro das clínicas como clientes adicionais. Ativos/pausados e formulários refletem a base atual, sem histórico temporal de cadastro disponível.

Leads: data de createdAt em America/Sao_Paulo. Cadastros parciais entram identificados; concluídos legados sem captureStatus são tratados como concluídos. Conversão: leads únicos dessa coorte com pelo menos um espelho de agendamento, mesmo se a consulta ocorrer depois do período. Não usa estágio confirmado do Kanban como substituto do registro de agenda.

Agendamentos, presenças, faltas e pendências: pela data da consulta no período, independente da data de entrada do lead. Média de primeira resposta: tempo corrido de leads com firstResponseAt válido; amostra explícita. Atrasos de claim: somente fatos registrados ao assumir, dentro da coorte; não confundir com todos os leads atrasados ainda abertos.

Investimento: um lançamento manual consolidado por cliente/dia, inteiro em centavos BRL, fonte/observação opcional. Save faz upsert, editar substitui e remover devolve o dia ao estado não informado. Zero é um gasto explicitamente conferido como zero. Sem lançamentos, não há gasto presumido.

CPL geral = soma do investimento / total de leads da coorte; custo por lead convertido = soma / leads da coorte com agendamento. Calculados somente com cobertura completa de todos os dias/clientes do filtro e denominador positivo. Usa razão de totais, nunca média simples dos CPLs. Não representa CPL de mídia atribuída: ainda não há classificação/atribuição paga confiável para isolar apenas leads de anúncios. ROI, receita, CAC de cliente pagante e retorno financeiro não são inferidos.

Comparativo anterior: mesmo número de dias imediatamente anteriores, mesma carteira atual e mesmos filtros. Conversões refletem os registros atualmente conhecidos, sem snapshots históricos de quando a conversão aconteceu. Gráficos diários usam escalas independentes de BRL e leads, cores por frente e tabela alternativa; gasto parcial indica cobertura, lacunas não viram zero. A cobertura exige inclusive dias de contas pausadas, que podem ser lançados com zero se conferidos.

## Persistência e acesso

`InvestmentRepository` tem adaptador em memória com checagem do escopo por cliente. Reload limpa os lançamentos. Futuro banco: tabela organization_id/client_id/day/currency/amount_cents/source com constraint única por cliente/dia, autorização no servidor e auditoria. Importadores de anúncios devem consolidar/upsert o mesmo grão com regra de fonte explícita para não duplicar valores manuais. Dados de campanhas e atribuição entram em contratos separados.

O CSV inclui apenas agregados do recorte, em UTF-8 com BOM e separador ponto e vírgula; custos desconhecidos ficam vazios, campos de texto neutralizam fórmulas de planilha. Nenhum dado pessoal de lead é exportado.

## Verificação

31 testes unitários aprovados, incluindo cálculo ponderado, divisão por frente, cobertura, zero versus ausência, upsert/remoção e escopo. Cenário E2E aprovado para filtros, lançamentos, valores recalculados, validação de datas, estado jurídico vazio e download CSV. Axe WCAG 2A/AA/2.1AA sem violações desktop; viewport mobile sem overflow horizontal. Build, lint e TypeScript aprovados. Capturas em `screenshots/system-dashboard.png` e `screenshots/system-dashboard-mobile.png`.

## Integração persistida — novembro de 2026

A página de produção usa `useSystemDashboard` e `/api/dashboard/system`. A causa das contagens divergentes era a dependência direta de `useDemo().repositories`, com clientes/leads/agendamentos demonstrativos. Essa dependência foi removida da página; o serviço legado em memória permanece somente para consumidores demonstrativos/testes existentes.

A API usa `sessionOrganizationContext` e o cliente autenticado, sem Service Role, filtra por organização e deixa o RLS determinar os registros visíveis. Filtros são validados no servidor; cliente não autorizado é recusado. Clientes e operações vêm das tabelas reais. As consultas de leads, agenda, formulários e investimento percorrem todas as páginas, ordenadas por ID, sem truncar silenciosamente nos primeiros 1000 registros. Somente contagens/agregados, nomes de empresas e lançamentos autorizados são enviados à página/CSV, sem detalhes de lead, contato, documentos ou mensagens.

Conversão conta uma vez cada lead da coorte com reserva ativa, incluindo reservas fora do período. Reservas canceladas não contam como conversão nem presença e são mostradas separadamente. Agendamentos no período usam a data de consulta, inclusive de leads recebidos antes dele. Não se usa estágio do Kanban como substituto de agendamento. “Sem responsável no período” usa a coorte recebida, não o backlog de toda a fila. Primeira resposta usa `first_response_at`, com amostra explícita; ausência não é zero. O indicador histórico de SLA fica indisponível quando há atribuições sem snapshot integrado, em vez de inferir atraso com o calendário atual.

O período atual e o anterior têm o mesmo tamanho, com recorte de datas em America/Sao_Paulo. A consulta usa limites UTC-03 para a operação atual do sistema; não representa suporte a horários históricos de verão anteriores a 2019. A série diária pré-calcula as datas locais para não refazer formatação de fuso para cada lead em cada dia do gráfico. Atualização automática a cada 30 segundos e ao retomar o foco; loading e falhas são explícitos, sem substituir erro de consulta por zeros.

Investimentos: migration `20261119000000_atendhub_dashboard_investments.sql` aplicada em 20/11/2026 pelo fluxo de migration do Supabase conectado (ref `oskdgymvrptxjrafigna`). O `NEXT_PUBLIC_SUPABASE_URL` da configuração Preview da branch `v0/activate-dashboard-investments` resolve para o mesmo projeto. Tabela `atendhub_daily_investments`, valores em centavos BRL, unicidade organização/cliente/dia, autoria e timestamps. Superadministradores editam pelas RPCs `atendhub_save_daily_investment` e `atendhub_remove_daily_investment`; demais membros ativos com acesso ao cliente podem consultar. Salvar substitui o mesmo dia, zero é explícito e remover restaura ausência. Não representa recebimento, cobrança, receita, comissão ou integração de anúncios.

Auditoria pós-migration: RLS está ativa; a política permite somente SELECT a `authenticated` com `atendhub_is_active_member` e `atendhub_has_client_access`. `anon` não tem leitura; `authenticated` não tem INSERT/UPDATE/DELETE direto. As RPCs são `SECURITY DEFINER`, `search_path = ''`, executáveis por `authenticated` e não por `anon` ou `service_role`; verificam superadministrador ativo, organização e acesso ao cliente. A migration também cria chave estrangeira composta e unicidade organização/cliente/dia.

A chamada de inspeção deste turno registrou acidentalmente uma migration sem DDL chamada `dummy` no histórico do Supabase (`20261120030555`); ela não criou objetos nem alterou dados. O histórico não foi editado manualmente. A migration correta consta em seguida (`20261120030857`, `atendhub_dashboard_investments`).

Verificações desta ativação: `npm run typecheck` passou; `npm run lint` passou com dois avisos existentes de `<img>`; `npm test` passou (158 testes); `npm run build` passou após a confirmação da mensagem de segurança do Next.js. A migration também passou pelo teste PGlite de RLS/RPC incluído na suíte. As rotas locais de leitura e gravação responderam 401 sem sessão. O Preview novo ficou READY no commit `9ea0f81`, mas a proteção de deployment redirecionou o navegador a Vercel SSO; sem sessão autenticada não foi possível conferir agregados reais, testar perfis somente leitura/outro cliente nem executar salvar/editar/recarregar/remover contra um cliente real. O Playwright do harness não iniciou porque o ambiente não tem `libnspr4.so`; portanto, a validação interativa real permanece pendente. Não foram inseridos dados de teste em clientes reais.
