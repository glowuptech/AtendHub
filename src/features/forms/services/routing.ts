import type {
  CustomFieldDefinition,
  FormVersion,
  FieldValue,
} from "@/domain/schemas";

export function validateRouting(
  version: FormVersion,
  fields: CustomFieldDefinition[],
) {
  const paths = version.paths ?? [];
  const ids = new Set(paths.map((path) => path.id));
  if (
    ids.size !== paths.length ||
    new Set(paths.map((p) => p.letter)).size !== paths.length
  )
    throw new Error("Há caminhos duplicados. Revise o fluxo.");
  for (const step of version.steps)
    for (const id of step.question.pathIds)
      if (!ids.has(id))
        throw new Error("Uma pergunta referencia um caminho inexistente.");
  const routers = version.steps.filter((step) => step.question.definesPath);
  if (routers.length > 1)
    throw new Error("Somente uma pergunta pode definir o caminho.");
  if (!paths.length) {
    if (routers.length)
      throw new Error("Adicione os caminhos da pergunta de roteamento.");
    return;
  }
  if (routers.length !== 1)
    throw new Error("Defina uma pergunta principal de roteamento.");
  const router = routers[0];
  if (router.question.pathIds.length)
    throw new Error("A pergunta de roteamento deve ser comum a todos.");
  if (!router.question.required)
    throw new Error("A pergunta de roteamento deve ser obrigatória.");
  const field = fields.find(
    (item) => item.id === router.question.fieldDefinitionId,
  );
  if (!field || !["single_select", "image_choice"].includes(field.type))
    throw new Error(
      "A pergunta de roteamento deve ser uma seleção única ou por imagens.",
    );
  if (!field.options.length)
    throw new Error("Adicione opções à pergunta que escolhe o caminho.");
  const routerIndex = version.steps.indexOf(router);
  if (
    version.steps.slice(0, routerIndex).some((s) => s.question.pathIds.length)
  )
    throw new Error(
      "Mova a pergunta que escolhe o caminho para antes das perguntas específicas.",
    );
  for (const option of field.options)
    if (!option.pathId || !ids.has(option.pathId))
      throw new Error(
        `A opção “${option.label}” aponta para um caminho inválido.`,
      );
  for (const step of version.steps)
    for (const pathId of step.question.pathIds)
      if (!ids.has(pathId))
        throw new Error("Uma pergunta referencia um caminho inexistente.");
}

export function pathForAnswer(
  version: FormVersion,
  fields: CustomFieldDefinition[],
  answers: Record<string, FieldValue>,
) {
  const router = version.steps.find((step) => step.question.definesPath);
  if (!router) return null;
  const field = fields.find(
    (item) => item.id === router.question.fieldDefinitionId,
  );
  const option = field?.options.find(
    (item) => item.id === answers[router.question.id],
  );
  return option?.pathId ?? null;
}

export function eligibleSteps(
  version: FormVersion,
  fields: CustomFieldDefinition[],
  answers: Record<string, FieldValue>,
) {
  const selectedPath = pathForAnswer(version, fields, answers);
  return version.steps.filter(
    (step) =>
      step.question.pathIds.length === 0 ||
      (!!selectedPath && step.question.pathIds.includes(selectedPath)),
  );
}

/** IDs never depend on the current number of paths: deleting B cannot duplicate C. */
export function addPath(paths: FormVersion["paths"]): FormVersion["paths"] {
  const letter = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    .split("")
    .find((l) => !paths.some((p) => p.letter === l));
  return letter
    ? [
        ...paths,
        {
          id: `path_${crypto.randomUUID().replaceAll("-", "")}`,
          letter,
          name: `Caminho ${letter}`,
        },
      ]
    : paths;
}
export function removePath(
  version: FormVersion,
  fields: CustomFieldDefinition[],
  id: string,
): [FormVersion, CustomFieldDefinition[]] {
  return [
    {
      ...version,
      paths: version.paths.filter((p) => p.id !== id),
      steps: version.steps.map((s) => ({
        ...s,
        question: {
          ...s.question,
          pathIds: s.question.pathIds.filter((p) => p !== id),
        },
      })),
    },
    fields.map((f) => ({
      ...f,
      options: f.options.map((o) =>
        o.pathId === id ? { ...o, pathId: null } : o,
      ),
    })),
  ];
}
export function selectRouter(
  version: FormVersion,
  fields: CustomFieldDefinition[],
  id: string | null,
): [FormVersion, CustomFieldDefinition[]] {
  const target = version.steps.find((s) => s.id === id);
  const field = fields.find((f) => f.id === target?.question.fieldDefinitionId);
  if (
    id &&
    (!target ||
      !field ||
      !["single_select", "image_choice"].includes(field.type))
  )
    throw new Error("Escolha uma pergunta de seleção única ou por imagens.");
  return [
    {
      ...version,
      paths: id ? version.paths : [],
      steps: version.steps.map((s) => ({
        ...s,
        question: {
          ...s.question,
          definesPath: s.id === id,
          pathIds: !id || s.id === id ? [] : s.question.pathIds,
          required: s.id === id ? true : s.question.required,
        },
      })),
    },
    fields.map((f) => ({
      ...f,
      options: f.options.map((o) => ({
        ...o,
        pathId: id ? o.pathId : null,
      })),
    })),
  ];
}

/** Complete missing destinations without changing any existing path IDs or answers. */
export function pathsFromOptions(
  version: FormVersion,
  fields: CustomFieldDefinition[],
): [FormVersion, CustomFieldDefinition[]] {
  const router = version.steps.find((s) => s.question.definesPath);
  const field = fields.find((f) => f.id === router?.question.fieldDefinitionId);
  if (
    !field ||
    !["single_select", "image_choice"].includes(field.type) ||
    !field.options.length
  )
    throw new Error("Adicione opções à pergunta que escolhe o caminho.");
  let paths = [...version.paths];
  const options = field.options.map((option) => {
    if (option.pathId && paths.some((p) => p.id === option.pathId))
      return option;
    const next = addPath(paths);
    if (next.length === paths.length)
      throw new Error(
        "O limite é de 26 caminhos. Revise os caminhos existentes.",
      );
    paths = next;
    const path = paths.at(-1)!;
    path.name =
      option.label.trim().length >= 2
        ? option.label.trim().slice(0, 100)
        : `Caminho ${path.letter}`;
    return { ...option, pathId: path.id };
  });
  return [
    { ...version, paths },
    fields.map((f) => (f.id === field.id ? { ...f, options } : f)),
  ];
}
