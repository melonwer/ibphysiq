import {
  ATOMIC_MASS_UNIT_KG,
  AcGeneratorSpec,
  BainbridgeSpectrometerSpec,
  CapacitorNetworkSpec,
  ELECTRON_MASS_KG,
  ELEMENTARY_CHARGE_C,
  EM_INDUCTION_SCENARIO_KINDS,
  ElectricDeflectionSpec,
  EmInductionScenarioKind,
  EmInductionScenarioSpec,
  FluxFaradaySpec,
  MagneticCyclotronSpec,
  MagneticFieldPageDirection,
  MotionalEmfRailsSpec,
  PROTON_MASS_KG,
  ParallelPlateCapacitorSpec,
  PlatePolarity,
  RcTransientSpec,
  TransformerSpec,
  VelocitySelectorSpec,
} from "./types";

export interface SeededRng {
  nextFloat(): number;
  nextInt(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  nextBool(trueProbability?: number): boolean;
}

function hashSeed(seed: number | string): number {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    let x = Math.trunc(seed) >>> 0;
    if (x === 0) x = 0x9e3779b9;
    return x;
  }
  const text = String(seed);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash === 0 ? 0x9e3779b9 : hash;
}

export function createSeededRng(seed: number | string): SeededRng {
  let state = hashSeed(seed);
  const nextFloat = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    nextFloat,
    nextInt(minInclusive: number, maxInclusive: number): number {
      const span = maxInclusive - minInclusive + 1;
      return minInclusive + Math.floor(nextFloat() * span);
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error("Cannot pick from an empty list");
      }
      return items[Math.floor(nextFloat() * items.length)];
    },
    nextBool(trueProbability = 0.5): boolean {
      return nextFloat() < trueProbability;
    },
  };
}

export function generateParallelPlateCapacitorScenario(
  seed: number | string,
  overrides: Partial<Omit<ParallelPlateCapacitorSpec, "kind">> = {},
): ParallelPlateCapacitorSpec {
  const rng = createSeededRng(seed);
  const areas = [0.012, 0.02, 0.025, 0.04, 0.05, 0.08];
  const separations = [0.001, 0.0015, 0.002, 0.0025, 0.004, 0.005];
  const dielectrics = [1, 1, 2.2, 3.5, 4.5, 6.0];
  const voltages = [12, 24, 50, 100, 150, 200];

  const plateSeparationM = rng.pick(separations);
  const er = rng.pick(dielectrics);
  const includeChange = rng.nextBool(0.45);
  const afterChange = includeChange
    ? {
        constraint: rng.pick([
          "constant-voltage",
          "isolated-charge",
        ] as const),
        newSeparationM: Number(
          (plateSeparationM * rng.pick([0.5, 1.5, 2])).toPrecision(4),
        ),
      }
    : undefined;

  return {
    kind: "parallel-plate-capacitor",
    plateAreaM2: rng.pick(areas),
    plateSeparationM,
    relativePermittivity: er,
    voltageV: rng.pick(voltages),
    afterChange,
    hiddenQuantities: [
      rng.pick(["capacitanceF", "storedEnergyJ", "chargeC", "electricFieldVm"]),
    ],
    ...overrides,
  };
}

export function generateCapacitorNetworkScenario(
  seed: number | string,
  overrides: Partial<Omit<CapacitorNetworkSpec, "kind">> = {},
): CapacitorNetworkSpec {
  const rng = createSeededRng(seed);
  const capsUf = [10, 15, 20, 30, 40, 50, 60, 100];
  const voltages = [6, 9, 12, 18, 24, 36];
  const arrangement = rng.pick([
    "series",
    "parallel",
    "series-parallel",
    "charge-sharing",
  ] as const);

  if (arrangement === "series" || arrangement === "parallel") {
    const count = rng.pick([2, 3]);
    const capacitancesF = Array.from(
      { length: count },
      () => rng.pick(capsUf) * 1e-6,
    );
    return {
      kind: "capacitor-network",
      topology: {
        arrangement,
        capacitancesF,
        supplyVoltageV: rng.pick(voltages),
      },
      hiddenQuantities: [
        rng.pick([
          "equivalentCapacitanceF",
          "totalChargeC",
          "totalStoredEnergyJ",
        ]),
      ],
      ...overrides,
    };
  }

  if (arrangement === "series-parallel") {
    return {
      kind: "capacitor-network",
      topology: {
        arrangement: "series-parallel",
        seriesCapacitanceF: rng.pick(capsUf) * 1e-6,
        parallelCapacitancesF: [
          rng.pick(capsUf) * 1e-6,
          rng.pick(capsUf) * 1e-6,
        ],
        supplyVoltageV: rng.pick(voltages),
      },
      hiddenQuantities: [
        rng.pick([
          "equivalentCapacitanceF",
          "totalChargeC",
          "totalStoredEnergyJ",
        ]),
      ],
      ...overrides,
    };
  }

  return {
    kind: "capacitor-network",
    topology: {
      arrangement: "charge-sharing",
      c1F: rng.pick(capsUf) * 1e-6,
      c2F: rng.pick(capsUf) * 1e-6,
      v1InitialV: rng.pick([12, 18, 24, 30]),
      v2InitialV: rng.pick([0, 0, 6]),
      polarity: "same",
    },
    hiddenQuantities: [
      rng.pick(["finalCommonVoltageV", "energyDissipatedJ"]),
    ],
    ...overrides,
  };
}

export function generateRcTransientScenario(
  seed: number | string,
  overrides: Partial<Omit<RcTransientSpec, "kind">> = {},
): RcTransientSpec {
  const rng = createSeededRng(seed);
  const resistancesOhm = [1000, 2000, 4000, 5000, 10000, 20000, 50000];
  const capacitancesF = [10e-6, 20e-6, 47e-6, 50e-6, 100e-6, 220e-6];
  const voltages = [6, 9, 10, 12, 15, 20];
  const mode = rng.pick(["charging", "discharging"] as const);
  const resistanceOhm = rng.pick(resistancesOhm);
  const capacitanceF = rng.pick(capacitancesF);
  const tau = resistanceOhm * capacitanceF;
  const queryMultipliers = [0.5, 1, 1.5, 2];
  const queryTimeS = Number((tau * rng.pick(queryMultipliers)).toPrecision(4));

  return {
    kind: "rc-transient",
    mode,
    resistanceOhm,
    capacitanceF,
    supplyVoltageV: rng.pick(voltages),
    queryTimeS,
    durationTimeConstants: 5,
    plottedQuantity: rng.pick([
      "capacitor-voltage",
      "current",
      "charge",
    ] as const),
    hiddenQuantities: [
      rng.pick([
        "timeConstantS",
        "halfTimeS",
        "capacitorVoltageAtQueryV",
        "currentAtQueryA",
      ]),
    ],
    ...overrides,
  };
}

export function generateFluxFaradayScenario(
  seed: number | string,
  overrides: Partial<Omit<FluxFaradaySpec, "kind">> = {},
): FluxFaradaySpec {
  const rng = createSeededRng(seed);
  const turns = rng.pick([50, 80, 120, 200, 250, 500]);
  const coilAreaM2 = rng.pick([0.004, 0.008, 0.012, 0.02, 0.025, 0.04]);
  const b1 = rng.pick([0.05, 0.12, 0.2, 0.35, 0.5]);
  const b2 = rng.pick([0, -b1, 2 * b1, 0.6]);
  const initialAngleDegrees = rng.pick([0, 0, 30, 45, 60]);
  const finalAngleDegrees =
    b2 === b1 ? rng.pick([60, 90, 180]) : initialAngleDegrees;

  return {
    kind: "flux-faraday",
    turns,
    coilAreaM2,
    initialFieldT: b1,
    finalFieldT: b2,
    initialAngleDegrees,
    finalAngleDegrees,
    timeIntervalS: rng.pick([0.02, 0.04, 0.05, 0.1, 0.2, 0.25]),
    coilResistanceOhm: rng.pick([2, 4, 5, 8, 10, 20]),
    hiddenQuantities: [
      rng.pick([
        "averageEmfMagnitudeV",
        "averageInducedCurrentA",
        "inducedChargeC",
      ]),
    ],
    ...overrides,
  };
}

export function generateMotionalEmfRailsScenario(
  seed: number | string,
  overrides: Partial<Omit<MotionalEmfRailsSpec, "kind">> = {},
): MotionalEmfRailsSpec {
  const rng = createSeededRng(seed);
  return {
    kind: "motional-emf-rails",
    magneticFieldT: rng.pick([0.15, 0.25, 0.4, 0.5, 0.8, 1.2]),
    fieldDirection: rng.pick(["into-page", "out-of-page"] as const),
    railSeparationM: rng.pick([0.12, 0.15, 0.2, 0.25, 0.3, 0.4]),
    rodSpeedMs: rng.pick([1.5, 2.0, 3.0, 4.0, 5.0, 6.0]),
    rodDirection: rng.pick(["right", "left"] as const),
    loadResistanceOhm: rng.pick([0.5, 1.2, 2.0, 2.5, 4.0, 5.0]),
    rodResistanceOhm: rng.pick([0, 0, 0.3, 0.5]),
    hiddenQuantities: [
      rng.pick([
        "motionalEmfV",
        "inducedCurrentA",
        "magneticBrakingForceN",
        "mechanicalPowerW",
      ]),
    ],
    ...overrides,
  };
}

export function generateAcGeneratorScenario(
  seed: number | string,
  overrides: Partial<Omit<AcGeneratorSpec, "kind">> = {},
): AcGeneratorSpec {
  const rng = createSeededRng(seed);
  const frequencyHz = rng.pick([25, 40, 50, 60, 100]);
  return {
    kind: "ac-generator",
    turns: rng.pick([40, 100, 150, 200, 250, 400]),
    coilAreaM2: rng.pick([0.005, 0.01, 0.015, 0.02, 0.03]),
    magneticFieldT: rng.pick([0.1, 0.2, 0.25, 0.4, 0.5]),
    frequencyHz,
    loadResistanceOhm: rng.pick([10, 20, 25, 50, 100]),
    cyclesShown: 2,
    showFluxCurve: rng.nextBool(0.5),
    hiddenQuantities: [
      rng.pick(["peakEmfV", "rmsVoltageV", "rmsCurrentA", "meanPowerW"]),
    ],
    ...overrides,
  };
}

export function generateTransformerScenario(
  seed: number | string,
  overrides: Partial<Omit<TransformerSpec, "kind">> = {},
): TransformerSpec {
  const rng = createSeededRng(seed);
  const primaryTurns = rng.pick([200, 400, 500, 800, 1200, 2000]);
  const ratio = rng.pick([0.05, 0.1, 0.2, 0.5, 2, 4, 5]);
  const secondaryTurns = Math.max(10, Math.round(primaryTurns * ratio));
  return {
    kind: "transformer",
    primaryVoltageRmsV: rng.pick([110, 120, 230, 240, 400]),
    primaryTurns,
    secondaryTurns,
    efficiency: rng.pick([1, 1, 0.96, 0.92, 0.88, 0.85]),
    loadResistanceOhm: rng.pick([8, 12, 20, 48, 100]),
    supplyFrequencyHz: rng.pick([50, 60]),
    hiddenQuantities: [
      rng.pick([
        "secondaryVoltageRmsV",
        "primaryCurrentRmsA",
        "inputPowerW",
        "powerLossW",
      ]),
    ],
    ...overrides,
  };
}

export function generateElectricDeflectionScenario(
  seed: number | string,
  overrides: Partial<Omit<ElectricDeflectionSpec, "kind">> = {},
): ElectricDeflectionSpec {
  const rng = createSeededRng(seed);
  const isElectron = rng.nextBool(0.55);
  const chargeC = isElectron ? -ELEMENTARY_CHARGE_C : ELEMENTARY_CHARGE_C;
  const massKg = isElectron ? ELECTRON_MASS_KG : PROTON_MASS_KG;
  const plateLengthM = rng.pick([0.05, 0.06, 0.08, 0.1]);
  const plateSeparationM = rng.pick([0.03, 0.04, 0.05]);
  const plateVoltageV = isElectron
    ? rng.pick([80, 120, 160, 200])
    : rng.pick([200, 300, 400, 500]);
  const initialSpeedMs = isElectron
    ? rng.pick([2.2e7, 2.5e7, 2.8e7])
    : rng.pick([6.5e5, 8.0e5, 1.0e6]);

  return {
    kind: "electric-deflection",
    chargeC,
    massKg,
    initialSpeedMs,
    plateLengthM,
    plateSeparationM,
    plateVoltageV,
    topPlatePolarity: rng.pick(["positive", "negative"] as const),
    driftDistanceAfterPlatesM: rng.pick([0, 0.12, 0.2]),
    hiddenQuantities: [
      rng.pick([
        "plateDeflectionYM",
        "deflectionAngleDegrees",
        "exitSpeedMs",
      ]),
    ],
    ...overrides,
  };
}

export function generateMagneticCyclotronScenario(
  seed: number | string,
  overrides: Partial<Omit<MagneticCyclotronSpec, "kind">> = {},
): MagneticCyclotronSpec {
  const rng = createSeededRng(seed);
  const species = rng.pick(["electron", "proton", "alpha"] as const);
  const chargeC =
    species === "electron"
      ? -ELEMENTARY_CHARGE_C
      : species === "proton"
        ? ELEMENTARY_CHARGE_C
        : 2 * ELEMENTARY_CHARGE_C;
  const massKg =
    species === "electron"
      ? ELECTRON_MASS_KG
      : species === "proton"
        ? PROTON_MASS_KG
        : 4 * ATOMIC_MASS_UNIT_KG;
  const magneticFieldT =
    species === "electron"
      ? rng.pick([1.5e-3, 2.5e-3, 4.0e-3, 6.0e-3])
      : rng.pick([0.15, 0.25, 0.4, 0.6]);
  const speedMs =
    species === "electron"
      ? rng.pick([8.0e6, 1.2e7, 1.8e7, 2.4e7])
      : rng.pick([1.5e6, 2.5e6, 4.0e6, 6.0e6]);

  return {
    kind: "magnetic-cyclotron",
    chargeC,
    massKg,
    magneticFieldT,
    fieldDirection: rng.pick(["into-page", "out-of-page"] as const),
    speedMs,
    arcSweepDegrees: rng.pick([180, 180, 360]),
    hiddenQuantities: [
      rng.pick(["cyclotronRadiusM", "periodS", "frequencyHz"]),
    ],
    ...overrides,
  };
}

export function generateVelocitySelectorScenario(
  seed: number | string,
  overrides: Partial<Omit<VelocitySelectorSpec, "kind">> = {},
): VelocitySelectorSpec {
  const rng = createSeededRng(seed);
  const fieldDirection: MagneticFieldPageDirection = rng.pick([
    "into-page",
    "out-of-page",
  ] as const);
  const topPlatePolarity: PlatePolarity =
    fieldDirection === "into-page" ? "positive" : "negative";
  const electricFieldVm = rng.pick([1.2e4, 2.4e4, 3.6e4, 4.8e4, 6.0e4]);
  const magneticFieldT = rng.pick([0.08, 0.12, 0.15, 0.2, 0.3]);
  const vSel = electricFieldVm / magneticFieldT;
  const speedFactor = rng.pick([1, 1, 0.75, 1.25]);

  return {
    kind: "velocity-selector",
    chargeC: rng.pick([ELEMENTARY_CHARGE_C, -ELEMENTARY_CHARGE_C]),
    massKg: rng.pick([PROTON_MASS_KG, 20 * ATOMIC_MASS_UNIT_KG]),
    electricFieldVm,
    magneticFieldT,
    fieldDirection,
    topPlatePolarity,
    particleSpeedMs: Number((vSel * speedFactor).toPrecision(6)),
    selectorLengthM: 0.12,
    hiddenQuantities: ["selectedSpeedMs"],
    ...overrides,
  };
}

export function generateBainbridgeSpectrometerScenario(
  seed: number | string,
  overrides: Partial<Omit<BainbridgeSpectrometerSpec, "kind">> = {},
): BainbridgeSpectrometerSpec {
  const rng = createSeededRng(seed);
  const isotopePair = rng.pick([
    { m1: 12, m2: 14, z: 1 },
    { m1: 20, m2: 22, z: 1 },
    { m1: 24, m2: 26, z: 2 },
    { m1: 35, m2: 37, z: 1 },
  ] as const);
  const b1 = rng.pick([0.2, 0.25, 0.4, 0.5]);
  const b2 = rng.pick([b1, 0.3, 0.5, 0.6]);

  return {
    kind: "bainbridge-mass-spectrometer",
    chargeC: isotopePair.z * ELEMENTARY_CHARGE_C,
    massKg: isotopePair.m1 * ATOMIC_MASS_UNIT_KG,
    comparisonMassKg: isotopePair.m2 * ATOMIC_MASS_UNIT_KG,
    selectorElectricFieldVm: rng.pick([4.0e4, 6.0e4, 8.0e4, 1.0e5]),
    selectorMagneticFieldT: b1,
    deflectionMagneticFieldT: b2,
    deflectionFieldDirection: rng.pick(["into-page", "out-of-page"] as const),
    hiddenQuantities: [
      rng.pick(["primaryRadiusM", "strikeSeparationM", "selectedSpeedMs"]),
    ],
    ...overrides,
  };
}

export function generateEmInductionScenario(
  seed: number | string,
  kind?: EmInductionScenarioKind,
): EmInductionScenarioSpec {
  const rng = createSeededRng(seed);
  const chosenKind = kind ?? rng.pick(EM_INDUCTION_SCENARIO_KINDS);
  switch (chosenKind) {
    case "parallel-plate-capacitor":
      return generateParallelPlateCapacitorScenario(seed);
    case "capacitor-network":
      return generateCapacitorNetworkScenario(seed);
    case "rc-transient":
      return generateRcTransientScenario(seed);
    case "flux-faraday":
      return generateFluxFaradayScenario(seed);
    case "motional-emf-rails":
      return generateMotionalEmfRailsScenario(seed);
    case "ac-generator":
      return generateAcGeneratorScenario(seed);
    case "transformer":
      return generateTransformerScenario(seed);
    case "electric-deflection":
      return generateElectricDeflectionScenario(seed);
    case "magnetic-cyclotron":
      return generateMagneticCyclotronScenario(seed);
    case "velocity-selector":
      return generateVelocitySelectorScenario(seed);
    case "bainbridge-mass-spectrometer":
      return generateBainbridgeSpectrometerScenario(seed);
    default: {
      const exhaustive: never = chosenKind;
      throw new Error(`Unsupported EM induction scenario kind: ${exhaustive}`);
    }
  }
}

export function generateEmInductionScenarioBatch(
  baseSeed: number | string,
  count: number,
  kinds: readonly EmInductionScenarioKind[] = EM_INDUCTION_SCENARIO_KINDS,
): EmInductionScenarioSpec[] {
  if (!Number.isInteger(count) || count < 0 || count > 10000) {
    throw new Error("Batch count must be a non-negative integer <= 10000");
  }
  if (kinds.length === 0) {
    throw new Error("Scenario kinds list cannot be empty");
  }
  return Array.from({ length: count }, (_, index) => {
    const kind = kinds[index % kinds.length];
    return generateEmInductionScenario(`${baseSeed}::${index}::${kind}`, kind);
  });
}
