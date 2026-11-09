# Editor compacto, aparência e recuperação de formulários

Base: ada0f17, branch v0/auditoria-persistencia-atendhub. A revisão anterior usava abas; esta revisão segue a decisão posterior do usuário de usar sanfonas.

## Organização

Sete blocos numerados começam fechados: Identidade (azul), Apresentação (violeta), Contatos (verde), Aparência (âmbar), Caminhos (rosa), Perguntas (índigo), Eventos e integrações (cinza). Abrir um fecha o anterior. O estado do rascunho fica no editor, preservando os valores ao recolher blocos. Perguntas e alternativas também recolhem individualmente; textos auxiliares, botão e evento da pergunta ficam em controles adicionais.

Em Caminhos, escolha a pergunta de atendimento e use Criar caminhos a partir das respostas. A ação preenche destinos ausentes e mantém os IDs/destinos válidos já existentes. Nomes e caminhos manuais ficam em uma sanfona avançada. A associação de perguntas a caminhos continua centralizada nesse bloco.

## Causas de aparência corrigidas

- Antes da primeira pergunta, o editor não montava o wizard. Alterações visuais não tinham prévia.
- O painel sólido podia cobrir a foto. Há miniatura, aviso explícito e ação Usar foto escura com texto claro (painel transparente, sobreposição preta a 55%, texto branco).
- A sobreposição estava dentro do painel, em vez de sobre a imagem inteira. Agora é uma camada linear-gradient no próprio background-image, sem apagar texto ou botões.
- Cabeçalhos herdavam variáveis globais do workspace e o botão de apresentação não tinha a regra de cor específica do formulário. Variáveis de texto e estilo do botão agora são isolados no formulário.
- A apresentação separada ainda renderizava o conteúdo das perguntas embaixo. Agora somente a etapa adequada é exibida; mudar o modo de apresentação reinicia a prévia.
- O carregamento assíncrono de arquivo podia usar configurações antigas e descartar ajustes feitos durante a leitura. O callback usa as configurações mais recentes.

Valores são armazenados nos campos versionados existentes. O transporte de imagens continua sendo data URL conforme a implementação anterior; não foi criada integração nova de Storage. Nenhuma migration foi necessária ou aplicada.

## Arquivar e desarquivar

Formulários possui Em uso e Arquivados, com contagens. Arquivar exige confirmação. Em Arquivados, Desarquivar chama PATCH /api/forms/:id com action restore. O endpoint usa a sessão e o cliente Supabase normal, filtro de organização e status archived, mantendo RLS. Sem registro alterado, não retorna sucesso. Não usa Service Role.

Restaurar muda somente status para draft e updated_at; versões, respostas e active_version_id são preservados. O formulário volta à lista Em uso com acesso à edição, sem republicação automática. DELETE continua sendo arquivamento lógico, agora confirmando que um registro autorizado foi efetivamente atualizado.

## Validação

- 73 testes unitários aprovados, incluindo criação idempotente dos caminhos a partir de opções, limites, filtros de organização/status da restauração, negativa sem sessão e negativa quando nenhuma linha é alterada.
- Três testes Chromium aprovados no harness: sanfonas/caminhos A/B; upload, cores e recarregamento; confirmação de arquivamento e recuperação em rascunho. Layout conferido a 1440px e 390px.
- Typecheck e build de produção aprovados. Lint sem erros, com dois avisos de img nativa nas miniaturas.
- O harness usa os componentes reais com persistência simulada exclusivamente nos testes. Não comprova RLS, armazenamento nem CRUD autenticado no Supabase. Não houve acesso ou alteração de dados reais nesta sessão.

Capturas em screenshots/editor-accordion. Testes: npm test e PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:editor. Validação autenticada da restauração e da aparência salva no Supabase permanece pendente.
