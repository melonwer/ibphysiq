import { solveOpticsShmScenario } from "./physics";
import {
  GeneratedOpticsShmScenario,
  KinematicShmSpec,
  MassSpringShmSpec,
  MultiLayerSlabSpec,
  OpticalFiberSpec,
  OpticsShmArchetype,
  OpticsShmGeneratorOptions,
  OpticsShmScenarioSpec,
  PlanarRefractionSpec,
  SimplePendulumShmSpec,
  ThinLensSpec,
} from "./types";

export const OPTICS_SHM_ARCHETYPES: readonly OpticsShmArchetype[] = [
  "planar-refraction-subcritical",
  "planar-refraction-critical",
  "planar-refraction-tir",
  "multi-layer-parallel-slab",
  "multi-layer-internal-tir",
  "optical-fiber-guided",
  "optical-fiber-leakage",
  "thin-lens-converging-real-diminished",
  "thin-lens-converging-real-magnified",
  "thin-lens-converging-virtual",
  "thin-lens-converging-focal",
  "thin-lens-diverging-virtual",
  "mass-spring-horizontal-time",
  "mass-spring-vertical-energy",
  "simple-pendulum-shm",
  "kinematic-shm-phase-portrait",
] as const;

export const OPTICS_SHM_IB_ARCHETYPES: readonly OpticsShmArchetype[] =
  OPTICS_SHM_ARCHETYPES.filter((a) => !a.startsWith("thin-lens-"));

export interface SeededRng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  stepped(min: number, max: number, step: number): number;
}

function hashSeed(seed: string | number): number {
  const str = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h === 0 ? 0x6d2b79f5 : h;
}

export function createSeededRng(seed: string | number): SeededRng {
  let state = hashSeed(seed);
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (minInclusive: number, maxInclusive: number): number =>
    minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1));
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)];
  const stepped = (min: number, max: number, step: number): number => {
    const count = Math.round((max - min) / step);
    const chosen = min + int(0, count) * step;
    return Number(chosen.toFixed(6));
  };
  return { next, int, pick, stepped };
}

const OPTICAL_MEDIA = [
  { name: "Air", n: 1.0 },
  { name: "Water", n: 1.33 },
  { name: "Fused silica", n: 1.46 },
  { name: "Crown glass", n: 1.52 },
  { name: "Polycarbonate", n: 1.58 },
  { name: "Flint glass", n: 1.65 },
  { name: "Sapphire", n: 1.77 },
  { name: "Diamond", n: 2.42 },
] as const;

export function generatePlanarRefractionScenario(
  seed: string | number,
  regime: "refraction" | "critical-angle" | "total-internal-reflection" = "refraction",
  hideTargets = true,
): PlanarRefractionSpec {
  const rng = createSeededRng(seed);
  const lambda0 = rng.pick([450, 500, 532, 589, 633, 650]);

  if (regime === "refraction") {
    const enterDenser = rng.next() < 0.6;
    const lowIdx = rng.int(0, 3);
    const highIdx = rng.int(lowIdx + 1, OPTICAL_MEDIA.length - 1);
    const m1 = enterDenser ? OPTICAL_MEDIA[lowIdx] : OPTICAL_MEDIA[highIdx];
    const m2 = enterDenser ? OPTICAL_MEDIA[highIdx] : OPTICAL_MEDIA[lowIdx];
    const maxSafeDeg = enterDenser
      ? 72
      : Math.max(12, Math.floor((Math.asin(m2.n / m1.n) * 180) / Math.PI) - 5);
    const theta1 = rng.stepped(10, maxSafeDeg, 2);
    const hiddenQuantities = hideTargets
      ? ["refractedAngleDeg", "wavelength2Nm", "speed2Ms"]
      : [];
    return {
      kind: "planar-refraction",
      n1: m1.n,
      n2: m2.n,
      medium1Name: m1.name,
      medium2Name: m2.name,
      incidentAngleDeg: theta1,
      vacuumWavelengthNm: lambda0,
      hiddenQuantities,
    };
  }

  const lowIdx = rng.int(0, 2);
  const highIdx = rng.int(lowIdx + 2, OPTICAL_MEDIA.length - 1);
  const m1 = OPTICAL_MEDIA[highIdx];
  const m2 = OPTICAL_MEDIA[lowIdx];
  const critDeg = (Math.asin(m2.n / m1.n) * 180) / Math.PI;

  if (regime === "critical-angle") {
    return {
      kind: "planar-refraction",
      n1: m1.n,
      n2: m2.n,
      medium1Name: m1.name,
      medium2Name: m2.name,
      incidentAngleDeg: critDeg,
      vacuumWavelengthNm: lambda0,
      hiddenQuantities: hideTargets
        ? ["incidentAngleDeg", "criticalAngleDeg"]
        : [],
    };
  }

  const minTir = Math.min(82, Math.ceil(critDeg + 4));
  const theta1 = rng.stepped(minTir, 84, 1);
  return {
    kind: "planar-refraction",
    n1: m1.n,
    n2: m2.n,
    medium1Name: m1.name,
    medium2Name: m2.name,
    incidentAngleDeg: theta1,
    vacuumWavelengthNm: lambda0,
    hiddenQuantities: hideTargets
      ? ["criticalAngleDeg", "reflectedAngleDeg", "regime"]
      : [],
  };
}

export function generateMultiLayerSlabScenario(
  seed: string | number,
  internalTir = false,
  hideTargets = true,
): MultiLayerSlabSpec {
  const rng = createSeededRng(seed);
  if (!internalTir) {
    const outer = OPTICAL_MEDIA[0];
    const mid1 = OPTICAL_MEDIA[rng.int(2, 5)];
    const useFour = rng.next() < 0.45;
    const thickness1 = rng.stepped(0.02, 0.08, 0.01);
    const layers = useFour
      ? [
          { name: outer.name, refractiveIndex: outer.n },
          {
            name: mid1.name,
            refractiveIndex: mid1.n,
            thicknessM: thickness1,
          },
          {
            name: "Water",
            refractiveIndex: 1.33,
            thicknessM: rng.stepped(0.02, 0.06, 0.01),
          },
          { name: outer.name, refractiveIndex: outer.n },
        ]
      : [
          { name: outer.name, refractiveIndex: outer.n },
          {
            name: mid1.name,
            refractiveIndex: mid1.n,
            thicknessM: thickness1,
          },
          { name: outer.name, refractiveIndex: outer.n },
        ];
    return {
      kind: "multi-layer-slab",
      layers,
      incidentAngleDeg: rng.stepped(20, 60, 5),
      hiddenQuantities: hideTargets
        ? ["layerAngle:1", "emergentAngleDeg", "lateralDisplacementM"]
        : [],
    };
  }

  const first = OPTICAL_MEDIA[rng.int(4, 6)];
  const second = OPTICAL_MEDIA[rng.int(2, 3)];
  const third = OPTICAL_MEDIA[0];
  const minTheta0 =
    (Math.asin(Math.min(0.95, (third.n / first.n) * 1.18)) * 180) / Math.PI;
  const maxTheta0 =
    (Math.asin(Math.min(0.98, (second.n / first.n) * 0.92)) * 180) / Math.PI;
  const theta0 = Number(((minTheta0 + maxTheta0) / 2).toFixed(2));
  return {
    kind: "multi-layer-slab",
    layers: [
      { name: first.name, refractiveIndex: first.n },
      {
        name: second.name,
        refractiveIndex: second.n,
        thicknessM: rng.stepped(0.02, 0.05, 0.01),
      },
      { name: third.name, refractiveIndex: third.n },
    ],
    incidentAngleDeg: theta0,
    hiddenQuantities: hideTargets
      ? ["layerAngle:1", "tirCriticalAngleDeg", "tirInterfaceIndex"]
      : [],
  };
}

export function generateOpticalFiberScenario(
  seed: string | number,
  guided = true,
  hideTargets = true,
): OpticalFiberSpec {
  const rng = createSeededRng(seed);
  const nCore = rng.pick([1.48, 1.5, 1.52, 1.55, 1.6]);
  const deltaN = rng.pick([0.03, 0.05, 0.08, 0.12]);
  const nCladding = Number((nCore - deltaN).toFixed(2));
  const na = Math.sqrt(nCore * nCore - nCladding * nCladding);
  const acceptDeg = (Math.asin(Math.min(1, na)) * 180) / Math.PI;

  const launchAngleDeg = guided
    ? Number((acceptDeg * rng.stepped(0.3, 0.8, 0.1)).toFixed(1))
    : Number(
        Math.min(82, acceptDeg + rng.stepped(5, 18, 1)).toFixed(1),
      );

  return {
    kind: "optical-fiber",
    nCore,
    nCladding,
    nExternal: 1.0,
    launchAngleDeg,
    fiberLengthM: rng.pick([50, 100, 250, 500, 1200]),
    coreDiameterM: rng.pick([50e-6, 62.5e-6, 100e-6]),
    hiddenQuantities: hideTargets
      ? [
          "criticalAngleDeg",
          "acceptanceAngleDeg",
          "numericalAperture",
          "wallIncidentAngleDeg",
          "modalDispersionDelayS",
        ]
      : [],
  };
}

export function generateThinLensScenario(
  seed: string | number,
  variant:
    | "converging-real-diminished"
    | "converging-real-magnified"
    | "converging-virtual"
    | "converging-focal"
    | "diverging-virtual" = "converging-real-diminished",
  hideTargets = true,
): ThinLensSpec {
  const rng = createSeededRng(seed);
  const fAbs = rng.pick([0.08, 0.1, 0.12, 0.15, 0.2, 0.25]);
  const ho = rng.pick([0.02, 0.03, 0.04, 0.05]);
  const hiddenQuantities = hideTargets
    ? ["imageDistanceM", "magnification", "imageHeightM"]
    : [];

  switch (variant) {
    case "converging-real-diminished":
      return {
        kind: "thin-lens",
        lensType: "converging",
        focalLengthM: fAbs,
        objectDistanceM: Number((fAbs * rng.pick([2.5, 3, 3.5, 4])).toFixed(4)),
        objectHeightM: ho,
        hiddenQuantities,
      };
    case "converging-real-magnified":
      return {
        kind: "thin-lens",
        lensType: "converging",
        focalLengthM: fAbs,
        objectDistanceM: Number(
          (fAbs * rng.pick([1.25, 1.4, 1.5, 1.6, 1.8])).toFixed(4),
        ),
        objectHeightM: ho,
        hiddenQuantities,
      };
    case "converging-virtual":
      return {
        kind: "thin-lens",
        lensType: "converging",
        focalLengthM: fAbs,
        objectDistanceM: Number(
          (fAbs * rng.pick([0.4, 0.5, 0.6, 0.75])).toFixed(4),
        ),
        objectHeightM: ho,
        hiddenQuantities,
      };
    case "converging-focal":
      return {
        kind: "thin-lens",
        lensType: "converging",
        focalLengthM: fAbs,
        objectDistanceM: fAbs,
        objectHeightM: ho,
        hiddenQuantities,
      };
    case "diverging-virtual":
      return {
        kind: "thin-lens",
        lensType: "diverging",
        focalLengthM: -fAbs,
        objectDistanceM: Number(
          (fAbs * rng.pick([0.8, 1.2, 1.5, 2.0, 3.0])).toFixed(4),
        ),
        objectHeightM: ho,
        hiddenQuantities,
      };
  }
}

export function generateMassSpringShmScenario(
  seed: string | number,
  orientation: "horizontal" | "vertical" = "horizontal",
  hideTargets = true,
): MassSpringShmSpec {
  const rng = createSeededRng(seed);
  const massKg = rng.pick([0.15, 0.2, 0.25, 0.4, 0.5, 0.8, 1.2]);
  const springConstantNm = rng.pick([12, 16, 20, 25, 36, 48, 64, 80]);
  const amplitudeM = rng.pick([0.03, 0.04, 0.05, 0.06, 0.08, 0.1]);
  const plotMode =
    orientation === "vertical"
      ? rng.pick(["energy-displacement", "energy-time"] as const)
      : "time-series";

  return {
    kind: "mass-spring-shm",
    orientation,
    massKg,
    springConstantNm,
    amplitudeM,
    phaseConvention: rng.pick(["cosine", "sine"] as const),
    queryDisplacementM: Number((amplitudeM * rng.pick([-0.5, 0, 0.5, 0.8])).toFixed(4)),
    plotMode,
    hiddenQuantities: hideTargets
      ? ["periodS", "maxSpeedMs", "maxAccelerationMs2", "totalEnergyJ"]
      : [],
  };
}

export function generateSimplePendulumShmScenario(
  seed: string | number,
  hideTargets = true,
): SimplePendulumShmSpec {
  const rng = createSeededRng(seed);
  const lengthM = rng.pick([0.4, 0.64, 0.8, 1.0, 1.25, 1.5, 2.0]);
  const maxAngleDeg = rng.pick([5, 6, 8, 10, 12]);
  const bobMassKg = rng.pick([0.1, 0.15, 0.2, 0.3, 0.5]);

  return {
    kind: "simple-pendulum-shm",
    lengthM,
    maxAngleDeg,
    bobMassKg,
    gravityMs2: 9.81,
    plotMode: rng.pick(["time-series", "energy-displacement"] as const),
    hiddenQuantities: hideTargets
      ? ["periodS", "maxSpeedMs", "equilibriumTensionN"]
      : [],
  };
}

export function generateKinematicShmScenario(
  seed: string | number,
  hideTargets = true,
): KinematicShmSpec {
  const rng = createSeededRng(seed);
  const frequencyHz = rng.pick([0.5, 1.0, 1.25, 2.0, 2.5, 4.0, 5.0]);
  const amplitudeM = rng.pick([0.02, 0.04, 0.05, 0.08, 0.12]);
  const phasePlotKind = rng.pick([
    "velocity-displacement",
    "acceleration-displacement",
  ] as const);

  return {
    kind: "kinematic-shm",
    frequencyHz,
    amplitudeM,
    massKg: rng.pick([0.2, 0.4, 0.5, 1.0]),
    plotMode: "phase-portrait",
    phasePlotKind,
    hiddenQuantities: hideTargets
      ? ["angularFrequencyRadS", "maxSpeedMs", "maxAccelerationMs2"]
      : [],
  };
}

export function generateOpticsShmScenario(
  seed: string | number,
  options: OpticsShmGeneratorOptions = {},
): GeneratedOpticsShmScenario {
  const rng = createSeededRng(seed);
  const pool =
    options.syllabus === "ib"
      ? OPTICS_SHM_IB_ARCHETYPES
      : OPTICS_SHM_ARCHETYPES;
  const archetype = options.archetype ?? rng.pick(pool);
  const hideTargets = options.hideTargets ?? true;
  const gravityMs2 = options.syllabus === "ib" ? 9.8 : 9.81;
  const subSeed = `${seed}::${archetype}`;

  let spec: OpticsShmScenarioSpec;
  switch (archetype) {
    case "planar-refraction-subcritical":
      spec = generatePlanarRefractionScenario(subSeed, "refraction", hideTargets);
      break;
    case "planar-refraction-critical":
      spec = generatePlanarRefractionScenario(
        subSeed,
        "critical-angle",
        hideTargets,
      );
      break;
    case "planar-refraction-tir":
      spec = generatePlanarRefractionScenario(
        subSeed,
        "total-internal-reflection",
        hideTargets,
      );
      break;
    case "multi-layer-parallel-slab":
      spec = generateMultiLayerSlabScenario(subSeed, false, hideTargets);
      break;
    case "multi-layer-internal-tir":
      spec = generateMultiLayerSlabScenario(subSeed, true, hideTargets);
      break;
    case "optical-fiber-guided":
      spec = generateOpticalFiberScenario(subSeed, true, hideTargets);
      break;
    case "optical-fiber-leakage":
      spec = generateOpticalFiberScenario(subSeed, false, hideTargets);
      break;
    case "thin-lens-converging-real-diminished":
      spec = generateThinLensScenario(
        subSeed,
        "converging-real-diminished",
        hideTargets,
      );
      break;
    case "thin-lens-converging-real-magnified":
      spec = generateThinLensScenario(
        subSeed,
        "converging-real-magnified",
        hideTargets,
      );
      break;
    case "thin-lens-converging-virtual":
      spec = generateThinLensScenario(
        subSeed,
        "converging-virtual",
        hideTargets,
      );
      break;
    case "thin-lens-converging-focal":
      spec = generateThinLensScenario(subSeed, "converging-focal", hideTargets);
      break;
    case "thin-lens-diverging-virtual":
      spec = generateThinLensScenario(
        subSeed,
        "diverging-virtual",
        hideTargets,
      );
      break;
    case "mass-spring-horizontal-time":
      spec = generateMassSpringShmScenario(subSeed, "horizontal", hideTargets);
      break;
    case "mass-spring-vertical-energy":
      spec = {
        ...generateMassSpringShmScenario(subSeed, "vertical", hideTargets),
        gravityMs2,
      };
      break;
    case "simple-pendulum-shm":
      spec = {
        ...generateSimplePendulumShmScenario(subSeed, hideTargets),
        gravityMs2,
      };
      break;
    case "kinematic-shm-phase-portrait":
      spec = generateKinematicShmScenario(subSeed, hideTargets);
      break;
    default: {
      const exhaustive: never = archetype;
      throw new Error(`Unsupported archetype: ${String(exhaustive)}`);
    }
  }

  const solution = solveOpticsShmScenario(spec);
  return {
    seed,
    archetype,
    familyGroupKey: `optics-shm::${archetype}`,
    spec,
    solution,
    hiddenQuantities: [...(spec.hiddenQuantities ?? [])],
  };
}

export function generateOpticsShmBatch(
  baseSeed: string | number,
  count: number,
  options: OpticsShmGeneratorOptions = {},
): GeneratedOpticsShmScenario[] {
  if (!Number.isInteger(count) || count < 0 || count > 10000) {
    throw new Error("Batch count must be an integer between 0 and 10000");
  }
  const pool =
    options.syllabus === "ib"
      ? OPTICS_SHM_IB_ARCHETYPES
      : OPTICS_SHM_ARCHETYPES;
  return Array.from({ length: count }, (_, idx) => {
    const archetype = options.archetype ?? pool[idx % pool.length];
    return generateOpticsShmScenario(`${baseSeed}#${idx}`, {
      ...options,
      archetype,
    });
  });
}
