import {
  CIRCUIT_QUESTION_PACKAGES,
  CircuitQuestionPackage,
} from "../visuals/circuit-question-packages";
import {
  FIELD_QUESTION_PACKAGES,
  FieldQuestionPackage,
} from "../visuals/field-question-packages";
import {
  MECHANICS_QUESTION_PACKAGES,
  MechanicsQuestionPackage,
} from "../visuals/mechanics-question-packages";
import type { VisualSpec } from "../visuals/types";
import {
  callOllamaJson,
  DEFAULT_LOCAL_MODEL_CONFIG,
  LocalModelConfig,
  LocalModelReceipt,
} from "./ollama-planner";
import { packageContentFingerprint } from "./replay-fixtures";
import type {
  QuestionBlueprint,
  QuestionPackageArtifact,
  VerifiedQuestionArtifacts,
} from "./question-run";
import { QuestionRunStageError } from "./question-run-graph";
import { SchemaNode, toJsonSchema, validateSchemaValue } from "./schema";

export type CheckedSourcePackage =
  | CircuitQuestionPackage
  | FieldQuestionPackage
  | MechanicsQuestionPackage;
export interface AuthoredContent {
  question: CircuitQuestionPackage["question"];
  solution: CircuitQuestionPackage["solution"];
}
export interface ModelAuthoredPackage extends AuthoredContent {
  schemaVersion: "model-authored-question-package/0.1.0";
  id: string;
  sourcePackageId: string;
  source: CircuitQuestionPackage["source"];
  paper: "1A" | "2";
  marks: number;
  assumptions: string[];
  scenario: CheckedSourcePackage["scenario"];
  results: Record<string, number | string>;
  sourceChecks: CheckedSourcePackage["sourceChecks"];
  visualSpec?:
    | VisualSpec<"circuit_network">
    | VisualSpec<"field_map">
    | VisualSpec<"mechanics_scene">;
  plot?: CircuitQuestionPackage["plot"] | FieldQuestionPackage["plot"];
  physicsStatus: "verified-results";
  trainingEligibility: "blocked";
  trainingBlockers: string[];
}

export const CHECKED_SOURCE_PACKAGES: readonly CheckedSourcePackage[] = [
  ...CIRCUIT_QUESTION_PACKAGES,
  ...FIELD_QUESTION_PACKAGES,
  ...MECHANICS_QUESTION_PACKAGES,
];

const stringNode = (values?: readonly string[]): SchemaNode => ({
  kind: "string",
  minLength: 1,
  ...(values ? { values } : {}),
});
const strings: SchemaNode = { kind: "array", minItems: 1, items: stringNode() };

export function authoredContentSchema(base: CheckedSourcePackage): SchemaNode {
  const questionProperties: Record<string, SchemaNode> = {
    kind: stringNode([base.question.kind]),
    stem: stringNode(),
  };
  if (base.question.kind === "multiple-choice") {
    questionProperties.marks = { kind: "integer", minimum: 1, maximum: 1 };
    questionProperties.options = {
      kind: "array",
      minItems: 4,
      items: {
        kind: "object",
        properties: {
          id: stringNode(["A", "B", "C", "D"]),
          text: stringNode(base.question.options.map((option) => option.text)),
        },
      },
    };
  } else {
    questionProperties.parts = {
      kind: "array",
      minItems: base.question.parts.length,
      items: {
        kind: "object",
        properties: {
          id: stringNode(base.question.parts.map((part) => part.id)),
          prompt: stringNode(),
          marks: { kind: "integer", minimum: 1, maximum: base.marks },
        },
      },
    };
  }
  const solutionProperties: Record<string, SchemaNode> = {
    parts: {
      kind: "array",
      minItems: base.solution.parts.length,
      items: {
        kind: "object",
        properties: {
          partId: stringNode(base.solution.parts.map((part) => part.partId)),
          marks: { kind: "integer", minimum: 1, maximum: base.marks },
          working: strings,
          markingPoints: strings,
          finalAnswer: stringNode(
            base.solution.parts.map(
              (part) => part.finalAnswer ?? part.markingPoints.join(" "),
            ),
          ),
        },
      },
    },
  };
  if (base.solution.correctOptionId)
    solutionProperties.correctOptionId = stringNode([
      base.solution.correctOptionId,
    ]);
  return {
    kind: "object",
    properties: {
      question: { kind: "object", properties: questionProperties },
      solution: { kind: "object", properties: solutionProperties },
    },
  };
}

export function parseAuthoredContent(
  base: CheckedSourcePackage,
  raw: unknown,
): AuthoredContent {
  const parsed = validateSchemaValue(authoredContentSchema(base), raw);
  if (!parsed.valid)
    throw new QuestionRunStageError(
      "invalid-structured-output",
      parsed.issues.map((issue) => issue.message).join("; "),
    );
  const content = raw as AuthoredContent;
  const expectedQuestion = base.question;
  const actualQuestion = content.question;
  if (
    actualQuestion.kind === "multiple-choice" &&
    expectedQuestion.kind === "multiple-choice"
  ) {
    if (
      JSON.stringify(actualQuestion.options) !==
        JSON.stringify(expectedQuestion.options) ||
      content.solution.correctOptionId !== base.solution.correctOptionId
    )
      throw new QuestionRunStageError(
        "non-unique-answer",
        "Options or the correct option differ from checked targets",
      );
  } else if (
    actualQuestion.kind === "multipart" &&
    expectedQuestion.kind === "multipart"
  ) {
    if (
      JSON.stringify(
        actualQuestion.parts.map(({ id, marks }) => ({ id, marks })),
      ) !==
      JSON.stringify(
        expectedQuestion.parts.map(({ id, marks }) => ({ id, marks })),
      )
    )
      throw new QuestionRunStageError(
        "incomplete-mark-scheme",
        "Part IDs, order or marks differ from the assessment targets",
      );
  }
  if (content.solution.parts.length !== base.solution.parts.length)
    throw new QuestionRunStageError(
      "incomplete-mark-scheme",
      "Solution part count differs from the targets",
    );
  for (const [index, expected] of base.solution.parts.entries()) {
    const actual = content.solution.parts[index];
    if (
      actual.partId !== expected.partId ||
      actual.marks !== expected.marks ||
      actual.markingPoints.length !== expected.marks ||
      actual.finalAnswer !==
        (expected.finalAnswer ?? expected.markingPoints.join(" "))
    )
      throw new QuestionRunStageError(
        "incorrect-answer",
        `Solution for ${expected.partId} differs from its checked target or mark allocation`,
      );
  }
  return content;
}

export function buildModelAuthoredPackage(
  base: CheckedSourcePackage,
  id: string,
  content: AuthoredContent,
): ModelAuthoredPackage {
  return {
    schemaVersion: "model-authored-question-package/0.1.0",
    id,
    sourcePackageId: base.id,
    source: base.source,
    paper: base.paper,
    marks: base.marks,
    assumptions: base.assumptions,
    scenario: base.scenario,
    results: base.results,
    sourceChecks: base.sourceChecks,
    visualSpec: base.visualSpec,
    plot: "plot" in base ? base.plot : undefined,
    ...content,
    physicsStatus: "verified-results",
    trainingEligibility: "blocked",
    trainingBlockers: [
      "model-authored wording and working not human reviewed",
      "source-use rights not cleared",
      "training metadata not reviewed",
      "originality not established",
    ],
  };
}

export function parseModelAuthoredPackage(raw: unknown): ModelAuthoredPackage {
  if (
    raw === null ||
    typeof raw !== "object" ||
    !("id" in raw) ||
    typeof raw.id !== "string" ||
    !("sourcePackageId" in raw) ||
    typeof raw.sourcePackageId !== "string"
  )
    throw new Error("Missing authored package identity");
  const base = CHECKED_SOURCE_PACKAGES.find(
    (item) => item.id === raw.sourcePackageId,
  );
  if (!base) throw new Error("Unknown authored package source");
  if (!("question" in raw) || !("solution" in raw))
    throw new Error("Missing authored content");
  const content = parseAuthoredContent(base, {
    question: raw.question,
    solution: raw.solution,
  });
  const expected = buildModelAuthoredPackage(base, raw.id, content);
  if (packageContentFingerprint(raw) !== packageContentFingerprint(expected))
    throw new Error(
      "Authored package provenance or verified artifacts differ from the checked source",
    );
  return expected;
}

export function createOllamaAuthor(
  base: CheckedSourcePackage,
  candidateId: string,
  save: (candidate: ModelAuthoredPackage) => Promise<void>,
  config: LocalModelConfig = {
    ...DEFAULT_LOCAL_MODEL_CONFIG,
    timeoutMs: 120_000,
    maxOutputTokens: 4096,
  },
  onReceipt: (receipt: LocalModelReceipt) => void = () => {},
  onContent: (content: string) => void = () => {},
  onRequest: (body: Record<string, unknown>) => void = () => {},
): (
  blueprint: QuestionBlueprint,
  artifacts: VerifiedQuestionArtifacts,
) => Promise<QuestionPackageArtifact> {
  return async (blueprint, artifacts) => {
    const schema = authoredContentSchema(base);
    const raw = await callOllamaJson(
      config,
      toJsonSchema(schema),
      [
        {
          role: "system",
          content:
            "Author an IB Physics question and worked marking scheme for the supplied checked scenario and fixed student figures. Return only the requested JSON. Reconstruct the assessment goals in clear wording. Preserve all quantities, labels, assumptions, question structure, option order/text, part IDs, part order and marks. Do not introduce quantities or conditions. Use supplied final answers verbatim, including their option IDs and units. Write your own working and one marking point per allocated mark. Each calculation needs an equation and substitution. Do not put worked answers in the student stem or parts. Figures are already rendered; do not request extra figures. This is source-conditioned authoring; make no originality claim.",
        },
        {
          role: "user",
          content: JSON.stringify({
            blueprint,
            artifacts,
            scenario: base.scenario,
            assumptions: base.assumptions,
            visualSpec: base.visualSpec,
            plot: "plot" in base ? base.plot?.student : undefined,
            assessmentGoals: base.question,
            verifiedResults: base.results,
            verifiedTargets: base.solution.parts.map((part) => ({
              partId: part.partId,
              marks: part.marks,
              finalAnswer: part.finalAnswer ?? part.markingPoints.join(" "),
            })),
            correctOptionId: base.solution.correctOptionId,
          }),
        },
      ],
      onReceipt,
      onContent,
      onRequest,
    );
    const content = parseAuthoredContent(base, raw);
    const candidate = buildModelAuthoredPackage(base, candidateId, content);
    await save(candidate);
    return {
      kind: "model-authored-question-package",
      schemaVersion: "question-package-artifact/0.1.0",
      packageId: candidate.id,
      packageSchemaVersion: candidate.schemaVersion,
      sourceQuestionId: base.source.questionId,
      paper: base.paper,
      structure: candidate.question.kind,
      marks: base.marks,
      visualFamilies: artifacts.renderedVisuals.map((visual) => visual.family),
      contentFingerprint: packageContentFingerprint(candidate),
      trainingEligibility: "blocked",
      trainingBlockers: candidate.trainingBlockers,
    };
  };
}
