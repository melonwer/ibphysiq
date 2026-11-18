import {
  getCompatibleSyllabiForConcept,
} from "@/lib/constants/syllabi/crosswalk";
import { COULOMB_CONSTANT } from "@/lib/visuals/field-physics";

import { getDomainAdapter } from "../domain-registry";
import { buildOptionEquivalenceKey } from "../numeric-checker";
import {
  CandidateQuestionInput,
  CandidateQuestionPlan,
  MarkSchemePoint,
  MCQ_OPTION_LABELS,
  McqOptionItem,
  QuestionDifficulty,
  QuestionFormat,
  StructuredQuestionPart,
  SyllabusTag,
} from "../types";

export const DEFAULT_FIELDS_TARGET_COUNT = 336;
export const DEFAULT_FIELDS_BASE_SEED = 300_000;
export const DEFAULT_FIELDS_GENERATOR_MODEL = "gemini-4-carbon-high";

export interface GenerateFieldsCandidatesOptions {
  readonly count?: number;
  readonly baseSeed?: number;
  readonly mcqRatio?: number;
  readonly generatorModel?: string;
}

export interface FieldsArchetypeSpec {
  readonly index: number;
  readonly conceptId:
    | "electrostatic-coulomb-uniform-fields"
    | "electric-potential-equipotentials";
  readonly templateArchetype: string;
  readonly scenarioKind: string;
  readonly ibSubtopicOverride?: string;
  readonly defaultMcqCount: number;
  readonly defaultStructuredCount: number;
  readonly description: string;
}

export const FIELDS_GENERATOR_ARCHETYPES: readonly FieldsArchetypeSpec[] = [
  {
    index: 0,
    conceptId: "electrostatic-coulomb-uniform-fields",
    templateArchetype: "collinear-opposite-charges-interior-field",
    scenarioKind: "charge-field",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
    description:
      "Resultant electric field magnitude and direction at an interior point between opposite-sign collinear point charges",
  },
  {
    index: 1,
    conceptId: "electrostatic-coulomb-uniform-fields",
    templateArchetype: "collinear-like-charges-superposition-field",
    scenarioKind: "charge-field",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
    description:
      "Vector subtraction of opposing electric fields at an interior point between like-sign collinear point charges",
  },
  {
    index: 2,
    conceptId: "electrostatic-coulomb-uniform-fields",
    templateArchetype: "collinear-exterior-point-field",
    scenarioKind: "charge-field",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
    description:
      "Resultant electric field at an exterior collinear probe point beyond two fixed point charges",
  },
  {
    index: 3,
    conceptId: "electrostatic-coulomb-uniform-fields",
    templateArchetype: "symbolic-superposition-field-multiple",
    scenarioKind: "electric-superposition",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
    description:
      "Algebraic kQ/x^2 coefficient and direction of the resultant electric field between symbolic positive point charges",
  },
  {
    index: 4,
    conceptId: "electrostatic-coulomb-uniform-fields",
    templateArchetype: "three-charge-coulomb-force-on-probe",
    scenarioKind: "negative-probe",
    defaultMcqCount: 13,
    defaultStructuredCount: 8,
    description:
      "Coulomb electrostatic force magnitude and direction on a positive or negative probe charge placed near two source charges",
  },
  {
    index: 5,
    conceptId: "electrostatic-coulomb-uniform-fields",
    templateArchetype: "like-charges-interior-null-location",
    scenarioKind: "null-potential",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
    description:
      "Zero-field null coordinate along the axis between two unequal positive point charges",
  },
  {
    index: 6,
    conceptId: "electrostatic-coulomb-uniform-fields",
    templateArchetype: "null-point-charge-ratio-deduction",
    scenarioKind: "two-charge-field-graph",
    defaultMcqCount: 13,
    defaultStructuredCount: 8,
    description:
      "Deducing charge sign relationship, inverse-square charge ratio, and unknown source charge from an observed zero-field position",
  },
  {
    index: 7,
    conceptId: "electrostatic-coulomb-uniform-fields",
    templateArchetype: "uniform-parallel-plates-field-and-work",
    scenarioKind: "parallel-plates-particle",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
    description:
      "Uniform electric field strength E = V/d and electrical work W = qV across parallel conducting plates",
  },
  {
    index: 8,
    conceptId: "electrostatic-coulomb-uniform-fields",
    templateArchetype: "parallel-plate-ion-acceleration-speed",
    scenarioKind: "parallel-plates-particle",
    ibSubtopicOverride: "ib-d3-motion-em-fields",
    defaultMcqCount: 13,
    defaultStructuredCount: 8,
    description:
      "Non-relativistic exit speed v = sqrt(2qV/m) and kinetic energy gain of ions accelerated across parallel plates",
  },
  {
    index: 9,
    conceptId: "electric-potential-equipotentials",
    templateArchetype: "collinear-charges-scalar-electric-potential",
    scenarioKind: "collinear-charges",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
    description:
      "Signed scalar electric potential V = k(q1/r1 + q2/r2) contrasted with vector field superposition",
  },
  {
    index: 10,
    conceptId: "electric-potential-equipotentials",
    templateArchetype: "dipole-zero-potential-nonzero-field",
    scenarioKind: "collinear-charges",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
    description:
      "Non-zero resultant electric field at the zero-potential locus between opposite-sign point charges",
  },
  {
    index: 11,
    conceptId: "electric-potential-equipotentials",
    templateArchetype: "like-charges-null-field-nonzero-potential",
    scenarioKind: "null-potential",
    defaultMcqCount: 13,
    defaultStructuredCount: 8,
    description:
      "Strictly positive electric potential at the interior zero-field point between two positive charges",
  },
  {
    index: 12,
    conceptId: "electric-potential-equipotentials",
    templateArchetype: "probe-potential-field-and-force-synthesis",
    scenarioKind: "negative-probe",
    defaultMcqCount: 13,
    defaultStructuredCount: 8,
    description:
      "Combined electric field, scalar electric potential, and electrostatic force on a test charge near collinear sources",
  },
  {
    index: 13,
    conceptId: "electric-potential-equipotentials",
    templateArchetype: "equipotential-lines-work-and-potential-energy",
    scenarioKind: "field-work",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
    description:
      "Signed field work W = q(V_i - V_f) and potential energy change dEp = q(V_f - V_i) across parallel equipotentials",
  },
  {
    index: 14,
    conceptId: "electric-potential-equipotentials",
    templateArchetype: "equipotential-gradient-guided-particle-kinematics",
    scenarioKind: "guided-bead",
    defaultMcqCount: 13,
    defaultStructuredCount: 8,
    description:
      "Potential gradient E = -dV/dx, electrostatic acceleration qE/m (Millikan/bead scale), and speed across equipotentials",
  },
  {
    index: 15,
    conceptId: "electric-potential-equipotentials",
    templateArchetype: "coulomb-nuclear-potential-barrier",
    scenarioKind: "nuclear-potential",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
    description:
      "Radial electric potential and Coulomb potential-energy barrier (in J and eV) at nuclear closest approach",
  },
] as const;

const SUPERSCRIPTS: Readonly<Record<string, string>> = {
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

function toSuperscript(expStr: string): string {
  return [...expStr].map((ch) => SUPERSCRIPTS[ch] ?? ch).join("");
}

function roundClean(val: number, digits = 8): number {
  if (Object.is(val, -0) || Math.abs(val) < 1e-24) {
    return 0;
  }
  return Number(val.toPrecision(digits));
}

/**
 * Formats a physical scalar to 3 significant figures using exam-standard Unicode
 * scientific notation for magnitudes < 0.01 or >= 1000.
 */
export function formatPhysics3sf(value: number, unit = ""): string {
  const suffix = unit ? ` ${unit}` : "";
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot format non-finite physics value: ${String(value)}`);
  }
  if (Math.abs(value) < 1e-15) {
    return `0${suffix}`;
  }
  const abs = Math.abs(value);
  const signPrefix = value < 0 ? "−" : "";
  if (abs >= 0.01 && abs < 1000) {
    const plain = abs.toPrecision(3);
    if (!plain.includes("e")) {
      return `${signPrefix}${plain}${suffix}`;
    }
  }
  const expForm = abs.toExponential(2);
  const [mantissa, rawExp] = expForm.split("e");
  const cleanExp = String(Number.parseInt(rawExp, 10));
  return `${signPrefix}${mantissa} × 10${toSuperscript(cleanExp)}${suffix}`;
}

function formatGivenPlain(value: number, unit = ""): string {
  const suffix = unit ? ` ${unit}` : "";
  if (Math.abs(value) < 1e-15) {
    return `0${suffix}`;
  }
  const abs = Math.abs(value);
  const signPrefix = value < 0 ? "−" : "";
  if (abs >= 0.001 && abs < 10_000) {
    return `${signPrefix}${String(Number(abs.toPrecision(6)))}${suffix}`;
  }
  const expForm = abs.toExponential();
  const [mantissa, rawExp] = expForm.split("e");
  const cleanMantissa = Number(Number(mantissa).toPrecision(4)).toString();
  const cleanExp = String(Number.parseInt(rawExp, 10));
  return `${signPrefix}${cleanMantissa} × 10${toSuperscript(cleanExp)}${suffix}`;
}

function formatSignedChargeNC(qNC: number): string {
  const absStr = String(Number(Math.abs(qNC).toPrecision(6)));
  return qNC >= 0 ? `+${absStr} nC` : `−${absStr} nC`;
}

function pickCycle<T>(pool: readonly T[], index: number): T {
  return pool[((index % pool.length) + pool.length) % pool.length];
}

function chooseDifficulty(variantIndex: number): QuestionDifficulty {
  const mod = variantIndex % 10;
  if (mod === 0 || mod === 4) {
    return "foundation";
  }
  if (mod === 2 || mod === 6 || mod === 9) {
    return "higher";
  }
  return "standard";
}

/**
 * Derives 3-syllabus tags strictly from `getCompatibleSyllabiForConcept`,
 * respecting IB SL/HL vs HL-only (`electric-potential-equipotentials`),
 * UK A-Level `Y13`, and NCUK `IFY-S2` boundaries.
 */
export function buildFieldsSyllabusTags(
  spec: FieldsArchetypeSpec,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): SyllabusTag[] {
  const mappings = getCompatibleSyllabiForConcept(spec.conceptId, {
    format,
    excludeOptionTopics: true,
  });

  const tags: SyllabusTag[] = [];
  for (const mapping of mappings) {
    const topicId = mapping.topicIds[0];
    if (!topicId) continue;

    if (mapping.syllabus === "ib") {
      const ibLevel =
        mapping.levels.includes("SL") &&
        (difficulty !== "higher" || variantIndex % 2 === 0)
          ? "SL"
          : mapping.levels[mapping.levels.length - 1];
      const subtopicId =
        spec.ibSubtopicOverride &&
        mapping.subtopicIds.includes(spec.ibSubtopicOverride)
          ? spec.ibSubtopicOverride
          : mapping.subtopicIds[0];
      tags.push({
        syllabus: "ib",
        level: ibLevel,
        topicId,
        ...(subtopicId ? { subtopicId } : {}),
      });
    } else if (mapping.syllabus === "alevel") {
      const level = mapping.levels.includes("Y13")
        ? "Y13"
        : mapping.levels[0];
      tags.push({
        syllabus: "alevel",
        level,
        topicId,
        ...(mapping.subtopicIds[0] ? { subtopicId: mapping.subtopicIds[0] } : {}),
      });
    } else if (mapping.syllabus === "ncuk") {
      const level = mapping.levels.includes("IFY-S2")
        ? "IFY-S2"
        : mapping.levels[0];
      tags.push({
        syllabus: "ncuk",
        level,
        topicId,
        ...(mapping.subtopicIds[0] ? { subtopicId: mapping.subtopicIds[0] } : {}),
      });
    }
  }
  return tags;
}

interface RawDistractorCandidate {
  readonly text: string;
  readonly rationale: string;
  readonly numericApprox?: number;
}

function finalizeMcqOptions(params: {
  readonly correctText: string;
  readonly correctNumeric: number;
  readonly isDirectional: boolean;
  readonly candidates: readonly RawDistractorCandidate[];
  readonly fallbackUnit: string;
  readonly fallbackDirection?: "right" | "left";
  readonly rotationSeed: number;
}): { options: McqOptionItem[]; correctLetter: "A" | "B" | "C" | "D" } {
  const {
    correctText,
    correctNumeric,
    isDirectional,
    candidates,
    fallbackUnit,
    fallbackDirection,
    rotationSeed,
  } = params;

  const usedEquivKeys = new Set<string>([buildOptionEquivalenceKey(correctText)]);
  const usedRawTexts = new Set<string>([
    correctText.trim().toLowerCase().replace(/\s+/g, " "),
  ]);

  const selectedDistractors: Array<{ text: string; rationale: string }> = [];

  for (const cand of candidates) {
    if (selectedDistractors.length >= 3) break;
    const normRaw = cand.text.trim().toLowerCase().replace(/\s+/g, " ");
    const eqKey = buildOptionEquivalenceKey(cand.text);
    if (usedRawTexts.has(normRaw) || usedEquivKeys.has(eqKey)) {
      continue;
    }
    if (!isDirectional && cand.numericApprox !== undefined) {
      const denom = Math.max(Math.abs(correctNumeric), 1e-12);
      if (Math.abs(cand.numericApprox - correctNumeric) / denom < 0.025) {
        continue;
      }
    }
    usedRawTexts.add(normRaw);
    usedEquivKeys.add(eqKey);
    selectedDistractors.push({
      text: cand.text,
      rationale: cand.rationale,
    });
  }

  const backupMultipliers: ReadonlyArray<{ factor: number; reason: string }> = [
    {
      factor: 0.5,
      reason:
        "Introduces an erroneous factor of 1/2 from confusing electrostatic field/potential relations with quadratic energy formulas.",
    },
    {
      factor: 2.0,
      reason:
        "Doubles the result by applying a factor of 2 from symmetric two-source or kinetic-energy algebra.",
    },
    {
      factor: 0.25,
      reason:
        "Divides by 4 after doubling the effective separation inside an inverse-square expression.",
    },
    {
      factor: 4.0,
      reason:
        "Multiplies by 4 after halving the effective distance inside an inverse-square expression.",
    },
    {
      factor: 10.0,
      reason:
        "Makes a power-of-ten SI prefix conversion slip when substituting into the field equation.",
    },
  ];

  for (const backup of backupMultipliers) {
    if (selectedDistractors.length >= 3) break;
    const baseVal =
      Math.abs(correctNumeric) < 1e-12
        ? 150 * backup.factor
        : (isDirectional ? Math.abs(correctNumeric) : correctNumeric) *
          backup.factor;
    const dirSuffix =
      isDirectional && fallbackDirection
        ? ` to the ${fallbackDirection}`
        : "";
    const text = `${formatPhysics3sf(baseVal, fallbackUnit)}${dirSuffix}`;
    const normRaw = text.trim().toLowerCase().replace(/\s+/g, " ");
    const eqKey = buildOptionEquivalenceKey(text);
    if (usedRawTexts.has(normRaw) || usedEquivKeys.has(eqKey)) continue;
    usedRawTexts.add(normRaw);
    usedEquivKeys.add(eqKey);
    selectedDistractors.push({ text, rationale: backup.reason });
  }

  const targetCorrectIdx = (Math.imul(rotationSeed, 0x9e3779b1) >>> 30) & 3;
  const rawSlots: Array<{
    text: string;
    isCorrect: boolean;
    distractorRationale?: string;
  }> = selectedDistractors.map((d) => ({
    text: d.text,
    isCorrect: false,
    distractorRationale: d.rationale,
  }));
  rawSlots.splice(targetCorrectIdx, 0, {
    text: correctText,
    isCorrect: true,
  });

  const options: McqOptionItem[] = rawSlots.map((slot, idx) => ({
    label: MCQ_OPTION_LABELS[idx],
    text: slot.text,
    isCorrect: slot.isCorrect,
    ...(slot.distractorRationale
      ? { distractorRationale: slot.distractorRationale }
      : {}),
  }));

  return {
    options,
    correctLetter: MCQ_OPTION_LABELS[targetCorrectIdx],
  };
}

// ============================================================================
// DIVERSE LABORATORY & ENGINEERING PROSE POOLS
// ============================================================================

const POINT_CHARGE_CONTEXTS: readonly string[] = [
  "Inside an ultra-high-vacuum electrostatic calibration chamber",
  "Along the optical axis of a benchtop ion-trap demonstration rig",
  "On an insulated fused-quartz metrology rail in vacuum",
  "Within a shielded Faraday enclosure used for sensor testing",
  "Along a straight dielectric mounting rod inside an evacuated bell jar",
  "In a dry-nitrogen micro-electrostatics apparatus",
  "Across the test region of a high-impedance electrometer bench",
  "Inside a cryogenic linear Paul-trap alignment fixture",
  "Along the central axis of a precision Coulomb torsion module",
  "Within an evacuated spacecraft charge-control test cell",
  "On a sapphire isolation substrate inside a cleanroom vacuum stage",
  "Along the reference baseline of an electrostatic beam-steering rig",
  "Inside a university physics Van de Graaff calibration tunnel",
  "Along a horizontal ceramic support rod in free space",
  "Within a dust-plasma levitation chamber evacuated to low pressure",
  "Across the measurement track of a non-contact Kelvin probe bench",
  "Inside an electrostatic aerosol-charging test section",
  "Along the symmetry line of a miniature ion-optics bench",
  "Within a laboratory quadrupole pre-alignment vacuum housing",
  "On a low-permittivity PTFE fixture inside an evacuated chamber",
  "Along the primary axis of a precision field-mill calibration bench",
];

const K_CONSTANT_CLAUSES: readonly string[] = [
  "Take the Coulomb constant as k = 8.99 × 10⁹ N m² C⁻².",
  "Use 1/(4πε₀) = 8.99 × 10⁹ N m² C⁻² throughout.",
  "Assume vacuum permittivity such that k = 8.99 × 10⁹ N m² C⁻².",
  "Treat both sources as point charges in vacuum with k = 8.99 × 10⁹ N m² C⁻².",
  "Use k = 8.99 × 10⁹ N m² C⁻² for free-space electrostatic interactions.",
  "Adopt the free-space constant k = 8.99 × 10⁹ N m² C⁻².",
  "Model the region as vacuum with Coulomb constant k = 8.99 × 10⁹ N m² C⁻².",
];

const POTENTIAL_ZERO_CLAUSES: readonly string[] = [
  "Take k = 8.99 × 10⁹ N m² C⁻² and define electric potential to be zero at infinity.",
  "Use 1/(4πε₀) = 8.99 × 10⁹ N m² C⁻² with the reference of zero potential at infinite separation.",
  "Assume vacuum (k = 8.99 × 10⁹ N m² C⁻²) and reference all scalar potentials to zero at infinity.",
  "Model the charges in free space (k = 8.99 × 10⁹ N m² C⁻²), taking V = 0 at infinity.",
  "Adopt k = 8.99 × 10⁹ N m² C⁻² and zero electrostatic potential at infinite distance.",
  "With zero potential set at infinity in vacuum, use k = 8.99 × 10⁹ N m² C⁻².",
];

const PARALLEL_PLATE_CONTEXTS: readonly string[] = [
  "In a time-of-flight mass spectrometer extraction stage",
  "Inside a cathode-ray oscilloscope vertical deflection assembly",
  "Across the parallel accelerating gap of a semiconductor ion implanter",
  "Between the flat brass electrodes of a Millikan electrostatic cell",
  "Inside an electrostatic ink-droplet test nozzle in vacuum",
  "Across a parallel-plate electron-beam calibration diode",
  "Within a medical linear-accelerator pre-injector gap",
  "Between two planar molybdenum grids of an ion-thruster prototype",
  "Inside a vacuum micro-machined capacitive sensor gap",
  "Across the uniform-field region of a parallel-plate guard-ring cell",
  "Within a laboratory positron-moderation extraction stage",
  "Between polished aluminium plates in an evacuated deflection tube",
  "Inside a high-voltage electrostatic precipitator test cell",
  "Across the planar extraction electrodes of a surface-analysis gun",
  "Within a cleanroom charged-microparticle levitation cell",
  "Between parallel titanium electrodes inside a beam-diagnostics chamber",
  "In an evacuated parallel-plate velocity-calibration gap",
  "Across the planar anode–cathode spacing of a vacuum photo-tube",
  "Within a compact proton-source extraction gap",
  "Between precision-spaced invar plates in a metrology vacuum tank",
  "Inside an electrostatic dust-accelerator launch stage",
];

const EQUIPOTENTIAL_CONTEXTS: readonly string[] = [
  "An electrostatic field plotter maps three parallel vertical equipotential surfaces",
  "Inside a uniform-field drift chamber, three equally spaced planar equipotential lines are recorded",
  "Within an evacuated deflection cell, three parallel equipotential planes are maintained",
  "A cross-sectional potential map of a planar electrode channel shows three parallel equipotentials",
  "Across the central region of a wide guard-ring capacitor, three vertical equipotential lines are drawn",
  "In a microfluidic electrophoresis test cell (modelled in vacuum), three planar equipotentials are established",
  "Inside a parallel-grid ion-retarding analyzer, three adjacent equipotential surfaces are charted",
  "A Kelvin-probe scan across a uniform electrostatic region identifies three parallel equipotential lines",
  "Between wide planar electrodes in a vacuum tank, three parallel equipotential contours are marked",
  "Within an electrostatic lens drift space, three parallel vertical equipotential planes are observed",
  "Along a precision dielectric guide rail, three uniform-field equipotential lines are spaced evenly",
];

const NUCLEAR_CONTEXTS: readonly string[] = [
  "In a head-on Rutherford backscattering experiment",
  "During a nuclear physics beamline scattering run",
  "In a low-energy Coulomb-barrier calibration experiment",
  "Within an evacuated target chamber at a tandem accelerator",
  "Modelling a head-on nuclear collision below the fusion threshold",
  "In a Geiger–Marsden alpha-scattering recoil analysis",
  "Across a heavy-ion electrostatic stopping-distance calculation",
  "During a central elastic nuclear encounter in vacuum",
  "In an undergraduate nuclear scattering simulation",
  "Analysing classical electrostatic turnaround near a stationary target nucleus",
  "Within a thin-foil ion-beam scattering chamber",
];

// ============================================================================
// ARCHETYPE ITEM BUILDERS (1..16)
// ============================================================================

function buildCollinearOppositeInteriorItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  const paramTable: ReadonlyArray<[number, number, number, number]> = [
    [3, -6, 0.6, 0.2],
    [-4, 8, 0.8, 0.2],
    [5, -4, 0.5, 0.2],
    [-6, 3, 0.6, 0.3],
    [2, -9, 0.5, 0.2],
    [-8, 5, 0.7, 0.3],
    [4, -12, 0.8, 0.3],
    [-3, 12, 0.9, 0.3],
    [6, -6, 0.4, 0.1],
    [-5, 10, 0.6, 0.2],
    [8, -4, 0.6, 0.4],
    [-9, 4, 0.5, 0.3],
    [7, -5, 0.6, 0.25],
    [-2, 6, 0.4, 0.15],
    [9, -3, 0.8, 0.5],
    [-10, 5, 0.75, 0.25],
    [3.5, -7, 0.7, 0.2],
    [-4.5, 9, 0.9, 0.4],
    [6, -15, 0.9, 0.3],
    [-12, 6, 1.0, 0.4],
    [2.5, -5, 0.5, 0.2],
  ];
  const [q1, q2, sep, probe] = pickCycle(paramTable, variantIdx);
  const scenarioSpec = {
    kind: "charge-field",
    chargesNC: [q1, q2],
    separationM: sep,
    probeM: probe,
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const fieldNC = Number(solved.quantities.fieldNC);
  const dirWord: "right" | "left" = fieldNC >= 0 ? "right" : "left";
  const oppDir: "right" | "left" = dirWord === "right" ? "left" : "right";

  const r1 = probe;
  const r2 = roundClean(sep - probe);
  const e1Mag = (COULOMB_CONSTANT * Math.abs(q1) * 1e-9) / r1 ** 2;
  const e2Mag = (COULOMB_CONSTANT * Math.abs(q2) * 1e-9) / r2 ** 2;
  const diffMag = Math.max(Math.abs(e1Mag - e2Mag), 0.15 * Math.abs(fieldNC));
  const invLinearMistake =
    COULOMB_CONSTANT * ((Math.abs(q1) * 1e-9) / r1 + (Math.abs(q2) * 1e-9) / r2);

  const difficulty = chooseDifficulty(variantIdx);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);

  const ctx = pickCycle(POINT_CHARGE_CONTEXTS, variantIdx);
  const kClause = pickCycle(K_CONSTANT_CLAUSES, variantIdx * 3 + 1);
  const geometryVariants: readonly string[] = [
    `two fixed point charges of ${formatSignedChargeNC(q1)} (left) and ${formatSignedChargeNC(q2)} (right) are held ${sep} m apart. Point P lies on the straight line joining them at a distance of ${probe} m to the right of the ${formatSignedChargeNC(q1)} charge.`,
    `a point charge of ${formatSignedChargeNC(q1)} is fixed at x = 0 and a second point charge of ${formatSignedChargeNC(q2)} is fixed at x = ${sep} m. A field sensor is placed at point P on the axis at x = ${probe} m.`,
    `charges ${formatSignedChargeNC(q1)} and ${formatSignedChargeNC(q2)} are separated horizontally by ${sep} m, with ${formatSignedChargeNC(q1)} on the left. Observation point P is situated between them, ${probe} m from the left-hand source.`,
    `fixed sources carrying ${formatSignedChargeNC(q1)} (on the left) and ${formatSignedChargeNC(q2)} (on the right) have a centre-to-centre separation of ${sep} m. Point P is marked ${probe} m from the ${formatSignedChargeNC(q1)} source along the connecting line.`,
    `an axial probe point P sits ${probe} m from a left-hand ${formatSignedChargeNC(q1)} point charge along the ${sep} m segment connecting it to a right-hand ${formatSignedChargeNC(q2)} point charge.`,
  ];
  const geom = pickCycle(geometryVariants, variantIdx * 2);

  if (format === "mcq") {
    const askPool: readonly string[] = [
      "What is the resultant electric field strength and direction at P?",
      "Determine the magnitude and direction of the net electric field at point P.",
      "Which row gives the magnitude and direction of the electric field vector at P?",
      "Find the resultant electric field vector acting at point P.",
    ];
    const stem = `${ctx}, ${geom} ${kClause} ${pickCycle(askPool, variantIdx)}`;
    const correctText = `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${dirWord}`;

    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: Math.abs(fieldNC),
      isDirectional: true,
      fallbackUnit: "N C⁻¹",
      fallbackDirection: dirWord,
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: `${formatPhysics3sf(diffMag, "N C⁻¹")} to the ${dirWord}`,
          rationale:
            "Subtracts the two individual field magnitudes instead of adding collinear vectors that point in the same direction between opposite charges.",
        },
        {
          text: `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${oppDir}`,
          rationale:
            "Computes the correct superposition magnitude but reverses the electric field direction (forgetting field direction is defined on a positive test charge).",
        },
        {
          text: `${formatPhysics3sf(invLinearMistake, "N C⁻¹")} to the ${dirWord}`,
          rationale:
            "Uses inverse-distance k|q|/r scaling instead of the inverse-square law k|q|/r².",
        },
        {
          text: `${formatPhysics3sf(diffMag, "N C⁻¹")} to the ${oppDir}`,
          rationale:
            "Both subtracts the collinear field magnitudes and reverses the resultant vector sense.",
        },
      ],
    });

    const questionPlan: CandidateQuestionPlan = {
      targetSummary:
        "Evaluate resultant collinear electric field magnitude and direction between opposite-sign point charges",
      distractorStrategy: [
        "subtracting-collinear-same-sense-components",
        "reversing-positive-test-charge-field-sense",
        "substituting-inverse-linear-potential-power",
      ],
    };

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: ["fieldNC"],
      questionPlan,
      targetQuantityKey: "fieldNC",
      stem,
      options,
      workedSolution: `At P, both opposite-sign sources drive a positive test charge to the ${dirWord}. |E₁| = k|q₁|/r₁² = ${formatPhysics3sf(e1Mag, "N C⁻¹")} and |E₂| = k|q₂|/r₂² = ${formatPhysics3sf(e2Mag, "N C⁻¹")} (with r₂ = ${r2} m). Summing the two same-sense vectors gives E = ${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${dirWord} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Adds same-direction inverse-square contributions to obtain ${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${dirWord} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const stem = `${ctx}, ${geom} ${kClause}`;
  const qualAnswer =
    dirWord === "right"
      ? "Both individual electric field vectors at P point to the right (away from the positive left source and toward the negative right source), so they reinforce toward the right."
      : "Both individual electric field vectors at P point to the left (toward the negative left source and away from the positive right source), so they reinforce toward the left.";
  const quantAns = `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${dirWord}`;

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "State and explain why the two individual electric field contributions reinforce rather than oppose each other at point P.",
      marks: 1,
      targetMode: "qualitative",
      expectedAnswer: qualAnswer,
      workingSteps: [
        "Electric field direction is the force direction on a positive test charge.",
        qualAnswer,
      ],
    },
    {
      partId: "b",
      prompt:
        "Calculate the magnitude and state the direction of the resultant electric field at point P.",
      marks: 3,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "fieldNC",
      expectedAnswer: quantAns,
      workingSteps: [
        `r₁ = ${r1} m and r₂ = ${sep} − ${r1} = ${r2} m.`,
        `|E₁| = k|q₁|/r₁² = ${formatPhysics3sf(e1Mag, "N C⁻¹")}; |E₂| = k|q₂|/r₂² = ${formatPhysics3sf(e2Mag, "N C⁻¹")}.`,
        `Resultant E = |E₁| + |E₂| = ${quantAns}.`,
      ],
    },
  ];

  const markScheme: MarkSchemePoint[] = [
    {
      code: "B1",
      partId: "a",
      criterion:
        "Explains using a positive test charge that both source fields at P act in the same direction.",
      marks: 1,
    },
    {
      code: "M1",
      partId: "b",
      criterion: `Applies E = k|q|/r² with r₁ = ${r1} m and r₂ = ${r2} m.`,
      marks: 1,
    },
    {
      code: "M1",
      partId: "b",
      criterion: "Adds the two collinear field magnitudes.",
      marks: 1,
    },
    {
      code: "A1",
      partId: "b",
      criterion: `Obtains ${quantAns}.`,
      marks: 1,
    },
  ];

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: ["fieldNC"],
    questionPlan: {
      targetSummary:
        "Justify vector reinforcement between opposite charges and compute resultant electric field at P",
      subpartStrategy: [
        "qualitative justification of collinear vector reinforcement",
        "inverse-square superposition calculation of fieldNC",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) ${qualAnswer} (b) With r₁ = ${r1} m and r₂ = ${r2} m, |E₁| = ${formatPhysics3sf(e1Mag, "N C⁻¹")} and |E₂| = ${formatPhysics3sf(e2Mag, "N C⁻¹")}. Summing gives ${quantAns}.`,
    markScheme,
    totalMarks: 4,
    generatorModel,
  };
}

function buildCollinearLikeSuperpositionItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  const paramTable: ReadonlyArray<[number, number, number, number]> = [
    [4, 9, 0.6, 0.3],
    [8, 2, 0.5, 0.2],
    [-6, -3, 0.6, 0.2],
    [5, 12, 0.8, 0.5],
    [-4, -10, 0.7, 0.4],
    [9, 3, 0.6, 0.2],
    [3, 12, 0.5, 0.3],
    [-8, -4, 0.8, 0.3],
    [6, 2, 0.4, 0.15],
    [2, 10, 0.6, 0.4],
    [-5, -15, 0.9, 0.6],
    [7, 3, 0.7, 0.3],
    [4, 16, 0.8, 0.5],
    [-9, -2, 0.5, 0.2],
    [10, 4, 0.9, 0.3],
    [3, 8, 0.6, 0.4],
    [-12, -3, 0.75, 0.25],
    [6, 14, 1.0, 0.6],
    [5, 2, 0.5, 0.2],
    [-7, -14, 0.8, 0.5],
    [12, 5, 0.8, 0.3],
  ];
  const [q1, q2, sep, probe] = pickCycle(paramTable, variantIdx);
  const scenarioSpec = {
    kind: "charge-field",
    chargesNC: [q1, q2],
    separationM: sep,
    probeM: probe,
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const fieldNC = Number(solved.quantities.fieldNC);
  const dirWord: "right" | "left" = fieldNC >= 0 ? "right" : "left";
  const oppDir: "right" | "left" = dirWord === "right" ? "left" : "right";

  const r1 = probe;
  const r2 = roundClean(sep - probe);
  const e1Mag = (COULOMB_CONSTANT * Math.abs(q1) * 1e-9) / r1 ** 2;
  const e2Mag = (COULOMB_CONSTANT * Math.abs(q2) * 1e-9) / r2 ** 2;
  const sumMag = e1Mag + e2Mag;
  const fullSepMistake =
    (COULOMB_CONSTANT * Math.abs(Math.abs(q1) - Math.abs(q2)) * 1e-9) / sep ** 2;

  const difficulty = chooseDifficulty(variantIdx);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);

  const ctx = pickCycle(POINT_CHARGE_CONTEXTS, variantIdx + 5);
  const kClause = pickCycle(K_CONSTANT_CLAUSES, variantIdx * 5 + 2);
  const geomPool: readonly string[] = [
    `two like-sign point charges of ${formatSignedChargeNC(q1)} and ${formatSignedChargeNC(q2)} are fixed ${sep} m apart, with ${formatSignedChargeNC(q1)} on the left. Point P lies on the connecting axis ${probe} m from the left charge.`,
    `fixed point charges ${formatSignedChargeNC(q1)} (at x = 0) and ${formatSignedChargeNC(q2)} (at x = ${sep} m) occupy a straight insulating rail. Point P is situated at x = ${probe} m.`,
    `a left-hand source of ${formatSignedChargeNC(q1)} and a right-hand source of ${formatSignedChargeNC(q2)} are separated by ${sep} m. An axial test point P is located ${probe} m to the right of ${formatSignedChargeNC(q1)}.`,
    `collinear charges ${formatSignedChargeNC(q1)} (left) and ${formatSignedChargeNC(q2)} (right) are held at a separation of ${sep} m, while point P is marked ${probe} m from the ${formatSignedChargeNC(q1)} charge.`,
    `along a ${sep} m baseline between fixed charges ${formatSignedChargeNC(q1)} on the left and ${formatSignedChargeNC(q2)} on the right, point P lies ${probe} m from the left source.`,
  ];
  const geom = pickCycle(geomPool, variantIdx * 3 + 1);

  if (format === "mcq") {
    const qAsk: readonly string[] = [
      "What is the resultant electric field at point P?",
      "Calculate the magnitude and direction of the resultant electric field at P.",
      "Which option states the net electric field vector at P?",
      "Determine the resultant electric field strength and sense at P.",
    ];
    const stem = `${ctx}, ${geom} ${kClause} ${pickCycle(qAsk, variantIdx + 1)}`;
    const correctText = `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${dirWord}`;

    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: Math.abs(fieldNC),
      isDirectional: true,
      fallbackUnit: "N C⁻¹",
      fallbackDirection: dirWord,
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: `${formatPhysics3sf(sumMag, "N C⁻¹")} to the ${dirWord}`,
          rationale:
            "Adds the two field magnitudes instead of subtracting opposing electric field vectors between like-sign charges.",
        },
        {
          text: `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${oppDir}`,
          rationale:
            "Finds the correct vector difference magnitude but assigns the direction of the weaker field contribution.",
        },
        {
          text: `${formatPhysics3sf(sumMag, "N C⁻¹")} to the ${oppDir}`,
          rationale:
            "Adds the opposing field magnitudes and reverses the net field direction.",
        },
        {
          text: `${formatPhysics3sf(Math.max(fullSepMistake, 12), "N C⁻¹")} to the ${dirWord}`,
          rationale:
            "Substitutes the full separation between the sources instead of the individual distances from P.",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: ["fieldNC"],
      questionPlan: {
        targetSummary:
          "Determine net electric field vector by subtracting opposing contributions between like-sign collinear charges",
        distractorStrategy: [
          "adding-opposing-field-magnitudes",
          "reversing-dominant-charge-direction",
          "using-source-separation-instead-of-probe-distances",
        ],
      },
      targetQuantityKey: "fieldNC",
      stem,
      options,
      workedSolution: `Between like-sign charges, the individual fields at P oppose each other: |E₁| = k|q₁|/(${r1})² = ${formatPhysics3sf(e1Mag, "N C⁻¹")} and |E₂| = k|q₂|/(${r2})² = ${formatPhysics3sf(e2Mag, "N C⁻¹")}. Subtracting gives |E_net| = ${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} directed to the ${dirWord} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Subtracts opposing inverse-square field contributions to obtain ${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${dirWord} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const stem = `${ctx}, ${geom} ${kClause}`;
  const signWord = q1 > 0 ? "positive" : "negative";
  const qualExplanation =
    q1 > 0
      ? "Both positive sources repel a positive test charge placed at P, so the left charge pushes rightward while the right charge pushes leftward."
      : "Both negative sources attract a positive test charge placed at P, so the left charge pulls leftward while the right charge pulls rightward.";
  const quantAns = `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${dirWord}`;

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: ["fieldNC"],
    questionPlan: {
      targetSummary:
        "Explain field opposition between like-sign charges and compute net vector field at P",
      subpartStrategy: [
        "conceptual explanation of opposing field vectors between like charges",
        "quantitative subtraction of inverse-square field magnitudes",
      ],
    },
    stem,
    parts: [
      {
        partId: "a",
        prompt: `Explain why the electric fields produced by the two ${signWord} charges oppose each other at point P.`,
        marks: 1,
        targetMode: "qualitative",
        expectedAnswer: qualExplanation,
        workingSteps: [qualExplanation],
      },
      {
        partId: "b",
        prompt:
          "Calculate the magnitude and state the direction of the resultant electric field at point P.",
        marks: 3,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "fieldNC",
        expectedAnswer: quantAns,
        workingSteps: [
          `r₁ = ${r1} m, r₂ = ${sep} − ${r1} = ${r2} m.`,
          `|E₁| = ${formatPhysics3sf(e1Mag, "N C⁻¹")} and |E₂| = ${formatPhysics3sf(e2Mag, "N C⁻¹")}.`,
          `Net field E = ${quantAns}.`,
        ],
      },
    ],
    workedSolution: `(a) ${qualExplanation} (b) |E₁| = k|q₁|/(${r1})² = ${formatPhysics3sf(e1Mag, "N C⁻¹")} and |E₂| = k|q₂|/(${r2})² = ${formatPhysics3sf(e2Mag, "N C⁻¹")}. Subtracting the opposing vectors yields ${quantAns}.`,
    markScheme: [
      {
        code: "B1",
        partId: "a",
        criterion:
          "States that a positive test charge between like-sign sources experiences opposite forces from the left and right charges.",
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Evaluates E = k|q|/r² at r₁ = ${r1} m and r₂ = ${r2} m.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Subtracts the two opposing field magnitudes.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${quantAns}.`,
        marks: 1,
      },
    ],
    totalMarks: 4,
    generatorModel,
  };
}

function buildCollinearExteriorPointFieldItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  const paramTable: ReadonlyArray<[number, number, number, number]> = [
    [12, -3, 0.3, 0.5],
    [-9, 4, 0.4, 0.6],
    [8, -5, 0.4, 0.6],
    [6, 4, 0.3, 0.6],
    [-10, 2, 0.5, 0.7],
    [15, -4, 0.5, 0.8],
    [-6, -3, 0.4, 0.7],
    [9, -2, 0.3, 0.6],
    [-12, 5, 0.4, 0.7],
    [4, 6, 0.5, 0.8],
    [10, -6, 0.4, 0.8],
    [-8, 3, 0.3, 0.5],
    [14, -5, 0.6, 0.9],
    [-15, 4, 0.5, 0.75],
    [5, 8, 0.4, 0.8],
    [16, -3, 0.5, 0.75],
    [-9, -5, 0.3, 0.6],
    [12, -4, 0.4, 0.8],
    [-14, 3, 0.6, 0.9],
    [7, 5, 0.35, 0.7],
    [18, -5, 0.6, 1.0],
  ];
  const [q1, q2, sep, probe] = pickCycle(paramTable, variantIdx);
  const scenarioSpec = {
    kind: "charge-field",
    chargesNC: [q1, q2],
    separationM: sep,
    probeM: probe,
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const fieldNC = Number(solved.quantities.fieldNC);
  const dirWord: "right" | "left" = fieldNC >= 0 ? "right" : "left";
  const oppDir: "right" | "left" = dirWord === "right" ? "left" : "right";

  const r1 = probe;
  const r2 = roundClean(probe - sep);
  const e1Mag = (COULOMB_CONSTANT * Math.abs(q1) * 1e-9) / r1 ** 2;
  const e2Mag = (COULOMB_CONSTANT * Math.abs(q2) * 1e-9) / r2 ** 2;
  const wrongSignComb = q1 * q2 < 0 ? e1Mag + e2Mag : Math.abs(e1Mag - e2Mag);
  const wrongR1Field = Math.abs(
    (COULOMB_CONSTANT * q1 * 1e-9) / sep ** 2 +
      (COULOMB_CONSTANT * q2 * 1e-9) / r2 ** 2,
  );

  const difficulty = chooseDifficulty(variantIdx + 1);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);

  const ctx = pickCycle(POINT_CHARGE_CONTEXTS, variantIdx + 9);
  const kClause = pickCycle(K_CONSTANT_CLAUSES, variantIdx * 2 + 3);
  const geomPool: readonly string[] = [
    `a point charge ${formatSignedChargeNC(q1)} is fixed at x = 0 and a second point charge ${formatSignedChargeNC(q2)} is fixed at x = ${sep} m. Exterior point P lies further to the right along the positive x-axis at x = ${probe} m (so P is ${r2} m to the right of ${formatSignedChargeNC(q2)}).`,
    `two collinear point charges of ${formatSignedChargeNC(q1)} (left) and ${formatSignedChargeNC(q2)} (right) are separated by ${sep} m. Point P lies outside the pair to the right of both charges, at a total distance of ${probe} m from the left-hand ${formatSignedChargeNC(q1)} charge.`,
    `charges ${formatSignedChargeNC(q1)} and ${formatSignedChargeNC(q2)} are mounted ${sep} m apart along a horizontal line, with ${formatSignedChargeNC(q1)} on the left. An axial sensor at exterior point P sits ${probe} m to the right of ${formatSignedChargeNC(q1)}.`,
    `fixed sources ${formatSignedChargeNC(q1)} (left) and ${formatSignedChargeNC(q2)} (right) have separation ${sep} m. Observation point P is positioned on the extended axis beyond the right-hand charge, ${probe} m from ${formatSignedChargeNC(q1)}.`,
  ];
  const geom = pickCycle(geomPool, variantIdx);

  if (format === "mcq") {
    const stem = `${ctx}, ${geom} ${kClause} What is the resultant electric field at exterior point P?`;
    const correctText = `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${dirWord}`;
    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: Math.abs(fieldNC),
      isDirectional: true,
      fallbackUnit: "N C⁻¹",
      fallbackDirection: dirWord,
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: `${formatPhysics3sf(wrongSignComb, "N C⁻¹")} to the ${dirWord}`,
          rationale:
            q1 * q2 < 0
              ? "Adds the exterior field magnitudes instead of subtracting opposing vectors outside opposite-sign charges."
              : "Subtracts the exterior field magnitudes instead of adding same-sense vectors outside like-sign charges.",
        },
        {
          text: `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${oppDir}`,
          rationale:
            "Evaluates the correct exterior superposition magnitude but reverses the resultant vector direction.",
        },
        {
          text: `${formatPhysics3sf(wrongR1Field, "N C⁻¹")} to the ${dirWord}`,
          rationale:
            "Uses the inter-charge separation instead of the full distance from the left-hand charge to exterior point P.",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: ["fieldNC"],
      questionPlan: {
        targetSummary:
          "Compute exterior collinear electric field using distances x and (x - d) from the two fixed charges",
        distractorStrategy: [
          "combining-exterior-vectors-with-wrong-relative-sign",
          "using-charge-separation-instead-of-total-distance-from-left-charge",
          "reversing-net-vector-sense",
        ],
      },
      targetQuantityKey: "fieldNC",
      stem,
      options,
      workedSolution: `Exterior point P is r₁ = ${r1} m to the right of ${formatSignedChargeNC(q1)} and r₂ = ${probe} − ${sep} = ${r2} m to the right of ${formatSignedChargeNC(q2)}. Superposing E_x = kq₁/r₁² + kq₂/r₂² gives ${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${dirWord} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Uses r₁ = ${r1} m and r₂ = ${r2} m to obtain ${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${dirWord} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const stem = `${ctx}, ${geom} ${kClause}`;
  const sameSign = q1 * q2 > 0;
  const qualAns = sameSign
    ? `Because P lies to the right of both like-sign charges, both source fields point ${q1 > 0 ? "to the right" : "to the left"} and reinforce.`
    : "Because P lies to the right of both opposite-sign charges, one source repels a positive test charge rightward while the other attracts it leftward, so their fields oppose.";
  const quantAns = `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${dirWord}`;

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: ["fieldNC"],
    questionPlan: {
      targetSummary:
        "Compare individual vector directions at an exterior axial point and calculate resultant electric field",
      subpartStrategy: [
        "qualitative comparison of exterior field vector directions",
        "quantitative inverse-square superposition using exterior probe distances",
      ],
    },
    stem,
    parts: [
      {
        partId: "a",
        prompt:
          "State whether the two individual electric field vectors at exterior point P act in the same direction or in opposite directions, giving a brief reason.",
        marks: 1,
        targetMode: "qualitative",
        expectedAnswer: qualAns,
        workingSteps: [qualAns],
      },
      {
        partId: "b",
        prompt:
          "Calculate the magnitude and state the direction of the resultant electric field at exterior point P.",
        marks: 3,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "fieldNC",
        expectedAnswer: quantAns,
        workingSteps: [
          `Distances to P: r₁ = ${r1} m and r₂ = ${probe} − ${sep} = ${r2} m.`,
          `|E₁| = ${formatPhysics3sf(e1Mag, "N C⁻¹")}; |E₂| = ${formatPhysics3sf(e2Mag, "N C⁻¹")}.`,
          `Resultant E = ${quantAns}.`,
        ],
      },
    ],
    workedSolution: `(a) ${qualAns} (b) Using r₁ = ${r1} m and r₂ = ${r2} m, |E₁| = ${formatPhysics3sf(e1Mag, "N C⁻¹")} and |E₂| = ${formatPhysics3sf(e2Mag, "N C⁻¹")}, giving resultant E = ${quantAns}.`,
    markScheme: [
      {
        code: "B1",
        partId: "a",
        criterion: sameSign
          ? "States same direction with correct test-charge reasoning."
          : "States opposite directions with correct test-charge reasoning.",
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Identifies r₁ = ${r1} m and r₂ = ${r2} m.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies signed vector superposition kq₁/r₁² + kq₂/r₂².",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${quantAns}.`,
        marks: 1,
      },
    ],
    totalMarks: 4,
    generatorModel,
  };
}

function buildSymbolicSuperpositionItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  // Tuples [leftMag, rightMag, sepUnits, pointUnitsFromLeft] with clean non-zero differences != 1 and != 4
  const paramTable: ReadonlyArray<[number, number, number, number]> = [
    [2, 4, 3, 1],
    [3, 8, 3, 1],
    [7, 2, 3, 2],
    [5, 8, 3, 1],
    [2, 9, 4, 1],
    [6, 4, 3, 2],
    [3, 12, 4, 1],
    [9, 5, 3, 2],
    [4, 18, 4, 1],
    [5, 4, 3, 2],
    [7, 8, 3, 1],
    [9, 2, 3, 2],
    [6, 9, 4, 2],
    [12, 4, 4, 2],
    [5, 18, 4, 1],
    [8, 5, 3, 2],
    [3, 16, 5, 1],
    [10, 4, 3, 2],
    [6, 27, 4, 1],
    [7, 4, 3, 2],
    [11, 6, 4, 2],
  ];
  const [leftMag, rightMag, sepUnits, ptUnits] = pickCycle(
    paramTable,
    variantIdx,
  );
  const scenarioSpec = {
    kind: "electric-superposition",
    leftMagnitude: leftMag,
    rightMagnitude: rightMag,
    separationUnits: sepUnits,
    pointUnitsFromLeft: ptUnits,
    chargesNC: [leftMag, rightMag],
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const coef = Number(solved.quantities.fieldCoefficient);
  const dirWord = String(solved.quantities.direction) as "right" | "left";
  const oppDir: "right" | "left" = dirWord === "right" ? "left" : "right";

  const rightDist = sepUnits - ptUnits;
  const term1 = leftMag / ptUnits ** 2;
  const term2 = rightMag / rightDist ** 2;
  const sumCoef = term1 + term2;
  const unsquaredCoef = Math.abs(leftMag / ptUnits - rightMag / rightDist);

  const difficulty = chooseDifficulty(variantIdx + 2);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);
  const ctx = pickCycle(POINT_CHARGE_CONTEXTS, variantIdx + 12);

  const geomPool: readonly string[] = [
    `positive point charges +${leftMag}Q (on the left) and +${rightMag}Q (on the right) are fixed a distance ${sepUnits} x apart in vacuum. Point P lies on the line joining them at a distance ${ptUnits} x from +${leftMag}Q (and ${rightDist} x from +${rightMag}Q).`,
    `two isolated positive sources of charge +${leftMag}Q and +${rightMag}Q have separation ${sepUnits} x, with +${leftMag}Q at the left end. Observation point P is positioned between them at distance ${ptUnits} x from +${leftMag}Q.`,
    `fixed charges +${leftMag}Q (left) and +${rightMag}Q (right) sit along an axis in free space separated by ${sepUnits} x. Point P is marked ${ptUnits} x to the right of +${leftMag}Q.`,
    `on a straight vacuum baseline of total length ${sepUnits} x between +${leftMag}Q on the left and +${rightMag}Q on the right, point P lies ${ptUnits} x from the left source.`,
  ];
  const geom = pickCycle(geomPool, variantIdx);

  if (format === "mcq") {
    const stem = `${ctx}, ${geom} Using Coulomb constant k, what is the resultant electric field at P expressed in terms of kQ/x²?`;
    const correctText = `${formatPhysics3sf(coef, "kQ/x²")} to the ${dirWord}`;
    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: coef,
      isDirectional: true,
      fallbackUnit: "kQ/x²",
      fallbackDirection: dirWord,
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: `${formatPhysics3sf(coef, "kQ/x²")} to the ${oppDir}`,
          rationale:
            "Evaluates the correct inverse-square difference coefficient but reverses the resultant field direction.",
        },
        {
          text: `${formatPhysics3sf(sumCoef, "kQ/x²")} to the ${dirWord}`,
          rationale:
            "Adds the two field magnitudes between two positive charges instead of subtracting opposing vectors.",
        },
        {
          text: `${formatPhysics3sf(Math.max(unsquaredCoef, 0.15), "kQ/x²")} to the ${dirWord}`,
          rationale:
            "Divides by unsquared distance ratios instead of squaring the distances from each charge.",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: ["chargesNC", "separationM", "fieldCoefficient"],
      questionPlan: {
        targetSummary:
          "Evaluate dimensionless inverse-square coefficient and direction for two positive collinear charges",
        distractorStrategy: [
          "reversing-dominant-repulsive-vector-direction",
          "summing-instead-of-subtracting-between-positive-sources",
          "omitting-square-on-denominator-distance-units",
        ],
      },
      targetQuantityKey: "fieldCoefficient",
      stem,
      options,
      workedSolution: `At P, +${leftMag}Q produces (${leftMag}/${ptUnits}²) kQ/x² = ${formatPhysics3sf(term1)} kQ/x² to the right, while +${rightMag}Q at distance ${rightDist} x produces (${rightMag}/${rightDist}²) kQ/x² = ${formatPhysics3sf(term2)} kQ/x² to the left. Net field = ${formatPhysics3sf(coef, "kQ/x²")} to the ${dirWord} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Subtracts (${leftMag}/${ptUnits}²) and (${rightMag}/${rightDist}²) to obtain ${formatPhysics3sf(coef, "kQ/x²")} to the ${dirWord} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const stem = `${ctx}, ${geom} Write the resultant electric field magnitude at P in the form E = α kQ/x², where k is the Coulomb constant.`;
  const qualDirAns =
    dirWord === "right"
      ? "The left positive charge produces a larger repulsive field magnitude at P than the right positive charge, so the net electric field points to the right."
      : "The right positive charge produces a larger repulsive field magnitude at P than the left positive charge, so the net electric field points to the left.";

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: ["chargesNC", "separationM", "fieldCoefficient"],
    questionPlan: {
      targetSummary:
        "Deduce net field direction and calculate dimensionless coefficient alpha in symbolic inverse-square form",
      subpartStrategy: [
        "qualitative comparison of opposing repulsive contributions",
        "symbolic inverse-square coefficient calculation",
      ],
    },
    stem,
    parts: [
      {
        partId: "a",
        prompt:
          "State and explain the direction of the resultant electric field at point P.",
        marks: 1,
        targetMode: "qualitative",
        expectedAnswer: qualDirAns,
        workingSteps: [qualDirAns],
      },
      {
        partId: "b",
        prompt: "Calculate the numerical value of the dimensionless coefficient α.",
        marks: 3,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "fieldCoefficient",
        expectedAnswer: formatPhysics3sf(coef),
        workingSteps: [
          `Rightward term from +${leftMag}Q: ${leftMag}/${ptUnits}² = ${formatPhysics3sf(term1)}.`,
          `Leftward term from +${rightMag}Q at distance ${rightDist} x: ${rightMag}/${rightDist}² = ${formatPhysics3sf(term2)}.`,
          `α = |${formatPhysics3sf(term1)} − ${formatPhysics3sf(term2)}| = ${formatPhysics3sf(coef)}.`,
        ],
      },
    ],
    workedSolution: `(a) ${qualDirAns} (b) α = |${leftMag}/${ptUnits}² − ${rightMag}/${rightDist}²| = |${formatPhysics3sf(term1)} − ${formatPhysics3sf(term2)}| = ${formatPhysics3sf(coef)}.`,
    markScheme: [
      {
        code: "B1",
        partId: "a",
        criterion: `Identifies resultant direction as to the ${dirWord} with valid reasoning.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Forms inverse-square terms ${leftMag}/${ptUnits}² and ${rightMag}/${rightDist}².`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Subtracts the opposing dimensionless field coefficients.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains α = ${formatPhysics3sf(coef)}.`,
        marks: 1,
      },
    ],
    totalMarks: 4,
    generatorModel,
  };
}

function buildThreeChargeForceOnProbeItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  const paramTable: ReadonlyArray<[number, number, number, number, number]> = [
    [4, -8, 0.6, 0.2, -2.5],
    [6, -3, 0.5, 0.2, -4.0],
    [-5, 10, 0.6, 0.3, -3.0],
    [8, 2, 0.5, 0.2, -2.0],
    [3, -9, 0.6, 0.3, 2.5],
    [-4, 6, 0.5, 0.2, 3.5],
    [9, 4, 0.6, 0.2, -1.5],
    [5, -12, 0.8, 0.2, -2.0],
    [-6, 9, 0.6, 0.2, -2.5],
    [7, -4, 0.6, 0.3, 4.0],
    [10, 3, 0.7, 0.3, -3.0],
    [-8, 12, 0.8, 0.4, -1.8],
    [4, -6, 0.4, 0.15, -3.2],
    [6, 15, 0.9, 0.6, 2.4],
    [-9, 3, 0.6, 0.2, -2.0],
    [5, -5, 0.4, 0.2, -3.6],
    [12, -6, 0.8, 0.3, 1.5],
    [-7, 7, 0.6, 0.3, -2.2],
    [8, -10, 0.7, 0.2, -1.6],
    [3, 12, 0.6, 0.4, -4.5],
    [-10, 4, 0.8, 0.3, 2.8],
  ];
  const [q1, q2, sep, probe, qTest] = pickCycle(paramTable, variantIdx);
  const scenarioSpec = {
    kind: "negative-probe",
    chargesNC: [q1, q2],
    separationM: sep,
    probeM: probe,
    testChargeNC: qTest,
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const fieldNC = Number(solved.quantities.fieldNC);
  const forceN = Number(solved.quantities.forceN);
  const fieldDir: "right" | "left" = fieldNC >= 0 ? "right" : "left";
  const forceDir: "right" | "left" = forceN >= 0 ? "right" : "left";
  const oppForceDir: "right" | "left" = forceDir === "right" ? "left" : "right";

  const r1 = probe;
  const r2 = roundClean(sep - probe);
  const f1Mag =
    (COULOMB_CONSTANT * Math.abs(q1 * qTest) * 1e-18) / r1 ** 2;
  const f2Mag =
    (COULOMB_CONSTANT * Math.abs(q2 * qTest) * 1e-18) / r2 ** 2;
  const wrongCombForce =
    q1 * q2 < 0 ? Math.abs(f1Mag - f2Mag) : f1Mag + f2Mag;

  const difficulty = chooseDifficulty(variantIdx + 3);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);
  const ctx = pickCycle(POINT_CHARGE_CONTEXTS, variantIdx + 3);
  const kClause = pickCycle(K_CONSTANT_CLAUSES, variantIdx + 4);

  const geomPool: readonly string[] = [
    `two fixed source charges of ${formatSignedChargeNC(q1)} (left) and ${formatSignedChargeNC(q2)} (right) are separated by ${sep} m. Point P lies on the line joining them, ${probe} m from the left source.`,
    `source charges ${formatSignedChargeNC(q1)} at x = 0 and ${formatSignedChargeNC(q2)} at x = ${sep} m are held stationary, while point P sits on the axis at x = ${probe} m.`,
    `along a ${sep} m vacuum baseline between fixed charges ${formatSignedChargeNC(q1)} on the left and ${formatSignedChargeNC(q2)} on the right, point P is marked ${probe} m from ${formatSignedChargeNC(q1)}.`,
    `stationary point charges ${formatSignedChargeNC(q1)} (left) and ${formatSignedChargeNC(q2)} (right) are mounted ${sep} m apart, with axial point P located ${probe} m from the left charge.`,
  ];
  const geom = pickCycle(geomPool, variantIdx * 3);

  if (format === "mcq") {
    const stem = `${ctx}, ${geom} A small probe charge of ${formatSignedChargeNC(qTest)} is placed at P without disturbing the fixed sources. ${kClause} What is the resultant electrostatic force acting on the ${formatSignedChargeNC(qTest)} probe charge?`;
    const correctText = `${formatPhysics3sf(Math.abs(forceN), "N")} to the ${forceDir}`;
    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: Math.abs(forceN),
      isDirectional: true,
      fallbackUnit: "N",
      fallbackDirection: forceDir,
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: `${formatPhysics3sf(Math.abs(forceN), "N")} to the ${oppForceDir}`,
          rationale:
            qTest < 0
              ? "Gives the direction of the electric field rather than reversing the vector for a negative probe charge."
              : "Computes the correct Coulomb force magnitude but reverses the resultant force direction.",
        },
        {
          text: `${formatPhysics3sf(Math.max(wrongCombForce, 1e-8), "N")} to the ${forceDir}`,
          rationale:
            "Combines the two individual Coulomb forces with the wrong relative sign during vector superposition.",
        },
        {
          text: `${formatPhysics3sf(Math.abs(fieldNC), "N")} to the ${forceDir}`,
          rationale:
            "Reports the numerical magnitude of the electric field E at P without multiplying by the probe charge magnitude |q_test|.",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: ["fieldNC", "potentialV", "forceN"],
      questionPlan: {
        targetSummary:
          "Determine net Coulomb electrostatic force magnitude and direction on a third probe charge at P",
        distractorStrategy: [
          "forgetting-negative-probe-reverses-field-direction",
          "wrong-vector-superposition-sign-between-two-sources",
          "omitting-probe-charge-factor-in-F-equals-qE",
        ],
      },
      targetQuantityKey: "forceN",
      stem,
      options,
      workedSolution: `At P (r₁ = ${r1} m, r₂ = ${r2} m), the resultant electric field is E = ${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${fieldDir}. Multiplying by q_test = ${formatSignedChargeNC(qTest)} gives F = q_test E = ${formatPhysics3sf(Math.abs(forceN), "N")} to the ${forceDir} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates E = ${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} and F = qE = ${formatPhysics3sf(Math.abs(forceN), "N")} to the ${forceDir} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const stem = `${ctx}, ${geom} ${kClause}`;
  const eAns = `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${fieldDir}`;
  const fAns = `${formatPhysics3sf(Math.abs(forceN), "N")} to the ${forceDir}`;

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: ["fieldNC", "potentialV", "forceN"],
    questionPlan: {
      targetSummary:
        "Calculate resultant electric field at P and hence determine Coulomb force on a probe charge placed at P",
      subpartStrategy: [
        "superpose inverse-square source fields at P",
        "apply F = q_test E accounting for probe charge sign",
      ],
    },
    stem,
    parts: [
      {
        partId: "a",
        prompt:
          "Calculate the magnitude and state the direction of the resultant electric field at point P due to the two fixed source charges.",
        marks: 3,
        targetQuantityKey: "fieldNC",
        expectedAnswer: eAns,
        workingSteps: [
          `r₁ = ${r1} m and r₂ = ${sep} − ${r1} = ${r2} m.`,
          `Superpose E_x = kq₁/r₁² + kq₂/r₂² = ${eAns}.`,
        ],
      },
      {
        partId: "b",
        prompt: `A small test charge of ${formatSignedChargeNC(qTest)} is now placed at P. Calculate the magnitude and state the direction of the electrostatic force acting on it.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "forceN",
        expectedAnswer: fAns,
        workingSteps: [
          `Use F = q_test E with q_test = ${qTest} × 10⁻⁹ C.`,
          `F = ${fAns}.`,
        ],
      },
    ],
    workedSolution: `(a) With r₁ = ${r1} m and r₂ = ${r2} m, superposing the two inverse-square fields gives E = ${eAns}. (b) Using F = q_test E with q_test = ${formatSignedChargeNC(qTest)} gives F = ${fAns}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Uses E = k|q|/r² with r₁ = ${r1} m and r₂ = ${r2} m.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "a",
        criterion: "Combines the two collinear field vectors with correct signs.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains ${eAns}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Multiplies field from (a) by probe charge in coulombs.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${fAns}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
    generatorModel,
  };
}

function buildLikeChargesNullLocationItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  const paramTable: ReadonlyArray<[number, number, number]> = [
    [4, 9, 0.5],
    [1, 4, 0.6],
    [9, 16, 0.7],
    [2, 8, 0.9],
    [3, 12, 0.6],
    [1, 9, 0.8],
    [4, 16, 0.9],
    [5, 20, 0.75],
    [16, 9, 0.7],
    [9, 4, 1.0],
    [8, 2, 0.6],
    [1, 16, 1.0],
    [6, 24, 0.9],
    [25, 9, 0.8],
    [2, 18, 0.8],
    [12, 3, 0.9],
    [4, 25, 0.7],
    [18, 8, 1.0],
    [3, 27, 0.8],
    [16, 4, 0.6],
    [9, 25, 0.8],
  ];
  const [q1, q2, sep] = pickCycle(paramTable, variantIdx);
  const scenarioSpec = {
    kind: "null-potential",
    chargesNC: [q1, q2],
    separationM: sep,
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const nullPos = Number(solved.quantities.nullPositionM);

  const linearPos = (sep * q1) / (q1 + q2);
  const fromRight = sep - nullPos;
  const midpoint = sep / 2;

  const difficulty = chooseDifficulty(variantIdx + 4);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);
  const ctx = pickCycle(POINT_CHARGE_CONTEXTS, variantIdx + 7);

  const geomPool: readonly string[] = [
    `two fixed positive point charges of +${q1} nC (on the left) and +${q2} nC (on the right) are separated by ${sep} m in vacuum.`,
    `isolated point charges +${q1} nC at x = 0 and +${q2} nC at x = ${sep} m are mounted along a straight insulating track.`,
    `positive sources carrying +${q1} nC (left) and +${q2} nC (right) sit at a fixed centre-to-centre distance of ${sep} m.`,
    `along a ${sep} m baseline in free space, a +${q1} nC point charge is fixed at the left end and a +${q2} nC point charge is fixed at the right end.`,
  ];
  const geom = pickCycle(geomPool, variantIdx * 2 + 1);

  if (format === "mcq") {
    const askPool: readonly string[] = [
      `At what distance from the +${q1} nC charge along the line joining the charges is the resultant electric field equal to zero?`,
      `Determine the distance x from the left-hand +${q1} nC source to the zero-field null point between the charges.`,
      `How far from the +${q1} nC point charge does the net electric field vanish?`,
    ];
    const stem = `${ctx}, ${geom} ${pickCycle(askPool, variantIdx)}`;
    const correctText = formatPhysics3sf(nullPos, "m");
    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: nullPos,
      isDirectional: false,
      fallbackUnit: "m",
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: formatPhysics3sf(linearPos, "m"),
          numericApprox: linearPos,
          rationale:
            "Proportions the distance linearly with charge q₁/(q₁ + q₂) instead of using square roots √q₁/(√q₁ + √q₂) from the inverse-square law.",
        },
        {
          text: formatPhysics3sf(fromRight, "m"),
          numericApprox: fromRight,
          rationale:
            "Calculates the distance of the null point from the right-hand charge rather than from the left-hand charge.",
        },
        {
          text: formatPhysics3sf(midpoint, "m"),
          numericApprox: midpoint,
          rationale:
            "Assumes the electric fields cancel at the geometric midpoint despite the unequal source magnitudes.",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: ["nullPositionM", "potentialV", "fieldNC"],
      questionPlan: {
        targetSummary:
          "Locate the interior zero-field coordinate between two unequal positive point charges",
        distractorStrategy: [
          "linear-charge-weighting-instead-of-square-root",
          "reporting-complement-distance-from-opposite-source",
          "assuming-midpoint-cancellation-for-unequal-charges",
        ],
      },
      targetQuantityKey: "nullPositionM",
      stem,
      options,
      workedSolution: `Equating opposing field magnitudes gives q₁/x² = q₂/(${sep} − x)², so (${sep} − x)/x = √(${q2}/${q1}). Solving yields x = ${sep} × √${q1}/(√${q1} + √${q2}) = ${correctText} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Equates kq₁/x² = kq₂/(${sep} − x)² to obtain x = ${correctText} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const stem = `${ctx}, ${geom}`;
  const smallerSide = q1 < q2 ? "left" : "right";
  const qualReason = `Between two positive charges their repulsive fields act in opposite directions, and equal field magnitudes require a smaller distance from the weaker ${smallerSide}-hand charge.`;
  const ansStr = formatPhysics3sf(nullPos, "m");

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: ["nullPositionM", "potentialV", "fieldNC"],
    questionPlan: {
      targetSummary:
        "Explain why the null point lies closer to the smaller positive charge and calculate its distance from the left charge",
      subpartStrategy: [
        "qualitative justification of null-point existence and asymmetry",
        "inverse-square root ratio calculation of nullPositionM",
      ],
    },
    stem,
    parts: [
      {
        partId: "a",
        prompt:
          "Explain why the resultant electric field can be zero only in the region between the two positive charges and state which charge lies closer to that point.",
        marks: 1,
        targetMode: "qualitative",
        expectedAnswer: qualReason,
        workingSteps: [qualReason],
      },
      {
        partId: "b",
        prompt: `Calculate the distance from the +${q1} nC charge to the zero-field point.`,
        marks: 3,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "nullPositionM",
        expectedAnswer: ansStr,
        workingSteps: [
          `Set k(${q1})/x² = k(${q2})/(${sep} − x)².`,
          `Take positive square roots: (${sep} − x)/x = √(${q2}/${q1}).`,
          `Solve for x = ${ansStr}.`,
        ],
      },
    ],
    workedSolution: `(a) ${qualReason} (b) Setting ${q1}/x² = ${q2}/(${sep} − x)² gives (${sep} − x)/x = √(${q2}/${q1}), hence x = ${ansStr}.`,
    markScheme: [
      {
        code: "B1",
        partId: "a",
        criterion: `Explains opposing fields between positive sources and identifies closer proximity to the ${smallerSide}-hand charge.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Equates inverse-square field magnitudes ${q1}/x² = ${q2}/(${sep} − x)².`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Takes square roots correctly to linearize for x.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains x = ${ansStr}.`,
        marks: 1,
      },
    ],
    totalMarks: 4,
    generatorModel,
  };
}

function buildNullPointChargeRatioItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  // [separationM, zeroPositionM, leftChargeNC]
  const paramTable: ReadonlyArray<[number, number, number]> = [
    [0.6, 0.2, 4.0],
    [0.8, 0.2, 3.0],
    [0.9, 0.3, 5.0],
    [0.5, 0.2, 8.0],
    [0.75, 0.25, 6.0],
    [1.0, 0.4, 12.0],
    [0.6, 0.4, 18.0],
    [0.8, 0.6, 27.0],
    [0.7, 0.2, 4.0],
    [0.9, 0.6, 16.0],
    [0.45, 0.15, 2.5],
    [1.2, 0.3, 2.0],
    [0.5, 0.3, 9.0],
    [0.8, 0.5, 25.0],
    [0.6, 0.15, 1.5],
    [1.0, 0.25, 3.5],
    [0.9, 0.2, 4.0],
    [0.75, 0.5, 20.0],
    [1.2, 0.4, 7.0],
    [0.6, 0.36, 9.0],
    [1.0, 0.2, 2.0],
  ];
  const [sep, x0, q1NC] = pickCycle(paramTable, variantIdx);
  const leftChargeC = roundClean(q1NC * 1e-9);
  const scenarioSpec = {
    kind: "two-charge-field-graph",
    separationM: sep,
    zeroPositionM: x0,
    leftChargeC,
    chargesNC: [q1NC, q1NC],
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const ratio = Number(solved.quantities.magnitudeRatio);
  const rightChargeC = Number(solved.quantities.rightChargeC);

  const dRight = roundClean(sep - x0);
  const unsquaredRatio = dRight / x0;
  const invertedRatio = 1 / ratio;

  const difficulty = chooseDifficulty(variantIdx + 5);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);
  const ctx = pickCycle(POINT_CHARGE_CONTEXTS, variantIdx + 14);

  const geomPool: readonly string[] = [
    `two fixed point charges q₁ and q₂ are separated by ${sep} m in vacuum, with q₁ = ${formatGivenPlain(leftChargeC, "C")} on the left. Measurements along the connecting axis show that the resultant electric field is zero at a distance of ${x0} m from q₁.`,
    `a point charge q₁ = ${formatGivenPlain(leftChargeC, "C")} sits at x = 0 and an unknown point charge q₂ sits at x = ${sep} m. An axial field scan locates a zero-field null point between them at x = ${x0} m.`,
    `fixed sources q₁ (left, ${formatGivenPlain(leftChargeC, "C")}) and q₂ (right) lie ${sep} m apart. The electric field vanishes at an interior point ${x0} m to the right of q₁.`,
    `along a ${sep} m vacuum baseline with q₁ = ${formatGivenPlain(leftChargeC, "C")} at the left end and q₂ at the right end, the net electric field is zero at a point ${x0} m from q₁.`,
  ];
  const geom = pickCycle(geomPool, variantIdx);

  if (format === "mcq") {
    const askCharge = variantIdx % 2 === 0;
    if (askCharge) {
      const stem = `${ctx}, ${geom} What is the signed charge q₂?`;
      const correctText = `+${formatPhysics3sf(rightChargeC, "C")}`;
      const { options, correctLetter } = finalizeMcqOptions({
        correctText,
        correctNumeric: rightChargeC,
        isDirectional: false,
        fallbackUnit: "C",
        rotationSeed: seed + variantIdx,
        candidates: [
          {
            text: formatPhysics3sf(-rightChargeC, "C"),
            numericApprox: -rightChargeC,
            rationale:
              "Assigns the opposite sign to q₂, whereas opposite-sign charges never produce a zero-field point between them.",
          },
          {
            text: `+${formatPhysics3sf(leftChargeC * unsquaredRatio, "C")}`,
            numericApprox: leftChargeC * unsquaredRatio,
            rationale:
              "Scales q₁ by the unsquared distance ratio (d − x₀)/x₀ instead of ((d − x₀)/x₀)².",
          },
          {
            text: `+${formatPhysics3sf(leftChargeC * invertedRatio, "C")}`,
            numericApprox: leftChargeC * invertedRatio,
            rationale:
              "Inverts the squared distance ratio x₀²/(d − x₀)² instead of (d − x₀)²/x₀².",
          },
        ],
      });

      return {
        id,
        conceptId: arch.conceptId,
        templateArchetype: arch.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "fields",
        scenarioSpec,
        hiddenQuantities: [
          "chargesNC",
          "chargeSignRelationship",
          "magnitudeRatio",
          "rightChargeC",
        ],
        questionPlan: {
          targetSummary:
            "Deduce signed unknown charge q2 from interior zero-field coordinate and known left charge q1",
          distractorStrategy: [
            "assigning-opposite-charge-polarity-for-interior-null",
            "omitting-square-on-distance-ratio",
            "inverting-distance-ratio-between-sources",
          ],
        },
        targetQuantityKey: "rightChargeC",
        stem,
        options,
        workedSolution: `An interior null point requires q₁ and q₂ to have the same sign (+). Equating kq₁/x₀² = kq₂/(d − x₀)² with d − x₀ = ${dRight} m gives q₂ = q₁((${dRight})/(${x0}))² = ${formatPhysics3sf(ratio)} × ${formatGivenPlain(leftChargeC, "C")} = ${correctText} (${correctLetter}).`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses q₂ = q₁((d − x₀)/x₀)² with positive sign to obtain ${correctText} (${correctLetter}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${ctx}, ${geom} What is the magnitude ratio |q₂ / q₁|?`;
    const correctText = formatPhysics3sf(ratio);
    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: ratio,
      isDirectional: false,
      fallbackUnit: "",
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: formatPhysics3sf(unsquaredRatio),
          numericApprox: unsquaredRatio,
          rationale:
            "Computes the linear distance ratio (d − x₀)/x₀ instead of squaring for inverse-square fields.",
        },
        {
          text: formatPhysics3sf(invertedRatio),
          numericApprox: invertedRatio,
          rationale:
            "Inverts the ratio to |q₁ / q₂| = (x₀/(d − x₀))².",
        },
        {
          text: formatPhysics3sf((sep / x0) ** 2),
          numericApprox: (sep / x0) ** 2,
          rationale:
            "Uses total separation d instead of (d − x₀) for the distance from q₂ to the null point.",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: [
        "chargesNC",
        "chargeSignRelationship",
        "magnitudeRatio",
        "rightChargeC",
      ],
      questionPlan: {
        targetSummary:
          "Determine source charge magnitude ratio from interior null-field distance",
        distractorStrategy: [
          "unsquared-linear-distance-ratio",
          "reciprocal-charge-ratio",
          "substituting-full-separation-for-right-distance",
        ],
      },
      targetQuantityKey: "magnitudeRatio",
      stem,
      options,
      workedSolution: `At x₀ = ${x0} m, the distance from q₂ is d − x₀ = ${dRight} m. Setting |q₁|/x₀² = |q₂|/(d − x₀)² gives |q₂/q₁| = (${dRight}/${x0})² = ${correctText} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates ((d − x₀)/x₀)² = (${dRight}/${x0})² = ${correctText} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const ratioStr = formatPhysics3sf(ratio);
  const q2Str = `+${formatPhysics3sf(rightChargeC, "C")}`;

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: [
      "chargesNC",
      "chargeSignRelationship",
      "magnitudeRatio",
      "rightChargeC",
    ],
    questionPlan: {
      targetSummary:
        "Deduce charge sign relationship, calculate source charge ratio, and determine unknown source charge from observed zero-field position",
      subpartStrategy: [
        "identify same-sign condition from interior field cancellation",
        "compute inverse-square source charge magnitude ratio",
        "evaluate signed rightChargeC from leftChargeC and ratio",
      ],
    },
    stem: `${ctx}, ${geom}`,
    parts: [
      {
        partId: "a",
        prompt:
          "State whether q₁ and q₂ have the same sign or opposite signs, explaining your reasoning.",
        marks: 1,
        targetQuantityKey: "chargeSignRelationship",
        expectedAnswer:
          "They have the same sign because their individual electric field vectors must point in opposite directions to cancel between the charges.",
        workingSteps: [
          "Opposite-sign charges produce fields in the same direction everywhere between them.",
          "Therefore q₁ and q₂ must have the same sign.",
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the ratio |q₂ / q₁|.",
        marks: 2,
        targetQuantityKey: "magnitudeRatio",
        expectedAnswer: ratioStr,
        workingSteps: [
          `Distance from q₂ to null point = ${sep} − ${x0} = ${dRight} m.`,
          `|q₂ / q₁| = (${dRight} / ${x0})² = ${ratioStr}.`,
        ],
      },
      {
        partId: "c",
        prompt: "Hence determine the signed value of q₂.",
        marks: 2,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "rightChargeC",
        expectedAnswer: q2Str,
        workingSteps: [
          `q₂ is positive (same sign as q₁) with magnitude ${ratioStr} × ${formatGivenPlain(leftChargeC, "C")}.`,
          `q₂ = ${q2Str}.`,
        ],
      },
    ],
    workedSolution: `(a) q₁ and q₂ have the same sign so their fields oppose between them. (b) |q₂/q₁| = ((${sep} − ${x0})/${x0})² = (${dRight}/${x0})² = ${ratioStr}. (c) q₂ = +(${ratioStr})(${formatGivenPlain(leftChargeC, "C")}) = ${q2Str}.`,
    markScheme: [
      {
        code: "B1",
        partId: "a",
        criterion:
          "States same sign because fields must oppose in the region between the charges.",
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Uses |q₂/q₁| = ((d − x₀)/x₀)² with d − x₀ = ${dRight} m.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${ratioStr}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Multiplies q₁ by ratio from (b) with positive sign.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains q₂ = ${q2Str}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
    generatorModel,
  };
}

function buildUniformParallelPlatesFieldWorkItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  // [potentialDifferenceV, plateSeparationM, chargeC (macroscopic nC droplets/beads so workJ >> 1e-9 J), massKg]
  const paramTable: ReadonlyArray<[number, number, number, number]> = [
    [240, 0.03, 2.5e-8, 4.0e-6],
    [400, 0.05, 3.0e-8, 5.0e-6],
    [600, 0.04, 1.5e-8, 3.0e-6],
    [150, 0.025, 4.0e-8, 4.0e-6],
    [800, 0.08, 2.0e-8, 6.0e-6],
    [1200, 0.06, 1.25e-8, 2.5e-6],
    [360, 0.045, 5.0e-8, 2.0e-6],
    [900, 0.03, 1.8e-8, 3.6e-6],
    [500, 0.02, 4.0e-9, 5.0e-6],
    [1500, 0.05, 6.0e-9, 4.5e-6],
    [180, 0.015, 2.0e-8, 1.5e-6],
    [720, 0.06, 2.5e-8, 5.0e-6],
    [2000, 0.04, 8.0e-9, 4.0e-6],
    [450, 0.03, 6.0e-9, 3.0e-6],
    [1000, 0.025, 1.4e-8, 2.8e-6],
    [320, 0.04, 8.0e-9, 4.0e-6],
    [1600, 0.08, 1.5e-8, 3.0e-6],
    [270, 0.018, 3.0e-8, 2.5e-6],
    [2400, 0.06, 5.0e-9, 2.0e-6],
    [640, 0.032, 3.5e-8, 7.0e-6],
    [840, 0.07, 5.0e-9, 2.0e-6],
  ];
  const [dv, d, q, m] = pickCycle(paramTable, variantIdx);
  const scenarioSpec = {
    kind: "parallel-plates-particle",
    potentialDifferenceV: dv,
    plateSeparationM: d,
    chargeC: q,
    massKg: m,
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const fieldNC = Number(solved.quantities.fieldNC);
  const workJ = Number(solved.quantities.workJ);

  const difficulty = chooseDifficulty(variantIdx);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);
  const ctx = pickCycle(PARALLEL_PLATE_CONTEXTS, variantIdx);

  const geomPool: readonly string[] = [
    `two parallel conducting plates separated by ${d} m are maintained at a potential difference of ${dv} V (from ${dv} V on the left plate to 0 V on the right plate). A positively charged droplet of charge +${formatGivenPlain(q, "C")} and mass ${formatGivenPlain(m, "kg")} is released at the ${dv} V plate.`,
    `a potential difference of ${dv} V is applied across parallel planar electrodes spaced ${d} m apart. A test micro-sphere carrying charge +${formatGivenPlain(q, "C")} and mass ${formatGivenPlain(m, "kg")} crosses from the positive electrode to the grounded 0 V electrode.`,
    `planar parallel plates at potentials ${dv} V and 0 V have separation ${d} m in vacuum, accelerating a charged bead of mass ${formatGivenPlain(m, "kg")} and charge +${formatGivenPlain(q, "C")} across the full gap.`,
    `a uniform electrostatic gap of width ${d} m operates with ${dv} V across its parallel plates while a carrier (q = +${formatGivenPlain(q, "C")}, m = ${formatGivenPlain(m, "kg")}) traverses from the high-potential plate to the 0 V plate.`,
    `inside an evacuated cell of gap width ${d} m biased at ${dv} V, a charged aerosol particle of mass ${formatGivenPlain(m, "kg")} and charge +${formatGivenPlain(q, "C")} travels from the +${dv} V electrode to the 0 V collector.`,
    `flat parallel plates spaced ${d} m apart establish a ${dv} V potential drop as a micro-carrier (mass ${formatGivenPlain(m, "kg")}, charge +${formatGivenPlain(q, "C")}) moves from the positive plate to the earthed 0 V plate.`,
  ];
  const geom = pickCycle(geomPool, variantIdx);

  if (format === "mcq") {
    const askField = variantIdx % 2 === 0;
    if (askField) {
      const fieldAskPool: readonly string[] = [
        "Ignore edge effects. What is the magnitude of the uniform electric field between the plates?",
        "Neglecting fringing at the plate edges, calculate the uniform electric field strength in the gap.",
        "What uniform electric field magnitude acts across the space between the parallel electrodes?",
      ];
      const stem = `${ctx}, ${geom} ${pickCycle(fieldAskPool, variantIdx)}`;
      const correctText = formatPhysics3sf(fieldNC, "V m⁻¹");
      const { options, correctLetter } = finalizeMcqOptions({
        correctText,
        correctNumeric: fieldNC,
        isDirectional: false,
        fallbackUnit: "V m⁻¹",
        rotationSeed: seed + variantIdx,
        candidates: [
          {
            text: formatPhysics3sf(2 * fieldNC, "V m⁻¹"),
            numericApprox: 2 * fieldNC,
            rationale:
              "Divides the full potential difference V by the half-gap spacing d/2 shown to the midplane equipotential instead of full separation d.",
          },
          {
            text: formatPhysics3sf(dv * d, "V m⁻¹"),
            numericApprox: dv * d,
            rationale:
              "Multiplies potential difference V by plate separation d instead of dividing V / d.",
          },
          {
            text: formatPhysics3sf(0.5 * fieldNC, "V m⁻¹"),
            numericApprox: 0.5 * fieldNC,
            rationale:
              "Uses the midplane potential V/2 divided by the full plate separation d.",
          },
        ],
      });

      return {
        id,
        conceptId: arch.conceptId,
        templateArchetype: arch.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "fields",
        scenarioSpec,
        hiddenQuantities: ["fieldNC", "workJ", "finalSpeedMs"],
        questionPlan: {
          targetSummary:
            "Calculate uniform parallel-plate electric field strength from potential difference and separation",
          distractorStrategy: [
            "dividing-full-voltage-by-midplane-half-spacing",
            "multiplying-voltage-by-separation",
            "using-half-voltage-over-full-separation",
          ],
        },
        targetQuantityKey: "fieldNC",
        stem,
        options,
        workedSolution: `For uniform parallel plates, E = V / d = ${dv} / ${d} = ${correctText} (${correctLetter}).`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses E = V / d = ${dv} / ${d} = ${correctText} (${correctLetter}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const workAskPool: readonly string[] = [
      `How much electrical work is done by the electric field on the particle as it crosses from the ${dv} V plate to the 0 V plate?`,
      `Determine the electrical work performed by the uniform field during the full transit to the 0 V electrode.`,
      `What kinetic energy (in joules) is transferred to the carrier by the electric field across the ${dv} V potential drop?`,
    ];
    const stem = `${ctx}, ${geom} ${pickCycle(workAskPool, variantIdx)}`;
    const correctText = formatPhysics3sf(workJ, "J");
    const forceVal = q * fieldNC;
    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: workJ,
      isDirectional: false,
      fallbackUnit: "J",
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: formatPhysics3sf(0.5 * workJ, "J"),
          numericApprox: 0.5 * workJ,
          rationale:
            "Applies the capacitor stored-energy factor 1/2 qV instead of W = qΔV for a single charge crossing a potential difference.",
        },
        {
          text: formatPhysics3sf(forceVal, "J"),
          numericApprox: forceVal,
          rationale:
            "Calculates the electrostatic force qV/d rather than multiplying by displacement d to obtain work qV.",
        },
        {
          text: formatPhysics3sf(workJ * d, "J"),
          numericApprox: workJ * d,
          rationale:
            "Multiplies qV by plate separation d a second time (computing qVd instead of qV).",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: ["fieldNC", "workJ", "finalSpeedMs"],
      questionPlan: {
        targetSummary:
          "Calculate electrical work W = qV done on a charged particle crossing parallel plates",
        distractorStrategy: [
          "confusing-particle-work-qV-with-capacitor-energy-half-QV",
          "computing-electrostatic-force-qE-instead-of-work",
          "extra-multiplication-by-plate-separation",
        ],
      },
      targetQuantityKey: "workJ",
      stem,
      options,
      workedSolution: `Electrical work done across the full potential difference is W = qΔV = (${formatGivenPlain(q)})(${dv}) = ${correctText} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates W = qV = (${formatGivenPlain(q)})(${dv}) = ${correctText} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const eStr = formatPhysics3sf(fieldNC, "V m⁻¹");
  const wStr = formatPhysics3sf(workJ, "J");

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: ["fieldNC", "workJ", "finalSpeedMs"],
    questionPlan: {
      targetSummary:
        "Determine uniform electric field strength E = V/d and electrical work W = qV across parallel plates",
      subpartStrategy: [
        "compute uniform electric field E = V/d",
        "compute work done W = qV across the gap",
      ],
    },
    stem: `${ctx}, ${geom} Neglect edge effects and gravitational forces.`,
    parts: [
      {
        partId: "a",
        prompt:
          "Calculate the uniform electric field strength between the parallel plates.",
        marks: 2,
        targetQuantityKey: "fieldNC",
        expectedAnswer: eStr,
        workingSteps: [`E = V / d = ${dv} / ${d} = ${eStr}.`],
      },
      {
        partId: "b",
        prompt: `Calculate the work done by the electric field as the particle travels from the ${dv} V plate to the 0 V plate.`,
        marks: 2,
        targetQuantityKey: "workJ",
        expectedAnswer: wStr,
        workingSteps: [
          `W = qΔV = (${formatGivenPlain(q, "C")})(${dv} V) = ${wStr}.`,
        ],
      },
    ],
    workedSolution: `(a) Uniform field E = V / d = ${dv} / ${d} = ${eStr}. (b) Work done by the field W = qV = (${formatGivenPlain(q)})(${dv}) = ${wStr}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Substitutes V = ${dv} V and d = ${d} m into E = V / d.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains ${eStr}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies W = qV (or W = qEd).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${wStr}.`,
        marks: 1,
      },
    ],
    totalMarks: 4,
    generatorModel,
  };
}

function buildParallelPlateIonSpeedItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  // Non-relativistic ions & charged micro-beads (v <= 4e6 m/s << c)
  const paramTable: ReadonlyArray<[string, number, number, number, number]> = [
    ["proton", 500, 0.04, 1.6e-19, 1.67e-27],
    ["deuteron", 800, 0.05, 1.6e-19, 3.34e-27],
    ["alpha particle", 1200, 0.06, 3.2e-19, 6.64e-27],
    ["singly charged lithium ion", 900, 0.03, 1.6e-19, 1.16e-26],
    ["singly charged sodium ion", 1500, 0.05, 1.6e-19, 3.82e-26],
    ["doubly charged carbon ion", 1800, 0.045, 3.2e-19, 1.99e-26],
    ["proton", 1250, 0.025, 1.6e-19, 1.67e-27],
    ["alpha particle", 600, 0.03, 3.2e-19, 6.64e-27],
    ["deuteron", 2000, 0.08, 1.6e-19, 3.34e-27],
    ["charged silica microsphere", 450, 0.02, 2.5e-12, 5.0e-10],
    ["singly charged potassium ion", 2200, 0.055, 1.6e-19, 6.49e-26],
    ["alpha particle", 2500, 0.05, 3.2e-19, 6.64e-27],
    ["singly charged helium ion", 750, 0.03, 1.6e-19, 6.64e-27],
    ["deuteron", 1400, 0.035, 1.6e-19, 3.34e-27],
    ["charged polymer droplet", 600, 0.04, 4.0e-12, 1.2e-9],
    ["singly charged neon ion", 1600, 0.04, 1.6e-19, 3.32e-26],
    ["proton", 300, 0.02, 1.6e-19, 1.67e-27],
    ["doubly charged magnesium ion", 2100, 0.07, 3.2e-19, 4.04e-26],
    ["alpha particle", 950, 0.038, 3.2e-19, 6.64e-27],
    ["singly charged argon ion", 2400, 0.06, 1.6e-19, 6.63e-26],
    ["deuteron", 450, 0.03, 1.6e-19, 3.34e-27],
  ];
  const [ionName, dv, d, q, m] = pickCycle(paramTable, variantIdx);
  const scenarioSpec = {
    kind: "parallel-plates-particle",
    potentialDifferenceV: dv,
    plateSeparationM: d,
    chargeC: q,
    massKg: m,
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const fieldNC = Number(solved.quantities.fieldNC);
  const workJ = Number(solved.quantities.workJ);
  const finalSpeedMs = Number(solved.quantities.finalSpeedMs);

  const missingTwoSpeed = finalSpeedMs / Math.SQRT2;
  const fieldSubstitutedSpeed = Math.sqrt((2 * q * fieldNC) / m);
  const halfSpeed = 0.5 * finalSpeedMs;

  const difficulty = chooseDifficulty(variantIdx + 1);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);
  const ctx = pickCycle(PARALLEL_PLATE_CONTEXTS, variantIdx + 6);

  const geomPool: readonly string[] = [
    `a ${ionName} (charge +${formatGivenPlain(q, "C")}, mass ${formatGivenPlain(m, "kg")}) starts from rest at a planar electrode at +${dv} V and accelerates in vacuum across a ${d} m gap to a parallel grounded electrode at 0 V.`,
    `parallel extraction plates separated by ${d} m are held at ${dv} V and 0 V. A stationary ${ionName} of mass ${formatGivenPlain(m, "kg")} and charge +${formatGivenPlain(q, "C")} is released from the ${dv} V plate.`,
    `an initially stationary ${ionName} (m = ${formatGivenPlain(m, "kg")}, q = +${formatGivenPlain(q, "C")}) accelerates across a uniform electric field between parallel plates ${d} m apart with potential difference ${dv} V.`,
    `across a ${d} m vacuum gap with potential difference ${dv} V, a ${ionName} carrying +${formatGivenPlain(q, "C")} and mass ${formatGivenPlain(m, "kg")} accelerates from rest from the positive plate to the 0 V plate.`,
  ];
  const geom = pickCycle(geomPool, variantIdx * 3);

  if (format === "mcq") {
    const stem = `${ctx}, ${geom} Neglecting gravity, what speed does the ${ionName} reach upon arriving at the 0 V plate?`;
    const correctText = formatPhysics3sf(finalSpeedMs, "m s⁻¹");
    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: finalSpeedMs,
      isDirectional: false,
      fallbackUnit: "m s⁻¹",
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: formatPhysics3sf(missingTwoSpeed, "m s⁻¹"),
          numericApprox: missingTwoSpeed,
          rationale:
            "Omits the factor of 2 when rearranging ½mv² = qV, computing √(qV / m) instead of √(2qV / m).",
        },
        {
          text: formatPhysics3sf(fieldSubstitutedSpeed, "m s⁻¹"),
          numericApprox: fieldSubstitutedSpeed,
          rationale:
            "Substitutes electric field strength E = V/d in place of potential difference V inside √(2qV / m).",
        },
        {
          text: formatPhysics3sf(halfSpeed, "m s⁻¹"),
          numericApprox: halfSpeed,
          rationale:
            "Divides by 2 outside the square root when solving ½mv² = qV.",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: ["fieldNC", "workJ", "finalSpeedMs"],
      questionPlan: {
        targetSummary:
          "Determine final speed of an ion accelerated from rest across parallel plates using energy conservation",
        distractorStrategy: [
          "omitting-factor-of-two-in-kinetic-energy-inversion",
          "substituting-electric-field-strength-instead-of-voltage",
          "misplacing-factor-of-one-half-outside-radical",
        ],
      },
      targetQuantityKey: "finalSpeedMs",
      stem,
      options,
      workedSolution: `By conservation of energy, ½mv² = qV, so v = √(2qV / m) = √(2 × ${formatGivenPlain(q)} × ${dv} / ${formatGivenPlain(m)}) = ${correctText} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Equates ½mv² = qV to obtain v = ${correctText} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const eStr = formatPhysics3sf(fieldNC, "V m⁻¹");
  const wStr = formatPhysics3sf(workJ, "J");
  const vStr = formatPhysics3sf(finalSpeedMs, "m s⁻¹");

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: ["fieldNC", "workJ", "finalSpeedMs"],
    questionPlan: {
      targetSummary:
        "Calculate uniform plate electric field, kinetic energy gained, and final exit speed of an accelerated ion",
      subpartStrategy: [
        "compute uniform field from voltage and separation",
        "compute kinetic energy gain from electrical work",
        "compute exit speed from kinetic energy and mass",
      ],
    },
    stem: `${ctx}, ${geom} Ignore gravitational and relativistic effects.`,
    parts: [
      {
        partId: "a",
        prompt: "Calculate the magnitude of the electric field between the plates.",
        marks: 2,
        targetQuantityKey: "fieldNC",
        expectedAnswer: eStr,
        workingSteps: [`E = V / d = ${dv} / ${d} = ${eStr}.`],
      },
      {
        partId: "b",
        prompt: `Determine the kinetic energy gained by the ${ionName} on reaching the 0 V plate.`,
        marks: 2,
        targetQuantityKey: "workJ",
        expectedAnswer: wStr,
        workingSteps: [
          `ΔE_k = W = qV = (${formatGivenPlain(q, "C")})(${dv} V) = ${wStr}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Hence calculate the speed of the ${ionName} as it reaches the 0 V plate.`,
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "finalSpeedMs",
        expectedAnswer: vStr,
        workingSteps: [
          `½mv² = ΔE_k => v = √(2ΔE_k / m) = √(2 × ${wStr} / ${formatGivenPlain(m, "kg")}).`,
          `v = ${vStr}.`,
        ],
      },
    ],
    workedSolution: `(a) E = V / d = ${dv} / ${d} = ${eStr}. (b) ΔE_k = qV = (${formatGivenPlain(q)})(${dv}) = ${wStr}. (c) v = √(2ΔE_k / m) = ${vStr}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Applies E = V / d.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains ${eStr}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Equates kinetic energy gain to electrical work qV.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${wStr}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Rearranges ½mv² = ΔE_k for v = √(2ΔE_k / m).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains ${vStr}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

function buildCollinearScalarPotentialItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  // Choose parameters where potentialV != 0 and fieldNC != 0
  const paramTable: ReadonlyArray<[number, number, number, number]> = [
    [6, -4, 0.5, 0.2],
    [-8, 3, 0.6, 0.2],
    [5, 7, 0.6, 0.2],
    [4, -12, 0.8, 0.5],
    [-6, -9, 0.5, 0.2],
    [9, -3, 0.6, 0.3],
    [-10, 4, 0.7, 0.3],
    [8, 6, 0.8, 0.3],
    [3, -10, 0.6, 0.4],
    [-5, 12, 0.7, 0.5],
    [12, -5, 0.8, 0.3],
    [-4, -8, 0.6, 0.2],
    [7, -2, 0.5, 0.3],
    [-9, 5, 0.6, 0.2],
    [10, 5, 0.9, 0.3],
    [4, -9, 0.5, 0.3],
    [-12, 6, 0.9, 0.3],
    [6, 12, 0.8, 0.5],
    [-7, 3, 0.5, 0.2],
    [15, -6, 0.9, 0.5],
    [-8, -5, 0.7, 0.3],
  ];
  const [q1, q2, sep, probe] = pickCycle(paramTable, variantIdx);
  const scenarioSpec = {
    kind: "collinear-charges",
    chargesNC: [q1, q2],
    separationM: sep,
    probeM: probe,
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const potentialV = Number(solved.quantities.potentialV);
  const fieldNC = Number(solved.quantities.fieldNC);
  const fieldDir: "right" | "left" = fieldNC >= 0 ? "right" : "left";

  const r1 = probe;
  const r2 = roundClean(sep - probe);
  const v1 = (COULOMB_CONSTANT * q1 * 1e-9) / r1;
  const v2 = (COULOMB_CONSTANT * q2 * 1e-9) / r2;
  const unsignedSumOrDiff =
    q1 * q2 < 0 ? Math.abs(v1) + Math.abs(v2) : Math.abs(v1 - v2);
  const fullSepPot = (COULOMB_CONSTANT * (q1 + q2) * 1e-9) / sep;

  const difficulty = chooseDifficulty(variantIdx + 2);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);
  const ctx = pickCycle(POINT_CHARGE_CONTEXTS, variantIdx + 2);
  const pClause = pickCycle(POTENTIAL_ZERO_CLAUSES, variantIdx);

  const geomPool: readonly string[] = [
    `point charges ${formatSignedChargeNC(q1)} (left) and ${formatSignedChargeNC(q2)} (right) are fixed ${sep} m apart, and point P lies on the line between them ${probe} m from ${formatSignedChargeNC(q1)}.`,
    `fixed sources ${formatSignedChargeNC(q1)} at x = 0 and ${formatSignedChargeNC(q2)} at x = ${sep} m bound an axial test point P at x = ${probe} m.`,
    `two stationary charges of ${formatSignedChargeNC(q1)} on the left and ${formatSignedChargeNC(q2)} on the right have separation ${sep} m, with point P marked ${probe} m from the left source.`,
    `along a ${sep} m straight segment joining ${formatSignedChargeNC(q1)} (left) to ${formatSignedChargeNC(q2)} (right), probe point P sits ${probe} m from ${formatSignedChargeNC(q1)}.`,
  ];
  const geom = pickCycle(geomPool, variantIdx * 2);

  if (format === "mcq") {
    const stem = `${ctx}, ${geom} ${pClause} What is the electric potential at point P?`;
    const correctText = formatPhysics3sf(potentialV, "V");
    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: potentialV,
      isDirectional: false,
      fallbackUnit: "V",
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: formatPhysics3sf(unsignedSumOrDiff, "V"),
          numericApprox: unsignedSumOrDiff,
          rationale:
            q1 * q2 < 0
              ? "Adds the magnitudes |kq₁/r₁| + |kq₂/r₂| while ignoring the negative sign of the negative source charge."
              : "Subtracts the two scalar potential contributions as if scalar potentials opposed like electric field vectors.",
        },
        {
          text: formatPhysics3sf(-potentialV, "V"),
          numericApprox: -potentialV,
          rationale:
            "Reverses the algebraic sign of the net scalar potential at P.",
        },
        {
          text: formatPhysics3sf(fullSepPot, "V"),
          numericApprox: fullSepPot,
          rationale:
            "Divides the net charge (q₁ + q₂) by the total charge separation d instead of summing kqᵢ/rᵢ.",
        },
        {
          text: formatPhysics3sf(Math.abs(fieldNC), "V"),
          numericApprox: Math.abs(fieldNC),
          rationale:
            "Uses inverse-square 1/r² distances (computing electric field magnitude instead of electric potential).",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: ["fieldNC", "potentialV"],
      questionPlan: {
        targetSummary:
          "Compute signed scalar electric potential from inverse-distance superposition at an interior axial point",
        distractorStrategy: [
          "ignoring-charge-polarity-in-scalar-potential-sum",
          "overall-sign-inversion-of-potential",
          "confusing-inverse-linear-potential-with-inverse-square-field",
        ],
      },
      targetQuantityKey: "potentialV",
      stem,
      options,
      workedSolution: `Electric potential is a signed scalar: V = k(q₁/r₁ + q₂/r₂) with r₁ = ${r1} m and r₂ = ${r2} m. Thus V = ${formatPhysics3sf(v1, "V")} + (${formatPhysics3sf(v2, "V")}) = ${correctText} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Sums signed scalar potentials kq₁/${r1} + kq₂/${r2} = ${correctText} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const vStr = formatPhysics3sf(potentialV, "V");
  const eStr = `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${fieldDir}`;

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: ["fieldNC", "potentialV"],
    questionPlan: {
      targetSummary:
        "Contrast signed scalar electric potential with vector electric field at point P",
      subpartStrategy: [
        "calculate signed scalar electric potential potentialV",
        "calculate resultant vector electric field fieldNC",
      ],
    },
    stem: `${ctx}, ${geom} ${pClause}`,
    parts: [
      {
        partId: "a",
        prompt: "Calculate the electric potential at point P.",
        marks: 2,
        targetQuantityKey: "potentialV",
        expectedAnswer: vStr,
        workingSteps: [
          `r₁ = ${r1} m, r₂ = ${sep} − ${r1} = ${r2} m.`,
          `V = k(q₁/r₁ + q₂/r₂) = ${formatPhysics3sf(v1, "V")} + (${formatPhysics3sf(v2, "V")}) = ${vStr}.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Calculate the magnitude and state the direction of the resultant electric field at point P.",
        marks: 3,
        targetQuantityKey: "fieldNC",
        expectedAnswer: eStr,
        workingSteps: [
          "Use vector superposition E_x = kq₁/r₁² + kq₂/r₂² (right positive).",
          `Resultant E = ${eStr}.`,
        ],
      },
    ],
    workedSolution: `(a) Scalar potential V = k(q₁/${r1} + q₂/${r2}) = ${vStr}. (b) Vector electric field E = ${eStr}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Applies signed scalar sum V = k(q₁/r₁ + q₂/r₂).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains V = ${vStr} (including sign if negative).`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Uses inverse-square magnitudes at r₁ = ${r1} m and r₂ = ${r2} m.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Combines the two collinear field vectors with proper directions.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${eStr}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
    generatorModel,
  };
}

function buildDipoleZeroPotentialNonzeroFieldItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  // Exact zero-potential points: probe = sep * |q1| / (|q1| + |q2|) with exact IEEE-754 cancellation
  const paramTable: ReadonlyArray<[number, number, number, number]> = [
    [4, -4, 0.4, 0.2],
    [-6, 6, 0.6, 0.3],
    [3, -6, 0.6, 0.2],
    [-2, 6, 0.8, 0.2],
    [5, -5, 0.5, 0.25],
    [2, -8, 0.5, 0.1],
    [-9, 3, 0.8, 0.6],
    [6, -12, 0.9, 0.3],
    [-4, 12, 0.8, 0.2],
    [8, -8, 0.8, 0.4],
    [3, -9, 0.8, 0.2],
    [-5, 15, 1.0, 0.25],
    [9, -9, 0.6, 0.3],
    [4, -16, 1.0, 0.2],
    [-8, 4, 0.6, 0.4],
    [10, -10, 1.0, 0.5],
    [6, -18, 0.8, 0.2],
    [-3, 3, 0.3, 0.15],
    [12, -4, 0.8, 0.6],
    [-7, 7, 0.7, 0.35],
    [5, -15, 0.8, 0.2],
  ];
  const [q1, q2, sep, probe] = pickCycle(paramTable, variantIdx);
  const scenarioSpec = {
    kind: "collinear-charges",
    chargesNC: [q1, q2],
    separationM: sep,
    probeM: probe,
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const fieldNC = Number(solved.quantities.fieldNC);
  const dirWord: "right" | "left" = fieldNC >= 0 ? "right" : "left";
  const oppDir: "right" | "left" = dirWord === "right" ? "left" : "right";

  const r1 = probe;
  const r2 = roundClean(sep - probe);
  const e1Mag = (COULOMB_CONSTANT * Math.abs(q1) * 1e-9) / r1 ** 2;
  const e2Mag = (COULOMB_CONSTANT * Math.abs(q2) * 1e-9) / r2 ** 2;

  const difficulty = chooseDifficulty(variantIdx + 3);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);
  const ctx = pickCycle(POINT_CHARGE_CONTEXTS, variantIdx + 11);
  const pClause = pickCycle(POTENTIAL_ZERO_CLAUSES, variantIdx + 2);

  const geomPool: readonly string[] = [
    `opposite point charges ${formatSignedChargeNC(q1)} (left) and ${formatSignedChargeNC(q2)} (right) are fixed ${sep} m apart. Point P lies on the connecting axis ${probe} m from ${formatSignedChargeNC(q1)}, where the scalar electric potential vanishes.`,
    `fixed charges ${formatSignedChargeNC(q1)} at x = 0 and ${formatSignedChargeNC(q2)} at x = ${sep} m establish a zero-potential point P on the axis at x = ${probe} m.`,
    `two opposite-sign sources of ${formatSignedChargeNC(q1)} on the left and ${formatSignedChargeNC(q2)} on the right have separation ${sep} m; axial point P is situated ${probe} m from ${formatSignedChargeNC(q1)}.`,
    `along the ${sep} m line segment between ${formatSignedChargeNC(q1)} (left) and ${formatSignedChargeNC(q2)} (right), point P sits ${probe} m from the left source.`,
  ];
  const geom = pickCycle(geomPool, variantIdx);

  if (format === "mcq") {
    const stem = `${ctx}, ${geom} ${pClause} Although the electric potential at P is zero, what is the resultant electric field at P?`;
    const correctText = `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${dirWord}`;
    const singleOrDiff =
      Math.abs(e1Mag - e2Mag) > 0.05 * Math.abs(fieldNC)
        ? Math.abs(e1Mag - e2Mag)
        : e1Mag;

    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: Math.abs(fieldNC),
      isDirectional: true,
      fallbackUnit: "N C⁻¹",
      fallbackDirection: dirWord,
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: "0 N C⁻¹",
          rationale:
            "Confuses zero scalar potential (V = 0) with zero potential gradient, falsely concluding E = 0.",
        },
        {
          text: `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${oppDir}`,
          rationale:
            "Computes the correct non-zero field magnitude at the V = 0 point but reverses the field direction.",
        },
        {
          text: `${formatPhysics3sf(singleOrDiff, "N C⁻¹")} to the ${dirWord}`,
          rationale:
            Math.abs(e1Mag - e2Mag) > 0.05 * Math.abs(fieldNC)
              ? "Subtracts the two field magnitudes instead of adding same-sense vectors between opposite charges."
              : "Includes the electric field contribution of only one charge of the dipole instead of doubling for both charges.",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: ["fieldNC", "potentialV"],
      questionPlan: {
        targetSummary:
          "Evaluate the non-zero electric field vector at the zero-potential locus between opposite charges",
        distractorStrategy: [
          "assuming-zero-potential-implies-zero-electric-field",
          "reversing-dipole-interior-field-sense",
          "omitting-second-charge-or-subtracting-same-sense-fields",
        ],
      },
      targetQuantityKey: "fieldNC",
      stem,
      options,
      workedSolution: `Even though V = kq₁/r₁ + kq₂/r₂ = 0 at P, the potential gradient dV/dx is non-zero because both opposite charges drive a positive test charge to the ${dirWord}: E = ${formatPhysics3sf(e1Mag, "N C⁻¹")} + ${formatPhysics3sf(e2Mag, "N C⁻¹")} = ${correctText} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Recognizes E != 0 when V = 0 and sums collinear contributions to obtain ${correctText} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const eAns = `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${dirWord}`;

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: ["fieldNC", "potentialV"],
    questionPlan: {
      targetSummary:
        "Verify vanishing scalar electric potential at P and calculate the non-zero resultant electric field at P",
      subpartStrategy: [
        "verify signed scalar potentials cancel at P",
        "calculate non-zero reinforcing electric field vector at P",
      ],
    },
    stem: `${ctx}, ${geom} ${pClause}`,
    parts: [
      {
        partId: "a",
        prompt:
          "Calculate the electric potential at point P to verify that it is zero.",
        marks: 2,
        targetQuantityKey: "potentialV",
        expectedAnswer: "0 V",
        workingSteps: [
          `r₁ = ${r1} m and r₂ = ${sep} − ${r1} = ${r2} m.`,
          `V = k(${q1} × 10⁻⁹ / ${r1} + (${q2} × 10⁻⁹) / ${r2}) = 0 V.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Calculate the magnitude and state the direction of the resultant electric field at point P.",
        marks: 3,
        targetQuantityKey: "fieldNC",
        expectedAnswer: eAns,
        workingSteps: [
          `Both opposite-sign charges produce fields pointing to the ${dirWord} at P.`,
          `|E| = ${formatPhysics3sf(e1Mag, "N C⁻¹")} + ${formatPhysics3sf(e2Mag, "N C⁻¹")} = ${eAns}.`,
        ],
      },
    ],
    workedSolution: `(a) V = k(${q1} × 10⁻⁹/${r1} + ${q2} × 10⁻⁹/${r2}) = 0 V. (b) At P both fields point to the ${dirWord}, giving E = ${formatPhysics3sf(e1Mag, "N C⁻¹")} + ${formatPhysics3sf(e2Mag, "N C⁻¹")} = ${eAns}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Substitutes signed charges with r₁ = ${r1} m and r₂ = ${r2} m into V = k(q₁/r₁ + q₂/r₂).`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: "Obtains V = 0 V.",
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies inverse-square law E = k|q|/r² to both sources.",
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Adds the two collinear field magnitudes.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${eAns}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
    generatorModel,
  };
}

function buildLikeChargesNullFieldPotentialItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  // Choose unequal ratios (1:4, 1:9, 1:16, 2:8, 3:12, etc.) so midpoint potential differs substantially
  const paramTable: ReadonlyArray<[number, number, number]> = [
    [2, 18, 0.8],
    [1, 9, 0.6],
    [3, 27, 0.9],
    [4, 16, 0.6],
    [1, 16, 0.5],
    [2, 8, 0.45],
    [5, 20, 0.9],
    [3, 12, 0.75],
    [6, 24, 0.6],
    [4, 36, 0.8],
    [1, 25, 0.6],
    [9, 1, 0.5],
    [16, 4, 0.75],
    [18, 2, 0.6],
    [27, 3, 1.0],
    [25, 1, 0.9],
    [8, 2, 0.75],
    [12, 3, 0.5],
    [20, 5, 0.6],
    [32, 2, 0.85],
    [16, 1, 0.85],
  ];
  const [q1, q2, sep] = pickCycle(paramTable, variantIdx);
  const scenarioSpec = {
    kind: "null-potential",
    chargesNC: [q1, q2],
    separationM: sep,
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const nullPos = Number(solved.quantities.nullPositionM);
  const potentialV = Number(solved.quantities.potentialV);

  const midpointPot = (COULOMB_CONSTANT * (q1 + q2) * 1e-9) / (sep / 2);
  const fullSepPot = (COULOMB_CONSTANT * (q1 + q2) * 1e-9) / sep;
  const v1 = (COULOMB_CONSTANT * q1 * 1e-9) / nullPos;
  const v2 = (COULOMB_CONSTANT * q2 * 1e-9) / (sep - nullPos);
  const diffPot = Math.abs(v1 - v2);

  const difficulty = chooseDifficulty(variantIdx + 4);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);
  const ctx = pickCycle(POINT_CHARGE_CONTEXTS, variantIdx + 16);
  const pClause = pickCycle(POTENTIAL_ZERO_CLAUSES, variantIdx + 3);

  const geomPool: readonly string[] = [
    `two fixed positive point charges of +${q1} nC (left) and +${q2} nC (right) are held ${sep} m apart.`,
    `positive point sources +${q1} nC at x = 0 and +${q2} nC at x = ${sep} m are mounted along a straight insulating bar.`,
    `stationary charges +${q1} nC (on the left) and +${q2} nC (on the right) sit at separation ${sep} m.`,
    `along a ${sep} m baseline, isolated charges +${q1} nC and +${q2} nC are fixed at the left and right ends respectively.`,
  ];
  const geom = pickCycle(geomPool, variantIdx * 3 + 2);

  if (format === "mcq") {
    const stem = `${ctx}, ${geom} ${pClause} What is the electric potential at the unique point on the line between the charges where the resultant electric field is zero?`;
    const correctText = formatPhysics3sf(potentialV, "V");
    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: potentialV,
      isDirectional: false,
      fallbackUnit: "V",
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: "0 V",
          numericApprox: 0,
          rationale:
            "Falsely assumes that zero electric field strength requires zero scalar electric potential.",
        },
        {
          text: formatPhysics3sf(midpointPot, "V"),
          numericApprox: midpointPot,
          rationale:
            "Evaluates the scalar potential at the geometric midpoint d/2 instead of at the true null-field position.",
        },
        {
          text: formatPhysics3sf(diffPot, "V"),
          numericApprox: diffPot,
          rationale:
            "Subtracts the two positive scalar potential terms instead of adding them.",
        },
        {
          text: formatPhysics3sf(fullSepPot, "V"),
          numericApprox: fullSepPot,
          rationale:
            "Divides (q₁ + q₂) by the full separation d instead of summing kq₁/x + kq₂/(d − x).",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: ["nullPositionM", "potentialV", "fieldNC"],
      questionPlan: {
        targetSummary:
          "Locate the zero-field point between two positive charges and compute the positive scalar electric potential there",
        distractorStrategy: [
          "assuming-zero-field-implies-zero-potential",
          "evaluating-potential-at-midpoint-instead-of-null-point",
          "subtracting-positive-scalar-potentials",
        ],
      },
      targetQuantityKey: "potentialV",
      stem,
      options,
      workedSolution: `Zero field occurs at x = ${sep} × √${q1}/(√${q1} + √${q2}) = ${formatPhysics3sf(nullPos, "m")} from +${q1} nC (and ${formatPhysics3sf(sep - nullPos, "m")} from +${q2} nC). Scalar potentials add: V = k(q₁/x + q₂/(d − x)) = ${correctText} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Finds x = ${formatPhysics3sf(nullPos, "m")} and sums positive scalar potentials to obtain ${correctText} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const xStr = formatPhysics3sf(nullPos, "m");
  const vStr = formatPhysics3sf(potentialV, "V");

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: ["nullPositionM", "potentialV", "fieldNC"],
    questionPlan: {
      targetSummary:
        "Calculate null-field distance, scalar electric potential at the null point, and electric field magnitude there",
      subpartStrategy: [
        "solve inverse-square field cancellation for nullPositionM",
        "sum positive scalar potentials at nullPositionM",
        "state vanishing resultant electric field magnitude at the null point",
      ],
    },
    stem: `${ctx}, ${geom} ${pClause}`,
    parts: [
      {
        partId: "a",
        prompt: `Calculate the distance from the +${q1} nC charge to the point X between the charges where the resultant electric field is zero.`,
        marks: 2,
        targetQuantityKey: "nullPositionM",
        expectedAnswer: xStr,
        workingSteps: [
          `Equate k(${q1})/x² = k(${q2})/(${sep} − x)².`,
          `x = ${sep} × √${q1}/(√${q1} + √${q2}) = ${xStr}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the electric potential at point X.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "potentialV",
        expectedAnswer: vStr,
        workingSteps: [
          `V = k(q₁/x + q₂/(${sep} − x)) = ${formatPhysics3sf(v1, "V")} + ${formatPhysics3sf(v2, "V")}.`,
          `V = ${vStr}.`,
        ],
      },
      {
        partId: "c",
        prompt:
          "State the magnitude of the resultant electric field at X even though the potential there is non-zero.",
        marks: 1,
        targetQuantityKey: "fieldNC",
        expectedAnswer: "0 N C⁻¹",
        workingSteps: [
          "At point X the potential has a local spatial extremum (dV/dx = 0), so E = 0 N C⁻¹.",
        ],
      },
    ],
    workedSolution: `(a) Setting ${q1}/x² = ${q2}/(${sep} − x)² gives x = ${xStr}. (b) Scalar potentials add: V = k(q₁/x + q₂/(d − x)) = ${vStr}. (c) By definition of the null point (zero potential gradient), E = 0 N C⁻¹.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Equates ${q1}/x² = ${q2}/(${sep} − x)².`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains x = ${xStr}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Adds positive scalar potential contributions kq₁/x + kq₂/(d − x).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains V = ${vStr}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: "States 0 N C⁻¹.",
        marks: 1,
      },
    ],
    totalMarks: 5,
    generatorModel,
  };
}

function buildProbePotentialFieldForceItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  const paramTable: ReadonlyArray<[number, number, number, number, number]> = [
    [5, -8, 0.6, 0.2, -3.0],
    [-6, 4, 0.5, 0.2, -2.5],
    [8, 4, 0.6, 0.2, -2.0],
    [3, -10, 0.7, 0.3, -4.0],
    [-9, 5, 0.6, 0.3, 2.0],
    [7, -3, 0.5, 0.2, -3.5],
    [6, 9, 0.6, 0.2, -1.5],
    [-4, 10, 0.6, 0.4, -2.5],
    [12, -5, 0.8, 0.3, -2.0],
    [-8, -4, 0.6, 0.2, 3.0],
    [9, -6, 0.7, 0.3, -1.8],
    [4, 10, 0.7, 0.3, -2.4],
    [-10, 6, 0.8, 0.3, -3.0],
    [6, -14, 0.9, 0.3, 2.5],
    [-5, -9, 0.6, 0.2, 2.0],
    [11, -4, 0.7, 0.3, -2.2],
    [-7, 12, 0.8, 0.5, -1.5],
    [8, -3, 0.5, 0.2, 3.2],
    [5, 11, 0.8, 0.3, -2.6],
    [-12, 5, 0.9, 0.4, -1.6],
    [9, -12, 0.9, 0.3, -2.8],
  ];
  const [q1, q2, sep, probe, qTest] = pickCycle(paramTable, variantIdx);
  const scenarioSpec = {
    kind: "negative-probe",
    chargesNC: [q1, q2],
    separationM: sep,
    probeM: probe,
    testChargeNC: qTest,
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const fieldNC = Number(solved.quantities.fieldNC);
  const potentialV = Number(solved.quantities.potentialV);
  const forceN = Number(solved.quantities.forceN);

  const fieldDir: "right" | "left" = fieldNC >= 0 ? "right" : "left";
  const forceDir: "right" | "left" = forceN >= 0 ? "right" : "left";
  const r1 = probe;
  const r2 = roundClean(sep - probe);
  const v1 = (COULOMB_CONSTANT * q1 * 1e-9) / r1;
  const v2 = (COULOMB_CONSTANT * q2 * 1e-9) / r2;
  const wrongSignPot =
    q1 * q2 < 0 ? Math.abs(v1) + Math.abs(v2) : Math.abs(v1 - v2);

  const difficulty = chooseDifficulty(variantIdx + 5);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);
  const ctx = pickCycle(POINT_CHARGE_CONTEXTS, variantIdx + 18);
  const pClause = pickCycle(POTENTIAL_ZERO_CLAUSES, variantIdx + 4);

  const geomPool: readonly string[] = [
    `fixed source charges ${formatSignedChargeNC(q1)} (left) and ${formatSignedChargeNC(q2)} (right) sit ${sep} m apart, and a test charge of ${formatSignedChargeNC(qTest)} is brought to point P on the connecting line ${probe} m from ${formatSignedChargeNC(q1)}.`,
    `point sources ${formatSignedChargeNC(q1)} at x = 0 and ${formatSignedChargeNC(q2)} at x = ${sep} m remain fixed while a small probe of charge ${formatSignedChargeNC(qTest)} is placed at x = ${probe} m (point P).`,
    `two stationary charges ${formatSignedChargeNC(q1)} (on the left) and ${formatSignedChargeNC(q2)} (on the right) have separation ${sep} m; point P is ${probe} m from the left source and holds a ${formatSignedChargeNC(qTest)} test charge.`,
    `along a ${sep} m axis between ${formatSignedChargeNC(q1)} on the left and ${formatSignedChargeNC(q2)} on the right, a ${formatSignedChargeNC(qTest)} probe particle rests momentarily at point P (${probe} m from ${formatSignedChargeNC(q1)}).`,
  ];
  const geom = pickCycle(geomPool, variantIdx * 2 + 1);

  if (format === "mcq") {
    const stem = `${ctx}, ${geom} ${pClause} What is the electric potential at P due to the two fixed source charges?`;
    const correctText = formatPhysics3sf(potentialV, "V");
    const scaledByTest = potentialV * Math.abs(qTest);
    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: potentialV,
      isDirectional: false,
      fallbackUnit: "V",
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: formatPhysics3sf(wrongSignPot, "V"),
          numericApprox: wrongSignPot,
          rationale:
            "Combines the two source potentials without respecting their algebraic signs.",
        },
        {
          text: formatPhysics3sf(scaledByTest, "V"),
          numericApprox: scaledByTest,
          rationale:
            "Multiplies the electric potential at P by the probe charge magnitude (confusing potential V with potential energy qV).",
        },
        {
          text: formatPhysics3sf(Math.abs(fieldNC), "V"),
          numericApprox: Math.abs(fieldNC),
          rationale:
            "Substitutes 1/r² instead of 1/r, calculating electric field strength rather than electric potential.",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: ["fieldNC", "potentialV", "forceN"],
      questionPlan: {
        targetSummary:
          "Evaluate scalar electric potential at P due to fixed source charges independently of the test charge",
        distractorStrategy: [
          "wrong-algebraic-sign-in-scalar-potential-addition",
          "multiplying-potential-by-probe-charge",
          "using-inverse-square-field-formula-for-potential",
        ],
      },
      targetQuantityKey: "potentialV",
      stem,
      options,
      workedSolution: `Electric potential at P depends only on the source charges: V = k(q₁/${r1} + q₂/${r2}) = ${formatPhysics3sf(v1, "V")} + (${formatPhysics3sf(v2, "V")}) = ${correctText} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates V = k(q₁/${r1} + q₂/${r2}) = ${correctText} (${correctLetter}), independent of q_test.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const eStr = `${formatPhysics3sf(Math.abs(fieldNC), "N C⁻¹")} to the ${fieldDir}`;
  const vStr = formatPhysics3sf(potentialV, "V");
  const fStr = `${formatPhysics3sf(Math.abs(forceN), "N")} to the ${forceDir}`;

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: ["fieldNC", "potentialV", "forceN"],
    questionPlan: {
      targetSummary:
        "Determine electric field, electric potential, and electrostatic force on the probe charge at P",
      subpartStrategy: [
        "compute resultant electric field vector fieldNC at P",
        "compute signed scalar electric potential potentialV at P",
        "compute electrostatic force forceN = q_test E on the probe charge",
      ],
    },
    stem: `${ctx}, ${geom} ${pClause}`,
    parts: [
      {
        partId: "a",
        prompt:
          "Calculate the magnitude and state the direction of the electric field at P due to the two fixed source charges.",
        marks: 2,
        targetQuantityKey: "fieldNC",
        expectedAnswer: eStr,
        workingSteps: [
          `r₁ = ${r1} m, r₂ = ${r2} m.`,
          `Superposing kq₁/r₁² + kq₂/r₂² gives E = ${eStr}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the electric potential at P due to the two fixed source charges.",
        marks: 2,
        targetQuantityKey: "potentialV",
        expectedAnswer: vStr,
        workingSteps: [
          `V = k(q₁/${r1} + q₂/${r2}) = ${formatPhysics3sf(v1, "V")} + (${formatPhysics3sf(v2, "V")}) = ${vStr}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the magnitude and direction of the electrostatic force acting on the ${formatSignedChargeNC(qTest)} test charge at P.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "forceN",
        expectedAnswer: fStr,
        workingSteps: [
          `F = q_test E with q_test = ${qTest} × 10⁻⁹ C.`,
          `F = ${fStr}.`,
        ],
      },
    ],
    workedSolution: `(a) E = ${eStr}. (b) Scalar sum V = k(q₁/${r1} + q₂/${r2}) = ${vStr}. (c) Force on probe F = q_test E = ${fStr}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Applies vector superposition E_x = kq₁/r₁² + kq₂/r₂².",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains ${eStr}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Sums signed scalar potentials k(q₁/r₁ + q₂/r₂).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${vStr}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Uses F = q_test E with correct sign/direction.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains ${fStr}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

function buildEquipotentialWorkItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  // [potentialsV, spacingM, chargeC]
  const paramTable: ReadonlyArray<[[number, number, number], number, number]> = [
    [[180, 100, 20], 0.04, 2.5e-8],
    [[-40, 60, 160], 0.05, 3.0e-8],
    [[300, 180, 60], 0.03, -4.0e-8],
    [[120, 0, -120], 0.06, 5.0e-9],
    [[-150, -50, 50], 0.04, -2.0e-8],
    [[250, 150, 50], 0.025, 6.0e-9],
    [[80, -20, -120], 0.05, -3.5e-8],
    [[400, 220, 40], 0.06, 1.5e-8],
    [[-80, 40, 160], 0.03, 4.5e-9],
    [[220, 100, -20], 0.04, -2.5e-8],
    [[150, 60, -30], 0.03, 8.0e-9],
    [[-200, -80, 40], 0.08, 3.0e-8],
    [[360, 200, 40], 0.05, -1.25e-8],
    [[90, 10, -70], 0.02, 7.5e-9],
    [[-60, 80, 220], 0.07, -2.0e-8],
    [[280, 140, 0], 0.035, 3.5e-8],
    [[140, 20, -100], 0.04, -5.0e-9],
    [[-120, 20, 160], 0.05, 2.5e-8],
    [[320, 180, 40], 0.04, 4.0e-9],
    [[60, -60, -180], 0.06, -1.5e-8],
    [[-100, 50, 200], 0.05, 6.0e-9],
  ];
  const [pots, spacing, chargeC] = pickCycle(paramTable, variantIdx);
  const scenarioSpec = {
    kind: "field-work",
    potentialsV: pots,
    spacingM: spacing,
    chargeC,
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const workJ = Number(solved.quantities.workJ);
  const deltaPotentialJ = Number(solved.quantities.deltaPotentialJ);

  const singleStepMag = Math.abs(chargeC * (pots[0] - pots[1]));
  const forceMistake = workJ / (2 * spacing);

  const difficulty = chooseDifficulty(variantIdx);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);
  const open = pickCycle(EQUIPOTENTIAL_CONTEXTS, variantIdx);
  const qFormatted = `${chargeC >= 0 ? "+" : ""}${formatGivenPlain(chargeC, "C")}`;

  const bodyPool: readonly string[] = [
    `at ${pots[0]} V (left), ${pots[1]} V (middle), and ${pots[2]} V (right), with adjacent lines separated by ${spacing} m. A particle of charge ${qFormatted} moves from the ${pots[0]} V line to the ${pots[2]} V line.`,
    `labelled from left to right as ${pots[0]} V, ${pots[1]} V, and ${pots[2]} V with uniform spacing ${spacing} m between neighbouring surfaces. A test charge of ${qFormatted} is displaced from the leftmost surface (${pots[0]} V) to the rightmost surface (${pots[2]} V).`,
    `having potentials ${pots[0]} V, ${pots[1]} V, and ${pots[2]} V from left to right and inter-line spacing ${spacing} m. A small carrier of charge ${qFormatted} travels from the ${pots[0]} V equipotential to the ${pots[2]} V equipotential.`,
  ];
  const body = pickCycle(bodyPool, variantIdx * 2);

  if (format === "mcq") {
    const askFieldWork = variantIdx % 2 === 0;
    const targetKey = askFieldWork ? "workJ" : "deltaPotentialJ";
    const targetVal = askFieldWork ? workJ : deltaPotentialJ;
    const questionSentence = askFieldWork
      ? "What signed work does the electric field do on the charge?"
      : "What is the signed change in electrostatic potential energy ΔE_p of the charge?";

    const stem = `${open} ${body} ${questionSentence}`;
    const correctText = formatPhysics3sf(targetVal, "J");
    const halfSigned = 0.5 * targetVal;
    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: targetVal,
      isDirectional: false,
      fallbackUnit: "J",
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: formatPhysics3sf(-targetVal, "J"),
          numericApprox: -targetVal,
          rationale: askFieldWork
            ? "Computes ΔE_p = q(V_final − V_initial) instead of work done by the electric field W_field = −qΔV = q(V_initial − V_final)."
            : "Computes work done by the electric field q(V_initial − V_final) instead of potential energy change ΔE_p = q(V_final − V_initial).",
        },
        {
          text: formatPhysics3sf(halfSigned, "J"),
          numericApprox: halfSigned,
          rationale:
            "Uses the potential step across only one adjacent interval instead of the full transition from leftmost to rightmost equipotential.",
        },
        {
          text: formatPhysics3sf(askFieldWork ? forceMistake : -forceMistake, "J"),
          numericApprox: askFieldWork ? forceMistake : -forceMistake,
          rationale:
            "Divides qΔV by total displacement 2d, evaluating electrostatic force rather than energy/work.",
        },
        {
          text: formatPhysics3sf(-singleStepMag, "J"),
          numericApprox: -singleStepMag,
          rationale:
            "Combines a single-interval voltage step with an inverted sign convention.",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: ["workJ", "deltaPotentialJ"],
      questionPlan: {
        targetSummary: askFieldWork
          ? "Evaluate signed work done by the electric field W = q(V_initial - V_final) across equipotential lines"
          : "Evaluate signed electrostatic potential energy change dEp = q(V_final - V_initial) across equipotential lines",
        distractorStrategy: [
          "inverting-field-work-versus-potential-energy-sign",
          "using-single-interval-potential-step-instead-of-two-intervals",
          "dividing-energy-by-equipotential-spacing",
        ],
      },
      targetQuantityKey: targetKey,
      stem,
      options,
      workedSolution: askFieldWork
        ? `Work done by the electric field is W_field = q(V_initial − V_final) = (${qFormatted})(${pots[0]} − (${pots[2]})) = ${correctText} (${correctLetter}).`
        : `Change in electric potential energy is ΔE_p = q(V_final − V_initial) = (${qFormatted})(${pots[2]} − (${pots[0]})) = ${correctText} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates ${askFieldWork ? "W_field = q(V_i − V_f)" : "ΔE_p = q(V_f − V_i)"} = ${correctText} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const dEpStr = formatPhysics3sf(deltaPotentialJ, "J");
  const wStr = formatPhysics3sf(workJ, "J");

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: ["workJ", "deltaPotentialJ"],
    questionPlan: {
      targetSummary:
        "Calculate signed electrostatic potential energy change dEp and signed work done by the electric field across equipotentials",
      subpartStrategy: [
        "compute signed potential energy change deltaPotentialJ = q(V_f - V_i)",
        "deduce signed field work workJ = -deltaPotentialJ",
      ],
    },
    stem: `${open} ${body}`,
    parts: [
      {
        partId: "a",
        prompt: `Calculate the signed change in electrostatic potential energy ΔE_p of the charge between the ${pots[0]} V line and the ${pots[2]} V line.`,
        marks: 2,
        targetQuantityKey: "deltaPotentialJ",
        expectedAnswer: dEpStr,
        workingSteps: [
          `ΔV = V_final − V_initial = ${pots[2]} − (${pots[0]}) = ${pots[2] - pots[0]} V.`,
          `ΔE_p = qΔV = (${qFormatted})(${pots[2] - pots[0]} V) = ${dEpStr}.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Hence state or calculate the signed work done by the electric field on the charge during this displacement.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "workJ",
        expectedAnswer: wStr,
        workingSteps: [
          `W_field = −ΔE_p = q(V_initial − V_final) = ${wStr}.`,
        ],
      },
    ],
    workedSolution: `(a) ΔE_p = q(V_f − V_i) = (${qFormatted})(${pots[2]} − (${pots[0]})) = ${dEpStr}. (b) W_field = −ΔE_p = ${wStr}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Uses ΔE_p = q(V_final − V_initial) with ΔV = ${pots[2] - pots[0]} V.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains ΔE_p = ${dEpStr} (with correct sign).`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies W_field = −ΔE_p = q(V_initial − V_final).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains W_field = ${wStr} (with correct sign).`,
        marks: 1,
      },
    ],
    totalMarks: 4,
    generatorModel,
  };
}

function buildGuidedBeadKinematicsItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  // [potentialsV (V0 > V1 > V2, uniform step), spacingM, chargeC, massKg]
  const paramTable: ReadonlyArray<[[number, number, number], number, number, number]> = [
    [[240, 140, 40], 0.05, 4.0e-8, 2.0e-5],
    [[300, 180, 60], 0.04, 2.5e-8, 1.5e-5],
    [[180, 100, 20], 0.02, 1.6e-15, 3.2e-13],
    [[400, 250, 100], 0.03, 3.0e-8, 5.0e-5],
    [[500, 300, 100], 0.05, 8.0e-16, 1.6e-13],
    [[160, 90, 20], 0.035, 5.0e-8, 3.5e-5],
    [[360, 210, 60], 0.06, 6.0e-8, 4.5e-5],
    [[220, 120, 20], 0.025, 1.2e-15, 2.4e-13],
    [[450, 270, 90], 0.045, 2.0e-8, 1.8e-5],
    [[280, 160, 40], 0.03, 4.5e-8, 2.7e-5],
    [[600, 350, 100], 0.05, 1.6e-15, 4.0e-13],
    [[150, 90, 30], 0.02, 3.2e-8, 1.6e-5],
    [[320, 190, 60], 0.065, 5.0e-8, 2.6e-5],
    [[260, 150, 40], 0.055, 4.0e-8, 2.2e-5],
    [[480, 280, 80], 0.04, 2.4e-15, 4.8e-13],
    [[200, 110, 20], 0.03, 3.0e-8, 1.5e-5],
    [[420, 240, 60], 0.06, 5.0e-8, 3.0e-5],
    [[340, 200, 60], 0.035, 2.0e-8, 1.4e-5],
    [[540, 320, 100], 0.055, 3.2e-15, 6.4e-13],
    [[190, 110, 30], 0.04, 6.0e-8, 2.4e-5],
    [[380, 220, 60], 0.04, 2.5e-8, 2.0e-5],
  ];
  const [pots, spacing, q, m] = pickCycle(paramTable, variantIdx);
  const scenarioSpec = {
    kind: "guided-bead",
    potentialsV: pots,
    spacingM: spacing,
    chargeC: q,
    massKg: m,
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const fieldNC = Number(solved.quantities.fieldNC);
  const accelerationMs2 = Number(solved.quantities.accelerationMs2);
  const finalSpeedMs = Number(solved.quantities.finalSpeedMs);

  const stepV = pots[1] - pots[2];
  const carrierName = m < 1e-10 ? "Millikan oil micro-droplet" : "charged dielectric bead";

  const difficulty = chooseDifficulty(variantIdx + 1);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);
  const open = pickCycle(EQUIPOTENTIAL_CONTEXTS, variantIdx + 4);

  const bodyPool: readonly string[] = [
    `at ${pots[0]} V (left), ${pots[1]} V (middle), and ${pots[2]} V (right), with adjacent lines spaced ${spacing} m apart. A ${carrierName} of mass ${formatGivenPlain(m, "kg")} and charge +${formatGivenPlain(q, "C")} starts from rest on the middle ${pots[1]} V line and moves frictionlessly horizontally to the ${pots[2]} V line.`,
    `labelled ${pots[0]} V, ${pots[1]} V, and ${pots[2]} V from left to right at uniform spacing ${spacing} m. Released from rest on the ${pots[1]} V middle equipotential, a ${carrierName} (m = ${formatGivenPlain(m, "kg")}, q = +${formatGivenPlain(q, "C")}) accelerates horizontally across one spacing to the ${pots[2]} V line.`,
    `with potentials ${pots[0]} V, ${pots[1]} V, and ${pots[2]} V from left to right separated by ${spacing} m between neighbouring lines. A ${carrierName} carrying +${formatGivenPlain(q, "C")} and mass ${formatGivenPlain(m, "kg")} is released at rest on the ${pots[1]} V line along a horizontal frictionless axis.`,
  ];
  const body = pickCycle(bodyPool, variantIdx);

  if (format === "mcq") {
    const mode = variantIdx % 3;
    if (mode === 0) {
      const stem = `${open} ${body} What is the magnitude and direction of the uniform electric field?`;
      const correctText = `${formatPhysics3sf(fieldNC, "V m⁻¹")} to the right`;
      const { options, correctLetter } = finalizeMcqOptions({
        correctText,
        correctNumeric: fieldNC,
        isDirectional: true,
        fallbackUnit: "V m⁻¹",
        fallbackDirection: "right",
        rotationSeed: seed + variantIdx,
        candidates: [
          {
            text: `${formatPhysics3sf(fieldNC, "V m⁻¹")} to the left`,
            rationale:
              "Points the electric field toward increasing potential rather than toward decreasing potential (E = −dV/dx).",
          },
          {
            text: `${formatPhysics3sf(2 * fieldNC, "V m⁻¹")} to the right`,
            rationale:
              "Divides the two-interval potential difference (V₀ − V₂) by a single spacing s instead of 2s.",
          },
          {
            text: `${formatPhysics3sf(pots[1] / spacing, "V m⁻¹")} to the right`,
            rationale:
              "Divides the absolute potential V₁ by spacing s instead of using the potential difference (V₁ − V₂).",
          },
        ],
      });

      return {
        id,
        conceptId: arch.conceptId,
        templateArchetype: arch.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "fields",
        scenarioSpec,
        hiddenQuantities: ["fieldNC", "accelerationMs2", "finalSpeedMs"],
        questionPlan: {
          targetSummary:
            "Determine uniform electric field magnitude and direction from parallel equipotential gradient E = -dV/dx",
          distractorStrategy: [
            "pointing-field-toward-higher-potential",
            "dividing-two-step-voltage-by-single-step-spacing",
            "using-potential-value-instead-of-potential-difference",
          ],
        },
        targetQuantityKey: "fieldNC",
        stem,
        options,
        workedSolution: `Electric field points toward decreasing potential (to the right) with magnitude E = |ΔV|/s = (${pots[1]} − ${pots[2]}) / ${spacing} = ${correctText} (${correctLetter}).`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses E = −ΔV/Δx to obtain ${correctText} (${correctLetter}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (mode === 1) {
      const stem = `${open} ${body} What is the magnitude of the horizontal electrostatic acceleration of the ${carrierName}?`;
      const correctText = formatPhysics3sf(accelerationMs2, "m s⁻²");
      const { options, correctLetter } = finalizeMcqOptions({
        correctText,
        correctNumeric: accelerationMs2,
        isDirectional: false,
        fallbackUnit: "m s⁻²",
        rotationSeed: seed + variantIdx,
        candidates: [
          {
            text: formatPhysics3sf(2 * accelerationMs2, "m s⁻²"),
            numericApprox: 2 * accelerationMs2,
            rationale:
              "Uses (V₀ − V₂)/s instead of (V₁ − V₂)/s for the electric field strength.",
          },
          {
            text: formatPhysics3sf((q * stepV) / m, "m s⁻²"),
            numericApprox: (q * stepV) / m,
            rationale:
              "Omits dividing by the equipotential spacing s when finding force F = qΔV/s.",
          },
          {
            text: formatPhysics3sf((q * pots[1]) / (m * spacing), "m s⁻²"),
            numericApprox: (q * pots[1]) / (m * spacing),
            rationale:
              "Substitutes V₁ instead of the potential drop (V₁ − V₂) across the interval.",
          },
        ],
      });

      return {
        id,
        conceptId: arch.conceptId,
        templateArchetype: arch.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "fields",
        scenarioSpec,
        hiddenQuantities: ["fieldNC", "accelerationMs2", "finalSpeedMs"],
        questionPlan: {
          targetSummary:
            "Calculate electrostatic acceleration a = qE/m from parallel equipotential gradient",
          distractorStrategy: [
            "doubling-field-from-outer-potential-span",
            "omitting-spacing-in-potential-gradient",
            "using-single-line-potential-instead-of-potential-difference",
          ],
        },
        targetQuantityKey: "accelerationMs2",
        stem,
        options,
        workedSolution: `E = (${pots[1]} − ${pots[2]}) / ${spacing} = ${formatPhysics3sf(fieldNC, "V m⁻¹")}, so a = qE / m = ${correctText} (${correctLetter}).`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds E = ${formatPhysics3sf(fieldNC, "V m⁻¹")} and a = qE/m = ${correctText} (${correctLetter}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${open} ${body} What speed does the ${carrierName} reach at the ${pots[2]} V equipotential line?`;
    const correctText = formatPhysics3sf(finalSpeedMs, "m s⁻¹");
    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: finalSpeedMs,
      isDirectional: false,
      fallbackUnit: "m s⁻¹",
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: formatPhysics3sf(finalSpeedMs / Math.SQRT2, "m s⁻¹"),
          numericApprox: finalSpeedMs / Math.SQRT2,
          rationale:
            "Omits the factor of 2 in v = √(2qΔV / m) when equating ½mv² = qΔV.",
        },
        {
          text: formatPhysics3sf(finalSpeedMs * Math.SQRT2, "m s⁻¹"),
          numericApprox: finalSpeedMs * Math.SQRT2,
          rationale:
            "Uses the full two-line span (V₀ − V₂) instead of (V₁ − V₂) for motion starting on the middle line.",
        },
        {
          text: formatPhysics3sf(Math.sqrt((2 * q * pots[1]) / m), "m s⁻¹"),
          numericApprox: Math.sqrt((2 * q * pots[1]) / m),
          rationale:
            "Uses V₁ rather than the potential difference (V₁ − V₂) between start and finish lines.",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: ["fieldNC", "accelerationMs2", "finalSpeedMs"],
      questionPlan: {
        targetSummary:
          "Calculate arrival speed gained across adjacent equipotential surfaces from energy conservation",
        distractorStrategy: [
          "omitting-factor-of-two-in-speed-formula",
          "using-two-step-potential-drop-from-leftmost-line",
          "ignoring-nonzero-final-equipotential-value",
        ],
      },
      targetQuantityKey: "finalSpeedMs",
      stem,
      options,
      workedSolution: `Across ΔV = ${pots[1]} − ${pots[2]} = ${stepV} V, ½mv² = qΔV gives v = √(2 × ${formatGivenPlain(q)} × ${stepV} / ${formatGivenPlain(m)}) = ${correctText} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Applies ½mv² = q(V₁ − V₂) with ΔV = ${stepV} V to obtain ${correctText} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const eAns = `${formatPhysics3sf(fieldNC, "V m⁻¹")} to the right`;
  const aAns = formatPhysics3sf(accelerationMs2, "m s⁻²");
  const vAns = formatPhysics3sf(finalSpeedMs, "m s⁻¹");

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: ["fieldNC", "accelerationMs2", "finalSpeedMs"],
    questionPlan: {
      targetSummary:
        "Extract uniform electric field from equipotentials, compute electrostatic acceleration, and determine arrival speed",
      subpartStrategy: [
        "compute electric field magnitude and direction from potential gradient",
        "compute electrostatic acceleration from force-to-mass ratio",
        "compute arrival speed from kinetic energy gain across adjacent lines",
      ],
    },
    stem: `${open} ${body}`,
    parts: [
      {
        partId: "a",
        prompt:
          "Determine the magnitude and direction of the uniform electric field.",
        marks: 2,
        targetQuantityKey: "fieldNC",
        expectedAnswer: eAns,
        workingSteps: [
          `E = (V₁ − V₂) / s = (${pots[1]} − ${pots[2]}) / ${spacing} = ${formatPhysics3sf(fieldNC, "V m⁻¹")}.`,
          "Field points toward lower potential, to the right.",
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the magnitude of the horizontal acceleration of the ${carrierName}.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "accelerationMs2",
        expectedAnswer: aAns,
        workingSteps: [
          `a = qE / m = (${formatGivenPlain(q, "C")} × ${formatPhysics3sf(fieldNC, "V m⁻¹")}) / ${formatGivenPlain(m, "kg")} = ${aAns}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Calculate the speed of the ${carrierName} when it reaches the ${pots[2]} V equipotential line.`,
        marks: 2,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "finalSpeedMs",
        expectedAnswer: vAns,
        workingSteps: [
          `½mv² = q(V₁ − V₂) with V₁ − V₂ = ${stepV} V.`,
          `v = √(2qΔV / m) = ${vAns}.`,
        ],
      },
    ],
    workedSolution: `(a) E = (${pots[1]} − ${pots[2]}) / ${spacing} = ${eAns}. (b) a = qE / m = ${aAns}. (c) Using ½mv² = q(${stepV}), v = ${vAns}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Divides adjacent potential step by spacing s.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains ${eAns}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies a = qE / m.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${aAns}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Equates ½mv² = q(${stepV}) or uses v² = 2as.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains ${vAns}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

function buildCoulombNuclearBarrierItem(
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
): CandidateQuestionInput {
  // [targetElement, Z, projectileName, z (>= 2 so z != 1 makes omitting-z distractor distinct), rMinM]
  const paramTable: ReadonlyArray<[string, number, string, number, number]> = [
    ["gold", 79, "alpha particle", 2, 4.5e-14],
    ["silver", 47, "alpha particle", 2, 3.6e-14],
    ["lead", 82, "alpha particle", 2, 5.0e-14],
    ["copper", 29, "alpha particle", 2, 2.8e-14],
    ["uranium", 92, "alpha particle", 2, 6.0e-14],
    ["aluminium", 13, "alpha particle", 2, 2.5e-14],
    ["gold", 79, "triply charged lithium nucleus", 3, 5.5e-14],
    ["iron", 26, "alpha particle", 2, 3.2e-14],
    ["calcium", 20, "alpha particle", 2, 2.4e-14],
    ["tin", 50, "alpha particle", 2, 4.0e-14],
    ["platinum", 78, "alpha particle", 2, 4.8e-14],
    ["nickel", 28, "triply charged lithium nucleus", 3, 3.5e-14],
    ["bismuth", 83, "alpha particle", 2, 5.2e-14],
    ["silicon", 14, "alpha particle", 2, 2.2e-14],
    ["tungsten", 74, "alpha particle", 2, 4.4e-14],
    ["zinc", 30, "alpha particle", 2, 3.0e-14],
    ["gold", 79, "alpha particle", 2, 3.8e-14],
    ["lead", 82, "triply charged lithium nucleus", 3, 6.4e-14],
    ["titanium", 22, "alpha particle", 2, 2.6e-14],
    ["barium", 56, "alpha particle", 2, 4.2e-14],
    ["thorium", 90, "alpha particle", 2, 5.8e-14],
  ];
  const [targetEl, Z, projName, z, rMin] = pickCycle(paramTable, variantIdx);
  const scenarioSpec = {
    kind: "nuclear-potential",
    sourceChargeUnits: Z,
    probeChargeUnits: z,
    closestApproachM: rMin,
    chargesNC: [Z, z],
  };
  const solved = getDomainAdapter("fields").solveScenario(scenarioSpec);
  const potentialV = Number(solved.quantities.potentialV);
  const barrierJ = Number(solved.quantities.barrierJ);
  const barrierEv = Number(solved.quantities.barrierEv);

  const difficulty = chooseDifficulty(variantIdx + 2);
  const syllabi = buildFieldsSyllabusTags(arch, format, difficulty, variantIdx);
  const ctx = pickCycle(NUCLEAR_CONTEXTS, variantIdx);

  const geomPool: readonly string[] = [
    `a projectile ${projName} of charge +${z}e approaches head-on a stationary ${targetEl} nucleus of atomic number Z = ${Z} (charge +${Z}e) to a distance of closest approach r_min = ${formatGivenPlain(rMin, "m")}.`,
    `a stationary ${targetEl} target nucleus (charge +${Z}e) repels an incoming ${projName} (charge +${z}e) that momentarily comes to rest at separation ${formatGivenPlain(rMin, "m")}.`,
    `an incident ${projName} carrying charge +${z}e reaches a minimum centre-to-centre separation of ${formatGivenPlain(rMin, "m")} from a heavy ${targetEl} nucleus of charge +${Z}e.`,
  ];
  const geom = pickCycle(geomPool, variantIdx * 2);
  const constClause =
    "Take k = 8.99 × 10⁹ N m² C⁻², e = 1.60 × 10⁻¹⁹ C, and zero electric potential at infinity.";

  if (format === "mcq") {
    const askPotential = variantIdx % 2 === 0;
    if (askPotential) {
      const stem = `${ctx}, ${geom} ${constClause} What is the electric potential due to the ${targetEl} nucleus at distance r_min?`;
      const correctText = formatPhysics3sf(potentialV, "V");
      const { options, correctLetter } = finalizeMcqOptions({
        correctText,
        correctNumeric: potentialV,
        isDirectional: false,
        fallbackUnit: "V",
        rotationSeed: seed + variantIdx,
        candidates: [
          {
            text: formatPhysics3sf(z * potentialV, "V"),
            numericApprox: z * potentialV,
            rationale:
              "Multiplies the target nucleus potential by the projectile charge number z.",
          },
          {
            text: formatPhysics3sf((COULOMB_CONSTANT * Z) / rMin, "V"),
            numericApprox: (COULOMB_CONSTANT * Z) / rMin,
            rationale:
              "Substitutes atomic number Z directly in coulombs without multiplying by elementary charge e = 1.60 × 10⁻¹⁹ C.",
          },
          {
            text: formatPhysics3sf(potentialV / rMin, "V"),
            numericApprox: potentialV / rMin,
            rationale:
              "Divides by r_min² instead of r_min, computing radial electric field strength instead of potential.",
          },
        ],
      });

      return {
        id,
        conceptId: arch.conceptId,
        templateArchetype: arch.templateArchetype,
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "fields",
        scenarioSpec,
        hiddenQuantities: [
          "chargesNC",
          "separationM",
          "potentialV",
          "barrierJ",
          "barrierEv",
        ],
        questionPlan: {
          targetSummary:
            "Calculate radial electric potential near a target nucleus at closest approach",
          distractorStrategy: [
            "including-projectile-charge-number-in-source-potential",
            "omitting-elementary-charge-factor",
            "using-inverse-square-field-power-instead-of-inverse-radius",
          ],
        },
        targetQuantityKey: "potentialV",
        stem,
        options,
        workedSolution: `Radial potential of the +${Z}e nucleus is V = kZe / r_min = (8.99 × 10⁹ × ${Z} × 1.60 × 10⁻¹⁹) / (${formatGivenPlain(rMin)}) = ${correctText} (${correctLetter}).`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates V = kZe / r_min = ${correctText} (${correctLetter}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stem = `${ctx}, ${geom} ${constClause} What is the electrostatic potential energy of the system at closest approach, expressed in electronvolts (eV)?`;
    const correctText = formatPhysics3sf(barrierEv, "eV");
    const { options, correctLetter } = finalizeMcqOptions({
      correctText,
      correctNumeric: barrierEv,
      isDirectional: false,
      fallbackUnit: "eV",
      rotationSeed: seed + variantIdx,
      candidates: [
        {
          text: formatPhysics3sf(potentialV, "eV"),
          numericApprox: potentialV,
          rationale:
            "Forgets to multiply the nuclear electric potential V by the projectile charge number z when converting to eV.",
        },
        {
          text: formatPhysics3sf(barrierEv / z ** 2, "eV"),
          numericApprox: barrierEv / z ** 2,
          rationale:
            "Divides instead of multiplying by the projectile charge number z.",
        },
        {
          text: formatPhysics3sf(barrierJ, "eV"),
          numericApprox: barrierJ,
          rationale:
            "Reports the numerical value in joules directly with an eV unit label without dividing by 1.60 × 10⁻¹⁹ J eV⁻¹.",
        },
      ],
    });

    return {
      id,
      conceptId: arch.conceptId,
      templateArchetype: arch.templateArchetype,
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: [
        "chargesNC",
        "separationM",
        "potentialV",
        "barrierJ",
        "barrierEv",
      ],
      questionPlan: {
        targetSummary:
          "Determine Coulomb barrier energy in electronvolts at nuclear closest approach",
        distractorStrategy: [
          "omitting-projectile-charge-multiple-z-in-eV-conversion",
          "dividing-by-z-squared",
          "forgetting-joule-to-electronvolt-conversion",
        ],
      },
      targetQuantityKey: "barrierEv",
      stem,
      options,
      workedSolution: `At r_min, V = kZe / r_min = ${formatPhysics3sf(potentialV, "V")}. For a +${z}e projectile, E_p = ${z}eV = ${correctText} (${correctLetter}).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates V = ${formatPhysics3sf(potentialV, "V")} and E_p = ${z}V (in eV) = ${correctText} (${correctLetter}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  const vStr = formatPhysics3sf(potentialV, "V");
  const jStr = formatPhysics3sf(barrierJ, "J");
  const evStr = formatPhysics3sf(barrierEv, "eV");

  return {
    id,
    conceptId: arch.conceptId,
    templateArchetype: arch.templateArchetype,
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "fields",
    scenarioSpec,
    hiddenQuantities: [
      "chargesNC",
      "separationM",
      "potentialV",
      "barrierJ",
      "barrierEv",
    ],
    questionPlan: {
      targetSummary:
        "Calculate nuclear radial electric potential at closest approach and deduce the Coulomb barrier in joules and electronvolts",
      subpartStrategy: [
        "compute electric potential potentialV = kZe/r_min",
        "compute potential energy barrierJ = ze * potentialV in joules",
        "convert barrierJ to electronvolts barrierEv",
      ],
    },
    stem: `${ctx}, ${geom} ${constClause}`,
    parts: [
      {
        partId: "a",
        prompt: `Calculate the electric potential due to the ${targetEl} nucleus at distance r_min.`,
        marks: 2,
        targetQuantityKey: "potentialV",
        expectedAnswer: vStr,
        workingSteps: [
          `V = kZe / r_min = (8.99 × 10⁹ × ${Z} × 1.60 × 10⁻¹⁹) / (${formatGivenPlain(rMin)}).`,
          `V = ${vStr}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the electrostatic potential energy (in joules) of the ${projName} at closest approach.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "barrierJ",
        expectedAnswer: jStr,
        workingSteps: [
          `E_p = (+${z}e) V = ${z} × 1.60 × 10⁻¹⁹ × ${vStr} = ${jStr}.`,
        ],
      },
      {
        partId: "c",
        prompt: "Express this electrostatic potential energy in electronvolts (eV).",
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "barrierEv",
        expectedAnswer: evStr,
        workingSteps: [
          `E_p (in eV) = E_p (in J) / (1.60 × 10⁻¹⁹ J eV⁻¹) = ${evStr}.`,
        ],
      },
    ],
    workedSolution: `(a) V = kZe / r_min = ${vStr}. (b) E_p = ${z}eV = ${jStr}. (c) Dividing by e = 1.60 × 10⁻¹⁹ J eV⁻¹ gives ${evStr}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Substitutes Q = ${Z}e and r_min = ${formatGivenPlain(rMin, "m")} into V = kQ/r.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains ${vStr}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Multiplies potential from (a) by projectile charge ${z}e.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${jStr}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Divides joule energy by 1.60 × 10⁻¹⁹ J eV⁻¹ (or multiplies V in volts by z).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains ${evStr}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

type ArchetypeItemBuilder = (
  arch: FieldsArchetypeSpec,
  variantIdx: number,
  format: QuestionFormat,
  seed: number,
  id: string,
  generatorModel: string,
) => CandidateQuestionInput;

const BUILDER_BY_ARCHETYPE_INDEX: readonly ArchetypeItemBuilder[] = [
  buildCollinearOppositeInteriorItem,
  buildCollinearLikeSuperpositionItem,
  buildCollinearExteriorPointFieldItem,
  buildSymbolicSuperpositionItem,
  buildThreeChargeForceOnProbeItem,
  buildLikeChargesNullLocationItem,
  buildNullPointChargeRatioItem,
  buildUniformParallelPlatesFieldWorkItem,
  buildParallelPlateIonSpeedItem,
  buildCollinearScalarPotentialItem,
  buildDipoleZeroPotentialNonzeroFieldItem,
  buildLikeChargesNullFieldPotentialItem,
  buildProbePotentialFieldForceItem,
  buildEquipotentialWorkItem,
  buildGuidedBeadKinematicsItem,
  buildCoulombNuclearBarrierItem,
];

function allocateArchetypeQuotas(
  totalCount: number,
  mcqRatio?: number,
): Array<{ mcqCount: number; structuredCount: number }> {
  if (
    totalCount === DEFAULT_FIELDS_TARGET_COUNT &&
    mcqRatio === undefined
  ) {
    return FIELDS_GENERATOR_ARCHETYPES.map((a) => ({
      mcqCount: a.defaultMcqCount,
      structuredCount: a.defaultStructuredCount,
    }));
  }

  const numArch = FIELDS_GENERATOR_ARCHETYPES.length;
  const effectiveRatio = mcqRatio ?? 218 / 336;
  const basePerArch = Math.floor(totalCount / numArch);
  const remainder = totalCount % numArch;

  const quotas: Array<{ mcqCount: number; structuredCount: number }> = [];
  let assignedMcq = 0;
  const targetTotalMcq = Math.round(totalCount * effectiveRatio);

  for (let i = 0; i < numArch; i += 1) {
    const slotTotal = basePerArch + (i < remainder ? 1 : 0);
    const remainingArch = numArch - i;
    const desiredMcqHere =
      i === numArch - 1
        ? Math.max(0, Math.min(slotTotal, targetTotalMcq - assignedMcq))
        : Math.max(
            0,
            Math.min(
              slotTotal,
              Math.round((targetTotalMcq - assignedMcq) / remainingArch),
            ),
          );
    assignedMcq += desiredMcqHere;
    quotas.push({
      mcqCount: desiredMcqHere,
      structuredCount: slotTotal - desiredMcqHere,
    });
  }

  return quotas;
}

/**
 * Deterministically generates solver-verified `fields` candidates + `Qwen/Qwen3.5-9B`
 * distillation scenarios across 16 `(conceptId, templateArchetype)` family groups
 * spanning IB (`SL`/`HL`), UK A-Level (`Y13`), and NCUK (`IFY-S2`).
 */
export function generateFieldsCandidates(
  options: GenerateFieldsCandidatesOptions = {},
): CandidateQuestionInput[] {
  const totalCount = options.count ?? DEFAULT_FIELDS_TARGET_COUNT;
  const baseSeed = options.baseSeed ?? DEFAULT_FIELDS_BASE_SEED;
  const generatorModel =
    options.generatorModel?.trim() || DEFAULT_FIELDS_GENERATOR_MODEL;

  if (!Number.isInteger(totalCount) || totalCount < 1) {
    throw new Error("generateFieldsCandidates count must be a positive integer");
  }
  if (!Number.isInteger(baseSeed) || baseSeed < 0) {
    throw new Error(
      "generateFieldsCandidates baseSeed must be a non-negative integer",
    );
  }
  if (
    options.mcqRatio !== undefined &&
    (!Number.isFinite(options.mcqRatio) ||
      options.mcqRatio < 0 ||
      options.mcqRatio > 1)
  ) {
    throw new Error("mcqRatio must lie in [0, 1]");
  }

  const quotas = allocateArchetypeQuotas(totalCount, options.mcqRatio);
  const candidates: CandidateQuestionInput[] = [];
  let globalSeq = 1;

  for (let archIdx = 0; archIdx < FIELDS_GENERATOR_ARCHETYPES.length; archIdx += 1) {
    const arch = FIELDS_GENERATOR_ARCHETYPES[archIdx];
    const builder = BUILDER_BY_ARCHETYPE_INDEX[archIdx];
    const { mcqCount, structuredCount } = quotas[archIdx];

    for (let mIdx = 0; mIdx < mcqCount; mIdx += 1) {
      const seed = baseSeed + archIdx * 1000 + mIdx + 1;
      const id = `sp-fields-mcq-${String(globalSeq).padStart(4, "0")}`;
      globalSeq += 1;
      candidates.push(builder(arch, mIdx, "mcq", seed, id, generatorModel));
    }

    for (let sIdx = 0; sIdx < structuredCount; sIdx += 1) {
      const variantIdx = mcqCount + sIdx;
      const seed = baseSeed + archIdx * 1000 + 500 + sIdx + 1;
      const id = `sp-fields-struct-${String(globalSeq).padStart(4, "0")}`;
      globalSeq += 1;
      candidates.push(
        builder(arch, variantIdx, "structured", seed, id, generatorModel),
      );
    }
  }

  return candidates;
}
