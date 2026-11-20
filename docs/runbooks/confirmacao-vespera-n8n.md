# Lembretes de confirmação pelo n8n

O Atend&Hub prepara uma ocorrência por horário de consulta. O operador escolhe explicitamente o cliente e a instância no workflow. O fluxo requer uma conexão conectada e um atendimento aberto do lead nessa linha. Quando há dois números de destino ativos para o mesmo lead e linha, faça a conciliação antes do envio. A página Confirmações e lembretes permite o registro de contato telefônico mesmo sem WhatsApp.

## Schedule Trigger → Postgres → envio → Postgres

Configure o Schedule Trigger para o horário comercial de envio desejado, no fuso da operação. A seleção de véspera usa o dia civil no fuso da consulta. A rotina pode rodar periodicamente durante a janela escolhida. Use a credencial SQL do papel atendhub_integration no servidor.

1. No nó Postgres, execute com query parameters:
   ```sql
   select public.atendhub_eve_claim($1::uuid, $2::text) as reminder;
   ```
   Parâmetros: UUID do cliente e nome da instância. Se reminder for null, encerre. Caso contrário use requestId, phone, instance e body. O código que identifica a consulta já está no texto. Se a linha suportar botão de resposta rápida, use “Confirmar presença” como rótulo e reminder.replyText como valor de retorno. Na entrada, encaminhe esse valor em p_body somente quando vier do botão efetivamente escolhido pelo contato.
2. Envie o texto pela mesma instância no fluxo de saída da Evolution. Use requestId como chave de idempotência e persista o resultado do provedor em armazenamento durável do workflow. Em timeout incerto, verifique se o provedor aceitou antes de repetir. Uma reserva expira após dez minutos; o identificador continua o mesmo. Uma reserva expirada não é prova de falha do envio.
3. Com o identificador da mensagem e data/hora real do envio (com fuso), confirme:
   ```sql
   select public.atendhub_eve_sent($1::uuid,$2::text,$3::text,$4::timestamptz);
   ```
   Passe requestId, instance, ID do provedor e timestamp do envio. Repetir o ACK do mesmo ID é seguro. Depois do ACK, volte ao passo 1 para a próxima consulta da janela. Registre falhas e concilie resultados incertos no workflow. Cancelar ou remarcar invalida o código anterior; se o envio já estiver em trânsito, a resposta ao código antigo não qualifica.
4. O workflow de entrada continua entregando a mensagem original à RPC atendhub_ingest_whatsapp_message com ID de provedor, instância, JID, corpo e timestamp da mensagem. O paciente pode copiar a expressão CONFIRMO seguida do código. A associação exige a mesma linha e o mesmo telefone. O banco relaciona a resposta ao episódio exato, inclusive quando há duas oportunidades abertas. A qualificação exige também o registro do envio pelo ACK. Respostas vagas continuam no Inbox; a recepção pode telefonar e registrar a confirmação expressa para aquela consulta.

O registro de falta, cancelamento ou remarcação posterior preserva a qualificação adquirida. Esta etapa não envia dados para a Meta.
