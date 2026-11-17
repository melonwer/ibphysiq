import {
  DomainRenderOutput,
  DomainSolveOutput,
  getDomainAdapter,
  hasDomainAdapter,
} from "./domain-registry";
import {
  buildOptionEquivalenceKey,
  computeStemFingerprint,
  computeStemSimilarity,
  extractNumbersFromPhysicsText,
  formatSignificantFigures,
  numbersAgreeWithinTolerance,
  SigFigToleranceOptions,
  textContainsNumericValue,
} from "./numeric-checker";
import { checkSvgHiddenQuantityLeaks, inspectSvgSanity } from "./svg-guard";
import {
  CandidateQuestionInput,
  GateDiagnosticIssue,
  MCQ_OPTION_LABELS,
  PackageGateEvaluation,
  QUESTION_DIFFICULTIES,
  QUESTION_FORMATS,
  RequiredGivenSpec,
  SYLLABUS_IDS,
} from "./types";

export interface ExistingStemEntry {
  id: string;
  stem: string;
  stemFingerprint: string;
}

export interface GateContextOptions {
  sigFigTolerance?: SigFigToleranceOptions;
  existingShardItems?: readonly ExistingStemEntry[];
  nearDuplicateSimilarityThreshold?: number;
}

export interface VerifiedCandidateExecution {
  evaluation: PackageGateEvaluation;
  solveOutput?: DomainSolveOutput;
  renderOutput?: DomainRenderOutput;
  effectiveSvgMarkup?: string;
  correctOptionIndex?: 0 | 1 | 2 | 3;
}

const DIRECTIONAL_PROSE_PATTERN =
  /\b(?:left|right|up|upward|upwards|down|downward|downwards|north|south|east|west|inward|outward|into|out of|towards?|away|oppos|clock|anticlock|counterclock|loss|lost|decreas|decelerat|retard)\b/i;

function textAgreesWithSignedGroundTruth(
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

function textAgreesWithQualitativeTruth(
  text: string,
  expected: string | boolean,
): boolean {
  const normalizedHaystack = normalizeQualitativePhrase(text);
  if (!normalizedHaystack) {
    return false;
  }
  if (typeof expected === "boolean") {
    const token = expected ? "true" : "false";
    const yesNo = expected ? "yes" : "no";
    return (
      new RegExp(`\\b${token}\\b`).test(normalizedHaystack) ||
      new RegExp(`\\b${yesNo}\\b`).test(normalizedHaystack)
    );
  }
  const normalizedExpected = normalizeQualitativePhrase(expected);
  if (!normalizedExpected) {
    return false;
  }
  return normalizedHaystack.includes(normalizedExpected);
}

function mergeSpecAndCandidateHiddenQuantities(
  scenarioSpec: Record<string, unknown>,
  candidateHiddenQuantities: readonly string[],
): string[] {
  const rawList: string[] = [];
  const specHidden = scenarioSpec.hiddenQuantities;
  if (Array.isArray(specHidden)) {
    for (const item of specHidden) {
      if (typeof item === "string" && item.trim()) {
        rawList.push(item.trim());
      }
    }
  }
  const visibility = scenarioSpec.visibility;
  if (visibility !== null && typeof visibility === "object" && !Array.isArray(visibility)) {
    const visHidden = (visibility as { hiddenQuantities?: unknown }).hiddenQuantities;
    if (Array.isArray(visHidden)) {
      for (const item of visHidden) {
        if (typeof item === "string" && item.trim()) {
          rawList.push(item.trim());
        }
      }
    }
  }
  for (const item of candidateHiddenQuantities) {
    if (typeof item === "string" && item.trim()) {
      rawList.push(item.trim());
    }
  }
  return [...new Set(rawList)];
}

function deriveDefaultRequiredGivens(
  scenarioSpec: Record<string, unknown>,
  hiddenQuantities: readonly string[],
  hasSvg: boolean,
): RequiredGivenSpec[] {
  const hidden = new Set(hiddenQuantities);
  const givens: RequiredGivenSpec[] = [];
  for (const [key, value] of Object.entries(scenarioSpec)) {
    if (hidden.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      if (Math.abs(value) <= 1e-12) continue;
      givens.push({
        name: key,
        value,
        source: hasSvg ? "either" : "stem",
      });
    }
  }
  return givens;
}

/**
 * Deterministic verification gate for candidate physics question packages.
 * Solves scenario physics, renders deterministic SVGs, and enforces all
 * physical, numerical, structural, SVG non-leakage, and deduplication invariants.
 */
export function verifyCandidateWithGate(
  candidate: CandidateQuestionInput,
  options: GateContextOptions = {},
): VerifiedCandidateExecution {
  const issues: GateDiagnosticIssue[] = [];
  const passedChecks: string[] = [];
  const tol: SigFigToleranceOptions = {
    significantFigures: options.sigFigTolerance?.significantFigures ?? 3,
    relativeTolerance: options.sigFigTolerance?.relativeTolerance ?? 0.01,
    absoluteZeroTolerance:
      options.sigFigTolerance?.absoluteZeroTolerance ?? 1e-9,
  };
  const similarityThreshold = options.nearDuplicateSimilarityThreshold ?? 0.9;

  const stemText = typeof candidate.stem === "string" ? candidate.stem.trim() : "";
  const stemFingerprint = computeStemFingerprint(stemText);

  // --------------------------------------------------------------------------
  // 1. Candidate Schema Validation
  // --------------------------------------------------------------------------
  if (!candidate.id || !candidate.id.trim()) {
    issues.push({
      code: "invalid-candidate-schema",
      stage: "schema",
      message: "Candidate id must be a non-empty string",
    });
  }
  if (!candidate.conceptId?.trim() || !candidate.templateArchetype?.trim()) {
    issues.push({
      code: "invalid-candidate-schema",
      stage: "schema",
      message: "conceptId and templateArchetype must be non-empty strings",
    });
  }
  if (!Number.isInteger(candidate.seed)) {
    issues.push({
      code: "invalid-candidate-schema",
      stage: "schema",
      message: `Candidate seed must be an integer; received ${String(candidate.seed)}`,
    });
  }
  if (!Array.isArray(candidate.syllabi) || candidate.syllabi.length === 0) {
    issues.push({
      code: "invalid-candidate-schema",
      stage: "schema",
      message: "Candidate must declare at least one syllabus tag",
    });
  } else {
    for (const tag of candidate.syllabi) {
      if (
        !SYLLABUS_IDS.includes(tag.syllabus) ||
        !tag.level?.trim() ||
        !tag.topicId?.trim()
      ) {
        issues.push({
          code: "invalid-candidate-schema",
          stage: "schema",
          message: `Invalid syllabus tag: ${JSON.stringify(tag)}`,
        });
      }
    }
  }
  if (!QUESTION_FORMATS.includes(candidate.format)) {
    issues.push({
      code: "invalid-candidate-schema",
      stage: "schema",
      message: `Unsupported format: ${String(candidate.format)}`,
    });
  }
  if (!QUESTION_DIFFICULTIES.includes(candidate.difficulty)) {
    issues.push({
      code: "invalid-candidate-schema",
      stage: "schema",
      message: `Unsupported difficulty: ${String(candidate.difficulty)}`,
    });
  }
  if (!stemText) {
    issues.push({
      code: "invalid-candidate-schema",
      stage: "schema",
      message: "Candidate stem must not be empty",
    });
  }
  if (!candidate.workedSolution?.trim()) {
    issues.push({
      code: "invalid-candidate-schema",
      stage: "schema",
      message: "Candidate workedSolution must not be empty",
    });
  }
  if (!Number.isInteger(candidate.totalMarks) || candidate.totalMarks < 1) {
    issues.push({
      code: "invalid-candidate-schema",
      stage: "schema",
      message: `totalMarks must be a positive integer; received ${String(candidate.totalMarks)}`,
    });
  }

  if (issues.length > 0) {
    return {
      evaluation: {
        valid: false,
        passedChecks,
        issues,
        stemFingerprint,
      },
    };
  }
  passedChecks.push("schema-valid");

  // --------------------------------------------------------------------------
  // 2. Domain Adapter & Deterministic Solver Verification
  // --------------------------------------------------------------------------
  if (!hasDomainAdapter(candidate.domain)) {
    issues.push({
      code: "unknown-domain",
      stage: "solver",
      message: `Domain "${String(candidate.domain)}" is not registered in domain-registry`,
      repairHint: "Use a registered domain or register the visual module first",
    });
    return {
      evaluation: {
        valid: false,
        passedChecks,
        issues,
        stemFingerprint,
      },
    };
  }

  const adapter = getDomainAdapter(candidate.domain);
  const scenarioCheck = adapter.validateScenario(candidate.scenarioSpec);
  if (!scenarioCheck.valid) {
    for (const msg of scenarioCheck.issues) {
      issues.push({
        code: "scenario-validation-failed",
        stage: "solver",
        message: msg,
        repairHint:
          "Adjust scenarioSpec physical parameters so all domain constraints hold",
      });
    }
    return {
      evaluation: {
        valid: false,
        passedChecks,
        issues,
        stemFingerprint,
      },
    };
  }

  let solveOutput: DomainSolveOutput;
  try {
    solveOutput = adapter.solveScenario(candidate.scenarioSpec);
  } catch (error) {
    issues.push({
      code: "solver-error",
      stage: "solver",
      message: error instanceof Error ? error.message : String(error),
      repairHint: "Fix invalid scenarioSpec parameters causing solver exception",
    });
    return {
      evaluation: {
        valid: false,
        passedChecks,
        issues,
        stemFingerprint,
      },
    };
  }

  for (const [key, val] of Object.entries(solveOutput.quantities)) {
    if (typeof val === "number" && !Number.isFinite(val)) {
      issues.push({
        code: "non-finite-solver-output",
        stage: "solver",
        message: `Solver produced non-finite quantity "${key}" = ${String(val)}`,
      });
    }
  }
  if (issues.length > 0) {
    return {
      evaluation: {
        valid: false,
        passedChecks,
        issues,
        stemFingerprint,
      },
      solveOutput,
    };
  }
  passedChecks.push("solver-verified");

  // --------------------------------------------------------------------------
  // 3. Deterministic SVG Render, XML Sanity & Zero Answer Leakage
  // --------------------------------------------------------------------------
  const effectiveHiddenQuantities = mergeSpecAndCandidateHiddenQuantities(
    candidate.scenarioSpec,
    candidate.hiddenQuantities,
  );
  let renderOutput: DomainRenderOutput | undefined;
  if (adapter.renderSvg) {
    try {
      renderOutput = adapter.renderSvg(candidate.scenarioSpec, {
        hiddenQuantities: effectiveHiddenQuantities,
        id: candidate.id,
      });
    } catch (error) {
      issues.push({
        code: "svg-render-error",
        stage: "svg",
        message: error instanceof Error ? error.message : String(error),
        repairHint: "Fix visual geometry or parameters in scenarioSpec",
      });
      return {
        evaluation: {
          valid: false,
          passedChecks,
          issues,
          stemFingerprint,
        },
        solveOutput,
      };
    }
  }

  const effectiveSvgMarkup =
    renderOutput?.svgMarkup ?? candidate.svgMarkupOverride;
  let svgFingerprint: string | undefined;
  let svgCombinedText = "";

  if (effectiveSvgMarkup !== undefined) {
    const svgSanity = inspectSvgSanity(effectiveSvgMarkup);
    svgFingerprint = svgSanity.svgSha256;
    if (!svgSanity.valid) {
      for (const svgIssue of svgSanity.issues) {
        issues.push({
          code: "svg-xml-invalid",
          stage: "svg",
          message: svgIssue,
          repairHint:
            "Ensure SVG has valid xmlns, viewBox, balanced XML tags, and finite coordinates",
        });
      }
    } else {
      svgCombinedText = [
        ...svgSanity.visibleTexts,
        ...svgSanity.accessibleTexts,
      ].join(" ; ");

      const declaredPublicScalarNums: number[] = [];
      const hiddenSet = new Set(effectiveHiddenQuantities);
      for (const [k, v] of Object.entries(candidate.scenarioSpec)) {
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
        svgMarkup: effectiveSvgMarkup,
        hiddenQuantities: effectiveHiddenQuantities,
        verifiedQuantities: solveOutput.quantities,
        publicNumbers,
        publicLabels,
      });
      for (const leak of leaks) {
        issues.push({
          code: "svg-answer-leak",
          stage: "svg",
          message: leak,
          repairHint:
            "Ensure all target answer keys are listed in hiddenQuantities and never rendered in SVG text, <title>, or aria-label",
        });
      }
      if (leaks.length === 0) {
        passedChecks.push("svg-sanity-and-non-leakage");
      }
    }
  } else {
    passedChecks.push("figureless-verified");
  }

  // --------------------------------------------------------------------------
  // 4. Required Givens Presence & Student Stem Answer Non-Leakage
  // --------------------------------------------------------------------------
  const studentProse = [
    stemText,
    ...(candidate.parts?.map((p) => p.prompt) ?? []),
  ].join(" ");

  const givensToCheck =
    candidate.requiredGivens ??
    deriveDefaultRequiredGivens(
      candidate.scenarioSpec,
      effectiveHiddenQuantities,
      effectiveSvgMarkup !== undefined,
    );

  const declaredGivenValues: number[] = [];
  for (const given of givensToCheck) {
    declaredGivenValues.push(given.value);
    const sourcePolicy = given.source ?? "stem";
    const inProse = textContainsNumericValue(studentProse, given.value, {
      ...tol,
      allowMagnitudeMatch: true,
    });
    const inSvg =
      effectiveSvgMarkup !== undefined &&
      textContainsNumericValue(svgCombinedText, given.value, {
        ...tol,
        allowMagnitudeMatch: true,
      });

    const satisfied =
      sourcePolicy === "stem"
        ? inProse
        : sourcePolicy === "svg"
          ? inSvg
          : inProse || inSvg;

    if (!satisfied) {
      issues.push({
        code: "missing-required-given",
        stage: "givens",
        message: `Student question omits required given "${given.name}" = ${String(given.value)}${given.unit ? ` ${given.unit}` : ""} (required in ${sourcePolicy})`,
        expected: given.value,
        repairHint: `State ${given.name} = ${String(given.value)}${given.unit ? ` ${given.unit}` : ""} clearly in the student stem`,
      });
    }
  }

  // Also collect all scalar/array numeric givens in scenarioSpec so stem leak check knows public givens
  for (const [k, v] of Object.entries(candidate.scenarioSpec)) {
    if (effectiveHiddenQuantities.includes(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) {
      declaredGivenValues.push(v);
    } else if (Array.isArray(v)) {
      for (const elem of v) {
        if (typeof elem === "number" && Number.isFinite(elem)) {
          declaredGivenValues.push(elem);
        } else if (
          elem !== null &&
          typeof elem === "object" &&
          typeof (elem as { x?: unknown }).x === "number" &&
          typeof (elem as { y?: unknown }).y === "number"
        ) {
          declaredGivenValues.push(
            (elem as { x: number }).x,
            (elem as { y: number }).y,
          );
        }
      }
    }
  }

  // Check that stem prose does not leak a non-given hidden answer value
  for (const hiddenKey of effectiveHiddenQuantities) {
    const hiddenVal = solveOutput.quantities[hiddenKey];
    if (
      typeof hiddenVal === "number" &&
      Number.isFinite(hiddenVal) &&
      Math.abs(hiddenVal) > 1e-12
    ) {
      const coincidesWithGiven = declaredGivenValues.some((g) =>
        numbersAgreeWithinTolerance(g, hiddenVal, {
          significantFigures: 3,
          relativeTolerance: 0.006,
        }),
      );
      if (
        !coincidesWithGiven &&
        textContainsNumericValue(stemText, hiddenVal, {
          significantFigures: 3,
          relativeTolerance: 0.005,
        })
      ) {
        issues.push({
          code: "stem-answer-leak",
          stage: "givens",
          message: `Student stem leaks hidden target quantity "${hiddenKey}" = ${formatSignificantFigures(hiddenVal, 3)}`,
          expected: "hidden from stem",
          actual: hiddenVal,
          repairHint:
            "Remove the computed target answer from the student stem",
        });
      }
    }
  }

  if (!issues.some((i) => i.stage === "givens")) {
    passedChecks.push("givens-complete-and-unleaked");
  }

  // --------------------------------------------------------------------------
  // 5. Format-Specific Validation (MCQ vs Structured) + Solver Ground Truth
  // --------------------------------------------------------------------------
  let correctOptionIndex: 0 | 1 | 2 | 3 | undefined;

  if (candidate.format === "mcq") {
    if (candidate.parts && candidate.parts.length > 0) {
      issues.push({
        code: "mcq-invalid-options",
        stage: "mcq",
        message: "MCQ candidate must not define structured parts",
      });
    }
    const opts = candidate.options;
    if (!Array.isArray(opts) || opts.length !== 4) {
      issues.push({
        code: "mcq-invalid-options",
        stage: "mcq",
        message: `MCQ must define exactly 4 options (A–D); received ${opts ? opts.length : 0}`,
        repairHint: "Provide 4 distinct options labeled A, B, C, D",
      });
    } else {
      for (let i = 0; i < 4; i += 1) {
        if (opts[i].label !== MCQ_OPTION_LABELS[i] || !opts[i].text?.trim()) {
          issues.push({
            code: "mcq-invalid-options",
            stage: "mcq",
            message: `Option at index ${i} must have label "${MCQ_OPTION_LABELS[i]}" and non-empty text`,
          });
        }
      }

      const rawTextSet = new Set(
        opts.map((o) => o.text.trim().toLowerCase().replace(/\s+/g, " ")),
      );
      const equivKeySet = new Set(
        opts.map((o) => buildOptionEquivalenceKey(o.text)),
      );
      if (rawTextSet.size !== 4 || equivKeySet.size !== 4) {
        issues.push({
          code: "mcq-duplicate-options",
          stage: "mcq",
          message: `MCQ options contain duplicate text or equivalent numerical values: ${opts.map((o) => `${o.label}: "${o.text}"`).join(", ")}`,
          repairHint:
            "Ensure all 4 options A–D are textually and numerically distinct at 3 significant figures",
        });
      }

      const correctIndices = opts
        .map((o, idx) => (o.isCorrect ? idx : -1))
        .filter((idx) => idx >= 0);
      if (correctIndices.length !== 1) {
        issues.push({
          code: "mcq-non-unique-correct",
          stage: "mcq",
          message: `MCQ must have exactly 1 correct option; found ${correctIndices.length}`,
          repairHint: "Mark exactly one option with isCorrect: true",
        });
      } else {
        correctOptionIndex = correctIndices[0] as 0 | 1 | 2 | 3;
      }

      for (const opt of opts) {
        if (!opt.isCorrect && !opt.distractorRationale?.trim()) {
          issues.push({
            code: "mcq-missing-distractor-rationale",
            stage: "mcq",
            message: `Distractor option ${opt.label} ("${opt.text}") is missing distractorRationale`,
            repairHint:
              "Provide a brief misconception/error rationale on every distractor option",
          });
        }
      }

      // Ground-truth verification for MCQ (quantitative default vs explicit qualitative)
      const explicitTargetKey = candidate.targetQuantityKey?.trim();
      const primaryKey =
        explicitTargetKey && explicitTargetKey.length > 0
          ? explicitTargetKey
          : candidate.hiddenQuantities.length === 1 &&
              candidate.hiddenQuantities[0]?.trim()
            ? candidate.hiddenQuantities[0].trim()
            : undefined;
      const itemTargetMode = candidate.targetMode ?? "quantitative";
      const combinedSchemeText = [
        candidate.workedSolution,
        ...candidate.markScheme.map((m) => m.criterion),
      ].join(" ");

      if (itemTargetMode === "qualitative") {
        if (correctOptionIndex !== undefined) {
          const correctOpt = opts[correctOptionIndex];
          const numericInCorrect = extractNumbersFromPhysicsText(correctOpt.text);
          if (numericInCorrect.length > 0) {
            issues.push({
              code: "ground-truth-mismatch",
              stage: "ground-truth",
              message: `Qualitative MCQ correct option ${correctOpt.label} ("${correctOpt.text}") contains numeric value "${numericInCorrect[0].rawText}"; quantitative MCQs must use targetMode: "quantitative" with a numeric targetQuantityKey`,
              actual: correctOpt.text,
              repairHint:
                "Set targetMode to \"quantitative\" and specify a numeric solver targetQuantityKey, or remove numerical claims from qualitative options",
            });
          }
        }
        if (primaryKey === undefined) {
          issues.push({
            code: "ground-truth-mismatch",
            stage: "ground-truth",
            message:
              "Qualitative MCQ must declare a conceptual targetQuantityKey (or single hiddenQuantities key) resolvable in solver verifiedQuantities",
            repairHint:
              "Specify targetQuantityKey pointing to a non-numeric solver classification in verifiedQuantities",
          });
        } else {
          const truth = solveOutput.quantities[primaryKey];
          if (truth === undefined || typeof truth === "number") {
            issues.push({
              code: "ground-truth-mismatch",
              stage: "ground-truth",
              message: `Qualitative MCQ targetQuantityKey "${primaryKey}" must resolve to a non-numeric conceptual classification in solver outputs; received ${String(truth)}`,
              actual: String(truth),
              repairHint:
                "Use a non-numeric classification key for qualitative MCQs or use targetMode: \"quantitative\" for numeric quantities",
            });
          } else if (correctOptionIndex !== undefined) {
            const correctOpt = opts[correctOptionIndex];
            if (!textAgreesWithQualitativeTruth(correctOpt.text, truth)) {
              issues.push({
                code: "ground-truth-mismatch",
                stage: "ground-truth",
                message: `Correct option ${correctOpt.label} ("${correctOpt.text}") does not match solver conceptual classification "${primaryKey}" = "${String(truth)}"`,
                expected: String(truth),
                actual: correctOpt.text,
              });
            }
            if (!textAgreesWithQualitativeTruth(combinedSchemeText, truth)) {
              issues.push({
                code: "ground-truth-mismatch",
                stage: "ground-truth",
                message: `Worked solution / mark scheme does not state verified conceptual classification "${String(truth)}" for "${primaryKey}"`,
                expected: String(truth),
              });
            }
          }
        }
      } else {
        // Quantitative MCQ (default): MUST have a resolvable numeric targetQuantityKey in verifiedQuantities
        if (primaryKey === undefined) {
          issues.push({
            code: "ground-truth-mismatch",
            stage: "ground-truth",
            message: `Quantitative MCQ "${candidate.id}" has no resolvable targetQuantityKey (hiddenQuantities count = ${candidate.hiddenQuantities.length}); solver ground-truth verification cannot be bypassed`,
            expected: `one of: ${Object.keys(solveOutput.quantities).join(", ")}`,
            repairHint:
              "Set targetQuantityKey explicitly to the target numeric quantity in solver verifiedQuantities",
          });
        } else {
          const truth = solveOutput.quantities[primaryKey];
          if (truth === undefined) {
            issues.push({
              code: "ground-truth-mismatch",
              stage: "ground-truth",
              message: `targetQuantityKey "${primaryKey}" does not exist in solver outputs (${Object.keys(solveOutput.quantities).join(", ")})`,
            });
          } else if (typeof truth !== "number") {
            issues.push({
              code: "ground-truth-mismatch",
              stage: "ground-truth",
              message: `Quantitative MCQ targetQuantityKey "${primaryKey}" resolved to non-numeric value "${String(truth)}"; quantitative MCQs require a finite numeric solver target`,
              actual: String(truth),
              repairHint:
                "Point targetQuantityKey to a numeric solver output, or set targetMode: \"qualitative\" for non-numeric conceptual classifications",
            });
          } else if (correctOptionIndex !== undefined) {
            const correctOpt = opts[correctOptionIndex];
            if (!textAgreesWithSignedGroundTruth(correctOpt.text, truth, tol)) {
              issues.push({
                code: "ground-truth-mismatch",
                stage: "ground-truth",
                message: `Correct option ${correctOpt.label} ("${correctOpt.text}") disagrees with solver "${primaryKey}" = ${formatSignificantFigures(truth, 3)} (exact: ${String(truth)})`,
                expected: formatSignificantFigures(truth, 3),
                actual: correctOpt.text,
                repairHint: `Update correct option ${correctOpt.label} to match ${formatSignificantFigures(truth, 3)}`,
              });
            }

            // Ensure no distractor is numerically identical when options are pure scalar numbers
            const correctHasDirection = DIRECTIONAL_PROSE_PATTERN.test(
              correctOpt.text,
            );
            if (!correctHasDirection) {
              for (const opt of opts) {
                if (opt.isCorrect) continue;
                if (
                  !DIRECTIONAL_PROSE_PATTERN.test(opt.text) &&
                  textContainsNumericValue(opt.text, truth, {
                    significantFigures: 3,
                    relativeTolerance: 0.005,
                  })
                ) {
                  issues.push({
                    code: "mcq-distractor-matches-answer",
                    stage: "mcq",
                    message: `Distractor option ${opt.label} ("${opt.text}") numerically matches verified answer ${formatSignificantFigures(truth, 3)}`,
                    expected: `!= ${formatSignificantFigures(truth, 3)}`,
                    actual: opt.text,
                    repairHint: `Replace distractor ${opt.label} with a distinct misconception value`,
                  });
                }
              }
            }

            // Check workedSolution & markScheme agree with truth
            if (!textAgreesWithSignedGroundTruth(combinedSchemeText, truth, tol)) {
              issues.push({
                code: "ground-truth-mismatch",
                stage: "ground-truth",
                message: `Worked solution / mark scheme does not contain verified value ${formatSignificantFigures(truth, 3)} for "${primaryKey}"`,
                expected: formatSignificantFigures(truth, 3),
                repairHint:
                  "Ensure workedSolution and markScheme state the solver-verified answer",
              });
            }
          }
        }
      }
    }
  } else {
    // format === "structured"
    if (candidate.options && candidate.options.length > 0) {
      issues.push({
        code: "structured-invalid-parts",
        stage: "structured",
        message: "Structured question must not include MCQ options",
      });
    }
    const parts = candidate.parts;
    if (!Array.isArray(parts) || parts.length === 0) {
      issues.push({
        code: "structured-invalid-parts",
        stage: "structured",
        message: "Structured question must define at least one subpart",
      });
    } else {
      const seenPartIds = new Set<string>();
      let partMarkSum = 0;
      let solverCheckedQuantitativeParts = 0;
      let solverCheckedQualitativeParts = 0;

      for (const part of parts) {
        if (
          !part.partId?.trim() ||
          !part.prompt?.trim() ||
          !part.expectedAnswer?.trim() ||
          !Array.isArray(part.workingSteps) ||
          part.workingSteps.length === 0 ||
          !Number.isInteger(part.marks) ||
          part.marks < 1
        ) {
          issues.push({
            code: "structured-invalid-parts",
            stage: "structured",
            message: `Invalid subpart "${String(part.partId)}": requires non-empty partId, prompt, expectedAnswer, workingSteps, and positive integer marks`,
          });
          continue;
        }
        if (seenPartIds.has(part.partId)) {
          issues.push({
            code: "structured-invalid-parts",
            stage: "structured",
            message: `Duplicate subpart partId "${part.partId}"`,
          });
        }
        if (part.dependsOnPartIds) {
          for (const depId of part.dependsOnPartIds) {
            if (!seenPartIds.has(depId)) {
              issues.push({
                code: "structured-dependency-invalid",
                stage: "structured",
                message: `Subpart "${part.partId}" depends on "${depId}", which is not a preceding subpart`,
                repairHint:
                  "dependsOnPartIds may only reference earlier subparts",
              });
            }
          }
        }
        seenPartIds.add(part.partId);
        partMarkSum += part.marks;

        // Ground-truth check for structured subparts (never bypass numeric answers)
        const partTargetKey = part.targetQuantityKey?.trim();
        const extractedAnswerNums = extractNumbersFromPhysicsText(
          part.expectedAnswer,
        );
        const extractedWorkingNums = extractNumbersFromPhysicsText(
          part.workingSteps.join(" "),
        );

        if (!partTargetKey) {
          if (part.targetMode === "qualitative") {
            if (
              extractedAnswerNums.length > 0 ||
              extractedWorkingNums.length > 0
            ) {
              issues.push({
                code: "ground-truth-mismatch",
                stage: "ground-truth",
                message: `Qualitative subpart "${part.partId}" contains numerical values in expectedAnswer/workingSteps without a solver-verified targetQuantityKey`,
                actual: part.expectedAnswer,
                repairHint:
                  "Provide a valid numeric targetQuantityKey for any subpart involving numerical calculation, or keep qualitative subparts strictly conceptual",
              });
            }
          } else if (extractedAnswerNums.length > 0) {
            issues.push({
              code: "ground-truth-mismatch",
              stage: "ground-truth",
              message: `Subpart "${part.partId}" expectedAnswer ("${part.expectedAnswer}") contains numeric value "${extractedAnswerNums[0].rawText}" without a solver-verified targetQuantityKey`,
              actual: extractedAnswerNums[0].rawValue,
              repairHint: `Specify targetQuantityKey on subpart "${part.partId}" matching one of: ${Object.keys(solveOutput.quantities).join(", ")}`,
            });
          }
        } else {
          const truth = solveOutput.quantities[partTargetKey];
          if (truth === undefined) {
            issues.push({
              code: "ground-truth-mismatch",
              stage: "ground-truth",
              message: `Subpart "${part.partId}" references unknown targetQuantityKey "${partTargetKey}"`,
            });
          } else if (typeof truth === "number") {
            if (part.targetMode === "qualitative") {
              issues.push({
                code: "ground-truth-mismatch",
                stage: "ground-truth",
                message: `Subpart "${part.partId}" is marked qualitative, but targetQuantityKey "${partTargetKey}" resolves to numeric value ${String(truth)}`,
                actual: truth,
              });
            } else {
              solverCheckedQuantitativeParts += 1;
              if (
                !textAgreesWithSignedGroundTruth(
                  part.expectedAnswer,
                  truth,
                  tol,
                )
              ) {
                issues.push({
                  code: "ground-truth-mismatch",
                  stage: "ground-truth",
                  message: `Subpart "${part.partId}" expectedAnswer ("${part.expectedAnswer}") disagrees with solver "${partTargetKey}" = ${formatSignificantFigures(truth, 3)} (exact: ${String(truth)})`,
                  expected: formatSignificantFigures(truth, 3),
                  actual:
                    extractedAnswerNums.length > 0
                      ? extractedAnswerNums[0].rawValue
                      : part.expectedAnswer,
                  repairHint: `Set subpart (${part.partId}) expectedAnswer and mark scheme to ${formatSignificantFigures(truth, 3)}`,
                });
              }

              // Verify markScheme points for this part also agree with solver truth
              const partSchemePoints = candidate.markScheme.filter(
                (m) =>
                  m.partId === part.partId ||
                  (parts.length === 1 && m.partId === undefined),
              );
              const schemeText = partSchemePoints
                .map((m) => m.criterion)
                .join(" ");
              if (
                partSchemePoints.length > 0 &&
                !textAgreesWithSignedGroundTruth(schemeText, truth, tol)
              ) {
                issues.push({
                  code: "ground-truth-mismatch",
                  stage: "ground-truth",
                  message: `Mark scheme criteria for subpart "${part.partId}" do not contain verified value ${formatSignificantFigures(truth, 3)} for "${partTargetKey}"`,
                  expected: formatSignificantFigures(truth, 3),
                  actual: schemeText,
                  repairHint: `Include the final verified numerical answer ${formatSignificantFigures(truth, 3)} in an A1/mark-scheme point for part (${part.partId})`,
                });
              }

              // Verify item-level workedSolution also agrees with solver truth
              if (
                !textAgreesWithSignedGroundTruth(
                  candidate.workedSolution,
                  truth,
                  tol,
                )
              ) {
                issues.push({
                  code: "ground-truth-mismatch",
                  stage: "ground-truth",
                  message: `workedSolution does not contain verified value ${formatSignificantFigures(truth, 3)} for subpart "${part.partId}" ("${partTargetKey}")`,
                  expected: formatSignificantFigures(truth, 3),
                  repairHint: `Include verified value ${formatSignificantFigures(truth, 3)} for part (${part.partId}) in workedSolution`,
                });
              }
            }
          } else {
            // Non-numeric string or boolean solver classification
            if (extractedAnswerNums.length > 0) {
              issues.push({
                code: "ground-truth-mismatch",
                stage: "ground-truth",
                message: `Subpart "${part.partId}" expectedAnswer ("${part.expectedAnswer}") contains numeric value "${extractedAnswerNums[0].rawText}", while targetQuantityKey "${partTargetKey}" is non-numeric ("${String(truth)}")`,
                expected: String(truth),
                actual: part.expectedAnswer,
              });
            } else {
              solverCheckedQualitativeParts += 1;
              if (
                !textAgreesWithQualitativeTruth(part.expectedAnswer, truth)
              ) {
                issues.push({
                  code: "ground-truth-mismatch",
                  stage: "ground-truth",
                  message: `Subpart "${part.partId}" expectedAnswer ("${part.expectedAnswer}") does not match "${String(truth)}"`,
                  expected: String(truth),
                  actual: part.expectedAnswer,
                });
              }
            }
          }
        }
      }

      const structuredTargetMode = candidate.targetMode ?? "quantitative";
      if (
        structuredTargetMode === "quantitative" &&
        solverCheckedQuantitativeParts === 0
      ) {
        issues.push({
          code: "ground-truth-mismatch",
          stage: "ground-truth",
          message: `Quantitative structured question "${candidate.id}" must have at least one subpart with a solver-verified numeric targetQuantityKey`,
          repairHint:
            "Attach a valid numeric targetQuantityKey from verifiedQuantities to at least one quantitative subpart",
        });
      } else if (
        structuredTargetMode === "qualitative" &&
        solverCheckedQualitativeParts === 0
      ) {
        issues.push({
          code: "ground-truth-mismatch",
          stage: "ground-truth",
          message: `Qualitative structured question "${candidate.id}" must have at least one subpart verified against a solver classification targetQuantityKey`,
          repairHint:
            "Attach a solver classification targetQuantityKey to at least one subpart",
        });
      }

      if (partMarkSum !== candidate.totalMarks) {
        issues.push({
          code: "mark-sum-mismatch",
          stage: "structured",
          message: `Structured subpart marks sum to ${partMarkSum}, which does not equal totalMarks (${candidate.totalMarks})`,
          expected: candidate.totalMarks,
          actual: partMarkSum,
          repairHint:
            "Ensure totalMarks equals the exact sum of all subpart marks",
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 6. Mark Scheme Completeness & Per-Part Coverage Check
  // --------------------------------------------------------------------------
  if (!Array.isArray(candidate.markScheme) || candidate.markScheme.length === 0) {
    issues.push({
      code: "mark-scheme-coverage-mismatch",
      stage: "mark-scheme",
      message: "markScheme must contain at least one marking point",
    });
  } else {
    let schemeMarkSum = 0;
    for (const point of candidate.markScheme) {
      if (
        !point.code?.trim() ||
        !point.criterion?.trim() ||
        !Number.isInteger(point.marks) ||
        point.marks < 1
      ) {
        issues.push({
          code: "mark-scheme-coverage-mismatch",
          stage: "mark-scheme",
          message: `Invalid markScheme entry: ${JSON.stringify(point)}`,
        });
      } else {
        schemeMarkSum += point.marks;
      }
    }
    if (schemeMarkSum !== candidate.totalMarks) {
      issues.push({
        code: "mark-sum-mismatch",
        stage: "mark-scheme",
        message: `markScheme points sum to ${schemeMarkSum}, which does not equal totalMarks (${candidate.totalMarks})`,
        expected: candidate.totalMarks,
        actual: schemeMarkSum,
        repairHint:
          "Ensure markScheme points sum to totalMarks so every mark is covered",
      });
    }

    if (
      candidate.format === "structured" &&
      Array.isArray(candidate.parts) &&
      candidate.parts.length > 0
    ) {
      for (const part of candidate.parts) {
        const coveredMarks = candidate.markScheme
          .filter(
            (m) =>
              m.partId === part.partId ||
              (candidate.parts!.length === 1 && m.partId === undefined),
          )
          .reduce((acc, m) => acc + (Number.isInteger(m.marks) ? m.marks : 0), 0);

        if (coveredMarks !== part.marks) {
          issues.push({
            code: "mark-scheme-coverage-mismatch",
            stage: "mark-scheme",
            message: `Subpart "${part.partId}" allocates ${part.marks} mark(s), but markScheme points with partId="${part.partId}" cover ${coveredMarks} mark(s)`,
            expected: part.marks,
            actual: coveredMarks,
            repairHint: `Tag markScheme entries with partId: "${part.partId}" summing to ${part.marks}`,
          });
        }
      }
    }
  }

  if (
    !issues.some((i) =>
      ["mcq", "structured", "ground-truth", "mark-scheme"].includes(i.stage),
    )
  ) {
    passedChecks.push("format-ground-truth-and-markscheme-verified");
  }

  // --------------------------------------------------------------------------
  // 7. Near-Duplicate Stem Hash & Shingle Collision Check
  // --------------------------------------------------------------------------
  for (const existing of options.existingShardItems ?? []) {
    if (existing.id === candidate.id) {
      continue;
    }
    if (existing.stemFingerprint === stemFingerprint) {
      issues.push({
        code: "near-duplicate-stem",
        stage: "deduplication",
        message: `Candidate stem fingerprint collides with existing item "${existing.id}"`,
        actual: stemFingerprint,
        repairHint:
          "Vary the physical scenario context, parameters, or question wording so items are distinct",
      });
      break;
    }
    const sim = computeStemSimilarity(stemText, existing.stem);
    if (sim >= similarityThreshold) {
      issues.push({
        code: "near-duplicate-stem",
        stage: "deduplication",
        message: `Candidate stem has ${(sim * 100).toFixed(1)}% 3-gram similarity to existing item "${existing.id}" (threshold ${(similarityThreshold * 100).toFixed(0)}%)`,
        actual: Number(sim.toFixed(4)),
        repairHint:
          "Rewrite scenario context and change parameter values to avoid near-duplicate stems",
      });
      break;
    }
  }

  if (!issues.some((i) => i.stage === "deduplication")) {
    passedChecks.push("deduplication-passed");
  }

  return {
    evaluation: {
      valid: issues.length === 0,
      passedChecks,
      issues,
      stemFingerprint,
      svgFingerprint,
    },
    solveOutput,
    renderOutput,
    effectiveSvgMarkup,
    correctOptionIndex,
  };
}
