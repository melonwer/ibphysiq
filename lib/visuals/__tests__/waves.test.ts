import {
  WAVES_SCENARIO_JSON_SCHEMA,
  WAVES_SCENARIO_KINDS,
  WavesScenarioSpec,
  computeExactMaxOrder,
  createWavesRng,
  evaluateDoubleSlitRelativeIntensity,
  evaluateProgressiveWaveProfile,
  evaluateSingleSlitRelativeIntensity,
  evaluateStandingWaveEnvelope,
  exactCosDegrees,
  exactCosSquaredDegrees,
  parseWavesScenario,
  renderWavesSvg,
  sampleDiffractionGratingScenario,
  sampleDopplerEffectScenario,
  sampleDoubleSlitScenario,
  sampleMalusPolarizationScenario,
  sampleProgressiveWaveScenario,
  sampleSingleSlitScenario,
  sampleStandingWaveScenario,
  sampleWavesScenario,
  sampleWavesScenarioBatch,
  sincRadians,
  solveWavesScenario,
  validateWavesScenario,
} from "@/lib/visuals/waves";

function extractVisibleTextAndAccessibleMetadata(svg: string): string {
  const chunks: string[] = [];
  const textMatches = svg.matchAll(/<(?:text|title|desc)\b[^>]*>([\s\S]*?)<\/(?:text|title|desc)>/g);
  for (const match of textMatches) {
    chunks.push(match[1]);
  }
  const ariaMatches = svg.matchAll(/\baria-label="([^"]*)"/g);
  for (const match of ariaMatches) {
    chunks.push(match[1]);
  }
  return chunks.join(" || ");
}

function extractMainCurvePaths(svg: string): string[] {
  return [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)].map((m) => m[1]);
}

describe("Waves & Interference deterministic physics solver, validator, SVG renderer, and sampler", () => {
  describe("1. Progressive waves (y(x) and y(t), v = fλ, Δφ)", () => {
    it("solves displacement-position y(x) wave parameters and exact phase difference", () => {
      const spec = {
        kind: "progressive-wave",
        profileKind: "displacement-position",
        amplitudeM: 0.04,
        wavelengthM: 0.8,
        frequencyHz: 12.5,
        direction: "right",
        cyclesShown: 2,
        point1Coord: 0.2,
        point2Coord: 0.6,
      } as const;

      expect(validateWavesScenario(spec)).toEqual({ valid: true, issues: [] });
      const sol = solveWavesScenario(spec);

      expect(sol.waveSpeedMs).toBeCloseTo(10, 12);
      expect(sol.periodS).toBeCloseTo(0.08, 12);
      expect(sol.crestToTroughM).toBeCloseTo(0.08, 12);
      expect(sol.angularFrequencyRadS).toBeCloseTo(25 * Math.PI, 10);
      expect(sol.wavenumberRadM).toBeCloseTo(2.5 * Math.PI, 10);
      expect(sol.coordSeparation).toBeCloseTo(0.4, 12);
      expect(sol.fractionalCycles).toBeCloseTo(0.5, 12);
      expect(sol.phaseDifferenceRad).toBeCloseTo(Math.PI, 12);
      expect(sol.phaseDifferenceModulo2PiRad).toBeCloseTo(Math.PI, 12);
      expect(sol.principalPhaseDifferenceRad).toBeCloseTo(Math.PI, 12);
      expect(sol.phaseDifferenceDegrees).toBeCloseTo(180, 12);
      expect(sol.point1DisplacementM).toBeCloseTo(0.04, 12);
      expect(sol.point2DisplacementM).toBeCloseTo(-0.04, 12);
    });

    it("solves displacement-time y(t) wave profiles and multi-cycle wrapped phase differences", () => {
      const spec = {
        kind: "progressive-wave",
        profileKind: "displacement-time",
        amplitudeM: 0.025,
        wavelengthM: 1.5,
        frequencyHz: 4,
        direction: "left",
        cyclesShown: 3,
        point1Coord: 0.0625,
        point2Coord: 0.5,
      } as const;

      const sol = solveWavesScenario(spec);
      expect(sol.periodS).toBeCloseTo(0.25, 12);
      expect(sol.waveSpeedMs).toBeCloseTo(6, 12);
      // Δt = 0.4375 s = 1.75 T => total Δφ = 3.5π rad, mod 2π = 1.5π rad, principal = 0.5π rad
      expect(sol.fractionalCycles).toBeCloseTo(1.75, 12);
      expect(sol.phaseDifferenceRad).toBeCloseTo(3.5 * Math.PI, 12);
      expect(sol.phaseDifferenceModulo2PiRad).toBeCloseTo(1.5 * Math.PI, 12);
      expect(sol.principalPhaseDifferenceRad).toBeCloseTo(0.5 * Math.PI, 12);
      expect(sol.phaseDifferenceDegrees).toBeCloseTo(630, 10);

      // Verify right vs left propagation phase sign at non-zero snapshotTimeS
      const rightWave = evaluateProgressiveWaveProfile(
        {
          kind: "progressive-wave",
          profileKind: "displacement-position",
          amplitudeM: 1,
          wavelengthM: 4,
          frequencyHz: 1,
          direction: "right",
          snapshotTimeS: 0.25,
        },
        1,
      );
      const leftWave = evaluateProgressiveWaveProfile(
        {
          kind: "progressive-wave",
          profileKind: "displacement-position",
          amplitudeM: 1,
          wavelengthM: 4,
          frequencyHz: 1,
          direction: "left",
          snapshotTimeS: 0.25,
        },
        1,
      );
      // At x = λ/4 (kx = π/2) and t = T/4 (ωt = π/2):
      // right-moving sin(π/2 - π/2) = 0, left-moving sin(π/2 + π/2) = 0; check x = 0:
      expect(rightWave).toBeCloseTo(0, 12);
      expect(leftWave).toBeCloseTo(0, 12);
      expect(
        evaluateProgressiveWaveProfile(
          {
            kind: "progressive-wave",
            profileKind: "displacement-position",
            amplitudeM: 1,
            wavelengthM: 4,
            frequencyHz: 1,
            direction: "right",
            snapshotTimeS: 0.25,
          },
          0,
        ),
      ).toBeCloseTo(-1, 12);
      expect(
        evaluateProgressiveWaveProfile(
          {
            kind: "progressive-wave",
            profileKind: "displacement-position",
            amplitudeM: 1,
            wavelengthM: 4,
            frequencyHz: 1,
            direction: "left",
            snapshotTimeS: 0.25,
          },
          0,
        ),
      ).toBeCloseTo(1, 12);
    });
  });

  describe("2. Standing waves & harmonics (fixed string, open pipe, closed-one-end pipe + end correction)", () => {
    it("solves taut string harmonics from tension and linear mass density v = sqrt(T/μ)", () => {
      const spec = {
        kind: "standing-wave",
        boundaryKind: "string-fixed-both",
        lengthM: 0.75,
        harmonicNumber: 3,
        tensionN: 144,
        linearDensityKgM: 0.004,
      } as const;

      const sol = solveWavesScenario(spec);
      // v = sqrt(144 / 0.004) = sqrt(36000)? Wait: 144 / 0.004 = 36000 -> let's check exact sqrt!
      expect(sol.waveSpeedMs).toBeCloseTo(Math.sqrt(36000), 10);
      expect(sol.wavelengthM).toBeCloseTo(0.5, 12);
      expect(sol.fundamentalFrequencyHz).toBeCloseTo(Math.sqrt(36000) / 1.5, 10);
      expect(sol.harmonicFrequencyHz).toBeCloseTo(3 * (Math.sqrt(36000) / 1.5), 10);
      expect(sol.nodeCount).toBe(4);
      expect(sol.antinodeCount).toBe(3);
      expect(sol.nodePositionsM).toEqual([0, 0.25, 0.5, 0.75]);
      expect(sol.antinodePositionsM).toEqual([0.125, 0.375, 0.625]);
      expect(evaluateStandingWaveEnvelope(spec, 0)).toBe(0);
      expect(evaluateStandingWaveEnvelope(spec, 0.75)).toBe(0);
      expect(Math.abs(evaluateStandingWaveEnvelope(spec, 0.125))).toBeCloseTo(1, 12);
    });

    it("solves open-both-ends pipe harmonics with and without acoustic end correction (L_eff = L + 2e)", () => {
      const spec = {
        kind: "standing-wave",
        boundaryKind: "pipe-open-both",
        lengthM: 0.64,
        endCorrectionM: 0.02,
        harmonicNumber: 2,
        waveSpeedMs: 340,
      } as const;

      const sol = solveWavesScenario(spec);
      // L_eff = 0.64 + 2 * 0.02 = 0.68 m; n = 2 => λ = 2 * 0.68 / 2 = 0.68 m, f_2 = 340 / 0.68 = 500 Hz
      expect(sol.effectiveLengthM).toBeCloseTo(0.68, 12);
      expect(sol.wavelengthM).toBeCloseTo(0.68, 12);
      expect(sol.fundamentalFrequencyHz).toBeCloseTo(250, 12);
      expect(sol.harmonicFrequencyHz).toBeCloseTo(500, 12);
      expect(sol.nodeCount).toBe(2);
      expect(sol.antinodeCount).toBe(3);
      expect(sol.antinodePositionsM[0]).toBeCloseTo(-0.02, 12);
      expect(sol.antinodePositionsM[1]).toBeCloseTo(0.32, 12);
      expect(sol.antinodePositionsM[2]).toBeCloseTo(0.66, 12);
      expect(sol.nodePositionsM[0]).toBeCloseTo(0.15, 12);
      expect(sol.nodePositionsM[1]).toBeCloseTo(0.49, 12);
    });

    it("solves closed-one-end pipe odd harmonics with end correction (L_eff = L + e) and rejects even harmonics", () => {
      const oddSpec = {
        kind: "standing-wave",
        boundaryKind: "pipe-closed-one",
        lengthM: 0.835,
        endCorrectionM: 0.015,
        harmonicNumber: 5,
        waveSpeedMs: 340,
      } as const;

      const sol = solveWavesScenario(oddSpec);
      // L_eff = 0.85 m; λ_5 = 4 * 0.85 / 5 = 0.68 m; f_1 = 340 / 3.4 = 100 Hz; f_5 = 500 Hz
      expect(sol.effectiveLengthM).toBeCloseTo(0.85, 12);
      expect(sol.modeIndex).toBe(3);
      expect(sol.wavelengthM).toBeCloseTo(0.68, 12);
      expect(sol.fundamentalFrequencyHz).toBeCloseTo(100, 12);
      expect(sol.harmonicFrequencyHz).toBeCloseTo(500, 12);
      expect(sol.nodeCount).toBe(3);
      expect(sol.antinodeCount).toBe(3);
      expect(sol.nodePositionsM[0]).toBe(0);
      expect(sol.antinodePositionsM[2]).toBeCloseTo(0.85, 12);
      expect(evaluateStandingWaveEnvelope(oddSpec, 0)).toBe(0);
      expect(Math.abs(evaluateStandingWaveEnvelope(oddSpec, 0.85))).toBeCloseTo(1, 12);

      // Even harmonics (n = 2, 4, 6) MUST be rejected on closed-one-end pipes!
      for (const evenHarmonic of [2, 4, 6]) {
        const evenSpec = {
          ...oddSpec,
          harmonicNumber: evenHarmonic,
        };
        const validation = validateWavesScenario(evenSpec);
        expect(validation.valid).toBe(false);
        expect(validation.issues.some((i) => i.code === "closed-pipe-even-harmonic")).toBe(true);
        expect(() => solveWavesScenario(evenSpec)).toThrow(/odd harmonics only/i);
      }
    });
  });

  describe("3. Two-source & slit interference / diffraction (double-slit, grating, single-slit)", () => {
    it("solves Young's double-slit fringe spacing s = λD/d and finite-slit envelope missing orders", () => {
      const spec = {
        kind: "double-slit",
        wavelengthM: 600e-9,
        slitSeparationM: 0.3e-3,
        screenDistanceM: 2.5,
        slitWidthM: 0.075e-3,
        orderN: 3,
      } as const;

      const sol = solveWavesScenario(spec);
      // s = 600e-9 * 2.5 / 0.3e-3 = 5.0e-3 m = 5 mm
      expect(sol.fringeSpacingM).toBeCloseTo(0.005, 12);
      expect(sol.nthBrightPositionM).toBeCloseTo(0.015, 12);
      expect(sol.firstDarkPositionM).toBeCloseTo(0.0025, 12);
      expect(sol.pathDifferenceM).toBeCloseTo(1.8e-6, 15);
      // d / b = 0.3 / 0.075 = 4 -> 4th interference order coincides with 1st diffraction minimum!
      expect(sol.firstMissingOrder).toBe(4);
      expect(sol.centralEnvelopeHalfWidthM).toBeCloseTo(0.02, 12);
      expect(sol.centralEnvelopeFullWidthM).toBeCloseTo(0.04, 12);

      // Intensity at y = 0 is 1; at first dark fringe y = 0.5 s is ~0; at missing order y = 4s is ~0
      expect(evaluateDoubleSlitRelativeIntensity(spec, 0)).toBeCloseTo(1, 12);
      expect(evaluateDoubleSlitRelativeIntensity(spec, 0.0025)).toBeLessThan(1e-7);
      expect(evaluateDoubleSlitRelativeIntensity(spec, 0.02)).toBeLessThan(1e-6);
    });

    it("solves diffraction grating orders d sinθ = nλ and exact ULP-safe n_max = floor(d/λ)", () => {
      // Exact integer boundary case: d = 1.8e-6 m, λ = 600e-9 m => IEEE-754 1.8e-6 / 600e-9 = 2.9999999999999996, true floor is 3!
      expect(computeExactMaxOrder(1.8e-6, 600e-9)).toBe(3);
      expect(computeExactMaxOrder(1.799e-6, 600e-9)).toBe(2);

      const spec = {
        kind: "diffraction-grating",
        wavelengthM: 500e-9,
        slitSpacingM: 2.0e-6,
        linesPerMm: 500,
        queryOrderN: 2,
        screenDistanceM: 1.5,
      } as const;

      const sol = solveWavesScenario(spec);
      expect(sol.maxOrder).toBe(4);
      // Order 4 is at sin θ = 1 (90°), so strictly sub-90 max order is 3 => 7 maxima on a flat screen, 9 total principal orders
      expect(sol.strictlySubNinetyMaxOrder).toBe(3);
      expect(sol.totalPrincipalMaxima).toBe(9);
      expect(sol.flatScreenMaximaCount).toBe(7);
      // Order 2: sin θ_2 = 2 * 500e-9 / 2e-6 = 0.5 => θ_2 = 30°
      expect(sol.querySinTheta).toBeCloseTo(0.5, 12);
      expect(sol.queryAngleDegrees).toBeCloseTo(30, 10);
      expect(sol.queryScreenPositionM).toBeCloseTo(1.5 * Math.tan(Math.PI / 6), 10);
      expect(sol.orderAnglesDegrees[4]).toBeCloseTo(90, 10);
    });

    it("solves single-slit diffraction θ = λ/b, central maximum width, and sinc² intensity", () => {
      const spec = {
        kind: "single-slit",
        wavelengthM: 632.8e-9,
        slitWidthM: 0.15e-3,
        screenDistanceM: 2.0,
      } as const;

      const sol = solveWavesScenario(spec);
      const expectedTheta = 632.8e-9 / 0.15e-3;
      expect(sol.firstMinimumAngleRad).toBeCloseTo(expectedTheta, 12);
      expect(sol.centralAngularWidthRad).toBeCloseTo(2 * expectedTheta, 12);
      expect(sol.centralHalfWidthM).toBeCloseTo(2.0 * expectedTheta, 12);
      expect(sol.centralFullWidthM).toBeCloseTo(4.0 * expectedTheta, 12);
      expect(sol.firstSecondaryMaxRelativeIntensity).toBeCloseTo(0.04719045, 7);

      expect(sincRadians(0)).toBe(1);
      expect(evaluateSingleSlitRelativeIntensity(spec, 0)).toBe(1);
      expect(
        evaluateSingleSlitRelativeIntensity(spec, sol.centralExactHalfWidthM),
      ).toBeLessThan(1e-12);
    });
  });

  describe("4. Doppler effect & Malus's law polarization", () => {
    it("solves exact Doppler frequencies across all source and observer motion combinations", () => {
      // Source approaching stationary observer: f' = 680 * 340 / (340 - 34) = 680 * 340 / 306 = 755.555... Hz
      const approachingSource = solveWavesScenario({
        kind: "doppler-effect",
        emittedFrequencyHz: 680,
        waveSpeedMs: 340,
        sourceSpeedMs: 34,
        sourceMotion: "towards-observer",
        observerSpeedMs: 0,
        observerMotion: "stationary",
      });
      expect(approachingSource.observedFrequencyHz).toBeCloseTo(6800 / 9, 10);
      expect(approachingSource.emittedWavelengthM).toBeCloseTo(0.5, 12);
      expect(approachingSource.mediumWavelengthTowardsObserverM).toBeCloseTo(0.45, 12);
      expect(approachingSource.frequencyShiftHz).toBeGreaterThan(0);

      // Source receding, observer receding: f' = 500 * (340 - 17) / (340 + 34) = 500 * 323 / 374 = 431.81818... Hz
      const bothReceding = solveWavesScenario({
        kind: "doppler-effect",
        emittedFrequencyHz: 500,
        waveSpeedMs: 340,
        sourceSpeedMs: 34,
        sourceMotion: "away-from-observer",
        observerSpeedMs: 17,
        observerMotion: "away-from-source",
      });
      expect(bothReceding.observedFrequencyHz).toBeCloseTo((500 * 323) / 374, 10);
      expect(bothReceding.frequencyShiftHz).toBeLessThan(0);

      // Both approaching: f' = 450 * (340 + 20) / (340 - 40) = 450 * 360 / 300 = 540 Hz
      const bothApproaching = solveWavesScenario({
        kind: "doppler-effect",
        emittedFrequencyHz: 450,
        waveSpeedMs: 340,
        sourceSpeedMs: 40,
        sourceMotion: "towards-observer",
        observerSpeedMs: 20,
        observerMotion: "towards-source",
      });
      expect(bothApproaching.observedFrequencyHz).toBeCloseTo(540, 12);
      expect(bothApproaching.relativeWaveSpeedAtObserverMs).toBe(360);
    });

    it("solves Malus's law I = I0 cos²θ for polarized and unpolarized incident beams with exact special angles", () => {
      expect(exactCosDegrees(90)).toBe(0);
      expect(exactCosSquaredDegrees(90)).toBe(0);
      expect(exactCosSquaredDegrees(60)).toBe(0.25);
      expect(exactCosSquaredDegrees(45)).toBe(0.5);
      expect(exactCosSquaredDegrees(30)).toBe(0.75);

      const polarized60 = solveWavesScenario({
        kind: "malus-polarization",
        incidentIntensityWm2: 120,
        analyzerAngleDegrees: 60,
        incidentPolarization: "polarized",
      });
      expect(polarized60.intensityBeforeAnalyzerWm2).toBe(120);
      expect(polarized60.transmittedIntensityWm2).toBe(30);
      expect(polarized60.absorbedIntensityAtAnalyzerWm2).toBe(90);
      expect(polarized60.amplitudeTransmissionFactor).toBe(0.5);
      expect(polarized60.overallTransmissionFraction).toBe(0.25);

      // Crossed analyzer at 90 degrees gives exact zero intensity (no 3.7e-33 float residue)
      const crossed = solveWavesScenario({
        kind: "malus-polarization",
        incidentIntensityWm2: 80,
        analyzerAngleDegrees: 90,
      });
      expect(crossed.transmittedIntensityWm2).toBe(0);
      expect(crossed.amplitudeTransmissionFactor).toBe(0);

      // Unpolarized light through polarizer P1 then analyzer A at 30°: I = 0.5 * I0 * cos²(30°) = 0.375 * I0
      const unpolarized30 = solveWavesScenario({
        kind: "malus-polarization",
        incidentIntensityWm2: 160,
        analyzerAngleDegrees: 30,
        incidentPolarization: "unpolarized",
      });
      expect(unpolarized30.intensityBeforeAnalyzerWm2).toBe(80);
      expect(unpolarized30.transmittedIntensityWm2).toBe(60);
      expect(unpolarized30.overallTransmissionFraction).toBe(0.375);
    });
  });

  describe("5. Validation failure paths and physical guardrails", () => {
    it("rejects malformed specs, impossible physical regimes, and visibility conflicts", () => {
      expect(validateWavesScenario(null).valid).toBe(false);
      expect(validateWavesScenario({ kind: "unknown-wave" }).valid).toBe(false);

      // Incomplete phase marker pair
      expect(
        validateWavesScenario({
          kind: "progressive-wave",
          profileKind: "displacement-position",
          amplitudeM: 0.02,
          wavelengthM: 0.5,
          frequencyHz: 10,
          point1Coord: 0.1,
        }).valid,
      ).toBe(false);

      // Non-zero end correction on a string
      expect(
        validateWavesScenario({
          kind: "standing-wave",
          boundaryKind: "string-fixed-both",
          lengthM: 1,
          harmonicNumber: 2,
          waveSpeedMs: 100,
          endCorrectionM: 0.01,
        }).issues[0]?.code,
      ).toBe("string-end-correction-unsupported");

      // Inconsistent string v vs sqrt(T/μ)
      expect(
        validateWavesScenario({
          kind: "standing-wave",
          boundaryKind: "string-fixed-both",
          lengthM: 1,
          harmonicNumber: 1,
          waveSpeedMs: 50,
          tensionN: 100,
          linearDensityKgM: 0.01,
        }).issues[0]?.code,
      ).toBe("inconsistent-string-wave-speed");

      // Double-slit with λ >= d
      expect(
        validateWavesScenario({
          kind: "double-slit",
          wavelengthM: 600e-9,
          slitSeparationM: 500e-9,
          screenDistanceM: 1.5,
        }).issues[0]?.code,
      ).toBe("wavelength-exceeds-slit-separation");

      // Diffraction grating order exceeding n_max
      expect(
        validateWavesScenario({
          kind: "diffraction-grating",
          wavelengthM: 600e-9,
          slitSpacingM: 1.5e-6,
          queryOrderN: 3,
        }).issues[0]?.code,
      ).toBe("query-order-exceeds-max-order");

      // Single-slit with λ >= b
      expect(
        validateWavesScenario({
          kind: "single-slit",
          wavelengthM: 0.2e-3,
          slitWidthM: 0.1e-3,
          screenDistanceM: 1.5,
        }).issues[0]?.code,
      ).toBe("wavelength-exceeds-slit-width");

      // Supersonic Doppler source (v_s >= v) and mismatched stationary motion
      expect(
        validateWavesScenario({
          kind: "doppler-effect",
          emittedFrequencyHz: 500,
          waveSpeedMs: 340,
          sourceSpeedMs: 340,
          sourceMotion: "towards-observer",
          observerSpeedMs: 0,
          observerMotion: "stationary",
        }).issues[0]?.code,
      ).toBe("supersonic-source-unsupported");

      expect(
        validateWavesScenario({
          kind: "doppler-effect",
          emittedFrequencyHz: 500,
          waveSpeedMs: 340,
          sourceSpeedMs: 25,
          sourceMotion: "stationary",
          observerSpeedMs: 0,
          observerMotion: "stationary",
        }).issues[0]?.code,
      ).toBe("stationary-source-nonzero-speed");

      // Public + private visibility overlap
      expect(
        validateWavesScenario({
          kind: "malus-polarization",
          incidentIntensityWm2: 50,
          analyzerAngleDegrees: 45,
          visibility: {
            publicParameterIds: ["analyzerAngleDegrees"],
            privateParameterIds: ["analyzerAngleDegrees"],
          },
        }).issues[0]?.code,
      ).toBe("public-private-overlap");

      expect(() => parseWavesScenario({ kind: "bad" })).toThrow(/Invalid waves scenario/);
    });

    it("exports a valid constrained-decoding JSON schema covering all 7 wave scenario kinds", () => {
      expect(WAVES_SCENARIO_JSON_SCHEMA.$schema).toContain("json-schema.org");
      const oneOf = WAVES_SCENARIO_JSON_SCHEMA.oneOf as Array<Record<string, unknown>>;
      expect(oneOf).toHaveLength(WAVES_SCENARIO_KINDS.length);
    });
  });

  describe("6. SVG structure, determinism, and ZERO answer-leakage invariant", () => {
    const representativeSpecs: WavesScenarioSpec[] = [
      {
        id: "prog-1",
        kind: "progressive-wave",
        profileKind: "displacement-position",
        amplitudeM: 0.037,
        wavelengthM: 0.64,
        frequencyHz: 17.5,
        point1Coord: 0.16,
        point2Coord: 0.48,
      },
      {
        id: "stand-1",
        kind: "standing-wave",
        boundaryKind: "pipe-closed-one",
        lengthM: 0.73,
        endCorrectionM: 0.018,
        harmonicNumber: 3,
        waveSpeedMs: 341,
      },
      {
        id: "dslit-1",
        kind: "double-slit",
        wavelengthM: 589e-9,
        slitSeparationM: 0.27e-3,
        screenDistanceM: 2.3,
        slitWidthM: 0.068e-3,
      },
      {
        id: "grat-1",
        kind: "diffraction-grating",
        wavelengthM: 532e-9,
        slitSpacingM: 2.5e-6,
        linesPerMm: 400,
        queryOrderN: 2,
        screenDistanceM: 1.7,
      },
      {
        id: "sslit-1",
        kind: "single-slit",
        wavelengthM: 633e-9,
        slitWidthM: 0.14e-3,
        screenDistanceM: 1.9,
      },
      {
        id: "dopp-1",
        kind: "doppler-effect",
        emittedFrequencyHz: 612,
        waveSpeedMs: 343,
        sourceSpeedMs: 29,
        sourceMotion: "towards-observer",
        observerSpeedMs: 14,
        observerMotion: "towards-source",
      },
      {
        id: "malus-1",
        kind: "malus-polarization",
        incidentIntensityWm2: 94,
        analyzerAngleDegrees: 37,
        incidentPolarization: "unpolarized",
      },
    ];

    it.each(representativeSpecs)(
      "renders valid, accessible, deterministic SVG without NaN/Infinity for $kind",
      (spec) => {
        const svg1 = renderWavesSvg(spec);
        const svg2 = renderWavesSvg(spec);
        expect(svg1).toBe(svg2);
        expect(svg1.startsWith("<svg ")).toBe(true);
        expect(svg1.endsWith("</svg>")).toBe(true);
        expect(svg1).toContain('viewBox="0 0 680 420"');
        expect(svg1).toContain('role="img"');
        expect(svg1).toContain("<title>");
        expect(svg1).toContain("<desc>");
        expect(svg1).not.toMatch(/NaN|Infinity|undefined/);
      },
    );

    it("never leaks hidden target quantities in text, <title>, <desc>, aria-label, or attributes while keeping geometry physically exact", () => {
      // 1. Progressive wave: hide waveSpeedMs (11.2 m/s), wavelengthM (0.64 m), amplitudeM (0.037 m)
      const progBase = representativeSpecs[0];
      const progFullSvg = renderWavesSvg(progBase);
      const progHiddenSvg = renderWavesSvg({
        ...progBase,
        title: "Wave with wavelengthM 0.64 m and speed 11.2",
        hiddenQuantities: ["waveSpeedMs", "wavelengthM", "amplitudeM", "phaseDifferenceRad"],
      });
      const progVisibleText = extractVisibleTextAndAccessibleMetadata(progHiddenSvg);
      expect(progFullSvg).toContain("11.2");
      expect(progFullSvg).toContain("0.64");
      expect(progVisibleText).not.toContain("11.2");
      expect(progVisibleText).not.toContain("0.64");
      expect(progVisibleText).not.toContain("37");
      expect(progVisibleText).not.toContain("0.037");
      expect(progVisibleText).not.toContain("180°");
      expect(progHiddenSvg).not.toContain("waveSpeedMs");
      expect(progHiddenSvg).not.toContain("wavelengthM");
      // Sinusoidal curve path d attribute remains 100% identical!
      expect(extractMainCurvePaths(progHiddenSvg)[1]).toBe(
        extractMainCurvePaths(progFullSvg)[1],
      );

      // 2. Standing wave: hide harmonicNumber (3) and harmonicFrequencyHz (342 Hz)
      const standBase = representativeSpecs[1];
      const standFullSvg = renderWavesSvg(standBase);
      const standHiddenSvg = renderWavesSvg({
        ...standBase,
        hiddenQuantities: ["harmonicNumber", "harmonicFrequencyHz", "lengthM"],
      });
      const standText = extractVisibleTextAndAccessibleMetadata(standHiddenSvg);
      expect(standFullSvg).toContain("n = 3");
      expect(standText).not.toContain("n = 3");
      expect(standText).not.toContain("342");
      expect(standText).not.toContain("0.73");
      expect(extractMainCurvePaths(standHiddenSvg)).toEqual(
        extractMainCurvePaths(standFullSvg),
      );

      // 3. Double-slit: hide fringeSpacingM (5.02 mm)
      const dslitBase = representativeSpecs[2];
      const dslitFullSvg = renderWavesSvg(dslitBase);
      const dslitHiddenSvg = renderWavesSvg({
        ...dslitBase,
        hiddenQuantities: ["fringeSpacingM"],
      });
      expect(dslitFullSvg).toContain("5.02 mm");
      expect(extractVisibleTextAndAccessibleMetadata(dslitHiddenSvg)).not.toContain("5.02");
      expect(extractMainCurvePaths(dslitHiddenSvg)).toEqual(
        extractMainCurvePaths(dslitFullSvg),
      );

      // 4. Diffraction grating: hide maxOrder (4) and queryAngleDegrees (25.2°)
      const gratBase = representativeSpecs[3];
      const gratFullSvg = renderWavesSvg(gratBase);
      const gratHiddenSvg = renderWavesSvg({
        ...gratBase,
        hiddenQuantities: ["maxOrder", "queryAngleDegrees"],
      });
      const gratText = extractVisibleTextAndAccessibleMetadata(gratHiddenSvg);
      expect(gratFullSvg).toContain("n_max = 4");
      expect(gratFullSvg).toContain("25.2°");
      expect(gratText).not.toContain("n_max");
      expect(gratText).not.toContain("n = +4");
      expect(gratText).not.toContain("25.2");

      // 5. Single-slit: hide centralFullWidthM (17.2 mm) and firstMinimumAngleRad
      const sslitBase = representativeSpecs[4];
      const sslitFullSvg = renderWavesSvg(sslitBase);
      const sslitHiddenSvg = renderWavesSvg({
        ...sslitBase,
        hiddenQuantities: ["centralFullWidthM", "firstMinimumAngleRad"],
      });
      const sslitText = extractVisibleTextAndAccessibleMetadata(sslitHiddenSvg);
      expect(sslitFullSvg).toContain("17.2 mm");
      expect(sslitText).not.toContain("17.2");
      expect(sslitText).not.toContain("0.00452");
      expect(extractMainCurvePaths(sslitHiddenSvg)[1]).toBe(
        extractMainCurvePaths(sslitFullSvg)[1],
      );

      // 6. Doppler effect: hide observedFrequencyHz (696 Hz)
      const doppBase = representativeSpecs[5];
      const doppFullSvg = renderWavesSvg(doppBase);
      const doppHiddenSvg = renderWavesSvg({
        ...doppBase,
        hiddenQuantities: ["observedFrequencyHz"],
      });
      expect(doppFullSvg).toContain("696 Hz");
      expect(extractVisibleTextAndAccessibleMetadata(doppHiddenSvg)).not.toContain("696");

      // 7. Malus polarization: hide transmittedIntensityWm2 (30 W m⁻²) and analyzerAngleDegrees (37°)
      const malusBase = representativeSpecs[6];
      const malusFullSvg = renderWavesSvg(malusBase);
      const malusHiddenSvg = renderWavesSvg({
        ...malusBase,
        hiddenQuantities: ["transmittedIntensityWm2", "analyzerAngleDegrees"],
      });
      const malusText = extractVisibleTextAndAccessibleMetadata(malusHiddenSvg);
      expect(malusFullSvg).toContain("30 W m⁻²");
      expect(malusFullSvg).toContain("37°");
      expect(malusText).not.toContain("30 W m⁻²");
      expect(malusText).not.toContain("37°");
    });

    it("supports StudentVisibilityPolicy allowlist mode and rejects invalid SVG render dimensions", () => {
      const spec: WavesScenarioSpec = {
        kind: "malus-polarization",
        incidentIntensityWm2: 100,
        analyzerAngleDegrees: 60,
        visibility: {
          publicParameterIds: ["incidentIntensityWm2"],
          privateParameterIds: ["transmittedIntensityWm2"],
          labelMode: "allowlist",
          altTextMode: "student-safe",
        },
      };
      const svg = renderWavesSvg(spec);
      const text = extractVisibleTextAndAccessibleMetadata(svg);
      expect(text).toContain("100 W m⁻²");
      expect(text).not.toContain("25 W m⁻²");
      expect(text).not.toContain("60°");

      expect(() => renderWavesSvg(spec, { width: 200, height: 420 })).toThrow(
        /Invalid waves SVG dimensions/,
      );
      expect(() => renderWavesSvg(spec, { significantFigures: 9 })).toThrow(
        /Invalid significantFigures/,
      );
    });
  });

  describe("7. Parametric random-valid-scenario sampling helpers for bulk generation", () => {
    it("produces reproducible seeded samples across all 7 scenario families and syllabus levels", () => {
      const rng1 = createWavesRng("sixthphysics-seed-alpha");
      const rng2 = createWavesRng("sixthphysics-seed-alpha");
      expect(rng1()).toBe(rng2());
      expect(rng1()).toBe(rng2());

      const individualSamplers = [
        sampleProgressiveWaveScenario,
        sampleStandingWaveScenario,
        sampleDoubleSlitScenario,
        sampleDiffractionGratingScenario,
        sampleSingleSlitScenario,
        sampleDopplerEffectScenario,
        sampleMalusPolarizationScenario,
      ];

      for (const sampler of individualSamplers) {
        const pkg = sampler({ seed: 424242 });
        expect(validateWavesScenario(pkg.spec)).toEqual({
          valid: true,
          issues: [],
        });
        expect(pkg.spec.hiddenQuantities).toEqual([pkg.targetQuantity]);
        const svg = renderWavesSvg(pkg.spec);
        expect(svg.startsWith("<svg ")).toBe(true);
        expect(svg).not.toMatch(/NaN|Infinity|undefined/);
        expect(svg).not.toContain(pkg.targetQuantity);
      }

      // IB-SL filtering excludes HL-only single-slit / grating / general acoustic Doppler
      for (let seed = 1; seed <= 25; seed += 1) {
        const slPkg = sampleWavesScenario({ seed, syllabusLevel: "IB-SL" });
        expect(slPkg.syllabusLevels).toContain("IB-SL");
        expect(["progressive-wave", "standing-wave", "double-slit", "malus-polarization"]).toContain(
          slPkg.spec.kind,
        );
      }
    });

    it("generates a diverse, deterministic, collision-free batch of 60 verified scenarios", () => {
      const batchA = sampleWavesScenarioBatch(60, { seed: "wave-bank-2026" });
      const batchB = sampleWavesScenarioBatch(60, { seed: "wave-bank-2026" });
      expect(batchA).toEqual(batchB);
      expect(batchA).toHaveLength(60);

      const kindsSeen = new Set(batchA.map((item) => item.spec.kind));
      expect(kindsSeen.size).toBe(WAVES_SCENARIO_KINDS.length);

      const forbiddenAssignPrefixByTarget: Partial<Record<string, string>> = {
        waveSpeedMs: "v =",
        phaseDifferenceRad: "Δφ =",
        harmonicFrequencyHz: "f =",
        fundamentalFrequencyHz: "f =",
        frequencyHz: "f =",
        harmonicNumber: "n =",
        fringeSpacingM: "s =",
        queryAngleDegrees: "θ =",
        maxOrder: "n_max =",
        totalPrincipalMaxima: "n_max =",
        firstMinimumAngleRad: "θ =",
        centralFullWidthM: "w =",
        centralHalfWidthM: "w =",
        slitWidthM: "b =",
        observedFrequencyHz: "f′ =",
        frequencyShiftHz: "f′ =",
        sourceSpeedMs: "v_s =",
        observerSpeedMs: "v_o =",
        mediumWavelengthTowardsObserverM: "λ′ =",
        transmittedIntensityWm2: "I =",
        analyzerAngleDegrees: "θ =",
        incidentIntensityWm2: "I₀ =",
      };

      for (const item of batchA) {
        expect(validateWavesScenario(item.spec).valid).toBe(true);
        const svg = renderWavesSvg(item.spec);
        expect(svg).not.toMatch(/NaN|Infinity|undefined/);
        expect(svg).not.toContain(item.targetQuantity);

        const forbiddenPrefix = forbiddenAssignPrefixByTarget[item.targetQuantity];
        if (forbiddenPrefix) {
          expect(extractVisibleTextAndAccessibleMetadata(svg)).not.toContain(
            forbiddenPrefix,
          );
        }
      }
    });

    it("verifies harmonic series ratios (1:2:3 open/string vs 1:3:5:7 closed-one-end) and observer-only Doppler physics", () => {
      const closedHarmonics = [1, 3, 5, 7].map(
        (n) =>
          solveWavesScenario({
            kind: "standing-wave",
            boundaryKind: "pipe-closed-one",
            lengthM: 0.85,
            harmonicNumber: n,
            waveSpeedMs: 340,
          }).harmonicFrequencyHz,
      );
      expect(closedHarmonics).toEqual([100, 300, 500, 700]);

      const openHarmonics = [1, 2, 3, 4].map(
        (n) =>
          solveWavesScenario({
            kind: "standing-wave",
            boundaryKind: "pipe-open-both",
            lengthM: 0.85,
            harmonicNumber: n,
            waveSpeedMs: 340,
          }).harmonicFrequencyHz,
      );
      expect(openHarmonics).toEqual([200, 400, 600, 800]);

      // Moving observer with stationary source does NOT alter medium wavelength λ' = λ
      const movingObserver = solveWavesScenario({
        kind: "doppler-effect",
        emittedFrequencyHz: 500,
        waveSpeedMs: 340,
        sourceSpeedMs: 0,
        sourceMotion: "stationary",
        observerSpeedMs: 34,
        observerMotion: "towards-source",
      });
      expect(movingObserver.emittedWavelengthM).toBeCloseTo(0.68, 12);
      expect(movingObserver.mediumWavelengthTowardsObserverM).toBeCloseTo(0.68, 12);
      expect(movingObserver.relativeWaveSpeedAtObserverMs).toBe(374);
      expect(movingObserver.observedFrequencyHz).toBeCloseTo(550, 12);
    });

    it("escapes XML special characters in custom labels and suppresses custom labels when hidden", () => {
      const publicCustomSvg = renderWavesSvg({
        kind: "progressive-wave",
        profileKind: "displacement-position",
        amplitudeM: 0.05,
        wavelengthM: 1.0,
        frequencyHz: 10,
        title: 'Wave <A & B> "test"',
        customLabels: {
          amplitudeM: "A <max & peak>",
        },
      });
      expect(publicCustomSvg).toContain("A &lt;max &amp; peak&gt;");
      expect(publicCustomSvg).toContain("Wave &lt;A &amp; B&gt; &quot;test&quot;");

      const hiddenCustomSvg = renderWavesSvg({
        kind: "progressive-wave",
        profileKind: "displacement-position",
        amplitudeM: 0.05,
        wavelengthM: 1.0,
        frequencyHz: 10,
        hiddenQuantities: ["amplitudeM"],
        customLabels: {
          amplitudeM: "SECRET_AMP_LABEL_999",
        },
      });
      expect(hiddenCustomSvg).not.toContain("SECRET_AMP_LABEL_999");
    });

    it("passes exhaustive per-quantity zero-leakage fuzz check across every solved quantity key and degenerate boundary case", () => {
      const fuzzScenarios: WavesScenarioSpec[] = [
        {
          kind: "progressive-wave",
          profileKind: "displacement-position",
          amplitudeM: 0.042,
          wavelengthM: 0.76,
          frequencyHz: 15,
          point1Coord: 0,
          point2Coord: 0.19,
        },
        {
          kind: "progressive-wave",
          profileKind: "displacement-time",
          amplitudeM: 0.031,
          wavelengthM: 1.24,
          frequencyHz: 8,
          point1Coord: 0.025,
          point2Coord: 0.0875,
        },
        // Degenerate standing wave: e = 0 (effectiveLengthM === lengthM), n = 1 (harmonicFrequencyHz === fundamentalFrequencyHz)
        {
          kind: "standing-wave",
          boundaryKind: "string-fixed-both",
          lengthM: 0.92,
          harmonicNumber: 1,
          tensionN: 81,
          linearDensityKgM: 0.009,
        },
        // n = 2 string: wavelengthM === lengthM, antinodeCount === harmonicNumber === modeIndex === 2
        {
          kind: "standing-wave",
          boundaryKind: "string-fixed-both",
          lengthM: 0.84,
          harmonicNumber: 2,
          waveSpeedMs: 168,
        },
        {
          kind: "standing-wave",
          boundaryKind: "pipe-closed-one",
          lengthM: 0.65,
          harmonicNumber: 3,
          waveSpeedMs: 338,
        },
        // orderN = 1 double-slit: nthBrightPositionM === fringeSpacingM, pathDifferenceM === wavelengthM
        {
          kind: "double-slit",
          wavelengthM: 633e-9,
          slitSeparationM: 0.24e-3,
          screenDistanceM: 1.9,
          slitWidthM: 0.06e-3,
          orderN: 1,
        },
        {
          kind: "diffraction-grating",
          wavelengthM: 532e-9,
          slitSpacingM: 2.0e-6,
          linesPerMm: 500,
          queryOrderN: 2,
          screenDistanceM: 1.4,
        },
        {
          kind: "single-slit",
          wavelengthM: 589e-9,
          slitWidthM: 0.12e-3,
          screenDistanceM: 2.1,
        },
        // Stationary-observer & stationary-source Doppler cases (v_rel === v or λ' === λ)
        {
          kind: "doppler-effect",
          emittedFrequencyHz: 510,
          waveSpeedMs: 340,
          sourceSpeedMs: 34,
          sourceMotion: "towards-observer",
          observerSpeedMs: 0,
          observerMotion: "stationary",
        },
        {
          kind: "doppler-effect",
          emittedFrequencyHz: 480,
          waveSpeedMs: 340,
          sourceSpeedMs: 0,
          sourceMotion: "stationary",
          observerSpeedMs: 25,
          observerMotion: "towards-source",
        },
        // Degenerate Malus θ = 0° (I === I_before === I_0) and θ = 90° (I === 0)
        {
          kind: "malus-polarization",
          incidentIntensityWm2: 140,
          analyzerAngleDegrees: 0,
          incidentPolarization: "polarized",
        },
        {
          kind: "malus-polarization",
          incidentIntensityWm2: 140,
          analyzerAngleDegrees: 90,
          incidentPolarization: "unpolarized",
        },
      ];

      for (const baseSpec of fuzzScenarios) {
        const sol = solveWavesScenario(baseSpec);
        for (const [key, val] of Object.entries(sol.quantities)) {
          const svg = renderWavesSvg({
            ...baseSpec,
            hiddenQuantities: [key],
          });
          expect(svg).not.toContain(key);
          const visible = extractVisibleTextAndAccessibleMetadata(svg);
          const withoutPowersOfTen = visible.replace(/×\s*10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, " ");
          const visibleTokens = new Set(
            [...withoutPowersOfTen.matchAll(/[0-9]+(?:\.[0-9]+)?/g)].map((m) => m[0]),
          );

          const absVal = Math.abs(val);
          if (absVal < 1e-15) {
            expect(visibleTokens.has("0")).toBe(false);
          } else if (absVal >= 1e-3 && absVal < 1e4) {
            const formatted3 = String(Number(absVal.toPrecision(3)));
            expect(visibleTokens.has(formatted3)).toBe(false);
          }
        }
      }
    });
  });
});
