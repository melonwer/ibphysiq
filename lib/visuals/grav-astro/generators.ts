import {
  EARTH_MASS_KG,
  EARTH_MOON_DISTANCE_M,
  EARTH_RADIUS_M,
  MOON_MASS_KG,
  MOON_RADIUS_M,
  PARSEC_M,
  SOLAR_LUMINOSITY_W,
  SOLAR_RADIUS_M,
  STANDARD_GRAVITY_MS2,
} from "./constants";
import {
  GRAV_ASTRO_SCENARIO_KINDS,
  GravAstroScenario,
  GravAstroScenarioKind,
  HrStarSpec,
} from "./types";

export interface SeededRng {
  nextFloat(): number;
  nextRange(min: number, max: number): number;
  nextStep(min: number, max: number, step: number): number;
  nextInt(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

export function hashGravAstroSeed(seed: number | string): number {
  const str = typeof seed === "number" ? `seed:${seed}` : `seed:${seed}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function createGravAstroRng(seed: number | string): SeededRng {
  let state = hashGravAstroSeed(seed);
  const nextFloat = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    nextFloat,
    nextRange(min: number, max: number): number {
      return min + (max - min) * nextFloat();
    },
    nextStep(min: number, max: number, step: number): number {
      const count = Math.floor((max - min) / step + 1e-9);
      const idx = Math.floor(nextFloat() * (count + 1));
      return Number((min + Math.min(count, idx) * step).toFixed(8));
    },
    nextInt(minInclusive: number, maxInclusive: number): number {
      return (
        minInclusive +
        Math.floor(nextFloat() * (maxInclusive - minInclusive + 1))
      );
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(nextFloat() * items.length)];
    },
  };
}

export interface GenerateGravAstroOptions {
  id?: string;
  hiddenQuantities?: readonly string[];
}

export function generateGravAstroScenario<K extends GravAstroScenarioKind>(
  kind: K,
  seed: number | string,
  options: GenerateGravAstroOptions = {},
): Extract<GravAstroScenario, { kind: K }> {
  const rng = createGravAstroRng(`${kind}::${seed}`);
  const id =
    options.id ??
    `ga-${kind}-${String(hashGravAstroSeed(seed)).slice(0, 8)}`;
  const hiddenQuantities = options.hiddenQuantities;

  switch (kind) {
    case "conical-pendulum": {
      const scenario: GravAstroScenario = {
        kind: "conical-pendulum",
        id,
        massKg: rng.nextStep(0.2, 2.5, 0.1),
        stringLengthM: rng.nextStep(0.5, 2.4, 0.1),
        semiVerticalAngleDeg: rng.nextStep(18, 58, 2),
        gravityMs2: STANDARD_GRAVITY_MS2,
        hiddenQuantities,
      };
      return scenario as Extract<GravAstroScenario, { kind: K }>;
    }

    case "flat-curve": {
      const massKg = rng.nextStep(850, 1750, 50);
      const radiusM = rng.nextStep(30, 120, 5);
      const staticFrictionCoeff = rng.nextStep(0.45, 0.9, 0.05);
      const vMax = Math.sqrt(
        staticFrictionCoeff * STANDARD_GRAVITY_MS2 * radiusM,
      );
      const speedMs = Number((vMax * rng.nextStep(0.6, 0.9, 0.05)).toFixed(2));
      const scenario: GravAstroScenario = {
        kind: "flat-curve",
        id,
        massKg,
        radiusM,
        speedMs,
        staticFrictionCoeff,
        gravityMs2: STANDARD_GRAVITY_MS2,
        hiddenQuantities,
      };
      return scenario as Extract<GravAstroScenario, { kind: K }>;
    }

    case "banked-curve": {
      const massKg = rng.nextStep(900, 1650, 50);
      const radiusM = rng.nextStep(45, 160, 5);
      const bankAngleDeg = rng.nextStep(12, 30, 2);
      const theta = (bankAngleDeg * Math.PI) / 180;
      const vIdeal = Math.sqrt(STANDARD_GRAVITY_MS2 * radiusM * Math.tan(theta));
      const mode = rng.pick(["frictionless", "down-slope", "up-slope"] as const);
      let staticFrictionCoeff: number;
      let speedMs: number;
      if (mode === "frictionless") {
        staticFrictionCoeff = 0;
        speedMs = vIdeal;
      } else {
        staticFrictionCoeff = rng.nextStep(0.3, 0.65, 0.05);
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);
        const vMin =
          sinT - staticFrictionCoeff * cosT <= 0
            ? 0
            : Math.sqrt(
                (STANDARD_GRAVITY_MS2 *
                  radiusM *
                  (sinT - staticFrictionCoeff * cosT)) /
                  (cosT + staticFrictionCoeff * sinT),
              );
        const vMax = Math.sqrt(
          (STANDARD_GRAVITY_MS2 *
            radiusM *
            (sinT + staticFrictionCoeff * cosT)) /
            (cosT - staticFrictionCoeff * sinT),
        );
        speedMs =
          mode === "down-slope"
            ? Number((vIdeal + 0.45 * (vMax - vIdeal)).toFixed(2))
            : Number((vMin + 0.55 * (vIdeal - vMin)).toFixed(2));
      }
      const scenario: GravAstroScenario = {
        kind: "banked-curve",
        id,
        massKg,
        radiusM,
        bankAngleDeg,
        staticFrictionCoeff,
        speedMs,
        gravityMs2: STANDARD_GRAVITY_MS2,
        hiddenQuantities,
      };
      return scenario as Extract<GravAstroScenario, { kind: K }>;
    }

    case "vertical-circle": {
      const massKg = rng.nextStep(0.3, 2.5, 0.1);
      const radiusM = rng.nextStep(0.6, 2.8, 0.2);
      const motionMode = rng.pick(["uniform", "energy-conserving"] as const);
      const constraintKind = rng.pick(["string", "inside-track"] as const);
      const referencePosition =
        motionMode === "energy-conserving" ? "bottom" : "top";
      const minRef =
        motionMode === "energy-conserving"
          ? Math.sqrt(5 * STANDARD_GRAVITY_MS2 * radiusM)
          : Math.sqrt(STANDARD_GRAVITY_MS2 * radiusM);
      const referenceSpeedMs = Number(
        (minRef * rng.nextStep(1.12, 1.55, 0.05)).toFixed(2),
      );
      const scenario: GravAstroScenario = {
        kind: "vertical-circle",
        id,
        massKg,
        radiusM,
        motionMode,
        constraintKind,
        referencePosition,
        referenceSpeedMs,
        gravityMs2: STANDARD_GRAVITY_MS2,
        hiddenQuantities,
      };
      return scenario as Extract<GravAstroScenario, { kind: K }>;
    }

    case "planetary-field-potential": {
      const massScale = rng.nextStep(0.4, 3.2, 0.2);
      const radiusScale = rng.nextStep(0.6, 1.8, 0.1);
      const centralMassKg = Number((EARTH_MASS_KG * massScale).toPrecision(3));
      const planetRadiusM = Number(
        (EARTH_RADIUS_M * radiusScale).toPrecision(3),
      );
      const isInterior = rng.nextFloat() < 0.35;
      const probeFactor = isInterior
        ? rng.nextStep(0.3, 0.8, 0.1)
        : rng.nextStep(1.4, 3.6, 0.2);
      const probeRadiusM = Number((planetRadiusM * probeFactor).toPrecision(4));
      const plotQuantity = rng.pick(["field-strength", "potential"] as const);
      const scenario: GravAstroScenario = {
        kind: "planetary-field-potential",
        id,
        centralMassKg,
        planetRadiusM,
        probeRadiusM,
        testMassKg: rng.nextStep(150, 1200, 50),
        plotQuantity,
        hiddenQuantities,
      };
      return scenario as Extract<GravAstroScenario, { kind: K }>;
    }

    case "circular-orbit-energy": {
      const centralMassKg = Number(
        (EARTH_MASS_KG * rng.nextStep(0.8, 2.5, 0.1)).toPrecision(3),
      );
      const centralRadiusM = Number(
        (EARTH_RADIUS_M * rng.nextStep(0.9, 1.5, 0.1)).toPrecision(3),
      );
      const satelliteMassKg = rng.nextStep(250, 2400, 50);
      const orbitRadiusM = Number(
        (centralRadiusM * rng.nextStep(1.4, 2.8, 0.2)).toPrecision(4),
      );
      const withTransfer = rng.nextFloat() < 0.6;
      const targetOrbitRadiusM = withTransfer
        ? Number((orbitRadiusM * rng.nextStep(1.6, 3.0, 0.2)).toPrecision(4))
        : undefined;
      const diagramVariant = rng.pick([
        "split-orbit-energy",
        "energy-curves",
        "orbit-schematic",
      ] as const);
      const scenario: GravAstroScenario = {
        kind: "circular-orbit-energy",
        id,
        centralMassKg,
        centralRadiusM,
        satelliteMassKg,
        orbitRadiusM,
        targetOrbitRadiusM,
        diagramVariant,
        hiddenQuantities,
      };
      return scenario as Extract<GravAstroScenario, { kind: K }>;
    }

    case "two-body-null-point": {
      const primaryScale = rng.nextStep(0.8, 1.6, 0.2);
      const massRatio = rng.pick([9, 16, 25, 49, 81] as const);
      const primaryMassKg = Number(
        (EARTH_MASS_KG * primaryScale).toPrecision(3),
      );
      const secondaryMassKg = Number(
        (primaryMassKg / massRatio).toPrecision(4),
      );
      const primaryRadiusM = EARTH_RADIUS_M;
      const secondaryRadiusM = MOON_RADIUS_M;
      const separationM = Number(
        (EARTH_MOON_DISTANCE_M * rng.nextStep(0.8, 1.4, 0.1)).toPrecision(3),
      );
      const probeDistanceFromPrimaryM = Number(
        (separationM * rng.nextStep(0.35, 0.75, 0.05)).toPrecision(4),
      );
      const scenario: GravAstroScenario = {
        kind: "two-body-null-point",
        id,
        primaryMassKg,
        primaryRadiusM,
        secondaryMassKg,
        secondaryRadiusM,
        separationM,
        probeDistanceFromPrimaryM,
        testMassKg: rng.nextStep(500, 3000, 250),
        hiddenQuantities,
      };
      void MOON_MASS_KG;
      return scenario as Extract<GravAstroScenario, { kind: K }>;
    }

    case "stellar-radiation": {
      const surfaceTempK = rng.nextStep(3500, 14500, 250);
      const radiusFactor = rng.nextStep(0.5, 8.0, 0.5);
      const stellarRadiusM = Number(
        (SOLAR_RADIUS_M * radiusFactor).toPrecision(3),
      );
      const distPc = rng.nextStep(4, 120, 4);
      const distanceM = Number((distPc * PARSEC_M).toPrecision(4));
      const diagramVariant = rng.pick([
        "blackbody-curve",
        "inverse-square",
      ] as const);
      const scenario: GravAstroScenario = {
        kind: "stellar-radiation",
        id,
        surfaceTempK,
        stellarRadiusM,
        distanceM,
        diagramVariant,
        hiddenQuantities,
      };
      return scenario as Extract<GravAstroScenario, { kind: K }>;
    }

    case "hr-diagram": {
      const stars: HrStarSpec[] = [
        {
          id: "star-a",
          label: "Star A",
          surfaceTempK: rng.nextStep(5200, 9500, 100),
          luminositySolar: rng.nextStep(0.6, 18, 0.4),
          region: "main-sequence",
        },
        {
          id: "star-b",
          label: "Star B",
          surfaceTempK: rng.nextStep(3600, 4600, 100),
          luminositySolar: rng.nextStep(80, 400, 20),
          region: "red-giant",
        },
        {
          id: "star-c",
          label: "Star C",
          surfaceTempK: rng.nextStep(11000, 22000, 500),
          luminositySolar: Number(rng.nextRange(0.001, 0.015).toPrecision(2)),
          region: "white-dwarf",
        },
        {
          id: "star-d",
          label: "Star D",
          surfaceTempK: rng.nextStep(4000, 12000, 500),
          luminositySolar: rng.nextStep(15000, 95000, 5000),
          region: "supergiant",
        },
      ];
      const target = rng.pick(stars);
      const scenario: GravAstroScenario = {
        kind: "hr-diagram",
        id,
        stars,
        targetStarId: target.id,
        showEvolutionTrack: rng.nextFloat() < 0.4,
        hiddenQuantities,
      };
      return scenario as Extract<GravAstroScenario, { kind: K }>;
    }

    case "stellar-parallax": {
      const parallaxArcsec = rng.pick([
        0.02, 0.025, 0.04, 0.05, 0.08, 0.1, 0.125, 0.2, 0.25, 0.4, 0.5, 0.75,
      ] as const);
      const lumScale = rng.nextStep(0.4, 12, 0.4);
      const scenario: GravAstroScenario = {
        kind: "stellar-parallax",
        id,
        parallaxArcsec,
        baselineAu: 1,
        stellarLuminosityW: Number(
          (SOLAR_LUMINOSITY_W * lumScale).toPrecision(3),
        ),
        hiddenQuantities,
      };
      return scenario as Extract<GravAstroScenario, { kind: K }>;
    }

    case "cosmological-redshift": {
      const restLinesNm = [393.4, 434.0, 486.1, 589.0, 656.3] as const;
      const restNm = rng.pick(restLinesNm);
      const z = rng.nextStep(0.02, 0.24, 0.01);
      const obsNm = Number((restNm * (1 + z)).toFixed(3));
      const hubbleConstantKmSMpc = rng.pick([68, 70, 72] as const);
      const diagramVariant = rng.pick([
        "spectral-shift",
        "hubble-plot",
      ] as const);
      const scenario: GravAstroScenario = {
        kind: "cosmological-redshift",
        id,
        restWavelengthM: restNm * 1e-9,
        observedWavelengthM: obsNm * 1e-9,
        hubbleConstantKmSMpc,
        diagramVariant,
        hiddenQuantities,
      };
      return scenario as Extract<GravAstroScenario, { kind: K }>;
    }

    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported generator kind: ${String(exhaustive)}`);
    }
  }
}

export function sampleAllGravAstroScenarios(
  seed: number | string,
  options: GenerateGravAstroOptions = {},
): GravAstroScenario[] {
  return GRAV_ASTRO_SCENARIO_KINDS.map((kind, idx) =>
    generateGravAstroScenario(kind, `${seed}::${idx}`, {
      ...options,
      id: options.id ? `${options.id}-${kind}` : undefined,
    }),
  );
}

export function generateGravAstroScenarioBatch(
  seed: number | string,
  count: number,
  options: GenerateGravAstroOptions = {},
): GravAstroScenario[] {
  if (!Number.isInteger(count) || count < 0 || count > 10000) {
    throw new Error("Batch count must be an integer between 0 and 10000");
  }
  const results: GravAstroScenario[] = [];
  for (let i = 0; i < count; i += 1) {
    const kind =
      GRAV_ASTRO_SCENARIO_KINDS[i % GRAV_ASTRO_SCENARIO_KINDS.length];
    results.push(
      generateGravAstroScenario(kind, `${seed}::batch::${i}`, {
        ...options,
        id: options.id ? `${options.id}-${i + 1}` : undefined,
      }),
    );
  }
  return results;
}
