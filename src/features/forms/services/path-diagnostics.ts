import type {
  CustomFieldDefinition,
  FormDefinition,
  FormVersion,
} from "@/domain/schemas";

type DiagnosticVersion = Pick<
  FormVersion,
  "id" | "number" | "state" | "paths" | "steps"
>;
type DiagnosticFields = Pick<CustomFieldDefinition, "id" | "options">[];

export function fieldsForVersion(
  form: FormDefinition,
  version: FormVersion,
): CustomFieldDefinition[] {
  const fields = (version as FormVersion & { fields?: CustomFieldDefinition[] })
    .fields;
  return structuredClone(fields ?? form.fields);
}

export function routingSnapshot(
  formId: string,
  activeVersionId: string | null,
  version: DiagnosticVersion | undefined,
  fields: DiagnosticFields,
) {
  const paths = version?.paths ?? [];
  const pathIds = new Set(paths.map((path) => path.id));
  const questions = (version?.steps ?? []).map((step) => ({
    stepId: step.id,
    questionId: step.question.id,
    fieldDefinitionId: step.question.fieldDefinitionId,
    pathIds: [...step.question.pathIds],
  }));
  const optionDestinations = fields.flatMap((field) =>
    field.options.map((option) => ({
      fieldDefinitionId: field.id,
      optionId: option.id,
      pathId: option.pathId,
    })),
  );
  const questionReferences = questions.flatMap((question) =>
    question.pathIds
      .filter((pathId) => !pathIds.has(pathId))
      .map((pathId) => ({
        stepId: question.stepId,
        questionId: question.questionId,
        pathId,
      })),
  );
  const optionReferences = optionDestinations
    .filter((option) => option.pathId && !pathIds.has(option.pathId))
    .map((option) => ({
      fieldDefinitionId: option.fieldDefinitionId,
      optionId: option.optionId,
      pathId: option.pathId,
    }));

  return {
    formId,
    activeVersionId,
    displayedVersion: version
      ? { id: version.id, number: version.number, state: version.state }
      : null,
    questions,
    availablePathIds: paths.map((path) => path.id),
    optionDestinations,
    checkboxComparisons: questions.flatMap((question) =>
      paths.map((path) => ({
        stepId: question.stepId,
        questionId: question.questionId,
        pathId: path.id,
        checked: question.pathIds.includes(path.id),
      })),
    ),
    orphanedQuestionReferences: questionReferences,
    orphanedOptionReferences: optionReferences,
    missingFieldDefinitionIds: questions
      .map((question) => question.fieldDefinitionId)
      .filter(
        (id, index, all) =>
          !fields.some((field) => field.id === id) && all.indexOf(id) === index,
      ),
  };
}

export type PathDiagnosticEvent = {
  point: "A" | "B" | "C" | "D" | "E" | "F";
  label: string;
  details: unknown;
};

export function createPathDiagnosticReport(input: {
  receivedForm?: FormDefinition;
  displayedForm: FormDefinition;
  receivedActiveVersionId?: string;
  receivedVersion?: DiagnosticVersion;
  initialization?: unknown;
  events: PathDiagnosticEvent[];
  lastSave: unknown;
}) {
  const displayedVersion = input.displayedForm.versions.find(
    (version) => version.id === input.displayedForm.activeVersionId,
  );
  const receivedVersion =
    input.receivedVersion ??
    input.receivedForm?.versions.find(
      (version) => version.id === input.receivedForm?.activeVersionId,
    );
  return {
    received: routingSnapshot(
      input.receivedForm?.id ?? input.displayedForm.id,
      input.receivedActiveVersionId ??
        input.receivedForm?.activeVersionId ??
        null,
      receivedVersion,
      input.receivedForm?.fields ?? [],
    ),
    displayed: routingSnapshot(
      input.displayedForm.id,
      input.displayedForm.activeVersionId,
      displayedVersion,
      input.displayedForm.fields,
    ),
    initialization: input.initialization ?? null,
    lastSave: input.lastSave,
    events: input.events,
  };
}
