import {
  getCompatibleSyllabiForConcept,
  SyllabusLevel,
} from "@/lib/constants/syllabi";
import {
  computeExactMaxOrder,
  DiffractionGratingScenarioSpec,
  DopplerEffectScenarioSpec,
  DoubleSlitScenarioSpec,
  MalusPolarizationScenarioSpec,
  ObserverMotionDirection,
  ProgressiveWaveScenarioSpec,
  SingleSlitScenarioSpec,
  solveWavesScenario,
  SourceMotionDirection,
  StandingWaveScenarioSpec,
  WAVES_SCHEMA_VERSION,
  WavesScenarioKind,
  WavesScenarioSpec,
} from "@/lib/visuals/waves";

import { computeShingleSet, computeStemFingerprint } from "../numeric-checker";
import { verifyCandidateWithGate } from "../package-gate";
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

export type WavesConceptId =
  | "progressive-waves-polarization"
  | "standing-waves-harmonics"
  | "double-slit-interference"
  | "single-slit-diffraction-gratings"
  | "doppler-effect";

export const WAVES_TEMPLATE_ARCHETYPES = [
  "progressive-spatial-profile-wave-speed",
  "progressive-temporal-phase-difference",
  "standing-string-harmonic-kinematics",
  "standing-string-tension-linear-density",
  "standing-open-pipe-harmonics",
  "standing-closed-pipe-odd-harmonics",
  "double-slit-fringe-spacing-wavelength",
  "double-slit-off-axis-orders-path-diff",
  "double-slit-envelope-missing-orders",
  "grating-lines-per-mm-diffraction-angle",
  "grating-max-observable-order-count",
  "single-slit-central-maximum-width",
  "doppler-moving-source-acoustic-shift",
  "doppler-moving-observer-relative-motion",
  "malus-polarized-analyzer-transmission",
  "malus-unpolarized-two-filter-chain",
] as const;

export type WavesTemplateArchetype = (typeof WAVES_TEMPLATE_ARCHETYPES)[number];

export type WavesSyllabusScopePolicy =
  | "all-core"
  | "hl-alevel-ncuk"
  | "alevel-only"
  | "ib-hl-only"
  | "ncuk-only"
  | "alevel-ncuk";

export interface WavesArchetypeDescriptor {
  readonly conceptId: WavesConceptId;
  readonly templateArchetype: WavesTemplateArchetype;
  readonly scenarioKind: WavesScenarioKind;
  readonly defaultMcqCount: number;
  readonly defaultStructuredCount: number;
  readonly summary: string;
}

export const WAVES_ARCHETYPE_CATALOGUE: readonly WavesArchetypeDescriptor[] = [
  {
    conceptId: "progressive-waves-polarization",
    templateArchetype: "progressive-spatial-profile-wave-speed",
    scenarioKind: "progressive-wave",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
    summary:
      "Displacement-position y(x) wave snapshots: forward wave speed v = fλ and inverse frequency f = v/λ.",
  },
  {
    conceptId: "progressive-waves-polarization",
    templateArchetype: "progressive-temporal-phase-difference",
    scenarioKind: "progressive-wave",
    defaultMcqCount: 13,
    defaultStructuredCount: 7,
    summary:
      "Displacement-time y(t) traces and two-point phase difference Δφ = 2πΔx/λ across forward and inverse targets.",
  },
  {
    conceptId: "standing-waves-harmonics",
    templateArchetype: "standing-string-harmonic-kinematics",
    scenarioKind: "standing-wave",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
    summary:
      "Fixed-both-ends string harmonics f_n = nv/(2L), node spacing λ/2, and inverse wave-speed/length calculations.",
  },
  {
    conceptId: "standing-waves-harmonics",
    templateArchetype: "standing-string-tension-linear-density",
    scenarioKind: "standing-wave",
    defaultMcqCount: 13,
    defaultStructuredCount: 7,
    summary:
      "Stretched-string transverse wave mechanics v = √(T/μ) with forward harmonic frequency and inverse tension targets.",
  },
  {
    conceptId: "standing-waves-harmonics",
    templateArchetype: "standing-open-pipe-harmonics",
    scenarioKind: "standing-wave",
    defaultMcqCount: 13,
    defaultStructuredCount: 7,
    summary:
      "Open-both-ends acoustic pipe resonances including two-end antinode end corrections L_eff = L + 2e.",
  },
  {
    conceptId: "standing-waves-harmonics",
    templateArchetype: "standing-closed-pipe-odd-harmonics",
    scenarioKind: "standing-wave",
    defaultMcqCount: 14,
    defaultStructuredCount: 8,
    summary:
      "Closed-one-end pipe odd harmonics (n = 1, 3, 5, 7) and Kundt/resonance-tube end corrections L_eff = L + e.",
  },
  {
    conceptId: "double-slit-interference",
    templateArchetype: "double-slit-fringe-spacing-wavelength",
    scenarioKind: "double-slit",
    defaultMcqCount: 13,
    defaultStructuredCount: 7,
    summary:
      "Young double-slit adjacent bright fringe spacing λD/d, first dark fringe, and inverse wavelength determination.",
  },
  {
    conceptId: "double-slit-interference",
    templateArchetype: "double-slit-off-axis-orders-path-diff",
    scenarioKind: "double-slit",
    defaultMcqCount: 13,
    defaultStructuredCount: 7,
    summary:
      "Off-axis n-th order bright fringe displacement, angular position, constructive path difference nλ, and inverse slit separation.",
  },
  {
    conceptId: "double-slit-interference",
    templateArchetype: "double-slit-envelope-missing-orders",
    scenarioKind: "double-slit",
    defaultMcqCount: 13,
    defaultStructuredCount: 7,
    summary:
      "Finite-slit diffraction envelope modulation (2λD/b) of double-slit fringes and missing interference orders (IB HL).",
  },
  {
    conceptId: "single-slit-diffraction-gratings",
    templateArchetype: "grating-lines-per-mm-diffraction-angle",
    scenarioKind: "diffraction-grating",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
    summary:
      "Transmission grating d sin θ = nλ with lines-per-mm conversion d = 10⁻³/N, flat-screen projection, and inverse wavelength.",
  },
  {
    conceptId: "single-slit-diffraction-gratings",
    templateArchetype: "grating-max-observable-order-count",
    scenarioKind: "diffraction-grating",
    defaultMcqCount: 13,
    defaultStructuredCount: 7,
    summary:
      "Maximum observable diffraction order n_max = floor(d/λ) and total principal maxima 2n_max + 1 across -90° < θ < 90°.",
  },
  {
    conceptId: "single-slit-diffraction-gratings",
    templateArchetype: "single-slit-central-maximum-width",
    scenarioKind: "single-slit",
    defaultMcqCount: 13,
    defaultStructuredCount: 8,
    summary:
      "Single-slit first diffraction minimum θ = λ/b, central maximum full screen width 2λD/b, and inverse slit width (IB HL).",
  },
  {
    conceptId: "doppler-effect",
    templateArchetype: "doppler-moving-source-acoustic-shift",
    scenarioKind: "doppler-effect",
    defaultMcqCount: 13,
    defaultStructuredCount: 7,
    summary:
      "Exact moving-source acoustic Doppler shifts f' = fv/(v ∓ v_s), compressed/stretched wavelengths, and inverse source speed (IB HL).",
  },
  {
    conceptId: "doppler-effect",
    templateArchetype: "doppler-moving-observer-relative-motion",
    scenarioKind: "doppler-effect",
    defaultMcqCount: 13,
    defaultStructuredCount: 7,
    summary:
      "Exact moving-observer and dual-motion acoustic Doppler shifts f' = f(v ± v_o)/(v ∓ v_s) and inverse observer speed (IB HL).",
  },
  {
    conceptId: "progressive-waves-polarization",
    templateArchetype: "malus-polarized-analyzer-transmission",
    scenarioKind: "malus-polarization",
    defaultMcqCount: 13,
    defaultStructuredCount: 7,
    summary:
      "Plane-polarized Malus's law I = I_0 cos²θ, electric-field amplitude projection cos θ, and inverse analyzer angle.",
  },
  {
    conceptId: "progressive-waves-polarization",
    templateArchetype: "malus-unpolarized-two-filter-chain",
    scenarioKind: "malus-polarization",
    defaultMcqCount: 14,
    defaultStructuredCount: 7,
    summary:
      "Unpolarized light incident on polarizer-analyzer chains I = ½ I_0 cos²θ and inverse incident unpolarized intensity.",
  },
] as const;

export interface WavesGeneratorOptions {
  /** Total number of verified candidates to generate (default: 327). */
  readonly count?: number;
  /** Base integer seed for deterministic PRNG (default: 20260601). */
  readonly seed?: number;
  /** Target fraction of MCQ items in [0, 1] when custom count is given (default: 0.6514). */
  readonly mcqFraction?: number;
  /** Optional subset of template archetypes to generate. */
  readonly archetypes?: readonly WavesTemplateArchetype[];
  /** Provenance model identifier (default: "gemini-4-carbon-high"). */
  readonly generatorModel?: string;
  /** Maximum pairwise 3-gram shingle Jaccard similarity allowed (default: 0.72). */
  readonly nearDuplicateSimilarityThreshold?: number;
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

function createSeededRng(seed: number): () => number {
  let state = (Math.trunc(seed) >>> 0) || 0x6d2b79f5;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function pickOffset<T>(
  list: readonly T[],
  index: number,
  rng: () => number,
): T {
  const jitter = Math.floor(rng() * list.length);
  return list[(index * 7 + jitter) % list.length];
}

function fmtSig3(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite quantity in formatter: ${String(value)}`);
  }
  if (Math.abs(value) < 1e-14) {
    return "0";
  }
  const abs = Math.abs(value);
  if (abs >= 1e4 || abs < 1e-2) {
    const [mantissa, expRaw] = value.toExponential(2).split("e");
    const expSup = [...expRaw].map((c) => SUPERSCRIPT_DIGITS[c] ?? c).join("");
    return `${mantissa} × 10${expSup}`;
  }
  return value.toPrecision(3);
}

function fmtQuantity(value: number, unit: string): string {
  const numStr = fmtSig3(value);
  if (!unit) return numStr;
  if (unit === "°") return `${numStr}°`;
  return `${numStr} ${unit}`;
}

function fmtGivenScalar(value: number, unit: string): string {
  if (Math.abs(value) < 1e-14) {
    return unit === "°" ? "0°" : unit ? `0 ${unit}` : "0";
  }
  const abs = Math.abs(value);
  let numStr: string;
  if (abs >= 1e4 || abs < 1e-3) {
    const [mantissa, expRaw] = value.toExponential(2).split("e");
    const cleanMantissa = Number(mantissa).toString();
    const expSup = [...expRaw].map((c) => SUPERSCRIPT_DIGITS[c] ?? c).join("");
    numStr = `${cleanMantissa} × 10${expSup}`;
  } else {
    numStr = Number(value.toPrecision(4)).toString();
  }
  if (!unit) return numStr;
  if (unit === "°") return `${numStr}°`;
  return `${numStr} ${unit}`;
}

function fmtNm(wavelengthM: number): string {
  const nm = Number((wavelengthM * 1e9).toPrecision(4));
  return `${nm} nm`;
}

function fmtMm(meters: number): string {
  const mm = Number((meters * 1e3).toPrecision(4));
  return `${mm} mm`;
}

function selectDifficulty(slotIndex: number): QuestionDifficulty {
  const mod = slotIndex % 10;
  if (mod < 3) return "foundation";
  if (mod < 7) return "standard";
  return "higher";
}

/**
 * Resolves spec-accurate 3-syllabus tags via `getCompatibleSyllabiForConcept`,
 * strictly enforcing IB SL/HL, UK A-Level Y12/Y13, and NCUK IFY boundaries.
 */
export function resolveWavesSyllabiTags(
  conceptId: WavesConceptId,
  format: QuestionFormat,
  policy: WavesSyllabusScopePolicy,
  variantIndex: number,
): SyllabusTag[] {
  const compatible = getCompatibleSyllabiForConcept(conceptId, { format });
  const tags: SyllabusTag[] = [];

  for (const mapping of compatible) {
    if (mapping.syllabus === "ib") {
      if (policy === "alevel-only" || policy === "ncuk-only" || policy === "alevel-ncuk") {
        continue;
      }
      const desiredLevel: SyllabusLevel =
        policy === "ib-hl-only" || policy === "hl-alevel-ncuk"
          ? "HL"
          : variantIndex % 2 === 0
            ? "SL"
            : "HL";
      const chosenLevel = mapping.levels.includes(desiredLevel)
        ? desiredLevel
        : mapping.levels[0];
      if (!chosenLevel) continue;
      if (
        (policy === "ib-hl-only" || policy === "hl-alevel-ncuk") &&
        chosenLevel !== "HL"
      ) {
        continue;
      }
      tags.push({
        syllabus: "ib",
        level: chosenLevel,
        topicId: mapping.topicIds[0],
        subtopicId: mapping.subtopicIds[0],
      });
    } else if (mapping.syllabus === "alevel") {
      if (policy === "ib-hl-only" || policy === "ncuk-only") {
        continue;
      }
      const desiredLevel: SyllabusLevel =
        variantIndex % 2 === 0 ? "Y12" : "Y13";
      const chosenLevel = mapping.levels.includes(desiredLevel)
        ? desiredLevel
        : mapping.levels[0];
      if (!chosenLevel) continue;
      tags.push({
        syllabus: "alevel",
        level: chosenLevel,
        topicId: mapping.topicIds[0],
        subtopicId: mapping.subtopicIds[0],
      });
    } else if (mapping.syllabus === "ncuk") {
      if (policy === "ib-hl-only" || policy === "alevel-only") {
        continue;
      }
      const chosenLevel: SyllabusLevel = mapping.levels.includes("IFY")
        ? "IFY"
        : mapping.levels[0];
      if (!chosenLevel) continue;
      tags.push({
        syllabus: "ncuk",
        level: chosenLevel,
        topicId: mapping.topicIds[0],
        subtopicId: mapping.subtopicIds[0],
      });
    }
  }

  if (tags.length === 0) {
    throw new Error(
      `No compatible syllabi resolved for concept="${conceptId}", format="${format}", policy="${policy}"`,
    );
  }
  return tags;
}

interface RawMcqDistractorCandidate {
  readonly value: number;
  readonly rationale: string;
}

function buildDistinctMcqOptions(
  correctValue: number,
  unit: string,
  distractors: readonly RawMcqDistractorCandidate[],
  fallbackMultipliers: readonly RawMcqDistractorCandidate[],
  isExactInteger = false,
): { options: McqOptionItem[]; correctLabel: "A" | "B" | "C" | "D" } | undefined {
  if (!Number.isFinite(correctValue) || correctValue <= 0) {
    return undefined;
  }

  const formatVal = (v: number): string =>
    isExactInteger
      ? unit
        ? `${Math.round(v)} ${unit}`
        : String(Math.round(v))
      : fmtQuantity(v, unit);

  const selected: Array<{
    value: number;
    text: string;
    isCorrect: boolean;
    distractorRationale?: string;
  }> = [
    {
      value: correctValue,
      text: formatVal(correctValue),
      isCorrect: true,
    },
  ];

  const allCandidates = [...distractors, ...fallbackMultipliers];
  for (const cand of allCandidates) {
    if (selected.length === 4) break;
    const rawVal = isExactInteger ? Math.round(cand.value) : cand.value;
    if (!Number.isFinite(rawVal) || rawVal <= 0) continue;
    if (isExactInteger && Math.abs(cand.value - rawVal) > 1e-6) continue;

    const tooClose = selected.some((existing) => {
      if (isExactInteger) {
        return Math.round(existing.value) === rawVal;
      }
      const rel =
        Math.abs(existing.value - rawVal) /
        Math.max(Math.abs(existing.value), 1e-12);
      return rel < 0.028;
    });
    if (tooClose) continue;

    const formattedText = formatVal(rawVal);
    if (selected.some((e) => e.text === formattedText)) continue;

    selected.push({
      value: rawVal,
      text: formattedText,
      isCorrect: false,
      distractorRationale: cand.rationale,
    });
  }

  if (selected.length !== 4) {
    return undefined;
  }

  // Sort ascending by numerical value (standard pre-university exam convention)
  selected.sort((a, b) => a.value - b.value);

  let correctLabel: "A" | "B" | "C" | "D" = "A";
  const options: McqOptionItem[] = selected.map((entry, idx) => {
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
      distractorRationale: entry.distractorRationale!,
    };
  });

  return { options, correctLabel };
}

// ============================================================================
// Rich Experimental Setup & Apparatus Pools (12+ per scenario family)
// ============================================================================

const PROGRESSIVE_SETUPS = [
  {
    context: "a ripple-tank stroboscope camera",
    medium: "shallow water surface ripples",
    sensor: "a calibrated ruler freeze-frame",
  },
  {
    context: "an ultrasonic non-destructive testing bench",
    medium: "elastic shear waves in a polymer bar",
    sensor: "a laser vibrometer scan",
  },
  {
    context: "a physics laboratory slinky-spring track",
    medium: "transverse harmonic pulses along the coil",
    sensor: "a high-speed motion tracker",
  },
  {
    context: "a coastal oceanography telemetry buoy array",
    medium: "regular swell waves across a test basin",
    sensor: "an acoustic wave-height gauge",
  },
  {
    context: "a microwavehorn bench receiver rail",
    medium: "continuous electromagnetic waves in air",
    sensor: "a sliding dipole probe",
  },
  {
    context: "a geotechnical seismic array",
    medium: "horizontally polarized surface waves in bedrock",
    sensor: "a linear geophone line",
  },
  {
    context: "a taut rubber-cord wave demonstrator",
    medium: "sinusoidal disturbances driven by an eccentric cam",
    sensor: "a digital video frame",
  },
  {
    context: "an acoustic impedance-tube transducer rig",
    medium: "travelling pressure-displacement waves in nitrogen",
    sensor: "a dual-microphone probe",
  },
  {
    context: "a biomedical elastography phantom test",
    medium: "harmonic shear waves propagating through gel",
    sensor: "an ultrasound line-scan",
  },
  {
    context: "a precision vibrating-reed actuator",
    medium: "flexural waves travelling along a thin ribbon",
    sensor: "an optical displacement sensor",
  },
  {
    context: "a marine towing-tank wave maker",
    medium: "monochromatic gravity waves along a channel",
    sensor: "capacitance wire probes",
  },
  {
    context: "a dielectric waveguide bench",
    medium: "guided millimetre-wave oscillations",
    sensor: "a crystal detector carriage",
  },
] as const;

const STRING_SETUPS = [
  "a steel acoustic-guitar treble string mounted between a nut and bridge saddle",
  "a sonometer constantan wire clamped rigidly between two knife-edge bridges",
  "a concert harp nylon string stretched between fixed tuning pins",
  "a grand-piano phosphor-bronze bass wire anchored across its cast-iron frame",
  "an electromagnetically driven Melde's apparatus cord fixed at both supports",
  "a cello A-string held taut between the fingerboard nut and tailpiece bridge",
  "a laboratory vibration-generator wire clamped between bench G-clamps",
  "a violin E-string tensioned across two hardwood vee-blocks on an optical bench",
  "a precision wire-tension metrology rig with rigid end collets",
  "an electric-bass nickel-wound string anchored between bridge and headstock nut",
  "a tungsten resonator filament clamped at both ends in a vacuum bell jar",
  "a brass harpsichord wire stretched between fixed hitch and wrest pins",
] as const;

const OPEN_PIPE_SETUPS = [
  "a cylindrical concert-flute body tube open to the atmosphere at both ends",
  "an open-open anodised aluminium organ flue pipe in a recital hall",
  "a clear acrylic resonance tube held horizontally with both ends unobstructed",
  "an acoustic wind-chime brass cylinder suspended freely with both ends open",
  "a glass Kundt's open duct excited by a miniature loudspeaker near one rim",
  "a PVC laboratory air-column pipe mounted on stands with both ends open",
  "a soprano recorder cylindrical bore section tested with both ends open",
  "a copper HVAC acoustic resonator duct open at each termination",
  "an orchestral piccolo cylindrical test bore open at both extremities",
  "a borosilicate glass acoustic waveguide open at both ends on an optical rail",
] as const;

const CLOSED_PIPE_SETUPS = [
  "a vertical glass tube whose lower end is sealed by a water column and upper end is open",
  "a stopped wooden organ pipe capped tightly at one end and open at its mouth",
  "a quarter-wave automotive exhaust side-branch silencer closed at its far cap",
  "a cylindrical clarinet-model bore closed at the reed end and open at the bell",
  "a Kundt's acoustic tube fitted with a rigid brass piston at one end and open at the other",
  "a graduated laboratory resonance cylinder closed at the base and excited at the top rim",
  "a pan-flute bamboo cane sealed by a natural node at the bottom and open at the top",
  "an industrial Helmholtz-duct stub capped at one flange and open to air at the other",
  "a brass calibration air column sealed by an end-plug on the left and open on the right",
  "a narrow quartz acoustic resonator closed at one termination and open at the opposite end",
] as const;

const DOUBLE_SLIT_SETUPS = [
  "a helium-neon gas laser illuminating a precision photo-etched double slit",
  "a collimated green DPSS diode-pumped laser directed normally onto two narrow parallel slits",
  "a violet semiconductor laser beam incident perpendicular to a dual-slit foil slide",
  "a sodium vapour discharge lamp filtered and collimated onto a Young's double-slit plate",
  "a blue gallium-nitride laser module aligned along an optical rail toward two parallel slits",
  "a red laboratory alignment diode laser shining normally on a blackened glass double-slit mask",
  "a cyan argon-ion laser beam passing through a pair of closely spaced parallel apertures",
  "a stabilised monochromatic optical-bench laser incident at right angles on slits S₁ and S₂",
  "a coherent laser source in a darkroom metrology rig illuminating two identical parallel slits",
  "a narrowband dye-laser beam striking a micro-machined silicon double-slit diaphragm",
] as const;

const GRATING_SETUPS = [
  "a transmission diffraction grating mounted on thevernier table of a spectrometer",
  "a holographic polymer grating slide illuminated at normal incidence on an optical rail",
  "a collimated laser wavelength-calibration rig fitted with a plane transmission grating",
  "a student goniometer spectrometer carrying a ruled glass diffraction grating",
  "an astronomical spectrograph test bench using a normal-incidence transmission grating",
  "a telecommunications optical-spectrum test stage with a precision ruled grating",
  "a darkroom laser diffractometer holding a multi-slit transmission grating perpendicular to the beam",
  "a discharge-lamp spectroscopy setup where collimated monochromatic light strikes a grating normally",
  "a metrology optical encoder bench illuminating a ruled glass grating at zero angle of incidence",
  "a physics Required Practical bench where a laser beam hits a clamped transmission grating squarely",
] as const;

const SINGLE_SLIT_SETUPS = [
  "an adjustable micrometer razor-blade single slit illuminated normally by a collimated laser",
  "a photolithographic chrome-on-quartz single-aperture mask in a Fraunhofer diffraction rig",
  "a quality-control laser diffractometer measuring beam spread through a narrow rectangular slit",
  "an optical-bench single-slit slide followed by a linear CCD photodiode screen",
  "a precision Spark-eroded metal foil slit struck perpendicularly by a monochromatic laser beam",
  "a darkroom diffraction bench where coherent plane waves pass through a single narrow aperture",
  "a semiconductor-wafer metrology aperture illuminated squarely by a stabilised laser diode",
  "a collimated gas-laser beam incident at right angles onto a calibrated single slit of width b",
  "an undergraduate optics rail setup projecting a single-slit Fraunhofer pattern onto a matte screen",
  "a laser beam-expander test stage directing plane wavefronts onto a narrow vertical slit",
] as const;

const DOPPLER_SETUPS = [
  {
    source: "an emergency ambulance siren",
    observer: "a stationary roadside acoustic logger",
    movingObserver: "a pursuit motorcycle carrying a calibrated microphone",
  },
  {
    source: "an express electric locomotive horn",
    observer: "a commuter standing beside the straight track",
    movingObserver: "an inspection trolley rolling along the parallel rail",
  },
  {
    source: "a racing telemetry drone emitting a steady acoustic tone",
    observer: "a trackside timing marshal",
    movingObserver: "a camera car driving along the straightaway",
  },
  {
    source: "a fire-appliance warning horn",
    observer: "a pedestrian waiting at a kerbside crossing",
    movingObserver: "a patrol car travelling along the same avenue",
  },
  {
    source: "a high-speed sled mounted with an acoustic whistle",
    observer: "a fixed microphone at the end of the test track",
    movingObserver: "an instrumented chase cart on the parallel guideway",
  },
  {
    source: "a coastguard rescue-launch foghorn",
    observer: "a harbour-wall sound-level recorder",
    movingObserver: "a pilot boat cruising along the channel",
  },
  {
    source: "an aerobatic prop-plane acoustic beacon",
    observer: "an airfield tower microphone",
    movingObserver: "a runway calibration vehicle",
  },
  {
    source: "an autonomous test-track vehicle ultrasonic-audible beacon",
    observer: "a fixed acoustic array post",
    movingObserver: "a second instrumented test vehicle on the straight lane",
  },
] as const;

const MALUS_SETUPS = [
  "an optical bench fitted with a Glan-Thompson calcite polarizer and a rotatable analyzer",
  "a liquid-crystal display (LCD) backlight test rig using thin-film linear polaroid sheets",
  "a laser power-attenuation stage feeding a calibrated silicon photodiode detector",
  "a stress-photoelasticity polariscope bench with graduated rotary analyzer mount",
  "a photographic filter-transmission test bench with high-extinction linear polarizers",
  "a microwave horn link employing parallel wire-grid polarizing frames",
  "a spectrophotometer polarization module with a precision rotary Vernier analyzer",
  "an optical-mineralogy bench testing transmission through crossed and angled polaroids",
  "a glare-suppression laboratory rig directing a collimated beam onto linear polarizing films",
  "a fibre-optics free-space polarization controller bench with an ideal linear analyzer",
] as const;

// ============================================================================
// Archetype Candidate Builders
// ============================================================================

type ArchetypeBuilder = (
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
) => CandidateQuestionInput | undefined;

function buildProgressiveSpatialWaveSpeed(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const amplitudeM = pick(rng, [
    0.012, 0.015, 0.018, 0.024, 0.03, 0.036, 0.042, 0.048, 0.06, 0.075,
  ]);
  const wavelengthM = pick(rng, [
    0.2, 0.25, 0.32, 0.4, 0.48, 0.6, 0.75, 0.8, 1.2, 1.5, 1.6, 2.4,
  ]);
  const frequencyHz = pick(rng, [
    5, 8, 12, 15, 18, 22, 25, 35, 44, 55, 65, 85,
  ]);
  const direction = pick(rng, ["right", "left"] as const);
  const cyclesShown = pick(rng, [2, 2.5, 3]);
  const setup = pickOffset(PROGRESSIVE_SETUPS, slotIndex, rng);
  const syllabi = resolveWavesSyllabiTags(
    "progressive-waves-polarization",
    format,
    "all-core",
    slotIndex,
  );

  const isInverse = format === "mcq" && slotIndex % 2 === 1;
  const hiddenQuantities = isInverse
    ? [
        "frequencyHz",
        "periodS",
        "angularFrequencyRadS",
        "wavenumberRadM",
        "crestToTroughM",
      ]
    : [
        "waveSpeedMs",
        "periodS",
        "angularFrequencyRadS",
        "wavenumberRadM",
        "crestToTroughM",
      ];

  const spec: ProgressiveWaveScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "progressive-wave",
    profileKind: "displacement-position",
    amplitudeM,
    wavelengthM,
    frequencyHz,
    direction,
    cyclesShown,
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const aStr = fmtGivenScalar(amplitudeM, "m");
  const wlStr = fmtGivenScalar(wavelengthM, "m");
  const fStr = fmtGivenScalar(frequencyHz, "Hz");
  const vStr = fmtGivenScalar(sol.waveSpeedMs, "m s⁻¹");

  if (format === "mcq") {
    if (!isInverse) {
      const stems = [
        `Using ${setup.context}, a snapshot of ${setup.medium} travelling to the ${direction} shows an amplitude of ${aStr} and a wavelength of ${wlStr}. If the wave source oscillates at ${fStr}, what is the propagation speed of the wave?`,
        `The displacement–position graph recorded by ${setup.sensor} on ${setup.context} displays a progressive wave of amplitude ${aStr} and wavelength ${wlStr} driven at a frequency of ${fStr}. Calculate the speed of this wave.`,
        `In an investigation with ${setup.context}, ${setup.medium} of amplitude ${aStr} have a crest-to-crest wavelength of ${wlStr} while the oscillator operates at ${fStr}. At what speed do the wavefronts travel?`,
        `Figure shows the spatial profile y(x) captured by ${setup.sensor} for ${setup.medium} of wavelength ${wlStr} and amplitude ${aStr}. Given a source frequency of ${fStr}, determine the wave speed.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const built = buildDistinctMcqOptions(
        sol.waveSpeedMs,
        "m s⁻¹",
        [
          {
            value: frequencyHz / wavelengthM,
            rationale:
              "Divides frequency by wavelength (f / λ) instead of applying v = fλ.",
          },
          {
            value: wavelengthM / frequencyHz,
            rationale:
              "Divides wavelength by frequency (λ / f), confusing frequency f with period T.",
          },
          {
            value: 2 * sol.waveSpeedMs,
            rationale:
              "Doubles the wavelength by misreading a two-cycle span as a single wavelength.",
          },
        ],
        [
          {
            value: 0.5 * sol.waveSpeedMs,
            rationale:
              "Uses half a wavelength (adjacent node/zero-crossing distance) in place of λ.",
          },
        ],
      );
      if (!built) return undefined;

      const plan: CandidateQuestionPlan = {
        targetSummary:
          "Compute progressive wave speed from spatial profile wavelength and source frequency",
        distractorStrategy: [
          "divide-frequency-by-wavelength",
          "confuse-frequency-with-period",
          "double-wavelength-from-multi-cycle-plot",
        ],
      };

      return {
        id,
        conceptId: "progressive-waves-polarization",
        templateArchetype: "progressive-spatial-profile-wave-speed",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          { name: "amplitudeM", value: amplitudeM, unit: "m", source: "stem" },
          { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
          { name: "frequencyHz", value: frequencyHz, unit: "Hz", source: "stem" },
        ],
        questionPlan: plan,
        stem,
        options: built.options,
        targetQuantityKey: "waveSpeedMs",
        workedSolution: `From the displacement–position profile, wavelength λ = ${wlStr} and frequency f = ${fStr}. Using the wave equation v = fλ = ${fStr} × ${wlStr} = ${fmtQuantity(sol.waveSpeedMs, "m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies v = fλ to obtain ${fmtQuantity(sol.waveSpeedMs, "m s⁻¹")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Inverse MCQ: given v and λ from y(x), find f = v / λ
    const stems = [
      `On ${setup.context}, ${setup.sensor} captures a displacement–position profile for ${setup.medium} of amplitude ${aStr} and wavelength ${wlStr} propagating at ${vStr}. What is the frequency of oscillation of the wave?`,
      `A progressive wave in ${setup.medium} is monitored with ${setup.context}. Its spatial snapshot shows amplitude ${aStr} and wavelength ${wlStr}, and wavefronts advance at ${vStr}. Determine the source frequency.`,
      `Measurements from ${setup.sensor} on ${setup.context} show a sinusoidal wave of amplitude ${aStr} and wavelength ${wlStr} travelling ${direction}wards at a speed of ${vStr}. Which value gives the wave frequency?`,
      `While calibrating ${setup.context}, ${setup.medium} of amplitude ${aStr} travel at ${vStr} with an observed wavelength of ${wlStr}. Calculate the oscillation frequency of a medium particle.`,
    ];
    const stem = pickOffset(stems, slotIndex, rng);
    const built = buildDistinctMcqOptions(
      sol.frequencyHz,
      "Hz",
      [
        {
          value: sol.waveSpeedMs * wavelengthM,
          rationale:
            "Multiplies wave speed by wavelength (vλ) instead of dividing v by λ.",
        },
        {
          value: wavelengthM / sol.waveSpeedMs,
          rationale:
            "Calculates the oscillation period T = λ / v instead of the frequency f = v / λ.",
        },
        {
          value: sol.waveSpeedMs / (2 * wavelengthM),
          rationale:
            "Mistakes two full cycles for one wavelength, halving the calculated frequency.",
        },
      ],
      [
        {
          value: (2 * sol.waveSpeedMs) / wavelengthM,
          rationale:
            "Uses half-wavelength crest-to-trough horizontal spacing instead of full wavelength λ.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "progressive-waves-polarization",
      templateArchetype: "progressive-spatial-profile-wave-speed",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        { name: "amplitudeM", value: amplitudeM, unit: "m", source: "stem" },
        { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
        {
          name: "waveSpeedMs",
          value: sol.waveSpeedMs,
          unit: "m s⁻¹",
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Invert the wave speed relation to find oscillation frequency from spatial profile wavelength and wave speed",
        distractorStrategy: [
          "multiply-speed-by-wavelength",
          "compute-period-instead-of-frequency",
          "misread-two-cycle-span-as-single-wavelength",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "frequencyHz",
      workedSolution: `Using f = v / λ with wave speed v = ${vStr} and wavelength λ = ${wlStr} gives f = ${sol.waveSpeedMs} / ${wavelengthM} = ${fmtQuantity(sol.frequencyHz, "Hz")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Rearranges v = fλ to obtain f = v / λ = ${fmtQuantity(sol.frequencyHz, "Hz")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2 question
  const askOmega = slotIndex % 2 === 0;
  const partCKey = askOmega ? "angularFrequencyRadS" : "crestToTroughM";
  const partCVal = askOmega ? sol.angularFrequencyRadS : sol.crestToTroughM;
  const partCUnit = askOmega ? "rad s⁻¹" : "m";

  const stems = [
    `In an experiment using ${setup.context}, ${setup.sensor} records the instantaneous displacement–position profile y(x) of ${setup.medium} travelling to the ${direction}. The wave has amplitude ${aStr}, wavelength ${wlStr}, and source frequency ${fStr}.`,
    `A continuous progressive wave in ${setup.medium} is investigated on ${setup.context}. Figure shows the spatial profile captured at a single instant, with amplitude ${aStr} and wavelength ${wlStr}, driven continuously at ${fStr}.`,
    `Data from ${setup.sensor} on ${setup.context} show a sinusoidal wave of amplitude ${aStr} and wavelength ${wlStr} propagating ${direction}wards at an oscillation frequency of ${fStr}.`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: "Calculate the time period of oscillation of a point in the medium.",
      marks: 2,
      targetQuantityKey: "periodS",
      expectedAnswer: fmtQuantity(sol.periodS, "s"),
      workingSteps: [
        "Use T = 1 / f.",
        `T = 1 / ${frequencyHz} = ${fmtQuantity(sol.periodS, "s")}.`,
      ],
    },
    {
      partId: "b",
      prompt: "Determine the propagation speed of the progressive wave.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "waveSpeedMs",
      expectedAnswer: fmtQuantity(sol.waveSpeedMs, "m s⁻¹"),
      workingSteps: [
        "Apply v = fλ (or v = λ / T).",
        `v = ${frequencyHz} × ${wavelengthM} = ${fmtQuantity(sol.waveSpeedMs, "m s⁻¹")}.`,
      ],
    },
    askOmega
      ? {
          partId: "c",
          prompt: "Calculate the angular frequency ω of the wave oscillations.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "angularFrequencyRadS",
          expectedAnswer: fmtQuantity(partCVal, partCUnit),
          workingSteps: [
            "Use ω = 2πf (or 2π / T).",
            `ω = 2π × ${frequencyHz} = ${fmtQuantity(partCVal, partCUnit)}.`,
          ],
        }
      : {
          partId: "c",
          prompt:
            "Determine the total vertical distance moved by a medium particle in travelling from a wave crest to an adjacent trough.",
          marks: 2,
          targetQuantityKey: "crestToTroughM",
          expectedAnswer: fmtQuantity(partCVal, partCUnit),
          workingSteps: [
            "Crest-to-trough vertical span equals twice the wave amplitude, Δy = 2A.",
            `Δy = 2 × ${amplitudeM} = ${fmtQuantity(partCVal, partCUnit)}.`,
          ],
        },
  ];

  const markScheme: MarkSchemePoint[] = [
    {
      code: "M1",
      partId: "a",
      criterion: "Applies T = 1 / f with given frequency.",
      marks: 1,
    },
    {
      code: "A1",
      partId: "a",
      criterion: `Obtains T = ${fmtQuantity(sol.periodS, "s")}.`,
      marks: 1,
    },
    {
      code: "M1",
      partId: "b",
      criterion: "Substitutes into v = fλ or v = λ / T.",
      marks: 1,
    },
    {
      code: "A1",
      partId: "b",
      criterion: `Obtains v = ${fmtQuantity(sol.waveSpeedMs, "m s⁻¹")}.`,
      marks: 1,
    },
    {
      code: "M1",
      partId: "c",
      criterion: askOmega
        ? "Uses ω = 2πf or ω = 2π / T."
        : "Identifies crest-to-trough displacement magnitude as 2A.",
      marks: 1,
    },
    {
      code: "A1",
      partId: "c",
      criterion: `Obtains ${fmtQuantity(partCVal, partCUnit)}.`,
      marks: 1,
    },
  ];

  return {
    id,
    conceptId: "progressive-waves-polarization",
    templateArchetype: "progressive-spatial-profile-wave-speed",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      { name: "amplitudeM", value: amplitudeM, unit: "m", source: "stem" },
      { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
      { name: "frequencyHz", value: frequencyHz, unit: "Hz", source: "stem" },
    ],
    questionPlan: {
      targetSummary:
        "Analyse a progressive wave spatial profile across oscillation period, wave speed, and derived wave kinematics",
      subpartStrategy: [
        "part (a): target periodS",
        "part (b): target waveSpeedMs",
        `part (c): target ${partCKey}`,
      ],
    },
    stem,
    parts,
    workedSolution: `(a) Period T = 1 / f = 1 / ${frequencyHz} = ${fmtQuantity(sol.periodS, "s")}. (b) Wave speed v = fλ = ${frequencyHz} × ${wavelengthM} = ${fmtQuantity(sol.waveSpeedMs, "m s⁻¹")}. (c) ${askOmega ? `Angular frequency ω = 2πf = ${fmtQuantity(partCVal, partCUnit)}` : `Crest-to-trough distance = 2A = ${fmtQuantity(partCVal, partCUnit)}`}.`,
    markScheme,
    totalMarks: 6,
    generatorModel,
  };
}

function buildProgressiveTemporalPhaseDiff(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const setup = pickOffset(PROGRESSIVE_SETUPS, slotIndex + 3, rng);
  const syllabi = resolveWavesSyllabiTags(
    "progressive-waves-polarization",
    format,
    "all-core",
    slotIndex,
  );
  const amplitudeM = pick(rng, [
    0.014, 0.018, 0.022, 0.028, 0.035, 0.045, 0.055, 0.065,
  ]);
  const wavelengthM = pick(rng, [0.24, 0.36, 0.4, 0.6, 0.8, 1.2, 1.6, 2.0]);
  const frequencyHz = pick(rng, [4, 5, 8, 10, 12.5, 20, 25, 40, 50]);

  // Half of MCQs test inverse wavelength from y(t) displacement-time trace; rest test phase difference
  if (format === "mcq" && slotIndex % 3 === 1) {
    const hiddenQuantities = [
      "wavelengthM",
      "frequencyHz",
      "angularFrequencyRadS",
      "wavenumberRadM",
      "crestToTroughM",
    ];
    const spec: ProgressiveWaveScenarioSpec = {
      schemaVersion: WAVES_SCHEMA_VERSION,
      id,
      kind: "progressive-wave",
      profileKind: "displacement-time",
      amplitudeM,
      wavelengthM,
      frequencyHz,
      cyclesShown: 2,
      hiddenQuantities,
    };
    const sol = solveWavesScenario(spec);
    const tStr = fmtGivenScalar(sol.periodS, "s");
    const vStr = fmtGivenScalar(sol.waveSpeedMs, "m s⁻¹");
    const aStr = fmtGivenScalar(amplitudeM, "m");

    const stems = [
      `A single probe in ${setup.context} records the displacement–time trace y(t) of ${setup.medium} with amplitude ${aStr} and period ${tStr}. If the wave travels through the medium at ${vStr}, what is its wavelength?`,
      `Figure shows the temporal oscillation y(t) at a fixed point for ${setup.medium} studied on ${setup.context}. The period is ${tStr}, the amplitude is ${aStr}, and the propagation speed is ${vStr}. Calculate the wavelength.`,
      `On ${setup.context}, ${setup.sensor} logs a sinusoidal displacement–time graph of period ${tStr} and amplitude ${aStr} for a wave moving at ${vStr}. Determine the wavelength of this progressive wave.`,
    ];
    const stem = pickOffset(stems, slotIndex, rng);
    const built = buildDistinctMcqOptions(
      sol.wavelengthM,
      "m",
      [
        {
          value: sol.waveSpeedMs / sol.periodS,
          rationale:
            "Divides wave speed by period (v / T), treating period T on the time axis as if it were frequency f.",
        },
        {
          value: sol.periodS / sol.waveSpeedMs,
          rationale:
            "Divides period by wave speed (T / v) instead of multiplying vT.",
        },
        {
          value: 2 * sol.wavelengthM,
          rationale:
            "Reads the full two-cycle time span 2T as a single period when computing λ = vT.",
        },
      ],
      [
        {
          value: 0.5 * sol.wavelengthM,
          rationale:
            "Uses half-period zero-crossing interval T/2 instead of full period T.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "progressive-waves-polarization",
      templateArchetype: "progressive-temporal-phase-difference",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        { name: "amplitudeM", value: amplitudeM, unit: "m", source: "stem" },
        { name: "periodS", value: sol.periodS, unit: "s", source: "stem" },
        {
          name: "waveSpeedMs",
          value: sol.waveSpeedMs,
          unit: "m s⁻¹",
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Determine wavelength from a displacement-time oscillation period and given wave propagation speed",
        distractorStrategy: [
          "mistake-period-for-frequency-dividing-speed-by-period",
          "invert-product-of-speed-and-period",
          "read-two-cycle-window-as-single-period",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "wavelengthM",
      workedSolution: `From the displacement–time trace, the period is T = ${tStr}. Using λ = vT with v = ${vStr} gives λ = ${sol.waveSpeedMs} × ${sol.periodS} = ${fmtQuantity(sol.wavelengthM, "m")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Uses λ = vT = ${vStr} × ${tStr} to obtain ${fmtQuantity(sol.wavelengthM, "m")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Phase difference between markers P and Q on displacement-position or displacement-time profile
  const useTimeProfile = slotIndex % 2 === 1;
  const profileKind = useTimeProfile
    ? "displacement-time"
    : "displacement-position";
  const cycleUnit = useTimeProfile ? 1 / frequencyHz : wavelengthM;
  const p1Frac = pick(rng, [0.1, 0.15, 0.2, 0.25]);
  const sepFrac = pick(rng, [0.15, 0.2, 0.3, 0.35, 0.375, 0.4, 0.6, 0.65, 0.75]);
  const point1Coord = Number((p1Frac * cycleUnit).toPrecision(6));
  const point2Coord = Number(((p1Frac + sepFrac) * cycleUnit).toPrecision(6));

  const hiddenQuantities = [
    "phaseDifferenceRad",
    "phaseDifferenceModulo2PiRad",
    "principalPhaseDifferenceRad",
    "phaseDifferenceDegrees",
    "fractionalCycles",
    "coordSeparation",
    "point1DisplacementM",
    "point2DisplacementM",
    "waveSpeedMs",
    ...(useTimeProfile ? [] : ["periodS"]),
    "angularFrequencyRadS",
    "wavenumberRadM",
    "crestToTroughM",
  ];

  const spec: ProgressiveWaveScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "progressive-wave",
    profileKind,
    amplitudeM,
    wavelengthM,
    frequencyHz,
    cyclesShown: 2.5,
    point1Coord,
    point2Coord,
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const aStr = fmtGivenScalar(amplitudeM, "m");
  const wlStr = fmtGivenScalar(wavelengthM, "m");
  const fStr = fmtGivenScalar(frequencyHz, "Hz");
  const coordUnit = useTimeProfile ? "s" : "m";
  const p1Str = fmtGivenScalar(point1Coord, coordUnit);
  const p2Str = fmtGivenScalar(point2Coord, coordUnit);

  if (format === "mcq") {
    const askDegrees = slotIndex % 4 === 0;
    const targetKey = askDegrees
      ? "phaseDifferenceDegrees"
      : "phaseDifferenceRad";
    const targetVal = askDegrees
      ? sol.phaseDifferenceDegrees
      : sol.phaseDifferenceRad;
    const unit = askDegrees ? "°" : "rad";
    const fullCycleAngle = askDegrees ? 360 : 2 * Math.PI;

    const stems = useTimeProfile
      ? [
          `On ${setup.context}, ${setup.sensor} records a displacement–time wave trace of amplitude ${aStr}, wavelength ${wlStr}, and frequency ${fStr}. Two instants P and Q occur at t₁ = ${p1Str} and t₂ = ${p2Str}. What is the phase difference (${askDegrees ? "in degrees" : "in radians"}) between instants P and Q?`,
          `A fixed detector on ${setup.context} monitors ${setup.medium} of frequency ${fStr}, wavelength ${wlStr}, and amplitude ${aStr}. Determine the phase change ${askDegrees ? "in degrees" : "in radians"} between t = ${p1Str} (point P) and t = ${p2Str} (point Q).`,
        ]
      : [
          `Along ${setup.context}, ${setup.medium} of amplitude ${aStr}, wavelength ${wlStr}, and frequency ${fStr} pass markers P at x₁ = ${p1Str} and Q at x₂ = ${p2Str}. What is the phase difference (${askDegrees ? "in degrees" : "in radians"}) between P and Q?`,
          `Figure shows a snapshot from ${setup.sensor} on ${setup.context} for a wave of wavelength ${wlStr}, frequency ${fStr}, and amplitude ${aStr}. Points P and Q lie at x₁ = ${p1Str} and x₂ = ${p2Str}. Calculate the phase difference ${askDegrees ? "in degrees" : "in radians"} between P and Q.`,
        ];
    const stem = pickOffset(stems, slotIndex, rng);

    const built = buildDistinctMcqOptions(
      targetVal,
      unit,
      [
        {
          value: 0.5 * targetVal,
          rationale: `Uses half a cycle (${askDegrees ? "180°" : "π rad"}) instead of a full cycle (${askDegrees ? "360°" : "2π rad"}) in the phase-difference formula.`,
        },
        {
          value: fullCycleAngle / sol.fractionalCycles,
          rationale:
            "Inverts the fractional cycle ratio (dividing cycle span by separation instead of separation by cycle span).",
        },
        {
          value: askDegrees
            ? sol.phaseDifferenceRad
            : sol.phaseDifferenceDegrees,
          rationale: askDegrees
            ? "Computes phase difference in radians without converting to degrees."
            : "Computes phase difference in degrees instead of radians.",
        },
      ],
      [
        {
          value: 2 * targetVal,
          rationale:
            "Doubles the coordinate separation when evaluating fractional cycles.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "progressive-waves-polarization",
      templateArchetype: "progressive-temporal-phase-difference",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        { name: "amplitudeM", value: amplitudeM, unit: "m", source: "stem" },
        { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
        { name: "frequencyHz", value: frequencyHz, unit: "Hz", source: "stem" },
        {
          name: "point1Coord",
          value: point1Coord,
          unit: coordUnit,
          source: "stem",
        },
        {
          name: "point2Coord",
          value: point2Coord,
          unit: coordUnit,
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Compute phase difference between two marked coordinates on a progressive wave profile",
        distractorStrategy: [
          "use-half-cycle-pi-instead-of-two-pi",
          "invert-coordinate-separation-to-cycle-ratio",
          "confuse-radians-and-degrees",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: targetKey,
      workedSolution: `Separation Δ${useTimeProfile ? "t" : "x"} = ${p2Str} − ${p1Str} = ${fmtGivenScalar(sol.coordSeparation, coordUnit)}. Cycle span = ${useTimeProfile ? `1 / f = ${fmtSig3(sol.periodS)} s` : wlStr}, giving ${fmtSig3(sol.fractionalCycles)} cycles. Phase difference Δφ = ${askDegrees ? "360°" : "2π"} × ${fmtSig3(sol.fractionalCycles)} = ${fmtQuantity(targetVal, unit)}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates fractional cycle separation and multiplies by ${askDegrees ? "360°" : "2π rad"} to get ${fmtQuantity(targetVal, unit)} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2 question (spatial profile + phase difference)
  const spatialHidden = [
    "periodS",
    "waveSpeedMs",
    "phaseDifferenceRad",
    "phaseDifferenceModulo2PiRad",
    "principalPhaseDifferenceRad",
    "phaseDifferenceDegrees",
    "fractionalCycles",
    "coordSeparation",
    "point1DisplacementM",
    "point2DisplacementM",
    "angularFrequencyRadS",
    "wavenumberRadM",
    "crestToTroughM",
  ];
  const spatialP1 = Number((p1Frac * wavelengthM).toPrecision(6));
  const spatialP2 = Number(((p1Frac + sepFrac) * wavelengthM).toPrecision(6));
  const spatialSpec: ProgressiveWaveScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "progressive-wave",
    profileKind: "displacement-position",
    amplitudeM,
    wavelengthM,
    frequencyHz,
    cyclesShown: 2.5,
    point1Coord: spatialP1,
    point2Coord: spatialP2,
    hiddenQuantities: spatialHidden,
  };
  const sSol = solveWavesScenario(spatialSpec);
  const sp1Str = fmtGivenScalar(spatialP1, "m");
  const sp2Str = fmtGivenScalar(spatialP2, "m");

  const stems = [
    `Using ${setup.context}, ${setup.sensor} captures a progressive wave in ${setup.medium} with amplitude ${aStr}, wavelength ${wlStr}, and frequency ${fStr}. Two particles P and Q along the propagation axis are located at x₁ = ${sp1Str} and x₂ = ${sp2Str}.`,
    `A harmonic wave travelling through ${setup.medium} is recorded on ${setup.context}. The wave has amplitude ${aStr}, wavelength ${wlStr}, and frequency ${fStr}; markers P and Q sit at equilibrium positions x₁ = ${sp1Str} and x₂ = ${sp2Str}.`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: "Calculate the propagation speed of the wave.",
      marks: 2,
      targetQuantityKey: "waveSpeedMs",
      expectedAnswer: fmtQuantity(sSol.waveSpeedMs, "m s⁻¹"),
      workingSteps: [
        "Use v = fλ.",
        `v = ${frequencyHz} × ${wavelengthM} = ${fmtQuantity(sSol.waveSpeedMs, "m s⁻¹")}.`,
      ],
    },
    {
      partId: "b",
      prompt: "Determine the oscillation period of particle P.",
      marks: 1,
      targetQuantityKey: "periodS",
      expectedAnswer: fmtQuantity(sSol.periodS, "s"),
      workingSteps: [
        `T = 1 / f = 1 / ${frequencyHz} = ${fmtQuantity(sSol.periodS, "s")}.`,
      ],
    },
    {
      partId: "c",
      prompt:
        "Calculate the phase difference, in radians, between the oscillations at P and Q.",
      marks: 2,
      targetQuantityKey: "phaseDifferenceRad",
      expectedAnswer: fmtQuantity(sSol.phaseDifferenceRad, "rad"),
      workingSteps: [
        `Δx = ${sp2Str} − ${sp1Str} = ${fmtSig3(sSol.coordSeparation)} m.`,
        `Δφ = 2π(Δx / λ) = 2π(${fmtSig3(sSol.coordSeparation)} / ${wavelengthM}) = ${fmtQuantity(sSol.phaseDifferenceRad, "rad")}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "progressive-waves-polarization",
    templateArchetype: "progressive-temporal-phase-difference",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spatialSpec as unknown as Record<string, unknown>,
    hiddenQuantities: spatialHidden,
    requiredGivens: [
      { name: "amplitudeM", value: amplitudeM, unit: "m", source: "stem" },
      { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
      { name: "frequencyHz", value: frequencyHz, unit: "Hz", source: "stem" },
      { name: "point1Coord", value: spatialP1, unit: "m", source: "stem" },
      { name: "point2Coord", value: spatialP2, unit: "m", source: "stem" },
    ],
    questionPlan: {
      targetSummary:
        "Combine wave speed, oscillation period, and two-point spatial phase difference on a progressive wave",
      subpartStrategy: [
        "part (a): target waveSpeedMs",
        "part (b): target periodS",
        "part (c): target phaseDifferenceRad",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) v = fλ = ${frequencyHz} × ${wavelengthM} = ${fmtQuantity(sSol.waveSpeedMs, "m s⁻¹")}. (b) T = 1 / ${frequencyHz} = ${fmtQuantity(sSol.periodS, "s")}. (c) Δx = ${fmtSig3(sSol.coordSeparation)} m, so Δφ = 2π Δx / λ = ${fmtQuantity(sSol.phaseDifferenceRad, "rad")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Applies v = fλ.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains v = ${fmtQuantity(sSol.waveSpeedMs, "m s⁻¹")}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains T = ${fmtQuantity(sSol.periodS, "s")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Uses Δφ = 2π(x₂ − x₁) / λ.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains Δφ = ${fmtQuantity(sSol.phaseDifferenceRad, "rad")}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
    generatorModel,
  };
}

function buildStandingStringKinematics(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const stringDesc = pickOffset(STRING_SETUPS, slotIndex, rng);
  const syllabi = resolveWavesSyllabiTags(
    "standing-waves-harmonics",
    format,
    "all-core",
    slotIndex,
  );
  // Use n in {3, 4, 5, 6} so wavelength 2L/n != L and adjacentNodeSpacing L/n != L
  const harmonicNumber = pick(rng, [3, 4, 5, 6]);
  const lengthM = pick(rng, [0.48, 0.6, 0.72, 0.84, 0.96, 1.08, 1.2, 1.44, 1.5]);
  const waveSpeedMs = pick(rng, [72, 90, 108, 126, 144, 168, 192, 216, 252, 288]);

  const isInverseSpeed = format === "mcq" && slotIndex % 3 === 1;
  const askNodeSpacing = format === "mcq" && slotIndex % 3 === 2;

  const hiddenQuantities = isInverseSpeed
    ? [
        "waveSpeedMs",
        "wavelengthM",
        "fundamentalFrequencyHz",
        "periodS",
        "adjacentNodeSpacingM",
        "nodeToAntinodeSpacingM",
      ]
    : [
        "wavelengthM",
        "fundamentalFrequencyHz",
        "harmonicFrequencyHz",
        "frequencyHz",
        "periodS",
        "adjacentNodeSpacingM",
        "nodeToAntinodeSpacingM",
      ];

  const spec: StandingWaveScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "standing-wave",
    boundaryKind: "string-fixed-both",
    lengthM,
    harmonicNumber,
    waveSpeedMs,
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const lStr = fmtGivenScalar(lengthM, "m");
  const vStr = fmtGivenScalar(waveSpeedMs, "m s⁻¹");
  const fnStr = fmtGivenScalar(sol.harmonicFrequencyHz, "Hz");

  if (format === "mcq") {
    if (isInverseSpeed) {
      const stems = [
        `In a standing-wave test on ${stringDesc} of vibrating length ${lStr}, the ${harmonicNumber}th harmonic is excited at a frequency of ${fnStr}. What is the speed of transverse waves along the string?`,
        `Figure illustrates ${stringDesc} of length ${lStr} resonating in harmonic mode n = ${harmonicNumber} when driven at ${fnStr}. Calculate the transverse wave speed on the string.`,
        `When ${stringDesc} of length ${lStr} vibrates in its n = ${harmonicNumber} stationary-wave harmonic, a stroboscope measures its frequency as ${fnStr}. Determine the wave speed along the wire.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const built = buildDistinctMcqOptions(
        sol.waveSpeedMs,
        "m s⁻¹",
        [
          {
            value: (lengthM * sol.harmonicFrequencyHz) / harmonicNumber,
            rationale:
              "Uses λ_n = L / n instead of 2L / n, underestimating wave speed by a factor of 2.",
          },
          {
            value: 2 * lengthM * sol.harmonicFrequencyHz,
            rationale:
              "Treats the harmonic frequency as the fundamental mode (omitting division by n).",
          },
          {
            value: (4 * lengthM * sol.harmonicFrequencyHz) / harmonicNumber,
            rationale:
              "Applies the closed-pipe boundary relation 4L / n instead of fixed-string 2L / n.",
          },
        ],
        [
          {
            value: sol.harmonicFrequencyHz / sol.wavelengthM,
            rationale: "Divides frequency by wavelength instead of multiplying v = fλ.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "standing-waves-harmonics",
        templateArchetype: "standing-string-harmonic-kinematics",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
          { name: "harmonicNumber", value: harmonicNumber, source: "stem" },
          {
            name: "harmonicFrequencyHz",
            value: sol.harmonicFrequencyHz,
            unit: "Hz",
            source: "stem",
          },
        ],
        questionPlan: {
          targetSummary:
            "Determine transverse wave speed on a fixed-both-ends string from harmonic index, length, and resonant frequency",
          distractorStrategy: [
            "omit-factor-two-in-string-harmonic-wavelength",
            "ignore-harmonic-number-treating-as-fundamental",
            "apply-quarter-wave-closed-pipe-boundary",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "waveSpeedMs",
        workedSolution: `For harmonic n = ${harmonicNumber} on a string of length L = ${lStr} fixed at both ends, λ_n = 2L / n = 2(${lengthM}) / ${harmonicNumber} = ${fmtQuantity(sol.wavelengthM, "m")}. Wave speed v = f_n λ_n = ${sol.harmonicFrequencyHz} × ${fmtSig3(sol.wavelengthM)} = ${fmtQuantity(sol.waveSpeedMs, "m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes λ_n = 2L / n and v = f_n λ_n = ${fmtQuantity(sol.waveSpeedMs, "m s⁻¹")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (askNodeSpacing) {
      const stems = [
        `Transverse waves travel at ${vStr} along ${stringDesc} of length ${lStr} resonating in its n = ${harmonicNumber} harmonic. What is the distance between two adjacent displacement nodes?`,
        `Figure shows ${stringDesc} of length ${lStr} vibrating in stationary harmonic mode n = ${harmonicNumber} (wave speed ${vStr}). Determine the separation between consecutive nodes along the string.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const built = buildDistinctMcqOptions(
        sol.adjacentNodeSpacingM,
        "m",
        [
          {
            value: sol.wavelengthM,
            rationale:
              "Calculates a full wavelength λ = 2L / n instead of the half-wavelength node-to-node spacing λ / 2.",
          },
          {
            value: sol.nodeToAntinodeSpacingM,
            rationale:
              "Calculates the node-to-adjacent-antinode distance λ / 4 instead of adjacent node spacing λ / 2.",
          },
          {
            value: lengthM / (harmonicNumber + 1),
            rationale:
              "Divides string length L by the total number of nodes (n + 1) instead of the number of loops n.",
          },
        ],
        [
          {
            value: (2 * lengthM) / (harmonicNumber + 1),
            rationale: "Uses n + 1 instead of n in the full wavelength expression.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "standing-waves-harmonics",
        templateArchetype: "standing-string-harmonic-kinematics",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
          { name: "harmonicNumber", value: harmonicNumber, source: "stem" },
          {
            name: "waveSpeedMs",
            value: waveSpeedMs,
            unit: "m s⁻¹",
            source: "stem",
          },
        ],
        questionPlan: {
          targetSummary:
            "Find spacing between adjacent nodes on a fixed-end stationary string wave",
          distractorStrategy: [
            "confuse-full-wavelength-with-adjacent-node-spacing",
            "confuse-node-antinode-quarter-wave-with-node-spacing",
            "divide-length-by-node-count-instead-of-loop-count",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "adjacentNodeSpacingM",
        workedSolution: `In the n = ${harmonicNumber} harmonic on a fixed string of length L = ${lStr}, n half-wavelength loops fit along L, so adjacent node spacing d_NN = λ / 2 = L / n = ${lengthM} / ${harmonicNumber} = ${fmtQuantity(sol.adjacentNodeSpacingM, "m")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses d_NN = λ / 2 = L / n to obtain ${fmtQuantity(sol.adjacentNodeSpacingM, "m")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Forward MCQ: harmonicFrequencyHz
    const stems = [
      `On ${stringDesc} of length ${lStr}, transverse waves propagate at ${vStr}. What is the resonant frequency when the string vibrates in its n = ${harmonicNumber} harmonic mode?`,
      `Figure depicts ${stringDesc} of fixed length ${lStr} oscillating in harmonic n = ${harmonicNumber}. Given a transverse wave speed of ${vStr}, calculate the frequency of this stationary wave.`,
      `During an acoustics practical, ${stringDesc} of length ${lStr} is excited into its ${harmonicNumber}th harmonic while wave speed on the string is ${vStr}. Which frequency is produced?`,
    ];
    const stem = pickOffset(stems, slotIndex, rng);
    const built = buildDistinctMcqOptions(
      sol.harmonicFrequencyHz,
      "Hz",
      [
        {
          value: sol.fundamentalFrequencyHz,
          rationale:
            "Calculates the first-harmonic fundamental frequency v / (2L) instead of multiplying by harmonic number n.",
        },
        {
          value: (harmonicNumber * waveSpeedMs) / lengthM,
          rationale:
            "Omits the factor of 2 in λ_n = 2L / n, computing f = nv / L.",
        },
        {
          value: (harmonicNumber * waveSpeedMs) / (4 * lengthM),
          rationale:
            "Uses the closed-one-end pipe formula nv / (4L) instead of fixed-both-ends nv / (2L).",
        },
      ],
      [
        {
          value: waveSpeedMs / lengthM,
          rationale: "Assumes λ = L regardless of harmonic mode.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "standing-waves-harmonics",
      templateArchetype: "standing-string-harmonic-kinematics",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
        { name: "harmonicNumber", value: harmonicNumber, source: "stem" },
        {
          name: "waveSpeedMs",
          value: waveSpeedMs,
          unit: "m s⁻¹",
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Calculate the n-th harmonic standing-wave frequency on a string fixed at both ends",
        distractorStrategy: [
          "compute-fundamental-instead-of-nth-harmonic",
          "omit-factor-of-two-in-wavelength",
          "apply-closed-pipe-denominator",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "harmonicFrequencyHz",
      workedSolution: `For a string fixed at both ends in harmonic n = ${harmonicNumber}, λ_n = 2L / n = 2(${lengthM}) / ${harmonicNumber} = ${fmtQuantity(sol.wavelengthM, "m")}. Thus f_n = v / λ_n = ${waveSpeedMs} / ${fmtSig3(sol.wavelengthM)} = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Applies f_n = nv / (2L) to obtain ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2
  const stems = [
    `In a stationary-wave investigation, ${stringDesc} of vibrating length ${lStr} is driven so that it resonates in its n = ${harmonicNumber} harmonic mode, as shown. Transverse waves travel along the string at ${vStr}.`,
    `A vibration generator excites ${stringDesc} of length ${lStr} into its ${harmonicNumber}th harmonic standing wave. The speed of transverse waves on the tensioned string is ${vStr}.`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: `Calculate the wavelength of this n = ${harmonicNumber} harmonic standing wave.`,
      marks: 2,
      targetQuantityKey: "wavelengthM",
      expectedAnswer: fmtQuantity(sol.wavelengthM, "m"),
      workingSteps: [
        "For a string fixed at both ends, λ_n = 2L / n.",
        `λ_${harmonicNumber} = 2 × ${lengthM} / ${harmonicNumber} = ${fmtQuantity(sol.wavelengthM, "m")}.`,
      ],
    },
    {
      partId: "b",
      prompt: "Determine the oscillation frequency of this standing wave.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "harmonicFrequencyHz",
      expectedAnswer: fmtQuantity(sol.harmonicFrequencyHz, "Hz"),
      workingSteps: [
        "Use f_n = v / λ_n.",
        `f_${harmonicNumber} = ${waveSpeedMs} / ${fmtSig3(sol.wavelengthM)} = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
      ],
    },
    {
      partId: "c",
      prompt:
        "Calculate the fundamental (first-harmonic) frequency of the string when kept at the same tension.",
      marks: 1,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "fundamentalFrequencyHz",
      expectedAnswer: fmtQuantity(sol.fundamentalFrequencyHz, "Hz"),
      workingSteps: [
        `f₁ = f_n / n = ${fmtSig3(sol.harmonicFrequencyHz)} / ${harmonicNumber} = ${fmtQuantity(sol.fundamentalFrequencyHz, "Hz")}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "standing-waves-harmonics",
    templateArchetype: "standing-string-harmonic-kinematics",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
      { name: "harmonicNumber", value: harmonicNumber, source: "stem" },
      { name: "waveSpeedMs", value: waveSpeedMs, unit: "m s⁻¹", source: "stem" },
    ],
    questionPlan: {
      targetSummary:
        "Derive harmonic wavelength, resonant frequency, and fundamental mode frequency on a fixed string",
      subpartStrategy: [
        "part (a): target wavelengthM",
        "part (b): target harmonicFrequencyHz",
        "part (c): target fundamentalFrequencyHz",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) λ_${harmonicNumber} = 2L / n = 2(${lengthM}) / ${harmonicNumber} = ${fmtQuantity(sol.wavelengthM, "m")}. (b) f_${harmonicNumber} = v / λ_${harmonicNumber} = ${waveSpeedMs} / ${fmtSig3(sol.wavelengthM)} = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}. (c) Fundamental frequency f₁ = f_${harmonicNumber} / ${harmonicNumber} = ${fmtQuantity(sol.fundamentalFrequencyHz, "Hz")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Uses λ_n = 2L / n.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains λ = ${fmtQuantity(sol.wavelengthM, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies f = v / λ.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains f = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains f₁ = ${fmtQuantity(sol.fundamentalFrequencyHz, "Hz")}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
    generatorModel,
  };
}

function buildStandingStringTensionDensity(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const stringDesc = pickOffset(STRING_SETUPS, slotIndex + 5, rng);
  const lengthM = pick(rng, [0.5, 0.64, 0.75, 0.8, 0.9, 1.1, 1.25]);
  const harmonicNumber = pick(rng, [1, 3, 4, 5]);
  const linearDensityKgM = pick(rng, [
    0.0008, 0.0012, 0.0015, 0.002, 0.0025, 0.0032, 0.0045, 0.006,
  ]);
  const targetSpeed = pick(rng, [65, 85, 95, 110, 125, 140, 160, 185, 210]);
  const tensionN = Number(
    (linearDensityKgM * targetSpeed * targetSpeed).toPrecision(6),
  );

  const isInverseTension = format === "mcq" && slotIndex % 2 === 1;
  // Unprompted forward f = (n/2L)sqrt(T/μ) is AQA Data Booklet (alevel-only);
  // when v = √(T/μ) is supplied (inverse MCQ & structured), tag IB HL + A-Level + NCUK IFY!
  const policy: WavesSyllabusScopePolicy =
    format === "mcq" && !isInverseTension ? "alevel-only" : "hl-alevel-ncuk";
  const syllabi = resolveWavesSyllabiTags(
    "standing-waves-harmonics",
    format,
    policy,
    slotIndex,
  );

  const hiddenQuantities = isInverseTension
    ? [
        "tensionN",
        "waveSpeedMs",
        "wavelengthM",
        "fundamentalFrequencyHz",
        "periodS",
      ]
    : [
        "waveSpeedMs",
        "wavelengthM",
        "fundamentalFrequencyHz",
        "harmonicFrequencyHz",
        "frequencyHz",
        "periodS",
      ];

  const spec: StandingWaveScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "standing-wave",
    boundaryKind: "string-fixed-both",
    lengthM,
    harmonicNumber,
    tensionN,
    linearDensityKgM,
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const lStr = fmtGivenScalar(lengthM, "m");
  const tStr = fmtGivenScalar(tensionN, "N");
  const muStr = fmtGivenScalar(linearDensityKgM, "kg m⁻¹");
  const fnStr = fmtGivenScalar(sol.harmonicFrequencyHz, "Hz");

  if (format === "mcq") {
    if (!isInverseTension) {
      const modePhrase =
        harmonicNumber === 1
          ? "its first harmonic (fundamental, n = 1)"
          : `harmonic mode n = ${harmonicNumber}`;
      const stems = [
        `On a laboratory sonometer, ${stringDesc} of length ${lStr} and mass per unit length ${muStr} is held under a tension of ${tStr}. What is the frequency when it vibrates in ${modePhrase}?`,
        `Figure shows ${stringDesc} of vibrating length ${lStr} and linear density ${muStr} tensioned at ${tStr}. Calculate the resonant frequency of ${modePhrase}.`,
        `A stretched wire (${stringDesc}) has length ${lStr}, mass per unit length ${muStr}, and tension ${tStr}. Determine the stationary-wave frequency in ${modePhrase}.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const built = buildDistinctMcqOptions(
        sol.harmonicFrequencyHz,
        "Hz",
        [
          {
            value:
              (harmonicNumber / (2 * lengthM)) * (tensionN / linearDensityKgM),
            rationale:
              "Omits the square root over T / μ, computing (n / 2L)(T / μ).",
          },
          {
            value: 2 * sol.harmonicFrequencyHz,
            rationale:
              "Omits the factor of 2 in λ_n = 2L / n, computing (n / L)√(T / μ).",
          },
          {
            value:
              (harmonicNumber / (2 * lengthM)) *
              Math.sqrt(linearDensityKgM / tensionN),
            rationale:
              "Inverts tension and mass per unit length inside the radical, using √(μ / T).",
          },
        ],
        [
          {
            value: 0.5 * sol.harmonicFrequencyHz,
            rationale:
              "Applies closed-pipe 4L denominator instead of fixed-string 2L.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "standing-waves-harmonics",
        templateArchetype: "standing-string-tension-linear-density",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
          { name: "harmonicNumber", value: harmonicNumber, source: "stem" },
          { name: "tensionN", value: tensionN, unit: "N", source: "stem" },
          {
            name: "linearDensityKgM",
            value: linearDensityKgM,
            unit: "kg m⁻¹",
            source: "stem",
          },
        ],
        questionPlan: {
          targetSummary:
            "Calculate stretched-string harmonic frequency from length, tension, and mass per unit length",
          distractorStrategy: [
            "omit-square-root-on-tension-to-density-ratio",
            "omit-factor-of-two-in-string-wavelength",
            "invert-tension-and-linear-density",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "harmonicFrequencyHz",
        workedSolution: `Wave speed along the string is v = √(T / μ) = √(${tensionN} / ${linearDensityKgM}) = ${fmtQuantity(sol.waveSpeedMs, "m s⁻¹")}. For n = ${harmonicNumber}, f_n = nv / (2L) = ${harmonicNumber} × ${fmtSig3(sol.waveSpeedMs)} / (2 × ${lengthM}) = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates v = √(T / μ) and f_n = nv / (2L) = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Inverse MCQ: find tensionN (with v = √(T/μ) supplied for 3-syllabus compatibility)
    const stems = [
      `To tune ${stringDesc} of length ${lStr} and linear mass density ${muStr}, its n = ${harmonicNumber} harmonic must resonate at ${fnStr}. Given that transverse wave speed on a taut string is v = √(T / μ), what tension T is required?`,
      `Figure shows ${stringDesc} (length ${lStr}, mass per unit length ${muStr}) vibrating in harmonic n = ${harmonicNumber} at ${fnStr}. Using v = √(T / μ), calculate the tension applied to the string.`,
      `An instrument maker adjusts the tension in ${stringDesc} of vibrating length ${lStr} and linear density ${muStr} until harmonic mode n = ${harmonicNumber} sounds at ${fnStr} (wave speed v = √(T / μ)). Determine the string tension.`,
    ];
    const stem = pickOffset(stems, slotIndex, rng);
    const built = buildDistinctMcqOptions(
      tensionN,
      "N",
      [
        {
          value: linearDensityKgM * sol.waveSpeedMs,
          rationale:
            "Forgets to square the wave speed when rearranging v = √(T / μ) to T = μv².",
        },
        {
          value: 0.25 * tensionN,
          rationale:
            "Uses λ_n = L / n instead of 2L / n, halving v and underestimating T = μv² by a factor of 4.",
        },
        {
          value: (sol.waveSpeedMs * sol.waveSpeedMs) / linearDensityKgM,
          rationale:
            "Divides v² by linear mass density μ instead of multiplying T = μv².",
        },
      ],
      [
        {
          value: 4 * tensionN,
          rationale: "Uses 4L / n instead of 2L / n for fixed-string wavelength.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "standing-waves-harmonics",
      templateArchetype: "standing-string-tension-linear-density",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
        { name: "harmonicNumber", value: harmonicNumber, source: "stem" },
        {
          name: "linearDensityKgM",
          value: linearDensityKgM,
          unit: "kg m⁻¹",
          source: "stem",
        },
        {
          name: "harmonicFrequencyHz",
          value: sol.harmonicFrequencyHz,
          unit: "Hz",
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Invert stretched-string wave speed and harmonic relations to find required string tension",
        distractorStrategy: [
          "forget-to-square-wave-speed",
          "omit-factor-two-in-wavelength-causing-quarter-tension",
          "divide-speed-squared-by-linear-density",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "tensionN",
      workedSolution: `Wavelength λ_n = 2L / n = 2(${lengthM}) / ${harmonicNumber} = ${fmtSig3(sol.wavelengthM)} m, so required wave speed v = f_n λ_n = ${fmtSig3(sol.waveSpeedMs)} m s⁻¹. Rearranging v = √(T / μ) gives T = μv² = ${linearDensityKgM} × (${fmtSig3(sol.waveSpeedMs)})² = ${fmtQuantity(tensionN, "N")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Finds v = 2Lf_n / n and computes T = μv² = ${fmtQuantity(tensionN, "N")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2 (v = √(T/μ) supplied in stem for IB HL + A-Level + NCUK compatibility)
  const stems = [
    `In an acoustics experiment, ${stringDesc} of vibrating length ${lStr} and mass per unit length ${muStr} is placed under a tension of ${tStr} and excited into its n = ${harmonicNumber} harmonic mode. Transverse waves travel along a taut string of tension T and linear density μ at speed v = √(T / μ).`,
    `Figure shows ${stringDesc} of length ${lStr} and linear mass density ${muStr} held at tension ${tStr} while resonating in stationary harmonic n = ${harmonicNumber} (transverse wave speed v = √(T / μ)).`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: "Calculate the speed of transverse waves along the string.",
      marks: 2,
      targetQuantityKey: "waveSpeedMs",
      expectedAnswer: fmtQuantity(sol.waveSpeedMs, "m s⁻¹"),
      workingSteps: [
        "Use v = √(T / μ).",
        `v = √(${tensionN} / ${linearDensityKgM}) = ${fmtQuantity(sol.waveSpeedMs, "m s⁻¹")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the wavelength of the n = ${harmonicNumber} harmonic mode.`,
      marks: 2,
      targetQuantityKey: "wavelengthM",
      expectedAnswer: fmtQuantity(sol.wavelengthM, "m"),
      workingSteps: [
        "Apply λ_n = 2L / n.",
        `λ_${harmonicNumber} = 2 × ${lengthM} / ${harmonicNumber} = ${fmtQuantity(sol.wavelengthM, "m")}.`,
      ],
    },
    {
      partId: "c",
      prompt: "Calculate the resonant frequency of this standing wave.",
      marks: 2,
      dependsOnPartIds: ["a", "b"],
      targetQuantityKey: "harmonicFrequencyHz",
      expectedAnswer: fmtQuantity(sol.harmonicFrequencyHz, "Hz"),
      workingSteps: [
        "Use f_n = v / λ_n.",
        `f_${harmonicNumber} = ${fmtSig3(sol.waveSpeedMs)} / ${fmtSig3(sol.wavelengthM)} = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "standing-waves-harmonics",
    templateArchetype: "standing-string-tension-linear-density",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
      { name: "harmonicNumber", value: harmonicNumber, source: "stem" },
      { name: "tensionN", value: tensionN, unit: "N", source: "stem" },
      {
        name: "linearDensityKgM",
        value: linearDensityKgM,
        unit: "kg m⁻¹",
        source: "stem",
      },
    ],
    questionPlan: {
      targetSummary:
        "Compute string wave speed from tension and linear density, then determine harmonic wavelength and frequency",
      subpartStrategy: [
        "part (a): target waveSpeedMs",
        "part (b): target wavelengthM",
        "part (c): target harmonicFrequencyHz",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) v = √(T / μ) = √(${tensionN} / ${linearDensityKgM}) = ${fmtQuantity(sol.waveSpeedMs, "m s⁻¹")}. (b) λ_${harmonicNumber} = 2L / n = 2(${lengthM}) / ${harmonicNumber} = ${fmtQuantity(sol.wavelengthM, "m")}. (c) f_${harmonicNumber} = v / λ_${harmonicNumber} = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Substitutes T and μ into v = √(T / μ).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains v = ${fmtQuantity(sol.waveSpeedMs, "m s⁻¹")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies λ_n = 2L / n.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains λ = ${fmtQuantity(sol.wavelengthM, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Divides wave speed from (a) by wavelength from (b).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains f = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

function buildStandingOpenPipeHarmonics(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const pipeDesc = pickOffset(OPEN_PIPE_SETUPS, slotIndex, rng);
  const useEndCorrection = format === "structured" || slotIndex % 2 === 0;
  const lengthM = useEndCorrection
    ? pick(rng, [0.32, 0.36, 0.4, 0.44, 0.48, 0.52, 0.56])
    : pick(rng, [0.42, 0.54, 0.66, 0.78, 0.9, 1.14, 1.26]);
  const endCorrectionM = useEndCorrection
    ? pick(rng, [0.016, 0.018, 0.02, 0.022, 0.025, 0.028])
    : 0;
  const harmonicNumber = useEndCorrection
    ? pick(rng, [1, 2, 3, 4])
    : pick(rng, [3, 4, 5]);
  const waveSpeedMs = pick(rng, [330, 334, 338, 340, 343, 346]);

  const policy: WavesSyllabusScopePolicy = useEndCorrection
    ? "hl-alevel-ncuk"
    : "all-core";
  const syllabi = resolveWavesSyllabiTags(
    "standing-waves-harmonics",
    format,
    policy,
    slotIndex,
  );

  const isInverseLength = format === "mcq" && !useEndCorrection && slotIndex % 4 === 1;
  const hiddenQuantities = isInverseLength
    ? [
        "lengthM",
        "effectiveLengthM",
        "wavelengthM",
        "fundamentalFrequencyHz",
        "periodS",
      ]
    : [
        "effectiveLengthM",
        "wavelengthM",
        "fundamentalFrequencyHz",
        "harmonicFrequencyHz",
        "frequencyHz",
        "periodS",
      ];

  const spec: StandingWaveScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "standing-wave",
    boundaryKind: "pipe-open-both",
    lengthM,
    harmonicNumber,
    waveSpeedMs,
    ...(endCorrectionM > 0 ? { endCorrectionM } : {}),
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const lStr = fmtGivenScalar(lengthM, "m");
  const vStr = fmtGivenScalar(waveSpeedMs, "m s⁻¹");
  const eStr = fmtGivenScalar(endCorrectionM, "m");
  const fnStr = fmtGivenScalar(sol.harmonicFrequencyHz, "Hz");

  if (format === "mcq") {
    if (isInverseLength) {
      const stems = [
        `Neglecting end corrections, ${pipeDesc} resonates in its n = ${harmonicNumber} harmonic at ${fnStr} when the speed of sound in air is ${vStr}. What is the physical length of the open pipe?`,
        `Figure shows ${pipeDesc} excited into its ${harmonicNumber}th harmonic stationary wave at ${fnStr} (speed of sound ${vStr}, negligible end correction). Calculate the pipe length L.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const built = buildDistinctMcqOptions(
        lengthM,
        "m",
        [
          {
            value: (harmonicNumber * waveSpeedMs) / (4 * sol.harmonicFrequencyHz),
            rationale:
              "Applies the closed-one-end pipe relation L = nv / (4f_n) instead of open-both-ends L = nv / (2f_n).",
          },
          {
            value: waveSpeedMs / (2 * sol.harmonicFrequencyHz),
            rationale:
              "Omits harmonic number n, computing fundamental half-wavelength v / (2f_n).",
          },
          {
            value: (harmonicNumber * waveSpeedMs) / sol.harmonicFrequencyHz,
            rationale: "Omits the factor of 2 in L = nλ / 2.",
          },
        ],
        [
          {
            value: (2 * sol.harmonicFrequencyHz) / (harmonicNumber * waveSpeedMs),
            rationale: "Inverts the expression for L.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "standing-waves-harmonics",
        templateArchetype: "standing-open-pipe-harmonics",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          { name: "harmonicNumber", value: harmonicNumber, source: "stem" },
          {
            name: "waveSpeedMs",
            value: waveSpeedMs,
            unit: "m s⁻¹",
            source: "stem",
          },
          {
            name: "harmonicFrequencyHz",
            value: sol.harmonicFrequencyHz,
            unit: "Hz",
            source: "stem",
          },
        ],
        questionPlan: {
          targetSummary:
            "Determine open-pipe length from resonant harmonic index, frequency, and speed of sound",
          distractorStrategy: [
            "use-closed-pipe-quarter-wavelength-formula",
            "omit-harmonic-multiplier",
            "omit-half-wavelength-factor",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "lengthM",
        workedSolution: `For an ideal pipe open at both ends, L = nv / (2f_n) = (${harmonicNumber} × ${waveSpeedMs}) / (2 × ${fmtSig3(sol.harmonicFrequencyHz)}) = ${fmtQuantity(lengthM, "m")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses L = nv / (2f_n) to obtain ${fmtQuantity(lengthM, "m")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stems = useEndCorrection
      ? [
          `In an acoustics test, ${pipeDesc} has physical length ${lStr}, and each open end introduces an antinode end correction of ${eStr}. If the speed of sound is ${vStr}, what is the resonant frequency of the n = ${harmonicNumber} harmonic?`,
          `Figure shows ${pipeDesc} of length ${lStr} resonating in mode n = ${harmonicNumber}. Displacement antinodes form at an end correction e = ${eStr} beyond each open end, and sound travels at ${vStr}. Calculate the frequency of this harmonic.`,
          `Sound travels at ${vStr} inside ${pipeDesc} of physical length ${lStr}. Accounting for an acoustic end correction of ${eStr} at each of the two open ends, determine the n = ${harmonicNumber} resonant frequency.`,
        ]
      : [
          `Neglecting end corrections, ${pipeDesc} of length ${lStr} contains air in which sound travels at ${vStr}. What is the frequency of its n = ${harmonicNumber} standing-wave harmonic?`,
          `Figure illustrates ${pipeDesc} of length ${lStr} vibrating in harmonic mode n = ${harmonicNumber} when the speed of sound is ${vStr} (end correction negligible). Calculate the frequency emitted.`,
        ];
    const stem = pickOffset(stems, slotIndex, rng);

    const distractors: RawMcqDistractorCandidate[] = useEndCorrection
      ? [
          {
            value:
              (harmonicNumber * waveSpeedMs) /
              (2 * (lengthM + endCorrectionM)),
            rationale:
              "Adds only one end correction (L + e) instead of accounting for both open ends (L + 2e).",
          },
          {
            value: (harmonicNumber * waveSpeedMs) / (2 * lengthM),
            rationale:
              "Ignores the acoustic end corrections completely, using physical length L instead of L + 2e.",
          },
          {
            value:
              (harmonicNumber * waveSpeedMs) /
              (4 * (lengthM + 2 * endCorrectionM)),
            rationale:
              "Uses the closed-pipe denominator 4L_eff instead of the open-pipe 2L_eff.",
          },
        ]
      : [
          {
            value: waveSpeedMs / (2 * lengthM),
            rationale:
              "Computes the fundamental frequency f₁ instead of the n-th harmonic.",
          },
          {
            value: (harmonicNumber * waveSpeedMs) / (4 * lengthM),
            rationale:
              "Uses closed-one-end pipe relation nv / (4L) instead of open-both-ends nv / (2L).",
          },
          {
            value: (harmonicNumber * waveSpeedMs) / lengthM,
            rationale: "Omits the factor of 2 in λ_n = 2L / n.",
          },
        ];

    const built = buildDistinctMcqOptions(
      sol.harmonicFrequencyHz,
      "Hz",
      distractors,
      [
        {
          value: (harmonicNumber * waveSpeedMs) / (lengthM + 2 * endCorrectionM),
          rationale: "Sets wavelength equal to L_eff / n instead of 2L_eff / n.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "standing-waves-harmonics",
      templateArchetype: "standing-open-pipe-harmonics",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
        { name: "harmonicNumber", value: harmonicNumber, source: "stem" },
        {
          name: "waveSpeedMs",
          value: waveSpeedMs,
          unit: "m s⁻¹",
          source: "stem",
        },
        ...(endCorrectionM > 0
          ? [
              {
                name: "endCorrectionM",
                value: endCorrectionM,
                unit: "m",
                source: "stem" as const,
              },
            ]
          : []),
      ],
      questionPlan: {
        targetSummary:
          "Compute open-both-ends pipe harmonic frequency accounting for antinode boundary conditions",
        distractorStrategy: [
          "apply-single-end-correction-instead-of-double",
          "ignore-end-correction",
          "use-closed-pipe-quarter-wavelength-relation",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "harmonicFrequencyHz",
      workedSolution: useEndCorrection
        ? `Because the pipe is open at both ends, effective acoustic length L_eff = L + 2e = ${lengthM} + 2(${endCorrectionM}) = ${fmtSig3(sol.effectiveLengthM)} m. For n = ${harmonicNumber}, λ_n = 2L_eff / n = ${fmtSig3(sol.wavelengthM)} m, so f_n = v / λ_n = ${waveSpeedMs} / ${fmtSig3(sol.wavelengthM)} = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`
        : `For an open pipe of length L = ${lStr} in harmonic n = ${harmonicNumber}, f_n = nv / (2L) = (${harmonicNumber} × ${waveSpeedMs}) / (2 × ${lengthM}) = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Obtains open-pipe resonant frequency ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2 with two-end correction
  const stems = [
    `An acoustic resonator consists of ${pipeDesc} of physical length ${lStr}. When excited in its n = ${harmonicNumber} harmonic mode, displacement antinodes form at an end correction e = ${eStr} beyond each open end. The speed of sound in the air column is ${vStr}.`,
    `Figure shows ${pipeDesc} of length ${lStr} sounding in stationary mode n = ${harmonicNumber}. Each open rim has an acoustic end correction of ${eStr}, and sound waves propagate at ${vStr}.`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Calculate the effective acoustic length L_eff between the two exterior antinodes.",
      marks: 2,
      targetQuantityKey: "effectiveLengthM",
      expectedAnswer: fmtQuantity(sol.effectiveLengthM, "m"),
      workingSteps: [
        "An open-both-ends pipe has two open ends, so L_eff = L + 2e.",
        `L_eff = ${lengthM} + 2(${endCorrectionM}) = ${fmtQuantity(sol.effectiveLengthM, "m")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the wavelength of the n = ${harmonicNumber} harmonic mode.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "wavelengthM",
      expectedAnswer: fmtQuantity(sol.wavelengthM, "m"),
      workingSteps: [
        "Use λ_n = 2L_eff / n.",
        `λ_${harmonicNumber} = 2 × ${fmtSig3(sol.effectiveLengthM)} / ${harmonicNumber} = ${fmtQuantity(sol.wavelengthM, "m")}.`,
      ],
    },
    {
      partId: "c",
      prompt: "Calculate the resonant frequency of this standing wave.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "harmonicFrequencyHz",
      expectedAnswer: fmtQuantity(sol.harmonicFrequencyHz, "Hz"),
      workingSteps: [
        "Apply f_n = v / λ_n.",
        `f_${harmonicNumber} = ${waveSpeedMs} / ${fmtSig3(sol.wavelengthM)} = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "standing-waves-harmonics",
    templateArchetype: "standing-open-pipe-harmonics",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
      { name: "harmonicNumber", value: harmonicNumber, source: "stem" },
      { name: "waveSpeedMs", value: waveSpeedMs, unit: "m s⁻¹", source: "stem" },
      {
        name: "endCorrectionM",
        value: endCorrectionM,
        unit: "m",
        source: "stem",
      },
    ],
    questionPlan: {
      targetSummary:
        "Evaluate two-end effective acoustic length, harmonic wavelength, and resonant frequency for an open pipe",
      subpartStrategy: [
        "part (a): target effectiveLengthM",
        "part (b): target wavelengthM",
        "part (c): target harmonicFrequencyHz",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) L_eff = L + 2e = ${lengthM} + 2(${endCorrectionM}) = ${fmtQuantity(sol.effectiveLengthM, "m")}. (b) λ_${harmonicNumber} = 2L_eff / ${harmonicNumber} = ${fmtQuantity(sol.wavelengthM, "m")}. (c) f_${harmonicNumber} = ${waveSpeedMs} / ${fmtSig3(sol.wavelengthM)} = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Adds twice the end correction: L_eff = L + 2e.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains L_eff = ${fmtQuantity(sol.effectiveLengthM, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Uses λ_n = 2L_eff / n.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains λ = ${fmtQuantity(sol.wavelengthM, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Uses f = v / λ.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains f = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

function buildStandingClosedPipeOddHarmonics(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const pipeDesc = pickOffset(CLOSED_PIPE_SETUPS, slotIndex, rng);
  const useEndCorrection = slotIndex % 3 === 0;
  const lengthM = pick(rng, [0.24, 0.28, 0.34, 0.42, 0.52, 0.64, 0.76, 0.85]);
  const endCorrectionM = useEndCorrection
    ? pick(rng, [0.015, 0.018, 0.022, 0.026, 0.03])
    : 0;
  const harmonicNumber = pick(rng, [3, 5, 7]);
  const waveSpeedMs = pick(rng, [330, 336, 340, 343, 348]);

  const policy: WavesSyllabusScopePolicy = useEndCorrection
    ? "hl-alevel-ncuk"
    : "all-core";
  const syllabi = resolveWavesSyllabiTags(
    "standing-waves-harmonics",
    format,
    policy,
    slotIndex,
  );

  // Sub-case: test "first overtone" (n = 3 without stating "3" in stem!) on ideal closed pipe
  const isFirstOvertoneTrap =
    format === "mcq" && !useEndCorrection && slotIndex % 2 === 1;
  const effectiveN = isFirstOvertoneTrap ? 3 : harmonicNumber;

  const isInverseSpeed =
    format === "mcq" && !isFirstOvertoneTrap && slotIndex % 4 === 2;

  const hiddenQuantities = isFirstOvertoneTrap
    ? [
        "harmonicNumber",
        "modeIndex",
        "effectiveLengthM",
        "wavelengthM",
        "fundamentalFrequencyHz",
        "harmonicFrequencyHz",
        "frequencyHz",
        "periodS",
      ]
    : isInverseSpeed
      ? [
          "waveSpeedMs",
          "effectiveLengthM",
          "wavelengthM",
          "fundamentalFrequencyHz",
          "periodS",
        ]
      : [
          "effectiveLengthM",
          "wavelengthM",
          "fundamentalFrequencyHz",
          "harmonicFrequencyHz",
          "frequencyHz",
          "periodS",
        ];

  const spec: StandingWaveScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "standing-wave",
    boundaryKind: "pipe-closed-one",
    lengthM,
    harmonicNumber: effectiveN,
    waveSpeedMs,
    ...(endCorrectionM > 0 ? { endCorrectionM } : {}),
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const lStr = fmtGivenScalar(lengthM, "m");
  const vStr = fmtGivenScalar(waveSpeedMs, "m s⁻¹");
  const eStr = fmtGivenScalar(endCorrectionM, "m");
  const fnStr = fmtGivenScalar(sol.harmonicFrequencyHz, "Hz");

  if (format === "mcq") {
    if (isFirstOvertoneTrap) {
      const stems = [
        `Neglecting end corrections, ${pipeDesc} of length ${lStr} is excited from its fundamental mode up to the very next resonant standing-wave mode (first overtone), as shown. If the speed of sound is ${vStr}, what is this resonant frequency?`,
        `Figure depicts ${pipeDesc} of length ${lStr} resonating in the lowest-frequency overtone above its fundamental mode. Taking the speed of sound as ${vStr} and ignoring end correction, calculate this resonant frequency.`,
        `Sound travels at ${vStr} inside ${pipeDesc} of length ${lStr}. What is the frequency of the second resonant mode (first overtone above the fundamental) supported by this one-end-closed air column?`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const built = buildDistinctMcqOptions(
        sol.harmonicFrequencyHz,
        "Hz",
        [
          {
            value: 2 * sol.fundamentalFrequencyHz,
            rationale:
              "Assumes an even n = 2 harmonic exists in a pipe closed at one end, computing 2f₁ = v / (2L) instead of 3f₁ = 3v / (4L).",
          },
          {
            value: sol.fundamentalFrequencyHz,
            rationale:
              "Calculates the fundamental (first-harmonic) frequency v / (4L) instead of the first overtone 3v / (4L).",
          },
          {
            value: (3 * waveSpeedMs) / (2 * lengthM),
            rationale:
              "Uses the open-both-ends formula 3v / (2L) instead of closed-one-end 3v / (4L).",
          },
        ],
        [
          {
            value: 5 * sol.fundamentalFrequencyHz,
            rationale: "Calculates the n = 5 mode instead of the first overtone n = 3.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "standing-waves-harmonics",
        templateArchetype: "standing-closed-pipe-odd-harmonics",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
          {
            name: "waveSpeedMs",
            value: waveSpeedMs,
            unit: "m s⁻¹",
            source: "stem",
          },
        ],
        questionPlan: {
          targetSummary:
            "Identify odd-only closed-pipe harmonics to compute the first overtone frequency above fundamental",
          distractorStrategy: [
            "assume-even-second-harmonic-exists-on-closed-pipe",
            "stop-at-fundamental-quarter-wave-frequency",
            "use-open-pipe-half-wavelength-denominator",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "harmonicFrequencyHz",
        workedSolution: `A pipe closed at one end supports odd harmonics only (n = 1, 3, 5, ...), so the next resonant mode above the fundamental is n = 3. Thus f₃ = 3v / (4L) = 3(${waveSpeedMs}) / (4 × ${lengthM}) = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Identifies odd harmonic n = 3 and computes f₃ = 3v / (4L) = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (isInverseSpeed) {
      const stems = [
        `In a resonance-tube determination of sound speed, ${pipeDesc} of length ${lStr} (negligible end correction) resonates in its n = ${effectiveN} odd harmonic when driven by a ${fnStr} source. What is the speed of sound in the tube?`,
        `Figure shows ${pipeDesc} of length ${lStr} excited in odd harmonic n = ${effectiveN} at ${fnStr} (end correction negligible). Calculate the speed of sound in the air column.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const built = buildDistinctMcqOptions(
        sol.waveSpeedMs,
        "m s⁻¹",
        [
          {
            value: (2 * lengthM * sol.harmonicFrequencyHz) / effectiveN,
            rationale:
              "Uses open-pipe wavelength 2L / n instead of closed-pipe 4L / n, halving the speed of sound.",
          },
          {
            value:
              (4 * lengthM * sol.harmonicFrequencyHz) / (effectiveN - 1),
            rationale:
              "Substitutes an even harmonic index (n − 1) instead of the odd harmonic n.",
          },
          {
            value: 4 * lengthM * sol.harmonicFrequencyHz,
            rationale:
              "Treats the n-th harmonic frequency as the fundamental mode v = 4Lf.",
          },
        ],
        [
          {
            value: (lengthM * sol.harmonicFrequencyHz) / effectiveN,
            rationale: "Omits the factor of 4 in λ_n = 4L / n.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "standing-waves-harmonics",
        templateArchetype: "standing-closed-pipe-odd-harmonics",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
          { name: "harmonicNumber", value: effectiveN, source: "stem" },
          {
            name: "harmonicFrequencyHz",
            value: sol.harmonicFrequencyHz,
            unit: "Hz",
            source: "stem",
          },
        ],
        questionPlan: {
          targetSummary:
            "Calculate speed of sound from closed-one-end pipe length, odd harmonic index, and resonant frequency",
          distractorStrategy: [
            "use-open-pipe-two-L-wavelength",
            "substitute-even-mode-count-for-odd-harmonic-number",
            "omit-odd-harmonic-divisor",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "waveSpeedMs",
        workedSolution: `For a closed-one-end pipe in odd harmonic n = ${effectiveN}, λ_n = 4L / n = 4(${lengthM}) / ${effectiveN} = ${fmtSig3(sol.wavelengthM)} m. Speed of sound v = f_n λ_n = ${fmtQuantity(sol.waveSpeedMs, "m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses v = 4Lf_n / n to obtain ${fmtQuantity(sol.waveSpeedMs, "m s⁻¹")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const stems = useEndCorrection
      ? [
          `Inside ${pipeDesc} of physical length ${lStr}, the single open end has an antinode end correction of ${eStr} and sound travels at ${vStr}. What is the resonant frequency of the n = ${effectiveN} harmonic?`,
          `Figure shows ${pipeDesc} (length ${lStr}, single open-end correction e = ${eStr}) resonating in odd harmonic n = ${effectiveN} with sound speed ${vStr}. Calculate this resonant frequency.`,
        ]
      : [
          `Sound propagates at ${vStr} in ${pipeDesc} of length ${lStr} (negligible end correction). Determine the resonant frequency when the air column vibrates in odd harmonic n = ${effectiveN}.`,
          `Figure illustrates ${pipeDesc} of length ${lStr} excited in its n = ${effectiveN} odd harmonic mode (speed of sound ${vStr}, end correction negligible). What is the frequency of the sound wave?`,
        ];
    const stem = pickOffset(stems, slotIndex, rng);

    const distractors: RawMcqDistractorCandidate[] = useEndCorrection
      ? [
          {
            value:
              (effectiveN * waveSpeedMs) /
              (4 * (lengthM + 2 * endCorrectionM)),
            rationale:
              "Adds end correction 2e as if both ends were open, rather than L + e for a single open end.",
          },
          {
            value: (effectiveN * waveSpeedMs) / (4 * lengthM),
            rationale:
              "Omits the open-end antinode correction e, using physical length L instead of L + e.",
          },
          {
            value:
              (effectiveN * waveSpeedMs) / (2 * (lengthM + endCorrectionM)),
            rationale:
              "Uses open-pipe denominator 2(L + e) instead of closed-pipe 4(L + e).",
          },
        ]
      : [
          {
            value: ((effectiveN - 1) * waveSpeedMs) / (4 * lengthM),
            rationale:
              "Substitutes the prohibited even harmonic (n − 1) into nv / (4L).",
          },
          {
            value: (effectiveN * waveSpeedMs) / (2 * lengthM),
            rationale:
              "Applies open-both-ends formula nv / (2L) instead of closed-one-end nv / (4L).",
          },
          {
            value: sol.fundamentalFrequencyHz,
            rationale:
              "Computes only the n = 1 fundamental frequency v / (4L).",
          },
        ];

    const built = buildDistinctMcqOptions(
      sol.harmonicFrequencyHz,
      "Hz",
      distractors,
      [
        {
          value: (effectiveN * waveSpeedMs) / sol.effectiveLengthM,
          rationale: "Omits the factor of 4 in λ_n = 4L_eff / n.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "standing-waves-harmonics",
      templateArchetype: "standing-closed-pipe-odd-harmonics",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
        { name: "harmonicNumber", value: effectiveN, source: "stem" },
        {
          name: "waveSpeedMs",
          value: waveSpeedMs,
          unit: "m s⁻¹",
          source: "stem",
        },
        ...(endCorrectionM > 0
          ? [
              {
                name: "endCorrectionM",
                value: endCorrectionM,
                unit: "m",
                source: "stem" as const,
              },
            ]
          : []),
      ],
      questionPlan: {
        targetSummary:
          "Evaluate odd-harmonic frequency of a pipe closed at one end and open at the other",
        distractorStrategy: [
          "double-end-correction-on-single-open-end",
          "use-prohibited-even-harmonic-or-ignore-end-correction",
          "use-open-pipe-half-wave-formula",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "harmonicFrequencyHz",
      workedSolution: `Effective acoustic length for one closed and one open end is L_eff = L + e = ${fmtSig3(sol.effectiveLengthM)} m. For odd harmonic n = ${effectiveN}, f_n = nv / (4L_eff) = (${effectiveN} × ${waveSpeedMs}) / (4 × ${fmtSig3(sol.effectiveLengthM)}) = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Computes f_${effectiveN} = ${effectiveN}v / (4L_eff) = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2
  const stems = useEndCorrection
    ? [
        `In a laboratory resonance experiment, ${pipeDesc} has physical length ${lStr}, with an antinode end correction of ${eStr} at its single open rim. Sound waves travel through the air column at ${vStr}, and the column is excited in odd harmonic n = ${effectiveN}.`,
        `Figure illustrates ${pipeDesc} of physical bore length ${lStr} driven in stationary odd harmonic mode n = ${effectiveN}. The displacement antinode forms ${eStr} outside the open mouth, and sound propagates in the air at ${vStr}.`,
        `During an acoustics practical, ${pipeDesc} of length ${lStr} resonates in its n = ${effectiveN} odd harmonic while sound travels at ${vStr}. Account for an end correction of ${eStr} beyond the single open end.`,
      ]
    : [
        `An acoustic column consists of ${pipeDesc} of length ${lStr} (end correction negligible) filled with air in which sound travels at ${vStr}. The air column resonates in its n = ${effectiveN} odd harmonic mode, as shown.`,
        `Figure depicts ${pipeDesc} of length ${lStr} resonating in odd harmonic n = ${effectiveN}. Take the speed of sound in air to be ${vStr} and neglect any end correction.`,
        `Sound waves of speed ${vStr} establish a stationary n = ${effectiveN} odd-harmonic pattern inside ${pipeDesc} of effective length ${lStr} (assuming zero end correction).`,
      ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Calculate the fundamental (first-harmonic, n = 1) frequency of this closed-end air column.",
      marks: 2,
      targetQuantityKey: "fundamentalFrequencyHz",
      expectedAnswer: fmtQuantity(sol.fundamentalFrequencyHz, "Hz"),
      workingSteps: [
        useEndCorrection
          ? `L_eff = L + e = ${lengthM} + ${endCorrectionM} = ${fmtSig3(sol.effectiveLengthM)} m; f₁ = v / (4L_eff).`
          : "For a pipe closed at one end, λ₁ = 4L so f₁ = v / (4L).",
        `f₁ = ${waveSpeedMs} / (4 × ${fmtSig3(sol.effectiveLengthM)}) = ${fmtQuantity(sol.fundamentalFrequencyHz, "Hz")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Determine the wavelength of the n = ${effectiveN} harmonic standing wave.`,
      marks: 2,
      targetQuantityKey: "wavelengthM",
      expectedAnswer: fmtQuantity(sol.wavelengthM, "m"),
      workingSteps: [
        "Use λ_n = 4L_eff / n.",
        `λ_${effectiveN} = 4 × ${fmtSig3(sol.effectiveLengthM)} / ${effectiveN} = ${fmtQuantity(sol.wavelengthM, "m")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Calculate the resonant frequency of this n = ${effectiveN} harmonic mode.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "harmonicFrequencyHz",
      expectedAnswer: fmtQuantity(sol.harmonicFrequencyHz, "Hz"),
      workingSteps: [
        `f_${effectiveN} = ${effectiveN} × f₁ = ${effectiveN} × ${fmtSig3(sol.fundamentalFrequencyHz)} = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "standing-waves-harmonics",
    templateArchetype: "standing-closed-pipe-odd-harmonics",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      { name: "lengthM", value: lengthM, unit: "m", source: "stem" },
      { name: "harmonicNumber", value: effectiveN, source: "stem" },
      { name: "waveSpeedMs", value: waveSpeedMs, unit: "m s⁻¹", source: "stem" },
      ...(endCorrectionM > 0
        ? [
            {
              name: "endCorrectionM",
              value: endCorrectionM,
              unit: "m",
              source: "stem" as const,
            },
          ]
        : []),
    ],
    questionPlan: {
      targetSummary:
        "Analyse fundamental frequency, odd-harmonic wavelength, and overtone frequency in a closed-one-end pipe",
      subpartStrategy: [
        "part (a): target fundamentalFrequencyHz",
        "part (b): target wavelengthM",
        "part (c): target harmonicFrequencyHz",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) L_eff = ${fmtSig3(sol.effectiveLengthM)} m, giving f₁ = v / (4L_eff) = ${fmtQuantity(sol.fundamentalFrequencyHz, "Hz")}. (b) λ_${effectiveN} = 4L_eff / ${effectiveN} = ${fmtQuantity(sol.wavelengthM, "m")}. (c) f_${effectiveN} = ${effectiveN}f₁ = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Applies quarter-wave fundamental relation f₁ = v / (4L_eff).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains f₁ = ${fmtQuantity(sol.fundamentalFrequencyHz, "Hz")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Uses λ_n = 4L_eff / n.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains λ = ${fmtQuantity(sol.wavelengthM, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Multiplies fundamental frequency by odd harmonic index ${effectiveN} (or uses v / λ).`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains f = ${fmtQuantity(sol.harmonicFrequencyHz, "Hz")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

function buildDoubleSlitFringeSpacing(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const rigDesc = pickOffset(DOUBLE_SLIT_SETUPS, slotIndex, rng);
  const syllabi = resolveWavesSyllabiTags(
    "double-slit-interference",
    format,
    "all-core",
    slotIndex,
  );
  const wavelengthNm = pick(rng, [
    405, 445, 473, 488, 514, 532, 589, 612, 633, 650, 670,
  ]);
  const wavelengthM = Number((wavelengthNm * 1e-9).toPrecision(6));
  const slitSeparationM = pick(rng, [
    0.16e-3, 0.2e-3, 0.24e-3, 0.3e-3, 0.36e-3, 0.45e-3, 0.5e-3, 0.6e-3,
  ]);
  const screenDistanceM = pick(rng, [1.2, 1.5, 1.8, 2.1, 2.4, 2.8, 3.2, 3.6]);
  const orderN = pick(rng, [2, 3]);

  const isInverseWl = format === "mcq" && slotIndex % 2 === 1;
  const hiddenQuantities = isInverseWl
    ? [
        "wavelengthM",
        "nthBrightPositionM",
        "nthBrightExactPositionM",
        "firstDarkPositionM",
        "nthOrderAngleRad",
        "nthOrderAngleDegrees",
        "pathDifferenceM",
        "maxOrder",
        "orderN",
      ]
    : [
        "fringeSpacingM",
        "nthBrightPositionM",
        "nthBrightExactPositionM",
        "firstDarkPositionM",
        "nthOrderAngleRad",
        "nthOrderAngleDegrees",
        "pathDifferenceM",
        "maxOrder",
        ...(format === "mcq" ? ["orderN"] : []),
      ];

  const spec: DoubleSlitScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "double-slit",
    wavelengthM,
    slitSeparationM,
    screenDistanceM,
    orderN,
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const wlStr = fmtNm(wavelengthM);
  const dStr = fmtMm(slitSeparationM);
  const bigDStr = fmtGivenScalar(screenDistanceM, "m");
  const spacingMmStr = `${fmtSig3(sol.fringeSpacingM * 1e3)} mm`;

  if (format === "mcq") {
    if (!isInverseWl) {
      // Note: Always spell out "slit separation" and "fringe spacing" in prose!
      const stems = [
        `In an optics investigation with ${rigDesc}, light of wavelength ${wlStr} passes through two parallel slits of slit separation ${dStr} onto a screen at distance ${bigDStr}. What is the fringe spacing between adjacent bright fringes on the screen?`,
        `Figure shows ${rigDesc} of wavelength ${wlStr} illuminating slits separated by a slit separation of ${dStr}. An observation screen is placed ${bigDStr} away. Calculate the centre-to-centre fringe spacing of the interference maxima.`,
        `Coherent monochromatic light of wavelength ${wlStr} from ${rigDesc} strikes a double slit with slit separation ${dStr} and forms fringes on a screen ${bigDStr} behind the barrier. Determine the bright-to-bright fringe spacing.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const built = buildDistinctMcqOptions(
        sol.fringeSpacingM,
        "m",
        [
          {
            value: 0.5 * sol.fringeSpacingM,
            rationale:
              "Calculates the distance from the central bright fringe to the first dark minimum (½ λD / d) instead of bright fringe spacing.",
          },
          {
            value: 2 * sol.fringeSpacingM,
            rationale:
              "Includes an erroneous factor of 2, confusing double-slit fringe spacing with single-slit central maximum width.",
          },
          {
            value: (wavelengthM * slitSeparationM) / screenDistanceM,
            rationale:
              "Multiplies by slit separation and divides by screen distance (λd / D) instead of λD / d.",
          },
        ],
        [
          {
            value: sol.fringeSpacingM * 1e3,
            rationale:
              "Forgets to convert slit separation from millimetres to metres, leaving a 10³ unit error.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "double-slit-interference",
        templateArchetype: "double-slit-fringe-spacing-wavelength",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
          {
            name: "slitSeparationM",
            value: slitSeparationM,
            unit: "m",
            source: "stem",
          },
          {
            name: "screenDistanceM",
            value: screenDistanceM,
            unit: "m",
            source: "stem",
          },
        ],
        questionPlan: {
          targetSummary:
            "Calculate Young double-slit adjacent bright fringe spacing from wavelength, slit separation, and screen distance",
          distractorStrategy: [
            "compute-half-fringe-distance-to-first-minimum",
            "confuse-with-single-slit-double-width-factor",
            "invert-slit-separation-and-screen-distance",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "fringeSpacingM",
        workedSolution: `Converting to SI units: λ = ${fmtQuantity(wavelengthM, "m")} and slit separation = ${fmtQuantity(slitSeparationM, "m")}. Fringe spacing = λD / (slit separation) = (${fmtSig3(wavelengthM)} × ${screenDistanceM}) / ${fmtSig3(slitSeparationM)} = ${fmtQuantity(sol.fringeSpacingM, "m")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses fringe spacing = λD / (slit separation) to obtain ${fmtQuantity(sol.fringeSpacingM, "m")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Inverse MCQ: given slit separation, screen distance, and fringe spacing -> find wavelengthM
    const stems = [
      `Using ${rigDesc} with a slit separation of ${dStr} and a slit-to-screen distance of ${bigDStr}, the measured fringe spacing between adjacent bright fringes is ${spacingMmStr}. What is the wavelength of the light?`,
      `In a Young's double-slit calibration of ${rigDesc}, two slits of slit separation ${dStr} produce interference fringes of fringe spacing ${spacingMmStr} on a screen ${bigDStr} away. Determine the laser wavelength.`,
      `Figure illustrates ${rigDesc} illuminating slits with slit separation ${dStr} at distance ${bigDStr} from a screen where the adjacent bright fringe spacing is ${spacingMmStr}. Calculate the wavelength of the coherent beam.`,
    ];
    const stem = pickOffset(stems, slotIndex, rng);
    const built = buildDistinctMcqOptions(
      wavelengthM,
      "m",
      [
        {
          value: (sol.fringeSpacingM * screenDistanceM) / slitSeparationM,
          rationale:
            "Multiplies fringe spacing by screen distance D and divides by slit separation instead of multiplying by slit separation / D.",
        },
        {
          value: 0.5 * wavelengthM,
          rationale:
            "Introduces a spurious factor of ½ from single-slit central-width formulas.",
        },
        {
          value: 2 * wavelengthM,
          rationale:
            "Treats bright-to-bright fringe spacing as half-wavelength path difference.",
        },
      ],
      [
        {
          value: wavelengthM * 1e3,
          rationale:
            "Omits one millimetre-to-metre conversion factor of 10⁻³.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "double-slit-interference",
      templateArchetype: "double-slit-fringe-spacing-wavelength",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        {
          name: "slitSeparationM",
          value: slitSeparationM,
          unit: "m",
          source: "stem",
        },
        {
          name: "screenDistanceM",
          value: screenDistanceM,
          unit: "m",
          source: "stem",
        },
        {
          name: "fringeSpacingM",
          value: sol.fringeSpacingM,
          unit: "m",
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Determine optical wavelength from Young double-slit fringe spacing, slit separation, and screen distance",
        distractorStrategy: [
          "invert-screen-distance-and-slit-separation-ratio",
          "insert-spurious-factor-of-one-half",
          "treat-fringe-spacing-as-half-wavelength-step",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "wavelengthM",
      workedSolution: `Rearranging fringe spacing Δy = λD / d gives λ = Δy × d / D = (${fmtSig3(sol.fringeSpacingM)} × ${fmtSig3(slitSeparationM)}) / ${screenDistanceM} = ${fmtQuantity(wavelengthM, "m")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Rearranges double-slit relation to obtain λ = ${fmtQuantity(wavelengthM, "m")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2
  const stems = [
    `Monochromatic light of wavelength ${wlStr} from ${rigDesc} is incident normally on two narrow slits whose centre-to-centre slit separation is ${dStr}. Interference fringes are observed on a flat screen placed ${bigDStr} from the slits.`,
    `In a darkroom optics experiment, ${rigDesc} emits coherent light of wavelength ${wlStr} onto a double slit of slit separation ${dStr}, with an observation screen positioned ${bigDStr} away.`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Calculate the fringe spacing between adjacent bright fringes on the screen.",
      marks: 2,
      targetQuantityKey: "fringeSpacingM",
      expectedAnswer: fmtQuantity(sol.fringeSpacingM, "m"),
      workingSteps: [
        "Use fringe spacing = λD / (slit separation).",
        `Δy = (${fmtSig3(wavelengthM)} × ${screenDistanceM}) / ${fmtSig3(slitSeparationM)} = ${fmtQuantity(sol.fringeSpacingM, "m")}.`,
      ],
    },
    {
      partId: "b",
      prompt:
        "Determine the distance on the screen from the central bright maximum to the centre of the first dark fringe.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "firstDarkPositionM",
      expectedAnswer: fmtQuantity(sol.firstDarkPositionM, "m"),
      workingSteps: [
        "First destructive minimum occurs halfway between the central and first-order bright maxima: y_dark,1 = 0.5 × fringe spacing.",
        `y_dark,1 = 0.5 × ${fmtSig3(sol.fringeSpacingM)} = ${fmtQuantity(sol.firstDarkPositionM, "m")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Calculate the geometric path difference between waves arriving from the two slits at the order n = ${orderN} bright fringe.`,
      marks: 2,
      targetQuantityKey: "pathDifferenceM",
      expectedAnswer: fmtQuantity(sol.pathDifferenceM, "m"),
      workingSteps: [
        "Constructive interference at order n requires path difference Δℓ = nλ.",
        `Δℓ = ${orderN} × ${fmtSig3(wavelengthM)} = ${fmtQuantity(sol.pathDifferenceM, "m")}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "double-slit-interference",
    templateArchetype: "double-slit-fringe-spacing-wavelength",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
      {
        name: "slitSeparationM",
        value: slitSeparationM,
        unit: "m",
        source: "stem",
      },
      {
        name: "screenDistanceM",
        value: screenDistanceM,
        unit: "m",
        source: "stem",
      },
      { name: "orderN", value: orderN, source: "stem" },
    ],
    questionPlan: {
      targetSummary:
        "Compute Young bright fringe spacing, first dark minimum position, and n-th order constructive path difference",
      subpartStrategy: [
        "part (a): target fringeSpacingM",
        "part (b): target firstDarkPositionM",
        "part (c): target pathDifferenceM",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) Fringe spacing = λD / d = (${fmtSig3(wavelengthM)} × ${screenDistanceM}) / ${fmtSig3(slitSeparationM)} = ${fmtQuantity(sol.fringeSpacingM, "m")}. (b) First dark fringe distance = ½ × ${fmtSig3(sol.fringeSpacingM)} = ${fmtQuantity(sol.firstDarkPositionM, "m")}. (c) At order n = ${orderN}, path difference = nλ = ${orderN} × ${fmtSig3(wavelengthM)} = ${fmtQuantity(sol.pathDifferenceM, "m")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Converts units and substitutes into λD / (slit separation).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains fringe spacing = ${fmtQuantity(sol.fringeSpacingM, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Takes half of the bright-fringe spacing.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${fmtQuantity(sol.firstDarkPositionM, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Applies constructive path difference Δℓ = ${orderN}λ.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains ${fmtQuantity(sol.pathDifferenceM, "m")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

function buildDoubleSlitOffAxisOrders(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const rigDesc = pickOffset(DOUBLE_SLIT_SETUPS, slotIndex + 4, rng);
  const syllabi = resolveWavesSyllabiTags(
    "double-slit-interference",
    format,
    "all-core",
    slotIndex,
  );
  const wavelengthNm = pick(rng, [420, 460, 488, 532, 560, 589, 633, 660]);
  const wavelengthM = Number((wavelengthNm * 1e-9).toPrecision(6));
  const slitSeparationM = pick(rng, [
    0.18e-3, 0.22e-3, 0.28e-3, 0.35e-3, 0.42e-3, 0.55e-3,
  ]);
  const screenDistanceM = pick(rng, [1.4, 1.75, 2.0, 2.5, 3.0, 3.4]);
  const orderN = pick(rng, [3, 4, 5]);

  const isInverseSep = format === "mcq" && slotIndex % 2 === 1;
  const hiddenQuantities = isInverseSep
    ? [
        "slitSeparationM",
        "fringeSpacingM",
        "nthBrightExactPositionM",
        "firstDarkPositionM",
        "nthOrderAngleRad",
        "nthOrderAngleDegrees",
        "pathDifferenceM",
        "maxOrder",
      ]
    : [
        "fringeSpacingM",
        "nthBrightPositionM",
        "nthBrightExactPositionM",
        "firstDarkPositionM",
        "nthOrderAngleRad",
        "nthOrderAngleDegrees",
        "pathDifferenceM",
        "maxOrder",
      ];

  const spec: DoubleSlitScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "double-slit",
    wavelengthM,
    slitSeparationM,
    screenDistanceM,
    orderN,
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const wlStr = fmtNm(wavelengthM);
  const dStr = fmtMm(slitSeparationM);
  const bigDStr = fmtGivenScalar(screenDistanceM, "m");
  const ynMmStr = `${fmtSig3(sol.nthBrightPositionM * 1e3)} mm`;

  if (format === "mcq") {
    if (!isInverseSep) {
      const stems = [
        `Coherent light of wavelength ${wlStr} from ${rigDesc} passes through slits of slit separation ${dStr} onto a screen ${bigDStr} away. What is the linear distance on the screen from the central bright fringe (n = 0) to the n = ${orderN} bright fringe?`,
        `On an optical bench, ${rigDesc} (wavelength ${wlStr}) illuminates a double slit of slit separation ${dStr}. Calculate the displacement from the central maximum to the ${orderN}th-order bright maximum on a screen ${bigDStr} behind the slits.`,
        `Figure depicts ${rigDesc} of wavelength ${wlStr} incident on slits with slit separation ${dStr} and screen distance ${bigDStr}. How far from the central maximum does the order n = ${orderN} bright fringe appear?`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const built = buildDistinctMcqOptions(
        sol.nthBrightPositionM,
        "m",
        [
          {
            value: sol.fringeSpacingM,
            rationale:
              "Calculates single adjacent fringe spacing λD / d instead of multiplying by order n.",
          },
          {
            value: (orderN - 0.5) * sol.fringeSpacingM,
            rationale:
              "Applies destructive half-integer factor (n − ½) instead of constructive integer order n.",
          },
          {
            value: (orderN + 1) * sol.fringeSpacingM,
            rationale:
              "Fencepost error: multiplies fringe spacing by (n + 1) fringes instead of n intervals from n = 0.",
          },
        ],
        [
          {
            value: 2 * sol.nthBrightPositionM,
            rationale:
              "Computes full span between −n and +n orders instead of distance from n = 0 to +n.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "double-slit-interference",
        templateArchetype: "double-slit-off-axis-orders-path-diff",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
          {
            name: "slitSeparationM",
            value: slitSeparationM,
            unit: "m",
            source: "stem",
          },
          {
            name: "screenDistanceM",
            value: screenDistanceM,
            unit: "m",
            source: "stem",
          },
          { name: "orderN", value: orderN, source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Find off-axis linear position of the n-th bright fringe in Young double-slit interference",
          distractorStrategy: [
            "compute-single-fringe-spacing-omitting-order-n",
            "use-half-integer-dark-fringe-condition",
            "fencepost-count-n-plus-one-fringe-intervals",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "nthBrightPositionM",
        workedSolution: `Single fringe spacing = λD / d = ${fmtSig3(sol.fringeSpacingM)} m. Distance from n = 0 to the n = ${orderN} bright fringe is y_${orderN} = ${orderN} × λD / d = ${fmtQuantity(sol.nthBrightPositionM, "m")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes y_${orderN} = nλD / d = ${fmtQuantity(sol.nthBrightPositionM, "m")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Inverse MCQ: find slitSeparationM from distance y_n to n-th bright fringe
    const stems = [
      `When ${rigDesc} of wavelength ${wlStr} illuminates two parallel slits at distance ${bigDStr} from a viewing screen, the distance from the central bright maximum to the n = ${orderN} bright fringe is ${ynMmStr}. What is the slit separation?`,
      `To measure the slit separation of a double-slit slide using ${rigDesc} (λ = ${wlStr}, screen distance ${bigDStr}), a student measures ${ynMmStr} from the central fringe to the ${orderN}th-order bright fringe. Calculate the slit separation.`,
    ];
    const stem = pickOffset(stems, slotIndex, rng);
    const built = buildDistinctMcqOptions(
      slitSeparationM,
      "m",
      [
        {
          value: slitSeparationM / orderN,
          rationale:
            "Treats the n-th bright fringe displacement as a single fringe spacing, omitting the factor of n.",
        },
        {
          value: ((orderN + 1) / orderN) * slitSeparationM,
          rationale:
            "Divides total span by (n + 1) instead of n fringe intervals between n = 0 and order n.",
        },
        {
          value: ((orderN - 0.5) / orderN) * slitSeparationM,
          rationale: "Applies dark-fringe factor (n − ½) instead of integer n.",
        },
      ],
      [
        {
          value: 2 * slitSeparationM,
          rationale: "Doubles the order count across symmetric fringes.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "double-slit-interference",
      templateArchetype: "double-slit-off-axis-orders-path-diff",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
        {
          name: "screenDistanceM",
          value: screenDistanceM,
          unit: "m",
          source: "stem",
        },
        { name: "orderN", value: orderN, source: "stem" },
        {
          name: "nthBrightPositionM",
          value: sol.nthBrightPositionM,
          unit: "m",
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Determine double-slit separation from measured off-axis n-th order bright fringe distance",
        distractorStrategy: [
          "omit-fringe-order-multiplier",
          "count-n-plus-one-spaces-from-central-fringe",
          "use-half-integer-minimum-formula",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "slitSeparationM",
      workedSolution: `Since y_n = nλD / d, slit separation d = nλD / y_n = (${orderN} × ${fmtSig3(wavelengthM)} × ${screenDistanceM}) / ${fmtSig3(sol.nthBrightPositionM)} = ${fmtQuantity(slitSeparationM, "m")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates d = nλD / y_n = ${fmtQuantity(slitSeparationM, "m")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2
  const stems = [
    `Using ${rigDesc}, coherent light of wavelength ${wlStr} illuminates two narrow parallel slits of slit separation ${dStr}. An interference pattern is formed on a screen ${bigDStr} away, and a detector is positioned at the order n = ${orderN} bright maximum.`,
    `In an optics bench investigation with ${rigDesc}, waves of wavelength ${wlStr} pass through a double slit of slit separation ${dStr} onto a screen ${bigDStr} behind the barrier. A sensor records the n = ${orderN} constructive maximum.`,
    `Figure shows ${rigDesc} directing monochromatic radiation of wavelength ${wlStr} at two slits with slit separation ${dStr}. Across a screen at distance ${bigDStr}, an observer analyses the n = ${orderN} bright interference fringe.`,
    `Coherent plane waves of wavelength ${wlStr} from ${rigDesc} strike a pair of slits whose slit separation is ${dStr}, producing Young fringes on a screen ${bigDStr} downstream; consider the order n = ${orderN} bright fringe.`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: `Calculate the path difference between waves from S₁ and S₂ arriving at the n = ${orderN} bright fringe.`,
      marks: 2,
      targetQuantityKey: "pathDifferenceM",
      expectedAnswer: fmtQuantity(sol.pathDifferenceM, "m"),
      workingSteps: [
        "For constructive interference at order n, Δℓ = nλ.",
        `Δℓ = ${orderN} × ${fmtSig3(wavelengthM)} = ${fmtQuantity(sol.pathDifferenceM, "m")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Calculate the angular deflection θ_${orderN} (in degrees) of the n = ${orderN} bright fringe from the central axis.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "nthOrderAngleDegrees",
      expectedAnswer: fmtQuantity(sol.nthOrderAngleDegrees, "°"),
      workingSteps: [
        "Use d sin θ_n = nλ.",
        `θ_${orderN} = arcsin(${fmtSig3(sol.pathDifferenceM)} / ${fmtSig3(slitSeparationM)}) = ${fmtQuantity(sol.nthOrderAngleDegrees, "°")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Determine the linear distance from the central bright fringe to the n = ${orderN} bright fringe on the screen.`,
      marks: 2,
      targetQuantityKey: "nthBrightPositionM",
      expectedAnswer: fmtQuantity(sol.nthBrightPositionM, "m"),
      workingSteps: [
        "Apply y_n = nλD / (slit separation).",
        `y_${orderN} = (${orderN} × ${fmtSig3(wavelengthM)} × ${screenDistanceM}) / ${fmtSig3(slitSeparationM)} = ${fmtQuantity(sol.nthBrightPositionM, "m")}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "double-slit-interference",
    templateArchetype: "double-slit-off-axis-orders-path-diff",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
      {
        name: "slitSeparationM",
        value: slitSeparationM,
        unit: "m",
        source: "stem",
      },
      {
        name: "screenDistanceM",
        value: screenDistanceM,
        unit: "m",
        source: "stem",
      },
      { name: "orderN", value: orderN, source: "stem" },
    ],
    questionPlan: {
      targetSummary:
        "Evaluate constructive path difference, angular deflection, and screen displacement for an off-axis Young fringe",
      subpartStrategy: [
        "part (a): target pathDifferenceM",
        "part (b): target nthOrderAngleDegrees",
        "part (c): target nthBrightPositionM",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) Δℓ = nλ = ${orderN} × ${fmtSig3(wavelengthM)} = ${fmtQuantity(sol.pathDifferenceM, "m")}. (b) θ_${orderN} = arcsin(nλ / d) = ${fmtQuantity(sol.nthOrderAngleDegrees, "°")}. (c) y_${orderN} = nλD / d = ${fmtQuantity(sol.nthBrightPositionM, "m")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Applies Δℓ = nλ.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains ${fmtQuantity(sol.pathDifferenceM, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Uses sin θ_n = nλ / d.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${fmtQuantity(sol.nthOrderAngleDegrees, "°")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Uses y_n = nλD / d.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains ${fmtQuantity(sol.nthBrightPositionM, "m")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

function buildDoubleSlitEnvelopeMissingOrders(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const rigDesc = pickOffset(DOUBLE_SLIT_SETUPS, slotIndex + 7, rng);
  // Single-slit envelope modulation of double-slit fringes is strictly IB HL (C.3)
  const syllabi = resolveWavesSyllabiTags(
    "double-slit-interference",
    format,
    "ib-hl-only",
    slotIndex,
  );

  const wavelengthNm = pick(rng, [450, 488, 514, 532, 589, 633, 650]);
  const wavelengthM = Number((wavelengthNm * 1e-9).toPrecision(6));
  const missingRatio = pick(rng, [3, 4, 5, 6]);
  const slitWidthM = pick(rng, [0.05e-3, 0.06e-3, 0.075e-3, 0.08e-3, 0.09e-3]);
  const slitSeparationM = Number((missingRatio * slitWidthM).toPrecision(6));
  const screenDistanceM = pick(rng, [1.4, 1.8, 2.2, 2.6, 3.2]);

  const isInverseWidth = format === "mcq" && slotIndex % 3 === 1;
  const askMissingOrder = format === "mcq" && slotIndex % 3 === 2;

  const hiddenQuantities = isInverseWidth
    ? [
        "slitWidthM",
        "firstMissingOrder",
        "fringeSpacingM",
        "centralEnvelopeHalfWidthM",
        "centralEnvelopeFullWidthM",
        "nthBrightPositionM",
        "nthBrightExactPositionM",
        "firstDarkPositionM",
        "nthOrderAngleRad",
        "nthOrderAngleDegrees",
        "pathDifferenceM",
        "maxOrder",
        "orderN",
      ]
    : [
        "firstMissingOrder",
        "fringeSpacingM",
        "centralEnvelopeHalfWidthM",
        "centralEnvelopeFullWidthM",
        "nthBrightPositionM",
        "nthBrightExactPositionM",
        "firstDarkPositionM",
        "nthOrderAngleRad",
        "nthOrderAngleDegrees",
        "pathDifferenceM",
        "maxOrder",
        "orderN",
      ];

  const spec: DoubleSlitScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "double-slit",
    wavelengthM,
    slitSeparationM,
    screenDistanceM,
    slitWidthM,
    orderN: 1,
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const wlStr = fmtNm(wavelengthM);
  const dStr = fmtMm(slitSeparationM);
  const bStr = fmtMm(slitWidthM);
  const bigDStr = fmtGivenScalar(screenDistanceM, "m");

  if (format === "mcq") {
    if (isInverseWidth) {
      const stems = [
        `In ${rigDesc} (wavelength ${wlStr}, screen distance ${bigDStr}), two slits have centre-to-centre slit separation ${dStr}. Single-slit diffraction modulates the pattern so that the n = ${missingRatio} interference order is the lowest positive missing order. What is the width b of each individual slit?`,
        `Coherent light of wavelength ${wlStr} from ${rigDesc} strikes a double slit of slit separation ${dStr} placed ${bigDStr} from a screen. If the first diffraction-envelope minimum suppresses the n = ${missingRatio} interference maximum, determine each slit's width b.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const built = buildDistinctMcqOptions(
        slitWidthM,
        "m",
        [
          {
            value: slitSeparationM / (missingRatio + 1),
            rationale:
              "Divides slit separation by (n + 1) instead of missing order n = d / b.",
          },
          {
            value: (2 * slitSeparationM) / missingRatio,
            rationale:
              "Includes an erroneous factor of 2 from the full angular width of the central envelope.",
          },
          {
            value: slitSeparationM / (missingRatio - 1),
            rationale:
              "Uses the highest visible order inside the central envelope (n − 1) instead of the missing order n.",
          },
        ],
        [
          {
            value: 0.5 * slitWidthM,
            rationale: "Halves the aperture width b.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "double-slit-interference",
        templateArchetype: "double-slit-envelope-missing-orders",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: hiddenQuantities.filter((k) => k !== "firstMissingOrder"),
        requiredGivens: [
          { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
          {
            name: "slitSeparationM",
            value: slitSeparationM,
            unit: "m",
            source: "stem",
          },
          {
            name: "screenDistanceM",
            value: screenDistanceM,
            unit: "m",
            source: "stem",
          },
          { name: "firstMissingOrder", value: missingRatio, source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Determine individual slit width b from double-slit separation d and first missing interference order",
          distractorStrategy: [
            "divide-by-n-plus-one-orders",
            "insert-factor-of-two-from-central-envelope-width",
            "use-highest-unmissing-order-n-minus-one",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "slitWidthM",
        workedSolution: `The first single-slit minimum occurs at θ = λ / b while the n-th double-slit maximum is at θ = nλ / d. Coincidence at n = ${missingRatio} gives b = d / ${missingRatio} = ${fmtSig3(slitSeparationM)} / ${missingRatio} = ${fmtQuantity(slitWidthM, "m")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Equates λ / b = nλ / d to obtain b = d / ${missingRatio} = ${fmtQuantity(slitWidthM, "m")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (askMissingOrder) {
      const stems = [
        `Using ${rigDesc} of wavelength ${wlStr} at screen distance ${bigDStr}, two parallel slits each of individual slit width ${bStr} are separated by centre-to-centre slit separation ${dStr}. Which positive interference order n is the first missing order due to single-slit diffraction?`,
        `Figure shows the modulated double-slit intensity profile produced by ${rigDesc} (λ = ${wlStr}, screen distance ${bigDStr}) for slits of width ${bStr} and slit separation ${dStr}. Identify the lowest positive missing order n.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const built = buildDistinctMcqOptions(
        missingRatio,
        "",
        [
          {
            value: missingRatio - 1,
            rationale:
              "Selects the last bright interference order visible inside one side of the central envelope (d/b − 1) instead of the missing order d/b.",
          },
          {
            value: 2 * missingRatio - 1,
            rationale:
              "Counts the total number of bright fringes inside the central diffraction envelope (2d/b − 1) instead of the missing order index.",
          },
          {
            value: 2 * missingRatio,
            rationale:
              "Doubles d / b by using full angular width 2λ / b instead of first-minimum angle λ / b.",
          },
        ],
        [
          {
            value: missingRatio + 1,
            rationale: "Adds 1 to the ratio d / b.",
          },
        ],
        true,
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "double-slit-interference",
        templateArchetype: "double-slit-envelope-missing-orders",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
          {
            name: "slitSeparationM",
            value: slitSeparationM,
            unit: "m",
            source: "stem",
          },
          { name: "slitWidthM", value: slitWidthM, unit: "m", source: "stem" },
          {
            name: "screenDistanceM",
            value: screenDistanceM,
            unit: "m",
            source: "stem",
          },
        ],
        questionPlan: {
          targetSummary:
            "Find the lowest positive missing interference order in a finite-width double-slit diffraction pattern",
          distractorStrategy: [
            "report-highest-visible-order-inside-central-lobe",
            "count-total-bright-fringes-in-central-envelope",
            "double-ratio-using-full-central-width",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "firstMissingOrder",
        workedSolution: `Interference maxima satisfy sin θ = nλ / d and the first single-slit minimum satisfies sin θ = λ / b. Dividing gives n = d / b = ${fmtSig3(slitSeparationM)} / ${fmtSig3(slitWidthM)} = ${missingRatio}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes n = d / b = ${missingRatio} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Forward MCQ: centralEnvelopeFullWidthM (2λD / b)
    const envFull = sol.centralEnvelopeFullWidthM!;
    const stems = [
      `Light of wavelength ${wlStr} from ${rigDesc} illuminates a double slit of slit separation ${dStr} in which each slit has finite width ${bStr}. On a screen ${bigDStr} away, what is the full linear width of the central single-slit diffraction envelope?`,
      `Figure shows double-slit fringes from ${rigDesc} (λ = ${wlStr}) modulated by finite slit width ${bStr} (slit separation ${dStr}, screen distance ${bigDStr}). Calculate the distance between the two first-order diffraction-envelope minima on either side of the centre.`,
    ];
    const stem = pickOffset(stems, slotIndex, rng);
    const built = buildDistinctMcqOptions(
      envFull,
      "m",
      [
        {
          value: sol.centralEnvelopeHalfWidthM!,
          rationale:
            "Calculates the half-width λD / b from the centre to one minimum instead of the full width 2λD / b.",
        },
        {
          value: 2 * sol.fringeSpacingM,
          rationale:
            "Substitutes slit separation d in place of individual slit width b, computing 2λD / d.",
        },
        {
          value: sol.fringeSpacingM,
          rationale:
            "Computes the adjacent interference fringe spacing λD / d instead of the diffraction envelope width 2λD / b.",
        },
      ],
      [
        {
          value: 2 * envFull,
          rationale: "Multiplies by 4 instead of 2 when finding full central width.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "double-slit-interference",
      templateArchetype: "double-slit-envelope-missing-orders",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
        {
          name: "slitSeparationM",
          value: slitSeparationM,
          unit: "m",
          source: "stem",
        },
        { name: "slitWidthM", value: slitWidthM, unit: "m", source: "stem" },
        {
          name: "screenDistanceM",
          value: screenDistanceM,
          unit: "m",
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Compute full linear width of the central single-slit diffraction envelope in a finite-slit Young experiment",
        distractorStrategy: [
          "omit-factor-of-two-reporting-half-width",
          "substitute-slit-separation-instead-of-slit-width",
          "compute-interference-fringe-spacing",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "centralEnvelopeFullWidthM",
      workedSolution: `The first single-slit diffraction minima lie at θ = ±λ / b, so the full width of the central diffraction envelope on the screen is w_env = 2λD / b = (2 × ${fmtSig3(wavelengthM)} × ${screenDistanceM}) / ${fmtSig3(slitWidthM)} = ${fmtQuantity(envFull, "m")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Uses w_env = 2λD / b to obtain ${fmtQuantity(envFull, "m")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2
  const envFull = sol.centralEnvelopeFullWidthM!;
  const stems = [
    `Monochromatic light of wavelength ${wlStr} from ${rigDesc} passes normally through two parallel slits of centre-to-centre slit separation ${dStr}, where each slit has finite width ${bStr}. The modulated interference pattern is projected onto a screen ${bigDStr} away.`,
    `In a diffraction-modulated Young experiment using ${rigDesc}, coherent waves of wavelength ${wlStr} illuminate two slits of individual width ${bStr} and centre-to-centre slit separation ${dStr}, forming fringes on a screen at distance ${bigDStr}.`,
    `Figure depicts ${rigDesc} (wavelength ${wlStr}) illuminating a double-slit mask whose apertures each have width ${bStr} and slit separation ${dStr}, with an observation screen placed ${bigDStr} behind the mask.`,
    `A parallel beam of wavelength ${wlStr} from ${rigDesc} strikes two slits of finite aperture width ${bStr} and slit separation ${dStr}; the resulting single-slit-modulated interference fringes are recorded ${bigDStr} downstream.`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Calculate the fringe spacing between adjacent double-slit interference maxima near the centre of the pattern.",
      marks: 2,
      targetQuantityKey: "fringeSpacingM",
      expectedAnswer: fmtQuantity(sol.fringeSpacingM, "m"),
      workingSteps: [
        "Use Δy = λD / d.",
        `Δy = (${fmtSig3(wavelengthM)} × ${screenDistanceM}) / ${fmtSig3(slitSeparationM)} = ${fmtQuantity(sol.fringeSpacingM, "m")}.`,
      ],
    },
    {
      partId: "b",
      prompt:
        "Calculate the full width of the central single-slit diffraction envelope on the screen.",
      marks: 2,
      targetQuantityKey: "centralEnvelopeFullWidthM",
      expectedAnswer: fmtQuantity(envFull, "m"),
      workingSteps: [
        "Apply w_env = 2λD / b.",
        `w_env = (2 × ${fmtSig3(wavelengthM)} × ${screenDistanceM}) / ${fmtSig3(slitWidthM)} = ${fmtQuantity(envFull, "m")}.`,
      ],
    },
    {
      partId: "c",
      prompt:
        "Determine the lowest positive interference order n that is missing due to coincidence with a single-slit diffraction minimum.",
      marks: 2,
      targetQuantityKey: "firstMissingOrder",
      expectedAnswer: String(missingRatio),
      workingSteps: [
        "Equate nλ / d = λ / b => n = d / b.",
        `n = ${fmtSig3(slitSeparationM)} / ${fmtSig3(slitWidthM)} = ${missingRatio}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "double-slit-interference",
    templateArchetype: "double-slit-envelope-missing-orders",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
      {
        name: "slitSeparationM",
        value: slitSeparationM,
        unit: "m",
        source: "stem",
      },
      { name: "slitWidthM", value: slitWidthM, unit: "m", source: "stem" },
      {
        name: "screenDistanceM",
        value: screenDistanceM,
        unit: "m",
        source: "stem",
      },
    ],
    questionPlan: {
      targetSummary:
        "Analyse double-slit fringe spacing alongside single-slit diffraction envelope width and first missing order",
      subpartStrategy: [
        "part (a): target fringeSpacingM",
        "part (b): target centralEnvelopeFullWidthM",
        "part (c): target firstMissingOrder",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) Interference fringe spacing Δy = λD / d = ${fmtQuantity(sol.fringeSpacingM, "m")}. (b) Central envelope full width w_env = 2λD / b = ${fmtQuantity(envFull, "m")}. (c) First missing order n = d / b = ${missingRatio}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Uses λD / d with slit separation d.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains ${fmtQuantity(sol.fringeSpacingM, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Uses 2λD / b with individual slit width b.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${fmtQuantity(envFull, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Equates interference maximum angle to first diffraction minimum.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains n = ${missingRatio}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

function buildGratingLinesPerMmAngle(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const gratingDesc = pickOffset(GRATING_SETUPS, slotIndex, rng);
  // Diffraction gratings: IB HL (never SL), A-Level Y12/Y13, NCUK IFY
  const syllabi = resolveWavesSyllabiTags(
    "single-slit-diffraction-gratings",
    format,
    "hl-alevel-ncuk",
    slotIndex,
  );

  const linesPerMm = pick(rng, [200, 250, 300, 400, 500, 600]);
  const slitSpacingM = Number((1e-3 / linesPerMm).toPrecision(12));
  const wavelengthNm = pick(rng, [430, 460, 488, 514, 532, 560, 589, 633, 650]);
  const wavelengthM = Number((wavelengthNm * 1e-9).toPrecision(6));

  const maxOrd = computeExactMaxOrder(slitSpacingM, wavelengthM);
  const candidateOrders = [1, 2, 3].filter((m) => {
    const s = (m * wavelengthM) / slitSpacingM;
    return m <= maxOrd && s >= 0.24 && s <= 0.86;
  });
  if (candidateOrders.length === 0) return undefined;
  const queryOrderN = pick(rng, candidateOrders);
  const screenDistanceM = pick(rng, [0.85, 1.15, 1.35, 1.6, 1.85, 2.1]);

  const isInverseWl = format === "mcq" && slotIndex % 2 === 1;
  const hiddenQuantities = isInverseWl
    ? [
        "wavelengthM",
        "slitSpacingM",
        "linesPerMeter",
        "querySinTheta",
        "queryAngleRad",
        "queryScreenPositionM",
        "maxOrder",
        "strictlySubNinetyMaxOrder",
        "totalPrincipalMaxima",
        "flatScreenMaximaCount",
      ]
    : [
        "slitSpacingM",
        "linesPerMeter",
        "querySinTheta",
        "queryAngleRad",
        "queryAngleDegrees",
        "queryScreenPositionM",
        "maxOrder",
        "strictlySubNinetyMaxOrder",
        "totalPrincipalMaxima",
        "flatScreenMaximaCount",
      ];

  const spec: DiffractionGratingScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "diffraction-grating",
    wavelengthM,
    slitSpacingM,
    linesPerMm,
    queryOrderN,
    ...(format === "structured" ? { screenDistanceM } : {}),
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const wlStr = fmtNm(wavelengthM);
  const nLinesStr = `${linesPerMm} lines mm⁻¹`;
  const thetaStr = `${fmtSig3(sol.queryAngleDegrees)}°`;

  if (format === "mcq") {
    if (!isInverseWl) {
      const stems = [
        `Monochromatic light of wavelength ${wlStr} strikes ${gratingDesc} ruled with ${nLinesStr}. At what angle θ from the normal is the order n = ${queryOrderN} principal maximum observed?`,
        `Figure shows ${gratingDesc} having ${nLinesStr} illuminated normally by a laser of wavelength ${wlStr}. Calculate the diffraction angle (in degrees) of the n = ${queryOrderN} maximum.`,
        `In a spectroscopy measurement on ${gratingDesc}, a grating with ${nLinesStr} diffracts a beam of wavelength ${wlStr}. Determine the angular position θ of the ${queryOrderN}${queryOrderN === 1 ? "st" : queryOrderN === 2 ? "nd" : "rd"}-order bright maximum.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const tanAngleDeg = (Math.atan(sol.querySinTheta) * 180) / Math.PI;
      const altOrderSin =
        queryOrderN > 1
          ? sol.querySinTheta / queryOrderN
          : Math.min(0.99, 2 * sol.querySinTheta);
      const altOrderDeg = (Math.asin(altOrderSin) * 180) / Math.PI;
      const unitSlipDeg =
        (Math.asin(Math.min(0.99, 0.1 * sol.querySinTheta)) * 180) / Math.PI;

      const built = buildDistinctMcqOptions(
        sol.queryAngleDegrees,
        "°",
        [
          {
            value: tanAngleDeg,
            rationale:
              "Applies tan θ = nλ / d (small-angle approximation) instead of the exact grating relation sin θ = nλ / d.",
          },
          {
            value: altOrderDeg,
            rationale:
              queryOrderN > 1
                ? "Computes the first-order (n = 1) diffraction angle instead of multiplying λ by order n."
                : "Doubles the order, computing n = 2 instead of n = 1.",
          },
          {
            value: unitSlipDeg,
            rationale:
              "Misconverts lines mm⁻¹ to lines m⁻¹ by a factor of 100 instead of 1000 (using d = 10⁻² / N).",
          },
        ],
        [
          {
            value: sol.queryAngleRad,
            rationale:
              "Evaluates arcsin(nλ / d) in radians and reports the numerical value as degrees.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "single-slit-diffraction-gratings",
        templateArchetype: "grating-lines-per-mm-diffraction-angle",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
          { name: "linesPerMm", value: linesPerMm, source: "stem" },
          { name: "queryOrderN", value: queryOrderN, source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Convert grating lines per millimetre to slit spacing and calculate the n-th order diffraction angle",
          distractorStrategy: [
            "replace-sine-with-tangent-at-large-angle",
            "use-wrong-diffraction-order-index",
            "power-of-ten-slip-converting-lines-per-mm",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "queryAngleDegrees",
        workedSolution: `Grating spacing d = 10⁻³ / ${linesPerMm} = ${fmtSig3(slitSpacingM)} m. Using d sin θ = nλ gives sin θ = (${queryOrderN} × ${fmtSig3(wavelengthM)}) / ${fmtSig3(slitSpacingM)} = ${fmtSig3(sol.querySinTheta)}, so θ = ${fmtQuantity(sol.queryAngleDegrees, "°")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Converts d = 10⁻³ / N and solves d sin θ = nλ to get ${fmtQuantity(sol.queryAngleDegrees, "°")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Inverse MCQ: find wavelengthM from measured angle θ_n and linesPerMm
    const stems = [
      `On ${gratingDesc} with ${nLinesStr}, the order n = ${queryOrderN} diffraction maximum of a monochromatic beam is measured at θ = ${thetaStr} from the straight-through direction. What is the wavelength of the light?`,
      `Figure shows a collimated beam striking ${gratingDesc} (${nLinesStr}) normally and producing its n = ${queryOrderN} principal maximum at an angle of ${thetaStr}. Calculate the beam's wavelength.`,
    ];
    const stem = pickOffset(stems, slotIndex, rng);
    const built = buildDistinctMcqOptions(
      wavelengthM,
      "m",
      [
        {
          value: wavelengthM * 1e3,
          rationale:
            "Forgets to convert lines per mm into lines per metre, computing d = 1 / N in metres instead of 10⁻³ / N.",
        },
        {
          value: (slitSpacingM * Math.tan(sol.queryAngleRad)) / queryOrderN,
          rationale:
            "Substitutes tan θ instead of sin θ into λ = d sin θ / n.",
        },
        {
          value:
            queryOrderN > 1
              ? slitSpacingM * sol.querySinTheta
              : 0.5 * wavelengthM,
          rationale:
            queryOrderN > 1
              ? "Omits division by diffraction order n, computing λ = d sin θ."
              : "Divides by 2 as if in a second-order maximum.",
        },
      ],
      [
        {
          value: (queryOrderN * sol.querySinTheta) / slitSpacingM,
          rationale: "Multiplies by lines per metre instead of slit spacing d.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "single-slit-diffraction-gratings",
      templateArchetype: "grating-lines-per-mm-diffraction-angle",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        { name: "linesPerMm", value: linesPerMm, source: "stem" },
        { name: "queryOrderN", value: queryOrderN, source: "stem" },
        {
          name: "queryAngleDegrees",
          value: sol.queryAngleDegrees,
          unit: "°",
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Determine optical wavelength from grating ruling density, diffraction order, and measured angular deflection",
        distractorStrategy: [
          "omit-millimetre-to-metre-ruling-conversion",
          "use-tangent-instead-of-sine",
          "omit-order-divisor",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "wavelengthM",
      workedSolution: `Slit spacing d = 10⁻³ / ${linesPerMm} = ${fmtSig3(slitSpacingM)} m. Rearranging d sin θ = nλ gives λ = d sin(${thetaStr}) / ${queryOrderN} = ${fmtQuantity(wavelengthM, "m")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Computes d = 10⁻³ / N and λ = d sin θ / n = ${fmtQuantity(wavelengthM, "m")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2
  const bigDStr = fmtGivenScalar(screenDistanceM, "m");
  const screenPos = sol.queryScreenPositionM!;
  const stems = [
    `Monochromatic light of wavelength ${wlStr} is incident normally on ${gratingDesc} ruled with ${nLinesStr}. Diffracted beams fall onto a flat observation screen placed ${bigDStr} behind and parallel to the grating, and measurements are taken for the n = ${queryOrderN} order.`,
    `In an optical spectrometry setup, ${gratingDesc} (${nLinesStr}) is illuminated normally at wavelength ${wlStr}. A flat viewing screen sits ${bigDStr} downstream from the grating to record the order n = ${queryOrderN} principal maximum.`,
    `Figure shows a normal-incidence beam of wavelength ${wlStr} diffracted by ${gratingDesc} having ${nLinesStr} onto a planar screen ${bigDStr} away; consider the n = ${queryOrderN} bright order.`,
    `Coherent radiation of wavelength ${wlStr} strikes ${gratingDesc} (${nLinesStr}) perpendicularly, projecting discrete diffraction orders onto a flat screen at distance ${bigDStr}, where a sensor tracks the n = ${queryOrderN} maximum.`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Calculate the centre-to-centre spacing d between adjacent grating slits in metres.",
      marks: 1,
      targetQuantityKey: "slitSpacingM",
      expectedAnswer: fmtQuantity(slitSpacingM, "m"),
      workingSteps: [
        `d = 10⁻³ / N = 10⁻³ / ${linesPerMm} = ${fmtQuantity(slitSpacingM, "m")}.`,
      ],
    },
    {
      partId: "b",
      prompt: `Calculate the diffraction angle θ_${queryOrderN} (in degrees) of the order n = ${queryOrderN} maximum.`,
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "queryAngleDegrees",
      expectedAnswer: fmtQuantity(sol.queryAngleDegrees, "°"),
      workingSteps: [
        "Apply d sin θ = nλ.",
        `sin θ = (${queryOrderN} × ${fmtSig3(wavelengthM)}) / ${fmtSig3(slitSpacingM)} = ${fmtSig3(sol.querySinTheta)} => θ = ${fmtQuantity(sol.queryAngleDegrees, "°")}.`,
      ],
    },
    {
      partId: "c",
      prompt: `Determine the linear distance along the flat screen from the central maximum (n = 0) to the n = ${queryOrderN} maximum.`,
      marks: 3,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "queryScreenPositionM",
      expectedAnswer: fmtQuantity(screenPos, "m"),
      workingSteps: [
        "At large diffraction angles, use exact trigonometry y = D tan θ (do not assume tan θ ≈ sin θ).",
        `y = ${screenDistanceM} × tan(${fmtSig3(sol.queryAngleDegrees)}°) = ${fmtQuantity(screenPos, "m")}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "single-slit-diffraction-gratings",
    templateArchetype: "grating-lines-per-mm-diffraction-angle",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
      { name: "linesPerMm", value: linesPerMm, source: "stem" },
      { name: "queryOrderN", value: queryOrderN, source: "stem" },
      {
        name: "screenDistanceM",
        value: screenDistanceM,
        unit: "m",
        source: "stem",
      },
    ],
    questionPlan: {
      targetSummary:
        "Convert grating ruling density to slit spacing, solve for exact diffraction angle, and project onto a flat screen via D tan θ",
      subpartStrategy: [
        "part (a): target slitSpacingM",
        "part (b): target queryAngleDegrees",
        "part (c): target queryScreenPositionM",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) d = 10⁻³ / ${linesPerMm} = ${fmtQuantity(slitSpacingM, "m")}. (b) sin θ = nλ / d = ${fmtSig3(sol.querySinTheta)}, so θ = ${fmtQuantity(sol.queryAngleDegrees, "°")}. (c) On the flat screen, y = D tan θ = ${screenDistanceM} × tan(${fmtSig3(sol.queryAngleDegrees)}°) = ${fmtQuantity(screenPos, "m")}.`,
    markScheme: [
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains d = ${fmtQuantity(slitSpacingM, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Uses sin θ = nλ / d.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains θ = ${fmtQuantity(sol.queryAngleDegrees, "°")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Recognises large-angle geometry y = D tan θ rather than small-angle D sin θ.",
        marks: 2,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains y = ${fmtQuantity(screenPos, "m")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

function buildGratingMaxObservableOrder(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const gratingDesc = pickOffset(GRATING_SETUPS, slotIndex + 5, rng);
  const syllabi = resolveWavesSyllabiTags(
    "single-slit-diffraction-gratings",
    format,
    "hl-alevel-ncuk",
    slotIndex,
  );

  // Pick (linesPerMm, wavelengthNm) so d/λ has fractional part >= 0.56 (testing floor vs round-up!)
  const pairs: ReadonlyArray<readonly [number, number]> = [
    [300, 580], // d/λ = 5.747 -> n_max = 5 (rounds to 6)
    [400, 650], // d/λ = 3.846 -> n_max = 3 (rounds to 4)
    [500, 532], // d/λ = 3.759 -> n_max = 3 (rounds to 4)
    [250, 680], // d/λ = 5.882 -> n_max = 5 (rounds to 6)
    [600, 590], // d/λ = 2.825 -> n_max = 2 (rounds to 3)
    [350, 595], // d/λ = 4.802 -> n_max = 4 (rounds to 5)
    [450, 575], // d/λ = 3.865 -> n_max = 3 (rounds to 4)
    [200, 640], // d/λ = 7.8125 -> n_max = 7 (rounds to 8)
    [550, 480], // d/λ = 3.788 -> n_max = 3 (rounds to 4)
    [320, 655], // d/λ = 4.771 -> n_max = 4 (rounds to 5)
    [480, 545], // d/λ = 3.823 -> n_max = 3 (rounds to 4)
    [280, 615], // d/λ = 5.807 -> n_max = 5 (rounds to 6)
  ];
  const [linesPerMm, wavelengthNm] = pickOffset(pairs, slotIndex, rng);
  const slitSpacingM = Number((1e-3 / linesPerMm).toPrecision(12));
  const wavelengthM = Number((wavelengthNm * 1e-9).toPrecision(6));

  const hiddenQuantities = [
    "slitSpacingM",
    "linesPerMeter",
    "querySinTheta",
    "queryAngleRad",
    "queryAngleDegrees",
    "maxOrder",
    "strictlySubNinetyMaxOrder",
    "totalPrincipalMaxima",
    "flatScreenMaximaCount",
  ];

  const spec: DiffractionGratingScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "diffraction-grating",
    wavelengthM,
    slitSpacingM,
    linesPerMm,
    queryOrderN: 1,
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const wlStr = fmtNm(wavelengthM);
  const nLinesStr = `${linesPerMm} lines mm⁻¹`;
  const ratioExact = slitSpacingM / wavelengthM;

  if (format === "mcq") {
    const askTotalMaxima = slotIndex % 2 === 1;
    if (!askTotalMaxima) {
      const stems = [
        `Collimated light of wavelength ${wlStr} strikes ${gratingDesc} ruled with ${nLinesStr} at normal incidence. What is the highest diffraction order n_max observable?`,
        `Figure shows ${gratingDesc} (${nLinesStr}) illuminated perpendicularly by monochromatic light of wavelength ${wlStr}. Determine the maximum observable order n_max.`,
        `When a laser beam of wavelength ${wlStr} hits ${gratingDesc} having ${nLinesStr} squarely, what is the largest integer order n for which a principal maximum is formed?`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const built = buildDistinctMcqOptions(
        sol.maxOrder,
        "",
        [
          {
            value: sol.maxOrder + 1,
            rationale: `Rounds d / λ = ${ratioExact.toFixed(2)} UP to the nearest integer instead of taking floor(d / λ), which would require sin θ > 1.`,
          },
          {
            value: 2 * sol.maxOrder,
            rationale:
              "Doubles n_max, confusing the maximum order number with the count of side maxima on both sides.",
          },
          {
            value: sol.totalPrincipalMaxima,
            rationale:
              "Calculates the total number of observable maxima (2n_max + 1) instead of the highest order number n_max.",
          },
        ],
        [
          {
            value: Math.max(1, sol.maxOrder - 1),
            rationale: "Subtracts 1 unnecessarily when truncating d / λ.",
          },
        ],
        true,
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "single-slit-diffraction-gratings",
        templateArchetype: "grating-max-observable-order-count",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities: [...hiddenQuantities, "queryOrderN"],
        requiredGivens: [
          { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
          { name: "linesPerMm", value: linesPerMm, source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Determine maximum observable diffraction order floor(d/λ) for normal incidence on a transmission grating",
          distractorStrategy: [
            "round-ratio-up-violating-sine-bound",
            "double-order-number-across-two-quadrants",
            "report-total-maxima-two-n-plus-one",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "maxOrder",
        workedSolution: `Grating spacing d = 10⁻³ / ${linesPerMm} = ${fmtSig3(slitSpacingM)} m. Since sin θ ≤ 1, n ≤ d / λ = ${fmtSig3(slitSpacingM)} / ${fmtSig3(wavelengthM)} = ${ratioExact.toFixed(2)}. Taking the floor gives n_max = ${sol.maxOrder}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates d / λ = ${ratioExact.toFixed(2)} and takes floor to get n_max = ${sol.maxOrder} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Ask for totalPrincipalMaxima (2 * n_max + 1)
    const stems = [
      `A laser beam of wavelength ${wlStr} is incident normally on ${gratingDesc} with ${nLinesStr}. Including the central zero-order beam, how many total principal maxima emerge across the forward semicircle (−90° ≤ θ ≤ +90°)?`,
      `Figure depicts ${gratingDesc} (${nLinesStr}) illuminated squarely by coherent light of wavelength ${wlStr}. What total number of bright principal maxima can be detected on a semicircular detector track?`,
    ];
    const stem = pickOffset(stems, slotIndex, rng);
    const built = buildDistinctMcqOptions(
      sol.totalPrincipalMaxima,
      "",
      [
        {
          value: 2 * sol.maxOrder,
          rationale:
            "Counts ±1 .. ±n_max side orders (2n_max) while forgetting the central n = 0 maximum.",
        },
        {
          value: 2 * (sol.maxOrder + 1) + 1,
          rationale: `Rounds d / λ = ${ratioExact.toFixed(2)} up to ${sol.maxOrder + 1} before applying 2n_max + 1.`,
        },
        {
          value: sol.maxOrder,
          rationale:
            "Gives the highest single-side order n_max instead of total maxima 2n_max + 1.",
        },
      ],
      [
        {
          value: sol.maxOrder + 1,
          rationale: "Counts only non-negative orders 0 .. n_max on one side.",
        },
      ],
      true,
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "single-slit-diffraction-gratings",
      templateArchetype: "grating-max-observable-order-count",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities: [...hiddenQuantities, "queryOrderN"],
      requiredGivens: [
        { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
        { name: "linesPerMm", value: linesPerMm, source: "stem" },
      ],
      questionPlan: {
        targetSummary:
          "Count total observable principal diffraction maxima across the forward semicircle including the central maximum",
        distractorStrategy: [
          "omit-central-zero-order-maximum",
          "round-d-over-lambda-up-before-counting",
          "report-single-side-highest-order-only",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "totalPrincipalMaxima",
      workedSolution: `d = 10⁻³ / ${linesPerMm} = ${fmtSig3(slitSpacingM)} m, so d / λ = ${ratioExact.toFixed(2)} and n_max = ${sol.maxOrder}. Including ±1..±${sol.maxOrder} and n = 0 gives 2(${sol.maxOrder}) + 1 = ${sol.totalPrincipalMaxima} principal maxima.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Finds n_max = ${sol.maxOrder} and total maxima 2n_max + 1 = ${sol.totalPrincipalMaxima} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2
  const stems = [
    `A collimated beam of wavelength ${wlStr} strikes ${gratingDesc} ruled with ${nLinesStr} at normal incidence. Diffracted maxima are scanned across the full forward semicircle (−90° < θ < +90°), starting with the first-order (n = 1) beam.`,
    `In a spectrometer experiment, ${gratingDesc} (${nLinesStr}) is illuminated perpendicularly by coherent light of wavelength ${wlStr}. Starting from order n = 1, a goniometer sweeps across −90° < θ < +90° to catalogue every observable principal maximum.`,
    `Figure shows monochromatic radiation of wavelength ${wlStr} incident normally on ${gratingDesc} ruled at ${nLinesStr}; an angular detector measures the n = 1 order and surveys all principal orders within ±90°.`,
    `Monochromatic plane waves of wavelength ${wlStr} illuminate ${gratingDesc} (${nLinesStr}) normally, producing discrete diffraction orders beginning at n = 1 across the forward hemisphere.`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Calculate the diffraction angle (in degrees) of the first-order (n = 1) maximum.",
      marks: 2,
      targetQuantityKey: "queryAngleDegrees",
      expectedAnswer: fmtQuantity(sol.queryAngleDegrees, "°"),
      workingSteps: [
        `d = 10⁻³ / ${linesPerMm} = ${fmtSig3(slitSpacingM)} m.`,
        `θ₁ = arcsin(λ / d) = ${fmtQuantity(sol.queryAngleDegrees, "°")}.`,
      ],
    },
    {
      partId: "b",
      prompt:
        "Determine the maximum observable diffraction order n_max for this wavelength.",
      marks: 2,
      targetQuantityKey: "maxOrder",
      expectedAnswer: String(sol.maxOrder),
      workingSteps: [
        `d / λ = ${fmtSig3(slitSpacingM)} / ${fmtSig3(wavelengthM)} = ${ratioExact.toFixed(2)}.`,
        `Since sin θ ≤ 1, truncate down: n_max = floor(${ratioExact.toFixed(2)}) = ${sol.maxOrder}.`,
      ],
    },
    {
      partId: "c",
      prompt:
        "State the total number of bright principal maxima formed across the forward semicircle.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "totalPrincipalMaxima",
      expectedAnswer: String(sol.totalPrincipalMaxima),
      workingSteps: [
        "Total maxima = 2n_max + 1 (orders −n_max, ..., 0, ..., +n_max).",
        `2(${sol.maxOrder}) + 1 = ${sol.totalPrincipalMaxima}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "single-slit-diffraction-gratings",
    templateArchetype: "grating-max-observable-order-count",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
      { name: "linesPerMm", value: linesPerMm, source: "stem" },
      { name: "queryOrderN", value: 1, source: "stem" },
    ],
    questionPlan: {
      targetSummary:
        "Compute first-order grating angle, floor maximum diffraction order, and total observable principal maxima",
      subpartStrategy: [
        "part (a): target queryAngleDegrees",
        "part (b): target maxOrder",
        "part (c): target totalPrincipalMaxima",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) d = ${fmtSig3(slitSpacingM)} m, so θ₁ = arcsin(λ / d) = ${fmtQuantity(sol.queryAngleDegrees, "°")}. (b) d / λ = ${ratioExact.toFixed(2)}, giving n_max = ${sol.maxOrder}. (c) Total principal maxima = 2(${sol.maxOrder}) + 1 = ${sol.totalPrincipalMaxima}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Computes d = 10⁻³ / N and applies sin θ₁ = λ / d.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains θ₁ = ${fmtQuantity(sol.queryAngleDegrees, "°")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Evaluates d / λ = ${ratioExact.toFixed(2)} and rounds down.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains n_max = ${sol.maxOrder}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Applies 2n_max + 1 including n = 0.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains ${sol.totalPrincipalMaxima}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

function buildSingleSlitCentralMaxWidth(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const slitDesc = pickOffset(SINGLE_SLIT_SETUPS, slotIndex, rng);
  // Quantitative θ = λ/b and w = 2λD/b is strictly IB HL (C.3)
  const syllabi = resolveWavesSyllabiTags(
    "single-slit-diffraction-gratings",
    format,
    "ib-hl-only",
    slotIndex,
  );

  const wavelengthNm = pick(rng, [405, 450, 488, 514, 532, 589, 633, 650, 670]);
  const wavelengthM = Number((wavelengthNm * 1e-9).toPrecision(6));
  const slitWidthM = pick(rng, [
    0.08e-3, 0.1e-3, 0.12e-3, 0.15e-3, 0.18e-3, 0.22e-3, 0.25e-3,
  ]);
  const screenDistanceM = pick(rng, [1.2, 1.5, 1.8, 2.2, 2.5, 3.0, 3.5]);

  const isInverseWidth = format === "mcq" && slotIndex % 2 === 1;
  const hiddenQuantities = isInverseWidth
    ? [
        "slitWidthM",
        "firstMinimumAngleRad",
        "firstMinimumExactAngleRad",
        "firstMinimumExactAngleDegrees",
        "centralAngularWidthRad",
        "centralHalfWidthM",
        "centralExactHalfWidthM",
        "centralExactFullWidthM",
      ]
    : [
        "firstMinimumAngleRad",
        "firstMinimumExactAngleRad",
        "firstMinimumExactAngleDegrees",
        "centralAngularWidthRad",
        "centralHalfWidthM",
        "centralFullWidthM",
        "centralExactHalfWidthM",
        "centralExactFullWidthM",
      ];

  const spec: SingleSlitScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "single-slit",
    wavelengthM,
    slitWidthM,
    screenDistanceM,
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const wlStr = fmtNm(wavelengthM);
  const bStr = fmtMm(slitWidthM);
  const bigDStr = fmtGivenScalar(screenDistanceM, "m");
  const wMmStr = `${fmtSig3(sol.centralFullWidthM * 1e3)} mm`;

  if (format === "mcq") {
    if (!isInverseWidth) {
      const stems = [
        `Monochromatic light of wavelength ${wlStr} passes through ${slitDesc} of slit width ${bStr} onto a screen ${bigDStr} away. What is the full linear width of the central bright diffraction maximum on the screen?`,
        `Figure shows ${slitDesc} of aperture width ${bStr} illuminated by coherent light of wavelength ${wlStr}, with a screen positioned ${bigDStr} behind the slit. Calculate the distance between the two first-order dark minima bounding the central maximum.`,
        `On an optics rail, ${slitDesc} (width ${bStr}) diffracts a beam of wavelength ${wlStr} onto a screen at distance ${bigDStr}. Determine the full width w of the central bright fringe.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const built = buildDistinctMcqOptions(
        sol.centralFullWidthM,
        "m",
        [
          {
            value: sol.centralHalfWidthM,
            rationale:
              "Calculates λD / b (the distance from the centre to one first-order minimum) instead of the full central maximum width 2λD / b.",
          },
          {
            value: 2 * sol.centralFullWidthM,
            rationale:
              "Multiplies by 4 instead of 2 when doubling the first-minimum half-width.",
          },
          {
            value: (2 * wavelengthM * slitWidthM) / screenDistanceM,
            rationale:
              "Multiplies by slit width b and divides by screen distance D instead of 2λD / b.",
          },
        ],
        [
          {
            value: sol.firstMinimumAngleRad,
            rationale:
              "Computes the angular half-width θ = λ / b in radians without multiplying by 2D.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "single-slit-diffraction-gratings",
        templateArchetype: "single-slit-central-maximum-width",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
          { name: "slitWidthM", value: slitWidthM, unit: "m", source: "stem" },
          {
            name: "screenDistanceM",
            value: screenDistanceM,
            unit: "m",
            source: "stem",
          },
        ],
        questionPlan: {
          targetSummary:
            "Calculate full linear screen width of a single-slit central diffraction maximum",
          distractorStrategy: [
            "compute-half-width-lambda-D-over-b",
            "double-the-already-doubled-central-width",
            "invert-slit-width-and-screen-distance",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "centralFullWidthM",
        workedSolution: `First diffraction minima lie at θ = ±λ / b, giving half-width y₁ = λD / b = ${fmtSig3(sol.centralHalfWidthM)} m. Full central maximum width w = 2λD / b = ${fmtQuantity(sol.centralFullWidthM, "m")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses w = 2λD / b to obtain ${fmtQuantity(sol.centralFullWidthM, "m")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Inverse MCQ: find slitWidthM from measured centralFullWidthM
    const stems = [
      `In ${slitDesc}, coherent light of wavelength ${wlStr} forms a Fraunhofer pattern on a screen ${bigDStr} behind the aperture. If the full width of the central bright maximum between its first dark minima is ${wMmStr}, what is the slit width b?`,
      `To calibrate ${slitDesc} using a laser of wavelength ${wlStr} and screen distance ${bigDStr}, an engineer measures the full central diffraction maximum width to be ${wMmStr}. Calculate the aperture width b.`,
    ];
    const stem = pickOffset(stems, slotIndex, rng);
    const built = buildDistinctMcqOptions(
      slitWidthM,
      "m",
      [
        {
          value: 0.5 * slitWidthM,
          rationale:
            "Omits the factor of 2 in w = 2λD / b (treating full central width as λD / b), underestimating slit width by half.",
        },
        {
          value: 2 * slitWidthM,
          rationale: "Uses a factor of 4λD / w instead of 2λD / w.",
        },
        {
          value: (wavelengthM * sol.centralFullWidthM) / (2 * screenDistanceM),
          rationale:
            "Multiplies λ by w and divides by 2D instead of computing b = 2λD / w.",
        },
      ],
      [
        {
          value: slitWidthM * 1e3,
          rationale: "Leaves a 10³ millimetre-to-metre unit conversion error.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "single-slit-diffraction-gratings",
      templateArchetype: "single-slit-central-maximum-width",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
        {
          name: "screenDistanceM",
          value: screenDistanceM,
          unit: "m",
          source: "stem",
        },
        {
          name: "centralFullWidthM",
          value: sol.centralFullWidthM,
          unit: "m",
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Invert the single-slit central maximum width relation to determine aperture width",
        distractorStrategy: [
          "omit-factor-of-two-confusing-with-double-slit-formula",
          "multiply-by-four-instead-of-two",
          "algebraic-inversion-error",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "slitWidthM",
      workedSolution: `Since full central maximum width w = 2λD / b, rearranging gives b = 2λD / w = (2 × ${fmtSig3(wavelengthM)} × ${screenDistanceM}) / ${fmtSig3(sol.centralFullWidthM)} = ${fmtQuantity(slitWidthM, "m")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Rearranges w = 2λD / b to obtain b = ${fmtQuantity(slitWidthM, "m")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2
  const stems = [
    `Monochromatic plane waves of wavelength ${wlStr} pass through ${slitDesc} of width ${bStr}. The resulting Fraunhofer diffraction intensity profile is observed on a flat screen at distance ${bigDStr} from the slit.`,
    `In an optics bench experiment, coherent light of wavelength ${wlStr} illuminates ${slitDesc} of aperture width ${bStr}, projecting a single-slit diffraction pattern onto a screen ${bigDStr} downstream.`,
    `Figure illustrates ${slitDesc} (width ${bStr}) diffracting a normal-incidence beam of wavelength ${wlStr} onto a planar detector screen situated ${bigDStr} behind the aperture.`,
    `A laser beam of wavelength ${wlStr} strikes ${slitDesc} whose slit width is ${bStr}; a photodiode array placed ${bigDStr} away records the central maximum and flanking minima.`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Calculate the angular position θ (in radians) of the first diffraction minimum.",
      marks: 2,
      targetQuantityKey: "firstMinimumAngleRad",
      expectedAnswer: fmtQuantity(sol.firstMinimumAngleRad, "rad"),
      workingSteps: [
        "Use the small-angle single-slit first-minimum relation θ = λ / b.",
        `θ = ${fmtSig3(wavelengthM)} / ${fmtSig3(slitWidthM)} = ${fmtQuantity(sol.firstMinimumAngleRad, "rad")}.`,
      ],
    },
    {
      partId: "b",
      prompt:
        "Determine the linear distance on the screen from the centre of the pattern to the first dark minimum.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "centralHalfWidthM",
      expectedAnswer: fmtQuantity(sol.centralHalfWidthM, "m"),
      workingSteps: [
        "Use y₁ = θD = λD / b.",
        `y₁ = ${fmtSig3(sol.firstMinimumAngleRad)} × ${screenDistanceM} = ${fmtQuantity(sol.centralHalfWidthM, "m")}.`,
      ],
    },
    {
      partId: "c",
      prompt:
        "Calculate the full linear width of the central bright maximum on the screen.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "centralFullWidthM",
      expectedAnswer: fmtQuantity(sol.centralFullWidthM, "m"),
      workingSteps: [
        "The central maximum spans from −y₁ to +y₁: w = 2y₁.",
        `w = 2 × ${fmtSig3(sol.centralHalfWidthM)} = ${fmtQuantity(sol.centralFullWidthM, "m")}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "single-slit-diffraction-gratings",
    templateArchetype: "single-slit-central-maximum-width",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      { name: "wavelengthM", value: wavelengthM, unit: "m", source: "stem" },
      { name: "slitWidthM", value: slitWidthM, unit: "m", source: "stem" },
      {
        name: "screenDistanceM",
        value: screenDistanceM,
        unit: "m",
        source: "stem",
      },
    ],
    questionPlan: {
      targetSummary:
        "Compute single-slit first minimum angle, central half-width, and full central maximum screen width",
      subpartStrategy: [
        "part (a): target firstMinimumAngleRad",
        "part (b): target centralHalfWidthM",
        "part (c): target centralFullWidthM",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) θ = λ / b = ${fmtQuantity(sol.firstMinimumAngleRad, "rad")}. (b) y₁ = θD = ${fmtQuantity(sol.centralHalfWidthM, "m")}. (c) Full central width w = 2y₁ = ${fmtQuantity(sol.centralFullWidthM, "m")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Applies θ = λ / b in SI units.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains θ = ${fmtQuantity(sol.firstMinimumAngleRad, "rad")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Multiplies θ by screen distance D.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains y₁ = ${fmtQuantity(sol.centralHalfWidthM, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Doubles half-width to span both sides of the central peak.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains w = ${fmtQuantity(sol.centralFullWidthM, "m")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

function buildDopplerMovingSource(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const setup = pickOffset(DOPPLER_SETUPS, slotIndex, rng);
  // Exact moving-source acoustic Doppler equation is strictly IB HL (C.5)
  const syllabi = resolveWavesSyllabiTags(
    "doppler-effect",
    format,
    "ib-hl-only",
    slotIndex,
  );

  const emittedFrequencyHz = pick(rng, [
    380, 440, 510, 560, 620, 680, 750, 820, 900, 960,
  ]);
  const waveSpeedMs = pick(rng, [332, 336, 340, 343]);
  // Use v_s >= 56 m s⁻¹ so fv/(v ∓ v_s) and f(v ± v_s)/v differ by >= 3% at 3 sig figs!
  const sourceSpeedMs = pick(rng, [56, 60, 64, 68, 72, 76, 82, 88]);
  const sourceMotion: SourceMotionDirection =
    slotIndex % 2 === 0 ? "towards-observer" : "away-from-observer";

  const isInverseSpeed = format === "mcq" && slotIndex % 3 === 1;
  const hiddenQuantities = isInverseSpeed
    ? [
        "sourceSpeedMs",
        "observedPeriodS",
        "frequencyShiftHz",
        "fractionalFrequencyShift",
        "emittedWavelengthM",
        "mediumWavelengthTowardsObserverM",
        "relativeWaveSpeedAtObserverMs",
        "lowSpeedShiftApproximationHz",
      ]
    : [
        "observedFrequencyHz",
        "observedPeriodS",
        "frequencyShiftHz",
        "fractionalFrequencyShift",
        "emittedWavelengthM",
        "mediumWavelengthTowardsObserverM",
        "relativeWaveSpeedAtObserverMs",
        "lowSpeedShiftApproximationHz",
      ];

  const spec: DopplerEffectScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "doppler-effect",
    emittedFrequencyHz,
    waveSpeedMs,
    sourceSpeedMs,
    sourceMotion,
    observerSpeedMs: 0,
    observerMotion: "stationary",
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const fStr = fmtGivenScalar(emittedFrequencyHz, "Hz");
  const vStr = fmtGivenScalar(waveSpeedMs, "m s⁻¹");
  const vsStr = fmtGivenScalar(sourceSpeedMs, "m s⁻¹");
  const fObsStr = `${fmtSig3(sol.observedFrequencyHz)} Hz`;
  const motionVerb =
    sourceMotion === "towards-observer"
      ? "approaches directly towards"
      : "recedes directly away from";

  if (format === "mcq") {
    if (!isInverseSpeed) {
      const stems = [
        `Emitting a continuous tone of frequency ${fStr}, ${setup.source} ${motionVerb} ${setup.observer} at a constant speed of ${vsStr}. Taking the speed of sound in still air as ${vStr}, what frequency is detected by the stationary observer?`,
        `Figure shows wavefronts radiated at ${fStr} by ${setup.source} as it ${motionVerb} ${setup.observer} at ${vsStr} (speed of sound ${vStr}). Calculate the observed acoustic frequency.`,
        `In still air where sound travels at ${vStr}, ${setup.source} sounds at ${fStr} while moving at ${vsStr} as it ${motionVerb} ${setup.observer}. Which frequency is recorded?`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);

      const invertedSignFreq =
        sourceMotion === "towards-observer"
          ? (emittedFrequencyHz * waveSpeedMs) / (waveSpeedMs + sourceSpeedMs)
          : (emittedFrequencyHz * waveSpeedMs) / (waveSpeedMs - sourceSpeedMs);
      const movingObserverFormulaFreq =
        sourceMotion === "towards-observer"
          ? (emittedFrequencyHz * (waveSpeedMs + sourceSpeedMs)) / waveSpeedMs
          : (emittedFrequencyHz * (waveSpeedMs - sourceSpeedMs)) / waveSpeedMs;
      const bothWrongFreq =
        sourceMotion === "towards-observer"
          ? (emittedFrequencyHz * (waveSpeedMs - sourceSpeedMs)) / waveSpeedMs
          : (emittedFrequencyHz * (waveSpeedMs + sourceSpeedMs)) / waveSpeedMs;

      const built = buildDistinctMcqOptions(
        sol.observedFrequencyHz,
        "Hz",
        [
          {
            value: invertedSignFreq,
            rationale:
              "Inverts the Doppler sign in the denominator, using v + v_s for an approaching source (or v − v_s for a receding source).",
          },
          {
            value: movingObserverFormulaFreq,
            rationale:
              "Applies the moving-observer equation f(v ± v_s) / v instead of the moving-source equation fv / (v ∓ v_s).",
          },
          {
            value: bothWrongFreq,
            rationale:
              "Uses the moving-observer formula AND reverses the sign of the Doppler frequency shift.",
          },
        ],
        [
          {
            value: Math.abs(sol.frequencyShiftHz),
            rationale:
              "Calculates only the frequency shift magnitude |f' − f| instead of observed frequency f'.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "doppler-effect",
        templateArchetype: "doppler-moving-source-acoustic-shift",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          {
            name: "emittedFrequencyHz",
            value: emittedFrequencyHz,
            unit: "Hz",
            source: "stem",
          },
          {
            name: "waveSpeedMs",
            value: waveSpeedMs,
            unit: "m s⁻¹",
            source: "stem",
          },
          {
            name: "sourceSpeedMs",
            value: sourceSpeedMs,
            unit: "m s⁻¹",
            source: "stem",
          },
        ],
        questionPlan: {
          targetSummary:
            "Calculate exact observed acoustic frequency for a moving sound source and stationary observer",
          distractorStrategy: [
            "invert-doppler-denominator-sign",
            "swap-moving-source-and-moving-observer-formulas",
            "swap-formula-and-invert-sign",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "observedFrequencyHz",
        workedSolution: `For a source moving ${sourceMotion === "towards-observer" ? "towards" : "away from"} a stationary observer, f' = fv / (v ${sourceMotion === "towards-observer" ? "−" : "+"} v_s) = (${emittedFrequencyHz} × ${waveSpeedMs}) / (${waveSpeedMs} ${sourceMotion === "towards-observer" ? "−" : "+"} ${sourceSpeedMs}) = ${fmtQuantity(sol.observedFrequencyHz, "Hz")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies exact moving-source Doppler formula to obtain ${fmtQuantity(sol.observedFrequencyHz, "Hz")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Inverse MCQ: find sourceSpeedMs from observedFrequencyHz
    const approxWrongSpeed =
      waveSpeedMs *
      Math.abs(sol.observedFrequencyHz / emittedFrequencyHz - 1);
    const stems = [
      `Sounding continuously at ${fStr}, ${setup.source} ${motionVerb} ${setup.observer} through still air (speed of sound ${vStr}). If the stationary observer records a shifted frequency of ${fObsStr}, what is the speed of the source?`,
      `While ${setup.source} (rest frequency ${fStr}) ${motionVerb} ${setup.observer}, the detected frequency is ${fObsStr}. Given a sound speed of ${vStr}, calculate the speed of the moving source.`,
    ];
    const stem = pickOffset(stems, slotIndex, rng);
    const built = buildDistinctMcqOptions(
      sourceSpeedMs,
      "m s⁻¹",
      [
        {
          value: approxWrongSpeed,
          rationale:
            "Uses the low-speed / moving-observer relation v|f'/f − 1| instead of rearranging the exact moving-source formula f' = fv / (v ∓ v_s).",
        },
        {
          value: (waveSpeedMs * emittedFrequencyHz) / sol.observedFrequencyHz,
          rationale:
            "Stops at the effective denominator speed v(f / f') without taking the difference from v.",
        },
        {
          value: 0.5 * sourceSpeedMs,
          rationale:
            "Halves the source speed as if applying a two-way radar reflection formula.",
        },
      ],
      [
        {
          value: 2 * sourceSpeedMs,
          rationale: "Doubles the Doppler shift ratio.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "doppler-effect",
      templateArchetype: "doppler-moving-source-acoustic-shift",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        {
          name: "emittedFrequencyHz",
          value: emittedFrequencyHz,
          unit: "Hz",
          source: "stem",
        },
        {
          name: "waveSpeedMs",
          value: waveSpeedMs,
          unit: "m s⁻¹",
          source: "stem",
        },
        {
          name: "observedFrequencyHz",
          value: sol.observedFrequencyHz,
          unit: "Hz",
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Invert the exact moving-source acoustic Doppler equation to determine source speed",
        distractorStrategy: [
          "apply-moving-observer-linear-shift-relation",
          "stop-at-intermediate-denominator-speed",
          "apply-spurious-reflection-half-factor",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "sourceSpeedMs",
      workedSolution: `Rearranging f' = fv / (v ${sourceMotion === "towards-observer" ? "−" : "+"} v_s) gives v ${sourceMotion === "towards-observer" ? "−" : "+"} v_s = vf / f' = (${waveSpeedMs} × ${emittedFrequencyHz}) / ${fmtSig3(sol.observedFrequencyHz)}, yielding v_s = ${fmtQuantity(sourceSpeedMs, "m s⁻¹")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Solves f' = fv / (v ∓ v_s) for v_s = ${fmtQuantity(sourceSpeedMs, "m s⁻¹")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2
  const stems = [
    `In still air where the speed of sound is ${vStr}, ${setup.source} emits sound of constant frequency ${fStr} while it ${motionVerb} ${setup.observer} at a steady speed of ${vsStr}.`,
    `Figure shows wavefronts radiated at ${fStr} by ${setup.source} as it ${motionVerb} ${setup.observer} at constant speed ${vsStr} through still air (speed of sound ${vStr}).`,
    `During an outdoor acoustics trial (speed of sound in still air ${vStr}), ${setup.source} sounding continuously at ${fStr} ${motionVerb} ${setup.observer} at ${vsStr}.`,
    `Sound waves propagate at ${vStr} through calm air while ${setup.source}, emitting a steady ${fStr} signal, ${motionVerb} ${setup.observer} at speed ${vsStr}.`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Calculate the wavelength that the sound waves would have in still air if the source were stationary.",
      marks: 1,
      targetQuantityKey: "emittedWavelengthM",
      expectedAnswer: fmtQuantity(sol.emittedWavelengthM, "m"),
      workingSteps: [
        `λ₀ = v / f = ${waveSpeedMs} / ${emittedFrequencyHz} = ${fmtQuantity(sol.emittedWavelengthM, "m")}.`,
      ],
    },
    {
      partId: "b",
      prompt:
        "Calculate the wavelength λ′ of the sound waves in the air between the moving source and the stationary observer.",
      marks: 2,
      targetQuantityKey: "mediumWavelengthTowardsObserverM",
      expectedAnswer: fmtQuantity(sol.mediumWavelengthTowardsObserverM, "m"),
      workingSteps: [
        `λ′ = (v ${sourceMotion === "towards-observer" ? "−" : "+"} v_s) / f.`,
        `λ′ = (${waveSpeedMs} ${sourceMotion === "towards-observer" ? "−" : "+"} ${sourceSpeedMs}) / ${emittedFrequencyHz} = ${fmtQuantity(sol.mediumWavelengthTowardsObserverM, "m")}.`,
      ],
    },
    {
      partId: "c",
      prompt: "Determine the frequency detected by the stationary observer.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "observedFrequencyHz",
      expectedAnswer: fmtQuantity(sol.observedFrequencyHz, "Hz"),
      workingSteps: [
        "Use f′ = v / λ′.",
        `f′ = ${waveSpeedMs} / ${fmtSig3(sol.mediumWavelengthTowardsObserverM)} = ${fmtQuantity(sol.observedFrequencyHz, "Hz")}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "doppler-effect",
    templateArchetype: "doppler-moving-source-acoustic-shift",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      {
        name: "emittedFrequencyHz",
        value: emittedFrequencyHz,
        unit: "Hz",
        source: "stem",
      },
      { name: "waveSpeedMs", value: waveSpeedMs, unit: "m s⁻¹", source: "stem" },
      {
        name: "sourceSpeedMs",
        value: sourceSpeedMs,
        unit: "m s⁻¹",
        source: "stem",
      },
    ],
    questionPlan: {
      targetSummary:
        "Derive unshifted wavelength, Doppler-shifted medium wavelength, and observed frequency for a moving sound source",
      subpartStrategy: [
        "part (a): target emittedWavelengthM",
        "part (b): target mediumWavelengthTowardsObserverM",
        "part (c): target observedFrequencyHz",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) Unshifted wavelength λ₀ = v / f = ${fmtQuantity(sol.emittedWavelengthM, "m")}. (b) In the region towards the observer, λ′ = (v ${sourceMotion === "towards-observer" ? "−" : "+"} v_s) / f = ${fmtQuantity(sol.mediumWavelengthTowardsObserverM, "m")}. (c) Observed frequency f′ = v / λ′ = ${fmtQuantity(sol.observedFrequencyHz, "Hz")}.`,
    markScheme: [
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains λ₀ = ${fmtQuantity(sol.emittedWavelengthM, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: `Uses λ′ = (v ${sourceMotion === "towards-observer" ? "−" : "+"} v_s) / f.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains λ′ = ${fmtQuantity(sol.mediumWavelengthTowardsObserverM, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Applies f′ = v / λ′ or exact moving-source Doppler formula.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains f′ = ${fmtQuantity(sol.observedFrequencyHz, "Hz")}.`,
        marks: 1,
      },
    ],
    totalMarks: 5,
    generatorModel,
  };
}

function buildDopplerMovingObserver(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const setup = pickOffset(DOPPLER_SETUPS, slotIndex + 4, rng);
  // Exact moving-observer / dual-motion acoustic Doppler is strictly IB HL (C.5)
  const syllabi = resolveWavesSyllabiTags(
    "doppler-effect",
    format,
    "ib-hl-only",
    slotIndex,
  );

  const emittedFrequencyHz = pick(rng, [
    400, 460, 520, 580, 640, 700, 780, 860, 920,
  ]);
  const waveSpeedMs = pick(rng, [330, 336, 340, 343]);
  const isBothMoving = format === "structured" || slotIndex % 3 === 0;
  const isInverseObserverSpeed =
    format === "mcq" && !isBothMoving && slotIndex % 3 === 1;

  const observerMotion: ObserverMotionDirection =
    slotIndex % 2 === 0 ? "towards-source" : "away-from-source";
  const observerSpeedMs = isBothMoving
    ? pick(rng, [22, 26, 30, 34, 38, 42])
    : pick(rng, [56, 60, 64, 68, 72, 78]);

  const sourceMotion: SourceMotionDirection = isBothMoving
    ? slotIndex % 4 < 2
      ? "towards-observer"
      : "away-from-observer"
    : "stationary";
  const sourceSpeedMs = isBothMoving ? pick(rng, [28, 32, 36, 40, 45]) : 0;

  const hiddenQuantities = isInverseObserverSpeed
    ? [
        "observerSpeedMs",
        "observedPeriodS",
        "frequencyShiftHz",
        "fractionalFrequencyShift",
        "emittedWavelengthM",
        "mediumWavelengthTowardsObserverM",
        "relativeWaveSpeedAtObserverMs",
        "lowSpeedShiftApproximationHz",
      ]
    : [
        "observedFrequencyHz",
        "observedPeriodS",
        "frequencyShiftHz",
        "fractionalFrequencyShift",
        "emittedWavelengthM",
        "mediumWavelengthTowardsObserverM",
        "relativeWaveSpeedAtObserverMs",
        "lowSpeedShiftApproximationHz",
      ];

  const spec: DopplerEffectScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "doppler-effect",
    emittedFrequencyHz,
    waveSpeedMs,
    sourceSpeedMs,
    sourceMotion,
    observerSpeedMs,
    observerMotion,
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const fStr = fmtGivenScalar(emittedFrequencyHz, "Hz");
  const vStr = fmtGivenScalar(waveSpeedMs, "m s⁻¹");
  const voStr = fmtGivenScalar(observerSpeedMs, "m s⁻¹");
  const vsStr = fmtGivenScalar(sourceSpeedMs, "m s⁻¹");
  const fObsStr = `${fmtSig3(sol.observedFrequencyHz)} Hz`;

  const obsPhrase =
    observerMotion === "towards-source"
      ? "travels directly towards the source"
      : "travels directly away from the source";
  const srcPhrase =
    sourceMotion === "towards-observer"
      ? "moves towards the observer"
      : "moves away from the observer";

  if (format === "mcq") {
    if (isInverseObserverSpeed) {
      const movingSrcWrongSpeed =
        waveSpeedMs *
        Math.abs(1 - emittedFrequencyHz / sol.observedFrequencyHz);
      const stems = [
        `A stationary ${setup.source.replace(/^an?\s+/i, "")} radiates sound at ${fStr} in still air (speed of sound ${vStr}). Meanwhile, ${setup.movingObserver} ${obsPhrase} and measures a frequency of ${fObsStr}. What is the speed of the moving observer?`,
        `In still air where sound travels at ${vStr}, a fixed beacon (${setup.source}) emits ${fStr}. As ${setup.movingObserver} ${obsPhrase}, its microphone detects ${fObsStr}. Determine the observer's speed.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const built = buildDistinctMcqOptions(
        observerSpeedMs,
        "m s⁻¹",
        [
          {
            value: movingSrcWrongSpeed,
            rationale:
              "Applies the moving-source algebra v|1 − f / f'| instead of the moving-observer relation v|f' / f − 1|.",
          },
          {
            value: sol.relativeWaveSpeedAtObserverMs,
            rationale:
              "Computes the wave speed relative to the observer (v ± v_o) without subtracting the speed of sound v.",
          },
          {
            value: 0.5 * observerSpeedMs,
            rationale:
              "Divides the speed by 2 as if solving a two-way pulse-echo Doppler shift.",
          },
        ],
        [
          {
            value: 2 * observerSpeedMs,
            rationale: "Doubles the fractional Doppler shift.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "doppler-effect",
        templateArchetype: "doppler-moving-observer-relative-motion",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          {
            name: "emittedFrequencyHz",
            value: emittedFrequencyHz,
            unit: "Hz",
            source: "stem",
          },
          {
            name: "waveSpeedMs",
            value: waveSpeedMs,
            unit: "m s⁻¹",
            source: "stem",
          },
          {
            name: "observedFrequencyHz",
            value: sol.observedFrequencyHz,
            unit: "Hz",
            source: "stem",
          },
        ],
        questionPlan: {
          targetSummary:
            "Determine moving-observer speed from stationary-source frequency, sound speed, and detected frequency",
          distractorStrategy: [
            "use-moving-source-formula-instead-of-moving-observer",
            "report-relative-wavefront-speed-without-subtracting-v",
            "halve-doppler-shift",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "observerSpeedMs",
        workedSolution: `For a stationary source and moving observer, f′ = f(v ${observerMotion === "towards-source" ? "+" : "−"} v_o) / v. Rearranging gives v_o = v|f′ / f − 1| = ${waveSpeedMs} × |${fmtSig3(sol.observedFrequencyHz)} / ${emittedFrequencyHz} − 1| = ${fmtQuantity(observerSpeedMs, "m s⁻¹")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses f′ = f(v ± v_o) / v to obtain v_o = ${fmtQuantity(observerSpeedMs, "m s⁻¹")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (isBothMoving) {
      const stems = [
        `Along a straight test road (speed of sound ${vStr}), ${setup.source} emitting ${fStr} ${srcPhrase} at ${vsStr} while ${setup.movingObserver} ${obsPhrase} at ${voStr}. What acoustic frequency is detected by the observer?`,
        `Figure shows ${setup.source} (rest frequency ${fStr}) as it ${srcPhrase} at ${vsStr}, while ${setup.movingObserver} ${obsPhrase} at ${voStr} through air where sound travels at ${vStr}. Calculate the observed frequency.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);

      const voSign = observerMotion === "towards-source" ? 1 : -1;
      const vsSign = sourceMotion === "towards-observer" ? 1 : -1;
      const flipBoth =
        (emittedFrequencyHz * (waveSpeedMs - voSign * observerSpeedMs)) /
        (waveSpeedMs + vsSign * sourceSpeedMs);
      const flipObsOnly =
        (emittedFrequencyHz * (waveSpeedMs - voSign * observerSpeedMs)) /
        (waveSpeedMs - vsSign * sourceSpeedMs);
      const flipSrcOnly =
        (emittedFrequencyHz * (waveSpeedMs + voSign * observerSpeedMs)) /
        (waveSpeedMs + vsSign * sourceSpeedMs);

      const built = buildDistinctMcqOptions(
        sol.observedFrequencyHz,
        "Hz",
        [
          {
            value: flipBoth,
            rationale:
              "Reverses both numerator and denominator Doppler signs in f(v ± v_o) / (v ∓ v_s).",
          },
          {
            value: flipObsOnly,
            rationale:
              "Reverses the observer velocity sign in the numerator (v ∓ v_o instead of v ± v_o).",
          },
          {
            value: flipSrcOnly,
            rationale:
              "Reverses the source velocity sign in the denominator (v ± v_s instead of v ∓ v_s).",
          },
        ],
        [
          {
            value: emittedFrequencyHz,
            rationale: "Assumes source and observer motions cancel out.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "doppler-effect",
        templateArchetype: "doppler-moving-observer-relative-motion",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          {
            name: "emittedFrequencyHz",
            value: emittedFrequencyHz,
            unit: "Hz",
            source: "stem",
          },
          {
            name: "waveSpeedMs",
            value: waveSpeedMs,
            unit: "m s⁻¹",
            source: "stem",
          },
          {
            name: "sourceSpeedMs",
            value: sourceSpeedMs,
            unit: "m s⁻¹",
            source: "stem",
          },
          {
            name: "observerSpeedMs",
            value: observerSpeedMs,
            unit: "m s⁻¹",
            source: "stem",
          },
        ],
        questionPlan: {
          targetSummary:
            "Evaluate combined moving-source and moving-observer acoustic Doppler shift",
          distractorStrategy: [
            "invert-both-numerator-and-denominator-signs",
            "invert-observer-numerator-sign-only",
            "invert-source-denominator-sign-only",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "observedFrequencyHz",
        workedSolution: `Using f′ = f(v ${voSign > 0 ? "+" : "−"} v_o) / (v ${vsSign > 0 ? "−" : "+"} v_s) = ${emittedFrequencyHz} × (${waveSpeedMs} ${voSign > 0 ? "+" : "−"} ${observerSpeedMs}) / (${waveSpeedMs} ${vsSign > 0 ? "−" : "+"} ${sourceSpeedMs}) = ${fmtQuantity(sol.observedFrequencyHz, "Hz")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies dual-motion Doppler equation to obtain ${fmtQuantity(sol.observedFrequencyHz, "Hz")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Moving observer only (forward MCQ)
    const stems = [
      `A stationary ${setup.source.replace(/^an?\s+/i, "")} emits a steady ${fStr} note in still air (speed of sound ${vStr}). If ${setup.movingObserver} ${obsPhrase} at ${voStr}, what frequency does it detect?`,
      `Figure depicts wavefronts of frequency ${fStr} radiated by a stationary ${setup.source.replace(/^an?\s+/i, "")} while ${setup.movingObserver} ${obsPhrase} at ${voStr} (sound speed ${vStr}). Calculate the observed frequency.`,
    ];
    const stem = pickOffset(stems, slotIndex, rng);

    const voSign = observerMotion === "towards-source" ? 1 : -1;
    const wrongSignFreq =
      (emittedFrequencyHz * (waveSpeedMs - voSign * observerSpeedMs)) /
      waveSpeedMs;
    const movingSrcFormulaFreq =
      (emittedFrequencyHz * waveSpeedMs) /
      (waveSpeedMs - voSign * observerSpeedMs);
    const bothWrongFreq =
      (emittedFrequencyHz * waveSpeedMs) /
      (waveSpeedMs + voSign * observerSpeedMs);

    const built = buildDistinctMcqOptions(
      sol.observedFrequencyHz,
      "Hz",
      [
        {
          value: wrongSignFreq,
          rationale:
            "Inverts the observer Doppler sign in f(v ± v_o) / v.",
        },
        {
          value: movingSrcFormulaFreq,
          rationale:
            "Places observer speed in the denominator fv / (v ∓ v_o) as if the source were moving rather than the observer.",
        },
        {
          value: bothWrongFreq,
          rationale:
            "Uses the moving-source denominator formula AND reverses the Doppler sign.",
        },
      ],
      [
        {
          value: Math.abs(sol.frequencyShiftHz),
          rationale: "Computes |Δf| instead of observed frequency f′.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "doppler-effect",
      templateArchetype: "doppler-moving-observer-relative-motion",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        {
          name: "emittedFrequencyHz",
          value: emittedFrequencyHz,
          unit: "Hz",
          source: "stem",
        },
        {
          name: "waveSpeedMs",
          value: waveSpeedMs,
          unit: "m s⁻¹",
          source: "stem",
        },
        {
          name: "observerSpeedMs",
          value: observerSpeedMs,
          unit: "m s⁻¹",
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Calculate exact observed frequency for an observer moving relative to a stationary sound source",
        distractorStrategy: [
          "invert-observer-velocity-sign",
          "use-moving-source-denominator-formula",
          "use-denominator-formula-with-inverted-sign",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "observedFrequencyHz",
      workedSolution: `For a moving observer and stationary source, f′ = f(v ${voSign > 0 ? "+" : "−"} v_o) / v = ${emittedFrequencyHz} × (${waveSpeedMs} ${voSign > 0 ? "+" : "−"} ${observerSpeedMs}) / ${waveSpeedMs} = ${fmtQuantity(sol.observedFrequencyHz, "Hz")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates f′ = f(v ${voSign > 0 ? "+" : "−"} v_o) / v = ${fmtQuantity(sol.observedFrequencyHz, "Hz")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2 (both source & observer moving)
  const stems = [
    `Along a straight test track in still air (speed of sound ${vStr}), ${setup.source} emits sound at ${fStr} while it ${srcPhrase} at ${vsStr}. Simultaneously, ${setup.movingObserver} ${obsPhrase} at ${voStr}.`,
    `In calm air where acoustic waves travel at ${vStr}, ${setup.source} radiates a continuous ${fStr} tone as it ${srcPhrase} at ${vsStr}, while ${setup.movingObserver} ${obsPhrase} at ${voStr}.`,
    `Figure depicts ${setup.source} (rest frequency ${fStr}) as it ${srcPhrase} at ${vsStr} along a straight line; at the same instant, ${setup.movingObserver} ${obsPhrase} at ${voStr} (speed of sound ${vStr}).`,
    `During a straight-line Doppler measurement in still air (sound speed ${vStr}), ${setup.source} sounding at ${fStr} ${srcPhrase} at ${vsStr} while ${setup.movingObserver} ${obsPhrase} at ${voStr}.`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Calculate the wavelength of the sound waves in the air between the source and the observer.",
      marks: 2,
      targetQuantityKey: "mediumWavelengthTowardsObserverM",
      expectedAnswer: fmtQuantity(sol.mediumWavelengthTowardsObserverM, "m"),
      workingSteps: [
        `λ′ = (v ${sourceMotion === "towards-observer" ? "−" : "+"} v_s) / f.`,
        `λ′ = (${waveSpeedMs} ${sourceMotion === "towards-observer" ? "−" : "+"} ${sourceSpeedMs}) / ${emittedFrequencyHz} = ${fmtQuantity(sol.mediumWavelengthTowardsObserverM, "m")}.`,
      ],
    },
    {
      partId: "b",
      prompt:
        "Determine the speed of these sound wavefronts relative to the moving observer.",
      marks: 2,
      targetQuantityKey: "relativeWaveSpeedAtObserverMs",
      expectedAnswer: fmtQuantity(sol.relativeWaveSpeedAtObserverMs, "m s⁻¹"),
      workingSteps: [
        `v_rel = v ${observerMotion === "towards-source" ? "+" : "−"} v_o.`,
        `v_rel = ${waveSpeedMs} ${observerMotion === "towards-source" ? "+" : "−"} ${observerSpeedMs} = ${fmtQuantity(sol.relativeWaveSpeedAtObserverMs, "m s⁻¹")}.`,
      ],
    },
    {
      partId: "c",
      prompt: "Hence calculate the acoustic frequency detected by the observer.",
      marks: 2,
      dependsOnPartIds: ["a", "b"],
      targetQuantityKey: "observedFrequencyHz",
      expectedAnswer: fmtQuantity(sol.observedFrequencyHz, "Hz"),
      workingSteps: [
        "Use f′ = v_rel / λ′.",
        `f′ = ${fmtSig3(sol.relativeWaveSpeedAtObserverMs)} / ${fmtSig3(sol.mediumWavelengthTowardsObserverM)} = ${fmtQuantity(sol.observedFrequencyHz, "Hz")}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "doppler-effect",
    templateArchetype: "doppler-moving-observer-relative-motion",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      {
        name: "emittedFrequencyHz",
        value: emittedFrequencyHz,
        unit: "Hz",
        source: "stem",
      },
      { name: "waveSpeedMs", value: waveSpeedMs, unit: "m s⁻¹", source: "stem" },
      {
        name: "sourceSpeedMs",
        value: sourceSpeedMs,
        unit: "m s⁻¹",
        source: "stem",
      },
      {
        name: "observerSpeedMs",
        value: observerSpeedMs,
        unit: "m s⁻¹",
        source: "stem",
      },
    ],
    questionPlan: {
      targetSummary:
        "Combine Doppler-shifted medium wavelength and relative wavefront speed at a moving observer to determine observed frequency",
      subpartStrategy: [
        "part (a): target mediumWavelengthTowardsObserverM",
        "part (b): target relativeWaveSpeedAtObserverMs",
        "part (c): target observedFrequencyHz",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) λ′ = (v ${sourceMotion === "towards-observer" ? "−" : "+"} v_s) / f = ${fmtQuantity(sol.mediumWavelengthTowardsObserverM, "m")}. (b) v_rel = v ${observerMotion === "towards-source" ? "+" : "−"} v_o = ${fmtQuantity(sol.relativeWaveSpeedAtObserverMs, "m s⁻¹")}. (c) f′ = v_rel / λ′ = ${fmtQuantity(sol.observedFrequencyHz, "Hz")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Computes shifted wavelength in air ahead of/behind moving source.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains λ′ = ${fmtQuantity(sol.mediumWavelengthTowardsObserverM, "m")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Combines wave speed v and observer speed v_o with correct relative sign.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains v_rel = ${fmtQuantity(sol.relativeWaveSpeedAtObserverMs, "m s⁻¹")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Divides relative wave speed from (b) by wavelength from (a).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains f′ = ${fmtQuantity(sol.observedFrequencyHz, "Hz")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

function buildMalusPolarizedTransmission(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const benchDesc = pickOffset(MALUS_SETUPS, slotIndex, rng);
  // Avoid 0°, 45°, 90° so cos²θ != sin²θ != cos θ != ½ cos²θ!
  const analyzerAngleDegrees = pick(rng, [
    20, 25, 30, 35, 40, 50, 55, 60, 65, 70,
  ]);
  const incidentIntensityWm2 = pick(rng, [
    24, 32, 48, 72, 84, 96, 120, 144, 160, 180, 240,
  ]);

  const isInverseAngle = format === "mcq" && slotIndex % 2 === 1;
  // Unprompted forward Malus MCQ -> ncuk-only (NCUK Data Booklet prints I = I_0 cos²θ);
  // Inverse angle & Structured (supplying Malus's law in stem) -> alevel-ncuk (never IB 2025!).
  const policy: WavesSyllabusScopePolicy =
    format === "mcq" && !isInverseAngle ? "ncuk-only" : "alevel-ncuk";
  const syllabi = resolveWavesSyllabiTags(
    "progressive-waves-polarization",
    format,
    policy,
    slotIndex,
  );

  const hiddenQuantities = isInverseAngle
    ? [
        "analyzerAngleDegrees",
        "cosThetaSquared",
        "amplitudeTransmissionFactor",
        "overallTransmissionFraction",
        "absorbedIntensityAtAnalyzerWm2",
      ]
    : [
        "transmittedIntensityWm2",
        "cosThetaSquared",
        "amplitudeTransmissionFactor",
        "overallTransmissionFraction",
        "absorbedIntensityAtAnalyzerWm2",
      ];

  const spec: MalusPolarizationScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "malus-polarization",
    incidentIntensityWm2,
    analyzerAngleDegrees,
    incidentPolarization: "polarized",
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const i0Str = fmtGivenScalar(incidentIntensityWm2, "W m⁻²");
  const angStr = `${analyzerAngleDegrees}°`;
  const iTransStr = `${fmtSig3(sol.transmittedIntensityWm2)} W m⁻²`;

  if (format === "mcq") {
    if (!isInverseAngle) {
      const stems = [
        `On ${benchDesc}, a vertically plane-polarized beam of intensity ${i0Str} is incident normally on an ideal linear analyzer whose transmission axis is rotated by ${angStr} from the vertical. What is the transmitted intensity?`,
        `Figure shows plane-polarized light of intensity ${i0Str} entering an ideal analyzer set at an angle of ${angStr} to the incident electric-field plane on ${benchDesc}. Calculate the emerging beam intensity.`,
        `During a calibration on ${benchDesc}, plane-polarized radiation of intensity ${i0Str} strikes an analyzer tilted at θ = ${angStr} relative to the incident polarization axis. Determine the transmitted intensity.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const sinSq = 1 - sol.cosThetaSquared;
      const built = buildDistinctMcqOptions(
        sol.transmittedIntensityWm2,
        "W m⁻²",
        [
          {
            value: incidentIntensityWm2 * sol.amplitudeTransmissionFactor,
            rationale:
              "Uses I₀ cos θ (electric-field amplitude projection) instead of Malus's intensity law I₀ cos²θ.",
          },
          {
            value: 0.5 * sol.transmittedIntensityWm2,
            rationale:
              "Mistakenly applies the ½ unpolarized-light factor to a beam that is already plane-polarized.",
          },
          {
            value: incidentIntensityWm2 * sinSq,
            rationale:
              "Uses I₀ sin²θ (measuring the complement angle to the extinction axis instead of the transmission axis).",
          },
        ],
        [
          {
            value: 0.5 * incidentIntensityWm2,
            rationale:
              "Assumes an ideal polarizer always transmits half of any incident beam regardless of polarization angle.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "progressive-waves-polarization",
        templateArchetype: "malus-polarized-analyzer-transmission",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          {
            name: "incidentIntensityWm2",
            value: incidentIntensityWm2,
            unit: "W m⁻²",
            source: "stem",
          },
          {
            name: "analyzerAngleDegrees",
            value: analyzerAngleDegrees,
            unit: "°",
            source: "stem",
          },
        ],
        questionPlan: {
          targetSummary:
            "Apply Malus cosine-squared law to plane-polarized light entering an angled analyzer",
          distractorStrategy: [
            "use-cosine-instead-of-cosine-squared",
            "apply-unpolarized-one-half-factor-to-polarized-beam",
            "use-sine-squared-complement-angle",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "transmittedIntensityWm2",
        workedSolution: `Because the incident beam is already plane-polarized, Malus's law gives I = I₀ cos²θ = ${incidentIntensityWm2} × cos²(${analyzerAngleDegrees}°) = ${incidentIntensityWm2} × ${fmtSig3(sol.cosThetaSquared)} = ${fmtQuantity(sol.transmittedIntensityWm2, "W m⁻²")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies I = I₀ cos²(${analyzerAngleDegrees}°) = ${fmtQuantity(sol.transmittedIntensityWm2, "W m⁻²")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Inverse MCQ: find analyzerAngleDegrees (Malus's law supplied in stem for A-Level + NCUK)
    const ratio = sol.transmittedIntensityWm2 / incidentIntensityWm2;
    const forgotSqrtDeg = (Math.acos(ratio) * 180) / Math.PI;
    const complementDeg = 90 - analyzerAngleDegrees;
    const arcsinRatioDeg = (Math.asin(ratio) * 180) / Math.PI;

    const stems = [
      `On ${benchDesc}, a plane-polarized beam of intensity ${i0Str} passes through an ideal linear analyzer, emerging with reduced intensity ${iTransStr} (Malus's law: I = I₀ cos²θ). What acute angle θ is the analyzer's transmission axis rotated relative to the incident polarization?`,
      `To attenuate a plane-polarized beam from ${i0Str} down to ${iTransStr} on ${benchDesc}, an ideal analyzer is rotated through an acute angle θ from alignment (I = I₀ cos²θ). Determine θ.`,
    ];
    const stem = pickOffset(stems, slotIndex, rng);
    const built = buildDistinctMcqOptions(
      analyzerAngleDegrees,
      "°",
      [
        {
          value: forgotSqrtDeg,
          rationale:
            "Forgets to take the square root of I / I₀ before taking arccos, solving cos θ = I / I₀ instead of cos²θ = I / I₀.",
        },
        {
          value: complementDeg,
          rationale:
            "Computes the complement angle 90° − θ (using arcsin √(I / I₀) instead of arccos √(I / I₀)).",
        },
        {
          value: arcsinRatioDeg,
          rationale:
            "Both omits the square root and uses arcsin(I / I₀).",
        },
      ],
      [
        {
          value: 0.5 * forgotSqrtDeg,
          rationale: "Halves arccos(I / I₀) instead of taking arccos √(I / I₀).",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "progressive-waves-polarization",
      templateArchetype: "malus-polarized-analyzer-transmission",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        {
          name: "incidentIntensityWm2",
          value: incidentIntensityWm2,
          unit: "W m⁻²",
          source: "stem",
        },
        {
          name: "transmittedIntensityWm2",
          value: sol.transmittedIntensityWm2,
          unit: "W m⁻²",
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Invert Malus's law to find the acute analyzer rotation angle from incident and transmitted intensities",
        distractorStrategy: [
          "omit-square-root-before-inverse-cosine",
          "compute-complement-angle-via-inverse-sine",
          "omit-square-root-and-use-inverse-sine",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "analyzerAngleDegrees",
      workedSolution: `From I = I₀ cos²θ, cos θ = √(${fmtSig3(sol.transmittedIntensityWm2)} / ${incidentIntensityWm2}) = ${fmtSig3(sol.amplitudeTransmissionFactor)}, giving θ = arccos(${fmtSig3(sol.amplitudeTransmissionFactor)}) = ${fmtQuantity(analyzerAngleDegrees, "°")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Evaluates θ = arccos √(I / I₀) = ${fmtQuantity(analyzerAngleDegrees, "°")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2
  const stems = [
    `On ${benchDesc}, a vertically plane-polarized beam of intensity ${i0Str} is incident normally on an ideal linear analyzer whose transmission axis makes an angle θ = ${angStr} with the vertical (for plane-polarized light, Malus's law gives transmitted intensity I = I₀ cos²θ).`,
    `Figure shows vertically polarized radiation of intensity ${i0Str} entering an ideal analyzer rotated through θ = ${angStr} from alignment on ${benchDesc} (for plane-polarized light, I = I₀ cos²θ).`,
    `During an optics experiment using ${benchDesc}, a linearly polarized beam of intensity ${i0Str} strikes an ideal analyzer tilted at angle θ = ${angStr} to the incident electric-field plane (transmitted intensity obeys I = I₀ cos²θ).`,
    `Linearly polarized waves of intensity ${i0Str} on ${benchDesc} pass normally through an ideal analyzer oriented at θ = ${angStr} relative to the incident polarization axis (where I = I₀ cos²θ).`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Calculate the ratio E / E₀ of the transmitted electric-field amplitude to the incident electric-field amplitude.",
      marks: 2,
      targetQuantityKey: "amplitudeTransmissionFactor",
      expectedAnswer: fmtQuantity(sol.amplitudeTransmissionFactor, ""),
      workingSteps: [
        "Only the electric-field component parallel to the analyzer axis is transmitted: E / E₀ = cos θ.",
        `cos(${analyzerAngleDegrees}°) = ${fmtSig3(sol.amplitudeTransmissionFactor)}.`,
      ],
    },
    {
      partId: "b",
      prompt: "Calculate the intensity I of the beam emerging from the analyzer.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "transmittedIntensityWm2",
      expectedAnswer: fmtQuantity(sol.transmittedIntensityWm2, "W m⁻²"),
      workingSteps: [
        "Use I = I₀ cos²θ.",
        `I = ${incidentIntensityWm2} × cos²(${analyzerAngleDegrees}°) = ${fmtQuantity(sol.transmittedIntensityWm2, "W m⁻²")}.`,
      ],
    },
    {
      partId: "c",
      prompt:
        "Determine the intensity removed (absorbed or rejected) from the beam by the analyzer.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "absorbedIntensityAtAnalyzerWm2",
      expectedAnswer: fmtQuantity(sol.absorbedIntensityAtAnalyzerWm2, "W m⁻²"),
      workingSteps: [
        "I_abs = I₀ − I.",
        `I_abs = ${incidentIntensityWm2} − ${fmtSig3(sol.transmittedIntensityWm2)} = ${fmtQuantity(sol.absorbedIntensityAtAnalyzerWm2, "W m⁻²")}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "progressive-waves-polarization",
    templateArchetype: "malus-polarized-analyzer-transmission",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      {
        name: "incidentIntensityWm2",
        value: incidentIntensityWm2,
        unit: "W m⁻²",
        source: "stem",
      },
      {
        name: "analyzerAngleDegrees",
        value: analyzerAngleDegrees,
        unit: "°",
        source: "stem",
      },
    ],
    questionPlan: {
      targetSummary:
        "Evaluate electric-field amplitude projection, transmitted Malus intensity, and absorbed intensity at a linear analyzer",
      subpartStrategy: [
        "part (a): target amplitudeTransmissionFactor",
        "part (b): target transmittedIntensityWm2",
        "part (c): target absorbedIntensityAtAnalyzerWm2",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) E / E₀ = cos(${analyzerAngleDegrees}°) = ${fmtSig3(sol.amplitudeTransmissionFactor)}. (b) I = I₀ cos²(${analyzerAngleDegrees}°) = ${fmtQuantity(sol.transmittedIntensityWm2, "W m⁻²")}. (c) Absorbed intensity = ${incidentIntensityWm2} − ${fmtSig3(sol.transmittedIntensityWm2)} = ${fmtQuantity(sol.absorbedIntensityAtAnalyzerWm2, "W m⁻²")}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Projects electric-field vector via E / E₀ = cos θ.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains ${fmtSig3(sol.amplitudeTransmissionFactor)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies I = I₀ cos²θ.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains I = ${fmtQuantity(sol.transmittedIntensityWm2, "W m⁻²")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Subtracts transmitted intensity from incident intensity.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains ${fmtQuantity(sol.absorbedIntensityAtAnalyzerWm2, "W m⁻²")}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

function buildMalusUnpolarizedChain(
  id: string,
  seed: number,
  slotIndex: number,
  format: QuestionFormat,
  difficulty: QuestionDifficulty,
  rng: () => number,
  generatorModel: string,
): CandidateQuestionInput | undefined {
  const benchDesc = pickOffset(MALUS_SETUPS, slotIndex + 5, rng);
  // Avoid 45° (cos²=sin²) and 60° (½ cos 60° = cos²60° = 0.25!) so all 4 options stay 100% distinct!
  const analyzerAngleDegrees = pick(rng, [20, 25, 30, 35, 40, 50, 55, 65, 70]);
  const incidentIntensityWm2 = pick(rng, [
    36, 48, 64, 80, 96, 112, 128, 160, 192, 220, 260,
  ]);

  // Supplying I = I₁ cos²θ for plane-polarized light makes this valid on A-Level + NCUK while still testing the ½ unpolarized factor!
  const syllabi = resolveWavesSyllabiTags(
    "progressive-waves-polarization",
    format,
    "alevel-ncuk",
    slotIndex,
  );

  const isInverseIncident = format === "mcq" && slotIndex % 2 === 1;
  // CRITICAL: Always include "intensityBeforeAnalyzerWm2" in hiddenQuantities so SVG never prints I₁ = ½ I₀!
  const hiddenQuantities = isInverseIncident
    ? [
        "incidentIntensityWm2",
        "intensityBeforeAnalyzerWm2",
        "cosThetaSquared",
        "amplitudeTransmissionFactor",
        "overallTransmissionFraction",
        "absorbedIntensityAtAnalyzerWm2",
      ]
    : [
        "intensityBeforeAnalyzerWm2",
        "transmittedIntensityWm2",
        "cosThetaSquared",
        "amplitudeTransmissionFactor",
        "overallTransmissionFraction",
        "absorbedIntensityAtAnalyzerWm2",
      ];

  const spec: MalusPolarizationScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id,
    kind: "malus-polarization",
    incidentIntensityWm2,
    analyzerAngleDegrees,
    incidentPolarization: "unpolarized",
    hiddenQuantities,
  };
  const sol = solveWavesScenario(spec);

  const i0Str = fmtGivenScalar(incidentIntensityWm2, "W m⁻²");
  const angStr = `${analyzerAngleDegrees}°`;
  const iTransStr = `${fmtSig3(sol.transmittedIntensityWm2)} W m⁻²`;

  if (format === "mcq") {
    if (!isInverseIncident) {
      const stems = [
        `Unpolarized light of intensity ${i0Str} enters ${benchDesc}, passing first through an ideal vertical polarizer P₁ and then through an ideal analyzer A whose axis is rotated by ${angStr} to P₁ (for plane-polarized light of intensity I₁, analyzer transmission is I = I₁ cos²θ). What intensity emerges from analyzer A?`,
        `Figure shows unpolarized radiation of intensity ${i0Str} on ${benchDesc} passing sequentially through polarizer P₁ and analyzer A inclined at θ = ${angStr} relative to P₁ (Malus's law for polarized light: I = I₁ cos²θ). Calculate the final transmitted intensity.`,
        `In a two-filter test on ${benchDesc}, an unpolarized beam of intensity ${i0Str} traverses ideal polarizer P₁ followed by analyzer A angled at ${angStr} to P₁'s axis (I = I₁ cos²θ for plane-polarized light). Determine the emerging intensity.`,
      ];
      const stem = pickOffset(stems, slotIndex, rng);
      const sinSq = 1 - sol.cosThetaSquared;
      const built = buildDistinctMcqOptions(
        sol.transmittedIntensityWm2,
        "W m⁻²",
        [
          {
            value: incidentIntensityWm2 * sol.cosThetaSquared,
            rationale:
              "Forgets the factor of ½ at polarizer P₁ for unpolarized incident light, computing I₀ cos²θ instead of ½ I₀ cos²θ.",
          },
          {
            value: 0.5 * incidentIntensityWm2 * sol.amplitudeTransmissionFactor,
            rationale:
              "Applies the ½ factor at P₁ correctly but uses cos θ instead of cos²θ at analyzer A.",
          },
          {
            value: 0.5 * incidentIntensityWm2 * sinSq,
            rationale:
              "Uses ½ I₀ sin²θ (complement angle) instead of ½ I₀ cos²θ.",
          },
        ],
        [
          {
            value: 0.25 * incidentIntensityWm2 * sol.cosThetaSquared,
            rationale:
              "Applies an extra ½ factor at analyzer A in addition to cos²θ.",
          },
        ],
      );
      if (!built) return undefined;

      return {
        id,
        conceptId: "progressive-waves-polarization",
        templateArchetype: "malus-unpolarized-two-filter-chain",
        seed,
        syllabi,
        format: "mcq",
        difficulty,
        domain: "waves",
        scenarioSpec: spec as unknown as Record<string, unknown>,
        hiddenQuantities,
        requiredGivens: [
          {
            name: "incidentIntensityWm2",
            value: incidentIntensityWm2,
            unit: "W m⁻²",
            source: "stem",
          },
          {
            name: "analyzerAngleDegrees",
            value: analyzerAngleDegrees,
            unit: "°",
            source: "stem",
          },
        ],
        questionPlan: {
          targetSummary:
            "Compute transmitted intensity of initially unpolarized light passing through a polarizer-analyzer pair",
          distractorStrategy: [
            "omit-half-intensity-reduction-on-unpolarized-light",
            "use-cosine-instead-of-cosine-squared-at-analyzer",
            "use-sine-squared-complement-angle",
          ],
        },
        stem,
        options: built.options,
        targetQuantityKey: "transmittedIntensityWm2",
        workedSolution: `Ideal polarizer P₁ transmits half of the unpolarized intensity: I₁ = ½ I₀ = ${fmtSig3(sol.intensityBeforeAnalyzerWm2)} W m⁻². Analyzer A then transmits I = I₁ cos²(${analyzerAngleDegrees}°) = ½(${incidentIntensityWm2}) cos²(${analyzerAngleDegrees}°) = ${fmtQuantity(sol.transmittedIntensityWm2, "W m⁻²")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies I = ½ I₀ cos²(${analyzerAngleDegrees}°) = ${fmtQuantity(sol.transmittedIntensityWm2, "W m⁻²")} (${built.correctLabel}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Inverse MCQ: given final transmitted intensity I and angle θ -> find initial unpolarized I_0
    const stems = [
      `An unpolarized beam of unknown intensity I₀ passes sequentially through ideal polarizer P₁ and analyzer A (oriented at ${angStr} to P₁) on ${benchDesc}. If the final emerging intensity is ${iTransStr} (where polarized transmission obeys I = I₁ cos²θ), what is the incident unpolarized intensity I₀?`,
      `On ${benchDesc}, unpolarized light traverses ideal polarizer P₁ and analyzer A tilted at θ = ${angStr} relative to P₁, yielding a transmitted intensity of ${iTransStr} (I = I₁ cos²θ for plane-polarized light). Calculate the initial unpolarized intensity I₀.`,
    ];
    const stem = pickOffset(stems, slotIndex, rng);
    const built = buildDistinctMcqOptions(
      incidentIntensityWm2,
      "W m⁻²",
      [
        {
          value: sol.transmittedIntensityWm2 / sol.cosThetaSquared,
          rationale:
            "Forgets the ½ intensity reduction at polarizer P₁, computing I / cos²θ instead of 2I / cos²θ.",
        },
        {
          value:
            (2 * sol.transmittedIntensityWm2) / sol.amplitudeTransmissionFactor,
          rationale:
            "Divides 2I by cos θ instead of cos²θ when inverting Malus's law.",
        },
        {
          value: (0.5 * sol.transmittedIntensityWm2) / sol.cosThetaSquared,
          rationale:
            "Multiplies I / cos²θ by ½ instead of 2 when inverting I₁ = ½ I₀.",
        },
      ],
      [
        {
          value: (2 * sol.transmittedIntensityWm2) / (1 - sol.cosThetaSquared),
          rationale: "Uses sin²θ instead of cos²θ.",
        },
      ],
    );
    if (!built) return undefined;

    return {
      id,
      conceptId: "progressive-waves-polarization",
      templateArchetype: "malus-unpolarized-two-filter-chain",
      seed,
      syllabi,
      format: "mcq",
      difficulty,
      domain: "waves",
      scenarioSpec: spec as unknown as Record<string, unknown>,
      hiddenQuantities,
      requiredGivens: [
        {
          name: "analyzerAngleDegrees",
          value: analyzerAngleDegrees,
          unit: "°",
          source: "stem",
        },
        {
          name: "transmittedIntensityWm2",
          value: sol.transmittedIntensityWm2,
          unit: "W m⁻²",
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Invert two-stage unpolarized polarizer-analyzer transmission to find incident unpolarized intensity",
        distractorStrategy: [
          "forget-factor-of-two-from-first-polarizer",
          "divide-by-cosine-instead-of-cosine-squared",
          "multiply-by-one-half-instead-of-two",
        ],
      },
      stem,
      options: built.options,
      targetQuantityKey: "incidentIntensityWm2",
      workedSolution: `Since I = ½ I₀ cos²θ, rearranging gives I₀ = 2I / cos²(${analyzerAngleDegrees}°) = (2 × ${fmtSig3(sol.transmittedIntensityWm2)}) / ${fmtSig3(sol.cosThetaSquared)} = ${fmtQuantity(incidentIntensityWm2, "W m⁻²")}.`,
      markScheme: [
        {
          code: "A1",
          criterion: `Solves I = ½ I₀ cos²θ to obtain I₀ = ${fmtQuantity(incidentIntensityWm2, "W m⁻²")} (${built.correctLabel}).`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured 3-part Paper 2
  const stems = [
    `An unpolarized beam of intensity ${i0Str} on ${benchDesc} passes normally through an ideal vertical polarizer P₁ and then through an ideal linear analyzer A whose transmission axis is rotated by θ = ${angStr} from the vertical (for plane-polarized light of intensity I₁, analyzer transmission obeys I = I₁ cos²θ).`,
    `Figure shows unpolarized radiation of intensity ${i0Str} entering ${benchDesc}, traversing ideal vertical polarizer P₁ followed by linear analyzer A inclined at θ = ${angStr} relative to P₁ (Malus's law for polarized light: I = I₁ cos²θ).`,
    `In a polarization experiment with ${benchDesc}, unpolarized waves of intensity ${i0Str} strike ideal polarizer P₁ and subsequently pass through analyzer A oriented at angle θ = ${angStr} to P₁ (for plane-polarized light, I = I₁ cos²θ).`,
    `Unpolarized light of intensity ${i0Str} propagates along ${benchDesc} through an ideal vertical polarizing sheet P₁ and a second sheet A whose axis makes θ = ${angStr} with P₁ (polarized transmission obeys I = I₁ cos²θ).`,
  ];
  const stem = pickOffset(stems, slotIndex, rng);

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "State and calculate the intensity I₁ of the plane-polarized beam between polarizer P₁ and analyzer A.",
      marks: 2,
      targetQuantityKey: "intensityBeforeAnalyzerWm2",
      expectedAnswer: fmtQuantity(sol.intensityBeforeAnalyzerWm2, "W m⁻²"),
      workingSteps: [
        "Averaging cos²φ = ½ over all random polarization orientations reduces unpolarized intensity by half: I₁ = ½ I₀.",
        `I₁ = 0.5 × ${incidentIntensityWm2} = ${fmtQuantity(sol.intensityBeforeAnalyzerWm2, "W m⁻²")}.`,
      ],
    },
    {
      partId: "b",
      prompt: "Calculate the intensity I emerging from analyzer A.",
      marks: 2,
      dependsOnPartIds: ["a"],
      targetQuantityKey: "transmittedIntensityWm2",
      expectedAnswer: fmtQuantity(sol.transmittedIntensityWm2, "W m⁻²"),
      workingSteps: [
        "Apply Malus's law I = I₁ cos²θ.",
        `I = ${fmtSig3(sol.intensityBeforeAnalyzerWm2)} × cos²(${analyzerAngleDegrees}°) = ${fmtQuantity(sol.transmittedIntensityWm2, "W m⁻²")}.`,
      ],
    },
    {
      partId: "c",
      prompt:
        "Determine the overall fraction I / I₀ of the original unpolarized intensity transmitted by the two-filter combination.",
      marks: 2,
      dependsOnPartIds: ["b"],
      targetQuantityKey: "overallTransmissionFraction",
      expectedAnswer: fmtQuantity(sol.overallTransmissionFraction, ""),
      workingSteps: [
        "Overall transmission fraction = I / I₀ = ½ cos²θ.",
        `I / I₀ = ${fmtSig3(sol.transmittedIntensityWm2)} / ${incidentIntensityWm2} = ${fmtSig3(sol.overallTransmissionFraction)}.`,
      ],
    },
  ];

  return {
    id,
    conceptId: "progressive-waves-polarization",
    templateArchetype: "malus-unpolarized-two-filter-chain",
    seed,
    syllabi,
    format: "structured",
    difficulty,
    domain: "waves",
    scenarioSpec: spec as unknown as Record<string, unknown>,
    hiddenQuantities,
    requiredGivens: [
      {
        name: "incidentIntensityWm2",
        value: incidentIntensityWm2,
        unit: "W m⁻²",
        source: "stem",
      },
      {
        name: "analyzerAngleDegrees",
        value: analyzerAngleDegrees,
        unit: "°",
        source: "stem",
      },
    ],
    questionPlan: {
      targetSummary:
        "Track unpolarized light through a two-filter polarizer-analyzer system across intermediate intensity, final intensity, and overall transmission fraction",
      subpartStrategy: [
        "part (a): target intensityBeforeAnalyzerWm2",
        "part (b): target transmittedIntensityWm2",
        "part (c): target overallTransmissionFraction",
      ],
    },
    stem,
    parts,
    workedSolution: `(a) After P₁, I₁ = ½ I₀ = ${fmtQuantity(sol.intensityBeforeAnalyzerWm2, "W m⁻²")}. (b) After analyzer A, I = I₁ cos²(${analyzerAngleDegrees}°) = ${fmtQuantity(sol.transmittedIntensityWm2, "W m⁻²")}. (c) Overall fraction I / I₀ = ½ cos²(${analyzerAngleDegrees}°) = ${fmtSig3(sol.overallTransmissionFraction)}.`,
    markScheme: [
      {
        code: "M1",
        partId: "a",
        criterion: "Halves unpolarized incident intensity at ideal polarizer P₁.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains I₁ = ${fmtQuantity(sol.intensityBeforeAnalyzerWm2, "W m⁻²")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion: "Applies I = I₁ cos²θ to the polarized beam.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains I = ${fmtQuantity(sol.transmittedIntensityWm2, "W m⁻²")}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: "Divides final transmitted intensity by incident unpolarized intensity I₀.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains ${fmtSig3(sol.overallTransmissionFraction)}.`,
        marks: 1,
      },
    ],
    totalMarks: 6,
    generatorModel,
  };
}

const ARCHETYPE_BUILDER_MAP: Readonly<
  Record<WavesTemplateArchetype, ArchetypeBuilder>
> = {
  "progressive-spatial-profile-wave-speed": buildProgressiveSpatialWaveSpeed,
  "progressive-temporal-phase-difference": buildProgressiveTemporalPhaseDiff,
  "standing-string-harmonic-kinematics": buildStandingStringKinematics,
  "standing-string-tension-linear-density": buildStandingStringTensionDensity,
  "standing-open-pipe-harmonics": buildStandingOpenPipeHarmonics,
  "standing-closed-pipe-odd-harmonics": buildStandingClosedPipeOddHarmonics,
  "double-slit-fringe-spacing-wavelength": buildDoubleSlitFringeSpacing,
  "double-slit-off-axis-orders-path-diff": buildDoubleSlitOffAxisOrders,
  "double-slit-envelope-missing-orders": buildDoubleSlitEnvelopeMissingOrders,
  "grating-lines-per-mm-diffraction-angle": buildGratingLinesPerMmAngle,
  "grating-max-observable-order-count": buildGratingMaxObservableOrder,
  "single-slit-central-maximum-width": buildSingleSlitCentralMaxWidth,
  "doppler-moving-source-acoustic-shift": buildDopplerMovingSource,
  "doppler-moving-observer-relative-motion": buildDopplerMovingObserver,
  "malus-polarized-analyzer-transmission": buildMalusPolarizedTransmission,
  "malus-unpolarized-two-filter-chain": buildMalusUnpolarizedChain,
};

function computeArchetypeQuotas(
  descriptors: readonly WavesArchetypeDescriptor[],
  totalCount: number | undefined,
  mcqFraction: number | undefined,
): Array<{
  descriptor: WavesArchetypeDescriptor;
  mcqCount: number;
  structuredCount: number;
}> {
  if (totalCount === undefined && mcqFraction === undefined) {
    return descriptors.map((descriptor) => ({
      descriptor,
      mcqCount: descriptor.defaultMcqCount,
      structuredCount: descriptor.defaultStructuredCount,
    }));
  }

  const defaultSum = descriptors.reduce(
    (acc, d) => acc + d.defaultMcqCount + d.defaultStructuredCount,
    0,
  );
  const targetTotal = totalCount ?? defaultSum;
  const targetMcqRatio = mcqFraction ?? 213 / 327;

  if (!Number.isInteger(targetTotal) || targetTotal < 0) {
    throw new Error(
      `count must be a non-negative integer; received ${String(totalCount)}`,
    );
  }
  if (
    !Number.isFinite(targetMcqRatio) ||
    targetMcqRatio < 0 ||
    targetMcqRatio > 1
  ) {
    throw new Error(
      `mcqFraction must lie in [0, 1]; received ${String(mcqFraction)}`,
    );
  }
  if (targetTotal === 0 || descriptors.length === 0) {
    return [];
  }

  const totalMcqTarget = Math.round(targetTotal * targetMcqRatio);
  const totalStructTarget = targetTotal - totalMcqTarget;

  const k = descriptors.length;
  const baseMcq = Math.floor(totalMcqTarget / k);
  const remMcq = totalMcqTarget % k;
  const baseStruct = Math.floor(totalStructTarget / k);
  const remStruct = totalStructTarget % k;

  return descriptors.map((descriptor, idx) => ({
    descriptor,
    mcqCount: baseMcq + (idx < remMcq ? 1 : 0),
    structuredCount: baseStruct + (idx < remStruct ? 1 : 0),
  }));
}

function serializeCoreScenarioKey(spec: WavesScenarioSpec, target: string): string {
  const { id, title, hiddenQuantities, visibility, customLabels, ...core } =
    spec;
  void id;
  void title;
  void hiddenQuantities;
  void visibility;
  void customLabels;
  return `${JSON.stringify(core)}::${target}`;
}

function jaccardSetSimilarity(
  setA: ReadonlySet<string>,
  setB: ReadonlySet<string>,
): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Deterministically generates solver- and gate-verified `waves` question packages
 * spanning 16 `(conceptId, templateArchetype)` family groups across all 7
 * `lib/visuals/waves` scenario families and IB (SL/HL), UK A-Level (Y12/Y13),
 * and NCUK (IFY) syllabi.
 */
export function generateWavesCandidates(
  options: WavesGeneratorOptions = {},
): CandidateQuestionInput[] {
  const baseSeed = options.seed ?? 20260601;
  if (!Number.isInteger(baseSeed)) {
    throw new Error(
      `seed must be an integer; received ${String(options.seed)}`,
    );
  }

  const generatorModel = options.generatorModel?.trim() || "gemini-4-carbon-high";
  const similarityCap = options.nearDuplicateSimilarityThreshold ?? 0.85;

  const activeDescriptors = options.archetypes
    ? WAVES_ARCHETYPE_CATALOGUE.filter((d) =>
        options.archetypes!.includes(d.templateArchetype),
      )
    : WAVES_ARCHETYPE_CATALOGUE;

  const quotas = computeArchetypeQuotas(
    activeDescriptors,
    options.count,
    options.mcqFraction,
  );

  const candidates: CandidateQuestionInput[] = [];
  const existingStemProfiles: Array<{
    fp: string;
    shingles: Set<string>;
  }> = [];
  const seenScenarioFingerprints = new Set<string>();
  let globalSeq = 1;

  for (let archIdx = 0; archIdx < quotas.length; archIdx += 1) {
    const { descriptor, mcqCount, structuredCount } = quotas[archIdx];
    const builder = ARCHETYPE_BUILDER_MAP[descriptor.templateArchetype];

    const formatsToBuild: QuestionFormat[] = [
      ...Array.from({ length: mcqCount }, () => "mcq" as const),
      ...Array.from({ length: structuredCount }, () => "structured" as const),
    ];

    for (let localIdx = 0; localIdx < formatsToBuild.length; localIdx += 1) {
      const format = formatsToBuild[localIdx];
      const itemSeed = baseSeed + archIdx * 1000 + localIdx * 17 + 1;
      const seqStr = String(globalSeq).padStart(3, "0");
      const id = `waves-${descriptor.scenarioKind}-${format}-${seqStr}`;
      const difficulty = selectDifficulty(globalSeq - 1);

      let accepted: CandidateQuestionInput | undefined;
      let acceptedFp = "";
      let acceptedShingles: Set<string> | undefined;

      for (let attempt = 0; attempt < 120; attempt += 1) {
        const attemptRng = createSeededRng(itemSeed + attempt * 7919);
        const slotCursor = localIdx + attempt;
        const draft = builder(
          id,
          itemSeed,
          slotCursor,
          format,
          difficulty,
          attemptRng,
          generatorModel,
        );
        if (!draft) continue;

        const targetSignature =
          draft.format === "mcq"
            ? draft.targetQuantityKey ?? "mcq"
            : (draft.parts ?? []).map((p) => p.targetQuantityKey).join("+");
        const scenKey = `${descriptor.templateArchetype}::${format}::${serializeCoreScenarioKey(
          draft.scenarioSpec as unknown as WavesScenarioSpec,
          targetSignature,
        )}`;

        // Prefer unique scenario parameter combinations before relaxing on high-attempt fallback
        if (attempt < 80 && seenScenarioFingerprints.has(scenKey)) {
          continue;
        }

        const draftFp = computeStemFingerprint(draft.stem);
        const draftShingles = computeShingleSet(draft.stem);
        const effectiveSimCap = attempt < 90 ? similarityCap : 0.895;

        let isNearDuplicate = false;
        for (const prev of existingStemProfiles) {
          if (
            prev.fp === draftFp ||
            jaccardSetSimilarity(draftShingles, prev.shingles) >= effectiveSimCap
          ) {
            isNearDuplicate = true;
            break;
          }
        }
        if (isNearDuplicate) {
          continue;
        }

        const check = verifyCandidateWithGate(draft, {
          existingShardItems: [],
          nearDuplicateSimilarityThreshold: effectiveSimCap,
        });
        if (!check.evaluation.valid) {
          continue;
        }

        seenScenarioFingerprints.add(scenKey);
        accepted = draft;
        acceptedFp = draftFp;
        acceptedShingles = draftShingles;
        break;
      }

      if (!accepted || !acceptedShingles) {
        throw new Error(
          `Failed to synthesize gate-valid waves candidate for archetype "${descriptor.templateArchetype}" (${format}, slot ${localIdx})`,
        );
      }

      candidates.push(accepted);
      existingStemProfiles.push({
        fp: acceptedFp,
        shingles: acceptedShingles,
      });
      globalSeq += 1;
    }
  }

  return candidates;
}
