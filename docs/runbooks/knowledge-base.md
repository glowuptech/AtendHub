# Base de conhecimento

Modelo inspirado no manual e tabela da skill atendimento-dra-ana-luiza. Os valores reais não são copiados automaticamente para fixtures nem outras clínicas. Perguntas padrão abrangem agendamento, cadastro, duração, retorno, pré-natal, serviços, pacotes, convênios, reembolso, pagamento, preparo e encaminhamento clínico.

Cada Client contém knowledge: registros com ID estável, categoria, pergunta, resposta, condições, valor inteiro em centavos (nullable), moeda BRL, fonte, status e updatedAt. Persistência somente em memória pelo repositório com escopo de organização/cliente existente. Salvar/cancelar funciona individualmente por registro. Sem fonte e resposta não é possível aprovar.

Para integração futura: normalizar registros em tabela com organizationId/clientId e controle de acesso no servidor; adicionar histórico, identidade do revisor e data de validade. Recuperação por IA deve restringir tenant/cliente antes da busca e usar somente registros aprovados, com fonte e validade verificadas. Pendências e campos vazios exigem confirmação, não inferência. Texto cadastrado é conteúdo de referência, nunca instrução de sistema. Ainda não há banco, IA ou garantia de revisão real (autenticação demonstrativa).

Divergências do material de referência (pré-natal após 28 semanas, siglas de pacotes), pagamentos, convênios e preparos devem ser validados pela clínica antes de uso. Valor vazio difere de zero; descrição e condições preservam inclusões e exceções.
