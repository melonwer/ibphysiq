import {
  getCompatibleSyllabiForConcept,
  SyllabusId,
  SyllabusLevel,
} from "@/lib/constants/syllabi";
import { Point2D } from "@/lib/visuals/types";

import {
  buildOptionEquivalenceKey,
  formatSignificantFigures,
} from "../numeric-checker";
import {
  CandidateQuestionInput,
  CandidateQuestionPlan,
  MCQ_OPTION_LABELS,
  McqOptionItem,
  QuestionDifficulty,
  QuestionFormat,
  RequiredGivenSpec,
  StructuredQuestionPart,
  SyllabusTag,
} from "../types";

export interface GraphsGeneratorOptions {
  seed?: number;
  count?: number;
  mcqRatio?: number;
  idPrefix?: string;
}

export interface GraphsArchetypeDescriptor {
  readonly index: number;
  readonly conceptId: string;
  readonly templateArchetype: string;
  readonly summary: string;
}

export const GRAPHS_ARCHETYPE_CATALOGUE: readonly GraphsArchetypeDescriptor[] = [
  {
    index: 0,
    conceptId: "motion-graphs",
    templateArchetype: "vt-signed-rebound-distance",
    summary:
      "Signed velocity-time graphs crossing zero: total distance vs net displacement and reversal acceleration",
  },
  {
    index: 1,
    conceptId: "motion-graphs",
    templateArchetype: "vt-trapezoid-journey-kinematics",
    summary:
      "Multi-stage velocity-time trapezoidal profiles with initial position offset, mean speed, and braking slope",
  },
  {
    index: 2,
    conceptId: "motion-graphs",
    templateArchetype: "st-piecewise-displacement-gradient",
    summary:
      "Piecewise displacement-time plots with non-zero initial position, dwell plateau, and return velocity gradient",
  },
  {
    index: 3,
    conceptId: "motion-graphs",
    templateArchetype: "at-acceleration-velocity-change",
    summary:
      "Signed acceleration-time profiles with non-zero initial velocity: velocity change, peak speed, and final velocity",
  },
  {
    index: 4,
    conceptId: "linear-momentum-impulse",
    templateArchetype: "pt-momentum-gradient-kinetic-work",
    summary:
      "Momentum-time profiles: resultant force from dp/dt gradient and kinetic energy transfer Δ(p²/2m)",
  },
  {
    index: 5,
    conceptId: "linear-momentum-impulse",
    templateArchetype: "ft-impulse-area-velocity-change",
    summary:
      "Variable force-time thruster and impact pulses: impulse area, velocity change, final momentum, and mean force",
  },
  {
    index: 6,
    conceptId: "work-energy-power",
    templateArchetype: "fx-variable-force-work-speed",
    summary:
      "Variable force-displacement graphs including resistive stages: net work integration and final speed from u₀",
  },
  {
    index: 7,
    conceptId: "radioactive-decay-half-life",
    templateArchetype: "semilog-activity-decay-gradient",
    summary:
      "Semi-logarithmic ln(A) vs t decay linearization (IB HL, A-Level Y13, NCUK IFY-S2): negative slope -λ and intercept",
  },
  {
    index: 8,
    conceptId: "elasticity-young-modulus",
    templateArchetype: "fx-hooke-spring-elastic-energy",
    summary:
      "Hooke's law force-extension plots: stiffness gradient, elastic strain energy area, and spring launch speed",
  },
  {
    index: 9,
    conceptId: "elasticity-young-modulus",
    templateArchetype: "stress-strain-young-modulus-curve",
    summary:
      "Tensile stress-strain elastic curves (UK A-Level & NCUK only; excluded from IB 2025): Young's modulus & strain energy density",
  },
  {
    index: 10,
    conceptId: "ohms-law-iv-characteristics",
    templateArchetype: "vi-nonohmic-static-resistance",
    summary:
      "Non-ohmic V-I characteristics for filament lamps and thermistors: static V/I resistance vs chord slope trap",
  },
  {
    index: 11,
    conceptId: "emf-internal-resistance",
    templateArchetype: "terminal-pd-current-internal-resistance",
    summary:
      "Cell terminal potential difference V = ε - Ir against current I: EMF intercept, negative slope -r, and mean terminal p.d.",
  },
  {
    index: 12,
    conceptId: "resistivity-ohmic-conductors",
    templateArchetype: "resistance-geometry-linearization",
    summary:
      "Linearized R vs L/A and R vs L plots with systematic contact-resistance intercept R₀: resistivity slope vs secant trap",
  },
  {
    index: 13,
    conceptId: "graphical-linearization-gradients",
    templateArchetype: "kinematics-gravity-v2-vs-drop-linearization",
    summary:
      "Light-gate v² vs track distance linearization separating IB (g = 9.8 m s⁻²) and A-Level/NCUK (g = 9.81 m s⁻²)",
  },
  {
    index: 14,
    conceptId: "electrostatic-coulomb-uniform-fields",
    templateArchetype: "inverse-square-force-linearization",
    summary:
      "Inverse-square Coulomb force F vs 1/r² linearization with systematic balance zero-offset F₀",
  },
  {
    index: 15,
    conceptId: "uncertainties-error-propagation",
    templateArchetype: "worst-fit-error-bar-gradient",
    summary:
      "Steepest and shallowest worst-fit lines through error-bar extremes on linearized experimental plots",
  },
];

interface Rng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

function createRng(seed: number): Rng {
  let state = Math.trunc(seed) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    next,
    int(minInclusive, maxInclusive) {
      return (
        minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1))
      );
    },
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      return copy;
    },
  };
}

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  "-": "⁻",
  "+": "",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

function cleanNum(value: number): number {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function fmt3(value: number, unit = ""): string {
  const raw = formatSignificantFigures(value, 3);
  const formatted = raw.replace(/e([+-]?\d+)/, (_m, exp: string) => {
    const sup = [...exp].map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch).join("");
    return ` × 10${sup}`;
  });
  return unit ? `${formatted} ${unit}` : formatted;
}

function fmtGiven(value: number, unit = ""): string {
  const cleaned = cleanNum(value);
  const str = Number.isInteger(cleaned) ? `${cleaned}.0` : String(cleaned);
  return unit ? `${str} ${unit}` : str;
}

interface DistractorCandidate {
  value: number;
  rationale: string;
}

function valuesDistinct3sf(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a * b < 0) return true;
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / denom > 0.025;
}

function buildMcqOptions(
  rng: Rng,
  correctValue: number,
  unit: string,
  candidates: readonly DistractorCandidate[],
): McqOptionItem[] {
  const correctText = fmt3(correctValue, unit);
  const usedValues: number[] = [correctValue];
  const usedKeys = new Set<string>([buildOptionEquivalenceKey(correctText)]);
  const chosen: Array<{
    text: string;
    isCorrect: boolean;
    distractorRationale?: string;
  }> = [{ text: correctText, isCorrect: true }];

  for (const cand of candidates) {
    if (chosen.length >= 4) break;
    if (!Number.isFinite(cand.value)) continue;
    if (!usedValues.every((u) => valuesDistinct3sf(u, cand.value))) continue;
    const text = fmt3(cand.value, unit);
    const key = buildOptionEquivalenceKey(text);
    if (usedKeys.has(key)) continue;
    usedValues.push(cand.value);
    usedKeys.add(key);
    chosen.push({
      text,
      isCorrect: false,
      distractorRationale: cand.rationale,
    });
  }

  const fallbackMultipliers = [
    {
      factor: 0.5,
      rationale:
        "Introduces an erroneous factor of one half when evaluating the graphical quantity.",
    },
    {
      factor: 2.0,
      rationale:
        "Doubles the magnitude by omitting a triangular factor of one half or misreading the axis scale.",
    },
    {
      factor: 1.5,
      rationale:
        "Misreads the minor grid subdivisions along the horizontal axis when extracting the interval.",
    },
    {
      factor: 0.25,
      rationale:
        "Divides by twice the axis span instead of the actual plotted coordinate interval.",
    },
  ];

  for (const fb of fallbackMultipliers) {
    if (chosen.length >= 4) break;
    const val = correctValue * fb.factor;
    if (!usedValues.every((u) => valuesDistinct3sf(u, val))) continue;
    const text = fmt3(val, unit);
    const key = buildOptionEquivalenceKey(text);
    if (usedKeys.has(key)) continue;
    usedValues.push(val);
    usedKeys.add(key);
    chosen.push({
      text,
      isCorrect: false,
      distractorRationale: fb.rationale,
    });
  }

  const shuffled = rng.shuffle(chosen);
  return shuffled.map((entry, idx) => ({
    label: MCQ_OPTION_LABELS[idx],
    text: entry.text,
    isCorrect: entry.isCorrect,
    ...(entry.distractorRationale
      ? { distractorRationale: entry.distractorRationale }
      : {}),
  }));
}

interface SyllabusFilterConfig {
  allowedSyllabi?: readonly SyllabusId[];
  preferredLevels?: Partial<Record<SyllabusId, SyllabusLevel>>;
  variantIndex: number;
}

function resolveSyllabiTags(
  conceptId: string,
  format: QuestionFormat,
  config: SyllabusFilterConfig,
): SyllabusTag[] {
  const compatible = getCompatibleSyllabiForConcept(conceptId, {
    format,
    excludeOptionTopics: true,
  });

  const tags: SyllabusTag[] = [];
  for (const mapping of compatible) {
    if (
      config.allowedSyllabi &&
      !config.allowedSyllabi.includes(mapping.syllabus)
    ) {
      continue;
    }
    const preferred = config.preferredLevels?.[mapping.syllabus];
    const selectedLevel =
      preferred && mapping.levels.includes(preferred)
        ? preferred
        : mapping.levels[config.variantIndex % mapping.levels.length];

    if (!selectedLevel) continue;
    const topicId = mapping.topicIds[0];
    const subtopicId = mapping.subtopicIds[0];
    if (!topicId) continue;

    tags.push({
      syllabus: mapping.syllabus,
      level: selectedLevel,
      topicId,
      ...(subtopicId ? { subtopicId } : {}),
    });
  }

  return tags;
}

function selectDifficulty(variantIndex: number): QuestionDifficulty {
  const mod = variantIndex % 6;
  if (mod === 0 || mod === 3) return "foundation";
  if (mod === 1 || mod === 2 || mod === 4) return "standard";
  return "higher";
}

function makeMcqPlan(
  targetDescription: string,
  strategyTags: readonly [string, string, string],
  assumptions: readonly string[],
): CandidateQuestionPlan {
  return {
    targetSummary: targetDescription,
    distractorStrategy: [...strategyTags],
    assumptions: [...assumptions],
  };
}

function makeStructuredPlan(
  targetDescription: string,
  subpartGoals: readonly string[],
  assumptions: readonly string[],
): CandidateQuestionPlan {
  return {
    targetSummary: targetDescription,
    subpartStrategy: [...subpartGoals],
    assumptions: [...assumptions],
  };
}

interface ItemBuildContext {
  id: string;
  seed: number;
  format: QuestionFormat;
  difficulty: QuestionDifficulty;
  variantIndex: number;
  formatIndex: number;
  rng: Rng;
}

// ============================================================================
// Archetype 1: motion-graphs :: vt-signed-rebound-distance
// ============================================================================
function buildSignedReboundItem(ctx: ItemBuildContext): CandidateQuestionInput {
  const conceptId = "motion-graphs";
  const templateArchetype = "vt-signed-rebound-distance";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
  });

  const apparatuses = [
    {
      subject: "an automated rail inspection trolley",
      track: "along a straight viaduct rail",
      posDir: "eastward",
    },
    {
      subject: "a magnetic-levitation shuttle pod",
      track: "on a horizontal vacuum test guideway",
      posDir: "to the right",
    },
    {
      subject: "a robotic warehouse retrieval carriage",
      track: "along a straight aisle rail",
      posDir: "forward",
    },
    {
      subject: "a cable-hauled alpine service car",
      track: "on a straight haulage section",
      posDir: "uphill",
    },
    {
      subject: "a linear-motor camera dolly",
      track: "on a studio optical bench",
      posDir: "northward",
    },
    {
      subject: "an underwater ROV thruster sled",
      track: "along a taut calibration tether",
      posDir: "away from the dock",
    },
    {
      subject: "a cleanroom wafer transport shuttle",
      track: "along a linear air bearing",
      posDir: "to the right",
    },
    {
      subject: "an autonomous harbour mooring buggy",
      track: "along a straight quay rail",
      posDir: "southward",
    },
    {
      subject: "a drop-tower counterbalance carriage",
      track: "inside a vertical guide shaft",
      posDir: "upward",
    },
    {
      subject: "a seismic actuator test sled",
      track: "on a low-friction hydraulic guide",
      posDir: "in the positive x-direction",
    },
  ];
  const app = apparatuses[ctx.variantIndex % apparatuses.length];

  // Clean zero-crossing geometry: vPos + vNeg divides (t3 - t2) * 2
  const presets = [
    { t1: 2, t2: 5, t3: 8, t4: 10, vPos: 8, vNeg: 4 },
    { t1: 2, t2: 6, t3: 9, t4: 12, vPos: 8, vNeg: 4 },
    { t1: 3, t2: 6, t3: 10, t4: 12, vPos: 9, vNeg: 3 },
    { t1: 2, t2: 4, t3: 8, t4: 10, vPos: 6, vNeg: 2 },
    { t1: 4, t2: 8, t3: 12, t4: 16, vPos: 6, vNeg: 2 },
    { t1: 3, t2: 7, t3: 10, t4: 15, vPos: 10, vNeg: 5 },
    { t1: 2, t2: 5, t3: 9, t4: 12, vPos: 12, vNeg: 4 },
    { t1: 4, t2: 10, t3: 15, t4: 20, vPos: 12, vNeg: 8 },
    { t1: 2, t2: 6, t3: 10, t4: 14, vPos: 9, vNeg: 3 },
    { t1: 5, t2: 10, t3: 15, t4: 20, vPos: 15, vNeg: 5 },
  ];
  const p = presets[ctx.variantIndex % presets.length];
  const scale = ctx.variantIndex >= 10 ? 2 : 1;
  const vPos = p.vPos * scale;
  const vNeg = p.vNeg * scale;
  const { t1, t2, t3, t4 } = p;

  const points: Point2D[] = [
    { x: 0, y: 0 },
    { x: t1, y: vPos },
    { x: t2, y: vPos },
    { x: t3, y: -vNeg },
    { x: t4, y: -vNeg },
  ];

  const tZero = cleanNum(t2 + (vPos / (vPos + vNeg)) * (t3 - t2));
  const posArea =
    0.5 * t1 * vPos + (t2 - t1) * vPos + 0.5 * (tZero - t2) * vPos;
  const negAreaMag = 0.5 * (t3 - tZero) * vNeg + (t4 - t3) * vNeg;
  const unsignedArea = cleanNum(posArea + negAreaMag);
  const signedArea = cleanNum(posArea - negAreaMag);
  const meanRate = cleanNum(signedArea / t4);
  const gradient = cleanNum((-vNeg - vPos) / (t3 - t2));

  const scenarioSpec = {
    kind: "piecewise-linear-graph",
    xLabel: "time",
    xUnit: "s",
    yLabel: "velocity",
    yUnit: "m s⁻¹",
    points,
    gradientInterval: [t2, t3],
  };

  if (ctx.format === "mcq") {
    const mode = ctx.variantIndex % 3;
    if (mode === 0) {
      const stemTemplates = [
        `During a dynamic acceptance trial, ${app.subject} moves ${app.track}, taking ${app.posDir} as positive. Using the velocity–time graph recorded from t = 0.0 s to t = ${fmtGiven(t4, "s")}, determine the total distance travelled.`,
        `Telemetry from ${app.subject} operating ${app.track} is plotted on the velocity–time axes shown (${app.posDir} positive). What total path distance is covered over the ${fmtGiven(t4, "s")} run?`,
        `The velocity–time profile shows ${app.subject} reversing motion ${app.track} with ${app.posDir} defined as positive. Calculate the total scalar distance travelled between t = 0.0 s and t = ${fmtGiven(t4, "s")}.`,
        `Engineers log the signed velocity of ${app.subject} ${app.track} over ${fmtGiven(t4, "s")}. How much total distance does it cover before the recording ends at t = ${fmtGiven(t4, "s")}?`,
      ];
      const stem = stemTemplates[Math.floor(ctx.variantIndex / 3) % stemTemplates.length];
      const options = buildMcqOptions(ctx.rng, unsignedArea, "m", [
        {
          value: signedArea,
          rationale:
            "Subtracts the area below the time axis from the positive area, giving net signed displacement rather than total distance.",
        },
        {
          value: posArea,
          rationale:
            "Integrates only up to the zero-velocity instant and omits the distance travelled after reversing direction.",
        },
        {
          value: vPos * t4,
          rationale:
            "Multiplies peak forward velocity by the entire duration without accounting for ramps or direction reversal.",
        },
        {
          value: unsignedArea + 0.5 * t1 * vPos,
          rationale:
            "Treats the initial acceleration triangle as a full rectangle by omitting the factor of one half.",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["unsignedArea"],
        targetQuantityKey: "unsignedArea",
        questionPlan: makeMcqPlan(
          "Determine total unsigned distance from a velocity-time graph that crosses the time axis",
          [
            "signed-displacement-subtraction-instead-of-unsigned-sum",
            "truncating-integral-at-zero-crossing",
            "constant-peak-speed-product-error",
          ],
          ["rectilinear motion", "piecewise constant acceleration"],
        ),
        stem,
        options,
        workedSolution: `Velocity crosses zero at t = ${tZero} s. Forward area (0 to ${tZero} s) = ½(${t1})(${vPos}) + (${t2 - t1})(${vPos}) + ½(${cleanNum(tZero - t2)})(${vPos}) = ${fmt3(posArea, "m")}. Reverse area magnitude (${tZero} s to ${t4} s) = ½(${cleanNum(t3 - tZero)})(${vNeg}) + (${t4 - t3})(${vNeg}) = ${fmt3(negAreaMag, "m")}. Total distance = ${fmt3(posArea)} + ${fmt3(negAreaMag)} = ${fmt3(unsignedArea, "m")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Sums unsigned positive (${fmt3(posArea, "m")}) and negative (${fmt3(negAreaMag, "m")}) velocity–time areas to obtain ${fmt3(unsignedArea, "m")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (mode === 1) {
      const stemTemplates = [
        `On a straight test section, ${app.subject} moves ${app.track} (${app.posDir} positive) as shown on the velocity–time graph. What is its net displacement from t = 0.0 s to t = ${fmtGiven(t4, "s")}?`,
        `A motion sensor tracks ${app.subject} ${app.track} for ${fmtGiven(t4, "s")}, taking ${app.posDir} velocity as positive. Find the net signed displacement at t = ${fmtGiven(t4, "s")} relative to its starting point.`,
        `Refer to the signed velocity–time graph for ${app.subject} travelling ${app.track}. Determine the resultant displacement after ${fmtGiven(t4, "s")}.`,
      ];
      const stem = stemTemplates[Math.floor(ctx.variantIndex / 3) % stemTemplates.length];
      const options = buildMcqOptions(ctx.rng, signedArea, "m", [
        {
          value: unsignedArea,
          rationale:
            "Adds the magnitude of the negative-velocity area instead of subtracting it, finding total distance rather than net displacement.",
        },
        {
          value: posArea,
          rationale:
            "Finds the maximum forward displacement at the turning point and ignores the subsequent reverse motion.",
        },
        {
          value: (vPos - vNeg) * t4 * 0.5,
          rationale:
            "Multiplies half the difference of terminal speeds by total time, ignoring the piecewise plateau durations.",
        },
        {
          value: -signedArea,
          rationale:
            "Reverses the sign of the net area when combining forward and backward segments.",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["signedArea"],
        targetQuantityKey: "signedArea",
        questionPlan: makeMcqPlan(
          "Evaluate net signed displacement by subtracting reverse-motion area on a velocity-time graph",
          [
            "unsigned-distance-sum-instead-of-signed-integral",
            "ignoring-reverse-motion-after-turning-point",
            "sign-inversion-on-net-displacement",
          ],
          ["rectilinear motion", "signed area integration"],
        ),
        stem,
        options,
        workedSolution: `Velocity reaches zero at t = ${tZero} s. Positive area = ${fmt3(posArea, "m")} and area below the axis has magnitude ${fmt3(negAreaMag, "m")}. Net displacement = ${fmt3(posArea)} − ${fmt3(negAreaMag)} = ${fmt3(signedArea, "m")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Subtracts reverse area (${fmt3(negAreaMag, "m")}) from forward area (${fmt3(posArea, "m")}) to obtain ${fmt3(signedArea, "m")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stemTemplates = [
      `While operating ${app.track} (${app.posDir} positive), ${app.subject} brakes and reverses direction between t = ${fmtGiven(t2, "s")} and t = ${fmtGiven(t3, "s")}. From the velocity–time graph, what is its acceleration during this interval?`,
      `Inspect the constant-gradient reversal stage from t = ${fmtGiven(t2, "s")} to t = ${fmtGiven(t3, "s")} for ${app.subject} moving ${app.track}. What signed acceleration acts over this stage?`,
      `Between t = ${fmtGiven(t2, "s")} and t = ${fmtGiven(t3, "s")}, a reverse thrust acts on ${app.subject} ${app.track}. Determine the acceleration indicated by the velocity–time plot.`,
    ];
    const stem = stemTemplates[Math.floor(ctx.variantIndex / 3) % stemTemplates.length];
    const options = buildMcqOptions(ctx.rng, gradient, "m s⁻²", [
      {
        value: Math.abs(gradient),
        rationale:
          "Computes the slope magnitude accurately but omits the negative sign of the acceleration.",
      },
      {
        value: -(vPos - vNeg) / (t3 - t2),
        rationale:
          "Uses v_pos − |v_neg| instead of (−v_neg − v_pos) for Δv across the zero-velocity axis.",
      },
      {
        value: (-vNeg - vPos) / t3,
        rationale:
          "Divides the velocity change by t₃ rather than the elapsed stage duration (t₃ − t₂).",
      },
      {
        value: -vNeg / (t3 - t2),
        rationale:
          "Includes only the velocity change below the time axis and ignores the deceleration from v_pos to zero.",
      },
      {
        value: -vPos / (t3 - t2),
        rationale:
          "Calculates deceleration only from +v_pos down to zero over the full stage duration (t₃ − t₂), omitting reverse-direction acceleration.",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["gradient"],
      targetQuantityKey: "gradient",
      questionPlan: makeMcqPlan(
        "Extract signed acceleration from a negative-gradient reversal segment on a velocity-time plot",
        [
          "omitting-negative-sign-of-slope",
          "subtracting-speeds-instead-of-signed-velocities",
          "secant-division-by-endpoint-time",
        ],
        ["constant reversal acceleration", "signed velocity convention"],
      ),
      stem,
      options,
      workedSolution: `Between t = ${t2} s and t = ${t3} s, velocity changes from +${vPos} m s⁻¹ to −${vNeg} m s⁻¹. Acceleration a = Δv / Δt = (−${vNeg} − ${vPos}) / (${t3} − ${t2}) = ${fmt3(gradient, "m s⁻²")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates Δv / Δt = (−${vNeg} − ${vPos}) / (${t3 - t2}) = ${fmt3(gradient, "m s⁻²")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (3 subparts, 5 marks)
  const structStems = [
    `In a laboratory motion trial, ${app.subject} travels ${app.track} with ${app.posDir} taken as positive. The velocity–time graph records its motion from t = 0.0 s to t = ${fmtGiven(t4, "s")}, including uniform reversal thrust from t = ${fmtGiven(t2, "s")} to t = ${fmtGiven(t3, "s")}.`,
    `A data logger records the signed velocity of ${app.subject} moving ${app.track} (${app.posDir} positive) over a ${fmtGiven(t4, "s")} cycle, with constant braking and reversal applied between t = ${fmtGiven(t2, "s")} and t = ${fmtGiven(t3, "s")}.`,
    `The graph displays how the velocity of ${app.subject} ${app.track} varies with time over ${fmtGiven(t4, "s")}. Positive velocity corresponds to motion ${app.posDir}, and direction reversal occurs during the linear ramp between t = ${fmtGiven(t2, "s")} and t = ${fmtGiven(t3, "s")}.`,
  ];
  const stem = structStems[ctx.variantIndex % structStems.length];

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: `Calculate the total distance travelled between t = 0.0 s and t = ${fmtGiven(t4, "s")}.`,
      marks: 2,
      targetQuantityKey: "unsignedArea",
      expectedAnswer: fmt3(unsignedArea, "m"),
      workingSteps: [
        `Velocity crosses zero at t = ${tZero} s; forward area = ${fmt3(posArea, "m")}.`,
        `Unsigned reverse area = ${fmt3(negAreaMag, "m")}, so total distance = ${fmt3(posArea)} + ${fmt3(negAreaMag)} = ${fmt3(unsignedArea, "m")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the net displacement and hence calculate the average velocity over the ${fmtGiven(t4, "s")} interval.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "meanRate",
      expectedAnswer: fmt3(meanRate, "m s⁻¹"),
      workingSteps: [
        `Net displacement Δs = ${fmt3(posArea)} − ${fmt3(negAreaMag)} = ${fmt3(signedArea, "m")}.`,
        `Average velocity = Δs / Δt = ${fmt3(signedArea)} / ${t4} = ${fmt3(meanRate, "m s⁻¹")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Calculate the acceleration between t = ${fmtGiven(t2, "s")} and t = ${fmtGiven(t3, "s")}.`,
      marks: 1,
      targetQuantityKey: "gradient",
      expectedAnswer: fmt3(gradient, "m s⁻²"),
      workingSteps: [
        `a = (−${vNeg} − ${vPos}) / (${t3} − ${t2}) = ${fmt3(gradient, "m s⁻²")}.`,
      ],
    },
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: ["unsignedArea", "signedArea", "meanRate", "gradient"],
    questionPlan: makeStructuredPlan(
      "Multi-step analysis of a signed velocity-time reversal profile covering total distance, average velocity, and reversal acceleration",
      [
        "sum unsigned areas above and below time axis for total distance",
        "evaluate signed displacement divided by duration for mean velocity",
        "extract negative slope over the reversal ramp for acceleration",
      ],
      ["rectilinear motion", "piecewise linear velocity segments"],
    ),
    stem,
    parts,
    workedSolution: `(a) Zero-velocity crossing is at t = ${tZero} s. Positive area = ${fmt3(posArea, "m")} and unsigned negative area = ${fmt3(negAreaMag, "m")}, giving total distance = ${fmt3(unsignedArea, "m")}. (b) Net displacement = ${fmt3(posArea)} − ${fmt3(negAreaMag)} = ${fmt3(signedArea, "m")}; average velocity = ${fmt3(signedArea)} / ${t4} = ${fmt3(meanRate, "m s⁻¹")}. (c) Acceleration = (−${vNeg} − ${vPos}) / (${t3} − ${t2}) = ${fmt3(gradient, "m s⁻²")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Finds zero-crossing t = ${tZero} s and evaluates both unsigned areas (${fmt3(posArea, "m")} and ${fmt3(negAreaMag, "m")}).`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains total distance = ${fmt3(unsignedArea, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Subtracts areas for net displacement (${fmt3(signedArea, "m")}) and divides by ${t4} s.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains average velocity = ${fmt3(meanRate, "m s⁻¹")}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains acceleration = ${fmt3(gradient, "m s⁻²")} including negative sign.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
  };
}

// ============================================================================
// Archetype 2: motion-graphs :: vt-trapezoid-journey-kinematics
// ============================================================================
function buildTrapezoidJourneyItem(
  ctx: ItemBuildContext,
): CandidateQuestionInput {
  const conceptId = "motion-graphs";
  const templateArchetype = "vt-trapezoid-journey-kinematics";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
  });

  const contexts = [
    {
      vehicle: "an inter-terminal airport monorail",
      ref: "concourse datum post",
    },
    {
      vehicle: "a linear-induction baggage carrier",
      ref: "sorting-hall origin sensor",
    },
    {
      vehicle: "a canal lock towing locomotive",
      ref: "lock-gate reference mark",
    },
    {
      vehicle: "a solar-powered desert research rover",
      ref: "base-camp beacon",
    },
    {
      vehicle: "a shipyard gantry crane crab",
      ref: "western end-stop",
    },
    {
      vehicle: "an underground mine haulage skip",
      ref: "shaft loading datum",
    },
    {
      vehicle: "a high-speed bottling-line transfer sled",
      ref: "optical home flag",
    },
    {
      vehicle: "a wind-tunnel moving-ground carriage",
      ref: "nozzle datum line",
    },
  ];
  const sc = contexts[ctx.variantIndex % contexts.length];

  const presets = [
    { t1: 2, t2: 7, t3: 10, vPeak: 12, s0: 15 },
    { t1: 3, t2: 8, t3: 12, vPeak: 10, s0: 20 },
    { t1: 4, t2: 10, t3: 16, vPeak: 15, s0: 25 },
    { t1: 2, t2: 6, t3: 8, vPeak: 8, s0: 12 },
    { t1: 5, t2: 15, t3: 20, vPeak: 14, s0: 30 },
    { t1: 3, t2: 9, t3: 15, vPeak: 18, s0: 40 },
    { t1: 4, t2: 12, t3: 16, vPeak: 16, s0: 18 },
    { t1: 6, t2: 14, t3: 20, vPeak: 20, s0: 35 },
    { t1: 2, t2: 8, t3: 10, vPeak: 15, s0: 22 },
    { t1: 5, t2: 12, t3: 16, vPeak: 12, s0: 28 },
  ];
  const p = presets[ctx.variantIndex % presets.length];
  const vPeak = ctx.variantIndex >= 10 ? p.vPeak + 4 : p.vPeak;
  const s0 = ctx.variantIndex >= 10 ? p.s0 + 10 : p.s0;
  const { t1, t2, t3 } = p;

  const points: Point2D[] = [
    { x: 0, y: 0 },
    { x: t1, y: vPeak },
    { x: t2, y: vPeak },
    { x: t3, y: 0 },
  ];

  const signedArea = cleanNum(0.5 * (t3 + (t2 - t1)) * vPeak);
  const finalCumulativeValue = cleanNum(s0 + signedArea);
  const meanRate = cleanNum(signedArea / t3);
  const gradient = cleanNum(-vPeak / (t3 - t2));

  const scenarioSpec = {
    kind: "piecewise-linear-graph",
    xLabel: "time",
    xUnit: "s",
    yLabel: "velocity",
    yUnit: "m s⁻¹",
    points,
    initialValue: s0,
    gradientInterval: [t2, t3],
  };

  if (ctx.format === "mcq") {
    const mode = ctx.variantIndex % 3;
    if (mode === 0) {
      const stems = [
        `At t = 0.0 s, ${sc.vehicle} is stationary at a position ${fmtGiven(s0, "m")} ahead of a ${sc.ref}. It then moves forward along a straight guideway according to the velocity–time graph for ${fmtGiven(t3, "s")}. What is its final distance from the ${sc.ref} at t = ${fmtGiven(t3, "s")}?`,
        `Starting ${fmtGiven(s0, "m")} beyond the ${sc.ref} at t = 0.0 s, ${sc.vehicle} executes the ${fmtGiven(t3, "s")} velocity–time profile shown. How far from the ${sc.ref} does it come to rest?`,
        `Sensors record ${sc.vehicle} initially at x = ${fmtGiven(s0, "m")} relative to a ${sc.ref}. Using the velocity–time plot up to t = ${fmtGiven(t3, "s")}, determine its final coordinate x.`,
      ];
      const stem = stems[Math.floor(ctx.variantIndex / 3) % stems.length];
      const options = buildMcqOptions(ctx.rng, finalCumulativeValue, "m", [
        {
          value: signedArea,
          rationale:
            "Calculates the trapezium displacement correctly but forgets to add the initial position offset x₀.",
        },
        {
          value: s0 + vPeak * t3,
          rationale:
            "Treats the entire journey as constant-speed motion at peak velocity before adding x₀.",
        },
        {
          value: signedArea - s0,
          rationale:
            "Subtracts the initial forward position x₀ from the integrated displacement instead of adding it.",
        },
        {
          value: s0 + (t2 - t1) * vPeak,
          rationale:
            "Includes only the cruise-plateau displacement and omits both acceleration and braking triangles.",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["finalCumulativeValue"],
        targetQuantityKey: "finalCumulativeValue",
        questionPlan: makeMcqPlan(
          "Integrate trapezoidal velocity-time area and combine with nonzero initial position",
          [
            "omitting-initial-position-offset",
            "rectangular-peak-velocity-overestimate",
            "subtracting-instead-of-adding-initial-offset",
          ],
          ["rectilinear motion", "nonzero initial coordinate"],
        ),
        stem,
        options,
        workedSolution: `Displacement during the ${t3} s run equals the trapezium area: Δx = ½(${t3} + ${t2 - t1})(${vPeak}) = ${fmt3(signedArea, "m")}. Final position from the ${sc.ref} = x₀ + Δx = ${s0} + ${fmt3(signedArea)} = ${fmt3(finalCumulativeValue, "m")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Adds trapezium area (${fmt3(signedArea, "m")}) to initial offset (${s0} m) to get ${fmt3(finalCumulativeValue, "m")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (mode === 1) {
      const stems = [
        `Beginning ${fmtGiven(s0, "m")} past a ${sc.ref}, ${sc.vehicle} follows the velocity–time profile shown over ${fmtGiven(t3, "s")}. What is its mean speed during the ${fmtGiven(t3, "s")} journey?`,
        `Over a ${fmtGiven(t3, "s")} transfer starting at x = ${fmtGiven(s0, "m")} from the ${sc.ref}, ${sc.vehicle} has the velocity–time graph shown. Calculate its average speed over the ${fmtGiven(t3, "s")} interval.`,
        `Examine the ${fmtGiven(t3, "s")} velocity–time curve for ${sc.vehicle} (initial coordinate ${fmtGiven(s0, "m")} from the ${sc.ref}). What mean speed is achieved during this movement?`,
      ];
      const stem = stems[Math.floor(ctx.variantIndex / 3) % stems.length];
      const options = buildMcqOptions(ctx.rng, meanRate, "m s⁻¹", [
        {
          value: 0.5 * vPeak,
          rationale:
            "Takes half of the peak velocity as if there were no constant-speed cruise plateau.",
        },
        {
          value: finalCumulativeValue / t3,
          rationale:
            "Divides the final coordinate (x₀ + Δx) by total time rather than dividing the distance travelled Δx by total time.",
        },
        {
          value: vPeak,
          rationale:
            "Confuses the cruise plateau velocity with the journey-wide mean speed.",
        },
        {
          value: ((t2 - t1) * vPeak) / t3,
          rationale:
            "Divides only the cruise-stage distance by the total duration, neglecting the ramp stages.",
        },
        {
          value: (0.5 * (t1 + (t3 - t2)) * vPeak) / t3,
          rationale:
            "Integrates only the acceleration and braking triangles while omitting the cruise plateau distance.",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["meanRate"],
        targetQuantityKey: "meanRate",
        questionPlan: makeMcqPlan(
          "Compute journey mean speed from trapezoidal area divided by total duration",
          [
            "half-peak-velocity-ignoring-cruise-plateau",
            "including-initial-position-in-distance-numerator",
            "using-cruise-speed-as-mean-speed",
          ],
          ["unidirectional forward motion"],
        ),
        stem,
        options,
        workedSolution: `Distance travelled Δx = ½(${t3} + ${t2 - t1})(${vPeak}) = ${fmt3(signedArea, "m")} (independent of the ${s0} m starting offset). Mean speed = ${fmt3(signedArea)} / ${t3} = ${fmt3(meanRate, "m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Divides trapezium distance (${fmt3(signedArea, "m")}) by ${t3} s to obtain ${fmt3(meanRate, "m s⁻¹")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stems = [
      `Starting at x = ${fmtGiven(s0, "m")} from a ${sc.ref}, ${sc.vehicle} completes the ${fmtGiven(t3, "s")} journey shown on the velocity–time graph, braking uniformly from t = ${fmtGiven(t2, "s")} to t = ${fmtGiven(t3, "s")}. What is its acceleration during braking?`,
      `In the velocity–time record for ${sc.vehicle} (initially ${fmtGiven(s0, "m")} from the ${sc.ref}), uniform braking begins at t = ${fmtGiven(t2, "s")} and ends at rest at t = ${fmtGiven(t3, "s")}. Find the signed braking acceleration.`,
    ];
    const stem = stems[Math.floor(ctx.variantIndex / 3) % stems.length];
    const options = buildMcqOptions(ctx.rng, gradient, "m s⁻²", [
      {
        value: Math.abs(gradient),
        rationale:
          "Finds the magnitude of deceleration but omits the negative sign required for signed acceleration.",
      },
      {
        value: -vPeak / t3,
        rationale:
          "Divides the velocity drop by the full journey duration t₃ instead of the braking duration (t₃ − t₂).",
      },
      {
        value: vPeak / t1,
        rationale:
          "Calculates the initial positive acceleration gradient from 0 to t₁ instead of the braking gradient.",
      },
      {
        value: -(t3 - t2) / vPeak,
        rationale:
          "Inverts Δt / Δv instead of computing Δv / Δt.",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["gradient"],
      targetQuantityKey: "gradient",
      questionPlan: makeMcqPlan(
        "Determine signed braking acceleration from terminal ramp slope",
        [
          "sign-omission-on-braking-slope",
          "dividing-by-total-time-instead-of-braking-interval",
          "reading-initial-acceleration-stage",
        ],
        ["uniform braking stage"],
      ),
      stem,
      options,
      workedSolution: `During braking from t = ${t2} s to t = ${t3} s, a = (0 − ${vPeak}) / (${t3} − ${t2}) = ${fmt3(gradient, "m s⁻²")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Computes (0 − ${vPeak}) / (${t3 - t2}) = ${fmt3(gradient, "m s⁻²")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const structStems = [
    `At t = 0.0 s, ${sc.vehicle} rests at a position ${fmtGiven(s0, "m")} ahead of a ${sc.ref}. The velocity–time graph shows its forward motion over ${fmtGiven(t3, "s")}, with uniform braking applied from t = ${fmtGiven(t2, "s")} until t = ${fmtGiven(t3, "s")}.`,
    `Telemetry for ${sc.vehicle} begins at t = 0.0 s when it is stationary ${fmtGiven(s0, "m")} beyond the ${sc.ref}. Its velocity–time profile over the ${fmtGiven(t3, "s")} run is plotted, with braking starting at t = ${fmtGiven(t2, "s")}.`,
  ];
  const stem = structStems[ctx.variantIndex % structStems.length];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: [
      "signedArea",
      "finalCumulativeValue",
      "meanRate",
      "gradient",
    ],
    questionPlan: makeStructuredPlan(
      "Analyze a trapezoidal velocity-time journey with initial position offset, final coordinate, mean speed, and braking acceleration",
      [
        "integrate trapezium area for distance travelled",
        "add initial offset for final position from datum",
        "compute mean speed and signed braking slope",
      ],
      ["rectilinear motion", "piecewise linear speed stages"],
    ),
    stem,
    parts: [
      {
        partId: "a",
        prompt: `Calculate the distance travelled during the ${fmtGiven(t3, "s")} journey.`,
        marks: 2,
        targetQuantityKey: "signedArea",
        expectedAnswer: fmt3(signedArea, "m"),
        workingSteps: [
          `Distance equals the trapezium area under the v–t curve.`,
          `Δx = ½ × (${t3} + ${t2 - t1}) × ${vPeak} = ${fmt3(signedArea, "m")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Hence state its final distance from the ${sc.ref} at t = ${fmtGiven(t3, "s")}.`,
        marks: 1,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "finalCumulativeValue",
        expectedAnswer: fmt3(finalCumulativeValue, "m"),
        workingSteps: [
          `x_final = ${s0} + ${fmt3(signedArea)} = ${fmt3(finalCumulativeValue, "m")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the mean speed over the ${fmtGiven(t3, "s")} run.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "meanRate",
        expectedAnswer: fmt3(meanRate, "m s⁻¹"),
        workingSteps: [
          `v_mean = Δx / t_total = ${fmt3(signedArea)} / ${t3} = ${fmt3(meanRate, "m s⁻¹")}.`,
        ],
      },
      {
        partId: "d",
        prompt: `Calculate the acceleration between t = ${fmtGiven(t2, "s")} and t = ${fmtGiven(t3, "s")}.`,
        marks: 1,
        targetQuantityKey: "gradient",
        expectedAnswer: fmt3(gradient, "m s⁻²"),
        workingSteps: [
          `a = (0 − ${vPeak}) / (${t3} − ${t2}) = ${fmt3(gradient, "m s⁻²")}.`,
        ],
      },
    ],
    workedSolution: `(a) Trapezium area Δx = ½(${t3} + ${t2 - t1})(${vPeak}) = ${fmt3(signedArea, "m")}. (b) Final distance from datum = ${s0} + ${fmt3(signedArea)} = ${fmt3(finalCumulativeValue, "m")}. (c) Mean speed = ${fmt3(signedArea)} / ${t3} = ${fmt3(meanRate, "m s⁻¹")}. (d) Braking acceleration = (0 − ${vPeak}) / (${t3} − ${t2}) = ${fmt3(gradient, "m s⁻²")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Identifies distance travelled as the area under the v–t trapezium.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains Δx = ${fmt3(signedArea, "m")}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Adds ${s0} m offset to obtain ${fmt3(finalCumulativeValue, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Divides distance travelled from (a) by ${t3} s.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains mean speed = ${fmt3(meanRate, "m s⁻¹")}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "d",
        criterion: `Obtains braking acceleration = ${fmt3(gradient, "m s⁻²")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

// ============================================================================
// Archetype 3: motion-graphs :: st-piecewise-displacement-gradient
// ============================================================================
function buildDisplacementTimeItem(
  ctx: ItemBuildContext,
): CandidateQuestionInput {
  const conceptId = "motion-graphs";
  const templateArchetype = "st-piecewise-displacement-gradient";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
  });

  const apparatuses = [
    { body: "an ultrasonic rangefinder target cart", bench: "an air track" },
    { body: "a laser-tracked precision stage", bench: "a metrology rail" },
    { body: "an automated pharmacy courier pod", bench: "a straight chute" },
    { body: "a coastal tide-gauge float", bench: "a vertical stilling tube" },
    { body: "a robotic welding torch carriage", bench: "a linear gantry" },
    { body: "a telescope secondary-mirror actuator", bench: "its axial mount" },
    { body: "a miniature autonomous submarine", bench: "a test tank" },
    { body: "a motorized diffraction-slit carriage", bench: "an optical rail" },
  ];
  const app = apparatuses[ctx.variantIndex % apparatuses.length];

  const presets = [
    { t1: 4, t2: 7, t3: 12, s0: 6, s1: 26, s2: 11 },
    { t1: 5, t2: 8, t3: 12, s0: 8, s1: 38, s2: 14 },
    { t1: 4, t2: 6, t3: 10, s0: 10, s1: 34, s2: 18 },
    { t1: 6, t2: 10, t3: 16, s0: 12, s1: 48, s2: 24 },
    { t1: 5, t2: 9, t3: 15, s0: 15, s1: 45, s2: 21 },
    { t1: 3, t2: 6, t3: 10, s0: 5, s1: 29, s2: 13 },
    { t1: 8, t2: 12, t3: 20, s0: 16, s1: 56, s2: 24 },
    { t1: 4, t2: 8, t3: 16, s0: 14, s1: 46, s2: 22 },
    { t1: 6, t2: 9, t3: 15, s0: 9, s1: 45, s2: 15 },
    { t1: 5, t2: 10, t3: 20, s0: 20, s1: 65, s2: 35 },
  ];
  const p = presets[ctx.variantIndex % presets.length];
  const bump = ctx.variantIndex >= 10 ? 4 : 0;
  const s0 = p.s0 + bump;
  const s1 = p.s1 + bump * 2;
  const s2 = p.s2 + bump;
  const { t1, t2, t3 } = p;

  const points: Point2D[] = [
    { x: 0, y: s0 },
    { x: t1, y: s1 },
    { x: t2, y: s1 },
    { x: t3, y: s2 },
  ];

  const vOut = cleanNum((s1 - s0) / t1);
  const vRet = cleanNum((s2 - s1) / (t3 - t2));
  const vAvg = cleanNum((s2 - s0) / t3);

  if (ctx.format === "mcq") {
    const mode = ctx.variantIndex % 3;
    const gradInterval: [number, number] =
      mode === 0 ? [0, t1] : mode === 1 ? [t2, t3] : [0, t3];
    const targetGrad = mode === 0 ? vOut : mode === 1 ? vRet : vAvg;

    const scenarioSpec = {
      kind: "piecewise-linear-graph",
      xLabel: "time",
      xUnit: "s",
      yLabel: "displacement",
      yUnit: "m",
      points,
      gradientInterval: gradInterval,
    };

    if (mode === 0) {
      const stems = [
        `The displacement–time graph shows ${app.body} moving on ${app.bench} from t = 0.0 s to t = ${fmtGiven(t3, "s")}. What is its velocity during the initial stage from t = 0.0 s to t = ${fmtGiven(t1, "s")}?`,
        `Position data for ${app.body} on ${app.bench} are plotted against time. Determine the instantaneous velocity during the outward stage between t = 0.0 s and t = ${fmtGiven(t1, "s")}.`,
        `Inspect the first segment (0.0 s to ${fmtGiven(t1, "s")}) of the displacement–time plot for ${app.body} on ${app.bench}. What constant velocity does it have in this interval?`,
      ];
      const stem = stems[Math.floor(ctx.variantIndex / 3) % stems.length];
      const options = buildMcqOptions(ctx.rng, targetGrad, "m s⁻¹", [
        {
          value: s1 / t1,
          rationale:
            "Divides s(t₁) by t₁ without subtracting the non-zero initial displacement s₀ at t = 0.",
        },
        {
          value: (s1 + s0) / t1,
          rationale:
            "Adds the initial and plateau displacements instead of taking their difference Δs.",
        },
        {
          value: t1 / (s1 - s0),
          rationale:
            "Computes the reciprocal Δt / Δs instead of the displacement–time gradient Δs / Δt.",
        },
        {
          value: 0.5 * (s0 + s1) * t1,
          rationale:
            "Calculates the area under the displacement–time segment rather than its gradient.",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["gradient"],
        targetQuantityKey: "gradient",
        questionPlan: makeMcqPlan(
          "Extract outward velocity from displacement-time gradient with nonzero initial displacement",
          [
            "secant-ratio-s-over-t-ignoring-initial-offset",
            "reciprocal-run-over-rise-inversion",
            "computing-st-area-instead-of-gradient",
          ],
          ["nonzero initial position", "piecewise constant velocity"],
        ),
        stem,
        options,
        workedSolution: `At t = 0.0 s, s₀ = ${s0} m; at t = ${t1} s, s₁ = ${s1} m. Velocity v = Δs / Δt = (${s1} − ${s0}) / ${t1} = ${fmt3(vOut, "m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Subtracts initial position s₀ = ${s0} m to obtain v = (${s1} − ${s0}) / ${t1} = ${fmt3(vOut, "m s⁻¹")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (mode === 1) {
      const stems = [
        `A sensor records the displacement–time graph of ${app.body} along ${app.bench}. What is its signed velocity during the return stage between t = ${fmtGiven(t2, "s")} and t = ${fmtGiven(t3, "s")}?`,
        `Between t = ${fmtGiven(t2, "s")} and t = ${fmtGiven(t3, "s")}, ${app.body} moves back toward the origin on ${app.bench} as plotted. Find its signed velocity in this stage.`,
        `From the final segment (${fmtGiven(t2, "s")} to ${fmtGiven(t3, "s")}) of the displacement–time graph for ${app.body} on ${app.bench}, calculate the velocity.`,
      ];
      const stem = stems[Math.floor(ctx.variantIndex / 3) % stems.length];
      const options = buildMcqOptions(ctx.rng, targetGrad, "m s⁻¹", [
        {
          value: Math.abs(targetGrad),
          rationale:
            "Evaluates speed |Δs / Δt| correctly but omits the negative sign indicating motion back toward the origin.",
        },
        {
          value: (s2 - s1) / t3,
          rationale:
            "Divides Δs by the final timestamp t₃ instead of the stage duration (t₃ − t₂).",
        },
        {
          value: s2 / (t3 - t2),
          rationale:
            "Reads only the final displacement s₂ and fails to subtract the plateau displacement s₁.",
        },
        {
          value: -(t3 - t2) / (s1 - s2),
          rationale:
            "Inverts Δt / Δs when calculating the slope of the return segment.",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["gradient"],
        targetQuantityKey: "gradient",
        questionPlan: makeMcqPlan(
          "Determine signed return velocity from negative-slope segment of a displacement-time graph",
          [
            "omitting-negative-sign-on-return-velocity",
            "dividing-by-endpoint-time-instead-of-interval",
            "omitting-plateau-displacement-subtraction",
          ],
          ["signed displacement axis"],
        ),
        stem,
        options,
        workedSolution: `From t = ${t2} s to t = ${t3} s, displacement changes from ${s1} m to ${s2} m. Velocity v = (${s2} − ${s1}) / (${t3} − ${t2}) = ${fmt3(vRet, "m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes (${s2} − ${s1}) / (${t3 - t2}) = ${fmt3(vRet, "m s⁻¹")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stems = [
      `Over a ${fmtGiven(t3, "s")} cycle on ${app.bench}, ${app.body} follows the piecewise displacement–time graph shown. What is its average velocity from t = 0.0 s to t = ${fmtGiven(t3, "s")}?`,
      `Using the complete ${fmtGiven(t3, "s")} displacement–time trace for ${app.body} on ${app.bench}, calculate the average velocity over the entire ${fmtGiven(t3, "s")} interval.`,
    ];
    const stem = stems[Math.floor(ctx.variantIndex / 3) % stems.length];
    const totalPathSpeed = ((s1 - s0) + (s1 - s2)) / t3;
    const options = buildMcqOptions(ctx.rng, targetGrad, "m s⁻¹", [
      {
        value: totalPathSpeed,
        rationale:
          "Sums outward and return path lengths to compute average speed rather than net average velocity.",
      },
      {
        value: s2 / t3,
        rationale:
          "Uses final coordinate s₂ / t₃ and forgets to subtract the non-zero starting coordinate s₀.",
      },
      {
        value: 0.5 * (vOut + vRet),
        rationale:
          "Takes the unweighted arithmetic mean of the two non-zero stage velocities, ignoring stage durations and the dwell plateau.",
      },
      {
        value: (s1 - s0) / t3,
        rationale:
          "Uses maximum displacement change (s₁ − s₀) instead of net displacement (s₂ − s₀).",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["gradient"],
      targetQuantityKey: "gradient",
      questionPlan: makeMcqPlan(
        "Compute overall average velocity across a multi-stage displacement-time graph",
        [
          "confusing-average-speed-with-average-velocity",
          "omitting-initial-displacement-subtraction",
          "unweighted-mean-of-stage-velocities",
        ],
        ["multi-stage rectilinear motion"],
      ),
      stem,
      options,
      workedSolution: `Initial displacement at t = 0.0 s is ${s0} m and final displacement at t = ${t3} s is ${s2} m. Average velocity = (${s2} − ${s0}) / ${t3} = ${fmt3(vAvg, "m s⁻¹")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates net displacement (${s2} − ${s0}) / ${t3} = ${fmt3(vAvg, "m s⁻¹")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const scenarioSpec = {
    kind: "piecewise-linear-graph",
    xLabel: "time",
    xUnit: "s",
    yLabel: "displacement",
    yUnit: "m",
    points,
    gradientInterval: [t2, t3],
  };

  const structStems = [
    `The displacement–time graph records the motion of ${app.body} along ${app.bench} from t = 0.0 s to t = ${fmtGiven(t3, "s")}, including a stationary dwell and a final return stage from t = ${fmtGiven(t2, "s")} to t = ${fmtGiven(t3, "s")}.`,
    `Position measurements of ${app.body} moving on ${app.bench} over a ${fmtGiven(t3, "s")} run are plotted on the displacement–time axes shown, with return travel occurring between t = ${fmtGiven(t2, "s")} and t = ${fmtGiven(t3, "s")}.`,
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: ["yMax", "gradient"],
    questionPlan: makeStructuredPlan(
      "Extract peak displacement and signed return-stage velocity from a piecewise displacement-time graph",
      [
        "read maximum displacement plateau from vertical axis",
        "compute signed gradient over the return interval",
      ],
      ["piecewise linear position trace"],
    ),
    stem: structStems[ctx.formatIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "State the maximum displacement of the object from the reference origin.",
        marks: 1,
        targetQuantityKey: "yMax",
        expectedAnswer: fmt3(s1, "m"),
        workingSteps: [
          `The plateau on the displacement–time graph reaches ${fmt3(s1, "m")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the signed velocity between t = ${fmtGiven(t2, "s")} and t = ${fmtGiven(t3, "s")}.`,
        marks: 3,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "gradient",
        expectedAnswer: fmt3(vRet, "m s⁻¹"),
        workingSteps: [
          `Velocity equals the gradient Δs / Δt of the s–t graph.`,
          `v = (${s2} − ${s1}) / (${t3} − ${t2}) = ${fmt3(vRet, "m s⁻¹")}.`,
        ],
      },
    ],
    workedSolution: `(a) Maximum displacement at the plateau = ${fmt3(s1, "m")}. (b) Return-stage velocity = (${s2} − ${s1}) / (${t3} − ${t2}) = ${fmt3(vRet, "m s⁻¹")}.`,
    markScheme: [
      {
        code: "A1",
        partId: "a",
        criterion: `Reads plateau displacement = ${fmt3(s1, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Uses gradient formula Δs / Δt = (${s2} − ${s1}) / (${t3} − ${t2}).`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Retains negative sign for motion back toward the origin.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${fmt3(vRet, "m s⁻¹")}.`,
        marks: 1,
      },
    ],
    totalMarks: 4,
  };
}

// ============================================================================
// Archetype 4: motion-graphs :: at-acceleration-velocity-change
// ============================================================================
function buildAccelerationTimeItem(
  ctx: ItemBuildContext,
): CandidateQuestionInput {
  const conceptId = "motion-graphs";
  const templateArchetype = "at-acceleration-velocity-change";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
  });

  const systems = [
    { name: "a mine hoist cage", dir: "upward" },
    { name: "a vertical-launch sounding sled", dir: "upward" },
    { name: "an electromagnetic catapult shuttle", dir: "forward" },
    { name: "a high-rise express lift", dir: "upward" },
    { name: "a linear-motor brake-test bogie", dir: "along the track" },
    { name: "a deep-sea winch capsule", dir: "upward" },
    { name: "a centrifuge carrier pod", dir: "tangentially forward" },
    { name: "a railgun armature test sled", dir: "downrange" },
    { name: "a drop-shaft recovery gondola", dir: "upward" },
    { name: "an aerotow winch launch carriage", dir: "forward" },
    { name: "a maglev propulsion test pod", dir: "eastward" },
  ];
  const sys = systems[(ctx.variantIndex * 3 + ctx.formatIndex) % systems.length];

  const presets = [
    { t1: 2, tPeak: 4, t3: 6, t4: 8, aPos: 6, aNeg: 4, u0: 5 },
    { t1: 3, tPeak: 6, t3: 8, t4: 10, aPos: 4, aNeg: 3, u0: 6 },
    { t1: 2, tPeak: 5, t3: 7, t4: 10, aPos: 8, aNeg: 4, u0: 4 },
    { t1: 4, tPeak: 6, t3: 9, t4: 12, aPos: 5, aNeg: 2, u0: 8 },
    { t1: 2, tPeak: 4, t3: 6, t4: 10, aPos: 10, aNeg: 3, u0: 7 },
    { t1: 3, tPeak: 5, t3: 8, t4: 10, aPos: 6, aNeg: 4, u0: 9 },
    { t1: 4, tPeak: 8, t3: 10, t4: 12, aPos: 4, aNeg: 5, u0: 12 },
    { t1: 2, tPeak: 6, t3: 8, t4: 12, aPos: 6, aNeg: 3, u0: 10 },
    { t1: 5, tPeak: 8, t3: 10, t4: 15, aPos: 8, aNeg: 4, u0: 11 },
    { t1: 3, tPeak: 6, t3: 9, t4: 12, aPos: 8, aNeg: 4, u0: 14 },
    { t1: 4, tPeak: 10, t3: 14, t4: 16, aPos: 5, aNeg: 3, u0: 9 },
    { t1: 6, tPeak: 10, t3: 15, t4: 20, aPos: 6, aNeg: 2, u0: 13 },
    { t1: 1, tPeak: 3, t3: 4, t4: 6, aPos: 12, aNeg: 6, u0: 5 },
  ];
  const p = presets[ctx.variantIndex % presets.length];
  const u0 = ctx.variantIndex >= 13 ? p.u0 + 4 : p.u0;
  const { t1, tPeak, t3, t4, aPos, aNeg } = p;

  const points: Point2D[] = [
    { x: 0, y: aPos },
    { x: t1, y: aPos },
    { x: tPeak, y: 0 },
    { x: t3, y: -aNeg },
    { x: t4, y: -aNeg },
  ];

  const posDv = t1 * aPos + 0.5 * (tPeak - t1) * aPos;
  const negDvMag = 0.5 * (t3 - tPeak) * aNeg + (t4 - t3) * aNeg;
  const signedArea = cleanNum(posDv - negDvMag);
  const maxSpeedMs = cleanNum(u0 + posDv);
  const finalSpeedMs = cleanNum(u0 + signedArea);

  if (ctx.format === "mcq") {
    const askPeak = ctx.formatIndex % 2 === 0;
    if (askPeak) {
      const scenarioSpec = {
        kind: "lift-acceleration",
        durationS: t4,
        initialSpeedMs: u0,
        peakTimeS: tPeak,
        points,
      };
      const stems = [
        `At t = 0.0 s, ${sys.name} is already moving ${sys.dir} at ${fmtGiven(u0, "m s⁻¹")}. Its signed acceleration over the next ${fmtGiven(t4, "s")} (${sys.dir} positive) is plotted. What maximum speed does it reach during the ${fmtGiven(t4, "s")} interval?`,
        `An accelerometer mounted on ${sys.name} records the ${fmtGiven(t4, "s")} profile shown, starting from an initial ${sys.dir} velocity of ${fmtGiven(u0, "m s⁻¹")}. Determine the greatest ${sys.dir} speed attained.`,
        `Moving ${sys.dir} at ${fmtGiven(u0, "m s⁻¹")} at t = 0.0 s, ${sys.name} experiences the acceleration–time history plotted over ${fmtGiven(t4, "s")}. Find its peak speed.`,
        `How fast is ${sys.name} travelling at its instant of greatest speed during the ${fmtGiven(t4, "s")} acceleration–time record shown, given an initial ${sys.dir} velocity of ${fmtGiven(u0, "m s⁻¹")}?`,
        `From the ${fmtGiven(t4, "s")} acceleration–time trace for ${sys.name} (initial ${sys.dir} speed ${fmtGiven(u0, "m s⁻¹")}), calculate the maximum speed reached before braking reduces its velocity.`,
        `A data logger captures ${fmtGiven(t4, "s")} of signed ${sys.dir} acceleration for ${sys.name}, which passes t = 0.0 s at ${fmtGiven(u0, "m s⁻¹")}. Evaluate the peak speed achieved.`,
        `Given that ${sys.name} has velocity ${fmtGiven(u0, "m s⁻¹")} ${sys.dir} when t = 0.0 s, use the ${fmtGiven(t4, "s")} acceleration–time plot to find its maximum speed.`,
      ];
      const stem = stems[Math.floor(ctx.formatIndex / 2) % stems.length];
      const options = buildMcqOptions(ctx.rng, maxSpeedMs, "m s⁻¹", [
        {
          value: posDv,
          rationale:
            "Integrates the positive acceleration area up to a = 0 correctly but omits the initial speed u₀.",
        },
        {
          value: finalSpeedMs,
          rationale:
            "Evaluates the speed at the end of the interval (t = t_end) rather than at the instant acceleration changes sign.",
        },
        {
          value: u0 + aPos * tPeak,
          rationale:
            "Treats the entire positive acceleration region as a rectangle of height a_max, ignoring the linear ramp down to zero.",
        },
        {
          value: u0 + posDv + negDvMag,
          rationale:
            "Adds the magnitude of the negative acceleration area instead of halting integration where a crosses zero.",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["maxSpeedMs", "peakTimeS"],
        targetQuantityKey: "maxSpeedMs",
        questionPlan: makeMcqPlan(
          "Determine peak speed by integrating positive acceleration up to zero-crossing and adding initial velocity",
          [
            "forgetting-nonzero-initial-velocity",
            "evaluating-terminal-speed-instead-of-peak-speed",
            "rectangular-area-overestimate-on-ramp",
          ],
          ["rectilinear motion", "peak speed occurs where acceleration changes sign"],
        ),
        stem,
        options,
        workedSolution: `Speed increases while a > 0 (from t = 0.0 s until a = 0 at t = ${tPeak} s). Positive area Δv_max = (${t1})(${aPos}) + ½(${tPeak - t1})(${aPos}) = ${fmt3(posDv, "m s⁻¹")}. Maximum speed = u₀ + Δv_max = ${u0} + ${fmt3(posDv)} = ${fmt3(maxSpeedMs, "m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Integrates positive acceleration up to t = ${tPeak} s (${fmt3(posDv, "m s⁻¹")}) and adds ${u0} m s⁻¹ to get ${fmt3(maxSpeedMs, "m s⁻¹")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const scenarioSpec = {
      kind: "piecewise-linear-graph",
      xLabel: "time",
      xUnit: "s",
      yLabel: "acceleration",
      yUnit: "m s⁻²",
      points,
      initialValue: u0,
    };
    const stems = [
      `Initially travelling ${sys.dir} at ${fmtGiven(u0, "m s⁻¹")}, ${sys.name} undergoes the signed acceleration–time profile shown for ${fmtGiven(t4, "s")}. What is its velocity at t = ${fmtGiven(t4, "s")}?`,
      `Telemetry shows the ${sys.dir} acceleration of ${sys.name} over ${fmtGiven(t4, "s")}. Given an initial ${sys.dir} velocity of ${fmtGiven(u0, "m s⁻¹")} at t = 0.0 s, calculate the velocity at t = ${fmtGiven(t4, "s")}.`,
      `After passing t = 0.0 s with ${sys.dir} speed ${fmtGiven(u0, "m s⁻¹")}, ${sys.name} experiences the ${fmtGiven(t4, "s")} acceleration curve plotted. Determine its final velocity at t = ${fmtGiven(t4, "s")}.`,
      `Use the signed ${fmtGiven(t4, "s")} acceleration–time graph to find the terminal ${sys.dir} velocity of ${sys.name}, which starts at ${fmtGiven(u0, "m s⁻¹")} when t = 0.0 s.`,
      `Over an interval of ${fmtGiven(t4, "s")}, ${sys.name} (initial velocity ${fmtGiven(u0, "m s⁻¹")} ${sys.dir}) follows the plotted acceleration profile. What velocity does it have when t = ${fmtGiven(t4, "s")}?`,
      `Calculate the ${sys.dir} velocity at t = ${fmtGiven(t4, "s")} for ${sys.name}, given u = ${fmtGiven(u0, "m s⁻¹")} at t = 0.0 s and the acceleration–time trace shown.`,
      `Sensors aboard ${sys.name} record the ${fmtGiven(t4, "s")} acceleration history shown from an initial ${sys.dir} speed of ${fmtGiven(u0, "m s⁻¹")}. Find its velocity at the end of the ${fmtGiven(t4, "s")} window.`,
    ];
    const stem = stems[Math.floor(ctx.formatIndex / 2) % stems.length];
    const options = buildMcqOptions(ctx.rng, finalSpeedMs, "m s⁻¹", [
      {
        value: signedArea,
        rationale:
          "Computes net velocity change Δv from the signed area but forgets to add the initial velocity u₀.",
      },
      {
        value: u0 + posDv + negDvMag,
        rationale:
          "Adds the unsigned deceleration area instead of subtracting the area below the time axis.",
      },
      {
        value: maxSpeedMs,
        rationale:
          "Stops integrating when acceleration reaches zero and ignores the subsequent negative-acceleration stage.",
      },
      {
        value: u0 - signedArea,
        rationale:
          "Subtracts net Δv from u₀ instead of adding the signed area.",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["finalCumulativeValue"],
      targetQuantityKey: "finalCumulativeValue",
      questionPlan: makeMcqPlan(
        "Compute terminal velocity from signed acceleration-time integral plus initial velocity",
        [
          "reporting-delta-v-without-initial-velocity",
          "adding-unsigned-areas-instead-of-signed-integral",
          "stopping-at-zero-acceleration-crossing",
        ],
        ["signed acceleration convention"],
      ),
      stem,
      options,
      workedSolution: `Positive a–t area (0 to ${tPeak} s) = ${fmt3(posDv, "m s⁻¹")}; negative area magnitude (${tPeak} s to ${t4} s) = ${fmt3(negDvMag, "m s⁻¹")}. Net Δv = ${fmt3(posDv)} − ${fmt3(negDvMag)} = ${fmt3(signedArea, "m s⁻¹")}. Final velocity = ${u0} + (${fmt3(signedArea)}) = ${fmt3(finalSpeedMs, "m s⁻¹")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Combines net signed area (${fmt3(signedArea, "m s⁻¹")}) with u₀ = ${u0} m s⁻¹ to obtain ${fmt3(finalSpeedMs, "m s⁻¹")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const scenarioSpec = {
    kind: "lift-acceleration",
    durationS: t4,
    initialSpeedMs: u0,
    peakTimeS: tPeak,
    points,
  };

  const structStems = [
    `At t = 0.0 s, ${sys.name} moves ${sys.dir} with an initial velocity of ${fmtGiven(u0, "m s⁻¹")}. The graph shows how its acceleration varies with time over ${fmtGiven(t4, "s")} (${sys.dir} positive).`,
    `An inertial sensor logs the acceleration of ${sys.name} over a ${fmtGiven(t4, "s")} interval (${sys.dir} positive). At t = 0.0 s its velocity is ${fmtGiven(u0, "m s⁻¹")} ${sys.dir}.`,
    `During a ${fmtGiven(t4, "s")} test run, ${sys.name} enters the instrumented section moving ${sys.dir} at ${fmtGiven(u0, "m s⁻¹")}. Its subsequent signed acceleration–time trace is shown.`,
    `Engineers monitor ${sys.name} for ${fmtGiven(t4, "s")} starting from an initial ${sys.dir} velocity of ${fmtGiven(u0, "m s⁻¹")} at t = 0.0 s, obtaining the piecewise acceleration–time graph below.`,
    `Passing a timing marker at t = 0.0 s with speed ${fmtGiven(u0, "m s⁻¹")} ${sys.dir}, ${sys.name} undergoes positive then negative ${sys.dir} acceleration over ${fmtGiven(t4, "s")} as plotted.`,
    `The signed ${sys.dir} acceleration of ${sys.name} is plotted from t = 0.0 s to t = ${fmtGiven(t4, "s")}; at the start of the recording, its velocity is ${fmtGiven(u0, "m s⁻¹")} ${sys.dir}.`,
    `A ${fmtGiven(t4, "s")} accelerometer log is shown for ${sys.name}, which is already travelling ${sys.dir} at ${fmtGiven(u0, "m s⁻¹")} when t = 0.0 s.`,
    `Starting with ${sys.dir} velocity ${fmtGiven(u0, "m s⁻¹")} at t = 0.0 s, ${sys.name} follows the ${fmtGiven(t4, "s")} acceleration–time profile displayed on the axes.`,
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: ["peakTimeS", "maxSpeedMs", "finalSpeedMs"],
    questionPlan: makeStructuredPlan(
      "Identify maximum-speed instant at acceleration sign change and integrate areas for peak and final velocities",
      [
        "locate zero-acceleration crossing where velocity transitions from increasing to decreasing",
        "integrate positive area plus initial velocity for maximum speed",
        "subtract negative-acceleration area for final velocity",
      ],
      ["initial upward or forward velocity given"],
    ),
    stem: structStems[ctx.formatIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: `State the time at which the ${sys.dir} speed is greatest.`,
        marks: 1,
        targetQuantityKey: "peakTimeS",
        expectedAnswer: fmt3(tPeak, "s"),
        workingSteps: [
          `Acceleration changes from positive to negative at t = ${fmt3(tPeak, "s")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate this maximum speed.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "maxSpeedMs",
        expectedAnswer: fmt3(maxSpeedMs, "m s⁻¹"),
        workingSteps: [
          `Δv_pos = (${t1})(${aPos}) + ½(${tPeak - t1})(${aPos}) = ${fmt3(posDv, "m s⁻¹")}.`,
          `v_max = ${u0} + ${fmt3(posDv)} = ${fmt3(maxSpeedMs, "m s⁻¹")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Calculate the velocity at t = ${fmtGiven(t4, "s")}.`,
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "finalSpeedMs",
        expectedAnswer: fmt3(finalSpeedMs, "m s⁻¹"),
        workingSteps: [
          `Magnitude of negative a–t area (${tPeak} s to ${t4} s) = ½(${t3 - tPeak})(${aNeg}) + (${t4 - t3})(${aNeg}) = ${fmt3(negDvMag, "m s⁻¹")}.`,
          `v_final = ${fmt3(maxSpeedMs)} − ${fmt3(negDvMag)} = ${fmt3(finalSpeedMs, "m s⁻¹")}.`,
        ],
      },
    ],
    workedSolution: `(a) Maximum speed occurs when acceleration crosses zero from positive to negative at t = ${fmt3(tPeak, "s")}. (b) Positive area = ${fmt3(posDv, "m s⁻¹")}, giving v_max = ${u0} + ${fmt3(posDv)} = ${fmt3(maxSpeedMs, "m s⁻¹")}. (c) Negative area magnitude = ${fmt3(negDvMag, "m s⁻¹")}, so v_final = ${fmt3(maxSpeedMs)} − ${fmt3(negDvMag)} = ${fmt3(finalSpeedMs, "m s⁻¹")}.`,
    markScheme: [
      {
        code: "A1",
        partId: "a",
        criterion: `States t = ${fmt3(tPeak, "s")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Evaluates positive area up to ${tPeak} s (${fmt3(posDv, "m s⁻¹")}) and adds u₀ = ${u0} m s⁻¹.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains v_max = ${fmt3(maxSpeedMs, "m s⁻¹")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Subtracts negative area (${fmt3(negDvMag, "m s⁻¹")}) from v_max.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains final velocity = ${fmt3(finalSpeedMs, "m s⁻¹")}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
  };
}

// ============================================================================
// Archetype 5: linear-momentum-impulse :: pt-momentum-gradient-kinetic-work
// ============================================================================
function buildMomentumTimeItem(
  ctx: ItemBuildContext,
): CandidateQuestionInput {
  const conceptId = "linear-momentum-impulse";
  const templateArchetype = "pt-momentum-gradient-kinetic-work";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
  });

  const bodies = [
    "an air-track glider",
    "a frictionless puck on an air table",
    "a magnetic rail cart",
    "a satellite attitude-test mass",
    "a superconducting levitation carrier",
    "a low-friction dynamics trolley",
    "an ice-rink calibration sled",
    "a linear air-bearing carriage",
  ];
  const body = bodies[ctx.variantIndex % bodies.length];

  const presets = [
    { massKg: 0.5, t1: 2, t2: 6, t3: 8, p1: 1.5, p2: 4.5 },
    { massKg: 0.8, t1: 2, t2: 5, t3: 8, p1: 1.6, p2: 6.4 },
    { massKg: 1.2, t1: 3, t2: 7, t3: 10, p1: 2.4, p2: 8.4 },
    { massKg: 1.5, t1: 2, t2: 6, t3: 10, p1: 3.0, p2: 9.0 },
    { massKg: 2.0, t1: 4, t2: 8, t3: 12, p1: 4.0, p2: 14.0 },
    { massKg: 0.4, t1: 1, t2: 5, t3: 6, p1: 0.8, p2: 3.6 },
    { massKg: 2.5, t1: 2, t2: 7, t3: 10, p1: 5.0, p2: 15.0 },
    { massKg: 1.6, t1: 3, t2: 8, t3: 12, p1: 3.2, p2: 11.2 },
    { massKg: 0.6, t1: 2, t2: 5, t3: 7, p1: 1.2, p2: 4.8 },
    { massKg: 3.0, t1: 4, t2: 10, t3: 14, p1: 6.0, p2: 18.0 },
  ];
  const pr = presets[ctx.variantIndex % presets.length];
  const factor = ctx.variantIndex >= 10 ? 2 : 1;
  const massKg = cleanNum(pr.massKg * factor);
  const p1 = cleanNum(pr.p1 * factor);
  const p2 = cleanNum(pr.p2 * factor);
  const { t1, t2, t3 } = pr;

  const points: Point2D[] = [
    { x: 0, y: p1 },
    { x: t1, y: p1 },
    { x: t2, y: p2 },
    { x: t3, y: p2 },
  ];

  const meanForceN = cleanNum((p2 - p1) / (t2 - t1));
  const workJ = cleanNum((p2 ** 2 - p1 ** 2) / (2 * massKg));

  const scenarioSpec = {
    kind: "glider-momentum",
    massKg,
    forceStartS: t1,
    forceEndS: t2,
    points,
  };

  if (ctx.format === "mcq") {
    const askWork = ctx.variantIndex % 2 === 0;
    if (askWork) {
      const stems = [
        `In a linear dynamics experiment, ${body} of mass ${fmtGiven(massKg, "kg")} moves in a straight line with momentum varying as shown. How much net work is done on it between t = ${fmtGiven(t1, "s")} and t = ${fmtGiven(t2, "s")}?`,
        `The momentum–time graph is recorded for ${body} (mass ${fmtGiven(massKg, "kg")}) travelling along a straight guide. Calculate the net work done on the object from t = ${fmtGiven(t1, "s")} to t = ${fmtGiven(t2, "s")}.`,
        `A thruster acts from t = ${fmtGiven(t1, "s")} to t = ${fmtGiven(t2, "s")} on ${body} of mass ${fmtGiven(massKg, "kg")}, producing the momentum–time trace shown. What kinetic energy gain (net work) occurs over this interval?`,
      ];
      const stem = stems[Math.floor(ctx.variantIndex / 2) % stems.length];
      const options = buildMcqOptions(ctx.rng, workJ, "J", [
        {
          value: (p2 - p1) ** 2 / (2 * massKg),
          rationale:
            "Evaluates (Δp)² / (2m) instead of the change in kinetic energy (p₂² − p₁²) / (2m).",
        },
        {
          value: (p2 ** 2 - p1 ** 2) / massKg,
          rationale:
            "Omits the factor of 2 in the denominator of E_k = p² / (2m).",
        },
        {
          value: p2 ** 2 / (2 * massKg),
          rationale:
            "Computes the final kinetic energy p₂² / (2m) without subtracting the initial kinetic energy p₁² / (2m).",
        },
        {
          value: 0.5 * (p1 + p2) * (t2 - t1),
          rationale:
            "Integrates the area under the momentum–time segment instead of computing Δ(p² / 2m).",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["workJ"],
        targetQuantityKey: "workJ",
        questionPlan: makeMcqPlan(
          "Determine net work done from a momentum-time graph via work-energy theorem",
          [
            "squaring-momentum-change-instead-of-difference-of-squares",
            "omitting-half-factor-in-kinetic-energy-formula",
            "reporting-final-kinetic-energy-without-subtracting-initial",
          ],
          ["constant mass particle", "work-energy theorem"],
        ),
        stem,
        options,
        workedSolution: `Using E_k = p² / (2m), net work W = ΔE_k = (${p2}² − ${p1}²) / (2 × ${massKg}) = ${fmt3(workJ, "J")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies W = (p₂² − p₁²) / (2m) = (${p2}² − ${p1}²) / (${2 * massKg}) = ${fmt3(workJ, "J")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stems = [
      `The graph displays the linear momentum of ${body} (mass ${fmtGiven(massKg, "kg")}) against time. What resultant force acts on it between t = ${fmtGiven(t1, "s")} and t = ${fmtGiven(t2, "s")}?`,
      `Motion sensors track the momentum of ${body} of mass ${fmtGiven(massKg, "kg")}. Determine the magnitude of the resultant force acting from t = ${fmtGiven(t1, "s")} to t = ${fmtGiven(t2, "s")}.`,
    ];
    const stem = stems[Math.floor(ctx.variantIndex / 2) % stems.length];
    const options = buildMcqOptions(ctx.rng, meanForceN, "N", [
      {
        value: p2 / t2,
        rationale:
          "Computes the secant ratio p₂ / t₂ from the origin, ignoring both initial momentum p₁ and start time t₁.",
      },
      {
        value: meanForceN / massKg,
        rationale:
          "Divides Δp / Δt by mass m, obtaining acceleration rather than resultant force.",
      },
      {
        value: (p2 - p1) * (t2 - t1),
        rationale:
          "Multiplies Δp by Δt instead of evaluating the rate of change of momentum Δp / Δt.",
      },
      {
        value: (p2 - p1) / t2,
        rationale:
          "Subtracts p₁ correctly in the numerator but divides by t₂ instead of (t₂ − t₁).",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["meanForceN"],
      targetQuantityKey: "meanForceN",
      questionPlan: makeMcqPlan(
        "Extract resultant force from gradient of linear momentum against time",
        [
          "secant-from-origin-ignoring-initial-momentum",
          "dividing-by-mass-to-get-acceleration",
          "multiplying-delta-p-by-delta-t",
        ],
        ["Newton second law as rate of change of momentum"],
      ),
      stem,
      options,
      workedSolution: `By Newton's second law, F = Δp / Δt = (${p2} − ${p1}) / (${t2} − ${t1}) = ${fmt3(meanForceN, "N")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates F = Δp / Δt = (${p2} − ${p1}) / (${t2 - t1}) = ${fmt3(meanForceN, "N")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const structStems = [
    `Along a horizontal guideway, ${body} of mass ${fmtGiven(massKg, "kg")} moves in a fixed direction. Its momentum–time graph shows an impulse stage from t = ${fmtGiven(t1, "s")} to t = ${fmtGiven(t2, "s")}.`,
    `Data loggers record the linear momentum of ${body} (mass ${fmtGiven(massKg, "kg")}), which experiences a constant resultant force between t = ${fmtGiven(t1, "s")} and t = ${fmtGiven(t2, "s")}.`,
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: ["meanForceN", "workJ"],
    questionPlan: makeStructuredPlan(
      "Determine resultant force from momentum-time slope and net work done via kinetic energy change",
      [
        "extract resultant force from momentum gradient over active interval",
        "apply kinetic energy relation in terms of momentum and mass for net work",
      ],
      ["particle of constant mass"],
    ),
    stem: structStems[ctx.formatIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: `Calculate the resultant force acting between t = ${fmtGiven(t1, "s")} and t = ${fmtGiven(t2, "s")}.`,
        marks: 2,
        targetQuantityKey: "meanForceN",
        expectedAnswer: fmt3(meanForceN, "N"),
        workingSteps: [
          `F = Δp / Δt = (${p2} − ${p1}) / (${t2} − ${t1}) = ${fmt3(meanForceN, "N")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the net work done on the ${fmtGiven(massKg, "kg")} object between t = ${fmtGiven(t1, "s")} and t = ${fmtGiven(t2, "s")}.`,
        marks: 3,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "workJ",
        expectedAnswer: fmt3(workJ, "J"),
        workingSteps: [
          `Use E_k = p² / (2m) before and after the force acts.`,
          `W = (${p2}² − ${p1}²) / (2 × ${massKg}) = ${fmt3(workJ, "J")}.`,
        ],
      },
    ],
    workedSolution: `(a) Resultant force F = Δp / Δt = (${p2} − ${p1}) / (${t2} − ${t1}) = ${fmt3(meanForceN, "N")}. (b) Net work W = ΔE_k = (${p2}² − ${p1}²) / (2 × ${massKg}) = ${fmt3(workJ, "J")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Identifies resultant force as gradient Δp / Δt of the p–t graph.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains F = ${fmt3(meanForceN, "N")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Relates net work to ΔE_k = (p₂² − p₁²) / (2m).",
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Substitutes p₁ = ${p1} kg m s⁻¹, p₂ = ${p2} kg m s⁻¹, and m = ${massKg} kg.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains W = ${fmt3(workJ, "J")}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
  };
}

// ============================================================================
// Archetype 6: linear-momentum-impulse :: ft-impulse-area-velocity-change
// ============================================================================
function buildForceTimeImpulseItem(
  ctx: ItemBuildContext,
): CandidateQuestionInput {
  const conceptId = "linear-momentum-impulse";
  const templateArchetype = "ft-impulse-area-velocity-change";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
  });

  const setups = [
    { obj: "a cold-gas attitude probe", action: "cold-gas thruster burn" },
    { obj: "a crash-barrier test sled", action: "hydraulic arrester pulse" },
    { obj: "a robotic soccer puck", action: "solenoid kicker stroke" },
    { obj: "a rail-mounted docking target", action: "spring buffer contact" },
    { obj: "a Hall-effect thruster test rig", action: "pulsed ion-beam firing" },
    { obj: "a ballistic pendulum carriage", action: "controlled gas-jet pulse" },
    { obj: "a linear-motor launch shuttle", action: "stator current pulse" },
    { obj: "a microgravity cargo pod", action: "docking vernier firing" },
  ];
  const st = setups[ctx.variantIndex % setups.length];

  const presets = [
    { massKg: 2.0, p0: 6.0, t1: 0.2, t2: 0.6, t3: 0.8, fPeak: 40 },
    { massKg: 2.5, p0: 10.0, t1: 0.2, t2: 0.8, t3: 1.0, fPeak: 50 },
    { massKg: 4.0, p0: 12.0, t1: 0.5, t2: 1.5, t3: 2.0, fPeak: 32 },
    { massKg: 1.5, p0: 4.5, t1: 0.4, t2: 1.2, t3: 1.6, fPeak: 30 },
    { massKg: 5.0, p0: 15.0, t1: 1.0, t2: 3.0, t3: 4.0, fPeak: 25 },
    { massKg: 0.8, p0: 2.4, t1: 0.1, t2: 0.4, t3: 0.5, fPeak: 32 },
    { massKg: 3.0, p0: 9.0, t1: 0.5, t2: 2.0, t3: 2.5, fPeak: 36 },
    { massKg: 1.2, p0: 3.6, t1: 0.2, t2: 0.6, t3: 1.0, fPeak: 30 },
    { massKg: 6.0, p0: 18.0, t1: 1.0, t2: 4.0, t3: 5.0, fPeak: 30 },
    { massKg: 2.0, p0: 8.0, t1: 0.4, t2: 1.4, t3: 2.0, fPeak: 25 },
  ];
  const pr = presets[ctx.variantIndex % presets.length];
  const fPeak = ctx.variantIndex >= 10 ? pr.fPeak + 10 : pr.fPeak;
  const { massKg, p0, t1, t2, t3 } = pr;

  const points: Point2D[] = [
    { x: 0, y: 0 },
    { x: t1, y: fPeak },
    { x: t2, y: fPeak },
    { x: t3, y: 0 },
  ];

  const signedArea = cleanNum(0.5 * (t3 + (t2 - t1)) * fPeak);
  const deltaV = cleanNum(signedArea / massKg);
  const finalP = cleanNum(p0 + signedArea);
  const meanForce = cleanNum(signedArea / t3);

  const scenarioSpec = {
    kind: "piecewise-linear-graph",
    xLabel: "time",
    xUnit: "s",
    yLabel: "resultant force",
    yUnit: "N",
    points,
    massKg,
    initialValue: p0,
  };

  if (ctx.format === "mcq") {
    const mode = ctx.variantIndex % 3;
    if (mode === 0) {
      const stems = [
        `Having initial forward momentum ${fmtGiven(p0, "kg m s⁻¹")}, ${st.obj} of mass ${fmtGiven(massKg, "kg")} experiences a collinear ${st.action} over ${fmtGiven(t3, "s")} as shown on the force–time graph. What is its change in speed Δv?`,
        `A ${st.action} acts for ${fmtGiven(t3, "s")} in the direction of motion of ${st.obj} (mass ${fmtGiven(massKg, "kg")}, initial momentum ${fmtGiven(p0, "kg m s⁻¹")}). Using the plotted force–time profile, determine Δv.`,
        `Refer to the force–time profile of a ${st.action} on ${st.obj} of mass ${fmtGiven(massKg, "kg")} (initial momentum ${fmtGiven(p0, "kg m s⁻¹")}). By how much does its speed increase over the ${fmtGiven(t3, "s")} pulse?`,
      ];
      const stem = stems[Math.floor(ctx.variantIndex / 3) % stems.length];
      const options = buildMcqOptions(ctx.rng, deltaV, "m s⁻¹", [
        {
          value: signedArea,
          rationale:
            "Evaluates the impulse ∫F dt in N s without dividing by the mass m to find Δv.",
        },
        {
          value: (fPeak * t3) / massKg,
          rationale:
            "Treats the trapezoidal force pulse as a rectangle F_peak × t_end before dividing by m.",
        },
        {
          value: finalP / massKg,
          rationale:
            "Calculates the final speed (p₀ + J) / m instead of the speed change Δv = J / m.",
        },
        {
          value: signedArea * massKg,
          rationale:
            "Multiplies impulse by mass instead of dividing impulse by mass.",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["deltaVelocityOrSpeedMs"],
        targetQuantityKey: "deltaVelocityOrSpeedMs",
        questionPlan: makeMcqPlan(
          "Integrate trapezoidal force-time impulse and divide by mass for velocity change",
          [
            "stopping-at-impulse-without-dividing-by-mass",
            "rectangular-force-pulse-overestimate",
            "reporting-final-velocity-instead-of-velocity-change",
          ],
          ["collinear force in direction of initial momentum"],
        ),
        stem,
        options,
        workedSolution: `Impulse J = area under F–t trapezium = ½(${t3} + ${cleanNum(t2 - t1)})(${fPeak}) = ${fmt3(signedArea, "N s")}. Speed increase Δv = J / m = ${fmt3(signedArea)} / ${massKg} = ${fmt3(deltaV, "m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes J = ${fmt3(signedArea, "N s")} and Δv = J / ${massKg} = ${fmt3(deltaV, "m s⁻¹")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (mode === 1) {
      const stems = [
        `Moving in a straight line with initial momentum ${fmtGiven(p0, "kg m s⁻¹")}, ${st.obj} (mass ${fmtGiven(massKg, "kg")}) undergoes the ${fmtGiven(t3, "s")} ${st.action} shown. What is its final momentum at t = ${fmtGiven(t3, "s")}?`,
        `Before a ${fmtGiven(t3, "s")} ${st.action}, ${st.obj} of mass ${fmtGiven(massKg, "kg")} has momentum ${fmtGiven(p0, "kg m s⁻¹")}. Using the force–time plot, find its momentum immediately after the pulse.`,
      ];
      const stem = stems[Math.floor(ctx.variantIndex / 3) % stems.length];
      const options = buildMcqOptions(ctx.rng, finalP, "kg m s⁻¹", [
        {
          value: signedArea,
          rationale:
            "Finds the impulse Δp from the F–t area but forgets to add the initial momentum p₀.",
        },
        {
          value: p0 + fPeak * t3,
          rationale:
            "Uses peak force times total duration for impulse rather than the trapezium area.",
        },
        {
          value: Math.abs(signedArea - p0),
          rationale:
            "Subtracts initial momentum from impulse instead of adding collinear forward impulse.",
        },
        {
          value: finalP / massKg,
          rationale:
            "Divides final momentum by mass to obtain final speed rather than final momentum.",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["finalCumulativeValue"],
        targetQuantityKey: "finalCumulativeValue",
        questionPlan: makeMcqPlan(
          "Combine force-time area impulse with nonzero initial momentum",
          [
            "omitting-initial-momentum-addition",
            "rectangular-impulse-overestimate",
            "dividing-final-momentum-by-mass",
          ],
          ["impulse-momentum theorem"],
        ),
        stem,
        options,
        workedSolution: `Impulse Δp = ½(${t3} + ${cleanNum(t2 - t1)})(${fPeak}) = ${fmt3(signedArea, "N s")}. Final momentum p_f = p₀ + Δp = ${p0} + ${fmt3(signedArea)} = ${fmt3(finalP, "kg m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Adds impulse (${fmt3(signedArea, "N s")}) to p₀ = ${p0} kg m s⁻¹ to obtain ${fmt3(finalP, "kg m s⁻¹")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stems = [
      `During a ${fmtGiven(t3, "s")} ${st.action}, ${st.obj} (mass ${fmtGiven(massKg, "kg")}, initial momentum ${fmtGiven(p0, "kg m s⁻¹")}) experiences the force–time profile shown. What is the time-averaged resultant force over the ${fmtGiven(t3, "s")} interval?`,
      `Calculate the mean resultant force exerted during the ${fmtGiven(t3, "s")} ${st.action} on ${st.obj} (mass ${fmtGiven(massKg, "kg")}, initial momentum ${fmtGiven(p0, "kg m s⁻¹")}) from the plotted F–t curve.`,
    ];
    const stem = stems[Math.floor(ctx.variantIndex / 3) % stems.length];
    const options = buildMcqOptions(ctx.rng, meanForce, "N", [
      {
        value: 0.5 * fPeak,
        rationale:
          "Assumes mean force is half the peak force, ignoring the flat plateau duration.",
      },
      {
        value: signedArea,
        rationale:
          "Reports total impulse ∫F dt without dividing by the pulse duration.",
      },
      {
        value: finalP / t3,
        rationale:
          "Divides final momentum p_f by duration instead of dividing impulse Δp by duration.",
      },
      {
        value: fPeak,
        rationale:
          "Confuses peak plateau force with the time-averaged force across the full pulse.",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["meanRate"],
      targetQuantityKey: "meanRate",
      questionPlan: makeMcqPlan(
        "Compute mean force over a variable pulse by dividing total impulse area by pulse duration",
        [
          "taking-half-peak-force-ignoring-plateau",
          "omitting-division-by-pulse-duration",
          "including-initial-momentum-in-impulse",
        ],
        ["time-averaged force definition"],
      ),
      stem,
      options,
      workedSolution: `Total impulse J = ½(${t3} + ${cleanNum(t2 - t1)})(${fPeak}) = ${fmt3(signedArea, "N s")}. Mean force F_mean = J / Δt = ${fmt3(signedArea)} / ${t3} = ${fmt3(meanForce, "N")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Divides impulse (${fmt3(signedArea, "N s")}) by ${t3} s to obtain ${fmt3(meanForce, "N")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const structStems = [
    `Travelling in a straight line with initial momentum ${fmtGiven(p0, "kg m s⁻¹")}, ${st.obj} of mass ${fmtGiven(massKg, "kg")} is acted upon by a collinear ${st.action} for ${fmtGiven(t3, "s")}, as shown on the force–time graph.`,
    `A force transducer logs a ${fmtGiven(t3, "s")} ${st.action} acting forward on ${st.obj} (mass ${fmtGiven(massKg, "kg")}), which had momentum ${fmtGiven(p0, "kg m s⁻¹")} at t = 0.0 s.`,
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: [
      "signedArea",
      "finalCumulativeValue",
      "deltaVelocityOrSpeedMs",
    ],
    questionPlan: makeStructuredPlan(
      "Evaluate impulse from F-t area, deduce final momentum from initial momentum, and compute velocity increase",
      [
        "integrate trapezoidal area under force-time curve for impulse",
        "add initial momentum to obtain final momentum",
        "divide impulse by mass for change in velocity",
      ],
      ["collinear impulse"],
    ),
    stem: structStems[ctx.formatIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: `Calculate the total impulse delivered over the ${fmtGiven(t3, "s")} pulse.`,
        marks: 2,
        targetQuantityKey: "signedArea",
        expectedAnswer: fmt3(signedArea, "N s"),
        workingSteps: [
          `Impulse equals the area under the force–time trapezium.`,
          `J = ½ × (${t3} + ${cleanNum(t2 - t1)}) × ${fPeak} = ${fmt3(signedArea, "N s")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Determine the final momentum at t = ${fmtGiven(t3, "s")}.`,
        marks: 1,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "finalCumulativeValue",
        expectedAnswer: fmt3(finalP, "kg m s⁻¹"),
        workingSteps: [
          `p_f = p₀ + J = ${p0} + ${fmt3(signedArea)} = ${fmt3(finalP, "kg m s⁻¹")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Calculate the increase in speed of the ${fmtGiven(massKg, "kg")} object.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "deltaVelocityOrSpeedMs",
        expectedAnswer: fmt3(deltaV, "m s⁻¹"),
        workingSteps: [
          `Δv = J / m = ${fmt3(signedArea)} / ${massKg} = ${fmt3(deltaV, "m s⁻¹")}.`,
        ],
      },
    ],
    workedSolution: `(a) Impulse J = ½(${t3} + ${cleanNum(t2 - t1)})(${fPeak}) = ${fmt3(signedArea, "N s")}. (b) Final momentum p_f = ${p0} + ${fmt3(signedArea)} = ${fmt3(finalP, "kg m s⁻¹")}. (c) Speed increase Δv = ${fmt3(signedArea)} / ${massKg} = ${fmt3(deltaV, "m s⁻¹")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Computes impulse from the trapezium area under the F–t curve.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains J = ${fmt3(signedArea, "N s")}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Adds ${p0} kg m s⁻¹ to obtain ${fmt3(finalP, "kg m s⁻¹")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Divides impulse from (a) by ${massKg} kg.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains Δv = ${fmt3(deltaV, "m s⁻¹")}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
  };
}

// ============================================================================
// Archetype 7: work-energy-power :: fx-variable-force-work-speed
// ============================================================================
function buildForceDisplacementWorkItem(
  ctx: ItemBuildContext,
): CandidateQuestionInput {
  const conceptId = "work-energy-power";
  const templateArchetype = "fx-variable-force-work-speed";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
  });

  const rigs = [
    "an instrumented crash-test carriage",
    "a pneumatic factory transfer cart",
    "a magnetic-launch coaster bogie",
    "a cable-towed hydroplane model",
    "a linear dynamo test sled",
    "a warehouse pallet shuttle",
    "a wind-propelled land-yacht rig",
    "an automated mining skip",
  ];
  const rig = rigs[ctx.variantIndex % rigs.length];

  const presets = [
    { massKg: 2.0, u0: 3.0, x1: 2, x2: 6, x3: 8, x4: 10, fPos: 12, fNeg: 4 },
    { massKg: 4.0, u0: 2.0, x1: 2, x2: 7, x3: 10, x4: 12, fPos: 16, fNeg: 4 },
    { massKg: 2.5, u0: 4.0, x1: 2, x2: 5, x3: 8, x4: 10, fPos: 15, fNeg: 5 },
    { massKg: 5.0, u0: 3.0, x1: 4, x2: 10, x3: 14, x4: 16, fPos: 20, fNeg: 5 },
    { massKg: 1.6, u0: 2.5, x1: 1, x2: 4, x3: 6, x4: 8, fPos: 12, fNeg: 4 },
    { massKg: 3.0, u0: 4.0, x1: 3, x2: 9, x3: 12, x4: 15, fPos: 18, fNeg: 6 },
    { massKg: 2.0, u0: 5.0, x1: 2, x2: 8, x3: 12, x4: 16, fPos: 10, fNeg: 2 },
    { massKg: 4.0, u0: 3.5, x1: 2, x2: 6, x3: 8, x4: 10, fPos: 24, fNeg: 8 },
    { massKg: 3.2, u0: 2.0, x1: 2, x2: 8, x3: 11, x4: 14, fPos: 16, fNeg: 4 },
    { massKg: 5.0, u0: 4.0, x1: 5, x2: 12, x3: 16, x4: 20, fPos: 24, fNeg: 6 },
  ];
  const pr = presets[ctx.variantIndex % presets.length];
  const u0 = ctx.variantIndex >= 10 ? pr.u0 + 2 : pr.u0;
  const { massKg, x1, x2, x3, x4, fPos, fNeg } = pr;

  const points: Point2D[] = [
    { x: 0, y: 0 },
    { x: x1, y: fPos },
    { x: x2, y: fPos },
    { x: x3, y: 0 },
    { x: x4, y: -fNeg },
  ];

  const posWork = 0.5 * (x3 + (x2 - x1)) * fPos;
  const negWorkMag = 0.5 * (x4 - x3) * fNeg;
  const signedArea = cleanNum(posWork - negWorkMag);
  const unsignedArea = cleanNum(posWork + negWorkMag);
  const finalSpeed = cleanNum(Math.sqrt(u0 ** 2 + (2 * signedArea) / massKg));
  const meanForce = cleanNum(signedArea / x4);

  const scenarioSpec = {
    kind: "piecewise-linear-graph",
    xLabel: "displacement",
    xUnit: "m",
    yLabel: "resultant force",
    yUnit: "N",
    points,
    massKg,
    initialValue: u0,
  };

  if (ctx.format === "mcq") {
    const askSpeed = ctx.variantIndex % 2 === 0;
    if (askSpeed) {
      const stems = [
        `Passing x = 0.0 m with speed ${fmtGiven(u0, "m s⁻¹")}, ${rig} of mass ${fmtGiven(massKg, "kg")} experiences the collinear resultant force plotted against displacement up to x = ${fmtGiven(x4, "m")}. What is its speed at x = ${fmtGiven(x4, "m")}?`,
        `A ${fmtGiven(massKg, "kg")} unit (${rig}) enters an instrumented zone at ${fmtGiven(u0, "m s⁻¹")}. From the resultant force–displacement graph over ${fmtGiven(x4, "m")}, calculate its exit speed at x = ${fmtGiven(x4, "m")}.`,
        `The resultant force in the direction of motion of ${rig} (mass ${fmtGiven(massKg, "kg")}, initial speed ${fmtGiven(u0, "m s⁻¹")}) is plotted over ${fmtGiven(x4, "m")}. Determine its speed at x = ${fmtGiven(x4, "m")}.`,
      ];
      const stem = stems[Math.floor(ctx.variantIndex / 2) % stems.length];
      const options = buildMcqOptions(ctx.rng, finalSpeed, "m s⁻¹", [
        {
          value: Math.sqrt((2 * signedArea) / massKg),
          rationale:
            "Equates ½mv² to net work W directly and omits the initial kinetic energy ½mu₀².",
        },
        {
          value: Math.sqrt(u0 ** 2 + (2 * unsignedArea) / massKg),
          rationale:
            "Adds the resistive negative-force area to work done instead of subtracting it.",
        },
        {
          value: u0 + Math.sqrt((2 * signedArea) / massKg),
          rationale:
            "Adds √(2W/m) linearly to u₀ rather than adding kinetic energies before taking the square root.",
        },
        {
          value: Math.sqrt(u0 ** 2 + signedArea / massKg),
          rationale:
            "Drops the factor of 2 when rearranging ½m(v² − u²) = W.",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["finalSpeedFromWorkMs"],
        targetQuantityKey: "finalSpeedFromWorkMs",
        questionPlan: makeMcqPlan(
          "Integrate signed F-x area for net work and apply work-energy theorem with nonzero initial speed",
          [
            "neglecting-initial-kinetic-energy-term",
            "adding-resistive-negative-work-area",
            "linear-addition-of-speeds-instead-of-energies",
          ],
          ["collinear motion", "work-energy theorem"],
        ),
        stem,
        options,
        workedSolution: `Positive work (0 to ${x3} m) = ½(${x3} + ${x2 - x1})(${fPos}) = ${fmt3(posWork, "J")}. Resistive work (${x3} m to ${x4} m) = −½(${x4 - x3})(${fNeg}) = −${fmt3(negWorkMag, "J")}. Net work W = ${fmt3(signedArea, "J")}. From ½mv² = ½mu₀² + W, v = √(${u0}² + 2 × ${fmt3(signedArea)} / ${massKg}) = ${fmt3(finalSpeed, "m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds net work W = ${fmt3(signedArea, "J")} and v = √(${u0}² + 2W/${massKg}) = ${fmt3(finalSpeed, "m s⁻¹")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stems = [
      `Moving forward from x = 0.0 m with initial speed ${fmtGiven(u0, "m s⁻¹")}, ${rig} (mass ${fmtGiven(massKg, "kg")}) is subjected to the resultant force–displacement profile shown up to x = ${fmtGiven(x4, "m")}. How much net work is done on it over the ${fmtGiven(x4, "m")} displacement?`,
      `Evaluate the net work done by the resultant force on ${rig} (mass ${fmtGiven(massKg, "kg")}, initial speed ${fmtGiven(u0, "m s⁻¹")}) between x = 0.0 m and x = ${fmtGiven(x4, "m")} using the graph.`,
    ];
    const stem = stems[Math.floor(ctx.variantIndex / 2) % stems.length];
    const options = buildMcqOptions(ctx.rng, signedArea, "J", [
      {
        value: unsignedArea,
        rationale:
          "Adds the area below the displacement axis instead of subtracting negative resistive work.",
      },
      {
        value: posWork,
        rationale:
          "Integrates only up to x = x₃ where F = 0 and ignores the braking region from x₃ to x₄.",
      },
      {
        value: signedArea + 0.5 * massKg * u0 ** 2,
        rationale:
          "Computes total final kinetic energy (½mu₀² + W) rather than the net work done W.",
      },
      {
        value: fPos * x3 - fNeg * (x4 - x3),
        rationale:
          "Omits the factors of one half on the triangular force ramps.",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["signedArea"],
      targetQuantityKey: "signedArea",
      questionPlan: makeMcqPlan(
        "Compute net work done across positive and negative regions of a force-displacement plot",
        [
          "unsigned-area-addition-of-resistive-stage",
          "ignoring-negative-force-tail",
          "confusing-final-kinetic-energy-with-work-done",
        ],
        ["signed force-displacement integration"],
      ),
      stem,
      options,
      workedSolution: `Forward work (0 to ${x3} m) = ${fmt3(posWork, "J")}; resistive work (${x3} m to ${x4} m) = −${fmt3(negWorkMag, "J")}. Net work = ${fmt3(posWork)} − ${fmt3(negWorkMag)} = ${fmt3(signedArea, "J")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Subtracts resistive triangle (${fmt3(negWorkMag, "J")}) from positive trapezium (${fmt3(posWork, "J")}) to get ${fmt3(signedArea, "J")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const structStems = [
    `At x = 0.0 m, ${rig} of mass ${fmtGiven(massKg, "kg")} moves in the positive x-direction at ${fmtGiven(u0, "m s⁻¹")}. The graph shows the resultant force acting along its line of motion from x = 0.0 m to x = ${fmtGiven(x4, "m")}.`,
    `Force-transducer and encoder data for ${rig} (mass ${fmtGiven(massKg, "kg")}, speed ${fmtGiven(u0, "m s⁻¹")} at x = 0.0 m) are plotted over a ${fmtGiven(x4, "m")} straight track.`,
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: ["signedArea", "finalSpeedFromWorkMs", "meanRate"],
    questionPlan: makeStructuredPlan(
      "Integrate signed F-x graph for net work, apply work-energy theorem for final speed, and determine spatially averaged force",
      [
        "evaluate signed area between force curve and displacement axis",
        "combine net work with initial kinetic energy to solve for final speed",
        "divide net work by total displacement for mean resultant force",
      ],
      ["work-energy theorem in rectilinear motion"],
    ),
    stem: structStems[ctx.formatIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: `Calculate the net work done on the ${fmtGiven(massKg, "kg")} object between x = 0.0 m and x = ${fmtGiven(x4, "m")}.`,
        marks: 2,
        targetQuantityKey: "signedArea",
        expectedAnswer: fmt3(signedArea, "J"),
        workingSteps: [
          `Positive area (0 to ${x3} m) = ½(${x3} + ${x2 - x1})(${fPos}) = ${fmt3(posWork, "J")}; negative area (${x3} m to ${x4} m) = −½(${x4 - x3})(${fNeg}) = −${fmt3(negWorkMag, "J")}.`,
          `Net work W = ${fmt3(posWork)} − ${fmt3(negWorkMag)} = ${fmt3(signedArea, "J")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate its speed at x = ${fmtGiven(x4, "m")}.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "finalSpeedFromWorkMs",
        expectedAnswer: fmt3(finalSpeed, "m s⁻¹"),
        workingSteps: [
          `½mv² = ½mu₀² + W => v = √(${u0}² + 2 × ${fmt3(signedArea)} / ${massKg}) = ${fmt3(finalSpeed, "m s⁻¹")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `State the mean resultant force over the ${fmtGiven(x4, "m")} displacement.`,
        marks: 1,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "meanRate",
        expectedAnswer: fmt3(meanForce, "N"),
        workingSteps: [
          `F_mean = W / Δx = ${fmt3(signedArea)} / ${x4} = ${fmt3(meanForce, "N")}.`,
        ],
      },
    ],
    workedSolution: `(a) Net work W = ${fmt3(posWork)} − ${fmt3(negWorkMag)} = ${fmt3(signedArea, "J")}. (b) v = √(${u0}² + 2(${fmt3(signedArea)})/${massKg}) = ${fmt3(finalSpeed, "m s⁻¹")}. (c) Mean force = ${fmt3(signedArea)} / ${x4} = ${fmt3(meanForce, "N")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Evaluates positive (${fmt3(posWork, "J")}) and negative (−${fmt3(negWorkMag, "J")}) areas.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains net work W = ${fmt3(signedArea, "J")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Uses ½mv² = ½(${massKg})(${u0}²) + W.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains v = ${fmt3(finalSpeed, "m s⁻¹")}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Divides net work by ${x4} m to get ${fmt3(meanForce, "N")}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
  };
}

// ============================================================================
// Archetype 8: radioactive-decay-half-life :: semilog-activity-decay-gradient
// Strictly IB HL, A-Level Y13, NCUK IFY-S2 (semi-log linearization boundary!)
// ============================================================================
function buildSemilogDecayItem(ctx: ItemBuildContext): CandidateQuestionInput {
  const conceptId = "radioactive-decay-half-life";
  const templateArchetype = "semilog-activity-decay-gradient";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
    preferredLevels: {
      ib: "HL",
      alevel: "Y13",
      ncuk: "IFY-S2",
    },
  });

  const isotopes = [
    { sample: "a medical technetium eluted phantom", detector: "a shielded NaI scintillation counter" },
    { sample: "a short-lived barium isomer source", detector: "a Geiger–Müller tube after background subtraction" },
    { sample: "an activated silver foil specimen", detector: "a beta-sensitive end-window detector" },
    { sample: "a radon progeny filter sample", detector: "a solid-state silicon alpha spectrometer" },
    { sample: "an indium neutron-activation disc", detector: "a calibrated gamma well counter" },
    { sample: "a positron-emitting fluorine tracer vial", detector: "a coincidence ring detector" },
    { sample: "a protactinium generator organic layer", detector: "a thin-mica Geiger counter" },
    { sample: "a gaseous krypton tracer cell", detector: "a proportional chamber" },
    { sample: "a copper radioisotope solution", detector: "a liquid-scintillation detector" },
    { sample: "an irradiated manganese pellet", detector: "a lead-collimated gamma probe" },
    { sample: "a gallium radiopharmaceutical ampoule", detector: "an ionization well chamber" },
  ];
  const iso = isotopes[(ctx.variantIndex * 3 + ctx.formatIndex) % isotopes.length];

  const presets = [
    { tMax: 40, lnA0: 8.0, lnAf: 3.0 },
    { tMax: 50, lnA0: 9.0, lnAf: 4.0 },
    { tMax: 80, lnA0: 7.6, lnAf: 2.8 },
    { tMax: 60, lnA0: 8.4, lnAf: 3.6 },
    { tMax: 100, lnA0: 9.5, lnAf: 3.5 },
    { tMax: 25, lnA0: 7.5, lnAf: 2.5 },
    { tMax: 50, lnA0: 8.5, lnAf: 2.5 },
    { tMax: 40, lnA0: 9.2, lnAf: 4.4 },
    { tMax: 80, lnA0: 8.8, lnAf: 2.4 },
    { tMax: 100, lnA0: 8.0, lnAf: 2.0 },
    { tMax: 20, lnA0: 7.8, lnAf: 3.4 },
    { tMax: 30, lnA0: 8.7, lnAf: 3.3 },
    { tMax: 120, lnA0: 9.6, lnAf: 2.4 },
  ];
  const pr = presets[ctx.variantIndex % presets.length];
  const bump = ctx.variantIndex >= 13 ? 0.6 : 0;
  const lnA0 = cleanNum(pr.lnA0 + bump);
  const lnAf = cleanNum(pr.lnAf + bump);
  const tMax = pr.tMax;
  const tMid = tMax / 2;
  const lnMid = cleanNum(0.5 * (lnA0 + lnAf));

  const points: Point2D[] = [
    { x: 0, y: lnA0 },
    { x: tMid, y: lnMid },
    { x: tMax, y: lnAf },
  ];

  const gradient = cleanNum((lnAf - lnA0) / tMax);

  const scenarioSpec = {
    kind: "piecewise-linear-graph",
    xLabel: "time",
    xUnit: "s",
    yLabel: "ln count rate",
    yUnit: "dimensionless",
    points,
  };

  if (ctx.format === "mcq") {
    const stems = [
      `Background-corrected count rates from ${iso.sample} are recorded with ${iso.detector} over ${fmtGiven(tMax, "s")}. The linearized graph plots ln(C / s⁻¹) against time t according to ln C = ln C₀ − λt. What is the gradient of this best-fit line?`,
      `To determine the decay constant λ of ${iso.sample}, a student logs corrected count rate C with ${iso.detector} and plots ln(C / s⁻¹) versus t up to ${fmtGiven(tMax, "s")}. Determine the signed gradient of the plotted line.`,
      `The semi-logarithmic plot shows ln(C / s⁻¹) against elapsed time t for ${iso.sample} monitored by ${iso.detector} for ${fmtGiven(tMax, "s")}. Calculate the gradient Δ(ln C) / Δt of the line.`,
      `Using ${iso.detector}, corrected activity data for ${iso.sample} are linearized by plotting ln(C / s⁻¹) against t over ${fmtGiven(tMax, "s")}. What value does the gradient of the line have?`,
      `Over an observation window of ${fmtGiven(tMax, "s")}, ${iso.detector} measures ${iso.sample}; the natural logarithm of corrected count rate ln(C / s⁻¹) is plotted versus time. Find the signed slope of the graph.`,
      `A nuclear physics experiment tracks ${iso.sample} via ${iso.detector} and fits a straight line to ln(C / s⁻¹) against t from 0.0 s to ${fmtGiven(tMax, "s")}. Evaluate the signed gradient of this line.`,
      `Inspect the linear decay plot of ln(C / s⁻¹) versus t (up to ${fmtGiven(tMax, "s")}) obtained from ${iso.sample} with ${iso.detector}. What is the signed gradient in s⁻¹?`,
      `How rapidly does ln(C / s⁻¹) change with time (i.e. signed gradient Δ(ln C)/Δt) on the ${fmtGiven(tMax, "s")} plot recorded for ${iso.sample} using ${iso.detector}?`,
    ];
    const stem = stems[ctx.formatIndex % stems.length];
    const options = buildMcqOptions(ctx.rng, gradient, "s⁻¹", [
      {
        value: Math.abs(gradient),
        rationale:
          "Computes λ = |Δ(ln C) / Δt| correctly in magnitude but omits the negative sign of the downward semi-log slope.",
      },
      {
        value: -lnA0 / tMax,
        rationale:
          "Assumes ln C drops to zero at t = t_max instead of subtracting the non-zero final ordinate ln C(t_max).",
      },
      {
        value: -tMax / (lnA0 - lnAf),
        rationale:
          "Inverts Δt / Δ(ln C) to obtain −1/λ (negative mean lifetime) instead of the gradient −λ.",
      },
      {
        value: -(lnA0 + lnAf) / tMax,
        rationale:
          "Adds the initial and final ln C ordinates instead of evaluating their difference.",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["gradient"],
      targetQuantityKey: "gradient",
      questionPlan: makeMcqPlan(
        "Determine signed negative gradient of a semi-logarithmic radioactive decay plot",
        [
          "omitting-negative-sign-of-decay-slope",
          "assuming-zero-final-ordinate-at-endpoint",
          "inverting-slope-to-mean-lifetime",
        ],
        ["background-corrected activity", "exponential decay law"],
      ),
      stem,
      options,
      workedSolution: `At t = 0.0 s, ln C₀ = ${lnA0}; at t = ${tMax} s, ln C = ${lnAf}. Gradient = (${lnAf} − ${lnA0}) / ${tMax} = ${fmt3(gradient, "s⁻¹")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates (${lnAf} − ${lnA0}) / ${tMax} = ${fmt3(gradient, "s⁻¹")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const structStems = [
    `Using ${iso.detector}, background-corrected count rates C from ${iso.sample} are measured over ${fmtGiven(tMax, "s")} and linearized by plotting ln(C / s⁻¹) against time t.`,
    `In a nuclear physics practical, ${iso.sample} is monitored with ${iso.detector}. The semi-logarithmic plot of ln(C / s⁻¹) versus time t over ${fmtGiven(tMax, "s")} is shown.`,
    `After subtracting ambient background radiation, readings C from ${iso.detector} facing ${iso.sample} are transformed to ln(C / s⁻¹) and plotted over ${fmtGiven(tMax, "s")}.`,
    `A laboratory team investigates exponential decay in ${iso.sample} using ${iso.detector}, obtaining the straight-line graph of ln(C / s⁻¹) against t up to ${fmtGiven(tMax, "s")}.`,
    `Over ${fmtGiven(tMax, "s")}, ${iso.detector} records the decay of ${iso.sample}; the resulting linearized trace of ln(C / s⁻¹) versus t is displayed.`,
    `To verify first-order decay kinetics for ${iso.sample}, corrected count rates from ${iso.detector} are graphed as ln(C / s⁻¹) versus time for ${fmtGiven(tMax, "s")}.`,
    `The straight-line semi-log graph below shows ln(C / s⁻¹) over ${fmtGiven(tMax, "s")} for ${iso.sample} placed in ${iso.detector}.`,
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: ["yMax", "gradient"],
    questionPlan: makeStructuredPlan(
      "Extract initial log-activity intercept and negative decay gradient from a semi-log plot",
      [
        "read vertical intercept corresponding to natural log of initial count rate",
        "evaluate signed gradient over the full time span",
      ],
      ["background count subtracted"],
    ),
    stem: structStems[ctx.formatIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "State the vertical-axis intercept ln(C₀ / s⁻¹) from the graph.",
        marks: 1,
        targetQuantityKey: "yMax",
        expectedAnswer: fmt3(lnA0),
        workingSteps: [
          `At t = 0.0 s, the line intersects the vertical axis at ${fmt3(lnA0)}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Determine the signed gradient of the graph over the ${fmtGiven(tMax, "s")} interval, stating its unit.`,
        marks: 3,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "gradient",
        expectedAnswer: fmt3(gradient, "s⁻¹"),
        workingSteps: [
          `Read final ordinate ln C = ${lnAf} at t = ${tMax} s.`,
          `Gradient = (${lnAf} − ${lnA0}) / (${tMax} − 0) = ${fmt3(gradient, "s⁻¹")}.`,
        ],
      },
    ],
    workedSolution: `(a) Vertical intercept at t = 0 is ln(C₀ / s⁻¹) = ${fmt3(lnA0)}. (b) Gradient = (${lnAf} − ${lnA0}) / ${tMax} = ${fmt3(gradient, "s⁻¹")} (which equals −λ).`,
    markScheme: [
      {
        code: "A1",
        partId: "a",
        criterion: `Reads vertical intercept = ${fmt3(lnA0)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Uses large triangle (${lnAf} − ${lnA0}) / ${tMax}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Includes negative sign and unit s⁻¹.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains gradient = ${fmt3(gradient, "s⁻¹")}.`,
        marks: 1,
      },
    ],
    totalMarks: 4,
  };
}

// ============================================================================
// Archetype 9: elasticity-young-modulus :: fx-hooke-spring-elastic-energy
// Compatible with IB (SL/HL), A-Level (Y12/Y13), NCUK (IFY-S1/IFY) — Hooke ONLY!
// ============================================================================
function buildHookeSpringItem(ctx: ItemBuildContext): CandidateQuestionInput {
  const conceptId = "elasticity-young-modulus";
  const templateArchetype = "fx-hooke-spring-elastic-energy";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
  });

  const mechanisms = [
    "a helical steel launcher spring",
    "a precision dynamometer coil spring",
    "an air-track bumper compression spring",
    "a laboratory catapult tension spring",
    "a seismometer suspension spring",
    "a docking-latch buffer spring",
    "a pinball plunger coil spring",
    "a linear valve return spring",
    "a beryllium-copper instrument spring",
    "a robotics compliant-joint spring",
    "an optical-mount preload spring",
  ];
  const mech = mechanisms[(ctx.variantIndex * 3 + ctx.formatIndex) % mechanisms.length];

  const presets = [
    { xMax: 0.4, fMax: 32, massKg: 0.2 },
    { xMax: 0.5, fMax: 40, massKg: 0.25 },
    { xMax: 0.8, fMax: 48, massKg: 0.4 },
    { xMax: 0.4, fMax: 60, massKg: 0.3 },
    { xMax: 0.5, fMax: 80, massKg: 0.5 },
    { xMax: 1.0, fMax: 50, massKg: 0.4 },
    { xMax: 0.8, fMax: 72, massKg: 0.6 },
    { xMax: 0.5, fMax: 30, massKg: 0.15 },
    { xMax: 0.4, fMax: 44, massKg: 0.22 },
    { xMax: 1.0, fMax: 90, massKg: 0.5 },
  ];
  const pr = presets[ctx.variantIndex % presets.length];
  const fMax = ctx.variantIndex >= 10 ? pr.fMax + 20 : pr.fMax;
  const { xMax, massKg } = pr;

  const points: Point2D[] = [
    { x: 0, y: 0 },
    { x: cleanNum(xMax / 2), y: cleanNum(fMax / 2) },
    { x: xMax, y: fMax },
  ];

  const kStiff = cleanNum(fMax / xMax);
  const energyJ = cleanNum(0.5 * fMax * xMax);
  const launchSpeed = cleanNum(Math.sqrt((2 * energyJ) / massKg));

  if (ctx.format === "mcq") {
    const mode = ctx.variantIndex % 3;
    if (mode === 0) {
      const scenarioSpec = {
        kind: "piecewise-linear-graph",
        xLabel: "extension",
        xUnit: "m",
        yLabel: "restoring force",
        yUnit: "N",
        points,
      };
      const stems = [
        `Within its Hookean limit, ${mech} produces the force–extension graph shown up to an extension of ${fmtGiven(xMax, "m")}. How much elastic potential energy is stored at x = ${fmtGiven(xMax, "m")}?`,
        `A tensile test on ${mech} yields the linear force–extension plot up to ${fmtGiven(xMax, "m")}. Calculate the elastic energy stored when extended by ${fmtGiven(xMax, "m")}.`,
        `Refer to the Hooke's-law force–extension line for ${mech}. What work is done in stretching it from x = 0.0 m to x = ${fmtGiven(xMax, "m")}?`,
      ];
      const stem = stems[Math.floor(ctx.variantIndex / 3) % stems.length];
      const options = buildMcqOptions(ctx.rng, energyJ, "J", [
        {
          value: fMax * xMax,
          rationale:
            "Multiplies peak force by maximum extension (F_max × x_max) and omits the triangular factor of ½.",
        },
        {
          value: kStiff,
          rationale:
            "Evaluates the gradient F / x (spring constant k) instead of the triangular area ½Fx.",
        },
        {
          value: 0.5 * fMax * xMax ** 2,
          rationale:
            "Mixes ½Fx and ½kx² into ½Fx² by squaring extension while still using F_max instead of k.",
        },
        {
          value: 0.25 * fMax * xMax,
          rationale:
            "Applies the factor of ½ twice when computing the area under the line through the origin.",
        },
        {
          value: 0.5 * kStiff ** 2 * xMax,
          rationale:
            "Squares the spring constant k instead of the extension x when applying E_p = ½kx².",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["signedArea"],
        targetQuantityKey: "signedArea",
        questionPlan: makeMcqPlan(
          "Determine elastic potential energy from triangular area under a Hooke force-extension graph",
          [
            "omitting-half-factor-in-triangle-area",
            "computing-stiffness-gradient-instead-of-area",
            "hybrid-formula-squaring-extension-with-force",
          ],
          ["linear Hookean behaviour"],
        ),
        stem,
        options,
        workedSolution: `Elastic potential energy equals the triangular area under the F–x line: E_p = ½ F x = ½(${fMax})(${xMax}) = ${fmt3(energyJ, "J")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes triangular area ½(${fMax})(${xMax}) = ${fmt3(energyJ, "J")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (mode === 1) {
      const scenarioSpec = {
        kind: "piecewise-linear-graph",
        xLabel: "extension",
        xUnit: "m",
        yLabel: "applied force",
        yUnit: "N",
        points,
      };
      const stems = [
        `Calibration data for ${mech} over extensions from 0.0 m to ${fmtGiven(xMax, "m")} are plotted on the force–extension axes. What is the spring constant k?`,
        `Determine the spring constant k of ${mech} from the linear force–extension graph recorded up to ${fmtGiven(xMax, "m")}.`,
        `Static weights stretch ${mech} up to ${fmtGiven(xMax, "m")} without exceeding its elastic limit, yielding the plotted line. Calculate its stiffness k.`,
        `How many newtons per metre (k) are required to extend ${mech} according to the Hookean graph spanning 0.0 m to ${fmtGiven(xMax, "m")}?`,
        `Inspect the straight-line applied force versus extension plot (up to ${fmtGiven(xMax, "m")}) for ${mech}. Evaluate the spring constant k.`,
      ];
      const stem = stems[ctx.formatIndex % stems.length];
      const options = buildMcqOptions(ctx.rng, kStiff, "N m⁻¹", [
        {
          value: energyJ,
          rationale:
            "Calculates the area under the graph (½Fx) rather than the gradient F / x.",
        },
        {
          value: xMax / fMax,
          rationale:
            "Inverts Δx / ΔF (mechanical compliance) instead of ΔF / Δx.",
        },
        {
          value: 0.5 * kStiff,
          rationale:
            "Inserts an erroneous factor of ½ when computing the gradient of the line.",
        },
        {
          value: fMax * xMax,
          rationale:
            "Multiplies force and extension instead of dividing force by extension.",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["gradient"],
        targetQuantityKey: "gradient",
        questionPlan: makeMcqPlan(
          "Extract spring stiffness constant from gradient of a linear force-extension plot",
          [
            "computing-area-instead-of-gradient",
            "reciprocal-extension-over-force",
            "inserting-half-factor-into-slope",
          ],
          ["obeys Hooke law"],
        ),
        stem,
        options,
        workedSolution: `Spring constant k = gradient ΔF / Δx = ${fMax} / ${xMax} = ${fmt3(kStiff, "N m⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates gradient k = ${fMax} / ${xMax} = ${fmt3(kStiff, "N m⁻¹")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const scenarioSpec = {
      kind: "piecewise-linear-graph",
      xLabel: "compression",
      xUnit: "m",
      yLabel: "force",
      yUnit: "N",
      points,
      massKg,
    };
    const stems = [
      `On a horizontal frictionless bench, ${mech} is compressed by ${fmtGiven(xMax, "m")} according to the force–compression graph shown and released from rest to propel a ${fmtGiven(massKg, "kg")} block. What launch speed does the block acquire?`,
      `A ${fmtGiven(massKg, "kg")} trolley rests against ${mech} compressed to ${fmtGiven(xMax, "m")}. Using the plotted force–compression line and neglecting friction, calculate the speed of the trolley upon separation.`,
      `Compressed from 0.0 m to ${fmtGiven(xMax, "m")} as graphed, ${mech} releases its stored elastic energy into a stationary ${fmtGiven(massKg, "kg")} glider on an air track. Find the glider's exit speed.`,
      `Neglecting resistive losses, how fast does a ${fmtGiven(massKg, "kg")} puck leave ${mech} when released from rest at ${fmtGiven(xMax, "m")} compression on the plotted curve?`,
      `Evaluate the horizontal separation speed imparted to a ${fmtGiven(massKg, "kg")} slider when ${mech} unloads from ${fmtGiven(xMax, "m")} compression along the linear graph shown.`,
    ];
    const stem = stems[ctx.formatIndex % stems.length];
    const options = buildMcqOptions(ctx.rng, launchSpeed, "m s⁻¹", [
      {
        value: Math.sqrt((2 * fMax * xMax) / massKg),
        rationale:
          "Uses rectangular area Fx instead of ½Fx for elastic energy, overestimating v by √2.",
      },
      {
        value: (2 * energyJ) / massKg,
        rationale:
          "Computes v² = 2E_p / m correctly but forgets to take the square root.",
      },
      {
        value: Math.sqrt(energyJ / massKg),
        rationale:
          "Drops the ½ in kinetic energy ½mv² while keeping ½Fx for elastic energy.",
      },
      {
        value: energyJ / massKg,
        rationale:
          "Divides stored elastic energy by mass without applying E_k = ½mv².",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["finalSpeedFromWorkMs"],
      targetQuantityKey: "finalSpeedFromWorkMs",
      questionPlan: makeMcqPlan(
        "Equate triangular F-x elastic strain energy to kinetic energy to determine launch speed",
        [
          "omitting-half-factor-on-elastic-energy",
          "forgetting-square-root-for-speed",
          "omitting-half-factor-on-kinetic-energy",
        ],
        ["frictionless horizontal release", "negligible spring mass"],
      ),
      stem,
      options,
      workedSolution: `Elastic energy stored E_p = ½(${fMax})(${xMax}) = ${fmt3(energyJ, "J")}. Equating ½mv² = E_p gives v = √(2 × ${fmt3(energyJ)} / ${massKg}) = ${fmt3(launchSpeed, "m s⁻¹")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Sets ½(${massKg})v² = ${fmt3(energyJ, "J")} to obtain v = ${fmt3(launchSpeed, "m s⁻¹")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const scenarioSpec = {
    kind: "piecewise-linear-graph",
    xLabel: "compression",
    xUnit: "m",
    yLabel: "force",
    yUnit: "N",
    points,
    massKg,
  };

  const structStems = [
    `The force–compression graph for ${mech} is recorded up to a maximum compression of ${fmtGiven(xMax, "m")}. The compressed spring is then released from rest on a smooth horizontal track to launch a ${fmtGiven(massKg, "kg")} glider.`,
    `In an energy-transfer investigation, ${mech} is compressed to ${fmtGiven(xMax, "m")} as shown on the force–compression graph and used to project a ${fmtGiven(massKg, "kg")} cart along a frictionless horizontal rail from rest.`,
    `A student calibrates ${mech} up to ${fmtGiven(xMax, "m")} compression (plotted below) before releasing it from rest against an unattached ${fmtGiven(massKg, "kg")} puck on a horizontal air table.`,
    `During a mechanics practical, ${mech} follows the linear force–compression trace up to ${fmtGiven(xMax, "m")} and subsequently accelerates a ${fmtGiven(massKg, "kg")} block from rest across a frictionless bench.`,
    `Static loading of ${mech} produces the force–compression line up to ${fmtGiven(xMax, "m")}. Held at ${fmtGiven(xMax, "m")} compression against a ${fmtGiven(massKg, "kg")} carriage on a smooth level guideway, it is then released.`,
    `Refer to the Hookean force–compression plot recorded to ${fmtGiven(xMax, "m")} for ${mech}, which launches a ${fmtGiven(massKg, "kg")} test mass horizontally without friction.`,
    `Calibration measurements up to ${fmtGiven(xMax, "m")} for ${mech} are graphed below; at full compression it propels a stationary ${fmtGiven(massKg, "kg")} slider along a level frictionless rail.`,
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: ["gradient", "signedArea", "finalSpeedFromWorkMs"],
    questionPlan: makeStructuredPlan(
      "Determine spring constant from slope, elastic energy from area, and horizontal launch speed of a known mass",
      [
        "extract spring stiffness from force-compression gradient",
        "evaluate triangular area for stored elastic energy",
        "apply conservation of mechanical energy for launch speed",
      ],
      ["smooth horizontal track", "ideal massless spring"],
    ),
    stem: structStems[ctx.formatIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "Determine the spring constant k from the graph.",
        marks: 2,
        targetQuantityKey: "gradient",
        expectedAnswer: fmt3(kStiff, "N m⁻¹"),
        workingSteps: [
          `k = ΔF / Δx = ${fMax} / ${xMax} = ${fmt3(kStiff, "N m⁻¹")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the elastic potential energy stored at a compression of ${fmtGiven(xMax, "m")}.`,
        marks: 2,
        targetQuantityKey: "signedArea",
        expectedAnswer: fmt3(energyJ, "J"),
        workingSteps: [
          `E_p = area under F–x line = ½ × ${fMax} × ${xMax} = ${fmt3(energyJ, "J")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Calculate the speed of the ${fmtGiven(massKg, "kg")} mass immediately after losing contact with the spring.`,
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "finalSpeedFromWorkMs",
        expectedAnswer: fmt3(launchSpeed, "m s⁻¹"),
        workingSteps: [
          `½mv² = E_p => v = √(2 × ${fmt3(energyJ)} / ${massKg}) = ${fmt3(launchSpeed, "m s⁻¹")}.`,
        ],
      },
    ],
    workedSolution: `(a) k = ${fMax} / ${xMax} = ${fmt3(kStiff, "N m⁻¹")}. (b) Elastic energy E_p = ½(${fMax})(${xMax}) = ${fmt3(energyJ, "J")}. (c) Launch speed v = √(2(${fmt3(energyJ)})/${massKg}) = ${fmt3(launchSpeed, "m s⁻¹")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Identifies k as the gradient ΔF / Δx.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains k = ${fmt3(kStiff, "N m⁻¹")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Uses triangular area ½Fx.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains E_p = ${fmt3(energyJ, "J")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Equates ½(${massKg})v² to stored elastic energy from (b).`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains v = ${fmt3(launchSpeed, "m s⁻¹")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

// ============================================================================
// Archetype 10: elasticity-young-modulus :: stress-strain-young-modulus-curve
// STRICTLY UK A-Level (Y12/Y13) + NCUK (IFY-S1/IFY) ONLY — NEVER IB 2025!
// ============================================================================
function buildStressStrainItem(ctx: ItemBuildContext): CandidateQuestionInput {
  const conceptId = "elasticity-young-modulus";
  const templateArchetype = "stress-strain-young-modulus-curve";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
    allowedSyllabi: ["alevel", "ncuk"],
  });

  const specimens = [
    "a high-density polyethylene filament",
    "a synthetic polyurethane tendon cord",
    "a drawn nylon monofilament",
    "a cross-linked elastomer strip",
    "a bio-derived collagen fibre bundle",
    "a braided aramid-polymer composite tape",
    "a polypropylene surgical suture",
    "a vulcanized neoprene damper rod",
    "an extruded fluoropolymer ribbon",
    "a thermoplastic elastomer tether",
    "a regenerated silk-fibroin strand",
  ];
  const specName = specimens[(ctx.variantIndex * 3 + ctx.formatIndex) % specimens.length];

  // Bilinear elastic + post-limit-of-proportionality curve on clean strain domain >= 0.4
  const presets = [
    { eLin: 0.2, eMax: 0.4, sLin: 120, sMax: 180 },
    { eLin: 0.2, eMax: 0.5, sLin: 160, sMax: 250 },
    { eLin: 0.25, eMax: 0.5, sLin: 150, sMax: 220 },
    { eLin: 0.4, eMax: 0.8, sLin: 200, sMax: 280 },
    { eLin: 0.3, eMax: 0.6, sLin: 180, sMax: 240 },
    { eLin: 0.2, eMax: 0.4, sLin: 90, sMax: 140 },
    { eLin: 0.25, eMax: 0.5, sLin: 200, sMax: 300 },
    { eLin: 0.4, eMax: 0.8, sLin: 140, sMax: 200 },
    { eLin: 0.5, eMax: 1.0, sLin: 250, sMax: 350 },
    { eLin: 0.3, eMax: 0.6, sLin: 150, sMax: 210 },
  ];
  const pr = presets[ctx.variantIndex % presets.length];
  const sLin = ctx.variantIndex >= 10 ? pr.sLin + 30 : pr.sLin;
  const sMax = ctx.variantIndex >= 10 ? pr.sMax + 40 : pr.sMax;
  const { eLin, eMax } = pr;

  const points: Point2D[] = [
    { x: 0, y: 0 },
    { x: eLin, y: sLin },
    { x: eMax, y: sMax },
  ];

  const youngModulusMPa = cleanNum(sLin / eLin);
  const energyDensityMJm3 = cleanNum(
    0.5 * eLin * sLin + 0.5 * (sLin + sMax) * (eMax - eLin),
  );

  const scenarioSpec = {
    kind: "piecewise-linear-graph",
    xLabel: "tensile strain",
    xUnit: "m m⁻¹",
    yLabel: "tensile stress",
    yUnit: "MPa",
    points,
    gradientInterval: [0, eLin],
  };

  if (ctx.format === "mcq") {
    const askModulus = ctx.variantIndex % 2 === 0;
    if (askModulus) {
      const stems = [
        `In a tensile materials test, ${specName} obeys Hooke's law up to a strain of ${fmtGiven(eLin)} before softening up to strain ${fmtGiven(eMax)}, as shown on the stress–strain graph. What is the Young's modulus of the material in the initial linear region?`,
        `The tensile stress–strain curve for ${specName} is linear from 0.0 to strain ${fmtGiven(eLin)} and reaches strain ${fmtGiven(eMax)}. Determine the Young's modulus in MPa.`,
        `Refer to the tensile stress–strain plot for ${specName}, whose limit of proportionality lies at strain ${fmtGiven(eLin)}. Calculate its initial Young's modulus.`,
      ];
      const stem = stems[Math.floor(ctx.variantIndex / 2) % stems.length];
      const options = buildMcqOptions(ctx.rng, youngModulusMPa, "MPa", [
        {
          value: sMax / eMax,
          rationale:
            "Evaluates the secant ratio σ_max / ε_max beyond the limit of proportionality rather than the initial linear gradient.",
        },
        {
          value: (sMax - sLin) / (eMax - eLin),
          rationale:
            "Calculates the post-yield tangent slope instead of the initial elastic Young's modulus.",
        },
        {
          value: energyDensityMJm3,
          rationale:
            "Computes the area under the stress–strain graph instead of its elastic gradient.",
        },
        {
          value: eLin / sLin,
          rationale:
            "Inverts ε / σ instead of dividing tensile stress by tensile strain.",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["gradient"],
        targetQuantityKey: "gradient",
        questionPlan: makeMcqPlan(
          "Extract Young modulus from initial proportional gradient of a tensile stress-strain curve",
          [
            "secant-ratio-past-limit-of-proportionality",
            "post-yield-segment-slope",
            "integrating-area-instead-of-slope",
          ],
          ["Hookean behaviour up to limit of proportionality"],
        ),
        stem,
        options,
        workedSolution: `Up to the limit of proportionality at ε = ${eLin}, stress reaches ${sLin} MPa. Young's modulus E = σ / ε = ${sLin} / ${eLin} = ${fmt3(youngModulusMPa, "MPa")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates initial linear gradient E = ${sLin} / ${eLin} = ${fmt3(youngModulusMPa, "MPa")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stems = [
      `The stress–strain graph shows ${specName} stretched reversibly through two piecewise-linear stages up to strain ${fmtGiven(eMax)} (kink at strain ${fmtGiven(eLin)}). What work is done per unit volume in stretching the specimen to strain ${fmtGiven(eMax)}?`,
      `Determine the strain energy stored per unit volume (in MJ m⁻³) when ${specName} is loaded from zero strain to ${fmtGiven(eMax)} along the plotted stress–strain curve (proportional limit at ${fmtGiven(eLin)}).`,
    ];
    const stem = stems[Math.floor(ctx.variantIndex / 2) % stems.length];
    const options = buildMcqOptions(ctx.rng, energyDensityMJm3, "MJ m⁻³", [
      {
        value: 0.5 * sMax * eMax,
        rationale:
          "Approximates the entire bilinear curve as a single triangle from (0, 0) to (ε_max, σ_max).",
      },
      {
        value: sMax * eMax,
        rationale:
          "Multiplies peak stress by maximum strain without integrating the piecewise area.",
      },
      {
        value: 0.5 * eLin * sLin,
        rationale:
          "Integrates only up to the limit of proportionality at ε₁ and omits the trapezium from ε₁ to ε_max.",
      },
      {
        value: youngModulusMPa,
        rationale:
          "Calculates the Young's modulus gradient instead of the area under the stress–strain curve.",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["signedArea"],
      targetQuantityKey: "signedArea",
      questionPlan: makeMcqPlan(
        "Compute work done per unit volume from area under a bilinear stress-strain curve",
        [
          "single-triangle-secant-area-approximation",
          "peak-stress-times-peak-strain-rectangle",
          "truncating-area-at-proportional-limit",
        ],
        ["reversible loading curve", "megapascal strain product equals megajoule per cubic metre"],
      ),
      stem,
      options,
      workedSolution: `Work per unit volume equals area under the σ–ε graph (1 MPa × 1 = 1 MJ m⁻³): u = ½(${eLin})(${sLin}) + ½(${sLin} + ${sMax})(${cleanNum(eMax - eLin)}) = ${fmt3(energyDensityMJm3, "MJ m⁻³")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Sums triangle and trapezium areas under σ–ε curve to obtain ${fmt3(energyDensityMJm3, "MJ m⁻³")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const structStems = [
    `A tensile testing machine stretches ${specName} up to a strain of ${fmtGiven(eMax)}, producing the stress–strain curve shown. The limit of proportionality occurs at strain ${fmtGiven(eLin)}.`,
    `Stress–strain data for ${specName} are plotted up to strain ${fmtGiven(eMax)}, showing an initial Hookean region from 0.0 to strain ${fmtGiven(eLin)} followed by reduced stiffness.`,
    `In a materials laboratory, uniaxial tension applied to ${specName} yields the bilinear stress–strain trace to strain ${fmtGiven(eMax)}, with proportional behaviour ending at ${fmtGiven(eLin)}.`,
    `Extensometer and load-cell readings for ${specName} are converted to tensile stress and strain up to ${fmtGiven(eMax)} (proportional limit ${fmtGiven(eLin)}) as graphed.`,
    `During mechanical characterization of ${specName}, the specimen follows a straight Hookean slope up to strain ${fmtGiven(eLin)} and continues reversibly to strain ${fmtGiven(eMax)}.`,
    `The plotted tensile stress–strain profile for ${specName} exhibits a distinct gradient change at the limit of proportionality (strain ${fmtGiven(eLin)}) before reaching strain ${fmtGiven(eMax)}.`,
    `Engineers test ${specName} under axial tension up to strain ${fmtGiven(eMax)}, recording an initial linear elastic regime between zero strain and ${fmtGiven(eLin)}.`,
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: ["gradient", "signedArea"],
    questionPlan: makeStructuredPlan(
      "Extract initial Young modulus from proportional slope and total strain energy density from bilinear stress-strain area",
      [
        "calculate Young modulus from linear gradient up to proportional limit",
        "integrate triangle plus trapezium under stress-strain curve for energy per unit volume",
      ],
      ["elastic deformation"],
    ),
    stem: structStems[ctx.formatIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: `Determine the Young's modulus of the specimen over the proportional region (0.0 to ${fmtGiven(eLin)}).`,
        marks: 2,
        targetQuantityKey: "gradient",
        expectedAnswer: fmt3(youngModulusMPa, "MPa"),
        workingSteps: [
          `Read σ = ${sLin} MPa at ε = ${eLin}.`,
          `E = σ / ε = ${sLin} / ${eLin} = ${fmt3(youngModulusMPa, "MPa")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the work done per unit volume in stretching the specimen from zero strain to ${fmtGiven(eMax)}.`,
        marks: 3,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "signedArea",
        expectedAnswer: fmt3(energyDensityMJm3, "MJ m⁻³"),
        workingSteps: [
          `Area from 0 to ${eLin} = ½(${eLin})(${sLin}) = ${fmt3(0.5 * eLin * sLin)} MJ m⁻³.`,
          `Area from ${eLin} to ${eMax} = ½(${sLin} + ${sMax})(${cleanNum(eMax - eLin)}) = ${fmt3(0.5 * (sLin + sMax) * (eMax - eLin))} MJ m⁻³; total = ${fmt3(energyDensityMJm3, "MJ m⁻³")}.`,
        ],
      },
    ],
    workedSolution: `(a) Young's modulus E = ${sLin} / ${eLin} = ${fmt3(youngModulusMPa, "MPa")}. (b) Energy per unit volume = ½(${eLin})(${sLin}) + ½(${sLin} + ${sMax})(${cleanNum(eMax - eLin)}) = ${fmt3(energyDensityMJm3, "MJ m⁻³")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Evaluates initial gradient σ / ε up to ε = ${eLin}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains E = ${fmt3(youngModulusMPa, "MPa")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Identifies work per unit volume as total area under the σ–ε graph.",
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Splits area into initial triangle plus upper trapezium.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${fmt3(energyDensityMJm3, "MJ m⁻³")}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
  };
}

// ============================================================================
// Archetype 11: ohms-law-iv-characteristics :: vi-nonohmic-static-resistance
// Static R = V/I at operating point vs chord/tangent slope ΔV/ΔI trap!
// ============================================================================
function buildNonOhmicCharacteristicItem(
  ctx: ItemBuildContext,
): CandidateQuestionInput {
  const conceptId = "ohms-law-iv-characteristics";
  const templateArchetype = "vi-nonohmic-static-resistance";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
  });

  const devices = [
    { name: "a tungsten filament indicator lamp", kind: "filament" },
    { name: "a halogen projection bulb", kind: "filament" },
    { name: "an NTC metal-oxide thermistor bead", kind: "thermistor" },
    { name: "a miniature incandescent beacon lamp", kind: "filament" },
    { name: "an NTC ceramic temperature-sensing disc", kind: "thermistor" },
    { name: "a vacuum-tube heater filament", kind: "filament" },
    { name: "a silicon-carbide varistor element", kind: "thermistor" },
    { name: "a quartz-halogen calibration lamp", kind: "filament" },
    { name: "a carbon-filament heritage bulb", kind: "thermistor" },
    { name: "a miniature krypton torch lamp", kind: "filament" },
    { name: "a sintered metal-oxide surge element", kind: "thermistor" },
    { name: "an automotive dashboard filament bulb", kind: "filament" },
    { name: "a platinum-wire hot-wire anemometer element", kind: "filament" },
  ];
  const dev = devices[(ctx.variantIndex * 3 + ctx.formatIndex) % devices.length];

  const presets = [
    { i1: 0.4, i2: 0.8, i3: 1.2, v1: 1.2, v2: 3.6, v3: 8.4 },
    { i1: 0.5, i2: 1.0, i3: 1.5, v1: 1.5, v2: 4.5, v3: 10.5 },
    { i1: 0.4, i2: 0.8, i3: 1.6, v1: 4.8, v2: 7.2, v3: 9.6 },
    { i1: 0.2, i2: 0.6, i3: 1.0, v1: 1.0, v2: 4.2, v3: 9.0 },
    { i1: 0.5, i2: 1.0, i3: 2.0, v1: 5.0, v2: 8.0, v3: 11.0 },
    { i1: 0.3, i2: 0.6, i3: 1.2, v1: 0.9, v2: 2.7, v3: 8.4 },
    { i1: 0.4, i2: 1.0, i3: 2.0, v1: 4.0, v2: 7.0, v3: 10.0 },
    { i1: 0.5, i2: 1.0, i3: 2.0, v1: 2.0, v2: 6.0, v3: 16.0 },
    { i1: 0.2, i2: 0.4, i3: 0.8, v1: 0.8, v2: 2.4, v3: 6.4 },
    { i1: 0.6, i2: 1.2, i3: 2.4, v1: 6.0, v2: 9.6, v3: 14.4 },
    { i1: 0.8, i2: 1.6, i3: 2.5, v1: 2.4, v2: 7.2, v3: 15.0 },
    { i1: 1.0, i2: 2.0, i3: 4.0, v1: 6.0, v2: 10.0, v3: 14.0 },
    { i1: 0.25, i2: 0.5, i3: 1.0, v1: 0.75, v2: 2.25, v3: 6.5 },
  ];
  const pr = presets[ctx.variantIndex % presets.length];
  const mult = ctx.variantIndex >= 13 ? 1.5 : 1;
  const v1 = cleanNum(pr.v1 * mult);
  const v2 = cleanNum(pr.v2 * mult);
  const v3 = cleanNum(pr.v3 * mult);
  const { i1, i2, i3 } = pr;

  const points: Point2D[] = [
    { x: 0, y: 0 },
    { x: i1, y: v1 },
    { x: i2, y: v2 },
    { x: i3, y: v3 },
  ];

  // gradientInterval [0, i3] computes (v3 - 0)/(i3 - 0) = V/I static resistance!
  const staticR = cleanNum(v3 / i3);
  const chordSlope = cleanNum((v3 - v2) / (i3 - i2));
  const initialR = cleanNum(v1 / i1);

  const scenarioSpec = {
    kind: "piecewise-linear-graph",
    xLabel: "current",
    xUnit: "A",
    yLabel: "potential difference",
    yUnit: "V",
    points,
    gradientInterval: [0, i3],
  };

  if (ctx.format === "mcq") {
    const stems = [
      `The potential difference–current characteristic for ${dev.name} is plotted up to I = ${fmtGiven(i3, "A")}. What is the electrical resistance of the component when the current through it is ${fmtGiven(i3, "A")}?`,
      `Using the plotted V–I characteristic of ${dev.name}, calculate its static resistance R at an operating current of ${fmtGiven(i3, "A")}.`,
      `A student measures the V–I curve shown for ${dev.name}. Determine the resistance of the device at I = ${fmtGiven(i3, "A")}.`,
      `Refer to the non-linear V–I characteristic of ${dev.name}. What value does its resistance take when carrying a steady current of ${fmtGiven(i3, "A")}?`,
      `In a DC bench test, ${dev.name} exhibits the V–I graph shown up to ${fmtGiven(i3, "A")}. Evaluate its electrical resistance R = V / I when I = ${fmtGiven(i3, "A")}.`,
      `How many ohms of static resistance does ${dev.name} present when driven at a direct current of ${fmtGiven(i3, "A")} according to the V–I curve?`,
      `At the upper plotted current I = ${fmtGiven(i3, "A")}, find the resistance of ${dev.name} from its potential difference–current characteristic.`,
      `Voltmeter and ammeter readings for ${dev.name} yield the non-ohmic curve shown. Calculate the resistance of the component at ${fmtGiven(i3, "A")}.`,
      `When ${dev.name} carries ${fmtGiven(i3, "A")}, what electrical resistance is indicated by the potential difference–current plot?`,
    ];
    const stem = stems[ctx.formatIndex % stems.length];
    const options = buildMcqOptions(ctx.rng, staticR, "Ω", [
      {
        value: chordSlope,
        rationale:
          "Calculates the local segment gradient ΔV / ΔI instead of the static ratio V / I defining electrical resistance.",
      },
      {
        value: i3 / v3,
        rationale:
          "Inverts the ratio to I / V (conductance in S) rather than V / I.",
      },
      {
        value: initialR,
        rationale:
          "Evaluates the low-current resistance near the origin rather than at the specified operating current.",
      },
      {
        value: v3 * i3,
        rationale:
          "Multiplies V by I (electrical power dissipated in W) instead of dividing V by I.",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["gradient"],
      targetQuantityKey: "gradient",
      questionPlan: makeMcqPlan(
        "Evaluate static resistance V/I at an operating point on a non-ohmic V-I curve",
        [
          "taking-local-tangent-or-chord-slope-dV-dI",
          "reciprocal-conductance-I-over-V",
          "reading-initial-low-current-resistance",
        ],
        ["resistance defined by static ratio V/I"],
      ),
      stem,
      options,
      workedSolution: `Electrical resistance at an operating point is defined by R = V / I (not the local slope ΔV / ΔI). At I = ${i3} A, V = ${v3} V, so R = ${v3} / ${i3} = ${fmt3(staticR, "Ω")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Uses static ratio R = V / I = ${v3} / ${i3} = ${fmt3(staticR, "Ω")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const structStems = [
    `In a circuits practical, a student records the potential difference V across ${dev.name} as the current I is increased from 0.0 A to ${fmtGiven(i3, "A")}, obtaining the non-linear characteristic shown.`,
    `The non-ohmic potential difference–current characteristic of ${dev.name} is plotted for currents between 0.0 A and ${fmtGiven(i3, "A")}.`,
    `Using a variable DC supply, ammeter, and voltmeter, measurements on ${dev.name} up to ${fmtGiven(i3, "A")} produce the curved V–I trace below.`,
    `Steady-state voltage and current readings for ${dev.name} over the range 0.0 A to ${fmtGiven(i3, "A")} are displayed on the axes.`,
    `During a component-characterization lab, ${dev.name} is tested up to I = ${fmtGiven(i3, "A")}, yielding the non-linear V–I graph shown.`,
    `An electronics technician logs potential difference V against current I from zero to ${fmtGiven(i3, "A")} across ${dev.name}.`,
    `Examine the experimental V–I characteristic obtained for ${dev.name} as current is swept slowly up to ${fmtGiven(i3, "A")}.`,
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: ["yMax", "gradient"],
    questionPlan: makeStructuredPlan(
      "Read operating voltage and compute static resistance V/I on a non-ohmic characteristic",
      [
        "read potential difference at maximum plotted current",
        "evaluate static ratio V/I rather than local differential slope",
      ],
      ["non-ohmic conductor"],
    ),
    stem: structStems[ctx.formatIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: `State the potential difference across the component at I = ${fmtGiven(i3, "A")}.`,
        marks: 1,
        targetQuantityKey: "yMax",
        expectedAnswer: fmt3(v3, "V"),
        workingSteps: [
          `From the graph at I = ${i3} A, V = ${fmt3(v3, "V")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the resistance of the component at I = ${fmtGiven(i3, "A")}.`,
        marks: 3,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "gradient",
        expectedAnswer: fmt3(staticR, "Ω"),
        workingSteps: [
          "Resistance is defined as the ratio R = V / I at that operating point (not ΔV / ΔI).",
          `R = ${v3} / ${i3} = ${fmt3(staticR, "Ω")}.`,
        ],
      },
    ],
    workedSolution: `(a) At I = ${i3} A, V = ${fmt3(v3, "V")}. (b) Static resistance R = V / I = ${v3} / ${i3} = ${fmt3(staticR, "Ω")} (the upper segment gradient ${fmt3(chordSlope, "Ω")} is ΔV / ΔI, not R).`,
    markScheme: [
      {
        code: "A1",
        partId: "a",
        criterion: `Reads V = ${fmt3(v3, "V")} at I = ${i3} A.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Selects R = V / I rather than local segment gradient ΔV / ΔI.",
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Substitutes V = ${v3} V and I = ${i3} A.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains R = ${fmt3(staticR, "Ω")}.`,
        marks: 1,
      },
    ],
    totalMarks: 4,
  };
}

// ============================================================================
// Archetype 12: emf-internal-resistance :: terminal-pd-current-internal-resistance
// ============================================================================
function buildTerminalPdCellItem(
  ctx: ItemBuildContext,
): CandidateQuestionInput {
  const conceptId = "emf-internal-resistance";
  const templateArchetype = "terminal-pd-current-internal-resistance";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
  });

  const cells = [
    "a lithium-iron-phosphate storage cell",
    "a nickel-metal-hydride battery pack",
    "a portable photovoltaic module under constant irradiance",
    "a lead-acid laboratory accumulator",
    "a hydrogen proton-exchange fuel cell",
    "an alkaline lantern battery",
    "a thermoelectric Seebeck generator",
    "a zinc-carbon dry cell",
    "a silver-oxide instrument battery",
    "a vanadium redox flow single cell",
    "a rechargeable nickel-cadmium pack",
  ];
  const cell = cells[(ctx.variantIndex * 3 + ctx.formatIndex) % cells.length];

  const presets = [
    { iMax: 2.0, emf: 6.0, vMin: 2.4 },
    { iMax: 4.0, emf: 12.0, vMin: 6.0 },
    { iMax: 2.5, emf: 9.0, vMin: 3.0 },
    { iMax: 1.6, emf: 4.8, vMin: 1.6 },
    { iMax: 5.0, emf: 15.0, vMin: 6.0 },
    { iMax: 0.8, emf: 3.2, vMin: 1.2 },
    { iMax: 2.0, emf: 9.6, vMin: 4.0 },
    { iMax: 4.0, emf: 14.0, vMin: 4.0 },
    { iMax: 1.0, emf: 4.5, vMin: 1.5 },
    { iMax: 5.0, emf: 24.0, vMin: 9.0 },
  ];
  const pr = presets[ctx.variantIndex % presets.length];
  const bump = ctx.variantIndex >= 10 ? 1.0 : 0;
  const emf = cleanNum(pr.emf + bump);
  const vMin = cleanNum(pr.vMin + bump);
  const iMax = pr.iMax;

  const points: Point2D[] = [
    { x: 0, y: emf },
    { x: cleanNum(iMax / 2), y: cleanNum(0.5 * (emf + vMin)) },
    { x: iMax, y: vMin },
  ];

  const gradient = cleanNum((vMin - emf) / iMax); // -r
  const meanV = cleanNum(0.5 * (emf + vMin));

  const scenarioSpec = {
    kind: "piecewise-linear-graph",
    xLabel: "current",
    xUnit: "A",
    yLabel: "terminal potential difference",
    yUnit: "V",
    points,
  };

  if (ctx.format === "mcq") {
    const askSlope = ctx.variantIndex % 3 !== 2;
    if (askSlope) {
      const stems = [
        `A variable load resistor is connected across ${cell}, and the terminal potential difference V is plotted against current I up to ${fmtGiven(iMax, "A")}. According to V = ε − Ir, what is the signed gradient of this graph?`,
        `In an internal-resistance experiment on ${cell}, a student plots terminal potential difference V versus current I from 0.0 A to ${fmtGiven(iMax, "A")}. Determine the gradient ΔV / ΔI of the line.`,
        `Refer to the terminal potential difference–current plot for ${cell} over 0.0 A to ${fmtGiven(iMax, "A")}. What value does the signed slope of the best-fit line take?`,
        `Load tests on ${cell} up to I = ${fmtGiven(iMax, "A")} produce the straight-line V–I trace shown. Calculate the signed gradient of the graph in V A⁻¹.`,
        `By varying a rheostat connected to ${cell}, terminal voltage V is graphed against current I up to ${fmtGiven(iMax, "A")}. Find the signed slope ΔV / ΔI.`,
        `Examine the linear V–I characteristic recorded for ${cell} between zero current and ${fmtGiven(iMax, "A")}. What is its signed gradient?`,
      ];
      const stem = stems[ctx.formatIndex % stems.length];
      const options = buildMcqOptions(ctx.rng, gradient, "V A⁻¹", [
        {
          value: Math.abs(gradient),
          rationale:
            "Evaluates internal resistance r = |ΔV / ΔI| but omits the negative sign of the downward V–I gradient.",
        },
        {
          value: -emf / iMax,
          rationale:
            "Assumes the line meets V = 0 at I = I_max instead of reading the non-zero terminal voltage V(I_max).",
        },
        {
          value: -iMax / (emf - vMin),
          rationale:
            "Inverts ΔI / ΔV instead of computing ΔV / ΔI.",
        },
        {
          value: -vMin / iMax,
          rationale:
            "Divides the final terminal voltage V_min by I_max instead of evaluating (V_min − ε) / I_max.",
        },
      ]);
      const correctOpt = options.find((o) => o.isCorrect)!;
      return {
        id: ctx.id,
        conceptId,
        templateArchetype,
        seed: ctx.seed,
        syllabi,
        format: "mcq",
        difficulty: ctx.difficulty,
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["gradient"],
        targetQuantityKey: "gradient",
        questionPlan: makeMcqPlan(
          "Determine negative gradient -r from a terminal potential difference versus current plot",
          [
            "omitting-negative-sign-on-downward-slope",
            "assuming-short-circuit-zero-voltage-at-endpoint",
            "inverting-current-change-over-voltage-drop",
          ],
          ["ohmic internal resistance", "V = ε - Ir"],
        ),
        stem,
        options,
        workedSolution: `At I = 0.0 A, V = ε = ${emf} V; at I = ${iMax} A, V = ${vMin} V. Gradient = (${vMin} − ${emf}) / ${iMax} = ${fmt3(gradient, "V A⁻¹")} (equal to −r).`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates (${vMin} − ${emf}) / ${iMax} = ${fmt3(gradient, "V A⁻¹")} (${correctOpt.label}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stems = [
      `The terminal potential difference V of ${cell} decreases linearly with load current I from 0.0 A to ${fmtGiven(iMax, "A")}, as shown. What is the mean terminal potential difference across this current range?`,
      `Over load currents uniformly spanning 0.0 A to ${fmtGiven(iMax, "A")}, ${cell} exhibits the linear V–I plot shown. Calculate the average terminal potential difference across the plotted interval.`,
      `As current drawn from ${cell} rises steadily from zero to ${fmtGiven(iMax, "A")}, V follows the straight line on the graph. Determine the mean terminal voltage over this range.`,
      `Evaluate the average terminal potential difference delivered by ${cell} across the plotted current domain 0.0 A to ${fmtGiven(iMax, "A")}.`,
      `Inspect the linear discharge characteristic V versus I (0.0 A to ${fmtGiven(iMax, "A")}) for ${cell}. What is the mean value of V across this interval?`,
    ];
    const stem = stems[ctx.formatIndex % stems.length];
    const options = buildMcqOptions(ctx.rng, meanV, "V", [
      {
        value: 0.5 * emf,
        rationale:
          "Halves the EMF as if terminal voltage dropped to zero at I_max.",
      },
      {
        value: emf - vMin,
        rationale:
          "Computes the lost volts ΔV at I_max rather than the mean terminal potential difference.",
      },
      {
        value: 0.5 * (emf + vMin) * iMax,
        rationale:
          "Evaluates the area ∫V dI without dividing by the current span I_max.",
      },
      {
        value: emf,
        rationale:
          "Reads the open-circuit EMF intercept and ignores internal voltage drop.",
      },
      {
        value: vMin,
        rationale:
          "Reads the minimum terminal potential difference at maximum current rather than averaging across the current interval.",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["meanRate"],
      targetQuantityKey: "meanRate",
      questionPlan: makeMcqPlan(
        "Compute mean terminal potential difference across a linear V-I characteristic",
        [
          "assuming-zero-endpoint-voltage",
          "computing-lost-volts-instead-of-mean-pd",
          "omitting-division-by-current-span",
        ],
        ["linear V = ε - Ir characteristic"],
      ),
      stem,
      options,
      workedSolution: `Terminal p.d. varies linearly from ${emf} V at I = 0.0 A to ${vMin} V at I = ${iMax} A, so V_mean = ½(${emf} + ${vMin}) = ${fmt3(meanV, "V")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Averages endpoint voltages ½(${emf} + ${vMin}) = ${fmt3(meanV, "V")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const structStems = [
    `In an experiment to characterize ${cell}, a variable resistor is adjusted while recording terminal potential difference V and current I from 0.0 A to ${fmtGiven(iMax, "A")}. The resulting best-fit line is shown.`,
    `A student connects an ammeter, high-impedance voltmeter, and rheostat to ${cell}, obtaining the linear V–I plot over 0.0 A to ${fmtGiven(iMax, "A")}.`,
    `Terminal voltage V across ${cell} is logged as load current I varies from zero up to ${fmtGiven(iMax, "A")}, producing the downward straight line below.`,
    `During an electrical power-source practical, ${cell} is discharged through a stepped load up to ${fmtGiven(iMax, "A")}, yielding the V–I graph shown.`,
    `Calibrated meters measure terminal potential difference V versus current I up to ${fmtGiven(iMax, "A")} for ${cell}, as plotted on the axes.`,
    `To determine the EMF and internal resistance of ${cell}, V is graphed against I over the current interval 0.0 A to ${fmtGiven(iMax, "A")}.`,
    `The straight-line plot below shows how the terminal potential difference of ${cell} falls as load current increases from 0.0 A to ${fmtGiven(iMax, "A")}.`,
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: ["yMax", "gradient", "meanRate"],
    questionPlan: makeStructuredPlan(
      "Determine cell EMF from open-circuit intercept, negative slope -r, and mean terminal voltage",
      [
        "read vertical intercept at zero current as EMF",
        "evaluate signed gradient of V-I line",
        "compute mean terminal potential difference over plotted current span",
      ],
      ["constant EMF and ohmic internal resistance"],
    ),
    stem: structStems[ctx.formatIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "State the electromotive force ε of the source.",
        marks: 1,
        targetQuantityKey: "yMax",
        expectedAnswer: fmt3(emf, "V"),
        workingSteps: [
          `At I = 0.0 A, V = ε = ${fmt3(emf, "V")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Determine the signed gradient of the V–I graph between 0.0 A and ${fmtGiven(iMax, "A")}.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "gradient",
        expectedAnswer: fmt3(gradient, "V A⁻¹"),
        workingSteps: [
          `At I = ${iMax} A, V = ${vMin} V.`,
          `Gradient = (${vMin} − ${emf}) / ${iMax} = ${fmt3(gradient, "V A⁻¹")} (= −r).`,
        ],
      },
      {
        partId: "c",
        prompt: `Calculate the mean terminal potential difference across the 0.0 A to ${fmtGiven(iMax, "A")} interval.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "meanRate",
        expectedAnswer: fmt3(meanV, "V"),
        workingSteps: [
          `V_mean = ½(${emf} + ${vMin}) = ${fmt3(meanV, "V")}.`,
        ],
      },
    ],
    workedSolution: `(a) Open-circuit intercept gives ε = ${fmt3(emf, "V")}. (b) Gradient = (${vMin} − ${emf}) / ${iMax} = ${fmt3(gradient, "V A⁻¹")}. (c) Mean terminal p.d. = ½(${emf} + ${vMin}) = ${fmt3(meanV, "V")}.`,
    markScheme: [
      {
        code: "A1",
        partId: "a",
        criterion: `Reads ε = ${fmt3(emf, "V")} at I = 0.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Evaluates (${vMin} − ${emf}) / ${iMax} including negative sign.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${fmt3(gradient, "V A⁻¹")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Uses ½(${emf} + ${vMin}) or area divided by ${iMax} A.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains ${fmt3(meanV, "V")}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
  };
}

// ============================================================================
// Archetype 13: resistivity-ohmic-conductors :: resistance-geometry-linearization
// Linearized R = ρ(L/A) + R_lead with non-zero lead/contact resistance intercept!
// ============================================================================
function buildResistivityLinearizationItem(
  ctx: ItemBuildContext,
): CandidateQuestionInput {
  const conceptId = "resistivity-ohmic-conductors";
  const templateArchetype = "resistance-geometry-linearization";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
  });

  const materials = [
    "a conductive carbon-polymer rod",
    "an isotropic graphite heating element",
    "a doped silicon bar",
    "a concentrated saline conductivity column",
    "a conductive silicone sensor strip",
    "a germanium crystal prism",
    "a carbon-loaded antistatic composite bar",
    "an aqueous copper-sulfate capillary cell",
    "a sintered silicon-carbide heating rod",
    "a polypyrrole conductive polymer film",
    "a potassium-chloride electrolyte tube",
  ];
  const mat = materials[(ctx.variantIndex * 3 + ctx.formatIndex) % materials.length];

  // x = L/A in m⁻¹ (0 to 100..500), y = R in Ω (R0 to RMax), gradient = ρ in Ω m!
  const presets = [
    { xMax: 400, r0: 4, rMax: 24 },
    { xMax: 500, r0: 5, rMax: 30 },
    { xMax: 200, r0: 3, rMax: 19 },
    { xMax: 250, r0: 6, rMax: 26 },
    { xMax: 400, r0: 8, rMax: 40 },
    { xMax: 500, r0: 10, rMax: 45 },
    { xMax: 200, r0: 4, rMax: 28 },
    { xMax: 100, r0: 2, rMax: 18 },
    { xMax: 250, r0: 5, rMax: 35 },
    { xMax: 400, r0: 6, rMax: 30 },
    { xMax: 80, r0: 3, rMax: 19 },
    { xMax: 160, r0: 4, rMax: 20 },
    { xMax: 50, r0: 2, rMax: 14 },
  ];
  const pr = presets[ctx.variantIndex % presets.length];
  const r0 = ctx.variantIndex >= 13 ? pr.r0 + 2 : pr.r0;
  const rMax = ctx.variantIndex >= 13 ? pr.rMax + 6 : pr.rMax;
  const xMax = pr.xMax;

  const points: Point2D[] = [
    { x: 0, y: r0 },
    { x: cleanNum(xMax / 2), y: cleanNum(0.5 * (r0 + rMax)) },
    { x: xMax, y: rMax },
  ];

  const rho = cleanNum((rMax - r0) / xMax);

  const scenarioSpec = {
    kind: "piecewise-linear-graph",
    xLabel: "length-to-area ratio",
    xUnit: "m⁻¹",
    yLabel: "measured resistance",
    yUnit: "Ω",
    points,
  };

  if (ctx.format === "mcq") {
    const stems = [
      `Using crocodile clips with constant contact resistance R₀, a student measures total resistance R of ${mat} for different length-to-area ratios (L / A) up to ${fmtGiven(xMax, "m⁻¹")}, so R = ρ(L / A) + R₀. From the plotted line, what is the resistivity ρ of the material?`,
      `Total circuit resistance R (including lead resistance R₀) is plotted against geometric ratio L / A up to ${fmtGiven(xMax, "m⁻¹")} for ${mat}. Calculate the electrical resistivity ρ.`,
      `The linearized graph shows measured resistance R versus L / A for ${mat} over 0.0 m⁻¹ to ${fmtGiven(xMax, "m⁻¹")}. Accounting for the non-zero contact-resistance intercept, determine ρ.`,
      `To find the resistivity ρ of ${mat}, total resistance R = ρ(L / A) + R₀ is plotted against L / A up to ${fmtGiven(xMax, "m⁻¹")}. What value of ρ does the graph give?`,
      `Two-wire resistance readings R across ${mat} include a fixed fixture offset R₀ when graphed against L / A from zero to ${fmtGiven(xMax, "m⁻¹")}. Evaluate the resistivity ρ in Ω m.`,
      `In a materials conductivity test on ${mat}, measured resistance R varies linearly with L / A up to ${fmtGiven(xMax, "m⁻¹")} as shown. Extract the bulk resistivity ρ.`,
      `Inspect the linear plot of measured resistance R versus L / A (spanning 0.0 m⁻¹ to ${fmtGiven(xMax, "m⁻¹")}) for ${mat}. What is the material's resistivity ρ?`,
      `Eliminating the constant probe-lead offset from the R versus L / A graph (plotted to ${fmtGiven(xMax, "m⁻¹")}), find the resistivity ρ of ${mat}.`,
    ];
    const stem = stems[ctx.formatIndex % stems.length];
    const options = buildMcqOptions(ctx.rng, rho, "Ω m", [
      {
        value: rMax / xMax,
        rationale:
          "Computes the secant ratio R_max / (L/A)_max from the origin and fails to subtract the non-zero contact-resistance intercept R₀.",
      },
      {
        value: (rMax + r0) / xMax,
        rationale:
          "Adds the zero-offset intercept R₀ to R_max instead of subtracting it when finding ΔR.",
      },
      {
        value: xMax / (rMax - r0),
        rationale:
          "Inverts Δ(L/A) / ΔR (electrical conductivity σ) instead of ΔR / Δ(L/A).",
      },
      {
        value: r0,
        rationale:
          "Reads the vertical contact-resistance intercept R₀ instead of the gradient ρ.",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["gradient"],
      targetQuantityKey: "gradient",
      questionPlan: makeMcqPlan(
        "Extract material resistivity from gradient of R against L/A in presence of systematic contact resistance",
        [
          "secant-ratio-y-over-x-ignoring-nonzero-intercept",
          "adding-intercept-instead-of-subtracting",
          "reciprocal-conductivity-inversion",
        ],
        ["constant contact and lead resistance R₀"],
      ),
      stem,
      options,
      workedSolution: `Since R = ρ(L / A) + R₀, resistivity ρ equals the gradient ΔR / Δ(L / A) = (${rMax} − ${r0}) / ${xMax} = ${fmt3(rho, "Ω m")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Subtracts intercept R₀ = ${r0} Ω to obtain ρ = (${rMax} − ${r0}) / ${xMax} = ${fmt3(rho, "Ω m")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const structStems = [
    `To determine the resistivity ρ of ${mat} despite probe and lead resistance R₀, a student plots total measured resistance R against the ratio L / A from 0.0 m⁻¹ to ${fmtGiven(xMax, "m⁻¹")}.`,
    `Measured resistance R is plotted against length-to-area ratio L / A up to ${fmtGiven(xMax, "m⁻¹")} for ${mat}, obeying R = ρ(L / A) + R₀ where R₀ is the constant lead resistance.`,
    `In an electrical properties lab, resistance readings across ${mat} are linearized against geometric factor L / A up to ${fmtGiven(xMax, "m⁻¹")}, revealing a non-zero contact offset R₀.`,
    `Two-terminal ohmmeter data R for ${mat} of varying dimensions are graphed versus L / A from 0.0 m⁻¹ to ${fmtGiven(xMax, "m⁻¹")} as shown below.`,
    `Because clamping electrodes introduce a fixed series resistance R₀, a researcher plots R against L / A up to ${fmtGiven(xMax, "m⁻¹")} for ${mat}.`,
    `The linear graph below displays total measured resistance R against L / A (0.0 m⁻¹ to ${fmtGiven(xMax, "m⁻¹")}) during a resistivity test on ${mat}.`,
    `Varying specimen geometry up to L / A = ${fmtGiven(xMax, "m⁻¹")}, a student obtains the straight-line R versus L / A plot shown for ${mat}.`,
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: ["yMin", "gradient"],
    questionPlan: makeStructuredPlan(
      "Identify systematic lead resistance from y-intercept and calculate resistivity from linearized slope",
      [
        "read systematic lead resistance at zero length-to-area ratio",
        "evaluate gradient ΔR / Δ(L/A) for resistivity",
      ],
      ["uniform cross-section and constant temperature"],
    ),
    stem: structStems[ctx.formatIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "State the systematic lead and contact resistance R₀.",
        marks: 1,
        targetQuantityKey: "yMin",
        expectedAnswer: fmt3(r0, "Ω"),
        workingSteps: [
          `At L / A = 0.0 m⁻¹, the vertical intercept gives R₀ = ${fmt3(r0, "Ω")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Determine the resistivity ρ of ${mat} from the graph.`,
        marks: 3,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "gradient",
        expectedAnswer: fmt3(rho, "Ω m"),
        workingSteps: [
          `From R = ρ(L / A) + R₀, ρ equals the gradient ΔR / Δ(L / A).`,
          `ρ = (${rMax} − ${r0}) / ${xMax} = ${fmt3(rho, "Ω m")}.`,
        ],
      },
    ],
    workedSolution: `(a) Vertical intercept R₀ = ${fmt3(r0, "Ω")}. (b) Resistivity ρ = (${rMax} − ${r0}) / ${xMax} = ${fmt3(rho, "Ω m")}.`,
    markScheme: [
      {
        code: "A1",
        partId: "a",
        criterion: `States R₀ = ${fmt3(r0, "Ω")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Identifies ρ with the gradient ΔR / Δ(L / A).",
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Subtracts R₀ = ${r0} Ω from ${rMax} Ω before dividing by ${xMax} m⁻¹.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ρ = ${fmt3(rho, "Ω m")}.`,
        marks: 1,
      },
    ],
    totalMarks: 4,
  };
}

// ============================================================================
// Archetype 14: graphical-linearization-gradients :: kinematics-gravity-v2-vs-drop-linearization
// Explicitly splits IB (SL/HL, g = 9.8 m s⁻²) vs A-Level/NCUK (g = 9.81 m s⁻²)!
// ============================================================================
function buildGravityLinearizationItem(
  ctx: ItemBuildContext,
): CandidateQuestionInput {
  const conceptId = "graphical-linearization-gradients";
  const templateArchetype = "kinematics-gravity-v2-vs-drop-linearization";

  const isIb = ctx.variantIndex % 2 === 0;
  const gVal = isIb ? 9.8 : 9.81;
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
    allowedSyllabi: isIb ? ["ib"] : ["alevel", "ncuk"],
  });

  const setups = [
    "a card-carrying glider on an inclined linear air track",
    "a steel ball bearing rolling in a V-channel with negligible rotational loss",
    "a low-friction dynamics cart descending a tilted aluminium runway",
    "a magnetic-cushion puck sliding down a tilted glass rail",
    "a dual-photogate brass cylinder released past an upper light gate",
    "an optical-interruptor sled coasting down an inclined bench",
    "an air-bearing carriage coasting down a Precision granite incline",
    "a PTFE-shod test block sliding down a polished low-friction chute",
    "a levitated neodymium shuttle descending an inclined guide",
    "a wheeled telemetry trolley accelerating along a tilted track",
    "a low-drag calibration capsule descending a straight guide rail",
  ];
  const setup = setups[(ctx.variantIndex * 3 + ctx.formatIndex) % setups.length];

  // Choose sinTheta != 0.5 so gradient = 2*g*sinTheta never numerically equals g!
  const presets = [
    { sinTheta: 0.25, sMax: 2.0, u0Sq: 2.0 },
    { sinTheta: 0.3, sMax: 2.0, u0Sq: 1.5 },
    { sinTheta: 0.4, sMax: 1.6, u0Sq: 2.4 },
    { sinTheta: 0.2, sMax: 2.5, u0Sq: 1.8 },
    { sinTheta: 0.35, sMax: 2.0, u0Sq: 3.0 },
    { sinTheta: 0.6, sMax: 1.0, u0Sq: 2.2 },
    { sinTheta: 0.25, sMax: 1.6, u0Sq: 3.2 },
    { sinTheta: 0.4, sMax: 2.0, u0Sq: 4.0 },
    { sinTheta: 0.3, sMax: 2.5, u0Sq: 2.5 },
    { sinTheta: 0.2, sMax: 2.0, u0Sq: 1.2 },
    { sinTheta: 0.15, sMax: 4.0, u0Sq: 1.6 },
    { sinTheta: 0.45, sMax: 1.2, u0Sq: 2.8 },
    { sinTheta: 0.3, sMax: 1.5, u0Sq: 3.5 },
  ];
  const pr = presets[ctx.variantIndex % presets.length];
  const u0Sq = ctx.variantIndex >= 13 ? cleanNum(pr.u0Sq + 1.0) : pr.u0Sq;
  const { sinTheta, sMax } = pr;

  const slope = cleanNum(2 * gVal * sinTheta);
  const vMaxSq = cleanNum(u0Sq + slope * sMax);
  const points: Point2D[] = [
    { x: 0, y: u0Sq },
    { x: cleanNum(sMax / 2), y: cleanNum(u0Sq + slope * (sMax / 2)) },
    { x: sMax, y: vMaxSq },
  ];

  const scenarioSpec = {
    kind: "piecewise-linear-graph",
    xLabel: "track distance",
    xUnit: "m",
    yLabel: "speed squared",
    yUnit: "m² s⁻²",
    points,
  };

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "gravityMs2", value: gVal, unit: "m s⁻²", source: "stem" },
    { name: "sMax", value: sMax, unit: "m", source: "either" },
  ];

  if (ctx.format === "mcq") {
    const stems = [
      `Using two light gates in a gravitational field g = ${gVal} m s⁻², a student records speed v of ${setup} (inclination sin θ = ${sinTheta}) after passing an initial gate at s = 0.0 m with speed u₀ > 0, plotting v² against distance s up to ${fmtGiven(sMax, "m")}. According to v² = u₀² + 2as, what is the gradient Δ(v²) / Δs of the line?`,
      `In a kinematics linearization lab (take g = ${gVal} m s⁻²), ${setup} on a frictionless slope with sin θ = ${sinTheta} passes s = 0.0 m at speed u₀ and continues to s = ${fmtGiven(sMax, "m")}. Determine the gradient of the plotted v² versus s graph.`,
      `Photogate data for ${setup} accelerating down an incline (sin θ = ${sinTheta}, g = ${gVal} m s⁻²) from s = 0.0 m to s = ${fmtGiven(sMax, "m")} are linearized by plotting v² against s. What gradient does the best-fit line have?`,
      `Taking g = ${gVal} m s⁻², ${setup} descends a smooth plane inclined at sin θ = ${sinTheta}, passing s = 0.0 m already in motion. From the v² against s plot up to ${fmtGiven(sMax, "m")}, find the slope Δ(v²) / Δs.`,
      `Speed-squared readings v² are graphed against displacement s (0.0 m to ${fmtGiven(sMax, "m")}) for ${setup} on a frictionless ramp of sin θ = ${sinTheta} where g = ${gVal} m s⁻². Calculate the gradient of the line.`,
      `How steep (in m s⁻²) is the linear v² versus s graph recorded over ${fmtGiven(sMax, "m")} for ${setup} on a smooth slope (sin θ = ${sinTheta}, g = ${gVal} m s⁻²)?`,
      `Examine the straight-line plot of v² against track distance s up to ${fmtGiven(sMax, "m")} for ${setup} (ramp sin θ = ${sinTheta}, g = ${gVal} m s⁻²). Evaluate its gradient.`,
      `An optical timer measures speed v of ${setup} at positions up to s = ${fmtGiven(sMax, "m")} along a frictionless incline (sin θ = ${sinTheta}, g = ${gVal} m s⁻²). What is the slope of the resulting v²–s graph?`,
    ];
    const stem = stems[ctx.formatIndex % stems.length];
    const options = buildMcqOptions(ctx.rng, slope, "m s⁻²", [
      {
        value: vMaxSq / sMax,
        rationale:
          "Evaluates the secant v_max² / s_max without subtracting the non-zero intercept u₀² at s = 0.",
      },
      {
        value: 0.5 * slope,
        rationale:
          "Reports the acceleration a = g sin θ instead of the gradient 2a of the v²–s line.",
      },
      {
        value: sMax / (vMaxSq - u0Sq),
        rationale:
          "Inverts Δs / Δ(v²) instead of computing Δ(v²) / Δs.",
      },
      {
        value: (vMaxSq + u0Sq) / sMax,
        rationale:
          "Adds the vertical intercept u₀² to v_max² rather than subtracting it.",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["gradient"],
      requiredGivens,
      targetQuantityKey: "gradient",
      questionPlan: makeMcqPlan(
        "Extract gradient equal to twice acceleration from a linearized speed-squared against distance plot with nonzero initial speed",
        [
          "secant-ratio-ignoring-nonzero-initial-speed-squared",
          "confusing-acceleration-with-twice-acceleration-slope",
          "reciprocal-run-over-rise-inversion",
        ],
        ["frictionless incline", "uniform gravitational field"],
      ),
      stem,
      options,
      workedSolution: `From v² = u₀² + (2g sin θ)s, the vertical intercept is u₀² = ${u0Sq} m² s⁻² and at s = ${sMax} m, v² = ${vMaxSq} m² s⁻². Gradient = (${vMaxSq} − ${u0Sq}) / ${sMax} = 2(${gVal})(${sinTheta}) = ${fmt3(slope, "m s⁻²")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Subtracts intercept u₀² = ${u0Sq} m² s⁻² (or evaluates 2 × ${gVal} × ${sinTheta}) to get ${fmt3(slope, "m s⁻²")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const structStems = [
    `In a laboratory with g = ${gVal} m s⁻², ${setup} moves down a smooth incline (sin θ = ${sinTheta}) past a reference light gate at s = 0.0 m with non-zero speed u₀. Values of v² are plotted against s up to ${fmtGiven(sMax, "m")}.`,
    `Taking g = ${gVal} m s⁻², a student linearizes motion data for ${setup} on a frictionless ramp (sin θ = ${sinTheta}) by plotting speed squared v² against distance s from 0.0 m to ${fmtGiven(sMax, "m")}.`,
    `Photogates spaced up to ${fmtGiven(sMax, "m")} along a smooth slope (sin θ = ${sinTheta}, g = ${gVal} m s⁻²) record ${setup}, producing the linear v² versus s graph below.`,
    `Passing s = 0.0 m already moving at speed u₀, ${setup} accelerates down a frictionless incline of sin θ = ${sinTheta} (g = ${gVal} m s⁻²); its v²–s trace over ${fmtGiven(sMax, "m")} is shown.`,
    `To verify uniform acceleration under g = ${gVal} m s⁻², ${setup} is timed along a tilted track (sin θ = ${sinTheta}) and v² is graphed against s up to ${fmtGiven(sMax, "m")}.`,
    `The linearized graph below plots v² against track distance s (0.0 m to ${fmtGiven(sMax, "m")}) for ${setup} descending a smooth slope with sin θ = ${sinTheta} (take g = ${gVal} m s⁻²).`,
    `Experimental measurements up to s = ${fmtGiven(sMax, "m")} for ${setup} on an incline of sin θ = ${sinTheta} (where g = ${gVal} m s⁻²) yield the straight-line v²–s plot shown.`,
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: ["yMin", "gradient"],
    requiredGivens,
    questionPlan: makeStructuredPlan(
      "Read initial speed squared intercept and compute linearized kinematics slope equal to twice ramp acceleration",
      [
        "extract initial speed squared from vertical intercept at zero track distance",
        "evaluate gradient of speed squared with respect to distance along ramp",
      ],
      ["constant acceleration along frictionless ramp"],
    ),
    stem: structStems[ctx.formatIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "State the value of u₀² at s = 0.0 m from the graph.",
        marks: 1,
        targetQuantityKey: "yMin",
        expectedAnswer: fmt3(u0Sq, "m² s⁻²"),
        workingSteps: [
          `The vertical-axis intercept at s = 0.0 m is u₀² = ${fmt3(u0Sq, "m² s⁻²")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Determine the gradient Δ(v²) / Δs of the line over the ${fmtGiven(sMax, "m")} interval.`,
        marks: 3,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "gradient",
        expectedAnswer: fmt3(slope, "m s⁻²"),
        workingSteps: [
          `At s = ${sMax} m, v² = ${vMaxSq} m² s⁻².`,
          `Gradient = (${vMaxSq} − ${u0Sq}) / ${sMax} = ${fmt3(slope, "m s⁻²")} (= 2g sin θ).`,
        ],
      },
    ],
    workedSolution: `(a) At s = 0.0 m, u₀² = ${fmt3(u0Sq, "m² s⁻²")}. (b) Gradient = (${vMaxSq} − ${u0Sq}) / ${sMax} = ${fmt3(slope, "m s⁻²")}.`,
    markScheme: [
      {
        code: "A1",
        partId: "a",
        criterion: `Reads intercept u₀² = ${fmt3(u0Sq, "m² s⁻²")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Forms gradient (${vMaxSq} − ${u0Sq}) / ${sMax}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Subtracts non-zero intercept u₀² accurately.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${fmt3(slope, "m s⁻²")}.`,
        marks: 1,
      },
    ],
    totalMarks: 4,
  };
}

// ============================================================================
// Archetype 15: electrostatic-coulomb-uniform-fields :: inverse-square-force-linearization
// Compatible with IB (SL/HL), A-Level (Y13), NCUK (IFY-S2/IFY)
// ============================================================================
function buildInverseSquareCoulombItem(
  ctx: ItemBuildContext,
): CandidateQuestionInput {
  const conceptId = "electrostatic-coulomb-uniform-fields";
  const templateArchetype = "inverse-square-force-linearization";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
    preferredLevels: {
      alevel: "Y13",
      ncuk: "IFY-S2",
    },
  });

  const apparatuses = [
    "two conducting pith spheres on a digital top-pan balance",
    "charged metallized spheres in a Coulomb torsion-balance rig",
    "isolated brass domes mounted above an electronic microbalance",
    "charged graphite-coated spheres on a quartz-fibre force sensor",
    "insulated aluminium spheres monitored by a strain-gauge beam",
    "precision electrostatic spheres on a sapphire-pivot balance",
    "gold-leaf coated polymer spheres on a capacitive force transducer",
    "nickel-plated hollow spheres suspended over an analytical balance",
    "charged copper electrodes on a laser-deflection cantilever",
    "conductive carbon spheres mounted in a dry-nitrogen force cell",
    "silvered glass spheres positioned above a digital load pan",
  ];
  const app = apparatuses[(ctx.variantIndex * 3 + ctx.formatIndex) % apparatuses.length];

  // x = 1/r² in m⁻² (0 to 25..100), y = F in N (f0 to fMax), gradient = k|Q1 Q2| in N m²
  const presets = [
    { invR2Max: 50, f0: 0.1, fMax: 0.9 },
    { invR2Max: 100, f0: 0.2, fMax: 1.4 },
    { invR2Max: 40, f0: 0.15, fMax: 0.95 },
    { invR2Max: 80, f0: 0.2, fMax: 1.8 },
    { invR2Max: 50, f0: 0.25, fMax: 1.25 },
    { invR2Max: 100, f0: 0.1, fMax: 0.8 },
    { invR2Max: 25, f0: 0.1, fMax: 0.85 },
    { invR2Max: 40, f0: 0.2, fMax: 1.2 },
    { invR2Max: 80, f0: 0.4, fMax: 2.0 },
    { invR2Max: 50, f0: 0.3, fMax: 1.5 },
    { invR2Max: 20, f0: 0.1, fMax: 0.7 },
    { invR2Max: 60, f0: 0.3, fMax: 1.5 },
    { invR2Max: 16, f0: 0.12, fMax: 0.76 },
  ];
  const pr = presets[ctx.variantIndex % presets.length];
  const fMax = ctx.variantIndex >= 13 ? cleanNum(pr.fMax + 0.4) : pr.fMax;
  const { invR2Max, f0 } = pr;

  const points: Point2D[] = [
    { x: 0, y: f0 },
    { x: cleanNum(invR2Max / 2), y: cleanNum(0.5 * (f0 + fMax)) },
    { x: invR2Max, y: fMax },
  ];

  const slope = cleanNum((fMax - f0) / invR2Max);

  const scenarioSpec = {
    kind: "piecewise-linear-graph",
    xLabel: "inverse square separation",
    xUnit: "m⁻²",
    yLabel: "balance reading",
    yUnit: "N",
    points,
  };

  if (ctx.format === "mcq") {
    const stems = [
      `To test Coulomb's inverse-square law using ${app} with an unzeroed tare offset F₀, the force reading F is plotted against inverse-square separation (r⁻²) up to ${fmtGiven(invR2Max, "m⁻²")}, following F = k|Q₁Q₂|r⁻² + F₀. What is the gradient k|Q₁Q₂| of the line?`,
      `Readings F from ${app} are linearized against r⁻² from 0.0 m⁻² to ${fmtGiven(invR2Max, "m⁻²")}. Accounting for the systematic zero-offset F₀, determine the gradient ΔF / Δ(r⁻²).`,
      `The linearized Coulomb plot shows balance force F versus inverse-square separation r⁻² up to ${fmtGiven(invR2Max, "m⁻²")} for ${app}. Calculate the gradient of the line in N m².`,
      `In an electrostatics investigation with ${app}, F is plotted against r⁻² up to ${fmtGiven(invR2Max, "m⁻²")}. Extract the proportionality constant k|Q₁Q₂| given by the slope.`,
      `Varying centre-to-centre separation up to r⁻² = ${fmtGiven(invR2Max, "m⁻²")} for ${app} yields the linear F versus r⁻² trace shown. Evaluate the slope ΔF / Δ(r⁻²).`,
      `Subtracting the constant zero-offset intercept on the F versus r⁻² plot (0.0 m⁻² to ${fmtGiven(invR2Max, "m⁻²")}) for ${app}, find the gradient in N m².`,
      `How large is the slope ΔF / Δ(r⁻²) of the inverse-square linearization graph recorded up to ${fmtGiven(invR2Max, "m⁻²")} using ${app}?`,
      `Examine the straight-line graph of balance force F against r⁻² (spanning 0.0 m⁻² to ${fmtGiven(invR2Max, "m⁻²")}) for ${app}. What value does its gradient take?`,
    ];
    const stem = stems[ctx.formatIndex % stems.length];
    const options = buildMcqOptions(ctx.rng, slope, "N m²", [
      {
        value: fMax / invR2Max,
        rationale:
          "Computes the secant F_max / (r⁻²)_max from (0, 0) without subtracting the non-zero balance tare offset F₀.",
      },
      {
        value: (fMax - f0) * invR2Max,
        rationale:
          "Multiplies ΔF by (r⁻²)_max instead of dividing ΔF by Δ(r⁻²).",
      },
      {
        value: invR2Max / (fMax - f0),
        rationale:
          "Inverts the slope to Δ(r⁻²) / ΔF instead of ΔF / Δ(r⁻²).",
      },
      {
        value: (fMax + f0) / invR2Max,
        rationale:
          "Adds the systematic tare offset F₀ to F_max rather than subtracting it.",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["gradient"],
      targetQuantityKey: "gradient",
      questionPlan: makeMcqPlan(
        "Extract Coulomb constant-charge product from slope of F against inverse-square separation with nonzero tare offset",
        [
          "secant-from-origin-ignoring-tare-offset",
          "multiplying-rise-and-run",
          "reciprocal-slope-inversion",
        ],
        ["point-charge approximation", "constant tare offset"],
      ),
      stem,
      options,
      workedSolution: `At r⁻² = 0.0 m⁻², tare offset F₀ = ${f0} N; at r⁻² = ${invR2Max} m⁻², F = ${fMax} N. Gradient = (${fMax} − ${f0}) / ${invR2Max} = ${fmt3(slope, "N m²")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Subtracts tare offset F₀ = ${f0} N to get (${fMax} − ${f0}) / ${invR2Max} = ${fmt3(slope, "N m²")} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const structStems = [
    `In an experiment verifying Coulomb's inverse-square law using ${app}, total force reading F is plotted against inverse-square separation r⁻² up to ${fmtGiven(invR2Max, "m⁻²")}, obeying F = k|Q₁Q₂|r⁻² + F₀.`,
    `Electrostatic force measurements from ${app} are linearized by plotting balance reading F against r⁻² over 0.0 m⁻² to ${fmtGiven(invR2Max, "m⁻²")}.`,
    `Because the force sensor has an unzeroed tare reading F₀, a student graphs total force F against r⁻² up to ${fmtGiven(invR2Max, "m⁻²")} for ${app}.`,
    `The straight-line plot below displays measured force F versus inverse-square separation r⁻² (0.0 m⁻² to ${fmtGiven(invR2Max, "m⁻²")}) for ${app}.`,
    `Repulsive force data between ${app} are transformed to F against r⁻² up to ${fmtGiven(invR2Max, "m⁻²")}, revealing a constant tare intercept.`,
    `During an electrostatics practical with ${app}, readings of F are plotted versus r⁻² across 0.0 m⁻² to ${fmtGiven(invR2Max, "m⁻²")} as shown.`,
    `Refer to the linearized Coulomb graph of balance reading F against r⁻² (up to ${fmtGiven(invR2Max, "m⁻²")}) recorded using ${app}.`,
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: ["yMin", "gradient"],
    questionPlan: makeStructuredPlan(
      "Identify systematic balance zero-offset as separation approaches infinity and compute inverse-square Coulomb slope",
      [
        "read tare force intercept at zero inverse-square separation",
        "evaluate force gradient with respect to inverse-square separation",
      ],
      ["fixed sphere charges", "vacuum permittivity"],
    ),
    stem: structStems[ctx.formatIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "State the systematic tare offset F₀ of the balance as separation r approaches infinity.",
        marks: 1,
        targetQuantityKey: "yMin",
        expectedAnswer: fmt3(f0, "N"),
        workingSteps: [
          `As r → ∞, r⁻² → 0, where the vertical intercept gives F₀ = ${fmt3(f0, "N")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the gradient k|Q₁Q₂| of the linearized plot over 0.0 m⁻² to ${fmtGiven(invR2Max, "m⁻²")}.`,
        marks: 3,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "gradient",
        expectedAnswer: fmt3(slope, "N m²"),
        workingSteps: [
          `Read F = ${fMax} N at r⁻² = ${invR2Max} m⁻².`,
          `Gradient = (${fMax} − ${f0}) / ${invR2Max} = ${fmt3(slope, "N m²")}.`,
        ],
      },
    ],
    workedSolution: `(a) At r⁻² = 0, systematic tare offset F₀ = ${fmt3(f0, "N")}. (b) Gradient = (${fMax} − ${f0}) / ${invR2Max} = ${fmt3(slope, "N m²")}.`,
    markScheme: [
      {
        code: "A1",
        partId: "a",
        criterion: `Reads intercept F₀ = ${fmt3(f0, "N")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Evaluates ΔF = ${fMax} − ${f0} using intercept from (a).`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Divides ΔF by ${invR2Max} m⁻² and states correct unit N m².`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${fmt3(slope, "N m²")}.`,
        marks: 1,
      },
    ],
    totalMarks: 4,
  };
}

// ============================================================================
// Archetype 16: uncertainties-error-propagation :: worst-fit-error-bar-gradient
// Steepest / shallowest worst-fit line through error-bar extremes (x1 > 0 to x2)
// ============================================================================
function buildWorstFitErrorBarItem(
  ctx: ItemBuildContext,
): CandidateQuestionInput {
  const conceptId = "uncertainties-error-propagation";
  const templateArchetype = "worst-fit-error-bar-gradient";
  const syllabi = resolveSyllabiTags(conceptId, ctx.format, {
    variantIndex: ctx.variantIndex,
  });

  const experiments = [
    {
      title: "a Hall-probe magnetic flux calibration",
      xLabel: "solenoid current",
      xUnit: "A",
      yLabel: "Hall voltage",
      yUnit: "mV",
      slopeUnit: "mV A⁻¹",
    },
    {
      title: "a metal-rod thermal expansion experiment",
      xLabel: "temperature rise",
      xUnit: "K",
      yLabel: "extension",
      yUnit: "mm",
      slopeUnit: "mm K⁻¹",
    },
    {
      title: "a simple-pendulum linearization study",
      xLabel: "string length",
      xUnit: "m",
      yLabel: "period squared",
      yUnit: "s²",
      slopeUnit: "s² m⁻¹",
    },
    {
      title: "a piezoelectric load-cell calibration",
      xLabel: "applied load",
      xUnit: "N",
      yLabel: "sensor output",
      yUnit: "mV",
      slopeUnit: "mV N⁻¹",
    },
    {
      title: "a mass-spring oscillation practical",
      xLabel: "suspended mass",
      xUnit: "kg",
      yLabel: "period squared",
      yUnit: "s²",
      slopeUnit: "s² kg⁻¹",
    },
    {
      title: "a gas-thermometer constant-volume test",
      xLabel: "temperature",
      xUnit: "K",
      yLabel: "pressure",
      yUnit: "kPa",
      slopeUnit: "kPa K⁻¹",
    },
    {
      title: "an optical photodiode irradiance calibration",
      xLabel: "incident power",
      xUnit: "mW",
      yLabel: "photocurrent",
      yUnit: "μA",
      slopeUnit: "μA mW⁻¹",
    },
    {
      title: "a thermocouple electromotive-force test",
      xLabel: "temperature difference",
      xUnit: "K",
      yLabel: "thermal emf",
      yUnit: "mV",
      slopeUnit: "mV K⁻¹",
    },
    {
      title: "a torsion-wire shear stiffness practical",
      xLabel: "applied torque",
      xUnit: "N m",
      yLabel: "twist angle",
      yUnit: "rad",
      slopeUnit: "rad N⁻¹ m⁻¹",
    },
    {
      title: "a capillary Poiseuille flow experiment",
      xLabel: "pressure drop",
      xUnit: "kPa",
      yLabel: "flow rate",
      yUnit: "mL s⁻¹",
      slopeUnit: "mL s⁻¹ kPa⁻¹",
    },
    {
      title: "a Helmholtz-coil axial field check",
      xLabel: "coil current",
      xUnit: "A",
      yLabel: "magnetic flux density",
      yUnit: "mT",
      slopeUnit: "mT A⁻¹",
    },
  ];
  const exp = experiments[(ctx.variantIndex * 3 + ctx.formatIndex) % experiments.length];

  const presets = [
    { x1: 1.0, x2: 5.0, y1: 2.0, y2: 19.0, kindWord: "steepest" },
    { x1: 2.0, x2: 10.0, y1: 6.0, y2: 34.0, kindWord: "steepest" },
    { x1: 1.0, x2: 5.0, y1: 5.0, y2: 17.0, kindWord: "shallowest" },
    { x1: 2.0, x2: 8.0, y1: 4.0, y2: 25.0, kindWord: "steepest" },
    { x1: 0.5, x2: 2.5, y1: 1.2, y2: 8.4, kindWord: "steepest" },
    { x1: 4.0, x2: 20.0, y1: 12.0, y2: 52.0, kindWord: "shallowest" },
    { x1: 1.0, x2: 6.0, y1: 3.0, y2: 22.0, kindWord: "steepest" },
    { x1: 2.0, x2: 12.0, y1: 8.0, y2: 36.0, kindWord: "shallowest" },
    { x1: 0.4, x2: 2.0, y1: 1.0, y2: 6.6, kindWord: "steepest" },
    { x1: 5.0, x2: 25.0, y1: 15.0, y2: 71.0, kindWord: "steepest" },
    { x1: 2.0, x2: 16.0, y1: 5.0, y2: 40.0, kindWord: "shallowest" },
    { x1: 1.5, x2: 7.5, y1: 3.0, y2: 24.0, kindWord: "steepest" },
    { x1: 3.0, x2: 15.0, y1: 9.0, y2: 42.0, kindWord: "shallowest" },
  ];
  const pr = presets[ctx.variantIndex % presets.length];
  const y2 = ctx.variantIndex >= 13 ? cleanNum(pr.y2 + 4.0) : pr.y2;
  const { x1, x2, y1, kindWord } = pr;

  const points: Point2D[] = [
    { x: x1, y: y1 },
    { x: cleanNum(0.5 * (x1 + x2)), y: cleanNum(0.5 * (y1 + y2)) },
    { x: x2, y: y2 },
  ];

  const mWorst = cleanNum((y2 - y1) / (x2 - x1));

  const scenarioSpec = {
    kind: "piecewise-linear-graph",
    xLabel: exp.xLabel,
    xUnit: exp.xUnit,
    yLabel: exp.yLabel,
    yUnit: exp.yUnit,
    points,
  };

  if (ctx.format === "mcq") {
    const stems = [
      `To estimate gradient uncertainty in ${exp.title}, a student draws the ${kindWord} acceptable line of worst fit between the extreme error-bar vertices at ${exp.xLabel} ${fmtGiven(x1, exp.xUnit)} and ${fmtGiven(x2, exp.xUnit)}, as plotted. What is the gradient m_worst of this worst-fit line?`,
      `The graph displays the ${kindWord} line of worst fit joining opposite vertical error-bar extremes from ${fmtGiven(x1, exp.xUnit)} to ${fmtGiven(x2, exp.xUnit)} in ${exp.title}. Calculate its gradient.`,
      `During uncertainty analysis of ${exp.title}, the ${kindWord} worst-fit line is constructed across the domain ${fmtGiven(x1, exp.xUnit)} to ${fmtGiven(x2, exp.xUnit)}. Determine the gradient of the plotted line.`,
      `Inspect the ${kindWord} error-bar line of worst fit plotted from ${fmtGiven(x1, exp.xUnit)} to ${fmtGiven(x2, exp.xUnit)} for ${exp.title}. What value does its gradient take?`,
      `Error-bar bounds at ${fmtGiven(x1, exp.xUnit)} and ${fmtGiven(x2, exp.xUnit)} define the ${kindWord} acceptable line in ${exp.title}. Evaluate the slope of this worst-fit line.`,
      `In ${exp.title}, how large is the gradient of the ${kindWord} worst-fit line spanning ${fmtGiven(x1, exp.xUnit)} to ${fmtGiven(x2, exp.xUnit)} on the axes shown?`,
      `Connecting opposite uncertainty-bar ends at ${fmtGiven(x1, exp.xUnit)} and ${fmtGiven(x2, exp.xUnit)} in ${exp.title} produces the ${kindWord} worst-fit line plotted. Find its gradient.`,
      `From the plotted ${kindWord} line of worst fit between ${fmtGiven(x1, exp.xUnit)} and ${fmtGiven(x2, exp.xUnit)} in ${exp.title}, determine Δy / Δx.`,
    ];
    const stem = stems[ctx.formatIndex % stems.length];
    const options = buildMcqOptions(ctx.rng, mWorst, exp.slopeUnit, [
      {
        value: y2 / x2,
        rationale:
          "Computes the secant y₂ / x₂ as though the worst-fit line passed through the origin (0, 0) rather than (x₁, y₁).",
      },
      {
        value: (y2 - y1) / x2,
        rationale:
          "Subtracts y₁ in the numerator but divides by x₂ instead of the horizontal span (x₂ − x₁).",
      },
      {
        value: (x2 - x1) / (y2 - y1),
        rationale:
          "Inverts Δx / Δy instead of evaluating Δy / Δx.",
      },
      {
        value: (y2 + y1) / (x2 - x1),
        rationale:
          "Adds the endpoint ordinates (y₂ + y₁) instead of computing their difference (y₂ − y₁).",
      },
    ]);
    const correctOpt = options.find((o) => o.isCorrect)!;
    return {
      id: ctx.id,
      conceptId,
      templateArchetype,
      seed: ctx.seed,
      syllabi,
      format: "mcq",
      difficulty: ctx.difficulty,
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities: ["gradient"],
      targetQuantityKey: "gradient",
      questionPlan: makeMcqPlan(
        "Calculate gradient of an acceptable line of worst fit spanning error-bar extremes across a nonzero lower abscissa",
        [
          "secant-from-origin-ignoring-lower-endpoint",
          "forgetting-lower-abscissa-subtraction-in-run",
          "reciprocal-run-over-rise-inversion",
        ],
        ["worst-fit line joins opposite error-bar bounds"],
      ),
      stem,
      options,
      workedSolution: `At x₁ = ${x1} ${exp.xUnit}, y₁ = ${y1} ${exp.yUnit}; at x₂ = ${x2} ${exp.xUnit}, y₂ = ${y2} ${exp.yUnit}. Worst-fit gradient m_worst = (${y2} − ${y1}) / (${x2} − ${x1}) = ${fmt3(mWorst, exp.slopeUnit)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates Δy / Δx = (${y2} − ${y1}) / (${x2} − ${x1}) = ${fmt3(mWorst, exp.slopeUnit)} (${correctOpt.label}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  const structStems = [
    `In ${exp.title}, vertical error bars on the first (${fmtGiven(x1, exp.xUnit)}) and last (${fmtGiven(x2, exp.xUnit)}) data points are used to draw the ${kindWord} acceptable line of worst fit shown on the graph.`,
    `To bound gradient uncertainty in ${exp.title}, a student plots the ${kindWord} line of worst fit through the error-bar extremes between ${fmtGiven(x1, exp.xUnit)} and ${fmtGiven(x2, exp.xUnit)}.`,
    `During data analysis for ${exp.title}, opposite ends of the uncertainty bars at ${fmtGiven(x1, exp.xUnit)} and ${fmtGiven(x2, exp.xUnit)} are joined to form the ${kindWord} worst-fit line below.`,
    `The plotted line represents the ${kindWord} acceptable worst-fit gradient spanning ${fmtGiven(x1, exp.xUnit)} to ${fmtGiven(x2, exp.xUnit)} in ${exp.title}.`,
    `Uncertainty propagation in ${exp.title} is carried out graphically using the ${kindWord} line of worst fit drawn from ${fmtGiven(x1, exp.xUnit)} to ${fmtGiven(x2, exp.xUnit)}.`,
    `Refer to the ${kindWord} worst-fit construction across ${fmtGiven(x1, exp.xUnit)} to ${fmtGiven(x2, exp.xUnit)} obtained in ${exp.title}.`,
    `A laboratory report for ${exp.title} includes the ${kindWord} error-bar line of worst fit graphed between ${fmtGiven(x1, exp.xUnit)} and ${fmtGiven(x2, exp.xUnit)}.`,
  ];

  return {
    id: ctx.id,
    conceptId,
    templateArchetype,
    seed: ctx.seed,
    syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "graphs",
    scenarioSpec,
    hiddenQuantities: ["yMax", "gradient"],
    questionPlan: makeStructuredPlan(
      "Read upper error-bar extreme ordinate and determine gradient of the plotted line of worst fit",
      [
        "read ordinate of upper error-bar vertex at maximum abscissa",
        "compute worst-fit gradient across full horizontal span between first and last points",
      ],
      ["linear worst-case uncertainty propagation"],
    ),
    stem: structStems[ctx.formatIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: `Read from the graph the ${exp.yLabel} coordinate at ${fmtGiven(x2, exp.xUnit)} on the worst-fit line.`,
        marks: 1,
        targetQuantityKey: "yMax",
        expectedAnswer: fmt3(y2, exp.yUnit),
        workingSteps: [
          `At x₂ = ${x2} ${exp.xUnit}, the line reaches y₂ = ${fmt3(y2, exp.yUnit)}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the gradient of this ${kindWord} line of worst fit between ${fmtGiven(x1, exp.xUnit)} and ${fmtGiven(x2, exp.xUnit)}.`,
        marks: 3,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "gradient",
        expectedAnswer: fmt3(mWorst, exp.slopeUnit),
        workingSteps: [
          `Read lower vertex y₁ = ${y1} ${exp.yUnit} at x₁ = ${x1} ${exp.xUnit}.`,
          `m_worst = (${y2} − ${y1}) / (${x2} − ${x1}) = ${fmt3(mWorst, exp.slopeUnit)}.`,
        ],
      },
    ],
    workedSolution: `(a) At ${x2} ${exp.xUnit}, y₂ = ${fmt3(y2, exp.yUnit)}. (b) Worst-fit gradient = (${y2} − ${y1}) / (${x2} − ${x1}) = ${fmt3(mWorst, exp.slopeUnit)}.`,
    markScheme: [
      {
        code: "A1",
        partId: "a",
        criterion: `Reads y₂ = ${fmt3(y2, exp.yUnit)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Reads y₁ = ${y1} ${exp.yUnit} at x₁ = ${x1} ${exp.xUnit} and forms Δy / Δx.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Subtracts x₁ = ${x1} ${exp.xUnit} in the denominator (${x2} − ${x1}).`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${fmt3(mWorst, exp.slopeUnit)}.`,
        marks: 1,
      },
    ],
    totalMarks: 4,
  };
}

type ArchetypeBuilder = (ctx: ItemBuildContext) => CandidateQuestionInput;

const ARCHETYPE_BUILDERS: readonly ArchetypeBuilder[] = [
  buildSignedReboundItem,
  buildTrapezoidJourneyItem,
  buildDisplacementTimeItem,
  buildAccelerationTimeItem,
  buildMomentumTimeItem,
  buildForceTimeImpulseItem,
  buildForceDisplacementWorkItem,
  buildSemilogDecayItem,
  buildHookeSpringItem,
  buildStressStrainItem,
  buildNonOhmicCharacteristicItem,
  buildTerminalPdCellItem,
  buildResistivityLinearizationItem,
  buildGravityLinearizationItem,
  buildInverseSquareCoulombItem,
  buildWorstFitErrorBarItem,
];

/**
 * Deterministically generates solver-compatible `graphs` domain candidates
 * (~65% Paper 1 `mcq`, ~35% Paper 2 multipart `structured`) across 16 distinct
 * `(conceptId, templateArchetype)` family groups spanning IB (SL/HL), UK A-Level
 * (Y12/Y13), and NCUK IFY (IFY-S1/IFY-S2/IFY).
 */
export function generateGraphsCandidates(
  options: GraphsGeneratorOptions = {},
): CandidateQuestionInput[] {
  const baseSeed = Number.isInteger(options.seed) ? options.seed! : 20261117;
  const count =
    options.count !== undefined
      ? Math.max(0, Math.trunc(options.count))
      : 320;
  const mcqRatio =
    options.mcqRatio !== undefined
      ? Math.min(1, Math.max(0, options.mcqRatio))
      : 0.65;
  const idPrefix = options.idPrefix?.trim() || "sp-graphs";

  if (count === 0) {
    return [];
  }

  const targetMcqCount = Math.round(count * mcqRatio);
  const numArchetypes = ARCHETYPE_BUILDERS.length;
  const perArchetypeCounts = new Array<number>(numArchetypes).fill(0);
  const perArchetypeMcqCounts = new Array<number>(numArchetypes).fill(0);
  const perArchetypeStructCounts = new Array<number>(numArchetypes).fill(0);
  const candidates: CandidateQuestionInput[] = [];

  // Distribute MCQ vs structured smoothly across all 16 archetypes via Bresenham accumulator
  let mcqAssigned = 0;
  for (let i = 0; i < count; i += 1) {
    const archetypeIdx = i % numArchetypes;
    const variantIndex = perArchetypeCounts[archetypeIdx];
    perArchetypeCounts[archetypeIdx] += 1;

    const remainingSlots = count - i;
    const remainingMcq = targetMcqCount - mcqAssigned;
    let format: QuestionFormat;
    if (remainingMcq <= 0) {
      format = "structured";
    } else if (remainingMcq >= remainingSlots) {
      format = "mcq";
    } else {
      const idealSoFar = ((i + 1) * targetMcqCount) / count;
      format = mcqAssigned < Math.round(idealSoFar) ? "mcq" : "structured";
    }
    let formatIndex: number;
    if (format === "mcq") {
      mcqAssigned += 1;
      formatIndex = perArchetypeMcqCounts[archetypeIdx];
      perArchetypeMcqCounts[archetypeIdx] += 1;
    } else {
      formatIndex = perArchetypeStructCounts[archetypeIdx];
      perArchetypeStructCounts[archetypeIdx] += 1;
    }

    const itemSeed = baseSeed + i * 97 + archetypeIdx * 7919;
    const rng = createRng(itemSeed);
    const difficulty = selectDifficulty(variantIndex + archetypeIdx);
    const paddedIndex = String(i + 1).padStart(4, "0");
    const fmtSlug = format === "mcq" ? "mcq" : "struct";
    const id = `${idPrefix}-${paddedIndex}-${fmtSlug}`;

    const builder = ARCHETYPE_BUILDERS[archetypeIdx];
    candidates.push(
      builder({
        id,
        seed: itemSeed,
        format,
        difficulty,
        variantIndex,
        formatIndex,
        rng,
      }),
    );
  }

  return candidates;
}
