# Contratos preservados para as próximas fases

A fonte dos tipos/schemas é `src/domain/`; os contratos específicos são exportados por `features/*/repositories/contract.ts`. O frontend depende da fachada injetada pelo DemoProvider. Portas de mensageria/jobs estão em `providers/ports.ts`; não possuem implementação de rede.

## C2 — revisão antes de implementar

Supabase Auth com sessão validada no servidor; membership ativa, role e client scopes; PostgreSQL com RLS e constraints compostas; Storage privado. Prefixos propostos, UUID e UTC. Revalidar estado real do banco antes de migrations. Exigir testes negativos de IDOR e isolamento de duas clínicas. Nenhuma credencial administrativa no cliente.

Tabelas propostas pelo adendo: ps_form_definitions, ps_form_versions, ps_form_steps, ps_form_questions, ps_custom_field_definitions, ps_form_sessions, ps_form_events, ps_form_submissions, ps_form_answers, ps_lead_field_values, ps_lead_field_changes e ps_form_tracking_configs. Ainda não criadas.

## C3 — publicação e submissão futura

Resolver client_id exclusivamente pelo slug da versão PUBLICADA no servidor. Derivar field_id de question_id do snapshot. Validar todos os valores com Zod e regras publicadas, tamanho do payload, rate limit e antiabuso. Não aceitar client_id, actor, role ou fieldId arbitrários do navegador.

Transação curta: validar versão → deduplicar contato por (organization_id, client_id, telefone E.164) → criar/reusar oportunidade segundo finalidade → gravar submission e answers, revisões/proveniência e outbox → commit. UNIQUE(version_id,idempotency_key). Retrys retornam a mesma submissão, sem atribuição duplicada. Não deduplicar por nome. Telefone igual em clínicas distintas mantém identidades separadas.

Snapshot publicado é imutável. Editar rascunho não pode reescrever submissões ou métricas históricas. Eventos sem PII: allowlist strict de IDs opacos, tipo, elapsedVisibleMs e timestamp. Engaged_10s é interno, cumulativo e visível/ativo; PageView mantém semântica da Meta. Abandono só após timeout, nunca ao fechar a aba. Métricas distinguem eventos e sessões únicas, numerador, denominador, período, versão e timezone; divisor zero = N/D.

## C4 — integrações futuras

WF-16 Form Submission Dispatcher consome outbox idempotentemente; WF-17 Lead Form Enrichment normaliza contexto; WF-18 Form Funnel Aggregator produz agregados; WF-19 Form Retention Cleanup aplica política aprovada; WF-20 Native Meta Leads Import é posterior. Workflows consultam configuração no banco por IDs, não codificam clínicas. Nenhum workflow foi configurado.

Evolution atrás de MessagingProvider; fila concorrente/claim real com transação e trilha, responsável mantido até transferência controlada. n8n não atende render síncrono nem está no caminho transacional do submit. Agenda externa oficial; espelhamento e comparecimento dependem de fatos confirmados, nunca da passagem do tempo.

## Decisões ainda externas

LGPD e bases legais; retenção/backup/restauração; regras de oportunidade; política de marketing de saúde e consentimento; acessos individuais à agenda; domínio de publicação; versão e capacidade do provider. Pixel/CAPI continuam desativados. Nenhum dado clínico ou de paciente em anúncios, fixtures, logs ou prompts.
