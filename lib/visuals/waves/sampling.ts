import { solveWavesScenario } from "./solver";
import {
  DiffractionGratingScenarioSpec,
  DopplerEffectScenarioSpec,
  DoubleSlitScenarioSpec,
  MalusPolarizationScenarioSpec,
  ObserverMotionDirection,
  ProgressiveWaveScenarioSpec,
  SampledWavesScenarioPackage,
  SingleSlitScenarioSpec,
  SourceMotionDirection,
  StandingWaveBoundaryKind,
  StandingWaveScenarioSpec,
  WAVES_SCENARIO_KINDS,
  WAVES_SCHEMA_VERSION,
  WavesQuantityKey,
  WavesSamplingOptions,
  WavesScenarioKind,
  WavesSyllabusLevel,
} from "./types";
import { computeExactMaxOrder } from "./validation";

function hashSeed(seed: number | string): number {
  if (typeof seed === "number") {
    const int = Math.trunc(seed) >>> 0;
    return int === 0 ? 0x6d2b79f5 : int;
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const unsigned = hash >>> 0;
  return unsigned === 0 ? 0x6d2b79f5 : unsigned;
}

export function createWavesRng(seed: number | string = 20261117): () => number {
  let state = hashSeed(seed);
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[index];
}

const IB_SL_COMPATIBLE_KINDS: readonly WavesScenarioKind[] = [
  "progressive-wave",
  "standing-wave",
  "double-slit",
  "malus-polarization",
];

const ALL_SYLLABI: readonly WavesSyllabusLevel[] = [
  "IB-SL",
  "IB-HL",
  "A-Level",
  "NCUK",
];

const HL_ALEVEL_NCUK_SYLLABI: readonly WavesSyllabusLevel[] = [
  "IB-HL",
  "A-Level",
  "NCUK",
];

function resolveRng(options: WavesSamplingOptions): () => number {
  if (options.rng) return options.rng;
  return createWavesRng(options.seed ?? 20261117);
}

export function sampleProgressiveWaveScenario(
  options: WavesSamplingOptions = {},
): SampledWavesScenarioPackage {
  const rng = resolveRng(options);
  const profileKind = pick(rng, [
    "displacement-position",
    "displacement-time",
  ] as const);
  const amplitudeM = pick(rng, [
    0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12,
  ]);
  const wavelengthM = pick(rng, [
    0.16, 0.2, 0.25, 0.32, 0.4, 0.5, 0.6, 0.8, 1.2, 1.5, 2.0,
  ]);
  const frequencyHz = pick(rng, [
    2, 2.5, 4, 5, 8, 10, 12.5, 16, 20, 25, 40, 50,
  ]);
  const direction = pick(rng, ["right", "left"] as const);
  const cyclesShown = pick(rng, [1.5, 2, 2.5, 3]);
  const includePhasePoints = rng() < 0.55;

  const cycleUnit =
    profileKind === "displacement-position" ? wavelengthM : 1 / frequencyHz;
  const p1Frac = pick(rng, [0, 0.25, 0.5]);
  const sepFrac = pick(rng, [0.125, 0.25, 0.5, 0.75, 1.0]);

  const targetCandidates: readonly WavesQuantityKey[] = includePhasePoints
    ? ["waveSpeedMs", "phaseDifferenceRad", "wavelengthM", "frequencyHz"]
    : profileKind === "displacement-position"
      ? ["waveSpeedMs", "periodS", "wavelengthM"]
      : ["waveSpeedMs", "frequencyHz", "periodS"];
  const targetQuantity = pick(rng, targetCandidates);
  const hide = options.hideTargetQuantity ?? true;

  const spec: ProgressiveWaveScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id: `sampled-progressive-${Math.floor(rng() * 1e6)}`,
    kind: "progressive-wave",
    profileKind,
    amplitudeM,
    wavelengthM,
    frequencyHz,
    direction,
    cyclesShown,
    ...(includePhasePoints
      ? {
          point1Coord: Number((p1Frac * cycleUnit).toPrecision(12)),
          point2Coord: Number(
            ((p1Frac + sepFrac) * cycleUnit).toPrecision(12),
          ),
        }
      : {}),
    hiddenQuantities: hide ? [targetQuantity] : [],
  };

  return {
    spec,
    solution: solveWavesScenario(spec),
    targetQuantity,
    syllabusLevels: ALL_SYLLABI,
  };
}

export function sampleStandingWaveScenario(
  options: WavesSamplingOptions = {},
): SampledWavesScenarioPackage {
  const rng = resolveRng(options);
  const boundaryKind: StandingWaveBoundaryKind = pick(rng, [
    "string-fixed-both",
    "pipe-open-both",
    "pipe-closed-one",
  ] as const);

  const lengthM = pick(rng, [0.3, 0.45, 0.6, 0.75, 0.85, 0.9, 1.2, 1.5]);
  const harmonicNumber =
    boundaryKind === "pipe-closed-one"
      ? pick(rng, [1, 3, 5, 7])
      : pick(rng, [1, 2, 3, 4, 5]);

  const hide = options.hideTargetQuantity ?? true;
  let spec: StandingWaveScenarioSpec;
  let targetQuantity: WavesQuantityKey;
  let syllabusLevels: readonly WavesSyllabusLevel[] = ALL_SYLLABI;

  if (boundaryKind === "string-fixed-both") {
    const useTensionMechanics =
      options.syllabusLevel !== "IB-SL" && rng() < 0.5;
    if (useTensionMechanics) {
      const linearDensityKgM = pick(rng, [0.0005, 0.001, 0.002, 0.004, 0.005]);
      const speedTarget = pick(rng, [60, 80, 100, 120, 150, 200]);
      const tensionN = Number(
        (linearDensityKgM * speedTarget * speedTarget).toPrecision(12),
      );
      targetQuantity = pick(rng, [
        "harmonicFrequencyHz",
        "waveSpeedMs",
        "wavelengthM",
      ] as const);
      syllabusLevels = HL_ALEVEL_NCUK_SYLLABI;
      spec = {
        schemaVersion: WAVES_SCHEMA_VERSION,
        id: `sampled-standing-string-${Math.floor(rng() * 1e6)}`,
        kind: "standing-wave",
        boundaryKind,
        lengthM,
        harmonicNumber,
        tensionN,
        linearDensityKgM,
        hiddenQuantities: hide ? [targetQuantity] : [],
      };
    } else {
      const waveSpeedMs = pick(rng, [80, 120, 150, 180, 240, 300]);
      targetQuantity = pick(rng, [
        "harmonicFrequencyHz",
        "wavelengthM",
        "fundamentalFrequencyHz",
        "harmonicNumber",
      ] as const);
      spec = {
        schemaVersion: WAVES_SCHEMA_VERSION,
        id: `sampled-standing-string-${Math.floor(rng() * 1e6)}`,
        kind: "standing-wave",
        boundaryKind,
        lengthM,
        harmonicNumber,
        waveSpeedMs,
        hiddenQuantities: hide ? [targetQuantity] : [],
      };
    }
  } else {
    const waveSpeedMs = pick(rng, [330, 336, 340, 343]);
    const useEndCorrection =
      options.syllabusLevel !== "IB-SL" && rng() < 0.35;
    const endCorrectionM = useEndCorrection
      ? pick(rng, [0.008, 0.01, 0.012, 0.015, 0.02])
      : 0;
    if (useEndCorrection) {
      syllabusLevels = HL_ALEVEL_NCUK_SYLLABI;
    }
    targetQuantity = pick(rng, [
      "harmonicFrequencyHz",
      "wavelengthM",
      "fundamentalFrequencyHz",
      "harmonicNumber",
    ] as const);
    spec = {
      schemaVersion: WAVES_SCHEMA_VERSION,
      id: `sampled-standing-pipe-${Math.floor(rng() * 1e6)}`,
      kind: "standing-wave",
      boundaryKind,
      lengthM,
      harmonicNumber,
      waveSpeedMs,
      ...(endCorrectionM > 0 ? { endCorrectionM } : {}),
      hiddenQuantities: hide ? [targetQuantity] : [],
    };
  }

  return {
    spec,
    solution: solveWavesScenario(spec),
    targetQuantity,
    syllabusLevels,
  };
}

export function sampleDoubleSlitScenario(
  options: WavesSamplingOptions = {},
): SampledWavesScenarioPackage {
  const rng = resolveRng(options);
  const wavelengthNm = pick(rng, [405, 450, 488, 532, 589, 633, 650, 680]);
  const wavelengthM = Number((wavelengthNm * 1e-9).toPrecision(12));
  const slitSeparationM = pick(rng, [
    0.15e-3, 0.2e-3, 0.25e-3, 0.3e-3, 0.4e-3, 0.5e-3, 0.6e-3,
  ]);
  const screenDistanceM = pick(rng, [1.2, 1.5, 1.8, 2.0, 2.4, 2.5, 3.0]);
  const orderN = pick(rng, [1, 2, 3]);
  const useEnvelope =
    options.syllabusLevel !== "IB-SL" && rng() < 0.35;
  const slitWidthM = useEnvelope
    ? Number((slitSeparationM / pick(rng, [3, 4, 5])).toPrecision(12))
    : undefined;

  const targetQuantity: WavesQuantityKey = useEnvelope
    ? pick(rng, [
        "fringeSpacingM",
        "centralEnvelopeFullWidthM",
        "wavelengthM",
      ] as const)
    : pick(rng, [
        "fringeSpacingM",
        "wavelengthM",
        "slitSeparationM",
        "nthBrightPositionM",
      ] as const);
  const hide = options.hideTargetQuantity ?? true;

  const spec: DoubleSlitScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id: `sampled-double-slit-${Math.floor(rng() * 1e6)}`,
    kind: "double-slit",
    wavelengthM,
    slitSeparationM,
    screenDistanceM,
    orderN,
    ...(slitWidthM !== undefined ? { slitWidthM } : {}),
    hiddenQuantities: hide ? [targetQuantity] : [],
  };

  return {
    spec,
    solution: solveWavesScenario(spec),
    targetQuantity,
    syllabusLevels: useEnvelope ? HL_ALEVEL_NCUK_SYLLABI : ALL_SYLLABI,
  };
}

export function sampleDiffractionGratingScenario(
  options: WavesSamplingOptions = {},
): SampledWavesScenarioPackage {
  const rng = resolveRng(options);
  const wavelengthNm = pick(rng, [420, 450, 500, 532, 550, 589, 600, 633, 650]);
  const wavelengthM = Number((wavelengthNm * 1e-9).toPrecision(12));
  const linesPerMm = pick(rng, [200, 250, 300, 400, 500, 600]);
  const slitSpacingM = Number((1e-3 / linesPerMm).toPrecision(12));
  const maxOrder = computeExactMaxOrder(slitSpacingM, wavelengthM);

  const validOrders: number[] = [];
  for (let m = 1; m <= maxOrder; m += 1) {
    if (m * wavelengthM < slitSpacingM * (1 - 1e-9)) {
      validOrders.push(m);
    }
  }
  const queryOrderN = validOrders.length > 0 ? pick(rng, validOrders) : 1;
  const includeScreen = rng() < 0.4 && queryOrderN * wavelengthM < slitSpacingM * 0.92;
  const screenDistanceM = includeScreen ? pick(rng, [1.0, 1.5, 2.0]) : undefined;

  const targetQuantity: WavesQuantityKey = pick(rng, [
    "queryAngleDegrees",
    "maxOrder",
    "totalPrincipalMaxima",
    "wavelengthM",
  ] as const);
  const hide = options.hideTargetQuantity ?? true;

  const spec: DiffractionGratingScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id: `sampled-grating-${Math.floor(rng() * 1e6)}`,
    kind: "diffraction-grating",
    wavelengthM,
    slitSpacingM,
    linesPerMm,
    queryOrderN,
    ...(screenDistanceM !== undefined ? { screenDistanceM } : {}),
    hiddenQuantities: hide ? [targetQuantity] : [],
  };

  return {
    spec,
    solution: solveWavesScenario(spec),
    targetQuantity,
    syllabusLevels: HL_ALEVEL_NCUK_SYLLABI,
  };
}

export function sampleSingleSlitScenario(
  options: WavesSamplingOptions = {},
): SampledWavesScenarioPackage {
  const rng = resolveRng(options);
  const wavelengthNm = pick(rng, [450, 488, 532, 589, 633, 650, 670]);
  const wavelengthM = Number((wavelengthNm * 1e-9).toPrecision(12));
  const slitWidthM = pick(rng, [
    0.05e-3, 0.08e-3, 0.1e-3, 0.12e-3, 0.15e-3, 0.2e-3, 0.25e-3,
  ]);
  const screenDistanceM = pick(rng, [1.2, 1.5, 1.8, 2.0, 2.4, 3.0]);

  const targetQuantity: WavesQuantityKey = pick(rng, [
    "firstMinimumAngleRad",
    "centralFullWidthM",
    "centralHalfWidthM",
    "slitWidthM",
  ] as const);
  const hide = options.hideTargetQuantity ?? true;

  const spec: SingleSlitScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id: `sampled-single-slit-${Math.floor(rng() * 1e6)}`,
    kind: "single-slit",
    wavelengthM,
    slitWidthM,
    screenDistanceM,
    hiddenQuantities: hide ? [targetQuantity] : [],
  };

  return {
    spec,
    solution: solveWavesScenario(spec),
    targetQuantity,
    syllabusLevels: HL_ALEVEL_NCUK_SYLLABI,
  };
}

export function sampleDopplerEffectScenario(
  options: WavesSamplingOptions = {},
): SampledWavesScenarioPackage {
  const rng = resolveRng(options);
  const emittedFrequencyHz = pick(rng, [
    300, 400, 440, 500, 600, 680, 800, 850, 1000,
  ]);
  const waveSpeedMs = pick(rng, [330, 340, 343]);

  const motionPattern = pick(rng, [
    "source-only",
    "observer-only",
    "both-moving",
  ] as const);

  let sourceMotion: SourceMotionDirection = "stationary";
  let sourceSpeedMs = 0;
  let observerMotion: ObserverMotionDirection = "stationary";
  let observerSpeedMs = 0;

  if (motionPattern === "source-only" || motionPattern === "both-moving") {
    sourceMotion = pick(rng, [
      "towards-observer",
      "away-from-observer",
    ] as const);
    sourceSpeedMs = pick(rng, [15, 20, 25, 30, 34, 40, 50]);
  }
  if (motionPattern === "observer-only" || motionPattern === "both-moving") {
    observerMotion = pick(rng, [
      "towards-source",
      "away-from-source",
    ] as const);
    observerSpeedMs = pick(rng, [10, 15, 20, 25, 30, 34]);
  }

  const targetCandidates: readonly WavesQuantityKey[] =
    sourceMotion !== "stationary"
      ? [
          "observedFrequencyHz",
          "sourceSpeedMs",
          "mediumWavelengthTowardsObserverM",
          "frequencyShiftHz",
        ]
      : ["observedFrequencyHz", "observerSpeedMs", "frequencyShiftHz"];
  const targetQuantity = pick(rng, targetCandidates);
  const hide = options.hideTargetQuantity ?? true;

  const spec: DopplerEffectScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id: `sampled-doppler-${Math.floor(rng() * 1e6)}`,
    kind: "doppler-effect",
    emittedFrequencyHz,
    waveSpeedMs,
    sourceSpeedMs,
    sourceMotion,
    observerSpeedMs,
    observerMotion,
    hiddenQuantities: hide ? [targetQuantity] : [],
  };

  return {
    spec,
    solution: solveWavesScenario(spec),
    targetQuantity,
    syllabusLevels: HL_ALEVEL_NCUK_SYLLABI,
  };
}

export function sampleMalusPolarizationScenario(
  options: WavesSamplingOptions = {},
): SampledWavesScenarioPackage {
  const rng = resolveRng(options);
  const incidentIntensityWm2 = pick(rng, [
    12, 16, 20, 24, 32, 40, 48, 60, 80, 100, 120, 160, 200,
  ]);
  const analyzerAngleDegrees = pick(rng, [
    0, 20, 30, 35, 45, 50, 60, 70, 90, 120, 135, 150,
  ]);
  const incidentPolarization = pick(rng, ["polarized", "unpolarized"] as const);

  const targetQuantity: WavesQuantityKey = pick(rng, [
    "transmittedIntensityWm2",
    "analyzerAngleDegrees",
    "incidentIntensityWm2",
  ] as const);
  const hide = options.hideTargetQuantity ?? true;

  const spec: MalusPolarizationScenarioSpec = {
    schemaVersion: WAVES_SCHEMA_VERSION,
    id: `sampled-malus-${Math.floor(rng() * 1e6)}`,
    kind: "malus-polarization",
    incidentIntensityWm2,
    analyzerAngleDegrees,
    incidentPolarization,
    hiddenQuantities: hide ? [targetQuantity] : [],
  };

  return {
    spec,
    solution: solveWavesScenario(spec),
    targetQuantity,
    syllabusLevels: ALL_SYLLABI,
  };
}

export function sampleWavesScenario(
  options: WavesSamplingOptions = {},
): SampledWavesScenarioPackage {
  const rng = resolveRng(options);
  let candidateKinds: readonly WavesScenarioKind[];
  if (options.kind) {
    candidateKinds = [options.kind];
  } else if (options.kinds && options.kinds.length > 0) {
    candidateKinds = options.kinds;
  } else if (options.syllabusLevel === "IB-SL") {
    candidateKinds = IB_SL_COMPATIBLE_KINDS;
  } else {
    candidateKinds = WAVES_SCENARIO_KINDS;
  }

  const chosenKind = pick(rng, candidateKinds);
  const forwarded: WavesSamplingOptions = { ...options, rng, kind: chosenKind };

  switch (chosenKind) {
    case "progressive-wave":
      return sampleProgressiveWaveScenario(forwarded);
    case "standing-wave":
      return sampleStandingWaveScenario(forwarded);
    case "double-slit":
      return sampleDoubleSlitScenario(forwarded);
    case "diffraction-grating":
      return sampleDiffractionGratingScenario(forwarded);
    case "single-slit":
      return sampleSingleSlitScenario(forwarded);
    case "doppler-effect":
      return sampleDopplerEffectScenario(forwarded);
    case "malus-polarization":
      return sampleMalusPolarizationScenario(forwarded);
  }
}

function scenarioFingerprint(pkg: SampledWavesScenarioPackage): string {
  const { id, title, hiddenQuantities, visibility, customLabels, ...core } =
    pkg.spec;
  void id;
  void title;
  void hiddenQuantities;
  void visibility;
  void customLabels;
  return `${JSON.stringify(core)}::${pkg.targetQuantity}`;
}

export function sampleWavesScenarioBatch(
  count: number,
  options: WavesSamplingOptions = {},
): SampledWavesScenarioPackage[] {
  if (!Number.isInteger(count) || count < 0 || count > 5000) {
    throw new Error(
      `Batch count must be an integer between 0 and 5000, received ${count}`,
    );
  }
  const rng = resolveRng(options);
  const results: SampledWavesScenarioPackage[] = [];
  const seen = new Set<string>();
  const maxAttempts = Math.max(50, count * 20);
  let attempts = 0;

  while (results.length < count && attempts < maxAttempts) {
    attempts += 1;
    const item = sampleWavesScenario({ ...options, rng });
    const fp = scenarioFingerprint(item);
    if (!seen.has(fp)) {
      seen.add(fp);
      results.push({
        ...item,
        spec: {
          ...item.spec,
          id: `waves-batch-${results.length + 1}`,
        },
      });
    }
  }

  if (results.length < count) {
    throw new Error(
      `Unable to sample ${count} distinct waves scenarios within ${maxAttempts} attempts (produced ${results.length})`,
    );
  }

  return results;
}
