import {
  getVisualTemplate,
  listVisualTemplates,
  validateVisualSpec,
  VISUAL_FAMILY_IDS,
  VISUAL_SCHEMA_VERSION,
  VisualSpec,
} from "..";

describe("visual template registry", () => {
  it("defines one template for every visual family", () => {
    const templates = listVisualTemplates();

    expect(templates).toHaveLength(VISUAL_FAMILY_IDS.length);
    expect(new Set(templates.map((template) => template.templateId)).size).toBe(
      templates.length,
    );
    for (const family of VISUAL_FAMILY_IDS) {
      const template = getVisualTemplate(family);
      expect(template.family).toBe(family);
      expect(template.requiredPrimitives.length).toBeGreaterThan(0);
      expect(template.validationChecks).toContain(
        "student-visible-label-allowlist",
      );
    }
  });

  it("accepts a matching circuit specification", () => {
    const spec: VisualSpec<"circuit_network"> = {
      schemaVersion: VISUAL_SCHEMA_VERSION,
      id: "visual-circuit-1",
      family: "circuit_network",
      templateId: "network.circuit.v1",
      scenarioRef: "scenario-1",
      coordinateSpace: "network",
      payload: {
        nodes: [
          { id: "n1", kind: "terminal" },
          { id: "n2", kind: "terminal" },
        ],
        components: [{ id: "r1", kind: "resistor", terminals: ["n1", "n2"] }],
      },
      visibility: {
        publicParameterIds: ["r1-resistance"],
        privateParameterIds: ["answer-current"],
        labelMode: "allowlist",
        altTextMode: "student-safe",
      },
    };

    expect(validateVisualSpec(spec)).toEqual({ valid: true, issues: [] });
  });

  it("rejects template mismatches and answer-visibility overlap", () => {
    const spec = {
      schemaVersion: VISUAL_SCHEMA_VERSION,
      id: "visual-plot-1",
      family: "cartesian_plot",
      templateId: "network.circuit.v1",
      scenarioRef: "scenario-1",
      coordinateSpace: "network",
      payload: {},
      visibility: {
        publicParameterIds: ["answer"],
        privateParameterIds: ["answer"],
        labelMode: "allowlist",
        altTextMode: "student-safe",
      },
    } as unknown as VisualSpec;

    const result = validateVisualSpec(spec);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "template-family-mismatch",
        "coordinate-space",
        "visibility-overlap",
      ]),
    );
  });
});
