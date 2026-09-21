/**
 * Versioned runtime contracts for the generation harness.
 *
 * Each contract has one schema definition (see `./schema`) from which both the
 * runtime validator and the JSON Schema handed to constrained decoding are
 * derived. Artifacts also carry an explicit `schemaVersion`; unknown versions
 * are rejected rather than coerced, so a record written by a newer harness can
 * never be silently read as if it had the older shape.
 */

import {
  HUMAN_REVIEW_CONCERNS,
  HUMAN_REVIEW_EVENT_SCHEMA_VERSION,
  HUMAN_REVIEW_OUTCOMES,
} from "./human-review";
import {
  NOVELTY_ASSESSMENT_SCHEMA_VERSION,
  QUESTION_BLUEPRINT_SCHEMA_VERSION,
  QUESTION_PACKAGE_ARTIFACT_SCHEMA_VERSION,
  QUESTION_RUN_REQUEST_SCHEMA_VERSION,
  REJECTION_RECORD_SCHEMA_VERSION,
  REVIEW_ENVELOPE_SCHEMA_VERSION,
  VERIFIED_ARTIFACTS_SCHEMA_VERSION,
} from "./question-run";
import {
  JsonSchema,
  SchemaIssue,
  SchemaNode,
  SchemaValidationResult,
  toJsonSchema,
  validateSchemaValue,
} from "./schema";

export const QUESTION_PAPERS = ["1A", "2"] as const;
export const QUESTION_LEVELS = ["SL", "HL"] as const;
export const QUESTION_STRUCTURES = ["multiple-choice", "multipart"] as const;
export const QUESTION_DIFFICULTIES = [
  "accessible",
  "standard",
  "challenging",
] as const;

export const QUESTION_RUN_STAGES = [
  "plan",
  "validate-blueprint",
  "solve-and-render",
  "author",
  "validate-package",
  "novelty-check",
  "prepare-review",
  "human-review",
] as const;

export const QUESTION_RUN_REJECTION_CODES = [
  "invalid-structured-output",
  "invalid-blueprint",
  "unsupported-physics",
  "unsupported-visual-family",
  "missing-information",
  "unsolvable",
  "incorrect-answer",
  "non-unique-answer",
  "figure-question-mismatch",
  "answer-leak",
  "incomplete-mark-scheme",
  "near-duplicate",
  "package-validation-failed",
  "agent-review-reject",
  "human-reject",
  "retry-budget-exhausted",
  "internal-stage-error",
] as const;

const stringField = (values?: readonly string[]): SchemaNode => ({
  kind: "string",
  minLength: 1,
  ...(values ? { values } : {}),
});

const optionalString = (): SchemaNode => ({
  ...stringField(),
  optional: true,
});

const stringArray = (minItems: number): SchemaNode => ({
  kind: "array",
  minItems,
  items: { kind: "string", minLength: 1 },
});

const visualIntentFields: Record<string, SchemaNode> = {
  required: { kind: "boolean" },
  purposes: stringArray(0),
  families: stringArray(0),
};

export const QUESTION_RUN_REQUEST_SCHEMA_NODE: SchemaNode = {
  kind: "object",
  description: "A request to plan and produce one IB Physics question",
  properties: {
    schemaVersion: stringField([QUESTION_RUN_REQUEST_SCHEMA_VERSION]),
    mode: stringField(["source-replay", "generate"]),
    paper: stringField(QUESTION_PAPERS),
    level: stringField(QUESTION_LEVELS),
    topics: stringArray(1),
    assessedSkills: stringArray(1),
    difficulty: stringField(QUESTION_DIFFICULTIES),
    visualPolicy: stringField(["model-decides", "required", "forbidden"]),
    sourcePackageRef: optionalString(),
  },
};

export const QUESTION_BLUEPRINT_SCHEMA_NODE: SchemaNode = {
  kind: "object",
  description:
    "Approved semantic plan for a question, before any prose is written",
  properties: {
    schemaVersion: stringField([QUESTION_BLUEPRINT_SCHEMA_VERSION]),
    id: stringField(),
    paper: stringField(QUESTION_PAPERS),
    level: stringField(QUESTION_LEVELS),
    topic: stringField(),
    assessedSkills: stringArray(1),
    structure: stringField(QUESTION_STRUCTURES),
    scenarioKind: stringField(),
    visual: { kind: "object", properties: visualIntentFields },
    novelty: {
      kind: "object",
      properties: {
        strategy: stringField(["source-replay", "original-generation"]),
        sourceFamilyId: optionalString(),
      },
    },
    sourcePackageRef: optionalString(),
  },
};

export const VERIFIED_ARTIFACTS_SCHEMA_NODE: SchemaNode = {
  kind: "object",
  description:
    "Deterministic solver output and renders that the author step may not alter",
  properties: {
    schemaVersion: stringField([VERIFIED_ARTIFACTS_SCHEMA_VERSION]),
    solverId: stringField(),
    resultKeys: stringArray(0),
    renderedVisuals: {
      kind: "array",
      minItems: 0,
      items: {
        kind: "object",
        properties: {
          artifactId: stringField(),
          family: stringField(),
          mediaType: stringField(["image/svg+xml"]),
          byteLength: { kind: "integer", minimum: 0 },
          fingerprint: stringField(),
        },
      },
    },
    sourceBacked: { kind: "boolean" },
  },
};

export const QUESTION_PACKAGE_ARTIFACT_SCHEMA_NODE: SchemaNode = {
  kind: "object",
  description: "Student-facing question package plus its marking information",
  properties: {
    kind: stringField(["circuit-question-package", "field-question-package"]),
    schemaVersion: stringField([QUESTION_PACKAGE_ARTIFACT_SCHEMA_VERSION]),
    packageId: stringField(),
    packageSchemaVersion: stringField(),
    sourceQuestionId: stringField(),
    paper: stringField(QUESTION_PAPERS),
    structure: stringField(QUESTION_STRUCTURES),
    marks: { kind: "integer", minimum: 1 },
    visualFamilies: stringArray(0),
    contentFingerprint: stringField(),
    trainingEligibility: stringField(["blocked"]),
    trainingBlockers: stringArray(0),
  },
};

export const NOVELTY_ASSESSMENT_SCHEMA_NODE: SchemaNode = {
  kind: "object",
  properties: {
    schemaVersion: stringField([NOVELTY_ASSESSMENT_SCHEMA_VERSION]),
    status: stringField(["passed", "flagged", "not-run"]),
    reason: stringField(),
    nearestCandidateIds: stringArray(0),
  },
};

export const REVIEW_ENVELOPE_SCHEMA_NODE: SchemaNode = {
  kind: "object",
  properties: {
    schemaVersion: stringField([REVIEW_ENVELOPE_SCHEMA_VERSION]),
    package: QUESTION_PACKAGE_ARTIFACT_SCHEMA_NODE,
    deterministicCheckIds: stringArray(0),
    requiredHumanChecks: stringArray(1),
    agentReview: {
      kind: "object",
      properties: {
        status: stringField(["not-run", "pass", "flag", "reject"]),
        reason: stringField(),
      },
    },
    decisionAuthority: stringField(["human"]),
    trainingEligibility: stringField(["blocked"]),
    trainingBlockers: stringArray(0),
  },
};

export const REJECTION_RECORD_SCHEMA_NODE: SchemaNode = {
  kind: "object",
  properties: {
    schemaVersion: stringField([REJECTION_RECORD_SCHEMA_VERSION]),
    stage: stringField(QUESTION_RUN_STAGES),
    code: stringField(QUESTION_RUN_REJECTION_CODES),
    causeCode: {
      kind: "string",
      minLength: 1,
      values: QUESTION_RUN_REJECTION_CODES,
      optional: true,
    },
    message: stringField(),
    attempts: { kind: "integer", minimum: 1 },
    createdAt: stringField(),
  },
};

export const HUMAN_REVIEW_EVENT_SCHEMA_NODE: SchemaNode = {
  kind: "object",
  description:
    "Immutable record of one authenticated reviewer decision about one concern",
  properties: {
    schemaVersion: stringField([HUMAN_REVIEW_EVENT_SCHEMA_VERSION]),
    decisionId: stringField(),
    runId: stringField(),
    concern: stringField(HUMAN_REVIEW_CONCERNS),
    outcome: stringField(HUMAN_REVIEW_OUTCOMES),
    reviewerId: stringField(),
    reviewerAuthMethod: stringField(["pilot-admin-token-session"]),
    notes: { kind: "string" },
    reviewedRevision: { kind: "integer", minimum: 1 },
    reviewedContentFingerprint: stringField(),
    createdAt: stringField(),
  },
};

/** Every contract the harness reads or writes, keyed by artifact kind. */
export const ARTIFACT_SCHEMAS = {
  "question-run-request": QUESTION_RUN_REQUEST_SCHEMA_NODE,
  "question-blueprint": QUESTION_BLUEPRINT_SCHEMA_NODE,
  "verified-question-artifacts": VERIFIED_ARTIFACTS_SCHEMA_NODE,
  "question-package-artifact": QUESTION_PACKAGE_ARTIFACT_SCHEMA_NODE,
  "novelty-assessment": NOVELTY_ASSESSMENT_SCHEMA_NODE,
  "question-review-envelope": REVIEW_ENVELOPE_SCHEMA_NODE,
  "question-run-rejection": REJECTION_RECORD_SCHEMA_NODE,
  "human-review-event": HUMAN_REVIEW_EVENT_SCHEMA_NODE,
} as const;

export type ArtifactKind = keyof typeof ARTIFACT_SCHEMAS;

/**
 * Version history per artifact. Only the current version is produced; older
 * entries exist so a reader can tell "written by an older harness" apart from
 * "written by an unknown one".
 */
export const ARTIFACT_SCHEMA_VERSIONS: Record<ArtifactKind, readonly string[]> =
  {
    "question-run-request": [QUESTION_RUN_REQUEST_SCHEMA_VERSION],
    "question-blueprint": [QUESTION_BLUEPRINT_SCHEMA_VERSION],
    "verified-question-artifacts": [VERIFIED_ARTIFACTS_SCHEMA_VERSION],
    "question-package-artifact": [QUESTION_PACKAGE_ARTIFACT_SCHEMA_VERSION],
    "novelty-assessment": [NOVELTY_ASSESSMENT_SCHEMA_VERSION],
    "question-review-envelope": [REVIEW_ENVELOPE_SCHEMA_VERSION],
    "question-run-rejection": [REJECTION_RECORD_SCHEMA_VERSION],
    "human-review-event": [HUMAN_REVIEW_EVENT_SCHEMA_VERSION],
  };

export const UNSUPPORTED_SCHEMA_VERSION_CODE = "unsupported-schema-version";

export interface ArtifactVersionCheck {
  supported: boolean;
  artifactKind: ArtifactKind;
  version: unknown;
  issue?: SchemaIssue;
}

/**
 * Check an artifact's declared version before its body is trusted.
 *
 * Versioned migrations are intentionally not written yet: no second version
 * exists, and inventing migration steps for a version that was never produced
 * would be untested code guarding a hypothetical. What matters at this point is
 * that an unrecognised version is rejected loudly instead of being read as the
 * current shape.
 */
export function checkArtifactSchemaVersion(
  artifactKind: ArtifactKind,
  version: unknown,
): ArtifactVersionCheck {
  const supported = ARTIFACT_SCHEMA_VERSIONS[artifactKind];
  if (typeof version === "string" && supported.includes(version)) {
    return { supported: true, artifactKind, version };
  }
  return {
    supported: false,
    artifactKind,
    version,
    issue: {
      code: "not-allowed-value",
      message:
        `$.schemaVersion for ${artifactKind} must be one of: ` +
        `${supported.join(", ")}; received ${JSON.stringify(version)}. ` +
        `This record needs an explicit migration before it can be read.`,
      path: "$.schemaVersion",
    },
  };
}

export const SCHEMA_VERSION_MISMATCH_CODE = UNSUPPORTED_SCHEMA_VERSION_CODE;

/**
 * Validate an artifact against its kind's schema, including the version check.
 */
export function validateArtifact(
  artifactKind: ArtifactKind,
  value: unknown,
): SchemaValidationResult {
  const version = (value as { schemaVersion?: unknown } | null | undefined)
    ?.schemaVersion;
  const versionCheck = checkArtifactSchemaVersion(artifactKind, version);
  const bodyResult = validateSchemaValue(ARTIFACT_SCHEMAS[artifactKind], value);
  const issues = [
    ...(versionCheck.issue ? [versionCheck.issue] : []),
    ...bodyResult.issues,
  ];
  return { valid: issues.length === 0, issues };
}

/**
 * JSON Schema documents for constrained decoding, derived from the same
 * definitions used for runtime validation.
 */
function buildArtifactJsonSchemas(): Record<ArtifactKind, JsonSchema> {
  const schemas = {} as Record<ArtifactKind, JsonSchema>;
  for (const artifactKind of Object.keys(ARTIFACT_SCHEMAS) as ArtifactKind[]) {
    schemas[artifactKind] = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: artifactKind,
      ...toJsonSchema(ARTIFACT_SCHEMAS[artifactKind]),
    };
  }
  return schemas;
}

export const ARTIFACT_JSON_SCHEMAS: Record<ArtifactKind, JsonSchema> =
  buildArtifactJsonSchemas();

export function artifactJsonSchema(artifactKind: ArtifactKind): JsonSchema {
  return ARTIFACT_JSON_SCHEMAS[artifactKind];
}
