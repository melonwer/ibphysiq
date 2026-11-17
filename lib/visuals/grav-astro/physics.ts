import { Point2D } from "@/lib/visuals/types";
import {
  DEFAULT_HUBBLE_CONSTANT_KMS_MPC,
  GRAVITATIONAL_CONSTANT,
  LIGHT_YEARS_PER_PARSEC,
  PARSEC_M,
  SECONDS_PER_JULIAN_YEAR,
  SOLAR_LUMINOSITY_W,
  SOLAR_RADIUS_M,
  SPEED_OF_LIGHT_MS,
  STANDARD_GRAVITY_MS2,
  STEFAN_BOLTZMANN_WM2K4,
  WIEN_DISPLACEMENT_MK,
} from "./constants";
import {
  BankedFrictionDirection,
  GravAstroScenario,
  GravAstroSolution,
  HrRegion,
  SolvedHrStar,
  SpectralClass,
} from "./types";
import { validateGravAstroScenario } from "./validation";

export function centripetalAccelerationFromSpeed(
  speedMs: number,
  radiusM: number,
): number {
  if (!Number.isFinite(speedMs) || speedMs < 0) {
    throw new Error("Speed must be finite and non-negative");
  }
  if (!Number.isFinite(radiusM) || radiusM <= 0) {
    throw new Error("Radius must be finite and positive");
  }
  return speedMs ** 2 / radiusM;
}

export function centripetalAccelerationFromAngularSpeed(
  angularSpeedRadS: number,
  radiusM: number,
): number {
  if (!Number.isFinite(angularSpeedRadS) || angularSpeedRadS < 0) {
    throw new Error("Angular speed must be finite and non-negative");
  }
  if (!Number.isFinite(radiusM) || radiusM <= 0) {
    throw new Error("Radius must be finite and positive");
  }
  return angularSpeedRadS ** 2 * radiusM;
}

export function gravitationalFieldStrengthSphere(
  centralMassKg: number,
  sphereRadiusM: number,
  radialDistanceM: number,
  G = GRAVITATIONAL_CONSTANT,
): number {
  if (
    !Number.isFinite(centralMassKg) ||
    centralMassKg <= 0 ||
    !Number.isFinite(sphereRadiusM) ||
    sphereRadiusM <= 0 ||
    !Number.isFinite(radialDistanceM) ||
    radialDistanceM < 0 ||
    !Number.isFinite(G) ||
    G <= 0
  ) {
    throw new Error("Invalid sphere gravitational field parameters");
  }
  if (radialDistanceM < sphereRadiusM) {
    return (G * centralMassKg * radialDistanceM) / sphereRadiusM ** 3;
  }
  return (G * centralMassKg) / radialDistanceM ** 2;
}

export function gravitationalPotentialSphere(
  centralMassKg: number,
  sphereRadiusM: number,
  radialDistanceM: number,
  G = GRAVITATIONAL_CONSTANT,
): number {
  if (
    !Number.isFinite(centralMassKg) ||
    centralMassKg <= 0 ||
    !Number.isFinite(sphereRadiusM) ||
    sphereRadiusM <= 0 ||
    !Number.isFinite(radialDistanceM) ||
    radialDistanceM < 0 ||
    !Number.isFinite(G) ||
    G <= 0
  ) {
    throw new Error("Invalid sphere gravitational potential parameters");
  }
  if (radialDistanceM < sphereRadiusM) {
    return (
      -((G * centralMassKg) / (2 * sphereRadiusM ** 3)) *
      (3 * sphereRadiusM ** 2 - radialDistanceM ** 2)
    );
  }
  return -(G * centralMassKg) / radialDistanceM;
}

export function circularOrbitalSpeed(
  centralMassKg: number,
  orbitRadiusM: number,
  G = GRAVITATIONAL_CONSTANT,
): number {
  if (
    !Number.isFinite(centralMassKg) ||
    centralMassKg <= 0 ||
    !Number.isFinite(orbitRadiusM) ||
    orbitRadiusM <= 0 ||
    !Number.isFinite(G) ||
    G <= 0
  ) {
    throw new Error("Invalid circular orbital speed parameters");
  }
  return Math.sqrt((G * centralMassKg) / orbitRadiusM);
}

export function escapeSpeed(
  centralMassKg: number,
  radialDistanceM: number,
  G = GRAVITATIONAL_CONSTANT,
): number {
  if (
    !Number.isFinite(centralMassKg) ||
    centralMassKg <= 0 ||
    !Number.isFinite(radialDistanceM) ||
    radialDistanceM <= 0 ||
    !Number.isFinite(G) ||
    G <= 0
  ) {
    throw new Error("Invalid escape speed parameters");
  }
  return Math.sqrt((2 * G * centralMassKg) / radialDistanceM);
}

export function keplerOrbitalPeriod(
  centralMassKg: number,
  orbitRadiusM: number,
  G = GRAVITATIONAL_CONSTANT,
): number {
  if (
    !Number.isFinite(centralMassKg) ||
    centralMassKg <= 0 ||
    !Number.isFinite(orbitRadiusM) ||
    orbitRadiusM <= 0 ||
    !Number.isFinite(G) ||
    G <= 0
  ) {
    throw new Error("Invalid Kepler orbital period parameters");
  }
  return 2 * Math.PI * Math.sqrt(orbitRadiusM ** 3 / (G * centralMassKg));
}

export function stellarRadiusFromLuminosityAndWien(
  luminosityW: number,
  peakWavelengthM: number,
  wienConstantMK = WIEN_DISPLACEMENT_MK,
  sigmaWm2K4 = STEFAN_BOLTZMANN_WM2K4,
): { surfaceTempK: number; stellarRadiusM: number } {
  if (
    !Number.isFinite(luminosityW) ||
    luminosityW <= 0 ||
    !Number.isFinite(peakWavelengthM) ||
    peakWavelengthM <= 0 ||
    !Number.isFinite(wienConstantMK) ||
    wienConstantMK <= 0 ||
    !Number.isFinite(sigmaWm2K4) ||
    sigmaWm2K4 <= 0
  ) {
    throw new Error("Invalid stellar radiation parameters");
  }
  const surfaceTempK = wienConstantMK / peakWavelengthM;
  const stellarRadiusM = Math.sqrt(
    luminosityW / (4 * Math.PI * sigmaWm2K4 * surfaceTempK ** 4),
  );
  return { surfaceTempK, stellarRadiusM };
}

export function classifySpectralType(surfaceTempK: number): SpectralClass {
  if (surfaceTempK >= 30000) return "O";
  if (surfaceTempK >= 10000) return "B";
  if (surfaceTempK >= 7500) return "A";
  if (surfaceTempK >= 6000) return "F";
  if (surfaceTempK >= 5200) return "G";
  if (surfaceTempK >= 3700) return "K";
  return "M";
}

export function classifyHrRegion(
  surfaceTempK: number,
  luminositySolar: number,
  radiusSolar: number,
): HrRegion {
  if (surfaceTempK >= 6000 && luminositySolar <= 0.05 && radiusSolar <= 0.08) {
    return "white-dwarf";
  }
  if (luminositySolar >= 5000 && radiusSolar >= 25) {
    return "supergiant";
  }
  if (surfaceTempK <= 5600 && luminositySolar >= 8 && radiusSolar >= 4) {
    return "red-giant";
  }
  return "main-sequence";
}

function planckRelativeSpectralRadiance(
  wavelengthM: number,
  tempK: number,
): number {
  const hcOverKb = 0.01438776877;
  const exponent = hcOverKb / (wavelengthM * tempK);
  if (exponent > 600) return 0;
  return 1 / (wavelengthM ** 5 * Math.expm1(exponent));
}

export function solveGravAstroScenario(
  spec: GravAstroScenario,
): GravAstroSolution {
  const validation = validateGravAstroScenario(spec);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join("; "));
  }

  switch (spec.kind) {
    case "conical-pendulum": {
      const g = spec.gravityMs2 ?? STANDARD_GRAVITY_MS2;
      const theta = (spec.semiVerticalAngleDeg * Math.PI) / 180;
      const orbitRadiusM = spec.stringLengthM * Math.sin(theta);
      const verticalHeightM = spec.stringLengthM * Math.cos(theta);
      const weightN = spec.massKg * g;
      const tensionN = weightN / Math.cos(theta);
      const centripetalForceN = weightN * Math.tan(theta);
      const centripetalAccelMs2 = g * Math.tan(theta);
      const linearSpeedMs = Math.sqrt(centripetalAccelMs2 * orbitRadiusM);
      const angularSpeedRadS = Math.sqrt(g / verticalHeightM);
      const periodS = (2 * Math.PI) / angularSpeedRadS;
      const frequencyHz = 1 / periodS;

      const details = {
        orbitRadiusM,
        verticalHeightM,
        weightN,
        tensionN,
        centripetalForceN,
        centripetalAccelMs2,
        linearSpeedMs,
        angularSpeedRadS,
        periodS,
        frequencyHz,
      };
      return {
        kind: "conical-pendulum",
        quantities: {
          massKg: spec.massKg,
          stringLengthM: spec.stringLengthM,
          semiVerticalAngleDeg: spec.semiVerticalAngleDeg,
          gravityMs2: g,
          ...details,
        },
        classifications: {},
        details,
      };
    }

    case "flat-curve": {
      const g = spec.gravityMs2 ?? STANDARD_GRAVITY_MS2;
      const weightN = spec.massKg * g;
      const normalForceN = weightN;
      const centripetalAccelMs2 = spec.speedMs ** 2 / spec.radiusM;
      const angularSpeedRadS = spec.speedMs / spec.radiusM;
      const periodS = (2 * Math.PI * spec.radiusM) / spec.speedMs;
      const centripetalForceN = spec.massKg * centripetalAccelMs2;
      const maxStaticFrictionN = spec.staticFrictionCoeff * normalForceN;
      const maxSafeSpeedMs = Math.sqrt(
        spec.staticFrictionCoeff * g * spec.radiusM,
      );
      const minRequiredFrictionCoeff = centripetalAccelMs2 / g;
      const skids = spec.speedMs > maxSafeSpeedMs + 1e-9;
      const frictionForceN = skids ? maxStaticFrictionN : centripetalForceN;

      const details = {
        weightN,
        normalForceN,
        centripetalAccelMs2,
        angularSpeedRadS,
        periodS,
        centripetalForceN,
        maxStaticFrictionN,
        frictionForceN,
        maxSafeSpeedMs,
        minRequiredFrictionCoeff,
        skids,
      };
      return {
        kind: "flat-curve",
        quantities: {
          massKg: spec.massKg,
          radiusM: spec.radiusM,
          speedMs: spec.speedMs,
          staticFrictionCoeff: spec.staticFrictionCoeff,
          gravityMs2: g,
          weightN,
          normalForceN,
          centripetalAccelMs2,
          angularSpeedRadS,
          periodS,
          centripetalForceN,
          maxStaticFrictionN,
          frictionForceN,
          maxSafeSpeedMs,
          minRequiredFrictionCoeff,
        },
        classifications: { skids },
        details,
      };
    }

    case "banked-curve": {
      const g = spec.gravityMs2 ?? STANDARD_GRAVITY_MS2;
      const theta = (spec.bankAngleDeg * Math.PI) / 180;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const tanT = Math.tan(theta);
      const mu = spec.staticFrictionCoeff;

      const idealSpeedMs = Math.sqrt(g * spec.radiusM * tanT);
      const actualSpeedMs = spec.speedMs ?? idealSpeedMs;
      const centripetalAccelMs2 = actualSpeedMs ** 2 / spec.radiusM;
      const angularSpeedRadS = actualSpeedMs / spec.radiusM;
      const centripetalForceN = spec.massKg * centripetalAccelMs2;
      const weightN = spec.massKg * g;
      const normalForceN =
        spec.massKg * (g * cosT + centripetalAccelMs2 * sinT);
      const rawSignedSlopeFriction =
        spec.massKg * (centripetalAccelMs2 * cosT - g * sinT);
      const threshold = 1e-9 * Math.max(1, weightN);

      let frictionDirection: BankedFrictionDirection;
      let signedSlopeFrictionN: number;
      if (Math.abs(rawSignedSlopeFriction) <= threshold) {
        frictionDirection = "none";
        signedSlopeFrictionN = 0;
      } else if (rawSignedSlopeFriction > 0) {
        frictionDirection = "down-slope";
        signedSlopeFrictionN = rawSignedSlopeFriction;
      } else {
        frictionDirection = "up-slope";
        signedSlopeFrictionN = rawSignedSlopeFriction;
      }
      const frictionForceN = Math.abs(signedSlopeFrictionN);
      const maxStaticFrictionN = mu * normalForceN;

      const minSafeSpeedMs =
        sinT - mu * cosT <= 0
          ? 0
          : Math.sqrt((g * spec.radiusM * (sinT - mu * cosT)) / (cosT + mu * sinT));
      const maxSafeSpeedMs =
        cosT - mu * sinT <= 1e-12
          ? null
          : Math.sqrt((g * spec.radiusM * (sinT + mu * cosT)) / (cosT - mu * sinT));

      const withinSafeSpeedRange =
        frictionForceN <= maxStaticFrictionN + 1e-6 * Math.max(1, normalForceN);

      const quantities: Record<string, number> = {
        massKg: spec.massKg,
        radiusM: spec.radiusM,
        bankAngleDeg: spec.bankAngleDeg,
        staticFrictionCoeff: mu,
        gravityMs2: g,
        speedMs: actualSpeedMs,
        actualSpeedMs,
        idealSpeedMs,
        weightN,
        normalForceN,
        centripetalAccelMs2,
        angularSpeedRadS,
        centripetalForceN,
        signedSlopeFrictionN,
        frictionForceN,
        maxStaticFrictionN,
        minSafeSpeedMs,
      };
      if (maxSafeSpeedMs !== null) {
        quantities.maxSafeSpeedMs = maxSafeSpeedMs;
      }

      return {
        kind: "banked-curve",
        quantities,
        classifications: {
          frictionDirection,
          withinSafeSpeedRange,
        },
        details: {
          idealSpeedMs,
          actualSpeedMs,
          weightN,
          normalForceN,
          centripetalAccelMs2,
          angularSpeedRadS,
          centripetalForceN,
          signedSlopeFrictionN,
          frictionForceN,
          maxStaticFrictionN,
          minSafeSpeedMs,
          maxSafeSpeedMs,
          frictionDirection,
          withinSafeSpeedRange,
        },
      };
    }

    case "vertical-circle": {
      const g = spec.gravityMs2 ?? STANDARD_GRAVITY_MS2;
      const constraint = spec.constraintKind ?? "string";
      const refPos =
        spec.referencePosition ??
        (spec.motionMode === "energy-conserving" ? "bottom" : "top");

      let speedTopMs: number;
      let speedBottomMs: number;
      if (spec.motionMode === "uniform") {
        speedTopMs = spec.referenceSpeedMs;
        speedBottomMs = spec.referenceSpeedMs;
      } else if (refPos === "bottom") {
        speedBottomMs = spec.referenceSpeedMs;
        speedTopMs = Math.sqrt(
          Math.max(0, spec.referenceSpeedMs ** 2 - 4 * g * spec.radiusM),
        );
      } else {
        speedTopMs = spec.referenceSpeedMs;
        speedBottomMs = Math.sqrt(
          spec.referenceSpeedMs ** 2 + 4 * g * spec.radiusM,
        );
      }

      const minSpeedTopMs = Math.sqrt(g * spec.radiusM);
      const minSpeedBottomLoopMs = Math.sqrt(5 * g * spec.radiusM);
      const centripetalAccelTopMs2 = speedTopMs ** 2 / spec.radiusM;
      const centripetalAccelBottomMs2 = speedBottomMs ** 2 / spec.radiusM;
      const angularSpeedTopRadS = speedTopMs / spec.radiusM;
      const angularSpeedBottomRadS = speedBottomMs / spec.radiusM;
      const centripetalForceTopN = spec.massKg * centripetalAccelTopMs2;
      const centripetalForceBottomN = spec.massKg * centripetalAccelBottomMs2;
      const weightN = spec.massKg * g;
      const supportForceBottomN = spec.massKg * (centripetalAccelBottomMs2 + g);

      const rawTopForce =
        constraint === "over-crest"
          ? spec.massKg * (g - centripetalAccelTopMs2)
          : spec.massKg * (centripetalAccelTopMs2 - g);
      const supportForceTopN =
        Math.abs(rawTopForce) < 1e-11 * Math.max(1, weightN) ? 0 : rawTopForce;

      let topForceState: "tension" | "normal" | "compression" | "zero";
      if (supportForceTopN === 0) {
        topForceState = "zero";
      } else if (constraint === "inside-track" || constraint === "over-crest") {
        topForceState = "normal";
      } else if (supportForceTopN > 0) {
        topForceState = "tension";
      } else {
        topForceState = "compression";
      }

      const details = {
        speedTopMs,
        speedBottomMs,
        minSpeedTopMs,
        minSpeedBottomLoopMs,
        centripetalAccelTopMs2,
        centripetalAccelBottomMs2,
        angularSpeedTopRadS,
        angularSpeedBottomRadS,
        centripetalForceTopN,
        centripetalForceBottomN,
        supportForceTopN,
        supportForceBottomN,
        weightN,
        topForceState,
      };
      return {
        kind: "vertical-circle",
        quantities: {
          massKg: spec.massKg,
          radiusM: spec.radiusM,
          referenceSpeedMs: spec.referenceSpeedMs,
          gravityMs2: g,
          speedTopMs,
          speedBottomMs,
          minSpeedTopMs,
          minSpeedBottomLoopMs,
          centripetalAccelTopMs2,
          centripetalAccelBottomMs2,
          angularSpeedTopRadS,
          angularSpeedBottomRadS,
          centripetalForceTopN,
          centripetalForceBottomN,
          supportForceTopN,
          supportForceBottomN,
          weightN,
        },
        classifications: {
          motionMode: spec.motionMode,
          constraintKind: constraint,
          topForceState,
        },
        details,
      };
    }

    case "planetary-field-potential": {
      const G = spec.gravitationalConstant ?? GRAVITATIONAL_CONSTANT;
      const M = spec.centralMassKg;
      const R = spec.planetRadiusM;
      const r = spec.probeRadiusM;

      const surfaceFieldNkg = (G * M) / R ** 2;
      const surfacePotentialJkg = -(G * M) / R;
      const surfaceEscapeSpeedMs = Math.sqrt((2 * G * M) / R);
      const meanDensityKgM3 = M / ((4 / 3) * Math.PI * R ** 3);

      let region: "interior" | "surface" | "exterior";
      if (Math.abs(r - R) <= 1e-9 * R) {
        region = "surface";
      } else if (r < R) {
        region = "interior";
      } else {
        region = "exterior";
      }

      const enclosedMassKg = r < R ? M * (r / R) ** 3 : M;
      const fieldStrengthNkg = gravitationalFieldStrengthSphere(M, R, r, G);
      const gravitationalPotentialJkg = gravitationalPotentialSphere(M, R, r, G);
      const escapeSpeedMs = Math.sqrt(-2 * gravitationalPotentialJkg);

      const maxPlotR = Math.max(4 * R, 1.35 * r);
      const fieldCurve: Point2D[] = [];
      const potentialCurve: Point2D[] = [];
      const interiorSteps = 24;
      for (let i = 0; i <= interiorSteps; i += 1) {
        const rad = (R * i) / interiorSteps;
        fieldCurve.push({
          x: rad,
          y: gravitationalFieldStrengthSphere(M, R, rad, G),
        });
        potentialCurve.push({
          x: rad,
          y: gravitationalPotentialSphere(M, R, rad, G),
        });
      }
      const exteriorSteps = 60;
      for (let i = 1; i <= exteriorSteps; i += 1) {
        const rad = R + ((maxPlotR - R) * i) / exteriorSteps;
        fieldCurve.push({
          x: rad,
          y: gravitationalFieldStrengthSphere(M, R, rad, G),
        });
        potentialCurve.push({
          x: rad,
          y: gravitationalPotentialSphere(M, R, rad, G),
        });
      }

      const quantities: Record<string, number> = {
        centralMassKg: M,
        planetRadiusM: R,
        probeRadiusM: r,
        gravitationalConstant: G,
        surfaceFieldNkg,
        surfacePotentialJkg,
        surfaceEscapeSpeedMs,
        meanDensityKgM3,
        enclosedMassKg,
        fieldStrengthNkg,
        gravitationalPotentialJkg,
        escapeSpeedMs,
      };

      let gravitationalForceN: number | undefined;
      let potentialEnergyJ: number | undefined;
      if (spec.testMassKg !== undefined) {
        gravitationalForceN = spec.testMassKg * fieldStrengthNkg;
        potentialEnergyJ = spec.testMassKg * gravitationalPotentialJkg;
        quantities.testMassKg = spec.testMassKg;
        quantities.gravitationalForceN = gravitationalForceN;
        quantities.potentialEnergyJ = potentialEnergyJ;
      }

      return {
        kind: "planetary-field-potential",
        quantities,
        classifications: { region },
        curves: {
          fieldStrength: fieldCurve,
          potential: potentialCurve,
        },
        details: {
          region,
          surfaceFieldNkg,
          surfacePotentialJkg,
          surfaceEscapeSpeedMs,
          meanDensityKgM3,
          enclosedMassKg,
          fieldStrengthNkg,
          gravitationalPotentialJkg,
          escapeSpeedMs,
          gravitationalForceN,
          potentialEnergyJ,
        },
      };
    }

    case "circular-orbit-energy": {
      const G = spec.gravitationalConstant ?? GRAVITATIONAL_CONSTANT;
      const M = spec.centralMassKg;
      const R = spec.centralRadiusM;
      const m = spec.satelliteMassKg;
      const r1 = spec.orbitRadiusM;

      const altitudeM = r1 - R;
      const fieldStrengthNkg = (G * M) / r1 ** 2;
      const gravitationalForceN = m * fieldStrengthNkg;
      const orbitalSpeedMs = circularOrbitalSpeed(M, r1, G);
      const escapeSpeedMs = escapeSpeed(M, r1, G);
      const angularSpeedRadS = Math.sqrt((G * M) / r1 ** 3);
      const orbitalPeriodS = keplerOrbitalPeriod(M, r1, G);
      const keplerConstantS2M3 = (4 * Math.PI ** 2) / (G * M);
      const gravitationalPotentialJkg = -(G * M) / r1;
      const kineticEnergyJ = (G * M * m) / (2 * r1);
      const potentialEnergyJ = -(G * M * m) / r1;
      const totalEnergyJ = -(G * M * m) / (2 * r1);
      const bindingEnergyJ = -totalEnergyJ;

      const quantities: Record<string, number> = {
        centralMassKg: M,
        centralRadiusM: R,
        satelliteMassKg: m,
        orbitRadiusM: r1,
        gravitationalConstant: G,
        altitudeM,
        fieldStrengthNkg,
        gravitationalForceN,
        orbitalSpeedMs,
        escapeSpeedMs,
        angularSpeedRadS,
        orbitalPeriodS,
        keplerConstantS2M3,
        gravitationalPotentialJkg,
        kineticEnergyJ,
        potentialEnergyJ,
        totalEnergyJ,
        bindingEnergyJ,
      };

      let transfer:
        | {
            targetOrbitRadiusM: number;
            targetOrbitalSpeedMs: number;
            targetOrbitalPeriodS: number;
            targetKineticEnergyJ: number;
            targetPotentialEnergyJ: number;
            targetTotalEnergyJ: number;
            transferDeltaTotalEnergyJ: number;
            transferDeltaPotentialEnergyJ: number;
            transferDeltaKineticEnergyJ: number;
            hohmannSemiMajorAxisM: number;
            hohmannTransferTimeS: number;
            hohmannDeltaV1Ms: number;
            hohmannDeltaV2Ms: number;
          }
        | undefined;

      if (spec.targetOrbitRadiusM !== undefined) {
        const r2 = spec.targetOrbitRadiusM;
        const targetOrbitalSpeedMs = circularOrbitalSpeed(M, r2, G);
        const targetOrbitalPeriodS = keplerOrbitalPeriod(M, r2, G);
        const targetKineticEnergyJ = (G * M * m) / (2 * r2);
        const targetPotentialEnergyJ = -(G * M * m) / r2;
        const targetTotalEnergyJ = -(G * M * m) / (2 * r2);
        const transferDeltaTotalEnergyJ = targetTotalEnergyJ - totalEnergyJ;
        const transferDeltaPotentialEnergyJ =
          targetPotentialEnergyJ - potentialEnergyJ;
        const transferDeltaKineticEnergyJ =
          targetKineticEnergyJ - kineticEnergyJ;
        const hohmannSemiMajorAxisM = 0.5 * (r1 + r2);
        const hohmannTransferTimeS =
          Math.PI * Math.sqrt(hohmannSemiMajorAxisM ** 3 / (G * M));
        const vTrans1 = Math.sqrt(G * M * (2 / r1 - 1 / hohmannSemiMajorAxisM));
        const vTrans2 = Math.sqrt(G * M * (2 / r2 - 1 / hohmannSemiMajorAxisM));
        const hohmannDeltaV1Ms = Math.abs(vTrans1 - orbitalSpeedMs);
        const hohmannDeltaV2Ms = Math.abs(targetOrbitalSpeedMs - vTrans2);

        transfer = {
          targetOrbitRadiusM: r2,
          targetOrbitalSpeedMs,
          targetOrbitalPeriodS,
          targetKineticEnergyJ,
          targetPotentialEnergyJ,
          targetTotalEnergyJ,
          transferDeltaTotalEnergyJ,
          transferDeltaPotentialEnergyJ,
          transferDeltaKineticEnergyJ,
          hohmannSemiMajorAxisM,
          hohmannTransferTimeS,
          hohmannDeltaV1Ms,
          hohmannDeltaV2Ms,
        };
        Object.assign(quantities, transfer);
      }

      const rMin = Math.max(1.05 * R, 0.5 * Math.min(r1, spec.targetOrbitRadiusM ?? r1));
      const rMax = 1.45 * Math.max(r1, spec.targetOrbitRadiusM ?? r1 * 2.2);
      const steps = 64;
      const ekCurve: Point2D[] = [];
      const epCurve: Point2D[] = [];
      const etotCurve: Point2D[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const rad = rMin + ((rMax - rMin) * i) / steps;
        const ek = (G * M * m) / (2 * rad);
        ekCurve.push({ x: rad, y: ek });
        epCurve.push({ x: rad, y: -2 * ek });
        etotCurve.push({ x: rad, y: -ek });
      }

      return {
        kind: "circular-orbit-energy",
        quantities,
        classifications: {
          hasTransfer: transfer !== undefined,
        },
        curves: {
          kineticEnergy: ekCurve,
          potentialEnergy: epCurve,
          totalEnergy: etotCurve,
        },
        details: {
          altitudeM,
          fieldStrengthNkg,
          gravitationalForceN,
          orbitalSpeedMs,
          escapeSpeedMs,
          angularSpeedRadS,
          orbitalPeriodS,
          keplerConstantS2M3,
          gravitationalPotentialJkg,
          kineticEnergyJ,
          potentialEnergyJ,
          totalEnergyJ,
          bindingEnergyJ,
          transfer,
        },
      };
    }

    case "two-body-null-point": {
      const G = spec.gravitationalConstant ?? GRAVITATIONAL_CONSTANT;
      const M1 = spec.primaryMassKg;
      const R1 = spec.primaryRadiusM;
      const M2 = spec.secondaryMassKg;
      const R2 = spec.secondaryRadiusM;
      const d = spec.separationM;

      const root1 = Math.sqrt(M1);
      const root2 = Math.sqrt(M2);
      const nullPointFraction = root1 / (root1 + root2);
      const nullPointFromPrimaryM = nullPointFraction * d;
      const nullPointFromSecondaryM = (root2 / (root1 + root2)) * d;

      const potentialAt = (x: number) => -(G * M1) / x - (G * M2) / (d - x);
      const fieldXAt = (x: number) =>
        -(G * M1) / x ** 2 + (G * M2) / (d - x) ** 2;

      const potentialAtNullPointJkg = -(G / d) * (root1 + root2) ** 2;
      const potentialAtPrimarySurfaceJkg = potentialAt(R1);
      const potentialAtSecondarySurfaceJkg = potentialAt(d - R2);
      const potentialBarrierFromPrimaryJkg =
        potentialAtNullPointJkg - potentialAtPrimarySurfaceJkg;
      const minTransferSpeedFromPrimaryMs = Math.sqrt(
        Math.max(0, 2 * potentialBarrierFromPrimaryJkg),
      );

      const quantities: Record<string, number> = {
        primaryMassKg: M1,
        primaryRadiusM: R1,
        secondaryMassKg: M2,
        secondaryRadiusM: R2,
        separationM: d,
        gravitationalConstant: G,
        nullPointFromPrimaryM,
        nullPointFromSecondaryM,
        nullPointFraction,
        potentialAtNullPointJkg,
        potentialAtPrimarySurfaceJkg,
        potentialAtSecondarySurfaceJkg,
        potentialBarrierFromPrimaryJkg,
        minTransferSpeedFromPrimaryMs,
      };

      let probeFieldXMs2: number | undefined;
      let probeFieldMagnitudeNkg: number | undefined;
      let probePotentialJkg: number | undefined;
      let probePotentialEnergyJ: number | undefined;
      let probeForceMagnitudeN: number | undefined;

      if (spec.probeDistanceFromPrimaryM !== undefined) {
        const xp = spec.probeDistanceFromPrimaryM;
        probeFieldXMs2 = fieldXAt(xp);
        probeFieldMagnitudeNkg = Math.abs(probeFieldXMs2);
        probePotentialJkg = potentialAt(xp);
        quantities.probeDistanceFromPrimaryM = xp;
        quantities.probeFieldXMs2 = probeFieldXMs2;
        quantities.probeFieldMagnitudeNkg = probeFieldMagnitudeNkg;
        quantities.probePotentialJkg = probePotentialJkg;
        if (spec.testMassKg !== undefined) {
          probePotentialEnergyJ = spec.testMassKg * probePotentialJkg;
          probeForceMagnitudeN = spec.testMassKg * probeFieldMagnitudeNkg;
          quantities.testMassKg = spec.testMassKg;
          quantities.probePotentialEnergyJ = probePotentialEnergyJ;
          quantities.probeForceMagnitudeN = probeForceMagnitudeN;
        }
      }

      const potentialCurve: Point2D[] = [];
      const fieldCurve: Point2D[] = [];
      const xStart = R1;
      const xEnd = d - R2;
      const sampleXs = new Set<number>([xStart, nullPointFromPrimaryM, xEnd]);
      const steps = 72;
      for (let i = 0; i <= steps; i += 1) {
        sampleXs.add(xStart + ((xEnd - xStart) * i) / steps);
      }
      const sortedXs = [...sampleXs].sort((a, b) => a - b);
      for (const x of sortedXs) {
        potentialCurve.push({ x, y: potentialAt(x) });
        fieldCurve.push({ x, y: fieldXAt(x) });
      }

      return {
        kind: "two-body-null-point",
        quantities,
        classifications: {},
        curves: {
          potential: potentialCurve,
          fieldX: fieldCurve,
        },
        details: {
          nullPointFromPrimaryM,
          nullPointFromSecondaryM,
          nullPointFraction,
          potentialAtNullPointJkg,
          potentialAtPrimarySurfaceJkg,
          potentialAtSecondarySurfaceJkg,
          potentialBarrierFromPrimaryJkg,
          minTransferSpeedFromPrimaryMs,
          probeFieldXMs2,
          probeFieldMagnitudeNkg,
          probePotentialJkg,
          probePotentialEnergyJ,
          probeForceMagnitudeN,
        },
      };
    }

    case "stellar-radiation": {
      const bWien = spec.wienConstantMK ?? WIEN_DISPLACEMENT_MK;
      const sigma = spec.stefanBoltzmannWm2K4 ?? STEFAN_BOLTZMANN_WM2K4;
      const T = spec.surfaceTempK;
      const R = spec.stellarRadiusM;
      const d = spec.distanceM;

      const peakWavelengthM = bWien / T;
      const peakWavelengthNm = peakWavelengthM * 1e9;
      const surfaceFluxWm2 = sigma * T ** 4;
      const surfaceAreaM2 = 4 * Math.PI * R ** 2;
      const luminosityW = surfaceAreaM2 * surfaceFluxWm2;
      const luminositySolar = luminosityW / SOLAR_LUMINOSITY_W;
      const radiusSolar = R / SOLAR_RADIUS_M;
      const apparentBrightnessWm2 = luminosityW / (4 * Math.PI * d ** 2);
      const distancePc = d / PARSEC_M;

      const quantities: Record<string, number> = {
        surfaceTempK: T,
        stellarRadiusM: R,
        distanceM: d,
        wienConstantMK: bWien,
        stefanBoltzmannWm2K4: sigma,
        peakWavelengthM,
        peakWavelengthNm,
        surfaceFluxWm2,
        surfaceAreaM2,
        luminosityW,
        luminositySolar,
        radiusSolar,
        apparentBrightnessWm2,
        distancePc,
      };

      let comparison:
        | {
            peakWavelengthM: number;
            peakWavelengthNm: number;
            luminosityW: number;
            luminosityRatio: number;
            radiusRatio: number;
            tempRatio: number;
          }
        | undefined;

      if (spec.comparisonStar !== undefined) {
        const Tc = spec.comparisonStar.surfaceTempK;
        const Rc = spec.comparisonStar.stellarRadiusM;
        const compPeakM = bWien / Tc;
        const compPeakNm = compPeakM * 1e9;
        const compLumW = 4 * Math.PI * Rc ** 2 * sigma * Tc ** 4;
        comparison = {
          peakWavelengthM: compPeakM,
          peakWavelengthNm: compPeakNm,
          luminosityW: compLumW,
          luminosityRatio: luminosityW / compLumW,
          radiusRatio: R / Rc,
          tempRatio: T / Tc,
        };
        quantities.comparisonSurfaceTempK = Tc;
        quantities.comparisonStellarRadiusM = Rc;
        quantities.comparisonPeakWavelengthM = compPeakM;
        quantities.comparisonPeakWavelengthNm = compPeakNm;
        quantities.comparisonLuminosityW = compLumW;
        quantities.luminosityRatio = comparison.luminosityRatio;
        quantities.radiusRatio = comparison.radiusRatio;
        quantities.tempRatio = comparison.tempRatio;
      }

      const minLambda =
        0.2 *
        Math.min(peakWavelengthM, comparison?.peakWavelengthM ?? peakWavelengthM);
      const maxLambda =
        3.5 *
        Math.max(peakWavelengthM, comparison?.peakWavelengthM ?? peakWavelengthM);
      const peakRaw = planckRelativeSpectralRadiance(peakWavelengthM, T);
      const normScale = peakRaw > 0 ? 1 / peakRaw : 1;
      const primarySpectrum: Point2D[] = [];
      const comparisonSpectrum: Point2D[] = [];
      const steps = 80;
      for (let i = 0; i <= steps; i += 1) {
        const lam = minLambda + ((maxLambda - minLambda) * i) / steps;
        primarySpectrum.push({
          x: lam * 1e9,
          y: planckRelativeSpectralRadiance(lam, T) * normScale,
        });
        if (spec.comparisonStar) {
          comparisonSpectrum.push({
            x: lam * 1e9,
            y:
              planckRelativeSpectralRadiance(
                lam,
                spec.comparisonStar.surfaceTempK,
              ) * normScale,
          });
        }
      }

      const curves: Record<string, readonly Point2D[]> = {
        primarySpectrum,
      };
      if (comparisonSpectrum.length > 0) {
        curves.comparisonSpectrum = comparisonSpectrum;
      }

      return {
        kind: "stellar-radiation",
        quantities,
        classifications: {},
        curves,
        details: {
          peakWavelengthM,
          peakWavelengthNm,
          surfaceFluxWm2,
          surfaceAreaM2,
          luminosityW,
          luminositySolar,
          radiusSolar,
          apparentBrightnessWm2,
          distancePc,
          comparison,
        },
      };
    }

    case "hr-diagram": {
      const sigma = spec.stefanBoltzmannWm2K4 ?? STEFAN_BOLTZMANN_WM2K4;
      const bWien = spec.wienConstantMK ?? WIEN_DISPLACEMENT_MK;

      const solvedStars: SolvedHrStar[] = spec.stars.map((star) => {
        const luminosityW = star.luminositySolar * SOLAR_LUMINOSITY_W;
        const stellarRadiusM = Math.sqrt(
          luminosityW / (4 * Math.PI * sigma * star.surfaceTempK ** 4),
        );
        const radiusSolar = stellarRadiusM / SOLAR_RADIUS_M;
        const peakWavelengthM = bWien / star.surfaceTempK;
        const peakWavelengthNm = peakWavelengthM * 1e9;
        const spectralClass = classifySpectralType(star.surfaceTempK);
        const region =
          star.region ??
          classifyHrRegion(star.surfaceTempK, star.luminositySolar, radiusSolar);
        const estimatedMainSequenceMassSolar = Math.pow(
          star.luminositySolar,
          1 / 3.5,
        );
        const estimatedMainSequenceLifetimeSolar = Math.pow(
          star.luminositySolar,
          -2.5 / 3.5,
        );
        return {
          id: star.id,
          label: star.label,
          surfaceTempK: star.surfaceTempK,
          luminositySolar: star.luminositySolar,
          luminosityW,
          stellarRadiusM,
          radiusSolar,
          peakWavelengthM,
          peakWavelengthNm,
          spectralClass,
          region,
          estimatedMainSequenceMassSolar,
          estimatedMainSequenceLifetimeSolar,
        };
      });

      const targetStar =
        solvedStars.find((star) => star.id === spec.targetStarId) ??
        solvedStars[0];

      return {
        kind: "hr-diagram",
        quantities: {
          surfaceTempK: targetStar.surfaceTempK,
          luminositySolar: targetStar.luminositySolar,
          luminosityW: targetStar.luminosityW,
          stellarRadiusM: targetStar.stellarRadiusM,
          radiusSolar: targetStar.radiusSolar,
          peakWavelengthM: targetStar.peakWavelengthM,
          peakWavelengthNm: targetStar.peakWavelengthNm,
          estimatedMainSequenceMassSolar:
            targetStar.estimatedMainSequenceMassSolar,
          estimatedMainSequenceLifetimeSolar:
            targetStar.estimatedMainSequenceLifetimeSolar,
        },
        classifications: {
          spectralClass: targetStar.spectralClass,
          region: targetStar.region,
          targetStarId: targetStar.id,
        },
        details: {
          targetStar,
          stars: solvedStars,
        },
      };
    }

    case "stellar-parallax": {
      const baselineAu = spec.baselineAu ?? 1;
      const parsecM = spec.parsecM ?? PARSEC_M;
      const parallaxArcsec = spec.parallaxArcsec;
      const parallaxMilliarcsec = parallaxArcsec * 1000;
      const parallaxDegrees = parallaxArcsec / 3600;
      const parallaxRadians = (parallaxDegrees * Math.PI) / 180;
      const distancePc = baselineAu / parallaxArcsec;
      const distanceLy = distancePc * LIGHT_YEARS_PER_PARSEC;
      const distanceAu = baselineAu / Math.tan(parallaxRadians);
      const distanceM = distancePc * parsecM;

      const quantities: Record<string, number> = {
        parallaxArcsec,
        baselineAu,
        parsecM,
        parallaxMilliarcsec,
        parallaxDegrees,
        parallaxRadians,
        distancePc,
        distanceLy,
        distanceAu,
        distanceM,
      };

      let apparentBrightnessWm2: number | undefined;
      if (spec.stellarLuminosityW !== undefined) {
        apparentBrightnessWm2 =
          spec.stellarLuminosityW / (4 * Math.PI * distanceM ** 2);
        quantities.stellarLuminosityW = spec.stellarLuminosityW;
        quantities.apparentBrightnessWm2 = apparentBrightnessWm2;
      }

      return {
        kind: "stellar-parallax",
        quantities,
        classifications: {},
        details: {
          parallaxArcsec,
          parallaxMilliarcsec,
          parallaxDegrees,
          parallaxRadians,
          distancePc,
          distanceLy,
          distanceAu,
          distanceM,
          apparentBrightnessWm2,
        },
      };
    }

    case "cosmological-redshift": {
      const H0 = spec.hubbleConstantKmSMpc ?? DEFAULT_HUBBLE_CONSTANT_KMS_MPC;
      const c = spec.speedOfLightMs ?? SPEED_OF_LIGHT_MS;
      const parsecM = spec.parsecM ?? PARSEC_M;
      const restWavelengthM = spec.restWavelengthM;
      const observedWavelengthM = spec.observedWavelengthM;
      const deltaWavelengthM = observedWavelengthM - restWavelengthM;

      const restWavelengthNm = restWavelengthM * 1e9;
      const observedWavelengthNm = observedWavelengthM * 1e9;
      const deltaWavelengthNm = deltaWavelengthM * 1e9;
      const redshiftZ = deltaWavelengthM / restWavelengthM;
      const scaleFactorRatioNowToEmission = 1 + redshiftZ;
      const scaleFactorRatioEmissionToNow = 1 / scaleFactorRatioNowToEmission;

      const recessionSpeedMs = redshiftZ * c;
      const recessionSpeedKmS = recessionSpeedMs / 1000;
      const onePlusZSq = scaleFactorRatioNowToEmission ** 2;
      const relativisticSpeedMs =
        c * ((onePlusZSq - 1) / (onePlusZSq + 1));

      const distanceMpc = recessionSpeedKmS / H0;
      const distancePc = distanceMpc * 1e6;
      const distanceLy = distancePc * LIGHT_YEARS_PER_PARSEC;
      const distanceM = distancePc * parsecM;

      const hubbleConstantSiSInv = (H0 * 1000) / (1e6 * parsecM);
      const hubbleTimeS = 1 / hubbleConstantSiSInv;
      const hubbleTimeGyr = hubbleTimeS / (SECONDS_PER_JULIAN_YEAR * 1e9);

      const maxPlotMpc = Math.max(100, distanceMpc * 1.4);
      const hubbleLine: Point2D[] = [
        { x: 0, y: 0 },
        { x: maxPlotMpc, y: H0 * maxPlotMpc },
      ];

      const details = {
        restWavelengthM,
        observedWavelengthM,
        deltaWavelengthM,
        restWavelengthNm,
        observedWavelengthNm,
        deltaWavelengthNm,
        redshiftZ,
        scaleFactorRatioEmissionToNow,
        scaleFactorRatioNowToEmission,
        recessionSpeedMs,
        recessionSpeedKmS,
        relativisticSpeedMs,
        distanceMpc,
        distancePc,
        distanceLy,
        distanceM,
        hubbleConstantSiSInv,
        hubbleTimeS,
        hubbleTimeGyr,
      };
      return {
        kind: "cosmological-redshift",
        quantities: {
          hubbleConstantKmSMpc: H0,
          speedOfLightMs: c,
          parsecM,
          ...details,
        },
        classifications: {
          lowRedshiftApprox: spec.lowRedshiftApprox !== false,
        },
        curves: {
          hubbleLine,
        },
        details,
      };
    }

    default: {
      const exhaustive: never = spec;
      throw new Error(`Unsupported grav-astro scenario: ${JSON.stringify(exhaustive)}`);
    }
  }
}
