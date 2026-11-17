import { Point2D, VisualValidationIssue } from "../types";
import {
  AcGeneratorSolution,
  AcGeneratorSpec,
  FluxFaradaySolution,
  FluxFaradaySpec,
  MotionalEmfRailsSolution,
  MotionalEmfRailsSpec,
  TransformerSolution,
  TransformerSpec,
} from "./types";

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive and finite`);
  }
}

function exactCosDegrees(angleDegrees: number): number {
  const normalized = ((angleDegrees % 360) + 360) % 360;
  if (
    Math.abs(normalized - 90) < 1e-12 ||
    Math.abs(normalized - 270) < 1e-12
  ) {
    return 0;
  }
  if (Math.abs(normalized) < 1e-12 || Math.abs(normalized - 360) < 1e-12) {
    return 1;
  }
  if (Math.abs(normalized - 180) < 1e-12) {
    return -1;
  }
  return Math.cos((angleDegrees * Math.PI) / 180);
}

function cleanZero(value: number): number {
  return Object.is(value, -0) || Math.abs(value) < 1e-18 ? 0 : value;
}

export function magneticFlux(
  magneticFieldT: number,
  areaM2: number,
  angleToNormalDegrees = 0,
): number {
  if (!Number.isFinite(magneticFieldT)) {
    throw new Error("Magnetic field must be finite");
  }
  assertPositiveFinite("Coil area", areaM2);
  if (!Number.isFinite(angleToNormalDegrees)) {
    throw new Error("Angle to normal must be finite");
  }
  return cleanZero(
    magneticFieldT * areaM2 * exactCosDegrees(angleToNormalDegrees),
  );
}

export function fluxLinkage(
  turns: number,
  magneticFieldT: number,
  areaM2: number,
  angleToNormalDegrees = 0,
): number {
  assertPositiveFinite("Number of turns", turns);
  return cleanZero(
    turns * magneticFlux(magneticFieldT, areaM2, angleToNormalDegrees),
  );
}

export function faradayAverageEmf(
  turns: number,
  initialFluxWb: number,
  finalFluxWb: number,
  timeIntervalS: number,
): number {
  assertPositiveFinite("Number of turns", turns);
  if (!Number.isFinite(initialFluxWb) || !Number.isFinite(finalFluxWb)) {
    throw new Error("Initial and final magnetic flux must be finite");
  }
  assertPositiveFinite("Time interval", timeIntervalS);
  return cleanZero((-turns * (finalFluxWb - initialFluxWb)) / timeIntervalS);
}

export function motionalEmf(
  magneticFieldT: number,
  rodSpeedMs: number,
  railSeparationM: number,
): number {
  assertPositiveFinite("Magnetic field", magneticFieldT);
  assertPositiveFinite("Rod speed", rodSpeedMs);
  assertPositiveFinite("Rail separation", railSeparationM);
  return magneticFieldT * rodSpeedMs * railSeparationM;
}

export function magneticBrakingForce(
  magneticFieldT: number,
  railSeparationM: number,
  rodSpeedMs: number,
  totalResistanceOhm: number,
): number {
  assertPositiveFinite("Magnetic field", magneticFieldT);
  assertPositiveFinite("Rail separation", railSeparationM);
  assertPositiveFinite("Rod speed", rodSpeedMs);
  assertPositiveFinite("Total resistance", totalResistanceOhm);
  return (
    (magneticFieldT ** 2 * railSeparationM ** 2 * rodSpeedMs) /
    totalResistanceOhm
  );
}

export function acPeakEmf(
  turns: number,
  magneticFieldT: number,
  coilAreaM2: number,
  angularSpeedRadS: number,
): number {
  assertPositiveFinite("Number of turns", turns);
  assertPositiveFinite("Magnetic field", magneticFieldT);
  assertPositiveFinite("Coil area", coilAreaM2);
  assertPositiveFinite("Angular speed", angularSpeedRadS);
  return turns * magneticFieldT * coilAreaM2 * angularSpeedRadS;
}

export function rmsFromPeak(peakValue: number): number {
  if (!Number.isFinite(peakValue) || peakValue < 0) {
    throw new Error("Peak amplitude must be non-negative and finite");
  }
  return peakValue / Math.SQRT2;
}

export function acMeanPower(
  rmsVoltageV: number,
  rmsCurrentA: number,
): number {
  if (!Number.isFinite(rmsVoltageV) || rmsVoltageV < 0) {
    throw new Error("RMS voltage must be non-negative and finite");
  }
  if (!Number.isFinite(rmsCurrentA) || rmsCurrentA < 0) {
    throw new Error("RMS current must be non-negative and finite");
  }
  return rmsVoltageV * rmsCurrentA;
}

export function transformerSecondaryVoltage(
  primaryVoltageRmsV: number,
  primaryTurns: number,
  secondaryTurns: number,
): number {
  assertPositiveFinite("Primary RMS voltage", primaryVoltageRmsV);
  assertPositiveFinite("Primary turns", primaryTurns);
  assertPositiveFinite("Secondary turns", secondaryTurns);
  return (primaryVoltageRmsV * secondaryTurns) / primaryTurns;
}

function addPositiveIssue(
  issues: VisualValidationIssue[],
  path: string,
  label: string,
  value: number | undefined,
): void {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    issues.push({
      code: "INVALID_POSITIVE_QUANTITY",
      message: `${label} must be positive and finite`,
      path,
    });
  }
}

export function validateFluxFaraday(
  spec: FluxFaradaySpec,
  issues: VisualValidationIssue[],
): void {
  if (!Number.isFinite(spec.turns) || spec.turns < 1) {
    issues.push({
      code: "INVALID_TURNS",
      message: "Coil turns must be finite and >= 1",
      path: "turns",
    });
  }
  addPositiveIssue(issues, "coilAreaM2", "Coil area", spec.coilAreaM2);
  if (!Number.isFinite(spec.initialFieldT)) {
    issues.push({
      code: "INVALID_FIELD",
      message: "Initial magnetic field must be finite",
      path: "initialFieldT",
    });
  }
  if (!Number.isFinite(spec.finalFieldT)) {
    issues.push({
      code: "INVALID_FIELD",
      message: "Final magnetic field must be finite",
      path: "finalFieldT",
    });
  }
  for (const [path, angle] of [
    ["initialAngleDegrees", spec.initialAngleDegrees],
    ["finalAngleDegrees", spec.finalAngleDegrees],
  ] as const) {
    if (
      angle !== undefined &&
      (!Number.isFinite(angle) || angle < 0 || angle > 180)
    ) {
      issues.push({
        code: "INVALID_ANGLE",
        message: `${path} must lie between 0 and 180 degrees`,
        path,
      });
    }
  }
  if (
    spec.angleReference !== undefined &&
    spec.angleReference !== "normal" &&
    spec.angleReference !== "plane"
  ) {
    issues.push({
      code: "INVALID_ANGLE_REFERENCE",
      message: "angleReference must be normal or plane",
      path: "angleReference",
    });
  }
  addPositiveIssue(
    issues,
    "timeIntervalS",
    "Time interval",
    spec.timeIntervalS,
  );
  if (spec.coilResistanceOhm !== undefined) {
    addPositiveIssue(
      issues,
      "coilResistanceOhm",
      "Coil resistance",
      spec.coilResistanceOhm,
    );
  }
}

export function validateMotionalEmfRails(
  spec: MotionalEmfRailsSpec,
  issues: VisualValidationIssue[],
): void {
  addPositiveIssue(
    issues,
    "magneticFieldT",
    "Magnetic field",
    spec.magneticFieldT,
  );
  if (
    spec.fieldDirection !== "into-page" &&
    spec.fieldDirection !== "out-of-page"
  ) {
    issues.push({
      code: "INVALID_FIELD_DIRECTION",
      message: "fieldDirection must be into-page or out-of-page",
      path: "fieldDirection",
    });
  }
  addPositiveIssue(
    issues,
    "railSeparationM",
    "Rail separation",
    spec.railSeparationM,
  );
  addPositiveIssue(issues, "rodSpeedMs", "Rod speed", spec.rodSpeedMs);
  if (
    spec.rodDirection !== undefined &&
    spec.rodDirection !== "left" &&
    spec.rodDirection !== "right"
  ) {
    issues.push({
      code: "INVALID_ROD_DIRECTION",
      message: "rodDirection must be left or right",
      path: "rodDirection",
    });
  }
  addPositiveIssue(
    issues,
    "loadResistanceOhm",
    "Load resistance",
    spec.loadResistanceOhm,
  );
  if (
    spec.rodResistanceOhm !== undefined &&
    (!Number.isFinite(spec.rodResistanceOhm) || spec.rodResistanceOhm < 0)
  ) {
    issues.push({
      code: "INVALID_ROD_RESISTANCE",
      message: "rodResistanceOhm must be non-negative and finite",
      path: "rodResistanceOhm",
    });
  }
}

export function validateAcGenerator(
  spec: AcGeneratorSpec,
  issues: VisualValidationIssue[],
): void {
  if (!Number.isFinite(spec.turns) || spec.turns < 1) {
    issues.push({
      code: "INVALID_TURNS",
      message: "Generator turns must be finite and >= 1",
      path: "turns",
    });
  }
  addPositiveIssue(issues, "coilAreaM2", "Coil area", spec.coilAreaM2);
  addPositiveIssue(
    issues,
    "magneticFieldT",
    "Magnetic field",
    spec.magneticFieldT,
  );
  if (spec.angularSpeedRadS === undefined && spec.frequencyHz === undefined) {
    issues.push({
      code: "MISSING_ANGULAR_SPEED",
      message: "AC generator requires either angularSpeedRadS or frequencyHz",
      path: "angularSpeedRadS",
    });
  }
  if (spec.angularSpeedRadS !== undefined) {
    addPositiveIssue(
      issues,
      "angularSpeedRadS",
      "Angular speed",
      spec.angularSpeedRadS,
    );
  }
  if (spec.frequencyHz !== undefined) {
    addPositiveIssue(issues, "frequencyHz", "Frequency", spec.frequencyHz);
  }
  if (
    spec.angularSpeedRadS !== undefined &&
    spec.frequencyHz !== undefined &&
    Number.isFinite(spec.angularSpeedRadS) &&
    Number.isFinite(spec.frequencyHz) &&
    spec.angularSpeedRadS > 0 &&
    spec.frequencyHz > 0
  ) {
    const expectedOmega = 2 * Math.PI * spec.frequencyHz;
    if (Math.abs(spec.angularSpeedRadS - expectedOmega) > 1e-3 * expectedOmega) {
      issues.push({
        code: "INCONSISTENT_OMEGA_FREQUENCY",
        message: "angularSpeedRadS and frequencyHz disagree with omega = 2*pi*f",
        path: "angularSpeedRadS",
      });
    }
  }
  if (spec.loadResistanceOhm !== undefined) {
    addPositiveIssue(
      issues,
      "loadResistanceOhm",
      "Load resistance",
      spec.loadResistanceOhm,
    );
  }
  if (
    spec.initialPhaseRad !== undefined &&
    !Number.isFinite(spec.initialPhaseRad)
  ) {
    issues.push({
      code: "INVALID_INITIAL_PHASE",
      message: "initialPhaseRad must be finite",
      path: "initialPhaseRad",
    });
  }
  if (
    spec.cyclesShown !== undefined &&
    (!Number.isFinite(spec.cyclesShown) ||
      spec.cyclesShown < 0.5 ||
      spec.cyclesShown > 6)
  ) {
    issues.push({
      code: "INVALID_CYCLES_SHOWN",
      message: "cyclesShown must lie between 0.5 and 6",
      path: "cyclesShown",
    });
  }
  if (
    spec.queryTimeS !== undefined &&
    (!Number.isFinite(spec.queryTimeS) || spec.queryTimeS < 0)
  ) {
    issues.push({
      code: "INVALID_QUERY_TIME",
      message: "queryTimeS must be non-negative and finite",
      path: "queryTimeS",
    });
  }
}

export function validateTransformer(
  spec: TransformerSpec,
  issues: VisualValidationIssue[],
): void {
  addPositiveIssue(
    issues,
    "primaryVoltageRmsV",
    "Primary RMS voltage",
    spec.primaryVoltageRmsV,
  );
  if (!Number.isFinite(spec.primaryTurns) || spec.primaryTurns < 1) {
    issues.push({
      code: "INVALID_TURNS",
      message: "primaryTurns must be finite and >= 1",
      path: "primaryTurns",
    });
  }
  if (!Number.isFinite(spec.secondaryTurns) || spec.secondaryTurns < 1) {
    issues.push({
      code: "INVALID_TURNS",
      message: "secondaryTurns must be finite and >= 1",
      path: "secondaryTurns",
    });
  }
  if (
    spec.efficiency !== undefined &&
    (!Number.isFinite(spec.efficiency) ||
      spec.efficiency <= 0 ||
      spec.efficiency > 1)
  ) {
    issues.push({
      code: "INVALID_EFFICIENCY",
      message: "Transformer efficiency must satisfy 0 < efficiency <= 1",
      path: "efficiency",
    });
  }
  if (spec.loadResistanceOhm !== undefined) {
    addPositiveIssue(
      issues,
      "loadResistanceOhm",
      "Secondary load resistance",
      spec.loadResistanceOhm,
    );
  }
  if (spec.secondaryCurrentRmsA !== undefined) {
    addPositiveIssue(
      issues,
      "secondaryCurrentRmsA",
      "Secondary RMS current",
      spec.secondaryCurrentRmsA,
    );
  }
  if (
    spec.loadResistanceOhm !== undefined &&
    spec.secondaryCurrentRmsA !== undefined &&
    spec.loadResistanceOhm > 0 &&
    spec.secondaryCurrentRmsA > 0 &&
    spec.primaryVoltageRmsV > 0 &&
    spec.primaryTurns >= 1 &&
    spec.secondaryTurns >= 1
  ) {
    const vs =
      (spec.primaryVoltageRmsV * spec.secondaryTurns) / spec.primaryTurns;
    const expectedIs = vs / spec.loadResistanceOhm;
    if (
      Math.abs(spec.secondaryCurrentRmsA - expectedIs) >
      1e-3 * expectedIs
    ) {
      issues.push({
        code: "INCONSISTENT_SECONDARY_LOAD",
        message: "secondaryCurrentRmsA and loadResistanceOhm disagree with Vs = Is * Rs",
        path: "secondaryCurrentRmsA",
      });
    }
  }
  if (spec.supplyFrequencyHz !== undefined) {
    addPositiveIssue(
      issues,
      "supplyFrequencyHz",
      "Supply frequency",
      spec.supplyFrequencyHz,
    );
  }
}

export function solveFluxFaraday(spec: FluxFaradaySpec): FluxFaradaySolution {
  const ref = spec.angleReference ?? "normal";
  const rawAngle1 = spec.initialAngleDegrees ?? 0;
  const rawAngle2 = spec.finalAngleDegrees ?? rawAngle1;
  const initialNormalAngleDegrees = ref === "plane" ? 90 - rawAngle1 : rawAngle1;
  const finalNormalAngleDegrees = ref === "plane" ? 90 - rawAngle2 : rawAngle2;

  const initialFluxWb = magneticFlux(
    spec.initialFieldT,
    spec.coilAreaM2,
    initialNormalAngleDegrees,
  );
  const finalFluxWb = magneticFlux(
    spec.finalFieldT,
    spec.coilAreaM2,
    finalNormalAngleDegrees,
  );
  const fluxChangeWb = cleanZero(finalFluxWb - initialFluxWb);
  const initialFluxLinkageWbTurns = cleanZero(spec.turns * initialFluxWb);
  const finalFluxLinkageWbTurns = cleanZero(spec.turns * finalFluxWb);
  const fluxLinkageChangeWbTurns = cleanZero(
    finalFluxLinkageWbTurns - initialFluxLinkageWbTurns,
  );
  const signedAverageEmfV = faradayAverageEmf(
    spec.turns,
    initialFluxWb,
    finalFluxWb,
    spec.timeIntervalS,
  );
  const averageEmfMagnitudeV = Math.abs(signedAverageEmfV);

  const lenzOppositionSummary =
    Math.abs(fluxLinkageChangeWbTurns) < 1e-18
      ? "no change in magnetic flux linkage; induced emf is zero"
      : fluxLinkageChangeWbTurns > 0
        ? "induced magnetic field opposes the increase in flux linkage"
        : "induced magnetic field opposes the decrease in flux linkage";

  const quantities: Record<string, number> = {
    turns: spec.turns,
    coilAreaM2: spec.coilAreaM2,
    initialFieldT: spec.initialFieldT,
    finalFieldT: spec.finalFieldT,
    initialAngleDegrees: rawAngle1,
    finalAngleDegrees: rawAngle2,
    timeIntervalS: spec.timeIntervalS,
    initialFluxWb,
    finalFluxWb,
    fluxChangeWb,
    initialFluxLinkageWbTurns,
    finalFluxLinkageWbTurns,
    fluxLinkageChangeWbTurns,
    signedAverageEmfV,
    averageEmfMagnitudeV,
  };

  let averageInducedCurrentA: number | undefined;
  let inducedChargeC: number | undefined;
  if (spec.coilResistanceOhm !== undefined) {
    averageInducedCurrentA = averageEmfMagnitudeV / spec.coilResistanceOhm;
    inducedChargeC =
      Math.abs(fluxLinkageChangeWbTurns) / spec.coilResistanceOhm;
    quantities.coilResistanceOhm = spec.coilResistanceOhm;
    quantities.averageInducedCurrentA = averageInducedCurrentA;
    quantities.inducedChargeC = inducedChargeC;
  }

  return {
    kind: "flux-faraday",
    initialNormalAngleDegrees,
    finalNormalAngleDegrees,
    initialFluxWb,
    finalFluxWb,
    fluxChangeWb,
    initialFluxLinkageWbTurns,
    finalFluxLinkageWbTurns,
    fluxLinkageChangeWbTurns,
    signedAverageEmfV,
    averageEmfMagnitudeV,
    averageInducedCurrentA,
    inducedChargeC,
    lenzOppositionSummary,
    quantities,
  };
}

export function solveMotionalEmfRails(
  spec: MotionalEmfRailsSpec,
): MotionalEmfRailsSolution {
  const rodDirection = spec.rodDirection ?? "right";
  const rodResistance = spec.rodResistanceOhm ?? 0;
  const totalResistanceOhm = spec.loadResistanceOhm + rodResistance;
  const emfV = motionalEmf(
    spec.magneticFieldT,
    spec.rodSpeedMs,
    spec.railSeparationM,
  );
  const inducedCurrentA = emfV / totalResistanceOhm;
  const terminalVoltageV = inducedCurrentA * spec.loadResistanceOhm;
  const brakingForceN = magneticBrakingForce(
    spec.magneticFieldT,
    spec.railSeparationM,
    spec.rodSpeedMs,
    totalResistanceOhm,
  );
  const mechanicalPowerW = brakingForceN * spec.rodSpeedMs;
  const electricalPowerW = inducedCurrentA ** 2 * totalResistanceOhm;

  // Right-handed frame (+x right, +y up, +z out-of-page):
  // Carrier Lorentz force y-component is F_y = q * (-v_x * B_z).
  const vxSign = rodDirection === "right" ? 1 : -1;
  const bzSign = spec.fieldDirection === "out-of-page" ? 1 : -1;
  const positiveCarrierForceYSign = -vxSign * bzSign;
  const higherPotentialEnd =
    positiveCarrierForceYSign > 0 ? "top" : "bottom";
  // Resistor closes the left end of the rails while the rod is on the right:
  // Top-positive drives conventional current left along the top rail -> counterclockwise.
  const inducedCurrentDirection =
    higherPotentialEnd === "top" ? "counterclockwise" : "clockwise";
  const magneticForceDirection = rodDirection === "right" ? "left" : "right";

  return {
    kind: "motional-emf-rails",
    totalResistanceOhm,
    motionalEmfV: emfV,
    inducedCurrentA,
    terminalVoltageV,
    magneticBrakingForceN: brakingForceN,
    mechanicalPowerW,
    electricalPowerW,
    higherPotentialEnd,
    inducedCurrentDirection,
    magneticForceDirection,
    quantities: {
      magneticFieldT: spec.magneticFieldT,
      railSeparationM: spec.railSeparationM,
      rodSpeedMs: spec.rodSpeedMs,
      loadResistanceOhm: spec.loadResistanceOhm,
      rodResistanceOhm: rodResistance,
      totalResistanceOhm,
      motionalEmfV: emfV,
      inducedCurrentA,
      terminalVoltageV,
      magneticBrakingForceN: brakingForceN,
      mechanicalPowerW,
      electricalPowerW,
    },
  };
}

export function solveAcGenerator(spec: AcGeneratorSpec): AcGeneratorSolution {
  const angularSpeedRadS =
    spec.angularSpeedRadS ?? 2 * Math.PI * spec.frequencyHz!;
  const frequencyHz = spec.frequencyHz ?? angularSpeedRadS / (2 * Math.PI);
  const periodS = 1 / frequencyHz;
  const phase0 = spec.initialPhaseRad ?? 0;

  const peakFluxWb = spec.magneticFieldT * spec.coilAreaM2;
  const peakFluxLinkageWbTurns = spec.turns * peakFluxWb;
  const peakEmfV = acPeakEmf(
    spec.turns,
    spec.magneticFieldT,
    spec.coilAreaM2,
    angularSpeedRadS,
  );
  const peakToPeakEmfV = 2 * peakEmfV;
  const rmsVoltageV = rmsFromPeak(peakEmfV);

  const queryTimeS = spec.queryTimeS ?? periodS / 4;
  const queryPhase = angularSpeedRadS * queryTimeS + phase0;
  const fluxAtQueryWb = cleanZero(peakFluxWb * Math.cos(queryPhase));
  const fluxLinkageAtQueryWbTurns = cleanZero(
    peakFluxLinkageWbTurns * Math.cos(queryPhase),
  );
  const emfAtQueryV = cleanZero(peakEmfV * Math.sin(queryPhase));

  const cyclesShown = spec.cyclesShown ?? 2;
  const endTimeS = cyclesShown * periodS;
  const sampleCount = 241;
  const emf: Point2D[] = [];
  const fluxLinkageCurve: Point2D[] = [];

  for (let i = 0; i < sampleCount; i += 1) {
    const t = (endTimeS * i) / (sampleCount - 1);
    const phi = angularSpeedRadS * t + phase0;
    emf.push({ x: t, y: cleanZero(peakEmfV * Math.sin(phi)) });
    fluxLinkageCurve.push({
      x: t,
      y: cleanZero(peakFluxLinkageWbTurns * Math.cos(phi)),
    });
  }

  const quantities: Record<string, number> = {
    turns: spec.turns,
    coilAreaM2: spec.coilAreaM2,
    magneticFieldT: spec.magneticFieldT,
    angularSpeedRadS,
    frequencyHz,
    periodS,
    peakFluxWb,
    peakFluxLinkageWbTurns,
    peakEmfV,
    peakToPeakEmfV,
    rmsVoltageV,
    queryTimeS,
    fluxAtQueryWb,
    fluxLinkageAtQueryWbTurns,
    emfAtQueryV,
  };

  let peakCurrentA: number | undefined;
  let rmsCurrentA: number | undefined;
  let currentAtQueryA: number | undefined;
  let peakPowerW: number | undefined;
  let meanPowerW: number | undefined;
  let powerAtQueryW: number | undefined;

  if (spec.loadResistanceOhm !== undefined) {
    peakCurrentA = peakEmfV / spec.loadResistanceOhm;
    rmsCurrentA = rmsFromPeak(peakCurrentA);
    currentAtQueryA = cleanZero(emfAtQueryV / spec.loadResistanceOhm);
    peakPowerW = peakEmfV * peakCurrentA;
    meanPowerW = acMeanPower(rmsVoltageV, rmsCurrentA);
    powerAtQueryW = cleanZero(emfAtQueryV * currentAtQueryA);

    quantities.loadResistanceOhm = spec.loadResistanceOhm;
    quantities.peakCurrentA = peakCurrentA;
    quantities.rmsCurrentA = rmsCurrentA;
    quantities.currentAtQueryA = currentAtQueryA;
    quantities.peakPowerW = peakPowerW;
    quantities.meanPowerW = meanPowerW;
    quantities.powerAtQueryW = powerAtQueryW;
  }

  return {
    kind: "ac-generator",
    angularSpeedRadS,
    frequencyHz,
    periodS,
    peakFluxWb,
    peakFluxLinkageWbTurns,
    peakEmfV,
    peakToPeakEmfV,
    rmsVoltageV,
    queryTimeS,
    fluxAtQueryWb,
    fluxLinkageAtQueryWbTurns,
    emfAtQueryV,
    peakCurrentA,
    rmsCurrentA,
    currentAtQueryA,
    peakPowerW,
    meanPowerW,
    powerAtQueryW,
    curves: {
      emf,
      fluxLinkage: fluxLinkageCurve,
    },
    quantities,
  };
}

export function solveTransformer(spec: TransformerSpec): TransformerSolution {
  const efficiency = spec.efficiency ?? 1;
  const turnsRatio = spec.secondaryTurns / spec.primaryTurns;
  const classification =
    spec.secondaryTurns > spec.primaryTurns
      ? "step-up"
      : spec.secondaryTurns < spec.primaryTurns
        ? "step-down"
        : "isolation";

  const secondaryVoltageRmsV = transformerSecondaryVoltage(
    spec.primaryVoltageRmsV,
    spec.primaryTurns,
    spec.secondaryTurns,
  );
  const primaryVoltagePeakV = spec.primaryVoltageRmsV * Math.SQRT2;
  const secondaryVoltagePeakV = secondaryVoltageRmsV * Math.SQRT2;

  const quantities: Record<string, number> = {
    primaryVoltageRmsV: spec.primaryVoltageRmsV,
    primaryVoltagePeakV,
    primaryTurns: spec.primaryTurns,
    secondaryTurns: spec.secondaryTurns,
    turnsRatio,
    efficiency,
    secondaryVoltageRmsV,
    secondaryVoltagePeakV,
  };
  if (spec.supplyFrequencyHz !== undefined) {
    quantities.supplyFrequencyHz = spec.supplyFrequencyHz;
  }

  let secondaryCurrentRmsA: number | undefined;
  let primaryCurrentRmsA: number | undefined;
  let loadResistanceOhm: number | undefined;
  let inputPowerW: number | undefined;
  let outputPowerW: number | undefined;
  let powerLossW: number | undefined;

  if (
    spec.secondaryCurrentRmsA !== undefined ||
    spec.loadResistanceOhm !== undefined
  ) {
    secondaryCurrentRmsA =
      spec.secondaryCurrentRmsA ??
      secondaryVoltageRmsV / spec.loadResistanceOhm!;
    loadResistanceOhm =
      spec.loadResistanceOhm ?? secondaryVoltageRmsV / secondaryCurrentRmsA;
    outputPowerW = secondaryVoltageRmsV * secondaryCurrentRmsA;
    inputPowerW = outputPowerW / efficiency;
    powerLossW = cleanZero(Math.max(0, inputPowerW - outputPowerW));
    primaryCurrentRmsA = inputPowerW / spec.primaryVoltageRmsV;

    quantities.secondaryCurrentRmsA = secondaryCurrentRmsA;
    quantities.primaryCurrentRmsA = primaryCurrentRmsA;
    quantities.loadResistanceOhm = loadResistanceOhm;
    quantities.outputPowerW = outputPowerW;
    quantities.inputPowerW = inputPowerW;
    quantities.powerLossW = powerLossW;
  }

  return {
    kind: "transformer",
    classification,
    turnsRatio,
    efficiency,
    primaryVoltageRmsV: spec.primaryVoltageRmsV,
    primaryVoltagePeakV,
    secondaryVoltageRmsV,
    secondaryVoltagePeakV,
    secondaryCurrentRmsA,
    primaryCurrentRmsA,
    loadResistanceOhm,
    inputPowerW,
    outputPowerW,
    powerLossW,
    quantities,
  };
}
