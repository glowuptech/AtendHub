# Roteiro C0/C1

1. Abrir `/app`: clínica Ana Luiza — DEMO, três leads fictícios. Alternar Hoje/30 dias/estágio e os estados carregando/vazio/erro. Datas são um recorte fixo de outubro/novembro de 2026, não métricas atuais.
2. Abrir Clínicas → Ana Luiza → Formulários. Ginecologia e Obstetrícia usam explicitamente nome, telefone e período do mesmo catálogo; a quarta pergunta difere. Clínica Horizonte tem catálogo e tema próprios.
3. Editar: novo rascunho preserva snapshot anterior; ajustar título, pergunta, descrição, CTA, ordem e obrigatoriedade. Reutilizar exige confirmação; nova definição exige chave e tipo válidos. Salvar em memória ou congelar snapshot DEMO. Recarregar descarta alterações.
4. Prévia: cinco etapas mobile-first. Usar nome “Pessoa DEMO”, telefone “+5500000000000”, período “Manhã”, resposta administrativa e aceite. Concluir mostra sucesso demonstrativo sem envio/lead/Pixel. Reiniciar limpa valores.
5. CRM → Pessoa Exemplo Alfa/Beta: resumo, campos diferentes, Não informado, origem/versão/pergunta/submissão/data e histórico. Editar valor demonstra proveniência e revisão local.
6. Fila: assumir Alfa atribui Operadora DEMO em memória; segundo claim fica indisponível. Não representa lock transacional real.
7. Inbox: confirmar contexto da clínica antes da resposta de exemplo. Canal desconectado. Botão apenas explica a simulação; mensagens não são enviadas. Agenda DEMO aponta para example.com.
8. Agendamentos: ver espelho fictício, horário America/Sao_Paulo, origem e presença. Portal contém só indicadores e confirmação demonstrativa, sem Inbox.
9. Analytics: 100 sessões, 55 na etapa 3, 38 submissões de exemplo, taxas e abandono estimado. O recorder local da prévia NÃO altera esses agregados. Mensuração mostra Meta desativada.
10. Trocar clínica no cabeçalho: listas e catálogos mudam. Tentar acessar detalhe da outra clínica mostra recurso indisponível. Isto testa coerência do mock, não segurança real.

Sem autenticação: qualquer visitante do ambiente pode inspecionar fixtures. Nunca adicionar dados reais. O portal pode alternar clínicas para revisão visual, sem fingir conta autenticada. Interromper após C1; próximos marcos exigem pedido explícito.
