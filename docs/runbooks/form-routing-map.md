# Mapa de caminhos

Base atualizada de main d3e7087 (inclui c341ace). Editor mantém sanfonas.

- Mapa por resposta → destino → perguntas específicas; seleção de perguntas dentro de cada ramo.
- Perguntas comuns listadas separadamente, mantendo a ordem do bloco Perguntas. Questões anteriores ao roteamento não podem ser atribuídas a um ramo posterior.
- Configuração manual de nomes continua recolhida; seleção múltipla de caminhos preservada.
- Salvar atualiza o cache SWR para evitar reabrir a cópia anterior ao navegar.
- GET individual e listagem usam campos da mesma versão ativa, em vez de sempre os campos da última versão.
- PUT não declara sucesso se a atualização de um rascunho retornar zero linhas.

Testes de componentes usam persistência simulada. Teste de API verifica versão ativa com cliente Supabase simulado. Nenhum desses testes comprova gravação ou RLS no Supabase real; sessão autenticada indisponível nesta execução. Não há alteração de schema/migration.
