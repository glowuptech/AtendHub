import { describe, it, expect } from "vitest";
import { forms, fields } from "@/lib/mocks/fixtures";
import { PathSchema } from "@/domain/schemas";
import {
  addPath,
  removePath,
  selectRouter,
  validateRouting,
  eligibleSteps,
} from "@/features/forms/services/routing";
function setup() {
  const version = structuredClone(forms[0].versions[0]);
  const defs = structuredClone(fields);
  const router = version.steps.find(
    (s) =>
      defs.find((f) => f.id === s.question.fieldDefinitionId)?.type ===
      "single_select",
  )!;
  const index = version.steps.indexOf(router);
  version.steps = [router, ...version.steps.filter((_, i) => i !== index)];
  version.paths = addPath(addPath([]));
  const [v, f] = selectRouter(version, defs, router.id);
  const field = f.find((f) => f.id === router.question.fieldDefinitionId)!;
  field.options = field.options
    .slice(0, 2)
    .map((o, i) => ({ ...o, pathId: v.paths[i].id }));
  v.steps[1].question.pathIds = [v.paths[0].id];
  v.steps[2].question.pathIds = [v.paths[1].id];
  return { version: v, fields: f, router, field };
}
describe("Fluxo do editor", () => {
  it("usa IDs válidos e únicos ao excluir e recriar caminhos", () => {
    let paths = addPath(addPath(addPath([])));
    const oldId = paths[1].id;
    paths = addPath(paths.filter((p) => p.id !== oldId));
    expect(new Set(paths.map((p) => p.id)).size).toBe(3);
    expect(new Set(paths.map((p) => p.letter)).size).toBe(3);
    expect(paths.some((p) => p.id === oldId)).toBe(false);
    paths.forEach((p) => expect(PathSchema.safeParse(p).success).toBe(true));
  });
  it("um único seletor define o caminho e mantém cada percurso", () => {
    const { version, fields, router, field } = setup();
    expect(() => validateRouting(version, fields)).not.toThrow();
    const a = eligibleSteps(version, fields, {
      [router.question.id]: field.options[0].id,
    });
    const b = eligibleSteps(version, fields, {
      [router.question.id]: field.options[1].id,
    });
    expect(a.map((s) => s.id)).toContain(version.steps[1].id);
    expect(a.map((s) => s.id)).not.toContain(version.steps[2].id);
    expect(b.map((s) => s.id)).toContain(version.steps[2].id);
    const [linear, defs] = selectRouter(version, fields, null);
    expect(linear.paths).toEqual([]);
    expect(eligibleSteps(linear, defs, {})).toHaveLength(version.steps.length);
    expect(() => validateRouting(linear, defs)).not.toThrow();
  });
  it("excluir caminho remove vínculos sem excluir perguntas ou IDs", () => {
    const { version, fields, field } = setup();
    const [v, f] = removePath(version, fields, version.paths[0].id);
    expect(v.steps.map((s) => s.id)).toEqual(version.steps.map((s) => s.id));
    expect(v.steps[1].question.pathIds).toEqual([]);
    expect(f.find((x) => x.id === field.id)!.options[0].pathId).toBeNull();
    expect(() => validateRouting(v, f)).toThrow("inválido");
  });
  it("bloqueia publicação com pergunta específica antes do seletor", () => {
    const { version, fields } = setup();
    [version.steps[0], version.steps[1]] = [version.steps[1], version.steps[0]];
    expect(() => validateRouting(version, fields)).toThrow("antes");
  });
  it("recusa referências órfãs mesmo sem caminhos cadastrados", () => {
    const { version, fields } = setup();
    version.paths = [];
    expect(() => validateRouting(version, fields)).toThrow("inexistente");
  });
});
