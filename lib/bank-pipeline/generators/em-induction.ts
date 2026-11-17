import {
  getCompatibleSyllabiForConcept,
  SyllabusLevel,
} from "@/lib/constants/syllabi";
import {
  AcGeneratorSpec,
  BainbridgeSpectrometerSpec,
  CapacitorNetworkSpec,
  createSeededRng,
  ElectricDeflectionSpec,
  ELECTRON_MASS_KG,
  ELEMENTARY_CHARGE_C,
  EmInductionScenarioKind,
  FluxFaradaySpec,
  MagneticCyclotronSpec,
  MagneticFieldPageDirection,
  MotionalEmfRailsSpec,
  ParallelPlateCapacitorSpec,
  PlatePolarity,
  PROTON_MASS_KG,
  RcTransientSpec,
  SeededRng,
  solveEmInductionScenario,
  TransformerSpec,
  VACUUM_PERMITTIVITY,
  VelocitySelectorSpec,
} from "@/lib/visuals/em-induction";

import {
  buildOptionEquivalenceKey,
  numbersAgreeWithinTolerance,
} from "../numeric-checker";
import { ExistingStemEntry, verifyCandidateWithGate } from "../package-gate";
import {
  CandidateQuestionInput,
  CandidateQuestionPlan,
  MarkSchemePoint,
  MCQ_OPTION_LABELS,
  McqOptionItem,
  QuestionDifficulty,
  QuestionFormat,
  RequiredGivenSpec,
  StructuredQuestionPart,
  SyllabusTag,
} from "../types";

export interface EmInductionArchetypeDescriptor {
  readonly conceptId: string;
  readonly templateArchetype: string;
  readonly scenarioKind: EmInductionScenarioKind;
  readonly syllabusScope:
    | "alevel-only-cap"
    | "alevel-ncuk-cap"
    | "all-three-induction-hl"
    | "alevel-only-rms"
    | "alevel-ncuk-transformer"
    | "all-three-particles";
}

export const EM_INDUCTION_ARCHETYPE_CATALOGUE: readonly EmInductionArchetypeDescriptor[] =
  [
    {
      conceptId: "capacitor-networks-energy",
      templateArchetype: "parallel-plate-dielectric-capacitance-energy",
      scenarioKind: "parallel-plate-capacitor",
      syllabusScope: "alevel-only-cap",
    },
    {
      conceptId: "capacitor-networks-energy",
      templateArchetype: "parallel-plate-geometry-change-constraints",
      scenarioKind: "parallel-plate-capacitor",
      syllabusScope: "alevel-only-cap",
    },
    {
      conceptId: "capacitor-networks-energy",
      templateArchetype: "series-parallel-capacitor-network-analysis",
      scenarioKind: "capacitor-network",
      syllabusScope: "alevel-ncuk-cap",
    },
    {
      conceptId: "capacitor-networks-energy",
      templateArchetype: "capacitor-charge-sharing-redistribution",
      scenarioKind: "capacitor-network",
      syllabusScope: "alevel-ncuk-cap",
    },
    {
      conceptId: "capacitor-rc-decay",
      templateArchetype: "rc-charging-discharging-exponential-transient",
      scenarioKind: "rc-transient",
      syllabusScope: "alevel-ncuk-cap",
    },
    {
      conceptId: "electromagnetic-induction-faraday-lenz",
      templateArchetype: "faraday-flux-linkage-coil-angle",
      scenarioKind: "flux-faraday",
      syllabusScope: "all-three-induction-hl",
    },
    {
      conceptId: "electromagnetic-induction-faraday-lenz",
      templateArchetype: "faraday-field-reversal-induced-charge",
      scenarioKind: "flux-faraday",
      syllabusScope: "all-three-induction-hl",
    },
    {
      conceptId: "electromagnetic-induction-faraday-lenz",
      templateArchetype: "motional-emf-conducting-rails-braking",
      scenarioKind: "motional-emf-rails",
      syllabusScope: "all-three-induction-hl",
    },
    {
      conceptId: "ac-generators-transformers",
      templateArchetype: "rotating-coil-ac-peak-emf-waveform",
      scenarioKind: "ac-generator",
      syllabusScope: "all-three-induction-hl",
    },
    {
      conceptId: "ac-generators-transformers",
      templateArchetype: "ac-generator-rms-sinusoidal-power",
      scenarioKind: "ac-generator",
      syllabusScope: "alevel-only-rms",
    },
    {
      conceptId: "ac-generators-transformers",
      templateArchetype: "transformer-turns-ratio-and-efficiency",
      scenarioKind: "transformer",
      syllabusScope: "alevel-ncuk-transformer",
    },
    {
      conceptId: "electrostatic-coulomb-uniform-fields",
      templateArchetype: "uniform-plate-parabolic-deflection",
      scenarioKind: "electric-deflection",
      syllabusScope: "all-three-particles",
    },
    {
      conceptId: "magnetic-force-charges-currents",
      templateArchetype: "cyclotron-circular-orbit-radius-period",
      scenarioKind: "magnetic-cyclotron",
      syllabusScope: "all-three-particles",
    },
    {
      conceptId: "magnetic-force-charges-currents",
      templateArchetype: "accelerated-ion-beam-magnetic-deflection",
      scenarioKind: "magnetic-cyclotron",
      syllabusScope: "all-three-particles",
    },
    {
      conceptId: "magnetic-force-charges-currents",
      templateArchetype: "crossed-fields-wein-velocity-selector",
      scenarioKind: "velocity-selector",
      syllabusScope: "all-three-particles",
    },
    {
      conceptId: "magnetic-force-charges-currents",
      templateArchetype: "bainbridge-mass-spectrometer-isotope-separation",
      scenarioKind: "bainbridge-mass-spectrometer",
      syllabusScope: "all-three-particles",
    },
  ] as const;

export interface GenerateEmInductionCandidatesOptions {
  readonly count?: number;
  readonly baseSeed?: number;
  readonly mcqFraction?: number;
}

const SUPERSCRIPT_MAP: Readonly<Record<string, string>> = {
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

function toSuperscriptExponent(exp: number): string {
  return [...String(exp)].map((ch) => SUPERSCRIPT_MAP[ch] ?? ch).join("");
}

function fmtNum(value: number, sigFigs = 3): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot format non-finite physics value: ${String(value)}`);
  }
  if (Math.abs(value) < 1e-18) {
    return "0";
  }
  const sign = value < 0 ? "−" : "";
  const absVal = Math.abs(value);
  const rounded = Number(absVal.toPrecision(sigFigs));
  if (rounded >= 0.01 && rounded < 10_000) {
    const precStr = absVal.toPrecision(sigFigs);
    if (!precStr.includes("e")) {
      return `${sign}${precStr}`;
    }
  }
  const [mantissa, expRaw] = absVal.toExponential(sigFigs - 1).split("e");
  const exp = Number(expRaw);
  if (exp === 0) {
    return `${sign}${mantissa}`;
  }
  return `${sign}${mantissa} × 10${toSuperscriptExponent(exp)}`;
}

function fmtGiven(value: number): string {
  if (Math.abs(value) < 1e-18) {
    return "0";
  }
  const sign = value < 0 ? "−" : "";
  const absVal = Math.abs(value);
  if (absVal >= 1e-3 && absVal < 100_000) {
    const clean = Number(absVal.toPrecision(6)).toString();
    if (!clean.includes("e")) {
      return `${sign}${clean}`;
    }
  }
  return fmtNum(value, 3);
}

function fmtQty(value: number, unit: string, sigFigs = 3): string {
  const numPart = fmtNum(value, sigFigs);
  if (!unit) return numPart;
  if (unit === "°") return `${numPart}°`;
  return `${numPart} ${unit}`;
}

function fmtUf(capacitanceF: number): string {
  const uf = Number((capacitanceF * 1e6).toPrecision(4));
  return `${uf} μF`;
}

function fmtKohm(resistanceOhm: number): string {
  if (resistanceOhm >= 1000) {
    const kohm = Number((resistanceOhm / 1000).toPrecision(4));
    return `${kohm} kΩ`;
  }
  return `${fmtGiven(resistanceOhm)} Ω`;
}

interface DistractorCandidate {
  readonly value: number;
  readonly rationale: string;
}

interface BuiltMcqBundle {
  readonly options: [McqOptionItem, McqOptionItem, McqOptionItem, McqOptionItem];
  readonly correctLabel: "A" | "B" | "C" | "D";
}

function buildMcqBundle(
  rng: SeededRng,
  correctValue: number,
  unit: string,
  candidates: readonly DistractorCandidate[],
  allowNegative = false,
): BuiltMcqBundle {
  const correctText = fmtQty(correctValue, unit, 3);
  const usedEquivKeys = new Set<string>([buildOptionEquivalenceKey(correctText)]);
  const chosenValues: number[] = [correctValue];
  const selectedDistractors: Array<{ text: string; rationale: string }> = [];

  const isAcceptable = (val: number): boolean => {
    if (!Number.isFinite(val)) return false;
    if (!allowNegative && correctValue > 0 && val <= 0) return false;
    if (Math.abs(correctValue) > 1e-15 && Math.abs(val) < 1e-18 && !allowNegative) {
      return false;
    }
    for (const prev of chosenValues) {
      if (
        numbersAgreeWithinTolerance(val, prev, {
          significantFigures: 3,
          relativeTolerance: 0.025,
          absoluteZeroTolerance: 1e-40,
        })
      ) {
        return false;
      }
    }
    const text = fmtQty(val, unit, 3);
    const equivKey = buildOptionEquivalenceKey(text);
    if (usedEquivKeys.has(equivKey)) {
      return false;
    }
    return true;
  };

  for (const cand of candidates) {
    if (selectedDistractors.length >= 3) break;
    if (isAcceptable(cand.value)) {
      const text = fmtQty(cand.value, unit, 3);
      usedEquivKeys.add(buildOptionEquivalenceKey(text));
      chosenValues.push(cand.value);
      selectedDistractors.push({
        text,
        rationale: cand.rationale,
      });
    }
  }

  const fallbackMultipliers: ReadonlyArray<{
    mult: number;
    desc: string;
  }> = [
    {
      mult: 0.5,
      desc: "Introduces an extraneous factor of one-half during algebraic rearrangement.",
    },
    {
      mult: 2.0,
      desc: "Doubles the target quantity through a missing factor of one-half or diameter-radius confusion.",
    },
    {
      mult: Math.SQRT2,
      desc: "Multiplies by √2 through an inverted root-mean-square or kinetic-energy scaling.",
    },
    {
      mult: 1 / Math.SQRT2,
      desc: "Divides by √2 by applying an inappropriate sinusoidal rms factor.",
    },
    {
      mult: 0.25,
      desc: "Applies an extra factor of one-quarter by squaring a halved intermediate quantity.",
    },
    {
      mult: 4.0,
      desc: "Multiplies by four through squaring a doubled geometric parameter.",
    },
    {
      mult: 10.0,
      desc: "Drops a power-of-ten SI prefix conversion when substituting given values.",
    },
  ];

  for (const fb of fallbackMultipliers) {
    if (selectedDistractors.length >= 3) break;
    const val = correctValue * fb.mult;
    if (isAcceptable(val)) {
      const text = fmtQty(val, unit, 3);
      usedEquivKeys.add(buildOptionEquivalenceKey(text));
      chosenValues.push(val);
      selectedDistractors.push({
        text,
        rationale: fb.desc,
      });
    }
  }

  if (selectedDistractors.length < 3) {
    throw new Error(
      `Unable to synthesize 3 distinct distractors around ${correctText}`,
    );
  }

  const rawEntries: Array<{
    text: string;
    isCorrect: boolean;
    distractorRationale?: string;
  }> = [
    { text: correctText, isCorrect: true },
    ...selectedDistractors.map((d) => ({
      text: d.text,
      isCorrect: false,
      distractorRationale: d.rationale,
    })),
  ];

  // Deterministic Fisher-Yates shuffle
  for (let i = rawEntries.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(0, i);
    const tmp = rawEntries[i];
    rawEntries[i] = rawEntries[j];
    rawEntries[j] = tmp;
  }

  let correctLabel: "A" | "B" | "C" | "D" = "A";
  const options = rawEntries.map((entry, idx) => {
    const label = MCQ_OPTION_LABELS[idx];
    if (entry.isCorrect) {
      correctLabel = label;
    }
    return {
      label,
      text: entry.text,
      isCorrect: entry.isCorrect,
      ...(entry.distractorRationale
        ? { distractorRationale: entry.distractorRationale }
        : {}),
    };
  }) as [McqOptionItem, McqOptionItem, McqOptionItem, McqOptionItem];

  return { options, correctLabel };
}

interface SubpartBlueprint {
  readonly partId: string;
  readonly prompt: string;
  readonly marks: 1 | 2;
  readonly dependsOnPartIds?: string[];
  readonly targetQuantityKey: string;
  readonly truthValue: number;
  readonly unit: string;
  readonly methodCriterion?: string;
  readonly workingFormula: string;
  readonly workingSubstitution: string;
}

function buildStructuredBundle(blueprints: readonly SubpartBlueprint[]): {
  parts: StructuredQuestionPart[];
  workedSolution: string;
  markScheme: MarkSchemePoint[];
  totalMarks: number;
} {
  const parts: StructuredQuestionPart[] = [];
  const markScheme: MarkSchemePoint[] = [];
  const solutionSegments: string[] = [];
  let totalMarks = 0;

  for (const bp of blueprints) {
    const ans = fmtQty(bp.truthValue, bp.unit, 3);
    parts.push({
      partId: bp.partId,
      prompt: bp.prompt,
      marks: bp.marks,
      ...(bp.dependsOnPartIds && bp.dependsOnPartIds.length > 0
        ? { dependsOnPartIds: bp.dependsOnPartIds }
        : {}),
      targetQuantityKey: bp.targetQuantityKey,
      expectedAnswer: ans,
      workingSteps: [bp.workingFormula, `${bp.workingSubstitution} = ${ans}.`],
    });

    solutionSegments.push(
      `(${bp.partId}) ${bp.workingFormula} ${bp.workingSubstitution} = ${ans}.`,
    );

    if (bp.marks === 2) {
      markScheme.push({
        code: "M1",
        partId: bp.partId,
        criterion: bp.methodCriterion ?? `Applies ${bp.workingFormula}`,
        marks: 1,
      });
      markScheme.push({
        code: "A1",
        partId: bp.partId,
        criterion: `Obtains ${ans}.`,
        marks: 1,
      });
    } else {
      markScheme.push({
        code: "A1",
        partId: bp.partId,
        criterion: `States ${ans}.`,
        marks: 1,
      });
    }
    totalMarks += bp.marks;
  }

  return {
    parts,
    workedSolution: solutionSegments.join(" "),
    markScheme,
    totalMarks,
  };
}

function resolveArchetypeSyllabi(
  descriptor: EmInductionArchetypeDescriptor,
  format: QuestionFormat,
  variantIndex: number,
): SyllabusTag[] {
  const compatible = getCompatibleSyllabiForConcept(descriptor.conceptId, {
    format,
    excludeOptionTopics: true,
  });

  const tags: SyllabusTag[] = [];

  for (const mapping of compatible) {
    if (descriptor.syllabusScope === "alevel-only-cap") {
      if (mapping.syllabus !== "alevel") continue;
      tags.push({
        syllabus: "alevel",
        level: "Y13",
        topicId: mapping.topicIds[0],
        subtopicId: mapping.subtopicIds[0],
      });
    } else if (descriptor.syllabusScope === "alevel-ncuk-cap") {
      if (mapping.syllabus === "ib") continue;
      const preferredLevel: SyllabusLevel =
        mapping.syllabus === "alevel" ? "Y13" : "IFY-S1";
      const level = mapping.levels.includes(preferredLevel)
        ? preferredLevel
        : mapping.levels[0];
      tags.push({
        syllabus: mapping.syllabus,
        level,
        topicId: mapping.topicIds[0],
        subtopicId: mapping.subtopicIds[0],
      });
    } else if (descriptor.syllabusScope === "all-three-induction-hl") {
      const preferredLevel: SyllabusLevel =
        mapping.syllabus === "ib"
          ? "HL"
          : mapping.syllabus === "alevel"
            ? "Y13"
            : "IFY-S2";
      if (!mapping.levels.includes(preferredLevel)) continue;
      tags.push({
        syllabus: mapping.syllabus,
        level: preferredLevel,
        topicId: mapping.topicIds[0],
        subtopicId: mapping.subtopicIds[0],
      });
    } else if (descriptor.syllabusScope === "alevel-only-rms") {
      if (mapping.syllabus !== "alevel") continue;
      tags.push({
        syllabus: "alevel",
        level: "Y13",
        topicId: mapping.topicIds[0],
        subtopicId: mapping.subtopicIds[0],
      });
    } else if (descriptor.syllabusScope === "alevel-ncuk-transformer") {
      if (mapping.syllabus === "ib") continue;
      const preferredLevel: SyllabusLevel =
        mapping.syllabus === "alevel" ? "Y13" : "IFY-S2";
      if (!mapping.levels.includes(preferredLevel)) continue;
      tags.push({
        syllabus: mapping.syllabus,
        level: preferredLevel,
        topicId: mapping.topicIds[0],
        subtopicId: mapping.subtopicIds[0],
      });
    } else if (descriptor.syllabusScope === "all-three-particles") {
      if (mapping.syllabus === "ib") {
        const ibLevel: SyllabusLevel = variantIndex % 2 === 0 ? "SL" : "HL";
        const subId = mapping.subtopicIds.includes("ib-d3-motion-em-fields")
          ? "ib-d3-motion-em-fields"
          : mapping.subtopicIds[0];
        tags.push({
          syllabus: "ib",
          level: ibLevel,
          topicId: mapping.topicIds[0],
          subtopicId: subId,
        });
      } else if (mapping.syllabus === "alevel") {
        tags.push({
          syllabus: "alevel",
          level: "Y13",
          topicId: mapping.topicIds[0],
          subtopicId: mapping.subtopicIds[0],
        });
      } else if (mapping.syllabus === "ncuk") {
        tags.push({
          syllabus: "ncuk",
          level: "IFY-S2",
          topicId: mapping.topicIds[0],
          subtopicId: mapping.subtopicIds[0],
        });
      }
    }
  }

  if (tags.length === 0) {
    throw new Error(
      `No compatible syllabi resolved for ${descriptor.conceptId}::${descriptor.templateArchetype}`,
    );
  }
  return tags;
}

function buildDigitFreePlan(
  format: QuestionFormat,
  targetSummary: string,
  misconceptions: readonly string[],
  subpartGoals?: readonly string[],
): CandidateQuestionPlan {
  if (format === "mcq") {
    return {
      targetSummary,
      distractorStrategy: [...misconceptions],
    };
  }
  return {
    targetSummary,
    subpartStrategy: [...(subpartGoals ?? [])],
  };
}

// ============================================================================
// ARCHETYPE 1: parallel-plate-dielectric-capacitance-energy
// ============================================================================

const DIELECTRIC_CONTEXTS = [
  { device: "ceramic capacitive pressure transducer", dielectric: "alumina ceramic" },
  { device: "polymer-film pulse energy storage cell", dielectric: "polypropylene film" },
  { device: "precision touch-panel sensing element", dielectric: "borosilicate glass" },
  { device: "aerospace humidity-compensated sensor", dielectric: "polyimide sheet" },
  { device: "medical defibrillator test capacitor", dielectric: "mica insulator" },
  { device: "radio-frequency tuning plate assembly", dielectric: "polystyrene slab" },
  { device: "high-voltage laser flashlamp cell", dielectric: "cast epoxy resin" },
  { device: "microbalance displacement detector", dielectric: "fused quartz wafer" },
  { device: "laboratory dielectric-constant cell", dielectric: "nylon spacer" },
  { device: "industrial proximity-sensing pad", dielectric: "silicone elastomer" },
] as const;

function composeParallelPlateStem(
  frameIdx: number,
  ctx: (typeof DIELECTRIC_CONTEXTS)[number],
  area: number,
  sep: number,
  er: number,
  voltage: number,
  questionTail: string,
): string {
  const aStr = `${fmtGiven(area)} m²`;
  const dStr = `${fmtGiven(sep)} m`;
  const erStr = fmtGiven(er);
  const vStr = `${fmtGiven(voltage)} V`;
  const epsStr = "ε₀ = 8.85 × 10⁻¹² F m⁻¹";

  switch (frameIdx % 8) {
    case 0:
      return `A ${ctx.device} consists of parallel conducting plates of overlapping area ${aStr} separated by a uniform ${ctx.dielectric} layer of thickness ${dStr} and relative permittivity ${erStr}. A steady potential difference of ${vStr} is maintained across the plates (${epsStr}). ${questionTail}`.trim();
    case 1:
      return `During a dielectric bench test, a ${ctx.dielectric} sheet with relative permittivity ${erStr} completely fills the ${dStr} gap between parallel metal plates of area ${aStr} inside a ${ctx.device}. When the assembly is charged to ${vStr} (take ${epsStr}), ${questionTail}`.trim();
    case 2:
      return `In a ${ctx.device}, a regulated DC supply applies ${vStr} across two flat parallel electrodes of effective area ${aStr} spaced ${dStr} apart. The space between the electrodes is filled uniformly by ${ctx.dielectric} of relative permittivity ${erStr} (${epsStr}). ${questionTail}`.trim();
    case 3:
      return `Parallel rectangular plates of area ${aStr} in a ${ctx.device} enclose a solid ${ctx.dielectric} slab (relative permittivity ${erStr}) that sets the plate separation at ${dStr}. Taking ${epsStr} with an applied terminal voltage of ${vStr}, ${questionTail}`.trim();
    case 4:
      return `An engineer calibrates a ${ctx.device} built from parallel plates of area ${aStr} separated by ${dStr} of ${ctx.dielectric} whose relative permittivity is ${erStr}. With ${vStr} connected steadily between the plates and ${epsStr}, ${questionTail}`.trim();
    case 5:
      return `Within a ${ctx.device}, a uniform electric field is established across a ${dStr} layer of ${ctx.dielectric} (εᵣ = ${erStr}) sandwiched between conducting plates of area ${aStr} held at a potential difference of ${vStr}. Using ${epsStr}, ${questionTail}`.trim();
    case 6:
      return `A laboratory prototype of a ${ctx.device} employs parallel electrodes of area ${aStr}, a ${ctx.dielectric} dielectric of thickness ${dStr} and relative permittivity ${erStr}, and a charging supply of ${vStr} (${epsStr}). ${questionTail}`.trim();
    default:
      return `To characterise ${ctx.dielectric} of relative permittivity ${erStr}, a ${ctx.device} with plate area ${aStr} and plate spacing ${dStr} is energised by a ${vStr} DC source (${epsStr}). ${questionTail}`.trim();
  }
}

function buildArchetype1Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const areas = [0.24, 0.32, 0.4, 0.48, 0.6, 0.75, 0.9, 1.1, 1.25, 1.5];
  const seps = [0.0002, 0.00025, 0.0003, 0.0004, 0.0005, 0.0006, 0.0008];
  const ers = [3.2, 3.8, 4.4, 5.2, 6.0, 6.8, 7.5];
  const volts = [80, 120, 150, 180, 220, 260, 320, 400];

  const plateAreaM2 = areas[(variantIdx * 3 + rng.nextInt(0, 1)) % areas.length];
  const plateSeparationM = seps[(variantIdx * 5 + 1) % seps.length];
  const relativePermittivity = ers[(variantIdx * 2 + 1) % ers.length];
  const voltageV = volts[(variantIdx * 4 + 2) % volts.length];

  const spec: ParallelPlateCapacitorSpec = {
    kind: "parallel-plate-capacitor",
    plateAreaM2,
    plateSeparationM,
    relativePermittivity,
    permittivityFPerM: VACUUM_PERMITTIVITY,
    voltageV,
  };
  const sol = solveEmInductionScenario(spec);
  if (sol.kind !== "parallel-plate-capacitor") throw new Error("Unexpected solution");

  const hiddenQuantities = [
    "capacitanceF",
    "chargeC",
    "electricFieldVm",
    "storedEnergyJ",
    "energyDensityJm3",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "plateAreaM2", value: plateAreaM2, unit: "m²", source: "stem" },
    { name: "plateSeparationM", value: plateSeparationM, unit: "m", source: "stem" },
    { name: "relativePermittivity", value: relativePermittivity, source: "stem" },
    { name: "voltageV", value: voltageV, unit: "V", source: "stem" },
    { name: "permittivityFPerM", value: VACUUM_PERMITTIVITY, unit: "F m⁻¹", source: "stem" },
  ];
  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const ctx = DIELECTRIC_CONTEXTS[(variantIdx * 3) % DIELECTRIC_CONTEXTS.length];

  if (format === "mcq") {
    const subMode = variantIdx % 4;
    const difficulty: QuestionDifficulty =
      subMode === 1 ? "foundation" : subMode === 3 ? "higher" : "standard";

    if (subMode === 0) {
      const qTail =
        variantIdx % 2 === 0
          ? "What electrostatic energy is stored in the capacitor?"
          : "determine the electrostatic potential energy stored between the plates.";
      const stem = composeParallelPlateStem(
        variantIdx,
        ctx,
        plateAreaM2,
        plateSeparationM,
        relativePermittivity,
        voltageV,
        qTail,
      );
      const cVac = (VACUUM_PERMITTIVITY * plateAreaM2) / plateSeparationM;
      const mcq = buildMcqBundle(rng, sol.storedEnergyJ, "J", [
        {
          value: sol.capacitanceF * voltageV ** 2,
          rationale:
            "Omits the factor of one-half in U = ½CV² and calculates CV² instead.",
        },
        {
          value: 0.5 * cVac * voltageV ** 2,
          rationale:
            "Omits the relative permittivity εᵣ of the dielectric and uses vacuum capacitance ε₀A/d.",
        },
        {
          value: 0.5 * sol.capacitanceF * voltageV,
          rationale:
            "Calculates ½CV (= ½Q) by forgetting to square the potential difference V.",
        },
        {
          value: (0.5 * cVac * voltageV ** 2) / relativePermittivity,
          rationale:
            "Divides by relative permittivity εᵣ instead of multiplying when finding capacitance.",
        },
      ]);
      const ans = fmtQty(sol.storedEnergyJ, "J");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Compute electrostatic stored energy in a dielectric parallel-plate capacitor",
          [
            "omitting half factor in capacitor energy formula",
            "ignoring dielectric relative permittivity factor",
            "forgetting to square applied voltage",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "storedEnergyJ",
        workedSolution: `Capacitance C = εᵣε₀A / d = ${relativePermittivity} × 8.85 × 10⁻¹² × ${plateAreaM2} / ${plateSeparationM} = ${fmtQty(sol.capacitanceF, "F")}. Stored energy U = ½CV² = 0.5 × ${fmtNum(sol.capacitanceF)} × (${voltageV})² = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates C = εᵣε₀A/d and U = ½CV² to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      const qTail =
        variantIdx % 2 === 0
          ? "What is the capacitance of this parallel-plate arrangement?"
          : "calculate the capacitance of the dielectric-filled assembly.";
      const stem = composeParallelPlateStem(
        variantIdx + 2,
        ctx,
        plateAreaM2,
        plateSeparationM,
        relativePermittivity,
        voltageV,
        qTail,
      );
      const mcq = buildMcqBundle(rng, sol.capacitanceF, "F", [
        {
          value: (VACUUM_PERMITTIVITY * plateAreaM2) / plateSeparationM,
          rationale:
            "Leaves out the dielectric relative permittivity εᵣ and calculates free-space capacitance ε₀A/d.",
        },
        {
          value:
            (VACUUM_PERMITTIVITY * plateAreaM2) /
            (relativePermittivity * plateSeparationM),
          rationale:
            "Divides by relative permittivity εᵣ rather than multiplying ε₀ by εᵣ.",
        },
        {
          value:
            relativePermittivity *
            VACUUM_PERMITTIVITY *
            plateAreaM2 *
            plateSeparationM,
          rationale:
            "Multiplies by plate separation d instead of dividing by d.",
        },
        {
          value: sol.chargeC,
          rationale:
            "Multiplies capacitance by applied voltage V and reports stored charge Q instead of C.",
        },
      ]);
      const ans = fmtQty(sol.capacitanceF, "F");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Evaluate parallel-plate capacitance with solid dielectric medium",
          [
            "omitting relative permittivity",
            "dividing instead of multiplying by relative permittivity",
            "multiplying instead of dividing by plate separation",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "capacitanceF",
        workedSolution: `Using C = εᵣε₀A / d = (${relativePermittivity})(8.85 × 10⁻¹²)(${plateAreaM2}) / ${plateSeparationM} = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies C = εᵣε₀A / d to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 2) {
      const qTail =
        variantIdx % 2 === 0
          ? "What magnitude of charge is stored on each conducting plate?"
          : "find the magnitude of electric charge accumulated on either plate.";
      const stem = composeParallelPlateStem(
        variantIdx + 4,
        ctx,
        plateAreaM2,
        plateSeparationM,
        relativePermittivity,
        voltageV,
        qTail,
      );
      const mcq = buildMcqBundle(rng, sol.chargeC, "C", [
        {
          value: sol.chargeC / relativePermittivity,
          rationale:
            "Ignores the dielectric polarization factor εᵣ when computing capacitance before Q = CV.",
        },
        {
          value: sol.capacitanceF / voltageV,
          rationale:
            "Rearranges C = Q/V incorrectly as Q = C/V instead of Q = CV.",
        },
        {
          value: sol.storedEnergyJ,
          rationale:
            "Computes stored energy ½CV² rather than stored plate charge Q = CV.",
        },
        {
          value: 0.5 * sol.chargeC,
          rationale:
            "Includes an erroneous factor of one-half from the energy equation inside Q = CV.",
        },
      ]);
      const ans = fmtQty(sol.chargeC, "C");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Determine plate charge magnitude from dielectric geometry and applied voltage",
          [
            "omitting dielectric permittivity factor",
            "dividing capacitance by voltage",
            "confusing stored energy with stored charge",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "chargeC",
        workedSolution: `Capacitance C = εᵣε₀A / d = ${fmtQty(sol.capacitanceF, "F")}. Plate charge Q = CV = ${fmtNum(sol.capacitanceF)} × ${voltageV} = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Combines C = εᵣε₀A/d with Q = CV to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const qTail =
      variantIdx % 2 === 0
        ? "What is the electrostatic energy density within the dielectric layer?"
        : "calculate the energy stored per unit volume inside the dielectric.";
    const stem = composeParallelPlateStem(
      variantIdx + 6,
      ctx,
      plateAreaM2,
      plateSeparationM,
      relativePermittivity,
      voltageV,
      qTail,
    );
    const mcq = buildMcqBundle(rng, sol.energyDensityJm3, "J m⁻³", [
      {
        value: 2 * sol.energyDensityJm3,
        rationale:
          "Forgets the factor of one-half in u_E = ½εᵣε₀E².",
      },
      {
        value: sol.energyDensityJm3 / relativePermittivity,
        rationale:
          "Uses free-space energy density ½ε₀E² and omits the dielectric constant εᵣ.",
      },
      {
        value: sol.storedEnergyJ,
        rationale:
          "Stops at total stored energy U = ½CV² without dividing by dielectric volume Ad.",
      },
      {
        value: 0.5 * relativePermittivity * VACUUM_PERMITTIVITY * sol.electricFieldVm,
        rationale:
          "Omits the square on electric field strength E in u_E = ½εᵣε₀E².",
      },
    ]);
    const ans = fmtQty(sol.energyDensityJm3, "J m⁻³");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Compute volumetric electrostatic energy density inside uniform dielectric capacitor",
        [
          "missing half factor in energy density relation",
          "omitting relative permittivity factor",
          "reporting total stored energy instead of energy per unit volume",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "energyDensityJm3",
      workedSolution: `Uniform field E = V / d = ${voltageV} / ${plateSeparationM} = ${fmtQty(sol.electricFieldVm, "V m⁻¹")}. Energy density u_E = ½εᵣε₀E² = 0.5 × ${relativePermittivity} × 8.85 × 10⁻¹² × (${fmtNum(sol.electricFieldVm)})² = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates E = V/d and u_E = ½εᵣε₀E² to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured Paper 2 item
  const stem = composeParallelPlateStem(
    variantIdx + 1,
    ctx,
    plateAreaM2,
    plateSeparationM,
    relativePermittivity,
    voltageV,
    "",
  );
  const useFieldPart = variantIdx % 2 === 0;
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: "Calculate the capacitance of the parallel-plate arrangement.",
      marks: 2,
      targetQuantityKey: "capacitanceF",
      truthValue: sol.capacitanceF,
      unit: "F",
      methodCriterion: "Substitutes into C = εᵣε₀A / d.",
      workingFormula: "C = εᵣε₀A / d.",
      workingSubstitution: `C = (${relativePermittivity})(8.85 × 10⁻¹²)(${plateAreaM2}) / ${plateSeparationM}`,
    },
    useFieldPart
      ? {
          partId: "b",
          prompt:
            "Determine the magnitude of the uniform electric field inside the dielectric.",
          marks: 2,
          targetQuantityKey: "electricFieldVm",
          truthValue: sol.electricFieldVm,
          unit: "V m⁻¹",
          methodCriterion: "Uses uniform-field gradient relation E = V / d.",
          workingFormula: "E = V / d.",
          workingSubstitution: `E = ${voltageV} / ${plateSeparationM}`,
        }
      : {
          partId: "b",
          prompt: "Calculate the magnitude of charge stored on each plate.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "chargeC",
          truthValue: sol.chargeC,
          unit: "C",
          methodCriterion: "Multiplies capacitance from (a) by applied voltage Q = CV.",
          workingFormula: "Q = CV.",
          workingSubstitution: `Q = ${fmtNum(sol.capacitanceF)} × ${voltageV}`,
        },
    {
      partId: "c",
      prompt: "Calculate the electrostatic energy stored in the capacitor.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "storedEnergyJ",
      truthValue: sol.storedEnergyJ,
      unit: "J",
      methodCriterion: "Applies U = ½CV² using capacitance from (a).",
      workingFormula: "U = ½CV².",
      workingSubstitution: `U = 0.5 × ${fmtNum(sol.capacitanceF)} × (${voltageV})²`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "standard",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Multi-step analysis of parallel-plate dielectric capacitance, field or charge, and stored energy",
      [],
      [
        "part: evaluate dielectric parallel-plate capacitance",
        "part: determine electric field strength or stored plate charge",
        "part: compute stored electrostatic potential energy",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 2: parallel-plate-geometry-change-constraints
// ============================================================================

const PLATE_CHANGE_CONTEXTS = [
  "capacitive MEMS accelerometer",
  "variable-gap precision electrometer",
  "dielectric displacement gauge",
  "electrostatic actuator test rig",
  "parallel-plate laboratory condenser",
  "vacuum-insulated capacitive load cell",
  "high-voltage plate-separation apparatus",
  "piezo-positioned capacitor stage",
] as const;

function buildArchetype2Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const areas = [0.25, 0.35, 0.45, 0.55, 0.7, 0.85, 1.0];
  const seps = [0.00024, 0.0003, 0.0004, 0.0005, 0.0006];
  const ers = [3.5, 4.0, 4.8, 5.5, 6.5];
  const volts = [100, 140, 180, 220, 280, 350, 420];
  const sepMults = [0.5, 1.5, 2.0, 2.5];

  const plateAreaM2 = areas[(variantIdx * 2) % areas.length];
  const plateSeparationM = seps[(variantIdx * 3 + 1) % seps.length];
  const relativePermittivity = ers[(variantIdx * 2 + 2) % ers.length];
  const voltageV = volts[(variantIdx * 3) % volts.length];
  const mult = sepMults[variantIdx % sepMults.length];
  const newSeparationM = Number((plateSeparationM * mult).toPrecision(4));
  const constraint: "isolated-charge" | "constant-voltage" =
    variantIdx % 2 === 0 ? "isolated-charge" : "constant-voltage";

  const spec: ParallelPlateCapacitorSpec = {
    kind: "parallel-plate-capacitor",
    plateAreaM2,
    plateSeparationM,
    relativePermittivity,
    permittivityFPerM: VACUUM_PERMITTIVITY,
    voltageV,
    afterChange: {
      constraint,
      newSeparationM,
    },
  };
  const sol = solveEmInductionScenario(spec);
  if (sol.kind !== "parallel-plate-capacitor" || !sol.afterChange) {
    throw new Error("Expected parallel-plate afterChange solution");
  }

  const hiddenQuantities =
    constraint === "isolated-charge"
      ? [
          "capacitanceF",
          "chargeC",
          "electricFieldVm",
          "storedEnergyJ",
          "energyDensityJm3",
          "afterCapacitanceF",
          "afterVoltageV",
          "afterElectricFieldVm",
          "afterStoredEnergyJ",
          "energyChangeJ",
        ]
      : [
          "capacitanceF",
          "chargeC",
          "electricFieldVm",
          "storedEnergyJ",
          "energyDensityJm3",
          "afterCapacitanceF",
          "afterChargeC",
          "afterElectricFieldVm",
          "afterStoredEnergyJ",
          "energyChangeJ",
        ];

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "plateAreaM2", value: plateAreaM2, unit: "m²", source: "stem" },
    { name: "plateSeparationM", value: plateSeparationM, unit: "m", source: "stem" },
    { name: "relativePermittivity", value: relativePermittivity, source: "stem" },
    { name: "voltageV", value: voltageV, unit: "V", source: "stem" },
    { name: "newSeparationM", value: newSeparationM, unit: "m", source: "stem" },
    { name: "permittivityFPerM", value: VACUUM_PERMITTIVITY, unit: "F m⁻¹", source: "stem" },
  ];

  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const app = PLATE_CHANGE_CONTEXTS[variantIdx % PLATE_CHANGE_CONTEXTS.length];
  const constraintProse =
    constraint === "isolated-charge"
      ? "disconnected from the DC source so the plates remain electrically isolated, and the plate separation is then adjusted to"
      : "kept connected across the DC source at constant potential difference while the plate separation is adjusted to";

  const buildStem = (tail: string): string => {
    const f = variantIdx % 6;
    if (f === 0) {
      return `In a ${app}, parallel plates of area ${fmtGiven(plateAreaM2)} m² separated by ${fmtGiven(plateSeparationM)} m with dielectric relative permittivity ${fmtGiven(relativePermittivity)} are initially charged to ${fmtGiven(voltageV)} V (take ε₀ = 8.85 × 10⁻¹² F m⁻¹). The capacitor is ${constraintProse} ${fmtGiven(newSeparationM)} m (maintaining relative permittivity ${fmtGiven(relativePermittivity)}). ${tail}`.trim();
    }
    if (f === 1) {
      return `A ${app} has plate area ${fmtGiven(plateAreaM2)} m², initial separation ${fmtGiven(plateSeparationM)} m, and relative permittivity ${fmtGiven(relativePermittivity)}, energised initially at ${fmtGiven(voltageV)} V (ε₀ = 8.85 × 10⁻¹² F m⁻¹). Next, the assembly is ${constraintProse} ${fmtGiven(newSeparationM)} m with εᵣ = ${fmtGiven(relativePermittivity)} throughout. ${tail}`.trim();
    }
    if (f === 2) {
      return `During calibration of a ${app} (ε₀ = 8.85 × 10⁻¹² F m⁻¹), a ${fmtGiven(voltageV)} V supply charges parallel electrodes of area ${fmtGiven(plateAreaM2)} m² spaced ${fmtGiven(plateSeparationM)} m apart with relative permittivity ${fmtGiven(relativePermittivity)}. The electrodes are ${constraintProse} ${fmtGiven(newSeparationM)} m at unchanged relative permittivity ${fmtGiven(relativePermittivity)}. ${tail}`.trim();
    }
    if (f === 3) {
      return `Parallel electrodes of area ${fmtGiven(plateAreaM2)} m² in a ${app} enclose a medium of relative permittivity ${fmtGiven(relativePermittivity)} across an initial gap of ${fmtGiven(plateSeparationM)} m at ${fmtGiven(voltageV)} V (ε₀ = 8.85 × 10⁻¹² F m⁻¹). Subsequently, the device is ${constraintProse} ${fmtGiven(newSeparationM)} m with the same εᵣ = ${fmtGiven(relativePermittivity)}. ${tail}`.trim();
    }
    if (f === 4) {
      return `An experimental ${app} features plates of area ${fmtGiven(plateAreaM2)} m² at initial spacing ${fmtGiven(plateSeparationM)} m filled with a medium of relative permittivity ${fmtGiven(relativePermittivity)} and charged to ${fmtGiven(voltageV)} V (take ε₀ = 8.85 × 10⁻¹² F m⁻¹). The plates are ${constraintProse} ${fmtGiven(newSeparationM)} m while εᵣ stays at ${fmtGiven(relativePermittivity)}. ${tail}`.trim();
    }
    return `Charged initially to ${fmtGiven(voltageV)} V, a ${app} with plate area ${fmtGiven(plateAreaM2)} m², gap ${fmtGiven(plateSeparationM)} m, and relative permittivity ${fmtGiven(relativePermittivity)} is ${constraintProse} ${fmtGiven(newSeparationM)} m (εᵣ = ${fmtGiven(relativePermittivity)}, ε₀ = 8.85 × 10⁻¹² F m⁻¹). ${tail}`.trim();
  };

  if (format === "mcq") {
    const askChange = variantIdx % 3 === 2;
    const askVoltage = constraint === "isolated-charge" && variantIdx % 3 === 1;

    if (askVoltage) {
      const stem = buildStem(
        "What is the new potential difference across the isolated plates?",
      );
      const mcq = buildMcqBundle(rng, sol.afterChange.voltageV, "V", [
        {
          value: voltageV * (plateSeparationM / newSeparationM),
          rationale:
            "Inverts the separation ratio and computes V₀(d/d′) instead of V′ = Q/C′ = V₀(d′/d).",
        },
        {
          value: voltageV * (newSeparationM / plateSeparationM) ** 2,
          rationale:
            "Squares the separation ratio d′/d when relating voltage to capacitance at constant charge.",
        },
        {
          value: voltageV / relativePermittivity,
          rationale:
            "Divides initial voltage by relative permittivity εᵣ rather than scaling with new plate separation.",
        },
      ]);
      const ans = fmtQty(sol.afterChange.voltageV, "V");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Determine new plate voltage when isolated parallel-plate spacing changes at constant charge",
          [
            "inverting plate separation scaling ratio",
            "squaring separation ratio erroneously",
            "confusing dielectric scaling with separation change",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "afterVoltageV",
        workedSolution: `For isolated plates, charge Q is conserved while C′ = C₀(d/d′). Therefore V′ = Q / C′ = V₀(d′/d) = ${voltageV} × (${newSeparationM} / ${plateSeparationM}) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses charge conservation V′ = V₀(d′/d) to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (askChange) {
      const stem = buildStem(
        "What is the signed change in stored electrostatic energy ΔU = U_final − U_initial?",
      );
      const wrongConstraintU =
        constraint === "isolated-charge"
          ? 0.5 * sol.afterChange.capacitanceF * voltageV ** 2
          : sol.chargeC ** 2 / (2 * sol.afterChange.capacitanceF);
      const mcq = buildMcqBundle(
        rng,
        sol.afterChange.energyChangeJ,
        "J",
        [
          {
            value: -sol.afterChange.energyChangeJ,
            rationale:
              "Computes U_initial − U_final (or confuses constant-Q with constant-V behaviour), reversing the sign of ΔU.",
          },
          {
            value: wrongConstraintU - sol.storedEnergyJ,
            rationale:
              constraint === "isolated-charge"
                ? "Treats the isolated capacitor as if V remained constant (U′ = ½C′V₀²) instead of Q remaining constant (U′ = Q²/2C′)."
                : "Treats the battery-connected capacitor as if charge Q remained constant instead of voltage V remaining constant.",
          },
          {
            value: 2 * sol.afterChange.energyChangeJ,
            rationale:
              "Forgets the factor of one-half in the capacitor energy expression CV².",
          },
          {
            value: sol.afterChange.storedEnergyJ,
            rationale:
              "Reports the final stored energy U_final rather than subtracting U_initial to find ΔU.",
          },
        ],
        true,
      );
      const ans = fmtQty(sol.afterChange.energyChangeJ, "J");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "higher",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Evaluate signed change in stored electrostatic energy under parallel-plate separation change",
          [
            "reversing sign of energy change",
            "confusing isolated-charge constraint with constant-voltage constraint",
            "omitting half factor in stored energy",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "energyChangeJ",
        workedSolution: `Initial C = ${fmtQty(sol.capacitanceF, "F")} and U_i = ½CV² = ${fmtQty(sol.storedEnergyJ, "J")}. Modified C′ = ${fmtQty(sol.afterChange.capacitanceF, "F")} gives U_f = ${fmtQty(sol.afterChange.storedEnergyJ, "J")}, so ΔU = U_f − U_i = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Determines U_i and U_f under the ${constraint} constraint to obtain ΔU = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildStem(
      "What is the final electrostatic energy stored in the modified state?",
    );
    const wrongConstraintFinalU =
      constraint === "isolated-charge"
        ? 0.5 * sol.afterChange.capacitanceF * voltageV ** 2
        : sol.chargeC ** 2 / (2 * sol.afterChange.capacitanceF);
    const mcq = buildMcqBundle(rng, sol.afterChange.storedEnergyJ, "J", [
      {
        value: wrongConstraintFinalU,
        rationale:
          constraint === "isolated-charge"
            ? "Uses U′ = ½C′V₀² as if the battery were still connected instead of conserving Q on isolated plates."
            : "Uses U′ = Q₀²/(2C′) as if the plates were isolated instead of connected at constant V.",
      },
      {
        value: 2 * sol.afterChange.storedEnergyJ,
        rationale:
          "Omits the factor of one-half in the stored electrostatic energy formula.",
      },
      {
        value: sol.storedEnergyJ,
        rationale:
          "Calculates the initial stored energy before plate separation was altered.",
      },
    ]);
    const ans = fmtQty(sol.afterChange.storedEnergyJ, "J");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "higher",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Calculate final stored electrostatic energy after modifying plate spacing under boundary constraint",
        [
          "swapping constant-voltage and isolated-charge energy scaling",
          "forgetting half factor in capacitor energy",
          "stopping at initial stored energy",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "afterStoredEnergyJ",
      workedSolution: `Initial capacitance C = ${fmtQty(sol.capacitanceF, "F")}, modified capacitance C′ = ${fmtQty(sol.afterChange.capacitanceF, "F")}. Under ${constraint}, final stored energy U′ = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Computes modified capacitance C′ and evaluates final stored energy ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured item
  const stem = buildStem("");
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: "Calculate the initial stored electrostatic energy before the plate separation is changed.",
      marks: 2,
      targetQuantityKey: "storedEnergyJ",
      truthValue: sol.storedEnergyJ,
      unit: "J",
      methodCriterion: "Finds initial C = εᵣε₀A/d and applies U_i = ½CV².",
      workingFormula: "C = εᵣε₀A / d and U_i = ½CV².",
      workingSubstitution: `U_i = 0.5 × ${fmtNum(sol.capacitanceF)} × (${voltageV})²`,
    },
    {
      partId: "b",
      prompt: "Determine the capacitance in the modified state.",
      marks: 2,
      targetQuantityKey: "afterCapacitanceF",
      truthValue: sol.afterChange.capacitanceF,
      unit: "F",
      methodCriterion: "Evaluates C′ = εᵣε₀A / d′ at the new separation.",
      workingFormula: "C′ = εᵣε₀A / d′.",
      workingSubstitution: `C′ = (${relativePermittivity})(8.85 × 10⁻¹²)(${plateAreaM2}) / ${newSeparationM}`,
    },
    {
      partId: "c",
      prompt:
        "Calculate the signed change in stored energy ΔU = U_final − U_initial caused by adjusting the separation.",
      marks: 2,
      dependsOnPartIds: ["a", "b"],
      targetQuantityKey: "energyChangeJ",
      truthValue: sol.afterChange.energyChangeJ,
      unit: "J",
      methodCriterion:
        constraint === "isolated-charge"
          ? "Uses constant charge U_f = Q²/(2C′) and subtracts U_i."
          : "Uses constant voltage U_f = ½C′V² and subtracts U_i.",
      workingFormula:
        constraint === "isolated-charge"
          ? "U_f = Q² / (2C′), ΔU = U_f − U_i."
          : "U_f = ½C′V², ΔU = U_f − U_i.",
      workingSubstitution: `ΔU = ${fmtNum(sol.afterChange.storedEnergyJ)} − ${fmtNum(sol.storedEnergyJ)}`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "higher",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Analyse initial energy, modified capacitance, and energy change when parallel-plate spacing changes",
      [],
      [
        "part: calculate initial stored electrostatic energy",
        "part: determine modified capacitance at new plate spacing",
        "part: deduce signed change in stored electrostatic energy",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 3: series-parallel-capacitor-network-analysis
// ============================================================================

const CAP_NET_CONTEXTS = [
  "camera strobe flash bank",
  "audio crossover filter module",
  "DC rail smoothing subcircuit",
  "pulsed-power laboratory network",
  "solar inverter buffer stage",
  "precision timing reference board",
  "avionics backup energy module",
  "biomedical amplifier coupling network",
] as const;

function buildArchetype3Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const cPairsUf: ReadonlyArray<[number, number]> = [
    [12, 24],
    [15, 30],
    [20, 60],
    [18, 36],
    [24, 48],
    [16, 48],
    [30, 90],
    [12, 36],
  ];
  const spTriplesUf: ReadonlyArray<[number, number, number]> = [
    [30, 10, 20],
    [40, 15, 25],
    [60, 12, 18],
    [24, 16, 32],
    [36, 12, 24],
    [45, 15, 30],
  ];
  const voltages = [7, 11, 13, 17, 19, 23, 29, 31, 37, 43];

  const isSeriesParallel = variantIdx % 2 === 1;
  const supplyVoltageV = voltages[(variantIdx * 3 + 1) % voltages.length];
  const app = CAP_NET_CONTEXTS[(variantIdx * 3) % CAP_NET_CONTEXTS.length];
  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);

  if (!isSeriesParallel) {
    const [c1Uf, c2Uf] = cPairsUf[(variantIdx >> 1) % cPairsUf.length];
    const c1F = c1Uf * 1e-6;
    const c2F = c2Uf * 1e-6;
    const spec: CapacitorNetworkSpec = {
      kind: "capacitor-network",
      topology: {
        arrangement: "series",
        capacitancesF: [c1F, c2F],
        supplyVoltageV,
      },
    };
    const sol = solveEmInductionScenario(spec);
    if (sol.kind !== "capacitor-network") throw new Error("Unexpected solution");

    const hiddenQuantities = [
      "equivalentCapacitanceF",
      "totalChargeC",
      "totalStoredEnergyJ",
      "v1V",
      "v2V",
      "q1C",
      "q2C",
      "u1J",
      "u2J",
    ];
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "c1F", value: c1F, unit: "F", source: "stem" },
      { name: "c2F", value: c2F, unit: "F", source: "stem" },
      { name: "supplyVoltageV", value: supplyVoltageV, unit: "V", source: "stem" },
    ];

    const buildSeriesStem = (tail: string): string => {
      const f = (variantIdx >> 1) % 5;
      if (f === 0) {
        return `In a ${app}, two initially uncharged capacitors of capacitances C₁ = ${fmtUf(c1F)} and C₂ = ${fmtUf(c2F)} are connected in series across a ${supplyVoltageV} V DC source. ${tail}`.trim();
      }
      if (f === 1) {
        return `A ${supplyVoltageV} V DC power supply energises a series combination of capacitor C₁ = ${fmtUf(c1F)} and capacitor C₂ = ${fmtUf(c2F)} inside a ${app}. ${tail}`.trim();
      }
      if (f === 2) {
        return `Two capacitors rated C₁ = ${fmtUf(c1F)} and C₂ = ${fmtUf(c2F)} are wired end-to-end in series across an ideal ${supplyVoltageV} V terminal supply on a ${app}. ${tail}`.trim();
      }
      if (f === 3) {
        return `During testing of a ${app}, an engineer connects uncharged capacitors C₁ = ${fmtUf(c1F)} and C₂ = ${fmtUf(c2F)} in series with a steady ${supplyVoltageV} V cell. ${tail}`.trim();
      }
      return `Across a regulated ${supplyVoltageV} V rail in a ${app}, capacitor C₁ (${fmtUf(c1F)}) is placed in series with capacitor C₂ (${fmtUf(c2F)}). ${tail}`.trim();
    };

    if (format === "mcq") {
      const mode = (variantIdx >> 1) % 3;
      if (mode === 0) {
        const stem = buildSeriesStem(
          "What is the total equivalent capacitance of the series pair?",
        );
        const mcq = buildMcqBundle(rng, sol.equivalentCapacitanceF, "F", [
          {
            value: c1F + c2F,
            rationale:
              "Treats series capacitors like series resistors by adding C₁ + C₂ directly instead of adding reciprocals.",
          },
          {
            value: 1 / c1F + 1 / c2F,
            rationale:
              "Computes the reciprocal sum 1/C₁ + 1/C₂ without inverting at the final step.",
          },
          {
            value: Math.abs(c2F - c1F),
            rationale:
              "Subtracts the two capacitances |C₂ − C₁| instead of using (1/C₁ + 1/C₂)⁻¹.",
          },
        ]);
        const ans = fmtQty(sol.equivalentCapacitanceF, "F");
        return {
          id,
          conceptId: descriptor.conceptId,
          templateArchetype: descriptor.templateArchetype,
          seed,
          syllabi,
          format: "mcq",
          difficulty: "foundation",
          domain: "em-induction",
          scenarioSpec: spec as unknown as Record<string, unknown>,
          hiddenQuantities,
          requiredGivens,
          questionPlan: buildDigitFreePlan(
            "mcq",
            "Find equivalent capacitance of capacitors connected in series",
            [
              "adding series capacitors directly like series resistors",
              "forgetting to invert sum of reciprocals",
              "taking difference of capacitances",
            ],
          ),
          stem,
          options: mcq.options,
          targetQuantityKey: "equivalentCapacitanceF",
          workedSolution: `For series capacitors, 1/C_eq = 1/C₁ + 1/C₂, giving C_eq = (${c1Uf} × ${c2Uf})/(${c1Uf} + ${c2Uf}) μF = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Uses 1/C_eq = 1/C₁ + 1/C₂ to obtain ${ans} (${mcq.correctLabel}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      if (mode === 1) {
        const stem = buildSeriesStem(
          "What potential difference is developed across capacitor C₁?",
        );
        const v1 = sol.quantities.v1V;
        const mcq = buildMcqBundle(rng, v1, "V", [
          {
            value: (supplyVoltageV * c1F) / (c1F + c2F),
            rationale:
              "Applies the resistor potential-divider ratio V₀ C₁/(C₁ + C₂) instead of recognizing V₁ = Q/C₁ = V₀ C₂/(C₁ + C₂).",
          },
          {
            value: supplyVoltageV,
            rationale:
              "Assumes each series capacitor receives the full supply voltage V₀ as in a parallel circuit.",
          },
          {
            value: supplyVoltageV / 2,
            rationale:
              "Splits the supply voltage equally between unequal series capacitors.",
          },
        ]);
        const ans = fmtQty(v1, "V");
        return {
          id,
          conceptId: descriptor.conceptId,
          templateArchetype: descriptor.templateArchetype,
          seed,
          syllabi,
          format: "mcq",
          difficulty: "standard",
          domain: "em-induction",
          scenarioSpec: spec as unknown as Record<string, unknown>,
          hiddenQuantities,
          requiredGivens,
          questionPlan: buildDigitFreePlan(
            "mcq",
            "Determine potential difference across one capacitor in an unequal series pair",
            [
              "using resistor divider ratio instead of inverse-capacitance ratio",
              "applying full supply voltage across one series element",
              "halving supply voltage despite unequal capacitances",
            ],
          ),
          stem,
          options: mcq.options,
          targetQuantityKey: "v1V",
          workedSolution: `Equivalent capacitance C_eq = ${fmtQty(sol.equivalentCapacitanceF, "F")}, so series charge Q = C_eq V₀ = ${fmtQty(sol.totalChargeC, "C")}. Across C₁, V₁ = Q / C₁ = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Finds common series charge Q and computes V₁ = Q/C₁ = ${ans} (${mcq.correctLabel}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = buildSeriesStem(
        "What total electrostatic energy is stored in the two-capacitor series combination?",
      );
      const mcq = buildMcqBundle(rng, sol.totalStoredEnergyJ, "J", [
        {
          value: sol.equivalentCapacitanceF * supplyVoltageV ** 2,
          rationale:
            "Forgets the factor of one-half in U = ½C_eq V₀².",
        },
        {
          value: 0.5 * (c1F + c2F) * supplyVoltageV ** 2,
          rationale:
            "Adds C₁ + C₂ like series resistors instead of using reciprocal series capacitance in ½C_eq V₀².",
        },
        {
          value: (c1F + c2F) * supplyVoltageV ** 2,
          rationale:
            "Both adds series capacitances directly and omits the factor of one-half.",
        },
      ]);
      const ans = fmtQty(sol.totalStoredEnergyJ, "J");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Calculate total stored energy in a series capacitor combination",
          [
            "forgetting half factor in capacitor energy",
            "treating series capacitors like series resistors",
            "combining sum-of-capacitances error with missing half factor",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "totalStoredEnergyJ",
        workedSolution: `C_eq = (C₁C₂)/(C₁ + C₂) = ${fmtQty(sol.equivalentCapacitanceF, "F")}. Total stored energy U = ½C_eq V₀² = 0.5 × ${fmtNum(sol.equivalentCapacitanceF)} × (${supplyVoltageV})² = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Determines C_eq and computes U = ½C_eq V₀² = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    // Structured series network
    const stem = buildSeriesStem("");
    const bundle = buildStructuredBundle([
      {
        partId: "a",
        prompt: "Calculate the equivalent capacitance of the series combination.",
        marks: 2,
        targetQuantityKey: "equivalentCapacitanceF",
        truthValue: sol.equivalentCapacitanceF,
        unit: "F",
        methodCriterion: "Applies reciprocal series rule 1/C_eq = 1/C₁ + 1/C₂.",
        workingFormula: "1/C_eq = 1/C₁ + 1/C₂.",
        workingSubstitution: `C_eq = (${fmtNum(c1F)} × ${fmtNum(c2F)}) / (${fmtNum(c1F)} + ${fmtNum(c2F)})`,
      },
      {
        partId: "b",
        prompt: "Determine the potential difference across capacitor C₁.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "v1V",
        truthValue: sol.quantities.v1V,
        unit: "V",
        methodCriterion: "Uses Q = C_eq V₀ and V₁ = Q / C₁.",
        workingFormula: "Q = C_eq V₀, V₁ = Q / C₁.",
        workingSubstitution: `V₁ = (${fmtNum(sol.equivalentCapacitanceF)} × ${supplyVoltageV}) / ${fmtNum(c1F)}`,
      },
      {
        partId: "c",
        prompt: "Calculate the total electrostatic energy stored in the network.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "totalStoredEnergyJ",
        truthValue: sol.totalStoredEnergyJ,
        unit: "J",
        methodCriterion: "Applies U = ½C_eq V₀².",
        workingFormula: "U = ½C_eq V₀².",
        workingSubstitution: `U = 0.5 × ${fmtNum(sol.equivalentCapacitanceF)} × (${supplyVoltageV})²`,
      },
    ]);

    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "structured",
      difficulty: "standard",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "structured",
        "Analyse series capacitor equivalent capacitance, voltage division, and stored energy",
        [],
        [
          "part: compute series equivalent capacitance",
          "part: determine voltage across individual series capacitor",
          "part: calculate total stored electrostatic energy",
        ],
      ),
      stem,
      parts: bundle.parts,
      workedSolution: bundle.workedSolution,
      markScheme: bundle.markScheme,
      totalMarks: bundle.totalMarks,
    };
  }

  // Series-parallel network
  const [csUf, cp1Uf, cp2Uf] =
    spTriplesUf[(variantIdx >> 1) % spTriplesUf.length];
  const csF = csUf * 1e-6;
  const cp1F = cp1Uf * 1e-6;
  const cp2F = cp2Uf * 1e-6;
  const spec: CapacitorNetworkSpec = {
    kind: "capacitor-network",
    topology: {
      arrangement: "series-parallel",
      seriesCapacitanceF: csF,
      parallelCapacitancesF: [cp1F, cp2F],
      supplyVoltageV,
    },
  };
  const sol = solveEmInductionScenario(spec);
  if (sol.kind !== "capacitor-network") throw new Error("Unexpected solution");

  const hiddenQuantities = [
    "parallelBankCapacitanceF",
    "equivalentCapacitanceF",
    "totalChargeC",
    "totalStoredEnergyJ",
    "seriesVoltageV",
    "parallelVoltageV",
    "Cs_voltageV",
    "Cs_chargeC",
    "Cs_storedEnergyJ",
    "Cp1_voltageV",
    "Cp1_chargeC",
    "Cp1_storedEnergyJ",
    "Cp2_voltageV",
    "Cp2_chargeC",
    "Cp2_storedEnergyJ",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "seriesCapacitanceF", value: csF, unit: "F", source: "stem" },
    { name: "Cp1_capacitanceF", value: cp1F, unit: "F", source: "stem" },
    { name: "Cp2_capacitanceF", value: cp2F, unit: "F", source: "stem" },
    { name: "supplyVoltageV", value: supplyVoltageV, unit: "V", source: "stem" },
  ];

  const buildSpStem = (tail: string): string => {
    const f = (variantIdx >> 1) % 4;
    if (f === 0) {
      return `A ${app} uses a capacitor C_s = ${fmtUf(csF)} connected in series with a parallel bank formed by C_p1 = ${fmtUf(cp1F)} and C_p2 = ${fmtUf(cp2F)} across a ${supplyVoltageV} V DC supply. ${tail}`.trim();
    }
    if (f === 1) {
      return `Across a ${supplyVoltageV} V DC bus in a ${app}, capacitor C_s (${fmtUf(csF)}) lies in series with the parallel combination of C_p1 (${fmtUf(cp1F)}) and C_p2 (${fmtUf(cp2F)}). ${tail}`.trim();
    }
    if (f === 2) {
      return `In a ${app}, parallel branches containing C_p1 = ${fmtUf(cp1F)} and C_p2 = ${fmtUf(cp2F)} are wired in series with capacitor C_s = ${fmtUf(csF)} and charged by a steady ${supplyVoltageV} V source. ${tail}`.trim();
    }
    return `An uncharged network in a ${app} connects C_s = ${fmtUf(csF)} in series with two parallel capacitors C_p1 = ${fmtUf(cp1F)} and C_p2 = ${fmtUf(cp2F)} across an ideal ${supplyVoltageV} V cell. ${tail}`.trim();
  };

  if (format === "mcq") {
    const askEnergy = (variantIdx >> 1) % 2 === 1;
    const resistorStyleCeq = csF + (cp1F * cp2F) / (cp1F + cp2F);
    if (!askEnergy) {
      const stem = buildSpStem(
        "What is the equivalent capacitance of the complete three-capacitor network?",
      );
      const mcq = buildMcqBundle(rng, sol.equivalentCapacitanceF, "F", [
        {
          value: resistorStyleCeq,
          rationale:
            "Applies resistor combination laws to capacitors: uses reciprocals for the parallel pair and adds C_s in series.",
        },
        {
          value: csF + cp1F + cp2F,
          rationale:
            "Adds all three capacitances directly as if every capacitor were in parallel.",
        },
        {
          value: cp1F + cp2F,
          rationale:
            "Stops after summing the parallel bank C_p1 + C_p2 without combining C_s in series.",
        },
      ]);
      const ans = fmtQty(sol.equivalentCapacitanceF, "F");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Reduce mixed series-parallel capacitor network to equivalent capacitance",
          [
            "applying resistor series-parallel rules backwards to capacitors",
            "summing all capacitances directly",
            "stopping at parallel branch capacitance",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "equivalentCapacitanceF",
        workedSolution: `Parallel bank C_p = ${cp1Uf} + ${cp2Uf} = ${cp1Uf + cp2Uf} μF. Combining in series with C_s = ${csUf} μF gives C_eq = (C_s C_p)/(C_s + C_p) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds C_p = ${cp1Uf + cp2Uf} μF and combines in series with C_s to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildSpStem(
      "What total electrostatic energy is stored in the complete network?",
    );
    const mcq = buildMcqBundle(rng, sol.totalStoredEnergyJ, "J", [
      {
        value: sol.equivalentCapacitanceF * supplyVoltageV ** 2,
        rationale:
          "Omits the factor of one-half in U = ½C_eq V₀².",
      },
      {
        value: 0.5 * resistorStyleCeq * supplyVoltageV ** 2,
        rationale:
          "Combines the series-parallel capacitors using resistor formulas before evaluating ½C_eq V₀².",
      },
      {
        value: 0.5 * (cp1F + cp2F) * supplyVoltageV ** 2,
        rationale:
          "Assumes the full supply voltage V₀ appears across the parallel bank, ignoring the voltage drop across C_s.",
      },
    ]);
    const ans = fmtQty(sol.totalStoredEnergyJ, "J");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "higher",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Determine total electrostatic energy stored in mixed series-parallel capacitor network",
        [
          "forgetting half factor in capacitor energy",
          "reversing series and parallel capacitor rules",
          "ignoring series capacitor voltage drop",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "totalStoredEnergyJ",
      workedSolution: `Parallel bank C_p = ${cp1Uf + cp2Uf} μF; total C_eq = ${fmtQty(sol.equivalentCapacitanceF, "F")}. Stored energy U = ½C_eq V₀² = 0.5 × ${fmtNum(sol.equivalentCapacitanceF)} × (${supplyVoltageV})² = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates C_eq and computes U = ½C_eq V₀² = ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured series-parallel
  const stem = buildSpStem("");
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: "Calculate the total equivalent capacitance of the network.",
      marks: 2,
      targetQuantityKey: "equivalentCapacitanceF",
      truthValue: sol.equivalentCapacitanceF,
      unit: "F",
      methodCriterion: "Sums C_p = C_p1 + C_p2 and combines in series with C_s.",
      workingFormula: "C_p = C_p1 + C_p2; C_eq = (C_s C_p)/(C_s + C_p).",
      workingSubstitution: `C_eq = (${fmtNum(csF)} × ${fmtNum(cp1F + cp2F)}) / (${fmtNum(csF)} + ${fmtNum(cp1F + cp2F)})`,
    },
    {
      partId: "b",
      prompt: "Determine the potential difference across the parallel capacitor bank.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "parallelVoltageV",
      truthValue: sol.quantities.parallelVoltageV,
      unit: "V",
      methodCriterion: "Finds total charge Q = C_eq V₀ and divides by C_p.",
      workingFormula: "Q = C_eq V₀, V_p = Q / C_p.",
      workingSubstitution: `V_p = (${fmtNum(sol.equivalentCapacitanceF)} × ${supplyVoltageV}) / ${fmtNum(cp1F + cp2F)}`,
    },
    {
      partId: "c",
      prompt: "Calculate the total electrostatic energy stored in the network.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "totalStoredEnergyJ",
      truthValue: sol.totalStoredEnergyJ,
      unit: "J",
      methodCriterion: "Evaluates U = ½C_eq V₀².",
      workingFormula: "U = ½C_eq V₀².",
      workingSubstitution: `U = 0.5 × ${fmtNum(sol.equivalentCapacitanceF)} × (${supplyVoltageV})²`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "higher",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Multi-step reduction and voltage/energy analysis of series-parallel capacitor network",
      [],
      [
        "part: reduce mixed network to equivalent capacitance",
        "part: find potential difference across parallel branch",
        "part: compute total stored electrostatic energy",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 4: capacitor-charge-sharing-redistribution
// ============================================================================

const SHARING_CONTEXTS = [
  "switched-capacitor sample-and-hold stage",
  "charge-redistribution DAC bench circuit",
  "isolated laboratory capacitor bank",
  "pulsed laser pre-ioniser loop",
  "high-impedance electrometer calibration rig",
  "telemetry energy-transfer buffer",
  "capacitive voltage-divider test fixture",
] as const;

function buildArchetype4Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const cPairsUf: ReadonlyArray<[number, number]> = [
    [10, 30],
    [15, 45],
    [20, 60],
    [12, 36],
    [25, 75],
    [18, 42],
    [30, 50],
    [20, 80],
  ];
  const v1Pool = [17, 23, 29, 37, 41, 47, 53];
  const [c1Uf, c2Uf] = cPairsUf[variantIdx % cPairsUf.length];
  const c1F = c1Uf * 1e-6;
  const c2F = c2Uf * 1e-6;
  const v1InitialV = v1Pool[(variantIdx * 2 + 1) % v1Pool.length];
  const hasV2 = variantIdx % 3 === 2;
  const v2InitialV = hasV2 ? 7 : 0;

  const spec: CapacitorNetworkSpec = {
    kind: "capacitor-network",
    topology: {
      arrangement: "charge-sharing",
      c1F,
      c2F,
      v1InitialV,
      v2InitialV,
      polarity: "same",
    },
  };
  const sol = solveEmInductionScenario(spec);
  if (
    sol.kind !== "capacitor-network" ||
    sol.finalCommonVoltageV === undefined ||
    sol.energyDissipatedJ === undefined ||
    sol.initialStoredEnergyJ === undefined
  ) {
    throw new Error("Expected charge-sharing solution");
  }

  const hiddenQuantities = [
    "equivalentCapacitanceF",
    "totalChargeC",
    "finalCommonVoltageV",
    "finalCharge1C",
    "finalCharge2C",
    "initialStoredEnergyJ",
    "totalStoredEnergyJ",
    "energyDissipatedJ",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "c1F", value: c1F, unit: "F", source: "stem" },
    { name: "c2F", value: c2F, unit: "F", source: "stem" },
    { name: "v1InitialV", value: v1InitialV, unit: "V", source: "stem" },
    ...(v2InitialV > 0
      ? [{ name: "v2InitialV", value: v2InitialV, unit: "V", source: "stem" as const }]
      : []),
  ];
  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const app = SHARING_CONTEXTS[variantIdx % SHARING_CONTEXTS.length];

  const c2StateProse =
    v2InitialV > 0
      ? `charged separately to V₂ = ${v2InitialV} V and connected with like polarity`
      : "initially uncharged";

  const buildStem = (tail: string): string => {
    const f = variantIdx % 6;
    if (f === 0) {
      return `In a ${app}, capacitor C₁ = ${fmtUf(c1F)} is charged to V₁ = ${v1InitialV} V, isolated from its supply, and then connected via switch S in parallel with capacitor C₂ = ${fmtUf(c2F)} (${c2StateProse}). ${tail}`.trim();
    }
    if (f === 1) {
      return `Capacitor C₁ (${fmtUf(c1F)}) carries an initial potential difference V₁ = ${v1InitialV} V inside a ${app}. Switch S is closed to link C₁ directly across capacitor C₂ (${fmtUf(c2F)}), which is ${c2StateProse}. ${tail}`.trim();
    }
    if (f === 2) {
      return `On a ${app}, an isolated capacitor C₁ of capacitance ${fmtUf(c1F)} at V₁ = ${v1InitialV} V is bridged across a second capacitor C₂ of capacitance ${fmtUf(c2F)} that is ${c2StateProse}. ${tail}`.trim();
    }
    if (f === 3) {
      return `During a charge-conservation test on a ${app}, C₁ = ${fmtUf(c1F)} at initial voltage V₁ = ${v1InitialV} V is connected by closing switch S across C₂ = ${fmtUf(c2F)} (${c2StateProse}). ${tail}`.trim();
    }
    if (f === 4) {
      return `After disconnecting its charging cell in a ${app}, capacitor C₁ = ${fmtUf(c1F)} at V₁ = ${v1InitialV} V shares charge across switch S with C₂ = ${fmtUf(c2F)}, which is ${c2StateProse}. ${tail}`.trim();
    }
    return `Switch S in a ${app} connects a pre-charged capacitor C₁ = ${fmtUf(c1F)} (V₁ = ${v1InitialV} V) in parallel with C₂ = ${fmtUf(c2F)} (${c2StateProse}), allowing equilibrium to be reached. ${tail}`.trim();
  };

  if (format === "mcq") {
    const subMode = variantIdx % 3;
    const cSeries = (c1F * c2F) / (c1F + c2F);
    if (subMode === 0) {
      const stem = buildStem(
        "What final common potential difference is established across both capacitors?",
      );
      const mcq = buildMcqBundle(rng, sol.finalCommonVoltageV, "V", [
        {
          value: (v1InitialV + v2InitialV) / 2,
          rationale:
            "Takes the unweighted average (V₁ + V₂)/2 without weighting by C₁ and C₂ via charge conservation.",
        },
        {
          value: sol.totalChargeC / cSeries,
          rationale:
            "Divides conserved net charge by series capacitance C₁C₂/(C₁ + C₂) instead of parallel C₁ + C₂.",
        },
        {
          value: (c1F * v1InitialV) / c2F,
          rationale:
            "Assumes all initial charge from C₁ transfers onto C₂ instead of splitting across C₁ + C₂.",
        },
      ]);
      const ans = fmtQty(sol.finalCommonVoltageV, "V");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Find equilibrium common potential difference after isolated capacitors share charge",
          [
            "averaging initial voltages regardless of unequal capacitances",
            "using reciprocal series capacitance instead of parallel sum",
            "assuming complete charge transfer onto second capacitor",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "finalCommonVoltageV",
        workedSolution: `Total conserved charge Q_net = C₁V₁ + C₂V₂ = ${fmtQty(sol.totalChargeC, "C")}. Final parallel capacitance C_eq = ${c1Uf + c2Uf} μF, so V_f = Q_net / (C₁ + C₂) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Conserves net charge Q_net and divides by C₁ + C₂ to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      const stem = buildStem(
        "How much electrostatic energy is dissipated in the connecting leads as equilibrium is reached?",
      );
      const mcq = buildMcqBundle(rng, sol.energyDissipatedJ, "J", [
        {
          value: sol.totalStoredEnergyJ,
          rationale:
            "Reports the final stored electrostatic energy U_f instead of subtracting U_f from U_i.",
        },
        {
          value: 2 * sol.energyDissipatedJ,
          rationale:
            "Omits the factor of one-half in ½CV² when calculating initial and final energies.",
        },
        {
          value: sol.initialStoredEnergyJ,
          rationale:
            "Assumes all initial electrostatic energy U_i is lost as heat.",
        },
      ]);
      const ans = fmtQty(sol.energyDissipatedJ, "J");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "higher",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Calculate electrostatic energy dissipated during parallel capacitor charge redistribution",
          [
            "reporting final stored energy instead of dissipated difference",
            "forgetting half factor in capacitor energy",
            "assuming total dissipation of initial energy",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "energyDissipatedJ",
        workedSolution: `Initial energy U_i = ${fmtQty(sol.initialStoredEnergyJ, "J")}. Final common voltage V_f = ${fmtQty(sol.finalCommonVoltageV, "V")} gives final energy U_f = ½(C₁ + C₂)V_f² = ${fmtQty(sol.totalStoredEnergyJ, "J")}. Energy dissipated ΔU = U_i − U_f = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates U_i − U_f after conserving charge to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildStem(
      "What total electrostatic energy remains stored in the pair after equilibrium is reached?",
    );
    const mcq = buildMcqBundle(rng, sol.totalStoredEnergyJ, "J", [
      {
        value: sol.initialStoredEnergyJ,
        rationale:
          "Assumes electrostatic energy is conserved when charge redistributes through the loop, ignoring resistive/radiative losses.",
      },
      {
        value: 2 * sol.totalStoredEnergyJ,
        rationale:
          "Forgets the factor of one-half in U_f = ½(C₁ + C₂)V_f².",
      },
      {
        value: sol.energyDissipatedJ,
        rationale:
          "Calculates the energy lost during redistribution rather than the final stored energy.",
      },
    ]);
    const ans = fmtQty(sol.totalStoredEnergyJ, "J");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "higher",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Determine remaining stored electrostatic energy after capacitor charge sharing",
        [
          "assuming zero energy dissipation during charge sharing",
          "omitting half factor in final stored energy",
          "confusing dissipated energy with remaining stored energy",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "totalStoredEnergyJ",
      workedSolution: `Conserved charge Q_net = ${fmtQty(sol.totalChargeC, "C")} across C₁ + C₂ = ${c1Uf + c2Uf} μF yields V_f = ${fmtQty(sol.finalCommonVoltageV, "V")}. Final stored energy U_f = ½(C₁ + C₂)V_f² = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Finds V_f from conserved charge and computes U_f = ½(C₁ + C₂)V_f² = ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured charge-sharing
  const stem = buildStem("");
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: "Calculate the total net charge shared between the capacitors.",
      marks: 2,
      targetQuantityKey: "totalChargeC",
      truthValue: sol.totalChargeC,
      unit: "C",
      methodCriterion: "Evaluates Q_net = C₁V₁ + C₂V₂ before switch closure.",
      workingFormula: "Q_net = C₁V₁ + C₂V₂.",
      workingSubstitution: `Q_net = ${fmtNum(c1F)} × ${v1InitialV} + ${fmtNum(c2F)} × ${v2InitialV}`,
    },
    {
      partId: "b",
      prompt: "Determine the final common potential difference across the capacitors.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "finalCommonVoltageV",
      truthValue: sol.finalCommonVoltageV,
      unit: "V",
      methodCriterion: "Divides conserved charge from (a) by C₁ + C₂.",
      workingFormula: "V_f = Q_net / (C₁ + C₂).",
      workingSubstitution: `V_f = ${fmtNum(sol.totalChargeC)} / (${fmtNum(c1F)} + ${fmtNum(c2F)})`,
    },
    {
      partId: "c",
      prompt: "Calculate the electrostatic energy dissipated when switch S is closed.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "energyDissipatedJ",
      truthValue: sol.energyDissipatedJ,
      unit: "J",
      methodCriterion: "Subtracts final stored energy ½(C₁ + C₂)V_f² from initial stored energy.",
      workingFormula: "ΔU_diss = U_i − ½(C₁ + C₂)V_f².",
      workingSubstitution: `ΔU_diss = ${fmtNum(sol.initialStoredEnergyJ)} − ${fmtNum(sol.totalStoredEnergyJ)}`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "higher",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Analyse charge conservation, common equilibrium voltage, and energy loss in capacitor sharing",
      [],
      [
        "part: compute total conserved charge",
        "part: find final common potential difference",
        "part: determine energy dissipated during redistribution",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 5: rc-charging-discharging-exponential-transient
// ============================================================================

const RC_CONTEXTS = [
  "heart-pacemaker timing circuit",
  "camera shutter delay module",
  "oscilloscope RC time-constant practical",
  "industrial watchdog reset timer",
  "sensor low-pass RC network",
  "emergency power-down holdup circuit",
  "synthesizer envelope-decay stage",
  "laboratory data-logger discharge rig",
] as const;

function buildArchetype5Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const resPool = [2000, 2500, 4000, 5000, 8000, 10_000, 15_000, 20_000, 25_000];
  const capPool = [20e-6, 25e-6, 40e-6, 50e-6, 80e-6, 100e-6, 120e-6, 200e-6];
  const voltPool = [6, 9, 12, 15, 18, 24, 30];
  // Avoid ln(2) ≈ 0.693 so charging 1 - exp(-t/τ) and discharging exp(-t/τ) never coincide!
  const queryMults = [0.4, 0.5, 0.9, 1.2, 1.5, 1.8, 2.2];

  const mode: "charging" | "discharging" =
    variantIdx % 2 === 0 ? "discharging" : "charging";
  const resistanceOhm = resPool[(variantIdx * 2 + 1) % resPool.length];
  const capacitanceF = capPool[(variantIdx * 3) % capPool.length];
  const supplyVoltageV = voltPool[(variantIdx * 2) % voltPool.length];
  const tau = resistanceOhm * capacitanceF;
  const queryTimeS = Number(
    (tau * queryMults[variantIdx % queryMults.length]).toPrecision(3),
  );

  const spec: RcTransientSpec = {
    kind: "rc-transient",
    mode,
    resistanceOhm,
    capacitanceF,
    supplyVoltageV,
    queryTimeS,
    durationTimeConstants: 5,
    plottedQuantity:
      variantIdx % 3 === 0
        ? "capacitor-voltage"
        : variantIdx % 3 === 1
          ? "current"
          : "charge",
  };
  const sol = solveEmInductionScenario(spec);
  if (sol.kind !== "rc-transient") throw new Error("Expected RC solution");

  const hiddenQuantities = [
    "timeConstantS",
    "halfTimeS",
    "initialCurrentA",
    "maxChargeC",
    "maxStoredEnergyJ",
    "capacitorVoltageAtQueryV",
    "resistorVoltageAtQueryV",
    "currentAtQueryA",
    "chargeAtQueryC",
    "storedEnergyAtQueryJ",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "resistanceOhm", value: resistanceOhm, unit: "Ω", source: "stem" },
    { name: "capacitanceF", value: capacitanceF, unit: "F", source: "stem" },
    { name: "supplyVoltageV", value: supplyVoltageV, unit: "V", source: "stem" },
    { name: "queryTimeS", value: queryTimeS, unit: "s", source: "stem" },
  ];
  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const app = RC_CONTEXTS[variantIdx % RC_CONTEXTS.length];

  const buildStem = (tail: string): string => {
    const cStr = fmtUf(capacitanceF);
    const rStr = fmtKohm(resistanceOhm);
    const tStr = `${fmtGiven(queryTimeS)} s`;
    const f = variantIdx % 6;
    if (mode === "discharging") {
      if (f === 0) {
        return `In a ${app}, a ${cStr} capacitor initially charged to ${supplyVoltageV} V begins discharging through a ${rStr} resistor when switch S closes, and a sensor samples the circuit after ${tStr}. ${tail}`.trim();
      }
      if (f === 2) {
        return `During a ${app} test, switch S connects a pre-charged ${cStr} capacitor (initial p.d. ${supplyVoltageV} V) across a ${rStr} fixed resistor for an elapsed interval of ${tStr}. ${tail}`.trim();
      }
      return `A ${cStr} capacitor at ${supplyVoltageV} V in a ${app} discharges exponentially through a series resistance of ${rStr}; measurements are recorded ${tStr} after closing the switch. ${tail}`.trim();
    }
    if (f === 1) {
      return `An uncharged ${cStr} capacitor in a ${app} is connected at switch closure in series with a ${rStr} resistor across an ideal ${supplyVoltageV} V DC source and observed after ${tStr}. ${tail}`.trim();
    }
    if (f === 3) {
      return `Within a ${app}, a ${supplyVoltageV} V DC rail charges an initially uncharged ${cStr} capacitor via a ${rStr} series resistor; the transient is evaluated at ${tStr}. ${tail}`.trim();
    }
    return `When switch S closes in a ${app}, a ${cStr} uncharged capacitor charges from a ${supplyVoltageV} V cell through a ${rStr} resistor over an interval of ${tStr}. ${tail}`.trim();
  };

  if (format === "mcq") {
    const subMode = variantIdx % 4;
    if (subMode === 0) {
      const stem = buildStem(
        `What is the potential difference across the capacitor at t = ${fmtGiven(queryTimeS)} s?`,
      );
      const oppositeModeV =
        mode === "charging"
          ? supplyVoltageV * Math.exp(-queryTimeS / sol.timeConstantS)
          : supplyVoltageV * (1 - Math.exp(-queryTimeS / sol.timeConstantS));
      const mcq = buildMcqBundle(rng, sol.capacitorVoltageAtQueryV, "V", [
        {
          value: oppositeModeV,
          rationale:
            mode === "charging"
              ? "Applies the discharging decay V₀e^(−t/RC) instead of the charging growth V₀(1 − e^(−t/RC))."
              : "Applies the charging equation V₀(1 − e^(−t/RC)) instead of exponential discharge V₀e^(−t/RC).",
        },
        {
          value:
            mode === "charging"
              ? supplyVoltageV * (1 - Math.exp(-queryTimeS / sol.halfTimeS))
              : supplyVoltageV * Math.exp(-queryTimeS / sol.halfTimeS),
          rationale:
            "Divides elapsed time t by half-time RC ln 2 instead of the RC time constant τ = RC in the exponent.",
        },
        {
          value: supplyVoltageV,
          rationale:
            "Assumes the capacitor reaches or retains the full supply voltage V₀ instantaneously.",
        },
      ]);
      const ans = fmtQty(sol.capacitorVoltageAtQueryV, "V");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Evaluate instantaneous capacitor voltage during exponential RC transient",
          [
            "swapping RC charging and discharging exponential forms",
            "substituting half-time instead of RC time constant in exponent",
            "assuming steady-state asymptotic voltage immediately",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "capacitorVoltageAtQueryV",
        workedSolution: `Time constant τ = RC = ${fmtQty(sol.timeConstantS, "s")}. For ${mode}, V_C(${fmtGiven(queryTimeS)} s) = ${mode === "charging" ? `${supplyVoltageV}(1 − e^(−${fmtGiven(queryTimeS)}/${fmtNum(sol.timeConstantS)}))` : `${supplyVoltageV} e^(−${fmtGiven(queryTimeS)}/${fmtNum(sol.timeConstantS)})`} = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds τ = RC and evaluates V_C at t = ${fmtGiven(queryTimeS)} s to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      const stem = buildStem(
        "What is the half-time t_{1/2} required for the exponential transient to decay by half?",
      );
      const mcq = buildMcqBundle(rng, sol.halfTimeS, "s", [
        {
          value: sol.timeConstantS,
          rationale:
            "Reports the RC time constant τ = RC (36.8% decay time) instead of multiplying by ln 2 for 50% decay.",
        },
        {
          value: sol.timeConstantS / Math.LN2,
          rationale:
            "Divides RC by ln 2 instead of multiplying RC by ln 2.",
        },
        {
          value: 0.5 * sol.timeConstantS,
          rationale:
            "Multiplies RC by 0.500 (assuming linear decay) instead of ln 2 ≈ 0.693.",
        },
      ]);
      const ans = fmtQty(sol.halfTimeS, "s");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "foundation",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Calculate exponential half-time from RC circuit resistance and capacitance",
          [
            "confusing RC time constant with half-time",
            "dividing by natural log of two instead of multiplying",
            "halving RC linearly instead of scaling by natural log of two",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "halfTimeS",
        workedSolution: `τ = RC = ${resistanceOhm} × ${fmtNum(capacitanceF)} = ${fmtQty(sol.timeConstantS, "s")}. Half-time t_{1/2} = τ ln 2 = ${fmtNum(sol.timeConstantS)} × 0.6931 = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes t_{1/2} = RC ln 2 = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 2) {
      const stem = buildStem(
        `What is the current in the resistor at t = ${fmtGiven(queryTimeS)} s?`,
      );
      const mcq = buildMcqBundle(rng, sol.currentAtQueryA, "A", [
        {
          value:
            sol.initialCurrentA *
            (1 - Math.exp(-queryTimeS / sol.timeConstantS)),
          rationale:
            "Uses (V₀/R)(1 − e^(−t/RC)), mistakenly thinking RC current grows toward V₀/R instead of decaying exponentially from V₀/R.",
        },
        {
          value: sol.initialCurrentA,
          rationale:
            "Stops at the initial peak current I₀ = V₀/R without applying exponential decay e^(−t/RC).",
        },
        {
          value: sol.currentAtQueryA * 1000,
          rationale:
            "Substitutes resistance in kΩ instead of Ω when computing V₀/R.",
        },
      ]);
      const ans = fmtQty(sol.currentAtQueryA, "A");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Determine instantaneous resistor current during RC transient",
          [
            "using rising exponential instead of decaying exponential for current",
            "reporting initial current without exponential decay",
            "omitting kilo-ohm prefix conversion",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "currentAtQueryA",
        workedSolution: `Initial current I₀ = V₀ / R = ${supplyVoltageV} / ${resistanceOhm} = ${fmtQty(sol.initialCurrentA, "A")}. With τ = RC = ${fmtQty(sol.timeConstantS, "s")}, I(t) = I₀ e^(−t/τ) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses I(t) = (V₀/R)e^(−t/RC) to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildStem(
      `How much electrostatic energy is stored in the capacitor at t = ${fmtGiven(queryTimeS)} s?`,
    );
    const singleExpEnergy =
      mode === "discharging"
        ? sol.maxStoredEnergyJ * Math.exp(-queryTimeS / sol.timeConstantS)
        : sol.maxStoredEnergyJ * (1 - Math.exp(-queryTimeS / sol.timeConstantS));
    const mcq = buildMcqBundle(rng, sol.storedEnergyAtQueryJ, "J", [
      {
        value: singleExpEnergy,
        rationale:
          "Scales stored energy linearly with V_C(t)/V₀ instead of quadratically with (V_C(t)/V₀)² in U = ½CV_C².",
      },
      {
        value: 2 * sol.storedEnergyAtQueryJ,
        rationale:
          "Forgets the factor of one-half in U(t) = ½CV_C(t)².",
      },
      {
        value: sol.maxStoredEnergyJ,
        rationale:
          "Calculates maximum stored energy ½CV₀² rather than the instantaneous energy at the query time.",
      },
    ]);
    const ans = fmtQty(sol.storedEnergyAtQueryJ, "J");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "higher",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Compute instantaneous electrostatic energy stored in capacitor during RC transient",
        [
          "forgetting that capacitor energy scales as voltage squared",
          "omitting half factor in capacitor energy",
          "evaluating asymptotic maximum energy instead of query-time energy",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "storedEnergyAtQueryJ",
      workedSolution: `τ = RC = ${fmtQty(sol.timeConstantS, "s")}, giving V_C(${fmtGiven(queryTimeS)} s) = ${fmtQty(sol.capacitorVoltageAtQueryV, "V")}. Stored energy U = ½CV_C² = 0.5 × ${fmtNum(capacitanceF)} × (${fmtNum(sol.capacitorVoltageAtQueryV)})² = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates V_C(t) and computes U(t) = ½CV_C(t)² = ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured RC item
  const stem = buildStem("");
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: "Calculate the RC time constant τ of the circuit.",
      marks: 2,
      targetQuantityKey: "timeConstantS",
      truthValue: sol.timeConstantS,
      unit: "s",
      methodCriterion: "Multiplies resistance in Ω by capacitance in F (τ = RC).",
      workingFormula: "τ = RC.",
      workingSubstitution: `τ = ${resistanceOhm} × ${fmtNum(capacitanceF)}`,
    },
    {
      partId: "b",
      prompt: `Determine the potential difference across the capacitor at t = ${fmtGiven(queryTimeS)} s.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "capacitorVoltageAtQueryV",
      truthValue: sol.capacitorVoltageAtQueryV,
      unit: "V",
      methodCriterion:
        mode === "charging"
          ? "Applies V_C(t) = V₀(1 − e^(−t/τ))."
          : "Applies V_C(t) = V₀ e^(−t/τ).",
      workingFormula:
        mode === "charging"
          ? "V_C(t) = V₀(1 − e^(−t/τ))."
          : "V_C(t) = V₀ e^(−t/τ).",
      workingSubstitution:
        mode === "charging"
          ? `V_C = ${supplyVoltageV}(1 − e^(−${fmtGiven(queryTimeS)}/${fmtNum(sol.timeConstantS)}))`
          : `V_C = ${supplyVoltageV} e^(−${fmtGiven(queryTimeS)}/${fmtNum(sol.timeConstantS)})`,
    },
    {
      partId: "c",
      prompt: `Calculate the electrostatic energy stored in the capacitor at t = ${fmtGiven(queryTimeS)} s.`,
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "storedEnergyAtQueryJ",
      truthValue: sol.storedEnergyAtQueryJ,
      unit: "J",
      methodCriterion: "Uses U = ½CV_C² with the voltage found in (b).",
      workingFormula: "U = ½CV_C².",
      workingSubstitution: `U = 0.5 × ${fmtNum(capacitanceF)} × (${fmtNum(sol.capacitorVoltageAtQueryV)})²`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "standard",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Evaluate RC time constant, instantaneous capacitor voltage, and stored energy",
      [],
      [
        "part: calculate RC time constant",
        "part: evaluate instantaneous capacitor potential difference",
        "part: compute stored electrostatic energy at query instant",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 6: faraday-flux-linkage-coil-angle
// ============================================================================

const COIL_CONTEXTS = [
  "search coil in an MRI fringe-field survey",
  "geophysical induction loop magnetometer",
  "synchrotron dipole field-monitoring coil",
  "laboratory Helmholtz-coil pickup loop",
  "non-destructive eddy-current probe winding",
  "wireless inductive telemetry receiver coil",
  "rotary position-sensing pickup winding",
  "plasma-tokamak diagnostic flux loop",
] as const;

function buildArchetype6Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const turnsPool = [60, 80, 120, 150, 200, 240, 300, 400];
  const areaPool = [0.005, 0.008, 0.012, 0.016, 0.02, 0.025, 0.032];
  const b1Pool = [0.15, 0.22, 0.28, 0.36, 0.45, 0.56];
  const b2Multipliers = [2.5, 3.0, 0];
  // Strictly avoid 45° so cos(θ) != sin(θ)!
  const anglesPool = [20, 25, 30, 35, 55, 60, 65, 70];
  const dtPool = [0.025, 0.04, 0.05, 0.08, 0.1, 0.16];
  const resPool = [2.5, 4.0, 5.0, 8.0, 10.0, 16.0];

  const turns = turnsPool[variantIdx % turnsPool.length];
  const coilAreaM2 = areaPool[(variantIdx * 3) % areaPool.length];
  const initialFieldT = b1Pool[(variantIdx * 2 + 1) % b1Pool.length];
  const bMult = b2Multipliers[variantIdx % b2Multipliers.length];
  const finalFieldT = Number((initialFieldT * bMult).toPrecision(3));
  const angleDeg = anglesPool[(variantIdx * 3 + 1) % anglesPool.length];
  const angleReference: "plane" | "normal" =
    variantIdx % 2 === 0 ? "plane" : "normal";
  const timeIntervalS = dtPool[(variantIdx * 2) % dtPool.length];
  const coilResistanceOhm = resPool[(variantIdx * 3 + 2) % resPool.length];

  const spec: FluxFaradaySpec = {
    kind: "flux-faraday",
    turns,
    coilAreaM2,
    initialFieldT,
    finalFieldT,
    initialAngleDegrees: angleDeg,
    finalAngleDegrees: angleDeg,
    angleReference,
    timeIntervalS,
    coilResistanceOhm,
  };
  const sol = solveEmInductionScenario(spec);
  if (sol.kind !== "flux-faraday" || sol.averageInducedCurrentA === undefined) {
    throw new Error("Expected flux-faraday solution with resistance");
  }

  const hiddenQuantities = [
    "initialFluxWb",
    "finalFluxWb",
    "fluxChangeWb",
    "initialFluxLinkageWbTurns",
    "finalFluxLinkageWbTurns",
    "fluxLinkageChangeWbTurns",
    "signedAverageEmfV",
    "averageEmfMagnitudeV",
    "averageInducedCurrentA",
    "inducedChargeC",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "turns", value: turns, source: "stem" },
    { name: "coilAreaM2", value: coilAreaM2, unit: "m²", source: "stem" },
    { name: "initialFieldT", value: initialFieldT, unit: "T", source: "stem" },
    ...(finalFieldT > 0
      ? [{ name: "finalFieldT", value: finalFieldT, unit: "T", source: "stem" as const }]
      : []),
    { name: "initialAngleDegrees", value: angleDeg, unit: "°", source: "stem" },
    { name: "timeIntervalS", value: timeIntervalS, unit: "s", source: "stem" },
    { name: "coilResistanceOhm", value: coilResistanceOhm, unit: "Ω", source: "stem" },
  ];

  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const app = COIL_CONTEXTS[variantIdx % COIL_CONTEXTS.length];
  const anglePhrase =
    angleReference === "plane"
      ? `an angle of ${angleDeg}° with the plane of the coil`
      : `an angle of ${angleDeg}° with the normal to the coil`;
  const fieldChangePhrase =
    finalFieldT === 0
      ? `decays uniformly from ${fmtGiven(initialFieldT)} T to zero in ${fmtGiven(timeIntervalS)} s`
      : `ramps uniformly from ${fmtGiven(initialFieldT)} T to ${fmtGiven(finalFieldT)} T over ${fmtGiven(timeIntervalS)} s`;

  const buildStem = (tail: string): string => {
    const f = variantIdx % 6;
    if (f === 0) {
      return `A ${app} has ${turns} turns, cross-sectional area ${fmtGiven(coilAreaM2)} m², and total loop resistance ${fmtGiven(coilResistanceOhm)} Ω. Uniform magnetic field lines make ${anglePhrase} while the flux density ${fieldChangePhrase}. ${tail}`.trim();
    }
    if (f === 1) {
      return `During field ramping in a ${app} (${turns} turns, area ${fmtGiven(coilAreaM2)} m², resistance ${fmtGiven(coilResistanceOhm)} Ω), a uniform magnetic field directed at ${anglePhrase} ${fieldChangePhrase}. ${tail}`.trim();
    }
    if (f === 2) {
      return `Fixed so that a uniform magnetic field forms ${anglePhrase}, a closed ${app} of ${turns} turns, area ${fmtGiven(coilAreaM2)} m², and resistance ${fmtGiven(coilResistanceOhm)} Ω experiences a field that ${fieldChangePhrase}. ${tail}`.trim();
    }
    if (f === 3) {
      return `In a ${app}, a flat winding of ${turns} turns, area ${fmtGiven(coilAreaM2)} m², and circuit resistance ${fmtGiven(coilResistanceOhm)} Ω sits in a magnetic field inclined at ${anglePhrase}. The magnetic flux density ${fieldChangePhrase}. ${tail}`.trim();
    }
    if (f === 4) {
      return `An experimental ${app} comprises ${turns} closely wound turns of area ${fmtGiven(coilAreaM2)} m² and resistance ${fmtGiven(coilResistanceOhm)} Ω. Held at a fixed orientation where the field lines make ${anglePhrase}, the field ${fieldChangePhrase}. ${tail}`.trim();
    }
    return `Maintaining ${anglePhrase}, the magnetic field threading a ${app} with ${turns} turns and area ${fmtGiven(coilAreaM2)} m² (total resistance ${fmtGiven(coilResistanceOhm)} Ω) ${fieldChangePhrase}. ${tail}`.trim();
  };

  // Trig complement factor for normal-vs-plane angle misconception!
  const swappedAngleFactor =
    angleReference === "plane"
      ? Math.cos((angleDeg * Math.PI) / 180) /
        Math.sin((angleDeg * Math.PI) / 180)
      : Math.sin((angleDeg * Math.PI) / 180) /
        Math.cos((angleDeg * Math.PI) / 180);

  if (format === "mcq") {
    const subMode = variantIdx % 3;
    if (subMode === 0) {
      const stem = buildStem(
        "What is the initial magnetic flux linkage NΦ₁ of the coil?",
      );
      const mcq = buildMcqBundle(rng, sol.initialFluxLinkageWbTurns, "Wb", [
        {
          value: sol.initialFluxLinkageWbTurns * swappedAngleFactor,
          rationale:
            angleReference === "plane"
              ? `Substitutes the ${angleDeg}° angle to the coil plane directly into NBA cos θ instead of measuring θ = ${90 - angleDeg}° from the coil normal.`
              : `Uses NBA sin ${angleDeg}° instead of NBA cos ${angleDeg}° when the angle to the coil normal is given.`,
        },
        {
          value: sol.initialFluxWb,
          rationale:
            "Computes the magnetic flux Φ = BA cos θ through a single turn and omits multiplying by N turns.",
        },
        {
          value: turns * initialFieldT * coilAreaM2,
          rationale:
            "Evaluates maximum flux linkage NBA without projecting onto the coil normal.",
        },
      ]);
      const ans = fmtQty(sol.initialFluxLinkageWbTurns, "Wb");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Compute magnetic flux linkage distinguishing angle to coil normal from angle to coil plane",
          [
            "confusing angle to coil plane with angle to coil normal in flux formula",
            "omitting number of turns in flux linkage",
            "ignoring angular projection factor",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "initialFluxLinkageWbTurns",
        workedSolution: `Angle to coil normal θ_n = ${sol.initialNormalAngleDegrees}°. Initial flux linkage NΦ₁ = NBA cos θ_n = ${turns} × ${initialFieldT} × ${coilAreaM2} × cos ${sol.initialNormalAngleDegrees}° = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses θ_normal = ${sol.initialNormalAngleDegrees}° in NΦ₁ = NBA cos θ_normal to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      const stem = buildStem(
        "What is the magnitude of the average emf induced in the coil?",
      );
      const mcq = buildMcqBundle(rng, sol.averageEmfMagnitudeV, "V", [
        {
          value: sol.averageEmfMagnitudeV * swappedAngleFactor,
          rationale:
            angleReference === "plane"
              ? `Uses cos ${angleDeg}° instead of cos ${90 - angleDeg}° (= sin ${angleDeg}°), confusing the angle to the coil plane with the angle to the normal.`
              : `Uses sin ${angleDeg}° instead of cos ${angleDeg}° when projecting B along the coil normal.`,
        },
        {
          value: sol.averageEmfMagnitudeV / turns,
          rationale:
            "Omits the number of turns N in Faraday's law |ε| = N|ΔΦ|/Δt.",
        },
        {
          value: Math.abs(sol.fluxLinkageChangeWbTurns) * timeIntervalS,
          rationale:
            "Multiplies |Δ(NΦ)| by Δt instead of dividing by Δt.",
        },
      ]);
      const ans = fmtQty(sol.averageEmfMagnitudeV, "V");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Apply Faraday law to find average induced emf in an inclined multi-turn coil",
          [
            "confusing angle to coil normal with angle to coil plane",
            "omitting turn count in Faraday law",
            "multiplying flux linkage change by time interval instead of dividing",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "averageEmfMagnitudeV",
        workedSolution: `Angle to normal θ_n = ${sol.initialNormalAngleDegrees}°. |Δ(NΦ)| = ${turns} × |${finalFieldT} − ${initialFieldT}| × ${coilAreaM2} × cos ${sol.initialNormalAngleDegrees}° = ${fmtQty(Math.abs(sol.fluxLinkageChangeWbTurns), "Wb")}. Average |ε| = |Δ(NΦ)| / Δt = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Projects flux along coil normal (${sol.initialNormalAngleDegrees}°) and evaluates |ε| = N|ΔΦ|/Δt = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildStem(
      "What average induced current circulates around the closed coil during the ramp?",
    );
    const mcq = buildMcqBundle(rng, sol.averageInducedCurrentA, "A", [
      {
        value: sol.averageInducedCurrentA * swappedAngleFactor,
        rationale:
          angleReference === "plane"
            ? `Uses cos ${angleDeg}° directly on the angle to the coil plane instead of measuring θ from the coil normal.`
            : `Uses sin ${angleDeg}° instead of cos ${angleDeg}° when evaluating magnetic flux linkage.`,
      },
      {
        value: sol.averageEmfMagnitudeV,
        rationale:
          "Stops at induced emf |ε| without dividing by loop resistance R.",
      },
      {
        value: sol.averageEmfMagnitudeV * coilResistanceOhm,
        rationale:
          "Multiplies induced emf |ε| by coil resistance R instead of dividing |ε| / R.",
      },
    ]);
    const ans = fmtQty(sol.averageInducedCurrentA, "A");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "higher",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Determine average induced current in inclined search coil during magnetic field ramp",
        [
          "confusing coil-plane angle with coil-normal angle",
          "stopping at induced emf without dividing by resistance",
          "multiplying emf by coil resistance instead of dividing",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "averageInducedCurrentA",
      workedSolution: `With θ_normal = ${sol.initialNormalAngleDegrees}°, |ε| = N|ΔB|A cos ${sol.initialNormalAngleDegrees}° / Δt = ${fmtQty(sol.averageEmfMagnitudeV, "V")}. Average current I = |ε| / R = ${fmtNum(sol.averageEmfMagnitudeV)} / ${coilResistanceOhm} = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Computes |ε| using θ_normal = ${sol.initialNormalAngleDegrees}° and I = |ε|/R = ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured flux-faraday item
  const stem = buildStem("");
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: "Calculate the initial magnetic flux linkage NΦ₁ of the coil.",
      marks: 2,
      targetQuantityKey: "initialFluxLinkageWbTurns",
      truthValue: sol.initialFluxLinkageWbTurns,
      unit: "Wb",
      methodCriterion: `Uses θ_normal = ${sol.initialNormalAngleDegrees}° in NΦ₁ = NBA cos θ_normal.`,
      workingFormula: "NΦ₁ = NBA cos θ_normal.",
      workingSubstitution: `NΦ₁ = ${turns} × ${initialFieldT} × ${coilAreaM2} × cos ${sol.initialNormalAngleDegrees}°`,
    },
    {
      partId: "b",
      prompt: "Determine the magnitude of the average emf induced during the field change.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "averageEmfMagnitudeV",
      truthValue: sol.averageEmfMagnitudeV,
      unit: "V",
      methodCriterion: "Applies Faraday's law |ε| = |NΦ₂ − NΦ₁| / Δt.",
      workingFormula: "|ε| = |NΦ₂ − NΦ₁| / Δt.",
      workingSubstitution: `|ε| = ${fmtNum(Math.abs(sol.fluxLinkageChangeWbTurns))} / ${timeIntervalS}`,
    },
    {
      partId: "c",
      prompt: "Calculate the average induced current in the coil.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "averageInducedCurrentA",
      truthValue: sol.averageInducedCurrentA,
      unit: "A",
      methodCriterion: "Divides induced emf from (b) by coil resistance R.",
      workingFormula: "I = |ε| / R.",
      workingSubstitution: `I = ${fmtNum(sol.averageEmfMagnitudeV)} / ${coilResistanceOhm}`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "higher",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Multi-step Faraday induction calculation with inclined coil angle and resistive loop",
      [],
      [
        "part: project magnetic field along coil normal to find initial flux linkage",
        "part: apply Faraday law for average induced emf magnitude",
        "part: evaluate average induced current around closed coil",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 7: faraday-field-reversal-induced-charge
// ============================================================================

const FLIP_COIL_CONTEXTS = [
  "ballistic galvanometer flip-coil",
  "electromagnet pole-gap calibration search coil",
  "earth-inductor compass loop",
  "accelerator quadrupole flux-integrator coil",
  "palaeomagnetic core-sample pickup loop",
  "cryogenic solenoid quench-sensing coil",
] as const;

function buildArchetype7Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const turnsPool = [50, 75, 100, 140, 180, 250, 350, 500];
  const areaPool = [0.004, 0.006, 0.01, 0.015, 0.022, 0.03];
  const bPool = [0.12, 0.18, 0.25, 0.35, 0.48, 0.65, 0.8];
  const dtPool = [0.02, 0.04, 0.05, 0.08, 0.12, 0.2];
  const resPool = [2.0, 3.5, 5.0, 7.5, 12.0, 20.0];

  const turns = turnsPool[(variantIdx * 3 + 1) % turnsPool.length];
  const coilAreaM2 = areaPool[(variantIdx * 2) % areaPool.length];
  const bMag = bPool[(variantIdx * 3) % bPool.length];
  const timeIntervalS = dtPool[(variantIdx * 2 + 1) % dtPool.length];
  const coilResistanceOhm = resPool[(variantIdx * 2 + 2) % resPool.length];
  const asymFactor = variantIdx % 2 === 0 ? -1 : -0.6;
  const finalFieldT = Number((bMag * asymFactor).toPrecision(3));

  const spec: FluxFaradaySpec = {
    kind: "flux-faraday",
    turns,
    coilAreaM2,
    initialFieldT: bMag,
    finalFieldT,
    initialAngleDegrees: 0,
    finalAngleDegrees: 0,
    timeIntervalS,
    coilResistanceOhm,
  };
  const sol = solveEmInductionScenario(spec);
  if (
    sol.kind !== "flux-faraday" ||
    sol.inducedChargeC === undefined ||
    sol.averageInducedCurrentA === undefined
  ) {
    throw new Error("Expected flux-faraday charge solution");
  }

  const hiddenQuantities = [
    "initialFluxWb",
    "finalFluxWb",
    "fluxChangeWb",
    "initialFluxLinkageWbTurns",
    "finalFluxLinkageWbTurns",
    "fluxLinkageChangeWbTurns",
    "signedAverageEmfV",
    "averageEmfMagnitudeV",
    "averageInducedCurrentA",
    "inducedChargeC",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "turns", value: turns, source: "stem" },
    { name: "coilAreaM2", value: coilAreaM2, unit: "m²", source: "stem" },
    { name: "initialFieldT", value: bMag, unit: "T", source: "stem" },
    { name: "finalFieldT", value: finalFieldT, unit: "T", source: "stem" },
    { name: "timeIntervalS", value: timeIntervalS, unit: "s", source: "stem" },
    { name: "coilResistanceOhm", value: coilResistanceOhm, unit: "Ω", source: "stem" },
  ];
  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const app = FLIP_COIL_CONTEXTS[variantIdx % FLIP_COIL_CONTEXTS.length];

  const buildStem = (tail: string): string => {
    const f = variantIdx % 5;
    const b2Text = `${fmtNum(finalFieldT)} T`;
    if (f === 0) {
      return `A ${app} of ${turns} turns, area ${fmtGiven(coilAreaM2)} m², and total circuit resistance ${fmtGiven(coilResistanceOhm)} Ω sits perpendicular to a uniform magnetic field that reverses from B₁ = +${fmtGiven(bMag)} T to B₂ = ${b2Text} in ${fmtGiven(timeIntervalS)} s. ${tail}`.trim();
    }
    if (f === 1) {
      return `Aligned normal to the axis of an electromagnet, a ${app} (${turns} turns, area ${fmtGiven(coilAreaM2)} m², loop resistance ${fmtGiven(coilResistanceOhm)} Ω) experiences a polarity reversal from +${fmtGiven(bMag)} T to ${b2Text} over ${fmtGiven(timeIntervalS)} s. ${tail}`.trim();
    }
    if (f === 2) {
      return `In a magnetic calibration run, the axial flux density perpendicular to a ${app} with ${turns} turns, cross-section ${fmtGiven(coilAreaM2)} m², and resistance ${fmtGiven(coilResistanceOhm)} Ω switches from +${fmtGiven(bMag)} T to ${b2Text} during an interval of ${fmtGiven(timeIntervalS)} s. ${tail}`.trim();
    }
    if (f === 3) {
      return `Perpendicular magnetic field lines through a closed ${app} (${turns} turns, area ${fmtGiven(coilAreaM2)} m², resistance ${fmtGiven(coilResistanceOhm)} Ω) change from +${fmtGiven(bMag)} T to ${b2Text} in ${fmtGiven(timeIntervalS)} s. ${tail}`.trim();
    }
    return `Connected to a charge integrator of total loop resistance ${fmtGiven(coilResistanceOhm)} Ω, a flat ${app} containing ${turns} turns of area ${fmtGiven(coilAreaM2)} m² faces normal to a field that reverses from +${fmtGiven(bMag)} T to ${b2Text} in ${fmtGiven(timeIntervalS)} s. ${tail}`.trim();
  };

  const singleSideEmf = (turns * bMag * coilAreaM2) / timeIntervalS;
  const singleSideCharge = (turns * bMag * coilAreaM2) / coilResistanceOhm;

  if (format === "mcq") {
    const askCharge = variantIdx % 2 === 0;
    if (askCharge) {
      const stem = buildStem(
        "What total magnitude of electric charge ΔQ flows around the circuit during this reversal?",
      );
      const mcq = buildMcqBundle(rng, sol.inducedChargeC, "C", [
        {
          value: singleSideCharge,
          rationale:
            "Uses B₁ alone instead of the full signed change |B₂ − B₁| across the field polarity reversal.",
        },
        {
          value: sol.averageInducedCurrentA,
          rationale:
            "Divides by Δt and reports average induced current I instead of total charge ΔQ = N|ΔΦ|/R.",
        },
        {
          value: Math.abs(sol.fluxLinkageChangeWbTurns) * coilResistanceOhm,
          rationale:
            "Multiplies |Δ(NΦ)| by resistance R instead of dividing by R.",
        },
      ]);
      const ans = fmtQty(sol.inducedChargeC, "C");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "higher",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Calculate total induced charge transferred during magnetic field polarity reversal",
          [
            "ignoring negative sign of reversed magnetic field when computing flux change",
            "dividing by time interval to give current instead of charge",
            "multiplying flux linkage change by resistance instead of dividing",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "inducedChargeC",
        workedSolution: `Signed field change |ΔB| = |${finalFieldT} − ${bMag}| = ${fmtGiven(Math.abs(finalFieldT - bMag))} T, so |Δ(NΦ)| = ${turns} × ${fmtGiven(Math.abs(finalFieldT - bMag))} × ${coilAreaM2} = ${fmtQty(Math.abs(sol.fluxLinkageChangeWbTurns), "Wb")}. Induced charge ΔQ = |Δ(NΦ)| / R = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Accounts for field sign reversal in |Δ(NΦ)| and evaluates ΔQ = |Δ(NΦ)|/R = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildStem(
      "What is the magnitude of the average emf induced in the coil during the reversal?",
    );
    const mcq = buildMcqBundle(rng, sol.averageEmfMagnitudeV, "V", [
      {
        value: singleSideEmf,
        rationale:
          "Treats the field as dropping only to zero (ΔB = B₁) rather than reversing sign to B₂.",
      },
      {
        value:
          asymFactor === -1
            ? singleSideEmf / turns
            : (turns * Math.abs(bMag - Math.abs(finalFieldT)) * coilAreaM2) /
              timeIntervalS,
        rationale:
          asymFactor === -1
            ? "Omits Both the factor of two on reversal and the N turns."
            : "Subtracts the field magnitudes |B₁| − |B₂| instead of taking the signed vector difference |B₂ − B₁|.",
      },
      {
        value: sol.averageInducedCurrentA,
        rationale:
          "Divides emf by resistance R, reporting induced current instead of induced emf.",
      },
    ]);
    const ans = fmtQty(sol.averageEmfMagnitudeV, "V");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "standard",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Determine average induced emf across magnetic field polarity reversal",
        [
          "missing sign reversal in magnetic flux change",
          "subtracting unsigned field magnitudes instead of signed vectors",
          "confusing induced current with induced emf",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "averageEmfMagnitudeV",
      workedSolution: `|ΔB| = |${finalFieldT} − ${bMag}| = ${fmtGiven(Math.abs(finalFieldT - bMag))} T. By Faraday's law, |ε| = N|ΔB|A / Δt = (${turns} × ${fmtGiven(Math.abs(finalFieldT - bMag))} × ${coilAreaM2}) / ${timeIntervalS} = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates |ΔB| across sign reversal to obtain |ε| = ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured reversal item
  const stem = buildStem("");
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: "Calculate the signed change in magnetic flux linkage Δ(NΦ) = NΦ₂ − NΦ₁.",
      marks: 2,
      targetQuantityKey: "fluxLinkageChangeWbTurns",
      truthValue: sol.fluxLinkageChangeWbTurns,
      unit: "Wb",
      methodCriterion: "Includes negative sign of reversed field in N(B₂ − B₁)A.",
      workingFormula: "Δ(NΦ) = N(B₂ − B₁)A.",
      workingSubstitution: `Δ(NΦ) = ${turns} × (${finalFieldT} − ${bMag}) × ${coilAreaM2}`,
    },
    {
      partId: "b",
      prompt: "Determine the magnitude of the average induced emf.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "averageEmfMagnitudeV",
      truthValue: sol.averageEmfMagnitudeV,
      unit: "V",
      methodCriterion: "Divides |Δ(NΦ)| from (a) by Δt.",
      workingFormula: "|ε| = |Δ(NΦ)| / Δt.",
      workingSubstitution: `|ε| = ${fmtNum(Math.abs(sol.fluxLinkageChangeWbTurns))} / ${timeIntervalS}`,
    },
    {
      partId: "c",
      prompt: "Calculate the total magnitude of charge ΔQ that circulates through the coil.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "inducedChargeC",
      truthValue: sol.inducedChargeC,
      unit: "C",
      methodCriterion: "Uses ΔQ = |Δ(NΦ)| / R (or I_avg Δt).",
      workingFormula: "ΔQ = |Δ(NΦ)| / R.",
      workingSubstitution: `ΔQ = ${fmtNum(Math.abs(sol.fluxLinkageChangeWbTurns))} / ${coilResistanceOhm}`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "higher",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Analyse signed flux-linkage reversal, induced emf, and ballistic charge transfer",
      [],
      [
        "part: evaluate signed change in flux linkage across field reversal",
        "part: calculate average induced emf magnitude",
        "part: determine total induced charge circulated",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 8: motional-emf-conducting-rails-braking
// ============================================================================

const RAILS_CONTEXTS = [
  "electromagnetic rail-braking demonstrator",
  "linear regenerator test track",
  "magnetohydrodynamic copper-bar carriage",
  "frictionless laboratory induction sled",
  "drop-tower eddy-braking crossbar",
  "space-tether electrodynamic rail rig",
  "levitated glider regenerator bench",
] as const;

function buildArchetype8Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const bPool = [0.25, 0.35, 0.45, 0.6, 0.75, 0.9, 1.1, 1.25];
  const lPool = [0.16, 0.2, 0.25, 0.32, 0.4, 0.5];
  const vPool = [2.4, 3.2, 4.0, 5.0, 6.5, 8.0];
  const rLoadPool = [1.4, 1.8, 2.4, 3.2, 4.2, 5.5];
  const rRodPool = [0.4, 0.6, 0.8, 1.0, 1.2];

  const magneticFieldT = bPool[(variantIdx * 3) % bPool.length];
  const railSeparationM = lPool[(variantIdx * 2 + 1) % lPool.length];
  const rodSpeedMs = vPool[(variantIdx * 3 + 2) % vPool.length];
  const loadResistanceOhm = rLoadPool[(variantIdx * 2) % rLoadPool.length];
  const rodResistanceOhm = rRodPool[variantIdx % rRodPool.length];
  const fieldDirection: MagneticFieldPageDirection =
    variantIdx % 2 === 0 ? "into-page" : "out-of-page";
  const rodDirection = variantIdx % 3 === 0 ? "left" : "right";

  const spec: MotionalEmfRailsSpec = {
    kind: "motional-emf-rails",
    magneticFieldT,
    fieldDirection,
    railSeparationM,
    rodSpeedMs,
    rodDirection,
    loadResistanceOhm,
    rodResistanceOhm,
  };
  const sol = solveEmInductionScenario(spec);
  if (sol.kind !== "motional-emf-rails") throw new Error("Expected rails solution");

  const hiddenQuantities = [
    "totalResistanceOhm",
    "motionalEmfV",
    "inducedCurrentA",
    "terminalVoltageV",
    "magneticBrakingForceN",
    "mechanicalPowerW",
    "electricalPowerW",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "magneticFieldT", value: magneticFieldT, unit: "T", source: "stem" },
    { name: "railSeparationM", value: railSeparationM, unit: "m", source: "stem" },
    { name: "rodSpeedMs", value: rodSpeedMs, unit: "m s⁻¹", source: "stem" },
    { name: "loadResistanceOhm", value: loadResistanceOhm, unit: "Ω", source: "stem" },
    { name: "rodResistanceOhm", value: rodResistanceOhm, unit: "Ω", source: "stem" },
  ];
  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const app = RAILS_CONTEXTS[variantIdx % RAILS_CONTEXTS.length];
  const bDirPhrase =
    fieldDirection === "into-page" ? "directed into the page" : "directed out of the page";

  const buildStem = (tail: string): string => {
    const f = variantIdx % 6;
    if (f === 0) {
      return `On a ${app}, a conducting bar of internal resistance ${fmtGiven(rodResistanceOhm)} Ω slides to the ${rodDirection} at a steady speed of ${fmtGiven(rodSpeedMs)} m s⁻¹ along parallel horizontal rails of negligible resistance spaced ${fmtGiven(railSeparationM)} m apart. A uniform ${fmtGiven(magneticFieldT)} T magnetic field (${bDirPhrase}) threads the rails, which are bridged by a ${fmtGiven(loadResistanceOhm)} Ω load resistor. ${tail}`.trim();
    }
    if (f === 1) {
      return `A uniform ${fmtGiven(magneticFieldT)} T magnetic field ${bDirPhrase} permeates a ${app} whose smooth conducting rails sit ${fmtGiven(railSeparationM)} m apart across a ${fmtGiven(loadResistanceOhm)} Ω external resistor. An external agent pulls a rod of resistance ${fmtGiven(rodResistanceOhm)} Ω to the ${rodDirection} at constant speed ${fmtGiven(rodSpeedMs)} m s⁻¹. ${tail}`.trim();
    }
    if (f === 2) {
      return `In a ${app}, parallel rails of separation ${fmtGiven(railSeparationM)} m are closed by a ${fmtGiven(loadResistanceOhm)} Ω resistor inside a perpendicular ${fmtGiven(magneticFieldT)} T magnetic field (${bDirPhrase}). A metal rod of resistance ${fmtGiven(rodResistanceOhm)} Ω moves steadily to the ${rodDirection} at ${fmtGiven(rodSpeedMs)} m s⁻¹. ${tail}`.trim();
    }
    if (f === 3) {
      return `Travelling to the ${rodDirection} at constant velocity ${fmtGiven(rodSpeedMs)} m s⁻¹, a crossbar of resistance ${fmtGiven(rodResistanceOhm)} Ω spans frictionless rails ${fmtGiven(railSeparationM)} m apart on a ${app} connected to a ${fmtGiven(loadResistanceOhm)} Ω load in a ${fmtGiven(magneticFieldT)} T field (${bDirPhrase}). ${tail}`.trim();
    }
    if (f === 4) {
      return `Within a ${app}, a ${fmtGiven(loadResistanceOhm)} Ω load terminates smooth rails separated by ${fmtGiven(railSeparationM)} m in a uniform ${fmtGiven(magneticFieldT)} T field ${bDirPhrase}, while a sliding rod (resistance ${fmtGiven(rodResistanceOhm)} Ω) is driven to the ${rodDirection} at ${fmtGiven(rodSpeedMs)} m s⁻¹. ${tail}`.trim();
    }
    return `During a steady-state run on a ${app}, a conducting rod of resistance ${fmtGiven(rodResistanceOhm)} Ω glides ${rodDirection} at ${fmtGiven(rodSpeedMs)} m s⁻¹ across rails ${fmtGiven(railSeparationM)} m apart bridged by ${fmtGiven(loadResistanceOhm)} Ω in a ${fmtGiven(magneticFieldT)} T magnetic field (${bDirPhrase}). ${tail}`.trim();
  };

  if (format === "mcq") {
    const subMode = variantIdx % 4;
    if (subMode === 0) {
      const stem = buildStem(
        "What external pulling force magnitude is needed to maintain this constant speed?",
      );
      const mcq = buildMcqBundle(rng, sol.magneticBrakingForceN, "N", [
        {
          value: (magneticFieldT ** 2 * railSeparationM ** 2 * rodSpeedMs) / loadResistanceOhm,
          rationale:
            "Neglects the internal resistance of the moving rod and divides by the external load resistance R alone.",
        },
        {
          value: sol.inducedCurrentA,
          rationale:
            "Stops after evaluating the induced loop current I = BLv/(R + r) without multiplying by B L.",
        },
        {
          value: sol.mechanicalPowerW,
          rationale:
            "Computes mechanical input power P = Fv instead of the applied pulling force F.",
        },
      ]);
      const ans = fmtQty(sol.magneticBrakingForceN, "N");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "higher",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Determine external force balancing magnetic braking on conducting rod with internal resistance",
          [
            "neglecting internal rod resistance in loop current",
            "stopping at induced current instead of Laplace force",
            "computing mechanical power instead of force",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "magneticBrakingForceN",
        workedSolution: `Motional emf ε = BLv = ${fmtQty(sol.motionalEmfV, "V")}. Total loop resistance R_tot = ${loadResistanceOhm} + ${rodResistanceOhm} = ${fmtGiven(sol.totalResistanceOhm)} Ω, giving I = ε / R_tot = ${fmtQty(sol.inducedCurrentA, "A")}. Pulling force F = BIL = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates ε = BLv, I = ε/(R + r), and F = BIL = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      const stem = buildStem(
        "What is the terminal potential difference across the external load resistor?",
      );
      const mcq = buildMcqBundle(rng, sol.terminalVoltageV, "V", [
        {
          value: sol.motionalEmfV,
          rationale:
            "Reports the full motional emf BLv and ignores the internal potential drop I r across the moving rod.",
        },
        {
          value: sol.inducedCurrentA * rodResistanceOhm,
          rationale:
            "Calculates the lost volts I r inside the moving rod instead of V_term = I R across the load.",
        },
        {
          value: (sol.motionalEmfV * sol.totalResistanceOhm) / loadResistanceOhm,
          rationale:
            "Inverts the potential-divider ratio as ε(R + r)/R instead of εR/(R + r).",
        },
      ]);
      const ans = fmtQty(sol.terminalVoltageV, "V");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Calculate terminal voltage across external load driven by resistive moving rod",
          [
            "equating terminal voltage to open-circuit motional emf",
            "computing internal voltage drop instead of external load voltage",
            "inverting resistance potential-divider fraction",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "terminalVoltageV",
        workedSolution: `ε = BLv = ${fmtQty(sol.motionalEmfV, "V")}; loop current I = ε / (R + r) = ${fmtQty(sol.inducedCurrentA, "A")}. Terminal p.d. across load V_term = I R = ${fmtNum(sol.inducedCurrentA)} × ${loadResistanceOhm} = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses V_term = BLv × R/(R + r) to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 2) {
      const stem = buildStem(
        "What mechanical power must be supplied to keep the rod moving at constant speed?",
      );
      const mcq = buildMcqBundle(rng, sol.mechanicalPowerW, "W", [
        {
          value: sol.inducedCurrentA ** 2 * loadResistanceOhm,
          rationale:
            "Calculates only the power dissipated in the external load I²R, omitting heating I²r inside the rod.",
        },
        {
          value: sol.motionalEmfV ** 2 / loadResistanceOhm,
          rationale:
            "Uses ε²/R and neglects the rod resistance r when finding loop current.",
        },
        {
          value: sol.magneticBrakingForceN,
          rationale:
            "Evaluates magnetic braking force BIL without multiplying by speed v.",
        },
      ]);
      const ans = fmtQty(sol.mechanicalPowerW, "W");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "higher",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Find total mechanical power converted into electrical heating in moving-rod rail loop",
          [
            "counting only external load dissipation and ignoring rod internal heating",
            "omitting internal rod resistance in loop resistance",
            "forgetting to multiply braking force by rod velocity",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "mechanicalPowerW",
        workedSolution: `ε = BLv = ${fmtQty(sol.motionalEmfV, "V")}; R_tot = ${loadResistanceOhm} + ${rodResistanceOhm} = ${fmtGiven(sol.totalResistanceOhm)} Ω. Mechanical input power equals total Joule heating P = ε² / R_tot = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes P = Fv = (BLv)²/(R + r) = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildStem("What induced current circulates around the closed loop?");
    const mcq = buildMcqBundle(rng, sol.inducedCurrentA, "A", [
      {
        value: sol.motionalEmfV / loadResistanceOhm,
        rationale:
          "Divides motional emf BLv by external resistance R only, ignoring the rod resistance r.",
      },
      {
        value: sol.motionalEmfV,
        rationale:
          "Stops after computing motional emf ε = BLv without dividing by total resistance.",
      },
      {
        value: (magneticFieldT * rodSpeedMs) / (railSeparationM * sol.totalResistanceOhm),
        rationale:
          "Divides by rail separation L instead of multiplying in ε = BLv.",
      },
    ]);
    const ans = fmtQty(sol.inducedCurrentA, "A");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "foundation",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Calculate induced current in resistive conducting bar sliding on parallel rails",
        [
          "ignoring moving-rod internal resistance",
          "reporting motional emf instead of current",
          "dividing by rail separation instead of multiplying",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "inducedCurrentA",
      workedSolution: `Motional emf ε = BLv = ${magneticFieldT} × ${railSeparationM} × ${rodSpeedMs} = ${fmtQty(sol.motionalEmfV, "V")}. Loop current I = ε / (R + r) = ${fmtNum(sol.motionalEmfV)} / ${fmtGiven(sol.totalResistanceOhm)} = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates I = BLv / (R + r) = ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured rails item
  const stem = buildStem("");
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: "Calculate the motional emf induced across the sliding rod.",
      marks: 2,
      targetQuantityKey: "motionalEmfV",
      truthValue: sol.motionalEmfV,
      unit: "V",
      methodCriterion: "Applies ε = BLv.",
      workingFormula: "ε = BLv.",
      workingSubstitution: `ε = ${magneticFieldT} × ${railSeparationM} × ${rodSpeedMs}`,
    },
    {
      partId: "b",
      prompt: "Determine the induced current circulating around the rails.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "inducedCurrentA",
      truthValue: sol.inducedCurrentA,
      unit: "A",
      methodCriterion: "Divides ε from (a) by total loop resistance R + r.",
      workingFormula: "I = ε / (R + r).",
      workingSubstitution: `I = ${fmtNum(sol.motionalEmfV)} / (${loadResistanceOhm} + ${rodResistanceOhm})`,
    },
    {
      partId: "c",
      prompt:
        "Calculate the external pulling force magnitude required to maintain constant speed.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "magneticBrakingForceN",
      truthValue: sol.magneticBrakingForceN,
      unit: "N",
      methodCriterion: "Equates applied force to magnetic braking force F = BIL.",
      workingFormula: "F = BIL.",
      workingSubstitution: `F = ${magneticFieldT} × ${fmtNum(sol.inducedCurrentA)} × ${railSeparationM}`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "standard",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Multi-step analysis of motional emf, loop current, and magnetic braking force on rails",
      [],
      [
        "part: compute motional emf across sliding conductor",
        "part: determine induced current including rod resistance",
        "part: calculate external force balancing magnetic braking",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 9: rotating-coil-ac-peak-emf-waveform (IB HL + A-Level Y13 + NCUK IFY-S2)
// ============================================================================

const AC_GEN_CONTEXTS = [
  "hydroelectric micro-turbine alternator",
  "wind-tunnel slip-ring test dynamo",
  "bicycle hub-generator demonstrator",
  "portable Diesel-coupled AC armature",
  "laboratory hand-cranked slip-ring coil",
  "tidal-stream rotor testbed",
  "automotive tachometer pickup alternator",
] as const;

function buildArchetype9Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const turnsPool = [50, 80, 120, 150, 200, 250, 320, 400];
  const areaPool = [0.006, 0.01, 0.014, 0.018, 0.024, 0.03];
  const bPool = [0.14, 0.2, 0.28, 0.35, 0.45, 0.55];
  const freqPool = [20, 25, 40, 50, 60, 80, 100];

  const turns = turnsPool[variantIdx % turnsPool.length];
  const coilAreaM2 = areaPool[(variantIdx * 2 + 1) % areaPool.length];
  const magneticFieldT = bPool[(variantIdx * 3) % bPool.length];
  const frequencyHz = freqPool[(variantIdx * 2) % freqPool.length];
  const period = 1 / frequencyHz;
  // Query at T/6 (60° phase) or T/12 (30° phase) so sin(ωt) != cos(ωt) and both > 0!
  const phaseFrac = variantIdx % 2 === 0 ? 1 / 12 : 1 / 6;
  const queryTimeS = Number((period * phaseFrac).toPrecision(3));

  const spec: AcGeneratorSpec = {
    kind: "ac-generator",
    turns,
    coilAreaM2,
    magneticFieldT,
    frequencyHz,
    queryTimeS,
    cyclesShown: 2,
    showFluxCurve: variantIdx % 2 === 0,
  };
  const sol = solveEmInductionScenario(spec);
  if (sol.kind !== "ac-generator") throw new Error("Expected ac-generator solution");

  const hiddenQuantities = [
    "angularSpeedRadS",
    "periodS",
    "peakFluxWb",
    "peakFluxLinkageWbTurns",
    "peakEmfV",
    "peakToPeakEmfV",
    "rmsVoltageV",
    "fluxAtQueryWb",
    "fluxLinkageAtQueryWbTurns",
    "emfAtQueryV",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "turns", value: turns, source: "stem" },
    { name: "coilAreaM2", value: coilAreaM2, unit: "m²", source: "stem" },
    { name: "magneticFieldT", value: magneticFieldT, unit: "T", source: "stem" },
    { name: "frequencyHz", value: frequencyHz, unit: "Hz", source: "stem" },
    { name: "queryTimeS", value: queryTimeS, unit: "s", source: "stem" },
  ];
  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const app = AC_GEN_CONTEXTS[variantIdx % AC_GEN_CONTEXTS.length];

  const buildStem = (tail: string): string => {
    const f = variantIdx % 6;
    if (f === 0) {
      return `In a ${app}, a rectangular coil of ${turns} turns and cross-sectional area ${fmtGiven(coilAreaM2)} m² rotates steadily at ${frequencyHz} Hz inside a uniform ${fmtGiven(magneticFieldT)} T magnetic field, passing through maximum flux linkage at t = 0 and sampled at t = ${fmtGiven(queryTimeS)} s. ${tail}`.trim();
    }
    if (f === 1) {
      return `An armature of ${turns} turns and area ${fmtGiven(coilAreaM2)} m² in a ${app} spins at frequency ${frequencyHz} Hz within a uniform ${fmtGiven(magneticFieldT)} T field; its coil normal is aligned with the field at t = 0, and an oscilloscope reads the output at t = ${fmtGiven(queryTimeS)} s. ${tail}`.trim();
    }
    if (f === 2) {
      return `Driven at a rotational frequency of ${frequencyHz} Hz inside a ${app}, a slip-ring coil of ${turns} turns and area ${fmtGiven(coilAreaM2)} m² cuts a uniform ${fmtGiven(magneticFieldT)} T magnetic field (starting from maximum flux at t = 0 and observed at t = ${fmtGiven(queryTimeS)} s). ${tail}`.trim();
    }
    if (f === 3) {
      return `Within a ${app}, uniform magnetic flux of density ${fmtGiven(magneticFieldT)} T links a rotor coil of ${turns} turns and area ${fmtGiven(coilAreaM2)} m² rotating at ${frequencyHz} Hz from maximum flux linkage at t = 0 up to t = ${fmtGiven(queryTimeS)} s. ${tail}`.trim();
    }
    if (f === 4) {
      return `During testing of a ${app}, a coil with ${turns} turns and area ${fmtGiven(coilAreaM2)} m² revolves at ${frequencyHz} Hz in a ${fmtGiven(magneticFieldT)} T field, starting perpendicular to the field lines at t = 0 and queried at t = ${fmtGiven(queryTimeS)} s. ${tail}`.trim();
    }
    return `Rotating uniformly at ${frequencyHz} Hz in a ${fmtGiven(magneticFieldT)} T magnetic field, the coil (${turns} turns, area ${fmtGiven(coilAreaM2)} m²) of a ${app} starts at peak flux linkage at t = 0 and reaches t = ${fmtGiven(queryTimeS)} s. ${tail}`.trim();
  };

  if (format === "mcq") {
    const subMode = variantIdx % 3;
    if (subMode === 0) {
      const stem = buildStem("What is the peak emf ε₀ generated by the rotating coil?");
      const mcq = buildMcqBundle(rng, sol.peakEmfV, "V", [
        {
          value: turns * magneticFieldT * coilAreaM2 * frequencyHz,
          rationale:
            "Substitutes rotational frequency f directly into NBAω instead of angular speed ω = 2πf, omitting the 2π factor.",
        },
        {
          value: sol.peakToPeakEmfV,
          rationale:
            "Doubles the amplitude and reports peak-to-peak emf 2ε₀ instead of peak emf ε₀.",
        },
        {
          value: sol.peakEmfV / turns,
          rationale:
            "Computes single-turn peak emf BAω and omits multiplying by N turns.",
        },
      ]);
      const ans = fmtQty(sol.peakEmfV, "V");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Calculate peak induced emf of rotating AC generator coil",
          [
            "using linear frequency instead of angular frequency",
            "confusing peak-to-peak voltage with peak amplitude",
            "omitting number of coil turns",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "peakEmfV",
        workedSolution: `Angular speed ω = 2πf = 2π(${frequencyHz}) = ${fmtQty(sol.angularSpeedRadS, "rad s⁻¹")}. Peak emf ε₀ = NBAω = ${turns} × ${magneticFieldT} × ${coilAreaM2} × ${fmtNum(sol.angularSpeedRadS)} = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies ε₀ = 2πfNBA to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      const stem = buildStem(
        `What instantaneous emf ε is induced at t = ${fmtGiven(queryTimeS)} s?`,
      );
      const cosMistake = Math.abs(
        sol.peakEmfV * Math.cos(sol.angularSpeedRadS * queryTimeS),
      );
      const mcq = buildMcqBundle(rng, sol.emfAtQueryV, "V", [
        {
          value: cosMistake,
          rationale:
            "Evaluates ε₀ cos(ωt) instead of ε₀ sin(ωt), confusing the phase of induced emf with magnetic flux linkage.",
        },
        {
          value: sol.peakEmfV,
          rationale:
            "Reports the maximum amplitude ε₀ rather than evaluating ε(t) = ε₀ sin(ωt) at the specified instant.",
        },
        {
          value:
            turns *
            magneticFieldT *
            coilAreaM2 *
            frequencyHz *
            Math.sin(sol.angularSpeedRadS * queryTimeS),
          rationale:
            "Omits 2π when computing peak amplitude NBAω before multiplying by sin(ωt).",
        },
      ]);
      const ans = fmtQty(sol.emfAtQueryV, "V");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "higher",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Evaluate instantaneous sinusoidal emf of rotating coil at given time",
          [
            "confusing sine emf waveform with cosine flux-linkage waveform",
            "reporting peak emf instead of instantaneous value",
            "omitting two-pi angular speed conversion",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "emfAtQueryV",
        workedSolution: `ω = 2π(${frequencyHz}) = ${fmtQty(sol.angularSpeedRadS, "rad s⁻¹")}, ε₀ = NBAω = ${fmtQty(sol.peakEmfV, "V")}. At t = ${fmtGiven(queryTimeS)} s, ε(t) = ε₀ sin(ωt) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes ε₀ = 2πfNBA and evaluates ε₀ sin(ωt) = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildStem(
      "What is the peak-to-peak emf displayed on an oscilloscope across one full cycle?",
    );
    const mcq = buildMcqBundle(rng, sol.peakToPeakEmfV, "V", [
      {
        value: sol.peakEmfV,
        rationale:
          "Reports single-sided peak amplitude ε₀ rather than peak-to-peak swing 2ε₀.",
      },
      {
        value: 2 * turns * magneticFieldT * coilAreaM2 * frequencyHz,
        rationale:
          "Multiplies by 2 for peak-to-peak but omits 2π when converting f to ω.",
      },
      {
        value: sol.rmsVoltageV,
        rationale:
          "Computes rms voltage ε₀/√2 instead of peak-to-peak voltage 2ε₀.",
      },
    ]);
    const ans = fmtQty(sol.peakToPeakEmfV, "V");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "foundation",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Determine peak-to-peak alternating emf of slip-ring generator",
        [
          "reporting single peak amplitude instead of peak-to-peak",
          "forgetting angular frequency conversion factor",
          "confusing rms voltage with peak-to-peak swing",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "peakToPeakEmfV",
      workedSolution: `Peak emf ε₀ = 2πfNBA = ${fmtQty(sol.peakEmfV, "V")}. Peak-to-peak emf V_pp = 2ε₀ = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates V_pp = 2(2πfNBA) = ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured AC waveform item
  const stem = buildStem("");
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: "Calculate the maximum magnetic flux linkage NΦ₀ of the coil.",
      marks: 2,
      targetQuantityKey: "peakFluxLinkageWbTurns",
      truthValue: sol.peakFluxLinkageWbTurns,
      unit: "Wb",
      methodCriterion: "Multiplies N, B, and A to obtain peak flux linkage.",
      workingFormula: "NΦ₀ = NBA.",
      workingSubstitution: `NΦ₀ = ${turns} × ${magneticFieldT} × ${coilAreaM2}`,
    },
    {
      partId: "b",
      prompt: "Determine the peak emf ε₀ induced in the rotating coil.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "peakEmfV",
      truthValue: sol.peakEmfV,
      unit: "V",
      methodCriterion: "Multiplies NΦ₀ from (a) by ω = 2πf.",
      workingFormula: "ε₀ = NΦ₀(2πf).",
      workingSubstitution: `ε₀ = ${fmtNum(sol.peakFluxLinkageWbTurns)} × 2π × ${frequencyHz}`,
    },
    {
      partId: "c",
      prompt: `Calculate the instantaneous emf at t = ${fmtGiven(queryTimeS)} s.`,
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "emfAtQueryV",
      truthValue: sol.emfAtQueryV,
      unit: "V",
      methodCriterion: "Evaluates ε(t) = ε₀ sin(2πft) in radians.",
      workingFormula: "ε(t) = ε₀ sin(2πft).",
      workingSubstitution: `ε = ${fmtNum(sol.peakEmfV)} × sin(2π × ${frequencyHz} × ${fmtGiven(queryTimeS)})`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "standard",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Analyse peak flux linkage, peak emf, and instantaneous sinusoidal waveform of AC generator",
      [],
      [
        "part: calculate peak magnetic flux linkage",
        "part: determine peak induced emf from angular frequency",
        "part: evaluate instantaneous induced emf at specified time",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 10: ac-generator-rms-sinusoidal-power (A-Level Y13 ONLY)
// ============================================================================

const AC_RMS_CONTEXTS = [
  "standby hospital alternator feeding a resistive heater",
  "wind-turbine test generator driving a load bank",
  "aircraft auxiliary AC bus resistive test rig",
  "laboratory slip-ring alternator with ohmic load",
  "marine diesel-electric AC load-testing unit",
  "micro-grid synchronous generator bench",
] as const;

function buildArchetype10Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const turnsPool = [60, 100, 140, 180, 220, 280, 350];
  const areaPool = [0.008, 0.012, 0.016, 0.02, 0.025, 0.032];
  const bPool = [0.16, 0.22, 0.3, 0.38, 0.48];
  const freqPool = [25, 40, 50, 60, 80];
  const loadPool = [12, 16, 20, 25, 40, 50, 80];

  const turns = turnsPool[(variantIdx * 2) % turnsPool.length];
  const coilAreaM2 = areaPool[(variantIdx * 3 + 1) % areaPool.length];
  const magneticFieldT = bPool[(variantIdx * 2 + 1) % bPool.length];
  const frequencyHz = freqPool[variantIdx % freqPool.length];
  const loadResistanceOhm = loadPool[(variantIdx * 3) % loadPool.length];

  const spec: AcGeneratorSpec = {
    kind: "ac-generator",
    turns,
    coilAreaM2,
    magneticFieldT,
    frequencyHz,
    loadResistanceOhm,
    cyclesShown: 2,
  };
  const sol = solveEmInductionScenario(spec);
  if (
    sol.kind !== "ac-generator" ||
    sol.meanPowerW === undefined ||
    sol.peakPowerW === undefined ||
    sol.rmsCurrentA === undefined
  ) {
    throw new Error("Expected AC generator load solution");
  }

  const hiddenQuantities = [
    "angularSpeedRadS",
    "periodS",
    "peakFluxWb",
    "peakFluxLinkageWbTurns",
    "peakEmfV",
    "peakToPeakEmfV",
    "rmsVoltageV",
    "queryTimeS",
    "fluxAtQueryWb",
    "fluxLinkageAtQueryWbTurns",
    "emfAtQueryV",
    "peakCurrentA",
    "rmsCurrentA",
    "currentAtQueryA",
    "peakPowerW",
    "meanPowerW",
    "powerAtQueryW",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "turns", value: turns, source: "stem" },
    { name: "coilAreaM2", value: coilAreaM2, unit: "m²", source: "stem" },
    { name: "magneticFieldT", value: magneticFieldT, unit: "T", source: "stem" },
    { name: "frequencyHz", value: frequencyHz, unit: "Hz", source: "stem" },
    { name: "loadResistanceOhm", value: loadResistanceOhm, unit: "Ω", source: "stem" },
  ];
  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const app = AC_RMS_CONTEXTS[variantIdx % AC_RMS_CONTEXTS.length];

  const buildStem = (tail: string): string => {
    const f = variantIdx % 5;
    if (f === 0) {
      return `A ${app} uses a coil of negligible internal resistance with ${turns} turns and area ${fmtGiven(coilAreaM2)} m² spinning at ${frequencyHz} Hz in a uniform ${fmtGiven(magneticFieldT)} T magnetic field across a ${loadResistanceOhm} Ω resistor. ${tail}`.trim();
    }
    if (f === 1) {
      return `Across a pure ${loadResistanceOhm} Ω load in a ${app}, a coil of ${turns} turns and area ${fmtGiven(coilAreaM2)} m² (negligible coil resistance) rotates uniformly at ${frequencyHz} Hz inside a ${fmtGiven(magneticFieldT)} T magnetic field. ${tail}`.trim();
    }
    if (f === 2) {
      return `In a ${app}, a winding of ${turns} turns and cross-sectional area ${fmtGiven(coilAreaM2)} m² revolves at ${frequencyHz} Hz within a ${fmtGiven(magneticFieldT)} T field and supplies sinusoidal AC directly to a ${loadResistanceOhm} Ω resistive load. ${tail}`.trim();
    }
    if (f === 3) {
      return `During load testing on a ${app}, an ideal rotor coil (${turns} turns, area ${fmtGiven(coilAreaM2)} m²) turns at ${frequencyHz} Hz in a uniform ${fmtGiven(magneticFieldT)} T field while connected to a ${loadResistanceOhm} Ω resistor. ${tail}`.trim();
    }
    return `Connected via slip rings to a ${loadResistanceOhm} Ω load in a ${app}, an ideal coil of ${turns} turns and area ${fmtGiven(coilAreaM2)} m² rotates at ${frequencyHz} Hz in a uniform ${fmtGiven(magneticFieldT)} T magnetic field. ${tail}`.trim();
  };

  if (format === "mcq") {
    const subMode = variantIdx % 3;
    if (subMode === 0) {
      const stem = buildStem(
        "What mean electrical power is dissipated in the resistive load over a complete cycle?",
      );
      const mcq = buildMcqBundle(rng, sol.meanPowerW, "W", [
        {
          value: sol.peakPowerW / Math.SQRT2,
          rationale:
            "Divides peak power V₀I₀ by √2 instead of 2, forgetting that both V_rms = V₀/√2 and I_rms = I₀/√2 contribute a 1/√2 factor.",
        },
        {
          value: sol.peakPowerW,
          rationale:
            "Calculates peak instantaneous power V₀²/R without applying the ½ sinusoidal average factor.",
        },
        {
          value: sol.peakPowerW / 4,
          rationale:
            "Divides V₀ by 2 instead of √2 before squaring in V_rms²/R, introducing a ¼ factor.",
        },
      ]);
      const ans = fmtQty(sol.meanPowerW, "W");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "higher",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Compute mean resistive AC power from rotating-coil sinusoidal generator",
          [
            "dividing peak power by root-two instead of half",
            "reporting peak instantaneous power instead of cycle mean power",
            "halving peak voltage before squaring instead of dividing by root-two",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "meanPowerW",
        workedSolution: `Peak emf ε₀ = 2πfNBA = ${fmtQty(sol.peakEmfV, "V")}; V_rms = ε₀ / √2 = ${fmtQty(sol.rmsVoltageV, "V")}. Mean resistive power P_mean = V_rms² / R = ½ ε₀² / R = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes ε₀ = 2πfNBA and mean power P_mean = ½ε₀²/R = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      const stem = buildStem(
        "What is the root-mean-square (rms) potential difference across the load?",
      );
      const mcq = buildMcqBundle(rng, sol.rmsVoltageV, "V", [
        {
          value: sol.peakEmfV / 2,
          rationale:
            "Divides peak emf ε₀ by 2 (confusing the ½ power factor with the 1/√2 rms voltage factor).",
        },
        {
          value: sol.peakEmfV,
          rationale:
            "Stops at peak emf ε₀ = 2πfNBA without dividing by √2.",
        },
        {
          value: sol.peakEmfV * Math.SQRT2,
          rationale:
            "Multiplies peak emf ε₀ by √2 instead of dividing by √2.",
        },
      ]);
      const ans = fmtQty(sol.rmsVoltageV, "V");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Evaluate root-mean-square terminal voltage of sinusoidal AC generator",
          [
            "dividing peak voltage by two instead of root-two",
            "reporting peak amplitude instead of rms value",
            "multiplying peak amplitude by root-two",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "rmsVoltageV",
        workedSolution: `Peak emf ε₀ = 2πfNBA = 2π(${frequencyHz})(${turns})(${magneticFieldT})(${coilAreaM2}) = ${fmtQty(sol.peakEmfV, "V")}. Therefore V_rms = ε₀ / √2 = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds ε₀ = 2πfNBA and divides by √2 to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildStem(
      "What root-mean-square (rms) current flows through the load resistor?",
    );
    const mcq = buildMcqBundle(rng, sol.rmsCurrentA, "A", [
      {
        value: sol.peakEmfV / loadResistanceOhm,
        rationale:
          "Calculates peak current I₀ = ε₀/R and omits dividing by √2 for rms current.",
      },
      {
        value: sol.peakEmfV / (2 * loadResistanceOhm),
        rationale:
          "Divides peak current I₀ by 2 instead of √2.",
      },
      {
        value: (turns * magneticFieldT * coilAreaM2 * frequencyHz) / (Math.SQRT2 * loadResistanceOhm),
        rationale:
          "Omits the 2π factor when converting frequency f into angular speed ω = 2πf.",
      },
    ]);
    const ans = fmtQty(sol.rmsCurrentA, "A");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "standard",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Determine root-mean-square alternating current delivered to resistive load",
        [
          "reporting peak current without root-two scaling",
          "dividing peak current by two instead of root-two",
          "omitting two-pi angular frequency conversion",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "rmsCurrentA",
      workedSolution: `ε₀ = 2πfNBA = ${fmtQty(sol.peakEmfV, "V")}, so V_rms = ε₀ / √2 = ${fmtQty(sol.rmsVoltageV, "V")}. Load rms current I_rms = V_rms / R = ${fmtNum(sol.rmsVoltageV)} / ${loadResistanceOhm} = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates I_rms = 2πfNBA / (√2 R) = ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured AC RMS power item
  const stem = buildStem("");
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: "Calculate the peak emf ε₀ induced in the rotating coil.",
      marks: 2,
      targetQuantityKey: "peakEmfV",
      truthValue: sol.peakEmfV,
      unit: "V",
      methodCriterion: "Applies ε₀ = 2πfNBA.",
      workingFormula: "ε₀ = 2πfNBA.",
      workingSubstitution: `ε₀ = 2π × ${frequencyHz} × ${turns} × ${magneticFieldT} × ${coilAreaM2}`,
    },
    {
      partId: "b",
      prompt: "Determine the rms current in the resistive load.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "rmsCurrentA",
      truthValue: sol.rmsCurrentA,
      unit: "A",
      methodCriterion: "Uses I_rms = ε₀ / (√2 R).",
      workingFormula: "I_rms = ε₀ / (√2 R).",
      workingSubstitution: `I_rms = ${fmtNum(sol.peakEmfV)} / (√2 × ${loadResistanceOhm})`,
    },
    {
      partId: "c",
      prompt: "Calculate the mean electrical power dissipated in the load.",
      marks: 2,
      dependsOnPartIds: ["a", "b"],
      targetQuantityKey: "meanPowerW",
      truthValue: sol.meanPowerW,
      unit: "W",
      methodCriterion: "Applies P_mean = I_rms² R (= ½ ε₀ I₀).",
      workingFormula: "P_mean = I_rms² R.",
      workingSubstitution: `P_mean = (${fmtNum(sol.rmsCurrentA)})² × ${loadResistanceOhm}`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "higher",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Multi-step calculation of rotating-coil peak emf, rms load current, and cycle-mean power",
      [],
      [
        "part: calculate peak sinusoidal emf",
        "part: convert to rms load current",
        "part: evaluate mean electrical power dissipated",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 11: transformer-turns-ratio-and-efficiency (A-Level Y13 + NCUK IFY-S2)
// ============================================================================

const TRANSFORMER_CONTEXTS = [
  "substation distribution transformer",
  "rack-mounted server isolation-stepdown unit",
  "hospital X-ray filament supply transformer",
  "arc-welding laminated-core transformer",
  "railway signalling trackside transformer",
  "solar micro-inverter grid-coupling transformer",
  "laboratory bench variac step-down core",
] as const;

function buildArchetype11Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const vpPool = [110, 120, 200, 230, 240, 400, 500];
  const npPool = [300, 400, 500, 800, 1000, 1200, 1600];
  // Strictly non-unity ratios so Ns != Np!
  const ratioPool = [0.05, 0.08, 0.1, 0.2, 0.25, 0.4, 2.0, 2.5, 4.0];
  const etaPool = [0.8, 0.85, 0.88, 0.9, 0.92, 0.95, 0.96];
  const rLoadPool = [6, 8, 12, 16, 24, 32, 48];

  const primaryVoltageRmsV = vpPool[variantIdx % vpPool.length];
  const primaryTurns = npPool[(variantIdx * 2 + 1) % npPool.length];
  const ratio = ratioPool[(variantIdx * 3) % ratioPool.length];
  const secondaryTurns = Math.round(primaryTurns * ratio);
  const efficiency = etaPool[(variantIdx * 2) % etaPool.length];
  const loadResistanceOhm = rLoadPool[(variantIdx * 3 + 1) % rLoadPool.length];

  const spec: TransformerSpec = {
    kind: "transformer",
    primaryVoltageRmsV,
    primaryTurns,
    secondaryTurns,
    efficiency,
    loadResistanceOhm,
  };
  const sol = solveEmInductionScenario(spec);
  if (
    sol.kind !== "transformer" ||
    sol.primaryCurrentRmsA === undefined ||
    sol.inputPowerW === undefined ||
    sol.outputPowerW === undefined ||
    sol.powerLossW === undefined
  ) {
    throw new Error("Expected loaded transformer solution");
  }

  const hiddenQuantities = [
    "turnsRatio",
    "primaryVoltagePeakV",
    "secondaryVoltageRmsV",
    "secondaryVoltagePeakV",
    "secondaryCurrentRmsA",
    "primaryCurrentRmsA",
    "inputPowerW",
    "outputPowerW",
    "powerLossW",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "primaryVoltageRmsV", value: primaryVoltageRmsV, unit: "V", source: "stem" },
    { name: "primaryTurns", value: primaryTurns, source: "stem" },
    { name: "secondaryTurns", value: secondaryTurns, source: "stem" },
    { name: "efficiency", value: efficiency, source: "stem" },
    { name: "loadResistanceOhm", value: loadResistanceOhm, unit: "Ω", source: "stem" },
  ];
  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const app = TRANSFORMER_CONTEXTS[variantIdx % TRANSFORMER_CONTEXTS.length];
  const etaPct = Number((efficiency * 100).toPrecision(3));

  const buildStem = (tail: string): string => {
    const f = variantIdx % 6;
    if (f === 0) {
      return `A ${app} with ${primaryTurns} primary turns and ${secondaryTurns} secondary turns operates at an efficiency of ${efficiency} (${etaPct}%) from a ${primaryVoltageRmsV} V rms AC supply while driving a ${loadResistanceOhm} Ω resistive secondary load. ${tail}`.trim();
    }
    if (f === 1) {
      return `Connected to a ${primaryVoltageRmsV} V rms AC mains line, a ${app} (${primaryTurns} primary turns, ${secondaryTurns} secondary turns, efficiency ${efficiency} or ${etaPct}%) feeds a pure ${loadResistanceOhm} Ω resistor across its secondary winding. ${tail}`.trim();
    }
    if (f === 2) {
      return `In a ${app} having primary winding N_p = ${primaryTurns} and secondary winding N_s = ${secondaryTurns}, a ${primaryVoltageRmsV} V rms input drives a ${loadResistanceOhm} Ω secondary load at overall power efficiency η = ${efficiency} (${etaPct}%). ${tail}`.trim();
    }
    if (f === 3) {
      return `During thermal-loss testing of a ${app}, a ${primaryVoltageRmsV} V rms primary supply energises ${primaryTurns} primary turns coupled to ${secondaryTurns} secondary turns across a ${loadResistanceOhm} Ω load with efficiency η = ${efficiency} (${etaPct}%). ${tail}`.trim();
    }
    if (f === 4) {
      return `Across a ${loadResistanceOhm} Ω secondary load, a ${app} (${primaryTurns} primary turns, ${secondaryTurns} secondary turns) transfers AC power from a ${primaryVoltageRmsV} V rms source at efficiency ${efficiency} (${etaPct}%). ${tail}`.trim();
    }
    return `Operating at η = ${efficiency} (${etaPct}%) efficiency from a ${primaryVoltageRmsV} V rms AC source, a laminated-core ${app} has N_p = ${primaryTurns} turns, N_s = ${secondaryTurns} turns, and a ${loadResistanceOhm} Ω secondary load resistor. ${tail}`.trim();
  };

  if (format === "mcq") {
    const subMode = variantIdx % 3;
    if (subMode === 0) {
      const stem = buildStem(
        "What rms current is drawn from the primary AC supply?",
      );
      const idealIp = sol.outputPowerW / primaryVoltageRmsV;
      const invertedVs = (primaryVoltageRmsV * primaryTurns) / secondaryTurns;
      const invertedPout = invertedVs ** 2 / loadResistanceOhm;
      const mcq = buildMcqBundle(rng, sol.primaryCurrentRmsA, "A", [
        {
          value: idealIp,
          rationale:
            "Assumes an ideal 100% efficient transformer (I_p = V_s I_s / V_p) and ignores core/winding losses.",
        },
        {
          value: idealIp * efficiency,
          rationale:
            "Multiplies ideal primary current by efficiency η instead of dividing by η, making P_in < P_out.",
        },
        {
          value: invertedPout / (efficiency * primaryVoltageRmsV),
          rationale:
            "Inverts the transformer turns ratio as V_s = V_p(N_p/N_s) instead of V_p(N_s/N_p).",
        },
      ]);
      const ans = fmtQty(sol.primaryCurrentRmsA, "A");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "higher",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Determine primary rms current in non-ideal loaded transformer",
          [
            "assuming ideal unity efficiency",
            "multiplying output power by efficiency instead of dividing",
            "inverting primary-to-secondary turns ratio",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "primaryCurrentRmsA",
        workedSolution: `Secondary rms voltage V_s = V_p(N_s/N_p) = ${primaryVoltageRmsV}(${secondaryTurns}/${primaryTurns}) = ${fmtQty(sol.secondaryVoltageRmsV, "V")}. Output power P_out = V_s² / R_L = ${fmtQty(sol.outputPowerW, "W")}. Input power P_in = P_out / η = ${fmtQty(sol.inputPowerW, "W")}, so I_p = P_in / V_p = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes V_s, P_out, and I_p = P_out / (η V_p) = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      const stem = buildStem(
        "What is the rms potential difference induced across the secondary winding?",
      );
      const mcq = buildMcqBundle(rng, sol.secondaryVoltageRmsV, "V", [
        {
          value: (primaryVoltageRmsV * primaryTurns) / secondaryTurns,
          rationale:
            "Inverts the transformer turns ratio and calculates V_p(N_p/N_s) instead of V_p(N_s/N_p).",
        },
        {
          value: sol.secondaryVoltagePeakV,
          rationale:
            "Multiplies by √2 and reports peak secondary voltage rather than rms secondary voltage.",
        },
        {
          value: sol.secondaryVoltageRmsV / Math.SQRT2,
          rationale:
            "Divides an already-rms primary voltage by √2 a second time.",
        },
      ]);
      const ans = fmtQty(sol.secondaryVoltageRmsV, "V");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "foundation",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Calculate secondary rms voltage from transformer turns ratio",
          [
            "inverting secondary-to-primary turns ratio",
            "converting rms voltage erroneously to peak voltage",
            "dividing rms voltage by root-two again",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "secondaryVoltageRmsV",
        workedSolution: `Using V_s / V_p = N_s / N_p gives V_s = ${primaryVoltageRmsV} × (${secondaryTurns} / ${primaryTurns}) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies V_s = V_p(N_s/N_p) = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildStem(
      "What mean thermal power is wasted in the transformer core and windings?",
    );
    const mcq = buildMcqBundle(rng, sol.powerLossW, "W", [
      {
        value: (1 - efficiency) * sol.outputPowerW,
        rationale:
          "Applies loss fraction (1 − η) to secondary output power P_out instead of primary input power P_in = P_out/η.",
      },
      {
        value: sol.outputPowerW,
        rationale:
          "Reports the useful secondary load power P_out rather than the wasted power P_in − P_out.",
      },
      {
        value: sol.inputPowerW,
        rationale:
          "Reports total primary input power P_in instead of subtracting P_out.",
      },
    ]);
    const ans = fmtQty(sol.powerLossW, "W");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "higher",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Evaluate thermal power loss in non-ideal loaded transformer",
        [
          "multiplying output power instead of input power by loss fraction",
          "reporting secondary output power instead of wasted power",
          "reporting total input power instead of wasted power",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "powerLossW",
      workedSolution: `V_s = ${fmtQty(sol.secondaryVoltageRmsV, "V")}; P_out = V_s² / R_L = ${fmtQty(sol.outputPowerW, "W")}. Input power P_in = P_out / η = ${fmtQty(sol.inputPowerW, "W")}, so power loss P_loss = P_in − P_out = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates P_in = P_out/η and P_loss = P_in − P_out = ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured transformer item
  const stem = buildStem("");
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: "Calculate the rms voltage across the secondary winding.",
      marks: 2,
      targetQuantityKey: "secondaryVoltageRmsV",
      truthValue: sol.secondaryVoltageRmsV,
      unit: "V",
      methodCriterion: "Applies turns-ratio equation V_s = V_p(N_s/N_p).",
      workingFormula: "V_s = V_p (N_s / N_p).",
      workingSubstitution: `V_s = ${primaryVoltageRmsV} × (${secondaryTurns} / ${primaryTurns})`,
    },
    {
      partId: "b",
      prompt: "Determine the useful electrical power delivered to the secondary load.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "outputPowerW",
      truthValue: sol.outputPowerW,
      unit: "W",
      methodCriterion: "Uses P_out = V_s² / R_L.",
      workingFormula: "P_out = V_s² / R_L.",
      workingSubstitution: `P_out = (${fmtNum(sol.secondaryVoltageRmsV)})² / ${loadResistanceOhm}`,
    },
    {
      partId: "c",
      prompt: "Calculate the rms current drawn from the primary supply.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "primaryCurrentRmsA",
      truthValue: sol.primaryCurrentRmsA,
      unit: "A",
      methodCriterion: "Uses P_in = P_out / η and I_p = P_in / V_p.",
      workingFormula: "I_p = P_out / (η V_p).",
      workingSubstitution: `I_p = ${fmtNum(sol.outputPowerW)} / (${efficiency} × ${primaryVoltageRmsV})`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "standard",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Analyse secondary rms voltage, output load power, and primary current in non-ideal transformer",
      [],
      [
        "part: calculate secondary rms voltage from turns ratio",
        "part: compute useful power delivered to secondary resistor",
        "part: determine primary rms supply current accounting for efficiency",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 12: uniform-plate-parabolic-deflection (IB SL/HL + A-Level Y13 + NCUK IFY-S2)
// ============================================================================

const DEFLECTION_CONTEXTS = [
  "electrostatic cathode-ray oscilloscope tube",
  "inkjet micro-droplet deflection stage",
  "time-of-flight ion-beam steerer",
  "electron-beam lithography electrostatic deflector",
  "vacuum beam-diagnostics parallel-plate cell",
  "electrostatic particle-beam chopper",
  "mass-spectrometer pre-filter electrostatic prism",
  "high-speed streak-camera sweep plates",
  "nanofabrication focused-beam blanking stage",
  "synchrotron injector electrostatic kicker",
  "photoelectron spectrometer deflection channel",
] as const;

function buildArchetype12Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const isElectron = variantIdx % 2 === 0;
  const chargeC = isElectron ? -ELEMENTARY_CHARGE_C : ELEMENTARY_CHARGE_C;
  const massKg = isElectron ? ELECTRON_MASS_KG : PROTON_MASS_KG;
  const particleName = isElectron ? "electron" : "proton";
  const chargeText = isElectron ? "−1.60 × 10⁻¹⁹ C" : "+1.60 × 10⁻¹⁹ C";
  const massText = isElectron ? "9.11 × 10⁻³¹ kg" : "1.67 × 10⁻²⁷ kg";

  const lengths = [0.04, 0.05, 0.06, 0.075, 0.08, 0.09];
  const seps = [0.04, 0.05, 0.06];
  const speeds = isElectron
    ? [1.4e7, 1.6e7, 1.8e7, 2.0e7, 2.2e7]
    : [3.0e5, 3.6e5, 4.2e5, 5.0e5, 5.8e5];
  const gapFractions = [0.55, 0.62, 0.68, 0.74, 0.8];

  const plateLengthM = lengths[variantIdx % lengths.length];
  const plateSeparationM = seps[(variantIdx * 2 + 1) % seps.length];
  const initialSpeedMs = speeds[(variantIdx * 3) % speeds.length];
  const frac = gapFractions[(variantIdx * 2) % gapFractions.length];
  // y_exit = ½ (|q|V / m d)(L / v0)^2 = frac * (d / 2) => V = frac * m d^2 v0^2 / (|q| L^2), strictly < d/2!
  const rawV =
    (frac * massKg * plateSeparationM ** 2 * initialSpeedMs ** 2) /
    (Math.abs(chargeC) * plateLengthM ** 2);
  const plateVoltageV = Number(rawV.toPrecision(3));
  const topPlatePolarity: PlatePolarity =
    variantIdx % 3 === 0 ? "negative" : "positive";

  const spec: ElectricDeflectionSpec = {
    kind: "electric-deflection",
    chargeC,
    massKg,
    initialSpeedMs,
    plateLengthM,
    plateSeparationM,
    plateVoltageV,
    topPlatePolarity,
  };
  const sol = solveEmInductionScenario(spec);
  if (sol.kind !== "electric-deflection" || sol.hitsPlate) {
    throw new Error("Expected non-colliding electric deflection solution");
  }

  const hiddenQuantities = [
    "electricFieldVm",
    "electricForceMagnitudeN",
    "accelerationMagnitudeMs2",
    "transitTimeS",
    "exitYM",
    "plateDeflectionYM",
    "signedPlateDeflectionYM",
    "exitVyMs",
    "exitSpeedMs",
    "deflectionAngleDegrees",
    "signedDeflectionAngleDegrees",
    "kineticEnergyGainJ",
    "screenYM",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "chargeC", value: chargeC, unit: "C", source: "stem" },
    { name: "massKg", value: massKg, unit: "kg", source: "stem" },
    { name: "initialSpeedMs", value: initialSpeedMs, unit: "m s⁻¹", source: "stem" },
    { name: "plateLengthM", value: plateLengthM, unit: "m", source: "stem" },
    { name: "plateSeparationM", value: plateSeparationM, unit: "m", source: "stem" },
    { name: "plateVoltageV", value: plateVoltageV, unit: "V", source: "stem" },
  ];
  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const app = DEFLECTION_CONTEXTS[variantIdx % DEFLECTION_CONTEXTS.length];

  const buildStem = (tail: string): string => {
    const f = variantIdx % 13;
    const v0Str = `${fmtNum(initialSpeedMs)} m s⁻¹`;
    const vpStr = `${fmtGiven(plateVoltageV)} V`;
    const lStr = `${fmtGiven(plateLengthM)} m`;
    const dStr = `${fmtGiven(plateSeparationM)} m`;
    switch (f) {
      case 0:
        return `In a ${app}, a ${particleName} (charge ${chargeText}, mass ${massText}) enters horizontally at ${v0Str} along the midplane between parallel deflecting plates of length ${lStr} and separation ${dStr} maintained at ${vpStr} (neglecting gravity). ${tail}`.trim();
      case 1:
        return `Travelling at an initial horizontal speed of ${v0Str}, a ${particleName} (q = ${chargeText}, m = ${massText}) passes centrally between parallel plates of length ${lStr} spaced ${dStr} apart across a ${vpStr} potential difference in a ${app}. ${tail}`.trim();
      case 2:
        return `Parallel plates of length ${lStr} and gap ${dStr} in a ${app} are held at ${vpStr}. A ${particleName} of charge ${chargeText} and mass ${massText} enters midway between the plates parallel to their surfaces at ${v0Str}. ${tail}`.trim();
      case 3:
        return `During calibration of a ${app}, a collimated ${particleName} beam (charge ${chargeText}, mass ${massText}) enters at ${v0Str} along the central axis of ${lStr} long parallel electrodes separated by ${dStr} at p.d. ${vpStr}. ${tail}`.trim();
      case 4:
        return `Within an evacuated ${app}, a ${vpStr} supply energises parallel plates of length ${lStr} and spacing ${dStr} while a ${particleName} (charge ${chargeText}, mass ${massText}) enters horizontally at ${v0Str}. ${tail}`.trim();
      case 5:
        return `A ${particleName} with charge ${chargeText} and mass ${massText} is injected horizontally at ${v0Str} into the uniform field of a ${app} having plate length ${lStr}, plate separation ${dStr}, and applied voltage ${vpStr}. ${tail}`.trim();
      case 6:
        return `Across a ${dStr} vacuum gap of length ${lStr} inside a ${app}, a steady voltage of ${vpStr} deflects a horizontally incident ${particleName} (charge ${chargeText}, mass ${massText}, entry speed ${v0Str}). ${tail}`.trim();
      case 7:
        return `Neglecting gravitational forces in a ${app}, an isolated ${particleName} of mass ${massText} and charge ${chargeText} shoots at ${v0Str} midway between two ${lStr} flat electrodes held ${dStr} apart at ${vpStr}. ${tail}`.trim();
      case 8:
        return `Two flat conducting electrodes in a ${app} measure ${lStr} in length, sit ${dStr} apart, and carry ${vpStr} between them as a ${particleName} (${chargeText}, ${massText}) enters parallel to the plates at ${v0Str}. ${tail}`.trim();
      case 9:
        return `Entering along the symmetry plane at ${v0Str}, a ${particleName} of charge ${chargeText} and mass ${massText} traverses a uniform transverse electric field created by ${vpStr} across ${lStr} plates separated by ${dStr} in a ${app}. ${tail}`.trim();
      case 10:
        return `An engineer operates a ${app} with ${vpStr} applied across parallel steering plates of length ${lStr} and separation ${dStr}; each ${particleName} (${chargeText}, ${massText}) enters horizontally at ${v0Str}. ${tail}`.trim();
      case 11:
        return `Projected horizontally into a ${app} at speed ${v0Str}, a ${particleName} (mass ${massText}, charge ${chargeText}) experiences the uniform field between ${lStr} parallel plates spaced ${dStr} apart at ${vpStr}. ${tail}`.trim();
      default:
        return `Inside the vacuum chamber of a ${app}, electrodes ${lStr} long and ${dStr} apart are biased at ${vpStr} while a ${particleName} (q = ${chargeText}, m = ${massText}) enters centrally at ${v0Str}. ${tail}`.trim();
    }
  };

  if (format === "mcq") {
    const subMode = variantIdx % 3;
    const absDy = Math.abs(sol.plateDeflectionYM);
    const absAngle = Math.abs(sol.deflectionAngleDegrees);

    if (subMode === 0) {
      const stem = buildStem(
        "What is the magnitude of the transverse deflection as the particle exits the plates?",
      );
      const mcq = buildMcqBundle(rng, absDy, "m", [
        {
          value: 2 * absDy,
          rationale:
            "Omits the kinematic factor of one-half in |Δy| = ½ a_y t².",
        },
        {
          value: (Math.abs(sol.accelerationYMs2) * plateLengthM) / initialSpeedMs,
          rationale:
            "Multiplies acceleration a_y by transit time t once (computing |v_y| instead of ½ a_y t²).",
        },
        {
          value: absDy * plateSeparationM ** 2,
          rationale:
            "Multiplies V by d instead of dividing V by d when finding electric field E = V/d.",
        },
      ]);
      const ans = fmtQty(absDy, "m");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Calculate parabolic transverse deflection of charged particle exiting uniform electric plates",
          [
            "forgetting half factor in constant-acceleration displacement",
            "computing transverse exit velocity instead of displacement",
            "multiplying instead of dividing by plate separation",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "plateDeflectionYM",
        workedSolution: `Transit time t = L / v₀ = ${plateLengthM} / ${fmtNum(initialSpeedMs)} = ${fmtQty(sol.transitTimeS, "s")}. Transverse acceleration a_y = |q|V / (md) = ${fmtQty(Math.abs(sol.accelerationYMs2), "m s⁻²")}. Deflection |Δy| = ½ a_y t² = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates t = L/v₀, a_y = |q|V/(md), and |Δy| = ½a_y t² = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      const stem = buildStem(
        "What is the angular deflection θ (in degrees) of the particle velocity as it leaves the plates?",
      );
      const secantAngleDeg = (Math.atan2(absDy, plateLengthM) * 180) / Math.PI;
      const radAngle = Math.abs(sol.deflectionAngleRadians);
      const mcq = buildMcqBundle(rng, absAngle, "°", [
        {
          value: secantAngleDeg,
          rationale:
            "Calculates arctan(|Δy|/L) from the chord instead of arctan(|v_y|/v₀) = arctan(2|Δy|/L) from velocity components.",
        },
        {
          value: radAngle,
          rationale:
            "Leaves arctan(|v_y|/v₀) in radians instead of converting to degrees.",
        },
        {
          value: 90 - absAngle,
          rationale:
            "Inverts the velocity ratio as arctan(v₀/|v_y|), measuring the complement to the vertical.",
        },
      ]);
      const ans = fmtQty(absAngle, "°");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "higher",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Determine exit deflection angle of charged particle from velocity components",
          [
            "using displacement-over-length secant ratio instead of exit velocity ratio",
            "reporting radian value instead of degree value",
            "inverting horizontal and vertical velocity components",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "deflectionAngleDegrees",
        workedSolution: `|v_y| = a_y t = (|q|V / md)(L / v₀) = ${fmtQty(Math.abs(sol.exitVyMs), "m s⁻¹")}. Therefore θ = arctan(|v_y| / v₀) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds |v_y| and evaluates θ = arctan(|v_y|/v₀) = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildStem(
      "What is the resultant speed of the particle as it emerges from the plates?",
    );
    const absVy = Math.abs(sol.exitVyMs);
    const fullGapSpeed = Math.sqrt(
      initialSpeedMs ** 2 + (2 * Math.abs(chargeC) * plateVoltageV) / massKg,
    );
    const mcq = buildMcqBundle(rng, sol.exitSpeedMs, "m s⁻¹", [
      {
        value: initialSpeedMs + absVy,
        rationale:
          "Adds horizontal and vertical velocity magnitudes algebraically (v₀ + |v_y|) instead of applying Pythagoras √(v₀² + v_y²).",
      },
      {
        value: absVy,
        rationale:
          "Reports only the transverse velocity component |v_y| acquired between the plates and omits v₀.",
      },
      {
        value: fullGapSpeed,
        rationale:
          "Assumes the particle falls across the full plate potential difference |q|V rather than |q|E|Δy|.",
      },
    ]);
    const ans = fmtQty(sol.exitSpeedMs, "m s⁻¹");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "higher",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Evaluate resultant exit speed of charged particle combining horizontal and transverse velocity components",
        [
          "adding orthogonal velocity components linearly instead of quadrature",
          "reporting transverse exit velocity component only",
          "assuming particle traverses entire plate potential difference",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "exitSpeedMs",
      workedSolution: `Exit transverse speed |v_y| = (|q|VL)/(md v₀) = ${fmtQty(absVy, "m s⁻¹")}. Resultant speed v_exit = √(v₀² + v_y²) = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates |v_y| and combines orthogonally v_exit = √(v₀² + v_y²) = ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured electric deflection
  const stem = buildStem("").replace(/,\s*$/, ".");
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt:
        "Calculate the magnitude of the transverse acceleration of the particle between the plates.",
      marks: 2,
      targetQuantityKey: "accelerationMagnitudeMs2",
      truthValue: Math.abs(sol.accelerationYMs2),
      unit: "m s⁻²",
      methodCriterion: "Uses E = V/d and a = |q|E / m.",
      workingFormula: "a = |q|V / (md).",
      workingSubstitution: `a = (${fmtNum(Math.abs(chargeC))} × ${plateVoltageV}) / (${fmtNum(massKg)} × ${plateSeparationM})`,
    },
    {
      partId: "b",
      prompt:
        "Determine the magnitude of the vertical deflection at the exit edge of the plates.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "plateDeflectionYM",
      truthValue: Math.abs(sol.plateDeflectionYM),
      unit: "m",
      methodCriterion: "Finds transit time t = L/v₀ and applies |Δy| = ½ a t².",
      workingFormula: "t = L / v₀; |Δy| = ½ a t².",
      workingSubstitution: `|Δy| = 0.5 × ${fmtNum(Math.abs(sol.accelerationYMs2))} × (${plateLengthM} / ${fmtNum(initialSpeedMs)})²`,
    },
    {
      partId: "c",
      prompt:
        "Calculate the deflection angle (in degrees) of the emerging velocity relative to the initial direction.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "deflectionAngleDegrees",
      truthValue: Math.abs(sol.deflectionAngleDegrees),
      unit: "°",
      methodCriterion: "Evaluates |v_y| = a t and θ = arctan(|v_y| / v₀).",
      workingFormula: "|v_y| = a(L / v₀), θ = arctan(|v_y| / v₀).",
      workingSubstitution: `θ = arctan(${fmtNum(Math.abs(sol.exitVyMs))} / ${fmtNum(initialSpeedMs)})`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "standard",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Analyse transverse acceleration, parabolic plate deflection, and exit angle in uniform E-field",
      [],
      [
        "part: calculate transverse electrostatic acceleration",
        "part: determine parabolic vertical displacement at exit",
        "part: deduce emergence angle from velocity components",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 13: cyclotron-circular-orbit-radius-period
// ============================================================================

const CYCLOTRON_CONTEXTS = [
  "fine-beam Helmholtz tube",
  "medical radioisotope cyclotron chamber",
  "bubble-chamber momentum analyser",
  "synchrotron dipole bending sector",
  "auroral plasma simulation chamber",
  "penning-trap transverse magnetron rig",
  "proton-therapy gantry bending magnet",
  "storage-ring magnetic spectrometer arc",
  "space-radiation geomagnetic trap simulator",
  "high-vacuum Lorentz curvature cell",
  "positron-emission cyclotron target injector",
] as const;

interface SpeciesSpec {
  readonly label: string;
  readonly chargeC: number;
  readonly chargeText: string;
  readonly massKg: number;
  readonly massText: string;
  readonly fieldsT: readonly number[];
  readonly speedsMs: readonly number[];
}

const CYCLOTRON_SPECIES: readonly SpeciesSpec[] = [
  {
    label: "electron",
    chargeC: -ELEMENTARY_CHARGE_C,
    chargeText: "−1.60 × 10⁻¹⁹ C",
    massKg: ELECTRON_MASS_KG,
    massText: "9.11 × 10⁻³¹ kg",
    fieldsT: [1.5e-3, 2.4e-3, 3.5e-3, 4.8e-3, 6.4e-3],
    speedsMs: [8.0e6, 1.2e7, 1.5e7, 2.1e7, 2.6e7],
  },
  {
    label: "proton",
    chargeC: ELEMENTARY_CHARGE_C,
    chargeText: "+1.60 × 10⁻¹⁹ C",
    massKg: PROTON_MASS_KG,
    massText: "1.67 × 10⁻²⁷ kg",
    fieldsT: [0.16, 0.25, 0.35, 0.48, 0.64],
    speedsMs: [1.8e6, 2.6e6, 3.4e6, 4.5e6, 5.6e6],
  },
  {
    label: "alpha particle",
    chargeC: 3.2e-19,
    chargeText: "+3.20 × 10⁻¹⁹ C",
    massKg: 6.64e-27,
    massText: "6.64 × 10⁻²⁷ kg",
    fieldsT: [0.22, 0.32, 0.45, 0.6, 0.8],
    speedsMs: [1.5e6, 2.2e6, 3.0e6, 4.2e6, 5.2e6],
  },
];

function buildArchetype13Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const sp = CYCLOTRON_SPECIES[variantIdx % CYCLOTRON_SPECIES.length];
  const magneticFieldT = sp.fieldsT[(variantIdx * 2 + 1) % sp.fieldsT.length];
  const speedMs = sp.speedsMs[(variantIdx * 3) % sp.speedsMs.length];
  const fieldDirection: MagneticFieldPageDirection =
    variantIdx % 2 === 0 ? "into-page" : "out-of-page";

  const spec: MagneticCyclotronSpec = {
    kind: "magnetic-cyclotron",
    chargeC: sp.chargeC,
    massKg: sp.massKg,
    magneticFieldT,
    fieldDirection,
    speedMs,
    arcSweepDegrees: 180,
  };
  const sol = solveEmInductionScenario(spec);
  if (sol.kind !== "magnetic-cyclotron") throw new Error("Expected cyclotron solution");

  const hiddenQuantities = [
    "acceleratingVoltageV",
    "magneticForceMagnitudeN",
    "centripetalAccelerationMs2",
    "cyclotronRadiusM",
    "orbitDiameterM",
    "periodS",
    "frequencyHz",
    "angularSpeedRadS",
    "specificChargeCPerKg",
    "kineticEnergyJ",
    "kineticEnergyEv",
    "arcTimeS",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "chargeC", value: sp.chargeC, unit: "C", source: "stem" },
    { name: "massKg", value: sp.massKg, unit: "kg", source: "stem" },
    { name: "magneticFieldT", value: magneticFieldT, unit: "T", source: "stem" },
    { name: "speedMs", value: speedMs, unit: "m s⁻¹", source: "stem" },
  ];
  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const app = CYCLOTRON_CONTEXTS[variantIdx % CYCLOTRON_CONTEXTS.length];
  const bDirPhrase =
    fieldDirection === "into-page" ? "directed into the page" : "directed out of the page";

  const buildStem = (tail: string): string => {
    const f = variantIdx % 13;
    const bStr = `${fmtNum(magneticFieldT)} T`;
    const vStr = `${fmtNum(speedMs)} m s⁻¹`;
    switch (f) {
      case 0:
        return `Inside a ${app}, a ${sp.label} (charge ${sp.chargeText}, mass ${sp.massText}) enters at ${vStr} perpendicular to a uniform ${bStr} magnetic field ${bDirPhrase} and follows a circular arc. ${tail}`.trim();
      case 1:
        return `A uniform ${bStr} magnetic field (${bDirPhrase}) fills a ${app}. Entering at right angles to the field with speed ${vStr}, a single ${sp.label} of charge ${sp.chargeText} and mass ${sp.massText} curves along a circular trajectory. ${tail}`.trim();
      case 2:
        return `Injected orthogonally at ${vStr} into the ${bStr} magnetic field (${bDirPhrase}) of a ${app}, a ${sp.label} (q = ${sp.chargeText}, m = ${sp.massText}) undergoes uniform circular motion in vacuum. ${tail}`.trim();
      case 3:
        return `During a beam run in a ${app}, a ${sp.label} carrying charge ${sp.chargeText} and mass ${sp.massText} moves at ${vStr} normal to a ${bStr} field ${bDirPhrase}. ${tail}`.trim();
      case 4:
        return `Within the evacuated ${app}, a perpendicular magnetic field of flux density ${bStr} (${bDirPhrase}) bends a ${sp.label} (charge ${sp.chargeText}, mass ${sp.massText}) travelling at ${vStr}. ${tail}`.trim();
      case 5:
        return `Moving at ${vStr} perpendicular to a uniform ${bStr} magnetic field ${bDirPhrase} inside a ${app}, a ${sp.label} (charge ${sp.chargeText}, mass ${sp.massText}) traces a circular orbit. ${tail}`.trim();
      case 6:
        return `Magnetic flux of density ${bStr} (${bDirPhrase}) pervades the vacuum region of a ${app} where a ${sp.label} of mass ${sp.massText} and charge ${sp.chargeText} circulates at constant speed ${vStr} normal to the field lines. ${tail}`.trim();
      case 7:
        return `An experimenter fires a ${sp.label} (${sp.chargeText}, ${sp.massText}) at speed ${vStr} at 90° to a uniform ${bStr} field ${bDirPhrase} inside a ${app}. ${tail}`.trim();
      case 8:
        return `Subject solely to the magnetic Lorentz force in a ${app}, a ${sp.label} (mass ${sp.massText}, charge ${sp.chargeText}) enters at ${vStr} orthogonal to a steady ${bStr} field ${bDirPhrase}. ${tail}`.trim();
      case 9:
        return `Crossing the entry slit of a ${app} at ${vStr}, a ${sp.label} with charge ${sp.chargeText} and mass ${sp.massText} encounters a uniform perpendicular ${bStr} magnetic field (${bDirPhrase}). ${tail}`.trim();
      case 10:
        return `In high vacuum within a ${app}, coils maintain a uniform ${bStr} field ${bDirPhrase} at right angles to an incident ${sp.label} (${sp.chargeText}, ${sp.massText}) travelling at ${vStr}. ${tail}`.trim();
      case 11:
        return `Travelling through a ${app} with speed ${vStr} normal to magnetic field lines of strength ${bStr} (${bDirPhrase}), a ${sp.label} of charge ${sp.chargeText} and mass ${sp.massText} executes circular motion. ${tail}`.trim();
      default:
        return `A collimated ${sp.label} (q = ${sp.chargeText}, m = ${sp.massText}) enters a ${app} at ${vStr} perpendicular to a homogeneous ${bStr} magnetic field ${bDirPhrase}. ${tail}`.trim();
    }
  };

  if (format === "mcq") {
    const subMode = variantIdx % 3;
    if (subMode === 0) {
      const stem = buildStem("What is the radius of curvature r of the circular path?");
      const mcq = buildMcqBundle(rng, sol.cyclotronRadiusM, "m", [
        {
          value: sol.orbitDiameterM,
          rationale:
            "Confuses orbital radius r = mv/(|q|B) with semicircular orbit diameter D = 2r.",
        },
        {
          value: (sp.massKg * speedMs ** 2) / (Math.abs(sp.chargeC) * magneticFieldT),
          rationale:
            "Uses mv²/(|q|B) by forgetting to cancel one power of speed v when equating mv²/r = |q|vB.",
        },
        {
          value: 1 / sol.cyclotronRadiusM,
          rationale:
            "Inverts the cyclotron radius formula and evaluates |q|B / (mv) instead of mv / (|q|B).",
        },
      ]);
      const ans = fmtQty(sol.cyclotronRadiusM, "m");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "foundation",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Calculate cyclotron radius of charged particle moving perpendicular to uniform magnetic field",
          [
            "confusing cyclotron radius with orbit diameter",
            "failing to cancel one power of speed in centripetal balance",
            "inverting cyclotron radius expression",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "cyclotronRadiusM",
        workedSolution: `Equating magnetic and centripetal forces |q|vB = mv²/r gives r = mv / (|q|B) = (${sp.massText} × ${fmtNum(speedMs)}) / (${fmtNum(Math.abs(sp.chargeC))} × ${fmtNum(magneticFieldT)}) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates r = mv / (|q|B) = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      const stem = buildStem(
        "If the particle completes a semicircular turn to strike a flat detector wall on the entry plane, how far from the entry slit does it hit?",
      );
      const mcq = buildMcqBundle(rng, sol.orbitDiameterM, "m", [
        {
          value: sol.cyclotronRadiusM,
          rationale:
            "Reports the cyclotron radius r instead of the semicircular chord diameter D = 2r along the detector wall.",
        },
        {
          value: Math.PI * sol.cyclotronRadiusM,
          rationale:
            "Calculates the curved semicircular arc length πr rather than the straight-line wall separation 2r.",
        },
        {
          value: 4 * sol.cyclotronRadiusM,
          rationale:
            "Doubles the diameter a second time and reports 4r instead of 2r.",
        },
      ]);
      const ans = fmtQty(sol.orbitDiameterM, "m");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Determine semicircular exit-to-entry chord diameter of magnetically deflected particle",
          [
            "reporting cyclotron radius instead of semicircular diameter",
            "computing curved semicircular arc length instead of straight chord",
            "multiplying radius by four instead of two",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "orbitDiameterM",
        workedSolution: `Cyclotron radius r = mv / (|q|B) = ${fmtQty(sol.cyclotronRadiusM, "m")}. Across a semicircular turn, the impact distance from the entry slit equals the orbit diameter D = 2r = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds r = mv/(|q|B) and doubles to diameter D = 2r = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildStem(
      "What is the cyclotron revolution frequency f of the particle in this magnetic field?",
    );
    const mcq = buildMcqBundle(rng, sol.frequencyHz, "Hz", [
      {
        value: sol.angularSpeedRadS,
        rationale:
          "Computes angular speed ω = |q|B / m and omits dividing by 2π for frequency f = ω / (2π).",
      },
      {
        value: 2 * sol.frequencyHz,
        rationale:
          "Divides ω by π instead of 2π when converting angular speed to frequency.",
      },
      {
        value: sol.periodS,
        rationale:
          "Inverts the formula and evaluates orbital period 2πm / (|q|B) instead of frequency.",
      },
    ]);
    const ans = fmtQty(sol.frequencyHz, "Hz");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "standard",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Evaluate cyclotron revolution frequency independent of particle speed",
        [
          "confusing angular cyclotron frequency with linear frequency",
          "dividing by pi instead of two-pi",
          "computing orbital period instead of frequency",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "frequencyHz",
      workedSolution: `Using f = |q|B / (2πm) = (${fmtNum(Math.abs(sp.chargeC))} × ${fmtNum(magneticFieldT)}) / (2π × ${sp.massText}) = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Applies f = |q|B / (2πm) = ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured cyclotron item
  const stem = buildStem("");
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: "Calculate the centripetal acceleration of the particle in the magnetic field.",
      marks: 2,
      targetQuantityKey: "centripetalAccelerationMs2",
      truthValue: sol.centripetalAccelerationMs2,
      unit: "m s⁻²",
      methodCriterion: "Applies a_c = |q|vB / m.",
      workingFormula: "a_c = |q|vB / m.",
      workingSubstitution: `a_c = (${fmtNum(Math.abs(sp.chargeC))} × ${fmtNum(speedMs)} × ${fmtNum(magneticFieldT)}) / ${sp.massText}`,
    },
    {
      partId: "b",
      prompt: "Determine the radius of curvature r of the circular trajectory.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "cyclotronRadiusM",
      truthValue: sol.cyclotronRadiusM,
      unit: "m",
      methodCriterion: "Uses r = v² / a_c (= mv / |q|B).",
      workingFormula: "r = mv / (|q|B).",
      workingSubstitution: `r = (${sp.massText} × ${fmtNum(speedMs)}) / (${fmtNum(Math.abs(sp.chargeC))} × ${fmtNum(magneticFieldT)})`,
    },
    {
      partId: "c",
      prompt: "Calculate the cyclotron frequency f of revolution.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "frequencyHz",
      truthValue: sol.frequencyHz,
      unit: "Hz",
      methodCriterion: "Uses f = |q|B / (2πm) (= v / 2πr).",
      workingFormula: "f = |q|B / (2πm).",
      workingSubstitution: `f = (${fmtNum(Math.abs(sp.chargeC))} × ${fmtNum(magneticFieldT)}) / (2π × ${sp.massText})`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "standard",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Multi-step calculation of magnetic Lorentz force, cyclotron radius, and orbital frequency",
      [],
      [
        "part: evaluate perpendicular magnetic force magnitude",
        "part: calculate circular orbit radius",
        "part: determine cyclotron revolution frequency",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 14: accelerated-ion-beam-magnetic-deflection
// ============================================================================

const ION_BEAM_CONTEXTS = [
  "semiconductor ion-implantation beamline",
  "Thomson e/m specific-charge apparatus",
  "focused gallium-ion lithographic column",
  "secondary-ion mass analyser magnet",
  "electrostatic-gun magnetic spectrometer",
  "isotopic beam-separator bending magnet",
  "accelerator-mass-spectrometry injection sector",
  "sputter-source magnetic momentum filter",
  "surface-science low-energy ion scattering rig",
  "vacuum cathode-ray magnetic deflection tube",
  "nuclear astrophysics recoil separator",
] as const;

function buildArchetype14Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const ions = [
    {
      name: "electron",
      q: -ELEMENTARY_CHARGE_C,
      qStr: "−1.60 × 10⁻¹⁹ C",
      m: ELECTRON_MASS_KG,
      mStr: "9.11 × 10⁻³¹ kg",
      bPool: [1.8e-3, 2.5e-3, 3.6e-3, 5.0e-3],
      vPool: [250, 400, 600, 900, 1200],
    },
    {
      name: "singly ionised lithium ion",
      q: ELEMENTARY_CHARGE_C,
      qStr: "+1.60 × 10⁻¹⁹ C",
      m: 1.16e-26,
      mStr: "1.16 × 10⁻²⁶ kg",
      bPool: [0.18, 0.25, 0.35, 0.45],
      vPool: [800, 1200, 1800, 2400, 3200],
    },
    {
      name: "doubly ionised magnesium ion",
      q: 3.2e-19,
      qStr: "+3.20 × 10⁻¹⁹ C",
      m: 3.98e-26,
      mStr: "3.98 × 10⁻²⁶ kg",
      bPool: [0.24, 0.32, 0.42, 0.55],
      vPool: [1000, 1500, 2200, 3000, 3600],
    },
  ] as const;

  const ion = ions[variantIdx % ions.length];
  const magneticFieldT = ion.bPool[(variantIdx * 2 + 1) % ion.bPool.length];
  const acceleratingVoltageV = ion.vPool[(variantIdx * 3) % ion.vPool.length];
  const fieldDirection: MagneticFieldPageDirection =
    variantIdx % 2 === 0 ? "out-of-page" : "into-page";

  const spec: MagneticCyclotronSpec = {
    kind: "magnetic-cyclotron",
    chargeC: ion.q,
    massKg: ion.m,
    magneticFieldT,
    fieldDirection,
    acceleratingVoltageV,
    arcSweepDegrees: 180,
  };
  const sol = solveEmInductionScenario(spec);
  if (sol.kind !== "magnetic-cyclotron") throw new Error("Expected cyclotron solution");

  const hiddenQuantities = [
    "speedMs",
    "magneticForceMagnitudeN",
    "centripetalAccelerationMs2",
    "cyclotronRadiusM",
    "orbitDiameterM",
    "periodS",
    "frequencyHz",
    "angularSpeedRadS",
    "specificChargeCPerKg",
    "kineticEnergyJ",
    "kineticEnergyEv",
    "arcTimeS",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "chargeC", value: ion.q, unit: "C", source: "stem" },
    { name: "massKg", value: ion.m, unit: "kg", source: "stem" },
    { name: "magneticFieldT", value: magneticFieldT, unit: "T", source: "stem" },
    { name: "acceleratingVoltageV", value: acceleratingVoltageV, unit: "V", source: "stem" },
  ];
  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const app = ION_BEAM_CONTEXTS[variantIdx % ION_BEAM_CONTEXTS.length];
  const bDirPhrase =
    fieldDirection === "into-page" ? "into the page" : "out of the page";

  const buildStem = (tail: string): string => {
    const f = variantIdx % 13;
    const bStr = `${fmtNum(magneticFieldT)} T`;
    switch (f) {
      case 0:
        return `In a ${app}, a ${ion.name} (charge ${ion.qStr}, mass ${ion.mStr}) starts from rest, accelerates across a potential difference of ${acceleratingVoltageV} V, and enters perpendicular to a uniform ${bStr} magnetic field (${bDirPhrase}). ${tail}`.trim();
      case 1:
        return `Accelerated from rest through ${acceleratingVoltageV} V in a ${app}, a ${ion.name} of charge ${ion.qStr} and mass ${ion.mStr} passes into a uniform ${bStr} magnetic field directed ${bDirPhrase} at right angles to its velocity. ${tail}`.trim();
      case 2:
        return `An electrostatic gun in a ${app} accelerates a stationary ${ion.name} (q = ${ion.qStr}, m = ${ion.mStr}) across ${acceleratingVoltageV} V before injecting it orthogonally into a ${bStr} magnetic field (${bDirPhrase}). ${tail}`.trim();
      case 3:
        return `Within a ${app}, a ${ion.name} carrying charge ${ion.qStr} and mass ${ion.mStr} gains kinetic energy across an accelerating voltage of ${acceleratingVoltageV} V from rest and then curves in a uniform ${bStr} magnetic field (${bDirPhrase}). ${tail}`.trim();
      case 4:
        return `During calibration of a ${app}, initially stationary ${ion.name}s (charge ${ion.qStr}, mass ${ion.mStr}) are accelerated by ${acceleratingVoltageV} V and directed normal to a ${bStr} field (${bDirPhrase}). ${tail}`.trim();
      case 5:
        return `Starting at negligible speed in a ${app}, a ${ion.name} (charge ${ion.qStr}, mass ${ion.mStr}) traverses a ${acceleratingVoltageV} V accelerating gap and enters a perpendicular ${bStr} magnetic field (${bDirPhrase}). ${tail}`.trim();
      case 6:
        return `Released with zero initial kinetic energy inside a ${app}, a ${ion.name} (${ion.qStr}, ${ion.mStr}) falls through a potential difference of ${acceleratingVoltageV} V and immediately enters a uniform ${bStr} field ${bDirPhrase} normal to its path. ${tail}`.trim();
      case 7:
        return `A potential difference of ${acceleratingVoltageV} V in the source stage of a ${app} accelerates a ${ion.name} of mass ${ion.mStr} and charge ${ion.qStr} from rest into a perpendicular magnetic sector of flux density ${bStr} (${bDirPhrase}). ${tail}`.trim();
      case 8:
        return `Emerging through the anode aperture after acceleration from rest across ${acceleratingVoltageV} V in a ${app}, a ${ion.name} (${ion.qStr}, ${ion.mStr}) enters at 90° to a homogeneous ${bStr} magnetic field (${bDirPhrase}). ${tail}`.trim();
      case 9:
        return `Inside an evacuated ${app}, a ${ion.name} with mass ${ion.mStr} and charge ${ion.qStr} is accelerated from rest by ${acceleratingVoltageV} V and bent along an arc by a perpendicular ${bStr} magnetic field (${bDirPhrase}). ${tail}`.trim();
      case 10:
        return `Before entering the uniform ${bStr} magnetic field (${bDirPhrase}) of a ${app} at right angles, a ${ion.name} (q = ${ion.qStr}, m = ${ion.mStr}) is accelerated from rest through an electrode voltage of ${acceleratingVoltageV} V. ${tail}`.trim();
      case 11:
        return `An extraction stage biased at ${acceleratingVoltageV} V accelerates stationary ${ion.name}s (mass ${ion.mStr}, charge ${ion.qStr}) in a ${app} straight into a transverse ${bStr} magnetic field (${bDirPhrase}). ${tail}`.trim();
      default:
        return `From rest at the ion source of a ${app}, a ${ion.name} (${ion.qStr}, ${ion.mStr}) crosses a ${acceleratingVoltageV} V accelerating potential and enters normal to a steady ${bStr} magnetic field (${bDirPhrase}). ${tail}`.trim();
    }
  };

  if (format === "mcq") {
    const subMode = variantIdx % 3;
    if (subMode === 0) {
      const stem = buildStem(
        "What is the radius of the resulting circular path inside the magnetic field?",
      );
      const mcq = buildMcqBundle(rng, sol.cyclotronRadiusM, "m", [
        {
          value: sol.orbitDiameterM,
          rationale:
            "Confuses orbital radius r with semicircular diameter 2r.",
        },
        {
          value: sol.cyclotronRadiusM / Math.SQRT2,
          rationale:
            "Omits the factor of 2 inside v = √(2|q|V_acc/m) from forgetting ½ in ½mv² = |q|V_acc.",
        },
        {
          value: (2 * ion.m * acceleratingVoltageV) / (Math.abs(ion.q) * magneticFieldT ** 2),
          rationale:
            "Evaluates r² = 2mV_acc/(|q|B²) without taking the square root.",
        },
      ]);
      const ans = fmtQty(sol.cyclotronRadiusM, "m");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "higher",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Calculate magnetic orbit radius of particle accelerated from rest through voltage",
          [
            "confusing orbit radius with semicircular diameter",
            "omitting factor of two under square root in kinetic energy relation",
            "forgetting square root when solving for radius",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "cyclotronRadiusM",
        workedSolution: `From ½mv² = |q|V_acc, speed v = √(2|q|V_acc / m) = ${fmtQty(sol.speedMs, "m s⁻¹")}. Orbit radius r = mv / (|q|B) = (1/B)√(2mV_acc / |q|) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses r = (1/B)√(2mV_acc/|q|) to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      const stem = buildStem(
        "What speed does the particle reach upon entering the magnetic field?",
      );
      const mcq = buildMcqBundle(rng, sol.speedMs, "m s⁻¹", [
        {
          value: sol.speedMs / Math.SQRT2,
          rationale:
            "Forgets the ½ in ½mv² = |q|V_acc and computes √(|q|V_acc / m).",
        },
        {
          value: (2 * Math.abs(ion.q) * acceleratingVoltageV) / ion.m,
          rationale:
            "Computes v² = 2|q|V_acc / m without taking the square root.",
        },
        {
          value: sol.speedMs * Math.SQRT2,
          rationale:
            "Multiplies by 4 instead of 2 inside the square root.",
        },
      ]);
      const ans = fmtQty(sol.speedMs, "m s⁻¹");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Determine injection speed of ion accelerated from rest across potential difference",
          [
            "omitting factor of two in kinetic-energy speed equation",
            "forgetting square root in speed calculation",
            "doubling kinetic energy factor erroneously",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "speedMs",
        workedSolution: `Equating ½mv² = |q|V_acc gives v = √(2|q|V_acc / m) = √(2 × ${fmtNum(Math.abs(ion.q))} × ${acceleratingVoltageV} / ${ion.mStr}) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates v = √(2|q|V_acc / m) = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildStem(
      "If the particle completes a semicircular turn onto an exit detector plate, what is the strike diameter D from the entry slit?",
    );
    const mcq = buildMcqBundle(rng, sol.orbitDiameterM, "m", [
      {
        value: sol.cyclotronRadiusM,
        rationale:
          "Reports the orbital radius r = (1/B)√(2mV_acc/|q|) instead of the semicircular chord diameter D = 2r.",
      },
      {
        value: sol.orbitDiameterM / Math.SQRT2,
        rationale:
          "Omits the factor of 2 in v = √(2|q|V_acc/m) when computing r before doubling.",
      },
      {
        value: Math.PI * sol.cyclotronRadiusM,
        rationale:
          "Computes curved semicircular arc length πr rather than straight-line detector chord 2r.",
      },
    ]);
    const ans = fmtQty(sol.orbitDiameterM, "m");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "higher",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Find semicircular detector chord diameter of voltage-accelerated ion in magnetic field",
        [
          "confusing orbit radius with semicircular strike diameter",
          "omitting factor of two in kinetic-energy velocity conversion",
          "calculating curved arc length instead of straight chord diameter",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "orbitDiameterM",
      workedSolution: `Speed v = √(2|q|V_acc / m) = ${fmtQty(sol.speedMs, "m s⁻¹")}; radius r = mv / (|q|B) = ${fmtQty(sol.cyclotronRadiusM, "m")}. Semicircular detector separation D = 2r = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Computes D = (2/B)√(2mV_acc / |q|) = ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured voltage-accelerated cyclotron
  const stem = buildStem("");
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: "Calculate the speed at which the particle enters the magnetic field.",
      marks: 2,
      targetQuantityKey: "speedMs",
      truthValue: sol.speedMs,
      unit: "m s⁻¹",
      methodCriterion: "Uses ½mv² = |q|V_acc to solve for v.",
      workingFormula: "v = √(2|q|V_acc / m).",
      workingSubstitution: `v = √(2 × ${fmtNum(Math.abs(ion.q))} × ${acceleratingVoltageV} / ${ion.mStr})`,
    },
    {
      partId: "b",
      prompt: "Determine the radius r of the circular trajectory.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "cyclotronRadiusM",
      truthValue: sol.cyclotronRadiusM,
      unit: "m",
      methodCriterion: "Applies r = mv / (|q|B) using v from (a).",
      workingFormula: "r = mv / (|q|B).",
      workingSubstitution: `r = (${ion.mStr} × ${fmtNum(sol.speedMs)}) / (${fmtNum(Math.abs(ion.q))} × ${fmtNum(magneticFieldT)})`,
    },
    {
      partId: "c",
      prompt:
        "Calculate the semicircular strike diameter D = 2r across an exit detector plane.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "orbitDiameterM",
      truthValue: sol.orbitDiameterM,
      unit: "m",
      methodCriterion: "Multiplies orbital radius from (b) by two.",
      workingFormula: "D = 2r.",
      workingSubstitution: `D = 2 × ${fmtNum(sol.cyclotronRadiusM)}`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "higher",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Analyse electrostatic acceleration speed, magnetic curvature radius, and semicircular strike diameter",
      [],
      [
        "part: calculate entry speed from accelerating potential difference",
        "part: determine circular orbit radius in magnetic field",
        "part: evaluate semicircular detector chord separation",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 15: crossed-fields-wein-velocity-selector
// ============================================================================

const SELECTOR_CONTEXTS = [
  "Wien crossed-field velocity filter",
  "accelerator monochromatic ion collimator",
  "accelerator-mass-spectrometry pre-filter",
  "electron-microscope Wien monochromator",
  "plasma neutral-beam ion velocity selector",
  "atomic-physics crossed-E/B beam gate",
] as const;

function buildArchetype15Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const vPlatePool = [180, 240, 320, 450, 600, 750, 900];
  const sepPool = [0.015, 0.02, 0.025, 0.03, 0.04];
  const bPool = [0.08, 0.12, 0.16, 0.2, 0.25, 0.32];

  const plateVoltageV = vPlatePool[(variantIdx * 2) % vPlatePool.length];
  const plateSeparationM = sepPool[(variantIdx * 3 + 1) % sepPool.length];
  const magneticFieldT = bPool[(variantIdx * 2 + 1) % bPool.length];
  // Use out-of-page + negative top plate with positive proton so F_E,y > 0 and F_B,y < 0;
  // when off-speed with v = 0.6 * v_sel, netForceYN > 0 and initialAccelerationYMs2 > 0!
  const isOffSpeed = variantIdx % 2 === 1;
  const fieldDirection: MagneticFieldPageDirection = isOffSpeed
    ? "out-of-page"
    : "into-page";
  const topPlatePolarity: PlatePolarity =
    fieldDirection === "into-page" ? "positive" : "negative";

  const chargeC = ELEMENTARY_CHARGE_C;
  const massKg = PROTON_MASS_KG;
  const vSel = plateVoltageV / (plateSeparationM * magneticFieldT);
  const particleSpeedMs = isOffSpeed
    ? Number((0.6 * vSel).toPrecision(3))
    : undefined;

  const spec: VelocitySelectorSpec = {
    kind: "velocity-selector",
    chargeC,
    massKg,
    plateVoltageV,
    plateSeparationM,
    magneticFieldT,
    fieldDirection,
    topPlatePolarity,
    ...(particleSpeedMs !== undefined ? { particleSpeedMs } : {}),
  };
  const sol = solveEmInductionScenario(spec);
  if (sol.kind !== "velocity-selector") throw new Error("Expected selector solution");

  const hiddenQuantities = isOffSpeed
    ? [
        "electricFieldVm",
        "selectedSpeedMs",
        "electricForceMagnitudeN",
        "magneticForceMagnitudeN",
        "netForceYN",
        "initialAccelerationYMs2",
      ]
    : [
        "electricFieldVm",
        "selectedSpeedMs",
        "particleSpeedMs",
        "electricForceMagnitudeN",
        "magneticForceMagnitudeN",
      ];

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "chargeC", value: chargeC, unit: "C", source: "stem" },
    { name: "massKg", value: massKg, unit: "kg", source: "stem" },
    { name: "plateVoltageV", value: plateVoltageV, unit: "V", source: "stem" },
    { name: "plateSeparationM", value: plateSeparationM, unit: "m", source: "stem" },
    { name: "magneticFieldT", value: magneticFieldT, unit: "T", source: "stem" },
    ...(particleSpeedMs !== undefined
      ? [{ name: "particleSpeedMs", value: particleSpeedMs, unit: "m s⁻¹", source: "stem" as const }]
      : []),
  ];
  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const app = SELECTOR_CONTEXTS[variantIdx % SELECTOR_CONTEXTS.length];
  const bDirPhrase =
    fieldDirection === "into-page" ? "into the page" : "out of the page";
  const platePhrase =
    topPlatePolarity === "positive"
      ? "upper plate positive"
      : "upper plate negative";

  const buildStem = (tail: string): string => {
    const f = variantIdx % 5;
    const speedClause =
      particleSpeedMs !== undefined
        ? `injected horizontally to the right at ${fmtNum(particleSpeedMs)} m s⁻¹`
        : "injected horizontally along the central axis";
    if (f === 0) {
      return `In a ${app}, parallel plates separated by ${fmtGiven(plateSeparationM)} m are held at ${plateVoltageV} V (${platePhrase}) perpendicular to a uniform ${fmtGiven(magneticFieldT)} T magnetic field (${bDirPhrase}). A proton (charge +1.60 × 10⁻¹⁹ C, mass 1.67 × 10⁻²⁷ kg) is ${speedClause}. ${tail}`.trim();
    }
    if (f === 1) {
      return `A ${app} combines parallel electrodes ${fmtGiven(plateSeparationM)} m apart at ${plateVoltageV} V (${platePhrase}) with a crossed ${fmtGiven(magneticFieldT)} T magnetic field (${bDirPhrase}) for protons (q = +1.60 × 10⁻¹⁹ C, m = 1.67 × 10⁻²⁷ kg) ${speedClause}. ${tail}`.trim();
    }
    if (f === 2) {
      return `Crossed fields in a ${app} are produced by ${plateVoltageV} V across plates spaced ${fmtGiven(plateSeparationM)} m apart (${platePhrase}) and a ${fmtGiven(magneticFieldT)} T field directed ${bDirPhrase}; a proton (+1.60 × 10⁻¹⁹ C, 1.67 × 10⁻²⁷ kg) is ${speedClause}. ${tail}`.trim();
    }
    if (f === 3) {
      return `Within a vacuum ${app}, a proton (+1.60 × 10⁻¹⁹ C, 1.67 × 10⁻²⁷ kg) is ${speedClause} between plates ${fmtGiven(plateSeparationM)} m apart at p.d. ${plateVoltageV} V (${platePhrase}) inside a perpendicular ${fmtGiven(magneticFieldT)} T field (${bDirPhrase}). ${tail}`.trim();
    }
    return `During tuning of a ${app} (${plateVoltageV} V across a ${fmtGiven(plateSeparationM)} m gap, ${platePhrase}, with B = ${fmtGiven(magneticFieldT)} T ${bDirPhrase}), a proton of charge +1.60 × 10⁻¹⁹ C and mass 1.67 × 10⁻²⁷ kg is ${speedClause}. ${tail}`.trim();
  };

  if (format === "mcq") {
    if (!isOffSpeed) {
      const stem = buildStem(
        "At what speed must the proton travel to pass straight through the exit slit undeflected?",
      );
      const mcq = buildMcqBundle(rng, sol.selectedSpeedMs, "m s⁻¹", [
        {
          value: (plateVoltageV * plateSeparationM) / magneticFieldT,
          rationale:
            "Multiplies V by d instead of dividing V by d when finding electric field E = V/d.",
        },
        {
          value: (plateVoltageV / plateSeparationM) * magneticFieldT,
          rationale:
            "Multiplies E by B instead of dividing E / B in the balanced-force condition qE = qvB.",
        },
        {
          value: (magneticFieldT * plateSeparationM) / plateVoltageV,
          rationale:
            "Inverts v = E/B and computes B/E = Bd/V instead of V/(Bd).",
        },
      ]);
      const ans = fmtQty(sol.selectedSpeedMs, "m s⁻¹");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "foundation",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Determine undeflected pass-through speed in crossed electric and magnetic velocity selector",
          [
            "multiplying voltage by plate spacing instead of dividing",
            "multiplying electric and magnetic fields instead of taking ratio",
            "inverting field ratio as B over E",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "selectedSpeedMs",
        workedSolution: `Uniform electric field E = V / d = ${plateVoltageV} / ${plateSeparationM} = ${fmtQty(sol.electricFieldMagnitudeVm, "V m⁻¹")}. Zero net deflection requires qE = qvB, so v_sel = E / B = V / (Bd) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses v_sel = V / (Bd) to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const askAccel = (variantIdx >> 1) % 2 === 0;
    const fE = Math.abs(sol.electricForceYN);
    const fB = Math.abs(sol.magneticForceYN);
    if (askAccel) {
      const stem = buildStem(
        "What is the initial upward transverse acceleration of the proton upon entering the crossed fields?",
      );
      const mcq = buildMcqBundle(rng, sol.initialAccelerationYMs2, "m s⁻²", [
        {
          value: (fE + fB) / massKg,
          rationale:
            "Adds the electric and magnetic force magnitudes (|F_E| + |F_B|)/m instead of subtracting opposing forces.",
        },
        {
          value: fE / massKg,
          rationale:
            "Includes only the upward electric acceleration qE/m and ignores the opposing downward magnetic force.",
        },
        {
          value: fB / massKg,
          rationale:
            "Calculates only the magnetic acceleration magnitude qvB/m and ignores the electric field.",
        },
      ]);
      const ans = fmtQty(sol.initialAccelerationYMs2, "m s⁻²");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "higher",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Evaluate initial transverse acceleration of off-speed ion in velocity selector",
          [
            "summing opposing electric and magnetic force magnitudes",
            "ignoring opposing magnetic Lorentz force",
            "ignoring electric plate force",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "initialAccelerationYMs2",
        workedSolution: `E = V/d = ${fmtQty(sol.electricFieldMagnitudeVm, "V m⁻¹")}. Upward electric force F_E = qE = ${fmtQty(fE, "N")}; downward magnetic force |F_B| = qvB = ${fmtQty(fB, "N")}. Net upward acceleration a_y = (F_E − |F_B|) / m = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Subtracts opposing qvB from qE and divides by m to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildStem(
      "At what speed would a proton instead have to enter this same selector to pass straight through undeflected?",
    );
    const mcq = buildMcqBundle(rng, sol.selectedSpeedMs, "m s⁻¹", [
      {
        value: particleSpeedMs!,
        rationale:
          "Selects the off-resonance injection speed given in the stem rather than solving qE = qvB for v_sel = V/(Bd).",
      },
      {
        value: (plateVoltageV * plateSeparationM) / magneticFieldT,
        rationale:
          "Multiplies V by d instead of dividing V by d when computing E = V/d.",
      },
      {
        value: (plateVoltageV / plateSeparationM) * magneticFieldT,
        rationale:
          "Multiplies E by B instead of dividing E / B.",
      },
    ]);
    const ans = fmtQty(sol.selectedSpeedMs, "m s⁻¹");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "standard",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Determine balanced Wien velocity-selector speed when injected ion is off-resonance",
        [
          "repeating off-resonance injection speed instead of balanced E-over-B speed",
          "multiplying plate voltage by separation instead of dividing",
          "multiplying electric field by magnetic field",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "selectedSpeedMs",
      workedSolution: `Electric field E = V / d = ${plateVoltageV} / ${plateSeparationM} = ${fmtQty(sol.electricFieldMagnitudeVm, "V m⁻¹")}. Undeflected transmission requires qvB = qE, giving v_sel = E / B = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates v_sel = V / (Bd) = ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured velocity selector
  const stem = buildStem("");
  const bundle = buildStructuredBundle(
    isOffSpeed
      ? [
          {
            partId: "a",
            prompt: "Calculate the uniform electric field strength E between the plates.",
            marks: 2,
            targetQuantityKey: "electricFieldVm",
            truthValue: sol.electricFieldMagnitudeVm,
            unit: "V m⁻¹",
            methodCriterion: "Applies E = V / d.",
            workingFormula: "E = V / d.",
            workingSubstitution: `E = ${plateVoltageV} / ${plateSeparationM}`,
          },
          {
            partId: "b",
            prompt:
              "Determine the speed v_sel at which a proton would pass through undeflected.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "selectedSpeedMs",
            truthValue: sol.selectedSpeedMs,
            unit: "m s⁻¹",
            methodCriterion: "Equates qE = qvB to obtain v_sel = E / B.",
            workingFormula: "v_sel = E / B.",
            workingSubstitution: `v_sel = ${fmtNum(sol.electricFieldMagnitudeVm)} / ${magneticFieldT}`,
          },
          {
            partId: "c",
            prompt:
              "Calculate the initial upward acceleration of the injected proton.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "initialAccelerationYMs2",
            truthValue: sol.initialAccelerationYMs2,
            unit: "m s⁻²",
            methodCriterion: "Uses a_y = q(E − vB) / m.",
            workingFormula: "a_y = q(E − vB) / m.",
            workingSubstitution: `a_y = 1.60 × 10⁻¹⁹ × (${fmtNum(sol.electricFieldMagnitudeVm)} − ${fmtNum(particleSpeedMs!)} × ${magneticFieldT}) / 1.67 × 10⁻²⁷`,
          },
        ]
      : [
          {
            partId: "a",
            prompt: "Calculate the electric field magnitude E between the parallel plates.",
            marks: 2,
            targetQuantityKey: "electricFieldVm",
            truthValue: sol.electricFieldMagnitudeVm,
            unit: "V m⁻¹",
            methodCriterion: "Uses E = V / d.",
            workingFormula: "E = V / d.",
            workingSubstitution: `E = ${plateVoltageV} / ${plateSeparationM}`,
          },
          {
            partId: "b",
            prompt:
              "Calculate the speed v_sel required for the proton to pass straight through undeflected.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "selectedSpeedMs",
            truthValue: sol.selectedSpeedMs,
            unit: "m s⁻¹",
            methodCriterion: "Sets qvB = qE so v_sel = E / B.",
            workingFormula: "v_sel = E / B.",
            workingSubstitution: `v_sel = ${fmtNum(sol.electricFieldMagnitudeVm)} / ${magneticFieldT}`,
          },
        ],
  );

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: isOffSpeed ? "higher" : "standard",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Multi-step analysis of crossed-field Wien velocity selector forces and selected speed",
      [],
      [
        "part: calculate uniform plate electric field strength",
        "part: evaluate selected pass-through speed or electrostatic force",
        "part: determine undeflected velocity or net off-speed acceleration",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// ARCHETYPE 16: bainbridge-mass-spectrometer-isotope-separation
// ============================================================================

const BAINBRIDGE_CONTEXTS = [
  "geochronology Bainbridge isotope spectrometer",
  "archaeometric radiocarbon mass-spectrometer sector",
  "nuclear-forensics Bainbridge analyser",
  "planetary-probe isotopic magnetic sector",
  "environmental tracer Bainbridge instrument",
  "high-resolution velocity-selected mass spectrograph",
  "cosmochemistry meteorite isotope separator",
  "paleoclimate ice-core Bainbridge analyser",
  "semiconductor dopant isotope mass spectrometer",
  "medical stable-isotope Bainbridge sector",
  "oceanographic trace-element mass spectrograph",
] as const;

const ISOTOPE_PAIRS = [
  {
    element: "carbon",
    chargeC: ELEMENTARY_CHARGE_C,
    chargeText: "+1.60 × 10⁻¹⁹ C",
    m1Kg: 1.99e-26,
    m1Text: "1.99 × 10⁻²⁶ kg",
    m2Kg: 2.32e-26,
    m2Text: "2.32 × 10⁻²⁶ kg",
  },
  {
    element: "neon",
    chargeC: ELEMENTARY_CHARGE_C,
    chargeText: "+1.60 × 10⁻¹⁹ C",
    m1Kg: 3.32e-26,
    m1Text: "3.32 × 10⁻²⁶ kg",
    m2Kg: 3.65e-26,
    m2Text: "3.65 × 10⁻²⁶ kg",
  },
  {
    element: "magnesium",
    chargeC: 3.2e-19,
    chargeText: "+3.20 × 10⁻¹⁹ C",
    m1Kg: 3.98e-26,
    m1Text: "3.98 × 10⁻²⁶ kg",
    m2Kg: 4.32e-26,
    m2Text: "4.32 × 10⁻²⁶ kg",
  },
  {
    element: "chlorine",
    chargeC: ELEMENTARY_CHARGE_C,
    chargeText: "+1.60 × 10⁻¹⁹ C",
    m1Kg: 5.81e-26,
    m1Text: "5.81 × 10⁻²⁶ kg",
    m2Kg: 6.14e-26,
    m2Text: "6.14 × 10⁻²⁶ kg",
  },
  {
    element: "potassium",
    chargeC: ELEMENTARY_CHARGE_C,
    chargeText: "+1.60 × 10⁻¹⁹ C",
    m1Kg: 6.47e-26,
    m1Text: "6.47 × 10⁻²⁶ kg",
    m2Kg: 6.81e-26,
    m2Text: "6.81 × 10⁻²⁶ kg",
  },
] as const;

function buildArchetype16Item(
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
): CandidateQuestionInput {
  const rng = createSeededRng(seed);
  const iso = ISOTOPE_PAIRS[variantIdx % ISOTOPE_PAIRS.length];
  const ePool = [4.0e4, 5.4e4, 6.8e4, 8.4e4, 9.6e4, 1.2e5];
  // Distinct B1 and B2 pairs so B1 != B2 always!
  const bPairs: ReadonlyArray<[number, number]> = [
    [0.2, 0.5],
    [0.25, 0.6],
    [0.3, 0.75],
    [0.4, 0.8],
    [0.35, 0.7],
    [0.5, 0.85],
  ];

  const selectorElectricFieldVm = ePool[(variantIdx * 2) % ePool.length];
  const [b1, b2] = bPairs[(variantIdx * 3 + 1) % bPairs.length];
  const deflectionFieldDirection: MagneticFieldPageDirection =
    variantIdx % 2 === 0 ? "into-page" : "out-of-page";

  const spec: BainbridgeSpectrometerSpec = {
    kind: "bainbridge-mass-spectrometer",
    chargeC: iso.chargeC,
    massKg: iso.m1Kg,
    comparisonMassKg: iso.m2Kg,
    selectorElectricFieldVm,
    selectorMagneticFieldT: b1,
    deflectionMagneticFieldT: b2,
    deflectionFieldDirection,
  };
  const sol = solveEmInductionScenario(spec);
  if (
    sol.kind !== "bainbridge-mass-spectrometer" ||
    sol.strikeSeparationM === undefined ||
    sol.comparisonRadiusM === undefined
  ) {
    throw new Error("Expected two-isotope Bainbridge solution");
  }

  const hiddenQuantities = [
    "selectedSpeedMs",
    "primaryRadiusM",
    "primaryDiameterM",
    "primarySpecificChargeCPerKg",
    "primaryKineticEnergyJ",
    "comparisonRadiusM",
    "comparisonDiameterM",
    "strikeSeparationM",
    "massRatio",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "chargeC", value: iso.chargeC, unit: "C", source: "stem" },
    { name: "massKg", value: iso.m1Kg, unit: "kg", source: "stem" },
    { name: "comparisonMassKg", value: iso.m2Kg, unit: "kg", source: "stem" },
    { name: "selectorElectricFieldVm", value: selectorElectricFieldVm, unit: "V m⁻¹", source: "stem" },
    { name: "selectorMagneticFieldT", value: b1, unit: "T", source: "stem" },
    { name: "deflectionMagneticFieldT", value: b2, unit: "T", source: "stem" },
  ];
  const syllabi = resolveArchetypeSyllabi(descriptor, format, variantIdx);
  const app = BAINBRIDGE_CONTEXTS[variantIdx % BAINBRIDGE_CONTEXTS.length];
  const bDirPhrase =
    deflectionFieldDirection === "into-page" ? "into the page" : "out of the page";

  const buildStem = (tail: string): string => {
    const f = variantIdx % 13;
    const eStr = `${fmtNum(selectorElectricFieldVm)} V m⁻¹`;
    const b1Str = `${fmtGiven(b1)} T`;
    const b2Str = `${fmtGiven(b2)} T`;
    switch (f) {
      case 0:
        return `In a ${app}, two ${iso.element} isotopes of equal charge ${iso.chargeText} and masses m₁ = ${iso.m1Text} and m₂ = ${iso.m2Text} pass undeflected through a velocity selector (E = ${eStr}, B₁ = ${b1Str}) before entering a semicircular analyser chamber with uniform field B₂ = ${b2Str} (${bDirPhrase}). ${tail}`.trim();
      case 1:
        return `A ${app} filters ${iso.element} ions (charge ${iso.chargeText}, masses m₁ = ${iso.m1Text} and m₂ = ${iso.m2Text}) using crossed fields E = ${eStr} and B₁ = ${b1Str}, then bends them through semicircular arcs onto a detector plate in a chamber field B₂ = ${b2Str} (${bDirPhrase}). ${tail}`.trim();
      case 2:
        return `Ions of two ${iso.element} isotopes carrying charge ${iso.chargeText} (m₁ = ${iso.m1Text}, m₂ = ${iso.m2Text}) emerge from the E = ${eStr}, B₁ = ${b1Str} selector of a ${app} into a perpendicular B₂ = ${b2Str} deflection chamber (${bDirPhrase}). ${tail}`.trim();
      case 3:
        return `Within a ${app}, crossed selector fields E = ${eStr} and B₁ = ${b1Str} admit ${iso.element} isotopes of charge ${iso.chargeText} and masses m₁ = ${iso.m1Text} and m₂ = ${iso.m2Text} through slit S into a uniform B₂ = ${b2Str} magnetic sector (${bDirPhrase}). ${tail}`.trim();
      case 4:
        return `During isotopic analysis on a ${app}, ${iso.element} ions (q = ${iso.chargeText}, m₁ = ${iso.m1Text}, m₂ = ${iso.m2Text}) traverse a velocity selector with E = ${eStr} and B₁ = ${b1Str} and strike a photographic detector wall after semicircular deflection in B₂ = ${b2Str} (${bDirPhrase}). ${tail}`.trim();
      case 5:
        return `Selected at common speed by E = ${eStr} and B₁ = ${b1Str} in a ${app}, ${iso.element} ions of charge ${iso.chargeText} and masses m₁ = ${iso.m1Text} and m₂ = ${iso.m2Text} enter a uniform B₂ = ${b2Str} chamber (${bDirPhrase}) and complete semicircular paths. ${tail}`.trim();
      case 6:
        return `Crossed electric (${eStr}) and magnetic (${b1Str}) fields in the Wien filter of a ${app} transmit ${iso.element} ions of charge ${iso.chargeText} and isotopic masses ${iso.m1Text} and ${iso.m2Text} into an evacuated ${b2Str} analyser field (${bDirPhrase}). ${tail}`.trim();
      case 7:
        return `Two singly or doubly charged ${iso.element} species (charge ${iso.chargeText}, m₁ = ${iso.m1Text}, m₂ = ${iso.m2Text}) exit slit S of a ${app} after velocity selection in E = ${eStr} and B₁ = ${b1Str}, then curve through 180° inside B₂ = ${b2Str} (${bDirPhrase}). ${tail}`.trim();
      case 8:
        return `To resolve ${iso.element} isotopes of masses ${iso.m1Text} and ${iso.m2Text} (each carrying charge ${iso.chargeText}), a ${app} sets its selector fields to E = ${eStr} and B₁ = ${b1Str} ahead of a uniform ${b2Str} magnetic chamber (${bDirPhrase}). ${tail}`.trim();
      case 9:
        return `Entering through collimator slit S after undeflected passage across E = ${eStr} and B₁ = ${b1Str} in a ${app}, ${iso.element} ions (${iso.chargeText}; masses ${iso.m1Text} and ${iso.m2Text}) describe semicircular trajectories in a ${b2Str} field (${bDirPhrase}). ${tail}`.trim();
      case 10:
        return `Inside the evacuated magnetic sector (B₂ = ${b2Str}, ${bDirPhrase}) of a ${app}, ${iso.element} isotopes of masses m₁ = ${iso.m1Text} and m₂ = ${iso.m2Text} and charge ${iso.chargeText} arrive from a velocity selector operating at E = ${eStr} and B₁ = ${b1Str}. ${tail}`.trim();
      case 11:
        return `An ion beam containing ${iso.element} isotopes of masses ${iso.m1Text} and ${iso.m2Text} (common charge ${iso.chargeText}) is velocity-matched by E = ${eStr} and B₁ = ${b1Str} in a ${app} before semicircular mass separation in B₂ = ${b2Str} (${bDirPhrase}). ${tail}`.trim();
      default:
        return `Operating with selector electric field ${eStr}, selector flux density ${b1Str}, and chamber flux density ${b2Str} (${bDirPhrase}), a ${app} separates ${iso.element} ions of charge ${iso.chargeText} and masses ${iso.m1Text} and ${iso.m2Text} onto a flat detector plane. ${tail}`.trim();
    }
  };

  if (format === "mcq") {
    const subMode = variantIdx % 3;
    const deltaR = Math.abs(sol.comparisonRadiusM - sol.primaryRadiusM);

    if (subMode === 0) {
      const stem = buildStem(
        "What is the straight-line separation ΔD between the two isotope strike marks on the detector wall?",
      );
      const mcq = buildMcqBundle(rng, sol.strikeSeparationM, "m", [
        {
          value: deltaR,
          rationale:
            "Calculates the difference in orbital radii |r₂ − r₁| and forgets the factor of 2 for semicircular impact diameters ΔD = 2|r₂ − r₁|.",
        },
        {
          value: (2 * Math.abs(iso.m2Kg - iso.m1Kg) * selectorElectricFieldVm) / (iso.chargeC * b1 ** 2),
          rationale:
            "Uses B₁² in the denominator instead of the product B₁B₂ of selector and chamber fields.",
        },
        {
          value: sol.primaryDiameterM,
          rationale:
            "Reports the semicircular strike distance 2r₁ of the lighter isotope rather than the separation between isotopes.",
        },
      ]);
      const ans = fmtQty(sol.strikeSeparationM, "m");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "higher",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Calculate photographic-plate separation between two isotopes in Bainbridge mass spectrometer",
          [
            "forgetting factor of two between radius difference and semicircular strike separation",
            "substituting selector field squared instead of product of selector and chamber fields",
            "reporting single-isotope strike diameter instead of isotope separation",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "strikeSeparationM",
        workedSolution: `Selected speed v = E / B₁ = ${fmtQty(sol.selectedSpeedMs, "m s⁻¹")}. Semicircular strike separation ΔD = 2(r₂ − r₁) = 2(m₂ − m₁)E / (q B₁ B₂) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies ΔD = 2|m₂ − m₁|E / (qB₁B₂) = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      const stem = buildStem(
        "What is the orbital radius r₁ of the lighter isotope inside the deflection chamber?",
      );
      const mcq = buildMcqBundle(rng, sol.primaryRadiusM, "m", [
        {
          value: sol.primaryDiameterM,
          rationale:
            "Confuses orbital radius r₁ with semicircular impact diameter D₁ = 2r₁.",
        },
        {
          value: (iso.m1Kg * selectorElectricFieldVm) / (iso.chargeC * b1 ** 2),
          rationale:
            "Uses B₁ in the deflection chamber instead of B₂, evaluating m₁E/(qB₁²).",
        },
        {
          value: (iso.m1Kg * selectorElectricFieldVm) / (iso.chargeC * b2 ** 2),
          rationale:
            "Divides E by B₂ instead of B₁ in the velocity selector, evaluating m₁E/(qB₂²).",
        },
      ]);
      const ans = fmtQty(sol.primaryRadiusM, "m");
      return {
        id,
        conceptId: descriptor.conceptId,
        templateArchetype: descriptor.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: buildDigitFreePlan(
          "mcq",
          "Determine chamber cyclotron radius of primary isotope in Bainbridge spectrometer",
          [
            "confusing radius with semicircular strike diameter",
            "using selector magnetic field in place of chamber magnetic field",
            "using chamber magnetic field in velocity-selector equation",
          ],
        ),
        stem,
        options: mcq.options,
        targetQuantityKey: "primaryRadiusM",
        workedSolution: `Selector speed v = E / B₁ = ${fmtQty(sol.selectedSpeedMs, "m s⁻¹")}. In chamber field B₂, r₁ = m₁v / (qB₂) = m₁E / (qB₁B₂) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates r₁ = m₁E / (qB₁B₂) = ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const stem = buildStem(
      "How far from the entry slit S does the lighter isotope strike the detector wall?",
    );
    const mcq = buildMcqBundle(rng, sol.primaryDiameterM, "m", [
      {
        value: sol.primaryRadiusM,
        rationale:
          "Reports the orbital radius r₁ rather than the semicircular chord distance D₁ = 2r₁ from slit S.",
      },
      {
        value: sol.strikeSeparationM,
        rationale:
          "Calculates the separation ΔD between the two isotopes rather than the slit-to-impact distance 2r₁.",
      },
      {
        value: (2 * iso.m1Kg * selectorElectricFieldVm) / (iso.chargeC * b1 ** 2),
        rationale:
          "Uses B₁² instead of B₁B₂ in D₁ = 2m₁E/(qB₁B₂).",
      },
    ]);
    const ans = fmtQty(sol.primaryDiameterM, "m");
    return {
      id,
      conceptId: descriptor.conceptId,
      templateArchetype: descriptor.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty: "standard",
      domain: "em-induction",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: buildDigitFreePlan(
        "mcq",
        "Find semicircular detector strike distance from entry slit for lighter isotope",
        [
          "reporting cyclotron radius instead of semicircular diameter",
          "confusing inter-isotope spacing with slit-to-strike distance",
          "using selector field squared instead of product of selector and chamber fields",
        ],
      ),
      stem,
      options: mcq.options,
      targetQuantityKey: "primaryDiameterM",
      workedSolution: `v = E / B₁ = ${fmtQty(sol.selectedSpeedMs, "m s⁻¹")} and r₁ = m₁v / (qB₂) = ${fmtQty(sol.primaryRadiusM, "m")}. Strike distance from slit S is D₁ = 2r₁ = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Computes D₁ = 2r₁ = 2m₁E / (qB₁B₂) = ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured Bainbridge spectrometer
  const stem = buildStem("");
  const bundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: "Calculate the common speed of the ions emerging from the velocity selector.",
      marks: 2,
      targetQuantityKey: "selectedSpeedMs",
      truthValue: sol.selectedSpeedMs,
      unit: "m s⁻¹",
      methodCriterion: "Applies v = E / B₁.",
      workingFormula: "v = E / B₁.",
      workingSubstitution: `v = ${fmtNum(selectorElectricFieldVm)} / ${b1}`,
    },
    {
      partId: "b",
      prompt: "Determine the orbital radius r₁ of the lighter isotope in the deflection chamber.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "primaryRadiusM",
      truthValue: sol.primaryRadiusM,
      unit: "m",
      methodCriterion: "Uses r₁ = m₁v / (qB₂) with chamber field B₂.",
      workingFormula: "r₁ = m₁v / (qB₂).",
      workingSubstitution: `r₁ = (${iso.m1Text} × ${fmtNum(sol.selectedSpeedMs)}) / (${fmtNum(iso.chargeC)} × ${b2})`,
    },
    {
      partId: "c",
      prompt:
        "Calculate the separation ΔD between the two isotope strike points on the detector wall.",
      marks: 2,
      dependsOnPartIds: ["a", "b"],
      targetQuantityKey: "strikeSeparationM",
      truthValue: sol.strikeSeparationM,
      unit: "m",
      methodCriterion: "Doubles the radius difference ΔD = 2(r₂ − r₁).",
      workingFormula: "ΔD = 2(m₂ − m₁)v / (qB₂).",
      workingSubstitution: `ΔD = 2 × (${iso.m2Text} − ${iso.m1Text}) × ${fmtNum(sol.selectedSpeedMs)} / (${fmtNum(iso.chargeC)} × ${b2})`,
    },
  ]);

  return {
    id,
    conceptId: descriptor.conceptId,
    templateArchetype: descriptor.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty: "higher",
    domain: "em-induction",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "structured",
      "Analyse velocity selection, chamber radius, and two-isotope detector separation in Bainbridge spectrometer",
      [],
      [
        "part: calculate velocity-selected ion speed",
        "part: determine semicircular curvature radius of lighter isotope",
        "part: compute detector strike separation between isotopes",
      ],
    ),
    stem,
    parts: bundle.parts,
    workedSolution: bundle.workedSolution,
    markScheme: bundle.markScheme,
    totalMarks: bundle.totalMarks,
  };
}

// ============================================================================
// PUBLIC GENERATOR ENTRYPOINT
// ============================================================================

type ArchetypeBuilderFn = (
  descriptor: EmInductionArchetypeDescriptor,
  variantIdx: number,
  format: QuestionFormat,
  id: string,
  seed: number,
) => CandidateQuestionInput;

const ARCHETYPE_BUILDERS: readonly ArchetypeBuilderFn[] = [
  buildArchetype1Item,
  buildArchetype2Item,
  buildArchetype3Item,
  buildArchetype4Item,
  buildArchetype5Item,
  buildArchetype6Item,
  buildArchetype7Item,
  buildArchetype8Item,
  buildArchetype9Item,
  buildArchetype10Item,
  buildArchetype11Item,
  buildArchetype12Item,
  buildArchetype13Item,
  buildArchetype14Item,
  buildArchetype15Item,
  buildArchetype16Item,
];

/**
 * Deterministically generates solver-verified `em-induction` question packages
 * across all 11 visual scenario kinds and 16 `(conceptId, templateArchetype)`
 * family groups (~65% Paper 1 MCQ, ~35% Paper 2 structured), strictly respecting
 * IB 2025 (SL/HL), UK A-Level (Y13), and NCUK IFY (IFY-S1/IFY-S2) boundaries.
 */
export function generateEmInductionCandidates(
  options: GenerateEmInductionCandidatesOptions = {},
): CandidateQuestionInput[] {
  const count = options.count ?? 320;
  const baseSeed = options.baseSeed ?? 810_000;
  const mcqFraction = options.mcqFraction ?? 0.65;

  if (!Number.isInteger(count) || count < 1 || count > 5000) {
    throw new Error(`count must be an integer in 1..5000; received ${String(count)}`);
  }
  if (!Number.isInteger(baseSeed)) {
    throw new Error(`baseSeed must be an integer; received ${String(baseSeed)}`);
  }
  if (!Number.isFinite(mcqFraction) || mcqFraction < 0 || mcqFraction > 1) {
    throw new Error(`mcqFraction must lie in [0, 1]; received ${String(mcqFraction)}`);
  }

  const targetMcqTotal = Math.round(count * mcqFraction);
  const numArchetypes = EM_INDUCTION_ARCHETYPE_CATALOGUE.length;
  const perArchCounts = Array.from({ length: numArchetypes }, (_, idx) =>
    Math.floor(count / numArchetypes) + (idx < count % numArchetypes ? 1 : 0),
  );

  // Distribute MCQ counts proportionally across archetypes so total MCQs == targetMcqTotal
  const rawMcqQuotas = perArchCounts.map((c) => c * mcqFraction);
  const perArchMcq = rawMcqQuotas.map((q) => Math.floor(q));
  let remainingMcq =
    targetMcqTotal - perArchMcq.reduce((sum, x) => sum + x, 0);
  const remainderOrder = rawMcqQuotas
    .map((q, idx) => ({ idx, frac: q - Math.floor(q) }))
    .sort((a, b) => b.frac - a.frac || a.idx - b.idx);
  for (let k = 0; k < remainderOrder.length && remainingMcq > 0; k += 1) {
    const archIdx = remainderOrder[k].idx;
    if (perArchMcq[archIdx] < perArchCounts[archIdx]) {
      perArchMcq[archIdx] += 1;
      remainingMcq -= 1;
    }
  }

  const candidates: CandidateQuestionInput[] = [];
  const acceptedStems: ExistingStemEntry[] = [];
  let globalIdx = 0;

  for (let archIdx = 0; archIdx < numArchetypes; archIdx += 1) {
    const descriptor = EM_INDUCTION_ARCHETYPE_CATALOGUE[archIdx];
    const builder = ARCHETYPE_BUILDERS[archIdx];
    const totalInArch = perArchCounts[archIdx];
    const mcqInArch = perArchMcq[archIdx];

    for (let localIdx = 0; localIdx < totalInArch; localIdx += 1) {
      globalIdx += 1;
      const format: QuestionFormat = localIdx < mcqInArch ? "mcq" : "structured";
      const id = `sp-em-ind-${format === "mcq" ? "mcq" : "struct"}-${String(globalIdx).padStart(4, "0")}`;

      let acceptedCandidate: CandidateQuestionInput | null = null;
      let acceptedFingerprint = "";
      let lastFailureSummary = "";

      for (let attempt = 0; attempt < 64; attempt += 1) {
        const variantIdx =
          attempt === 0
            ? localIdx
            : totalInArch + localIdx * 17 + attempt * 7;
        const itemSeed =
          baseSeed + archIdx * 10_007 + localIdx * 131 + attempt * 997;

        let candidate: CandidateQuestionInput;
        try {
          candidate = builder(descriptor, variantIdx, format, id, itemSeed);
        } catch (err) {
          lastFailureSummary =
            err instanceof Error ? err.message : String(err);
          continue;
        }

        const gateRun = verifyCandidateWithGate(candidate, {
          existingShardItems: acceptedStems,
          nearDuplicateSimilarityThreshold: 0.78,
        });
        if (gateRun.evaluation.valid) {
          acceptedCandidate = candidate;
          acceptedFingerprint = gateRun.evaluation.stemFingerprint;
          break;
        }
        lastFailureSummary = gateRun.evaluation.issues
          .map((iss) => `${iss.code}: ${iss.message}`)
          .join("; ");
      }

      if (!acceptedCandidate) {
        throw new Error(
          `Failed to synthesize gate-clean candidate for ${descriptor.templateArchetype} [${id}]: ${lastFailureSummary}`,
        );
      }

      const fullStemText =
        acceptedCandidate.format === "structured"
          ? [
              acceptedCandidate.stem,
              ...(acceptedCandidate.parts ?? []).map((p) => p.prompt),
            ].join(" ")
          : acceptedCandidate.stem;

      acceptedStems.push({
        id: acceptedCandidate.id,
        stem: fullStemText,
        stemFingerprint: acceptedFingerprint,
      });
      candidates.push(acceptedCandidate);
    }
  }

  return candidates;
}
