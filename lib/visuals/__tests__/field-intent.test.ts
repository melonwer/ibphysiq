import {
  FIELD_INTENT_JSON_SCHEMA,
  FIELD_SOURCE_FIXTURES,
  FieldIntent,
  compileFieldIntent,
  validateFieldIntent,
} from "../index";
import { renderFieldMap } from "../render-field-map";

describe("coordinate-free field intent", () => {
  const spatialFixtures = FIELD_SOURCE_FIXTURES.filter(
    (fixture) => fixture.intent && fixture.spec,
  );
  it("contains eight distinct, balanced source fixtures", () => {
    expect(FIELD_SOURCE_FIXTURES).toHaveLength(8);
    expect(
      new Set(FIELD_SOURCE_FIXTURES.map((item) => item.sourceQuestionId)).size,
    ).toBe(8);
    expect(
      FIELD_SOURCE_FIXTURES.filter((item) => item.paper === "1A"),
    ).toHaveLength(4);
    expect(
      FIELD_SOURCE_FIXTURES.filter((item) => item.paper === "2"),
    ).toHaveLength(4);
    expect(
      FIELD_SOURCE_FIXTURES.filter(
        (item) => item.sourceVisualKind === "plot-only",
      ).map((item) => item.id),
    ).toEqual([
      "may26-tz1-hl-2-q9-nuclear-potential",
      "nov25-tz1-hl-2-q5-gravitational-potential",
    ]);
  });

  it.each(spatialFixtures)(
    "validates, compiles, and renders deterministically: $id",
    (fixture) => {
      expect(validateFieldIntent(fixture.intent!)).toEqual({
        valid: true,
        issues: [],
      });
      const compiled = compileFieldIntent(fixture.intent!);
      const svg = renderFieldMap(compiled);
      expect(svg).toBe(renderFieldMap(compileFieldIntent(fixture.intent!)));
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      for (const privateId of compiled.visibility.privateParameterIds)
        expect(svg).not.toContain(privateId);
      expect(fixture.trainingEligibility).toBe("blocked");
    },
  );

  it("keeps coordinates and drawing code out of model-facing intent", () => {
    const serialized = JSON.stringify(
      FIELD_SOURCE_FIXTURES.map((item) => item.intent),
    );
    const schema = JSON.stringify(FIELD_INTENT_JSON_SCHEMA);
    expect(serialized).not.toMatch(/"x"\s*:|"y"\s*:|<svg|<path|nodePositions/);
    expect(schema).not.toMatch(/"x"\s*:|"y"\s*:|nodePositions|<svg/);
    expect(FIELD_INTENT_JSON_SCHEMA.properties.dimensions).toEqual({
      $ref: "#/$defs/dimensions",
    });
    expect(FIELD_INTENT_JSON_SCHEMA.$defs.dimensions).toMatchObject({
      additionalProperties: false,
    });
    expect(FIELD_INTENT_JSON_SCHEMA.$defs.panel).toMatchObject({
      additionalProperties: false,
    });
  });

  it("compiles the field-line source into a genuine 2×2 panel grid", () => {
    const fixture = FIELD_SOURCE_FIXTURES.find((item) =>
      item.id.includes("field-line-options"),
    )!;
    const spec = compileFieldIntent(fixture.intent!);
    expect(spec.composition).toMatchObject({
      kind: "panel-grid",
      columns: 2,
      panelLabels: ["A", "B", "C", "D"],
    });
    expect(spec.layers).toHaveLength(3);
    const counts = [
      spec.payload,
      ...spec.layers!.map((layer) =>
        layer.family === "field_map"
          ? layer.payload
          : { entities: [], paths: [] },
      ),
    ].map(
      (payload) =>
        payload.paths.filter((path) => path.kind === "field-line").length,
    );
    expect(counts[3]).toBeGreaterThan(counts[0]);
    expect(
      fixture.intent?.templateId === "two-charge-field-lines.v1"
        ? fixture.intent.panels.map((panel) => panel.variant)
        : [],
    ).toEqual([
      "equal-density",
      "flat-separatrix",
      "inverted-null",
      "strength-weighted",
    ]);
  });

  it("preserves source-specific linear and equipotential presentation", () => {
    const byId = (needle: string) =>
      FIELD_SOURCE_FIXTURES.find((item) => item.id.includes(needle))!.spec!;

    const charges = byId("field-superposition").payload;
    expect(charges.paths.find((path) => path.id === "baseline")).toMatchObject({
      lineStyle: "solid",
    });
    expect(charges.paths.some((path) => path.label === "3x")).toBe(false);
    expect(
      charges.entities.find((item) => item.id === "point-p"),
    ).toMatchObject({ appearance: "cross", labelPlacement: "above" });

    const planets = byId("zero-field-mass-ratio").payload;
    expect(
      planets.paths.filter((path) => path.id.startsWith("dimension-extension")),
    ).toHaveLength(3);
    expect(planets.paths.find((path) => path.label === "R")).toMatchObject({
      labelAt: "middle",
    });

    const equipotentials = byId("equipotential-gradient").payload;
    expect(equipotentials.annotations?.map((item) => item.label)).toEqual([
      "−5 MJ kg⁻¹",
      "−3 MJ kg⁻¹",
      "−1 MJ kg⁻¹",
    ]);
    expect(
      equipotentials.paths
        .filter((path) => path.kind === "dimension")
        .every((path) => path.points.every((point) => point.y < 0.3)),
    ).toBe(true);

    const coordinateDiagram = byId("two-charge-field").payload;
    expect(coordinateDiagram.paths.map((path) => path.id)).toEqual(
      expect.arrayContaining(["baseline", "vertical-axis", "total"]),
    );
    expect(
      coordinateDiagram.entities.every((item) => item.appearance === "dot"),
    ).toBe(true);
  });

  it("rejects private labels and vectors that leave the normalized canvas", () => {
    const privateLabel = structuredClone(FIELD_SOURCE_FIXTURES[0].spec!);
    privateLabel.visibility.publicParameterIds =
      privateLabel.visibility.publicParameterIds.filter(
        (id) => id !== privateLabel.payload.entities[0].labelParameterId,
      );
    expect(() => renderFieldMap(privateLabel)).toThrow(
      "Field label is not student-visible",
    );

    const outOfBounds = structuredClone(FIELD_SOURCE_FIXTURES[0].spec!);
    outOfBounds.payload.vectors = [
      {
        id: "bad-vector",
        origin: { x: 0.8, y: 0.5 },
        direction: { x: 0.4, y: 0 },
      },
    ];
    expect(() => renderFieldMap(outOfBounds)).toThrow(
      "Invalid normalized field point: vectors.bad-vector.end",
    );
  });

  it("rejects unsupported negative-source field-line option grids", () => {
    const fieldLines = structuredClone(
      FIELD_SOURCE_FIXTURES.find((item) =>
        item.id.includes("field-line-options"),
      )!.intent!,
    );
    if (fieldLines.templateId !== "two-charge-field-lines.v1")
      throw new Error("unexpected fixture");
    fieldLines.sources[0].sign = -1;
    expect(validateFieldIntent(fieldLines).issues).toEqual([
      "two-charge field-line v0.1 supports positive sources only",
    ]);
  });

  it.each([
    {
      name: "raw coordinates",
      mutate: (intent: FieldIntent) => Object.assign(intent, { x: 0.4 }),
      issue: "intent.x is not supported",
    },
    {
      name: "missing charge sign",
      mutate: (intent: FieldIntent) => {
        if (intent.templateId !== "linear-sources.v1")
          throw new Error("unexpected fixture");
        delete intent.sources[0].sign;
      },
      issue: "intent.sources[0].sign is required for a point charge",
    },
    {
      name: "source singular marker placement",
      mutate: (intent: FieldIntent) => {
        if (
          intent.templateId !== "linear-sources.v1" ||
          !intent.marker ||
          intent.marker.placement.kind !== "between"
        )
          throw new Error("unexpected fixture");
        intent.marker.placement.fractionFromLeft = 0;
      },
      issue: "marker fraction must lie strictly between zero and one",
    },
    {
      name: "renderer-specific dimension keys",
      mutate: (intent: FieldIntent) => {
        if (intent.templateId !== "linear-sources.v1" || !intent.dimensions)
          throw new Error("unexpected fixture");
        Object.assign(intent.dimensions, { pixelWidth: 320 });
      },
      issue: "intent.dimensions.pixelWidth is not supported",
    },
  ])("rejects $name", ({ mutate, issue }) => {
    const intent = structuredClone(FIELD_SOURCE_FIXTURES[0].intent!);
    mutate(intent);
    expect(validateFieldIntent(intent)).toEqual({
      valid: false,
      issues: [issue],
    });
    expect(() => compileFieldIntent(intent)).toThrow(issue);
  });
});
