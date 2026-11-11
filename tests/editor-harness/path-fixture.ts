import { FormSchema } from "@/domain/schemas";
import { fields, forms } from "@/lib/mocks/fixtures";

export function makePersistedPathForm(state: "draft" | "snapshot" = "draft") {
  const form = structuredClone(forms[0]);
  const version = form.versions[0];
  const router = version.steps.find(
    (step) => step.question.fieldDefinitionId === fields[2].id,
  )!;
  const questionA = version.steps.find(
    (step) => step.question.fieldDefinitionId === fields[0].id,
  )!;
  const questionB = version.steps.find(
    (step) => step.question.fieldDefinitionId === fields[1].id,
  )!;
  const common = version.steps.find(
    (step) => step.question.fieldDefinitionId === fields[3].id,
  )!;
  const pathA = { id: "caminho_a", letter: "A", name: "Caminho A" };
  const pathB = { id: "caminho_b", letter: "B", name: "Caminho B" };

  router.question.definesPath = true;
  router.question.pathIds = [];
  questionA.question.label = "Pergunta com título duplicado";
  questionA.question.pathIds = [pathA.id];
  questionB.question.label = "Pergunta com título duplicado";
  questionB.question.pathIds = [pathB.id];
  common.question.label = "Pergunta comum";
  common.question.pathIds = [];
  version.steps = [router, questionA, questionB, common].map((step, order) => ({
    ...step,
    order,
  }));
  version.paths = [pathA, pathB];
  version.state = state;
  const routerField = structuredClone(fields[2]);
  routerField.options[0].pathId = pathA.id;
  routerField.options[1].pathId = pathB.id;
  form.fields = [
    structuredClone(fields[0]),
    structuredClone(fields[1]),
    routerField,
    structuredClone(fields[3]),
  ];
  form.status = state === "snapshot" ? "demo" : "draft";
  const persisted = FormSchema.parse(form);
  (
    persisted.versions[0] as (typeof persisted.versions)[number] & {
      fields?: typeof persisted.fields;
    }
  ).fields = structuredClone(persisted.fields);
  return persisted;
}
