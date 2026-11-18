import {
  CrosswalkSyllabusMapping,
  getCompatibleSyllabiForConcept,
  getSubtopicById,
} from "@/lib/constants/syllabi";
import {
  DATA_BOOKLET_CONSTANTS,
  DecayStepInput,
  EnergyLevelInput,
  EnergyLevelsScenarioSpec,
  EnergyLevelsSolution,
  MatterWaveParticleKind,
  MatterWavesScenarioSpec,
  MatterWavesSolution,
  NuclearBindingScenarioSpec,
  NuclearDecayChainScenarioSpec,
  NuclearDecayChainSolution,
  NuclearDecayMode,
  NuclearReactionBindingSolution,
  PhotoelectricPlotMode,
  PhotoelectricScenarioSpec,
  PhotoelectricSolution,
  QuantumNuclearScenarioKind,
  RadioactiveDecayScenarioSpec,
  RadioactiveDecaySolution,
  ReactionSpeciesInput,
  RutherfordScatteringScenarioSpec,
  RutherfordScatteringSolution,
  SingleNuclideBindingSolution,
  solveQuantumNuclearScenario,
  SpecialRelativityScenarioSpec,
  SpecialRelativitySolution,
  TimeUnit,
} from "@/lib/visuals/quantum-nuclear";

import {
  buildOptionEquivalenceKey,
  computeStemFingerprint,
  computeStemSimilarity,
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
  SyllabusId,
  SyllabusTag,
} from "../types";

export interface GenerateQuantumNuclearCandidatesOptions {
  readonly count?: number;
  readonly baseSeed?: number;
  readonly mcqRatio?: number;
  readonly generatorModel?: string;
  readonly nearDuplicateThreshold?: number;
}

export interface QuantumNuclearArchetypeDescriptor {
  readonly conceptId: string;
  readonly templateArchetype: string;
  readonly scenarioKind: QuantumNuclearScenarioKind;
  readonly description: string;
}

export const QUANTUM_NUCLEAR_ARCHETYPE_MANIFEST: readonly QuantumNuclearArchetypeDescriptor[] =
  [
    {
      conceptId: "atomic-spectra-energy-levels",
      templateArchetype: "atomic-vapour-photoionization-spectrum",
      scenarioKind: "energy-levels",
      description:
        "Discrete multi-level atomic vapour excitation, photoionization energy, threshold frequency, and series-limit wavelength",
    },
    {
      conceptId: "atomic-spectra-energy-levels",
      templateArchetype: "bohr-hydrogenic-ion-series-limit",
      scenarioKind: "energy-levels",
      description:
        "Bohr hydrogen and hydrogenic Z^2/n^2 shell ionization energies, frequencies, and continuum wavelengths",
    },
    {
      conceptId: "photoelectric-effect",
      templateArchetype: "photocell-work-function-stopping-potential",
      scenarioKind: "photoelectric-effect",
      description:
        "Monochromatic frequency-driven vacuum photocell threshold frequency, maximum kinetic energy, and stopping potential",
    },
    {
      conceptId: "photoelectric-effect",
      templateArchetype: "uv-wavelength-photoelectron-max-speed",
      scenarioKind: "photoelectric-effect",
      description:
        "UV wavelength-driven photoelectron emission kinetic energy and maximum emitted electron speed",
    },
    {
      conceptId: "wave-particle-duality-de-broglie",
      templateArchetype: "accelerated-beam-de-broglie-wavelength",
      scenarioKind: "matter-waves",
      description:
        "Non-relativistic accelerated electron/proton/alpha and thermal-neutron matter-wave momentum and de Broglie wavelength",
    },
    {
      conceptId: "wave-particle-duality-de-broglie",
      templateArchetype: "graphite-foil-electron-diffraction-rings",
      scenarioKind: "matter-waves",
      description:
        "Polycrystalline crystal-foil electron diffraction de Broglie wavelength, Bragg/grating angle, and phosphor-screen ring radius",
    },
    {
      conceptId: "radioactive-decay-half-life",
      templateArchetype: "background-corrected-integer-half-life-count",
      scenarioKind: "radioactive-decay",
      description:
        "Geiger-Muller count-rate measurements over integer half-lives with explicit background-radiation subtraction",
    },
    {
      conceptId: "radioactive-decay-half-life",
      templateArchetype: "exponential-isotope-activity-time-conversion",
      scenarioKind: "radioactive-decay",
      description:
        "Continuous exponential isotope decay A = lambda N with non-SI half-life time-unit conversions to seconds",
    },
    {
      conceptId: "radioactive-decay-half-life",
      templateArchetype: "actinide-series-alpha-beta-step-counts",
      scenarioKind: "nuclear-decay-chain",
      description:
        "Multi-step heavy-nuclide alpha and beta-minus decay series balancing on N-vs-Z and A-vs-Z stability charts",
    },
    {
      conceptId: "fundamental-particles-quarks-leptons",
      templateArchetype: "quark-level-beta-decay-chain-conservation",
      scenarioKind: "nuclear-decay-chain",
      description:
        "Weak-interaction beta-minus (d -> u) and beta-plus (u -> d) decay sequences with proton/neutron/lepton conservation",
    },
    {
      conceptId: "mass-defect-binding-energy",
      templateArchetype: "single-nuclide-binding-energy-per-nucleon",
      scenarioKind: "nuclear-binding",
      description:
        "Single-nuclide mass defect, total binding energy (931.5 MeV/c^2), and binding energy per nucleon B/A",
    },
    {
      conceptId: "nuclear-fission-fusion",
      templateArchetype: "fission-fusion-reaction-q-value",
      scenarioKind: "nuclear-binding",
      description:
        "Induced thermal-neutron fission and light-nucleus fusion Q-values from rest masses and B/A curves",
    },
    {
      conceptId: "rutherford-scattering-nuclear-radius",
      templateArchetype: "alpha-foil-closest-approach-distance",
      scenarioKind: "rutherford-scattering",
      description:
        "Head-on electrostatic Coulomb recoil turning point and closest-approach distance in heavy-metal foil scattering",
    },
    {
      conceptId: "rutherford-scattering-nuclear-radius",
      templateArchetype: "fermi-nuclear-radius-and-density",
      scenarioKind: "rutherford-scattering",
      description:
        "Empirical Fermi nuclear radius R = R_0 A^(1/3) and A-independent nuclear matter density",
    },
    {
      conceptId: "special-relativity-spacetime",
      templateArchetype: "muon-spacecraft-time-dilation-length-contraction",
      scenarioKind: "special-relativity",
      description:
        "Relativistic Lorentz factor, proper time dilation, and proper length contraction for muons and spacecraft",
    },
    {
      conceptId: "special-relativity-spacetime",
      templateArchetype: "minkowski-worldline-velocity-addition",
      scenarioKind: "special-relativity",
      description:
        "Minkowski spacetime primed-axis tilt angle and 1D relativistic velocity transformation",
    },
  ] as const;

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  "-": "⁻",
  "+": "⁺",
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
  return [...String(exp)].map((c) => SUPERSCRIPT_DIGITS[c] ?? c).join("");
}

function hashSeedInt(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h === 0 ? 0x6d2b79f5 : h;
}

function createPrng(seed: number | string): () => number {
  let state = hashSeedInt(String(seed));
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function formatQuantity3sf(
  value: number,
  unit = "",
  exactInteger = false,
): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite quantity cannot be formatted: ${String(value)}`);
  }
  if (exactInteger) {
    const rounded = Math.round(value);
    const signStr = rounded < 0 ? "−" : "";
    const numPart = `${signStr}${Math.abs(rounded)}`;
    return unit ? `${numPart} ${unit}` : numPart;
  }
  if (Math.abs(value) < 1e-15) {
    return unit ? `0.00 ${unit}` : "0.00";
  }
  const sign = value < 0 ? "−" : "";
  const absVal = Math.abs(value);
  let numStr: string;
  if (absVal >= 0.01 && absVal < 1000) {
    const prec = absVal.toPrecision(3);
    if (!prec.includes("e")) {
      numStr = `${sign}${prec}`;
    } else {
      const [mantissa, expRaw] = absVal.toExponential(2).split("e");
      numStr = `${sign}${mantissa} × 10${toSup(Number(expRaw))}`;
    }
  } else {
    const [mantissa, expRaw] = absVal.toExponential(2).split("e");
    numStr = `${sign}${mantissa} × 10${toSup(Number(expRaw))}`;
  }
  return unit ? `${numStr} ${unit}` : numStr;
}

function formatExactGiven(value: number, unit = ""): string {
  if (Math.abs(value) === 0) {
    return unit ? `0 ${unit}` : "0";
  }
  const sign = value < 0 ? "−" : "";
  const absVal = Math.abs(value);
  let numStr: string;
  if (absVal >= 1e-3 && absVal < 100_000) {
    numStr = `${sign}${String(Number(absVal.toPrecision(7)))}`;
  } else {
    const [mantissa, expRaw] = absVal.toExponential(2).split("e");
    const cleanMantissa = mantissa.replace(/(\.\d*?[1-9])0+$/, "$1");
    numStr = `${sign}${cleanMantissa} × 10${toSup(Number(expRaw))}`;
  }
  return unit ? `${numStr} ${unit}` : numStr;
}

interface SyllabusTagPolicy {
  readonly format: QuestionFormat;
  readonly ibLevelOverride?: "SL" | "HL" | "exclude";
  readonly alevelLevelOverride?: "Y12" | "Y13" | "exclude";
  readonly ncukLevelOverride?: "IFY-S2" | "exclude";
  readonly excludeOptionTopics?: boolean;
  readonly preferredSubtopicBySyllabus?: Partial<Record<SyllabusId, string>>;
}

function resolveSyllabusTagsFromCrosswalk(
  conceptId: string,
  policy: SyllabusTagPolicy,
): SyllabusTag[] {
  const compatible: CrosswalkSyllabusMapping[] = getCompatibleSyllabiForConcept(
    conceptId,
    {
      format: policy.format,
      excludeOptionTopics: policy.excludeOptionTopics ?? false,
    },
  );

  const tags: SyllabusTag[] = [];
  for (const mapping of compatible) {
    let targetLevel: string | undefined;
    if (mapping.syllabus === "ib") {
      if (policy.ibLevelOverride === "exclude") continue;
      if (policy.ibLevelOverride && mapping.levels.includes(policy.ibLevelOverride)) {
        targetLevel = policy.ibLevelOverride;
      } else if (mapping.levels.includes("SL")) {
        targetLevel = "SL";
      } else if (mapping.levels.includes("HL")) {
        targetLevel = "HL";
      }
    } else if (mapping.syllabus === "alevel") {
      if (policy.alevelLevelOverride === "exclude") continue;
      if (
        policy.alevelLevelOverride &&
        mapping.levels.includes(policy.alevelLevelOverride)
      ) {
        targetLevel = policy.alevelLevelOverride;
      } else if (mapping.levels.includes("Y12")) {
        targetLevel = "Y12";
      } else if (mapping.levels.includes("Y13")) {
        targetLevel = "Y13";
      }
    } else if (mapping.syllabus === "ncuk") {
      if (policy.ncukLevelOverride === "exclude") continue;
      const desired = policy.ncukLevelOverride ?? "IFY-S2";
      if (mapping.levels.includes(desired)) {
        targetLevel = desired;
      } else if (mapping.levels.includes("IFY")) {
        targetLevel = "IFY";
      }
    }

    if (!targetLevel) continue;

    const preferredSubId = policy.preferredSubtopicBySyllabus?.[mapping.syllabus];
    const matchingSubtopicIds = mapping.subtopicIds.filter((subId) => {
      const sub = getSubtopicById(subId);
      if (!sub) return false;
      return (
        sub.levelsCovered.includes(targetLevel as never) &&
        sub.questionFormats.includes(policy.format)
      );
    });

    const chosenSubtopicId =
      preferredSubtopicIdOrFirst(preferredSubId, matchingSubtopicIds) ??
      mapping.subtopicIds[0];
    const subSpec = chosenSubtopicId
      ? getSubtopicById(chosenSubtopicId)
      : undefined;
    const chosenTopicId =
      (subSpec
        ? mapping.topicIds.find((tid) => chosenSubtopicId.startsWith(tid.replace(/-sec\d+-.*$/, "")))
        : undefined) ?? mapping.topicIds[0];

    // Resolve exact parent topicId from mapping.topicIds whose subtopics include chosenSubtopicId
    const exactTopicId = resolveParentTopicId(mapping, chosenSubtopicId) ?? chosenTopicId;

    tags.push({
      syllabus: mapping.syllabus,
      level: targetLevel,
      topicId: exactTopicId,
      ...(chosenSubtopicId ? { subtopicId: chosenSubtopicId } : {}),
    });
  }

  if (tags.length === 0) {
    throw new Error(
      `No compatible syllabus tags resolved for concept "${conceptId}" (${policy.format})`,
    );
  }
  return tags;
}

function preferredSubtopicIdOrFirst(
  preferred: string | undefined,
  candidates: readonly string[],
): string | undefined {
  if (preferred && candidates.includes(preferred)) {
    return preferred;
  }
  return candidates[0];
}

function resolveParentTopicId(
  mapping: CrosswalkSyllabusMapping,
  subtopicId: string | undefined,
): string | undefined {
  if (!subtopicId || mapping.topicIds.length <= 1) {
    return mapping.topicIds[0];
  }
  if (subtopicId.startsWith("ncuk-ac8")) return "ncuk-ac8";
  if (subtopicId.startsWith("ncuk-ac7")) return "ncuk-ac7";
  if (subtopicId.startsWith("ncuk-ac5")) return "ncuk-ac5";
  if (subtopicId.startsWith("alevel-3-12")) return "alevel-options-9-13";
  if (subtopicId.startsWith("alevel-3-2")) return "alevel-sec2-particles-radiation";
  if (subtopicId.startsWith("alevel-3-8")) return "alevel-sec8-nuclear-physics";
  return mapping.topicIds[0];
}

interface RawDistractorCandidate {
  readonly value: number;
  readonly rationale: string;
}

function buildDistinctMcqOptions(params: {
  truth: number;
  unit: string;
  exactInteger?: boolean;
  distractors: readonly RawDistractorCandidate[];
  fallbackDistractors: readonly RawDistractorCandidate[];
  correctSlot: 0 | 1 | 2 | 3;
}): McqOptionItem[] {
  const {
    truth,
    unit,
    exactInteger = false,
    distractors,
    fallbackDistractors,
    correctSlot,
  } = params;

  const correctText = formatQuantity3sf(truth, unit, exactInteger);
  const usedEquivKeys = new Set<string>([buildOptionEquivalenceKey(correctText)]);
  const usedTexts = new Set<string>([correctText.toLowerCase()]);
  const acceptedValues: number[] = [truth];
  const chosenDistractors: Array<{ text: string; rationale: string }> = [];

  const pool = [...distractors, ...fallbackDistractors];
  for (const cand of pool) {
    if (chosenDistractors.length >= 3) break;
    if (!Number.isFinite(cand.value)) continue;
    if (!exactInteger && truth > 0 && cand.value <= 0) continue;

    const candidateVal = exactInteger ? Math.round(cand.value) : cand.value;
    const collidesNumerically = acceptedValues.some((existing) =>
      exactInteger
        ? Math.round(existing) === candidateVal
        : numbersAgreeWithinTolerance(candidateVal, existing, {
            significantFigures: 3,
            relativeTolerance: 0.014,
            absoluteZeroTolerance: 1e-30,
          }),
    );
    if (collidesNumerically) continue;

    const text = formatQuantity3sf(candidateVal, unit, exactInteger);
    const equivKey = buildOptionEquivalenceKey(text);
    if (usedEquivKeys.has(equivKey) || usedTexts.has(text.toLowerCase())) {
      continue;
    }

    usedEquivKeys.add(equivKey);
    usedTexts.add(text.toLowerCase());
    acceptedValues.push(candidateVal);
    chosenDistractors.push({
      text,
      rationale: cand.rationale,
    });
  }

  // Deterministic geometric/integer Emergency Padding if needed so 4 distinct options ALWAYS exist
  const emergencyMultipliers = [0.37, 1.68, 2.45, 0.21, 3.35, 0.58];
  let emIdx = 0;
  while (chosenDistractors.length < 3 && emIdx < emergencyMultipliers.length) {
    const mult = emergencyMultipliers[emIdx];
    emIdx += 1;
    const val = exactInteger
      ? truth + (emIdx % 2 === 0 ? emIdx + 2 : -(emIdx + 2))
      : truth * mult;
    if (!exactInteger && truth > 0 && val <= 0) continue;
    const collides = acceptedValues.some((existing) =>
      exactInteger
        ? Math.round(existing) === Math.round(val)
        : numbersAgreeWithinTolerance(val, existing, {
            significantFigures: 3,
            relativeTolerance: 0.014,
            absoluteZeroTolerance: 1e-30,
          }),
    );
    if (collides) continue;
    const text = formatQuantity3sf(val, unit, exactInteger);
    const equivKey = buildOptionEquivalenceKey(text);
    if (usedEquivKeys.has(equivKey)) continue;
    usedEquivKeys.add(equivKey);
    acceptedValues.push(val);
    chosenDistractors.push({
      text,
      rationale: exactInteger
        ? "Applies an incorrect nucleon/charge change per decay step when balancing the chain."
        : "Applies an inconsistent power-of-two or unit-conversion factor in the governing relation.",
    });
  }

  const options: McqOptionItem[] = [];
  let dCursor = 0;
  for (let i = 0; i < 4; i += 1) {
    const label = MCQ_OPTION_LABELS[i];
    if (i === correctSlot) {
      options.push({
        label,
        text: correctText,
        isCorrect: true,
      });
    } else {
      const d = chosenDistractors[dCursor];
      dCursor += 1;
      options.push({
        label,
        text: d.text,
        isCorrect: false,
        distractorRationale: d.rationale,
      });
    }
  }
  return options;
}

function buildStructuredBundle(
  subparts: ReadonlyArray<{
    partId: string;
    prompt: string;
    marks: 1 | 2 | 3;
    dependsOnPartIds?: string[];
    targetQuantityKey: string;
    truth: number;
    unit: string;
    exactInteger?: boolean;
    methodCriterion: string;
    extraMethodCriterion?: string;
    workingSteps: string[];
  }>,
): {
  parts: StructuredQuestionPart[];
  markScheme: MarkSchemePoint[];
  workedSolution: string;
  totalMarks: number;
} {
  const parts: StructuredQuestionPart[] = [];
  const markScheme: MarkSchemePoint[] = [];
  const solutionSegments: string[] = [];
  let totalMarks = 0;

  for (const sp of subparts) {
    const formattedAns = formatQuantity3sf(
      sp.truth,
      sp.unit,
      sp.exactInteger ?? false,
    );
    parts.push({
      partId: sp.partId,
      prompt: sp.prompt,
      marks: sp.marks,
      ...(sp.dependsOnPartIds ? { dependsOnPartIds: sp.dependsOnPartIds } : {}),
      targetQuantityKey: sp.targetQuantityKey,
      expectedAnswer: formattedAns,
      workingSteps: sp.workingSteps,
    });

    if (sp.marks === 1) {
      markScheme.push({
        code: "A1",
        partId: sp.partId,
        criterion: `${sp.methodCriterion} to obtain ${formattedAns}.`,
        marks: 1,
      });
    } else if (sp.marks === 2) {
      markScheme.push(
        {
          code: "M1",
          partId: sp.partId,
          criterion: sp.methodCriterion,
          marks: 1,
        },
        {
          code: "A1",
          partId: sp.partId,
          criterion: `Evaluates correctly to ${formattedAns}.`,
          marks: 1,
        },
      );
    } else {
      markScheme.push(
        {
          code: "M1",
          partId: sp.partId,
          criterion: sp.methodCriterion,
          marks: 1,
        },
        {
          code: "M1",
          partId: sp.partId,
          criterion:
            sp.extraMethodCriterion ??
            "Substitutes converted SI quantities into the governing equation.",
          marks: 1,
        },
        {
          code: "A1",
          partId: sp.partId,
          criterion: `Obtains ${formattedAns}.`,
          marks: 1,
        },
      );
    }

    totalMarks += sp.marks;
    solutionSegments.push(
      `(${sp.partId}) ${sp.workingSteps.join(" ")} Final answer: ${formattedAns}.`,
    );
  }

  return {
    parts,
    markScheme,
    workedSolution: solutionSegments.join(" "),
    totalMarks,
  };
}

function chooseDifficulty(index: number): QuestionDifficulty {
  const m = index % 4;
  if (m === 0) return "foundation";
  if (m === 3) return "higher";
  return "standard";
}

// ============================================================================
// ARCHETYPE 1: atomic-spectra-energy-levels :: atomic-vapour-photoionization-spectrum
// ============================================================================

interface CustomAtomPreset {
  readonly name: string;
  readonly lampContext: string;
  readonly groundEv: number;
  readonly e1Ev: number;
  readonly e2Ev: number;
  readonly e3Ev: number;
}

const CUSTOM_ATOM_PRESETS: readonly CustomAtomPreset[] = [
  {
    name: "Mercury vapour",
    lampContext: "a low-pressure mercury UV calibration lamp",
    groundEv: -10.44,
    e1Ev: -5.54,
    e2Ev: -3.72,
    e3Ev: -1.58,
  },
  {
    name: "Sodium vapour",
    lampContext: "a monochromatic sodium street-lighting discharge cell",
    groundEv: -5.14,
    e1Ev: -3.03,
    e2Ev: -1.95,
    e3Ev: -1.39,
  },
  {
    name: "Neon gas",
    lampContext: "a cold-cathode neon spectroscopy tube",
    groundEv: -21.56,
    e1Ev: -4.92,
    e2Ev: -3.08,
    e3Ev: -1.84,
  },
  {
    name: "Caesium vapour",
    lampContext: "an optical-pumping caesium atomic-clock cell",
    groundEv: -3.89,
    e1Ev: -2.47,
    e2Ev: -1.60,
    e3Ev: -1.09,
  },
  {
    name: "Rubidium vapour",
    lampContext: "a laser-cooled rubidium magnetometry cell",
    groundEv: -4.18,
    e1Ev: -2.59,
    e2Ev: -1.68,
    e3Ev: -1.14,
  },
  {
    name: "Helium gas",
    lampContext: "a stellar chromosphere helium absorption cell",
    groundEv: -24.59,
    e1Ev: -4.77,
    e2Ev: -3.37,
    e3Ev: -1.87,
  },
  {
    name: "Argon gas",
    lampContext: "an inductively coupled argon plasma spectrometer",
    groundEv: -15.76,
    e1Ev: -4.21,
    e2Ev: -2.61,
    e3Ev: -1.49,
  },
  {
    name: "Potassium vapour",
    lampContext: "a heated alkali-metal potassium absorption cell",
    groundEv: -4.34,
    e1Ev: -2.73,
    e2Ev: -1.73,
    e3Ev: -1.26,
  },
  {
    name: "Lithium vapour",
    lampContext: "a hollow-cathode lithium emission source",
    groundEv: -5.39,
    e1Ev: -3.54,
    e2Ev: -2.02,
    e3Ev: -1.51,
  },
  {
    name: "Krypton gas",
    lampContext: "an interferometric krypton discharge tube",
    groundEv: -14.00,
    e1Ev: -4.09,
    e2Ev: -2.54,
    e3Ev: -1.44,
  },
  {
    name: "Calcium vapour",
    lampContext: "an astrophysical Fraunhofer-line calcium oven",
    groundEv: -6.11,
    e1Ev: -4.22,
    e2Ev: -3.18,
    e3Ev: -1.89,
  },
  {
    name: "Barium vapour",
    lampContext: "a flame-emission barium spectroscopy burner",
    groundEv: -5.21,
    e1Ev: -3.57,
    e2Ev: -2.35,
    e3Ev: -1.42,
  },
];

function buildArchetype1Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch1:${seed}:${variantIdx}`);
  const preset = CUSTOM_ATOM_PRESETS[variantIdx % CUSTOM_ATOM_PRESETS.length];
  const jitter = ((variantIdx * 7) % 9 - 4) * 0.03;
  const gEv = Number((preset.groundEv + jitter).toFixed(2));
  const e1Ev = Number((preset.e1Ev + jitter * 0.5).toFixed(2));
  const e2Ev = Number((preset.e2Ev + jitter * 0.3).toFixed(2));
  const e3Ev = Number((preset.e3Ev).toFixed(2));

  const stateChoices = [
    { id: "g", name: "the ground level", ev: gEv, adjEv: e1Ev },
    { id: "e1", name: "the first excited state", ev: e1Ev, adjEv: gEv },
    { id: "e2", name: "the second excited state", ev: e2Ev, adjEv: e1Ev },
  ] as const;
  const startState = stateChoices[variantIdx % stateChoices.length];

  const levels: EnergyLevelInput[] = [
    { id: "g", label: "ground", energyValue: gEv, energyUnit: "eV" },
    { id: "e1", label: "first excited", energyValue: e1Ev, energyUnit: "eV" },
    { id: "e2", label: "second excited", energyValue: e2Ev, energyUnit: "eV" },
    { id: "e3", label: "third excited", energyValue: e3Ev, energyUnit: "eV" },
    { id: "ion", label: "continuum", energyValue: 0, energyUnit: "eV" },
  ];

  const isAbsorption = variantIdx % 3 === 1;
  const spec: EnergyLevelsScenarioSpec = {
    kind: "energy-levels",
    atomModel: "custom",
    atomName: preset.name,
    levels,
    initialBoundLevelId: startState.id,
    continuumEnergyEv: 0,
    showSpectralStrip: true,
    spectralStripMode: isAbsorption ? "absorption" : "emission",
    transitions: isAbsorption
      ? [
          { id: "t1", fromLevelId: "g", toLevelId: "e1", label: "T₁" },
          { id: "t2", fromLevelId: startState.id, toLevelId: "ion", label: "T₂" },
        ]
      : [
          { id: "t1", fromLevelId: "e3", toLevelId: "e1", label: "T₁" },
          { id: "t2", fromLevelId: "e2", toLevelId: "g", label: "T₂" },
          { id: "t3", fromLevelId: "e1", toLevelId: "g", label: "T₃" },
        ],
  };

  const sol = solveQuantumNuclearScenario(spec) as EnergyLevelsSolution;
  const hiddenQuantities = [
    "ionizationEnergyEv",
    "ionizationEnergyJ",
    "ionizationFrequencyHz",
    "ionizationWavelengthM",
    "ionizationWavelengthNm",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "initialLevelEnergyEv", value: startState.ev, unit: "eV", source: "stem" },
    { name: "adjacentLevelEnergyEv", value: startState.adjEv, unit: "eV", source: "stem" },
    { name: "planckConstantJs", value: 6.63e-34, unit: "J s", source: "stem" },
  ];

  const syllabi = resolveSyllabusTagsFromCrosswalk("atomic-spectra-energy-levels", {
    format,
    ibLevelOverride: "SL",
    alevelLevelOverride: "Y12",
    ncukLevelOverride: "IFY-S2",
    preferredSubtopicBySyllabus: { ncuk: "ncuk-ac8-1" },
  });
  const difficulty = chooseDifficulty(variantIdx);
  const { planckConstantJs: h, speedOfLightMs: c, elementaryChargeC: e } =
    DATA_BOOKLET_CONSTANTS;

  const targetModeIdx = variantIdx % 3;
  const stemFrames = [
    `Inside ${preset.lampContext}, discrete electronic levels of ${preset.name.toLowerCase()} include ${startState.name} at ${formatExactGiven(startState.ev, "eV")} and an adjacent bound level at ${formatExactGiven(startState.adjEv, "eV")} relative to the zero-energy ionization continuum. Take h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, and e = 1.60 × 10⁻¹⁹ C.`,
    `Spectroscopic analysis of ${preset.name.toLowerCase()} in ${preset.lampContext} places ${startState.name} at ${formatExactGiven(startState.ev, "eV")} and a neighbouring bound state at ${formatExactGiven(startState.adjEv, "eV")}, taking free electrons at rest to have zero energy. Use h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, and e = 1.60 × 10⁻¹⁹ C.`,
    `The energy-level diagram illustrates radiative transitions in ${preset.name.toLowerCase()} within ${preset.lampContext}. An atom initially occupies ${startState.name} at energy ${formatExactGiven(startState.ev, "eV")} (with a nearby level at ${formatExactGiven(startState.adjEv, "eV")} and ionization at zero eV). Take h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, and e = 1.60 × 10⁻¹⁹ C.`,
    `During an optical spectroscopy run on ${preset.lampContext}, ${preset.name.toLowerCase()} atoms populate ${startState.name} at ${formatExactGiven(startState.ev, "eV")}, alongside a bound state at ${formatExactGiven(startState.adjEv, "eV")} below the zero-eV continuum limit. Constants: h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, e = 1.60 × 10⁻¹⁹ C.`,
    `A vapour cell in ${preset.lampContext} contains ${preset.name.toLowerCase()} whose ${startState.name} lies at ${formatExactGiven(startState.ev, "eV")} and whose adjacent bound level lies at ${formatExactGiven(startState.adjEv, "eV")} relative to the continuum threshold. Assume h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, and e = 1.60 × 10⁻¹⁹ C.`,
  ];
  const baseContext = stemFrames[variantIdx % stemFrames.length];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Determine the photoionization threshold parameter from discrete atomic energy levels using photon energy quantization",
      distractorStrategy: [
        "omit-electronvolt-to-joule-charge-conversion",
        "select-adjacent-bound-level-transition-gap",
        "invert-planck-wavelength-energy-relation",
      ],
      assumptions: [
        "Continuum ionization limit corresponds to zero electron kinetic energy",
      ],
    };

    if (targetModeIdx === 0) {
      const stem = `${baseContext} What is the longest wavelength of electromagnetic radiation capable of ionizing an atom directly from ${startState.name}?`;
      const adjWlNm = ((h * c) / (Math.abs(startState.adjEv) * e)) * 1e9;
      const gapWlNm =
        ((h * c) / (Math.abs(startState.ev - startState.adjEv) * e)) * 1e9;
      const noEvConvNm = ((h * c) / Math.abs(startState.ev)) * 1e9;
      const options = buildDistinctMcqOptions({
        truth: sol.ionizationWavelengthNm,
        unit: "nm",
        correctSlot: slot,
        distractors: [
          {
            value: adjWlNm,
            rationale:
              "Computes the continuum threshold wavelength from the neighbouring bound level instead of the stated initial level.",
          },
          {
            value: gapWlNm,
            rationale:
              "Uses the bound-to-bound energy difference between the two quoted levels instead of the energy required to reach the continuum.",
          },
          {
            value: sol.ionizationWavelengthNm / 1.6,
            rationale:
              "Divides by 1.60 instead of multiplying by e = 1.60 × 10⁻¹⁹ C during the electron-volt conversion.",
          },
        ],
        fallbackDistractors: [
          {
            value: noEvConvNm,
            rationale:
              "Omits the e = 1.60 × 10⁻¹⁹ J eV⁻¹ conversion factor in λ = hc / ΔE.",
          },
        ],
      });
      const ansText = formatQuantity3sf(sol.ionizationWavelengthNm, "nm");
      return {
        id,
        conceptId: "atomic-spectra-energy-levels",
        templateArchetype: "atomic-vapour-photoionization-spectrum",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: plan,
        targetQuantityKey: "ionizationWavelengthNm",
        stem,
        options,
        workedSolution: `Ionization from ${startState.name} requires ΔE = 0 − (${formatExactGiven(startState.ev)}) = ${formatQuantity3sf(sol.ionizationEnergyEv, "eV")} = ${formatQuantity3sf(sol.ionizationEnergyJ, "J")}. Maximum wavelength λ = hc / ΔE = (6.63 × 10⁻³⁴ × 3.00 × 10⁸) / ${formatQuantity3sf(sol.ionizationEnergyJ)} = ${ansText}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Converts ΔE = ${formatQuantity3sf(sol.ionizationEnergyEv, "eV")} to joules and applies λ = hc / ΔE to obtain ${ansText} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (targetModeIdx === 1) {
      const stem = `${baseContext} What minimum photon frequency is required to ionize the atom from ${startState.name}?`;
      const adjFreq = (Math.abs(startState.adjEv) * e) / h;
      const gapFreq = (Math.abs(startState.ev - startState.adjEv) * e) / h;
      const noEvFreq = Math.abs(startState.ev) / h;
      const options = buildDistinctMcqOptions({
        truth: sol.ionizationFrequencyHz,
        unit: "Hz",
        correctSlot: slot,
        distractors: [
          {
            value: noEvFreq,
            rationale:
              "Divides the energy in eV directly by Planck's constant h without multiplying by 1.60 × 10⁻¹⁹ J eV⁻¹.",
          },
          {
            value: adjFreq,
            rationale:
              "Calculates the ionization frequency from the neighbouring bound level rather than the initial level.",
          },
          {
            value: gapFreq,
            rationale:
              "Calculates the transition frequency between the two bound levels rather than to the continuum.",
          },
        ],
        fallbackDistractors: [
          {
            value: sol.ionizationFrequencyHz / c,
            rationale:
              "Divides ΔE by hc instead of h, computing wavenumber 1/λ instead of frequency f.",
          },
        ],
      });
      const ansText = formatQuantity3sf(sol.ionizationFrequencyHz, "Hz");
      return {
        id,
        conceptId: "atomic-spectra-energy-levels",
        templateArchetype: "atomic-vapour-photoionization-spectrum",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: plan,
        targetQuantityKey: "ionizationFrequencyHz",
        stem,
        options,
        workedSolution: `Energy needed to reach the continuum is ΔE = ${formatQuantity3sf(sol.ionizationEnergyEv, "eV")} = ${formatQuantity3sf(sol.ionizationEnergyJ, "J")}. Threshold frequency f = ΔE / h = ${formatQuantity3sf(sol.ionizationEnergyJ)} / (6.63 × 10⁻³⁴) = ${ansText}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses f = |E| e / h to obtain ${ansText} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${baseContext} How much energy, in electron-volts (eV), is required to ionize a single atom from ${startState.name}?`;
    const options = buildDistinctMcqOptions({
      truth: sol.ionizationEnergyEv,
      unit: "eV",
      correctSlot: slot,
      distractors: [
        {
          value: Math.abs(startState.adjEv),
          rationale:
            "Uses the binding energy of the neighbouring bound level rather than the stated initial level.",
        },
        {
          value: Math.abs(startState.ev - startState.adjEv),
          rationale:
            "Computes the excitation energy between the two bound levels instead of the ionization energy to the continuum.",
        },
        {
          value: Math.abs(startState.ev) + Math.abs(startState.adjEv),
          rationale:
            "Sums the magnitudes of both bound-level energies instead of subtracting the initial level from 0 eV.",
        },
      ],
      fallbackDistractors: [
        {
          value: sol.ionizationEnergyEv * 0.5,
          rationale:
            "Halves the bound-state energy as if applying the classical virial kinetic-energy relation.",
        },
      ],
    });
    const ansText = formatQuantity3sf(sol.ionizationEnergyEv, "eV");
    return {
      id,
      conceptId: "atomic-spectra-energy-levels",
      templateArchetype: "atomic-vapour-photoionization-spectrum",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: plan,
      targetQuantityKey: "ionizationEnergyEv",
      stem,
      options,
      workedSolution: `Ionization energy from ${startState.name} to the continuum is ΔE = 0 − (${formatExactGiven(startState.ev)}) = ${ansText}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates ΔE = 0 − (${formatExactGiven(startState.ev)}) = ${ansText} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2
  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `State the minimum energy, in eV, needed to ionize an atom of ${preset.name.toLowerCase()} from ${startState.name}.`,
      marks: 1,
      targetQuantityKey: "ionizationEnergyEv",
      truth: sol.ionizationEnergyEv,
      unit: "eV",
      methodCriterion: "Finds ΔE = 0 − E_initial in eV",
      workingSteps: [
        `ΔE = 0 − (${formatExactGiven(startState.ev)}) = ${formatQuantity3sf(sol.ionizationEnergyEv, "eV")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the threshold photon frequency required for this photoionization transition.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "ionizationFrequencyHz",
      truth: sol.ionizationFrequencyHz,
      unit: "Hz",
      methodCriterion: "Converts ΔE to joules (× 1.60 × 10⁻¹⁹) and applies f = ΔE / h.",
      workingSteps: [
        `ΔE = ${formatQuantity3sf(sol.ionizationEnergyEv)} × 1.60 × 10⁻¹⁹ = ${formatQuantity3sf(sol.ionizationEnergyJ, "J")}.`,
        `f = ΔE / h = ${formatQuantity3sf(sol.ionizationEnergyJ)} / (6.63 × 10⁻³⁴) = ${formatQuantity3sf(sol.ionizationFrequencyHz, "Hz")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Calculate the corresponding series-limit wavelength, in nm, of the ionizing radiation.`,
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "ionizationWavelengthNm",
      truth: sol.ionizationWavelengthNm,
      unit: "nm",
      methodCriterion: "Uses λ = c / f (or hc / ΔE) and converts metres to nanometres.",
      workingSteps: [
        `λ = c / f = (3.00 × 10⁸) / (${formatQuantity3sf(sol.ionizationFrequencyHz)}) = ${formatQuantity3sf(sol.ionizationWavelengthM, "m")}.`,
        `Converting to nanometres gives λ = ${formatQuantity3sf(sol.ionizationWavelengthNm, "nm")}.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "atomic-spectra-energy-levels",
    templateArchetype: "atomic-vapour-photoionization-spectrum",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Guide candidate from discrete bound-state energy to joule conversion, ionization frequency, and series-limit wavelength",
      subpartStrategy: [
        "convert-bound-state-ionization-energy-to-joules",
        "compute-threshold-frequency-via-planck-relation",
        "compute-series-limit-wavelength-in-nanometres",
      ],
    },
    stem: baseContext,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 2: atomic-spectra-energy-levels :: bohr-hydrogenic-ion-series-limit
// ============================================================================

interface HydrogenicSpecies {
  readonly z: number;
  readonly symbolLabel: string;
  readonly astroContext: string;
}

const HYDROGENIC_SPECIES: readonly HydrogenicSpecies[] = [
  { z: 1, symbolLabel: "atomic hydrogen (Z = 1)", astroContext: "an H II emission nebula" },
  { z: 2, symbolLabel: "singly ionized helium He⁺ (Z = 2)", astroContext: "a hot Wolf-Rayet stellar wind" },
  { z: 3, symbolLabel: "doubly ionized lithium Li²⁺ (Z = 3)", astroContext: "a magnetic-confinement tokamak divertor plasma" },
  { z: 4, symbolLabel: "triply ionized beryllium Be³⁺ (Z = 4)", astroContext: "a fusion first-wall diagnostic beam" },
  { z: 5, symbolLabel: "four-times ionized boron B⁴⁺ (Z = 5)", astroContext: "a laser-produced ablation plasma plume" },
  { z: 6, symbolLabel: "five-times ionized carbon C⁵⁺ (Z = 6)", astroContext: "an X-ray binary accretion-disc corona" },
  { z: 7, symbolLabel: "six-times ionized nitrogen N⁶⁺ (Z = 7)", astroContext: "a solar-flare coronal magnetic loop" },
  { z: 8, symbolLabel: "seven-times ionized oxygen O⁷⁺ (Z = 8)", astroContext: "a young supernova-remnant shock front" },
  { z: 2, symbolLabel: "hydrogenic helium He⁺ (Z = 2)", astroContext: "a solar prominence EUV grating spectrometer" },
  { z: 1, symbolLabel: "neutral deuterium D (Z = 1)", astroContext: "a quasar damped Lyman-limit absorption cloud" },
  { z: 3, symbolLabel: "hydrogen-like lithium Li²⁺ (Z = 3)", astroContext: "a helical stellarator edge-pedestal plasma" },
  { z: 4, symbolLabel: "single-electron beryllium Be³⁺ (Z = 4)", astroContext: "an electron-beam ion-trap (EBIT) X-ray source" },
  { z: 6, symbolLabel: "hydrogenic carbon C⁵⁺ (Z = 6)", astroContext: "an inertial-confinement hohlraum diagnostic channel" },
];

function buildArchetype2Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch2:${seed}:${variantIdx}`);
  const ion = HYDROGENIC_SPECIES[variantIdx % HYDROGENIC_SPECIES.length];
  const shellOptions = [
    { n: 1, shellWord: "principal shell n = 1", maxN: 4 },
    { n: 2, shellWord: "excited shell n = 2", maxN: 5 },
    { n: 3, shellWord: "excited shell n = 3", maxN: 5 },
    { n: 4, shellWord: "excited shell n = 4", maxN: 6 },
    { n: 5, shellWord: "outer bound shell n = 5", maxN: 6 },
  ] as const;
  const shellIdx =
    (variantIdx * 2 + Math.floor(variantIdx / HYDROGENIC_SPECIES.length)) %
    shellOptions.length;
  const chosenShell = shellOptions[shellIdx];

  const spec: EnergyLevelsScenarioSpec = {
    kind: "energy-levels",
    atomModel: "bohr-hydrogen",
    atomicNumberZ: ion.z,
    maxPrincipalN: chosenShell.maxN,
    initialBoundLevelId: `n=${chosenShell.n}`,
    includeContinuumZero: true,
    showSpectralStrip: true,
    transitions: [
      {
        id: "t1",
        fromLevelId: `n=${chosenShell.maxN}`,
        toLevelId: `n=${chosenShell.n}`,
        label: "T₁",
      },
      {
        id: "t2",
        fromLevelId: `n=${chosenShell.n}`,
        toLevelId: "n=inf",
        label: "T₂",
      },
    ],
  };

  const sol = solveQuantumNuclearScenario(spec) as EnergyLevelsSolution;
  const hiddenQuantities = [
    "groundStateEnergyEv",
    "groundStateEnergyJ",
    "ionizationEnergyEv",
    "ionizationEnergyJ",
    "ionizationFrequencyHz",
    "ionizationWavelengthM",
    "ionizationWavelengthNm",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "atomicNumberZ", value: ion.z, source: "stem" },
    { name: "principalQuantumNumber", value: chosenShell.n, source: "stem" },
    { name: "bohrConstantEv", value: 13.6, unit: "eV", source: "stem" },
    { name: "planckConstantJs", value: 6.63e-34, unit: "J s", source: "stem" },
  ];

  const syllabi = resolveSyllabusTagsFromCrosswalk("atomic-spectra-energy-levels", {
    format,
    ibLevelOverride: "HL",
    alevelLevelOverride: "Y12",
    ncukLevelOverride: "IFY-S2",
    preferredSubtopicBySyllabus: { ncuk: "ncuk-ac8-1" },
  });
  const difficulty = chooseDifficulty(variantIdx);
  const { planckConstantJs: h, speedOfLightMs: c, elementaryChargeC: e } =
    DATA_BOOKLET_CONSTANTS;

  const frames = [
    `In ${ion.astroContext}, ${ion.symbolLabel} obeys the Bohr hydrogenic energy relation Eₙ = −13.6 Z² / n² eV. An electron currently occupies ${chosenShell.shellWord}. Take h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, and e = 1.60 × 10⁻¹⁹ C.`,
    `Spectra recorded from ${ion.astroContext} show ${ion.symbolLabel} whose bound levels follow Eₙ = −13.6 Z² / n² eV relative to the ionization continuum. Consider ions prepared in ${chosenShell.shellWord} (with h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, e = 1.60 × 10⁻¹⁹ C).`,
    `A single-electron ion of ${ion.symbolLabel} in ${ion.astroContext} has quantized shell energies given by Eₙ = −13.6 Z² / n² eV. Suppose the ion starts in ${chosenShell.shellWord}; take h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, and e = 1.60 × 10⁻¹⁹ C.`,
    `High-resolution UV/X-ray grating data from ${ion.astroContext} probe ${ion.symbolLabel}, modelled by Eₙ = −13.6 Z² / n² eV. For an ion initially in ${chosenShell.shellWord}, use h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, and e = 1.60 × 10⁻¹⁹ C.`,
    `Observations of ${ion.astroContext} detect continuum photoionization edges from ${ion.symbolLabel} in ${chosenShell.shellWord}, where discrete levels satisfy Eₙ = −13.6 Z² / n² eV. Constants: h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, e = 1.60 × 10⁻¹⁹ C.`,
    `Within ${ion.astroContext}, one-electron ${ion.symbolLabel} ions populate ${chosenShell.shellWord} under the Bohr scaling law Eₙ = −13.6 Z² / n² eV relative to zero continuum energy (h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, e = 1.60 × 10⁻¹⁹ C).`,
    `Radiative recombination diagnostics on ${ion.astroContext} analyse ${ion.symbolLabel} starting from ${chosenShell.shellWord} using Eₙ = −13.6 Z² / n² eV. Assume h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, and e = 1.60 × 10⁻¹⁹ C.`,
  ];
  const baseStem =
    frames[
      (variantIdx * 3 + Math.floor(variantIdx / shellOptions.length)) %
        frames.length
    ];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const askWl = variantIdx % 2 === 0;
    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Apply the Bohr hydrogenic scaling law to evaluate continuum series-limit wavelength or threshold frequency",
      distractorStrategy: [
        "linear-in-atomic-number-instead-of-z-squared",
        "linear-in-principal-quantum-number-instead-of-n-squared",
        "ground-state-series-limit-instead-of-excited-shell",
      ],
    };

    if (askWl) {
      const stem = `${baseStem} What is the series-limit (maximum) photon wavelength that can photoionize this species from ${chosenShell.shellWord}?`;
      const linearZEv = (13.6 * ion.z) / (chosenShell.n * chosenShell.n);
      const linearNEv = (13.6 * ion.z * ion.z) / chosenShell.n;
      const n1Ev = 13.6 * ion.z * ion.z;
      const options = buildDistinctMcqOptions({
        truth: sol.ionizationWavelengthNm,
        unit: "nm",
        correctSlot: slot,
        distractors: [
          {
            value: ((h * c) / (linearZEv * e)) * 1e9,
            rationale:
              "Scales energy linearly with Z instead of Z² in the hydrogenic Bohr formula.",
          },
          {
            value: ((h * c) / (linearNEv * e)) * 1e9,
            rationale:
              "Divides by n instead of n² when computing the initial bound-state energy.",
          },
          {
            value: ((h * c) / (n1Ev * e)) * 1e9,
            rationale:
              "Calculates the ground-state (n = 1) continuum limit rather than ionizing from the specified shell.",
          },
        ],
        fallbackDistractors: [
          {
            value: sol.ionizationWavelengthNm * 2,
            rationale:
              "Introduces an extraneous factor of 1/2 in the Rydberg continuum energy.",
          },
        ],
      });
      const ans = formatQuantity3sf(sol.ionizationWavelengthNm, "nm");
      return {
        id,
        conceptId: "atomic-spectra-energy-levels",
        templateArchetype: "bohr-hydrogenic-ion-series-limit",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: plan,
        targetQuantityKey: "ionizationWavelengthNm",
        stem,
        options,
        workedSolution: `Initial level energy Eₙ = −13.6 × ${ion.z}² / ${chosenShell.n}² = −${formatQuantity3sf(sol.ionizationEnergyEv, "eV")}. Ionization requires ΔE = ${formatQuantity3sf(sol.ionizationEnergyEv, "eV")} = ${formatQuantity3sf(sol.ionizationEnergyJ, "J")}. Maximum ionizing wavelength λ = hc / ΔE = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes ΔE = 13.6 Z² / n² eV and λ = hc / ΔE = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${baseStem} What minimum photon frequency is needed to remove the electron completely from ${chosenShell.shellWord}?`;
    const linearZFreq = ((13.6 * ion.z) / (chosenShell.n * chosenShell.n) * e) / h;
    const linearNFreq = ((13.6 * ion.z * ion.z) / chosenShell.n * e) / h;
    const noEvFreq = sol.ionizationEnergyEv / h;
    const options = buildDistinctMcqOptions({
      truth: sol.ionizationFrequencyHz,
      unit: "Hz",
      correctSlot: slot,
      distractors: [
        {
          value: linearZFreq,
          rationale: "Uses Z instead of Z² in the hydrogenic shell energy formula.",
        },
        {
          value: linearNFreq,
          rationale: "Uses 1/n instead of 1/n² for the shell dependence.",
        },
        {
          value: noEvFreq,
          rationale:
            "Forgets to convert electron-volts into joules via 1.60 × 10⁻¹⁹ J eV⁻¹ before dividing by h.",
        },
      ],
      fallbackDistractors: [
        {
          value: (13.6 * e) / h,
          rationale:
            "Uses the Z = 1, n = 1 neutral hydrogen ground-state Lyman threshold regardless of Z and n.",
        },
      ],
    });
    const ans = formatQuantity3sf(sol.ionizationFrequencyHz, "Hz");
    return {
      id,
      conceptId: "atomic-spectra-energy-levels",
      templateArchetype: "bohr-hydrogenic-ion-series-limit",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: plan,
      targetQuantityKey: "ionizationFrequencyHz",
      stem,
      options,
      workedSolution: `Ionization energy from n = ${chosenShell.n} is ΔE = 13.6 × ${ion.z}² / ${chosenShell.n}² = ${formatQuantity3sf(sol.ionizationEnergyEv, "eV")} = ${formatQuantity3sf(sol.ionizationEnergyJ, "J")}. Threshold frequency f = ΔE / h = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates f = (13.6 Z² / n²)(e / h) = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `Calculate the ionization energy, in eV, required to remove the electron from ${chosenShell.shellWord}.`,
      marks: 2,
      targetQuantityKey: "ionizationEnergyEv",
      truth: sol.ionizationEnergyEv,
      unit: "eV",
      methodCriterion: "Applies ΔE = 13.6 Z² / n² eV for the specified Z and n.",
      workingSteps: [
        `Eₙ = −13.6 × (${ion.z})² / (${chosenShell.n})² = −${formatQuantity3sf(sol.ionizationEnergyEv, "eV")}.`,
        `Ionization energy ΔE = 0 − Eₙ = ${formatQuantity3sf(sol.ionizationEnergyEv, "eV")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the threshold ionizing photon frequency.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "ionizationFrequencyHz",
      truth: sol.ionizationFrequencyHz,
      unit: "Hz",
      methodCriterion:
        "Converts ionization energy from eV to J and divides by Planck's constant h.",
      workingSteps: [
        `ΔE = ${formatQuantity3sf(sol.ionizationEnergyEv)} × 1.60 × 10⁻¹⁹ = ${formatQuantity3sf(sol.ionizationEnergyJ, "J")}.`,
        `f = ΔE / h = ${formatQuantity3sf(sol.ionizationEnergyJ)} / (6.63 × 10⁻³⁴) = ${formatQuantity3sf(sol.ionizationFrequencyHz, "Hz")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Calculate the maximum photon wavelength, in nm, capable of ionizing this state.`,
      marks: 1,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "ionizationWavelengthNm",
      truth: sol.ionizationWavelengthNm,
      unit: "nm",
      methodCriterion: "Uses λ = c / f and expresses the wavelength in nm",
      workingSteps: [
        `λ = (3.00 × 10⁸) / (${formatQuantity3sf(sol.ionizationFrequencyHz)}) = ${formatQuantity3sf(sol.ionizationWavelengthNm, "nm")}.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "atomic-spectra-energy-levels",
    templateArchetype: "bohr-hydrogenic-ion-series-limit",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Evaluate hydrogenic Bohr shell ionization energy, threshold frequency, and series-limit wavelength",
      subpartStrategy: [
        "evaluate-bohr-shell-binding-energy-in-ev",
        "compute-threshold-frequency-in-hertz",
        "convert-threshold-frequency-to-nanometre-wavelength",
      ],
    },
    stem: baseStem,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 3: photoelectric-effect :: photocell-work-function-stopping-potential
// ============================================================================

interface MetalCathodePreset {
  readonly name: string;
  readonly wfEv: number;
  readonly deviceContext: string;
}

const PHOTOELECTRIC_METALS: readonly MetalCathodePreset[] = [
  { name: "Caesium", wfEv: 1.95, deviceContext: "an evacuated caesium-antimonide night-vision photocell" },
  { name: "Potassium", wfEv: 2.29, deviceContext: "a clean potassium vacuum phototube" },
  { name: "Sodium", wfEv: 2.36, deviceContext: "an alkali-metal sodium photocathode vacuum chamber" },
  { name: "Barium", wfEv: 2.52, deviceContext: "a barium-coated electron-tube emitter" },
  { name: "Lithium", wfEv: 2.93, deviceContext: "a freshly cleaved lithium vacuum target" },
  { name: "Calcium", wfEv: 2.87, deviceContext: "a degassed calcium photoemission electrode" },
  { name: "Magnesium", wfEv: 3.66, deviceContext: "a solar-blind magnesium UV flame-sensor cathode" },
  { name: "Aluminium", wfEv: 4.08, deviceContext: "an oxide-free aluminium spacecraft charge-control plate" },
  { name: "Zinc", wfEv: 4.33, deviceContext: "an electroscope-mounted clean zinc UV plate" },
  { name: "Tungsten", wfEv: 4.55, deviceContext: "a high-vacuum tungsten filament surface" },
  { name: "Copper", wfEv: 4.70, deviceContext: "an oxygen-free copper accelerator photocathode" },
  { name: "Nickel", wfEv: 5.04, deviceContext: "an ultra-high-vacuum polished nickel target" },
];

function buildArchetype3Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch3:${seed}:${variantIdx}`);
  const metal = PHOTOELECTRIC_METALS[variantIdx % PHOTOELECTRIC_METALS.length];
  const { planckConstantJs: h, elementaryChargeC: e } = DATA_BOOKLET_CONSTANTS;
  const f0 = (metal.wfEv * e) / h;
  const multipliers = [1.31, 1.44, 1.57, 1.69, 1.83, 1.97, 2.11, 2.26, 2.39, 2.53, 2.68];
  const mult = multipliers[(variantIdx * 2 + Math.floor(variantIdx / PHOTOELECTRIC_METALS.length)) % multipliers.length];
  const incidentFrequencyHz = Number((f0 * mult).toPrecision(3));
  const plotModes: readonly PhotoelectricPlotMode[] = [
    "stopping-potential-vs-f",
    "ek-ev-vs-f",
    "ek-j-vs-f",
  ];
  const plotMode = plotModes[variantIdx % plotModes.length];

  const spec: PhotoelectricScenarioSpec = {
    kind: "photoelectric-effect",
    metalName: metal.name,
    workFunctionEv: metal.wfEv,
    incidentFrequencyHz,
    plotMode,
    showExtrapolation: true,
    showOperatingPoint: true,
  };

  const sol = solveQuantumNuclearScenario(spec) as PhotoelectricSolution;
  const hiddenQuantities = [
    "thresholdFrequencyHz",
    "thresholdWavelengthM",
    "thresholdWavelengthNm",
    "incidentWavelengthM",
    "incidentWavelengthNm",
    "photonEnergyEv",
    "photonEnergyJ",
    "signedEnergyBalanceEv",
    "maxKineticEnergyEv",
    "maxKineticEnergyJ",
    "stoppingPotentialV",
    "maxElectronSpeedMs",
    "yIntercept",
    "graphSlope",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "workFunctionEv", value: metal.wfEv, unit: "eV", source: "stem" },
    { name: "incidentFrequencyHz", value: incidentFrequencyHz, unit: "Hz", source: "stem" },
    { name: "planckConstantJs", value: 6.63e-34, unit: "J s", source: "stem" },
  ];

  const syllabi = resolveSyllabusTagsFromCrosswalk("photoelectric-effect", {
    format,
    ibLevelOverride: "HL",
    alevelLevelOverride: "Y12",
    ncukLevelOverride: "IFY-S2",
  });
  const difficulty = chooseDifficulty(variantIdx);

  const stemFrames = [
    `Monochromatic electromagnetic radiation of frequency ${formatExactGiven(incidentFrequencyHz, "Hz")} strikes ${metal.deviceContext} whose work function is ${formatExactGiven(metal.wfEv, "eV")}. Take h = 6.63 × 10⁻³⁴ J s and e = 1.60 × 10⁻¹⁹ C.`,
    `In a photoelectric experiment using ${metal.deviceContext}, a clean ${metal.name.toLowerCase()} surface of work function ${formatExactGiven(metal.wfEv, "eV")} is illuminated at frequency ${formatExactGiven(incidentFrequencyHz, "Hz")}. Use h = 6.63 × 10⁻³⁴ J s and e = 1.60 × 10⁻¹⁹ C.`,
    `A beam of frequency ${formatExactGiven(incidentFrequencyHz, "Hz")} falls onto ${metal.deviceContext} (${metal.name.toLowerCase()} work function Φ = ${formatExactGiven(metal.wfEv, "eV")}), producing the photoelectric characteristic shown. Assume h = 6.63 × 10⁻³⁴ J s and e = 1.60 × 10⁻¹⁹ C.`,
    `To calibrate ${metal.deviceContext}, ultraviolet photons at ${formatExactGiven(incidentFrequencyHz, "Hz")} irradiate a ${metal.name.toLowerCase()} electrode having Φ = ${formatExactGiven(metal.wfEv, "eV")}. Constants: h = 6.63 × 10⁻³⁴ J s, e = 1.60 × 10⁻¹⁹ C.`,
    `Electrons are liberated from ${metal.deviceContext} (work function ${formatExactGiven(metal.wfEv, "eV")}) when monochromatic light of frequency ${formatExactGiven(incidentFrequencyHz, "Hz")} is incident in vacuum. Take h = 6.63 × 10⁻³⁴ J s and e = 1.60 × 10⁻¹⁹ C.`,
  ];
  const baseStem = stemFrames[variantIdx % stemFrames.length];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const subMode = variantIdx % 3;
    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Apply Einstein's photoelectric equation to find stopping potential, maximum kinetic energy, or threshold frequency",
      distractorStrategy: [
        "add-work-function-instead-of-subtracting",
        "omit-elementary-charge-conversion-between-ev-and-joules",
        "equate-stopping-potential-to-full-photon-energy",
      ],
    };

    if (subMode === 0) {
      const stem = `${baseStem} What reverse stopping potential Vₛ is required to reduce the collector photocurrent to zero?`;
      const options = buildDistinctMcqOptions({
        truth: sol.stoppingPotentialV,
        unit: "V",
        correctSlot: slot,
        distractors: [
          {
            value: sol.photonEnergyEv + sol.workFunctionEv,
            rationale:
              "Adds the work function Φ to hf/e instead of subtracting Φ in Vₛ = hf/e − Φ/e.",
          },
          {
            value: sol.photonEnergyEv,
            rationale:
              "Equates stopping potential to the full incident photon energy hf/e, neglecting the work function Φ.",
          },
          {
            value: sol.maxKineticEnergyJ,
            rationale:
              "Reports the maximum kinetic energy in joules without dividing by elementary charge e = 1.60 × 10⁻¹⁹ C.",
          },
        ],
        fallbackDistractors: [
          {
            value: Math.abs(sol.photonEnergyJ - sol.workFunctionEv) / e,
            rationale:
              "Subtracts Φ in eV directly from hf in joules without converting to consistent energy units.",
          },
        ],
      });
      const ans = formatQuantity3sf(sol.stoppingPotentialV, "V");
      return {
        id,
        conceptId: "photoelectric-effect",
        templateArchetype: "photocell-work-function-stopping-potential",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: plan,
        targetQuantityKey: "stoppingPotentialV",
        stem,
        options,
        workedSolution: `Photon energy E = hf / e = (6.63 × 10⁻³⁴ × ${formatExactGiven(incidentFrequencyHz)}) / (1.60 × 10⁻¹⁹) = ${formatQuantity3sf(sol.photonEnergyEv, "eV")}. Maximum kinetic energy Eₖ,ₘₐₓ = E − Φ = ${formatQuantity3sf(sol.photonEnergyEv)} − ${metal.wfEv} = ${formatQuantity3sf(sol.maxKineticEnergyEv, "eV")}. Hence stopping potential Vₛ = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes eVₛ = hf − Φ to obtain Vₛ = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (subMode === 1) {
      const stem = `${baseStem} What is the maximum kinetic energy, in electron-volts (eV), of the emitted photoelectrons?`;
      const options = buildDistinctMcqOptions({
        truth: sol.maxKineticEnergyEv,
        unit: "eV",
        correctSlot: slot,
        distractors: [
          {
            value: sol.photonEnergyEv + sol.workFunctionEv,
            rationale:
              "Adds the work function Φ to hf/e instead of subtracting Φ in Eₖ,ₘₐₓ = hf − Φ.",
          },
          {
            value: sol.photonEnergyEv,
            rationale:
              "Calculates the incident photon energy hf/e without subtracting the surface work function Φ.",
          },
          {
            value: Math.abs(sol.photonEnergyJ - sol.workFunctionEv),
            rationale:
              "Subtracts Φ in eV from hf in joules without converting hf to electron-volts via 1.60 × 10⁻¹⁹ C.",
          },
        ],
        fallbackDistractors: [
          {
            value: sol.workFunctionEv * 0.5,
            rationale: "Halves the surface work function instead of evaluating hf/e − Φ.",
          },
        ],
      });
      const ans = formatQuantity3sf(sol.maxKineticEnergyEv, "eV");
      return {
        id,
        conceptId: "photoelectric-effect",
        templateArchetype: "photocell-work-function-stopping-potential",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: plan,
        targetQuantityKey: "maxKineticEnergyEv",
        stem,
        options,
        workedSolution: `Incident photon energy E = hf / e = (6.63 × 10⁻³⁴ × ${formatExactGiven(incidentFrequencyHz)}) / (1.60 × 10⁻¹⁹) = ${formatQuantity3sf(sol.photonEnergyEv, "eV")}. Subtracting Φ = ${metal.wfEv} eV gives Eₖ,ₘₐₓ = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Converts hf to eV and subtracts Φ = ${metal.wfEv} eV to obtain ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${baseStem} What is the threshold frequency f₀ of the ${metal.name.toLowerCase()} surface?`;
    const options = buildDistinctMcqOptions({
      truth: sol.thresholdFrequencyHz,
      unit: "Hz",
      correctSlot: slot,
      distractors: [
        {
          value: metal.wfEv / h,
          rationale:
            "Forgets to convert work function Φ from eV to joules (× 1.60 × 10⁻¹⁹) before dividing by h.",
        },
        {
          value: sol.maxKineticEnergyJ / h,
          rationale:
            "Divides maximum photoelectron kinetic energy by h instead of dividing work function Φ by h.",
        },
        {
          value: (sol.photonEnergyJ + sol.workFunctionJ) / h,
          rationale: "Adds incident frequency to f₀ instead of computing Φ / h.",
        },
      ],
      fallbackDistractors: [
        {
          value: sol.thresholdFrequencyHz / 1.6,
          rationale: "Divides by 1.60 instead of multiplying by 1.60 × 10⁻¹⁹.",
        },
      ],
    });
    const ans = formatQuantity3sf(sol.thresholdFrequencyHz, "Hz");
    return {
      id,
      conceptId: "photoelectric-effect",
      templateArchetype: "photocell-work-function-stopping-potential",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: plan,
      targetQuantityKey: "thresholdFrequencyHz",
      stem,
      options,
      workedSolution: `Work function Φ = ${metal.wfEv} × 1.60 × 10⁻¹⁹ = ${formatQuantity3sf(sol.workFunctionJ, "J")}. Threshold frequency f₀ = Φ / h = ${formatQuantity3sf(sol.workFunctionJ)} / (6.63 × 10⁻³⁴) = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates f₀ = Φ / h = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `Calculate the threshold frequency f₀ of the ${metal.name.toLowerCase()} surface.`,
      marks: 2,
      targetQuantityKey: "thresholdFrequencyHz",
      truth: sol.thresholdFrequencyHz,
      unit: "Hz",
      methodCriterion: "Converts Φ from eV to joules and applies f₀ = Φ / h.",
      workingSteps: [
        `Φ = ${metal.wfEv} × 1.60 × 10⁻¹⁹ = ${formatQuantity3sf(sol.workFunctionJ, "J")}.`,
        `f₀ = Φ / h = ${formatQuantity3sf(sol.workFunctionJ)} / (6.63 × 10⁻³⁴) = ${formatQuantity3sf(sol.thresholdFrequencyHz, "Hz")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the maximum kinetic energy, in eV, of the emitted photoelectrons.`,
      marks: 2,
      targetQuantityKey: "maxKineticEnergyEv",
      truth: sol.maxKineticEnergyEv,
      unit: "eV",
      methodCriterion: "Applies Einstein's photoelectric equation Eₖ,ₘₐₓ = hf/e − Φ.",
      workingSteps: [
        `Photon energy E = hf / e = ${formatQuantity3sf(sol.photonEnergyEv, "eV")}.`,
        `Eₖ,ₘₐₓ = ${formatQuantity3sf(sol.photonEnergyEv)} − ${metal.wfEv} = ${formatQuantity3sf(sol.maxKineticEnergyEv, "eV")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `State the stopping potential Vₛ required to halt the fastest photoelectrons.`,
      marks: 1,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "stoppingPotentialV",
      truth: sol.stoppingPotentialV,
      unit: "V",
      methodCriterion: "Uses eVₛ = Eₖ,ₘₐₓ",
      workingSteps: [
        `Vₛ = Eₖ,ₘₐₓ / e = ${formatQuantity3sf(sol.stoppingPotentialV, "V")}.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "photoelectric-effect",
    templateArchetype: "photocell-work-function-stopping-potential",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Calculate threshold frequency, maximum photoelectron kinetic energy in eV, and stopping potential",
      subpartStrategy: [
        "determine-threshold-frequency-from-work-function",
        "evaluate-max-kinetic-energy-via-einstein-equation",
        "deduce-stopping-potential-from-energy-balance",
      ],
    },
    stem: baseStem,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 4: photoelectric-effect :: uv-wavelength-photoelectron-max-speed
// ============================================================================

function buildArchetype4Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch4:${seed}:${variantIdx}`);
  const metal =
    PHOTOELECTRIC_METALS[(variantIdx + 4) % PHOTOELECTRIC_METALS.length];
  const {
    planckConstantJs: h,
    speedOfLightMs: c,
    elementaryChargeC: e,
    electronMassKg: me,
  } = DATA_BOOKLET_CONSTANTS;

  const lambda0Nm = ((h * c) / (metal.wfEv * e)) * 1e9;
  const fracChoices = [0.35, 0.39, 0.43, 0.48, 0.52, 0.57, 0.61, 0.66, 0.70, 0.75, 0.79];
  const incidentWavelengthNm = Math.round(
    lambda0Nm *
      fracChoices[
        (variantIdx * 3 + Math.floor(variantIdx / PHOTOELECTRIC_METALS.length)) %
          fracChoices.length
      ],
  );

  const spec: PhotoelectricScenarioSpec = {
    kind: "photoelectric-effect",
    metalName: metal.name,
    workFunctionEv: metal.wfEv,
    incidentWavelengthNm,
    plotMode: variantIdx % 2 === 0 ? "ek-j-vs-f" : "ek-ev-vs-f",
    showExtrapolation: true,
    showOperatingPoint: true,
  };

  const sol = solveQuantumNuclearScenario(spec) as PhotoelectricSolution;
  const hiddenQuantities = [
    "thresholdFrequencyHz",
    "thresholdWavelengthM",
    "thresholdWavelengthNm",
    "incidentFrequencyHz",
    "photonEnergyEv",
    "photonEnergyJ",
    "signedEnergyBalanceEv",
    "maxKineticEnergyEv",
    "maxKineticEnergyJ",
    "stoppingPotentialV",
    "maxElectronSpeedMs",
    "yIntercept",
    "graphSlope",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "workFunctionEv", value: metal.wfEv, unit: "eV", source: "stem" },
    { name: "incidentWavelengthNm", value: incidentWavelengthNm, unit: "nm", source: "stem" },
    { name: "planckConstantJs", value: 6.63e-34, unit: "J s", source: "stem" },
  ];

  const syllabi = resolveSyllabusTagsFromCrosswalk("photoelectric-effect", {
    format,
    ibLevelOverride: "HL",
    alevelLevelOverride: "Y12",
    ncukLevelOverride: "IFY-S2",
  });
  const difficulty = chooseDifficulty(variantIdx);

  const frames = [
    `An excimer UV laser operating at wavelength ${incidentWavelengthNm} nm irradiates ${metal.deviceContext} (${metal.name.toLowerCase()} work function ${formatExactGiven(metal.wfEv, "eV")}). Take h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, e = 1.60 × 10⁻¹⁹ C, and mₑ = 9.11 × 10⁻³¹ kg.`,
    `In an ultra-high-vacuum time-of-flight spectrometer, monochromatic UV light of wavelength ${incidentWavelengthNm} nm strikes a clean ${metal.name.toLowerCase()} sample of work function ${formatExactGiven(metal.wfEv, "eV")}. Use h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, e = 1.60 × 10⁻¹⁹ C, and mₑ = 9.11 × 10⁻³¹ kg.`,
    `Synchrotron UV radiation filtered to ${incidentWavelengthNm} nm illuminates ${metal.deviceContext}, where the ${metal.name.toLowerCase()} emitter has Φ = ${formatExactGiven(metal.wfEv, "eV")}. Constants: h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, e = 1.60 × 10⁻¹⁹ C, mₑ = 9.11 × 10⁻³¹ kg.`,
    `Monochromatic photons of wavelength ${incidentWavelengthNm} nm eject photoelectrons in vacuum from ${metal.deviceContext} (${metal.name.toLowerCase()}, Φ = ${formatExactGiven(metal.wfEv, "eV")}). Assume h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, e = 1.60 × 10⁻¹⁹ C, and mₑ = 9.11 × 10⁻³¹ kg.`,
    `During a surface-science calibration of ${metal.deviceContext}, ${incidentWavelengthNm} nm ultraviolet radiation falls onto ${metal.name.toLowerCase()} of work function ${formatExactGiven(metal.wfEv, "eV")} (h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, e = 1.60 × 10⁻¹⁹ C, mₑ = 9.11 × 10⁻³¹ kg).`,
    `Photoemission from ${metal.deviceContext} is driven by narrowband ${incidentWavelengthNm} nm UV light incident on ${metal.name.toLowerCase()} having work function Φ = ${formatExactGiven(metal.wfEv, "eV")}. Take h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, e = 1.60 × 10⁻¹⁹ C, and mₑ = 9.11 × 10⁻³¹ kg.`,
    `Inside ${metal.deviceContext}, a ${metal.name.toLowerCase()} cathode (work function ${formatExactGiven(metal.wfEv, "eV")}) absorbs ${incidentWavelengthNm} nm photons in vacuum. Use h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, e = 1.60 × 10⁻¹⁹ C, and mₑ = 9.11 × 10⁻³¹ kg.`,
  ];
  const baseStem = frames[(variantIdx * 3 + Math.floor(variantIdx / 7)) % frames.length];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const askSpeed = variantIdx % 3 !== 2;
    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Compute maximum photoelectron emission speed or threshold wavelength from UV wavelength and metallic work function",
      distractorStrategy: [
        "add-work-function-to-photon-energy-before-kinematics",
        "omit-factor-of-two-in-kinetic-energy-speed-inversion",
        "ignore-work-function-and-convert-entire-photon-energy-to-speed",
      ],
    };

    if (askSpeed) {
      const stem = `${baseStem} What is the maximum speed of the emitted photoelectrons?`;
      const vPlusWf = Math.sqrt((2 * (sol.photonEnergyJ + sol.workFunctionJ)) / me);
      const vNoTwo = Math.sqrt(sol.maxKineticEnergyJ / me);
      const vFullPhoton = Math.sqrt((2 * sol.photonEnergyJ) / me);
      const options = buildDistinctMcqOptions({
        truth: sol.maxElectronSpeedMs,
        unit: "m s⁻¹",
        correctSlot: slot,
        distractors: [
          {
            value: vPlusWf,
            rationale:
              "Adds the work function Φ to hc/λ instead of subtracting Φ before solving ½mₑv² = Eₖ,ₘₐₓ.",
          },
          {
            value: vNoTwo,
            rationale:
              "Omits the factor of 2 in vₘₐₓ = √(2Eₖ,ₘₐₓ / mₑ), evaluating √(Eₖ,ₘₐₓ / mₑ).",
          },
          {
            value: vFullPhoton,
            rationale:
              "Equates ½mₑv² directly to the incident photon energy hc/λ without subtracting the work function.",
          },
        ],
        fallbackDistractors: [
          {
            value: (2 * sol.maxKineticEnergyJ) / me,
            rationale: "Forgets to take the square root when solving ½mₑv² = Eₖ,ₘₐₓ.",
          },
        ],
      });
      const ans = formatQuantity3sf(sol.maxElectronSpeedMs, "m s⁻¹");
      return {
        id,
        conceptId: "photoelectric-effect",
        templateArchetype: "uv-wavelength-photoelectron-max-speed",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: plan,
        targetQuantityKey: "maxElectronSpeedMs",
        stem,
        options,
        workedSolution: `Incident photon energy E = hc / λ = ${formatQuantity3sf(sol.photonEnergyJ, "J")}; work function Φ = ${metal.wfEv} × 1.60 × 10⁻¹⁹ = ${formatQuantity3sf(sol.workFunctionJ, "J")}. Thus Eₖ,ₘₐₓ = ${formatQuantity3sf(sol.maxKineticEnergyJ, "J")}, giving vₘₐₓ = √(2Eₖ,ₘₐₓ / mₑ) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes Eₖ,ₘₐₓ = hc/λ − Φ and vₘₐₓ = √(2Eₖ,ₘₐₓ / mₑ) = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${baseStem} What is the threshold wavelength λ₀ above which no photoelectrons are emitted from this ${metal.name.toLowerCase()} surface?`;
    const options = buildDistinctMcqOptions({
      truth: sol.thresholdWavelengthNm,
      unit: "nm",
      correctSlot: slot,
      distractors: [
        {
          value: ((h * c) / sol.maxKineticEnergyJ) * 1e9,
          rationale:
            "Uses Eₖ,ₘₐₓ instead of work function Φ in λ₀ = hc / Φ.",
        },
        {
          value: sol.thresholdWavelengthNm / 1.6,
          rationale:
            "Multiplies instead of dividing by 1.60 during the eV-to-joule conversion in the denominator.",
        },
        {
          value: ((h * c) / (sol.photonEnergyJ + sol.workFunctionJ)) * 1e9,
          rationale:
            "Sums incident photon energy and work function in the denominator instead of using Φ alone.",
        },
      ],
      fallbackDistractors: [
        {
          value: sol.thresholdWavelengthNm * 2,
          rationale: "Introduces an erroneous factor of 2 in λ₀ = hc / Φ.",
        },
      ],
    });
    const ans = formatQuantity3sf(sol.thresholdWavelengthNm, "nm");
    return {
      id,
      conceptId: "photoelectric-effect",
      templateArchetype: "uv-wavelength-photoelectron-max-speed",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: plan,
      targetQuantityKey: "thresholdWavelengthNm",
      stem,
      options,
      workedSolution: `Threshold wavelength λ₀ = hc / Φ = (6.63 × 10⁻³⁴ × 3.00 × 10⁸) / (${metal.wfEv} × 1.60 × 10⁻¹⁹) = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates λ₀ = hc / Φ = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `Calculate the energy, in eV, of a single incident ${incidentWavelengthNm} nm UV photon.`,
      marks: 2,
      targetQuantityKey: "photonEnergyEv",
      truth: sol.photonEnergyEv,
      unit: "eV",
      methodCriterion: "Converts wavelength to metres, applies E = hc / λ, and divides by 1.60 × 10⁻¹⁹ J eV⁻¹.",
      workingSteps: [
        `E_J = hc / λ = (6.63 × 10⁻³⁴ × 3.00 × 10⁸) / (${incidentWavelengthNm} × 10⁻⁹) = ${formatQuantity3sf(sol.photonEnergyJ, "J")}.`,
        `E = E_J / (1.60 × 10⁻¹⁹) = ${formatQuantity3sf(sol.photonEnergyEv, "eV")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the maximum kinetic energy, in eV, of the emitted photoelectrons.`,
      marks: 1,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "maxKineticEnergyEv",
      truth: sol.maxKineticEnergyEv,
      unit: "eV",
      methodCriterion: "Subtracts work function Φ from photon energy E",
      workingSteps: [
        `Eₖ,ₘₐₓ = ${formatQuantity3sf(sol.photonEnergyEv)} − ${metal.wfEv} = ${formatQuantity3sf(sol.maxKineticEnergyEv, "eV")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Calculate the maximum speed of an emitted photoelectron.`,
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "maxElectronSpeedMs",
      truth: sol.maxElectronSpeedMs,
      unit: "m s⁻¹",
      methodCriterion: "Converts Eₖ,ₘₐₓ to joules and rearranges ½mₑvₘₐₓ² = Eₖ,ₘₐₓ.",
      workingSteps: [
        `Eₖ,ₘₐₓ = ${formatQuantity3sf(sol.maxKineticEnergyJ, "J")}.`,
        `vₘₐₓ = √(2 × ${formatQuantity3sf(sol.maxKineticEnergyJ)} / 9.11 × 10⁻³¹) = ${formatQuantity3sf(sol.maxElectronSpeedMs, "m s⁻¹")}.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "photoelectric-effect",
    templateArchetype: "uv-wavelength-photoelectron-max-speed",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Chain UV photon energy hc/lambda, Einstein work-function subtraction, and non-relativistic photoelectron max speed",
      subpartStrategy: [
        "compute-uv-photon-energy-in-joules",
        "subtract-work-function-in-joules-for-max-kinetic-energy",
        "invert-kinetic-energy-for-maximum-electron-speed",
      ],
    },
    stem: baseStem,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 5: wave-particle-duality-de-broglie :: accelerated-beam-de-broglie-wavelength
// ============================================================================

interface BeamSetupPreset {
  readonly particle: MatterWaveParticleKind;
  readonly label: string;
  readonly apparatus: string;
  readonly massText: string;
  readonly chargeText: string;
}

const BEAM_SETUPS: readonly BeamSetupPreset[] = [
  {
    particle: "electron",
    label: "electrons",
    apparatus: "a low-energy electron diffraction (LEED) gun",
    massText: "mₑ = 9.11 × 10⁻³¹ kg",
    chargeText: "e = 1.60 × 10⁻¹⁹ C",
  },
  {
    particle: "electron",
    label: "electrons",
    apparatus: "a scanning electron microscope column",
    massText: "mₑ = 9.11 × 10⁻³¹ kg",
    chargeText: "e = 1.60 × 10⁻¹⁹ C",
  },
  {
    particle: "proton",
    label: "protons",
    apparatus: "a surface-analysis proton microprobe injector",
    massText: "mₚ = 1.673 × 10⁻²⁷ kg",
    chargeText: "e = 1.60 × 10⁻¹⁹ C",
  },
  {
    particle: "alpha",
    label: "alpha particles",
    apparatus: "an electrostatic helium-ion accelerator stage",
    massText: "mα = 6.644 × 10⁻²⁷ kg",
    chargeText: "charge +2e with e = 1.60 × 10⁻¹⁹ C",
  },
  {
    particle: "neutron",
    label: "thermal neutrons",
    apparatus: "a heavy-water research-reactor velocity selector",
    massText: "mₙ = 1.675 × 10⁻²⁷ kg",
    chargeText: "",
  },
];

function buildArchetype5Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch5:${seed}:${variantIdx}`);
  const setup = BEAM_SETUPS[variantIdx % BEAM_SETUPS.length];
  const isNeutron = setup.particle === "neutron";
  const voltages = [160, 220, 340, 480, 650, 900, 1250, 1800, 2400, 3200, 4200];
  const speeds = [1450, 1850, 2200, 2650, 3100, 3650, 4150];

  const voltageV = voltages[variantIdx % voltages.length];
  const neutronSpeedMs = speeds[variantIdx % speeds.length];

  const spec: MatterWavesScenarioSpec = isNeutron
    ? {
        kind: "matter-waves",
        particle: "neutron",
        speedMs: neutronSpeedMs,
      }
    : {
        kind: "matter-waves",
        particle: setup.particle,
        acceleratingVoltageV: voltageV,
      };

  const sol = solveQuantumNuclearScenario(spec) as MatterWavesSolution;
  const hiddenQuantities = isNeutron
    ? [
        "kineticEnergyJ",
        "kineticEnergyEv",
        "momentumNs",
        "deBroglieWavelengthM",
        "deBroglieWavelengthNm",
        "deBroglieWavelengthPm",
      ]
    : [
        "kineticEnergyJ",
        "speedMs",
        "momentumNs",
        "deBroglieWavelengthM",
        "deBroglieWavelengthNm",
        "deBroglieWavelengthPm",
        ...(setup.particle === "alpha" ? ["kineticEnergyEv"] : []),
      ];

  const requiredGivens: RequiredGivenSpec[] = isNeutron
    ? [
        { name: "speedMs", value: neutronSpeedMs, unit: "m s⁻¹", source: "stem" },
        { name: "planckConstantJs", value: 6.63e-34, unit: "J s", source: "stem" },
      ]
    : [
        { name: "acceleratingVoltageV", value: voltageV, unit: "V", source: "stem" },
        { name: "planckConstantJs", value: 6.63e-34, unit: "J s", source: "stem" },
      ];

  const syllabi = resolveSyllabusTagsFromCrosswalk(
    "wave-particle-duality-de-broglie",
    {
      format,
      ibLevelOverride: "HL",
      alevelLevelOverride: "Y12",
      ncukLevelOverride: "IFY-S2",
    },
  );
  const difficulty = chooseDifficulty(variantIdx);
  const { planckConstantJs: h, speedOfLightMs: c } = DATA_BOOKLET_CONSTANTS;

  const baseStem = isNeutron
    ? pick(
        () => (variantIdx % 3) / 3,
        [
          `A collimated beam of ${setup.label} emerges from ${setup.apparatus} at speed ${neutronSpeedMs} m s⁻¹. Take h = 6.63 × 10⁻³⁴ J s and ${setup.massText}.`,
          `In crystallographic neutron scattering using ${setup.apparatus}, ${setup.label} travel at a steady speed of ${neutronSpeedMs} m s⁻¹. Use h = 6.63 × 10⁻³⁴ J s and ${setup.massText}.`,
          `Monochromatic ${setup.label} from ${setup.apparatus} enter a vacuum flight tube with speed ${neutronSpeedMs} m s⁻¹ (${setup.massText}, h = 6.63 × 10⁻³⁴ J s).`,
        ],
      )
    : [
        `A beam of ${setup.label} starts from rest in ${setup.apparatus} and accelerates through a potential difference of ${voltageV} V in vacuum. Take h = 6.63 × 10⁻³⁴ J s, ${setup.massText}, and ${setup.chargeText}.`,
        `Inside ${setup.apparatus}, ${setup.label} initially at rest are accelerated across an electrostatic potential difference of ${voltageV} V. Use h = 6.63 × 10⁻³⁴ J s, ${setup.massText}, and ${setup.chargeText}.`,
        `In ${setup.apparatus}, a collimated stream of ${setup.label} is accelerated from rest by a ${voltageV} V supply. Constants: h = 6.63 × 10⁻³⁴ J s, ${setup.massText}, ${setup.chargeText}.`,
        `Vacuum-emitted ${setup.label} in ${setup.apparatus} gain kinetic energy across a ${voltageV} V accelerating anode from negligible initial speed. Assume h = 6.63 × 10⁻³⁴ J s, ${setup.massText}, and ${setup.chargeText}.`,
      ][variantIdx % 4];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const useNm = isNeutron || variantIdx % 2 === 1;
    const targetKey = useNm ? "deBroglieWavelengthNm" : "deBroglieWavelengthPm";
    const unit = useNm ? "nm" : "pm";
    const truth = useNm ? sol.deBroglieWavelengthNm : sol.deBroglieWavelengthPm;
    const scale = useNm ? 1e9 : 1e12;

    const stem = `${baseStem} What is the de Broglie wavelength, in ${useNm ? "nanometres (nm)" : "picometres (pm)"}, of the ${setup.label}?`;
    const noTwoWl = (h / Math.sqrt(sol.massKg * sol.kineticEnergyJ)) * scale;
    const photonWl =
      sol.kineticEnergyJ > 0 ? ((h * c) / sol.kineticEnergyJ) * scale : truth * 4;
    const wrongChargeOrMassWl = isNeutron
      ? (h / (DATA_BOOKLET_CONSTANTS.electronMassKg * neutronSpeedMs)) * scale
      : setup.particle === "alpha"
        ? (h / Math.sqrt(2 * sol.massKg * DATA_BOOKLET_CONSTANTS.elementaryChargeC * voltageV)) *
          scale
        : (h / Math.sqrt(2 * sol.massKg * voltageV)) * scale;

    const options = buildDistinctMcqOptions({
      truth,
      unit,
      correctSlot: slot,
      distractors: [
        {
          value: noTwoWl,
          rationale:
            "Omits the factor of 2 inside p = √(2mEₖ), computing λ = h / √(mEₖ).",
        },
        {
          value: wrongChargeOrMassWl,
          rationale: isNeutron
            ? "Substitutes the electron rest mass instead of the neutron mass in p = mv."
            : setup.particle === "alpha"
              ? "Uses +1e instead of +2e for the alpha-particle charge when finding kinetic energy qV."
              : "Omits the elementary charge factor e = 1.60 × 10⁻¹⁹ C when converting accelerating voltage to joules.",
        },
        {
          value: photonWl,
          rationale:
            "Treats the massive particle as a massless photon using λ = hc / E instead of λ = h / p.",
        },
      ],
      fallbackDistractors: [
        {
          value: truth * 2,
          rationale: "Multiplies wavelength by an erroneous factor of 2.",
        },
      ],
    });
    const ans = formatQuantity3sf(truth, unit);

    return {
      id,
      conceptId: "wave-particle-duality-de-broglie",
      templateArchetype: "accelerated-beam-de-broglie-wavelength",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Compute non-relativistic particle momentum and de Broglie matter-wave wavelength",
        distractorStrategy: [
          "omit-factor-of-two-under-momentum-square-root",
          "omit-charge-or-substitute-wrong-particle-mass",
          "apply-massless-photon-wavelength-relation",
        ],
      },
      targetQuantityKey: targetKey,
      stem,
      options,
      workedSolution: isNeutron
        ? `Momentum p = mv = (${formatQuantity3sf(sol.massKg)})(${neutronSpeedMs}) = ${formatQuantity3sf(sol.momentumNs, "N s")}. De Broglie wavelength λ = h / p = 6.63 × 10⁻³⁴ / ${formatQuantity3sf(sol.momentumNs)} = ${ans}.`
        : `Kinetic energy Eₖ = qV = ${formatQuantity3sf(sol.kineticEnergyJ, "J")}. Momentum p = √(2mEₖ) = ${formatQuantity3sf(sol.momentumNs, "N s")}. De Broglie wavelength λ = h / p = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates p and λ = h / p to obtain ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle(
    isNeutron
      ? [
          {
            partId: "a",
            prompt: `Calculate the kinetic energy, in eV, of a single thermal neutron in the beam (take e = 1.60 × 10⁻¹⁹ C).`,
            marks: 2,
            targetQuantityKey: "kineticEnergyEv",
            truth: sol.kineticEnergyEv,
            unit: "eV",
            methodCriterion: "Evaluates Eₖ = ½mₙv² in joules and divides by 1.60 × 10⁻¹⁹ J eV⁻¹.",
            workingSteps: [
              `Eₖ,J = ½(1.675 × 10⁻²⁷)(${neutronSpeedMs})² = ${formatQuantity3sf(sol.kineticEnergyJ, "J")}.`,
              `Eₖ = Eₖ,J / (1.60 × 10⁻¹⁹) = ${formatQuantity3sf(sol.kineticEnergyEv, "eV")}.`,
            ],
          },
          {
            partId: "b",
            prompt: `Determine the de Broglie wavelength, in nanometres (nm), of the neutrons.`,
            marks: 2,
            targetQuantityKey: "deBroglieWavelengthNm",
            truth: sol.deBroglieWavelengthNm,
            unit: "nm",
            methodCriterion: "Applies λ = h / (mₙv) and converts metres to nanometres.",
            workingSteps: [
              `p = mₙv = ${formatQuantity3sf(sol.momentumNs, "N s")}.`,
              `λ = h / p = ${formatQuantity3sf(sol.deBroglieWavelengthNm, "nm")}.`,
            ],
          },
          {
            partId: "c",
            prompt: `Express this de Broglie wavelength in picometres (pm).`,
            marks: 1,
            dependsOnPartIds: ["b"],
            targetQuantityKey: "deBroglieWavelengthPm",
            truth: sol.deBroglieWavelengthPm,
            unit: "pm",
            methodCriterion: "Converts nanometres to picometres (1 nm = 1000 pm)",
            workingSteps: [
              `λ = ${formatQuantity3sf(sol.deBroglieWavelengthPm, "pm")}.`,
            ],
          },
        ]
      : [
          {
            partId: "a",
            prompt: `Calculate the speed acquired by each particle after acceleration across ${voltageV} V.`,
            marks: 2,
            targetQuantityKey: "speedMs",
            truth: sol.speedMs,
            unit: "m s⁻¹",
            methodCriterion: "Equates ½mv² = qV and solves v = √(2qV / m).",
            workingSteps: [
              `Eₖ = qV = ${formatQuantity3sf(sol.kineticEnergyJ, "J")}.`,
              `v = √(2Eₖ / m) = ${formatQuantity3sf(sol.speedMs, "m s⁻¹")}.`,
            ],
          },
          {
            partId: "b",
            prompt: `Determine the de Broglie wavelength, in nanometres (nm), of the beam.`,
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "deBroglieWavelengthNm",
            truth: sol.deBroglieWavelengthNm,
            unit: "nm",
            methodCriterion: "Divides Planck's constant h by mv and converts metres to nanometres.",
            workingSteps: [
              `λ = h / (mv) = ${formatQuantity3sf(sol.deBroglieWavelengthM, "m")} = ${formatQuantity3sf(sol.deBroglieWavelengthNm, "nm")}.`,
            ],
          },
          {
            partId: "c",
            prompt: `State this de Broglie wavelength in picometres (pm).`,
            marks: 1,
            dependsOnPartIds: ["b"],
            targetQuantityKey: "deBroglieWavelengthPm",
            truth: sol.deBroglieWavelengthPm,
            unit: "pm",
            methodCriterion: "Multiplies wavelength in nm by 1000 pm nm⁻¹",
            workingSteps: [
              `λ = ${formatQuantity3sf(sol.deBroglieWavelengthPm, "pm")}.`,
            ],
          },
        ],
  );

  return {
    id,
    conceptId: "wave-particle-duality-de-broglie",
    templateArchetype: "accelerated-beam-de-broglie-wavelength",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Determine non-relativistic beam kinetic energy, linear momentum, and de Broglie wavelength",
      subpartStrategy: [
        "evaluate-particle-kinetic-energy-in-joules",
        "compute-linear-momentum-magnitude",
        "evaluate-de-broglie-wavelength-in-metres",
      ],
    },
    stem: baseStem,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 6: wave-particle-duality-de-broglie :: graphite-foil-electron-diffraction-rings
// ============================================================================

interface CrystalFoilPreset {
  readonly foilName: string;
  readonly dSpacingM: number;
  readonly dText: string;
  readonly screenDistM: number;
}

const CRYSTAL_FOILS: readonly CrystalFoilPreset[] = [
  { foilName: "polycrystalline graphite (100) planes", dSpacingM: 2.13e-10, dText: "2.13 × 10⁻¹⁰ m", screenDistM: 0.14 },
  { foilName: "polycrystalline graphite (110) planes", dSpacingM: 1.23e-10, dText: "1.23 × 10⁻¹⁰ m", screenDistM: 0.13 },
  { foilName: "thin polycrystalline aluminium foil", dSpacingM: 2.04e-10, dText: "2.04 × 10⁻¹⁰ m", screenDistM: 0.16 },
  { foilName: "evaporated polycrystalline gold film", dSpacingM: 2.35e-10, dText: "2.35 × 10⁻¹⁰ m", screenDistM: 0.15 },
  { foilName: "thin polycrystalline nickel foil", dSpacingM: 2.03e-10, dText: "2.03 × 10⁻¹⁰ m", screenDistM: 0.18 },
  { foilName: "nanocrystalline silicon membrane", dSpacingM: 3.14e-10, dText: "3.14 × 10⁻¹⁰ m", screenDistM: 0.20 },
  { foilName: "polycrystalline copper transmission film", dSpacingM: 2.09e-10, dText: "2.09 × 10⁻¹⁰ m", screenDistM: 0.12 },
  { foilName: "sputtered polycrystalline silver film", dSpacingM: 2.36e-10, dText: "2.36 × 10⁻¹⁰ m", screenDistM: 0.17 },
  { foilName: "ultrathin polycrystalline platinum foil", dSpacingM: 2.27e-10, dText: "2.27 × 10⁻¹⁰ m", screenDistM: 0.19 },
];

function buildArchetype6Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch6:${seed}:${variantIdx}`);
  const foil = CRYSTAL_FOILS[variantIdx % CRYSTAL_FOILS.length];
  const voltages = [260, 320, 390, 480, 620, 780, 980, 1300, 1750, 2250, 2900, 3650, 4450];
  const voltageV =
    voltages[
      (variantIdx * 2 + Math.floor(variantIdx / CRYSTAL_FOILS.length)) %
        voltages.length
    ];

  const spec: MatterWavesScenarioSpec = {
    kind: "matter-waves",
    particle: "electron",
    acceleratingVoltageV: voltageV,
    latticeSpacingM: foil.dSpacingM,
    screenDistanceM: foil.screenDistM,
  };

  const sol = solveQuantumNuclearScenario(spec) as MatterWavesSolution;
  const diff = sol.diffraction!;
  const hiddenQuantities = [
    "kineticEnergyJ",
    "speedMs",
    "momentumNs",
    "deBroglieWavelengthM",
    "deBroglieWavelengthNm",
    "deBroglieWavelengthPm",
    "sinTheta",
    "firstOrderAngleRad",
    "firstOrderAngleDeg",
    "ringRadiusM",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "acceleratingVoltageV", value: voltageV, unit: "V", source: "stem" },
    { name: "latticeSpacingM", value: foil.dSpacingM, unit: "m", source: "stem" },
    { name: "screenDistanceM", value: foil.screenDistM, unit: "m", source: "stem" },
    { name: "planckConstantJs", value: 6.63e-34, unit: "J s", source: "stem" },
  ];

  const syllabi = resolveSyllabusTagsFromCrosswalk(
    "wave-particle-duality-de-broglie",
    {
      format,
      ibLevelOverride: "HL",
      alevelLevelOverride: "Y12",
      ncukLevelOverride: "IFY-S2",
    },
  );
  const difficulty = chooseDifficulty(variantIdx);

  const frames = [
    `In an evacuated electron-diffraction tube, electrons accelerated from rest through ${voltageV} V pass through ${foil.foilName} of interplanar spacing d = ${foil.dText} and form concentric bright rings on a phosphor screen L = ${foil.screenDistM} m behind the foil. Use sin θ = λ / d and ring radius r = L tan θ, taking h = 6.63 × 10⁻³⁴ J s, mₑ = 9.11 × 10⁻³¹ kg, and e = 1.60 × 10⁻¹⁹ C.`,
    `A demonstration cathode-ray diffraction tube accelerates electrons across ${voltageV} V onto ${foil.foilName} (atomic plane spacing d = ${foil.dText}) located L = ${foil.screenDistM} m in front of a fluorescent viewing screen. Modelling first-order diffraction via sin θ = λ / d and r = L tan θ (h = 6.63 × 10⁻³⁴ J s, mₑ = 9.11 × 10⁻³¹ kg, e = 1.60 × 10⁻¹⁹ C):`,
    `Electrons accelerated from rest by a ${voltageV} V supply diffract through ${foil.foilName} with lattice spacing d = ${foil.dText}, producing a circular first-order ring on a screen at distance L = ${foil.screenDistM} m. Given sin θ = λ / d, r = L tan θ, h = 6.63 × 10⁻³⁴ J s, mₑ = 9.11 × 10⁻³¹ kg, and e = 1.60 × 10⁻¹⁹ C:`,
    `To verify wave-particle duality, a ${voltageV} V electron beam is directed perpendicularly onto ${foil.foilName} (d = ${foil.dText}) at distance L = ${foil.screenDistM} m from a detector screen. Take first-order ring geometry sin θ = λ / d and r = L tan θ, with h = 6.63 × 10⁻³⁴ J s, mₑ = 9.11 × 10⁻³¹ kg, and e = 1.60 × 10⁻¹⁹ C.`,
    `Transmission electron diffraction through ${foil.foilName} (spacing d = ${foil.dText}) uses a ${voltageV} V anode supply and a phosphor target placed L = ${foil.screenDistM} m downstream. Apply sin θ = λ / d and r = L tan θ, assuming h = 6.63 × 10⁻³⁴ J s, mₑ = 9.11 × 10⁻³¹ kg, and e = 1.60 × 10⁻¹⁹ C.`,
    `Within a Thomson-type diffraction bulb, ${voltageV} V electrons traverse ${foil.foilName} whose crystal planes are separated by d = ${foil.dText}, illuminating a ring on a screen L = ${foil.screenDistM} m away (sin θ = λ / d, r = L tan θ, h = 6.63 × 10⁻³⁴ J s, mₑ = 9.11 × 10⁻³¹ kg, e = 1.60 × 10⁻¹⁹ C).`,
    `Collimated electrons accelerated from rest across ${voltageV} V scatter coherently from ${foil.foilName} (d = ${foil.dText}) onto an observation screen at L = ${foil.screenDistM} m. Use sin θ = λ / d and r = L tan θ with h = 6.63 × 10⁻³⁴ J s, mₑ = 9.11 × 10⁻³¹ kg, and e = 1.60 × 10⁻¹⁹ C.`,
  ];
  const baseStem = frames[(variantIdx * 3 + Math.floor(variantIdx / 9)) % frames.length];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const askRadius = variantIdx % 2 === 0;

    if (askRadius) {
      const rRing = diff.ringRadiusM!;
      const stem = `${baseStem} What is the radius r of the first-order bright diffraction ring on the screen?`;
      const options = buildDistinctMcqOptions({
        truth: rRing,
        unit: "m",
        correctSlot: slot,
        distractors: [
          {
            value: 2 * rRing,
            rationale:
              "Calculates the full diameter 2r of the diffraction ring instead of its radius r.",
          },
          {
            value: foil.screenDistM * (sol.deBroglieWavelengthM * Math.SQRT2 / foil.dSpacingM),
            rationale:
              "Omits the factor of 2 inside p = √(2mₑeV), overestimating λ and ring radius by √2.",
          },
          {
            value: (foil.dSpacingM / sol.deBroglieWavelengthM) * foil.screenDistM,
            rationale: "Inverts the diffraction ratio as d / λ instead of λ / d.",
          },
        ],
        fallbackDistractors: [
          {
            value: rRing / foil.screenDistM,
            rationale: "Reports tan θ directly without multiplying by the screen distance L.",
          },
        ],
      });
      const ans = formatQuantity3sf(rRing, "m");
      return {
        id,
        conceptId: "wave-particle-duality-de-broglie",
        templateArchetype: "graphite-foil-electron-diffraction-rings",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: {
          targetSummary:
            "Determine phosphor-screen diffraction ring radius from electron accelerating voltage and crystal plane spacing",
          distractorStrategy: [
            "report-ring-diameter-instead-of-radius",
            "omit-factor-of-two-in-electron-momentum",
            "invert-wavelength-to-lattice-spacing-ratio",
          ],
        },
        targetQuantityKey: "ringRadiusM",
        stem,
        options,
        workedSolution: `λ = h / √(2mₑeV) = ${formatQuantity3sf(sol.deBroglieWavelengthM, "m")}. Then sin θ = λ / d = ${formatQuantity3sf(diff.sinTheta)}, giving θ = ${formatQuantity3sf(diff.firstOrderAngleDeg, "°")} and ring radius r = L tan θ = ${foil.screenDistM} × tan(${formatQuantity3sf(diff.firstOrderAngleDeg)}°) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds λ = ${formatQuantity3sf(sol.deBroglieWavelengthM, "m")}, θ = ${formatQuantity3sf(diff.firstOrderAngleDeg)}°, and r = L tan θ = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${baseStem} What is the first-order diffraction angle θ, in degrees?`;
    const wrongRad = diff.firstOrderAngleRad;
    const halfBraggDeg =
      (Math.asin(Math.min(0.99, sol.deBroglieWavelengthM / (2 * foil.dSpacingM))) *
        180) /
      Math.PI;
    const noTwoDeg =
      Math.min(
        85,
        (Math.asin(
          Math.min(
            0.99,
            (sol.deBroglieWavelengthM * Math.SQRT2) / foil.dSpacingM,
          ),
        ) *
          180) /
          Math.PI,
      );
    const options = buildDistinctMcqOptions({
      truth: diff.firstOrderAngleDeg,
      unit: "°",
      correctSlot: slot,
      distractors: [
        {
          value: wrongRad,
          rationale:
            "Leaves arcsin(λ / d) in radians while labelling the answer in degrees.",
        },
        {
          value: halfBraggDeg,
          rationale:
            "Inserts an extra factor of 2 in the denominator despite sin θ = λ / d being specified.",
        },
        {
          value: noTwoDeg,
          rationale:
            "Omits the factor of 2 in p = √(2mₑeV) when computing the electron de Broglie wavelength.",
        },
      ],
      fallbackDistractors: [
        {
          value: diff.firstOrderAngleDeg * 2,
          rationale: "Doubles the deflection angle θ.",
        },
      ],
    });
    const ans = formatQuantity3sf(diff.firstOrderAngleDeg, "°");
    return {
      id,
      conceptId: "wave-particle-duality-de-broglie",
      templateArchetype: "graphite-foil-electron-diffraction-rings",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Evaluate first-order polycrystalline electron diffraction angle in degrees",
        distractorStrategy: [
          "report-radian-angle-without-degree-conversion",
          "omit-factor-of-two-in-kinetic-momentum-relation",
          "halve-diffraction-ratio-unnecessarily",
        ],
      },
      targetQuantityKey: "firstOrderAngleDeg",
      stem,
      options,
      workedSolution: `Electron wavelength λ = h / √(2mₑeV) = ${formatQuantity3sf(sol.deBroglieWavelengthM, "m")}. Using sin θ = λ / d = ${formatQuantity3sf(diff.sinTheta)} yields θ = arcsin(${formatQuantity3sf(diff.sinTheta)}) = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates λ = h / √(2mₑeV) and θ = arcsin(λ / d) = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `Show how the electron momentum is obtained from the ${voltageV} V potential difference and calculate the de Broglie wavelength λ in picometres (pm).`,
      marks: 2,
      targetQuantityKey: "deBroglieWavelengthPm",
      truth: sol.deBroglieWavelengthPm,
      unit: "pm",
      methodCriterion: "Uses λ = h / √(2mₑeV) with SI values and converts to picometres.",
      workingSteps: [
        `p = √(2mₑeV) = ${formatQuantity3sf(sol.momentumNs, "N s")}.`,
        `λ = h / p = ${formatQuantity3sf(sol.deBroglieWavelengthM, "m")} = ${formatQuantity3sf(sol.deBroglieWavelengthPm, "pm")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Calculate the first-order diffraction angle θ, in degrees, at the crystal foil.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "firstOrderAngleDeg",
      truth: diff.firstOrderAngleDeg,
      unit: "°",
      methodCriterion: "Applies sin θ = λ / d and converts to degrees.",
      workingSteps: [
        `sin θ = λ / d = ${formatQuantity3sf(sol.deBroglieWavelengthM)} / (${foil.dText}) = ${formatQuantity3sf(diff.sinTheta)}.`,
        `θ = ${formatQuantity3sf(diff.firstOrderAngleDeg, "°")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Determine the radius r, in metres, of the first-order diffraction ring observed on the phosphor screen.`,
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "ringRadiusM",
      truth: diff.ringRadiusM!,
      unit: "m",
      methodCriterion: "Evaluates r = L tan θ using the screen distance L.",
      workingSteps: [
        `r = L tan θ = ${foil.screenDistM} × tan(${formatQuantity3sf(diff.firstOrderAngleDeg)}°) = ${formatQuantity3sf(diff.ringRadiusM!, "m")}.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "wave-particle-duality-de-broglie",
    templateArchetype: "graphite-foil-electron-diffraction-rings",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Link electron de Broglie wavelength to polycrystalline diffraction angle and phosphor-screen ring radius",
      subpartStrategy: [
        "compute-de-broglie-wavelength-from-accelerating-voltage",
        "evaluate-first-order-diffraction-angle",
        "compute-screen-ring-radius",
      ],
    },
    stem: baseStem,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 7: radioactive-decay-half-life :: background-corrected-integer-half-life-count
// ============================================================================

interface CountRateIsotopePreset {
  readonly label: string;
  readonly proseName: string;
  readonly halfLife: number;
  readonly unit: TimeUnit;
  readonly unitWord: string;
  readonly labContext: string;
}

const COUNT_RATE_ISOTOPES: readonly CountRateIsotopePreset[] = [
  { label: "⁹⁹ᵐTc", proseName: "technetium-99m", halfLife: 6.0, unit: "h", unitWord: "hours", labContext: "a hospital nuclear-medicine dispenser" },
  { label: "¹³⁷ᵐBa", proseName: "metastable barium", halfLife: 2.6, unit: "min", unitWord: "minutes", labContext: "a school isotope-generator bench experiment" },
  { label: "²⁴Na", proseName: "sodium-24", halfLife: 15.0, unit: "h", unitWord: "hours", labContext: "a pipeline leak-detection Geiger–Müller station" },
  { label: "¹³¹I", proseName: "iodine-131", halfLife: 8.0, unit: "d", unitWord: "days", labContext: "a thyroid-therapy assay counter" },
  { label: "²²⁰Rn", proseName: "radon-220 (thoron)", halfLife: 55.6, unit: "s", unitWord: "seconds", labContext: "a sealed ion-chamber radon monitor" },
  { label: "¹⁸F", proseName: "fluorine-18", halfLife: 110, unit: "min", unitWord: "minutes", labContext: "a PET radiopharmacy quality-control well counter" },
  { label: "⁶⁸Ga", proseName: "gallium-68", halfLife: 68.0, unit: "min", unitWord: "minutes", labContext: "a positron-imaging elution calibrator" },
  { label: "¹²³I", proseName: "iodine-123", halfLife: 13.2, unit: "h", unitWord: "hours", labContext: "a gamma-camera collimator test rig" },
  { label: "²¹⁴Bi", proseName: "bismuth-214", halfLife: 19.9, unit: "min", unitWord: "minutes", labContext: "an environmental air-filter beta counter" },
  { label: "²¹⁰Po", proseName: "polonium-210", halfLife: 138, unit: "d", unitWord: "days", labContext: "an alpha-scintillation foil monitor" },
];

function buildArchetype7Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch7:${seed}:${variantIdx}`);
  const iso = COUNT_RATE_ISOTOPES[variantIdx % COUNT_RATE_ISOTOPES.length];
  const nHalfLivesChoices = [2, 3, 4, 5, 3, 2, 4];
  const nHalfLives = nHalfLivesChoices[variantIdx % nHalfLivesChoices.length];
  const elapsedTime = Number((iso.halfLife * nHalfLives).toPrecision(5));

  const bgChoices = [18, 22, 26, 30, 34, 38, 42, 46];
  const bg = bgChoices[variantIdx % bgChoices.length];
  const finalNetChoices = [25, 32, 40, 45, 50, 60, 35, 48];
  const finalNet = finalNetChoices[(variantIdx * 3) % finalNetChoices.length];
  const initialNet = finalNet * 2 ** nHalfLives;
  const initialTotal = initialNet + bg;

  const spec: RadioactiveDecayScenarioSpec = {
    kind: "radioactive-decay",
    nuclideLabel: iso.label,
    timeUnit: iso.unit,
    halfLife: iso.halfLife,
    elapsedTime,
    initialTotalCountRate: initialTotal,
    backgroundCountRate: bg,
    countRateUnitLabel: "counts min⁻¹",
    plotQuantity: "count-rate",
  };

  const sol = solveQuantumNuclearScenario(spec) as RadioactiveDecaySolution;
  const hiddenQuantities = [
    "decayConstant",
    "decayConstantPerS",
    "numberOfHalfLives",
    "remainingFraction",
    "decayedFraction",
    "initialNetCountRate",
    "remainingNetCountRate",
    "remainingTotalCountRate",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "halfLife", value: iso.halfLife, source: "stem" },
    { name: "elapsedTime", value: elapsedTime, source: "stem" },
    { name: "initialTotalCountRate", value: initialTotal, source: "stem" },
    { name: "backgroundCountRate", value: bg, source: "stem" },
  ];

  const syllabi = resolveSyllabusTagsFromCrosswalk("radioactive-decay-half-life", {
    format,
    ibLevelOverride: "SL",
    alevelLevelOverride: "Y13",
    ncukLevelOverride: "IFY-S2",
  });
  const difficulty = chooseDifficulty(variantIdx);

  const frames = [
    `At ${iso.labContext}, a Geiger–Müller tube measures a mean background count rate of ${bg} counts min⁻¹ with no sample present. When a ${iso.proseName} source of half-life ${iso.halfLife} ${iso.unit} is placed in front of the window at t = 0, the total recorded count rate is ${initialTotal} counts min⁻¹. The detector is read again at t = ${elapsedTime} ${iso.unit}.`,
    `Before testing a ${iso.proseName} sample (half-life ${iso.halfLife} ${iso.unit}) in ${iso.labContext}, ambient background radiation registers ${bg} counts min⁻¹. Introducing the source raises the total detector reading to ${initialTotal} counts min⁻¹ initially, and monitoring continues for an elapsed interval of ${elapsedTime} ${iso.unit}.`,
    `A radiation detector in ${iso.labContext} operates in a steady background of ${bg} counts min⁻¹. A fresh ${iso.proseName} specimen with half-life ${iso.halfLife} ${iso.unit} gives an initial uncorrected reading of ${initialTotal} counts min⁻¹. Consider the detector response after ${elapsedTime} ${iso.unit}.`,
    `During an assay in ${iso.labContext}, background radiation alone accounts for ${bg} counts min⁻¹. With a ${iso.proseName} source (half-life ${iso.halfLife} ${iso.unit}) fixed in position, the initial total count rate is ${initialTotal} counts min⁻¹; measurements are repeated ${elapsedTime} ${iso.unit} later.`,
  ];
  const baseStem = frames[variantIdx % frames.length];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const forgotSubtractBg = initialTotal / 2 ** nHalfLives;
    const forgotAddBgBack = sol.remainingNetCountRate!;
    const linearDivide = bg + initialNet / (2 * nHalfLives);
    const subtractAfterHalving = initialTotal / 2 ** nHalfLives - bg;

    const stem = `${baseStem} What total count rate (including background) does the detector record at t = ${elapsedTime} ${iso.unit}?`;
    const options = buildDistinctMcqOptions({
      truth: sol.remainingTotalCountRate!,
      unit: "counts min⁻¹",
      correctSlot: slot,
      distractors: [
        {
          value: forgotSubtractBg,
          rationale:
            "Divides the initial total count rate directly by 2ⁿ without subtracting the background count rate first.",
        },
        {
          value: forgotAddBgBack,
          rationale:
            "Correctly halves the background-subtracted net count rate but forgets to add the background count rate back to obtain the total detector reading.",
        },
        {
          value: nHalfLives === 2 ? Math.max(4, subtractAfterHalving) : linearDivide,
          rationale:
            nHalfLives === 2
              ? "Halves the uncorrected count rate first and subtracts the background count rate at the end."
              : "Divides the net count rate by 2n instead of 2ⁿ.",
        },
      ],
      fallbackDistractors: [
        {
          value: bg + initialNet / 2 ** (nHalfLives - 1),
          rationale: "Miscounts the number of elapsed half-lives by one.",
        },
      ],
    });
    const ans = formatQuantity3sf(sol.remainingTotalCountRate!, "counts min⁻¹");

    return {
      id,
      conceptId: "radioactive-decay-half-life",
      templateArchetype: "background-corrected-integer-half-life-count",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Evaluate total detector count rate after an integer number of half-lives with background correction",
        distractorStrategy: [
          "halve-total-count-rate-without-background-subtraction",
          "omit-background-re-addition-on-final-detector-reading",
          "divide-by-linear-multiple-instead-of-power-of-two",
        ],
      },
      targetQuantityKey: "remainingTotalCountRate",
      stem,
      options,
      workedSolution: `Initial net count rate C₀ = ${initialTotal} − ${bg} = ${initialNet} counts min⁻¹. Number of half-lives n = ${elapsedTime} / ${iso.halfLife} = ${nHalfLives}. Remaining net count rate C = ${initialNet} / 2^${nHalfLives} = ${sol.remainingNetCountRate} counts min⁻¹. Total recorded count rate = ${sol.remainingNetCountRate} + ${bg} = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Subtracts background (${initialNet}), divides by 2^${nHalfLives} (${sol.remainingNetCountRate}), and adds ${bg} back to obtain ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `Determine the initial corrected count rate due solely to the ${iso.proseName} source at t = 0.`,
      marks: 1,
      targetQuantityKey: "initialNetCountRate",
      truth: sol.initialNetCountRate!,
      unit: "counts min⁻¹",
      methodCriterion: "Subtracts background count rate from initial total count rate",
      workingSteps: [
        `C₀,net = ${initialTotal} − ${bg} = ${formatQuantity3sf(sol.initialNetCountRate!, "counts min⁻¹")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Calculate the corrected count rate from the source alone at t = ${elapsedTime} ${iso.unit}.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "remainingNetCountRate",
      truth: sol.remainingNetCountRate!,
      unit: "counts min⁻¹",
      methodCriterion: `Identifies ${nHalfLives} elapsed half-lives and divides initial net count rate by 2^${nHalfLives}.`,
      workingSteps: [
        `n = ${elapsedTime} / ${iso.halfLife} = ${nHalfLives} half-lives.`,
        `C_net = ${initialNet} / 2^${nHalfLives} = ${formatQuantity3sf(sol.remainingNetCountRate!, "counts min⁻¹")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `State the total count rate displayed by the detector at t = ${elapsedTime} ${iso.unit}.`,
      marks: 1,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "remainingTotalCountRate",
      truth: sol.remainingTotalCountRate!,
      unit: "counts min⁻¹",
      methodCriterion: "Adds background count rate back to the remaining net count rate",
      workingSteps: [
        `C_total = ${sol.remainingNetCountRate} + ${bg} = ${formatQuantity3sf(sol.remainingTotalCountRate!, "counts min⁻¹")}.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "radioactive-decay-half-life",
    templateArchetype: "background-corrected-integer-half-life-count",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Separate background count rate, apply integer half-life reduction, and reconstruct final detector count rate",
      subpartStrategy: [
        "subtract-background-for-initial-net-rate",
        "apply-integer-half-life-power-law-to-net-rate",
        "add-background-for-final-detector-reading",
      ],
    },
    stem: baseStem,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 8: radioactive-decay-half-life :: exponential-isotope-activity-time-conversion
// ============================================================================

interface ExponentialIsotopePreset {
  readonly label: string;
  readonly proseName: string;
  readonly halfLife: number;
  readonly unit: "min" | "h" | "d";
  readonly unitSec: number;
  readonly clinicalContext: string;
}

const EXPONENTIAL_ISOTOPES: readonly ExponentialIsotopePreset[] = [
  { label: "¹⁸F", proseName: "fluorine-18 FDG tracer", halfLife: 110, unit: "min", unitSec: 60, clinicalContext: "an oncology PET imaging suite" },
  { label: "⁹⁹ᵐTc", proseName: "technetium-99m", halfLife: 6.02, unit: "h", unitSec: 3600, clinicalContext: "a cardiac perfusion gamma-camera clinic" },
  { label: "¹³¹I", proseName: "iodine-131", halfLife: 8.02, unit: "d", unitSec: 86400, clinicalContext: "a hospital radioiodine therapy ward" },
  { label: "¹⁷⁷Lu", proseName: "lutetium-177", halfLife: 6.65, unit: "d", unitSec: 86400, clinicalContext: "a targeted radionuclide therapy pharmacy" },
  { label: "⁶⁴Cu", proseName: "copper-64", halfLife: 12.7, unit: "h", unitSec: 3600, clinicalContext: "a cyclotron radiochemistry laboratory" },
  { label: "²⁴Na", proseName: "sodium-24", halfLife: 15.0, unit: "h", unitSec: 3600, clinicalContext: "a hydrology radiotracer injection test" },
  { label: "⁶⁸Ga", proseName: "gallium-68", halfLife: 67.7, unit: "min", unitSec: 60, clinicalContext: "a neuroendocrine PET diagnostic unit" },
  { label: "²²³Ra", proseName: "radium-223", halfLife: 11.4, unit: "d", unitSec: 86400, clinicalContext: "an alpha-radiopharmaceutical dosimetry lab" },
  { label: "¹⁹²Ir", proseName: "iridium-192", halfLife: 73.8, unit: "d", unitSec: 86400, clinicalContext: "a weld-inspection gamma radiography vault" },
  { label: "¹¹¹In", proseName: "indium-111", halfLife: 2.80, unit: "d", unitSec: 86400, clinicalContext: "a leukocyte-labelling nuclear medicine lab" },
];

function buildArchetype8Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch8:${seed}:${variantIdx}`);
  const iso = EXPONENTIAL_ISOTOPES[variantIdx % EXPONENTIAL_ISOTOPES.length];
  const hlMultipliers = [0.58, 0.74, 0.91, 1.18, 1.37, 1.63, 1.89, 2.18, 2.47, 2.83, 3.24];
  const elapsedTime = Number(
    (
      iso.halfLife *
      hlMultipliers[
        (variantIdx * 2 + Math.floor(variantIdx / EXPONENTIAL_ISOTOPES.length)) %
          hlMultipliers.length
      ]
    ).toPrecision(3),
  );
  const nucleiMultipliers = [
    1.5e13, 2.4e13, 3.7e13, 5.8e13, 8.6e13, 1.3e14, 2.9e14, 4.7e14, 7.4e14,
    1.4e15, 2.6e15, 4.3e15, 6.8e15,
  ];
  const initialNuclei =
    nucleiMultipliers[(variantIdx * 3) % nucleiMultipliers.length];

  const spec: RadioactiveDecayScenarioSpec = {
    kind: "radioactive-decay",
    nuclideLabel: iso.label,
    timeUnit: iso.unit,
    halfLife: iso.halfLife,
    elapsedTime,
    initialNuclei,
    plotQuantity: "activity",
  };

  const sol = solveQuantumNuclearScenario(spec) as RadioactiveDecaySolution;
  const hiddenQuantities = [
    "decayConstant",
    "decayConstantPerS",
    "numberOfHalfLives",
    "remainingFraction",
    "decayedFraction",
    "remainingNuclei",
    "decayedNuclei",
    "initialActivityBq",
    "remainingActivityBq",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "halfLife", value: iso.halfLife, source: "stem" },
    { name: "elapsedTime", value: elapsedTime, source: "stem" },
    { name: "initialNuclei", value: initialNuclei, source: "stem" },
  ];

  const syllabi = resolveSyllabusTagsFromCrosswalk("radioactive-decay-half-life", {
    format,
    ibLevelOverride: "HL",
    alevelLevelOverride: "Y13",
    ncukLevelOverride: "IFY-S2",
  });
  const difficulty = chooseDifficulty(variantIdx);

  const frames = [
    `A freshly prepared vial in ${iso.clinicalContext} contains N₀ = ${formatExactGiven(initialNuclei)} undecayed nuclei of ${iso.proseName}, whose half-life is ${iso.halfLife} ${iso.unit}. The vial is stored for t = ${elapsedTime} ${iso.unit} before administration.`,
    `In ${iso.clinicalContext}, a radiochemist prepares ${formatExactGiven(initialNuclei)} radioactive nuclei of ${iso.proseName} (half-life T₁/₂ = ${iso.halfLife} ${iso.unit}) and measures the sample again after an elapsed time of ${elapsedTime} ${iso.unit}.`,
    `Quality-assurance logs in ${iso.clinicalContext} record an initial population of ${formatExactGiven(initialNuclei)} ${iso.proseName} nuclei with half-life ${iso.halfLife} ${iso.unit}. Consider the source after ${elapsedTime} ${iso.unit} of continuous exponential decay.`,
    `A sealed capsule in ${iso.clinicalContext} holds ${formatExactGiven(initialNuclei)} unstable nuclei of ${iso.proseName} (T₁/₂ = ${iso.halfLife} ${iso.unit}), decaying exponentially over a transport interval of ${elapsedTime} ${iso.unit}.`,
  ];
  const baseStem = frames[variantIdx % frames.length];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const askRemainingActivity = variantIdx % 2 === 0;

    if (askRemainingActivity) {
      const stem = `${baseStem} What is the activity of the sample, in becquerels (Bq), at t = ${elapsedTime} ${iso.unit}?`;
      const unConvertedA0 = (Math.LN2 / iso.halfLife) * initialNuclei;
      const unConvertedRem = unConvertedA0 * sol.remainingFraction;
      const noLn2Rem = (initialNuclei / sol.halfLifeS) * sol.remainingFraction;

      const options = buildDistinctMcqOptions({
        truth: sol.remainingActivityBq!,
        unit: "Bq",
        correctSlot: slot,
        distractors: [
          {
            value: unConvertedRem,
            rationale: `Fails to convert half-life from ${iso.unit} to seconds (× ${iso.unitSec}) when computing A = λN in Bq (s⁻¹).`,
          },
          {
            value: sol.initialActivityBq!,
            rationale:
              "Calculates the initial activity A₀ = λN₀ at t = 0 without multiplying by the exponential decay factor e^(−λt).",
          },
          {
            value: noLn2Rem,
            rationale:
              "Uses λ = 1 / T₁/₂ instead of λ = ln 2 / T₁/₂ when converting half-life to decay constant.",
          },
        ],
        fallbackDistractors: [
          {
            value: sol.initialActivityBq! * (1 - sol.remainingFraction),
            rationale:
              "Multiplies A₀ by (1 − e^(−λt)) instead of e^(−λt).",
          },
        ],
      });
      const ans = formatQuantity3sf(sol.remainingActivityBq!, "Bq");
      return {
        id,
        conceptId: "radioactive-decay-half-life",
        templateArchetype: "exponential-isotope-activity-time-conversion",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: {
          targetSummary:
            "Evaluate remaining sample activity in Bq using time-unit conversion to seconds and exponential decay",
          distractorStrategy: [
            "omit-time-unit-conversion-to-seconds-in-activity",
            "stop-at-initial-activity-without-exponential-factor",
            "omit-natural-log-of-two-in-decay-constant",
          ],
        },
        targetQuantityKey: "remainingActivityBq",
        stem,
        options,
        workedSolution: `T₁/₂ = ${iso.halfLife} × ${iso.unitSec} = ${formatQuantity3sf(sol.halfLifeS, "s")}, so λ = ln 2 / T₁/₂ = ${formatQuantity3sf(sol.decayConstantPerS, "s⁻¹")}. Initial activity A₀ = λN₀ = ${formatQuantity3sf(sol.initialActivityBq!, "Bq")}. At t = ${elapsedTime} ${iso.unit}, A = A₀ e^(−λt) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Converts T₁/₂ to seconds, finds A₀ = λN₀, and evaluates A = A₀ e^(−λt) = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${baseStem} What is the initial activity A₀ of the sample, in Bq, at t = 0?`;
    const options = buildDistinctMcqOptions({
      truth: sol.initialActivityBq!,
      unit: "Bq",
      correctSlot: slot,
      distractors: [
        {
          value: (Math.LN2 / iso.halfLife) * initialNuclei,
          rationale: `Leaves T₁/₂ in ${iso.unit} instead of converting to seconds when evaluating A₀ = (ln 2 / T₁/₂) N₀ in Bq.`,
        },
        {
          value: initialNuclei / sol.halfLifeS,
          rationale: "Omits the factor ln 2 ≈ 0.693 in λ = ln 2 / T₁/₂.",
        },
        {
          value: sol.remainingActivityBq!,
          rationale: "Computes the decayed activity at elapsed time t instead of A₀ at t = 0.",
        },
      ],
      fallbackDistractors: [
        {
          value: sol.initialActivityBq! * Math.LN2,
          rationale: "Multiplies by ln 2 twice when computing A₀.",
        },
      ],
    });
    const ans = formatQuantity3sf(sol.initialActivityBq!, "Bq");
    return {
      id,
      conceptId: "radioactive-decay-half-life",
      templateArchetype: "exponential-isotope-activity-time-conversion",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Compute initial activity A = lambda N in becquerels with explicit time-unit conversion",
        distractorStrategy: [
          "omit-half-life-conversion-to-seconds",
          "omit-natural-logarithm-factor-in-decay-constant",
          "evaluate-decayed-activity-instead-of-initial",
        ],
      },
      targetQuantityKey: "initialActivityBq",
      stem,
      options,
      workedSolution: `Converting half-life to SI seconds: T₁/₂ = ${iso.halfLife} × ${iso.unitSec} = ${formatQuantity3sf(sol.halfLifeS, "s")}. Decay constant λ = ln 2 / T₁/₂ = ${formatQuantity3sf(sol.decayConstantPerS, "s⁻¹")}. Initial activity A₀ = λN₀ = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates λ = ln 2 / (${iso.halfLife} × ${iso.unitSec}) and A₀ = λN₀ = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `Show the conversion of the half-life to seconds and calculate the decay constant λ in s⁻¹.`,
      marks: 2,
      targetQuantityKey: "decayConstantPerS",
      truth: sol.decayConstantPerS,
      unit: "s⁻¹",
      methodCriterion: `Converts T₁/₂ from ${iso.unit} to seconds and applies λ = ln 2 / T₁/₂.`,
      workingSteps: [
        `T₁/₂ = ${iso.halfLife} × ${iso.unitSec} = ${formatQuantity3sf(sol.halfLifeS, "s")}.`,
        `λ = ln 2 / T₁/₂ = 0.69315 / ${formatQuantity3sf(sol.halfLifeS)} = ${formatQuantity3sf(sol.decayConstantPerS, "s⁻¹")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Calculate the initial activity A₀ of the sample, in Bq, at t = 0.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "initialActivityBq",
      truth: sol.initialActivityBq!,
      unit: "Bq",
      methodCriterion: "Multiplies λ in s⁻¹ by N₀ using A₀ = λN₀.",
      workingSteps: [
        `A₀ = λN₀ = (${formatQuantity3sf(sol.decayConstantPerS)})(${formatExactGiven(initialNuclei)}) = ${formatQuantity3sf(sol.initialActivityBq!, "Bq")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Determine the activity A of the sample, in Bq, after t = ${elapsedTime} ${iso.unit}.`,
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "remainingActivityBq",
      truth: sol.remainingActivityBq!,
      unit: "Bq",
      methodCriterion: "Applies exponential decay law A = A₀ e^(−λt) with consistent time units.",
      workingSteps: [
        `λt = (ln 2)(${elapsedTime} / ${iso.halfLife}) = ${formatQuantity3sf(Math.LN2 * sol.numberOfHalfLives)}.`,
        `A = A₀ e^(−λt) = ${formatQuantity3sf(sol.remainingActivityBq!, "Bq")}.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "radioactive-decay-half-life",
    templateArchetype: "exponential-isotope-activity-time-conversion",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Convert half-life to SI seconds for decay constant, initial activity in Bq, and remaining exponential activity",
      subpartStrategy: [
        "convert-half-life-and-compute-decay-constant-per-second",
        "evaluate-initial-activity-in-becquerels",
        "evaluate-remaining-activity-via-exponential-law",
      ],
    },
    stem: baseStem,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 9: radioactive-decay-half-life :: actinide-series-alpha-beta-step-counts
// ============================================================================

interface ActinideChainPreset {
  readonly parentName: string;
  readonly parentSymbol: string;
  readonly A0: number;
  readonly Z0: number;
  readonly modes: readonly ("alpha" | "beta-minus")[];
  readonly mineralContext: string;
}

const ACTINIDE_CHAINS: readonly ActinideChainPreset[] = [
  {
    parentName: "uranium",
    parentSymbol: "U",
    A0: 238,
    Z0: 92,
    modes: ["alpha", "beta-minus", "beta-minus", "alpha", "alpha"],
    mineralContext: "a natural uraninite geological specimen",
  },
  {
    parentName: "thorium",
    parentSymbol: "Th",
    A0: 232,
    Z0: 90,
    modes: ["alpha", "beta-minus", "beta-minus", "alpha", "alpha", "alpha"],
    mineralContext: "a monazite mineral sand deposit",
  },
  {
    parentName: "neptunium",
    parentSymbol: "Np",
    A0: 237,
    Z0: 93,
    modes: ["alpha", "beta-minus", "alpha", "alpha", "beta-minus"],
    mineralContext: "an actinide transmutation target rod",
  },
  {
    parentName: "uranium",
    parentSymbol: "U",
    A0: 235,
    Z0: 92,
    modes: ["alpha", "beta-minus", "alpha", "beta-minus", "alpha", "alpha"],
    mineralContext: "an ancient zircon geochronology crystal",
  },
  {
    parentName: "plutonium",
    parentSymbol: "Pu",
    A0: 239,
    Z0: 94,
    modes: ["alpha", "alpha", "beta-minus", "beta-minus", "alpha"],
    mineralContext: "a deep-space radioisotope thermoelectric capsule",
  },
  {
    parentName: "americium",
    parentSymbol: "Am",
    A0: 241,
    Z0: 95,
    modes: ["alpha", "alpha", "beta-minus", "alpha", "alpha"],
    mineralContext: "a sealed industrial ionization chamber source",
  },
  {
    parentName: "radium",
    parentSymbol: "Ra",
    A0: 226,
    Z0: 88,
    modes: ["alpha", "alpha", "alpha", "beta-minus", "beta-minus", "alpha"],
    mineralContext: "a pitchblende ore core sample",
  },
  {
    parentName: "curium",
    parentSymbol: "Cm",
    A0: 244,
    Z0: 96,
    modes: ["alpha", "alpha", "alpha", "beta-minus", "beta-minus"],
    mineralContext: "an alpha-proton X-ray spectrometer source",
  },
  {
    parentName: "protactinium",
    parentSymbol: "Pa",
    A0: 231,
    Z0: 91,
    modes: ["alpha", "beta-minus", "alpha", "alpha", "beta-minus"],
    mineralContext: "a marine sediment core radiometric sample",
  },
  {
    parentName: "thorium",
    parentSymbol: "Th",
    A0: 228,
    Z0: 90,
    modes: ["alpha", "alpha", "alpha", "alpha", "beta-minus"],
    mineralContext: "a refractory thoriated-alloy sample",
  },
  {
    parentName: "californium",
    parentSymbol: "Cf",
    A0: 252,
    Z0: 98,
    modes: ["alpha", "alpha", "beta-minus", "alpha", "beta-minus"],
    mineralContext: "a neutron-moisture gauge isotopic capsule",
  },
  {
    parentName: "plutonium",
    parentSymbol: "Pu",
    A0: 240,
    Z0: 94,
    modes: ["alpha", "alpha", "beta-minus", "beta-minus", "alpha", "alpha"],
    mineralContext: "a spent-fuel isotopic Safeguards assay",
  },
  {
    parentName: "actinium",
    parentSymbol: "Ac",
    A0: 227,
    Z0: 89,
    modes: ["beta-minus", "alpha", "alpha", "alpha", "beta-minus"],
    mineralContext: "a targeted alpha-immunotherapy generator column",
  },
];

const EXTRA_CHAIN_SUFFIXES: ReadonlyArray<readonly ("alpha" | "beta-minus")[]> = [
  [],
  ["alpha"],
  ["alpha", "beta-minus"],
  ["beta-minus", "alpha"],
  ["alpha", "alpha", "beta-minus"],
];

function buildArchetype9Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch9:${seed}:${variantIdx}`);
  const chain = ACTINIDE_CHAINS[variantIdx % ACTINIDE_CHAINS.length];
  const suffixIdx =
    Math.floor(variantIdx / ACTINIDE_CHAINS.length) %
    EXTRA_CHAIN_SUFFIXES.length;
  const rawModes: readonly NuclearDecayMode[] = [
    ...chain.modes,
    ...EXTRA_CHAIN_SUFFIXES[suffixIdx],
  ];

  const steps: DecayStepInput[] = rawModes.map((mode, idx) => ({
    id: `s${idx + 1}`,
    mode,
  }));

  const spec: NuclearDecayChainScenarioSpec = {
    kind: "nuclear-decay-chain",
    parentNuclide: {
      massNumberA: chain.A0,
      atomicNumberZ: chain.Z0,
      symbol: chain.parentSymbol,
    },
    steps,
    chartAxes: variantIdx % 2 === 0 ? "N-vs-Z" : "A-vs-Z",
    showStabilityLine: true,
  };

  const sol = solveQuantumNuclearScenario(spec) as NuclearDecayChainSolution;
  const finalNuc = sol.nuclides[sol.nuclides.length - 1];
  const Af = finalNuc.massNumberA;
  const Zf = finalNuc.atomicNumberZ;

  const hiddenQuantities = [
    "totalAlphaCount",
    "totalBetaMinusCount",
    "totalBetaPlusCount",
    "totalGammaCount",
    "netDeltaA",
    "netDeltaZ",
    "netDeltaN",
    "finalNuclide",
    "daughterNuclides",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "parentA", value: chain.A0, source: "stem" },
    { name: "parentZ", value: chain.Z0, source: "stem" },
    { name: "finalA", value: Af, source: "stem" },
    { name: "finalZ", value: Zf, source: "stem" },
  ];

  const syllabi = resolveSyllabusTagsFromCrosswalk("radioactive-decay-half-life", {
    format,
    ibLevelOverride: "SL",
    alevelLevelOverride: "Y13",
    ncukLevelOverride: "IFY-S2",
  });
  const difficulty = chooseDifficulty(variantIdx);

  const frames = [
    `In ${chain.mineralContext}, a parent ${chain.parentName} nucleus with nucleon number A = ${chain.A0} and proton number Z = ${chain.Z0} decays solely by alpha and beta-minus emissions along the stability-chart path shown until reaching a daughter nuclide with A = ${Af} and Z = ${Zf}.`,
    `Radiochemical assay of ${chain.mineralContext} tracks a ${chain.parentName} parent nuclide (A = ${chain.A0}, Z = ${chain.Z0}) through sequential alpha and beta-minus decays into a daughter nuclide having A = ${Af} and Z = ${Zf}.`,
    `A multi-step nuclear decay series in ${chain.mineralContext} transforms a parent ${chain.parentName} nucleus (nucleon number ${chain.A0}, proton number ${chain.Z0}) exclusively via alpha and beta-minus transitions into a final nuclide with nucleon number ${Af} and proton number ${Zf}.`,
    `Mass-spectrometric analysis of ${chain.mineralContext} identifies a decay chain starting from ${chain.parentName} (A = ${chain.A0}, Z = ${chain.Z0}) and ending at a daughter nucleus (A = ${Af}, Z = ${Zf}) via alpha and beta-minus steps only.`,
    `Starting from an unstable ${chain.parentName} isotope (A = ${chain.A0}, Z = ${chain.Z0}) within ${chain.mineralContext}, successive alpha and beta-minus disintegrations produce a nuclide at A = ${Af} and Z = ${Zf}.`,
    `Nuclear stability mapping of ${chain.mineralContext} connects parent ${chain.parentName} (A = ${chain.A0}, Z = ${chain.Z0}) to product nuclide (A = ${Af}, Z = ${Zf}) through a series consisting strictly of alpha and beta-minus emissions.`,
    `Within ${chain.mineralContext}, heavy ${chain.parentName} nuclei of mass number ${chain.A0} and atomic number ${chain.Z0} undergo alpha and beta-minus steps to reach A = ${Af}, Z = ${Zf}.`,
  ];
  const baseStem = frames[(variantIdx * 3 + suffixIdx) % frames.length];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const askBeta = variantIdx % 2 === 0;

    if (askBeta) {
      const stem = `${baseStem} How many beta-minus particles are emitted in this decay sequence?`;
      const naiveDeltaZ = Math.abs(chain.Z0 - Zf);
      const wrongSignBeta = 2 * sol.totalAlphaCount + (chain.Z0 - Zf);
      const options = buildDistinctMcqOptions({
        truth: sol.totalBetaMinusCount,
        unit: "",
        exactInteger: true,
        correctSlot: slot,
        distractors: [
          {
            value: naiveDeltaZ,
            rationale:
              "Takes |Z_parent − Z_daughter| directly without accounting for the −2Z reduction from each alpha emission.",
          },
          {
            value: wrongSignBeta,
            rationale:
              "Assigns ΔZ = −1 instead of ΔZ = +1 to beta-minus decay when solving the proton-number balance.",
          },
          {
            value: sol.totalAlphaCount,
            rationale:
              "Stops after finding the number of alpha particles ΔA / 4 instead of solving for beta-minus emissions.",
          },
        ],
        fallbackDistractors: [
          {
            value: sol.totalBetaMinusCount + 2,
            rationale: "Assumes each alpha particle reduces Z by 3 instead of 2.",
          },
        ],
      });
      const ans = formatQuantity3sf(sol.totalBetaMinusCount, "", true);
      return {
        id,
        conceptId: "radioactive-decay-half-life",
        templateArchetype: "actinide-series-alpha-beta-step-counts",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: {
          targetSummary:
            "Balance nucleon and proton numbers across an actinide decay chain to determine total beta-minus emissions",
          distractorStrategy: [
            "equate-beta-count-to-raw-proton-difference",
            "reverse-proton-number-change-sign-for-beta-minus",
            "report-alpha-count-instead-of-beta-count",
          ],
        },
        targetQuantityKey: "totalBetaMinusCount",
        stem,
        options,
        workedSolution: `Only alpha decay changes nucleon number A: Nα = (${chain.A0} − ${Af}) / 4 = ${sol.totalAlphaCount}. Proton balance gives ${Zf} = ${chain.Z0} − 2(${sol.totalAlphaCount}) + Nβ⁻, so Nβ⁻ = ${Zf} − ${chain.Z0 - 2 * sol.totalAlphaCount} = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds Nα = ${sol.totalAlphaCount} from ΔA / 4 and solves Z_f = Z_0 − 2Nα + Nβ⁻ to obtain Nβ⁻ = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${baseStem} What is the net change in neutron number ΔN = N_final − N_parent across the entire chain?`;
    const options = buildDistinctMcqOptions({
      truth: sol.netDeltaN,
      unit: "",
      exactInteger: true,
      correctSlot: slot,
      distractors: [
        {
          value: -sol.netDeltaN,
          rationale:
            "Computes N_parent − N_final with the opposite sign instead of ΔN = N_final − N_parent.",
        },
        {
          value: sol.netDeltaA,
          rationale:
            "Reports the net change in total nucleon number ΔA instead of neutron number ΔN.",
        },
        {
          value: sol.netDeltaZ,
          rationale:
            "Reports the net change in proton number ΔZ instead of neutron number ΔN.",
        },
      ],
      fallbackDistractors: [
        {
          value: -2 * sol.totalAlphaCount + sol.totalBetaMinusCount,
          rationale:
            "Treats beta-minus decay as increasing neutron number (+1) rather than converting a neutron into a proton (−1).",
        },
      ],
    });
    const ans = formatQuantity3sf(sol.netDeltaN, "", true);
    return {
      id,
      conceptId: "radioactive-decay-half-life",
      templateArchetype: "actinide-series-alpha-beta-step-counts",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Determine signed net change in neutron number between parent and daughter nuclides",
        distractorStrategy: [
          "reverse-sign-of-neutron-change",
          "confuse-nucleon-change-with-neutron-change",
          "confuse-proton-change-with-neutron-change",
        ],
      },
      targetQuantityKey: "netDeltaN",
      stem,
      options,
      workedSolution: `Parent neutron number N₀ = ${chain.A0} − ${chain.Z0} = ${chain.A0 - chain.Z0}. Final neutron number N_f = ${Af} − ${Zf} = ${Af - Zf}. Therefore ΔN = N_f − N₀ = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates N_f − N₀ = (${Af} − ${Zf}) − (${chain.A0} − ${chain.Z0}) = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `Determine the total number of alpha particles emitted in this decay sequence.`,
      marks: 2,
      targetQuantityKey: "totalAlphaCount",
      truth: sol.totalAlphaCount,
      unit: "",
      exactInteger: true,
      methodCriterion: "Recognizes that only alpha decay alters A by −4 per step.",
      workingSteps: [
        `ΔA = ${Af} − ${chain.A0} = ${sol.netDeltaA}.`,
        `Nα = |ΔA| / 4 = ${sol.totalAlphaCount}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Calculate the total number of beta-minus particles emitted.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "totalBetaMinusCount",
      truth: sol.totalBetaMinusCount,
      unit: "",
      exactInteger: true,
      methodCriterion: "Applies charge conservation Z_f = Z₀ − 2Nα + Nβ⁻.",
      workingSteps: [
        `${Zf} = ${chain.Z0} − 2(${sol.totalAlphaCount}) + Nβ⁻.`,
        `Nβ⁻ = ${sol.totalBetaMinusCount}.`,
      ],
    },
    {
      partId: "c",
      prompt: `State the net change in neutron number ΔN = N_final − N_parent.`,
      marks: 1,
      targetQuantityKey: "netDeltaN",
      truth: sol.netDeltaN,
      unit: "",
      exactInteger: true,
      methodCriterion: "Computes (A_f − Z_f) − (A₀ − Z₀)",
      workingSteps: [
        `ΔN = (${Af} − ${Zf}) − (${chain.A0} − ${chain.Z0}) = ${formatQuantity3sf(sol.netDeltaN, "", true)}.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "radioactive-decay-half-life",
    templateArchetype: "actinide-series-alpha-beta-step-counts",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Deduce alpha count, beta-minus count, and signed neutron-number shift from parent and daughter coordinates",
      subpartStrategy: [
        "determine-alpha-step-count-from-mass-number-change",
        "solve-proton-balance-for-beta-minus-count",
        "evaluate-signed-net-neutron-number-change",
      ],
    },
    stem: baseStem,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 10: fundamental-particles-quarks-leptons :: quark-level-beta-decay-chain-conservation
// (STRICTLY EXCLUDED FROM IB 2025 — A-Level Y12 & NCUK IFY-S2 ONLY)
// ============================================================================

interface QuarkBetaChainPreset {
  readonly parentName: string;
  readonly symbol: string;
  readonly A0: number;
  readonly Z0: number;
  readonly modes: readonly ("alpha" | "beta-minus" | "beta-plus")[];
  readonly betaKind: "beta-minus" | "beta-plus";
  readonly context: string;
}

const QUARK_BETA_CHAINS: readonly QuarkBetaChainPreset[] = [
  {
    parentName: "molybdenum",
    symbol: "Mo",
    A0: 99,
    Z0: 42,
    modes: ["beta-minus", "beta-minus"],
    betaKind: "beta-minus",
    context: "a reactor-produced medical generator sequence",
  },
  {
    parentName: "strontium",
    symbol: "Sr",
    A0: 90,
    Z0: 38,
    modes: ["beta-minus", "beta-minus"],
    betaKind: "beta-minus",
    context: "a fission-product beta-decay cascade",
  },
  {
    parentName: "tellurium",
    symbol: "Te",
    A0: 132,
    Z0: 52,
    modes: ["beta-minus", "beta-minus"],
    betaKind: "beta-minus",
    context: "a neutron-rich fission fragment chain",
  },
  {
    parentName: "xenon",
    symbol: "Xe",
    A0: 140,
    Z0: 54,
    modes: ["beta-minus", "beta-minus", "beta-minus", "beta-minus"],
    betaKind: "beta-minus",
    context: "an isobaric reactor noble-gas beta cascade",
  },
  {
    parentName: "krypton",
    symbol: "Kr",
    A0: 92,
    Z0: 36,
    modes: ["beta-minus", "beta-minus", "beta-minus", "beta-minus"],
    betaKind: "beta-minus",
    context: "a neutron-rich krypton weak-decay chain",
  },
  {
    parentName: "magnesium",
    symbol: "Mg",
    A0: 23,
    Z0: 12,
    modes: ["beta-plus"],
    betaKind: "beta-plus",
    context: "a proton-rich mirror-nucleus positron emitter",
  },
  {
    parentName: "titanium",
    symbol: "Ti",
    A0: 44,
    Z0: 22,
    modes: ["beta-plus", "beta-plus"],
    betaKind: "beta-plus",
    context: "a supernova nucleosynthesis positron-decay sequence",
  },
  {
    parentName: "germanium",
    symbol: "Ge",
    A0: 68,
    Z0: 32,
    modes: ["beta-plus", "beta-plus"],
    betaKind: "beta-plus",
    context: "a cyclotron-produced PET calibration parent chain",
  },
  {
    parentName: "neodymium",
    symbol: "Nd",
    A0: 140,
    Z0: 60,
    modes: ["beta-plus", "beta-plus"],
    betaKind: "beta-plus",
    context: "a proton-rich lanthanide weak-interaction sequence",
  },
  {
    parentName: "cerium",
    symbol: "Ce",
    A0: 146,
    Z0: 58,
    modes: ["beta-minus", "beta-minus", "beta-minus"],
    betaKind: "beta-minus",
    context: "a lanthanide weak-decay spectrometer study",
  },
  {
    parentName: "carbon",
    symbol: "C",
    A0: 11,
    Z0: 6,
    modes: ["beta-plus"],
    betaKind: "beta-plus",
    context: "a hospital cyclotron carbon-11 positron tracer run",
  },
  {
    parentName: "oxygen",
    symbol: "O",
    A0: 15,
    Z0: 8,
    modes: ["beta-plus"],
    betaKind: "beta-plus",
    context: "a cerebral blood-flow oxygen-15 positron assay",
  },
  {
    parentName: "sodium",
    symbol: "Na",
    A0: 22,
    Z0: 11,
    modes: ["beta-plus"],
    betaKind: "beta-plus",
    context: "a positron-annihilation lifetime spectroscopy source",
  },
  {
    parentName: "iron",
    symbol: "Fe",
    A0: 52,
    Z0: 26,
    modes: ["beta-plus", "beta-plus"],
    betaKind: "beta-plus",
    context: "a proton-beam spallation iron-52 decay chain",
  },
  {
    parentName: "strontium",
    symbol: "Sr",
    A0: 82,
    Z0: 38,
    modes: ["beta-plus", "beta-plus"],
    betaKind: "beta-plus",
    context: "a rubidium-82 myocardial perfusion generator parent",
  },
  {
    parentName: "barium",
    symbol: "Ba",
    A0: 141,
    Z0: 56,
    modes: ["beta-minus", "beta-minus", "beta-minus"],
    betaKind: "beta-minus",
    context: "a mass-141 fission-fragment isobaric decay chain",
  },
  {
    parentName: "ruthenium",
    symbol: "Ru",
    A0: 106,
    Z0: 44,
    modes: ["beta-minus", "beta-minus"],
    betaKind: "beta-minus",
    context: "an ophthalmic plaque ruthenium-rhodium beta source",
  },
  {
    parentName: "nickel",
    symbol: "Ni",
    A0: 56,
    Z0: 28,
    modes: ["beta-plus", "beta-plus"],
    betaKind: "beta-plus",
    context: "a Type Ia supernova light-curve nickel-cobalt-iron chain",
  },
  {
    parentName: "zirconium",
    symbol: "Zr",
    A0: 95,
    Z0: 40,
    modes: ["beta-minus", "beta-minus"],
    betaKind: "beta-minus",
    context: "a fuel-cladding activation beta-minus sequence",
  },
  {
    parentName: "tin",
    symbol: "Sn",
    A0: 132,
    Z0: 50,
    modes: ["beta-minus", "beta-minus", "beta-minus", "beta-minus"],
    betaKind: "beta-minus",
    context: "a doubly magic r-process tin-132 beta cascade",
  },
  {
    parentName: "neon",
    symbol: "Ne",
    A0: 19,
    Z0: 10,
    modes: ["beta-plus"],
    betaKind: "beta-plus",
    context: "a Penning-trap weak-interaction mirror beta test",
  },
  {
    parentName: "argon",
    symbol: "Ar",
    A0: 42,
    Z0: 18,
    modes: ["beta-minus", "beta-minus"],
    betaKind: "beta-minus",
    context: "a low-background liquid-argon detector calibration chain",
  },
  {
    parentName: "zinc",
    symbol: "Zn",
    A0: 62,
    Z0: 30,
    modes: ["beta-plus", "beta-plus"],
    betaKind: "beta-plus",
    context: "a copper-62 generator positron-decay sequence",
  },
];

function buildArchetype10Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch10:${seed}:${variantIdx}`);
  const preset = QUARK_BETA_CHAINS[variantIdx % QUARK_BETA_CHAINS.length];
  const addAlphaStep = variantIdx >= QUARK_BETA_CHAINS.length && preset.A0 > 80;
  const rawModes: readonly NuclearDecayMode[] = addAlphaStep
    ? ["alpha", ...preset.modes]
    : preset.modes;

  const steps: DecayStepInput[] = rawModes.map((m, idx) => ({
    id: `s${idx + 1}`,
    mode: m,
  }));

  const spec: NuclearDecayChainScenarioSpec = {
    kind: "nuclear-decay-chain",
    parentNuclide: {
      massNumberA: preset.A0,
      atomicNumberZ: preset.Z0,
      symbol: preset.symbol,
    },
    steps,
    chartAxes: "N-vs-Z",
    showStabilityLine: true,
  };

  const sol = solveQuantumNuclearScenario(spec) as NuclearDecayChainSolution;
  const finalNuc = sol.nuclides[sol.nuclides.length - 1];
  const Af = finalNuc.massNumberA;
  const Zf = finalNuc.atomicNumberZ;

  const hiddenQuantities = [
    "totalAlphaCount",
    "totalBetaMinusCount",
    "totalBetaPlusCount",
    "totalGammaCount",
    "netDeltaA",
    "netDeltaZ",
    "netDeltaN",
    "finalNuclide",
    "daughterNuclides",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "parentA", value: preset.A0, source: "stem" },
    { name: "parentZ", value: preset.Z0, source: "stem" },
    { name: "finalA", value: Af, source: "stem" },
    { name: "finalZ", value: Zf, source: "stem" },
  ];

  // STRICT IB 2025 EXCLUSION: getCompatibleSyllabiForConcept omits IB automatically!
  const syllabi = resolveSyllabusTagsFromCrosswalk(
    "fundamental-particles-quarks-leptons",
    {
      format,
      alevelLevelOverride: "Y12",
      ncukLevelOverride: "IFY-S2",
    },
  );
  const difficulty = chooseDifficulty(variantIdx);

  const quarkProcessText =
    preset.betaKind === "beta-minus"
      ? "weak beta-minus transitions (d → u + e⁻ + ν̄ₑ)"
      : "weak beta-plus transitions (u → d + e⁺ + νₑ)";
  const alphaNote = addAlphaStep ? "one alpha emission and " : "purely ";

  const frames = [
    `In ${preset.context}, a parent ${preset.parentName} nucleus (A = ${preset.A0}, Z = ${preset.Z0}) transforms via ${alphaNote}${quarkProcessText} into a final nuclide with A = ${Af} and Z = ${Zf}, conserving baryon and lepton numbers at every vertex.`,
    `Particle-nuclear tracking in ${preset.context} follows a ${preset.parentName} parent (nucleon number ${preset.A0}, proton number ${preset.Z0}) undergoing ${alphaNote}${quarkProcessText} to form a daughter nucleus (A = ${Af}, Z = ${Zf}).`,
    `During ${preset.context}, weak quark-flavour transitions (${alphaNote}${quarkProcessText}) convert a parent ${preset.parentName} nucleus with A = ${preset.A0}, Z = ${preset.Z0} into a product nucleus with A = ${Af}, Z = ${Zf}.`,
    `Within ${preset.context}, a ${preset.parentName} isotope of nucleon number ${preset.A0} and proton number ${preset.Z0} decays by ${alphaNote}${quarkProcessText} to a nuclide with A = ${Af} and Z = ${Zf}.`,
    `Coincidence spectroscopy in ${preset.context} observes ${preset.parentName} (A = ${preset.A0}, Z = ${preset.Z0}) decaying via ${alphaNote}${quarkProcessText} into a product state at A = ${Af} and Z = ${Zf}.`,
    `Standard-Model weak-interaction analysis of ${preset.context} links parent ${preset.parentName} (A = ${preset.A0}, Z = ${preset.Z0}) to daughter (A = ${Af}, Z = ${Zf}) through ${alphaNote}${quarkProcessText}.`,
    `Starting with unstable ${preset.parentName} (nucleon number ${preset.A0}, proton number ${preset.Z0}) in ${preset.context}, ${alphaNote}${quarkProcessText} yield a nucleus of A = ${Af} and Z = ${Zf}.`,
  ];
  const baseStem = frames[(variantIdx * 3 + Math.floor(variantIdx / 7)) % frames.length];

  const targetBetaKey =
    preset.betaKind === "beta-minus" ? "totalBetaMinusCount" : "totalBetaPlusCount";
  const targetBetaVal =
    preset.betaKind === "beta-minus"
      ? sol.totalBetaMinusCount
      : sol.totalBetaPlusCount;

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const askDeltaN = variantIdx % 2 === 0;

    if (askDeltaN) {
      const stem = `${baseStem} What is the signed net change in neutron number ΔN = N_final − N_parent across the sequence?`;
      const options = buildDistinctMcqOptions({
        truth: sol.netDeltaN,
        unit: "",
        exactInteger: true,
        correctSlot: slot,
        distractors: [
          {
            value: -sol.netDeltaN,
            rationale:
              "Confuses d → u (neutron to proton) with u → d (proton to neutron), reversing the sign of ΔN.",
          },
          {
            value: sol.netDeltaZ === sol.netDeltaN ? sol.netDeltaN - 2 : sol.netDeltaZ,
            rationale:
              "Calculates the net proton-number change ΔZ instead of the neutron-number change ΔN.",
          },
          {
            value: sol.netDeltaN + (sol.netDeltaN > 0 ? 3 : -3),
            rationale:
              "Assumes each weak quark transition changes neutron number by 2 instead of 1.",
          },
        ],
        fallbackDistractors: [
          {
            value: sol.netDeltaN * 2,
            rationale: "Counts all three valence quarks as converting in each beta decay.",
          },
        ],
      });
      const ans = formatQuantity3sf(sol.netDeltaN, "", true);
      return {
        id,
        conceptId: "fundamental-particles-quarks-leptons",
        templateArchetype: "quark-level-beta-decay-chain-conservation",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: {
          targetSummary:
            "Relate quark-level beta transitions to signed net neutron-number change",
          distractorStrategy: [
            "swap-up-and-down-quark-conversion-direction",
            "report-proton-change-instead-of-neutron-change",
            "double-count-quark-flavour-flips-per-nucleon",
          ],
        },
        targetQuantityKey: "netDeltaN",
        stem,
        options,
        workedSolution: `Initial neutron number N₀ = ${preset.A0} − ${preset.Z0} = ${preset.A0 - preset.Z0}; final neutron number N_f = ${Af} − ${Zf} = ${Af - Zf}. Thus ΔN = N_f − N₀ = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses N = A − Z to obtain ΔN = (${Af} − ${Zf}) − (${preset.A0} − ${preset.Z0}) = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${baseStem} How many individual quark-level ${preset.betaKind === "beta-minus" ? "d → u" : "u → d"} weak beta transitions occur between the parent and final nucleus?`;
    const options = buildDistinctMcqOptions({
      truth: targetBetaVal,
      unit: "",
      exactInteger: true,
      correctSlot: slot,
      distractors: [
        {
          value: targetBetaVal * 3,
          rationale:
            "Multiplies by 3 assuming all three quarks in the nucleon change flavour rather than a single quark.",
        },
        {
          value: targetBetaVal + 2,
          rationale:
            "Misapplies charge conservation across the decay chain.",
        },
        {
          value: Math.max(0, targetBetaVal - 1) === targetBetaVal ? targetBetaVal + 4 : Math.max(1, targetBetaVal + 1),
          rationale:
            "Miscounts the proton-number shift by one unit.",
        },
      ],
      fallbackDistractors: [
        {
          value: targetBetaVal + 3,
          rationale: "Adds baryon number to the lepton emission count.",
        },
      ],
    });
    const ans = formatQuantity3sf(targetBetaVal, "", true);
    return {
      id,
      conceptId: "fundamental-particles-quarks-leptons",
      templateArchetype: "quark-level-beta-decay-chain-conservation",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Count weak quark-flavour conversions from nuclear proton and nucleon conservation",
        distractorStrategy: [
          "multiply-by-three-valence-quarks-per-baryon",
          "misapply-alpha-proton-shift",
          "off-by-one-charge-balance",
        ],
      },
      targetQuantityKey: targetBetaKey,
      stem,
      options,
      workedSolution: `Each weak beta step flips exactly one quark inside a nucleon, changing Z by ${preset.betaKind === "beta-minus" ? "+1" : "−1"} while keeping A constant. Accounting for ΔA = ${sol.netDeltaA} gives ${ans} weak quark transitions.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Balances A and Z to identify ${ans} single-quark weak beta transitions (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `Determine the signed net change in proton number ΔZ = Z_final − Z_parent.`,
      marks: 1,
      targetQuantityKey: "netDeltaZ",
      truth: sol.netDeltaZ,
      unit: "",
      exactInteger: true,
      methodCriterion: "Evaluates Z_final − Z_parent with sign",
      workingSteps: [
        `ΔZ = ${Zf} − ${preset.Z0} = ${formatQuantity3sf(sol.netDeltaZ, "", true)}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the signed net change in neutron number ΔN = N_final − N_parent.`,
      marks: 2,
      targetQuantityKey: "netDeltaN",
      truth: sol.netDeltaN,
      unit: "",
      exactInteger: true,
      methodCriterion: "Computes N = A − Z for parent and daughter and takes N_final − N_parent.",
      workingSteps: [
        `N₀ = ${preset.A0} − ${preset.Z0} = ${preset.A0 - preset.Z0}; N_f = ${Af} − ${Zf} = ${Af - Zf}.`,
        `ΔN = N_f − N₀ = ${formatQuantity3sf(sol.netDeltaN, "", true)}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Deduce the number of weak ${preset.betaKind === "beta-minus" ? "d → u beta-minus" : "u → d beta-plus"} quark transitions in the chain.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: targetBetaKey,
      truth: targetBetaVal,
      unit: "",
      exactInteger: true,
      methodCriterion:
        "Links single-quark flavour conversion to ΔZ = ±1 per weak beta step.",
      workingSteps: [
        `Accounting for ΔA = ${sol.netDeltaA}, charge conservation gives ${targetBetaVal} weak beta transitions.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "fundamental-particles-quarks-leptons",
    templateArchetype: "quark-level-beta-decay-chain-conservation",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Connect nuclear proton/neutron number changes to fundamental single-quark weak beta transitions",
      subpartStrategy: [
        "compute-signed-proton-number-change",
        "compute-signed-neutron-number-change",
        "deduce-count-of-weak-quark-transitions",
      ],
    },
    stem: baseStem,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 11: mass-defect-binding-energy :: single-nuclide-binding-energy-per-nucleon
// ============================================================================

interface BoundNuclidePreset {
  readonly name: string;
  readonly symbol: string;
  readonly A: number;
  readonly Z: number;
  readonly nuclearMassU: number;
  readonly context: string;
}

const BOUND_NUCLIDES: readonly BoundNuclidePreset[] = [
  { name: "deuterium", symbol: "H", A: 2, Z: 1, nuclearMassU: 2.013553, context: "a heavy-hydrogen ion-trap mass measurement" },
  { name: "helium-3", symbol: "He", A: 3, Z: 2, nuclearMassU: 3.014932, context: "a cryogenic helium-3 fusion-fuel mass assay" },
  { name: "helium-4", symbol: "He", A: 4, Z: 2, nuclearMassU: 4.001506, context: "an alpha-particle Penning-trap mass spectrometer" },
  { name: "lithium-6", symbol: "Li", A: 6, Z: 3, nuclearMassU: 6.013477, context: "an isotopic lithium blanket calibration run" },
  { name: "lithium-7", symbol: "Li", A: 7, Z: 3, nuclearMassU: 7.014358, context: "a light-ion accelerator target calibration" },
  { name: "beryllium-9", symbol: "Be", A: 9, Z: 4, nuclearMassU: 9.009989, context: "a neutron-reflector nuclear data table" },
  { name: "boron-10", symbol: "B", A: 10, Z: 5, nuclearMassU: 10.010194, context: "a neutron-capture control-rod mass evaluation" },
  { name: "boron-11", symbol: "B", A: 11, Z: 5, nuclearMassU: 11.006562, context: "an aneutronic proton-boron target compilation" },
  { name: "carbon-12", symbol: "C", A: 12, Z: 6, nuclearMassU: 11.996709, context: "a high-precision cyclotron mass-standard run" },
  { name: "nitrogen-14", symbol: "N", A: 14, Z: 7, nuclearMassU: 13.999234, context: "a stellar CNO-cycle nuclear mass compilation" },
  { name: "oxygen-16", symbol: "O", A: 16, Z: 8, nuclearMassU: 15.990526, context: "a doubly magic oxygen isotope mass measurement" },
  { name: "fluorine-19", symbol: "F", A: 19, Z: 9, nuclearMassU: 18.993461, context: "a molten-salt coolant nuclear binding table" },
  { name: "neon-20", symbol: "Ne", A: 20, Z: 10, nuclearMassU: 19.986955, context: "a noble-gas time-of-flight mass spectrometer" },
  { name: "sodium-23", symbol: "Na", A: 23, Z: 11, nuclearMassU: 22.983733, context: "a liquid-metal fast-reactor coolant data sheet" },
  { name: "magnesium-24", symbol: "Mg", A: 24, Z: 12, nuclearMassU: 23.978459, context: "a carbon-burning nucleosynthesis benchmark" },
  { name: "aluminium-27", symbol: "Al", A: 27, Z: 13, nuclearMassU: 26.974395, context: "an accelerator beam-window nuclide evaluation" },
  { name: "silicon-28", symbol: "Si", A: 28, Z: 14, nuclearMassU: 27.969247, context: "an Avogadro-project silicon crystal nuclide assay" },
  { name: "sulfur-32", symbol: "S", A: 32, Z: 16, nuclearMassU: 31.963294, context: "an alpha-cluster silicon-burning mass table" },
  { name: "calcium-40", symbol: "Ca", A: 40, Z: 20, nuclearMassU: 39.951619, context: "a shell-closure nuclear binding survey" },
  { name: "iron-56", symbol: "Fe", A: 56, Z: 26, nuclearMassU: 55.920674, context: "a supernova core stability-peak measurement" },
  { name: "nickel-58", symbol: "Ni", A: 58, Z: 28, nuclearMassU: 57.919996, context: "an iron-group isochronous storage-ring scan" },
  { name: "nickel-62", symbol: "Ni", A: 62, Z: 28, nuclearMassU: 61.912927, context: "an iron-peak maximum-stability mass trap" },
  { name: "silver-107", symbol: "Ag", A: 107, Z: 47, nuclearMassU: 106.879289, context: "a medium-mass storage-ring Schottky scan" },
  { name: "barium-141", symbol: "Ba", A: 141, Z: 56, nuclearMassU: 140.88354, context: "a thermal-fission daughter mass evaluation" },
  { name: "gold-197", symbol: "Au", A: 197, Z: 79, nuclearMassU: 196.92323, context: "a heavy-ion storage-ring mass measurement" },
  { name: "lead-208", symbol: "Pb", A: 208, Z: 82, nuclearMassU: 207.93163, context: "a doubly magic heavy-nucleus stability study" },
  { name: "uranium-235", symbol: "U", A: 235, Z: 92, nuclearMassU: 234.99345, context: "a fissile actinide mass-defect determination" },
];

function buildArchetype11Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch11:${seed}:${variantIdx}`);
  const nuc = BOUND_NUCLIDES[variantIdx % BOUND_NUCLIDES.length];
  const diagramStyle = variantIdx % 2 === 0 ? "binding-curve" : "mass-energy-balance";

  const spec: NuclearBindingScenarioSpec = {
    kind: "nuclear-binding",
    calculationMode: "single-nuclide",
    massNumberA: nuc.A,
    atomicNumberZ: nuc.Z,
    symbol: nuc.symbol,
    nuclearMassU: nuc.nuclearMassU,
    diagramStyle,
  };

  const sol = solveQuantumNuclearScenario(spec) as SingleNuclideBindingSolution;
  const hiddenQuantities = [
    "constituentMassU",
    "massDefectU",
    "massDefectKg",
    "bindingEnergyMeV",
    "bindingEnergyJ",
    "bindingEnergyPerNucleonMeV",
    "bindingEnergyPerNucleonJ",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "massNumberA", value: nuc.A, source: "stem" },
    { name: "atomicNumberZ", value: nuc.Z, source: "stem" },
    { name: "nuclearMassU", value: nuc.nuclearMassU, unit: "u", source: "stem" },
    { name: "protonMassU", value: 1.007276, unit: "u", source: "stem" },
    { name: "neutronMassU", value: 1.008665, unit: "u", source: "stem" },
    { name: "atomicMassUnitMeV", value: 931.5, unit: "MeV", source: "stem" },
    { name: "atomicMassUnitJ", value: 1.4924e-10, unit: "J", source: "stem" },
  ];

  const syllabi = resolveSyllabusTagsFromCrosswalk("mass-defect-binding-energy", {
    format,
    ibLevelOverride: "SL",
    alevelLevelOverride: "Y13",
    ncukLevelOverride: "IFY-S2",
  });
  const difficulty = chooseDifficulty(variantIdx);

  const frames = [
    `Data from ${nuc.context} give the bare nuclear rest mass of ${nuc.name} (nucleon number A = ${nuc.A}, proton number Z = ${nuc.Z}) as ${nuc.nuclearMassU} u. Take free proton mass mₚ = 1.007276 u, free neutron mass mₙ = 1.008665 u, and atomic mass energy equivalent u = 931.5 MeV c⁻².`,
    `In ${nuc.context}, a bare ${nuc.name} nucleus with A = ${nuc.A} and Z = ${nuc.Z} is measured to have rest mass ${nuc.nuclearMassU} u. Using mₚ = 1.007276 u, mₙ = 1.008665 u, and u = 931.5 MeV c⁻²:`,
    `Nuclear mass tables from ${nuc.context} list a stripped ${nuc.name} nucleus (A = ${nuc.A}, Z = ${nuc.Z}) at rest mass ${nuc.nuclearMassU} u. Assume mₚ = 1.007276 u, mₙ = 1.008665 u, and u = 931.5 MeV c⁻².`,
    `To benchmark nuclear stability in ${nuc.context}, consider a bare ${nuc.name} nucleus of nucleon number A = ${nuc.A}, proton number Z = ${nuc.Z}, and nuclear mass ${nuc.nuclearMassU} u (mₚ = 1.007276 u, mₙ = 1.008665 u, u = 931.5 MeV c⁻²).`,
    `Precision ion-trap records from ${nuc.context} report a bare ${nuc.name} nuclear mass of ${nuc.nuclearMassU} u for A = ${nuc.A} and Z = ${nuc.Z}. Take mₚ = 1.007276 u, mₙ = 1.008665 u, and 1 u = 931.5 MeV c⁻².`,
    `Evaluating strong-force binding in ${nuc.context}, a fully stripped ${nuc.name} nucleus (proton number Z = ${nuc.Z}, nucleon number A = ${nuc.A}) has rest mass ${nuc.nuclearMassU} u. Constants: mₚ = 1.007276 u, mₙ = 1.008665 u, u = 931.5 MeV c⁻².`,
    `Within ${nuc.context}, mass spectrometry determines the bare ${nuc.name} nucleus (A = ${nuc.A}, Z = ${nuc.Z}) rest mass to be ${nuc.nuclearMassU} u; use mₚ = 1.007276 u, mₙ = 1.008665 u, and u = 931.5 MeV c⁻².`,
  ];
  const baseStem = frames[(variantIdx * 3 + Math.floor(variantIdx / 9)) % frames.length];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const swappedConstituent =
      sol.neutronNumberN * 1.007276 + nuc.Z * 1.008665 - nuc.nuclearMassU;
    const swappedBePerA = (swappedConstituent * 931.5) / nuc.A;

    const stem = `${baseStem} What is the binding energy per nucleon, in MeV, of this ${nuc.name} nucleus?`;
    const options = buildDistinctMcqOptions({
      truth: sol.bindingEnergyPerNucleonMeV,
      unit: "MeV",
      correctSlot: slot,
      distractors: [
        {
          value: sol.bindingEnergyMeV,
          rationale:
            "Calculates the total nuclear binding energy B = Δm × 931.5 MeV instead of dividing by nucleon number A to find B / A.",
        },
        {
          value: sol.bindingEnergyMeV / nuc.Z,
          rationale:
            "Divides total binding energy by proton number Z instead of total nucleon number A.",
        },
        {
          value:
            Math.abs(swappedBePerA - sol.bindingEnergyPerNucleonMeV) > 0.15
              ? swappedBePerA
              : sol.massDefectU / nuc.A,
          rationale:
            Math.abs(swappedBePerA - sol.bindingEnergyPerNucleonMeV) > 0.15
              ? "Swaps proton and neutron counts when summing free nucleon masses."
              : "Forgets to multiply mass defect Δm in u by 931.5 MeV u⁻¹.",
        },
      ],
      fallbackDistractors: [
        {
          value: sol.massDefectU,
          rationale: "Reports the mass defect Δm in u instead of binding energy per nucleon in MeV.",
        },
      ],
    });
    const ans = formatQuantity3sf(sol.bindingEnergyPerNucleonMeV, "MeV");

    return {
      id,
      conceptId: "mass-defect-binding-energy",
      templateArchetype: "single-nuclide-binding-energy-per-nucleon",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Evaluate nuclear mass defect and binding energy per nucleon B/A using atomic mass energy equivalence",
        distractorStrategy: [
          "report-total-binding-energy-instead-of-per-nucleon",
          "divide-binding-energy-by-proton-number-instead-of-mass-number",
          "omit-mev-mass-unit-conversion",
        ],
      },
      targetQuantityKey: "bindingEnergyPerNucleonMeV",
      stem,
      options,
      workedSolution: `Neutron count N = ${nuc.A} − ${nuc.Z} = ${sol.neutronNumberN}. Mass defect Δm = ${nuc.Z}(1.007276) + ${sol.neutronNumberN}(1.008665) − ${nuc.nuclearMassU} = ${formatQuantity3sf(sol.massDefectU, "u")}. Total binding energy B = Δm × 931.5 = ${formatQuantity3sf(sol.bindingEnergyMeV, "MeV")}. Binding energy per nucleon B / A = ${formatQuantity3sf(sol.bindingEnergyMeV)} / ${nuc.A} = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Computes Δm = ${formatQuantity3sf(sol.massDefectU, "u")}, B = ${formatQuantity3sf(sol.bindingEnergyMeV, "MeV")}, and B / A = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `Calculate the mass defect Δm, in atomic mass units (u), of the ${nuc.name} nucleus.`,
      marks: 2,
      targetQuantityKey: "massDefectU",
      truth: sol.massDefectU,
      unit: "u",
      methodCriterion: "Finds N = A − Z and evaluates Δm = Z mₚ + N mₙ − m_nuc.",
      workingSteps: [
        `N = ${nuc.A} − ${nuc.Z} = ${sol.neutronNumberN}.`,
        `Δm = ${nuc.Z}(1.007276) + ${sol.neutronNumberN}(1.008665) − ${nuc.nuclearMassU} = ${formatQuantity3sf(sol.massDefectU, "u")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the total nuclear binding energy B in MeV.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "bindingEnergyMeV",
      truth: sol.bindingEnergyMeV,
      unit: "MeV",
      methodCriterion: "Multiplies mass defect Δm in u by 931.5 MeV u⁻¹.",
      workingSteps: [
        `B = ${formatQuantity3sf(sol.massDefectU)} × 931.5 = ${formatQuantity3sf(sol.bindingEnergyMeV, "MeV")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Calculate the binding energy per nucleon, in MeV, of this nucleus.`,
      marks: 1,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "bindingEnergyPerNucleonMeV",
      truth: sol.bindingEnergyPerNucleonMeV,
      unit: "MeV",
      methodCriterion: "Divides total binding energy B by nucleon number A",
      workingSteps: [
        `B / A = ${formatQuantity3sf(sol.bindingEnergyMeV)} / ${nuc.A} = ${formatQuantity3sf(sol.bindingEnergyPerNucleonMeV, "MeV")}.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "mass-defect-binding-energy",
    templateArchetype: "single-nuclide-binding-energy-per-nucleon",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Compute nuclear mass defect in u, total binding energy in MeV, and binding energy per nucleon B/A",
      subpartStrategy: [
        "evaluate-nuclear-mass-defect-in-u",
        "convert-mass-defect-to-total-binding-energy-mev",
        "divide-by-nucleon-number-for-specific-binding-energy",
      ],
    },
    stem: baseStem,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 12: nuclear-fission-fusion :: fission-fusion-reaction-q-value
// ============================================================================

interface ReactionPreset {
  readonly title: string;
  readonly reactionType: "fission" | "fusion";
  readonly context: string;
  readonly reactants: readonly ReactionSpeciesInput[];
  readonly products: readonly ReactionSpeciesInput[];
  readonly proseMassSummary: string;
  readonly givenValues: readonly RequiredGivenSpec[];
}

const REACTION_PRESETS: readonly ReactionPreset[] = [
  {
    title: "deuterium–tritium fusion",
    reactionType: "fusion",
    context: "a magnetic-confinement tokamak D–T plasma burn",
    reactants: [
      { id: "r1", symbol: "H", massNumberA: 2, atomicNumberZ: 1, massU: 2.013553 },
      { id: "r2", symbol: "H", massNumberA: 3, atomicNumberZ: 1, massU: 3.015501 },
    ],
    products: [
      { id: "p1", symbol: "He", massNumberA: 4, atomicNumberZ: 2, massU: 4.001506 },
      { id: "p2", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
    ],
    proseMassSummary:
      "deuteron (A = 2, Z = 1, mass 2.013553 u) + triton (A = 3, Z = 1, mass 3.015501 u) → helium nucleus (A = 4, Z = 2, mass 4.001506 u) + neutron (mass 1.008665 u)",
    givenValues: [
      { name: "mD", value: 2.013553, unit: "u", source: "stem" },
      { name: "mT", value: 3.015501, unit: "u", source: "stem" },
      { name: "mHe4", value: 4.001506, unit: "u", source: "stem" },
      { name: "mn", value: 1.008665, unit: "u", source: "stem" },
    ],
  },
  {
    title: "deuterium–helium-3 aneutronic fusion",
    reactionType: "fusion",
    context: "an electrostatic-confinement D–³He fusion chamber",
    reactants: [
      { id: "r1", symbol: "H", massNumberA: 2, atomicNumberZ: 1, massU: 2.013553 },
      { id: "r2", symbol: "He", massNumberA: 3, atomicNumberZ: 2, massU: 3.014932 },
    ],
    products: [
      { id: "p1", symbol: "He", massNumberA: 4, atomicNumberZ: 2, massU: 4.001506 },
      { id: "p2", symbol: "H", massNumberA: 1, atomicNumberZ: 1, massU: 1.007276 },
    ],
    proseMassSummary:
      "deuteron (2.013553 u) + helium-3 nucleus (3.014932 u) → alpha particle (4.001506 u) + proton (1.007276 u)",
    givenValues: [
      { name: "mD", value: 2.013553, unit: "u", source: "stem" },
      { name: "mHe3", value: 3.014932, unit: "u", source: "stem" },
      { name: "mHe4", value: 4.001506, unit: "u", source: "stem" },
      { name: "mp", value: 1.007276, unit: "u", source: "stem" },
    ],
  },
  {
    title: "proton–lithium-7 Cockcroft–Walton fusion",
    reactionType: "fusion",
    context: "a linear-accelerator proton–lithium target experiment",
    reactants: [
      { id: "r1", symbol: "H", massNumberA: 1, atomicNumberZ: 1, massU: 1.007276 },
      { id: "r2", symbol: "Li", massNumberA: 7, atomicNumberZ: 3, massU: 7.014358 },
    ],
    products: [
      { id: "p1", symbol: "He", massNumberA: 4, atomicNumberZ: 2, count: 2, massU: 4.001506 },
    ],
    proseMassSummary:
      "proton (1.007276 u) + lithium-7 nucleus (7.014358 u) → 2 alpha particles (each of mass 4.001506 u)",
    givenValues: [
      { name: "mp", value: 1.007276, unit: "u", source: "stem" },
      { name: "mLi7", value: 7.014358, unit: "u", source: "stem" },
      { name: "mHe4", value: 4.001506, unit: "u", source: "stem" },
    ],
  },
  {
    title: "lithium-6–deuterium fusion",
    reactionType: "fusion",
    context: "a blanket-breeding fusion energetics calculation",
    reactants: [
      { id: "r1", symbol: "Li", massNumberA: 6, atomicNumberZ: 3, massU: 6.013477 },
      { id: "r2", symbol: "H", massNumberA: 2, atomicNumberZ: 1, massU: 2.013553 },
    ],
    products: [
      { id: "p1", symbol: "He", massNumberA: 4, atomicNumberZ: 2, count: 2, massU: 4.001506 },
    ],
    proseMassSummary:
      "lithium-6 nucleus (6.013477 u) + deuteron (2.013553 u) → 2 alpha particles (each of mass 4.001506 u)",
    givenValues: [
      { name: "mLi6", value: 6.013477, unit: "u", source: "stem" },
      { name: "mD", value: 2.013553, unit: "u", source: "stem" },
      { name: "mHe4", value: 4.001506, unit: "u", source: "stem" },
    ],
  },
  {
    title: "stellar triple-alpha carbon-oxygen capture",
    reactionType: "fusion",
    context: "a red-giant helium-burning stellar core",
    reactants: [
      { id: "r1", symbol: "C", massNumberA: 12, atomicNumberZ: 6, massU: 11.996709 },
      { id: "r2", symbol: "He", massNumberA: 4, atomicNumberZ: 2, massU: 4.001506 },
    ],
    products: [
      { id: "p1", symbol: "O", massNumberA: 16, atomicNumberZ: 8, massU: 15.990526 },
    ],
    proseMassSummary:
      "carbon-12 nucleus (11.996709 u) + helium-4 nucleus (4.001506 u) → oxygen-16 nucleus (15.990526 u)",
    givenValues: [
      { name: "mC12", value: 11.996709, unit: "u", source: "stem" },
      { name: "mHe4", value: 4.001506, unit: "u", source: "stem" },
      { name: "mO16", value: 15.990526, unit: "u", source: "stem" },
    ],
  },
  {
    title: "barium–krypton thermal fission of U-235",
    reactionType: "fission",
    context: "a pressurized-water thermal fission reactor fuel pin",
    reactants: [
      { id: "r1", symbol: "U", massNumberA: 235, atomicNumberZ: 92, massU: 234.99345 },
      { id: "r2", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
    ],
    products: [
      { id: "p1", symbol: "Ba", massNumberA: 141, atomicNumberZ: 56, massU: 140.88354 },
      { id: "p2", symbol: "Kr", massNumberA: 92, atomicNumberZ: 36, massU: 91.90645 },
      { id: "p3", symbol: "n", massNumberA: 1, atomicNumberZ: 0, count: 3, massU: 1.008665 },
    ],
    proseMassSummary:
      "uranium nucleus (234.99345 u) + 1 thermal neutron (1.008665 u) → barium-141 nucleus (140.88354 u) + krypton-92 nucleus (91.90645 u) + 3 neutrons (each 1.008665 u)",
    givenValues: [
      { name: "mU", value: 234.99345, unit: "u", source: "stem" },
      { name: "mBa", value: 140.88354, unit: "u", source: "stem" },
      { name: "mKr", value: 91.90645, unit: "u", source: "stem" },
      { name: "mn", value: 1.008665, unit: "u", source: "stem" },
      { name: "nOut", value: 3, source: "stem" },
    ],
  },
  {
    title: "xenon–strontium thermal fission of U-235",
    reactionType: "fission",
    context: "a graphite-moderated nuclear power core",
    reactants: [
      { id: "r1", symbol: "U", massNumberA: 235, atomicNumberZ: 92, massU: 234.99345 },
      { id: "r2", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
    ],
    products: [
      { id: "p1", symbol: "Xe", massNumberA: 140, atomicNumberZ: 54, massU: 139.8920 },
      { id: "p2", symbol: "Sr", massNumberA: 94, atomicNumberZ: 38, massU: 93.8945 },
      { id: "p3", symbol: "n", massNumberA: 1, atomicNumberZ: 0, count: 2, massU: 1.008665 },
    ],
    proseMassSummary:
      "uranium nucleus (234.99345 u) + 1 thermal neutron (1.008665 u) → xenon-140 nucleus (139.8920 u) + strontium-94 nucleus (93.8945 u) + 2 neutrons (each 1.008665 u)",
    givenValues: [
      { name: "mU", value: 234.99345, unit: "u", source: "stem" },
      { name: "mXe", value: 139.892, unit: "u", source: "stem" },
      { name: "mSr", value: 93.8945, unit: "u", source: "stem" },
      { name: "mn", value: 1.008665, unit: "u", source: "stem" },
      { name: "nOut", value: 2, source: "stem" },
    ],
  },
  {
    title: "caesium–rubidium thermal fission of U-235",
    reactionType: "fission",
    context: "a heavy-water CANDU fuel bundle",
    reactants: [
      { id: "r1", symbol: "U", massNumberA: 235, atomicNumberZ: 92, massU: 234.99345 },
      { id: "r2", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
    ],
    products: [
      { id: "p1", symbol: "Cs", massNumberA: 141, atomicNumberZ: 55, massU: 140.8890 },
      { id: "p2", symbol: "Rb", massNumberA: 93, atomicNumberZ: 37, massU: 92.9017 },
      { id: "p3", symbol: "n", massNumberA: 1, atomicNumberZ: 0, count: 2, massU: 1.008665 },
    ],
    proseMassSummary:
      "uranium nucleus (234.99345 u) + 1 thermal neutron (1.008665 u) → caesium-141 nucleus (140.8890 u) + rubidium-93 nucleus (92.9017 u) + 2 neutrons (each 1.008665 u)",
    givenValues: [
      { name: "mU", value: 234.99345, unit: "u", source: "stem" },
      { name: "mCs", value: 140.889, unit: "u", source: "stem" },
      { name: "mRb", value: 92.9017, unit: "u", source: "stem" },
      { name: "mn", value: 1.008665, unit: "u", source: "stem" },
      { name: "nOut", value: 2, source: "stem" },
    ],
  },
  {
    title: "molybdenum–tin fission of plutonium-239",
    reactionType: "fission",
    context: "a mixed-oxide thermal reactor assembly",
    reactants: [
      { id: "r1", symbol: "Pu", massNumberA: 239, atomicNumberZ: 94, massU: 239.0006 },
      { id: "r2", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
    ],
    products: [
      { id: "p1", symbol: "Sn", massNumberA: 134, atomicNumberZ: 50, massU: 133.8902 },
      { id: "p2", symbol: "Ru", massNumberA: 103, atomicNumberZ: 44, massU: 102.8825 },
      { id: "p3", symbol: "n", massNumberA: 1, atomicNumberZ: 0, count: 3, massU: 1.008665 },
    ],
    proseMassSummary:
      "plutonium nucleus (239.0006 u) + 1 thermal neutron (1.008665 u) → tin-134 nucleus (133.8902 u) + ruthenium-103 nucleus (102.8825 u) + 3 neutrons (each 1.008665 u)",
    givenValues: [
      { name: "mPu", value: 239.0006, unit: "u", source: "stem" },
      { name: "mSn", value: 133.8902, unit: "u", source: "stem" },
      { name: "mRu", value: 102.8825, unit: "u", source: "stem" },
      { name: "mn", value: 1.008665, unit: "u", source: "stem" },
      { name: "nOut", value: 3, source: "stem" },
    ],
  },
  {
    title: "tellurium–zirconium thermal fission of U-235",
    reactionType: "fission",
    context: "a research-reactor fission calorimetry cell",
    reactants: [
      { id: "r1", symbol: "U", massNumberA: 235, atomicNumberZ: 92, massU: 234.99345 },
      { id: "r2", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
    ],
    products: [
      { id: "p1", symbol: "Te", massNumberA: 137, atomicNumberZ: 52, massU: 136.8986 },
      { id: "p2", symbol: "Zr", massNumberA: 97, atomicNumberZ: 40, massU: 96.8909 },
      { id: "p3", symbol: "n", massNumberA: 1, atomicNumberZ: 0, count: 2, massU: 1.008665 },
    ],
    proseMassSummary:
      "uranium nucleus (234.99345 u) + 1 thermal neutron (1.008665 u) → tellurium-137 nucleus (136.8986 u) + zirconium-97 nucleus (96.8909 u) + 2 neutrons (each 1.008665 u)",
    givenValues: [
      { name: "mU", value: 234.99345, unit: "u", source: "stem" },
      { name: "mTe", value: 136.8986, unit: "u", source: "stem" },
      { name: "mZr", value: 96.8909, unit: "u", source: "stem" },
      { name: "mn", value: 1.008665, unit: "u", source: "stem" },
      { name: "nOut", value: 2, source: "stem" },
    ],
  },
  {
    title: "deuterium–deuterium helium-3 branch fusion",
    reactionType: "fusion",
    context: "a dense plasma-focus D–D neutron generator",
    reactants: [
      { id: "r1", symbol: "H", massNumberA: 2, atomicNumberZ: 1, count: 2, massU: 2.013553 },
    ],
    products: [
      { id: "p1", symbol: "He", massNumberA: 3, atomicNumberZ: 2, massU: 3.014932 },
      { id: "p2", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
    ],
    proseMassSummary:
      "2 deuterons (each of mass 2.013553 u) → helium-3 nucleus (3.014932 u) + neutron (1.008665 u)",
    givenValues: [
      { name: "mD", value: 2.013553, unit: "u", source: "stem" },
      { name: "mHe3", value: 3.014932, unit: "u", source: "stem" },
      { name: "mn", value: 1.008665, unit: "u", source: "stem" },
    ],
  },
  {
    title: "deuterium–deuterium triton-proton branch fusion",
    reactionType: "fusion",
    context: "a spherical-tokamak deuterium-burn diagnostic shot",
    reactants: [
      { id: "r1", symbol: "H", massNumberA: 2, atomicNumberZ: 1, count: 2, massU: 2.013553 },
    ],
    products: [
      { id: "p1", symbol: "H", massNumberA: 3, atomicNumberZ: 1, massU: 3.015501 },
      { id: "p2", symbol: "H", massNumberA: 1, atomicNumberZ: 1, massU: 1.007276 },
    ],
    proseMassSummary:
      "2 deuterons (each of mass 2.013553 u) → triton (3.015501 u) + proton (1.007276 u)",
    givenValues: [
      { name: "mD", value: 2.013553, unit: "u", source: "stem" },
      { name: "mT", value: 3.015501, unit: "u", source: "stem" },
      { name: "mp", value: 1.007276, unit: "u", source: "stem" },
    ],
  },
  {
    title: "proton–boron-11 tri-alpha aneutronic fusion",
    reactionType: "fusion",
    context: "a laser-driven proton–boron aneutronic fusion experiment",
    reactants: [
      { id: "r1", symbol: "H", massNumberA: 1, atomicNumberZ: 1, massU: 1.007276 },
      { id: "r2", symbol: "B", massNumberA: 11, atomicNumberZ: 5, massU: 11.006562 },
    ],
    products: [
      { id: "p1", symbol: "He", massNumberA: 4, atomicNumberZ: 2, count: 3, massU: 4.001506 },
    ],
    proseMassSummary:
      "proton (1.007276 u) + boron-11 nucleus (11.006562 u) → 3 alpha particles (each of mass 4.001506 u)",
    givenValues: [
      { name: "mp", value: 1.007276, unit: "u", source: "stem" },
      { name: "mB11", value: 11.006562, unit: "u", source: "stem" },
      { name: "mHe4", value: 4.001506, unit: "u", source: "stem" },
    ],
  },
  {
    title: "stellar pp-III helium-3–helium-3 fusion",
    reactionType: "fusion",
    context: "a solar-core proton-proton chain termination study",
    reactants: [
      { id: "r1", symbol: "He", massNumberA: 3, atomicNumberZ: 2, count: 2, massU: 3.014932 },
    ],
    products: [
      { id: "p1", symbol: "He", massNumberA: 4, atomicNumberZ: 2, massU: 4.001506 },
      { id: "p2", symbol: "H", massNumberA: 1, atomicNumberZ: 1, count: 2, massU: 1.007276 },
    ],
    proseMassSummary:
      "2 helium-3 nuclei (each 3.014932 u) → helium-4 nucleus (4.001506 u) + 2 protons (each 1.007276 u)",
    givenValues: [
      { name: "mHe3", value: 3.014932, unit: "u", source: "stem" },
      { name: "mHe4", value: 4.001506, unit: "u", source: "stem" },
      { name: "mp", value: 1.007276, unit: "u", source: "stem" },
    ],
  },
  {
    title: "oxygen-16 alpha-capture neon-20 synthesis",
    reactionType: "fusion",
    context: "an asymptotic-giant-branch shell alpha-capture model",
    reactants: [
      { id: "r1", symbol: "O", massNumberA: 16, atomicNumberZ: 8, massU: 15.990526 },
      { id: "r2", symbol: "He", massNumberA: 4, atomicNumberZ: 2, massU: 4.001506 },
    ],
    products: [
      { id: "p1", symbol: "Ne", massNumberA: 20, atomicNumberZ: 10, massU: 19.986955 },
    ],
    proseMassSummary:
      "oxygen-16 nucleus (15.990526 u) + helium-4 nucleus (4.001506 u) → neon-20 nucleus (19.986955 u)",
    givenValues: [
      { name: "mO16", value: 15.990526, unit: "u", source: "stem" },
      { name: "mHe4", value: 4.001506, unit: "u", source: "stem" },
      { name: "mNe20", value: 19.986955, unit: "u", source: "stem" },
    ],
  },
  {
    title: "lanthanum–bromine thermal fission of U-235",
    reactionType: "fission",
    context: "a boiling-water reactor fuel-rod burnup calculation",
    reactants: [
      { id: "r1", symbol: "U", massNumberA: 235, atomicNumberZ: 92, massU: 234.99345 },
      { id: "r2", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
    ],
    products: [
      { id: "p1", symbol: "La", massNumberA: 144, atomicNumberZ: 57, massU: 143.8990 },
      { id: "p2", symbol: "Br", massNumberA: 89, atomicNumberZ: 35, massU: 88.9054 },
      { id: "p3", symbol: "n", massNumberA: 1, atomicNumberZ: 0, count: 3, massU: 1.008665 },
    ],
    proseMassSummary:
      "uranium nucleus (234.99345 u) + 1 thermal neutron (1.008665 u) → lanthanum-144 nucleus (143.8990 u) + bromine-89 nucleus (88.9054 u) + 3 neutrons (each 1.008665 u)",
    givenValues: [
      { name: "mU", value: 234.99345, unit: "u", source: "stem" },
      { name: "mLa", value: 143.899, unit: "u", source: "stem" },
      { name: "mBr", value: 88.9054, unit: "u", source: "stem" },
      { name: "mn", value: 1.008665, unit: "u", source: "stem" },
      { name: "nOut", value: 3, source: "stem" },
    ],
  },
  {
    title: "barium–strontium fission of plutonium-239",
    reactionType: "fission",
    context: "a fast-spectrum plutonium fuel-pin test loop",
    reactants: [
      { id: "r1", symbol: "Pu", massNumberA: 239, atomicNumberZ: 94, massU: 239.0006 },
      { id: "r2", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
    ],
    products: [
      { id: "p1", symbol: "Ba", massNumberA: 140, atomicNumberZ: 56, massU: 139.8840 },
      { id: "p2", symbol: "Sr", massNumberA: 97, atomicNumberZ: 38, massU: 96.9032 },
      { id: "p3", symbol: "n", massNumberA: 1, atomicNumberZ: 0, count: 3, massU: 1.008665 },
    ],
    proseMassSummary:
      "plutonium nucleus (239.0006 u) + 1 thermal neutron (1.008665 u) → barium-140 nucleus (139.8840 u) + strontium-97 nucleus (96.9032 u) + 3 neutrons (each 1.008665 u)",
    givenValues: [
      { name: "mPu", value: 239.0006, unit: "u", source: "stem" },
      { name: "mBa", value: 139.884, unit: "u", source: "stem" },
      { name: "mSr", value: 96.9032, unit: "u", source: "stem" },
      { name: "mn", value: 1.008665, unit: "u", source: "stem" },
      { name: "nOut", value: 3, source: "stem" },
    ],
  },
];

function buildArchetype12Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch12:${seed}:${variantIdx}`);
  const rxn = REACTION_PRESETS[variantIdx % REACTION_PRESETS.length];
  const spec: NuclearBindingScenarioSpec = {
    kind: "nuclear-binding",
    calculationMode: "reaction",
    reactionType: rxn.reactionType,
    reactants: rxn.reactants,
    products: rxn.products,
    diagramStyle: variantIdx % 3 === 0 ? "binding-curve" : "mass-energy-balance",
  };

  const sol = solveQuantumNuclearScenario(spec) as NuclearReactionBindingSolution;
  const hiddenQuantities = [
    "massDifferenceU",
    "massDifferenceKg",
    "qValueMeV",
    "qValueJ",
    "reactantTotalBindingMeV",
    "productTotalBindingMeV",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    ...rxn.givenValues,
    { name: "atomicMassUnitMeV", value: 931.5, unit: "MeV", source: "stem" },
    { name: "elementaryChargeC", value: 1.6e-19, unit: "C", source: "stem" },
  ];

  const syllabi = resolveSyllabusTagsFromCrosswalk("nuclear-fission-fusion", {
    format,
    ibLevelOverride: "SL",
    alevelLevelOverride: "Y13",
    ncukLevelOverride: "IFY-S2",
  });
  const difficulty = chooseDifficulty(variantIdx);

  const frames = [
    `In ${rxn.context}, the exothermic nuclear ${rxn.reactionType} reaction is: ${rxn.proseMassSummary}. Take atomic mass energy conversion u = 931.5 MeV c⁻² and e = 1.60 × 10⁻¹⁹ C.`,
    `Energy-balance modelling of ${rxn.context} considers ${rxn.title}: ${rxn.proseMassSummary}. Use u = 931.5 MeV c⁻² and elementary charge e = 1.60 × 10⁻¹⁹ C.`,
    `During operation of ${rxn.context}, a single event proceeds via ${rxn.proseMassSummary}. Given u = 931.5 MeV c⁻² and e = 1.60 × 10⁻¹⁹ C:`,
    `Calorimetric analysis of ${rxn.context} evaluates the single-event nuclear ${rxn.reactionType} step ${rxn.proseMassSummary} (take u = 931.5 MeV c⁻², e = 1.60 × 10⁻¹⁹ C).`,
    `Reaction kinematics in ${rxn.context} examine ${rxn.title}, where bare rest masses satisfy ${rxn.proseMassSummary}. Assume 1 u = 931.5 MeV c⁻² and e = 1.60 × 10⁻¹⁹ C.`,
    `Within ${rxn.context}, nuclear power output originates from ${rxn.proseMassSummary}. Constants: u = 931.5 MeV c⁻², e = 1.60 × 10⁻¹⁹ C.`,
    `A nuclear data benchmark for ${rxn.context} specifies ${rxn.proseMassSummary} (with mass-energy equivalent u = 931.5 MeV c⁻² and e = 1.60 × 10⁻¹⁹ C).`,
  ];
  const baseStem = frames[(variantIdx * 3 + Math.floor(variantIdx / 8)) % frames.length];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const askJoules = variantIdx % 3 === 2;

    if (!askJoules) {
      const stem = `${baseStem} How much nuclear energy Q, in MeV, is released in one ${rxn.reactionType} event?`;
      const forgotNeutronCount =
        rxn.reactionType === "fission"
          ? Math.abs(sol.massDifferenceU + 2 * 1.008665) * 931.5
          : sol.qValueMeV * 0.5;
      const options = buildDistinctMcqOptions({
        truth: sol.qValueMeV,
        unit: "MeV",
        correctSlot: slot,
        distractors: [
          {
            value: forgotNeutronCount,
            rationale:
              rxn.reactionType === "fission"
                ? "Omits the emitted product neutrons when summing total product rest mass."
                : "Halves the mass difference by neglecting product multiplicity.",
          },
          {
            value: sol.massDifferenceU,
            rationale:
              "Reports the raw mass decrease Δm in atomic mass units (u) without multiplying by 931.5 MeV u⁻¹.",
          },
          {
            value: sol.qValueMeV / 235,
            rationale:
              "Divides the reaction Q-value by nucleon number as if asked for energy per nucleon.",
          },
        ],
        fallbackDistractors: [
          {
            value: sol.qValueMeV * 1.6,
            rationale: "Multiplies MeV by 1.60 unnecessarily.",
          },
        ],
      });
      const ans = formatQuantity3sf(sol.qValueMeV, "MeV");
      return {
        id,
        conceptId: "nuclear-fission-fusion",
        templateArchetype: "fission-fusion-reaction-q-value",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: {
          targetSummary:
            "Calculate single-event fission or fusion Q-value in MeV from reactant and product rest masses",
          distractorStrategy: [
            "omit-emitted-neutrons-from-product-mass-sum",
            "omit-mev-per-u-conversion-factor",
            "divide-total-q-value-by-mass-number",
          ],
        },
        targetQuantityKey: "qValueMeV",
        stem,
        options,
        workedSolution: `Mass decrease Δm = Σm_reactants − Σm_products = ${formatQuantity3sf(sol.massDifferenceU, "u")}. Energy released Q = Δm × 931.5 = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes Δm = ${formatQuantity3sf(sol.massDifferenceU, "u")} and Q = Δm × 931.5 = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${baseStem} What is the rest-mass decrease Δm, in atomic mass units (u), in a single ${rxn.reactionType} reaction?`;
    const forgotNeutronMassU =
      rxn.reactionType === "fission"
        ? Math.abs(sol.massDifferenceU + 2 * 1.008665)
        : sol.massDifferenceU * 0.5;
    const options = buildDistinctMcqOptions({
      truth: sol.massDifferenceU,
      unit: "u",
      correctSlot: slot,
      distractors: [
        {
          value: forgotNeutronMassU,
          rationale:
            rxn.reactionType === "fission"
              ? "Omits the emitted neutrons when summing total product rest mass."
              : "Halves the mass decrease by ignoring product multiplicity.",
        },
        {
          value: sol.qValueMeV,
          rationale:
            "Multiplies Δm by 931.5 MeV u⁻¹, reporting Q in MeV instead of Δm in u.",
        },
        {
          value: sol.massDifferenceU / 931.5,
          rationale:
            "Divides mass difference by 931.5 instead of reporting Σm_reactants − Σm_products directly in u.",
        },
      ],
      fallbackDistractors: [
        {
          value: sol.massDifferenceU * 2,
          rationale: "Doubles the mass difference Δm.",
        },
      ],
    });
    const ans = formatQuantity3sf(sol.massDifferenceU, "u");
    return {
      id,
      conceptId: "nuclear-fission-fusion",
      templateArchetype: "fission-fusion-reaction-q-value",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Evaluate rest-mass decrease Delta m in atomic mass units across a balanced fission or fusion reaction",
        distractorStrategy: [
          "omit-emitted-neutrons-from-product-mass-sum",
          "confuse-q-value-in-mev-with-mass-decrease-in-u",
          "divide-mass-decrease-by-energy-equivalent",
        ],
      },
      targetQuantityKey: "massDifferenceU",
      stem,
      options,
      workedSolution: `Summing reactant and product rest masses gives Δm = Σm_reactants − Σm_products = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates Σm_reactants − Σm_products = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `Calculate the rest-mass decrease Δm, in atomic mass units (u), for one ${rxn.reactionType} event.`,
      marks: 2,
      targetQuantityKey: "massDifferenceU",
      truth: sol.massDifferenceU,
      unit: "u",
      methodCriterion: "Sums all reactant and product rest masses including particle multiplicities.",
      workingSteps: [
        `Δm = Σm_reactants − Σm_products = ${formatQuantity3sf(sol.massDifferenceU, "u")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the nuclear energy released Q, in MeV.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "qValueMeV",
      truth: sol.qValueMeV,
      unit: "MeV",
      methodCriterion: "Multiplies Δm in u by 931.5 MeV u⁻¹.",
      workingSteps: [
        `Q = ${formatQuantity3sf(sol.massDifferenceU)} × 931.5 = ${formatQuantity3sf(sol.qValueMeV, "MeV")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `State the total nucleon number conserved on each side of this ${rxn.reactionType} equation.`,
      marks: 1,
      targetQuantityKey: "totalReactantA",
      truth: sol.totalReactantA,
      unit: "",
      exactInteger: true,
      methodCriterion: "Sums nucleon numbers across reactants (or products)",
      workingSteps: [
        `Total nucleon number A = ${sol.totalReactantA}.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "nuclear-fission-fusion",
    templateArchetype: "fission-fusion-reaction-q-value",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Compute reaction mass difference in u, Q-value in MeV, and SI energy yield in joules",
      subpartStrategy: [
        "compute-mass-decrease-across-balanced-species",
        "convert-mass-decrease-to-mev",
        "convert-mev-q-value-to-joules",
      ],
    },
    stem: baseStem,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 13: rutherford-scattering-nuclear-radius :: alpha-foil-closest-approach-distance
// (IB HL + A-Level Y13 — excluded from NCUK)
// ============================================================================

interface FoilTargetPreset {
  readonly foilName: string;
  readonly symbol: string;
  readonly Z: number;
  readonly A: number;
  readonly expContext: string;
}

const FOIL_TARGETS: readonly FoilTargetPreset[] = [
  { foilName: "gold", symbol: "Au", Z: 79, A: 197, expContext: "a Geiger–Marsden evacuated scattering chamber" },
  { foilName: "silver", symbol: "Ag", Z: 47, A: 107, expContext: "a silicon-diode nuclear recoil goniometer" },
  { foilName: "platinum", symbol: "Pt", Z: 78, A: 195, expContext: "a Rutherford backscattering spectrometry (RBS) beamline" },
  { foilName: "lead", symbol: "Pb", Z: 82, A: 208, expContext: "a heavy-element Coulomb-barrier scattering rig" },
  { foilName: "tungsten", symbol: "W", Z: 74, A: 184, expContext: "a refractory-foil elastic alpha-scattering chamber" },
  { foilName: "copper", symbol: "Cu", Z: 29, A: 63, expContext: "a thin-film ion-beam analysis target holder" },
  { foilName: "tin", symbol: "Sn", Z: 50, A: 120, expContext: "an isotopic metallic-foil scattering apparatus" },
  { foilName: "bismuth", symbol: "Bi", Z: 83, A: 209, expContext: "a nuclear-charge verification scattering cell" },
  { foilName: "nickel", symbol: "Ni", Z: 28, A: 58, expContext: "a tandem Van de Graaff scattering target" },
  { foilName: "indium", symbol: "In", Z: 49, A: 115, expContext: "a vacuum surface-scattering detector ring" },
  { foilName: "palladium", symbol: "Pd", Z: 46, A: 106, expContext: "a high-vacuum elastic backscattering stage" },
  { foilName: "tantalum", symbol: "Ta", Z: 73, A: 181, expContext: "a heavy-metal beam-diagnostics scattering foil" },
  { foilName: "thorium", symbol: "Th", Z: 90, A: 232, expContext: "an actinide-target Coulomb turning-point experiment" },
];

function buildArchetype13Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch13:${seed}:${variantIdx}`);
  const target = FOIL_TARGETS[variantIdx % FOIL_TARGETS.length];
  const isProton = variantIdx % 5 === 4;
  const projZ = isProton ? 1 : 2;
  const projName = isProton ? "proton (charge +1e)" : "alpha particle (charge +2e)";
  const energiesMeV = [3.6, 3.9, 4.2, 4.5, 4.8, 5.1, 5.4, 5.7, 6.1, 6.5, 6.9];
  const kineticEnergyMeV =
    energiesMeV[
      (variantIdx * 2 + Math.floor(variantIdx / FOIL_TARGETS.length)) %
        energiesMeV.length
    ];

  const spec: RutherfordScatteringScenarioSpec = {
    kind: "rutherford-scattering",
    projectileChargeZ: projZ,
    targetSymbol: target.symbol,
    targetChargeZ: target.Z,
    targetMassNumberA: target.A,
    kineticEnergyMeV,
    showDeflectedPaths: true,
  };

  const sol = solveQuantumNuclearScenario(spec) as RutherfordScatteringSolution;
  const hiddenQuantities = [
    "projectileChargeC",
    "targetChargeC",
    "closestApproachM",
    "closestApproachFm",
    "estimatedNuclearRadiusM",
    "estimatedNuclearRadiusFm",
    "nuclearDensityKgM3",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "projectileChargeZ", value: projZ, source: "stem" },
    { name: "targetChargeZ", value: target.Z, source: "stem" },
    { name: "targetMassNumberA", value: target.A, source: "stem" },
    { name: "kineticEnergyMeV", value: kineticEnergyMeV, unit: "MeV", source: "stem" },
    { name: "elementaryChargeC", value: 1.6e-19, unit: "C", source: "stem" },
  ];

  const syllabi = resolveSyllabusTagsFromCrosswalk(
    "rutherford-scattering-nuclear-radius",
    {
      format,
      ibLevelOverride: "HL",
      alevelLevelOverride: "Y13",
      ncukLevelOverride: "exclude",
    },
  );
  const difficulty = chooseDifficulty(variantIdx);

  const frames = [
    `In ${target.expContext}, an energetic ${projName} with initial kinetic energy ${kineticEnergyMeV} MeV approaches a stationary ${target.foilName} nucleus (Z = ${target.Z}, A = ${target.A}) directly head-on and recoils elastically. Neglect target recoil and take k = 8.99 × 10⁹ N m² C⁻² and e = 1.60 × 10⁻¹⁹ C.`,
    `During an experiment in ${target.expContext}, a ${projName} of kinetic energy ${kineticEnergyMeV} MeV is directed along a head-on trajectory toward a fixed ${target.foilName} nucleus (proton number Z = ${target.Z}, nucleon number A = ${target.A}). Use k = 8.99 × 10⁹ N m² C⁻² and e = 1.60 × 10⁻¹⁹ C.`,
    `A collimated ${projName} carrying ${kineticEnergyMeV} MeV of kinetic energy undergoes direct head-on Coulomb backscattering from a stationary ${target.foilName} nucleus (Z = ${target.Z}, A = ${target.A}) inside ${target.expContext}. Constants: k = 8.99 × 10⁹ N m² C⁻², e = 1.60 × 10⁻¹⁹ C.`,
    `Inside ${target.expContext}, a ${kineticEnergyMeV} MeV ${projName} comes momentarily to rest at minimum separation d before reversing direction in front of a ${target.foilName} nucleus (Z = ${target.Z}, A = ${target.A}). Take k = 8.99 × 10⁹ N m² C⁻² and e = 1.60 × 10⁻¹⁹ C.`,
    `Elastic 180° backscattering in ${target.expContext} sends a ${kineticEnergyMeV} MeV ${projName} directly toward an immobile ${target.foilName} target nucleus (Z = ${target.Z}, A = ${target.A}), taking k = 8.99 × 10⁹ N m² C⁻² and e = 1.60 × 10⁻¹⁹ C.`,
    `Electrostatic repulsion inside ${target.expContext} halts a head-on ${projName} of initial energy ${kineticEnergyMeV} MeV at closest approach d from a stationary ${target.foilName} nucleus (Z = ${target.Z}, A = ${target.A}). Assume k = 8.99 × 10⁹ N m² C⁻² and e = 1.60 × 10⁻¹⁹ C.`,
    `To probe the nuclear charge barrier in ${target.expContext}, a ${kineticEnergyMeV} MeV ${projName} is fired head-on at a heavy ${target.foilName} nucleus (Z = ${target.Z}, A = ${target.A}) with negligible recoil (k = 8.99 × 10⁹ N m² C⁻², e = 1.60 × 10⁻¹⁹ C).`,
  ];
  const baseStem = frames[(variantIdx * 3 + Math.floor(variantIdx / 7)) % frames.length];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const targetKey = "closestApproachFm";
    const unit = "fm";
    const truth = sol.closestApproachFm;

    const wrongProjCharge = isProton ? truth * 2 : truth * 0.5;
    const usedMassAInsteadOfZ = truth * (target.A / target.Z);
    const sqrtForceError = Math.sqrt(sol.closestApproachM) * 1e15;

    const stem = `${baseStem} What is the distance of closest approach d, in femtometres (fm)?`;
    const options = buildDistinctMcqOptions({
      truth,
      unit,
      correctSlot: slot,
      distractors: [
        {
          value: wrongProjCharge,
          rationale: isProton
            ? "Uses +2e instead of +1e for the incident proton charge."
            : "Uses +1e instead of +2e for the alpha-particle charge in E_p = k Q₁ Q₂ / d.",
        },
        {
          value: usedMassAInsteadOfZ,
          rationale:
            "Uses the target nucleon number A instead of proton number Z for the nuclear charge.",
        },
        {
          value: variantIdx % 2 === 0 ? truth * 1e-3 : sqrtForceError,
          rationale:
            variantIdx % 2 === 0
              ? "Converts metres to picometres (× 10¹²) instead of femtometres (× 10¹⁵)."
              : "Treats electrostatic potential energy as inversely proportional to d² rather than d.",
        },
      ],
      fallbackDistractors: [
        {
          value: truth * 0.25,
          rationale: "Inserts an extraneous ½ factor from kinetic energy after already given Eₖ in MeV.",
        },
      ],
    });
    const ans = formatQuantity3sf(truth, unit);

    return {
      id,
      conceptId: "rutherford-scattering-nuclear-radius",
      templateArchetype: "alpha-foil-closest-approach-distance",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Equate initial projectile kinetic energy to Coulomb potential energy at the head-on turning point",
        distractorStrategy: [
          "use-unit-charge-instead-of-alpha-double-charge",
          "substitute-nucleon-number-for-atomic-number",
          "confuse-inverse-distance-potential-with-inverse-square-force",
        ],
      },
      targetQuantityKey: targetKey,
      stem,
      options,
      workedSolution: `Initial kinetic energy Eₖ = ${kineticEnergyMeV} × 10⁶ × 1.60 × 10⁻¹⁹ = ${formatQuantity3sf(sol.initialKineticEnergyJ, "J")}. At the turning point, Eₖ = k(${projZ}e)(${target.Z}e) / d, so d = (8.99 × 10⁹)(${projZ})(${target.Z})(1.60 × 10⁻¹⁹)² / ${formatQuantity3sf(sol.initialKineticEnergyJ)} = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Equates Eₖ to k Q₁ Q₂ / d to obtain d = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `Calculate the head-on distance of closest approach d, in femtometres (fm), assuming pure Coulomb repulsion.`,
      marks: 2,
      targetQuantityKey: "closestApproachFm",
      truth: sol.closestApproachFm,
      unit: "fm",
      methodCriterion: "Converts Eₖ to joules, equates Eₖ = k Q₁ Q₂ / d, and converts metres to femtometres.",
      workingSteps: [
        `Eₖ = ${kineticEnergyMeV} × 1.60 × 10⁻¹³ = ${formatQuantity3sf(sol.initialKineticEnergyJ, "J")}.`,
        `d = k(${projZ}e)(${target.Z}e) / Eₖ = ${formatQuantity3sf(sol.closestApproachM, "m")} = ${formatQuantity3sf(sol.closestApproachFm, "fm")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Taking R₀ = 1.20 fm in R = R₀ A^(1/3), calculate the nuclear radius R of ${target.foilName} in femtometres (fm) to verify that d > R.`,
      marks: 2,
      targetQuantityKey: "estimatedNuclearRadiusFm",
      truth: sol.estimatedNuclearRadiusFm,
      unit: "fm",
      methodCriterion: "Applies R = 1.20 × A^(1/3) fm.",
      workingSteps: [
        `R = 1.20 × (${target.A})^(1/3) = ${formatQuantity3sf(sol.estimatedNuclearRadiusFm, "fm")} (< d, confirming pure electrostatic scattering).`,
      ],
    },
    {
      partId: "c",
      prompt: `Taking nucleon mass unit u = 1.661 × 10⁻²⁷ kg, estimate the nuclear density ρ of ${target.foilName} in kg m⁻³.`,
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "nuclearDensityKgM3",
      truth: sol.nuclearDensityKgM3,
      unit: "kg m⁻³",
      methodCriterion: "Evaluates ρ = A u / ((4/3)πR³) in SI units.",
      workingSteps: [
        `ρ = (${target.A} × 1.661 × 10⁻²⁷) / ((4/3)π(${formatQuantity3sf(sol.estimatedNuclearRadiusM)})³) = ${formatQuantity3sf(sol.nuclearDensityKgM3, "kg m⁻³")}.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "alpha-foil-closest-approach-distance",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Convert projectile energy to joules and compute head-on Coulomb closest approach in metres and femtometres",
      subpartStrategy: [
        "convert-initial-kinetic-energy-to-joules",
        "solve-coulomb-energy-balance-for-turning-distance",
        "convert-closest-approach-to-femtometres",
      ],
    },
    stem: baseStem,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 14: rutherford-scattering-nuclear-radius :: fermi-nuclear-radius-and-density
// (IB HL + A-Level Y13 + NCUK IFY-S2)
// ============================================================================

interface NuclearRadiusPreset {
  readonly elementName: string;
  readonly symbol: string;
  readonly Z: number;
  readonly A: number;
  readonly probeEnergyMeV: number;
  readonly context: string;
}

const NUCLEAR_RADIUS_PRESETS: readonly NuclearRadiusPreset[] = [
  { elementName: "carbon-12", symbol: "C", Z: 6, A: 12, probeEnergyMeV: 4.5, context: "an electron-scattering nuclear form-factor study" },
  { elementName: "oxygen-16", symbol: "O", Z: 8, A: 16, probeEnergyMeV: 4.7, context: "a light-element charge-radius diffraction run" },
  { elementName: "aluminium-27", symbol: "Al", Z: 13, A: 27, probeEnergyMeV: 5.0, context: "a light-metal nuclear radius calibration" },
  { elementName: "silicon-28", symbol: "Si", Z: 14, A: 28, probeEnergyMeV: 5.1, context: "a semiconductor-wafer ion-scattering measurement" },
  { elementName: "sulfur-32", symbol: "S", Z: 16, A: 32, probeEnergyMeV: 5.3, context: "a medium-light nuclear size determination" },
  { elementName: "calcium-40", symbol: "Ca", Z: 20, A: 40, probeEnergyMeV: 5.2, context: "a charge-distribution scattering experiment" },
  { elementName: "titanium-48", symbol: "Ti", Z: 22, A: 48, probeEnergyMeV: 5.5, context: "a transition-metal foil nuclear-radius test" },
  { elementName: "iron-56", symbol: "Fe", Z: 26, A: 56, probeEnergyMeV: 5.6, context: "a medium-mass nuclear matter investigation" },
  { elementName: "nickel-58", symbol: "Ni", Z: 28, A: 58, probeEnergyMeV: 5.8, context: "a ferromagnetic-target scattering benchmark" },
  { elementName: "zinc-64", symbol: "Zn", Z: 30, A: 64, probeEnergyMeV: 5.4, context: "a nuclear-volume scaling verification" },
  { elementName: "germanium-74", symbol: "Ge", Z: 32, A: 74, probeEnergyMeV: 5.9, context: "a high-purity germanium nuclear-radius study" },
  { elementName: "zirconium-90", symbol: "Zr", Z: 40, A: 90, probeEnergyMeV: 6.1, context: "a magic-neutron zirconium radius determination" },
  { elementName: "silver-108", symbol: "Ag", Z: 47, A: 108, probeEnergyMeV: 6.0, context: "a thin-foil nuclear geometry analysis" },
  { elementName: "tin-120", symbol: "Sn", Z: 50, A: 120, probeEnergyMeV: 6.3, context: "a closed-proton-shell tin scattering run" },
  { elementName: "tellurium-125", symbol: "Te", Z: 52, A: 125, probeEnergyMeV: 6.2, context: "an exact cube-root nuclear radius benchmark" },
  { elementName: "barium-138", symbol: "Ba", Z: 56, A: 138, probeEnergyMeV: 6.5, context: "a heavy-ion nuclear size survey" },
  { elementName: "samarium-152", symbol: "Sm", Z: 62, A: 152, probeEnergyMeV: 6.6, context: "a lanthanide nuclear matter density check" },
  { elementName: "tantalum-181", symbol: "Ta", Z: 73, A: 181, probeEnergyMeV: 6.7, context: "a refractory tantalum target scattering study" },
  { elementName: "tungsten-184", symbol: "W", Z: 74, A: 184, probeEnergyMeV: 6.8, context: "a high-mass nuclear density evaluation" },
  { elementName: "platinum-195", symbol: "Pt", Z: 78, A: 195, probeEnergyMeV: 6.9, context: "a noble-metal nuclear-radius experiment" },
  { elementName: "gold-197", symbol: "Au", Z: 79, A: 197, probeEnergyMeV: 7.0, context: "a Rutherford gold-foil nuclear-radius comparison" },
  { elementName: "lead-208", symbol: "Pb", Z: 82, A: 208, probeEnergyMeV: 7.4, context: "a doubly magic lead nuclear-radius determination" },
  { elementName: "uranium-238", symbol: "U", Z: 92, A: 238, probeEnergyMeV: 7.8, context: "an actinide nuclear-volume calculation" },
];

function buildArchetype14Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch14:${seed}:${variantIdx}`);
  const preset = NUCLEAR_RADIUS_PRESETS[variantIdx % NUCLEAR_RADIUS_PRESETS.length];
  const probeOffset = ((variantIdx * 2) % 5) * 0.1;
  const probeEnergyMeV = Number((preset.probeEnergyMeV + probeOffset).toFixed(1));

  const spec: RutherfordScatteringScenarioSpec = {
    kind: "rutherford-scattering",
    projectileChargeZ: 2,
    targetSymbol: preset.symbol,
    targetChargeZ: preset.Z,
    targetMassNumberA: preset.A,
    kineticEnergyMeV: probeEnergyMeV,
    showDeflectedPaths: true,
  };

  const sol = solveQuantumNuclearScenario(spec) as RutherfordScatteringSolution;
  const hiddenQuantities = [
    "projectileChargeC",
    "targetChargeC",
    "closestApproachM",
    "closestApproachFm",
    "estimatedNuclearRadiusM",
    "estimatedNuclearRadiusFm",
    "nuclearDensityKgM3",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "projectileChargeZ", value: 2, source: "stem" },
    { name: "targetChargeZ", value: preset.Z, source: "stem" },
    { name: "targetMassNumberA", value: preset.A, source: "stem" },
    { name: "kineticEnergyMeV", value: probeEnergyMeV, unit: "MeV", source: "stem" },
    { name: "fermiRadiusFm", value: 1.2, unit: "fm", source: "stem" },
    { name: "fermiRadiusM", value: 1.2e-15, unit: "m", source: "stem" },
  ];

  const syllabi = resolveSyllabusTagsFromCrosswalk(
    "rutherford-scattering-nuclear-radius",
    {
      format,
      ibLevelOverride: "HL",
      alevelLevelOverride: "Y13",
      ncukLevelOverride: "IFY-S2",
    },
  );
  const difficulty = chooseDifficulty(variantIdx);

  const frames = [
    `In ${preset.context}, alpha particles (Z₁ = 2) of kinetic energy ${probeEnergyMeV} MeV scatter from a spherical ${preset.elementName} target nucleus with proton number Z = ${preset.Z} and nucleon number A = ${preset.A}. Model the nuclear radius as R = R₀ A^(1/3) with R₀ = 1.20 fm = 1.20 × 10⁻¹⁵ m and nucleon mass unit u = 1.661 × 10⁻²⁷ kg.`,
    `During ${preset.context}, a ${probeEnergyMeV} MeV alpha beam (charge +2e) probes ${preset.elementName} nuclei (Z = ${preset.Z}, A = ${preset.A}). Assume a uniform spherical nucleus obeying R = R₀ A^(1/3), where R₀ = 1.20 fm = 1.20 × 10⁻¹⁵ m and u = 1.661 × 10⁻²⁷ kg.`,
    `Scattering data from ${preset.context} use ${probeEnergyMeV} MeV alpha particles (Z₁ = 2) incident on ${preset.elementName} (Z = ${preset.Z}, A = ${preset.A}). Take empirical Fermi constant R₀ = 1.20 fm = 1.20 × 10⁻¹⁵ m in R = R₀ A^(1/3) and u = 1.661 × 10⁻²⁷ kg.`,
    `Consider a spherical ${preset.elementName} nucleus (Z = ${preset.Z}, A = ${preset.A}) bombarded by ${probeEnergyMeV} MeV alpha particles (Z₁ = 2) in ${preset.context}. Take R = R₀ A^(1/3) with R₀ = 1.20 fm = 1.20 × 10⁻¹⁵ m and u = 1.661 × 10⁻²⁷ kg.`,
    `Nuclear geometry measurements in ${preset.context} direct ${probeEnergyMeV} MeV alpha particles (Z₁ = 2) onto ${preset.elementName} (proton number Z = ${preset.Z}, mass number A = ${preset.A}), using R = R₀ A^(1/3), R₀ = 1.20 fm = 1.20 × 10⁻¹⁵ m, and u = 1.661 × 10⁻²⁷ kg.`,
    `Within ${preset.context}, ${probeEnergyMeV} MeV helium-4 nuclei (Z₁ = 2) scatter elastically off ${preset.elementName} (Z = ${preset.Z}, A = ${preset.A}). Model the target as a uniform sphere of radius R = R₀ A^(1/3) with R₀ = 1.20 fm = 1.20 × 10⁻¹⁵ m and u = 1.661 × 10⁻²⁷ kg.`,
    `Empirical nuclear-size analysis in ${preset.context} examines ${preset.elementName} (Z = ${preset.Z}, A = ${preset.A}) illuminated by ${probeEnergyMeV} MeV alpha particles (Z₁ = 2), taking R = R₀ A^(1/3), R₀ = 1.20 fm = 1.20 × 10⁻¹⁵ m, and u = 1.661 × 10⁻²⁷ kg.`,
  ];
  const baseStem = frames[(variantIdx * 3 + Math.floor(variantIdx / 8)) % frames.length];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const askDensity = variantIdx % 3 === 2;

    if (!askDensity) {
      const stem = `${baseStem} What is the estimated nuclear radius R, in femtometres (fm), of the ${preset.elementName} nucleus?`;
      const options = buildDistinctMcqOptions({
        truth: sol.estimatedNuclearRadiusFm,
        unit: "fm",
        correctSlot: slot,
        distractors: [
          {
            value: 1.2 * Math.cbrt(preset.Z),
            rationale:
              "Uses proton number Z instead of total nucleon number A inside R = R₀ A^(1/3).",
          },
          {
            value: 1.2 * Math.sqrt(preset.A),
            rationale:
              "Scales nuclear radius with A^(1/2) instead of the three-dimensional volume root A^(1/3).",
          },
          {
            value: 1.2 * preset.A,
            rationale:
              "Scales nuclear radius linearly with nucleon number A instead of A^(1/3).",
          },
        ],
        fallbackDistractors: [
          {
            value: 1.2 * (preset.A / 3),
            rationale: "Multiplies A by 1/3 instead of raising A to the power 1/3.",
          },
        ],
      });
      const ans = formatQuantity3sf(sol.estimatedNuclearRadiusFm, "fm");
      return {
        id,
        conceptId: "rutherford-scattering-nuclear-radius",
        templateArchetype: "fermi-nuclear-radius-and-density",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: {
          targetSummary:
            "Calculate empirical Fermi nuclear radius from cube-root nucleon scaling in femtometres",
          distractorStrategy: [
            "substitute-proton-number-instead-of-nucleon-number",
            "use-square-root-scaling-instead-of-cube-root",
            "use-linear-nucleon-scaling",
          ],
        },
        targetQuantityKey: "estimatedNuclearRadiusFm",
        stem,
        options,
        workedSolution: `Using R = R₀ A^(1/3) = 1.20 × (${preset.A})^(1/3) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates R = 1.20 × ${preset.A}^(1/3) = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${baseStem} Assuming nuclear mass m ≈ A u, what is the nuclear matter density ρ of this ${preset.elementName} nucleus?`;
    const noFourThirdsPi =
      (preset.A * 1.661e-27) / sol.estimatedNuclearRadiusM ** 3;
    const options = buildDistinctMcqOptions({
      truth: sol.nuclearDensityKgM3,
      unit: "kg m⁻³",
      correctSlot: slot,
      distractors: [
        {
          value: noFourThirdsPi,
          rationale:
            "Treats the nucleus as a cube of side R (omitting the 4π/3 spherical volume factor).",
        },
        {
          value: sol.nuclearDensityKgM3 * (preset.Z / preset.A),
          rationale:
            "Counts only proton mass Z u instead of total nucleon mass A u in the numerator.",
        },
        {
          value: sol.nuclearDensityKgM3 * 1e-18,
          rationale:
            "Misconverts fm³ to m³ as 10⁻²⁷ m³ instead of (10⁻¹⁵)³ = 10⁻⁴⁵ m³.",
        },
      ],
      fallbackDistractors: [
        {
          value: sol.nuclearDensityKgM3 / 4,
          rationale: "Uses diameter instead of radius in V = (4/3)πR³.",
        },
      ],
    });
    const ans = formatQuantity3sf(sol.nuclearDensityKgM3, "kg m⁻³");
    return {
      id,
      conceptId: "rutherford-scattering-nuclear-radius",
      templateArchetype: "fermi-nuclear-radius-and-density",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Estimate uniform nuclear matter density from empirical Fermi radius scaling and spherical volume",
        distractorStrategy: [
          "omit-four-thirds-pi-spherical-geometry-factor",
          "use-proton-number-only-for-nuclear-mass",
          "cubic-femtometre-to-cubic-metre-exponent-error",
        ],
      },
      targetQuantityKey: "nuclearDensityKgM3",
      stem,
      options,
      workedSolution: `Since R = R₀ A^(1/3), V = (4/3)πR³ = (4/3)π R₀³ A. Thus ρ = (A u) / ((4/3)π R₀³ A) = 3u / (4π R₀³) = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Computes ρ = A u / ((4/3)πR³) = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `Calculate the nuclear radius R of ${preset.elementName}, in femtometres (fm).`,
      marks: 2,
      targetQuantityKey: "estimatedNuclearRadiusFm",
      truth: sol.estimatedNuclearRadiusFm,
      unit: "fm",
      methodCriterion: "Substitutes nucleon number A into R = R₀ A^(1/3).",
      workingSteps: [
        `R = 1.20 × (${preset.A})^(1/3) = ${formatQuantity3sf(sol.estimatedNuclearRadiusFm, "fm")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `State the nuclear radius R in metres.`,
      marks: 1,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "estimatedNuclearRadiusM",
      truth: sol.estimatedNuclearRadiusM,
      unit: "m",
      methodCriterion: "Multiplies R in fm by 10⁻¹⁵ m fm⁻¹",
      workingSteps: [
        `R = ${formatQuantity3sf(sol.estimatedNuclearRadiusM, "m")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Taking the mass of the nucleus to be A u, calculate the mean nuclear density ρ in kg m⁻³.`,
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "nuclearDensityKgM3",
      truth: sol.nuclearDensityKgM3,
      unit: "kg m⁻³",
      methodCriterion: "Divides nuclear mass A u by spherical volume (4/3)πR³.",
      workingSteps: [
        `m = ${preset.A} × 1.661 × 10⁻²⁷ kg; V = (4/3)π(${formatQuantity3sf(sol.estimatedNuclearRadiusM)})³.`,
        `ρ = m / V = ${formatQuantity3sf(sol.nuclearDensityKgM3, "kg m⁻³")}.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "fermi-nuclear-radius-and-density",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Evaluate nuclear radius in femtometres and metres via Fermi cube-root scaling and compute nuclear matter density",
      subpartStrategy: [
        "compute-nuclear-radius-in-femtometres",
        "convert-nuclear-radius-to-si-metres",
        "evaluate-spherical-nuclear-density",
      ],
    },
    stem: baseStem,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 15: special-relativity-spacetime :: muon-spacecraft-time-dilation-length-contraction
// (NEVER IB SL, NEVER NCUK! MCQ -> IB HL; Structured -> IB HL + A-Level Y13 Turning Points)
// ============================================================================

interface RelativityKinematicPreset {
  readonly moverDesc: string;
  readonly restObserverDesc: string;
  readonly baselineDesc: string;
  readonly intervalDesc: string;
  readonly beta: number;
  readonly properTimeS: number;
  readonly properLengthM: number;
}

const RELATIVITY_KINEMATIC_PRESETS: readonly RelativityKinematicPreset[] = [
  {
    moverDesc: "atmospheric cosmic-ray muons",
    restObserverDesc: "an Earth mountain observatory",
    baselineDesc: "a vertical atmospheric column",
    intervalDesc: "muon rest-frame mean lifetime",
    beta: 0.96,
    properTimeS: 2.2e-6,
    properLengthM: 4800,
  },
  {
    moverDesc: "charged pions in a linear accelerator",
    restObserverDesc: "the laboratory hall",
    baselineDesc: "an evacuated drift-tube section",
    intervalDesc: "pion rest-frame proper lifetime",
    beta: 0.80,
    properTimeS: 2.6e-8,
    properLengthM: 18,
  },
  {
    moverDesc: "an automated laser-sail nanoprobe",
    restObserverDesc: "solar-system navigation buoys",
    baselineDesc: "a laser-ranging buoy baseline",
    intervalDesc: "onboard optical-clock tick interval",
    beta: 0.60,
    properTimeS: 4.5,
    properLengthM: 9.0e8,
  },
  {
    moverDesc: "relativistic kaons in a collider arm",
    restObserverDesc: "the detector cavern",
    baselineDesc: "a straight spectrometer flight path",
    intervalDesc: "kaon rest-frame proper decay time",
    beta: 0.90,
    properTimeS: 1.24e-8,
    properLengthM: 24,
  },
  {
    moverDesc: "a deep-space relativistic courier vessel",
    restObserverDesc: "two stationary relay towers",
    baselineDesc: "the inter-beacon corridor",
    intervalDesc: "onboard telemetry cycle duration",
    beta: 0.84,
    properTimeS: 14,
    properLengthM: 3.6e9,
  },
  {
    moverDesc: "partially stripped heavy ions",
    restObserverDesc: "a superconducting linac tunnel",
    baselineDesc: "a straight cryomodule array",
    intervalDesc: "isomeric nuclear rest-frame half-life",
    beta: 0.88,
    properTimeS: 3.5e-7,
    properLengthM: 150,
  },
  {
    moverDesc: "ultra-relativistic stratospheric muons",
    restObserverDesc: "a sea-level scintillator array",
    baselineDesc: "the tropospheric descent path",
    intervalDesc: "muon rest-frame decay lifetime",
    beta: 0.98,
    properTimeS: 2.2e-6,
    properLengthM: 9200,
  },
  {
    moverDesc: "a collimated microquasar plasmoid",
    restObserverDesc: "an astronomical interferometer frame",
    baselineDesc: "an interstellar gas filament",
    intervalDesc: "plasmoid-frame synchrotron flare duration",
    beta: 0.72,
    properTimeS: 65,
    properLengthM: 1.8e10,
  },
  {
    moverDesc: "a bunched muon-collider beam",
    restObserverDesc: "the extraction-line laboratory frame",
    baselineDesc: "a straight magnetic extraction channel",
    intervalDesc: "muon rest-frame proper lifetime",
    beta: 0.92,
    properTimeS: 2.2e-6,
    properLengthM: 1400,
  },
  {
    moverDesc: "an exoplanet-flyby relativistic nanocraft",
    restObserverDesc: "the target planetary rest frame",
    baselineDesc: "an orbital occultation baseline",
    intervalDesc: "spacecraft-frame camera shutter interval",
    beta: 0.50,
    properTimeS: 12,
    properLengthM: 2.4e9,
  },
  {
    moverDesc: "short-lived secondary hyperons",
    restObserverDesc: "a fixed-target detector hall",
    baselineDesc: "a silicon-vertex decay region",
    intervalDesc: "hyperon rest-frame proper lifetime",
    beta: 0.95,
    properTimeS: 1.6e-7,
    properLengthM: 85,
  },
  {
    moverDesc: "an antimatter-propelled interstellar sled",
    restObserverDesc: "heliocentric tracking stations",
    baselineDesc: "an outer-planet timing baseline",
    intervalDesc: "onboard caesium-fountain proper period",
    beta: 0.68,
    properTimeS: 28,
    properLengthM: 6.4e9,
  },
  {
    moverDesc: "fast radioactive beryllium-11 nuclei",
    restObserverDesc: "a fragment-separator hall",
    baselineDesc: "an evacuated time-of-flight beamline",
    intervalDesc: "nuclear rest-frame proper window",
    beta: 0.76,
    properTimeS: 8.5e-7,
    properLengthM: 210,
  },
];

function buildArchetype15Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch15:${seed}:${variantIdx}`);
  const preset =
    RELATIVITY_KINEMATIC_PRESETS[variantIdx % RELATIVITY_KINEMATIC_PRESETS.length];
  const scaleFactor = 1 + ((variantIdx * 3) % 7) * 0.08;
  const properTimeS = Number((preset.properTimeS * scaleFactor).toPrecision(3));
  const properLengthM = Number((preset.properLengthM * scaleFactor).toPrecision(3));

  const spec: SpecialRelativityScenarioSpec = {
    kind: "special-relativity",
    beta: preset.beta,
    properTimeS,
    properLengthM,
    domainLightSeconds: 5,
    symmetricTimeAxis: false,
    showLightCone: true,
    showPrimedAxes: true,
    schematicAxes: true,
  };

  const sol = solveQuantumNuclearScenario(spec) as SpecialRelativitySolution;
  const hiddenQuantities = [
    "frameSpeedMs",
    "lorentzFactor",
    "minkowskiAxisAngleRad",
    "minkowskiAxisAngleDeg",
    "dilatedTimeS",
    "contractedLengthM",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "beta", value: preset.beta, source: "stem" },
    { name: "properTimeS", value: properTimeS, unit: "s", source: "stem" },
    { name: "properLengthM", value: properLengthM, unit: "m", source: "stem" },
  ];

  // STRICT SYLLABUS COMPLIANCE:
  // getCompatibleSyllabiForConcept("special-relativity-spacetime", { format }):
  // - NEVER returns IB SL or NCUK!
  // - Returns IB HL only for MCQ, and IB HL + A-Level Y13 (Turning Points) for structured!
  const syllabi = resolveSyllabusTagsFromCrosswalk("special-relativity-spacetime", {
    format,
    ibLevelOverride: "HL",
    alevelLevelOverride: "Y13",
    ncukLevelOverride: "exclude",
  });
  const difficulty = chooseDifficulty(variantIdx);

  const l0Str = formatExactGiven(properLengthM, "m");
  const t0Str = formatExactGiven(properTimeS, "s");
  const relFrames = [
    `Relative to ${preset.restObserverDesc}, ${preset.moverDesc} travel at constant speed v = ${preset.beta}c across ${preset.baselineDesc} of stationary-frame proper length L₀ = ${l0Str}, while the ${preset.intervalDesc} is Δt₀ = ${t0Str}.`,
    `In ${preset.restObserverDesc}, ${preset.baselineDesc} has rest length L₀ = ${l0Str}. Passing ${preset.moverDesc} move parallel to it at v = ${preset.beta}c and have a ${preset.intervalDesc} of Δt₀ = ${t0Str}.`,
    `Measurements from ${preset.restObserverDesc} track ${preset.moverDesc} cruising at v = ${preset.beta}c along ${preset.baselineDesc} (proper length L₀ = ${l0Str}); in the moving rest frame, the ${preset.intervalDesc} equals Δt₀ = ${t0Str}.`,
    `Along ${preset.baselineDesc} of rest-frame length L₀ = ${l0Str} in ${preset.restObserverDesc}, ${preset.moverDesc} coast at uniform velocity v = ${preset.beta}c with ${preset.intervalDesc} Δt₀ = ${t0Str}.`,
    `Consider ${preset.moverDesc} moving at v = ${preset.beta}c with respect to ${preset.restObserverDesc}, traversing ${preset.baselineDesc} (stationary proper length L₀ = ${l0Str}) during a ${preset.intervalDesc} of Δt₀ = ${t0Str}.`,
    `Within ${preset.restObserverDesc}, ${preset.moverDesc} maintain speed v = ${preset.beta}c across ${preset.baselineDesc} whose proper length is L₀ = ${l0Str}; their ${preset.intervalDesc} is Δt₀ = ${t0Str}.`,
    `Special-relativity timing in ${preset.restObserverDesc} follows ${preset.moverDesc} at speed v = ${preset.beta}c over ${preset.baselineDesc} of proper length L₀ = ${l0Str}, given ${preset.intervalDesc} Δt₀ = ${t0Str}.`,
  ];
  const dynamicContext =
    relFrames[(variantIdx * 3 + Math.floor(variantIdx / 7)) % relFrames.length];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const subMode = variantIdx % 3;

    if (subMode === 0) {
      const stem = `${dynamicContext} What dilated time interval Δt corresponds to Δt₀ in the stationary observer frame?`;
      const invertedGamma = properTimeS / sol.lorentzFactor;
      const noSqrtGamma = properTimeS / (1 - preset.beta ** 2);
      const linearBeta = properTimeS / Math.sqrt(1 - preset.beta);
      const options = buildDistinctMcqOptions({
        truth: sol.dilatedTimeS!,
        unit: "s",
        correctSlot: slot,
        distractors: [
          {
            value: invertedGamma,
            rationale:
              "Inverts the Lorentz factor γ, dividing proper time Δt₀ / γ instead of multiplying γ Δt₀.",
          },
          {
            value: noSqrtGamma,
            rationale:
              "Omits the square root in γ = 1 / √(1 − v²/c²), multiplying Δt₀ by 1 / (1 − β²).",
          },
          {
            value: linearBeta,
            rationale:
              "Uses √(1 − v/c) instead of √(1 − v²/c²) inside the Lorentz factor.",
          },
        ],
        fallbackDistractors: [
          {
            value: properTimeS,
            rationale: "Assumes Galilean absolute time Δt = Δt₀.",
          },
        ],
      });
      const ans = formatQuantity3sf(sol.dilatedTimeS!, "s");
      return {
        id,
        conceptId: "special-relativity-spacetime",
        templateArchetype: "muon-spacecraft-time-dilation-length-contraction",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: {
          targetSummary:
            "Compute relativistic time dilation from proper time interval and relative speed beta",
          distractorStrategy: [
            "invert-lorentz-factor-by-dividing-proper-time",
            "omit-square-root-in-lorentz-factor",
            "use-linear-beta-instead-of-beta-squared",
          ],
        },
        targetQuantityKey: "dilatedTimeS",
        stem,
        options,
        workedSolution: `Lorentz factor γ = 1 / √(1 − ${preset.beta}²) = ${formatQuantity3sf(sol.lorentzFactor)}. Dilated time interval Δt = γ Δt₀ = ${formatQuantity3sf(sol.lorentzFactor)} × ${formatExactGiven(properTimeS)} = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates γ = ${formatQuantity3sf(sol.lorentzFactor)} and Δt = γ Δt₀ = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (subMode === 1) {
      const stem = `${dynamicContext} What contracted length L of the baseline L₀ is measured in the moving rest frame?`;
      const invertedGammaLen = properLengthM * sol.lorentzFactor;
      const noSqrtLen = properLengthM * (1 - preset.beta ** 2);
      const linearBetaLen = properLengthM * Math.sqrt(1 - preset.beta);
      const options = buildDistinctMcqOptions({
        truth: sol.contractedLengthM!,
        unit: "m",
        correctSlot: slot,
        distractors: [
          {
            value: invertedGammaLen,
            rationale:
              "Inverts the Lorentz factor γ, multiplying proper length γ L₀ instead of contracting L₀ / γ.",
          },
          {
            value: noSqrtLen,
            rationale:
              "Forgets the square root in √(1 − v²/c²), multiplying L₀ by (1 − β²).",
          },
          {
            value: linearBetaLen,
            rationale:
              "Uses √(1 − v/c) instead of √(1 − v²/c²) in the length-contraction formula.",
          },
        ],
        fallbackDistractors: [
          {
            value: properLengthM * preset.beta,
            rationale: "Multiplies proper length directly by v/c.",
          },
        ],
      });
      const ans = formatQuantity3sf(sol.contractedLengthM!, "m");
      return {
        id,
        conceptId: "special-relativity-spacetime",
        templateArchetype: "muon-spacecraft-time-dilation-length-contraction",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: {
          targetSummary:
            "Compute relativistic length contraction of a stationary baseline in the moving rest frame",
          distractorStrategy: [
            "invert-lorentz-factor-by-multiplying-proper-length",
            "omit-square-root-in-contraction-factor",
            "use-linear-beta-instead-of-beta-squared",
          ],
        },
        targetQuantityKey: "contractedLengthM",
        stem,
        options,
        workedSolution: `Lorentz factor γ = 1 / √(1 − ${preset.beta}²) = ${formatQuantity3sf(sol.lorentzFactor)}. Contracted length L = L₀ / γ = ${formatExactGiven(properLengthM)} / ${formatQuantity3sf(sol.lorentzFactor)} = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates γ = ${formatQuantity3sf(sol.lorentzFactor)} and L = L₀ / γ = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${dynamicContext} What is the Lorentz factor γ for this relative speed v = ${preset.beta}c?`;
    const options = buildDistinctMcqOptions({
      truth: sol.lorentzFactor,
      unit: "",
      correctSlot: slot,
      distractors: [
        {
          value: 1 / sol.lorentzFactor,
          rationale: "Computes √(1 − v²/c²) = 1/γ instead of taking its reciprocal.",
        },
        {
          value: 1 / (1 - preset.beta ** 2),
          rationale: "Omits the square root in γ = 1 / √(1 − v²/c²).",
        },
        {
          value: 1 / Math.sqrt(1 - preset.beta),
          rationale: "Omits squaring β = v/c inside 1 / √(1 − β²).",
        },
      ],
      fallbackDistractors: [
        {
          value: 1 / Math.sqrt(1 + preset.beta ** 2),
          rationale: "Uses a plus sign inside √(1 + v²/c²).",
        },
      ],
    });
    const ans = formatQuantity3sf(sol.lorentzFactor);
    return {
      id,
      conceptId: "special-relativity-spacetime",
      templateArchetype: "muon-spacecraft-time-dilation-length-contraction",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary: "Evaluate relativistic Lorentz factor gamma from speed parameter beta",
        distractorStrategy: [
          "invert-lorentz-factor-reciprocal",
          "omit-square-root-on-lorentz-denominator",
          "omit-squaring-beta-ratio",
        ],
      },
      targetQuantityKey: "lorentzFactor",
      stem,
      options,
      workedSolution: `γ = 1 / √(1 − v²/c²) = 1 / √(1 − ${preset.beta}²) = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates 1 / √(1 − ${preset.beta}²) = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `Calculate the Lorentz factor γ corresponding to v = ${preset.beta}c.`,
      marks: 2,
      targetQuantityKey: "lorentzFactor",
      truth: sol.lorentzFactor,
      unit: "",
      methodCriterion: "Substitutes β = v/c into γ = 1 / √(1 − β²).",
      workingSteps: [
        `γ = 1 / √(1 − ${preset.beta}²) = ${formatQuantity3sf(sol.lorentzFactor)}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the dilated time interval Δt measured in the stationary reference frame.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "dilatedTimeS",
      truth: sol.dilatedTimeS!,
      unit: "s",
      methodCriterion: "Multiplies proper time interval Δt₀ by γ (Δt = γ Δt₀).",
      workingSteps: [
        `Δt = γ Δt₀ = ${formatQuantity3sf(sol.lorentzFactor)} × ${formatExactGiven(properTimeS)} = ${formatQuantity3sf(sol.dilatedTimeS!, "s")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Calculate the contracted length L of the baseline L₀ as measured in the moving frame.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "contractedLengthM",
      truth: sol.contractedLengthM!,
      unit: "m",
      methodCriterion: "Divides proper length L₀ by γ (L = L₀ / γ).",
      workingSteps: [
        `L = L₀ / γ = ${formatExactGiven(properLengthM)} / ${formatQuantity3sf(sol.lorentzFactor)} = ${formatQuantity3sf(sol.contractedLengthM!, "m")}.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "special-relativity-spacetime",
    templateArchetype: "muon-spacecraft-time-dilation-length-contraction",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Evaluate Lorentz factor gamma, time dilation in the stationary frame, and length contraction in the moving frame",
      subpartStrategy: [
        "compute-lorentz-factor-gamma",
        "evaluate-dilated-time-interval",
        "evaluate-contracted-proper-length",
      ],
    },
    stem: dynamicContext,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// ARCHETYPE 16: special-relativity-spacetime :: minkowski-worldline-velocity-addition
// (STRICTLY IB HL A.5 EXCLUSIVE — NEVER IB SL, NEVER A-LEVEL, NEVER NCUK!)
// ============================================================================

interface VelocityAdditionPreset {
  readonly context: string;
  readonly frameBeta: number;
  readonly objectU: number;
  readonly frameLabel: string;
  readonly objectLabel: string;
}

const VELOCITY_ADDITION_PRESETS: readonly VelocityAdditionPreset[] = [
  {
    context: "a deep-space relativistic relay experiment",
    frameBeta: 0.60,
    objectU: 0.90,
    frameLabel: "patrol vessel S′",
    objectLabel: "telemetry probe P",
  },
  {
    context: "an intersecting proton-storage-ring hall",
    frameBeta: 0.80,
    objectU: -0.70,
    frameLabel: "bunch A rest frame S′",
    objectLabel: "counter-circulating bunch B",
  },
  {
    context: "a binary pulsar relativistic jet observation",
    frameBeta: 0.50,
    objectU: -0.80,
    frameLabel: "advancing jet knot S′",
    objectLabel: "receding counter-jet knot Q",
  },
  {
    context: "a linear collider positron-electron interaction region",
    frameBeta: 0.75,
    objectU: -0.85,
    frameLabel: "electron packet frame S′",
    objectLabel: "opposing positron packet",
  },
  {
    context: "an interstellar beacon launch sequence",
    frameBeta: 0.65,
    objectU: 0.92,
    frameLabel: "carrier ship S′",
    objectLabel: "forward-launched scout pod",
  },
  {
    context: "a heavy-ion collider beam-crossing detector",
    frameBeta: 0.70,
    objectU: -0.60,
    frameLabel: "gold-ion bunch S′",
    objectLabel: "opposing deuteron bunch",
  },
  {
    context: "an active galactic nucleus blazar jet model",
    frameBeta: 0.55,
    objectU: 0.88,
    frameLabel: "outer plasma shell S′",
    objectLabel: "faster inner shock front",
  },
  {
    context: "a relativistic navigation rangefinder test",
    frameBeta: 0.45,
    objectU: -0.75,
    frameLabel: "cruiser S′",
    objectLabel: "approaching drone",
  },
  {
    context: "a cosmic-ray air-shower Lorentz boost analysis",
    frameBeta: 0.85,
    objectU: 0.96,
    frameLabel: "secondary pion frame S′",
    objectLabel: "forward decay muon",
  },
  {
    context: "a high-energy antiproton accumulator ring",
    frameBeta: 0.68,
    objectU: -0.52,
    frameLabel: "proton bunch frame S′",
    objectLabel: "counter-moving antiproton bunch",
  },
  {
    context: "a relativistic laser-pulse plasma wakefield stage",
    frameBeta: 0.74,
    objectU: 0.96,
    frameLabel: "wakefield bubble frame S′",
    objectLabel: "injected witness electron bunch",
  },
  {
    context: "a gamma-ray-burst colliding-shell outflow",
    frameBeta: 0.62,
    objectU: 0.91,
    frameLabel: "leading ejecta shell S′",
    objectLabel: "trailing ultra-fast shell",
  },
  {
    context: "an orbital optical-clock Doppler link",
    frameBeta: 0.42,
    objectU: -0.68,
    frameLabel: "outbound relay platform S′",
    objectLabel: "inbound return transponder",
  },
  {
    context: "a muon-antimuon collider interaction point",
    frameBeta: 0.88,
    objectU: -0.82,
    frameLabel: "muon bunch rest frame S′",
    objectLabel: "opposing antimuon bunch",
  },
  {
    context: "a pulsar-wind nebula relativistic shock front",
    frameBeta: 0.52,
    objectU: 0.84,
    frameLabel: "post-shock flow S′",
    objectLabel: "upstream energetic positron stream",
  },
];

function buildArchetype16Candidate(
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
): CandidateQuestionInput {
  const rng = createPrng(`arch16:${seed}:${variantIdx}`);
  const preset =
    VELOCITY_ADDITION_PRESETS[variantIdx % VELOCITY_ADDITION_PRESETS.length];
  const jitter = ((variantIdx * 3) % 7 - 3) * 0.01;
  const frameBeta = Number((preset.frameBeta + jitter).toFixed(2));
  const objectU = Number(
    Math.max(-0.97, Math.min(0.97, preset.objectU - jitter)).toFixed(2),
  );

  const spec: SpecialRelativityScenarioSpec = {
    kind: "special-relativity",
    beta: frameBeta,
    objectVelocityFractionC: objectU,
    domainLightSeconds: 5,
    symmetricTimeAxis: true,
    showLightCone: true,
    showPrimedAxes: true,
    schematicAxes: true,
    worldlines: [{ id: "w1", label: "object", beta: objectU }],
  };

  const sol = solveQuantumNuclearScenario(spec) as SpecialRelativitySolution;
  const hiddenQuantities = [
    "frameSpeedMs",
    "lorentzFactor",
    "minkowskiAxisAngleRad",
    "minkowskiAxisAngleDeg",
    "objectVelocityMs",
    "transformedVelocityFractionC",
    "transformedVelocityMs",
  ];
  const requiredGivens: RequiredGivenSpec[] = [
    { name: "beta", value: frameBeta, source: "stem" },
    { name: "objectVelocityFractionC", value: objectU, source: "stem" },
  ];

  // STRICT IB HL A.5 EXCLUSIVE: excludeOptionTopics removes A-Level Option 3.12, leaving ONLY IB HL!
  const syllabi = resolveSyllabusTagsFromCrosswalk("special-relativity-spacetime", {
    format,
    ibLevelOverride: "HL",
    excludeOptionTopics: true,
  });
  const difficulty = chooseDifficulty(variantIdx);

  const uDisp = objectU < 0 ? `−${Math.abs(objectU)}` : String(objectU);
  const frames = [
    `On the Minkowski spacetime diagram for ${preset.context}, inertial frame S′ (${preset.frameLabel}) moves along the +x-axis of laboratory frame S at velocity v = ${frameBeta}c, while ${preset.objectLabel} moves along the x-axis with velocity u = ${uDisp}c as measured in S.`,
    `In ${preset.context}, observer frame S′ (${preset.frameLabel}) travels at v = ${frameBeta}c relative to inertial frame S. Simultaneously, ${preset.objectLabel} has collinear velocity u = ${uDisp}c in frame S, as depicted on the spacetime diagram.`,
    `Relativistic kinematics in ${preset.context} relates rest frame S to moving frame S′ (${preset.frameLabel}) boosted at v = ${frameBeta}c along +x. In frame S, ${preset.objectLabel} has velocity component u = ${uDisp}c.`,
    `A Minkowski worldline diagram for ${preset.context} shows primed axes (x′, ct′) of ${preset.frameLabel} moving at v = ${frameBeta}c relative to S, together with ${preset.objectLabel} moving at u = ${uDisp}c in S.`,
    `Spacetime coordinates (x, ct) in ${preset.context} track ${preset.frameLabel} boosting at v = ${frameBeta}c relative to laboratory S while ${preset.objectLabel} propagates collinearly at u = ${uDisp}c in S.`,
    `Within ${preset.context}, inertial reference frame S′ (${preset.frameLabel}) has velocity v = ${frameBeta}c along +x relative to S, and ${preset.objectLabel} travels along the same axis at u = ${uDisp}c in S.`,
    `Worldlines plotted on a Minkowski diagram for ${preset.context} assign velocity v = ${frameBeta}c to ${preset.frameLabel} and velocity u = ${uDisp}c to ${preset.objectLabel}, both measured in frame S.`,
  ];
  const baseStem = frames[(variantIdx * 3 + Math.floor(variantIdx / 8)) % frames.length];

  if (format === "mcq") {
    const slot = (Math.floor(rng() * 4) % 4) as 0 | 1 | 2 | 3;
    const askAngle = variantIdx % 3 === 2;

    if (!askAngle) {
      const uPrime = sol.transformedVelocityFractionC!;
      const stem = `${baseStem} What is the dimensionless velocity ratio u′ / c of ${preset.objectLabel} measured in frame S′?`;
      const galilean = objectU - frameBeta;
      const wrongDenomSign = (objectU - frameBeta) / (1 + objectU * frameBeta);
      const wrongNumSign = (objectU + frameBeta) / (1 - objectU * frameBeta);

      const options = buildDistinctMcqOptions({
        truth: uPrime,
        unit: "",
        correctSlot: slot,
        distractors: [
          {
            value: galilean,
            rationale:
              "Applies Galilean velocity subtraction u′ = u − v without dividing by the relativistic factor (1 − uv/c²).",
          },
          {
            value: wrongDenomSign,
            rationale:
              "Uses a plus sign in the denominator (u − v) / (1 + uv/c²) instead of (u − v) / (1 − uv/c²).",
          },
          {
            value: -uPrime,
            rationale:
              "Reverses the sign of u′ = (v − u) / (1 − uv/c²) when transforming from S to S′.",
          },
        ],
        fallbackDistractors: [
          {
            value: wrongNumSign,
            rationale: "Adds frame velocity v instead of subtracting v in the numerator.",
          },
        ],
      });
      const ans = formatQuantity3sf(uPrime);
      return {
        id,
        conceptId: "special-relativity-spacetime",
        templateArchetype: "minkowski-worldline-velocity-addition",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "quantum-nuclear",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens,
        questionPlan: {
          targetSummary:
            "Apply collinear Lorentz relativistic velocity transformation between inertial frames",
          distractorStrategy: [
            "apply-classical-galilean-velocity-subtraction",
            "flip-sign-in-lorentz-velocity-denominator",
            "reverse-sign-of-transformed-velocity",
          ],
        },
        targetQuantityKey: "transformedVelocityFractionC",
        stem,
        options,
        workedSolution: `Using u′ = (u − v) / (1 − uv/c²), u′/c = (${objectU} − ${frameBeta}) / (1 − (${objectU})(${frameBeta})) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Substitutes u and v with signs into u′/c = (u/c − v/c) / (1 − uv/c²) = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${baseStem} What is the angle θ, in degrees, between the ct′ axis of frame S′ and the ct axis of frame S on the Minkowski diagram?`;
    const arcsinDeg = (Math.asin(Math.abs(frameBeta)) * 180) / Math.PI;
    const arccosDeg = (Math.acos(Math.abs(frameBeta)) * 180) / Math.PI;
    const radVal = sol.minkowskiAxisAngleRad;
    const options = buildDistinctMcqOptions({
      truth: sol.minkowskiAxisAngleDeg,
      unit: "°",
      correctSlot: slot,
      distractors: [
        {
          value: arcsinDeg,
          rationale:
            "Uses θ = arcsin(v/c) instead of θ = arctan(v/c) for the Minkowski worldline tilt.",
        },
        {
          value: arccosDeg,
          rationale: "Uses θ = arccos(v/c) instead of θ = arctan(v/c).",
        },
        {
          value: radVal,
          rationale:
            "Evaluates arctan(v/c) in radians without converting to degrees.",
        },
      ],
      fallbackDistractors: [
        {
          value: 45 * Math.abs(frameBeta),
          rationale: "Linearly interpolates angle as 45° × (v/c) instead of arctan(v/c).",
        },
      ],
    });
    const ans = formatQuantity3sf(sol.minkowskiAxisAngleDeg, "°");
    return {
      id,
      conceptId: "special-relativity-spacetime",
      templateArchetype: "minkowski-worldline-velocity-addition",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "quantum-nuclear",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Determine Minkowski spacetime primed-axis tilt angle theta = arctan(|v|/c)",
        distractorStrategy: [
          "use-arcsin-instead-of-arctan",
          "use-arccos-instead-of-arctan",
          "leave-angle-in-radians",
        ],
      },
      targetQuantityKey: "minkowskiAxisAngleDeg",
      stem,
      options,
      workedSolution: `On a Minkowski diagram with axes x and ct, tan θ = |v| / c = ${Math.abs(frameBeta)}, so θ = arctan(${Math.abs(frameBeta)}) = ${ans}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Uses tan θ = v / c to obtain θ = ${ans} (${MCQ_OPTION_LABELS[slot]}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const structuredBundle = buildStructuredBundle([
    {
      partId: "a",
      prompt: `Calculate the Lorentz factor γ of frame S′ relative to frame S.`,
      marks: 2,
      targetQuantityKey: "lorentzFactor",
      truth: sol.lorentzFactor,
      unit: "",
      methodCriterion: "Evaluates γ = 1 / √(1 − v²/c²).",
      workingSteps: [
        `γ = 1 / √(1 − ${frameBeta}²) = ${formatQuantity3sf(sol.lorentzFactor)}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the angle θ, in degrees, between the ct′ axis and the ct axis on the Minkowski diagram.`,
      marks: 2,
      targetQuantityKey: "minkowskiAxisAngleDeg",
      truth: sol.minkowskiAxisAngleDeg,
      unit: "°",
      methodCriterion: "Applies tan θ = |v| / c and converts arctan(|v|/c) to degrees.",
      workingSteps: [
        `tan θ = ${Math.abs(frameBeta)} ⇒ θ = arctan(${Math.abs(frameBeta)}) = ${formatQuantity3sf(sol.minkowskiAxisAngleDeg, "°")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Calculate the dimensionless velocity ratio u′ / c of ${preset.objectLabel} as measured in frame S′.`,
      marks: 2,
      targetQuantityKey: "transformedVelocityFractionC",
      truth: sol.transformedVelocityFractionC!,
      unit: "",
      methodCriterion: "Applies u′ = (u − v) / (1 − uv/c²) preserving algebraic signs.",
      workingSteps: [
        `u′ / c = (${objectU} − ${frameBeta}) / (1 − (${objectU})(${frameBeta})) = ${formatQuantity3sf(sol.transformedVelocityFractionC!)}.`,
      ],
    },
  ]);

  return {
    id,
    conceptId: "special-relativity-spacetime",
    templateArchetype: "minkowski-worldline-velocity-addition",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "quantum-nuclear",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens,
    questionPlan: {
      targetSummary:
        "Evaluate Lorentz factor, Minkowski primed-axis angle, and collinear relativistic velocity addition",
      subpartStrategy: [
        "compute-frame-lorentz-factor",
        "evaluate-minkowski-axis-tilt-angle",
        "evaluate-lorentz-transformed-velocity-ratio",
      ],
    },
    stem: baseStem,
    ...structuredBundle,
    generatorModel,
  };
}

// ============================================================================
// UNIFIED WAVE 2 GENERATOR DISPATCHER
// ============================================================================

type ArchetypeBuilderFn = (
  id: string,
  seed: number,
  variantIdx: number,
  format: QuestionFormat,
  generatorModel: string,
) => CandidateQuestionInput;

const ARCHETYPE_BUILDERS: readonly ArchetypeBuilderFn[] = [
  buildArchetype1Candidate,
  buildArchetype2Candidate,
  buildArchetype3Candidate,
  buildArchetype4Candidate,
  buildArchetype5Candidate,
  buildArchetype6Candidate,
  buildArchetype7Candidate,
  buildArchetype8Candidate,
  buildArchetype9Candidate,
  buildArchetype10Candidate,
  buildArchetype11Candidate,
  buildArchetype12Candidate,
  buildArchetype13Candidate,
  buildArchetype14Candidate,
  buildArchetype15Candidate,
  buildArchetype16Candidate,
];

/**
 * Generates deterministic, solver- and SVG-gate-verified `quantum-nuclear`
 * question packages + Qwen/Qwen3.5-9B distillation inputs across all 8 visual
 * families and 16 `(conceptId, templateArchetype)` family groups.
 */
export function generateQuantumNuclearCandidates(
  options: GenerateQuantumNuclearCandidatesOptions = {},
): CandidateQuestionInput[] {
  const totalCount = options.count ?? 336;
  const baseSeed = options.baseSeed ?? 820_000;
  const mcqRatio = options.mcqRatio ?? 0.65;
  const generatorModel = options.generatorModel ?? "gemini-4-carbon-high";
  const nearDuplicateThreshold = options.nearDuplicateThreshold ?? 0.85;

  if (!Number.isInteger(totalCount) || totalCount < 1 || totalCount > 5000) {
    throw new Error(
      `count must be an integer between 1 and 5000; received ${String(totalCount)}`,
    );
  }
  if (!Number.isInteger(baseSeed) || baseSeed < 0) {
    throw new Error(`baseSeed must be a non-negative integer; received ${String(baseSeed)}`);
  }
  if (!Number.isFinite(mcqRatio) || mcqRatio < 0 || mcqRatio > 1) {
    throw new Error(`mcqRatio must lie in [0, 1]; received ${String(mcqRatio)}`);
  }

  const targetMcqTotal = Math.round(totalCount * mcqRatio);
  const targetStructuredTotal = totalCount - targetMcqTotal;
  const numArchetypes = ARCHETYPE_BUILDERS.length;

  // Distribute formats evenly across all 16 archetypes
  const mcqPerArchetype = new Array<number>(numArchetypes).fill(
    Math.floor(targetMcqTotal / numArchetypes),
  );
  for (let r = 0; r < targetMcqTotal % numArchetypes; r += 1) {
    mcqPerArchetype[r] += 1;
  }

  const structPerArchetype = new Array<number>(numArchetypes).fill(
    Math.floor(targetStructuredTotal / numArchetypes),
  );
  for (let r = 0; r < targetStructuredTotal % numArchetypes; r += 1) {
    structPerArchetype[(numArchetypes - 1 - r + numArchetypes) % numArchetypes] += 1;
  }

  const candidates: CandidateQuestionInput[] = [];
  const acceptedStems: ExistingStemEntry[] = [];
  let seqNumber = 1;

  for (let archIdx = 0; archIdx < numArchetypes; archIdx += 1) {
    const builder = ARCHETYPE_BUILDERS[archIdx];
    const formatSchedule: QuestionFormat[] = [
      ...new Array<QuestionFormat>(mcqPerArchetype[archIdx]).fill("mcq"),
      ...new Array<QuestionFormat>(structPerArchetype[archIdx]).fill("structured"),
    ];

    let variantCursor = 0;
    for (let itemIdx = 0; itemIdx < formatSchedule.length; itemIdx += 1) {
      const fmt = formatSchedule[itemIdx];
      const itemId = `sp-qn-${fmt}-${String(seqNumber).padStart(3, "0")}`;
      let accepted: CandidateQuestionInput | undefined;
      let lastIssueMsg = "";

      for (let attempt = 0; attempt < 48; attempt += 1) {
        const effectiveVariant = variantCursor + attempt;
        const candidateSeed = baseSeed + archIdx * 10_000 + itemIdx * 100 + attempt;
        const draft = builder(
          itemId,
          candidateSeed,
          effectiveVariant,
          fmt,
          generatorModel,
        );

        // Enforce strict shingle diversity across the entire shard
        const tooSimilar = acceptedStems.some(
          (prev) =>
            computeStemSimilarity(draft.stem, prev.stem) >=
            nearDuplicateThreshold,
        );
        if (tooSimilar) {
          lastIssueMsg = "near-duplicate threshold exceeded during internal sweep";
          continue;
        }

        const gateRes = verifyCandidateWithGate(draft, {
          existingShardItems: acceptedStems,
        });
        if (gateRes.evaluation.valid) {
          accepted = draft;
          variantCursor = effectiveVariant + 1;
          acceptedStems.push({
            id: draft.id,
            stem: draft.stem,
            stemFingerprint:
              gateRes.evaluation.stemFingerprint ||
              computeStemFingerprint(draft.stem),
          });
          break;
        }
        lastIssueMsg = gateRes.evaluation.issues
          .map((i) => `${i.code}:${i.message}`)
          .join("; ");
      }

      if (!accepted) {
        throw new Error(
          `Failed to construct gate-verified quantum-nuclear candidate for archetype index ${archIdx} (${QUANTUM_NUCLEAR_ARCHETYPE_MANIFEST[archIdx].templateArchetype}, ${fmt}): ${lastIssueMsg}`,
        );
      }

      candidates.push(accepted);
      seqNumber += 1;
    }
  }

  return candidates;
}
