# Configurações

`/app/configuracoes` usa uma coluna lateral de abas: Geral, Calendário de atendimento, Conexão WhatsApp, Webhooks, Equipe, Comissões, Central de faturas, Backup e Banco de dados. Abas têm navegação por teclado (cima/baixo, Home/End), painel identificado e layout adaptável ao celular. Seções futuras exibem estado Em breve sem controles de salvamento ou conexões fictícias.

O Calendário de atendimento foi removido da fila e movido para esta página. Usa o mesmo estado compartilhado do provider: expediente, dias da semana e feriados/exceções, fuso America/Sao_Paulo. Salvar valida horários, pelo menos um dia útil e datas de feriados; aplica a política aos prazos abertos. Descartar repõe a última configuração salva. Claims históricos preservam seu snapshot. Trocar de aba descarta rascunhos não salvos.

Persistência continua somente em memória: navegação interna conserva o calendário; reload restaura o padrão. A fila não muda regras de prazo (10 minutos úteis) nem passa a depender do cliente em contexto.

Validação: 31 testes unitários aprovados. E2E aprovado para calendário inválido, salvar, navegar pela fila, recuperar os valores salvos, alternar abas por teclado e verificar viewport mobile sem overflow. Axe WCAG 2A/AA/2.1AA sem violações; build, lint e TypeScript aprovados. Capturas em `screenshots/settings-calendar.png` e `screenshots/settings-calendar-mobile.png`.
