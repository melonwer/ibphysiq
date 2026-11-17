import {
  DiffractionGratingScenarioSpec,
  DiffractionGratingSolution,
  DopplerEffectScenarioSpec,
  DopplerEffectSolution,
  DoubleSlitScenarioSpec,
  DoubleSlitSolution,
  MalusPolarizationScenarioSpec,
  MalusPolarizationSolution,
  ProgressiveWaveScenarioSpec,
  ProgressiveWaveSolution,
  SingleSlitScenarioSpec,
  SingleSlitSolution,
  StandingWaveScenarioSpec,
  StandingWaveSolution,
  WavesScenarioSpec,
  WavesSolution,
} from "./types";
import { computeExactMaxOrder, parseWavesScenario } from "./validation";

const FIRST_SECONDARY_BETA = 4.493409457909064;
const FIRST_SECONDARY_MAX_INTENSITY =
  (Math.sin(FIRST_SECONDARY_BETA) / FIRST_SECONDARY_BETA) ** 2;

function cleanZero(value: number): number {
  if (Object.is(value, -0) || Math.abs(value) < 1e-14) {
    return 0;
  }
  return value;
}

function sinPi(x: number): number {
  const nearestInt = Math.round(x);
  if (Math.abs(x - nearestInt) <= 1e-12) {
    return 0;
  }
  const twice = 2 * x;
  const nearestHalf = Math.round(twice);
  if (Math.abs(twice - nearestHalf) <= 1e-12 && Math.abs(nearestHalf % 2) === 1) {
    const mod4 = ((nearestHalf % 4) + 4) % 4;
    return mod4 === 1 ? 1 : -1;
  }
  return cleanZero(Math.sin(Math.PI * x));
}

function cosPi(x: number): number {
  return sinPi(x + 0.5);
}

export function sincRadians(u: number): number {
  if (Math.abs(u) < 1e-9) {
    return 1 - (u * u) / 6;
  }
  return Math.sin(u) / u;
}

export function exactCosDegrees(angleDegrees: number): number {
  const norm = ((angleDegrees % 360) + 360) % 360;
  if (Math.abs(norm) < 1e-12 || Math.abs(norm - 360) < 1e-12) return 1;
  if (Math.abs(norm - 180) < 1e-12) return -1;
  if (Math.abs(norm - 90) < 1e-12 || Math.abs(norm - 270) < 1e-12) return 0;
  if (Math.abs(norm - 60) < 1e-12 || Math.abs(norm - 300) < 1e-12) return 0.5;
  if (Math.abs(norm - 120) < 1e-12 || Math.abs(norm - 240) < 1e-12) return -0.5;
  return Math.cos((angleDegrees * Math.PI) / 180);
}

export function exactCosSquaredDegrees(angleDegrees: number): number {
  const norm = ((angleDegrees % 180) + 180) % 180;
  if (Math.abs(norm) < 1e-12 || Math.abs(norm - 180) < 1e-12) return 1;
  if (Math.abs(norm - 90) < 1e-12) return 0;
  if (Math.abs(norm - 45) < 1e-12 || Math.abs(norm - 135) < 1e-12) return 0.5;
  if (Math.abs(norm - 30) < 1e-12 || Math.abs(norm - 150) < 1e-12) return 0.75;
  if (Math.abs(norm - 60) < 1e-12 || Math.abs(norm - 120) < 1e-12) return 0.25;
  const c = exactCosDegrees(angleDegrees);
  return c * c;
}

export function evaluateProgressiveWaveProfile(
  spec: ProgressiveWaveScenarioSpec,
  coord: number,
): number {
  const directionSign = (spec.direction ?? "right") === "right" ? 1 : -1;
  const omega = 2 * Math.PI * spec.frequencyHz;
  const k = (2 * Math.PI) / spec.wavelengthM;
  const phi0 = spec.initialPhaseRad ?? 0;

  const phase =
    spec.profileKind === "displacement-position"
      ? k * coord - directionSign * omega * (spec.snapshotTimeS ?? 0) + phi0
      : omega * coord -
        directionSign * k * (spec.fixedPositionM ?? 0) +
        phi0;

  return cleanZero(spec.amplitudeM * Math.sin(phase));
}

export function evaluateStandingWaveEnvelope(
  spec: StandingWaveScenarioSpec,
  positionM: number,
): number {
  const e = spec.endCorrectionM ?? 0;
  const n = spec.harmonicNumber;

  switch (spec.boundaryKind) {
    case "string-fixed-both":
      return sinPi((n * positionM) / spec.lengthM);
    case "pipe-open-both": {
      const effectiveLength = spec.lengthM + 2 * e;
      return cosPi((n * (positionM + e)) / effectiveLength);
    }
    case "pipe-closed-one": {
      const effectiveLength = spec.lengthM + e;
      return sinPi((n * positionM) / (2 * effectiveLength));
    }
  }
}

export function evaluateDoubleSlitRelativeIntensity(
  spec: DoubleSlitScenarioSpec,
  screenYM: number,
): number {
  const sinTheta = screenYM / Math.hypot(spec.screenDistanceM, screenYM);
  const interferenceArg =
    (Math.PI * spec.slitSeparationM * sinTheta) / spec.wavelengthM;
  const interferenceTerm = Math.cos(interferenceArg) ** 2;

  if (spec.slitWidthM === undefined) {
    return cleanZero(interferenceTerm);
  }
  const diffractionArg =
    (Math.PI * spec.slitWidthM * sinTheta) / spec.wavelengthM;
  const envelopeTerm = sincRadians(diffractionArg) ** 2;
  return cleanZero(interferenceTerm * envelopeTerm);
}

export function evaluateSingleSlitRelativeIntensity(
  spec: SingleSlitScenarioSpec,
  screenYM: number,
): number {
  const sinTheta = screenYM / Math.hypot(spec.screenDistanceM, screenYM);
  const beta = (Math.PI * spec.slitWidthM * sinTheta) / spec.wavelengthM;
  return cleanZero(sincRadians(beta) ** 2);
}

function solveProgressiveWave(
  spec: ProgressiveWaveScenarioSpec,
): ProgressiveWaveSolution {
  const direction = spec.direction ?? "right";
  const periodS = 1 / spec.frequencyHz;
  const waveSpeedMs = spec.frequencyHz * spec.wavelengthM;
  const angularFrequencyRadS = 2 * Math.PI * spec.frequencyHz;
  const wavenumberRadM = (2 * Math.PI) / spec.wavelengthM;
  const initialPhaseRad = spec.initialPhaseRad ?? 0;
  const snapshotTimeS = spec.snapshotTimeS ?? 0;
  const fixedPositionM = spec.fixedPositionM ?? 0;
  const cyclesShown = spec.cyclesShown ?? 2;

  const cycleSpan =
    spec.profileKind === "displacement-position" ? spec.wavelengthM : periodS;
  const axisDomainMax = cyclesShown * cycleSpan;

  const point1Coord = spec.point1Coord ?? 0;
  const point2Coord = spec.point2Coord ?? 0.25 * cycleSpan;
  const point1DisplacementM = evaluateProgressiveWaveProfile(spec, point1Coord);
  const point2DisplacementM = evaluateProgressiveWaveProfile(spec, point2Coord);

  const coordSeparation = Math.abs(point2Coord - point1Coord);
  const fractionalCycles = coordSeparation / cycleSpan;
  const phaseDifferenceRad = 2 * Math.PI * fractionalCycles;

  const twoPi = 2 * Math.PI;
  let phaseDifferenceModulo2PiRad =
    ((phaseDifferenceRad % twoPi) + twoPi) % twoPi;
  if (
    Math.abs(phaseDifferenceModulo2PiRad) < 1e-12 ||
    Math.abs(phaseDifferenceModulo2PiRad - twoPi) < 1e-12
  ) {
    phaseDifferenceModulo2PiRad = 0;
  }
  const principalPhaseDifferenceRad =
    phaseDifferenceModulo2PiRad <= Math.PI
      ? phaseDifferenceModulo2PiRad
      : twoPi - phaseDifferenceModulo2PiRad;
  const phaseDifferenceDegrees = 360 * fractionalCycles;
  const crestToTroughM = 2 * spec.amplitudeM;

  const quantities: Record<string, number> = {
    amplitudeM: spec.amplitudeM,
    crestToTroughM,
    wavelengthM: spec.wavelengthM,
    frequencyHz: spec.frequencyHz,
    periodS,
    waveSpeedMs,
    angularFrequencyRadS,
    wavenumberRadM,
    initialPhaseRad,
    snapshotTimeS,
    fixedPositionM,
    point1Coord,
    point2Coord,
    point1DisplacementM,
    point2DisplacementM,
    coordSeparation,
    fractionalCycles,
    phaseDifferenceRad,
    phaseDifferenceModulo2PiRad,
    principalPhaseDifferenceRad,
    phaseDifferenceDegrees,
  };

  return {
    kind: "progressive-wave",
    profileKind: spec.profileKind,
    direction,
    amplitudeM: spec.amplitudeM,
    crestToTroughM,
    wavelengthM: spec.wavelengthM,
    frequencyHz: spec.frequencyHz,
    periodS,
    waveSpeedMs,
    angularFrequencyRadS,
    wavenumberRadM,
    initialPhaseRad,
    snapshotTimeS,
    fixedPositionM,
    cyclesShown,
    axisDomainMax,
    point1Coord,
    point2Coord,
    point1DisplacementM,
    point2DisplacementM,
    coordSeparation,
    fractionalCycles,
    phaseDifferenceRad,
    phaseDifferenceModulo2PiRad,
    principalPhaseDifferenceRad,
    phaseDifferenceDegrees,
    quantities,
  };
}

function solveStandingWave(
  spec: StandingWaveScenarioSpec,
): StandingWaveSolution {
  const n = spec.harmonicNumber;
  const endCorrectionM =
    spec.boundaryKind === "string-fixed-both" ? 0 : (spec.endCorrectionM ?? 0);
  const waveSpeedMs =
    spec.waveSpeedMs ?? Math.sqrt(spec.tensionN! / spec.linearDensityKgM!);
  const amplitudeM = spec.amplitudeM ?? 0.02;

  let effectiveLengthM: number;
  let wavelengthM: number;
  let fundamentalFrequencyHz: number;
  let modeIndex: number;
  const nodePositionsM: number[] = [];
  const antinodePositionsM: number[] = [];

  switch (spec.boundaryKind) {
    case "string-fixed-both": {
      effectiveLengthM = spec.lengthM;
      wavelengthM = (2 * effectiveLengthM) / n;
      fundamentalFrequencyHz = waveSpeedMs / (2 * effectiveLengthM);
      modeIndex = n;
      for (let k = 0; k <= n; k += 1) {
        nodePositionsM.push(cleanZero((k * effectiveLengthM) / n));
      }
      for (let k = 0; k < n; k += 1) {
        antinodePositionsM.push(cleanZero(((k + 0.5) * effectiveLengthM) / n));
      }
      break;
    }
    case "pipe-open-both": {
      effectiveLengthM = spec.lengthM + 2 * endCorrectionM;
      wavelengthM = (2 * effectiveLengthM) / n;
      fundamentalFrequencyHz = waveSpeedMs / (2 * effectiveLengthM);
      modeIndex = n;
      for (let k = 0; k < n; k += 1) {
        nodePositionsM.push(
          cleanZero(-endCorrectionM + ((k + 0.5) * effectiveLengthM) / n),
        );
      }
      for (let k = 0; k <= n; k += 1) {
        antinodePositionsM.push(
          cleanZero(-endCorrectionM + (k * effectiveLengthM) / n),
        );
      }
      break;
    }
    case "pipe-closed-one": {
      effectiveLengthM = spec.lengthM + endCorrectionM;
      wavelengthM = (4 * effectiveLengthM) / n;
      fundamentalFrequencyHz = waveSpeedMs / (4 * effectiveLengthM);
      modeIndex = (n + 1) / 2;
      const maxIndex = (n - 1) / 2;
      for (let k = 0; k <= maxIndex; k += 1) {
        nodePositionsM.push(cleanZero((2 * k * effectiveLengthM) / n));
        antinodePositionsM.push(
          cleanZero(((2 * k + 1) * effectiveLengthM) / n),
        );
      }
      break;
    }
  }

  const harmonicFrequencyHz = n * fundamentalFrequencyHz;
  const periodS = 1 / harmonicFrequencyHz;
  const adjacentNodeSpacingM = wavelengthM / 2;
  const nodeToAntinodeSpacingM = wavelengthM / 4;

  const quantities: Record<string, number> = {
    lengthM: spec.lengthM,
    endCorrectionM,
    effectiveLengthM,
    harmonicNumber: n,
    modeIndex,
    waveSpeedMs,
    wavelengthM,
    fundamentalFrequencyHz,
    harmonicFrequencyHz,
    frequencyHz: harmonicFrequencyHz,
    periodS,
    nodeCount: nodePositionsM.length,
    antinodeCount: antinodePositionsM.length,
    adjacentNodeSpacingM,
    nodeToAntinodeSpacingM,
    amplitudeM,
  };
  if (spec.tensionN !== undefined) {
    quantities.tensionN = spec.tensionN;
  }
  if (spec.linearDensityKgM !== undefined) {
    quantities.linearDensityKgM = spec.linearDensityKgM;
  }

  return {
    kind: "standing-wave",
    boundaryKind: spec.boundaryKind,
    lengthM: spec.lengthM,
    endCorrectionM,
    effectiveLengthM,
    harmonicNumber: n,
    modeIndex,
    waveSpeedMs,
    ...(spec.tensionN !== undefined ? { tensionN: spec.tensionN } : {}),
    ...(spec.linearDensityKgM !== undefined
      ? { linearDensityKgM: spec.linearDensityKgM }
      : {}),
    wavelengthM,
    fundamentalFrequencyHz,
    harmonicFrequencyHz,
    periodS,
    nodeCount: nodePositionsM.length,
    antinodeCount: antinodePositionsM.length,
    nodePositionsM,
    antinodePositionsM,
    adjacentNodeSpacingM,
    nodeToAntinodeSpacingM,
    amplitudeM,
    quantities,
  };
}

function solveDoubleSlit(spec: DoubleSlitScenarioSpec): DoubleSlitSolution {
  const orderN = spec.orderN ?? 1;
  const fringeSpacingM =
    (spec.wavelengthM * spec.screenDistanceM) / spec.slitSeparationM;
  const sinTheta = (orderN * spec.wavelengthM) / spec.slitSeparationM;
  const nthOrderAngleRad = Math.asin(sinTheta);
  const nthOrderAngleDegrees = (nthOrderAngleRad * 180) / Math.PI;
  const nthBrightPositionM = orderN * fringeSpacingM;
  const nthBrightExactPositionM =
    spec.screenDistanceM * Math.tan(nthOrderAngleRad);
  const firstDarkPositionM = 0.5 * fringeSpacingM;
  const pathDifferenceM = orderN * spec.wavelengthM;
  const maxOrder = computeExactMaxOrder(
    spec.slitSeparationM,
    spec.wavelengthM,
  );

  const quantities: Record<string, number> = {
    wavelengthM: spec.wavelengthM,
    slitSeparationM: spec.slitSeparationM,
    screenDistanceM: spec.screenDistanceM,
    orderN,
    fringeSpacingM,
    nthOrderAngleRad,
    nthOrderAngleDegrees,
    nthBrightPositionM,
    nthBrightExactPositionM,
    firstDarkPositionM,
    pathDifferenceM,
    maxOrder,
  };

  let centralEnvelopeHalfWidthM: number | undefined;
  let centralEnvelopeFullWidthM: number | undefined;
  let firstMissingOrder: number | null | undefined;

  if (spec.slitWidthM !== undefined) {
    centralEnvelopeHalfWidthM =
      (spec.wavelengthM * spec.screenDistanceM) / spec.slitWidthM;
    centralEnvelopeFullWidthM = 2 * centralEnvelopeHalfWidthM;
    const ratio = spec.slitSeparationM / spec.slitWidthM;
    const rounded = Math.round(ratio);
    firstMissingOrder =
      Math.abs(ratio - rounded) <= 1e-9 * Math.max(1, rounded)
        ? rounded
        : null;
    quantities.slitWidthM = spec.slitWidthM;
    quantities.centralEnvelopeHalfWidthM = centralEnvelopeHalfWidthM;
    quantities.centralEnvelopeFullWidthM = centralEnvelopeFullWidthM;
  }

  return {
    kind: "double-slit",
    wavelengthM: spec.wavelengthM,
    slitSeparationM: spec.slitSeparationM,
    screenDistanceM: spec.screenDistanceM,
    ...(spec.slitWidthM !== undefined
      ? {
          slitWidthM: spec.slitWidthM,
          centralEnvelopeHalfWidthM,
          centralEnvelopeFullWidthM,
          firstMissingOrder,
        }
      : {}),
    orderN,
    fringeSpacingM,
    nthOrderAngleRad,
    nthOrderAngleDegrees,
    nthBrightPositionM,
    nthBrightExactPositionM,
    firstDarkPositionM,
    pathDifferenceM,
    maxOrder,
    quantities,
  };
}

function solveDiffractionGrating(
  spec: DiffractionGratingScenarioSpec,
): DiffractionGratingSolution {
  const linesPerMeter = 1 / spec.slitSpacingM;
  const linesPerMm = spec.linesPerMm ?? 1e-3 / spec.slitSpacingM;
  const maxOrder = computeExactMaxOrder(spec.slitSpacingM, spec.wavelengthM);

  const orderAnglesRad: number[] = [];
  const orderAnglesDegrees: number[] = [];
  let strictlySubNinetyMaxOrder = 0;

  for (let m = 0; m <= maxOrder; m += 1) {
    const rawSin = (m * spec.wavelengthM) / spec.slitSpacingM;
    const clampedSin = Math.min(1, rawSin);
    if (m > 0 && rawSin < 1 - 1e-12) {
      strictlySubNinetyMaxOrder = m;
    }
    const rad = Math.asin(clampedSin);
    orderAnglesRad.push(rad);
    orderAnglesDegrees.push((rad * 180) / Math.PI);
  }

  const totalPrincipalMaxima = 2 * maxOrder + 1;
  const flatScreenMaximaCount = 2 * strictlySubNinetyMaxOrder + 1;
  const queryOrderN = spec.queryOrderN ?? (maxOrder >= 1 ? 1 : 0);
  const querySinTheta = Math.min(
    1,
    (queryOrderN * spec.wavelengthM) / spec.slitSpacingM,
  );
  const queryAngleRad = orderAnglesRad[queryOrderN];
  const queryAngleDegrees = orderAnglesDegrees[queryOrderN];

  const quantities: Record<string, number> = {
    wavelengthM: spec.wavelengthM,
    slitSpacingM: spec.slitSpacingM,
    linesPerMeter,
    linesPerMm,
    maxOrder,
    strictlySubNinetyMaxOrder,
    totalPrincipalMaxima,
    flatScreenMaximaCount,
    queryOrderN,
    querySinTheta,
    queryAngleRad,
    queryAngleDegrees,
  };

  let queryScreenPositionM: number | undefined;
  if (spec.screenDistanceM !== undefined) {
    queryScreenPositionM = spec.screenDistanceM * Math.tan(queryAngleRad);
    quantities.screenDistanceM = spec.screenDistanceM;
    quantities.queryScreenPositionM = queryScreenPositionM;
  }

  return {
    kind: "diffraction-grating",
    wavelengthM: spec.wavelengthM,
    slitSpacingM: spec.slitSpacingM,
    linesPerMeter,
    linesPerMm,
    maxOrder,
    strictlySubNinetyMaxOrder,
    totalPrincipalMaxima,
    flatScreenMaximaCount,
    orderAnglesRad,
    orderAnglesDegrees,
    queryOrderN,
    querySinTheta,
    queryAngleRad,
    queryAngleDegrees,
    ...(spec.screenDistanceM !== undefined
      ? {
          screenDistanceM: spec.screenDistanceM,
          queryScreenPositionM,
        }
      : {}),
    quantities,
  };
}

function solveSingleSlit(spec: SingleSlitScenarioSpec): SingleSlitSolution {
  const firstMinimumAngleRad = spec.wavelengthM / spec.slitWidthM;
  const firstMinimumExactAngleRad = Math.asin(
    spec.wavelengthM / spec.slitWidthM,
  );
  const firstMinimumExactAngleDegrees =
    (firstMinimumExactAngleRad * 180) / Math.PI;
  const centralAngularWidthRad = 2 * firstMinimumAngleRad;
  const centralHalfWidthM = firstMinimumAngleRad * spec.screenDistanceM;
  const centralFullWidthM = 2 * centralHalfWidthM;
  const centralExactHalfWidthM =
    spec.screenDistanceM * Math.tan(firstMinimumExactAngleRad);
  const centralExactFullWidthM = 2 * centralExactHalfWidthM;

  const quantities: Record<string, number> = {
    wavelengthM: spec.wavelengthM,
    slitWidthM: spec.slitWidthM,
    screenDistanceM: spec.screenDistanceM,
    firstMinimumAngleRad,
    firstMinimumExactAngleRad,
    firstMinimumExactAngleDegrees,
    centralAngularWidthRad,
    centralHalfWidthM,
    centralFullWidthM,
    centralExactHalfWidthM,
    centralExactFullWidthM,
    firstSecondaryMaxRelativeIntensity: FIRST_SECONDARY_MAX_INTENSITY,
  };

  return {
    kind: "single-slit",
    wavelengthM: spec.wavelengthM,
    slitWidthM: spec.slitWidthM,
    screenDistanceM: spec.screenDistanceM,
    firstMinimumAngleRad,
    firstMinimumExactAngleRad,
    firstMinimumExactAngleDegrees,
    centralAngularWidthRad,
    centralHalfWidthM,
    centralFullWidthM,
    centralExactHalfWidthM,
    centralExactFullWidthM,
    firstSecondaryMaxRelativeIntensity: FIRST_SECONDARY_MAX_INTENSITY,
    quantities,
  };
}

function solveDopplerEffect(
  spec: DopplerEffectScenarioSpec,
): DopplerEffectSolution {
  const v = spec.waveSpeedMs;
  const vsSigned =
    spec.sourceMotion === "towards-observer"
      ? spec.sourceSpeedMs
      : spec.sourceMotion === "away-from-observer"
        ? -spec.sourceSpeedMs
        : 0;
  const voSigned =
    spec.observerMotion === "towards-source"
      ? spec.observerSpeedMs
      : spec.observerMotion === "away-from-source"
        ? -spec.observerSpeedMs
        : 0;

  const relativeWaveSpeedAtObserverMs = v + voSigned;
  const denominatorSpeedMs = v - vsSigned;

  const observedFrequencyHz =
    spec.emittedFrequencyHz *
    (relativeWaveSpeedAtObserverMs / denominatorSpeedMs);
  const observedPeriodS = 1 / observedFrequencyHz;
  const frequencyShiftHz = cleanZero(
    observedFrequencyHz - spec.emittedFrequencyHz,
  );
  const fractionalFrequencyShift = cleanZero(
    frequencyShiftHz / spec.emittedFrequencyHz,
  );
  const emittedWavelengthM = v / spec.emittedFrequencyHz;
  const mediumWavelengthTowardsObserverM =
    denominatorSpeedMs / spec.emittedFrequencyHz;
  const closingSpeedMs = vsSigned + voSigned;
  const lowSpeedShiftApproximationHz = cleanZero(
    spec.emittedFrequencyHz * (closingSpeedMs / v),
  );

  const quantities: Record<string, number> = {
    emittedFrequencyHz: spec.emittedFrequencyHz,
    waveSpeedMs: spec.waveSpeedMs,
    sourceSpeedMs: spec.sourceSpeedMs,
    observerSpeedMs: spec.observerSpeedMs,
    observedFrequencyHz,
    observedPeriodS,
    frequencyShiftHz,
    fractionalFrequencyShift,
    emittedWavelengthM,
    mediumWavelengthTowardsObserverM,
    relativeWaveSpeedAtObserverMs,
    lowSpeedShiftApproximationHz,
  };

  return {
    kind: "doppler-effect",
    emittedFrequencyHz: spec.emittedFrequencyHz,
    waveSpeedMs: spec.waveSpeedMs,
    sourceSpeedMs: spec.sourceSpeedMs,
    sourceMotion: spec.sourceMotion,
    observerSpeedMs: spec.observerSpeedMs,
    observerMotion: spec.observerMotion,
    observedFrequencyHz,
    observedPeriodS,
    frequencyShiftHz,
    fractionalFrequencyShift,
    emittedWavelengthM,
    mediumWavelengthTowardsObserverM,
    relativeWaveSpeedAtObserverMs,
    lowSpeedShiftApproximationHz,
    quantities,
  };
}

function solveMalusPolarization(
  spec: MalusPolarizationScenarioSpec,
): MalusPolarizationSolution {
  const incidentPolarization = spec.incidentPolarization ?? "polarized";
  const intensityBeforeAnalyzerWm2 =
    incidentPolarization === "unpolarized"
      ? 0.5 * spec.incidentIntensityWm2
      : spec.incidentIntensityWm2;
  const cosThetaSquared = exactCosSquaredDegrees(spec.analyzerAngleDegrees);
  const amplitudeTransmissionFactor = Math.abs(
    exactCosDegrees(spec.analyzerAngleDegrees),
  );
  const transmittedIntensityWm2 = cleanZero(
    intensityBeforeAnalyzerWm2 * cosThetaSquared,
  );
  const absorbedIntensityAtAnalyzerWm2 = cleanZero(
    intensityBeforeAnalyzerWm2 - transmittedIntensityWm2,
  );
  const overallTransmissionFraction = cleanZero(
    transmittedIntensityWm2 / spec.incidentIntensityWm2,
  );

  const quantities: Record<string, number> = {
    incidentIntensityWm2: spec.incidentIntensityWm2,
    analyzerAngleDegrees: spec.analyzerAngleDegrees,
    intensityBeforeAnalyzerWm2,
    transmittedIntensityWm2,
    absorbedIntensityAtAnalyzerWm2,
    cosThetaSquared,
    amplitudeTransmissionFactor,
    overallTransmissionFraction,
  };

  return {
    kind: "malus-polarization",
    incidentIntensityWm2: spec.incidentIntensityWm2,
    analyzerAngleDegrees: spec.analyzerAngleDegrees,
    incidentPolarization,
    intensityBeforeAnalyzerWm2,
    transmittedIntensityWm2,
    absorbedIntensityAtAnalyzerWm2,
    cosThetaSquared,
    amplitudeTransmissionFactor,
    overallTransmissionFraction,
    quantities,
  };
}

export function solveWavesScenario(
  spec: ProgressiveWaveScenarioSpec,
): ProgressiveWaveSolution;
export function solveWavesScenario(
  spec: StandingWaveScenarioSpec,
): StandingWaveSolution;
export function solveWavesScenario(
  spec: DoubleSlitScenarioSpec,
): DoubleSlitSolution;
export function solveWavesScenario(
  spec: DiffractionGratingScenarioSpec,
): DiffractionGratingSolution;
export function solveWavesScenario(
  spec: SingleSlitScenarioSpec,
): SingleSlitSolution;
export function solveWavesScenario(
  spec: DopplerEffectScenarioSpec,
): DopplerEffectSolution;
export function solveWavesScenario(
  spec: MalusPolarizationScenarioSpec,
): MalusPolarizationSolution;
export function solveWavesScenario(spec: WavesScenarioSpec): WavesSolution;
export function solveWavesScenario(spec: WavesScenarioSpec): WavesSolution {
  const validated = parseWavesScenario(spec);
  switch (validated.kind) {
    case "progressive-wave":
      return solveProgressiveWave(validated);
    case "standing-wave":
      return solveStandingWave(validated);
    case "double-slit":
      return solveDoubleSlit(validated);
    case "diffraction-grating":
      return solveDiffractionGrating(validated);
    case "single-slit":
      return solveSingleSlit(validated);
    case "doppler-effect":
      return solveDopplerEffect(validated);
    case "malus-polarization":
      return solveMalusPolarization(validated);
  }
}
