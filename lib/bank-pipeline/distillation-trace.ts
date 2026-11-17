import crypto from "node:crypto";

import { formatSignificantFigures } from "./numeric-checker";
import {
  CandidateQuestionInput,
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

  const defaultPlan =
    candidate.questionPlan ??
    (bankItem.format === "mcq"
      ? {
          targetSummary: `Assess ${candidate.conceptId} (${candidate.templateArchetype}) via single-best-answer calculation/reasoning`,
          distractorStrategy: (bankItem.options ?? [])
            .filter((o) => !o.isCorrect && o.distractorRationale)
            .map((o) => o.distractorRationale!),
        }
      : {
          targetSummary: `Assess ${candidate.conceptId} (${candidate.templateArchetype}) via multi-step structured problem`,
          subpartStrategy: (bankItem.parts ?? []).map(
            (p) => `(${p.partId}) [${p.marks}]: ${p.targetQuantityKey ?? "conceptual reasoning"}`,
          ),
        });

  const scenarioProposalPayload = {
    action: "solve_and_render_scenario" as const,
    domain: candidate.domain,
    scenarioSpec: candidate.scenarioSpec,
    hiddenQuantities: candidate.hiddenQuantities,
    questionPlan: defaultPlan,
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

  for (const idx of [1, 2, 3, 4] as const) {
    try {
      const parsed: unknown = JSON.parse(trace.messages[idx].content);
      if (parsed === null || typeof parsed !== "object") {
        issues.push(`Message[${idx}] content must be a JSON object`);
      }
    } catch {
      issues.push(`Message[${idx}] content is not valid JSON`);
    }
  }

  return { valid: issues.length === 0, issues };
}
