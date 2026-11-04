# Refatoração do Inbox — auditoria e plano

## Estado encontrado

- Rota existente: `/app/inbox`, exporta `features/inbox/components/inbox.tsx`.
- `DemoProvider` mantém a sessão Operadora, escopo, repositórios, seleção encaminhada pela fila e revisão em memória. O sweep de 15 s é para capturas de formulário, não uma integração realtime de mensagens.
- `assignedConversations` agrega clientes permitidos e filtra a atribuição atual do lead. Preservar essa regra e os IDs de conversa/lead/cliente; nunca juntar contatos por telefone.
- `MockInboxRepository` oferece list/get/ensure. Não há send, retry, recibos de leitura, encerramento, áudio, anexos ou integração WhatsApp. Mensagens existentes são texto com status simulated e canal disconnected. O botão antigo apenas mostrava aviso local, sem gravar ou enviar mensagem.
- CRM: lead com contato, profissional por doctorId, etapa, origem, responsável, histórico e tarefas. Reusar LeadModal, editField e rota de cadastro. Agendamentos são espelhos manuais.
- Base de conhecimento: Client.knowledge com respostas, fontes e aprovação. Sem modelo, embeddings, RAG, documentos indexados ou endpoint de IA.
- Autenticação/RLS e banco são futuros (`src/lib/supabase/README.md`). Escopo atual é aplicado pelos adapters em memória; não é uma barreira de segurança de produção.
- Layout existente: Shell recolhível, tokens neutros/roxos, Geist local, Button/Badge/Empty/LeadModal compartilhados.

## Decisões

Refatorar a rota existente em lista, chat e painel contextual/assistente. Separar componentes de apresentação mantendo os repositórios. Filtros de espera são derivados da direção da última mensagem; não alteram etapa do CRM. Não lidas e Finalizadas ficam indisponíveis até existirem estados confiáveis; perdido/agendado não equivalem a conversa encerrada. O filtro de atendente não amplia o Inbox pessoal.

Rascunhos WhatsApp ficam em memória por conversa; não há envio real. Emoji é uma edição local; anexos/áudio/envio permanecem indisponíveis. Preservar ação demonstrativa antiga como prévia explícita. Dados e estado contextual são trocados juntos, com remount por ID e cancelamento de solicitações do assistente.

Interface e contrato do assistente preparados, adapter padrão indisponível. Não fabricar respostas. A consulta manual às entradas aprovadas da base é identificada como consulta cadastrada, não geração por IA. Copiar e inserir somente alteram clipboard/rascunho. Nunca chamar mensageria ao inserir.

## Integração futura (pendente)

O endpoint deverá resolver sessão autenticada → organização/membership → conversa/canal → lead/cliente/profissional no servidor. O request do browser contém apenas ID da conversa e pergunta, nunca uma autorização ou seleção livre de tenant/base. Validar acesso em cada chamada, limitar fontes aprovadas e profissionais autorizados, retornar fontes verificáveis e recusar respostas sem evidência. Não enviar toda a conversa nem PII por padrão. Tratar documentos e perguntas como dados não confiáveis, isolar instruções de sistema, impedir tool execution/alterações no CRM/envio pelo modelo; definir retenção e LGPD. Proteger contra respostas atrasadas de outro contexto.

Adicionar adaptadores de WhatsApp, estados de entrega/leitura, erros/reenvio e janela/templates conforme o provedor escolhido. Adicionar persistência e eventos realtime autenticados. Nenhum novo banco ou API live é criado nesta etapa.

## Implementação entregue

A rota original passa a compor lista com busca/filtros, ChatPanel e ContextPanel/AssistantPanel. O layout usa a largura disponível (incluindo sidebar recolhida) e altura do visualViewport, com rolagens independentes. Em telas menores, o contexto abre em dialog nativo com foco e Escape. No celular, lista e conversa alternam sem empilhar três colunas. Preferência de movimento reduzido é respeitada.

Os rascunhos ficam no DemoProvider, por ID da conversa, e sobrevivem à navegação interna ao cadastro. Recarregar a aplicação limpa a memória. Foto opcional HTTPS foi adicionada de forma compatível ao schema existente; nenhum dado de exemplo foi adicionado. Sem foto ou em erro de carregamento, aparecem iniciais.

O assistente padrão permanece indisponível. O contrato de integração e UI de resposta, fontes, erro e carregamento estão preparados, mas sem geração, endpoint nem garantias de autorização backend. O histórico de mensagens original continua somente texto; não há status de entrega real. Não lidas/Finalizadas, anexos, áudio e envio ficam indisponíveis porque a infraestrutura não os suporta. Filtros de espera não modificam o CRM.

A base atual é por cliente; segmentação de fontes por profissional requer definição no backend antes de habilitar a geração. Nada desta entrega deve ser interpretado como IA ou WhatsApp conectados.

## Validação realizada

37 testes unitários aprovados; suite completa de 18 E2E aprovada. Após os refinamentos visuais finais, 8 testes dos fluxos afetados foram executados novamente e passaram. Lint, TypeScript e build aprovados. Axe sem violações WCAG A/AA detectadas nos cenários exercitados. Verificados desktop de 1800 px, notebook de 1024 px, celular de 390 px, redução de altura para 500 px, foco de drawer/Escape, isolamento de bases, inserção sem envio e rascunho após navegação ao cadastro. As capturas foram revisadas visualmente e estão em `docs/runbooks/screenshots/inbox/`.

Os testes usam Chromium. Teclados virtuais em aparelhos físicos, Safari/Firefox, provedores de WhatsApp e modelos de IA reais não foram exercitados. Dados criados pelos testes são efêmeros e não alteram as fixtures do aplicativo.
