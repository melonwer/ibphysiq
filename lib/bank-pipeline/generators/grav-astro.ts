import {
  getCompatibleSyllabiForConcept,
} from "@/lib/constants/syllabi/crosswalk";
import { QuestionFormat } from "@/lib/constants/syllabi/types";
import {
  EARTH_MASS_KG,
  EARTH_MOON_DISTANCE_M,
  EARTH_RADIUS_M,
  GRAVITATIONAL_CONSTANT,
  LIGHT_YEARS_PER_PARSEC,
  MOON_RADIUS_M,
  PARSEC_M,
  SOLAR_LUMINOSITY_W,
  SOLAR_RADIUS_M,
  SPEED_OF_LIGHT_MS,
  STEFAN_BOLTZMANN_WM2K4,
  WIEN_DISPLACEMENT_MK,
  BankedCurveScenario,
  CircularOrbitEnergyScenario,
  ConicalPendulumScenario,
  CosmologicalRedshiftScenario,
  createGravAstroRng,
  FlatCurveScenario,
  HrDiagramScenario,
  HrRegion,
  HrStarSpec,
  PlanetaryFieldPotentialScenario,
  SeededRng,
  solveGravAstroScenario,
  StellarParallaxScenario,
  StellarRadiationScenario,
  TwoBodyNullPointScenario,
  VerticalCircleScenario,
} from "@/lib/visuals/grav-astro";

import { getDomainAdapter } from "../domain-registry";
import {
  buildOptionEquivalenceKey,
  computeStemSimilarity,
  extractNumbersFromPhysicsText,
  numbersAgreeWithinTolerance,
} from "../numeric-checker";
import { checkSvgHiddenQuantityLeaks } from "../svg-guard";
import {
  CandidateQuestionInput,
  CandidateQuestionPlan,
  MarkSchemePoint,
  McqOptionItem,
  MCQ_OPTION_LABELS,
  QuestionDifficulty,
  RequiredGivenSpec,
  StructuredQuestionPart,
  SyllabusTag,
} from "../types";

export const DEFAULT_GRAV_ASTRO_CANDIDATE_COUNT = 336;
export const DEFAULT_GRAV_ASTRO_SEED = 20261117;

export interface GenerateGravAstroCandidatesOptions {
  readonly count?: number;
  readonly seed?: number;
  readonly mcqFraction?: number;
  readonly generatorModel?: string;
}

export interface GravAstroArchetypeDescriptor {
  readonly conceptId: string;
  readonly templateArchetype: string;
  readonly scenarioKind:
    | "conical-pendulum"
    | "flat-curve"
    | "banked-curve"
    | "vertical-circle"
    | "planetary-field-potential"
    | "circular-orbit-energy"
    | "two-body-null-point"
    | "stellar-radiation"
    | "hr-diagram"
    | "stellar-parallax"
    | "cosmological-redshift";
}

export const GRAV_ASTRO_ARCHETYPES: readonly GravAstroArchetypeDescriptor[] = [
  {
    conceptId: "uniform-circular-motion",
    templateArchetype: "conical-pendulum-tension-speed-period",
    scenarioKind: "conical-pendulum",
  },
  {
    conceptId: "uniform-circular-motion",
    templateArchetype: "flat-curve-static-friction-skid-limit",
    scenarioKind: "flat-curve",
  },
  {
    conceptId: "uniform-circular-motion",
    templateArchetype: "banked-curve-design-and-friction",
    scenarioKind: "banked-curve",
  },
  {
    conceptId: "uniform-circular-motion",
    templateArchetype: "vertical-circle-uniform-top-bottom",
    scenarioKind: "vertical-circle",
  },
  {
    conceptId: "uniform-circular-motion",
    templateArchetype: "vertical-circle-energy-loop-the-loop",
    scenarioKind: "vertical-circle",
  },
  {
    conceptId: "gravitational-force-field",
    templateArchetype: "planetary-exterior-interior-field",
    scenarioKind: "planetary-field-potential",
  },
  {
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "planetary-potential-and-escape",
    scenarioKind: "planetary-field-potential",
  },
  {
    conceptId: "gravitational-force-field",
    templateArchetype: "circular-orbit-velocity-and-kepler",
    scenarioKind: "circular-orbit-energy",
  },
  {
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "circular-orbit-virial-mechanical-energy",
    scenarioKind: "circular-orbit-energy",
  },
  {
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "orbital-transfer-energy-hohmann",
    scenarioKind: "circular-orbit-energy",
  },
  {
    conceptId: "gravitational-force-field",
    templateArchetype: "two-body-collinear-null-field",
    scenarioKind: "two-body-null-point",
  },
  {
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "two-body-potential-saddle-barrier",
    scenarioKind: "two-body-null-point",
  },
  {
    conceptId: "stellar-radiation-hr-diagram",
    templateArchetype: "wien-stefan-boltzmann-brightness",
    scenarioKind: "stellar-radiation",
  },
  {
    conceptId: "stellar-radiation-hr-diagram",
    templateArchetype: "hr-diagram-stellar-radius-evolution",
    scenarioKind: "hr-diagram",
  },
  {
    conceptId: "stellar-radiation-hr-diagram",
    templateArchetype: "stellar-parallax-distance-brightness",
    scenarioKind: "stellar-parallax",
  },
  {
    conceptId: "cosmology-hubble-law",
    templateArchetype: "cosmological-redshift-hubble-expansion",
    scenarioKind: "cosmological-redshift",
  },
] as const;

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

function toSuperscriptInt(exp: number): string {
  return [...String(exp)].map((ch) => SUPERSCRIPT_MAP[ch] ?? ch).join("");
}

/**
 * Formats a solver ground-truth scalar to 3 significant figures using clean
 * exam-style scientific notation when |v| < 0.001 or |v| >= 1000.
 */
export function fmt3sf(value: number, unit = ""): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot format non-finite value: ${String(value)}`);
  }
  if (Object.is(value, -0) || Math.abs(value) <= 1e-15) {
    return unit ? `0 ${unit}` : "0";
  }
  const abs = Math.abs(value);
  const prec = value.toPrecision(3);
  let numStr: string;
  if (abs < 0.001 || prec.includes("e")) {
    const [mantissa, rawExp] = value.toExponential(2).split("e");
    const expInt = Number.parseInt(rawExp, 10);
    numStr = `${mantissa} × 10${toSuperscriptInt(expInt)}`;
  } else {
    numStr = prec;
  }
  return unit ? `${numStr} ${unit}` : numStr;
}

/**
 * Formats an exact input given without losing precision when 2-4 s.f. inputs are supplied.
 */
function fmtGiven(value: number, unit = ""): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot format non-finite given: ${String(value)}`);
  }
  if (value === 0) {
    return unit ? `0 ${unit}` : "0";
  }
  const abs = Math.abs(value);
  let numStr: string;
  if (abs >= 0.001 && abs < 100000) {
    numStr = String(Number(value.toPrecision(6)));
  } else {
    const expStr = value.toExponential();
    const [rawMantissa, rawExp] = expStr.split("e");
    const cleanMantissa = String(Number(Number(rawMantissa).toPrecision(4)));
    const decMantissa = cleanMantissa.includes(".")
      ? cleanMantissa
      : `${cleanMantissa}.0`;
    const expInt = Number.parseInt(rawExp, 10);
    numStr = `${decMantissa} × 10${toSuperscriptInt(expInt)}`;
  }
  return unit ? `${numStr} ${unit}` : numStr;
}

interface MisconceptionCandidate {
  readonly value: number;
  readonly rationale: string;
}

function buildNumericMcqOptions(
  truth: number,
  unit: string,
  misconceptions: readonly MisconceptionCandidate[],
): McqOptionItem[] {
  const correctText = fmt3sf(truth, unit);
  const correctEquiv = buildOptionEquivalenceKey(correctText);

  const chosen: Array<{
    numericSortKey: number;
    text: string;
    isCorrect: boolean;
    distractorRationale?: string;
  }> = [
    {
      numericSortKey: truth,
      text: correctText,
      isCorrect: true,
    },
  ];
  const seenEquiv = new Set<string>([correctEquiv]);

  const tryAccept = (candVal: number, rationale: string): boolean => {
    if (!Number.isFinite(candVal)) return false;
    const scale = Math.max(Math.abs(truth), 1e-12);
    if (Math.abs(candVal - truth) / scale < 0.025) return false;
    for (const prev of chosen) {
      const prevScale = Math.max(Math.abs(prev.numericSortKey), 1e-12);
      if (Math.abs(candVal - prev.numericSortKey) / prevScale < 0.022) {
        return false;
      }
    }
    const text = fmt3sf(candVal, unit);
    const eq = buildOptionEquivalenceKey(text);
    if (seenEquiv.has(eq)) return false;
    seenEquiv.add(eq);
    chosen.push({
      numericSortKey: candVal,
      text,
      isCorrect: false,
      distractorRationale: rationale,
    });
    return true;
  };

  for (const m of misconceptions) {
    if (chosen.length >= 4) break;
    tryAccept(m.value, m.rationale);
  }

  const fallbackFactors: ReadonlyArray<{ factor: number; rationale: string }> = [
    {
      factor: 0.5,
      rationale: "Introduces an extraneous factor of one-half during algebraic rearrangement.",
    },
    {
      factor: 2.0,
      rationale: "Doubles the expression by omitting a factor of two in the denominator.",
    },
    {
      factor: Math.SQRT2,
      rationale: "Multiplies by √2 through confusing circular and escape scaling relations.",
    },
    {
      factor: 1 / Math.SQRT2,
      rationale: "Divides by √2 due to an inverted root factor in the governing equation.",
    },
    {
      factor: 0.25,
      rationale: "Applies an extra factor of one-quarter from squaring a halving factor.",
    },
    {
      factor: 4.0,
      rationale: "Multiplies by four by squaring a factor of two in the numerator.",
    },
  ];

  for (const fb of fallbackFactors) {
    if (chosen.length >= 4) break;
    tryAccept(truth * fb.factor, fb.rationale);
  }

  if (chosen.length !== 4) {
    throw new Error(`Unable to build 4 distinct MCQ options around ${correctText}`);
  }

  chosen.sort((a, b) => a.numericSortKey - b.numericSortKey);

  return chosen.map((item, idx) => ({
    label: MCQ_OPTION_LABELS[idx],
    text: item.text,
    isCorrect: item.isCorrect,
    ...(item.isCorrect ? {} : { distractorRationale: item.distractorRationale }),
  }));
}

function buildDigitFreePlan(
  targetSummary: string,
  format: QuestionFormat,
  subpartTargets: readonly string[] = [],
): CandidateQuestionPlan {
  if (/\d/.test(targetSummary)) {
    throw new Error(`questionPlan targetSummary must be digit-free: ${targetSummary}`);
  }
  if (format === "mcq") {
    return {
      targetSummary,
      distractorStrategy: [
        "radial-or-component-projection-inversion",
        "missing-prefactor-or-sign-reversal",
        "altitude-versus-centre-distance-substitution",
      ],
      assumptions: [
        "treat-bodies-as-spherically-symmetric-or-point-masses",
        "neglect-unmodelled-drag-unless-specified",
      ],
    };
  }
  return {
    targetSummary,
    subpartStrategy: subpartTargets.map((t) => {
      if (/\d/.test(t)) {
        throw new Error(`subpartStrategy entry must be digit-free: ${t}`);
      }
      return t;
    }),
    assumptions: [
      "apply-si-or-data-booklet-astronomical-constants",
      "report-final-values-to-three-significant-figures",
    ],
  };
}

interface SyllabusFilterConfig {
  readonly conceptId: string;
  readonly format: QuestionFormat;
  readonly variantIndex: number;
  /** For terrestrial g-dependent items: "ib" forces g=9.8 & IB-only; "metric981" forces g=9.81 & A-Level/NCUK. */
  readonly gravityRegime?: "ib" | "metric981";
  /** Restricts IB to HL even if the parent concept also includes SL. */
  readonly ibHlOnly?: boolean;
  /** Excludes NCUK (e.g. interior g(r) without derivation or IB-HL-only cosmic scale factor). */
  readonly excludeNcuk?: boolean;
  /** Excludes A-Level (e.g. IB-HL-only cosmic scale factor). */
  readonly excludeAlevel?: boolean;
  /** Preferred IB subtopic override when a concept maps to multiple IB subtopics (e.g. B.1 vs E.5). */
  readonly preferredIbSubtopicId?: string;
}

function resolveSyllabiTags(cfg: SyllabusFilterConfig): SyllabusTag[] {
  const compatible = getCompatibleSyllabiForConcept(cfg.conceptId, {
    format: cfg.format,
  });
  const tags: SyllabusTag[] = [];

  for (const mapping of compatible) {
    if (cfg.gravityRegime === "ib" && mapping.syllabus !== "ib") {
      continue;
    }
    if (cfg.gravityRegime === "metric981" && mapping.syllabus === "ib") {
      continue;
    }
    if (cfg.excludeNcuk && mapping.syllabus === "ncuk") {
      continue;
    }
    if (cfg.excludeAlevel && mapping.syllabus === "alevel") {
      continue;
    }

    let levels = [...mapping.levels];
    if (mapping.syllabus === "ib" && cfg.ibHlOnly) {
      levels = levels.filter((l) => l === "HL");
    }
    if (levels.length === 0) {
      continue;
    }

    let chosenLevel: string;
    if (mapping.syllabus === "ib") {
      chosenLevel =
        levels.length > 1
          ? levels[cfg.variantIndex % levels.length]
          : levels[0];
    } else if (mapping.syllabus === "alevel") {
      chosenLevel = levels.includes("Y13") ? "Y13" : levels[0];
    } else {
      // NCUK: rotate cumulative IFY and semester tag so both IFY and IFY-S1/S2 are well represented
      chosenLevel = levels.includes("IFY")
        ? cfg.variantIndex % 3 === 0 && levels.length > 1
          ? levels[0]
          : "IFY"
        : levels[0];
    }

    let subtopicId = mapping.subtopicIds[0];
    let topicId = mapping.topicIds[0];
    if (
      mapping.syllabus === "ib" &&
      cfg.preferredIbSubtopicId &&
      mapping.subtopicIds.includes(cfg.preferredIbSubtopicId)
    ) {
      subtopicId = cfg.preferredIbSubtopicId;
      topicId =
        cfg.preferredIbSubtopicId === "ib-e5-fusion-stars"
          ? "ib-theme-e"
          : cfg.preferredIbSubtopicId === "ib-b1-thermal-energy-transfers"
            ? "ib-theme-b"
            : topicId;
    }

    tags.push({
      syllabus: mapping.syllabus,
      level: chosenLevel,
      topicId,
      ...(subtopicId ? { subtopicId } : {}),
    });
  }

  if (tags.length === 0) {
    throw new Error(
      `No compatible syllabus tags resolved for ${cfg.conceptId} (${cfg.format})`,
    );
  }
  return tags;
}

function pickDifficulty(
  variantIndex: number,
  bias: "balanced" | "higher" = "balanced",
): QuestionDifficulty {
  if (bias === "higher") {
    const seq: readonly QuestionDifficulty[] = [
      "standard",
      "higher",
      "standard",
      "higher",
    ];
    return seq[variantIndex % seq.length];
  }
  const seq: readonly QuestionDifficulty[] = [
    "foundation",
    "standard",
    "standard",
    "higher",
  ];
  return seq[variantIndex % seq.length];
}

function perturbCycle(
  base: number,
  variantIndex: number,
  cycleLen: number,
  step = 0.029,
): number {
  const cycle = Math.floor(variantIndex / Math.max(1, cycleLen)) % 9;
  if (cycle === 0) return base;
  return Number((base * (1 + step * cycle)).toPrecision(3));
}

function pickTemplate(
  templates: readonly string[],
  variantIndex: number,
  salt = 0,
): string {
  const idx =
    (variantIndex * 3 + Math.floor(variantIndex / templates.length) + salt) %
    templates.length;
  return templates[idx];
}

// ============================================================================
// CONTEXT & PROSE ROTATION POOLS (Ensuring high lexical diversity across stems)
// ============================================================================

const CONICAL_CONTEXTS = [
  { rig: "ceiling-mounted metrology plummet", setting: "a vibration-isolated calibration bay", noun: "plummet" },
  { rig: "amusement chair-o-plane gondola", setting: "a fairground swing carousel", noun: "gondola" },
  { rig: "aerospace whirl-tower test sphere", setting: "a guidance-sensor test chamber", noun: "sphere" },
  { rig: "tethered brass pendulum bob", setting: "an undergraduate mechanics laboratory", noun: "bob" },
  { rig: "centrifugal flyball governor mass", setting: "a steam-turbine speed regulator", noun: "governor mass" },
  { rig: "suspended ice-arena tracking camera pod", setting: "an overhead cable rig", noun: "camera pod" },
  { rig: "wind-tunnel tethered aerodynamic probe", setting: "a rotary calibration fixture", noun: "probe" },
  { rig: "tower-crane suspended ballast block", setting: "a steady slewing test", noun: "ballast block" },
  { rig: "gyroscopic reference mass", setting: "an inertial navigation testbed", noun: "reference mass" },
  { rig: "tetherball-style steel sphere", setting: "a frictionless swivel mast", noun: "steel sphere" },
  { rig: "cryogenic suspension sensor capsule", setting: "a rotational test rig", noun: "capsule" },
  { rig: "lecture-hall conical demonstration weight", setting: "a rigid ceiling pivot", noun: "weight" },
] as const;

const FLAT_CURVE_CONTEXTS = [
  { vehicle: "Formula-Student electric race car", surface: "a level dry-tarmac skidpad", tyres: "slick tyres" },
  { vehicle: "autonomous warehouse transport robot", surface: "a flat epoxy distribution floor", tyres: "polyurethane wheels" },
  { vehicle: "proving-ground test saloon", surface: "an unbanked wet-asphalt roundabout", tyres: "radial tyres" },
  { vehicle: "airport electric baggage tractor", surface: "a horizontal concrete apron turn", tyres: "solid rubber tyres" },
  { vehicle: "track-cycling sprinter", surface: "the flat warm-up apron inside a velodrome", tyres: "tubular tyres" },
  { vehicle: "planetary test rover", surface: "a level compacted-regolith arena", tyres: "cleated wheels" },
  { vehicle: "competition sprint kart", surface: "a flat hairpin bend", tyres: "rubber tyres" },
  { vehicle: "urban light-rail maintenance bogie", surface: "a horizontal depot loop", tyres: "steel wheels" },
  { vehicle: "autonomous delivery pod", surface: "a level campus courtyard curve", tyres: "pneumatic tyres" },
  { vehicle: "short-track speed-skating sled", surface: "a flat synthetic training ring", tyres: "runner blades" },
  { vehicle: "heavy-duty rescue ambulance", surface: "a flat coastal highway curve", tyres: "all-weather tyres" },
  { vehicle: "electric micro-mobility scooter", surface: "a level paved test circle", tyres: "rubber tyres" },
] as const;

const BANKED_CURVE_CONTEXTS = [
  { vehicle: "Olympic track cyclist", track: "a Siberian-pine velodrome banking", noun: "cyclist" },
  { vehicle: "high-speed maglev passenger carriage", track: "a superelevated guideway curve", noun: "carriage" },
  { vehicle: "endurance prototype sports car", track: "a banked oval speedway turn", noun: "car" },
  { vehicle: "two-person bobsleigh", track: "an iced banked chute corner", noun: "bobsleigh" },
  { vehicle: "autonomous mining haul truck", track: "a banked quarry spiral ramp", noun: "truck" },
  { vehicle: "intercity tilting express coach", track: "a canted main-line viaduct curve", noun: "coach" },
  { vehicle: "proving-ground electric sedan", track: "a concrete parabolic test banking", noun: "sedan" },
  { vehicle: "monorail airport shuttle", track: "a banked elevated beamway", noun: "shuttle" },
  { vehicle: "alpine highway tour bus", track: "a superelevated mountain bend", noun: "bus" },
  { vehicle: "roller-coaster train", track: "a banked steel turnaround", noun: "train" },
  { vehicle: "solar-powered cruiser vehicle", track: "a banked desert test circuit", noun: "vehicle" },
  { vehicle: "indoor athletics track runner", track: "a banked curve lane", noun: "runner" },
] as const;

const VERTICAL_CIRCLE_CONTEXTS = [
  { obj: "human-rated centrifuge gondola", rig: "a rigid rotating arm", kind: "string" as const },
  { obj: "motorized whirling calibration mass", rig: "a taut Kevlar cord", kind: "string" as const },
  { obj: "steel roller-coaster test bogie", rig: "a circular inside loop track", kind: "inside-track" as const },
  { obj: "instrumented acrylic sphere", rig: "a vertical circular guide rail", kind: "inside-track" as const },
  { obj: "vintage touring car", rig: "the circular crest of a humpback stone bridge", kind: "over-crest" as const },
  { obj: "autonomous rover chassis", rig: "a convex circular ridge crest", kind: "over-crest" as const },
  { obj: "acrobatic drone tether pod", rig: "a constant-speed vertical line", kind: "string" as const },
  { obj: "laboratory brass cylinder", rig: "an enclosed vertical circular hoop", kind: "inside-track" as const },
  { obj: "aerospace g-tolerance capsule", rig: "a vertical whirl boom", kind: "string" as const },
  { obj: "maglev loop demonstrator sled", rig: "a vertical circular stator ring", kind: "inside-track" as const },
] as const;

const PLANET_CONTEXTS = [
  { planet: "Kepler-analog rocky super-Earth", probe: "gravimetry sonde" },
  { planet: "tidally locked silicate exoplanet", probe: "descent lander" },
  { planet: "airless iron-core protoplanet", probe: "reconnaissance craft" },
  { planet: "icy outer-system dwarf world", probe: "cryobot instrument package" },
  { planet: "basaltic terrestrial planetoid", probe: "orbital transponder" },
  { planet: "dense extrasolar ocean world", probe: "telemetry buoy" },
  { planet: "uniform-density silicate moon", probe: "subsurface borehole sensor" },
  { planet: "charted extrasolar rocky world", probe: "magnetospheric probe" },
  { planet: "isolated spherical planetesimal", probe: "sample-return canister" },
  { planet: "synthetic uniform planetary body", probe: "deep-shaft gravimeter" },
  { planet: "cratered terrestrial dwarf planet", probe: "polar radar surveyor" },
  { planet: "metal-enriched exoplanet", probe: "atmospheric-skimming bus" },
] as const;

const SATELLITE_CONTEXTS = [
  { sat: "synthetic-aperture radar satellite", body: "a spherical terrestrial planet" },
  { sat: "ocean-altimetry spacecraft", body: "an Earth-mass rocky world" },
  { sat: "polar meteorological CubeSat bus", body: "a charted extrasolar planet" },
  { sat: "laser-interferometry geodesy orbiter", body: "a spherical silicate planet" },
  { sat: "cryogenic infrared space telescope", body: "a terrestrial host planet" },
  { sat: "ion-propelled communications relay", body: "a rocky central planet" },
  { sat: "magnetospheric plasma observatory", body: "a spherical planetary body" },
  { sat: "autonomous orbital servicing tug", body: "a dense terrestrial world" },
  { sat: "ultraviolet spectroscopy satellite", body: "an airless rocky planet" },
  { sat: "navigation constellation spacecraft", body: "a spherical host world" },
  { sat: "X-ray timing observatory", body: "a central rocky exoplanet" },
  { sat: "planetary gravity-mapping orbiter", body: "a uniform spherical planet" },
] as const;

const TWO_BODY_CONTEXTS = [
  { pair: "Earth-analog planet and its rocky moon", p1: "Primary Planet", p2: "Companion Moon", craft: "cislunar transfer probe" },
  { pair: "Pluto–Charon-type dwarf-planet binary", p1: "Dwarf Planet A", p2: "Companion B", craft: "New-Horizons-class flyby craft" },
  { pair: "super-Earth and its captured icy satellite", p1: "Host World", p2: "Icy Moon", craft: "inter-moon cargo ferry" },
  { pair: "gas-giant moon pair along their line of centres", p1: "Major Moon", p2: "Minor Moon", craft: "gravimetric drift sonde" },
  { pair: "double-planetesimal binary system", p1: "Body Alpha", p2: "Body Beta", craft: "sample-return lander" },
  { pair: "Neptune–Triton-analog planetary pair", p1: "Ice Giant", p2: "Retrograde Moon", craft: "deep-space relay probe" },
  { pair: "tidally locked binary rocky worlds", p1: "World P", p2: "World Q", craft: "ballistic research capsule" },
  { pair: "sub-Neptune and its massive exomoon", p1: "Primary", p2: "Exomoon", craft: "autonomous navigation beacon" },
  { pair: "asteroidal binary pair", p1: "Primary Asteroid", p2: "Secondary Moonlet", craft: "ion-beam shepherd craft" },
  { pair: "terrestrial bi-planetary system", p1: "Planet Major", p2: "Planet Minor", craft: "scientific transit module" },
] as const;

const STELLAR_CONTEXTS = [
  { star: "blue-white main-sequence star Vega-analog", survey: "an orbital bolometric photometer" },
  { star: "cool K-type giant Aldebaran-analog", survey: "an infrared space observatory" },
  { star: "solar-type G-dwarf exoplanet host", survey: "a transit-photometry telescope" },
  { star: "luminous F-type subgiant", survey: "a space-based spectrometer" },
  { star: "nearby M-dwarf flare star", survey: "a cooled CCD radiometer" },
  { star: "hot B-type Orion-association star", survey: "an ultraviolet sky survey" },
  { star: "yellow-white standard-candle star", survey: "a high-altitude observatory" },
  { star: "eclipsing-binary primary component", survey: "an optical interferometry array" },
  { star: "metal-poor halo giant star", survey: "a wide-field photometric survey" },
  { star: "young open-cluster A-type star", survey: "a calibrated bolometric detector" },
  { star: "evolved red-clump giant", survey: "an astrometric space mission" },
  { star: "bright southern-sky reference star", survey: "a stellar intensity interferometer" },
] as const;

const GALAXY_CONTEXTS = [
  { galaxy: "spiral galaxy in the Virgo-analog filament", line: "Hydrogen-alpha Balmer transition", restNm: 656.3 },
  { galaxy: "elliptical cluster galaxy", line: "singly ionized Calcium K absorption line", restNm: 393.4 },
  { galaxy: "star-forming barred spiral galaxy", line: "Hydrogen-beta Balmer emission line", restNm: 486.1 },
  { galaxy: "lenticular field galaxy", line: "neutral Sodium D absorption doublet", restNm: 589.0 },
  { galaxy: "luminous active-nucleus host galaxy", line: "Hydrogen-gamma Balmer line", restNm: 434.0 },
  { galaxy: "compact starburst dwarf galaxy", line: "doubly ionized Oxygen forbidden line", restNm: 500.7 },
  { galaxy: "giant cD cluster-centre galaxy", line: "Magnesium b triplet feature", restNm: 517.5 },
  { galaxy: "distant Coma-analog galaxy", line: "ionized Calcium H absorption line", restNm: 396.8 },
  { galaxy: "isolated ring galaxy", line: "neutral Helium spectral line", restNm: 587.6 },
  { galaxy: "blue emission-line galaxy", line: "singly ionized Oxygen doublet", restNm: 372.7 },
] as const;

// ============================================================================
// 1. CONICAL PENDULUM ("uniform-circular-motion", "conical-pendulum-tension-speed-period")
// ============================================================================

function buildConicalPendulumItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  const isIb = variantIndex % 2 === 0;
  const g = isIb ? 9.8 : 9.81;
  const syllabi = resolveSyllabiTags({
    conceptId: "uniform-circular-motion",
    format,
    variantIndex,
    gravityRegime: isIb ? "ib" : "metric981",
  });

  const masses = [0.25, 0.35, 0.45, 0.6, 0.75, 0.85, 1.2, 1.4, 1.6, 1.8, 2.2, 2.5, 3.2, 4.5];
  const lengths = [0.65, 0.8, 0.95, 1.1, 1.25, 1.4, 1.65, 1.8, 2.1, 2.4, 2.75, 3.2];
  const angles = [20, 24, 28, 32, 35, 38, 42, 48, 52, 56];

  const massKg = masses[(variantIndex + rng.nextInt(0, 2)) % masses.length];
  const stringLengthM = lengths[(variantIndex * 3 + rng.nextInt(0, 2)) % lengths.length];
  const semiVerticalAngleDeg = angles[(variantIndex * 5 + rng.nextInt(0, 1)) % angles.length];

  const spec: ConicalPendulumScenario = {
    kind: "conical-pendulum",
    id,
    massKg,
    stringLengthM,
    semiVerticalAngleDeg,
    gravityMs2: g,
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const ctx = CONICAL_CONTEXTS[variantIndex % CONICAL_CONTEXTS.length];
  const difficulty = pickDifficulty(variantIndex);
  const thetaRad = (semiVerticalAngleDeg * Math.PI) / 180;

  if (format === "mcq") {
    const targetModeIdx = variantIndex % 4;
    const framingIdx = variantIndex % 6;

    if (targetModeIdx === 0) {
      // Target: tensionN
      const truth = q.tensionN;
      const stems = [
        `In ${ctx.setting}, a ${ctx.rig} of mass ${fmtGiven(massKg, "kg")} hangs from an inextensible cord of length ${fmtGiven(stringLengthM, "m")} and sweeps a horizontal circle at a constant semi-vertical angle of ${fmtGiven(semiVerticalAngleDeg, "°")}. Take g = ${fmtGiven(g, "m s⁻²")}. What is the tension in the cord?`,
        `A ${ctx.rig} (${fmtGiven(massKg, "kg")}) attached to a light cable of length ${fmtGiven(stringLengthM, "m")} revolves steadily as a conical pendulum inside ${ctx.setting}, maintaining an angle of ${fmtGiven(semiVerticalAngleDeg, "°")} to the vertical (g = ${fmtGiven(g, "m s⁻²")}). Determine the magnitude of the cable tension.`,
        `During rotational testing in ${ctx.setting}, a ${fmtGiven(massKg, "kg")} ${ctx.noun} on a ${fmtGiven(stringLengthM, "m")} tether describes a horizontal circle with the tether inclined at ${fmtGiven(semiVerticalAngleDeg, "°")} to the downward vertical. Using g = ${fmtGiven(g, "m s⁻²")}, calculate the tension force in the tether.`,
        `As illustrated, a ${ctx.rig} of mass ${fmtGiven(massKg, "kg")} whirls in uniform horizontal circular motion on a string of length ${fmtGiven(stringLengthM, "m")} inclined at ${fmtGiven(semiVerticalAngleDeg, "°")} to the vertical. Taking g = ${fmtGiven(g, "m s⁻²")}, which value gives the string tension?`,
        `Engineers operating ${ctx.setting} spin a ${fmtGiven(massKg, "kg")} ${ctx.noun} suspended by a ${fmtGiven(stringLengthM, "m")} wire so that the wire makes a steady ${fmtGiven(semiVerticalAngleDeg, "°")} angle with the vertical axis (g = ${fmtGiven(g, "m s⁻²")}). Find the tension supported by the wire.`,
        `Suspended from a fixed pivot in ${ctx.setting}, a ${fmtGiven(stringLengthM, "m")} cord carries a ${fmtGiven(massKg, "kg")} ${ctx.noun} around a horizontal circular path at a constant cone half-angle of ${fmtGiven(semiVerticalAngleDeg, "°")}. Given g = ${fmtGiven(g, "m s⁻²")}, what tension acts along the cord?`,
      ];
      const options = buildNumericMcqOptions(truth, "N", [
        {
          value: massKg * g * Math.cos(thetaRad),
          rationale: "Multiplies weight mg by cos θ instead of dividing mg by cos θ when enforcing vertical equilibrium.",
        },
        {
          value: (massKg * g) / Math.sin(thetaRad),
          rationale: "Divides mg by sin θ rather than cos θ by swapping horizontal and vertical force components.",
        },
        {
          value: massKg * g * Math.tan(thetaRad),
          rationale: "Computes the horizontal centripetal resultant mg tan θ instead of the tension along the string.",
        },
        {
          value: massKg * g,
          rationale: "Equates string tension directly to weight mg, ignoring the inward horizontal component needed for circular motion.",
        },
      ]);
      return {
        id,
        conceptId: "uniform-circular-motion",
        templateArchetype: "conical-pendulum-tension-speed-period",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["tensionN", "centripetalForceN", "linearSpeedMs", "periodS"],
        targetQuantityKey: "tensionN",
        questionPlan: buildDigitFreePlan(
          "Resolve vertical force balance on a conical pendulum bob to determine cord tension",
          "mcq",
        ),
        stem: stems[framingIdx],
        options,
        workedSolution: `Vertical equilibrium requires T cos θ = mg, so T = (${fmtGiven(massKg)} × ${fmtGiven(g)}) / cos ${fmtGiven(semiVerticalAngleDeg)}° = ${fmt3sf(truth, "N")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Resolves T cos ${fmtGiven(semiVerticalAngleDeg)}° = mg to obtain T = ${fmt3sf(truth, "N")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (targetModeIdx === 1) {
      // Target: linearSpeedMs
      const truth = q.linearSpeedMs;
      const stems = [
        `A ${ctx.rig} of mass ${fmtGiven(massKg, "kg")} moves in a horizontal circle on the end of a ${fmtGiven(stringLengthM, "m")} light line inclined at ${fmtGiven(semiVerticalAngleDeg, "°")} to the vertical in ${ctx.setting}. Taking g = ${fmtGiven(g, "m s⁻²")}, what is the linear speed of the ${ctx.noun}?`,
        `Inside ${ctx.setting}, a ${fmtGiven(stringLengthM, "m")} suspension wire supports a ${fmtGiven(massKg, "kg")} ${ctx.noun} whirling at a steady semi-vertical cone angle of ${fmtGiven(semiVerticalAngleDeg, "°")} (g = ${fmtGiven(g, "m s⁻²")}). Calculate the tangential speed of the ${ctx.noun}.`,
        `While calibrated in ${ctx.setting}, a ${fmtGiven(massKg, "kg")} ${ctx.rig} on a ${fmtGiven(stringLengthM, "m")} cord traces a horizontal circular orbit with the cord at ${fmtGiven(semiVerticalAngleDeg, "°")} to the downward vertical. Take g = ${fmtGiven(g, "m s⁻²")}. At what speed does the ${ctx.noun} travel?`,
        `A conical pendulum in ${ctx.setting} consists of a ${fmtGiven(massKg, "kg")} ${ctx.noun} and a ${fmtGiven(stringLengthM, "m")} inextensible string making ${fmtGiven(semiVerticalAngleDeg, "°")} with the vertical axis (g = ${fmtGiven(g, "m s⁻²")}). Determine the orbital speed of the ${ctx.noun}.`,
        `To test lateral accelerometers in ${ctx.setting}, technicians whirl a ${fmtGiven(massKg, "kg")} ${ctx.noun} on a ${fmtGiven(stringLengthM, "m")} cable at a constant angle of ${fmtGiven(semiVerticalAngleDeg, "°")} from the vertical. Using g = ${fmtGiven(g, "m s⁻²")}, find the linear speed.`,
        `Swinging steadily around a vertical axis in ${ctx.setting}, a ${fmtGiven(massKg, "kg")} ${ctx.rig} hangs from a ${fmtGiven(stringLengthM, "m")} tether inclined at ${fmtGiven(semiVerticalAngleDeg, "°")} to the vertical (g = ${fmtGiven(g, "m s⁻²")}). What is its speed along the circular path?`,
      ];
      const options = buildNumericMcqOptions(truth, "m s⁻¹", [
        {
          value: Math.sqrt(g * stringLengthM * Math.tan(thetaRad)),
          rationale: "Uses the full string length L instead of the horizontal orbit radius r = L sin θ in v = √(g r tan θ).",
        },
        {
          value: Math.sqrt(g * stringLengthM * Math.sin(thetaRad)),
          rationale: "Replaces tan θ with 1 in a_c = g tan θ, computing √(g L sin θ) instead of √(g L sin θ tan θ).",
        },
        {
          value: g * stringLengthM * Math.sin(thetaRad) * Math.tan(thetaRad),
          rationale: "Computes v² = g r tan θ and omits the final square root.",
        },
        {
          value: Math.sqrt(g * stringLengthM * Math.cos(thetaRad) * Math.tan(thetaRad)),
          rationale: "Substitutes vertical height L cos θ rather than horizontal radius L sin θ for the circular radius.",
        },
      ]);
      return {
        id,
        conceptId: "uniform-circular-motion",
        templateArchetype: "conical-pendulum-tension-speed-period",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["orbitRadiusM", "tensionN", "centripetalAccelMs2", "linearSpeedMs", "periodS"],
        targetQuantityKey: "linearSpeedMs",
        questionPlan: buildDigitFreePlan(
          "Combine horizontal circular dynamics with conical pendulum geometry to find tangential speed",
          "mcq",
        ),
        stem: stems[framingIdx],
        options,
        workedSolution: `Orbit radius r = L sin θ = ${fmtGiven(stringLengthM)} sin ${fmtGiven(semiVerticalAngleDeg)}° = ${fmt3sf(q.orbitRadiusM, "m")}. Since T sin θ = mv²/r and T cos θ = mg, v = √(g r tan θ) = √(${fmtGiven(g)} × ${fmt3sf(q.orbitRadiusM)} × tan ${fmtGiven(semiVerticalAngleDeg)}°) = ${fmt3sf(truth, "m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses r = L sin θ and v = √(g L sin θ tan θ) to obtain ${fmt3sf(truth, "m s⁻¹")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (targetModeIdx === 2) {
      // Target: periodS
      const truth = q.periodS;
      const stems = [
        `A ${fmtGiven(massKg, "kg")} ${ctx.rig} attached to a ${fmtGiven(stringLengthM, "m")} light wire revolves in a horizontal circle inside ${ctx.setting} at a constant semi-vertical angle of ${fmtGiven(semiVerticalAngleDeg, "°")}. Take g = ${fmtGiven(g, "m s⁻²")}. What is the time period of one complete revolution?`,
        `In ${ctx.setting}, a conical pendulum of cord length ${fmtGiven(stringLengthM, "m")} and bob mass ${fmtGiven(massKg, "kg")} maintains an angle of ${fmtGiven(semiVerticalAngleDeg, "°")} to the vertical (g = ${fmtGiven(g, "m s⁻²")}). Calculate its period of revolution.`,
        `How long does one full horizontal orbit take for a ${fmtGiven(massKg, "kg")} ${ctx.noun} suspended on a ${fmtGiven(stringLengthM, "m")} tether inclined at ${fmtGiven(semiVerticalAngleDeg, "°")} to the vertical in ${ctx.setting}? Use g = ${fmtGiven(g, "m s⁻²")}.`,
        `Observations in ${ctx.setting} show a ${fmtGiven(massKg, "kg")} ${ctx.rig} whirling steadily on a ${fmtGiven(stringLengthM, "m")} cable at ${fmtGiven(semiVerticalAngleDeg, "°")} to the downward vertical (g = ${fmtGiven(g, "m s⁻²")}). Determine the rotational period.`,
        `A ${fmtGiven(stringLengthM, "m")} inextensible cord in ${ctx.setting} carries a ${fmtGiven(massKg, "kg")} ${ctx.noun} around a horizontal circle with cone half-angle ${fmtGiven(semiVerticalAngleDeg, "°")}. Taking g = ${fmtGiven(g, "m s⁻²")}, find the orbital period.`,
        `During steady rotation in ${ctx.setting}, a ${fmtGiven(massKg, "kg")} ${ctx.noun} hangs from a ${fmtGiven(stringLengthM, "m")} line inclined at ${fmtGiven(semiVerticalAngleDeg, "°")} to the vertical. Given g = ${fmtGiven(g, "m s⁻²")}, which value equals the period of motion?`,
      ];
      const options = buildNumericMcqOptions(truth, "s", [
        {
          value: 2 * Math.PI * Math.sqrt(stringLengthM / g),
          rationale: "Applies the small-angle planar pendulum formula 2π√(L/g), omitting the cos θ vertical-projection factor.",
        },
        {
          value: 2 * Math.PI * Math.sqrt((stringLengthM * Math.sin(thetaRad)) / g),
          rationale: "Substitutes L sin θ instead of vertical height L cos θ under the square root in T = 2π√(L cos θ / g).",
        },
        {
          value: 2 * Math.PI * Math.sqrt(stringLengthM / (g * Math.cos(thetaRad))),
          rationale: "Divides by cos θ instead of multiplying L by cos θ inside the radical.",
        },
        {
          value: Math.sqrt((stringLengthM * Math.cos(thetaRad)) / g),
          rationale: "Computes 1/ω = √(L cos θ / g) and omits the factor of 2π.",
        },
      ]);
      return {
        id,
        conceptId: "uniform-circular-motion",
        templateArchetype: "conical-pendulum-tension-speed-period",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["orbitRadiusM", "verticalHeightM", "tensionN", "linearSpeedMs", "angularSpeedRadS", "periodS"],
        targetQuantityKey: "periodS",
        questionPlan: buildDigitFreePlan(
          "Derive angular frequency and period of a conical pendulum from vertical height projection",
          "mcq",
        ),
        stem: stems[framingIdx],
        options,
        workedSolution: `From T cos θ = mg and T sin θ = m ω² (L sin θ), ω = √(g / (L cos θ)). Thus the period is P = 2π√(L cos θ / g) = 2π√((${fmtGiven(stringLengthM)} cos ${fmtGiven(semiVerticalAngleDeg)}°) / ${fmtGiven(g)}) = ${fmt3sf(truth, "s")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates 2π√(L cos ${fmtGiven(semiVerticalAngleDeg)}° / g) to obtain ${fmt3sf(truth, "s")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // targetModeIdx === 3: centripetalAccelMs2
    const truth = q.centripetalAccelMs2;
    const stems = [
      `In ${ctx.setting}, a ${fmtGiven(massKg, "kg")} ${ctx.rig} whirls in a horizontal circle on a ${fmtGiven(stringLengthM, "m")} cord inclined at ${fmtGiven(semiVerticalAngleDeg, "°")} to the vertical. Take g = ${fmtGiven(g, "m s⁻²")}. What is the magnitude of its centripetal acceleration?`,
      `A ${fmtGiven(stringLengthM, "m")} tether in ${ctx.setting} guides a ${fmtGiven(massKg, "kg")} ${ctx.noun} around a horizontal circle at a steady cone half-angle of ${fmtGiven(semiVerticalAngleDeg, "°")} (g = ${fmtGiven(g, "m s⁻²")}). Find the inward radial acceleration of the ${ctx.noun}.`,
      `Calibrating an accelerometer inside ${ctx.setting}, engineers swing a ${fmtGiven(massKg, "kg")} ${ctx.noun} on a ${fmtGiven(stringLengthM, "m")} cable at ${fmtGiven(semiVerticalAngleDeg, "°")} from the downward vertical. Using g = ${fmtGiven(g, "m s⁻²")}, determine the centripetal acceleration.`,
      `A conical pendulum (${fmtGiven(massKg, "kg")}, cord length ${fmtGiven(stringLengthM, "m")}) in ${ctx.setting} revolves steadily with its cord inclined at ${fmtGiven(semiVerticalAngleDeg, "°")} to the vertical (g = ${fmtGiven(g, "m s⁻²")}). Calculate the horizontal acceleration toward the centre of the circle.`,
      `As a ${fmtGiven(massKg, "kg")} ${ctx.rig} orbits horizontally on a ${fmtGiven(stringLengthM, "m")} wire in ${ctx.setting}, the wire maintains an angle of ${fmtGiven(semiVerticalAngleDeg, "°")} with the vertical. Given g = ${fmtGiven(g, "m s⁻²")}, what is its centripetal acceleration?`,
      `Suspended by a ${fmtGiven(stringLengthM, "m")} line in ${ctx.setting}, a ${fmtGiven(massKg, "kg")} ${ctx.noun} executes uniform horizontal circular motion at ${fmtGiven(semiVerticalAngleDeg, "°")} to the vertical (g = ${fmtGiven(g, "m s⁻²")}). Select the magnitude of its centripetal acceleration.`,
    ];
    const options = buildNumericMcqOptions(truth, "m s⁻²", [
      {
        value: g * Math.sin(thetaRad),
        rationale: "Uses g sin θ (inclined-plane acceleration) instead of horizontal radial acceleration g tan θ.",
      },
      {
        value: g / Math.tan(thetaRad),
        rationale: "Inverts the tangent ratio to g / tan θ by swapping horizontal and vertical equilibrium equations.",
      },
      {
        value: g / Math.cos(thetaRad),
        rationale: "Divides g by cos θ, finding T/m rather than its horizontal component (T sin θ)/m.",
      },
      {
        value: massKg * g * Math.tan(thetaRad),
        rationale: "Calculates the net centripetal force mg tan θ in newtons instead of centripetal acceleration in m s⁻².",
      },
    ]);
    return {
      id,
      conceptId: "uniform-circular-motion",
      templateArchetype: "conical-pendulum-tension-speed-period",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: ["tensionN", "centripetalForceN", "centripetalAccelMs2", "linearSpeedMs"],
      targetQuantityKey: "centripetalAccelMs2",
      questionPlan: buildDigitFreePlan(
        "Eliminate cord tension between vertical and horizontal components to find centripetal acceleration",
        "mcq",
      ),
      stem: stems[framingIdx],
      options,
      workedSolution: `Dividing horizontal Newton's second law T sin θ = m a_c by vertical equilibrium T cos θ = mg gives a_c = g tan θ = ${fmtGiven(g)} × tan ${fmtGiven(semiVerticalAngleDeg)}° = ${fmt3sf(truth, "m s⁻²")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Applies a_c = g tan ${fmtGiven(semiVerticalAngleDeg)}° to obtain ${fmt3sf(truth, "m s⁻²")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (6 marks: tension -> linear speed -> period)
  const stems = [
    `In ${ctx.setting}, a ${ctx.rig} of mass ${fmtGiven(massKg, "kg")} is suspended from a fixed ceiling pivot by a light inextensible cord of length ${fmtGiven(stringLengthM, "m")}. The ${ctx.noun} moves at constant speed in a horizontal circle such that the cord maintains a steady angle of ${fmtGiven(semiVerticalAngleDeg, "°")} to the vertical. Take g = ${fmtGiven(g, "m s⁻²")}.`,
    `A ${fmtGiven(massKg, "kg")} ${ctx.rig} attached to a ${fmtGiven(stringLengthM, "m")} suspension wire is set into uniform conical-pendulum motion inside ${ctx.setting}, sweeping out a horizontal circular trajectory with the wire inclined at ${fmtGiven(semiVerticalAngleDeg, "°")} to the downward vertical (g = ${fmtGiven(g, "m s⁻²")}).`,
    `Engineers testing rotational instrumentation in ${ctx.setting} whirl a ${fmtGiven(massKg, "kg")} ${ctx.noun} on the end of a ${fmtGiven(stringLengthM, "m")} tether. Throughout the motion, the tether makes a constant semi-vertical angle of ${fmtGiven(semiVerticalAngleDeg, "°")} with the vertical axis. Use g = ${fmtGiven(g, "m s⁻²")}.`,
    `The diagram represents a ${fmtGiven(massKg, "kg")} ${ctx.rig} in ${ctx.setting} describing a horizontal circle while supported by a taut cord of length ${fmtGiven(stringLengthM, "m")} inclined at ${fmtGiven(semiVerticalAngleDeg, "°")} to the vertical. Take gravitational field strength g = ${fmtGiven(g, "m s⁻²")}.`,
  ];
  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: `Calculate the tension in the cord supporting the ${ctx.noun}.`,
      marks: 2,
      targetQuantityKey: "tensionN",
      expectedAnswer: fmt3sf(q.tensionN, "N"),
      workingSteps: [
        `Vertical force balance gives T cos θ = mg.`,
        `T = (${fmtGiven(massKg)} × ${fmtGiven(g)}) / cos ${fmtGiven(semiVerticalAngleDeg)}° = ${fmt3sf(q.tensionN, "N")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the linear speed of the ${ctx.noun} along its horizontal circular path.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "linearSpeedMs",
      expectedAnswer: fmt3sf(q.linearSpeedMs, "m s⁻¹"),
      workingSteps: [
        `Horizontal radius r = L sin θ = ${fmtGiven(stringLengthM)} sin ${fmtGiven(semiVerticalAngleDeg)}° = ${fmt3sf(q.orbitRadiusM, "m")}.`,
        `From T sin θ = m v² / r, v = √(g r tan θ) = ${fmt3sf(q.linearSpeedMs, "m s⁻¹")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Calculate the time period for one complete revolution of the ${ctx.noun}.`,
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "periodS",
      expectedAnswer: fmt3sf(q.periodS, "s"),
      workingSteps: [
        `Period P = 2π r / v = 2π × ${fmt3sf(q.orbitRadiusM)} / ${fmt3sf(q.linearSpeedMs)} = ${fmt3sf(q.periodS, "s")}.`,
      ],
    },
  ];
  const markScheme: MarkSchemePoint[] = [
    { code: "M1", partId: "a", criterion: "Equates vertical component T cos θ to weight mg.", marks: 1 },
    { code: "A1", partId: "a", criterion: `Obtains tension ${fmt3sf(q.tensionN, "N")}.`, marks: 1 },
    { code: "M1", partId: "b", criterion: "Uses r = L sin θ and equates T sin θ (or mg tan θ) to m v² / r.", marks: 1 },
    { code: "A1", partId: "b", criterion: `Obtains speed ${fmt3sf(q.linearSpeedMs, "m s⁻¹")}.`, marks: 1 },
    { code: "M1", partId: "c", criterion: "Applies P = 2π r / v or P = 2π√(L cos θ / g).", marks: 1 },
    { code: "A1", partId: "c", criterion: `Obtains period ${fmt3sf(q.periodS, "s")}.`, marks: 1 },
  ];

  return {
    id,
    conceptId: "uniform-circular-motion",
    templateArchetype: "conical-pendulum-tension-speed-period",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: ["orbitRadiusM", "tensionN", "centripetalForceN", "centripetalAccelMs2", "linearSpeedMs", "periodS"],
    questionPlan: buildDigitFreePlan(
      "Scaffold conical pendulum mechanics from vertical force equilibrium to tangential speed and orbital period",
      "structured",
      ["resolve-cord-tension", "compute-horizontal-orbital-speed", "evaluate-revolution-period"],
    ),
    stem: stems[variantIndex % stems.length],
    parts,
    workedSolution: `(a) Vertical equilibrium T cos ${fmtGiven(semiVerticalAngleDeg)}° = (${fmtGiven(massKg)})(${fmtGiven(g)}) gives T = ${fmt3sf(q.tensionN, "N")}. (b) Horizontal radius r = ${fmtGiven(stringLengthM)} sin ${fmtGiven(semiVerticalAngleDeg)}° = ${fmt3sf(q.orbitRadiusM, "m")}; horizontal dynamics T sin θ = mv²/r yields v = ${fmt3sf(q.linearSpeedMs, "m s⁻¹")}. (c) Period P = 2πr / v = ${fmt3sf(q.periodS, "s")}.`,
    markScheme,
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// 2. FLAT CURVE ("uniform-circular-motion", "flat-curve-static-friction-skid-limit")
// ============================================================================

function buildFlatCurveItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  const isIb = variantIndex % 2 === 1;
  const g = isIb ? 9.8 : 9.81;
  const syllabi = resolveSyllabiTags({
    conceptId: "uniform-circular-motion",
    format,
    variantIndex,
    gravityRegime: isIb ? "ib" : "metric981",
  });

  const masses = [95, 140, 220, 480, 760, 920, 1150, 1320, 1480, 1650, 1820];
  const radii = [22, 28, 35, 44, 52, 65, 78, 90, 105, 125];
  const mus = [0.36, 0.42, 0.48, 0.55, 0.62, 0.68, 0.74, 0.82, 0.88];
  const speedFracs = [0.58, 0.64, 0.7, 0.76, 0.82, 0.86];

  const massKg = masses[(variantIndex + rng.nextInt(0, 2)) % masses.length];
  const radiusM = radii[(variantIndex * 3 + rng.nextInt(0, 1)) % radii.length];
  const staticFrictionCoeff = mus[(variantIndex * 5 + rng.nextInt(0, 1)) % mus.length];
  const vMax = Math.sqrt(staticFrictionCoeff * g * radiusM);
  const frac = speedFracs[variantIndex % speedFracs.length];
  const speedMs = Number((vMax * frac).toPrecision(3));

  const spec: FlatCurveScenario = {
    kind: "flat-curve",
    id,
    massKg,
    radiusM,
    speedMs,
    staticFrictionCoeff,
    gravityMs2: g,
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const ctx = FLAT_CURVE_CONTEXTS[variantIndex % FLAT_CURVE_CONTEXTS.length];
  const difficulty = pickDifficulty(variantIndex);

  if (format === "mcq") {
    const targetModeIdx = variantIndex % 3;
    const framingIdx = variantIndex % 6;

    if (targetModeIdx === 0) {
      // Target: frictionForceN (actual static friction < mu_s m g!)
      const truth = q.frictionForceN;
      const stems = [
        `A ${ctx.vehicle} of mass ${fmtGiven(massKg, "kg")} negotiates ${ctx.surface} of radius ${fmtGiven(radiusM, "m")} at a constant speed of ${fmtGiven(speedMs, "m s⁻¹")} without skidding. The coefficient of static friction between its ${ctx.tyres} and the surface is ${fmtGiven(staticFrictionCoeff)} (g = ${fmtGiven(g, "m s⁻²")}). What lateral frictional force acts on the ${ctx.tyres}?`,
        `Travelling at a steady ${fmtGiven(speedMs, "m s⁻¹")} around ${ctx.surface} of radius ${fmtGiven(radiusM, "m")}, a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} remains well within grip limits (μ_s = ${fmtGiven(staticFrictionCoeff)}, g = ${fmtGiven(g, "m s⁻²")}). Calculate the actual static friction force providing centripetal acceleration.`,
        `On ${ctx.surface} of curvature radius ${fmtGiven(radiusM, "m")}, a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} rounds the turn at ${fmtGiven(speedMs, "m s⁻¹")}. Given μ_s = ${fmtGiven(staticFrictionCoeff)} and g = ${fmtGiven(g, "m s⁻²")}, determine the magnitude of the inward frictional force.`,
        `Telemetry from a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} cornering without slip on ${ctx.surface} (radius ${fmtGiven(radiusM, "m")}, μ_s = ${fmtGiven(staticFrictionCoeff)}) records a speed of ${fmtGiven(speedMs, "m s⁻¹")}. Taking g = ${fmtGiven(g, "m s⁻²")}, find the static frictional force exerted by the ground.`,
        `As shown in the top-view diagram, a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} follows a horizontal circular arc of radius ${fmtGiven(radiusM, "m")} at ${fmtGiven(speedMs, "m s⁻¹")} where μ_s = ${fmtGiven(staticFrictionCoeff)} and g = ${fmtGiven(g, "m s⁻²")}. Which value equals the lateral static friction force?`,
        `Without skidding, a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} turns along ${ctx.surface} of radius ${fmtGiven(radiusM, "m")} at ${fmtGiven(speedMs, "m s⁻¹")} (static friction coefficient ${fmtGiven(staticFrictionCoeff)}, g = ${fmtGiven(g, "m s⁻²")}). What sideways friction force acts toward the curve centre?`,
      ];
      const options = buildNumericMcqOptions(truth, "N", [
        {
          value: q.maxStaticFrictionN,
          rationale: "Evaluates the limiting static friction μ_s mg instead of the actual centripetal force mv²/r needed at a sub-critical speed.",
        },
        {
          value: (massKg * speedMs) / radiusM,
          rationale: "Uses mv/r rather than mv²/r by omitting the square on speed.",
        },
        {
          value: staticFrictionCoeff * ((massKg * speedMs ** 2) / radiusM),
          rationale: "Multiplies the required centripetal force mv²/r by μ_s.",
        },
        {
          value: q.weightN,
          rationale: "Confuses horizontal centripetal force with the vertical normal force mg.",
        },
      ]);
      return {
        id,
        conceptId: "uniform-circular-motion",
        templateArchetype: "flat-curve-static-friction-skid-limit",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["frictionForceN", "centripetalForceN", "maxStaticFrictionN", "maxSafeSpeedMs"],
        targetQuantityKey: "frictionForceN",
        questionPlan: buildDigitFreePlan(
          "Distinguish actual demand static friction from limiting static friction on an unbanked horizontal curve",
          "mcq",
        ),
        stem: stems[framingIdx],
        options,
        workedSolution: `Because ${fmtGiven(speedMs, "m s⁻¹")} is below the skidding threshold v_max = √(μ_s g r) = ${fmt3sf(q.maxSafeSpeedMs, "m s⁻¹")}, static friction self-adjusts to match the required centripetal force: f_s = m v² / r = ${fmtGiven(massKg)} × (${fmtGiven(speedMs)})² / ${fmtGiven(radiusM)} = ${fmt3sf(truth, "N")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses f_s = m v² / r (not μ_s mg) to obtain ${fmt3sf(truth, "N")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (targetModeIdx === 1) {
      // Target: maxSafeSpeedMs
      const truth = q.maxSafeSpeedMs;
      const stems = [
        `A ${fmtGiven(massKg, "kg")} ${ctx.vehicle} currently travels at ${fmtGiven(speedMs, "m s⁻¹")} around ${ctx.surface} of radius ${fmtGiven(radiusM, "m")}, where the coefficient of static friction between ${ctx.tyres} and surface is ${fmtGiven(staticFrictionCoeff)}. Take g = ${fmtGiven(g, "m s⁻²")}. What is the maximum speed at which it can round this curve without skidding?`,
        `Engineers test a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} cruising at ${fmtGiven(speedMs, "m s⁻¹")} on ${ctx.surface} of radius ${fmtGiven(radiusM, "m")} with μ_s = ${fmtGiven(staticFrictionCoeff)} (g = ${fmtGiven(g, "m s⁻²")}). Calculate the limiting non-skidding speed on this bend.`,
        `On ${ctx.surface} (radius ${fmtGiven(radiusM, "m")}, μ_s = ${fmtGiven(staticFrictionCoeff)}), a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} enters at ${fmtGiven(speedMs, "m s⁻¹")}. Taking g = ${fmtGiven(g, "m s⁻²")}, up to what maximum speed can the ${ctx.vehicle} accelerate on this circular path before lateral slip begins?`,
        `Given a curve radius of ${fmtGiven(radiusM, "m")} and static friction coefficient ${fmtGiven(staticFrictionCoeff)} on ${ctx.surface} (g = ${fmtGiven(g, "m s⁻²")}), determine the maximum safe cornering speed for a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} currently moving at ${fmtGiven(speedMs, "m s⁻¹")}.`,
        `A ${fmtGiven(massKg, "kg")} ${ctx.vehicle} circles ${ctx.surface} of radius ${fmtGiven(radiusM, "m")} at ${fmtGiven(speedMs, "m s⁻¹")}. If μ_s = ${fmtGiven(staticFrictionCoeff)} and g = ${fmtGiven(g, "m s⁻²")}, what critical speed marks the onset of skidding?`,
        `While rounding ${ctx.surface} of radius ${fmtGiven(radiusM, "m")} at ${fmtGiven(speedMs, "m s⁻¹")}, a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} relies on ${ctx.tyres} with μ_s = ${fmtGiven(staticFrictionCoeff)} (g = ${fmtGiven(g, "m s⁻²")}). Find the maximum speed achievable without side-slip.`,
      ];
      const options = buildNumericMcqOptions(truth, "m s⁻¹", [
        {
          value: staticFrictionCoeff * g * radiusM,
          rationale: "Computes μ_s g r and forgets to take the square root when solving m v² / r = μ_s mg.",
        },
        {
          value: Math.sqrt((g * radiusM) / staticFrictionCoeff),
          rationale: "Divides g r by μ_s instead of multiplying by μ_s under the square root.",
        },
        {
          value: Math.sqrt(g * radiusM),
          rationale: "Omits the static friction coefficient μ_s and evaluates √(g r).",
        },
        {
          value: staticFrictionCoeff * Math.sqrt(g * radiusM),
          rationale: "Places μ_s outside the square root instead of inside √(μ_s g r).",
        },
      ]);
      return {
        id,
        conceptId: "uniform-circular-motion",
        templateArchetype: "flat-curve-static-friction-skid-limit",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["frictionForceN", "centripetalForceN", "maxStaticFrictionN", "maxSafeSpeedMs"],
        targetQuantityKey: "maxSafeSpeedMs",
        questionPlan: buildDigitFreePlan(
          "Equate limiting static friction to centripetal force to solve for maximum non-skidding speed",
          "mcq",
        ),
        stem: stems[framingIdx],
        options,
        workedSolution: `At the verge of skidding, m v_max² / r = μ_s m g, independent of mass: v_max = √(μ_s g r) = √(${fmtGiven(staticFrictionCoeff)} × ${fmtGiven(g)} × ${fmtGiven(radiusM)}) = ${fmt3sf(truth, "m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates v_max = √(μ_s g r) = ${fmt3sf(truth, "m s⁻¹")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // targetModeIdx === 2: minRequiredFrictionCoeff at given speedMs (hide staticFrictionCoeff in SVG & override requiredGivens)
    const truth = q.minRequiredFrictionCoeff;
    const stems = [
      `A ${fmtGiven(massKg, "kg")} ${ctx.vehicle} rounds ${ctx.surface} of radius ${fmtGiven(radiusM, "m")} at a constant speed of ${fmtGiven(speedMs, "m s⁻¹")}. Take g = ${fmtGiven(g, "m s⁻²")}. What minimum coefficient of static friction between its ${ctx.tyres} and the surface is required to prevent skidding?`,
      `To corner without lateral slip at ${fmtGiven(speedMs, "m s⁻¹")} on ${ctx.surface} of radius ${fmtGiven(radiusM, "m")} (g = ${fmtGiven(g, "m s⁻²")}), what least static friction coefficient must the ${ctx.tyres} of a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} provide?`,
      `Safety engineers specify ${ctx.surface} of radius ${fmtGiven(radiusM, "m")} for a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} travelling at ${fmtGiven(speedMs, "m s⁻¹")}. Using g = ${fmtGiven(g, "m s⁻²")}, calculate the minimum static friction coefficient needed.`,
      `On a level circular bend of radius ${fmtGiven(radiusM, "m")}, a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} maintains ${fmtGiven(speedMs, "m s⁻¹")} (${ctx.surface}, g = ${fmtGiven(g, "m s⁻²")}). Determine the minimum value of μ_s that prevents skidding.`,
      `During a wet-grip evaluation on ${ctx.surface} of radius ${fmtGiven(radiusM, "m")}, a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} circles steadily at ${fmtGiven(speedMs, "m s⁻¹")} (g = ${fmtGiven(g, "m s⁻²")}). Find the minimum required coefficient of static friction.`,
      `What minimum static friction coefficient allows a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} to negotiate ${ctx.surface} of radius ${fmtGiven(radiusM, "m")} at ${fmtGiven(speedMs, "m s⁻¹")} without skidding? Take g = ${fmtGiven(g, "m s⁻²")}.`,
    ];
    const options = buildNumericMcqOptions(truth, "", [
      {
        value: speedMs / (g * radiusM),
        rationale: "Uses v / (g r) instead of v² / (g r) by omitting the square on speed.",
      },
      {
        value: (g * radiusM) / speedMs ** 2,
        rationale: "Inverts the dimensionless ratio to g r / v².",
      },
      {
        value: Math.sqrt(truth),
        rationale: "Takes an unnecessary square root of v² / (g r).",
      },
      {
        value: speedMs ** 2 / radiusM,
        rationale: "Computes centripetal acceleration v²/r in m s⁻² and forgets to divide by g.",
      },
    ]);
    return {
      id,
      conceptId: "uniform-circular-motion",
      templateArchetype: "flat-curve-static-friction-skid-limit",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "staticFrictionCoeff",
        "minRequiredFrictionCoeff",
        "frictionForceN",
        "maxStaticFrictionN",
        "maxSafeSpeedMs",
      ],
      requiredGivens: [
        { name: "massKg", value: massKg, unit: "kg", source: "stem" },
        { name: "radiusM", value: radiusM, unit: "m", source: "stem" },
        { name: "speedMs", value: speedMs, unit: "m s⁻¹", source: "stem" },
        { name: "gravityMs2", value: g, unit: "m s⁻²", source: "stem" },
      ],
      targetQuantityKey: "minRequiredFrictionCoeff",
      questionPlan: buildDigitFreePlan(
        "Determine minimum static friction coefficient required for unbanked circular cornering",
        "mcq",
      ),
      stem: stems[framingIdx],
      options,
      workedSolution: `No-skid cornering requires μ_s m g ≥ m v² / r, so μ_min = v² / (g r) = (${fmtGiven(speedMs)})² / (${fmtGiven(g)} × ${fmtGiven(radiusM)}) = ${fmt3sf(truth)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Computes μ_min = v² / (g r) = ${fmt3sf(truth)}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (6 marks)
  const stems = [
    `A ${ctx.vehicle} of mass ${fmtGiven(massKg, "kg")} travels at a constant speed of ${fmtGiven(speedMs, "m s⁻¹")} along ${ctx.surface} of radius ${fmtGiven(radiusM, "m")}. The coefficient of static friction between its ${ctx.tyres} and the ground is ${fmtGiven(staticFrictionCoeff)}. Take g = ${fmtGiven(g, "m s⁻²")}.`,
    `During handling trials on ${ctx.surface}, a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} follows a horizontal circular path of radius ${fmtGiven(radiusM, "m")} at ${fmtGiven(speedMs, "m s⁻¹")}. Its ${ctx.tyres} have a static friction coefficient of ${fmtGiven(staticFrictionCoeff)} with the track (g = ${fmtGiven(g, "m s⁻²")}).`,
    `The top-view diagram shows a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} rounding ${ctx.surface} of radius ${fmtGiven(radiusM, "m")} at a steady speed of ${fmtGiven(speedMs, "m s⁻¹")}. Between the ${ctx.tyres} and the surface, μ_s = ${fmtGiven(staticFrictionCoeff)}. Use g = ${fmtGiven(g, "m s⁻²")}.`,
    `Operating on ${ctx.surface} of curvature radius ${fmtGiven(radiusM, "m")}, a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} corners without slipping at ${fmtGiven(speedMs, "m s⁻¹")}. Take the static friction coefficient as ${fmtGiven(staticFrictionCoeff)} and g = ${fmtGiven(g, "m s⁻²")}.`,
  ];
  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: `Calculate the magnitude of the centripetal acceleration of the ${ctx.vehicle}.`,
      marks: 2,
      targetQuantityKey: "centripetalAccelMs2",
      expectedAnswer: fmt3sf(q.centripetalAccelMs2, "m s⁻²"),
      workingSteps: [
        `a_c = v² / r = (${fmtGiven(speedMs)})² / ${fmtGiven(radiusM)} = ${fmt3sf(q.centripetalAccelMs2, "m s⁻²")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the magnitude of the sideways static frictional force acting on the ${ctx.tyres} at this speed.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "frictionForceN",
      expectedAnswer: fmt3sf(q.frictionForceN, "N"),
      workingSteps: [
        `Since the ${ctx.vehicle} does not skid, static friction supplies the required centripetal force.`,
        `f_s = m a_c = ${fmtGiven(massKg)} × ${fmt3sf(q.centripetalAccelMs2)} = ${fmt3sf(q.frictionForceN, "N")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Calculate the maximum speed at which the ${ctx.vehicle} can negotiate this curve without skidding.`,
      marks: 2,
      targetQuantityKey: "maxSafeSpeedMs",
      expectedAnswer: fmt3sf(q.maxSafeSpeedMs, "m s⁻¹"),
      workingSteps: [
        `At the skid limit, m v_max² / r = μ_s m g.`,
        `v_max = √(${fmtGiven(staticFrictionCoeff)} × ${fmtGiven(g)} × ${fmtGiven(radiusM)}) = ${fmt3sf(q.maxSafeSpeedMs, "m s⁻¹")}.`,
      ],
    },
  ];
  const markScheme: MarkSchemePoint[] = [
    { code: "M1", partId: "a", criterion: "Applies a_c = v² / r.", marks: 1 },
    { code: "A1", partId: "a", criterion: `Obtains ${fmt3sf(q.centripetalAccelMs2, "m s⁻²")}.`, marks: 1 },
    { code: "M1", partId: "b", criterion: "Multiplies mass by centripetal acceleration (rather than using limiting μ_s mg).", marks: 1 },
    { code: "A1", partId: "b", criterion: `Obtains ${fmt3sf(q.frictionForceN, "N")}.`, marks: 1 },
    { code: "M1", partId: "c", criterion: "Equates m v_max² / r to μ_s mg.", marks: 1 },
    { code: "A1", partId: "c", criterion: `Obtains ${fmt3sf(q.maxSafeSpeedMs, "m s⁻¹")}.`, marks: 1 },
  ];

  return {
    id,
    conceptId: "uniform-circular-motion",
    templateArchetype: "flat-curve-static-friction-skid-limit",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: ["centripetalAccelMs2", "centripetalForceN", "frictionForceN", "maxStaticFrictionN", "maxSafeSpeedMs"],
    questionPlan: buildDigitFreePlan(
      "Analyse unbanked circular cornering from centripetal acceleration to actual static grip and maximum safe speed",
      "structured",
      ["calculate-centripetal-acceleration", "determine-subcritical-static-friction", "solve-skid-threshold-speed"],
    ),
    stem: stems[variantIndex % stems.length],
    parts,
    workedSolution: `(a) a_c = v² / r = (${fmtGiven(speedMs)})² / ${fmtGiven(radiusM)} = ${fmt3sf(q.centripetalAccelMs2, "m s⁻²")}. (b) Below the skid limit, f_s = m a_c = ${fmtGiven(massKg)} × ${fmt3sf(q.centripetalAccelMs2)} = ${fmt3sf(q.frictionForceN, "N")}. (c) Maximum non-skidding speed v_max = √(μ_s g r) = ${fmt3sf(q.maxSafeSpeedMs, "m s⁻¹")}.`,
    markScheme,
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// 3. BANKED CURVE ("uniform-circular-motion", "banked-curve-design-and-friction")
// ============================================================================

function buildBankedCurveItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  const isIb = variantIndex % 2 === 0;
  const g = isIb ? 9.8 : 9.81;
  const syllabi = resolveSyllabiTags({
    conceptId: "uniform-circular-motion",
    format,
    variantIndex,
    gravityRegime: isIb ? "ib" : "metric981",
  });

  const masses = [82, 160, 320, 640, 880, 1050, 1250, 1420, 1580, 1750, 1950];
  const radii = [32, 45, 58, 72, 85, 105, 120, 145, 165, 190, 215];
  const angles = [14, 16, 18, 20, 22, 25, 28, 30, 34, 36];

  const massKg = masses[(variantIndex + rng.nextInt(0, 1)) % masses.length];
  const radiusM = radii[(variantIndex * 3 + rng.nextInt(0, 1)) % radii.length];
  const bankAngleDeg = angles[(variantIndex * 5 + rng.nextInt(0, 1)) % angles.length];
  const theta = (bankAngleDeg * Math.PI) / 180;
  const ctx = BANKED_CURVE_CONTEXTS[variantIndex % BANKED_CURVE_CONTEXTS.length];

  const useRoughBank = variantIndex % 3 === 2;

  if (!useRoughBank) {
    // Frictionless / design-speed banked curve (omit speedMs so actualSpeed == idealSpeed)
    const spec: BankedCurveScenario = {
      kind: "banked-curve",
      id,
      massKg,
      radiusM,
      bankAngleDeg,
      staticFrictionCoeff: 0,
      gravityMs2: g,
    };
    const sol = solveGravAstroScenario(spec);
    const q = sol.quantities;
    const difficulty = pickDifficulty(variantIndex);

    if (format === "mcq") {
      const askNormal = variantIndex % 2 === 1;
      const framingIdx = variantIndex % 6;

      if (!askNormal) {
        const truth = q.idealSpeedMs;
        const stems = [
          `An ${ctx.vehicle} of mass ${fmtGiven(massKg, "kg")} rounds ${ctx.track} of horizontal radius ${fmtGiven(radiusM, "m")} banked at ${fmtGiven(bankAngleDeg, "°")} to the horizontal. Take g = ${fmtGiven(g, "m s⁻²")}. At what design speed is zero lateral friction required along the slope?`,
          `Civil engineers bank ${ctx.track} of radius ${fmtGiven(radiusM, "m")} at ${fmtGiven(bankAngleDeg, "°")} above the horizontal so that a ${fmtGiven(massKg, "kg")} ${ctx.noun} requires no sideways friction (g = ${fmtGiven(g, "m s⁻²")}). Calculate this ideal cornering speed.`,
          `On a smooth, icy ${ctx.track} banked at ${fmtGiven(bankAngleDeg, "°")} with horizontal curvature radius ${fmtGiven(radiusM, "m")}, what speed must a ${fmtGiven(massKg, "kg")} ${ctx.noun} maintain to follow the curve without sliding up or down the slope? Use g = ${fmtGiven(g, "m s⁻²")}.`,
          `As shown in the cross-sectional force diagram, ${ctx.track} has radius ${fmtGiven(radiusM, "m")} and banking angle ${fmtGiven(bankAngleDeg, "°")} for a ${fmtGiven(massKg, "kg")} ${ctx.noun} (g = ${fmtGiven(g, "m s⁻²")}). Determine the frictionless design speed.`,
          `Without relying on lateral tyre or rail grip, a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} negotiates ${ctx.track} of radius ${fmtGiven(radiusM, "m")} inclined at ${fmtGiven(bankAngleDeg, "°")} to the horizontal (g = ${fmtGiven(g, "m s⁻²")}). Find its speed.`,
          `For ${ctx.track} of radius ${fmtGiven(radiusM, "m")} inclined at ${fmtGiven(bankAngleDeg, "°")} to the horizontal, at what speed does the normal reaction alone keep a ${fmtGiven(massKg, "kg")} ${ctx.noun} in horizontal circular motion? Take g = ${fmtGiven(g, "m s⁻²")}.`,
        ];
        const options = buildNumericMcqOptions(truth, "m s⁻¹", [
          {
            value: Math.sqrt(g * radiusM * Math.sin(theta)),
            rationale: "Uses sin θ instead of tan θ by equating normal force N to mg rather than mg / cos θ.",
          },
          {
            value: g * radiusM * Math.tan(theta),
            rationale: "Evaluates v² = g r tan θ and omits the square root.",
          },
          {
            value: Math.sqrt((g * radiusM) / Math.tan(theta)),
            rationale: "Divides g r by tan θ due to swapping horizontal and vertical components of the normal force.",
          },
          {
            value: Math.sqrt(g * radiusM * Math.cos(theta)),
            rationale: "Substitutes cos θ in place of tan θ inside the radical.",
          },
        ]);
        return {
          id,
          conceptId: "uniform-circular-motion",
          templateArchetype: "banked-curve-design-and-friction",
          seed,
          syllabi,
          format: "mcq",
          difficulty,
          domain: "grav-astro",
          scenarioSpec: spec as unknown as Record<string, unknown>,
          hiddenQuantities: ["idealSpeedMs", "speedMs", "normalForceN", "centripetalAccelMs2", "centripetalForceN"],
          targetQuantityKey: "idealSpeedMs",
          questionPlan: buildDigitFreePlan(
            "Eliminate normal reaction between vertical equilibrium and radial acceleration to find frictionless banking speed",
            "mcq",
          ),
          stem: stems[framingIdx],
          options,
          workedSolution: `With zero slope friction, N cos θ = mg and N sin θ = m v² / r. Dividing gives tan θ = v² / (g r), so v = √(g r tan θ) = √(${fmtGiven(g)} × ${fmtGiven(radiusM)} × tan ${fmtGiven(bankAngleDeg)}°) = ${fmt3sf(truth, "m s⁻¹")}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Uses v = √(g r tan ${fmtGiven(bankAngleDeg)}°) to obtain ${fmt3sf(truth, "m s⁻¹")}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      // askNormal on smooth banked curve
      const truth = q.normalForceN;
      const stems = [
        `A ${fmtGiven(massKg, "kg")} ${ctx.vehicle} travels around a frictionless ${ctx.track} of radius ${fmtGiven(radiusM, "m")} banked at ${fmtGiven(bankAngleDeg, "°")} to the horizontal at its exact design speed (g = ${fmtGiven(g, "m s⁻²")}). What is the magnitude of the normal contact force exerted by the track?`,
        `Rounding ${ctx.track} (radius ${fmtGiven(radiusM, "m")}, bank angle ${fmtGiven(bankAngleDeg, "°")}) with zero lateral friction, a ${fmtGiven(massKg, "kg")} ${ctx.noun} stays in a horizontal circle. Taking g = ${fmtGiven(g, "m s⁻²")}, determine the normal reaction force.`,
        `When a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} corners at the ideal frictionless speed on ${ctx.track} of radius ${fmtGiven(radiusM, "m")} inclined at ${fmtGiven(bankAngleDeg, "°")} (g = ${fmtGiven(g, "m s⁻²")}), how large is the normal force from the surface?`,
        `Sensors on ${ctx.track} (radius ${fmtGiven(radiusM, "m")}, banking ${fmtGiven(bankAngleDeg, "°")}) measure the perpendicular load of a ${fmtGiven(massKg, "kg")} ${ctx.noun} cruising with zero side-friction. Using g = ${fmtGiven(g, "m s⁻²")}, calculate the normal reaction.`,
        `In horizontal circular motion without friction on ${ctx.track} of radius ${fmtGiven(radiusM, "m")} banked at ${fmtGiven(bankAngleDeg, "°")}, a ${fmtGiven(massKg, "kg")} ${ctx.noun} experiences a normal force N (g = ${fmtGiven(g, "m s⁻²")}). Find N.`,
        `Calculate the normal force acting on a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} negotiating ${ctx.track} of radius ${fmtGiven(radiusM, "m")} and banking angle ${fmtGiven(bankAngleDeg, "°")} when lateral friction is zero (g = ${fmtGiven(g, "m s⁻²")}).`,
      ];
      const options = buildNumericMcqOptions(truth, "N", [
        {
          value: massKg * g * Math.cos(theta),
          rationale: "Applies the inclined-plane formula N = mg cos θ, overlooking that acceleration is horizontal rather than down the slope.",
        },
        {
          value: massKg * g,
          rationale: "Equates normal reaction to weight mg without accounting for the tilted surface.",
        },
        {
          value: massKg * g * Math.tan(theta),
          rationale: "Calculates the horizontal centripetal force mg tan θ instead of the normal reaction mg / cos θ.",
        },
        {
          value: (massKg * g) / Math.sin(theta),
          rationale: "Divides mg by sin θ instead of cos θ when enforcing zero vertical acceleration.",
        },
      ]);
      return {
        id,
        conceptId: "uniform-circular-motion",
        templateArchetype: "banked-curve-design-and-friction",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["idealSpeedMs", "speedMs", "normalForceN", "centripetalAccelMs2", "centripetalForceN"],
        targetQuantityKey: "normalForceN",
        questionPlan: buildDigitFreePlan(
          "Enforce zero vertical acceleration on a frictionless banked curve to find normal contact force",
          "mcq",
        ),
        stem: stems[framingIdx],
        options,
        workedSolution: `Because the circular path lies in a horizontal plane, vertical acceleration is zero: N cos θ = mg, so N = (${fmtGiven(massKg)} × ${fmtGiven(g)}) / cos ${fmtGiven(bankAngleDeg)}° = ${fmt3sf(truth, "N")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Resolves vertically N cos ${fmtGiven(bankAngleDeg)}° = mg to obtain N = ${fmt3sf(truth, "N")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Structured on smooth banked curve
    const stems = [
      `An ${ctx.vehicle} of combined mass ${fmtGiven(massKg, "kg")} travels around ${ctx.track} of horizontal radius ${fmtGiven(radiusM, "m")} inclined at a constant banking angle of ${fmtGiven(bankAngleDeg, "°")} to the horizontal. At the chosen design speed, zero lateral frictional force acts along the slope. Take g = ${fmtGiven(g, "m s⁻²")}.`,
      `Engineers design ${ctx.track} with a horizontal curve radius of ${fmtGiven(radiusM, "m")} and banking angle ${fmtGiven(bankAngleDeg, "°")} so that a ${fmtGiven(massKg, "kg")} ${ctx.noun} corners in a horizontal plane with zero sideways friction (g = ${fmtGiven(g, "m s⁻²")}).`,
    ];
    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: `Calculate the magnitude of the normal contact force acting on the ${ctx.noun}.`,
        marks: 2,
        targetQuantityKey: "normalForceN",
        expectedAnswer: fmt3sf(q.normalForceN, "N"),
        workingSteps: [
          `Vertical equilibrium gives N cos θ = mg.`,
          `N = (${fmtGiven(massKg)} × ${fmtGiven(g)}) / cos ${fmtGiven(bankAngleDeg)}° = ${fmt3sf(q.normalForceN, "N")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Determine the horizontal centripetal force acting toward the centre of curvature.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "centripetalForceN",
        expectedAnswer: fmt3sf(q.centripetalForceN, "N"),
        workingSteps: [
          `Horizontal component of normal reaction provides the centripetal force: F_c = N sin θ = mg tan θ.`,
          `F_c = ${fmt3sf(q.normalForceN)} × sin ${fmtGiven(bankAngleDeg)}° = ${fmt3sf(q.centripetalForceN, "N")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Hence calculate the ideal frictionless cornering speed of the ${ctx.noun}.`,
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "idealSpeedMs",
        expectedAnswer: fmt3sf(q.idealSpeedMs, "m s⁻¹"),
        workingSteps: [
          `From m v² / r = F_c, v = √(F_c r / m) = √(g r tan θ) = ${fmt3sf(q.idealSpeedMs, "m s⁻¹")}.`,
        ],
      },
    ];
    return {
      id,
      conceptId: "uniform-circular-motion",
      templateArchetype: "banked-curve-design-and-friction",
      seed,
      syllabi,
      format: "structured",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: ["normalForceN", "centripetalForceN", "centripetalAccelMs2", "idealSpeedMs", "speedMs"],
      questionPlan: buildDigitFreePlan(
        "Resolve normal reaction vertically and horizontally to derive frictionless banked design speed",
        "structured",
        ["resolve-normal-reaction", "compute-horizontal-centripetal-force", "evaluate-ideal-banking-speed"],
      ),
      stem: stems[variantIndex % stems.length],
      parts,
      workedSolution: `(a) Vertical equilibrium N cos ${fmtGiven(bankAngleDeg)}° = mg gives N = ${fmt3sf(q.normalForceN, "N")}. (b) Horizontal component F_c = N sin ${fmtGiven(bankAngleDeg)}° = ${fmt3sf(q.centripetalForceN, "N")}. (c) Setting m v² / r = F_c yields v_ideal = ${fmt3sf(q.idealSpeedMs, "m s⁻¹")}.`,
      markScheme: [
        { code: "M1", partId: "a", criterion: "Uses N cos θ = mg (zero vertical acceleration).", marks: 1 },
        { code: "A1", partId: "a", criterion: `Obtains N = ${fmt3sf(q.normalForceN, "N")}.`, marks: 1 },
        { code: "M1", partId: "b", criterion: "Evaluates F_c = N sin θ or mg tan θ.", marks: 1 },
        { code: "A1", partId: "b", criterion: `Obtains F_c = ${fmt3sf(q.centripetalForceN, "N")}.`, marks: 1 },
        { code: "M1", partId: "c", criterion: "Equates m v² / r to F_c and solves for v.", marks: 1 },
        { code: "A1", partId: "c", criterion: `Obtains v_ideal = ${fmt3sf(q.idealSpeedMs, "m s⁻¹")}.`, marks: 1 },
      ],
      totalMarks: 6,
      generatorModel,
    };
  }

  // Rough banked curve with friction (staticFrictionCoeff > 0)
  const staticFrictionCoeff = [0.25, 0.3, 0.35, 0.4, 0.45][variantIndex % 5];
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const vIdeal = Math.sqrt(g * radiusM * Math.tan(theta));
  const vMax = Math.sqrt(
    (g * radiusM * (sinT + staticFrictionCoeff * cosT)) /
      (cosT - staticFrictionCoeff * sinT),
  );
  const speedMs = Number((vIdeal + 0.5 * (vMax - vIdeal)).toPrecision(3));

  const spec: BankedCurveScenario = {
    kind: "banked-curve",
    id,
    massKg,
    radiusM,
    bankAngleDeg,
    staticFrictionCoeff,
    speedMs,
    gravityMs2: g,
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const difficulty = pickDifficulty(variantIndex, "higher");

  if (format === "mcq") {
    const truth = q.maxSafeSpeedMs;
    const stems = [
      `A ${fmtGiven(massKg, "kg")} ${ctx.vehicle} corners at ${fmtGiven(speedMs, "m s⁻¹")} on ${ctx.track} of horizontal radius ${fmtGiven(radiusM, "m")} banked at ${fmtGiven(bankAngleDeg, "°")}, where the static friction coefficient is ${fmtGiven(staticFrictionCoeff)} (g = ${fmtGiven(g, "m s⁻²")}). What is the maximum speed at which it can round this banked turn without skidding outward?`,
      `On ${ctx.track} (radius ${fmtGiven(radiusM, "m")}, bank angle ${fmtGiven(bankAngleDeg, "°")}, μ_s = ${fmtGiven(staticFrictionCoeff)}), a ${fmtGiven(massKg, "kg")} ${ctx.noun} currently travels at ${fmtGiven(speedMs, "m s⁻¹")}. Taking g = ${fmtGiven(g, "m s⁻²")}, calculate the upper non-skidding speed limit.`,
      `Assisted by lateral grip of static coefficient ${fmtGiven(staticFrictionCoeff)} on ${ctx.track} banked at ${fmtGiven(bankAngleDeg, "°")} with radius ${fmtGiven(radiusM, "m")} (g = ${fmtGiven(g, "m s⁻²")}), a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} moves at ${fmtGiven(speedMs, "m s⁻¹")}. Find the maximum safe cornering speed.`,
      `Determine the maximum speed before outward skidding for a ${fmtGiven(massKg, "kg")} ${ctx.vehicle} (currently at ${fmtGiven(speedMs, "m s⁻¹")}) on ${ctx.track} of radius ${fmtGiven(radiusM, "m")}, banking angle ${fmtGiven(bankAngleDeg, "°")}, and μ_s = ${fmtGiven(staticFrictionCoeff)} (g = ${fmtGiven(g, "m s⁻²")}).`,
    ];
    const options = buildNumericMcqOptions(truth, "m s⁻¹", [
      {
        value: Math.sqrt(
          (g * radiusM * (sinT - staticFrictionCoeff * cosT)) /
            Math.max(0.05, cosT + staticFrictionCoeff * sinT),
        ) || vIdeal * 0.55,
        rationale: "Reverses the friction direction down-slope vs up-slope, computing the minimum speed formula instead of maximum speed.",
      },
      {
        value: Math.sqrt(g * radiusM * (Math.tan(theta) + staticFrictionCoeff)),
        rationale: "Omits the μ_s sin θ reduction in vertical normal-force equilibrium, using tan θ + μ_s instead of (sin θ + μ_s cos θ)/(cos θ − μ_s sin θ).",
      },
      {
        value: vIdeal,
        rationale: "Calculates the frictionless design speed √(g r tan θ) and ignores static friction entirely.",
      },
      {
        value: Math.sqrt(staticFrictionCoeff * g * radiusM),
        rationale: "Applies the flat-curve skidding formula √(μ_s g r) and ignores track banking.",
      },
    ]);
    return {
      id,
      conceptId: "uniform-circular-motion",
      templateArchetype: "banked-curve-design-and-friction",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: ["idealSpeedMs", "normalForceN", "frictionForceN", "maxSafeSpeedMs", "minSafeSpeedMs"],
      targetQuantityKey: "maxSafeSpeedMs",
      questionPlan: buildDigitFreePlan(
        "Resolve normal reaction and down-slope limiting static friction horizontally and vertically for maximum banked speed",
        "mcq",
      ),
      stem: stems[variantIndex % stems.length],
      options,
      workedSolution: `At maximum speed, limiting friction μ_s N acts down the slope: N(cos θ − μ_s sin θ) = mg and N(sin θ + μ_s cos θ) = m v_max² / r. Dividing yields v_max = √[g r (sin ${fmtGiven(bankAngleDeg)}° + ${fmtGiven(staticFrictionCoeff)} cos ${fmtGiven(bankAngleDeg)}°) / (cos ${fmtGiven(bankAngleDeg)}° − ${fmtGiven(staticFrictionCoeff)} sin ${fmtGiven(bankAngleDeg)}°)] = ${fmt3sf(truth, "m s⁻¹")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Resolves N and down-slope μ_s N horizontally and vertically to obtain v_max = ${fmt3sf(truth, "m s⁻¹")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured on rough banked curve (ideal speed -> friction direction + slope friction -> max safe speed)
  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: `Calculate the ideal speed at which zero lateral friction would act along the banked slope.`,
      marks: 2,
      targetQuantityKey: "idealSpeedMs",
      expectedAnswer: fmt3sf(q.idealSpeedMs, "m s⁻¹"),
      workingSteps: [
        `v_ideal = √(g r tan θ) = √(${fmtGiven(g)} × ${fmtGiven(radiusM)} × tan ${fmtGiven(bankAngleDeg)}°) = ${fmt3sf(q.idealSpeedMs, "m s⁻¹")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `At the actual speed of ${fmtGiven(speedMs, "m s⁻¹")}, calculate the magnitude of the static frictional force acting parallel to the slope.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "frictionForceN",
      expectedAnswer: fmt3sf(q.frictionForceN, "N"),
      workingSteps: [
        `Resolving along the slope toward the bottom: f_s = m ((v² / r) cos θ − g sin θ).`,
        `f_s = ${fmtGiven(massKg)} × (((${fmtGiven(speedMs)})² / ${fmtGiven(radiusM)}) cos ${fmtGiven(bankAngleDeg)}° − ${fmtGiven(g)} sin ${fmtGiven(bankAngleDeg)}°) = ${fmt3sf(q.frictionForceN, "N")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Determine the maximum speed at which the ${ctx.noun} can negotiate this banked curve without skidding.`,
      marks: 2,
      targetQuantityKey: "maxSafeSpeedMs",
      expectedAnswer: fmt3sf(q.maxSafeSpeedMs, "m s⁻¹"),
      workingSteps: [
        `v_max = √[g r (sin θ + μ_s cos θ) / (cos θ − μ_s sin θ)] = ${fmt3sf(q.maxSafeSpeedMs, "m s⁻¹")}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "uniform-circular-motion",
    templateArchetype: "banked-curve-design-and-friction",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: ["idealSpeedMs", "normalForceN", "frictionForceN", "frictionDirection", "maxSafeSpeedMs", "minSafeSpeedMs"],
    questionPlan: buildDigitFreePlan(
      "Compare operating speed against frictionless banking speed to evaluate slope friction and maximum non-skidding speed",
      "structured",
      ["calculate-frictionless-design-speed", "resolve-parallel-slope-friction", "determine-upper-skid-limit"],
    ),
    stem: `A ${fmtGiven(massKg, "kg")} ${ctx.vehicle} rounds ${ctx.track} of horizontal radius ${fmtGiven(radiusM, "m")} inclined at ${fmtGiven(bankAngleDeg, "°")} to the horizontal at a steady speed of ${fmtGiven(speedMs, "m s⁻¹")}. The coefficient of static friction on the slope is ${fmtGiven(staticFrictionCoeff)}. Take g = ${fmtGiven(g, "m s⁻²")}.`,
    parts,
    workedSolution: `(a) Frictionless design speed v_ideal = √(g r tan ${fmtGiven(bankAngleDeg)}°) = ${fmt3sf(q.idealSpeedMs, "m s⁻¹")}. (b) Resolving parallel to the incline gives f_s = m((v²/r) cos θ − g sin θ) = ${fmt3sf(q.frictionForceN, "N")} down the slope. (c) At limiting grip, v_max = √[g r (sin θ + μ_s cos θ)/(cos θ − μ_s sin θ)] = ${fmt3sf(q.maxSafeSpeedMs, "m s⁻¹")}.`,
    markScheme: [
      { code: "M1", partId: "a", criterion: "Applies v_ideal = √(g r tan θ).", marks: 1 },
      { code: "A1", partId: "a", criterion: `Obtains ${fmt3sf(q.idealSpeedMs, "m s⁻¹")}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Resolves centripetal acceleration and weight components parallel to the slope.", marks: 1 },
      { code: "A1", partId: "b", criterion: `Obtains f_s = ${fmt3sf(q.frictionForceN, "N")}.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Applies limiting down-slope friction in horizontal and vertical force equations.", marks: 1 },
      { code: "A1", partId: "c", criterion: `Obtains v_max = ${fmt3sf(q.maxSafeSpeedMs, "m s⁻¹")}.`, marks: 1 },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// 4. VERTICAL CIRCLE — UNIFORM ("uniform-circular-motion", "vertical-circle-uniform-top-bottom")
// ============================================================================

function buildVerticalCircleUniformItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  const isIb = variantIndex % 2 === 1;
  const g = isIb ? 9.8 : 9.81;
  const syllabi = resolveSyllabiTags({
    conceptId: "uniform-circular-motion",
    format,
    variantIndex,
    gravityRegime: isIb ? "ib" : "metric981",
  });

  const ctx = VERTICAL_CIRCLE_CONTEXTS[variantIndex % VERTICAL_CIRCLE_CONTEXTS.length];
  const constraintKind = ctx.kind;
  const isCrest = constraintKind === "over-crest";

  const smallMasses = [0.4, 0.55, 0.75, 0.9, 1.25, 1.6, 2.2, 3.5];
  const vehicleMasses = [650, 820, 960, 1180, 1350, 1520];
  const massKg = isCrest
    ? vehicleMasses[(variantIndex + rng.nextInt(0, 1)) % vehicleMasses.length]
    : smallMasses[(variantIndex + rng.nextInt(0, 2)) % smallMasses.length];

  const radii = isCrest
    ? [14, 18, 22, 26, 32, 38, 44]
    : [0.65, 0.85, 1.1, 1.35, 1.6, 1.95, 2.4, 2.8];
  const radiusM = radii[(variantIndex * 3 + rng.nextInt(0, 1)) % radii.length];

  const vCrit = Math.sqrt(g * radiusM);
  const speedScale = isCrest
    ? [0.55, 0.65, 0.72, 0.8, 0.86][variantIndex % 5]
    : [1.22, 1.34, 1.46, 1.58, 1.72, 1.85][variantIndex % 6];
  const referenceSpeedMs = Number((vCrit * speedScale).toPrecision(3));

  const spec: VerticalCircleScenario = {
    kind: "vertical-circle",
    id,
    massKg,
    radiusM,
    motionMode: "uniform",
    constraintKind,
    referencePosition: "top",
    referenceSpeedMs,
    gravityMs2: g,
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const difficulty = pickDifficulty(variantIndex);
  const supportNoun =
    constraintKind === "string"
      ? "tension"
      : "normal contact force";

  if (format === "mcq") {
    const mode = isCrest ? 0 : variantIndex % 3;
    const framingIdx = variantIndex % 6;

    if (mode === 0) {
      // Top force (string tension mv^2/R - mg, inside-track normal mv^2/R - mg, or over-crest normal mg - mv^2/R)
      const truth = q.supportForceTopN;
      const stems = isCrest
        ? [
            `A ${fmtGiven(massKg, "kg")} ${ctx.obj} passes over ${ctx.rig} of vertical radius of curvature ${fmtGiven(radiusM, "m")} at a steady speed of ${fmtGiven(referenceSpeedMs, "m s⁻¹")}. Take g = ${fmtGiven(g, "m s⁻²")}. What upward normal contact force acts on the ${ctx.obj} at the highest point?`,
            `Crossing ${ctx.rig} (radius ${fmtGiven(radiusM, "m")}) at ${fmtGiven(referenceSpeedMs, "m s⁻¹")}, a ${fmtGiven(massKg, "kg")} ${ctx.obj} remains in road contact (g = ${fmtGiven(g, "m s⁻²")}). Calculate the normal reaction at the apex.`,
            `At the summit of ${ctx.rig} of vertical radius ${fmtGiven(radiusM, "m")}, a ${fmtGiven(massKg, "kg")} ${ctx.obj} moves horizontally at ${fmtGiven(referenceSpeedMs, "m s⁻¹")} (g = ${fmtGiven(g, "m s⁻²")}). Determine the normal force exerted by the surface.`,
            `Sensors embedded at the top of ${ctx.rig} (radius ${fmtGiven(radiusM, "m")}) record a ${fmtGiven(massKg, "kg")} ${ctx.obj} travelling at ${fmtGiven(referenceSpeedMs, "m s⁻¹")}. Using g = ${fmtGiven(g, "m s⁻²")}, find the upward normal reaction.`,
            `Calculate the road normal reaction on a ${fmtGiven(massKg, "kg")} ${ctx.obj} cresting ${ctx.rig} of radius ${fmtGiven(radiusM, "m")} at constant speed ${fmtGiven(referenceSpeedMs, "m s⁻¹")} (g = ${fmtGiven(g, "m s⁻²")}).`,
            `Moving at ${fmtGiven(referenceSpeedMs, "m s⁻¹")} over ${ctx.rig} of circular radius ${fmtGiven(radiusM, "m")} (g = ${fmtGiven(g, "m s⁻²")}), what normal force supports a ${fmtGiven(massKg, "kg")} ${ctx.obj} at the crest?`,
          ]
        : [
            `A ${fmtGiven(massKg, "kg")} ${ctx.obj} revolves at a constant speed of ${fmtGiven(referenceSpeedMs, "m s⁻¹")} in a vertical circle of radius ${fmtGiven(radiusM, "m")} guided by ${ctx.rig}. Take g = ${fmtGiven(g, "m s⁻²")}. What is the ${supportNoun} at the highest point of the circle?`,
            `Driven at steady speed ${fmtGiven(referenceSpeedMs, "m s⁻¹")} around a vertical circle of radius ${fmtGiven(radiusM, "m")} on ${ctx.rig}, a ${fmtGiven(massKg, "kg")} ${ctx.obj} passes through the apex (g = ${fmtGiven(g, "m s⁻²")}). Calculate the ${supportNoun} at the top.`,
            `At the top of a vertical circular path of radius ${fmtGiven(radiusM, "m")}, ${ctx.rig} guides a ${fmtGiven(massKg, "kg")} ${ctx.obj} moving at a constant ${fmtGiven(referenceSpeedMs, "m s⁻¹")} (g = ${fmtGiven(g, "m s⁻²")}). Find the ${supportNoun}.`,
            `Telemetry from ${ctx.rig} of radius ${fmtGiven(radiusM, "m")} shows a ${fmtGiven(massKg, "kg")} ${ctx.obj} whirling in a vertical plane at constant speed ${fmtGiven(referenceSpeedMs, "m s⁻¹")}. Using g = ${fmtGiven(g, "m s⁻²")}, determine the ${supportNoun} at the top.`,
            `Whirling uniformly at ${fmtGiven(referenceSpeedMs, "m s⁻¹")} in a vertical circle of radius ${fmtGiven(radiusM, "m")} on ${ctx.rig}, a ${fmtGiven(massKg, "kg")} ${ctx.obj} reaches its highest position (g = ${fmtGiven(g, "m s⁻²")}). Which value gives the ${supportNoun} there?`,
            `Determine the ${supportNoun} acting on a ${fmtGiven(massKg, "kg")} ${ctx.obj} at the apex of a vertical circle of radius ${fmtGiven(radiusM, "m")} on ${ctx.rig} when its constant speed is ${fmtGiven(referenceSpeedMs, "m s⁻¹")} (g = ${fmtGiven(g, "m s⁻²")}).`,
          ];
      const options = buildNumericMcqOptions(truth, "N", [
        {
          value: q.supportForceBottomN,
          rationale: isCrest
            ? "Adds m v² / R to mg instead of subtracting m v² / R from mg at a convex crest."
            : "Adds weight mg to m v² / R instead of subtracting mg, confusing the top of a vertical circle with the bottom.",
        },
        {
          value: q.centripetalForceTopN,
          rationale: "Equates the support force directly to net centripetal force m v² / R, ignoring gravity mg.",
        },
        {
          value: q.weightN,
          rationale: "Equates the support force to static weight mg, ignoring centripetal acceleration.",
        },
        {
          value: Math.abs(q.centripetalForceTopN - 2 * q.weightN),
          rationale: "Subtracts twice the weight from m v² / R through a sign error in radial Newton's second law.",
        },
      ]);
      return {
        id,
        conceptId: "uniform-circular-motion",
        templateArchetype: "vertical-circle-uniform-top-bottom",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["supportForceTopN", "supportForceBottomN", "centripetalForceTopN", "minSpeedTopMs"],
        targetQuantityKey: "supportForceTopN",
        questionPlan: buildDigitFreePlan(
          "Apply radial Newton second law at the top of a uniform vertical circle to find support force",
          "mcq",
        ),
        stem: stems[framingIdx],
        options,
        workedSolution: isCrest
          ? `At the convex crest, downward resultant force is mg − N_top = m v² / R, so N_top = m(g − v²/R) = ${fmtGiven(massKg)} × (${fmtGiven(g)} − (${fmtGiven(referenceSpeedMs)})² / ${fmtGiven(radiusM)}) = ${fmt3sf(truth, "N")}.`
          : `At the highest point, both ${supportNoun} and weight mg act downward toward the centre: F_top + mg = m v² / R, so F_top = m(v²/R − g) = ${fmtGiven(massKg)} × ((${fmtGiven(referenceSpeedMs)})² / ${fmtGiven(radiusM)} − ${fmtGiven(g)}) = ${fmt3sf(truth, "N")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies radial force equation at apex to obtain ${fmt3sf(truth, "N")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (mode === 1) {
      // Bottom force: mv^2/R + mg
      const truth = q.supportForceBottomN;
      const stems = [
        `A ${fmtGiven(massKg, "kg")} ${ctx.obj} moves at a constant speed of ${fmtGiven(referenceSpeedMs, "m s⁻¹")} around a vertical circle of radius ${fmtGiven(radiusM, "m")} on ${ctx.rig}. Take g = ${fmtGiven(g, "m s⁻²")}. What is the ${supportNoun} at the lowest point of the path?`,
        `Passing through the bottom of a vertical circular trajectory of radius ${fmtGiven(radiusM, "m")} at steady speed ${fmtGiven(referenceSpeedMs, "m s⁻¹")}, a ${fmtGiven(massKg, "kg")} ${ctx.obj} is constrained by ${ctx.rig} (g = ${fmtGiven(g, "m s⁻²")}). Calculate the upward ${supportNoun}.`,
        `On ${ctx.rig} of radius ${fmtGiven(radiusM, "m")}, a motor drives a ${fmtGiven(massKg, "kg")} ${ctx.obj} at constant speed ${fmtGiven(referenceSpeedMs, "m s⁻¹")} in a vertical plane (g = ${fmtGiven(g, "m s⁻²")}). Determine the ${supportNoun} at the bottom.`,
        `Find the maximum ${supportNoun} experienced at the bottom of a vertical circle of radius ${fmtGiven(radiusM, "m")} by a ${fmtGiven(massKg, "kg")} ${ctx.obj} whirling uniformly at ${fmtGiven(referenceSpeedMs, "m s⁻¹")} on ${ctx.rig} (g = ${fmtGiven(g, "m s⁻²")}).`,
        `At the nadir of ${ctx.rig} (vertical radius ${fmtGiven(radiusM, "m")}), a ${fmtGiven(massKg, "kg")} ${ctx.obj} travels horizontally at ${fmtGiven(referenceSpeedMs, "m s⁻¹")}. Taking g = ${fmtGiven(g, "m s⁻²")}, what ${supportNoun} acts upward?`,
        `When a ${fmtGiven(massKg, "kg")} ${ctx.obj} sweeps the lowest point of ${ctx.rig} of radius ${fmtGiven(radiusM, "m")} at ${fmtGiven(referenceSpeedMs, "m s⁻¹")} (g = ${fmtGiven(g, "m s⁻²")}), how large is the ${supportNoun}?`,
      ];
      const options = buildNumericMcqOptions(truth, "N", [
        {
          value: q.supportForceTopN,
          rationale: "Subtracts weight mg from m v² / R instead of adding mg at the bottom of the vertical circle.",
        },
        {
          value: q.centripetalForceBottomN,
          rationale: "Quotes net centripetal force m v² / R alone without adding mg to overcome downward weight.",
        },
        {
          value: q.weightN,
          rationale: "Quotes static weight mg and neglects the upward centripetal force requirement.",
        },
        {
          value: q.centripetalForceBottomN + 2 * q.weightN,
          rationale: "Adds 2mg to m v² / R by conflating uniform-speed force balance with energy-change expressions.",
        },
      ]);
      return {
        id,
        conceptId: "uniform-circular-motion",
        templateArchetype: "vertical-circle-uniform-top-bottom",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["supportForceTopN", "supportForceBottomN", "centripetalForceBottomN", "minSpeedTopMs"],
        targetQuantityKey: "supportForceBottomN",
        questionPlan: buildDigitFreePlan(
          "Apply upward radial Newton second law at the bottom of a vertical circle",
          "mcq",
        ),
        stem: stems[framingIdx],
        options,
        workedSolution: `At the lowest point, upward ${supportNoun} opposes downward weight mg to produce upward centripetal acceleration: F_bot − mg = m v² / R, giving F_bot = m(v²/R + g) = ${fmtGiven(massKg)} × ((${fmtGiven(referenceSpeedMs)})² / ${fmtGiven(radiusM)} + ${fmtGiven(g)}) = ${fmt3sf(truth, "N")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses F_bot = m(v²/R + g) to obtain ${fmt3sf(truth, "N")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // mode === 2: minSpeedTopMs = sqrt(g R)
    const truth = q.minSpeedTopMs;
    const stems = [
      `A ${fmtGiven(massKg, "kg")} ${ctx.obj} currently whirls at ${fmtGiven(referenceSpeedMs, "m s⁻¹")} on ${ctx.rig} of radius ${fmtGiven(radiusM, "m")} in a vertical plane (g = ${fmtGiven(g, "m s⁻²")}). What is the minimum critical speed at the top of the circle so that the ${supportNoun} just falls to zero?`,
      `For a ${fmtGiven(massKg, "kg")} ${ctx.obj} travelling on ${ctx.rig} of vertical radius ${fmtGiven(radiusM, "m")} (currently moving at ${fmtGiven(referenceSpeedMs, "m s⁻¹")}), calculate the minimum apex speed needed to avoid losing contact or going slack. Take g = ${fmtGiven(g, "m s⁻²")}.`,
      `In ${ctx.rig} of radius ${fmtGiven(radiusM, "m")}, a ${fmtGiven(massKg, "kg")} ${ctx.obj} rotates vertically at ${fmtGiven(referenceSpeedMs, "m s⁻¹")}. Taking g = ${fmtGiven(g, "m s⁻²")}, if the drive is slowed, at what critical apex speed does the ${supportNoun} vanish?`,
      `Determine the critical top-of-loop speed √(gR) for a ${fmtGiven(massKg, "kg")} ${ctx.obj} on ${ctx.rig} of radius ${fmtGiven(radiusM, "m")} (operating speed ${fmtGiven(referenceSpeedMs, "m s⁻¹")}, g = ${fmtGiven(g, "m s⁻²")}).`,
      `At what minimum speed at the highest point of ${ctx.rig} (radius ${fmtGiven(radiusM, "m")}, mass ${fmtGiven(massKg, "kg")}, current speed ${fmtGiven(referenceSpeedMs, "m s⁻¹")}) does gravity alone supply the centripetal force? Use g = ${fmtGiven(g, "m s⁻²")}.`,
      `Operators gradually reduce the speed of a ${fmtGiven(massKg, "kg")} ${ctx.obj} from ${fmtGiven(referenceSpeedMs, "m s⁻¹")} on ${ctx.rig} of vertical radius ${fmtGiven(radiusM, "m")} (g = ${fmtGiven(g, "m s⁻²")}). Find the minimum speed at the top before slackness or lift-off occurs.`,
    ];
    const options = buildNumericMcqOptions(truth, "m s⁻¹", [
      {
        value: q.minSpeedBottomLoopMs,
        rationale: "Calculates √(5gR), the minimum bottom entry speed for an unpowered loop, instead of the critical speed √(gR) at the top.",
      },
      {
        value: Math.sqrt(2 * g * radiusM),
        rationale: "Inserts an extraneous factor of 2 under the radical, computing √(2gR) instead of √(gR).",
      },
      {
        value: g * radiusM,
        rationale: "Evaluates v² = gR and forgets to take the square root.",
      },
      {
        value: Math.sqrt((massKg * g) / radiusM),
        rationale: "Incorrectly retains mass m and divides by radius R instead of computing √(gR).",
      },
    ]);
    return {
      id,
      conceptId: "uniform-circular-motion",
      templateArchetype: "vertical-circle-uniform-top-bottom",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: ["minSpeedTopMs", "minSpeedBottomLoopMs", "supportForceTopN", "supportForceBottomN"],
      targetQuantityKey: "minSpeedTopMs",
      questionPlan: buildDigitFreePlan(
        "Set top support force to zero in vertical circular motion to determine critical apex speed",
        "mcq",
      ),
      stem: stems[framingIdx],
      options,
      workedSolution: `At critical contact at the top, ${supportNoun} = 0 so weight alone provides centripetal force: mg = m v_min² / R => v_min = √(g R) = √(${fmtGiven(g)} × ${fmtGiven(radiusM)}) = ${fmt3sf(truth, "m s⁻¹")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Sets top support force to zero to obtain v_min = √(gR) = ${fmt3sf(truth, "m s⁻¹")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (for non-crest uniform vertical circle; force string/inside-track so top+bottom both apply cleanly)
  const structConstraint = variantIndex % 2 === 0 ? ("string" as const) : ("inside-track" as const);
  const sMass = perturbCycle(smallMasses[variantIndex % smallMasses.length], variantIndex, smallMasses.length);
  const sRad = perturbCycle([0.75, 1.05, 1.4, 1.75, 2.2, 2.6, 3.1][variantIndex % 7], variantIndex, 7);
  const sSpeed = Number((Math.sqrt(g * sRad) * (1.3 + 0.1 * (variantIndex % 5))).toPrecision(3));
  const structSpec: VerticalCircleScenario = {
    kind: "vertical-circle",
    id,
    massKg: sMass,
    radiusM: sRad,
    motionMode: "uniform",
    constraintKind: structConstraint,
    referencePosition: "top",
    referenceSpeedMs: sSpeed,
    gravityMs2: g,
  };
  const sSol = solveGravAstroScenario(structSpec);
  const sq = sSol.quantities;
  const sForceName = structConstraint === "string" ? "tension in the cord" : "normal reaction from the track";
  const sConstraintPhrase = structConstraint === "string" ? "an inextensible tether" : "a circular guide track";
  const structStems = [
    `A test mass of ${fmtGiven(sMass, "kg")} is driven at a constant speed of ${fmtGiven(sSpeed, "m s⁻¹")} around a vertical circle of radius ${fmtGiven(sRad, "m")} constrained by ${sConstraintPhrase}. Take g = ${fmtGiven(g, "m s⁻²")}.`,
    `In a rotational mechanics rig, ${sConstraintPhrase} of radius ${fmtGiven(sRad, "m")} guides a ${fmtGiven(sMass, "kg")} calibration mass at steady speed ${fmtGiven(sSpeed, "m s⁻¹")} in a vertical plane (g = ${fmtGiven(g, "m s⁻²")}).`,
    `Motorized drive control keeps a ${fmtGiven(sMass, "kg")} mass moving at constant tangential speed ${fmtGiven(sSpeed, "m s⁻¹")} around a vertical circular path of radius ${fmtGiven(sRad, "m")} using ${sConstraintPhrase}. Use g = ${fmtGiven(g, "m s⁻²")}.`,
    `As shown in the vertical-plane diagram, ${sConstraintPhrase} constrains a ${fmtGiven(sMass, "kg")} mass to revolve uniformly at ${fmtGiven(sSpeed, "m s⁻¹")} on a circle of radius ${fmtGiven(sRad, "m")} where g = ${fmtGiven(g, "m s⁻²")}.`,
  ];

  return {
    id,
    conceptId: "uniform-circular-motion",
    templateArchetype: "vertical-circle-uniform-top-bottom",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: structSpec as unknown as Record<string, unknown>,
    hiddenQuantities: ["minSpeedTopMs", "supportForceTopN", "supportForceBottomN", "centripetalForceTopN"],
    questionPlan: buildDigitFreePlan(
      "Contrast top and bottom support forces and critical apex speed in constant-speed vertical circular motion",
      "structured",
      ["determine-critical-apex-speed", "calculate-apex-support-force", "calculate-nadir-support-force"],
    ),
    stem: pickTemplate(structStems, variantIndex),
    parts: [
      {
        partId: "a",
        prompt: `Calculate the minimum speed at the highest point required for the ${structConstraint === "string" ? "tether to remain taut" : "mass to remain in contact with the track"}.`,
        marks: 2,
        targetQuantityKey: "minSpeedTopMs",
        expectedAnswer: fmt3sf(sq.minSpeedTopMs, "m s⁻¹"),
        workingSteps: [
          `Setting support force at the top to zero gives m v_min² / R = mg.`,
          `v_min = √(${fmtGiven(g)} × ${fmtGiven(sRad)}) = ${fmt3sf(sq.minSpeedTopMs, "m s⁻¹")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the ${sForceName} when the mass passes through the highest point at ${fmtGiven(sSpeed, "m s⁻¹")}.`,
        marks: 2,
        targetQuantityKey: "supportForceTopN",
        expectedAnswer: fmt3sf(sq.supportForceTopN, "N"),
        workingSteps: [
          `At the top, F_top + mg = m v² / R.`,
          `F_top = ${fmtGiven(sMass)} × ((${fmtGiven(sSpeed)})² / ${fmtGiven(sRad)} − ${fmtGiven(g)}) = ${fmt3sf(sq.supportForceTopN, "N")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the ${sForceName} when the mass passes through the lowest point at ${fmtGiven(sSpeed, "m s⁻¹")}.`,
        marks: 2,
        targetQuantityKey: "supportForceBottomN",
        expectedAnswer: fmt3sf(sq.supportForceBottomN, "N"),
        workingSteps: [
          `At the bottom, F_bot − mg = m v² / R.`,
          `F_bot = ${fmtGiven(sMass)} × ((${fmtGiven(sSpeed)})² / ${fmtGiven(sRad)} + ${fmtGiven(g)}) = ${fmt3sf(sq.supportForceBottomN, "N")}.`,
        ],
      },
    ],
    workedSolution: `(a) Critical apex speed v_min = √(gR) = ${fmt3sf(sq.minSpeedTopMs, "m s⁻¹")}. (b) At the top, F_top = m(v²/R − g) = ${fmt3sf(sq.supportForceTopN, "N")}. (c) At the bottom, F_bot = m(v²/R + g) = ${fmt3sf(sq.supportForceBottomN, "N")}.`,
    markScheme: [
      { code: "M1", partId: "a", criterion: "Sets support force to zero at apex so mg = m v_min² / R.", marks: 1 },
      { code: "A1", partId: "a", criterion: `Obtains ${fmt3sf(sq.minSpeedTopMs, "m s⁻¹")}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Subtracts mg from m v² / R at the top.", marks: 1 },
      { code: "A1", partId: "b", criterion: `Obtains ${fmt3sf(sq.supportForceTopN, "N")}.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Adds mg to m v² / R at the bottom.", marks: 1 },
      { code: "A1", partId: "c", criterion: `Obtains ${fmt3sf(sq.supportForceBottomN, "N")}.`, marks: 1 },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// 5. VERTICAL CIRCLE — ENERGY CONSERVING ("uniform-circular-motion", "vertical-circle-energy-loop-the-loop")
// ============================================================================

function buildVerticalCircleEnergyItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  const isIb = variantIndex % 2 === 0;
  const g = isIb ? 9.8 : 9.81;
  const syllabi = resolveSyllabiTags({
    conceptId: "uniform-circular-motion",
    format,
    variantIndex,
    gravityRegime: isIb ? "ib" : "metric981",
  });

  const constraintKind = variantIndex % 3 === 0 ? ("string" as const) : ("inside-track" as const);
  const masses = [0.2, 0.35, 0.5, 0.8, 1.2, 1.8, 45, 120, 240, 360];
  const radii = [0.45, 0.6, 0.85, 1.2, 1.6, 2.5, 4.2, 6.5, 9.0, 12.5];
  const massKg = perturbCycle(
    masses[(variantIndex + rng.nextInt(0, 1)) % masses.length],
    variantIndex,
    masses.length,
  );
  const radiusM = perturbCycle(
    radii[(variantIndex * 3 + rng.nextInt(0, 1)) % radii.length],
    variantIndex,
    radii.length,
  );
  const vMinBot = Math.sqrt(5 * g * radiusM);
  const mult = [1.1, 1.16, 1.22, 1.28, 1.35, 1.44, 1.52][variantIndex % 7];
  const referenceSpeedMs = Number((vMinBot * mult).toPrecision(3));

  const spec: VerticalCircleScenario = {
    kind: "vertical-circle",
    id,
    massKg,
    radiusM,
    motionMode: "energy-conserving",
    constraintKind,
    referencePosition: "bottom",
    referenceSpeedMs,
    gravityMs2: g,
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const difficulty = pickDifficulty(variantIndex, "higher");

  const rigs = [
    { item: "frictionless coaster bogie", path: "an inverted steel loop-the-loop" },
    { item: "hardened steel ball bearing", path: "a smooth vertical loop track" },
    { item: "low-friction maglev test sled", path: "a vertical circular guide ring" },
    { item: "acrylic demonstration glider", path: "a vertical lecture-bench loop" },
    { item: "pendulum impact bob", path: "a full vertical circular arc" },
    { item: "skatepark test trolley", path: "a smooth circular vertical cradle" },
    { item: "precision titanium sphere", path: "a polished vertical circular chute" },
    { item: "gravity-fed capsule car", path: "a circular vertical inversion loop" },
  ] as const;
  const rig = rigs[variantIndex % rigs.length];
  const forceLabel = constraintKind === "string" ? "string tension" : "normal contact force";

  if (format === "mcq") {
    const mode = variantIndex % 3;
    if (mode === 0) {
      // Target: speedTopMs = sqrt(v_bot^2 - 4 g R)
      const truth = q.speedTopMs;
      const stems = [
        `An unpowered ${rig.item} of mass ${fmtGiven(massKg, "kg")} enters the bottom of ${rig.path} of radius ${fmtGiven(radiusM, "m")} with speed ${fmtGiven(referenceSpeedMs, "m s⁻¹")}. Mechanical energy is conserved; take g = ${fmtGiven(g, "m s⁻²")}. What is its speed at the highest point of the circle?`,
        `Coasting without friction, a ${fmtGiven(massKg, "kg")} ${rig.item} passes the lowest point of ${rig.path} (radius ${fmtGiven(radiusM, "m")}) at ${fmtGiven(referenceSpeedMs, "m s⁻¹")} where g = ${fmtGiven(g, "m s⁻²")}. Calculate its speed as it crosses the apex.`,
        `At the base of ${rig.path} of radius ${fmtGiven(radiusM, "m")}, an unpowered ${fmtGiven(massKg, "kg")} ${rig.item} has horizontal speed ${fmtGiven(referenceSpeedMs, "m s⁻¹")}. Neglecting resistive losses and taking g = ${fmtGiven(g, "m s⁻²")}, find its speed at the top of the loop.`,
        `Conserving mechanical energy throughout ${rig.path} of radius ${fmtGiven(radiusM, "m")}, a ${fmtGiven(massKg, "kg")} ${rig.item} enters at the bottom with speed ${fmtGiven(referenceSpeedMs, "m s⁻¹")} (g = ${fmtGiven(g, "m s⁻²")}). Determine the speed at the summit of the loop.`,
      ];
      const options = buildNumericMcqOptions(truth, "m s⁻¹", [
        {
          value: Math.sqrt(Math.max(0.1, referenceSpeedMs ** 2 - 2 * g * radiusM)),
          rationale: "Uses height gain Δh = R (giving v_bot² − 2gR) instead of the full loop diameter Δh = 2R (v_bot² − 4gR).",
        },
        {
          value: Math.sqrt(referenceSpeedMs ** 2 + 4 * g * radiusM),
          rationale: "Adds 4gR instead of subtracting 4gR during upward ascent to the apex.",
        },
        {
          value: q.minSpeedTopMs,
          rationale: "Assumes the apex speed equals the minimum critical value √(gR) regardless of initial bottom kinetic energy.",
        },
        {
          value: referenceSpeedMs - Math.sqrt(4 * g * radiusM),
          rationale: "Subtracts √(4gR) linearly from v_bot instead of applying conservation of energy to v².",
        },
      ]);
      return {
        id,
        conceptId: "uniform-circular-motion",
        templateArchetype: "vertical-circle-energy-loop-the-loop",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["speedTopMs", "supportForceTopN", "supportForceBottomN", "minSpeedTopMs", "minSpeedBottomLoopMs"],
        targetQuantityKey: "speedTopMs",
        questionPlan: buildDigitFreePlan(
          "Apply mechanical energy conservation across full loop diameter to find apex speed",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 1),
        options,
        workedSolution: `Rising from bottom to top increases height by Δh = 2R. By conservation of energy, ½m v_top² + mg(2R) = ½m v_bot², so v_top = √(v_bot² − 4gR) = √((${fmtGiven(referenceSpeedMs)})² − 4 × ${fmtGiven(g)} × ${fmtGiven(radiusM)}) = ${fmt3sf(truth, "m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses Δh = 2R in v_top = √(v_bot² − 4gR) to obtain ${fmt3sf(truth, "m s⁻¹")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (mode === 1) {
      // Target: supportForceTopN = m(v_bot^2 / R - 5g)
      const truth = q.supportForceTopN;
      const stems = [
        `Moving without friction or propulsion, a ${fmtGiven(massKg, "kg")} ${rig.item} passes the lowest point of ${rig.path} (radius ${fmtGiven(radiusM, "m")}) at ${fmtGiven(referenceSpeedMs, "m s⁻¹")}. Take g = ${fmtGiven(g, "m s⁻²")}. Determine the ${forceLabel} acting on it at the highest point.`,
        `An unpowered ${fmtGiven(massKg, "kg")} ${rig.item} enters the bottom of ${rig.path} of radius ${fmtGiven(radiusM, "m")} at ${fmtGiven(referenceSpeedMs, "m s⁻¹")} under energy-conserving conditions (g = ${fmtGiven(g, "m s⁻²")}). What ${forceLabel} acts on it at the apex?`,
        `With negligible drag, a ${fmtGiven(massKg, "kg")} ${rig.item} sweeps through the bottom of ${rig.path} (radius ${fmtGiven(radiusM, "m")}) at ${fmtGiven(referenceSpeedMs, "m s⁻¹")}. Using g = ${fmtGiven(g, "m s⁻²")}, calculate the ${forceLabel} at the top of the circle.`,
        `Climbing ${rig.path} of radius ${fmtGiven(radiusM, "m")} from a bottom speed of ${fmtGiven(referenceSpeedMs, "m s⁻¹")} without energy loss (g = ${fmtGiven(g, "m s⁻²")}), what ${forceLabel} does a ${fmtGiven(massKg, "kg")} ${rig.item} experience at the summit?`,
      ];
      const options = buildNumericMcqOptions(truth, "N", [
        {
          value: massKg * (q.speedTopMs ** 2 / radiusM + g),
          rationale: "Adds weight mg instead of subtracting mg from m v_top² / R at the apex of the loop.",
        },
        {
          value: massKg * ((referenceSpeedMs ** 2 - 2 * g * radiusM) / radiusM - g),
          rationale: "Uses Δh = R rather than 2R when finding v_top², leading to m(v_bot²/R − 3g) instead of m(v_bot²/R − 5g).",
        },
        {
          value: massKg * (referenceSpeedMs ** 2 / radiusM - g),
          rationale: "Uses the bottom entry speed directly at the top without accounting for gravitational deceleration.",
        },
        {
          value: q.centripetalForceTopN,
          rationale: "Computes net centripetal force m v_top² / R at the apex and forgets to subtract mg.",
        },
      ]);
      return {
        id,
        conceptId: "uniform-circular-motion",
        templateArchetype: "vertical-circle-energy-loop-the-loop",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["speedTopMs", "supportForceTopN", "supportForceBottomN", "centripetalForceTopN"],
        targetQuantityKey: "supportForceTopN",
        questionPlan: buildDigitFreePlan(
          "Combine energy conservation with apex radial force balance to determine top support force",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 2),
        options,
        workedSolution: `At the top, v_top² = v_bot² − 4gR = (${fmtGiven(referenceSpeedMs)})² − 4(${fmtGiven(g)})(${fmtGiven(radiusM)}) = ${fmt3sf(q.speedTopMs ** 2, "m² s⁻²")}. Radial force balance F_top + mg = m v_top² / R gives F_top = ${fmtGiven(massKg)}(${fmt3sf(q.speedTopMs ** 2)} / ${fmtGiven(radiusM)} − ${fmtGiven(g)}) = ${fmt3sf(truth, "N")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Combines v_top² = v_bot² − 4gR with F_top = m(v_top²/R − g) to obtain ${fmt3sf(truth, "N")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // mode === 2: minSpeedBottomLoopMs = sqrt(5 g R)
    const truth = q.minSpeedBottomLoopMs;
    const stems = [
      `In a test run on ${rig.path} of radius ${fmtGiven(radiusM, "m")}, a ${fmtGiven(massKg, "kg")} ${rig.item} enters the bottom at ${fmtGiven(referenceSpeedMs, "m s⁻¹")} with negligible friction (g = ${fmtGiven(g, "m s⁻²")}). What is the minimum bottom entry speed that would still allow it to complete the full vertical loop without losing contact at the top?`,
      `A ${fmtGiven(massKg, "kg")} ${rig.item} currently enters ${rig.path} of radius ${fmtGiven(radiusM, "m")} at ${fmtGiven(referenceSpeedMs, "m s⁻¹")} under frictionless conditions (g = ${fmtGiven(g, "m s⁻²")}). Calculate the critical minimum speed at the bottom required to just clear the apex.`,
      `For an unpowered ${fmtGiven(massKg, "kg")} ${rig.item} on ${rig.path} of vertical radius ${fmtGiven(radiusM, "m")} (operating entry speed ${fmtGiven(referenceSpeedMs, "m s⁻¹")}, g = ${fmtGiven(g, "m s⁻²")}), find the least bottom speed needed so ${forceLabel} does not vanish before the top.`,
      `Neglecting drag on ${rig.path} of radius ${fmtGiven(radiusM, "m")} where a ${fmtGiven(massKg, "kg")} ${rig.item} enters at ${fmtGiven(referenceSpeedMs, "m s⁻¹")}, determine the threshold bottom speed √(5gR) required to complete the circle (g = ${fmtGiven(g, "m s⁻²")}).`,
    ];
    const options = buildNumericMcqOptions(truth, "m s⁻¹", [
      {
        value: Math.sqrt(4 * g * radiusM),
        rationale: "Sets apex speed to zero (v_bot = √(4gR)) instead of requiring v_top ≥ √(gR) to maintain contact.",
      },
      {
        value: q.minSpeedTopMs,
        rationale: "Quotes the minimum apex speed √(gR) instead of the minimum bottom entry speed √(5gR).",
      },
      {
        value: Math.sqrt(3 * g * radiusM),
        rationale: "Uses Δh = R instead of 2R alongside v_top = √(gR), obtaining √(3gR).",
      },
      {
        value: 5 * g * radiusM,
        rationale: "Computes v_bot,min² = 5gR without taking the square root.",
      },
    ]);
    return {
      id,
      conceptId: "uniform-circular-motion",
      templateArchetype: "vertical-circle-energy-loop-the-loop",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: ["speedTopMs", "minSpeedTopMs", "minSpeedBottomLoopMs", "supportForceTopN"],
      targetQuantityKey: "minSpeedBottomLoopMs",
      questionPlan: buildDigitFreePlan(
        "Combine critical apex contact condition with energy conservation to find minimum bottom loop entry speed",
        "mcq",
      ),
      stem: pickTemplate(stems, variantIndex, 3),
      options,
      workedSolution: `Maintaining contact at the apex requires v_top ≥ √(gR). Conservation of energy from bottom to top (Δh = 2R) gives ½m v_bot,min² = ½m(gR) + mg(2R) => v_bot,min = √(5gR) = √(5 × ${fmtGiven(g)} × ${fmtGiven(radiusM)}) = ${fmt3sf(truth, "m s⁻¹")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates v_bot,min = √(5gR) = ${fmt3sf(truth, "m s⁻¹")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (6 marks)
  const structStems = [
    `An unpowered ${rig.item} of mass ${fmtGiven(massKg, "kg")} enters the bottom of ${rig.path} of radius ${fmtGiven(radiusM, "m")} with horizontal speed ${fmtGiven(referenceSpeedMs, "m s⁻¹")}. Resistive forces are negligible; take g = ${fmtGiven(g, "m s⁻²")}.`,
    `Coasting without propulsion or drag, a ${fmtGiven(massKg, "kg")} ${rig.item} passes through the lowest point of ${rig.path} (radius ${fmtGiven(radiusM, "m")}) at speed ${fmtGiven(referenceSpeedMs, "m s⁻¹")}. Use g = ${fmtGiven(g, "m s⁻²")}.`,
    `In a vertical-loop mechanics experiment, a ${fmtGiven(massKg, "kg")} ${rig.item} is launched horizontally at ${fmtGiven(referenceSpeedMs, "m s⁻¹")} into the base of ${rig.path} of radius ${fmtGiven(radiusM, "m")} where friction is negligible (g = ${fmtGiven(g, "m s⁻²")}).`,
    `The diagram illustrates ${rig.path} of radius ${fmtGiven(radiusM, "m")}. An unpowered ${fmtGiven(massKg, "kg")} ${rig.item} enters at the nadir with speed ${fmtGiven(referenceSpeedMs, "m s⁻¹")} and conserves mechanical energy throughout (g = ${fmtGiven(g, "m s⁻²")}).`,
  ];
  return {
    id,
    conceptId: "uniform-circular-motion",
    templateArchetype: "vertical-circle-energy-loop-the-loop",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: ["speedTopMs", "supportForceTopN", "supportForceBottomN", "minSpeedTopMs", "minSpeedBottomLoopMs"],
    questionPlan: buildDigitFreePlan(
      "Analyse energy-conserving vertical loop motion from apex speed to apex normal force and minimum bottom entry speed",
      "structured",
      ["compute-apex-speed-by-energy", "evaluate-apex-support-force", "derive-minimum-bottom-entry-speed"],
    ),
    stem: pickTemplate(structStems, variantIndex),
    parts: [
      {
        partId: "a",
        prompt: `Calculate the speed of the ${rig.item} as it passes the highest point of the loop.`,
        marks: 2,
        targetQuantityKey: "speedTopMs",
        expectedAnswer: fmt3sf(q.speedTopMs, "m s⁻¹"),
        workingSteps: [
          `Conservation of mechanical energy with Δh = 2R gives v_top² = v_bot² − 4gR.`,
          `v_top = √((${fmtGiven(referenceSpeedMs)})² − 4 × ${fmtGiven(g)} × ${fmtGiven(radiusM)}) = ${fmt3sf(q.speedTopMs, "m s⁻¹")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Determine the magnitude of the ${forceLabel} acting on the ${rig.item} at the highest point.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "supportForceTopN",
        expectedAnswer: fmt3sf(q.supportForceTopN, "N"),
        workingSteps: [
          `At the apex, F_top + mg = m v_top² / R.`,
          `F_top = ${fmtGiven(massKg)} × ((${fmt3sf(q.speedTopMs)})² / ${fmtGiven(radiusM)} − ${fmtGiven(g)}) = ${fmt3sf(q.supportForceTopN, "N")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Calculate the minimum speed at the bottom of the loop required to complete the circle without losing contact at the top.`,
        marks: 2,
        targetQuantityKey: "minSpeedBottomLoopMs",
        expectedAnswer: fmt3sf(q.minSpeedBottomLoopMs, "m s⁻¹"),
        workingSteps: [
          `At threshold contact, v_top = √(gR), so v_bot,min = √(gR + 4gR) = √(5gR).`,
          `v_bot,min = √(5 × ${fmtGiven(g)} × ${fmtGiven(radiusM)}) = ${fmt3sf(q.minSpeedBottomLoopMs, "m s⁻¹")}.`,
        ],
      },
    ],
    workedSolution: `(a) Using ½mv_bot² = ½mv_top² + mg(2R), v_top = √(v_bot² − 4gR) = ${fmt3sf(q.speedTopMs, "m s⁻¹")}. (b) Downward radial balance F_top + mg = mv_top²/R gives F_top = ${fmt3sf(q.supportForceTopN, "N")}. (c) Setting F_top = 0 gives v_top = √(gR) and v_bot,min = √(5gR) = ${fmt3sf(q.minSpeedBottomLoopMs, "m s⁻¹")}.`,
    markScheme: [
      { code: "M1", partId: "a", criterion: "Applies energy conservation with vertical rise Δh = 2R.", marks: 1 },
      { code: "A1", partId: "a", criterion: `Obtains v_top = ${fmt3sf(q.speedTopMs, "m s⁻¹")}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Uses F_top = m(v_top²/R − g) at the apex.", marks: 1 },
      { code: "A1", partId: "b", criterion: `Obtains F_top = ${fmt3sf(q.supportForceTopN, "N")}.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Combines v_top,min² = gR with v_bot,min² = v_top,min² + 4gR.", marks: 1 },
      { code: "A1", partId: "c", criterion: `Obtains v_bot,min = ${fmt3sf(q.minSpeedBottomLoopMs, "m s⁻¹")}.`, marks: 1 },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// 6. PLANETARY EXTERIOR & INTERIOR FIELD ("gravitational-force-field", "planetary-exterior-interior-field")
// ============================================================================

function buildPlanetaryFieldItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  const isInterior = variantIndex % 3 === 2;
  const syllabi = resolveSyllabiTags({
    conceptId: "gravitational-force-field",
    format,
    variantIndex,
    excludeNcuk: isInterior,
  });

  const massScales = [0.35, 0.55, 0.8, 1.2, 1.6, 2.1, 2.8, 3.6, 4.5, 5.8];
  const radScales = [0.55, 0.75, 0.9, 1.15, 1.35, 1.6, 1.85, 2.1];
  const centralMassKg = perturbCycle(
    Number((EARTH_MASS_KG * massScales[(variantIndex + rng.nextInt(0, 1)) % massScales.length]).toPrecision(3)),
    variantIndex,
    massScales.length,
  );
  const planetRadiusM = perturbCycle(
    Number((EARTH_RADIUS_M * radScales[(variantIndex * 3 + rng.nextInt(0, 1)) % radScales.length]).toPrecision(3)),
    variantIndex,
    radScales.length,
  );

  const probeFactor = isInterior
    ? [0.25, 0.4, 0.55, 0.65, 0.75][variantIndex % 5]
    : [1.5, 1.8, 2.2, 2.5, 3.0, 3.5, 4.1][variantIndex % 7];
  const probeRadiusM = Number((planetRadiusM * probeFactor).toPrecision(3));
  const testMassKg = perturbCycle([120, 180, 250, 360, 480, 650, 820, 950][variantIndex % 8], variantIndex, 8);

  const spec: PlanetaryFieldPotentialScenario = {
    kind: "planetary-field-potential",
    id,
    centralMassKg,
    planetRadiusM,
    probeRadiusM,
    testMassKg,
    plotQuantity: "field-strength",
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const ctx = PLANET_CONTEXTS[(variantIndex * 5) % PLANET_CONTEXTS.length];
  const difficulty = pickDifficulty(variantIndex, isInterior ? "higher" : "balanced");

  if (format === "mcq") {
    const askForce = !isInterior && variantIndex % 2 === 1;
    const truth = askForce ? q.gravitationalForceN : q.fieldStrengthNkg;
    const unit = askForce ? "N" : "N kg⁻¹";

    const interiorStems = [
      `Model a ${ctx.planet} as a sphere of uniform density with total mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}. A ${ctx.probe} of mass ${fmtGiven(testMassKg, "kg")} descends along a radial borehole to distance ${fmtGiven(probeRadiusM, "m")} from the planet's centre. Take G = 6.67 × 10⁻¹¹ N m² kg⁻². What is the gravitational field strength at this interior point?`,
      `Inside a uniform-density ${ctx.planet} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(planetRadiusM, "m")}), a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} reaches radial distance ${fmtGiven(probeRadiusM, "m")} from the planetary centre (G = 6.67 × 10⁻¹¹ N m² kg⁻²). Calculate the local gravitational field strength.`,
      `Assuming uniform internal density throughout a spherical ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}, find the gravitational field strength experienced by a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} at interior radius ${fmtGiven(probeRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
      `A radial drill shaft inside a uniform spherical ${ctx.planet} (total mass ${fmtGiven(centralMassKg, "kg")}, surface radius ${fmtGiven(planetRadiusM, "m")}) stations a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} at r = ${fmtGiven(probeRadiusM, "m")} from the centre. Using G = 6.67 × 10⁻¹¹ N m² kg⁻², determine g(r).`,
    ];
    const forceStems = [
      `A ${ctx.probe} of mass ${fmtGiven(testMassKg, "kg")} is positioned at a radial distance of ${fmtGiven(probeRadiusM, "m")} from the centre of a spherical ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻². What is the magnitude of the gravitational force acting on the ${ctx.probe}?`,
      `Outside a spherical ${ctx.planet} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(planetRadiusM, "m")}), a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} operates at centre-to-centre distance ${fmtGiven(probeRadiusM, "m")}. Taking G = 6.67 × 10⁻¹¹ N m² kg⁻², calculate the gravitational pull on the ${ctx.probe}.`,
      `At distance ${fmtGiven(probeRadiusM, "m")} from the centre of a ${fmtGiven(centralMassKg, "kg")} spherical ${ctx.planet} (radius ${fmtGiven(planetRadiusM, "m")}), what gravitational attraction acts on a ${fmtGiven(testMassKg, "kg")} ${ctx.probe}? Use G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
      `Determine the Newtonian gravitational force exerted on a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} located at radial coordinate ${fmtGiven(probeRadiusM, "m")} outside a ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
    ];
    const extFieldStems = [
      `Orbiting outside a spherical ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}, a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} samples the field at radial distance ${fmtGiven(probeRadiusM, "m")} from the planet's centre (G = 6.67 × 10⁻¹¹ N m² kg⁻²). Determine the gravitational field strength at this location.`,
      `A spherical ${ctx.planet} has mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}. What is the gravitational field strength at an exterior ${fmtGiven(testMassKg, "kg")} ${ctx.probe} situated ${fmtGiven(probeRadiusM, "m")} from the centre? Take G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
      `Telemetry from a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} at radial distance ${fmtGiven(probeRadiusM, "m")} from the centre of a ${ctx.planet} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(planetRadiusM, "m")}) measures local gravity. Using G = 6.67 × 10⁻¹¹ N m² kg⁻², calculate g.`,
      `Find the magnitude of the gravitational field at radial coordinate r = ${fmtGiven(probeRadiusM, "m")} outside a ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}, where a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} is stationed (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
    ];

    const stem = isInterior
      ? pickTemplate(interiorStems, variantIndex, 1)
      : askForce
        ? pickTemplate(forceStems, variantIndex, 2)
        : pickTemplate(extFieldStems, variantIndex, 3);

    const options = isInterior
      ? buildNumericMcqOptions(truth, unit, [
          {
            value: (GRAVITATIONAL_CONSTANT * centralMassKg) / probeRadiusM ** 2,
            rationale: "Applies the exterior point-mass formula GM / r² inside the sphere instead of accounting for enclosed mass M(r/R)³.",
          },
          {
            value: q.surfaceFieldNkg,
            rationale: "Assumes gravitational field strength inside a uniform sphere remains equal to the surface value GM / R².",
          },
          {
            value: (GRAVITATIONAL_CONSTANT * centralMassKg * probeRadiusM ** 2) / planetRadiusM ** 4,
            rationale: "Scales surface field by (r/R)² instead of the linear interior dependence g₀(r/R).",
          },
          {
            value: q.gravitationalForceN,
            rationale: "Multiplies field strength by probe mass to obtain gravitational force in newtons rather than field strength in N kg⁻¹.",
          },
        ])
      : askForce
        ? buildNumericMcqOptions(truth, unit, [
            {
              value: (GRAVITATIONAL_CONSTANT * centralMassKg * testMassKg) / (probeRadiusM - planetRadiusM) ** 2,
              rationale: "Substitutes altitude h = r − R above the surface instead of centre-to-centre distance r in F = GMm / r².",
            },
            {
              value: q.fieldStrengthNkg,
              rationale: "Calculates gravitational field strength GM / r² without multiplying by the probe mass m.",
            },
            {
              value: (GRAVITATIONAL_CONSTANT * centralMassKg * testMassKg) / probeRadiusM,
              rationale: "Uses 1/r instead of 1/r², computing gravitational potential energy magnitude GMm / r rather than force.",
            },
            {
              value: testMassKg * q.surfaceFieldNkg,
              rationale: "Evaluates weight at the planet's surface R rather than at radial distance r.",
            },
          ])
        : buildNumericMcqOptions(truth, unit, [
            {
              value: (GRAVITATIONAL_CONSTANT * centralMassKg) / (probeRadiusM - planetRadiusM) ** 2,
              rationale: "Uses altitude above the surface (r − R) instead of radial distance r from the planet's centre.",
            },
            {
              value: q.surfaceFieldNkg,
              rationale: "Evaluates surface field strength GM / R² instead of field strength at probe radius r.",
            },
            {
              value: (GRAVITATIONAL_CONSTANT * centralMassKg) / probeRadiusM,
              rationale: "Omits squaring r in the denominator, computing |V_g| = GM / r instead of g = GM / r².",
            },
            {
              value: q.gravitationalForceN,
              rationale: "Multiplies by test mass to compute force F = GMm / r² instead of field strength g = GM / r².",
            },
          ]);

    return {
      id,
      conceptId: "gravitational-force-field",
      templateArchetype: "planetary-exterior-interior-field",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "surfaceFieldNkg",
        "fieldStrengthNkg",
        "gravitationalForceN",
        "enclosedMassKg",
      ],
      targetQuantityKey: askForce ? "gravitationalForceN" : "fieldStrengthNkg",
      questionPlan: buildDigitFreePlan(
        isInterior
          ? "Apply shell theorem and uniform-sphere enclosed mass scaling to find interior gravitational field"
          : "Apply Newton inverse-square gravitation from planetary centre to determine exterior field or force",
        "mcq",
      ),
      stem,
      options,
      workedSolution: isInterior
        ? `Inside a uniform sphere (r < R), enclosed mass M_enc = M(r/R)³, so g(r) = G M r / R³ = (6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)} × ${fmtGiven(probeRadiusM)}) / (${fmtGiven(planetRadiusM)})³ = ${fmt3sf(truth, unit)}.`
        : askForce
          ? `F = G M m / r² = (6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)} × ${fmtGiven(testMassKg)}) / (${fmtGiven(probeRadiusM)})² = ${fmt3sf(truth, unit)}.`
          : `g = G M / r² = (6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)}) / (${fmtGiven(probeRadiusM)})² = ${fmt3sf(truth, unit)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates gravitational ${askForce ? "force" : "field strength"} at r = ${fmtGiven(probeRadiusM, "m")} to obtain ${fmt3sf(truth, unit)}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (6 marks)
  const structStems = isInterior
    ? [
        `A ${ctx.planet} of uniform density has mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}. A ${ctx.probe} of mass ${fmtGiven(testMassKg, "kg")} is lowered into a deep radial shaft to distance ${fmtGiven(probeRadiusM, "m")} from the centre. Take G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
        `Modelling a spherical ${ctx.planet} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(planetRadiusM, "m")}) with constant density throughout, engineers lower a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} to interior radial distance ${fmtGiven(probeRadiusM, "m")} from the centre (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
        `Inside a uniform-density ${ctx.planet} of total mass ${fmtGiven(centralMassKg, "kg")} and surface radius ${fmtGiven(planetRadiusM, "m")}, a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} takes gravimetric readings at r = ${fmtGiven(probeRadiusM, "m")} from the centre. Use G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
      ]
    : [
        `A spherical ${ctx.planet} has mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}. A ${ctx.probe} of mass ${fmtGiven(testMassKg, "kg")} operates at radial distance ${fmtGiven(probeRadiusM, "m")} from the centre of the planet. Take G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
        `Outside a spherical ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}, a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} maintains radial coordinate ${fmtGiven(probeRadiusM, "m")} from the planetary centre (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
        `Gravimetry data are collected by a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} stationed at centre-to-centre distance ${fmtGiven(probeRadiusM, "m")} from a ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}. Use G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
        `The radial profile diagram shows a spherical ${ctx.planet} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(planetRadiusM, "m")}) and an exterior ${fmtGiven(testMassKg, "kg")} ${ctx.probe} at r = ${fmtGiven(probeRadiusM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
      ];
  return {
    id,
    conceptId: "gravitational-force-field",
    templateArchetype: "planetary-exterior-interior-field",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: ["surfaceFieldNkg", "fieldStrengthNkg", "gravitationalForceN", "enclosedMassKg"],
    questionPlan: buildDigitFreePlan(
      "Determine surface gravitational field, radial probe field strength, and force on a test mass",
      "structured",
      ["calculate-surface-field-strength", "evaluate-radial-probe-field", "determine-gravitational-force-on-probe"],
    ),
    stem: pickTemplate(structStems, variantIndex),
    parts: [
      {
        partId: "a",
        prompt: `Calculate the gravitational field strength at the surface of the ${ctx.planet}.`,
        marks: 2,
        targetQuantityKey: "surfaceFieldNkg",
        expectedAnswer: fmt3sf(q.surfaceFieldNkg, "N kg⁻¹"),
        workingSteps: [
          `g₀ = G M / R² = (6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)}) / (${fmtGiven(planetRadiusM)})² = ${fmt3sf(q.surfaceFieldNkg, "N kg⁻¹")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Determine the gravitational field strength at the ${ctx.probe}'s radial position r = ${fmtGiven(probeRadiusM, "m")}.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "fieldStrengthNkg",
        expectedAnswer: fmt3sf(q.fieldStrengthNkg, "N kg⁻¹"),
        workingSteps: isInterior
          ? [
              `For a uniform sphere with r < R, g(r) = g₀ (r / R) = G M r / R³.`,
              `g = ${fmt3sf(q.surfaceFieldNkg)} × (${fmtGiven(probeRadiusM)} / ${fmtGiven(planetRadiusM)}) = ${fmt3sf(q.fieldStrengthNkg, "N kg⁻¹")}.`,
            ]
          : [
              `Outside the sphere (r > R), g(r) = G M / r².`,
              `g = (6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)}) / (${fmtGiven(probeRadiusM)})² = ${fmt3sf(q.fieldStrengthNkg, "N kg⁻¹")}.`,
            ],
      },
      {
        partId: "c",
        prompt: `Calculate the magnitude of the gravitational force acting on the ${fmtGiven(testMassKg, "kg")} ${ctx.probe} at this position.`,
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "gravitationalForceN",
        expectedAnswer: fmt3sf(q.gravitationalForceN, "N"),
        workingSteps: [
          `F = m g(r) = ${fmtGiven(testMassKg)} × ${fmt3sf(q.fieldStrengthNkg)} = ${fmt3sf(q.gravitationalForceN, "N")}.`,
        ],
      },
    ],
    workedSolution: `(a) Surface field g₀ = GM/R² = ${fmt3sf(q.surfaceFieldNkg, "N kg⁻¹")}. (b) At r = ${fmtGiven(probeRadiusM, "m")}, ${isInterior ? "uniform-sphere interior scaling g = g₀(r/R)" : "inverse-square scaling g = GM/r²"} gives ${fmt3sf(q.fieldStrengthNkg, "N kg⁻¹")}. (c) Force on probe F = mg = ${fmt3sf(q.gravitationalForceN, "N")}.`,
    markScheme: [
      { code: "M1", partId: "a", criterion: "Substitutes M and R into g₀ = GM / R².", marks: 1 },
      { code: "A1", partId: "a", criterion: `Obtains g₀ = ${fmt3sf(q.surfaceFieldNkg, "N kg⁻¹")}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: isInterior ? "Applies linear interior field law g(r) = GMr/R³." : "Applies exterior inverse-square law g(r) = GM/r².", marks: 1 },
      { code: "A1", partId: "b", criterion: `Obtains g = ${fmt3sf(q.fieldStrengthNkg, "N kg⁻¹")}.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Multiplies probe mass by field strength at r.", marks: 1 },
      { code: "A1", partId: "c", criterion: `Obtains F = ${fmt3sf(q.gravitationalForceN, "N")}.`, marks: 1 },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// 7. PLANETARY POTENTIAL & ESCAPE ("gravitational-potential-orbits", "planetary-potential-and-escape")
// ============================================================================

function buildPlanetaryPotentialItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  // Strictly IB HL + A-Level Y13 + NCUK IFY via getCompatibleSyllabiForConcept("gravitational-potential-orbits")
  const syllabi = resolveSyllabiTags({
    conceptId: "gravitational-potential-orbits",
    format,
    variantIndex,
  });

  const massScales = [0.25, 0.45, 0.7, 1.1, 1.5, 2.2, 3.1, 4.4, 6.2];
  const radScales = [0.5, 0.7, 0.85, 1.1, 1.3, 1.55, 1.8, 2.2];
  const probeFactors = [1.4, 1.75, 2.1, 2.6, 3.2, 3.8, 4.5];

  const centralMassKg = perturbCycle(
    Number((EARTH_MASS_KG * massScales[(variantIndex + rng.nextInt(0, 1)) % massScales.length]).toPrecision(3)),
    variantIndex,
    massScales.length,
  );
  const planetRadiusM = perturbCycle(
    Number((EARTH_RADIUS_M * radScales[(variantIndex * 3 + rng.nextInt(0, 1)) % radScales.length]).toPrecision(3)),
    variantIndex,
    radScales.length,
  );
  const probeRadiusM = Number((planetRadiusM * probeFactors[variantIndex % probeFactors.length]).toPrecision(3));
  const testMassKg = perturbCycle([150, 240, 350, 460, 620, 780, 900][variantIndex % 7], variantIndex, 7);

  const spec: PlanetaryFieldPotentialScenario = {
    kind: "planetary-field-potential",
    id,
    centralMassKg,
    planetRadiusM,
    probeRadiusM,
    testMassKg,
    plotQuantity: "potential",
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const ctx = PLANET_CONTEXTS[(variantIndex * 7 + 3) % PLANET_CONTEXTS.length];
  const difficulty = pickDifficulty(variantIndex, "higher");

  if (format === "mcq") {
    const mode = variantIndex % 3;
    if (mode === 0) {
      // gravitationalPotentialJkg = -GM / r
      const truth = q.gravitationalPotentialJkg;
      const stems = [
        `A ${ctx.probe} of mass ${fmtGiven(testMassKg, "kg")} is located at radial distance ${fmtGiven(probeRadiusM, "m")} from the centre of an airless ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}. Taking G = 6.67 × 10⁻¹¹ N m² kg⁻² and potential to be zero at infinity, what is the gravitational potential at the ${ctx.probe}'s position?`,
        `Outside a spherical ${ctx.planet} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(planetRadiusM, "m")}), a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} sits at distance ${fmtGiven(probeRadiusM, "m")} from the centre. With V_g = 0 at infinity and G = 6.67 × 10⁻¹¹ N m² kg⁻², calculate the gravitational potential there.`,
        `Determine the scalar gravitational potential V_g (relative to zero at infinity) at a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} positioned ${fmtGiven(probeRadiusM, "m")} from the centre of a ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
        `Telemetry from a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} at radial coordinate r = ${fmtGiven(probeRadiusM, "m")} outside an airless ${ctx.planet} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(planetRadiusM, "m")}) references potential to zero at infinity. Using G = 6.67 × 10⁻¹¹ N m² kg⁻², find V_g(r).`,
      ];
      const options = buildNumericMcqOptions(truth, "J kg⁻¹", [
        {
          value: -truth,
          rationale: "Omits the negative sign required when gravitational potential is defined relative to zero at infinity.",
        },
        {
          value: q.surfacePotentialJkg,
          rationale: "Evaluates surface potential −GM / R instead of potential at radial distance r.",
        },
        {
          value: -(GRAVITATIONAL_CONSTANT * centralMassKg) / (probeRadiusM - planetRadiusM),
          rationale: "Substitutes altitude (r − R) instead of radial distance r from the planet's centre.",
        },
        {
          value: -q.fieldStrengthNkg,
          rationale: "Divides by r² rather than r, confusing gravitational field magnitude with potential.",
        },
      ]);
      return {
        id,
        conceptId: "gravitational-potential-orbits",
        templateArchetype: "planetary-potential-and-escape",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["gravitationalPotentialJkg", "surfacePotentialJkg", "potentialEnergyJ", "escapeSpeedMs"],
        targetQuantityKey: "gravitationalPotentialJkg",
        questionPlan: buildDigitFreePlan(
          "Evaluate negative scalar gravitational potential outside a spherical planet relative to infinity",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 1),
        options,
        workedSolution: `Outside the spherical mass, V_g = −G M / r = −(6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)}) / ${fmtGiven(probeRadiusM)} = ${fmt3sf(truth, "J kg⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes V_g = −GM / r = ${fmt3sf(truth, "J kg⁻¹")} including the negative sign.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (mode === 1) {
      // surfaceEscapeSpeedMs = sqrt(2GM / R)
      const truth = q.surfaceEscapeSpeedMs;
      const stems = [
        `An airless spherical ${ctx.planet} has mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}, while a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} monitors from radial distance ${fmtGiven(probeRadiusM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻². What minimum launch speed is required for a canister on the planet's surface to escape to infinity?`,
        `From the surface of a non-rotating airless ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")} (monitored by a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} at r = ${fmtGiven(probeRadiusM, "m")}), calculate the escape speed. Use G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
        `Determine the surface escape velocity for an unpowered projectile launched from a spherical ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}, given an exterior ${fmtGiven(testMassKg, "kg")} ${ctx.probe} at r = ${fmtGiven(probeRadiusM, "m")} and G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
        `A spherical ${ctx.planet} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(planetRadiusM, "m")}) is observed by a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} at radial distance ${fmtGiven(probeRadiusM, "m")}. Taking G = 6.67 × 10⁻¹¹ N m² kg⁻², at what minimum speed must an object leave the surface R to reach infinity?`,
      ];
      const options = buildNumericMcqOptions(truth, "m s⁻¹", [
        {
          value: Math.sqrt((GRAVITATIONAL_CONSTANT * centralMassKg) / planetRadiusM),
          rationale: "Omits the factor of 2 in v_esc = √(2GM / R), calculating surface circular skim speed instead.",
        },
        {
          value: q.escapeSpeedMs,
          rationale: "Evaluates escape speed from probe radius r rather than from the planetary surface R.",
        },
        {
          value: (2 * GRAVITATIONAL_CONSTANT * centralMassKg) / planetRadiusM,
          rationale: "Calculates 2GM / R = −2V_surface and forgets to take the square root.",
        },
        {
          value: 2 * Math.sqrt((GRAVITATIONAL_CONSTANT * centralMassKg) / planetRadiusM),
          rationale: "Places the factor of 2 outside the square root instead of √2.",
        },
      ]);
      return {
        id,
        conceptId: "gravitational-potential-orbits",
        templateArchetype: "planetary-potential-and-escape",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["surfaceEscapeSpeedMs", "escapeSpeedMs", "surfacePotentialJkg", "gravitationalPotentialJkg"],
        targetQuantityKey: "surfaceEscapeSpeedMs",
        questionPlan: buildDigitFreePlan(
          "Equate surface kinetic energy to gravitational binding energy to determine planetary escape speed",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 2),
        options,
        workedSolution: `Setting ½m v_esc² − G M m / R = 0 gives v_esc = √(2 G M / R) = √(2 × 6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)} / ${fmtGiven(planetRadiusM)}) = ${fmt3sf(truth, "m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates surface escape speed √(2GM / R) = ${fmt3sf(truth, "m s⁻¹")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // mode === 2: potentialEnergyJ = -GMm / r
    const truth = q.potentialEnergyJ;
    const stems = [
      `At radial distance ${fmtGiven(probeRadiusM, "m")} from the centre of a spherical ${ctx.planet} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(planetRadiusM, "m")}), a ${ctx.probe} has mass ${fmtGiven(testMassKg, "kg")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻² and zero potential energy at infinity. Calculate the gravitational potential energy of the ${ctx.probe}.`,
      `A ${fmtGiven(testMassKg, "kg")} ${ctx.probe} is stationed ${fmtGiven(probeRadiusM, "m")} from the centre of an airless ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}. With E_p = 0 at infinity and G = 6.67 × 10⁻¹¹ N m² kg⁻², what is the gravitational potential energy of the ${ctx.probe}?`,
      `Determine the signed gravitational potential energy (referenced to infinity) of a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} located at r = ${fmtGiven(probeRadiusM, "m")} outside a ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
      `Outside a ${fmtGiven(centralMassKg, "kg")} spherical ${ctx.planet} of radius ${fmtGiven(planetRadiusM, "m")}, an unpowered ${ctx.probe} of mass ${fmtGiven(testMassKg, "kg")} occupies radial coordinate ${fmtGiven(probeRadiusM, "m")}. Taking G = 6.67 × 10⁻¹¹ N m² kg⁻², find its gravitational potential energy.`,
    ];
    const options = buildNumericMcqOptions(truth, "J", [
      {
        value: -truth,
        rationale: "Reports a positive gravitational potential energy instead of negative bound-state energy relative to infinity.",
      },
      {
        value: 0.5 * truth,
        rationale: "Includes an erroneous factor of 1/2 from confusing potential energy −GMm/r with circular total energy −GMm/(2r).",
      },
      {
        value: q.gravitationalPotentialJkg,
        rationale: "Calculates potential per unit mass −GM/r and forgets to multiply by the probe mass m.",
      },
      {
        value: testMassKg * q.surfacePotentialJkg,
        rationale: "Evaluates potential energy at the planet's surface R rather than at radial distance r.",
      },
    ]);
    return {
      id,
      conceptId: "gravitational-potential-orbits",
      templateArchetype: "planetary-potential-and-escape",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: ["potentialEnergyJ", "gravitationalPotentialJkg", "surfacePotentialJkg", "escapeSpeedMs"],
      targetQuantityKey: "potentialEnergyJ",
      questionPlan: buildDigitFreePlan(
        "Compute gravitational potential energy of a finite mass at exterior radial distance relative to infinity",
        "mcq",
      ),
      stem: pickTemplate(stems, variantIndex, 3),
      options,
      workedSolution: `E_p = m V_g = −G M m / r = −(6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)} × ${fmtGiven(testMassKg)}) / ${fmtGiven(probeRadiusM)} = ${fmt3sf(truth, "J")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates E_p = −GMm / r = ${fmt3sf(truth, "J")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (6 marks)
  const structStems = [
    `An airless spherical ${ctx.planet} has mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")}. A ${ctx.probe} of mass ${fmtGiven(testMassKg, "kg")} is stationed at radial distance ${fmtGiven(probeRadiusM, "m")} from the planet's centre. Take G = 6.67 × 10⁻¹¹ N m² kg⁻² and gravitational potential to be zero at infinity.`,
    `Relative to zero potential at infinity, the gravitational potential curve of a spherical ${ctx.planet} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(planetRadiusM, "m")}) is sampled by a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} at radial coordinate ${fmtGiven(probeRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
    `Mission analysts model a non-rotating airless ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and surface radius ${fmtGiven(planetRadiusM, "m")}, together with a ${fmtGiven(testMassKg, "kg")} ${ctx.probe} at distance ${fmtGiven(probeRadiusM, "m")} from its centre. Take G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
    `A ${fmtGiven(testMassKg, "kg")} ${ctx.probe} monitors a spherical ${ctx.planet} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(planetRadiusM, "m")} from centre-to-centre distance ${fmtGiven(probeRadiusM, "m")}. Assume V_g = 0 at infinity and G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
  ];
  return {
    id,
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "planetary-potential-and-escape",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: ["surfacePotentialJkg", "surfaceEscapeSpeedMs", "gravitationalPotentialJkg", "potentialEnergyJ"],
    questionPlan: buildDigitFreePlan(
      "Link surface gravitational potential to surface escape speed and exterior probe potential energy",
      "structured",
      ["calculate-surface-gravitational-potential", "derive-surface-escape-speed", "compute-probe-potential-energy"],
    ),
    stem: pickTemplate(structStems, variantIndex),
    parts: [
      {
        partId: "a",
        prompt: `Calculate the gravitational potential at the surface of the ${ctx.planet}.`,
        marks: 2,
        targetQuantityKey: "surfacePotentialJkg",
        expectedAnswer: fmt3sf(q.surfacePotentialJkg, "J kg⁻¹"),
        workingSteps: [
          `V_surface = −G M / R = −(6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)}) / ${fmtGiven(planetRadiusM)} = ${fmt3sf(q.surfacePotentialJkg, "J kg⁻¹")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Hence, or otherwise, determine the escape speed from the surface of the ${ctx.planet}.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "surfaceEscapeSpeedMs",
        expectedAnswer: fmt3sf(q.surfaceEscapeSpeedMs, "m s⁻¹"),
        workingSteps: [
          `½ m v_esc² + m V_surface = 0 => v_esc = √(−2 V_surface).`,
          `v_esc = √(−2 × (${fmt3sf(q.surfacePotentialJkg)})) = ${fmt3sf(q.surfaceEscapeSpeedMs, "m s⁻¹")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Calculate the gravitational potential energy of the ${fmtGiven(testMassKg, "kg")} ${ctx.probe} at r = ${fmtGiven(probeRadiusM, "m")}.`,
        marks: 2,
        targetQuantityKey: "potentialEnergyJ",
        expectedAnswer: fmt3sf(q.potentialEnergyJ, "J"),
        workingSteps: [
          `E_p = −G M m / r = −(6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)} × ${fmtGiven(testMassKg)}) / ${fmtGiven(probeRadiusM)} = ${fmt3sf(q.potentialEnergyJ, "J")}.`,
        ],
      },
    ],
    workedSolution: `(a) V_surface = −GM/R = ${fmt3sf(q.surfacePotentialJkg, "J kg⁻¹")}. (b) Escape speed v_esc = √(−2 V_surface) = √(2GM/R) = ${fmt3sf(q.surfaceEscapeSpeedMs, "m s⁻¹")}. (c) At r = ${fmtGiven(probeRadiusM, "m")}, E_p = −GMm/r = ${fmt3sf(q.potentialEnergyJ, "J")}.`,
    markScheme: [
      { code: "M1", partId: "a", criterion: "Applies V_g = −GM / R with negative sign.", marks: 1 },
      { code: "A1", partId: "a", criterion: `Obtains ${fmt3sf(q.surfacePotentialJkg, "J kg⁻¹")}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Uses v_esc = √(2GM / R) or √(−2 V_surface).", marks: 1 },
      { code: "A1", partId: "b", criterion: `Obtains ${fmt3sf(q.surfaceEscapeSpeedMs, "m s⁻¹")}.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Applies E_p = −GMm / r at probe radius.", marks: 1 },
      { code: "A1", partId: "c", criterion: `Obtains ${fmt3sf(q.potentialEnergyJ, "J")}.`, marks: 1 },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// 8. CIRCULAR ORBIT SPEED & KEPLER ("gravitational-force-field", "circular-orbit-velocity-and-kepler")
// ============================================================================

function buildCircularOrbitSpeedKeplerItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  const syllabi = resolveSyllabiTags({
    conceptId: "gravitational-force-field",
    format,
    variantIndex,
  });

  const centralMassKg = perturbCycle(
    Number((EARTH_MASS_KG * [0.6, 0.85, 1.0, 1.3, 1.7, 2.2, 2.9, 3.8][(variantIndex + rng.nextInt(0, 1)) % 8]).toPrecision(3)),
    variantIndex,
    8,
  );
  const centralRadiusM = perturbCycle(
    Number((EARTH_RADIUS_M * [0.8, 0.95, 1.0, 1.15, 1.3, 1.5][(variantIndex * 3) % 6]).toPrecision(3)),
    variantIndex,
    6,
  );
  const altFactors = [0.35, 0.5, 0.75, 1.1, 1.5, 2.0, 2.6, 3.1];
  const altitudeM = Number((centralRadiusM * altFactors[variantIndex % altFactors.length]).toPrecision(3));
  const orbitRadiusM = Number((centralRadiusM + altitudeM).toPrecision(4));
  const satelliteMassKg = perturbCycle([220, 340, 480, 620, 750, 920, 1150, 1450][variantIndex % 8], variantIndex, 8);

  const spec: CircularOrbitEnergyScenario = {
    kind: "circular-orbit-energy",
    id,
    centralMassKg,
    centralRadiusM,
    satelliteMassKg,
    orbitRadiusM,
    diagramVariant: "orbit-schematic",
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const ctx = SATELLITE_CONTEXTS[(variantIndex * 5) % SATELLITE_CONTEXTS.length];
  const difficulty = pickDifficulty(variantIndex);
  const stateAltitudeOnly = variantIndex % 2 === 0;

  const requiredGivens: RequiredGivenSpec[] = stateAltitudeOnly
    ? [
        { name: "centralMassKg", value: centralMassKg, unit: "kg", source: "stem" },
        { name: "centralRadiusM", value: centralRadiusM, unit: "m", source: "stem" },
        { name: "satelliteMassKg", value: satelliteMassKg, unit: "kg", source: "stem" },
        { name: "altitudeM", value: altitudeM, unit: "m", source: "stem" },
      ]
    : [
        { name: "centralMassKg", value: centralMassKg, unit: "kg", source: "stem" },
        { name: "centralRadiusM", value: centralRadiusM, unit: "m", source: "stem" },
        { name: "satelliteMassKg", value: satelliteMassKg, unit: "kg", source: "stem" },
        { name: "orbitRadiusM", value: orbitRadiusM, unit: "m", source: "stem" },
      ];

  if (format === "mcq") {
    const askPeriod = variantIndex % 3 === 1;
    const truth = askPeriod ? q.orbitalPeriodS : q.orbitalSpeedMs;
    const unit = askPeriod ? "s" : "m s⁻¹";
    const targetPhrase = askPeriod ? "orbital period" : "circular orbital speed";

    const altStems = [
      `A ${ctx.sat} of mass ${fmtGiven(satelliteMassKg, "kg")} travels in a circular orbit at an altitude of ${fmtGiven(altitudeM, "m")} above the surface of ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻². What is the ${targetPhrase} of the spacecraft?`,
      `Maintaining a constant surface altitude of ${fmtGiven(altitudeM, "m")}, a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} circles ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, surface radius ${fmtGiven(centralRadiusM, "m")}). Using G = 6.67 × 10⁻¹¹ N m² kg⁻², determine its ${targetPhrase}.`,
      `Mission tracking places a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} at height ${fmtGiven(altitudeM, "m")} above ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²). Calculate the ${targetPhrase}.`,
      `Above ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}), a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} executes uniform circular motion at altitude h = ${fmtGiven(altitudeM, "m")}. Taking G = 6.67 × 10⁻¹¹ N m² kg⁻², find its ${targetPhrase}.`,
    ];
    const radStems = [
      `Orbiting ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}), a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} follows a circular path of orbital radius ${fmtGiven(orbitRadiusM, "m")} measured from the planet's centre (G = 6.67 × 10⁻¹¹ N m² kg⁻²). Calculate its ${targetPhrase}.`,
      `A ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} revolves in a circle of centre-to-centre radius ${fmtGiven(orbitRadiusM, "m")} around ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻². Determine its ${targetPhrase}.`,
      `At orbital radius r = ${fmtGiven(orbitRadiusM, "m")} from the centre of ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, surface radius ${fmtGiven(centralRadiusM, "m")}), what is the ${targetPhrase} of a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat}? Use G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
      `Telemetry confirms a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} is in a circular orbit of radius ${fmtGiven(orbitRadiusM, "m")} about ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}, G = 6.67 × 10⁻¹¹ N m² kg⁻²). Find the ${targetPhrase}.`,
    ];
    const stem = stateAltitudeOnly
      ? pickTemplate(altStems, variantIndex, 1)
      : pickTemplate(radStems, variantIndex, 2);

    const options = askPeriod
      ? buildNumericMcqOptions(truth, unit, [
          {
            value: 2 * Math.PI * Math.sqrt(altitudeM ** 3 / (GRAVITATIONAL_CONSTANT * centralMassKg)),
            rationale: "Substitutes altitude h above the surface instead of total orbital radius r = R_p + h in Kepler's third law T = 2π√(r³ / GM).",
          },
          {
            value: Math.sqrt(orbitRadiusM ** 3 / (GRAVITATIONAL_CONSTANT * centralMassKg)),
            rationale: "Computes 1/ω = √(r³ / GM) and omits the factor of 2π.",
          },
          {
            value: 2 * Math.PI * Math.sqrt(orbitRadiusM ** 2 / (GRAVITATIONAL_CONSTANT * centralMassKg)),
            rationale: "Uses r² instead of r³ inside Kepler's third-law radical.",
          },
          {
            value: 2 * Math.PI * Math.sqrt(centralRadiusM ** 3 / (GRAVITATIONAL_CONSTANT * centralMassKg)),
            rationale: "Uses the planet's surface radius R_p instead of orbital radius r.",
          },
        ])
      : buildNumericMcqOptions(truth, unit, [
          {
            value: Math.sqrt((GRAVITATIONAL_CONSTANT * centralMassKg) / altitudeM),
            rationale: "Substitutes altitude h above the surface instead of total orbital radius r = R_p + h in v = √(GM / r).",
          },
          {
            value: q.escapeSpeedMs,
            rationale: "Includes an extra factor of √2, calculating escape speed √(2GM / r) instead of circular orbital speed √(GM / r).",
          },
          {
            value: Math.sqrt((GRAVITATIONAL_CONSTANT * centralMassKg) / centralRadiusM),
            rationale: "Uses planetary radius R_p instead of orbital radius r.",
          },
          {
            value: (GRAVITATIONAL_CONSTANT * centralMassKg) / orbitRadiusM,
            rationale: "Calculates v² = GM / r and omits taking the square root.",
          },
        ]);

    return {
      id,
      conceptId: "gravitational-force-field",
      templateArchetype: "circular-orbit-velocity-and-kepler",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        ...(stateAltitudeOnly ? ["orbitRadiusM"] : ["altitudeM"]),
        "orbitalSpeedMs",
        "escapeSpeedMs",
        "orbitalPeriodS",
        "fieldStrengthNkg",
        "gravitationalForceN",
      ],
      requiredGivens,
      targetQuantityKey: askPeriod ? "orbitalPeriodS" : "orbitalSpeedMs",
      questionPlan: buildDigitFreePlan(
        "Equate Newtonian gravitation to centripetal force using centre-to-centre orbital radius",
        "mcq",
      ),
      stem,
      options,
      workedSolution: `${stateAltitudeOnly ? `Orbital radius from planet centre r = R_p + h = ${fmtGiven(centralRadiusM)} + ${fmtGiven(altitudeM)} = ${fmtGiven(orbitRadiusM, "m")}. ` : ""}${askPeriod ? `By Kepler's third law, T = 2π√(r³ / GM) = 2π√((${fmtGiven(orbitRadiusM)})³ / (6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)})) = ${fmt3sf(truth, unit)}.` : `Equating GMm / r² = mv² / r gives v = √(GM / r) = √(6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)} / ${fmtGiven(orbitRadiusM)}) = ${fmt3sf(truth, unit)}.`}`,
      markScheme: [
        {
          code: "A1",
          criterion: `Uses r = ${fmtGiven(orbitRadiusM, "m")} to obtain ${fmt3sf(truth, unit)}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (6 marks)
  const structAltStems = [
    `A ${ctx.sat} of mass ${fmtGiven(satelliteMassKg, "kg")} orbits ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")} in a circular path at constant altitude ${fmtGiven(altitudeM, "m")} above the surface. Take G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
    `Deployed at a steady surface altitude of ${fmtGiven(altitudeM, "m")}, a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} circles ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, surface radius ${fmtGiven(centralRadiusM, "m")}). Use G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
    `Orbital telemetry tracks a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} maintaining circular motion at height h = ${fmtGiven(altitudeM, "m")} above ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
  ];
  const structRadStems = [
    `A ${ctx.sat} of mass ${fmtGiven(satelliteMassKg, "kg")} moves in a circular orbit of radius ${fmtGiven(orbitRadiusM, "m")} around ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
    `Around ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, surface radius ${fmtGiven(centralRadiusM, "m")}), a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} executes uniform circular motion at orbital radius r = ${fmtGiven(orbitRadiusM, "m")} from the planetary centre (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
    `The schematic shows a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} in a circular orbit of centre-to-centre radius ${fmtGiven(orbitRadiusM, "m")} about ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")}. Use G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
  ];
  return {
    id,
    conceptId: "gravitational-force-field",
    templateArchetype: "circular-orbit-velocity-and-kepler",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      ...(stateAltitudeOnly ? ["orbitRadiusM"] : ["altitudeM"]),
      "fieldStrengthNkg",
      "gravitationalForceN",
      "orbitalSpeedMs",
      "orbitalPeriodS",
    ],
    requiredGivens,
    questionPlan: buildDigitFreePlan(
      "Derive orbital field acceleration, circular speed, and Keplerian period from planetary parameters",
      "structured",
      ["compute-orbital-field-strength", "determine-circular-orbital-speed", "calculate-orbital-period"],
    ),
    stem: stateAltitudeOnly
      ? pickTemplate(structAltStems, variantIndex)
      : pickTemplate(structRadStems, variantIndex),
    parts: [
      {
        partId: "a",
        prompt: `Calculate the gravitational field strength at the satellite's orbit.`,
        marks: 2,
        targetQuantityKey: "fieldStrengthNkg",
        expectedAnswer: fmt3sf(q.fieldStrengthNkg, "N kg⁻¹"),
        workingSteps: [
          ...(stateAltitudeOnly ? [`r = R_p + h = ${fmtGiven(centralRadiusM)} + ${fmtGiven(altitudeM)} = ${fmtGiven(orbitRadiusM, "m")}.`] : []),
          `g = G M / r² = (6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)}) / (${fmtGiven(orbitRadiusM)})² = ${fmt3sf(q.fieldStrengthNkg, "N kg⁻¹")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Determine the circular orbital speed of the ${ctx.sat}.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "orbitalSpeedMs",
        expectedAnswer: fmt3sf(q.orbitalSpeedMs, "m s⁻¹"),
        workingSteps: [
          `Setting centripetal acceleration v² / r = g gives v = √(g r) = √(G M / r).`,
          `v = ${fmt3sf(q.orbitalSpeedMs, "m s⁻¹")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Calculate the orbital period of the ${ctx.sat}.`,
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "orbitalPeriodS",
        expectedAnswer: fmt3sf(q.orbitalPeriodS, "s"),
        workingSteps: [
          `T = 2π r / v = 2π × ${fmtGiven(orbitRadiusM)} / ${fmt3sf(q.orbitalSpeedMs)} = ${fmt3sf(q.orbitalPeriodS, "s")}.`,
        ],
      },
    ],
    workedSolution: `(a) With orbital radius r = ${fmtGiven(orbitRadiusM, "m")}, g = GM/r² = ${fmt3sf(q.fieldStrengthNkg, "N kg⁻¹")}. (b) Orbital speed v = √(GM/r) = ${fmt3sf(q.orbitalSpeedMs, "m s⁻¹")}. (c) Period T = 2πr/v = ${fmt3sf(q.orbitalPeriodS, "s")}.`,
    markScheme: [
      { code: "M1", partId: "a", criterion: "Uses centre-to-centre orbital radius r in g = GM / r².", marks: 1 },
      { code: "A1", partId: "a", criterion: `Obtains g = ${fmt3sf(q.fieldStrengthNkg, "N kg⁻¹")}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Equates v²/r to g (or GM/r²).", marks: 1 },
      { code: "A1", partId: "b", criterion: `Obtains v = ${fmt3sf(q.orbitalSpeedMs, "m s⁻¹")}.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Applies T = 2πr / v or Kepler's third law.", marks: 1 },
      { code: "A1", partId: "c", criterion: `Obtains T = ${fmt3sf(q.orbitalPeriodS, "s")}.`, marks: 1 },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// 9. CIRCULAR ORBIT VIRIAL ENERGY ("gravitational-potential-orbits", "circular-orbit-virial-mechanical-energy")
// ============================================================================

function buildCircularOrbitVirialItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  const syllabi = resolveSyllabiTags({
    conceptId: "gravitational-potential-orbits",
    format,
    variantIndex,
  });

  const centralMassKg = perturbCycle(
    Number((EARTH_MASS_KG * [0.5, 0.75, 1.0, 1.4, 1.9, 2.5, 3.4][(variantIndex + rng.nextInt(0, 1)) % 7]).toPrecision(3)),
    variantIndex,
    7,
  );
  const centralRadiusM = perturbCycle(
    Number((EARTH_RADIUS_M * [0.75, 0.9, 1.0, 1.2, 1.45][(variantIndex * 3) % 5]).toPrecision(3)),
    variantIndex,
    5,
  );
  const orbitRadiusM = Number((centralRadiusM * [1.5, 1.8, 2.2, 2.6, 3.1, 3.6, 4.2][variantIndex % 7]).toPrecision(3));
  const satelliteMassKg = perturbCycle([280, 420, 560, 720, 880, 1100, 1350, 1650][variantIndex % 8], variantIndex, 8);

  const spec: CircularOrbitEnergyScenario = {
    kind: "circular-orbit-energy",
    id,
    centralMassKg,
    centralRadiusM,
    satelliteMassKg,
    orbitRadiusM,
    diagramVariant: variantIndex % 2 === 0 ? "energy-curves" : "split-orbit-energy",
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const ctx = SATELLITE_CONTEXTS[(variantIndex * 7 + 4) % SATELLITE_CONTEXTS.length];
  const difficulty = pickDifficulty(variantIndex, "higher");

  if (format === "mcq") {
    const mode = variantIndex % 3;
    if (mode === 0) {
      // totalEnergyJ = -GMm / (2r)
      const truth = q.totalEnergyJ;
      const stems = [
        `A ${ctx.sat} of mass ${fmtGiven(satelliteMassKg, "kg")} moves in a circular orbit of radius ${fmtGiven(orbitRadiusM, "m")} around ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻² and zero potential energy at infinity. What is the total mechanical energy of the spacecraft in this orbit?`,
        `Orbiting ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}) at circular orbital radius ${fmtGiven(orbitRadiusM, "m")}, a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} is gravitationally bound. With E_p = 0 at infinity and G = 6.67 × 10⁻¹¹ N m² kg⁻², calculate its total mechanical energy.`,
        `Determine the signed total orbital energy E_tot = E_k + E_p of a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} in a circular orbit of radius ${fmtGiven(orbitRadiusM, "m")} around ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
        `Relative to zero energy at infinity, what total mechanical energy does a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} possess while circling ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, surface radius ${fmtGiven(centralRadiusM, "m")}) at radius r = ${fmtGiven(orbitRadiusM, "m")}? Use G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
      ];
      const options = buildNumericMcqOptions(truth, "J", [
        {
          value: q.potentialEnergyJ,
          rationale: "Omits the factor of 1/2 in E_tot = −GMm/(2r), quoting gravitational potential energy −GMm/r instead.",
        },
        {
          value: q.kineticEnergyJ,
          rationale: "Omits the negative bound-state sign, reporting +GMm/(2r) instead of −GMm/(2r).",
        },
        {
          value: -q.potentialEnergyJ,
          rationale: "Omits both the negative sign and the virial factor of 1/2, reporting +GMm/r.",
        },
        {
          value: -(GRAVITATIONAL_CONSTANT * centralMassKg * satelliteMassKg) / (2 * (orbitRadiusM - centralRadiusM)),
          rationale: "Uses altitude (r − R_p) instead of centre-to-centre orbital radius r in −GMm/(2r).",
        },
      ]);
      return {
        id,
        conceptId: "gravitational-potential-orbits",
        templateArchetype: "circular-orbit-virial-mechanical-energy",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["kineticEnergyJ", "potentialEnergyJ", "totalEnergyJ", "bindingEnergyJ", "orbitalSpeedMs"],
        targetQuantityKey: "totalEnergyJ",
        questionPlan: buildDigitFreePlan(
          "Sum orbital kinetic energy and negative gravitational potential energy to obtain circular virial total energy",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 1),
        options,
        workedSolution: `In a circular orbit, E_k = +GMm/(2r) and E_p = −GMm/r, so E_tot = E_k + E_p = −GMm/(2r) = −(6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)} × ${fmtGiven(satelliteMassKg)}) / (2 × ${fmtGiven(orbitRadiusM)}) = ${fmt3sf(truth, "J")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies E_tot = −GMm / (2r) with negative sign to obtain ${fmt3sf(truth, "J")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (mode === 1) {
      // kineticEnergyJ = +GMm / (2r)
      const truth = q.kineticEnergyJ;
      const stems = [
        `Orbiting ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}) along a circle of radius ${fmtGiven(orbitRadiusM, "m")}, a ${ctx.sat} has mass ${fmtGiven(satelliteMassKg, "kg")}. Using G = 6.67 × 10⁻¹¹ N m² kg⁻², calculate the orbital kinetic energy of the spacecraft.`,
        `A ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} follows a circular trajectory of radius ${fmtGiven(orbitRadiusM, "m")} around ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and surface radius ${fmtGiven(centralRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²). What is its kinetic energy?`,
        `Determine the translational kinetic energy of a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} in a circular orbit of radius r = ${fmtGiven(orbitRadiusM, "m")} about ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}, G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
        `At centre-to-centre orbital radius ${fmtGiven(orbitRadiusM, "m")} around ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")}, find the orbital kinetic energy of a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
      ];
      const options = buildNumericMcqOptions(truth, "J", [
        {
          value: -q.potentialEnergyJ,
          rationale: "Omits the factor of 1/2 in E_k = ½mv² = GMm/(2r), computing GMm/r instead.",
        },
        {
          value: q.totalEnergyJ,
          rationale: "Assigns a negative sign to kinetic energy by confusing E_k with total orbital energy E_tot.",
        },
        {
          value: (GRAVITATIONAL_CONSTANT * centralMassKg * satelliteMassKg) / (2 * (orbitRadiusM - centralRadiusM)),
          rationale: "Uses surface altitude (r − R_p) instead of orbital radius r.",
        },
        {
          value: (GRAVITATIONAL_CONSTANT * centralMassKg * satelliteMassKg) / (2 * centralRadiusM),
          rationale: "Evaluates kinetic energy at planetary surface radius R_p instead of orbital radius r.",
        },
      ]);
      return {
        id,
        conceptId: "gravitational-potential-orbits",
        templateArchetype: "circular-orbit-virial-mechanical-energy",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["kineticEnergyJ", "potentialEnergyJ", "totalEnergyJ", "bindingEnergyJ", "orbitalSpeedMs"],
        targetQuantityKey: "kineticEnergyJ",
        questionPlan: buildDigitFreePlan(
          "Determine orbital kinetic energy of a satellite in circular Newtonian orbit",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 2),
        options,
        workedSolution: `Since m v² / r = G M m / r², orbital kinetic energy is E_k = ½ m v² = G M m / (2r) = (6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)} × ${fmtGiven(satelliteMassKg)}) / (2 × ${fmtGiven(orbitRadiusM)}) = ${fmt3sf(truth, "J")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes E_k = GMm / (2r) = ${fmt3sf(truth, "J")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // mode === 2: escapeSpeedMs from orbit = sqrt(2) v_orb
    const truth = q.escapeSpeedMs;
    const stems = [
      `A ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} circles ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}) at orbital radius ${fmtGiven(orbitRadiusM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻². What minimum speed at this orbital radius is required for the spacecraft to escape the planet's gravitational field completely?`,
      `Positioned in a circular orbit of radius ${fmtGiven(orbitRadiusM, "m")} around ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")}, a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} prepares a departure burn (G = 6.67 × 10⁻¹¹ N m² kg⁻²). Calculate the local escape speed from r = ${fmtGiven(orbitRadiusM, "m")}.`,
      `At orbital radius ${fmtGiven(orbitRadiusM, "m")} outside ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, surface radius ${fmtGiven(centralRadiusM, "m")}), what threshold speed must a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} attain so its total mechanical energy reaches zero? Use G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
      `Determine the escape velocity from orbital radius r = ${fmtGiven(orbitRadiusM, "m")} for a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} orbiting ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
    ];
    const options = buildNumericMcqOptions(truth, "m s⁻¹", [
      {
        value: q.orbitalSpeedMs,
        rationale: "Calculates circular orbital speed √(GM / r) and omits the √2 factor needed to escape from orbit.",
      },
      {
        value: 2 * q.orbitalSpeedMs,
        rationale: "Multiplies circular orbital speed by 2 instead of √2.",
      },
      {
        value: Math.sqrt((2 * GRAVITATIONAL_CONSTANT * centralMassKg) / centralRadiusM),
        rationale: "Calculates escape speed from the planet's surface R_p rather than from the satellite's orbital radius r.",
      },
      {
        value: Math.sqrt((2 * GRAVITATIONAL_CONSTANT * centralMassKg) / (orbitRadiusM - centralRadiusM)),
        rationale: "Substitutes altitude (r − R_p) instead of radial distance r in √(2GM / r).",
      },
    ]);
    return {
      id,
      conceptId: "gravitational-potential-orbits",
      templateArchetype: "circular-orbit-virial-mechanical-energy",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: ["escapeSpeedMs", "orbitalSpeedMs", "kineticEnergyJ", "potentialEnergyJ", "totalEnergyJ"],
      targetQuantityKey: "escapeSpeedMs",
      questionPlan: buildDigitFreePlan(
        "Determine escape speed from circular orbital radius where total mechanical energy reaches zero",
        "mcq",
      ),
      stem: pickTemplate(stems, variantIndex, 3),
      options,
      workedSolution: `Escape from radial distance r requires ½m v_esc² − GMm/r = 0, so v_esc = √(2GM / r) = √(2 × 6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)} / ${fmtGiven(orbitRadiusM)}) = ${fmt3sf(truth, "m s⁻¹")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates v_esc = √(2GM / r) = ${fmt3sf(truth, "m s⁻¹")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (6 marks: E_k -> E_p -> E_tot)
  const virialStructStems = [
    `A ${ctx.sat} of mass ${fmtGiven(satelliteMassKg, "kg")} travels in a circular orbit of radius ${fmtGiven(orbitRadiusM, "m")} around ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻² and gravitational potential energy to be zero at infinity.`,
    `Referenced to zero potential energy at infinity, the orbital energy diagram models a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} circling ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, surface radius ${fmtGiven(centralRadiusM, "m")}) at radius r = ${fmtGiven(orbitRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
    `Mission dynamics engineers evaluate the mechanical energy budget of a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} in a circular orbit of radius ${fmtGiven(orbitRadiusM, "m")} about ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
    `In a circular orbit of centre-to-centre radius ${fmtGiven(orbitRadiusM, "m")} around ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}), a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} has E_p = 0 at infinity. Use G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
  ];
  return {
    id,
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "circular-orbit-virial-mechanical-energy",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: ["kineticEnergyJ", "potentialEnergyJ", "totalEnergyJ", "bindingEnergyJ", "orbitalSpeedMs"],
    questionPlan: buildDigitFreePlan(
      "Establish the circular-orbit energy budget across kinetic, potential, and negative total mechanical energy",
      "structured",
      ["compute-orbital-kinetic-energy", "compute-gravitational-potential-energy", "sum-bound-total-mechanical-energy"],
    ),
    stem: pickTemplate(virialStructStems, variantIndex),
    parts: [
      {
        partId: "a",
        prompt: `Calculate the kinetic energy of the ${ctx.sat} in this circular orbit.`,
        marks: 2,
        targetQuantityKey: "kineticEnergyJ",
        expectedAnswer: fmt3sf(q.kineticEnergyJ, "J"),
        workingSteps: [
          `From m v² / r = G M m / r², E_k = ½ m v² = G M m / (2r).`,
          `E_k = (6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)} × ${fmtGiven(satelliteMassKg)}) / (2 × ${fmtGiven(orbitRadiusM)}) = ${fmt3sf(q.kineticEnergyJ, "J")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the gravitational potential energy of the ${ctx.sat}.`,
        marks: 2,
        targetQuantityKey: "potentialEnergyJ",
        expectedAnswer: fmt3sf(q.potentialEnergyJ, "J"),
        workingSteps: [
          `E_p = −G M m / r = −2 E_k = ${fmt3sf(q.potentialEnergyJ, "J")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the total mechanical energy of the ${ctx.sat}.`,
        marks: 2,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "totalEnergyJ",
        expectedAnswer: fmt3sf(q.totalEnergyJ, "J"),
        workingSteps: [
          `E_tot = E_k + E_p = −G M m / (2r) = ${fmt3sf(q.totalEnergyJ, "J")}.`,
        ],
      },
    ],
    workedSolution: `(a) E_k = GMm/(2r) = ${fmt3sf(q.kineticEnergyJ, "J")}. (b) E_p = −GMm/r = ${fmt3sf(q.potentialEnergyJ, "J")}. (c) Total mechanical energy E_tot = E_k + E_p = −GMm/(2r) = ${fmt3sf(q.totalEnergyJ, "J")}.`,
    markScheme: [
      { code: "M1", partId: "a", criterion: "Applies E_k = GMm / (2r).", marks: 1 },
      { code: "A1", partId: "a", criterion: `Obtains E_k = ${fmt3sf(q.kineticEnergyJ, "J")}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Applies E_p = −GMm / r including negative sign.", marks: 1 },
      { code: "A1", partId: "b", criterion: `Obtains E_p = ${fmt3sf(q.potentialEnergyJ, "J")}.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Sums E_k + E_p or applies E_tot = −GMm / (2r).", marks: 1 },
      { code: "A1", partId: "c", criterion: `Obtains E_tot = ${fmt3sf(q.totalEnergyJ, "J")}.`, marks: 1 },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// 10. ORBITAL TRANSFER ("gravitational-potential-orbits", "orbital-transfer-energy-hohmann")
// ============================================================================

function buildOrbitalTransferItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  const syllabi = resolveSyllabiTags({
    conceptId: "gravitational-potential-orbits",
    format,
    variantIndex,
  });

  const centralMassKg = perturbCycle(
    Number((EARTH_MASS_KG * [0.7, 1.0, 1.35, 1.8, 2.4, 3.2][(variantIndex + rng.nextInt(0, 1)) % 6]).toPrecision(3)),
    variantIndex,
    6,
  );
  const centralRadiusM = perturbCycle(
    Number((EARTH_RADIUS_M * [0.85, 1.0, 1.15, 1.3][(variantIndex * 3) % 4]).toPrecision(3)),
    variantIndex,
    4,
  );
  const orbitRadiusM = Number((centralRadiusM * [1.4, 1.6, 1.9, 2.2, 2.5][variantIndex % 5]).toPrecision(3));
  const targetOrbitRadiusM = Number((orbitRadiusM * [1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0][variantIndex % 7]).toPrecision(3));
  const satelliteMassKg = perturbCycle([320, 450, 600, 780, 950, 1200, 1500][variantIndex % 7], variantIndex, 7);

  const spec: CircularOrbitEnergyScenario = {
    kind: "circular-orbit-energy",
    id,
    centralMassKg,
    centralRadiusM,
    satelliteMassKg,
    orbitRadiusM,
    targetOrbitRadiusM,
    diagramVariant: variantIndex % 2 === 0 ? "split-orbit-energy" : "orbit-schematic",
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const ctx = SATELLITE_CONTEXTS[(variantIndex * 5 + 7) % SATELLITE_CONTEXTS.length];
  const difficulty = pickDifficulty(variantIndex, "higher");

  if (format === "mcq") {
    const mode = variantIndex % 3;
    if (mode === 0) {
      // transferDeltaTotalEnergyJ = GMm/2 (1/r1 - 1/r2) > 0
      const truth = q.transferDeltaTotalEnergyJ;
      const stems = [
        `Thrusters boost a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} around ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}) from a circular orbit of radius ${fmtGiven(orbitRadiusM, "m")} to a higher circular orbit of radius ${fmtGiven(targetOrbitRadiusM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻². What minimum mechanical energy must the thrusters supply?`,
        `An orbital manoeuvre raises a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} around ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")} from circular radius r₁ = ${fmtGiven(orbitRadiusM, "m")} to coaxial circular radius r₂ = ${fmtGiven(targetOrbitRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²). Calculate the required increase in total mechanical energy.`,
        `To reposition a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} about ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, surface radius ${fmtGiven(centralRadiusM, "m")}) from circular orbit radius ${fmtGiven(orbitRadiusM, "m")} to ${fmtGiven(targetOrbitRadiusM, "m")}, how much net mechanical work must propulsion provide? Use G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
        `Determine ΔE_tot = E_tot(r₂) − E_tot(r₁) when a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} transfers between circular orbits of radii r₁ = ${fmtGiven(orbitRadiusM, "m")} and r₂ = ${fmtGiven(targetOrbitRadiusM, "m")} around ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}, G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
      ];
      const options = buildNumericMcqOptions(truth, "J", [
        {
          value: q.transferDeltaPotentialEnergyJ,
          rationale: "Calculates the gain in gravitational potential energy ΔE_p = GMm(1/r₁ − 1/r₂) and forgets the virial reduction in kinetic energy (factor of 1/2).",
        },
        {
          value: -truth,
          rationale: "Reverses initial and final radii, obtaining a negative energy requirement for raising the orbit.",
        },
        {
          value: Math.abs(q.targetTotalEnergyJ),
          rationale: "Calculates |E_tot(r₂)| alone instead of subtracting initial total energy E_tot(r₁) from E_tot(r₂).",
        },
        {
          value: Math.abs(q.totalEnergyJ) + Math.abs(q.targetTotalEnergyJ),
          rationale: "Adds the magnitudes |E_tot(r₁)| + |E_tot(r₂)| instead of taking their difference.",
        },
      ]);
      return {
        id,
        conceptId: "gravitational-potential-orbits",
        templateArchetype: "orbital-transfer-energy-hohmann",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "totalEnergyJ",
          "kineticEnergyJ",
          "potentialEnergyJ",
          "targetTotalEnergyJ",
          "targetKineticEnergyJ",
          "transferDeltaTotalEnergyJ",
          "transferDeltaPotentialEnergyJ",
          "transferDeltaKineticEnergyJ",
        ],
        targetQuantityKey: "transferDeltaTotalEnergyJ",
        questionPlan: buildDigitFreePlan(
          "Evaluate minimum mechanical work required to transfer a satellite between two coaxial circular orbits",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 1),
        options,
        workedSolution: `Using E_tot(r) = −GMm/(2r), ΔE_tot = E_tot(r₂) − E_tot(r₁) = ½ GMm (1/r₁ − 1/r₂) = 0.5 × 6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)} × ${fmtGiven(satelliteMassKg)} × (1/${fmtGiven(orbitRadiusM)} − 1/${fmtGiven(targetOrbitRadiusM)}) = ${fmt3sf(truth, "J")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses ΔE_tot = ½GMm(1/r₁ − 1/r₂) to obtain ${fmt3sf(truth, "J")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (mode === 1) {
      // transferDeltaKineticEnergyJ < 0
      const truth = q.transferDeltaKineticEnergyJ;
      const stems = [
        `A ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} around ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}) transfers from circular orbital radius r₁ = ${fmtGiven(orbitRadiusM, "m")} to circular orbital radius r₂ = ${fmtGiven(targetOrbitRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²). What is the signed change ΔE_k = E_k,final − E_k,initial in its orbital kinetic energy?`,
        `Upon moving from a lower circular orbit of radius ${fmtGiven(orbitRadiusM, "m")} to an outer circular orbit of radius ${fmtGiven(targetOrbitRadiusM, "m")} about ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}), calculate the signed kinetic energy change ΔE_k of a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
        `Determine E_k(r₂) − E_k(r₁) when a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} orbiting ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")} transitions from circular radius r₁ = ${fmtGiven(orbitRadiusM, "m")} to r₂ = ${fmtGiven(targetOrbitRadiusM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
        `Comparing circular orbits of radii r₁ = ${fmtGiven(orbitRadiusM, "m")} and r₂ = ${fmtGiven(targetOrbitRadiusM, "m")} around ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, surface radius ${fmtGiven(centralRadiusM, "m")}), find the signed change in orbital kinetic energy for a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} raised from r₁ to r₂ (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
      ];
      const options = buildNumericMcqOptions(truth, "J", [
        {
          value: -truth,
          rationale: "Reports a positive change +ΔE_k, overlooking that a higher circular orbit has a lower orbital speed and smaller kinetic energy.",
        },
        {
          value: -q.transferDeltaPotentialEnergyJ,
          rationale: "Omits the factor of 1/2 in E_k = GMm/(2r).",
        },
        {
          value: q.targetKineticEnergyJ,
          rationale: "Quotes the final kinetic energy E_k(r₂) rather than the change E_k(r₂) − E_k(r₁).",
        },
        {
          value: q.transferDeltaPotentialEnergyJ,
          rationale: "Computes +ΔE_p = +GMm(1/r₁ − 1/r₂) instead of ΔE_k = −½GMm(1/r₁ − 1/r₂).",
        },
      ]);
      return {
        id,
        conceptId: "gravitational-potential-orbits",
        templateArchetype: "orbital-transfer-energy-hohmann",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "kineticEnergyJ",
          "totalEnergyJ",
          "targetKineticEnergyJ",
          "targetTotalEnergyJ",
          "transferDeltaKineticEnergyJ",
          "transferDeltaTotalEnergyJ",
        ],
        targetQuantityKey: "transferDeltaKineticEnergyJ",
        questionPlan: buildDigitFreePlan(
          "Compute signed change in satellite kinetic energy upon raising circular orbital radius",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 2),
        options,
        workedSolution: `Because E_k(r) = +GMm/(2r) decreases as r increases, ΔE_k = ½GMm(1/r₂ − 1/r₁) = ${fmt3sf(truth, "J")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates ΔE_k = ½GMm(1/r₂ − 1/r₁) = ${fmt3sf(truth, "J")} (negative).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // mode === 2: hohmannTransferTimeS = pi * sqrt(a^3 / GM), a = (r1 + r2)/2
    const truth = q.hohmannTransferTimeS;
    const stems = [
      `A ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} around ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}) executes an elliptical Hohmann transfer with periapsis r₁ = ${fmtGiven(orbitRadiusM, "m")} and apoapsis r₂ = ${fmtGiven(targetOrbitRadiusM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻². How long does the half-ellipse coast from r₁ to r₂ take?`,
      `Between circular orbits of radii r₁ = ${fmtGiven(orbitRadiusM, "m")} and r₂ = ${fmtGiven(targetOrbitRadiusM, "m")} around ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}), a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} coasts along a tangent Hohmann transfer ellipse (G = 6.67 × 10⁻¹¹ N m² kg⁻²). Calculate the transit time from periapsis to apoapsis.`,
      `Determine the unpowered coast duration along a Hohmann half-ellipse connecting r₁ = ${fmtGiven(orbitRadiusM, "m")} to r₂ = ${fmtGiven(targetOrbitRadiusM, "m")} for a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} orbiting ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and radius ${fmtGiven(centralRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
      `Flight dynamics plans a two-burn Hohmann transfer for a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} about ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, surface radius ${fmtGiven(centralRadiusM, "m")}) from r₁ = ${fmtGiven(orbitRadiusM, "m")} to r₂ = ${fmtGiven(targetOrbitRadiusM, "m")}. Using G = 6.67 × 10⁻¹¹ N m² kg⁻², find the transfer time.`,
    ];
    const options = buildNumericMcqOptions(truth, "s", [
      {
        value: 2 * truth,
        rationale: "Calculates the full elliptical period 2π√(a³ / GM) instead of the half-orbit Hohmann coast time π√(a³ / GM).",
      },
      {
        value: Math.PI * Math.sqrt((orbitRadiusM + targetOrbitRadiusM) ** 3 / (GRAVITATIONAL_CONSTANT * centralMassKg)),
        rationale: "Uses major axis (r₁ + r₂) instead of semi-major axis a = (r₁ + r₂)/2 in Kepler's third law.",
      },
      {
        value: 0.5 * q.targetOrbitalPeriodS,
        rationale: "Takes half the outer circular period using r₂ instead of the transfer ellipse semi-major axis (r₁ + r₂)/2.",
      },
      {
        value: 0.5 * (q.orbitalPeriodS + q.targetOrbitalPeriodS) * 0.5,
        rationale: "Averages the inner and outer half-periods linearly rather than applying T ∝ a^(3/2).",
      },
    ]);
    return {
      id,
      conceptId: "gravitational-potential-orbits",
      templateArchetype: "orbital-transfer-energy-hohmann",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: ["hohmannTransferTimeS", "hohmannSemiMajorAxisM", "orbitalPeriodS", "targetOrbitalPeriodS"],
      targetQuantityKey: "hohmannTransferTimeS",
      questionPlan: buildDigitFreePlan(
        "Apply Kepler third law to a half-ellipse Hohmann transfer orbit between two circular radii",
        "mcq",
      ),
      stem: pickTemplate(stems, variantIndex, 3),
      options,
      workedSolution: `The transfer ellipse has semi-major axis a = ½(r₁ + r₂) = ${fmt3sf(q.hohmannSemiMajorAxisM, "m")}. Coasting from periapsis to apoapsis takes half an orbital period: t_H = π√(a³ / GM) = ${fmt3sf(truth, "s")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Uses a = ½(r₁ + r₂) and t_H = π√(a³ / GM) to obtain ${fmt3sf(truth, "s")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (6 marks)
  const transferStructStems = [
    `A ${ctx.sat} of mass ${fmtGiven(satelliteMassKg, "kg")} initially orbits ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}) in a circular orbit of radius r₁ = ${fmtGiven(orbitRadiusM, "m")}. Propulsion burns transfer it into a higher coaxial circular orbit of radius r₂ = ${fmtGiven(targetOrbitRadiusM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
    `Mission control commands a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} orbiting ${ctx.body} of mass ${fmtGiven(centralMassKg, "kg")} and surface radius ${fmtGiven(centralRadiusM, "m")} to climb from circular orbital radius r₁ = ${fmtGiven(orbitRadiusM, "m")} to circular orbital radius r₂ = ${fmtGiven(targetOrbitRadiusM, "m")} (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
    `Around ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}), a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} is raised from an inner circular parking orbit of radius r₁ = ${fmtGiven(orbitRadiusM, "m")} to an operational circular orbit of radius r₂ = ${fmtGiven(targetOrbitRadiusM, "m")}. Use G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
    `The orbital diagram depicts a ${fmtGiven(satelliteMassKg, "kg")} ${ctx.sat} transferring between coaxial circular orbits of radii r₁ = ${fmtGiven(orbitRadiusM, "m")} and r₂ = ${fmtGiven(targetOrbitRadiusM, "m")} about ${ctx.body} (mass ${fmtGiven(centralMassKg, "kg")}, radius ${fmtGiven(centralRadiusM, "m")}, G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
  ];
  return {
    id,
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "orbital-transfer-energy-hohmann",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "totalEnergyJ",
      "kineticEnergyJ",
      "targetTotalEnergyJ",
      "targetKineticEnergyJ",
      "transferDeltaTotalEnergyJ",
      "transferDeltaKineticEnergyJ",
      "targetOrbitalPeriodS",
    ],
    questionPlan: buildDigitFreePlan(
      "Analyse circular-to-circular orbital raising across initial bound energy, transfer energy work, and outer Keplerian period",
      "structured",
      ["calculate-initial-total-energy", "determine-transfer-energy-input", "compute-outer-orbital-period"],
    ),
    stem: pickTemplate(transferStructStems, variantIndex),
    parts: [
      {
        partId: "a",
        prompt: `Calculate the initial total mechanical energy of the ${ctx.sat} in the orbit of radius r₁.`,
        marks: 2,
        targetQuantityKey: "totalEnergyJ",
        expectedAnswer: fmt3sf(q.totalEnergyJ, "J"),
        workingSteps: [
          `E_tot(r₁) = −G M m / (2 r₁) = −(6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)} × ${fmtGiven(satelliteMassKg)}) / (2 × ${fmtGiven(orbitRadiusM)}) = ${fmt3sf(q.totalEnergyJ, "J")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Determine the minimum mechanical energy that must be supplied to transfer the ${ctx.sat} into the circular orbit of radius r₂.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "transferDeltaTotalEnergyJ",
        expectedAnswer: fmt3sf(q.transferDeltaTotalEnergyJ, "J"),
        workingSteps: [
          `E_tot(r₂) = −G M m / (2 r₂) = ${fmt3sf(q.targetTotalEnergyJ, "J")}.`,
          `ΔE_tot = E_tot(r₂) − E_tot(r₁) = ${fmt3sf(q.transferDeltaTotalEnergyJ, "J")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Calculate the orbital period of the ${ctx.sat} in the outer circular orbit of radius r₂.`,
        marks: 2,
        targetQuantityKey: "targetOrbitalPeriodS",
        expectedAnswer: fmt3sf(q.targetOrbitalPeriodS, "s"),
        workingSteps: [
          `T₂ = 2π√(r₂³ / GM) = 2π√((${fmtGiven(targetOrbitRadiusM)})³ / (6.67 × 10⁻¹¹ × ${fmtGiven(centralMassKg)})) = ${fmt3sf(q.targetOrbitalPeriodS, "s")}.`,
        ],
      },
    ],
    workedSolution: `(a) Initial bound energy E_tot(r₁) = −GMm/(2r₁) = ${fmt3sf(q.totalEnergyJ, "J")}. (b) Final bound energy E_tot(r₂) = ${fmt3sf(q.targetTotalEnergyJ, "J")}, so ΔE_tot = ${fmt3sf(q.transferDeltaTotalEnergyJ, "J")}. (c) Outer orbital period T₂ = 2π√(r₂³/GM) = ${fmt3sf(q.targetOrbitalPeriodS, "s")}.`,
    markScheme: [
      { code: "M1", partId: "a", criterion: "Applies E_tot = −GMm / (2r₁).", marks: 1 },
      { code: "A1", partId: "a", criterion: `Obtains ${fmt3sf(q.totalEnergyJ, "J")}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Evaluates E_tot(r₂) − E_tot(r₁) = ½GMm(1/r₁ − 1/r₂).", marks: 1 },
      { code: "A1", partId: "b", criterion: `Obtains ${fmt3sf(q.transferDeltaTotalEnergyJ, "J")}.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Applies Kepler's third law at outer radius r₂.", marks: 1 },
      { code: "A1", partId: "c", criterion: `Obtains ${fmt3sf(q.targetOrbitalPeriodS, "s")}.`, marks: 1 },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// 11. TWO-BODY NULL FIELD ("gravitational-force-field", "two-body-collinear-null-field")
// ============================================================================

function buildTwoBodyNullFieldItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  const syllabi = resolveSyllabiTags({
    conceptId: "gravitational-force-field",
    format,
    variantIndex,
  });

  const primaryScales = [0.6, 0.85, 1.0, 1.25, 1.5, 1.8, 2.2];
  const rootRatios: ReadonlyArray<[number, number]> = [
    [3, 1],
    [4, 1],
    [5, 2],
    [5, 1],
    [6, 1],
    [7, 2],
    [8, 3],
    [9, 1],
  ];
  const [rt1, rt2] = rootRatios[variantIndex % rootRatios.length];
  const primaryMassKg = perturbCycle(
    Number((EARTH_MASS_KG * primaryScales[(variantIndex + rng.nextInt(0, 1)) % primaryScales.length]).toPrecision(3)),
    variantIndex,
    primaryScales.length,
  );
  const secondaryMassKg = Number(((primaryMassKg * rt2 ** 2) / rt1 ** 2).toPrecision(3));
  const primaryRadiusM = Number((EARTH_RADIUS_M * [0.85, 1.0, 1.15][variantIndex % 3]).toPrecision(3));
  const secondaryRadiusM = Number((MOON_RADIUS_M * [0.9, 1.0, 1.2][variantIndex % 3]).toPrecision(3));
  const separationM = perturbCycle(
    Number((EARTH_MOON_DISTANCE_M * [0.75, 0.9, 1.05, 1.2, 1.4, 1.65, 1.85][variantIndex % 7]).toPrecision(3)),
    variantIndex,
    7,
  );
  const probeDistanceFromPrimaryM = Number((separationM * [0.35, 0.45, 0.55, 0.62][variantIndex % 4]).toPrecision(3));
  const testMassKg = perturbCycle([400, 650, 900, 1200, 1600, 2100][variantIndex % 6], variantIndex, 6);

  const ctx = TWO_BODY_CONTEXTS[(variantIndex * 3) % TWO_BODY_CONTEXTS.length];
  const spec: TwoBodyNullPointScenario = {
    kind: "two-body-null-point",
    id,
    primaryMassKg,
    primaryRadiusM,
    secondaryMassKg,
    secondaryRadiusM,
    separationM,
    probeDistanceFromPrimaryM,
    testMassKg,
    primaryLabel: ctx.p1,
    secondaryLabel: ctx.p2,
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const difficulty = pickDifficulty(variantIndex);
  const root1 = Math.sqrt(primaryMassKg);
  const root2 = Math.sqrt(secondaryMassKg);

  if (format === "mcq") {
    const askField = variantIndex % 3 === 2;
    if (!askField) {
      const truth = q.nullPointFromPrimaryM;
      const stems = [
        `In a ${ctx.pair}, ${ctx.p1} (mass ${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} (mass ${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}) have a centre-to-centre separation of ${fmtGiven(separationM, "m")}. At what distance from the centre of ${ctx.p1} along the line joining their centres is the resultant gravitational field strength zero?`,
        `${ctx.p1} of mass ${fmtGiven(primaryMassKg, "kg")} (radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} of mass ${fmtGiven(secondaryMassKg, "kg")} (radius ${fmtGiven(secondaryRadiusM, "m")}) form a ${ctx.pair} separated centre-to-centre by ${fmtGiven(separationM, "m")}. Calculate the distance from ${ctx.p1}'s centre to the collinear gravitational null point.`,
        `Along the axis connecting ${ctx.p1} (${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} (${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}) in a ${ctx.pair} of separation ${fmtGiven(separationM, "m")}, locate the zero-field coordinate measured from the centre of ${ctx.p1}.`,
        `Two spherical bodies in a ${ctx.pair} — ${ctx.p1} (${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} (${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}) — lie ${fmtGiven(separationM, "m")} apart between centres. How far from ${ctx.p1}'s centre do their gravitational fields cancel?`,
      ];
      const options = buildNumericMcqOptions(truth, "m", [
        {
          value: (root2 / root1) * separationM,
          rationale: "Uses √M₂ / √M₁ instead of √M₁ / (√M₁ + √M₂) when solving M₁ / x₀² = M₂ / (d − x₀)².",
        },
        {
          value: (primaryMassKg / (primaryMassKg + secondaryMassKg)) * separationM,
          rationale: "Uses the unsquared mass ratio M₁ / (M₁ + M₂) (barycentre formula) instead of the square-root field ratio √M₁ / (√M₁ + √M₂).",
        },
        {
          value: q.nullPointFromSecondaryM,
          rationale: "Calculates the distance from the secondary body's centre rather than from the primary body's centre.",
        },
        {
          value: (root1 / (root1 + root2)) * (separationM - primaryRadiusM - secondaryRadiusM),
          rationale: "Multiplies by surface-to-surface gap (d − R₁ − R₂) instead of centre-to-centre separation d.",
        },
      ]);
      return {
        id,
        conceptId: "gravitational-force-field",
        templateArchetype: "two-body-collinear-null-field",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["nullPointFromPrimaryM", "nullPointFromSecondaryM", "nullPointFraction", "probeFieldMagnitudeNkg"],
        requiredGivens: [
          { name: "primaryMassKg", value: primaryMassKg, unit: "kg", source: "stem" },
          { name: "secondaryMassKg", value: secondaryMassKg, unit: "kg", source: "stem" },
          { name: "separationM", value: separationM, unit: "m", source: "stem" },
        ],
        targetQuantityKey: "nullPointFromPrimaryM",
        questionPlan: buildDigitFreePlan(
          "Balance opposing collinear Newtonian gravitational fields to locate the zero-field null point",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 1),
        options,
        workedSolution: `Equating opposing field magnitudes G M₁ / x₀² = G M₂ / (d − x₀)² gives (d − x₀)/x₀ = √(M₂/M₁), so x₀ = [√M₁ / (√M₁ + √M₂)] d = ${fmt3sf(truth, "m")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses x₀ = d √M₁ / (√M₁ + √M₂) to obtain ${fmt3sf(truth, "m")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // askField at probeDistanceFromPrimaryM
    const truth = q.probeFieldMagnitudeNkg;
    const g1 = (GRAVITATIONAL_CONSTANT * primaryMassKg) / probeDistanceFromPrimaryM ** 2;
    const g2 = (GRAVITATIONAL_CONSTANT * secondaryMassKg) / (separationM - probeDistanceFromPrimaryM) ** 2;
    const stems = [
      `Along the line joining ${ctx.p1} (mass ${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} (mass ${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}) separated centre-to-centre by ${fmtGiven(separationM, "m")}, a ${fmtGiven(testMassKg, "kg")} ${ctx.craft} is at distance ${fmtGiven(probeDistanceFromPrimaryM, "m")} from ${ctx.p1}'s centre. Take G = 6.67 × 10⁻¹¹ N m² kg⁻². What is the magnitude of the resultant gravitational field due to both bodies at the ${ctx.craft}?`,
      `In a ${ctx.pair} of centre-to-centre separation ${fmtGiven(separationM, "m")}, a ${fmtGiven(testMassKg, "kg")} ${ctx.craft} crosses the line of centres ${fmtGiven(probeDistanceFromPrimaryM, "m")} from ${ctx.p1} (${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) toward ${ctx.p2} (${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}). Using G = 6.67 × 10⁻¹¹ N m² kg⁻², calculate |g_net|.`,
      `Determine the net gravitational field magnitude acting on a ${fmtGiven(testMassKg, "kg")} ${ctx.craft} positioned at x = ${fmtGiven(probeDistanceFromPrimaryM, "m")} from ${ctx.p1} (${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) along the ${fmtGiven(separationM, "m")} baseline to ${ctx.p2} (${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}, G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
      `Between ${ctx.p1} (mass ${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} (mass ${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}), whose centres are ${fmtGiven(separationM, "m")} apart, find the combined gravitational field strength at a ${fmtGiven(testMassKg, "kg")} ${ctx.craft} located ${fmtGiven(probeDistanceFromPrimaryM, "m")} from ${ctx.p1}'s centre (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
    ];
    const options = buildNumericMcqOptions(truth, "N kg⁻¹", [
      {
        value: g1 + g2,
        rationale: "Adds the two collinear field magnitudes instead of subtracting opposing gravitational pulls between the two bodies.",
      },
      {
        value: g1,
        rationale: "Includes only the gravitational field of the primary body and ignores the opposing pull of the secondary body.",
      },
      {
        value: q.probeForceMagnitudeN,
        rationale: "Multiplies by spacecraft mass to obtain net force in newtons rather than field strength in N kg⁻¹.",
      },
      {
        value: Math.abs((GRAVITATIONAL_CONSTANT * primaryMassKg) / probeDistanceFromPrimaryM - (GRAVITATIONAL_CONSTANT * secondaryMassKg) / (separationM - probeDistanceFromPrimaryM)),
        rationale: "Uses 1/r instead of 1/r² when superposing gravitational fields.",
      },
    ]);
    return {
      id,
      conceptId: "gravitational-force-field",
      templateArchetype: "two-body-collinear-null-field",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: ["nullPointFromPrimaryM", "probeFieldMagnitudeNkg", "probeFieldXMs2", "probeForceMagnitudeN"],
      targetQuantityKey: "probeFieldMagnitudeNkg",
      questionPlan: buildDigitFreePlan(
        "Superpose opposing inverse-square gravitational fields at an interior collinear probe coordinate",
        "mcq",
      ),
      stem: pickTemplate(stems, variantIndex, 2),
      options,
      workedSolution: `Between the two centres, the gravitational fields oppose: |g_net| = |G M₁ / x² − G M₂ / (d − x)²| = |${fmt3sf(g1)} − ${fmt3sf(g2)}| = ${fmt3sf(truth, "N kg⁻¹")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Subtracts opposing inverse-square field magnitudes to obtain ${fmt3sf(truth, "N kg⁻¹")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (6 marks)
  const nullStructStems = [
    `In a ${ctx.pair}, ${ctx.p1} (mass ${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} (mass ${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}) are separated centre-to-centre by ${fmtGiven(separationM, "m")}. A ${ctx.craft} of mass ${fmtGiven(testMassKg, "kg")} travels along the line joining their centres and passes through a point at distance ${fmtGiven(probeDistanceFromPrimaryM, "m")} from the centre of ${ctx.p1}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
    `A ${fmtGiven(testMassKg, "kg")} ${ctx.craft} coasts along the axis connecting ${ctx.p1} (mass ${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} (mass ${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}) in a ${ctx.pair} of centre-to-centre separation ${fmtGiven(separationM, "m")}, crossing coordinate x = ${fmtGiven(probeDistanceFromPrimaryM, "m")} from ${ctx.p1}'s centre (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
    `Two spherical bodies in a ${ctx.pair} — ${ctx.p1} (${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} (${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}) — lie ${fmtGiven(separationM, "m")} apart between centres while a ${fmtGiven(testMassKg, "kg")} ${ctx.craft} is located ${fmtGiven(probeDistanceFromPrimaryM, "m")} from ${ctx.p1}'s centre along their joining line. Use G = 6.67 × 10⁻¹¹ N m² kg⁻².`,
  ];
  return {
    id,
    conceptId: "gravitational-force-field",
    templateArchetype: "two-body-collinear-null-field",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: ["nullPointFromPrimaryM", "nullPointFromSecondaryM", "nullPointFraction", "probeFieldMagnitudeNkg", "probeFieldXMs2", "probeForceMagnitudeN"],
    questionPlan: buildDigitFreePlan(
      "Locate the two-body collinear gravitational null point and evaluate net field and force at a transit position",
      "structured",
      ["locate-zero-field-point", "compute-collinear-resultant-field", "determine-net-gravitational-force"],
    ),
    stem: pickTemplate(nullStructStems, variantIndex),
    parts: [
      {
        partId: "a",
        prompt: `Calculate the distance from the centre of ${ctx.p1} to the collinear point where the resultant gravitational field strength is zero.`,
        marks: 3,
        targetQuantityKey: "nullPointFromPrimaryM",
        expectedAnswer: fmt3sf(q.nullPointFromPrimaryM, "m"),
        workingSteps: [
          `At the null point, G M₁ / x₀² = G M₂ / (d − x₀)².`,
          `Taking square roots gives x₀ = [√M₁ / (√M₁ + √M₂)] d = ${fmt3sf(q.nullPointFromPrimaryM, "m")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the magnitude of the resultant gravitational field strength when the ${ctx.craft} is ${fmtGiven(probeDistanceFromPrimaryM, "m")} from the centre of ${ctx.p1}.`,
        marks: 2,
        targetQuantityKey: "probeFieldMagnitudeNkg",
        expectedAnswer: fmt3sf(q.probeFieldMagnitudeNkg, "N kg⁻¹"),
        workingSteps: [
          `|g| = |G M₁ / x² − G M₂ / (d − x)²| = ${fmt3sf(q.probeFieldMagnitudeNkg, "N kg⁻¹")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `State the magnitude of the resultant gravitational force on the ${fmtGiven(testMassKg, "kg")} ${ctx.craft} at this point.`,
        marks: 1,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "probeForceMagnitudeN",
        expectedAnswer: fmt3sf(q.probeForceMagnitudeN, "N"),
        workingSteps: [
          `F = m |g| = ${fmtGiven(testMassKg)} × ${fmt3sf(q.probeFieldMagnitudeNkg)} = ${fmt3sf(q.probeForceMagnitudeN, "N")}.`,
        ],
      },
    ],
    workedSolution: `(a) Equating GM₁/x₀² = GM₂/(d − x₀)² yields x₀ = d√M₁/(√M₁ + √M₂) = ${fmt3sf(q.nullPointFromPrimaryM, "m")}. (b) At x = ${fmtGiven(probeDistanceFromPrimaryM, "m")}, |g| = |GM₁/x² − GM₂/(d − x)²| = ${fmt3sf(q.probeFieldMagnitudeNkg, "N kg⁻¹")}. (c) Net force F = m|g| = ${fmt3sf(q.probeForceMagnitudeN, "N")}.`,
    markScheme: [
      { code: "M1", partId: "a", criterion: "Equates opposing inverse-square field strengths GM₁/x₀² = GM₂/(d − x₀)².", marks: 1 },
      { code: "M1", partId: "a", criterion: "Takes square root correctly to form x₀ = d√M₁ / (√M₁ + √M₂).", marks: 1 },
      { code: "A1", partId: "a", criterion: `Obtains x₀ = ${fmt3sf(q.nullPointFromPrimaryM, "m")}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Subtracts opposing field magnitudes at x and (d − x).", marks: 1 },
      { code: "A1", partId: "b", criterion: `Obtains |g| = ${fmt3sf(q.probeFieldMagnitudeNkg, "N kg⁻¹")}.`, marks: 1 },
      { code: "A1", partId: "c", criterion: `Multiplies by spacecraft mass to obtain ${fmt3sf(q.probeForceMagnitudeN, "N")}.`, marks: 1 },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// 12. TWO-BODY POTENTIAL SADDLE ("gravitational-potential-orbits", "two-body-potential-saddle-barrier")
// ============================================================================

function buildTwoBodyPotentialSaddleItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  const syllabi = resolveSyllabiTags({
    conceptId: "gravitational-potential-orbits",
    format,
    variantIndex,
  });

  const primaryMassKg = perturbCycle(
    Number((EARTH_MASS_KG * [0.7, 0.95, 1.15, 1.4, 1.75, 2.1, 2.6][(variantIndex + rng.nextInt(0, 1)) % 7]).toPrecision(3)),
    variantIndex,
    7,
  );
  const massDiv = [9, 16, 25, 36, 49, 64][variantIndex % 6];
  const secondaryMassKg = Number((primaryMassKg / massDiv).toPrecision(3));
  const primaryRadiusM = Number((EARTH_RADIUS_M * [0.85, 1.0, 1.15][variantIndex % 3]).toPrecision(3));
  const secondaryRadiusM = Number((MOON_RADIUS_M * [0.9, 1.05][variantIndex % 2]).toPrecision(3));
  const separationM = perturbCycle(
    Number((EARTH_MOON_DISTANCE_M * [0.7, 0.85, 1.0, 1.2, 1.45][variantIndex % 5]).toPrecision(3)),
    variantIndex,
    5,
  );

  const ctx = TWO_BODY_CONTEXTS[(variantIndex * 7 + 5) % TWO_BODY_CONTEXTS.length];
  const spec: TwoBodyNullPointScenario = {
    kind: "two-body-null-point",
    id,
    primaryMassKg,
    primaryRadiusM,
    secondaryMassKg,
    secondaryRadiusM,
    separationM,
    primaryLabel: ctx.p1,
    secondaryLabel: ctx.p2,
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const difficulty = pickDifficulty(variantIndex, "higher");
  const x0 = q.nullPointFromPrimaryM;

  if (format === "mcq") {
    const askSpeed = variantIndex % 2 === 1;
    if (!askSpeed) {
      const truth = q.potentialAtNullPointJkg;
      const v1 = -(GRAVITATIONAL_CONSTANT * primaryMassKg) / x0;
      const v2 = -(GRAVITATIONAL_CONSTANT * secondaryMassKg) / (separationM - x0);
      const stems = [
        `${ctx.p1} (mass ${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} (mass ${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}) have a centre-to-centre separation of ${fmtGiven(separationM, "m")} in a ${ctx.pair}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻² and zero potential at infinity. What is the combined gravitational potential at the collinear point where the resultant gravitational field is zero?`,
        `In a ${ctx.pair} separated by ${fmtGiven(separationM, "m")} between centres, ${ctx.p1} has mass ${fmtGiven(primaryMassKg, "kg")} (radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} has mass ${fmtGiven(secondaryMassKg, "kg")} (radius ${fmtGiven(secondaryRadiusM, "m")}). Referencing potential to zero at infinity and taking G = 6.67 × 10⁻¹¹ N m² kg⁻², calculate V_g at the gravitational null point.`,
        `Determine the net scalar gravitational potential (zero at infinity) at the collinear saddle point of zero field between ${ctx.p1} (${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} (${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}), whose centres lie ${fmtGiven(separationM, "m")} apart (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
        `Along the ${fmtGiven(separationM, "m")} line of centres of a ${ctx.pair}, ${ctx.p1} (${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} (${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}) create a zero-field saddle point. Using G = 6.67 × 10⁻¹¹ N m² kg⁻², find the total gravitational potential there.`,
      ];
      const options = buildNumericMcqOptions(truth, "J kg⁻¹", [
        {
          value: v1 - v2,
          rationale: "Subtracts the two scalar gravitational potentials instead of adding both negative potentials.",
        },
        {
          value: -truth,
          rationale: "Omits the negative sign on scalar gravitational potential relative to zero at infinity.",
        },
        {
          value: v1,
          rationale: "Includes only the gravitational potential of the primary body and ignores the secondary body's contribution at x₀.",
        },
        {
          value: -(GRAVITATIONAL_CONSTANT * (primaryMassKg + secondaryMassKg)) / separationM,
          rationale: "Divides total mass (M₁ + M₂) by d instead of evaluating −G(√M₁ + √M₂)² / d at the null point.",
        },
      ]);
      return {
        id,
        conceptId: "gravitational-potential-orbits",
        templateArchetype: "two-body-potential-saddle-barrier",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "nullPointFromPrimaryM",
          "nullPointFromSecondaryM",
          "nullPointFraction",
          "potentialAtNullPointJkg",
          "potentialBarrierFromPrimaryJkg",
          "minTransferSpeedFromPrimaryMs",
        ],
        targetQuantityKey: "potentialAtNullPointJkg",
        questionPlan: buildDigitFreePlan(
          "Locate the collinear zero-field saddle point and sum negative scalar gravitational potentials",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 1),
        options,
        workedSolution: `At the zero-field point x₀ = d√M₁/(√M₁ + √M₂) = ${fmt3sf(x0, "m")}, scalar potentials add negatively: V_g(x₀) = −GM₁/x₀ − GM₂/(d − x₀) = −(G/d)(√M₁ + √M₂)² = ${fmt3sf(truth, "J kg⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Sums both negative scalar potentials at x₀ to obtain ${fmt3sf(truth, "J kg⁻¹")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // askSpeed: minTransferSpeedFromPrimaryMs
    const truth = q.minTransferSpeedFromPrimaryMs;
    const vEscIsolated = Math.sqrt((2 * GRAVITATIONAL_CONSTANT * primaryMassKg) / primaryRadiusM);
    const stems = [
      `A ballistic ${ctx.craft} launches from the surface of ${ctx.p1} (mass ${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) directly toward ${ctx.p2} (mass ${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}), whose centre lies ${fmtGiven(separationM, "m")} away (ignore rotation and atmosphere; G = 6.67 × 10⁻¹¹ N m² kg⁻²). What minimum launch speed allows the ${ctx.craft} to pass the gravitational null point and fall onto ${ctx.p2}?`,
      `Neglecting rotation in a ${ctx.pair} of centre-to-centre separation ${fmtGiven(separationM, "m")}, calculate the minimum surface launch speed from ${ctx.p1} (${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) needed for an unpowered ${ctx.craft} to surmount the potential saddle and reach ${ctx.p2} (${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}, G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
      `From the airless surface of ${ctx.p1} (mass ${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}), a ${ctx.craft} is fired along the line of centres toward ${ctx.p2} (mass ${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}) at separation ${fmtGiven(separationM, "m")}. Using G = 6.67 × 10⁻¹¹ N m² kg⁻², determine the threshold launch speed to cross the null-point barrier.`,
      `Determine the least initial speed at ${ctx.p1}'s surface (${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) enabling a ballistic ${ctx.craft} to reach ${ctx.p2} (${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}) across a ${fmtGiven(separationM, "m")} centre-to-centre baseline (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
    ];
    const options = buildNumericMcqOptions(truth, "m s⁻¹", [
      {
        value: Math.sqrt(Math.max(1, 2 * Math.abs(q.potentialAtNullPointJkg))),
        rationale: "Uses |V_null| alone instead of the potential barrier ΔV = V_null − V_surface,primary.",
      },
      {
        value: Math.sqrt(Math.max(1, q.potentialBarrierFromPrimaryJkg)),
        rationale: "Omits the factor of 2 when equating ½v² = ΔV_g, computing √(ΔV_g) instead of √(2ΔV_g).",
      },
      {
        value: Math.sqrt(2 * Math.abs(q.potentialAtPrimarySurfaceJkg) + 2 * Math.abs(q.potentialAtNullPointJkg)),
        rationale: "Adds |V_surface| and |V_null| instead of taking the potential difference V_null − V_surface.",
      },
      {
        value: vEscIsolated * 1.15,
        rationale: "Overestimates launch speed by ignoring the potential saddle reduction between the two bodies.",
      },
    ]);
    return {
      id,
      conceptId: "gravitational-potential-orbits",
      templateArchetype: "two-body-potential-saddle-barrier",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "nullPointFromPrimaryM",
        "potentialAtNullPointJkg",
        "potentialAtPrimarySurfaceJkg",
        "potentialBarrierFromPrimaryJkg",
        "minTransferSpeedFromPrimaryMs",
      ],
      targetQuantityKey: "minTransferSpeedFromPrimaryMs",
      questionPlan: buildDigitFreePlan(
        "Compute gravitational potential barrier from primary surface to collinear saddle point to find minimum ballistic transfer speed",
        "mcq",
      ),
      stem: pickTemplate(stems, variantIndex, 2),
      options,
      workedSolution: `Surface potential at x = R₁ is V(R₁) = −GM₁/R₁ − GM₂/(d − R₁) = ${fmt3sf(q.potentialAtPrimarySurfaceJkg, "J kg⁻¹")}. Null-point potential at x₀ = ${fmt3sf(x0, "m")} is V(x₀) = ${fmt3sf(q.potentialAtNullPointJkg, "J kg⁻¹")}. Potential barrier ΔV = V(x₀) − V(R₁) = ${fmt3sf(q.potentialBarrierFromPrimaryJkg, "J kg⁻¹")}, so v_min = √(2ΔV) = ${fmt3sf(truth, "m s⁻¹")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates ΔV = V(x₀) − V(R₁) and v_min = √(2ΔV) = ${fmt3sf(truth, "m s⁻¹")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (6 marks)
  const saddleStructStems = [
    `Two non-rotating airless spherical bodies in a ${ctx.pair} — ${ctx.p1} of mass ${fmtGiven(primaryMassKg, "kg")} and radius ${fmtGiven(primaryRadiusM, "m")}, and ${ctx.p2} of mass ${fmtGiven(secondaryMassKg, "kg")} and radius ${fmtGiven(secondaryRadiusM, "m")} — have a centre-to-centre separation of ${fmtGiven(separationM, "m")}. Take G = 6.67 × 10⁻¹¹ N m² kg⁻² and potential to be zero at infinity.`,
    `In a ${ctx.pair} of centre-to-centre separation ${fmtGiven(separationM, "m")}, ${ctx.p1} (mass ${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} (mass ${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}) are modelled as airless non-rotating spheres with V_g = 0 at infinity (G = 6.67 × 10⁻¹¹ N m² kg⁻²).`,
    `Mission planners analyse ballistic transfers across a ${ctx.pair} where ${ctx.p1} (${fmtGiven(primaryMassKg, "kg")}, radius ${fmtGiven(primaryRadiusM, "m")}) and ${ctx.p2} (${fmtGiven(secondaryMassKg, "kg")}, radius ${fmtGiven(secondaryRadiusM, "m")}) are separated by ${fmtGiven(separationM, "m")} between centres. Use G = 6.67 × 10⁻¹¹ N m² kg⁻² and zero potential at infinity.`,
  ];
  return {
    id,
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "two-body-potential-saddle-barrier",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: [
      "nullPointFromPrimaryM",
      "nullPointFromSecondaryM",
      "potentialAtNullPointJkg",
      "potentialAtPrimarySurfaceJkg",
      "potentialBarrierFromPrimaryJkg",
      "minTransferSpeedFromPrimaryMs",
    ],
    questionPlan: buildDigitFreePlan(
      "Model a two-body gravitational potential well from collinear null-point coordinate to saddle potential and minimum transfer speed",
      "structured",
      ["locate-collinear-null-point", "evaluate-null-point-potential", "calculate-minimum-surface-launch-speed"],
    ),
    stem: pickTemplate(saddleStructStems, variantIndex),
    parts: [
      {
        partId: "a",
        prompt: `Show where the collinear gravitational null point lies by calculating its distance from the centre of ${ctx.p1}.`,
        marks: 2,
        targetQuantityKey: "nullPointFromPrimaryM",
        expectedAnswer: fmt3sf(q.nullPointFromPrimaryM, "m"),
        workingSteps: [
          `Equating field magnitudes gives x₀ = [√M₁ / (√M₁ + √M₂)] d = ${fmt3sf(q.nullPointFromPrimaryM, "m")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the combined gravitational potential at this null point.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "potentialAtNullPointJkg",
        expectedAnswer: fmt3sf(q.potentialAtNullPointJkg, "J kg⁻¹"),
        workingSteps: [
          `V(x₀) = −G M₁ / x₀ − G M₂ / (d − x₀) = ${fmt3sf(q.potentialAtNullPointJkg, "J kg⁻¹")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the minimum launch speed from the surface of ${ctx.p1} along the line of centres required for a ${ctx.craft} to reach ${ctx.p2}.`,
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "minTransferSpeedFromPrimaryMs",
        expectedAnswer: fmt3sf(q.minTransferSpeedFromPrimaryMs, "m s⁻¹"),
        workingSteps: [
          `V(R₁) = −GM₁/R₁ − GM₂/(d − R₁) = ${fmt3sf(q.potentialAtPrimarySurfaceJkg, "J kg⁻¹")}.`,
          `ΔV = V(x₀) − V(R₁) = ${fmt3sf(q.potentialBarrierFromPrimaryJkg, "J kg⁻¹")}; v_min = √(2ΔV) = ${fmt3sf(q.minTransferSpeedFromPrimaryMs, "m s⁻¹")}.`,
        ],
      },
    ],
    workedSolution: `(a) Null point distance x₀ = d√M₁/(√M₁ + √M₂) = ${fmt3sf(q.nullPointFromPrimaryM, "m")}. (b) Combined scalar potential V(x₀) = ${fmt3sf(q.potentialAtNullPointJkg, "J kg⁻¹")}. (c) Potential barrier from x = R₁ to x₀ is ΔV = ${fmt3sf(q.potentialBarrierFromPrimaryJkg, "J kg⁻¹")}, giving v_min = √(2ΔV) = ${fmt3sf(q.minTransferSpeedFromPrimaryMs, "m s⁻¹")}.`,
    markScheme: [
      { code: "M1", partId: "a", criterion: "Applies x₀ = d√M₁ / (√M₁ + √M₂).", marks: 1 },
      { code: "A1", partId: "a", criterion: `Obtains x₀ = ${fmt3sf(q.nullPointFromPrimaryM, "m")}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Sums both negative scalar potentials −GM₁/x₀ − GM₂/(d − x₀).", marks: 1 },
      { code: "A1", partId: "b", criterion: `Obtains V(x₀) = ${fmt3sf(q.potentialAtNullPointJkg, "J kg⁻¹")}.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Equates ½v_min² to potential barrier V(x₀) − V(R₁).", marks: 1 },
      { code: "A1", partId: "c", criterion: `Obtains v_min = ${fmt3sf(q.minTransferSpeedFromPrimaryMs, "m s⁻¹")}.`, marks: 1 },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// 13. STELLAR RADIATION ("stellar-radiation-hr-diagram", "wien-stefan-boltzmann-brightness")
// ============================================================================

function buildStellarRadiationItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  const syllabi = resolveSyllabiTags({
    conceptId: "stellar-radiation-hr-diagram",
    format,
    variantIndex,
    preferredIbSubtopicId: variantIndex % 2 === 0 ? "ib-e5-fusion-stars" : "ib-b1-thermal-energy-transfers",
  });

  const temps = [4640, 5000, 5450, 5800, 6250, 7250, 8000, 9600, 11600, 14500, 18000];
  const radScales = [5.5, 6.8, 8.4, 10.5, 13.0, 16.5, 21.0, 27.0, 35.0];
  const distPcs = [0.35, 0.48, 0.62, 0.78, 0.96, 1.18, 1.42, 1.65, 1.85];

  const surfaceTempK = perturbCycle(
    temps[(variantIndex + rng.nextInt(0, 1)) % temps.length],
    variantIndex,
    temps.length,
    0.023,
  );
  const stellarRadiusM = perturbCycle(
    Number((SOLAR_RADIUS_M * radScales[(variantIndex * 3) % radScales.length]).toPrecision(3)),
    variantIndex,
    radScales.length,
    0.031,
  );
  const distanceM = perturbCycle(
    Number((PARSEC_M * distPcs[(variantIndex * 5) % distPcs.length]).toPrecision(3)),
    variantIndex,
    distPcs.length,
    0.027,
  );

  const ctx = STELLAR_CONTEXTS[(variantIndex * 5) % STELLAR_CONTEXTS.length];
  const difficulty = pickDifficulty(variantIndex);

  if (format === "mcq") {
    const mode = variantIndex % 3;

    if (mode === 0) {
      // apparentBrightnessWm2 = L / (4 pi d^2), inverse-square diagram
      const spec: StellarRadiationScenario = {
        kind: "stellar-radiation",
        id,
        surfaceTempK,
        stellarRadiusM,
        distanceM,
        diagramVariant: "inverse-square",
      };
      const sol = solveGravAstroScenario(spec);
      const q = sol.quantities;
      const truth = q.apparentBrightnessWm2;

      const stems = [
        `Observations with ${ctx.survey} target a spherical blackbody ${ctx.star} of radius ${fmtGiven(stellarRadiusM, "m")} and effective surface temperature ${fmtGiven(surfaceTempK, "K")} situated ${fmtGiven(distanceM, "m")} from the detector. Take σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴. What apparent brightness (radiant intensity) arrives at the detector?`,
        `A spherical blackbody ${ctx.star} (radius ${fmtGiven(stellarRadiusM, "m")}, photospheric temperature ${fmtGiven(surfaceTempK, "K")}) lies at distance ${fmtGiven(distanceM, "m")} from ${ctx.survey}. Using σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴, calculate the apparent brightness incident at the instrument.`,
        `Determine the radiant flux density b = L / (4πd²) received at ${ctx.survey} from a spherical blackbody ${ctx.star} of radius ${fmtGiven(stellarRadiusM, "m")} and surface temperature ${fmtGiven(surfaceTempK, "K")} located ${fmtGiven(distanceM, "m")} away (σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴).`,
        `Located ${fmtGiven(distanceM, "m")} from ${ctx.survey}, a ${ctx.star} radiates as a spherical blackbody of surface temperature ${fmtGiven(surfaceTempK, "K")} and radius ${fmtGiven(stellarRadiusM, "m")}. Taking σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴, find its apparent brightness.`,
      ];

      const options = buildNumericMcqOptions(truth, "W m⁻²", [
        {
          value: q.luminosityW / distanceM ** 2,
          rationale: "Omits the geometric sphere factor 4π in the denominator of b = L / (4π d²).",
        },
        {
          value: 0.25 * truth,
          rationale: "Uses projected disc area π R² instead of spherical surface area 4π R² when computing stellar luminosity L.",
        },
        {
          value: q.surfaceFluxWm2 * (stellarRadiusM / distanceM),
          rationale: "Scales surface radiant flux by R / d instead of the inverse-square ratio (R / d)².",
        },
        {
          value: q.surfaceFluxWm2,
          rationale: "Quotes the star's surface emittance σ T⁴ rather than the apparent brightness diluted at distance d.",
        },
      ]);

      return {
        id,
        conceptId: "stellar-radiation-hr-diagram",
        templateArchetype: "wien-stefan-boltzmann-brightness",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["luminosityW", "apparentBrightnessWm2", "surfaceFluxWm2", "peakWavelengthNm"],
        targetQuantityKey: "apparentBrightnessWm2",
        questionPlan: buildDigitFreePlan(
          "Combine Stefan-Boltzmann stellar luminosity with spherical inverse-square dilution to find apparent brightness",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 1),
        options,
        workedSolution: `Luminosity L = 4π R² σ T⁴ = 4π(${fmtGiven(stellarRadiusM)})²(5.67 × 10⁻⁸)(${fmtGiven(surfaceTempK)})⁴ = ${fmt3sf(q.luminosityW, "W")}. Apparent brightness b = L / (4π d²) = σ T⁴ (R / d)² = ${fmt3sf(truth, "W m⁻²")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses L = 4πR²σT⁴ and b = L / (4πd²) to obtain ${fmt3sf(truth, "W m⁻²")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (mode === 1) {
      // Inverse Wien + Stefan-Boltzmann -> stellarRadiusM!
      const spec: StellarRadiationScenario = {
        kind: "stellar-radiation",
        id,
        surfaceTempK,
        stellarRadiusM,
        distanceM,
        diagramVariant: "blackbody-curve",
      };
      const sol = solveGravAstroScenario(spec);
      const q = sol.quantities;
      const truth = q.stellarRadiusM;
      const givenLum = Number(q.luminosityW.toPrecision(4));
      const givenPeakNm = Number(q.peakWavelengthNm.toPrecision(4));

      const stems = [
        `Spectrometry from ${ctx.survey} shows that a blackbody ${ctx.star} has total bolometric luminosity ${fmtGiven(givenLum, "W")} and a blackbody spectrum peaking at wavelength ${fmtGiven(givenPeakNm, "nm")}. Take Wien's constant b = 2.90 × 10⁻³ m K and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴. What is the radius of the star?`,
        `A spherical blackbody ${ctx.star} catalogued by ${ctx.survey} radiates total power ${fmtGiven(givenLum, "W")} with spectral peak λ_max = ${fmtGiven(givenPeakNm, "nm")} (b = 2.90 × 10⁻³ m K, σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴). Calculate its stellar radius.`,
        `Determine the radius of a blackbody ${ctx.star} whose continuum emission peaks at ${fmtGiven(givenPeakNm, "nm")} and whose bolometric luminosity measured via ${ctx.survey} is ${fmtGiven(givenLum, "W")}. Use b = 2.90 × 10⁻³ m K and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴.`,
        `Observations by ${ctx.survey} yield bolometric luminosity L = ${fmtGiven(givenLum, "W")} and Wien peak wavelength ${fmtGiven(givenPeakNm, "nm")} for a spherical blackbody ${ctx.star}. Taking b = 2.90 × 10⁻³ m K and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴, find R.`,
      ];

      const options = buildNumericMcqOptions(truth, "m", [
        {
          value: Math.sqrt(givenLum / (STEFAN_BOLTZMANN_WM2K4 * surfaceTempK ** 4)),
          rationale: "Omits the spherical area factor 4π in L = 4π R² σ T⁴ when solving for stellar radius R.",
        },
        {
          value: givenLum / (4 * Math.PI * STEFAN_BOLTZMANN_WM2K4 * surfaceTempK ** 4),
          rationale: "Calculates R² = L / (4π σ T⁴) and forgets to take the square root.",
        },
        {
          value: Math.sqrt(givenLum / (4 * Math.PI * STEFAN_BOLTZMANN_WM2K4 * surfaceTempK ** 2)),
          rationale: "Uses T² instead of T⁴ in the Stefan-Boltzmann law.",
        },
        {
          value: 0.5 * truth,
          rationale: "Uses 16π R² (confusing radius and diameter) when inverting surface area.",
        },
      ]);

      return {
        id,
        conceptId: "stellar-radiation-hr-diagram",
        templateArchetype: "wien-stefan-boltzmann-brightness",
        seed,
        syllabi,
        format: "mcq",
        difficulty: "higher",
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "stellarRadiusM",
          "radiusSolar",
          "surfaceTempK",
          "distanceM",
          "apparentBrightnessWm2",
          "surfaceAreaM2",
        ],
        requiredGivens: [
          { name: "luminosityW", value: givenLum, unit: "W", source: "stem" },
          { name: "peakWavelengthNm", value: givenPeakNm, unit: "nm", source: "stem" },
        ],
        targetQuantityKey: "stellarRadiusM",
        questionPlan: buildDigitFreePlan(
          "Invert Wien displacement law for surface temperature and Stefan-Boltzmann law for stellar radius",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 2),
        options,
        workedSolution: `By Wien's law, T = b / λ_max = 2.90 × 10⁻³ / (${fmtGiven(givenPeakNm)} × 10⁻⁹) = ${fmt3sf(q.surfaceTempK, "K")}. From L = 4π R² σ T⁴, R = √[L / (4π σ T⁴)] = ${fmt3sf(truth, "m")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds T = ${fmt3sf(q.surfaceTempK, "K")} via Wien's law and R = √[L/(4πσT⁴)] = ${fmt3sf(truth, "m")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // mode === 2: peakWavelengthNm via Wien's law
    const spec: StellarRadiationScenario = {
      kind: "stellar-radiation",
      id,
      surfaceTempK,
      stellarRadiusM,
      distanceM,
      diagramVariant: "blackbody-curve",
    };
    const sol = solveGravAstroScenario(spec);
    const q = sol.quantities;
    const truth = q.peakWavelengthNm;

    const stems = [
      `The blackbody continuum of a ${ctx.star} (radius ${fmtGiven(stellarRadiusM, "m")}, distance ${fmtGiven(distanceM, "m")}) corresponds to an effective photospheric temperature of ${fmtGiven(surfaceTempK, "K")} as recorded by ${ctx.survey}. Take Wien's constant b = 2.90 × 10⁻³ m K. At what wavelength, in nm, does its emitted spectrum peak?`,
      `Using ${ctx.survey}, astronomers model a ${ctx.star} of radius ${fmtGiven(stellarRadiusM, "m")} at distance ${fmtGiven(distanceM, "m")} as a blackbody at temperature ${fmtGiven(surfaceTempK, "K")}. Taking b = 2.90 × 10⁻³ m K, calculate λ_max in nanometres.`,
      `Determine the peak emission wavelength (in nm) of a spherical blackbody ${ctx.star} with surface temperature ${fmtGiven(surfaceTempK, "K")}, radius ${fmtGiven(stellarRadiusM, "m")}, and observer distance ${fmtGiven(distanceM, "m")} in ${ctx.survey} (b = 2.90 × 10⁻³ m K).`,
      `A ${ctx.star} located ${fmtGiven(distanceM, "m")} from ${ctx.survey} has radius ${fmtGiven(stellarRadiusM, "m")} and effective blackbody temperature ${fmtGiven(surfaceTempK, "K")}. With b = 2.90 × 10⁻³ m K, find the wavelength in nm where spectral intensity is maximum.`,
    ];

    const options = buildNumericMcqOptions(truth, "nm", [
      {
        value: WIEN_DISPLACEMENT_MK * surfaceTempK * 1e6,
        rationale: "Multiplies Wien's constant by temperature instead of dividing b / T.",
      },
      {
        value: truth * 10,
        rationale: "Makes a decade power-of-ten slip when converting metres to nanometres (10⁻⁸ m instead of 10⁻⁹ m).",
      },
      {
        value: truth * 0.1,
        rationale: "Shifts the decimal one order too small during metres-to-nanometres conversion.",
      },
      {
        value: (1 / truth) * 1e5,
        rationale: "Inverts the ratio T / b instead of b / T.",
      },
    ]);

    return {
      id,
      conceptId: "stellar-radiation-hr-diagram",
      templateArchetype: "wien-stefan-boltzmann-brightness",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: ["peakWavelengthNm", "peakWavelengthM", "luminosityW", "apparentBrightnessWm2"],
      requiredGivens: [
        { name: "surfaceTempK", value: surfaceTempK, unit: "K", source: "stem" },
      ],
      targetQuantityKey: "peakWavelengthNm",
      questionPlan: buildDigitFreePlan(
        "Apply Wien displacement law to determine blackbody spectral peak wavelength in nanometres",
        "mcq",
      ),
      stem: pickTemplate(stems, variantIndex, 3),
      options,
      workedSolution: `Using Wien's displacement law, λ_max = b / T = 2.90 × 10⁻³ / ${fmtGiven(surfaceTempK)} = ${fmt3sf(q.peakWavelengthM, "m")} = ${fmt3sf(truth, "nm")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates λ_max = 2.90 × 10⁻³ / ${fmtGiven(surfaceTempK)} = ${fmt3sf(truth, "nm")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (6 marks)
  const spec: StellarRadiationScenario = {
    kind: "stellar-radiation",
    id,
    surfaceTempK,
    stellarRadiusM,
    distanceM,
    diagramVariant: variantIndex % 2 === 0 ? "blackbody-curve" : "inverse-square",
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;

  if (variantIndex % 2 === 1) {
    // Inverse Wien + apparent brightness -> T -> L -> R
    const givenPeakNm = Number(q.peakWavelengthNm.toPrecision(4));
    const givenBright = Number(q.apparentBrightnessWm2.toPrecision(4));
    const invStems = [
      `Astronomers using ${ctx.survey} observe a spherical blackbody ${ctx.star} at distance ${fmtGiven(distanceM, "m")}. Its continuous spectrum peaks at wavelength ${fmtGiven(givenPeakNm, "nm")} and its apparent brightness at the telescope is ${fmtGiven(givenBright, "W m⁻²")}. Take b = 2.90 × 10⁻³ m K and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴.`,
      `Data from ${ctx.survey} for a spherical blackbody ${ctx.star} situated ${fmtGiven(distanceM, "m")} from the detector show a spectral peak at λ_max = ${fmtGiven(givenPeakNm, "nm")} and received radiant flux density ${fmtGiven(givenBright, "W m⁻²")} (b = 2.90 × 10⁻³ m K, σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴).`,
      `At distance ${fmtGiven(distanceM, "m")}, a ${ctx.star} behaves as an ideal blackbody radiator whose emission peaks at ${fmtGiven(givenPeakNm, "nm")} and delivers apparent brightness ${fmtGiven(givenBright, "W m⁻²")} to ${ctx.survey}. Use b = 2.90 × 10⁻³ m K and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴.`,
    ];
    return {
      id,
      conceptId: "stellar-radiation-hr-diagram",
      templateArchetype: "wien-stefan-boltzmann-brightness",
      seed,
      syllabi,
      format: "structured",
      difficulty: "higher",
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: ["surfaceTempK", "luminosityW", "stellarRadiusM", "radiusSolar", "surfaceAreaM2"],
      requiredGivens: [
        { name: "peakWavelengthNm", value: givenPeakNm, unit: "nm", source: "stem" },
        { name: "apparentBrightnessWm2", value: givenBright, unit: "W m⁻²", source: "stem" },
        { name: "distanceM", value: distanceM, unit: "m", source: "stem" },
      ],
      questionPlan: buildDigitFreePlan(
        "Combine Wien peak wavelength and inverse-square apparent brightness to deduce stellar luminosity and radius",
        "structured",
        ["determine-surface-temperature-from-wien", "calculate-luminosity-from-brightness", "solve-stellar-radius"],
      ),
      stem: pickTemplate(invStems, variantIndex),
      parts: [
        {
          partId: "a",
          prompt: `Calculate the surface temperature of the star.`,
          marks: 2,
          targetQuantityKey: "surfaceTempK",
          expectedAnswer: fmt3sf(q.surfaceTempK, "K"),
          workingSteps: [
            `T = b / λ_max = 2.90 × 10⁻³ / (${fmtGiven(givenPeakNm)} × 10⁻⁹) = ${fmt3sf(q.surfaceTempK, "K")}.`,
          ],
        },
        {
          partId: "b",
          prompt: `Show what total luminosity the star radiates by calculating L in watts.`,
          marks: 2,
          targetQuantityKey: "luminosityW",
          expectedAnswer: fmt3sf(q.luminosityW, "W"),
          workingSteps: [
            `L = 4π d² b_app = 4π × (${fmtGiven(distanceM)})² × ${fmtGiven(givenBright)} = ${fmt3sf(q.luminosityW, "W")}.`,
          ],
        },
        {
          partId: "c",
          prompt: `Determine the radius of the star.`,
          marks: 2,
          dependsOnPartIds: ["a", "b"],
          targetQuantityKey: "stellarRadiusM",
          expectedAnswer: fmt3sf(q.stellarRadiusM, "m"),
          workingSteps: [
            `From L = 4π R² σ T⁴, R = √[L / (4π σ T⁴)].`,
            `R = ${fmt3sf(q.stellarRadiusM, "m")}.`,
          ],
        },
      ],
      workedSolution: `(a) Wien's law gives T = 2.90 × 10⁻³ / (${fmtGiven(givenPeakNm)} × 10⁻⁹) = ${fmt3sf(q.surfaceTempK, "K")}. (b) Inverse-square law gives L = 4π d² b_app = ${fmt3sf(q.luminosityW, "W")}. (c) Stefan-Boltzmann law gives R = √[L/(4πσT⁴)] = ${fmt3sf(q.stellarRadiusM, "m")}.`,
      markScheme: [
        { code: "M1", partId: "a", criterion: "Converts nm to m and applies T = b / λ_max.", marks: 1 },
        { code: "A1", partId: "a", criterion: `Obtains T = ${fmt3sf(q.surfaceTempK, "K")}.`, marks: 1 },
        { code: "M1", partId: "b", criterion: "Applies L = 4π d² b_app.", marks: 1 },
        { code: "A1", partId: "b", criterion: `Obtains L = ${fmt3sf(q.luminosityW, "W")}.`, marks: 1 },
        { code: "M1", partId: "c", criterion: "Rearranges L = 4π R² σ T⁴ for R.", marks: 1 },
        { code: "A1", partId: "c", criterion: `Obtains R = ${fmt3sf(q.stellarRadiusM, "m")}.`, marks: 1 },
      ],
      totalMarks: 6,
      generatorModel,
    };
  }

  const fwdStems = [
    `A spherical blackbody ${ctx.star} observed by ${ctx.survey} has surface temperature ${fmtGiven(surfaceTempK, "K")}, radius ${fmtGiven(stellarRadiusM, "m")}, and lies at distance ${fmtGiven(distanceM, "m")} from Earth. Take b = 2.90 × 10⁻³ m K and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴.`,
    `Catalogued in ${ctx.survey}, a ${ctx.star} of photospheric temperature ${fmtGiven(surfaceTempK, "K")} and radius ${fmtGiven(stellarRadiusM, "m")} is located ${fmtGiven(distanceM, "m")} away (b = 2.90 × 10⁻³ m K, σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴).`,
    `Modelling a ${ctx.star} at distance ${fmtGiven(distanceM, "m")} as a spherical blackbody of radius ${fmtGiven(stellarRadiusM, "m")} and effective temperature ${fmtGiven(surfaceTempK, "K")}, astronomers analyse readings from ${ctx.survey}. Use b = 2.90 × 10⁻³ m K and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴.`,
  ];

  return {
    id,
    conceptId: "stellar-radiation-hr-diagram",
    templateArchetype: "wien-stefan-boltzmann-brightness",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: ["peakWavelengthNm", "peakWavelengthM", "luminosityW", "apparentBrightnessWm2"],
    questionPlan: buildDigitFreePlan(
      "Evaluate blackbody peak wavelength, Stefan-Boltzmann luminosity, and apparent brightness at observer distance",
      "structured",
      ["calculate-peak-wavelength", "calculate-stellar-luminosity", "evaluate-apparent-brightness"],
    ),
    stem: pickTemplate(fwdStems, variantIndex),
    parts: [
      {
        partId: "a",
        prompt: `Calculate the peak emission wavelength, in nm, of the star's spectrum.`,
        marks: 2,
        targetQuantityKey: "peakWavelengthNm",
        expectedAnswer: fmt3sf(q.peakWavelengthNm, "nm"),
        workingSteps: [
          `λ_max = b / T = 2.90 × 10⁻³ / ${fmtGiven(surfaceTempK)} = ${fmt3sf(q.peakWavelengthNm, "nm")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the total luminosity of the star.`,
        marks: 2,
        targetQuantityKey: "luminosityW",
        expectedAnswer: fmt3sf(q.luminosityW, "W"),
        workingSteps: [
          `L = 4π R² σ T⁴ = 4π × (${fmtGiven(stellarRadiusM)})² × 5.67 × 10⁻⁸ × (${fmtGiven(surfaceTempK)})⁴ = ${fmt3sf(q.luminosityW, "W")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the apparent brightness received at Earth.`,
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "apparentBrightnessWm2",
        expectedAnswer: fmt3sf(q.apparentBrightnessWm2, "W m⁻²"),
        workingSteps: [
          `b_app = L / (4π d²) = ${fmt3sf(q.luminosityW)} / (4π × (${fmtGiven(distanceM)})²) = ${fmt3sf(q.apparentBrightnessWm2, "W m⁻²")}.`,
        ],
      },
    ],
    workedSolution: `(a) λ_max = b/T = ${fmt3sf(q.peakWavelengthNm, "nm")}. (b) L = 4πR²σT⁴ = ${fmt3sf(q.luminosityW, "W")}. (c) Apparent brightness b_app = L/(4πd²) = ${fmt3sf(q.apparentBrightnessWm2, "W m⁻²")}.`,
    markScheme: [
      { code: "M1", partId: "a", criterion: "Uses λ_max = 2.90 × 10⁻³ / T.", marks: 1 },
      { code: "A1", partId: "a", criterion: `Obtains ${fmt3sf(q.peakWavelengthNm, "nm")}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Applies L = 4π R² σ T⁴.", marks: 1 },
      { code: "A1", partId: "b", criterion: `Obtains ${fmt3sf(q.luminosityW, "W")}.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Applies b_app = L / (4π d²).", marks: 1 },
      { code: "A1", partId: "c", criterion: `Obtains ${fmt3sf(q.apparentBrightnessWm2, "W m⁻²")}.`, marks: 1 },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// 14. HR DIAGRAM ("stellar-radiation-hr-diagram", "hr-diagram-stellar-radius-evolution")
// ============================================================================

const HR_TARGET_CATALOGUE: ReadonlyArray<{
  readonly name: string;
  readonly tempK: number;
  readonly lumSolar: number;
  readonly region: HrRegion;
}> = [
  { name: "Star Alpha", tempK: 3800, lumSolar: 180, region: "red-giant" },
  { name: "Star Beta", tempK: 15000, lumSolar: 0.004, region: "white-dwarf" },
  { name: "Star Gamma", tempK: 8400, lumSolar: 24, region: "main-sequence" },
  { name: "Star Delta", tempK: 4400, lumSolar: 35000, region: "supergiant" },
  { name: "Star Epsilon", tempK: 6600, lumSolar: 4.5, region: "main-sequence" },
  { name: "Star Zeta", tempK: 4100, lumSolar: 260, region: "red-giant" },
  { name: "Star Eta", tempK: 18500, lumSolar: 0.008, region: "white-dwarf" },
  { name: "Star Theta", tempK: 9200, lumSolar: 48000, region: "supergiant" },
  { name: "Star Iota", tempK: 7600, lumSolar: 14, region: "main-sequence" },
  { name: "Star Kappa", tempK: 3600, lumSolar: 320, region: "red-giant" },
  { name: "Star Lambda", tempK: 12500, lumSolar: 0.0025, region: "white-dwarf" },
  { name: "Star Mu", tempK: 5400, lumSolar: 22000, region: "supergiant" },
];

const HR_SURVEY_FRAMINGS = [
  "an open-cluster Gaia photometric survey",
  "a galactic-disc multi-band stellar census",
  "a space-astrometry cluster catalogue",
  "a southern-hemisphere spectroscopic star survey",
  "a globular-cluster stellar population chart",
  "an interferometric stellar benchmark sample",
  "a wide-field optical sky survey",
  "an orbital observatory HR calibration field",
  "a parallax-calibrated stellar evolution atlas",
  "a deep-sky echelle spectrograph programme",
] as const;

function buildHrStarsForVariant(variantIndex: number): {
  stars: HrStarSpec[];
  target: HrStarSpec;
} {
  const baseIdx = variantIndex % HR_TARGET_CATALOGUE.length;
  const rawCycle = Math.floor(variantIndex / HR_TARGET_CATALOGUE.length);
  const boundedCycle = rawCycle % 6;
  const tempScale = 1 + 0.014 * boundedCycle;
  const lumScale = 1 + 0.045 * boundedCycle;
  const entries = [
    HR_TARGET_CATALOGUE[baseIdx],
    HR_TARGET_CATALOGUE[(baseIdx + 1) % HR_TARGET_CATALOGUE.length],
    HR_TARGET_CATALOGUE[(baseIdx + 2) % HR_TARGET_CATALOGUE.length],
    HR_TARGET_CATALOGUE[(baseIdx + 3) % HR_TARGET_CATALOGUE.length],
  ];
  const stars: HrStarSpec[] = entries.map((e, idx) => ({
    id: `star-${idx + 1}`,
    label: rawCycle > 0 ? `${e.name}-${rawCycle + 1}` : e.name,
    surfaceTempK: Number((e.tempK * tempScale).toPrecision(3)),
    luminositySolar: Number((e.lumSolar * lumScale).toPrecision(3)),
    region: e.region,
  }));
  return { stars, target: stars[0] };
}

function buildHrDiagramItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  _rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  const syllabi = resolveSyllabiTags({
    conceptId: "stellar-radiation-hr-diagram",
    format,
    variantIndex,
    preferredIbSubtopicId: "ib-e5-fusion-stars",
  });

  const { stars, target } = buildHrStarsForVariant(variantIndex);
  const survey = HR_SURVEY_FRAMINGS[(variantIndex * 3) % HR_SURVEY_FRAMINGS.length];
  const difficulty = pickDifficulty(variantIndex);

  if (format === "mcq") {
    const isQualitativeRegion = variantIndex % 4 === 3;

    if (isQualitativeRegion) {
      const spec: HrDiagramScenario = {
        kind: "hr-diagram",
        id,
        stars,
        targetStarId: target.id,
        hideRegionNames: true,
        showRadiusIsolines: false,
      };
      const sol = solveGravAstroScenario(spec);
      const truthRegion = String(sol.classifications.region) as HrRegion;

      const qualStems = [
        `On the Hertzsprung–Russell diagram compiled from ${survey} (with evolutionary region labels masked), ${target.label} has effective surface temperature ${fmtGiven(target.surfaceTempK, "K")} and luminosity ${fmtGiven(target.luminositySolar)} L☉. In which stellar evolutionary region does ${target.label} lie?`,
        `Plotted from ${survey} with region titles hidden, ${target.label} occupies Hertzsprung–Russell coordinates T = ${fmtGiven(target.surfaceTempK, "K")} and L = ${fmtGiven(target.luminositySolar)} L☉. Which evolutionary group classifies ${target.label}?`,
        `Data from ${survey} place ${target.label} on an unlabelled Hertzsprung–Russell diagram at photospheric temperature ${fmtGiven(target.surfaceTempK, "K")} and bolometric luminosity ${fmtGiven(target.luminositySolar)} L☉. Identify its stellar region.`,
      ];

      const regionDescriptions: Record<HrRegion, { text: string; wrongRationale: string }> = {
        "main-sequence": {
          text: "Main-sequence band, fusing hydrogen into helium in hydrostatic core equilibrium",
          wrongRationale: "Misplaces the star onto the hydrogen-fusing main-sequence diagonal despite its off-diagonal radius and luminosity.",
        },
        "red-giant": {
          text: "Red-giant branch, having a cool expanded envelope and high luminosity",
          wrongRationale: "Confuses the star's temperature–luminosity coordinates with the cool, moderately luminous red-giant branch.",
        },
        "supergiant": {
          text: "Supergiant region across the uppermost luminosity band of the diagram",
          wrongRationale: "Assigns the star to the extreme-luminosity supergiant band near the top of the HR diagram.",
        },
        "white-dwarf": {
          text: "White-dwarf region in the hot, low-luminosity lower-left quadrant",
          wrongRationale: "Places the star in the degenerate white-dwarf lower-left region despite its incompatible luminosity or temperature.",
        },
      };

      const order: readonly HrRegion[] = [
        "main-sequence",
        "red-giant",
        "supergiant",
        "white-dwarf",
      ];
      const options: McqOptionItem[] = order.map((reg, idx) => ({
        label: MCQ_OPTION_LABELS[idx],
        text: regionDescriptions[reg].text,
        isCorrect: reg === truthRegion,
        ...(reg === truthRegion
          ? {}
          : { distractorRationale: regionDescriptions[reg].wrongRationale }),
      }));

      return {
        id,
        conceptId: "stellar-radiation-hr-diagram",
        templateArchetype: "hr-diagram-stellar-radius-evolution",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["region", "radiusSolar", "stellarRadiusM"],
        requiredGivens: [
          { name: "surfaceTempK", value: target.surfaceTempK, unit: "K", source: "stem" },
          { name: "luminositySolar", value: target.luminositySolar, source: "stem" },
        ],
        targetMode: "qualitative",
        targetQuantityKey: "region",
        questionPlan: buildDigitFreePlan(
          "Classify a plotted star into its evolutionary region on the Hertzsprung-Russell diagram from temperature and solar luminosity",
          "mcq",
        ),
        stem: pickTemplate(qualStems, variantIndex, 1),
        options,
        workedSolution: `With T = ${fmtGiven(target.surfaceTempK, "K")} and L = ${fmtGiven(target.luminositySolar)} L☉ (note temperature increases from right to left on an HR diagram), ${target.label} lies in the ${truthRegion.replace("-", " ")} region (${truthRegion}).`,
        markScheme: [
          {
            code: "A1",
            criterion: `Identifies the ${truthRegion} region from T = ${fmtGiven(target.surfaceTempK, "K")} and L = ${fmtGiven(target.luminositySolar)} L☉.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Quantitative HR MCQ: radiusSolar
    const spec: HrDiagramScenario = {
      kind: "hr-diagram",
      id,
      stars,
      targetStarId: target.id,
      showRadiusIsolines: false,
    };
    const sol = solveGravAstroScenario(spec);
    const q = sol.quantities;
    const truth = q.radiusSolar;

    const quantStems = [
      `In ${survey}, ${target.label} is plotted on the Hertzsprung–Russell diagram at surface temperature ${fmtGiven(target.surfaceTempK, "K")} and luminosity ${fmtGiven(target.luminositySolar)} L☉. Take L☉ = 3.83 × 10²⁶ W, R☉ = 6.96 × 10⁸ m, and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴. What is the radius of ${target.label} in solar radii (R☉)?`,
      `On the HR diagram derived from ${survey}, ${target.label} has photospheric temperature ${fmtGiven(target.surfaceTempK, "K")} and bolometric luminosity ${fmtGiven(target.luminositySolar)} L☉ (L☉ = 3.83 × 10²⁶ W, R☉ = 6.96 × 10⁸ m, σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴). Calculate R / R☉ for ${target.label}.`,
      `Determine the stellar radius of ${target.label} as a multiple of R☉ given its HR coordinates from ${survey}: T = ${fmtGiven(target.surfaceTempK, "K")} and L = ${fmtGiven(target.luminositySolar)} L☉. Use L☉ = 3.83 × 10²⁶ W, R☉ = 6.96 × 10⁸ m, and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴.`,
      `Photometry in ${survey} locates ${target.label} at effective temperature ${fmtGiven(target.surfaceTempK, "K")} and luminosity ${fmtGiven(target.luminositySolar)} L☉ on the Hertzsprung–Russell chart. Taking L☉ = 3.83 × 10²⁶ W, R☉ = 6.96 × 10⁸ m, and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴, find its radius in R☉.`,
    ];

    const options = buildNumericMcqOptions(truth, "R☉", [
      {
        value: truth ** 2,
        rationale: "Computes (R / R☉)² = L / (4π R☉² σ T⁴) and forgets to take the square root.",
      },
      {
        value: Math.sqrt(target.luminositySolar) * (target.surfaceTempK / 5772) ** 2,
        rationale: "Inverts the temperature ratio to (T / T☉)² instead of (T☉ / T)² when rearranging L ∝ R² T⁴.",
      },
      {
        value: Math.sqrt(target.luminositySolar) * (5772 / target.surfaceTempK),
        rationale: "Uses first power (T☉ / T) instead of squared (T☉ / T)² after taking the square root of T⁴.",
      },
      {
        value: target.luminositySolar * (5772 / target.surfaceTempK) ** 2,
        rationale: "Forgets to take the square root of the luminosity ratio L / L☉ while taking the root of T⁴.",
      },
    ]);

    return {
      id,
      conceptId: "stellar-radiation-hr-diagram",
      templateArchetype: "hr-diagram-stellar-radius-evolution",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: ["radiusSolar", "stellarRadiusM", "luminosityW", "peakWavelengthNm"],
      requiredGivens: [
        { name: "surfaceTempK", value: target.surfaceTempK, unit: "K", source: "stem" },
        { name: "luminositySolar", value: target.luminositySolar, source: "stem" },
      ],
      targetQuantityKey: "radiusSolar",
      questionPlan: buildDigitFreePlan(
        "Determine stellar radius in solar radii from Hertzsprung-Russell luminosity and surface temperature coordinates",
        "mcq",
      ),
      stem: pickTemplate(quantStems, variantIndex, 2),
      options,
      workedSolution: `Luminosity L = ${fmtGiven(target.luminositySolar)} × 3.83 × 10²⁶ = ${fmt3sf(q.luminosityW, "W")}. From L = 4π R² σ T⁴, R = √[L / (4π σ T⁴)] = ${fmt3sf(q.stellarRadiusM, "m")}, so R / R☉ = R / (6.96 × 10⁸) = ${fmt3sf(truth, "R☉")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Applies Stefan-Boltzmann scaling to obtain ${fmt3sf(truth, "R☉")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (5 marks: qualitative region 1m + luminosityW 2m + radiusSolar 2m)
  const spec: HrDiagramScenario = {
    kind: "hr-diagram",
    id,
    stars,
    targetStarId: target.id,
    hideRegionNames: true,
    showRadiusIsolines: false,
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const truthRegion = String(sol.classifications.region) as HrRegion;
  const hrStructStems = [
    `The Hertzsprung–Russell diagram from ${survey} plots four stars with region names masked. ${target.label} has surface temperature ${fmtGiven(target.surfaceTempK, "K")} and luminosity ${fmtGiven(target.luminositySolar)} L☉. Take L☉ = 3.83 × 10²⁶ W, R☉ = 6.96 × 10⁸ m, and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴.`,
    `Compiled during ${survey}, an unlabelled Hertzsprung–Russell chart includes ${target.label} at effective temperature ${fmtGiven(target.surfaceTempK, "K")} and bolometric luminosity ${fmtGiven(target.luminositySolar)} L☉ (L☉ = 3.83 × 10²⁶ W, R☉ = 6.96 × 10⁸ m, σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴).`,
    `Four benchmark stars from ${survey} are displayed on a Hertzsprung–Russell diagram without region labels. For ${target.label}, T = ${fmtGiven(target.surfaceTempK, "K")} and L = ${fmtGiven(target.luminositySolar)} L☉. Use L☉ = 3.83 × 10²⁶ W, R☉ = 6.96 × 10⁸ m, and σ = 5.67 × 10⁻⁸ W m⁻² K⁻⁴.`,
  ];

  return {
    id,
    conceptId: "stellar-radiation-hr-diagram",
    templateArchetype: "hr-diagram-stellar-radius-evolution",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: ["region", "luminosityW", "stellarRadiusM", "radiusSolar", "peakWavelengthNm"],
    requiredGivens: [
      { name: "surfaceTempK", value: target.surfaceTempK, unit: "K", source: "stem" },
      { name: "luminositySolar", value: target.luminositySolar, source: "stem" },
    ],
    questionPlan: buildDigitFreePlan(
      "Interpret Hertzsprung-Russell coordinates to classify stellar evolutionary stage and compute luminosity and radius",
      "structured",
      ["identify-hr-evolutionary-region", "convert-luminosity-to-watts", "calculate-radius-in-solar-units"],
    ),
    stem: pickTemplate(hrStructStems, variantIndex),
    parts: [
      {
        partId: "a",
        prompt: `State the stellar evolutionary region on the HR diagram in which ${target.label} is located.`,
        marks: 1,
        targetMode: "qualitative",
        targetQuantityKey: "region",
        expectedAnswer: `${truthRegion} region on the Hertzsprung–Russell diagram.`,
        workingSteps: [
          `From its temperature and luminosity position on the HR diagram, the star belongs to the ${truthRegion} group.`,
        ],
      },
      {
        partId: "b",
        prompt: `Calculate the luminosity of ${target.label} in watts.`,
        marks: 2,
        targetQuantityKey: "luminosityW",
        expectedAnswer: fmt3sf(q.luminosityW, "W"),
        workingSteps: [
          `L = (${fmtGiven(target.luminositySolar)})(3.83 × 10²⁶ W) = ${fmt3sf(q.luminosityW, "W")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Determine the radius of ${target.label} as a multiple of the solar radius R☉.`,
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "radiusSolar",
        expectedAnswer: fmt3sf(q.radiusSolar, "R☉"),
        workingSteps: [
          `R = √[L / (4π σ T⁴)] = ${fmt3sf(q.stellarRadiusM, "m")}.`,
          `R / R☉ = ${fmt3sf(q.stellarRadiusM)} / (6.96 × 10⁸) = ${fmt3sf(q.radiusSolar, "R☉")}.`,
        ],
      },
    ],
    workedSolution: `(a) ${target.label} lies in the ${truthRegion} region. (b) L = ${fmtGiven(target.luminositySolar)} × 3.83 × 10²⁶ = ${fmt3sf(q.luminosityW, "W")}. (c) R = √[L/(4πσT⁴)] = ${fmt3sf(q.stellarRadiusM, "m")} = ${fmt3sf(q.radiusSolar, "R☉")}.`,
    markScheme: [
      { code: "A1", partId: "a", criterion: `States ${truthRegion}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Multiplies L / L☉ by 3.83 × 10²⁶ W.", marks: 1 },
      { code: "A1", partId: "b", criterion: `Obtains L = ${fmt3sf(q.luminosityW, "W")}.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Applies R = √[L / (4π σ T⁴)] and divides by R☉.", marks: 1 },
      { code: "A1", partId: "c", criterion: `Obtains ${fmt3sf(q.radiusSolar, "R☉")}.`, marks: 1 },
    ],
    totalMarks: 5,
    generatorModel,
  };
}

// ============================================================================
// 15. STELLAR PARALLAX ("stellar-radiation-hr-diagram", "stellar-parallax-distance-brightness")
// ============================================================================

function buildStellarParallaxItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  _rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  const syllabi = resolveSyllabiTags({
    conceptId: "stellar-radiation-hr-diagram",
    format,
    variantIndex,
    preferredIbSubtopicId: "ib-e5-fusion-stars",
  });
  const includesNonIb = syllabi.some((s) => s.syllabus !== "ib");

  const parallaxes = [
    0.125, 0.15, 0.18, 0.22, 0.26, 0.32, 0.38, 0.46, 0.56, 0.68,
  ];
  const lumFactors = [120, 180, 260, 380, 560, 820, 1200, 1800, 2600, 3800];

  const parallaxArcsec = perturbCycle(
    parallaxes[variantIndex % parallaxes.length],
    variantIndex,
    parallaxes.length,
    0.019,
  );
  const stellarLuminosityW = perturbCycle(
    Number((SOLAR_LUMINOSITY_W * lumFactors[(variantIndex * 3) % lumFactors.length]).toPrecision(3)),
    variantIndex,
    lumFactors.length,
    0.031,
  );

  const spec: StellarParallaxScenario = {
    kind: "stellar-parallax",
    id,
    parallaxArcsec,
    baselineAu: 1,
    stellarLuminosityW,
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const ctx = STELLAR_CONTEXTS[(variantIndex * 7 + 5) % STELLAR_CONTEXTS.length];
  const difficulty = pickDifficulty(variantIndex);
  const parsecNote = includesNonIb
    ? " (1 pc is the distance at which a 1 AU baseline subtends a parallax angle of 1 arcsecond, so d / pc = 1 / (p / arcsec))"
    : "";

  if (format === "mcq") {
    const mode = variantIndex % 3;

    if (mode === 0) {
      // distanceLy = (1 / p) * 3.26
      const truth = q.distanceLy;
      const stems = [
        `Astrometric measurements from ${ctx.survey} over a 1 AU orbital baseline determine that a ${ctx.star} (luminosity ${fmtGiven(stellarLuminosityW, "W")}) has an annual parallax angle of ${fmtGiven(parallaxArcsec, "arcsec")}${parsecNote}. Take 1 pc = 3.26 ly. What is the distance to the star in light-years?`,
        `Across Earth's 1 AU semi-major orbital baseline, ${ctx.survey} records an annual stellar parallax of ${fmtGiven(parallaxArcsec, "arcsec")} for a ${ctx.star} of luminosity ${fmtGiven(stellarLuminosityW, "W")}${parsecNote}. Using 1 pc = 3.26 ly, calculate the distance in light-years.`,
        `Determine the distance in light-years to a ${ctx.star} (luminosity ${fmtGiven(stellarLuminosityW, "W")}) whose annual parallax angle across a 1 AU baseline is ${fmtGiven(parallaxArcsec, "arcsec")} in ${ctx.survey}${parsecNote}. Take 1 pc = 3.26 ly.`,
        `Six-month baseline observations (1 AU radius) with ${ctx.survey} yield parallax p = ${fmtGiven(parallaxArcsec, "arcsec")} for a ${ctx.star} radiating ${fmtGiven(stellarLuminosityW, "W")}${parsecNote}. Given 1 pc = 3.26 ly, how many light-years away is the star?`,
      ];
      const options = buildNumericMcqOptions(truth, "ly", [
        {
          value: q.distancePc,
          rationale: "Computes distance in parsecs d = 1 / p and forgets to multiply by 3.26 ly pc⁻¹.",
        },
        {
          value: q.distancePc / LIGHT_YEARS_PER_PARSEC,
          rationale: "Divides distance in parsecs by 3.26 instead of multiplying by 3.26 ly pc⁻¹.",
        },
        {
          value: parallaxArcsec * LIGHT_YEARS_PER_PARSEC,
          rationale: "Multiplies parallax angle p by 3.26 instead of inverting p first.",
        },
        {
          value: 0.5 * truth,
          rationale: "Halves the parallax angle or baseline by confusing peak-to-peak six-month shift with semi-annual parallax p.",
        },
      ]);
      return {
        id,
        conceptId: "stellar-radiation-hr-diagram",
        templateArchetype: "stellar-parallax-distance-brightness",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["distancePc", "distanceLy", "distanceM", "distanceAu", "apparentBrightnessWm2"],
        requiredGivens: [
          { name: "parallaxArcsec", value: parallaxArcsec, unit: "arcsec", source: "stem" },
          { name: "baselineAu", value: 1, unit: "AU", source: "either" },
        ],
        targetQuantityKey: "distanceLy",
        questionPlan: buildDigitFreePlan(
          "Convert annual stellar parallax angle in arcseconds to distance in parsecs and light-years",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 1),
        options,
        workedSolution: `Distance in parsecs d = 1 / p = 1 / ${fmtGiven(parallaxArcsec)} = ${fmt3sf(q.distancePc, "pc")}. Converting to light-years gives d = ${fmt3sf(q.distancePc)} × 3.26 = ${fmt3sf(truth, "ly")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes d = (1 / ${fmtGiven(parallaxArcsec)}) × 3.26 = ${fmt3sf(truth, "ly")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (mode === 1) {
      // apparentBrightnessWm2 from parallax + luminosity
      const truth = q.apparentBrightnessWm2;
      const stems = [
        `Measured across Earth's 1 AU orbital radius baseline by ${ctx.survey}, a ${ctx.star} of bolometric luminosity ${fmtGiven(stellarLuminosityW, "W")} exhibits a parallax angle of ${fmtGiven(parallaxArcsec, "arcsec")}${parsecNote}. Take 1 pc = 3.09 × 10¹⁶ m. What is the apparent brightness of the star at Earth?`,
        `A ${ctx.star} with total luminosity ${fmtGiven(stellarLuminosityW, "W")} shows an annual parallax angle of ${fmtGiven(parallaxArcsec, "arcsec")} over a 1 AU baseline in ${ctx.survey}${parsecNote}. Using 1 pc = 3.09 × 10¹⁶ m, calculate its apparent brightness received at Earth.`,
        `Determine the apparent brightness b = L / (4πd²) at Earth for a ${ctx.star} of luminosity ${fmtGiven(stellarLuminosityW, "W")} whose 1 AU astrometric parallax in ${ctx.survey} is ${fmtGiven(parallaxArcsec, "arcsec")}${parsecNote} (1 pc = 3.09 × 10¹⁶ m).`,
        `From ${ctx.survey}, a ${ctx.star} has bolometric output ${fmtGiven(stellarLuminosityW, "W")} and annual parallax p = ${fmtGiven(parallaxArcsec, "arcsec")} on a 1 AU baseline${parsecNote}. Taking 1 pc = 3.09 × 10¹⁶ m, find the radiant flux density arriving at Earth.`,
      ];
      const options = buildNumericMcqOptions(truth, "W m⁻²", [
        {
          value: stellarLuminosityW / (4 * Math.PI * q.distancePc ** 2),
          rationale: "Substitutes distance in parsecs directly into L / (4π d²) without converting parsecs to metres.",
        },
        {
          value: stellarLuminosityW / q.distanceM ** 2,
          rationale: "Omits the spherical surface factor 4π in b = L / (4π d²).",
        },
        {
          value: stellarLuminosityW / (4 * Math.PI * ((parallaxArcsec * PARSEC_M) ** 2)),
          rationale: "Multiplies p by 1 pc instead of taking d = (1 / p) pc.",
        },
        {
          value: stellarLuminosityW / (4 * Math.PI * q.distanceM),
          rationale: "Divides by d instead of d² in the inverse-square brightness law.",
        },
      ]);
      return {
        id,
        conceptId: "stellar-radiation-hr-diagram",
        templateArchetype: "stellar-parallax-distance-brightness",
        seed,
        syllabi,
        format: "mcq",
        difficulty: "higher",
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["distancePc", "distanceLy", "distanceM", "distanceAu", "apparentBrightnessWm2"],
        targetQuantityKey: "apparentBrightnessWm2",
        questionPlan: buildDigitFreePlan(
          "Determine stellar distance from parallax angle and apply inverse-square law for apparent brightness",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 2),
        options,
        workedSolution: `d = (1 / ${fmtGiven(parallaxArcsec)}) pc = ${fmt3sf(q.distancePc, "pc")} = ${fmt3sf(q.distanceM, "m")}. Apparent brightness b = L / (4π d²) = ${fmtGiven(stellarLuminosityW)} / (4π × (${fmt3sf(q.distanceM)})²) = ${fmt3sf(truth, "W m⁻²")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Converts d = (1/p) pc to metres and evaluates b = L/(4πd²) = ${fmt3sf(truth, "W m⁻²")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // mode === 2: inverse parallaxArcsec from apparent brightness & luminosity!
    const truth = q.parallaxArcsec;
    const givenBright = Number(q.apparentBrightnessWm2.toPrecision(4));
    const stems = [
      `Photometry from ${ctx.survey} establishes that a standard-candle ${ctx.star} has luminosity ${fmtGiven(stellarLuminosityW, "W")} and apparent brightness ${fmtGiven(givenBright, "W m⁻²")} at Earth (1 AU baseline)${parsecNote}. Take 1 pc = 3.09 × 10¹⁶ m. What annual stellar parallax angle, in arcseconds, should astrometrists observe?`,
      `A calibrated ${ctx.star} of known luminosity ${fmtGiven(stellarLuminosityW, "W")} produces apparent brightness ${fmtGiven(givenBright, "W m⁻²")} at ${ctx.survey} across a 1 AU orbital baseline${parsecNote}. Using 1 pc = 3.09 × 10¹⁶ m, calculate its expected parallax angle in arcseconds.`,
      `Determine the annual parallax angle (in arcsec, 1 AU baseline) of a ${ctx.star} whose luminosity is ${fmtGiven(stellarLuminosityW, "W")} and whose apparent brightness recorded by ${ctx.survey} is ${fmtGiven(givenBright, "W m⁻²")}${parsecNote} (1 pc = 3.09 × 10¹⁶ m).`,
      `Given bolometric luminosity L = ${fmtGiven(stellarLuminosityW, "W")} and observed brightness b = ${fmtGiven(givenBright, "W m⁻²")} in ${ctx.survey} (1 AU baseline)${parsecNote}, find the stellar parallax angle in arcseconds (take 1 pc = 3.09 × 10¹⁶ m).`,
    ];
    const options = buildNumericMcqOptions(truth, "arcsec", [
      {
        value: q.distancePc,
        rationale: "Stops after computing distance d in parsecs and forgets to invert p = 1 / d.",
      },
      {
        value: truth / Math.sqrt(4 * Math.PI),
        rationale: "Omits the factor of 4π when solving b = L / (4π d²) for d.",
      },
      {
        value: truth ** 2,
        rationale: "Forgets to take the square root when solving d² = L / (4π b).",
      },
      {
        value: truth * LIGHT_YEARS_PER_PARSEC,
        rationale: "Confuses light-years with parsecs when converting SI distance into parallax arcseconds.",
      },
    ]);
    return {
      id,
      conceptId: "stellar-radiation-hr-diagram",
      templateArchetype: "stellar-parallax-distance-brightness",
      seed,
      syllabi,
      format: "mcq",
      difficulty: "higher",
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "parallaxArcsec",
        "parallaxMilliarcsec",
        "parallaxDegrees",
        "parallaxRadians",
        "distancePc",
        "distanceLy",
        "distanceM",
        "distanceAu",
      ],
      requiredGivens: [
        { name: "stellarLuminosityW", value: stellarLuminosityW, unit: "W", source: "stem" },
        { name: "apparentBrightnessWm2", value: givenBright, unit: "W m⁻²", source: "stem" },
        { name: "baselineAu", value: 1, unit: "AU", source: "either" },
      ],
      targetQuantityKey: "parallaxArcsec",
      questionPlan: buildDigitFreePlan(
        "Infer SI distance from luminosity and apparent brightness and invert parsec relation for annual parallax angle",
        "mcq",
      ),
      stem: pickTemplate(stems, variantIndex, 3),
      options,
      workedSolution: `From b = L / (4π d²), d = √[L / (4π b)] = ${fmt3sf(q.distanceM, "m")} = ${fmt3sf(q.distancePc, "pc")}. Hence p = 1 / d_pc = ${fmt3sf(truth, "arcsec")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Solves d = √[L/(4πb)] in parsecs and p = 1/d = ${fmt3sf(truth, "arcsec")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (6 marks: distancePc -> distanceM -> apparentBrightnessWm2)
  const parStructStems = [
    `Using a 1 AU orbital baseline, ${ctx.survey} measures an annual parallax angle of ${fmtGiven(parallaxArcsec, "arcsec")} for a ${ctx.star} of total luminosity ${fmtGiven(stellarLuminosityW, "W")}${parsecNote}. Take 1 pc = 3.09 × 10¹⁶ m.`,
    `Astrometry from ${ctx.survey} across Earth's 1 AU orbital radius records parallax p = ${fmtGiven(parallaxArcsec, "arcsec")} for a ${ctx.star} radiating bolometric luminosity ${fmtGiven(stellarLuminosityW, "W")}${parsecNote} (1 pc = 3.09 × 10¹⁶ m).`,
    `Over a six-month 1 AU baseline, ${ctx.survey} observes an annual parallax shift of ${fmtGiven(parallaxArcsec, "arcsec")} for a ${ctx.star} whose luminosity is ${fmtGiven(stellarLuminosityW, "W")}${parsecNote}. Use 1 pc = 3.09 × 10¹⁶ m.`,
  ];
  return {
    id,
    conceptId: "stellar-radiation-hr-diagram",
    templateArchetype: "stellar-parallax-distance-brightness",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: ["distancePc", "distanceLy", "distanceM", "distanceAu", "apparentBrightnessWm2"],
    questionPlan: buildDigitFreePlan(
      "Chain astrometric parallax distance in parsecs to SI distance and apparent brightness at Earth",
      "structured",
      ["calculate-distance-in-parsecs", "convert-distance-to-metres", "compute-apparent-brightness"],
    ),
    stem: pickTemplate(parStructStems, variantIndex),
    parts: [
      {
        partId: "a",
        prompt: `Determine the distance to the star in parsecs.`,
        marks: 2,
        targetQuantityKey: "distancePc",
        expectedAnswer: fmt3sf(q.distancePc, "pc"),
        workingSteps: [
          `d = 1 / p = 1 / ${fmtGiven(parallaxArcsec)} = ${fmt3sf(q.distancePc, "pc")}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Convert this stellar distance into metres.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "distanceM",
        expectedAnswer: fmt3sf(q.distanceM, "m"),
        workingSteps: [
          `d = ${fmt3sf(q.distancePc)} × 3.09 × 10¹⁶ = ${fmt3sf(q.distanceM, "m")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Calculate the apparent brightness of the star received above Earth's atmosphere.`,
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "apparentBrightnessWm2",
        expectedAnswer: fmt3sf(q.apparentBrightnessWm2, "W m⁻²"),
        workingSteps: [
          `b = L / (4π d²) = ${fmtGiven(stellarLuminosityW)} / (4π × (${fmt3sf(q.distanceM)})²) = ${fmt3sf(q.apparentBrightnessWm2, "W m⁻²")}.`,
        ],
      },
    ],
    workedSolution: `(a) d = 1 / ${fmtGiven(parallaxArcsec)} = ${fmt3sf(q.distancePc, "pc")}. (b) In SI units, d = ${fmt3sf(q.distanceM, "m")}. (c) Apparent brightness b = L / (4π d²) = ${fmt3sf(q.apparentBrightnessWm2, "W m⁻²")}.`,
    markScheme: [
      { code: "M1", partId: "a", criterion: "Applies d(pc) = 1 / p(arcsec).", marks: 1 },
      { code: "A1", partId: "a", criterion: `Obtains ${fmt3sf(q.distancePc, "pc")}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Multiplies distance in parsecs by 3.09 × 10¹⁶ m pc⁻¹.", marks: 1 },
      { code: "A1", partId: "b", criterion: `Obtains ${fmt3sf(q.distanceM, "m")}.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Applies inverse-square law b = L / (4π d²).", marks: 1 },
      { code: "A1", partId: "c", criterion: `Obtains ${fmt3sf(q.apparentBrightnessWm2, "W m⁻²")}.`, marks: 1 },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// 16. COSMOLOGICAL REDSHIFT & HUBBLE ("cosmology-hubble-law", "cosmological-redshift-hubble-expansion")
// ============================================================================

function buildCosmologicalRedshiftItem(
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  _rng: SeededRng,
  generatorModel: string,
): CandidateQuestionInput {
  // Cosmic scale factor R/R_0 = 1/(1+z) is strictly IB HL only!
  const isScaleFactorVariant =
    format === "mcq" ? variantIndex % 4 === 3 : variantIndex % 2 === 1;

  const syllabi = resolveSyllabiTags({
    conceptId: "cosmology-hubble-law",
    format,
    variantIndex,
    ibHlOnly: true,
    excludeAlevel: isScaleFactorVariant,
    excludeNcuk: isScaleFactorVariant,
  });

  const ctx =
    GALAXY_CONTEXTS[
      (variantIndex * 3 + Math.floor(variantIndex / GALAXY_CONTEXTS.length)) %
        GALAXY_CONTEXTS.length
    ];
  const restNm = ctx.restNm;
  const zValues = isScaleFactorVariant
    ? [0.12, 0.16, 0.2, 0.25, 0.32, 0.4, 0.5, 0.6]
    : [0.018, 0.025, 0.032, 0.04, 0.05, 0.064, 0.08, 0.095, 0.11, 0.14];
  const rawZ = perturbCycle(
    zValues[(variantIndex * 5) % zValues.length],
    variantIndex,
    zValues.length,
    0.037,
  );
  const zTarget = isScaleFactorVariant
    ? Math.min(0.82, rawZ)
    : Math.min(0.26, rawZ);
  const obsNm = Number((restNm * (1 + zTarget)).toFixed(2));
  const h0Values = [66, 67.4, 68, 69.5, 70, 71.5, 72, 73.5, 74];
  const hubbleConstantKmSMpc =
    h0Values[(variantIndex * 7) % h0Values.length];

  const spec: CosmologicalRedshiftScenario = {
    kind: "cosmological-redshift",
    id,
    restWavelengthM: restNm * 1e-9,
    observedWavelengthM: obsNm * 1e-9,
    hubbleConstantKmSMpc,
    diagramVariant: variantIndex % 2 === 0 ? "spectral-shift" : "hubble-plot",
  };
  const sol = solveGravAstroScenario(spec);
  const q = sol.quantities;
  const difficulty = pickDifficulty(variantIndex, isScaleFactorVariant ? "higher" : "balanced");

  if (format === "mcq") {
    if (isScaleFactorVariant) {
      // IB HL ONLY: cosmic scale factor R_emission / R_0 = 1 / (1 + z)
      const truth = q.scaleFactorRatioEmissionToNow;
      const stems = [
        `Light from the ${ctx.line} (laboratory rest wavelength ${fmtGiven(restNm, "nm")}) in a ${ctx.galaxy} is observed at Earth with wavelength ${fmtGiven(obsNm, "nm")} in a universe with Hubble parameter H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}. What was the ratio R / R₀ of the cosmic scale factor R when the light was emitted to its present-day value R₀?`,
        `Spectroscopy of a ${ctx.galaxy} detects the ${ctx.line} shifted from its rest value ${fmtGiven(restNm, "nm")} to ${fmtGiven(obsNm, "nm")} (H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}). Calculate the emission-to-present cosmic scale-factor ratio R / R₀.`,
        `When photons of the ${ctx.line} (λ₀ = ${fmtGiven(restNm, "nm")}) left a ${ctx.galaxy}, the universe had scale factor R; today (scale factor R₀, H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}) those photons arrive at ${fmtGiven(obsNm, "nm")}. Determine R / R₀.`,
        `Determine the ratio R / R₀ of the cosmic scale factor at emission to its value today for a ${ctx.galaxy} whose ${ctx.line} shifts from ${fmtGiven(restNm, "nm")} to ${fmtGiven(obsNm, "nm")} (H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}).`,
      ];
      const options = buildNumericMcqOptions(truth, "", [
        {
          value: q.scaleFactorRatioNowToEmission,
          rationale: "Calculates R₀ / R = 1 + z (present-to-emission ratio) instead of R / R₀ = 1 / (1 + z).",
        },
        {
          value: Math.max(0.05, 1 - q.redshiftZ),
          rationale: "Approximates 1 / (1 + z) linearly as 1 − z instead of evaluating the exact reciprocal.",
        },
        {
          value: q.redshiftZ,
          rationale: "Stops after calculating redshift z = Δλ / λ₀ without relating z to R / R₀ = 1 / (1 + z).",
        },
        {
          value: q.redshiftZ / (1 + q.redshiftZ),
          rationale: "Computes Δλ / λ_obs = z / (1 + z) instead of λ₀ / λ_obs = 1 / (1 + z).",
        },
      ]);
      return {
        id,
        conceptId: "cosmology-hubble-law",
        templateArchetype: "cosmological-redshift-hubble-expansion",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "redshiftZ",
          "deltaWavelengthNm",
          "scaleFactorRatioEmissionToNow",
          "scaleFactorRatioNowToEmission",
          "recessionSpeedKmS",
          "distanceMpc",
        ],
        requiredGivens: [
          { name: "restWavelengthM", value: restNm * 1e-9, unit: "m", source: "stem" },
          { name: "observedWavelengthM", value: obsNm * 1e-9, unit: "m", source: "stem" },
          { name: "hubbleConstantKmSMpc", value: hubbleConstantKmSMpc, source: "stem" },
        ],
        targetQuantityKey: "scaleFactorRatioEmissionToNow",
        questionPlan: buildDigitFreePlan(
          "Determine ratio of cosmic scale factor at photon emission to present scale factor from spectral wavelengths",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 1),
        options,
        workedSolution: `Since 1 + z = R₀ / R = λ_obs / λ₀, the emission-to-present scale-factor ratio is R / R₀ = λ₀ / λ_obs = ${fmtGiven(restNm)} / ${fmtGiven(obsNm)} = ${fmt3sf(truth)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses z = R₀/R − 1 => R/R₀ = λ₀/λ_obs = ${fmt3sf(truth)}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const mode = variantIndex % 3;
    if (mode === 0) {
      // distanceMpc = (z c_kms) / H0
      const truth = q.distanceMpc;
      const stems = [
        `Spectroscopy of a ${ctx.galaxy} shows the ${ctx.line}, which has laboratory rest wavelength ${fmtGiven(restNm, "nm")}, shifted to an observed wavelength of ${fmtGiven(obsNm, "nm")}. Take c = 3.00 × 10⁸ m s⁻¹ and H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}. Using the low-redshift approximation, estimate the distance to the galaxy in Mpc.`,
        `In an extragalactic survey with H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}, the ${ctx.line} (rest wavelength ${fmtGiven(restNm, "nm")}) from a ${ctx.galaxy} arrives at ${fmtGiven(obsNm, "nm")}. Taking c = 3.00 × 10⁸ m s⁻¹, calculate the Hubble distance in Mpc.`,
        `Determine the cosmological distance (in Mpc) to a ${ctx.galaxy} whose ${ctx.line} is redshifted from λ₀ = ${fmtGiven(restNm, "nm")} to λ_obs = ${fmtGiven(obsNm, "nm")}, given c = 3.00 × 10⁸ m s⁻¹ and H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}.`,
        `Observations of a ${ctx.galaxy} measure the ${ctx.line} at ${fmtGiven(obsNm, "nm")} compared with its laboratory reference ${fmtGiven(restNm, "nm")}. Using v ≈ zc, c = 3.00 × 10⁸ m s⁻¹, and H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}, find its distance in megaparsecs.`,
      ];
      const options = buildNumericMcqOptions(truth, "Mpc", [
        {
          value: ((obsNm - restNm) / obsNm) * (SPEED_OF_LIGHT_MS / 1000) / hubbleConstantKmSMpc,
          rationale: "Divides Δλ by observed wavelength λ_obs instead of rest wavelength λ₀ when finding redshift z.",
        },
        {
          value: q.recessionSpeedKmS * hubbleConstantKmSMpc,
          rationale: "Multiplies recession speed v by H₀ instead of dividing v / H₀ in Hubble's law.",
        },
        {
          value: ((obsNm / restNm) * (SPEED_OF_LIGHT_MS / 1000)) / hubbleConstantKmSMpc,
          rationale: "Uses λ_obs / λ₀ = 1 + z in place of z = (λ_obs − λ₀) / λ₀.",
        },
        {
          value: truth * 1000,
          rationale: "Substitutes c in m s⁻¹ rather than km s⁻¹ while keeping H₀ in km s⁻¹ Mpc⁻¹.",
        },
      ]);
      return {
        id,
        conceptId: "cosmology-hubble-law",
        templateArchetype: "cosmological-redshift-hubble-expansion",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [
          "redshiftZ",
          "deltaWavelengthNm",
          "recessionSpeedKmS",
          "recessionSpeedMs",
          "distanceMpc",
        ],
        requiredGivens: [
          { name: "restWavelengthM", value: restNm * 1e-9, unit: "m", source: "stem" },
          { name: "observedWavelengthM", value: obsNm * 1e-9, unit: "m", source: "stem" },
          { name: "hubbleConstantKmSMpc", value: hubbleConstantKmSMpc, source: "stem" },
        ],
        targetQuantityKey: "distanceMpc",
        questionPlan: buildDigitFreePlan(
          "Combine optical spectral redshift with low-redshift Hubble law to estimate galactic distance in megaparsecs",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 2),
        options,
        workedSolution: `Redshift z = (λ_obs − λ₀) / λ₀ = (${fmtGiven(obsNm)} − ${fmtGiven(restNm)}) / ${fmtGiven(restNm)} = ${fmt3sf(q.redshiftZ)}. Recession speed v ≈ z c = ${fmt3sf(q.recessionSpeedKmS, "km s⁻¹")}. From Hubble's law v = H₀ d, d = v / H₀ = ${fmt3sf(q.recessionSpeedKmS)} / ${fmtGiven(hubbleConstantKmSMpc)} = ${fmt3sf(truth, "Mpc")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds z = ${fmt3sf(q.redshiftZ)}, v = ${fmt3sf(q.recessionSpeedKmS, "km s⁻¹")}, and d = v / H₀ = ${fmt3sf(truth, "Mpc")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (mode === 1) {
      // recessionSpeedKmS
      const truth = q.recessionSpeedKmS;
      const stems = [
        `In the spectrum of a ${ctx.galaxy} (surveyed with H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}), the ${ctx.line} of rest wavelength ${fmtGiven(restNm, "nm")} is measured at ${fmtGiven(obsNm, "nm")}. Take c = 3.00 × 10⁸ m s⁻¹. What is the recession speed of the galaxy in km s⁻¹?`,
        `Optical spectroscopy of a ${ctx.galaxy} records the ${ctx.line} at ${fmtGiven(obsNm, "nm")} instead of its laboratory wavelength ${fmtGiven(restNm, "nm")} (H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}, c = 3.00 × 10⁸ m s⁻¹). Calculate its recession velocity in km s⁻¹.`,
        `Determine the low-redshift recession speed (in km s⁻¹) of a ${ctx.galaxy} whose ${ctx.line} shifts from ${fmtGiven(restNm, "nm")} to ${fmtGiven(obsNm, "nm")}. Take c = 3.00 × 10⁸ m s⁻¹ and H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}.`,
        `A ${ctx.galaxy} monitored in a Hubble-flow survey (H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}) exhibits the ${ctx.line} at ${fmtGiven(obsNm, "nm")} rather than ${fmtGiven(restNm, "nm")}. Using c = 3.00 × 10⁸ m s⁻¹, find v in km s⁻¹.`,
      ];
      const options = buildNumericMcqOptions(truth, "km s⁻¹", [
        {
          value: ((obsNm - restNm) / obsNm) * (SPEED_OF_LIGHT_MS / 1000),
          rationale: "Divides Δλ by λ_obs instead of rest wavelength λ₀.",
        },
        {
          value: (obsNm / restNm) * (SPEED_OF_LIGHT_MS / 1000),
          rationale: "Multiplies c by λ_obs / λ₀ = 1 + z instead of Δλ / λ₀ = z.",
        },
        {
          value: q.distanceMpc,
          rationale: "Divides recession speed by H₀, reporting distance in Mpc rather than speed in km s⁻¹.",
        },
        {
          value: truth * 0.1,
          rationale: "Makes a power-of-ten conversion error between m s⁻¹ and km s⁻¹.",
        },
      ]);
      return {
        id,
        conceptId: "cosmology-hubble-law",
        templateArchetype: "cosmological-redshift-hubble-expansion",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "grav-astro",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: ["redshiftZ", "deltaWavelengthNm", "recessionSpeedKmS", "recessionSpeedMs", "distanceMpc"],
        requiredGivens: [
          { name: "restWavelengthM", value: restNm * 1e-9, unit: "m", source: "stem" },
          { name: "observedWavelengthM", value: obsNm * 1e-9, unit: "m", source: "stem" },
          { name: "hubbleConstantKmSMpc", value: hubbleConstantKmSMpc, source: "stem" },
        ],
        targetQuantityKey: "recessionSpeedKmS",
        questionPlan: buildDigitFreePlan(
          "Calculate galactic recession velocity in kilometres per second from redshifted absorption wavelength",
          "mcq",
        ),
        stem: pickTemplate(stems, variantIndex, 3),
        options,
        workedSolution: `z = Δλ / λ₀ = (${fmtGiven(obsNm)} − ${fmtGiven(restNm)}) / ${fmtGiven(restNm)} = ${fmt3sf(q.redshiftZ)}. In the low-redshift regime, v ≈ z c = ${fmt3sf(q.redshiftZ)} × 3.00 × 10⁵ km s⁻¹ = ${fmt3sf(truth, "km s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses v ≈ (Δλ / λ₀) c to obtain ${fmt3sf(truth, "km s⁻¹")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // mode === 2: Inverse observedWavelengthNm from restNm, H0, and distanceMpc!
    const truth = q.observedWavelengthNm;
    const givenDistMpc = Number(q.distanceMpc.toPrecision(4));
    const stems = [
      `A ${ctx.galaxy} lies at distance ${fmtGiven(givenDistMpc, "Mpc")} in a universe with Hubble constant H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}. Take c = 3.00 × 10⁸ m s⁻¹. At what wavelength, in nm, is the ${ctx.line} (laboratory rest wavelength ${fmtGiven(restNm, "nm")}) observed at Earth?`,
      `Situated ${fmtGiven(givenDistMpc, "Mpc")} from Earth, a ${ctx.galaxy} recedes according to Hubble's law with H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")} (c = 3.00 × 10⁸ m s⁻¹). Predict the observed wavelength in nm of its ${ctx.line} (λ₀ = ${fmtGiven(restNm, "nm")}).`,
      `Determine the redshifted wavelength (in nm) received at Earth for the ${ctx.line} (rest wavelength ${fmtGiven(restNm, "nm")}) emitted by a ${ctx.galaxy} at distance ${fmtGiven(givenDistMpc, "Mpc")}, taking H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")} and c = 3.00 × 10⁸ m s⁻¹.`,
      `Using Hubble constant H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")} and c = 3.00 × 10⁸ m s⁻¹, find the observed wavelength in nm of the ${ctx.line} (λ₀ = ${fmtGiven(restNm, "nm")}) from a ${ctx.galaxy} located ${fmtGiven(givenDistMpc, "Mpc")} away.`,
    ];
    const options = buildNumericMcqOptions(truth, "nm", [
      {
        value: restNm * (1 - q.redshiftZ),
        rationale: "Subtracts Δλ from λ₀ (blueshift) instead of adding Δλ for cosmological recession.",
      },
      {
        value: q.deltaWavelengthNm,
        rationale: "Stops after computing wavelength shift Δλ = z λ₀ without adding rest wavelength λ₀.",
      },
      {
        value: restNm / (1 - Math.min(0.8, q.redshiftZ * 2)),
        rationale: "Doubles the fractional wavelength shift through an algebraic slip in Δλ / λ₀.",
      },
      {
        value: restNm + givenDistMpc,
        rationale: "Adds distance in Mpc directly to rest wavelength without converting via v = H₀ d and Δλ = (v/c) λ₀.",
      },
    ]);
    return {
      id,
      conceptId: "cosmology-hubble-law",
      templateArchetype: "cosmological-redshift-hubble-expansion",
      seed,
      syllabi,
      format: "mcq",
      difficulty: "higher",
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "observedWavelengthNm",
        "observedWavelengthM",
        "deltaWavelengthNm",
        "deltaWavelengthM",
        "redshiftZ",
        "recessionSpeedKmS",
      ],
      requiredGivens: [
        { name: "restWavelengthM", value: restNm * 1e-9, unit: "m", source: "stem" },
        { name: "hubbleConstantKmSMpc", value: hubbleConstantKmSMpc, source: "stem" },
        { name: "distanceMpc", value: givenDistMpc, source: "stem" },
      ],
      targetQuantityKey: "observedWavelengthNm",
      questionPlan: buildDigitFreePlan(
        "Use Hubble law and optical Doppler shift to predict observed redshifted spectral wavelength",
        "mcq",
      ),
      stem: pickTemplate(stems, variantIndex, 4),
      options,
      workedSolution: `Recession speed v = H₀ d = ${fmtGiven(hubbleConstantKmSMpc)} × ${fmtGiven(givenDistMpc)} = ${fmt3sf(q.recessionSpeedKmS, "km s⁻¹")}. Redshift z = v / c = ${fmt3sf(q.redshiftZ)}, so λ_obs = λ₀(1 + z) = ${fmtGiven(restNm)} × (1 + ${fmt3sf(q.redshiftZ)}) = ${fmt3sf(truth, "nm")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates v = H₀d, z = v/c, and λ_obs = λ₀(1 + z) = ${fmt3sf(truth, "nm")}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured Paper 2 (6 marks)
  if (isScaleFactorVariant) {
    // IB HL only: redshiftZ -> scaleFactorRatioEmissionToNow -> distanceMpc
    const sfStructStems = [
      `In the optical spectrum of a ${ctx.galaxy}, the ${ctx.line} of rest wavelength ${fmtGiven(restNm, "nm")} is observed at wavelength ${fmtGiven(obsNm, "nm")}. Take c = 3.00 × 10⁸ m s⁻¹ and H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}.`,
      `Spectroscopic data from a ${ctx.galaxy} show the ${ctx.line} shifted from laboratory wavelength ${fmtGiven(restNm, "nm")} to ${fmtGiven(obsNm, "nm")} in a universe with H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")} and c = 3.00 × 10⁸ m s⁻¹.`,
      `Photons from the ${ctx.line} (λ₀ = ${fmtGiven(restNm, "nm")}) emitted by a ${ctx.galaxy} arrive at Earth with wavelength ${fmtGiven(obsNm, "nm")}. Use c = 3.00 × 10⁸ m s⁻¹ and H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}.`,
      `An extragalactic spectrograph records the ${ctx.line} of a ${ctx.galaxy} at ${fmtGiven(obsNm, "nm")} compared with rest wavelength ${fmtGiven(restNm, "nm")} (c = 3.00 × 10⁸ m s⁻¹, H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}).`,
    ];
    return {
      id,
      conceptId: "cosmology-hubble-law",
      templateArchetype: "cosmological-redshift-hubble-expansion",
      seed,
      syllabi,
      format: "structured",
      difficulty: "higher",
      domain: "grav-astro",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [
        "redshiftZ",
        "deltaWavelengthNm",
        "scaleFactorRatioEmissionToNow",
        "scaleFactorRatioNowToEmission",
        "recessionSpeedKmS",
        "distanceMpc",
      ],
      requiredGivens: [
        { name: "restWavelengthM", value: restNm * 1e-9, unit: "m", source: "stem" },
        { name: "observedWavelengthM", value: obsNm * 1e-9, unit: "m", source: "stem" },
        { name: "hubbleConstantKmSMpc", value: hubbleConstantKmSMpc, source: "stem" },
      ],
      questionPlan: buildDigitFreePlan(
        "Connect observed spectral shift to cosmological redshift, cosmic scale-factor ratio, and Hubble distance",
        "structured",
        ["calculate-cosmological-redshift", "determine-emission-scale-factor-ratio", "estimate-galactic-distance"],
      ),
      stem: pickTemplate(sfStructStems, variantIndex),
      parts: [
        {
          partId: "a",
          prompt: `Calculate the cosmological redshift z of the galaxy.`,
          marks: 2,
          targetQuantityKey: "redshiftZ",
          expectedAnswer: fmt3sf(q.redshiftZ),
          workingSteps: [
            `z = (λ_obs − λ₀) / λ₀ = (${fmtGiven(obsNm)} − ${fmtGiven(restNm)}) / ${fmtGiven(restNm)} = ${fmt3sf(q.redshiftZ)}.`,
          ],
        },
        {
          partId: "b",
          prompt: `Determine the ratio R / R₀ of the cosmic scale factor at the time of emission to the cosmic scale factor today.`,
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "scaleFactorRatioEmissionToNow",
          expectedAnswer: fmt3sf(q.scaleFactorRatioEmissionToNow),
          workingSteps: [
            `From z = R₀ / R − 1, R / R₀ = 1 / (1 + z) = 1 / (1 + ${fmt3sf(q.redshiftZ)}) = ${fmt3sf(q.scaleFactorRatioEmissionToNow)}.`,
          ],
        },
        {
          partId: "c",
          prompt: `Using v ≈ z c and Hubble's law, estimate the distance to the galaxy in Mpc.`,
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "distanceMpc",
          expectedAnswer: fmt3sf(q.distanceMpc, "Mpc"),
          workingSteps: [
            `v ≈ z c = ${fmt3sf(q.recessionSpeedKmS, "km s⁻¹")}.`,
            `d = v / H₀ = ${fmt3sf(q.recessionSpeedKmS)} / ${fmtGiven(hubbleConstantKmSMpc)} = ${fmt3sf(q.distanceMpc, "Mpc")}.`,
          ],
        },
      ],
      workedSolution: `(a) z = Δλ / λ₀ = ${fmt3sf(q.redshiftZ)}. (b) Scale-factor ratio R / R₀ = 1 / (1 + z) = ${fmt3sf(q.scaleFactorRatioEmissionToNow)}. (c) Using v ≈ zc = ${fmt3sf(q.recessionSpeedKmS, "km s⁻¹")}, Hubble's law gives d = v / H₀ = ${fmt3sf(q.distanceMpc, "Mpc")}.`,
      markScheme: [
        { code: "M1", partId: "a", criterion: "Applies z = (λ_obs − λ₀) / λ₀.", marks: 1 },
        { code: "A1", partId: "a", criterion: `Obtains z = ${fmt3sf(q.redshiftZ)}.`, marks: 1 },
        { code: "M1", partId: "b", criterion: "Applies z = R₀/R − 1 so R/R₀ = 1 / (1 + z).", marks: 1 },
        { code: "A1", partId: "b", criterion: `Obtains R / R₀ = ${fmt3sf(q.scaleFactorRatioEmissionToNow)}.`, marks: 1 },
        { code: "M1", partId: "c", criterion: "Applies v = zc and d = v / H₀.", marks: 1 },
        { code: "A1", partId: "c", criterion: `Obtains d = ${fmt3sf(q.distanceMpc, "Mpc")}.`, marks: 1 },
      ],
      totalMarks: 6,
      generatorModel,
    };
  }

  // Cross-syllabus (IB HL + A-Level Y13 + NCUK IFY): redshiftZ -> recessionSpeedKmS -> distanceMpc
  const hubStructStems = [
    `A ${ctx.galaxy} is observed spectroscopically. The ${ctx.line}, which has rest wavelength ${fmtGiven(restNm, "nm")} in the laboratory, appears at observed wavelength ${fmtGiven(obsNm, "nm")}. Take c = 3.00 × 10⁸ m s⁻¹ and H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}.`,
    `During a redshift sky survey (H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}), astronomers measure the ${ctx.line} of a ${ctx.galaxy} at ${fmtGiven(obsNm, "nm")}, compared with laboratory reference wavelength ${fmtGiven(restNm, "nm")} (c = 3.00 × 10⁸ m s⁻¹).`,
    `Light collected from a receding ${ctx.galaxy} reveals the ${ctx.line} shifted from λ₀ = ${fmtGiven(restNm, "nm")} to λ_obs = ${fmtGiven(obsNm, "nm")}. Use c = 3.00 × 10⁸ m s⁻¹ and Hubble constant H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}.`,
    `The spectral comparison plot for a ${ctx.galaxy} shows the ${ctx.line} (rest wavelength ${fmtGiven(restNm, "nm")}) displaced to ${fmtGiven(obsNm, "nm")}. Take c = 3.00 × 10⁸ m s⁻¹ and H₀ = ${fmtGiven(hubbleConstantKmSMpc, "km s⁻¹ Mpc⁻¹")}.`,
  ];
  return {
    id,
    conceptId: "cosmology-hubble-law",
    templateArchetype: "cosmological-redshift-hubble-expansion",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "grav-astro",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities: ["redshiftZ", "deltaWavelengthNm", "recessionSpeedKmS", "recessionSpeedMs", "distanceMpc"],
    requiredGivens: [
      { name: "restWavelengthM", value: restNm * 1e-9, unit: "m", source: "stem" },
      { name: "observedWavelengthM", value: obsNm * 1e-9, unit: "m", source: "stem" },
      { name: "hubbleConstantKmSMpc", value: hubbleConstantKmSMpc, source: "stem" },
    ],
    questionPlan: buildDigitFreePlan(
      "Chain spectral wavelength shift to fractional redshift, recession speed, and Hubble distance",
      "structured",
      ["calculate-fractional-redshift", "compute-recession-speed", "estimate-hubble-distance"],
    ),
    stem: pickTemplate(hubStructStems, variantIndex),
    parts: [
      {
        partId: "a",
        prompt: `Calculate the fractional redshift z of this spectral line.`,
        marks: 2,
        targetQuantityKey: "redshiftZ",
        expectedAnswer: fmt3sf(q.redshiftZ),
        workingSteps: [
          `z = (λ_obs − λ₀) / λ₀ = (${fmtGiven(obsNm)} − ${fmtGiven(restNm)}) / ${fmtGiven(restNm)} = ${fmt3sf(q.redshiftZ)}.`,
        ],
      },
      {
        partId: "b",
        prompt: `Determine the recession speed of the galaxy in km s⁻¹.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "recessionSpeedKmS",
        expectedAnswer: fmt3sf(q.recessionSpeedKmS, "km s⁻¹"),
        workingSteps: [
          `For z ≪ 1, v ≈ z c = ${fmt3sf(q.redshiftZ)} × 3.00 × 10⁵ km s⁻¹ = ${fmt3sf(q.recessionSpeedKmS, "km s⁻¹")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Estimate the distance from Earth to the galaxy in Mpc.`,
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "distanceMpc",
        expectedAnswer: fmt3sf(q.distanceMpc, "Mpc"),
        workingSteps: [
          `d = v / H₀ = ${fmt3sf(q.recessionSpeedKmS)} / ${fmtGiven(hubbleConstantKmSMpc)} = ${fmt3sf(q.distanceMpc, "Mpc")}.`,
        ],
      },
    ],
    workedSolution: `(a) z = (λ_obs − λ₀)/λ₀ = ${fmt3sf(q.redshiftZ)}. (b) Recession speed v ≈ zc = ${fmt3sf(q.recessionSpeedKmS, "km s⁻¹")}. (c) Hubble distance d = v/H₀ = ${fmt3sf(q.distanceMpc, "Mpc")}.`,
    markScheme: [
      { code: "M1", partId: "a", criterion: "Applies z = Δλ / λ₀.", marks: 1 },
      { code: "A1", partId: "a", criterion: `Obtains z = ${fmt3sf(q.redshiftZ)}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Multiplies z by c and converts to km s⁻¹.", marks: 1 },
      { code: "A1", partId: "b", criterion: `Obtains v = ${fmt3sf(q.recessionSpeedKmS, "km s⁻¹")}.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Applies d = v / H₀.", marks: 1 },
      { code: "A1", partId: "c", criterion: `Obtains d = ${fmt3sf(q.distanceMpc, "Mpc")}.`, marks: 1 },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

// ============================================================================
// TOP-LEVEL DISPATCHER: 16 ARCHETYPES × ~65/35 MCQ/STRUCTURED
// ============================================================================

type ArchetypeBuilderFn = (
  id: string,
  seed: number,
  variantIndex: number,
  format: QuestionFormat,
  rng: SeededRng,
  generatorModel: string,
) => CandidateQuestionInput;

const ARCHETYPE_BUILDERS: readonly ArchetypeBuilderFn[] = [
  buildConicalPendulumItem,
  buildFlatCurveItem,
  buildBankedCurveItem,
  buildVerticalCircleUniformItem,
  buildVerticalCircleEnergyItem,
  buildPlanetaryFieldItem,
  buildPlanetaryPotentialItem,
  buildCircularOrbitSpeedKeplerItem,
  buildCircularOrbitVirialItem,
  buildOrbitalTransferItem,
  buildTwoBodyNullFieldItem,
  buildTwoBodyPotentialSaddleItem,
  buildStellarRadiationItem,
  buildHrDiagramItem,
  buildStellarParallaxItem,
  buildCosmologicalRedshiftItem,
];

function candidatePassesNonLeakAndDiversityGuard(
  candidate: CandidateQuestionInput,
  priorStems: readonly string[],
  maxStemSimThreshold = 0.74,
): boolean {
  for (const prevStem of priorStems) {
    if (computeStemSimilarity(candidate.stem, prevStem) >= maxStemSimThreshold) {
      return false;
    }
  }

  const adapter = getDomainAdapter("grav-astro");
  const specWithHidden: Record<string, unknown> = {
    ...candidate.scenarioSpec,
    hiddenQuantities: candidate.hiddenQuantities,
  };

  const solveOutput = adapter.solveScenario(specWithHidden);
  const renderOutput = adapter.renderSvg?.(specWithHidden, {
    hiddenQuantities: candidate.hiddenQuantities,
    id: candidate.id,
  });
  if (!renderOutput) {
    return false;
  }

  const hiddenSet = new Set(candidate.hiddenQuantities);
  const declaredPublicScalarNums: number[] = [];
  for (const [k, v] of Object.entries(candidate.scenarioSpec)) {
    if (!hiddenSet.has(k) && typeof v === "number" && Number.isFinite(v)) {
      declaredPublicScalarNums.push(v);
    }
  }

  const publicNumbers = [
    ...renderOutput.publicNumbers,
    ...(solveOutput.publicNumbers ?? []),
    ...declaredPublicScalarNums,
  ];
  const publicLabels = [
    ...renderOutput.publicLabels,
    ...(solveOutput.publicLabels ?? []),
  ];

  const svgLeaks = checkSvgHiddenQuantityLeaks({
    svgMarkup: renderOutput.svgMarkup,
    hiddenQuantities: candidate.hiddenQuantities,
    verifiedQuantities: solveOutput.quantities,
    publicNumbers,
    publicLabels,
  });
  if (svgLeaks.length > 0) {
    return false;
  }

  // Also ensure no hidden scalar accidentally matches a number mentioned in student stem
  const stemMentions = extractNumbersFromPhysicsText(candidate.stem);
  for (const hiddenKey of candidate.hiddenQuantities) {
    const hiddenVal = solveOutput.quantities[hiddenKey];
    if (
      typeof hiddenVal === "number" &&
      Number.isFinite(hiddenVal) &&
      Math.abs(hiddenVal) > 1e-12
    ) {
      const matchesStem = stemMentions.some((m) =>
        [m.rawValue, ...(m.siBaseValue !== undefined ? [m.siBaseValue] : []), ...m.alternateConvertedValues].some(
          (val) =>
            numbersAgreeWithinTolerance(val, hiddenVal, {
              significantFigures: 3,
              relativeTolerance: 0.008,
            }),
        ),
      );
      if (matchesStem) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Deterministically generates solver-verified Circular Motion, Gravitation &
 * Astrophysics (`grav-astro`) question candidates across 16 `(conceptId, templateArchetype)`
 * family groups, all 11 visual scenario kinds, and all 3 syllabi (IB SL/HL, A-Level Y13, NCUK IFY).
 */
export function generateGravAstroCandidates(
  options: GenerateGravAstroCandidatesOptions = {},
): CandidateQuestionInput[] {
  const count = options.count ?? DEFAULT_GRAV_ASTRO_CANDIDATE_COUNT;
  if (!Number.isInteger(count) || count < 0 || count > 5000) {
    throw new Error(`Invalid candidate count: ${String(count)}`);
  }
  const baseSeed = Math.trunc(options.seed ?? DEFAULT_GRAV_ASTRO_SEED);
  const mcqFraction = options.mcqFraction ?? 0.65;
  if (!Number.isFinite(mcqFraction) || mcqFraction <= 0 || mcqFraction >= 1) {
    throw new Error(`Invalid mcqFraction: ${String(mcqFraction)}`);
  }
  const generatorModel = options.generatorModel?.trim() || "gemini-4-carbon-high";

  const targetMcqTotal = Math.round(count * mcqFraction);
  const candidates: CandidateQuestionInput[] = [];
  const acceptedStems: string[] = [];
  let mcqEmitted = 0;

  const perArchetypeVariantCounter = new Array<number>(ARCHETYPE_BUILDERS.length).fill(0);

  for (let i = 0; i < count; i += 1) {
    const archIdx = i % ARCHETYPE_BUILDERS.length;
    const variantIdx = perArchetypeVariantCounter[archIdx];
    perArchetypeVariantCounter[archIdx] += 1;

    // Bresenham-style exact format accumulator so every prefix/count maintains ~mcqFraction
    const remainingSlots = count - i;
    const remainingMcqNeeded = targetMcqTotal - mcqEmitted;
    let format: QuestionFormat;
    if (remainingMcqNeeded <= 0) {
      format = "structured";
    } else if (remainingMcqNeeded >= remainingSlots) {
      format = "mcq";
    } else {
      const idealMcqAfter = Math.round(((i + 1) * targetMcqTotal) / count);
      format = idealMcqAfter > mcqEmitted ? "mcq" : "structured";
    }
    if (format === "mcq") {
      mcqEmitted += 1;
    }

    const itemSeed = baseSeed + i * 97 + archIdx * 13;
    const padNum = String(i + 1).padStart(3, "0");
    const archSlug = GRAV_ASTRO_ARCHETYPES[archIdx].scenarioKind;
    const id = `ga-${archSlug}-${format === "mcq" ? "mcq" : "str"}-${padNum}`;

    let chosenCandidate: CandidateQuestionInput | undefined;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      // Stepping by +4 preserves variantIdx % 2 and variantIdx % 4 syllabus/mode parities
      const effectiveVariantIdx = variantIdx + attempt * 4;
      const rng = createGravAstroRng(
        `gen-grav-astro::${baseSeed}::${archIdx}::${variantIdx}::${attempt}`,
      );
      const trial = ARCHETYPE_BUILDERS[archIdx](
        id,
        itemSeed + attempt,
        effectiveVariantIdx,
        format,
        rng,
        generatorModel,
      );
      const simCeiling = attempt < 32 ? 0.74 : 0.82;
      if (candidatePassesNonLeakAndDiversityGuard(trial, acceptedStems, simCeiling)) {
        chosenCandidate = trial;
        break;
      }
    }

    if (!chosenCandidate) {
      const fallbackRng = createGravAstroRng(
        `gen-grav-astro::${baseSeed}::${archIdx}::${variantIdx}::fallback`,
      );
      chosenCandidate = ARCHETYPE_BUILDERS[archIdx](
        id,
        itemSeed,
        variantIdx,
        format,
        fallbackRng,
        generatorModel,
      );
    }

    candidates.push(chosenCandidate);
    acceptedStems.push(chosenCandidate.stem);
  }

  return candidates;
}
