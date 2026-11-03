# Formulários por cliente — Atend Hub

## Fluxo implementado

Perfil → Formulários → Novo formulário. Título, descrição, slug único, profissional opcional, perguntas de texto/seleção e demais tipos do catálogo. Cada pergunta mantém IDs próprios de campo, pergunta, etapa e ação. Alterações de tipo/opções criam outra definição para preservar o histórico. A versão ativada é imutável; editar cria um novo rascunho.

Contatos configuráveis individualmente (nome, telefone/WhatsApp, e-mail), rótulo, obrigatoriedade e posição antes/depois das perguntas. Capa/fundo opcionais em PNG/JPEG/WebP até 1 MB, seis famílias de fonte com fallback local, cores e raio dos botões. Fontes disponíveis dependem do sistema operacional; não há downloads de fontes externos.

A prévia não cria leads nem métricas. O formulário ativo cria/atualiza leads na memória do provider compartilhado durante navegação interna. Respostas ficam ligadas ao cliente, formulário, versão e IDs das perguntas; detalhe do lead apresenta o rótulo histórico. Rascunhos e arquivados não aceitam captura pública.

## Sessão e abandono

Avançar o bloco inicial com nome e telefone válidos salva um lead em andamento. Cada avanço atualiza o mesmo lead. Após o prazo configurado (padrão 30 min) sem avanço, o sweep marca incompleto e enfileira `lead.incomplete` uma única vez. Concluir atualiza esse lead e enfileira `lead.completed` uma única vez. Há retomada por formulário/versão dentro da mesma memória do navegador. Sem contato inicial não há lead parcial identificável.

O sweep roda a cada 15 s enquanto o aplicativo está aberto. Suspensão do navegador pode atrasá-lo. Recarregar, fechar a aba ou acessar outra aba/navegador perde/isola a memória; não há recuperação após reload nem compartilhamento real entre paciente e atendente. Isso exige persistência e worker no próximo marco.

## Métricas e Meta

Visita válida após 5 ou 10 s cumulativos de página visível, uma vez por sessão. Tempo reduz ruído, não comprova que a visita é humana. Preview não conta. Formulários listam os novos contadores; analytics detalha as versões e ações. Conclusões rápidas são guardadas mesmo antes do prazo: a taxa usa apenas conclusões de visitas que atingiram o mínimo.

Pixel ID e flags PageView/Lead são salvos por versão. Cada etapa pode ter nome de evento customizado e actionId distinto. Somente avanço validado gera ação, deduplicada por sessão/ação. Eventos preparados para Meta contêm apenas IDs técnicos, pixel ID e nome configurado; não incluem contatos, respostas ou URLs clínicas. Nomes dos eventos devem ser genéricos, sem dados sensíveis. O evento Lead compartilha o eventId da conclusão para futura deduplicação Pixel/CAPI. Não há qualificação automática e não há script/rede Meta. Revisão de consentimento/políticas e transporte real permanecem futuros.

## Webhook e migração

`.env.example`: `ATENDHUB_WEBHOOK_URL` e `ATENDHUB_WEBHOOK_SECRET`, somente servidor. Adaptador `src/lib/webhooks/delivery.ts` prepara POST HTTPS, HMAC SHA-256, Idempotency-Key, timeout 10 s e backoff até 1 h. Destino ausente não faz rede. Nenhum worker o chama nesta fase.

Outbox contém schemaVersion, id, tipo, organizationId, clientId, formId, versionId, leadId, ocorridoEm, estado/contador/horário de tentativa. Payload enviado limita-se aos IDs e tipo de evento: n8n poderá notificar a equipe e futuramente consultar detalhes pelo backend autorizado. Não envia respostas ou contatos automaticamente.

Banco futuro: persistir sessão, lead, respostas e outbox atomicamente, constraints de idempotência, escopo/autorização no servidor, snapshot imutável; worker processa abandono e entrega com retentativa, persiste status/attempts/nextAttemptAt e trata falhas definitivas. Implementar conexão pública segura por token/slug sem expor registry administrativo. O protótipo não oferece autenticação/isolamento de produção.

## Verificação

Build de produção, lint e TypeScript aprovados. 25 testes unitários e 9 cenários E2E aprovados. Cobertura nova: parcial → incompleto → concluído com idempotência, validação/escopo, retomada local, IDs de eventos, adaptador do webhook sem rede real, editor até CRM, acessibilidade mobile, ausência de overflow horizontal, tempo mínimo de visita, exclusão de aba oculta e prévia. Capturas: `screenshots/form-editor-new.png` e `screenshots/form-public-mobile.png`.
