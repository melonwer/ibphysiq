import {
  evToJoules,
  mevToJoules,
  QuantumNuclearConstants,
  resolveConstants,
  TIME_UNIT_TO_SECONDS,
} from "./constants";
import {
  DecayStepInput,
  EnergyLevelsScenarioSpec,
  MatterWavesScenarioSpec,
  NuclearBindingScenarioSpec,
  NuclearDecayChainScenarioSpec,
  NuclearDecayMode,
  PhotoelectricScenarioSpec,
  QuantumNuclearScenarioSpec,
  QuantumNuclearValidationIssue,
  QuantumNuclearValidationResult,
  RadioactiveDecayScenarioSpec,
  RutherfordScatteringScenarioSpec,
  SpecialRelativityScenarioSpec,
} from "./types";

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: number | undefined): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 1
  );
}

export function decayModeDeltas(mode: NuclearDecayMode): {
  deltaA: number;
  deltaZ: number;
  deltaN: number;
  emittedParticles: readonly string[];
} {
  switch (mode) {
    case "alpha":
      return {
        deltaA: -4,
        deltaZ: -2,
        deltaN: -2,
        emittedParticles: ["⁴₂α"],
      };
    case "beta-minus":
      return {
        deltaA: 0,
        deltaZ: 1,
        deltaN: -1,
        emittedParticles: ["⁰₋₁β⁻", "ν̄ₑ"],
      };
    case "beta-plus":
      return {
        deltaA: 0,
        deltaZ: -1,
        deltaN: 1,
        emittedParticles: ["⁰₊₁β⁺", "νₑ"],
      };
    case "gamma":
      return {
        deltaA: 0,
        deltaZ: 0,
        deltaN: 0,
        emittedParticles: ["γ"],
      };
    case "electron-capture":
      return {
        deltaA: 0,
        deltaZ: -1,
        deltaN: 1,
        emittedParticles: ["νₑ"],
      };
    case "neutron-emission":
      return {
        deltaA: -1,
        deltaZ: 0,
        deltaN: -1,
        emittedParticles: ["¹₀n"],
      };
  }
}

function validateConstantsOverrides(
  overrides: Partial<QuantumNuclearConstants> | undefined,
  issues: QuantumNuclearValidationIssue[],
): QuantumNuclearConstants {
  if (overrides) {
    for (const [key, val] of Object.entries(overrides)) {
      if (val === undefined) continue;
      if (typeof val !== "number" || !Number.isFinite(val)) {
        issues.push({
          code: "INVALID_CONSTANT",
          path: `constants.${key}`,
          message: `Constant ${key} must be a finite number`,
        });
      } else if (key === "bohrGroundStateEv") {
        if (val >= 0) {
          issues.push({
            code: "INVALID_CONSTANT",
            path: `constants.${key}`,
            message: "bohrGroundStateEv must be negative",
          });
        }
      } else if (val <= 0) {
        issues.push({
          code: "INVALID_CONSTANT",
          path: `constants.${key}`,
          message: `Constant ${key} must be strictly positive`,
        });
      }
    }
  }
  return resolveConstants(overrides);
}

function validateEnergyLevels(
  spec: EnergyLevelsScenarioSpec,
  constants: QuantumNuclearConstants,
  issues: QuantumNuclearValidationIssue[],
): void {
  const model = spec.atomModel ?? (spec.levels ? "custom" : "bohr-hydrogen");
  const levelMap = new Map<string, number>();

  if (model === "bohr-hydrogen") {
    const z = spec.atomicNumberZ ?? 1;
    const maxN = spec.maxPrincipalN ?? 4;
    if (!isPositiveInteger(z) || z > 118) {
      issues.push({
        code: "INVALID_ATOMIC_NUMBER",
        path: "atomicNumberZ",
        message: "atomicNumberZ must be an integer between 1 and 118",
      });
    }
    if (!isPositiveInteger(maxN) || maxN < 2 || maxN > 12) {
      issues.push({
        code: "INVALID_MAX_PRINCIPAL_N",
        path: "maxPrincipalN",
        message: "maxPrincipalN must be an integer between 2 and 12",
      });
    }
    if (isPositiveInteger(z) && isPositiveInteger(maxN) && maxN >= 2 && maxN <= 12) {
      for (let n = 1; n <= maxN; n += 1) {
        levelMap.set(`n=${n}`, (constants.bohrGroundStateEv * z * z) / (n * n));
      }
      if (spec.includeContinuumZero ?? true) {
        levelMap.set("n=inf", 0);
      }
    }
  } else {
    if (!spec.levels || spec.levels.length < 2) {
      issues.push({
        code: "INSUFFICIENT_LEVELS",
        path: "levels",
        message: "Custom energy-levels scenario requires at least 2 levels",
      });
    } else {
      const seenEnergies: number[] = [];
      spec.levels.forEach((lvl, idx) => {
        if (!lvl.id.trim() || !lvl.label.trim()) {
          issues.push({
            code: "EMPTY_LEVEL_ID",
            path: `levels[${idx}]`,
            message: "Energy level id and label must be non-empty",
          });
        }
        if (levelMap.has(lvl.id)) {
          issues.push({
            code: "DUPLICATE_LEVEL_ID",
            path: `levels[${idx}].id`,
            message: `Duplicate energy level id: ${lvl.id}`,
          });
        }
        if (!Number.isFinite(lvl.energyValue)) {
          issues.push({
            code: "NON_FINITE_ENERGY",
            path: `levels[${idx}].energyValue`,
            message: "Energy level value must be finite",
          });
          return;
        }
        const ev =
          lvl.energyUnit === "J"
            ? lvl.energyValue / constants.elementaryChargeC
            : lvl.energyValue;
        if (seenEnergies.some((existing) => Math.abs(existing - ev) < 1e-9)) {
          issues.push({
            code: "DEGENERATE_ENERGY_LEVEL",
            path: `levels[${idx}].energyValue`,
            message: "Distinct energy levels must have distinct energies",
          });
        }
        seenEnergies.push(ev);
        levelMap.set(lvl.id, ev);
      });
    }
  }

  if (spec.continuumEnergyEv !== undefined && !Number.isFinite(spec.continuumEnergyEv)) {
    issues.push({
      code: "INVALID_CONTINUUM_ENERGY",
      path: "continuumEnergyEv",
      message: "continuumEnergyEv must be finite",
    });
  }

  if (levelMap.size >= 2) {
    const continuumEv = spec.continuumEnergyEv ?? 0;
    const minEv = Math.min(...levelMap.values());
    const refId = spec.initialBoundLevelId;
    if (refId !== undefined && !levelMap.has(refId)) {
      issues.push({
        code: "UNKNOWN_REFERENCE_LEVEL",
        path: "initialBoundLevelId",
        message: `initialBoundLevelId '${refId}' does not match any level`,
      });
    } else {
      const refEv = refId !== undefined ? levelMap.get(refId)! : minEv;
      if (continuumEv <= refEv) {
        issues.push({
          code: "NON_POSITIVE_IONIZATION_ENERGY",
          path: "continuumEnergyEv",
          message:
            "Continuum energy must exceed the reference bound state energy",
        });
      }
    }
  }

  if (!spec.transitions || spec.transitions.length === 0) {
    issues.push({
      code: "NO_TRANSITIONS",
      path: "transitions",
      message: "At least one transition is required",
    });
  } else if (spec.transitions.length > 16) {
    issues.push({
      code: "TOO_MANY_TRANSITIONS",
      path: "transitions",
      message: "At most 16 transitions are supported in a single diagram",
    });
  } else {
    const seenTransitionIds = new Set<string>();
    spec.transitions.forEach((tr, idx) => {
      if (!tr.id.trim()) {
        issues.push({
          code: "EMPTY_TRANSITION_ID",
          path: `transitions[${idx}].id`,
          message: "Transition id must be non-empty",
        });
      }
      if (seenTransitionIds.has(tr.id)) {
        issues.push({
          code: "DUPLICATE_TRANSITION_ID",
          path: `transitions[${idx}].id`,
          message: `Duplicate transition id: ${tr.id}`,
        });
      }
      seenTransitionIds.add(tr.id);

      if (!levelMap.has(tr.fromLevelId)) {
        issues.push({
          code: "UNKNOWN_FROM_LEVEL",
          path: `transitions[${idx}].fromLevelId`,
          message: `Unknown fromLevelId: ${tr.fromLevelId}`,
        });
      }
      if (!levelMap.has(tr.toLevelId)) {
        issues.push({
          code: "UNKNOWN_TO_LEVEL",
          path: `transitions[${idx}].toLevelId`,
          message: `Unknown toLevelId: ${tr.toLevelId}`,
        });
      }
      if (tr.fromLevelId === tr.toLevelId) {
        issues.push({
          code: "ZERO_ENERGY_TRANSITION",
          path: `transitions[${idx}]`,
          message: "Transition fromLevelId and toLevelId must differ",
        });
      }
    });
  }
}

function validatePhotoelectric(
  spec: PhotoelectricScenarioSpec,
  issues: QuantumNuclearValidationIssue[],
): void {
  const wfDrivers = [spec.workFunctionEv, spec.workFunctionJ].filter(
    (v) => v !== undefined,
  );
  if (wfDrivers.length !== 1) {
    issues.push({
      code: "AMBIGUOUS_WORK_FUNCTION",
      path: "workFunctionEv",
      message: "Provide exactly one of workFunctionEv or workFunctionJ",
    });
  } else if (!isPositiveFinite(wfDrivers[0])) {
    issues.push({
      code: "INVALID_WORK_FUNCTION",
      path: "workFunctionEv",
      message: "Work function must be positive and finite",
    });
  }

  const radDrivers = [
    spec.incidentFrequencyHz,
    spec.incidentWavelengthNm,
    spec.incidentPhotonEnergyEv,
  ].filter((v) => v !== undefined);
  if (radDrivers.length !== 1) {
    issues.push({
      code: "AMBIGUOUS_INCIDENT_RADIATION",
      path: "incidentFrequencyHz",
      message:
        "Provide exactly one of incidentFrequencyHz, incidentWavelengthNm, or incidentPhotonEnergyEv",
    });
  } else if (!isPositiveFinite(radDrivers[0])) {
    issues.push({
      code: "INVALID_INCIDENT_RADIATION",
      path: "incidentFrequencyHz",
      message: "Incident frequency, wavelength, or photon energy must be positive and finite",
    });
  }

  if (
    spec.comparisonWorkFunctionEv !== undefined &&
    !isPositiveFinite(spec.comparisonWorkFunctionEv)
  ) {
    issues.push({
      code: "INVALID_COMPARISON_WORK_FUNCTION",
      path: "comparisonWorkFunctionEv",
      message: "comparisonWorkFunctionEv must be positive and finite",
    });
  }
}

export function resolveMatterWaveParticle(
  spec: MatterWavesScenarioSpec,
  constants: QuantumNuclearConstants,
): { massKg: number; chargeMagnitudeC: number; label: string } {
  switch (spec.particle) {
    case "electron":
      return {
        massKg: spec.massKg ?? constants.electronMassKg,
        chargeMagnitudeC: spec.chargeMagnitudeC ?? constants.elementaryChargeC,
        label: spec.particleLabel ?? "electron",
      };
    case "proton":
      return {
        massKg: spec.massKg ?? constants.protonMassKg,
        chargeMagnitudeC: spec.chargeMagnitudeC ?? constants.elementaryChargeC,
        label: spec.particleLabel ?? "proton",
      };
    case "neutron":
      return {
        massKg: spec.massKg ?? constants.neutronMassKg,
        chargeMagnitudeC: spec.chargeMagnitudeC ?? 0,
        label: spec.particleLabel ?? "neutron",
      };
    case "alpha":
      return {
        massKg: spec.massKg ?? constants.alphaParticleMassKg,
        chargeMagnitudeC:
          spec.chargeMagnitudeC ?? 2 * constants.elementaryChargeC,
        label: spec.particleLabel ?? "alpha particle",
      };
    case "custom":
      return {
        massKg: spec.massKg ?? NaN,
        chargeMagnitudeC: spec.chargeMagnitudeC ?? 0,
        label: spec.particleLabel ?? "particle",
      };
  }
}

function validateMatterWaves(
  spec: MatterWavesScenarioSpec,
  constants: QuantumNuclearConstants,
  issues: QuantumNuclearValidationIssue[],
): void {
  const resolved = resolveMatterWaveParticle(spec, constants);
  if (!isPositiveFinite(resolved.massKg)) {
    issues.push({
      code: "INVALID_PARTICLE_MASS",
      path: "massKg",
      message: "Particle massKg must be positive and finite",
    });
  }
  if (!isNonNegativeFinite(resolved.chargeMagnitudeC)) {
    issues.push({
      code: "INVALID_PARTICLE_CHARGE",
      path: "chargeMagnitudeC",
      message: "Particle chargeMagnitudeC must be non-negative and finite",
    });
  }

  const drivers = [
    spec.acceleratingVoltageV,
    spec.kineticEnergyEv,
    spec.kineticEnergyJ,
    spec.speedMs,
    spec.momentumNs,
  ].filter((v) => v !== undefined);

  if (drivers.length !== 1) {
    issues.push({
      code: "AMBIGUOUS_KINEMATIC_INPUT",
      path: "acceleratingVoltageV",
      message:
        "Provide exactly one of acceleratingVoltageV, kineticEnergyEv, kineticEnergyJ, speedMs, or momentumNs",
    });
    return;
  }

  if (!isPositiveFinite(drivers[0])) {
    issues.push({
      code: "NON_POSITIVE_KINEMATIC_INPUT",
      path: "acceleratingVoltageV",
      message: "Kinematic input must be strictly positive and finite",
    });
    return;
  }

  if (spec.acceleratingVoltageV !== undefined && resolved.chargeMagnitudeC === 0) {
    issues.push({
      code: "NEUTRAL_PARTICLE_VOLTAGE",
      path: "acceleratingVoltageV",
      message:
        "A neutral particle cannot be accelerated through an electrostatic potential difference",
    });
    return;
  }

  if (!isPositiveFinite(resolved.massKg)) return;

  let momentumNs: number;
  if (spec.acceleratingVoltageV !== undefined) {
    const ekJ = resolved.chargeMagnitudeC * spec.acceleratingVoltageV;
    momentumNs = Math.sqrt(2 * resolved.massKg * ekJ);
  } else if (spec.kineticEnergyEv !== undefined) {
    const ekJ = evToJoules(spec.kineticEnergyEv, constants.elementaryChargeC);
    momentumNs = Math.sqrt(2 * resolved.massKg * ekJ);
  } else if (spec.kineticEnergyJ !== undefined) {
    momentumNs = Math.sqrt(2 * resolved.massKg * spec.kineticEnergyJ);
  } else if (spec.speedMs !== undefined) {
    momentumNs = resolved.massKg * spec.speedMs;
  } else {
    momentumNs = spec.momentumNs!;
  }

  const speedMs = momentumNs / resolved.massKg;
  if (speedMs >= constants.speedOfLightMs) {
    issues.push({
      code: "SUPERLUMINAL_SPEED",
      path: "speedMs",
      message:
        "Classical particle speed reaches or exceeds the speed of light",
    });
  }

  const wavelengthM = constants.planckConstantJs / momentumNs;
  if (spec.latticeSpacingM !== undefined) {
    if (!isPositiveFinite(spec.latticeSpacingM)) {
      issues.push({
        code: "INVALID_LATTICE_SPACING",
        path: "latticeSpacingM",
        message: "latticeSpacingM must be positive and finite",
      });
    } else if (wavelengthM >= spec.latticeSpacingM) {
      issues.push({
        code: "DIFFRACTION_CUTOFF",
        path: "latticeSpacingM",
        message:
          "de Broglie wavelength must be smaller than latticeSpacingM for first-order diffraction",
      });
    }
  }
  if (
    spec.screenDistanceM !== undefined &&
    !isPositiveFinite(spec.screenDistanceM)
  ) {
    issues.push({
      code: "INVALID_SCREEN_DISTANCE",
      path: "screenDistanceM",
      message: "screenDistanceM must be positive and finite",
    });
  }
}

function validateRadioactiveDecay(
  spec: RadioactiveDecayScenarioSpec,
  issues: QuantumNuclearValidationIssue[],
): void {
  const unit = spec.timeUnit ?? "s";
  if (!(unit in TIME_UNIT_TO_SECONDS)) {
    issues.push({
      code: "INVALID_TIME_UNIT",
      path: "timeUnit",
      message: `Unsupported timeUnit: ${unit}`,
    });
  }

  const rateDrivers = [spec.halfLife, spec.decayConstant].filter(
    (v) => v !== undefined,
  );
  if (rateDrivers.length !== 1) {
    issues.push({
      code: "AMBIGUOUS_DECAY_RATE",
      path: "halfLife",
      message: "Provide exactly one of halfLife or decayConstant",
    });
  } else if (!isPositiveFinite(rateDrivers[0])) {
    issues.push({
      code: "INVALID_DECAY_RATE",
      path: "halfLife",
      message: "halfLife or decayConstant must be positive and finite",
    });
  }

  if (!isNonNegativeFinite(spec.elapsedTime)) {
    issues.push({
      code: "INVALID_ELAPSED_TIME",
      path: "elapsedTime",
      message: "elapsedTime must be non-negative and finite",
    });
  }

  const bg = spec.backgroundCountRate ?? 0;
  if (!isNonNegativeFinite(bg)) {
    issues.push({
      code: "INVALID_BACKGROUND_RATE",
      path: "backgroundCountRate",
      message: "backgroundCountRate must be non-negative and finite",
    });
  }

  if (
    spec.initialNuclei !== undefined &&
    spec.initialActivityBq !== undefined
  ) {
    issues.push({
      code: "AMBIGUOUS_INITIAL_SAMPLE",
      path: "initialNuclei",
      message:
        "Provide at most one of initialNuclei or initialActivityBq to avoid conflicting sample sizes",
    });
  }

  if (
    spec.initialNetCountRate !== undefined &&
    spec.initialTotalCountRate !== undefined
  ) {
    issues.push({
      code: "AMBIGUOUS_COUNT_RATE",
      path: "initialNetCountRate",
      message:
        "Provide at most one of initialNetCountRate or initialTotalCountRate",
    });
  }

  const hasSampleDriver =
    spec.initialNuclei !== undefined ||
    spec.initialActivityBq !== undefined ||
    spec.initialNetCountRate !== undefined ||
    spec.initialTotalCountRate !== undefined;

  if (!hasSampleDriver) {
    issues.push({
      code: "MISSING_INITIAL_AMOUNT",
      path: "initialNuclei",
      message:
        "Provide at least one initial sample quantity (initialNuclei, initialActivityBq, initialNetCountRate, or initialTotalCountRate)",
    });
  }

  if (spec.initialNuclei !== undefined && !isPositiveFinite(spec.initialNuclei)) {
    issues.push({
      code: "INVALID_INITIAL_NUCLEI",
      path: "initialNuclei",
      message: "initialNuclei must be positive and finite",
    });
  }
  if (
    spec.initialActivityBq !== undefined &&
    !isPositiveFinite(spec.initialActivityBq)
  ) {
    issues.push({
      code: "INVALID_INITIAL_ACTIVITY",
      path: "initialActivityBq",
      message: "initialActivityBq must be positive and finite",
    });
  }
  if (
    spec.initialNetCountRate !== undefined &&
    !isPositiveFinite(spec.initialNetCountRate)
  ) {
    issues.push({
      code: "INVALID_INITIAL_NET_COUNT_RATE",
      path: "initialNetCountRate",
      message: "initialNetCountRate must be positive and finite",
    });
  }
  if (spec.initialTotalCountRate !== undefined) {
    if (!isPositiveFinite(spec.initialTotalCountRate)) {
      issues.push({
        code: "INVALID_INITIAL_TOTAL_COUNT_RATE",
        path: "initialTotalCountRate",
        message: "initialTotalCountRate must be positive and finite",
      });
    } else if (isNonNegativeFinite(bg) && spec.initialTotalCountRate <= bg) {
      issues.push({
        code: "TOTAL_COUNT_RATE_BELOW_BACKGROUND",
        path: "initialTotalCountRate",
        message:
          "initialTotalCountRate must strictly exceed backgroundCountRate",
      });
    }
  }

  if (
    spec.plotSpanHalfLives !== undefined &&
    (!isPositiveFinite(spec.plotSpanHalfLives) || spec.plotSpanHalfLives > 20)
  ) {
    issues.push({
      code: "INVALID_PLOT_SPAN",
      path: "plotSpanHalfLives",
      message: "plotSpanHalfLives must be between 0 (exclusive) and 20",
    });
  }
}

function validateStepPhysics(
  step: DecayStepInput,
  index: number,
  currentA: number,
  currentZ: number,
  issues: QuantumNuclearValidationIssue[],
): { nextA: number; nextZ: number } {
  const currentN = currentA - currentZ;
  const deltas = decayModeDeltas(step.mode);
  const nextA = currentA + deltas.deltaA;
  const nextZ = currentZ + deltas.deltaZ;
  const nextN = currentN + deltas.deltaN;

  if (step.mode === "alpha" && (currentA < 5 || currentZ < 2 || currentN < 2)) {
    issues.push({
      code: "INVALID_ALPHA_PARENT",
      path: `steps[${index}]`,
      message: `Alpha decay at step ${index} requires parent A >= 5, Z >= 2, N >= 2`,
    });
  } else if (step.mode === "beta-minus" && currentN < 1) {
    issues.push({
      code: "INVALID_BETA_MINUS_PARENT",
      path: `steps[${index}]`,
      message: `Beta-minus decay at step ${index} requires at least one neutron`,
    });
  } else if (
    (step.mode === "beta-plus" || step.mode === "electron-capture") &&
    currentZ < 1
  ) {
    issues.push({
      code: "INVALID_BETA_PLUS_PARENT",
      path: `steps[${index}]`,
      message: `${step.mode} at step ${index} requires at least one proton`,
    });
  } else if (nextA < 1 || nextZ < 0 || nextN < 0) {
    issues.push({
      code: "UNPHYSICAL_DAUGHTER_NUCLIDE",
      path: `steps[${index}]`,
      message: `Decay step ${index} produces unphysical daughter (A=${nextA}, Z=${nextZ}, N=${nextN})`,
    });
  }
  return { nextA, nextZ };
}

function validateNuclearDecayChain(
  spec: NuclearDecayChainScenarioSpec,
  issues: QuantumNuclearValidationIssue[],
): void {
  const { massNumberA, atomicNumberZ } = spec.parentNuclide;
  if (!isPositiveInteger(massNumberA)) {
    issues.push({
      code: "INVALID_PARENT_A",
      path: "parentNuclide.massNumberA",
      message: "Parent massNumberA must be a positive integer",
    });
  }
  if (!Number.isInteger(atomicNumberZ) || atomicNumberZ < 0) {
    issues.push({
      code: "INVALID_PARENT_Z",
      path: "parentNuclide.atomicNumberZ",
      message: "Parent atomicNumberZ must be a non-negative integer",
    });
  }
  if (
    isPositiveInteger(massNumberA) &&
    Number.isInteger(atomicNumberZ) &&
    atomicNumberZ > massNumberA
  ) {
    issues.push({
      code: "PARENT_Z_EXCEEDS_A",
      path: "parentNuclide",
      message: "Parent atomicNumberZ cannot exceed massNumberA",
    });
    return;
  }

  if (!spec.steps || spec.steps.length === 0) {
    issues.push({
      code: "EMPTY_DECAY_STEPS",
      path: "steps",
      message: "At least one decay step is required",
    });
    return;
  }
  if (spec.steps.length > 20) {
    issues.push({
      code: "TOO_MANY_DECAY_STEPS",
      path: "steps",
      message: "At most 20 decay steps are supported",
    });
    return;
  }

  const seenIds = new Set<string>();
  let curA = massNumberA;
  let curZ = atomicNumberZ;
  spec.steps.forEach((step, idx) => {
    if (!step.id.trim()) {
      issues.push({
        code: "EMPTY_STEP_ID",
        path: `steps[${idx}].id`,
        message: "Decay step id must be non-empty",
      });
    }
    if (seenIds.has(step.id)) {
      issues.push({
        code: "DUPLICATE_STEP_ID",
        path: `steps[${idx}].id`,
        message: `Duplicate decay step id: ${step.id}`,
      });
    }
    seenIds.add(step.id);

    const next = validateStepPhysics(step, idx, curA, curZ, issues);
    curA = next.nextA;
    curZ = next.nextZ;
  });
}

function validateNuclearBinding(
  spec: NuclearBindingScenarioSpec,
  constants: QuantumNuclearConstants,
  issues: QuantumNuclearValidationIssue[],
): void {
  if (spec.calculationMode === "single-nuclide") {
    if (!isPositiveInteger(spec.massNumberA) || spec.massNumberA < 2) {
      issues.push({
        code: "INVALID_NUCLIDE_A",
        path: "massNumberA",
        message:
          "Bound single-nuclide mass defect requires integer massNumberA >= 2",
      });
    }
    if (
      !isPositiveInteger(spec.atomicNumberZ) ||
      spec.atomicNumberZ >= spec.massNumberA
    ) {
      issues.push({
        code: "INVALID_NUCLIDE_Z",
        path: "atomicNumberZ",
        message:
          "Bound single-nuclide requires integer 1 <= atomicNumberZ < massNumberA",
      });
    }
    const massDrivers = [spec.nuclearMassU, spec.atomicMassU].filter(
      (v) => v !== undefined,
    );
    if (massDrivers.length !== 1) {
      issues.push({
        code: "AMBIGUOUS_NUCLEAR_MASS",
        path: "nuclearMassU",
        message: "Provide exactly one of nuclearMassU or atomicMassU",
      });
      return;
    }
    if (!isPositiveFinite(massDrivers[0])) {
      issues.push({
        code: "INVALID_NUCLEAR_MASS",
        path: "nuclearMassU",
        message: "Nuclide mass in u must be positive and finite",
      });
      return;
    }
    if (
      isPositiveInteger(spec.massNumberA) &&
      spec.massNumberA >= 2 &&
      isPositiveInteger(spec.atomicNumberZ) &&
      spec.atomicNumberZ < spec.massNumberA
    ) {
      const nuclearMassU =
        spec.nuclearMassU ??
        spec.atomicMassU! - spec.atomicNumberZ * constants.electronMassU;
      const neutronN = spec.massNumberA - spec.atomicNumberZ;
      const constituentU =
        spec.atomicNumberZ * constants.protonMassU +
        neutronN * constants.neutronMassU;
      if (nuclearMassU <= 0 || constituentU <= nuclearMassU) {
        issues.push({
          code: "NON_POSITIVE_MASS_DEFECT",
          path: "nuclearMassU",
          message:
            "Bound nucleus must have constituent nucleon mass strictly greater than nuclear mass",
        });
      }
    }
    return;
  }

  if (!spec.reactants.length || !spec.products.length) {
    issues.push({
      code: "EMPTY_REACTION_SPECIES",
      path: "reactants",
      message: "Nuclear reaction requires non-empty reactants and products",
    });
    return;
  }

  const seenIds = new Set<string>();
  const checkSpecies = (
    list: typeof spec.reactants,
    side: "reactants" | "products",
  ) => {
    let totalA = 0;
    let totalZ = 0;
    list.forEach((sp, idx) => {
      const count = sp.count ?? 1;
      if (!sp.id.trim() || !sp.symbol.trim()) {
        issues.push({
          code: "EMPTY_SPECIES_ID",
          path: `${side}[${idx}]`,
          message: "Species id and symbol must be non-empty",
        });
      }
      if (seenIds.has(sp.id)) {
        issues.push({
          code: "DUPLICATE_SPECIES_ID",
          path: `${side}[${idx}].id`,
          message: `Duplicate species id: ${sp.id}`,
        });
      }
      seenIds.add(sp.id);

      if (!isPositiveInteger(count)) {
        issues.push({
          code: "INVALID_SPECIES_COUNT",
          path: `${side}[${idx}].count`,
          message: "Species count must be a positive integer",
        });
      }
      if (!Number.isInteger(sp.massNumberA) || sp.massNumberA < 0) {
        issues.push({
          code: "INVALID_SPECIES_A",
          path: `${side}[${idx}].massNumberA`,
          message: "Species massNumberA must be a non-negative integer",
        });
      }
      if (!Number.isInteger(sp.atomicNumberZ) || sp.atomicNumberZ < -1) {
        issues.push({
          code: "INVALID_SPECIES_Z",
          path: `${side}[${idx}].atomicNumberZ`,
          message: "Species atomicNumberZ must be an integer >= -1",
        });
      }
      if (sp.massNumberA > 0 && sp.atomicNumberZ > sp.massNumberA) {
        issues.push({
          code: "SPECIES_Z_EXCEEDS_A",
          path: `${side}[${idx}]`,
          message: "Nuclear species cannot have Z > A",
        });
      }
      if (sp.massU !== undefined && !isNonNegativeFinite(sp.massU)) {
        issues.push({
          code: "INVALID_SPECIES_MASS",
          path: `${side}[${idx}].massU`,
          message: "Species massU must be non-negative and finite",
        });
      }
      if (
        sp.bindingEnergyPerNucleonMeV !== undefined &&
        !isNonNegativeFinite(sp.bindingEnergyPerNucleonMeV)
      ) {
        issues.push({
          code: "INVALID_SPECIES_BINDING",
          path: `${side}[${idx}].bindingEnergyPerNucleonMeV`,
          message:
            "Species bindingEnergyPerNucleonMeV must be non-negative and finite",
        });
      }
      totalA += count * sp.massNumberA;
      totalZ += count * sp.atomicNumberZ;
    });
    return { totalA, totalZ };
  };

  const rTotals = checkSpecies(spec.reactants, "reactants");
  const pTotals = checkSpecies(spec.products, "products");

  if (rTotals.totalA !== pTotals.totalA) {
    issues.push({
      code: "NUCLEON_NUMBER_NOT_CONSERVED",
      path: "products",
      message: `Nucleon number A is not conserved (${rTotals.totalA} != ${pTotals.totalA})`,
    });
  }
  if (rTotals.totalZ !== pTotals.totalZ) {
    issues.push({
      code: "CHARGE_NOT_CONSERVED",
      path: "products",
      message: `Atomic/charge number Z is not conserved (${rTotals.totalZ} != ${pTotals.totalZ})`,
    });
  }

  const allSpecies = [...spec.reactants, ...spec.products];
  const allHaveMass = allSpecies.every((sp) => sp.massU !== undefined);
  const allBoundHaveBE = allSpecies.every(
    (sp) => sp.massNumberA <= 1 || sp.bindingEnergyPerNucleonMeV !== undefined,
  );
  if (!allHaveMass && !allBoundHaveBE) {
    issues.push({
      code: "INCOMPLETE_REACTION_ENERGETICS",
      path: "reactants",
      message:
        "Provide either massU on all species or bindingEnergyPerNucleonMeV on all composite nuclei (A >= 2)",
    });
  }
}

function validateRutherfordScattering(
  spec: RutherfordScatteringScenarioSpec,
  constants: QuantumNuclearConstants,
  issues: QuantumNuclearValidationIssue[],
): void {
  if (!isPositiveInteger(spec.projectileChargeZ)) {
    issues.push({
      code: "INVALID_PROJECTILE_Z",
      path: "projectileChargeZ",
      message: "projectileChargeZ must be a positive integer",
    });
  }
  if (!isPositiveInteger(spec.targetChargeZ)) {
    issues.push({
      code: "INVALID_TARGET_Z",
      path: "targetChargeZ",
      message: "targetChargeZ must be a positive integer",
    });
  }
  if (
    !isPositiveInteger(spec.targetMassNumberA) ||
    spec.targetMassNumberA < spec.targetChargeZ
  ) {
    issues.push({
      code: "INVALID_TARGET_A",
      path: "targetMassNumberA",
      message: "targetMassNumberA must be an integer >= targetChargeZ",
    });
  }
  const ekDrivers = [spec.kineticEnergyMeV, spec.kineticEnergyJ].filter(
    (v) => v !== undefined,
  );
  if (ekDrivers.length !== 1) {
    issues.push({
      code: "AMBIGUOUS_PROJECTILE_ENERGY",
      path: "kineticEnergyMeV",
      message: "Provide exactly one of kineticEnergyMeV or kineticEnergyJ",
    });
  } else if (!isPositiveFinite(ekDrivers[0])) {
    issues.push({
      code: "INVALID_PROJECTILE_ENERGY",
      path: "kineticEnergyMeV",
      message: "Projectile kinetic energy must be positive and finite",
    });
  } else {
    const ekJ =
      spec.kineticEnergyJ ??
      mevToJoules(spec.kineticEnergyMeV!, constants.elementaryChargeC);
    if (ekJ <= 0) {
      issues.push({
        code: "INVALID_PROJECTILE_ENERGY",
        path: "kineticEnergyJ",
        message: "Projectile kinetic energy in Joules must be positive",
      });
    }
  }
}

function validateSpecialRelativity(
  spec: SpecialRelativityScenarioSpec,
  constants: QuantumNuclearConstants,
  issues: QuantumNuclearValidationIssue[],
): void {
  const speedDrivers = [spec.beta, spec.frameSpeedMs].filter(
    (v) => v !== undefined,
  );
  if (speedDrivers.length !== 1) {
    issues.push({
      code: "AMBIGUOUS_FRAME_SPEED",
      path: "beta",
      message: "Provide exactly one of beta or frameSpeedMs",
    });
  } else if (typeof speedDrivers[0] !== "number" || !Number.isFinite(speedDrivers[0])) {
    issues.push({
      code: "NON_FINITE_FRAME_SPEED",
      path: "beta",
      message: "Frame speed must be finite",
    });
  } else {
    const beta =
      spec.beta ?? spec.frameSpeedMs! / constants.speedOfLightMs;
    if (Math.abs(beta) >= 1) {
      issues.push({
        code: "SUPERLUMINAL_OR_LUMINAL_FRAME",
        path: "beta",
        message:
          "Inertial frame speed must satisfy |v| < c (|beta| < 1) so gamma is finite",
      });
    }
  }

  if (spec.properTimeS !== undefined && !isPositiveFinite(spec.properTimeS)) {
    issues.push({
      code: "INVALID_PROPER_TIME",
      path: "properTimeS",
      message: "properTimeS must be positive and finite",
    });
  }
  if (
    spec.properLengthM !== undefined &&
    !isPositiveFinite(spec.properLengthM)
  ) {
    issues.push({
      code: "INVALID_PROPER_LENGTH",
      path: "properLengthM",
      message: "properLengthM must be positive and finite",
    });
  }

  if (
    spec.objectVelocityFractionC !== undefined &&
    spec.objectVelocityPrimeFractionC !== undefined
  ) {
    issues.push({
      code: "AMBIGUOUS_OBJECT_VELOCITY",
      path: "objectVelocityFractionC",
      message:
        "Provide at most one of objectVelocityFractionC or objectVelocityPrimeFractionC",
    });
  }
  if (
    spec.objectVelocityFractionC !== undefined &&
    (!Number.isFinite(spec.objectVelocityFractionC) ||
      Math.abs(spec.objectVelocityFractionC) > 1)
  ) {
    issues.push({
      code: "SUPERLUMINAL_OBJECT_VELOCITY",
      path: "objectVelocityFractionC",
      message: "objectVelocityFractionC must lie within [-1, 1]",
    });
  }
  if (
    spec.objectVelocityPrimeFractionC !== undefined &&
    (!Number.isFinite(spec.objectVelocityPrimeFractionC) ||
      Math.abs(spec.objectVelocityPrimeFractionC) > 1)
  ) {
    issues.push({
      code: "SUPERLUMINAL_OBJECT_VELOCITY_PRIME",
      path: "objectVelocityPrimeFractionC",
      message: "objectVelocityPrimeFractionC must lie within [-1, 1]",
    });
  }

  if (
    spec.domainLightSeconds !== undefined &&
    (!isPositiveFinite(spec.domainLightSeconds) ||
      spec.domainLightSeconds > 1e6)
  ) {
    issues.push({
      code: "INVALID_MINKOWSKI_DOMAIN",
      path: "domainLightSeconds",
      message: "domainLightSeconds must be positive and finite",
    });
  }

  if (spec.events) {
    const seenEventIds = new Set<string>();
    spec.events.forEach((ev, idx) => {
      if (!ev.id.trim() || !ev.label.trim()) {
        issues.push({
          code: "EMPTY_EVENT_ID",
          path: `events[${idx}]`,
          message: "Spacetime event id and label must be non-empty",
        });
      }
      if (seenEventIds.has(ev.id)) {
        issues.push({
          code: "DUPLICATE_EVENT_ID",
          path: `events[${idx}].id`,
          message: `Duplicate spacetime event id: ${ev.id}`,
        });
      }
      seenEventIds.add(ev.id);
      if (
        !Number.isFinite(ev.xLightSeconds) ||
        !Number.isFinite(ev.ctLightSeconds)
      ) {
        issues.push({
          code: "NON_FINITE_EVENT_COORDS",
          path: `events[${idx}]`,
          message: "Spacetime event coordinates must be finite",
        });
      }
    });
  }

  if (spec.worldlines) {
    const seenWlIds = new Set<string>();
    spec.worldlines.forEach((wl, idx) => {
      if (!wl.id.trim() || !wl.label.trim()) {
        issues.push({
          code: "EMPTY_WORLDLINE_ID",
          path: `worldlines[${idx}]`,
          message: "Worldline id and label must be non-empty",
        });
      }
      if (seenWlIds.has(wl.id)) {
        issues.push({
          code: "DUPLICATE_WORLDLINE_ID",
          path: `worldlines[${idx}].id`,
          message: `Duplicate worldline id: ${wl.id}`,
        });
      }
      seenWlIds.add(wl.id);
      if (!Number.isFinite(wl.beta)) {
        issues.push({
          code: "NON_FINITE_WORLDLINE_BETA",
          path: `worldlines[${idx}].beta`,
          message: "Worldline beta must be finite",
        });
      } else if (wl.isPhoton) {
        if (Math.abs(Math.abs(wl.beta) - 1) > 1e-9) {
          issues.push({
            code: "INVALID_PHOTON_WORLDLINE",
            path: `worldlines[${idx}].beta`,
            message: "Photon worldline must have |beta| = 1",
          });
        }
      } else if (Math.abs(wl.beta) >= 1) {
        issues.push({
          code: "SUPERLUMINAL_WORLDLINE",
          path: `worldlines[${idx}].beta`,
          message: "Massive particle worldline must satisfy |beta| < 1",
        });
      }
      if (
        wl.x0LightSeconds !== undefined &&
        !Number.isFinite(wl.x0LightSeconds)
      ) {
        issues.push({
          code: "NON_FINITE_WORLDLINE_ORIGIN",
          path: `worldlines[${idx}].x0LightSeconds`,
          message: "Worldline x0LightSeconds must be finite",
        });
      }
    });
  }
}

export function validateQuantumNuclearScenario(
  spec: QuantumNuclearScenarioSpec,
): QuantumNuclearValidationResult {
  const issues: QuantumNuclearValidationIssue[] = [];

  if (!spec || typeof spec !== "object" || !("kind" in spec)) {
    return {
      valid: false,
      issues: [
        {
          code: "INVALID_SPEC",
          path: "",
          message: "Scenario specification must be an object with a valid kind",
        },
      ],
    };
  }

  const constants = validateConstantsOverrides(spec.constants, issues);

  switch (spec.kind) {
    case "energy-levels":
      validateEnergyLevels(spec, constants, issues);
      break;
    case "photoelectric-effect":
      validatePhotoelectric(spec, issues);
      break;
    case "matter-waves":
      validateMatterWaves(spec, constants, issues);
      break;
    case "radioactive-decay":
      validateRadioactiveDecay(spec, issues);
      break;
    case "nuclear-decay-chain":
      validateNuclearDecayChain(spec, issues);
      break;
    case "nuclear-binding":
      validateNuclearBinding(spec, constants, issues);
      break;
    case "rutherford-scattering":
      validateRutherfordScattering(spec, constants, issues);
      break;
    case "special-relativity":
      validateSpecialRelativity(spec, constants, issues);
      break;
    default: {
      const exhaustive: never = spec;
      issues.push({
        code: "UNSUPPORTED_SCENARIO_KIND",
        path: "kind",
        message: `Unsupported quantum-nuclear scenario kind: ${String(
          (exhaustive as { kind?: unknown }).kind,
        )}`,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
