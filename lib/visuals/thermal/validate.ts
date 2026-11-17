import {
  AVOGADRO_CONSTANT,
  BOLTZMANN_CONSTANT,
  MOLAR_GAS_CONSTANT,
  MONATOMIC_ADIABATIC_GAMMA,
  STEFAN_BOLTZMANN_CONSTANT,
  WIEN_DISPLACEMENT_CONSTANT,
} from "./constants";
import {
  CalorimetryComponentSpec,
  CalorimetryMixingScenarioSpec,
  CarnotCycleScenarioSpec,
  KineticTheoryScenarioSpec,
  MatterPhase,
  PhaseChangeScenarioSpec,
  ThermalProcessKind,
  ThermalRadiationScenarioSpec,
  ThermalScenarioSpec,
  ThermalValidationIssue,
  ThermalValidationResult,
  ThermodynamicProcessScenarioSpec,
} from "./types";

const VALID_PROCESSES: readonly ThermalProcessKind[] = [
  "isobaric",
  "isochoric",
  "isothermal",
  "adiabatic",
];

const VALID_PLANES = ["PV", "PT", "VT"] as const;

function pushIssue(
  issues: ThermalValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function checkPositiveFinite(
  issues: ThermalValidationIssue[],
  value: number | undefined,
  path: string,
  label: string,
): value is number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    pushIssue(
      issues,
      "INVALID_POSITIVE_NUMBER",
      path,
      `${label} must be finite and strictly positive.`,
    );
    return false;
  }
  return true;
}

function checkOptionalPositiveFinite(
  issues: ThermalValidationIssue[],
  value: number | undefined,
  path: string,
  label: string,
): boolean {
  if (value === undefined) return true;
  return checkPositiveFinite(issues, value, path, label);
}

function relativeDiff(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-30);
  return Math.abs(a - b) / denom;
}

function inferPhaseForTemp(
  temperatureK: number,
  meltingPointK: number,
  boilingPointK: number,
  explicitPhase: MatterPhase | undefined,
  defaultAtTransition: "lower" | "higher",
  issues: ThermalValidationIssue[],
  path: string,
): MatterPhase | null {
  const eps = 1e-9;
  if (temperatureK < meltingPointK - eps) {
    if (explicitPhase && explicitPhase !== "solid") {
      pushIssue(
        issues,
        "INCONSISTENT_PHASE",
        path,
        `Temperature ${temperatureK} K is below melting point ${meltingPointK} K, so phase must be solid.`,
      );
      return null;
    }
    return "solid";
  }
  if (Math.abs(temperatureK - meltingPointK) <= eps) {
    if (explicitPhase === "gas") {
      pushIssue(
        issues,
        "INCONSISTENT_PHASE",
        path,
        `Phase cannot be gas at melting point ${meltingPointK} K.`,
      );
      return null;
    }
    return (
      explicitPhase ?? (defaultAtTransition === "lower" ? "solid" : "liquid")
    );
  }
  if (temperatureK < boilingPointK - eps) {
    if (explicitPhase && explicitPhase !== "liquid") {
      pushIssue(
        issues,
        "INCONSISTENT_PHASE",
        path,
        `Temperature ${temperatureK} K lies between melting and boiling points, so phase must be liquid.`,
      );
      return null;
    }
    return "liquid";
  }
  if (Math.abs(temperatureK - boilingPointK) <= eps) {
    if (explicitPhase === "solid") {
      pushIssue(
        issues,
        "INCONSISTENT_PHASE",
        path,
        `Phase cannot be solid at boiling point ${boilingPointK} K.`,
      );
      return null;
    }
    return explicitPhase ?? (defaultAtTransition === "lower" ? "liquid" : "gas");
  }
  if (explicitPhase && explicitPhase !== "gas") {
    pushIssue(
      issues,
      "INCONSISTENT_PHASE",
      path,
      `Temperature ${temperatureK} K is above boiling point ${boilingPointK} K, so phase must be gas.`,
    );
    return null;
  }
  return "gas";
}

function validateThermodynamicProcessSpec(
  spec: ThermodynamicProcessScenarioSpec,
  issues: ThermalValidationIssue[],
): void {
  const R = spec.gasConstantR ?? MOLAR_GAS_CONSTANT;
  const kB = spec.boltzmannConstant ?? BOLTZMANN_CONSTANT;
  checkPositiveFinite(issues, R, "gasConstantR", "Molar gas constant R");
  checkPositiveFinite(
    issues,
    kB,
    "boltzmannConstant",
    "Boltzmann constant k_B",
  );
  if (
    spec.diagramPlane !== undefined &&
    !VALID_PLANES.includes(spec.diagramPlane)
  ) {
    pushIssue(
      issues,
      "INVALID_DIAGRAM_PLANE",
      "diagramPlane",
      "Diagram plane must be PV, PT, or VT.",
    );
  }
  if (spec.moles !== undefined) {
    checkPositiveFinite(issues, spec.moles, "moles", "Gas amount (moles)");
  }
  if (spec.particleCount !== undefined) {
    checkPositiveFinite(
      issues,
      spec.particleCount,
      "particleCount",
      "Particle count N",
    );
  }
  if (
    spec.moles !== undefined &&
    spec.particleCount !== undefined &&
    Number.isFinite(spec.moles) &&
    Number.isFinite(spec.particleCount) &&
    spec.moles > 0 &&
    spec.particleCount > 0
  ) {
    if (relativeDiff(spec.moles * R, spec.particleCount * kB) > 0.015) {
      pushIssue(
        issues,
        "INCONSISTENT_GAS_AMOUNT",
        "particleCount",
        "moles * R and particleCount * k_B disagree beyond data-booklet tolerance.",
      );
    }
  }

  const init = spec.initialState;
  if (!init || typeof init !== "object") {
    pushIssue(
      issues,
      "MISSING_INITIAL_STATE",
      "initialState",
      "initialState is required.",
    );
    return;
  }
  checkOptionalPositiveFinite(
    issues,
    init.pressurePa,
    "initialState.pressurePa",
    "Initial pressure",
  );
  checkOptionalPositiveFinite(
    issues,
    init.volumeM3,
    "initialState.volumeM3",
    "Initial volume",
  );
  checkOptionalPositiveFinite(
    issues,
    init.temperatureK,
    "initialState.temperatureK",
    "Initial temperature",
  );
  if (issues.length > 0) return;

  const hasGasAmount =
    spec.moles !== undefined || spec.particleCount !== undefined;
  const givenStateCount = [
    init.pressurePa,
    init.volumeM3,
    init.temperatureK,
  ].filter((v) => v !== undefined).length;

  if (!hasGasAmount && givenStateCount < 3) {
    pushIssue(
      issues,
      "UNDERCONSTRAINED_INITIAL_STATE",
      "initialState",
      "Provide moles/particleCount plus two of (pressurePa, volumeM3, temperatureK), or all three initial state variables.",
    );
    return;
  }
  if (hasGasAmount && givenStateCount < 2) {
    pushIssue(
      issues,
      "UNDERCONSTRAINED_INITIAL_STATE",
      "initialState",
      "At least two of initial (pressurePa, volumeM3, temperatureK) are required.",
    );
    return;
  }

  const cGas =
    spec.moles !== undefined
      ? spec.moles * R
      : spec.particleCount !== undefined
        ? spec.particleCount * kB
        : (init.pressurePa! * init.volumeM3!) / init.temperatureK!;

  let p0 = init.pressurePa;
  let v0 = init.volumeM3;
  let t0 = init.temperatureK;

  if (p0 !== undefined && v0 !== undefined && t0 !== undefined) {
    if (relativeDiff(p0 * v0, cGas * t0) > 1e-4) {
      pushIssue(
        issues,
        "OVERCONSTRAINED_INITIAL_STATE",
        "initialState",
        "Initial P, V, T violate the ideal gas law PV = nRT.",
      );
      return;
    }
    t0 = (p0 * v0) / cGas;
  } else if (p0 !== undefined && v0 !== undefined) {
    t0 = (p0 * v0) / cGas;
  } else if (p0 !== undefined && t0 !== undefined) {
    v0 = (cGas * t0) / p0;
  } else if (v0 !== undefined && t0 !== undefined) {
    p0 = (cGas * t0) / v0;
  }

  if (!Array.isArray(spec.steps) || spec.steps.length === 0) {
    pushIssue(
      issues,
      "EMPTY_PROCESS_STEPS",
      "steps",
      "At least one thermodynamic process step is required.",
    );
    return;
  }

  let curP = p0!;
  let curV = v0!;
  let curT = t0!;
  const gamma = MONATOMIC_ADIABATIC_GAMMA;
  const initialStateId = init.stateId ?? "A";
  if (!initialStateId.trim()) {
    pushIssue(
      issues,
      "EMPTY_STATE_ID",
      "initialState.stateId",
      "Initial stateId must be non-empty.",
    );
    return;
  }
  const seenStateIds = new Set<string>([initialStateId]);

  for (let i = 0; i < spec.steps.length; i++) {
    const step = spec.steps[i];
    const stepPath = `steps[${i}]`;
    const isClosingFinalStep =
      i === spec.steps.length - 1 &&
      spec.steps.length >= 2 &&
      (Boolean(step.closeToInitial) || spec.isClosedCycle === true);
    if (!isClosingFinalStep) {
      const defaultId = i + 1 < 26 ? String.fromCharCode(66 + i) : `S${i + 2}`;
      const toId = step.toStateId ?? defaultId;
      if (!toId.trim()) {
        pushIssue(
          issues,
          "EMPTY_STATE_ID",
          `${stepPath}.toStateId`,
          "Step toStateId must be non-empty.",
        );
        return;
      }
      if (seenStateIds.has(toId)) {
        pushIssue(
          issues,
          "DUPLICATE_STATE_ID",
          `${stepPath}.toStateId`,
          `Duplicate state identifier "${toId}" in thermodynamic path.`,
        );
        return;
      }
      seenStateIds.add(toId);
    }
    if (!VALID_PROCESSES.includes(step.process)) {
      pushIssue(
        issues,
        "INVALID_PROCESS_KIND",
        `${stepPath}.process`,
        `Unsupported thermodynamic process: ${String(step.process)}.`,
      );
      return;
    }
    checkOptionalPositiveFinite(
      issues,
      step.targetPressurePa,
      `${stepPath}.targetPressurePa`,
      "Target pressure",
    );
    checkOptionalPositiveFinite(
      issues,
      step.targetVolumeM3,
      `${stepPath}.targetVolumeM3`,
      "Target volume",
    );
    checkOptionalPositiveFinite(
      issues,
      step.targetTemperatureK,
      `${stepPath}.targetTemperatureK`,
      "Target temperature",
    );
    if (issues.length > 0) return;

    if (step.closeToInitial) {
      if (i !== spec.steps.length - 1 || spec.steps.length < 2) {
        pushIssue(
          issues,
          "INVALID_CLOSE_STEP",
          `${stepPath}.closeToInitial`,
          "closeToInitial is only valid on the final step of a multi-step cycle.",
        );
        return;
      }
      const closesCleanly =
        step.process === "isobaric"
          ? relativeDiff(curP, p0!) <= 1e-5
          : step.process === "isochoric"
            ? relativeDiff(curV, v0!) <= 1e-5
            : step.process === "isothermal"
              ? relativeDiff(curT, t0!) <= 1e-5
              : relativeDiff(curP * curV ** gamma, p0! * v0! ** gamma) <= 1e-5;
      if (!closesCleanly) {
        pushIssue(
          issues,
          "CYCLE_CLOSURE_MISMATCH",
          stepPath,
          `Final ${step.process} step cannot reach initialState along its thermodynamic curve.`,
        );
        return;
      }
      if (
        relativeDiff(curP, p0!) < 1e-12 &&
        relativeDiff(curV, v0!) < 1e-12
      ) {
        pushIssue(
          issues,
          "ZERO_CHANGE_STEP",
          stepPath,
          "Closing step starts already at initialState (zero thermodynamic change).",
        );
        return;
      }
      curP = p0!;
      curV = v0!;
      curT = t0!;
      continue;
    }

    const targetsProvided = [
      step.targetPressurePa,
      step.targetVolumeM3,
      step.targetTemperatureK,
    ].filter((v) => v !== undefined).length;
    if (targetsProvided === 0) {
      pushIssue(
        issues,
        "MISSING_STEP_TARGET",
        stepPath,
        "Each step must specify a target state variable or closeToInitial.",
      );
      return;
    }

    let nextP = curP;
    let nextV = curV;
    let nextT = curT;

    switch (step.process) {
      case "isobaric": {
        if (
          step.targetPressurePa !== undefined &&
          relativeDiff(step.targetPressurePa, curP) > 1e-5
        ) {
          pushIssue(
            issues,
            "INCONSISTENT_STEP_TARGET",
            `${stepPath}.targetPressurePa`,
            "Isobaric step cannot change pressure.",
          );
          return;
        }
        if (
          step.targetVolumeM3 === undefined &&
          step.targetTemperatureK === undefined
        ) {
          pushIssue(
            issues,
            "INDETERMINATE_STEP_TARGET",
            stepPath,
            "Isobaric step requires targetVolumeM3 or targetTemperatureK.",
          );
          return;
        }
        if (step.targetVolumeM3 !== undefined) {
          nextV = step.targetVolumeM3;
          nextT = (nextP * nextV) / cGas;
          if (
            step.targetTemperatureK !== undefined &&
            relativeDiff(nextT, step.targetTemperatureK) > 1e-4
          ) {
            pushIssue(
              issues,
              "INCONSISTENT_STEP_TARGET",
              stepPath,
              "Isobaric targetVolumeM3 and targetTemperatureK violate V/T = const.",
            );
            return;
          }
        } else {
          nextT = step.targetTemperatureK!;
          nextV = (cGas * nextT) / nextP;
        }
        break;
      }
      case "isochoric": {
        if (
          step.targetVolumeM3 !== undefined &&
          relativeDiff(step.targetVolumeM3, curV) > 1e-5
        ) {
          pushIssue(
            issues,
            "INCONSISTENT_STEP_TARGET",
            `${stepPath}.targetVolumeM3`,
            "Isochoric step cannot change volume.",
          );
          return;
        }
        if (
          step.targetPressurePa === undefined &&
          step.targetTemperatureK === undefined
        ) {
          pushIssue(
            issues,
            "INDETERMINATE_STEP_TARGET",
            stepPath,
            "Isochoric step requires targetPressurePa or targetTemperatureK.",
          );
          return;
        }
        if (step.targetPressurePa !== undefined) {
          nextP = step.targetPressurePa;
          nextT = (nextP * nextV) / cGas;
          if (
            step.targetTemperatureK !== undefined &&
            relativeDiff(nextT, step.targetTemperatureK) > 1e-4
          ) {
            pushIssue(
              issues,
              "INCONSISTENT_STEP_TARGET",
              stepPath,
              "Isochoric targetPressurePa and targetTemperatureK violate P/T = const.",
            );
            return;
          }
        } else {
          nextT = step.targetTemperatureK!;
          nextP = (cGas * nextT) / nextV;
        }
        break;
      }
      case "isothermal": {
        if (
          step.targetTemperatureK !== undefined &&
          relativeDiff(step.targetTemperatureK, curT) > 1e-5
        ) {
          pushIssue(
            issues,
            "INCONSISTENT_STEP_TARGET",
            `${stepPath}.targetTemperatureK`,
            "Isothermal step cannot change temperature.",
          );
          return;
        }
        if (
          step.targetVolumeM3 === undefined &&
          step.targetPressurePa === undefined
        ) {
          pushIssue(
            issues,
            "INDETERMINATE_STEP_TARGET",
            stepPath,
            "Isothermal step requires targetVolumeM3 or targetPressurePa.",
          );
          return;
        }
        if (step.targetVolumeM3 !== undefined) {
          nextV = step.targetVolumeM3;
          nextP = (cGas * nextT) / nextV;
          if (
            step.targetPressurePa !== undefined &&
            relativeDiff(nextP, step.targetPressurePa) > 1e-4
          ) {
            pushIssue(
              issues,
              "INCONSISTENT_STEP_TARGET",
              stepPath,
              "Isothermal targetVolumeM3 and targetPressurePa violate PV = const.",
            );
            return;
          }
        } else {
          nextP = step.targetPressurePa!;
          nextV = (cGas * nextT) / nextP;
        }
        break;
      }
      case "adiabatic": {
        if (step.targetVolumeM3 !== undefined) {
          nextV = step.targetVolumeM3;
          nextP = curP * (curV / nextV) ** gamma;
          nextT = (nextP * nextV) / cGas;
        } else if (step.targetPressurePa !== undefined) {
          nextP = step.targetPressurePa;
          nextV = curV * (curP / nextP) ** (1 / gamma);
          nextT = (nextP * nextV) / cGas;
        } else {
          nextT = step.targetTemperatureK!;
          nextV = curV * (curT / nextT) ** (1 / (gamma - 1));
          nextP = (cGas * nextT) / nextV;
        }
        if (
          step.targetPressurePa !== undefined &&
          relativeDiff(nextP, step.targetPressurePa) > 1e-4
        ) {
          pushIssue(
            issues,
            "INCONSISTENT_STEP_TARGET",
            stepPath,
            "Adiabatic targets violate PV^(5/3) = const.",
          );
          return;
        }
        if (
          step.targetTemperatureK !== undefined &&
          relativeDiff(nextT, step.targetTemperatureK) > 1e-4
        ) {
          pushIssue(
            issues,
            "INCONSISTENT_STEP_TARGET",
            stepPath,
            "Adiabatic targets violate TV^(2/3) = const.",
          );
          return;
        }
        break;
      }
    }

    if (
      relativeDiff(nextP, curP) < 1e-12 &&
      relativeDiff(nextV, curV) < 1e-12
    ) {
      pushIssue(
        issues,
        "ZERO_CHANGE_STEP",
        stepPath,
        "Thermodynamic step produces zero state change.",
      );
      return;
    }

    curP = nextP;
    curV = nextV;
    curT = nextT;
  }

  if (spec.isClosedCycle === true) {
    if (spec.steps.length < 2) {
      pushIssue(
        issues,
        "INVALID_CLOSED_CYCLE",
        "steps",
        "A closed cycle requires at least two steps.",
      );
      return;
    }
    if (
      relativeDiff(curP, p0!) > 1e-5 ||
      relativeDiff(curV, v0!) > 1e-5 ||
      relativeDiff(curT, t0!) > 1e-5
    ) {
      pushIssue(
        issues,
        "CYCLE_NOT_CLOSED",
        "isClosedCycle",
        "Final state does not return to initialState for closed cycle.",
      );
    }
  }
}

function validateCarnotCycleSpec(
  spec: CarnotCycleScenarioSpec,
  issues: ThermalValidationIssue[],
): void {
  const R = spec.gasConstantR ?? MOLAR_GAS_CONSTANT;
  const kB = spec.boltzmannConstant ?? BOLTZMANN_CONSTANT;
  checkPositiveFinite(issues, R, "gasConstantR", "Molar gas constant R");
  checkPositiveFinite(
    issues,
    kB,
    "boltzmannConstant",
    "Boltzmann constant k_B",
  );
  if (
    spec.diagramPlane !== undefined &&
    !VALID_PLANES.includes(spec.diagramPlane)
  ) {
    pushIssue(
      issues,
      "INVALID_DIAGRAM_PLANE",
      "diagramPlane",
      "Diagram plane must be PV, PT, or VT.",
    );
  }
  if (spec.moles === undefined && spec.particleCount === undefined) {
    pushIssue(
      issues,
      "MISSING_GAS_AMOUNT",
      "moles",
      "Carnot cycle requires moles or particleCount.",
    );
  }
  if (spec.moles !== undefined) {
    checkPositiveFinite(issues, spec.moles, "moles", "Moles n");
  }
  if (spec.particleCount !== undefined) {
    checkPositiveFinite(
      issues,
      spec.particleCount,
      "particleCount",
      "Particle count N",
    );
  }
  if (
    spec.moles !== undefined &&
    spec.particleCount !== undefined &&
    Number.isFinite(spec.moles) &&
    Number.isFinite(spec.particleCount) &&
    spec.moles > 0 &&
    spec.particleCount > 0 &&
    relativeDiff(spec.moles * R, spec.particleCount * kB) > 0.015
  ) {
    pushIssue(
      issues,
      "INCONSISTENT_GAS_AMOUNT",
      "particleCount",
      "moles * R and particleCount * k_B disagree.",
    );
  }

  const hotOk = checkPositiveFinite(
    issues,
    spec.hotTemperatureK,
    "hotTemperatureK",
    "Hot reservoir temperature T_H",
  );
  const coldOk = checkPositiveFinite(
    issues,
    spec.coldTemperatureK,
    "coldTemperatureK",
    "Cold reservoir temperature T_C",
  );
  if (hotOk && coldOk && spec.coldTemperatureK >= spec.hotTemperatureK) {
    pushIssue(
      issues,
      "INVALID_RESERVOIR_TEMPERATURES",
      "coldTemperatureK",
      "Cold reservoir temperature T_C must be strictly less than T_H.",
    );
  }

  const v1Ok = checkPositiveFinite(
    issues,
    spec.initialVolumeM3,
    "initialVolumeM3",
    "Initial volume V_1",
  );
  const v2Ok = checkPositiveFinite(
    issues,
    spec.isothermalExpansionVolumeM3,
    "isothermalExpansionVolumeM3",
    "Isothermal expansion volume V_2",
  );
  if (v1Ok && v2Ok && spec.isothermalExpansionVolumeM3 <= spec.initialVolumeM3) {
    pushIssue(
      issues,
      "INVALID_EXPANSION_VOLUME",
      "isothermalExpansionVolumeM3",
      "isothermalExpansionVolumeM3 must exceed initialVolumeM3.",
    );
  }
  if (
    spec.cycleDirection !== undefined &&
    spec.cycleDirection !== "heat-engine" &&
    spec.cycleDirection !== "refrigerator"
  ) {
    pushIssue(
      issues,
      "INVALID_CYCLE_DIRECTION",
      "cycleDirection",
      "cycleDirection must be heat-engine or refrigerator.",
    );
  }
}

function validatePhaseChangeSpec(
  spec: PhaseChangeScenarioSpec,
  issues: ThermalValidationIssue[],
): void {
  const mat = spec.material;
  if (!mat || typeof mat !== "object") {
    pushIssue(issues, "MISSING_MATERIAL", "material", "material is required.");
    return;
  }
  checkPositiveFinite(issues, mat.massKg, "material.massKg", "Sample mass");
  const tmOk = checkPositiveFinite(
    issues,
    mat.meltingPointK,
    "material.meltingPointK",
    "Melting point",
  );
  const tbOk = checkPositiveFinite(
    issues,
    mat.boilingPointK,
    "material.boilingPointK",
    "Boiling point",
  );
  if (tmOk && tbOk && mat.boilingPointK <= mat.meltingPointK) {
    pushIssue(
      issues,
      "INVALID_PHASE_BOUNDARIES",
      "material.boilingPointK",
      "boilingPointK must be strictly greater than meltingPointK.",
    );
  }
  const tiOk = checkPositiveFinite(
    issues,
    spec.initialTemperatureK,
    "initialTemperatureK",
    "Initial temperature",
  );
  const tfOk = checkPositiveFinite(
    issues,
    spec.finalTemperatureK,
    "finalTemperatureK",
    "Final temperature",
  );
  if (spec.heaterPowerW !== undefined) {
    checkPositiveFinite(
      issues,
      spec.heaterPowerW,
      "heaterPowerW",
      "Heater power",
    );
  }
  if (spec.xAxisMode === "time" && spec.heaterPowerW === undefined) {
    pushIssue(
      issues,
      "MISSING_HEATER_POWER",
      "heaterPowerW",
      "heaterPowerW is required when xAxisMode is time.",
    );
  }
  if (
    spec.heaterEfficiency !== undefined &&
    (!Number.isFinite(spec.heaterEfficiency) ||
      spec.heaterEfficiency <= 0 ||
      spec.heaterEfficiency > 1)
  ) {
    pushIssue(
      issues,
      "INVALID_HEATER_EFFICIENCY",
      "heaterEfficiency",
      "heaterEfficiency must lie in (0, 1].",
    );
  }
  if (issues.length > 0 || !tiOk || !tfOk || !tmOk || !tbOk) return;

  const phaseRank: Record<MatterPhase, number> = {
    solid: 0,
    liquid: 1,
    gas: 2,
  };

  let isHeating: boolean;
  if (spec.finalTemperatureK > spec.initialTemperatureK) {
    isHeating = true;
  } else if (spec.finalTemperatureK < spec.initialTemperatureK) {
    isHeating = false;
  } else {
    if (
      !spec.initialPhase ||
      !spec.finalPhase ||
      spec.initialPhase === spec.finalPhase
    ) {
      pushIssue(
        issues,
        "ZERO_THERMAL_CHANGE",
        "finalTemperatureK",
        "Initial and final states are identical (zero energy transfer).",
      );
      return;
    }
    isHeating = phaseRank[spec.finalPhase] > phaseRank[spec.initialPhase];
  }

  const initPhase = inferPhaseForTemp(
    spec.initialTemperatureK,
    mat.meltingPointK,
    mat.boilingPointK,
    spec.initialPhase,
    isHeating ? "lower" : "higher",
    issues,
    "initialPhase",
  );
  const finPhase = inferPhaseForTemp(
    spec.finalTemperatureK,
    mat.meltingPointK,
    mat.boilingPointK,
    spec.finalPhase,
    isHeating ? "higher" : "lower",
    issues,
    "finalPhase",
  );
  if (!initPhase || !finPhase || issues.length > 0) return;

  const lowT = Math.min(spec.initialTemperatureK, spec.finalTemperatureK);
  const highT = Math.max(spec.initialTemperatureK, spec.finalTemperatureK);
  const lowPhase = isHeating ? initPhase : finPhase;
  const highPhase = isHeating ? finPhase : initPhase;

  if (lowT < mat.meltingPointK) {
    checkPositiveFinite(
      issues,
      mat.specificHeatSolidJPerKgK,
      "material.specificHeatSolidJPerKgK",
      "Solid specific heat capacity c_solid",
    );
  }
  if (phaseRank[lowPhase] === 0 && phaseRank[highPhase] >= 1) {
    checkPositiveFinite(
      issues,
      mat.latentHeatFusionJPerKg,
      "material.latentHeatFusionJPerKg",
      "Specific latent heat of fusion L_f",
    );
  }
  const liquidSpanStart = Math.max(lowT, mat.meltingPointK);
  const liquidSpanEnd = Math.min(highT, mat.boilingPointK);
  if (liquidSpanEnd > liquidSpanStart + 1e-12) {
    checkPositiveFinite(
      issues,
      mat.specificHeatLiquidJPerKgK,
      "material.specificHeatLiquidJPerKgK",
      "Liquid specific heat capacity c_liquid",
    );
  }
  if (phaseRank[lowPhase] <= 1 && phaseRank[highPhase] === 2) {
    checkPositiveFinite(
      issues,
      mat.latentHeatVaporizationJPerKg,
      "material.latentHeatVaporizationJPerKg",
      "Specific latent heat of vaporization L_v",
    );
  }
  if (highT > mat.boilingPointK) {
    checkPositiveFinite(
      issues,
      mat.specificHeatGasJPerKgK,
      "material.specificHeatGasJPerKgK",
      "Gas specific heat capacity c_gas",
    );
  }
}

function validateCalorimetryComponent(
  comp: CalorimetryComponentSpec,
  index: number,
  issues: ThermalValidationIssue[],
): void {
  const basePath = `components[${index}]`;
  if (!comp.id || !comp.id.trim()) {
    pushIssue(
      issues,
      "EMPTY_COMPONENT_ID",
      `${basePath}.id`,
      "Component id must be non-empty.",
    );
  }
  if (!comp.label || !comp.label.trim()) {
    pushIssue(
      issues,
      "EMPTY_COMPONENT_LABEL",
      `${basePath}.label`,
      "Component label must be non-empty.",
    );
  }
  checkPositiveFinite(issues, comp.massKg, `${basePath}.massKg`, "Mass");
  checkPositiveFinite(
    issues,
    comp.initialTemperatureK,
    `${basePath}.initialTemperatureK`,
    "Initial temperature",
  );

  const hasPhaseModel =
    comp.meltingPointK !== undefined || comp.boilingPointK !== undefined;

  if (!hasPhaseModel) {
    checkPositiveFinite(
      issues,
      comp.specificHeatJPerKgK,
      `${basePath}.specificHeatJPerKgK`,
      "Specific heat capacity c",
    );
    return;
  }

  const tmOk = checkPositiveFinite(
    issues,
    comp.meltingPointK,
    `${basePath}.meltingPointK`,
    "Melting point",
  );
  checkPositiveFinite(
    issues,
    comp.specificHeatSolidJPerKgK,
    `${basePath}.specificHeatSolidJPerKgK`,
    "Solid specific heat c_solid",
  );
  checkPositiveFinite(
    issues,
    comp.specificHeatLiquidJPerKgK,
    `${basePath}.specificHeatLiquidJPerKgK`,
    "Liquid specific heat c_liquid",
  );
  checkPositiveFinite(
    issues,
    comp.latentHeatFusionJPerKg,
    `${basePath}.latentHeatFusionJPerKg`,
    "Latent heat of fusion L_f",
  );

  let tb = Infinity;
  if (comp.boilingPointK !== undefined) {
    const tbOk = checkPositiveFinite(
      issues,
      comp.boilingPointK,
      `${basePath}.boilingPointK`,
      "Boiling point",
    );
    if (tmOk && tbOk && comp.boilingPointK <= comp.meltingPointK!) {
      pushIssue(
        issues,
        "INVALID_PHASE_BOUNDARIES",
        `${basePath}.boilingPointK`,
        "boilingPointK must exceed meltingPointK.",
      );
    }
    tb = comp.boilingPointK;
    checkPositiveFinite(
      issues,
      comp.specificHeatGasJPerKgK,
      `${basePath}.specificHeatGasJPerKgK`,
      "Gas specific heat c_gas",
    );
    checkPositiveFinite(
      issues,
      comp.latentHeatVaporizationJPerKg,
      `${basePath}.latentHeatVaporizationJPerKg`,
      "Latent heat of vaporization L_v",
    );
  }

  if (tmOk && Number.isFinite(comp.initialTemperatureK)) {
    inferPhaseForTemp(
      comp.initialTemperatureK,
      comp.meltingPointK!,
      tb,
      comp.initialPhase,
      "lower",
      issues,
      `${basePath}.initialPhase`,
    );
  }
}

function initialComponentEnthalpyFromZero(comp: CalorimetryComponentSpec): number {
  if (comp.meltingPointK === undefined) {
    return comp.massKg * comp.specificHeatJPerKgK! * comp.initialTemperatureK;
  }
  const m = comp.massKg;
  const tm = comp.meltingPointK;
  const tb = comp.boilingPointK ?? Infinity;
  const cs = comp.specificHeatSolidJPerKgK!;
  const cl = comp.specificHeatLiquidJPerKgK!;
  const cg = comp.specificHeatGasJPerKgK ?? cl;
  const lf = comp.latentHeatFusionJPerKg!;
  const lv = comp.latentHeatVaporizationJPerKg ?? 0;
  const t = comp.initialTemperatureK;
  const eps = 1e-9;

  if (t < tm - eps) return m * cs * t;
  if (Math.abs(t - tm) <= eps) {
    return comp.initialPhase === "liquid" ? m * cs * tm + m * lf : m * cs * tm;
  }
  if (t < tb - eps) return m * cs * tm + m * lf + m * cl * (t - tm);
  if (Math.abs(t - tb) <= eps) {
    const baseLiq = m * cs * tm + m * lf + m * cl * (tb - tm);
    return comp.initialPhase === "gas" ? baseLiq + m * lv : baseLiq;
  }
  return m * cs * tm + m * lf + m * cl * (tb - tm) + m * lv + m * cg * (t - tb);
}

function validateCalorimetryMixingSpec(
  spec: CalorimetryMixingScenarioSpec,
  issues: ThermalValidationIssue[],
): void {
  if (!Array.isArray(spec.components) || spec.components.length < 2) {
    pushIssue(
      issues,
      "INSUFFICIENT_COMPONENTS",
      "components",
      "Calorimetry mixing requires at least two components.",
    );
    return;
  }
  const seenIds = new Set<string>();
  spec.components.forEach((comp, idx) => {
    validateCalorimetryComponent(comp, idx, issues);
    if (comp.id && seenIds.has(comp.id)) {
      pushIssue(
        issues,
        "DUPLICATE_COMPONENT_ID",
        `components[${idx}].id`,
        `Duplicate component id: ${comp.id}.`,
      );
    }
    if (comp.id) seenIds.add(comp.id);
  });

  if (
    spec.heatLossToSurroundingsJ !== undefined &&
    (!Number.isFinite(spec.heatLossToSurroundingsJ) ||
      spec.heatLossToSurroundingsJ < 0)
  ) {
    pushIssue(
      issues,
      "INVALID_HEAT_LOSS",
      "heatLossToSurroundingsJ",
      "heatLossToSurroundingsJ must be finite and non-negative.",
    );
  }
  if (issues.length > 0) return;

  const totalInitialEnthalpy = spec.components.reduce(
    (sum, c) => sum + initialComponentEnthalpyFromZero(c),
    0,
  );
  const loss = spec.heatLossToSurroundingsJ ?? 0;
  if (loss >= totalInitialEnthalpy) {
    pushIssue(
      issues,
      "EXCESSIVE_HEAT_LOSS",
      "heatLossToSurroundingsJ",
      "Heat loss exceeds total thermal enthalpy above absolute zero.",
    );
  }
}

function validateKineticTheorySpec(
  spec: KineticTheoryScenarioSpec,
  issues: ThermalValidationIssue[],
): void {
  const R = spec.gasConstantR ?? MOLAR_GAS_CONSTANT;
  const kB = spec.boltzmannConstant ?? BOLTZMANN_CONSTANT;
  const NA = spec.avogadroConstant ?? AVOGADRO_CONSTANT;
  checkPositiveFinite(issues, R, "gasConstantR", "Molar gas constant R");
  checkPositiveFinite(
    issues,
    kB,
    "boltzmannConstant",
    "Boltzmann constant k_B",
  );
  checkPositiveFinite(issues, NA, "avogadroConstant", "Avogadro constant N_A");
  checkPositiveFinite(issues, spec.temperatureK, "temperatureK", "Temperature");
  if (
    spec.molarMassKgPerMol === undefined &&
    spec.particleMassKg === undefined
  ) {
    pushIssue(
      issues,
      "MISSING_GAS_MASS",
      "molarMassKgPerMol",
      "Provide molarMassKgPerMol or particleMassKg.",
    );
  }
  checkOptionalPositiveFinite(
    issues,
    spec.molarMassKgPerMol,
    "molarMassKgPerMol",
    "Molar mass M",
  );
  checkOptionalPositiveFinite(
    issues,
    spec.particleMassKg,
    "particleMassKg",
    "Particle mass m",
  );
  if (
    spec.molarMassKgPerMol !== undefined &&
    spec.particleMassKg !== undefined &&
    Number.isFinite(spec.molarMassKgPerMol) &&
    Number.isFinite(spec.particleMassKg) &&
    spec.molarMassKgPerMol > 0 &&
    spec.particleMassKg > 0 &&
    relativeDiff(spec.particleMassKg * NA, spec.molarMassKgPerMol) > 0.02
  ) {
    pushIssue(
      issues,
      "INCONSISTENT_PARTICLE_MOLAR_MASS",
      "particleMassKg",
      "particleMassKg * N_A disagrees with molarMassKgPerMol.",
    );
  }
  checkOptionalPositiveFinite(
    issues,
    spec.comparisonTemperatureK,
    "comparisonTemperatureK",
    "Comparison temperature",
  );
  checkOptionalPositiveFinite(issues, spec.moles, "moles", "Moles");
  checkOptionalPositiveFinite(issues, spec.volumeM3, "volumeM3", "Volume");
  if (
    (spec.moles !== undefined) !== (spec.volumeM3 !== undefined)
  ) {
    pushIssue(
      issues,
      "INCOMPLETE_MACROSCOPIC_STATE",
      "volumeM3",
      "Provide both moles and volumeM3 together when computing macroscopic gas pressure.",
    );
  }
}

function validateThermalRadiationSpec(
  spec: ThermalRadiationScenarioSpec,
  issues: ThermalValidationIssue[],
): void {
  const b = spec.wienConstantMK ?? WIEN_DISPLACEMENT_CONSTANT;
  const sigma = spec.stefanBoltzmannConstant ?? STEFAN_BOLTZMANN_CONSTANT;
  checkPositiveFinite(issues, b, "wienConstantMK", "Wien constant b");
  checkPositiveFinite(
    issues,
    sigma,
    "stefanBoltzmannConstant",
    "Stefan-Boltzmann constant sigma",
  );
  checkPositiveFinite(issues, spec.temperatureK, "temperatureK", "Temperature");
  checkPositiveFinite(
    issues,
    spec.surfaceAreaM2,
    "surfaceAreaM2",
    "Surface area A",
  );
  const emissivity = spec.emissivity ?? 1;
  if (!Number.isFinite(emissivity) || emissivity <= 0 || emissivity > 1) {
    pushIssue(
      issues,
      "INVALID_EMISSIVITY",
      "emissivity",
      "Emissivity must lie in (0, 1].",
    );
  }
  if (
    spec.ambientTemperatureK !== undefined &&
    (!Number.isFinite(spec.ambientTemperatureK) || spec.ambientTemperatureK < 0)
  ) {
    pushIssue(
      issues,
      "INVALID_AMBIENT_TEMPERATURE",
      "ambientTemperatureK",
      "Ambient temperature must be finite and >= 0 K.",
    );
  }
  checkOptionalPositiveFinite(
    issues,
    spec.observerDistanceM,
    "observerDistanceM",
    "Observer distance d",
  );
  checkOptionalPositiveFinite(
    issues,
    spec.comparisonTemperatureK,
    "comparisonTemperatureK",
    "Comparison temperature",
  );
  if (
    spec.comparisonEmissivity !== undefined &&
    (!Number.isFinite(spec.comparisonEmissivity) ||
      spec.comparisonEmissivity <= 0 ||
      spec.comparisonEmissivity > 1)
  ) {
    pushIssue(
      issues,
      "INVALID_COMPARISON_EMISSIVITY",
      "comparisonEmissivity",
      "Comparison emissivity must lie in (0, 1].",
    );
  }
}

/**
 * Deterministically validate any ThermalScenarioSpec without throwing.
 */
export function validateThermalScenario(
  spec: ThermalScenarioSpec,
): ThermalValidationResult {
  const issues: ThermalValidationIssue[] = [];
  if (!spec || typeof spec !== "object") {
    return {
      valid: false,
      issues: [
        {
          code: "INVALID_SPEC",
          path: "",
          message: "Scenario specification must be a non-null object.",
        },
      ],
    };
  }

  switch (spec.kind) {
    case "thermodynamic-process":
      validateThermodynamicProcessSpec(spec, issues);
      break;
    case "carnot-cycle":
      validateCarnotCycleSpec(spec, issues);
      break;
    case "phase-change-curve":
      validatePhaseChangeSpec(spec, issues);
      break;
    case "calorimetry-mixing":
      validateCalorimetryMixingSpec(spec, issues);
      break;
    case "kinetic-theory":
      validateKineticTheorySpec(spec, issues);
      break;
    case "thermal-radiation":
      validateThermalRadiationSpec(spec, issues);
      break;
    default: {
      const unknownKind = (spec as { kind?: unknown }).kind;
      pushIssue(
        issues,
        "UNKNOWN_SCENARIO_KIND",
        "kind",
        `Unsupported thermal scenario kind: ${String(unknownKind)}.`,
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
