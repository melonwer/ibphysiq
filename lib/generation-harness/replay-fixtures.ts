import { createHash } from "node:crypto";

import {
  CIRCUIT_QUESTION_PACKAGES,
  CircuitQuestionPackage,
  solveCircuitScenario,
  validateCircuitQuestionPackage,
} from "../visuals/circuit-question-packages";
import {
  FIELD_QUESTION_PACKAGES,
  FieldQuestionPackage,
  solveFieldScenario,
  validateFieldQuestionPackage,
} from "../visuals/field-question-packages";
import { renderCartesianPlot } from "../visuals/render-cartesian";
import { renderCircuitNetwork } from "../visuals/render-circuit";
import { renderFieldMap } from "../visuals/render-field-map";
import {
  NOVELTY_ASSESSMENT_SCHEMA_VERSION,
  NoveltyAssessment,
  QUESTION_BLUEPRINT_SCHEMA_VERSION,
  QUESTION_PACKAGE_ARTIFACT_SCHEMA_VERSION,
  VERIFIED_ARTIFACTS_SCHEMA_VERSION,
  QuestionBlueprint,
  QuestionLevel,
  QuestionPackageArtifact,
  QuestionReviewEnvelope,
  QuestionRunCheck,
  QuestionRunRequest,
  REVIEW_ENVELOPE_SCHEMA_VERSION,
  VerifiedQuestionArtifacts,
} from "./question-run";
import {
  QuestionRunAdapters,
  QuestionRunStageError,
} from "./question-run-graph";

export const CIRCUIT_REPLAY_PACKAGE_ID = "may25-tz1-hl-1a-q14-circuit-package";
export const FIELD_REPLAY_PACKAGE_ID =
  "may25-tz2-hl-1a-q22-field-superposition-package";

function levelFromSourceLabel(sourceLabel: string): QuestionLevel {
  if (/\bHL\b/.test(sourceLabel)) return "HL";
  if (/\bSL\b/.test(sourceLabel)) return "SL";
  throw new Error(`Question level is not encoded in ${sourceLabel}`);
}

export function textFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function packageContentFingerprint(item: unknown): string {
  const canonicalize = (value: unknown): string =>
    JSON.stringify(value, (_key, candidate) => {
      if (
        candidate !== null &&
        typeof candidate === "object" &&
        !Array.isArray(candidate)
      ) {
        return Object.fromEntries(
          Object.entries(candidate as Record<string, unknown>).sort(
            ([a], [b]) => a.localeCompare(b),
          ),
        );
      }
      return candidate;
    });
  return `sha256:${createHash("sha256")
    .update(canonicalize(item), "utf8")
    .digest("hex")}`;
}

function renderedVisual(
  artifactId: string,
  family: string,
  svg: string,
): VerifiedQuestionArtifacts["renderedVisuals"][number] {
  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) {
    throw new QuestionRunStageError(
      "unsupported-visual-family",
      `${artifactId} did not render a complete SVG`,
    );
  }
  return {
    artifactId,
    family,
    mediaType: "image/svg+xml",
    byteLength: new TextEncoder().encode(svg).length,
    fingerprint: textFingerprint(svg),
  };
}

function validateReplayBlueprint(
  request: QuestionRunRequest,
  blueprint: QuestionBlueprint,
  packageId: string,
): void {
  const issues: string[] = [];
  if (
    request.mode !== "source-replay" ||
    request.visualPolicy !== "required" ||
    blueprint.paper !== request.paper ||
    blueprint.level !== request.level ||
    blueprint.sourcePackageRef !== packageId ||
    request.sourcePackageRef !== packageId
  ) {
    issues.push("request, blueprint, and source package must agree");
  }
  if (
    JSON.stringify(request.topics) !== JSON.stringify([blueprint.topic]) ||
    JSON.stringify(request.assessedSkills) !==
      JSON.stringify(blueprint.assessedSkills)
  ) {
    issues.push("request topics and assessed skills must match the blueprint");
  }
  if (blueprint.novelty.strategy !== "source-replay") {
    issues.push("replay blueprint needs the source-replay novelty strategy");
  }
  if (
    !blueprint.topic.trim() ||
    blueprint.assessedSkills.length === 0 ||
    blueprint.assessedSkills.some((skill) => !skill.trim())
  ) {
    issues.push("topic and assessed skills must be explicit");
  }
  if (!blueprint.visual.required || blueprint.visual.families.length === 0) {
    issues.push("these replay fixtures require a student-facing visual");
  }
  if (
    (blueprint.paper === "1A" && blueprint.structure !== "multiple-choice") ||
    (blueprint.paper === "2" && blueprint.structure !== "multipart")
  ) {
    issues.push("paper and question structure must agree");
  }
  if (issues.length > 0) {
    throw new QuestionRunStageError("invalid-blueprint", issues.join("; "));
  }
}

function replayNoveltyAssessment(): NoveltyAssessment {
  return {
    schemaVersion: NOVELTY_ASSESSMENT_SCHEMA_VERSION,
    status: "not-run",
    reason:
      "Novelty is not scored for a source-backed replay; this run tests the harness, not originality",
    nearestCandidateIds: [],
  };
}

function reviewEnvelope(
  questionPackage: QuestionPackageArtifact,
  checks: readonly QuestionRunCheck[],
): QuestionReviewEnvelope {
  return {
    schemaVersion: REVIEW_ENVELOPE_SCHEMA_VERSION,
    package: questionPackage,
    deterministicCheckIds: checks
      .filter((check) => check.outcome === "passed")
      .map((check) => check.id),
    requiredHumanChecks: [
      "question is useful and appropriately difficult for the stated IB level",
      "student-facing visual and text agree without revealing the answer",
      "worked solution and marking points are complete",
      "source-use rights and eventual publication status are recorded separately",
    ],
    agentReview: {
      status: "not-run",
      reason: "The v0.1 deterministic replay makes no live model calls",
    },
    decisionAuthority: "human",
    trainingEligibility: "blocked",
    trainingBlockers: [...questionPackage.trainingBlockers],
  };
}

function circuitBlueprint(item: CircuitQuestionPackage): QuestionBlueprint {
  return {
    schemaVersion: QUESTION_BLUEPRINT_SCHEMA_VERSION,
    id: `${item.id}-blueprint`,
    paper: item.paper,
    level: levelFromSourceLabel(item.source.questionLabel),
    topic: "electric circuits",
    assessedSkills: ["analyse series and parallel circuit topology"],
    structure: item.question.kind,
    scenarioKind: item.scenario.kind,
    visual: {
      required: true,
      purposes: ["supply circuit topology needed to answer the question"],
      families: ["circuit_network", ...(item.plot ? ["cartesian_plot"] : [])],
    },
    novelty: {
      strategy: "source-replay",
      sourceFamilyId: item.source.fixtureId,
    },
    sourcePackageRef: item.id,
  };
}

function fieldBlueprint(item: FieldQuestionPackage): QuestionBlueprint {
  return {
    schemaVersion: QUESTION_BLUEPRINT_SCHEMA_VERSION,
    id: `${item.id}-blueprint`,
    paper: item.paper,
    level: levelFromSourceLabel(item.source.questionLabel),
    topic: "electric and gravitational fields",
    assessedSkills: ["apply superposition to a discrete field configuration"],
    structure: item.question.kind,
    scenarioKind: item.scenario.kind,
    visual: {
      required: true,
      purposes: ["supply spatial field information needed by the question"],
      families: [
        ...(item.visualSpec ? ["field_map"] : []),
        ...(item.plot ? ["cartesian_plot"] : []),
      ],
    },
    novelty: {
      strategy: "source-replay",
      sourceFamilyId: item.source.fixtureId,
    },
    sourcePackageRef: item.id,
  };
}

function circuitArtifact(
  item: CircuitQuestionPackage,
): QuestionPackageArtifact {
  return {
    kind: "circuit-question-package",
    schemaVersion: QUESTION_PACKAGE_ARTIFACT_SCHEMA_VERSION,
    packageId: item.id,
    packageSchemaVersion: item.schemaVersion,
    sourceQuestionId: item.source.questionId,
    paper: item.paper,
    structure: item.question.kind,
    marks: item.marks,
    visualFamilies: [
      "circuit_network",
      ...(item.plot ? ["cartesian_plot"] : []),
    ],
    contentFingerprint: packageContentFingerprint(item),
    trainingEligibility: item.trainingEligibility,
    trainingBlockers: [...item.trainingBlockers],
  };
}

function fieldArtifact(item: FieldQuestionPackage): QuestionPackageArtifact {
  return {
    kind: "field-question-package",
    schemaVersion: QUESTION_PACKAGE_ARTIFACT_SCHEMA_VERSION,
    packageId: item.id,
    packageSchemaVersion: item.schemaVersion,
    sourceQuestionId: item.source.questionId,
    paper: item.paper,
    structure: item.question.kind,
    marks: item.marks,
    visualFamilies: [
      ...(item.visualSpec ? ["field_map"] : []),
      ...(item.plot ? ["cartesian_plot"] : []),
    ],
    contentFingerprint: packageContentFingerprint(item),
    trainingEligibility: item.trainingEligibility,
    trainingBlockers: [...item.trainingBlockers],
  };
}

export function circuitReplayRequest(
  packageId = CIRCUIT_REPLAY_PACKAGE_ID,
): QuestionRunRequest {
  const item = CIRCUIT_QUESTION_PACKAGES.find(
    (candidate) => candidate.id === packageId,
  );
  if (!item) throw new Error(`Unknown circuit package: ${packageId}`);
  const blueprint = circuitBlueprint(item);
  return {
    mode: "source-replay",
    paper: item.paper,
    level: blueprint.level,
    topics: [blueprint.topic],
    assessedSkills: [...blueprint.assessedSkills],
    difficulty: "standard",
    visualPolicy: "required",
    sourcePackageRef: item.id,
  };
}

export function fieldReplayRequest(
  packageId = FIELD_REPLAY_PACKAGE_ID,
): QuestionRunRequest {
  const item = FIELD_QUESTION_PACKAGES.find(
    (candidate) => candidate.id === packageId,
  );
  if (!item) throw new Error(`Unknown field package: ${packageId}`);
  const blueprint = fieldBlueprint(item);
  return {
    mode: "source-replay",
    paper: item.paper,
    level: blueprint.level,
    topics: [blueprint.topic],
    assessedSkills: [...blueprint.assessedSkills],
    difficulty: "standard",
    visualPolicy: "required",
    sourcePackageRef: item.id,
  };
}

export function createCircuitReplayAdapters(
  packageId = CIRCUIT_REPLAY_PACKAGE_ID,
): QuestionRunAdapters {
  const item = CIRCUIT_QUESTION_PACKAGES.find(
    (candidate) => candidate.id === packageId,
  );
  if (!item) throw new Error(`Unknown circuit package: ${packageId}`);
  return {
    async plan() {
      return circuitBlueprint(item);
    },
    async validateBlueprint(request, blueprint) {
      validateReplayBlueprint(request, blueprint, item.id);
    },
    async solveAndRender() {
      const results = solveCircuitScenario(item.scenario);
      if (JSON.stringify(results) !== JSON.stringify(item.results)) {
        throw new QuestionRunStageError(
          "incorrect-answer",
          "Circuit replay results no longer match the stored package",
        );
      }
      const renderedVisuals = [
        renderedVisual(
          item.visualSpec.id,
          "circuit_network",
          renderCircuitNetwork(item.visualSpec),
        ),
      ];
      if (item.plot) {
        renderedVisuals.push(
          renderedVisual(
            item.plot.student.spec.id,
            "cartesian_plot",
            renderCartesianPlot(item.plot.student.spec, item.plot.student.data),
          ),
        );
      }
      return {
        schemaVersion: VERIFIED_ARTIFACTS_SCHEMA_VERSION,
        solverId: `circuit-solver/${item.scenario.kind}/0.1.0`,
        resultKeys: Object.keys(results).sort(),
        renderedVisuals,
        sourceBacked: true,
      };
    },
    async author() {
      return circuitArtifact(item);
    },
    async validatePackage(questionPackage) {
      const expectedArtifact = circuitArtifact(item);
      if (
        JSON.stringify(questionPackage) !== JSON.stringify(expectedArtifact)
      ) {
        throw new QuestionRunStageError(
          "package-validation-failed",
          "Authored artifact does not exactly match the replayed circuit package",
        );
      }
      const validation = validateCircuitQuestionPackage(item);
      if (!validation.valid) {
        throw new QuestionRunStageError(
          "package-validation-failed",
          validation.issues.join("; "),
        );
      }
    },
    async checkNovelty() {
      return replayNoveltyAssessment();
    },
    async prepareReview(questionPackage, checks) {
      return reviewEnvelope(questionPackage, checks);
    },
  };
}

export function createFieldReplayAdapters(
  packageId = FIELD_REPLAY_PACKAGE_ID,
): QuestionRunAdapters {
  const item = FIELD_QUESTION_PACKAGES.find(
    (candidate) => candidate.id === packageId,
  );
  if (!item) throw new Error(`Unknown field package: ${packageId}`);
  return {
    async plan() {
      return fieldBlueprint(item);
    },
    async validateBlueprint(request, blueprint) {
      validateReplayBlueprint(request, blueprint, item.id);
    },
    async solveAndRender() {
      const results = solveFieldScenario(item.scenario);
      if (JSON.stringify(results) !== JSON.stringify(item.results)) {
        throw new QuestionRunStageError(
          "incorrect-answer",
          "Field replay results no longer match the stored package",
        );
      }
      const renderedVisuals: VerifiedQuestionArtifacts["renderedVisuals"] = [];
      if (item.visualSpec) {
        renderedVisuals.push(
          renderedVisual(
            item.visualSpec.id,
            "field_map",
            renderFieldMap(item.visualSpec),
          ),
        );
      }
      if (item.plot) {
        renderedVisuals.push(
          renderedVisual(
            item.plot.student.spec.id,
            "cartesian_plot",
            renderCartesianPlot(item.plot.student.spec, item.plot.student.data),
          ),
        );
      }
      if (renderedVisuals.length === 0) {
        throw new QuestionRunStageError(
          "unsupported-visual-family",
          "Field replay produced no student-facing visual",
        );
      }
      return {
        schemaVersion: VERIFIED_ARTIFACTS_SCHEMA_VERSION,
        solverId: `field-solver/${item.scenario.kind}/0.1.0`,
        resultKeys: Object.keys(results).sort(),
        renderedVisuals,
        sourceBacked: true,
      };
    },
    async author() {
      return fieldArtifact(item);
    },
    async validatePackage(questionPackage) {
      const expectedArtifact = fieldArtifact(item);
      if (
        JSON.stringify(questionPackage) !== JSON.stringify(expectedArtifact)
      ) {
        throw new QuestionRunStageError(
          "package-validation-failed",
          "Authored artifact does not exactly match the replayed field package",
        );
      }
      const validation = validateFieldQuestionPackage(item);
      if (!validation.valid) {
        throw new QuestionRunStageError(
          "package-validation-failed",
          validation.issues.join("; "),
        );
      }
    },
    async checkNovelty() {
      return replayNoveltyAssessment();
    },
    async prepareReview(questionPackage, checks) {
      return reviewEnvelope(questionPackage, checks);
    },
  };
}
