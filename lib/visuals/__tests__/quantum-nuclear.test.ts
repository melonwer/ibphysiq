import {
  bohrEnergyEv,
  CODATA_CONSTANTS,
  DATA_BOOKLET_CONSTANTS,
  evToJoules,
  extractQuantumNuclearQuantityMap,
  formatCleanTick,
  formatNuclidePlain,
  formatScientificSigFigs,
  generateQuantumNuclearBatch,
  generateQuantumNuclearScenario,
  joulesToEv,
  lorentzFactorFromBeta,
  mevToJoules,
  nuclearRadiusM,
  QuantumNuclearScenarioSpec,
  relativisticVelocityAdditionFractionC,
  renderQuantumNuclearSvg,
  rutherfordClosestApproachM,
  sampleQuantumNuclearSpec,
  solveEnergyLevels,
  solveMatterWaves,
  solveNuclearBinding,
  solveNuclearDecayChain,
  solvePhotoelectricEffect,
  solveQuantumNuclearScenario,
  solveRadioactiveDecay,
  solveRutherfordScattering,
  solveSpecialRelativity,
  toSubscript,
  toSuperscript,
  validateQuantumNuclearScenario,
} from "../quantum-nuclear";

describe("quantum-nuclear physics solver, validator, SVG renderer, and generators", () => {
  describe("1. Atomic Energy Levels & Spectra", () => {
    it("solves Bohr hydrogen levels, ionization energy, and Lyman/Balmer/Paschen transitions", () => {
      const solution = solveEnergyLevels({
        kind: "energy-levels",
        atomModel: "bohr-hydrogen",
        atomicNumberZ: 1,
        maxPrincipalN: 4,
        includeContinuumZero: true,
        transitions: [
          { id: "lyman-alpha", fromLevelId: "n=2", toLevelId: "n=1", label: "Lα" },
          { id: "balmer-alpha", fromLevelId: "n=3", toLevelId: "n=2", label: "Hα" },
          { id: "paschen-alpha", fromLevelId: "n=4", toLevelId: "n=3", label: "Pα" },
          { id: "absorb-1-3", fromLevelId: "n=1", toLevelId: "n=3", label: "A₁" },
        ],
      });

      expect(solution.levels).toHaveLength(5);
      expect(solution.groundStateEnergyEv).toBeCloseTo(-13.6, 6);
      expect(solution.ionizationEnergyEv).toBeCloseTo(13.6, 6);
      expect(solution.ionizationEnergyJ).toBeCloseTo(13.6 * 1.6e-19, 25);

      const n2 = solution.levels.find((l) => l.id === "n=2")!;
      const n3 = solution.levels.find((l) => l.id === "n=3")!;
      const n4 = solution.levels.find((l) => l.id === "n=4")!;
      expect(n2.energyEv).toBeCloseTo(-3.4, 6);
      expect(n3.energyEv).toBeCloseTo(-13.6 / 9, 6);
      expect(n4.energyEv).toBeCloseTo(-0.85, 6);

      const lyman = solution.transitions[0];
      expect(lyman.process).toBe("emission");
      expect(lyman.deltaEnergyEv).toBeCloseTo(10.2, 6);
      expect(lyman.wavelengthNm).toBeCloseTo(
        ((6.63e-34 * 3.0e8) / (10.2 * 1.6e-19)) * 1e9,
        4,
      );
      expect(lyman.spectralRegion).toBe("ultraviolet");
      expect(lyman.hydrogenSeries).toBe("Lyman");

      const balmer = solution.transitions[1];
      expect(balmer.process).toBe("emission");
      expect(balmer.spectralRegion).toBe("visible");
      expect(balmer.hydrogenSeries).toBe("Balmer");

      const paschen = solution.transitions[2];
      expect(paschen.spectralRegion).toBe("infrared");
      expect(paschen.hydrogenSeries).toBe("Paschen");

      const absorb = solution.transitions[3];
      expect(absorb.process).toBe("absorption");
      expect(absorb.signedDeltaEnergyEv).toBeGreaterThan(0);
    });

    it("supports hydrogenic ions (Z = 2 He+) and custom Joule-specified levels", () => {
      expect(bohrEnergyEv(1, 2)).toBeCloseTo(-54.4, 6);
      expect(bohrEnergyEv(2, 2)).toBeCloseTo(-13.6, 6);

      const custom = solveEnergyLevels({
        kind: "energy-levels",
        atomModel: "custom",
        atomName: "Hypothetical atom",
        levels: [
          { id: "g", label: "ground", energyValue: -8.0e-19, energyUnit: "J" },
          { id: "e1", label: "first excited", energyValue: -3.2e-19, energyUnit: "J" },
        ],
        transitions: [{ id: "t1", fromLevelId: "e1", toLevelId: "g" }],
      });
      expect(custom.groundStateEnergyEv).toBeCloseTo(-5.0, 6);
      expect(custom.transitions[0].photonEnergyJ).toBeCloseTo(4.8e-19, 25);
      expect(custom.transitions[0].frequencyHz / 1e14).toBeCloseTo(
        4.8e-19 / 6.63e-34 / 1e14,
        10,
      );
    });

    it("renders downward emission arrows, upward absorption arrows, and spectral strip", () => {
      const svg = renderQuantumNuclearSvg({
        id: "bohr-svg-check",
        kind: "energy-levels",
        atomModel: "bohr-hydrogen",
        maxPrincipalN: 3,
        transitions: [
          { id: "emit", fromLevelId: "n=3", toLevelId: "n=2", label: "T₁" },
          { id: "abs", fromLevelId: "n=1", toLevelId: "n=2", label: "T₂" },
        ],
        showSpectralStrip: true,
      });

      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('role="img"');
      expect(svg).toContain("Emission line spectrum");
      expect(svg).toContain("marker-end=\"url(#qn-emit-bohr-svg-check)\"");
      expect(svg).toContain("marker-end=\"url(#qn-absorb-bohr-svg-check)\"");
    });
  });

  describe("2. Photoelectric Effect & Matter Waves", () => {
    it("solves Einstein photoelectric equation above, at, and below threshold frequency", () => {
      const above = solvePhotoelectricEffect({
        kind: "photoelectric-effect",
        metalName: "Sodium",
        workFunctionEv: 2.28,
        incidentWavelengthNm: 400,
        plotMode: "stopping-potential-vs-f",
        comparisonMetalName: "Zinc",
        comparisonWorkFunctionEv: 4.33,
      });

      const expectedF = (3.0e8 * 1e9) / 400;
      const expectedPhotonEv = (6.63e-34 * expectedF) / 1.6e-19;
      expect(above.incidentFrequencyHz / 1e14).toBeCloseTo(expectedF / 1e14, 10);
      expect(above.emitsPhotoelectrons).toBe(true);
      expect(above.maxKineticEnergyEv).toBeCloseTo(expectedPhotonEv - 2.28, 6);
      expect(above.stoppingPotentialV).toBeCloseTo(expectedPhotonEv - 2.28, 6);
      expect(above.graphSlope).toBeCloseTo(6.63e-34 / 1.6e-19, 22);
      expect(above.yIntercept).toBeCloseTo(-2.28, 6);
      expect(above.comparison?.thresholdFrequencyHz).toBeGreaterThan(
        above.thresholdFrequencyHz,
      );

      // Below threshold: no photoelectrons, zero max Ek and stopping potential
      const below = solvePhotoelectricEffect({
        kind: "photoelectric-effect",
        workFunctionEv: 4.33,
        incidentWavelengthNm: 650,
        plotMode: "ek-j-vs-f",
      });
      expect(below.emitsPhotoelectrons).toBe(false);
      expect(below.signedEnergyBalanceEv).toBeLessThan(0);
      expect(below.maxKineticEnergyJ).toBe(0);
      expect(below.stoppingPotentialV).toBe(0);
      expect(below.graphSlope).toBeCloseTo(DATA_BOOKLET_CONSTANTS.planckConstantJs, 40);

      // Exact threshold
      const f0 = (2.5 * 1.6e-19) / 6.63e-34;
      const atThreshold = solvePhotoelectricEffect({
        kind: "photoelectric-effect",
        workFunctionEv: 2.5,
        incidentFrequencyHz: f0,
      });
      expect(atThreshold.emitsPhotoelectrons).toBe(true);
      expect(atThreshold.maxKineticEnergyEv).toBeCloseTo(0, 10);
      expect(atThreshold.stoppingPotentialV).toBeCloseTo(0, 10);
    });

    it("computes consistent de Broglie wavelengths across voltage, Ek, speed, momentum, and crystal diffraction", () => {
      const byVoltage = solveMatterWaves({
        kind: "matter-waves",
        particle: "electron",
        acceleratingVoltageV: 150,
        latticeSpacingM: 2.13e-10,
        screenDistanceM: 0.15,
      });

      const expectedLambda =
        6.63e-34 / Math.sqrt(2 * 9.11e-31 * 1.6e-19 * 150);
      expect(byVoltage.deBroglieWavelengthM).toBeCloseTo(expectedLambda, 18);
      expect(byVoltage.diffraction).toBeDefined();
      expect(byVoltage.diffraction!.sinTheta).toBeCloseTo(
        expectedLambda / 2.13e-10,
        8,
      );

      const byEkEv = solveMatterWaves({
        kind: "matter-waves",
        particle: "electron",
        kineticEnergyEv: 150,
      });
      const bySpeed = solveMatterWaves({
        kind: "matter-waves",
        particle: "electron",
        speedMs: byVoltage.speedMs,
      });
      const byMomentum = solveMatterWaves({
        kind: "matter-waves",
        particle: "electron",
        momentumNs: byVoltage.momentumNs,
      });

      expect(byEkEv.deBroglieWavelengthM).toBeCloseTo(byVoltage.deBroglieWavelengthM, 18);
      expect(bySpeed.deBroglieWavelengthM).toBeCloseTo(byVoltage.deBroglieWavelengthM, 18);
      expect(byMomentum.deBroglieWavelengthM).toBeCloseTo(byVoltage.deBroglieWavelengthM, 18);

      // Alpha particle carries charge +2e -> shorter wavelength at same voltage
      const alpha = solveMatterWaves({
        kind: "matter-waves",
        particle: "alpha",
        acceleratingVoltageV: 150,
      });
      expect(alpha.kineticEnergyEv).toBeCloseTo(300, 6);
      expect(alpha.deBroglieWavelengthM).toBeLessThan(byVoltage.deBroglieWavelengthM);

      // Neutral thermal neutron
      const neutron = solveMatterWaves({
        kind: "matter-waves",
        particle: "neutron",
        speedMs: 2200,
      });
      expect(neutron.acceleratingVoltageV).toBeNull();
      expect(neutron.deBroglieWavelengthM).toBeCloseTo(
        6.63e-34 / (1.675e-27 * 2200),
        18,
      );
    });
  });

  describe("3. Radioactive Decay & Nuclear Physics", () => {
    it("handles multi-unit half-lives, SI Becquerel conversion, and background count rate", () => {
      const decay = solveRadioactiveDecay({
        kind: "radioactive-decay",
        nuclideLabel: "⁹⁹ᵐTc",
        timeUnit: "h",
        halfLife: 6.0,
        elapsedTime: 18.0,
        initialNuclei: 1.0e12,
        initialTotalCountRate: 830,
        backgroundCountRate: 30,
      });

      expect(decay.numberOfHalfLives).toBeCloseTo(3.0, 8);
      expect(decay.remainingFraction).toBeCloseTo(0.125, 8);
      expect(decay.remainingNuclei).toBeCloseTo(1.25e11, 2);

      // Activity in Bq MUST use decay constant in s^-1, not h^-1
      const expectedLambdaPerS = Math.LN2 / (6.0 * 3600);
      expect(decay.decayConstantPerS).toBeCloseTo(expectedLambdaPerS, 12);
      expect(decay.initialActivityBq).toBeCloseTo(expectedLambdaPerS * 1.0e12, 2);
      expect(decay.remainingActivityBq).toBeCloseTo(
        0.125 * expectedLambdaPerS * 1.0e12,
        2,
      );

      // Background radiation subtracted before decay, then added back
      expect(decay.initialNetCountRate).toBeCloseTo(800, 6);
      expect(decay.remainingNetCountRate).toBeCloseTo(100, 6);
      expect(decay.remainingTotalCountRate).toBeCloseTo(130, 6);
    });

    it("conserves nucleon number A and proton number Z across alpha, beta-, beta+, EC, n, and gamma steps", () => {
      const chain = solveNuclearDecayChain({
        kind: "nuclear-decay-chain",
        parentNuclide: { massNumberA: 238, atomicNumberZ: 92, symbol: "U" },
        steps: [
          { id: "s1", mode: "alpha" },
          { id: "s2", mode: "beta-minus" },
          { id: "s3", mode: "beta-minus" },
          { id: "s4", mode: "gamma" },
          { id: "s5", mode: "alpha" },
        ],
      });

      expect(chain.totalAlphaCount).toBe(2);
      expect(chain.totalBetaMinusCount).toBe(2);
      expect(chain.totalGammaCount).toBe(1);
      expect(chain.netDeltaA).toBe(-8);
      expect(chain.netDeltaZ).toBe(-2);

      const final = chain.nuclides[chain.nuclides.length - 1];
      expect(final.massNumberA).toBe(230);
      expect(final.atomicNumberZ).toBe(90);
      expect(final.symbol).toBe("Th");
      expect(chain.steps[1].emittedParticles).toContain("ν̄ₑ");

      const positronChain = solveNuclearDecayChain({
        kind: "nuclear-decay-chain",
        parentNuclide: { massNumberA: 18, atomicNumberZ: 9, symbol: "F" },
        steps: [{ id: "p1", mode: "beta-plus" }],
      });
      expect(positronChain.nuclides[1].atomicNumberZ).toBe(8);
      expect(positronChain.nuclides[1].massNumberA).toBe(18);
      expect(positronChain.nuclides[1].symbol).toBe("O");
      expect(positronChain.steps[0].emittedParticles).toContain("νₑ");
    });

    it("computes mass defect (931.5 MeV/c²) and agrees between rest-mass and binding-energy Q-values", () => {
      const he4 = solveNuclearBinding({
        kind: "nuclear-binding",
        calculationMode: "single-nuclide",
        massNumberA: 4,
        atomicNumberZ: 2,
        symbol: "He",
        nuclearMassU: 4.001506,
      });
      if (he4.calculationMode !== "single-nuclide") {
        throw new Error("Expected single-nuclide solution");
      }
      // 2*1.007276 + 2*1.008665 - 4.001506 = 0.030376 u
      expect(he4.massDefectU).toBeCloseTo(0.030376, 6);
      expect(he4.bindingEnergyMeV).toBeCloseTo(0.030376 * 931.5, 4);
      expect(he4.bindingEnergyPerNucleonMeV).toBeCloseTo(
        (0.030376 * 931.5) / 4,
        4,
      );
      expect(he4.bindingEnergyJ).toBeCloseTo(
        mevToJoules(he4.bindingEnergyMeV),
        22,
      );

      // Atomic mass input for Carbon-12 (12.000000 u exact atomic mass)
      const c12 = solveNuclearBinding({
        kind: "nuclear-binding",
        calculationMode: "single-nuclide",
        massNumberA: 12,
        atomicNumberZ: 6,
        symbol: "C",
        atomicMassU: 12.0,
      });
      if (c12.calculationMode !== "single-nuclide") {
        throw new Error("Expected single-nuclide solution");
      }
      expect(c12.bindingEnergyPerNucleonMeV).toBeCloseTo(7.68, 1);

      // D-T fusion Q-value from rest masses vs from binding energies per nucleon
      const dtByMass = solveNuclearBinding({
        kind: "nuclear-binding",
        calculationMode: "reaction",
        reactionType: "fusion",
        reactants: [
          { id: "d", symbol: "H", massNumberA: 2, atomicNumberZ: 1, massU: 2.013553 },
          { id: "t", symbol: "H", massNumberA: 3, atomicNumberZ: 1, massU: 3.015501 },
        ],
        products: [
          { id: "he", symbol: "He", massNumberA: 4, atomicNumberZ: 2, massU: 4.001506 },
          { id: "n", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
        ],
      });
      if (dtByMass.calculationMode !== "reaction") {
        throw new Error("Expected reaction solution");
      }
      expect(dtByMass.isExothermic).toBe(true);
      expect(dtByMass.qValueMeV).toBeCloseTo(17.5895, 2);

      // Same reaction via binding energies per nucleon
      const dBe = ((1.007276 + 1.008665 - 2.013553) * 931.5) / 2;
      const tBe = ((1.007276 + 2 * 1.008665 - 3.015501) * 931.5) / 3;
      const heBe = he4.bindingEnergyPerNucleonMeV;
      const dtByBe = solveNuclearBinding({
        kind: "nuclear-binding",
        calculationMode: "reaction",
        reactionType: "fusion",
        reactants: [
          { id: "d", symbol: "H", massNumberA: 2, atomicNumberZ: 1, bindingEnergyPerNucleonMeV: dBe },
          { id: "t", symbol: "H", massNumberA: 3, atomicNumberZ: 1, bindingEnergyPerNucleonMeV: tBe },
        ],
        products: [
          { id: "he", symbol: "He", massNumberA: 4, atomicNumberZ: 2, bindingEnergyPerNucleonMeV: heBe },
          { id: "n", symbol: "n", massNumberA: 1, atomicNumberZ: 0 },
        ],
      });
      if (dtByBe.calculationMode !== "reaction") {
        throw new Error("Expected reaction solution");
      }
      expect(dtByBe.qValueMeV).toBeCloseTo(dtByMass.qValueMeV, 6);
    });

    it("solves Rutherford closest approach and verifies A-independent nuclear density", () => {
      const lowE = solveRutherfordScattering({
        kind: "rutherford-scattering",
        projectileChargeZ: 2,
        targetSymbol: "Au",
        targetChargeZ: 79,
        targetMassNumberA: 197,
        kineticEnergyMeV: 5.0,
      });

      const expectedD =
        (8.99e9 * 2 * 79 * (1.6e-19) ** 2) / (5.0e6 * 1.6e-19);
      expect(lowE.closestApproachM).toBeCloseTo(expectedD, 18);
      expect(lowE.closestApproachFm).toBeCloseTo(expectedD * 1e15, 4);
      expect(lowE.estimatedNuclearRadiusFm).toBeCloseTo(1.2 * Math.cbrt(197), 4);
      expect(lowE.penetratesStrongForceRange).toBe(false);

      const carbonTarget = solveRutherfordScattering({
        kind: "rutherford-scattering",
        projectileChargeZ: 2,
        targetChargeZ: 6,
        targetMassNumberA: 12,
        kineticEnergyMeV: 35.0,
      });
      expect(carbonTarget.penetratesStrongForceRange).toBe(true);
      // Nuclear density ~ 2.3e17 kg m^-3 is independent of nucleon number A
      expect(lowE.nuclearDensityKgM3 / carbonTarget.nuclearDensityKgM3).toBeCloseTo(
        1,
        8,
      );
      expect(nuclearRadiusM(27)).toBeCloseTo(3.6e-15, 18);
      expect(
        rutherfordClosestApproachM(2, 79, mevToJoules(5.0)),
      ).toBeCloseTo(expectedD, 18);
    });
  });

  describe("4. Special Relativity & Minkowski Spacetime", () => {
    it("computes Lorentz factor, time dilation, length contraction, velocity addition, and invariant interval", () => {
      expect(lorentzFactorFromBeta(0)).toBe(1);
      expect(lorentzFactorFromBeta(0.6)).toBeCloseTo(1.25, 10);
      expect(lorentzFactorFromBeta(-0.8)).toBeCloseTo(5 / 3, 10);

      // Speed of light invariance under relativistic velocity addition
      expect(relativisticVelocityAdditionFractionC(1, 0.85)).toBeCloseTo(1, 12);
      expect(relativisticVelocityAdditionFractionC(-1, 0.85)).toBeCloseTo(-1, 12);

      const sr = solveSpecialRelativity({
        kind: "special-relativity",
        beta: 0.6,
        properTimeS: 4.0,
        properLengthM: 50.0,
        objectVelocityFractionC: 0.9,
        events: [
          { id: "e1", label: "E₁", xLightSeconds: 2.0, ctLightSeconds: 5.0, showProjections: true },
          { id: "e2", label: "E₂", xLightSeconds: 4.0, ctLightSeconds: 4.0 },
          { id: "e3", label: "E₃", xLightSeconds: 5.0, ctLightSeconds: 2.0 },
        ],
      });

      expect(sr.lorentzFactor).toBeCloseTo(1.25, 8);
      expect(sr.dilatedTimeS).toBeCloseTo(5.0, 8);
      expect(sr.contractedLengthM).toBeCloseTo(40.0, 8);
      expect(sr.transformedVelocityFractionC).toBeCloseTo(
        (0.9 - 0.6) / (1 - 0.54),
        8,
      );

      // Inverse velocity addition round-trip
      const srInverse = solveSpecialRelativity({
        kind: "special-relativity",
        beta: 0.6,
        objectVelocityPrimeFractionC: sr.transformedVelocityFractionC!,
      });
      expect(srInverse.objectVelocityFractionC).toBeCloseTo(0.9, 8);

      // Spacetime interval invariance: ct^2 - x^2 === ct'^2 - x'^2
      for (const ev of sr.events) {
        const primedDs2 =
          ev.ctPrimeLightSeconds ** 2 - ev.xPrimeLightSeconds ** 2;
        expect(primedDs2).toBeCloseTo(ev.invariantIntervalSquaredLs2, 8);
      }
      expect(sr.events[0].causalClassification).toBe("timelike");
      expect(sr.events[1].causalClassification).toBe("lightlike");
      expect(sr.events[2].causalClassification).toBe("spacelike");
    });

    it("renders Minkowski light-cone lines at an exact 45-degree 1:1 pixel aspect ratio", () => {
      const svg = renderQuantumNuclearSvg(
        {
          id: "minkowski-aspect",
          kind: "special-relativity",
          beta: 0.6,
          domainLightSeconds: 5,
          symmetricTimeAxis: true,
          showLightCone: true,
          showPrimedAxes: true,
        },
        { width: 640, height: 520 },
      );

      const lightConeLines = [
        ...svg.matchAll(
          /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)" stroke="#b45309"/g,
        ),
      ];
      expect(lightConeLines).toHaveLength(2);
      for (const match of lightConeLines) {
        const dx = Math.abs(Number(match[3]) - Number(match[1]));
        const dy = Math.abs(Number(match[4]) - Number(match[2]));
        expect(dx).toBeGreaterThan(100);
        expect(dy / dx).toBeCloseTo(1, 5);
      }
    });
  });

  describe("5. Validation & Edge-Case Rejections", () => {
    it("rejects unphysical and malformed inputs across all scenario families", () => {
      // Superluminal or luminal frame speed
      expect(
        validateQuantumNuclearScenario({
          kind: "special-relativity",
          beta: 1.0,
        }).valid,
      ).toBe(false);
      expect(
        validateQuantumNuclearScenario({
          kind: "special-relativity",
          frameSpeedMs: 3.1e8,
        }).valid,
      ).toBe(false);

      // Neutral particle accelerated by electrostatic voltage
      const neutralVoltage = validateQuantumNuclearScenario({
        kind: "matter-waves",
        particle: "neutron",
        acceleratingVoltageV: 200,
      });
      expect(neutralVoltage.valid).toBe(false);
      expect(neutralVoltage.issues[0].code).toBe("NEUTRAL_PARTICLE_VOLTAGE");

      // Non-conserved nucleon or proton number in nuclear reaction
      const badReaction = validateQuantumNuclearScenario({
        kind: "nuclear-binding",
        calculationMode: "reaction",
        reactionType: "fission",
        reactants: [
          { id: "r1", symbol: "U", massNumberA: 235, atomicNumberZ: 92, massU: 235 },
        ],
        products: [
          { id: "p1", symbol: "Ba", massNumberA: 141, atomicNumberZ: 56, massU: 141 },
          { id: "p2", symbol: "Kr", massNumberA: 92, atomicNumberZ: 35, massU: 92 },
        ],
      });
      expect(badReaction.valid).toBe(false);
      expect(
        badReaction.issues.map((i) => i.code),
      ).toEqual(
        expect.arrayContaining([
          "NUCLEON_NUMBER_NOT_CONSERVED",
          "CHARGE_NOT_CONSERVED",
        ]),
      );

      // Unphysical alpha decay from Helium-4
      expect(
        validateQuantumNuclearScenario({
          kind: "nuclear-decay-chain",
          parentNuclide: { massNumberA: 4, atomicNumberZ: 2 },
          steps: [{ id: "s1", mode: "alpha" }],
        }).valid,
      ).toBe(false);

      // Total count rate not exceeding background
      expect(
        validateQuantumNuclearScenario({
          kind: "radioactive-decay",
          halfLife: 10,
          elapsedTime: 5,
          initialTotalCountRate: 25,
          backgroundCountRate: 30,
        }).valid,
      ).toBe(false);

      // Zero-energy self-transition
      expect(
        validateQuantumNuclearScenario({
          kind: "energy-levels",
          atomModel: "bohr-hydrogen",
          transitions: [{ id: "t1", fromLevelId: "n=2", toLevelId: "n=2" }],
        }).valid,
      ).toBe(false);

      // Invalid SVG dimensions
      expect(() =>
        renderQuantumNuclearSvg(
          {
            kind: "special-relativity",
            beta: 0.5,
          },
          { width: 120, height: 120 },
        ),
      ).toThrow("Invalid quantum-nuclear SVG dimensions");
    });

    it("supports CODATA constant overrides cleanly", () => {
      const codataSol = solveQuantumNuclearScenario({
        kind: "photoelectric-effect",
        workFunctionEv: 2.0,
        incidentWavelengthNm: 400,
        constants: CODATA_CONSTANTS,
      });
      if (codataSol.kind !== "photoelectric-effect") {
        throw new Error("Unexpected kind");
      }
      expect(codataSol.thresholdFrequencyHz).toBeCloseTo(
        (2.0 * CODATA_CONSTANTS.elementaryChargeC) /
          CODATA_CONSTANTS.planckConstantJs,
        2,
      );
      expect(joulesToEv(evToJoules(3.75))).toBeCloseTo(3.75, 12);
    });
  });

  describe("6. Critical Invariant: Zero Answer Leakage in Student-Facing SVGs", () => {
    const extractReadableContent = (svg: string): string => {
      const texts = [
        ...svg.matchAll(
          /<(?:text|title|desc)[^>]*>([\s\S]*?)<\/(?:text|title|desc)>/g,
        ),
      ].map((m) => m[1]);
      const aria = [...svg.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);
      return [...texts, ...aria].join(" | ");
    };

    it("never leaks hidden energy-level values or derived transition wavelengths", () => {
      const spec = {
        kind: "energy-levels" as const,
        atomModel: "custom" as const,
        atomName: "Mystery gas",
        levels: [
          { id: "g", label: "n = 1", energyValue: -11.4, energyUnit: "eV" as const },
          { id: "secret", label: "n = 2", energyValue: -4.87, energyUnit: "eV" as const },
          { id: "top", label: "n = 3", energyValue: -1.92, energyUnit: "eV" as const },
        ],
        transitions: [{ id: "t1", fromLevelId: "top", toLevelId: "secret", label: "T₁" }],
        hiddenQuantities: ["secret", "wavelengthNm"],
      };

      const sol = solveEnergyLevels(spec);
      const svg = renderQuantumNuclearSvg(spec);
      const wlStr = Number(sol.transitions[0].wavelengthNm.toPrecision(3)).toString();

      expect(svg).not.toContain("4.87");
      expect(svg).not.toContain(wlStr);
      expect(svg).toContain("11.4 eV");

      // When explicitly marked as given and not hidden, transition wavelength is shown
      const revealedSvg = renderQuantumNuclearSvg({
        ...spec,
        hiddenQuantities: [],
        givenQuantities: ["wavelengthNm"],
      });
      expect(revealedSvg).toContain("4.87 eV");
      expect(revealedSvg).toContain(
        formatScientificSigFigs(sol.transitions[0].wavelengthNm, 3, "nm"),
      );
    });

    it("never leaks hidden work function, threshold frequency, or stopping potential on photoelectric graphs", () => {
      const spec = {
        kind: "photoelectric-effect" as const,
        metalName: "Sample X",
        workFunctionEv: 3.47,
        incidentFrequencyHz: 1.15e15,
        plotMode: "stopping-potential-vs-f" as const,
        showExtrapolation: true,
        showOperatingPoint: true,
        hiddenQuantities: [
          "workFunctionEv",
          "thresholdFrequencyHz",
          "stoppingPotentialV",
          "metalName",
        ],
      };

      const sol = solvePhotoelectricEffect(spec);
      const svg = renderQuantumNuclearSvg(spec);
      const readable = extractReadableContent(svg);

      expect(svg).not.toContain("Sample X");
      expect(svg).not.toContain("3.47");
      expect(readable).not.toContain(
        Number((sol.thresholdFrequencyHz / 1e14).toPrecision(3)).toString(),
      );
      expect(readable).not.toContain(
        Number(sol.stoppingPotentialV.toPrecision(3)).toString(),
      );
      expect(svg).toContain("f₀");
      expect(svg).toContain("−ϕ/e");
    });

    it("never leaks hidden de Broglie wavelength, decay half-life, daughter nuclide, Q-value, closest approach, or Lorentz factor", () => {
      // Matter waves
      const mwSpec = {
        kind: "matter-waves" as const,
        particle: "electron" as const,
        acceleratingVoltageV: 625,
        hiddenQuantities: ["acceleratingVoltageV", "deBroglieWavelengthM"],
      };
      const mwSvg = renderQuantumNuclearSvg(mwSpec);
      expect(extractReadableContent(mwSvg)).not.toContain("625");
      expect(extractReadableContent(mwSvg)).not.toContain("4.91");

      // Radioactive decay
      const rdSpec = {
        kind: "radioactive-decay" as const,
        timeUnit: "min" as const,
        halfLife: 17.3,
        elapsedTime: 34.6,
        initialTotalCountRate: 547,
        backgroundCountRate: 37.8,
        showHalfLifeGuides: true,
        hiddenQuantities: ["halfLife", "backgroundCountRate"],
      };
      const rdSvg = renderQuantumNuclearSvg(rdSpec);
      expect(extractReadableContent(rdSvg)).not.toContain("17.3");
      expect(extractReadableContent(rdSvg)).not.toContain("37.8");
      expect(rdSvg).not.toContain("t₁/₂");

      // Nuclear decay chain
      const dcSpec = {
        kind: "nuclear-decay-chain" as const,
        parentNuclide: { massNumberA: 226, atomicNumberZ: 88, symbol: "Ra" },
        steps: [{ id: "s1", mode: "alpha" as const }],
        hiddenQuantities: ["daughterNuclides", "daughterCoordinates", "step:s1:mode"],
      };
      const dcSvg = renderQuantumNuclearSvg(dcSpec);
      expect(dcSvg).not.toContain("Rn");
      expect(dcSvg).not.toContain("²²²");
      expect(dcSvg).not.toContain(">86<");
      expect(dcSvg).not.toContain(">α<");

      // Nuclear binding Q-value
      const nbSpec = {
        kind: "nuclear-binding" as const,
        calculationMode: "reaction" as const,
        reactionType: "fusion" as const,
        diagramStyle: "mass-energy-balance" as const,
        reactants: [
          { id: "d", symbol: "H", massNumberA: 2, atomicNumberZ: 1, massU: 2.013553 },
          { id: "t", symbol: "H", massNumberA: 3, atomicNumberZ: 1, massU: 3.015501 },
        ],
        products: [
          { id: "he", symbol: "He", massNumberA: 4, atomicNumberZ: 2, massU: 4.001506 },
          { id: "n", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
        ],
        hiddenQuantities: ["qValueMeV"],
      };
      const nbSvg = renderQuantumNuclearSvg(nbSpec);
      expect(nbSvg).not.toContain("17.6");
      expect(nbSvg).toContain("Q = Δm c²");

      // Rutherford closest approach
      const rsSpec = {
        kind: "rutherford-scattering" as const,
        projectileChargeZ: 2,
        targetSymbol: "Au",
        targetChargeZ: 79,
        targetMassNumberA: 197,
        kineticEnergyMeV: 5.37,
        hiddenQuantities: ["closestApproachFm", "targetChargeZ", "kineticEnergyMeV"],
      };
      const rsSol = solveRutherfordScattering(rsSpec);
      const rsSvg = renderQuantumNuclearSvg(rsSpec);
      expect(rsSvg).not.toContain("5.37");
      expect(rsSvg).not.toContain("79");
      expect(rsSvg).not.toContain("Au");
      expect(rsSvg).not.toContain(
        Number(rsSol.closestApproachFm.toPrecision(3)).toString(),
      );

      // Special relativity
      const srSpec = {
        kind: "special-relativity" as const,
        beta: 0.73,
        properTimeS: 6.41,
        hiddenQuantities: ["beta", "lorentzFactor", "dilatedTimeS"],
      };
      const srSol = solveSpecialRelativity(srSpec);
      const srSvg = renderQuantumNuclearSvg(srSpec);
      expect(srSvg).not.toContain("0.73");
      expect(srSvg).not.toContain("6.41");
      expect(srSvg).not.toContain(
        Number(srSol.lorentzFactor.toPrecision(3)).toString(),
      );
      expect(srSvg).not.toContain(
        Number(srSol.dilatedTimeS!.toPrecision(3)).toString(),
      );
    });
  });

  describe("7. Seeded Parametric Scenario Generators", () => {
    it("is 100% deterministic for identical seeds and produces valid diverse packages across all 8 kinds", () => {
      const first = generateQuantumNuclearScenario("sixthphysics-seed-42", {
        syllabus: "ib",
        syllabusLevel: "HL",
      });
      const second = generateQuantumNuclearScenario("sixthphysics-seed-42", {
        syllabus: "ib",
        syllabusLevel: "HL",
      });

      expect(first.spec).toEqual(second.spec);
      expect(first.solution).toEqual(second.solution);
      expect(first.svg).toBe(second.svg);

      // Test every explicit kind
      const kinds = [
        "energy-levels",
        "photoelectric-effect",
        "matter-waves",
        "radioactive-decay",
        "nuclear-decay-chain",
        "nuclear-binding",
        "rutherford-scattering",
        "special-relativity",
      ] as const;

      for (const kind of kinds) {
        const pkg = generateQuantumNuclearScenario(`kind-check-${kind}`, {
          kind,
          syllabus: "alevel",
          syllabusLevel: "Y13",
        });
        expect(pkg.spec.kind).toBe(kind);
        expect(pkg.validation.valid).toBe(true);
        expect(pkg.svg).toContain("<svg");
        expect(pkg.svg).toContain("</svg>");
      }

      // IB SL and NCUK batches exclude HL-only special-relativity by default
      const slBatch = generateQuantumNuclearBatch(24, "ib-sl-batch", {
        syllabus: "ib",
        syllabusLevel: "SL",
      });
      expect(slBatch).toHaveLength(24);
      expect(slBatch.every((p) => p.validation.valid)).toBe(true);
      expect(slBatch.some((p) => p.spec.kind === "special-relativity")).toBe(
        false,
      );

      // IB HL batch covers multiple families including special-relativity
      const hlBatch = generateQuantumNuclearBatch(48, "ib-hl-batch", {
        syllabus: "ib",
        syllabusLevel: "HL",
      });
      expect(hlBatch).toHaveLength(48);
      expect(hlBatch.every((p) => p.validation.valid)).toBe(true);
      expect(hlBatch.some((p) => p.spec.kind === "special-relativity")).toBe(
        true,
      );
    });
  });

  describe("8. Additional Physics Corner Cases, XML Safety, and Strict Allowlist", () => {
    it("solves decay from decayConstant directly, electron capture, neutron emission, and U-235 fission", () => {
      const lambdaMin = Math.LN2 / 20;
      const fromLambda = solveRadioactiveDecay({
        kind: "radioactive-decay",
        timeUnit: "min",
        decayConstant: lambdaMin,
        elapsedTime: 40,
        initialActivityBq: 1200,
      });
      expect(fromLambda.halfLife).toBeCloseTo(20, 8);
      expect(fromLambda.halfLifeS).toBeCloseTo(1200, 8);
      expect(fromLambda.remainingActivityBq).toBeCloseTo(300, 8);

      const ecAndNeutron = solveNuclearDecayChain({
        kind: "nuclear-decay-chain",
        parentNuclide: { massNumberA: 7, atomicNumberZ: 4, symbol: "Be" },
        steps: [
          { id: "ec", mode: "electron-capture" },
          { id: "ne", mode: "neutron-emission" },
        ],
        chartAxes: "A-vs-Z",
      });
      expect(ecAndNeutron.steps[0].equationText).toContain("⁰₋₁e⁻");
      expect(ecAndNeutron.nuclides[1].atomicNumberZ).toBe(3);
      expect(ecAndNeutron.nuclides[1].massNumberA).toBe(7);
      expect(ecAndNeutron.nuclides[2].atomicNumberZ).toBe(3);
      expect(ecAndNeutron.nuclides[2].massNumberA).toBe(6);

      const azSvg = renderQuantumNuclearSvg({
        kind: "nuclear-decay-chain",
        parentNuclide: { massNumberA: 7, atomicNumberZ: 4, symbol: "Be" },
        steps: [{ id: "ec", mode: "electron-capture" }],
        chartAxes: "A-vs-Z",
      });
      expect(azSvg).toContain("Nucleon number A");

      const u235Fission = solveNuclearBinding({
        kind: "nuclear-binding",
        calculationMode: "reaction",
        reactionType: "fission",
        reactants: [
          { id: "u", symbol: "U", massNumberA: 235, atomicNumberZ: 92, massU: 234.99345 },
          { id: "n0", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
        ],
        products: [
          { id: "ba", symbol: "Ba", massNumberA: 141, atomicNumberZ: 56, massU: 140.88354 },
          { id: "kr", symbol: "Kr", massNumberA: 92, atomicNumberZ: 36, massU: 91.90645 },
          { id: "n3", symbol: "n", massNumberA: 1, atomicNumberZ: 0, count: 3, massU: 1.008665 },
        ],
      });
      if (u235Fission.calculationMode !== "reaction") {
        throw new Error("Expected reaction solution");
      }
      expect(u235Fission.qValueMeV).toBeCloseTo(173.38, 1);
      expect(u235Fission.isExothermic).toBe(true);
    });

    it("keeps relativistic velocity addition strictly subluminal for massive objects and escapes XML safely", () => {
      // Counter-propagating 0.99c particles: relative speed must still be < c
      const relSpeed = relativisticVelocityAdditionFractionC(0.99, -0.99);
      expect(relSpeed).toBeGreaterThan(0.99);
      expect(relSpeed).toBeLessThan(1);

      const xmlSafeSvg = renderQuantumNuclearSvg({
        kind: "energy-levels",
        atomModel: "custom",
        atomName: 'Ion <A & B> "test"',
        levels: [
          { id: "g", label: "n=1 <ground>", energyValue: -6.0, energyUnit: "eV" },
          { id: "e", label: "n=2 & 'excited'", energyValue: -2.0, energyUnit: "eV" },
        ],
        transitions: [{ id: "t1", fromLevelId: "e", toLevelId: "g", label: "T<1>" }],
        visibilityMode: "strict-allowlist",
        givenQuantities: ["atomName", "levelLabels"],
      });

      expect(xmlSafeSvg).toContain("Ion &lt;A &amp; B&gt; &quot;test&quot;");
      expect(xmlSafeSvg).toContain("n=2 &amp; &apos;excited&apos;");
      // In strict-allowlist mode, un-allowlisted level energies (-6.0 eV, -2.0 eV) are masked
      expect(xmlSafeSvg).not.toContain("6 eV");
      expect(xmlSafeSvg).not.toContain("2 eV");
    });
  });

  describe("9. Exhaustive Hidden-Quantity, Coincident-Value & Fuzz Verification", () => {
    const GEOMETRY_AND_STYLE_ATTRS = new Set([
      "xmlns",
      "width",
      "height",
      "viewBox",
      "role",
      "d",
      "points",
      "x",
      "y",
      "x1",
      "y1",
      "x2",
      "y2",
      "cx",
      "cy",
      "r",
      "rx",
      "ry",
      "refX",
      "refY",
      "markerWidth",
      "markerHeight",
      "orient",
      "fill",
      "stroke",
      "stroke-width",
      "stroke-dasharray",
      "opacity",
      "font-size",
      "font-weight",
      "font-style",
      "font-family",
      "text-anchor",
      "transform",
    ]);

    const extractAllStudentFacingChannels = (svg: string): string => {
      const segments: string[] = [];
      for (const m of svg.matchAll(
        /<(?:text|tspan|title|desc)\b[^>]*>([\s\S]*?)<\/(?:text|tspan|title|desc)>/g,
      )) {
        segments.push(m[1].replace(/<[^>]+>/g, " "));
      }
      for (const tagMatch of svg.matchAll(/<[a-zA-Z][^>]*>/g)) {
        const tag = tagMatch[0];
        for (const attrMatch of tag.matchAll(
          /\b([a-zA-Z_:][a-zA-Z0-9_.:-]*)="([^"]*)"/g,
        )) {
          const attrName = attrMatch[1];
          const attrVal = attrMatch[2];
          if (!GEOMETRY_AND_STYLE_ATTRS.has(attrName)) {
            segments.push(`${attrName}=${attrVal}`);
          }
        }
      }
      return segments.join(" | ");
    };

    const buildStandaloneNumberRegex = (formatted: string): RegExp => {
      const escaped = formatted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const suffix = formatted.includes("× 10")
        ? "(?![\\d.])"
        : "(?![\\d.]|\\s*×\\s*10)";
      return new RegExp(`(?<![\\d.])${escaped}${suffix}`);
    };

    it("merges spec.hiddenQuantities and options.hiddenQuantities cleanly", () => {
      const spec: QuantumNuclearScenarioSpec = {
        kind: "energy-levels",
        atomModel: "custom",
        atomName: "Custom atom",
        levels: [
          { id: "g", label: "ground", energyValue: -9.45, energyUnit: "eV" },
          { id: "e1", label: "first", energyValue: -4.15, energyUnit: "eV" },
          { id: "e2", label: "second", energyValue: -1.35, energyUnit: "eV" },
        ],
        transitions: [
          { id: "t1", fromLevelId: "e2", toLevelId: "e1", label: "T₁" },
        ],
        givenQuantities: ["*"],
        hiddenQuantities: ["g"],
      };
      const svg = renderQuantumNuclearSvg(spec, {
        hiddenQuantities: ["e1", "wavelengthNm"],
      });
      const channels = extractAllStudentFacingChannels(svg);
      expect(channels).not.toContain("9.45");
      expect(channels).not.toContain("4.15");
      expect(channels).toContain("1.35 eV");
      expect(channels).not.toContain("nm");
    });

    it("prevents energy-levels leaks across groundStateEnergy, continuumEnergy, ionizationEnergy, 0-eV endpoint deltaEnergy, and hydrogenic atomicNumberZ", () => {
      for (const hiddenKey of [
        "groundStateEnergyEv",
        "groundStateEnergyJ",
        "ionizationEnergyEv",
        "ionizationEnergyJ",
      ] as const) {
        const svg = renderQuantumNuclearSvg({
          kind: "energy-levels",
          atomModel: "bohr-hydrogen",
          atomicNumberZ: 1,
          maxPrincipalN: 3,
          includeContinuumZero: true,
          transitions: [{ id: "t1", fromLevelId: "n=2", toLevelId: "n=1" }],
          givenQuantities: ["*"],
          hiddenQuantities: [hiddenKey],
        });
        const channels = extractAllStudentFacingChannels(svg);
        expect(channels).not.toContain("13.6");
      }

      const contSvg = renderQuantumNuclearSvg({
        kind: "energy-levels",
        atomModel: "bohr-hydrogen",
        atomicNumberZ: 1,
        maxPrincipalN: 3,
        includeContinuumZero: true,
        transitions: [{ id: "t1", fromLevelId: "n=inf", toLevelId: "n=2" }],
        hiddenQuantities: ["continuumEnergyEv"],
      });
      expect(extractAllStudentFacingChannels(contSvg)).not.toContain("0 eV");

      // Endpoint at 0 eV: hiding deltaEnergyEv or transition:t1:deltaEnergyEv hides -3.4 eV bar
      for (const deltaKey of [
        "deltaEnergyEv",
        "transition:t1:deltaEnergyEv",
      ] as const) {
        const zeroEndSvg = renderQuantumNuclearSvg({
          kind: "energy-levels",
          atomModel: "bohr-hydrogen",
          atomicNumberZ: 1,
          maxPrincipalN: 3,
          includeContinuumZero: true,
          transitions: [{ id: "t1", fromLevelId: "n=inf", toLevelId: "n=2" }],
          hiddenQuantities: [deltaKey],
        });
        expect(extractAllStudentFacingChannels(zeroEndSvg)).not.toContain("3.4");
      }

      // Hydrogenic ion Z = 3: hiding atomicNumberZ suppresses "Hydrogenic Z = 3"
      const heIonSvg = renderQuantumNuclearSvg({
        kind: "energy-levels",
        atomModel: "bohr-hydrogen",
        atomicNumberZ: 3,
        maxPrincipalN: 3,
        transitions: [{ id: "t1", fromLevelId: "n=3", toLevelId: "n=2" }],
        hiddenQuantities: ["atomicNumberZ"],
      });
      const ionChannels = extractAllStudentFacingChannels(heIonSvg);
      expect(ionChannels).not.toContain("Hydrogenic");
      expect(ionChannels).not.toMatch(buildStandaloneNumberRegex("3"));
    });

    it("enforces full-axis numeric tick suppression in radioactive-decay, photoelectric-effect, and special-relativity without deducible gaps", () => {
      // Radioactive decay: hiding elapsedTime suppresses ALL X numeric ticks (never leaving 0, [blank], 10, 15)
      const rdElapsedSvg = renderQuantumNuclearSvg({
        kind: "radioactive-decay",
        timeUnit: "h",
        halfLife: 5,
        elapsedTime: 10,
        initialTotalCountRate: 520,
        backgroundCountRate: 20,
        hiddenQuantities: ["elapsedTime"],
      });
      expect(rdElapsedSvg).not.toContain(">5<");
      expect(rdElapsedSvg).not.toContain(">10<");
      expect(rdElapsedSvg).not.toContain(">15<");
      expect(rdElapsedSvg).not.toContain(">20<");

      // Hiding remainingTotalCountRate suppresses ALL Y numeric ticks
      const rdRemSvg = renderQuantumNuclearSvg({
        kind: "radioactive-decay",
        timeUnit: "h",
        halfLife: 5,
        elapsedTime: 10,
        initialTotalCountRate: 520,
        backgroundCountRate: 20,
        hiddenQuantities: ["remainingTotalCountRate"],
      });
      expect(rdRemSvg).not.toContain(">500<");
      expect(rdRemSvg).not.toContain(">200<");

      // Photoelectric effect at hf = 2*phi (stoppingPotentialV === workFunctionEv):
      // hiding stoppingPotentialV must suppress Y ticks AND mask -phi/e = -2.30
      const wfEv = 2.3;
      const fTwoPhi = (2 * wfEv * 1.6e-19) / 6.63e-34;
      const peSvg = renderQuantumNuclearSvg({
        kind: "photoelectric-effect",
        metalName: "Potassium",
        workFunctionEv: wfEv,
        incidentFrequencyHz: fTwoPhi,
        plotMode: "stopping-potential-vs-f",
        showExtrapolation: true,
        showOperatingPoint: true,
        givenQuantities: ["*"],
        hiddenQuantities: ["stoppingPotentialV"],
      });
      expect(extractAllStudentFacingChannels(peSvg)).not.toContain("2.3");

      // Special relativity: hiding event coordinate suppresses all Minkowski numeric ticks
      const srEventSvg = renderQuantumNuclearSvg({
        kind: "special-relativity",
        beta: 0.6,
        domainLightSeconds: 5,
        events: [
          {
            id: "e1",
            label: "E₁",
            xLightSeconds: 2,
            ctLightSeconds: 4,
            showProjections: true,
          },
        ],
        hiddenQuantities: ["event:e1:xLightSeconds"],
      });
      expect(srEventSvg).not.toContain(">2<");
      expect(srEventSvg).not.toContain(">4<");
    });

    it("suppresses decay-chain axis ticks on hidden nuclides, masks isobaric/isotopic parent A/Z collisions, and masks step badges on hidden counts", () => {
      // Generator default hiddenQuantities: ["finalNuclide", "daughterNuclides"]
      const genPkg = generateQuantumNuclearScenario("ra-chain-seed", {
        kind: "nuclear-decay-chain",
        hideTargetQuantities: true,
      });
      const genSol = solveNuclearDecayChain(
        genPkg.spec as Extract<
          QuantumNuclearScenarioSpec,
          { kind: "nuclear-decay-chain" }
        >,
      );
      const genChannels = extractAllStudentFacingChannels(genPkg.svg);
      for (const daughter of genSol.nuclides.slice(1)) {
        expect(genChannels).not.toMatch(
          buildStandaloneNumberRegex(String(daughter.atomicNumberZ)),
        );
        expect(genChannels).not.toMatch(
          buildStandaloneNumberRegex(String(daughter.massNumberA)),
        );
        expect(genChannels).not.toMatch(
          buildStandaloneNumberRegex(String(daughter.neutronNumberN)),
        );
      }

      // Isobaric decay F-18 -> O-18: hiding finalA masks parent ¹⁸₉F
      const isobaricSvg = renderQuantumNuclearSvg({
        kind: "nuclear-decay-chain",
        parentNuclide: { massNumberA: 18, atomicNumberZ: 9, symbol: "F" },
        steps: [{ id: "s1", mode: "beta-plus" }],
        hiddenQuantities: ["finalA"],
      });
      expect(isobaricSvg).not.toContain(toSuperscript(18));
      expect(extractAllStudentFacingChannels(isobaricSvg)).not.toContain("18");

      // Isotopic chain U-238 -> Th-234 -> Pa-234 -> U-234: hiding finalZ masks parent Z=92
      const isotopicSvg = renderQuantumNuclearSvg({
        kind: "nuclear-decay-chain",
        parentNuclide: { massNumberA: 238, atomicNumberZ: 92, symbol: "U" },
        steps: [
          { id: "s1", mode: "alpha" },
          { id: "s2", mode: "beta-minus" },
          { id: "s3", mode: "beta-minus" },
        ],
        hiddenQuantities: ["finalZ"],
      });
      expect(isotopicSvg).not.toContain(toSubscript(92));
      expect(isotopicSvg).not.toContain("U<");
      expect(extractAllStudentFacingChannels(isotopicSvg)).not.toContain("92");

      // Hiding totalAlphaCount masks step badges to "?"
      const countHiddenSvg = renderQuantumNuclearSvg({
        kind: "nuclear-decay-chain",
        parentNuclide: { massNumberA: 226, atomicNumberZ: 88, symbol: "Ra" },
        steps: [
          { id: "s1", mode: "alpha" },
          { id: "s2", mode: "beta-minus" },
        ],
        hiddenQuantities: ["totalAlphaCount"],
      });
      expect(countHiddenSvg).not.toContain(">α<");
      expect(countHiddenSvg).not.toContain(">β⁻<");
      expect(countHiddenSvg).toContain(">?<");
    });

    it("prevents nuclear-binding nuclide A/Z/ticks/J-unit leaks and matter-waves q=e voltage/EkEv leaks", () => {
      for (const style of ["binding-curve", "mass-energy-balance"] as const) {
        for (const hiddenKey of ["massNumberA", "atomicNumberZ"] as const) {
          const feSvg = renderQuantumNuclearSvg({
            kind: "nuclear-binding",
            calculationMode: "single-nuclide",
            massNumberA: 56,
            atomicNumberZ: 26,
            symbol: "Fe",
            nuclearMassU: 55.920674,
            diagramStyle: style,
            hiddenQuantities: [hiddenKey],
          });
          expect(feSvg).not.toContain(formatNuclidePlain(56, 26, "Fe"));
          expect(feSvg).not.toContain(toSuperscript(56));
          expect(feSvg).not.toContain(toSubscript(26));
          expect(extractAllStudentFacingChannels(feSvg)).not.toContain("56");
          expect(extractAllStudentFacingChannels(feSvg)).not.toContain("26");
        }
      }

      // Hiding bindingEnergyJ or massDefectKg masks Delta E in mass-energy-balance even with givenQuantities: ["*"]
      for (const hiddenKey of ["bindingEnergyJ", "massDefectKg"] as const) {
        const mebSvg = renderQuantumNuclearSvg({
          kind: "nuclear-binding",
          calculationMode: "single-nuclide",
          massNumberA: 56,
          atomicNumberZ: 26,
          symbol: "Fe",
          nuclearMassU: 55.920674,
          diagramStyle: "mass-energy-balance",
          givenQuantities: ["*"],
          hiddenQuantities: [hiddenKey],
        });
        expect(mebSvg).toContain("B = Δm c²");
        expect(mebSvg).not.toContain("ΔE =");
      }

      // Hiding qValueJ or massDifferenceKg masks Q in reaction mass-energy-balance even with givenQuantities: ["*"]
      for (const hiddenKey of ["qValueJ", "massDifferenceKg"] as const) {
        const rxnSvg = renderQuantumNuclearSvg({
          kind: "nuclear-binding",
          calculationMode: "reaction",
          reactionType: "fusion",
          diagramStyle: "mass-energy-balance",
          reactants: [
            { id: "d", symbol: "H", massNumberA: 2, atomicNumberZ: 1, massU: 2.013553 },
            { id: "t", symbol: "H", massNumberA: 3, atomicNumberZ: 1, massU: 3.015501 },
          ],
          products: [
            { id: "he", symbol: "He", massNumberA: 4, atomicNumberZ: 2, massU: 4.001506 },
            { id: "n", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
          ],
          givenQuantities: ["*"],
          hiddenQuantities: [hiddenKey],
        });
        expect(rxnSvg).toContain("Q = Δm c²");
        expect(rxnSvg).not.toContain("17.6");
      }

      // Matter-waves: electron/proton has kineticEnergyEv === acceleratingVoltageV
      for (const particle of ["electron", "proton"] as const) {
        const mwSvg = renderQuantumNuclearSvg({
          kind: "matter-waves",
          particle,
          acceleratingVoltageV: 350,
          givenQuantities: ["*"],
          hiddenQuantities: ["kineticEnergyEv"],
        });
        expect(extractAllStudentFacingChannels(mwSvg)).not.toContain("350");
      }
    });

    it("passes exhaustive per-quantity + coincident-value zero-leakage fuzz test across all 8 scenario families", () => {
      const kinds = [
        "energy-levels",
        "photoelectric-effect",
        "matter-waves",
        "radioactive-decay",
        "nuclear-decay-chain",
        "nuclear-binding",
        "rutherford-scattering",
        "special-relativity",
      ] as const;

      const sampledFixtures: QuantumNuclearScenarioSpec[] = [];
      for (const seed of [
        "alpha",
        "beta",
        "gamma",
        "delta",
        "epsilon",
        "zeta",
        "eta",
        "theta",
      ]) {
        for (const kind of kinds) {
          sampledFixtures.push(
            sampleQuantumNuclearSpec(`${seed}-${kind}`, {
              kind,
              syllabus: "ib",
              syllabusLevel: "HL",
              hideTargetQuantities: false,
            }),
          );
        }
      }

      const adversarialCoincidentFixtures: QuantumNuclearScenarioSpec[] = [
        // Hydrogenic Z = 2 where E_2 = -13.6 eV and continuum = 0 eV
        {
          kind: "energy-levels",
          atomModel: "bohr-hydrogen",
          atomicNumberZ: 2,
          maxPrincipalN: 4,
          includeContinuumZero: true,
          transitions: [
            { id: "t1", fromLevelId: "n=inf", toLevelId: "n=2", label: "T1" },
            { id: "t2", fromLevelId: "n=2", toLevelId: "n=1", label: "T2" },
          ],
        },
        // Joule-displayed custom levels with continuum 0 J
        {
          kind: "energy-levels",
          atomModel: "custom",
          atomName: "Ion Z = 2",
          displayEnergyUnit: "J",
          levels: [
            { id: "g", label: "n = 1", energyValue: -8.0e-19, energyUnit: "J" },
            { id: "e1", label: "n = 2", energyValue: -3.2e-19, energyUnit: "J" },
            { id: "cont", label: "n = ∞", energyValue: 0, energyUnit: "J" },
          ],
          transitions: [
            { id: "t1", fromLevelId: "cont", toLevelId: "e1", label: "T₁" },
            { id: "t2", fromLevelId: "e1", toLevelId: "g", label: "T₂" },
          ],
        },
        // Photoelectric at hf = 2*phi (Ek,max == Vs == phi) and ek-j-vs-f mode
        {
          kind: "photoelectric-effect",
          metalName: "Caesium",
          workFunctionEv: 2.0,
          incidentFrequencyHz: (4.0 * 1.6e-19) / 6.63e-34,
          comparisonMetalName: "Zinc",
          comparisonWorkFunctionEv: 4.0,
          plotMode: "stopping-potential-vs-f",
          showExtrapolation: true,
          showOperatingPoint: true,
        },
        {
          kind: "photoelectric-effect",
          metalName: "Sodium",
          workFunctionEv: 2.28,
          incidentWavelengthNm: 650,
          plotMode: "ek-j-vs-f",
          showExtrapolation: true,
          showOperatingPoint: true,
        },
        // Matter waves: proton with q = e (kineticEnergyEv === acceleratingVoltageV)
        {
          kind: "matter-waves",
          particle: "proton",
          acceleratingVoltageV: 850,
        },
        // Radioactive decay: coincident initialNetCountRate === backgroundCountRate (25) and elapsedTime === halfLife (10)
        {
          kind: "radioactive-decay",
          timeUnit: "min",
          halfLife: 10,
          elapsedTime: 10,
          initialTotalCountRate: 50,
          backgroundCountRate: 25,
          showHalfLifeGuides: true,
        },
        // Decay chain: isobaric + isotopic steps
        {
          kind: "nuclear-decay-chain",
          parentNuclide: { massNumberA: 238, atomicNumberZ: 92, symbol: "U" },
          steps: [
            { id: "s1", mode: "alpha" },
            { id: "s2", mode: "beta-minus" },
            { id: "s3", mode: "beta-minus" },
            { id: "s4", mode: "gamma" },
          ],
          chartAxes: "A-vs-Z",
        },
        // Nuclear binding: U-235 where nuclearMassU (234.99345) rounds to 235 === massNumberA
        {
          kind: "nuclear-binding",
          calculationMode: "single-nuclide",
          massNumberA: 235,
          atomicNumberZ: 92,
          symbol: "U",
          nuclearMassU: 234.99345,
          diagramStyle: "binding-curve",
        },
        {
          kind: "nuclear-binding",
          calculationMode: "single-nuclide",
          massNumberA: 4,
          atomicNumberZ: 2,
          symbol: "He",
          nuclearMassU: 4.001506,
          diagramStyle: "mass-energy-balance",
        },
        // Rutherford scattering: proton on H-1 (projectileChargeZ === targetChargeZ === targetMassNumberA === 1)
        {
          kind: "rutherford-scattering",
          projectileChargeZ: 1,
          targetSymbol: "H",
          targetChargeZ: 1,
          targetMassNumberA: 1,
          kineticEnergyMeV: 2.5,
        },
        // Special relativity: object at rest in S (u = 0 -> u' = -beta*c), dilatedTimeS = 5 = domainLightSeconds
        {
          kind: "special-relativity",
          beta: 0.6,
          properTimeS: 4.0,
          properLengthM: 50.0,
          objectVelocityFractionC: 0,
          domainLightSeconds: 5,
          events: [
            {
              id: "e1",
              label: "E1",
              xLightSeconds: 3,
              ctLightSeconds: 3,
              showProjections: true,
            },
          ],
        },
      ];

      const allFixtures = [
        ...sampledFixtures,
        ...adversarialCoincidentFixtures,
      ];

      let checkedPairs = 0;
      for (const baseSpec of allFixtures) {
        const cleanBase: QuantumNuclearScenarioSpec = {
          ...baseSpec,
          hiddenQuantities: undefined,
          givenQuantities: undefined,
        };
        const solution = solveQuantumNuclearScenario(cleanBase);
        const qMap = extractQuantumNuclearQuantityMap(cleanBase, solution);

        for (const revealDerived of [false, true]) {
          for (const [qKey, qVals] of Object.entries(qMap)) {
            if (qVals.length === 0) continue;
            const viaOptions = checkedPairs % 2 === 1;
            checkedPairs += 1;

            const specToRender: QuantumNuclearScenarioSpec = {
              ...cleanBase,
              ...(revealDerived ? { givenQuantities: ["*"] } : {}),
              ...(viaOptions ? {} : { hiddenQuantities: [qKey] }),
            };
            const svg = renderQuantumNuclearSvg(
              specToRender,
              viaOptions ? { hiddenQuantities: [qKey] } : undefined,
            );
            const allTextAndAttrs = extractAllStudentFacingChannels(svg);

            for (const qVal of qVals) {
              if (!Number.isFinite(qVal)) continue;
              const fmtSigned = formatScientificSigFigs(qVal, 3);
              const fmtMag = formatScientificSigFigs(Math.abs(qVal), 3);
              const prec3Mag = String(Number(Math.abs(qVal).toPrecision(3)));
              const tokens = new Set([fmtSigned, fmtMag, prec3Mag]);
              if (
                qVal === 0 ||
                (Math.abs(qVal) >= 1e-6 && Math.abs(qVal) < 1e9)
              ) {
                tokens.add(formatCleanTick(qVal));
                tokens.add(formatCleanTick(Math.abs(qVal)));
              }

              for (const token of tokens) {
                expect(allTextAndAttrs).not.toMatch(
                  buildStandaloneNumberRegex(token),
                );
              }

              // Also ensure hidden integer A/Z/N never leak as Unicode superscript/subscript nuclide prefixes
              if (Number.isInteger(qVal) && qVal >= 2) {
                const supA = toSuperscript(qVal);
                const subZ = toSubscript(qVal);
                expect(allTextAndAttrs).not.toMatch(
                  new RegExp(`(?<![⁰¹²³⁴⁵⁶⁷⁸⁹])${supA}[₀₁₂₃₄₅₆₇₈₉]+[A-Z]`),
                );
                expect(allTextAndAttrs).not.toMatch(
                  new RegExp(`[⁰¹²³⁴⁵⁶⁷⁸⁹]+${subZ}[A-Z]`),
                );
              }
            }
          }
        }
      }

      expect(checkedPairs).toBeGreaterThan(2500);
    });
  });
});
