import {
  DomainRenderOutput,
  DomainSolveOutput,
  getDomainAdapter,
  hasDomainAdapter,
} from "@/lib/bank-pipeline/domain-registry";
import {
  computeStemFingerprint,
  extractNumbersFromPhysicsText,
  formatSignificantFigures,
  SigFigToleranceOptions,
  textContainsNumericValue,
} from "@/lib/bank-pipeline/numeric-checker";
import { verifyCandidateWithGate } from "@/lib/bank-pipeline/package-gate";
import {
  checkSvgHiddenQuantityLeaks,
  inspectSvgSanity,
} from "@/lib/bank-pipeline/svg-guard";
import {
  CandidateQuestionInput,
  GateDiagnosticIssue,
  MarkSchemePoint,
  McqOptionItem,
  McqOptionLabel,
  MCQ_OPTION_LABELS,
  PhysicsDomainId,
  QuestionDifficulty,
  QUESTION_DIFFICULTIES,
  QuestionFormat,
  QUESTION_FORMATS,
  QuestionTargetMode,
  StructuredQuestionPart,
  SyllabusTag,
  VerifiedQuantityMap,
} from "@/lib/bank-pipeline/types";
import {
  computeDiversityMetrics,
  summarizeStratifiedBucket,
} from "@/lib/benchmark/stats";
import { checkSyllabusAlignment } from "@/lib/benchmark/syllabus-alignment-checker";
import {
  BenchmarkEvaluationReport,
  BenchmarkPromptMetadata,
  FailureBreakdownSummary,
  ItemRolloutEvaluation,
  ModelRolloutRecord,
  ParsedStep1Proposal,
  ParsedStep2Package,
  PhysicsHarnessToolReceipt,
  SIXTHPHYSICS_BENCHMARK_SCHEMA_VERSION,
  Step1BatchReceipt,
  Step1ProposalInput,
  StratifiedMetricsBucket,
} from "@/lib/benchmark/types";

const DIRECTIONAL_PROSE_PATTERN =
  /\b(?:left|right|up|upward|upwards|down|downward|downwards|north|south|east|west|inward|outward|into|out of|towards?|away|oppos|clock|anticlock|counterclock|loss|lost|decreas|decelerat|retard)\b/i;

const NON_PARAMETER_SPEC_KEYS = new Set([
  "id",
  "kind",
  "width",
  "height",
  "seed",
  "hiddenQuantities",
  "visibility",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Extracts a JSON object from raw LLM assistant output, stripping optional
 * `<think>...</think>`, `<tool_call>...</tool_call>`, or markdown code fences.
 */
export function extractJsonObjectFromAssistantText(
  raw: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "Assistant output is empty" };
  }

  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const toolCallMatch = /<tool_call>([\s\S]*?)<\/tool_call>/i.exec(cleaned);
  if (toolCallMatch) {
    cleaned = toolCallMatch[1].trim();
  }

  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(cleaned);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  const tryParseObject = (
    candidate: string,
  ): Record<string, unknown> | undefined => {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isPlainObject(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to balanced-brace extraction
    }
    return undefined;
  };

  const direct = tryParseObject(cleaned);
  if (direct) {
    return { ok: true, value: direct };
  }

  const start = cleaned.indexOf("{");
  if (start === -1) {
    return {
      ok: false,
      error: "No JSON object '{...}' found in assistant output",
    };
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const sub = cleaned.slice(start, i + 1);
        const extracted = tryParseObject(sub);
        if (extracted) {
          return { ok: true, value: extracted };
        }
        break;
      }
    }
  }

  return {
    ok: false,
    error: `Failed to parse valid JSON object from assistant output (prefix: "${cleaned.slice(0, 100)}")`,
  };
}

function unwrapToolCallWrapper(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  if (isPlainObject(obj.scenarioSpec)) {
    return obj;
  }
  if (isPlainObject(obj.arguments)) {
    return obj.arguments;
  }
  if (typeof obj.arguments === "string") {
    const inner = extractJsonObjectFromAssistantText(obj.arguments);
    if (inner.ok) return inner.value;
  }
  if (typeof obj.argumentsJson === "string") {
    const inner = extractJsonObjectFromAssistantText(obj.argumentsJson);
    if (inner.ok) return inner.value;
  }
  if (isPlainObject(obj.toolCall)) {
    const tc = obj.toolCall;
    if (typeof tc.argumentsJson === "string") {
      const inner = extractJsonObjectFromAssistantText(tc.argumentsJson);
      if (inner.ok) return inner.value;
    }
    if (isPlainObject(tc.arguments)) {
      return tc.arguments;
    }
  }
  return obj;
}

function mergeHiddenQuantities(
  scenarioSpec: Record<string, unknown>,
  declaredHidden: readonly string[],
): string[] {
  const rawList: string[] = [];
  if (Array.isArray(scenarioSpec.hiddenQuantities)) {
    for (const item of scenarioSpec.hiddenQuantities) {
      if (typeof item === "string" && item.trim()) {
        rawList.push(item.trim());
      }
    }
  }
  if (isPlainObject(scenarioSpec.visibility)) {
    const visHidden = scenarioSpec.visibility.hiddenQuantities;
    if (Array.isArray(visHidden)) {
      for (const item of visHidden) {
        if (typeof item === "string" && item.trim()) {
          rawList.push(item.trim());
        }
      }
    }
  }
  for (const item of declaredHidden) {
    if (typeof item === "string" && item.trim()) {
      rawList.push(item.trim());
    }
  }
  return [...new Set(rawList)];
}

function parseQuestionPlan(
  rawPlan: unknown,
): ParsedStep1Proposal["questionPlan"] | undefined {
  if (!isPlainObject(rawPlan)) {
    return undefined;
  }
  const targetSummary =
    typeof rawPlan.targetSummary === "string"
      ? rawPlan.targetSummary.trim()
      : "";
  if (!targetSummary) {
    return undefined;
  }
  const toStringList = (val: unknown): string[] | undefined => {
    if (!Array.isArray(val)) return undefined;
    const filtered = val
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
    return filtered.length > 0 ? filtered : undefined;
  };

  const distractorStrategy = toStringList(rawPlan.distractorStrategy);
  const subpartStrategy = toStringList(rawPlan.subpartStrategy);
  const assumptions = toStringList(rawPlan.assumptions);

  return {
    targetSummary,
    ...(distractorStrategy ? { distractorStrategy } : {}),
    ...(subpartStrategy ? { subpartStrategy } : {}),
    ...(assumptions ? { assumptions } : {}),
  };
}

/**
 * Deterministic Step 1 solver + SVG renderer + student hidden-quantity leak guard.
 */
export function solveStep1Proposal(
  input: Step1ProposalInput,
): Step1BatchReceipt {
  const id = input.id?.trim() || "unknown-id";
  const requestedDomain = input.domain?.trim();

  const parsedRaw = extractJsonObjectFromAssistantText(input.assistantStep1Raw);
  if (!parsedRaw.ok) {
    return {
      id,
      ...(requestedDomain ? { domain: requestedDomain } : {}),
      valid: false,
      jsonValid: false,
      errorStage: "json-parse",
      errorMessage: parsedRaw.error,
    };
  }

  const obj = unwrapToolCallWrapper(parsedRaw.value);
  const proposedDomain =
    typeof obj.domain === "string" && obj.domain.trim()
      ? obj.domain.trim()
      : undefined;

  if (!isPlainObject(obj.scenarioSpec)) {
    return {
      id,
      ...(requestedDomain ?? proposedDomain
        ? { domain: requestedDomain ?? proposedDomain }
        : {}),
      valid: false,
      jsonValid: true,
      errorStage: "step1-schema",
      errorMessage: "Step 1 JSON must contain a plain object 'scenarioSpec'",
    };
  }

  if (!Array.isArray(obj.hiddenQuantities)) {
    return {
      id,
      ...(requestedDomain ?? proposedDomain
        ? { domain: requestedDomain ?? proposedDomain }
        : {}),
      valid: false,
      jsonValid: true,
      errorStage: "step1-schema",
      errorMessage: "Step 1 JSON must contain an array 'hiddenQuantities'",
    };
  }

  const declaredHidden = obj.hiddenQuantities
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    .map((k) => k.trim());
  const effectiveHiddenQuantities = mergeHiddenQuantities(
    obj.scenarioSpec,
    declaredHidden,
  );

  if (effectiveHiddenQuantities.length === 0) {
    return {
      id,
      ...(requestedDomain ?? proposedDomain
        ? { domain: requestedDomain ?? proposedDomain }
        : {}),
      valid: false,
      jsonValid: true,
      errorStage: "step1-schema",
      errorMessage:
        "Step 1 'hiddenQuantities' must declare at least one target unknown",
    };
  }

  const questionPlan = parseQuestionPlan(obj.questionPlan);
  if (!questionPlan) {
    return {
      id,
      ...(requestedDomain ?? proposedDomain
        ? { domain: requestedDomain ?? proposedDomain }
        : {}),
      valid: false,
      jsonValid: true,
      errorStage: "step1-schema",
      errorMessage:
        "Step 1 JSON must contain 'questionPlan' with a non-empty 'targetSummary'",
    };
  }

  if (
    requestedDomain &&
    proposedDomain &&
    hasDomainAdapter(requestedDomain) &&
    hasDomainAdapter(proposedDomain) &&
    requestedDomain !== proposedDomain
  ) {
    return {
      id,
      domain: requestedDomain,
      valid: false,
      jsonValid: true,
      errorStage: "domain-mismatch",
      errorMessage: `Proposed domain "${proposedDomain}" conflicts with prompt domain "${requestedDomain}"`,
    };
  }

  const effectiveDomainRaw = requestedDomain || proposedDomain || "";
  if (!effectiveDomainRaw || !hasDomainAdapter(effectiveDomainRaw)) {
    return {
      id,
      ...(effectiveDomainRaw ? { domain: effectiveDomainRaw } : {}),
      valid: false,
      jsonValid: true,
      errorStage: "unknown-domain",
      errorMessage: `Domain "${effectiveDomainRaw}" is not registered in domain-registry`,
    };
  }

  const effectiveDomain = effectiveDomainRaw as PhysicsDomainId;
  const adapter = getDomainAdapter(effectiveDomain);

  const validation = adapter.validateScenario(obj.scenarioSpec);
  if (!validation.valid) {
    return {
      id,
      domain: effectiveDomain,
      valid: false,
      jsonValid: true,
      errorStage: "scenario-validation",
      errorMessage:
        validation.issues.join("; ") || "Scenario validation failed",
    };
  }

  let solveOutput: DomainSolveOutput;
  try {
    solveOutput = adapter.solveScenario(obj.scenarioSpec);
  } catch (error) {
    return {
      id,
      domain: effectiveDomain,
      valid: false,
      jsonValid: true,
      errorStage: "solver",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  for (const [key, val] of Object.entries(solveOutput.quantities)) {
    if (typeof val === "number" && !Number.isFinite(val)) {
      return {
        id,
        domain: effectiveDomain,
        valid: false,
        jsonValid: true,
        errorStage: "solver",
        errorMessage: `Solver produced non-finite quantity "${key}" = ${String(val)}`,
      };
    }
  }

  let renderOutput: DomainRenderOutput | undefined;
  if (adapter.renderSvg) {
    try {
      renderOutput = adapter.renderSvg(obj.scenarioSpec, {
        hiddenQuantities: effectiveHiddenQuantities,
        id,
      });
    } catch (error) {
      return {
        id,
        domain: effectiveDomain,
        valid: false,
        jsonValid: true,
        errorStage: "svg-render",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const svgMarkup = renderOutput?.svgMarkup;
  let svgFingerprint: string | null = null;

  if (svgMarkup !== undefined) {
    const sanity = inspectSvgSanity(svgMarkup);
    svgFingerprint = sanity.svgSha256;
    if (!sanity.valid) {
      return {
        id,
        domain: effectiveDomain,
        valid: false,
        jsonValid: true,
        errorStage: "svg-sanity",
        errorMessage: sanity.issues.join("; "),
      };
    }

    const declaredPublicScalarNums: number[] = [];
    const hiddenSet = new Set(effectiveHiddenQuantities);
    for (const [k, v] of Object.entries(obj.scenarioSpec)) {
      if (!hiddenSet.has(k) && typeof v === "number" && Number.isFinite(v)) {
        declaredPublicScalarNums.push(v);
      }
    }

    const publicNumbers = [
      ...(renderOutput?.publicNumbers ?? []),
      ...(solveOutput.publicNumbers ?? []),
      ...declaredPublicScalarNums,
    ];
    const publicLabels = [
      ...(renderOutput?.publicLabels ?? []),
      ...(solveOutput.publicLabels ?? []),
    ];

    const leaks = checkSvgHiddenQuantityLeaks({
      svgMarkup,
      hiddenQuantities: effectiveHiddenQuantities,
      verifiedQuantities: solveOutput.quantities,
      publicNumbers,
      publicLabels,
    });
    if (leaks.length > 0) {
      return {
        id,
        domain: effectiveDomain,
        valid: false,
        jsonValid: true,
        errorStage: "svg-leak",
        errorMessage: leaks.join("; "),
      };
    }
  }

  const formattedQuantities3sf: Record<string, string> = {};
  for (const [key, val] of Object.entries(solveOutput.quantities)) {
    if (typeof val === "number" && Number.isFinite(val)) {
      formattedQuantities3sf[key] = formatSignificantFigures(val, 3);
    } else {
      formattedQuantities3sf[key] = String(val);
    }
  }

  const visualFamily =
    renderOutput?.visualFamily ?? adapter.defaultVisualFamily;

  const toolReceiptPayload: PhysicsHarnessToolReceipt = {
    status: "verified",
    solverId: solveOutput.solverId,
    domain: effectiveDomain,
    verifiedQuantities: solveOutput.quantities,
    formattedQuantities3sf,
    hiddenQuantities: effectiveHiddenQuantities,
    visualReceipt: {
      rendered: svgMarkup !== undefined,
      visualFamily,
      publicLabels: renderOutput?.publicLabels ?? [],
      svgFingerprint,
    },
  };

  return {
    id,
    domain: effectiveDomain,
    valid: true,
    jsonValid: true,
    solverId: solveOutput.solverId,
    visualFamily,
    toolReceiptJson: JSON.stringify(toolReceiptPayload),
    verifiedQuantities: solveOutput.quantities,
    formattedQuantities3sf,
    hiddenQuantities: effectiveHiddenQuantities,
    ...(svgMarkup !== undefined ? { svgMarkup } : {}),
    parsedProposal: {
      ...(typeof obj.action === "string" ? { action: obj.action } : {}),
      domain: effectiveDomain,
      scenarioSpec: obj.scenarioSpec,
      hiddenQuantities: effectiveHiddenQuantities,
      questionPlan,
    },
  };
}

export function solveStep1Batch(
  inputs: readonly Step1ProposalInput[],
): Step1BatchReceipt[] {
  return inputs.map((item) => solveStep1Proposal(item));
}

function textMatchesSignedTruth(
  text: string,
  expected: number,
  tol: SigFigToleranceOptions,
): boolean {
  if (textContainsNumericValue(text, expected, tol)) {
    return true;
  }
  if (expected < 0 && DIRECTIONAL_PROSE_PATTERN.test(text)) {
    return textContainsNumericValue(text, Math.abs(expected), {
      ...tol,
      allowMagnitudeMatch: true,
    });
  }
  return false;
}

function normalizeQualitativePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textMatchesQualitativeTruth(
  text: string,
  expected: string | boolean,
): boolean {
  const normalizedHaystack = normalizeQualitativePhrase(text);
  if (!normalizedHaystack) return false;
  if (typeof expected === "boolean") {
    const token = expected ? "true" : "false";
    const yesNo = expected ? "yes" : "no";
    return (
      new RegExp(`\\b${token}\\b`).test(normalizedHaystack) ||
      new RegExp(`\\b${yesNo}\\b`).test(normalizedHaystack)
    );
  }
  const normalizedExpected = normalizeQualitativePhrase(expected);
  return Boolean(normalizedExpected && normalizedHaystack.includes(normalizedExpected));
}

function buildScenarioParameterSignature(
  domain: string,
  scenarioSpec: Record<string, unknown>,
): string {
  const tokens: string[] = [
    domain,
    typeof scenarioSpec.kind === "string" ? scenarioSpec.kind : "default",
  ];
  const sortedKeys = Object.keys(scenarioSpec)
    .filter((k) => !NON_PARAMETER_SPEC_KEYS.has(k))
    .sort();

  for (const k of sortedKeys) {
    const v = scenarioSpec[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      tokens.push(`${k}=${formatSignificantFigures(v, 4)}`);
    } else if (typeof v === "string" || typeof v === "boolean") {
      tokens.push(`${k}=${String(v)}`);
    } else if (Array.isArray(v)) {
      tokens.push(`${k}=${JSON.stringify(v)}`);
    }
  }
  return tokens.join("|");
}

function listEligibleTargetKeys(
  verifiedQuantities: VerifiedQuantityMap,
  scenarioSpec: Record<string, unknown>,
  hiddenQuantities: readonly string[],
): {
  orderedKeys: string[];
  hiddenSet: ReadonlySet<string>;
} {
  const hiddenSet = new Set(hiddenQuantities);
  const publicSpecInputKeys = new Set(
    Object.keys(scenarioSpec).filter((k) => !hiddenSet.has(k)),
  );

  // Priority 1: explicitly declared hiddenQuantities present in solver outputs
  const priorityHidden = hiddenQuantities.filter(
    (k) => k in verifiedQuantities && k !== "kind" && k !== "id",
  );

  // Priority 2: derived solver outputs that are not unhidden scenarioSpec inputs
  const derivedExtras = Object.keys(verifiedQuantities).filter(
    (k) =>
      !hiddenSet.has(k) &&
      !publicSpecInputKeys.has(k) &&
      k !== "kind" &&
      k !== "id",
  );

  return {
    orderedKeys: [...priorityHidden, ...derivedExtras],
    hiddenSet,
  };
}

function inferMcqTargetQuantity(params: {
  options: readonly McqOptionItem[];
  workedSolution: string;
  markScheme: readonly MarkSchemePoint[];
  verifiedQuantities: VerifiedQuantityMap;
  scenarioSpec: Record<string, unknown>;
  hiddenQuantities: readonly string[];
  tol: SigFigToleranceOptions;
}): {
  targetQuantityKey?: string;
  targetMode?: QuestionTargetMode;
} {
  const correctOptions = params.options.filter((o) => o.isCorrect);
  if (correctOptions.length !== 1) {
    return {};
  }
  const correctOpt = correctOptions[0];
  const distractors = params.options.filter((o) => !o.isCorrect);
  const schemeText = [
    params.workedSolution,
    ...params.markScheme.map((m) => m.criterion),
  ].join(" ");

  const { orderedKeys } = listEligibleTargetKeys(
    params.verifiedQuantities,
    params.scenarioSpec,
    params.hiddenQuantities,
  );

  const numericMentions = extractNumbersFromPhysicsText(correctOpt.text);

  if (numericMentions.length > 0) {
    const correctHasDirection = DIRECTIONAL_PROSE_PATTERN.test(correctOpt.text);
    // First pass: matches correctOpt AND workedSolution/markScheme AND no distractor collision
    for (const key of orderedKeys) {
      const val = params.verifiedQuantities[key];
      if (typeof val !== "number" || !Number.isFinite(val)) continue;
      if (!textMatchesSignedTruth(correctOpt.text, val, params.tol)) continue;
      if (!textMatchesSignedTruth(schemeText, val, params.tol)) continue;

      const distractorCollides =
        !correctHasDirection &&
        distractors.some(
          (d) =>
            !DIRECTIONAL_PROSE_PATTERN.test(d.text) &&
            textContainsNumericValue(d.text, val, {
              significantFigures: 3,
              relativeTolerance: 0.005,
            }),
        );
      if (!distractorCollides) {
        return { targetQuantityKey: key, targetMode: "quantitative" };
      }
    }

    // Second pass: matches correctOpt so gate can report exact workedSolution or distractor diagnostic
    for (const key of orderedKeys) {
      const val = params.verifiedQuantities[key];
      if (typeof val !== "number" || !Number.isFinite(val)) continue;
      if (textMatchesSignedTruth(correctOpt.text, val, params.tol)) {
        return { targetQuantityKey: key, targetMode: "quantitative" };
      }
    }

    // Fallback to first numeric hidden key so gate reports concrete expected value vs actual option text
    const fallbackNumericKey = orderedKeys.find(
      (k) => typeof params.verifiedQuantities[k] === "number",
    );
    return fallbackNumericKey
      ? { targetQuantityKey: fallbackNumericKey, targetMode: "quantitative" }
      : { targetMode: "quantitative" };
  }

  // Qualitative MCQ (no numbers in correct option)
  for (const key of orderedKeys) {
    const val = params.verifiedQuantities[key];
    if (typeof val === "string" || typeof val === "boolean") {
      if (
        textMatchesQualitativeTruth(correctOpt.text, val) &&
        textMatchesQualitativeTruth(schemeText, val)
      ) {
        return { targetQuantityKey: key, targetMode: "qualitative" };
      }
    }
  }
  for (const key of orderedKeys) {
    const val = params.verifiedQuantities[key];
    if (typeof val === "string" || typeof val === "boolean") {
      if (textMatchesQualitativeTruth(correctOpt.text, val)) {
        return { targetQuantityKey: key, targetMode: "qualitative" };
      }
    }
  }

  const fallbackQualKey = orderedKeys.find((k) => {
    const v = params.verifiedQuantities[k];
    return typeof v === "string" || typeof v === "boolean";
  });
  return fallbackQualKey
    ? { targetQuantityKey: fallbackQualKey, targetMode: "qualitative" }
    : { targetMode: "qualitative" };
}

function inferStructuredSubpartTargets(params: {
  parts: readonly StructuredQuestionPart[];
  workedSolution: string;
  markScheme: readonly MarkSchemePoint[];
  verifiedQuantities: VerifiedQuantityMap;
  scenarioSpec: Record<string, unknown>;
  hiddenQuantities: readonly string[];
  tol: SigFigToleranceOptions;
}): {
  enrichedParts: StructuredQuestionPart[];
  inferredKeys: string[];
} {
  const { orderedKeys } = listEligibleTargetKeys(
    params.verifiedQuantities,
    params.scenarioSpec,
    params.hiddenQuantities,
  );
  const inferredKeys: string[] = [];

  const enrichedParts = params.parts.map((part) => {
    if (part.targetQuantityKey?.trim()) {
      inferredKeys.push(part.targetQuantityKey.trim());
      return part;
    }

    const answerNums = extractNumbersFromPhysicsText(part.expectedAnswer ?? "");
    if (answerNums.length > 0 && part.targetMode !== "qualitative") {
      const partSchemeText = params.markScheme
        .filter(
          (m) =>
            m.partId === part.partId ||
            (params.parts.length === 1 && m.partId === undefined),
        )
        .map((m) => m.criterion)
        .join(" ");

      // First pass: matches expectedAnswer + workedSolution + partSchemeText
      for (const key of orderedKeys) {
        const val = params.verifiedQuantities[key];
        if (typeof val !== "number" || !Number.isFinite(val)) continue;
        if (
          textMatchesSignedTruth(part.expectedAnswer, val, params.tol) &&
          textMatchesSignedTruth(params.workedSolution, val, params.tol) &&
          (!partSchemeText ||
            textMatchesSignedTruth(partSchemeText, val, params.tol))
        ) {
          inferredKeys.push(key);
          return {
            ...part,
            targetMode: "quantitative" as const,
            targetQuantityKey: key,
          };
        }
      }

      // Second pass: matches expectedAnswer alone so gate emits specific workedSolution/scheme issue
      for (const key of orderedKeys) {
        const val = params.verifiedQuantities[key];
        if (typeof val !== "number" || !Number.isFinite(val)) continue;
        if (textMatchesSignedTruth(part.expectedAnswer, val, params.tol)) {
          inferredKeys.push(key);
          return {
            ...part,
            targetMode: "quantitative" as const,
            targetQuantityKey: key,
          };
        }
      }

      return part;
    }

    // Non-numeric subpart: check if it matches a solver string/boolean classification
    for (const key of orderedKeys) {
      const val = params.verifiedQuantities[key];
      if (typeof val === "string" || typeof val === "boolean") {
        if (textMatchesQualitativeTruth(part.expectedAnswer ?? "", val)) {
          inferredKeys.push(key);
          return {
            ...part,
            targetMode: "qualitative" as const,
            targetQuantityKey: key,
          };
        }
      }
    }

    return part;
  });

  return { enrichedParts, inferredKeys };
}

function parseStep2PackageObject(
  obj: Record<string, unknown>,
  fallbackFormat: QuestionFormat,
  fallbackDifficulty: QuestionDifficulty,
): {
  parsed?: ParsedStep2Package;
  extraGateIssues: GateDiagnosticIssue[];
} {
  const extraGateIssues: GateDiagnosticIssue[] = [];

  const rawFormat =
    typeof obj.format === "string" ? obj.format.trim() : fallbackFormat;
  const format: QuestionFormat = QUESTION_FORMATS.includes(
    rawFormat as QuestionFormat,
  )
    ? (rawFormat as QuestionFormat)
    : fallbackFormat;

  if (
    typeof obj.format === "string" &&
    obj.format.trim() !== fallbackFormat
  ) {
    extraGateIssues.push({
      code: "invalid-candidate-schema",
      stage: "schema",
      message: `Step 2 format "${obj.format.trim()}" does not match requested prompt format "${fallbackFormat}"`,
      expected: fallbackFormat,
      actual: obj.format.trim(),
    });
  }

  const rawDiff =
    typeof obj.difficulty === "string"
      ? obj.difficulty.trim()
      : fallbackDifficulty;
  const difficulty: QuestionDifficulty = QUESTION_DIFFICULTIES.includes(
    rawDiff as QuestionDifficulty,
  )
    ? (rawDiff as QuestionDifficulty)
    : fallbackDifficulty;

  const stem = typeof obj.stem === "string" ? obj.stem : "";
  const workedSolution =
    typeof obj.workedSolution === "string" ? obj.workedSolution : "";
  const totalMarks =
    typeof obj.totalMarks === "number" ? obj.totalMarks : Number.NaN;

  let options: McqOptionItem[] | undefined;
  if (Array.isArray(obj.options)) {
    const explicitCorrectIdx =
      typeof obj.correctOptionIndex === "number" &&
      Number.isInteger(obj.correctOptionIndex)
        ? obj.correctOptionIndex
        : undefined;

    options = obj.options.map((rawOpt, idx) => {
      if (!isPlainObject(rawOpt)) {
        return {
          label: (MCQ_OPTION_LABELS[idx] ?? "A") as McqOptionLabel,
          text: "",
          isCorrect: false,
        };
      }
      const label =
        typeof rawOpt.label === "string"
          ? (rawOpt.label.trim() as McqOptionLabel)
          : ((MCQ_OPTION_LABELS[idx] ?? "A") as McqOptionLabel);
      const text = typeof rawOpt.text === "string" ? rawOpt.text : "";
      const hasBooleanIsCorrect = typeof rawOpt.isCorrect === "boolean";
      const isCorrect = hasBooleanIsCorrect
        ? Boolean(rawOpt.isCorrect)
        : explicitCorrectIdx === idx;
      const distractorRationale =
        typeof rawOpt.distractorRationale === "string"
          ? rawOpt.distractorRationale
          : undefined;
      return {
        label,
        text,
        isCorrect,
        ...(distractorRationale !== undefined ? { distractorRationale } : {}),
      };
    });

    if (explicitCorrectIdx !== undefined) {
      if (
        explicitCorrectIdx < 0 ||
        explicitCorrectIdx >= options.length ||
        !options[explicitCorrectIdx].isCorrect
      ) {
        extraGateIssues.push({
          code: "mcq-non-unique-correct",
          stage: "mcq",
          message: `correctOptionIndex (${String(explicitCorrectIdx)}) disagrees with option isCorrect flags`,
        });
      }
    }
  }

  let parts: StructuredQuestionPart[] | undefined;
  if (Array.isArray(obj.parts)) {
    parts = obj.parts.map((rawPart, idx) => {
      if (!isPlainObject(rawPart)) {
        return {
          partId: `p${idx + 1}`,
          prompt: "",
          marks: 0,
          expectedAnswer: "",
          workingSteps: [],
        };
      }
      const workingSteps = Array.isArray(rawPart.workingSteps)
        ? rawPart.workingSteps.filter((s): s is string => typeof s === "string")
        : [];
      const dependsOnPartIds = Array.isArray(rawPart.dependsOnPartIds)
        ? rawPart.dependsOnPartIds.filter(
            (d): d is string => typeof d === "string",
          )
        : undefined;
      const targetMode =
        rawPart.targetMode === "quantitative" ||
        rawPart.targetMode === "qualitative"
          ? rawPart.targetMode
          : undefined;
      const targetQuantityKey =
        typeof rawPart.targetQuantityKey === "string"
          ? rawPart.targetQuantityKey
          : undefined;

      return {
        partId:
          typeof rawPart.partId === "string" ? rawPart.partId : `p${idx + 1}`,
        prompt: typeof rawPart.prompt === "string" ? rawPart.prompt : "",
        marks:
          typeof rawPart.marks === "number" ? rawPart.marks : Number.NaN,
        ...(dependsOnPartIds ? { dependsOnPartIds } : {}),
        ...(targetMode ? { targetMode } : {}),
        ...(targetQuantityKey ? { targetQuantityKey } : {}),
        expectedAnswer:
          typeof rawPart.expectedAnswer === "string"
            ? rawPart.expectedAnswer
            : "",
        workingSteps,
      };
    });
  }

  const markScheme: MarkSchemePoint[] = Array.isArray(obj.markScheme)
    ? obj.markScheme.map((rawPt) => {
        if (!isPlainObject(rawPt)) {
          return { code: "", criterion: "", marks: 0 };
        }
        return {
          code: typeof rawPt.code === "string" ? rawPt.code : "",
          criterion:
            typeof rawPt.criterion === "string" ? rawPt.criterion : "",
          marks:
            typeof rawPt.marks === "number" ? rawPt.marks : Number.NaN,
          ...(typeof rawPt.partId === "string"
            ? { partId: rawPt.partId }
            : {}),
        };
      })
    : [];

  const targetMode =
    obj.targetMode === "quantitative" || obj.targetMode === "qualitative"
      ? obj.targetMode
      : undefined;
  const targetQuantityKey =
    typeof obj.targetQuantityKey === "string"
      ? obj.targetQuantityKey
      : undefined;

  return {
    parsed: {
      format,
      difficulty,
      stem,
      ...(options ? { options } : {}),
      ...(typeof obj.correctOptionIndex === "number"
        ? { correctOptionIndex: obj.correctOptionIndex }
        : {}),
      ...(parts ? { parts } : {}),
      ...(targetMode ? { targetMode } : {}),
      ...(targetQuantityKey ? { targetQuantityKey } : {}),
      workedSolution,
      markScheme,
      totalMarks,
    },
    extraGateIssues,
  };
}

export function parsePromptMetadataFromRecord(
  record: Record<string, unknown>,
  fallbackIndex = 0,
): BenchmarkPromptMetadata {
  const id =
    (typeof record.itemId === "string" && record.itemId.trim()) ||
    (typeof record.id === "string" && record.id.trim()) ||
    (typeof record.traceId === "string" && record.traceId.trim()) ||
    `prompt-${fallbackIndex + 1}`;

  let userPayload: Record<string, unknown> = {};
  if (Array.isArray(record.messages) && record.messages.length >= 2) {
    const userMsg = record.messages[1];
    if (isPlainObject(userMsg) && typeof userMsg.content === "string") {
      try {
        const parsed: unknown = JSON.parse(userMsg.content);
        if (isPlainObject(parsed)) {
          userPayload = parsed;
        }
      } catch {
        // ignore
      }
    }
  }

  const meta = isPlainObject(record.metadata) ? record.metadata : {};
  const pick = <T>(
    key: string,
    guard: (v: unknown) => v is T,
    fallback: T,
  ): T => {
    if (guard(userPayload[key])) return userPayload[key] as T;
    if (guard(meta[key])) return meta[key] as T;
    if (guard(record[key])) return record[key] as T;
    return fallback;
  };

  const isString = (v: unknown): v is string =>
    typeof v === "string" && v.trim().length > 0;
  const isInt = (v: unknown): v is number =>
    typeof v === "number" && Number.isInteger(v);

  const rawSyllabi =
    (Array.isArray(userPayload.syllabi) && userPayload.syllabi) ||
    (Array.isArray(meta.syllabi) && meta.syllabi) ||
    (Array.isArray(record.syllabi) && record.syllabi) ||
    [];

  const syllabi: SyllabusTag[] = rawSyllabi
    .filter(isPlainObject)
    .map((s) => ({
      syllabus: String(s.syllabus ?? "") as SyllabusTag["syllabus"],
      level: String(s.level ?? ""),
      topicId: String(s.topicId ?? ""),
      ...(typeof s.subtopicId === "string" && s.subtopicId.trim()
        ? { subtopicId: s.subtopicId.trim() }
        : {}),
    }));

  const domain = pick("domain", isString, "mechanics") as PhysicsDomainId;
  const conceptId = pick("conceptId", isString, "unknown-concept");
  const templateArchetype = pick(
    "templateArchetype",
    isString,
    "unknown-archetype",
  );
  const visualFamily = pick("visualFamily", isString, domain);
  const formatRaw = pick("format", isString, "mcq");
  const format: QuestionFormat = QUESTION_FORMATS.includes(
    formatRaw as QuestionFormat,
  )
    ? (formatRaw as QuestionFormat)
    : "mcq";
  const diffRaw = pick("difficulty", isString, "standard");
  const difficulty: QuestionDifficulty = QUESTION_DIFFICULTIES.includes(
    diffRaw as QuestionDifficulty,
  )
    ? (diffRaw as QuestionDifficulty)
    : "standard";
  const totalMarks = pick(
    "totalMarks",
    isInt,
    format === "mcq" ? 1 : 6,
  );
  const seed = pick("seed", isInt, 0);

  return {
    id,
    syllabi,
    domain,
    conceptId,
    templateArchetype,
    visualFamily,
    format,
    difficulty,
    totalMarks,
    seed,
    ...(typeof record.split === "string" ? { split: record.split } : {}),
    ...(typeof record.familyGroupKey === "string"
      ? { familyGroupKey: record.familyGroupKey }
      : {}),
  };
}

export function coerceRolloutRecord(
  rawObj: Record<string, unknown>,
  fallbackIndex = 0,
): ModelRolloutRecord {
  const id =
    (typeof rawObj.id === "string" && rawObj.id.trim()) ||
    (typeof rawObj.itemId === "string" && rawObj.itemId.trim()) ||
    (typeof rawObj.traceId === "string" && rawObj.traceId.trim()) ||
    `rollout-${fallbackIndex + 1}`;
  const itemId =
    (typeof rawObj.itemId === "string" && rawObj.itemId.trim()) || undefined;
  const domain =
    (typeof rawObj.domain === "string" && rawObj.domain.trim()) || undefined;

  let assistantStep1Raw =
    typeof rawObj.assistantStep1Raw === "string"
      ? rawObj.assistantStep1Raw
      : isPlainObject(rawObj.assistantStep1Raw)
        ? JSON.stringify(rawObj.assistantStep1Raw)
        : typeof rawObj.step1Raw === "string"
          ? rawObj.step1Raw
          : undefined;

  let assistantStep2Raw =
    typeof rawObj.assistantStep2Raw === "string"
      ? rawObj.assistantStep2Raw
      : isPlainObject(rawObj.assistantStep2Raw)
        ? JSON.stringify(rawObj.assistantStep2Raw)
        : typeof rawObj.step2Raw === "string"
          ? rawObj.step2Raw
          : undefined;

  let toolReceiptRaw =
    typeof rawObj.toolReceiptRaw === "string" ? rawObj.toolReceiptRaw : undefined;

  if (Array.isArray(rawObj.messages)) {
    const msgs = rawObj.messages;
    if (assistantStep1Raw === undefined && msgs.length >= 3 && isPlainObject(msgs[2])) {
      if (typeof msgs[2].content === "string") {
        assistantStep1Raw = msgs[2].content;
      }
    }
    if (toolReceiptRaw === undefined && msgs.length >= 4 && isPlainObject(msgs[3])) {
      if (typeof msgs[3].content === "string") {
        toolReceiptRaw = msgs[3].content;
      }
    }
    if (assistantStep2Raw === undefined && msgs.length >= 5 && isPlainObject(msgs[4])) {
      if (typeof msgs[4].content === "string") {
        assistantStep2Raw = msgs[4].content;
      }
    }
  }

  const promptMetadata = isPlainObject(rawObj.promptMetadata)
    ? (parsePromptMetadataFromRecord(rawObj.promptMetadata, fallbackIndex) as Partial<BenchmarkPromptMetadata>)
    : Array.isArray(rawObj.messages) || isPlainObject(rawObj.metadata)
      ? parsePromptMetadataFromRecord(rawObj, fallbackIndex)
      : undefined;

  return {
    id,
    ...(itemId ? { itemId } : {}),
    ...(domain ? { domain } : {}),
    ...(assistantStep1Raw !== undefined ? { assistantStep1Raw } : {}),
    ...(toolReceiptRaw !== undefined ? { toolReceiptRaw } : {}),
    ...(assistantStep2Raw !== undefined ? { assistantStep2Raw } : {}),
    ...(typeof rawObj.attemptsUsed === "number"
      ? { attemptsUsed: rawObj.attemptsUsed }
      : {}),
    ...(typeof rawObj.mode === "string" ? { mode: rawObj.mode } : {}),
    ...(promptMetadata ? { promptMetadata } : {}),
  };
}

/**
 * Evaluates a single 2-step neuro-symbolic model rollout against the deterministic
 * physics solver, SVG non-leakage guard, 3-sig-fig package gate, and 3-syllabus catalogue.
 */
export function evaluateSingleRollout(
  prompt: BenchmarkPromptMetadata,
  rollout: ModelRolloutRecord | undefined,
): ItemRolloutEvaluation {
  const rolloutId = rollout?.id?.trim() || prompt.id;
  const tol: SigFigToleranceOptions = {
    significantFigures: 3,
    relativeTolerance: 0.01,
    absoluteZeroTolerance: 1e-9,
  };

  if (!rollout) {
    const baseSyl = checkSyllabusAlignment({
      id: prompt.id,
      syllabi: prompt.syllabi,
      conceptId: prompt.conceptId,
      domain: prompt.domain,
      format: prompt.format,
      totalMarks: prompt.totalMarks,
    });
    return {
      id: rolloutId,
      itemId: prompt.id,
      domain: prompt.domain,
      conceptId: prompt.conceptId,
      templateArchetype: prompt.templateArchetype,
      format: prompt.format,
      difficulty: prompt.difficulty,
      syllabi: prompt.syllabi,
      seed: prompt.seed,
      step1JsonValid: false,
      step1SolverPass: false,
      step1ErrorStage: "json-parse",
      step1ErrorMessage: "Missing model rollout for prompt",
      step2JsonValid: false,
      step2AuthorGatePass: false,
      inferredTargetKeys: [],
      gateIssues: [
        {
          code: "invalid-candidate-schema",
          stage: "schema",
          message: "Missing model rollout for prompt",
        },
      ],
      syllabusAligned: false,
      syllabusIssues: baseSyl.issues,
      endToEndVerified: false,
    };
  }

  const step1Receipt = solveStep1Proposal({
    id: rolloutId,
    domain: prompt.domain,
    assistantStep1Raw: rollout.assistantStep1Raw ?? "",
  });

  const step2RawExtract = extractJsonObjectFromAssistantText(
    rollout.assistantStep2Raw ?? "",
  );
  const step2JsonValid = step2RawExtract.ok;

  if (!step1Receipt.valid) {
    // Still check syllabus alignment on prompt + any partial Step 2 prose if Step 2 JSON parsed
    const step2Partial = step2RawExtract.ok
      ? parseStep2PackageObject(
          step2RawExtract.value,
          prompt.format,
          prompt.difficulty,
        ).parsed
      : undefined;
    const sylCheck = checkSyllabusAlignment({
      id: prompt.id,
      syllabi: prompt.syllabi,
      conceptId: prompt.conceptId,
      domain: prompt.domain,
      format: step2Partial?.format ?? prompt.format,
      totalMarks: Number.isFinite(step2Partial?.totalMarks)
        ? step2Partial?.totalMarks
        : prompt.totalMarks,
      stem: step2Partial?.stem,
      parts: step2Partial?.parts,
      options: step2Partial?.options,
      workedSolution: step2Partial?.workedSolution,
      markScheme: step2Partial?.markScheme,
    });

    return {
      id: rolloutId,
      itemId: prompt.id,
      domain: prompt.domain,
      conceptId: prompt.conceptId,
      templateArchetype: prompt.templateArchetype,
      format: prompt.format,
      difficulty: prompt.difficulty,
      syllabi: prompt.syllabi,
      seed: prompt.seed,
      step1JsonValid: step1Receipt.jsonValid,
      step1SolverPass: false,
      step1ErrorStage: step1Receipt.errorStage,
      step1ErrorMessage: step1Receipt.errorMessage,
      step2JsonValid,
      step2AuthorGatePass: false,
      inferredTargetKeys: [],
      gateIssues: [],
      syllabusAligned: false,
      syllabusIssues: sylCheck.issues,
      endToEndVerified: false,
      ...(step2Partial?.stem ? { stemText: step2Partial.stem } : {}),
    };
  }

  const paramSig = buildScenarioParameterSignature(
    step1Receipt.domain,
    step1Receipt.parsedProposal.scenarioSpec,
  );

  if (!step2RawExtract.ok) {
    const sylCheck = checkSyllabusAlignment({
      id: prompt.id,
      syllabi: prompt.syllabi,
      conceptId: prompt.conceptId,
      domain: prompt.domain,
      format: prompt.format,
      totalMarks: prompt.totalMarks,
      scenarioSpec: step1Receipt.parsedProposal.scenarioSpec,
    });
    return {
      id: rolloutId,
      itemId: prompt.id,
      domain: prompt.domain,
      conceptId: prompt.conceptId,
      templateArchetype: prompt.templateArchetype,
      format: prompt.format,
      difficulty: prompt.difficulty,
      syllabi: prompt.syllabi,
      seed: prompt.seed,
      step1JsonValid: true,
      step1SolverPass: true,
      step2JsonValid: false,
      step2AuthorGatePass: false,
      inferredTargetKeys: [],
      gateIssues: [
        {
          code: "invalid-candidate-schema",
          stage: "schema",
          message: step2RawExtract.error,
        },
      ],
      syllabusAligned: false,
      syllabusIssues: sylCheck.issues,
      endToEndVerified: false,
      parameterSignature: paramSig,
    };
  }

  const { parsed: step2Pkg, extraGateIssues } = parseStep2PackageObject(
    step2RawExtract.value,
    prompt.format,
    prompt.difficulty,
  );

  const inferredTargetKeys: string[] = [];
  let effectiveTargetKey = step2Pkg?.targetQuantityKey?.trim() || undefined;
  let effectiveTargetMode = step2Pkg?.targetMode;
  let effectiveParts = step2Pkg?.parts;

  if (step2Pkg && prompt.format === "mcq" && !effectiveTargetKey && step2Pkg.options) {
    const inferred = inferMcqTargetQuantity({
      options: step2Pkg.options,
      workedSolution: step2Pkg.workedSolution,
      markScheme: step2Pkg.markScheme,
      verifiedQuantities: step1Receipt.verifiedQuantities,
      scenarioSpec: step1Receipt.parsedProposal.scenarioSpec,
      hiddenQuantities: step1Receipt.hiddenQuantities,
      tol,
    });
    if (inferred.targetQuantityKey) {
      effectiveTargetKey = inferred.targetQuantityKey;
      inferredTargetKeys.push(inferred.targetQuantityKey);
    }
    if (!effectiveTargetMode && inferred.targetMode) {
      effectiveTargetMode = inferred.targetMode;
    }
  } else if (effectiveTargetKey) {
    inferredTargetKeys.push(effectiveTargetKey);
  }

  if (step2Pkg && prompt.format === "structured" && step2Pkg.parts) {
    const inferredStruct = inferStructuredSubpartTargets({
      parts: step2Pkg.parts,
      workedSolution: step2Pkg.workedSolution,
      markScheme: step2Pkg.markScheme,
      verifiedQuantities: step1Receipt.verifiedQuantities,
      scenarioSpec: step1Receipt.parsedProposal.scenarioSpec,
      hiddenQuantities: step1Receipt.hiddenQuantities,
      tol,
    });
    effectiveParts = inferredStruct.enrichedParts;
    inferredTargetKeys.push(...inferredStruct.inferredKeys);
  }

  // Step 1 already verified SVG XML sanity and hidden-quantity non-leakage on all
  // declared Step 1 hiddenQuantities. Build declared prose givens excluding actual
  // target answer values so intermediate givens stated in prose do not false-trigger
  // stem-answer-leak while any true target answer leaked in stem is strictly caught.
  const stemLeakTargetKeys =
    inferredTargetKeys.length > 0
      ? [...new Set(inferredTargetKeys)]
      : step1Receipt.hiddenQuantities;

  const targetNumericValues: number[] = stemLeakTargetKeys
    .map((k) => step1Receipt.verifiedQuantities[k])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const stemMentions = extractNumbersFromPhysicsText(step2Pkg?.stem ?? "");
  const nonTargetProseGivens = stemMentions
    .filter((m) => {
      const siCompareVal = m.siBaseValue ?? m.rawValue;
      return !targetNumericValues.some(
        (tv) =>
          Math.abs(tv) > 1e-12 &&
          Math.abs(siCompareVal - tv) / Math.abs(tv) <= 0.006,
      );
    })
    .flatMap((m, idx) => {
      const vals = [
        m.rawValue,
        ...(m.siBaseValue !== undefined ? [m.siBaseValue] : []),
        ...m.alternateConvertedValues,
      ];
      return vals.map((val, j) => ({
        name: `prose_given_${idx + 1}_${j + 1}`,
        value: val,
        source: "either" as const,
      }));
    });

  const studentProseForGivens = [
    step2Pkg?.stem ?? "",
    ...(effectiveParts?.map((p) => p.prompt) ?? []),
  ].join(" ");
  if (
    step1Receipt.svgMarkup === undefined &&
    (effectiveTargetMode ?? "quantitative") === "quantitative" &&
    extractNumbersFromPhysicsText(studentProseForGivens).length === 0
  ) {
    extraGateIssues.push({
      code: "missing-required-given",
      stage: "givens",
      message:
        "Figureless quantitative question states zero numerical physical givens in stem/subparts",
    });
  }

  const candidateInput: CandidateQuestionInput = {
    id: rolloutId,
    conceptId: prompt.conceptId,
    templateArchetype: prompt.templateArchetype,
    seed: prompt.seed,
    syllabi: prompt.syllabi,
    format: prompt.format,
    difficulty: step2Pkg?.difficulty ?? prompt.difficulty,
    domain: prompt.domain,
    scenarioSpec: step1Receipt.parsedProposal.scenarioSpec,
    hiddenQuantities: step1Receipt.hiddenQuantities,
    requiredGivens: nonTargetProseGivens,
    questionPlan: step1Receipt.parsedProposal.questionPlan,
    stem: step2Pkg?.stem ?? "",
    ...(step2Pkg?.options ? { options: step2Pkg.options } : {}),
    ...(effectiveTargetMode ? { targetMode: effectiveTargetMode } : {}),
    ...(effectiveTargetKey ? { targetQuantityKey: effectiveTargetKey } : {}),
    ...(effectiveParts ? { parts: effectiveParts } : {}),
    workedSolution: step2Pkg?.workedSolution ?? "",
    markScheme: step2Pkg?.markScheme ?? [],
    totalMarks: step2Pkg?.totalMarks ?? Number.NaN,
  };

  const gateResult = verifyCandidateWithGate(candidateInput, {
    sigFigTolerance: tol,
  });
  const allGateIssues = [...extraGateIssues, ...gateResult.evaluation.issues];
  const step2AuthorGatePass =
    extraGateIssues.length === 0 && gateResult.evaluation.valid;

  const sylCheck = checkSyllabusAlignment({
    id: rolloutId,
    syllabi: prompt.syllabi,
    conceptId: prompt.conceptId,
    domain: prompt.domain,
    format: step2Pkg?.format ?? prompt.format,
    totalMarks: step2Pkg?.totalMarks,
    scenarioSpec: step1Receipt.parsedProposal.scenarioSpec,
    stem: step2Pkg?.stem,
    parts: effectiveParts,
    options: step2Pkg?.options,
    workedSolution: step2Pkg?.workedSolution,
    markScheme: step2Pkg?.markScheme,
  });

  const endToEndVerified =
    step1Receipt.valid &&
    step2JsonValid &&
    step2AuthorGatePass &&
    sylCheck.aligned;

  const cleanStem = step2Pkg?.stem?.trim() ?? "";

  return {
    id: rolloutId,
    itemId: prompt.id,
    domain: prompt.domain,
    conceptId: prompt.conceptId,
    templateArchetype: prompt.templateArchetype,
    format: prompt.format,
    difficulty: prompt.difficulty,
    syllabi: prompt.syllabi,
    seed: prompt.seed,
    step1JsonValid: true,
    step1SolverPass: true,
    step2JsonValid: true,
    step2AuthorGatePass,
    inferredTargetKeys,
    gateIssues: allGateIssues,
    syllabusAligned: sylCheck.aligned,
    syllabusIssues: sylCheck.issues,
    endToEndVerified,
    ...(cleanStem
      ? {
          stemText: cleanStem,
          stemFingerprint:
            gateResult.evaluation.stemFingerprint ||
            computeStemFingerprint(cleanStem),
        }
      : {}),
    parameterSignature: paramSig,
  };
}

export interface EvaluateBenchmarkOptions {
  rolloutsSource?: string;
  splitSource?: string;
  evaluatedAt?: string;
  /**
   * When true, evaluates strictly the provided `rollouts` rows without padding
   * unattempted prompts from `prompts` (auto-enabled when `K > 1` rollouts share an `itemId`).
   */
  rolloutsOnly?: boolean;
}

function resolvePromptForRollout(
  rollout: ModelRolloutRecord,
  promptById: ReadonlyMap<string, BenchmarkPromptMetadata>,
): BenchmarkPromptMetadata | undefined {
  if (rollout.itemId && promptById.has(rollout.itemId)) {
    return promptById.get(rollout.itemId);
  }
  if (rollout.id && promptById.has(rollout.id)) {
    return promptById.get(rollout.id);
  }
  if (rollout.id) {
    const strippedK = rollout.id.replace(/__k\d+$/i, "").replace(/__retry\d*$/i, "");
    if (promptById.has(strippedK)) {
      return promptById.get(strippedK);
    }
    const withoutTracePrefix = strippedK.replace(/^trace-/, "");
    if (promptById.has(withoutTracePrefix)) {
      return promptById.get(withoutTracePrefix);
    }
  }
  if (rollout.promptMetadata?.syllabi && rollout.promptMetadata.domain) {
    return parsePromptMetadataFromRecord(
      rollout.promptMetadata as Record<string, unknown>,
    );
  }
  return undefined;
}

export function evaluateBenchmarkRollouts(
  prompts: readonly BenchmarkPromptMetadata[],
  rollouts: readonly ModelRolloutRecord[],
  options: EvaluateBenchmarkOptions = {},
): {
  report: BenchmarkEvaluationReport;
  itemEvaluations: ItemRolloutEvaluation[];
  rolloutEvaluations: ItemRolloutEvaluation[];
} {
  const promptById = new Map<string, BenchmarkPromptMetadata>();
  for (const p of prompts) {
    promptById.set(p.id, p);
    promptById.set(`trace-${p.id}`, p);
  }

  const rolloutCountByPromptId = new Map<string, number>();
  const firstRolloutByPromptId = new Map<string, ModelRolloutRecord>();
  const rolloutEvaluations: ItemRolloutEvaluation[] = [];

  let hasMultiSampleK = false;

  for (const r of rollouts) {
    const resolvedPrompt = resolvePromptForRollout(r, promptById);
    if (!resolvedPrompt) {
      throw new Error(
        `Could not match rollout id="${String(r.id)}" / itemId="${String(r.itemId)}" to any prompt in split file`,
      );
    }
    const prevCount = rolloutCountByPromptId.get(resolvedPrompt.id) ?? 0;
    const nextCount = prevCount + 1;
    rolloutCountByPromptId.set(resolvedPrompt.id, nextCount);
    if (nextCount > 1) {
      hasMultiSampleK = true;
    }
    if (!firstRolloutByPromptId.has(resolvedPrompt.id)) {
      firstRolloutByPromptId.set(resolvedPrompt.id, r);
    }
    rolloutEvaluations.push(evaluateSingleRollout(resolvedPrompt, r));
  }

  const missingRolloutIds = prompts
    .filter((p) => !firstRolloutByPromptId.has(p.id))
    .map((p) => p.id);

  const useRolloutsOnly = Boolean(options.rolloutsOnly || hasMultiSampleK);

  const itemEvaluations: ItemRolloutEvaluation[] = useRolloutsOnly
    ? rolloutEvaluations
    : prompts.map((p) => {
        const matchedIdx = rolloutEvaluations.findIndex(
          (ev) => ev.itemId === p.id,
        );
        if (matchedIdx >= 0) {
          return rolloutEvaluations[matchedIdx];
        }
        return evaluateSingleRollout(p, undefined);
      });

  // Group strata
  const bySyllabusMap = new Map<string, ItemRolloutEvaluation[]>();
  const bySyllabusLevelMap = new Map<string, ItemRolloutEvaluation[]>();
  const byDomainMap = new Map<string, ItemRolloutEvaluation[]>();
  const byFormatMap = new Map<string, ItemRolloutEvaluation[]>();
  const byDifficultyMap = new Map<string, ItemRolloutEvaluation[]>();

  const pushToMap = (
    map: Map<string, ItemRolloutEvaluation[]>,
    key: string,
    val: ItemRolloutEvaluation,
  ): void => {
    const arr = map.get(key);
    if (arr) {
      arr.push(val);
    } else {
      map.set(key, [val]);
    }
  };

  const failureBreakdown: FailureBreakdownSummary = {
    step1ByStage: {},
    gateIssuesByCode: {},
    syllabusIssuesByCode: {},
  };

  for (const item of itemEvaluations) {
    pushToMap(byDomainMap, item.domain, item);
    pushToMap(byFormatMap, item.format, item);
    pushToMap(byDifficultyMap, item.difficulty, item);

    const seenSyl = new Set<string>();
    const seenSylLvl = new Set<string>();
    for (const tag of item.syllabi) {
      if (!seenSyl.has(tag.syllabus)) {
        seenSyl.add(tag.syllabus);
        pushToMap(bySyllabusMap, tag.syllabus, item);
      }
      const sylLvlKey = `${tag.syllabus}:${tag.level}`;
      if (!seenSylLvl.has(sylLvlKey)) {
        seenSylLvl.add(sylLvlKey);
        pushToMap(bySyllabusLevelMap, sylLvlKey, item);
      }
    }

    if (!item.step1SolverPass && item.step1ErrorStage) {
      failureBreakdown.step1ByStage[item.step1ErrorStage] =
        (failureBreakdown.step1ByStage[item.step1ErrorStage] ?? 0) + 1;
    }
    for (const g of item.gateIssues) {
      failureBreakdown.gateIssuesByCode[g.code] =
        (failureBreakdown.gateIssuesByCode[g.code] ?? 0) + 1;
    }
    for (const s of item.syllabusIssues) {
      failureBreakdown.syllabusIssuesByCode[s.code] =
        (failureBreakdown.syllabusIssuesByCode[s.code] ?? 0) + 1;
    }
  }

  const buildBucketRecord = (
    map: Map<string, ItemRolloutEvaluation[]>,
  ): Record<string, StratifiedMetricsBucket> => {
    const out: Record<string, StratifiedMetricsBucket> = {};
    for (const key of [...map.keys()].sort()) {
      out[key] = summarizeStratifiedBucket(key, map.get(key)!);
    }
    return out;
  };

  const overall = summarizeStratifiedBucket("overall", itemEvaluations);
  const diversity = computeDiversityMetrics(itemEvaluations);

  const verifiedSampleIds = itemEvaluations
    .filter((i) => i.endToEndVerified)
    .slice(0, 15)
    .map((i) => i.id);

  const failedSamples = itemEvaluations
    .filter((i) => !i.endToEndVerified)
    .slice(0, 15)
    .map((i) => ({
      id: i.id,
      domain: i.domain,
      format: i.format,
      ...(i.step1ErrorStage ? { step1ErrorStage: i.step1ErrorStage } : {}),
      ...(i.step1ErrorMessage
        ? { step1ErrorMessage: i.step1ErrorMessage }
        : {}),
      gateIssueCodes: [...new Set(i.gateIssues.map((g) => g.code))],
      syllabusIssueCodes: [...new Set(i.syllabusIssues.map((s) => s.code))],
    }));

  const report: BenchmarkEvaluationReport = {
    schemaVersion: SIXTHPHYSICS_BENCHMARK_SCHEMA_VERSION,
    evaluatedAt: options.evaluatedAt ?? new Date().toISOString(),
    ...(options.rolloutsSource
      ? { rolloutsSource: options.rolloutsSource }
      : {}),
    ...(options.splitSource ? { splitSource: options.splitSource } : {}),
    totalPrompts: prompts.length,
    evaluatedRollouts: rollouts.length,
    missingRolloutIds,
    headline: {
      step1JsonValidRate: overall.step1JsonValid.rate,
      step1SolverPassRate: overall.step1SolverPass.rate,
      step2JsonValidRate: overall.step2JsonValid.rate,
      step2AuthorGatePassRate: overall.step2AuthorGatePass.rate,
      syllabusAlignmentRate: overall.syllabusAlignment.rate,
      endToEndVerifiedRate: overall.endToEndVerified.rate,
      conditionalStep2AuthorPassRate: overall.conditionalStep2PassGivenStep1.rate,
    },
    overall,
    bySyllabus: buildBucketRecord(bySyllabusMap),
    bySyllabusLevel: buildBucketRecord(bySyllabusLevelMap),
    byDomain: buildBucketRecord(byDomainMap),
    byFormat: buildBucketRecord(byFormatMap),
    byDifficulty: buildBucketRecord(byDifficultyMap),
    diversity,
    failureBreakdown,
    sampleDiagnostics: {
      verifiedSampleIds,
      failedSamples,
    },
  };

  return {
    report,
    itemEvaluations,
    rolloutEvaluations,
  };
}
