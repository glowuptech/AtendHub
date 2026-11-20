# Domínios do Atend&Hub

A plataforma usa `atendehub.app` como domínio público e `painel.atendehub.app` para a administração. O domínio de um cliente é composto pelo subdomínio escolhido em **Perfil do cliente → Domínio público**.

## Publicação

1. Aplique `supabase/migrations/20261121160000_atendhub_client_domains.sql` no Supabase do projeto. Ela depende das migrations do link público de confirmação e do link automático. Aplique o arquivo uma vez e confira o histórico. A migration cria o cadastro de domínios e atualiza as funções de links.
2. Vincule `atendehub.app`, `painel.atendehub.app` e os subdomínios ao mesmo projeto de hospedagem. Com suporte a wildcard, vincule `*.atendehub.app` em vez de cada clínica individualmente. Use os registros indicados pela hospedagem para DNS e HTTPS. Se ela publicar um destino CNAME comum, configure-o no projeto como `ATENDHUB_DNS_TARGET` para que o painel mostre o valor copiável.
3. No perfil da clínica, salve apenas o rótulo, por exemplo `dra-ana-luiza`. Se a hospedagem trabalhar com registros individuais, adicione o CNAME e o subdomínio ao projeto. Assim que o HTTPS funcionar, clique em **Verificar HTTPS e ativar**. O botão consulta o próprio app pelo novo endereço.
4. No n8n, mantenha `https://atendehub.app` como terceiro parâmetro do nó **Reservar lembrete**. A função usa automaticamente o domínio ativo de cada cliente. Respeite o mesmo contrato de envio e ACK já documentado. Mensagens cujo texto já foi reservado mantêm o endereço original.

## Conferência

- Abra `https://painel.atendehub.app/` e confira a entrada administrativa.
- Abra o formulário publicado pelo botão do editor ou pela listagem. Confira a URL no domínio ativo e que o mesmo slug, no subdomínio de outro cliente, não carrega nem aceita submissão.
- Abra `/portal` no subdomínio de uma clínica e entre com uma conta autorizada. A agenda usa a sessão e as políticas do Supabase. Em seguida, confirme que uma conta sem acesso à clínica não consegue abrir esse portal. Configure as URLs de retorno no Supabase Auth conforme os endereços de login efetivamente utilizados.
- Gere um link pela página de confirmações e confirme o domínio. Teste também a reserva automática usando consulta e número controlados pela equipe. Confira o comportamento do link em um subdomínio de outra clínica.
