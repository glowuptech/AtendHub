# Auditoria e simplificação do editor de formulários

Base auditada: ea693c4, branch v0/auditoria-persistencia-atendhub.

## Problemas comprovados no código

- Caminhos configurados em quatro pontos: cadastro de caminhos, destinos nas opções, associação múltipla de cada pergunta e checkbox de roteamento. A interface permitia vários roteadores, embora o servidor aceitasse apenas um.
- QuestionOptions guardava tipo e opções em estado próprio. Salvar o formulário antes de clicar em Aplicar descartava alterações visíveis. Havia também duas listas de campos em estado no editor.
- IDs/letras de caminhos eram derivados de paths.length. Excluir B entre A/B/C e adicionar outro produzia C duplicado.
- Exclusão de caminhos deixava destinos e associações órfãs.
- Validação não impedia perguntas específicas antes do roteador e ignorava referências órfãs quando paths estava vazio.
- Toda a configuração aparecia em uma página extensa, com chaves e IDs técnicos misturados à edição cotidiana.

## Organização implementada

Abas Geral, Apresentação, Perguntas, Fluxo, Contatos, Aparência e Integrações. Uma pergunta aberta por vez; opções controladas diretamente pelo mesmo rascunho. Eventos e reutilização de campos ficam em controles avançados. IDs são gerados internamente.

Fluxo é o único local para escolher a pergunta de seleção única/imagens que direciona, nomear caminhos, associar respostas e escolher perguntas comuns/exclusivas/compartilhadas. A pergunta selecionada se torna obrigatória e comum. Sem caminhos, o formulário permanece linear. Não há migração de dados ou alteração nas políticas RLS.

Remover um caminho exige confirmação, limpa suas referências e mantém perguntas. Perguntas exclusivas desse caminho tornam-se comuns; destinos vazios devem ser revisados antes de publicar. Voltar ao fluxo linear também exige confirmação. IDs de caminhos existentes são preservados; novos IDs não dependem da quantidade.

Salvar rascunho inclui as opções em edição sem Aplicar intermediário. Publicação valida a configuração e o servidor continua validando. Há bloqueio de submissões repetidas enquanto a requisição está em andamento.

## Validação

- 66 testes unitários aprovados, incluindo exclusão/recriação de caminho, seletor único, percursos A/B, referências órfãs e ordem do roteador.
- Chromium com componentes reais do editor e wizard: criar pergunta por imagens, editar alternativas, configurar caminhos, associar perguntas exclusivas, salvar/recarregar e escolher A, voltar e escolher B. Layout de 1440px e 390px verificado sem overflow.
- Esse teste usa um harness isolado e persistência simulada em localStorage exclusivamente nos testes. Não existe rota de teste na aplicação normal. Não comprova autenticação, Storage ou Supabase/RLS.
- Teste de integração autenticada atualizado em tests/e2e/form-routing.spec.ts. Requer ATENDHUB_E2E_CLIENT_ID e ATENDHUB_E2E_STORAGE_STATE de um ambiente de desenvolvimento. Não foi executado contra dados reais nesta entrega.
- Typecheck, lint e build de produção aprovados; lint mantém o aviso já existente de imagem nativa no editor.

Executar teste isolado: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:editor`. Vite é fornecido pela árvore de dependências de desenvolvimento do Vitest. Capturas em screenshots/editor-clarity/.

## Limites preservados

Armazenamento das imagens e captura pública não foram ampliados. O upload atual continua usando data URL conforme implementação anterior; migrar assets para Storage exige etapa própria. Sem alteração de migrations, segredos ou env vars. A edição de apresentação Lift4D e os contratos versionados permanecem existentes.
