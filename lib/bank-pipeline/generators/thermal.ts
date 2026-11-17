import {
  buildOptionEquivalenceKey,
  computeShingleSet,
  textContainsNumericValue,
} from "@/lib/bank-pipeline/numeric-checker";
import { verifyCandidateWithGate } from "@/lib/bank-pipeline/package-gate";
import {
  CandidateQuestionInput,
  CandidateQuestionPlan,
  MarkSchemePoint,
  McqOptionItem,
  MCQ_OPTION_LABELS,
  QuestionDifficulty,
  QuestionFormat,
  RequiredGivenSpec,
  StructuredQuestionPart,
  SyllabusId,
  SyllabusTag,
} from "@/lib/bank-pipeline/types";
import {
  getCompatibleSyllabiForConcept,
  getSubtopicById,
  getTopicById,
} from "@/lib/constants/syllabi";
import {
  BOLTZMANN_CONSTANT,
  ELEMENTARY_CHARGE,
  KELVIN_OFFSET,
  MOLAR_GAS_CONSTANT,
  MONATOMIC_GAS_PRESETS,
  SOLID_CALORIMETRY_PRESETS,
  STEFAN_BOLTZMANN_CONSTANT,
  THERMAL_SUBSTANCE_PRESETS,
  WIEN_DISPLACEMENT_CONSTANT,
  CalorimetryMixingScenarioSpec,
  CarnotCycleScenarioSpec,
  createSeededRandom,
  KineticTheoryScenarioSpec,
  PhaseChangeScenarioSpec,
  SeededRandom,
  solveCalorimetryMixing,
  solveCarnotCycle,
  solveKineticTheory,
  solvePhaseChangeCurve,
  solveThermalRadiation,
  solveThermodynamicProcess,
  ThermalDiagramPlane,
  ThermalRadiationScenarioSpec,
  ThermalScenarioSpec,
  ThermodynamicProcessScenarioSpec,
} from "@/lib/visuals/thermal";

export const THERMAL_GENERATOR_VERSION = "thermal-generator/1.0.0" as const;

export const THERMAL_ARCHETYPE_CATALOGUE = [
  {
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "ideal-gas-state-pressure-density",
  },
  {
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "maxwell-boltzmann-rms-speed",
  },
  {
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "molecular-translational-kinetic-energy",
  },
  {
    conceptId: "ideal-gas-pv-cycles",
    templateArchetype: "gas-law-pt-vt-state-transitions",
  },
  {
    conceptId: "ideal-gas-pv-cycles",
    templateArchetype: "isobaric-isochoric-open-first-law",
  },
  {
    conceptId: "ideal-gas-pv-cycles",
    templateArchetype: "rectangular-pv-cycle-work-efficiency",
  },
  {
    conceptId: "thermodynamics-entropy-engines",
    templateArchetype: "adiabatic-monatomic-expansion-compression",
  },
  {
    conceptId: "thermodynamics-entropy-engines",
    templateArchetype: "isothermal-work-and-entropy-change",
  },
  {
    conceptId: "thermodynamics-entropy-engines",
    templateArchetype: "carnot-engine-efficiency-and-reservoirs",
  },
  {
    conceptId: "thermodynamics-entropy-engines",
    templateArchetype: "closed-adiabatic-heat-engine-cycle",
  },
  {
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "phase-change-heating-curve-energy",
  },
  {
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "electrical-heater-phase-change-power-time",
  },
  {
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "calorimetry-solid-liquid-equilibrium",
  },
  {
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "ice-water-latent-mixing-and-coexistence",
  },
  {
    conceptId: "thermal-conduction-radiation",
    templateArchetype: "blackbody-wien-stefan-boltzmann",
  },
  {
    conceptId: "greenhouse-albedo-energy-balance",
    templateArchetype: "greybody-emissivity-radiative-balance",
  },
] as const;

export type ThermalArchetypeSlug =
  (typeof THERMAL_ARCHETYPE_CATALOGUE)[number]["templateArchetype"];

export interface ThermalGeneratorOptions {
  readonly count?: number;
  readonly baseSeed?: number;
  readonly mcqFraction?: number;
  readonly generatorModel?: string;
  readonly syllabiFilter?: readonly SyllabusId[];
}

interface ArchetypeSyllabusPolicy {
  readonly ibForceHlOnly?: boolean;
  readonly ibSubtopicOverride?: string;
  readonly alevelSubtopicOverride?: string;
  readonly ncukSubtopicOverride?: string;
  readonly excludeSyllabi?: readonly SyllabusId[];
}

interface DistractorCandidate {
  readonly value: number;
  readonly rationale: string;
}

interface BuildSlotContext {
  readonly id: string;
  readonly seed: number;
  readonly rng: SeededRandom;
  readonly variantIndex: number;
  readonly format: QuestionFormat;
  readonly difficulty: QuestionDifficulty;
  readonly syllabi: SyllabusTag[];
  readonly generatorModel: string;
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

function toSup(exp: number): string {
  return [...String(exp)].map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch).join("");
}

/**
 * Formats a physical value to `sigFigs` significant figures using clean SI
 * decimal or Unicode `a × 10ᵇ` notation compatible with `numeric-checker`.
 */
export function formatThermalValue(value: number, sigFigs = 3): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot format non-finite thermal value: ${String(value)}`);
  }
  if (Math.abs(value) < 1e-15) {
    return "0";
  }
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 0.01 && abs < 1000) {
    return `${sign}${abs.toPrecision(sigFigs)}`;
  }
  const expStr = abs.toExponential(sigFigs - 1);
  const [mantissa, rawExp] = expStr.split("e");
  const exp = Number(rawExp);
  if (exp === 0) {
    return `${sign}${mantissa}`;
  }
  return `${sign}${mantissa} × 10${toSup(exp)}`;
}

/**
 * Formats an exact input datum cleanly without losing precision on 4-digit constants
 * such as 4180, 2100, 273.15, or 393.15 while using scientific notation for
 * very small or very large quantities.
 */
function fmtDatum(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid datum: ${String(value)}`);
  }
  if (Math.abs(value) < 1e-15) {
    return "0";
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 0.01 && abs < 10000) {
    const clean = Number(abs.toPrecision(6));
    return `${sign}${String(clean)}`;
  }
  const raw = Number(abs.toPrecision(4)).toExponential();
  const [mantissaRaw, expRaw] = raw.split("e");
  const mantissa = mantissaRaw.includes(".")
    ? mantissaRaw
    : `${mantissaRaw}.0`;
  return `${sign}${mantissa} × 10${toSup(Number(expRaw))}`;
}

function fmtWithUnit(value: number, unit: string, sigFigs = 3): string {
  const numStr = formatThermalValue(value, sigFigs);
  return unit ? `${numStr} ${unit}` : numStr;
}

function toScenarioRecord(spec: ThermalScenarioSpec): Record<string, unknown> {
  return { ...spec };
}

function resolveThermalSyllabi(
  conceptId: string,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
  policy: ArchetypeSyllabusPolicy = {},
  syllabiFilter?: readonly SyllabusId[],
): SyllabusTag[] {
  const mappings = getCompatibleSyllabiForConcept(conceptId, { format });
  const tags: SyllabusTag[] = [];

  for (const mapping of mappings) {
    if (policy.excludeSyllabi?.includes(mapping.syllabus)) {
      continue;
    }
    if (syllabiFilter && !syllabiFilter.includes(mapping.syllabus)) {
      continue;
    }

    let chosenSubtopicId: string | undefined;
    if (mapping.syllabus === "ib" && policy.ibSubtopicOverride) {
      chosenSubtopicId = mapping.subtopicIds.includes(policy.ibSubtopicOverride)
        ? policy.ibSubtopicOverride
        : undefined;
    } else if (mapping.syllabus === "alevel" && policy.alevelSubtopicOverride) {
      chosenSubtopicId = mapping.subtopicIds.includes(
        policy.alevelSubtopicOverride,
      )
        ? policy.alevelSubtopicOverride
        : undefined;
    } else if (mapping.syllabus === "ncuk" && policy.ncukSubtopicOverride) {
      chosenSubtopicId = mapping.subtopicIds.includes(
        policy.ncukSubtopicOverride,
      )
        ? policy.ncukSubtopicOverride
        : undefined;
    } else {
      chosenSubtopicId = mapping.subtopicIds[0];
    }

    if (!chosenSubtopicId) {
      continue;
    }

    const subtopicSpec = getSubtopicById(chosenSubtopicId);
    if (!subtopicSpec || !subtopicSpec.questionFormats.includes(format)) {
      continue;
    }

    const validLevels = mapping.levels.filter((lvl) => {
      if (mapping.syllabus === "ib" && policy.ibForceHlOnly && lvl !== "HL") {
        return false;
      }
      return subtopicSpec.levelsCovered.includes(lvl);
    });
    if (validLevels.length === 0) {
      continue;
    }

    let selectedLevel = validLevels[0];
    if (mapping.syllabus === "ib" && validLevels.length > 1) {
      selectedLevel =
        difficulty === "higher" || variantIndex % 3 === 2 ? "HL" : "SL";
    } else if (mapping.syllabus === "ncuk" && validLevels.length > 1) {
      const ifyIdx = validLevels.indexOf("IFY");
      if (ifyIdx >= 0 && variantIndex % 3 !== 1) {
        selectedLevel = "IFY";
      } else {
        selectedLevel =
          validLevels.find((lvl) => lvl !== "IFY") ?? validLevels[0];
      }
    }

    const matchingTopicId =
      mapping.topicIds.find((tid) =>
        getTopicById(tid)?.subtopics.some((s) => s.id === chosenSubtopicId),
      ) ?? mapping.topicIds[0];

    tags.push({
      syllabus: mapping.syllabus,
      level: selectedLevel,
      topicId: matchingTopicId,
      subtopicId: chosenSubtopicId,
    });
  }

  return tags;
}

function assembleMcqOptions(
  correctValue: number,
  unit: string,
  candidates: readonly DistractorCandidate[],
): { options: McqOptionItem[]; correctLabel: string } | null {
  const correctText = fmtWithUnit(correctValue, unit, 3);
  const usedKeys = new Set<string>([buildOptionEquivalenceKey(correctText)]);
  const chosenValues: number[] = [correctValue];
  const selectedDistractors: Array<{ text: string; rationale: string; value: number }> = [];

  for (const cand of candidates) {
    if (selectedDistractors.length >= 3) break;
    if (!Number.isFinite(cand.value)) continue;
    if (correctValue > 0 && cand.value <= 0) continue;
    if (correctValue < 0 && cand.value >= 0) continue;

    const tooClose = chosenValues.some((existing) => {
      const denom = Math.max(Math.abs(existing), Math.abs(cand.value), 1e-30);
      return Math.abs(cand.value - existing) / denom < 0.032;
    });
    if (tooClose) continue;

    const text = fmtWithUnit(cand.value, unit, 3);
    const eqKey = buildOptionEquivalenceKey(text);
    if (usedKeys.has(eqKey)) continue;

    usedKeys.add(eqKey);
    chosenValues.push(cand.value);
    selectedDistractors.push({
      text,
      rationale: cand.rationale,
      value: cand.value,
    });
  }

  if (selectedDistractors.length < 3) {
    const fallbackMultipliers = [0.5, 1.5, 2.0, 0.25, 3.0];
    for (const mult of fallbackMultipliers) {
      if (selectedDistractors.length >= 3) break;
      const altVal = correctValue * mult;
      const tooClose = chosenValues.some((existing) => {
        const denom = Math.max(Math.abs(existing), Math.abs(altVal), 1e-30);
        return Math.abs(altVal - existing) / denom < 0.032;
      });
      if (tooClose) continue;
      const text = fmtWithUnit(altVal, unit, 3);
      const eqKey = buildOptionEquivalenceKey(text);
      if (usedKeys.has(eqKey)) continue;
      usedKeys.add(eqKey);
      chosenValues.push(altVal);
      selectedDistractors.push({
        text,
        rationale:
          mult < 1
            ? "Applies an extra factor of one-half from misremembering the degrees-of-freedom or geometric prefactor."
            : "Introduces an extraneous integer factor when rearranging the governing thermal relation.",
        value: altVal,
      });
    }
  }

  if (selectedDistractors.length < 3) {
    return null;
  }

  const allEntries = [
    {
      value: correctValue,
      text: correctText,
      isCorrect: true,
      rationale: undefined as string | undefined,
    },
    ...selectedDistractors.map((d) => ({
      value: d.value,
      text: d.text,
      isCorrect: false,
      rationale: d.rationale,
    })),
  ].sort((a, b) => a.value - b.value);

  let correctLabel = "A";
  const options: McqOptionItem[] = allEntries.map((entry, idx) => {
    const label = MCQ_OPTION_LABELS[idx];
    if (entry.isCorrect) {
      correctLabel = label;
      return {
        label,
        text: entry.text,
        isCorrect: true,
      };
    }
    return {
      label,
      text: entry.text,
      isCorrect: false,
      distractorRationale: entry.rationale,
    };
  });

  return { options, correctLabel };
}

function stemAvoidsHiddenLeak(
  stem: string,
  requiredGivens: readonly RequiredGivenSpec[],
  hiddenKeys: readonly string[],
  quantities: Readonly<Record<string, number>>,
): boolean {
  for (const given of requiredGivens) {
    if (
      !textContainsNumericValue(stem, given.value, {
        significantFigures: 3,
        relativeTolerance: 0.01,
        allowMagnitudeMatch: true,
      })
    ) {
      return false;
    }
  }

  for (const hKey of hiddenKeys) {
    const hVal = quantities[hKey];
    if (typeof hVal !== "number" || !Number.isFinite(hVal) || Math.abs(hVal) <= 1e-12) {
      continue;
    }
    const matchesGiven = requiredGivens.some((g) => {
      const denom = Math.max(Math.abs(g.value), Math.abs(hVal), 1e-30);
      return Math.abs(g.value - hVal) / denom <= 0.006;
    });
    if (matchesGiven) continue;

    if (
      textContainsNumericValue(stem, hVal, {
        significantFigures: 3,
        relativeTolerance: 0.006,
      })
    ) {
      return false;
    }
  }

  // Also guard against SVG scale-exponent coincidence (10^5 = 1e5, 10^-3 = 1e-3, 10^-6 = 1e-6)
  const scalePowers = [1e-6, 1e-3, 1e3, 1e5, 1e6, 1e9];
  for (const hKey of hiddenKeys) {
    const hVal = quantities[hKey];
    if (typeof hVal !== "number" || !Number.isFinite(hVal) || Math.abs(hVal) <= 1e-12) {
      continue;
    }
    for (const sp of scalePowers) {
      if (Math.abs(Math.abs(hVal) - sp) / sp <= 0.0065) {
        return false;
      }
    }
  }

  return true;
}

function buildTwoMarkPartScheme(
  partId: string,
  methodCriterion: string,
  finalAnswerWithUnit: string,
): MarkSchemePoint[] {
  return [
    {
      code: "M1",
      partId,
      criterion: methodCriterion,
      marks: 1,
    },
    {
      code: "A1",
      partId,
      criterion: `Obtains ${finalAnswerWithUnit}.`,
      marks: 1,
    },
  ];
}

/* ========================================================================== */
/* Apparatus & Context Pools for High Stem Diversity                          */
/* ========================================================================== */

const GAS_VESSEL_CONTEXTS = [
  "a rigid stainless-steel vacuum-calibration tank",
  "a sealed quartz spectroscopy cell",
  "an orbital satellite attitude-control propellant cylinder",
  "a cryogenic buffer reservoir in a superconducting magnet rig",
  "a semiconductor lithography purge canister",
  "a high-vacuum synchrotron beamline gas target",
  "a thick-walled titanium deep-sea pressure housing",
  "a thermostatted noble-gas reference bulb",
  "an ion-propulsion xenon feed manifold",
  "a sealed borosilicate acoustic-thermometry sphere",
  "an atmospheric research dropsonde reference chamber",
  "a laser-interferometer gas-cell enclosure",
] as const;

const PISTON_ENGINE_CONTEXTS = [
  "a frictionless piston-cylinder assembly on a thermodynamics test bench",
  "a closed-cycle Stirling regenerator test cell",
  "a solar-thermal helium Brayton demonstrator cylinder",
  "a precision pneumatic actuator chamber sealed with a movable piston",
  "a micro-electro-mechanical gas spring cavity",
  "a cryocooler compression cylinder containing monatomic working gas",
  "a laboratory heat-engine indicator rig with low-friction seals",
  "an insulated aerospace gas-accumulator cylinder",
  "a closed noble-gas power-conversion loop",
  "a variable-volume optical pressure cell",
  "a high-efficiency reciprocating research engine cylinder",
  "a magnetically coupled piston calorimeter chamber",
] as const;

const PHASE_CURVE_CONTEXTS = [
  "an insulated differential thermal analysis crucible",
  "a lagged laboratory phase-transition calorimeter",
  "a metallurgical vacuum-induction melting pot",
  "a thermal-energy-storage phase-change capsule",
  "an automated cryostat sample holder",
  "a sealed industrial distillation reboiler test cell",
  "a ceramic-lined materials characterization furnace",
  "a guarded electrical immersion-heating vessel",
  "a spacecraft latent-heat thermal-buffer canister",
  "a precision constant-flux heating chamber",
  "an adiabatic micro-calorimeter ampoule",
  "a vacuum-jacketed phase-equilibrium test cell",
  "a solar-salt thermal-storage prototype module",
  "a high-purity zone-refining crucible",
] as const;

const CALORIMETRY_MIXING_CONTEXTS = [
  "a well-insulated copper-lined laboratory calorimeter",
  "a double-walled vacuum Dewar mixing vessel",
  "an expanded-polystyrene adiabatic quenching bath",
  "a precision isothermal-jacket mixing cup",
  "a lagged benchtop thermal-equilibrium chamber",
  "a sealed foam-insulated metallurgical quench tank",
  "a low-heat-capacity polymeric calorimetry beaker",
  "an undergraduate physics thermal-mixing apparatus",
  "a stirred insulated immersion calorimeter",
  "a thermally isolated materials-testing bath",
  "a vacuum-insulated stainless-steel Dewar flask",
  "a closed-lid magnetic-stirrer calorimetry pot",
  "a thick-walled cork-lagged enthalpy cell",
  "a calibrated heat-transfer bench vessel",
] as const;

const BLACKBODY_CONTEXTS = [
  "a spherical main-sequence stellar photosphere",
  "an isothermal silicon-carbide calibration cavity",
  "a high-temperature graphite blackbody furnace aperture",
  "a nearby solar-type star modelled as an ideal spherical radiator",
  "a metrological Planckian reference source",
  "a luminous A-type stellar photosphere",
  "an incandescent refractory-metal calibration sphere",
  "an exoplanet host star in radiative equilibrium",
  "a vacuum-chamber blackbody radiometer target",
  "a K-dwarf stellar surface",
  "a tungsten-halide national standards cavity radiator",
  "an orange subgiant photospheric shell",
] as const;

const GREYBODY_CLIMATE_CONTEXTS = [
  "a horizontal basaltic planetary regolith tile",
  "an arid continental land-surface test plot",
  "an orbital spacecraft thermal-control radiator panel",
  "a dark oceanic mixed-layer surface patch",
  "a polar sea-ice radiative-balance monitoring sector",
  "a selectively coated solar-thermal collector plate",
  "a Martian mid-latitude rocky plain element",
  "a high-altitude alpine glacier surface zone",
  "an instrumented rooftop longwave-emissivity test slab",
  "a geostationary satellite nadir heat-rejection louver",
  "a lunar mare regolith radiometry quadrat",
  "a sub-arctic tundra permafrost flux-tower footprint",
  "a deep-space probe aluminium-kapton radiator fin",
  "a coastal upwelling sea-surface calibration zone",
] as const;

/* ========================================================================== */
/* 1. ideal-gas-kinetic-theory :: ideal-gas-state-pressure-density            */
/* ========================================================================== */

function buildIdealGasStatePressureDensity(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const gas = MONATOMIC_GAS_PRESETS[variantIndex % MONATOMIC_GAS_PRESETS.length];
  const vessel = GAS_VESSEL_CONTEXTS[variantIndex % GAS_VESSEL_CONTEXTS.length];
  const molesPool = [0.15, 0.25, 0.35, 0.45, 0.65, 0.85, 1.2, 1.6, 2.2, 2.8];
  const volumePool = [0.008, 0.012, 0.016, 0.024, 0.032, 0.045, 0.06, 0.075];
  const tempCPool = [17, 27, 47, 67, 87, 117, 147, 177, 227];

  const moles = rng.pick(molesPool);
  const volumeM3 = rng.pick(volumePool);
  const useCelsius = variantIndex % 2 === 1;
  const tempC = rng.pick(tempCPool);
  const temperatureK = useCelsius
    ? Number((tempC + KELVIN_OFFSET).toFixed(2))
    : rng.pick([240, 280, 310, 340, 380, 420, 460, 520]);

  const spec: KineticTheoryScenarioSpec = {
    kind: "kinetic-theory",
    gasLabel: gas.label,
    temperatureK,
    molarMassKgPerMol: gas.molarMassKgPerMol,
    moles,
    volumeM3,
    showCharacteristicSpeeds: false,
  };
  const sol = solveKineticTheory(spec);
  const hiddenQuantities = [
    "pressurePa",
    "densityKgPerM3",
    "particleMassKg",
    "rmsSpeedMs",
    "meanSpeedMs",
    "mostProbableSpeedMs",
    "averageKineticEnergyJ",
    "averageKineticEnergyEv",
    "molarInternalEnergyJPerMol",
  ];

  const molarMassG = Number((gas.molarMassKgPerMol * 1e3).toPrecision(4));
  const useGramsPerMol = variantIndex % 3 !== 0;
  const massText = useGramsPerMol
    ? `${fmtDatum(molarMassG)} g mol⁻¹`
    : `${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹`;
  const tempText = useCelsius
    ? `${fmtDatum(tempC)} °C (take T(K) = θ(°C) + 273.15)`
    : `${fmtDatum(temperatureK)} K`;

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "moles", value: moles, unit: "mol", source: "stem" },
    { name: "volumeM3", value: volumeM3, unit: "m³", source: "stem" },
    { name: "temperatureK", value: temperatureK, unit: "K", source: "stem" },
    {
      name: "molarMassKgPerMol",
      value: gas.molarMassKgPerMol,
      unit: "kg mol⁻¹",
      source: "stem",
    },
  ];

  if (format === "mcq") {
    const askDensity = variantIndex % 3 === 2;
    const targetKey = askDensity ? "densityKgPerM3" : "pressurePa";
    const targetUnit = askDensity ? "kg m⁻³" : "Pa";
    const truth = sol.quantities[targetKey];

    const stemTemplates = askDensity
      ? [
          `Inside ${vessel} of internal volume ${fmtDatum(volumeM3)} m³, ${fmtDatum(moles)} mol of ideal ${gas.label} gas (molar mass ${massText}) is maintained at ${tempText}. Taking R = 8.31 J mol⁻¹ K⁻¹, what is the mass density of the gas?`,
          `Engineers charge ${vessel} (capacity ${fmtDatum(volumeM3)} m³) with ${fmtDatum(moles)} mol of ${gas.label} of molar mass ${massText} at an equilibrium temperature of ${tempText} (R = 8.31 J mol⁻¹ K⁻¹). Determine the density of the confined gas.`,
          `A sample of ${fmtDatum(moles)} mol of monatomic ${gas.label} (M = ${massText}) occupies ${vessel} of fixed volume ${fmtDatum(volumeM3)} m³ at ${tempText}. Given R = 8.31 J mol⁻¹ K⁻¹, calculate the bulk density ρ of the gas.`,
          `At ${tempText}, ${vessel} holds ${fmtDatum(moles)} mol of ${gas.label} gas (molar mass ${massText}) within a chamber volume of ${fmtDatum(volumeM3)} m³ (R = 8.31 J mol⁻¹ K⁻¹). Which value gives the gas density?`,
        ]
      : [
          `In ${vessel} of volume ${fmtDatum(volumeM3)} m³, ${fmtDatum(moles)} mol of ${gas.label} (molar mass ${massText}) is held in thermal equilibrium at ${tempText}. Taking R = 8.31 J mol⁻¹ K⁻¹, what pressure does the gas exert on the walls?`,
          `A technician seals ${fmtDatum(moles)} mol of ideal ${gas.label} gas (M = ${massText}) inside ${vessel} of volume ${fmtDatum(volumeM3)} m³ at ${tempText}. Using R = 8.31 J mol⁻¹ K⁻¹, calculate the absolute gas pressure.`,
          `During an instrument check, ${vessel} of internal volume ${fmtDatum(volumeM3)} m³ contains ${fmtDatum(moles)} mol of ${gas.label} (molar mass ${massText}) at ${tempText} (R = 8.31 J mol⁻¹ K⁻¹). What is the pressure inside the chamber?`,
          `${fmtDatum(moles)} mol of monatomic ${gas.label} (molar mass ${massText}) fills ${vessel} of volume ${fmtDatum(volumeM3)} m³ at a steady temperature of ${tempText}. Take R = 8.31 J mol⁻¹ K⁻¹. Find the gas pressure.`,
          `Measured at ${tempText}, ${vessel} encloses ${fmtDatum(moles)} mol of ${gas.label} gas (M = ${massText}) in a fixed ${fmtDatum(volumeM3)} m³ cavity. With R = 8.31 J mol⁻¹ K⁻¹, which pressure reading is expected?`,
        ];

    const stem = stemTemplates[variantIndex % stemTemplates.length];
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const distractors: DistractorCandidate[] = askDensity
      ? [
          {
            value: (moles * molarMassG) / volumeM3,
            rationale:
              "Leaves molar mass in g mol⁻¹ instead of converting to kg mol⁻¹, overestimating density by a factor of 1000.",
          },
          {
            value: moles / volumeM3,
            rationale:
              "Computes molar concentration n / V (mol m⁻³) and omits multiplication by molar mass M.",
          },
          {
            value: moles * gas.molarMassKgPerMol * volumeM3,
            rationale:
              "Multiplies total gas mass nM by container volume V instead of dividing by V.",
          },
          {
            value: volumeM3 / (moles * gas.molarMassKgPerMol),
            rationale:
              "Calculates specific volume V / m rather than mass density m / V.",
          },
        ]
      : [
          ...(useCelsius
            ? [
                {
                  value: (moles * MOLAR_GAS_CONSTANT * tempC) / volumeM3,
                  rationale:
                    "Substitutes Celsius temperature θ directly into pV = nRT without converting to absolute temperature in kelvin.",
                },
              ]
            : [
                {
                  value:
                    (moles * MOLAR_GAS_CONSTANT * Math.max(15, temperatureK - 273.15)) /
                    volumeM3,
                  rationale:
                    "Subtracts 273.15 from an already-kelvin temperature before applying pV = nRT.",
                },
              ]),
          {
            value: (MOLAR_GAS_CONSTANT * temperatureK) / volumeM3,
            rationale:
              "Omits the amount of substance n in p = nRT / V, solving for 1 mol instead of the given molar amount.",
          },
          {
            value: moles * MOLAR_GAS_CONSTANT * temperatureK * volumeM3,
            rationale:
              "Multiplies nRT by volume V instead of dividing nRT by V.",
          },
          {
            value: (1.5 * moles * MOLAR_GAS_CONSTANT * temperatureK) / volumeM3,
            rationale:
              "Inserts the internal-energy factor 3/2 into the ideal gas pressure equation, computing U / V instead of p = nRT / V.",
          },
        ];

    const mcq = assembleMcqOptions(truth, targetUnit, distractors);
    if (!mcq) return null;

    const ansFormatted = fmtWithUnit(truth, targetUnit, 3);
    const workedSolution = askDensity
      ? `Total gas mass m = nM = ${fmtDatum(moles)} × ${fmtDatum(gas.molarMassKgPerMol)} = ${formatThermalValue(moles * gas.molarMassKgPerMol, 4)} kg. Density ρ = m / V = ${formatThermalValue(moles * gas.molarMassKgPerMol, 4)} / ${fmtDatum(volumeM3)} = ${ansFormatted}.`
      : `${useCelsius ? `Convert temperature to kelvin: T = ${fmtDatum(tempC)} + 273.15 = ${fmtDatum(temperatureK)} K. ` : ""}From the ideal gas equation p = nRT / V = (${fmtDatum(moles)} × 8.31 × ${fmtDatum(temperatureK)}) / ${fmtDatum(volumeM3)} = ${ansFormatted}.`;

    const questionPlan: CandidateQuestionPlan = {
      targetSummary: `Evaluate macroscopic ideal gas ${askDensity ? "mass density" : "pressure"} from equation-of-state parameters`,
      distractorStrategy: [
        "kelvin-celsius-offset-omission",
        "molar-mass-gram-to-kilogram-slip",
        "volume-multiplication-inversion",
      ],
      assumptions: ["Ideal monatomic gas in thermal equilibrium inside a rigid container"],
    };

    return {
      id,
      conceptId: "ideal-gas-kinetic-theory",
      templateArchetype: "ideal-gas-state-pressure-density",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan,
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution,
      markScheme: [
        {
          code: "A1",
          criterion: `Applies ${askDensity ? "ρ = nM / V" : "p = nRT / V"} in SI units to obtain ${ansFormatted} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2
  const structStems = [
    `A sample of ${fmtDatum(moles)} mol of monatomic ${gas.label} gas (molar mass ${massText}) is sealed inside ${vessel} of constant volume ${fmtDatum(volumeM3)} m³ at ${tempText}. Take R = 8.31 J mol⁻¹ K⁻¹ and N_A = 6.02 × 10²³ mol⁻¹.`,
    `During a calibration experiment, ${vessel} of internal volume ${fmtDatum(volumeM3)} m³ is filled with ${fmtDatum(moles)} mol of ideal ${gas.label} gas of molar mass ${massText} and stabilised at ${tempText}. Use R = 8.31 J mol⁻¹ K⁻¹ and N_A = 6.02 × 10²³ mol⁻¹.`,
    `Engineers monitor ${fmtDatum(moles)} mol of ${gas.label} (M = ${massText}) confined within ${vessel} of volume ${fmtDatum(volumeM3)} m³ at an equilibrium temperature of ${tempText} (R = 8.31 J mol⁻¹ K⁻¹, N_A = 6.02 × 10²³ mol⁻¹).`,
    `Within ${vessel} (fixed capacity ${fmtDatum(volumeM3)} m³), ${fmtDatum(moles)} mol of pure ${gas.label} gas with molar mass ${massText} rests in thermal equilibrium at ${tempText}. Take R = 8.31 J mol⁻¹ K⁻¹ and N_A = 6.02 × 10²³ mol⁻¹.`,
  ];
  const stem = structStems[variantIndex % structStems.length];
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const pAns = fmtWithUnit(sol.quantities.pressurePa, "Pa", 3);
  const mAtomAns = fmtWithUnit(sol.quantities.particleMassKg, "kg", 3);
  const rhoAns = fmtWithUnit(sol.quantities.densityKgPerM3, "kg m⁻³", 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: "Calculate the pressure exerted by the gas on the walls of the vessel.",
      marks: 2,
      targetQuantityKey: "pressurePa",
      expectedAnswer: pAns,
      workingSteps: [
        ...(useCelsius
          ? [`T = ${fmtDatum(tempC)} + 273.15 = ${fmtDatum(temperatureK)} K.`]
          : []),
        `p = nRT / V = (${fmtDatum(moles)} × 8.31 × ${fmtDatum(temperatureK)}) / ${fmtDatum(volumeM3)} = ${pAns}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the mass of a single ${gas.label} atom in kilograms.`,
      marks: 2,
      targetQuantityKey: "particleMassKg",
      expectedAnswer: mAtomAns,
      workingSteps: [
        `m = M / N_A = ${fmtDatum(gas.molarMassKgPerMol)} / (6.02 × 10²³) = ${mAtomAns}.`,
      ],
    },
    {
      partId: "c",
      prompt: "Calculate the macroscopic density of the gas inside the vessel.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "densityKgPerM3",
      expectedAnswer: rhoAns,
      workingSteps: [
        `Total mass m_tot = nM = ${fmtDatum(moles)} × ${fmtDatum(gas.molarMassKgPerMol)} = ${formatThermalValue(moles * gas.molarMassKgPerMol, 4)} kg.`,
        `ρ = m_tot / V = ${rhoAns}.`,
      ],
    },
  ];

  const markScheme: MarkSchemePoint[] = [
    ...buildTwoMarkPartScheme("a", "Substitutes Kelvin temperature into p = nRT / V.", pAns),
    ...buildTwoMarkPartScheme(
      "b",
      "Converts molar mass to kg mol⁻¹ and divides by Avogadro constant.",
      mAtomAns,
    ),
    ...buildTwoMarkPartScheme("c", "Evaluates ρ = nM / V in SI units.", rhoAns),
  ];

  return {
    id,
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "ideal-gas-state-pressure-density",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Determine ideal gas pressure, single-atom mass, and bulk gas density in a rigid container",
      subpartStrategy: [
        "Macroscopic gas pressure via equation of state",
        "Atomic mass from molar mass and Avogadro constant",
        "Gas mass density from molar mass and container volume",
      ],
      assumptions: ["Ideal monatomic gas in a constant-volume vessel"],
    },
    stem,
    parts,
    workedSolution: `(a) p = nRT / V = (${fmtDatum(moles)} × 8.31 × ${fmtDatum(temperatureK)}) / ${fmtDatum(volumeM3)} = ${pAns}. (b) Single-atom mass m = M / N_A = ${mAtomAns}. (c) Density ρ = nM / V = ${rhoAns}.`,
    markScheme,
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* 2. ideal-gas-kinetic-theory :: maxwell-boltzmann-rms-speed                 */
/* ========================================================================== */

function buildMaxwellBoltzmannRmsSpeed(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const gas = MONATOMIC_GAS_PRESETS[(variantIndex + 1) % MONATOMIC_GAS_PRESETS.length];
  const vessel = GAS_VESSEL_CONTEXTS[(variantIndex + 3) % GAS_VESSEL_CONTEXTS.length];

  const baseTemps = [210, 250, 290, 320, 360, 410, 480, 550];
  const temperatureK = rng.pick(baseTemps);
  const withComparison = format === "structured" || variantIndex % 3 === 1;
  const compMultipliers = [1.5, 1.8, 2.25, 2.5];
  const comparisonTemperatureK = withComparison
    ? Math.round(temperatureK * rng.pick(compMultipliers))
    : undefined;

  const moles = rng.pick([0.3, 0.5, 0.8, 1.2, 1.5, 2.0]);
  const volumeM3 = rng.pick([0.015, 0.025, 0.04, 0.05, 0.08]);

  const spec: KineticTheoryScenarioSpec = {
    kind: "kinetic-theory",
    gasLabel: gas.label,
    temperatureK,
    molarMassKgPerMol: gas.molarMassKgPerMol,
    moles,
    volumeM3,
    ...(comparisonTemperatureK !== undefined ? { comparisonTemperatureK } : {}),
  };
  const sol = solveKineticTheory(spec);
  const hiddenQuantities = [
    "rmsSpeedMs",
    "meanSpeedMs",
    "mostProbableSpeedMs",
    "pressurePa",
    "densityKgPerM3",
    "averageKineticEnergyJ",
    "averageKineticEnergyEv",
    "molarInternalEnergyJPerMol",
    ...(comparisonTemperatureK !== undefined
      ? [
          "comparisonRmsSpeedMs",
          "comparisonMeanSpeedMs",
          "comparisonMostProbableSpeedMs",
          "comparisonAverageKineticEnergyJ",
        ]
      : []),
  ];

  const molarMassG = Number((gas.molarMassKgPerMol * 1e3).toPrecision(4));
  const giveGrams = variantIndex % 2 === 0;
  const massPhrase = giveGrams
    ? `${fmtDatum(molarMassG)} g mol⁻¹`
    : `${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹`;

  const hasNcuk = syllabi.some((s) => s.syllabus === "ncuk");
  const kineticNote = hasNcuk
    ? " (kinetic-theory pressure relation: pV = ⅓ N m v_rms²)"
    : "";

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "temperatureK", value: temperatureK, unit: "K", source: "stem" },
    {
      name: "molarMassKgPerMol",
      value: gas.molarMassKgPerMol,
      unit: "kg mol⁻¹",
      source: "stem",
    },
    { name: "moles", value: moles, unit: "mol", source: "stem" },
    { name: "volumeM3", value: volumeM3, unit: "m³", source: "stem" },
    ...(comparisonTemperatureK !== undefined
      ? [
          {
            name: "comparisonTemperatureK",
            value: comparisonTemperatureK,
            unit: "K",
            source: "stem" as const,
          },
        ]
      : []),
  ];

  if (format === "mcq") {
    const targetComp = comparisonTemperatureK !== undefined;
    const targetKey = targetComp ? "comparisonRmsSpeedMs" : "rmsSpeedMs";
    const truth = sol.quantities[targetKey];
    const activeT = targetComp ? comparisonTemperatureK! : temperatureK;

    const stems = targetComp
      ? [
          `The Maxwell–Boltzmann speed distribution shows ${fmtDatum(moles)} mol of ${gas.label} (molar mass ${massPhrase}) in ${vessel} of volume ${fmtDatum(volumeM3)} m³ initially at T₁ = ${fmtDatum(temperatureK)} K (solid curve) and after isochoric heating to T₂ = ${fmtDatum(comparisonTemperatureK!)} K (dashed curve). Taking R = 8.31 J mol⁻¹ K⁻¹${kineticNote}, what is the root-mean-square speed of the atoms at T₂?`,
          `In ${vessel} (volume ${fmtDatum(volumeM3)} m³), ${fmtDatum(moles)} mol of monatomic ${gas.label} of molar mass ${massPhrase} is warmed from T₁ = ${fmtDatum(temperatureK)} K to T₂ = ${fmtDatum(comparisonTemperatureK!)} K, shifting the Maxwell–Boltzmann speed curve as plotted. Given R = 8.31 J mol⁻¹ K⁻¹${kineticNote}, determine v_rms at the higher temperature T₂.`,
          `Two Maxwell–Boltzmann curves are plotted for ${fmtDatum(moles)} mol of ${gas.label} (M = ${massPhrase}) confined to ${fmtDatum(volumeM3)} m³ inside ${vessel}: T₁ = ${fmtDatum(temperatureK)} K and T₂ = ${fmtDatum(comparisonTemperatureK!)} K. Using R = 8.31 J mol⁻¹ K⁻¹${kineticNote}, calculate the rms molecular speed at T₂.`,
        ]
      : [
          `The graph shows the Maxwell–Boltzmann molecular speed distribution for ${fmtDatum(moles)} mol of ideal ${gas.label} gas (molar mass ${massPhrase}) inside ${vessel} of volume ${fmtDatum(volumeM3)} m³ at ${fmtDatum(temperatureK)} K. Take R = 8.31 J mol⁻¹ K⁻¹${kineticNote}. What is the root-mean-square (rms) speed of the atoms?`,
          `Within ${vessel} of volume ${fmtDatum(volumeM3)} m³, ${fmtDatum(moles)} mol of monatomic ${gas.label} (M = ${massPhrase}) is maintained at ${fmtDatum(temperatureK)} K as represented by the speed distribution curve. Given R = 8.31 J mol⁻¹ K⁻¹${kineticNote}, find v_rms of the gas particles.`,
          `An experiment records the molecular speed distribution of ${fmtDatum(moles)} mol of ${gas.label} gas (molar mass ${massPhrase}) occupying ${fmtDatum(volumeM3)} m³ in ${vessel} at ${fmtDatum(temperatureK)} K (R = 8.31 J mol⁻¹ K⁻¹${kineticNote}). Which value equals the rms speed of the atoms?`,
          `At ${fmtDatum(temperatureK)} K, ${fmtDatum(moles)} mol of ${gas.label} with molar mass ${massPhrase} fills ${vessel} (capacity ${fmtDatum(volumeM3)} m³). Using R = 8.31 J mol⁻¹ K⁻¹${kineticNote}, calculate the root-mean-square speed marked v_rms on the distribution.`,
        ];

    const stem = stems[variantIndex % stems.length];
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const distractors: DistractorCandidate[] = [
      {
        value: Math.sqrt((3 * MOLAR_GAS_CONSTANT * activeT) / molarMassG),
        rationale:
          "Substitutes molar mass in g mol⁻¹ instead of kg mol⁻¹ into √(3RT / M), underestimating v_rms by a factor of √1000 ≈ 31.6.",
      },
      {
        value: Math.sqrt((2 * MOLAR_GAS_CONSTANT * activeT) / gas.molarMassKgPerMol),
        rationale:
          "Uses a factor of 2 instead of 3, computing the most probable speed v_p = √(2RT / M) rather than v_rms.",
      },
      {
        value: Math.sqrt((MOLAR_GAS_CONSTANT * activeT) / gas.molarMassKgPerMol),
        rationale:
          "Omits the factor of 3 from the three translational degrees of freedom, evaluating √(RT / M).",
      },
      ...(targetComp
        ? [
            {
              value:
                sol.quantities.rmsSpeedMs * (comparisonTemperatureK! / temperatureK),
              rationale:
                "Scales rms speed linearly with T₂ / T₁ instead of √(T₂ / T₁).",
            },
          ]
        : [
            {
              value: (3 * MOLAR_GAS_CONSTANT * activeT) / gas.molarMassKgPerMol,
              rationale:
                "Reports mean-square speed ⟨v²⟩ = 3RT / M without taking the square root.",
            },
          ]),
    ];

    const mcq = assembleMcqOptions(truth, "m s⁻¹", distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, "m s⁻¹", 3);

    return {
      id,
      conceptId: "ideal-gas-kinetic-theory",
      templateArchetype: "maxwell-boltzmann-rms-speed",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Calculate root-mean-square molecular speed from Maxwell-Boltzmann kinetic theory",
        distractorStrategy: [
          "molar-mass-gram-unit-trap",
          "most-probable-vs-rms-factor-two",
          "missing-factor-three-or-square-root",
        ],
        assumptions: ["Monatomic ideal gas obeying Maxwell-Boltzmann statistics"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution: `Convert molar mass to SI units: M = ${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹. Using v_rms = √(3RT / M) at T = ${fmtDatum(activeT)} K gives v_rms = √(3 × 8.31 × ${fmtDatum(activeT)} / ${fmtDatum(gas.molarMassKgPerMol)}) = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates √(3RT / M) with M in kg mol⁻¹ to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (always has comparisonTemperatureK)
  const structStems = [
    `The figure displays Maxwell–Boltzmann speed distributions for ${fmtDatum(moles)} mol of monatomic ${gas.label} (molar mass ${massPhrase}) sealed in ${vessel} of rigid volume ${fmtDatum(volumeM3)} m³ at T₁ = ${fmtDatum(temperatureK)} K (solid curve) and after heating to T₂ = ${fmtDatum(comparisonTemperatureK!)} K (dashed curve). Take R = 8.31 J mol⁻¹ K⁻¹${kineticNote}.`,
    `Inside ${vessel} of fixed volume ${fmtDatum(volumeM3)} m³, ${fmtDatum(moles)} mol of ideal ${gas.label} gas (M = ${massPhrase}) is heated at constant volume from T₁ = ${fmtDatum(temperatureK)} K to T₂ = ${fmtDatum(comparisonTemperatureK!)} K, producing the two speed distributions shown. Use R = 8.31 J mol⁻¹ K⁻¹${kineticNote}.`,
    `A sample of ${fmtDatum(moles)} mol of ${gas.label} (molar mass ${massPhrase}) occupies ${fmtDatum(volumeM3)} m³ within ${vessel}. The solid curve shows its speed distribution at T₁ = ${fmtDatum(temperatureK)} K and the dashed curve at T₂ = ${fmtDatum(comparisonTemperatureK!)} K (R = 8.31 J mol⁻¹ K⁻¹${kineticNote}).`,
  ];
  const stem = structStems[variantIndex % structStems.length];
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const v1Ans = fmtWithUnit(sol.quantities.rmsSpeedMs, "m s⁻¹", 3);
  const p1Ans = fmtWithUnit(sol.quantities.pressurePa, "Pa", 3);
  const v2Ans = fmtWithUnit(sol.quantities.comparisonRmsSpeedMs, "m s⁻¹", 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: `Calculate the root-mean-square speed v_rms of the ${gas.label} atoms at T₁ = ${fmtDatum(temperatureK)} K.`,
      marks: 2,
      targetQuantityKey: "rmsSpeedMs",
      expectedAnswer: v1Ans,
      workingSteps: [
        `M = ${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹.`,
        `v_rms,1 = √(3 R T₁ / M) = √(3 × 8.31 × ${fmtDatum(temperatureK)} / ${fmtDatum(gas.molarMassKgPerMol)}) = ${v1Ans}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Calculate the gas pressure inside the vessel at T₁ = ${fmtDatum(temperatureK)} K.`,
      marks: 2,
      targetQuantityKey: "pressurePa",
      expectedAnswer: p1Ans,
      workingSteps: [
        `p₁ = n R T₁ / V = (${fmtDatum(moles)} × 8.31 × ${fmtDatum(temperatureK)}) / ${fmtDatum(volumeM3)} = ${p1Ans}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Determine the new root-mean-square speed of the atoms when heated to T₂ = ${fmtDatum(comparisonTemperatureK!)} K.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "comparisonRmsSpeedMs",
      expectedAnswer: v2Ans,
      workingSteps: [
        `v_rms,2 = v_rms,1 √(T₂ / T₁) = √(3 × 8.31 × ${fmtDatum(comparisonTemperatureK!)} / ${fmtDatum(gas.molarMassKgPerMol)}) = ${v2Ans}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "maxwell-boltzmann-rms-speed",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Relate Maxwell-Boltzmann rms molecular speed, gas pressure, and temperature scaling",
      subpartStrategy: [
        "Initial rms speed at T1 using molar mass in SI units",
        "Initial macroscopic gas pressure at T1",
        "Shifted rms speed at higher temperature T2",
      ],
      assumptions: ["Constant-volume monatomic ideal gas"],
    },
    stem,
    parts,
    workedSolution: `(a) With M = ${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹, v_rms,1 = √(3 × 8.31 × ${fmtDatum(temperatureK)} / ${fmtDatum(gas.molarMassKgPerMol)}) = ${v1Ans}. (b) p₁ = nRT₁ / V = ${p1Ans}. (c) At T₂ = ${fmtDatum(comparisonTemperatureK!)} K, v_rms,2 = ${v2Ans}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Uses v_rms = √(3RT₁ / M) with M in kg mol⁻¹.", v1Ans),
      ...buildTwoMarkPartScheme("b", "Applies p = nRT₁ / V.", p1Ans),
      ...buildTwoMarkPartScheme("c", "Scales v_rms by √(T₂ / T₁) or re-evaluates √(3RT₂ / M).", v2Ans),
    ],
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* 3. ideal-gas-kinetic-theory :: molecular-translational-kinetic-energy      */
/* ========================================================================== */

function buildMolecularKineticEnergy(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const gas = MONATOMIC_GAS_PRESETS[(variantIndex + 2) % MONATOMIC_GAS_PRESETS.length];
  const vessel = GAS_VESSEL_CONTEXTS[(variantIndex + 5) % GAS_VESSEL_CONTEXTS.length];

  const useCelsius = variantIndex % 3 === 1;
  const tempC = rng.pick([25, 57, 97, 137, 187, 247, 327]);
  const temperatureK = useCelsius
    ? Number((tempC + KELVIN_OFFSET).toFixed(2))
    : rng.pick([180, 260, 310, 370, 440, 540, 680, 820]);

  const spec: KineticTheoryScenarioSpec = {
    kind: "kinetic-theory",
    gasLabel: gas.label,
    temperatureK,
    molarMassKgPerMol: gas.molarMassKgPerMol,
  };
  const sol = solveKineticTheory(spec);
  const hiddenQuantities = [
    "averageKineticEnergyJ",
    "averageKineticEnergyEv",
    "molarInternalEnergyJPerMol",
    "rmsSpeedMs",
    "meanSpeedMs",
    "mostProbableSpeedMs",
    "particleMassKg",
  ];

  const tempPhrase = useCelsius
    ? `${fmtDatum(tempC)} °C (take T(K) = θ(°C) + 273.15)`
    : `${fmtDatum(temperatureK)} K`;

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "temperatureK", value: temperatureK, unit: "K", source: "stem" },
    {
      name: "molarMassKgPerMol",
      value: gas.molarMassKgPerMol,
      unit: "kg mol⁻¹",
      source: "stem",
    },
  ];

  if (format === "mcq") {
    const mode = variantIndex % 2;
    const targetKey =
      mode === 0 ? "averageKineticEnergyEv" : "molarInternalEnergyJPerMol";
    const targetUnit = mode === 0 ? "eV" : "J mol⁻¹";
    const truth = sol.quantities[targetKey];

    const constantsClause =
      mode === 0
        ? rng.pick([
            "Take k_B = 1.38 × 10⁻²³ J K⁻¹ and e = 1.60 × 10⁻¹⁹ C.",
            "Use Boltzmann constant 1.38 × 10⁻²³ J K⁻¹ and elementary charge 1.60 × 10⁻¹⁹ C.",
            "Given k_B = 1.38 × 10⁻²³ J K⁻¹ and 1 eV = 1.60 × 10⁻¹⁹ J,",
          ])
        : rng.pick([
            "Take R = 8.31 J mol⁻¹ K⁻¹.",
            "Use molar gas constant R = 8.31 J mol⁻¹ K⁻¹.",
            "Given R = 8.31 J mol⁻¹ K⁻¹,",
          ]);

    const questionAsk =
      mode === 0
        ? rng.pick([
            "What is the mean translational kinetic energy per atom in electronvolts?",
            "Find the average translational kinetic energy of a single atom in eV.",
            "Determine the mean kinetic energy per atom expressed in eV.",
          ])
        : rng.pick([
            "What is the molar internal energy of this ideal monatomic gas?",
            "Calculate the internal energy per mole of the gas.",
            "Determine the molar translational internal energy U_m.",
          ]);

    const stems = [
      `Monatomic ${gas.label} gas (molar mass ${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹) inside ${vessel} has the Maxwell–Boltzmann speed distribution shown at ${tempPhrase}. ${constantsClause} ${questionAsk}`,
      `Inside ${vessel}, an ideal monatomic sample of ${gas.label} (M = ${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹) is in thermal equilibrium at ${tempPhrase}. ${constantsClause} ${questionAsk}`,
      `Spectroscopic thermometry confirms that ${gas.label} atoms (molar mass ${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹) in ${vessel} are equilibrated at ${tempPhrase}. ${constantsClause} ${questionAsk}`,
      `A low-density plasma-free ${gas.label} sample (M = ${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹) is held in ${vessel} at ${tempPhrase}. ${constantsClause} ${questionAsk}`,
      `Thermalised ${gas.label} vapour of molar mass ${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹ fills ${vessel} at a uniform temperature of ${tempPhrase}. ${constantsClause} ${questionAsk}`,
    ];
    const stem = rng.pick(stems);
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const distractors: DistractorCandidate[] =
      mode === 0
        ? [
            {
              value: (BOLTZMANN_CONSTANT * temperatureK) / ELEMENTARY_CHARGE,
              rationale:
                "Computes k_B T / e and omits the 3/2 translational factor.",
            },
            {
              value: (0.5 * BOLTZMANN_CONSTANT * temperatureK) / ELEMENTARY_CHARGE,
              rationale:
                "Evaluates (1/2) k_B T / e for a single degree of freedom instead of three.",
            },
            ...(useCelsius
              ? [
                  {
                    value: (1.5 * BOLTZMANN_CONSTANT * tempC) / ELEMENTARY_CHARGE,
                    rationale:
                      "Uses temperature in °C rather than absolute temperature in kelvin.",
                  },
                ]
              : [
                  {
                    value: (3 * BOLTZMANN_CONSTANT * temperatureK) / ELEMENTARY_CHARGE,
                    rationale:
                      "Doubles the 3/2 factor to 3 k_B T / e by omitting the 1/2 in kinetic energy.",
                  },
                ]),
          ]
        : [
            {
              value: MOLAR_GAS_CONSTANT * temperatureK,
              rationale:
                "Omits the 3/2 factor in monatomic molar internal energy U_m = (3/2) R T.",
            },
            {
              value: 2.5 * MOLAR_GAS_CONSTANT * temperatureK,
              rationale:
                "Uses molar enthalpy C_p T = (5/2) R T instead of molar internal energy (3/2) R T.",
            },
            {
              value: 0.5 * MOLAR_GAS_CONSTANT * temperatureK,
              rationale:
                "Includes only one translational degree of freedom (1/2 R T) instead of three.",
            },
            ...(useCelsius
              ? [
                  {
                    value: 1.5 * MOLAR_GAS_CONSTANT * tempC,
                    rationale:
                      "Substitutes Celsius temperature θ directly into (3/2) R T without converting to kelvin.",
                  },
                ]
              : []),
          ];

    const mcq = assembleMcqOptions(truth, targetUnit, distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, targetUnit, 3);

    const workedSolution =
      mode === 0
        ? `${useCelsius ? `T = ${fmtDatum(tempC)} + 273.15 = ${fmtDatum(temperatureK)} K. ` : ""}E_k,avg = (3/2) k_B T / e = (1.5 × 1.38 × 10⁻²³ × ${fmtDatum(temperatureK)}) / (1.60 × 10⁻¹⁹) = ${ans}.`
        : `${useCelsius ? `T = ${fmtDatum(tempC)} + 273.15 = ${fmtDatum(temperatureK)} K. ` : ""}For an ideal monatomic gas, molar internal energy U_m = (3/2) R T = 1.5 × 8.31 × ${fmtDatum(temperatureK)} = ${ans}.`;

    return {
      id,
      conceptId: "ideal-gas-kinetic-theory",
      templateArchetype: "molecular-translational-kinetic-energy",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Apply equipartition and kinetic theory to determine molecular kinetic energy or molar internal energy",
        distractorStrategy: [
          "omitting-three-halves-prefactor",
          "single-degree-of-freedom-half-kbt",
          "celsius-instead-of-kelvin-trap",
        ],
        assumptions: ["Monatomic ideal gas with three translational degrees of freedom"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution,
      markScheme: [
        {
          code: "A1",
          criterion: `Substitutes T = ${fmtDatum(temperatureK)} K into the monatomic kinetic-theory energy relation to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2
  const structStems = [
    `A pure monatomic sample of ${gas.label} (molar mass ${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹) inside ${vessel} is maintained in thermal equilibrium at ${tempPhrase}. Take k_B = 1.38 × 10⁻²³ J K⁻¹, e = 1.60 × 10⁻¹⁹ C, and R = 8.31 J mol⁻¹ K⁻¹.`,
    `The Maxwell–Boltzmann speed curve represents ideal ${gas.label} atoms of molar mass ${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹ confined in ${vessel} at ${tempPhrase}. Use k_B = 1.38 × 10⁻²³ J K⁻¹, e = 1.60 × 10⁻¹⁹ C, and R = 8.31 J mol⁻¹ K⁻¹.`,
    `Within ${vessel}, low-pressure monatomic ${gas.label} gas (M = ${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹) is held at ${tempPhrase}. Data: k_B = 1.38 × 10⁻²³ J K⁻¹, 1 eV = 1.60 × 10⁻¹⁹ J, R = 8.31 J mol⁻¹ K⁻¹.`,
    `Optical Doppler broadening probes ${gas.label} gas (molar mass ${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹) equilibrated at ${tempPhrase} inside ${vessel} (k_B = 1.38 × 10⁻²³ J K⁻¹, e = 1.60 × 10⁻¹⁹ C, R = 8.31 J mol⁻¹ K⁻¹).`,
    `At ${tempPhrase}, ${vessel} contains monatomic ${gas.label} of molar mass ${fmtDatum(gas.molarMassKgPerMol)} kg mol⁻¹. Adopt k_B = 1.38 × 10⁻²³ J K⁻¹, elementary charge 1.60 × 10⁻¹⁹ C, and R = 8.31 J mol⁻¹ K⁻¹.`,
  ];
  const stem = rng.pick(structStems);
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const ekJAns = fmtWithUnit(sol.quantities.averageKineticEnergyJ, "J", 3);
  const ekEvAns = fmtWithUnit(sol.quantities.averageKineticEnergyEv, "eV", 3);
  const vRmsAns = fmtWithUnit(sol.quantities.rmsSpeedMs, "m s⁻¹", 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: "Calculate the mean translational kinetic energy of a single atom in joules.",
      marks: 2,
      targetQuantityKey: "averageKineticEnergyJ",
      expectedAnswer: ekJAns,
      workingSteps: [
        ...(useCelsius
          ? [`T = ${fmtDatum(tempC)} + 273.15 = ${fmtDatum(temperatureK)} K.`]
          : []),
        `E_k,avg = (3/2) k_B T = 1.5 × 1.38 × 10⁻²³ × ${fmtDatum(temperatureK)} = ${ekJAns}.`,
      ],
    },
    {
      partId: "b",
      prompt: "Convert this mean translational kinetic energy into electronvolts.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "averageKineticEnergyEv",
      expectedAnswer: ekEvAns,
      workingSteps: [
        `E_k(eV) = E_k(J) / e = ${formatThermalValue(sol.quantities.averageKineticEnergyJ, 4)} / (1.60 × 10⁻¹⁹) = ${ekEvAns}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Determine the root-mean-square speed of the ${gas.label} atoms.`,
      marks: 2,
      targetQuantityKey: "rmsSpeedMs",
      expectedAnswer: vRmsAns,
      workingSteps: [
        `v_rms = √(3RT / M) = √(3 × 8.31 × ${fmtDatum(temperatureK)} / ${fmtDatum(gas.molarMassKgPerMol)}) = ${vRmsAns}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "molecular-translational-kinetic-energy",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Compute molecular mean translational kinetic energy in joules and eV alongside rms speed",
      subpartStrategy: [
        "Mean kinetic energy in joules via equipartition",
        "Unit conversion from joules to electronvolts",
        "Root-mean-square speed from molar mass and temperature",
      ],
      assumptions: ["Monatomic ideal gas in thermal equilibrium"],
    },
    stem,
    parts,
    workedSolution: `(a) E_k,avg = (3/2) k_B T = ${ekJAns}. (b) Dividing by 1.60 × 10⁻¹⁹ C gives ${ekEvAns}. (c) v_rms = √(3RT / M) = ${vRmsAns}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Applies E_k = (3/2) k_B T in kelvin.", ekJAns),
      ...buildTwoMarkPartScheme("b", "Divides energy in joules by elementary charge e.", ekEvAns),
      ...buildTwoMarkPartScheme("c", "Evaluates v_rms = √(3RT / M).", vRmsAns),
    ],
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* 4. ideal-gas-pv-cycles :: gas-law-pt-vt-state-transitions                  */
/* ========================================================================== */

function buildGasLawPtVtStateTransitions(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const apparatus = PISTON_ENGINE_CONTEXTS[variantIndex % PISTON_ENGINE_CONTEXTS.length];
  const plane: ThermalDiagramPlane =
    variantIndex % 3 === 0 ? "PT" : variantIndex % 3 === 1 ? "VT" : "PV";

  const moles = rng.pick([0.2, 0.35, 0.5, 0.75, 1.2, 1.5]);
  const pA = rng.pick([1.1e5, 1.4e5, 1.6e5, 2.2e5, 2.6e5]);
  const vA = rng.pick([0.002, 0.003, 0.004, 0.005, 0.006]);
  const ratio1 = rng.pick([1.5, 1.8, 2.2, 2.5]);
  const ratio2 = rng.pick([1.4, 1.6, 2.0, 2.4]);
  const vB = Number((vA * ratio1).toPrecision(6));
  const pC = Number((pA * ratio2).toPrecision(6));

  // Path A -> B (isobaric expansion to vB) then B -> C (isochoric heating to pC)
  const spec: ThermodynamicProcessScenarioSpec = {
    kind: "thermodynamic-process",
    moles,
    initialState: { stateId: "A", label: "A", pressurePa: pA, volumeM3: vA },
    steps: [
      { process: "isobaric", toStateId: "B", toLabel: "B", targetVolumeM3: vB },
      { process: "isochoric", toStateId: "C", toLabel: "C", targetPressurePa: pC },
    ],
    isClosedCycle: false,
    diagramPlane: plane,
  };
  const sol = solveThermodynamicProcess(spec);

  const hiddenQuantities = [
    "state:A:temperatureK",
    "state:B:temperatureK",
    "state:C:temperatureK",
    "netWorkJ",
    "totalWorkJ",
    "netHeatJ",
    "totalHeatJ",
    "totalDeltaUJ",
  ];

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "moles", value: moles, unit: "mol", source: "stem" },
    { name: "pressureA", value: pA, unit: "Pa", source: "stem" },
    { name: "volumeA", value: vA, unit: "m³", source: "stem" },
    { name: "volumeB", value: vB, unit: "m³", source: "stem" },
    { name: "pressureC", value: pC, unit: "Pa", source: "stem" },
  ];

  const planeName =
    plane === "PT"
      ? "pressure–temperature (P–T)"
      : plane === "VT"
        ? "volume–temperature (V–T)"
        : "pressure–volume (P–V)";

  if (format === "mcq") {
    const askTB = variantIndex % 2 === 0;
    const targetKey = askTB ? "state:B:temperatureK" : "state:C:temperatureK";
    const truth = sol.quantities[targetKey];

    const stems = askTB
      ? [
          `In ${apparatus}, ${fmtDatum(moles)} mol of an ideal gas starts at state A with pressure ${fmtDatum(pA)} Pa and volume ${fmtDatum(vA)} m³. As shown on the ${planeName} diagram, the gas expands isobarically from A to state B of volume ${fmtDatum(vB)} m³, before undergoing isochoric heating from B to state C at ${fmtDatum(pC)} Pa. Take R = 8.31 J mol⁻¹ K⁻¹. What is the temperature T_B at state B?`,
          `The ${planeName} diagram traces ${fmtDatum(moles)} mol of ideal gas inside ${apparatus}. Starting at A (${fmtDatum(pA)} Pa, ${fmtDatum(vA)} m³), the gas expands at constant pressure to volume ${fmtDatum(vB)} m³ at state B and is then heated at constant volume to ${fmtDatum(pC)} Pa at state C (R = 8.31 J mol⁻¹ K⁻¹). Calculate T_B.`,
          `A sample of ${fmtDatum(moles)} mol of ideal gas in ${apparatus} undergoes an isobaric expansion from state A (${fmtDatum(pA)} Pa, ${fmtDatum(vA)} m³) to state B (${fmtDatum(vB)} m³), followed by an isochoric rise to ${fmtDatum(pC)} Pa at state C. Given R = 8.31 J mol⁻¹ K⁻¹, find the absolute temperature at B.`,
        ]
      : [
          `On the ${planeName} diagram, ${fmtDatum(moles)} mol of an ideal gas in ${apparatus} starts at state A (${fmtDatum(pA)} Pa, ${fmtDatum(vA)} m³), expands at constant pressure to ${fmtDatum(vB)} m³ at state B, and is then heated at constant volume to a final pressure of ${fmtDatum(pC)} Pa at state C. Take R = 8.31 J mol⁻¹ K⁻¹. What is the final temperature T_C at state C?`,
          `${fmtDatum(moles)} mol of ideal gas inside ${apparatus} follows path A → B → C on the ${planeName} plot: an isobaric expansion from (${fmtDatum(pA)} Pa, ${fmtDatum(vA)} m³) to V_B = ${fmtDatum(vB)} m³, then an isochoric pressure increase to P_C = ${fmtDatum(pC)} Pa. Using R = 8.31 J mol⁻¹ K⁻¹, determine T_C.`,
          `Starting from state A (${fmtDatum(pA)} Pa, ${fmtDatum(vA)} m³) in ${apparatus}, ${fmtDatum(moles)} mol of ideal gas expands isobarically to ${fmtDatum(vB)} m³ (state B) and is heated isochorically until the pressure reaches ${fmtDatum(pC)} Pa (state C). Taking R = 8.31 J mol⁻¹ K⁻¹, find the temperature in state C.`,
        ];

    const stem = stems[variantIndex % stems.length];
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const tA = sol.quantities["state:A:temperatureK"];
    const tB = sol.quantities["state:B:temperatureK"];
    const distractors: DistractorCandidate[] = askTB
      ? [
          {
            value: tA,
            rationale:
              "Stops after computing the initial temperature T_A = P_A V_A / (nR) without scaling by V_B / V_A.",
          },
          {
            value: tA * (vA / vB),
            rationale:
              "Inverts Charles's law ratio, multiplying T_A by V_A / V_B instead of V_B / V_A.",
          },
          {
            value: sol.quantities["state:C:temperatureK"],
            rationale:
              "Calculates the final temperature T_C at state C rather than the intermediate temperature T_B.",
          },
          {
            value: (pA * vB) / MOLAR_GAS_CONSTANT,
            rationale:
              "Omits the number of moles n when evaluating T_B = P_A V_B / (nR).",
          },
        ]
      : [
          {
            value: tB,
            rationale:
              "Computes T_B after the isobaric stage and omits the isochoric pressure ratio P_C / P_A.",
          },
          {
            value: (pC * vA) / (moles * MOLAR_GAS_CONSTANT),
            rationale:
              "Uses the initial volume V_A instead of V_B = V_C when evaluating T_C = P_C V_C / (nR).",
          },
          {
            value: Math.max(10, truth - KELVIN_OFFSET),
            rationale:
              "Reports the final temperature converted to °C when the question and options specify kelvin.",
          },
          {
            value: (pC * vB) / MOLAR_GAS_CONSTANT,
            rationale:
              "Omits the molar amount n in T_C = P_C V_C / (nR).",
          },
        ];

    const mcq = assembleMcqOptions(truth, "K", distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, "K", 3);

    return {
      id,
      conceptId: "ideal-gas-pv-cycles",
      templateArchetype: "gas-law-pt-vt-state-transitions",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Apply the ideal gas equation and Charles/Gay-Lussac state laws across multi-step transitions",
        distractorStrategy: [
          "intermediate-state-stop",
          "inverted-volume-or-pressure-ratio",
          "omitted-moles-in-gas-law",
        ],
        assumptions: ["Fixed molar amount of ideal gas in quasi-static equilibrium"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution: askTB
        ? `At state B, P_B = P_A = ${fmtDatum(pA)} Pa and V_B = ${fmtDatum(vB)} m³, so T_B = P_B V_B / (nR) = (${fmtDatum(pA)} × ${fmtDatum(vB)}) / (${fmtDatum(moles)} × 8.31) = ${ans}.`
        : `At state C, V_C = V_B = ${fmtDatum(vB)} m³ and P_C = ${fmtDatum(pC)} Pa, so T_C = P_C V_C / (nR) = (${fmtDatum(pC)} × ${fmtDatum(vB)}) / (${fmtDatum(moles)} × 8.31) = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates PV / (nR) at the target state to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2
  const structStems = [
    `The ${planeName} diagram shows a two-stage process A → B → C for ${fmtDatum(moles)} mol of an ideal gas sealed inside ${apparatus}. At state A, the pressure is ${fmtDatum(pA)} Pa and the volume is ${fmtDatum(vA)} m³. Process A → B is an isobaric expansion to volume ${fmtDatum(vB)} m³, and process B → C is an isochoric heating to pressure ${fmtDatum(pC)} Pa. Take R = 8.31 J mol⁻¹ K⁻¹.`,
    `Inside ${apparatus}, ${fmtDatum(moles)} mol of ideal gas starts in state A (${fmtDatum(pA)} Pa, ${fmtDatum(vA)} m³). As plotted on the ${planeName} axes, the gas first expands at constant pressure to V_B = ${fmtDatum(vB)} m³ (state B) and is then heated at constant volume to P_C = ${fmtDatum(pC)} Pa (state C). Use R = 8.31 J mol⁻¹ K⁻¹.`,
    `An ideal gas sample (${fmtDatum(moles)} mol) confined in ${apparatus} is taken from state A (${fmtDatum(pA)} Pa, ${fmtDatum(vA)} m³) to state B (${fmtDatum(vB)} m³) isobarically, and then from state B to state C (${fmtDatum(pC)} Pa) isochorically, as illustrated on the ${planeName} graph (R = 8.31 J mol⁻¹ K⁻¹).`,
  ];
  const stem = structStems[variantIndex % structStems.length];
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const tAAns = fmtWithUnit(sol.quantities["state:A:temperatureK"], "K", 3);
  const tBAns = fmtWithUnit(sol.quantities["state:B:temperatureK"], "K", 3);
  const tCAns = fmtWithUnit(sol.quantities["state:C:temperatureK"], "K", 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: "Calculate the initial temperature T_A of the gas in state A.",
      marks: 2,
      targetQuantityKey: "state:A:temperatureK",
      expectedAnswer: tAAns,
      workingSteps: [
        `T_A = P_A V_A / (nR) = (${fmtDatum(pA)} × ${fmtDatum(vA)}) / (${fmtDatum(moles)} × 8.31) = ${tAAns}.`,
      ],
    },
    {
      partId: "b",
      prompt: "Determine the temperature T_B at the end of the isobaric expansion A → B.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "state:B:temperatureK",
      expectedAnswer: tBAns,
      workingSteps: [
        `By Charles's law at constant pressure, T_B = T_A (V_B / V_A) = ${tBAns}.`,
      ],
    },
    {
      partId: "c",
      prompt: "Calculate the final temperature T_C in state C after the isochoric stage B → C.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "state:C:temperatureK",
      expectedAnswer: tCAns,
      workingSteps: [
        `At constant volume V_C = V_B, T_C = T_B (P_C / P_B) = (${fmtDatum(pC)} × ${fmtDatum(vB)}) / (${fmtDatum(moles)} × 8.31) = ${tCAns}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "ideal-gas-pv-cycles",
    templateArchetype: "gas-law-pt-vt-state-transitions",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Track absolute temperatures across sequential isobaric and isochoric ideal-gas state changes",
      subpartStrategy: [
        "Initial temperature at A from ideal gas law",
        "Intermediate temperature at B via constant-pressure volume ratio",
        "Final temperature at C via constant-volume pressure ratio",
      ],
      assumptions: ["Closed system with constant number of moles of ideal gas"],
    },
    stem,
    parts,
    workedSolution: `(a) T_A = P_A V_A / (nR) = ${tAAns}. (b) Isobaric expansion gives T_B = T_A (V_B / V_A) = ${tBAns}. (c) Isochoric heating gives T_C = T_B (P_C / P_A) = ${tCAns}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Uses T_A = P_A V_A / (nR).", tAAns),
      ...buildTwoMarkPartScheme("b", "Applies V_B / T_B = V_A / T_A or P_A V_B / (nR).", tBAns),
      ...buildTwoMarkPartScheme("c", "Applies P_C / T_C = P_B / T_B or P_C V_B / (nR).", tCAns),
    ],
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* 5. ideal-gas-pv-cycles :: isobaric-isochoric-open-first-law                */
/* ========================================================================== */

function buildIsobaricIsochoricOpenFirstLaw(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const apparatus = PISTON_ENGINE_CONTEXTS[(variantIndex + 2) % PISTON_ENGINE_CONTEXTS.length];

  const moles = rng.pick([0.25, 0.4, 0.6, 0.8, 1.2, 1.5]);
  const pLow = rng.pick([1.2e5, 1.5e5, 1.8e5, 2.4e5]);
  const pRatio = rng.pick([1.5, 2.0, 2.5, 3.0]);
  const pHigh = Number((pLow * pRatio).toPrecision(6));
  const vLow = rng.pick([0.0015, 0.002, 0.0025, 0.0035, 0.0045]);
  const vRatio = rng.pick([1.8, 2.2, 2.6, 3.2]);
  const vHigh = Number((vLow * vRatio).toPrecision(6));

  // For MCQ: mix single-step isobaric compression (work ON gas), single-step isobaric expansion (heat Q), and 2-step open path
  const mode = format === "structured" ? 2 : variantIndex % 3;

  const spec: ThermodynamicProcessScenarioSpec =
    mode === 0
      ? {
          kind: "thermodynamic-process",
          moles,
          initialState: { stateId: "A", label: "A", pressurePa: pHigh, volumeM3: vLow },
          steps: [
            { process: "isobaric", toStateId: "B", toLabel: "B", targetVolumeM3: vHigh },
          ],
          isClosedCycle: false,
          diagramPlane: "PV",
        }
      : mode === 1
        ? {
            kind: "thermodynamic-process",
            moles,
            initialState: { stateId: "A", label: "A", pressurePa: pHigh, volumeM3: vHigh },
            steps: [
              { process: "isobaric", toStateId: "B", toLabel: "B", targetVolumeM3: vLow },
            ],
            isClosedCycle: false,
            diagramPlane: "PV",
          }
        : {
            kind: "thermodynamic-process",
            moles,
            initialState: { stateId: "A", label: "A", pressurePa: pLow, volumeM3: vLow },
            steps: [
              { process: "isochoric", toStateId: "B", toLabel: "B", targetPressurePa: pHigh },
              { process: "isobaric", toStateId: "C", toLabel: "C", targetVolumeM3: vHigh },
            ],
            isClosedCycle: false,
            diagramPlane: "PV",
          };

  const sol = solveThermodynamicProcess(spec);
  const hiddenQuantities = [
    "netWorkJ",
    "totalWorkJ",
    "netHeatJ",
    "totalHeatJ",
    "totalDeltaUJ",
    "leg:0:workJ",
    "leg:0:workOnGasJ",
    "leg:0:heatJ",
    "leg:0:deltaUJ",
    ...(mode === 2
      ? ["leg:1:workJ", "leg:1:heatJ", "leg:1:deltaUJ"]
      : []),
  ];

  const requiredGivens: RequiredGivenSpec[] =
    mode === 2
      ? [
          { name: "moles", value: moles, unit: "mol", source: "stem" },
          { name: "pLow", value: pLow, unit: "Pa", source: "stem" },
          { name: "pHigh", value: pHigh, unit: "Pa", source: "stem" },
          { name: "vLow", value: vLow, unit: "m³", source: "stem" },
          { name: "vHigh", value: vHigh, unit: "m³", source: "stem" },
        ]
      : [
          { name: "moles", value: moles, unit: "mol", source: "stem" },
          { name: "pHigh", value: pHigh, unit: "Pa", source: "stem" },
          { name: "vLow", value: vLow, unit: "m³", source: "stem" },
          { name: "vHigh", value: vHigh, unit: "m³", source: "stem" },
        ];

  if (format === "mcq") {
    const targetKey =
      mode === 0 ? "leg:0:heatJ" : mode === 1 ? "leg:0:workOnGasJ" : "netHeatJ";
    const truth = sol.quantities[targetKey];

    const stems =
      mode === 0
        ? [
            `A sample of ${fmtDatum(moles)} mol of an ideal monatomic gas in ${apparatus} expands isobarically at constant pressure ${fmtDatum(pHigh)} Pa from volume ${fmtDatum(vLow)} m³ (state A) to ${fmtDatum(vHigh)} m³ (state B). Taking thermal energy supplied to the gas and work done by the gas as positive, how much thermal energy Q is supplied to the gas during A → B?`,
            `On the P–V diagram, ${fmtDatum(moles)} mol of monatomic ideal gas inside ${apparatus} undergoes a constant-pressure expansion at ${fmtDatum(pHigh)} Pa from V_A = ${fmtDatum(vLow)} m³ to V_B = ${fmtDatum(vHigh)} m³. Defining heat transferred into the gas as positive (with expansion work done by the gas positive), calculate Q for process A → B.`,
            `Inside ${apparatus}, ${fmtDatum(moles)} mol of monatomic ideal gas is heated at a steady pressure of ${fmtDatum(pHigh)} Pa so that its volume increases from ${fmtDatum(vLow)} m³ to ${fmtDatum(vHigh)} m³. What total thermal energy must be transferred into the gas (heat into gas positive)?`,
          ]
        : mode === 1
          ? [
              `In ${apparatus}, ${fmtDatum(moles)} mol of monatomic ideal gas is compressed at constant pressure ${fmtDatum(pHigh)} Pa from an initial volume of ${fmtDatum(vHigh)} m³ (state A) to a final volume of ${fmtDatum(vLow)} m³ (state B). Taking work done on the gas as positive, what is the work done on the gas during this compression?`,
              `The P–V graph shows an isobaric compression of ${fmtDatum(moles)} mol of ideal monatomic gas inside ${apparatus} at ${fmtDatum(pHigh)} Pa from V_A = ${fmtDatum(vHigh)} m³ to V_B = ${fmtDatum(vLow)} m³. Using the sign convention where work done on the gas is positive, determine the compression work done on the gas.`,
              `An external actuator compresses ${fmtDatum(moles)} mol of monatomic ideal gas in ${apparatus} isobarically at ${fmtDatum(pHigh)} Pa from ${fmtDatum(vHigh)} m³ down to ${fmtDatum(vLow)} m³. How much mechanical work is done on the gas (work on gas positive)?`,
            ]
          : [
              `As shown on the P–V diagram, ${fmtDatum(moles)} mol of an ideal monatomic gas in ${apparatus} starts at state A (${fmtDatum(pLow)} Pa, ${fmtDatum(vLow)} m³), is heated isochorically to ${fmtDatum(pHigh)} Pa at state B, and then expands isobarically to ${fmtDatum(vHigh)} m³ at state C. Taking heat supplied to the gas and work done by the gas as positive, what is the total thermal energy Q supplied to the gas along A → B → C?`,
              `Inside ${apparatus}, ${fmtDatum(moles)} mol of monatomic ideal gas follows the two-leg path A → B → C: constant-volume heating at ${fmtDatum(vLow)} m³ from ${fmtDatum(pLow)} Pa to ${fmtDatum(pHigh)} Pa, followed by constant-pressure expansion at ${fmtDatum(pHigh)} Pa to ${fmtDatum(vHigh)} m³. Find the net heat transferred into the gas (heat into gas positive).`,
              `A monatomic ideal gas (${fmtDatum(moles)} mol) in ${apparatus} transitions from state A (${fmtDatum(pLow)} Pa, ${fmtDatum(vLow)} m³) to state B (${fmtDatum(pHigh)} Pa, ${fmtDatum(vLow)} m³) and then to state C (${fmtDatum(pHigh)} Pa, ${fmtDatum(vHigh)} m³). Defining expansion work done by the gas as positive, calculate the total thermal energy absorbed by the gas over A → B → C.`,
            ];

    const stem = stems[variantIndex % stems.length];
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const dV = vHigh - vLow;
    const distractors: DistractorCandidate[] =
      mode === 0
        ? [
            {
              value: 2.0 * pHigh * dV,
              rationale:
                "Omits the 3/2 factor in monatomic ΔU = (3/2) P ΔV, computing ΔU + W = P ΔV + P ΔV = 2 P ΔV instead of (5/2) P ΔV.",
            },
            {
              value: pHigh * dV,
              rationale:
                "Calculates only the boundary work W = P ΔV done by the gas and ignores the increase in internal energy ΔU.",
            },
            {
              value: 1.5 * pHigh * dV,
              rationale:
                "Calculates only the internal energy change ΔU = (3/2) P ΔV and omits the expansion work P ΔV.",
            },
            {
              value: 0.5 * pHigh * dV,
              rationale:
                "Reverses the work sign in the first law, evaluating Q = ΔU − W_by = (3/2 − 1) P ΔV.",
            },
          ]
        : mode === 1
          ? [
              {
                value: 1.5 * pHigh * dV,
                rationale:
                  "Calculates the magnitude of internal energy change |ΔU| = (3/2) P |ΔV| instead of boundary work P |ΔV|.",
              },
              {
                value: 2.5 * pHigh * dV,
                rationale:
                  "Calculates the total heat rejected |Q| = (5/2) P |ΔV| rather than the mechanical work done on the gas.",
              },
              {
                value: pHigh * vHigh,
                rationale:
                  "Multiplies pressure by initial volume V_A instead of the volume change |V_B − V_A|.",
              },
              {
                value: pHigh * vLow,
                rationale:
                  "Multiplies pressure by final volume V_B instead of the volume change |V_B − V_A|.",
              },
            ]
          : [
              {
                value: sol.quantities.totalDeltaUJ,
                rationale:
                  "Computes only the total internal energy change ΔU_AC and omits the boundary work done during B → C.",
              },
              {
                value: sol.quantities.totalDeltaUJ - sol.quantities.netWorkJ,
                rationale:
                  "Subtracts the positive expansion work done by the gas instead of adding Q = ΔU + W_by.",
              },
              {
                value: (pHigh * vHigh - pLow * vLow) + pHigh * dV,
                rationale:
                  "Omits the monatomic 3/2 factor in ΔU = (3/2)(P_C V_C − P_A V_A).",
              },
              {
                value: sol.quantities.netWorkJ,
                rationale:
                  "Computes only the area under B → C (work done by the gas) and ignores internal energy changes.",
              },
            ];

    const mcq = assembleMcqOptions(truth, "J", distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, "J", 3);

    const workedSolution =
      mode === 0
        ? `Work done by the gas W_by = P(V_B − V_A) = ${fmtDatum(pHigh)} × (${fmtDatum(vHigh)} − ${fmtDatum(vLow)}) = ${formatThermalValue(pHigh * dV, 4)} J. For a monatomic ideal gas, ΔU = (3/2) P ΔV = ${formatThermalValue(1.5 * pHigh * dV, 4)} J. By the first law, Q = ΔU + W_by = (5/2) P ΔV = ${ans}.`
        : mode === 1
          ? `During isobaric compression from ${fmtDatum(vHigh)} m³ to ${fmtDatum(vLow)} m³ at ${fmtDatum(pHigh)} Pa, work done on the gas W_on = −P(V_B − V_A) = ${fmtDatum(pHigh)} × (${fmtDatum(vHigh)} − ${fmtDatum(vLow)}) = ${ans}.`
          : `Along A → B → C, work done by the gas is W_by = 0 + P_B(V_C − V_B) = ${formatThermalValue(sol.quantities.netWorkJ, 4)} J. Total internal energy change ΔU = (3/2)(P_C V_C − P_A V_A) = ${formatThermalValue(sol.quantities.totalDeltaUJ, 4)} J. Hence Q = ΔU + W_by = ${ans}.`;

    return {
      id,
      conceptId: "ideal-gas-pv-cycles",
      templateArchetype: "isobaric-isochoric-open-first-law",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Apply the first law of thermodynamics with explicit work sign conventions to open isobaric/isochoric processes",
        distractorStrategy: [
          "omitting-monatomic-three-halves-in-delta-u",
          "work-sign-reversal-in-first-law",
          "confusing-work-and-internal-energy-change",
        ],
        assumptions: ["Monatomic ideal gas undergoing reversible constant-pressure and constant-volume steps"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates the first-law energy transfer with consistent work sign to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (mode === 2: A -> B isochoric, B -> C isobaric)
  const structStems = [
    `The P–V diagram shows ${fmtDatum(moles)} mol of an ideal monatomic gas in ${apparatus} taken from state A (${fmtDatum(pLow)} Pa, ${fmtDatum(vLow)} m³) to state B (${fmtDatum(pHigh)} Pa, ${fmtDatum(vLow)} m³) at constant volume, and then from state B to state C (${fmtDatum(pHigh)} Pa, ${fmtDatum(vHigh)} m³) at constant pressure. Throughout this question, take expansion work done by the gas and thermal energy supplied to the gas as positive.`,
    `Inside ${apparatus}, ${fmtDatum(moles)} mol of monatomic ideal gas undergoes two sequential processes plotted on the P–V graph: isochoric heating from A (${fmtDatum(pLow)} Pa, ${fmtDatum(vLow)} m³) to B (${fmtDatum(pHigh)} Pa, ${fmtDatum(vLow)} m³), followed by isobaric expansion to C (${fmtDatum(pHigh)} Pa, ${fmtDatum(vHigh)} m³). Take work done by the gas and heat transferred into the gas as positive.`,
    `A sealed sample of ${fmtDatum(moles)} mol of monatomic ideal gas in ${apparatus} follows path A → B → C on the P–V diagram: state A is at (${fmtDatum(pLow)} Pa, ${fmtDatum(vLow)} m³), state B is at (${fmtDatum(pHigh)} Pa, ${fmtDatum(vLow)} m³), and state C is at (${fmtDatum(pHigh)} Pa, ${fmtDatum(vHigh)} m³). Use the convention where work done by the gas is positive.`,
  ];
  const stem = structStems[variantIndex % structStems.length];
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const wAns = fmtWithUnit(sol.quantities.netWorkJ, "J", 3);
  const duAns = fmtWithUnit(sol.quantities.totalDeltaUJ, "J", 3);
  const qAns = fmtWithUnit(sol.quantities.netHeatJ, "J", 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Calculate the total mechanical work done by the gas along path A → B → C.",
      marks: 2,
      targetQuantityKey: "netWorkJ",
      expectedAnswer: wAns,
      workingSteps: [
        "W_AB = 0 (isochoric step).",
        `W_BC = P_B (V_C − V_B) = ${fmtDatum(pHigh)} × (${fmtDatum(vHigh)} − ${fmtDatum(vLow)}) = ${wAns}.`,
      ],
    },
    {
      partId: "b",
      prompt:
        "Calculate the total change in internal energy ΔU of the monatomic gas between state A and state C.",
      marks: 2,
      targetQuantityKey: "totalDeltaUJ",
      expectedAnswer: duAns,
      workingSteps: [
        `For a monatomic ideal gas, U = (3/2) PV, so ΔU_AC = (3/2)(P_C V_C − P_A V_A).`,
        `ΔU_AC = 1.5 × (${fmtDatum(pHigh)} × ${fmtDatum(vHigh)} − ${fmtDatum(pLow)} × ${fmtDatum(vLow)}) = ${duAns}.`,
      ],
    },
    {
      partId: "c",
      prompt:
        "Determine the total thermal energy Q supplied to the gas over the complete path A → B → C.",
      marks: 2,
      dependsOnPartIds: ["a", "b"],
      targetQuantityKey: "netHeatJ",
      expectedAnswer: qAns,
      workingSteps: [
        `By the first law of thermodynamics, Q = ΔU_AC + W_by = ${formatThermalValue(sol.quantities.totalDeltaUJ, 4)} + ${formatThermalValue(sol.quantities.netWorkJ, 4)} = ${qAns}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "ideal-gas-pv-cycles",
    templateArchetype: "isobaric-isochoric-open-first-law",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Compute boundary work, monatomic internal energy change, and heat input across a two-step open P-V path",
      subpartStrategy: [
        "Total work done by the gas across isochoric and isobaric legs",
        "Net internal energy change using monatomic state relation",
        "Total heat supplied via first law of thermodynamics",
      ],
      assumptions: ["Reversible quasi-static path for a monatomic ideal gas"],
    },
    stem,
    parts,
    workedSolution: `(a) Work is done only along B → C: W_by = ${fmtDatum(pHigh)}(${fmtDatum(vHigh)} − ${fmtDatum(vLow)}) = ${wAns}. (b) ΔU_AC = (3/2)(P_C V_C − P_A V_A) = ${duAns}. (c) Total heat supplied Q = ΔU_AC + W_by = ${qAns}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Identifies W_AB = 0 and computes P_B(V_C − V_B).", wAns),
      ...buildTwoMarkPartScheme("b", "Applies ΔU = (3/2)(P_C V_C − P_A V_A).", duAns),
      ...buildTwoMarkPartScheme("c", "Sums ΔU_AC and W_by to obtain total heat supplied.", qAns),
    ],
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* 6. ideal-gas-pv-cycles :: rectangular-pv-cycle-work-efficiency             */
/* ========================================================================== */

function buildRectangularPvCycleWorkEfficiency(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const apparatus = PISTON_ENGINE_CONTEXTS[(variantIndex + 4) % PISTON_ENGINE_CONTEXTS.length];
  const plane: ThermalDiagramPlane =
    variantIndex % 4 === 3 ? "PT" : "PV";

  const moles = rng.pick([0.2, 0.4, 0.5, 0.8, 1.0, 1.5]);
  const pLow = rng.pick([1.0e5, 1.2e5, 1.5e5, 1.8e5]);
  const pMult = rng.pick([2.0, 2.5, 3.0, 3.5]);
  const pHigh = Number((pLow * pMult).toPrecision(6));
  const vLow = rng.pick([0.0012, 0.0018, 0.0024, 0.003, 0.004]);
  const vMult = rng.pick([2.0, 2.5, 3.0, 4.0]);
  const vHigh = Number((vLow * vMult).toPrecision(6));

  // Clockwise rectangular heat engine: A(pHigh, vLow) -> B(pHigh, vHigh) -> C(pLow, vHigh) -> D(pLow, vLow) -> A
  const spec: ThermodynamicProcessScenarioSpec = {
    kind: "thermodynamic-process",
    moles,
    initialState: { stateId: "A", label: "A", pressurePa: pHigh, volumeM3: vLow },
    steps: [
      { process: "isobaric", toStateId: "B", toLabel: "B", targetVolumeM3: vHigh },
      { process: "isochoric", toStateId: "C", toLabel: "C", targetPressurePa: pLow },
      { process: "isobaric", toStateId: "D", toLabel: "D", targetVolumeM3: vLow },
      { process: "isochoric", closeToInitial: true },
    ],
    isClosedCycle: true,
    diagramPlane: plane,
  };
  const sol = solveThermodynamicProcess(spec);

  const hiddenQuantities = [
    "netWorkJ",
    "totalWorkJ",
    "netHeatJ",
    "totalHeatJ",
    "heatInputJ",
    "heatRejectedJ",
    "thermalEfficiency",
    "carnotEfficiency",
    "leg:0:workJ",
    "leg:0:heatJ",
    "leg:3:heatJ",
  ];

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "moles", value: moles, unit: "mol", source: "stem" },
    { name: "pLow", value: pLow, unit: "Pa", source: "stem" },
    { name: "pHigh", value: pHigh, unit: "Pa", source: "stem" },
    { name: "vLow", value: vLow, unit: "m³", source: "stem" },
    { name: "vHigh", value: vHigh, unit: "m³", source: "stem" },
  ];

  if (format === "mcq") {
    const mode = variantIndex % 3;
    const targetKey =
      mode === 0 ? "netWorkJ" : mode === 1 ? "heatInputJ" : "thermalEfficiency";
    const targetUnit = mode === 2 ? "" : "J";
    const truth = sol.quantities[targetKey];

    const askClause =
      mode === 0
        ? "Taking net work done by the gas as positive, what is the net mechanical work output W_net per cycle?"
        : mode === 1
          ? "What is the total thermal energy Q_in absorbed by the monatomic gas during the heating legs D → A and A → B?"
          : "What is the thermal efficiency η = W_net / Q_in of this rectangular monatomic-gas cycle?";

    const stems = [
      `In ${apparatus}, ${fmtDatum(moles)} mol of a monatomic ideal gas executes a clockwise closed cycle A → B → C → D → A between pressures ${fmtDatum(pLow)} Pa and ${fmtDatum(pHigh)} Pa and volumes ${fmtDatum(vLow)} m³ and ${fmtDatum(vHigh)} m³ (A → B isobaric expansion at ${fmtDatum(pHigh)} Pa, B → C isochoric cooling, C → D isobaric compression at ${fmtDatum(pLow)} Pa, D → A isochoric heating). ${askClause}`,
      `A heat-engine test rig (${apparatus}) drives ${fmtDatum(moles)} mol of ideal monatomic gas around a rectangular cycle with upper pressure ${fmtDatum(pHigh)} Pa, lower pressure ${fmtDatum(pLow)} Pa, minimum volume ${fmtDatum(vLow)} m³, and maximum volume ${fmtDatum(vHigh)} m³. ${askClause}`,
      `The diagram shows a closed four-leg cycle A → B → C → D → A for ${fmtDatum(moles)} mol of monatomic ideal gas in ${apparatus}, bounded by P_low = ${fmtDatum(pLow)} Pa, P_high = ${fmtDatum(pHigh)} Pa, V_min = ${fmtDatum(vLow)} m³, and V_max = ${fmtDatum(vHigh)} m³. ${askClause}`,
      `Operating clockwise between ${fmtDatum(vLow)} m³ and ${fmtDatum(vHigh)} m³ and between ${fmtDatum(pLow)} Pa and ${fmtDatum(pHigh)} Pa, ${fmtDatum(moles)} mol of monatomic ideal gas in ${apparatus} completes cycle A → B → C → D → A. ${askClause}`,
    ];
    const stem = stems[variantIndex % stems.length];
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const qAB = sol.quantities["leg:0:heatJ"];
    const qDA = sol.quantities["leg:3:heatJ"];
    const distractors: DistractorCandidate[] =
      mode === 0
        ? [
            {
              value: pHigh * (vHigh - vLow),
              rationale:
                "Calculates only the expansion work along A → B and forgets to subtract the compression work along C → D.",
            },
            {
              value: pHigh * vHigh - pLow * vLow,
              rationale:
                "Computes P_B V_B − P_D V_D instead of the enclosed rectangular loop area (P_high − P_low)(V_max − V_min).",
            },
            {
              value: 1.5 * (pHigh - pLow) * (vHigh - vLow),
              rationale:
                "Multiplies the enclosed loop area by an extraneous 3/2 internal-energy factor.",
            },
          ]
        : mode === 1
          ? [
              {
                value: qAB,
                rationale:
                  "Includes only the heat absorbed during isobaric expansion A → B and omits the isochoric heating D → A.",
              },
              {
                value: (pHigh - pLow) * vLow + 2 * pHigh * (vHigh - vLow),
                rationale:
                  "Omits the 3/2 factor in monatomic ΔU on both heating legs.",
              },
              {
                value: sol.quantities.netWorkJ,
                rationale:
                  "Confuses net cycle heat Q_net = W_net with total heat input Q_in absorbed from the hot source.",
              },
            ]
          : [
              {
                value: sol.quantities.carnotEfficiency,
                rationale:
                  "Computes the Carnot efficiency 1 − T_min / T_max between extreme corner temperatures instead of the actual cycle efficiency W_net / Q_in.",
              },
              {
                value: sol.quantities.netWorkJ / qAB,
                rationale:
                  "Divides W_net by Q_AB alone, neglecting the heat input Q_DA on the isochoric leg D → A.",
              },
              {
                value: sol.quantities.netWorkJ / (qDA + pHigh * (vHigh - vLow)),
                rationale:
                  "Omits internal energy gain ΔU_AB when computing total heat input Q_in.",
              },
            ];

    const mcq = assembleMcqOptions(truth, targetUnit, distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, targetUnit, 3);

    const workedSolution =
      mode === 0
        ? `Net work done by the gas equals the enclosed rectangular area: W_net = (P_high − P_low)(V_max − V_min) = (${fmtDatum(pHigh)} − ${fmtDatum(pLow)})(${fmtDatum(vHigh)} − ${fmtDatum(vLow)}) = ${ans}.`
        : mode === 1
          ? `Heat enters on D → A (isochoric, W = 0): Q_DA = (3/2)(P_high − P_low)V_min = ${formatThermalValue(qDA, 4)} J, and on A → B (isobaric): Q_AB = (5/2)P_high(V_max − V_min) = ${formatThermalValue(qAB, 4)} J. Total Q_in = Q_DA + Q_AB = ${ans}.`
          : `W_net = (${fmtDatum(pHigh)} − ${fmtDatum(pLow)})(${fmtDatum(vHigh)} − ${fmtDatum(vLow)}) = ${formatThermalValue(sol.quantities.netWorkJ, 4)} J. Heat enters on D → A and A → B: Q_in = (3/2)(P_high − P_low)V_min + (5/2)P_high(V_max − V_min) = ${formatThermalValue(sol.quantities.heatInputJ, 4)} J. Efficiency η = W_net / Q_in = ${ans}.`;

    return {
      id,
      conceptId: "ideal-gas-pv-cycles",
      templateArchetype: "rectangular-pv-cycle-work-efficiency",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Evaluate enclosed cycle work, multi-leg heat input, or thermal efficiency for a closed rectangular heat-engine cycle",
        distractorStrategy: [
          "omitting-isochoric-heating-leg-from-qin",
          "carnot-vs-actual-cycle-efficiency-confusion",
          "top-leg-work-vs-enclosed-area-slip",
        ],
        assumptions: ["Reversible closed heat-engine cycle using a monatomic ideal gas"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution,
      markScheme: [
        {
          code: "A1",
          criterion: `Computes ${targetKey} correctly for the closed rectangular cycle to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (7 marks)
  const structStems = [
    `In ${apparatus}, ${fmtDatum(moles)} mol of an ideal monatomic gas undergoes the clockwise closed heat-engine cycle A → B → C → D → A: isobaric expansion A → B at ${fmtDatum(pHigh)} Pa from ${fmtDatum(vLow)} m³ to ${fmtDatum(vHigh)} m³, isochoric cooling B → C to ${fmtDatum(pLow)} Pa, isobaric compression C → D at ${fmtDatum(pLow)} Pa back to ${fmtDatum(vLow)} m³, and isochoric heating D → A to ${fmtDatum(pHigh)} Pa. Take work done by the gas as positive.`,
    `A closed-loop test cylinder (${apparatus}) carries ${fmtDatum(moles)} mol of monatomic ideal gas clockwise around cycle A → B → C → D → A between volume limits ${fmtDatum(vLow)} m³ and ${fmtDatum(vHigh)} m³ and pressure limits ${fmtDatum(pLow)} Pa and ${fmtDatum(pHigh)} Pa (with A at ${fmtDatum(pHigh)} Pa, ${fmtDatum(vLow)} m³ and B at ${fmtDatum(pHigh)} Pa, ${fmtDatum(vHigh)} m³). Define work done by the gas as positive.`,
    `The diagram illustrates a reversible rectangular heat-engine cycle A → B → C → D → A executed by ${fmtDatum(moles)} mol of monatomic ideal gas in ${apparatus}, operating between P_low = ${fmtDatum(pLow)} Pa and P_high = ${fmtDatum(pHigh)} Pa and between V_min = ${fmtDatum(vLow)} m³ and V_max = ${fmtDatum(vHigh)} m³. Take expansion work by the gas as positive.`,
  ];
  const stem = structStems[variantIndex % structStems.length];
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const wNetAns = fmtWithUnit(sol.quantities.netWorkJ, "J", 3);
  const qInAns = fmtWithUnit(sol.quantities.heatInputJ, "J", 3);
  const etaAns = formatThermalValue(sol.quantities.thermalEfficiency, 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Calculate the net mechanical work W_net done by the gas in one complete cycle.",
      marks: 2,
      targetQuantityKey: "netWorkJ",
      expectedAnswer: wNetAns,
      workingSteps: [
        `W_net = enclosed area = (${fmtDatum(pHigh)} − ${fmtDatum(pLow)}) × (${fmtDatum(vHigh)} − ${fmtDatum(vLow)}) = ${wNetAns}.`,
      ],
    },
    {
      partId: "b",
      prompt:
        "Calculate the total thermal energy Q_in supplied to the monatomic gas during the heating stages D → A and A → B.",
      marks: 3,
      targetQuantityKey: "heatInputJ",
      expectedAnswer: qInAns,
      workingSteps: [
        `Q_DA = ΔU_DA = (3/2)(${fmtDatum(pHigh)} − ${fmtDatum(pLow)})(${fmtDatum(vLow)}) = ${formatThermalValue(sol.quantities["leg:3:heatJ"], 4)} J.`,
        `Q_AB = ΔU_AB + W_AB = (5/2)(${fmtDatum(pHigh)})(${fmtDatum(vHigh)} − ${fmtDatum(vLow)}) = ${formatThermalValue(sol.quantities["leg:0:heatJ"], 4)} J.`,
        `Q_in = Q_DA + Q_AB = ${qInAns}.`,
      ],
    },
    {
      partId: "c",
      prompt: "Determine the thermal efficiency η of this cycle.",
      marks: 2,
      dependsOnPartIds: ["a", "b"],
      targetQuantityKey: "thermalEfficiency",
      expectedAnswer: etaAns,
      workingSteps: [
        `η = W_net / Q_in = ${formatThermalValue(sol.quantities.netWorkJ, 4)} / ${formatThermalValue(sol.quantities.heatInputJ, 4)} = ${etaAns}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "ideal-gas-pv-cycles",
    templateArchetype: "rectangular-pv-cycle-work-efficiency",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Analyse a closed clockwise rectangular P-V heat-engine cycle for net work, total heat input, and efficiency",
      subpartStrategy: [
        "Net cycle work from enclosed P-V loop area",
        "Sum of positive heat transfers across isochoric and isobaric heating legs",
        "Cycle thermal efficiency ratio",
      ],
      assumptions: ["Monatomic ideal gas undergoing a reversible closed four-step cycle"],
    },
    stem,
    parts,
    workedSolution: `(a) W_net = (P_high − P_low)(V_max − V_min) = ${wNetAns}. (b) Q_in = Q_DA + Q_AB = (3/2)(P_high − P_low)V_min + (5/2)P_high(V_max − V_min) = ${qInAns}. (c) η = W_net / Q_in = ${etaAns}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Evaluates enclosed loop area (P_high − P_low)(V_max − V_min).", wNetAns),
      {
        code: "M1",
        partId: "b",
        criterion: "Identifies heat input on both D → A (isochoric) and A → B (isobaric).",
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Uses monatomic factors (3/2) on D → A and (5/2) on A → B.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains Q_in = ${qInAns}.`,
        marks: 1,
      },
      ...buildTwoMarkPartScheme("c", "Divides W_net from (a) by Q_in from (b).", etaAns),
    ],
    totalMarks: 7,
    generatorModel,
  };
}

/* ========================================================================== */
/* 7. thermodynamics-entropy-engines :: adiabatic-monatomic-expansion-compr.  */
/* ========================================================================== */

function buildAdiabaticMonatomicProcess(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const apparatus = PISTON_ENGINE_CONTEXTS[(variantIndex + 6) % PISTON_ENGINE_CONTEXTS.length];
  const isCompression = variantIndex % 3 === 2;

  const moles = rng.pick([0.25, 0.4, 0.5, 0.75, 1.2, 1.5]);
  const vSmall = rng.pick([0.0012, 0.0016, 0.002, 0.0025, 0.003]);
  const volRatio = rng.pick([2.0, 2.5, 3.0, 3.5, 4.0]);
  const vLarge = Number((vSmall * volRatio).toPrecision(6));

  const pInit = isCompression
    ? rng.pick([1.0e5, 1.2e5, 1.4e5, 1.6e5])
    : rng.pick([3.2e5, 4.0e5, 4.8e5, 6.0e5, 7.5e5]);
  const vA = isCompression ? vLarge : vSmall;
  const vB = isCompression ? vSmall : vLarge;

  const spec: ThermodynamicProcessScenarioSpec = {
    kind: "thermodynamic-process",
    moles,
    initialState: { stateId: "A", label: "A", pressurePa: pInit, volumeM3: vA },
    steps: [
      { process: "adiabatic", toStateId: "B", toLabel: "B", targetVolumeM3: vB },
    ],
    isClosedCycle: false,
    diagramPlane: "PV",
  };
  const sol = solveThermodynamicProcess(spec);

  const hiddenQuantities = [
    "state:A:temperatureK",
    "state:B:pressurePa",
    "state:B:temperatureK",
    "leg:0:workJ",
    "leg:0:workOnGasJ",
    "leg:0:deltaUJ",
    "netWorkJ",
    "totalWorkJ",
    "totalDeltaUJ",
  ];

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "moles", value: moles, unit: "mol", source: "stem" },
    { name: "pressureA", value: pInit, unit: "Pa", source: "stem" },
    { name: "volumeA", value: vA, unit: "m³", source: "stem" },
    { name: "volumeB", value: vB, unit: "m³", source: "stem" },
  ];

  if (format === "mcq") {
    const askPressure = variantIndex % 2 === 0;
    const targetKey = askPressure
      ? "state:B:pressurePa"
      : isCompression
        ? "leg:0:workOnGasJ"
        : "leg:0:workJ";
    const targetUnit = askPressure ? "Pa" : "J";
    const truth = sol.quantities[targetKey];

    const actionWord = isCompression ? "compressed" : "expanded";
    const workAsk = isCompression
      ? "Taking work done on the gas as positive, how much mechanical work is done on the gas during A → B?"
      : "Taking work done by the gas as positive, how much mechanical work is done by the gas during A → B?";

    const stems = [
      `Inside ${apparatus}, ${fmtDatum(moles)} mol of an ideal monatomic gas (adiabatic index γ = 5/3) initially at P_A = ${fmtDatum(pInit)} Pa and V_A = ${fmtDatum(vA)} m³ is reversibly and adiabatically ${actionWord} to V_B = ${fmtDatum(vB)} m³. Take R = 8.31 J mol⁻¹ K⁻¹. ${askPressure ? "What is the final pressure P_B in state B?" : workAsk}`,
      `The P–V diagram shows a rapid thermally insulated (adiabatic) ${isCompression ? "compression" : "expansion"} A → B of ${fmtDatum(moles)} mol of monatomic ideal gas (γ = 5/3) in ${apparatus} from (${fmtDatum(pInit)} Pa, ${fmtDatum(vA)} m³) to final volume ${fmtDatum(vB)} m³ (R = 8.31 J mol⁻¹ K⁻¹). ${askPressure ? "Determine the final pressure P_B." : workAsk}`,
      `A thermally isolated sample of ${fmtDatum(moles)} mol of monatomic ideal gas (γ = 5/3) in ${apparatus} transitions adiabatically from state A (${fmtDatum(pInit)} Pa, ${fmtDatum(vA)} m³) to state B of volume ${fmtDatum(vB)} m³. Given R = 8.31 J mol⁻¹ K⁻¹, ${askPressure ? "calculate the gas pressure at state B." : workAsk}`,
    ];
    const stem = stems[variantIndex % stems.length];
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const pB = sol.quantities["state:B:pressurePa"];
    const distractors: DistractorCandidate[] = askPressure
      ? [
          {
            value: pInit * (vA / vB),
            rationale:
              "Treats the process as isothermal (P_A V_A = P_B V_B) rather than adiabatic (P_A V_A^(5/3) = P_B V_B^(5/3)).",
          },
          {
            value: pInit * (vA / vB) ** 0.6,
            rationale:
              "Inverts the adiabatic exponent, using 3/5 instead of γ = 5/3.",
          },
          {
            value: pInit * (vA / vB) ** 1.4,
            rationale:
              "Uses the diatomic adiabatic index γ = 7/5 instead of γ = 5/3 for a monatomic gas.",
          },
          {
            value: pInit * (vB / vA) ** (5 / 3),
            rationale:
              "Inverts the volume ratio V_A / V_B inside the adiabatic law.",
          },
        ]
      : [
          {
            value: Math.abs(pInit * vA - pB * vB),
            rationale:
              "Omits the 3/2 factor in |ΔU| = (3/2)|P_B V_B − P_A V_A| when applying Q = 0 => |W| = |ΔU|.",
          },
          {
            value: pInit * Math.abs(vB - vA),
            rationale:
              "Treats pressure as constant at P_A, computing P_A |V_B − V_A| instead of adiabatic work.",
          },
          {
            value: pInit * vA * Math.abs(Math.log(vB / vA)),
            rationale:
              "Uses the isothermal work formula P_A V_A |ln(V_B / V_A)| instead of adiabatic work.",
          },
        ];

    const mcq = assembleMcqOptions(truth, targetUnit, distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, targetUnit, 3);

    return {
      id,
      conceptId: "thermodynamics-entropy-engines",
      templateArchetype: "adiabatic-monatomic-expansion-compression",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Solve a reversible monatomic adiabatic state transition using PV^gamma = const and the first law with Q = 0",
        distractorStrategy: [
          "isothermal-boyle-law-substitution",
          "inverted-adiabatic-index-three-fifths",
          "omitting-three-halves-in-adiabatic-work",
        ],
        assumptions: ["Reversible adiabatic process (Q = 0) of an ideal monatomic gas"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution: askPressure
        ? `For a monatomic adiabatic process, P_B = P_A (V_A / V_B)^(5/3) = ${fmtDatum(pInit)} × (${fmtDatum(vA)} / ${fmtDatum(vB)})^(5/3) = ${ans}.`
        : `First find P_B = P_A (V_A / V_B)^(5/3) = ${formatThermalValue(pB, 4)} Pa. Since Q = 0 in an adiabatic process, ${isCompression ? "W_on = +ΔU = (3/2)(P_B V_B − P_A V_A)" : "W_by = −ΔU = (3/2)(P_A V_A − P_B V_B)"} = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Applies P V^(5/3) = const ${askPressure ? "" : "and Q = 0 "}to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2
  const workKey = isCompression ? "leg:0:workOnGasJ" : "leg:0:workJ";
  const workDirPhrase = isCompression
    ? "work done on the gas (taking work done on the gas as positive)"
    : "work done by the gas (taking work done by the gas as positive)";

  const structStems = [
    `Inside ${apparatus}, ${fmtDatum(moles)} mol of an ideal monatomic gas (γ = 5/3) is thermally insulated from its surroundings and undergoes a reversible adiabatic ${isCompression ? "compression" : "expansion"} from state A (P_A = ${fmtDatum(pInit)} Pa, V_A = ${fmtDatum(vA)} m³) to state B of volume V_B = ${fmtDatum(vB)} m³. Take R = 8.31 J mol⁻¹ K⁻¹.`,
    `The P–V graph shows an adiabatic path A → B for ${fmtDatum(moles)} mol of monatomic ideal gas (adiabatic exponent γ = 5/3) confined in ${apparatus}. At state A, the pressure is ${fmtDatum(pInit)} Pa and the volume is ${fmtDatum(vA)} m³; at state B, the volume is ${fmtDatum(vB)} m³ (R = 8.31 J mol⁻¹ K⁻¹).`,
    `Zero heat crosses the walls of ${apparatus} while ${fmtDatum(moles)} mol of monatomic ideal gas (γ = 5/3, R = 8.31 J mol⁻¹ K⁻¹) moves reversibly from state A (${fmtDatum(pInit)} Pa, ${fmtDatum(vA)} m³) to a final volume of ${fmtDatum(vB)} m³ at state B.`,
    `During a fast insulated stroke in ${apparatus}, ${fmtDatum(moles)} mol of ideal monatomic gas (γ = 5/3) changes volume adiabatically from ${fmtDatum(vA)} m³ at ${fmtDatum(pInit)} Pa (state A) to ${fmtDatum(vB)} m³ (state B). Use R = 8.31 J mol⁻¹ K⁻¹.`,
  ];
  const stem = rng.pick(structStems);
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const pBAns = fmtWithUnit(sol.quantities["state:B:pressurePa"], "Pa", 3);
  const tBAns = fmtWithUnit(sol.quantities["state:B:temperatureK"], "K", 3);
  const wAns = fmtWithUnit(sol.quantities[workKey], "J", 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: "Calculate the final pressure P_B of the gas in state B.",
      marks: 2,
      targetQuantityKey: "state:B:pressurePa",
      expectedAnswer: pBAns,
      workingSteps: [
        `P_B = P_A (V_A / V_B)^(5/3) = ${fmtDatum(pInit)} × (${fmtDatum(vA)} / ${fmtDatum(vB)})^(5/3) = ${pBAns}.`,
      ],
    },
    {
      partId: "b",
      prompt: "Determine the absolute temperature T_B of the gas in state B.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "state:B:temperatureK",
      expectedAnswer: tBAns,
      workingSteps: [
        `T_B = P_B V_B / (nR) = (${formatThermalValue(sol.quantities["state:B:pressurePa"], 4)} × ${fmtDatum(vB)}) / (${fmtDatum(moles)} × 8.31) = ${tBAns}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Using the first law of thermodynamics, calculate the ${workDirPhrase} during A → B.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: workKey,
      expectedAnswer: wAns,
      workingSteps: [
        "For an adiabatic process, Q = 0.",
        isCompression
          ? `W_on = ΔU = (3/2)(P_B V_B − P_A V_A) = ${wAns}.`
          : `W_by = −ΔU = (3/2)(P_A V_A − P_B V_B) = ${wAns}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "thermodynamics-entropy-engines",
    templateArchetype: "adiabatic-monatomic-expansion-compression",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Determine final pressure, final temperature, and adiabatic work for a monatomic ideal gas",
      subpartStrategy: [
        "Final pressure from adiabatic PV^gamma relation",
        "Final temperature from ideal gas equation at state B",
        "Mechanical work from Q = 0 and monatomic internal energy change",
      ],
      assumptions: ["Reversible thermally insulated process of a monatomic ideal gas"],
    },
    stem,
    parts,
    workedSolution: `(a) P_B = P_A (V_A / V_B)^(5/3) = ${pBAns}. (b) T_B = P_B V_B / (nR) = ${tBAns}. (c) With Q = 0, ${isCompression ? "W_on = ΔU" : "W_by = −ΔU"} = ${wAns}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Uses P_A V_A^(5/3) = P_B V_B^(5/3).", pBAns),
      ...buildTwoMarkPartScheme("b", "Uses T_B = P_B V_B / (nR) or T_A (V_A / V_B)^(2/3).", tBAns),
      ...buildTwoMarkPartScheme("c", "Sets Q = 0 and evaluates |(3/2)(P_B V_B − P_A V_A)|.", wAns),
    ],
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* 8. thermodynamics-entropy-engines :: isothermal-work-and-entropy-change    */
/* ========================================================================== */

function buildIsothermalWorkAndEntropy(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const apparatus = PISTON_ENGINE_CONTEXTS[(variantIndex + 8) % PISTON_ENGINE_CONTEXTS.length];

  const moles = rng.pick([0.3, 0.45, 0.6, 0.85, 1.2, 1.6, 2.2]);
  const temperatureK = rng.pick([280, 310, 350, 400, 450, 520, 600]);
  const vA = rng.pick([0.0015, 0.002, 0.0025, 0.0035, 0.005]);
  const expRatio = rng.pick([2.0, 2.4, 3.0, 3.5, 4.5]);
  const vB = Number((vA * expRatio).toPrecision(6));

  const spec: ThermodynamicProcessScenarioSpec = {
    kind: "thermodynamic-process",
    moles,
    initialState: {
      stateId: "A",
      label: "A",
      volumeM3: vA,
      temperatureK,
    },
    steps: [
      { process: "isothermal", toStateId: "B", toLabel: "B", targetVolumeM3: vB },
    ],
    isClosedCycle: false,
    diagramPlane: "PV",
  };
  const sol = solveThermodynamicProcess(spec);

  const hiddenQuantities = [
    "state:A:pressurePa",
    "state:B:pressurePa",
    "leg:0:workJ",
    "leg:0:heatJ",
    "leg:0:entropyChangeJK",
    "leg:0:isothermalEntropyChangeJK",
    "netWorkJ",
    "totalWorkJ",
    "netHeatJ",
    "totalHeatJ",
    "totalEntropyChangeJK",
  ];

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "moles", value: moles, unit: "mol", source: "stem" },
    { name: "temperatureK", value: temperatureK, unit: "K", source: "stem" },
    { name: "volumeA", value: vA, unit: "m³", source: "stem" },
    { name: "volumeB", value: vB, unit: "m³", source: "stem" },
  ];

  if (format === "mcq") {
    const askEntropy = variantIndex % 2 === 0;
    const targetKey = askEntropy ? "leg:0:isothermalEntropyChangeJK" : "leg:0:workJ";
    const targetUnit = askEntropy ? "J K⁻¹" : "J";
    const truth = sol.quantities[targetKey];

    const stems = askEntropy
      ? [
          `In ${apparatus} coupled to a thermal reservoir at ${fmtDatum(temperatureK)} K, ${fmtDatum(moles)} mol of an ideal gas expands reversibly and isothermally from V_A = ${fmtDatum(vA)} m³ to V_B = ${fmtDatum(vB)} m³. Take R = 8.31 J mol⁻¹ K⁻¹. What is the change in entropy ΔS of the gas?`,
          `The P–V curve shows a reversible isothermal expansion at ${fmtDatum(temperatureK)} K of ${fmtDatum(moles)} mol of ideal gas inside ${apparatus} from volume ${fmtDatum(vA)} m³ to ${fmtDatum(vB)} m³ (R = 8.31 J mol⁻¹ K⁻¹). Calculate the entropy increase ΔS of the gas.`,
          `Maintained in thermal contact with a ${fmtDatum(temperatureK)} K bath, ${fmtDatum(moles)} mol of ideal gas in ${apparatus} expands quasi-statically from ${fmtDatum(vA)} m³ to ${fmtDatum(vB)} m³. Using R = 8.31 J mol⁻¹ K⁻¹, determine ΔS = Q / T for the gas.`,
        ]
      : [
          `Inside ${apparatus}, ${fmtDatum(moles)} mol of ideal gas is held at a constant temperature of ${fmtDatum(temperatureK)} K while expanding reversibly from V_A = ${fmtDatum(vA)} m³ to V_B = ${fmtDatum(vB)} m³. Taking work done by the gas as positive and R = 8.31 J mol⁻¹ K⁻¹, how much work is done by the gas?`,
          `A thermal bath keeps ${fmtDatum(moles)} mol of ideal gas in ${apparatus} at ${fmtDatum(temperatureK)} K during a reversible expansion from ${fmtDatum(vA)} m³ to ${fmtDatum(vB)} m³ (R = 8.31 J mol⁻¹ K⁻¹). What is the thermal energy Q supplied to the gas (equal to work done by the gas)?`,
          `On the P–V diagram, ${fmtDatum(moles)} mol of an ideal gas in ${apparatus} undergoes a reversible isothermal expansion at ${fmtDatum(temperatureK)} K from ${fmtDatum(vA)} m³ to ${fmtDatum(vB)} m³. Take R = 8.31 J mol⁻¹ K⁻¹ and expansion work by the gas as positive. Find W_AB.`,
        ];

    const stem = stems[variantIndex % stems.length];
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const pA = sol.quantities["state:A:pressurePa"];
    const distractors: DistractorCandidate[] = askEntropy
      ? [
          {
            value: moles * MOLAR_GAS_CONSTANT * Math.log10(vB / vA),
            rationale:
              "Uses base-10 logarithm log₁₀(V_B / V_A) instead of the natural logarithm ln(V_B / V_A).",
          },
          {
            value: sol.quantities["leg:0:workJ"],
            rationale:
              "Computes isothermal heat Q = nRT ln(V_B / V_A) without dividing by T to obtain ΔS = Q / T.",
          },
          {
            value: moles * MOLAR_GAS_CONSTANT * ((vB - vA) / vA),
            rationale:
              "Replaces ln(V_B / V_A) with the linear fractional change (V_B − V_A) / V_A.",
          },
        ]
      : [
          {
            value: pA * (vB - vA),
            rationale:
              "Treats pressure as remaining constant at P_A, computing P_A(V_B − V_A) instead of ∫ P dV = nRT ln(V_B / V_A).",
          },
          {
            value: moles * MOLAR_GAS_CONSTANT * temperatureK * Math.log10(vB / vA),
            rationale:
              "Substitutes log₁₀(V_B / V_A) instead of ln(V_B / V_A).",
          },
          {
            value:
              sol.quantities["leg:0:workJ"] +
              1.5 * moles * MOLAR_GAS_CONSTANT * temperatureK,
            rationale:
              "Adds U = (3/2)nRT to isothermal work, overlooking that ΔU = 0 at constant temperature.",
          },
        ];

    const mcq = assembleMcqOptions(truth, targetUnit, distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, targetUnit, 3);

    return {
      id,
      conceptId: "thermodynamics-entropy-engines",
      templateArchetype: "isothermal-work-and-entropy-change",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Compute reversible isothermal work, heat transfer, or Clausius entropy change for an ideal gas",
        distractorStrategy: [
          "base-ten-log-vs-natural-log-error",
          "constant-pressure-rectangle-approximation",
          "omitting-temperature-division-in-clausius-entropy",
        ],
        assumptions: ["Reversible isothermal expansion of an ideal gas with ΔU = 0"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution: askEntropy
        ? `For a reversible isothermal expansion, ΔU = 0 so Q = W_by = nRT ln(V_B / V_A). Therefore ΔS = Q / T = nR ln(V_B / V_A) = ${fmtDatum(moles)} × 8.31 × ln(${fmtDatum(vB)} / ${fmtDatum(vA)}) = ${ans}.`
        : `At constant temperature T = ${fmtDatum(temperatureK)} K, ΔU = 0 and W_by = Q = nRT ln(V_B / V_A) = ${fmtDatum(moles)} × 8.31 × ${fmtDatum(temperatureK)} × ln(${fmtDatum(vB)} / ${fmtDatum(vA)}) = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates ${askEntropy ? "ΔS = nR ln(V_B / V_A)" : "W = nRT ln(V_B / V_A)"} to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2
  const structStems = [
    `Inside ${apparatus} immersed in a constant-temperature bath at ${fmtDatum(temperatureK)} K, ${fmtDatum(moles)} mol of an ideal monatomic gas expands reversibly along isotherm A → B from V_A = ${fmtDatum(vA)} m³ to V_B = ${fmtDatum(vB)} m³. Take R = 8.31 J mol⁻¹ K⁻¹ and expansion work done by the gas as positive.`,
    `The P–V diagram shows ${fmtDatum(moles)} mol of ideal gas in ${apparatus} undergoing a quasi-static isothermal expansion at ${fmtDatum(temperatureK)} K from initial volume ${fmtDatum(vA)} m³ (state A) to final volume ${fmtDatum(vB)} m³ (state B). Use R = 8.31 J mol⁻¹ K⁻¹ and take work done by the gas as positive.`,
    `Coupled thermally to a ${fmtDatum(temperatureK)} K reservoir, ${fmtDatum(moles)} mol of ideal gas confined in ${apparatus} expands slowly from ${fmtDatum(vA)} m³ at A to ${fmtDatum(vB)} m³ at B (R = 8.31 J mol⁻¹ K⁻¹; define work done by the gas as positive).`,
    `At fixed temperature T = ${fmtDatum(temperatureK)} K, ${fmtDatum(moles)} mol of ideal gas inside ${apparatus} follows reversible isothermal curve A → B from ${fmtDatum(vA)} m³ to ${fmtDatum(vB)} m³. Adopt R = 8.31 J mol⁻¹ K⁻¹ and positive expansion work by the gas.`,
  ];
  const stem = rng.pick(structStems);
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const pBAns = fmtWithUnit(sol.quantities["state:B:pressurePa"], "Pa", 3);
  const wAns = fmtWithUnit(sol.quantities["leg:0:workJ"], "J", 3);
  const dsAns = fmtWithUnit(sol.quantities["leg:0:isothermalEntropyChangeJK"], "J K⁻¹", 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: "Calculate the final pressure P_B of the gas in state B.",
      marks: 2,
      targetQuantityKey: "state:B:pressurePa",
      expectedAnswer: pBAns,
      workingSteps: [
        `P_B = nRT / V_B = (${fmtDatum(moles)} × 8.31 × ${fmtDatum(temperatureK)}) / ${fmtDatum(vB)} = ${pBAns}.`,
      ],
    },
    {
      partId: "b",
      prompt:
        "Calculate the work done by the gas during the reversible isothermal expansion A → B.",
      marks: 2,
      targetQuantityKey: "leg:0:workJ",
      expectedAnswer: wAns,
      workingSteps: [
        `W_by = nRT ln(V_B / V_A) = ${fmtDatum(moles)} × 8.31 × ${fmtDatum(temperatureK)} × ln(${fmtDatum(vB)} / ${fmtDatum(vA)}) = ${wAns}.`,
      ],
    },
    {
      partId: "c",
      prompt: "Determine the change in entropy ΔS of the gas during A → B.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "leg:0:isothermalEntropyChangeJK",
      expectedAnswer: dsAns,
      workingSteps: [
        "Since ΔU = 0 for an ideal gas isotherm, Q = W_by.",
        `ΔS = Q / T = ${formatThermalValue(sol.quantities["leg:0:workJ"], 4)} / ${fmtDatum(temperatureK)} = ${dsAns}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "thermodynamics-entropy-engines",
    templateArchetype: "isothermal-work-and-entropy-change",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Determine final pressure, isothermal boundary work, and Clausius entropy change",
      subpartStrategy: [
        "Final pressure from ideal gas law at V_B",
        "Isothermal expansion work via natural logarithm of volume ratio",
        "Entropy change from reversible heat transfer divided by temperature",
      ],
      assumptions: ["Reversible isothermal expansion in contact with a heat reservoir"],
    },
    stem,
    parts,
    workedSolution: `(a) P_B = nRT / V_B = ${pBAns}. (b) W_by = nRT ln(V_B / V_A) = ${wAns}. (c) Since ΔU = 0, Q = W_by and ΔS = Q / T = ${dsAns}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Uses P_B = nRT / V_B.", pBAns),
      ...buildTwoMarkPartScheme("b", "Evaluates nRT ln(V_B / V_A).", wAns),
      ...buildTwoMarkPartScheme("c", "Uses ΔS = Q / T with Q = W_by.", dsAns),
    ],
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* 9. thermodynamics-entropy-engines :: carnot-engine-efficiency-and-reserv.  */
/* ========================================================================== */

function buildCarnotEngineEfficiency(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const apparatus = PISTON_ENGINE_CONTEXTS[(variantIndex + 9) % PISTON_ENGINE_CONTEXTS.length];
  const plane: ThermalDiagramPlane =
    variantIndex % 4 === 2 ? "PT" : "PV";

  const useCelsius = variantIndex % 2 === 1;
  const coldC = rng.pick([27, 47, 67, 87, 117]);
  const hotC = rng.pick([277, 327, 427, 527, 627]);
  const coldTemperatureK = useCelsius
    ? Number((coldC + KELVIN_OFFSET).toFixed(2))
    : rng.pick([260, 290, 320, 350, 380]);
  const hotTemperatureK = useCelsius
    ? Number((hotC + KELVIN_OFFSET).toFixed(2))
    : Math.round(coldTemperatureK * rng.pick([1.6, 1.85, 2.2, 2.5]));

  const moles = rng.pick([0.3, 0.5, 0.75, 1.0, 1.4]);
  const initialVolumeM3 = rng.pick([0.0012, 0.0015, 0.002, 0.0025]);
  const expFactor = rng.pick([2.0, 2.5, 3.0, 3.5]);
  const isothermalExpansionVolumeM3 = Number(
    (initialVolumeM3 * expFactor).toPrecision(6),
  );

  const spec: CarnotCycleScenarioSpec = {
    kind: "carnot-cycle",
    moles,
    hotTemperatureK,
    coldTemperatureK,
    initialVolumeM3,
    isothermalExpansionVolumeM3,
    cycleDirection: "heat-engine",
    diagramPlane: plane,
  };
  const sol = solveCarnotCycle(spec);

  const hiddenQuantities = [
    "carnotEfficiency",
    "thermalEfficiency",
    "netWorkJ",
    "totalWorkJ",
    "netHeatJ",
    "totalHeatJ",
    "heatInputJ",
    "heatRejectedJ",
    "state:A:pressurePa",
    "state:B:pressurePa",
    "state:C:pressurePa",
    "state:D:pressurePa",
    "state:C:volumeM3",
    "state:D:volumeM3",
  ];

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "moles", value: moles, unit: "mol", source: "stem" },
    { name: "hotTemperatureK", value: hotTemperatureK, unit: "K", source: "stem" },
    { name: "coldTemperatureK", value: coldTemperatureK, unit: "K", source: "stem" },
    { name: "initialVolumeM3", value: initialVolumeM3, unit: "m³", source: "stem" },
    {
      name: "isothermalExpansionVolumeM3",
      value: isothermalExpansionVolumeM3,
      unit: "m³",
      source: "stem",
    },
  ];

  const tempDesc = useCelsius
    ? `a hot reservoir at ${fmtDatum(hotC)} °C and a cold sink at ${fmtDatum(coldC)} °C (take T(K) = θ(°C) + 273.15)`
    : `a hot reservoir at ${fmtDatum(hotTemperatureK)} K and a cold sink at ${fmtDatum(coldTemperatureK)} K`;

  if (format === "mcq") {
    const mode = variantIndex % 3;
    const targetKey =
      mode === 0 ? "carnotEfficiency" : mode === 1 ? "netWorkJ" : "heatRejectedJ";
    const targetUnit = mode === 0 ? "" : "J";
    const truth = sol.quantities[targetKey];

    const askClause =
      mode === 0
        ? "What is the theoretical thermal efficiency η of this Carnot cycle?"
        : mode === 1
          ? "Taking net work done by the gas as positive (R = 8.31 J mol⁻¹ K⁻¹), what is the net work output W_net per cycle?"
          : "Taking R = 8.31 J mol⁻¹ K⁻¹, what magnitude of thermal energy Q_C is rejected to the cold sink per cycle?";

    const stems = [
      `In ${apparatus}, ${fmtDatum(moles)} mol of monatomic ideal gas executes a reversible Carnot heat-engine cycle between ${tempDesc}, expanding isothermally at the hot reservoir from V_A = ${fmtDatum(initialVolumeM3)} m³ to V_B = ${fmtDatum(isothermalExpansionVolumeM3)} m³. ${askClause}`,
      `A Carnot engine modelled in ${apparatus} uses ${fmtDatum(moles)} mol of ideal gas operating between ${tempDesc}. During the high-temperature isothermal stage A → B, the volume increases from ${fmtDatum(initialVolumeM3)} m³ to ${fmtDatum(isothermalExpansionVolumeM3)} m³. ${askClause}`,
      `The diagram shows a reversible Carnot cycle A → B → C → D → A for ${fmtDatum(moles)} mol of monatomic ideal gas in ${apparatus} coupled to ${tempDesc}, with isothermal expansion from ${fmtDatum(initialVolumeM3)} m³ to ${fmtDatum(isothermalExpansionVolumeM3)} m³. ${askClause}`,
    ];
    const stem = stems[variantIndex % stems.length];
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const distractors: DistractorCandidate[] =
      mode === 0
        ? [
            ...(useCelsius
              ? [
                  {
                    value: 1 - coldC / hotC,
                    rationale:
                      "Substitutes Celsius temperatures directly into 1 − θ_C / θ_H instead of converting to absolute kelvin temperatures.",
                  },
                ]
              : [
                  {
                    value: 1 - initialVolumeM3 / isothermalExpansionVolumeM3,
                    rationale:
                      "Uses the isothermal volume ratio 1 − V_A / V_B instead of the reservoir temperature ratio 1 − T_C / T_H.",
                  },
                ]),
            {
              value: coldTemperatureK / hotTemperatureK,
              rationale:
                "Evaluates T_C / T_H without subtracting from 1.",
            },
            {
              value: (hotTemperatureK - coldTemperatureK) / coldTemperatureK,
              rationale:
                "Divides ΔT by T_C instead of T_H when computing efficiency.",
            },
          ]
        : mode === 1
          ? [
              {
                value: sol.quantities.heatInputJ,
                rationale:
                  "Calculates total heat input Q_H = nRT_H ln(V_B / V_A) without multiplying by Carnot efficiency (1 − T_C / T_H).",
              },
              {
                value: sol.quantities.heatRejectedJ,
                rationale:
                  "Calculates the rejected heat Q_C = nRT_C ln(V_B / V_A) instead of net work Q_H − Q_C.",
              },
              {
                value:
                  moles *
                  MOLAR_GAS_CONSTANT *
                  (hotTemperatureK - coldTemperatureK) *
                  Math.log10(isothermalExpansionVolumeM3 / initialVolumeM3),
                rationale:
                  "Uses base-10 log₁₀(V_B / V_A) instead of natural logarithm ln(V_B / V_A).",
              },
            ]
          : [
              {
                value: sol.quantities.heatInputJ,
                rationale:
                  "Computes the heat absorbed Q_H from the hot reservoir instead of the heat Q_C rejected to the cold sink.",
              },
              {
                value: sol.quantities.netWorkJ,
                rationale:
                  "Computes net work W_net = Q_H − Q_C instead of the rejected heat Q_C.",
              },
              {
                value:
                  moles *
                  MOLAR_GAS_CONSTANT *
                  coldTemperatureK *
                  Math.log10(isothermalExpansionVolumeM3 / initialVolumeM3),
                rationale:
                  "Uses log₁₀(V_B / V_A) instead of ln(V_B / V_A) in Q_C = nRT_C ln(V_B / V_A).",
              },
            ];

    const mcq = assembleMcqOptions(truth, targetUnit, distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, targetUnit, 3);

    const workedSolution =
      mode === 0
        ? `${useCelsius ? `Convert to kelvin: T_H = ${fmtDatum(hotTemperatureK)} K, T_C = ${fmtDatum(coldTemperatureK)} K. ` : ""}Carnot efficiency η = 1 − T_C / T_H = 1 − ${fmtDatum(coldTemperatureK)} / ${fmtDatum(hotTemperatureK)} = ${ans}.`
        : mode === 1
          ? `Q_H = nRT_H ln(V_B / V_A) = ${formatThermalValue(sol.quantities.heatInputJ, 4)} J and η = 1 − T_C / T_H = ${formatThermalValue(sol.quantities.carnotEfficiency, 4)}. Net work output W_net = η Q_H = nR(T_H − T_C) ln(V_B / V_A) = ${ans}.`
          : `During isothermal compression C → D at T_C = ${fmtDatum(coldTemperatureK)} K, V_C / V_D = V_B / V_A, so heat rejected to the cold sink is Q_C = nRT_C ln(V_B / V_A) = ${ans}.`;

    return {
      id,
      conceptId: "thermodynamics-entropy-engines",
      templateArchetype: "carnot-engine-efficiency-and-reservoirs",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Evaluate Carnot efficiency, net cycle work, or cold-sink heat rejection from reservoir temperatures and expansion ratio",
        distractorStrategy: [
          "celsius-temperature-ratio-trap",
          "unsubtracted-tc-over-th-ratio",
          "confusing-qh-qc-and-wnet",
        ],
        assumptions: ["Reversible four-leg Carnot heat-engine cycle"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution,
      markScheme: [
        {
          code: "A1",
          criterion: `Applies Carnot thermodynamics in kelvin to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2
  const structStems = [
    `A reversible Carnot heat engine in ${apparatus} uses ${fmtDatum(moles)} mol of an ideal monatomic gas operating between ${tempDesc}. During the hot isothermal expansion A → B, the gas expands from V_A = ${fmtDatum(initialVolumeM3)} m³ to V_B = ${fmtDatum(isothermalExpansionVolumeM3)} m³. Take R = 8.31 J mol⁻¹ K⁻¹ and net work done by the gas as positive.`,
    `The diagram represents a clockwise Carnot cycle A → B → C → D → A for ${fmtDatum(moles)} mol of ideal monatomic gas inside ${apparatus} coupled to ${tempDesc}. State A has volume ${fmtDatum(initialVolumeM3)} m³ and state B has volume ${fmtDatum(isothermalExpansionVolumeM3)} m³ (R = 8.31 J mol⁻¹ K⁻¹, work done by gas positive).`,
    `Operating between ${tempDesc}, ${fmtDatum(moles)} mol of ideal gas in ${apparatus} executes an ideal Carnot power cycle whose high-temperature isothermal leg A → B expands from ${fmtDatum(initialVolumeM3)} m³ to ${fmtDatum(isothermalExpansionVolumeM3)} m³. Use R = 8.31 J mol⁻¹ K⁻¹ and take work done by the gas as positive.`,
    `Within ${apparatus}, ${fmtDatum(moles)} mol of monatomic working gas completes a four-stage Carnot engine loop between ${tempDesc}, expanding from ${fmtDatum(initialVolumeM3)} m³ to ${fmtDatum(isothermalExpansionVolumeM3)} m³ while in contact with the hot source (R = 8.31 J mol⁻¹ K⁻¹; net work output by the gas positive).`,
  ];
  const stem = rng.pick(structStems);
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const etaAns = formatThermalValue(sol.quantities.carnotEfficiency, 3);
  const qHAns = fmtWithUnit(sol.quantities.heatInputJ, "J", 3);
  const wNetAns = fmtWithUnit(sol.quantities.netWorkJ, "J", 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: "Calculate the thermal efficiency η of the Carnot cycle.",
      marks: 2,
      targetQuantityKey: "carnotEfficiency",
      expectedAnswer: etaAns,
      workingSteps: [
        ...(useCelsius
          ? [`T_H = ${fmtDatum(hotC)} + 273.15 = ${fmtDatum(hotTemperatureK)} K; T_C = ${fmtDatum(coldC)} + 273.15 = ${fmtDatum(coldTemperatureK)} K.`]
          : []),
        `η = 1 − T_C / T_H = 1 − ${fmtDatum(coldTemperatureK)} / ${fmtDatum(hotTemperatureK)} = ${etaAns}.`,
      ],
    },
    {
      partId: "b",
      prompt:
        "Calculate the thermal energy Q_H absorbed from the hot reservoir during the isothermal expansion A → B.",
      marks: 2,
      targetQuantityKey: "heatInputJ",
      expectedAnswer: qHAns,
      workingSteps: [
        `Q_H = n R T_H ln(V_B / V_A) = ${fmtDatum(moles)} × 8.31 × ${fmtDatum(hotTemperatureK)} × ln(${fmtDatum(isothermalExpansionVolumeM3)} / ${fmtDatum(initialVolumeM3)}) = ${qHAns}.`,
      ],
    },
    {
      partId: "c",
      prompt: "Determine the net mechanical work W_net done by the gas per cycle.",
      marks: 2,
      dependsOnPartIds: ["a", "b"],
      targetQuantityKey: "netWorkJ",
      expectedAnswer: wNetAns,
      workingSteps: [
        `W_net = η Q_H = ${formatThermalValue(sol.quantities.carnotEfficiency, 4)} × ${formatThermalValue(sol.quantities.heatInputJ, 4)} = ${wNetAns}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "thermodynamics-entropy-engines",
    templateArchetype: "carnot-engine-efficiency-and-reservoirs",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Calculate Carnot efficiency, hot-reservoir heat input, and net cycle work output",
      subpartStrategy: [
        "Carnot efficiency from kelvin reservoir temperatures",
        "Isothermal heat input at T_H",
        "Net cycle work from efficiency and Q_H",
      ],
      assumptions: ["Reversible Carnot heat engine using an ideal gas"],
    },
    stem,
    parts,
    workedSolution: `(a) η = 1 − T_C / T_H = ${etaAns}. (b) Q_H = nRT_H ln(V_B / V_A) = ${qHAns}. (c) W_net = η Q_H = ${wNetAns}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Converts temperatures to kelvin and applies 1 − T_C / T_H.", etaAns),
      ...buildTwoMarkPartScheme("b", "Uses Q_H = nRT_H ln(V_B / V_A).", qHAns),
      ...buildTwoMarkPartScheme("c", "Multiplies η by Q_H (or evaluates Q_H − Q_C).", wNetAns),
    ],
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* 10. thermodynamics-entropy-engines :: closed-adiabatic-heat-engine-cycle   */
/* ========================================================================== */

function buildClosedAdiabaticHeatEngineCycle(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const apparatus = PISTON_ENGINE_CONTEXTS[(variantIndex + 10) % PISTON_ENGINE_CONTEXTS.length];

  const moles = rng.pick([0.25, 0.4, 0.6, 0.8, 1.0, 1.2]);
  const vLow = rng.pick([0.0012, 0.0015, 0.002, 0.0025]);
  const compRatio = rng.pick([2.0, 2.5, 3.0, 4.0]);
  const vHigh = Number((vLow * compRatio).toPrecision(6));
  const useOtto = variantIndex % 2 === 1;

  let spec: ThermodynamicProcessScenarioSpec;
  let requiredGivens: RequiredGivenSpec[];
  let pA = 0;
  let pPeak = 0;

  if (useOtto) {
    pA = rng.pick([1.0e5, 1.2e5, 1.5e5]);
    const pAfterComp = pA * compRatio ** (5 / 3);
    pPeak = Number((pAfterComp * rng.pick([1.8, 2.2, 2.6])).toPrecision(5));
    spec = {
      kind: "thermodynamic-process",
      moles,
      initialState: { stateId: "A", label: "A", pressurePa: pA, volumeM3: vHigh },
      steps: [
        { process: "adiabatic", toStateId: "B", toLabel: "B", targetVolumeM3: vLow },
        { process: "isochoric", toStateId: "C", toLabel: "C", targetPressurePa: pPeak },
        { process: "adiabatic", toStateId: "D", toLabel: "D", targetVolumeM3: vHigh },
        { process: "isochoric", closeToInitial: true },
      ],
      isClosedCycle: true,
      diagramPlane: "PV",
    };
    requiredGivens = [
      { name: "moles", value: moles, unit: "mol", source: "stem" },
      { name: "pA", value: pA, unit: "Pa", source: "stem" },
      { name: "vHigh", value: vHigh, unit: "m³", source: "stem" },
      { name: "vLow", value: vLow, unit: "m³", source: "stem" },
      { name: "pPeak", value: pPeak, unit: "Pa", source: "stem" },
    ];
  } else {
    // 3-leg cycle: A(pPeak, vLow) -> adiabatic expansion to B(vHigh) -> isobaric compression to C(vLow) -> isochoric heating to A
    pPeak = rng.pick([4.5e5, 5.5e5, 6.5e5, 8.0e5]);
    spec = {
      kind: "thermodynamic-process",
      moles,
      initialState: { stateId: "A", label: "A", pressurePa: pPeak, volumeM3: vLow },
      steps: [
        { process: "adiabatic", toStateId: "B", toLabel: "B", targetVolumeM3: vHigh },
        { process: "isobaric", toStateId: "C", toLabel: "C", targetVolumeM3: vLow },
        { process: "isochoric", closeToInitial: true },
      ],
      isClosedCycle: true,
      diagramPlane: "PV",
    };
    requiredGivens = [
      { name: "moles", value: moles, unit: "mol", source: "stem" },
      { name: "pPeak", value: pPeak, unit: "Pa", source: "stem" },
      { name: "vLow", value: vLow, unit: "m³", source: "stem" },
      { name: "vHigh", value: vHigh, unit: "m³", source: "stem" },
    ];
  }

  const sol = solveThermodynamicProcess(spec);
  const hiddenQuantities = [
    "state:B:pressurePa",
    "state:B:temperatureK",
    "netWorkJ",
    "totalWorkJ",
    "netHeatJ",
    "totalHeatJ",
    "heatInputJ",
    "heatRejectedJ",
    "thermalEfficiency",
    "carnotEfficiency",
    ...(useOtto ? ["state:D:pressurePa"] : ["state:C:pressurePa"]),
  ];

  if (format === "mcq") {
    const targetKey = useOtto ? "thermalEfficiency" : "netWorkJ";
    const targetUnit = useOtto ? "" : "J";
    const truth = sol.quantities[targetKey];

    const stems = useOtto
      ? [
          `In ${apparatus}, ${fmtDatum(moles)} mol of an ideal monatomic gas (γ = 5/3) executes an idealised four-leg Otto cycle A → B → C → D → A: adiabatic compression from (${fmtDatum(pA)} Pa, ${fmtDatum(vHigh)} m³) at A to V_B = ${fmtDatum(vLow)} m³ at B, isochoric heating to P_C = ${fmtDatum(pPeak)} Pa at C, adiabatic expansion back to V_D = ${fmtDatum(vHigh)} m³ at D, and isochoric cooling to A. What is the thermal efficiency η of this cycle?`,
          `The P–V diagram shows an ideal Otto cycle for ${fmtDatum(moles)} mol of monatomic gas (γ = 5/3) in ${apparatus}, compressing adiabatically from V_max = ${fmtDatum(vHigh)} m³ (at ${fmtDatum(pA)} Pa) to V_min = ${fmtDatum(vLow)} m³, heating isochorically to ${fmtDatum(pPeak)} Pa, expanding adiabatically to ${fmtDatum(vHigh)} m³, and cooling isochorically back to state A. Calculate the cycle efficiency η = W_net / Q_in.`,
          `A closed reciprocating loop (${apparatus}) carries ${fmtDatum(moles)} mol of monatomic ideal gas (adiabatic index 5/3) around Otto cycle A → B → C → D → A between volume limits ${fmtDatum(vLow)} m³ and ${fmtDatum(vHigh)} m³, with initial pressure P_A = ${fmtDatum(pA)} Pa and peak pressure P_C = ${fmtDatum(pPeak)} Pa. Determine its thermal efficiency.`,
          `Starting at state A (${fmtDatum(pA)} Pa, ${fmtDatum(vHigh)} m³), ${fmtDatum(moles)} mol of monatomic gas (γ = 5/3) in ${apparatus} is compressed adiabatically to ${fmtDatum(vLow)} m³, heated at constant volume to ${fmtDatum(pPeak)} Pa, expanded adiabatically to ${fmtDatum(vHigh)} m³, and cooled at constant volume back to A. Find η.`,
        ]
      : [
          `Inside ${apparatus}, ${fmtDatum(moles)} mol of an ideal monatomic gas (γ = 5/3) performs a closed three-step cycle A → B → C → A: reversible adiabatic expansion from state A (${fmtDatum(pPeak)} Pa, ${fmtDatum(vLow)} m³) to volume ${fmtDatum(vHigh)} m³ at B, isobaric compression from B to volume ${fmtDatum(vLow)} m³ at C, and isochoric heating from C back to A. Taking work done by the gas as positive, what is the net work output W_net per cycle?`,
          `A closed heat engine (${apparatus}) takes ${fmtDatum(moles)} mol of monatomic ideal gas (γ = 5/3) from A (${fmtDatum(pPeak)} Pa, ${fmtDatum(vLow)} m³) adiabatically to V_B = ${fmtDatum(vHigh)} m³, compresses it at constant pressure back to V_C = ${fmtDatum(vLow)} m³, and heats it isochorically back to A. Find the net work done by the gas per cycle (work by gas positive).`,
          `On the P–V plot for ${apparatus}, ${fmtDatum(moles)} mol of monatomic working gas (γ = 5/3) expands adiabatically from (${fmtDatum(pPeak)} Pa, ${fmtDatum(vLow)} m³) at A to ${fmtDatum(vHigh)} m³ at B, returns to ${fmtDatum(vLow)} m³ isobarically at C, and regains ${fmtDatum(pPeak)} Pa isochorically. Defining work by the gas as positive, calculate W_net.`,
          `Three reversible stages A → B → C → A form a heat-engine cycle for ${fmtDatum(moles)} mol of monatomic gas (γ = 5/3) inside ${apparatus}: adiabatic expansion from ${fmtDatum(pPeak)} Pa and ${fmtDatum(vLow)} m³ to ${fmtDatum(vHigh)} m³, constant-pressure compression to ${fmtDatum(vLow)} m³, and constant-volume heating to A. What net mechanical work output does one cycle deliver?`,
        ];

    const stem = rng.pick(stems);
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const pB = sol.quantities["state:B:pressurePa"];
    const distractors: DistractorCandidate[] = useOtto
      ? [
          {
            value: 1 - vLow / vHigh,
            rationale:
              "Uses exponent 1 instead of γ − 1 = 2/3 in the Otto efficiency relation η = 1 − (V_min / V_max)^(γ − 1).",
          },
          {
            value: 1 - (vLow / vHigh) ** (5 / 3),
            rationale:
              "Raises V_min / V_max to γ = 5/3 rather than γ − 1 = 2/3.",
          },
          {
            value: sol.quantities.carnotEfficiency,
            rationale:
              "Computes Carnot efficiency 1 − T_A / T_C between extreme cycle temperatures instead of Otto efficiency.",
          },
        ]
      : [
          {
            value: sol.quantities["leg:0:workJ"],
            rationale:
              "Computes only the adiabatic expansion work W_AB and forgets to subtract the isobaric compression work |W_BC|.",
          },
          {
            value: Math.abs(sol.quantities["leg:1:workJ"]),
            rationale:
              "Computes only the magnitude of the isobaric compression work P_B(V_B − V_C).",
          },
          {
            value: sol.quantities.heatInputJ,
            rationale:
              "Calculates total heat input Q_CA along the isochoric leg instead of net work W_net.",
          },
          {
            value: (pPeak - pB) * (vHigh - vLow) * 0.5,
            rationale:
              "Approximates the curved adiabatic leg A → B as a straight line (triangle area) on the P–V diagram.",
          },
        ];

    const mcq = assembleMcqOptions(truth, targetUnit, distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, targetUnit, 3);

    return {
      id,
      conceptId: "thermodynamics-entropy-engines",
      templateArchetype: "closed-adiabatic-heat-engine-cycle",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Evaluate net cycle work or thermal efficiency for a closed multi-leg adiabatic heat-engine cycle",
        distractorStrategy: [
          "adiabatic-exponent-slip-in-cycle",
          "single-leg-work-instead-of-net-cycle-work",
          "straight-line-triangle-approximation-on-pv-curve",
        ],
        assumptions: ["Reversible closed cycle of a monatomic ideal gas"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution: useOtto
        ? `For an ideal monatomic Otto cycle (γ = 5/3), η = 1 − (V_min / V_max)^(γ − 1) = 1 − (${fmtDatum(vLow)} / ${fmtDatum(vHigh)})^(2/3) = ${ans} (equivalently W_net / Q_in = ${formatThermalValue(sol.quantities.netWorkJ, 4)} / ${formatThermalValue(sol.quantities.heatInputJ, 4)} = ${ans}).`
        : `At B, P_B = P_A (V_A / V_B)^(5/3) = ${formatThermalValue(pB, 4)} Pa. Adiabatic work W_AB = (3/2)(P_A V_A − P_B V_B) = ${formatThermalValue(sol.quantities["leg:0:workJ"], 4)} J, and isobaric compression work W_BC = P_B(V_C − V_B) = ${formatThermalValue(sol.quantities["leg:1:workJ"], 4)} J (W_CA = 0). Thus W_net = W_AB + W_BC = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates the closed adiabatic heat-engine cycle to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (6 marks)
  const structStems = useOtto
    ? [
        `The P–V diagram shows an idealised Otto cycle A → B → C → D → A executed by ${fmtDatum(moles)} mol of monatomic ideal gas (γ = 5/3) inside ${apparatus}. State A is at (${fmtDatum(pA)} Pa, ${fmtDatum(vHigh)} m³). The gas is compressed adiabatically to V_B = ${fmtDatum(vLow)} m³ (state B), heated isochorically to P_C = ${fmtDatum(pPeak)} Pa (state C), expanded adiabatically to V_D = ${fmtDatum(vHigh)} m³ (state D), and cooled isochorically back to A. Take work done by the gas as positive.`,
        `Within ${apparatus}, ${fmtDatum(moles)} mol of monatomic working gas (adiabatic exponent γ = 5/3) traverses clockwise Otto loop A → B → C → D → A: insulated compression from ${fmtDatum(vHigh)} m³ at ${fmtDatum(pA)} Pa to ${fmtDatum(vLow)} m³, constant-volume heat addition to ${fmtDatum(pPeak)} Pa, insulated expansion back to ${fmtDatum(vHigh)} m³, and constant-volume heat rejection to state A (work done by the gas positive).`,
        `Engineers test ${fmtDatum(moles)} mol of ideal monatomic gas (γ = 5/3) in ${apparatus} over a four-stage Otto cycle starting at A (${fmtDatum(pA)} Pa, ${fmtDatum(vHigh)} m³), compressing adiabatically to B (${fmtDatum(vLow)} m³), heating at fixed volume to C (${fmtDatum(pPeak)} Pa), expanding adiabatically to D (${fmtDatum(vHigh)} m³), and returning isochorically to A. Define expansion work by the gas as positive.`,
      ]
    : [
        `Inside ${apparatus}, ${fmtDatum(moles)} mol of monatomic ideal gas (γ = 5/3) completes the three-step cycle A → B → C → A shown on the P–V diagram: reversible adiabatic expansion from A (${fmtDatum(pPeak)} Pa, ${fmtDatum(vLow)} m³) to V_B = ${fmtDatum(vHigh)} m³ at B, isobaric compression at P_B back to V_C = ${fmtDatum(vLow)} m³ at C, and isochoric heating from C back to A. Take work done by the gas as positive.`,
        `A closed three-leg heat-engine cycle A → B → C → A in ${apparatus} uses ${fmtDatum(moles)} mol of monatomic gas (γ = 5/3): starting from P_A = ${fmtDatum(pPeak)} Pa and V_A = ${fmtDatum(vLow)} m³, the gas expands adiabatically to ${fmtDatum(vHigh)} m³ (B), is compressed at constant pressure to ${fmtDatum(vLow)} m³ (C), and is heated at constant volume back to A (work by gas positive).`,
        `On the P–V diagram for ${apparatus}, ${fmtDatum(moles)} mol of ideal monatomic gas (adiabatic index 5/3) undergoes adiabatic expansion A → B from (${fmtDatum(pPeak)} Pa, ${fmtDatum(vLow)} m³) to ${fmtDatum(vHigh)} m³, followed by isobaric compression B → C to ${fmtDatum(vLow)} m³ and isochoric regeneration C → A. Adopt positive work for expansion by the gas.`,
      ];
  const stem = rng.pick(structStems);
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const pBAns = fmtWithUnit(sol.quantities["state:B:pressurePa"], "Pa", 3);
  const qInAns = fmtWithUnit(sol.quantities.heatInputJ, "J", 3);
  const wNetAns = fmtWithUnit(sol.quantities.netWorkJ, "J", 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: "Calculate the pressure P_B of the gas at state B.",
      marks: 2,
      targetQuantityKey: "state:B:pressurePa",
      expectedAnswer: pBAns,
      workingSteps: [
        useOtto
          ? `P_B = P_A (V_A / V_B)^(5/3) = ${fmtDatum(pA)} × (${fmtDatum(vHigh)} / ${fmtDatum(vLow)})^(5/3) = ${pBAns}.`
          : `P_B = P_A (V_A / V_B)^(5/3) = ${fmtDatum(pPeak)} × (${fmtDatum(vLow)} / ${fmtDatum(vHigh)})^(5/3) = ${pBAns}.`,
      ],
    },
    {
      partId: "b",
      prompt:
        "Calculate the thermal energy Q_in absorbed by the gas during the isochoric heating leg.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "heatInputJ",
      expectedAnswer: qInAns,
      workingSteps: [
        useOtto
          ? `On B → C (constant V = ${fmtDatum(vLow)} m³), Q_in = ΔU_BC = (3/2)(P_C − P_B) V_B = ${qInAns}.`
          : `On C → A (constant V = ${fmtDatum(vLow)} m³, P_C = P_B), Q_in = ΔU_CA = (3/2)(P_A − P_B) V_A = ${qInAns}.`,
      ],
    },
    {
      partId: "c",
      prompt: "Determine the net mechanical work W_net done by the gas per cycle.",
      marks: 2,
      dependsOnPartIds: ["a", "b"],
      targetQuantityKey: "netWorkJ",
      expectedAnswer: wNetAns,
      workingSteps: [
        useOtto
          ? `P_D = P_C (V_B / V_D)^(5/3); Q_out = (3/2)(P_D − P_A) V_A = ${formatThermalValue(sol.quantities.heatRejectedJ, 4)} J; W_net = Q_in − Q_out = ${wNetAns}.`
          : `Heat rejected on isobaric leg B → C is Q_out = (5/2) P_B (V_B − V_C) = ${formatThermalValue(sol.quantities.heatRejectedJ, 4)} J; W_net = Q_in − Q_out = ${wNetAns}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "thermodynamics-entropy-engines",
    templateArchetype: "closed-adiabatic-heat-engine-cycle",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Solve a closed adiabatic heat-engine cycle for intermediate pressure, isochoric heat input, and net cycle work",
      subpartStrategy: [
        "Adiabatic end-state pressure P_B",
        "Isochoric heat input using monatomic internal energy",
        "Net cycle work from first-law cycle balance",
      ],
      assumptions: ["Monatomic ideal gas undergoing a reversible closed engine cycle"],
    },
    stem,
    parts,
    workedSolution: `(a) Adiabatic relation gives P_B = ${pBAns}. (b) Isochoric heat input Q_in = ${qInAns}. (c) By cyclic energy conservation ΔU_cycle = 0, W_net = Q_in − Q_out = ${wNetAns}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Applies P V^(5/3) = const along A → B.", pBAns),
      ...buildTwoMarkPartScheme("b", "Uses Q_in = (3/2) ΔP V on the isochoric heating leg.", qInAns),
      ...buildTwoMarkPartScheme("c", "Evaluates W_net = Q_in − Q_out (or sums leg works).", wNetAns),
    ],
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* 11. specific-heat-latent-heat :: phase-change-heating-curve-energy         */
/* ========================================================================== */

function buildPhaseChangeHeatingCurveEnergy(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const context = PHASE_CURVE_CONTEXTS[variantIndex % PHASE_CURVE_CONTEXTS.length];
  const presetKeys = ["water", "ethanol", "lead", "aluminium"] as const;
  const presetKey = presetKeys[variantIndex % presetKeys.length];
  const preset = THERMAL_SUBSTANCE_PRESETS[presetKey];

  const massKg = rng.pick([0.15, 0.25, 0.35, 0.45, 0.65, 0.85, 1.25]);
  const spanBoiling =
    (presetKey === "water" || presetKey === "ethanol") && variantIndex % 3 === 2;

  const tInit = spanBoiling
    ? Math.round(preset.meltingPointK + 25)
    : Math.round(preset.meltingPointK - rng.pick([20, 30, 40, 50]));
  const tFinal = spanBoiling
    ? Math.round(preset.boilingPointK + rng.pick([20, 30, 45]))
    : Math.round(preset.meltingPointK + rng.pick([30, 45, 65, 85]));

  const spec: PhaseChangeScenarioSpec = {
    kind: "phase-change-curve",
    material: {
      name: preset.name,
      massKg,
      meltingPointK: preset.meltingPointK,
      boilingPointK: preset.boilingPointK,
      specificHeatSolidJPerKgK: preset.specificHeatSolidJPerKgK,
      specificHeatLiquidJPerKgK: preset.specificHeatLiquidJPerKgK,
      specificHeatGasJPerKgK: preset.specificHeatGasJPerKgK,
      latentHeatFusionJPerKg: preset.latentHeatFusionJPerKg,
      latentHeatVaporizationJPerKg: preset.latentHeatVaporizationJPerKg,
    },
    initialTemperatureK: tInit,
    finalTemperatureK: tFinal,
    xAxisMode: "energy",
    temperatureDisplayUnit: "K",
  };
  const sol = solvePhaseChangeCurve(spec);

  const hiddenQuantities = [
    "totalEnergyJ",
    "signedTotalHeatJ",
    "sensibleEnergyJ",
    "latentEnergyJ",
    "meltingEnergyJ",
    "boilingEnergyJ",
    "stage:0:energyJ",
    "stage:1:energyJ",
    "stage:2:energyJ",
  ];

  const c1 = spanBoiling ? preset.specificHeatLiquidJPerKgK : preset.specificHeatSolidJPerKgK;
  const c2 = spanBoiling ? preset.specificHeatGasJPerKgK : preset.specificHeatLiquidJPerKgK;
  const latentVal = spanBoiling
    ? preset.latentHeatVaporizationJPerKg
    : preset.latentHeatFusionJPerKg;
  const transTemp = spanBoiling ? preset.boilingPointK : preset.meltingPointK;
  const transName = spanBoiling ? "boiling point" : "melting point";
  const latentName = spanBoiling
    ? "specific latent heat of vaporization L_v"
    : "specific latent heat of fusion L_f";
  const phase1Name = spanBoiling ? "liquid" : "solid";
  const phase2Name = spanBoiling ? "vapour" : "liquid";

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "massKg", value: massKg, unit: "kg", source: "stem" },
    { name: "initialTemperatureK", value: tInit, unit: "K", source: "stem" },
    { name: "finalTemperatureK", value: tFinal, unit: "K", source: "stem" },
    { name: "transitionPointK", value: transTemp, unit: "K", source: "stem" },
    { name: "c1", value: c1, unit: "J kg⁻¹ K⁻¹", source: "stem" },
    { name: "c2", value: c2, unit: "J kg⁻¹ K⁻¹", source: "stem" },
    { name: "latentHeat", value: latentVal, unit: "J kg⁻¹", source: "stem" },
  ];

  if (format === "mcq") {
    const targetKey = "totalEnergyJ";
    const truth = sol.quantities.totalEnergyJ;

    const stems = [
      `Inside ${context}, a ${fmtDatum(massKg)} kg sample of ${preset.name.toLowerCase()} initially in the ${phase1Name} phase at ${fmtDatum(tInit)} K is heated until it reaches ${fmtDatum(tFinal)} K in the ${phase2Name} phase, following the temperature–energy curve shown. Given ${transName} = ${fmtDatum(transTemp)} K, c_${phase1Name} = ${fmtDatum(c1)} J kg⁻¹ K⁻¹, c_${phase2Name} = ${fmtDatum(c2)} J kg⁻¹ K⁻¹, and ${latentName} = ${fmtDatum(latentVal)} J kg⁻¹, what total thermal energy Q is absorbed by the sample?`,
      `The phase-change graph plots temperature against thermal energy transferred for ${fmtDatum(massKg)} kg of ${preset.name.toLowerCase()} in ${context} warmed from ${fmtDatum(tInit)} K to ${fmtDatum(tFinal)} K across its ${transName} at ${fmtDatum(transTemp)} K (c_${phase1Name} = ${fmtDatum(c1)} J kg⁻¹ K⁻¹, c_${phase2Name} = ${fmtDatum(c2)} J kg⁻¹ K⁻¹, ${latentName} = ${fmtDatum(latentVal)} J kg⁻¹). Calculate the total thermal energy required.`,
      `A ${fmtDatum(massKg)} kg specimen of pure ${preset.name.toLowerCase()} inside ${context} is heated from ${fmtDatum(tInit)} K (${phase1Name}) to ${fmtDatum(tFinal)} K (${phase2Name}). Take ${transName} = ${fmtDatum(transTemp)} K, c_${phase1Name} = ${fmtDatum(c1)} J kg⁻¹ K⁻¹, c_${phase2Name} = ${fmtDatum(c2)} J kg⁻¹ K⁻¹, and ${latentName} = ${fmtDatum(latentVal)} J kg⁻¹. Find the total heat transferred to the specimen.`,
      `Calorimetric heating carries ${fmtDatum(massKg)} kg of ${preset.name.toLowerCase()} in ${context} from an initial ${phase1Name} temperature of ${fmtDatum(tInit)} K up to ${fmtDatum(tFinal)} K as ${phase2Name}. Using ${fmtDatum(transTemp)} K for the ${transName}, specific heat capacities ${fmtDatum(c1)} J kg⁻¹ K⁻¹ (${phase1Name}) and ${fmtDatum(c2)} J kg⁻¹ K⁻¹ (${phase2Name}), and ${latentName} = ${fmtDatum(latentVal)} J kg⁻¹, determine the total enthalpy input.`,
      `Starting at ${fmtDatum(tInit)} K in ${context}, ${fmtDatum(massKg)} kg of ${preset.name.toLowerCase()} absorbs heat, crosses its ${fmtDatum(transTemp)} K ${transName} (${latentName} = ${fmtDatum(latentVal)} J kg⁻¹), and finishes as ${phase2Name} at ${fmtDatum(tFinal)} K. With c_${phase1Name} = ${fmtDatum(c1)} J kg⁻¹ K⁻¹ and c_${phase2Name} = ${fmtDatum(c2)} J kg⁻¹ K⁻¹, how much energy was supplied?`,
    ];
    const stem = rng.pick(stems);
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const distractors: DistractorCandidate[] = [
      {
        value: sol.quantities.sensibleEnergyJ,
        rationale:
          "Omits the isothermal latent-heat plateau m L during the phase transition and sums only the mcΔT stages.",
      },
      {
        value: sol.quantities.latentEnergyJ,
        rationale:
          "Computes only the phase-transition latent energy m L and omits both sensible heating intervals.",
      },
      {
        value: massKg * c2 * (tFinal - tInit) + sol.quantities.latentEnergyJ,
        rationale:
          `Applies c_${phase2Name} across the entire temperature span (${fmtDatum(tFinal)} − ${fmtDatum(tInit)}) K instead of using distinct specific heat capacities in each phase.`,
      },
      {
        value: massKg * c2 * (tFinal - tInit),
        rationale:
          `Treats the entire process as single-phase sensible heating m c_${phase2Name} ΔT with zero latent heat.`,
      },
    ];

    const mcq = assembleMcqOptions(truth, "J", distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, "J", 3);

    return {
      id,
      conceptId: "specific-heat-latent-heat",
      templateArchetype: "phase-change-heating-curve-energy",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Sum multi-stage sensible heating and isothermal latent heat across a phase transition",
        distractorStrategy: [
          "omitting-latent-heat-plateau",
          "single-specific-heat-across-both-phases",
          "latent-heat-only-without-sensible-terms",
        ],
        assumptions: ["Negligible thermal energy loss from the insulated sample holder"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution: `Sensible heating: Q_sens = ${fmtDatum(massKg)} × ${fmtDatum(c1)} × (${fmtDatum(transTemp)} − ${fmtDatum(tInit)}) + ${fmtDatum(massKg)} × ${fmtDatum(c2)} × (${fmtDatum(tFinal)} − ${fmtDatum(transTemp)}) = ${formatThermalValue(sol.quantities.sensibleEnergyJ, 4)} J. Latent heat on plateau: Q_lat = mL = ${fmtDatum(massKg)} × ${fmtDatum(latentVal)} = ${formatThermalValue(sol.quantities.latentEnergyJ, 4)} J. Total Q = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Sums sensible mcΔT stages and latent heat mL to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2
  const structStems = [
    `The heating curve shows how the temperature of a ${fmtDatum(massKg)} kg sample of pure ${preset.name.toLowerCase()} in ${context} varies with thermal energy supplied from ${fmtDatum(tInit)} K (${phase1Name}) to ${fmtDatum(tFinal)} K (${phase2Name}). Data for ${preset.name.toLowerCase()}: ${transName} = ${fmtDatum(transTemp)} K, c_${phase1Name} = ${fmtDatum(c1)} J kg⁻¹ K⁻¹, c_${phase2Name} = ${fmtDatum(c2)} J kg⁻¹ K⁻¹, and ${latentName} = ${fmtDatum(latentVal)} J kg⁻¹.`,
    `In ${context}, ${fmtDatum(massKg)} kg of ${preset.name.toLowerCase()} is heated continuously from ${fmtDatum(tInit)} K in the ${phase1Name} state to ${fmtDatum(tFinal)} K in the ${phase2Name} state across its ${transName} at ${fmtDatum(transTemp)} K. Use c_${phase1Name} = ${fmtDatum(c1)} J kg⁻¹ K⁻¹, c_${phase2Name} = ${fmtDatum(c2)} J kg⁻¹ K⁻¹, and ${latentName} = ${fmtDatum(latentVal)} J kg⁻¹.`,
    `A ${fmtDatum(massKg)} kg batch of ${preset.name.toLowerCase()} sealed inside ${context} absorbs thermal energy to rise from ${fmtDatum(tInit)} K (${phase1Name}) through its ${fmtDatum(transTemp)} K ${transName} to ${fmtDatum(tFinal)} K (${phase2Name}), with specific heats ${fmtDatum(c1)} J kg⁻¹ K⁻¹ and ${fmtDatum(c2)} J kg⁻¹ K⁻¹ and ${latentName} = ${fmtDatum(latentVal)} J kg⁻¹.`,
    `Thermal analysis of ${fmtDatum(massKg)} kg of ${preset.name.toLowerCase()} in ${context} records the three-segment temperature–energy profile from ${fmtDatum(tInit)} K to ${fmtDatum(tFinal)} K (${transName} ${fmtDatum(transTemp)} K; c_${phase1Name} = ${fmtDatum(c1)} J kg⁻¹ K⁻¹; c_${phase2Name} = ${fmtDatum(c2)} J kg⁻¹ K⁻¹; ${latentName} = ${fmtDatum(latentVal)} J kg⁻¹).`,
  ];
  const stem = rng.pick(structStems);
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const sensAns = fmtWithUnit(sol.quantities.sensibleEnergyJ, "J", 3);
  const latAns = fmtWithUnit(sol.quantities.latentEnergyJ, "J", 3);
  const totAns = fmtWithUnit(sol.quantities.totalEnergyJ, "J", 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: `Calculate the total sensible thermal energy absorbed while the temperature of the ${preset.name.toLowerCase()} is rising (excluding the horizontal plateau).`,
      marks: 2,
      targetQuantityKey: "sensibleEnergyJ",
      expectedAnswer: sensAns,
      workingSteps: [
        `Q_1 = ${fmtDatum(massKg)} × ${fmtDatum(c1)} × (${fmtDatum(transTemp)} − ${fmtDatum(tInit)}).`,
        `Q_2 = ${fmtDatum(massKg)} × ${fmtDatum(c2)} × (${fmtDatum(tFinal)} − ${fmtDatum(transTemp)}); Q_sens = Q_1 + Q_2 = ${sensAns}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Calculate the thermal energy absorbed during the isothermal phase change at ${fmtDatum(transTemp)} K.`,
      marks: 2,
      targetQuantityKey: "latentEnergyJ",
      expectedAnswer: latAns,
      workingSteps: [
        `Q_lat = m L = ${fmtDatum(massKg)} × ${fmtDatum(latentVal)} = ${latAns}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Determine the total thermal energy supplied to heat the sample from ${fmtDatum(tInit)} K to ${fmtDatum(tFinal)} K.`,
      marks: 2,
      dependsOnPartIds: ["a", "b"],
      targetQuantityKey: "totalEnergyJ",
      expectedAnswer: totAns,
      workingSteps: [
        `Q_total = Q_sens + Q_lat = ${formatThermalValue(sol.quantities.sensibleEnergyJ, 4)} + ${formatThermalValue(sol.quantities.latentEnergyJ, 4)} = ${totAns}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "phase-change-heating-curve-energy",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Decompose a multi-stage phase-change heating curve into sensible and latent energy contributions",
      subpartStrategy: [
        "Combined sensible thermal energy across sloped segments",
        "Isothermal latent heat absorbed along the plateau",
        "Total thermal energy transferred",
      ],
      assumptions: ["Uniform sample temperature and negligible external heat loss"],
    },
    stem,
    parts,
    workedSolution: `(a) Q_sens = m c_${phase1Name} ΔT₁ + m c_${phase2Name} ΔT₂ = ${sensAns}. (b) Plateau latent energy Q_lat = m L = ${latAns}. (c) Total thermal energy Q_total = Q_sens + Q_lat = ${totAns}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Evaluates m c₁ ΔT₁ + m c₂ ΔT₂.", sensAns),
      ...buildTwoMarkPartScheme("b", "Evaluates m L on the phase-change plateau.", latAns),
      ...buildTwoMarkPartScheme("c", "Sums sensible and latent energies.", totAns),
    ],
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* 12. specific-heat-latent-heat :: electrical-heater-phase-change-power-time */
/* ========================================================================== */

function buildElectricalHeaterPhaseChangeTime(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const context = PHASE_CURVE_CONTEXTS[(variantIndex + 3) % PHASE_CURVE_CONTEXTS.length];
  const presetKeys = ["water", "ethanol", "lead", "aluminium"] as const;
  const preset = THERMAL_SUBSTANCE_PRESETS[presetKeys[(variantIndex + 1) % presetKeys.length]];

  const massKg = rng.pick([0.2, 0.3, 0.4, 0.55, 0.75, 1.1]);
  const heaterPowerW = rng.pick([320, 450, 600, 750, 900, 1200, 1600]);
  const heaterEfficiency = rng.pick([0.75, 0.8, 0.85, 0.9]);
  const isCooling = variantIndex % 4 === 3;

  const tLow = Math.round(preset.meltingPointK - rng.pick([18, 28, 38]));
  const tHigh = Math.round(preset.meltingPointK + rng.pick([25, 40, 60]));

  const spec: PhaseChangeScenarioSpec = {
    kind: "phase-change-curve",
    material: {
      name: preset.name,
      massKg,
      meltingPointK: preset.meltingPointK,
      boilingPointK: preset.boilingPointK,
      specificHeatSolidJPerKgK: preset.specificHeatSolidJPerKgK,
      specificHeatLiquidJPerKgK: preset.specificHeatLiquidJPerKgK,
      latentHeatFusionJPerKg: preset.latentHeatFusionJPerKg,
    },
    initialTemperatureK: isCooling ? tHigh : tLow,
    finalTemperatureK: isCooling ? tLow : tHigh,
    heaterPowerW,
    heaterEfficiency,
    xAxisMode: "time",
    temperatureDisplayUnit: "K",
  };
  const sol = solvePhaseChangeCurve(spec);

  const hiddenQuantities = [
    "effectivePowerW",
    "totalEnergyJ",
    "signedTotalHeatJ",
    "sensibleEnergyJ",
    "latentEnergyJ",
    "meltingEnergyJ",
    "totalDurationS",
    "meltingDurationS",
    "stage:0:energyJ",
    "stage:1:energyJ",
    "stage:2:energyJ",
    "stage:0:durationS",
    "stage:1:durationS",
    "stage:2:durationS",
  ];

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "massKg", value: massKg, unit: "kg", source: "stem" },
    { name: "heaterPowerW", value: heaterPowerW, unit: "W", source: "stem" },
    { name: "heaterEfficiency", value: heaterEfficiency, source: "stem" },
    { name: "tLow", value: tLow, unit: "K", source: "stem" },
    { name: "tHigh", value: tHigh, unit: "K", source: "stem" },
    { name: "meltingPointK", value: preset.meltingPointK, unit: "K", source: "stem" },
    { name: "cSolid", value: preset.specificHeatSolidJPerKgK, unit: "J kg⁻¹ K⁻¹", source: "stem" },
    { name: "cLiquid", value: preset.specificHeatLiquidJPerKgK, unit: "J kg⁻¹ K⁻¹", source: "stem" },
    { name: "latentFusion", value: preset.latentHeatFusionJPerKg, unit: "J kg⁻¹", source: "stem" },
  ];

  const powerDesc = isCooling
    ? `a Peltier extraction module rated at ${fmtDatum(heaterPowerW)} W with coupling efficiency ${fmtDatum(heaterEfficiency)} removes thermal energy`
    : `an electrical immersion heater of input power ${fmtDatum(heaterPowerW)} W and thermal transfer efficiency ${fmtDatum(heaterEfficiency)} supplies energy`;

  if (format === "mcq") {
    const askPlateauOnly = variantIndex % 2 === 1;
    const targetKey = askPlateauOnly ? "meltingDurationS" : "totalDurationS";
    const truth = sol.quantities[targetKey];

    const stems = [
      `In ${context}, ${powerDesc} as a ${fmtDatum(massKg)} kg sample of ${preset.name.toLowerCase()} goes from ${fmtDatum(spec.initialTemperatureK)} K to ${fmtDatum(spec.finalTemperatureK)} K across its ${fmtDatum(preset.meltingPointK)} K fusion point (c_solid = ${fmtDatum(preset.specificHeatSolidJPerKgK)} J kg⁻¹ K⁻¹, c_liquid = ${fmtDatum(preset.specificHeatLiquidJPerKgK)} J kg⁻¹ K⁻¹, L_f = ${fmtDatum(preset.latentHeatFusionJPerKg)} J kg⁻¹). ${askPlateauOnly ? `How long does the isothermal ${isCooling ? "freezing" : "melting"} plateau last?` : "What total time elapses for the complete temperature change?"}`,
      `The temperature–time curve shows ${fmtDatum(massKg)} kg of ${preset.name.toLowerCase()} inside ${context} (${isCooling ? "cooled" : "heated"} between ${fmtDatum(spec.initialTemperatureK)} K and ${fmtDatum(spec.finalTemperatureK)} K; T_m = ${fmtDatum(preset.meltingPointK)} K, c_solid = ${fmtDatum(preset.specificHeatSolidJPerKgK)} J kg⁻¹ K⁻¹, c_liquid = ${fmtDatum(preset.specificHeatLiquidJPerKgK)} J kg⁻¹ K⁻¹, L_f = ${fmtDatum(preset.latentHeatFusionJPerKg)} J kg⁻¹) while ${powerDesc}. Calculate ${askPlateauOnly ? "the duration Δt of the horizontal phase-change plateau." : "the total duration of the process."}`,
      `A ${fmtDatum(massKg)} kg charge of ${preset.name.toLowerCase()} starts at ${fmtDatum(spec.initialTemperatureK)} K and finishes at ${fmtDatum(spec.finalTemperatureK)} K inside ${context} while ${powerDesc}. Using fusion temperature ${fmtDatum(preset.meltingPointK)} K, specific heats ${fmtDatum(preset.specificHeatSolidJPerKgK)} J kg⁻¹ K⁻¹ (solid) and ${fmtDatum(preset.specificHeatLiquidJPerKgK)} J kg⁻¹ K⁻¹ (liquid), and latent heat ${fmtDatum(preset.latentHeatFusionJPerKg)} J kg⁻¹, find ${askPlateauOnly ? "the time spent on the phase-transition plateau." : "the overall elapsed time."}`,
      `During a timed run in ${context}, ${powerDesc} on ${fmtDatum(massKg)} kg of ${preset.name.toLowerCase()} between ${fmtDatum(spec.initialTemperatureK)} K and ${fmtDatum(spec.finalTemperatureK)} K. Given melting point ${fmtDatum(preset.meltingPointK)} K, L_f = ${fmtDatum(preset.latentHeatFusionJPerKg)} J kg⁻¹, c_s = ${fmtDatum(preset.specificHeatSolidJPerKgK)} J kg⁻¹ K⁻¹, and c_l = ${fmtDatum(preset.specificHeatLiquidJPerKgK)} J kg⁻¹ K⁻¹, determine ${askPlateauOnly ? "the constant-temperature arrest time." : "the total run time."}`,
    ];
    const stem = rng.pick(stems);
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const targetEnergy = askPlateauOnly
      ? sol.quantities.meltingEnergyJ
      : sol.quantities.totalEnergyJ;
    const distractors: DistractorCandidate[] = [
      {
        value: targetEnergy / heaterPowerW,
        rationale:
          "Divides thermal energy by the nominal electrical rating P rather than the effective thermal power η P.",
      },
      {
        value: (targetEnergy * heaterEfficiency) / heaterPowerW,
        rationale:
          "Multiplies time by efficiency η instead of dividing energy by effective power η P.",
      },
      ...(askPlateauOnly
        ? [
            {
              value: sol.quantities.totalDurationS,
              rationale:
                "Calculates the total multi-stage duration rather than the isothermal fusion plateau duration alone.",
            },
          ]
        : [
            {
              value:
                sol.quantities.sensibleEnergyJ / sol.quantities.effectivePowerW,
              rationale:
                "Omits the latent-heat plateau duration m L_f / (η P) and includes only sensible temperature-change intervals.",
            },
          ]),
    ];

    const mcq = assembleMcqOptions(truth, "s", distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, "s", 3);

    return {
      id,
      conceptId: "specific-heat-latent-heat",
      templateArchetype: "electrical-heater-phase-change-power-time",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Relate electrical heater power, efficiency, and phase-change calorimetry to stage and total durations",
        distractorStrategy: [
          "ignoring-heater-efficiency-factor",
          "multiplying-instead-of-dividing-by-efficiency",
          "omitting-latent-plateau-duration",
        ],
        assumptions: ["Constant electrical input power and constant thermal coupling efficiency"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution: `Effective thermal power P_eff = η P = ${fmtDatum(heaterEfficiency)} × ${fmtDatum(heaterPowerW)} = ${formatThermalValue(sol.quantities.effectivePowerW, 4)} W. ${askPlateauOnly ? `Plateau latent energy Q_f = m L_f = ${formatThermalValue(sol.quantities.meltingEnergyJ, 4)} J, giving Δt_plateau = Q_f / P_eff = ${ans}.` : `Total energy Q_tot = m c_solid ΔT_s + m L_f + m c_liquid ΔT_l = ${formatThermalValue(sol.quantities.totalEnergyJ, 4)} J, giving t_total = Q_tot / P_eff = ${ans}.`}`,
      markScheme: [
        {
          code: "A1",
          criterion: `Uses P_eff = η P and divides required thermal energy to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2
  const structStems = [
    `Inside ${context}, ${powerDesc} while a ${fmtDatum(massKg)} kg sample of ${preset.name.toLowerCase()} transitions from ${fmtDatum(spec.initialTemperatureK)} K to ${fmtDatum(spec.finalTemperatureK)} K as plotted on the temperature–time graph. Use melting point T_m = ${fmtDatum(preset.meltingPointK)} K, c_solid = ${fmtDatum(preset.specificHeatSolidJPerKgK)} J kg⁻¹ K⁻¹, c_liquid = ${fmtDatum(preset.specificHeatLiquidJPerKgK)} J kg⁻¹ K⁻¹, and L_f = ${fmtDatum(preset.latentHeatFusionJPerKg)} J kg⁻¹.`,
    `A ${fmtDatum(massKg)} kg specimen of pure ${preset.name.toLowerCase()} in ${context} is driven from ${fmtDatum(spec.initialTemperatureK)} K to ${fmtDatum(spec.finalTemperatureK)} K as ${powerDesc}. Material constants: fusion point ${fmtDatum(preset.meltingPointK)} K, specific heats ${fmtDatum(preset.specificHeatSolidJPerKgK)} J kg⁻¹ K⁻¹ (solid) and ${fmtDatum(preset.specificHeatLiquidJPerKgK)} J kg⁻¹ K⁻¹ (liquid), and specific latent heat of fusion ${fmtDatum(preset.latentHeatFusionJPerKg)} J kg⁻¹.`,
    `The recorded temperature–time trace tracks ${fmtDatum(massKg)} kg of ${preset.name.toLowerCase()} inside ${context} between ${fmtDatum(spec.initialTemperatureK)} K and ${fmtDatum(spec.finalTemperatureK)} K while ${powerDesc} (T_m = ${fmtDatum(preset.meltingPointK)} K, L_f = ${fmtDatum(preset.latentHeatFusionJPerKg)} J kg⁻¹, c_s = ${fmtDatum(preset.specificHeatSolidJPerKgK)} J kg⁻¹ K⁻¹, c_l = ${fmtDatum(preset.specificHeatLiquidJPerKgK)} J kg⁻¹ K⁻¹).`,
    `In an enthalpy-rate experiment using ${context}, ${powerDesc} on a ${fmtDatum(massKg)} kg sample of ${preset.name.toLowerCase()}, changing its temperature from ${fmtDatum(spec.initialTemperatureK)} K to ${fmtDatum(spec.finalTemperatureK)} K across its ${fmtDatum(preset.meltingPointK)} K phase boundary. Adopt c_solid = ${fmtDatum(preset.specificHeatSolidJPerKgK)} J kg⁻¹ K⁻¹, c_liquid = ${fmtDatum(preset.specificHeatLiquidJPerKgK)} J kg⁻¹ K⁻¹, and L_f = ${fmtDatum(preset.latentHeatFusionJPerKg)} J kg⁻¹.`,
  ];
  const stem = rng.pick(structStems);
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const pEffAns = fmtWithUnit(sol.quantities.effectivePowerW, "W", 3);
  const tPlatAns = fmtWithUnit(sol.quantities.meltingDurationS, "s", 3);
  const tTotAns = fmtWithUnit(sol.quantities.totalDurationS, "s", 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: `Calculate the effective rate of thermal energy transfer P_eff to/from the ${preset.name.toLowerCase()} sample.`,
      marks: 2,
      targetQuantityKey: "effectivePowerW",
      expectedAnswer: pEffAns,
      workingSteps: [
        `P_eff = η P = ${fmtDatum(heaterEfficiency)} × ${fmtDatum(heaterPowerW)} = ${pEffAns}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Calculate the duration of the isothermal ${isCooling ? "solidification" : "melting"} plateau at ${fmtDatum(preset.meltingPointK)} K.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "meltingDurationS",
      expectedAnswer: tPlatAns,
      workingSteps: [
        `Q_f = m L_f = ${fmtDatum(massKg)} × ${fmtDatum(preset.latentHeatFusionJPerKg)} = ${formatThermalValue(sol.quantities.meltingEnergyJ, 4)} J.`,
        `Δt_f = Q_f / P_eff = ${tPlatAns}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Determine the total time required for the temperature to change from ${fmtDatum(spec.initialTemperatureK)} K to ${fmtDatum(spec.finalTemperatureK)} K.`,
      marks: 2,
      dependsOnPartIds: ["a", "b"],
      targetQuantityKey: "totalDurationS",
      expectedAnswer: tTotAns,
      workingSteps: [
        `Q_total = m c_solid (${fmtDatum(preset.meltingPointK)} − ${fmtDatum(tLow)}) + m L_f + m c_liquid (${fmtDatum(tHigh)} − ${fmtDatum(preset.meltingPointK)}) = ${formatThermalValue(sol.quantities.totalEnergyJ, 4)} J.`,
        `t_total = Q_total / P_eff = ${tTotAns}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "electrical-heater-phase-change-power-time",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Calculate effective thermal power, isothermal plateau duration, and total heating/cooling time",
      subpartStrategy: [
        "Effective thermal transfer power from electrical rating and efficiency",
        "Fusion plateau duration from latent heat and effective power",
        "Total multi-stage duration across solid, phase change, and liquid",
      ],
      assumptions: ["Steady effective thermal power throughout all stages"],
    },
    stem,
    parts,
    workedSolution: `(a) P_eff = η P = ${pEffAns}. (b) Δt_f = m L_f / P_eff = ${tPlatAns}. (c) Total energy Q_total = ${formatThermalValue(sol.quantities.totalEnergyJ, 4)} J, giving t_total = Q_total / P_eff = ${tTotAns}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Multiplies heater power P by efficiency η.", pEffAns),
      ...buildTwoMarkPartScheme("b", "Divides m L_f by P_eff.", tPlatAns),
      ...buildTwoMarkPartScheme("c", "Computes Q_total and divides by P_eff.", tTotAns),
    ],
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* 13. specific-heat-latent-heat :: calorimetry-solid-liquid-equilibrium      */
/* ========================================================================== */

function buildCalorimetrySolidLiquidEquilibrium(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const calContext =
    CALORIMETRY_MIXING_CONTEXTS[variantIndex % CALORIMETRY_MIXING_CONTEXTS.length];
  const solid =
    SOLID_CALORIMETRY_PRESETS[variantIndex % SOLID_CALORIMETRY_PRESETS.length];
  const liquidChoices = [
    { name: "water", label: "Water bath", c: 4180 },
    { name: "ethanol", label: "Ethanol bath", c: 2440 },
    { name: "mineral oil", label: "Mineral oil bath", c: 1960 },
  ] as const;
  const liquid = liquidChoices[variantIndex % liquidChoices.length];

  const mSolid = rng.pick([0.18, 0.28, 0.36, 0.48, 0.65, 0.85]);
  const mLiquid = rng.pick([0.22, 0.32, 0.42, 0.55, 0.72]);
  const tSolid = rng.pick([380, 410, 440, 475, 510]);
  const tLiquid = rng.pick([285, 290, 294, 298, 302]);

  const withHeatLoss = difficulty === "higher" || variantIndex % 3 === 2;
  const heatLossJ = withHeatLoss ? rng.pick([650, 950, 1250, 1600]) : 0;
  const diagramVariant =
    variantIndex % 2 === 0 ? "calorimeter-schematic" : "convergence-graph";

  // For structured when heatLossJ === 0, include a 3rd component (calorimeter vessel) so all 3 subparts have distinct ground-truth numbers!
  const includeCup = format === "structured" && !withHeatLoss;
  const cupMass = 0.16;
  const cupC = 385;

  const spec: CalorimetryMixingScenarioSpec = {
    kind: "calorimetry-mixing",
    components: [
      {
        id: "solid",
        label: `${solid.label} specimen`,
        massKg: mSolid,
        initialTemperatureK: tSolid,
        specificHeatJPerKgK: solid.specificHeatJPerKgK,
      },
      {
        id: "liquid",
        label: liquid.label,
        massKg: mLiquid,
        initialTemperatureK: tLiquid,
        specificHeatJPerKgK: liquid.c,
      },
      ...(includeCup
        ? [
            {
              id: "cup",
              label: "Copper vessel",
              massKg: cupMass,
              initialTemperatureK: tLiquid,
              specificHeatJPerKgK: cupC,
            },
          ]
        : []),
    ],
    ...(withHeatLoss ? { heatLossToSurroundingsJ: heatLossJ } : {}),
    temperatureDisplayUnit: "K",
    diagramVariant,
  };
  const sol = solveCalorimetryMixing(spec);

  const hiddenQuantities = [
    "equilibriumTemperatureK",
    "equilibriumTemperatureC",
    "heatLostByHotJ",
    "heatGainedByColdJ",
    "component:0:signedHeatJ",
    "component:1:signedHeatJ",
    "component:solid:signedHeatJ",
    "component:liquid:signedHeatJ",
    ...(includeCup ? ["component:2:signedHeatJ", "component:cup:signedHeatJ"] : []),
  ];

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "mSolid", value: mSolid, unit: "kg", source: "stem" },
    { name: "tSolid", value: tSolid, unit: "K", source: "stem" },
    { name: "cSolid", value: solid.specificHeatJPerKgK, unit: "J kg⁻¹ K⁻¹", source: "stem" },
    { name: "mLiquid", value: mLiquid, unit: "kg", source: "stem" },
    { name: "tLiquid", value: tLiquid, unit: "K", source: "stem" },
    { name: "cLiquid", value: liquid.c, unit: "J kg⁻¹ K⁻¹", source: "stem" },
    ...(withHeatLoss
      ? [{ name: "heatLossJ", value: heatLossJ, unit: "J", source: "stem" as const }]
      : []),
    ...(includeCup
      ? [
          { name: "cupMass", value: cupMass, unit: "kg", source: "stem" as const },
          { name: "cupC", value: cupC, unit: "J kg⁻¹ K⁻¹", source: "stem" as const },
        ]
      : []),
  ];

  if (format === "mcq") {
    const askHeatLost = variantIndex % 4 === 3;
    const targetKey = askHeatLost ? "heatLostByHotJ" : "equilibriumTemperatureK";
    const targetUnit = askHeatLost ? "J" : "K";
    const truth = sol.quantities[targetKey];

    const lossClause = withHeatLoss
      ? `During mixing, ${fmtDatum(heatLossJ)} J of thermal energy escapes to the surroundings.`
      : "Thermal energy exchange with the surroundings and container is negligible.";

    const stems = [
      `A heated ${solid.label.toLowerCase()} block of mass ${fmtDatum(mSolid)} kg and specific heat capacity ${fmtDatum(solid.specificHeatJPerKgK)} J kg⁻¹ K⁻¹ at ${fmtDatum(tSolid)} K is plunged into ${fmtDatum(mLiquid)} kg of ${liquid.name} (c = ${fmtDatum(liquid.c)} J kg⁻¹ K⁻¹) initially at ${fmtDatum(tLiquid)} K inside ${calContext}. ${lossClause} ${askHeatLost ? `How much thermal energy is released by the ${solid.label.toLowerCase()} block in reaching equilibrium?` : "What is the final thermal equilibrium temperature T_eq?"}`,
      `Inside ${calContext}, ${fmtDatum(mLiquid)} kg of ${liquid.name} (specific heat capacity ${fmtDatum(liquid.c)} J kg⁻¹ K⁻¹) at ${fmtDatum(tLiquid)} K receives a ${fmtDatum(mSolid)} kg ${solid.label.toLowerCase()} specimen (c = ${fmtDatum(solid.specificHeatJPerKgK)} J kg⁻¹ K⁻¹) initially at ${fmtDatum(tSolid)} K. ${lossClause} ${askHeatLost ? "Determine the magnitude of thermal energy lost by the hot specimen." : "Calculate the equilibrium temperature of the mixture."}`,
      `In a calorimetry run using ${calContext}, a ${fmtDatum(mSolid)} kg cylinder of ${solid.label.toLowerCase()} (c = ${fmtDatum(solid.specificHeatJPerKgK)} J kg⁻¹ K⁻¹) at ${fmtDatum(tSolid)} K is quenched in ${fmtDatum(mLiquid)} kg of ${liquid.name} (c = ${fmtDatum(liquid.c)} J kg⁻¹ K⁻¹) at ${fmtDatum(tLiquid)} K. ${lossClause} ${askHeatLost ? "What thermal energy does the cylinder give up?" : "Find T_eq at thermal equilibrium."}`,
    ];
    const stem = stems[variantIndex % stems.length];
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const cTot = mSolid * solid.specificHeatJPerKgK + mLiquid * liquid.c;
    const distractors: DistractorCandidate[] = askHeatLost
      ? [
          {
            value:
              mSolid * solid.specificHeatJPerKgK * (tSolid - 0.5 * (tSolid + tLiquid)),
            rationale:
              "Assumes the final equilibrium temperature is the unweighted midpoint (T_solid + T_liquid) / 2.",
          },
          {
            value: mSolid * solid.specificHeatJPerKgK * (tSolid - tLiquid),
            rationale:
              "Assumes the solid cools all the way down to the initial bath temperature T_liquid instead of T_eq.",
          },
          ...(withHeatLoss
            ? [
                {
                  value: sol.quantities.heatGainedByColdJ,
                  rationale:
                    "Computes only the heat gained by the liquid bath without adding the heat lost to the surroundings.",
                },
              ]
            : [
                {
                  value:
                    mSolid *
                    solid.specificHeatJPerKgK *
                    (tSolid - (mSolid * tSolid + mLiquid * tLiquid) / (mSolid + mLiquid)),
                  rationale:
                    "Uses a mass-only weighted average temperature, ignoring the difference in specific heat capacities.",
                },
              ]),
        ]
      : [
          {
            value: 0.5 * (tSolid + tLiquid),
            rationale:
              "Takes the unweighted arithmetic mean of the two initial temperatures, ignoring both masses and specific heat capacities.",
          },
          {
            value: (mSolid * tSolid + mLiquid * tLiquid) / (mSolid + mLiquid),
            rationale:
              "Weights initial temperatures by mass alone and ignores the much larger specific heat capacity of the liquid.",
          },
          ...(withHeatLoss
            ? [
                {
                  value:
                    (mSolid * solid.specificHeatJPerKgK * tSolid +
                      mLiquid * liquid.c * tLiquid +
                      heatLossJ) /
                    cTot,
                  rationale:
                    "Adds heatLossToSurroundingsJ to the system enthalpy instead of subtracting it.",
                },
              ]
            : [
                {
                  value:
                    (mSolid * liquid.c * tSolid +
                      mLiquid * solid.specificHeatJPerKgK * tLiquid) /
                    (mSolid * liquid.c + mLiquid * solid.specificHeatJPerKgK),
                  rationale:
                    "Swaps the specific heat capacities of the solid specimen and the liquid bath.",
                },
              ]),
        ];

    const mcq = assembleMcqOptions(truth, targetUnit, distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, targetUnit, 3);

    return {
      id,
      conceptId: "specific-heat-latent-heat",
      templateArchetype: "calorimetry-solid-liquid-equilibrium",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Apply conservation of energy to determine calorimetry equilibrium temperature or heat transferred",
        distractorStrategy: [
          "unweighted-midpoint-temperature",
          "mass-weighted-ignoring-specific-heat",
          "surroundings-heat-loss-sign-reversal",
        ],
        assumptions: ["No phase change occurs within the operating temperature interval"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution: `Enthalpy balance: m_s c_s (T_s − T_eq) = m_l c_l (T_eq − T_l)${withHeatLoss ? ` + ${fmtDatum(heatLossJ)}` : ""}, giving T_eq = ${formatThermalValue(sol.quantities.equilibriumTemperatureK, 4)} K. ${askHeatLost ? `Heat released by the solid Q_lost = m_s c_s (T_s − T_eq) = ${ans}.` : `Therefore T_eq = ${ans}.`}`,
      markScheme: [
        {
          code: "A1",
          criterion: `Applies calorimetry energy balance to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2
  const structStems = withHeatLoss
    ? [
        `A ${fmtDatum(mSolid)} kg ${solid.label.toLowerCase()} specimen (c = ${fmtDatum(solid.specificHeatJPerKgK)} J kg⁻¹ K⁻¹) heated to ${fmtDatum(tSolid)} K is immersed in ${fmtDatum(mLiquid)} kg of ${liquid.name} (c = ${fmtDatum(liquid.c)} J kg⁻¹ K⁻¹) initially at ${fmtDatum(tLiquid)} K inside ${calContext}. While reaching thermal equilibrium, ${fmtDatum(heatLossJ)} J of thermal energy is lost to the surroundings.`,
        `Inside ${calContext}, ${fmtDatum(mLiquid)} kg of ${liquid.name} (specific heat ${fmtDatum(liquid.c)} J kg⁻¹ K⁻¹) at ${fmtDatum(tLiquid)} K quenches a ${fmtDatum(mSolid)} kg piece of ${solid.label.toLowerCase()} (${fmtDatum(solid.specificHeatJPerKgK)} J kg⁻¹ K⁻¹) initially at ${fmtDatum(tSolid)} K; ${fmtDatum(heatLossJ)} J leaks to the ambient air before equilibrium is reached.`,
        `During a non-ideal calorimetry run in ${calContext}, ${fmtDatum(heatLossJ)} J escapes to the room when a ${fmtDatum(mSolid)} kg ${solid.label.toLowerCase()} cylinder at ${fmtDatum(tSolid)} K (c_s = ${fmtDatum(solid.specificHeatJPerKgK)} J kg⁻¹ K⁻¹) is submerged into ${fmtDatum(mLiquid)} kg of ${liquid.name} at ${fmtDatum(tLiquid)} K (c_l = ${fmtDatum(liquid.c)} J kg⁻¹ K⁻¹).`,
      ]
    : [
        `Inside ${calContext}, a copper calorimeter vessel of mass ${fmtDatum(cupMass)} kg (c_cup = ${fmtDatum(cupC)} J kg⁻¹ K⁻¹) holds ${fmtDatum(mLiquid)} kg of ${liquid.name} (c_liq = ${fmtDatum(liquid.c)} J kg⁻¹ K⁻¹), both initially at ${fmtDatum(tLiquid)} K. A ${fmtDatum(mSolid)} kg ${solid.label.toLowerCase()} block (c_s = ${fmtDatum(solid.specificHeatJPerKgK)} J kg⁻¹ K⁻¹) at ${fmtDatum(tSolid)} K is lowered into the bath; heat loss to the outside air is negligible.`,
        `A ${fmtDatum(cupMass)} kg copper cup (specific heat ${fmtDatum(cupC)} J kg⁻¹ K⁻¹) inside ${calContext} contains ${fmtDatum(mLiquid)} kg of ${liquid.name} (${fmtDatum(liquid.c)} J kg⁻¹ K⁻¹) equilibrated at ${fmtDatum(tLiquid)} K. Engineers transfer a ${fmtDatum(mSolid)} kg ${solid.label.toLowerCase()} sample (${fmtDatum(solid.specificHeatJPerKgK)} J kg⁻¹ K⁻¹) at ${fmtDatum(tSolid)} K into the liquid with zero external heat loss.`,
        `With negligible heat loss to the surroundings, ${fmtDatum(mSolid)} kg of hot ${solid.label.toLowerCase()} at ${fmtDatum(tSolid)} K (c = ${fmtDatum(solid.specificHeatJPerKgK)} J kg⁻¹ K⁻¹) is placed into ${fmtDatum(mLiquid)} kg of ${liquid.name} (c = ${fmtDatum(liquid.c)} J kg⁻¹ K⁻¹) held in a ${fmtDatum(cupMass)} kg copper liner (c = ${fmtDatum(cupC)} J kg⁻¹ K⁻¹) at ${fmtDatum(tLiquid)} K within ${calContext}.`,
      ];
  const stem = rng.pick(structStems);

  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const tEqAns = fmtWithUnit(sol.quantities.equilibriumTemperatureK, "K", 3);
  const qHotAns = fmtWithUnit(sol.quantities.heatLostByHotJ, "J", 3);
  const partCKey = withHeatLoss ? "heatGainedByColdJ" : "component:liquid:signedHeatJ";
  const qLiqAns = fmtWithUnit(sol.quantities[partCKey], "J", 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: "Calculate the final thermal equilibrium temperature T_eq of the system.",
      marks: 2,
      targetQuantityKey: "equilibriumTemperatureK",
      expectedAnswer: tEqAns,
      workingSteps: [
        withHeatLoss
          ? `m_s c_s (${fmtDatum(tSolid)} − T_eq) = m_l c_l (T_eq − ${fmtDatum(tLiquid)}) + ${fmtDatum(heatLossJ)}.`
          : `m_s c_s (${fmtDatum(tSolid)} − T_eq) = (m_l c_liq + m_cup c_cup)(T_eq − ${fmtDatum(tLiquid)}).`,
        `Solving for T_eq gives ${tEqAns}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Calculate the thermal energy released by the ${solid.label.toLowerCase()} block.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "heatLostByHotJ",
      expectedAnswer: qHotAns,
      workingSteps: [
        `Q_lost = m_s c_s (${fmtDatum(tSolid)} − T_eq) = ${qHotAns}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Determine the thermal energy absorbed specifically by the ${liquid.name}.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: partCKey,
      expectedAnswer: qLiqAns,
      workingSteps: [
        `Q_liq = m_l c_liq (T_eq − ${fmtDatum(tLiquid)}) = ${qLiqAns}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "calorimetry-solid-liquid-equilibrium",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Determine equilibrium temperature and component-by-component heat transfers in a calorimeter",
      subpartStrategy: [
        "Final equilibrium temperature from system energy balance",
        "Total thermal energy released by the hot solid",
        "Thermal energy absorbed by the liquid bath",
      ],
      assumptions: ["Complete thermal equilibrium reached across immersed components"],
    },
    stem,
    parts,
    workedSolution: `(a) Solving the enthalpy balance yields T_eq = ${tEqAns}. (b) Heat released by the hot solid Q_lost = m_s c_s (T_s − T_eq) = ${qHotAns}. (c) Heat gained by the ${liquid.name} Q_liq = m_l c_liq (T_eq − T_l) = ${qLiqAns}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Sets up full calorimetry heat-balance equation.", tEqAns),
      ...buildTwoMarkPartScheme("b", "Evaluates m_s c_s (T_s − T_eq).", qHotAns),
      ...buildTwoMarkPartScheme("c", "Evaluates m_l c_liq (T_eq − T_l).", qLiqAns),
    ],
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* 14. specific-heat-latent-heat :: ice-water-latent-mixing-and-coexistence   */
/* ========================================================================== */

function buildIceWaterLatentMixing(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const calContext =
    CALORIMETRY_MIXING_CONTEXTS[(variantIndex + 4) % CALORIMETRY_MIXING_CONTEXTS.length];
  const water = THERMAL_SUBSTANCE_PRESETS.water;
  const diagramVariant =
    variantIndex % 2 === 1 ? "calorimeter-schematic" : "convergence-graph";

  const isCoexistence = variantIndex % 2 === 1;

  if (!isCoexistence) {
    // All sub-zero ice melts completely and warms to T_eq > 273.15 K
    const mIce = rng.pick([0.025, 0.035, 0.045, 0.055, 0.065]);
    const mWater = rng.pick([0.38, 0.48, 0.58, 0.68, 0.8]);
    const tIce = rng.pick([253.15, 258.15, 263.15, 268.15]);
    const tWater = rng.pick([318.15, 328.15, 338.15, 348.15]);

    const spec: CalorimetryMixingScenarioSpec = {
      kind: "calorimetry-mixing",
      components: [
        {
          id: "ice",
          label: "Sub-zero ice",
          massKg: mIce,
          initialTemperatureK: tIce,
          initialPhase: "solid",
          meltingPointK: water.meltingPointK,
          specificHeatSolidJPerKgK: water.specificHeatSolidJPerKgK,
          specificHeatLiquidJPerKgK: water.specificHeatLiquidJPerKgK,
          latentHeatFusionJPerKg: water.latentHeatFusionJPerKg,
        },
        {
          id: "water",
          label: "Warm water",
          massKg: mWater,
          initialTemperatureK: tWater,
          specificHeatJPerKgK: water.specificHeatLiquidJPerKgK,
        },
      ],
      temperatureDisplayUnit: "K",
      diagramVariant,
    };
    const sol = solveCalorimetryMixing(spec);

    const hiddenQuantities = [
      "equilibriumTemperatureK",
      "equilibriumTemperatureC",
      "heatLostByHotJ",
      "heatGainedByColdJ",
      "component:0:latentHeatJ",
      "component:0:sensibleHeatJ",
      "component:0:signedHeatJ",
      "component:1:signedHeatJ",
    ];

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "mIce", value: mIce, unit: "kg", source: "stem" },
      { name: "tIce", value: tIce, unit: "K", source: "stem" },
      { name: "mWater", value: mWater, unit: "kg", source: "stem" },
      { name: "tWater", value: tWater, unit: "K", source: "stem" },
      { name: "meltingPointK", value: water.meltingPointK, unit: "K", source: "stem" },
      { name: "cIce", value: water.specificHeatSolidJPerKgK, unit: "J kg⁻¹ K⁻¹", source: "stem" },
      { name: "cWater", value: water.specificHeatLiquidJPerKgK, unit: "J kg⁻¹ K⁻¹", source: "stem" },
      { name: "latentFusion", value: water.latentHeatFusionJPerKg, unit: "J kg⁻¹", source: "stem" },
    ];

    if (format === "mcq") {
      const truth = sol.quantities.equilibriumTemperatureK;
      const stems = [
        `Inside ${calContext}, ${fmtDatum(mIce)} kg of ice initially at ${fmtDatum(tIce)} K is added to ${fmtDatum(mWater)} kg of liquid water at ${fmtDatum(tWater)} K. Take melting point T_m = 273.15 K, c_ice = 2100 J kg⁻¹ K⁻¹, c_water = 4180 J kg⁻¹ K⁻¹, and L_f = 3.34 × 10⁵ J kg⁻¹. Neglecting external heat losses, what is the final equilibrium temperature T_eq?`,
        `A ${fmtDatum(mIce)} kg cube of sub-zero ice at ${fmtDatum(tIce)} K is dropped into ${fmtDatum(mWater)} kg of warm water at ${fmtDatum(tWater)} K inside ${calContext} (fusion point 273.15 K, specific heats 2100 J kg⁻¹ K⁻¹ for ice and 4180 J kg⁻¹ K⁻¹ for water, latent heat of fusion 3.34 × 10⁵ J kg⁻¹). All the ice melts. Calculate T_eq.`,
        `When ${fmtDatum(mWater)} kg of warm water at ${fmtDatum(tWater)} K in ${calContext} receives ${fmtDatum(mIce)} kg of cold ice at ${fmtDatum(tIce)} K, the ice warms to 273.15 K, melts completely (L_f = 3.34 × 10⁵ J kg⁻¹), and mixes adiabatically. Using 2100 J kg⁻¹ K⁻¹ for solid ice and 4180 J kg⁻¹ K⁻¹ for liquid water, find the final temperature.`,
        `In an insulated mixing test within ${calContext}, ${fmtDatum(mIce)} kg of solid H₂O at ${fmtDatum(tIce)} K dissolves thermally into ${fmtDatum(mWater)} kg of water initially at ${fmtDatum(tWater)} K. Data: melting temperature 273.15 K; c_s = 2100 J kg⁻¹ K⁻¹; c_l = 4180 J kg⁻¹ K⁻¹; specific fusion enthalpy 3.34 × 10⁵ J kg⁻¹. Which equilibrium temperature is reached?`,
        `Sub-freezing ice (${fmtDatum(mIce)} kg at ${fmtDatum(tIce)} K; c_ice = 2100 J kg⁻¹ K⁻¹) is stirred into ${fmtDatum(mWater)} kg of water (${fmtDatum(tWater)} K; c_water = 4180 J kg⁻¹ K⁻¹) inside ${calContext}. Given T_m = 273.15 K and L_f = 3.34 × 10⁵ J kg⁻¹, determine the steady final temperature once melting finishes.`,
      ];
      const stem = rng.pick(stems);
      if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
        return null;
      }

      const cWater = water.specificHeatLiquidJPerKgK;
      const cIce = water.specificHeatSolidJPerKgK;
      const lf = water.latentHeatFusionJPerKg;
      const tm = water.meltingPointK;

      const distractors: DistractorCandidate[] = [
        {
          value: (mIce * tIce + mWater * tWater) / (mIce + mWater),
          rationale:
            "Treats the sub-zero ice as cold liquid water, omitting both latent heat of fusion m_ice L_f and the distinct specific heat capacity of ice.",
        },
        {
          value:
            tWater -
            (mIce * cIce * (tm - tIce) + mIce * lf) / (mWater * cWater),
          rationale:
            "Includes ice warming and melting to 273.15 K, but forgets that the newly melted ice mass m_ice also warms from 273.15 K to T_eq.",
        },
        {
          value:
            (mWater * cWater * tWater + mIce * cWater * tm - mIce * lf) /
            ((mWater + mIce) * cWater),
          rationale:
            "Includes latent heat m_ice L_f but omits the sensible energy m_ice c_ice (273.15 − T_ice) needed to warm sub-zero ice to the melting point.",
        },
      ];

      const mcq = assembleMcqOptions(truth, "K", distractors);
      if (!mcq) return null;
      const ans = fmtWithUnit(truth, "K", 3);

      return {
        id,
        conceptId: "specific-heat-latent-heat",
        templateArchetype: "ice-water-latent-mixing-and-coexistence",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "thermal",
        scenarioSpec: toScenarioRecord(spec),
        hiddenQuantities,
        requiredGivens,
        questionPlan: {
          targetSummary:
            "Determine equilibrium temperature when sub-zero ice melts completely in warm water",
          distractorStrategy: [
            "omitting-latent-heat-of-fusion",
            "forgetting-melted-ice-sensible-warming",
            "omitting-subzero-solid-ice-warming",
          ],
          assumptions: ["Insulated calorimeter with complete melting of ice"],
        },
        stem,
        options: mcq.options,
        targetQuantityKey: "equilibriumTemperatureK",
        workedSolution: `Energy to warm and melt all ice at 273.15 K: Q_1+2 = ${fmtDatum(mIce)} × 2100 × (273.15 − ${fmtDatum(tIce)}) + ${fmtDatum(mIce)} × 3.34 × 10⁵ = ${formatThermalValue(mIce * 2100 * (273.15 - tIce) + mIce * 3.34e5, 4)} J. Energy balance with warm water: m_w c_w (${fmtDatum(tWater)} − T_eq) = Q_1+2 + m_ice c_w (T_eq − 273.15), giving T_eq = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Includes sub-zero ice warming, fusion latent heat, and meltwater warming to obtain ${ans} (${mcq.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Structured (complete melt)
    const structStems = [
      `Inside ${calContext}, ${fmtDatum(mIce)} kg of solid ice initially at ${fmtDatum(tIce)} K is mixed with ${fmtDatum(mWater)} kg of warm liquid water at ${fmtDatum(tWater)} K. External heat losses are negligible. Take T_m = 273.15 K, c_ice = 2100 J kg⁻¹ K⁻¹, c_water = 4180 J kg⁻¹ K⁻¹, and L_f = 3.34 × 10⁵ J kg⁻¹.`,
      `A ${fmtDatum(mWater)} kg water bath at ${fmtDatum(tWater)} K inside ${calContext} receives ${fmtDatum(mIce)} kg of sub-zero ice initially at ${fmtDatum(tIce)} K under adiabatic conditions. Use 273.15 K for the ice point, specific heat capacities 2100 J kg⁻¹ K⁻¹ (ice) and 4180 J kg⁻¹ K⁻¹ (water), and fusion latent heat 3.34 × 10⁵ J kg⁻¹.`,
      `During a latent-heat experiment in ${calContext}, ${fmtDatum(mIce)} kg of cold ice (${fmtDatum(tIce)} K, c = 2100 J kg⁻¹ K⁻¹) melts completely after immersion in ${fmtDatum(mWater)} kg of water (${fmtDatum(tWater)} K, c = 4180 J kg⁻¹ K⁻¹), with T_m = 273.15 K, L_f = 3.34 × 10⁵ J kg⁻¹, and zero heat loss to the room.`,
      `Neglecting container heat capacity in ${calContext}, ${fmtDatum(mIce)} kg of ice at ${fmtDatum(tIce)} K warms across its 273.15 K fusion point (L_f = 3.34 × 10⁵ J kg⁻¹) when stirred into ${fmtDatum(mWater)} kg of ${fmtDatum(tWater)} K water (c_ice = 2100 J kg⁻¹ K⁻¹, c_water = 4180 J kg⁻¹ K⁻¹).`,
    ];
    const stem = rng.pick(structStems);
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const latAns = fmtWithUnit(sol.quantities["component:0:latentHeatJ"], "J", 3);
    const tEqAns = fmtWithUnit(sol.quantities.equilibriumTemperatureK, "K", 3);
    const qWaterAns = fmtWithUnit(sol.quantities.heatLostByHotJ, "J", 3);

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "Calculate the latent thermal energy required solely to melt all the ice once it reaches 273.15 K.",
        marks: 2,
        targetQuantityKey: "component:0:latentHeatJ",
        expectedAnswer: latAns,
        workingSteps: [
          `Q_lat = m_ice L_f = ${fmtDatum(mIce)} × 3.34 × 10⁵ = ${latAns}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the final thermal equilibrium temperature T_eq of the water.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "equilibriumTemperatureK",
        expectedAnswer: tEqAns,
        workingSteps: [
          `m_water c_water (${fmtDatum(tWater)} − T_eq) = m_ice c_ice (273.15 − ${fmtDatum(tIce)}) + Q_lat + m_ice c_water (T_eq − 273.15).`,
          `Solving gives T_eq = ${tEqAns}.`,
        ],
      },
      {
        partId: "c",
        prompt: "Determine the total thermal energy released by the initially warm water.",
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "heatLostByHotJ",
        expectedAnswer: qWaterAns,
        workingSteps: [
          `Q_released = m_water c_water (${fmtDatum(tWater)} − T_eq) = ${qWaterAns}.`,
        ],
      },
    ];

    return {
      id,
      conceptId: "specific-heat-latent-heat",
      templateArchetype: "ice-water-latent-mixing-and-coexistence",
      seed,
      syllabi,
      format: "structured",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Solve sub-zero ice and warm water calorimetry for fusion heat, equilibrium temperature, and water heat release",
        subpartStrategy: [
          "Latent heat to melt the ice mass",
          "Final equilibrium temperature above melting point",
          "Total heat released by warm water",
        ],
        assumptions: ["Thermally insulated mixing vessel"],
      },
      stem,
      parts,
      workedSolution: `(a) Q_lat = m_ice L_f = ${latAns}. (b) Full enthalpy balance yields T_eq = ${tEqAns}. (c) Heat released by warm water = ${qWaterAns}.`,
      markScheme: [
        ...buildTwoMarkPartScheme("a", "Evaluates m_ice L_f.", latAns),
        ...buildTwoMarkPartScheme("b", "Balances ice warming, melting, and meltwater warming against warm water cooling.", tEqAns),
        ...buildTwoMarkPartScheme("c", "Evaluates m_water c_water (T_water − T_eq).", qWaterAns),
      ],
      totalMarks: 6,
      generatorModel,
    };
  }

  // Coexistence branch: excess melting ice at 273.15 K in moderate water -> partial melt at 273.15 K
  const mIce = rng.pick([0.18, 0.24, 0.3, 0.36, 0.42]);
  const mWater = rng.pick([0.18, 0.24, 0.28, 0.34]);
  const tWater = rng.pick([285.15, 289.15, 293.15, 297.15, 301.15]);

  const spec: CalorimetryMixingScenarioSpec = {
    kind: "calorimetry-mixing",
    components: [
      {
        id: "ice",
        label: "Melting ice",
        massKg: mIce,
        initialTemperatureK: 273.15,
        initialPhase: "solid",
        meltingPointK: water.meltingPointK,
        specificHeatSolidJPerKgK: water.specificHeatSolidJPerKgK,
        specificHeatLiquidJPerKgK: water.specificHeatLiquidJPerKgK,
        latentHeatFusionJPerKg: water.latentHeatFusionJPerKg,
      },
      {
        id: "water",
        label: "Water bath",
        massKg: mWater,
        initialTemperatureK: tWater,
        specificHeatJPerKgK: water.specificHeatLiquidJPerKgK,
      },
    ],
    temperatureDisplayUnit: "K",
    diagramVariant,
  };
  const sol = solveCalorimetryMixing(spec);

  const hiddenQuantities = [
    "meltedMassKg",
    "meltedFraction",
    "component:0:transitionFraction",
    "heatLostByHotJ",
    "heatGainedByColdJ",
    "component:0:latentHeatJ",
    "component:0:signedHeatJ",
    "component:1:signedHeatJ",
  ];

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "mIce", value: mIce, unit: "kg", source: "stem" },
    { name: "tIce", value: 273.15, unit: "K", source: "stem" },
    { name: "mWater", value: mWater, unit: "kg", source: "stem" },
    { name: "tWater", value: tWater, unit: "K", source: "stem" },
    { name: "cWater", value: water.specificHeatLiquidJPerKgK, unit: "J kg⁻¹ K⁻¹", source: "stem" },
    { name: "latentFusion", value: water.latentHeatFusionJPerKg, unit: "J kg⁻¹", source: "stem" },
  ];

  if (format === "mcq") {
    const truth = sol.quantities.meltedMassKg;
    const stems = [
      `Inside ${calContext}, a ${fmtDatum(mIce)} kg block of melting ice at 273.15 K is placed into ${fmtDatum(mWater)} kg of water initially at ${fmtDatum(tWater)} K (c_water = 4180 J kg⁻¹ K⁻¹, L_f = 3.34 × 10⁵ J kg⁻¹). Because the ice mass is large, the mixture reaches phase-coexistence equilibrium at 273.15 K. What mass of ice melts?`,
      `A ${fmtDatum(mWater)} kg bath of liquid water at ${fmtDatum(tWater)} K in ${calContext} is stirred with ${fmtDatum(mIce)} kg of ice already at its melting point of 273.15 K. Take c_water = 4180 J kg⁻¹ K⁻¹ and L_f = 3.34 × 10⁵ J kg⁻¹. How many kilograms of ice melt by the time thermal equilibrium is established?`,
      `Excess crushed ice (${fmtDatum(mIce)} kg at 273.15 K; specific latent heat of fusion 3.34 × 10⁵ J kg⁻¹) is tipped into ${fmtDatum(mWater)} kg of tepid water at ${fmtDatum(tWater)} K (specific heat 4180 J kg⁻¹ K⁻¹) inside ${calContext}. Calculate the mass of ice converted into liquid water.`,
      `When ${fmtDatum(mIce)} kg of 273.15 K ice and ${fmtDatum(mWater)} kg of ${fmtDatum(tWater)} K water equilibrate adiabatically inside ${calContext}, solid and liquid coexist at 273.15 K. Using 4180 J kg⁻¹ K⁻¹ for water and L_f = 3.34 × 10⁵ J kg⁻¹, determine Δm_melted.`,
      `In ${calContext}, ${fmtDatum(mWater)} kg of water cools from ${fmtDatum(tWater)} K down to 273.15 K against ${fmtDatum(mIce)} kg of melting ice initially at 273.15 K (c = 4180 J kg⁻¹ K⁻¹; fusion enthalpy 3.34 × 10⁵ J kg⁻¹). Find the melted ice mass.`,
    ];
    const stem = rng.pick(stems);
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const qAvail = mWater * 4180 * (tWater - 273.15);
    const distractors: DistractorCandidate[] = [
      {
        value: mIce - truth,
        rationale:
          "Computes the mass of unmelted ice remaining at 273.15 K rather than the mass of ice that melts.",
      },
      {
        value: qAvail / water.latentHeatVaporizationJPerKg,
        rationale:
          "Divides available thermal energy by the latent heat of vaporization (2.26 × 10⁶ J kg⁻¹) instead of fusion.",
      },
      {
        value: sol.quantities.meltedFraction,
        rationale:
          "Calculates the dimensionless melted fraction Δm / m_ice instead of the melted mass Δm in kg.",
      },
      {
        value: mIce,
        rationale:
          "Assumes the entire block of ice melts without checking whether the water holds sufficient enthalpy above 273.15 K.",
      },
    ];

    const mcq = assembleMcqOptions(truth, "kg", distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, "kg", 3);

    return {
      id,
      conceptId: "specific-heat-latent-heat",
      templateArchetype: "ice-water-latent-mixing-and-coexistence",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Determine the mass of ice melted when an ice-water mixture reaches solid-liquid coexistence at the melting point",
        distractorStrategy: [
          "remaining-unmelted-mass-vs-melted-mass",
          "vaporization-latent-heat-substitution",
          "dimensionless-fraction-vs-mass-in-kg",
        ],
        assumptions: ["Insulated calorimeter reaching ice-water coexistence at 273.15 K"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: "meltedMassKg",
      workedSolution: `Maximum heat released by water cooling to 273.15 K is Q = ${fmtDatum(mWater)} × 4180 × (${fmtDatum(tWater)} − 273.15) = ${formatThermalValue(qAvail, 4)} J, which is less than m_ice L_f = ${formatThermalValue(mIce * 3.34e5, 4)} J. Mass melted Δm = Q / L_f = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates Δm = m_water c_water (T_water − 273.15) / L_f to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured (coexistence)
  const structStems = [
    `In ${calContext}, ${fmtDatum(mIce)} kg of solid ice at its melting point of 273.15 K is placed into ${fmtDatum(mWater)} kg of water initially at ${fmtDatum(tWater)} K. External heat transfer is negligible. Take c_water = 4180 J kg⁻¹ K⁻¹ and L_f = 3.34 × 10⁵ J kg⁻¹.`,
    `Inside ${calContext}, ${fmtDatum(mWater)} kg of liquid water at ${fmtDatum(tWater)} K is mixed adiabatically with an excess ${fmtDatum(mIce)} kg charge of melting ice at 273.15 K (specific heat of water 4180 J kg⁻¹ K⁻¹; specific latent heat of fusion 3.34 × 10⁵ J kg⁻¹).`,
    `An insulated run in ${calContext} combines ${fmtDatum(mIce)} kg of pure ice at 273.15 K with ${fmtDatum(mWater)} kg of tepid water at ${fmtDatum(tWater)} K. Adopt c_w = 4180 J kg⁻¹ K⁻¹ and fusion enthalpy L_f = 3.34 × 10⁵ J kg⁻¹.`,
    `Zero heat enters ${calContext} while ${fmtDatum(mWater)} kg of water initially at ${fmtDatum(tWater)} K equilibrates against ${fmtDatum(mIce)} kg of 273.15 K ice (4180 J kg⁻¹ K⁻¹ for liquid water; L_f = 3.34 × 10⁵ J kg⁻¹).`,
  ];
  const stem = rng.pick(structStems);
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const qRelAns = fmtWithUnit(sol.quantities.heatLostByHotJ, "J", 3);
  const mMeltAns = fmtWithUnit(sol.quantities.meltedMassKg, "kg", 3);
  const fracAns = formatThermalValue(sol.quantities.meltedFraction, 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Show that not all the ice melts by calculating the thermal energy released when the warm water cools to 273.15 K.",
      marks: 2,
      targetQuantityKey: "heatLostByHotJ",
      expectedAnswer: qRelAns,
      workingSteps: [
        `Q_water = m_water c_water (${fmtDatum(tWater)} − 273.15) = ${qRelAns} (< m_ice L_f = ${formatThermalValue(mIce * 3.34e5, 3)} J).`,
      ],
    },
    {
      partId: "b",
      prompt: "Calculate the mass of ice that melts by the time thermal equilibrium is reached.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "meltedMassKg",
      expectedAnswer: mMeltAns,
      workingSteps: [
        `Δm = Q_water / L_f = ${formatThermalValue(sol.quantities.heatLostByHotJ, 4)} / (3.34 × 10⁵) = ${mMeltAns}.`,
      ],
    },
    {
      partId: "c",
      prompt: "Determine the fraction of the initial ice sample that has melted at equilibrium.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "meltedFraction",
      expectedAnswer: fracAns,
      workingSteps: [
        `f = Δm / m_ice = ${formatThermalValue(sol.quantities.meltedMassKg, 4)} / ${fmtDatum(mIce)} = ${fracAns}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "ice-water-latent-mixing-and-coexistence",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Analyse solid-liquid coexistence equilibrium to find water heat release, melted ice mass, and melted fraction",
      subpartStrategy: [
        "Thermal energy released by warm water cooling to 273.15 K",
        "Mass of ice melted from Q / L_f",
        "Melted mass fraction relative to initial ice mass",
      ],
      assumptions: ["Adiabatic calorimeter reaching two-phase equilibrium at 273.15 K"],
    },
    stem,
    parts,
    workedSolution: `(a) Q_water = m_water c_water (${fmtDatum(tWater)} − 273.15) = ${qRelAns}, which is below m_ice L_f. (b) Melted mass Δm = Q_water / L_f = ${mMeltAns}. (c) Melted fraction f = Δm / m_ice = ${fracAns}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Computes m_water c_water (T_water − 273.15).", qRelAns),
      ...buildTwoMarkPartScheme("b", "Divides Q_water by L_f.", mMeltAns),
      ...buildTwoMarkPartScheme("c", "Divides Δm by initial ice mass m_ice.", fracAns),
    ],
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* 15. thermal-conduction-radiation :: blackbody-wien-stefan-boltzmann        */
/* ========================================================================== */

function buildBlackbodyWienStefanBoltzmann(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const sourceDesc = BLACKBODY_CONTEXTS[variantIndex % BLACKBODY_CONTEXTS.length];
  const isStellar = variantIndex % 2 === 0;

  const temperatureK = isStellar
    ? rng.pick([3600, 4200, 4800, 5500, 6200, 7400, 8800])
    : rng.pick([1200, 1500, 1800, 2200, 2600, 3100]);
  const surfaceAreaM2 = isStellar
    ? rng.pick([1.8e18, 3.6e18, 6.2e18, 1.4e19, 2.8e19])
    : rng.pick([2.5e-4, 4.5e-4, 8.0e-4, 1.5e-3, 3.2e-3]);
  const observerDistanceM = isStellar
    ? rng.pick([8.5e10, 1.5e11, 2.4e11, 4.2e11, 6.8e11])
    : rng.pick([1.5, 2.4, 3.5, 5.0]);

  const spec: ThermalRadiationScenarioSpec = {
    kind: "thermal-radiation",
    bodyLabel: isStellar ? "Star A" : "Blackbody source",
    temperatureK,
    emissivity: 1,
    surfaceAreaM2,
    observerDistanceM,
  };
  const sol = solveThermalRadiation(spec);

  const hiddenQuantities = [
    "peakWavelengthM",
    "peakWavelengthNm",
    "radiatedPowerW",
    "radiatedIntensityWm2",
    "netRadiatedPowerW",
    "intensityAtDistanceWm2",
  ];

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "temperatureK", value: temperatureK, unit: "K", source: "stem" },
    { name: "surfaceAreaM2", value: surfaceAreaM2, unit: "m²", source: "stem" },
    { name: "observerDistanceM", value: observerDistanceM, unit: "m", source: "stem" },
  ];

  if (format === "mcq") {
    const mode = variantIndex % 3;
    const targetKey =
      mode === 0
        ? "peakWavelengthNm"
        : mode === 1
          ? "radiatedPowerW"
          : "intensityAtDistanceWm2";
    const targetUnit = mode === 0 ? "nm" : mode === 1 ? "W" : "W m⁻²";
    const truth = sol.quantities[targetKey];

    const askClause =
      mode === 0
        ? "Taking Wien's constant b = 2.90 × 10⁻³ m K, what is the peak emission wavelength λ_max in nanometres?"
        : mode === 1
          ? "Taking σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴, what is the total electromagnetic power radiated?"
          : "Taking σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴, what is the radiant intensity received at distance d (neglecting intervening absorption)?";

    const stems = [
      `Modelled as an ideal blackbody (emissivity = 1), ${sourceDesc} has surface area ${fmtDatum(surfaceAreaM2)} m², absolute surface temperature ${fmtDatum(temperatureK)} K, and is observed from a distance d = ${fmtDatum(observerDistanceM)} m. ${askClause}`,
      `The Planck spectral curve shown corresponds to ${sourceDesc} of radiating area ${fmtDatum(surfaceAreaM2)} m² and uniform blackbody temperature ${fmtDatum(temperatureK)} K, monitored by a radiometer ${fmtDatum(observerDistanceM)} m away. ${askClause}`,
      `Radiometric observations characterise ${sourceDesc} (ideal blackbody, area ${fmtDatum(surfaceAreaM2)} m², surface temperature ${fmtDatum(temperatureK)} K) from a separation d = ${fmtDatum(observerDistanceM)} m. ${askClause}`,
      `Operating at ${fmtDatum(temperatureK)} K with effective blackbody emissivity 1 and area ${fmtDatum(surfaceAreaM2)} m², ${sourceDesc} irradiates a sensor located ${fmtDatum(observerDistanceM)} m away in vacuum. ${askClause}`,
    ];
    const stem = rng.pick(stems);
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const distractors: DistractorCandidate[] =
      mode === 0
        ? [
            {
              value:
                (WIEN_DISPLACEMENT_CONSTANT / Math.max(50, temperatureK - KELVIN_OFFSET)) *
                1e9,
              rationale:
                "Subtracts 273.15 from the kelvin temperature before applying Wien's law.",
            },
            {
              value: (temperatureK / WIEN_DISPLACEMENT_CONSTANT) * 1e-9,
              rationale:
                "Inverts Wien's displacement law by dividing T by b instead of b by T.",
            },
            {
              value: WIEN_DISPLACEMENT_CONSTANT * temperatureK * 1e9,
              rationale:
                "Multiplies Wien's constant b by T instead of dividing b by T.",
            },
          ]
        : mode === 1
          ? [
              {
                value:
                  STEFAN_BOLTZMANN_CONSTANT * surfaceAreaM2 * temperatureK ** 2,
                rationale:
                  "Uses T² instead of T⁴ in the Stefan–Boltzmann law P = σ A T⁴.",
              },
              {
                value: STEFAN_BOLTZMANN_CONSTANT * temperatureK ** 4,
                rationale:
                  "Computes surface exitance σ T⁴ (W m⁻²) and omits multiplication by surface area A.",
              },
              {
                value:
                  STEFAN_BOLTZMANN_CONSTANT *
                  surfaceAreaM2 *
                  Math.max(50, temperatureK - KELVIN_OFFSET) ** 4,
                rationale:
                  "Uses Celsius-shifted temperature (T − 273.15)⁴ instead of absolute kelvin temperature T⁴.",
              },
            ]
          : [
              {
                value: sol.quantities.radiatedPowerW / observerDistanceM ** 2,
                rationale:
                  "Omits the geometric factor 4π for isotropic spherical spreading in I = L / (4π d²).",
              },
              {
                value:
                  sol.quantities.radiatedPowerW /
                  (Math.PI * observerDistanceM ** 2),
                rationale:
                  "Divides radiated power by disc area π d² instead of spherical shell area 4π d².",
              },
              {
                value:
                  sol.quantities.radiatedPowerW /
                  (4 * Math.PI * observerDistanceM),
                rationale:
                  "Divides by 4π d instead of 4π d², omitting the inverse-square exponent.",
              },
            ];

    const mcq = assembleMcqOptions(truth, targetUnit, distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, targetUnit, 3);

    const workedSolution =
      mode === 0
        ? `By Wien's displacement law, λ_max = b / T = (2.90 × 10⁻³) / ${fmtDatum(temperatureK)} = ${formatThermalValue(sol.quantities.peakWavelengthM, 4)} m = ${ans}.`
        : mode === 1
          ? `By the Stefan–Boltzmann law for a blackbody (e = 1), P = σ A T⁴ = 5.67 × 10⁻⁸ × ${fmtDatum(surfaceAreaM2)} × (${fmtDatum(temperatureK)})⁴ = ${ans}.`
          : `Radiated luminosity L = σ A T⁴ = ${formatThermalValue(sol.quantities.radiatedPowerW, 4)} W. Intensity at distance d is I = L / (4π d²) = ${formatThermalValue(sol.quantities.radiatedPowerW, 4)} / (4π × (${fmtDatum(observerDistanceM)})²) = ${ans}.`;

    return {
      id,
      conceptId: "thermal-conduction-radiation",
      templateArchetype: "blackbody-wien-stefan-boltzmann",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Apply Wien displacement, Stefan-Boltzmann T^4 power, and inverse-square intensity laws to an ideal blackbody",
        distractorStrategy: [
          "omitting-four-pi-spherical-area-factor",
          "wrong-temperature-exponent-in-stefan-boltzmann",
          "kelvin-vs-celsius-shift-in-radiation-laws",
        ],
        assumptions: ["Isotropic ideal blackbody radiator (e = 1) with zero intervening extinction"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates the blackbody radiation law in SI units to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2
  const structStems = [
    `Modelled as an ideal blackbody (emissivity = 1), ${sourceDesc} has radiating surface area ${fmtDatum(surfaceAreaM2)} m² and surface temperature ${fmtDatum(temperatureK)} K. Its thermal spectrum is shown in the figure, and a detector is positioned at distance d = ${fmtDatum(observerDistanceM)} m. Take b = 2.90 × 10⁻³ m K and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴.`,
    `A bolometric sensor placed at d = ${fmtDatum(observerDistanceM)} m in vacuum intercepts isotropic blackbody radiation (e = 1) from ${sourceDesc} of area ${fmtDatum(surfaceAreaM2)} m² and temperature ${fmtDatum(temperatureK)} K. Use Wien's constant 2.90 × 10⁻³ m K and Stefan–Boltzmann constant 5.67 × 10⁻⁸ W m⁻² K⁻⁴.`,
    `The plotted spectral radiance curve represents ${sourceDesc} (unit emissivity, area ${fmtDatum(surfaceAreaM2)} m², surface temperature ${fmtDatum(temperatureK)} K) observed across an extinction-free distance of ${fmtDatum(observerDistanceM)} m (b = 2.90 × 10⁻³ m K, σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴).`,
    `At ${fmtDatum(temperatureK)} K, ${sourceDesc} acts as an ideal blackbody emitter with total area ${fmtDatum(surfaceAreaM2)} m² illuminating an instrument aperture ${fmtDatum(observerDistanceM)} m away. Adopt b = 2.90 × 10⁻³ m K and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴.`,
  ];
  const stem = rng.pick(structStems);
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const lamAns = fmtWithUnit(sol.quantities.peakWavelengthM, "m", 3);
  const pAns = fmtWithUnit(sol.quantities.radiatedPowerW, "W", 3);
  const iAns = fmtWithUnit(sol.quantities.intensityAtDistanceWm2, "W m⁻²", 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: "Calculate the peak emission wavelength λ_max (in metres) of the blackbody spectrum.",
      marks: 2,
      targetQuantityKey: "peakWavelengthM",
      expectedAnswer: lamAns,
      workingSteps: [
        `λ_max = b / T = (2.90 × 10⁻³) / ${fmtDatum(temperatureK)} = ${lamAns}.`,
      ],
    },
    {
      partId: "b",
      prompt: "Calculate the total electromagnetic power radiated by the source.",
      marks: 2,
      targetQuantityKey: "radiatedPowerW",
      expectedAnswer: pAns,
      workingSteps: [
        `P = σ A T⁴ = 5.67 × 10⁻⁸ × ${fmtDatum(surfaceAreaM2)} × (${fmtDatum(temperatureK)})⁴ = ${pAns}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Determine the radiant intensity incident on the detector at distance d = ${fmtDatum(observerDistanceM)} m.`,
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "intensityAtDistanceWm2",
      expectedAnswer: iAns,
      workingSteps: [
        `I = P / (4π d²) = ${formatThermalValue(sol.quantities.radiatedPowerW, 4)} / (4π × (${fmtDatum(observerDistanceM)})²) = ${iAns}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "thermal-conduction-radiation",
    templateArchetype: "blackbody-wien-stefan-boltzmann",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Combine Wien's displacement law, Stefan-Boltzmann radiated power, and inverse-square intensity",
      subpartStrategy: [
        "Peak emission wavelength from Wien's law",
        "Total radiated power from Stefan-Boltzmann T^4 scaling",
        "Apparent brightness / radiant intensity at observer distance d",
      ],
      assumptions: ["Isotropic ideal blackbody source in vacuum"],
    },
    stem,
    parts,
    workedSolution: `(a) λ_max = b / T = ${lamAns}. (b) P = σ A T⁴ = ${pAns}. (c) I = P / (4π d²) = ${iAns}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Applies λ_max = (2.90 × 10⁻³) / T.", lamAns),
      ...buildTwoMarkPartScheme("b", "Applies P = σ A T⁴.", pAns),
      ...buildTwoMarkPartScheme("c", "Divides P by 4π d².", iAns),
    ],
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* 16. greenhouse-albedo-energy-balance :: greybody-emissivity-radiative-bal. */
/* ========================================================================== */

function buildGreybodyEmissivityRadiativeBalance(
  ctx: BuildSlotContext,
): CandidateQuestionInput | null {
  const { id, seed, rng, variantIndex, format, difficulty, syllabi, generatorModel } = ctx;
  const surface =
    GREYBODY_CLIMATE_CONTEXTS[variantIndex % GREYBODY_CLIMATE_CONTEXTS.length];

  const emissivity = rng.pick([0.64, 0.72, 0.78, 0.84, 0.88, 0.92, 0.95]);
  const surfaceAreaM2 = rng.pick([1.2, 2.5, 4.0, 6.5, 8.5, 12.0, 18.0]);
  const ambientTemperatureK = rng.pick([240, 255, 268, 278, 286]);
  const temperatureK = ambientTemperatureK + rng.pick([28, 42, 58, 75, 95]);

  const spec: ThermalRadiationScenarioSpec = {
    kind: "thermal-radiation",
    bodyLabel: "Greybody surface",
    temperatureK,
    emissivity,
    surfaceAreaM2,
    ambientTemperatureK,
  };
  const sol = solveThermalRadiation(spec);

  const hiddenQuantities = [
    "peakWavelengthM",
    "peakWavelengthNm",
    "radiatedIntensityWm2",
    "radiatedPowerW",
    "netRadiatedPowerW",
  ];

  const requiredGivens: RequiredGivenSpec[] = [
    { name: "emissivity", value: emissivity, source: "stem" },
    { name: "surfaceAreaM2", value: surfaceAreaM2, unit: "m²", source: "stem" },
    { name: "temperatureK", value: temperatureK, unit: "K", source: "stem" },
    { name: "ambientTemperatureK", value: ambientTemperatureK, unit: "K", source: "stem" },
  ];

  if (format === "mcq") {
    const askExitance = variantIndex % 3 === 2;
    const targetKey = askExitance ? "radiatedIntensityWm2" : "netRadiatedPowerW";
    const targetUnit = askExitance ? "W m⁻²" : "W";
    const truth = sol.quantities[targetKey];

    const stems = askExitance
      ? [
          `In a planetary energy-balance study, ${surface} of area ${fmtDatum(surfaceAreaM2)} m² and infrared emissivity e = ${fmtDatum(emissivity)} is at surface temperature ${fmtDatum(temperatureK)} K beneath a radiative environment at ${fmtDatum(ambientTemperatureK)} K. Taking σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴, what is the gross thermal power radiated per unit area (surface exitance) by this greybody surface?`,
          `Telemetry from ${surface} (area ${fmtDatum(surfaceAreaM2)} m², emissivity ${fmtDatum(emissivity)}) records a surface temperature of ${fmtDatum(temperatureK)} K in surroundings at ${fmtDatum(ambientTemperatureK)} K (σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴). Calculate the gross emitted intensity e σ T⁴ from the surface.`,
        ]
      : [
          `In a climate radiative-transfer model, ${surface} of area ${fmtDatum(surfaceAreaM2)} m² and surface emissivity e = ${fmtDatum(emissivity)} is at ${fmtDatum(temperatureK)} K while exchanging thermal infrared radiation with an effective surrounding environment at ${fmtDatum(ambientTemperatureK)} K. Taking σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴, what is the net rate of radiative energy loss P_net from the surface?`,
          `An energy-budget sensor monitors ${surface} (area ${fmtDatum(surfaceAreaM2)} m², greybody emissivity ${fmtDatum(emissivity)}) maintained at ${fmtDatum(temperatureK)} K within a radiative environment at ${fmtDatum(ambientTemperatureK)} K. Using σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴, calculate P_net = e σ A (T⁴ − T_amb⁴).`,
          `Exposed to an atmospheric/enclosure radiation field at ${fmtDatum(ambientTemperatureK)} K, ${surface} of area ${fmtDatum(surfaceAreaM2)} m² and emissivity ${fmtDatum(emissivity)} has temperature ${fmtDatum(temperatureK)} K (σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴). Determine the net radiative thermal power emitted by the surface.`,
        ];

    const stem = stems[variantIndex % stems.length];
    if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
      return null;
    }

    const distractors: DistractorCandidate[] = askExitance
      ? [
          {
            value: STEFAN_BOLTZMANN_CONSTANT * temperatureK ** 4,
            rationale:
              "Treats the surface as an ideal blackbody (e = 1) and omits the emissivity factor e.",
          },
          {
            value: (STEFAN_BOLTZMANN_CONSTANT * temperatureK ** 4) / emissivity,
            rationale:
              "Divides blackbody exitance σ T⁴ by emissivity e instead of multiplying by e.",
          },
          {
            value: sol.quantities.radiatedPowerW,
            rationale:
              "Multiplies by surface area A, reporting total radiated power in watts rather than power per unit area.",
          },
        ]
      : [
          {
            value:
              emissivity *
              STEFAN_BOLTZMANN_CONSTANT *
              surfaceAreaM2 *
              (temperatureK - ambientTemperatureK) ** 4,
            rationale:
              "Evaluates e σ A (T − T_amb)⁴ instead of e σ A (T⁴ − T_amb⁴), a classic fourth-power algebra error.",
          },
          {
            value: sol.quantities.radiatedPowerW,
            rationale:
              "Calculates gross emitted power e σ A T⁴ and ignores incoming radiation absorbed from the surroundings at T_amb.",
          },
          {
            value:
              STEFAN_BOLTZMANN_CONSTANT *
              surfaceAreaM2 *
              (temperatureK ** 4 - ambientTemperatureK ** 4),
            rationale:
              "Omits the greybody emissivity factor e (< 1) from P_net = e σ A (T⁴ − T_amb⁴).",
          },
        ];

    const mcq = assembleMcqOptions(truth, targetUnit, distractors);
    if (!mcq) return null;
    const ans = fmtWithUnit(truth, targetUnit, 3);

    return {
      id,
      conceptId: "greenhouse-albedo-energy-balance",
      templateArchetype: "greybody-emissivity-radiative-balance",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "thermal",
      scenarioSpec: toScenarioRecord(spec),
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Apply greybody emissivity and net radiative power balance to a planetary or spacecraft surface",
        distractorStrategy: [
          "fourth-power-of-temperature-difference-fallacy",
          "ignoring-ambient-back-radiation",
          "omitting-greybody-emissivity",
        ],
        assumptions: ["Greybody surface with equal absorptivity and emissivity in thermal IR"],
      },
      stem,
      options: mcq.options,
      targetQuantityKey: targetKey,
      workedSolution: askExitance
        ? `Gross radiated intensity (exitance) M = e σ T⁴ = ${fmtDatum(emissivity)} × 5.67 × 10⁻⁸ × (${fmtDatum(temperatureK)})⁴ = ${ans}.`
        : `Net radiative power loss P_net = e σ A (T⁴ − T_amb⁴) = ${fmtDatum(emissivity)} × 5.67 × 10⁻⁸ × ${fmtDatum(surfaceAreaM2)} × ((${fmtDatum(temperatureK)})⁴ − (${fmtDatum(ambientTemperatureK)})⁴) = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates ${askExitance ? "e σ T⁴" : "e σ A (T⁴ − T_amb⁴)"} to obtain ${ans} (${mcq.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2
  const structStems = [
    `In an infrared energy-balance investigation, ${surface} of surface area ${fmtDatum(surfaceAreaM2)} m² and greybody emissivity e = ${fmtDatum(emissivity)} has a uniform temperature of ${fmtDatum(temperatureK)} K while exchanging radiation with an ambient environment at ${fmtDatum(ambientTemperatureK)} K. Take b = 2.90 × 10⁻³ m K and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴.`,
    `Longwave radiometers monitor ${surface} (area ${fmtDatum(surfaceAreaM2)} m², infrared emissivity ${fmtDatum(emissivity)}) maintained at ${fmtDatum(temperatureK)} K beneath surroundings of effective radiative temperature ${fmtDatum(ambientTemperatureK)} K. Use b = 2.90 × 10⁻³ m K and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴.`,
    `Within an atmospheric/space radiative budget model, ${surface} covers ${fmtDatum(surfaceAreaM2)} m² at ${fmtDatum(temperatureK)} K with greybody emissivity ${fmtDatum(emissivity)} and faces a ${fmtDatum(ambientTemperatureK)} K background radiation field (b = 2.90 × 10⁻³ m K; σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴).`,
    `At ${fmtDatum(temperatureK)} K, ${surface} (surface area ${fmtDatum(surfaceAreaM2)} m², emissivity e = ${fmtDatum(emissivity)}) emits and absorbs thermal radiation in an environment at ${fmtDatum(ambientTemperatureK)} K. Adopt Wien constant 2.90 × 10⁻³ m K and Stefan–Boltzmann constant 5.67 × 10⁻⁸ W m⁻² K⁻⁴.`,
  ];
  const stem = rng.pick(structStems);
  if (!stemAvoidsHiddenLeak(stem, requiredGivens, hiddenQuantities, sol.quantities)) {
    return null;
  }

  const lamAns = fmtWithUnit(sol.quantities.peakWavelengthM, "m", 3);
  const pGrossAns = fmtWithUnit(sol.quantities.radiatedPowerW, "W", 3);
  const pNetAns = fmtWithUnit(sol.quantities.netRadiatedPowerW, "W", 3);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: "Calculate the peak infrared wavelength λ_max emitted by the surface.",
      marks: 2,
      targetQuantityKey: "peakWavelengthM",
      expectedAnswer: lamAns,
      workingSteps: [
        `λ_max = b / T = (2.90 × 10⁻³) / ${fmtDatum(temperatureK)} = ${lamAns}.`,
      ],
    },
    {
      partId: "b",
      prompt: "Calculate the gross thermal power emitted by the greybody surface.",
      marks: 2,
      targetQuantityKey: "radiatedPowerW",
      expectedAnswer: pGrossAns,
      workingSteps: [
        `P_emitted = e σ A T⁴ = ${fmtDatum(emissivity)} × 5.67 × 10⁻⁸ × ${fmtDatum(surfaceAreaM2)} × (${fmtDatum(temperatureK)})⁴ = ${pGrossAns}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Determine the net rate of radiative thermal energy loss to the ${fmtDatum(ambientTemperatureK)} K surroundings.`,
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "netRadiatedPowerW",
      expectedAnswer: pNetAns,
      workingSteps: [
        `P_net = e σ A (T⁴ − T_amb⁴) = ${pNetAns}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "greenhouse-albedo-energy-balance",
    templateArchetype: "greybody-emissivity-radiative-balance",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "thermal",
    scenarioSpec: toScenarioRecord(spec),
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Compute Wien infrared peak wavelength, gross greybody emission, and net radiative heat loss",
      subpartStrategy: [
        "Peak thermal infrared wavelength from Wien's law",
        "Gross radiated power using emissivity e < 1",
        "Net radiative loss accounting for ambient T_amb^4 back-radiation",
      ],
      assumptions: ["Diffuse greybody radiator with Kirchhoff emissivity-absorptivity equality"],
    },
    stem,
    parts,
    workedSolution: `(a) λ_max = b / T = ${lamAns}. (b) Gross emitted power P_emitted = e σ A T⁴ = ${pGrossAns}. (c) Net radiative loss P_net = e σ A (T⁴ − T_amb⁴) = ${pNetAns}.`,
    markScheme: [
      ...buildTwoMarkPartScheme("a", "Uses λ_max = (2.90 × 10⁻³) / T.", lamAns),
      ...buildTwoMarkPartScheme("b", "Uses P_emitted = e σ A T⁴.", pGrossAns),
      ...buildTwoMarkPartScheme("c", "Evaluates e σ A (T⁴ − T_amb⁴).", pNetAns),
    ],
    totalMarks: 6,
    generatorModel,
  };
}

/* ========================================================================== */
/* Dispatcher & Public Entry Point                                            */
/* ========================================================================== */

interface ArchetypeRegistration {
  readonly conceptId: string;
  readonly templateArchetype: ThermalArchetypeSlug;
  readonly policy: ArchetypeSyllabusPolicy;
  readonly build: (ctx: BuildSlotContext) => CandidateQuestionInput | null;
}

const ARCHETYPE_REGISTRATIONS: readonly ArchetypeRegistration[] = [
  {
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "ideal-gas-state-pressure-density",
    policy: {},
    build: buildIdealGasStatePressureDensity,
  },
  {
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "maxwell-boltzmann-rms-speed",
    policy: {},
    build: buildMaxwellBoltzmannRmsSpeed,
  },
  {
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "molecular-translational-kinetic-energy",
    policy: {
      excludeSyllabi: ["ncuk"],
    },
    build: buildMolecularKineticEnergy,
  },
  {
    conceptId: "ideal-gas-pv-cycles",
    templateArchetype: "gas-law-pt-vt-state-transitions",
    policy: {
      ibSubtopicOverride: "ib-b3-gas-laws",
      alevelSubtopicOverride: "alevel-3-6-2-thermal-physics",
      ncukSubtopicOverride: "ncuk-ac3-4",
    },
    build: buildGasLawPtVtStateTransitions,
  },
  {
    conceptId: "ideal-gas-pv-cycles",
    templateArchetype: "isobaric-isochoric-open-first-law",
    policy: {
      ibForceHlOnly: true,
      ibSubtopicOverride: "ib-b4-thermodynamics",
      alevelSubtopicOverride: "alevel-3-6-2-thermal-physics",
      ncukSubtopicOverride: "ncuk-ac3-3",
    },
    build: buildIsobaricIsochoricOpenFirstLaw,
  },
  {
    conceptId: "ideal-gas-pv-cycles",
    templateArchetype: "rectangular-pv-cycle-work-efficiency",
    policy: {
      ibForceHlOnly: true,
      ibSubtopicOverride: "ib-b4-thermodynamics",
      alevelSubtopicOverride: "alevel-3-11-engineering-physics",
      excludeSyllabi: ["ncuk"],
    },
    build: buildRectangularPvCycleWorkEfficiency,
  },
  {
    conceptId: "thermodynamics-entropy-engines",
    templateArchetype: "adiabatic-monatomic-expansion-compression",
    policy: {},
    build: buildAdiabaticMonatomicProcess,
  },
  {
    conceptId: "thermodynamics-entropy-engines",
    templateArchetype: "isothermal-work-and-entropy-change",
    policy: {
      excludeSyllabi: ["alevel", "ncuk"],
    },
    build: buildIsothermalWorkAndEntropy,
  },
  {
    conceptId: "thermodynamics-entropy-engines",
    templateArchetype: "carnot-engine-efficiency-and-reservoirs",
    policy: {},
    build: buildCarnotEngineEfficiency,
  },
  {
    conceptId: "thermodynamics-entropy-engines",
    templateArchetype: "closed-adiabatic-heat-engine-cycle",
    policy: {},
    build: buildClosedAdiabaticHeatEngineCycle,
  },
  {
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "phase-change-heating-curve-energy",
    policy: {},
    build: buildPhaseChangeHeatingCurveEnergy,
  },
  {
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "electrical-heater-phase-change-power-time",
    policy: {},
    build: buildElectricalHeaterPhaseChangeTime,
  },
  {
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "calorimetry-solid-liquid-equilibrium",
    policy: {},
    build: buildCalorimetrySolidLiquidEquilibrium,
  },
  {
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "ice-water-latent-mixing-and-coexistence",
    policy: {},
    build: buildIceWaterLatentMixing,
  },
  {
    conceptId: "thermal-conduction-radiation",
    templateArchetype: "blackbody-wien-stefan-boltzmann",
    policy: {},
    build: buildBlackbodyWienStefanBoltzmann,
  },
  {
    conceptId: "greenhouse-albedo-energy-balance",
    templateArchetype: "greybody-emissivity-radiative-balance",
    policy: {},
    build: buildGreybodyEmissivityRadiativeBalance,
  },
];

function selectDifficulty(slotIndex: number): QuestionDifficulty {
  const mod = slotIndex % 20;
  if (mod < 5) return "foundation";
  if (mod < 14) return "standard";
  return "higher";
}

function maxShingleJaccard(
  candidateSet: ReadonlySet<string>,
  priorSets: readonly ReadonlySet<string>[],
): number {
  let maxSim = 0;
  for (const other of priorSets) {
    if (candidateSet.size === 0 || other.size === 0) continue;
    let intersection = 0;
    for (const token of candidateSet) {
      if (other.has(token)) intersection += 1;
    }
    const union = candidateSet.size + other.size - intersection;
    const sim = union === 0 ? 0 : intersection / union;
    if (sim > maxSim) {
      maxSim = sim;
    }
  }
  return maxSim;
}

/**
 * Generates deterministic, solver-verified `thermal` domain candidates
 * (~65% MCQ, ~35% Paper 2 structured) across 16 `(conceptId, templateArchetype)`
 * family groups spanning IB (SL/HL), UK A-Level (Y13), and NCUK IFY.
 */
export function generateThermalCandidates(
  options: ThermalGeneratorOptions = {},
): CandidateQuestionInput[] {
  const targetCount = options.count ?? 336;
  const baseSeed = options.baseSeed ?? 700_000;
  const mcqFraction = options.mcqFraction ?? 0.65;
  const generatorModel = options.generatorModel ?? "gemini-4-carbon-high";

  if (!Number.isInteger(targetCount) || targetCount < 0) {
    throw new Error(`count must be a non-negative integer; received ${String(targetCount)}`);
  }
  if (!Number.isInteger(baseSeed)) {
    throw new Error(`baseSeed must be an integer; received ${String(baseSeed)}`);
  }
  if (!Number.isFinite(mcqFraction) || mcqFraction < 0 || mcqFraction > 1) {
    throw new Error(`mcqFraction must lie in [0, 1]; received ${String(mcqFraction)}`);
  }
  if (targetCount === 0) {
    return [];
  }

  const targetMcqCount = Math.round(targetCount * mcqFraction);
  const candidates: CandidateQuestionInput[] = [];
  const seenStems = new Set<string>();
  const acceptedShingles: Array<ReadonlySet<string>> = [];

  let mcqEmitted = 0;
  let structuredEmitted = 0;

  for (let i = 0; i < targetCount; i += 1) {
    const remainingSlots = targetCount - i;
    const remainingMcqNeeded = targetMcqCount - mcqEmitted;
    const shouldEmitMcq =
      remainingMcqNeeded >= remainingSlots
        ? true
        : remainingMcqNeeded <= 0
          ? false
          : ((i * 13 + 5) % 20) / 20 < mcqFraction;

    const format: QuestionFormat = shouldEmitMcq ? "mcq" : "structured";
    if (format === "mcq") {
      mcqEmitted += 1;
    } else {
      structuredEmitted += 1;
    }

    const baseRegIndex = i % ARCHETYPE_REGISTRATIONS.length;
    const variantInArchetype = Math.floor(i / ARCHETYPE_REGISTRATIONS.length);
    const difficulty = selectDifficulty(i + baseRegIndex * 3);
    const itemSeed = baseSeed + i + 1;
    const seqStr = String(i + 1).padStart(4, "0");
    const fmtSlug = format === "mcq" ? "mcq" : "struct";
    const id = `sp-thermal-${fmtSlug}-${seqStr}`;

    let built: CandidateQuestionInput | null = null;
    for (let attempt = 0; attempt < 96; attempt += 1) {
      const reg = options.syllabiFilter
        ? ARCHETYPE_REGISTRATIONS[
            (baseRegIndex + attempt) % ARCHETYPE_REGISTRATIONS.length
          ]
        : ARCHETYPE_REGISTRATIONS[baseRegIndex];
      const effectiveVariant = variantInArchetype + attempt * 7;
      const syllabi = resolveThermalSyllabi(
        reg.conceptId,
        format,
        difficulty,
        effectiveVariant,
        reg.policy,
        options.syllabiFilter,
      );
      if (syllabi.length === 0) {
        continue;
      }

      const rng = createSeededRandom(
        `${itemSeed}::${reg.templateArchetype}::${attempt}`,
      );
      const trial = reg.build({
        id,
        seed: itemSeed,
        rng,
        variantIndex: effectiveVariant,
        format,
        difficulty,
        syllabi,
        generatorModel,
      });

      if (!trial || seenStems.has(trial.stem)) {
        continue;
      }

      const trialShingles = computeShingleSet(trial.stem);
      if (maxShingleJaccard(trialShingles, acceptedShingles) >= 0.72) {
        continue;
      }

      if (!verifyCandidateWithGate(trial).evaluation.valid) {
        continue;
      }

      built = trial;
      seenStems.add(trial.stem);
      acceptedShingles.push(trialShingles);
      break;
    }

    if (!built) {
      throw new Error(
        `Failed to construct non-colliding thermal candidate at index ${i} (${ARCHETYPE_REGISTRATIONS[baseRegIndex].templateArchetype}, ${format})`,
      );
    }

    candidates.push(built);
  }

  void structuredEmitted;
  return candidates;
}
