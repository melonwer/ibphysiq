import {
  ARTIFACT_JSON_SCHEMAS,
  ARTIFACT_SCHEMAS,
  ARTIFACT_SCHEMA_VERSIONS,
  ArtifactKind,
  checkArtifactSchemaVersion,
  circuitReplayRequest,
  createCircuitReplayAdapters,
  JsonSchema,
  QUESTION_RUN_REQUEST_SCHEMA_VERSION,
  SchemaNode,
  toJsonSchema,
  validateArtifact,
  validateSchemaValue,
} from "..";

function assertNodeMatchesJsonSchema(
  node: SchemaNode,
  jsonSchema: JsonSchema,
  path: string,
): void {
  expect(jsonSchema.type).toBe(node.kind);

  if (node.kind === "object") {
    const properties = jsonSchema.properties as Record<string, JsonSchema>;
    const declared = Object.keys(node.properties ?? {}).sort();
    expect(Object.keys(properties).sort()).toEqual(declared);

    const expectedRequired = Object.entries(node.properties ?? {})
      .filter(([, child]) => !child.optional)
      .map(([key]) => key)
      .sort();
    expect([...(jsonSchema.required as string[])].sort()).toEqual(
      expectedRequired,
    );
    if (!node.allowAdditionalProperties) {
      expect(jsonSchema.additionalProperties).toBe(false);
    }

    for (const [key, child] of Object.entries(node.properties ?? {})) {
      assertNodeMatchesJsonSchema(child, properties[key], `${path}.${key}`);
    }
  }

  if (node.kind === "string" && node.values) {
    expect(jsonSchema.enum).toEqual([...node.values]);
  }

  if (node.kind === "array") {
    if (node.items) {
      assertNodeMatchesJsonSchema(
        node.items,
        jsonSchema.items as JsonSchema,
        `${path}[]`,
      );
    }
    if (node.minItems !== undefined) {
      expect(jsonSchema.minItems).toBe(node.minItems);
    }
  }
}

describe("runtime schema toolkit", () => {
  it("reports every problem with a JSON path", () => {
    const node: SchemaNode = {
      kind: "object",
      properties: {
        name: { kind: "string", minLength: 2 },
        mode: { kind: "string", values: ["a", "b"] },
        count: { kind: "integer", minimum: 1 },
        items: { kind: "array", minItems: 1, items: { kind: "string" } },
        nested: {
          kind: "object",
          properties: { flag: { kind: "boolean" } },
        },
      },
    };

    const result = validateSchemaValue(node, {
      name: "x",
      mode: "c",
      count: 0,
      items: [1],
      nested: { flag: "yes" },
      extra: 1,
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "min-length", path: "$.name" }),
        expect.objectContaining({ code: "not-allowed-value", path: "$.mode" }),
        expect.objectContaining({
          code: "number-out-of-range",
          path: "$.count",
        }),
        expect.objectContaining({ code: "expected-string", path: "$.items[0]" }),
        expect.objectContaining({
          code: "expected-boolean",
          path: "$.nested.flag",
        }),
        expect.objectContaining({
          code: "unexpected-property",
          path: "$.extra",
        }),
      ]),
    );
  });

  it("distinguishes missing required properties from wrong types", () => {
    const node: SchemaNode = {
      kind: "object",
      properties: {
        requiredField: { kind: "string" },
        optionalField: { kind: "string", optional: true },
      },
    };

    const missing = validateSchemaValue(node, {});
    expect(missing.issues).toEqual([
      expect.objectContaining({ code: "missing-required", path: "$.requiredField" }),
    ]);

    expect(validateSchemaValue(node, { requiredField: "ok" }).valid).toBe(true);
  });

  it("rejects non-finite numbers and non-integer integers", () => {
    expect(
      validateSchemaValue({ kind: "number" }, Number.NaN).issues[0].code,
    ).toBe("expected-number");
    expect(
      validateSchemaValue({ kind: "number" }, Number.POSITIVE_INFINITY).issues[0]
        .code,
    ).toBe("expected-number");
    expect(validateSchemaValue({ kind: "integer" }, 1.5).issues[0].code).toBe(
      "expected-integer",
    );
  });

  it("rejects arrays and null where an object is required", () => {
    const node: SchemaNode = { kind: "object", properties: {} };
    expect(validateSchemaValue(node, []).issues[0].code).toBe("expected-object");
    expect(validateSchemaValue(node, null).issues[0].code).toBe(
      "expected-object",
    );
  });
});

describe("artifact contracts", () => {
  const artifactKinds = Object.keys(ARTIFACT_SCHEMAS) as ArtifactKind[];

  it("derives the exported JSON Schema from the same definition as validation", () => {
    for (const artifactKind of artifactKinds) {
      const exported = ARTIFACT_JSON_SCHEMAS[artifactKind];
      expect(exported.$schema).toBe(
        "https://json-schema.org/draft/2020-12/schema",
      );
      expect(exported.title).toBe(artifactKind);
      assertNodeMatchesJsonSchema(
        ARTIFACT_SCHEMAS[artifactKind],
        exported,
        artifactKind,
      );
    }
  });

  it("matches the size and shape of what toJsonSchema produces directly", () => {
    expect(ARTIFACT_JSON_SCHEMAS["question-run-request"]).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "question-run-request",
      ...toJsonSchema(ARTIFACT_SCHEMAS["question-run-request"]),
    });
  });

  it("accepts the artifacts the replay harness actually produces", async () => {
    const adapters = createCircuitReplayAdapters();
    const request = { ...circuitReplayRequest(), schemaVersion: QUESTION_RUN_REQUEST_SCHEMA_VERSION };
    const blueprint = await adapters.plan(request);
    const artifacts = await adapters.solveAndRender(blueprint);
    const questionPackage = await adapters.author(blueprint, artifacts);
    const novelty = await adapters.checkNovelty(questionPackage, blueprint);
    const envelope = await adapters.prepareReview(
      questionPackage,
      [],
      novelty,
    );

    expect(validateArtifact("question-run-request", request).valid).toBe(true);
    expect(validateArtifact("question-blueprint", blueprint).valid).toBe(true);
    expect(
      validateArtifact("verified-question-artifacts", artifacts).valid,
    ).toBe(true);
    expect(
      validateArtifact("question-package-artifact", questionPackage).valid,
    ).toBe(true);
    expect(validateArtifact("novelty-assessment", novelty).valid).toBe(true);
    expect(
      validateArtifact("question-review-envelope", envelope).valid,
    ).toBe(true);
  });

  it("rejects an artifact that carries an unknown schema version", () => {
    const validation = validateArtifact("novelty-assessment", {
      schemaVersion: "novelty-assessment/9.9.9",
      status: "passed",
      reason: "looks fine",
      nearestCandidateIds: [],
    });

    expect(validation.valid).toBe(false);
    expect(validation.issues[0].code).toBe("not-allowed-value");
    expect(validation.issues[0].message).toContain("migration");
  });

  it("rejects a body that satisfies no contract at all", () => {
    const validation = validateArtifact("question-blueprint", {
      schemaVersion: ARTIFACT_SCHEMA_VERSIONS["question-blueprint"][0],
      id: "blueprint-1",
    });

    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toContain(
      "missing-required",
    );
  });

  it("never silently promotes automated output to training-ready", () => {
    expect(
      ARTIFACT_SCHEMAS["question-package-artifact"].properties
        ?.trainingEligibility.values,
    ).toEqual(["blocked"]);
    expect(
      ARTIFACT_SCHEMAS["question-review-envelope"].properties
        ?.decisionAuthority.values,
    ).toEqual(["human"]);
  });

  it("accepts only the current version for each artifact kind", () => {
    for (const artifactKind of artifactKinds) {
      const [current] = ARTIFACT_SCHEMA_VERSIONS[artifactKind];
      expect(checkArtifactSchemaVersion(artifactKind, current).supported).toBe(
        true,
      );
      expect(
        checkArtifactSchemaVersion(artifactKind, `${current}-next`).supported,
      ).toBe(false);
      expect(checkArtifactSchemaVersion(artifactKind, undefined).supported).toBe(
        false,
      );
    }
  });

  it("exposes a request JSON Schema suitable for constrained decoding", () => {
    const schema = ARTIFACT_JSON_SCHEMAS["question-run-request"];
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "mode",
        "paper",
        "level",
        "topics",
        "assessedSkills",
        "difficulty",
        "visualPolicy",
      ]),
    );
  });
});
