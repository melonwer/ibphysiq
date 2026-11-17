import { Point2D, VisualValidationIssue } from "../types";
import {
  BainbridgeSpectrometerSolution,
  BainbridgeSpectrometerSpec,
  ELEMENTARY_CHARGE_C,
  ElectricDeflectionSolution,
  ElectricDeflectionSpec,
  MagneticCyclotronSolution,
  MagneticCyclotronSpec,
  MagneticFieldPageDirection,
  PlatePolarity,
  VelocitySelectorSolution,
  VelocitySelectorSpec,
} from "./types";

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive and finite`);
  }
}

function assertNonZeroFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value === 0) {
    throw new Error(`${name} must be non-zero and finite`);
  }
}

function cleanZero(value: number): number {
  return Object.is(value, -0) || Math.abs(value) < 1e-24 ? 0 : value;
}

export function signedMagneticBz(
  magnitudeT: number,
  direction: MagneticFieldPageDirection,
): number {
  assertPositiveFinite("Magnetic field magnitude", magnitudeT);
  return direction === "out-of-page" ? magnitudeT : -magnitudeT;
}

export function signedPlateElectricFieldY(
  magnitudeVm: number,
  topPlatePolarity: PlatePolarity,
): number {
  assertPositiveFinite("Electric field magnitude", magnitudeVm);
  return topPlatePolarity === "positive" ? -magnitudeVm : magnitudeVm;
}

/**
 * Computes 2D Lorentz magnetic force F = q(v x B) in a right-handed frame
 * (+x right, +y up, +z out-of-page).
 */
export function lorentzMagneticForce2D(
  chargeC: number,
  velocityMs: Point2D,
  magneticFieldT: number,
  fieldDirection: MagneticFieldPageDirection,
): Point2D {
  assertNonZeroFinite("Particle charge", chargeC);
  if (!Number.isFinite(velocityMs.x) || !Number.isFinite(velocityMs.y)) {
    throw new Error("Particle velocity components must be finite");
  }
  const bz = signedMagneticBz(magneticFieldT, fieldDirection);
  return {
    x: cleanZero(chargeC * velocityMs.y * bz),
    y: cleanZero(-chargeC * velocityMs.x * bz),
  };
}

export function speedFromAcceleratingVoltage(
  chargeMagnitudeC: number,
  massKg: number,
  acceleratingVoltageV: number,
): number {
  assertPositiveFinite("Charge magnitude", chargeMagnitudeC);
  assertPositiveFinite("Particle mass", massKg);
  assertPositiveFinite("Accelerating voltage", acceleratingVoltageV);
  return Math.sqrt((2 * chargeMagnitudeC * acceleratingVoltageV) / massKg);
}

export function cyclotronRadius(
  massKg: number,
  speedMs: number,
  chargeMagnitudeC: number,
  magneticFieldT: number,
): number {
  assertPositiveFinite("Particle mass", massKg);
  assertPositiveFinite("Particle speed", speedMs);
  assertPositiveFinite("Charge magnitude", chargeMagnitudeC);
  assertPositiveFinite("Magnetic field", magneticFieldT);
  return (massKg * speedMs) / (chargeMagnitudeC * magneticFieldT);
}

export function cyclotronPeriod(
  massKg: number,
  chargeMagnitudeC: number,
  magneticFieldT: number,
): number {
  assertPositiveFinite("Particle mass", massKg);
  assertPositiveFinite("Charge magnitude", chargeMagnitudeC);
  assertPositiveFinite("Magnetic field", magneticFieldT);
  return (2 * Math.PI * massKg) / (chargeMagnitudeC * magneticFieldT);
}

export function cyclotronFrequency(
  massKg: number,
  chargeMagnitudeC: number,
  magneticFieldT: number,
): number {
  return 1 / cyclotronPeriod(massKg, chargeMagnitudeC, magneticFieldT);
}

export function selectedVelocity(
  electricFieldVm: number,
  magneticFieldT: number,
): number {
  assertPositiveFinite("Electric field", electricFieldVm);
  assertPositiveFinite("Magnetic field", magneticFieldT);
  return electricFieldVm / magneticFieldT;
}

export function bainbridgeRadius(
  massKg: number,
  chargeMagnitudeC: number,
  selectorElectricFieldVm: number,
  selectorMagneticFieldT: number,
  deflectionMagneticFieldT: number,
): number {
  const v = selectedVelocity(selectorElectricFieldVm, selectorMagneticFieldT);
  return cyclotronRadius(massKg, v, chargeMagnitudeC, deflectionMagneticFieldT);
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

function addNonZeroChargeIssue(
  issues: VisualValidationIssue[],
  chargeC: number,
): void {
  if (!Number.isFinite(chargeC) || chargeC === 0) {
    issues.push({
      code: "INVALID_CHARGE",
      message: "Particle charge must be finite and non-zero",
      path: "chargeC",
    });
  }
}

export function validateElectricDeflection(
  spec: ElectricDeflectionSpec,
  issues: VisualValidationIssue[],
): void {
  addNonZeroChargeIssue(issues, spec.chargeC);
  addPositiveIssue(issues, "massKg", "Particle mass", spec.massKg);
  addPositiveIssue(
    issues,
    "initialSpeedMs",
    "Initial horizontal speed",
    spec.initialSpeedMs,
  );
  addPositiveIssue(issues, "plateLengthM", "Plate length", spec.plateLengthM);
  addPositiveIssue(
    issues,
    "plateSeparationM",
    "Plate separation",
    spec.plateSeparationM,
  );
  addPositiveIssue(
    issues,
    "plateVoltageV",
    "Plate potential difference",
    spec.plateVoltageV,
  );
  if (
    spec.topPlatePolarity !== undefined &&
    spec.topPlatePolarity !== "positive" &&
    spec.topPlatePolarity !== "negative"
  ) {
    issues.push({
      code: "INVALID_PLATE_POLARITY",
      message: "topPlatePolarity must be positive or negative",
      path: "topPlatePolarity",
    });
  }
  if (spec.entryOffsetYM !== undefined) {
    if (!Number.isFinite(spec.entryOffsetYM)) {
      issues.push({
        code: "INVALID_ENTRY_OFFSET",
        message: "entryOffsetYM must be finite",
        path: "entryOffsetYM",
      });
    } else if (
      Number.isFinite(spec.plateSeparationM) &&
      spec.plateSeparationM > 0 &&
      Math.abs(spec.entryOffsetYM) >= spec.plateSeparationM / 2
    ) {
      issues.push({
        code: "ENTRY_OUTSIDE_PLATES",
        message: "entryOffsetYM must lie strictly between the parallel plates",
        path: "entryOffsetYM",
      });
    }
  }
  if (
    spec.driftDistanceAfterPlatesM !== undefined &&
    (!Number.isFinite(spec.driftDistanceAfterPlatesM) ||
      spec.driftDistanceAfterPlatesM < 0)
  ) {
    issues.push({
      code: "INVALID_DRIFT_DISTANCE",
      message: "driftDistanceAfterPlatesM must be non-negative and finite",
      path: "driftDistanceAfterPlatesM",
    });
  }
}

export function validateMagneticCyclotron(
  spec: MagneticCyclotronSpec,
  issues: VisualValidationIssue[],
): void {
  addNonZeroChargeIssue(issues, spec.chargeC);
  addPositiveIssue(issues, "massKg", "Particle mass", spec.massKg);
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
  if (spec.speedMs === undefined && spec.acceleratingVoltageV === undefined) {
    issues.push({
      code: "MISSING_PARTICLE_SPEED",
      message: "Magnetic cyclotron requires either speedMs or acceleratingVoltageV",
      path: "speedMs",
    });
  }
  if (spec.speedMs !== undefined) {
    addPositiveIssue(issues, "speedMs", "Particle speed", spec.speedMs);
  }
  if (spec.acceleratingVoltageV !== undefined) {
    addPositiveIssue(
      issues,
      "acceleratingVoltageV",
      "Accelerating voltage",
      spec.acceleratingVoltageV,
    );
  }
  if (
    spec.speedMs !== undefined &&
    spec.acceleratingVoltageV !== undefined &&
    spec.speedMs > 0 &&
    spec.acceleratingVoltageV > 0 &&
    spec.massKg > 0 &&
    spec.chargeC !== 0
  ) {
    const expectedV = speedFromAcceleratingVoltage(
      Math.abs(spec.chargeC),
      spec.massKg,
      spec.acceleratingVoltageV,
    );
    if (Math.abs(spec.speedMs - expectedV) > 1e-3 * expectedV) {
      issues.push({
        code: "INCONSISTENT_SPEED_VOLTAGE",
        message: "speedMs and acceleratingVoltageV disagree with 1/2 m v^2 = |q| V",
        path: "speedMs",
      });
    }
  }
  if (
    spec.arcSweepDegrees !== undefined &&
    (!Number.isFinite(spec.arcSweepDegrees) ||
      spec.arcSweepDegrees <= 0 ||
      spec.arcSweepDegrees > 360)
  ) {
    issues.push({
      code: "INVALID_ARC_SWEEP",
      message: "arcSweepDegrees must satisfy 0 < arcSweepDegrees <= 360",
      path: "arcSweepDegrees",
    });
  }
}

function selectorFieldsOppose(
  fieldDirection: MagneticFieldPageDirection,
  topPlatePolarity: PlatePolarity,
): boolean {
  return (
    (fieldDirection === "into-page" && topPlatePolarity === "positive") ||
    (fieldDirection === "out-of-page" && topPlatePolarity === "negative")
  );
}

export function validateVelocitySelector(
  spec: VelocitySelectorSpec,
  issues: VisualValidationIssue[],
): void {
  addNonZeroChargeIssue(issues, spec.chargeC);
  addPositiveIssue(issues, "massKg", "Particle mass", spec.massKg);
  addPositiveIssue(
    issues,
    "magneticFieldT",
    "Magnetic field",
    spec.magneticFieldT,
  );
  if (
    spec.electricFieldVm === undefined &&
    (spec.plateVoltageV === undefined || spec.plateSeparationM === undefined)
  ) {
    issues.push({
      code: "MISSING_ELECTRIC_FIELD",
      message:
        "Velocity selector requires electricFieldVm or both plateVoltageV and plateSeparationM",
      path: "electricFieldVm",
    });
  }
  if (spec.electricFieldVm !== undefined) {
    addPositiveIssue(
      issues,
      "electricFieldVm",
      "Electric field",
      spec.electricFieldVm,
    );
  }
  if (spec.plateVoltageV !== undefined) {
    addPositiveIssue(
      issues,
      "plateVoltageV",
      "Plate voltage",
      spec.plateVoltageV,
    );
  }
  if (spec.plateSeparationM !== undefined) {
    addPositiveIssue(
      issues,
      "plateSeparationM",
      "Plate separation",
      spec.plateSeparationM,
    );
  }
  if (
    spec.electricFieldVm !== undefined &&
    spec.plateVoltageV !== undefined &&
    spec.plateSeparationM !== undefined &&
    spec.electricFieldVm > 0 &&
    spec.plateVoltageV > 0 &&
    spec.plateSeparationM > 0
  ) {
    const expectedE = spec.plateVoltageV / spec.plateSeparationM;
    if (Math.abs(spec.electricFieldVm - expectedE) > 1e-3 * expectedE) {
      issues.push({
        code: "INCONSISTENT_ELECTRIC_FIELD",
        message: "electricFieldVm disagrees with plateVoltageV / plateSeparationM",
        path: "electricFieldVm",
      });
    }
  }
  if (
    spec.fieldDirection !== "into-page" &&
    spec.fieldDirection !== "out-of-page"
  ) {
    issues.push({
      code: "INVALID_FIELD_DIRECTION",
      message: "fieldDirection must be into-page or out-of-page",
      path: "fieldDirection",
    });
  } else if (
    spec.topPlatePolarity !== "positive" &&
    spec.topPlatePolarity !== "negative"
  ) {
    issues.push({
      code: "INVALID_PLATE_POLARITY",
      message: "topPlatePolarity must be positive or negative",
      path: "topPlatePolarity",
    });
  } else if (!selectorFieldsOppose(spec.fieldDirection, spec.topPlatePolarity)) {
    issues.push({
      code: "NON_OPPOSING_SELECTOR_FIELDS",
      message:
        "Electric and magnetic forces must oppose for a velocity selector (into-page requires positive top plate; out-of-page requires negative top plate)",
      path: "topPlatePolarity",
    });
  }
  if (spec.particleSpeedMs !== undefined) {
    addPositiveIssue(
      issues,
      "particleSpeedMs",
      "Particle speed",
      spec.particleSpeedMs,
    );
  }
  if (spec.selectorLengthM !== undefined) {
    addPositiveIssue(
      issues,
      "selectorLengthM",
      "Selector length",
      spec.selectorLengthM,
    );
  }
}

export function validateBainbridgeSpectrometer(
  spec: BainbridgeSpectrometerSpec,
  issues: VisualValidationIssue[],
): void {
  addNonZeroChargeIssue(issues, spec.chargeC);
  addPositiveIssue(issues, "massKg", "Primary ion mass", spec.massKg);
  if (spec.comparisonMassKg !== undefined) {
    addPositiveIssue(
      issues,
      "comparisonMassKg",
      "Comparison ion mass",
      spec.comparisonMassKg,
    );
  }
  addPositiveIssue(
    issues,
    "selectorElectricFieldVm",
    "Selector electric field",
    spec.selectorElectricFieldVm,
  );
  addPositiveIssue(
    issues,
    "selectorMagneticFieldT",
    "Selector magnetic field",
    spec.selectorMagneticFieldT,
  );
  if (spec.deflectionMagneticFieldT !== undefined) {
    addPositiveIssue(
      issues,
      "deflectionMagneticFieldT",
      "Deflection magnetic field",
      spec.deflectionMagneticFieldT,
    );
  }
  const defDir = spec.deflectionFieldDirection ?? "into-page";
  if (defDir !== "into-page" && defDir !== "out-of-page") {
    issues.push({
      code: "INVALID_FIELD_DIRECTION",
      message: "deflectionFieldDirection must be into-page or out-of-page",
      path: "deflectionFieldDirection",
    });
  } else if (
    spec.selectorTopPlatePolarity !== undefined &&
    !selectorFieldsOppose(defDir, spec.selectorTopPlatePolarity)
  ) {
    issues.push({
      code: "NON_OPPOSING_SELECTOR_FIELDS",
      message: "selectorTopPlatePolarity must oppose the selector magnetic force",
      path: "selectorTopPlatePolarity",
    });
  }
}

export function solveElectricDeflection(
  spec: ElectricDeflectionSpec,
): ElectricDeflectionSolution {
  const polarity = spec.topPlatePolarity ?? "positive";
  const y0 = spec.entryOffsetYM ?? 0;
  const driftM = spec.driftDistanceAfterPlatesM ?? 0;
  const halfGap = spec.plateSeparationM / 2;

  const electricFieldMagnitudeVm = spec.plateVoltageV / spec.plateSeparationM;
  const electricFieldYVPerM = signedPlateElectricFieldY(
    electricFieldMagnitudeVm,
    polarity,
  );
  const electricForceYN = spec.chargeC * electricFieldYVPerM;
  const accelerationYMs2 = electricForceYN / spec.massKg;
  const deflectionDirection = accelerationYMs2 >= 0 ? "up" : "down";

  const fullTransitS = spec.plateLengthM / spec.initialSpeedMs;
  const unclippedExitY = y0 + 0.5 * accelerationYMs2 * fullTransitS ** 2;
  const wallY = accelerationYMs2 >= 0 ? halfGap : -halfGap;

  let hitsPlate = false;
  let transitTimeS = fullTransitS;
  let exitXM = spec.plateLengthM;
  let exitYM = unclippedExitY;

  if (Math.abs(unclippedExitY) > halfGap + 1e-15) {
    hitsPlate = true;
    transitTimeS = Math.sqrt((2 * (wallY - y0)) / accelerationYMs2);
    exitXM = spec.initialSpeedMs * transitTimeS;
    exitYM = wallY;
  }

  const plateDeflectionYM = exitYM - y0;
  const exitVyMs = accelerationYMs2 * transitTimeS;
  const exitSpeedMs = Math.hypot(spec.initialSpeedMs, exitVyMs);
  const deflectionAngleRadians = Math.atan2(exitVyMs, spec.initialSpeedMs);
  const deflectionAngleDegrees = (deflectionAngleRadians * 180) / Math.PI;
  const kineticEnergyGainJ = 0.5 * spec.massKg * exitVyMs ** 2;
  const screenYM = hitsPlate
    ? exitYM
    : exitYM + exitVyMs * (driftM / spec.initialSpeedMs);

  const trajectory: Point2D[] = [];
  const plateSteps = 80;
  for (let i = 0; i <= plateSteps; i += 1) {
    const t = (transitTimeS * i) / plateSteps;
    trajectory.push({
      x: spec.initialSpeedMs * t,
      y: y0 + 0.5 * accelerationYMs2 * t ** 2,
    });
  }
  if (!hitsPlate && driftM > 0) {
    const driftSteps = 20;
    for (let j = 1; j <= driftSteps; j += 1) {
      const dx = (driftM * j) / driftSteps;
      const dt = dx / spec.initialSpeedMs;
      trajectory.push({
        x: exitXM + dx,
        y: exitYM + exitVyMs * dt,
      });
    }
  }

  return {
    kind: "electric-deflection",
    electricFieldMagnitudeVm,
    electricFieldYVPerM,
    electricForceYN,
    accelerationYMs2,
    hitsPlate,
    transitTimeS,
    exitXM,
    exitYM,
    plateDeflectionYM,
    exitVyMs,
    exitSpeedMs,
    deflectionAngleRadians,
    deflectionAngleDegrees,
    kineticEnergyGainJ,
    screenYM,
    deflectionDirection,
    trajectory,
    quantities: {
      chargeC: spec.chargeC,
      massKg: spec.massKg,
      initialSpeedMs: spec.initialSpeedMs,
      plateLengthM: spec.plateLengthM,
      plateSeparationM: spec.plateSeparationM,
      plateVoltageV: spec.plateVoltageV,
      electricFieldVm: electricFieldMagnitudeVm,
      electricForceMagnitudeN: Math.abs(electricForceYN),
      accelerationMagnitudeMs2: Math.abs(accelerationYMs2),
      transitTimeS,
      exitXM,
      exitYM,
      plateDeflectionYM: Math.abs(plateDeflectionYM),
      signedPlateDeflectionYM: plateDeflectionYM,
      exitVyMs,
      exitSpeedMs,
      deflectionAngleDegrees: Math.abs(deflectionAngleDegrees),
      signedDeflectionAngleDegrees: deflectionAngleDegrees,
      kineticEnergyGainJ,
      screenYM,
    },
  };
}

export function solveMagneticCyclotron(
  spec: MagneticCyclotronSpec,
): MagneticCyclotronSolution {
  const qAbs = Math.abs(spec.chargeC);
  const speedMs =
    spec.speedMs ??
    speedFromAcceleratingVoltage(qAbs, spec.massKg, spec.acceleratingVoltageV!);
  const equivalentAcceleratingVoltageV =
    spec.acceleratingVoltageV ?? (spec.massKg * speedMs ** 2) / (2 * qAbs);

  const initialForce = lorentzMagneticForce2D(
    spec.chargeC,
    { x: speedMs, y: 0 },
    spec.magneticFieldT,
    spec.fieldDirection,
  );
  const magneticForceMagnitudeN = qAbs * speedMs * spec.magneticFieldT;
  const centripetalAccelerationMs2 = magneticForceMagnitudeN / spec.massKg;
  const radiusM = cyclotronRadius(
    spec.massKg,
    speedMs,
    qAbs,
    spec.magneticFieldT,
  );
  const orbitDiameterM = 2 * radiusM;
  const periodS = cyclotronPeriod(spec.massKg, qAbs, spec.magneticFieldT);
  const frequencyHz = 1 / periodS;
  const angularSpeedRadS = (qAbs * spec.magneticFieldT) / spec.massKg;
  const specificChargeCPerKg = qAbs / spec.massKg;
  const kineticEnergyJ = 0.5 * spec.massKg * speedMs ** 2;
  const kineticEnergyEv = kineticEnergyJ / ELEMENTARY_CHARGE_C;

  const sweepDeg = spec.arcSweepDegrees ?? 180;
  const arcTimeS = (sweepDeg / 360) * periodS;

  const ySign = initialForce.y >= 0 ? 1 : -1;
  const initialDeflectionDirection = ySign > 0 ? "up" : "down";
  const rotationSense = ySign > 0 ? "counterclockwise" : "clockwise";

  const steps = 120;
  const sweepRad = (sweepDeg * Math.PI) / 180;
  const trajectory: Point2D[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const alpha = (sweepRad * i) / steps;
    trajectory.push({
      x: cleanZero(radiusM * Math.sin(alpha)),
      y: cleanZero(ySign * radiusM * (1 - Math.cos(alpha))),
    });
  }

  return {
    kind: "magnetic-cyclotron",
    speedMs,
    equivalentAcceleratingVoltageV,
    magneticForceMagnitudeN,
    initialForceYN: initialForce.y,
    centripetalAccelerationMs2,
    cyclotronRadiusM: radiusM,
    orbitDiameterM,
    periodS,
    frequencyHz,
    angularSpeedRadS,
    specificChargeCPerKg,
    kineticEnergyJ,
    kineticEnergyEv,
    magneticWorkDoneJ: 0,
    arcTimeS,
    initialDeflectionDirection,
    rotationSense,
    trajectory,
    quantities: {
      chargeC: spec.chargeC,
      chargeMagnitudeC: qAbs,
      massKg: spec.massKg,
      magneticFieldT: spec.magneticFieldT,
      speedMs,
      acceleratingVoltageV: equivalentAcceleratingVoltageV,
      magneticForceMagnitudeN,
      centripetalAccelerationMs2,
      cyclotronRadiusM: radiusM,
      orbitDiameterM,
      periodS,
      frequencyHz,
      angularSpeedRadS,
      specificChargeCPerKg,
      kineticEnergyJ,
      kineticEnergyEv,
      arcTimeS,
    },
  };
}

export function solveVelocitySelector(
  spec: VelocitySelectorSpec,
): VelocitySelectorSolution {
  const electricFieldMagnitudeVm =
    spec.electricFieldVm ?? spec.plateVoltageV! / spec.plateSeparationM!;
  const electricFieldYVPerM = signedPlateElectricFieldY(
    electricFieldMagnitudeVm,
    spec.topPlatePolarity,
  );
  const selectedSpeedMs = selectedVelocity(
    electricFieldMagnitudeVm,
    spec.magneticFieldT,
  );
  const particleSpeedMs = spec.particleSpeedMs ?? selectedSpeedMs;

  const electricForceYN = spec.chargeC * electricFieldYVPerM;
  const magForce = lorentzMagneticForce2D(
    spec.chargeC,
    { x: particleSpeedMs, y: 0 },
    spec.magneticFieldT,
    spec.fieldDirection,
  );
  const magneticForceYN = magForce.y;
  const netForceYN = cleanZero(electricForceYN + magneticForceYN);
  const initialAccelerationYMs2 = cleanZero(netForceYN / spec.massKg);

  const relativeMismatch =
    Math.abs(particleSpeedMs - selectedSpeedMs) / selectedSpeedMs;
  const outcome =
    relativeMismatch < 1e-9
      ? "undeflected"
      : netForceYN > 0
        ? "deflected-up"
        : "deflected-down";

  const lengthM = spec.selectorLengthM ?? 0.12;
  const trajectory: Point2D[] = [];
  if (outcome === "undeflected") {
    for (let i = 0; i <= 40; i += 1) {
      trajectory.push({ x: (lengthM * i) / 40, y: 0 });
    }
  } else {
    // 4th-order Runge-Kutta integration of Lorentz equation in crossed E and B
    const bz = signedMagneticBz(spec.magneticFieldT, spec.fieldDirection);
    const qOverM = spec.chargeC / spec.massKg;
    const totalTime = lengthM / particleSpeedMs;
    const steps = 120;
    const dt = totalTime / steps;
    let x = 0;
    let y = 0;
    let vx = particleSpeedMs;
    let vy = 0;
    trajectory.push({ x, y });

    const accel = (currVx: number, currVy: number): Point2D => ({
      x: qOverM * currVy * bz,
      y: qOverM * (electricFieldYVPerM - currVx * bz),
    });

    for (let i = 0; i < steps; i += 1) {
      const a1 = accel(vx, vy);
      const k1x = vx;
      const k1y = vy;

      const a2 = accel(vx + 0.5 * dt * a1.x, vy + 0.5 * dt * a1.y);
      const k2x = vx + 0.5 * dt * a1.x;
      const k2y = vy + 0.5 * dt * a1.y;

      const a3 = accel(vx + 0.5 * dt * a2.x, vy + 0.5 * dt * a2.y);
      const k3x = vx + 0.5 * dt * a2.x;
      const k3y = vy + 0.5 * dt * a2.y;

      const a4 = accel(vx + dt * a3.x, vy + dt * a3.y);
      const k4x = vx + dt * a3.x;
      const k4y = vy + dt * a3.y;

      x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
      y += (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
      vx += (dt / 6) * (a1.x + 2 * a2.x + 2 * a3.x + a4.x);
      vy += (dt / 6) * (a1.y + 2 * a2.y + 2 * a3.y + a4.y);
      if (x > lengthM) break;
      trajectory.push({ x, y });
    }
  }

  const quantities: Record<string, number> = {
    chargeC: spec.chargeC,
    massKg: spec.massKg,
    electricFieldVm: electricFieldMagnitudeVm,
    magneticFieldT: spec.magneticFieldT,
    selectedSpeedMs,
    particleSpeedMs,
    electricForceMagnitudeN: Math.abs(electricForceYN),
    magneticForceMagnitudeN: Math.abs(magneticForceYN),
    netForceYN,
    initialAccelerationYMs2,
  };
  if (spec.plateVoltageV !== undefined) {
    quantities.plateVoltageV = spec.plateVoltageV;
  }
  if (spec.plateSeparationM !== undefined) {
    quantities.plateSeparationM = spec.plateSeparationM;
  }

  return {
    kind: "velocity-selector",
    electricFieldMagnitudeVm,
    electricFieldYVPerM,
    selectedSpeedMs,
    particleSpeedMs,
    electricForceYN,
    magneticForceYN,
    netForceYN,
    initialAccelerationYMs2,
    outcome,
    trajectory,
    quantities,
  };
}

function buildSemicircle(radiusM: number, ySign: 1 | -1): Point2D[] {
  const points: Point2D[] = [];
  const steps = 90;
  for (let i = 0; i <= steps; i += 1) {
    const alpha = (Math.PI * i) / steps;
    points.push({
      x: cleanZero(radiusM * Math.sin(alpha)),
      y: cleanZero(ySign * radiusM * (1 - Math.cos(alpha))),
    });
  }
  return points;
}

export function solveBainbridgeSpectrometer(
  spec: BainbridgeSpectrometerSpec,
): BainbridgeSpectrometerSolution {
  const qAbs = Math.abs(spec.chargeC);
  const selectedSpeedMs = selectedVelocity(
    spec.selectorElectricFieldVm,
    spec.selectorMagneticFieldT,
  );
  const deflectionMagneticFieldT =
    spec.deflectionMagneticFieldT ?? spec.selectorMagneticFieldT;
  const defDir = spec.deflectionFieldDirection ?? "into-page";

  const entryForce = lorentzMagneticForce2D(
    spec.chargeC,
    { x: selectedSpeedMs, y: 0 },
    deflectionMagneticFieldT,
    defDir,
  );
  const ySign: 1 | -1 = entryForce.y >= 0 ? 1 : -1;
  const deflectionDirection = ySign > 0 ? "up" : "down";

  const primaryRadiusM = cyclotronRadius(
    spec.massKg,
    selectedSpeedMs,
    qAbs,
    deflectionMagneticFieldT,
  );
  const primaryDiameterM = 2 * primaryRadiusM;
  const primarySpecificChargeCPerKg = qAbs / spec.massKg;
  const primaryKineticEnergyJ = 0.5 * spec.massKg * selectedSpeedMs ** 2;
  const primaryTrajectory = buildSemicircle(primaryRadiusM, ySign);

  const quantities: Record<string, number> = {
    chargeC: spec.chargeC,
    chargeMagnitudeC: qAbs,
    massKg: spec.massKg,
    selectorElectricFieldVm: spec.selectorElectricFieldVm,
    selectorMagneticFieldT: spec.selectorMagneticFieldT,
    deflectionMagneticFieldT,
    selectedSpeedMs,
    primaryRadiusM,
    primaryDiameterM,
    primarySpecificChargeCPerKg,
    primaryKineticEnergyJ,
  };

  let comparisonRadiusM: number | undefined;
  let comparisonDiameterM: number | undefined;
  let strikeSeparationM: number | undefined;
  let massRatio: number | undefined;
  let comparisonTrajectory: Point2D[] | undefined;

  if (spec.comparisonMassKg !== undefined) {
    comparisonRadiusM = cyclotronRadius(
      spec.comparisonMassKg,
      selectedSpeedMs,
      qAbs,
      deflectionMagneticFieldT,
    );
    comparisonDiameterM = 2 * comparisonRadiusM;
    strikeSeparationM = Math.abs(comparisonDiameterM - primaryDiameterM);
    massRatio = spec.comparisonMassKg / spec.massKg;
    comparisonTrajectory = buildSemicircle(comparisonRadiusM, ySign);

    quantities.comparisonMassKg = spec.comparisonMassKg;
    quantities.comparisonRadiusM = comparisonRadiusM;
    quantities.comparisonDiameterM = comparisonDiameterM;
    quantities.strikeSeparationM = strikeSeparationM;
    quantities.massRatio = massRatio;
  }

  return {
    kind: "bainbridge-mass-spectrometer",
    selectedSpeedMs,
    deflectionMagneticFieldT,
    primaryRadiusM,
    primaryDiameterM,
    primarySpecificChargeCPerKg,
    primaryKineticEnergyJ,
    comparisonRadiusM,
    comparisonDiameterM,
    strikeSeparationM,
    massRatio,
    deflectionDirection,
    primaryTrajectory,
    comparisonTrajectory,
    quantities,
  };
}
