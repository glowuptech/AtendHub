# ADR 0001 — Fundação e rotas do Prescrita

Status: aceito para C0/C1; revisão humana antes de C2.

## Auditoria

O checkout `/workspace/AtendHub` estava vazio, com `.git`, branch local `work` ainda sem commits, sem package.json, código, schema, workflows ou instruções AGENTS.md. A leitura HTTPS do remoto funcionou e não retornou refs. Nenhum código anterior precisou ser removido ou migrado. O nome do repositório continua AtendHub; o produto implementado é Prescrita.

Foi lido o PDF consolidado de 78 páginas: capa e orientação, base v1.1 (62 páginas) e adendo v1.2 (14 páginas). A cópia está em `docs/blueprint/`. O pedido mestre limita a entrega a C0/C1 e prevalece sobre instruções de implantação operacional no documento.

## Decisões

- App único Next.js App Router, React, TypeScript estrito, Tailwind e componente Button no padrão shadcn/ui com Radix Slot/CVA. Sem monorepo prematuro.
- Rotas pt-BR: `/app/clientes/:clientId/formularios`, `/novo`, `/:formId/editar`, `/preview`, `/analytics`, `/tracking`. Correspondem a clients/forms/new/edit no adendo; nenhuma árvore inglesa paralela. Analytics/tracking mantêm os sufixos técnicos explicitamente pedidos.
- Paleta oficial das seções 93–96 e A.16 substitui a proposta azul/ciano da seção 23. Tokens CSS únicos e mapa de tema tipado. Legal é tipo previsto, tema `null` e opção desativada; não inventar identidade Veredite.
- Domínio genérico, portas de integração, contratos por feature, repositórios mock com escopo explícito. Injeção em DemoProvider. O mock não é autorização/RLS: fixtures são públicas no bundle.
- Repositórios C1 expõem uma fachada de leitura em memória. Em C2, carregar DTOs autenticados em um query cache e preservar a fachada/componentes; comandos assíncronos precisam de pending/error/revalidation no adapter de apresentação. Nenhuma chamada Supabase deve entrar diretamente nas telas.
- A organização e o clientId são verificados nos mocks. Contatos e catálogos separados; reuso explícito de fieldDefinitionId. Rótulos não são chaves. Campos reservados bloqueados.
- Snapshots demonstrativos são imutáveis, mas NÃO são publicações reais. Editar snapshot cria nova versão; duplicar cria IDs próprios de formulário/versão/etapas/perguntas/ações e mantém os vínculos de campo dentro da mesma clínica.
- Uma visita à prévia não cria contato/lead. Respostas só em memória, descartadas ao reiniciar, concluir ou desmontar. O evento form_submitted fica no contrato e nas métricas fictícias, mas não é emitido pelo wizard: não existe transação de submissão em C1.
- A agenda é externa e oficial; example.com é apenas destino de demonstração, sem senha. Portal reduzido sem histórico da Inbox.
- Webpack usado em dev/build: Turbopack falhou ao abrir subprocesso/porta no ambiente gerenciado. Não houve relaxamento de TLS/checksums.

## Limites

Sem endpoints reais, migrations, Auth/RLS, persistência, publicação pública, Evolution, n8n, Pixel/CAPI ou acesso à agenda. Sem IA autônoma, triagem, prontuário e disponibilidade clínica.

C1 exige lint, tipos, testes de domínio, build e navegação demonstrativa. Não substitui o aceite operacional de produção descrito na base v1.1.
