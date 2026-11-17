import {
  centripetalAccelerationFromAngularSpeed,
  centripetalAccelerationFromSpeed,
  classifyHrRegion,
  classifySpectralType,
  EARTH_MASS_KG,
  EARTH_MOON_DISTANCE_M,
  EARTH_RADIUS_M,
  formatQuantityValue,
  generateGravAstroScenario,
  generateGravAstroScenarioBatch,
  GRAV_ASTRO_CONSTANTS,
  GRAV_ASTRO_SCENARIO_KINDS,
  GravAstroScenario,
  gravitationalFieldStrengthSphere,
  gravitationalPotentialSphere,
  MOON_RADIUS_M,
  PARSEC_M,
  renderGravAstroSvg,
  sampleAllGravAstroScenarios,
  SOLAR_LUMINOSITY_W,
  SOLAR_RADIUS_M,
  solveGravAstroScenario,
  SPEED_OF_LIGHT_MS,
  STANDARD_GRAVITY_MS2,
  STEFAN_BOLTZMANN_WM2K4,
  stellarRadiusFromLuminosityAndWien,
  validateGravAstroScenario,
  WIEN_DISPLACEMENT_MK,
} from "@/lib/visuals/grav-astro";

function extractSvgTextAndMeta(svg: string): string {
  const chunks: string[] = [];
  const textRegex = /<(?:text|title|desc)\b[^>]*>([\s\S]*?)<\/(?:text|title|desc)>/g;
  let match: RegExpExecArray | null = textRegex.exec(svg);
  while (match !== null) {
    chunks.push(match[1]);
    match = textRegex.exec(svg);
  }
  const ariaRegex = /aria-label="([^"]*)"/g;
  let ariaMatch: RegExpExecArray | null = ariaRegex.exec(svg);
  while (ariaMatch !== null) {
    chunks.push(ariaMatch[1]);
    ariaMatch = ariaRegex.exec(svg);
  }
  return chunks.join(" | ");
}

describe("lib/visuals/grav-astro — physics solver, validation, SVG & visibility", () => {
  describe("Circular Motion", () => {
    it("solves conical pendulum geometry, tension, centripetal acceleration, and period", () => {
      const spec: GravAstroScenario = {
        kind: "conical-pendulum",
        massKg: 1.5,
        stringLengthM: 2.0,
        semiVerticalAngleDeg: 36.86989765,
        gravityMs2: 9.81,
      };
      const res = solveGravAstroScenario(spec);
      if (res.kind !== "conical-pendulum") throw new Error("unexpected kind");
      const { details } = res;

      expect(details.orbitRadiusM).toBeCloseTo(1.2, 6);
      expect(details.verticalHeightM).toBeCloseTo(1.6, 6);
      expect(details.tensionN * 0.8).toBeCloseTo(1.5 * 9.81, 6);
      expect(details.tensionN * 0.6).toBeCloseTo(details.centripetalForceN, 6);
      expect(details.centripetalAccelMs2).toBeCloseTo(
        centripetalAccelerationFromSpeed(
          details.linearSpeedMs,
          details.orbitRadiusM,
        ),
        9,
      );
      expect(details.centripetalAccelMs2).toBeCloseTo(
        centripetalAccelerationFromAngularSpeed(
          details.angularSpeedRadS,
          details.orbitRadiusM,
        ),
        9,
      );
      expect(details.periodS).toBeCloseTo(
        2 * Math.PI * Math.sqrt(1.6 / 9.81),
        9,
      );
      expect(details.frequencyHz).toBeCloseTo(1 / details.periodS, 10);
    });

    it("solves flat circular curve friction and enforces non-skidding speed limit", () => {
      const validSpec: GravAstroScenario = {
        kind: "flat-curve",
        massKg: 1200,
        radiusM: 50,
        speedMs: 15,
        staticFrictionCoeff: 0.6,
        gravityMs2: 9.81,
      };
      const res = solveGravAstroScenario(validSpec);
      if (res.kind !== "flat-curve") throw new Error("unexpected kind");
      expect(res.details.centripetalAccelMs2).toBeCloseTo(4.5, 9);
      expect(res.details.frictionForceN).toBeCloseTo(5400, 6);
      expect(res.details.maxSafeSpeedMs).toBeCloseTo(
        Math.sqrt(0.6 * 9.81 * 50),
        9,
      );
      expect(res.details.skids).toBe(false);

      const skiddingSpec: GravAstroScenario = {
        ...validSpec,
        speedMs: 22,
      };
      const validation = validateGravAstroScenario(skiddingSpec);
      expect(validation.valid).toBe(false);
      expect(validation.issues.map((i) => i.code)).toContain(
        "SPEED_EXCEEDS_STATIC_FRICTION",
      );

      const allowedSkidCheck = solveGravAstroScenario({
        ...skiddingSpec,
        requireNoSkid: false,
      });
      if (allowedSkidCheck.kind !== "flat-curve") throw new Error("wrong kind");
      expect(allowedSkidCheck.details.skids).toBe(true);
    });

    it("solves banked curve across frictionless, down-slope, and up-slope regimes with exact force balance", () => {
      const m = 1000;
      const r = 80;
      const thetaDeg = 25;
      const theta = (thetaDeg * Math.PI) / 180;
      const g = 9.81;
      const vIdeal = Math.sqrt(g * r * Math.tan(theta));

      const frictionless = solveGravAstroScenario({
        kind: "banked-curve",
        massKg: m,
        radiusM: r,
        bankAngleDeg: thetaDeg,
        staticFrictionCoeff: 0,
        gravityMs2: g,
      });
      if (frictionless.kind !== "banked-curve") throw new Error("wrong kind");
      expect(frictionless.details.idealSpeedMs).toBeCloseTo(vIdeal, 9);
      expect(frictionless.details.frictionDirection).toBe("none");
      expect(frictionless.details.frictionForceN).toBe(0);
      expect(frictionless.details.normalForceN).toBeCloseTo(
        (m * g) / Math.cos(theta),
        6,
      );

      const fast = solveGravAstroScenario({
        kind: "banked-curve",
        massKg: m,
        radiusM: r,
        bankAngleDeg: thetaDeg,
        staticFrictionCoeff: 0.4,
        speedMs: vIdeal * 1.25,
        gravityMs2: g,
      });
      if (fast.kind !== "banked-curve") throw new Error("wrong kind");
      expect(fast.details.frictionDirection).toBe("down-slope");
      const fxFast =
        fast.details.normalForceN * Math.sin(theta) +
        fast.details.frictionForceN * Math.cos(theta);
      const fyFast =
        fast.details.normalForceN * Math.cos(theta) -
        fast.details.frictionForceN * Math.sin(theta);
      expect(fxFast).toBeCloseTo((m * (vIdeal * 1.25) ** 2) / r, 6);
      expect(fyFast).toBeCloseTo(m * g, 6);

      const slow = solveGravAstroScenario({
        kind: "banked-curve",
        massKg: m,
        radiusM: r,
        bankAngleDeg: thetaDeg,
        staticFrictionCoeff: 0.25,
        speedMs: vIdeal * 0.72,
        gravityMs2: g,
      });
      if (slow.kind !== "banked-curve") throw new Error("wrong kind");
      expect(slow.details.frictionDirection).toBe("up-slope");
      const fxSlow =
        slow.details.normalForceN * Math.sin(theta) -
        slow.details.frictionForceN * Math.cos(theta);
      const fySlow =
        slow.details.normalForceN * Math.cos(theta) +
        slow.details.frictionForceN * Math.sin(theta);
      expect(fxSlow).toBeCloseTo((m * (vIdeal * 0.72) ** 2) / r, 6);
      expect(fySlow).toBeCloseTo(m * g, 6);

      const highFriction = solveGravAstroScenario({
        kind: "banked-curve",
        massKg: m,
        radiusM: r,
        bankAngleDeg: 15,
        staticFrictionCoeff: 0.5,
        speedMs: 2,
        gravityMs2: g,
      });
      if (highFriction.kind !== "banked-curve") throw new Error("wrong kind");
      expect(highFriction.details.minSafeSpeedMs).toBe(0);
    });

    it("solves vertical circular motion in uniform, energy-conserving, rigid-rod, and over-crest modes", () => {
      const m = 0.5;
      const R = 1.6;
      const g = 9.81;
      const vMinBottom = Math.sqrt(5 * g * R);

      const criticalLoop = solveGravAstroScenario({
        kind: "vertical-circle",
        massKg: m,
        radiusM: R,
        motionMode: "energy-conserving",
        constraintKind: "string",
        referencePosition: "bottom",
        referenceSpeedMs: vMinBottom,
        gravityMs2: g,
      });
      if (criticalLoop.kind !== "vertical-circle") throw new Error("wrong kind");
      expect(criticalLoop.details.speedTopMs).toBeCloseTo(Math.sqrt(g * R), 8);
      expect(criticalLoop.details.supportForceTopN).toBeCloseTo(0, 8);
      expect(criticalLoop.details.topForceState).toBe("zero");
      expect(criticalLoop.details.supportForceBottomN).toBeCloseTo(6 * m * g, 8);

      const slackString = validateGravAstroScenario({
        kind: "vertical-circle",
        massKg: m,
        radiusM: R,
        motionMode: "uniform",
        constraintKind: "string",
        referenceSpeedMs: 0.8 * Math.sqrt(g * R),
        gravityMs2: g,
      });
      expect(slackString.valid).toBe(false);
      expect(slackString.issues.map((i) => i.code)).toContain(
        "BELOW_MINIMUM_TOP_SPEED",
      );

      const rigidRod = solveGravAstroScenario({
        kind: "vertical-circle",
        massKg: m,
        radiusM: R,
        motionMode: "uniform",
        constraintKind: "rigid-rod",
        referenceSpeedMs: 0.5 * Math.sqrt(g * R),
        gravityMs2: g,
      });
      if (rigidRod.kind !== "vertical-circle") throw new Error("wrong kind");
      expect(rigidRod.details.supportForceTopN).toBeCloseTo(-0.75 * m * g, 8);
      expect(rigidRod.details.topForceState).toBe("compression");

      const crest = solveGravAstroScenario({
        kind: "vertical-circle",
        massKg: 1000,
        radiusM: 25,
        motionMode: "uniform",
        constraintKind: "over-crest",
        referenceSpeedMs: 10,
        gravityMs2: g,
      });
      if (crest.kind !== "vertical-circle") throw new Error("wrong kind");
      expect(crest.details.supportForceTopN).toBeCloseTo(1000 * (g - 4), 6);
    });
  });

  describe("Newtonian Gravitation & Orbital Mechanics", () => {
    it("computes exterior and uniform-sphere interior gravitational field and potential with surface continuity", () => {
      const M = EARTH_MASS_KG;
      const R = EARTH_RADIUS_M;
      const G = GRAV_ASTRO_CONSTANTS.GRAVITATIONAL_CONSTANT;

      const interior = solveGravAstroScenario({
        kind: "planetary-field-potential",
        centralMassKg: M,
        planetRadiusM: R,
        probeRadiusM: 0.5 * R,
        testMassKg: 200,
      });
      if (interior.kind !== "planetary-field-potential")
        throw new Error("wrong kind");
      expect(interior.details.region).toBe("interior");
      expect(interior.details.enclosedMassKg).toBeCloseTo(M / 8, 2);
      expect(interior.details.fieldStrengthNkg).toBeCloseTo(
        0.5 * interior.details.surfaceFieldNkg,
        8,
      );
      expect(interior.details.gravitationalPotentialJkg).toBeLessThan(
        interior.details.surfacePotentialJkg,
      );

      expect(gravitationalFieldStrengthSphere(M, R, R * (1 - 1e-12), G)).toBeCloseTo(
        gravitationalFieldStrengthSphere(M, R, R, G),
        9,
      );
      expect(gravitationalPotentialSphere(M, R, R * (1 - 1e-12), G)).toBeCloseTo(
        gravitationalPotentialSphere(M, R, R, G),
        3,
      );

      const exterior = solveGravAstroScenario({
        kind: "planetary-field-potential",
        centralMassKg: M,
        planetRadiusM: R,
        probeRadiusM: 2 * R,
        testMassKg: 500,
      });
      if (exterior.kind !== "planetary-field-potential")
        throw new Error("wrong kind");
      expect(exterior.details.region).toBe("exterior");
      expect(exterior.details.fieldStrengthNkg).toBeCloseTo(
        0.25 * exterior.details.surfaceFieldNkg,
        8,
      );
      expect(exterior.details.gravitationalPotentialJkg).toBeCloseTo(
        -(G * M) / (2 * R),
        2,
      );
      expect(exterior.details.potentialEnergyJ).toBeCloseTo(
        (-500 * G * M) / (2 * R),
        0,
      );
      expect(exterior.details.escapeSpeedMs).toBeCloseTo(
        Math.sqrt((2 * G * M) / (2 * R)),
        6,
      );
    });

    it("satisfies circular orbit energy virial identities, Kepler's third law, and orbital transfer ΔE", () => {
      const r1 = 7.0e6;
      const r2 = 4.2164e7;
      const m = 1200;
      const sol = solveGravAstroScenario({
        kind: "circular-orbit-energy",
        centralMassKg: EARTH_MASS_KG,
        centralRadiusM: EARTH_RADIUS_M,
        satelliteMassKg: m,
        orbitRadiusM: r1,
        targetOrbitRadiusM: r2,
      });
      if (sol.kind !== "circular-orbit-energy") throw new Error("wrong kind");
      const d = sol.details;

      expect(d.kineticEnergyJ).toBeGreaterThan(0);
      expect(d.potentialEnergyJ).toBeLessThan(0);
      expect(d.totalEnergyJ).toBeLessThan(0);
      expect(d.totalEnergyJ).toBeCloseTo(-d.kineticEnergyJ, 2);
      expect(d.potentialEnergyJ).toBeCloseTo(2 * d.totalEnergyJ, 2);
      expect(d.kineticEnergyJ + d.potentialEnergyJ).toBeCloseTo(
        d.totalEnergyJ,
        2,
      );
      expect(d.escapeSpeedMs).toBeCloseTo(Math.SQRT2 * d.orbitalSpeedMs, 8);
      expect(d.orbitalPeriodS ** 2 / r1 ** 3).toBeCloseTo(
        d.keplerConstantS2M3,
        18,
      );

      const tr = d.transfer;
      if (!tr) throw new Error("expected orbital transfer");
      expect((tr.targetOrbitalPeriodS / d.orbitalPeriodS) ** 2).toBeCloseTo(
        (r2 / r1) ** 3,
        8,
      );
      expect(tr.transferDeltaTotalEnergyJ).toBeGreaterThan(0);
      expect(tr.transferDeltaKineticEnergyJ).toBeCloseTo(
        -tr.transferDeltaTotalEnergyJ,
        2,
      );
      expect(tr.transferDeltaPotentialEnergyJ).toBeCloseTo(
        2 * tr.transferDeltaTotalEnergyJ,
        2,
      );
      expect(tr.hohmannDeltaV1Ms).toBeGreaterThan(0);
      expect(tr.hohmannDeltaV2Ms).toBeGreaterThan(0);
    });

    it("finds exact two-body collinear gravitational null point and potential barrier peak", () => {
      const mPrimary = 81e22;
      const mSecondary = 1e22;
      const sep = 4.0e8;
      const sol = solveGravAstroScenario({
        kind: "two-body-null-point",
        primaryMassKg: mPrimary,
        primaryRadiusM: EARTH_RADIUS_M,
        secondaryMassKg: mSecondary,
        secondaryRadiusM: MOON_RADIUS_M,
        separationM: sep,
        probeDistanceFromPrimaryM: 0.9 * sep,
      });
      if (sol.kind !== "two-body-null-point") throw new Error("wrong kind");

      expect(sol.details.nullPointFraction).toBeCloseTo(0.9, 10);
      expect(sol.details.nullPointFromPrimaryM).toBeCloseTo(3.6e8, 3);
      expect(sol.details.nullPointFromSecondaryM).toBeCloseTo(0.4e8, 3);
      expect(sol.details.probeFieldXMs2).toBeCloseTo(0, 12);

      const curve = sol.curves?.potential ?? [];
      const maxCurveV = Math.max(...curve.map((p) => p.y));
      expect(maxCurveV).toBeCloseTo(sol.details.potentialAtNullPointJkg, 4);
      expect(sol.details.potentialAtNullPointJkg).toBeLessThan(0);
      expect(sol.details.potentialBarrierFromPrimaryJkg).toBeGreaterThan(0);
      expect(sol.details.minTransferSpeedFromPrimaryMs).toBeCloseTo(
        Math.sqrt(2 * sol.details.potentialBarrierFromPrimaryJkg),
        8,
      );
    });
  });

  describe("Astrophysics & Cosmology", () => {
    it("solves Wien's law, Stefan-Boltzmann luminosity, inverse-square brightness, and stellar radius recovery", () => {
      const T = 5800;
      const R = 2 * SOLAR_RADIUS_M;
      const d1 = 10 * PARSEC_M;

      const sol1 = solveGravAstroScenario({
        kind: "stellar-radiation",
        surfaceTempK: T,
        stellarRadiusM: R,
        distanceM: d1,
        comparisonStar: {
          surfaceTempK: 2900,
          stellarRadiusM: SOLAR_RADIUS_M,
        },
      });
      if (sol1.kind !== "stellar-radiation") throw new Error("wrong kind");

      expect(sol1.details.peakWavelengthM).toBeCloseTo(
        WIEN_DISPLACEMENT_MK / T,
        12,
      );
      expect(sol1.details.peakWavelengthNm).toBeCloseTo(500, 6);
      expect(sol1.details.luminosityW).toBeCloseTo(
        4 * Math.PI * R ** 2 * STEFAN_BOLTZMANN_WM2K4 * T ** 4,
        -12,
      );
      expect(sol1.details.comparison?.luminosityRatio).toBeCloseTo(
        2 ** 2 * 2 ** 4,
        8,
      );

      const sol2 = solveGravAstroScenario({
        kind: "stellar-radiation",
        surfaceTempK: T,
        stellarRadiusM: R,
        distanceM: 2 * d1,
      });
      if (sol2.kind !== "stellar-radiation") throw new Error("wrong kind");
      expect(sol2.details.apparentBrightnessWm2).toBeCloseTo(
        0.25 * sol1.details.apparentBrightnessWm2,
        14,
      );

      const recovered = stellarRadiusFromLuminosityAndWien(
        sol1.details.luminosityW,
        sol1.details.peakWavelengthM,
      );
      expect(recovered.surfaceTempK).toBeCloseTo(T, 8);
      expect(recovered.stellarRadiusM).toBeCloseTo(R, 1);
    });

    it("classifies HR diagram stars and renders descending log-T and ascending log-L coordinates", () => {
      expect(classifySpectralType(35000)).toBe("O");
      expect(classifySpectralType(5800)).toBe("G");
      expect(classifySpectralType(3200)).toBe("M");
      expect(classifyHrRegion(15000, 0.005, 0.012)).toBe("white-dwarf");
      expect(classifyHrRegion(4000, 200, 30)).toBe("red-giant");
      expect(classifyHrRegion(8000, 40000, 95)).toBe("supergiant");

      const hrSpec: GravAstroScenario = {
        kind: "hr-diagram",
        stars: [
          {
            id: "hot-ms",
            label: "HotB",
            surfaceTempK: 20000,
            luminositySolar: 1000,
          },
          {
            id: "cool-rg",
            label: "CoolRG",
            surfaceTempK: 4000,
            luminositySolar: 150,
          },
          {
            id: "wd",
            label: "SiriusB",
            surfaceTempK: 25000,
            luminositySolar: 0.02,
          },
        ],
        targetStarId: "hot-ms",
        showEvolutionTrack: true,
      };
      const sol = solveGravAstroScenario(hrSpec);
      if (sol.kind !== "hr-diagram") throw new Error("wrong kind");
      expect(sol.details.targetStar.spectralClass).toBe("B");
      expect(sol.details.targetStar.region).toBe("main-sequence");
      expect(sol.details.stars[1].region).toBe("red-giant");
      expect(sol.details.stars[2].region).toBe("white-dwarf");
      expect(sol.details.targetStar.estimatedMainSequenceMassSolar).toBeCloseTo(
        Math.pow(1000, 1 / 3.5),
        8,
      );

      const svg = renderGravAstroSvg(hrSpec);
      const circleMatches = [
        ...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="5\.5"/g),
      ];
      expect(circleMatches).toHaveLength(3);
      const [hotCircle, coolCircle, wdCircle] = circleMatches.map((m) => ({
        cx: Number(m[1]),
        cy: Number(m[2]),
      }));
      expect(hotCircle.cx).toBeLessThan(coolCircle.cx);
      expect(wdCircle.cx).toBeLessThan(hotCircle.cx);
      expect(hotCircle.cy).toBeLessThan(coolCircle.cy);
      expect(coolCircle.cy).toBeLessThan(wdCircle.cy);
    });

    it("solves stellar parallax distance in parsecs, light-years, AU, and meters", () => {
      const sol = solveGravAstroScenario({
        kind: "stellar-parallax",
        parallaxArcsec: 0.25,
        baselineAu: 1,
        stellarLuminosityW: SOLAR_LUMINOSITY_W,
      });
      if (sol.kind !== "stellar-parallax") throw new Error("wrong kind");
      expect(sol.details.distancePc).toBeCloseTo(4.0, 10);
      expect(sol.details.distanceLy).toBeCloseTo(4.0 * 3.26, 10);
      expect(sol.details.distanceM).toBeCloseTo(4.0 * PARSEC_M, 2);
      expect(sol.details.apparentBrightnessWm2).toBeCloseTo(
        SOLAR_LUMINOSITY_W / (4 * Math.PI * (4 * PARSEC_M) ** 2),
        22,
      );
    });

    it("solves cosmological redshift, cosmic scale factor ratio, recession speed, and Hubble distance", () => {
      const sol = solveGravAstroScenario({
        kind: "cosmological-redshift",
        restWavelengthM: 656.3e-9,
        observedWavelengthM: 721.93e-9,
        hubbleConstantKmSMpc: 70,
      });
      if (sol.kind !== "cosmological-redshift") throw new Error("wrong kind");
      expect(sol.details.redshiftZ).toBeCloseTo(0.1, 8);
      expect(sol.details.scaleFactorRatioNowToEmission).toBeCloseTo(1.1, 8);
      expect(sol.details.scaleFactorRatioEmissionToNow).toBeCloseTo(1 / 1.1, 8);
      expect(sol.details.recessionSpeedMs).toBeCloseTo(
        0.1 * SPEED_OF_LIGHT_MS,
        2,
      );
      expect(sol.details.recessionSpeedKmS).toBeCloseTo(30000, 4);
      expect(sol.details.distanceMpc).toBeCloseTo(30000 / 70, 6);
      expect(sol.details.hubbleTimeGyr).toBeGreaterThan(13.5);
      expect(sol.details.hubbleTimeGyr).toBeLessThan(14.5);

      const blueShift = validateGravAstroScenario({
        kind: "cosmological-redshift",
        restWavelengthM: 656.3e-9,
        observedWavelengthM: 650.0e-9,
      });
      expect(blueShift.valid).toBe(false);
      expect(blueShift.issues.map((i) => i.code)).toContain(
        "NON_POSITIVE_REDSHIFT",
      );

      const superluminalLinear = validateGravAstroScenario({
        kind: "cosmological-redshift",
        restWavelengthM: 500e-9,
        observedWavelengthM: 1200e-9,
      });
      expect(superluminalLinear.valid).toBe(false);
      expect(superluminalLinear.issues.map((i) => i.code)).toContain(
        "REDSHIFT_EXCEEDS_LINEAR_HUBBLE_REGIME",
      );
    });
  });

  describe("Zero Answer Leakage & Visibility Invariant", () => {
    it("never leaks hidden target or companion values in SVG text, title, desc, or aria-label", () => {
      const pendulumSpec: GravAstroScenario = {
        kind: "conical-pendulum",
        massKg: 2.37,
        stringLengthM: 1.83,
        semiVerticalAngleDeg: 34.2,
        visibility: {
          showDerivedValues: true,
          hiddenQuantities: ["tensionN", "semiVerticalAngleDeg"],
        },
      };
      const pendSol = solveGravAstroScenario(pendulumSpec);
      const pendSvg = renderGravAstroSvg(pendulumSpec);
      const pendText = extractSvgTextAndMeta(pendSvg);
      expect(pendText).not.toContain(
        formatQuantityValue(pendSol.quantities.tensionN),
      );
      expect(pendText).not.toContain("34.2");
      expect(pendText).toContain("1.83");

      const radiationSpec: GravAstroScenario = {
        kind: "stellar-radiation",
        surfaceTempK: 5800,
        stellarRadiusM: 1.43e9,
        distanceM: 3.19e17,
        visibility: {
          showDerivedValues: true,
          hiddenQuantities: ["peakWavelengthM"],
        },
      };
      const radSvg = renderGravAstroSvg(radiationSpec);
      const radText = extractSvgTextAndMeta(radSvg);
      expect(radText).not.toContain("500");
      expect(radText).toContain("5800");

      const redshiftSpec: GravAstroScenario = {
        kind: "cosmological-redshift",
        restWavelengthM: 486.1e-9,
        observedWavelengthM: 534.71e-9,
        hubbleConstantKmSMpc: 70,
        diagramVariant: "hubble-plot",
        visibility: {
          showDerivedValues: true,
          hiddenQuantities: ["recessionSpeedMs", "distancePc"],
        },
      };
      const redSol = solveGravAstroScenario(redshiftSpec);
      const redSvg = renderGravAstroSvg(redshiftSpec);
      const redText = extractSvgTextAndMeta(redSvg);
      expect(redText).not.toContain(
        formatQuantityValue(redSol.quantities.recessionSpeedKmS),
      );
      expect(redText).not.toContain(
        formatQuantityValue(redSol.quantities.distanceMpc),
      );

      const bankedHiddenDir: GravAstroScenario = {
        kind: "banked-curve",
        massKg: 1200,
        radiusM: 75,
        bankAngleDeg: 22,
        staticFrictionCoeff: 0.45,
        speedMs: 24.5,
        hiddenQuantities: ["frictionDirection"],
      };
      const bankedSvg = renderGravAstroSvg(bankedHiddenDir);
      expect(extractSvgTextAndMeta(bankedSvg)).not.toContain("f_s");

      const hrMasked: GravAstroScenario = {
        kind: "hr-diagram",
        stars: [
          {
            id: "s1",
            label: "Mystery Star",
            surfaceTempK: 16000,
            luminositySolar: 0.004,
          },
        ],
        hiddenQuantities: ["region", "surfaceTempK", "luminosityW"],
      };
      const hrMaskedText = extractSvgTextAndMeta(renderGravAstroSvg(hrMasked));
      expect(hrMaskedText).toContain("Region IV");
      expect(hrMaskedText).not.toContain("White Dwarfs");
      expect(hrMaskedText).not.toContain("20000");
    });

    it("enforces allowlist and symbolic-only modes and rejects numeric customLabels on hidden quantities", () => {
      const orbitSpec: GravAstroScenario = {
        kind: "circular-orbit-energy",
        centralMassKg: 5.97e24,
        centralRadiusM: 6.37e6,
        satelliteMassKg: 850,
        orbitRadiusM: 1.27e7,
        targetOrbitRadiusM: 2.54e7,
        visibility: {
          labelMode: "symbolic-only",
        },
      };
      const symbolicSvg = renderGravAstroSvg(orbitSpec);
      const symbolicText = extractSvgTextAndMeta(symbolicSvg);
      expect(symbolicText).not.toContain("1.27");
      expect(symbolicText).not.toContain("2.54");
      expect(symbolicText).toContain("E_tot");

      const badVisibility = validateGravAstroScenario({
        kind: "stellar-parallax",
        parallaxArcsec: 0.4,
        hiddenQuantities: ["distancePc"],
        visibility: {
          customLabels: {
            distancePc: "d = 2.5 pc",
          },
        },
      });
      expect(badVisibility.valid).toBe(false);
      expect(badVisibility.issues.map((i) => i.code)).toContain(
        "HIDDEN_CUSTOM_LABEL_CONFLICT",
      );

      const conflict = validateGravAstroScenario({
        kind: "stellar-parallax",
        parallaxArcsec: 0.4,
        hiddenQuantities: ["distancePc"],
        visibility: {
          visibleQuantities: ["distanceLy"],
        },
      });
      expect(conflict.valid).toBe(false);
      expect(conflict.issues.map((i) => i.code)).toContain(
        "VISIBILITY_CONFLICT",
      );
    });

    it("prevents leakage across coincident, companion, and virial quantities in text, title, desc, and aria-label", () => {
      // 1. planetary-field-potential: g0 must not leak into <desc> when fieldStrengthNkg is hidden,
      // and M must not reveal enclosedMassKg when probeRadiusM >= planetRadiusM
      const planetSurface: GravAstroScenario = {
        kind: "planetary-field-potential",
        centralMassKg: EARTH_MASS_KG,
        planetRadiusM: EARTH_RADIUS_M,
        probeRadiusM: EARTH_RADIUS_M,
        visibility: {
          showDerivedValues: true,
          hiddenQuantities: ["fieldStrengthNkg"],
        },
      };
      const planetSurfSol = solveGravAstroScenario(planetSurface);
      const planetSurfText = extractSvgTextAndMeta(
        renderGravAstroSvg(planetSurface),
      );
      expect(planetSurfText).not.toContain(
        formatQuantityValue(planetSurfSol.quantities.surfaceFieldNkg),
      );

      const planetExterior: GravAstroScenario = {
        kind: "planetary-field-potential",
        centralMassKg: EARTH_MASS_KG,
        planetRadiusM: EARTH_RADIUS_M,
        probeRadiusM: 2 * EARTH_RADIUS_M,
        visibility: {
          showDerivedValues: true,
          hiddenQuantities: ["enclosedMassKg"],
        },
      };
      expect(extractSvgTextAndMeta(renderGravAstroSvg(planetExterior))).not.toContain(
        formatQuantityValue(EARTH_MASS_KG),
      );

      // 2. vertical-circle uniform: hiding speedTopMs or speedBottomMs hides both v_top and v_bot numbers
      for (const hiddenKey of [
        "speedTopMs",
        "speedBottomMs",
        "referenceSpeedMs",
      ] as const) {
        const uniformLoop: GravAstroScenario = {
          kind: "vertical-circle",
          massKg: 1.2,
          radiusM: 1.5,
          motionMode: "uniform",
          referenceSpeedMs: 6.42,
          visibility: {
            showDerivedValues: true,
            hiddenQuantities: [hiddenKey],
          },
        };
        expect(extractSvgTextAndMeta(renderGravAstroSvg(uniformLoop))).not.toContain(
          "6.42",
        );
      }

      // 3. circular-orbit-energy: virial |E_tot| === E_k === E_bind
      for (const hiddenKey of [
        "kineticEnergyJ",
        "totalEnergyJ",
        "bindingEnergyJ",
      ] as const) {
        const orbitVirial: GravAstroScenario = {
          kind: "circular-orbit-energy",
          centralMassKg: EARTH_MASS_KG,
          centralRadiusM: EARTH_RADIUS_M,
          satelliteMassKg: 1100,
          orbitRadiusM: 1.1e7,
          targetOrbitRadiusM: 2.4e7,
          visibility: {
            showDerivedValues: true,
            hiddenQuantities: [hiddenKey],
          },
        };
        const orbSol = solveGravAstroScenario(orbitVirial);
        const orbText = extractSvgTextAndMeta(renderGravAstroSvg(orbitVirial));
        expect(orbText).not.toContain(
          formatQuantityValue(orbSol.quantities.kineticEnergyJ),
        );
      }

      // 4 & 5. banked-curve: signedSlopeFrictionN companion & smooth-bank design speed bounds
      const bankedWithFriction: GravAstroScenario = {
        kind: "banked-curve",
        massKg: 1150,
        radiusM: 65,
        bankAngleDeg: 18,
        staticFrictionCoeff: 0.45,
        speedMs: 21.3,
        visibility: {
          showDerivedValues: true,
          hiddenQuantities: ["signedSlopeFrictionN"],
        },
      };
      const bankedFricSol = solveGravAstroScenario(bankedWithFriction);
      expect(
        extractSvgTextAndMeta(renderGravAstroSvg(bankedWithFriction)),
      ).not.toContain(
        formatQuantityValue(bankedFricSol.quantities.frictionForceN),
      );

      for (const hiddenKey of [
        "idealSpeedMs",
        "minSafeSpeedMs",
        "maxSafeSpeedMs",
      ] as const) {
        const vIdeal = Math.sqrt(
          STANDARD_GRAVITY_MS2 * 80 * Math.tan((20 * Math.PI) / 180),
        );
        const smoothBank: GravAstroScenario = {
          kind: "banked-curve",
          massKg: 1050,
          radiusM: 80,
          bankAngleDeg: 20,
          staticFrictionCoeff: 0,
          speedMs: vIdeal,
          visibility: {
            showDerivedValues: true,
            hiddenQuantities: [hiddenKey],
          },
        };
        expect(extractSvgTextAndMeta(renderGravAstroSvg(smoothBank))).not.toContain(
          formatQuantityValue(vIdeal),
        );
      }

      // 6. flat-curve: non-skidding centripetalForceN === frictionForceN
      const flatNoSkid: GravAstroScenario = {
        kind: "flat-curve",
        massKg: 1300,
        radiusM: 60,
        speedMs: 14.5,
        staticFrictionCoeff: 0.65,
        visibility: {
          showDerivedValues: true,
          hiddenQuantities: ["centripetalForceN"],
        },
      };
      const flatSol = solveGravAstroScenario(flatNoSkid);
      expect(extractSvgTextAndMeta(renderGravAstroSvg(flatNoSkid))).not.toContain(
        formatQuantityValue(flatSol.quantities.frictionForceN),
      );
    });

    it("passes exhaustive per-quantity fuzz check across all 11 scenarios with showDerivedValues false and true", () => {
      const fuzzFixtures: GravAstroScenario[] = [
        ...sampleAllGravAstroScenarios("fuzz-seed-alpha"),
        ...sampleAllGravAstroScenarios("fuzz-seed-beta"),
        {
          kind: "banked-curve",
          massKg: 1200,
          radiusM: 90,
          bankAngleDeg: 22,
          staticFrictionCoeff: 0,
        },
        {
          kind: "vertical-circle",
          massKg: 1.4,
          radiusM: 1.8,
          motionMode: "uniform",
          referenceSpeedMs: 7.3,
        },
        {
          kind: "planetary-field-potential",
          centralMassKg: EARTH_MASS_KG,
          planetRadiusM: EARTH_RADIUS_M,
          probeRadiusM: EARTH_RADIUS_M,
          testMassKg: 350,
        },
      ];

      const escapedNumberPattern = (formatted: string): RegExp => {
        const escaped = formatted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const suffix = formatted.includes("× 10")
          ? "(?![\\d.])"
          : "(?![\\d.]|\\s*×\\s*10)";
        return new RegExp(`(?<![\\d.])${escaped}${suffix}`);
      };

      for (const baseSpec of fuzzFixtures) {
        const sol = solveGravAstroScenario(baseSpec);
        for (const showDerivedValues of [false, true]) {
          for (const [qKey, qVal] of Object.entries(sol.quantities)) {
            if (qVal === 0) continue;
            const specWithHidden: GravAstroScenario = {
              ...baseSpec,
              hiddenQuantities: undefined,
              visibility: {
                showDerivedValues,
                hiddenQuantities: [qKey],
              },
            };
            const svg = renderGravAstroSvg(specWithHidden);
            const allText = extractSvgTextAndMeta(svg);
            const fmtSigned = formatQuantityValue(qVal);
            const fmtMag = formatQuantityValue(Math.abs(qVal));
            expect(allText).not.toMatch(escapedNumberPattern(fmtSigned));
            if (Math.abs(qVal) !== 1) {
              expect(allText).not.toMatch(escapedNumberPattern(fmtMag));
            }
          }
        }
      }
    });
  });

  describe("Seeded Parametric Generators & SVG Integrity", () => {
    it("generates deterministic, valid scenarios across all 11 scenario kinds and renders clean SVGs", () => {
      const setA = sampleAllGravAstroScenarios("sixthphysics-seed-42");
      const setB = sampleAllGravAstroScenarios("sixthphysics-seed-42");
      expect(setA).toEqual(setB);
      expect(setA.map((s) => s.kind)).toEqual([...GRAV_ASTRO_SCENARIO_KINDS]);

      for (const scenario of setA) {
        expect(validateGravAstroScenario(scenario)).toEqual({
          valid: true,
          issues: [],
        });
        const svgA = renderGravAstroSvg(scenario);
        const svgB = renderGravAstroSvg(scenario);
        expect(svgA).toBe(svgB);
        expect(svgA.startsWith("<svg ")).toBe(true);
        expect(svgA.endsWith("</svg>")).toBe(true);
        expect(svgA).not.toMatch(/NaN|Infinity|undefined/);
      }

      const batch = generateGravAstroScenarioBatch(20261117, 55);
      expect(batch).toHaveLength(55);
      for (const item of batch) {
        expect(validateGravAstroScenario(item).valid).toBe(true);
        const sol = solveGravAstroScenario(item);
        for (const val of Object.values(sol.quantities)) {
          expect(Number.isFinite(val)).toBe(true);
        }
        const svg = renderGravAstroSvg(item);
        expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      }

      const single = generateGravAstroScenario("two-body-null-point", 99, {
        hiddenQuantities: ["nullPointFromPrimaryM"],
      });
      expect(single.kind).toBe("two-body-null-point");
      expect(renderGravAstroSvg(single)).not.toContain("x₀ =");
    });

    it("rejects out-of-range SVG dimensions cleanly", () => {
      const sample = generateGravAstroScenario("conical-pendulum", 1);
      expect(() =>
        renderGravAstroSvg(sample, { width: 200, height: 400 }),
      ).toThrow("Invalid grav-astro SVG dimensions");
    });

    it("renders all explicit diagram variants cleanly without NaN or leakage", () => {
      const variants: GravAstroScenario[] = [
        {
          kind: "planetary-field-potential",
          centralMassKg: EARTH_MASS_KG,
          planetRadiusM: EARTH_RADIUS_M,
          probeRadiusM: 1.8 * EARTH_RADIUS_M,
          plotQuantity: "field-strength",
        },
        {
          kind: "planetary-field-potential",
          centralMassKg: EARTH_MASS_KG,
          planetRadiusM: EARTH_RADIUS_M,
          probeRadiusM: 0.6 * EARTH_RADIUS_M,
          plotQuantity: "potential",
        },
        {
          kind: "circular-orbit-energy",
          centralMassKg: EARTH_MASS_KG,
          centralRadiusM: EARTH_RADIUS_M,
          satelliteMassKg: 900,
          orbitRadiusM: 1.5 * EARTH_RADIUS_M,
          targetOrbitRadiusM: 3.0 * EARTH_RADIUS_M,
          diagramVariant: "orbit-schematic",
        },
        {
          kind: "circular-orbit-energy",
          centralMassKg: EARTH_MASS_KG,
          centralRadiusM: EARTH_RADIUS_M,
          satelliteMassKg: 900,
          orbitRadiusM: 1.5 * EARTH_RADIUS_M,
          diagramVariant: "energy-curves",
        },
        {
          kind: "stellar-radiation",
          surfaceTempK: 7200,
          stellarRadiusM: 1.5 * SOLAR_RADIUS_M,
          distanceM: 15 * PARSEC_M,
          diagramVariant: "inverse-square",
        },
        {
          kind: "stellar-radiation",
          surfaceTempK: 6000,
          stellarRadiusM: SOLAR_RADIUS_M,
          distanceM: 10 * PARSEC_M,
          diagramVariant: "blackbody-curve",
          comparisonStar: {
            surfaceTempK: 4500,
            stellarRadiusM: 3 * SOLAR_RADIUS_M,
          },
          visibility: {
            visibleQuantities: ["peakWavelengthNm"],
          },
        },
        {
          kind: "cosmological-redshift",
          restWavelengthM: 486.1e-9,
          observedWavelengthM: 525.0e-9,
          diagramVariant: "spectral-shift",
        },
        {
          kind: "cosmological-redshift",
          restWavelengthM: 486.1e-9,
          observedWavelengthM: 525.0e-9,
          diagramVariant: "hubble-plot",
        },
      ];
      for (const spec of variants) {
        const svg = renderGravAstroSvg(spec);
        expect(svg.startsWith("<svg ")).toBe(true);
        expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      }
    });

    it("enforces physical boundary validation across invalid scenarios", () => {
      expect(
        validateGravAstroScenario({
          kind: "banked-curve",
          massKg: 1000,
          radiusM: 50,
          bankAngleDeg: 15,
          staticFrictionCoeff: 0.1,
          speedMs: 40,
        }).issues.map((i) => i.code),
      ).toContain("BANKED_CURVE_SKID");

      expect(
        validateGravAstroScenario({
          kind: "vertical-circle",
          massKg: 1,
          radiusM: 2,
          motionMode: "energy-conserving",
          referencePosition: "bottom",
          referenceSpeedMs: 3,
          gravityMs2: STANDARD_GRAVITY_MS2,
        }).issues.map((i) => i.code),
      ).toContain("INSUFFICIENT_ENERGY_FOR_TOP");

      expect(
        validateGravAstroScenario({
          kind: "circular-orbit-energy",
          centralMassKg: EARTH_MASS_KG,
          centralRadiusM: EARTH_RADIUS_M,
          satelliteMassKg: 500,
          orbitRadiusM: 0.9 * EARTH_RADIUS_M,
        }).issues.map((i) => i.code),
      ).toContain("ORBIT_INSIDE_CENTRAL_BODY");

      expect(
        validateGravAstroScenario({
          kind: "two-body-null-point",
          primaryMassKg: EARTH_MASS_KG,
          primaryRadiusM: EARTH_RADIUS_M,
          secondaryMassKg: 7.35e22,
          secondaryRadiusM: MOON_RADIUS_M,
          separationM: EARTH_RADIUS_M + 0.5 * MOON_RADIUS_M,
        }).issues.map((i) => i.code),
      ).toContain("OVERLAPPING_BODIES");

      expect(
        validateGravAstroScenario({
          kind: "two-body-null-point",
          primaryMassKg: EARTH_MASS_KG,
          primaryRadiusM: EARTH_RADIUS_M,
          secondaryMassKg: 7.35e22,
          secondaryRadiusM: MOON_RADIUS_M,
          separationM: EARTH_MOON_DISTANCE_M,
          probeDistanceFromPrimaryM: 0.5 * EARTH_RADIUS_M,
        }).issues.map((i) => i.code),
      ).toContain("PROBE_OUTSIDE_INTERBODY_SPACE");

      expect(
        validateGravAstroScenario({
          kind: "stellar-radiation",
          surfaceTempK: 5800,
          stellarRadiusM: SOLAR_RADIUS_M,
          distanceM: 0.5 * SOLAR_RADIUS_M,
        }).issues.map((i) => i.code),
      ).toContain("OBSERVER_INSIDE_STAR");

      expect(
        validateGravAstroScenario({
          kind: "stellar-parallax",
          parallaxArcsec: 8,
        }).issues.map((i) => i.code),
      ).toContain("PARALLAX_OUT_OF_SMALL_ANGLE_RANGE");

      const highZ = solveGravAstroScenario({
        kind: "cosmological-redshift",
        restWavelengthM: 400e-9,
        observedWavelengthM: 1200e-9,
        lowRedshiftApprox: false,
      });
      if (highZ.kind !== "cosmological-redshift") throw new Error("wrong kind");
      expect(highZ.details.redshiftZ).toBeCloseTo(2, 9);
      expect(highZ.details.relativisticSpeedMs).toBeCloseTo(
        0.8 * SPEED_OF_LIGHT_MS,
        2,
      );
    });
  });
});
