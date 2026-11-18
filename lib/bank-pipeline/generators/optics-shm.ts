import {
  CrosswalkSyllabusMapping,
  getCompatibleSyllabiForConcept,
} from "@/lib/constants/syllabi";
import {
  KinematicShmSolution,
  KinematicShmSpec,
  MassSpringShmSolution,
  MassSpringShmSpec,
  MultiLayerSlabSolution,
  MultiLayerSlabSpec,
  OpticalFiberSolution,
  OpticalFiberSpec,
  OpticsShmScenarioSpec,
  PlanarRefractionSolution,
  PlanarRefractionSpec,
  SimplePendulumShmSolution,
  SimplePendulumShmSpec,
  solveOpticsShmScenario,
  ThinLensSolution,
  ThinLensSpec,
} from "@/lib/visuals/optics-shm";

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

export interface GenerateOpticsShmCandidatesOptions {
  readonly count?: number;
  readonly baseSeed?: number;
  readonly mcqFraction?: number;
  readonly generatorModel?: string;
}

export interface OpticsShmFamilySpec {
  readonly conceptId:
    | "refraction-snell-tir"
    | "thin-lenses-geometric-optics"
    | "simple-harmonic-motion";
  readonly templateArchetype: string;
  readonly description: string;
}

export const OPTICS_SHM_FAMILY_SPECS: readonly OpticsShmFamilySpec[] = [
  {
    conceptId: "refraction-snell-tir",
    templateArchetype: "planar-snell-wave-speed-wavelength",
    description:
      "Planar Snell refraction across dielectric media with wave-speed and wavelength shifts",
  },
  {
    conceptId: "refraction-snell-tir",
    templateArchetype: "planar-critical-angle-total-internal-reflection",
    description:
      "Critical angle and total internal reflection ray deviation at optically denser boundaries",
  },
  {
    conceptId: "refraction-snell-tir",
    templateArchetype: "multilayer-slab-lateral-displacement",
    description:
      "Multi-layer parallel dielectric slabs, lateral ray displacement, and emergent refraction",
  },
  {
    conceptId: "refraction-snell-tir",
    templateArchetype: "step-index-fiber-core-cladding-tir-wall-angle",
    description:
      "Step-index optical fiber core-cladding critical angle, wall incidence, and cladding leakage",
  },
  {
    conceptId: "refraction-snell-tir",
    templateArchetype: "step-index-fiber-acceptance-angle-aperture",
    description:
      "Step-index optical fiber acceptance cone, numerical aperture, and guided ray path length",
  },
  {
    conceptId: "refraction-snell-tir",
    templateArchetype: "step-index-fiber-modal-dispersion-pulse-delay",
    description:
      "Axial vs grazing multipath transit times and modal dispersion pulse broadening in optical fibers",
  },
  {
    conceptId: "thin-lenses-geometric-optics",
    templateArchetype: "converging-thin-lens-real-image",
    description:
      "Converging thin lens real image formation, linear magnification, dioptre power, and screen separation",
  },
  {
    conceptId: "thin-lenses-geometric-optics",
    templateArchetype: "converging-lens-virtual-magnifier",
    description:
      "Converging thin lens simple magnifier regime (u < f) with upright virtual images",
  },
  {
    conceptId: "thin-lenses-geometric-optics",
    templateArchetype: "diverging-lens-virtual-image-dioptres",
    description:
      "Diverging thin lens negative focal length, optical power in dioptres, and virtual image geometry",
  },
  {
    conceptId: "simple-harmonic-motion",
    templateArchetype: "horizontal-mass-spring-period-stiffness",
    description:
      "Horizontal mass-spring oscillator period, frequency, restoring force, and peak acceleration",
  },
  {
    conceptId: "simple-harmonic-motion",
    templateArchetype: "vertical-mass-spring-equilibrium-oscillation",
    description:
      "Vertical mass-spring static equilibrium extension and simple harmonic oscillation dynamics",
  },
  {
    conceptId: "simple-harmonic-motion",
    templateArchetype: "simple-pendulum-period-gravity-ib",
    description:
      "Small-angle simple pendulum period, frequency, and restoring acceleration under IB gravity (g = 9.8 m s⁻²)",
  },
  {
    conceptId: "simple-harmonic-motion",
    templateArchetype: "simple-pendulum-period-tension-uk",
    description:
      "Small-angle simple pendulum period, peak speed, and lowest-point cord tension (g = 9.81 m s⁻²)",
  },
  {
    conceptId: "simple-harmonic-motion",
    templateArchetype: "shm-defining-acceleration-phase-portrait",
    description:
      "Defining SHM relation a = -ω²x and acceleration-displacement phase-space lines",
  },
  {
    conceptId: "simple-harmonic-motion",
    templateArchetype: "shm-velocity-displacement-phase-ellipse",
    description:
      "SHM phase-ellipse speed v = ±ω√(x₀² - x²) and sinusoidal displacement/velocity kinematics",
  },
  {
    conceptId: "simple-harmonic-motion",
    templateArchetype: "shm-parabolic-energy-exchange-curves",
    description:
      "SHM parabolic kinetic/potential energy exchange, equal-energy displacement, and double-frequency energy oscillation",
  },
] as const;

interface SeededRng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

function createPrng(seed: number): SeededRng {
  let state = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (minInclusive: number, maxInclusive: number): number =>
    minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1));
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)];
  return { next, int, pick };
}

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  "-": "⁻",
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

function toSuperscriptInt(exp: number): string {
  return [...String(Math.trunc(exp))]
    .map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch)
    .join("");
}

function formatSigFigs(value: number, sigFigs = 3): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot format non-finite number: ${String(value)}`);
  }
  if (Math.abs(value) < 1e-12) {
    return "0";
  }
  const abs = Math.abs(value);
  if (abs >= 1e4 || abs < 1e-3) {
    const expStr = value.toExponential(sigFigs - 1);
    const [mantissa, rawExp] = expStr.split("e");
    return `${mantissa} × 10${toSuperscriptInt(Number(rawExp))}`;
  }
  const order = Math.floor(Math.log10(abs));
  const decimals = Math.max(0, sigFigs - 1 - order);
  const fixed = value.toFixed(decimals);
  return Object.is(Number(fixed), -0) ? "0" : fixed;
}

function formatQty(value: number, unit?: string, sigFigs = 3): string {
  const numStr = formatSigFigs(value, sigFigs);
  if (!unit) return numStr;
  if (unit === "°") return `${numStr}°`;
  return `${numStr} ${unit}`;
}

interface DistractorCandidate {
  readonly value: number;
  readonly rationale: string;
}

function buildNumericMcqOptions(params: {
  truth: number;
  unit?: string;
  distractors: readonly DistractorCandidate[];
  rng: SeededRng;
}): McqOptionItem[] {
  const { truth, unit, distractors, rng } = params;
  const correctText = formatQty(truth, unit, 3);
  const usedEquivKeys = new Set<string>([buildOptionEquivalenceKey(correctText)]);
  const chosenDistractors: Array<{
    numericSortKey: number;
    text: string;
    isCorrect: false;
    distractorRationale: string;
  }> = [];

  for (const d of distractors) {
    if (!Number.isFinite(d.value)) continue;
    if (
      numbersAgreeWithinTolerance(d.value, truth, {
        significantFigures: 3,
        relativeTolerance: 0.012,
      })
    ) {
      continue;
    }
    const text = formatQty(d.value, unit, 3);
    const equivKey = buildOptionEquivalenceKey(text);
    if (usedEquivKeys.has(equivKey)) continue;
    const tooCloseToChosen = chosenDistractors.some((prev) =>
      numbersAgreeWithinTolerance(d.value, prev.numericSortKey, {
        significantFigures: 3,
        relativeTolerance: 0.012,
      }),
    );
    if (tooCloseToChosen) continue;

    usedEquivKeys.add(equivKey);
    chosenDistractors.push({
      numericSortKey: d.value,
      text,
      isCorrect: false,
      distractorRationale: d.rationale,
    });
    if (chosenDistractors.length === 3) break;
  }

  // Fallback synthetic scaling distractors only if fewer than 3 distinct distractors survived
  const fallbackMultipliers: ReadonlyArray<{ factor: number; rationale: string }> = [
    {
      factor: 0.5,
      rationale: "Introduces an extraneous factor of one-half during algebraic rearrangement.",
    },
    {
      factor: 2.0,
      rationale: "Doubles the target quantity through a factor-of-two substitution slip.",
    },
    {
      factor: 1.41421356,
      rationale: "Multiplies by √2 through an incorrect root-mean-square or geometric projection factor.",
    },
    {
      factor: 0.25,
      rationale: "Applies an extra factor of one-quarter when squaring a halved quantity.",
    },
    {
      factor: 3.14159265,
      rationale: "Multiplies by an uncancelled factor of π during unit or angular conversion.",
    },
  ];

  for (const fb of fallbackMultipliers) {
    if (chosenDistractors.length === 3) break;
    const candidateVal =
      Math.abs(truth) > 1e-9 ? truth * fb.factor : fb.factor;
    const text = formatQty(candidateVal, unit, 3);
    const equivKey = buildOptionEquivalenceKey(text);
    if (usedEquivKeys.has(equivKey)) continue;
    if (
      numbersAgreeWithinTolerance(candidateVal, truth, {
        significantFigures: 3,
        relativeTolerance: 0.012,
      })
    ) {
      continue;
    }
    usedEquivKeys.add(equivKey);
    chosenDistractors.push({
      numericSortKey: candidateVal,
      text,
      isCorrect: false,
      distractorRationale: fb.rationale,
    });
  }

  const rawEntries: Array<{
    numericSortKey: number;
    text: string;
    isCorrect: boolean;
    distractorRationale?: string;
  }> = [
    { numericSortKey: truth, text: correctText, isCorrect: true },
    ...chosenDistractors,
  ];

  // Order ascending, descending, or deterministic Fisher-Yates shuffle for balanced A-D keys
  const orderMode = rng.int(0, 2);
  if (orderMode === 0) {
    rawEntries.sort((a, b) => a.numericSortKey - b.numericSortKey);
  } else if (orderMode === 1) {
    rawEntries.sort((a, b) => b.numericSortKey - a.numericSortKey);
  } else {
    for (let k = rawEntries.length - 1; k > 0; k -= 1) {
      const swapIdx = rng.int(0, k);
      const tmp = rawEntries[k];
      rawEntries[k] = rawEntries[swapIdx];
      rawEntries[swapIdx] = tmp;
    }
  }

  return rawEntries.map((entry, idx) => ({
    label: MCQ_OPTION_LABELS[idx],
    text: entry.text,
    isCorrect: entry.isCorrect,
    ...(entry.isCorrect
      ? {}
      : { distractorRationale: entry.distractorRationale }),
  }));
}

interface SyllabusFilterConfig {
  readonly conceptId: OpticsShmFamilySpec["conceptId"];
  readonly rng: SeededRng;
  readonly allowedSyllabi?: ReadonlyArray<"ib" | "alevel" | "ncuk">;
  readonly ibLevelMode?: "both" | "hl-only";
  readonly thinLensSubtopic?:
    | "alevel-3-9-astrophysics"
    | "alevel-3-10-medical-physics";
}

function selectCompatibleSyllabiTags(
  config: SyllabusFilterConfig,
): SyllabusTag[] {
  const compatible: CrosswalkSyllabusMapping[] = getCompatibleSyllabiForConcept(
    config.conceptId,
  );
  const allowedSet = config.allowedSyllabi
    ? new Set(config.allowedSyllabi)
    : null;
  const tags: SyllabusTag[] = [];

  for (const mapping of compatible) {
    if (allowedSet && !allowedSet.has(mapping.syllabus)) {
      continue;
    }
    const topicId = mapping.topicIds[0];
    if (!topicId) continue;

    if (mapping.syllabus === "ib") {
      const candidateLevels =
        config.ibLevelMode === "hl-only"
          ? mapping.levels.filter((lvl) => lvl === "HL")
          : mapping.levels;
      if (candidateLevels.length === 0) continue;
      const chosenLevel = config.rng.pick(candidateLevels);
      tags.push({
        syllabus: "ib",
        level: chosenLevel,
        topicId,
        subtopicId: mapping.subtopicIds[0],
      });
    } else if (mapping.syllabus === "alevel") {
      const chosenLevel = config.rng.pick(mapping.levels);
      const subtopicId =
        config.conceptId === "thin-lenses-geometric-optics" &&
        config.thinLensSubtopic &&
        mapping.subtopicIds.includes(config.thinLensSubtopic)
          ? config.thinLensSubtopic
          : mapping.subtopicIds[0];
      tags.push({
        syllabus: "alevel",
        level: chosenLevel,
        topicId,
        subtopicId,
      });
    } else if (mapping.syllabus === "ncuk") {
      const preferredLevel = mapping.levels.includes("IFY")
        ? config.rng.next() < 0.75
          ? "IFY"
          : config.rng.pick(mapping.levels)
        : mapping.levels[0];
      if (!preferredLevel) continue;
      tags.push({
        syllabus: "ncuk",
        level: preferredLevel,
        topicId,
        subtopicId: mapping.subtopicIds[0],
      });
    }
  }

  return tags;
}

function buildDigitFreePlan(params: {
  summary: string;
  format: QuestionFormat;
  strategies: readonly string[];
}): CandidateQuestionPlan {
  // Strip accidental digits so Step-1 propose_scenario never leaks numbers
  const sanitize = (s: string): string => s.replace(/\d+/g, "").replace(/\s+/g, " ").trim();
  if (params.format === "mcq") {
    return {
      targetSummary: sanitize(params.summary),
      distractorStrategy: params.strategies.map(sanitize),
    };
  }
  return {
    targetSummary: sanitize(params.summary),
    subpartStrategy: params.strategies.map(sanitize),
  };
}

interface OpticalMediumEntry {
  readonly name: string;
  readonly proseName: string;
  readonly n: number;
}

const OPTICAL_MEDIA_POOL: readonly OpticalMediumEntry[] = [
  { name: "Air", proseName: "dry air", n: 1.0 },
  { name: "Water", proseName: "distilled water", n: 1.33 },
  { name: "Ethanol", proseName: "liquid ethanol", n: 1.36 },
  { name: "Fused silica", proseName: "fused-silica glass", n: 1.46 },
  { name: "Crown glass", proseName: "optical crown glass", n: 1.52 },
  { name: "Polycarbonate", proseName: "polycarbonate polymer", n: 1.58 },
  { name: "Flint glass", proseName: "dense flint glass", n: 1.65 },
  { name: "Sapphire", proseName: "synthetic sapphire", n: 1.77 },
  { name: "Zircon", proseName: "crystalline zircon", n: 1.92 },
  { name: "Diamond", proseName: "optical diamond", n: 2.42 },
];

const REFRACTION_CONTEXTS = [
  "an undergraduate ray-box bench",
  "a bathymetric laser-ranging tank",
  "a precision Abbe refractometer cell",
  "an immersion-microscopy optical stage",
  "a subsea ROV camera viewport test",
  "a microfluidic refractive-index sensor",
  "a photovoltaic encapsulant test coupon",
  "a gemstone goniometer calibration rig",
  "a submarine periscope window assembly",
  "an interferometric metrology window",
  "a spectrophotometer cuvette wall",
  "an ophthalmic lens-blank inspection jig",
  "a deep-ocean optical hydrophone window",
  "a semiconductor immersion-lithography stage",
  "a planetary lander atmospheric nephelometer",
  "a clinical corneal pachymetry test phantom",
  "an industrial sugar-brix inline refractometer",
] as const;

const FIBER_CONTEXTS = [
  "a transoceanic telecommunications link",
  "a flexible medical gastroscope bundle",
  "a structural-health bridge sensor lead",
  "an industrial laser-welding delivery cable",
  "an avionics fly-by-light data bus",
  "a borehole geophysical telemetry line",
  "a short-reach datacenter patch cord",
  "a tethered deep-sea ROV umbilical waveguide",
  "an astronomical echelle-spectrograph feed",
  "a high-voltage substation optical isolator link",
  "a railway trackside acoustic-sensing fiber",
  "a cryogenic laboratory optical feedthrough",
  "a wind-turbine blade strain-monitoring waveguide",
  "a fusion-chamber diagnostic optical relay",
  "a surgical laser-lithotripsy delivery fiber",
  "an autonomous lidar reference delay spool",
  "a subterranean pipeline temperature-sensing cable",
] as const;

const CONVERGING_LENS_CONTEXTS = [
  "an optical-bench crosswire projection setup",
  "a refracting telescope objective assembly",
  "a forensic macro-photography stage",
  "a precision machine-vision inspection camera",
  "a cinema slide-projector lens mount",
  "a laboratory autocollimator test rail",
  "a metrology profile-projector optical train",
  "a semiconductor wafer-alignment imaging head",
  "a botanical loupe magnifier bench",
  "a museum conservation inspection magnifier",
  "an aerial reconnaissance camera test collimator",
  "a retinal fundus imaging objective rig",
  "a watchmaker's horological inspection stand",
] as const;

const DIVERGING_LENS_CONTEXTS = [
  "a myopia-corrective ophthalmic spectacle trial",
  "a Galilean laser beam-expander input stage",
  "a wide-angle security peephole assembly",
  "an optical-bench virtual-image calibration rig",
  "a compact viewfinder negative-lens element",
  "a clinical optometry phoropter test cell",
  "a pulsed-laser divergence compensator",
  "an underwater dome-port virtual-image corrector",
  "a heads-up display collimating negative element",
  "a precision optical-power dioptre verification bench",
  "an architectural wide-field door viewer",
  "a high-power excimer beam-shaping negative lens",
  "a binocular eyepiece Barlow-style negative group",
] as const;

const MASS_SPRING_CONTEXTS = [
  "a frictionless air-track glider coupled to a calibrated coil spring",
  "a silicon MEMS accelerometer proof-mass flexure test model",
  "a precision marine-chronometer balance-mass rig",
  "a structural vibration-isolation test sled on linear bearings",
  "a spacecraft thruster-valve return-spring test fixture",
  "an inertial seismometer calibration trolley",
  "a robotics compliant-actuator test carriage",
  "a university mechanics oscillation sled",
  "a railway bogie secondary-suspension scale model",
  "a precision gravimeter spring-mass test stage",
  "an acoustic transducer moving-coil suspension rig",
  "a cleanroom nanopositioning flexure stage",
  "an orbital microgravity mass-measurement spring chair",
  "a precision watch hairspring linear test bench",
  "a high-speed pantograph contact-spring test rig",
  "a cryogenic cooler linear-compressor piston assembly",
  "an earthquake shake-table Tuned spring sled",
] as const;

const PENDULUM_CONTEXTS = [
  "a long-case regulator clock calibration rig",
  "a metrology gravimetry pendulum stand",
  "a Foucault-style brass sphere suspension apparatus",
  "a skyscraper tuned-pendulum damper scale model",
  "a geophysical field-survey simple pendulum",
  "a lecture-hall rigid-ceiling wire pendulum",
  "an evacuated bell-jar precision timing pendulum",
  "a seismic base-isolation pendulum test frame",
  "a museum horology restoration pendulum rig",
  "a physics laboratory light-gate timing pendulum",
  "a coastal lighthouse clockwork escapement pendulum",
  "a mine-shaft gravity-anomaly survey pendulum",
  "an astronomical observatory sidereal regulator pendulum",
] as const;

const KINEMATIC_SHM_CONTEXTS = [
  "an ultrasonic surgical transducer tip",
  "a quartz crystal tuning-fork tine",
  "an atomic-force microscope cantilever tip",
  "a studio loudspeaker voice-coil cone",
  "a piezoelectric laser-mirror dithering stage",
  "a vibrometer calibration shaker table",
  "a tall-building tuned mass damper block",
  "a precision optical-chopper resonant blade",
  "a micro-electro-mechanical resonant beam",
  "a marine wave-tank oscillating piston paddle",
  "a dynamic mechanical thermal-analyzer probe",
  "a magnetic-levitation harmonic test puck",
  "an ultrasonic wire-bonding horn tip",
  "a resonant Coriolis mass-flow sensor tube",
  "a scanning-probe interferometric calibration stage",
  "a diesel injector needle-valve harmonic test rig",
  "a violins bridge laser-Doppler vibration target",
] as const;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

// ============================================================================
// FAMILY 1: Planar Snell Refraction, Wave Speed & Wavelength
// ============================================================================
function buildFamily1PlanarSnell(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "refraction-snell-tir",
    rng,
  });

  // Pick distinct media pair ensuring subcritical refraction and incidentAngle != 45 deg
  const enterDenser = variantIndex % 3 !== 2;
  const lowIdx = rng.int(0, 4);
  const highIdx = rng.int(lowIdx + 2, OPTICAL_MEDIA_POOL.length - 1);
  const med1 = enterDenser ? OPTICAL_MEDIA_POOL[lowIdx] : OPTICAL_MEDIA_POOL[highIdx];
  const med2 = enterDenser ? OPTICAL_MEDIA_POOL[highIdx] : OPTICAL_MEDIA_POOL[lowIdx];

  const maxSafeAngle = enterDenser
    ? 74
    : Math.max(16, Math.floor(radToDeg(Math.asin(med2.n / med1.n))) - 6);
  const angleCandidates = [18, 22, 26, 30, 34, 38, 42, 48, 52, 56, 60, 64, 68].filter(
    (a) => a <= maxSafeAngle,
  );
  const theta1 = rng.pick(angleCandidates);
  const lambda0 = rng.pick([405, 450, 488, 515, 532, 589, 633, 650, 670, 780]);
  const c = 3.0e8;
  const ctx = REFRACTION_CONTEXTS[(variantIndex + rng.int(0, 3)) % REFRACTION_CONTEXTS.length];

  const spec: PlanarRefractionSpec = {
    kind: "planar-refraction",
    n1: med1.n,
    n2: med2.n,
    medium1Name: med1.name,
    medium2Name: med2.name,
    incidentAngleDeg: theta1,
    vacuumWavelengthNm: lambda0,
    vacuumSpeedMs: c,
  };
  const sol = solveOpticsShmScenario(spec) as PlanarRefractionSolution;
  const theta2 = sol.refractedAngleDeg!;
  const v2 = sol.speed2Ms;
  const lambda2 = sol.wavelength2Nm!;

  if (format === "mcq") {
    const subMode = variantIndex % 4;
    if (subMode === 0) {
      // Target: refractedAngleDeg
      const stems = [
        `In ${ctx}, a narrow monochromatic beam of free-space wavelength ${lambda0} nm (vacuum speed c = 3.00 × 10⁸ m s⁻¹) travels through ${med1.proseName} (n₁ = ${med1.n}) and strikes a flat boundary with ${med2.proseName} (n₂ = ${med2.n}) at ${theta1}° to the normal. What is the angle of refraction in the ${med2.proseName}?`,
        `Monochromatic light of vacuum wavelength ${lambda0} nm (c = 3.00 × 10⁸ m s⁻¹) propagates inside ${med1.proseName} of refractive index ${med1.n} during ${ctx}. The ray meets a planar interface with ${med2.proseName} of refractive index ${med2.n} at an incidence angle of ${theta1}° measured from the normal. Calculate the refracted angle in ${med2.proseName}.`,
        `Engineers calibrating ${ctx} direct a laser beam (vacuum wavelength ${lambda0} nm, c = 3.00 × 10⁸ m s⁻¹) from ${med1.proseName} (n₁ = ${med1.n}) onto ${med2.proseName} (n₂ = ${med2.n}) at ${theta1}° relative to the boundary normal. At what angle to the normal does the transmitted ray travel in ${med2.proseName}?`,
        `A collimated optical ray of free-space wavelength ${lambda0} nm (c = 3.00 × 10⁸ m s⁻¹) in ${med1.proseName} (n₁ = ${med1.n}) is incident at ${theta1}° to the normal on a smooth ${med2.proseName} surface (n₂ = ${med2.n}) within ${ctx}. Determine the angle of refraction θ₂.`,
      ];
      const invRatioSin = (med2.n * Math.sin(degToRad(theta1))) / med1.n;
      const boundarySin = (med1.n * Math.sin(degToRad(90 - theta1))) / med2.n;
      const distractors: DistractorCandidate[] = [
        ...(boundarySin < 0.999
          ? [
              {
                value: radToDeg(Math.asin(boundarySin)),
                rationale:
                  "Measures the incident angle from the boundary surface (90° − θ₁) rather than from the normal when applying Snell's law.",
              },
            ]
          : []),
        {
          value: 90 - theta2,
          rationale:
            "Gives the complement angle between the refracted ray and the boundary surface (90° − θ₂) instead of the angle to the normal.",
        },
        ...(invRatioSin < 0.999
          ? [
              {
                value: radToDeg(Math.asin(invRatioSin)),
                rationale:
                  "Inverts the refractive index ratio in Snell's law, computing arcsin((n₂ / n₁) sin θ₁).",
              },
            ]
          : []),
        {
          value: theta1 * (med1.n / med2.n),
          rationale:
            "Scales the angle in degrees directly by n₁ / n₂ without taking trigonometric sines.",
        },
        {
          value: sol.deviationAngleDeg,
          rationale:
            "Calculates the angular deviation |θ₂ − θ₁| of the beam rather than the angle of refraction θ₂.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: theta2,
        unit: "°",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "refraction-snell-tir",
        templateArchetype: "planar-snell-wave-speed-wavelength",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "refractedAngleDeg",
          "wavelength1Nm",
          "wavelength2Nm",
          "deviationAngleDeg",
        ],
        targetQuantityKey: "refractedAngleDeg",
        questionPlan: buildDigitFreePlan({
          summary:
            "Evaluate transmitted angle of refraction across planar dielectric boundary via Snell law",
          format: "mcq",
          strategies: [
            "glancing-angle complement from boundary instead of normal",
            "inverted refractive index ratio in Snell equation",
            "direct small-angle degree scaling without sine function",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `By Snell's law, n₁ sin θ₁ = n₂ sin θ₂, so sin θ₂ = (${med1.n} × sin ${theta1}°) / ${med2.n} = ${formatSigFigs((med1.n * Math.sin(degToRad(theta1))) / med2.n, 4)}. Taking the inverse sine gives θ₂ = ${formatQty(theta2, "°", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies n₁ sin θ₁ = n₂ sin θ₂ to obtain θ₂ = ${formatQty(theta2, "°", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      // Target: wavelength2Nm
      const stems = [
        `During ${ctx}, a laser emits light of vacuum wavelength ${lambda0} nm (c = 3.00 × 10⁸ m s⁻¹) that passes from ${med1.proseName} (n₁ = ${med1.n}) into ${med2.proseName} (n₂ = ${med2.n}) at an angle of incidence of ${theta1}° to the normal. What is the wavelength of this light inside ${med2.proseName}?`,
        `A monochromatic beam with free-space wavelength ${lambda0} nm (vacuum speed 3.00 × 10⁸ m s⁻¹) enters ${med2.proseName} (n₂ = ${med2.n}) from ${med1.proseName} (n₁ = ${med1.n}) at ${theta1}° to the interface normal in ${ctx}. Calculate the optical wavelength in ${med2.proseName}.`,
        `In ${ctx}, coherent radiation of vacuum wavelength ${lambda0} nm (c = 3.00 × 10⁸ m s⁻¹) refracts from ${med1.proseName} (refractive index ${med1.n}) across a flat interface into ${med2.proseName} (refractive index ${med2.n}) after striking at ${theta1}° to the normal. What is its wavelength in ${med2.proseName}?`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: lambda0 * med2.n,
          rationale:
            "Multiplies the vacuum wavelength λ₀ by n₂ instead of dividing λ₀ by n₂.",
        },
        ...(Math.abs(med1.n - 1) > 0.05
          ? [
              {
                value: lambda0 / med1.n,
                rationale:
                  "Calculates the wavelength λ₁ = λ₀ / n₁ in the incident medium rather than λ₂ in the second medium.",
              },
              {
                value: lambda0 * (med1.n / med2.n),
                rationale:
                  "Multiplies λ₀ by n₁ / n₂ as though the quoted vacuum wavelength were measured inside the first medium.",
              },
            ]
          : []),
        {
          value: lambda0 * (med2.n / med1.n),
          rationale:
            "Multiplies the wavelength by the inverted index ratio n₂ / n₁.",
        },
        {
          value: lambda2 * Math.sin(degToRad(theta1)),
          rationale:
            "Incorrectly multiplies the medium wavelength by sin θ₁.",
        },
        {
          value: lambda0,
          rationale:
            "Assumes optical wavelength remains unchanged at λ₀ upon entering the second medium, confusing constant frequency with constant wavelength.",
        },
        {
          value: lambda0 / (med1.n + med2.n),
          rationale:
            "Divides the vacuum wavelength λ₀ by the sum (n₁ + n₂) instead of n₂.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: lambda2,
        unit: "nm",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "refraction-snell-tir",
        templateArchetype: "planar-snell-wave-speed-wavelength",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "refractedAngleDeg",
          "wavelength1Nm",
          "wavelength2Nm",
        ],
        targetQuantityKey: "wavelength2Nm",
        questionPlan: buildDigitFreePlan({
          summary:
            "Determine shortened optical wavelength inside refractive medium at constant wave frequency",
          format: "mcq",
          strategies: [
            "multiplying vacuum wavelength by refractive index instead of dividing",
            "computing wavelength in incident medium instead of refracting medium",
            "inverting index ratio when scaling wavelength",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `Wave frequency remains unchanged across the boundary, while phase speed decreases to v₂ = c / n₂. Hence λ₂ = λ₀ / n₂ = ${lambda0} / ${med2.n} = ${formatQty(lambda2, "nm", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses λ₂ = λ₀ / n₂ = ${lambda0} / ${med2.n} to obtain ${formatQty(lambda2, "nm", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 2) {
      // Target: speed2Ms
      const stems = [
        `A monochromatic ray of free-space wavelength ${lambda0} nm travels from ${med1.proseName} (n₁ = ${med1.n}) into ${med2.proseName} (n₂ = ${med2.n}) at ${theta1}° to the normal in ${ctx}. Taking c = 3.00 × 10⁸ m s⁻¹, what is the phase speed of the light inside ${med2.proseName}?`,
        `In ${ctx}, light of vacuum wavelength ${lambda0} nm (speed in vacuum c = 3.00 × 10⁸ m s⁻¹) crosses a flat boundary from ${med1.proseName} (n₁ = ${med1.n}) into ${med2.proseName} (n₂ = ${med2.n}) with incident angle ${theta1}°. Determine the wave speed in ${med2.proseName}.`,
        `Within ${ctx}, a beam of vacuum wavelength ${lambda0} nm (c = 3.00 × 10⁸ m s⁻¹) strikes a planar ${med1.proseName}–${med2.proseName} interface (n₁ = ${med1.n}, n₂ = ${med2.n}) at ${theta1}° to the normal. At what speed does the refracted wave propagate in ${med2.proseName}?`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: c * med2.n,
          rationale:
            "Multiplies the vacuum speed of light c by n₂ instead of dividing c by n₂.",
        },
        ...(Math.abs(med1.n - 1) > 0.05
          ? [
              {
                value: c / med1.n,
                rationale:
                  "Calculates the wave speed v₁ = c / n₁ in the first medium rather than v₂ in the second medium.",
              },
              {
                value: c * (med1.n / med2.n),
                rationale:
                  "Evaluates c(n₁ / n₂), treating the speed in the first medium as c even though n₁ ≠ 1.",
              },
            ]
          : []),
        {
          value: (c * med2.n) / med1.n,
          rationale:
            "Applies the inverted refractive index ratio n₂ / n₁ to the vacuum speed c.",
        },
        {
          value: (c / med2.n) * Math.sin(degToRad(theta1)),
          rationale:
            "Incorrectly projects phase speed by sin θ₁.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: v2,
        unit: "m s⁻¹",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "refraction-snell-tir",
        templateArchetype: "planar-snell-wave-speed-wavelength",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "refractedAngleDeg",
          "wavelength1Nm",
          "wavelength2Nm",
          "speed2Ms",
        ],
        targetQuantityKey: "speed2Ms",
        questionPlan: buildDigitFreePlan({
          summary:
            "Calculate phase velocity of electromagnetic wave in second medium from refractive index",
          format: "mcq",
          strategies: [
            "multiplying vacuum speed by refractive index",
            "computing wave speed in incident layer instead of second medium",
            "inverting index ratio in speed relation",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `From the definition of refractive index n₂ = c / v₂, the wave speed in ${med2.proseName} is v₂ = (3.00 × 10⁸) / ${med2.n} = ${formatQty(v2, "m s⁻¹", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes v₂ = c / n₂ = 3.00 × 10⁸ / ${med2.n} = ${formatQty(v2, "m s⁻¹", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    // subMode === 3: Inverse target n2 from measured theta1 & theta2!
    const theta2Shown = formatSigFigs(theta2, 3);
    const inverseSpec: PlanarRefractionSpec = {
      kind: "planar-refraction",
      n1: med1.n,
      n2: med2.n,
      medium1Name: med1.name,
      medium2Name: "Test sample",
      incidentAngleDeg: theta1,
    };
    const stems = [
      `To identify an unknown transparent solid on ${ctx}, a beam in ${med1.proseName} (n₁ = ${med1.n}) is directed onto its flat surface at ${theta1}° to the normal. The refracted beam inside the sample travels at ${theta2Shown}° to the normal. What is the refractive index n₂ of the sample?`,
      `In ${ctx}, a narrow optical ray travelling in ${med1.proseName} (refractive index ${med1.n}) meets a polished dielectric block at ${theta1}° to the normal and refracts to an angle of ${theta2Shown}° to the normal inside the block. Determine the refractive index n₂ of the block.`,
      `During quality testing on ${ctx}, monochromatic light in ${med1.proseName} (n₁ = ${med1.n}) enters a transparent specimen at an incidence angle of ${theta1}° and is refracted to ${theta2Shown}° relative to the boundary normal. Calculate the specimen's refractive index n₂.`,
    ];
    const distractors: DistractorCandidate[] = [
      {
        value: (med1.n * Math.sin(degToRad(theta2))) / Math.sin(degToRad(theta1)),
        rationale:
          "Inverts the sine ratio in Snell's law, calculating n₁ sin θ₂ / sin θ₁ instead of n₁ sin θ₁ / sin θ₂.",
      },
      {
        value: (med1.n * Math.cos(degToRad(theta1))) / Math.cos(degToRad(theta2)),
        rationale:
          "Measures both angles from the boundary surface rather than the normal, using cos θ₁ / cos θ₂.",
      },
      {
        value: med1.n * (theta1 / theta2),
        rationale:
          "Substitutes the raw ratio of angles θ₁ / θ₂ in degrees instead of sin θ₁ / sin θ₂.",
      },
      {
        value: Math.sin(degToRad(theta1)) / (med1.n * Math.sin(degToRad(theta2))),
        rationale:
          "Divides by n₁ instead of multiplying by n₁ when rearranging Snell's law.",
      },
    ];
    const options = buildNumericMcqOptions({
      truth: med2.n,
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    const reqGivens: RequiredGivenSpec[] = [
      { name: "n1", value: med1.n, source: "either" },
      { name: "incidentAngleDeg", value: theta1, unit: "°", source: "either" },
      { name: "refractedAngleDeg", value: theta2, unit: "°", source: "either" },
    ];
    return {
      id,
      conceptId: "refraction-snell-tir",
      templateArchetype: "planar-snell-wave-speed-wavelength",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: inverseSpec as unknown as Record<string, unknown>,
      hiddenQuantities: ["n2", "speed2Ms", "speedRatioV2OverV1", "wavelengthRatio2Over1"],
      requiredGivens: reqGivens,
      targetQuantityKey: "n2",
      questionPlan: buildDigitFreePlan({
        summary:
          "Determine unknown refractive index of second medium from measured incident and refracted angles",
        format: "mcq",
        strategies: [
          "inverted sine ratio in Snell formula",
          "cosine ratio from measuring angles to interface instead of normal",
          "linear ratio of degree values without sine",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: `Rearranging Snell's law n₁ sin θ₁ = n₂ sin θ₂ gives n₂ = ${med1.n} × sin ${theta1}° / sin ${theta2Shown}° = ${formatSigFigs(med2.n, 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates n₂ = n₁ sin θ₁ / sin θ₂ = ${formatSigFigs(med2.n, 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (6 marks, 3 parts)
  const stems = [
    `In ${ctx}, a collimated laser beam of vacuum wavelength ${lambda0} nm (speed of light in vacuum c = 3.00 × 10⁸ m s⁻¹) travels in ${med1.proseName} of refractive index n₁ = ${med1.n} and strikes a flat boundary with ${med2.proseName} of refractive index n₂ = ${med2.n} at an angle of incidence of ${theta1}° to the normal.`,
    `During an optical characterization experiment using ${ctx}, monochromatic light of free-space wavelength ${lambda0} nm (c = 3.00 × 10⁸ m s⁻¹) propagates through ${med1.proseName} (n₁ = ${med1.n}) and meets a planar ${med2.proseName} interface (n₂ = ${med2.n}) at ${theta1}° relative to the normal.`,
    `Engineers testing ${ctx} direct a narrow beam of vacuum wavelength ${lambda0} nm (c = 3.00 × 10⁸ m s⁻¹) through ${med1.proseName} (n₁ = ${med1.n}) onto a smooth ${med2.proseName} surface (n₂ = ${med2.n}) at an incidence angle of ${theta1}° to the boundary normal.`,
  ];
  const dev = sol.deviationAngleDeg;
  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: `Calculate the speed and the wavelength of the light inside ${med2.proseName}, reporting the wavelength in nm.`,
      marks: 2,
      targetQuantityKey: "wavelength2Nm",
      expectedAnswer: formatQty(lambda2, "nm", 3),
      workingSteps: [
        `v₂ = c / n₂ = 3.00 × 10⁸ / ${med2.n} = ${formatQty(v2, "m s⁻¹", 3)}.`,
        `λ₂ = λ₀ / n₂ = ${lambda0} / ${med2.n} = ${formatQty(lambda2, "nm", 3)}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Calculate the angle of refraction θ₂ of the beam in ${med2.proseName}.`,
      marks: 2,
      targetQuantityKey: "refractedAngleDeg",
      expectedAnswer: formatQty(theta2, "°", 3),
      workingSteps: [
        `Apply Snell's law: ${med1.n} sin ${theta1}° = ${med2.n} sin θ₂.`,
        `sin θ₂ = ${formatSigFigs((med1.n * Math.sin(degToRad(theta1))) / med2.n, 4)} ⇒ θ₂ = ${formatQty(theta2, "°", 3)}.`,
      ],
    },
    {
      partId: "c",
      prompt:
        "Determine the magnitude of the angular deviation between the incident ray direction and the refracted ray direction.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "deviationAngleDeg",
      expectedAnswer: formatQty(dev, "°", 3),
      workingSteps: [
        `Angular deviation δ = |θ₂ − θ₁| = |${formatSigFigs(theta2, 4)}° − ${theta1}°| = ${formatQty(dev, "°", 3)}.`,
      ],
    },
  ];
  const markScheme: MarkSchemePoint[] = [
    {
      code: "M1",
      partId: "a",
      criterion: `Applies λ₂ = λ₀ / n₂ = ${lambda0} / ${med2.n}.`,
      marks: 1,
    },
    {
      code: "A1",
      partId: "a",
      criterion: `Obtains λ₂ = ${formatQty(lambda2, "nm", 3)} (with v₂ = ${formatQty(v2, "m s⁻¹", 3)}).`,
      marks: 1,
    },
    {
      code: "M1",
      partId: "b",
      criterion: `Substitutes n₁ = ${med1.n}, θ₁ = ${theta1}°, and n₂ = ${med2.n} into n₁ sin θ₁ = n₂ sin θ₂.`,
      marks: 1,
    },
    {
      code: "A1",
      partId: "b",
      criterion: `Obtains θ₂ = ${formatQty(theta2, "°", 3)}.`,
      marks: 1,
    },
    {
      code: "M1",
      partId: "c",
      criterion: "Evaluates the unsigned difference |θ₂ − θ₁|.",
      marks: 1,
    },
    {
      code: "A1",
      partId: "c",
      criterion: `Obtains angular deviation = ${formatQty(dev, "°", 3)}.`,
      marks: 1,
    },
  ];
  return {
    id,
    conceptId: "refraction-snell-tir",
    templateArchetype: "planar-snell-wave-speed-wavelength",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "refractedAngleDeg",
      "wavelength1Nm",
      "wavelength2Nm",
      "speed2Ms",
      "deviationAngleDeg",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Multi-step analysis of wavelength change, Snell refraction angle, and beam deviation across planar interface",
      format: "structured",
      strategies: [
        "compute optical wavelength inside refracting medium",
        "apply Snell law to determine transmitted angle to normal",
        "deduce angular deflection relative to incident beam direction",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts,
    workedSolution: `(a) Inside ${med2.proseName}, v₂ = c / n₂ = ${formatQty(v2, "m s⁻¹", 3)} and λ₂ = λ₀ / n₂ = ${lambda0} / ${med2.n} = ${formatQty(lambda2, "nm", 3)}. (b) By Snell's law, sin θ₂ = (${med1.n} sin ${theta1}°) / ${med2.n}, giving θ₂ = ${formatQty(theta2, "°", 3)}. (c) Angular deviation δ = |θ₂ − θ₁| = ${formatQty(dev, "°", 3)}.`,
    markScheme,
    totalMarks: 6,
  };
}

// ============================================================================
// FAMILY 2: Critical Angle & Total Internal Reflection
// ============================================================================
function buildFamily2CriticalTir(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "refraction-snell-tir",
    rng,
  });

  const lowIdx = rng.int(0, 3);
  const highIdx = rng.int(lowIdx + 3, OPTICAL_MEDIA_POOL.length - 1);
  const med1 = OPTICAL_MEDIA_POOL[highIdx];
  const med2 = OPTICAL_MEDIA_POOL[lowIdx];
  const critExact = radToDeg(Math.asin(med2.n / med1.n));
  const minTir = Math.min(82, Math.ceil(critExact + 5));
  const tirChoices = [minTir, Math.min(83, minTir + 3), Math.min(84, minTir + 7), Math.min(85, minTir + 11)].filter(
    (a) => Math.abs(a - 60) > 0.5 && Math.abs(a - 45) > 0.5,
  );
  const theta1 = tirChoices.length > 0 ? rng.pick(tirChoices) : minTir;
  const ctx = REFRACTION_CONTEXTS[(variantIndex + 4) % REFRACTION_CONTEXTS.length];

  const spec: PlanarRefractionSpec = {
    kind: "planar-refraction",
    n1: med1.n,
    n2: med2.n,
    medium1Name: med1.name,
    medium2Name: med2.name,
    incidentAngleDeg: theta1,
    vacuumSpeedMs: 3.0e8,
  };
  const sol = solveOpticsShmScenario(spec) as PlanarRefractionSolution;
  const crit = sol.criticalAngleDeg!;
  const devTir = sol.deviationAngleDeg; // 180 - 2*theta1

  if (format === "mcq") {
    const subMode = variantIndex % 3;
    if (subMode === 0) {
      // Target: criticalAngleDeg
      const stems = [
        `In ${ctx}, a light ray inside ${med1.proseName} (n₁ = ${med1.n}, c = 3.00 × 10⁸ m s⁻¹) approaches a planar interface with ${med2.proseName} (n₂ = ${med2.n}) at an incident angle of ${theta1}° to the normal. What is the critical angle θ_c at this ${med1.proseName}–${med2.proseName} boundary?`,
        `A prism assembly in ${ctx} places ${med1.proseName} of refractive index ${med1.n} in contact with ${med2.proseName} of refractive index ${med2.n} (take c = 3.00 × 10⁸ m s⁻¹). A test beam strikes the interface from inside ${med1.proseName} at ${theta1}° to the normal. Calculate the critical angle for total internal reflection at the boundary.`,
        `Within ${ctx}, monochromatic light (vacuum speed 3.00 × 10⁸ m s⁻¹) propagating in ${med1.proseName} (n₁ = ${med1.n}) is incident at ${theta1}° to the normal on ${med2.proseName} (n₂ = ${med2.n}). Determine the critical angle θ_c between these two media.`,
      ];
      const distractors: DistractorCandidate[] = [
        ...(med2.n > 1.01
          ? [
              {
                value: radToDeg(Math.asin(1 / med1.n)),
                rationale:
                  "Uses sin θ_c = 1 / n₁ as if the external medium were air rather than using n₂ / n₁.",
              },
            ]
          : []),
        {
          value: 90 - crit,
          rationale:
            "Reports the complement angle 90° − θ_c relative to the interface instead of the critical angle to the normal.",
        },
        {
          value: radToDeg(Math.atan(med2.n / med1.n)),
          rationale:
            "Uses tan θ_c = n₂ / n₁ (confusing critical angle with Brewster-like tangent expressions) instead of sin θ_c = n₂ / n₁.",
        },
        {
          value: radToDeg(
            Math.asin(Math.min(0.99, Math.abs(med1.n - med2.n) / med1.n)),
          ),
          rationale:
            "Substitutes the fractional index difference (n₁ − n₂) / n₁ instead of n₂ / n₁ into sin θ_c.",
        },
        {
          value: 90 * (med2.n / med1.n),
          rationale:
            "Scales 90° linearly by the index ratio n₂ / n₁ instead of evaluating arcsin(n₂ / n₁).",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: crit,
        unit: "°",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "refraction-snell-tir",
        templateArchetype: "planar-critical-angle-total-internal-reflection",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["criticalAngleDeg", "reflectedAngleDeg", "deviationAngleDeg"],
        targetQuantityKey: "criticalAngleDeg",
        questionPlan: buildDigitFreePlan({
          summary:
            "Compute critical angle at planar boundary between higher-index and lower-index media",
          format: "mcq",
          strategies: [
            "assuming external air index instead of second medium index",
            "reporting grazing angle to surface rather than normal angle",
            "using inverse tangent instead of inverse sine",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `At the critical angle θ_c, sin θ_c = n₂ / n₁ = ${med2.n} / ${med1.n} = ${formatSigFigs(med2.n / med1.n, 4)}, giving θ_c = arcsin(${formatSigFigs(med2.n / med1.n, 4)}) = ${formatQty(crit, "°", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses sin θ_c = n₂ / n₁ = ${med2.n} / ${med1.n} to obtain θ_c = ${formatQty(crit, "°", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      // Target: deviationAngleDeg in TIR (180 - 2*theta1)
      const stems = [
        `A collimated ray inside ${med1.proseName} (n₁ = ${med1.n}, vacuum light speed c = 3.00 × 10⁸ m s⁻¹) strikes a flat interface with ${med2.proseName} (n₂ = ${med2.n}) at ${theta1}° to the normal during ${ctx}. Through what angle is the ray deviated from its original forward path at this boundary?`,
        `In ${ctx}, an optical beam propagating in ${med1.proseName} (n₁ = ${med1.n}, c = 3.00 × 10⁸ m s⁻¹) meets a planar ${med2.proseName} boundary (n₂ = ${med2.n}) at an angle of incidence of ${theta1}° to the normal. Calculate the angular deviation of the beam produced at the interface.`,
        `Engineers designing a beam-turning prism on ${ctx} send a ray in ${med1.proseName} (n₁ = ${med1.n}, c = 3.00 × 10⁸ m s⁻¹) onto ${med2.proseName} (n₂ = ${med2.n}) at ${theta1}° to the normal. What is the angular deflection δ between the incident direction and the emerging reflected ray?`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: 2 * theta1,
          rationale:
            "Calculates the angle 2θ₁ between the reversed incident ray and the reflected ray rather than the forward deviation 180° − 2θ₁.",
        },
        {
          value: theta1,
          rationale:
            "Gives the angle of reflection θ_r = θ₁ instead of the angular deflection from the original travel direction.",
        },
        {
          value: 90 - theta1,
          rationale:
            "Calculates only the single glancing angle 90° − θ₁ to the interface rather than twice the glancing angle 180° − 2θ₁.",
        },
        {
          value: 180 - theta1,
          rationale:
            "Subtracts θ₁ once from 180° instead of subtracting 2θ₁.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: devTir,
        unit: "°",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "refraction-snell-tir",
        templateArchetype: "planar-critical-angle-total-internal-reflection",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["criticalAngleDeg", "reflectedAngleDeg", "deviationAngleDeg"],
        targetQuantityKey: "deviationAngleDeg",
        questionPlan: buildDigitFreePlan({
          summary:
            "Verify total internal reflection condition and calculate ray angular deviation",
          format: "mcq",
          strategies: [
            "reporting twice incident angle instead of supplement",
            "reporting reflected angle to normal instead of ray deviation",
            "computing single glancing angle instead of double glancing deflection",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `Since sin θ_c = ${med2.n} / ${med1.n} gives θ_c = ${formatQty(crit, "°", 3)} and θ₁ = ${theta1}° > θ_c, the beam undergoes total internal reflection with θ_r = ${theta1}°. The angular deviation from the original forward direction is δ = 180° − 2(${theta1}°) = ${formatQty(devTir, "°", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Identifies TIR (θ₁ > θ_c = ${formatQty(crit, "°", 3)}) and computes δ = 180° − 2θ₁ = ${formatQty(devTir, "°", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    // subMode === 2: Inverse target n1 from critical angle!
    const critShown = Number(critExact.toFixed(2));
    const critSpec: PlanarRefractionSpec = {
      kind: "planar-refraction",
      n1: med1.n,
      n2: med2.n,
      medium1Name: "Optical core block",
      medium2Name: med2.name,
      incidentAngleDeg: critExact,
    };
    const stems = [
      `On ${ctx}, the critical angle for total internal reflection of monochromatic light passing from a transparent crystal into ${med2.proseName} (n₂ = ${med2.n}) is measured to be ${formatSigFigs(critShown, 3)}° to the normal. What is the refractive index n₁ of the crystal?`,
      `During refractive testing with ${ctx}, a ray inside a high-index optical block meets a flat layer of ${med2.proseName} (n₂ = ${med2.n}) and grazes the interface along the boundary when the incident angle to the normal reaches ${formatSigFigs(critShown, 3)}°. Calculate the block's refractive index n₁.`,
      `A refractometer cell in ${ctx} immerses a polished dielectric slab in ${med2.proseName} (n₂ = ${med2.n}), recording a critical angle of ${formatSigFigs(critShown, 3)}° relative to the boundary normal. Determine the refractive index n₁ of the dielectric slab.`,
    ];
    const distractors: DistractorCandidate[] = [
      {
        value: med2.n * Math.sin(degToRad(critExact)),
        rationale:
          "Multiplies n₂ by sin θ_c instead of dividing n₂ by sin θ_c.",
      },
      ...(med2.n > 1.01
        ? [
            {
              value: 1 / Math.sin(degToRad(critExact)),
              rationale:
                "Evaluates 1 / sin θ_c by assuming the external medium is air rather than multiplying by n₂.",
            },
          ]
        : []),
      {
        value: med2.n / Math.cos(degToRad(critExact)),
        rationale:
          "Measures the critical angle relative to the boundary surface, dividing n₂ by cos θ_c instead of sin θ_c.",
      },
      {
        value: med2.n / Math.tan(degToRad(critExact)),
        rationale:
          "Uses tan θ_c instead of sin θ_c when inverting the critical-angle relation.",
      },
    ];
    const options = buildNumericMcqOptions({
      truth: med1.n,
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "refraction-snell-tir",
      templateArchetype: "planar-critical-angle-total-internal-reflection",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: critSpec as unknown as Record<string, unknown>,
      hiddenQuantities: ["n1", "speed1Ms", "speedRatioV2OverV1", "wavelengthRatio2Over1"],
      requiredGivens: [
        { name: "n2", value: med2.n, source: "either" },
        { name: "incidentAngleDeg", value: critExact, unit: "°", source: "either" },
      ],
      targetQuantityKey: "n1",
      questionPlan: buildDigitFreePlan({
        summary:
          "Deduce refractive index of denser medium from observed critical angle against known fluid",
        format: "mcq",
        strategies: [
          "multiplying external index by sine of critical angle",
          "omitting external fluid index by assuming air",
          "dividing by cosine from surface-angle misconception",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: `At the critical angle, n₁ sin θ_c = n₂ sin 90° = n₂, so n₁ = ${med2.n} / sin ${formatSigFigs(critExact, 3)}° = ${formatSigFigs(med1.n, 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Computes n₁ = n₂ / sin θ_c = ${med2.n} / sin ${formatSigFigs(critExact, 3)}° = ${formatSigFigs(med1.n, 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (5 marks: 2m + 1m qualitative + 2m)
  const stems = [
    `In ${ctx}, a narrow monochromatic beam (speed of light in vacuum c = 3.00 × 10⁸ m s⁻¹) travels inside ${med1.proseName} of refractive index n₁ = ${med1.n} and strikes a flat boundary with ${med2.proseName} of refractive index n₂ = ${med2.n} at an angle of incidence of ${theta1}° to the normal.`,
    `A beam-steering prism assembly on ${ctx} guides light (c = 3.00 × 10⁸ m s⁻¹) inside ${med1.proseName} (n₁ = ${med1.n}) toward a planar interface with ${med2.proseName} (n₂ = ${med2.n}) at an incidence angle of ${theta1}° measured from the normal.`,
  ];
  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: `Calculate the critical angle θ_c at the ${med1.proseName}–${med2.proseName} boundary.`,
      marks: 2,
      targetQuantityKey: "criticalAngleDeg",
      expectedAnswer: formatQty(crit, "°", 3),
      workingSteps: [
        `sin θ_c = n₂ / n₁ = ${med2.n} / ${med1.n} = ${formatSigFigs(med2.n / med1.n, 4)}.`,
        `θ_c = arcsin(${formatSigFigs(med2.n / med1.n, 4)}) = ${formatQty(crit, "°", 3)}.`,
      ],
    },
    {
      partId: "b",
      prompt:
        "State and explain the optical phenomenon that occurs when this beam meets the boundary.",
      marks: 1,
      dependsOnPartIds: ["a"],
      targetMode: "qualitative",
      targetQuantityKey: "regime",
      expectedAnswer:
        "Total internal reflection occurs because light travels in the medium of higher refractive index and the incident angle exceeds the critical angle.",
      workingSteps: [
        "Compare incident angle with critical angle in the optically denser medium to confirm total internal reflection.",
      ],
    },
    {
      partId: "c",
      prompt:
        "Calculate the angular deviation of the reflected ray from the incident ray's original forward direction, and find the wave speed in the first medium.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "deviationAngleDeg",
      expectedAnswer: formatQty(devTir, "°", 3),
      workingSteps: [
        `Wave speed in ${med1.proseName}: v₁ = c / n₁ = ${formatQty(sol.speed1Ms, "m s⁻¹", 3)}.`,
        `Angular deviation under total internal reflection: δ = 180° − 2(${theta1}°) = ${formatQty(devTir, "°", 3)}.`,
      ],
    },
  ];
  return {
    id,
    conceptId: "refraction-snell-tir",
    templateArchetype: "planar-critical-angle-total-internal-reflection",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "criticalAngleDeg",
      "reflectedAngleDeg",
      "deviationAngleDeg",
      "speed1Ms",
      "regime",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Determine critical angle, classify total internal reflection regime, and compute reflected beam deviation",
      format: "structured",
      strategies: [
        "evaluate critical angle from refractive index ratio",
        "justify total internal reflection from denser-medium and critical-angle criteria",
        "calculate forward angular deflection of reflected ray",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts,
    workedSolution: `(a) sin θ_c = ${med2.n} / ${med1.n}, so θ_c = ${formatQty(crit, "°", 3)}. (b) Because n₁ > n₂ and θ₁ > θ_c, total internal reflection occurs at the interface. (c) Wave speed v₁ = 3.00 × 10⁸ / ${med1.n} = ${formatQty(sol.speed1Ms, "m s⁻¹", 3)}, and angular deviation δ = 180° − 2(${theta1}°) = ${formatQty(devTir, "°", 3)}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Substitutes into sin θ_c = n₂ / n₁ = ${med2.n} / ${med1.n}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains θ_c = ${formatQty(crit, "°", 3)}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion:
          "States total internal reflection because the ray is in the higher-index medium with incident angle greater than the critical angle.",
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Uses δ = 180° − 2θ₁ with θ₁ = ${theta1}°.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains δ = ${formatQty(devTir, "°", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
  };
}

// ============================================================================
// FAMILY 3: Multi-Layer Parallel Slabs & Lateral Ray Displacement
// ============================================================================
function buildFamily3MultiLayerSlab(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "refraction-snell-tir",
    rng,
  });

  const ctx = REFRACTION_CONTEXTS[(variantIndex + 7) % REFRACTION_CONTEXTS.length];
  const asymmetric = format === "mcq" && variantIndex % 3 === 1;

  if (asymmetric) {
    // 3-layer asymmetric stack: outer0 -> slab1 (thickness t1) -> outer2 (n2 != n0)
    const outer0 = OPTICAL_MEDIA_POOL[0]; // Air 1.00
    const mid1 = OPTICAL_MEDIA_POOL[rng.int(4, 7)]; // 1.52..1.77
    const outer2 = OPTICAL_MEDIA_POOL[rng.int(1, 3)]; // 1.33..1.46
    const t1 = rng.pick([0.025, 0.035, 0.045, 0.055, 0.065]);
    const theta0 = rng.pick([28, 34, 40, 46, 52, 58, 64]);

    const spec: MultiLayerSlabSpec = {
      kind: "multi-layer-slab",
      incidentAngleDeg: theta0,
      layers: [
        { name: outer0.name, refractiveIndex: outer0.n },
        { name: mid1.name, refractiveIndex: mid1.n, thicknessM: t1 },
        { name: outer2.name, refractiveIndex: outer2.n },
      ],
    };
    const sol = solveOpticsShmScenario(spec) as MultiLayerSlabSolution;
    const emergent = sol.emergentAngleDeg!;
    const thetaMid = sol.steps[1].angleDeg;

    const stems = [
      `In ${ctx}, a laser ray in ${outer0.proseName} (n₀ = ${outer0.n}) strikes a flat parallel plate of ${mid1.proseName} (n₁ = ${mid1.n}, thickness ${t1} m) at ${theta0}° to the normal. The opposite face of the plate is in direct contact with ${outer2.proseName} (n₂ = ${outer2.n}). At what emergent angle to the normal does the ray travel in ${outer2.proseName}?`,
      `An immersion viewing window on ${ctx} consists of a uniform ${mid1.proseName} slab of refractive index ${mid1.n} and thickness ${t1} m separating ${outer0.proseName} (n₀ = ${outer0.n}) from ${outer2.proseName} (n₂ = ${outer2.n}). A narrow beam enters from ${outer0.proseName} at ${theta0}° to the normal. Calculate the emergent angle in ${outer2.proseName}.`,
      `Within ${ctx}, monochromatic light enters a parallel-sided ${mid1.proseName} window (n₁ = ${mid1.n}, thickness ${t1} m) from ${outer0.proseName} (n₀ = ${outer0.n}) at ${theta0}° to the normal and exits into ${outer2.proseName} (n₂ = ${outer2.n}). What is the angle of refraction in ${outer2.proseName}?`,
    ];
    const distractors: DistractorCandidate[] = [
      {
        value: thetaMid,
        rationale:
          "Stops at the intermediate refraction angle θ₁ inside the solid window instead of refracting across the second boundary into the final medium.",
      },
      {
        value: theta0,
        rationale:
          "Assumes the emergent angle equals the initial incident angle θ₀ even though the final medium has refractive index n₂ ≠ n₀.",
      },
      {
        value: radToDeg(
          Math.asin(Math.min(0.99, (mid1.n * Math.sin(degToRad(theta0))) / outer2.n)),
        ) === 90
          ? 90 - emergent
          : radToDeg(
              Math.asin(Math.min(0.99, (outer0.n * Math.cos(degToRad(theta0))) / outer2.n)),
            ),
        rationale:
          "Measures the initial angle from the window surface rather than from the normal.",
      },
      {
        value: 90 - emergent,
        rationale:
          "Reports the complement angle to the interface rather than the emergent angle to the normal.",
      },
    ];
    const options = buildNumericMcqOptions({
      truth: emergent,
      unit: "°",
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "refraction-snell-tir",
      templateArchetype: "multilayer-slab-lateral-displacement",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "theta1",
        "emergentAngleDeg",
        "totalTransverseShiftM",
      ],
      requiredGivens: [
        { name: "n0", value: outer0.n, source: "either" },
        { name: "n1", value: mid1.n, source: "either" },
        { name: "thicknessM", value: t1, unit: "m", source: "either" },
        { name: "n2", value: outer2.n, source: "either" },
        { name: "incidentAngleDeg", value: theta0, unit: "°", source: "either" },
      ],
      targetQuantityKey: "emergentAngleDeg",
      questionPlan: buildDigitFreePlan({
        summary:
          "Apply multi-layer Snell invariant across parallel slab separating distinct outer media",
        format: "mcq",
        strategies: [
          "stopping after first interface refraction inside middle slab",
          "assuming emergent ray is parallel to incident ray despite unequal outer media",
          "reporting complement angle relative to boundary plane",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: `Across parallel planar boundaries, n₀ sin θ₀ = n₁ sin θ₁ = n₂ sin θ₂. Thus sin θ₂ = (${outer0.n} × sin ${theta0}°) / ${outer2.n}, giving θ₂ = ${formatQty(emergent, "°", 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Applies Snell invariant n₀ sin θ₀ = n₂ sin θ₂ to obtain θ₂ = ${formatQty(emergent, "°", 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Symmetric parallel slab in air or water -> lateralDisplacementM & totalTransverseShiftM
  const outer = variantIndex % 4 === 3 ? OPTICAL_MEDIA_POOL[1] : OPTICAL_MEDIA_POOL[0];
  const slab = OPTICAL_MEDIA_POOL[rng.int(4, 8)];
  const t1 = rng.pick([0.03, 0.04, 0.05, 0.06, 0.075, 0.085]);
  const theta0 = rng.pick([26, 32, 38, 44, 50, 56, 62]);

  const spec: MultiLayerSlabSpec = {
    kind: "multi-layer-slab",
    incidentAngleDeg: theta0,
    layers: [
      { name: outer.name, refractiveIndex: outer.n },
      { name: slab.name, refractiveIndex: slab.n, thicknessM: t1 },
      { name: outer.name, refractiveIndex: outer.n },
    ],
  };
  const sol = solveOpticsShmScenario(spec) as MultiLayerSlabSolution;
  const latDisp = sol.lateralDisplacementM!;
  const transShift = sol.totalTransverseShiftM;
  const theta1 = sol.steps[1].angleDeg;

  if (format === "mcq") {
    const askTransverse = variantIndex % 3 === 2;
    const targetKey = askTransverse
      ? "totalTransverseShiftM"
      : "lateralDisplacementM";
    const truth = askTransverse ? transShift : latDisp;

    const stems = askTransverse
      ? [
          `On ${ctx}, a narrow beam in ${outer.proseName} (n₀ = ${outer.n}) hits a parallel-sided plate of ${slab.proseName} (n₁ = ${slab.n}, thickness ${t1} m) surrounded by ${outer.proseName} at ${theta0}° to the normal. By what distance along the exit face is the ray's exit point shifted from the normal through the entry point?`,
          `A parallel-sided optical window of ${slab.proseName} (refractive index ${slab.n}, thickness ${t1} m) immersed in ${outer.proseName} (n₀ = ${outer.n}) is illuminated at ${theta0}° to the normal in ${ctx}. Calculate the transverse shift t₁ tan θ₁ of the ray along the exit boundary.`,
        ]
      : [
          `In ${ctx}, a collimated laser ray in ${outer.proseName} (n₀ = ${outer.n}) strikes a uniform parallel-sided ${slab.proseName} block (n₁ = ${slab.n}) of thickness ${t1} m at ${theta0}° to the normal and emerges back into ${outer.proseName}. What is the perpendicular lateral displacement between the emergent ray and the undeviated incident ray line?`,
          `A parallel-faced ${slab.proseName} plate of thickness ${t1} m and refractive index ${slab.n} sits in ${outer.proseName} (n₀ = ${outer.n}) on ${ctx}. A monochromatic beam enters at ${theta0}° to the normal. Calculate the perpendicular lateral shift d of the emerging parallel beam.`,
          `Engineers aligning ${ctx} pass a narrow beam in ${outer.proseName} (n₀ = ${outer.n}) through a flat ${slab.proseName} window (n₁ = ${slab.n}, thickness ${t1} m) at ${theta0}° to the normal into ${outer.proseName}. Determine the perpendicular lateral displacement of the transmitted beam.`,
        ];

    const unrefractedShift = t1 * Math.tan(degToRad(theta0));
    const distractors: DistractorCandidate[] = askTransverse
      ? [
          {
            value: latDisp,
            rationale:
              "Calculates the perpendicular lateral displacement between parallel rays instead of the transverse shift t₁ tan θ₁ along the slab face.",
          },
          {
            value: unrefractedShift,
            rationale:
              "Uses the incident angle θ₀ in t₁ tan θ₀ as if no refraction occurred at the first boundary.",
          },
          {
            value: t1 * Math.sin(degToRad(theta1)),
            rationale:
              "Multiplies slab thickness by sin θ₁ instead of tan θ₁.",
          },
        ]
      : [
          {
            value: transShift,
            rationale:
              "Computes the transverse shift t₁ tan θ₁ inside the slab rather than the perpendicular displacement between incident and emergent ray lines.",
          },
          {
            value: Math.abs(unrefractedShift - transShift),
            rationale:
              "Finds the boundary-parallel offset t₁(tan θ₀ − tan θ₁) without multiplying by cos θ₀ to project perpendicular to the ray.",
          },
          {
            value: t1 * Math.sin(degToRad(theta0 - theta1)),
            rationale:
              "Omits the 1 / cos θ₁ slant-path factor in d = (t₁ / cos θ₁) sin(θ₀ − θ₁).",
          },
        ];

    const options = buildNumericMcqOptions({
      truth,
      unit: "m",
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "refraction-snell-tir",
      templateArchetype: "multilayer-slab-lateral-displacement",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "theta1",
        "emergentAngleDeg",
        "lateralDisplacementM",
        "totalTransverseShiftM",
      ],
      requiredGivens: [
        { name: "n0", value: outer.n, source: "either" },
        { name: "n1", value: slab.n, source: "either" },
        { name: "thicknessM", value: t1, unit: "m", source: "either" },
        { name: "incidentAngleDeg", value: theta0, unit: "°", source: "either" },
      ],
      targetQuantityKey: targetKey,
      questionPlan: buildDigitFreePlan({
        summary:
          "Compute ray refraction and geometric shift through parallel-sided dielectric plate",
        format: "mcq",
        strategies: [
          "confusing boundary transverse offset with perpendicular ray displacement",
          "omitting cosine projection onto ray normal",
          "forgetting slant path length inside slab",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: askTransverse
        ? `Inside the ${slab.proseName} slab, sin θ₁ = (${outer.n} sin ${theta0}°) / ${slab.n}, giving θ₁ = ${formatQty(theta1, "°", 3)}. The transverse shift along the exit face is Δy = t₁ tan θ₁ = ${t1} × tan ${formatSigFigs(theta1, 4)}° = ${formatQty(transShift, "m", 3)}.`
        : `By Snell's law, sin θ₁ = (${outer.n} sin ${theta0}°) / ${slab.n} ⇒ θ₁ = ${formatQty(theta1, "°", 3)}. The perpendicular lateral displacement of the emergent ray is d = t₁ sin(θ₀ − θ₁) / cos θ₁ = ${formatQty(latDisp, "m", 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Finds θ₁ = ${formatQty(theta1, "°", 3)} and computes ${formatQty(truth, "m", 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (6 marks)
  const stems = [
    `In ${ctx}, a narrow monochromatic beam in ${outer.proseName} (refractive index n₀ = ${outer.n}) strikes a parallel-sided block of ${slab.proseName} (refractive index n₁ = ${slab.n}, thickness ${t1} m) at an angle of incidence of ${theta0}° to the normal and emerges back into ${outer.proseName} on the far side.`,
    `A precision optical compensator in ${ctx} uses a flat, parallel-sided ${slab.proseName} plate of thickness ${t1} m and refractive index ${slab.n} surrounded by ${outer.proseName} (n₀ = ${outer.n}). An incident ray meets the entry face at ${theta0}° to the normal.`,
  ];
  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: `State the emergent angle of refraction in ${outer.proseName} and calculate the optical Snell invariant n₀ sin θ₀.`,
      marks: 2,
      targetQuantityKey: "snellInvariant",
      expectedAnswer: formatSigFigs(sol.snellInvariant, 3),
      workingSteps: [
        `Because both outer media have refractive index ${outer.n} and the faces are parallel, the emergent angle equals ${theta0}°.`,
        `Snell invariant = n₀ sin θ₀ = ${outer.n} × sin ${theta0}° = ${formatSigFigs(sol.snellInvariant, 3)}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Calculate the transverse offset Δy = t₁ tan θ₁ of the ray between the entry normal and exit normal along the slab face.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "totalTransverseShiftM",
      expectedAnswer: formatQty(transShift, "m", 3),
      workingSteps: [
        `sin θ₁ = ${formatSigFigs(sol.snellInvariant, 4)} / ${slab.n} ⇒ θ₁ = ${formatQty(theta1, "°", 3)}.`,
        `Δy = ${t1} × tan ${formatSigFigs(theta1, 4)}° = ${formatQty(transShift, "m", 3)}.`,
      ],
    },
    {
      partId: "c",
      prompt:
        "Hence calculate the perpendicular lateral displacement d between the emergent ray and the original incident ray line.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "lateralDisplacementM",
      expectedAnswer: formatQty(latDisp, "m", 3),
      workingSteps: [
        `d = (t₁ tan θ₀ − Δy) cos θ₀ = t₁ sin(θ₀ − θ₁) / cos θ₁ = ${formatQty(latDisp, "m", 3)}.`,
      ],
    },
  ];
  return {
    id,
    conceptId: "refraction-snell-tir",
    templateArchetype: "multilayer-slab-lateral-displacement",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "theta1",
      "emergentAngleDeg",
      "totalTransverseShiftM",
      "lateralDisplacementM",
      "snellInvariant",
    ],
    requiredGivens: [
      { name: "n0", value: outer.n, source: "either" },
      { name: "n1", value: slab.n, source: "either" },
      { name: "thicknessM", value: t1, unit: "m", source: "either" },
      { name: "incidentAngleDeg", value: theta0, unit: "°", source: "either" },
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Derive Snell invariant, internal transverse shift, and perpendicular lateral displacement across parallel optical block",
      format: "structured",
      strategies: [
        "evaluate optical Snell invariant at entry boundary",
        "determine refracted angle inside block and transverse exit offset",
        "project ray separation perpendicular to incident beam direction",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts,
    workedSolution: `(a) Snells invariant n₀ sin θ₀ = ${outer.n} sin ${theta0}° = ${formatSigFigs(sol.snellInvariant, 3)} (emergent angle = ${theta0}°). (b) Inside the slab, θ₁ = arcsin(${formatSigFigs(sol.snellInvariant, 4)} / ${slab.n}) = ${formatQty(theta1, "°", 3)}, so Δy = ${t1} tan θ₁ = ${formatQty(transShift, "m", 3)}. (c) Perpendicular lateral displacement d = t₁ sin(θ₀ − θ₁) / cos θ₁ = ${formatQty(latDisp, "m", 3)}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Evaluates n₀ sin θ₀ = ${outer.n} sin ${theta0}°.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains ${formatSigFigs(sol.snellInvariant, 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Finds θ₁ = ${formatQty(theta1, "°", 3)} and applies Δy = t₁ tan θ₁.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains Δy = ${formatQty(transShift, "m", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Applies d = t₁ sin(θ₀ − θ₁) / cos θ₁ or (t₁ tan θ₀ − Δy) cos θ₀.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains d = ${formatQty(latDisp, "m", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

// ============================================================================
// FAMILY 4: Step-Index Optical Fiber — Core/Cladding TIR & Wall Incidence
// ============================================================================
const FIBER_INDEX_PAIRS: ReadonlyArray<{ nCore: number; nClad: number }> = [
  { nCore: 1.5, nClad: 1.44 },
  { nCore: 1.52, nClad: 1.46 },
  { nCore: 1.55, nClad: 1.47 },
  { nCore: 1.48, nClad: 1.41 },
  { nCore: 1.6, nClad: 1.5 },
  { nCore: 1.58, nClad: 1.49 },
  { nCore: 1.62, nClad: 1.51 },
  { nCore: 1.49, nClad: 1.39 },
  { nCore: 1.54, nClad: 1.45 },
  { nCore: 1.57, nClad: 1.46 },
];

function buildFamily4FiberWallTir(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "refraction-snell-tir",
    rng,
  });

  const pair = FIBER_INDEX_PAIRS[(variantIndex + rng.int(0, 2)) % FIBER_INDEX_PAIRS.length];
  const nExt = variantIndex % 5 === 4 ? 1.33 : 1.0;
  const extName = nExt > 1.1 ? "water (n_ext = 1.33)" : "air (n_ext = 1.00)";
  const na = Math.sqrt(pair.nCore * pair.nCore - pair.nClad * pair.nClad);
  const acceptDeg = radToDeg(Math.asin(Math.min(0.98, na / nExt)));
  const leakageMode = format === "mcq" && variantIndex % 4 === 3 && acceptDeg < 68;
  const launchDeg = leakageMode
    ? Number(Math.min(78, acceptDeg + rng.int(8, 16)).toFixed(1))
    : Number((acceptDeg * (0.35 + 0.08 * (variantIndex % 5))).toFixed(1));
  const fiberLengthM = rng.pick([40, 80, 120, 200, 350]);
  const ctx = FIBER_CONTEXTS[variantIndex % FIBER_CONTEXTS.length];

  const spec: OpticalFiberSpec = {
    kind: "optical-fiber",
    nCore: pair.nCore,
    nCladding: pair.nClad,
    nExternal: nExt,
    launchAngleDeg: launchDeg,
    fiberLengthM,
  };
  const sol = solveOpticsShmScenario(spec) as OpticalFiberSolution;

  if (format === "mcq") {
    if (leakageMode && sol.claddingRefractedAngleDeg !== null) {
      const cladAng = sol.claddingRefractedAngleDeg;
      const stems = [
        `In ${ctx}, a straight step-index fiber of length ${fiberLengthM} m has core index n_core = ${pair.nCore} and cladding index n_clad = ${pair.nClad}. A test ray enters the flat end-face from ${extName} at a steep angle θ_in = ${launchDeg}° to the fiber axis, exceeding the acceptance cone so light refracts into the cladding. What is the angle of refraction in the cladding measured from the core–cladding wall normal?`,
        `An over-angled ray in ${extName} is launched at ${launchDeg}° to the central axis into a ${fiberLengthM} m step-index waveguide (n_core = ${pair.nCore}, n_clad = ${pair.nClad}) during ${ctx}. At what angle to the cylindrical wall normal does the leaked ray refract into the cladding?`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: sol.wallIncidentAngleDeg,
          rationale:
            "Gives the wall angle of incidence θ_w inside the core without applying Snell's law across the core–cladding boundary.",
        },
        {
          value: sol.criticalAngleDeg,
          rationale:
            "Calculates the core–cladding critical angle arcsin(n_clad / n_core) rather than the refracted angle in the cladding.",
        },
        {
          value: 90 - cladAng,
          rationale:
            "Reports the angle of the leaked ray relative to the cladding interface rather than to the boundary normal.",
        },
        {
          value: radToDeg(
            Math.asin(
              Math.min(
                0.99,
                (pair.nClad * Math.sin(degToRad(sol.wallIncidentAngleDeg))) /
                  pair.nCore,
              ),
            ),
          ),
          rationale:
            "Inverts n_core / n_clad when applying Snell's law across the core–cladding wall.",
        },
        {
          value: launchDeg,
          rationale:
            "Confuses the external launch angle θ_in with the refracted angle inside the cladding.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: cladAng,
        unit: "°",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "refraction-snell-tir",
        templateArchetype: "step-index-fiber-core-cladding-tir-wall-angle",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "wallIncidentAngleDeg",
          "coreAxisAngleDeg",
          "criticalAngleDeg",
          "acceptanceAngleDeg",
          "claddingRefractedAngleDeg",
        ],
        targetQuantityKey: "claddingRefractedAngleDeg",
        questionPlan: buildDigitFreePlan({
          summary:
            "Trace steep unguided ray through fiber entry face and compute refraction angle into cladding",
          format: "mcq",
          strategies: [
            "stopping at core wall incident angle before refracting into cladding",
            "substituting critical angle instead of actual refracted angle",
            "measuring cladding angle from wall instead of normal",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `At entry, sin θ_axis = (${nExt} sin ${launchDeg}°) / ${pair.nCore} ⇒ θ_axis = ${formatQty(sol.coreAxisAngleDeg, "°", 3)}. The angle to the wall normal is θ_w = 90° − θ_axis = ${formatQty(sol.wallIncidentAngleDeg, "°", 3)} (< θ_c = ${formatQty(sol.criticalAngleDeg, "°", 3)}). Refracting into the cladding: sin θ_clad = (${pair.nCore} sin θ_w) / ${pair.nClad}, giving θ_clad = ${formatQty(cladAng, "°", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds θ_w = ${formatQty(sol.wallIncidentAngleDeg, "°", 3)} and refracts into cladding to obtain ${formatQty(cladAng, "°", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    const askWall = variantIndex % 2 === 0;
    const targetKey = askWall ? "wallIncidentAngleDeg" : "criticalAngleDeg";
    const truth = askWall ? sol.wallIncidentAngleDeg : sol.criticalAngleDeg;
    const stems = askWall
      ? [
          `A ${fiberLengthM} m step-index optical fiber used in ${ctx} has core refractive index ${pair.nCore} and cladding refractive index ${pair.nClad}. A laser ray in ${extName} enters the center of the flat end-face at θ_in = ${launchDeg}° to the fiber axis. What angle of incidence θ_w does the refracted ray make with the normal to the core–cladding wall?`,
          `During alignment of ${ctx}, monochromatic light from ${extName} strikes the entry face of a ${fiberLengthM} m step-index fiber (n_core = ${pair.nCore}, n_clad = ${pair.nClad}) at ${launchDeg}° to the central optic axis. Determine the angle of incidence θ_w at the cylindrical core–cladding boundary relative to its normal.`,
          `In ${ctx}, an optical pulse enters a ${fiberLengthM} m step-index fiber (core index ${pair.nCore}, cladding index ${pair.nClad}) from ${extName} at a launch angle of ${launchDeg}° to the axis. Calculate the incident angle θ_w on the core–cladding interface normal.`,
        ]
      : [
          `A ${fiberLengthM} m step-index waveguide in ${ctx} is fabricated with a core of refractive index ${pair.nCore} surrounded by cladding of refractive index ${pair.nClad}, with light launched from ${extName} at ${launchDeg}° to the axis. What is the critical angle θ_c at the core–cladding interface?`,
          `Engineers specifying ${ctx} test a ${fiberLengthM} m step-index optical fiber having n_core = ${pair.nCore} and n_clad = ${pair.nClad} under a ${launchDeg}° test beam from ${extName}. Calculate the minimum angle of incidence to the wall normal required for total internal reflection inside the core.`,
        ];

    const distractors: DistractorCandidate[] = askWall
      ? [
          {
            value: sol.coreAxisAngleDeg,
            rationale:
              "Gives the refracted angle θ_axis relative to the fiber axis instead of subtracting from 90° to find the angle to the wall normal.",
          },
          {
            value: 90 - launchDeg,
            rationale:
              "Subtracts the external launch angle θ_in from 90° without accounting for refraction at the entry end-face.",
          },
          {
            value: sol.criticalAngleDeg,
            rationale:
              "Calculates the core–cladding critical angle θ_c rather than the actual wall incidence angle θ_w for this ray.",
          },
        ]
      : [
          {
            value: radToDeg(Math.asin(1 / pair.nCore)),
            rationale:
              "Computes arcsin(1 / n_core) as if the bare core were surrounded by air instead of cladding of index n_clad.",
          },
          {
            value: 90 - sol.criticalAngleDeg,
            rationale:
              "Finds the complement 90° − θ_c measured to the fiber axis rather than the critical angle measured to the wall normal.",
          },
          {
            value: radToDeg(Math.atan(pair.nClad / pair.nCore)),
            rationale:
              "Uses inverse tangent arctan(n_clad / n_core) instead of arcsin(n_clad / n_core).",
          },
        ];

    const options = buildNumericMcqOptions({
      truth,
      unit: "°",
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "refraction-snell-tir",
      templateArchetype: "step-index-fiber-core-cladding-tir-wall-angle",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "wallIncidentAngleDeg",
        "coreAxisAngleDeg",
        "criticalAngleDeg",
        "acceptanceAngleDeg",
      ],
      targetQuantityKey: targetKey,
      questionPlan: buildDigitFreePlan({
        summary:
          "Analyze entry refraction and core-cladding wall geometry in step-index optical fiber",
        format: "mcq",
        strategies: [
          "confusing axial angle with complement angle to wall normal",
          "omitting cladding index by assuming air boundary",
          "ignoring entry-face refraction when finding wall angle",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: askWall
        ? `At the entry face, ${nExt} sin ${launchDeg}° = ${pair.nCore} sin θ_axis ⇒ θ_axis = ${formatQty(sol.coreAxisAngleDeg, "°", 3)}. Since the core wall is parallel to the axis, its normal is perpendicular to the axis, giving θ_w = 90° − θ_axis = ${formatQty(sol.wallIncidentAngleDeg, "°", 3)}.`
        : `At the core–cladding boundary, sin θ_c = n_clad / n_core = ${pair.nClad} / ${pair.nCore} = ${formatSigFigs(pair.nClad / pair.nCore, 4)}, giving θ_c = ${formatQty(sol.criticalAngleDeg, "°", 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Obtains ${formatQty(truth, "°", 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (6 marks, 3 parts)
  const stems = [
    `In ${ctx}, a straight ${fiberLengthM} m step-index optical fiber has a core of refractive index n_core = ${pair.nCore} and a cladding of refractive index n_clad = ${pair.nClad}. A narrow laser beam in ${extName} strikes the flat entry face at θ_in = ${launchDeg}° to the central axis.`,
    `A ${fiberLengthM} m step-index waveguide deployed in ${ctx} comprises a glass core (n_core = ${pair.nCore}) surrounded by lower-index cladding (n_clad = ${pair.nClad}). Monochromatic light enters from ${extName} at an angle of ${launchDeg}° to the fiber axis.`,
  ];
  return {
    id,
    conceptId: "refraction-snell-tir",
    templateArchetype: "step-index-fiber-core-cladding-tir-wall-angle",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "wallIncidentAngleDeg",
      "coreAxisAngleDeg",
      "criticalAngleDeg",
      "acceptanceAngleDeg",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Evaluate core-cladding critical angle, entry axial refraction angle, and wall incidence angle in optical fiber",
      format: "structured",
      strategies: [
        "compute critical angle from cladding-to-core index ratio",
        "refract launch ray across entry face relative to fiber axis",
        "use right-triangle geometry to find incident angle on cylindrical wall",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the critical angle θ_c at the core–cladding interface.",
        marks: 2,
        targetQuantityKey: "criticalAngleDeg",
        expectedAnswer: formatQty(sol.criticalAngleDeg, "°", 3),
        workingSteps: [
          `sin θ_c = n_clad / n_core = ${pair.nClad} / ${pair.nCore} = ${formatSigFigs(pair.nClad / pair.nCore, 4)}.`,
          `θ_c = ${formatQty(sol.criticalAngleDeg, "°", 3)}.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Calculate the angle θ_axis that the refracted ray inside the core makes with the central axis.",
        marks: 2,
        targetQuantityKey: "coreAxisAngleDeg",
        expectedAnswer: formatQty(sol.coreAxisAngleDeg, "°", 3),
        workingSteps: [
          `n_ext sin θ_in = n_core sin θ_axis ⇒ sin θ_axis = (${nExt} × sin ${launchDeg}°) / ${pair.nCore}.`,
          `θ_axis = ${formatQty(sol.coreAxisAngleDeg, "°", 3)}.`,
        ],
      },
      {
        partId: "c",
        prompt:
          "Determine the angle of incidence θ_w of this ray on the core–cladding wall normal, confirming that total internal reflection occurs.",
        marks: 2,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "wallIncidentAngleDeg",
        expectedAnswer: formatQty(sol.wallIncidentAngleDeg, "°", 3),
        workingSteps: [
          `θ_w = 90° − θ_axis = 90° − ${formatSigFigs(sol.coreAxisAngleDeg, 4)}° = ${formatQty(sol.wallIncidentAngleDeg, "°", 3)} (> θ_c).`,
        ],
      },
    ],
    workedSolution: `(a) sin θ_c = ${pair.nClad} / ${pair.nCore} ⇒ θ_c = ${formatQty(sol.criticalAngleDeg, "°", 3)}. (b) By Snell's law at the end-face, sin θ_axis = (${nExt} sin ${launchDeg}°) / ${pair.nCore}, so θ_axis = ${formatQty(sol.coreAxisAngleDeg, "°", 3)}. (c) Wall incident angle θ_w = 90° − θ_axis = ${formatQty(sol.wallIncidentAngleDeg, "°", 3)}, which exceeds θ_c so the ray is guided by TIR.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Applies sin θ_c = ${pair.nClad} / ${pair.nCore}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains θ_c = ${formatQty(sol.criticalAngleDeg, "°", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Uses ${nExt} sin ${launchDeg}° = ${pair.nCore} sin θ_axis.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains θ_axis = ${formatQty(sol.coreAxisAngleDeg, "°", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Subtracts θ_axis from 90° to obtain θ_w.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains θ_w = ${formatQty(sol.wallIncidentAngleDeg, "°", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

// ============================================================================
// FAMILY 5: Step-Index Optical Fiber — Acceptance Angle, NA & Path Length
// ============================================================================
function buildFamily5FiberAcceptance(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "refraction-snell-tir",
    rng,
  });

  const pair = FIBER_INDEX_PAIRS[(variantIndex + 3) % FIBER_INDEX_PAIRS.length];
  const nExt = variantIndex % 3 === 2 ? 1.33 : 1.0;
  const extDesc = nExt > 1.1 ? "water of refractive index 1.33" : "air of refractive index 1.00";
  const na = Math.sqrt(pair.nCore * pair.nCore - pair.nClad * pair.nClad);
  const acceptDeg = radToDeg(Math.asin(Math.min(0.98, na / nExt)));
  const launchDeg = Number((acceptDeg * (0.45 + 0.09 * (variantIndex % 4))).toFixed(1));
  const fiberLengthM = rng.pick([60, 150, 300, 450, 750]);
  const ctx = FIBER_CONTEXTS[(variantIndex + 5) % FIBER_CONTEXTS.length];

  const spec: OpticalFiberSpec = {
    kind: "optical-fiber",
    nCore: pair.nCore,
    nCladding: pair.nClad,
    nExternal: nExt,
    launchAngleDeg: launchDeg,
    fiberLengthM,
  };
  const sol = solveOpticsShmScenario(spec) as OpticalFiberSolution;

  if (format === "mcq") {
    const subMode = variantIndex % 3;
    if (subMode === 0) {
      // Target: acceptanceAngleDeg
      const stems = [
        `A ${fiberLengthM} m step-index optical fiber in ${ctx} has core refractive index ${pair.nCore} and cladding refractive index ${pair.nClad}, with its flat input face in ${extDesc} (currently aligned with a test ray at ${launchDeg}°). What is the maximum external launch angle θ_max to the fiber axis for which rays remain guided by total internal reflection?`,
        `Engineers coupling light from ${extDesc} into a ${fiberLengthM} m step-index fiber (n_core = ${pair.nCore}, n_clad = ${pair.nClad}, reference beam at ${launchDeg}°) for ${ctx} must stay within the acceptance cone. Calculate the acceptance half-angle θ_max in the external medium.`,
        `In ${ctx}, a ${fiberLengthM} m step-index waveguide with n_core = ${pair.nCore} and n_clad = ${pair.nClad} receives light from ${extDesc} (shown for a ${launchDeg}° ray). Determine the maximum external incidence angle θ_max to the axis that still achieves total internal reflection at the core wall.`,
      ];
      const maxCoreAxisAngle = 90 - sol.criticalAngleDeg;
      const distractors: DistractorCandidate[] = [
        {
          value: maxCoreAxisAngle,
          rationale:
            "Gives the maximum internal angle 90° − θ_c inside the core without refracting across the entry face into the external medium.",
        },
        {
          value: sol.criticalAngleDeg,
          rationale:
            "Confuses the core–cladding critical angle θ_c with the external acceptance half-angle θ_max.",
        },
        {
          value: radToDeg(
            Math.asin(Math.min(0.99, (pair.nCore - pair.nClad) / nExt)),
          ),
          rationale:
            "Uses (n_core − n_clad) instead of √(n_core² − n_clad²) when finding sin θ_max.",
        },
        ...(nExt > 1.1
          ? [
              {
                value: radToDeg(Math.asin(Math.min(0.99, na))),
                rationale:
                  "Omits the external fluid refractive index n_ext = 1.33 when computing sin θ_max = √(n_core² − n_clad²) / n_ext.",
              },
            ]
          : []),
      ];
      const options = buildNumericMcqOptions({
        truth: sol.acceptanceAngleDeg,
        unit: "°",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "refraction-snell-tir",
        templateArchetype: "step-index-fiber-acceptance-angle-aperture",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "wallIncidentAngleDeg",
          "criticalAngleDeg",
          "acceptanceAngleDeg",
          "numericalAperture",
        ],
        targetQuantityKey: "acceptanceAngleDeg",
        questionPlan: buildDigitFreePlan({
          summary:
            "Derive maximum external acceptance half-angle of step-index fiber from critical grazing condition",
          format: "mcq",
          strategies: [
            "stopping at maximum internal core angle before entry-face Snell refraction",
            "equating acceptance angle directly to critical angle",
            "subtracting indices linearly instead of quadrature difference",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `At the grazing limit, sin θ_c = ${pair.nClad} / ${pair.nCore}, so inside the core sin θ_axis,max = cos θ_c = √(1 − (n_clad / n_core)²). By Snell's law at the entry face, n_ext sin θ_max = √(n_core² − n_clad²) = ${formatSigFigs(na, 4)}, giving θ_max = arcsin(${formatSigFigs(na / nExt, 4)}) = ${formatQty(sol.acceptanceAngleDeg, "°", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses n_ext sin θ_max = √(n_core² − n_clad²) to obtain θ_max = ${formatQty(sol.acceptanceAngleDeg, "°", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      // Target: numericalAperture (defined explicitly in stem for 3-syllabus clarity)
      const stems = [
        `For ${ctx}, a ${fiberLengthM} m step-index fiber has core index n_core = ${pair.nCore} and cladding index n_clad = ${pair.nClad} (with an external ray in ${extDesc} launched at ${launchDeg}°). Taking the numerical aperture as NA = √(n_core² − n_clad²), what is the numerical aperture of this fiber?`,
        `Optical specifications for ${ctx} define a ${fiberLengthM} m waveguide's numerical aperture by NA = n_core cos θ_c = √(n_core² − n_clad²). Given n_core = ${pair.nCore}, n_clad = ${pair.nClad}, and a test beam in ${extDesc} at ${launchDeg}°, calculate NA.`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: pair.nCore * pair.nCore - pair.nClad * pair.nClad,
          rationale:
            "Evaluates n_core² − n_clad² without taking the square root.",
        },
        {
          value: Math.sqrt(pair.nCore - pair.nClad),
          rationale:
            "Takes √(n_core − n_clad) instead of √(n_core² − n_clad²).",
        },
        {
          value: pair.nCore - pair.nClad,
          rationale:
            "Computes the simple index difference n_core − n_clad instead of √(n_core² − n_clad²).",
        },
        {
          value: pair.nClad / pair.nCore,
          rationale:
            "Calculates sin θ_c = n_clad / n_core instead of the numerical aperture.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: sol.numericalAperture,
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "refraction-snell-tir",
        templateArchetype: "step-index-fiber-acceptance-angle-aperture",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "wallIncidentAngleDeg",
          "criticalAngleDeg",
          "acceptanceAngleDeg",
          "numericalAperture",
        ],
        targetQuantityKey: "numericalAperture",
        questionPlan: buildDigitFreePlan({
          summary:
            "Compute numerical aperture of step-index optical waveguide from core and cladding refractive indices",
          format: "mcq",
          strategies: [
            "forgetting outer square root on difference of squared indices",
            "taking square root of linear index difference",
            "computing cladding-to-core ratio instead of aperture",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `NA = √(n_core² − n_clad²) = √(${pair.nCore}² − ${pair.nClad}²) = ${formatSigFigs(sol.numericalAperture, 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates √(${pair.nCore}² − ${pair.nClad}²) = ${formatSigFigs(sol.numericalAperture, 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    // subMode === 2: rayPathLengthM
    const stems = [
      `In ${ctx}, a guided ray from ${extDesc} enters a straight ${fiberLengthM} m step-index fiber (n_core = ${pair.nCore}, n_clad = ${pair.nClad}) at launch angle θ_in = ${launchDeg}° to the axis. Neglecting end losses, what total geometric path length does this zig-zagging ray travel through the core?`,
      `A monochromatic ray in ${extDesc} is coupled at ${launchDeg}° to the axis into a straight ${fiberLengthM} m optical fiber (n_core = ${pair.nCore}, n_clad = ${pair.nClad}) during ${ctx}. Calculate the total ray path length inside the ${fiberLengthM} m fiber.`,
    ];
    const distractors: DistractorCandidate[] = [
      {
        value: fiberLengthM / Math.cos(degToRad(launchDeg)),
        rationale:
          "Divides fiber length L by cos θ_in using the external launch angle rather than the refracted core angle θ_axis.",
      },
      {
        value: fiberLengthM * Math.cos(degToRad(sol.coreAxisAngleDeg)),
        rationale:
          "Multiplies L by cos θ_axis instead of dividing L by cos θ_axis, giving a path shorter than the straight fiber.",
      },
      {
        value: (fiberLengthM * pair.nCore) / pair.nClad,
        rationale:
          "Computes the extreme critical-angle path length L(n_core / n_clad) rather than the path length at launch angle θ_in.",
      },
      {
        value: fiberLengthM * pair.nCore,
        rationale:
          "Calculates the optical path length n_core L instead of the geometric zig-zag ray path length L / cos θ_axis.",
      },
      {
        value: fiberLengthM * (1 + Math.sin(degToRad(sol.coreAxisAngleDeg))),
        rationale:
          "Uses L(1 + sin θ_axis) instead of dividing L by cos θ_axis.",
      },
    ];
    const options = buildNumericMcqOptions({
      truth: sol.rayPathLengthM,
      unit: "m",
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "refraction-snell-tir",
      templateArchetype: "step-index-fiber-acceptance-angle-aperture",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "wallIncidentAngleDeg",
        "coreAxisAngleDeg",
        "criticalAngleDeg",
        "acceptanceAngleDeg",
        "rayPathLengthM",
      ],
      targetQuantityKey: "rayPathLengthM",
      questionPlan: buildDigitFreePlan({
        summary:
          "Calculate zig-zag geometric path length of refracted guided ray along step-index fiber",
        format: "mcq",
        strategies: [
          "using unrefracted external launch angle instead of internal core angle",
          "multiplying fiber length by cosine instead of dividing",
          "evaluating steepest critical ray path instead of launched ray path",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: `Inside the core, sin θ_axis = (${nExt} sin ${launchDeg}°) / ${pair.nCore} ⇒ θ_axis = ${formatQty(sol.coreAxisAngleDeg, "°", 3)}. The total zig-zag geometric path length is L_ray = L / cos θ_axis = ${fiberLengthM} / cos ${formatSigFigs(sol.coreAxisAngleDeg, 4)}° = ${formatQty(sol.rayPathLengthM, "m", 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Finds θ_axis = ${formatQty(sol.coreAxisAngleDeg, "°", 3)} and computes L / cos θ_axis = ${formatQty(sol.rayPathLengthM, "m", 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (6 marks)
  const stems = [
    `A straight ${fiberLengthM} m step-index optical fiber in ${ctx} consists of a core of refractive index n_core = ${pair.nCore} and cladding of refractive index n_clad = ${pair.nClad}. Its flat input end sits in ${extDesc}, and a guided test ray is launched at θ_in = ${launchDeg}° to the central axis.`,
    `Engineers characterizing ${ctx} couple a laser beam from ${extDesc} at ${launchDeg}° to the axis into a straight ${fiberLengthM} m step-index waveguide (core index ${pair.nCore}, cladding index ${pair.nClad}).`,
  ];
  return {
    id,
    conceptId: "refraction-snell-tir",
    templateArchetype: "step-index-fiber-acceptance-angle-aperture",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "wallIncidentAngleDeg",
      "coreAxisAngleDeg",
      "criticalAngleDeg",
      "acceptanceAngleDeg",
      "rayPathLengthM",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Determine core-cladding critical angle, external acceptance cone angle, and guided ray path length",
      format: "structured",
      strategies: [
        "compute critical angle at core-cladding wall",
        "derive maximum external launch angle for guided propagation",
        "compute zig-zag path length for specified guided launch angle",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the critical angle θ_c at the core–cladding boundary.",
        marks: 2,
        targetQuantityKey: "criticalAngleDeg",
        expectedAnswer: formatQty(sol.criticalAngleDeg, "°", 3),
        workingSteps: [
          `sin θ_c = ${pair.nClad} / ${pair.nCore} ⇒ θ_c = ${formatQty(sol.criticalAngleDeg, "°", 3)}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Hence calculate the maximum acceptance angle θ_max in ${extDesc} for guided total internal reflection.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "acceptanceAngleDeg",
        expectedAnswer: formatQty(sol.acceptanceAngleDeg, "°", 3),
        workingSteps: [
          `Maximum axial angle in core = 90° − θ_c; n_ext sin θ_max = n_core cos θ_c = √(${pair.nCore}² − ${pair.nClad}²).`,
          `θ_max = ${formatQty(sol.acceptanceAngleDeg, "°", 3)}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Calculate the total geometric path length travelled inside the core by the ray launched at ${launchDeg}°.`,
        marks: 2,
        targetQuantityKey: "rayPathLengthM",
        expectedAnswer: formatQty(sol.rayPathLengthM, "m", 3),
        workingSteps: [
          `sin θ_axis = (${nExt} sin ${launchDeg}°) / ${pair.nCore} ⇒ θ_axis = ${formatQty(sol.coreAxisAngleDeg, "°", 3)}.`,
          `L_ray = ${fiberLengthM} / cos θ_axis = ${formatQty(sol.rayPathLengthM, "m", 3)}.`,
        ],
      },
    ],
    workedSolution: `(a) θ_c = arcsin(${pair.nClad} / ${pair.nCore}) = ${formatQty(sol.criticalAngleDeg, "°", 3)}. (b) Using n_ext sin θ_max = √(n_core² − n_clad²) gives θ_max = ${formatQty(sol.acceptanceAngleDeg, "°", 3)}. (c) For θ_in = ${launchDeg}°, θ_axis = ${formatQty(sol.coreAxisAngleDeg, "°", 3)} and L_ray = ${fiberLengthM} / cos θ_axis = ${formatQty(sol.rayPathLengthM, "m", 3)}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Uses sin θ_c = ${pair.nClad} / ${pair.nCore}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains θ_c = ${formatQty(sol.criticalAngleDeg, "°", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Applies ${nExt} sin θ_max = n_core sin(90° − θ_c).`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains θ_max = ${formatQty(sol.acceptanceAngleDeg, "°", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Finds θ_axis = ${formatQty(sol.coreAxisAngleDeg, "°", 3)} and evaluates L / cos θ_axis.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains L_ray = ${formatQty(sol.rayPathLengthM, "m", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

// ============================================================================
// FAMILY 6: Step-Index Optical Fiber — Modal Dispersion & Transit Delay
// ============================================================================
function buildFamily6FiberModalDispersion(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "refraction-snell-tir",
    rng,
  });

  const pair = FIBER_INDEX_PAIRS[(variantIndex + 6) % FIBER_INDEX_PAIRS.length];
  const fiberLengthM = rng.pick([150, 240, 360, 500, 750, 900, 1200, 1800, 2400]);
  const na = Math.sqrt(pair.nCore * pair.nCore - pair.nClad * pair.nClad);
  const acceptDeg = radToDeg(Math.asin(Math.min(0.98, na)));
  const launchDeg = Number((acceptDeg * (0.4 + 0.1 * (variantIndex % 4))).toFixed(1));
  const c = 3.0e8;
  const ctx = FIBER_CONTEXTS[(variantIndex + 8) % FIBER_CONTEXTS.length];

  const spec: OpticalFiberSpec = {
    kind: "optical-fiber",
    nCore: pair.nCore,
    nCladding: pair.nClad,
    nExternal: 1.0,
    launchAngleDeg: launchDeg,
    fiberLengthM,
    vacuumSpeedMs: c,
  };
  const sol = solveOpticsShmScenario(spec) as OpticalFiberSolution;

  if (format === "mcq") {
    const subMode = variantIndex % 3;
    if (subMode === 0 || subMode === 1) {
      // Target: modalDispersionDelayS
      const stems = [
        `A multimode step-index fiber of length ${fiberLengthM} m in ${ctx} has n_core = ${pair.nCore} and n_clad = ${pair.nClad} in air (n_ext = 1.00, illustrated with a ${launchDeg}° launch ray). Taking c = 3.00 × 10⁸ m s⁻¹ and neglecting material dispersion, what is the maximum multipath (modal) pulse broadening Δt between the fastest axial ray and the slowest guided ray?`,
        `In ${ctx}, a short optical pulse enters a ${fiberLengthM} m step-index fiber (core index ${pair.nCore}, cladding index ${pair.nClad}, n_ext = 1.00, sample launch angle ${launchDeg}°). With c = 3.00 × 10⁸ m s⁻¹, calculate the modal time delay Δt = t_max − t_axial at the output end.`,
        `Engineers evaluating bit-rate limits for ${ctx} test a ${fiberLengthM} m step-index waveguide (n_core = ${pair.nCore}, n_clad = ${pair.nClad}, n_ext = 1.00, ray shown at ${launchDeg}°). Take c = 3.00 × 10⁸ m s⁻¹. Determine the multipath dispersion delay Δt between extreme guided rays and axial rays.`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: sol.maxGuidedTransitTimeS,
          rationale:
            "Calculates the total transit time t_max of the slowest critical-angle ray without subtracting the axial transit time t_axial.",
        },
        {
          value: sol.axialTransitTimeS * (1 - pair.nClad / pair.nCore),
          rationale:
            "Multiplies t_axial by (1 − n_clad / n_core) instead of (n_core / n_clad − 1), inverting sin θ_c.",
        },
        {
          value: (fiberLengthM / c) * (pair.nCore / pair.nClad - 1),
          rationale:
            "Uses the vacuum speed c instead of the core wave speed c / n_core when computing transit times.",
        },
        {
          value: sol.axialTransitTimeS,
          rationale:
            "Computes the axial transit time n_core L / c instead of the multipath pulse delay Δt.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: sol.modalDispersionDelayS,
        unit: "s",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "refraction-snell-tir",
        templateArchetype: "step-index-fiber-modal-dispersion-pulse-delay",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "wallIncidentAngleDeg",
          "criticalAngleDeg",
          "acceptanceAngleDeg",
          "axialTransitTimeS",
          "maxGuidedTransitTimeS",
          "modalDispersionDelayS",
        ],
        targetQuantityKey: "modalDispersionDelayS",
        questionPlan: buildDigitFreePlan({
          summary:
            "Calculate multipath modal pulse broadening between axial and critical-angle rays in step-index fiber",
          format: "mcq",
          strategies: [
            "reporting maximum guided transit time without subtracting axial transit time",
            "inverting cladding-to-core index ratio in longest path expression",
            "using vacuum light speed instead of core phase speed",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `Axial transit time t_min = n_core L / c = (${pair.nCore} × ${fiberLengthM}) / (3.00 × 10⁸) = ${formatQty(sol.axialTransitTimeS, "s", 3)}. At the critical angle sin θ_c = n_clad / n_core, t_max = t_min / sin θ_c = n_core² L / (c n_clad) = ${formatQty(sol.maxGuidedTransitTimeS, "s", 3)}. Modal delay Δt = t_max − t_min = ${formatQty(sol.modalDispersionDelayS, "s", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates Δt = (n_core L / c)(n_core / n_clad − 1) = ${formatQty(sol.modalDispersionDelayS, "s", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    // subMode === 2: maxGuidedTransitTimeS
    const stems = [
      `In ${ctx}, light from air (n_ext = 1.00, illustrated at ${launchDeg}°) propagates along a ${fiberLengthM} m step-index fiber with n_core = ${pair.nCore} and n_clad = ${pair.nClad}. Taking c = 3.00 × 10⁸ m s⁻¹, what is the transit time t_max of the slowest guided ray that meets the core–cladding wall at the critical angle?`,
      `A ${fiberLengthM} m multimode step-index cable in ${ctx} has core index ${pair.nCore} and cladding index ${pair.nClad} in air (n_ext = 1.00, sample launch angle ${launchDeg}°, c = 3.00 × 10⁸ m s⁻¹). Calculate the maximum guided transit time through the fiber.`,
    ];
    const distractors: DistractorCandidate[] = [
      {
        value: sol.axialTransitTimeS,
        rationale:
          "Computes the shortest axial transit time n_core L / c rather than the critical-angle zig-zag transit time.",
      },
      {
        value: (fiberLengthM * pair.nClad) / c,
        rationale:
          "Substitutes cladding index n_clad L / c instead of n_core² L / (c n_clad).",
      },
      {
        value: fiberLengthM / (c * (pair.nClad / pair.nCore)),
        rationale:
          "Divides vacuum transit time L / c by sin θ_c while omitting the factor n_core for reduced wave speed in the core.",
      },
      {
        value: sol.modalDispersionDelayS,
        rationale:
          "Calculates the pulse broadening Δt = t_max − t_min instead of t_max.",
      },
    ];
    const options = buildNumericMcqOptions({
      truth: sol.maxGuidedTransitTimeS,
      unit: "s",
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "refraction-snell-tir",
      templateArchetype: "step-index-fiber-modal-dispersion-pulse-delay",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "wallIncidentAngleDeg",
        "criticalAngleDeg",
        "axialTransitTimeS",
        "maxGuidedTransitTimeS",
        "modalDispersionDelayS",
      ],
      targetQuantityKey: "maxGuidedTransitTimeS",
      questionPlan: buildDigitFreePlan({
        summary:
          "Compute longest guided transit time at grazing critical angle in step-index fiber",
        format: "mcq",
        strategies: [
          "computing straight axial transit time instead of steepest guided ray",
          "forgetting core refractive index speed reduction factor",
          "reporting differential delay instead of total transit time",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: `Wave speed in the core is v = c / n_core, and the critical-angle ray travels path length L / sin θ_c = L (n_core / n_clad). Therefore t_max = n_core² L / (c n_clad) = ${formatQty(sol.maxGuidedTransitTimeS, "s", 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates t_max = n_core² L / (c n_clad) = ${formatQty(sol.maxGuidedTransitTimeS, "s", 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (6 marks)
  const stems = [
    `A ${fiberLengthM} m multimode step-index optical fiber in ${ctx} has a core of refractive index n_core = ${pair.nCore} and cladding of refractive index n_clad = ${pair.nClad} in air (n_ext = 1.00, shown with a guided ray launched at ${launchDeg}°). Take the speed of light in vacuum to be c = 3.00 × 10⁸ m s⁻¹.`,
    `During pulse-broadening tests for ${ctx}, engineers transmit narrow laser pulses from air (n_ext = 1.00, sample launch angle ${launchDeg}°) along a ${fiberLengthM} m step-index fiber of core index ${pair.nCore} and cladding index ${pair.nClad}. Take c = 3.00 × 10⁸ m s⁻¹.`,
  ];
  return {
    id,
    conceptId: "refraction-snell-tir",
    templateArchetype: "step-index-fiber-modal-dispersion-pulse-delay",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "wallIncidentAngleDeg",
      "criticalAngleDeg",
      "axialTransitTimeS",
      "maxGuidedTransitTimeS",
      "modalDispersionDelayS",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Evaluate axial transit time, longest critical-angle transit time, and modal pulse broadening in optical fiber",
      format: "structured",
      strategies: [
        "compute axial transit time from core refractive index and length",
        "derive longest guided transit time using critical-angle geometry",
        "subtract axial from longest time to obtain multipath pulse broadening",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts: [
      {
        partId: "a",
        prompt:
          "Calculate the transit time t_axial of an axial ray travelling straight along the center of the core.",
        marks: 2,
        targetQuantityKey: "axialTransitTimeS",
        expectedAnswer: formatQty(sol.axialTransitTimeS, "s", 3),
        workingSteps: [
          `v_core = c / n_core = 3.00 × 10⁸ / ${pair.nCore}.`,
          `t_axial = n_core L / c = (${pair.nCore} × ${fiberLengthM}) / (3.00 × 10⁸) = ${formatQty(sol.axialTransitTimeS, "s", 3)}.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Calculate the transit time t_max of the slowest guided ray that strikes the core–cladding boundary just above the critical angle.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "maxGuidedTransitTimeS",
        expectedAnswer: formatQty(sol.maxGuidedTransitTimeS, "s", 3),
        workingSteps: [
          `sin θ_c = n_clad / n_core = ${pair.nClad} / ${pair.nCore}, so L_max = L / sin θ_c = L (n_core / n_clad).`,
          `t_max = n_core² L / (c n_clad) = ${formatQty(sol.maxGuidedTransitTimeS, "s", 3)}.`,
        ],
      },
      {
        partId: "c",
        prompt:
          "Determine the maximum multipath (modal) pulse broadening Δt over this fiber length.",
        marks: 2,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "modalDispersionDelayS",
        expectedAnswer: formatQty(sol.modalDispersionDelayS, "s", 3),
        workingSteps: [
          `Δt = t_max − t_axial = ${formatQty(sol.modalDispersionDelayS, "s", 3)}.`,
        ],
      },
    ],
    workedSolution: `(a) t_axial = n_core L / c = (${pair.nCore} × ${fiberLengthM}) / 3.00 × 10⁸ = ${formatQty(sol.axialTransitTimeS, "s", 3)}. (b) Longest guided ray has path L / sin θ_c = L n_core / n_clad, giving t_max = n_core² L / (c n_clad) = ${formatQty(sol.maxGuidedTransitTimeS, "s", 3)}. (c) Modal pulse delay Δt = t_max − t_axial = ${formatQty(sol.modalDispersionDelayS, "s", 3)}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Uses t_axial = n_core L / c with n_core = ${pair.nCore} and L = ${fiberLengthM} m.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains t_axial = ${formatQty(sol.axialTransitTimeS, "s", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies L_max = L (n_core / n_clad) to find t_max = t_axial (n_core / n_clad).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains t_max = ${formatQty(sol.maxGuidedTransitTimeS, "s", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Subtracts t_axial from t_max.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains Δt = ${formatQty(sol.modalDispersionDelayS, "s", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

// ============================================================================
// FAMILY 7: Converging Thin Lens — Real Image, Magnification & Separation
// (STRICTLY A-Level Y13 ONLY via getCompatibleSyllabiForConcept — NEVER IB/NCUK!)
// ============================================================================
function buildFamily7ConvergingReal(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "thin-lenses-geometric-optics",
    rng,
    thinLensSubtopic: "alevel-3-9-astrophysics",
  });

  const f = rng.pick([0.08, 0.1, 0.12, 0.15, 0.18, 0.2, 0.24, 0.25]);
  // Avoid u = 2f (so absMagnification != 1 and != 2)
  const uMultipliers = [1.3, 1.4, 1.6, 1.75, 2.4, 2.6, 3.2, 3.5, 4.0];
  const u = Number((f * uMultipliers[(variantIndex + rng.int(0, 3)) % uMultipliers.length]).toFixed(4));
  const ho = rng.pick([0.015, 0.024, 0.03, 0.036, 0.045]);
  const ctx = CONVERGING_LENS_CONTEXTS[variantIndex % CONVERGING_LENS_CONTEXTS.length];

  const spec: ThinLensSpec = {
    kind: "thin-lens",
    lensType: "converging",
    focalLengthM: f,
    objectDistanceM: u,
    objectHeightM: ho,
  };
  const sol = solveOpticsShmScenario(spec) as ThinLensSolution;
  const v = sol.imageDistanceM!;
  const absM = sol.absMagnification!;
  const sep = sol.objectImageSeparationM!;

  if (format === "mcq") {
    const subMode = variantIndex % 3;
    if (subMode === 0) {
      // Target: imageDistanceM
      const stems = [
        `In ${ctx}, an illuminated object of height ${ho} m is positioned ${u} m in front of a thin converging lens of focal length ${f} m. Using 1/f = 1/u + 1/v, at what image distance v behind the lens does the sharp real image form?`,
        `A thin convex lens of focal length ${f} m in ${ctx} forms a real inverted image of an object of height ${ho} m placed at object distance u = ${u} m. Calculate the image distance v from the optical center.`,
        `During alignment of ${ctx}, an upright test target of height ${ho} m sits ${u} m from a thin converging lens of focal length ${f} m. Determine the distance v from the lens to the focused screen.`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: (u * f) / (u + f),
          rationale:
            "Computes 1/v = 1/f + 1/u instead of 1/f − 1/u (equivalent to treating the converging lens as diverging or adding reciprocals).",
        },
        {
          value: 1 / v,
          rationale:
            "Stops after evaluating 1/v = 1/f − 1/u in m⁻¹ without taking the reciprocal to obtain v in metres.",
        },
        {
          value: Math.abs(u - f),
          rationale:
            "Subtracts focal length directly from object distance |u − f| instead of using reciprocal distances.",
        },
        {
          value: sep,
          rationale:
            "Calculates the total object-to-screen separation u + v rather than the lens-to-image distance v.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: v,
        unit: "m",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "thin-lenses-geometric-optics",
        templateArchetype: "converging-thin-lens-real-image",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "imageDistanceM",
          "magnification",
          "absMagnification",
          "imageHeightM",
          "objectImageSeparationM",
          "opticalPowerD",
        ],
        targetQuantityKey: "imageDistanceM",
        questionPlan: buildDigitFreePlan({
          summary:
            "Calculate real image distance for converging thin lens using real-is-positive lens equation",
          format: "mcq",
          strategies: [
            "adding reciprocals instead of subtracting object distance reciprocal",
            "omitting final reciprocal inversion of image vergence",
            "confusing image distance with total object-to-screen distance",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `From 1/f = 1/u + 1/v, we have 1/v = 1/${f} − 1/${u} = ${formatSigFigs(1 / v, 4)} m⁻¹, so v = ${formatQty(v, "m", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates v = uf / (u − f) = ${formatQty(v, "m", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      // Target: absMagnification
      const stems = [
        `An illuminated graticule of height ${ho} m is placed ${u} m from a thin converging lens of focal length ${f} m in ${ctx}. What is the magnitude |m| = v / u of the linear magnification of the resulting real image?`,
        `In ${ctx}, a thin convex objective of focal length ${f} m images a specimen of height ${ho} m located at u = ${u} m onto a sensor. Calculate the unsigned linear magnification |m| of the image.`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: u / v,
          rationale:
            "Inverts the magnification ratio, computing u / v instead of v / u.",
        },
        {
          value: f / u,
          rationale:
            "Divides focal length f by object distance u instead of dividing image distance v by u.",
        },
        {
          value: f / (u + f),
          rationale:
            "Uses f / (u + f) by treating the converging lens focal length as negative in the lens equation.",
        },
        {
          value: u / f,
          rationale:
            "Computes the ratio u / f instead of |m| = f / (u − f).",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: absM,
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "thin-lenses-geometric-optics",
        templateArchetype: "converging-thin-lens-real-image",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "imageDistanceM",
          "magnification",
          "absMagnification",
          "imageHeightM",
          "objectImageSeparationM",
          "opticalPowerD",
        ],
        targetQuantityKey: "absMagnification",
        questionPlan: buildDigitFreePlan({
          summary:
            "Determine unsigned linear magnification of real image formed by thin converging lens",
          format: "mcq",
          strategies: [
            "inverting image-to-object distance ratio",
            "using focal-to-object ratio instead of image-to-object ratio",
            "sign error in lens equation denominator",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `First, v = uf / (u − f) = (${u} × ${f}) / (${u} − ${f}) = ${formatQty(v, "m", 3)}. Hence |m| = v / u = ${formatSigFigs(v, 4)} / ${u} = ${formatSigFigs(absM, 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds v = ${formatQty(v, "m", 3)} and |m| = v / u = ${formatSigFigs(absM, 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    // subMode === 2: Inverse focalLengthM from given u and real v!
    const vShown = formatSigFigs(v, 3);
    const stems = [
      `On ${ctx}, an object of height ${ho} m placed ${u} m in front of a thin converging lens produces a sharp inverted real image on a screen ${vShown} m behind the lens. What is the focal length f of the lens?`,
      `During focal-length verification on ${ctx}, an illuminated arrow of height ${ho} m at u = ${u} m is focused onto a detector located v = ${vShown} m on the opposite side of a thin convex lens. Calculate the lens focal length f.`,
    ];
    const distractors: DistractorCandidate[] = [
      {
        value: Math.abs((u * v) / (u - v)),
        rationale:
          "Subtracts 1/v from 1/u instead of adding 1/u + 1/v (treating the real image as virtual with v < 0).",
      },
      {
        value: 1 / f,
        rationale:
          "Computes the optical power 1/f = 1/u + 1/v in dioptres without taking the reciprocal to find f in metres.",
      },
      {
        value: (u + v) / 2,
        rationale:
          "Averages u and v arithmetic-style instead of applying the harmonic thin-lens relation.",
      },
    ];
    const options = buildNumericMcqOptions({
      truth: f,
      unit: "m",
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "thin-lenses-geometric-optics",
      templateArchetype: "converging-thin-lens-real-image",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "focalLengthM",
        "focalLengthMagnitudeM",
        "opticalPowerD",
        "magnification",
        "absMagnification",
        "imageHeightM",
        "objectImageSeparationM",
      ],
      requiredGivens: [
        { name: "objectDistanceM", value: u, unit: "m", source: "either" },
        { name: "objectHeightM", value: ho, unit: "m", source: "either" },
        { name: "imageDistanceM", value: v, unit: "m", source: "either" },
      ],
      targetQuantityKey: "focalLengthM",
      questionPlan: buildDigitFreePlan({
        summary:
          "Determine converging lens focal length from conjugate object and real image distances",
        format: "mcq",
        strategies: [
          "treating real image distance as negative virtual image",
          "reporting dioptre optical power instead of focal length",
          "taking arithmetic mean instead of reciprocal sum",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: `Using 1/f = 1/u + 1/v = 1/${u} + 1/${vShown} = ${formatSigFigs(1 / f, 4)} m⁻¹, we obtain f = ${formatQty(f, "m", 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates f = uv / (u + v) = ${formatQty(f, "m", 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (6 marks)
  const stems = [
    `In ${ctx}, a thin converging lens of focal length f = ${f} m forms a real inverted image of an illuminated object of height h_o = ${ho} m placed at an object distance u = ${u} m along the principal axis.`,
    `An optical rail in ${ctx} carries an illuminated target of height ${ho} m positioned ${u} m in front of a thin convex lens of focal length ${f} m, projecting a real image onto a viewing screen.`,
  ];
  return {
    id,
    conceptId: "thin-lenses-geometric-optics",
    templateArchetype: "converging-thin-lens-real-image",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "imageDistanceM",
      "magnification",
      "absMagnification",
      "imageHeightM",
      "objectImageSeparationM",
      "opticalPowerD",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Compute real image distance, unsigned linear magnification, and total object-to-screen separation for converging lens",
      format: "structured",
      strategies: [
        "solve thin-lens equation for positive real image distance",
        "evaluate unsigned linear magnification from conjugate distances",
        "sum object and image distances to find total rail length",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts: [
      {
        partId: "a",
        prompt:
          "Calculate the distance v from the optical center of the lens to the focused real image.",
        marks: 2,
        targetQuantityKey: "imageDistanceM",
        expectedAnswer: formatQty(v, "m", 3),
        workingSteps: [
          `1/v = 1/f − 1/u = 1/${f} − 1/${u} = ${formatSigFigs(1 / v, 4)} m⁻¹.`,
          `v = ${formatQty(v, "m", 3)}.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Determine the unsigned linear magnification |m| = v / u of the image.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "absMagnification",
        expectedAnswer: formatSigFigs(absM, 3),
        workingSteps: [
          `|m| = v / u = ${formatSigFigs(v, 4)} / ${u} = ${formatSigFigs(absM, 3)}.`,
        ],
      },
      {
        partId: "c",
        prompt:
          "Calculate the total axial distance between the object and the focused screen.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "objectImageSeparationM",
        expectedAnswer: formatQty(sep, "m", 3),
        workingSteps: [
          `Total separation = u + v = ${u} + ${formatSigFigs(v, 4)} = ${formatQty(sep, "m", 3)}.`,
        ],
      },
    ],
    workedSolution: `(a) 1/v = 1/${f} − 1/${u} ⇒ v = ${formatQty(v, "m", 3)}. (b) |m| = v / u = ${formatSigFigs(absM, 3)}. (c) Object-to-screen separation = u + v = ${formatQty(sep, "m", 3)}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Applies 1/v = 1/${f} − 1/${u}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains v = ${formatQty(v, "m", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Divides v by u.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains |m| = ${formatSigFigs(absM, 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Adds object distance u and positive real image distance v.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains ${formatQty(sep, "m", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

// ============================================================================
// FAMILY 8: Converging Thin Lens — Virtual Magnifier Regime (u < f)
// (STRICTLY A-Level Y13 ONLY via getCompatibleSyllabiForConcept — NEVER IB/NCUK!)
// ============================================================================
function buildFamily8ConvergingVirtual(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "thin-lenses-geometric-optics",
    rng,
    thinLensSubtopic: "alevel-3-9-astrophysics",
  });

  const f = rng.pick([0.08, 0.1, 0.12, 0.15, 0.2, 0.24, 0.25]);
  // Avoid m = 2 (i.e. u = 0.5*f) so hidden magnification never equals 2 ("2F" label)
  const uFracs = [0.35, 0.4, 0.6, 0.68, 0.75, 0.8];
  const u = Number((f * uFracs[(variantIndex + rng.int(0, 2)) % uFracs.length]).toFixed(4));
  const ho = rng.pick([0.008, 0.012, 0.015, 0.018, 0.022]);
  const ctx = CONVERGING_LENS_CONTEXTS[(variantIndex + 4) % CONVERGING_LENS_CONTEXTS.length];

  const spec: ThinLensSpec = {
    kind: "thin-lens",
    lensType: "converging",
    focalLengthM: f,
    objectDistanceM: u,
    objectHeightM: ho,
  };
  const sol = solveOpticsShmScenario(spec) as ThinLensSolution;
  const v = sol.imageDistanceM!; // negative!
  const m = sol.magnification!; // positive (> 1)
  const hi = sol.imageHeightM!; // positive

  if (format === "mcq") {
    const subMode = variantIndex % 3;
    if (subMode === 0) {
      // Target: signed imageDistanceM (v < 0)
      const stems = [
        `In ${ctx}, a small specimen of height ${ho} m is held ${u} m in front of a thin converging magnifier lens of focal length ${f} m. Using the real-is-positive sign convention (1/f = 1/u + 1/v), what is the signed image distance v?`,
        `A watchmaker's converging lens of focal length ${f} m in ${ctx} views an object of height ${ho} m placed inside the focal point at u = ${u} m. Under the real-is-positive convention (v < 0 for virtual images), calculate v.`,
        `Within ${ctx}, an upright scale mark of height ${ho} m sits ${u} m from a thin convex lens of focal length ${f} m. Applying 1/f = 1/u + 1/v in the real-is-positive convention, determine the signed image position v.`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: Math.abs(v),
          rationale:
            "Forgets that v < 0 for a virtual image in the real-is-positive sign convention, reporting +|v| as if a real image formed behind the lens.",
        },
        {
          value: (u * f) / (u + f),
          rationale:
            "Adds 1/f + 1/u instead of evaluating 1/v = 1/f − 1/u.",
        },
        {
          value: -(u * f) / (u + f),
          rationale:
            "Substitutes a negative focal length −f as if the magnifier were a diverging lens.",
        },
        {
          value: 1 / v,
          rationale:
            "Leaves the answer as 1/v in m⁻¹ instead of inverting to find v in metres.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: v,
        unit: "m",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "thin-lenses-geometric-optics",
        templateArchetype: "converging-lens-virtual-magnifier",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "imageDistanceM",
          "magnification",
          "absMagnification",
          "imageHeightM",
          "objectImageSeparationM",
          "opticalPowerD",
        ],
        targetQuantityKey: "imageDistanceM",
        questionPlan: buildDigitFreePlan({
          summary:
            "Apply real-is-positive thin-lens formula when object lies inside focal point of converging lens",
          format: "mcq",
          strategies: [
            "omitting negative sign required for virtual image position",
            "adding reciprocals instead of subtracting",
            "treating converging lens focal length as negative",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `Because u = ${u} m < f = ${f} m, 1/v = 1/${f} − 1/${u} = ${formatSigFigs(1 / v, 4)} m⁻¹, giving a signed virtual image distance v = ${formatQty(v, "m", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes 1/v = 1/${f} − 1/${u} to obtain signed v = ${formatQty(v, "m", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      // Target: imageHeightM
      const stems = [
        `A thin converging inspection lens of focal length ${f} m in ${ctx} views an upright feature of height ${ho} m held at object distance u = ${u} m (< f). What is the height h_i of the virtual upright image?`,
        `In ${ctx}, a specimen of height ${ho} m is placed ${u} m in front of a convex magnifying lens of focal length ${f} m. Calculate the upright virtual image height h_i.`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: (ho * f) / (f + u),
          rationale:
            "Uses the diverging-lens formula f / (f + u) for magnification, obtaining a diminished height smaller than h_o.",
        },
        {
          value: (ho * u) / Math.abs(v),
          rationale:
            "Inverts linear magnification as u / |v| instead of |v| / u.",
        },
        {
          value: ho * (f / u),
          rationale:
            "Approximates magnification as f / u instead of |v| / u = f / (f − u).",
        },
        {
          value: m,
          rationale:
            "Stops after computing the dimensionless magnification m without multiplying by object height h_o.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: hi,
        unit: "m",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "thin-lenses-geometric-optics",
        templateArchetype: "converging-lens-virtual-magnifier",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "imageDistanceM",
          "magnification",
          "absMagnification",
          "imageHeightM",
          "objectImageSeparationM",
          "opticalPowerD",
        ],
        targetQuantityKey: "imageHeightM",
        questionPlan: buildDigitFreePlan({
          summary:
            "Calculate magnified upright virtual image height for simple converging magnifier",
          format: "mcq",
          strategies: [
            "using diverging denominator f plus u instead of f minus u",
            "inverting magnification ratio",
            "omitting multiplication by object height",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `From 1/v = 1/${f} − 1/${u}, v = ${formatQty(v, "m", 3)}. Linear magnification m = −v / u = ${formatSigFigs(m, 4)}, so upright image height h_i = m h_o = ${formatQty(hi, "m", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds v = ${formatQty(v, "m", 3)}, m = ${formatSigFigs(m, 3)}, and h_i = ${formatQty(hi, "m", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    // subMode === 2: Inverse objectDistanceM given virtual image distance v < 0!
    const vAbsShown = formatSigFigs(Math.abs(v), 3);
    const stems = [
      `In ${ctx}, a thin converging lens of focal length ${f} m is used as a simple magnifier so that an object of height ${ho} m forms an upright virtual image ${vAbsShown} m in front of the lens (v = −${vAbsShown} m in the real-is-positive convention). At what object distance u in front of the lens is the object held?`,
      `An observer using ${ctx} adjusts the position of a ${ho} m scale mark in front of a thin convex lens of focal length ${f} m until its virtual image lies at the near point ${vAbsShown} m on the object side of the lens (v = −${vAbsShown} m). Calculate the object distance u.`,
    ];
    const uIfPositiveV = Math.abs((Math.abs(v) * f) / (Math.abs(v) - f));
    const distractors: DistractorCandidate[] = [
      ...(Number.isFinite(uIfPositiveV) && uIfPositiveV > 0
        ? [
            {
              value: uIfPositiveV,
              rationale:
                "Forgets v < 0 for a virtual image and substitutes v = +|v| into 1/u = 1/f − 1/v instead of v = −|v|.",
            },
          ]
        : []),
      {
        value: 1 / u,
        rationale:
          "Computes 1/u in m⁻¹ without taking the reciprocal to find u in metres.",
      },
      {
        value: Math.abs(Math.abs(v) - f),
        rationale:
          "Subtracts focal length directly from |v| instead of adding reciprocals 1/f + 1/|v|.",
      },
    ];
    const options = buildNumericMcqOptions({
      truth: u,
      unit: "m",
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "thin-lenses-geometric-optics",
      templateArchetype: "converging-lens-virtual-magnifier",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "objectDistanceM",
        "magnification",
        "absMagnification",
        "imageHeightM",
        "objectImageSeparationM",
        "opticalPowerD",
      ],
      requiredGivens: [
        { name: "focalLengthM", value: f, unit: "m", source: "either" },
        { name: "objectHeightM", value: ho, unit: "m", source: "either" },
        { name: "imageDistanceM", value: v, unit: "m", source: "either" },
      ],
      targetQuantityKey: "objectDistanceM",
      questionPlan: buildDigitFreePlan({
        summary:
          "Solve thin-lens equation for object distance required to place virtual image at specified near-point distance",
        format: "mcq",
        strategies: [
          "forgetting negative sign on virtual image distance when solving for object position",
          "forgetting reciprocal of object vergence",
          "subtracting distances directly without reciprocals",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: `For a virtual image in the real-is-positive convention, v = ${formatQty(v, "m", 3)}. Thus 1/u = 1/f − 1/v = 1/${f} − (1/${formatSigFigs(v, 4)}) = ${formatSigFigs(1 / u, 4)} m⁻¹, giving u = ${formatQty(u, "m", 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Substitutes negative v = ${formatQty(v, "m", 3)} into 1/u = 1/f − 1/v to obtain u = ${formatQty(u, "m", 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (6 marks)
  const stems = [
    `In ${ctx}, an upright object of height h_o = ${ho} m is held at a distance u = ${u} m in front of a thin converging magnifying lens of focal length f = ${f} m. Use the real-is-positive sign convention (1/f = 1/u + 1/v, m = −v/u).`,
    `During close inspection on ${ctx}, a thin convex lens of focal length ${f} m is positioned ${u} m from a fine detail of height ${ho} m. Adopt the real-is-positive sign convention throughout.`,
  ];
  return {
    id,
    conceptId: "thin-lenses-geometric-optics",
    templateArchetype: "converging-lens-virtual-magnifier",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "imageDistanceM",
      "magnification",
      "absMagnification",
      "imageHeightM",
      "objectImageSeparationM",
      "opticalPowerD",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Evaluate signed virtual image position, upright linear magnification, and virtual image height for converging magnifier",
      format: "structured",
      strategies: [
        "calculate negative signed image distance for object inside focal point",
        "evaluate positive upright linear magnification",
        "compute magnified virtual image height",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts: [
      {
        partId: "a",
        prompt:
          "Calculate the signed image distance v and hence state why the image is virtual.",
        marks: 2,
        targetQuantityKey: "imageDistanceM",
        expectedAnswer: formatQty(v, "m", 3),
        workingSteps: [
          `1/v = 1/${f} − 1/${u} = ${formatSigFigs(1 / v, 4)} m⁻¹.`,
          `v = ${formatQty(v, "m", 3)} (negative v indicates a virtual image on the object side).`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Calculate the linear magnification m = −v / u of the virtual image.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "magnification",
        expectedAnswer: formatSigFigs(m, 3),
        workingSteps: [
          `m = −v / u = −(${formatSigFigs(v, 4)}) / ${u} = ${formatSigFigs(m, 3)}.`,
        ],
      },
      {
        partId: "c",
        prompt: "Determine the height h_i of the upright virtual image.",
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "imageHeightM",
        expectedAnswer: formatQty(hi, "m", 3),
        workingSteps: [
          `h_i = m h_o = ${formatSigFigs(m, 4)} × ${ho} = ${formatQty(hi, "m", 3)}.`,
        ],
      },
    ],
    workedSolution: `(a) 1/v = 1/${f} − 1/${u} ⇒ v = ${formatQty(v, "m", 3)} (virtual, since v < 0). (b) m = −v / u = ${formatSigFigs(m, 3)}. (c) Upright virtual image height h_i = m h_o = ${formatQty(hi, "m", 3)}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Substitutes u = ${u} m and f = ${f} m into 1/v = 1/f − 1/u.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains signed v = ${formatQty(v, "m", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies m = −v / u.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains m = ${formatSigFigs(m, 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Multiplies magnification m by object height h_o.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains h_i = ${formatQty(hi, "m", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

// ============================================================================
// FAMILY 9: Diverging Thin Lens — Negative Focal Length, Dioptres & Virtual Image
// (STRICTLY A-Level Y13 ONLY via getCompatibleSyllabiForConcept — NEVER IB/NCUK!)
// ============================================================================
function buildFamily9DivergingLens(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "thin-lenses-geometric-optics",
    rng,
    thinLensSubtopic: "alevel-3-10-medical-physics",
  });

  const fAbs = rng.pick([0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4]);
  const fSigned = -fAbs;
  // Avoid u == fAbs (which would make wrong-sign f>0 divide by zero)
  const uMultipliers = [0.6, 0.8, 1.4, 1.5, 1.8, 2.5, 3.0];
  const u = Number((fAbs * uMultipliers[(variantIndex + rng.int(0, 2)) % uMultipliers.length]).toFixed(4));
  const ho = rng.pick([0.02, 0.03, 0.036, 0.045, 0.05]);
  const ctx = DIVERGING_LENS_CONTEXTS[variantIndex % DIVERGING_LENS_CONTEXTS.length];

  const spec: ThinLensSpec = {
    kind: "thin-lens",
    lensType: "diverging",
    focalLengthM: fSigned,
    objectDistanceM: u,
    objectHeightM: ho,
  };
  const sol = solveOpticsShmScenario(spec) as ThinLensSolution;
  const v = sol.imageDistanceM!; // negative
  const m = sol.magnification!; // positive in (0, 1)
  const powerD = sol.opticalPowerD; // negative D
  const sep = sol.objectImageSeparationM!; // u - |v|

  if (format === "mcq") {
    const subMode = variantIndex % 3;
    if (subMode === 0 || subMode === 1) {
      // Target: signed imageDistanceM (v < 0)
      const wrongSignV = (u * fAbs) / (u - fAbs);
      const stems = [
        `In ${ctx}, an upright test object of height ${ho} m stands ${u} m in front of a thin diverging lens of focal length magnitude ${fAbs} m (f = −${fAbs} m in the real-is-positive convention). What is the signed image distance v?`,
        `A concave diverging lens with focal length f = −${fAbs} m in ${ctx} forms an image of an object of height ${ho} m placed at object distance u = ${u} m. Using 1/f = 1/u + 1/v, calculate the signed image distance v.`,
        `During optical testing on ${ctx}, a ${ho} m illuminated target sits ${u} m from a thin diverging lens of focal length −${fAbs} m. Determine the signed image position v under the real-is-positive sign convention.`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: wrongSignV,
          rationale:
            "Forgets that a diverging lens has negative focal length f < 0, substituting +|f| into 1/v = 1/f − 1/u.",
        },
        {
          value: Math.abs(v),
          rationale:
            "Computes the correct magnitude |v| but omits the negative sign required for a virtual image in the real-is-positive convention.",
        },
        {
          value: 1 / v,
          rationale:
            "Stops at 1/v = −1/|f| − 1/u in m⁻¹ without taking the reciprocal to find v in metres.",
        },
        {
          value: -sep,
          rationale:
            "Confuses the virtual image distance from the lens with the signed separation from the object.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: v,
        unit: "m",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "thin-lenses-geometric-optics",
        templateArchetype: "diverging-lens-virtual-image-dioptres",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "imageDistanceM",
          "magnification",
          "absMagnification",
          "imageHeightM",
          "objectImageSeparationM",
          "opticalPowerD",
        ],
        targetQuantityKey: "imageDistanceM",
        questionPlan: buildDigitFreePlan({
          summary:
            "Evaluate signed virtual image position for diverging thin lens with negative focal length",
          format: "mcq",
          strategies: [
            "forgetting negative sign on diverging lens focal length",
            "omitting negative sign on virtual image distance",
            "omitting reciprocal inversion of image vergence",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `For a diverging lens, f = −${fAbs} m. Using 1/f = 1/u + 1/v gives 1/v = −1/${fAbs} − 1/${u} = ${formatSigFigs(1 / v, 4)} m⁻¹, so v = ${formatQty(v, "m", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses negative f = −${fAbs} m in 1/v = 1/f − 1/u to obtain v = ${formatQty(v, "m", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    // subMode === 2: magnification (diminished upright 0 < m < 1)
    const wrongSignM = -((u * fAbs) / (u - fAbs)) / u;
    const stems = [
      `A thin diverging lens of focal length f = −${fAbs} m in ${ctx} forms a virtual image of an upright object of height ${ho} m placed at u = ${u} m. What is the linear magnification m = −v / u of the image?`,
      `In ${ctx}, an object of height ${ho} m is positioned ${u} m from a concave lens of focal length −${fAbs} m. Calculate the signed linear magnification m = h_i / h_o = −v / u.`,
    ];
    const distractors: DistractorCandidate[] = [
      {
        value: Math.abs(wrongSignM),
        rationale:
          "Substitutes positive f = +|f| instead of negative f = −|f| into the lens equation before computing magnification.",
      },
      {
        value: -m,
        rationale:
          "Assigns a negative magnification as if a diverging lens formed an inverted real image of a real object.",
      },
      {
        value: 1 / m,
        rationale:
          "Inverts the magnification ratio as u / |v| (> 1) instead of |v| / u (< 1).",
      },
    ];
    const options = buildNumericMcqOptions({
      truth: m,
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "thin-lenses-geometric-optics",
      templateArchetype: "diverging-lens-virtual-image-dioptres",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "imageDistanceM",
        "magnification",
        "absMagnification",
        "imageHeightM",
        "objectImageSeparationM",
        "opticalPowerD",
      ],
      targetQuantityKey: "magnification",
      questionPlan: buildDigitFreePlan({
        summary:
          "Compute diminished upright linear magnification produced by diverging thin lens",
        format: "mcq",
        strategies: [
          "using positive focal length instead of negative focal length",
          "assigning inverted negative magnification to upright virtual image",
          "inverting magnification ratio above unity",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: `With f = −${fAbs} m, 1/v = −1/${fAbs} − 1/${u} gives v = ${formatQty(v, "m", 3)}. Therefore m = −v / u = −(${formatSigFigs(v, 4)}) / ${u} = ${formatSigFigs(m, 3)} (upright and diminished).`,
      markScheme: [
        {
          code: "A1",
          criterion: `Finds v = ${formatQty(v, "m", 3)} and m = −v / u = ${formatSigFigs(m, 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (5 marks: 1m power + 2m v + 2m sep/height)
  const stems = [
    `In ${ctx}, an upright object of height h_o = ${ho} m is placed at a distance u = ${u} m in front of a thin diverging lens whose focal length is f = −${fAbs} m under the real-is-positive sign convention.`,
    `Optometry apparatus in ${ctx} positions an illuminated test letter of height ${ho} m at u = ${u} m in front of a thin concave lens of focal length f = −${fAbs} m. Apply the real-is-positive sign convention throughout.`,
  ];
  return {
    id,
    conceptId: "thin-lenses-geometric-optics",
    templateArchetype: "diverging-lens-virtual-image-dioptres",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "imageDistanceM",
      "magnification",
      "absMagnification",
      "imageHeightM",
      "objectImageSeparationM",
      "opticalPowerD",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Evaluate signed dioptre power, virtual image distance, and object-to-image axial separation for diverging lens",
      format: "structured",
      strategies: [
        "calculate negative optical power in dioptres from negative focal length",
        "solve lens equation for signed virtual image distance",
        "compute axial distance between object and virtual image on same side of lens",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the signed optical power P = 1/f of the diverging lens in dioptres (D).",
        marks: 1,
        targetQuantityKey: "opticalPowerD",
        expectedAnswer: formatQty(powerD, "D", 3),
        workingSteps: [
          `P = 1 / (−${fAbs}) = ${formatQty(powerD, "D", 3)}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the signed image distance v using 1/f = 1/u + 1/v.",
        marks: 2,
        targetQuantityKey: "imageDistanceM",
        expectedAnswer: formatQty(v, "m", 3),
        workingSteps: [
          `1/v = −1/${fAbs} − 1/${u} = ${formatSigFigs(1 / v, 4)} m⁻¹.`,
          `v = ${formatQty(v, "m", 3)}.`,
        ],
      },
      {
        partId: "c",
        prompt:
          "Determine the axial distance between the object and its virtual image.",
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "objectImageSeparationM",
        expectedAnswer: formatQty(sep, "m", 3),
        workingSteps: [
          `Both lie on the input side of the lens, so separation = u − |v| = |u + v| = ${formatQty(sep, "m", 3)}.`,
        ],
      },
    ],
    workedSolution: `(a) Optical power P = 1 / (−${fAbs}) = ${formatQty(powerD, "D", 3)}. (b) 1/v = −1/${fAbs} − 1/${u} ⇒ v = ${formatQty(v, "m", 3)}. (c) Axial separation between object and virtual image on the same side = u − |v| = ${formatQty(sep, "m", 3)}.`,
    markScheme: [
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains P = ${formatQty(powerD, "D", 3)} (including negative sign).`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Substitutes f = −${fAbs} m and u = ${u} m into 1/v = 1/f − 1/u.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains v = ${formatQty(v, "m", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Subtracts |v| from u because virtual image and object are on the same side of the lens.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains separation = ${formatQty(sep, "m", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
  };
}

// ============================================================================
// FAMILY 10: Horizontal Mass-Spring SHM — Period, Frequency & Stiffness
// (100% SL+HL core across IB, A-Level Y13, NCUK IFY; g-independent!)
// ============================================================================
function buildFamily10HorizontalMassSpring(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "simple-harmonic-motion",
    rng,
    ibLevelMode: "both",
  });

  const massKg = rng.pick([0.12, 0.16, 0.25, 0.36, 0.45, 0.64, 0.8, 1.2, 1.5]);
  const kNm = rng.pick([14, 18, 24, 32, 45, 56, 72, 90, 120, 160]);
  const ampM = rng.pick([0.025, 0.035, 0.045, 0.06, 0.075, 0.09, 0.11]);
  const ctx = MASS_SPRING_CONTEXTS[variantIndex % MASS_SPRING_CONTEXTS.length];

  const spec: MassSpringShmSpec = {
    kind: "mass-spring-shm",
    orientation: "horizontal",
    massKg,
    springConstantNm: kNm,
    amplitudeM: ampM,
    plotMode: "time-series",
  };
  const sol = solveOpticsShmScenario(spec) as MassSpringShmSolution;

  if (format === "mcq") {
    const subMode = variantIndex % 3;
    if (subMode === 0) {
      // Target: periodS
      const stems = [
        `In ${ctx} of mass ${massKg} kg and spring constant ${kNm} N m⁻¹, the oscillator is displaced by an amplitude of ${ampM} m from equilibrium and released. What is the period T of its simple harmonic motion?`,
        `An experimental setup consisting of ${ctx} has oscillating mass ${massKg} kg, spring stiffness ${kNm} N m⁻¹, and horizontal amplitude ${ampM} m. Calculate the oscillation period T.`,
        `Engineers testing ${ctx} measure a moving mass of ${massKg} kg attached to an ideal horizontal spring of constant ${kNm} N m⁻¹ oscillating with amplitude ${ampM} m. Determine the period T of one complete cycle.`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: 2 * Math.PI * Math.sqrt(kNm / massKg),
          rationale:
            "Swaps m/k and k/m inside the radical, computing 2π√(k / m) instead of 2π√(m / k).",
        },
        {
          value: Math.sqrt(massKg / kNm),
          rationale:
            "Omits the factor of 2π and calculates √(m / k) = 1 / ω.",
        },
        {
          value: (2 * Math.PI * massKg) / kNm,
          rationale:
            "Omits the square root and evaluates 2π(m / k).",
        },
        {
          value: sol.frequencyHz,
          rationale:
            "Calculates the oscillation frequency f = 1 / T in Hz instead of the period T in seconds.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: sol.periodS,
        unit: "s",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "simple-harmonic-motion",
        templateArchetype: "horizontal-mass-spring-period-stiffness",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "periodS",
          "frequencyHz",
          "angularFrequencyRadS",
          "maxSpeedMs",
          "maxAccelerationMs2",
          "totalEnergyJ",
        ],
        targetQuantityKey: "periodS",
        questionPlan: buildDigitFreePlan({
          summary:
            "Calculate oscillation period of horizontal mass-spring system from mass and spring constant",
          format: "mcq",
          strategies: [
            "inverting mass-to-stiffness ratio inside square root",
            "omitting two-pi factor in period equation",
            "computing cyclic frequency instead of period",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `For an ideal mass-spring oscillator, T = 2π√(m / k) = 2π√(${massKg} / ${kNm}) = ${formatQty(sol.periodS, "s", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses T = 2π√(${massKg} / ${kNm}) to obtain ${formatQty(sol.periodS, "s", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      // Target: frequencyHz
      const stems = [
        `A test rig using ${ctx} has mass ${massKg} kg, horizontal spring constant ${kNm} N m⁻¹, and oscillation amplitude ${ampM} m. What is the natural frequency f of the oscillation?`,
        `In a calibration run of ${ctx}, a ${massKg} kg carriage oscillates horizontally with amplitude ${ampM} m on a spring of stiffness ${kNm} N m⁻¹. Determine the frequency f in hertz.`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: (1 / (2 * Math.PI)) * Math.sqrt(massKg / kNm),
          rationale:
            "Swaps k/m and m/k, computing (1 / 2π)√(m / k) instead of (1 / 2π)√(k / m).",
        },
        {
          value: sol.angularFrequencyRadS,
          rationale:
            "Reports angular frequency ω = √(k / m) in rad s⁻¹ without dividing by 2π.",
        },
        {
          value: sol.periodS,
          rationale:
            "Computes the period T = 2π√(m / k) instead of frequency f = 1 / T.",
        },
        {
          value: kNm / (2 * Math.PI * massKg),
          rationale:
            "Omits the square root on k / m when computing f.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: sol.frequencyHz,
        unit: "Hz",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "simple-harmonic-motion",
        templateArchetype: "horizontal-mass-spring-period-stiffness",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "periodS",
          "frequencyHz",
          "angularFrequencyRadS",
          "maxSpeedMs",
          "maxAccelerationMs2",
        ],
        targetQuantityKey: "frequencyHz",
        questionPlan: buildDigitFreePlan({
          summary:
            "Determine natural cyclic frequency of horizontal mass-spring SHM oscillator",
          format: "mcq",
          strategies: [
            "swapping mass and stiffness inside square root",
            "confusing angular frequency with cyclic frequency",
            "reporting period instead of frequency",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `Natural frequency f = (1 / 2π)√(k / m) = (1 / 2π)√(${kNm} / ${massKg}) = ${formatQty(sol.frequencyHz, "Hz", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates f = (1 / 2π)√(${kNm} / ${massKg}) = ${formatQty(sol.frequencyHz, "Hz", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    // subMode === 2: Inverse springConstantNm given periodS!
    const periodShown = formatSigFigs(sol.periodS, 3);
    const stems = [
      `During stiffness testing on ${ctx}, a ${massKg} kg mass oscillates horizontally with amplitude ${ampM} m and a measured period of ${periodShown} s. What is the spring constant k?`,
      `A ${massKg} kg test mass in ${ctx} executes horizontal simple harmonic motion of amplitude ${ampM} m and period T = ${periodShown} s. Calculate the stiffness k of the spring.`,
    ];
    const distractors: DistractorCandidate[] = [
      {
        value: (2 * Math.PI * massKg) / sol.periodS,
        rationale:
          "Fails to square 2π / T when rearranging T = 2π√(m / k), computing 2πm / T instead of 4π²m / T².",
      },
      {
        value: massKg / (sol.periodS * sol.periodS),
        rationale:
          "Omits the factor of 4π² and computes m / T².",
      },
      {
        value: (4 * Math.PI * Math.PI * sol.periodS * sol.periodS) / massKg,
        rationale:
          "Inverts m / T² when rearranging the period equation.",
      },
    ];
    const options = buildNumericMcqOptions({
      truth: kNm,
      unit: "N m⁻¹",
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "simple-harmonic-motion",
      templateArchetype: "horizontal-mass-spring-period-stiffness",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "springConstantNm",
        "effectiveSpringConstantNm",
        "maxRestoringForceN",
        "totalEnergyJ",
        "maxSpeedMs",
        "maxAccelerationMs2",
      ],
      requiredGivens: [
        { name: "massKg", value: massKg, unit: "kg", source: "either" },
        { name: "amplitudeM", value: ampM, unit: "m", source: "either" },
        { name: "periodS", value: sol.periodS, unit: "s", source: "either" },
      ],
      targetQuantityKey: "springConstantNm",
      questionPlan: buildDigitFreePlan({
        summary:
          "Deduce spring constant from measured oscillation period and mass on horizontal track",
        format: "mcq",
        strategies: [
          "failing to square two-pi-over-period when solving for stiffness",
          "omitting four-pi-squared constant factor",
          "inverting mass and squared period",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: `Rearranging T = 2π√(m / k) gives k = 4π²m / T² = 4π²(${massKg}) / (${periodShown})² = ${formatQty(kNm, "N m⁻¹", 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates k = 4π²m / T² = ${formatQty(kNm, "N m⁻¹", 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (6 marks — 100% SL+HL core equations!)
  const stems = [
    `An experimental arrangement of ${ctx} comprises a block of mass m = ${massKg} kg attached to an ideal horizontal spring of stiffness k = ${kNm} N m⁻¹. The block oscillates in simple harmonic motion with amplitude x₀ = ${ampM} m.`,
    `In ${ctx}, a ${massKg} kg carriage tethered to a horizontal spring of spring constant ${kNm} N m⁻¹ executes undamped simple harmonic motion of amplitude ${ampM} m.`,
  ];
  return {
    id,
    conceptId: "simple-harmonic-motion",
    templateArchetype: "horizontal-mass-spring-period-stiffness",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "periodS",
      "frequencyHz",
      "angularFrequencyRadS",
      "maxRestoringForceN",
      "maxAccelerationMs2",
      "maxSpeedMs",
      "totalEnergyJ",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Evaluate period, peak restoring Hooke force, and maximum acceleration for horizontal mass-spring oscillator",
      format: "structured",
      strategies: [
        "calculate oscillation period from mass and spring constant",
        "compute peak restoring force at extreme displacement",
        "determine magnitude of maximum acceleration via Newton second law",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the period T of the simple harmonic oscillations.",
        marks: 2,
        targetQuantityKey: "periodS",
        expectedAnswer: formatQty(sol.periodS, "s", 3),
        workingSteps: [
          `T = 2π√(m / k) = 2π√(${massKg} / ${kNm}) = ${formatQty(sol.periodS, "s", 3)}.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Calculate the magnitude of the maximum restoring force F_max exerted by the spring.",
        marks: 2,
        targetQuantityKey: "maxRestoringForceN",
        expectedAnswer: formatQty(sol.maxRestoringForceN, "N", 3),
        workingSteps: [
          `F_max = k x₀ = ${kNm} × ${ampM} = ${formatQty(sol.maxRestoringForceN, "N", 3)}.`,
        ],
      },
      {
        partId: "c",
        prompt:
          "Determine the magnitude of the maximum acceleration a_max of the oscillating mass.",
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "maxAccelerationMs2",
        expectedAnswer: formatQty(sol.maxAccelerationMs2, "m s⁻²", 3),
        workingSteps: [
          `a_max = F_max / m = ${formatSigFigs(sol.maxRestoringForceN, 4)} / ${massKg} = ${formatQty(sol.maxAccelerationMs2, "m s⁻²", 3)}.`,
        ],
      },
    ],
    workedSolution: `(a) T = 2π√(${massKg} / ${kNm}) = ${formatQty(sol.periodS, "s", 3)}. (b) F_max = k x₀ = ${kNm} × ${ampM} = ${formatQty(sol.maxRestoringForceN, "N", 3)}. (c) a_max = F_max / m = ${formatQty(sol.maxAccelerationMs2, "m s⁻²", 3)}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Substitutes m = ${massKg} kg and k = ${kNm} N m⁻¹ into T = 2π√(m / k).`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains T = ${formatQty(sol.periodS, "s", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Applies Hooke's law F_max = k x₀ = ${kNm} × ${ampM}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains F_max = ${formatQty(sol.maxRestoringForceN, "N", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Divides F_max by m (or multiplies ω² by x₀).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains a_max = ${formatQty(sol.maxAccelerationMs2, "m s⁻²", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

// ============================================================================
// FAMILY 11: Vertical Mass-Spring SHM — Static Extension & Vertical Dynamics
// (Cleanly partitioned between IB g = 9.8 and A-Level/NCUK g = 9.81!)
// ============================================================================
function buildFamily11VerticalMassSpring(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const useIbGravity = variantIndex % 2 === 0;
  const g = useIbGravity ? 9.8 : 9.81;
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "simple-harmonic-motion",
    rng,
    allowedSyllabi: useIbGravity ? ["ib"] : ["alevel", "ncuk"],
    ibLevelMode: "both",
  });

  const massKg = rng.pick([0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1.2]);
  const kNm = rng.pick([20, 25, 32, 40, 50, 64, 80, 100]);
  const staticExt = (massKg * g) / kNm;
  // Choose amplitude strictly smaller than static extension and distinct from staticExt
  const ampCandidates = [0.018, 0.024, 0.032, 0.042, 0.055].filter(
    (a) => Math.abs(a - staticExt) > 0.008,
  );
  const ampM = rng.pick(ampCandidates);
  const ctx = MASS_SPRING_CONTEXTS[(variantIndex + 5) % MASS_SPRING_CONTEXTS.length];

  const spec: MassSpringShmSpec = {
    kind: "mass-spring-shm",
    orientation: "vertical",
    massKg,
    springConstantNm: kNm,
    amplitudeM: ampM,
    gravityMs2: g,
    plotMode: "time-series",
  };
  const sol = solveOpticsShmScenario(spec) as MassSpringShmSolution;

  if (format === "mcq") {
    const askStatic = variantIndex % 3 !== 2;
    const targetKey = askStatic ? "staticEquilibriumExtensionM" : "periodS";
    const truth = askStatic ? sol.staticEquilibriumExtensionM : sol.periodS;
    const unit = askStatic ? "m" : "s";

    const stems = askStatic
      ? [
          `A vertical helical spring of stiffness ${kNm} N m⁻¹ in ${ctx} suspends a load of mass ${massKg} kg that subsequently oscillates vertically with amplitude ${ampM} m. Taking g = ${g} m s⁻², what was the static extension Δx_eq of the spring at equilibrium before oscillation started?`,
          `In ${ctx}, a ${massKg} kg mass hangs from a vertical spring of constant ${kNm} N m⁻¹ and executes vertical SHM of amplitude ${ampM} m (take g = ${g} m s⁻²). Calculate the static equilibrium extension Δx_eq from the spring's unstretched length.`,
        ]
      : [
          `A ${massKg} kg mass suspended vertically from a spring of stiffness ${kNm} N m⁻¹ in ${ctx} is pulled down ${ampM} m below equilibrium and released (take g = ${g} m s⁻²). What is the period T of the resulting vertical simple harmonic motion?`,
          `Engineers testing ${ctx} hang a ${massKg} kg mass from a vertical coil spring (k = ${kNm} N m⁻¹) and excite vertical oscillations of amplitude ${ampM} m in a gravitational field g = ${g} m s⁻². Determine the period T of oscillation.`,
        ];

    const distractors: DistractorCandidate[] = askStatic
      ? [
          {
            value: sol.staticEquilibriumExtensionM + ampM,
            rationale:
              "Adds the oscillation amplitude x₀ to mg / k, finding maximum total stretch rather than static equilibrium extension.",
          },
          {
            value: massKg / kNm,
            rationale:
              "Divides mass m directly by spring constant k without multiplying by gravitational field strength g.",
          },
          {
            value: kNm / (massKg * g),
            rationale:
              "Inverts Hooke's law as k / (mg) instead of mg / k.",
          },
          {
            value: ampM,
            rationale:
              "Confuses the dynamic SHM amplitude x₀ with the static equilibrium extension mg / k.",
          },
        ]
      : [
          {
            value: 2 * Math.PI * Math.sqrt(ampM / g),
            rationale:
              "Substitutes the oscillation amplitude x₀ into a pendulum-style formula 2π√(x₀ / g) instead of 2π√(m / k).",
          },
          {
            value: 2 * Math.PI * Math.sqrt(kNm / massKg),
            rationale:
              "Swaps m/k and k/m inside the square root.",
          },
          {
            value: 2 * Math.PI * Math.sqrt(massKg / (kNm + massKg * g)),
            rationale:
              "Incorrectly adds weight mg to spring stiffness k, assuming gravity changes the vertical mass-spring period.",
          },
        ];

    const options = buildNumericMcqOptions({
      truth,
      unit,
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "simple-harmonic-motion",
      templateArchetype: "vertical-mass-spring-equilibrium-oscillation",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "staticEquilibriumExtensionM",
        "periodS",
        "frequencyHz",
        "angularFrequencyRadS",
        "maxSpeedMs",
        "maxAccelerationMs2",
        "totalEnergyJ",
      ],
      targetQuantityKey: targetKey,
      questionPlan: buildDigitFreePlan({
        summary:
          "Distinguish static equilibrium spring extension from dynamic vertical SHM period",
        format: "mcq",
        strategies: [
          "confusing dynamic amplitude with static weight extension",
          "substituting amplitude into pendulum period relation",
          "swapping mass and stiffness ratio",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: askStatic
        ? `At static equilibrium, upward spring tension balances weight: k Δx_eq = mg ⇒ Δx_eq = (${massKg} × ${g}) / ${kNm} = ${formatQty(sol.staticEquilibriumExtensionM, "m", 3)}.`
        : `Gravity shifts the equilibrium position without altering effective stiffness k, so T = 2π√(m / k) = 2π√(${massKg} / ${kNm}) = ${formatQty(sol.periodS, "s", 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Obtains ${formatQty(truth, unit, 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (6 marks — SL+HL safe!)
  const stems = [
    `In ${ctx}, a load of mass m = ${massKg} kg hangs at rest from a vertical spring of spring constant k = ${kNm} N m⁻¹. It is then pulled vertically downward by x₀ = ${ampM} m from equilibrium and released. Take g = ${g} m s⁻².`,
    `A vertical suspension stage in ${ctx} supports a ${massKg} kg mass on an ideal coil spring of stiffness ${kNm} N m⁻¹, oscillating vertically with amplitude ${ampM} m about its equilibrium position (take g = ${g} m s⁻²).`,
  ];
  return {
    id,
    conceptId: "simple-harmonic-motion",
    templateArchetype: "vertical-mass-spring-equilibrium-oscillation",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "staticEquilibriumExtensionM",
      "periodS",
      "frequencyHz",
      "angularFrequencyRadS",
      "maxSpeedMs",
      "maxAccelerationMs2",
      "totalEnergyJ",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Analyze static equilibrium extension, oscillation period, and peak SHM acceleration of vertical mass-spring system",
      format: "structured",
      strategies: [
        "balance weight against Hooke force to find static extension",
        "evaluate vertical SHM period independent of gravitational field",
        "compute peak restoring acceleration at extreme vertical displacement",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts: [
      {
        partId: "a",
        prompt:
          "Calculate the static extension Δx_eq of the spring when the mass hangs at rest in equilibrium.",
        marks: 2,
        targetQuantityKey: "staticEquilibriumExtensionM",
        expectedAnswer: formatQty(sol.staticEquilibriumExtensionM, "m", 3),
        workingSteps: [
          `k Δx_eq = mg ⇒ Δx_eq = (${massKg} × ${g}) / ${kNm} = ${formatQty(sol.staticEquilibriumExtensionM, "m", 3)}.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Calculate the period T of the vertical simple harmonic oscillations.",
        marks: 2,
        targetQuantityKey: "periodS",
        expectedAnswer: formatQty(sol.periodS, "s", 3),
        workingSteps: [
          `T = 2π√(m / k) = 2π√(${massKg} / ${kNm}) = ${formatQty(sol.periodS, "s", 3)}.`,
        ],
      },
      {
        partId: "c",
        prompt:
          "Determine the magnitude of the maximum net acceleration a_max of the mass during the oscillation.",
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "maxAccelerationMs2",
        expectedAnswer: formatQty(sol.maxAccelerationMs2, "m s⁻²", 3),
        workingSteps: [
          `ω² = k / m = ${kNm} / ${massKg}; a_max = ω² x₀ = (${kNm} / ${massKg}) × ${ampM} = ${formatQty(sol.maxAccelerationMs2, "m s⁻²", 3)}.`,
        ],
      },
    ],
    workedSolution: `(a) Δx_eq = mg / k = (${massKg} × ${g}) / ${kNm} = ${formatQty(sol.staticEquilibriumExtensionM, "m", 3)}. (b) T = 2π√(${massKg} / ${kNm}) = ${formatQty(sol.periodS, "s", 3)}. (c) Maximum net SHM acceleration a_max = (k / m) x₀ = ${formatQty(sol.maxAccelerationMs2, "m s⁻²", 3)}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Uses mg = k Δx_eq with g = ${g} m s⁻².`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains Δx_eq = ${formatQty(sol.staticEquilibriumExtensionM, "m", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Applies T = 2π√(${massKg} / ${kNm}).`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains T = ${formatQty(sol.periodS, "s", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Evaluates a_max = ω² x₀ = (k / m) x₀.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains a_max = ${formatQty(sol.maxAccelerationMs2, "m s⁻²", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

// ============================================================================
// FAMILY 12: Simple Pendulum SHM — IB Gravity Standard (g = 9.8 m s⁻²)
// (STRICTLY tagged IB SL/HL ONLY — ZERO A-Level/NCUK tags on g = 9.8 items!)
// ============================================================================
function buildFamily12PendulumIb(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "simple-harmonic-motion",
    rng,
    allowedSyllabi: ["ib"],
    ibLevelMode: "both",
  });

  const g = 9.8;
  const lengthM = rng.pick([0.35, 0.49, 0.62, 0.78, 0.95, 1.15, 1.4, 1.75, 2.2]);
  const ampM = Number((lengthM * rng.pick([0.06, 0.08, 0.1, 0.12])).toFixed(4));
  const bobMassKg = rng.pick([0.12, 0.18, 0.25, 0.35, 0.45]);
  const ctx = PENDULUM_CONTEXTS[variantIndex % PENDULUM_CONTEXTS.length];

  const spec: SimplePendulumShmSpec = {
    kind: "simple-pendulum-shm",
    lengthM,
    amplitudeM: ampM,
    bobMassKg,
    gravityMs2: g,
    plotMode: "time-series",
  };
  const sol = solveOpticsShmScenario(spec) as SimplePendulumShmSolution;

  if (format === "mcq") {
    const subMode = variantIndex % 3;
    if (subMode === 0 || subMode === 1) {
      const askFreq = subMode === 1;
      const targetKey = askFreq ? "frequencyHz" : "periodS";
      const truth = askFreq ? sol.frequencyHz : sol.periodS;
      const unit = askFreq ? "Hz" : "s";

      const stems = askFreq
        ? [
            `In ${ctx}, a small dense bob of mass ${bobMassKg} kg hangs on a light inextensible cord of length ${lengthM} m and swings with small arc amplitude ${ampM} m. Taking g = 9.8 m s⁻², what is the oscillation frequency f?`,
            `A simple pendulum in ${ctx} has cord length ${lengthM} m, bob mass ${bobMassKg} kg, and small horizontal arc amplitude ${ampM} m (take g = 9.8 m s⁻²). Calculate the natural frequency f of oscillation.`,
          ]
        : [
            `During timing measurements on ${ctx}, a pendulum bob of mass ${bobMassKg} kg suspended from a light cord of length ${lengthM} m oscillates with small arc amplitude ${ampM} m. Taking g = 9.8 m s⁻², what is the period T of one full oscillation?`,
            `A simple pendulum of length ${lengthM} m and bob mass ${bobMassKg} kg in ${ctx} executes small-angle oscillations of arc amplitude ${ampM} m in a field where g = 9.8 m s⁻². Determine its period T.`,
          ];

      const distractors: DistractorCandidate[] = askFreq
        ? [
            {
              value: (1 / (2 * Math.PI)) * Math.sqrt(lengthM / g),
              rationale:
                "Inverts g / L inside the radical, computing (1 / 2π)√(L / g) instead of (1 / 2π)√(g / L).",
            },
            {
              value: sol.angularFrequencyRadS,
              rationale:
                "Reports the angular frequency ω = √(g / L) without dividing by 2π.",
            },
            {
              value: sol.periodS,
              rationale:
                "Calculates the period T instead of the frequency f = 1 / T.",
            },
          ]
        : [
            {
              value: 2 * Math.PI * Math.sqrt(g / lengthM),
              rationale:
                "Swaps L / g and g / L inside the square root, computing 2π√(g / L).",
            },
            {
              value: Math.PI * Math.sqrt(lengthM / g),
              rationale:
                "Computes the half-period π√(L / g) for a single swing from one extreme to the other rather than a complete cycle.",
            },
            {
              value: 2 * Math.PI * Math.sqrt((bobMassKg * lengthM) / g),
              rationale:
                "Incorrectly includes the bob mass m inside the pendulum period equation.",
            },
            {
              value: (2 * Math.PI * lengthM) / g,
              rationale:
                "Omits the square root and evaluates 2πL / g.",
            },
          ];

      const options = buildNumericMcqOptions({
        truth,
        unit,
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "simple-harmonic-motion",
        templateArchetype: "simple-pendulum-period-gravity-ib",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "periodS",
          "frequencyHz",
          "angularFrequencyRadS",
          "maxAngleDeg",
          "maxSpeedMs",
          "maxAccelerationMs2",
          "equilibriumTensionN",
          "totalEnergyJ",
        ],
        targetQuantityKey: targetKey,
        questionPlan: buildDigitFreePlan({
          summary:
            "Evaluate small-angle simple pendulum period or frequency independent of bob mass",
          format: "mcq",
          strategies: [
            "swapping length and gravitational acceleration inside radical",
            "computing half-period single-swing duration instead of full cycle",
            "including bob mass in simple pendulum period formula",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: askFreq
          ? `For small angles, f = (1 / 2π)√(g / L) = (1 / 2π)√(9.8 / ${lengthM}) = ${formatQty(sol.frequencyHz, "Hz", 3)}.`
          : `For small angles, T = 2π√(L / g) = 2π√(${lengthM} / 9.8) = ${formatQty(sol.periodS, "s", 3)} (independent of bob mass).`,
        markScheme: [
          {
            code: "A1",
            criterion: `Obtains ${formatQty(truth, unit, 3)} using g = 9.8 m s⁻² (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    // subMode === 2: Inverse lengthM given periodS!
    const periodShown = formatSigFigs(sol.periodS, 3);
    const stems = [
      `On ${ctx}, a simple pendulum with a ${bobMassKg} kg bob swings through a small arc amplitude of ${ampM} m with a measured period of ${periodShown} s. Taking g = 9.8 m s⁻², what is the effective length L of the pendulum?`,
      `To calibrate ${ctx} where g = 9.8 m s⁻², a ${bobMassKg} kg pendulum bob oscillates at small arc amplitude ${ampM} m with period T = ${periodShown} s. Calculate the pendulum length L.`,
    ];
    const distractors: DistractorCandidate[] = [
      {
        value: (g * sol.periodS) / (2 * Math.PI),
        rationale:
          "Forgets to square T / (2π) when rearranging T = 2π√(L / g), computing gT / (2π).",
      },
      {
        value: (4 * Math.PI * Math.PI) / (g * sol.periodS * sol.periodS),
        rationale:
          "Inverts the rearranged expression for L.",
      },
      {
        value: (g * sol.periodS * sol.periodS) / (2 * Math.PI),
        rationale:
          "Divides gT² by 2π instead of 4π².",
      },
    ];
    const options = buildNumericMcqOptions({
      truth: lengthM,
      unit: "m",
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "simple-harmonic-motion",
      templateArchetype: "simple-pendulum-period-gravity-ib",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "lengthM",
        "maxAngleDeg",
        "maxSpeedMs",
        "maxAccelerationMs2",
        "equilibriumTensionN",
        "totalEnergyJ",
      ],
      requiredGivens: [
        { name: "bobMassKg", value: bobMassKg, unit: "kg", source: "either" },
        { name: "amplitudeM", value: ampM, unit: "m", source: "either" },
        { name: "gravityMs2", value: g, unit: "m s⁻²", source: "either" },
        { name: "periodS", value: sol.periodS, unit: "s", source: "either" },
      ],
      targetQuantityKey: "lengthM",
      questionPlan: buildDigitFreePlan({
        summary:
          "Invert simple pendulum period relation to determine suspension length under IB gravity standard",
        format: "mcq",
        strategies: [
          "forgetting to square period over two-pi",
          "dividing by two-pi instead of four-pi-squared",
          "inverting length expression",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: `From T = 2π√(L / g), L = gT² / (4π²) = 9.8 × (${periodShown})² / (4π²) = ${formatQty(lengthM, "m", 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates L = gT² / (4π²) = ${formatQty(lengthM, "m", 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (6 marks — 100% SL+HL core!)
  const stems = [
    `In ${ctx}, a small bob of mass ${bobMassKg} kg is suspended from an inextensible light thread of length L = ${lengthM} m and displaced by a small arc amplitude x₀ = ${ampM} m. Take g = 9.8 m s⁻².`,
    `A simple pendulum in ${ctx} consists of a ${bobMassKg} kg sphere on a ${lengthM} m wire oscillating in small-angle simple harmonic motion with arc amplitude ${ampM} m (take g = 9.8 m s⁻²).`,
  ];
  return {
    id,
    conceptId: "simple-harmonic-motion",
    templateArchetype: "simple-pendulum-period-gravity-ib",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "periodS",
      "frequencyHz",
      "angularFrequencyRadS",
      "maxAngleDeg",
      "maxSpeedMs",
      "maxAccelerationMs2",
      "equilibriumTensionN",
      "totalEnergyJ",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Calculate period, angular frequency, and peak tangential restoring acceleration for small-angle simple pendulum",
      format: "structured",
      strategies: [
        "apply simple pendulum period formula using IB gravitational field strength",
        "convert period to angular frequency",
        "evaluate maximum tangential restoring acceleration from defining SHM law",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the period T of the small-angle oscillations.",
        marks: 2,
        targetQuantityKey: "periodS",
        expectedAnswer: formatQty(sol.periodS, "s", 3),
        workingSteps: [
          `T = 2π√(L / g) = 2π√(${lengthM} / 9.8) = ${formatQty(sol.periodS, "s", 3)}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the angular frequency ω of the pendulum.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "angularFrequencyRadS",
        expectedAnswer: formatQty(sol.angularFrequencyRadS, "rad s⁻¹", 3),
        workingSteps: [
          `ω = √(g / L) = 2π / T = ${formatQty(sol.angularFrequencyRadS, "rad s⁻¹", 3)}.`,
        ],
      },
      {
        partId: "c",
        prompt:
          "Determine the maximum magnitude of the bob's restoring acceleration a_max.",
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "maxAccelerationMs2",
        expectedAnswer: formatQty(sol.maxAccelerationMs2, "m s⁻²", 3),
        workingSteps: [
          `a_max = ω² x₀ = (g / L) x₀ = (9.8 / ${lengthM}) × ${ampM} = ${formatQty(sol.maxAccelerationMs2, "m s⁻²", 3)}.`,
        ],
      },
    ],
    workedSolution: `(a) T = 2π√(${lengthM} / 9.8) = ${formatQty(sol.periodS, "s", 3)}. (b) ω = √(9.8 / ${lengthM}) = ${formatQty(sol.angularFrequencyRadS, "rad s⁻¹", 3)}. (c) a_max = ω² x₀ = ${formatQty(sol.maxAccelerationMs2, "m s⁻²", 3)}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Uses T = 2π√(${lengthM} / 9.8).`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains T = ${formatQty(sol.periodS, "s", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies ω = 2π / T or √(g / L).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ω = ${formatQty(sol.angularFrequencyRadS, "rad s⁻¹", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Substitutes into a_max = ω² x₀.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains a_max = ${formatQty(sol.maxAccelerationMs2, "m s⁻²", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

// ============================================================================
// FAMILY 13: Simple Pendulum SHM — A-Level & NCUK Gravity (g = 9.81 m s⁻²)
// (STRICTLY tagged A-Level Y13 + NCUK IFY ONLY — ZERO IB tags on g = 9.81 items!)
// ============================================================================
function buildFamily13PendulumUk(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "simple-harmonic-motion",
    rng,
    allowedSyllabi: ["alevel", "ncuk"],
  });

  const g = 9.81;
  const lengthM = rng.pick([0.4, 0.55, 0.72, 0.85, 1.05, 1.3, 1.6, 1.9, 2.4]);
  // Use ~12-16 deg equivalent arc so centripetal tension term mv_max^2/L is ~4-8% of mg (>1.5% distinct from mg!)
  const ampM = Number((lengthM * rng.pick([0.2, 0.22, 0.25, 0.28])).toFixed(4));
  const bobMassKg = rng.pick([0.15, 0.25, 0.4, 0.5, 0.6, 0.8]);
  const ctx = PENDULUM_CONTEXTS[(variantIndex + 5) % PENDULUM_CONTEXTS.length];

  const spec: SimplePendulumShmSpec = {
    kind: "simple-pendulum-shm",
    lengthM,
    amplitudeM: ampM,
    bobMassKg,
    gravityMs2: g,
    plotMode: "energy-displacement",
  };
  const sol = solveOpticsShmScenario(spec) as SimplePendulumShmSolution;

  if (format === "mcq") {
    const subMode = variantIndex % 3;
    if (subMode === 0) {
      // Target: equilibriumTensionN
      const stems = [
        `In ${ctx}, a pendulum bob of mass ${bobMassKg} kg hangs on a light cord of length ${lengthM} m and swings in small-angle SHM with arc amplitude ${ampM} m. Taking g = 9.81 m s⁻², what is the tension in the cord as the bob passes through its lowest equilibrium point?`,
        `A ${bobMassKg} kg brass bob on a ${lengthM} m suspension wire in ${ctx} oscillates with arc-length amplitude ${ampM} m (take g = 9.81 m s⁻²). Calculate the maximum cord tension at the bottom of the swing.`,
      ];
      const weightN = bobMassKg * g;
      const centForce = (bobMassKg * sol.maxSpeedMs * sol.maxSpeedMs) / lengthM;
      const distractors: DistractorCandidate[] = [
        {
          value: weightN,
          rationale:
            "Equates cord tension at the lowest point to static weight mg, ignoring the upward centripetal force mv_max² / L.",
        },
        {
          value: weightN - centForce,
          rationale:
            "Subtracts the centripetal force mv_max² / L from mg instead of adding it at the bottom of the arc.",
        },
        {
          value: centForce,
          rationale:
            "Calculates only the net radial centripetal force mv_max² / L rather than the total cord tension.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: sol.equilibriumTensionN,
        unit: "N",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "simple-harmonic-motion",
        templateArchetype: "simple-pendulum-period-tension-uk",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "periodS",
          "frequencyHz",
          "angularFrequencyRadS",
          "maxAngleDeg",
          "maxSpeedMs",
          "equilibriumTensionN",
          "totalEnergyJ",
        ],
        targetQuantityKey: "equilibriumTensionN",
        questionPlan: buildDigitFreePlan({
          summary:
            "Combine SHM peak speed with radial circular dynamics to find pendulum tension at equilibrium",
          format: "mcq",
          strategies: [
            "omitting centripetal force term at bottom of arc",
            "subtracting centripetal force from weight instead of adding",
            "computing net centripetal force alone without weight",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `With ω = √(g / L) = √(9.81 / ${lengthM}), peak speed v_max = ω x₀ = ${formatQty(sol.maxSpeedMs, "m s⁻¹", 3)}. At the lowest point, T_cord = m(g + v_max² / L) = ${formatQty(sol.equilibriumTensionN, "N", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses v_max = ω x₀ and T_cord = mg + mv_max² / L = ${formatQty(sol.equilibriumTensionN, "N", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    // subMode 1 or 2: maxSpeedMs or periodS
    const askSpeed = subMode === 1;
    const targetKey = askSpeed ? "maxSpeedMs" : "periodS";
    const truth = askSpeed ? sol.maxSpeedMs : sol.periodS;
    const unit = askSpeed ? "m s⁻¹" : "s";
    const stems = askSpeed
      ? [
          `A ${bobMassKg} kg pendulum bob suspended from a ${lengthM} m wire in ${ctx} oscillates in SHM with arc amplitude ${ampM} m (take g = 9.81 m s⁻²). What is the maximum speed v_max of the bob?`,
          `In ${ctx}, a simple pendulum of length ${lengthM} m and bob mass ${bobMassKg} kg swings with small arc amplitude ${ampM} m where g = 9.81 m s⁻². Calculate its speed at the equilibrium position.`,
        ]
      : [
          `A metrology pendulum in ${ctx} has suspension length ${lengthM} m, bob mass ${bobMassKg} kg, and arc amplitude ${ampM} m. Taking g = 9.81 m s⁻², what is its oscillation period T?`,
          `Engineers timing ${ctx} use a ${bobMassKg} kg bob on a ${lengthM} m light cord swinging with arc amplitude ${ampM} m (g = 9.81 m s⁻²). Calculate the period T.`,
        ];

    const distractors: DistractorCandidate[] = askSpeed
      ? [
          {
            value: (g / lengthM) * ampM,
            rationale:
              "Computes ω² x₀ = (g / L) x₀ (maximum acceleration) instead of ω x₀ = √(g / L) x₀.",
          },
          {
            value: Math.sqrt(lengthM / g) * ampM,
            rationale:
              "Inverts g / L inside √(g / L) when computing ω x₀.",
          },
          {
            value: Math.sqrt(2 * g * ampM),
            rationale:
              "Treats the horizontal arc amplitude x₀ as a vertical free-fall drop height h in √(2gh).",
          },
        ]
      : [
          {
            value: 2 * Math.PI * Math.sqrt(g / lengthM),
            rationale:
              "Inverts L / g inside the square root.",
          },
          {
            value: Math.PI * Math.sqrt(lengthM / g),
            rationale:
              "Calculates the half-period π√(L / g) instead of the full period 2π√(L / g).",
          },
          {
            value: (2 * Math.PI * lengthM) / g,
            rationale:
              "Omits the square root on L / g.",
          },
          {
            value: Math.sqrt(lengthM / g),
            rationale:
              "Omits the factor of 2π and evaluates √(L / g) = 1 / ω.",
          },
          {
            value: (1 / (2 * Math.PI)) * Math.sqrt(g / lengthM),
            rationale:
              "Calculates the oscillation frequency f = (1 / 2π)√(g / L) instead of the period T.",
          },
        ];

    const options = buildNumericMcqOptions({
      truth,
      unit,
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "simple-harmonic-motion",
      templateArchetype: "simple-pendulum-period-tension-uk",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "periodS",
        "frequencyHz",
        "angularFrequencyRadS",
        "maxAngleDeg",
        "maxSpeedMs",
        "equilibriumTensionN",
        "totalEnergyJ",
      ],
      targetQuantityKey: targetKey,
      questionPlan: buildDigitFreePlan({
        summary:
          "Compute simple pendulum period or peak equilibrium speed using standard gravitational field strength",
        format: "mcq",
        strategies: [
          "confusing peak speed with peak acceleration",
          "treating horizontal arc amplitude as vertical drop height",
          "inverting length-to-gravity ratio",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: askSpeed
        ? `Angular frequency ω = √(g / L) = √(9.81 / ${lengthM}), so maximum speed v_max = ω x₀ = ${formatQty(sol.maxSpeedMs, "m s⁻¹", 3)}.`
        : `Period T = 2π√(L / g) = 2π√(${lengthM} / 9.81) = ${formatQty(sol.periodS, "s", 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Obtains ${formatQty(truth, unit, 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (6 marks)
  const stems = [
    `In ${ctx}, a pendulum bob of mass m = ${bobMassKg} kg suspended on a light cord of length L = ${lengthM} m oscillates in small-angle simple harmonic motion with arc amplitude x₀ = ${ampM} m. Take g = 9.81 m s⁻².`,
    `A simple pendulum rig in ${ctx} carries a ${bobMassKg} kg sphere on a ${lengthM} m wire, swinging with small-angle arc amplitude ${ampM} m where g = 9.81 m s⁻².`,
  ];
  return {
    id,
    conceptId: "simple-harmonic-motion",
    templateArchetype: "simple-pendulum-period-tension-uk",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "periodS",
      "frequencyHz",
      "angularFrequencyRadS",
      "maxAngleDeg",
      "maxSpeedMs",
      "equilibriumTensionN",
      "totalEnergyJ",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Determine oscillation period, equilibrium speed, and lowest-point cord tension for simple pendulum",
      format: "structured",
      strategies: [
        "compute small-angle pendulum period",
        "evaluate peak speed as bob crosses equilibrium",
        "apply radial force equation to determine maximum cord tension",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the period T of the pendulum.",
        marks: 2,
        targetQuantityKey: "periodS",
        expectedAnswer: formatQty(sol.periodS, "s", 3),
        workingSteps: [
          `T = 2π√(L / g) = 2π√(${lengthM} / 9.81) = ${formatQty(sol.periodS, "s", 3)}.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Calculate the maximum speed v_max of the bob as it passes through equilibrium.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "maxSpeedMs",
        expectedAnswer: formatQty(sol.maxSpeedMs, "m s⁻¹", 3),
        workingSteps: [
          `ω = √(9.81 / ${lengthM}) = ${formatSigFigs(sol.angularFrequencyRadS, 4)} rad s⁻¹.`,
          `v_max = ω x₀ = ${formatQty(sol.maxSpeedMs, "m s⁻¹", 3)}.`,
        ],
      },
      {
        partId: "c",
        prompt:
          "Determine the tension in the suspension cord as the bob passes through its lowest point.",
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "equilibriumTensionN",
        expectedAnswer: formatQty(sol.equilibriumTensionN, "N", 3),
        workingSteps: [
          `T_cord − mg = mv_max² / L ⇒ T_cord = ${bobMassKg}(9.81 + ${formatSigFigs(sol.maxSpeedMs, 4)}² / ${lengthM}) = ${formatQty(sol.equilibriumTensionN, "N", 3)}.`,
        ],
      },
    ],
    workedSolution: `(a) T = 2π√(${lengthM} / 9.81) = ${formatQty(sol.periodS, "s", 3)}. (b) v_max = √(9.81 / ${lengthM}) × ${ampM} = ${formatQty(sol.maxSpeedMs, "m s⁻¹", 3)}. (c) Lowest-point cord tension = m(g + v_max² / L) = ${formatQty(sol.equilibriumTensionN, "N", 3)}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Uses T = 2π√(${lengthM} / 9.81).`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains T = ${formatQty(sol.periodS, "s", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies v_max = ω x₀ = (2π / T) x₀.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains v_max = ${formatQty(sol.maxSpeedMs, "m s⁻¹", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Uses T_cord = mg + mv_max² / L at the bottom of the arc.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains T_cord = ${formatQty(sol.equilibriumTensionN, "N", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

// ============================================================================
// FAMILY 14: Defining SHM Relation a = -ω²x & Acceleration-Displacement Line
// (100% SL+HL core across IB, A-Level Y13, NCUK IFY; g-independent!)
// ============================================================================
function buildFamily14ShmDefiningAcceleration(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "simple-harmonic-motion",
    rng,
    ibLevelMode: "both",
  });

  const freqHz = rng.pick([1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 12.0]);
  const ampM = rng.pick([0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1]);
  const xSign = variantIndex % 3 === 2 ? -1 : 1;
  const queryX = Number((xSign * ampM * rng.pick([0.35, 0.45, 0.6, 0.75])).toFixed(4));
  const ctx = KINEMATIC_SHM_CONTEXTS[variantIndex % KINEMATIC_SHM_CONTEXTS.length];

  const spec: KinematicShmSpec = {
    kind: "kinematic-shm",
    frequencyHz: freqHz,
    amplitudeM: ampM,
    queryDisplacementM: queryX,
    plotMode: "phase-portrait",
    phasePlotKind: "acceleration-displacement",
  };
  const sol = solveOpticsShmScenario(spec) as KinematicShmSolution;
  const accelAtX = sol.accelerationAtQueryDisplacementMs2;
  const aMax = sol.maxAccelerationMs2;

  if (format === "mcq") {
    const askAtX = variantIndex % 2 === 0;
    const targetKey = askAtX
      ? "accelerationAtQueryDisplacementMs2"
      : "maxAccelerationMs2";
    const truth = askAtX ? accelAtX : aMax;

    const stems = askAtX
      ? [
          `In ${ctx}, a component executes simple harmonic motion at frequency f = ${freqHz} Hz with amplitude x₀ = ${ampM} m, as represented on the acceleration–displacement graph. Taking displacement to the right as positive, what is its signed acceleration a when x = ${queryX} m?`,
          `The acceleration–displacement line shown models ${ctx} oscillating harmonically at ${freqHz} Hz with amplitude ${ampM} m. Using a = −ω²x, calculate the signed acceleration at displacement x = ${queryX} m.`,
          `During calibration of ${ctx} vibrating at f = ${freqHz} Hz and amplitude ${ampM} m, a laser sensor records an instantaneous displacement x = ${queryX} m. Determine the signed SHM acceleration a at that instant.`,
        ]
      : [
          `A vibrating element in ${ctx} executes simple harmonic motion of frequency ${freqHz} Hz and amplitude ${ampM} m (sampled at x = ${queryX} m). What is the magnitude a_max of its maximum acceleration?`,
          `In ${ctx}, an oscillator undergoes SHM at ${freqHz} Hz with amplitude ${ampM} m (passing through x = ${queryX} m). Calculate the peak acceleration magnitude a_max = (2πf)² x₀.`,
        ];

    const distractors: DistractorCandidate[] = askAtX
      ? [
          {
            value: -accelAtX,
            rationale:
              "Omits the restoring minus sign in a = −ω²x, giving acceleration in the same sign as displacement instead of toward equilibrium.",
          },
          {
            value: -sol.angularFrequencyRadS * queryX,
            rationale:
              "Evaluates −ωx instead of −ω²x, forgetting to square the angular frequency.",
          },
          {
            value: -(freqHz * freqHz) * queryX,
            rationale:
              "Substitutes cyclic frequency f directly for angular frequency ω, computing −f²x instead of −(2πf)²x.",
          },
          {
            value: -aMax * Math.sign(queryX),
            rationale:
              "Evaluates acceleration at extreme amplitude x₀ instead of at the queried displacement x.",
          },
        ]
      : [
          {
            value: sol.angularFrequencyRadS * ampM,
            rationale:
              "Calculates ω x₀ (maximum speed) instead of ω² x₀ (maximum acceleration).",
          },
          {
            value: freqHz * freqHz * ampM,
            rationale:
              "Omits the factor (2π)² = 4π² and computes f² x₀.",
          },
          {
            value: Math.abs(accelAtX),
            rationale:
              "Computes the acceleration magnitude at x rather than at maximum displacement x₀.",
          },
        ];

    const options = buildNumericMcqOptions({
      truth,
      unit: "m s⁻²",
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "simple-harmonic-motion",
      templateArchetype: "shm-defining-acceleration-phase-portrait",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "angularFrequencyRadS",
        "periodS",
        "maxAccelerationMs2",
        "accelerationAtQueryDisplacementMs2",
        "maxSpeedMs",
        "speedAtQueryDisplacementMs",
      ],
      targetQuantityKey: targetKey,
      questionPlan: buildDigitFreePlan({
        summary:
          "Apply defining SHM equation relating signed restoring acceleration to displacement and frequency",
        format: "mcq",
        strategies: [
          "dropping negative restoring sign on acceleration",
          "using first power of angular frequency instead of squared angular frequency",
          "forgetting two-pi conversion between cyclic and angular frequency",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: askAtX
        ? `Angular frequency ω = 2πf = 2π(${freqHz}) = ${formatSigFigs(sol.angularFrequencyRadS, 4)} rad s⁻¹. By the defining SHM equation, a = −ω²x = −(${formatSigFigs(sol.angularFrequencyRadS, 4)})²(${queryX}) = ${formatQty(accelAtX, "m s⁻²", 3)}.`
        : `With ω = 2π(${freqHz}) = ${formatSigFigs(sol.angularFrequencyRadS, 4)} rad s⁻¹, maximum acceleration magnitude a_max = ω² x₀ = ${formatQty(aMax, "m s⁻²", 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates ω = 2πf and obtains ${formatQty(truth, "m s⁻²", 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (6 marks)
  const stems = [
    `In ${ctx}, a component oscillates in simple harmonic motion at frequency f = ${freqHz} Hz with amplitude x₀ = ${ampM} m. Its instantaneous state is examined when the displacement from equilibrium is x = ${queryX} m.`,
    `The acceleration–displacement phase graph for ${ctx} corresponds to simple harmonic motion of frequency ${freqHz} Hz and amplitude ${ampM} m, with a measurement taken at displacement x = ${queryX} m.`,
  ];
  return {
    id,
    conceptId: "simple-harmonic-motion",
    templateArchetype: "shm-defining-acceleration-phase-portrait",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "angularFrequencyRadS",
      "periodS",
      "maxAccelerationMs2",
      "accelerationAtQueryDisplacementMs2",
      "maxSpeedMs",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Calculate angular frequency, signed restoring acceleration at given displacement, and peak acceleration",
      format: "structured",
      strategies: [
        "convert cyclic frequency to angular frequency",
        "evaluate signed restoring acceleration via defining SHM relation",
        "compute peak acceleration magnitude at extreme amplitude",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the angular frequency ω of the oscillation.",
        marks: 2,
        targetQuantityKey: "angularFrequencyRadS",
        expectedAnswer: formatQty(sol.angularFrequencyRadS, "rad s⁻¹", 3),
        workingSteps: [
          `ω = 2πf = 2π × ${freqHz} = ${formatQty(sol.angularFrequencyRadS, "rad s⁻¹", 3)}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the signed acceleration a when the displacement is x = ${queryX} m.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "accelerationAtQueryDisplacementMs2",
        expectedAnswer: formatQty(accelAtX, "m s⁻²", 3),
        workingSteps: [
          `a = −ω²x = −(${formatSigFigs(sol.angularFrequencyRadS, 4)})² × (${queryX}) = ${formatQty(accelAtX, "m s⁻²", 3)}.`,
        ],
      },
      {
        partId: "c",
        prompt: "Determine the magnitude of the maximum acceleration a_max.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "maxAccelerationMs2",
        expectedAnswer: formatQty(aMax, "m s⁻²", 3),
        workingSteps: [
          `a_max = ω² x₀ = (${formatSigFigs(sol.angularFrequencyRadS, 4)})² × ${ampM} = ${formatQty(aMax, "m s⁻²", 3)}.`,
        ],
      },
    ],
    workedSolution: `(a) ω = 2π(${freqHz}) = ${formatQty(sol.angularFrequencyRadS, "rad s⁻¹", 3)}. (b) At x = ${queryX} m, a = −ω²x = ${formatQty(accelAtX, "m s⁻²", 3)}. (c) Maximum acceleration magnitude a_max = ω² x₀ = ${formatQty(aMax, "m s⁻²", 3)}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Uses ω = 2πf with f = ${freqHz} Hz.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains ω = ${formatQty(sol.angularFrequencyRadS, "rad s⁻¹", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies a = −ω²x including restoring sign.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains a = ${formatQty(accelAtX, "m s⁻²", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Uses a_max = ω² x₀.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains a_max = ${formatQty(aMax, "m s⁻²", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

// ============================================================================
// FAMILY 15: SHM Velocity-Displacement Phase Ellipse v = ±ω√(x₀² - x²)
// (STRICT LEVEL DEPTH: IB HL ONLY, plus A-Level Y13 & NCUK IFY — NEVER IB SL!)
// ============================================================================
function buildFamily15ShmVelocityPhaseEllipse(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "simple-harmonic-motion",
    rng,
    ibLevelMode: "hl-only",
  });
  const effectiveDiff: QuestionDifficulty =
    difficulty === "foundation" ? "standard" : difficulty;

  const omega = rng.pick([8, 10, 12, 15, 16, 20, 24, 25, 30, 40]);
  const ampM = rng.pick([0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.15]);
  // Pick x/x0 avoiding 1/sqrt(2) so omega*x != omega*sqrt(x0^2 - x^2)!
  const xRatios = [0.28, 0.36, 0.5, 0.6, 0.8];
  const queryX = Number((ampM * xRatios[(variantIndex + rng.int(0, 2)) % xRatios.length]).toFixed(4));
  const ctx = KINEMATIC_SHM_CONTEXTS[(variantIndex + 4) % KINEMATIC_SHM_CONTEXTS.length];

  const spec: KinematicShmSpec = {
    kind: "kinematic-shm",
    angularFrequencyRadS: omega,
    amplitudeM: ampM,
    queryDisplacementM: queryX,
    plotMode: "phase-portrait",
    phasePlotKind: "velocity-displacement",
  };
  const sol = solveOpticsShmScenario(spec) as KinematicShmSolution;
  const speedAtX = sol.speedAtQueryDisplacementMs;
  const vMax = sol.maxSpeedMs;

  if (format === "mcq") {
    const stems = [
      `In ${ctx}, a stage oscillates in simple harmonic motion with angular frequency ω = ${omega} rad s⁻¹ and amplitude x₀ = ${ampM} m, tracing the velocity–displacement ellipse shown. What is the speed v of the stage when its displacement from equilibrium is x = ${queryX} m?`,
      `A harmonic oscillator in ${ctx} moves with amplitude x₀ = ${ampM} m and angular frequency ω = ${omega} rad s⁻¹. Calculate its speed when passing through displacement x = ${queryX} m.`,
      `Engineers monitoring ${ctx} measure simple harmonic motion of amplitude ${ampM} m and angular frequency ${omega} rad s⁻¹. Determine the speed |v| = ω√(x₀² − x²) at displacement x = ${queryX} m.`,
      `The velocity–displacement phase portrait shown represents ${ctx} oscillating with ω = ${omega} rad s⁻¹ and x₀ = ${ampM} m. Find the oscillator's speed at x = ${queryX} m.`,
    ];
    const distractors: DistractorCandidate[] = [
      {
        value: omega * queryX,
        rationale:
          "Uses ωx instead of ω√(x₀² − x²), mistakenly assuming speed is directly proportional to displacement.",
      },
      {
        value: omega * (ampM - queryX),
        rationale:
          "Evaluates ω(x₀ − x) linearly instead of taking √(x₀² − x²).",
      },
      {
        value: vMax,
        rationale:
          "Calculates the maximum speed ωx₀ at equilibrium (x = 0) instead of the speed at x.",
      },
      {
        value: omega * Math.sqrt(ampM * ampM + queryX * queryX),
        rationale:
          "Adds x₀² + x² inside the square root instead of subtracting x₀² − x².",
      },
    ];
    const options = buildNumericMcqOptions({
      truth: speedAtX,
      unit: "m s⁻¹",
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "simple-harmonic-motion",
      templateArchetype: "shm-velocity-displacement-phase-ellipse",
      seed,
      syllabi,
      format: "mcq",
      difficulty: effectiveDiff,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "periodS",
        "frequencyHz",
        "maxSpeedMs",
        "speedAtQueryDisplacementMs",
        "positiveVelocityAtQueryDisplacementMs",
        "negativeVelocityAtQueryDisplacementMs",
        "maxAccelerationMs2",
      ],
      targetQuantityKey: "speedAtQueryDisplacementMs",
      questionPlan: buildDigitFreePlan({
        summary:
          "Evaluate instantaneous SHM speed at non-zero displacement using phase-ellipse relation",
        format: "mcq",
        strategies: [
          "substituting omega times displacement instead of radical form",
          "linearly subtracting displacement from amplitude without squaring",
          "computing equilibrium peak speed instead of off-center speed",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: `Using v = ω√(x₀² − x²) gives v = ${omega} × √(${ampM}² − ${queryX}²) = ${formatQty(speedAtX, "m s⁻¹", 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Substitutes into v = ω√(x₀² − x²) to obtain ${formatQty(speedAtX, "m s⁻¹", 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (6 marks)
  const stems = [
    `In ${ctx}, a resonant element executes simple harmonic motion with angular frequency ω = ${omega} rad s⁻¹ and amplitude x₀ = ${ampM} m, as depicted by its velocity–displacement phase ellipse. Measurements are taken when the displacement is x = ${queryX} m.`,
    `A precision oscillator in ${ctx} undergoes simple harmonic motion of amplitude ${ampM} m and angular frequency ${omega} rad s⁻¹. Consider the instant when its displacement from equilibrium is ${queryX} m.`,
  ];
  return {
    id,
    conceptId: "simple-harmonic-motion",
    templateArchetype: "shm-velocity-displacement-phase-ellipse",
    seed,
    syllabi,
    format: "structured",
    difficulty: effectiveDiff,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "periodS",
      "frequencyHz",
      "maxSpeedMs",
      "speedAtQueryDisplacementMs",
      "positiveVelocityAtQueryDisplacementMs",
      "negativeVelocityAtQueryDisplacementMs",
      "maxAccelerationMs2",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Determine oscillation period, equilibrium peak speed, and instantaneous speed at intermediate displacement",
      format: "structured",
      strategies: [
        "compute oscillation period from angular frequency",
        "evaluate peak speed at zero displacement",
        "apply SHM velocity-displacement equation at specified displacement",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts: [
      {
        partId: "a",
        prompt: "Calculate the period T of the oscillation.",
        marks: 2,
        targetQuantityKey: "periodS",
        expectedAnswer: formatQty(sol.periodS, "s", 3),
        workingSteps: [
          `T = 2π / ω = 2π / ${omega} = ${formatQty(sol.periodS, "s", 3)}.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Calculate the maximum speed v_max of the oscillator as it crosses equilibrium.",
        marks: 2,
        targetQuantityKey: "maxSpeedMs",
        expectedAnswer: formatQty(vMax, "m s⁻¹", 3),
        workingSteps: [
          `v_max = ω x₀ = ${omega} × ${ampM} = ${formatQty(vMax, "m s⁻¹", 3)}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the speed v of the oscillator when its displacement is x = ${queryX} m.`,
        marks: 2,
        targetQuantityKey: "speedAtQueryDisplacementMs",
        expectedAnswer: formatQty(speedAtX, "m s⁻¹", 3),
        workingSteps: [
          `v = ω√(x₀² − x²) = ${omega}√(${ampM}² − ${queryX}²) = ${formatQty(speedAtX, "m s⁻¹", 3)}.`,
        ],
      },
    ],
    workedSolution: `(a) T = 2π / ${omega} = ${formatQty(sol.periodS, "s", 3)}. (b) v_max = ${omega} × ${ampM} = ${formatQty(vMax, "m s⁻¹", 3)}. (c) At x = ${queryX} m, v = ${omega}√(${ampM}² − ${queryX}²) = ${formatQty(speedAtX, "m s⁻¹", 3)}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Uses T = 2π / ω with ω = ${omega} rad s⁻¹.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains T = ${formatQty(sol.periodS, "s", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies v_max = ω x₀.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains v_max = ${formatQty(vMax, "m s⁻¹", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Substitutes x₀ = ${ampM} m and x = ${queryX} m into v = ω√(x₀² − x²).`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains v = ${formatQty(speedAtX, "m s⁻¹", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

// ============================================================================
// FAMILY 16: SHM Parabolic Energy Exchange & Equal-Energy Displacement
// (STRICT LEVEL DEPTH: IB HL ONLY, plus A-Level Y13 & NCUK IFY — NEVER IB SL!)
// ============================================================================
function buildFamily16ShmEnergyCurves(
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
): CandidateQuestionInput {
  const rng = createPrng(seed);
  const syllabi = selectCompatibleSyllabiTags({
    conceptId: "simple-harmonic-motion",
    rng,
    ibLevelMode: "hl-only",
  });
  const effectiveDiff: QuestionDifficulty =
    difficulty === "foundation" ? "standard" : difficulty;

  const massKg = rng.pick([0.15, 0.25, 0.4, 0.5, 0.6, 0.8, 1.2]);
  const omega = rng.pick([10, 12, 15, 18, 20, 25, 30]);
  const ampM = rng.pick([0.04, 0.06, 0.08, 0.1, 0.12, 0.14]);
  // Avoid x = x0/sqrt(2) so Ek != Ep!
  const xRatios = [0.25, 0.4, 0.5, 0.6, 0.8];
  const queryX = Number((ampM * xRatios[(variantIndex + rng.int(0, 2)) % xRatios.length]).toFixed(4));
  const ctx = KINEMATIC_SHM_CONTEXTS[(variantIndex + 8) % KINEMATIC_SHM_CONTEXTS.length];

  const spec: KinematicShmSpec = {
    kind: "kinematic-shm",
    massKg,
    angularFrequencyRadS: omega,
    amplitudeM: ampM,
    queryDisplacementM: queryX,
    plotMode: variantIndex % 4 === 3 ? "energy-time" : "energy-displacement",
  };
  const sol = solveOpticsShmScenario(spec) as KinematicShmSolution;
  const eTot = sol.totalEnergyJ;
  const ekAtX = sol.kineticEnergyAtQueryDisplacementJ;
  const epAtX = sol.potentialEnergyAtQueryDisplacementJ;
  const xEq = sol.equalEnergyDisplacementM;

  if (format === "mcq") {
    const subMode = variantIndex % 3;
    if (subMode === 0) {
      // Target: kineticEnergyAtQueryDisplacementJ
      const stems = [
        `In ${ctx}, an oscillating body of mass ${massKg} kg executes simple harmonic motion with angular frequency ω = ${omega} rad s⁻¹ and amplitude x₀ = ${ampM} m. What is its kinetic energy E_k when its displacement from equilibrium is x = ${queryX} m?`,
        `The parabolic SHM energy graph shown corresponds to ${ctx} (mass ${massKg} kg, angular frequency ${omega} rad s⁻¹, amplitude ${ampM} m). Calculate the kinetic energy E_k at displacement x = ${queryX} m.`,
        `A ${massKg} kg harmonic proof mass in ${ctx} vibrates at ω = ${omega} rad s⁻¹ with amplitude ${ampM} m. Determine its kinetic energy at the instant x = ${queryX} m.`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: epAtX,
          rationale:
            "Calculates the potential energy ½mω²x² at x rather than the kinetic energy ½mω²(x₀² − x²).",
        },
        {
          value: eTot,
          rationale:
            "Computes the total mechanical energy ½mω²x₀² instead of subtracting potential energy at x.",
        },
        {
          value: eTot * (1 - queryX / ampM),
          rationale:
            "Interpolates energy linearly as E_tot(1 − x / x₀) instead of quadratically as E_tot(1 − x² / x₀²).",
        },
        {
          value: 2 * ekAtX,
          rationale:
            "Omits the factor of ½ in E_k = ½mω²(x₀² − x²).",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: ekAtX,
        unit: "J",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "simple-harmonic-motion",
        templateArchetype: "shm-parabolic-energy-exchange-curves",
        seed,
        syllabi,
        format: "mcq",
        difficulty: effectiveDiff,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "totalEnergyJ",
          "kineticEnergyAtQueryDisplacementJ",
          "potentialEnergyAtQueryDisplacementJ",
          "equalEnergyDisplacementM",
          "periodS",
          "frequencyHz",
          "energyOscillationFrequencyHz",
        ],
        targetQuantityKey: "kineticEnergyAtQueryDisplacementJ",
        questionPlan: buildDigitFreePlan({
          summary:
            "Calculate instantaneous kinetic energy at intermediate SHM displacement using parabolic energy conservation",
          format: "mcq",
          strategies: [
            "computing potential energy instead of kinetic energy",
            "linearly interpolating energy with displacement instead of quadratic scaling",
            "omitting one-half prefactor in kinetic energy expression",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `Using E_k = ½mω²(x₀² − x²) gives E_k = 0.5 × ${massKg} × ${omega}² × (${ampM}² − ${queryX}²) = ${formatQty(ekAtX, "J", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates ½mω²(x₀² − x²) = ${formatQty(ekAtX, "J", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    if (subMode === 1) {
      // Target: equalEnergyDisplacementM (x0 / sqrt(2))
      const stems = [
        `In ${ctx}, a ${massKg} kg oscillator moves harmonically at ω = ${omega} rad s⁻¹ with amplitude x₀ = ${ampM} m (sampled at ${queryX} m). At what positive displacement x from equilibrium is its kinetic energy equal to its potential energy (E_k = E_p)?`,
        `For ${ctx} executing undamped SHM of mass ${massKg} kg, angular frequency ${omega} rad s⁻¹, and amplitude ${ampM} m (reference mark at ${queryX} m), determine the positive displacement at which E_k = E_p.`,
      ];
      const distractors: DistractorCandidate[] = [
        {
          value: ampM / 2,
          rationale:
            "Assumes E_k = E_p occurs at half the amplitude (x₀ / 2, where E_p = ¼E_tot) instead of x₀ / √2.",
        },
        {
          value: ampM / 4,
          rationale:
            "Squares the ½ factor to obtain x₀ / 4 instead of taking the square root x₀ / √2.",
        },
        {
          value: (ampM * Math.sqrt(3)) / 2,
          rationale:
            "Computes (√3 / 2)x₀ (where E_p = ¾E_tot) instead of x₀ / √2.",
        },
      ];
      const options = buildNumericMcqOptions({
        truth: xEq,
        unit: "m",
        distractors,
        rng,
      });
      const correctLabel = options.find((o) => o.isCorrect)!.label;
      return {
        id,
        conceptId: "simple-harmonic-motion",
        templateArchetype: "shm-parabolic-energy-exchange-curves",
        seed,
        syllabi,
        format: "mcq",
        difficulty: effectiveDiff,
        domain: "optics-shm",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "totalEnergyJ",
          "kineticEnergyAtQueryDisplacementJ",
          "potentialEnergyAtQueryDisplacementJ",
          "equalEnergyDisplacementM",
          "periodS",
          "frequencyHz",
        ],
        targetQuantityKey: "equalEnergyDisplacementM",
        questionPlan: buildDigitFreePlan({
          summary:
            "Determine positive displacement at which kinetic and potential SHM parabolic energy curves intersect",
          format: "mcq",
          strategies: [
            "selecting half-amplitude instead of amplitude divided by root two",
            "squaring half instead of taking square root",
            "confusing three-quarter energy point with equal-energy point",
          ],
        }),
        stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
        options,
        workedSolution: `Setting E_p = ½E_tot gives ½mω²x² = ½(½mω²x₀²), so x² = x₀² / 2 and x = x₀ / √2 = ${ampM} / √2 = ${formatQty(xEq, "m", 3)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Solves x² = x₀² / 2 to obtain x = x₀ / √2 = ${formatQty(xEq, "m", 3)} (${correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
      };
    }

    // subMode === 2: energyOscillationFrequencyHz (2f)
    const stems = [
      `A ${massKg} kg resonator in ${ctx} executes simple harmonic motion of amplitude ${ampM} m and angular frequency ω = ${omega} rad s⁻¹ (probed at x = ${queryX} m). At what cyclic frequency f_E does its kinetic energy oscillate with time?`,
      `In ${ctx}, a ${massKg} kg mass undergoes SHM with ω = ${omega} rad s⁻¹ and amplitude ${ampM} m (with a sensor at x = ${queryX} m). Calculate the frequency f_E at which the kinetic energy completes full cycles.`,
    ];
    const distractors: DistractorCandidate[] = [
      {
        value: sol.frequencyHz,
        rationale:
          "Gives the mechanical displacement frequency f = ω / (2π) instead of recognizing that E_k ∝ cos²(ωt) oscillates at 2f.",
      },
      {
        value: sol.frequencyHz / 2,
        rationale:
          "Halves the mechanical frequency instead of doubling it.",
      },
      {
        value: 2 * omega,
        rationale:
          "Calculates 2ω in rad s⁻¹ without dividing by 2π to convert to hertz.",
      },
      {
        value: 4 * sol.frequencyHz,
        rationale:
          "Multiplies the mechanical frequency by four instead of two.",
      },
    ];
    const options = buildNumericMcqOptions({
      truth: sol.energyOscillationFrequencyHz,
      unit: "Hz",
      distractors,
      rng,
    });
    const correctLabel = options.find((o) => o.isCorrect)!.label;
    return {
      id,
      conceptId: "simple-harmonic-motion",
      templateArchetype: "shm-parabolic-energy-exchange-curves",
      seed,
      syllabi,
      format: "mcq",
      difficulty: effectiveDiff,
      domain: "optics-shm",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "totalEnergyJ",
        "kineticEnergyAtQueryDisplacementJ",
        "potentialEnergyAtQueryDisplacementJ",
        "equalEnergyDisplacementM",
        "periodS",
        "frequencyHz",
        "energyOscillationFrequencyHz",
        "energyOscillationPeriodS",
      ],
      targetQuantityKey: "energyOscillationFrequencyHz",
      questionPlan: buildDigitFreePlan({
        summary:
          "Determine double-frequency cyclic rate of kinetic energy variation during simple harmonic motion",
        format: "mcq",
        strategies: [
          "equating energy oscillation frequency to mechanical frequency",
          "forgetting two-pi conversion from angular to cyclic frequency",
          "halving instead of doubling mechanical frequency",
        ],
      }),
      stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
      options,
      workedSolution: `Mechanical frequency f = ω / (2π) = ${omega} / (2π) = ${formatSigFigs(sol.frequencyHz, 4)} Hz. Because kinetic energy reaches a maximum twice per mechanical period, f_E = 2f = ω / π = ${formatQty(sol.energyOscillationFrequencyHz, "Hz", 3)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates f_E = 2f = ω / π = ${formatQty(sol.energyOscillationFrequencyHz, "Hz", 3)} (${correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
  }

  // Structured (6 marks)
  const stems = [
    `In ${ctx}, a mass m = ${massKg} kg oscillates in undamped simple harmonic motion with angular frequency ω = ${omega} rad s⁻¹ and amplitude x₀ = ${ampM} m. The parabolic energy–displacement curves are analyzed at displacement x = ${queryX} m.`,
    `A ${massKg} kg harmonic oscillator in ${ctx} vibrates with angular frequency ${omega} rad s⁻¹ and amplitude ${ampM} m. Consider its mechanical energy distribution when passing through displacement x = ${queryX} m.`,
  ];
  return {
    id,
    conceptId: "simple-harmonic-motion",
    templateArchetype: "shm-parabolic-energy-exchange-curves",
    seed,
    syllabi,
    format: "structured",
    difficulty: effectiveDiff,
    domain: "optics-shm",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "totalEnergyJ",
      "kineticEnergyAtQueryDisplacementJ",
      "potentialEnergyAtQueryDisplacementJ",
      "equalEnergyDisplacementM",
      "periodS",
      "frequencyHz",
      "energyOscillationFrequencyHz",
    ],
    questionPlan: buildDigitFreePlan({
      summary:
        "Compute total SHM energy, potential and kinetic energy partition at given displacement, and equal-energy crossover position",
      format: "structured",
      strategies: [
        "calculate total mechanical energy from mass, angular frequency, and amplitude",
        "evaluate kinetic energy remaining at specified non-zero displacement",
        "solve for positive displacement where kinetic and potential energies match",
      ],
    }),
    stem: stems[(variantIndex + rng.int(0, stems.length - 1)) % stems.length],
    parts: [
      {
        partId: "a",
        prompt:
          "Calculate the total mechanical energy E_tot of the oscillating mass.",
        marks: 2,
        targetQuantityKey: "totalEnergyJ",
        expectedAnswer: formatQty(eTot, "J", 3),
        workingSteps: [
          `E_tot = ½mω²x₀² = 0.5 × ${massKg} × ${omega}² × ${ampM}² = ${formatQty(eTot, "J", 3)}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the kinetic energy E_k of the mass when its displacement is x = ${queryX} m.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "kineticEnergyAtQueryDisplacementJ",
        expectedAnswer: formatQty(ekAtX, "J", 3),
        workingSteps: [
          `E_p = ½mω²x² = ${formatQty(epAtX, "J", 3)}.`,
          `E_k = E_tot − E_p = ½mω²(x₀² − x²) = ${formatQty(ekAtX, "J", 3)}.`,
        ],
      },
      {
        partId: "c",
        prompt:
          "Determine the positive displacement x from equilibrium at which kinetic energy equals potential energy.",
        marks: 2,
        targetQuantityKey: "equalEnergyDisplacementM",
        expectedAnswer: formatQty(xEq, "m", 3),
        workingSteps: [
          `½mω²x² = ½(½mω²x₀²) ⇒ x = x₀ / √2 = ${ampM} / √2 = ${formatQty(xEq, "m", 3)}.`,
        ],
      },
    ],
    workedSolution: `(a) E_tot = ½(${massKg})(${omega}²)(${ampM}²) = ${formatQty(eTot, "J", 3)}. (b) At x = ${queryX} m, E_p = ${formatQty(epAtX, "J", 3)} and E_k = E_tot − E_p = ${formatQty(ekAtX, "J", 3)}. (c) E_k = E_p when x = x₀ / √2 = ${formatQty(xEq, "m", 3)}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: `Substitutes m = ${massKg} kg, ω = ${omega} rad s⁻¹, and x₀ = ${ampM} m into E_tot = ½mω²x₀².`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains E_tot = ${formatQty(eTot, "J", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies E_k = ½mω²(x₀² − x²) or E_tot − ½mω²x².",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains E_k = ${formatQty(ekAtX, "J", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Sets E_p = ½E_tot to obtain x = x₀ / √2.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains x = ${formatQty(xEq, "m", 3)}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
  };
}

type FamilyCandidateBuilder = (
  id: string,
  seed: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  variantIndex: number,
) => CandidateQuestionInput;

const FAMILY_BUILDERS: readonly FamilyCandidateBuilder[] = [
  buildFamily1PlanarSnell,
  buildFamily2CriticalTir,
  buildFamily3MultiLayerSlab,
  buildFamily4FiberWallTir,
  buildFamily5FiberAcceptance,
  buildFamily6FiberModalDispersion,
  buildFamily7ConvergingReal,
  buildFamily8ConvergingVirtual,
  buildFamily9DivergingLens,
  buildFamily10HorizontalMassSpring,
  buildFamily11VerticalMassSpring,
  buildFamily12PendulumIb,
  buildFamily13PendulumUk,
  buildFamily14ShmDefiningAcceleration,
  buildFamily15ShmVelocityPhaseEllipse,
  buildFamily16ShmEnergyCurves,
];

const DIFFICULTY_ROTATION: readonly QuestionDifficulty[] = [
  "foundation",
  "standard",
  "standard",
  "higher",
];

/**
 * Generates deterministic, solver- and gate-verified `optics-shm` question packages
 * across 16 `(conceptId, templateArchetype)` family groups spanning IB (SL/HL),
 * UK A-Level (Y12/Y13), and NCUK IFY.
 */
export function generateOpticsShmCandidates(
  options: GenerateOpticsShmCandidatesOptions = {},
): CandidateQuestionInput[] {
  const count = options.count ?? 336;
  const baseSeed = options.baseSeed ?? 620_000;
  const mcqFraction = options.mcqFraction ?? 0.65;
  const generatorModel = options.generatorModel ?? "gemini-4-carbon-high";

  if (!Number.isInteger(count) || count < 0 || count > 5000) {
    throw new Error("count must be an integer between 0 and 5000");
  }
  if (!Number.isInteger(baseSeed) || baseSeed < 0) {
    throw new Error("baseSeed must be a non-negative integer");
  }
  if (!Number.isFinite(mcqFraction) || mcqFraction < 0 || mcqFraction > 1) {
    throw new Error("mcqFraction must lie between 0 and 1");
  }

  const targetMcqTotal = Math.round(count * mcqFraction);
  const candidates: CandidateQuestionInput[] = [];
  const existingShardItems: ExistingStemEntry[] = [];
  const perFamilyCount = new Array<number>(FAMILY_BUILDERS.length).fill(0);

  let mcqEmitted = 0;

  for (let i = 0; i < count; i += 1) {
    const familyIdx = i % FAMILY_BUILDERS.length;
    const builder = FAMILY_BUILDERS[familyIdx];
    const remainingSlots = count - i;
    const remainingMcqNeeded = targetMcqTotal - mcqEmitted;

    let format: QuestionFormat;
    if (remainingMcqNeeded <= 0) {
      format = "structured";
    } else if (remainingMcqNeeded >= remainingSlots) {
      format = "mcq";
    } else {
      // Spread MCQs evenly across every family
      const idealMcqSoFar = Math.round(((i + 1) * targetMcqTotal) / count);
      format = mcqEmitted < idealMcqSoFar ? "mcq" : "structured";
    }

    const difficulty =
      DIFFICULTY_ROTATION[(perFamilyCount[familyIdx] + familyIdx) % DIFFICULTY_ROTATION.length];
    const seqStr = String(i + 1).padStart(4, "0");
    const fmtSlug = format === "mcq" ? "mcq" : "struct";
    const id = `sp-optics-shm-${fmtSlug}-${seqStr}`;

    let accepted: CandidateQuestionInput | undefined;
    let acceptedFingerprint = "";
    let lastErrorSummary = "";

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const candidateSeed = baseSeed + i * 53 + attempt * 1009;
      const variantIdx = perFamilyCount[familyIdx] + attempt * 7;
      const rawCandidate = builder(
        id,
        candidateSeed,
        format,
        difficulty,
        variantIdx,
      );
      const candidate: CandidateQuestionInput = {
        ...rawCandidate,
        generatorModel,
      };

      const check = verifyCandidateWithGate(candidate, {
        existingShardItems,
        nearDuplicateSimilarityThreshold: 0.72,
      });

      if (check.evaluation.valid) {
        accepted = candidate;
        acceptedFingerprint = check.evaluation.stemFingerprint;
        break;
      }
      lastErrorSummary = check.evaluation.issues
        .map((iss) => `${iss.code}: ${iss.message}`)
        .join(" | ");
    }

    if (!accepted) {
      throw new Error(
        `Failed to synthesize gate-valid optics-shm candidate ${id} (family ${OPTICS_SHM_FAMILY_SPECS[familyIdx].templateArchetype}): ${lastErrorSummary}`,
      );
    }

    // Keep unused import guard clean
    void (accepted.scenarioSpec as unknown as OpticsShmScenarioSpec);

    if (format === "mcq") {
      mcqEmitted += 1;
    }
    perFamilyCount[familyIdx] += 1;
    candidates.push(accepted);
    existingShardItems.push({
      id: accepted.id,
      stem: accepted.stem,
      stemFingerprint: acceptedFingerprint,
    });
  }

  return candidates;
}
