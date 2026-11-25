import type { FormDefinition, FormStep } from "@/domain/schemas";

export function copyStep(step: FormStep): FormStep {
  return {
    ...step,
    id: crypto.randomUUID(),
    trackingId: step.trackingId ?? step.id,
    actionId: crypto.randomUUID(),
    backActionId: crypto.randomUUID(),
    question: { ...step.question, id: crypto.randomUUID() },
  };
}

export function duplicateForm(
  source: FormDefinition,
  id: string,
  versionId: string,
): FormDefinition {
  const selected = source.versions.find((v) => v.id === source.activeVersionId);
  if (!selected) throw new Error("A versão do formulário está indisponível.");
  const version = structuredClone(selected);
  return {
    id,
    clientId: source.clientId,
    organizationId: source.organizationId,
    doctorId: source.doctorId,
    name: `${source.name} — cópia`,
    slug: `${source.slug}-copia-${id.slice(0, 8)}`,
    description: source.description,
    status: "draft",
    activeVersionId: versionId,
    fields: structuredClone(source.fields),
    versions: [
      {
        ...version,
        id: versionId,
        number: 1,
        formId: id,
        state: "draft",
        steps: version.steps.map(copyStep),
      },
    ],
  };
}
