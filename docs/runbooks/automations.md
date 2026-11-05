# Automações, follow-up e confirmações

## Organização e uso

- Sistema → Automações: cinco regras de movimentação da fila, execuções de todos os clientes permitidos e histórico. Regras começam desligadas; habilitar não reaplica os eventos já existentes. Preservam o responsável e só movem etapas elegíveis, sem reabrir perdido/confirmado por mensagens genéricas. Um lead sem responsável não é assumido pela automação.
- Workspace → Follow-up: sequência por cliente para leads em “Aguardando resposta”, com mensagem efetivamente enviada pela atendente como origem. Intervalos em minutos/horas/dias, até dez etapas, textos próprios de WhatsApp e SMS. A etapa seguinte aguarda sucesso em todos os canais habilitados da etapa anterior, evitando uma rajada de tentativas atrasadas.
- Workspace → Confirmações e lembretes: etapas independentes de antecedência, finalidade (pedir confirmação ou apenas lembrar), texto e canais. Confirmar cancela pedidos ainda pendentes; lembretes informativos continuam. Comparecimento, remarcação ou horário já passado invalidam tarefas incompatíveis. Antecedências já perdidas ao ativar uma configuração não disparam retroativamente.
- Cada rotina pode usar o calendário geral ou expediente/feriados próprios. Intervalos de follow-up são corridos; a janela útil ajusta quando o envio poderá ser preparado. Não confundir isso com contar todas as horas de atraso como horas úteis.
- Preferências de contato por lead são compartilhadas entre as duas rotinas: autorizações de canal (nenhuma por padrão), origem da preferência, pausa e recusa. Pausa/recusa cancelam pendências. Reverter uma recusa não ressuscita tarefas já canceladas; uma nova conversa ou nova versão da rotina gera uma programação nova.

## Motor em memória

`MemoryAutomations` é criado junto aos repositórios existentes. O refresh da aplicação e o intervalo do DemoProvider reavaliam estado atual e versões; não fazem chamadas externas. Configurações, preferências, tarefas, outbox e histórico sobrevivem à navegação interna, mas se perdem ao recarregar/fechar. Nada roda com a página fechada nesta etapa.

O motor acompanha appointment.created da outbox existente, mudanças explícitas de confirmação/remarcação e novas mensagens canônicas. Envios locais/simulados/pendentes/falhos não movem cards. A aceitação de uma mesma mensagem é processada uma vez, mesmo após novos recibos; pendente → enviada é reconhecido. `automationJobId` marca mensagens de automação e evita reiniciar a cadência como se fossem novas mensagens da atendente. Resposta inbound normalizada em received interrompe follow-up mesmo com a regra de movimentação desligada.

Tarefas usam IDs, versão, cliente, canal, etapa, âncora e chave de deduplicação. Horário remarcado muda a âncora e cancela pendências antigas. Mudanças de configuração invalidam tarefas da versão anterior. A fila expõe somente solicitações cujas tarefas continuam preparadas; tarefas bloqueadas/canceladas não são entregáveis. Prefere bloqueio por falta de telefone, preferência, profissional/variável ou URL a criar conteúdo faltante. Estado “Preparado (sem envio)” não significa enviado.

`recordResult` é uma interface de domínio para futuro worker autenticado, sem endpoint público e sem botão que simule sucesso. HTTP 200 do webhook é apenas aceite da orquestração; somente retorno comprovado do envio pelo provedor deverá registrar sent. Falha mantém revisão necessária, sem pular à próxima tentativa. As tarefas aqui ainda não são ps_tasks/ps_jobs persistidos nem tarefas manuais da ficha do lead.

## Webhooks e contratos

Configurações → Webhooks contém três novos destinos; não é necessário um endpoint para cada canal:

| Destino                         | Evento                              | Função                                                                                          |
| ------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| Eventos de automação (opcional) | automation.stage_changed            | Auditoria no n8n; movimentar a fila não depende do webhook                                      |
| Disparos de follow-up           | followup.send_requested             | n8n resolve tarefa, mensagem e conexão autorizada; envia por WhatsApp/Evolution ou provedor SMS |
| Confirmações e lembretes        | appointment.reminder.send_requested | n8n resolve agendamento, finalidade, versão, canal e mensagem                                   |

Os destinos podem apontar para workflows distintos ou para o mesmo receptor que roteia pelo eventType. O envelope tem schemaVersion, event ID, organização, cliente, operação, lead, job, etapa, versão, canal, appointment/conversation quando aplicável, dedupeKey e occurredAt. O worker/n8n consulta os dados da tarefa e resolve destinatário, texto e conexão no servidor; não aceitar esses vínculos como autorização vinda do browser. URLs cadastradas na tela ainda são somente memória; não criam env vars.

`lib/webhooks/automation.ts` reutiliza o adapter de assinatura HMAC, HTTPS, Idempotency-Key, timeout e retentativa. Não há chamada desse adapter a partir do browser ou cron real nesta entrega. `.env.example` prevê ATENDHUB_AUTOMATIONS_WEBHOOK_URL, ATENDHUB_FOLLOWUP_WEBHOOK_URL, ATENDHUB_REMINDER_WEBHOOK_URL e o segredo global existente; são fallback/configuração futura do worker, não sincronizados com a tela. O adapter de formulários existente mantém seu contrato.

## Dependências para envios reais

Conectar Auth/Supabase, RLS e preferências por organização/cliente; persistir versões, configurações, tarefas, outbox e tentativas; criar worker durável/cron e callback autenticado do n8n; resolver relação próprio/equipe no servidor. A avaliação de permissões inclui as novas áreas, mas a sessão atual em memória não substitui autenticação nem RLS.

Antes de enviar, revalidar escopo, status, recusa, janela, conexão, consentimento/base legal aplicável, versão da consulta e política de templates/janela do WhatsApp. Supabase é a fonte de verdade e n8n lê configurações por IDs, sem duplicar workflows por cliente. Guardar segredos apenas no servidor, proteger destinos contra SSRF e redirecionamentos, verificar assinaturas e correlação de callbacks. Usar claim transacional/índice único da dedupeKey para evitar concorrência entre workers e registrar o ID do provedor. Tratar aceite do webhook separado de envio e entrega; não prometer ausência de duplicação externa sem idempotência/reconciliação do provedor.

Inbound de WhatsApp/SMS e opt-out explícito precisam atualizar preferências e mensagens no banco antes da reavaliação. Não interpretar qualquer “sim” como confirmação: usar registro explícito de atendente ou ação estruturada autenticada. Reagendamento completo da agenda (incluindo liberação do horário antigo) continua sendo fluxo separado; aqui se cancelam/reprogramam tarefas ao observar mudanças válidas.

Fuso America/Sao_Paulo no regime atual (-03). Requisitos históricos de horário de verão e execução em outros fusos exigirão conversor IANA no backend. Planejar retenção de logs e minimizar PII; outbox de notificações carrega identificadores, não cópias indiscriminadas de mensagens clínicas.

## Validação da entrega

Build de produção e lint aprovados. Suíte de navegador: 26 testes aprovados, incluindo movimentação do card ao agendar, configurações por cliente, canais, navegação, acessibilidade e layout móvel. Testes unitários cobrem sequenciamento, cancelamento, deduplicação, calendários, assinatura e ativação sem reaplicar eventos antigos. Capturas em `screenshots/automations/`.
