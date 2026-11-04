# Cobrança de clientes — previsão de estrutura

Mensalidade e pagamento ficam no cadastro (criar e editar). Client.billing opcional: monthlyFeeCents inteiro nullable (BRL), paymentMethod nullable (`monthly_boleto`, `credit_card`, `prepaid_cash`) e installments nullable (1–12, obrigatório somente para cartão). Ausência não equivale a zero. Trocar cartão por outra forma remove parcelas.

Mensalidade é referência comercial. Não inferir valor total, duração do contrato, cobertura do adiantamento, juros, desconto, valor de cada parcela ou autorização para cobrança. Esses termos serão definidos no módulo financeiro. Não armazenar número de cartão, CVV ou credenciais bancárias no cadastro.

Configurações → Central de faturas é uma aba reservada (Em breve). Não gera faturas, boletos, cobranças, links de cartão, recebimentos ou baixas; não integra gateway. Os dados continuam em memória, com o escopo existente de organização/cliente.

Próxima etapa: separar termos financeiros em tabela por organization_id/client_id, com RLS no servidor, por perfil/membership e permissões de consultar/editar/emitir faturas. A visibilidade da aba também deve seguir essas permissões, mas esconder a aba não substitui bloquear leitura e mutação no banco/API. O protótipo ainda não possui autenticação/RLS de produção.

Faturas futuras terão identificador, cliente, competência/período coberto, vencimento, moeda, valor, método, situação, referência do provedor e histórico auditável. Mensalidade, contrato e fatura são entidades distintas. Integrar emissão e notificações somente após gateway, permissões e regras de pagamento serem definidos. Não misturar investimento em anúncios com recebimento de mensalidades no dashboard.

Validação: 33 testes unitários aprovados; 4 cenários E2E aprovados (condições de pagamento, cadastro, perfil e configurações). Lint, TypeScript e build de produção aprovados.
