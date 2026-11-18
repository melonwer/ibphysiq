import {
  getCompatibleSyllabiForConcept,
  QuestionFormat,
} from "@/lib/constants/syllabi";

import { formatSignificantFigures } from "../numeric-checker";
import { verifyCandidateWithGate } from "../package-gate";
import {
  CandidateQuestionInput,
  CandidateQuestionPlan,
  MarkSchemePoint,
  MCQ_OPTION_LABELS,
  McqOptionItem,
  QUESTION_DIFFICULTIES,
  QuestionDifficulty,
  RequiredGivenSpec,
  StructuredQuestionPart,
  SyllabusTag,
} from "../types";

export interface CircuitsArchetypeSpec {
  readonly conceptId:
    | "kirchhoff-dc-circuits"
    | "potential-divider-sensors"
    | "emf-internal-resistance"
    | "resistivity-ohmic-conductors"
    | "charge-current-potential-difference";
  readonly templateArchetype: string;
  readonly defaultMcqCount: number;
  readonly defaultStructuredCount: number;
}

export const CIRCUITS_GENERATOR_ARCHETYPES: readonly CircuitsArchetypeSpec[] = [
  {
    conceptId: "kirchhoff-dc-circuits",
    templateArchetype: "mixed-series-parallel-branch-power",
    defaultMcqCount: 14,
    defaultStructuredCount: 8,
  },
  {
    conceptId: "kirchhoff-dc-circuits",
    templateArchetype: "kirchhoff-junction-three-branch-network",
    defaultMcqCount: 14,
    defaultStructuredCount: 8,
  },
  {
    conceptId: "kirchhoff-dc-circuits",
    templateArchetype: "opposing-series-cells-kirchhoff-loop",
    defaultMcqCount: 14,
    defaultStructuredCount: 8,
  },
  {
    conceptId: "kirchhoff-dc-circuits",
    templateArchetype: "non-ideal-voltmeter-ammeter-loading",
    defaultMcqCount: 15,
    defaultStructuredCount: 7,
  },
  {
    conceptId: "potential-divider-sensors",
    templateArchetype: "ldr-illumination-divider-stage",
    defaultMcqCount: 14,
    defaultStructuredCount: 8,
  },
  {
    conceptId: "potential-divider-sensors",
    templateArchetype: "ntc-thermistor-divider-calibration",
    defaultMcqCount: 15,
    defaultStructuredCount: 7,
  },
  {
    conceptId: "potential-divider-sensors",
    templateArchetype: "sensor-bridge-loaded-divider",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
  },
  {
    conceptId: "emf-internal-resistance",
    templateArchetype: "cell-terminal-pd-and-lost-volts",
    defaultMcqCount: 15,
    defaultStructuredCount: 7,
  },
  {
    conceptId: "emf-internal-resistance",
    templateArchetype: "two-point-vi-emf-internal-resistance",
    defaultMcqCount: 14,
    defaultStructuredCount: 8,
  },
  {
    conceptId: "emf-internal-resistance",
    templateArchetype: "non-ideal-battery-parallel-network-energy",
    defaultMcqCount: 14,
    defaultStructuredCount: 8,
  },
  {
    conceptId: "resistivity-ohmic-conductors",
    templateArchetype: "cylindrical-wire-resistivity-circuit",
    defaultMcqCount: 14,
    defaultStructuredCount: 8,
  },
  {
    conceptId: "resistivity-ohmic-conductors",
    templateArchetype: "wire-sensor-series-divider-circuit",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
  },
  {
    conceptId: "resistivity-ohmic-conductors",
    templateArchetype: "parallel-composite-wires-network",
    defaultMcqCount: 13,
    defaultStructuredCount: 8,
  },
  {
    conceptId: "charge-current-potential-difference",
    templateArchetype: "dc-load-energy-and-power-transfer",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
  },
  {
    conceptId: "charge-current-potential-difference",
    templateArchetype: "multi-branch-power-energy-budget",
    defaultMcqCount: 13,
    defaultStructuredCount: 8,
  },
] as const;

export interface GenerateCircuitsOptions {
  readonly count?: number;
  readonly seed?: number;
  readonly mcqRatio?: number;
  readonly generatorModel?: string;
}

interface DistractorCandidate {
  readonly value: number;
  readonly rationale: string;
}

interface WireAlloySpec {
  readonly name: string;
  readonly rho: number;
  readonly rhoText: string;
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

const WIRE_ALLOYS: readonly WireAlloySpec[] = [
  { name: "nichrome", rho: 1.1e-6, rhoText: "1.10 × 10⁻⁶ Ω m" },
  { name: "constantan", rho: 4.9e-7, rhoText: "4.90 × 10⁻⁷ Ω m" },
  { name: "manganin", rho: 4.8e-7, rhoText: "4.80 × 10⁻⁷ Ω m" },
  { name: "stainless-steel", rho: 7.2e-7, rhoText: "7.20 × 10⁻⁷ Ω m" },
  { name: "kanthal", rho: 1.45e-6, rhoText: "1.45 × 10⁻⁶ Ω m" },
  { name: "cupronickel", rho: 3.8e-7, rhoText: "3.80 × 10⁻⁷ Ω m" },
  { name: "titanium", rho: 4.2e-7, rhoText: "4.20 × 10⁻⁷ Ω m" },
  { name: "platinum-iridium", rho: 2.5e-7, rhoText: "2.50 × 10⁻⁷ Ω m" },
];

const PARALLEL_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [6, 12],
  [4, 12],
  [10, 15],
  [8, 24],
  [12, 24],
  [15, 30],
  [20, 30],
  [18, 36],
  [9, 18],
  [20, 60],
  [12, 36],
  [16, 48],
  [24, 48],
  [30, 60],
  [40, 60],
  [14, 35],
  [21, 28],
  [15, 60],
  [18, 9],
  [36, 12],
  [45, 90],
  [28, 84],
];

const PARALLEL_TRIPLES: ReadonlyArray<readonly [number, number, number]> = [
  [6, 12, 4],
  [12, 24, 8],
  [10, 15, 30],
  [20, 30, 60],
  [18, 36, 12],
  [15, 10, 6],
  [24, 12, 8],
  [30, 20, 12],
  [40, 60, 24],
  [16, 24, 48],
  [9, 18, 36],
  [14, 21, 42],
];

function createPrng(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(items: readonly T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)];
}

function randInt(min: number, max: number, rand: () => number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function aOrAn(phrase: string, capitalize = false): string {
  const trimmed = phrase.trim();
  const useAn =
    /^(?:[aeiouAEIOU](?!ni\b|se\b|v\b|ro\b)|(?:NTC|LDR|ROV|LED|ECG|MPPT|HVAC|RF|RC|LC|AC|IR)\b)/.test(
      trimmed,
    ) && !/^(?:uni|use|uv|eu|one)/i.test(trimmed);
  const article = useAn ? (capitalize ? "An" : "an") : capitalize ? "A" : "a";
  return `${article} ${trimmed}`;
}

export function formatPhysicsQuantity(value: number, unit = ""): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot format non-finite quantity: ${String(value)}`);
  }
  const abs = Math.abs(value);
  let numText: string;
  if (abs === 0) {
    numText = "0";
  } else if (abs >= 0.01 && abs < 10_000) {
    const raw = Number(value.toPrecision(14)).toPrecision(3);
    if (raw.includes("e")) {
      const [m, exp] = raw.split("e");
      const sup = [...exp.replace("+", "")]
        .map((c) => SUPERSCRIPT_DIGITS[c] ?? c)
        .join("");
      numText = `${m} × 10${sup}`;
    } else {
      numText = raw;
    }
  } else {
    const expStr = Number(value.toPrecision(14)).toExponential(2);
    const [mantissa, expRaw] = expStr.split("e");
    const cleanExp = String(Number.parseInt(expRaw, 10));
    const sup = [...cleanExp].map((c) => SUPERSCRIPT_DIGITS[c] ?? c).join("");
    numText = `${mantissa} × 10${sup}`;
  }
  return unit ? `${numText} ${unit}` : numText;
}

function buildSyllabusTags(
  conceptId: string,
  format: QuestionFormat,
  slotIndex: number,
): SyllabusTag[] {
  const compatible = getCompatibleSyllabiForConcept(conceptId, {
    format,
    excludeOptionTopics: true,
  });
  return compatible.map((mapping, mIdx) => {
    const chosenLevel =
      mapping.levels[(slotIndex + mIdx) % mapping.levels.length];
    return {
      syllabus: mapping.syllabus,
      level: chosenLevel,
      topicId: mapping.topicIds[0],
      subtopicId: mapping.subtopicIds[0],
    };
  });
}

function pickDifficulty(slotIndex: number): QuestionDifficulty {
  return QUESTION_DIFFICULTIES[slotIndex % QUESTION_DIFFICULTIES.length];
}

function valuesDistinctEnough(a: number, b: number, minRelDiff = 0.035): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  if (Math.abs(a - b) / denom < minRelDiff) return false;
  return formatSignificantFigures(a, 3) !== formatSignificantFigures(b, 3);
}

function assembleMcqOptions(
  correctValue: number,
  unit: string,
  candidates: readonly DistractorCandidate[],
  slotIndex = 0,
): McqOptionItem[] | undefined {
  if (!Number.isFinite(correctValue) || correctValue <= 0) {
    return undefined;
  }
  const smaller = candidates.filter(
    (c) => Number.isFinite(c.value) && c.value > 0 && c.value < correctValue,
  );
  const larger = candidates.filter(
    (c) => Number.isFinite(c.value) && c.value > correctValue,
  );
  const desiredSmallerCount = ((slotIndex % 4) + 4) % 4;
  const orderedPool: DistractorCandidate[] = [
    ...smaller.slice(0, desiredSmallerCount),
    ...larger.slice(0, 3 - desiredSmallerCount),
    ...smaller.slice(desiredSmallerCount),
    ...larger.slice(3 - desiredSmallerCount),
  ];

  const chosen: Array<{
    value: number;
    text: string;
    isCorrect: boolean;
    distractorRationale?: string;
  }> = [
    {
      value: correctValue,
      text: formatPhysicsQuantity(correctValue, unit),
      isCorrect: true,
    },
  ];

  for (const cand of orderedPool) {
    if (chosen.length === 4) break;
    if (!Number.isFinite(cand.value) || cand.value <= 0) continue;
    const distinctFromAll = chosen.every((existing) =>
      valuesDistinctEnough(cand.value, existing.value, 0.035),
    );
    if (!distinctFromAll) continue;
    const formatted = formatPhysicsQuantity(cand.value, unit);
    if (chosen.some((existing) => existing.text === formatted)) continue;
    chosen.push({
      value: cand.value,
      text: formatted,
      isCorrect: false,
      distractorRationale: cand.rationale,
    });
  }

  if (chosen.length !== 4) {
    return undefined;
  }

  chosen.sort((a, b) => a.value - b.value);

  return chosen.map((entry, idx) => ({
    label: MCQ_OPTION_LABELS[idx],
    text: entry.text,
    isCorrect: entry.isCorrect,
    ...(entry.distractorRationale
      ? { distractorRationale: entry.distractorRationale }
      : {}),
  }));
}

function buildPreSolvePlan(
  conceptId: string,
  templateArchetype: string,
  format: QuestionFormat,
  targetKey: string,
  partTargets?: readonly string[],
): CandidateQuestionPlan {
  if (format === "mcq") {
    return {
      targetSummary: `Evaluate ${conceptId} under ${templateArchetype} targeting solver quantity ${targetKey}`,
      distractorStrategy: [
        `network-reduction-misconception::${templateArchetype}`,
        `voltage-or-current-division-slip::${targetKey}`,
        `omitted-series-or-internal-drop::${conceptId}`,
      ],
      assumptions: [
        "Connecting leads have negligible electrical resistance unless stated otherwise.",
      ],
    };
  }
  return {
    targetSummary: `Assess multi-step ${conceptId} reasoning in ${templateArchetype}`,
    subpartStrategy: (partTargets ?? []).map(
      (key, idx) => `step-${idx + 1}::solve-${key}`,
    ),
    assumptions: [
      "Connecting leads have negligible electrical resistance unless stated otherwise.",
    ],
  };
}

// ============================================================================
// Archetype 1: kirchhoff-dc-circuits :: mixed-series-parallel-branch-power
// ============================================================================

const MIXED_BRANCH_CONTEXTS = [
  "de-icing heater manifold on a weather mast",
  "benchtop calibration rig in a physics lab",
  "dual-zone incubator heating stage",
  "submersible ROV auxiliary power bus",
  "precision optical-table thermal stabiliser",
  "spacecraft payload warm-up network",
  "greenhouse misting-valve controller",
  "vacuum-chamber bakeout resistor assembly",
  "traction-motor dynamic braking test bank",
  "portable spectrometer lamp ballast",
  "balloon telemetry heater loop",
  "industrial kiln damper actuator network",
  "cryogenic transfer-line warm-up harness",
  "wind-vane frost-protection resistor block",
  "cleanroom airlock interlock load bank",
  "marine radar waveguide dryer circuit",
  "battery-cycler dummy load module",
  "laser chiller bypass resistor network",
  "railway point-heater distribution box",
  "microplate reader warm-up stage",
  "geothermal logger downhole heater",
  "telescope mirror dew-heater network",
  "fuel-injector test-bench ballast circuit",
  "ultrasonic bath pre-heater assembly",
] as const;

function buildMixedSeriesParallelItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const pair = pick(PARALLEL_PAIRS, rand);
  const r1 = pair[0];
  const r2 = pair[1];
  const rPar = (r1 * r2) / (r1 + r2);
  const rSer = randInt(2, 18, rand);
  const rTot = rSer + rPar;
  const currentScale = [0.5, 0.8, 1.2, 1.5, 1.6, 2.0, 2.4, 2.5, 3.0, 3.5][
    randInt(0, 9, rand)
  ];
  const voltageV = Number((rTot * currentScale).toFixed(2));
  const iTot = voltageV / rTot;
  const vPar = iTot * rPar;
  const p1 = (vPar * vPar) / r1;
  const p2 = (vPar * vPar) / r2;

  const ctx = MIXED_BRANCH_CONTEXTS[slotIndex % MIXED_BRANCH_CONTEXTS.length];
  const syllabi = buildSyllabusTags("kirchhoff-dc-circuits", format, slotIndex);
  const difficulty = pickDifficulty(slotIndex);
  const kind = slotIndex % 2 === 0 ? "branch-heater" : "resistor-network";
  const hiddenQuantities = [
    "parallelOhm",
    "totalOhm",
    "totalCurrentA",
    "branchVoltageV",
    "branchOnePowerW",
    "branchTwoPowerW",
  ];

  if (format === "mcq") {
    const mode = slotIndex % 4;
    let targetKey: string;
    let targetVal: number;
    let unit: string;
    let questionClause: string;
    let distractors: DistractorCandidate[];
    let workedSolution: string;
    let criterion: string;

    if (mode === 0) {
      targetKey = "branchTwoPowerW";
      targetVal = p2;
      unit = "W";
      questionClause = `What electrical power is dissipated in the ${r2} Ω parallel resistor?`;
      distractors = [
        {
          value: (voltageV / (rSer + r1 + r2)) ** 2 * r2,
          rationale: `Treats the ${r1} Ω and ${r2} Ω parallel branches as if they were connected in series.`,
        },
        {
          value: p1,
          rationale: `Calculates the power dissipated in the ${r1} Ω resistor rather than the ${r2} Ω resistor.`,
        },
        {
          value: iTot * iTot * r2,
          rationale: `Substitutes the unsplit supply current into P = I²R for the ${r2} Ω branch instead of dividing current at the junction.`,
        },
        {
          value: (voltageV * voltageV) / r2,
          rationale: `Applies the full ${voltageV} V supply potential difference across the ${r2} Ω branch, ignoring the drop across the ${rSer} Ω series resistor.`,
        },
      ];
      workedSolution = `Parallel equivalent R_p = (${r1} × ${r2})/(${r1} + ${r2}) = ${formatPhysicsQuantity(rPar, "Ω")}. Total resistance R_tot = ${rSer} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}. Supply current I = ${voltageV} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iTot, "A")}. Parallel p.d. V_p = ${formatPhysicsQuantity(iTot)} × ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(vPar, "V")}. Power in ${r2} Ω resistor P = V_p² / ${r2} = ${formatPhysicsQuantity(p2, "W")}.`;
      criterion = `Finds V_p = ${formatPhysicsQuantity(vPar, "V")} and calculates P = ${formatPhysicsQuantity(p2, "W")}.`;
    } else if (mode === 1) {
      targetKey = "branchOnePowerW";
      targetVal = p1;
      unit = "W";
      questionClause = `How much thermal power is dissipated in the ${r1} Ω branch resistor?`;
      distractors = [
        {
          value: (voltageV / (rSer + r1 + r2)) ** 2 * r1,
          rationale: `Adds all three resistances directly in series before applying P = I²R.`,
        },
        {
          value: p2,
          rationale: `Computes the power dissipated in the ${r2} Ω branch instead of the ${r1} Ω branch.`,
        },
        {
          value: iTot * iTot * r1,
          rationale: `Uses the main-branch current directly in P = I²R without accounting for current splitting between parallel branches.`,
        },
        {
          value: (voltageV * voltageV) / r1,
          rationale: `Assumes the entire ${voltageV} V source voltage appears across the ${r1} Ω resistor without subtracting the series drop.`,
        },
      ];
      workedSolution = `R_p = (${r1} × ${r2})/(${r1} + ${r2}) = ${formatPhysicsQuantity(rPar, "Ω")}, giving R_tot = ${rSer} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}. Main current I = ${voltageV} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iTot, "A")}, so V_p = I R_p = ${formatPhysicsQuantity(vPar, "V")} and P_1 = V_p² / ${r1} = ${formatPhysicsQuantity(p1, "W")}.`;
      criterion = `Determines parallel voltage ${formatPhysicsQuantity(vPar, "V")} and obtains ${formatPhysicsQuantity(p1, "W")}.`;
    } else if (mode === 2) {
      targetKey = "branchVoltageV";
      targetVal = vPar;
      unit = "V";
      questionClause = `What potential difference develops across the parallel ${r1} Ω and ${r2} Ω section?`;
      distractors = [
        {
          value: iTot * rSer,
          rationale: `Calculates the potential drop across the ${rSer} Ω series resistor rather than across the parallel stage.`,
        },
        {
          value: (voltageV * (r1 + r2)) / (rSer + r1 + r2),
          rationale: `Adds the ${r1} Ω and ${r2} Ω parallel resistances directly instead of combining their reciprocals.`,
        },
        {
          value: (voltageV * r1) / (rSer + r1),
          rationale: `Ignores the shunting effect of the ${r2} Ω parallel branch when applying the potential-divider equation.`,
        },
        {
          value: (voltageV * r2) / (rSer + r2),
          rationale: `Omits the ${r1} Ω branch from the parallel combination.`,
        },
      ];
      workedSolution = `Parallel resistance R_p = (${r1} × ${r2})/(${r1} + ${r2}) = ${formatPhysicsQuantity(rPar, "Ω")}. By potential division, V_p = ${voltageV} × ${formatPhysicsQuantity(rPar)} / (${rSer} + ${formatPhysicsQuantity(rPar)}) = ${formatPhysicsQuantity(vPar, "V")}.`;
      criterion = `Reduces parallel branches to ${formatPhysicsQuantity(rPar, "Ω")} and finds V_p = ${formatPhysicsQuantity(vPar, "V")}.`;
    } else {
      targetKey = "totalCurrentA";
      targetVal = iTot;
      unit = "A";
      questionClause = "What current is drawn from the DC supply?";
      distractors = [
        {
          value: voltageV / (rSer + r1 + r2),
          rationale: `Sums ${rSer} Ω, ${r1} Ω, and ${r2} Ω in series instead of combining the parallel branches via reciprocals.`,
        },
        {
          value: vPar / Math.max(r1, r2),
          rationale: `Finds only the current in the ${Math.max(r1, r2)} Ω branch rather than the total supply current.`,
        },
        {
          value: voltageV / rPar,
          rationale: `Calculates current as if only the parallel combination were connected across the ${voltageV} V source, omitting the ${rSer} Ω series resistor.`,
        },
        {
          value: voltageV / (rSer + 1 / rPar),
          rationale: `Adds 1/R_1 + 1/R_2 directly to the ${rSer} Ω series resistance without inverting the reciprocal sum.`,
        },
      ];
      workedSolution = `Equivalent parallel resistance R_p = (${r1} × ${r2})/(${r1} + ${r2}) = ${formatPhysicsQuantity(rPar, "Ω")}. Total circuit resistance R_tot = ${rSer} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}. Supply current I = ${voltageV} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iTot, "A")}.`;
      criterion = `Combines ${rSer} Ω with R_p = ${formatPhysicsQuantity(rPar, "Ω")} to obtain I = ${formatPhysicsQuantity(iTot, "A")}.`;
    }

    const stemTemplates = [
      `In ${aOrAn(ctx)}, an ideal ${voltageV} V DC source drives a ${rSer} Ω limiting resistor connected in series with parallel ${r1} Ω and ${r2} Ω resistors, as shown. ${questionClause}`,
      `The schematic represents ${aOrAn(ctx)} supplied at ${voltageV} V with negligible internal resistance. A ${rSer} Ω resistor lies in the main feed ahead of parallel ${r1} Ω and ${r2} Ω branches. ${questionClause}`,
      `While bench-testing ${aOrAn(ctx)}, an engineer wires a ${rSer} Ω resistor in series with a parallel pair of ${r1} Ω and ${r2} Ω resistors across an ideal ${voltageV} V supply. ${questionClause}`,
      `An ideal ${voltageV} V power unit energises ${aOrAn(ctx)} made from a ${rSer} Ω series element followed by ${r1} Ω and ${r2} Ω resistors in parallel, as illustrated. ${questionClause}`,
      `Parallel resistors of ${r1} Ω and ${r2} Ω inside ${aOrAn(ctx)} receive current through a ${rSer} Ω series resistor from an ideal ${voltageV} V cell. ${questionClause}`,
      `For the ${ctx} shown, negligible-resistance leads connect an ideal ${voltageV} V terminal pair to a ${rSer} Ω resistor in series with ${r1} Ω and ${r2} Ω parallel loads. ${questionClause}`,
      `${aOrAn(ctx, true)} operates from an ideal ${voltageV} V rail; current traverses a ${rSer} Ω ballast resistor before splitting across ${r1} Ω and ${r2} Ω parallel arms. ${questionClause}`,
      `Examine the circuit for ${aOrAn(ctx)}, where a ${rSer} Ω resistor stands in series with parallel ${r1} Ω and ${r2} Ω branches across an ideal ${voltageV} V source. ${questionClause}`,
    ];
    const stem = stemTemplates[slotIndex % stemTemplates.length];

    const options = assembleMcqOptions(targetVal, unit, distractors, slotIndex);
    if (!options) return undefined;

    return {
      id,
      conceptId: "kirchhoff-dc-circuits",
      templateArchetype: "mixed-series-parallel-branch-power",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind,
        voltageV,
        seriesOhm: rSer,
        branchOhm: [r1, r2],
      },
      hiddenQuantities,
      targetQuantityKey: targetKey,
      questionPlan: buildPreSolvePlan(
        "kirchhoff-dc-circuits",
        "mixed-series-parallel-branch-power",
        "mcq",
        targetKey,
      ),
      stem,
      options,
      workedSolution,
      markScheme: [{ code: "A1", criterion, marks: 1 }],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structStems = [
    `${aOrAn(ctx, true)} uses an ideal ${voltageV} V DC supply connected to a ${rSer} Ω series resistor and a parallel combination of ${r1} Ω and ${r2} Ω resistors, as shown.`,
    `The diagram illustrates ${aOrAn(ctx)} powered by an ideal ${voltageV} V source; current passes through a ${rSer} Ω resistor before dividing between parallel ${r1} Ω and ${r2} Ω branches.`,
    `In ${aOrAn(ctx)}, parallel resistors of resistance ${r1} Ω and ${r2} Ω are wired in series with a ${rSer} Ω resistor across an ideal ${voltageV} V DC terminal pair.`,
    `During commissioning of ${aOrAn(ctx)}, an ideal ${voltageV} V supply feeds a ${rSer} Ω main-branch resistor followed by parallel ${r1} Ω and ${r2} Ω resistive loads.`,
    `The resistive network of ${aOrAn(ctx)} places ${r1} Ω and ${r2} Ω elements in parallel, fed via a ${rSer} Ω series ballast from an ideal ${voltageV} V cell.`,
    `An ideal ${voltageV} V DC rail supplies ${aOrAn(ctx)} in which a ${rSer} Ω resistor is connected in series with ${r1} Ω and ${r2} Ω parallel arms.`,
    `To regulate heating in ${aOrAn(ctx)}, engineers connect parallel ${r1} Ω and ${r2} Ω resistors in series with a ${rSer} Ω drop resistor across an ideal ${voltageV} V source.`,
    `Refer to the schematic of ${aOrAn(ctx)}: an ideal ${voltageV} V source drives a ${rSer} Ω resistor in series with a parallel pair of ${r1} Ω and ${r2} Ω resistors.`,
  ];
  const stem = structStems[slotIndex % structStems.length];
  const askSecondBranch = slotIndex % 2 === 0;
  const targetPowerKey = askSecondBranch ? "branchTwoPowerW" : "branchOnePowerW";
  const targetPowerVal = askSecondBranch ? p2 : p1;
  const targetBranchOhm = askSecondBranch ? r2 : r1;

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: "Calculate the total equivalent resistance connected across the DC supply.",
      marks: 2,
      targetQuantityKey: "totalOhm",
      expectedAnswer: formatPhysicsQuantity(rTot, "Ω"),
      workingSteps: [
        `R_p = (${r1} × ${r2}) / (${r1} + ${r2}) = ${formatPhysicsQuantity(rPar, "Ω")}.`,
        `R_tot = ${rSer} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}.`,
      ],
    },
    {
      partId: "b",
      prompt: "Determine the potential difference across the parallel resistor combination.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "branchVoltageV",
      expectedAnswer: formatPhysicsQuantity(vPar, "V"),
      workingSteps: [
        `Supply current I = ${voltageV} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iTot, "A")}.`,
        `V_p = I × R_p = ${formatPhysicsQuantity(iTot)} × ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(vPar, "V")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Calculate the power dissipated in the ${targetBranchOhm} Ω resistor.`,
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: targetPowerKey,
      expectedAnswer: formatPhysicsQuantity(targetPowerVal, "W"),
      workingSteps: [
        `P = V_p² / R = (${formatPhysicsQuantity(vPar)})² / ${targetBranchOhm} = ${formatPhysicsQuantity(targetPowerVal, "W")}.`,
      ],
    },
  ];

  const markScheme: MarkSchemePoint[] = [
    {
      code: "M1",
      partId: "a",
      criterion: `Evaluates parallel resistance R_p = ${formatPhysicsQuantity(rPar, "Ω")} and adds ${rSer} Ω.`,
      marks: 1,
    },
    {
      code: "A1",
      partId: "a",
      criterion: `Obtains R_tot = ${formatPhysicsQuantity(rTot, "Ω")}.`,
      marks: 1,
    },
    {
      code: "M1",
      partId: "b",
      criterion: `Finds supply current ${formatPhysicsQuantity(iTot, "A")} or applies potential-divider ratio.`,
      marks: 1,
    },
    {
      code: "A1",
      partId: "b",
      criterion: `Obtains V_p = ${formatPhysicsQuantity(vPar, "V")}.`,
      marks: 1,
    },
    {
      code: "M1",
      partId: "c",
      criterion: `Substitutes V_p into P = V_p² / ${targetBranchOhm}.`,
      marks: 1,
    },
    {
      code: "A1",
      partId: "c",
      criterion: `Obtains P = ${formatPhysicsQuantity(targetPowerVal, "W")}.`,
      marks: 1,
    },
  ];

  return {
    id,
    conceptId: "kirchhoff-dc-circuits",
    templateArchetype: "mixed-series-parallel-branch-power",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind,
      voltageV,
      seriesOhm: rSer,
      branchOhm: [r1, r2],
    },
    hiddenQuantities,
    questionPlan: buildPreSolvePlan(
      "kirchhoff-dc-circuits",
      "mixed-series-parallel-branch-power",
      "structured",
      targetPowerKey,
      ["totalOhm", "branchVoltageV", targetPowerKey],
    ),
    stem,
    parts,
    workedSolution: `(a) R_p = (${r1} × ${r2})/(${r1} + ${r2}) = ${formatPhysicsQuantity(rPar, "Ω")}, so R_tot = ${rSer} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}. (b) I = ${voltageV} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iTot, "A")}; V_p = I R_p = ${formatPhysicsQuantity(vPar, "V")}. (c) P = V_p² / ${targetBranchOhm} = ${formatPhysicsQuantity(targetPowerVal, "W")}.`,
    markScheme,
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// Archetype 2: kirchhoff-dc-circuits :: kirchhoff-junction-three-branch-network
// ============================================================================

const JUNCTION_CONTEXTS = [
  "air-quality sensor manifold",
  "dashboard indicator harness",
  "cleanroom fan-status monitor",
  "marine navigation beacon board",
  "railway signalling relay rack",
  "solar observatory actuator bus",
  "Wheatstone reference header",
  "cryostat multi-channel heater block",
  "titration pump manifold",
  "avionics redundant bus monitor",
  "greenhouse louver motor array",
  "subsea valve solenoid header",
  "elevated-tank level-indicator board",
  "automated packaging-line sensor bus",
  "wind-profiler status indicator panel",
  "fermenter sparger control header",
  "accelerator interlock lamp matrix",
  "battery-room ventilation status bus",
  "observatory dome-clamp solenoid rack",
  "microgrid load-shedding relay bank",
  "robotics end-effector power splitter",
  "seismic vault telemetry distribution hub",
] as const;

function buildJunctionThreeBranchItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const syllabi = buildSyllabusTags("kirchhoff-dc-circuits", format, slotIndex);
  const difficulty = pickDifficulty(slotIndex);
  const ctx = JUNCTION_CONTEXTS[slotIndex % JUNCTION_CONTEXTS.length];
  const useSensorAmmeterTopology = slotIndex % 2 === 0;

  if (useSensorAmmeterTopology) {
    const r1 = randInt(3, 18, rand);
    const r2 = randInt(4, 22, rand);
    const rSum12 = r1 + r2;
    let r3 = randInt(5, 30, rand);
    if (r3 === rSum12) r3 += 3;
    const voltageV = randInt(6, 36, rand);
    const i1 = voltageV / rSum12;
    const i2 = voltageV / r3;
    const iTot = i1 + i2;
    const hiddenQuantities = ["firstCurrentA", "otherCurrentA", "totalCurrentA"];

    if (format === "mcq") {
      const distractors: DistractorCandidate[] = [
        {
          value: voltageV / (r1 + r2 + r3),
          rationale: `Adds all three resistances (${r1} Ω + ${r2} Ω + ${r3} Ω) in series instead of applying Kirchhoff's junction law to the parallel branches.`,
        },
        {
          value: i1,
          rationale: `Calculates only the current in the series ${r1} Ω + ${r2} Ω branch and omits the parallel ${r3} Ω branch current.`,
        },
        {
          value: i2,
          rationale: `Finds only the current in the ${r3} Ω branch rather than summing both branch currents at the junction.`,
        },
        {
          value: voltageV / r1 + voltageV / r2 + voltageV / r3,
          rationale: `Treats the ${r1} Ω and ${r2} Ω series resistors as if they were three independent parallel branches across ${voltageV} V.`,
        },
      ];
      const options = assembleMcqOptions(iTot, "A", distractors, slotIndex);
      if (!options) return undefined;

      const stems = [
        `An ideal ${voltageV} V DC supply powers ${aOrAn(ctx)} with two parallel paths, as shown: one path holds ${r1} Ω and ${r2} Ω resistors in series, while the second holds a ${r3} Ω resistor. What current is registered by the ideal ammeter A?`,
        `In the ${ctx} shown, ideal ammeter A measures the main current leaving an ideal ${voltageV} V cell before a junction splits into a ${r1} Ω + ${r2} Ω series arm and a parallel ${r3} Ω arm. What reading appears on ammeter A?`,
        `A technician wires an ideal ${voltageV} V source across ${aOrAn(ctx)} where branch X has ${r1} Ω and ${r2} Ω in series and branch Y has a ${r3} Ω resistor in parallel. Determine the current through ideal ammeter A in the supply line.`,
        `The schematic of ${aOrAn(ctx)} features an ideal ${voltageV} V cell and an ideal ammeter A feeding a ${r3} Ω branch in parallel with a series pair of ${r1} Ω and ${r2} Ω resistors. Calculate the ammeter reading.`,
        `Two parallel branches inside ${aOrAn(ctx)}—one comprising ${r1} Ω and ${r2} Ω in series, the other a single ${r3} Ω resistor—draw current from an ideal ${voltageV} V rail through ideal ammeter A. What does A read?`,
      ];

      return {
        id,
        conceptId: "kirchhoff-dc-circuits",
        templateArchetype: "kirchhoff-junction-three-branch-network",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "circuits",
        scenarioSpec: {
          kind: "sensor-current",
          voltageV,
          branchSeriesOhm: [r1, r2],
          otherOhm: r3,
        },
        hiddenQuantities,
        targetQuantityKey: "totalCurrentA",
        questionPlan: buildPreSolvePlan(
          "kirchhoff-dc-circuits",
          "kirchhoff-junction-three-branch-network",
          "mcq",
          "totalCurrentA",
        ),
        stem: stems[Math.floor(slotIndex / 2) % stems.length],
        options,
        workedSolution: `Composite branch resistance = ${r1} + ${r2} = ${rSum12} Ω, so I_1 = ${voltageV} / ${rSum12} = ${formatPhysicsQuantity(i1, "A")}. Parallel branch current I_2 = ${voltageV} / ${r3} = ${formatPhysicsQuantity(i2, "A")}. By Kirchhoff's junction rule, ammeter reading I_tot = I_1 + I_2 = ${formatPhysicsQuantity(iTot, "A")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Sums branch currents ${formatPhysicsQuantity(i1, "A")} and ${formatPhysicsQuantity(i2, "A")} to obtain ${formatPhysicsQuantity(iTot, "A")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const structStems = [
      `An ideal ${voltageV} V DC source energises ${aOrAn(ctx)} containing an ideal ammeter A in the main line, a series branch of ${r1} Ω and ${r2} Ω resistors, and a parallel ${r3} Ω resistor, as shown.`,
      `The circuit diagram depicts ${aOrAn(ctx)} connected across an ideal ${voltageV} V cell: one parallel path contains ${r1} Ω and ${r2} Ω in series, and the other path contains a ${r3} Ω resistor, with ideal ammeter A in the supply branch.`,
      `Inside ${aOrAn(ctx)}, an ideal ${voltageV} V supply with series ideal ammeter A feeds two parallel branches—a ${r1} Ω resistor in series with a ${r2} Ω resistor, and a separate ${r3} Ω resistor.`,
      `During inspection of ${aOrAn(ctx)}, a student observes an ideal ${voltageV} V cell and ideal ammeter A supplying a ${r3} Ω branch alongside a parallel branch made of ${r1} Ω and ${r2} Ω series resistors.`,
    ];

    return {
      id,
      conceptId: "kirchhoff-dc-circuits",
      templateArchetype: "kirchhoff-junction-three-branch-network",
      seed,
      syllabi,
      format: "structured",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "sensor-current",
        voltageV,
        branchSeriesOhm: [r1, r2],
        otherOhm: r3,
      },
      hiddenQuantities,
      questionPlan: buildPreSolvePlan(
        "kirchhoff-dc-circuits",
        "kirchhoff-junction-three-branch-network",
        "structured",
        "totalCurrentA",
        ["firstCurrentA", "otherCurrentA", "totalCurrentA"],
      ),
      stem: structStems[Math.floor(slotIndex / 2) % structStems.length],
      parts: [
        {
          partId: "a",
          prompt: `Calculate the current in the branch containing the ${r1} Ω and ${r2} Ω resistors.`,
          marks: 2,
          targetQuantityKey: "firstCurrentA",
          expectedAnswer: formatPhysicsQuantity(i1, "A"),
          workingSteps: [
            `R_branch = ${r1} + ${r2} = ${rSum12} Ω.`,
            `I_1 = ${voltageV} / ${rSum12} = ${formatPhysicsQuantity(i1, "A")}.`,
          ],
        },
        {
          partId: "b",
          prompt: `Calculate the current in the ${r3} Ω resistor.`,
          marks: 1,
          targetQuantityKey: "otherCurrentA",
          expectedAnswer: formatPhysicsQuantity(i2, "A"),
          workingSteps: [
            `I_2 = ${voltageV} / ${r3} = ${formatPhysicsQuantity(i2, "A")}.`,
          ],
        },
        {
          partId: "c",
          prompt: "Using Kirchhoff's first law, determine the reading on the ideal ammeter A.",
          marks: 2,
          dependsOnPartIds: ["a", "b"],
          targetQuantityKey: "totalCurrentA",
          expectedAnswer: formatPhysicsQuantity(iTot, "A"),
          workingSteps: [
            `By Kirchhoff's junction rule, I_tot = I_1 + I_2 = ${formatPhysicsQuantity(i1)} + ${formatPhysicsQuantity(i2)} = ${formatPhysicsQuantity(iTot, "A")}.`,
          ],
        },
      ],
      workedSolution: `(a) I_1 = ${voltageV} / (${r1} + ${r2}) = ${formatPhysicsQuantity(i1, "A")}. (b) I_2 = ${voltageV} / ${r3} = ${formatPhysicsQuantity(i2, "A")}. (c) By Kirchhoff's first law, I_tot = I_1 + I_2 = ${formatPhysicsQuantity(iTot, "A")}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: `Sums ${r1} Ω and ${r2} Ω in series before dividing ${voltageV} V.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains I_1 = ${formatPhysicsQuantity(i1, "A")}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains I_2 = ${formatPhysicsQuantity(i2, "A")}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "c",
          criterion: "Applies Kirchhoff's junction rule ΣI_in = ΣI_out.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains ammeter reading ${formatPhysicsQuantity(iTot, "A")}.`,
          marks: 1,
        },
      ],
      totalMarks: 5,
      generatorModel,
    };
  }

  // Three parallel branches + series resistor
  const triple = pick(PARALLEL_TRIPLES, rand);
  const [b1, b2, b3] = triple;
  const rPar = 1 / (1 / b1 + 1 / b2 + 1 / b3);
  const rSer = randInt(2, 14, rand);
  const rTot = rSer + rPar;
  const emfV = Number((rTot * (0.6 + 0.4 * randInt(1, 7, rand))).toFixed(2));
  const iTot = emfV / rTot;
  const vPar = iTot * rPar;
  const iBranch1 = vPar / b1;
  const hiddenQuantities = [
    "parallelOhm",
    "externalOhm",
    "totalOhm",
    "totalCurrentA",
    "parallelVoltageV",
    "totalSourcePowerW",
    "branchOneCurrentA",
    "branchOnePowerW",
    "branchTwoCurrentA",
    "branchTwoPowerW",
  ];

  if (format === "mcq") {
    const subSlot = Math.floor(slotIndex / 2);
    const askBranchCurrent = subSlot % 2 === 0;
    const targetKey = askBranchCurrent ? "branchOneCurrentA" : "parallelOhm";
    const targetVal = askBranchCurrent ? iBranch1 : rPar;
    const unit = askBranchCurrent ? "A" : "Ω";
    const distractors: DistractorCandidate[] = askBranchCurrent
      ? [
          {
            value: emfV / ((b1 + b2 + b3) + rSer),
            rationale:
              "Adds all four resistors in series instead of reducing the three parallel branches.",
          },
          {
            value: iTot / 3,
            rationale:
              "Divides the total junction current equally by 3 despite the unequal branch resistances.",
          },
          {
            value: emfV / b1,
            rationale: `Applies the full ${emfV} V source emf across the ${b1} Ω branch, ignoring the potential drop across the ${rSer} Ω series resistor.`,
          },
          {
            value: iTot,
            rationale:
              "Reports the unsplit main-line current instead of the current in the specified parallel branch.",
          },
        ]
      : [
          {
            value: 1 / b1 + 1 / b2 + 1 / b3,
            rationale:
              "Computes total parallel conductance 1/R_1 + 1/R_2 + 1/R_3 in siemens and forgets to take its reciprocal.",
          },
          {
            value: rTot,
            rationale: `Includes the ${rSer} Ω series resistor when asked only for the equivalent resistance of the three-branch parallel section.`,
          },
          {
            value: (b1 + b2 + b3) / 3,
            rationale:
              "Takes the arithmetic mean of the three resistances rather than the harmonic parallel equivalent.",
          },
          {
            value: b1 + b2 + b3,
            rationale:
              "Adds the three parallel resistances directly instead of summing their reciprocals.",
          },
        ];

    const options = assembleMcqOptions(targetVal, unit, distractors, slotIndex);
    if (!options) return undefined;

    const qText = askBranchCurrent
      ? `What current flows through the ${b1} Ω branch?`
      : `What is the equivalent resistance of the three-branch parallel section (${b1} Ω, ${b2} Ω, and ${b3} Ω)?`;

    const stems = [
      `In ${aOrAn(ctx)}, an ideal ${emfV} V supply feeds a ${rSer} Ω series resistor connected to three parallel branches of ${b1} Ω, ${b2} Ω, and ${b3} Ω, as shown. ${qText}`,
      `Three resistors of ${b1} Ω, ${b2} Ω, and ${b3} Ω are wired in parallel inside ${aOrAn(ctx)} and fed through a ${rSer} Ω resistor from an ideal ${emfV} V DC source. ${qText}`,
      `The schematic for ${aOrAn(ctx)} shows an ideal ${emfV} V cell driving a ${rSer} Ω main-branch resistor that splits at a junction into ${b1} Ω, ${b2} Ω, and ${b3} Ω parallel resistors. ${qText}`,
      `Across ${aOrAn(ctx)}, a ${rSer} Ω line resistor links an ideal ${emfV} V rail to a three-way parallel manifold of ${b1} Ω, ${b2} Ω, and ${b3} Ω loads. ${qText}`,
      `Current from an ideal ${emfV} V supply enters ${aOrAn(ctx)} via a ${rSer} Ω series resistor before dividing across ${b1} Ω, ${b2} Ω, and ${b3} Ω parallel elements. ${qText}`,
    ];

    return {
      id,
      conceptId: "kirchhoff-dc-circuits",
      templateArchetype: "kirchhoff-junction-three-branch-network",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV,
        internalOhm: 0,
        seriesOhm: rSer,
        parallelBranchOhms: [b1, b2, b3],
      },
      hiddenQuantities,
      targetQuantityKey: targetKey,
      questionPlan: buildPreSolvePlan(
        "kirchhoff-dc-circuits",
        "kirchhoff-junction-three-branch-network",
        "mcq",
        targetKey,
      ),
      stem: stems[subSlot % stems.length],
      options,
      workedSolution: `1/R_p = 1/${b1} + 1/${b2} + 1/${b3}, giving R_p = ${formatPhysicsQuantity(rPar, "Ω")}. Total resistance R_tot = ${rSer} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}. Main current I_tot = ${emfV} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iTot, "A")}, parallel p.d. V_p = ${formatPhysicsQuantity(vPar, "V")}, and I(${b1} Ω) = V_p / ${b1} = ${formatPhysicsQuantity(iBranch1, "A")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Obtains ${formatPhysicsQuantity(targetVal, unit)}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structStems3 = [
    `${aOrAn(ctx, true)} connects three parallel resistors of ${b1} Ω, ${b2} Ω, and ${b3} Ω in series with a ${rSer} Ω resistor across an ideal ${emfV} V DC source, as shown.`,
    `In the schematic of ${aOrAn(ctx)}, an ideal ${emfV} V supply feeds a ${rSer} Ω series resistor that branches at a node into parallel ${b1} Ω, ${b2} Ω, and ${b3} Ω resistors.`,
    `Three parallel resistive loads (${b1} Ω, ${b2} Ω, and ${b3} Ω) in ${aOrAn(ctx)} draw power through a ${rSer} Ω line resistor from an ideal ${emfV} V cell.`,
    `Engineers testing ${aOrAn(ctx)} wire ${b1} Ω, ${b2} Ω, and ${b3} Ω branches in parallel and connect the group in series with a ${rSer} Ω resistor across an ideal ${emfV} V supply.`,
  ];

  return {
    id,
    conceptId: "kirchhoff-dc-circuits",
    templateArchetype: "kirchhoff-junction-three-branch-network",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind: "dc-series-parallel",
      emfV,
      internalOhm: 0,
      seriesOhm: rSer,
      parallelBranchOhms: [b1, b2, b3],
    },
    hiddenQuantities,
    questionPlan: buildPreSolvePlan(
      "kirchhoff-dc-circuits",
      "kirchhoff-junction-three-branch-network",
      "structured",
      "branchOneCurrentA",
      ["parallelOhm", "totalCurrentA", "branchOneCurrentA"],
    ),
    stem: structStems3[Math.floor(slotIndex / 2) % structStems3.length],
    parts: [
      {
        partId: "a",
        prompt: `Show by calculation that the combined resistance of the three parallel branches is ${formatPhysicsQuantity(rPar, "Ω")}.`,
        marks: 2,
        targetQuantityKey: "parallelOhm",
        expectedAnswer: formatPhysicsQuantity(rPar, "Ω"),
        workingSteps: [
          `1/R_p = 1/${b1} + 1/${b2} + 1/${b3}.`,
          `Inverting gives R_p = ${formatPhysicsQuantity(rPar, "Ω")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the total current drawn from the DC source.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "totalCurrentA",
        expectedAnswer: formatPhysicsQuantity(iTot, "A"),
        workingSteps: [
          `R_tot = ${rSer} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}.`,
          `I_tot = ${emfV} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iTot, "A")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the current passing through the ${b1} Ω branch.`,
        marks: 2,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "branchOneCurrentA",
        expectedAnswer: formatPhysicsQuantity(iBranch1, "A"),
        workingSteps: [
          `V_p = I_tot × R_p = ${formatPhysicsQuantity(iTot)} × ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(vPar, "V")}.`,
          `I_1 = V_p / ${b1} = ${formatPhysicsQuantity(iBranch1, "A")}.`,
        ],
      },
    ],
    workedSolution: `(a) 1/R_p = 1/${b1} + 1/${b2} + 1/${b3} => R_p = ${formatPhysicsQuantity(rPar, "Ω")}. (b) R_tot = ${rSer} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}, so I_tot = ${emfV} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iTot, "A")}. (c) V_p = ${formatPhysicsQuantity(vPar, "V")}, giving I(${b1} Ω) = ${formatPhysicsQuantity(iBranch1, "A")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Applies 1/R_p = 1/R_1 + 1/R_2 + 1/R_3 and inverts.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains R_p = ${formatPhysicsQuantity(rPar, "Ω")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Adds ${rSer} Ω to R_p and uses I = V / R_tot.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains I_tot = ${formatPhysicsQuantity(iTot, "A")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Calculates V_p = ${formatPhysicsQuantity(vPar, "V")} and divides by ${b1} Ω.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains I_1 = ${formatPhysicsQuantity(iBranch1, "A")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// Archetype 3: kirchhoff-dc-circuits :: opposing-series-cells-kirchhoff-loop
// ============================================================================

const OPPOSING_CELL_CONTEXTS = [
  "rechargeable battery trickle-charging loop",
  "Kirchhoff loop verification board",
  "emergency backup DC bus tie circuit",
  "bicycle dynamo-and-accumulator regulator",
  "portable solar-cell battery float charger",
  "reversible electrochemistry cell comparison rig",
  "dual-battery jump-start bench",
  "telecommunications float-charge test loop",
  "forklift battery equalisation circuit",
  "marine dual-bank isolator test rig",
  "laboratory counter-emf motor stand-in loop",
  "UPS battery-pack balancing loop",
  "micro-hydro battery buffer circuit",
  "solar-buoy accumulator charging loop",
  "railcarriage auxiliary battery tie line",
  "glider avionics dual-cell backup loop",
  "field-station NiMH reconditioning loop",
  "wind-charger lead-acid buffer circuit",
  "autonomous-cart regenerative-braking model loop",
  "potentiometric opposing-cell bench setup",
  "substation 24 V battery-transfer loop",
  "rover secondary-cell recharge loop",
] as const;

function buildOpposingCellsLoopItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const e2 = randInt(3, 9, rand);
  const netEmf = randInt(4, 15, rand);
  const e1 = e2 + netEmf;
  const rInt1 = Number((0.4 + 0.2 * randInt(1, 7, rand)).toFixed(1));
  const rInt2 = Number((0.5 + 0.2 * randInt(1, 6, rand)).toFixed(1));
  if (Math.abs(rInt1 - rInt2) < 0.15) return undefined;
  const netInternal = Number((rInt1 + rInt2).toFixed(2));
  const rSer = randInt(2, 10, rand);
  const rLoad = randInt(4, 16, rand);
  if (rSer === rLoad) return undefined;
  const rTot = netInternal + rSer + rLoad;
  const iLoop = netEmf / rTot;
  const vLoad = iLoop * rLoad;
  const pLoad = iLoop * iLoop * rLoad;

  if (
    !valuesDistinctEnough(netEmf, e1, 0.05) ||
    !valuesDistinctEnough(netEmf, e2, 0.05)
  ) {
    return undefined;
  }

  const syllabi = buildSyllabusTags("kirchhoff-dc-circuits", format, slotIndex);
  const difficulty = pickDifficulty(slotIndex);
  const ctx = OPPOSING_CELL_CONTEXTS[slotIndex % OPPOSING_CELL_CONTEXTS.length];
  const hiddenQuantities = [
    "emfV",
    "internalOhm",
    "externalOhm",
    "totalOhm",
    "totalCurrentA",
    "terminalVoltageV",
    "parallelVoltageV",
    "totalSourcePowerW",
    "branchOneCurrentA",
    "branchOnePowerW",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "emf1V", value: e1, unit: "V", source: "stem" },
    { name: "emf2V", value: e2, unit: "V", source: "stem" },
    { name: "rInt1Ohm", value: rInt1, unit: "Ω", source: "stem" },
    { name: "rInt2Ohm", value: rInt2, unit: "Ω", source: "stem" },
    { name: "seriesOhm", value: rSer, unit: "Ω", source: "either" },
    { name: "loadOhm", value: rLoad, unit: "Ω", source: "either" },
  ];

  if (format === "mcq") {
    const mode = slotIndex % 3;
    const targetKey =
      mode === 0
        ? "totalCurrentA"
        : mode === 1
          ? "parallelVoltageV"
          : "branchOnePowerW";
    const targetVal = mode === 0 ? iLoop : mode === 1 ? vLoad : pLoad;
    const unit = mode === 0 ? "A" : mode === 1 ? "V" : "W";

    const iAddedEmf = (e1 + e2) / rTot;
    const iSubtractedR = netEmf / (Math.abs(rInt1 - rInt2) + rSer + rLoad);
    const iNoInternal = netEmf / (rSer + rLoad);
    const iDoubleInternal = netEmf / (2 * netInternal + rSer + rLoad);

    const distractors: DistractorCandidate[] =
      mode === 0
        ? [
            {
              value: iDoubleInternal,
              rationale:
                "Doubles the internal resistance contribution when reducing the two opposing cells.",
            },
            {
              value: iNoInternal,
              rationale: `Omits both cells' internal resistances (${rInt1} Ω and ${rInt2} Ω) from the total loop resistance.`,
            },
            {
              value: iSubtractedR,
              rationale: `Subtracts the internal resistances |${rInt1} − ${rInt2}| Ω instead of recognising that all resistances in series add regardless of cell polarity.`,
            },
            {
              value: iAddedEmf,
              rationale: `Adds the two cell emfs (${e1} V + ${e2} V) instead of subtracting them for opposing polarity in Kirchhoff's loop law.`,
            },
          ]
        : mode === 1
          ? [
              {
                value: iLoop * rSer,
                rationale: `Calculates the potential drop across the ${rSer} Ω resistor instead of the ${rLoad} Ω resistor.`,
              },
              {
                value: iNoInternal * rLoad,
                rationale:
                  "Neglects internal resistance when applying potential division across the external resistors.",
              },
              {
                value: iSubtractedR * rLoad,
                rationale:
                  "Subtracts the two internal resistances instead of adding them in the loop denominator.",
              },
              {
                value: iAddedEmf * rLoad,
                rationale: `Sums the opposing emfs (${e1} + ${e2}) V before applying V = IR across the ${rLoad} Ω resistor.`,
              },
            ]
          : [
              {
                value: iLoop * iLoop * rSer,
                rationale: `Evaluates P = I²R for the ${rSer} Ω limiting resistor rather than the ${rLoad} Ω load.`,
              },
              {
                value: iNoInternal * iNoInternal * rLoad,
                rationale:
                  "Ignores both internal resistances when computing loop current for P = I²R.",
              },
              {
                value: iSubtractedR * iSubtractedR * rLoad,
                rationale:
                  "Subtracts internal resistances rather than summing all series resistances around the loop.",
              },
              {
                value: iAddedEmf * iAddedEmf * rLoad,
                rationale:
                  "Adds the opposing emfs instead of taking their difference in Kirchhoff's second law.",
              },
            ];

    const options = assembleMcqOptions(targetVal, unit, distractors, slotIndex);
    if (!options) return undefined;

    const askClause =
      mode === 0
        ? "What steady current circulates around the loop?"
        : mode === 1
          ? `What is the potential difference across the ${rLoad} Ω load resistor?`
          : `What thermal power is dissipated in the ${rLoad} Ω load resistor?`;

    const stems = [
      `In ${aOrAn(ctx)} (shown by its equivalent source ε and internal resistance r), two cells of emf ${e1} V (internal resistance ${rInt1} Ω) and ${e2} V (internal resistance ${rInt2} Ω) are wired in opposition—positive to positive—with ${rSer} Ω and ${rLoad} Ω series resistors. ${askClause}`,
      `Two cells oppose one another inside ${aOrAn(ctx)}: cell X has emf ${e1} V and internal resistance ${rInt1} Ω, whereas cell Y has emf ${e2} V and internal resistance ${rInt2} Ω. Modelled as equivalent ε and r in the diagram, they drive ${rSer} Ω and ${rLoad} Ω series resistors. ${askClause}`,
      `Testing Kirchhoff's loop rule on ${aOrAn(ctx)}, a student connects a ${e1} V cell (${rInt1} Ω internal resistance) against an opposing ${e2} V cell (${rInt2} Ω internal resistance) through ${rSer} Ω and ${rLoad} Ω external resistors (equivalent ε, r illustrated). ${askClause}`,
      `${aOrAn(ctx, true)} pairs a ${e1} V driver cell of internal resistance ${rInt1} Ω in series opposition with a ${e2} V counter-cell of internal resistance ${rInt2} Ω (drawn as net ε, r) across ${rSer} Ω and ${rLoad} Ω resistors. ${askClause}`,
      `Within ${aOrAn(ctx)}, positive terminals of a ${e1} V cell (${rInt1} Ω) and a ${e2} V cell (${rInt2} Ω) are joined so their emfs oppose around a single loop (equivalent ε, r shown) containing ${rSer} Ω and ${rLoad} Ω resistors. ${askClause}`,
      `A single-loop ${ctx} combines opposing sources (${e1} V with ${rInt1} Ω, and ${e2} V with ${rInt2} Ω; depicted as net ε and r) in series with ${rSer} Ω and ${rLoad} Ω resistive elements. ${askClause}`,
      `Refer to the equivalent loop for ${aOrAn(ctx)}: a ${e1} V battery (${rInt1} Ω internal resistance) charges an opposing ${e2} V battery (${rInt2} Ω internal resistance) via ${rSer} Ω and ${rLoad} Ω series resistors. ${askClause}`,
    ];

    return {
      id,
      conceptId: "kirchhoff-dc-circuits",
      templateArchetype: "opposing-series-cells-kirchhoff-loop",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV: netEmf,
        internalOhm: netInternal,
        seriesOhm: rSer,
        parallelBranchOhms: [rLoad],
      },
      hiddenQuantities,
      requiredGivens,
      targetQuantityKey: targetKey,
      questionPlan: buildPreSolvePlan(
        "kirchhoff-dc-circuits",
        "opposing-series-cells-kirchhoff-loop",
        "mcq",
        targetKey,
      ),
      stem: stems[slotIndex % stems.length],
      options,
      workedSolution: `By Kirchhoff's loop law, net emf ε_net = ${e1} − ${e2} = ${netEmf} V, while all series resistances add: R_tot = ${rInt1} + ${rInt2} + ${rSer} + ${rLoad} = ${formatPhysicsQuantity(rTot, "Ω")}. Loop current I = ${netEmf} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iLoop, "A")}. Load p.d. V = ${formatPhysicsQuantity(vLoad, "V")} and load power P = ${formatPhysicsQuantity(pLoad, "W")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Applies Kirchhoff's loop law with opposing emfs and summed internal resistances to obtain ${formatPhysicsQuantity(targetVal, unit)}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structStems = [
    `In ${aOrAn(ctx)}, a primary cell of emf ${e1} V and internal resistance ${rInt1} Ω is connected in series opposition with a secondary cell of emf ${e2} V and internal resistance ${rInt2} Ω (represented by equivalent ε and r in the diagram), together with ${rSer} Ω and ${rLoad} Ω external series resistors.`,
    `${aOrAn(ctx, true)} wires a ${e1} V battery (${rInt1} Ω internal resistance) so that it opposes a ${e2} V battery (${rInt2} Ω internal resistance) around a single series loop containing ${rSer} Ω and ${rLoad} Ω resistors (net source ε, r shown).`,
    `To recharge a ${e2} V cell of internal resistance ${rInt2} Ω inside ${aOrAn(ctx)}, a ${e1} V supply cell of internal resistance ${rInt1} Ω is connected in opposition across ${rSer} Ω and ${rLoad} Ω series resistors, as represented by equivalent ε and r.`,
    `The equivalent circuit shown models ${aOrAn(ctx)} in which two opposing cells—emf ${e1} V (${rInt1} Ω) and emf ${e2} V (${rInt2} Ω)—drive current through ${rSer} Ω and ${rLoad} Ω series resistors.`,
    `During a practical on ${aOrAn(ctx)}, a student connects positive-to-positive terminals of a ${e1} V cell (${rInt1} Ω) and a ${e2} V cell (${rInt2} Ω), completing the loop (drawn as equivalent ε, r) with ${rSer} Ω and ${rLoad} Ω resistors.`,
    `Within ${aOrAn(ctx)}, counter-connected cells of emf ${e1} V (internal resistance ${rInt1} Ω) and ${e2} V (internal resistance ${rInt2} Ω), shown as net ε and r, supply external series resistors of ${rSer} Ω and ${rLoad} Ω.`,
    `An engineer analyses ${aOrAn(ctx)} where a ${e1} V unit (${rInt1} Ω) opposes a ${e2} V unit (${rInt2} Ω) in a closed loop (depicted via equivalent ε and r) with ${rSer} Ω and ${rLoad} Ω resistors.`,
    `Consider the single-loop ${ctx} modelled in the figure: opposing cells of ${e1} V (${rInt1} Ω) and ${e2} V (${rInt2} Ω) are combined as ε and r in series with ${rSer} Ω and ${rLoad} Ω resistors.`,
  ];

  return {
    id,
    conceptId: "kirchhoff-dc-circuits",
    templateArchetype: "opposing-series-cells-kirchhoff-loop",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind: "dc-series-parallel",
      emfV: netEmf,
      internalOhm: netInternal,
      seriesOhm: rSer,
      parallelBranchOhms: [rLoad],
    },
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildPreSolvePlan(
      "kirchhoff-dc-circuits",
      "opposing-series-cells-kirchhoff-loop",
      "structured",
      "branchOnePowerW",
      ["totalOhm", "totalCurrentA", "branchOnePowerW"],
    ),
    stem: structStems[slotIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the total resistance around the closed series loop.",
        marks: 2,
        targetQuantityKey: "totalOhm",
        expectedAnswer: formatPhysicsQuantity(rTot, "Ω"),
        workingSteps: [
          `Internal resistances add regardless of emf orientation: r_tot = ${rInt1} + ${rInt2} = ${formatPhysicsQuantity(netInternal, "Ω")}.`,
          `R_tot = ${formatPhysicsQuantity(netInternal)} + ${rSer} + ${rLoad} = ${formatPhysicsQuantity(rTot, "Ω")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Apply Kirchhoff's second law to calculate the current in the circuit.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "totalCurrentA",
        expectedAnswer: formatPhysicsQuantity(iLoop, "A"),
        workingSteps: [
          `Σɛ = ${e1} − ${e2} = ${netEmf} V.`,
          `I = Σɛ / R_tot = ${netEmf} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iLoop, "A")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the rate at which thermal energy is dissipated in the ${rLoad} Ω resistor.`,
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "branchOnePowerW",
        expectedAnswer: formatPhysicsQuantity(pLoad, "W"),
        workingSteps: [
          `P = I² R = (${formatPhysicsQuantity(iLoop)})² × ${rLoad} = ${formatPhysicsQuantity(pLoad, "W")}.`,
        ],
      },
    ],
    workedSolution: `(a) R_tot = ${rInt1} + ${rInt2} + ${rSer} + ${rLoad} = ${formatPhysicsQuantity(rTot, "Ω")}. (b) Net emf = ${e1} − ${e2} = ${netEmf} V, so I = ${netEmf} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iLoop, "A")}. (c) P = I² R_load = ${formatPhysicsQuantity(pLoad, "W")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Adds both internal resistances to both external series resistances.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains R_tot = ${formatPhysicsQuantity(rTot, "Ω")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Uses net opposing emf ${e1} − ${e2} = ${netEmf} V in Σɛ = I R_tot.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains I = ${formatPhysicsQuantity(iLoop, "A")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Uses P = I² × ${rLoad}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains P = ${formatPhysicsQuantity(pLoad, "W")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// Archetype 4: kirchhoff-dc-circuits :: non-ideal-voltmeter-ammeter-loading
// ============================================================================

const METER_LOADING_CONTEXTS = [
  "analogue moving-coil meter bench",
  "high-impedance sensor divider jig",
  "physics teaching potentiometer station",
  "galvanometer multiplier test rig",
  "industrial PLC input-impedance check",
  "ECG electrode-bias divider stage",
  "photodiode bias divider network",
  "automotive harness diagnostic probe",
  "vacuum-tube grid-bias divider check",
  "piezo-amplifier bias test point",
  "pH-probe reference divider bench",
  "radiation-detector HV bleed divider",
  "strain-bridge balance verification rig",
  "audio preamp bias-point check",
  "solar-cell shunt-meter test bench",
  "servo-potentiometer readout check",
  "thermistors benchtop readout jig",
  "precision resistance-box audit rig",
  "avionics synchro-divider test point",
  "rail-signalling relay-coil meter check",
  "cryogenic sensor bias-check circuit",
  "electrochemistry reference-divider bench",
] as const;

function buildMeterLoadingItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const syllabi = buildSyllabusTags("kirchhoff-dc-circuits", format, slotIndex);
  const difficulty = pickDifficulty(slotIndex);
  const ctx = METER_LOADING_CONTEXTS[slotIndex % METER_LOADING_CONTEXTS.length];
  const isVoltmeterCase = slotIndex % 3 !== 2;

  if (isVoltmeterCase) {
    const scale = [10, 20, 25, 50][slotIndex % 4];
    const pair = pick(PARALLEL_PAIRS, rand);
    const rLower = pair[0] * scale;
    const rVolt = pair[1] * scale;
    const rPar = (rLower * rVolt) / (rLower + rVolt);
    const rUpper = randInt(3, 15, rand) * scale;
    const rTot = rUpper + rPar;
    const vSupply = randInt(9, 48, rand);
    const iTot = vSupply / rTot;
    const vLoaded = iTot * rPar;
    const vUnloaded = (vSupply * rLower) / (rUpper + rLower);

    if (!valuesDistinctEnough(vLoaded, vUnloaded, 0.04)) {
      return undefined;
    }

    const hiddenQuantities = [
      "parallelOhm",
      "externalOhm",
      "totalOhm",
      "totalCurrentA",
      "parallelVoltageV",
      "totalSourcePowerW",
      "branchOneCurrentA",
      "branchOnePowerW",
      "branchTwoCurrentA",
      "branchTwoPowerW",
    ];

    if (format === "mcq") {
      const distractors: DistractorCandidate[] = [
        {
          value: (vLoaded * rLower) / (rLower + rVolt),
          rationale:
            "Applies a second unnecessary resistance ratio to the already-shunted parallel voltage.",
        },
        {
          value: vUnloaded,
          rationale: `Treats the voltmeter as ideal (infinite resistance) and computes the unloaded divider voltage ${vSupply} × ${rLower}/(${rUpper} + ${rLower}).`,
        },
        {
          value: (vSupply * (rLower + rVolt)) / (rUpper + rLower + rVolt),
          rationale: `Adds the ${rVolt} Ω voltmeter resistance in series with ${rLower} Ω instead of combining them in parallel.`,
        },
        {
          value: vSupply - vLoaded,
          rationale: `Calculates the potential difference across the upper ${rUpper} Ω resistor rather than the voltmeter reading across the parallel combination.`,
        },
      ];
      const options = assembleMcqOptions(vLoaded, "V", distractors, slotIndex);
      if (!options) return undefined;

      const stems = [
        `On ${aOrAn(ctx)}, resistors of ${rUpper} Ω and ${rLower} Ω form a series divider across an ideal ${vSupply} V DC supply. A finite-resistance voltmeter (${rVolt} Ω, drawn as the parallel branch) is placed across the ${rLower} Ω resistor. What reading does the voltmeter show?`,
        `A series divider in ${aOrAn(ctx)} has a ${rUpper} Ω upper arm and ${rLower} Ω lower arm across an ideal ${vSupply} V source. Connecting a non-ideal ${rVolt} Ω voltmeter across the ${rLower} Ω arm (forming the parallel pair shown) yields what potential difference?`,
        `To check ${aOrAn(ctx)}, a student clips a moving-coil voltmeter of resistance ${rVolt} Ω across the ${rLower} Ω resistor of a ${rUpper} Ω–${rLower} Ω divider powered at ${vSupply} V (ideal). What loaded voltage is indicated?`,
        `In the ${ctx} schematic, the ${rVolt} Ω parallel element represents a voltmeter shunting the ${rLower} Ω lower resistor of a divider fed through ${rUpper} Ω from an ideal ${vSupply} V cell. Calculate the voltmeter reading.`,
        `An ideal ${vSupply} V rail energises ${aOrAn(ctx)} with ${rUpper} Ω and ${rLower} Ω series resistors; probing across ${rLower} Ω with a ${rVolt} Ω finite-impedance voltmeter (shown in parallel) produces what reading?`,
        `Within ${aOrAn(ctx)}, a voltmeter of input resistance ${rVolt} Ω bridges the ${rLower} Ω resistor in series with ${rUpper} Ω across an ideal ${vSupply} V supply. Determine the measured p.d.`,
      ];

      return {
        id,
        conceptId: "kirchhoff-dc-circuits",
        templateArchetype: "non-ideal-voltmeter-ammeter-loading",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "circuits",
        scenarioSpec: {
          kind: "dc-series-parallel",
          emfV: vSupply,
          internalOhm: 0,
          seriesOhm: rUpper,
          parallelBranchOhms: [rLower, rVolt],
        },
        hiddenQuantities,
        targetQuantityKey: "parallelVoltageV",
        questionPlan: buildPreSolvePlan(
          "kirchhoff-dc-circuits",
          "non-ideal-voltmeter-ammeter-loading",
          "mcq",
          "parallelVoltageV",
        ),
        stem: stems[slotIndex % stems.length],
        options,
        workedSolution: `The ${rVolt} Ω voltmeter shunts the ${rLower} Ω resistor: R_p = (${rLower} × ${rVolt})/(${rLower} + ${rVolt}) = ${formatPhysicsQuantity(rPar, "Ω")}. Loaded voltmeter reading V_out = ${vSupply} × ${formatPhysicsQuantity(rPar)} / (${rUpper} + ${formatPhysicsQuantity(rPar)}) = ${formatPhysicsQuantity(vLoaded, "V")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Combines ${rLower} Ω and ${rVolt} Ω in parallel (${formatPhysicsQuantity(rPar, "Ω")}) to obtain V = ${formatPhysicsQuantity(vLoaded, "V")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const vStructStems = [
      `In ${aOrAn(ctx)}, a ${rUpper} Ω resistor and a ${rLower} Ω resistor are connected in series across an ideal ${vSupply} V DC supply. A non-ideal voltmeter of resistance ${rVolt} Ω is placed across the ${rLower} Ω resistor, forming the ${rVolt} Ω parallel branch shown.`,
      `${aOrAn(ctx, true)} comprises ${rUpper} Ω and ${rLower} Ω series divider arms across an ideal ${vSupply} V cell; a moving-coil voltmeter of finite resistance ${rVolt} Ω shunts the ${rLower} Ω arm as illustrated.`,
      `During a measurement error study on ${aOrAn(ctx)}, a technician connects a ${rVolt} Ω voltmeter across the ${rLower} Ω lower resistor of a ${rUpper} Ω–${rLower} Ω divider supplied at ${vSupply} V (ideal).`,
      `The diagram for ${aOrAn(ctx)} shows an ideal ${vSupply} V source feeding a ${rUpper} Ω resistor in series with a ${rLower} Ω resistor bridged by a ${rVolt} Ω finite-resistance voltmeter.`,
      `Across an ideal ${vSupply} V rail in ${aOrAn(ctx)}, a ${rUpper} Ω resistor sits in series with a ${rLower} Ω resistor whose p.d. is monitored by a parallel ${rVolt} Ω non-ideal voltmeter.`,
    ];

    return {
      id,
      conceptId: "kirchhoff-dc-circuits",
      templateArchetype: "non-ideal-voltmeter-ammeter-loading",
      seed,
      syllabi,
      format: "structured",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV: vSupply,
        internalOhm: 0,
        seriesOhm: rUpper,
        parallelBranchOhms: [rLower, rVolt],
      },
      hiddenQuantities,
      questionPlan: buildPreSolvePlan(
        "kirchhoff-dc-circuits",
        "non-ideal-voltmeter-ammeter-loading",
        "structured",
        "parallelVoltageV",
        ["parallelOhm", "totalCurrentA", "parallelVoltageV"],
      ),
      stem: vStructStems[slotIndex % vStructStems.length],
      parts: [
        {
          partId: "a",
          prompt: `Calculate the combined resistance of the ${rLower} Ω resistor and the ${rVolt} Ω voltmeter in parallel.`,
          marks: 2,
          targetQuantityKey: "parallelOhm",
          expectedAnswer: formatPhysicsQuantity(rPar, "Ω"),
          workingSteps: [
            `R_p = (${rLower} × ${rVolt}) / (${rLower} + ${rVolt}) = ${formatPhysicsQuantity(rPar, "Ω")}.`,
          ],
        },
        {
          partId: "b",
          prompt: "Calculate the current drawn from the DC supply while the voltmeter is connected.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "totalCurrentA",
          expectedAnswer: formatPhysicsQuantity(iTot, "A"),
          workingSteps: [
            `R_tot = ${rUpper} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}.`,
            `I = ${vSupply} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iTot, "A")}.`,
          ],
        },
        {
          partId: "c",
          prompt: "Determine the potential difference displayed by the non-ideal voltmeter.",
          marks: 2,
          dependsOnPartIds: ["a", "b"],
          targetQuantityKey: "parallelVoltageV",
          expectedAnswer: formatPhysicsQuantity(vLoaded, "V"),
          workingSteps: [
            `V_meter = I × R_p = ${formatPhysicsQuantity(iTot)} × ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(vLoaded, "V")}.`,
          ],
        },
      ],
      workedSolution: `(a) R_p = (${rLower} × ${rVolt})/(${rLower} + ${rVolt}) = ${formatPhysicsQuantity(rPar, "Ω")}. (b) R_tot = ${rUpper} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}, so I = ${vSupply} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iTot, "A")}. (c) Voltmeter reading V = I R_p = ${formatPhysicsQuantity(vLoaded, "V")}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: `Uses 1/R_p = 1/${rLower} + 1/${rVolt}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains R_p = ${formatPhysicsQuantity(rPar, "Ω")}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: `Adds ${rUpper} Ω to R_p and divides ${vSupply} V by R_tot.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains I = ${formatPhysicsQuantity(iTot, "A")}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "c",
          criterion: "Multiplies supply current by R_p (or uses loaded divider ratio).",
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains V_meter = ${formatPhysicsQuantity(vLoaded, "V")}.`,
          marks: 1,
        },
      ],
      totalMarks: 6,
      generatorModel,
    };
  }

  // Ammeter loading case
  const pair = pick(PARALLEL_PAIRS, rand);
  const r1 = pair[0];
  const r2 = pair[1];
  const rPar = (r1 * r2) / (r1 + r2);
  const rAmmeter = Number((0.8 + 0.4 * randInt(1, 8, rand)).toFixed(1));
  const rTot = rAmmeter + rPar;
  const vSupply = randInt(8, 30, rand);
  const iLoaded = vSupply / rTot;
  const iIdeal = vSupply / rPar;
  const vAcrossLoad = iLoaded * rPar;

  if (!valuesDistinctEnough(iLoaded, iIdeal, 0.05)) return undefined;

  const hiddenQuantities = [
    "parallelOhm",
    "externalOhm",
    "totalOhm",
    "totalCurrentA",
    "parallelVoltageV",
    "totalSourcePowerW",
    "branchOneCurrentA",
    "branchOnePowerW",
    "branchTwoCurrentA",
    "branchTwoPowerW",
  ];

  if (format === "mcq") {
    const distractors: DistractorCandidate[] = [
      {
        value: vSupply / (rAmmeter + r1 + r2),
        rationale: `Adds the ${r1} Ω and ${r2} Ω parallel loads directly in series with the ${rAmmeter} Ω ammeter.`,
      },
      {
        value: vAcrossLoad / Math.max(r1, r2),
        rationale: `Calculates the current in the ${Math.max(r1, r2)} Ω branch alone rather than the ammeter current in the main line.`,
      },
      {
        value: iIdeal,
        rationale: `Assumes an ideal zero-resistance ammeter and omits its ${rAmmeter} Ω coil resistance.`,
      },
      {
        value: vSupply / rAmmeter,
        rationale: `Divides supply voltage solely by the ${rAmmeter} Ω ammeter resistance, ignoring the external parallel load.`,
      },
    ];
    const options = assembleMcqOptions(iLoaded, "A", distractors, slotIndex);
    if (!options) return undefined;

    const aStems = [
      `In ${aOrAn(ctx)}, a non-ideal moving-coil ammeter of coil resistance ${rAmmeter} Ω (modelled as the ${rAmmeter} Ω series element) sits in the main line of an ideal ${vSupply} V source feeding parallel ${r1} Ω and ${r2} Ω resistors. What current does the ammeter register?`,
      `A technician inserts an ammeter with internal resistance ${rAmmeter} Ω (drawn as the ${rAmmeter} Ω series resistor) between an ideal ${vSupply} V rail and parallel ${r1} Ω and ${r2} Ω loads on ${aOrAn(ctx)}. Determine the ammeter reading.`,
      `When a ${rAmmeter} Ω non-ideal ammeter (shown in series) measures the supply current to ${r1} Ω and ${r2} Ω parallel branches across an ideal ${vSupply} V cell in ${aOrAn(ctx)}, what current flows?`,
    ];

    return {
      id,
      conceptId: "kirchhoff-dc-circuits",
      templateArchetype: "non-ideal-voltmeter-ammeter-loading",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV: vSupply,
        internalOhm: 0,
        seriesOhm: rAmmeter,
        parallelBranchOhms: [r1, r2],
      },
      hiddenQuantities,
      targetQuantityKey: "totalCurrentA",
      questionPlan: buildPreSolvePlan(
        "kirchhoff-dc-circuits",
        "non-ideal-voltmeter-ammeter-loading",
        "mcq",
        "totalCurrentA",
      ),
      stem: aStems[Math.floor(slotIndex / 3) % aStems.length],
      options,
      workedSolution: `Parallel load R_p = (${r1} × ${r2})/(${r1} + ${r2}) = ${formatPhysicsQuantity(rPar, "Ω")}. Including the non-ideal ammeter resistance ${rAmmeter} Ω gives R_tot = ${rAmmeter} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}, so I = ${vSupply} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iLoaded, "A")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Includes ammeter coil resistance ${rAmmeter} Ω in series with R_p = ${formatPhysicsQuantity(rPar, "Ω")} to obtain ${formatPhysicsQuantity(iLoaded, "A")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const aStructStems = [
    `A student inserts a non-ideal ammeter of coil resistance ${rAmmeter} Ω (modelled as the ${rAmmeter} Ω series resistor in the diagram) into the supply branch of ${aOrAn(ctx)} powered at ${vSupply} V (ideal) driving ${r1} Ω and ${r2} Ω parallel resistors.`,
    `In ${aOrAn(ctx)}, an ideal ${vSupply} V source feeds parallel ${r1} Ω and ${r2} Ω resistors through a moving-coil ammeter whose ${rAmmeter} Ω internal resistance is represented by the ${rAmmeter} Ω series element.`,
    `To quantify meter burden on ${aOrAn(ctx)}, an ammeter of resistance ${rAmmeter} Ω (drawn as the ${rAmmeter} Ω series resistor) is wired between an ideal ${vSupply} V cell and parallel ${r1} Ω and ${r2} Ω branches.`,
  ];

  return {
    id,
    conceptId: "kirchhoff-dc-circuits",
    templateArchetype: "non-ideal-voltmeter-ammeter-loading",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind: "dc-series-parallel",
      emfV: vSupply,
      internalOhm: 0,
      seriesOhm: rAmmeter,
      parallelBranchOhms: [r1, r2],
    },
    hiddenQuantities,
    questionPlan: buildPreSolvePlan(
      "kirchhoff-dc-circuits",
      "non-ideal-voltmeter-ammeter-loading",
      "structured",
      "parallelVoltageV",
      ["parallelOhm", "totalCurrentA", "parallelVoltageV"],
    ),
    stem: aStructStems[Math.floor(slotIndex / 3) % aStructStems.length],
    parts: [
      {
        partId: "a",
        prompt: `Calculate the equivalent resistance of the ${r1} Ω and ${r2} Ω parallel combination.`,
        marks: 2,
        targetQuantityKey: "parallelOhm",
        expectedAnswer: formatPhysicsQuantity(rPar, "Ω"),
        workingSteps: [
          `R_p = (${r1} × ${r2}) / (${r1} + ${r2}) = ${formatPhysicsQuantity(rPar, "Ω")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the current indicated by the non-ideal ammeter.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "totalCurrentA",
        expectedAnswer: formatPhysicsQuantity(iLoaded, "A"),
        workingSteps: [
          `R_tot = ${rAmmeter} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}.`,
          `I = ${vSupply} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iLoaded, "A")}.`,
        ],
      },
      {
        partId: "c",
        prompt: "Determine the actual potential difference remaining across the parallel load.",
        marks: 2,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "parallelVoltageV",
        expectedAnswer: formatPhysicsQuantity(vAcrossLoad, "V"),
        workingSteps: [
          `V_load = I × R_p = ${formatPhysicsQuantity(iLoaded)} × ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(vAcrossLoad, "V")}.`,
        ],
      },
    ],
    workedSolution: `(a) R_p = ${formatPhysicsQuantity(rPar, "Ω")}. (b) R_tot = ${rAmmeter} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}; I = ${vSupply} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iLoaded, "A")}. (c) V_load = I R_p = ${formatPhysicsQuantity(vAcrossLoad, "V")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Applies parallel reciprocal formula.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains R_p = ${formatPhysicsQuantity(rPar, "Ω")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Adds ${rAmmeter} Ω ammeter resistance to R_p.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains I = ${formatPhysicsQuantity(iLoaded, "A")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Uses V_load = I R_p or V_supply − I R_A.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains V_load = ${formatPhysicsQuantity(vAcrossLoad, "V")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// Archetype 5: potential-divider-sensors :: ldr-illumination-divider-stage
// ============================================================================

const LDR_CONTEXTS = [
  "automatic street-lamp twilight switch",
  "greenhouse shade-curtain controller",
  "museum light-exposure alarm circuit",
  "photographic darkroom door interlock",
  "solar tracker dusk-detection stage",
  "poultry-house lighting relay",
  "warehouse skylight dimming sensor",
  "conveyor-belt optical package counter",
  "observatory dome-shutter safety sensor",
  "meteorological sunshine-duration logger",
  "stairwell dusk-to-dawn LED trigger",
  "highway tunnel entrance luminance monitor",
  "aquarium photoperiod timer sensor",
  "railway level-crossing beacon dimmer",
  "automated venetian-blind lux sensor",
  "camera exposure-meter bridge arm",
  "cleanroom UV-lamp verification sensor",
  "heliostat cloud-cover trip divider",
  "harbour buoy night-flasher sensor",
  "botanical growth-cabinet lux monitor",
  "parking-deck daylight harvesting stage",
  "vending-machine display auto-dimmer",
] as const;

function buildLdrDividerItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const voltageV = [5, 6, 9, 12, 15, 18, 24][randInt(0, 6, rand)];
  const fixedKOhm = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20][randInt(0, 9, rand)];
  const fixedOhm = fixedKOhm * 1000;
  const darkKOhm = randInt(25, 180, rand);
  const darkOhm = darkKOhm * 1000;
  let brightKOhm = [0.5, 0.8, 1.0, 1.2, 1.5, 2.5, 3.5][randInt(0, 6, rand)];
  if (Math.abs(brightKOhm - fixedKOhm) < 0.3) brightKOhm += 0.6;
  const brightOhm = Math.round(brightKOhm * 1000);

  const darkCurrentA = voltageV / (darkOhm + fixedOhm);
  const darkOutputV = (voltageV * fixedOhm) / (darkOhm + fixedOhm);
  const brightOutputV = (voltageV * fixedOhm) / (brightOhm + fixedOhm);

  const syllabi = buildSyllabusTags(
    "potential-divider-sensors",
    format,
    slotIndex,
  );
  const difficulty = pickDifficulty(slotIndex);
  const ctx = LDR_CONTEXTS[slotIndex % LDR_CONTEXTS.length];
  const hiddenQuantities = ["darkCurrentA", "darkOutputV", "brightOutputV"];

  if (format === "mcq") {
    const mode = slotIndex % 3;
    const targetKey =
      mode === 0
        ? "brightOutputV"
        : mode === 1
          ? "darkOutputV"
          : "darkCurrentA";
    const targetVal =
      mode === 0 ? brightOutputV : mode === 1 ? darkOutputV : darkCurrentA;
    const unit = mode === 2 ? "A" : "V";

    const distractors: DistractorCandidate[] =
      mode === 0
        ? [
            {
              value: darkOutputV,
              rationale: `Uses the dark LDR resistance (${darkKOhm} kΩ) instead of the bright-light resistance (${brightKOhm} kΩ).`,
            },
            {
              value: (voltageV * brightOhm) / (brightOhm + fixedOhm),
              rationale:
                "Calculates the potential difference across the LDR rather than across the fixed output resistor.",
            },
            {
              value: brightOutputV - darkOutputV,
              rationale:
                "Computes the change in output voltage between dark and bright conditions rather than the bright-light output voltage.",
            },
            {
              value: (voltageV * fixedOhm) / Math.max(brightOhm, fixedOhm),
              rationale:
                "Divides by a single resistance instead of the total series resistance (R_LDR + R_fixed).",
            },
          ]
        : mode === 1
          ? [
              {
                value: (voltageV * fixedOhm) / (darkOhm + 2 * fixedOhm),
                rationale:
                  "Double-counts the fixed resistor in the potential-divider denominator.",
              },
              {
                value: (voltageV * fixedOhm) / darkOhm,
                rationale: `Uses ${darkKOhm} kΩ alone in the denominator instead of (${darkKOhm} + ${fixedKOhm}) kΩ.`,
              },
              {
                value: voltageV / 2,
                rationale:
                  "Assumes the supply potential difference divides equally despite unequal resistances.",
              },
              {
                value: (voltageV * darkOhm) / (darkOhm + fixedOhm),
                rationale:
                  "Evaluates V_in × R_LDR / (R_LDR + R_fixed), which is the p.d. across the LDR rather than V_out across the fixed resistor.",
              },
            ]
          : [
              {
                value: voltageV / (2 * darkOhm + fixedOhm),
                rationale: "Mis-sums the series loop resistance in darkness.",
              },
              {
                value: voltageV / darkOhm,
                rationale: `Omits the ${fixedKOhm} kΩ fixed series resistor when finding the dark current.`,
              },
              {
                value: voltageV / (brightOhm + fixedOhm),
                rationale: `Calculates the circuit current in bright illumination using ${brightKOhm} kΩ instead of in darkness (${darkKOhm} kΩ).`,
              },
              {
                value: darkCurrentA * 1000,
                rationale:
                  "Confuses milliamperes with amperes by failing to convert kΩ to Ω (off by a factor of 10³).",
              },
            ];

    const options = assembleMcqOptions(targetVal, unit, distractors, slotIndex);
    if (!options) return undefined;

    const askClause =
      mode === 0
        ? "What does the ideal voltmeter Vout read in bright illumination?"
        : mode === 1
          ? "What is the reading on the ideal voltmeter Vout in darkness?"
          : "What current flows through the potential divider in darkness?";

    const stems = [
      `${aOrAn(ctx, true)} uses an ideal ${voltageV} V DC supply, an LDR, and a ${fixedKOhm} kΩ fixed resistor wired as shown, with ideal voltmeter Vout across the fixed resistor. The LDR resistance is ${darkKOhm} kΩ in darkness and ${brightKOhm} kΩ in bright light. ${askClause}`,
      `In the ${ctx} diagram, an LDR (${darkKOhm} kΩ dark; ${brightKOhm} kΩ bright) sits in series with a ${fixedKOhm} kΩ resistor across an ideal ${voltageV} V cell while ideal voltmeter Vout monitors the ${fixedKOhm} kΩ resistor. ${askClause}`,
      `Testing ${aOrAn(ctx)} supplied at ${voltageV} V (ideal), illumination lowers the LDR resistance from ${darkKOhm} kΩ in darkness to ${brightKOhm} kΩ in bright light; Vout is measured across the series ${fixedKOhm} kΩ resistor. ${askClause}`,
      `The sensing stage of ${aOrAn(ctx)} connects an LDR (${darkKOhm} kΩ in darkness, ${brightKOhm} kΩ when brightly lit) and a ${fixedKOhm} kΩ resistor across an ideal ${voltageV} V source, with ideal voltmeter Vout across the fixed resistor. ${askClause}`,
      `An ideal ${voltageV} V rail powers ${aOrAn(ctx)} comprising an LDR (${darkKOhm} kΩ dark, ${brightKOhm} kΩ bright) in series with a ${fixedKOhm} kΩ output resistor bridged by ideal voltmeter Vout. ${askClause}`,
      `Within ${aOrAn(ctx)}, an ideal voltmeter Vout spans a ${fixedKOhm} kΩ resistor in series with an LDR (${darkKOhm} kΩ in darkness; ${brightKOhm} kΩ in bright daylight) across an ideal ${voltageV} V supply. ${askClause}`,
      `Refer to the schematic of ${aOrAn(ctx)}: an LDR whose resistance changes between ${darkKOhm} kΩ (dark) and ${brightKOhm} kΩ (bright) forms a divider with a ${fixedKOhm} kΩ resistor across ${voltageV} V (ideal). ${askClause}`,
    ];

    return {
      id,
      conceptId: "potential-divider-sensors",
      templateArchetype: "ldr-illumination-divider-stage",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "light-alarm",
        voltageV,
        fixedOhm,
        darkOhm,
        brightOhm,
      },
      hiddenQuantities,
      targetQuantityKey: targetKey,
      questionPlan: buildPreSolvePlan(
        "potential-divider-sensors",
        "ldr-illumination-divider-stage",
        "mcq",
        targetKey,
      ),
      stem: stems[slotIndex % stems.length],
      options,
      workedSolution: `In darkness, R_tot = ${darkKOhm} + ${fixedKOhm} = ${darkKOhm + fixedKOhm} kΩ, so I_dark = ${voltageV} / ${(darkOhm + fixedOhm).toString()} = ${formatPhysicsQuantity(darkCurrentA, "A")} and V_out(dark) = ${formatPhysicsQuantity(darkOutputV, "V")}. In bright light, V_out(bright) = ${voltageV} × ${fixedKOhm} / (${brightKOhm} + ${fixedKOhm}) = ${formatPhysicsQuantity(brightOutputV, "V")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Applies potential-divider analysis across the ${fixedKOhm} kΩ resistor to obtain ${formatPhysicsQuantity(targetVal, unit)}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structStems = [
    `${aOrAn(ctx, true)} connects an LDR in series with a ${fixedKOhm} kΩ fixed resistor across an ideal ${voltageV} V DC source, with ideal voltmeter Vout connected across the ${fixedKOhm} kΩ resistor as shown. The LDR resistance is ${darkKOhm} kΩ in darkness and ${brightKOhm} kΩ in bright light.`,
    `In the schematic for ${aOrAn(ctx)}, an ideal ${voltageV} V cell supplies a potential divider formed by an LDR (${darkKOhm} kΩ in darkness; ${brightKOhm} kΩ in bright light) and a ${fixedKOhm} kΩ resistor monitored by ideal voltmeter Vout.`,
    `To automate ${aOrAn(ctx)}, an engineer wires an LDR (${darkKOhm} kΩ dark, ${brightKOhm} kΩ bright) in series with a ${fixedKOhm} kΩ resistor across an ideal ${voltageV} V rail and places ideal voltmeter Vout across the fixed resistor.`,
    `An ideal voltmeter Vout measures the output across a ${fixedKOhm} kΩ resistor in series with an LDR inside ${aOrAn(ctx)} powered at ${voltageV} V (ideal); the LDR has resistance ${darkKOhm} kΩ in darkness and ${brightKOhm} kΩ under bright illumination.`,
    `During testing of ${aOrAn(ctx)}, light intensity shifts an LDR from ${darkKOhm} kΩ (darkness) to ${brightKOhm} kΩ (bright light) while in series with a ${fixedKOhm} kΩ resistor and an ideal ${voltageV} V supply, as shown.`,
    `The light-sensing divider of ${aOrAn(ctx)} pairs an LDR (${darkKOhm} kΩ in darkness, ${brightKOhm} kΩ in bright light) with a ${fixedKOhm} kΩ series resistor across an ideal ${voltageV} V source, with Vout read across the ${fixedKOhm} kΩ resistor.`,
    `Across an ideal ${voltageV} V DC terminal pair in ${aOrAn(ctx)}, an LDR of dark resistance ${darkKOhm} kΩ and bright-light resistance ${brightKOhm} kΩ sits in series with a ${fixedKOhm} kΩ resistor spanned by ideal voltmeter Vout.`,
    `Examine the ${ctx} circuit shown: an ideal ${voltageV} V cell drives an LDR (${darkKOhm} kΩ dark; ${brightKOhm} kΩ bright) and a ${fixedKOhm} kΩ fixed resistor across which ideal voltmeter Vout is connected.`,
  ];

  return {
    id,
    conceptId: "potential-divider-sensors",
    templateArchetype: "ldr-illumination-divider-stage",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind: "light-alarm",
      voltageV,
      fixedOhm,
      darkOhm,
      brightOhm,
    },
    hiddenQuantities,
    questionPlan: buildPreSolvePlan(
      "potential-divider-sensors",
      "ldr-illumination-divider-stage",
      "structured",
      "brightOutputV",
      ["darkCurrentA", "darkOutputV", "brightOutputV"],
    ),
    stem: structStems[slotIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the current in the circuit when the LDR is in darkness.",
        marks: 2,
        targetQuantityKey: "darkCurrentA",
        expectedAnswer: formatPhysicsQuantity(darkCurrentA, "A"),
        workingSteps: [
          `R_tot(dark) = ${darkOhm} + ${fixedOhm} = ${darkOhm + fixedOhm} Ω.`,
          `I_dark = ${voltageV} / ${darkOhm + fixedOhm} = ${formatPhysicsQuantity(darkCurrentA, "A")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Determine the voltmeter reading Vout in darkness.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "darkOutputV",
        expectedAnswer: formatPhysicsQuantity(darkOutputV, "V"),
        workingSteps: [
          `V_out(dark) = I_dark × R_fixed = ${formatPhysicsQuantity(darkCurrentA)} × ${fixedOhm} = ${formatPhysicsQuantity(darkOutputV, "V")}.`,
        ],
      },
      {
        partId: "c",
        prompt: "Calculate the voltmeter reading Vout when the LDR is exposed to bright light.",
        marks: 2,
        targetQuantityKey: "brightOutputV",
        expectedAnswer: formatPhysicsQuantity(brightOutputV, "V"),
        workingSteps: [
          `V_out(bright) = ${voltageV} × ${fixedKOhm} / (${brightKOhm} + ${fixedKOhm}) = ${formatPhysicsQuantity(brightOutputV, "V")}.`,
        ],
      },
    ],
    workedSolution: `(a) I_dark = ${voltageV} / (${darkOhm} + ${fixedOhm}) = ${formatPhysicsQuantity(darkCurrentA, "A")}. (b) V_out(dark) = ${formatPhysicsQuantity(darkOutputV, "V")}. (c) V_out(bright) = ${voltageV} × ${fixedKOhm} / (${brightKOhm} + ${fixedKOhm}) = ${formatPhysicsQuantity(brightOutputV, "V")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Converts kΩ to Ω and sums ${darkKOhm} kΩ + ${fixedKOhm} kΩ.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains I_dark = ${formatPhysicsQuantity(darkCurrentA, "A")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Multiplies I_dark by R_fixed or applies divider formula.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains V_out(dark) = ${formatPhysicsQuantity(darkOutputV, "V")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Uses bright LDR resistance ${brightKOhm} kΩ in potential-divider ratio.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains V_out(bright) = ${formatPhysicsQuantity(brightOutputV, "V")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// Archetype 6: potential-divider-sensors :: ntc-thermistor-divider-calibration
// ============================================================================

const NTC_CONTEXTS = [
  "neonatal incubator thermal-alarm divider",
  "lithium-ion pack over-temperature cutoff",
  "engine-coolant sensing bridge",
  "3D-printer hot-end thermistor loop",
  "fermentation vat temperature regulator",
  "quartz-crystal oven controller",
  "espresso boiler thermal-feedback divider",
  "vaccine cold-chain data-logger probe",
  "server-blade heatsink thermal monitor",
  "water-bath thermostat calibration circuit",
  "PCR thermal-cycler block sensor",
  "induction-cooktop pan-temperature sensor",
  "wind-turbine gearbox oil-temperature probe",
  "satellite battery-deck thermistor divider",
  "blood-warmer safety cutoff divider",
  "pasteurisation-line temperature monitor",
  "laser-diode TEC feedback divider",
  "HV transformer winding thermal probe",
  "refrigerated-truck evaporator sensor",
  "autoclave chamber temperature divider",
  "rotary-evaporator bath probe loop",
  "HVAC supply-duct air-temperature sensor",
] as const;

function buildNtcThermistorItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const syllabi = buildSyllabusTags(
    "potential-divider-sensors",
    format,
    slotIndex,
  );
  const difficulty = pickDifficulty(slotIndex);
  const ctx = NTC_CONTEXTS[slotIndex % NTC_CONTEXTS.length];

  const rFixed = randInt(12, 85, rand) * 10;
  let rNtc = randInt(15, 120, rand) * 10;
  if (Math.abs(rNtc - rFixed) < 40) rNtc += 70;
  const vIn = [5, 6, 9, 10, 12, 15, 24][randInt(0, 6, rand)];

  const rTot = rFixed + rNtc;
  const iLoop = vIn / rTot;
  const vNtc = iLoop * rNtc;
  const pNtc = iLoop * iLoop * rNtc;
  const inverseMode = slotIndex % 2 === 1;

  if (!inverseMode && format === "mcq") {
    const subSlot = Math.floor(slotIndex / 2);
    const askPower = subSlot % 2 === 1;
    const targetKey = askPower ? "branchOnePowerW" : "parallelVoltageV";
    const targetVal = askPower ? pNtc : vNtc;
    const unit = askPower ? "W" : "V";
    const hiddenQuantities = [
      "externalOhm",
      "totalOhm",
      "totalCurrentA",
      "parallelVoltageV",
      "totalSourcePowerW",
      "branchOneCurrentA",
      "branchOnePowerW",
    ];

    const distractors: DistractorCandidate[] = askPower
      ? [
          {
            value: iLoop * iLoop * rFixed,
            rationale: `Calculates the power dissipated in the ${rFixed} Ω fixed resistor rather than the ${rNtc} Ω NTC thermistor.`,
          },
          {
            value: vIn * iLoop,
            rationale:
              "Calculates total power supplied by the source to both resistors rather than self-heating in the thermistor alone.",
          },
          {
            value: iLoop * rNtc,
            rationale:
              "Computes I R (potential difference in volts) instead of I² R (power in watts).",
          },
          {
            value: (vIn * vIn) / rNtc,
            rationale: `Applies the full ${vIn} V supply across the NTC thermistor, ignoring the ${rFixed} Ω series resistor.`,
          },
        ]
      : [
          {
            value: (vIn * rFixed) / rTot,
            rationale: `Uses the wrong potential-divider numerator (${rFixed} Ω), finding the p.d. across the fixed resistor instead of across the ${rNtc} Ω NTC thermistor.`,
          },
          {
            value: (vIn * Math.min(rNtc, rFixed)) / Math.max(rNtc, rFixed),
            rationale:
              "Uses the ratio of the two resistances instead of dividing by their series sum (R_fixed + R_NTC).",
          },
          {
            value: vIn / 2,
            rationale:
              "Assumes half the supply voltage drops across the thermistor regardless of the resistance ratio.",
          },
          {
            value: Math.abs(vNtc - (vIn * rFixed) / rTot),
            rationale:
              "Takes the difference between the two resistor potential drops instead of the p.d. across the thermistor.",
          },
        ];

    const options = assembleMcqOptions(targetVal, unit, distractors, slotIndex);
    if (!options) return undefined;

    const askClause = askPower
      ? `What is the self-heating electrical power dissipated in the ${rNtc} Ω NTC thermistor?`
      : `What potential difference appears across the ${rNtc} Ω NTC thermistor?`;

    const stems = [
      `In ${aOrAn(ctx)}, an NTC thermistor (resistance decreases as temperature rises) has resistance ${rNtc} Ω at the operating point and sits in series with a ${rFixed} Ω fixed resistor across an ideal ${vIn} V DC supply, as shown. ${askClause}`,
      `The divider stage of ${aOrAn(ctx)} wires a ${rFixed} Ω reference resistor in series with an NTC thermistor (negative temperature coefficient; ${rNtc} Ω at the test temperature) across an ideal ${vIn} V source. ${askClause}`,
      `During steady-state calibration of ${aOrAn(ctx)}, an ideal ${vIn} V cell drives a ${rFixed} Ω resistor in series with a ${rNtc} Ω NTC thermistor (whose resistance falls with increasing temperature). ${askClause}`,
      `An ideal ${vIn} V rail powers ${aOrAn(ctx)} containing a ${rFixed} Ω series resistor and an NTC thermistor (resistance ${rNtc} Ω, decreasing when heated). ${askClause}`,
    ];

    return {
      id,
      conceptId: "potential-divider-sensors",
      templateArchetype: "ntc-thermistor-divider-calibration",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV: vIn,
        internalOhm: 0,
        seriesOhm: rFixed,
        parallelBranchOhms: [rNtc],
      },
      hiddenQuantities,
      targetQuantityKey: targetKey,
      questionPlan: buildPreSolvePlan(
        "potential-divider-sensors",
        "ntc-thermistor-divider-calibration",
        "mcq",
        targetKey,
      ),
      stem: stems[subSlot % stems.length],
      options,
      workedSolution: `Total series resistance R_tot = ${rFixed} + ${rNtc} = ${rTot} Ω. Current I = ${vIn} / ${rTot} = ${formatPhysicsQuantity(iLoop, "A")}. Potential difference across the NTC thermistor V_NTC = ${vIn} × ${rNtc} / ${rTot} = ${formatPhysicsQuantity(vNtc, "V")}, and self-heating power P_NTC = I² R_NTC = ${formatPhysicsQuantity(pNtc, "W")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates series NTC potential divider to obtain ${formatPhysicsQuantity(targetVal, unit)}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Inverse NTC readout
  const kNum = randInt(1, 7, rand);
  const kDen = kNum + randInt(2, 6, rand);
  const vInClean = kDen * randInt(1, 3, rand);
  const vNtcClean = kNum * (vInClean / kDen);
  const rFixedClean = (kDen - kNum) * randInt(4, 25, rand) * 10;
  const rNtcClean = Math.round((rFixedClean * vNtcClean) / (vInClean - vNtcClean));
  if (rNtcClean <= 0 || rNtcClean === rFixedClean) return undefined;

  const iClean = (vInClean - vNtcClean) / rFixedClean;
  const pClean = vNtcClean * iClean;

  const hiddenInverse = [
    "branch0",
    "parallelBranchOhms",
    "parallelOhm",
    "externalOhm",
    "totalOhm",
    "totalCurrentA",
    "totalSourcePowerW",
    "branchOneCurrentA",
    "branchOnePowerW",
  ];
  const givensInverse: RequiredGivenSpec[] = [
    { name: "emfV", value: vInClean, unit: "V", source: "either" },
    { name: "seriesOhm", value: rFixedClean, unit: "Ω", source: "either" },
    { name: "parallelVoltageV", value: vNtcClean, unit: "V", source: "stem" },
  ];

  if (format === "mcq") {
    const subSlot = Math.floor(slotIndex / 2);
    const distractors: DistractorCandidate[] = [
      {
        value: (rFixedClean * vNtcClean) / vInClean,
        rationale: `Divides V_NTC by the full ${vInClean} V supply voltage rather than by the voltage (${vInClean - vNtcClean} V) across the ${rFixedClean} Ω fixed resistor.`,
      },
      {
        value: (rFixedClean * (vInClean - vNtcClean)) / vNtcClean,
        rationale: `Inverts the potential-divider voltage ratio, multiplying ${rFixedClean} Ω by (V_in − V_NTC)/V_NTC instead of V_NTC/(V_in − V_NTC).`,
      },
      {
        value: (rFixedClean * vInClean) / vNtcClean,
        rationale: `Sets V_in / V_NTC = R_NTC / R_fixed instead of V_in / V_NTC = (R_fixed + R_NTC) / R_NTC, omitting the −R_fixed term.`,
      },
      {
        value: rFixedClean + (rFixedClean * vNtcClean) / (vInClean - vNtcClean),
        rationale:
          "Calculates the total circuit resistance (R_fixed + R_NTC) instead of the NTC thermistor resistance alone.",
      },
    ];
    const options = assembleMcqOptions(rNtcClean, "Ω", distractors, slotIndex);
    if (!options) return undefined;

    const invStems = [
      `An NTC thermistor R_1 (resistance decreases with rising temperature) sits in series with a ${rFixedClean} Ω resistor across an ideal ${vInClean} V source in ${aOrAn(ctx)}, as shown. When an ideal voltmeter across R_1 reads ${formatPhysicsQuantity(vNtcClean, "V")}, what is the resistance of R_1?`,
      `In the ${ctx} diagram, R_1 is an NTC thermistor (negative temperature coefficient) wired in series with a ${rFixedClean} Ω precision resistor across an ideal ${vInClean} V supply. At an operating point where the p.d. across R_1 is ${formatPhysicsQuantity(vNtcClean, "V")}, calculate R_1.`,
      `Monitoring ${aOrAn(ctx)} driven by an ideal ${vInClean} V cell, a technician records ${formatPhysicsQuantity(vNtcClean, "V")} on an ideal voltmeter across NTC thermistor R_1 (whose resistance drops when warmed) in series with ${rFixedClean} Ω. What is R_1?`,
      `Within ${aOrAn(ctx)}, a ${rFixedClean} Ω resistor and an NTC thermistor R_1 (negative temperature coefficient) share an ideal ${vInClean} V rail; given ${formatPhysicsQuantity(vNtcClean, "V")} across R_1, find R_1's resistance.`,
    ];

    return {
      id,
      conceptId: "potential-divider-sensors",
      templateArchetype: "ntc-thermistor-divider-calibration",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV: vInClean,
        internalOhm: 0,
        seriesOhm: rFixedClean,
        parallelBranchOhms: [rNtcClean],
      },
      hiddenQuantities: hiddenInverse,
      requiredGivens: givensInverse,
      targetQuantityKey: "parallelOhm",
      questionPlan: buildPreSolvePlan(
        "potential-divider-sensors",
        "ntc-thermistor-divider-calibration",
        "mcq",
        "parallelOhm",
      ),
      stem: invStems[subSlot % invStems.length],
      options,
      workedSolution: `Potential difference across the ${rFixedClean} Ω fixed resistor is V_s − V_NTC = ${vInClean} − ${formatPhysicsQuantity(vNtcClean)} = ${formatPhysicsQuantity(vInClean - vNtcClean, "V")}. Current I = ${formatPhysicsQuantity(vInClean - vNtcClean)} / ${rFixedClean} = ${formatPhysicsQuantity(iClean, "A")}. Hence R_1 = V_NTC / I = ${formatPhysicsQuantity(vNtcClean)} / ${formatPhysicsQuantity(iClean)} = ${formatPhysicsQuantity(rNtcClean, "Ω")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Uses V_fixed = ${formatPhysicsQuantity(vInClean - vNtcClean, "V")} to find I = ${formatPhysicsQuantity(iClean, "A")} and R_1 = ${formatPhysicsQuantity(rNtcClean, "Ω")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structStems = [
    `In ${aOrAn(ctx)}, an NTC thermistor R_1 (negative temperature coefficient: resistance decreases as temperature increases) is wired in series with a ${rFixedClean} Ω resistor across an ideal ${vInClean} V DC source, as shown. At the test temperature, an ideal voltmeter across R_1 reads ${formatPhysicsQuantity(vNtcClean, "V")}.`,
    `${aOrAn(ctx, true)} pairs a ${rFixedClean} Ω reference resistor in series with an NTC thermistor R_1 (whose resistance falls when heated) across an ideal ${vInClean} V cell; an ideal voltmeter across R_1 registers ${formatPhysicsQuantity(vNtcClean, "V")}.`,
    `During thermal calibration of ${aOrAn(ctx)}, an ideal ${vInClean} V rail supplies a ${rFixedClean} Ω resistor in series with NTC thermistor R_1 (negative temperature coefficient). Steady p.d. across R_1 is measured by an ideal voltmeter as ${formatPhysicsQuantity(vNtcClean, "V")}.`,
    `The diagram represents ${aOrAn(ctx)} where an NTC thermistor R_1 (resistance decreases with rising temperature) and a ${rFixedClean} Ω fixed resistor are connected across ${vInClean} V (ideal), giving ${formatPhysicsQuantity(vNtcClean, "V")} across R_1.`,
    `An engineer tests ${aOrAn(ctx)} comprising a ${rFixedClean} Ω resistor in series with NTC thermistor R_1 (negative temperature coefficient) on an ideal ${vInClean} V supply, recording ${formatPhysicsQuantity(vNtcClean, "V")} across R_1 with an ideal voltmeter.`,
    `Within ${aOrAn(ctx)}, series elements of ${rFixedClean} Ω and NTC thermistor R_1 (resistance drops as temperature rises) are energised by an ideal ${vInClean} V source; the potential difference across R_1 is ${formatPhysicsQuantity(vNtcClean, "V")}.`,
    `Refer to the schematic of ${aOrAn(ctx)}: across an ideal ${vInClean} V terminal pair, a ${rFixedClean} Ω resistor stands in series with an NTC thermistor R_1 (negative temperature coefficient) whose voltage is ${formatPhysicsQuantity(vNtcClean, "V")}.`,
  ];

  return {
    id,
    conceptId: "potential-divider-sensors",
    templateArchetype: "ntc-thermistor-divider-calibration",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind: "dc-series-parallel",
      emfV: vInClean,
      internalOhm: 0,
      seriesOhm: rFixedClean,
      parallelBranchOhms: [rNtcClean],
    },
    hiddenQuantities: hiddenInverse,
    requiredGivens: givensInverse,
    questionPlan: buildPreSolvePlan(
      "potential-divider-sensors",
      "ntc-thermistor-divider-calibration",
      "structured",
      "branchOnePowerW",
      ["totalCurrentA", "parallelOhm", "branchOnePowerW"],
    ),
    stem: structStems[slotIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: `Calculate the current in the ${rFixedClean} Ω resistor.`,
        marks: 2,
        targetQuantityKey: "totalCurrentA",
        expectedAnswer: formatPhysicsQuantity(iClean, "A"),
        workingSteps: [
          `V_fixed = ${vInClean} − ${formatPhysicsQuantity(vNtcClean)} = ${formatPhysicsQuantity(vInClean - vNtcClean, "V")}.`,
          `I = V_fixed / ${rFixedClean} = ${formatPhysicsQuantity(iClean, "A")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Determine the resistance of the NTC thermistor R_1 at this temperature.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "parallelOhm",
        expectedAnswer: formatPhysicsQuantity(rNtcClean, "Ω"),
        workingSteps: [
          `R_1 = V_NTC / I = ${formatPhysicsQuantity(vNtcClean)} / ${formatPhysicsQuantity(iClean)} = ${formatPhysicsQuantity(rNtcClean, "Ω")}.`,
        ],
      },
      {
        partId: "c",
        prompt: "Calculate the electrical power dissipated in the NTC thermistor.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "branchOnePowerW",
        expectedAnswer: formatPhysicsQuantity(pClean, "W"),
        workingSteps: [
          `P = V_NTC × I = ${formatPhysicsQuantity(vNtcClean)} × ${formatPhysicsQuantity(iClean)} = ${formatPhysicsQuantity(pClean, "W")}.`,
        ],
      },
    ],
    workedSolution: `(a) V_fixed = ${vInClean} − ${formatPhysicsQuantity(vNtcClean)} = ${formatPhysicsQuantity(vInClean - vNtcClean, "V")}, giving I = ${formatPhysicsQuantity(iClean, "A")}. (b) R_1 = ${formatPhysicsQuantity(vNtcClean)} / ${formatPhysicsQuantity(iClean)} = ${formatPhysicsQuantity(rNtcClean, "Ω")}. (c) P_1 = V_NTC I = ${formatPhysicsQuantity(pClean, "W")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Subtracts ${formatPhysicsQuantity(vNtcClean, "V")} from ${vInClean} V to find p.d. across ${rFixedClean} Ω.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains I = ${formatPhysicsQuantity(iClean, "A")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Divides V_NTC by the series current from (a).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains R_1 = ${formatPhysicsQuantity(rNtcClean, "Ω")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Uses P = V I or I² R_1.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains P = ${formatPhysicsQuantity(pClean, "W")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// Archetype 7: potential-divider-sensors :: sensor-bridge-loaded-divider
// ============================================================================

const LOADED_DIVIDER_CONTEXTS = [
  "potentiometer tap driving an actuator coil",
  "audio attenuator pad feeding a transducer",
  "strain-gauge half-bridge feeding an ADC input",
  "industrial proportional-valve divider stage",
  "thermocouple reference-bias divider",
  "laser-diode bias network with shunt load",
  "servo-potentiometer feedback stage",
  "fuel-float rheostat driving a gauge coil",
  "throttle-position divider feeding an ECU input",
  "joystick goniometer divider with load resistor",
  "pressure-transducer excitation divider",
  "chart-recorder range-attenuator network",
  "bench power-supply reference trim divider",
  "galvanometer damping-tap potential divider",
  "ultrasonic transducer bias-divider stage",
  "hall-sensor supply step-down divider",
  "hydraulic spool-valve command divider",
  "piezo-stage coarse-bias resistive divider",
  "optical modulator DC-offset divider",
  "anemometer vane-angle potentiometer stage",
  "motorised fader reference-tap network",
] as const;

function buildLoadedSensorDividerItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const scale = [1, 2, 5, 10][slotIndex % 4];
  const pair = pick(PARALLEL_PAIRS, rand);
  const rLower = pair[0] * scale;
  const rLoad = pair[1] * scale;
  const rPar = (rLower * rLoad) / (rLower + rLoad);
  const rUpper = randInt(3, 16, rand) * scale;
  const rTot = rUpper + rPar;
  const vIn = randInt(8, 36, rand);

  const iTot = vIn / rTot;
  const vOut = iTot * rPar;
  const vUnloaded = (vIn * rLower) / (rUpper + rLower);
  const iLoad = vOut / rLoad;
  const pLoad = (vOut * vOut) / rLoad;

  if (!valuesDistinctEnough(vOut, vUnloaded, 0.04)) return undefined;

  const syllabi = buildSyllabusTags(
    "potential-divider-sensors",
    format,
    slotIndex,
  );
  const difficulty = pickDifficulty(slotIndex);
  const ctx =
    LOADED_DIVIDER_CONTEXTS[slotIndex % LOADED_DIVIDER_CONTEXTS.length];
  const hiddenQuantities = [
    "parallelOhm",
    "externalOhm",
    "totalOhm",
    "totalCurrentA",
    "parallelVoltageV",
    "totalSourcePowerW",
    "branchOneCurrentA",
    "branchOnePowerW",
    "branchTwoCurrentA",
    "branchTwoPowerW",
  ];

  if (format === "mcq") {
    const mode = slotIndex % 3;
    const targetKey =
      mode === 0
        ? "parallelVoltageV"
        : mode === 1
          ? "branchTwoPowerW"
          : "branchTwoCurrentA";
    const targetVal = mode === 0 ? vOut : mode === 1 ? pLoad : iLoad;
    const unit = mode === 0 ? "V" : mode === 1 ? "W" : "A";

    const distractors: DistractorCandidate[] =
      mode === 0
        ? [
            {
              value: (vIn * rPar) / (rUpper + rLower + rLoad),
              rationale:
                "Uses parallel resistance in the numerator but sums all three resistances in the denominator.",
            },
            {
              value: vUnloaded,
              rationale: `Uses the unloaded potential-divider formula ${vIn} × ${rLower}/(${rUpper} + ${rLower}) without accounting for the parallel ${rLoad} Ω load.`,
            },
            {
              value: (vIn * (rLower + rLoad)) / (rUpper + rLower + rLoad),
              rationale: `Combines the ${rLower} Ω divider arm and ${rLoad} Ω load in series rather than in parallel.`,
            },
            {
              value: vIn - vOut,
              rationale: `Computes the potential drop across the upper ${rUpper} Ω section rather than across the loaded output.`,
            },
          ]
        : mode === 1
          ? [
              {
                value: (vIn / (rUpper + rLower + rLoad)) ** 2 * rLoad,
                rationale:
                  "Treats the lower divider resistor and external load as series elements.",
              },
              {
                value: (vUnloaded * vUnloaded) / rLoad,
                rationale: `Calculates V_out using the unloaded divider ratio (${formatPhysicsQuantity(vUnloaded, "V")}) before applying P = V²/R_load.`,
              },
              {
                value: iTot * iTot * rLoad,
                rationale: `Substitutes total supply current into I²R_load without current splitting between ${rLower} Ω and ${rLoad} Ω.`,
              },
              {
                value: (vOut * vOut) / rLower,
                rationale: `Calculates power dissipated in the ${rLower} Ω divider resistor instead of the ${rLoad} Ω load.`,
              },
            ]
          : [
              {
                value: vIn / (rUpper + rLower + rLoad),
                rationale:
                  "Places all three resistances in a single series loop.",
              },
              {
                value: vUnloaded / rLoad,
                rationale:
                  "Divides the unloaded divider voltage by R_load, neglecting voltage sag under load.",
              },
              {
                value: iTot,
                rationale:
                  "Reports the total current drawn from the supply rather than the current entering the load branch.",
              },
              {
                value: vOut / rLower,
                rationale: `Finds the current in the ${rLower} Ω bleed resistor rather than the ${rLoad} Ω load.`,
              },
            ];

    const options = assembleMcqOptions(targetVal, unit, distractors, slotIndex);
    if (!options) return undefined;

    const askClause =
      mode === 0
        ? `What loaded output potential difference appears across the ${rLoad} Ω load?`
        : mode === 1
          ? `What electrical power is delivered to the ${rLoad} Ω load?`
          : `What current flows through the ${rLoad} Ω load branch?`;

    const stems = [
      `${aOrAn(ctx, true)} uses ${rUpper} Ω and ${rLower} Ω divider resistors across an ideal ${vIn} V DC source, with a ${rLoad} Ω external load wired in parallel across the ${rLower} Ω arm as shown. ${askClause}`,
      `In the ${ctx} schematic, a ${rUpper} Ω–${rLower} Ω potential divider across ${vIn} V (ideal) is shunted across its ${rLower} Ω lower arm by a ${rLoad} Ω load resistor. ${askClause}`,
      `Connecting a ${rLoad} Ω resistive load across the ${rLower} Ω lower section of a ${rUpper} Ω–${rLower} Ω divider in ${aOrAn(ctx)} supplied at ${vIn} V (ideal) pulls down the output p.d. ${askClause}`,
      `An ideal ${vIn} V cell powers ${aOrAn(ctx)} where upper resistor ${rUpper} Ω feeds the parallel combination of lower divider arm ${rLower} Ω and load ${rLoad} Ω. ${askClause}`,
      `Within ${aOrAn(ctx)}, a ${rLoad} Ω load bridges the ${rLower} Ω resistor of a series divider completed by a ${rUpper} Ω resistor across an ideal ${vIn} V rail. ${askClause}`,
    ];

    return {
      id,
      conceptId: "potential-divider-sensors",
      templateArchetype: "sensor-bridge-loaded-divider",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV: vIn,
        internalOhm: 0,
        seriesOhm: rUpper,
        parallelBranchOhms: [rLower, rLoad],
      },
      hiddenQuantities,
      targetQuantityKey: targetKey,
      questionPlan: buildPreSolvePlan(
        "potential-divider-sensors",
        "sensor-bridge-loaded-divider",
        "mcq",
        targetKey,
      ),
      stem: stems[slotIndex % stems.length],
      options,
      workedSolution: `Parallel combination of lower arm and load: R_p = (${rLower} × ${rLoad})/(${rLower} + ${rLoad}) = ${formatPhysicsQuantity(rPar, "Ω")}. Loaded output V_out = ${vIn} × ${formatPhysicsQuantity(rPar)} / (${rUpper} + ${formatPhysicsQuantity(rPar)}) = ${formatPhysicsQuantity(vOut, "V")}. Load current I_load = V_out / ${rLoad} = ${formatPhysicsQuantity(iLoad, "A")} and load power P_load = V_out² / ${rLoad} = ${formatPhysicsQuantity(pLoad, "W")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Accounts for parallel loading (${formatPhysicsQuantity(rPar, "Ω")}) to obtain ${formatPhysicsQuantity(targetVal, unit)}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structStems = [
    `${aOrAn(ctx, true)} comprises a ${rUpper} Ω resistor in series with a ${rLower} Ω resistor across an ideal ${vIn} V DC source, with an external ${rLoad} Ω load connected in parallel across the ${rLower} Ω resistor as shown.`,
    `In ${aOrAn(ctx)}, an ideal ${vIn} V rail supplies a ${rUpper} Ω upper divider arm in series with a ${rLower} Ω lower arm shunted by a ${rLoad} Ω load resistor.`,
    `The schematic of ${aOrAn(ctx)} illustrates a loaded potential divider: ${rUpper} Ω in series with the parallel pair of ${rLower} Ω and ${rLoad} Ω across an ideal ${vIn} V cell.`,
    `To drive a ${rLoad} Ω load from an ideal ${vIn} V supply inside ${aOrAn(ctx)}, engineers place the ${rLoad} Ω load across the ${rLower} Ω resistor of a ${rUpper} Ω–${rLower} Ω divider.`,
    `During testing of ${aOrAn(ctx)}, a ${rLoad} Ω resistor is wired across the ${rLower} Ω lower section of a potential divider having a ${rUpper} Ω upper resistor and an ideal ${vIn} V source.`,
    `Across an ideal ${vIn} V source in ${aOrAn(ctx)}, a ${rUpper} Ω series resistor feeds a ${rLower} Ω divider arm bridged in parallel by a ${rLoad} Ω external load.`,
    `Refer to the diagram for ${aOrAn(ctx)}: a ${rUpper} Ω–${rLower} Ω divider across ${vIn} V (ideal) delivers power to a parallel ${rLoad} Ω load across the ${rLower} Ω arm.`,
  ];

  return {
    id,
    conceptId: "potential-divider-sensors",
    templateArchetype: "sensor-bridge-loaded-divider",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind: "dc-series-parallel",
      emfV: vIn,
      internalOhm: 0,
      seriesOhm: rUpper,
      parallelBranchOhms: [rLower, rLoad],
    },
    hiddenQuantities,
    questionPlan: buildPreSolvePlan(
      "potential-divider-sensors",
      "sensor-bridge-loaded-divider",
      "structured",
      "branchTwoPowerW",
      ["parallelOhm", "parallelVoltageV", "branchTwoPowerW"],
    ),
    stem: structStems[slotIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: `Calculate the equivalent resistance of the ${rLower} Ω resistor and ${rLoad} Ω load in parallel.`,
        marks: 2,
        targetQuantityKey: "parallelOhm",
        expectedAnswer: formatPhysicsQuantity(rPar, "Ω"),
        workingSteps: [
          `R_p = (${rLower} × ${rLoad}) / (${rLower} + ${rLoad}) = ${formatPhysicsQuantity(rPar, "Ω")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the potential difference across the ${rLoad} Ω load.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "parallelVoltageV",
        expectedAnswer: formatPhysicsQuantity(vOut, "V"),
        workingSteps: [
          `V_out = ${vIn} × ${formatPhysicsQuantity(rPar)} / (${rUpper} + ${formatPhysicsQuantity(rPar)}) = ${formatPhysicsQuantity(vOut, "V")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the electrical power dissipated in the ${rLoad} Ω load.`,
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "branchTwoPowerW",
        expectedAnswer: formatPhysicsQuantity(pLoad, "W"),
        workingSteps: [
          `P_load = V_out² / ${rLoad} = (${formatPhysicsQuantity(vOut)})² / ${rLoad} = ${formatPhysicsQuantity(pLoad, "W")}.`,
        ],
      },
    ],
    workedSolution: `(a) R_p = (${rLower} × ${rLoad})/(${rLower} + ${rLoad}) = ${formatPhysicsQuantity(rPar, "Ω")}. (b) V_out = ${vIn} × ${formatPhysicsQuantity(rPar)} / (${rUpper} + ${formatPhysicsQuantity(rPar)}) = ${formatPhysicsQuantity(vOut, "V")}. (c) P_load = V_out² / ${rLoad} = ${formatPhysicsQuantity(pLoad, "W")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Combines lower divider resistor and external load in parallel.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains R_p = ${formatPhysicsQuantity(rPar, "Ω")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Applies potential-divider equation with R_p and ${rUpper} Ω.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains V_out = ${formatPhysicsQuantity(vOut, "V")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Substitutes V_out into P = V² / ${rLoad}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains P_load = ${formatPhysicsQuantity(pLoad, "W")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// Archetype 8: emf-internal-resistance :: cell-terminal-pd-and-lost-volts
// ============================================================================

const SINGLE_CELL_CONTEXTS = [
  "starter-solenoid test battery",
  "portable defibrillator battery module",
  "field transceiver LiFePO4 pack",
  "cordless drill high-drain battery",
  "emergency exit-lamp NiMH cell",
  "underwater glider battery cell",
  "handheld thermal-camera battery",
  "seismic field-recorder lead-acid cell",
  "portable ultrasound probe pack",
  "electric-scooter auxiliary battery",
  "weather-buoy primary lithium cell",
  "aviation ELT beacon battery pack",
  "mine-rescue cap-lamp battery",
  "portable syringe-pump battery cell",
  "survey total-station battery pack",
  "insulated blood-transport cooler cell",
  "radio-sonde launch battery pack",
  "handheld oscilloscopes Li-ion pack",
  "agricultural fence-energiser battery",
  "marine VHF handheld transceiver pack",
  "portable gas-chromatograph battery",
  "autonomous snow-pillow logger battery",
] as const;

function buildCellTerminalPdItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const rInt = Number((0.4 + 0.3 * randInt(1, 10, rand)).toFixed(1));
  const rLoad = Number((2.5 + 1.5 * randInt(1, 14, rand)).toFixed(1));
  if (Math.abs(rLoad - rInt) < 1.0) return undefined;
  const rTot = Number((rInt + rLoad).toFixed(2));
  const iVal = Number((0.4 + 0.3 * randInt(1, 10, rand)).toFixed(2));
  const emfV = Number((rTot * iVal).toFixed(2));
  const iActual = emfV / rTot;
  const vTerm = iActual * rLoad;
  const vLost = iActual * rInt;
  const pLoad = iActual * iActual * rLoad;
  const pSource = emfV * iActual;

  const syllabi = buildSyllabusTags(
    "emf-internal-resistance",
    format,
    slotIndex,
  );
  const difficulty = pickDifficulty(slotIndex);
  const ctx = SINGLE_CELL_CONTEXTS[slotIndex % SINGLE_CELL_CONTEXTS.length];
  const hiddenQuantities = [
    "totalOhm",
    "totalCurrentA",
    "terminalVoltageV",
    "parallelVoltageV",
    "totalSourcePowerW",
    "branchOneCurrentA",
    "branchOnePowerW",
  ];

  if (format === "mcq") {
    const mode = slotIndex % 3;
    const targetKey =
      mode === 0
        ? "terminalVoltageV"
        : mode === 1
          ? "branchOnePowerW"
          : "totalCurrentA";
    const targetVal = mode === 0 ? vTerm : mode === 1 ? pLoad : iActual;
    const unit = mode === 0 ? "V" : mode === 1 ? "W" : "A";

    const distractors: DistractorCandidate[] =
      mode === 0
        ? [
            {
              value: vLost,
              rationale: `Calculates the "lost volts" I r = ${formatPhysicsQuantity(vLost, "V")} dropped across the internal resistance instead of the terminal potential difference ε − I r.`,
            },
            {
              value: emfV - (emfV / rLoad) * rInt,
              rationale: `Computes current as ε / R_load (ignoring r = ${rInt} Ω) before subtracting I r.`,
            },
            {
              value: emfV + vLost,
              rationale:
                "Adds I r to ε instead of subtracting I r when the cell is discharging.",
            },
            {
              value: emfV * (rLoad / Math.abs(rLoad - rInt)),
              rationale:
                "Subtracts internal resistance from load resistance in the potential-divider denominator.",
            },
          ]
        : mode === 1
          ? [
              {
                value: iActual * iActual * rInt,
                rationale: `Calculates wasted internal heating power I² r inside the ${rInt} Ω internal resistance instead of external load power.`,
              },
              {
                value: pSource,
                rationale:
                  "Calculates total chemical power ε I generated by the cell rather than power dissipated in the external load.",
              },
              {
                value: (emfV * emfV) / rLoad,
                rationale: `Substitutes the cell emf (${emfV} V) instead of the terminal p.d. into P = V² / R, neglecting internal resistance.`,
              },
              {
                value: vTerm * (emfV / rLoad),
                rationale: "Mixes terminal voltage with ideal unloaded current ε / R.",
              },
            ]
          : [
              {
                value: emfV / (rLoad + 2 * rInt),
                rationale: "Double-counts internal resistance in the closed loop.",
              },
              {
                value: emfV / rLoad,
                rationale: `Omits the ${rInt} Ω internal resistance and computes I = ε / R_load.`,
              },
              {
                value: emfV / Math.abs(rLoad - rInt),
                rationale:
                  "Subtracts internal resistance from load resistance instead of adding them in ε = I(R + r).",
              },
              {
                value: emfV / rInt,
                rationale: `Calculates the short-circuit current ε / r instead of the current with the ${rLoad} Ω load connected.`,
              },
            ];

    const options = assembleMcqOptions(targetVal, unit, distractors, slotIndex);
    if (!options) return undefined;

    const askClause =
      mode === 0
        ? "What is the terminal potential difference across the battery?"
        : mode === 1
          ? `What power is dissipated in the ${rLoad} Ω external load?`
          : "What current is delivered by the battery?";

    const stems = [
      `${aOrAn(ctx, true)} of emf ${emfV} V and internal resistance ${rInt} Ω is wired directly across a ${rLoad} Ω external resistor, as shown. ${askClause}`,
      `In the schematic for ${aOrAn(ctx)}, a non-ideal cell (ε = ${emfV} V, r = ${rInt} Ω) supplies a single ${rLoad} Ω resistive load. ${askClause}`,
      `Load-testing ${aOrAn(ctx)} rated at emf ${emfV} V with ${rInt} Ω internal resistance, a technician connects a ${rLoad} Ω resistor across its terminals. ${askClause}`,
      `The circuit models ${aOrAn(ctx)} as an ideal ${emfV} V source in series with ${rInt} Ω internal resistance driving a ${rLoad} Ω load. ${askClause}`,
      `Across the terminals of ${aOrAn(ctx)} (emf ${emfV} V, internal resistance ${rInt} Ω), a ${rLoad} Ω resistor completes a closed loop. ${askClause}`,
      `When a ${rLoad} Ω load is connected to ${aOrAn(ctx)} having ε = ${emfV} V and r = ${rInt} Ω as illustrated, ${askClause.charAt(0).toLowerCase()}${askClause.slice(1)}`,
      `Refer to the diagram of ${aOrAn(ctx)}: internal resistance ${rInt} Ω sits in series with emf ${emfV} V across an external ${rLoad} Ω resistor. ${askClause}`,
    ];

    return {
      id,
      conceptId: "emf-internal-resistance",
      templateArchetype: "cell-terminal-pd-and-lost-volts",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV,
        internalOhm: rInt,
        seriesOhm: 0,
        parallelBranchOhms: [rLoad],
      },
      hiddenQuantities,
      targetQuantityKey: targetKey,
      questionPlan: buildPreSolvePlan(
        "emf-internal-resistance",
        "cell-terminal-pd-and-lost-volts",
        "mcq",
        targetKey,
      ),
      stem: stems[slotIndex % stems.length],
      options,
      workedSolution: `Using ε = I(R + r): I = ${emfV} / (${rLoad} + ${rInt}) = ${formatPhysicsQuantity(iActual, "A")}. Terminal p.d. V = ε − I r = ${emfV} − (${formatPhysicsQuantity(iActual)})(${rInt}) = ${formatPhysicsQuantity(vTerm, "V")}. External load power P = I² R = ${formatPhysicsQuantity(pLoad, "W")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Applies ε = I(R + r) to obtain ${formatPhysicsQuantity(targetVal, unit)}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structStems = [
    `${aOrAn(ctx, true)} has electromotive force ε = ${emfV} V and internal resistance r = ${rInt} Ω, and is connected across an external ${rLoad} Ω load resistor as shown.`,
    `In a bench discharge check on ${aOrAn(ctx)} (ε = ${emfV} V, r = ${rInt} Ω), a ${rLoad} Ω resistor is wired directly between its terminals.`,
    `The diagram represents ${aOrAn(ctx)} of emf ${emfV} V and internal resistance ${rInt} Ω delivering steady current to a ${rLoad} Ω external resistor.`,
    `To evaluate voltage droop in ${aOrAn(ctx)}, a ${rLoad} Ω load is connected across the cell terminals (emf ${emfV} V, internal resistance ${rInt} Ω).`,
    `An external ${rLoad} Ω resistor closes the circuit across ${aOrAn(ctx)} characterised by emf ${emfV} V and internal resistance ${rInt} Ω, as illustrated.`,
    `Within ${aOrAn(ctx)} test fixture, a source of emf ${emfV} V and internal resistance ${rInt} Ω energises a single ${rLoad} Ω resistor.`,
    `Refer to the schematic of ${aOrAn(ctx)}: an emf of ${emfV} V with series internal resistance ${rInt} Ω drives an external ${rLoad} Ω load.`,
  ];

  return {
    id,
    conceptId: "emf-internal-resistance",
    templateArchetype: "cell-terminal-pd-and-lost-volts",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind: "dc-series-parallel",
      emfV,
      internalOhm: rInt,
      seriesOhm: 0,
      parallelBranchOhms: [rLoad],
    },
    hiddenQuantities,
    questionPlan: buildPreSolvePlan(
      "emf-internal-resistance",
      "cell-terminal-pd-and-lost-volts",
      "structured",
      "branchOnePowerW",
      ["totalCurrentA", "terminalVoltageV", "branchOnePowerW"],
    ),
    stem: structStems[slotIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the current in the circuit.",
        marks: 2,
        targetQuantityKey: "totalCurrentA",
        expectedAnswer: formatPhysicsQuantity(iActual, "A"),
        workingSteps: [
          `R_tot = R + r = ${rLoad} + ${rInt} = ${formatPhysicsQuantity(rTot, "Ω")}.`,
          `I = ε / (R + r) = ${emfV} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iActual, "A")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the terminal potential difference across the battery.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "terminalVoltageV",
        expectedAnswer: formatPhysicsQuantity(vTerm, "V"),
        workingSteps: [
          `V = ε − I r = ${emfV} − (${formatPhysicsQuantity(iActual)})(${rInt}) = ${formatPhysicsQuantity(vTerm, "V")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the electrical power dissipated in the ${rLoad} Ω external load.`,
        marks: 2,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "branchOnePowerW",
        expectedAnswer: formatPhysicsQuantity(pLoad, "W"),
        workingSteps: [
          `P_ext = V × I = ${formatPhysicsQuantity(vTerm)} × ${formatPhysicsQuantity(iActual)} = ${formatPhysicsQuantity(pLoad, "W")}.`,
        ],
      },
    ],
    workedSolution: `(a) I = ${emfV} / (${rLoad} + ${rInt}) = ${formatPhysicsQuantity(iActual, "A")}. (b) V = ${emfV} − (${formatPhysicsQuantity(iActual)})(${rInt}) = ${formatPhysicsQuantity(vTerm, "V")}. (c) P_ext = I² R = ${formatPhysicsQuantity(pLoad, "W")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Applies I = ε / (R + r).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains I = ${formatPhysicsQuantity(iActual, "A")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Uses V = ε − I r or V = I R_load.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains V = ${formatPhysicsQuantity(vTerm, "V")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Uses P = V I or I² R_load with external quantities.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains P = ${formatPhysicsQuantity(pLoad, "W")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// Archetype 9: emf-internal-resistance :: two-point-vi-emf-internal-resistance
// ============================================================================

const VI_EXPERIMENT_CONTEXTS = [
  "variable-resistor cell characterisation practical",
  "MPPT solar-module bench test",
  "fuel-cell polarisation-curve check",
  "aircraft NiCd battery maintenance audit",
  "thermoelectric generator V–I slope test",
  "weather-station battery health audit",
  "marine deep-cycle cell load-bank test",
  "electrochemical cell coursework investigation",
  "Daniel-cell internal-resistance lab",
  "lead-acid standby cell load step test",
  "alkaline lantern-battery rheostat practical",
  "isotope thermoelectric source bench check",
  "forklift traction-cell two-load test",
  "regenerative fuel-cell stack check",
  "telecom backup-cell acceptance test",
  "scooter battery-module two-point audit",
  "solar-car sub-array V–I check",
  "cryogenic reference-cell impedance check",
  "ROV battery pod pre-dive load test",
  "microgrid storage-cell acceptance check",
  "portable generator exciter-battery test",
  "railways track-circuit cell audit",
] as const;

function buildTwoPointViItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const rTrue = Number((0.5 + 0.25 * randInt(1, 12, rand)).toFixed(2));
  const i1 = Number((0.4 + 0.2 * randInt(1, 6, rand)).toFixed(1));
  const deltaI = Number((1.2 + 0.4 * randInt(1, 8, rand)).toFixed(1));
  const i2 = Number((i1 + deltaI).toFixed(1));
  const v2 = Number((3.0 + 1.2 * randInt(1, 14, rand)).toFixed(2));
  const emfTrue = Number((v2 + i2 * rTrue).toFixed(2));
  const v1 = Number((emfTrue - i1 * rTrue).toFixed(2));

  if (
    !valuesDistinctEnough(rTrue, i1, 0.05) ||
    !valuesDistinctEnough(rTrue, i2, 0.05) ||
    !valuesDistinctEnough(emfTrue, v1, 0.04)
  ) {
    return undefined;
  }

  const syllabi = buildSyllabusTags(
    "emf-internal-resistance",
    format,
    slotIndex,
  );
  const difficulty = pickDifficulty(slotIndex);
  const ctx = VI_EXPERIMENT_CONTEXTS[slotIndex % VI_EXPERIMENT_CONTEXTS.length];
  const hiddenQuantities = ["resistorOhm", "internalResistanceOhm", "emfV"];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "i1A", value: i1, unit: "A", source: "stem" },
    { name: "v1V", value: v1, unit: "V", source: "stem" },
    { name: "i2A", value: i2, unit: "A", source: "stem" },
    { name: "v2V", value: v2, unit: "V", source: "stem" },
  ];

  if (format === "mcq") {
    const askEmf = slotIndex % 2 === 1;
    const targetKey = askEmf ? "emfV" : "internalResistanceOhm";
    const targetVal = askEmf ? emfTrue : rTrue;
    const unit = askEmf ? "V" : "Ω";

    const distractors: DistractorCandidate[] = askEmf
      ? [
          {
            value: (v1 + v2) / 2,
            rationale:
              "Takes the arithmetic mean of the two terminal voltages instead of extrapolating V = ε − I r to I = 0.",
          },
          {
            value: Math.abs(v1 - i1 * rTrue),
            rationale:
              "Subtracts I_1 r from V_1 instead of adding lost volts V_1 + I_1 r when extrapolating to zero current.",
          },
          {
            value: v1 + i1 * ((i2 - i1) / (v1 - v2)),
            rationale:
              "Uses the inverted slope ΔI / ΔV in place of internal resistance r when computing ε = V_1 + I_1 r.",
          },
          {
            value: v1 + v2,
            rationale:
              "Adds the two measured terminal potential differences directly.",
          },
        ]
      : [
          {
            value: (i2 - i1) / (v1 - v2),
            rationale:
              "Inverts the gradient to calculate |ΔI / ΔV| instead of |ΔV / ΔI|.",
          },
          {
            value: v2 / i2,
            rationale: `Computes V_2 / I_2 (${formatPhysicsQuantity(v2 / i2, "Ω")}), giving the external load resistance at the second setting rather than −ΔV / ΔI.`,
          },
          {
            value: (v1 + v2) / (i1 + i2),
            rationale:
              "Divides the sum of voltages by the sum of currents instead of evaluating the magnitude of the V–I gradient.",
          },
          {
            value: v1 / i1,
            rationale: `Computes static ratio V_1 / I_1 (${formatPhysicsQuantity(v1 / i1, "Ω")}), which is the external load resistance at the first setting rather than internal resistance.`,
          },
        ];

    const options = assembleMcqOptions(targetVal, unit, distractors, slotIndex);
    if (!options) return undefined;

    const askClause = askEmf
      ? "What is the electromotive force (emf) of the source?"
      : "What is the internal resistance of the source?";

    const stems = [
      `During ${aOrAn(ctx)} (modelled by source V with internal and load resistances R in series), terminal p.d. is ${v1} V at current ${i1} A and drops to ${v2} V when current increases to ${i2} A. ${askClause}`,
      `In ${aOrAn(ctx)}, ideal meters across a constant-r source record V_1 = ${v1} V when I_1 = ${i1} A, and V_2 = ${v2} V when I_2 = ${i2} A. ${askClause}`,
      `Switching between two load settings in ${aOrAn(ctx)} (series loop shown) changes the current from ${i1} A to ${i2} A while terminal voltage falls from ${v1} V to ${v2} V. ${askClause}`,
      `Two steady operating points are logged in ${aOrAn(ctx)}: (${i1} A, ${v1} V) and (${i2} A, ${v2} V). Assuming ohmic internal resistance, ${askClause.charAt(0).toLowerCase()}${askClause.slice(1)}`,
      `A cell under ${aOrAn(ctx)} delivers ${i1} A at terminal voltage ${v1} V, and ${i2} A at terminal voltage ${v2} V (equivalent loop illustrated). ${askClause}`,
      `From ${aOrAn(ctx)}, a student tabulates terminal p.d. ${v1} V at ${i1} A and ${v2} V at ${i2} A for the linear source shown. ${askClause}`,
      `Refer to the series test loop for ${aOrAn(ctx)}: increasing current drawn from ${i1} A to ${i2} A reduces terminal voltage from ${v1} V to ${v2} V. ${askClause}`,
    ];

    return {
      id,
      conceptId: "emf-internal-resistance",
      templateArchetype: "two-point-vi-emf-internal-resistance",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "internal-resistance",
        measurements: [
          { currentA: i1, terminalVoltageV: v1 },
          { currentA: i2, terminalVoltageV: v2 },
        ],
      },
      hiddenQuantities,
      requiredGivens,
      targetQuantityKey: targetKey,
      questionPlan: buildPreSolvePlan(
        "emf-internal-resistance",
        "two-point-vi-emf-internal-resistance",
        "mcq",
        targetKey,
      ),
      stem: stems[slotIndex % stems.length],
      options,
      workedSolution: `Using V = ε − I r, internal resistance r = (V_1 − V_2)/(I_2 − I_1) = (${v1} − ${v2})/(${i2} − ${i1}) = ${formatPhysicsQuantity(rTrue, "Ω")}. Substituting back gives ε = V_1 + I_1 r = ${v1} + (${i1})(${formatPhysicsQuantity(rTrue)}) = ${formatPhysicsQuantity(emfTrue, "V")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Solves simultaneous V = ε − I r equations to obtain ${formatPhysicsQuantity(targetVal, unit)}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structStems = [
    `In ${aOrAn(ctx)} (represented by the series resistance loop shown), a student measures a terminal p.d. of ${v1} V at ${i1} A; reducing the load resistance raises current to ${i2} A and lowers terminal p.d. to ${v2} V.`,
    `Two load steps in ${aOrAn(ctx)} yield ideal meter readings of (${i1} A, ${v1} V) and (${i2} A, ${v2} V) across the source modelled in the diagram.`,
    `During ${aOrAn(ctx)}, terminal potential difference across a battery is ${v1} V when delivering ${i1} A, and ${v2} V when delivering ${i2} A (equivalent loop illustrated).`,
    `A technician conducting ${aOrAn(ctx)} records terminal voltage ${v1} V at current ${i1} A, followed by ${v2} V at ${i2} A on the test loop shown.`,
    `To find ε and r in ${aOrAn(ctx)}, two steady operating states are measured on the series circuit shown: I_1 = ${i1} A at V_1 = ${v1} V, and I_2 = ${i2} A at V_2 = ${v2} V.`,
    `Across the linear DC source in ${aOrAn(ctx)} (series model shown), stepping load current from ${i1} A up to ${i2} A causes terminal voltage to sag from ${v1} V to ${v2} V.`,
    `Data from ${aOrAn(ctx)} show that a cell maintains ${v1} V across its terminals at ${i1} A, falling to ${v2} V when current reaches ${i2} A.`,
    `Refer to the schematic for ${aOrAn(ctx)}: two rheostat positions produce readings of ${v1} V at ${i1} A and ${v2} V at ${i2} A.`,
  ];

  return {
    id,
    conceptId: "emf-internal-resistance",
    templateArchetype: "two-point-vi-emf-internal-resistance",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind: "internal-resistance",
      measurements: [
        { currentA: i1, terminalVoltageV: v1 },
        { currentA: i2, terminalVoltageV: v2 },
      ],
    },
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildPreSolvePlan(
      "emf-internal-resistance",
      "two-point-vi-emf-internal-resistance",
      "structured",
      "emfV",
      ["internalResistanceOhm", "emfV"],
    ),
    stem: structStems[slotIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the internal resistance of the source.",
        marks: 2,
        targetQuantityKey: "internalResistanceOhm",
        expectedAnswer: formatPhysicsQuantity(rTrue, "Ω"),
        workingSteps: [
          `From V = ε − I r, r = (V_1 − V_2) / (I_2 − I_1).`,
          `r = (${v1} − ${v2}) / (${i2} − ${i1}) = ${formatPhysicsQuantity(rTrue, "Ω")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Determine the electromotive force (emf) of the source.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "emfV",
        expectedAnswer: formatPhysicsQuantity(emfTrue, "V"),
        workingSteps: [
          `ε = V_1 + I_1 r = ${v1} + (${i1})(${formatPhysicsQuantity(rTrue)}) = ${formatPhysicsQuantity(emfTrue, "V")}.`,
        ],
      },
    ],
    workedSolution: `(a) r = (${v1} − ${v2}) / (${i2} − ${i1}) = ${formatPhysicsQuantity(rTrue, "Ω")}. (b) ε = ${v1} + ${i1} × ${formatPhysicsQuantity(rTrue)} = ${formatPhysicsQuantity(emfTrue, "V")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Equates internal resistance to (V_1 − V_2) / (I_2 − I_1).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains r = ${formatPhysicsQuantity(rTrue, "Ω")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Substitutes r into ε = V + I r.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ε = ${formatPhysicsQuantity(emfTrue, "V")}.`,
        marks: 1,
      },
    ],
    totalMarks: 4,
    generatorModel,
  };
}

// ============================================================================
// Archetype 10: emf-internal-resistance :: non-ideal-battery-parallel-network-energy
// ============================================================================

const BATTERY_NETWORK_CONTEXTS = [
  "off-grid cabin DC lighting and pump bus",
  "lunar rover heater and transceiver bus",
  "electric-boat bilge and navigation circuit",
  "field-hospital DC distribution unit",
  "glacier-monitoring battery power stage",
  "beehive winter-warming battery loop",
  "mine-shaft emergency beacon circuit",
  "portable X-ray filament standby supply",
  "arctic lidar heater-and-blower battery bus",
  "autonomous sailboat autopilot power bus",
  "mobile blood-bank compressor DC loop",
  "forestry fire-tower radio and beacon bus",
  "railway track-side battery cabinet",
  "cave-rescue repeater battery network",
  "desert solar-kiosk night battery bus",
  "subsea benthic-lander battery harness",
  "portable FTIR interferometer DC supply",
  "high-altitude drone umbilical battery box",
  "offshore wave-rider buoy battery bus",
  "volcano-observatory tiltmeter battery loop",
  "polar ice-core drill control battery bus",
  "mobile air-sampling pump battery network",
] as const;

function buildNonIdealParallelEnergyItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const pair = pick(PARALLEL_PAIRS, rand);
  const r1 = pair[0];
  const r2 = pair[1];
  const rPar = (r1 * r2) / (r1 + r2);
  const rSer = randInt(2, 10, rand);
  const rExt = rSer + rPar;
  const rInt = Number((0.5 + 0.5 * randInt(1, 6, rand)).toFixed(1));
  const rTot = rExt + rInt;
  const iTot = [0.8, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0][randInt(0, 6, rand)];
  const emfV = Number((rTot * iTot).toFixed(2));
  const durationS = [15, 20, 25, 30, 40, 50, 60, 90, 120][randInt(0, 8, rand)];

  const vTerm = emfV - iTot * rInt;
  const eExt = vTerm * iTot * durationS;
  const eSource = emfV * iTot * durationS;
  const eInternal = iTot * iTot * rInt * durationS;

  const syllabi = buildSyllabusTags(
    "emf-internal-resistance",
    format,
    slotIndex,
  );
  const difficulty = pickDifficulty(slotIndex);
  const ctx =
    BATTERY_NETWORK_CONTEXTS[slotIndex % BATTERY_NETWORK_CONTEXTS.length];
  const hiddenQuantities = [
    "parallelOhm",
    "externalOhm",
    "totalOhm",
    "totalCurrentA",
    "terminalVoltageV",
    "parallelVoltageV",
    "totalSourcePowerW",
    "branchOneCurrentA",
    "branchOnePowerW",
    "branchTwoCurrentA",
    "branchTwoPowerW",
    "externalEnergyJ",
  ];

  if (format === "mcq") {
    const askTermV = slotIndex % 3 === 1;
    const targetKey = askTermV ? "terminalVoltageV" : "externalEnergyJ";
    const targetVal = askTermV ? vTerm : eExt;
    const unit = askTermV ? "V" : "J";

    const distractors: DistractorCandidate[] = askTermV
      ? [
          {
            value: iTot * rInt,
            rationale: `Finds the internal lost volts I r rather than the terminal p.d. ε − I r.`,
          },
          {
            value: iTot * rPar,
            rationale: `Calculates the p.d. across only the parallel section (${formatPhysicsQuantity(iTot * rPar, "V")}), omitting the ${rSer} Ω external series resistor from the terminal p.d.`,
          },
          {
            value:
              emfV -
              (emfV / (rInt + rSer + r1 + r2)) * rInt,
            rationale: `Adds parallel branches ${r1} Ω and ${r2} Ω in series when finding battery current.`,
          },
          {
            value: emfV + iTot * rInt,
            rationale: "Uses V = ε + I r instead of V = ε − I r during discharge.",
          },
        ]
      : [
          {
            value: eInternal,
            rationale: `Computes energy wasted internally (I² r t) instead of energy delivered to the external circuit.`,
          },
          {
            value: vTerm * iTot,
            rationale: `Calculates external electrical power in watts without multiplying by the ${durationS} s operating interval.`,
          },
          {
            value: eSource,
            rationale: `Calculates total chemical energy ε I t (${formatPhysicsQuantity(eSource, "J")}), failing to exclude heat dissipated in the ${rInt} Ω internal resistance.`,
          },
          {
            value: ((emfV * emfV) / rExt) * durationS,
            rationale: `Applies full emf (${emfV} V) across R_ext, ignoring internal resistance ${rInt} Ω.`,
          },
        ];

    const options = assembleMcqOptions(targetVal, unit, distractors, slotIndex);
    if (!options) return undefined;

    const askClause = askTermV
      ? `What is the battery's terminal potential difference during steady ${durationS} s operation?`
      : `How much electrical energy is transferred to the external circuit over ${durationS} s?`;

    const stems = [
      `A battery of emf ${emfV} V and internal resistance ${rInt} Ω powers ${aOrAn(ctx)} made of a ${rSer} Ω series resistor and parallel ${r1} Ω and ${r2} Ω branches, as shown. ${askClause}`,
      `In the ${ctx} diagram, a non-ideal source (ε = ${emfV} V, r = ${rInt} Ω) feeds a ${rSer} Ω line resistor ahead of parallel ${r1} Ω and ${r2} Ω loads. ${askClause}`,
      `Over a ${durationS} s cycle of ${aOrAn(ctx)}, a ${emfV} V battery (${rInt} Ω internal resistance) drives a ${rSer} Ω resistor in series with parallel ${r1} Ω and ${r2} Ω resistors. ${askClause}`,
      `${aOrAn(ctx, true)} connects parallel ${r1} Ω and ${r2} Ω loads via a ${rSer} Ω series resistor to a ${emfV} V cell of internal resistance ${rInt} Ω. ${askClause}`,
      `Refer to the schematic of ${aOrAn(ctx)}: emf ${emfV} V with internal resistance ${rInt} Ω energises a ${rSer} Ω series element and parallel ${r1} Ω and ${r2} Ω arms. ${askClause}`,
    ];

    return {
      id,
      conceptId: "emf-internal-resistance",
      templateArchetype: "non-ideal-battery-parallel-network-energy",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV,
        internalOhm: rInt,
        seriesOhm: rSer,
        parallelBranchOhms: [r1, r2],
        durationS,
      },
      hiddenQuantities,
      targetQuantityKey: targetKey,
      questionPlan: buildPreSolvePlan(
        "emf-internal-resistance",
        "non-ideal-battery-parallel-network-energy",
        "mcq",
        targetKey,
      ),
      stem: stems[slotIndex % stems.length],
      options,
      workedSolution: `R_p = (${r1} × ${r2})/(${r1} + ${r2}) = ${formatPhysicsQuantity(rPar, "Ω")}, R_ext = ${rSer} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rExt, "Ω")}, and R_tot = ${formatPhysicsQuantity(rExt)} + ${rInt} = ${formatPhysicsQuantity(rTot, "Ω")}. Current I = ${emfV} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iTot, "A")}. Terminal p.d. V_term = ${emfV} − (${formatPhysicsQuantity(iTot)})(${rInt}) = ${formatPhysicsQuantity(vTerm, "V")}, and external energy E_ext = V_term I t = ${formatPhysicsQuantity(eExt, "J")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Obtains ${formatPhysicsQuantity(targetVal, unit)}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structStems = [
    `${aOrAn(ctx, true)} uses a battery of emf ${emfV} V and internal resistance ${rInt} Ω connected to a ${rSer} Ω resistor in series with parallel ${r1} Ω and ${r2} Ω resistors, operating steadily for ${durationS} s.`,
    `In the schematic for ${aOrAn(ctx)}, a ${emfV} V battery of internal resistance ${rInt} Ω drives a ${rSer} Ω series resistor and parallel ${r1} Ω and ${r2} Ω branches continuously for ${durationS} s.`,
    `During a ${durationS} s run of ${aOrAn(ctx)}, a source with ε = ${emfV} V and r = ${rInt} Ω supplies a ${rSer} Ω line resistor followed by parallel ${r1} Ω and ${r2} Ω loads.`,
    `Parallel ${r1} Ω and ${r2} Ω resistors in series with a ${rSer} Ω resistor form ${aOrAn(ctx)} energised for ${durationS} s by a ${emfV} V battery of internal resistance ${rInt} Ω.`,
    `An engineer evaluates ${aOrAn(ctx)} where a battery (emf ${emfV} V, internal resistance ${rInt} Ω) feeds a ${rSer} Ω resistor and parallel ${r1} Ω and ${r2} Ω elements over ${durationS} s.`,
    `Across the terminals of a ${emfV} V, ${rInt} Ω battery in ${aOrAn(ctx)}, a ${rSer} Ω resistor leads into parallel ${r1} Ω and ${r2} Ω branches for a steady ${durationS} s interval.`,
    `The diagram depicts ${aOrAn(ctx)} powered for ${durationS} s by a non-ideal cell (ε = ${emfV} V, r = ${rInt} Ω) connected to ${rSer} Ω in series with ${r1} Ω ∥ ${r2} Ω.`,
    `Refer to ${aOrAn(ctx)} shown: a ${emfV} V source with ${rInt} Ω internal resistance delivers current for ${durationS} s through a ${rSer} Ω resistor to parallel ${r1} Ω and ${r2} Ω arms.`,
  ];

  return {
    id,
    conceptId: "emf-internal-resistance",
    templateArchetype: "non-ideal-battery-parallel-network-energy",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind: "dc-series-parallel",
      emfV,
      internalOhm: rInt,
      seriesOhm: rSer,
      parallelBranchOhms: [r1, r2],
      durationS,
    },
    hiddenQuantities,
    questionPlan: buildPreSolvePlan(
      "emf-internal-resistance",
      "non-ideal-battery-parallel-network-energy",
      "structured",
      "externalEnergyJ",
      ["totalCurrentA", "terminalVoltageV", "externalEnergyJ"],
    ),
    stem: structStems[slotIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the current drawn from the battery.",
        marks: 2,
        targetQuantityKey: "totalCurrentA",
        expectedAnswer: formatPhysicsQuantity(iTot, "A"),
        workingSteps: [
          `R_p = (${r1} × ${r2}) / (${r1} + ${r2}) = ${formatPhysicsQuantity(rPar, "Ω")}; R_ext = ${rSer} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rExt, "Ω")}.`,
          `I = ${emfV} / (${formatPhysicsQuantity(rExt)} + ${rInt}) = ${formatPhysicsQuantity(iTot, "A")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the terminal potential difference across the battery.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "terminalVoltageV",
        expectedAnswer: formatPhysicsQuantity(vTerm, "V"),
        workingSteps: [
          `V_term = ε − I r = ${emfV} − (${formatPhysicsQuantity(iTot)})(${rInt}) = ${formatPhysicsQuantity(vTerm, "V")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the total electrical energy transferred to the external circuit in ${durationS} s.`,
        marks: 2,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "externalEnergyJ",
        expectedAnswer: formatPhysicsQuantity(eExt, "J"),
        workingSteps: [
          `E_ext = V_term × I × t = ${formatPhysicsQuantity(vTerm)} × ${formatPhysicsQuantity(iTot)} × ${durationS} = ${formatPhysicsQuantity(eExt, "J")}.`,
        ],
      },
    ],
    workedSolution: `(a) R_p = ${formatPhysicsQuantity(rPar, "Ω")}, R_ext = ${formatPhysicsQuantity(rExt, "Ω")}, I = ${emfV} / (${formatPhysicsQuantity(rExt)} + ${rInt}) = ${formatPhysicsQuantity(iTot, "A")}. (b) V_term = ${emfV} − (${formatPhysicsQuantity(iTot)})(${rInt}) = ${formatPhysicsQuantity(vTerm, "V")}. (c) E_ext = V_term I t = ${formatPhysicsQuantity(eExt, "J")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Finds R_ext = ${formatPhysicsQuantity(rExt, "Ω")} and adds ${rInt} Ω internal resistance.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains I = ${formatPhysicsQuantity(iTot, "A")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies V_term = ε − I r or I R_ext.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains V_term = ${formatPhysicsQuantity(vTerm, "V")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Uses E_ext = V_term I × ${durationS}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains E_ext = ${formatPhysicsQuantity(eExt, "J")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// Archetype 11: resistivity-ohmic-conductors :: cylindrical-wire-resistivity-circuit
// ============================================================================

const WIRE_CIRCUIT_CONTEXTS = [
  "foam-cutting hot-wire bench rig",
  "micrometer wire-resistivity practical",
  "camera-lens anti-fog heater ring",
  "wind-tunnel hot-wire anemometer probe",
  "cryogenic sample-stage heater winding",
  "precision current-shunt calibration loop",
  "spectrometer slit-warmer wire element",
  "autoclave seal heating-wire loop",
  "thermoplastic bending-wire jig",
  "gas-chromatograph column heater wire",
  "frost-free hygrometer mirror heater",
  "vacuum-gauge Pirani filament loop",
  "viscometer bath heating-coil loop",
  "micro-thruster catalyst bed heater",
  "surgical cautery wire test fixture",
  "seed-germination tray warming wire",
  "optical-fibre splicer pre-heat wire",
  "battery-calorimeter calibration heater",
  "cloud-chamber clearing-wire loop",
  "de-icing pitot heater winding",
  "quartz-tube micro-furnace winding",
  "radiometer cavity electrical calibration wire",
] as const;

function buildCylindricalWireCircuitItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const alloy = WIRE_ALLOYS[slotIndex % WIRE_ALLOYS.length];
  const lengthM = Number((0.8 + 0.35 * randInt(1, 14, rand)).toFixed(2));
  const dMm = Number((0.22 + 0.06 * randInt(1, 11, rand)).toFixed(2));
  const dM = dMm * 1e-3;
  const areaM2 = (Math.PI * dM * dM) / 4;
  const rWire = (alloy.rho * lengthM) / areaM2;
  const emfV = [3, 4.5, 6, 9, 12, 15, 18, 24][randInt(0, 7, rand)];

  const iWire = emfV / rWire;
  const pWire = (emfV * emfV) / rWire;

  if (
    !valuesDistinctEnough(rWire, emfV, 0.05) ||
    !valuesDistinctEnough(rWire, lengthM, 0.05) ||
    !valuesDistinctEnough(iWire, dMm, 0.05)
  ) {
    return undefined;
  }

  const syllabi = buildSyllabusTags(
    "resistivity-ohmic-conductors",
    format,
    slotIndex,
  );
  const difficulty = pickDifficulty(slotIndex);
  const ctx = WIRE_CIRCUIT_CONTEXTS[slotIndex % WIRE_CIRCUIT_CONTEXTS.length];
  const hiddenQuantities = [
    "branch0",
    "parallelBranchOhms",
    "parallelOhm",
    "externalOhm",
    "totalOhm",
    "totalCurrentA",
    "totalSourcePowerW",
    "branchOneCurrentA",
    "branchOnePowerW",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "rho", value: alloy.rho, unit: "Ω m", source: "stem" },
    { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
    { name: "diameterM", value: dM, unit: "m", source: "stem" },
    { name: "emfV", value: emfV, unit: "V", source: "either" },
  ];

  if (format === "mcq") {
    const mode = slotIndex % 3;
    const targetKey =
      mode === 0
        ? "parallelOhm"
        : mode === 1
          ? "totalCurrentA"
          : "branchOnePowerW";
    const targetVal = mode === 0 ? rWire : mode === 1 ? iWire : pWire;
    const unit = mode === 0 ? "Ω" : mode === 1 ? "A" : "W";

    const distractors: DistractorCandidate[] =
      mode === 0
        ? [
            {
              value: rWire / 4,
              rationale:
                "Uses A = π d² instead of A = π(d/2)² = π d²/4, overestimating cross-sectional area by a factor of 4.",
            },
            {
              value: rWire * 4,
              rationale:
                "Divides the radius by 2 a second time (using d/4), underestimating area by a factor of 4.",
            },
            {
              value: (alloy.rho * lengthM) / (Math.PI * dM),
              rationale:
                "Uses circumference π d instead of cross-sectional area π d²/4 in R = ρL/A.",
            },
            {
              value: rWire * 1e-3,
              rationale:
                "Converts millimetres to metres only once instead of squaring 10⁻³ when computing d².",
            },
          ]
        : mode === 1
          ? [
              {
                value: iWire / 4,
                rationale:
                  "Halves the radius again when computing area, making resistance 4 times too large.",
              },
              {
                value: iWire * 4,
                rationale:
                  "Uses A = π d² instead of π d²/4, making wire resistance 4 times too small and current 4 times too large.",
              },
              {
                value: rWire,
                rationale: `Stops after computing the wire resistance (${formatPhysicsQuantity(rWire, "Ω")}) without dividing ${emfV} V by R.`,
              },
              {
                value: emfV * rWire,
                rationale: "Multiplies V × R instead of dividing I = V / R.",
              },
            ]
          : [
              {
                value: pWire / 4,
                rationale:
                  "Underestimates cross-sectional area by a factor of 4 when converting diameter to radius.",
              },
              {
                value: pWire * 4,
                rationale:
                  "Uses A = π d² instead of π d²/4 when finding wire resistance, inflating P = V²/R by a factor of 4.",
              },
              {
                value: emfV / rWire,
                rationale:
                  "Calculates the current I = V / R rather than thermal power P = V² / R.",
              },
              {
                value: emfV * emfV * rWire,
                rationale: "Multiplies V² by R instead of dividing V² / R.",
              },
            ];

    const options = assembleMcqOptions(targetVal, unit, distractors, slotIndex);
    if (!options) return undefined;

    const askClause =
      mode === 0
        ? "What is the electrical resistance of R_1?"
        : mode === 1
          ? "What steady current passes through R_1?"
          : "What thermal power is dissipated in R_1?";

    const stems = [
      `In ${aOrAn(ctx)}, a uniform cylindrical ${alloy.name} wire R_1 of resistivity ${alloy.rhoText}, length ${lengthM} m, and diameter ${dMm} mm is wired directly across an ideal ${emfV} V DC source, as shown. ${askClause}`,
      `Element R_1 in the ${ctx} schematic is a cylindrical ${alloy.name} wire (resistivity ${alloy.rhoText}) of length ${lengthM} m and circular diameter ${dMm} mm connected to an ideal ${emfV} V cell. ${askClause}`,
      `A ${lengthM} m cylindrical ${alloy.name} wire of diameter ${dMm} mm and resistivity ${alloy.rhoText} acts as load R_1 inside ${aOrAn(ctx)} energised at ${emfV} V (ideal). ${askClause}`,
      `Across an ideal ${emfV} V terminal pair in ${aOrAn(ctx)}, resistor R_1 consists of ${lengthM} m of cylindrical ${alloy.name} wire having diameter ${dMm} mm and resistivity ${alloy.rhoText}. ${askClause}`,
      `For ${aOrAn(ctx)}, technicians wind ${lengthM} m of ${dMm} mm diameter ${alloy.name} wire (ρ = ${alloy.rhoText}) as resistor R_1 across an ideal ${emfV} V supply. ${askClause}`,
      `Refer to the diagram of ${aOrAn(ctx)}: R_1 is a uniform ${alloy.name} wire of circular cross-section (diameter ${dMm} mm, length ${lengthM} m, resistivity ${alloy.rhoText}) across ${emfV} V (ideal). ${askClause}`,
    ];

    return {
      id,
      conceptId: "resistivity-ohmic-conductors",
      templateArchetype: "cylindrical-wire-resistivity-circuit",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV,
        internalOhm: 0,
        seriesOhm: 0,
        parallelBranchOhms: [rWire],
      },
      hiddenQuantities,
      requiredGivens,
      targetQuantityKey: targetKey,
      questionPlan: buildPreSolvePlan(
        "resistivity-ohmic-conductors",
        "cylindrical-wire-resistivity-circuit",
        "mcq",
        targetKey,
      ),
      stem: stems[slotIndex % stems.length],
      options,
      workedSolution: `Cross-sectional area A = π(d/2)² = π(${dMm} × 10⁻³ / 2)² = ${formatPhysicsQuantity(areaM2, "m²")}. Wire resistance R_1 = ρL / A = ${formatPhysicsQuantity(rWire, "Ω")}. Current I = ${emfV} / ${formatPhysicsQuantity(rWire)} = ${formatPhysicsQuantity(iWire, "A")}, and power P = V² / R_1 = ${formatPhysicsQuantity(pWire, "W")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Uses A = π d² / 4 and R = ρL / A to obtain ${formatPhysicsQuantity(targetVal, unit)}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structStems = [
    `${aOrAn(ctx, true)} uses a uniform cylindrical ${alloy.name} wire R_1 of length ${lengthM} m, diameter ${dMm} mm, and resistivity ${alloy.rhoText} connected across an ideal ${emfV} V DC source, as shown.`,
    `In the diagram for ${aOrAn(ctx)}, load R_1 is a ${lengthM} m cylindrical ${alloy.name} wire of circular diameter ${dMm} mm and resistivity ${alloy.rhoText} powered by an ideal ${emfV} V cell.`,
    `During construction of ${aOrAn(ctx)}, ${lengthM} m of cylindrical ${alloy.name} wire (diameter ${dMm} mm, resistivity ${alloy.rhoText}) is connected as element R_1 across an ideal ${emfV} V supply.`,
    `An ideal ${emfV} V rail in ${aOrAn(ctx)} drives current through resistor R_1, which consists of a uniform ${alloy.name} wire of length ${lengthM} m, diameter ${dMm} mm, and resistivity ${alloy.rhoText}.`,
    `To generate controlled heating in ${aOrAn(ctx)}, engineers connect a cylindrical ${alloy.name} wire R_1 (ρ = ${alloy.rhoText}, L = ${lengthM} m, d = ${dMm} mm) across ${emfV} V (ideal).`,
    `Within ${aOrAn(ctx)}, a circular-section ${alloy.name} wire R_1 of diameter ${dMm} mm, length ${lengthM} m, and resistivity ${alloy.rhoText} bridges an ideal ${emfV} V terminal pair.`,
    `The schematic of ${aOrAn(ctx)} shows an ideal ${emfV} V source connected directly across cylindrical ${alloy.name} wire R_1 (length ${lengthM} m, diameter ${dMm} mm, resistivity ${alloy.rhoText}).`,
    `Refer to ${aOrAn(ctx)} illustrated: resistive element R_1 is fabricated from ${lengthM} m of ${dMm} mm diameter ${alloy.name} wire (resistivity ${alloy.rhoText}) on an ideal ${emfV} V supply.`,
  ];

  return {
    id,
    conceptId: "resistivity-ohmic-conductors",
    templateArchetype: "cylindrical-wire-resistivity-circuit",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind: "dc-series-parallel",
      emfV,
      internalOhm: 0,
      seriesOhm: 0,
      parallelBranchOhms: [rWire],
    },
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildPreSolvePlan(
      "resistivity-ohmic-conductors",
      "cylindrical-wire-resistivity-circuit",
      "structured",
      "branchOnePowerW",
      ["parallelOhm", "totalCurrentA", "branchOnePowerW"],
    ),
    stem: structStems[slotIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the resistance of the cylindrical wire R_1.",
        marks: 2,
        targetQuantityKey: "parallelOhm",
        expectedAnswer: formatPhysicsQuantity(rWire, "Ω"),
        workingSteps: [
          `A = π(d/2)² = π(${dMm} × 10⁻³ / 2)² = ${formatPhysicsQuantity(areaM2, "m²")}.`,
          `R_1 = ρL / A = ${formatPhysicsQuantity(rWire, "Ω")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the current in the wire.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "totalCurrentA",
        expectedAnswer: formatPhysicsQuantity(iWire, "A"),
        workingSteps: [
          `I = V / R_1 = ${emfV} / ${formatPhysicsQuantity(rWire)} = ${formatPhysicsQuantity(iWire, "A")}.`,
        ],
      },
      {
        partId: "c",
        prompt: "Determine the thermal power dissipated in the wire.",
        marks: 2,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "branchOnePowerW",
        expectedAnswer: formatPhysicsQuantity(pWire, "W"),
        workingSteps: [
          `P = V × I = ${emfV} × ${formatPhysicsQuantity(iWire)} = ${formatPhysicsQuantity(pWire, "W")}.`,
        ],
      },
    ],
    workedSolution: `(a) A = π d² / 4 = ${formatPhysicsQuantity(areaM2, "m²")}, giving R_1 = ρL / A = ${formatPhysicsQuantity(rWire, "Ω")}. (b) I = ${emfV} / ${formatPhysicsQuantity(rWire)} = ${formatPhysicsQuantity(iWire, "A")}. (c) P = V I = ${formatPhysicsQuantity(pWire, "W")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Computes circular area π(d/2)² in m² and applies R = ρL / A.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains R_1 = ${formatPhysicsQuantity(rWire, "Ω")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Divides ${emfV} V by R_1.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains I = ${formatPhysicsQuantity(iWire, "A")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Applies P = V I or V² / R_1.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains P = ${formatPhysicsQuantity(pWire, "W")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// Archetype 12: resistivity-ohmic-conductors :: wire-sensor-series-divider-circuit
// ============================================================================

const WIRE_DIVIDER_CONTEXTS = [
  "slide-wire potentiometer rail",
  "foil strain-gauge conditioning loop",
  "resistance-thermometer bridge arm",
  "linear displacement slide-wire sensor",
  "tensile load-cell wire divider",
  "busbar voltage-drop monitor",
  "thin-film heater ballast circuit",
  "four-terminal Kelvin reference loop",
  "metrology resistance-transfer standard",
  "extensometer wire sensing divider",
  "cryostat manganin lead-compensation loop",
  "torsion-bar strain-wire divider",
  "micro-balance restoring-coil feed",
  "calorimeter lead-wire divider stage",
  "hot-film flow-sensor ballast loop",
  "precision current-source sense divider",
  "piezoresistive alloy-ribbon test loop",
  "synchrotron magnet-shunt trim loop",
  "cantilever beam strain-wire circuit",
  "diaphragm pressure-gauge wire arm",
  "rail-weighbridge strain-strip divider",
] as const;

function buildWireSeriesDividerItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const alloy = WIRE_ALLOYS[(slotIndex + 3) % WIRE_ALLOYS.length];
  const lengthM = Number((1.2 + 0.4 * randInt(1, 12, rand)).toFixed(2));
  const areaMantissa = Number((1.5 + 0.5 * randInt(1, 12, rand)).toFixed(2));
  const areaM2 = areaMantissa * 1e-7;
  const areaText = `${areaMantissa.toFixed(2)} × 10⁻⁷ m²`;
  const rWire = (alloy.rho * lengthM) / areaM2;
  const rFixed = randInt(3, 18, rand);
  if (Math.abs(rWire - rFixed) < 0.8) return undefined;
  const emfV = randInt(6, 28, rand);

  const rTot = rFixed + rWire;
  const iLoop = emfV / rTot;
  const vWire = iLoop * rWire;

  const syllabi = buildSyllabusTags(
    "resistivity-ohmic-conductors",
    format,
    slotIndex,
  );
  const difficulty = pickDifficulty(slotIndex);
  const ctx = WIRE_DIVIDER_CONTEXTS[slotIndex % WIRE_DIVIDER_CONTEXTS.length];
  const hiddenQuantities = [
    "branch0",
    "parallelBranchOhms",
    "parallelOhm",
    "externalOhm",
    "totalOhm",
    "totalCurrentA",
    "parallelVoltageV",
    "totalSourcePowerW",
    "branchOneCurrentA",
    "branchOnePowerW",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "rho", value: alloy.rho, unit: "Ω m", source: "stem" },
    { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
    { name: "areaM2", value: areaM2, unit: "m²", source: "stem" },
    { name: "seriesOhm", value: rFixed, unit: "Ω", source: "either" },
    { name: "emfV", value: emfV, unit: "V", source: "either" },
  ];

  if (format === "mcq") {
    const askCurrent = slotIndex % 3 === 2;
    const targetKey = askCurrent ? "totalCurrentA" : "parallelVoltageV";
    const targetVal = askCurrent ? iLoop : vWire;
    const unit = askCurrent ? "A" : "V";

    const rWrongInv = (alloy.rho * areaM2) / lengthM;
    const distractors: DistractorCandidate[] = askCurrent
      ? [
          {
            value: emfV / (rFixed + rWire * 10),
            rationale:
              "Misplaces a factor of 10 when evaluating ρL / A before finding circuit current.",
          },
          {
            value: emfV / rWire,
            rationale: `Omits the ${rFixed} Ω series resistor after calculating the wire resistance.`,
          },
          {
            value: emfV / rFixed,
            rationale: `Treats the ${alloy.name} resistance wire R_1 as a zero-resistance lead.`,
          },
          {
            value: (emfV * rWire) / (rFixed + rWire),
            rationale:
              "Computes the potential difference across the wire in volts instead of the series current in amperes.",
          },
        ]
      : [
          {
            value: (emfV * rFixed) / rTot,
            rationale: `Calculates the potential difference across the ${rFixed} Ω fixed resistor rather than across the ${alloy.name} wire R_1.`,
          },
          {
            value: rWire,
            rationale: `Stops at the wire resistance R_1 = ${formatPhysicsQuantity(rWire, "Ω")} without applying potential division.`,
          },
          {
            value: (emfV * Math.min(rWire, rFixed)) / Math.max(rWire, rFixed),
            rationale:
              "Uses R_1 / R_s instead of R_1 / (R_s + R_1) in the potential-divider formula.",
          },
          {
            value: (emfV * (rWire * 10)) / (rFixed + rWire * 10 + rWrongInv),
            rationale:
              "Makes a power-of-ten slip when evaluating R_1 = ρL / A before applying the divider ratio.",
          },
        ];

    const options = assembleMcqOptions(targetVal, unit, distractors, slotIndex);
    if (!options) return undefined;

    const askClause = askCurrent
      ? "What current flows through the series circuit?"
      : `What is the potential difference across the ${alloy.name} wire R_1?`;

    const stems = [
      `${aOrAn(ctx, true)} places a ${rFixed} Ω reference resistor in series with a uniform ${alloy.name} wire R_1 (resistivity ${alloy.rhoText}, length ${lengthM} m, area ${areaText}) across an ideal ${emfV} V DC source, as shown. ${askClause}`,
      `In the ${ctx} schematic, R_1 is a ${lengthM} m strip of ${alloy.name} of cross-sectional area ${areaText} and resistivity ${alloy.rhoText}, wired in series with ${rFixed} Ω across an ideal ${emfV} V supply. ${askClause}`,
      `An ideal ${emfV} V cell drives ${aOrAn(ctx)} made of a ${rFixed} Ω resistor in series with ${alloy.name} wire R_1 (length ${lengthM} m, area ${areaText}, resistivity ${alloy.rhoText}). ${askClause}`,
      `Within ${aOrAn(ctx)}, ${lengthM} m of uniform ${alloy.name} wire R_1 (area ${areaText}, ρ = ${alloy.rhoText}) shares an ideal ${emfV} V rail in series with a ${rFixed} Ω resistor. ${askClause}`,
      `Refer to the diagram for ${aOrAn(ctx)}: series elements ${rFixed} Ω and ${alloy.name} wire R_1 (L = ${lengthM} m, A = ${areaText}, ρ = ${alloy.rhoText}) are energised at ${emfV} V (ideal). ${askClause}`,
    ];

    return {
      id,
      conceptId: "resistivity-ohmic-conductors",
      templateArchetype: "wire-sensor-series-divider-circuit",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV,
        internalOhm: 0,
        seriesOhm: rFixed,
        parallelBranchOhms: [rWire],
      },
      hiddenQuantities,
      requiredGivens,
      targetQuantityKey: targetKey,
      questionPlan: buildPreSolvePlan(
        "resistivity-ohmic-conductors",
        "wire-sensor-series-divider-circuit",
        "mcq",
        targetKey,
      ),
      stem: stems[slotIndex % stems.length],
      options,
      workedSolution: `Wire resistance R_1 = ρL / A = (${alloy.rhoText})(${lengthM}) / (${areaText}) = ${formatPhysicsQuantity(rWire, "Ω")}. Series current I = ${emfV} / (${rFixed} + ${formatPhysicsQuantity(rWire)}) = ${formatPhysicsQuantity(iLoop, "A")}, and p.d. across the wire V_1 = I R_1 = ${formatPhysicsQuantity(vWire, "V")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Computes R_1 = ${formatPhysicsQuantity(rWire, "Ω")} and obtains ${formatPhysicsQuantity(targetVal, unit)}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structStems = [
    `In ${aOrAn(ctx)}, a uniform ${alloy.name} wire R_1 of resistivity ${alloy.rhoText}, length ${lengthM} m, and cross-sectional area ${areaText} sits in series with a ${rFixed} Ω resistor across an ideal ${emfV} V DC source, as shown.`,
    `${aOrAn(ctx, true)} pairs a ${rFixed} Ω ballast resistor in series with ${lengthM} m of ${alloy.name} wire R_1 (area ${areaText}, resistivity ${alloy.rhoText}) across an ideal ${emfV} V cell.`,
    `The diagram illustrates ${aOrAn(ctx)} where an ideal ${emfV} V rail supplies a ${rFixed} Ω resistor in series with uniform ${alloy.name} wire R_1 (L = ${lengthM} m, A = ${areaText}, ρ = ${alloy.rhoText}).`,
    `During calibration of ${aOrAn(ctx)}, technicians wire ${lengthM} m of ${alloy.name} conductor R_1 (cross-sectional area ${areaText}, resistivity ${alloy.rhoText}) in series with ${rFixed} Ω on an ideal ${emfV} V supply.`,
    `Across an ideal ${emfV} V source in ${aOrAn(ctx)}, a ${rFixed} Ω reference resistor precedes ${alloy.name} wire R_1 having length ${lengthM} m, area ${areaText}, and resistivity ${alloy.rhoText}.`,
    `Within ${aOrAn(ctx)}, resistive element R_1 (${alloy.name}, ρ = ${alloy.rhoText}, length ${lengthM} m, area ${areaText}) forms a series divider with a ${rFixed} Ω resistor across ${emfV} V (ideal).`,
    `Refer to the schematic of ${aOrAn(ctx)}: an ideal ${emfV} V cell drives a ${rFixed} Ω resistor and ${lengthM} m of ${alloy.name} wire R_1 (area ${areaText}, resistivity ${alloy.rhoText}) in series.`,
  ];

  return {
    id,
    conceptId: "resistivity-ohmic-conductors",
    templateArchetype: "wire-sensor-series-divider-circuit",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind: "dc-series-parallel",
      emfV,
      internalOhm: 0,
      seriesOhm: rFixed,
      parallelBranchOhms: [rWire],
    },
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildPreSolvePlan(
      "resistivity-ohmic-conductors",
      "wire-sensor-series-divider-circuit",
      "structured",
      "parallelVoltageV",
      ["parallelOhm", "totalCurrentA", "parallelVoltageV"],
    ),
    stem: structStems[slotIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: `Calculate the resistance of the ${alloy.name} wire R_1.`,
        marks: 2,
        targetQuantityKey: "parallelOhm",
        expectedAnswer: formatPhysicsQuantity(rWire, "Ω"),
        workingSteps: [
          `R_1 = ρL / A = (${alloy.rhoText} × ${lengthM}) / (${areaText}) = ${formatPhysicsQuantity(rWire, "Ω")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the current in the series circuit.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "totalCurrentA",
        expectedAnswer: formatPhysicsQuantity(iLoop, "A"),
        workingSteps: [
          `R_tot = ${rFixed} + ${formatPhysicsQuantity(rWire)} = ${formatPhysicsQuantity(rTot, "Ω")}.`,
          `I = ${emfV} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iLoop, "A")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the potential difference across the ${alloy.name} wire R_1.`,
        marks: 2,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "parallelVoltageV",
        expectedAnswer: formatPhysicsQuantity(vWire, "V"),
        workingSteps: [
          `V_1 = I × R_1 = ${formatPhysicsQuantity(iLoop)} × ${formatPhysicsQuantity(rWire)} = ${formatPhysicsQuantity(vWire, "V")}.`,
        ],
      },
    ],
    workedSolution: `(a) R_1 = ρL / A = ${formatPhysicsQuantity(rWire, "Ω")}. (b) I = ${emfV} / (${rFixed} + ${formatPhysicsQuantity(rWire)}) = ${formatPhysicsQuantity(iLoop, "A")}. (c) V_1 = I R_1 = ${formatPhysicsQuantity(vWire, "V")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Applies R = ρL / A with given SI values.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains R_1 = ${formatPhysicsQuantity(rWire, "Ω")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Adds ${rFixed} Ω to R_1 and divides ${emfV} V by R_tot.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains I = ${formatPhysicsQuantity(iLoop, "A")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Multiplies I by R_1.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains V_1 = ${formatPhysicsQuantity(vWire, "V")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// Archetype 13: resistivity-ohmic-conductors :: parallel-composite-wires-network
// ============================================================================

const SHUNTED_WIRE_CONTEXTS = [
  "shunted ammeter manganin bypass assembly",
  "aircraft pitot-tube dual-path de-icer",
  "furnace parallel shunt trimming stage",
  "galvanometer shunt calibration cell",
  "rear-window parallel demister grid",
  "vacuum-evaporator shunted filament holder",
  "cryostat parallel heater-and-bypass stage",
  "battery-cycler current-sense shunt network",
  "welding-cable current-diverter rig",
  "magnet-power-supply trim-shunt stage",
  "electrolysis-cell bypass resistor bank",
  "high-current busbar parallel shunt pad",
  "mass-flow thermal bypass sensor",
  "solar-array string shunt-resistor box",
  "induction-heater water-cooled shunt stage",
  "traction-inverter current-monitor shunt",
  "plasma-chamber glow-wire shunt circuit",
  "laser-flashlamp simmer-shunt network",
  "wind-tunnel sting-heater shunt loop",
  "marine cathodic-protection shunt box",
  "satellite pyro-bus test shunt network",
] as const;

function buildParallelCompositeWiresItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const alloy = WIRE_ALLOYS[(slotIndex + 5) % WIRE_ALLOYS.length];
  const lengthM = Number((1.5 + 0.5 * randInt(1, 10, rand)).toFixed(2));
  const areaMantissa = Number((2.0 + 0.5 * randInt(1, 10, rand)).toFixed(2));
  const areaM2 = areaMantissa * 1e-7;
  const areaText = `${areaMantissa.toFixed(2)} × 10⁻⁷ m²`;
  const rWire = (alloy.rho * lengthM) / areaM2;
  const rShunt = randInt(4, 24, rand);
  const rLead = randInt(2, 10, rand);
  const emfV = randInt(10, 36, rand);

  const rPar = (rWire * rShunt) / (rWire + rShunt);
  const rTot = rLead + rPar;
  const iTot = emfV / rTot;
  const vPar = iTot * rPar;
  const iWire = vPar / rWire;
  const pWire = (vPar * vPar) / rWire;

  if (!valuesDistinctEnough(rWire, rShunt, 0.06)) return undefined;

  const syllabi = buildSyllabusTags(
    "resistivity-ohmic-conductors",
    format,
    slotIndex,
  );
  const difficulty = pickDifficulty(slotIndex);
  const ctx = SHUNTED_WIRE_CONTEXTS[slotIndex % SHUNTED_WIRE_CONTEXTS.length];
  const hiddenQuantities = [
    "branch0",
    "parallelBranchOhms",
    "parallelOhm",
    "externalOhm",
    "totalOhm",
    "totalCurrentA",
    "parallelVoltageV",
    "totalSourcePowerW",
    "branchOneCurrentA",
    "branchOnePowerW",
    "branchTwoCurrentA",
    "branchTwoPowerW",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "rho", value: alloy.rho, unit: "Ω m", source: "stem" },
    { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
    { name: "areaM2", value: areaM2, unit: "m²", source: "stem" },
    { name: "shuntOhm", value: rShunt, unit: "Ω", source: "either" },
    { name: "leadOhm", value: rLead, unit: "Ω", source: "either" },
    { name: "emfV", value: emfV, unit: "V", source: "either" },
  ];

  if (format === "mcq") {
    const askBranchI = slotIndex % 2 === 0;
    const targetKey = askBranchI ? "branchOneCurrentA" : "parallelOhm";
    const targetVal = askBranchI ? iWire : rPar;
    const unit = askBranchI ? "A" : "Ω";

    const distractors: DistractorCandidate[] = askBranchI
      ? [
          {
            value: emfV / (rLead + rWire + rShunt),
            rationale: `Adds R_1 and the ${rShunt} Ω shunt in series instead of combining them in parallel.`,
          },
          {
            value: vPar / rShunt,
            rationale: `Finds the current in the ${rShunt} Ω parallel shunt resistor instead of the ${alloy.name} wire R_1.`,
          },
          {
            value: iTot,
            rationale: `Calculates the total supply current rather than the current in the ${alloy.name} wire branch R_1.`,
          },
          {
            value: emfV / rWire,
            rationale: `Applies the full ${emfV} V source across the ${alloy.name} wire R_1, ignoring the ${rLead} Ω series lead drop.`,
          },
        ]
      : [
          {
            value: 1 / rWire + 1 / rShunt,
            rationale:
              "Sums the parallel conductances 1/R_1 + 1/R_2 without inverting.",
          },
          {
            value: rWire,
            rationale: `Computes only the resistance of the ${alloy.name} wire R_1 without combining it in parallel with the ${rShunt} Ω shunt.`,
          },
          {
            value: rTot,
            rationale: `Includes the ${rLead} Ω series lead resistance when asked for the parallel section alone.`,
          },
          {
            value: rWire + rShunt,
            rationale: `Adds R_1 and ${rShunt} Ω directly as if connected in series.`,
          },
        ];

    const options = assembleMcqOptions(targetVal, unit, distractors, slotIndex);
    if (!options) return undefined;

    const askClause = askBranchI
      ? `What current passes through the ${alloy.name} wire R_1?`
      : `What is the combined resistance of R_1 and the ${rShunt} Ω shunt in parallel?`;

    const stems = [
      `In ${aOrAn(ctx)}, a uniform ${alloy.name} wire R_1 (resistivity ${alloy.rhoText}, length ${lengthM} m, area ${areaText}) lies in parallel with a ${rShunt} Ω shunt, fed via a ${rLead} Ω series resistor from an ideal ${emfV} V DC source. ${askClause}`,
      `The ${ctx} schematic shows an ideal ${emfV} V supply driving a ${rLead} Ω resistor in series with the parallel pair of ${alloy.name} wire R_1 (L = ${lengthM} m, A = ${areaText}, ρ = ${alloy.rhoText}) and ${rShunt} Ω. ${askClause}`,
      `A ${lengthM} m ${alloy.name} wire R_1 of area ${areaText} and resistivity ${alloy.rhoText} is shunted by a ${rShunt} Ω resistor in ${aOrAn(ctx)} behind a ${rLead} Ω series ballast across ${emfV} V (ideal). ${askClause}`,
      `Within ${aOrAn(ctx)}, current from an ideal ${emfV} V cell traverses a ${rLead} Ω resistor before splitting between ${alloy.name} wire R_1 (${lengthM} m, ${areaText}, ${alloy.rhoText}) and a ${rShunt} Ω shunt. ${askClause}`,
      `Refer to ${aOrAn(ctx)} shown: parallel arms R_1 (${alloy.name}, length ${lengthM} m, area ${areaText}, ρ = ${alloy.rhoText}) and ${rShunt} Ω connect through ${rLead} Ω to an ideal ${emfV} V rail. ${askClause}`,
    ];

    return {
      id,
      conceptId: "resistivity-ohmic-conductors",
      templateArchetype: "parallel-composite-wires-network",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV,
        internalOhm: 0,
        seriesOhm: rLead,
        parallelBranchOhms: [rWire, rShunt],
      },
      hiddenQuantities,
      requiredGivens,
      targetQuantityKey: targetKey,
      questionPlan: buildPreSolvePlan(
        "resistivity-ohmic-conductors",
        "parallel-composite-wires-network",
        "mcq",
        targetKey,
      ),
      stem: stems[slotIndex % stems.length],
      options,
      workedSolution: `Wire resistance R_1 = ρL / A = ${formatPhysicsQuantity(rWire, "Ω")}. Parallel resistance R_p = (R_1 × ${rShunt})/(R_1 + ${rShunt}) = ${formatPhysicsQuantity(rPar, "Ω")}. Total resistance R_tot = ${rLead} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}; main current I_tot = ${formatPhysicsQuantity(iTot, "A")}, V_p = ${formatPhysicsQuantity(vPar, "V")}, and wire current I_1 = V_p / R_1 = ${formatPhysicsQuantity(iWire, "A")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Finds R_1 = ${formatPhysicsQuantity(rWire, "Ω")} and obtains ${formatPhysicsQuantity(targetVal, unit)}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structStems = [
    `${aOrAn(ctx, true)} connects a uniform ${alloy.name} wire R_1 (length ${lengthM} m, area ${areaText}, resistivity ${alloy.rhoText}) in parallel with a ${rShunt} Ω shunt resistor, in series with a ${rLead} Ω resistor across an ideal ${emfV} V DC supply.`,
    `In the schematic for ${aOrAn(ctx)}, an ideal ${emfV} V source feeds a ${rLead} Ω series resistor followed by parallel branches consisting of ${alloy.name} wire R_1 (L = ${lengthM} m, A = ${areaText}, ρ = ${alloy.rhoText}) and a ${rShunt} Ω resistor.`,
    `During testing of ${aOrAn(ctx)}, ${lengthM} m of ${alloy.name} wire R_1 (cross-sectional area ${areaText}, resistivity ${alloy.rhoText}) is wired in parallel with ${rShunt} Ω and supplied via ${rLead} Ω from an ideal ${emfV} V rail.`,
    `An ideal ${emfV} V cell powers ${aOrAn(ctx)} in which a ${rLead} Ω ballast resistor leads to a parallel combination of ${alloy.name} wire R_1 (${lengthM} m, ${areaText}, ${alloy.rhoText}) and a ${rShunt} Ω bypass resistor.`,
    `Within ${aOrAn(ctx)}, a ${rShunt} Ω shunt bridges ${alloy.name} element R_1 (length ${lengthM} m, area ${areaText}, ρ = ${alloy.rhoText}); the pair sits in series with ${rLead} Ω across ${emfV} V (ideal).`,
    `To trim resistance in ${aOrAn(ctx)}, engineers place a ${rShunt} Ω resistor in parallel with ${alloy.name} wire R_1 (${lengthM} m, ${areaText}, ${alloy.rhoText}) behind a ${rLead} Ω series resistor on an ideal ${emfV} V supply.`,
    `The diagram of ${aOrAn(ctx)} shows a ${rLead} Ω series lead connecting an ideal ${emfV} V source to parallel branches R_1 (${alloy.name}, L = ${lengthM} m, A = ${areaText}, ρ = ${alloy.rhoText}) and ${rShunt} Ω.`,
    `Refer to ${aOrAn(ctx)} illustrated: ${alloy.name} wire R_1 (resistivity ${alloy.rhoText}, length ${lengthM} m, area ${areaText}) and a ${rShunt} Ω shunt form a parallel stage in series with ${rLead} Ω across ${emfV} V (ideal).`,
  ];

  return {
    id,
    conceptId: "resistivity-ohmic-conductors",
    templateArchetype: "parallel-composite-wires-network",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind: "dc-series-parallel",
      emfV,
      internalOhm: 0,
      seriesOhm: rLead,
      parallelBranchOhms: [rWire, rShunt],
    },
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildPreSolvePlan(
      "resistivity-ohmic-conductors",
      "parallel-composite-wires-network",
      "structured",
      "branchOnePowerW",
      ["parallelOhm", "totalCurrentA", "branchOnePowerW"],
    ),
    stem: structStems[slotIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the resistance of R_1 and hence determine the equivalent resistance of the parallel combination.",
        marks: 2,
        targetQuantityKey: "parallelOhm",
        expectedAnswer: formatPhysicsQuantity(rPar, "Ω"),
        workingSteps: [
          `R_1 = ρL / A = ${formatPhysicsQuantity(rWire, "Ω")}.`,
          `R_p = (R_1 × ${rShunt}) / (R_1 + ${rShunt}) = ${formatPhysicsQuantity(rPar, "Ω")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the total current delivered by the DC supply.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "totalCurrentA",
        expectedAnswer: formatPhysicsQuantity(iTot, "A"),
        workingSteps: [
          `R_tot = ${rLead} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}.`,
          `I_tot = ${emfV} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iTot, "A")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the electrical power dissipated in the ${alloy.name} wire R_1.`,
        marks: 2,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "branchOnePowerW",
        expectedAnswer: formatPhysicsQuantity(pWire, "W"),
        workingSteps: [
          `V_p = I_tot × R_p = ${formatPhysicsQuantity(vPar, "V")}.`,
          `P_1 = V_p² / R_1 = ${formatPhysicsQuantity(pWire, "W")}.`,
        ],
      },
    ],
    workedSolution: `(a) R_1 = ${formatPhysicsQuantity(rWire, "Ω")}; R_p = ${formatPhysicsQuantity(rPar, "Ω")}. (b) R_tot = ${rLead} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}, so I_tot = ${formatPhysicsQuantity(iTot, "A")}. (c) V_p = ${formatPhysicsQuantity(vPar, "V")}, giving P_1 = V_p² / R_1 = ${formatPhysicsQuantity(pWire, "W")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Finds R_1 = ${formatPhysicsQuantity(rWire, "Ω")} and combines in parallel with ${rShunt} Ω.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains R_p = ${formatPhysicsQuantity(rPar, "Ω")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Adds ${rLead} Ω to R_p and uses I = V / R_tot.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains I_tot = ${formatPhysicsQuantity(iTot, "A")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Finds V_p and uses P_1 = V_p² / R_1.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains P_1 = ${formatPhysicsQuantity(pWire, "W")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// Archetype 14: charge-current-potential-difference :: dc-load-energy-and-power-transfer
// ============================================================================

const ENERGY_LOAD_CONTEXTS = [
  "immersive calorimetry heating coil",
  "cordless soldering-iron cartridge",
  "electroplating-bath resistor feed",
  "camp-stove glow-plug igniter",
  "medical fluid-warmer sleeve",
  "3D-printer heated build-plate loop",
  "hydrazine-line warming element",
  "handheld hot-knife polymer cutter",
  "wax-melting stylus heater loop",
  "battery-powered bottle-warmer pad",
  "diving drysuit heated-vest circuit",
  "ski-boot insole heater pack",
  "portable nebuliser heater element",
  "laboratory oil-bath immersion coil",
  "sap-flow tree-trunk heater probe",
  "thermal-conductivity guard-ring heater",
  "drone pitot-static heater sleeve",
  "portable incubator floor-pad heater",
  "composite-curing blanket test cell",
  "cryo-valve thaw heater cartridge",
  "adhesive-dispensing nozzle heater",
] as const;

function buildDcLoadEnergyItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const rInt = Number((0.4 + 0.3 * randInt(1, 8, rand)).toFixed(1));
  const rLoad = Number((3.0 + 1.5 * randInt(1, 14, rand)).toFixed(1));
  const rTot = rInt + rLoad;
  const currentA = Number((0.5 + 0.25 * randInt(1, 12, rand)).toFixed(2));
  const emfV = Number((rTot * currentA).toFixed(2));
  const durationS = [20, 30, 45, 60, 75, 90, 120, 150, 180][randInt(0, 8, rand)];

  const iReal = emfV / rTot;
  const vTerm = iReal * rLoad;
  const eExt = iReal * iReal * rLoad * durationS;

  const syllabi = buildSyllabusTags(
    "charge-current-potential-difference",
    format,
    slotIndex,
  );
  const difficulty = pickDifficulty(slotIndex);
  const ctx = ENERGY_LOAD_CONTEXTS[slotIndex % ENERGY_LOAD_CONTEXTS.length];
  const hiddenQuantities = ["currentA", "terminalVoltageV", "externalEnergyJ"];

  if (format === "mcq") {
    const distractors: DistractorCandidate[] = [
      {
        value: iReal * iReal * rInt * durationS,
        rationale: `Calculates thermal energy dissipated inside the ${rInt} Ω internal resistance rather than in the external resistor.`,
      },
      {
        value: iReal * iReal * rLoad,
        rationale: `Finds external electrical power P = I²R in watts and omits multiplying by ${durationS} s.`,
      },
      {
        value: emfV * iReal * durationS,
        rationale: `Computes total work done by the cell emf (ε I t) instead of electrical energy transferred to the ${rLoad} Ω external load (V I t).`,
      },
      {
        value: ((emfV * emfV) / rLoad) * durationS,
        rationale: `Applies full emf (${emfV} V) across the ${rLoad} Ω resistor, ignoring internal voltage drop.`,
      },
    ];
    const options = assembleMcqOptions(eExt, "J", distractors, slotIndex);
    if (!options) return undefined;

    const stems = [
      `${aOrAn(ctx, true)} uses a battery of emf ${emfV} V and internal resistance ${rInt} Ω wired across a ${rLoad} Ω heating load, as shown. How much electrical energy is transferred to the ${rLoad} Ω load during ${durationS} s?`,
      `In the ${ctx} diagram, a cell (ε = ${emfV} V, r = ${rInt} Ω) supplies a ${rLoad} Ω external resistor steadily for ${durationS} s. What total energy is delivered to the ${rLoad} Ω resistor?`,
      `During a ${durationS} s activation of ${aOrAn(ctx)}, a source of emf ${emfV} V and internal resistance ${rInt} Ω drives a ${rLoad} Ω load. Calculate the electrical energy transferred to the external load.`,
      `The schematic models ${aOrAn(ctx)} where a ${emfV} V battery (${rInt} Ω internal resistance) energises a ${rLoad} Ω load for ${durationS} s. Determine the energy dissipated in the ${rLoad} Ω resistor.`,
      `Across a ${rLoad} Ω element in ${aOrAn(ctx)}, a ${emfV} V pack of internal resistance ${rInt} Ω maintains steady current for ${durationS} s. Find the energy converted in the ${rLoad} Ω element.`,
      `Refer to ${aOrAn(ctx)} illustrated: emf ${emfV} V in series with internal resistance ${rInt} Ω powers a ${rLoad} Ω load over ${durationS} s. How much energy reaches the ${rLoad} Ω load?`,
    ];

    return {
      id,
      conceptId: "charge-current-potential-difference",
      templateArchetype: "dc-load-energy-and-power-transfer",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "battery-energy",
        emfV,
        internalOhm: rInt,
        loadOhm: rLoad,
        durationS,
      },
      hiddenQuantities,
      targetQuantityKey: "externalEnergyJ",
      questionPlan: buildPreSolvePlan(
        "charge-current-potential-difference",
        "dc-load-energy-and-power-transfer",
        "mcq",
        "externalEnergyJ",
      ),
      stem: stems[slotIndex % stems.length],
      options,
      workedSolution: `Current I = ε / (R + r) = ${emfV} / (${rLoad} + ${rInt}) = ${formatPhysicsQuantity(iReal, "A")}. Potential difference across load V = I R = ${formatPhysicsQuantity(vTerm, "V")}. Energy transferred to external load E = V I t = I² R t = ${formatPhysicsQuantity(eExt, "J")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Finds I = ${formatPhysicsQuantity(iReal, "A")} and E_ext = I² R t = ${formatPhysicsQuantity(eExt, "J")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structStems = [
    `${aOrAn(ctx, true)} connects a battery of emf ${emfV} V and internal resistance ${rInt} Ω across a ${rLoad} Ω resistive element, operating steadily for ${durationS} s.`,
    `In the diagram of ${aOrAn(ctx)}, a source with ε = ${emfV} V and r = ${rInt} Ω drives steady current through a ${rLoad} Ω load resistor over ${durationS} s.`,
    `During a ${durationS} s heating cycle, ${aOrAn(ctx)} draws current from a ${emfV} V battery (${rInt} Ω internal resistance) across a ${rLoad} Ω external resistor.`,
    `A ${rLoad} Ω load inside ${aOrAn(ctx)} is supplied continuously for ${durationS} s by a non-ideal cell of emf ${emfV} V and internal resistance ${rInt} Ω, as shown.`,
    `To test thermal output in ${aOrAn(ctx)}, a technician connects a ${emfV} V, ${rInt} Ω battery across a ${rLoad} Ω resistor for ${durationS} s.`,
    `Within ${aOrAn(ctx)}, an emf of ${emfV} V with series internal resistance ${rInt} Ω energises a ${rLoad} Ω element for ${durationS} s.`,
    `Refer to the schematic for ${aOrAn(ctx)}: a ${emfV} V cell of internal resistance ${rInt} Ω delivers energy to a ${rLoad} Ω load during a ${durationS} s interval.`,
  ];

  return {
    id,
    conceptId: "charge-current-potential-difference",
    templateArchetype: "dc-load-energy-and-power-transfer",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind: "battery-energy",
      emfV,
      internalOhm: rInt,
      loadOhm: rLoad,
      durationS,
    },
    hiddenQuantities,
    questionPlan: buildPreSolvePlan(
      "charge-current-potential-difference",
      "dc-load-energy-and-power-transfer",
      "structured",
      "externalEnergyJ",
      ["currentA", "terminalVoltageV", "externalEnergyJ"],
    ),
    stem: structStems[slotIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the steady current in the circuit.",
        marks: 1,
        targetQuantityKey: "currentA",
        expectedAnswer: formatPhysicsQuantity(iReal, "A"),
        workingSteps: [
          `I = ${emfV} / (${rLoad} + ${rInt}) = ${formatPhysicsQuantity(iReal, "A")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the potential difference across the ${rLoad} Ω load.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "terminalVoltageV",
        expectedAnswer: formatPhysicsQuantity(vTerm, "V"),
        workingSteps: [
          `V = I × R = ${formatPhysicsQuantity(iReal)} × ${rLoad} = ${formatPhysicsQuantity(vTerm, "V")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the electrical energy transferred to the ${rLoad} Ω load during the ${durationS} s interval.`,
        marks: 2,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "externalEnergyJ",
        expectedAnswer: formatPhysicsQuantity(eExt, "J"),
        workingSteps: [
          `E = V × I × t = ${formatPhysicsQuantity(vTerm)} × ${formatPhysicsQuantity(iReal)} × ${durationS} = ${formatPhysicsQuantity(eExt, "J")}.`,
        ],
      },
    ],
    workedSolution: `(a) I = ${emfV} / (${rLoad} + ${rInt}) = ${formatPhysicsQuantity(iReal, "A")}. (b) V = I R = ${formatPhysicsQuantity(vTerm, "V")}. (c) E = V I t = ${formatPhysicsQuantity(eExt, "J")}.`,
    markScheme: [
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains I = ${formatPhysicsQuantity(iReal, "A")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies V = I R or V = ε − I r.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains V = ${formatPhysicsQuantity(vTerm, "V")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Uses E = V I × ${durationS}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains E = ${formatPhysicsQuantity(eExt, "J")}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
    generatorModel,
  };
}

// ============================================================================
// Archetype 15: charge-current-potential-difference :: multi-branch-power-energy-budget
// ============================================================================

const POWER_BUDGET_CONTEXTS = [
  "telecom rack DC power shelf",
  "agricultural rover actuator power board",
  "laminar-flow hood DC controller",
  "portable mass-spectrometer pump bus",
  "cargo-bike lighting and telemetry harness",
  "oceanographic buoy sensor-and-beacon unit",
  "Peltier-and-fan DC supply stage",
  "trackside axle-counter DC module",
  "automated weather-radar pedestal bus",
  "portable dialysis-pump DC distribution loop",
  "observatory adaptive-optics cooling bus",
  "remotely operated winch control box",
  "environmental chamber blower-and-lamp bus",
  "electric-glider avionics-and-variometer bus",
  "pipeline cathodic-and-telemetry station",
  "autonomous surface-vessel navigation bus",
  "laboratory glovebox circulation DC loop",
  "seismic borehole downhole power stage",
  "mobile lidar scanner power distribution box",
  "industrial AGV safety-bumper and beacon bus",
  "cryopump controller auxiliary DC loop",
] as const;

function buildMultiBranchPowerBudgetItem(
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const pair = pick(PARALLEL_PAIRS, rand);
  const r1 = pair[0];
  const r2 = pair[1];
  const rPar = (r1 * r2) / (r1 + r2);
  const rSer = randInt(2, 12, rand);
  const rInt = Number((0.5 + 0.4 * randInt(1, 6, rand)).toFixed(1));
  const rExt = rSer + rPar;
  const rTot = rInt + rExt;
  const iTot = [0.6, 0.8, 1.0, 1.4, 1.5, 1.8, 2.0, 2.5][randInt(0, 7, rand)];
  const emfV = Number((rTot * iTot).toFixed(2));
  const durationS = [10, 20, 25, 40, 50, 80, 100][randInt(0, 6, rand)];

  const pSource = emfV * iTot;
  const vTerm = emfV - iTot * rInt;
  const vPar = iTot * rPar;
  const eExt = vTerm * iTot * durationS;

  const syllabi = buildSyllabusTags(
    "charge-current-potential-difference",
    format,
    slotIndex,
  );
  const difficulty = pickDifficulty(slotIndex);
  const ctx = POWER_BUDGET_CONTEXTS[slotIndex % POWER_BUDGET_CONTEXTS.length];
  const hiddenQuantities = [
    "parallelOhm",
    "externalOhm",
    "totalOhm",
    "totalCurrentA",
    "terminalVoltageV",
    "parallelVoltageV",
    "totalSourcePowerW",
    "branchOneCurrentA",
    "branchOnePowerW",
    "branchTwoCurrentA",
    "branchTwoPowerW",
    "externalEnergyJ",
  ];

  if (format === "mcq") {
    const distractors: DistractorCandidate[] = [
      {
        value: (emfV * emfV) / (rInt + rSer + r1 + r2),
        rationale: `Sums the parallel ${r1} Ω and ${r2} Ω branches in series when computing total source power.`,
      },
      {
        value: (vPar * vPar) / rPar,
        rationale:
          "Calculates power dissipated in the parallel stage alone rather than total electrical power generated by the source.",
      },
      {
        value: vTerm * iTot,
        rationale: `Calculates only the power delivered to the external network (V_term I) and excludes the power I² r dissipated inside the ${rInt} Ω internal resistance.`,
      },
      {
        value: (emfV * emfV) / rExt,
        rationale: `Evaluates ε² / R_ext, omitting the ${rInt} Ω internal resistance from total circuit resistance.`,
      },
    ];
    const options = assembleMcqOptions(pSource, "W", distractors, slotIndex);
    if (!options) return undefined;

    const stems = [
      `In ${aOrAn(ctx)}, a source of emf ${emfV} V and internal resistance ${rInt} Ω drives a ${rSer} Ω resistor in series with parallel ${r1} Ω and ${r2} Ω branches for ${durationS} s. What total electrical power is generated by the source emf?`,
      `The ${ctx} schematic shows a battery (ε = ${emfV} V, r = ${rInt} Ω) connected to a ${rSer} Ω resistor and parallel ${r1} Ω and ${r2} Ω loads over ${durationS} s. At what total rate does the source emf convert chemical energy into electrical power?`,
      `During a ${durationS} s audit of ${aOrAn(ctx)}, a ${emfV} V battery (${rInt} Ω internal resistance) supplies a ${rSer} Ω series resistor and parallel ${r1} Ω and ${r2} Ω branches. Calculate the total source power εI.`,
      `Within ${aOrAn(ctx)}, parallel ${r1} Ω and ${r2} Ω loads sit behind a ${rSer} Ω resistor fed for ${durationS} s by a ${emfV} V cell of internal resistance ${rInt} Ω. Find the total power generated by the cell.`,
      `Refer to ${aOrAn(ctx)} illustrated: emf ${emfV} V with ${rInt} Ω internal resistance feeds ${rSer} Ω in series with ${r1} Ω ∥ ${r2} Ω for ${durationS} s. Determine the total electrical power developed by the emf.`,
    ];

    return {
      id,
      conceptId: "charge-current-potential-difference",
      templateArchetype: "multi-branch-power-energy-budget",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV,
        internalOhm: rInt,
        seriesOhm: rSer,
        parallelBranchOhms: [r1, r2],
        durationS,
      },
      hiddenQuantities,
      targetQuantityKey: "totalSourcePowerW",
      questionPlan: buildPreSolvePlan(
        "charge-current-potential-difference",
        "multi-branch-power-energy-budget",
        "mcq",
        "totalSourcePowerW",
      ),
      stem: stems[slotIndex % stems.length],
      options,
      workedSolution: `R_p = (${r1} × ${r2})/(${r1} + ${r2}) = ${formatPhysicsQuantity(rPar, "Ω")}; R_tot = ${rInt} + ${rSer} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}. Source current I = ${emfV} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iTot, "A")}. Total source power P_source = ε I = ${emfV} × ${formatPhysicsQuantity(iTot)} = ${formatPhysicsQuantity(pSource, "W")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Finds I = ${formatPhysicsQuantity(iTot, "A")} and calculates P_source = ε I = ${formatPhysicsQuantity(pSource, "W")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structStems = [
    `${aOrAn(ctx, true)} is powered by a battery of emf ${emfV} V and internal resistance ${rInt} Ω connected to a ${rSer} Ω resistor in series with parallel ${r1} Ω and ${r2} Ω branches, operating steadily for ${durationS} s.`,
    `In ${aOrAn(ctx)}, a ${emfV} V cell (${rInt} Ω internal resistance) supplies a ${rSer} Ω series resistor and parallel ${r1} Ω and ${r2} Ω loads continuously over a ${durationS} s interval.`,
    `The schematic of ${aOrAn(ctx)} shows emf ${emfV} V with internal resistance ${rInt} Ω driving ${rSer} Ω in series with ${r1} Ω ∥ ${r2} Ω for ${durationS} s.`,
    `During a ${durationS} s power-budget check on ${aOrAn(ctx)}, a battery (ε = ${emfV} V, r = ${rInt} Ω) energises a ${rSer} Ω line resistor and parallel ${r1} Ω and ${r2} Ω branches.`,
    `Parallel ${r1} Ω and ${r2} Ω loads behind a ${rSer} Ω series resistor form ${aOrAn(ctx)} connected for ${durationS} s across a ${emfV} V, ${rInt} Ω battery.`,
    `Within ${aOrAn(ctx)}, steady current from a ${emfV} V source of internal resistance ${rInt} Ω flows for ${durationS} s through a ${rSer} Ω resistor into parallel ${r1} Ω and ${r2} Ω arms.`,
    `Engineers run ${aOrAn(ctx)} for ${durationS} s from a ${emfV} V pack (internal resistance ${rInt} Ω) wired to a ${rSer} Ω resistor and parallel ${r1} Ω and ${r2} Ω branches.`,
    `Refer to the diagram for ${aOrAn(ctx)}: over ${durationS} s, a non-ideal ${emfV} V source (${rInt} Ω) feeds ${rSer} Ω in series with parallel ${r1} Ω and ${r2} Ω resistors.`,
  ];

  return {
    id,
    conceptId: "charge-current-potential-difference",
    templateArchetype: "multi-branch-power-energy-budget",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "circuits",
    scenarioSpec: {
      kind: "dc-series-parallel",
      emfV,
      internalOhm: rInt,
      seriesOhm: rSer,
      parallelBranchOhms: [r1, r2],
      durationS,
    },
    hiddenQuantities,
    questionPlan: buildPreSolvePlan(
      "charge-current-potential-difference",
      "multi-branch-power-energy-budget",
      "structured",
      "externalEnergyJ",
      ["totalCurrentA", "totalSourcePowerW", "externalEnergyJ"],
    ),
    stem: structStems[slotIndex % structStems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the total current supplied by the battery.",
        marks: 2,
        targetQuantityKey: "totalCurrentA",
        expectedAnswer: formatPhysicsQuantity(iTot, "A"),
        workingSteps: [
          `R_p = (${r1} × ${r2}) / (${r1} + ${r2}) = ${formatPhysicsQuantity(rPar, "Ω")}; R_tot = ${rInt} + ${rSer} + ${formatPhysicsQuantity(rPar)} = ${formatPhysicsQuantity(rTot, "Ω")}.`,
          `I = ${emfV} / ${formatPhysicsQuantity(rTot)} = ${formatPhysicsQuantity(iTot, "A")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the total electrical power generated by the battery emf.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "totalSourcePowerW",
        expectedAnswer: formatPhysicsQuantity(pSource, "W"),
        workingSteps: [
          `P_source = ε × I = ${emfV} × ${formatPhysicsQuantity(iTot)} = ${formatPhysicsQuantity(pSource, "W")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the electrical energy delivered to the external circuit over ${durationS} s.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "externalEnergyJ",
        expectedAnswer: formatPhysicsQuantity(eExt, "J"),
        workingSteps: [
          `V_term = ${emfV} − (${formatPhysicsQuantity(iTot)})(${rInt}) = ${formatPhysicsQuantity(vTerm, "V")}.`,
          `E_ext = V_term × I × ${durationS} = ${formatPhysicsQuantity(eExt, "J")}.`,
        ],
      },
    ],
    workedSolution: `(a) R_p = ${formatPhysicsQuantity(rPar, "Ω")}, R_tot = ${formatPhysicsQuantity(rTot, "Ω")}, I = ${formatPhysicsQuantity(iTot, "A")}. (b) P_source = ε I = ${formatPhysicsQuantity(pSource, "W")}. (c) V_term = ${formatPhysicsQuantity(vTerm, "V")}, so E_ext = V_term I t = ${formatPhysicsQuantity(eExt, "J")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Finds R_tot including R_p, R_s, and r.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains I = ${formatPhysicsQuantity(iTot, "A")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies P_source = ε I.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains P_source = ${formatPhysicsQuantity(pSource, "W")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Finds terminal p.d. ${formatPhysicsQuantity(vTerm, "V")} and multiplies by I and ${durationS} s.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains E_ext = ${formatPhysicsQuantity(eExt, "J")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

type ArchetypeBuilder = (
  id: string,
  seed: number,
  format: QuestionFormat,
  slotIndex: number,
  rand: () => number,
  generatorModel: string,
) => CandidateQuestionInput | undefined;

const ARCHETYPE_BUILDERS: Readonly<Record<string, ArchetypeBuilder>> = {
  "mixed-series-parallel-branch-power": buildMixedSeriesParallelItem,
  "kirchhoff-junction-three-branch-network": buildJunctionThreeBranchItem,
  "opposing-series-cells-kirchhoff-loop": buildOpposingCellsLoopItem,
  "non-ideal-voltmeter-ammeter-loading": buildMeterLoadingItem,
  "ldr-illumination-divider-stage": buildLdrDividerItem,
  "ntc-thermistor-divider-calibration": buildNtcThermistorItem,
  "sensor-bridge-loaded-divider": buildLoadedSensorDividerItem,
  "cell-terminal-pd-and-lost-volts": buildCellTerminalPdItem,
  "two-point-vi-emf-internal-resistance": buildTwoPointViItem,
  "non-ideal-battery-parallel-network-energy": buildNonIdealParallelEnergyItem,
  "cylindrical-wire-resistivity-circuit": buildCylindricalWireCircuitItem,
  "wire-sensor-series-divider-circuit": buildWireSeriesDividerItem,
  "parallel-composite-wires-network": buildParallelCompositeWiresItem,
  "dc-load-energy-and-power-transfer": buildDcLoadEnergyItem,
  "multi-branch-power-energy-budget": buildMultiBranchPowerBudgetItem,
};

function computeArchetypeTargets(
  options: GenerateCircuitsOptions,
): Array<{
  spec: CircuitsArchetypeSpec;
  mcqCount: number;
  structuredCount: number;
}> {
  const defaultTotal = CIRCUITS_GENERATOR_ARCHETYPES.reduce(
    (sum, a) => sum + a.defaultMcqCount + a.defaultStructuredCount,
    0,
  );
  if (options.count === undefined && options.mcqRatio === undefined) {
    return CIRCUITS_GENERATOR_ARCHETYPES.map((spec) => ({
      spec,
      mcqCount: spec.defaultMcqCount,
      structuredCount: spec.defaultStructuredCount,
    }));
  }

  const totalCount = Math.max(1, Math.trunc(options.count ?? defaultTotal));
  const mcqRatio = Math.min(1, Math.max(0, options.mcqRatio ?? 211 / 325));
  const targetMcqTotal = Math.round(totalCount * mcqRatio);
  const targetStructTotal = totalCount - targetMcqTotal;

  const nArch = CIRCUITS_GENERATOR_ARCHETYPES.length;
  const baseMcq = Math.floor(targetMcqTotal / nArch);
  const remMcq = targetMcqTotal % nArch;
  const baseStruct = Math.floor(targetStructTotal / nArch);
  const remStruct = targetStructTotal % nArch;

  return CIRCUITS_GENERATOR_ARCHETYPES.map((spec, idx) => ({
    spec,
    mcqCount: baseMcq + (idx < remMcq ? 1 : 0),
    structuredCount: baseStruct + (idx < remStruct ? 1 : 0),
  }));
}

/**
 * Deterministically generates solver- and gate-verified `circuits` candidate
 * question packages across 15 `(conceptId, templateArchetype)` family groups
 * spanning IB (SL/HL), UK A-Level (Y12/Y13), and NCUK IFY (IFY-S1/IFY).
 */
export function generateCircuitsCandidates(
  options: GenerateCircuitsOptions = {},
): CandidateQuestionInput[] {
  const baseSeed = Math.trunc(options.seed ?? 220_000);
  const generatorModel =
    options.generatorModel?.trim() || "gemini-4-carbon-high";
  const plan = computeArchetypeTargets(options);

  const accepted: CandidateQuestionInput[] = [];
  const existingStems: Array<{
    id: string;
    stem: string;
    stemFingerprint: string;
  }> = [];

  let globalIndex = 0;

  for (let aIdx = 0; aIdx < plan.length; aIdx += 1) {
    const { spec, mcqCount, structuredCount } = plan[aIdx];
    const builder = ARCHETYPE_BUILDERS[spec.templateArchetype];
    if (!builder) {
      throw new Error(`Missing circuits builder for ${spec.templateArchetype}`);
    }

    const formatsToBuild: QuestionFormat[] = [
      ...Array.from({ length: mcqCount }, () => "mcq" as const),
      ...Array.from({ length: structuredCount }, () => "structured" as const),
    ];

    let attemptOffset = 0;
    for (let localIdx = 0; localIdx < formatsToBuild.length; localIdx += 1) {
      const format = formatsToBuild[localIdx];
      globalIndex += 1;
      const itemId = `sp-circuits-${String(aIdx + 1).padStart(2, "0")}-${format}-${String(globalIndex).padStart(3, "0")}`;

      let builtCandidate: CandidateQuestionInput | undefined;
      for (let retry = 0; retry < 150; retry += 1) {
        attemptOffset += 1;
        const candidateSeed = baseSeed + aIdx * 10_000 + attemptOffset;
        const rand = createPrng(candidateSeed);
        const draft = builder(
          itemId,
          candidateSeed,
          format,
          localIdx,
          rand,
          generatorModel,
        );
        if (!draft) continue;

        const gateExec = verifyCandidateWithGate(draft, {
          existingShardItems: existingStems,
          nearDuplicateSimilarityThreshold: 0.55,
        });
        if (gateExec.evaluation.valid) {
          builtCandidate = draft;
          existingStems.push({
            id: draft.id,
            stem: draft.stem,
            stemFingerprint: gateExec.evaluation.stemFingerprint,
          });
          break;
        }
      }

      if (!builtCandidate) {
        throw new Error(
          `Failed to synthesize gate-valid circuits candidate for ${spec.conceptId}::${spec.templateArchetype} (${format}, index ${localIdx})`,
        );
      }
      accepted.push(builtCandidate);
    }
  }

  return accepted;
}
