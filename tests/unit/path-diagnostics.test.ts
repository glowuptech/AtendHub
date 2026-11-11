import { describe, expect, it } from "vitest";
import { makePersistedPathForm } from "../editor-harness/path-fixture";
import {
  createPathDiagnosticReport,
  fieldsForVersion,
  routingSnapshot,
} from "@/features/forms/services/path-diagnostics";

describe("diagnóstico de vínculos por ID exato", () => {
  it("compara caminhos, perguntas, destinos e checked sem usar títulos", () => {
    const form = makePersistedPathForm();
    const version = form.versions[0];
    const snapshot = routingSnapshot(
      form.id,
      form.activeVersionId,
      version,
      fieldsForVersion(form, version),
    );

    expect(snapshot.availablePathIds).toEqual(["caminho_a", "caminho_b"]);
    expect(snapshot.questions.map((question) => question.pathIds)).toEqual([
      [],
      ["caminho_a"],
      ["caminho_b"],
      [],
    ]);
    expect(snapshot.optionDestinations.map((option) => option.pathId)).toEqual([
      "caminho_a",
      "caminho_b",
    ]);
    expect(
      snapshot.checkboxComparisons
        .filter((comparison) => comparison.checked)
        .map((comparison) => comparison.pathId),
    ).toEqual(["caminho_a", "caminho_b"]);
    expect(snapshot.orphanedQuestionReferences).toEqual([]);
    expect(snapshot.orphanedOptionReferences).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain(
      "Pergunta com título duplicado",
    );
  });

  it("sinaliza destino órfão sem renomear o valor recebido", () => {
    const form = makePersistedPathForm();
    form.fields[2].options[0].pathId = "path_legacy_generated";
    const snapshot = routingSnapshot(
      form.id,
      form.activeVersionId,
      form.versions[0],
      form.fields,
    );

    expect(snapshot.orphanedOptionReferences).toEqual([
      {
        fieldDefinitionId: form.fields[2].id,
        optionId: form.fields[2].options[0].id,
        pathId: "path_legacy_generated",
      },
    ]);
    expect(form.fields[2].options[0].pathId).toBe("path_legacy_generated");
  });

  it("prefere fields anexados à versão recebida ao reidratar snapshot", () => {
    const form = makePersistedPathForm("snapshot");
    const version = form.versions[0];
    form.fields[2].options[0].pathId = "path_from_other_version";

    const selectedFields = fieldsForVersion(form, version);
    expect(selectedFields[2].options[0].pathId).toBe("caminho_a");

    const report = createPathDiagnosticReport({
      receivedForm: form,
      displayedForm: { ...form, fields: selectedFields },
      events: [],
      lastSave: { status: "não executado" },
    });
    expect(report.received.optionDestinations[0].pathId).toBe(
      "path_from_other_version",
    );
    expect(report.displayed.optionDestinations[0].pathId).toBe("caminho_a");
  });
});
