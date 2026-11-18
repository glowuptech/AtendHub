# Prompt para o v0 — persistir dados pessoais e valores do atendimento

Implemente a persistência real dos campos que já foram preparados na interface do Atend&Hub. Primeiro sincronize o commit mais recente de `origin/main`; preserve as alterações recentes do v0 e os atalhos do Inbox. Leia este documento inteiro e inspecione as migrations, APIs, permissões, testes e o runbook atuais antes de alterar qualquer objeto.

## O que já está pronto e deve ser reutilizado

- `src/features/inbox/components/chat-shortcuts.tsx`: Agendar, Agenda externa, Abrir lead e campos, Adicionar informações e Vincular valor no cabeçalho da conversa.
- Agendar abre `WeeklyWorkspace`, a mesma agenda persistida da página de Agendamentos, com `clientId` fixado no cliente da conversa e `initialLeadId` pré-selecionado. Não muda a seleção global do Workspace.
- Agenda externa usa o endpoint real `/api/clients/[clientId]/scheduling`, valida HTTPS e abre o link em outra aba.
- A ficha abre `PersistedLeadDetail` real em um diálogo. Não substituir por modal legado que usa repositório demo.
- `src/features/leads/registration/` (`model.ts`, `hooks.ts`, `fields.tsx`, `form.tsx`): formulário compartilhado de nome completo, CPF, RG e nascimento.
- `src/features/inbox/components/conversation-value.tsx`: serviço, valor previsto em centavos e vínculo opcional a um agendamento.
- `src/features/appointments/components/booking-details.tsx`: esses mesmos campos no formulário de agendamento, tanto na página quanto no pop-up.
- Os endpoints novos ainda não existem. A UI reconhece 404/501, informa a pendência e bloqueia o salvamento. Isso é proposital: ativar somente quando houver persistência real.
- `tests/editor-harness/inbox-shortcuts.spec.ts` valida os componentes com respostas simuladas. Esses testes não comprovam Supabase/RLS.

Não refaça o layout nem crie uma segunda implementação de agenda/cadastro. Complete estes contratos e valide o fluxo com banco real.

## 1. Modelagem incremental

O cliente do sistema é a clínica/profissional/empresa contratante. CPF, RG, nome completo e nascimento pertencem ao LEAD/CONTATO atendido, não ao cadastro empresarial do cliente. Não misture `atendhub_clients.name` com nome completo do paciente. Mantenha o nome de exibição atual do lead.

Inspecione o modelo existente e escolha entre colunas próprias em `atendhub_leads` ou tabela `atendhub_lead_registration`, sem fontes duplicadas. Persistir full name, CPF normalizado com 11 dígitos, RG como texto e nascimento como DATE; campos opcionais, nulos no banco quando ausentes. UI recebe strings vazias para ausências. Não exigir CPF globalmente nem considerar que todo lead é paciente: o sistema atende outros segmentos. Não adicionar conteúdo clínico nesta etapa.

Todos os objetos novos devem ter prefixo `atendhub_`. Usar migrations incrementais, índices e FKs que garantam organização/cliente/lead coerentes; não alterar tabelas legadas de outros projetos. Não fazer backfill de nomes presumidos e não usar CPF globalmente único para bloquear pessoas em outros clientes.

Para valores, primeiro inspecione a estrutura financeira real. A mensalidade comercial cobrada pela agência ao cliente NÃO é o valor da consulta. Crie/reutilize uma entidade de valor previsto do serviço, com organização, cliente, lead, conversa, agendamento opcional, descrição, `amount_cents` inteiro nullable, moeda BRL, autoria e timestamps. Ausência difere de zero. Defina uma única fonte de valor por serviço agendado: ao vincular conversa e agendamento, ambos devem referenciar o mesmo registro ou atualizar uma referência canônica, sem duplicar previsão financeira. Não assumir que um lead só terá um agendamento na vida.

A UI de conversa atual edita a referência de serviço corrente. Preserve registros anteriores quando houver múltiplos serviços/agendamentos e documente como a referência corrente é escolhida. Não sobrescreva silenciosamente o valor de outra consulta.

## 2. API de dados pessoais — contrato exato

`GET /api/leads/:leadId/registration`, com sessão e escopo autorizado:

```json
{
  "supported": true,
  "canEdit": true,
  "data": { "fullName": "", "cpf": "", "rg": "", "birthDate": "" }
}
```

`PATCH` na mesma URL recebe o objeto de `data` diretamente, sem envelope:

```json
{
  "fullName": "Nome completo",
  "cpf": "52998224725",
  "rg": "RG de exemplo",
  "birthDate": "1990-05-20"
}
```

Responder o envelope completo de GET, lido após a gravação efetiva. Usuário com consulta e sem edição recebe `canEdit:false`; mutação proibida retorna 403. Validar no servidor o mesmo contrato de `registrationSchema`: CPF com dígitos verificadores, RG textual até 30 caracteres, nome até 160 e nascimento ISO válido sem futuro, considerando America/Sao_Paulo. Não retornar erros Zod serializados na tela. Permitir limpar campos opcionais explicitamente.

## 3. API do valor da conversa — contrato exato

`GET /api/inbox/conversations/:conversationId/value`:

```json
{
  "supported": true,
  "canEdit": true,
  "value": null,
  "appointments": [
    { "id": "UUID real", "label": "Consulta · data/hora e profissional" }
  ]
}
```

`value`, quando existir:

```json
{
  "description": "Consulta ginecológica",
  "amountCents": 35000,
  "currency": "BRL",
  "appointmentId": null
}
```

`PATCH` recebe esse objeto de valor diretamente. `appointmentId` aceita UUID ou null. GET/PATCH retornam sempre o envelope completo com `appointments`, inclusive array vazio. A lista inclui somente agendamentos deste mesmo lead, cliente e organização; valide isso no servidor e no banco. Não confiar em IDs recebidos do navegador. Atualização deve ser idempotente para o mesmo vínculo; não criar novo lançamento financeiro a cada clique. Responder somente após commit e leitura do valor persistido.

Valor é PREVISÃO do serviço. Não dar baixa, criar recebimento, faturar ou calcular comissão automaticamente. Integre às regras financeiras já existentes apenas onde há semântica definida e dados persistidos, usando referência estável para evitar dupla contagem. Se o financeiro ainda for demo ou não tiver contrato definido, documente a limitação e mantenha a previsão real disponível sem inventar lançamentos.

## 4. Agendamento compartilhado e transação

A API atual `POST /api/clients/:clientId/appointments` já usa sessão, `Idempotency-Key`, RPC `atendhub_create_appointment`, disponibilidade e proteção contra sobreposição. Hoje seu schema Zod remove propriedades desconhecidas: aceitar novos campos apenas no front faria desaparecer os dados silenciosamente. Atualize DTO, RPC, mapeadores e leituras em conjunto.

Estender o body existente com campos opcionais:

```json
{
  "conversationId": "UUID da conversa (opcional, fornecido pelo pop-up do Inbox)",
  "professionalId": "UUID real",
  "leadId": "UUID real",
  "day": "2026-12-15",
  "time": "09:30",
  "duration": 30,
  "notes": "",
  "personalData": {
    "fullName": "Nome completo",
    "cpf": "52998224725",
    "rg": "",
    "birthDate": "1990-05-20"
  },
  "service": {
    "description": "Consulta",
    "amountCents": 35000,
    "currency": "BRL"
  }
}
```

Validar o `conversationId` opcional contra o mesmo lead/cliente/organização; ele identifica a origem da reserva e permite vincular a previsão existente sem escolher uma conversa arbitrária. O pop-up só o envia quando o lead selecionado continua sendo o da conversa e a capacidade está ativa.

Salvar reserva, vínculo de conversa, alterações pessoais enviadas e valor em UMA transação. Falha em qualquer parte deve desfazer tudo. Ausência de `personalData` ou `service` preserva o cadastro existente. Não aceitar sobrescritas silenciosas por mudanças concorrentes: adotar versionamento/conflito quando aplicável e mostrar mensagem de atualização necessária.

Preservar os testes existentes de duplicidade, idempotência, reenvio, conflito de horários e permissões. Incluir os detalhes novos na identidade do payload de idempotência; mesma chave com conteúdo diferente deve retornar conflito.

Somente quando toda a transação estiver implementada, `GET /api/clients/:clientId/agenda` deve incluir `capabilities:{bookingDetails:true}`. A interface mantém os campos desativados se a capacidade estiver ausente/falsa. `POST` com detalhes deve devolver, além dos campos atuais, `bookingDetailsSaved:true` somente depois do commit integral. O front já exige esse reconhecimento; não ativar capacidade sem ele.

A lista `appointments` da agenda deve incluir `service:{description,amountCents,currency:"BRL"}` quando houver, para o detalhe mostrar o valor persistido. Atualizar também os leitores relacionados ao calendário/agenda sem usar fixtures. Dados pessoais existentes devem reaparecer no pop-up de agendamento via endpoint de registration.

## 5. Acesso, RLS e dados pessoais

Aplicar sessão, organização e autorização por cliente a todos os endpoints e tabelas. Definir consulta/edição com as permissões reais existentes; ser responsável pelo lead não pode conceder acesso a outro cliente/organização. Manter a regra de envio do Inbox separada da permissão de editar cadastros e valores. API e RLS precisam concordar. Não usar Service Role para contornar autorização nas rotas de usuário.

CPF, RG e nascimento não devem ser expostos por padrão no contexto da IA, webhooks, URL, analytics, logs, eventos de histórico nem exportação genérica. Auditoria registra ator, recurso, data e nomes de campos alterados, sem copiar documentos pessoais. Retornar somente a contas autorizadas por esses endpoints específicos. Não usar localStorage para persistir esses dados na aplicação real.

## 6. Validação obrigatória e entrega

- Criar, editar, limpar e reabrir dados pessoais; reload com nova leitura do banco; CPF inválido e data futura com mensagem legível.
- Criar agendamento com dados pessoais e valor pela página e pelo pop-up; mesmos dados nas duas telas e depois de reload.
- Repetir a requisição com mesma chave sem duplicar reserva/valor; mudar payload com mesma chave retorna conflito.
- Forçar falha de cadastro/valor e comprovar rollback da reserva.
- Vincular valor a reserva existente e verificar uma única referência financeira; rejeitar agendamento de outro lead/cliente.
- Provar que 350,00 é 35000 centavos, vazio continua null e zero continua zero; sem recebimento ou comissão automática.
- Testar leitura/edição com conta autorizada, conta somente leitura e outra organização. Sem sessão: 401. Escopo inválido: negar sem expor documentos.
- Manter atalhos com a conversa correta, sem troca global de Workspace nem envio acidental de mensagem. Fechar pop-ups preserva rascunho da conversa.
- Executar typecheck, lint, testes e build. Testes simulados complementam os testes autenticados reais, não os substituem. Se a sessão de teste estiver indisponível, declarar o que não foi validado.

Aplicar migration apenas no projeto Supabase correto, registrar pelo mecanismo normal do projeto, atualizar runbook, informar objetos alterados, testes e limitações. Sincronizar o commit na branch efetivamente usada pelo Preview e informar SHA/branch. Não declarar ativado só porque o build passou: validar POST, GET e reabertura do registro real.
