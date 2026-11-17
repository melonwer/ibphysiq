import crypto from "node:crypto";

import {
  formatSignificantFigures,
  numbersAgreeWithinTolerance,
  textContainsNumericValue,
} from "./numeric-checker";
import {
  CandidateQuestionInput,
  CandidateQuestionPlan,
  DatasetSplit,
  QWEN_DISTILLATION_TRACE_SCHEMA_VERSION,
  QwenDistillationTrace,
  SixthPhysicsBankItem,
} from "./types";

export const QWEN_HARNESS_SYSTEM_PROMPT =
  "You are the SixthPhysics neuro-symbolic physics question author. " +
  "Follow the strict two-step deterministic harness protocol:\n" +
  "Step 1 (propose_scenario): Given the target syllabus, concept, domain, format, difficulty, and seed, " +
  "emit a JSON proposal calling solve_and_render_scenario with a physically valid scenarioSpec, " +
  "hiddenQuantities (target unknowns that must never leak in student figures), and questionPlan. " +
  "Never guess or compute numerical answers before receiving the harness receipt.\n" +
  "Step 2 (author_package): Given the physics_harness receipt containing solver-verified quantities and " +
  "student figure metadata, emit a complete JSON question package (stem, 4 unique options A-D with " +
  "distractorRationales for MCQ or structured subparts with dependencies, workedSolution, and markScheme) " +
  "whose numerical values agree with verifiedQuantities to 3 significant figures, include every required " +
  "given, balance marks exactly, and leak zero answers in the student stem.";

export interface BuildDistillationTraceInput {
  candidate: CandidateQuestionInput;
  bankItem: SixthPhysicsBankItem;
  split: DatasetSplit;
  publicVisualLabels?: readonly string[];
}

function buildGenericMisconceptionTags(
  conceptId: string,
  templateArchetype: string,
  primaryTarget: string,
): string[] {
  return [
    `intermediate-quantity-stop::${templateArchetype}`,
    `sign-or-direction-reversal::${conceptId}`,
    `formula-or-unit-scaling-slip::${primaryTarget}`,
  ];
}

function buildPreSolveQuestionPlan(
  candidate: CandidateQuestionInput,
): CandidateQuestionPlan {
  const primaryTarget =
    candidate.targetQuantityKey?.trim() ||
    candidate.hiddenQuantities[0]?.trim() ||
    "conceptual-target";

  const postSolveRationales = new Set(
    (candidate.options ?? [])
      .filter((o) => !o.isCorrect && o.distractorRationale?.trim())
      .map((o) => o.distractorRationale!.trim().toLowerCase()),
  );

  if (candidate.questionPlan) {
    const filteredDistractorStrategy = candidate.questionPlan.distractorStrategy
      ?.map((entry) => entry.trim())
      .filter(
        (entry) =>
          entry.length > 0 && !postSolveRationales.has(entry.toLowerCase()),
      );

    return {
      targetSummary: candidate.questionPlan.targetSummary.trim(),
      ...(candidate.format === "mcq"
        ? {
            distractorStrategy:
              filteredDistractorStrategy && filteredDistractorStrategy.length > 0
                ? filteredDistractorStrategy
                : buildGenericMisconceptionTags(
                    candidate.conceptId,
                    candidate.templateArchetype,
                    primaryTarget,
                  ),
          }
        : filteredDistractorStrategy && filteredDistractorStrategy.length > 0
          ? { distractorStrategy: filteredDistractorStrategy }
          : {}),
      ...(candidate.questionPlan.subpartStrategy
        ? { subpartStrategy: [...candidate.questionPlan.subpartStrategy] }
        : {}),
      ...(candidate.questionPlan.assumptions
        ? { assumptions: [...candidate.questionPlan.assumptions] }
        : {}),
    };
  }

  if (candidate.format === "mcq") {
    return {
      targetSummary: `Assess ${candidate.conceptId} (${candidate.templateArchetype}) at ${candidate.difficulty} difficulty via single-best-answer reasoning targeting ${primaryTarget}`,
      distractorStrategy: buildGenericMisconceptionTags(
        candidate.conceptId,
        candidate.templateArchetype,
        primaryTarget,
      ),
    };
  }

  return {
    targetSummary: `Assess ${candidate.conceptId} (${candidate.templateArchetype}) at ${candidate.difficulty} difficulty via multi-step structured problem`,
    subpartStrategy: (candidate.parts ?? []).map(
      (p) =>
        `part (${p.partId}): target ${p.targetQuantityKey?.trim() || "qualitative-principle"}`,
    ),
  };
}

function collectPublicNumbersFromSpec(value: unknown, hiddenSet: ReadonlySet<string>): number[] {
  const out: number[] = [];
  if (typeof value === "number" && Number.isFinite(value)) {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      out.push(...collectPublicNumbersFromSpec(item, hiddenSet));
    }
    return out;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (hiddenSet.has(k)) continue;
      out.push(...collectPublicNumbersFromSpec(v, hiddenSet));
    }
  }
  return out;
}

export function buildQwenDistillationTrace(
  input: BuildDistillationTraceInput,
): QwenDistillationTrace {
  const { candidate, bankItem, split } = input;

  const callHash = crypto
    .createHash("sha256")
    .update(`${bankItem.id}:${candidate.seed}`, "utf8")
    .digest("hex")
    .slice(0, 12);
  const toolCallId = `call_physics_${callHash}`;

  const userRequestPayload = {
    task: "generate_verified_physics_question",
    syllabi: bankItem.syllabi,
    domain: candidate.domain,
    conceptId: candidate.conceptId,
    templateArchetype: candidate.templateArchetype,
    visualFamily: bankItem.visualFamily,
    format: bankItem.format,
    difficulty: bankItem.difficulty,
    totalMarks: bankItem.totalMarks,
    seed: candidate.seed,
  };

  const preSolvePlan = buildPreSolveQuestionPlan(candidate);

  const scenarioProposalPayload = {
    action: "solve_and_render_scenario" as const,
    domain: candidate.domain,
    scenarioSpec: candidate.scenarioSpec,
    hiddenQuantities: candidate.hiddenQuantities,
    questionPlan: preSolvePlan,
  };
  const scenarioArgumentsJson = JSON.stringify(scenarioProposalPayload);

  const formattedQuantities3sf: Record<string, string> = {};
  for (const [key, val] of Object.entries(bankItem.verifiedQuantities)) {
    if (typeof val === "number" && Number.isFinite(val)) {
      formattedQuantities3sf[key] = formatSignificantFigures(val, 3);
    } else {
      formattedQuantities3sf[key] = String(val);
    }
  }

  const toolReceiptPayload = {
    status: "verified" as const,
    solverId: bankItem.provenance.solverId,
    domain: candidate.domain,
    verifiedQuantities: bankItem.verifiedQuantities,
    formattedQuantities3sf,
    hiddenQuantities: candidate.hiddenQuantities,
    visualReceipt: {
      rendered: bankItem.svgMarkup !== undefined,
      visualFamily: bankItem.visualFamily,
      publicLabels: input.publicVisualLabels ?? [],
      svgFingerprint: bankItem.provenance.svgFingerprint ?? null,
    },
  };

  const authoredPackagePayload =
    bankItem.format === "mcq"
      ? {
          format: "mcq" as const,
          difficulty: bankItem.difficulty,
          stem: bankItem.stem,
          options: bankItem.options,
          correctOptionIndex: bankItem.correctOptionIndex,
          workedSolution: bankItem.workedSolution,
          markScheme: bankItem.markScheme,
          totalMarks: bankItem.totalMarks,
        }
      : {
          format: "structured" as const,
          difficulty: bankItem.difficulty,
          stem: bankItem.stem,
          parts: bankItem.parts,
          workedSolution: bankItem.workedSolution,
          markScheme: bankItem.markScheme,
          totalMarks: bankItem.totalMarks,
        };

  return {
    schemaVersion: QWEN_DISTILLATION_TRACE_SCHEMA_VERSION,
    traceId: `trace-${bankItem.id}`,
    itemId: bankItem.id,
    targetModel: "Qwen/Qwen3.5-9B",
    messages: [
      {
        role: "system",
        content: QWEN_HARNESS_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify(userRequestPayload),
      },
      {
        role: "assistant",
        step: "propose_scenario",
        content: scenarioArgumentsJson,
        toolCall: {
          id: toolCallId,
          name: "solve_and_render_scenario",
          argumentsJson: scenarioArgumentsJson,
        },
      },
      {
        role: "tool",
        name: "physics_harness",
        toolCallId,
        content: JSON.stringify(toolReceiptPayload),
      },
      {
        role: "assistant",
        step: "author_package",
        content: JSON.stringify(authoredPackagePayload),
      },
    ],
    split,
    familyGroupKey: bankItem.familyGroupKey,
    seed: candidate.seed,
    metadata: {
      syllabi: bankItem.syllabi,
      domain: candidate.domain,
      conceptId: candidate.conceptId,
      templateArchetype: candidate.templateArchetype,
      visualFamily: bankItem.visualFamily,
      format: bankItem.format,
      difficulty: bankItem.difficulty,
      totalMarks: bankItem.totalMarks,
      shardId: bankItem.provenance.shardId,
      teacherModel: bankItem.provenance.generatorModel,
      solverId: bankItem.provenance.solverId,
      ...(bankItem.provenance.sourceParentId
        ? { sourceParentId: bankItem.provenance.sourceParentId }
        : {}),
      createdAt: bankItem.provenance.createdAt,
    },
  };
}

export function validateQwenDistillationTrace(
  trace: QwenDistillationTrace,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (trace.schemaVersion !== QWEN_DISTILLATION_TRACE_SCHEMA_VERSION) {
    issues.push(`Invalid schemaVersion: ${String(trace.schemaVersion)}`);
  }
  if (trace.targetModel !== "Qwen/Qwen3.5-9B") {
    issues.push(`Unexpected targetModel: ${String(trace.targetModel)}`);
  }
  if (!trace.familyGroupKey.includes("::")) {
    issues.push(`Invalid familyGroupKey: "${trace.familyGroupKey}"`);
  }
  if (!Array.isArray(trace.messages) || trace.messages.length !== 5) {
    issues.push(
      `QwenDistillationTrace must contain exactly 5 messages; found ${Array.isArray(trace.messages) ? trace.messages.length : 0}`,
    );
    return { valid: false, issues };
  }

  const expectedRoles = ["system", "user", "assistant", "tool", "assistant"] as const;
  for (let i = 0; i < 5; i += 1) {
    if (trace.messages[i].role !== expectedRoles[i]) {
      issues.push(
        `Message[${i}] expected role "${expectedRoles[i]}", received "${trace.messages[i].role}"`,
      );
    }
    if (!trace.messages[i].content.trim()) {
      issues.push(`Message[${i}] content must not be empty`);
    }
  }

  const msg2 = trace.messages[2];
  const msg3 = trace.messages[3];
  const msg4 = trace.messages[4];

  if (msg2.step !== "propose_scenario") {
    issues.push('Message[2] step must be "propose_scenario"');
  }
  if (msg4.step !== "author_package") {
    issues.push('Message[4] step must be "author_package"');
  }
  if (msg2.toolCall.id !== msg3.toolCallId) {
    issues.push(
      `Tool call ID mismatch: ${msg2.toolCall.id} !== ${msg3.toolCallId}`,
    );
  }

  const parsedMessages: Record<number, Record<string, unknown>> = {};
  for (const idx of [1, 2, 3, 4] as const) {
    try {
      const parsed: unknown = JSON.parse(trace.messages[idx].content);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        issues.push(`Message[${idx}] content must be a JSON object`);
      } else {
        parsedMessages[idx] = parsed as Record<string, unknown>;
      }
    } catch {
      issues.push(`Message[${idx}] content is not valid JSON`);
    }
  }

  // Verify Step 1 (propose_scenario) has zero post-solve distractorRationale or hidden answer leakage
  const step1Obj = parsedMessages[2];
  const receiptObj = parsedMessages[3];
  const step2Obj = parsedMessages[4];

  if (step1Obj && receiptObj && step2Obj) {
    const questionPlan = step1Obj.questionPlan as
      | CandidateQuestionPlan
      | undefined;
    if (questionPlan && typeof questionPlan === "object") {
      const postSolveOptions = Array.isArray(step2Obj.options)
        ? (step2Obj.options as Array<{
            isCorrect?: boolean;
            distractorRationale?: string;
          }>)
        : [];
      const postSolveRationaleSet = new Set(
        postSolveOptions
          .filter((o) => !o.isCorrect && typeof o.distractorRationale === "string")
          .map((o) => o.distractorRationale!.trim().toLowerCase())
          .filter(Boolean),
      );

      for (const entry of questionPlan.distractorStrategy ?? []) {
        if (
          typeof entry === "string" &&
          postSolveRationaleSet.has(entry.trim().toLowerCase())
        ) {
          issues.push(
            `Step 1 propose_scenario questionPlan.distractorStrategy leaks post-solve distractorRationale: "${entry}"`,
          );
        }
      }

      const hiddenKeys = Array.isArray(step1Obj.hiddenQuantities)
        ? (step1Obj.hiddenQuantities as unknown[]).filter(
            (k): k is string => typeof k === "string",
          )
        : [];
      const hiddenSet = new Set(hiddenKeys);
      const publicSpecNumbers = collectPublicNumbersFromSpec(
        step1Obj.scenarioSpec,
        hiddenSet,
      );
      const verifiedQuantities =
        receiptObj.verifiedQuantities !== null &&
        typeof receiptObj.verifiedQuantities === "object"
          ? (receiptObj.verifiedQuantities as Record<string, unknown>)
          : {};
      const planText = JSON.stringify(questionPlan);

      for (const hiddenKey of hiddenKeys) {
        const val = verifiedQuantities[hiddenKey];
        if (
          typeof val === "number" &&
          Number.isFinite(val) &&
          Math.abs(val) > 1e-12
        ) {
          const coincidesWithGiven = publicSpecNumbers.some((pub) =>
            numbersAgreeWithinTolerance(pub, val, {
              significantFigures: 3,
              relativeTolerance: 0.006,
            }),
          );
          if (
            !coincidesWithGiven &&
            textContainsNumericValue(planText, val, {
              significantFigures: 3,
              relativeTolerance: 0.005,
            })
          ) {
            issues.push(
              `Step 1 propose_scenario questionPlan leaks post-solve hidden quantity "${hiddenKey}" = ${formatSignificantFigures(val, 3)}`,
            );
          }
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
