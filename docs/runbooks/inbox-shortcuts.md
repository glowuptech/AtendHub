# Atalhos de atendimento no Inbox

Implementação de interface baseada em `origin/main` no commit `f86cb50`. Não foi aplicada migration nesta etapa; dados pessoais e valores novos dependem da integração descrita em [prompt para o v0](../prompts/inbox-registration-value-v0.md).

No cabeçalho da conversa:

- **Agendar:** abre a mesma agenda persistida de Agendamentos, fixada no cliente da conversa e com o lead pré-selecionado. Não troca o Workspace global.
- **Agenda externa:** abre o HTTPS cadastrado no perfil do cliente em outra aba. Sem configuração, mostra orientação.
- **Abrir lead e campos:** abre a ficha persistida em diálogo, com respostas e histórico. O antigo botão lateral foi movido para o topo.
- **Adicionar informações:** nome completo separado do nome de exibição, CPF, RG e nascimento. Esses dados pertencem ao lead/contato.
- **Vincular valor:** descrição do serviço, valor previsto em centavos/BRL e agendamento opcional. Não dá baixa nem registra receita ou comissão.

Os dois últimos formulários consultam APIs específicas e só habilitam edição quando o servidor retorna `supported:true` e `canEdit:true`. Sem esses endpoints (404/501), mostram a pendência e não simulam salvamento. Respostas malformadas geram aviso legível. O CPF é validado e exibido com máscara, RG permanece textual e nascimento não aceita futuro.

O formulário de agendamento na página e no pop-up contém o mesmo bloco de dados pessoais/valor. Só envia detalhes quando a agenda anuncia `capabilities.bookingDetails:true`. Se houver detalhes ou vínculo de conversa, exige `bookingDetailsSaved:true` na resposta antes de indicar sucesso. No pop-up, `conversationId` é enviado apenas se o lead selecionado continuar sendo o da conversa. O v0 precisa estender DTO/RPC e transação antes de habilitar a capacidade.

Rascunhos de mensagens permanecem no Inbox ao abrir/fechar os diálogos. Escape fecha o diálogo atual, inclusive quando o cadastro de reserva está dentro do diálogo de agenda; foco retorna ao acionador. Troca de conversa desmonta os campos locais para não misturar cadastros.

Validação da interface: testes Playwright em Chromium com mocks cobrem os atalhos, vínculo de cliente/lead, link externo, reabertura de dados, payload de reserva com valor/vínculo da conversa, Escape, rascunho preservado, largura móvel e estados pendentes. Os testes unitários cobrem CPF/data e conversão monetária. Esses testes não validam persistência Supabase nem RLS autenticada dos endpoints novos, que continuam pendentes para o v0.
