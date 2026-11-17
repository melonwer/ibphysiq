import { renderQuantumNuclearSvg } from "./render";
import { solveQuantumNuclearScenario } from "./solver";
import {
  EnergyLevelsScenarioSpec,
  GeneratedQuantumNuclearPackage,
  MatterWavesScenarioSpec,
  NuclearBindingScenarioSpec,
  NuclearDecayChainScenarioSpec,
  PhotoelectricScenarioSpec,
  QuantumNuclearGeneratorOptions,
  QuantumNuclearScenarioKind,
  QuantumNuclearScenarioSpec,
  RadioactiveDecayScenarioSpec,
  RutherfordScatteringScenarioSpec,
  SpecialRelativityScenarioSpec,
} from "./types";
import { validateQuantumNuclearScenario } from "./validate";

function hashSeed(seed: number | string): number {
  const text = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h === 0 ? 0x6d2b79f5 : h;
}

/**
 * Deterministic Mulberry32 PRNG returning floats in [0, 1).
 */
export function createSeededRng(seed: number | string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne<T>(rng: () => number, items: readonly T[]): T {
  const idx = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[idx];
}

function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function randomStep(
  rng: () => number,
  min: number,
  max: number,
  step: number,
): number {
  const count = Math.round((max - min) / step);
  return Number((min + randomInt(rng, 0, count) * step).toPrecision(10));
}

// ---------------------------------------------------------------------------
// Domain Scenario Generators
// ---------------------------------------------------------------------------

export function generateEnergyLevelsScenario(
  seed: number | string,
  options: QuantumNuclearGeneratorOptions = {},
): EnergyLevelsScenarioSpec {
  const rng = createSeededRng(`energy-levels:${seed}`);
  const hide = options.hideTargetQuantities ?? true;
  const useBohr = rng() < 0.55;

  if (useBohr) {
    const maxN = randomInt(rng, 4, 5);
    const isEmission = rng() < 0.7;
    const transitions = isEmission
      ? [
          { id: "t1", fromLevelId: "n=3", toLevelId: "n=2", label: "T₁" },
          { id: "t2", fromLevelId: "n=4", toLevelId: "n=2", label: "T₂" },
          { id: "t3", fromLevelId: "n=2", toLevelId: "n=1", label: "T₃" },
        ]
      : [
          { id: "t1", fromLevelId: "n=1", toLevelId: "n=2", label: "T₁" },
          { id: "t2", fromLevelId: "n=1", toLevelId: "n=3", label: "T₂" },
        ];
    return {
      id: `qn-el-${String(seed)}`,
      kind: "energy-levels",
      syllabus: options.syllabus,
      syllabusLevel: options.syllabusLevel,
      atomModel: "bohr-hydrogen",
      atomicNumberZ: 1,
      maxPrincipalN: maxN,
      includeContinuumZero: true,
      transitions,
      showSpectralStrip: true,
      ...(hide ? { hiddenQuantities: ["n=2"] } : {}),
    };
  }

  const presets = [
    {
      atomName: "Mercury vapour",
      levels: [
        { id: "g", label: "n = 1 (ground)", energyValue: -10.4, energyUnit: "eV" as const },
        { id: "e1", label: "n = 2", energyValue: -5.5, energyUnit: "eV" as const },
        { id: "e2", label: "n = 3", energyValue: -3.7, energyUnit: "eV" as const },
        { id: "e3", label: "n = 4", energyValue: -1.6, energyUnit: "eV" as const },
        { id: "ion", label: "n = ∞", energyValue: 0, energyUnit: "eV" as const },
      ],
    },
    {
      atomName: "Sodium vapour",
      levels: [
        { id: "g", label: "3s (ground)", energyValue: -5.14, energyUnit: "eV" as const },
        { id: "e1", label: "3p", energyValue: -3.03, energyUnit: "eV" as const },
        { id: "e2", label: "4s", energyValue: -1.95, energyUnit: "eV" as const },
        { id: "e3", label: "3d", energyValue: -1.52, energyUnit: "eV" as const },
        { id: "ion", label: "ionization", energyValue: 0, energyUnit: "eV" as const },
      ],
    },
  ];
  const chosen = pickOne(rng, presets);
  return {
    id: `qn-el-${String(seed)}`,
    kind: "energy-levels",
    syllabus: options.syllabus,
    syllabusLevel: options.syllabusLevel,
    atomModel: "custom",
    atomName: chosen.atomName,
    levels: chosen.levels,
    transitions: [
      { id: "t1", fromLevelId: "e2", toLevelId: "e1", label: "T₁" },
      { id: "t2", fromLevelId: "e1", toLevelId: "g", label: "T₂" },
      { id: "t3", fromLevelId: "e3", toLevelId: "e1", label: "T₃" },
    ],
    showSpectralStrip: true,
    ...(hide ? { hiddenQuantities: ["e1"] } : {}),
  };
}

export function generatePhotoelectricScenario(
  seed: number | string,
  options: QuantumNuclearGeneratorOptions = {},
): PhotoelectricScenarioSpec {
  const rng = createSeededRng(`photoelectric:${seed}`);
  const hide = options.hideTargetQuantities ?? true;
  const metals = [
    { name: "Caesium", wf: 1.95 },
    { name: "Potassium", wf: 2.3 },
    { name: "Sodium", wf: 2.28 },
    { name: "Calcium", wf: 2.87 },
    { name: "Magnesium", wf: 3.66 },
    { name: "Zinc", wf: 4.33 },
    { name: "Copper", wf: 4.7 },
  ] as const;

  const metal = pickOne(rng, metals);
  const f0Approx = (metal.wf * 1.6e-19) / 6.63e-34;
  const multiplier = randomStep(rng, 1.25, 2.1, 0.05);
  const incidentFrequencyHz = Number((f0Approx * multiplier).toPrecision(3));
  const plotMode = pickOne(rng, [
    "ek-ev-vs-f",
    "ek-j-vs-f",
    "stopping-potential-vs-f",
  ] as const);

  return {
    id: `qn-pe-${String(seed)}`,
    kind: "photoelectric-effect",
    syllabus: options.syllabus,
    syllabusLevel: options.syllabusLevel,
    metalName: metal.name,
    workFunctionEv: metal.wf,
    incidentFrequencyHz,
    plotMode,
    showExtrapolation: true,
    showOperatingPoint: true,
    ...(hide
      ? {
          hiddenQuantities: [
            "thresholdFrequencyHz",
            "stoppingPotentialV",
            "maxKineticEnergyEv",
          ],
        }
      : {}),
  };
}

export function generateMatterWavesScenario(
  seed: number | string,
  options: QuantumNuclearGeneratorOptions = {},
): MatterWavesScenarioSpec {
  const rng = createSeededRng(`matter-waves:${seed}`);
  const hide = options.hideTargetQuantities ?? true;
  const particle = pickOne(rng, [
    "electron",
    "electron",
    "proton",
    "alpha",
    "neutron",
  ] as const);

  if (particle === "neutron") {
    const speedMs = randomStep(rng, 1800, 4400, 200);
    return {
      id: `qn-mw-${String(seed)}`,
      kind: "matter-waves",
      syllabus: options.syllabus,
      syllabusLevel: options.syllabusLevel,
      particle: "neutron",
      speedMs,
      latticeSpacingM: 3.14e-10,
      screenDistanceM: 0.25,
      ...(hide ? { hiddenQuantities: ["deBroglieWavelengthM"] } : {}),
    };
  }

  const voltageV =
    particle === "electron"
      ? randomStep(rng, 150, 2400, 50)
      : randomStep(rng, 400, 4000, 200);
  const withDiffraction = particle === "electron" && rng() < 0.7;

  return {
    id: `qn-mw-${String(seed)}`,
    kind: "matter-waves",
    syllabus: options.syllabus,
    syllabusLevel: options.syllabusLevel,
    particle,
    acceleratingVoltageV: voltageV,
    ...(withDiffraction
      ? { latticeSpacingM: 2.13e-10, screenDistanceM: 0.14 }
      : {}),
    ...(hide ? { hiddenQuantities: ["deBroglieWavelengthM"] } : {}),
  };
}

export function generateRadioactiveDecayScenario(
  seed: number | string,
  options: QuantumNuclearGeneratorOptions = {},
): RadioactiveDecayScenarioSpec {
  const rng = createSeededRng(`radioactive-decay:${seed}`);
  const hide = options.hideTargetQuantities ?? true;

  const isotopes = [
    { label: "⁹⁹ᵐTc", halfLife: 6.0, unit: "h" as const },
    { label: "¹³¹I", halfLife: 8.0, unit: "d" as const },
    { label: "¹⁴C", halfLife: 5730, unit: "yr" as const },
    { label: "²⁴Na", halfLife: 15.0, unit: "h" as const },
    { label: "¹³⁷ᵐBa", halfLife: 156, unit: "s" as const },
  ];
  const iso = pickOne(rng, isotopes);
  const halfLivesElapsed = randomStep(rng, 1.5, 3.5, 0.5);
  const elapsedTime = Number((iso.halfLife * halfLivesElapsed).toPrecision(4));
  const useCountRate = rng() < 0.6;

  if (useCountRate) {
    const bg = randomStep(rng, 18, 42, 4);
    const net0 = randomStep(rng, 320, 800, 40);
    return {
      id: `qn-rd-${String(seed)}`,
      kind: "radioactive-decay",
      syllabus: options.syllabus,
      syllabusLevel: options.syllabusLevel,
      nuclideLabel: iso.label,
      timeUnit: iso.unit,
      halfLife: iso.halfLife,
      elapsedTime,
      initialTotalCountRate: net0 + bg,
      backgroundCountRate: bg,
      plotQuantity: "count-rate",
      ...(hide
        ? { hiddenQuantities: ["halfLife", "remainingTotalCountRate"] }
        : {}),
    };
  }

  const initialActivityBq = randomStep(rng, 2.0, 9.6, 0.4) * 1e6;
  return {
    id: `qn-rd-${String(seed)}`,
    kind: "radioactive-decay",
    syllabus: options.syllabus,
    syllabusLevel: options.syllabusLevel,
    nuclideLabel: iso.label,
    timeUnit: iso.unit,
    halfLife: iso.halfLife,
    elapsedTime,
    initialActivityBq,
    plotQuantity: "activity",
    ...(hide ? { hiddenQuantities: ["remainingActivityBq"] } : {}),
  };
}

export function generateNuclearDecayChainScenario(
  seed: number | string,
  options: QuantumNuclearGeneratorOptions = {},
): NuclearDecayChainScenarioSpec {
  const rng = createSeededRng(`decay-chain:${seed}`);
  const hide = options.hideTargetQuantities ?? true;

  const seriesPresets = [
    {
      parent: { massNumberA: 238, atomicNumberZ: 92, symbol: "U" },
      steps: [
        { id: "s1", mode: "alpha" as const },
        { id: "s2", mode: "beta-minus" as const },
        { id: "s3", mode: "beta-minus" as const },
        { id: "s4", mode: "alpha" as const },
      ],
    },
    {
      parent: { massNumberA: 232, atomicNumberZ: 90, symbol: "Th" },
      steps: [
        { id: "s1", mode: "alpha" as const },
        { id: "s2", mode: "beta-minus" as const },
        { id: "s3", mode: "beta-minus" as const },
      ],
    },
    {
      parent: { massNumberA: 226, atomicNumberZ: 88, symbol: "Ra" },
      steps: [
        { id: "s1", mode: "alpha" as const },
        { id: "s2", mode: "alpha" as const },
        { id: "s3", mode: "beta-minus" as const },
      ],
    },
    {
      parent: { massNumberA: 18, atomicNumberZ: 9, symbol: "F" },
      steps: [
        { id: "s1", mode: "beta-plus" as const },
        { id: "s2", mode: "gamma" as const },
      ],
    },
  ];

  const chosen = pickOne(rng, seriesPresets);
  const chartAxes = rng() < 0.7 ? "N-vs-Z" : "A-vs-Z";

  return {
    id: `qn-dc-${String(seed)}`,
    kind: "nuclear-decay-chain",
    syllabus: options.syllabus,
    syllabusLevel: options.syllabusLevel,
    parentNuclide: chosen.parent,
    steps: chosen.steps,
    chartAxes,
    showStabilityLine: true,
    ...(hide ? { hiddenQuantities: ["finalNuclide", "daughterNuclides"] } : {}),
  };
}

export function generateNuclearBindingScenario(
  seed: number | string,
  options: QuantumNuclearGeneratorOptions = {},
): NuclearBindingScenarioSpec {
  const rng = createSeededRng(`nuclear-binding:${seed}`);
  const hide = options.hideTargetQuantities ?? true;

  if (rng() < 0.5) {
    const nuclides = [
      { A: 4, Z: 2, symbol: "He", nuclearMassU: 4.001506 },
      { A: 12, Z: 6, symbol: "C", nuclearMassU: 11.996709 },
      { A: 16, Z: 8, symbol: "O", nuclearMassU: 15.990526 },
      { A: 56, Z: 26, symbol: "Fe", nuclearMassU: 55.920674 },
      { A: 235, Z: 92, symbol: "U", nuclearMassU: 234.99345 },
    ];
    const nuc = pickOne(rng, nuclides);
    return {
      id: `qn-nb-${String(seed)}`,
      kind: "nuclear-binding",
      syllabus: options.syllabus,
      syllabusLevel: options.syllabusLevel,
      calculationMode: "single-nuclide",
      massNumberA: nuc.A,
      atomicNumberZ: nuc.Z,
      symbol: nuc.symbol,
      nuclearMassU: nuc.nuclearMassU,
      diagramStyle: rng() < 0.7 ? "binding-curve" : "mass-energy-balance",
      ...(hide
        ? {
            hiddenQuantities: [
              "bindingEnergyMeV",
              "bindingEnergyPerNucleonMeV",
              "massDefectU",
            ],
          }
        : {}),
    };
  }

  const isFusion = rng() < 0.5;
  if (isFusion) {
    return {
      id: `qn-nb-${String(seed)}`,
      kind: "nuclear-binding",
      syllabus: options.syllabus,
      syllabusLevel: options.syllabusLevel,
      calculationMode: "reaction",
      reactionType: "fusion",
      reactants: [
        { id: "r1", symbol: "H", massNumberA: 2, atomicNumberZ: 1, massU: 2.013553 },
        { id: "r2", symbol: "H", massNumberA: 3, atomicNumberZ: 1, massU: 3.015501 },
      ],
      products: [
        { id: "p1", symbol: "He", massNumberA: 4, atomicNumberZ: 2, massU: 4.001506 },
        { id: "p2", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
      ],
      diagramStyle: "mass-energy-balance",
      ...(hide ? { hiddenQuantities: ["qValueMeV", "massDifferenceU"] } : {}),
    };
  }

  return {
    id: `qn-nb-${String(seed)}`,
    kind: "nuclear-binding",
    syllabus: options.syllabus,
    syllabusLevel: options.syllabusLevel,
    calculationMode: "reaction",
    reactionType: "fission",
    reactants: [
      { id: "r1", symbol: "U", massNumberA: 235, atomicNumberZ: 92, massU: 234.99345 },
      { id: "r2", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
    ],
    products: [
      { id: "p1", symbol: "Ba", massNumberA: 141, atomicNumberZ: 56, massU: 140.88354 },
      { id: "p2", symbol: "Kr", massNumberA: 92, atomicNumberZ: 36, massU: 91.90645 },
      { id: "p3", symbol: "n", massNumberA: 1, atomicNumberZ: 0, count: 3, massU: 1.008665 },
    ],
    diagramStyle: "mass-energy-balance",
    ...(hide ? { hiddenQuantities: ["qValueMeV", "massDifferenceU"] } : {}),
  };
}

export function generateRutherfordScatteringScenario(
  seed: number | string,
  options: QuantumNuclearGeneratorOptions = {},
): RutherfordScatteringScenarioSpec {
  const rng = createSeededRng(`rutherford:${seed}`);
  const hide = options.hideTargetQuantities ?? true;

  const targets = [
    { symbol: "Au", Z: 79, A: 197 },
    { symbol: "Ag", Z: 47, A: 107 },
    { symbol: "Cu", Z: 29, A: 63 },
    { symbol: "Pb", Z: 82, A: 208 },
  ];
  const target = pickOne(rng, targets);
  const projectileChargeZ = rng() < 0.8 ? 2 : 1;
  const kineticEnergyMeV = randomStep(rng, 4.0, 7.6, 0.4);

  return {
    id: `qn-rs-${String(seed)}`,
    kind: "rutherford-scattering",
    syllabus: options.syllabus,
    syllabusLevel: options.syllabusLevel,
    projectileChargeZ,
    targetSymbol: target.symbol,
    targetChargeZ: target.Z,
    targetMassNumberA: target.A,
    kineticEnergyMeV,
    showDeflectedPaths: true,
    ...(hide
      ? {
          hiddenQuantities: [
            "closestApproachFm",
            "closestApproachM",
            "estimatedNuclearRadiusFm",
          ],
        }
      : {}),
  };
}

export function generateSpecialRelativityScenario(
  seed: number | string,
  options: QuantumNuclearGeneratorOptions = {},
): SpecialRelativityScenarioSpec {
  const rng = createSeededRng(`special-relativity:${seed}`);
  const hide = options.hideTargetQuantities ?? true;

  const beta = pickOne(rng, [0.5, 0.6, 0.8, 0.9, 0.96, -0.6]);
  const properTimeS = randomStep(rng, 1.5, 8.0, 0.5);
  const properLengthM = randomStep(rng, 20, 120, 10);
  const objectVelocityFractionC = pickOne(rng, [0.4, 0.5, 0.75, -0.5]);

  return {
    id: `qn-sr-${String(seed)}`,
    kind: "special-relativity",
    syllabus: options.syllabus,
    syllabusLevel: options.syllabusLevel,
    beta,
    properTimeS,
    properLengthM,
    objectVelocityFractionC,
    domainLightSeconds: 5,
    symmetricTimeAxis: true,
    showLightCone: true,
    showPrimedAxes: true,
    events: [
      { id: "e1", label: "A", xLightSeconds: 2, ctLightSeconds: 3.5, showProjections: true },
      { id: "e2", label: "B", xLightSeconds: 3.5, ctLightSeconds: 2, showProjections: false },
    ],
    worldlines: [
      { id: "w1", label: "probe", beta: objectVelocityFractionC },
    ],
    ...(hide
      ? {
          hiddenQuantities: [
            "lorentzFactor",
            "dilatedTimeS",
            "contractedLengthM",
            "transformedVelocityFractionC",
          ],
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Unified Parametric Dispatcher & Batch Generator
// ---------------------------------------------------------------------------

const CORE_MODERN_KINDS: readonly QuantumNuclearScenarioKind[] = [
  "energy-levels",
  "photoelectric-effect",
  "matter-waves",
  "radioactive-decay",
  "nuclear-decay-chain",
  "nuclear-binding",
  "rutherford-scattering",
];

const ALL_KINDS: readonly QuantumNuclearScenarioKind[] = [
  ...CORE_MODERN_KINDS,
  "special-relativity",
];

export function sampleQuantumNuclearSpec(
  seed: number | string,
  options: QuantumNuclearGeneratorOptions = {},
): QuantumNuclearScenarioSpec {
  const rng = createSeededRng(`dispatch:${seed}`);
  const restrictRelativity =
    (options.syllabus === "ib" && options.syllabusLevel === "SL") ||
    options.syllabus === "ncuk";
  const pool = restrictRelativity ? CORE_MODERN_KINDS : ALL_KINDS;
  const kind = options.kind ?? pickOne(rng, pool);

  switch (kind) {
    case "energy-levels":
      return generateEnergyLevelsScenario(seed, options);
    case "photoelectric-effect":
      return generatePhotoelectricScenario(seed, options);
    case "matter-waves":
      return generateMatterWavesScenario(seed, options);
    case "radioactive-decay":
      return generateRadioactiveDecayScenario(seed, options);
    case "nuclear-decay-chain":
      return generateNuclearDecayChainScenario(seed, options);
    case "nuclear-binding":
      return generateNuclearBindingScenario(seed, options);
    case "rutherford-scattering":
      return generateRutherfordScatteringScenario(seed, options);
    case "special-relativity":
      return generateSpecialRelativityScenario(seed, options);
  }
}

export function generateQuantumNuclearScenario(
  seed: number | string,
  options: QuantumNuclearGeneratorOptions = {},
): GeneratedQuantumNuclearPackage {
  const spec = sampleQuantumNuclearSpec(seed, options);
  const validation = validateQuantumNuclearScenario(spec);
  if (!validation.valid) {
    throw new Error(
      `Generated scenario failed validation: ${validation.issues
        .map((i) => i.message)
        .join("; ")}`,
    );
  }
  const solution = solveQuantumNuclearScenario(spec);
  const svg = renderQuantumNuclearSvg(spec);
  return {
    seed: String(seed),
    spec,
    validation,
    solution,
    svg,
  };
}

export function generateQuantumNuclearBatch(
  count: number,
  baseSeed: number | string,
  options: QuantumNuclearGeneratorOptions = {},
): GeneratedQuantumNuclearPackage[] {
  if (!Number.isInteger(count) || count < 0 || count > 10000) {
    throw new Error("Batch count must be an integer between 0 and 10000");
  }
  const results: GeneratedQuantumNuclearPackage[] = [];
  for (let i = 0; i < count; i += 1) {
    results.push(
      generateQuantumNuclearScenario(`${String(baseSeed)}:${i}`, options),
    );
  }
  return results;
}
