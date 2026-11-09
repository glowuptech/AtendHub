import type { CustomFieldDefinition, FormVersion, FieldValue } from "@/domain/schemas";

export function validateRouting(version: FormVersion, fields: CustomFieldDefinition[]) {
  const paths = version.paths ?? [];
  const ids = new Set(paths.map((path) => path.id));
  const routers = version.steps.filter((step) => step.question.definesPath);
  if (routers.length > 1) throw new Error("Somente uma pergunta pode definir o caminho.");
  if (!paths.length) return;
  if (routers.length !== 1) throw new Error("Defina uma pergunta principal de roteamento.");
  const router = routers[0];
  if (router.question.pathIds.length) throw new Error("A pergunta de roteamento deve ser comum a todos.");
  if (!router.question.required) throw new Error("A pergunta de roteamento deve ser obrigatória.");
  const field = fields.find((item) => item.id === router.question.fieldDefinitionId);
  if (!field || !["single_select", "image_choice"].includes(field.type)) throw new Error("A pergunta de roteamento deve ser uma seleção única ou por imagens.");
  for (const option of field.options) if (!option.pathId || !ids.has(option.pathId)) throw new Error(`A opção “${option.label}” aponta para um caminho inválido.`);
  for (const step of version.steps) for (const pathId of step.question.pathIds) if (!ids.has(pathId)) throw new Error("Uma pergunta referencia um caminho inexistente.");
}

export function pathForAnswer(version: FormVersion, fields: CustomFieldDefinition[], answers: Record<string, FieldValue>) {
  const router = version.steps.find((step) => step.question.definesPath);
  if (!router) return null;
  const field = fields.find((item) => item.id === router.question.fieldDefinitionId);
  const option = field?.options.find((item) => item.id === answers[router.question.id]);
  return option?.pathId ?? null;
}

export function eligibleSteps(version: FormVersion, fields: CustomFieldDefinition[], answers: Record<string, FieldValue>) {
  const selectedPath = pathForAnswer(version, fields, answers);
  return version.steps.filter((step) => step.question.pathIds.length === 0 || (!!selectedPath && step.question.pathIds.includes(selectedPath)));
}
