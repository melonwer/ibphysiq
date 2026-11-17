import {
  AVOGADRO_CONSTANT,
  averageTranslationalKineticEnergy,
  BOLTZMANN_CONSTANT,
  carnotTheoreticalEfficiency,
  createSeededRandom,
  formatSignificant,
  generateCalorimetryMixingScenario,
  generateCarnotCycleScenario,
  generateKineticTheoryScenario,
  generatePhaseChangeScenario,
  generateThermalRadiationScenario,
  generateThermalScenario,
  generateThermalScenarioBatch,
  generateThermodynamicProcessScenario,
  idealGasInternalEnergy,
  isothermalWork,
  maxwellBoltzmannSpeedDensity,
  MOLAR_GAS_CONSTANT,
  planckSpectralExitance,
  renderThermalSvg,
  rmsSpeedFromMolarMass,
  rmsSpeedFromParticleMass,
  solveCalorimetryMixing,
  solveCarnotCycle,
  solveKineticTheory,
  solvePhaseChangeCurve,
  solveThermalRadiation,
  solveThermalScenario,
  solveThermodynamicProcess,
  STEFAN_BOLTZMANN_CONSTANT,
  stefanBoltzmannPower,
  THERMAL_SUBSTANCE_PRESETS,
  ThermalScenarioSpec,
  validateThermalScenario,
  WIEN_DISPLACEMENT_CONSTANT,
  wienPeakWavelength,
} from "../thermal";

/**
 * Extract all student-readable text nodes, <title>, <desc>, and aria-label
 * attributes from an SVG string for strict non-leakage verification.
 */
function extractStudentVisibleText(svg: string): string {
  const chunks: string[] = [];
  const ariaMatches = svg.matchAll(/aria-label="([^"]*)"/g);
  for (const m of ariaMatches) chunks.push(m[1]);
  const titleMatches = svg.matchAll(/<title>([\s\S]*?)<\/title>/g);
  for (const m of titleMatches) chunks.push(m[1]);
  const descMatches = svg.matchAll(/<desc>([\s\S]*?)<\/desc>/g);
  for (const m of descMatches) chunks.push(m[1]);
  const textMatches = svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g);
  for (const m of textMatches) chunks.push(m[1]);
  return chunks.join(" | ");
}

/**
 * Verify balanced XML tags, valid root <svg>, and absence of unescaped raw < or &
 * inside text nodes.
 */
function assertWellFormedSvgXml(svg: string): void {
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  expect(svg.endsWith("</svg>")).toBe(true);
  expect(svg).not.toMatch(/NaN|Infinity|undefined/);

  const stack: string[] = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)(\s[^<>]*?)?(\/?)>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(svg)) !== null) {
    const full = match[0];
    const tagName = match[1];
    const selfClosing = match[3] === "/";
    if (full.startsWith("</")) {
      expect(stack.pop()).toBe(tagName);
    } else if (!selfClosing) {
      stack.push(tagName);
    }
  }
  expect(stack).toEqual([]);
}

describe("lib/visuals/thermal — deterministic physics solver & SVG renderer", () => {
  describe("1. Thermodynamic processes & closed cycles (PV, PT, VT)", () => {
    it("solves single isobaric, isochoric, isothermal, and adiabatic steps with exact 1st law conservation", () => {
      // Exact rational adiabatic expansion: V2 = 8 * V1 => (1/8)^(5/3) = 1/32, (1/8)^(2/3) = 1/4
      const adiab = solveThermodynamicProcess({
        kind: "thermodynamic-process",
        moles: 0.5,
        initialState: { pressurePa: 3.2e5, volumeM3: 1.0e-3 },
        steps: [{ process: "adiabatic", targetVolumeM3: 8.0e-3 }],
      });
      expect(adiab.states).toHaveLength(2);
      const [sA, sB] = adiab.states;
      expect(sB.pressurePa).toBeCloseTo(1.0e4, 10);
      expect(sB.temperatureK / sA.temperatureK).toBeCloseTo(0.25, 12);
      expect(sA.pressurePa * sA.volumeM3 ** (5 / 3)).toBeCloseTo(
        sB.pressurePa * sB.volumeM3 ** (5 / 3),
        10,
      );
      expect(adiab.legs[0].heatJ).toBe(0);
      expect(adiab.legs[0].entropyChangeJK).toBe(0);
      expect(adiab.legs[0].deltaUJ).toBeCloseTo(-adiab.legs[0].workJ, 12);
      expect(adiab.legs[0].workJ).toBeCloseTo(
        1.5 * (3.2e5 * 1.0e-3 - 1.0e4 * 8.0e-3),
        10,
      );

      // Isothermal expansion: deltaU = 0, W = Q = nRT ln(V2/V1), deltaS = Q/T
      const iso = solveThermodynamicProcess({
        kind: "thermodynamic-process",
        moles: 1.2,
        initialState: { temperatureK: 400, volumeM3: 2.0e-3 },
        steps: [{ process: "isothermal", targetVolumeM3: 6.0e-3 }],
      });
      const expectedWork = isothermalWork(1.2, 400, 2.0e-3, 6.0e-3);
      expect(iso.legs[0].deltaUJ).toBe(0);
      expect(iso.legs[0].workJ).toBeCloseTo(expectedWork, 11);
      expect(iso.legs[0].heatJ).toBeCloseTo(expectedWork, 11);
      expect(iso.legs[0].isothermalEntropyChangeJK).toBeCloseTo(
        expectedWork / 400,
        12,
      );
      expect(iso.legs[0].entropyChangeJK).toBeCloseTo(expectedWork / 400, 12);

      // Isobaric + isochoric two-step open path
      const twoStep = solveThermodynamicProcess({
        kind: "thermodynamic-process",
        moles: 0.4,
        initialState: { pressurePa: 2.0e5, volumeM3: 1.5e-3 },
        steps: [
          { process: "isobaric", targetVolumeM3: 4.5e-3 },
          { process: "isochoric", targetPressurePa: 5.0e5 },
        ],
      });
      expect(twoStep.isClosedCycle).toBe(false);
      expect(twoStep.states).toHaveLength(3);
      expect(twoStep.legs[0].workJ).toBeCloseTo(2.0e5 * 3.0e-3, 11);
      expect(twoStep.legs[0].heatJ).toBeCloseTo(2.5 * 2.0e5 * 3.0e-3, 11);
      expect(twoStep.legs[1].workJ).toBe(0);
      expect(twoStep.legs[1].heatJ).toBeCloseTo(1.5 * 4.5e-3 * 3.0e5, 11);
      for (const state of twoStep.states) {
        expect(state.pressurePa * state.volumeM3).toBeCloseTo(
          twoStep.moles * MOLAR_GAS_CONSTANT * state.temperatureK,
          10,
        );
        expect(state.pressurePa * state.volumeM3).toBeCloseTo(
          twoStep.particleCount * BOLTZMANN_CONSTANT * state.temperatureK,
          10,
        );
        expect(state.internalEnergyJ).toBeCloseTo(
          idealGasInternalEnergy(twoStep.moles, state.temperatureK),
          10,
        );
      }
    });

    it("conserves 1st law (Delta U = Q - W) and entropy to machine precision on closed multi-step cycles", () => {
      // 1. Rectangular cycle: W_net = (P_H - P_L)(V_H - V_L)
      const rect = solveThermodynamicProcess({
        kind: "thermodynamic-process",
        moles: 0.8,
        initialState: { pressurePa: 4.0e5, volumeM3: 2.0e-3 },
        steps: [
          { process: "isobaric", targetVolumeM3: 5.0e-3 },
          { process: "isochoric", targetPressurePa: 1.0e5 },
          { process: "isobaric", targetVolumeM3: 2.0e-3 },
          { process: "isochoric", closeToInitial: true },
        ],
        isClosedCycle: true,
      });
      expect(rect.isClosedCycle).toBe(true);
      expect(rect.states).toHaveLength(4);
      expect(rect.netWorkJ).toBeCloseTo((4.0e5 - 1.0e5) * (5.0e-3 - 2.0e-3), 11);
      expect(rect.netHeatJ).toBeCloseTo(rect.netWorkJ, 11);
      expect(rect.heatInputJ - rect.heatRejectedJ).toBeCloseTo(rect.netWorkJ, 11);
      const rectSumDeltaU = rect.legs.reduce((s, l) => s + l.deltaUJ, 0);
      const rectSumDeltaS = rect.legs.reduce((s, l) => s + l.entropyChangeJK, 0);
      expect(Math.abs(rectSumDeltaU)).toBeLessThan(1e-11);
      expect(Math.abs(rectSumDeltaS)).toBeLessThan(1e-12);
      for (const leg of rect.legs) {
        expect(leg.deltaUJ).toBeCloseTo(leg.heatJ - leg.workJ, 12);
      }
      // Rectangular heat-engine efficiency: W_net = 900 J; Q_in = Q_DA + Q_AB = 1.5*2e-3*3e5 + 2.5*4e5*3e-3 = 900 + 3000 = 3900 J
      expect(rect.thermalEfficiency).toBeCloseTo(900 / 3900, 12);
      expect(rect.thermalEfficiency!).toBeLessThan(rect.carnotEfficiency!);

      // 2. Monatomic Otto cycle: analytical efficiency eta = 1 - (V_min / V_max)^(2/3)
      const compressionRatio = 8; // 8^(2/3) = 4 => eta = 1 - 1/4 = 0.75
      const otto = solveThermodynamicProcess({
        kind: "thermodynamic-process",
        moles: 0.5,
        initialState: { pressurePa: 1.0e5, volumeM3: 8.0e-3 },
        steps: [
          { process: "adiabatic", targetVolumeM3: 1.0e-3 },
          { process: "isochoric", targetPressurePa: 6.4e6 },
          { process: "adiabatic", targetVolumeM3: 8.0e-3 },
          { process: "isochoric", closeToInitial: true },
        ],
        isClosedCycle: true,
      });
      expect(otto.thermalEfficiency).toBeCloseTo(
        1 - (1 / compressionRatio) ** (2 / 3),
        12,
      );
      expect(otto.netHeatJ - otto.netWorkJ).toBeCloseTo(0, 11);
      expect(otto.legs.reduce((s, l) => s + l.deltaUJ, 0)).toBeCloseTo(0, 11);
      expect(otto.legs.reduce((s, l) => s + l.entropyChangeJK, 0)).toBeCloseTo(
        0,
        12,
      );
      expect(otto.thermalEfficiency!).toBeLessThan(otto.carnotEfficiency!);
    });

    it("solves Carnot heat-engine and refrigerator cycles matching theoretical Carnot limits", () => {
      const carnot = solveCarnotCycle({
        kind: "carnot-cycle",
        moles: 1.0,
        hotTemperatureK: 600,
        coldTemperatureK: 300,
        initialVolumeM3: 1.5e-3,
        isothermalExpansionVolumeM3: 4.5e-3,
      });
      expect(carnot.states).toHaveLength(4);
      expect(carnot.thermalEfficiency).toBeCloseTo(
        carnotTheoreticalEfficiency(300, 600),
        13,
      );
      expect(carnot.thermalEfficiency).toBeCloseTo(0.5, 13);
      expect(carnot.carnotEfficiency).toBeCloseTo(0.5, 13);
      expect(carnot.netHeatJ).toBeCloseTo(carnot.netWorkJ, 12);
      expect(carnot.legs.reduce((s, l) => s + l.deltaUJ, 0)).toBeCloseTo(0, 12);
      expect(carnot.legs.reduce((s, l) => s + l.entropyChangeJK, 0)).toBeCloseTo(
        0,
        13,
      );

      // Reversed Carnot refrigerator: COP_cooling = T_C / (T_H - T_C) = 300 / 300 = 1.0
      const fridge = solveCarnotCycle({
        kind: "carnot-cycle",
        moles: 1.0,
        hotTemperatureK: 600,
        coldTemperatureK: 300,
        initialVolumeM3: 1.5e-3,
        isothermalExpansionVolumeM3: 4.5e-3,
        cycleDirection: "refrigerator",
      });
      expect(fridge.netWorkJ).toBeLessThan(0);
      expect(fridge.thermalEfficiency).toBeNull();
      expect(fridge.copCooling).toBeCloseTo(300 / (600 - 300), 13);
    });

    it("renders crisp PV, PT, and VT cycle SVGs with arrows, isotherms, and shaded work", () => {
      for (const plane of ["PV", "PT", "VT"] as const) {
        const svg = renderThermalSvg({
          kind: "carnot-cycle",
          id: `carnot-${plane}`,
          moles: 0.5,
          hotTemperatureK: 500,
          coldTemperatureK: 250,
          initialVolumeM3: 1.0e-3,
          isothermalExpansionVolumeM3: 2.5e-3,
          diagramPlane: plane,
        });
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg.endsWith("</svg>")).toBe(true);
        expect(svg).not.toMatch(/NaN|Infinity|undefined/);
        expect(svg).toContain("<polygon");
        expect(svg).toContain(">A<");
        expect(svg).toContain(">B<");
        expect(svg).toContain(">C<");
        expect(svg).toContain(">D<");
        if (plane === "PV") {
          expect(svg).toContain('fill="#dfe8f3"');
          expect(svg).toContain('stroke-dasharray="5 4"');
        }
        assertWellFormedSvgXml(svg);
      }

      // Also verify particleCount (PV = N k_B T) and derived moles from full (P, V, T)
      const byParticles = solveThermodynamicProcess({
        kind: "thermodynamic-process",
        particleCount: 3.01e23,
        initialState: { temperatureK: 300, pressurePa: 1.0e5 },
        steps: [{ process: "isothermal", targetPressurePa: 2.5e5 }],
      });
      expect(byParticles.states[0].volumeM3).toBeCloseTo(
        (3.01e23 * BOLTZMANN_CONSTANT * 300) / 1.0e5,
        12,
      );

      const byThreeVars = solveThermodynamicProcess({
        kind: "thermodynamic-process",
        initialState: {
          pressurePa: 2.0e5,
          volumeM3: 4.155e-3,
          temperatureK: 500,
        },
        steps: [
          { process: "isobaric", targetTemperatureK: 750 },
          { process: "isochoric", targetTemperatureK: 500 },
          { process: "adiabatic", targetPressurePa: 1.0e5 },
        ],
      });
      expect(byThreeVars.moles).toBeCloseTo(0.2, 12);
      assertWellFormedSvgXml(
        renderThermalSvg({
          kind: "thermodynamic-process",
          initialState: {
            pressurePa: 2.0e5,
            volumeM3: 4.155e-3,
            temperatureK: 500,
          },
          steps: [{ process: "isobaric", targetTemperatureK: 750 }],
          diagramPlane: "PV",
        }),
      );
    });
  });

  describe("2. Calorimetry phase-change heating/cooling curves & equilibrium mixing", () => {
    it("solves 5-stage heating and cooling curves with exact sensible slopes and latent plateaus", () => {
      const water = THERMAL_SUBSTANCE_PRESETS.water;
      const heatingSpec: ThermalScenarioSpec = {
        kind: "phase-change-curve",
        material: {
          name: "Water",
          massKg: 0.5,
          meltingPointK: water.meltingPointK,
          boilingPointK: water.boilingPointK,
          specificHeatSolidJPerKgK: water.specificHeatSolidJPerKgK,
          specificHeatLiquidJPerKgK: water.specificHeatLiquidJPerKgK,
          specificHeatGasJPerKgK: water.specificHeatGasJPerKgK,
          latentHeatFusionJPerKg: water.latentHeatFusionJPerKg,
          latentHeatVaporizationJPerKg: water.latentHeatVaporizationJPerKg,
        },
        initialTemperatureK: 253.15, // -20 °C
        finalTemperatureK: 403.15, // 130 °C
        heaterPowerW: 1000,
        heaterEfficiency: 0.8, // effective power = 800 W
        xAxisMode: "time",
        temperatureDisplayUnit: "C",
      };

      const heating = solvePhaseChangeCurve(heatingSpec);
      expect(heating.direction).toBe("heating");
      expect(heating.stages.map((s) => s.stageKind)).toEqual([
        "solid",
        "melting",
        "liquid",
        "boiling",
        "gas",
      ]);

      const qSolid = 0.5 * 2100 * 20;
      const qMelt = 0.5 * 3.34e5;
      const qLiquid = 0.5 * 4180 * 100;
      const qBoil = 0.5 * 2.26e6;
      const qGas = 0.5 * 2010 * 30;
      const expectedTotal = qSolid + qMelt + qLiquid + qBoil + qGas;

      expect(heating.totalEnergyJ).toBeCloseTo(expectedTotal, 8);
      expect(heating.sensibleEnergyJ).toBeCloseTo(qSolid + qLiquid + qGas, 8);
      expect(heating.latentEnergyJ).toBeCloseTo(qMelt + qBoil, 8);
      expect(heating.effectivePowerW).toBeCloseTo(800, 10);
      expect(heating.totalDurationS).toBeCloseTo(expectedTotal / 800, 8);
      expect(heating.stages[0].slopeKPerJ).toBeCloseTo(1 / (0.5 * 2100), 12);
      expect(heating.stages[0].slopeKPerS).toBeCloseTo(800 / (0.5 * 2100), 12);
      expect(heating.stages[1].slopeKPerJ).toBe(0);
      expect(heating.stages[1].slopeKPerS).toBe(0);

      // Exact reverse cooling curve symmetry
      const cooling = solvePhaseChangeCurve({
        ...heatingSpec,
        initialTemperatureK: 403.15,
        finalTemperatureK: 253.15,
      });
      expect(cooling.direction).toBe("cooling");
      expect(cooling.stages.map((s) => s.stageKind)).toEqual([
        "gas",
        "condensing",
        "liquid",
        "freezing",
        "solid",
      ]);
      expect(cooling.totalEnergyJ).toBeCloseTo(heating.totalEnergyJ, 8);
      expect(cooling.signedTotalHeatJ).toBeCloseTo(-heating.totalEnergyJ, 8);
    });

    it("solves multi-body sensible mixing, complete ice melting, and 0 °C ice-water coexistence", () => {
      const water = THERMAL_SUBSTANCE_PRESETS.water;

      // 1. Sensible 3-body mixing (copper block + water + copper cup + heat loss)
      const sensibleMix = solveCalorimetryMixing({
        kind: "calorimetry-mixing",
        components: [
          {
            id: "block",
            label: "Copper block",
            massKg: 0.4,
            initialTemperatureK: 393.15,
            specificHeatJPerKgK: 385,
          },
          {
            id: "water",
            label: "Water",
            massKg: 0.25,
            initialTemperatureK: 293.15,
            specificHeatJPerKgK: 4180,
          },
          {
            id: "cup",
            label: "Calorimeter cup",
            massKg: 0.1,
            initialTemperatureK: 293.15,
            specificHeatJPerKgK: 385,
          },
        ],
        heatLossToSurroundingsJ: 500,
      });
      const cBlock = 0.4 * 385;
      const cWater = 0.25 * 4180;
      const cCup = 0.1 * 385;
      const expectedTeq =
        (cBlock * 393.15 + (cWater + cCup) * 293.15 - 500) /
        (cBlock + cWater + cCup);
      expect(sensibleMix.equilibriumTemperatureK).toBeCloseTo(expectedTeq, 10);
      expect(sensibleMix.heatLostByHotJ).toBeCloseTo(
        sensibleMix.heatGainedByColdJ + 500,
        10,
      );
      expect(Math.abs(sensibleMix.energyBalanceResidualJ)).toBeLessThan(1e-9);

      // 2. Complete melting of -10 °C ice in warm 50 °C water
      const completeMelt = solveCalorimetryMixing({
        kind: "calorimetry-mixing",
        components: [
          {
            id: "ice",
            label: "Ice",
            massKg: 0.05,
            initialTemperatureK: 263.15,
            initialPhase: "solid",
            meltingPointK: 273.15,
            specificHeatSolidJPerKgK: water.specificHeatSolidJPerKgK,
            specificHeatLiquidJPerKgK: water.specificHeatLiquidJPerKgK,
            latentHeatFusionJPerKg: water.latentHeatFusionJPerKg,
          },
          {
            id: "water",
            label: "Warm water",
            massKg: 0.5,
            initialTemperatureK: 323.15,
            specificHeatJPerKgK: water.specificHeatLiquidJPerKgK,
          },
        ],
      });
      const qNeededToMelt = 0.05 * 2100 * 10 + 0.05 * 3.34e5; // 1050 + 16700 = 17750 J
      const qFromWaterToZero = 0.5 * 4180 * 50; // 104500 J
      const expectedMeltTeq =
        273.15 + (qFromWaterToZero - qNeededToMelt) / (0.55 * 4180);
      expect(completeMelt.isPhaseCoexistenceEquilibrium).toBe(false);
      expect(completeMelt.equilibriumTemperatureK).toBeCloseTo(
        expectedMeltTeq,
        10,
      );
      expect(completeMelt.components[0].finalPhase).toBe("liquid");
      expect(completeMelt.heatLostByHotJ).toBeCloseTo(
        completeMelt.heatGainedByColdJ,
        10,
      );

      // 3. Partial melting landing exactly at 273.15 K (0 °C ice-water coexistence)
      const coexist = solveCalorimetryMixing({
        kind: "calorimetry-mixing",
        components: [
          {
            id: "ice",
            label: "Ice",
            massKg: 0.2,
            initialTemperatureK: 273.15,
            initialPhase: "solid",
            meltingPointK: 273.15,
            specificHeatSolidJPerKgK: water.specificHeatSolidJPerKgK,
            specificHeatLiquidJPerKgK: water.specificHeatLiquidJPerKgK,
            latentHeatFusionJPerKg: water.latentHeatFusionJPerKg,
          },
          {
            id: "water",
            label: "Water",
            massKg: 0.2,
            initialTemperatureK: 293.15, // 20 °C -> Q_avail = 0.2 * 4180 * 20 = 16720 J < 0.2 * 3.34e5 = 66800 J
            specificHeatJPerKgK: water.specificHeatLiquidJPerKgK,
          },
        ],
      });
      expect(coexist.isPhaseCoexistenceEquilibrium).toBe(true);
      expect(coexist.equilibriumTemperatureK).toBeCloseTo(273.15, 11);
      expect(coexist.equilibriumTemperatureC).toBeCloseTo(0, 11);
      expect(coexist.components[0].finalPhase).toBe("solid-liquid");
      const expectedMeltedFrac = (0.2 * 4180 * 20) / (0.2 * 3.34e5);
      expect(coexist.components[0].transitionFraction).toBeCloseTo(
        expectedMeltedFrac,
        11,
      );
      expect(Math.abs(coexist.energyBalanceResidualJ)).toBeLessThan(1e-9);

      // 4. Steam condensing into boiling-point liquid-gas coexistence at 373.15 K
      const steamCoexist = solveCalorimetryMixing({
        kind: "calorimetry-mixing",
        components: [
          {
            id: "steam",
            label: "Steam",
            massKg: 0.05,
            initialTemperatureK: 373.15,
            initialPhase: "gas",
            meltingPointK: 273.15,
            boilingPointK: 373.15,
            specificHeatSolidJPerKgK: water.specificHeatSolidJPerKgK,
            specificHeatLiquidJPerKgK: water.specificHeatLiquidJPerKgK,
            specificHeatGasJPerKgK: water.specificHeatGasJPerKgK,
            latentHeatFusionJPerKg: water.latentHeatFusionJPerKg,
            latentHeatVaporizationJPerKg: water.latentHeatVaporizationJPerKg,
          },
          {
            id: "cool-water",
            label: "Water",
            massKg: 0.2,
            initialTemperatureK: 323.15, // absorbs 0.2 * 4180 * 50 = 41800 J < 0.05 * 2.26e6 = 113000 J
            specificHeatJPerKgK: water.specificHeatLiquidJPerKgK,
          },
        ],
      });
      expect(steamCoexist.equilibriumTemperatureK).toBeCloseTo(373.15, 10);
      expect(steamCoexist.isPhaseCoexistenceEquilibrium).toBe(true);
      expect(steamCoexist.components[0].finalPhase).toBe("liquid-gas");

      // 5. Pure isothermal melting plateau (273.15 K solid -> 273.15 K liquid)
      const pureMelt = solvePhaseChangeCurve({
        kind: "phase-change-curve",
        material: {
          massKg: 0.3,
          meltingPointK: 273.15,
          boilingPointK: 373.15,
          latentHeatFusionJPerKg: water.latentHeatFusionJPerKg,
        },
        initialTemperatureK: 273.15,
        finalTemperatureK: 273.15,
        initialPhase: "solid",
        finalPhase: "liquid",
      });
      expect(pureMelt.stages).toHaveLength(1);
      expect(pureMelt.totalEnergyJ).toBeCloseTo(0.3 * 3.34e5, 8);
    });
  });

  describe("3. Kinetic theory & thermal radiation", () => {
    it("computes RMS speed, translational kinetic energy, macroscopic pressure, and normalized Maxwell-Boltzmann density", () => {
      const kt = solveKineticTheory({
        kind: "kinetic-theory",
        gasLabel: "Helium-4",
        temperatureK: 300,
        molarMassKgPerMol: 4.0e-3,
        moles: 2.0,
        volumeM3: 0.05,
        comparisonTemperatureK: 1200,
      });

      expect(kt.rmsSpeedMs).toBeCloseTo(rmsSpeedFromMolarMass(300, 4.0e-3), 12);
      expect(kt.averageKineticEnergyJ).toBeCloseTo(
        averageTranslationalKineticEnergy(300),
        25,
      );
      expect(kt.mostProbableSpeedMs).toBeLessThan(kt.meanSpeedMs);
      expect(kt.meanSpeedMs).toBeLessThan(kt.rmsSpeedMs);
      expect(kt.rmsSpeedMs / kt.mostProbableSpeedMs).toBeCloseTo(
        Math.sqrt(1.5),
        12,
      );
      expect(kt.meanSpeedMs / kt.mostProbableSpeedMs).toBeCloseTo(
        2 / Math.sqrt(Math.PI),
        12,
      );
      // Quadrupling temperature doubles v_rms
      expect(kt.comparisonRmsSpeedMs! / kt.rmsSpeedMs).toBeCloseTo(2, 12);
      // Macroscopic kinetic pressure identity: P = (1/3) * rho * v_rms^2
      expect(kt.pressurePa!).toBeCloseTo(
        (1 / 3) * kt.densityKgPerM3! * kt.rmsSpeedMs ** 2,
        9,
      );

      // Single-particle mass specification
      const particleMass = 4.0e-3 / AVOGADRO_CONSTANT;
      const ktParticle = solveKineticTheory({
        kind: "kinetic-theory",
        temperatureK: 300,
        particleMassKg: particleMass,
      });
      expect(ktParticle.rmsSpeedMs).toBeCloseTo(
        rmsSpeedFromParticleMass(300, particleMass),
        12,
      );

      // Numerical integration of Maxwell-Boltzmann speed probability density = 1
      const vMax = kt.rmsSpeedMs * 6;
      const nSteps = 2000;
      const dv = vMax / nSteps;
      let area = 0;
      for (let i = 0; i < nSteps; i++) {
        const vMid = (i + 0.5) * dv;
        area +=
          maxwellBoltzmannSpeedDensity(vMid, 300, kt.particleMassKg) * dv;
      }
      expect(area).toBeCloseTo(1, 5);
    });

    it("computes Wien peak wavelength, Stefan-Boltzmann power, and calibrated Planck spectral exitance", () => {
      const rad = solveThermalRadiation({
        kind: "thermal-radiation",
        bodyLabel: "Solar photosphere",
        temperatureK: 5800,
        emissivity: 1,
        surfaceAreaM2: 6.09e18,
        observerDistanceM: 1.496e11,
        comparisonTemperatureK: 2900,
      });

      expect(rad.peakWavelengthM).toBeCloseTo(wienPeakWavelength(5800), 15);
      expect(rad.peakWavelengthNm).toBeCloseTo(500, 10);
      expect(rad.radiatedPowerW).toBeCloseTo(
        stefanBoltzmannPower(1, 6.09e18, 5800),
        -12,
      );
      expect(rad.comparisonPeakWavelengthM! / rad.peakWavelengthM).toBeCloseTo(
        2,
        12,
      );
      expect(rad.comparisonPowerRatio).toBeCloseTo((1 / 2) ** 4, 12);
      expect(rad.intensityAtDistanceWm2!).toBeCloseTo(
        rad.radiatedPowerW / (4 * Math.PI * 1.496e11 ** 2),
        8,
      );

      // Verify Planck curve peaks strictly at Wien lambda_max and integrates to e * sigma * T^4
      const peakExitance = planckSpectralExitance(rad.peakWavelengthM, 5800, 1);
      const leftExitance = planckSpectralExitance(
        rad.peakWavelengthM * 0.999,
        5800,
        1,
      );
      const rightExitance = planckSpectralExitance(
        rad.peakWavelengthM * 1.001,
        5800,
        1,
      );
      expect(peakExitance).toBeGreaterThan(leftExitance);
      expect(peakExitance).toBeGreaterThan(rightExitance);

      // Integrate M_lambda from 0.05 * lambda_max to 30 * lambda_max
      const lMin = rad.peakWavelengthM * 0.05;
      const lMax = rad.peakWavelengthM * 40;
      const nBins = 4000;
      const dl = (lMax - lMin) / nBins;
      let integratedExitance = 0;
      for (let i = 0; i < nBins; i++) {
        const lMid = lMin + (i + 0.5) * dl;
        integratedExitance += planckSpectralExitance(lMid, 5800, 0.85) * dl;
      }
      const expectedExitance = 0.85 * STEFAN_BOLTZMANN_CONSTANT * 5800 ** 4;
      expect(
        Math.abs(integratedExitance - expectedExitance) / expectedExitance,
      ).toBeLessThan(2e-4);
      expect(WIEN_DISPLACEMENT_CONSTANT).toBe(2.9e-3);
    });
  });

  describe("4. Scenario validation & error rejection", () => {
    it("rejects physically impossible or inconsistent specifications cleanly", () => {
      const invalidCases: ThermalScenarioSpec[] = [
        // Negative Kelvin temperature
        {
          kind: "kinetic-theory",
          temperatureK: -10,
          molarMassKgPerMol: 0.004,
        },
        // Over-constrained inconsistent PV = nRT
        {
          kind: "thermodynamic-process",
          moles: 1,
          initialState: {
            pressurePa: 1e5,
            volumeM3: 1e-3,
            temperatureK: 500, // 1e5 * 1e-3 = 100 != 8.31 * 500
          },
          steps: [{ process: "isobaric", targetVolumeM3: 2e-3 }],
        },
        // Unclosed cycle marked isClosedCycle: true
        {
          kind: "thermodynamic-process",
          moles: 0.5,
          initialState: { pressurePa: 2e5, volumeM3: 1e-3 },
          steps: [
            { process: "isobaric", targetVolumeM3: 3e-3 },
            { process: "isochoric", targetPressurePa: 1e5 },
          ],
          isClosedCycle: true,
        },
        // Impossible closeToInitial step
        {
          kind: "thermodynamic-process",
          moles: 0.5,
          initialState: { pressurePa: 2e5, volumeM3: 1e-3 },
          steps: [
            { process: "isobaric", targetVolumeM3: 3e-3 },
            { process: "isochoric", closeToInitial: true },
          ],
        },
        // Carnot with T_C >= T_H
        {
          kind: "carnot-cycle",
          moles: 1,
          hotTemperatureK: 300,
          coldTemperatureK: 350,
          initialVolumeM3: 1e-3,
          isothermalExpansionVolumeM3: 2e-3,
        },
        // Phase-change time mode without heaterPowerW
        {
          kind: "phase-change-curve",
          material: {
            massKg: 0.5,
            meltingPointK: 273.15,
            boilingPointK: 373.15,
            specificHeatLiquidJPerKgK: 4180,
          },
          initialTemperatureK: 290,
          finalTemperatureK: 340,
          xAxisMode: "time",
        },
        // Emissivity > 1
        {
          kind: "thermal-radiation",
          temperatureK: 5000,
          emissivity: 1.2,
          surfaceAreaM2: 1,
        },
        // Duplicate component IDs in mixing
        {
          kind: "calorimetry-mixing",
          components: [
            {
              id: "dup",
              label: "A",
              massKg: 1,
              initialTemperatureK: 300,
              specificHeatJPerKgK: 400,
            },
            {
              id: "dup",
              label: "B",
              massKg: 1,
              initialTemperatureK: 350,
              specificHeatJPerKgK: 400,
            },
          ],
        },
        // Excessive heat loss exceeding total enthalpy
        {
          kind: "calorimetry-mixing",
          components: [
            {
              id: "a",
              label: "A",
              massKg: 0.1,
              initialTemperatureK: 300,
              specificHeatJPerKgK: 100,
            },
            {
              id: "b",
              label: "B",
              massKg: 0.1,
              initialTemperatureK: 310,
              specificHeatJPerKgK: 100,
            },
          ],
          heatLossToSurroundingsJ: 1e7,
        },
        // Inconsistent moles vs particleCount
        {
          kind: "carnot-cycle",
          moles: 1,
          particleCount: 1e20,
          hotTemperatureK: 600,
          coldTemperatureK: 300,
          initialVolumeM3: 1e-3,
          isothermalExpansionVolumeM3: 2e-3,
        },
        // Inconsistent particleMassKg vs molarMassKgPerMol
        {
          kind: "kinetic-theory",
          temperatureK: 300,
          molarMassKgPerMol: 0.004,
          particleMassKg: 1e-24,
        },
        // Incomplete macroscopic state (moles without volumeM3)
        {
          kind: "kinetic-theory",
          temperatureK: 300,
          molarMassKgPerMol: 0.004,
          moles: 1,
        },
        // Negative ambient temperature
        {
          kind: "thermal-radiation",
          temperatureK: 500,
          surfaceAreaM2: 1,
          ambientTemperatureK: -5,
        },
        // Isobaric step trying to change pressure
        {
          kind: "thermodynamic-process",
          moles: 1,
          initialState: { pressurePa: 1e5, volumeM3: 1e-3 },
          steps: [{ process: "isobaric", targetPressurePa: 2e5 }],
        },
      ];

      for (const badSpec of invalidCases) {
        const res = validateThermalScenario(badSpec);
        expect(res.valid).toBe(false);
        expect(res.issues.length).toBeGreaterThan(0);
        expect(() => solveThermalScenario(badSpec)).toThrow();
        expect(() => renderThermalSvg(badSpec)).toThrow();
      }

      expect(() =>
        renderThermalSvg(
          {
            kind: "kinetic-theory",
            temperatureK: 300,
            molarMassKgPerMol: 0.004,
          },
          { width: 150, height: 150 },
        ),
      ).toThrow("width");
    });
  });

  describe("5. CRITICAL INVARIANT: Zero hidden-quantity leakage in student SVGs", () => {
    it("never leaks hidden state pressures, work, or efficiency on thermodynamic & Carnot SVGs", () => {
      // Adiabatic expansion where P_B and W are unknown targets
      const adiabSpec: ThermalScenarioSpec = {
        kind: "thermodynamic-process",
        moles: 0.6,
        initialState: { pressurePa: 4.37e5, volumeM3: 1.3e-3 },
        steps: [{ process: "adiabatic", targetVolumeM3: 3.9e-3 }],
        showIsotherms: true,
        showIsothermLabels: true,
        hiddenQuantities: [
          "state:B:pressurePa",
          "state:B:temperatureK",
          "workJ",
        ],
      };
      const adiabSol = solveThermodynamicProcess(adiabSpec);
      const adiabSvg = renderThermalSvg(adiabSpec);
      const adiabVisible = extractStudentVisibleText(adiabSvg);

      const pBScaled = formatSignificant(adiabSol.states[1].pressurePa * 1e-5);
      const tBFormatted = formatSignificant(adiabSol.states[1].temperatureK);
      const wFormatted = formatSignificant(adiabSol.legs[0].workJ);

      expect(adiabVisible).not.toContain(pBScaled);
      expect(adiabVisible).not.toContain(tBFormatted);
      expect(adiabVisible).not.toContain(wFormatted);
      expect(adiabVisible).toContain("P_B");

      // Even on an isobaric step where P_B === P_A = 3.73e5 Pa, hiding P_B must NOT leak 3.73 on P-axis!
      const isobaricSpec: ThermalScenarioSpec = {
        kind: "thermodynamic-process",
        moles: 0.5,
        initialState: { pressurePa: 3.73e5, volumeM3: 1.5e-3 },
        steps: [{ process: "isobaric", targetVolumeM3: 4.5e-3 }],
        hiddenQuantities: ["P_B"],
      };
      const isobaricVisible = extractStudentVisibleText(
        renderThermalSvg(isobaricSpec),
      );
      expect(isobaricVisible).not.toContain("3.73");
      expect(isobaricVisible).not.toContain("373");

      // Carnot cycle hiding T_H, netWorkJ, thermalEfficiency
      const carnotSpec: ThermalScenarioSpec = {
        kind: "carnot-cycle",
        moles: 0.75,
        hotTemperatureK: 737,
        coldTemperatureK: 289,
        initialVolumeM3: 1.2e-3,
        isothermalExpansionVolumeM3: 3.1e-3,
        diagramPlane: "PT",
        hiddenQuantities: ["hotTemperatureK", "netWorkJ", "thermalEfficiency"],
      };
      const carnotSol = solveCarnotCycle(carnotSpec);
      const carnotSvg = renderThermalSvg(carnotSpec);
      const carnotVisible = extractStudentVisibleText(carnotSvg);
      expect(carnotVisible).not.toContain("737");
      expect(carnotVisible).not.toContain(formatSignificant(carnotSol.netWorkJ));
      expect(carnotVisible).not.toContain(
        formatSignificant(carnotSol.thermalEfficiency! * 100),
      );

      // Explicit visibleQuantities allowlist mode: permits ONLY allowlisted quantities
      const allowlistSvg = renderThermalSvg({
        ...carnotSpec,
        hiddenQuantities: [],
        visibleQuantities: ["netWorkJ", "thermalEfficiency"],
      });
      const allowlistVisible = extractStudentVisibleText(allowlistSvg);
      expect(allowlistVisible).toContain(formatSignificant(carnotSol.netWorkJ));
      expect(allowlistVisible).not.toContain("737");
    });

    it("never leaks hidden latent heat, equilibrium temperature, RMS speed, or Wien peak wavelength", () => {
      // 1. Phase-change curve with m = 1 kg where Q_melt == L_f = 334 kJ numerically
      const phaseSpec: ThermalScenarioSpec = {
        kind: "phase-change-curve",
        material: {
          massKg: 1.0,
          meltingPointK: 273.15,
          boilingPointK: 373.15,
          specificHeatSolidJPerKgK: 2100,
          specificHeatLiquidJPerKgK: 4180,
          latentHeatFusionJPerKg: 3.34e5,
        },
        initialTemperatureK: 253.15,
        finalTemperatureK: 323.15,
        hiddenQuantities: ["latentHeatFusionJPerKg", "meltingPointK"],
      };
      const phaseVisible = extractStudentVisibleText(
        renderThermalSvg(phaseSpec),
      );
      expect(phaseVisible).not.toContain("334");
      expect(phaseVisible).not.toContain("273");
      expect(phaseVisible).toContain("T_m");

      // 2. Calorimetry mixing (both schematic and convergence-graph)
      for (const variant of [
        "calorimeter-schematic",
        "convergence-graph",
      ] as const) {
        const mixSpec: ThermalScenarioSpec = {
          kind: "calorimetry-mixing",
          diagramVariant: variant,
          components: [
            {
              id: "cu",
              label: "Copper <script>block</script>",
              massKg: 0.35,
              initialTemperatureK: 417,
              specificHeatJPerKgK: 385,
            },
            {
              id: "h2o",
              label: "Water",
              massKg: 0.25,
              initialTemperatureK: 291,
              specificHeatJPerKgK: 4180,
            },
          ],
          hiddenQuantities: [
            "equilibriumTemperatureK",
            "component:0:specificHeatJPerKgK",
          ],
        };
        const mixSol = solveCalorimetryMixing(mixSpec);
        const mixSvg = renderThermalSvg(mixSpec);
        expect(mixSvg).not.toContain("<script>");
        expect(mixSvg).toContain("&lt;script&gt;");
        const mixVisible = extractStudentVisibleText(mixSvg);
        expect(mixVisible).not.toContain(
          formatSignificant(mixSol.equilibriumTemperatureK),
        );
        expect(mixVisible).not.toContain("385");
      }

      // 3. Kinetic theory hiding rmsSpeedMs and temperatureK
      const ktSpec: ThermalScenarioSpec = {
        kind: "kinetic-theory",
        temperatureK: 437,
        molarMassKgPerMol: 0.04,
        hiddenQuantities: ["rmsSpeedMs", "temperatureK"],
      };
      const ktSol = solveKineticTheory(ktSpec);
      const ktSvg = renderThermalSvg(ktSpec);
      const ktVisible = extractStudentVisibleText(ktSvg);
      expect(ktVisible).not.toContain("437");
      expect(ktVisible).not.toContain(formatSignificant(ktSol.rmsSpeedMs));

      // 4. Thermal radiation hiding peakWavelengthM (500 nm at 5800 K) and radiatedPowerW
      const radSpec: ThermalScenarioSpec = {
        kind: "thermal-radiation",
        temperatureK: 5800,
        surfaceAreaM2: 2.5,
        hiddenQuantities: ["peakWavelengthM", "radiatedPowerW"],
      };
      const radSol = solveThermalRadiation(radSpec);
      const radSvgStudent = renderThermalSvg(radSpec);
      const radSvgTeacher = renderThermalSvg(radSpec, {
        mode: "teacher-complete",
      });
      const radVisible = extractStudentVisibleText(radSvgStudent);
      expect(radVisible).not.toContain("500");
      expect(radVisible).not.toContain(formatSignificant(radSol.radiatedPowerW));
      expect(radVisible).toContain("λ_max");

      // Verify curve <path> geometry in student-safe mode matches teacher-complete mode!
      const studentPrimaryCurve = radSvgStudent.match(
        /<path d="([^"]+)" fill="none" stroke="#15191d" stroke-width="2\.4"/,
      )?.[1];
      const teacherPrimaryCurve = radSvgTeacher.match(
        /<path d="([^"]+)" fill="none" stroke="#15191d" stroke-width="2\.4"/,
      )?.[1];
      expect(studentPrimaryCurve).toBeDefined();
      expect(studentPrimaryCurve).toBe(teacherPrimaryCurve);
    });
  });

  describe("6. Deterministic seeded parametric generators", () => {
    it("produces reproducible scenarios from identical seeds and distinct valid scenarios across seeds", () => {
      const rngA = createSeededRandom("sixthphysics-thermal-42");
      const rngB = createSeededRandom("sixthphysics-thermal-42");
      expect(Array.from({ length: 8 }, () => rngA.next())).toEqual(
        Array.from({ length: 8 }, () => rngB.next()),
      );

      const s1 = generateThermalScenario("seed-alpha", "carnot-cycle");
      const s2 = generateThermalScenario("seed-alpha", "carnot-cycle");
      expect(s1).toEqual(s2);
      expect(renderThermalSvg(s1)).toBe(renderThermalSvg(s2));

      // Exercise every specialized generator archetype
      const specialized: ThermalScenarioSpec[] = [
        generateThermodynamicProcessScenario(1, {
          archetype: "rectangular-cycle",
        }),
        generateThermodynamicProcessScenario(2, {
          archetype: "isothermal-isobaric-isochoric-cycle",
        }),
        generateThermodynamicProcessScenario(3, {
          archetype: "adiabatic-isobaric-isochoric-cycle",
        }),
        generateThermodynamicProcessScenario(4, { archetype: "otto-cycle" }),
        generateThermodynamicProcessScenario(5, {
          archetype: "single-isothermal",
        }),
        generateThermodynamicProcessScenario(6, {
          archetype: "single-adiabatic",
        }),
        generateThermodynamicProcessScenario(7, { archetype: "two-step-open" }),
        generateCarnotCycleScenario(8, { cycleDirection: "heat-engine" }),
        generateCarnotCycleScenario(9, { cycleDirection: "refrigerator" }),
        generatePhaseChangeScenario(10, {
          direction: "heating",
          xAxisMode: "energy",
        }),
        generatePhaseChangeScenario(11, {
          direction: "cooling",
          xAxisMode: "time",
        }),
        generateCalorimetryMixingScenario(12, { archetype: "metal-in-water" }),
        generateCalorimetryMixingScenario(13, {
          archetype: "ice-in-water-melt",
        }),
        generateCalorimetryMixingScenario(14, {
          archetype: "ice-water-coexistence",
        }),
        generateKineticTheoryScenario(15, { withComparison: true }),
        generateThermalRadiationScenario(16, { withComparison: true }),
      ];

      const batch = generateThermalScenarioBatch("wave2-pilot", 60);
      expect(batch).toHaveLength(60);

      for (const spec of [...specialized, ...batch]) {
        const validation = validateThermalScenario(spec);
        expect(validation).toEqual({ valid: true, issues: [] });
        const sol = solveThermalScenario(spec);
        if (
          sol.kind === "thermodynamic-process" ||
          sol.kind === "carnot-cycle"
        ) {
          for (const leg of sol.legs) {
            expect(leg.deltaUJ).toBeCloseTo(leg.heatJ - leg.workJ, 10);
          }
          if (sol.isClosedCycle) {
            expect(sol.netHeatJ).toBeCloseTo(sol.netWorkJ, 9);
          }
        }
        const svg = renderThermalSvg(spec);
        assertWellFormedSvgXml(svg);
      }
    });
  });
});
