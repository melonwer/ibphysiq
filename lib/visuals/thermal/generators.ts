import {
  MONATOMIC_GAS_PRESETS,
  SOLID_CALORIMETRY_PRESETS,
  THERMAL_SUBSTANCE_PRESETS,
} from "./constants";
import {
  CalorimetryMixingScenarioSpec,
  CarnotCycleScenarioSpec,
  KineticTheoryScenarioSpec,
  PhaseChangeScenarioSpec,
  ThermalDiagramPlane,
  ThermalRadiationScenarioSpec,
  ThermalScenarioKind,
  ThermalScenarioSpec,
  ThermodynamicProcessScenarioSpec,
} from "./types";

export interface SeededRandom {
  /** Uniform float in [0, 1). */
  next: () => number;
  /** Uniform integer in [min, max] inclusive. */
  int: (min: number, max: number) => number;
  /** Pick one element deterministically from a non-empty array. */
  pick: <T>(items: readonly T[]) => T;
  /** Bernoulli draw returning true with probability p. */
  bool: (probability?: number) => boolean;
}

function hashSeed(seed: number | string): number {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new Error("Numeric seed must be finite.");
    }
    return Math.trunc(seed) >>> 0;
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic Mulberry32 PRNG seeded by integer or string.
 */
export function createSeededRandom(seed: number | string): SeededRandom {
  let state = (hashSeed(seed) + 0x9e3779b9) >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min: number, max: number): number => {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      if (hi < lo) throw new Error("Invalid integer range.");
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) {
        throw new Error("Cannot pick from empty array.");
      }
      return items[Math.floor(next() * items.length)];
    },
    bool: (probability = 0.5): boolean => next() < probability,
  };
}

export type ThermodynamicProcessArchetype =
  | "rectangular-cycle"
  | "isothermal-isobaric-isochoric-cycle"
  | "adiabatic-isobaric-isochoric-cycle"
  | "otto-cycle"
  | "single-isothermal"
  | "single-adiabatic"
  | "two-step-open";

export interface ThermodynamicGeneratorOptions {
  archetype?: ThermodynamicProcessArchetype;
  diagramPlane?: ThermalDiagramPlane;
  hiddenQuantities?: readonly string[];
}

export function generateThermodynamicProcessScenario(
  seed: number | string,
  options: ThermodynamicGeneratorOptions = {},
): ThermodynamicProcessScenarioSpec {
  const rng = createSeededRandom(seed);
  const archetypes: readonly ThermodynamicProcessArchetype[] = [
    "rectangular-cycle",
    "isothermal-isobaric-isochoric-cycle",
    "adiabatic-isobaric-isochoric-cycle",
    "otto-cycle",
    "single-isothermal",
    "single-adiabatic",
    "two-step-open",
  ];
  const archetype = options.archetype ?? rng.pick(archetypes);
  const diagramPlane =
    options.diagramPlane ?? rng.pick<ThermalDiagramPlane>(["PV", "PT", "VT"]);
  const moles = rng.pick([0.1, 0.2, 0.25, 0.4, 0.5, 0.8, 1.0, 1.5, 2.0]);
  const vLow = rng.pick([1.0e-3, 1.5e-3, 2.0e-3, 2.5e-3]);
  const volRatio = rng.pick([2, 2.5, 3, 4]);
  const vHigh = Number((vLow * volRatio).toPrecision(6));
  const pLow = rng.pick([1.0e5, 1.2e5, 1.5e5, 2.0e5]);
  const pRatio = rng.pick([2, 2.5, 3, 4]);
  const pHigh = Number((pLow * pRatio).toPrecision(6));

  switch (archetype) {
    case "rectangular-cycle":
      return {
        kind: "thermodynamic-process",
        id: `thermo-rect-${hashSeed(seed)}`,
        moles,
        initialState: { stateId: "A", label: "A", pressurePa: pHigh, volumeM3: vLow },
        steps: [
          { process: "isobaric", toStateId: "B", toLabel: "B", targetVolumeM3: vHigh },
          { process: "isochoric", toStateId: "C", toLabel: "C", targetPressurePa: pLow },
          { process: "isobaric", toStateId: "D", toLabel: "D", targetVolumeM3: vLow },
          { process: "isochoric", closeToInitial: true },
        ],
        isClosedCycle: true,
        diagramPlane,
        hiddenQuantities: options.hiddenQuantities ?? [
          "netWorkJ",
          "thermalEfficiency",
        ],
      };

    case "isothermal-isobaric-isochoric-cycle":
      return {
        kind: "thermodynamic-process",
        id: `thermo-iso-cycle-${hashSeed(seed)}`,
        moles,
        initialState: { stateId: "A", label: "A", pressurePa: pHigh, volumeM3: vLow },
        steps: [
          { process: "isothermal", toStateId: "B", toLabel: "B", targetVolumeM3: vHigh },
          { process: "isobaric", toStateId: "C", toLabel: "C", targetVolumeM3: vLow },
          { process: "isochoric", closeToInitial: true },
        ],
        isClosedCycle: true,
        diagramPlane,
        hiddenQuantities: options.hiddenQuantities ?? [
          "netWorkJ",
          "thermalEfficiency",
        ],
      };

    case "adiabatic-isobaric-isochoric-cycle":
      return {
        kind: "thermodynamic-process",
        id: `thermo-adiab-cycle-${hashSeed(seed)}`,
        moles,
        initialState: { stateId: "A", label: "A", pressurePa: pHigh, volumeM3: vLow },
        steps: [
          { process: "adiabatic", toStateId: "B", toLabel: "B", targetVolumeM3: vHigh },
          { process: "isobaric", toStateId: "C", toLabel: "C", targetVolumeM3: vLow },
          { process: "isochoric", closeToInitial: true },
        ],
        isClosedCycle: true,
        diagramPlane,
        hiddenQuantities: options.hiddenQuantities ?? [
          "netWorkJ",
          "thermalEfficiency",
        ],
      };

    case "otto-cycle": {
      const pAfterComp = pLow * volRatio ** (5 / 3);
      const pPeak = Number((pAfterComp * rng.pick([1.8, 2.2, 2.5])).toPrecision(8));
      return {
        kind: "thermodynamic-process",
        id: `thermo-otto-${hashSeed(seed)}`,
        moles,
        initialState: { stateId: "A", label: "A", pressurePa: pLow, volumeM3: vHigh },
        steps: [
          { process: "adiabatic", toStateId: "B", toLabel: "B", targetVolumeM3: vLow },
          { process: "isochoric", toStateId: "C", toLabel: "C", targetPressurePa: pPeak },
          { process: "adiabatic", toStateId: "D", toLabel: "D", targetVolumeM3: vHigh },
          { process: "isochoric", closeToInitial: true },
        ],
        isClosedCycle: true,
        diagramPlane,
        hiddenQuantities: options.hiddenQuantities ?? [
          "netWorkJ",
          "thermalEfficiency",
        ],
      };
    }

    case "single-isothermal":
      return {
        kind: "thermodynamic-process",
        id: `thermo-isothermal-${hashSeed(seed)}`,
        moles,
        initialState: { stateId: "A", label: "A", pressurePa: pHigh, volumeM3: vLow },
        steps: [
          { process: "isothermal", toStateId: "B", toLabel: "B", targetVolumeM3: vHigh },
        ],
        isClosedCycle: false,
        diagramPlane,
        hiddenQuantities: options.hiddenQuantities ?? [
          "workJ",
          "entropyChangeJK",
        ],
      };

    case "single-adiabatic":
      return {
        kind: "thermodynamic-process",
        id: `thermo-adiabatic-${hashSeed(seed)}`,
        moles,
        initialState: { stateId: "A", label: "A", pressurePa: pHigh, volumeM3: vLow },
        steps: [
          { process: "adiabatic", toStateId: "B", toLabel: "B", targetVolumeM3: vHigh },
        ],
        isClosedCycle: false,
        diagramPlane,
        hiddenQuantities: options.hiddenQuantities ?? [
          "state:B:pressurePa",
          "workJ",
        ],
      };

    case "two-step-open":
      return {
        kind: "thermodynamic-process",
        id: `thermo-open-${hashSeed(seed)}`,
        moles,
        initialState: { stateId: "A", label: "A", pressurePa: pLow, volumeM3: vLow },
        steps: [
          { process: "isochoric", toStateId: "B", toLabel: "B", targetPressurePa: pHigh },
          { process: "isobaric", toStateId: "C", toLabel: "C", targetVolumeM3: vHigh },
        ],
        isClosedCycle: false,
        diagramPlane,
        hiddenQuantities: options.hiddenQuantities ?? ["netHeatJ", "totalDeltaUJ"],
      };
  }
}

export function generateCarnotCycleScenario(
  seed: number | string,
  options: {
    diagramPlane?: ThermalDiagramPlane;
    cycleDirection?: "heat-engine" | "refrigerator";
    hiddenQuantities?: readonly string[];
  } = {},
): CarnotCycleScenarioSpec {
  const rng = createSeededRandom(seed);
  const coldTemperatureK = rng.pick([250, 275, 300, 320, 350, 400]);
  const tempMultiplier = rng.pick([1.5, 1.6, 1.8, 2.0, 2.4]);
  const hotTemperatureK = Math.round(coldTemperatureK * tempMultiplier);
  const initialVolumeM3 = rng.pick([1.0e-3, 1.2e-3, 1.5e-3, 2.0e-3]);
  const expFactor = rng.pick([1.8, 2.0, 2.5, 3.0]);
  const isothermalExpansionVolumeM3 = Number(
    (initialVolumeM3 * expFactor).toPrecision(6),
  );
  const moles = rng.pick([0.2, 0.4, 0.5, 1.0, 1.5]);

  return {
    kind: "carnot-cycle",
    id: `carnot-${hashSeed(seed)}`,
    moles,
    hotTemperatureK,
    coldTemperatureK,
    initialVolumeM3,
    isothermalExpansionVolumeM3,
    cycleDirection: options.cycleDirection ?? "heat-engine",
    diagramPlane:
      options.diagramPlane ?? rng.pick<ThermalDiagramPlane>(["PV", "PT", "VT"]),
    hiddenQuantities: options.hiddenQuantities ?? [
      "thermalEfficiency",
      "netWorkJ",
    ],
  };
}

export function generatePhaseChangeScenario(
  seed: number | string,
  options: {
    direction?: "heating" | "cooling";
    xAxisMode?: "energy" | "time";
    hiddenQuantities?: readonly string[];
  } = {},
): PhaseChangeScenarioSpec {
  const rng = createSeededRandom(seed);
  const presetKey = rng.pick(["water", "ethanol", "lead"]);
  const preset = THERMAL_SUBSTANCE_PRESETS[presetKey];
  const massKg = rng.pick([0.15, 0.2, 0.25, 0.4, 0.5, 0.8, 1.2]);
  const direction = options.direction ?? (rng.bool(0.75) ? "heating" : "cooling");
  const xAxisMode = options.xAxisMode ?? (rng.bool(0.5) ? "time" : "energy");
  const heaterPowerW = rng.pick([250, 400, 500, 800, 1000, 1500]);
  const spanFullVapor = presetKey !== "lead" && rng.bool(0.55);

  const solidTemp = Math.max(
    40,
    Math.round(preset.meltingPointK - rng.int(15, 35)),
  );
  const liquidMidTemp = Math.round(
    preset.meltingPointK +
      (preset.boilingPointK - preset.meltingPointK) * rng.pick([0.35, 0.5, 0.7]),
  );
  const gasTemp = Math.round(preset.boilingPointK + rng.int(20, 45));

  const lowT = solidTemp;
  const highT = spanFullVapor ? gasTemp : liquidMidTemp;

  return {
    kind: "phase-change-curve",
    id: `phase-${hashSeed(seed)}`,
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
    initialTemperatureK: direction === "heating" ? lowT : highT,
    finalTemperatureK: direction === "heating" ? highT : lowT,
    heaterPowerW,
    xAxisMode,
    temperatureDisplayUnit: presetKey === "water" && rng.bool(0.5) ? "C" : "K",
    hiddenQuantities: options.hiddenQuantities ?? [
      "latentHeatFusionJPerKg",
      "totalEnergyJ",
    ],
  };
}

export type CalorimetryMixingArchetype =
  | "metal-in-water"
  | "ice-in-water-melt"
  | "ice-water-coexistence";

export function generateCalorimetryMixingScenario(
  seed: number | string,
  options: {
    archetype?: CalorimetryMixingArchetype;
    diagramVariant?: "calorimeter-schematic" | "convergence-graph";
    hiddenQuantities?: readonly string[];
  } = {},
): CalorimetryMixingScenarioSpec {
  const rng = createSeededRandom(seed);
  const archetype =
    options.archetype ??
    rng.pick<CalorimetryMixingArchetype>([
      "metal-in-water",
      "ice-in-water-melt",
      "ice-water-coexistence",
    ]);
  const diagramVariant =
    options.diagramVariant ??
    rng.pick(["calorimeter-schematic", "convergence-graph"]);
  const water = THERMAL_SUBSTANCE_PRESETS.water;

  if (archetype === "metal-in-water") {
    const metal = rng.pick(SOLID_CALORIMETRY_PRESETS);
    const metalMassKg = rng.pick([0.12, 0.18, 0.25, 0.35, 0.5]);
    const waterMassKg = rng.pick([0.2, 0.3, 0.4, 0.5]);
    const metalTempK = rng.pick([363.15, 373.15, 393.15, 423.15]);
    const waterTempK = rng.pick([288.15, 293.15, 295.15, 298.15]);

    return {
      kind: "calorimetry-mixing",
      id: `mix-metal-${hashSeed(seed)}`,
      components: [
        {
          id: "metal",
          label: `${metal.label} block`,
          massKg: metalMassKg,
          initialTemperatureK: metalTempK,
          specificHeatJPerKgK: metal.specificHeatJPerKgK,
        },
        {
          id: "water",
          label: "Water bath",
          massKg: waterMassKg,
          initialTemperatureK: waterTempK,
          specificHeatJPerKgK: water.specificHeatLiquidJPerKgK,
        },
      ],
      diagramVariant,
      hiddenQuantities: options.hiddenQuantities ?? ["equilibriumTemperatureK"],
    };
  }

  if (archetype === "ice-in-water-melt") {
    const iceMassKg = rng.pick([0.03, 0.04, 0.05]);
    const waterMassKg = rng.pick([0.35, 0.45, 0.6]);
    const iceTempK = rng.pick([258.15, 263.15, 268.15]);
    const waterTempK = rng.pick([318.15, 328.15, 338.15]);

    return {
      kind: "calorimetry-mixing",
      id: `mix-ice-melt-${hashSeed(seed)}`,
      components: [
        {
          id: "ice",
          label: "Ice sample",
          massKg: iceMassKg,
          initialTemperatureK: iceTempK,
          initialPhase: "solid",
          meltingPointK: water.meltingPointK,
          specificHeatSolidJPerKgK: water.specificHeatSolidJPerKgK,
          specificHeatLiquidJPerKgK: water.specificHeatLiquidJPerKgK,
          latentHeatFusionJPerKg: water.latentHeatFusionJPerKg,
        },
        {
          id: "water",
          label: "Warm water",
          massKg: waterMassKg,
          initialTemperatureK: waterTempK,
          specificHeatJPerKgK: water.specificHeatLiquidJPerKgK,
        },
      ],
      diagramVariant,
      hiddenQuantities: options.hiddenQuantities ?? ["equilibriumTemperatureK"],
    };
  }

  // ice-water-coexistence: large ice mass in moderate water -> lands at 273.15 K
  const iceMassKg = rng.pick([0.2, 0.25, 0.3]);
  const waterMassKg = rng.pick([0.2, 0.25, 0.3]);
  const waterTempK = rng.pick([288.15, 293.15, 298.15]);
  return {
    kind: "calorimetry-mixing",
    id: `mix-coexist-${hashSeed(seed)}`,
    components: [
      {
        id: "ice",
        label: "Melting ice",
        massKg: iceMassKg,
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
        massKg: waterMassKg,
        initialTemperatureK: waterTempK,
        specificHeatJPerKgK: water.specificHeatLiquidJPerKgK,
      },
    ],
    diagramVariant,
    hiddenQuantities: options.hiddenQuantities ?? [
      "equilibriumTemperatureK",
      "meltedMassKg",
    ],
  };
}

export function generateKineticTheoryScenario(
  seed: number | string,
  options: {
    withComparison?: boolean;
    hiddenQuantities?: readonly string[];
  } = {},
): KineticTheoryScenarioSpec {
  const rng = createSeededRandom(seed);
  const gas = rng.pick(MONATOMIC_GAS_PRESETS);
  const temperatureK = rng.pick([200, 250, 273, 300, 350, 400, 500, 600]);
  const withComp = options.withComparison ?? rng.bool(0.5);
  const comparisonTemperatureK = withComp
    ? Math.round(temperatureK * rng.pick([1.5, 2.0, 2.5]))
    : undefined;
  const includeContainer = rng.bool(0.6);

  return {
    kind: "kinetic-theory",
    id: `kinetic-${hashSeed(seed)}`,
    gasLabel: gas.label,
    temperatureK,
    molarMassKgPerMol: gas.molarMassKgPerMol,
    ...(includeContainer
      ? {
          moles: rng.pick([0.25, 0.5, 1.0, 2.0]),
          volumeM3: rng.pick([0.01, 0.02, 0.025, 0.05]),
        }
      : {}),
    ...(comparisonTemperatureK !== undefined ? { comparisonTemperatureK } : {}),
    hiddenQuantities: options.hiddenQuantities ?? [
      "rmsSpeedMs",
      "averageKineticEnergyJ",
    ],
  };
}

export function generateThermalRadiationScenario(
  seed: number | string,
  options: {
    withComparison?: boolean;
    hiddenQuantities?: readonly string[];
  } = {},
): ThermalRadiationScenarioSpec {
  const rng = createSeededRandom(seed);
  const regime = rng.pick(["stellar", "filament", "terrestrial"] as const);
  let temperatureK: number;
  let surfaceAreaM2: number;
  let emissivity: number;
  let bodyLabel: string;

  if (regime === "stellar") {
    temperatureK = rng.pick([4000, 4500, 5000, 5800, 6500, 7250]);
    surfaceAreaM2 = rng.pick([2.0e18, 6.1e18, 1.5e19]);
    emissivity = 1;
    bodyLabel = "Star A";
  } else if (regime === "filament") {
    temperatureK = rng.pick([2200, 2500, 2800, 2900]);
    surfaceAreaM2 = rng.pick([4.0e-5, 6.0e-5, 8.5e-5]);
    emissivity = rng.pick([0.4, 0.6, 0.8, 1]);
    bodyLabel = "Tungsten filament";
  } else {
    temperatureK = rng.pick([288, 310, 350, 450, 500]);
    surfaceAreaM2 = rng.pick([0.25, 0.8, 1.5, 2.0]);
    emissivity = rng.pick([0.7, 0.85, 0.9, 1]);
    bodyLabel = "Radiating surface";
  }

  const withComp = options.withComparison ?? rng.bool(0.45);
  const comparisonTemperatureK = withComp
    ? Math.round(temperatureK * rng.pick([0.75, 0.8, 1.25]))
    : undefined;

  return {
    kind: "thermal-radiation",
    id: `radiation-${hashSeed(seed)}`,
    bodyLabel,
    temperatureK,
    emissivity,
    surfaceAreaM2,
    ...(regime === "terrestrial" ? { ambientTemperatureK: 293 } : {}),
    ...(comparisonTemperatureK !== undefined
      ? {
          comparisonTemperatureK,
          comparisonEmissivity: emissivity,
          comparisonLabel: regime === "stellar" ? "Star B" : "Reference body",
        }
      : {}),
    hiddenQuantities: options.hiddenQuantities ?? [
      "peakWavelengthM",
      "radiatedPowerW",
    ],
  };
}

const ALL_THERMAL_SCENARIO_KINDS: readonly ThermalScenarioKind[] = [
  "thermodynamic-process",
  "carnot-cycle",
  "phase-change-curve",
  "calorimetry-mixing",
  "kinetic-theory",
  "thermal-radiation",
];

/**
 * Deterministic parametric generator dispatching to any ThermalScenarioKind.
 */
export function generateThermalScenario(
  seed: number | string,
  kind?: ThermalScenarioKind,
): ThermalScenarioSpec {
  const rng = createSeededRandom(seed);
  const chosenKind = kind ?? rng.pick(ALL_THERMAL_SCENARIO_KINDS);
  const subSeed = `${String(seed)}::${chosenKind}`;

  switch (chosenKind) {
    case "thermodynamic-process":
      return generateThermodynamicProcessScenario(subSeed);
    case "carnot-cycle":
      return generateCarnotCycleScenario(subSeed);
    case "phase-change-curve":
      return generatePhaseChangeScenario(subSeed);
    case "calorimetry-mixing":
      return generateCalorimetryMixingScenario(subSeed);
    case "kinetic-theory":
      return generateKineticTheoryScenario(subSeed);
    case "thermal-radiation":
      return generateThermalRadiationScenario(subSeed);
  }
}

/**
 * Deterministically sample a batch of valid parametric thermal scenarios
 * balanced across requested scenario kinds.
 */
export function generateThermalScenarioBatch(
  baseSeed: number | string,
  count: number,
  kinds: readonly ThermalScenarioKind[] = ALL_THERMAL_SCENARIO_KINDS,
): ThermalScenarioSpec[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Batch count must be a non-negative integer.");
  }
  if (count === 0) return [];
  if (kinds.length === 0) {
    throw new Error("At least one scenario kind must be specified.");
  }
  return Array.from({ length: count }, (_, index) => {
    const kind = kinds[index % kinds.length];
    return generateThermalScenario(`${String(baseSeed)}#${index}`, kind);
  });
}
