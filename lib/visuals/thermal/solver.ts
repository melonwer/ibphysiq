import {
  AVOGADRO_CONSTANT,
  BOLTZMANN_CONSTANT,
  ELEMENTARY_CHARGE,
  KELVIN_OFFSET,
  MOLAR_GAS_CONSTANT,
  MONATOMIC_ADIABATIC_GAMMA,
  PLANCK_WIEN_ROOT,
  STEFAN_BOLTZMANN_CONSTANT,
  WIEN_DISPLACEMENT_CONSTANT,
} from "./constants";
import {
  CalorimetryComponentSpec,
  CalorimetryMixingScenarioSpec,
  CalorimetryMixingSolution,
  CarnotCycleScenarioSpec,
  CarnotCycleSolution,
  KineticTheoryScenarioSpec,
  KineticTheorySolution,
  MatterPhase,
  PhaseChangeScenarioSpec,
  PhaseChangeSolution,
  PhaseStageKind,
  SolvedGasState,
  SolvedMixingComponent,
  SolvedPhaseStage,
  SolvedProcessLeg,
  ThermalProcessKind,
  ThermalProcessStepSpec,
  ThermalRadiationScenarioSpec,
  ThermalRadiationSolution,
  ThermalScenarioSolution,
  ThermalScenarioSpec,
  ThermodynamicCycleMetrics,
  ThermodynamicProcessScenarioSpec,
  ThermodynamicProcessSolution,
} from "./types";
import { validateThermalScenario } from "./validate";

/* -------------------------------------------------------------------------- */
/* Pure Physics Formula Helpers                                               */
/* -------------------------------------------------------------------------- */

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be finite and strictly positive.`);
  }
}

/** Monatomic ideal gas internal energy U = (3/2) n R T in J. */
export function idealGasInternalEnergy(
  moles: number,
  temperatureK: number,
  gasConstantR = MOLAR_GAS_CONSTANT,
): number {
  assertPositive("Moles", moles);
  assertPositive("Temperature", temperatureK);
  assertPositive("Gas constant R", gasConstantR);
  return 1.5 * moles * gasConstantR * temperatureK;
}

/** Reversible isothermal work W = n R T ln(V2 / V1) in J. */
export function isothermalWork(
  moles: number,
  temperatureK: number,
  initialVolumeM3: number,
  finalVolumeM3: number,
  gasConstantR = MOLAR_GAS_CONSTANT,
): number {
  assertPositive("Moles", moles);
  assertPositive("Temperature", temperatureK);
  assertPositive("Initial volume", initialVolumeM3);
  assertPositive("Final volume", finalVolumeM3);
  assertPositive("Gas constant R", gasConstantR);
  return (
    moles *
    gasConstantR *
    temperatureK *
    Math.log(finalVolumeM3 / initialVolumeM3)
  );
}

/** Maximum theoretical Carnot efficiency eta = 1 - T_C / T_H. */
export function carnotTheoreticalEfficiency(
  coldTemperatureK: number,
  hotTemperatureK: number,
): number {
  assertPositive("Cold temperature T_C", coldTemperatureK);
  assertPositive("Hot temperature T_H", hotTemperatureK);
  if (coldTemperatureK >= hotTemperatureK) {
    throw new Error("Cold temperature T_C must be strictly less than T_H.");
  }
  return 1 - coldTemperatureK / hotTemperatureK;
}

/** RMS molecular speed v_rms = sqrt(3 R T / M) in m s^-1. */
export function rmsSpeedFromMolarMass(
  temperatureK: number,
  molarMassKgPerMol: number,
  gasConstantR = MOLAR_GAS_CONSTANT,
): number {
  assertPositive("Temperature", temperatureK);
  assertPositive("Molar mass M", molarMassKgPerMol);
  assertPositive("Gas constant R", gasConstantR);
  return Math.sqrt((3 * gasConstantR * temperatureK) / molarMassKgPerMol);
}

/** RMS molecular speed v_rms = sqrt(3 k_B T / m) in m s^-1. */
export function rmsSpeedFromParticleMass(
  temperatureK: number,
  particleMassKg: number,
  boltzmannConstant = BOLTZMANN_CONSTANT,
): number {
  assertPositive("Temperature", temperatureK);
  assertPositive("Particle mass m", particleMassKg);
  assertPositive("Boltzmann constant k_B", boltzmannConstant);
  return Math.sqrt((3 * boltzmannConstant * temperatureK) / particleMassKg);
}

/** Average translational kinetic energy (3/2) k_B T in J. */
export function averageTranslationalKineticEnergy(
  temperatureK: number,
  boltzmannConstant = BOLTZMANN_CONSTANT,
): number {
  assertPositive("Temperature", temperatureK);
  assertPositive("Boltzmann constant k_B", boltzmannConstant);
  return 1.5 * boltzmannConstant * temperatureK;
}

/**
 * Normalized Maxwell-Boltzmann speed probability density f(v) in (m s^-1)^-1
 * satisfying integral_0^infty f(v) dv = 1.
 */
export function maxwellBoltzmannSpeedDensity(
  speedMs: number,
  temperatureK: number,
  particleMassKg: number,
  boltzmannConstant = BOLTZMANN_CONSTANT,
): number {
  if (!Number.isFinite(speedMs) || speedMs < 0) {
    throw new Error("Speed must be finite and non-negative.");
  }
  assertPositive("Temperature", temperatureK);
  assertPositive("Particle mass m", particleMassKg);
  assertPositive("Boltzmann constant k_B", boltzmannConstant);
  if (speedMs === 0) return 0;
  const kT = boltzmannConstant * temperatureK;
  const factor = (particleMassKg / (2 * Math.PI * kT)) ** 1.5;
  const exponent = -(particleMassKg * speedMs * speedMs) / (2 * kT);
  if (exponent < -700) return 0;
  return 4 * Math.PI * factor * speedMs * speedMs * Math.exp(exponent);
}

/** Wien's displacement peak wavelength lambda_max = b / T in m. */
export function wienPeakWavelength(
  temperatureK: number,
  wienConstantMK = WIEN_DISPLACEMENT_CONSTANT,
): number {
  assertPositive("Temperature", temperatureK);
  assertPositive("Wien constant b", wienConstantMK);
  return wienConstantMK / temperatureK;
}

/** Stefan-Boltzmann radiated power P = e * sigma * A * T^4 in W. */
export function stefanBoltzmannPower(
  emissivity: number,
  surfaceAreaM2: number,
  temperatureK: number,
  stefanBoltzmannConstant = STEFAN_BOLTZMANN_CONSTANT,
): number {
  if (!Number.isFinite(emissivity) || emissivity <= 0 || emissivity > 1) {
    throw new Error("Emissivity must lie in (0, 1].");
  }
  assertPositive("Surface area A", surfaceAreaM2);
  assertPositive("Temperature", temperatureK);
  assertPositive("Stefan-Boltzmann constant sigma", stefanBoltzmannConstant);
  return emissivity * stefanBoltzmannConstant * surfaceAreaM2 * temperatureK ** 4;
}

/**
 * Planck spectral exitance M_lambda(lambda, T) in W m^-2 m^-1 calibrated to
 * Wien's constant b and Stefan-Boltzmann sigma so:
 *   1. Peak occurs identically at lambda_max = b / T, and
 *   2. Integral_0^infty M_lambda d(lambda) = e * sigma * T^4.
 */
export function planckSpectralExitance(
  wavelengthM: number,
  temperatureK: number,
  emissivity = 1,
  wienConstantMK = WIEN_DISPLACEMENT_CONSTANT,
  stefanBoltzmannConstant = STEFAN_BOLTZMANN_CONSTANT,
): number {
  assertPositive("Wavelength", wavelengthM);
  assertPositive("Temperature", temperatureK);
  if (!Number.isFinite(emissivity) || emissivity <= 0 || emissivity > 1) {
    throw new Error("Emissivity must lie in (0, 1].");
  }
  const a = PLANCK_WIEN_ROOT * wienConstantMK;
  const x = a / (wavelengthM * temperatureK);
  if (x > 700) return 0;
  const prefactor = (15 / Math.PI ** 4) * a ** 4 * stefanBoltzmannConstant;
  const denom = wavelengthM ** 5 * Math.expm1(x);
  if (!Number.isFinite(denom) || denom <= 0) return 0;
  return (emissivity * prefactor) / denom;
}

/* -------------------------------------------------------------------------- */
/* 1. Thermodynamic Process & Carnot Cycle Solvers                            */
/* -------------------------------------------------------------------------- */

function defaultStateLetter(index: number): string {
  if (index < 26) return String.fromCharCode(65 + index);
  return `S${index + 1}`;
}

function computeLegThermodynamics(
  legIndex: number,
  fromState: SolvedGasState,
  toState: SolvedGasState,
  process: ThermalProcessKind,
  cGas: number,
): SolvedProcessLeg {
  const deltaUJ = toState.internalEnergyJ - fromState.internalEnergyJ;
  let workJ = 0;
  let heatJ = 0;
  let entropyChangeJK = 0;
  let isothermalEntropyChangeJK: number | null = null;

  switch (process) {
    case "isobaric": {
      workJ = fromState.pressurePa * (toState.volumeM3 - fromState.volumeM3);
      heatJ = deltaUJ + workJ;
      entropyChangeJK =
        2.5 * cGas * Math.log(toState.temperatureK / fromState.temperatureK);
      break;
    }
    case "isochoric": {
      workJ = 0;
      heatJ = deltaUJ;
      entropyChangeJK =
        1.5 * cGas * Math.log(toState.temperatureK / fromState.temperatureK);
      break;
    }
    case "isothermal": {
      workJ =
        cGas *
        fromState.temperatureK *
        Math.log(toState.volumeM3 / fromState.volumeM3);
      // Enforce exact deltaU = 0 when states share temperature
      heatJ = deltaUJ + workJ;
      entropyChangeJK = heatJ / fromState.temperatureK;
      isothermalEntropyChangeJK = entropyChangeJK;
      break;
    }
    case "adiabatic": {
      heatJ = 0;
      workJ = -deltaUJ;
      entropyChangeJK = 0;
      break;
    }
  }

  return {
    legIndex,
    fromStateId: fromState.stateId,
    toStateId: toState.stateId,
    fromLabel: fromState.label,
    toLabel: toState.label,
    process,
    workJ,
    workOnGasJ: -workJ,
    heatJ,
    deltaUJ,
    entropyChangeJK,
    isothermalEntropyChangeJK,
  };
}

function buildCycleMetrics(
  moles: number,
  particleCount: number,
  cGas: number,
  initialP: number,
  initialV: number,
  initialT: number,
  initialStateId: string,
  initialLabel: string,
  steps: readonly ThermalProcessStepSpec[],
  explicitClosed: boolean | undefined,
): ThermodynamicCycleMetrics {
  const gamma = MONATOMIC_ADIABATIC_GAMMA;
  const rawStates: SolvedGasState[] = [
    {
      stateIndex: 0,
      stateId: initialStateId,
      label: initialLabel,
      pressurePa: initialP,
      volumeM3: initialV,
      temperatureK: initialT,
      internalEnergyJ: 1.5 * cGas * initialT,
    },
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const prev = rawStates[rawStates.length - 1];
    let nextP = prev.pressurePa;
    let nextV = prev.volumeM3;
    let nextT = prev.temperatureK;

    if (step.closeToInitial) {
      nextP = initialP;
      nextV = initialV;
      nextT = initialT;
    } else {
      switch (step.process) {
        case "isobaric": {
          nextP = prev.pressurePa;
          if (step.targetVolumeM3 !== undefined) {
            nextV = step.targetVolumeM3;
            nextT = (nextP * nextV) / cGas;
          } else {
            nextT = step.targetTemperatureK!;
            nextV = (cGas * nextT) / nextP;
          }
          break;
        }
        case "isochoric": {
          nextV = prev.volumeM3;
          if (step.targetPressurePa !== undefined) {
            nextP = step.targetPressurePa;
            nextT = (nextP * nextV) / cGas;
          } else {
            nextT = step.targetTemperatureK!;
            nextP = (cGas * nextT) / nextV;
          }
          break;
        }
        case "isothermal": {
          nextT = prev.temperatureK;
          if (step.targetVolumeM3 !== undefined) {
            nextV = step.targetVolumeM3;
            nextP = (cGas * nextT) / nextV;
          } else {
            nextP = step.targetPressurePa!;
            nextV = (cGas * nextT) / nextP;
          }
          break;
        }
        case "adiabatic": {
          if (step.targetVolumeM3 !== undefined) {
            nextV = step.targetVolumeM3;
            nextP = prev.pressurePa * (prev.volumeM3 / nextV) ** gamma;
            nextT = (nextP * nextV) / cGas;
          } else if (step.targetPressurePa !== undefined) {
            nextP = step.targetPressurePa;
            nextV = prev.volumeM3 * (prev.pressurePa / nextP) ** (1 / gamma);
            nextT = (nextP * nextV) / cGas;
          } else {
            nextT = step.targetTemperatureK!;
            nextV =
              prev.volumeM3 * (prev.temperatureK / nextT) ** (1 / (gamma - 1));
            nextP = (cGas * nextT) / nextV;
          }
          break;
        }
      }
    }

    const defaultLbl = defaultStateLetter(i + 1);
    rawStates.push({
      stateIndex: i + 1,
      stateId: step.toStateId ?? defaultLbl,
      label: step.toLabel ?? defaultLbl,
      pressurePa: nextP,
      volumeM3: nextV,
      temperatureK: nextT,
      internalEnergyJ: 1.5 * cGas * nextT,
    });
  }

  const endState = rawStates[rawStates.length - 1];
  const relP =
    Math.abs(endState.pressurePa - initialP) / Math.max(initialP, 1e-30);
  const relV =
    Math.abs(endState.volumeM3 - initialV) / Math.max(initialV, 1e-30);
  const isClosedCycle =
    explicitClosed ??
    (steps.length >= 2 &&
      (Boolean(steps[steps.length - 1].closeToInitial) ||
        (relP <= 1e-6 && relV <= 1e-6)));

  const uniqueStates = isClosedCycle ? rawStates.slice(0, -1) : rawStates;
  const legs: SolvedProcessLeg[] = steps.map((step, idx) => {
    const fromState = uniqueStates[idx];
    const toState =
      isClosedCycle && idx === steps.length - 1
        ? uniqueStates[0]
        : uniqueStates[idx + 1];
    return computeLegThermodynamics(
      idx,
      fromState,
      toState,
      step.process,
      cGas,
    );
  });

  const netWorkJ = legs.reduce((sum, leg) => sum + leg.workJ, 0);
  const netHeatJ = legs.reduce((sum, leg) => sum + leg.heatJ, 0);
  const totalDeltaUJ = isClosedCycle
    ? 0
    : legs.reduce((sum, leg) => sum + leg.deltaUJ, 0);
  const totalEntropyChangeJK = isClosedCycle
    ? 0
    : legs.reduce((sum, leg) => sum + leg.entropyChangeJK, 0);

  const heatInputJ = legs.reduce(
    (sum, leg) => (leg.heatJ > 0 ? sum + leg.heatJ : sum),
    0,
  );
  const heatRejectedJ = legs.reduce(
    (sum, leg) => (leg.heatJ < 0 ? sum - leg.heatJ : sum),
    0,
  );

  const temps = uniqueStates.map((s) => s.temperatureK);
  const minTemperatureK = Math.min(...temps);
  const maxTemperatureK = Math.max(...temps);

  const thermalEfficiency =
    isClosedCycle && netWorkJ > 1e-12 && heatInputJ > 0
      ? netWorkJ / heatInputJ
      : null;
  const carnotEfficiency =
    isClosedCycle && maxTemperatureK > minTemperatureK
      ? 1 - minTemperatureK / maxTemperatureK
      : null;
  const copCooling =
    isClosedCycle && netWorkJ < -1e-12 && heatInputJ > 0
      ? heatInputJ / Math.abs(netWorkJ)
      : null;

  const quantities: Record<string, number> = {
    moles,
    particleCount,
    netWorkJ,
    totalWorkJ: netWorkJ,
    netHeatJ,
    totalHeatJ: netHeatJ,
    totalDeltaUJ,
    totalEntropyChangeJK,
    heatInputJ,
    heatRejectedJ,
    minTemperatureK,
    maxTemperatureK,
  };
  if (thermalEfficiency !== null) {
    quantities.thermalEfficiency = thermalEfficiency;
  }
  if (carnotEfficiency !== null) {
    quantities.carnotEfficiency = carnotEfficiency;
  }
  if (copCooling !== null) {
    quantities.copCooling = copCooling;
  }
  for (const state of uniqueStates) {
    quantities[`state:${state.stateId}:pressurePa`] = state.pressurePa;
    quantities[`state:${state.stateId}:volumeM3`] = state.volumeM3;
    quantities[`state:${state.stateId}:temperatureK`] = state.temperatureK;
    quantities[`state:${state.stateId}:internalEnergyJ`] =
      state.internalEnergyJ;
  }
  for (const leg of legs) {
    quantities[`leg:${leg.legIndex}:workJ`] = leg.workJ;
    quantities[`leg:${leg.legIndex}:workOnGasJ`] = leg.workOnGasJ;
    quantities[`leg:${leg.legIndex}:heatJ`] = leg.heatJ;
    quantities[`leg:${leg.legIndex}:deltaUJ`] = leg.deltaUJ;
    quantities[`leg:${leg.legIndex}:entropyChangeJK`] = leg.entropyChangeJK;
    if (leg.isothermalEntropyChangeJK !== null) {
      quantities[`leg:${leg.legIndex}:isothermalEntropyChangeJK`] =
        leg.isothermalEntropyChangeJK;
    }
  }

  return {
    moles,
    particleCount,
    thermalCapacityConstantJK: cGas,
    adiabaticGamma: gamma,
    states: uniqueStates,
    legs,
    isClosedCycle,
    netWorkJ,
    netHeatJ,
    totalDeltaUJ,
    totalEntropyChangeJK,
    heatInputJ,
    heatRejectedJ,
    minTemperatureK,
    maxTemperatureK,
    thermalEfficiency,
    carnotEfficiency,
    copCooling,
    quantities,
  };
}

export function solveThermodynamicProcess(
  spec: ThermodynamicProcessScenarioSpec,
): ThermodynamicProcessSolution {
  const validation = validateThermalScenario(spec);
  if (!validation.valid) {
    throw new Error(validation.issues.map((i) => i.message).join(" "));
  }
  const R = spec.gasConstantR ?? MOLAR_GAS_CONSTANT;
  const kB = spec.boltzmannConstant ?? BOLTZMANN_CONSTANT;
  const init = spec.initialState;

  const cGas =
    spec.moles !== undefined
      ? spec.moles * R
      : spec.particleCount !== undefined
        ? spec.particleCount * kB
        : (init.pressurePa! * init.volumeM3!) / init.temperatureK!;
  const moles = spec.moles ?? cGas / R;
  const particleCount = spec.particleCount ?? cGas / kB;

  let p0 = init.pressurePa;
  let v0 = init.volumeM3;
  let t0 = init.temperatureK;
  if (p0 !== undefined && v0 !== undefined) {
    t0 = (p0 * v0) / cGas;
  } else if (p0 !== undefined && t0 !== undefined) {
    v0 = (cGas * t0) / p0;
  } else {
    p0 = (cGas * t0!) / v0!;
  }

  const metrics = buildCycleMetrics(
    moles,
    particleCount,
    cGas,
    p0!,
    v0!,
    t0!,
    init.stateId ?? "A",
    init.label ?? "A",
    spec.steps,
    spec.isClosedCycle,
  );

  return {
    kind: "thermodynamic-process",
    ...metrics,
  };
}

export function solveCarnotCycle(
  spec: CarnotCycleScenarioSpec,
): CarnotCycleSolution {
  const validation = validateThermalScenario(spec);
  if (!validation.valid) {
    throw new Error(validation.issues.map((i) => i.message).join(" "));
  }
  const R = spec.gasConstantR ?? MOLAR_GAS_CONSTANT;
  const kB = spec.boltzmannConstant ?? BOLTZMANN_CONSTANT;
  const cGas =
    spec.moles !== undefined ? spec.moles * R : spec.particleCount! * kB;
  const moles = spec.moles ?? cGas / R;
  const particleCount = spec.particleCount ?? cGas / kB;

  const tH = spec.hotTemperatureK;
  const tC = spec.coldTemperatureK;
  const v1 = spec.initialVolumeM3;
  const v2 = spec.isothermalExpansionVolumeM3;
  const adiabaticExpansionRatio = (tH / tC) ** 1.5;
  const v3 = v2 * adiabaticExpansionRatio;
  const v4 = v1 * adiabaticExpansionRatio;
  const direction = spec.cycleDirection ?? "heat-engine";

  const p1 = (cGas * tH) / v1;
  const steps: ThermalProcessStepSpec[] =
    direction === "heat-engine"
      ? [
          {
            process: "isothermal",
            toStateId: "B",
            toLabel: "B",
            targetVolumeM3: v2,
          },
          {
            process: "adiabatic",
            toStateId: "C",
            toLabel: "C",
            targetTemperatureK: tC,
          },
          {
            process: "isothermal",
            toStateId: "D",
            toLabel: "D",
            targetVolumeM3: v4,
          },
          {
            process: "adiabatic",
            closeToInitial: true,
          },
        ]
      : [
          {
            process: "adiabatic",
            toStateId: "D",
            toLabel: "D",
            targetTemperatureK: tC,
          },
          {
            process: "isothermal",
            toStateId: "C",
            toLabel: "C",
            targetVolumeM3: v3,
          },
          {
            process: "adiabatic",
            toStateId: "B",
            toLabel: "B",
            targetTemperatureK: tH,
          },
          {
            process: "isothermal",
            closeToInitial: true,
          },
        ];

  const metrics = buildCycleMetrics(
    moles,
    particleCount,
    cGas,
    p1,
    v1,
    tH,
    "A",
    "A",
    steps,
    true,
  );
  metrics.quantities.hotTemperatureK = tH;
  metrics.quantities.coldTemperatureK = tC;
  metrics.quantities.initialVolumeM3 = v1;
  metrics.quantities.isothermalExpansionVolumeM3 = v2;

  return {
    kind: "carnot-cycle",
    hotTemperatureK: tH,
    coldTemperatureK: tC,
    cycleDirection: direction,
    ...metrics,
  };
}

/* -------------------------------------------------------------------------- */
/* 2. Calorimetry Phase-Change Heating / Cooling Curve Solver                 */
/* -------------------------------------------------------------------------- */

function resolveEndpointPhase(
  temperatureK: number,
  meltingPointK: number,
  boilingPointK: number,
  explicitPhase: MatterPhase | undefined,
  defaultAtTransition: "lower" | "higher",
): MatterPhase {
  const eps = 1e-9;
  if (temperatureK < meltingPointK - eps) return "solid";
  if (Math.abs(temperatureK - meltingPointK) <= eps) {
    return (
      explicitPhase ?? (defaultAtTransition === "lower" ? "solid" : "liquid")
    );
  }
  if (temperatureK < boilingPointK - eps) return "liquid";
  if (Math.abs(temperatureK - boilingPointK) <= eps) {
    return explicitPhase ?? (defaultAtTransition === "lower" ? "liquid" : "gas");
  }
  return "gas";
}

export function solvePhaseChangeCurve(
  spec: PhaseChangeScenarioSpec,
): PhaseChangeSolution {
  const validation = validateThermalScenario(spec);
  if (!validation.valid) {
    throw new Error(validation.issues.map((i) => i.message).join(" "));
  }
  const mat = spec.material;
  const m = mat.massKg;
  const tm = mat.meltingPointK;
  const tb = mat.boilingPointK;
  const phaseRank: Record<MatterPhase, number> = {
    solid: 0,
    liquid: 1,
    gas: 2,
  };

  const isHeating =
    spec.finalTemperatureK > spec.initialTemperatureK ||
    (spec.finalTemperatureK === spec.initialTemperatureK &&
      phaseRank[spec.finalPhase!] > phaseRank[spec.initialPhase!]);

  const initialPhase = resolveEndpointPhase(
    spec.initialTemperatureK,
    tm,
    tb,
    spec.initialPhase,
    isHeating ? "lower" : "higher",
  );
  const finalPhase = resolveEndpointPhase(
    spec.finalTemperatureK,
    tm,
    tb,
    spec.finalPhase,
    isHeating ? "higher" : "lower",
  );

  const effectivePowerW =
    spec.heaterPowerW !== undefined
      ? spec.heaterPowerW * (spec.heaterEfficiency ?? 1)
      : null;

  const stages: SolvedPhaseStage[] = [];
  let cumE = 0;

  const addStage = (
    stageKind: PhaseStageKind,
    isLatentPlateau: boolean,
    startTempK: number,
    endTempK: number,
    energyJ: number,
  ) => {
    const signedHeatJ = isHeating ? energyJ : -energyJ;
    const startE = cumE;
    const endE = cumE + energyJ;
    cumE = endE;
    const durationS =
      effectivePowerW !== null ? energyJ / effectivePowerW : null;
    const cumTimeStartS =
      effectivePowerW !== null ? startE / effectivePowerW : null;
    const cumTimeEndS =
      effectivePowerW !== null ? endE / effectivePowerW : null;
    const deltaT = endTempK - startTempK;
    const slopeKPerJ = isLatentPlateau ? 0 : deltaT / energyJ;
    const slopeKPerS =
      effectivePowerW !== null
        ? isLatentPlateau
          ? 0
          : deltaT / durationS!
        : null;

    stages.push({
      stageIndex: stages.length,
      stageKind,
      isLatentPlateau,
      startTemperatureK: startTempK,
      endTemperatureK: endTempK,
      startTemperatureC: startTempK - KELVIN_OFFSET,
      endTemperatureC: endTempK - KELVIN_OFFSET,
      energyJ,
      signedHeatJ,
      cumulativeEnergyStartJ: startE,
      cumulativeEnergyEndJ: endE,
      durationS,
      cumulativeTimeStartS: cumTimeStartS,
      cumulativeTimeEndS: cumTimeEndS,
      slopeKPerJ,
      slopeKPerS,
    });
  };

  let curT = spec.initialTemperatureK;
  let curPhase: MatterPhase = initialPhase;
  const targetT = spec.finalTemperatureK;
  const eps = 1e-11;

  if (isHeating) {
    if (curPhase === "solid") {
      const nextT = Math.min(targetT, tm);
      if (nextT - curT > eps) {
        addStage(
          "solid",
          false,
          curT,
          nextT,
          m * mat.specificHeatSolidJPerKgK! * (nextT - curT),
        );
        curT = nextT;
      }
      if (
        Math.abs(curT - tm) <= eps &&
        (targetT > tm + eps || finalPhase !== "solid")
      ) {
        addStage("melting", true, tm, tm, m * mat.latentHeatFusionJPerKg!);
        curPhase = "liquid";
      }
    }
    if (curPhase === "liquid") {
      const nextT = Math.min(targetT, tb);
      if (nextT - curT > eps) {
        addStage(
          "liquid",
          false,
          curT,
          nextT,
          m * mat.specificHeatLiquidJPerKgK! * (nextT - curT),
        );
        curT = nextT;
      }
      if (
        Math.abs(curT - tb) <= eps &&
        (targetT > tb + eps || finalPhase === "gas")
      ) {
        addStage(
          "boiling",
          true,
          tb,
          tb,
          m * mat.latentHeatVaporizationJPerKg!,
        );
        curPhase = "gas";
      }
    }
    if (curPhase === "gas") {
      if (targetT - curT > eps) {
        addStage(
          "gas",
          false,
          curT,
          targetT,
          m * mat.specificHeatGasJPerKgK! * (targetT - curT),
        );
      }
    }
  } else {
    if (curPhase === "gas") {
      const nextT = Math.max(targetT, tb);
      if (curT - nextT > eps) {
        addStage(
          "gas",
          false,
          curT,
          nextT,
          m * mat.specificHeatGasJPerKgK! * (curT - nextT),
        );
        curT = nextT;
      }
      if (
        Math.abs(curT - tb) <= eps &&
        (targetT < tb - eps || finalPhase !== "gas")
      ) {
        addStage(
          "condensing",
          true,
          tb,
          tb,
          m * mat.latentHeatVaporizationJPerKg!,
        );
        curPhase = "liquid";
      }
    }
    if (curPhase === "liquid") {
      const nextT = Math.max(targetT, tm);
      if (curT - nextT > eps) {
        addStage(
          "liquid",
          false,
          curT,
          nextT,
          m * mat.specificHeatLiquidJPerKgK! * (curT - nextT),
        );
        curT = nextT;
      }
      if (
        Math.abs(curT - tm) <= eps &&
        (targetT < tm - eps || finalPhase === "solid")
      ) {
        addStage("freezing", true, tm, tm, m * mat.latentHeatFusionJPerKg!);
        curPhase = "solid";
      }
    }
    if (curPhase === "solid") {
      if (curT - targetT > eps) {
        addStage(
          "solid",
          false,
          curT,
          targetT,
          m * mat.specificHeatSolidJPerKgK! * (curT - targetT),
        );
      }
    }
  }

  const sensibleEnergyJ = stages
    .filter((s) => !s.isLatentPlateau)
    .reduce((sum, s) => sum + s.energyJ, 0);
  const latentEnergyJ = stages
    .filter((s) => s.isLatentPlateau)
    .reduce((sum, s) => sum + s.energyJ, 0);
  const totalEnergyJ = sensibleEnergyJ + latentEnergyJ;
  const signedTotalHeatJ = isHeating ? totalEnergyJ : -totalEnergyJ;
  const totalDurationS =
    effectivePowerW !== null ? totalEnergyJ / effectivePowerW : null;

  const quantities: Record<string, number> = {
    massKg: m,
    meltingPointK: tm,
    meltingPointC: tm - KELVIN_OFFSET,
    boilingPointK: tb,
    boilingPointC: tb - KELVIN_OFFSET,
    initialTemperatureK: spec.initialTemperatureK,
    initialTemperatureC: spec.initialTemperatureK - KELVIN_OFFSET,
    finalTemperatureK: spec.finalTemperatureK,
    finalTemperatureC: spec.finalTemperatureK - KELVIN_OFFSET,
    totalEnergyJ,
    signedTotalHeatJ,
    sensibleEnergyJ,
    latentEnergyJ,
  };
  if (totalDurationS !== null) {
    quantities.totalDurationS = totalDurationS;
  }
  if (effectivePowerW !== null) {
    quantities.effectivePowerW = effectivePowerW;
  }
  if (spec.heaterPowerW !== undefined) {
    quantities.heaterPowerW = spec.heaterPowerW;
  }
  if (spec.heaterEfficiency !== undefined) {
    quantities.heaterEfficiency = spec.heaterEfficiency;
  }
  if (mat.specificHeatSolidJPerKgK !== undefined) {
    quantities.specificHeatSolidJPerKgK = mat.specificHeatSolidJPerKgK;
  }
  if (mat.specificHeatLiquidJPerKgK !== undefined) {
    quantities.specificHeatLiquidJPerKgK = mat.specificHeatLiquidJPerKgK;
  }
  if (mat.specificHeatGasJPerKgK !== undefined) {
    quantities.specificHeatGasJPerKgK = mat.specificHeatGasJPerKgK;
  }
  if (mat.latentHeatFusionJPerKg !== undefined) {
    quantities.latentHeatFusionJPerKg = mat.latentHeatFusionJPerKg;
  }
  if (mat.latentHeatVaporizationJPerKg !== undefined) {
    quantities.latentHeatVaporizationJPerKg = mat.latentHeatVaporizationJPerKg;
  }
  for (const stage of stages) {
    quantities[`stage:${stage.stageIndex}:energyJ`] = stage.energyJ;
    if (stage.durationS !== null) {
      quantities[`stage:${stage.stageIndex}:durationS`] = stage.durationS;
    }
    if (stage.stageKind === "melting" || stage.stageKind === "freezing") {
      quantities.meltingEnergyJ = stage.energyJ;
      if (stage.durationS !== null) quantities.meltingDurationS = stage.durationS;
    }
    if (stage.stageKind === "boiling" || stage.stageKind === "condensing") {
      quantities.boilingEnergyJ = stage.energyJ;
      if (stage.durationS !== null) quantities.boilingDurationS = stage.durationS;
    }
  }

  return {
    kind: "phase-change-curve",
    direction: isHeating ? "heating" : "cooling",
    initialPhase,
    finalPhase,
    initialTemperatureK: spec.initialTemperatureK,
    finalTemperatureK: spec.finalTemperatureK,
    initialTemperatureC: spec.initialTemperatureK - KELVIN_OFFSET,
    finalTemperatureC: spec.finalTemperatureK - KELVIN_OFFSET,
    stages,
    totalEnergyJ,
    signedTotalHeatJ,
    sensibleEnergyJ,
    latentEnergyJ,
    effectivePowerW,
    totalDurationS,
    quantities,
  };
}

/* -------------------------------------------------------------------------- */
/* 3. Calorimetry Thermal Equilibrium Mixing Solver                           */
/* -------------------------------------------------------------------------- */

interface ComponentEnthalpyModel {
  readonly comp: CalorimetryComponentSpec;
  readonly initialPhase: MatterPhase;
  readonly initialEnthalpyJ: number;
  enthalpyBoundsAt: (tempK: number) => [number, number];
  heatCapacityAbove: (tempK: number) => number;
  phaseAbove: (tempK: number) => MatterPhase;
}

function createComponentEnthalpyModel(
  comp: CalorimetryComponentSpec,
): ComponentEnthalpyModel {
  const m = comp.massKg;
  if (comp.meltingPointK === undefined) {
    const c = comp.specificHeatJPerKgK!;
    const initPhase: MatterPhase = comp.initialPhase ?? "solid";
    return {
      comp,
      initialPhase: initPhase,
      initialEnthalpyJ: m * c * comp.initialTemperatureK,
      enthalpyBoundsAt: (tempK: number) => [m * c * tempK, m * c * tempK],
      heatCapacityAbove: () => m * c,
      phaseAbove: () => initPhase,
    };
  }

  const tm = comp.meltingPointK;
  const tb = comp.boilingPointK ?? Infinity;
  const cs = comp.specificHeatSolidJPerKgK!;
  const cl = comp.specificHeatLiquidJPerKgK!;
  const cg = comp.specificHeatGasJPerKgK ?? cl;
  const lf = comp.latentHeatFusionJPerKg!;
  const lv = comp.latentHeatVaporizationJPerKg ?? 0;
  const eps = 1e-11;

  const initPhase = resolveEndpointPhase(
    comp.initialTemperatureK,
    tm,
    tb,
    comp.initialPhase,
    "lower",
  );

  const enthalpyBoundsAt = (tempK: number): [number, number] => {
    if (tempK < tm - eps) {
      const h = m * cs * tempK;
      return [h, h];
    }
    if (Math.abs(tempK - tm) <= eps) {
      return [m * cs * tm, m * cs * tm + m * lf];
    }
    if (tempK < tb - eps) {
      const h = m * cs * tm + m * lf + m * cl * (tempK - tm);
      return [h, h];
    }
    if (Math.abs(tempK - tb) <= eps) {
      const hLow = m * cs * tm + m * lf + m * cl * (tb - tm);
      return [hLow, hLow + m * lv];
    }
    const h = m * cs * tm + m * lf + m * cl * (tb - tm) + m * lv + m * cg * (tempK - tb);
    return [h, h];
  };

  const [hMinInit, hMaxInit] = enthalpyBoundsAt(comp.initialTemperatureK);
  let initialEnthalpyJ = hMinInit;
  if (
    Math.abs(comp.initialTemperatureK - tm) <= eps &&
    initPhase === "liquid"
  ) {
    initialEnthalpyJ = hMaxInit;
  } else if (
    Math.abs(comp.initialTemperatureK - tb) <= eps &&
    initPhase === "gas"
  ) {
    initialEnthalpyJ = hMaxInit;
  }

  return {
    comp,
    initialPhase: initPhase,
    initialEnthalpyJ,
    enthalpyBoundsAt,
    heatCapacityAbove: (tempK: number): number => {
      if (tempK < tm - eps) return m * cs;
      if (tempK < tb - eps) return m * cl;
      return m * cg;
    },
    phaseAbove: (tempK: number): MatterPhase => {
      if (tempK < tm - eps) return "solid";
      if (tempK < tb - eps) return "liquid";
      return "gas";
    },
  };
}

export function solveCalorimetryMixing(
  spec: CalorimetryMixingScenarioSpec,
): CalorimetryMixingSolution {
  const validation = validateThermalScenario(spec);
  if (!validation.valid) {
    throw new Error(validation.issues.map((i) => i.message).join(" "));
  }

  const models = spec.components.map(createComponentEnthalpyModel);
  const heatLoss = spec.heatLossToSurroundingsJ ?? 0;
  const targetEnthalpyJ =
    models.reduce((sum, mod) => sum + mod.initialEnthalpyJ, 0) - heatLoss;

  // Gather unique sorted phase transition temperatures > 0
  const rawTransitions: number[] = [];
  for (const c of spec.components) {
    if (c.meltingPointK !== undefined) rawTransitions.push(c.meltingPointK);
    if (c.boilingPointK !== undefined) rawTransitions.push(c.boilingPointK);
  }
  rawTransitions.sort((a, b) => a - b);
  const transitions: number[] = [0];
  for (const t of rawTransitions) {
    if (t - transitions[transitions.length - 1] > 1e-9) {
      transitions.push(t);
    }
  }

  const systemBoundsAt = (tempK: number): [number, number] => {
    let low = 0;
    let high = 0;
    for (const mod of models) {
      const [l, h] = mod.enthalpyBoundsAt(tempK);
      low += l;
      high += h;
    }
    return [low, high];
  };

  let equilibriumTemperatureK = 0;
  let plateauFraction: number | null = null;
  let isPhaseCoexistenceEquilibrium = false;

  // Check if equilibrium lands on a phase transition plateau
  for (let r = 1; r < transitions.length; r++) {
    const tau = transitions[r];
    const [hLow, hHigh] = systemBoundsAt(tau);
    if (targetEnthalpyJ >= hLow - 1e-9 && targetEnthalpyJ <= hHigh + 1e-9) {
      equilibriumTemperatureK = tau;
      plateauFraction =
        hHigh > hLow
          ? Math.min(1, Math.max(0, (targetEnthalpyJ - hLow) / (hHigh - hLow)))
          : 0;
      isPhaseCoexistenceEquilibrium =
        plateauFraction > 1e-9 && plateauFraction < 1 - 1e-9;
      break;
    }
  }

  // Otherwise locate exact open interval (tau_r, tau_{r+1}) and solve linearly
  let intervalBaseTemp = 0;
  if (plateauFraction === null) {
    for (let r = 0; r < transitions.length; r++) {
      const tau = transitions[r];
      const [, hHighAtTau] = systemBoundsAt(tau);
      const nextTau = r + 1 < transitions.length ? transitions[r + 1] : Infinity;
      const [hLowAtNext] = Number.isFinite(nextTau)
        ? systemBoundsAt(nextTau)
        : [Infinity, Infinity];

      if (targetEnthalpyJ >= hHighAtTau - 1e-9 && targetEnthalpyJ <= hLowAtNext + 1e-9) {
        intervalBaseTemp = tau;
        const totalC = models.reduce(
          (sum, mod) => sum + mod.heatCapacityAbove(tau),
          0,
        );
        equilibriumTemperatureK = tau + (targetEnthalpyJ - hHighAtTau) / totalC;
        break;
      }
    }
  }

  const solvedComponents: SolvedMixingComponent[] = models.map((mod) => {
    const c = mod.comp;
    let finalEnthalpyJ: number;
    let finalPhase: SolvedMixingComponent["finalPhase"];
    let transitionFraction: number | null = null;

    if (plateauFraction !== null) {
      const [l, h] = mod.enthalpyBoundsAt(equilibriumTemperatureK);
      finalEnthalpyJ = l + plateauFraction * (h - l);
      if (h > l + 1e-12) {
        transitionFraction = plateauFraction;
        const isMelting =
          c.meltingPointK !== undefined &&
          Math.abs(equilibriumTemperatureK - c.meltingPointK) <= 1e-8;
        if (plateauFraction <= 1e-9) {
          finalPhase = isMelting ? "solid" : "liquid";
        } else if (plateauFraction >= 1 - 1e-9) {
          finalPhase = isMelting ? "liquid" : "gas";
        } else {
          finalPhase = isMelting ? "solid-liquid" : "liquid-gas";
        }
      } else {
        finalPhase = mod.phaseAbove(equilibriumTemperatureK);
      }
    } else {
      const [, baseH] = mod.enthalpyBoundsAt(intervalBaseTemp);
      finalEnthalpyJ =
        baseH +
        mod.heatCapacityAbove(intervalBaseTemp) *
          (equilibriumTemperatureK - intervalBaseTemp);
      finalPhase = mod.phaseAbove(intervalBaseTemp);
    }

    const signedHeatJ = finalEnthalpyJ - mod.initialEnthalpyJ;

    // Decompose into latent vs sensible heat for phase-capable components
    let latentHeatJ = 0;
    if (c.meltingPointK !== undefined) {
      const m = c.massKg;
      const lf = c.latentHeatFusionJPerKg!;
      const lv = c.latentHeatVaporizationJPerKg ?? 0;
      const initLiqFrac =
        mod.initialPhase === "solid" ? 0 : 1;
      const finLiqFrac =
        finalPhase === "solid"
          ? 0
          : finalPhase === "solid-liquid"
            ? (transitionFraction ?? 0)
            : 1;
      const initGasFrac = mod.initialPhase === "gas" ? 1 : 0;
      const finGasFrac =
        finalPhase === "gas"
          ? 1
          : finalPhase === "liquid-gas"
            ? (transitionFraction ?? 0)
            : 0;
      latentHeatJ =
        m * lf * (finLiqFrac - initLiqFrac) +
        m * lv * (finGasFrac - initGasFrac);
    }
    const sensibleHeatJ = signedHeatJ - latentHeatJ;

    return {
      id: c.id,
      label: c.label,
      massKg: c.massKg,
      initialTemperatureK: c.initialTemperatureK,
      initialTemperatureC: c.initialTemperatureK - KELVIN_OFFSET,
      finalTemperatureK: equilibriumTemperatureK,
      finalTemperatureC: equilibriumTemperatureK - KELVIN_OFFSET,
      initialPhase: mod.initialPhase,
      finalPhase,
      transitionFraction,
      signedHeatJ,
      sensibleHeatJ,
      latentHeatJ,
    };
  });

  const heatGainedByColdJ = solvedComponents.reduce(
    (sum, item) => (item.signedHeatJ > 0 ? sum + item.signedHeatJ : sum),
    0,
  );
  const heatLostByHotJ = solvedComponents.reduce(
    (sum, item) => (item.signedHeatJ < 0 ? sum - item.signedHeatJ : sum),
    0,
  );
  const sumSignedHeat = solvedComponents.reduce(
    (sum, item) => sum + item.signedHeatJ,
    0,
  );
  const energyBalanceResidualJ = sumSignedHeat + heatLoss;

  const quantities: Record<string, number> = {
    equilibriumTemperatureK,
    equilibriumTemperatureC: equilibriumTemperatureK - KELVIN_OFFSET,
    heatLostByHotJ,
    heatGainedByColdJ,
    heatLossToSurroundingsJ: heatLoss,
    energyBalanceResidualJ,
  };
  solvedComponents.forEach((sc, idx) => {
    const specComp = spec.components[idx];
    quantities[`component:${idx}:massKg`] = sc.massKg;
    quantities[`component:${sc.id}:massKg`] = sc.massKg;
    quantities[`component:${idx}:initialTemperatureK`] = sc.initialTemperatureK;
    quantities[`component:${sc.id}:initialTemperatureK`] =
      sc.initialTemperatureK;
    quantities[`component:${idx}:initialTemperatureC`] = sc.initialTemperatureC;
    quantities[`component:${sc.id}:initialTemperatureC`] =
      sc.initialTemperatureC;
    if (specComp.specificHeatJPerKgK !== undefined) {
      quantities[`component:${idx}:specificHeatJPerKgK`] =
        specComp.specificHeatJPerKgK;
      quantities[`component:${sc.id}:specificHeatJPerKgK`] =
        specComp.specificHeatJPerKgK;
    }
    quantities[`component:${idx}:signedHeatJ`] = sc.signedHeatJ;
    quantities[`component:${sc.id}:signedHeatJ`] = sc.signedHeatJ;
    quantities[`component:${idx}:sensibleHeatJ`] = sc.sensibleHeatJ;
    quantities[`component:${idx}:latentHeatJ`] = sc.latentHeatJ;
    if (sc.transitionFraction !== null) {
      quantities[`component:${idx}:transitionFraction`] = sc.transitionFraction;
      if (sc.finalPhase === "solid-liquid" || sc.initialPhase === "solid") {
        quantities.meltedFraction = sc.transitionFraction;
        quantities.meltedMassKg = sc.transitionFraction * sc.massKg;
      } else if (sc.finalPhase === "liquid-gas") {
        quantities.vaporizedFraction = sc.transitionFraction;
        quantities.vaporizedMassKg = sc.transitionFraction * sc.massKg;
      }
    }
  });

  return {
    kind: "calorimetry-mixing",
    equilibriumTemperatureK,
    equilibriumTemperatureC: equilibriumTemperatureK - KELVIN_OFFSET,
    isPhaseCoexistenceEquilibrium,
    components: solvedComponents,
    heatLostByHotJ,
    heatGainedByColdJ,
    heatLossToSurroundingsJ: heatLoss,
    energyBalanceResidualJ,
    quantities,
  };
}

/* -------------------------------------------------------------------------- */
/* 4. Kinetic Theory Solver                                                   */
/* -------------------------------------------------------------------------- */

export function solveKineticTheory(
  spec: KineticTheoryScenarioSpec,
): KineticTheorySolution {
  const validation = validateThermalScenario(spec);
  if (!validation.valid) {
    throw new Error(validation.issues.map((i) => i.message).join(" "));
  }
  const R = spec.gasConstantR ?? MOLAR_GAS_CONSTANT;
  const kB = spec.boltzmannConstant ?? BOLTZMANN_CONSTANT;
  const NA = spec.avogadroConstant ?? AVOGADRO_CONSTANT;
  const T = spec.temperatureK;

  const useMolar = spec.molarMassKgPerMol !== undefined;
  const molarMassKgPerMol =
    spec.molarMassKgPerMol ?? spec.particleMassKg! * NA;
  const particleMassKg =
    spec.particleMassKg ?? (molarMassKgPerMol * kB) / R;

  // Thermal speed parameter v_th^2 = R*T/M or k_B*T/m
  const thermalVariance = useMolar
    ? (R * T) / molarMassKgPerMol
    : (kB * T) / particleMassKg;

  const rmsSpeedMs = Math.sqrt(3 * thermalVariance);
  const meanSpeedMs = Math.sqrt((8 / Math.PI) * thermalVariance);
  const mostProbableSpeedMs = Math.sqrt(2 * thermalVariance);
  const averageKineticEnergyJ = 1.5 * kB * T;
  const averageKineticEnergyEv = averageKineticEnergyJ / ELEMENTARY_CHARGE;
  const molarInternalEnergyJPerMol = 1.5 * R * T;

  let pressurePa: number | null = null;
  let densityKgPerM3: number | null = null;
  if (spec.moles !== undefined && spec.volumeM3 !== undefined) {
    densityKgPerM3 = (spec.moles * molarMassKgPerMol) / spec.volumeM3;
    pressurePa = (spec.moles * R * T) / spec.volumeM3;
  }

  let comparisonTemperatureK: number | null = null;
  let comparisonRmsSpeedMs: number | null = null;
  let comparisonMeanSpeedMs: number | null = null;
  let comparisonMostProbableSpeedMs: number | null = null;
  let comparisonAverageKineticEnergyJ: number | null = null;

  if (spec.comparisonTemperatureK !== undefined) {
    comparisonTemperatureK = spec.comparisonTemperatureK;
    const compVar = useMolar
      ? (R * comparisonTemperatureK) / molarMassKgPerMol
      : (kB * comparisonTemperatureK) / particleMassKg;
    comparisonRmsSpeedMs = Math.sqrt(3 * compVar);
    comparisonMeanSpeedMs = Math.sqrt((8 / Math.PI) * compVar);
    comparisonMostProbableSpeedMs = Math.sqrt(2 * compVar);
    comparisonAverageKineticEnergyJ = 1.5 * kB * comparisonTemperatureK;
  }

  const quantities: Record<string, number> = {
    temperatureK: T,
    molarMassKgPerMol,
    particleMassKg,
    rmsSpeedMs,
    meanSpeedMs,
    mostProbableSpeedMs,
    averageKineticEnergyJ,
    averageKineticEnergyEv,
    molarInternalEnergyJPerMol,
  };
  if (spec.moles !== undefined) quantities.moles = spec.moles;
  if (spec.volumeM3 !== undefined) quantities.volumeM3 = spec.volumeM3;
  if (pressurePa !== null) quantities.pressurePa = pressurePa;
  if (densityKgPerM3 !== null) quantities.densityKgPerM3 = densityKgPerM3;
  if (comparisonTemperatureK !== null) {
    quantities.comparisonTemperatureK = comparisonTemperatureK;
  }
  if (comparisonRmsSpeedMs !== null) {
    quantities.comparisonRmsSpeedMs = comparisonRmsSpeedMs;
  }
  if (comparisonMeanSpeedMs !== null) {
    quantities.comparisonMeanSpeedMs = comparisonMeanSpeedMs;
  }
  if (comparisonMostProbableSpeedMs !== null) {
    quantities.comparisonMostProbableSpeedMs = comparisonMostProbableSpeedMs;
  }
  if (comparisonAverageKineticEnergyJ !== null) {
    quantities.comparisonAverageKineticEnergyJ =
      comparisonAverageKineticEnergyJ;
  }

  return {
    kind: "kinetic-theory",
    temperatureK: T,
    molarMassKgPerMol,
    particleMassKg,
    rmsSpeedMs,
    meanSpeedMs,
    mostProbableSpeedMs,
    averageKineticEnergyJ,
    averageKineticEnergyEv,
    molarInternalEnergyJPerMol,
    pressurePa,
    densityKgPerM3,
    comparisonTemperatureK,
    comparisonRmsSpeedMs,
    comparisonMeanSpeedMs,
    comparisonMostProbableSpeedMs,
    comparisonAverageKineticEnergyJ,
    quantities,
  };
}

/* -------------------------------------------------------------------------- */
/* 5. Thermal Radiation & Blackbody Solver                                    */
/* -------------------------------------------------------------------------- */

export function solveThermalRadiation(
  spec: ThermalRadiationScenarioSpec,
): ThermalRadiationSolution {
  const validation = validateThermalScenario(spec);
  if (!validation.valid) {
    throw new Error(validation.issues.map((i) => i.message).join(" "));
  }
  const b = spec.wienConstantMK ?? WIEN_DISPLACEMENT_CONSTANT;
  const sigma = spec.stefanBoltzmannConstant ?? STEFAN_BOLTZMANN_CONSTANT;
  const T = spec.temperatureK;
  const emissivity = spec.emissivity ?? 1;
  const area = spec.surfaceAreaM2;

  const peakWavelengthM = b / T;
  const peakWavelengthNm = peakWavelengthM * 1e9;
  const radiatedIntensityWm2 = emissivity * sigma * T ** 4;
  const radiatedPowerW = radiatedIntensityWm2 * area;

  const ambientTemperatureK = spec.ambientTemperatureK ?? null;
  const netRadiatedPowerW =
    ambientTemperatureK !== null
      ? emissivity * sigma * area * (T ** 4 - ambientTemperatureK ** 4)
      : radiatedPowerW;

  const observerDistanceM = spec.observerDistanceM ?? null;
  const intensityAtDistanceWm2 =
    observerDistanceM !== null
      ? radiatedPowerW / (4 * Math.PI * observerDistanceM ** 2)
      : null;

  let comparisonTemperatureK: number | null = null;
  let comparisonEmissivity: number | null = null;
  let comparisonPeakWavelengthM: number | null = null;
  let comparisonRadiatedPowerW: number | null = null;
  let comparisonPowerRatio: number | null = null;

  if (spec.comparisonTemperatureK !== undefined) {
    comparisonTemperatureK = spec.comparisonTemperatureK;
    comparisonEmissivity = spec.comparisonEmissivity ?? emissivity;
    comparisonPeakWavelengthM = b / comparisonTemperatureK;
    comparisonRadiatedPowerW =
      comparisonEmissivity * sigma * area * comparisonTemperatureK ** 4;
    comparisonPowerRatio = comparisonRadiatedPowerW / radiatedPowerW;
  }

  const quantities: Record<string, number> = {
    temperatureK: T,
    emissivity,
    surfaceAreaM2: area,
    peakWavelengthM,
    peakWavelengthNm,
    radiatedPowerW,
    radiatedIntensityWm2,
    netRadiatedPowerW,
  };
  if (ambientTemperatureK !== null) {
    quantities.ambientTemperatureK = ambientTemperatureK;
  }
  if (observerDistanceM !== null) {
    quantities.observerDistanceM = observerDistanceM;
  }
  if (intensityAtDistanceWm2 !== null) {
    quantities.intensityAtDistanceWm2 = intensityAtDistanceWm2;
  }
  if (comparisonTemperatureK !== null) {
    quantities.comparisonTemperatureK = comparisonTemperatureK;
  }
  if (comparisonEmissivity !== null) {
    quantities.comparisonEmissivity = comparisonEmissivity;
  }
  if (comparisonPeakWavelengthM !== null) {
    quantities.comparisonPeakWavelengthM = comparisonPeakWavelengthM;
    quantities.comparisonPeakWavelengthNm = comparisonPeakWavelengthM * 1e9;
  }
  if (comparisonRadiatedPowerW !== null) {
    quantities.comparisonRadiatedPowerW = comparisonRadiatedPowerW;
  }
  if (comparisonPowerRatio !== null) {
    quantities.comparisonPowerRatio = comparisonPowerRatio;
  }

  return {
    kind: "thermal-radiation",
    temperatureK: T,
    emissivity,
    surfaceAreaM2: area,
    peakWavelengthM,
    peakWavelengthNm,
    radiatedPowerW,
    radiatedIntensityWm2,
    ambientTemperatureK,
    netRadiatedPowerW,
    observerDistanceM,
    intensityAtDistanceWm2,
    comparisonTemperatureK,
    comparisonEmissivity,
    comparisonPeakWavelengthM,
    comparisonRadiatedPowerW,
    comparisonPowerRatio,
    quantities,
  };
}

/* -------------------------------------------------------------------------- */
/* Unified Dispatcher                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Solve any validated ThermalScenarioSpec deterministically.
 */
export function solveThermalScenario(
  spec: ThermalScenarioSpec,
): ThermalScenarioSolution {
  switch (spec.kind) {
    case "thermodynamic-process":
      return solveThermodynamicProcess(spec);
    case "carnot-cycle":
      return solveCarnotCycle(spec);
    case "phase-change-curve":
      return solvePhaseChangeCurve(spec);
    case "calorimetry-mixing":
      return solveCalorimetryMixing(spec);
    case "kinetic-theory":
      return solveKineticTheory(spec);
    case "thermal-radiation":
      return solveThermalRadiation(spec);
    default: {
      const exhaustive: never = spec;
      throw new Error(
        `Unsupported thermal scenario: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}
