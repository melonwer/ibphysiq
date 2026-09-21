export const COULOMB_CONSTANT = 8.99e9;
export const GRAVITATIONAL_CONSTANT = 6.67e-11;
export const ELEMENTARY_CHARGE = 1.6e-19;
export const ELECTRON_MASS = 9.11e-31;
export const PROTON_MASS = 1.67e-27;

export interface PointCharge1D {
  positionM: number;
  chargeC: number;
}

export interface PointMass1D {
  positionM: number;
  massKg: number;
}

function finite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
}

function positive(name: string, value: number): void {
  finite(name, value);
  if (value <= 0) throw new Error(`${name} must be positive`);
}

function signedInverseSquare(observationM: number, sourceM: number): number {
  const displacement = observationM - sourceM;
  if (Math.abs(displacement) < 1e-12) {
    throw new Error("Field is undefined at a point source");
  }
  return Math.sign(displacement) / displacement ** 2;
}

export function electricField1D(
  observationM: number,
  sources: readonly PointCharge1D[],
): number {
  finite("Observation position", observationM);
  if (sources.length === 0) throw new Error("Electric field needs a source");
  return sources.reduce((total, source, index) => {
    finite(`Charge ${index + 1} position`, source.positionM);
    finite(`Charge ${index + 1}`, source.chargeC);
    if (source.chargeC === 0) throw new Error("Point charge cannot be zero");
    return (
      total +
      COULOMB_CONSTANT *
        source.chargeC *
        signedInverseSquare(observationM, source.positionM)
    );
  }, 0);
}

export function electricPotential1D(
  observationM: number,
  sources: readonly PointCharge1D[],
): number {
  finite("Observation position", observationM);
  if (sources.length === 0)
    throw new Error("Electric potential needs a source");
  return sources.reduce((total, source, index) => {
    finite(`Charge ${index + 1} position`, source.positionM);
    finite(`Charge ${index + 1}`, source.chargeC);
    const distance = Math.abs(observationM - source.positionM);
    if (distance < 1e-12) {
      throw new Error("Potential is undefined at a point source");
    }
    return total + (COULOMB_CONSTANT * source.chargeC) / distance;
  }, 0);
}

export function gravitationalField1D(
  observationM: number,
  sources: readonly PointMass1D[],
): number {
  finite("Observation position", observationM);
  if (sources.length === 0)
    throw new Error("Gravitational field needs a source");
  return sources.reduce((total, source, index) => {
    finite(`Mass ${index + 1} position`, source.positionM);
    positive(`Mass ${index + 1}`, source.massKg);
    return (
      total -
      GRAVITATIONAL_CONSTANT *
        source.massKg *
        signedInverseSquare(observationM, source.positionM)
    );
  }, 0);
}

export function fieldMagnitudeFromPotentialDifference(
  potentialDifferencePerMass: number,
  distanceM: number,
): number {
  finite("Potential difference per unit mass", potentialDifferencePerMass);
  positive("Distance", distanceM);
  return Math.abs(potentialDifferencePerMass) / distanceM;
}

export function uniformElectricField(
  potentialDifferenceV: number,
  separationM: number,
): number {
  positive("Potential difference", potentialDifferenceV);
  positive("Plate separation", separationM);
  return potentialDifferenceV / separationM;
}

export function accelerationInElectricField(
  chargeC: number,
  massKg: number,
  fieldNC: number,
): number {
  finite("Particle charge", chargeC);
  if (chargeC === 0) throw new Error("Particle charge cannot be zero");
  positive("Particle mass", massKg);
  finite("Electric field", fieldNC);
  return (chargeC * fieldNC) / massKg;
}

export function acceleratingPotentialFromSpeed(
  massKg: number,
  chargeMagnitudeC: number,
  speedMs: number,
): number {
  positive("Particle mass", massKg);
  positive("Charge magnitude", chargeMagnitudeC);
  positive("Speed", speedMs);
  return (massKg * speedMs ** 2) / (2 * chargeMagnitudeC);
}

export function timeFromRestAcrossDistance(
  distanceM: number,
  accelerationMagnitudeMs2: number,
): number {
  positive("Distance", distanceM);
  positive("Acceleration magnitude", accelerationMagnitudeMs2);
  return Math.sqrt((2 * distanceM) / accelerationMagnitudeMs2);
}

export function displacementUnderConstantAcceleration(
  accelerationMs2: number,
  timeS: number,
  initialVelocityMs = 0,
): number {
  finite("Acceleration", accelerationMs2);
  if (!Number.isFinite(timeS) || timeS < 0) {
    throw new Error("Time must be non-negative and finite");
  }
  finite("Initial velocity", initialVelocityMs);
  return initialVelocityMs * timeS + 0.5 * accelerationMs2 * timeS ** 2;
}

export function zeroFieldFractionBetweenLikeCharges(
  leftMagnitude: number,
  rightMagnitude: number,
): number {
  positive("Left charge magnitude", leftMagnitude);
  positive("Right charge magnitude", rightMagnitude);
  const leftRoot = Math.sqrt(leftMagnitude);
  const rightRoot = Math.sqrt(rightMagnitude);
  return leftRoot / (leftRoot + rightRoot);
}

export function magnitudeRatioFromZeroFieldFraction(
  fractionFromLeft: number,
): number {
  if (
    !Number.isFinite(fractionFromLeft) ||
    fractionFromLeft <= 0 ||
    fractionFromLeft >= 1
  ) {
    throw new Error("Zero-field fraction must lie strictly between 0 and 1");
  }
  return ((1 - fractionFromLeft) / fractionFromLeft) ** 2;
}

export function chargeScaleFromField(
  fieldNC: number,
  termsPerCoulomb: readonly number[],
): number {
  positive("Field magnitude", Math.abs(fieldNC));
  if (termsPerCoulomb.length === 0) {
    throw new Error("Charge-scale calculation needs field terms");
  }
  termsPerCoulomb.forEach((term, index) =>
    finite(`Field term ${index + 1}`, term),
  );
  const total = termsPerCoulomb.reduce((sum, term) => sum + term, 0);
  if (Math.abs(total) < 1e-18) throw new Error("Field terms cancel exactly");
  return fieldNC / total;
}
