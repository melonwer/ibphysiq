import {
  classifyHydrogenSeries,
  classifySpectralRegion,
  DATA_BOOKLET_CONSTANTS,
  evToJoules,
  joulesToEv,
  joulesToMev,
  lookupElementSymbol,
  mevToJoules,
  QuantumNuclearConstants,
  resolveConstants,
  TIME_UNIT_TO_SECONDS,
} from "./constants";
import {
  EnergyLevelsScenarioSpec,
  EnergyLevelsSolution,
  MatterWavesScenarioSpec,
  MatterWavesSolution,
  NuclearBindingScenarioSpec,
  NuclearBindingSolution,
  NuclearDecayChainScenarioSpec,
  NuclearDecayChainSolution,
  PhotoelectricScenarioSpec,
  PhotoelectricSolution,
  QuantumNuclearScenarioSpec,
  QuantumNuclearSolution,
  RadioactiveDecayScenarioSpec,
  RadioactiveDecaySolution,
  ReactionSpeciesInput,
  RutherfordScatteringScenarioSpec,
  RutherfordScatteringSolution,
  SolvedChainNuclide,
  SolvedDecayStep,
  SolvedEnergyLevel,
  SolvedEnergyTransition,
  SpecialRelativityScenarioSpec,
  SpecialRelativitySolution,
  TransformedSpacetimeEvent,
} from "./types";
import {
  decayModeDeltas,
  resolveMatterWaveParticle,
  validateQuantumNuclearScenario,
} from "./validate";
import { formatNuclidePlain } from "./visibility";

// ---------------------------------------------------------------------------
// Pure Physics Formula Helpers
// ---------------------------------------------------------------------------

export function bohrEnergyEv(
  principalN: number,
  atomicNumberZ = 1,
  groundStateEv = DATA_BOOKLET_CONSTANTS.bohrGroundStateEv,
): number {
  if (!Number.isInteger(principalN) || principalN < 1) {
    throw new Error("principalN must be a positive integer");
  }
  if (!Number.isInteger(atomicNumberZ) || atomicNumberZ < 1) {
    throw new Error("atomicNumberZ must be a positive integer");
  }
  return (groundStateEv * atomicNumberZ * atomicNumberZ) / (principalN * principalN);
}

export function lorentzFactorFromBeta(beta: number): number {
  if (!Number.isFinite(beta) || Math.abs(beta) >= 1) {
    throw new Error("beta must be finite and satisfy |beta| < 1");
  }
  return 1 / Math.sqrt(1 - beta * beta);
}

export function relativisticVelocityAdditionFractionC(
  objectVelocityFractionC: number,
  frameBeta: number,
): number {
  if (
    !Number.isFinite(objectVelocityFractionC) ||
    Math.abs(objectVelocityFractionC) > 1
  ) {
    throw new Error("objectVelocityFractionC must lie in [-1, 1]");
  }
  if (!Number.isFinite(frameBeta) || Math.abs(frameBeta) >= 1) {
    throw new Error("frameBeta must satisfy |frameBeta| < 1");
  }
  return (
    (objectVelocityFractionC - frameBeta) /
    (1 - objectVelocityFractionC * frameBeta)
  );
}

export function rutherfordClosestApproachM(
  projectileChargeZ: number,
  targetChargeZ: number,
  kineticEnergyJ: number,
  constants: QuantumNuclearConstants = DATA_BOOKLET_CONSTANTS,
): number {
  if (projectileChargeZ <= 0 || targetChargeZ <= 0 || kineticEnergyJ <= 0) {
    throw new Error("Charges and kinetic energy must be strictly positive");
  }
  const q1 = projectileChargeZ * constants.elementaryChargeC;
  const q2 = targetChargeZ * constants.elementaryChargeC;
  return (constants.coulombConstantNm2C2 * q1 * q2) / kineticEnergyJ;
}

export function nuclearRadiusM(
  massNumberA: number,
  constants: QuantumNuclearConstants = DATA_BOOKLET_CONSTANTS,
): number {
  if (!Number.isInteger(massNumberA) || massNumberA < 1) {
    throw new Error("massNumberA must be a positive integer");
  }
  return constants.fermiRadiusM * Math.cbrt(massNumberA);
}

// ---------------------------------------------------------------------------
// Domain Solvers
// ---------------------------------------------------------------------------

function assertValid(spec: QuantumNuclearScenarioSpec): QuantumNuclearConstants {
  const validation = validateQuantumNuclearScenario(spec);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join("; "));
  }
  return resolveConstants(spec.constants);
}

export function solveEnergyLevels(
  spec: EnergyLevelsScenarioSpec,
): EnergyLevelsSolution {
  const constants = assertValid(spec);
  const { planckConstantJs: h, speedOfLightMs: c, elementaryChargeC: e } = constants;
  const model = spec.atomModel ?? (spec.levels ? "custom" : "bohr-hydrogen");
  const rawLevels: SolvedEnergyLevel[] = [];

  if (model === "bohr-hydrogen") {
    const z = spec.atomicNumberZ ?? 1;
    const maxN = spec.maxPrincipalN ?? 4;
    for (let n = 1; n <= maxN; n += 1) {
      const energyEv = bohrEnergyEv(n, z, constants.bohrGroundStateEv);
      rawLevels.push({
        id: `n=${n}`,
        label: n === 1 ? "n = 1 (ground)" : `n = ${n}`,
        energyEv,
        energyJ: evToJoules(energyEv, e),
        principalQuantumNumber: n,
        isContinuum: false,
      });
    }
    if (spec.includeContinuumZero ?? true) {
      rawLevels.push({
        id: "n=inf",
        label: "n = ∞ (continuum)",
        energyEv: 0,
        energyJ: 0,
        isContinuum: true,
      });
    }
  } else {
    const continuumEv = spec.continuumEnergyEv ?? 0;
    for (const lvl of spec.levels!) {
      const energyEv =
        lvl.energyUnit === "J" ? joulesToEv(lvl.energyValue, e) : lvl.energyValue;
      const energyJ =
        lvl.energyUnit === "J" ? lvl.energyValue : evToJoules(lvl.energyValue, e);
      rawLevels.push({
        id: lvl.id,
        label: lvl.label,
        energyEv,
        energyJ,
        principalQuantumNumber: lvl.principalQuantumNumber,
        isContinuum: Math.abs(energyEv - continuumEv) < 1e-12,
      });
    }
  }

  const levels = [...rawLevels].sort((a, b) => a.energyEv - b.energyEv);
  const byId = new Map(levels.map((lvl) => [lvl.id, lvl]));
  const groundState = levels[0];
  const continuumEnergyEv = spec.continuumEnergyEv ?? 0;
  const refBoundLevel =
    spec.initialBoundLevelId !== undefined
      ? byId.get(spec.initialBoundLevelId)!
      : groundState;

  const ionizationEnergyEv = continuumEnergyEv - refBoundLevel.energyEv;
  const ionizationEnergyJ = evToJoules(ionizationEnergyEv, e);
  const ionizationFrequencyHz = ionizationEnergyJ / h;
  const ionizationWavelengthM = (h * c) / ionizationEnergyJ;
  const ionizationWavelengthNm = ionizationWavelengthM * 1e9;

  const isNeutralBohrHydrogen =
    model === "bohr-hydrogen" && (spec.atomicNumberZ ?? 1) === 1;

  const transitions: SolvedEnergyTransition[] = spec.transitions.map(
    (tr, index) => {
      const fromLvl = byId.get(tr.fromLevelId)!;
      const toLvl = byId.get(tr.toLevelId)!;
      const signedDeltaEnergyEv = toLvl.energyEv - fromLvl.energyEv;
      const process = signedDeltaEnergyEv < 0 ? "emission" : "absorption";
      const deltaEnergyEv = Math.abs(signedDeltaEnergyEv);
      const photonEnergyJ = Math.abs(toLvl.energyJ - fromLvl.energyJ);
      const frequencyHz = photonEnergyJ / h;
      const wavelengthM = (h * c) / photonEnergyJ;
      const wavelengthNm = wavelengthM * 1e9;
      const photonMomentumNs = photonEnergyJ / c;
      const lowerN =
        fromLvl.principalQuantumNumber !== undefined &&
        toLvl.principalQuantumNumber !== undefined
          ? Math.min(
              fromLvl.principalQuantumNumber,
              toLvl.principalQuantumNumber,
            )
          : undefined;

      return {
        id: tr.id,
        label: tr.label ?? `T${index + 1}`,
        fromLevelId: tr.fromLevelId,
        toLevelId: tr.toLevelId,
        process,
        initialEnergyEv: fromLvl.energyEv,
        finalEnergyEv: toLvl.energyEv,
        signedDeltaEnergyEv,
        deltaEnergyEv,
        photonEnergyJ,
        frequencyHz,
        wavelengthM,
        wavelengthNm,
        photonMomentumNs,
        spectralRegion: classifySpectralRegion(wavelengthNm),
        hydrogenSeries:
          isNeutralBohrHydrogen && lowerN !== undefined
            ? classifyHydrogenSeries(lowerN)
            : null,
      };
    },
  );

  const defaultAtomName =
    model === "bohr-hydrogen"
      ? (spec.atomicNumberZ ?? 1) === 1
        ? "Hydrogen"
        : `Hydrogenic Z = ${spec.atomicNumberZ}`
      : "Atom";

  return {
    kind: "energy-levels",
    atomName: spec.atomName ?? defaultAtomName,
    levels,
    groundStateId: groundState.id,
    groundStateEnergyEv: groundState.energyEv,
    groundStateEnergyJ: groundState.energyJ,
    referenceBoundLevelId: refBoundLevel.id,
    continuumEnergyEv,
    ionizationEnergyEv,
    ionizationEnergyJ,
    ionizationFrequencyHz,
    ionizationWavelengthM,
    ionizationWavelengthNm,
    transitions,
  };
}

export function solvePhotoelectricEffect(
  spec: PhotoelectricScenarioSpec,
): PhotoelectricSolution {
  const constants = assertValid(spec);
  const {
    planckConstantJs: h,
    speedOfLightMs: c,
    elementaryChargeC: e,
    electronMassKg: me,
  } = constants;

  const workFunctionEv =
    spec.workFunctionEv ?? joulesToEv(spec.workFunctionJ!, e);
  const workFunctionJ =
    spec.workFunctionJ ?? evToJoules(spec.workFunctionEv!, e);
  const thresholdFrequencyHz = workFunctionJ / h;
  const thresholdWavelengthM = c / thresholdFrequencyHz;
  const thresholdWavelengthNm = thresholdWavelengthM * 1e9;

  let incidentFrequencyHz: number;
  if (spec.incidentFrequencyHz !== undefined) {
    incidentFrequencyHz = spec.incidentFrequencyHz;
  } else if (spec.incidentWavelengthNm !== undefined) {
    incidentFrequencyHz = (c * 1e9) / spec.incidentWavelengthNm;
  } else {
    incidentFrequencyHz = evToJoules(spec.incidentPhotonEnergyEv!, e) / h;
  }

  const incidentWavelengthM = c / incidentFrequencyHz;
  const incidentWavelengthNm = incidentWavelengthM * 1e9;
  const photonEnergyJ = h * incidentFrequencyHz;
  const photonEnergyEv = joulesToEv(photonEnergyJ, e);

  const signedEnergyBalanceJ = photonEnergyJ - workFunctionJ;
  const signedEnergyBalanceEv = photonEnergyEv - workFunctionEv;
  const emitsPhotoelectrons =
    incidentFrequencyHz >= thresholdFrequencyHz * (1 - 1e-12);
  const maxKineticEnergyJ = Math.max(0, signedEnergyBalanceJ);
  const maxKineticEnergyEv = Math.max(0, signedEnergyBalanceEv);
  const stoppingPotentialV = maxKineticEnergyJ / e;
  const maxElectronSpeedMs = Math.sqrt((2 * maxKineticEnergyJ) / me);

  const plotMode = spec.plotMode ?? "ek-ev-vs-f";
  let graphSlope: number;
  let graphSlopeUnit: "eV s" | "J s" | "V s";
  let yIntercept: number;

  switch (plotMode) {
    case "ek-j-vs-f":
      graphSlope = h;
      graphSlopeUnit = "J s";
      yIntercept = -workFunctionJ;
      break;
    case "stopping-potential-vs-f":
      graphSlope = h / e;
      graphSlopeUnit = "V s";
      yIntercept = -workFunctionJ / e;
      break;
    case "ek-ev-vs-f":
      graphSlope = h / e;
      graphSlopeUnit = "eV s";
      yIntercept = -workFunctionEv;
      break;
  }

  const comparison =
    spec.comparisonWorkFunctionEv !== undefined
      ? (() => {
          const compWfEv = spec.comparisonWorkFunctionEv;
          const compWfJ = evToJoules(compWfEv, e);
          return {
            metalName: spec.comparisonMetalName ?? "Metal B",
            workFunctionEv: compWfEv,
            thresholdFrequencyHz: compWfJ / h,
            yIntercept:
              plotMode === "ek-j-vs-f"
                ? -compWfJ
                : plotMode === "stopping-potential-vs-f"
                  ? -compWfJ / e
                  : -compWfEv,
          };
        })()
      : undefined;

  return {
    kind: "photoelectric-effect",
    metalName: spec.metalName ?? "Metal",
    workFunctionEv,
    workFunctionJ,
    thresholdFrequencyHz,
    thresholdWavelengthM,
    thresholdWavelengthNm,
    incidentFrequencyHz,
    incidentWavelengthM,
    incidentWavelengthNm,
    photonEnergyEv,
    photonEnergyJ,
    emitsPhotoelectrons,
    signedEnergyBalanceEv,
    maxKineticEnergyEv,
    maxKineticEnergyJ,
    stoppingPotentialV,
    maxElectronSpeedMs,
    plotMode,
    graphSlope,
    graphSlopeUnit,
    yIntercept,
    ...(comparison ? { comparison } : {}),
  };
}

export function solveMatterWaves(
  spec: MatterWavesScenarioSpec,
): MatterWavesSolution {
  const constants = assertValid(spec);
  const { planckConstantJs: h, elementaryChargeC: e } = constants;
  const resolved = resolveMatterWaveParticle(spec, constants);
  const { massKg, chargeMagnitudeC, label } = resolved;

  let kineticEnergyJ: number;
  let momentumNs: number;
  let speedMs: number;
  let acceleratingVoltageV: number | null;

  if (spec.acceleratingVoltageV !== undefined) {
    acceleratingVoltageV = spec.acceleratingVoltageV;
    kineticEnergyJ = chargeMagnitudeC * acceleratingVoltageV;
    momentumNs = Math.sqrt(2 * massKg * kineticEnergyJ);
    speedMs = momentumNs / massKg;
  } else if (spec.kineticEnergyEv !== undefined) {
    kineticEnergyJ = evToJoules(spec.kineticEnergyEv, e);
    momentumNs = Math.sqrt(2 * massKg * kineticEnergyJ);
    speedMs = momentumNs / massKg;
    acceleratingVoltageV =
      chargeMagnitudeC > 0 ? kineticEnergyJ / chargeMagnitudeC : null;
  } else if (spec.kineticEnergyJ !== undefined) {
    kineticEnergyJ = spec.kineticEnergyJ;
    momentumNs = Math.sqrt(2 * massKg * kineticEnergyJ);
    speedMs = momentumNs / massKg;
    acceleratingVoltageV =
      chargeMagnitudeC > 0 ? kineticEnergyJ / chargeMagnitudeC : null;
  } else if (spec.speedMs !== undefined) {
    speedMs = spec.speedMs;
    momentumNs = massKg * speedMs;
    kineticEnergyJ = 0.5 * massKg * speedMs * speedMs;
    acceleratingVoltageV =
      chargeMagnitudeC > 0 ? kineticEnergyJ / chargeMagnitudeC : null;
  } else {
    momentumNs = spec.momentumNs!;
    speedMs = momentumNs / massKg;
    kineticEnergyJ = (momentumNs * momentumNs) / (2 * massKg);
    acceleratingVoltageV =
      chargeMagnitudeC > 0 ? kineticEnergyJ / chargeMagnitudeC : null;
  }

  const kineticEnergyEv = joulesToEv(kineticEnergyJ, e);
  const deBroglieWavelengthM = h / momentumNs;
  const deBroglieWavelengthNm = deBroglieWavelengthM * 1e9;
  const deBroglieWavelengthPm = deBroglieWavelengthM * 1e12;

  const diffraction =
    spec.latticeSpacingM !== undefined
      ? (() => {
          const sinTheta = deBroglieWavelengthM / spec.latticeSpacingM;
          const firstOrderAngleRad = Math.asin(sinTheta);
          const firstOrderAngleDeg = (firstOrderAngleRad * 180) / Math.PI;
          const screenDistanceM = spec.screenDistanceM ?? null;
          const ringRadiusM =
            screenDistanceM !== null
              ? screenDistanceM * Math.tan(firstOrderAngleRad)
              : null;
          return {
            latticeSpacingM: spec.latticeSpacingM,
            screenDistanceM,
            sinTheta,
            firstOrderAngleRad,
            firstOrderAngleDeg,
            ringRadiusM,
          };
        })()
      : undefined;

  return {
    kind: "matter-waves",
    particle: spec.particle,
    particleLabel: label,
    massKg,
    chargeMagnitudeC,
    acceleratingVoltageV,
    kineticEnergyJ,
    kineticEnergyEv,
    speedMs,
    momentumNs,
    deBroglieWavelengthM,
    deBroglieWavelengthNm,
    deBroglieWavelengthPm,
    ...(diffraction ? { diffraction } : {}),
  };
}

export function solveRadioactiveDecay(
  spec: RadioactiveDecayScenarioSpec,
): RadioactiveDecaySolution {
  assertValid(spec);
  const timeUnit = spec.timeUnit ?? "s";
  const unitSec = TIME_UNIT_TO_SECONDS[timeUnit];

  const halfLife = spec.halfLife ?? Math.LN2 / spec.decayConstant!;
  const decayConstant = spec.decayConstant ?? Math.LN2 / spec.halfLife!;
  const halfLifeS = halfLife * unitSec;
  const decayConstantPerS = Math.LN2 / halfLifeS;

  const elapsedTime = spec.elapsedTime;
  const elapsedTimeS = elapsedTime * unitSec;
  const numberOfHalfLives = elapsedTime / halfLife;
  const remainingFraction = Math.exp(-decayConstant * elapsedTime);
  const decayedFraction = 1 - remainingFraction;

  let initialNuclei: number | null = null;
  let initialActivityBq: number | null = null;
  if (spec.initialNuclei !== undefined) {
    initialNuclei = spec.initialNuclei;
    initialActivityBq = decayConstantPerS * initialNuclei;
  } else if (spec.initialActivityBq !== undefined) {
    initialActivityBq = spec.initialActivityBq;
    initialNuclei = initialActivityBq / decayConstantPerS;
  }

  const remainingNuclei =
    initialNuclei !== null ? initialNuclei * remainingFraction : null;
  const decayedNuclei =
    initialNuclei !== null && remainingNuclei !== null
      ? initialNuclei - remainingNuclei
      : null;
  const remainingActivityBq =
    initialActivityBq !== null ? initialActivityBq * remainingFraction : null;

  const backgroundCountRate = spec.backgroundCountRate ?? 0;
  let initialNetCountRate: number | null = null;
  let initialTotalCountRate: number | null = null;
  let remainingNetCountRate: number | null = null;
  let remainingTotalCountRate: number | null = null;

  if (
    spec.initialNetCountRate !== undefined ||
    spec.initialTotalCountRate !== undefined
  ) {
    initialNetCountRate =
      spec.initialNetCountRate ??
      spec.initialTotalCountRate! - backgroundCountRate;
    initialTotalCountRate = initialNetCountRate + backgroundCountRate;
    remainingNetCountRate = initialNetCountRate * remainingFraction;
    remainingTotalCountRate = backgroundCountRate + remainingNetCountRate;
  }

  return {
    kind: "radioactive-decay",
    nuclideLabel: spec.nuclideLabel ?? "Sample",
    timeUnit,
    halfLife,
    halfLifeS,
    decayConstant,
    decayConstantPerS,
    elapsedTime,
    elapsedTimeS,
    numberOfHalfLives,
    remainingFraction,
    decayedFraction,
    initialNuclei,
    remainingNuclei,
    decayedNuclei,
    initialActivityBq,
    remainingActivityBq,
    backgroundCountRate,
    initialNetCountRate,
    initialTotalCountRate,
    remainingNetCountRate,
    remainingTotalCountRate,
  };
}

export function solveNuclearDecayChain(
  spec: NuclearDecayChainScenarioSpec,
): NuclearDecayChainSolution {
  assertValid(spec);
  const parentSymbol =
    spec.parentNuclide.symbol ??
    lookupElementSymbol(spec.parentNuclide.atomicNumberZ);

  const nuclides: SolvedChainNuclide[] = [
    {
      stepIndex: 0,
      massNumberA: spec.parentNuclide.massNumberA,
      atomicNumberZ: spec.parentNuclide.atomicNumberZ,
      neutronNumberN:
        spec.parentNuclide.massNumberA - spec.parentNuclide.atomicNumberZ,
      symbol: parentSymbol,
      notation: formatNuclidePlain(
        spec.parentNuclide.massNumberA,
        spec.parentNuclide.atomicNumberZ,
        parentSymbol,
      ),
    },
  ];

  const steps: SolvedDecayStep[] = [];
  let totalAlphaCount = 0;
  let totalBetaMinusCount = 0;
  let totalBetaPlusCount = 0;
  let totalGammaCount = 0;

  spec.steps.forEach((step, idx) => {
    const parent = nuclides[idx];
    const deltas = decayModeDeltas(step.mode);
    const daughterA = parent.massNumberA + deltas.deltaA;
    const daughterZ = parent.atomicNumberZ + deltas.deltaZ;
    const daughterN = daughterA - daughterZ;
    const daughterSymbol =
      step.mode === "gamma"
        ? parent.symbol
        : lookupElementSymbol(daughterZ);
    const daughterNotation =
      step.mode === "gamma"
        ? formatNuclidePlain(daughterA, daughterZ, daughterSymbol)
        : formatNuclidePlain(daughterA, daughterZ, daughterSymbol);

    const daughter: SolvedChainNuclide = {
      stepIndex: idx + 1,
      massNumberA: daughterA,
      atomicNumberZ: daughterZ,
      neutronNumberN: daughterN,
      symbol: daughterSymbol,
      notation: daughterNotation,
    };
    nuclides.push(daughter);

    if (step.mode === "alpha") totalAlphaCount += 1;
    if (step.mode === "beta-minus") totalBetaMinusCount += 1;
    if (step.mode === "beta-plus") totalBetaPlusCount += 1;
    if (step.mode === "gamma") totalGammaCount += 1;

    const lhs =
      step.mode === "electron-capture"
        ? `${parent.notation} + ⁰₋₁e⁻`
        : step.mode === "gamma"
          ? `${parent.notation}*`
          : parent.notation;
    const rhs = [daughter.notation, ...deltas.emittedParticles].join(" + ");

    steps.push({
      id: step.id,
      mode: step.mode,
      parent,
      daughter,
      deltaA: deltas.deltaA,
      deltaZ: deltas.deltaZ,
      deltaN: deltas.deltaN,
      emittedParticles: deltas.emittedParticles,
      equationText: `${lhs} → ${rhs}`,
      conservesNucleonNumber: true,
      conservesCharge: true,
    });
  });

  const finalNuclide = nuclides[nuclides.length - 1];
  return {
    kind: "nuclear-decay-chain",
    nuclides,
    steps,
    totalAlphaCount,
    totalBetaMinusCount,
    totalBetaPlusCount,
    totalGammaCount,
    netDeltaA: finalNuclide.massNumberA - nuclides[0].massNumberA,
    netDeltaZ: finalNuclide.atomicNumberZ - nuclides[0].atomicNumberZ,
    netDeltaN: finalNuclide.neutronNumberN - nuclides[0].neutronNumberN,
  };
}

function formatSpeciesSide(list: readonly ReactionSpeciesInput[]): string {
  return list
    .map((sp) => {
      const count = sp.count ?? 1;
      const coeff = count > 1 ? `${count} ` : "";
      return `${coeff}${formatNuclidePlain(sp.massNumberA, sp.atomicNumberZ, sp.symbol)}`;
    })
    .join(" + ");
}

export function solveNuclearBinding(
  spec: NuclearBindingScenarioSpec,
): NuclearBindingSolution {
  const constants = assertValid(spec);
  const {
    protonMassU,
    neutronMassU,
    electronMassU,
    atomicMassUnitKg,
    atomicMassUnitMeV,
    elementaryChargeC: e,
  } = constants;

  if (spec.calculationMode === "single-nuclide") {
    const symbol = spec.symbol ?? lookupElementSymbol(spec.atomicNumberZ);
    const neutronNumberN = spec.massNumberA - spec.atomicNumberZ;
    const nuclearMassU =
      spec.nuclearMassU ??
      spec.atomicMassU! - spec.atomicNumberZ * electronMassU;
    const constituentMassU =
      spec.atomicNumberZ * protonMassU + neutronNumberN * neutronMassU;
    const massDefectU = constituentMassU - nuclearMassU;
    const massDefectKg = massDefectU * atomicMassUnitKg;
    const bindingEnergyMeV = massDefectU * atomicMassUnitMeV;
    const bindingEnergyJ = mevToJoules(bindingEnergyMeV, e);
    const bindingEnergyPerNucleonMeV = bindingEnergyMeV / spec.massNumberA;
    const bindingEnergyPerNucleonJ = bindingEnergyJ / spec.massNumberA;

    return {
      kind: "nuclear-binding",
      calculationMode: "single-nuclide",
      symbol,
      massNumberA: spec.massNumberA,
      atomicNumberZ: spec.atomicNumberZ,
      neutronNumberN,
      nuclearMassU,
      constituentMassU,
      massDefectU,
      massDefectKg,
      bindingEnergyMeV,
      bindingEnergyJ,
      bindingEnergyPerNucleonMeV,
      bindingEnergyPerNucleonJ,
    };
  }

  const totalReactantA = spec.reactants.reduce(
    (sum, sp) => sum + (sp.count ?? 1) * sp.massNumberA,
    0,
  );
  const totalProductA = spec.products.reduce(
    (sum, sp) => sum + (sp.count ?? 1) * sp.massNumberA,
    0,
  );
  const totalReactantZ = spec.reactants.reduce(
    (sum, sp) => sum + (sp.count ?? 1) * sp.atomicNumberZ,
    0,
  );
  const totalProductZ = spec.products.reduce(
    (sum, sp) => sum + (sp.count ?? 1) * sp.atomicNumberZ,
    0,
  );

  const allSpecies = [...spec.reactants, ...spec.products];
  const allHaveMass = allSpecies.every((sp) => sp.massU !== undefined);
  const allBoundHaveBE = allSpecies.every(
    (sp) => sp.massNumberA <= 1 || sp.bindingEnergyPerNucleonMeV !== undefined,
  );

  const reactantTotalBindingMeV = allBoundHaveBE
    ? spec.reactants.reduce(
        (sum, sp) =>
          sum +
          (sp.count ?? 1) *
            sp.massNumberA *
            (sp.bindingEnergyPerNucleonMeV ?? 0),
        0,
      )
    : null;
  const productTotalBindingMeV = allBoundHaveBE
    ? spec.products.reduce(
        (sum, sp) =>
          sum +
          (sp.count ?? 1) *
            sp.massNumberA *
            (sp.bindingEnergyPerNucleonMeV ?? 0),
        0,
      )
    : null;

  let method: "rest-mass" | "binding-energy";
  let massDifferenceU: number;
  let qValueMeV: number;

  if (allHaveMass) {
    method = "rest-mass";
    const rMass = spec.reactants.reduce(
      (sum, sp) => sum + (sp.count ?? 1) * sp.massU!,
      0,
    );
    const pMass = spec.products.reduce(
      (sum, sp) => sum + (sp.count ?? 1) * sp.massU!,
      0,
    );
    massDifferenceU = rMass - pMass;
    qValueMeV = massDifferenceU * atomicMassUnitMeV;
  } else {
    method = "binding-energy";
    qValueMeV = productTotalBindingMeV! - reactantTotalBindingMeV!;
    massDifferenceU = qValueMeV / atomicMassUnitMeV;
  }

  const massDifferenceKg = massDifferenceU * atomicMassUnitKg;
  const qValueJ = mevToJoules(qValueMeV, e);
  const equationText = `${formatSpeciesSide(spec.reactants)} → ${formatSpeciesSide(spec.products)}`;

  return {
    kind: "nuclear-binding",
    calculationMode: "reaction",
    reactionType: spec.reactionType,
    equationText,
    totalReactantA,
    totalProductA,
    totalReactantZ,
    totalProductZ,
    method,
    massDifferenceU,
    massDifferenceKg,
    qValueMeV,
    qValueJ,
    isExothermic: qValueMeV > 0,
    reactantTotalBindingMeV,
    productTotalBindingMeV,
  };
}

export function solveRutherfordScattering(
  spec: RutherfordScatteringScenarioSpec,
): RutherfordScatteringSolution {
  const constants = assertValid(spec);
  const { elementaryChargeC: e, atomicMassUnitKg } = constants;

  const projectileChargeC = spec.projectileChargeZ * e;
  const targetChargeC = spec.targetChargeZ * e;
  const initialKineticEnergyJ =
    spec.kineticEnergyJ ?? mevToJoules(spec.kineticEnergyMeV!, e);
  const initialKineticEnergyMeV =
    spec.kineticEnergyMeV ?? joulesToMev(spec.kineticEnergyJ!, e);

  const closestApproachM = rutherfordClosestApproachM(
    spec.projectileChargeZ,
    spec.targetChargeZ,
    initialKineticEnergyJ,
    constants,
  );
  const closestApproachFm = closestApproachM * 1e15;

  const estimatedNuclearRadiusM = nuclearRadiusM(
    spec.targetMassNumberA,
    constants,
  );
  const estimatedNuclearRadiusFm = estimatedNuclearRadiusM * 1e15;
  const nuclearVolumeM3 = (4 / 3) * Math.PI * estimatedNuclearRadiusM ** 3;
  const nuclearDensityKgM3 =
    (spec.targetMassNumberA * atomicMassUnitKg) / nuclearVolumeM3;

  const defaultProjectileLabel =
    spec.projectileChargeZ === 2
      ? "α"
      : spec.projectileChargeZ === 1
        ? "p"
        : `+${spec.projectileChargeZ}e`;

  return {
    kind: "rutherford-scattering",
    projectileLabel: spec.projectileLabel ?? defaultProjectileLabel,
    projectileChargeZ: spec.projectileChargeZ,
    projectileChargeC,
    targetSymbol: spec.targetSymbol ?? lookupElementSymbol(spec.targetChargeZ),
    targetChargeZ: spec.targetChargeZ,
    targetChargeC,
    targetMassNumberA: spec.targetMassNumberA,
    initialKineticEnergyMeV,
    initialKineticEnergyJ,
    closestApproachM,
    closestApproachFm,
    estimatedNuclearRadiusM,
    estimatedNuclearRadiusFm,
    nuclearDensityKgM3,
    penetratesStrongForceRange: closestApproachM <= estimatedNuclearRadiusM,
  };
}

export function solveSpecialRelativity(
  spec: SpecialRelativityScenarioSpec,
): SpecialRelativitySolution {
  const constants = assertValid(spec);
  const { speedOfLightMs: c } = constants;

  const beta = spec.beta ?? spec.frameSpeedMs! / c;
  const frameSpeedMs = beta * c;
  const lorentzFactor = lorentzFactorFromBeta(beta);
  const minkowskiAxisAngleRad = Math.atan(Math.abs(beta));
  const minkowskiAxisAngleDeg = (minkowskiAxisAngleRad * 180) / Math.PI;

  const properTimeS = spec.properTimeS ?? null;
  const dilatedTimeS = properTimeS !== null ? lorentzFactor * properTimeS : null;
  const properLengthM = spec.properLengthM ?? null;
  const contractedLengthM =
    properLengthM !== null ? properLengthM / lorentzFactor : null;

  let objectVelocityFractionC: number | null = null;
  let transformedVelocityFractionC: number | null = null;
  if (spec.objectVelocityFractionC !== undefined) {
    objectVelocityFractionC = spec.objectVelocityFractionC;
    transformedVelocityFractionC = relativisticVelocityAdditionFractionC(
      objectVelocityFractionC,
      beta,
    );
  } else if (spec.objectVelocityPrimeFractionC !== undefined) {
    transformedVelocityFractionC = spec.objectVelocityPrimeFractionC;
    objectVelocityFractionC = relativisticVelocityAdditionFractionC(
      transformedVelocityFractionC,
      -beta,
    );
  }

  const objectVelocityMs =
    objectVelocityFractionC !== null ? objectVelocityFractionC * c : null;
  const transformedVelocityMs =
    transformedVelocityFractionC !== null
      ? transformedVelocityFractionC * c
      : null;

  const events: TransformedSpacetimeEvent[] = (spec.events ?? []).map((ev) => {
    const x = ev.xLightSeconds;
    const ct = ev.ctLightSeconds;
    const xPrime = lorentzFactor * (x - beta * ct);
    const ctPrime = lorentzFactor * (ct - beta * x);
    const ds2 = ct * ct - x * x;
    const causalClassification =
      Math.abs(ds2) < 1e-9 ? "lightlike" : ds2 > 0 ? "timelike" : "spacelike";
    return {
      id: ev.id,
      label: ev.label,
      xLightSeconds: x,
      ctLightSeconds: ct,
      xPrimeLightSeconds: xPrime,
      ctPrimeLightSeconds: ctPrime,
      invariantIntervalSquaredLs2: ds2,
      causalClassification,
    };
  });

  return {
    kind: "special-relativity",
    beta,
    frameSpeedMs,
    lorentzFactor,
    minkowskiAxisAngleRad,
    minkowskiAxisAngleDeg,
    properTimeS,
    dilatedTimeS,
    properLengthM,
    contractedLengthM,
    objectVelocityFractionC,
    objectVelocityMs,
    transformedVelocityFractionC,
    transformedVelocityMs,
    events,
  };
}

export function solveQuantumNuclearScenario(
  spec: QuantumNuclearScenarioSpec,
): QuantumNuclearSolution {
  const validation = validateQuantumNuclearScenario(spec);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join("; "));
  }
  switch (spec.kind) {
    case "energy-levels":
      return solveEnergyLevels(spec);
    case "photoelectric-effect":
      return solvePhotoelectricEffect(spec);
    case "matter-waves":
      return solveMatterWaves(spec);
    case "radioactive-decay":
      return solveRadioactiveDecay(spec);
    case "nuclear-decay-chain":
      return solveNuclearDecayChain(spec);
    case "nuclear-binding":
      return solveNuclearBinding(spec);
    case "rutherford-scattering":
      return solveRutherfordScattering(spec);
    case "special-relativity":
      return solveSpecialRelativity(spec);
  }
}
