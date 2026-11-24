# Dados pessoais e valor previsto no agendamento

## Migration

Migrations incrementais registradas no projeto correto:

- `supabase/migrations/20261124161200_atendhub_booking_details.sql` — versão `20261124161200`, nome `atendhub_booking_details`.
- `supabase/migrations/20261124161525_atendhub_booking_details_idempotency_privacy.sql` — versão `20261124161525`, nome `atendhub_booking_details_idempotency_privacy`.
- `supabase/migrations/20261124161816_atendhub_booking_details_cpf_validator.sql` — versão `20261124161816`, nome `atendhub_booking_details_cpf_validator`.
- `supabase/migrations/20261124162423_atendhub_booking_details_authorization.sql` — versão `20261124162423`, nome `atendhub_booking_details_authorization`.

Aplicar somente no projeto Supabase correto e conferir o histórico antes de repetir qualquer operação. O recurso usa exclusivamente objetos `atendhub_`.

A migration cria `atendhub_lead_registration` para nome completo, CPF normalizado, RG e data de nascimento e `atendhub_service_values` para previsão em centavos BRL. As chaves estrangeiras compostas evitam misturar organização, cliente, lead, conversa e agendamento. RLS e `atendhub_booking_details_can_access` verificam sessão, cliente e permissões de calendário; as rotas usam o cliente Supabase da sessão, não service role.

## Fluxos e capacidade

- `GET/PATCH /api/leads/:leadId/registration` atende o envelope documentado em `docs/prompts/inbox-registration-value-v0.md`. PATCH recebe `data` sem envelope, valida CPF e data local em `America/Sao_Paulo`, permite limpar campos e retorna a leitura após salvar.
- `GET/PATCH /api/inbox/conversations/:conversationId/value` devolve o envelope com agendamentos apenas do mesmo lead/cliente/organização. Valor ausente fica `null`; `0` permanece `0`.
- `POST /api/clients/:clientId/appointments` passa os detalhes a `atendhub_create_appointment_with_details`. Reserva, cadastro alterado, vínculo do serviço, histórico e notificação são atômicos. A chave de idempotência inclui todos os campos adicionais; payload divergente conflita.
- O valor de conversa sem reserva é um rascunho único. Ao agendar pelo Inbox, o registro sem agendamento é associado à nova reserva; serviços ligados a reservas antigas não são sobrescritos. Cada reserva pode ter no máximo uma previsão.
- A Agenda publica `capabilities.bookingDetails` apenas quando a tabela de valores está consultável; a confirmação do POST só é verdadeira após o retorno da RPC transacional.

## Privacidade e semântica financeira

CPF, RG e nascimento ficam somente na tabela privada de cadastro e no endpoint específico. Não são incluídos em histórico, notificação/webhook, URL, analytics nem contexto da IA. A notificação existente contém apenas os dados operacionais já definidos para agendamento.

`amount_cents` é estimativa de serviço em BRL, não pagamento recebido. Esta implementação não cria cobrança, recebimento, comissão ou lançamento financeiro. Valores antigos continuam preservados quando um serviço posterior é criado.

## Verificação

Testes automatizados do projeto cobrem validadores e fluxos simulados; eles não substituem sessão autenticada real. Para homologar, criar reserva com dados fictícios em Agenda e Inbox, recarregar e confirmar GET; repetir a mesma chave e variar payload para verificar idempotência/conflito; conferir que usuário de outra clínica recebe 403/404 sem dados. Não usar documentos reais em screenshots, logs ou evidências.
