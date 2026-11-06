# Fundação Supabase do Atend&Hub

## Escopo aplicado

A migration `20261106000000_atendhub_foundation.sql` foi aplicada no projeto Supabase de desenvolvimento depois da inspeção do schema compartilhado. A inspeção encontrou tabelas de outros sistemas, incluindo `public.clientes`; nenhuma delas foi alterada, reutilizada ou renomeada.

A migration criou exclusivamente objetos com prefixo `atendhub_`:

- `atendhub_organizations`: organização isolada do sistema.
- `atendhub_operations`: operação `prescrita` ou `veredite`, vinculada à organização.
- `atendhub_clients`: conta atendida, vinculada simultaneamente à organização e à operação.
- `atendhub_professionals`: profissional vinculado ao cliente; CRM e especialidades são opcionais.
- `atendhub_team_members`: membro interno, com FK para `auth.users`, cargo e status.
- `atendhub_team_client_access`: clientes autorizados para cada membro.
- `atendhub_team_member_permissions`: sobrescritas de permissões por membro.

Foram criados UUIDs, timestamps com fuso, índices e FKs compostas para impedir vínculos entre organizações. Todas as tabelas têm RLS habilitado e não possuem políticas permissivas nesta etapa; portanto, o acesso pela API permanece negado até a próxima etapa.

## Configuração

Os clientes oficiais estão em `src/lib/supabase/client.ts` e `src/lib/supabase/server.ts`. Variáveis necessárias:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

A chave `service_role` não é usada pelo aplicativo e nunca deve receber prefixo `NEXT_PUBLIC_`.

## Migration

A migration foi aplicada no Supabase de desenvolvimento pela integração MCP. O arquivo versionado permanece em `supabase/migrations/20261106000000_atendhub_foundation.sql` para auditoria e reprodução controlada. Não foram alterados configurações globais do Auth, autocadastro, provedores ou templates.

## Continuidade do app

Os repositórios em memória continuam sendo a fonte dos fluxos atuais. Nenhuma tela foi ligada parcialmente ao Supabase e não há gravação dupla. A substituição deve ocorrer em C2 por adapters autenticados, mantendo os contratos de `src/domain/contracts.ts` e adicionando carregamento, erros, pending e revalidação.

## Matriz proposta para C2

A decisão de acesso deve combinar três dimensões:

1. **Ação**: a chave de permissão (`area.action`) e o grant (`none`, `own`, `team`, `all`).
2. **Cliente autorizado**: `client_access_mode = selected` exige uma linha em `atendhub_team_client_access`; `all` significa todos os clientes da própria organização, não todas as organizações.
3. **Atribuição**: para Inbox e fila, `own` exige conversa/lead atribuído ao membro; `team` permite o escopo da equipe conforme política explícita; `all` não deve ser concedido automaticamente por cargo.

O cargo gerente não concede acesso a todos os clientes. Atendentes acessam somente conversas atribuídas a eles, dentro dos clientes autorizados. Superadministrador continua sendo um cargo interno e não pode ser promovido pelo navegador.

## Primeiro superadministrador

Na próxima etapa, o primeiro superadministrador deve ser provisionado por operação server-side protegida, com usuário já existente em `auth.users`, verificação explícita de que a organização ainda não tem um membro `super_admin`, auditoria e execução privilegiada fora do navegador. Não haverá autocadastro público nem endpoint que aceite livremente a promoção de cargo.

## Não concluído

Autenticação real, convites, políticas RLS por cargo/cliente, persistência dos repositórios, portal do cliente, integrações externas e ajustes globais do Supabase Auth permanecem fora desta etapa.
