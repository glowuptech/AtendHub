# Agenda externa e acessos do cliente

Base atualizada da main c24dc89. O perfil agora possui Agendamento externo (nome, URL HTTPS e botão para abrir em outra aba) e Acessos (plataforma, URL, login, senha e observações).

## Ativação real pendente

1. Aplicar SOMENTE `supabase/migrations/20261118050000_atendhub_client_accesses_scheduling.sql`. Não reaplicar as migrations antigas do banco compartilhado.
2. Definir `ATENDHUB_CLIENT_ACCESS_ENCRYPTION_KEY` no ambiente seguro do servidor: 32 bytes aleatórios em hexadecimal (64 caracteres). Por exemplo, gerar com `openssl rand -hex 32` em ambiente seguro e cadastrar o resultado nos secrets do deployment. Não publicar o resultado no chat, logs ou repositório. Não usar NEXT_PUBLIC_.
3. A configuração existente SUPABASE_SERVICE_ROLE_KEY continua somente no servidor. Testar com super_admin ativo autorizado para o cliente.

A chave de criptografia é para guardar senhas de plataformas externas, não é uma senha de login, API key da Evolution ou assinatura de webhook. Precisa estar disponível em cada ambiente que lê os mesmos registros. Perder ou substituir a chave impede ler senhas já criptografadas; rotação exige descriptografar com a antiga e recriptografar com a nova antes de removê-la.

## Modelo e autorização

- O link/nome de agendamento ficam em metadata do cliente, nas chaves externalSchedulingUrl e externalSchedulingName.
- A RPC atendhub_update_external_scheduling faz merge dessas duas chaves, sem substituir knowledge/billing/demais informações, com autorização de super_admin e cliente permitido. search_path vazio.
- Clientes novos não recebem mais agenda demonstrativa. O perfil não oferece o link placeholder legado https://example.com/agenda-demo.
- atendhub_client_accesses é privada, com FK composta de organização/cliente, RLS habilitado e nenhum acesso direto a anon/authenticated. Só o servidor acessa a tabela após autenticação, validação de super_admin e consulta do cliente por RLS.
- Acesso ao cofre inicialmente restrito a super_admin. Demais cargos recebem uma mensagem de restrição; não foram liberadas exceções por funcionário nesta etapa.
- Senha usa AES-256-GCM, IV aleatório e dados autenticados contendo organização/cliente/registro. Trocar ciphertext entre registros não funciona.
- Listagens não incluem senha nem ciphertext. Revelar/copiar exige POST explícito autorizado. Respostas usam Cache-Control: no-store. A senha revelada é ocultada após 30s; copiar envia ao clipboard somente por ação explícita.
- Senha vazia na edição preserva a senha existente. Cancelar limpa o formulário. Senhas não ficam em metadata, knowledge, eventos, URL ou localStorage.
- Links aceitam HTTPS sem usuário/senha no endereço, abrem com noopener/noreferrer. Não há login automático, iframe, autofill de site externo ou teste remoto de credenciais.

## Validação

Testes locais verificam criptografia/decriptação, contexto do ciphertext, chave ausente e URLs inválidas. PostgreSQL embarcado aplica a migration e verifica merge da agenda preservando knowledge e bloqueio da tabela de acessos para anon/authenticated. Testes de API verificam sessão/cargo/cliente antes do acesso privilegiado. Navegador usa API simulada e credenciais fictícias para cadastro, reload, revelação, ocultação, edição sem trocar senha e exclusão.

Pendentes no Supabase real: aplicar a migration, configurar a chave, testar salvar/recarregar link; cadastrar, revelar, editar e excluir acesso com usuário autenticado; confirmar isolamento entre organizações e ausência de senha nos GETs gerais de cliente.
