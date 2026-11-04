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
