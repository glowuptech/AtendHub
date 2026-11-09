import {
  ClientSchema,
  FieldSchema,
  FormSchema,
  LeadSchema,
  AppointmentSchema,
  ConversationSchema,
  type CustomFieldDefinition,
  type FieldType,
} from "@/domain/schemas";
export const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const organizationId = uid(1);
export const clientA = uid(10);
export const clientB = uid(20);
export const demoScope = { organizationId, clientIds: [clientA, clientB] };
export const demoNow = "2026-11-03T15:00:00.000Z";
export const clients = [
  ClientSchema.parse({
    id: clientA,
    organizationId,
    name: "Clínica Ana Luiza",
    vertical: "healthcare",
    status: "active",
    branding: "prescrita",
    externalSchedulingUrl: "https://example.com/agenda-demo",
    description: "Atendimento administrativo • Unidade Jardim",
    category: "clinic",
    cnpj: "00000000000000",
    contactName: "Recepção",
    contactEmail: "recepcao@example.com",
    contactPhone: "+5500000000000",
    address: {
      postalCode: "00000000",
      street: "Rua Exemplo",
      number: "100",
      complement: "Sala",
      neighborhood: "Jardim",
      city: "Cidade Exemplo",
      state: "SP",
    },
    partnership: {
      projectStartedOn: "2026-10-01",
      signedOn: "2026-09-28",
      signatureDueOn: "2026-09-30",
      renewsOn: "2026-11-28",
      manager: "Equipe GlowUp",
      notes: "",
    },
    logo: "/logos/ana-demo.svg",
    specialties: ["Ginecologia", "Obstetrícia"],
    doctors: [
      {
        id: uid(41),
        name: "Dra. Exemplo Alfa",
        crm: "000000",
        uf: "SP",
        specialties: ["Ginecologia"],
      },
      {
        id: uid(42),
        name: "Dr. Exemplo Beta",
        crm: "000001",
        uf: "SP",
        specialties: ["Obstetrícia"],
      },
    ],
  }),
  ClientSchema.parse({
    id: clientB,
    organizationId,
    name: "Clínica Horizonte",
    vertical: "healthcare",
    status: "paused",
    branding: "sage",
    externalSchedulingUrl: "https://example.com/agenda-horizonte-demo",
    description: "Atendimento administrativo • Unidade Centro",
    category: "doctor_female",
    cnpj: null,
    partnership: {
      projectStartedOn: "2026-11-01",
      signedOn: null,
      signatureDueOn: "2026-11-08",
      renewsOn: null,
      manager: "Equipe GlowUp",
    },
    logo: "/logos/horizonte-demo.svg",
    specialties: ["Clínica médica"],
    doctors: [
      {
        id: uid(43),
        name: "Dra. Exemplo Gama",
        crm: null,
        uf: "SP",
        specialties: ["Clínica médica"],
      },
    ],
  }),
];
const field = (
  n: number,
  clientId: string,
  key: string,
  label: string,
  type: FieldType,
  options: CustomFieldDefinition["options"] = [],
) =>
  FieldSchema.parse({
    id: uid(n),
    clientId,
    organizationId,
    stableKey: key,
    label,
    type,
    sensitivity: "ordinary",
    options,
  });
export const fields = [
  field(101, clientA, "nome", "Nome completo", "short_text"),
  field(102, clientA, "telefone", "Telefone", "phone"),
  field(103, clientA, "periodo", "Período desejado", "single_select", [
    { id: "morning", label: "Manhã", description: "", imageUrl: "", alt: "", pathId: null },
    { id: "afternoon", label: "Tarde", description: "", imageUrl: "", alt: "", pathId: null },
  ]),
  field(
    104,
    clientA,
    "ciencia_valor",
    "Ciência do valor",
    "boolean",
  ),
  field(105, clientA, "aviso", "Li as informações do formulário", "consent"),
  field(106, clientA, "retorno", "Preferência de retorno", "single_select", [
    { id: "message", label: "Mensagem", description: "", imageUrl: "", alt: "", pathId: null },
    { id: "call", label: "Ligação", description: "", imageUrl: "", alt: "", pathId: null },
  ]),
  field(201, clientB, "nome_horizonte", "Nome completo", "short_text"),
  field(202, clientB, "telefone_horizonte", "Telefone", "phone"),
  field(203, clientB, "unidade", "Unidade de preferência", "single_select", [
    { id: "center", label: "Centro", description: "", imageUrl: "", alt: "", pathId: null },
    { id: "north", label: "Norte", description: "", imageUrl: "", alt: "", pathId: null },
  ]),
  field(204, clientB, "dia", "Dia preferido", "date"),
  field(
    205,
    clientB,
    "aviso_horizonte",
    "Li as informações do formulário",
    "consent",
  ),
];
function form(
  n: number,
  clientId: string,
  name: string,
  slug: string,
  fieldIds: number[],
) {
  const id = uid(n),
    versionId = uid(n + 10);
  return FormSchema.parse({
    id,
    clientId,
    organizationId,
    name,
    slug,
    doctorId: uid(n === 300 ? 41 : n === 400 ? 42 : 43),
    status: "demo",
    activeVersionId: versionId,
    versions: [
      {
        id: versionId,
        clientId,
        organizationId,
        formId: id,
        number: 1,
        state: "snapshot",
        theme: clientId === clientA ? "prescrita" : "sage",
        destination: "demo_success",
        successMessage:
          "Simulação concluída. Nenhum dado foi enviado e nenhum lead foi criado.",
        steps: fieldIds.map((f, i) => ({
          id: uid(n * 100 + i),
          order: i,
          title: fields.find((x) => x.id === uid(f))!.label,
          description:
            i === 0
              ? "Confira suas informações antes de continuar."
              : "Informação administrativa",
          buttonLabel: i === 4 ? "Concluir" : "Continuar",
          actionId: uid(n * 100 + i + 10),
          backActionId: uid(n * 100 + i + 20),
          question: {
            id: uid(n * 100 + i + 30),
            fieldDefinitionId: uid(f),
            label: fields.find((x) => x.id === uid(f))!.label,
            required: i !== 3,
          },
        })),
      },
    ],
  });
}
export const forms = [
  form(
    300,
    clientA,
    "Ginecologia — agendamento",
    "ana-luiza-ginecologia-demo",
    [101, 102, 103, 104, 105],
  ),
  form(
    400,
    clientA,
    "Obstetrícia — agendamento",
    "ana-luiza-obstetricia-demo",
    [101, 102, 103, 106, 105],
  ),
  form(
    500,
    clientB,
    "Atendimento — agendamento",
    "horizonte-demo",
    [201, 202, 203, 204, 205],
  ),
];
export const leads = [0, 1, 2, 3].map((i) => {
  const f = forms[i === 3 ? 2 : i % 2],
    v = f.versions[0];
  return LeadSchema.parse({
    id: uid(600 + i),
    organizationId,
    clientId: f.clientId,
    contactId: uid(700 + i),
    doctorId: f.doctorId,
    firstResponseAt:
      i === 0
        ? null
        : i === 1
          ? "2026-10-30T13:12:00.000Z"
          : "2026-11-03T15:06:00.000Z",
    handlingMinutes: i === 0 ? null : i === 1 ? 18 : 10,
    name: `Pessoa Exemplo ${["Alfa", "Beta", "Gama", "Delta"][i]}`,
    stage: ["new", "in_progress", "scheduled", "scheduled"][i],
    owner: i === 0 ? null : "Operadora",
    formId: f.id,
    versionId: v.id,
    createdAt: i === 1 ? "2026-10-30T13:00:00.000Z" : demoNow,
    minutesSinceContact: [18, 42, 5, 23][i],
    nextAction: [
      "Iniciar atendimento",
      "Confirmar período",
      "Aguardar presença informada",
      "Aguardar presença informada",
    ][i],
    source: "Formulário nativo • campanha",
    fields: v.steps.map((s, j) => ({
      fieldDefinitionId: s.question.fieldDefinitionId,
      questionId: s.question.id,
      submissionId: uid(800 + i),
      value:
        j === 0
          ? `Pessoa Exemplo ${i + 1}`
          : j === 1
            ? "+5500000000000"
            : j === 2
              ? i === 3
                ? "center"
                : "morning"
              : j === 3
                ? null
                : true,
      capturedAt: demoNow,
      actor: "Formulário · v1",
    })),
    history: [
      {
        id: uid(900 + i),
        label: "Resposta recebida · versão 1",
        at: demoNow,
      },
    ],
  });
});
export const appointments = [
  AppointmentSchema.parse({
    id: uid(1001),
    organizationId,
    clientId: clientA,
    leadId: uid(602),
    name: "Pessoa Exemplo Gama",
    scheduledAt: "2026-11-03T14:00:00.000Z",
    source: "Registro manual",
    attendance: "unknown",
  }),
  AppointmentSchema.parse({
    id: uid(1002),
    organizationId,
    clientId: clientB,
    leadId: uid(603),
    name: "Pessoa Exemplo Delta",
    scheduledAt: "2026-11-04T17:00:00.000Z",
    source: "Registro manual",
    attendance: "unknown",
  }),
];
export const conversations = leads.map((l, i) =>
  ConversationSchema.parse({
    id: uid(1100 + i),
    organizationId,
    clientId: l.clientId,
    leadId: l.id,
    name: l.name,
    owner: l.owner,
    connection: "disconnected",
    messages: [
      {
        id: uid(1200 + i),
        direction: "inbound",
        body: "Olá! Gostaria de informações sobre o agendamento.",
        at: demoNow,
        status: "simulated",
      },
      {
        id: uid(1300 + i),
        direction: "outbound",
        body: "Olá! Podemos ajudar com as informações administrativas da clínica. [Exemplo de atendimento humano]",
        at: demoNow,
        status: "simulated",
      },
    ],
  }),
);
