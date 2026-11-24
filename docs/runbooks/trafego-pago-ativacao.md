# Ativação conjunta do tráfego pago e planejamento AIDA

## Publicação e Supabase

Publique o commit da branch `feature/trafego-pago-aida`. Confirme o projeto Supabase usado pelo Atend&Hub e aplique, nesta ordem, somente as migrations pendentes. O projeto compartilha o banco com outros sistemas e esses arquivos atuam em objetos `atendhub_`.

1. `20261123000000_atendhub_paid_media.sql` cria contas, vínculos, códigos de cliente, catálogo de campanhas/anúncios, métricas diárias, cobertura e planos.
2. `20261123010000_atendhub_paid_attribution.sql` adiciona atribuição do CRM e a regra da primeira mensagem do WhatsApp.
3. `20261123020000_atendhub_paid_media_assistant.sql` cria o histórico interno do assistente.
4. `20261123030000_atendhub_meta_auto_sync.sql` registra as tentativas da sincronização diária nas contas Meta e controla a reserva das tarefas.
5. `20261123040000_atendhub_meta_credentials.sql` adiciona o armazenamento criptografado da credencial Meta por organização. Se as quatro anteriores já foram aplicadas no projeto com timestamps de execução diferentes, aplique somente esta nova migration.

Confirme no histórico as migrations aplicadas e suas permissões. Os objetos novos têm RLS e o navegador acessa as rotas autenticadas do app. O token salvo permanece no servidor.

## Meta Ads em leitura

Confirme que `ATENDHUB_CLIENT_ACCESS_ENCRYPTION_KEY` está presente nas variáveis de servidor e mantenha a chave existente. O painel usa o mesmo cofre de acessos do Atend&Hub. Preview e produção precisam usar a mesma chave quando apontam para o mesmo Supabase. Em **Tráfego pago → Contas vinculadas → Credencial da Meta**, entre como superadministrador e informe um token com `ads_read` e acesso às contas. O Atend&Hub verifica o acesso e grava um token criptografado por organização. Um teste que falhar mantém a credencial anterior. Atualize o token nessa tela sempre que renovar a credencial.

O servidor usa a Graph API `v27.0` para validar, listar contas e sincronizar. `ATENDHUB_META_API_VERSION` é opcional para adotar uma versão da Graph API com versão principal 27 ou posterior. Configurações antigas como `v01.0` usam o padrão do servidor. Se a Meta recusar a consulta, o painel exibe o código e o subcódigo disponíveis.

As instalações com `ATENDHUB_META_ACCESS_TOKEN` e `ATENDHUB_META_ORGANIZATION_ID` no ambiente continuam usando esse token até que a organização salve um pelo painel. O token do painel passa a valer para a listagem e para todas as sincronizações, sem redeploy. As chamadas à Meta usam `me/adaccounts`, informações da conta, catálogo de anúncios com criativo/destino e `insights` por anúncio e dia. Teste com as contas reais depois de vincular cada cliente.

Abra **Tráfego pago → Contas vinculadas** como superadministrador. Consulte a Meta, escolha um cliente e vincule a conta como exclusiva ou compartilhada. Para mudar uma conta exclusiva para compartilhada, atualize a modalidade pelo cliente já vinculado e depois adicione o outro cliente. Use **Sincronizar período** para uma conta por vez, em blocos de até 31 dias. O painel de cobertura mostra quantos dias foram importados. Uma falha antes da publicação preserva o recorte anterior.

Para contas compartilhadas, use o prefixo gerado pelo Atend&Hub no início do nome da campanha, por exemplo `[C12E34F56AB][ACA] WhatsApp | Remarketing`. Em uma conta exclusiva, `[ACA] WhatsApp | Remarketing` é suficiente. Os códigos de etapa são `ATR`, `INT`, `DES` e `ACA`. Use **Campanhas → Revisar classificação** para casos legados ou sem padrão. A associação salva pelo ID da campanha resiste a renomeações. Mudanças explícitas feitas no painel prevalecem na próxima importação. O gasto pendente aparece apenas para a administração no consolidado, sem aparecer em relatórios de clínicas.

### Conferência do primeiro dia fechado

Use uma conta exclusiva e uma compartilhada com pelo menos dois clientes. Compare o mesmo dia, a moeda, o fuso e a configuração de atribuição com o Gerenciador de Anúncios. A soma do investimento das campanhas vinculadas com o investimento pendente deve bater com o total importado, por moeda. Abra o portal com uma conta de cada clínica e confirme seu próprio recorte.

O reporte usa os dias do fuso da conta Meta. Os leads atribuídos no CRM usam o dia de captação em America/Sao_Paulo e os resultados operacionais atuais das oportunidades daquele recorte. Formulários Meta, conversas Meta e oportunidades CRM são métricas diferentes. No CRM, cada oportunidade entra uma vez. Se houver atribuição de formulário e WhatsApp, o formulário tem precedência no painel. Agendamentos cancelados não entram no indicador de oportunidades com agendamento. Qualificação usa `qualified_at`, registrado pela confirmação conforme a regra do Atend&Hub.

Foram mapeados códigos explícitos da API para formulário instantâneo, visita ao perfil e ThruPlay. Conversa iniciada entra como WhatsApp quando o catálogo da Meta identifica o conjunto com destino `WHATSAPP`. Sem a métrica ou destino identificável, a célula apresenta um traço. Valide nomes e disponibilidade das métricas com as contas reais. Criativos exibem a miniatura e o texto quando a Meta fornece esses campos. Moedas diferentes ficam separadas. O Dashboard geral ainda usa o lançamento manual e não soma o mesmo gasto importado pelo hub.

### Indicadores do resumo

O CPL combinado divide o investimento pela soma de formulários instantâneos e conversas de WhatsApp informados pela Meta. A taxa de conversão divide as oportunidades com pelo menos um agendamento não cancelado pelas oportunidades únicas atribuídas no CRM. A visão temporal usa os dados diários já sincronizados.

O resumo consulta alcance, cliques no link, engajamento, gênero, idade e posicionamento diretamente na API da Meta, no período selecionado. CTR usa cliques no link sobre impressões, CPC usa investimento por clique no link e a taxa de engajamento usa engajamentos sobre impressões. Alcance e frequência são exibidos por conta quando há mais de uma conta. Os recortes aplicam o filtro das campanhas do cliente no painel individual e no portal.

O painel administrativo consulta o limite de gastos da conta e calcula o limite restante quando a Meta fornece o limite e o total gasto. Contas compartilhadas exibem valores da conta inteira. O saldo pré-pago está indisponível na integração. Os módulos adicionais usam as migrations de tráfego pago já aplicadas.

### Sincronização diária

Após validar a importação manual, configure um segredo aleatório em `CRON_SECRET` nas variáveis de servidor da Vercel. O `vercel.json` agenda uma execução por dia às 08:00 UTC (05:00 em Brasília), com a precisão do plano da Vercel. No deploy de produção, a Vercel chama `GET /api/cron/meta-sync` com esse segredo. O servidor do Atend&Hub consulta a Meta diretamente com as mesmas credenciais do botão manual. Cada conta vinculada entra uma vez por execução, mesmo quando atende várias clínicas.

Se houver apenas uma organização com token salvo, a rotina usa essa organização automaticamente. Para selecionar uma organização quando houver várias, configure `ATENDHUB_META_ORGANIZATION_ID` uma vez no servidor. A rotina lê a credencial atual a cada execução.

No Preview, use uma conta de teste e chame a rota com o cabeçalho `Authorization: Bearer <CRON_SECRET>` apontando para a URL do Preview. É a mesma rota da execução agendada. Confira a última tentativa em **Tráfego pago → Contas vinculadas**. Um segundo disparo no mesmo dia pula as contas que já concluíram uma tentativa. O retorno informa quantas contas foram importadas, falharam ou já estavam atualizadas por outra importação. Se houver falha, o status da conta mostra o motivo. A rotina tenta novamente no dia seguinte e o botão **Sincronizar período** permite tentar manualmente.

A rotina revisa os sete dias anteriores e atualiza a parcial de hoje no fuso de cada conta. Use o botão manual para buscar outro período ou atualizar a parcial durante o dia. As contas são processadas em lotes de quatro. Se o tempo da função terminar antes de processar todas, a resposta informa o limite e o próximo disparo começa pelas contas há mais tempo sem tentativa. Uma importação mais recente prevalece se o mesmo período for atualizado ao mesmo tempo pelo cron e pelo botão manual.

## Atribuição de formulário e WhatsApp

- **Formulário público Atend&Hub**. Acrescente `meta_campaign_id={{campaign.id}}&meta_ad_id={{ad.id}}` aos parâmetros de URL no nível do anúncio da Meta. O parâmetro estático `meta_campaign_id=<ID>` também funciona. Sincronize e classifique a campanha antecipadamente. A API aceita a atribuição somente se campanha e lead pertencem ao mesmo cliente. A atribuição registra a campanha informada pela URL, sem tratá-la como prova de clique.
- **WhatsApp pela mensagem inicial**. Em **Tráfego pago → Atribuição do WhatsApp**, selecione cliente, número conectado e campanha e salve uma frase exclusiva. A comparação considera a primeira mensagem da oportunidade, ignora maiúsculas e agrupa espaços e pontuação. A mesma frase na mesma linha só pode ter um destino.
- **WhatsApp com referência direta**. Na futura atualização do workflow de entrada, preserve o ID da mensagem retornado pela ingestão e, se a Evolution efetivamente entregou o ID de anúncio da Meta, execute:
  ```sql
  select public.atendhub_attribute_whatsapp_campaign($1::uuid,$2::text) as matched;
  ```
  Passe o `messageId` interno do Atend&Hub e o ID real do anúncio, na ordem. A função verifica a primeira mensagem e a campanha do mesmo cliente. Evidência direta substitui a regra por frase somente para a mesma mensagem. Um ID de clique como `ctwa_clid` não pode ser usado como ID de anúncio. A etapa permanece pronta do lado do banco até o workflow repassar esse campo.

As primeiras agências entram com qualificação interna. A ativação de Pixel e CAPI em produção depende de configuração e validação por cliente e fonte, especialmente quando a origem é de saúde. Este pacote não transmite dados de leads para a Meta. Em especial, não transformar o match por telefone em atribuição de anúncio nem usar parâmetros públicos como sinal verificado.

## Planejamento e assistente

Abra **Planejamento de campanhas**, escolha o cliente, crie o briefing e preencha as quatro etapas. Cada etapa permite orçamento, hipótese, criativo, destino, indicador e campanhas publicadas vinculadas. Salve como rascunho, aprovado ou arquivado. Os valores realizados usam o período salvo e as campanhas selecionadas; o plano não publica anúncios. O relatório identifica valores em cada moeda.

A interface e o histórico por operador/cliente funcionam assim que as migrations forem aplicadas. Para ativar a resposta da IA posteriormente, configure `ATENDHUB_PAID_MEDIA_ASSISTANT_URL` com o webhook HTTPS e, se usar autenticação, `ATENDHUB_PAID_MEDIA_ASSISTANT_TOKEN`. O Atend&Hub envia `paid_media.assistant_requested`, com `id`, cliente, período, modo (`analyze`, `generate`, `improve`), pergunta e contexto. O workflow recebe só o escopo autorizado da clínica, métricas agregadas, metadados de campanhas/anúncios e o briefing escrito pelo operador. O workflow deve observar a cobertura dos dados e devolver hipóteses quando não houver evidência. Evite inserir informações de pacientes no briefing.

O Respond to Webhook deve responder HTTP 200 com objeto JSON da forma:

```json
{
  "answer": "Teste uma abertura em que a médica responda a uma dúvida frequente. Compare o custo por visita ao perfil.",
  "suggestions": {
    "ATR": {
      "hypothesis": "Um vídeo curto com uma dúvida frequente aumenta as visitas ao perfil.",
      "target": "Custo por visita ao perfil"
    }
  }
}
```

`suggestions` é opcional. As chaves aceitas são `ATR`, `INT`, `DES`, `ACA`. Cada etapa pode sugerir `hypothesis`, `creative`, `destination`, `target` e `budgetCents`. O operador revisa antes de aplicar ao seu rascunho. O resultado só entra no plano persistido ao salvar. A biblioteca de aprendizados entre clientes e a publicação automática de campanhas ficam para uma etapa futura.
