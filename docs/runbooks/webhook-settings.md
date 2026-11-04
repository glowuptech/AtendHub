# Configuração dos destinos de webhook

Configurações → Webhooks contém cinco campos independentes de URL: notificações de formulários, conexão WhatsApp, envio de mensagens do Inbox, Assistente IA e agendamentos. HTTPS obrigatório, sem usuário/senha ou fragmentos na URL. Campos são opcionais; limpar e salvar remove um destino. Validação precede o salvamento conjunto. Há indicação de alterações pendentes, descarte, foco no campo inválido e confirmação do salvamento.

Dados ficam no DemoProvider durante a sessão do aplicativo, sobrevivendo à navegação interna. Recarregar limpa a memória. Não são gravados em localStorage nem em variáveis de ambiente; nenhuma chamada de rede ocorre ao salvar. URL cadastrada não significa conexão verificada.

Eventos de formulários preservam os nomes existentes `lead.completed` e `lead.incomplete`. Os demais nomes na interface são contratos previstos, ainda sem emissão: `whatsapp.connection.requested`, `inbox.message.send_requested`, `assistant.question.requested` e `appointment.created`. Eventos de criação precisam ocorrer somente após a operação ser aceita, usando ID estável para deduplicação em retentativas.

Esta entrega configura destinos; não conecta a mensageria, não solicita conexão na Evolution e não altera o estado de disponibilidade da IA. O adapter de notificações `lib/webhooks/delivery.ts` continua lendo sua configuração de servidor existente; o editor em memória não o sobrescreve. A migração para resolver cada destino exige armazenamento protegido no servidor por organização e autorização do superadministrador.

Ao conectar ao servidor: manter credenciais/assinaturas em armazenamento privado, validar autorização antes de usar IDs de cliente/conversa, impedir chamadas a destinos internos e redirecionamentos não autorizados, aplicar timeout e autenticação das chamadas, usar fila durável para notificações/envios e retentativas idempotentes. Para IA, resolver a base a partir do vínculo validado da conversa e correlacionar a resposta com a solicitação; perguntas não enviam nada ao WhatsApp. Para agendamentos, incluir IDs, operação, data e horário somente após salvar. Recebimento Evolution → n8n → banco → Inbox segue canal de entrada separado.

Dependências pendentes: persistência/Supabase, autenticação, RLS, provisionamento seguro de segredos e integração dos disparos de cada fluxo. Não há criação automática de env vars no v0. A configuração futura pode usar uma tabela privada ou uma integração explícita com o ambiente de deploy.

Validação: 43 testes unitários aprovados; lint, TypeScript e build aprovados. E2E de Webhooks, Calendário de atendimento e Equipe aprovados. Verificados cinco destinos, validação, descarte, remoção de destino, navegação interna sem perder valores, ausência de chamadas externas e acessibilidade/overflow em mobile.
