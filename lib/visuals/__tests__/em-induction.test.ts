import {
  ATOMIC_MASS_UNIT_KG,
  ELECTRON_MASS_KG,
  ELEMENTARY_CHARGE_C,
  EM_INDUCTION_SCENARIO_KINDS,
  EmInductionScenarioSpec,
  PROTON_MASS_KG,
  VACUUM_PERMITTIVITY,
  capacitorStoredEnergyFromCV,
  capacitorStoredEnergyFromQC,
  capacitorStoredEnergyFromQV,
  cyclotronPeriod,
  cyclotronRadius,
  expandQuantityKeys,
  formatSiQuantity,
  generateElectricDeflectionScenario,
  generateEmInductionScenario,
  generateEmInductionScenarioBatch,
  inferQuantityUnit,
  lorentzMagneticForce2D,
  magneticFlux,
  motionalEmf,
  parallelCapacitance,
  parallelPlateCapacitance,
  rcHalfTime,
  rcTimeConstant,
  renderEmInductionSvg,
  renderSolvedEmInductionSvg,
  rmsFromPeak,
  seriesCapacitance,
  solveCapacitorChargeSharing,
  solveEmInductionScenario,
  validateEmInductionScenario,
} from "../em-induction";

const GEOMETRIC_SVG_ATTRS = new Set([
  "xmlns",
  "width",
  "height",
  "viewbox",
  "role",
  "id",
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
  "d",
  "points",
  "transform",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "markerwidth",
  "markerheight",
  "refx",
  "refy",
  "orient",
  "marker-end",
  "marker-start",
]);

function extractVisibleTextAndMetadata(svg: string): string {
  const texts = [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    m[1].replace(/<\/?tspan\b[^>]*>/g, ""),
  );
  const tspans = [...svg.matchAll(/<tspan\b[^>]*>([\s\S]*?)<\/tspan>/g)].map(
    (m) => m[1],
  );
  const titles = [...svg.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/g)].map(
    (m) => m[1],
  );
  const descs = [...svg.matchAll(/<desc\b[^>]*>([\s\S]*?)<\/desc>/g)].map(
    (m) => m[1],
  );
  const semanticAttrs: string[] = [];
  for (const attrMatch of svg.matchAll(
    /\s([a-zA-Z_:][a-zA-Z0-9_.:-]*)="([^"]*)"/g,
  )) {
    const attrName = attrMatch[1].toLowerCase();
    if (!GEOMETRIC_SVG_ATTRS.has(attrName)) {
      semanticAttrs.push(attrMatch[2]);
    }
  }
  return [...texts, ...tspans, ...titles, ...descs, ...semanticAttrs].join(
    " | ",
  );
}

function parseSvgPathPoints(pathAttr: string): Array<{ x: number; y: number }> {
  const matches = [
    ...pathAttr.matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g),
  ];
  return matches.map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

function assertWellFormedSvgXml(svg: string): void {
  expect(svg.startsWith("<svg ")).toBe(true);
  expect(svg.endsWith("</svg>")).toBe(true);
  expect(svg).not.toMatch(/NaN|Infinity|undefined/);

  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)(\s[^>]*)?\s*\/?>/g;
  const stack: string[] = [];
  for (const match of svg.matchAll(tagRegex)) {
    const full = match[0];
    const tagName = match[1];
    const attrChunk = match[2] ?? "";

    if (!full.startsWith("</")) {
      const attrNames = [
        ...attrChunk.matchAll(/\s([a-zA-Z_:][a-zA-Z0-9_.:-]*)=/g),
      ].map((a) => a[1]);
      expect(new Set(attrNames).size).toBe(attrNames.length);
    }

    if (full.startsWith("</")) {
      expect(stack.pop()).toBe(tagName);
    } else if (!full.endsWith("/>")) {
      stack.push(tagName);
    }
  }
  expect(stack).toEqual([]);
}

describe("em-induction solver, validator, SVG renderer, and generators", () => {
  describe("Capacitors and RC transients", () => {
    it("computes parallel-plate capacitance, field, and identical 1/2 CV^2 = 1/2 QV = Q^2/(2C) energy", () => {
      const spec = {
        kind: "parallel-plate-capacitor" as const,
        plateAreaM2: 0.04,
        plateSeparationM: 0.002,
        relativePermittivity: 2.5,
        voltageV: 120,
      };
      const sol = solveEmInductionScenario(spec);
      expect(sol.kind).toBe("parallel-plate-capacitor");
      if (sol.kind !== "parallel-plate-capacitor") return;

      const expectedC = (2.5 * VACUUM_PERMITTIVITY * 0.04) / 0.002;
      expect(sol.capacitanceF).toBeCloseTo(expectedC, 18);
      expect(sol.capacitanceF).toBeCloseTo(
        parallelPlateCapacitance(0.04, 0.002, 2.5),
        18,
      );
      expect(sol.chargeC).toBeCloseTo(expectedC * 120, 16);
      expect(sol.electricFieldVm).toBeCloseTo(60000, 8);

      const uCV = capacitorStoredEnergyFromCV(sol.capacitanceF, 120);
      const uQV = capacitorStoredEnergyFromQV(sol.chargeC, 120);
      const uQC = capacitorStoredEnergyFromQC(sol.chargeC, sol.capacitanceF);
      expect(sol.storedEnergyJ).toBeCloseTo(uCV, 16);
      expect(uCV).toBeCloseTo(uQV, 16);
      expect(uCV).toBeCloseTo(uQC, 16);
      expect(sol.energyDensityJm3 * 0.04 * 0.002).toBeCloseTo(
        sol.storedEnergyJ,
        16,
      );
    });

    it("distinguishes isolated-charge vs constant-voltage plate separation doubling", () => {
      const isolated = solveEmInductionScenario({
        kind: "parallel-plate-capacitor",
        plateAreaM2: 0.05,
        plateSeparationM: 0.002,
        voltageV: 100,
        afterChange: { constraint: "isolated-charge", newSeparationM: 0.004 },
      });
      const connected = solveEmInductionScenario({
        kind: "parallel-plate-capacitor",
        plateAreaM2: 0.05,
        plateSeparationM: 0.002,
        voltageV: 100,
        afterChange: { constraint: "constant-voltage", newSeparationM: 0.004 },
      });
      if (
        isolated.kind !== "parallel-plate-capacitor" ||
        connected.kind !== "parallel-plate-capacitor"
      ) {
        throw new Error("Unexpected solution kind");
      }

      // Isolated charge: C halves, Q constant, V doubles, E unchanged, U doubles
      expect(isolated.afterChange!.capacitanceF).toBeCloseTo(
        isolated.capacitanceF / 2,
        18,
      );
      expect(isolated.afterChange!.chargeC).toBeCloseTo(isolated.chargeC, 18);
      expect(isolated.afterChange!.voltageV).toBeCloseTo(200, 10);
      expect(isolated.afterChange!.electricFieldVm).toBeCloseTo(
        isolated.electricFieldVm,
        10,
      );
      expect(isolated.afterChange!.storedEnergyJ).toBeCloseTo(
        2 * isolated.storedEnergyJ,
        16,
      );
      expect(isolated.afterChange!.energyChangeJ).toBeCloseTo(
        isolated.storedEnergyJ,
        16,
      );

      // Constant voltage: C halves, V constant, Q halves, E halves, U halves
      expect(connected.afterChange!.voltageV).toBeCloseTo(100, 10);
      expect(connected.afterChange!.chargeC).toBeCloseTo(
        connected.chargeC / 2,
        18,
      );
      expect(connected.afterChange!.electricFieldVm).toBeCloseTo(
        connected.electricFieldVm / 2,
        10,
      );
      expect(connected.afterChange!.storedEnergyJ).toBeCloseTo(
        connected.storedEnergyJ / 2,
        16,
      );
      expect(connected.afterChange!.energyChangeJ).toBeCloseTo(
        -connected.storedEnergyJ / 2,
        16,
      );
    });

    it("solves series, parallel, series-parallel, and charge-sharing capacitor networks", () => {
      expect(seriesCapacitance([30e-6, 60e-6])).toBeCloseTo(20e-6, 12);
      expect(parallelCapacitance([30e-6, 60e-6])).toBeCloseTo(90e-6, 12);

      const sp = solveEmInductionScenario({
        kind: "capacitor-network",
        topology: {
          arrangement: "series-parallel",
          seriesCapacitanceF: 60e-6,
          parallelCapacitancesF: [10e-6, 20e-6],
          supplyVoltageV: 18,
        },
      });
      if (sp.kind !== "capacitor-network") throw new Error("Wrong kind");
      // Parallel bank = 30 uF; in series with 60 uF => C_eq = 20 uF
      expect(sp.equivalentCapacitanceF).toBeCloseTo(20e-6, 12);
      expect(sp.totalChargeC).toBeCloseTo(360e-6, 12);
      // Series cap gets 360 uC / 60 uF = 6 V; parallel bank gets 12 V
      expect(sp.elements[0].voltageV).toBeCloseTo(6, 10);
      expect(sp.elements[1].voltageV).toBeCloseTo(12, 10);
      expect(sp.elements[1].chargeC + sp.elements[2].chargeC).toBeCloseTo(
        sp.totalChargeC,
        12,
      );
      const sumElementEnergy = sp.elements.reduce(
        (s, el) => s + el.storedEnergyJ,
        0,
      );
      expect(sumElementEnergy).toBeCloseTo(sp.totalStoredEnergyJ, 12);

      // Charge sharing between 20 uF at 30 V and uncharged 40 uF
      const shared = solveCapacitorChargeSharing(20e-6, 30, 40e-6, 0, "same");
      expect(shared.netChargeC).toBeCloseTo(600e-6, 12);
      expect(shared.finalCommonVoltageV).toBeCloseTo(10, 10);
      expect(shared.initialStoredEnergyJ).toBeCloseTo(9e-3, 12);
      expect(shared.finalStoredEnergyJ).toBeCloseTo(3e-3, 12);
      expect(shared.energyDissipatedJ).toBeCloseTo(6e-3, 12);

      // Opposing-polarity charge sharing: 20 uF at 30 V (600 uC) vs 10 uF at 30 V (300 uC)
      const opposing = solveCapacitorChargeSharing(
        20e-6,
        30,
        10e-6,
        30,
        "opposing",
      );
      expect(opposing.netChargeC).toBeCloseTo(300e-6, 12);
      expect(opposing.finalCommonVoltageV).toBeCloseTo(10, 10);
      expect(opposing.energyDissipatedJ).toBeCloseTo(
        opposing.initialStoredEnergyJ - opposing.finalStoredEnergyJ,
        12,
      );
    });

    it("solves exact RC charging and discharging curves with tau = RC and t_1/2 = RC ln 2", () => {
      const r = 4000;
      const c = 50e-6;
      const v0 = 12;
      const tau = rcTimeConstant(r, c); // 0.2 s
      const tHalf = rcHalfTime(r, c);
      expect(tau).toBeCloseTo(0.2, 12);
      expect(tHalf).toBeCloseTo(0.2 * Math.LN2, 12);

      const chargingAtTau = solveEmInductionScenario({
        kind: "rc-transient",
        mode: "charging",
        resistanceOhm: r,
        capacitanceF: c,
        supplyVoltageV: v0,
        queryTimeS: tau,
      });
      if (chargingAtTau.kind !== "rc-transient") throw new Error("Wrong kind");
      expect(chargingAtTau.capacitorVoltageAtQueryV).toBeCloseTo(
        v0 * (1 - Math.exp(-1)),
        12,
      );
      expect(chargingAtTau.resistorVoltageAtQueryV).toBeCloseTo(
        v0 * Math.exp(-1),
        12,
      );
      // Kirchhoff loop law V_C(t) + V_R(t) = V_0 everywhere along the curve
      chargingAtTau.curves.capacitorVoltage.forEach((pt, idx) => {
        const vr = chargingAtTau.curves.resistorVoltage[idx].y;
        expect(pt.y + vr).toBeCloseTo(v0, 12);
      });

      const dischargingAtHalf = solveEmInductionScenario({
        kind: "rc-transient",
        mode: "discharging",
        resistanceOhm: r,
        capacitanceF: c,
        supplyVoltageV: v0,
        queryTimeS: tHalf,
      });
      if (dischargingAtHalf.kind !== "rc-transient")
        throw new Error("Wrong kind");
      expect(dischargingAtHalf.capacitorVoltageAtQueryV).toBeCloseTo(6, 12);
      expect(dischargingAtHalf.chargeAtQueryC).toBeCloseTo(
        0.5 * dischargingAtHalf.maxChargeC,
        12,
      );
      expect(dischargingAtHalf.storedEnergyAtQueryJ).toBeCloseTo(
        0.25 * dischargingAtHalf.maxStoredEnergyJ,
        12,
      );
    });
  });

  describe("Electromagnetic induction, AC generators, and transformers", () => {
    it("computes magnetic flux, Faraday signed EMF, Lenz opposition, and Δt-invariant induced charge", () => {
      expect(magneticFlux(0.5, 0.02, 90)).toBe(0);
      expect(magneticFlux(0.5, 0.02, 60)).toBeCloseTo(0.005, 12);

      // Normal angle 30 deg == plane angle 60 deg
      const fromNormal = solveEmInductionScenario({
        kind: "flux-faraday",
        turns: 200,
        coilAreaM2: 0.015,
        initialFieldT: 0.1,
        finalFieldT: 0.5,
        initialAngleDegrees: 30,
        finalAngleDegrees: 30,
        angleReference: "normal",
        timeIntervalS: 0.08,
        coilResistanceOhm: 4,
      });
      const fromPlane = solveEmInductionScenario({
        kind: "flux-faraday",
        turns: 200,
        coilAreaM2: 0.015,
        initialFieldT: 0.1,
        finalFieldT: 0.5,
        initialAngleDegrees: 60,
        finalAngleDegrees: 60,
        angleReference: "plane",
        timeIntervalS: 0.4, // 5x slower time interval
        coilResistanceOhm: 4,
      });
      if (
        fromNormal.kind !== "flux-faraday" ||
        fromPlane.kind !== "flux-faraday"
      ) {
        throw new Error("Wrong kind");
      }
      expect(fromNormal.initialFluxWb).toBeCloseTo(fromPlane.initialFluxWb, 12);
      expect(fromNormal.signedAverageEmfV).toBeLessThan(0);
      expect(fromNormal.lenzOppositionSummary).toContain("increase");
      // Induced charge ΔQ = |Δ(NΦ)| / R is strictly independent of Δt
      expect(fromNormal.inducedChargeC).toBeCloseTo(
        fromPlane.inducedChargeC!,
        12,
      );
    });

    it("enforces Lorentz polarity, Lenz current sense, braking force, and power balance for motional EMF on rails", () => {
      expect(motionalEmf(0.4, 5, 0.25)).toBeCloseTo(0.5, 12);

      const cases = [
        {
          rodDirection: "right" as const,
          fieldDirection: "into-page" as const,
          expectedEnd: "top",
          expectedCurrent: "counterclockwise",
          expectedForce: "left",
        },
        {
          rodDirection: "right" as const,
          fieldDirection: "out-of-page" as const,
          expectedEnd: "bottom",
          expectedCurrent: "clockwise",
          expectedForce: "left",
        },
        {
          rodDirection: "left" as const,
          fieldDirection: "into-page" as const,
          expectedEnd: "bottom",
          expectedCurrent: "clockwise",
          expectedForce: "right",
        },
        {
          rodDirection: "left" as const,
          fieldDirection: "out-of-page" as const,
          expectedEnd: "top",
          expectedCurrent: "counterclockwise",
          expectedForce: "right",
        },
      ];

      for (const c of cases) {
        const sol = solveEmInductionScenario({
          kind: "motional-emf-rails",
          magneticFieldT: 0.6,
          fieldDirection: c.fieldDirection,
          railSeparationM: 0.2,
          rodSpeedMs: 4,
          rodDirection: c.rodDirection,
          loadResistanceOhm: 1.5,
          rodResistanceOhm: 0.5,
        });
        if (sol.kind !== "motional-emf-rails") throw new Error("Wrong kind");
        expect(sol.higherPotentialEnd).toBe(c.expectedEnd);
        expect(sol.inducedCurrentDirection).toBe(c.expectedCurrent);
        expect(sol.magneticForceDirection).toBe(c.expectedForce);
        expect(sol.motionalEmfV).toBeCloseTo(0.48, 12);
        expect(sol.inducedCurrentA).toBeCloseTo(0.24, 12);
        expect(sol.terminalVoltageV).toBeCloseTo(0.36, 12);
        expect(sol.magneticBrakingForceN).toBeCloseTo(0.0288, 12);
        expect(sol.mechanicalPowerW).toBeCloseTo(sol.electricalPowerW, 15);
      }
    });

    it("computes rotating-coil AC generator peak/RMS/mean-power relations and quadrature phase", () => {
      const sol = solveEmInductionScenario({
        kind: "ac-generator",
        turns: 100,
        coilAreaM2: 0.02,
        magneticFieldT: 0.25,
        frequencyHz: 50,
        loadResistanceOhm: 20,
      });
      if (sol.kind !== "ac-generator") throw new Error("Wrong kind");

      const omega = 100 * Math.PI;
      const v0 = 100 * 0.25 * 0.02 * omega; // 50 * pi
      expect(sol.angularSpeedRadS).toBeCloseTo(omega, 12);
      expect(sol.peakEmfV).toBeCloseTo(v0, 10);
      expect(sol.rmsVoltageV).toBeCloseTo(rmsFromPeak(v0), 12);
      expect(sol.rmsCurrentA).toBeCloseTo(sol.peakCurrentA! / Math.SQRT2, 12);
      expect(sol.meanPowerW).toBeCloseTo(0.5 * sol.peakPowerW!, 12);
      expect(sol.meanPowerW).toBeCloseTo(
        sol.rmsVoltageV * sol.rmsCurrentA!,
        12,
      );

      // At t = 0: flux linkage is max, EMF is 0; at t = T/4 (default query): flux is 0, EMF is peak
      expect(sol.curves.emf[0].y).toBeCloseTo(0, 12);
      expect(sol.curves.fluxLinkage[0].y).toBeCloseTo(
        sol.peakFluxLinkageWbTurns,
        12,
      );
      expect(sol.fluxAtQueryWb).toBeCloseTo(0, 12);
      expect(sol.emfAtQueryV).toBeCloseTo(sol.peakEmfV, 12);
    });

    it("solves ideal and non-ideal step-up/step-down transformers accurately", () => {
      const ideal = solveEmInductionScenario({
        kind: "transformer",
        primaryVoltageRmsV: 240,
        primaryTurns: 1200,
        secondaryTurns: 60,
        efficiency: 1,
        loadResistanceOhm: 6,
      });
      if (ideal.kind !== "transformer") throw new Error("Wrong kind");
      expect(ideal.classification).toBe("step-down");
      expect(ideal.secondaryVoltageRmsV).toBeCloseTo(12, 12);
      expect(ideal.secondaryCurrentRmsA).toBeCloseTo(2, 12);
      expect(ideal.primaryCurrentRmsA).toBeCloseTo(0.1, 12);
      expect(ideal.inputPowerW).toBeCloseTo(24, 12);
      expect(ideal.powerLossW).toBe(0);

      const real = solveEmInductionScenario({
        kind: "transformer",
        primaryVoltageRmsV: 200,
        primaryTurns: 100,
        secondaryTurns: 500,
        efficiency: 0.8,
        secondaryCurrentRmsA: 0.4,
      });
      if (real.kind !== "transformer") throw new Error("Wrong kind");
      expect(real.classification).toBe("step-up");
      expect(real.secondaryVoltageRmsV).toBeCloseTo(1000, 12);
      expect(real.outputPowerW).toBeCloseTo(400, 12);
      expect(real.inputPowerW).toBeCloseTo(500, 12);
      expect(real.powerLossW).toBeCloseTo(100, 12);
      expect(real.primaryCurrentRmsA).toBeCloseTo(2.5, 12);
    });
  });

  describe("Charged particles in uniform E and B fields", () => {
    it("solves parabolic electric deflection and verifies work-energy theorem and plate-hit boundary", () => {
      const electronSpec = {
        kind: "electric-deflection" as const,
        chargeC: -ELEMENTARY_CHARGE_C,
        massKg: ELECTRON_MASS_KG,
        initialSpeedMs: 2.5e7,
        plateLengthM: 0.06,
        plateSeparationM: 0.04,
        plateVoltageV: 160,
        topPlatePolarity: "positive" as const,
        driftDistanceAfterPlatesM: 0.15,
      };
      const sol = solveEmInductionScenario(electronSpec);
      if (sol.kind !== "electric-deflection") throw new Error("Wrong kind");
      expect(sol.hitsPlate).toBe(false);
      // Electron (-q) attracted UP toward positive top plate
      expect(sol.deflectionDirection).toBe("up");
      expect(sol.exitYM).toBeGreaterThan(0);
      expect(sol.screenYM).toBeGreaterThan(sol.exitYM);
      // Electric work |q E_y Δy| equals transverse kinetic energy gain 1/2 m v_y^2
      expect(
        Math.abs(sol.electricForceYN * sol.plateDeflectionYM),
      ).toBeCloseTo(sol.kineticEnergyGainJ, 22);

      // Extreme voltage causes plate collision before x = L
      const hitSol = solveEmInductionScenario({
        ...electronSpec,
        plateVoltageV: 5000,
      });
      if (hitSol.kind !== "electric-deflection") throw new Error("Wrong kind");
      expect(hitSol.hitsPlate).toBe(true);
      expect(hitSol.exitXM).toBeLessThan(electronSpec.plateLengthM);
      expect(hitSol.exitYM).toBeCloseTo(electronSpec.plateSeparationM / 2, 12);
    });

    it("verifies Lorentz right-hand rule signs in ⊗ and ⊙ B-fields and matches SVG curve coordinates", () => {
      // Check speed independence of cyclotron period
      const r1 = cyclotronRadius(PROTON_MASS_KG, 2e6, ELEMENTARY_CHARGE_C, 0.5);
      const r2 = cyclotronRadius(PROTON_MASS_KG, 4e6, ELEMENTARY_CHARGE_C, 0.5);
      expect(r2).toBeCloseTo(2 * r1, 12);
      expect(
        cyclotronPeriod(PROTON_MASS_KG, ELEMENTARY_CHARGE_C, 0.5),
      ).toBeCloseTo((2 * Math.PI * r1) / 2e6, 16);

      const matrix = [
        {
          chargeC: ELEMENTARY_CHARGE_C,
          fieldDirection: "into-page" as const,
          expectedDeflection: "up",
          expectedSense: "counterclockwise",
          expectedSymbol: "cross",
        },
        {
          chargeC: -ELEMENTARY_CHARGE_C,
          fieldDirection: "into-page" as const,
          expectedDeflection: "down",
          expectedSense: "clockwise",
          expectedSymbol: "cross",
        },
        {
          chargeC: ELEMENTARY_CHARGE_C,
          fieldDirection: "out-of-page" as const,
          expectedDeflection: "down",
          expectedSense: "clockwise",
          expectedSymbol: "dot",
        },
        {
          chargeC: -ELEMENTARY_CHARGE_C,
          fieldDirection: "out-of-page" as const,
          expectedDeflection: "up",
          expectedSense: "counterclockwise",
          expectedSymbol: "dot",
        },
      ];

      for (const item of matrix) {
        const force = lorentzMagneticForce2D(
          item.chargeC,
          { x: 1e6, y: 0 },
          0.2,
          item.fieldDirection,
        );
        expect(force.x).toBe(0);
        if (item.expectedDeflection === "up") {
          expect(force.y).toBeGreaterThan(0);
        } else {
          expect(force.y).toBeLessThan(0);
        }

        const spec = {
          kind: "magnetic-cyclotron" as const,
          chargeC: item.chargeC,
          massKg: PROTON_MASS_KG,
          magneticFieldT: 0.2,
          fieldDirection: item.fieldDirection,
          speedMs: 2.0e6,
          arcSweepDegrees: 180,
        };
        const sol = solveEmInductionScenario(spec);
        if (sol.kind !== "magnetic-cyclotron") throw new Error("Wrong kind");
        expect(sol.initialDeflectionDirection).toBe(item.expectedDeflection);
        expect(sol.rotationSense).toBe(item.expectedSense);
        expect(sol.magneticWorkDoneJ).toBe(0);

        const svg = renderEmInductionSvg(spec);
        expect(svg).toContain(`data-field-symbol="${item.expectedSymbol}"`);
        const arcMatch = svg.match(
          /<path data-trajectory="magnetic-arc" d="([^"]+)"/,
        );
        expect(arcMatch).not.toBeNull();
        const pts = parseSvgPathPoints(arcMatch![1]);
        const entrySvgY = pts[0].y;
        const apexSvgY = pts[Math.floor(pts.length / 2)].y;
        if (item.expectedDeflection === "up") {
          // Smaller SVG y is nearer the top of the diagram
          expect(apexSvgY).toBeLessThan(entrySvgY);
        } else {
          expect(apexSvgY).toBeGreaterThan(entrySvgY);
        }
      }
    });

    it("solves crossed-field velocity selector and Bainbridge isotope spectrometer", () => {
      const baseSelector = {
        kind: "velocity-selector" as const,
        chargeC: ELEMENTARY_CHARGE_C,
        massKg: PROTON_MASS_KG,
        electricFieldVm: 3.0e4,
        magneticFieldT: 0.15,
        fieldDirection: "into-page" as const,
        topPlatePolarity: "positive" as const,
      };
      // v_sel = 3e4 / 0.15 = 2.0e5 m/s
      const exactPos = solveEmInductionScenario(baseSelector);
      const exactNeg = solveEmInductionScenario({
        ...baseSelector,
        chargeC: -ELEMENTARY_CHARGE_C,
        massKg: ELECTRON_MASS_KG,
      });
      if (
        exactPos.kind !== "velocity-selector" ||
        exactNeg.kind !== "velocity-selector"
      ) {
        throw new Error("Wrong kind");
      }
      expect(exactPos.selectedSpeedMs).toBeCloseTo(2.0e5, 10);
      expect(exactPos.outcome).toBe("undeflected");
      expect(exactNeg.outcome).toBe("undeflected");

      // Faster positive ion in into-page B + positive top plate -> magnetic upward force wins
      const fastPos = solveEmInductionScenario({
        ...baseSelector,
        particleSpeedMs: 2.5e5,
      });
      const slowPos = solveEmInductionScenario({
        ...baseSelector,
        particleSpeedMs: 1.5e5,
      });
      if (
        fastPos.kind !== "velocity-selector" ||
        slowPos.kind !== "velocity-selector"
      ) {
        throw new Error("Wrong kind");
      }
      expect(fastPos.outcome).toBe("deflected-up");
      expect(slowPos.outcome).toBe("deflected-down");

      // Bainbridge spectrometer with Ne-20 and Ne-22 singly charged ions
      const bainbridge = solveEmInductionScenario({
        kind: "bainbridge-mass-spectrometer",
        chargeC: ELEMENTARY_CHARGE_C,
        massKg: 20 * ATOMIC_MASS_UNIT_KG,
        comparisonMassKg: 22 * ATOMIC_MASS_UNIT_KG,
        selectorElectricFieldVm: 6.0e4,
        selectorMagneticFieldT: 0.3,
        deflectionMagneticFieldT: 0.5,
        deflectionFieldDirection: "into-page",
      });
      if (bainbridge.kind !== "bainbridge-mass-spectrometer")
        throw new Error("Wrong kind");
      expect(bainbridge.selectedSpeedMs).toBeCloseTo(2.0e5, 10);
      expect(bainbridge.massRatio).toBeCloseTo(1.1, 12);
      const expectedDeltaD =
        (2 * 2 * ATOMIC_MASS_UNIT_KG * 6.0e4) /
        (ELEMENTARY_CHARGE_C * 0.3 * 0.5);
      expect(bainbridge.strikeSeparationM).toBeCloseTo(expectedDeltaD, 12);
    });
  });

  describe("Validation error paths", () => {
    it("rejects physically invalid parameters and inconsistent configurations", () => {
      expect(
        validateEmInductionScenario({
          kind: "parallel-plate-capacitor",
          plateAreaM2: -0.01,
          plateSeparationM: 0,
          relativePermittivity: 0.5,
          voltageV: 12,
        }).valid,
      ).toBe(false);

      expect(
        validateEmInductionScenario({
          kind: "transformer",
          primaryVoltageRmsV: 230,
          primaryTurns: 1000,
          secondaryTurns: 100,
          efficiency: 1.05,
        }).valid,
      ).toBe(false);

      expect(
        validateEmInductionScenario({
          kind: "ac-generator",
          turns: 100,
          coilAreaM2: 0.01,
          magneticFieldT: 0.2,
          frequencyHz: 50,
          angularSpeedRadS: 50, // should be 100*pi
        }).valid,
      ).toBe(false);

      // Reinforcing electric and magnetic forces cannot form a velocity selector
      const nonOpposing = validateEmInductionScenario({
        kind: "velocity-selector",
        chargeC: ELEMENTARY_CHARGE_C,
        massKg: PROTON_MASS_KG,
        electricFieldVm: 2e4,
        magneticFieldT: 0.1,
        fieldDirection: "into-page",
        topPlatePolarity: "negative",
      });
      expect(nonOpposing.valid).toBe(false);
      expect(nonOpposing.issues[0].code).toBe("NON_OPPOSING_SELECTOR_FIELDS");

      // Contradictory visibility policy
      const conflict = validateEmInductionScenario({
        kind: "motional-emf-rails",
        magneticFieldT: 0.5,
        fieldDirection: "into-page",
        railSeparationM: 0.2,
        rodSpeedMs: 3,
        loadResistanceOhm: 2,
        hiddenQuantities: ["rodSpeedMs"],
        visibleQuantities: ["rodSpeedMs"],
      });
      expect(conflict.valid).toBe(false);
      expect(conflict.issues[0].code).toBe("CONFLICTING_VISIBILITY_QUANTITY");

      // Invalid SVG dimensions throw cleanly
      expect(() =>
        renderEmInductionSvg(
          {
            kind: "motional-emf-rails",
            magneticFieldT: 0.5,
            fieldDirection: "into-page",
            railSeparationM: 0.2,
            rodSpeedMs: 3,
            loadResistanceOhm: 2,
          },
          { width: 120, height: 100 },
        ),
      ).toThrow(/Invalid SVG dimensions/);
    });
  });

  describe("Zero answer leakage invariant across all 11 scenario kinds", () => {
    it("never leaks hidden input or target values in SVG text, aria-label, title, or data attributes", () => {
      const leakageCases = [
        {
          spec: {
            kind: "parallel-plate-capacitor" as const,
            plateAreaM2: 0.037,
            plateSeparationM: 0.0029,
            voltageV: 137,
            hiddenQuantities: ["voltageV", "capacitanceF"],
            showDerivedLabels: true,
          },
          forbiddenTokens: ["137", formatSiQuantity(137, "V")],
        },
        {
          spec: {
            kind: "capacitor-network" as const,
            topology: {
              arrangement: "series" as const,
              capacitancesF: [33e-6, 66e-6],
              supplyVoltageV: 27,
            },
            hiddenQuantities: ["c2F", "equivalentCapacitanceF"],
            showDerivedLabels: true,
          },
          forbiddenTokens: ["66.0 μF", "22.0 μF"],
        },
        {
          spec: {
            kind: "rc-transient" as const,
            mode: "charging" as const,
            resistanceOhm: 3700,
            capacitanceF: 47e-6,
            supplyVoltageV: 19,
            hiddenQuantities: ["timeConstantS", "supplyVoltageV", "capacitanceF"],
            showDerivedLabels: true,
          },
          forbiddenTokens: ["19.0 V", "19", "47.0 μF", "0.174", "174 ms"],
        },
        {
          spec: {
            kind: "flux-faraday" as const,
            turns: 317,
            coilAreaM2: 0.023,
            initialFieldT: 0.13,
            finalFieldT: 0.59,
            timeIntervalS: 0.073,
            hiddenQuantities: ["turns", "averageEmfMagnitudeV"],
            showDerivedLabels: true,
          },
          forbiddenTokens: ["317", "45.9 V"],
        },
        {
          spec: {
            kind: "motional-emf-rails" as const,
            magneticFieldT: 0.43,
            fieldDirection: "into-page" as const,
            railSeparationM: 0.29,
            rodSpeedMs: 3.7,
            loadResistanceOhm: 1.9,
            hiddenQuantities: ["rodSpeedMs", "magneticBrakingForceN"],
            showDerivedLabels: true,
          },
          forbiddenTokens: ["3.7", "30.2 mN", "0.0302"],
        },
        {
          spec: {
            kind: "ac-generator" as const,
            turns: 185,
            coilAreaM2: 0.017,
            magneticFieldT: 0.31,
            frequencyHz: 63,
            hiddenQuantities: ["peakEmfV", "rmsVoltageV", "frequencyHz"],
            showDerivedLabels: true,
          },
          forbiddenTokens: ["63", "386 V", "273 V"],
        },
        {
          spec: {
            kind: "transformer" as const,
            primaryVoltageRmsV: 237,
            primaryTurns: 1420,
            secondaryTurns: 355,
            efficiency: 0.89,
            loadResistanceOhm: 17,
            hiddenQuantities: ["secondaryVoltageRmsV", "efficiency"],
            showDerivedLabels: true,
          },
          forbiddenTokens: ["59.3 V", "59.25", "89%"],
        },
        {
          spec: {
            kind: "electric-deflection" as const,
            chargeC: -ELEMENTARY_CHARGE_C,
            massKg: ELECTRON_MASS_KG,
            initialSpeedMs: 2.37e7,
            plateLengthM: 0.071,
            plateSeparationM: 0.039,
            plateVoltageV: 143,
            hiddenQuantities: ["plateVoltageV", "plateDeflectionYM"],
            showDerivedLabels: true,
          },
          forbiddenTokens: ["143"],
        },
        {
          spec: {
            kind: "magnetic-cyclotron" as const,
            chargeC: ELEMENTARY_CHARGE_C,
            massKg: PROTON_MASS_KG,
            magneticFieldT: 0.37,
            fieldDirection: "out-of-page" as const,
            speedMs: 1.93e6,
            hiddenQuantities: ["cyclotronRadiusM", "magneticFieldT"],
            showDerivedLabels: true,
          },
          forbiddenTokens: ["370 mT", "0.37", "0.0545", "54.5 mm"],
        },
        {
          spec: {
            kind: "velocity-selector" as const,
            chargeC: ELEMENTARY_CHARGE_C,
            massKg: PROTON_MASS_KG,
            electricFieldVm: 3.7e4,
            magneticFieldT: 0.19,
            fieldDirection: "into-page" as const,
            topPlatePolarity: "positive" as const,
            hiddenQuantities: ["selectedSpeedMs", "magneticFieldT"],
            showDerivedLabels: true,
          },
          forbiddenTokens: ["190 mT", "0.19", "1.95 × 10⁵"],
        },
        {
          spec: {
            kind: "bainbridge-mass-spectrometer" as const,
            chargeC: ELEMENTARY_CHARGE_C,
            massKg: 20 * ATOMIC_MASS_UNIT_KG,
            comparisonMassKg: 22 * ATOMIC_MASS_UNIT_KG,
            selectorElectricFieldVm: 5.3e4,
            selectorMagneticFieldT: 0.27,
            deflectionMagneticFieldT: 0.41,
            hiddenQuantities: ["primaryRadiusM", "primaryDiameterM", "deflectionMagneticFieldT"],
            showDerivedLabels: true,
          },
          forbiddenTokens: ["410 mT", "0.41", "0.159", "0.318"],
        },
      ];

      for (const item of leakageCases) {
        const svg = renderEmInductionSvg(item.spec);
        expect(svg).toContain("<svg");
        expect(svg).not.toMatch(/NaN|Infinity|undefined/);
        const extracted = extractVisibleTextAndMetadata(svg);
        for (const token of item.forbiddenTokens) {
          expect(extracted).not.toContain(token);
        }
      }
    });

    it("cleanly merges spec.hiddenQuantities and options.hiddenQuantities in renderEmInductionSvg", () => {
      const spec: EmInductionScenarioSpec = {
        kind: "flux-faraday",
        turns: 317,
        coilAreaM2: 0.023,
        initialFieldT: 0.13,
        finalFieldT: 0.59,
        timeIntervalS: 0.073,
        hiddenQuantities: ["turns"],
        showDerivedLabels: true,
      };
      const mergedSvg = renderEmInductionSvg(spec, {
        hiddenQuantities: ["averageEmfMagnitudeV", "initialFieldT"],
      });
      assertWellFormedSvgXml(mergedSvg);
      const text = extractVisibleTextAndMetadata(mergedSvg);
      // Hidden via spec.hiddenQuantities
      expect(text).not.toContain("317");
      // Hidden via options.hiddenQuantities
      expect(text).not.toContain("45.9 V");
      expect(text).not.toContain("130 mT");
      expect(text).not.toContain("0.13");
      // Unhidden inputs remain visible
      expect(text).toContain("590 mT");

      // Also works when spec.hiddenQuantities is undefined and called via renderSolvedEmInductionSvg
      const plainCap: EmInductionScenarioSpec = {
        kind: "parallel-plate-capacitor",
        plateAreaM2: 0.041,
        plateSeparationM: 0.0027,
        voltageV: 163,
      };
      const capSol = solveEmInductionScenario(plainCap);
      const solvedSvg = renderSolvedEmInductionSvg(plainCap, capSol, {
        hiddenQuantities: ["voltageV"],
      });
      expect(extractVisibleTextAndMetadata(solvedSvg)).not.toContain("163");

      expect(() =>
        renderEmInductionSvg(plainCap, { hiddenQuantities: ["   "] }),
      ).toThrow(/hiddenQuantities/);
    });

    it("prevents all derived-axis, alias, afterChange, and coincident companion leaks", () => {
      // 1. ac-generator: derived peakEmfV and periodS must stay symbolic when showDerivedLabels is false
      for (const hiddenKey of ["meanPowerW", "rmsCurrentA"] as const) {
        const acSpec: EmInductionScenarioSpec = {
          kind: "ac-generator",
          turns: 150,
          coilAreaM2: 0.015,
          magneticFieldT: 0.43,
          frequencyHz: 50,
          loadResistanceOhm: 25,
          showDerivedLabels: false,
          hiddenQuantities: [hiddenKey],
        };
        const acSol = solveEmInductionScenario(acSpec);
        if (acSol.kind !== "ac-generator") throw new Error("Wrong kind");
        const acText = extractVisibleTextAndMetadata(renderEmInductionSvg(acSpec));
        expect(acText).not.toContain(formatSiQuantity(acSol.peakEmfV, "V"));
        expect(acText).not.toContain(formatSiQuantity(acSol.peakEmfV, ""));
        expect(acText).not.toContain("0.02");
      }

      // 2. rc-transient: derived X-axis ticks, current/charge Y-axis ticks, and t=0 circuit V0
      const rcDerivedOff: EmInductionScenarioSpec = {
        kind: "rc-transient",
        mode: "charging",
        resistanceOhm: 4000,
        capacitanceF: 50e-6,
        supplyVoltageV: 12,
        plottedQuantity: "current",
        showDerivedLabels: false,
      };
      const rcOffText = extractVisibleTextAndMetadata(
        renderEmInductionSvg(rcDerivedOff),
      );
      // tau = 0.2 s and I0 = 3.00 mA are derived and must not appear when showDerivedLabels is false
      expect(rcOffText).not.toContain("0.2");
      expect(rcOffText).not.toContain("3.00 mA");

      for (const hiddenInput of ["resistanceOhm", "capacitanceF"] as const) {
        const rcHiddenRC: EmInductionScenarioSpec = {
          kind: "rc-transient",
          mode: "charging",
          resistanceOhm: 4000,
          capacitanceF: 50e-6,
          supplyVoltageV: 12,
          plottedQuantity: "charge",
          showDerivedLabels: true,
          hiddenQuantities: [hiddenInput],
        };
        const txt = extractVisibleTextAndMetadata(renderEmInductionSvg(rcHiddenRC));
        // tau = 0.2 s must not leak on X-axis when R or C is hidden
        expect(txt).not.toContain("0.2");
        if (hiddenInput === "capacitanceF") {
          // maxChargeC = C * V0 = 600 uC must not leak on Y-axis when C is hidden
          expect(txt).not.toContain("600 μC");
        }
      }

      const rcDischargeZero: EmInductionScenarioSpec = {
        kind: "rc-transient",
        mode: "discharging",
        resistanceOhm: 5000,
        capacitanceF: 47e-6,
        supplyVoltageV: 17,
        queryTimeS: 0,
        showDerivedLabels: true,
        hiddenQuantities: ["capacitorVoltageAtQueryV"],
      };
      expect(
        extractVisibleTextAndMetadata(renderEmInductionSvg(rcDischargeZero)),
      ).not.toContain("17");

      const rcChargeZero: EmInductionScenarioSpec = {
        kind: "rc-transient",
        mode: "charging",
        resistanceOhm: 5000,
        capacitanceF: 47e-6,
        supplyVoltageV: 17,
        queryTimeS: 0,
        showDerivedLabels: true,
        hiddenQuantities: ["resistorVoltageAtQueryV"],
      };
      expect(
        extractVisibleTextAndMetadata(renderEmInductionSvg(rcChargeZero)),
      ).not.toContain("17");

      // 3. capacitor-network: Cs_capacitanceF alias & parallel branch voltage v1V/v2V === supplyVoltageV
      const spHiddenCs: EmInductionScenarioSpec = {
        kind: "capacitor-network",
        topology: {
          arrangement: "series-parallel",
          seriesCapacitanceF: 43e-6,
          parallelCapacitancesF: [20e-6, 30e-6],
          supplyVoltageV: 18,
        },
        hiddenQuantities: ["Cs_capacitanceF"],
      };
      expect(
        extractVisibleTextAndMetadata(renderEmInductionSvg(spHiddenCs)),
      ).not.toContain("43.0 μF");

      for (const hiddenBranchV of ["v1V", "v2V"] as const) {
        const parallelNet: EmInductionScenarioSpec = {
          kind: "capacitor-network",
          topology: {
            arrangement: "parallel",
            capacitancesF: [15e-6, 35e-6],
            supplyVoltageV: 29,
          },
          hiddenQuantities: [hiddenBranchV],
        };
        expect(
          extractVisibleTextAndMetadata(renderEmInductionSvg(parallelNet)),
        ).not.toContain("29");
      }

      // 4. parallel-plate-capacitor afterChange: constant-voltage afterVoltageV, unchanged d, unchanged er
      const constVolt: EmInductionScenarioSpec = {
        kind: "parallel-plate-capacitor",
        plateAreaM2: 0.04,
        plateSeparationM: 0.002,
        relativePermittivity: 2.3,
        voltageV: 137,
        afterChange: { constraint: "constant-voltage", newSeparationM: 0.004 },
        hiddenQuantities: ["afterVoltageV"],
      };
      const constVoltText = extractVisibleTextAndMetadata(
        renderEmInductionSvg(constVolt),
      );
      expect(constVoltText).not.toContain("137");
      expect(
        extractVisibleTextAndMetadata(
          renderEmInductionSvg({
            ...constVolt,
            hiddenQuantities: ["afterRelativePermittivity"],
          }),
        ),
      ).not.toContain("2.30");

      const unchangedSep: EmInductionScenarioSpec = {
        kind: "parallel-plate-capacitor",
        plateAreaM2: 0.04,
        plateSeparationM: 0.0031,
        relativePermittivity: 1,
        voltageV: 95,
        afterChange: {
          constraint: "isolated-charge",
          newRelativePermittivity: 3.5,
        },
        hiddenQuantities: ["afterSeparationM"],
      };
      expect(
        extractVisibleTextAndMetadata(renderEmInductionSvg(unchangedSep)),
      ).not.toContain("0.0031");

      // 5. Transitive alias expansion & coincident companions
      expect(expandQuantityKeys("primaryDiameterM", ["primaryRadiusM"])).toContain(
        "r_1",
      );
      const bainbridgeAliasAndEqualB: EmInductionScenarioSpec = {
        kind: "bainbridge-mass-spectrometer",
        chargeC: ELEMENTARY_CHARGE_C,
        massKg: 20 * ATOMIC_MASS_UNIT_KG,
        selectorElectricFieldVm: 6.0e4,
        selectorMagneticFieldT: 0.33,
        deflectionMagneticFieldT: 0.33,
        showDerivedLabels: true,
        hiddenQuantities: ["r_1"],
      };
      const bainSol = solveEmInductionScenario(bainbridgeAliasAndEqualB);
      if (bainSol.kind !== "bainbridge-mass-spectrometer")
        throw new Error("Wrong kind");
      expect(
        extractVisibleTextAndMetadata(
          renderEmInductionSvg(bainbridgeAliasAndEqualB),
        ),
      ).not.toContain(formatSiQuantity(bainSol.primaryDiameterM, "m"));

      for (const bKey of [
        "selectorMagneticFieldT",
        "deflectionMagneticFieldT",
      ] as const) {
        const txt = extractVisibleTextAndMetadata(
          renderEmInductionSvg({
            ...bainbridgeAliasAndEqualB,
            hiddenQuantities: [bKey],
          }),
        );
        expect(txt).not.toContain("330 mT");
        expect(txt).not.toContain("0.33");
      }

      // Velocity selector undeflected: particleSpeedMs === selectedSpeedMs
      const undeflectedSel: EmInductionScenarioSpec = {
        kind: "velocity-selector",
        chargeC: ELEMENTARY_CHARGE_C,
        massKg: PROTON_MASS_KG,
        electricFieldVm: 3.9e4,
        magneticFieldT: 0.13,
        fieldDirection: "into-page",
        topPlatePolarity: "positive",
        showDerivedLabels: true,
        hiddenQuantities: ["particleSpeedMs"],
      };
      expect(
        extractVisibleTextAndMetadata(renderEmInductionSvg(undeflectedSel)),
      ).not.toContain("3.00 × 10⁵");

      // Isolation transformer: primaryTurns === secondaryTurns & Vp === Vs
      for (const tKey of [
        "primaryTurns",
        "secondaryTurns",
        "primaryVoltageRmsV",
        "secondaryVoltageRmsV",
      ] as const) {
        const isoSpec: EmInductionScenarioSpec = {
          kind: "transformer",
          primaryVoltageRmsV: 233,
          primaryTurns: 470,
          secondaryTurns: 470,
          showDerivedLabels: true,
          hiddenQuantities: [tKey],
        };
        const isoText = extractVisibleTextAndMetadata(
          renderEmInductionSvg(isoSpec),
        );
        if (tKey.includes("Turns")) {
          expect(isoText).not.toContain("470");
        } else {
          expect(isoText).not.toContain("233");
        }
      }

      // Flux-faraday: finalAngleDegrees === initialAngleDegrees and B2 === -B1
      const faradayEqualAngle: EmInductionScenarioSpec = {
        kind: "flux-faraday",
        turns: 120,
        coilAreaM2: 0.02,
        initialFieldT: 0.27,
        finalFieldT: -0.27,
        initialAngleDegrees: 37,
        finalAngleDegrees: 37,
        timeIntervalS: 0.05,
        hiddenQuantities: ["finalAngleDegrees", "finalFieldT"],
      };
      const faradayTxt = extractVisibleTextAndMetadata(
        renderEmInductionSvg(faradayEqualAngle),
      );
      expect(faradayTxt).not.toContain("37");
      expect(faradayTxt).not.toContain("270 mT");

      // Motional EMF rails: rodResistanceOhm === 0 => totalResistanceOhm === loadResistanceOhm
      const railsZeroInternal: EmInductionScenarioSpec = {
        kind: "motional-emf-rails",
        magneticFieldT: 0.45,
        fieldDirection: "into-page",
        railSeparationM: 0.22,
        rodSpeedMs: 3.4,
        loadResistanceOhm: 2.7,
        rodResistanceOhm: 0,
        hiddenQuantities: ["totalResistanceOhm"],
      };
      expect(
        extractVisibleTextAndMetadata(renderEmInductionSvg(railsZeroInternal)),
      ).not.toContain("2.70");

      // Electric deflection: non-colliding exitXM === plateLengthM, tiny-deflection vExit ~= v0, and generator separation
      const nonCollidingDefl: EmInductionScenarioSpec = {
        kind: "electric-deflection",
        chargeC: -ELEMENTARY_CHARGE_C,
        massKg: ELECTRON_MASS_KG,
        initialSpeedMs: 2.3e7,
        plateLengthM: 0.067,
        plateSeparationM: 0.045,
        plateVoltageV: 8,
        hiddenQuantities: ["exitXM", "exitSpeedMs"],
      };
      const deflTxt = extractVisibleTextAndMetadata(
        renderEmInductionSvg(nonCollidingDefl),
      );
      expect(deflTxt).not.toContain("0.067");
      expect(deflTxt).not.toContain("2.30 × 10⁷");

      for (let seed = 1; seed <= 30; seed += 1) {
        const genDefl = generateElectricDeflectionScenario(`defl-seed-${seed}`);
        const genSol = solveEmInductionScenario(genDefl);
        if (genSol.kind !== "electric-deflection") throw new Error("Wrong kind");
        expect(genSol.hitsPlate).toBe(false);
        expect(formatSiQuantity(genSol.exitSpeedMs, "m s⁻¹")).not.toBe(
          formatSiQuantity(genDefl.initialSpeedMs, "m s⁻¹"),
        );
      }
    });

    it("passes exhaustive per-quantity and coincident-value zero-leakage fuzz test across all 11 scenarios", () => {
      const fuzzFixtures: EmInductionScenarioSpec[] = [
        ...generateEmInductionScenarioBatch("fuzz-alpha", 33),
        ...generateEmInductionScenarioBatch("fuzz-beta", 22),
        // Adversarial coincident & boundary scenarios across all 11 kinds
        {
          kind: "parallel-plate-capacitor",
          plateAreaM2: 0.036,
          plateSeparationM: 0.0024,
          relativePermittivity: 2.6,
          voltageV: 137,
          afterChange: { constraint: "constant-voltage", newSeparationM: 0.0048 },
        },
        {
          kind: "parallel-plate-capacitor",
          plateAreaM2: 0.036,
          plateSeparationM: 0.0024,
          relativePermittivity: 2.6,
          voltageV: 137,
          afterChange: {
            constraint: "isolated-charge",
            newRelativePermittivity: 5.2,
          },
        },
        {
          kind: "capacitor-network",
          topology: {
            arrangement: "parallel",
            capacitancesF: [25e-6, 25e-6],
            supplyVoltageV: 23,
          },
        },
        {
          kind: "capacitor-network",
          topology: {
            arrangement: "series-parallel",
            seriesCapacitanceF: 40e-6,
            parallelCapacitancesF: [20e-6, 20e-6],
            supplyVoltageV: 18,
          },
        },
        {
          kind: "capacitor-network",
          topology: {
            arrangement: "charge-sharing",
            c1F: 30e-6,
            c2F: 30e-6,
            v1InitialV: 24,
            v2InitialV: 24,
            polarity: "same",
          },
        },
        {
          kind: "rc-transient",
          mode: "discharging",
          resistanceOhm: 3500,
          capacitanceF: 40e-6,
          supplyVoltageV: 16,
          queryTimeS: 0,
          plottedQuantity: "current",
        },
        {
          kind: "rc-transient",
          mode: "charging",
          resistanceOhm: 3500,
          capacitanceF: 40e-6,
          supplyVoltageV: 16,
          queryTimeS: rcHalfTime(3500, 40e-6),
          plottedQuantity: "charge",
        },
        {
          kind: "flux-faraday",
          turns: 160,
          coilAreaM2: 0.018,
          initialFieldT: 0.24,
          finalFieldT: -0.24,
          initialAngleDegrees: 42,
          finalAngleDegrees: 42,
          timeIntervalS: 0.06,
          coilResistanceOhm: 4,
        },
        {
          kind: "motional-emf-rails",
          magneticFieldT: 0.38,
          fieldDirection: "out-of-page",
          railSeparationM: 0.26,
          rodSpeedMs: 1,
          loadResistanceOhm: 2.3,
          rodResistanceOhm: 0,
        },
        {
          kind: "transformer",
          primaryVoltageRmsV: 215,
          primaryTurns: 360,
          secondaryTurns: 360,
          efficiency: 0.89,
          secondaryCurrentRmsA: 1.4,
        },
        {
          kind: "electric-deflection",
          chargeC: -ELEMENTARY_CHARGE_C,
          massKg: ELECTRON_MASS_KG,
          initialSpeedMs: 2.4e7,
          plateLengthM: 0.062,
          plateSeparationM: 0.044,
          plateVoltageV: 12,
        },
        {
          kind: "magnetic-cyclotron",
          chargeC: ELEMENTARY_CHARGE_C,
          massKg: PROTON_MASS_KG,
          magneticFieldT: 0.29,
          fieldDirection: "into-page",
          acceleratingVoltageV: 1650,
        },
        {
          kind: "velocity-selector",
          chargeC: ELEMENTARY_CHARGE_C,
          massKg: PROTON_MASS_KG,
          electricFieldVm: 4.2e4,
          magneticFieldT: 0.14,
          fieldDirection: "into-page",
          topPlatePolarity: "positive",
        },
        {
          kind: "bainbridge-mass-spectrometer",
          chargeC: ELEMENTARY_CHARGE_C,
          massKg: 16 * ATOMIC_MASS_UNIT_KG,
          comparisonMassKg: 32 * ATOMIC_MASS_UNIT_KG,
          selectorElectricFieldVm: 5.4e4,
          selectorMagneticFieldT: 0.27,
          deflectionMagneticFieldT: 0.27,
        },
      ];

      const escapedNumberPattern = (formatted: string): RegExp => {
        const escaped = formatted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const suffix = formatted.includes("× 10")
          ? "(?![\\d.])"
          : "(?![\\d.]|\\s*×\\s*10)";
        return new RegExp(`(?<![\\d.])${escaped}${suffix}`);
      };

      let totalChecks = 0;
      for (const [fixtureIdx, baseSpec] of fuzzFixtures.entries()) {
        const sol = solveEmInductionScenario(baseSpec);
        for (const showDerivedLabels of [false, true]) {
          for (const [qKey, qVal] of Object.entries(sol.quantities)) {
            const passViaOptions = fixtureIdx % 3 === 0;
            const specForRender: EmInductionScenarioSpec = {
              ...baseSpec,
              showDerivedLabels,
              hiddenQuantities: passViaOptions ? [] : [qKey],
            };
            const svg = renderEmInductionSvg(
              specForRender,
              passViaOptions ? { hiddenQuantities: [qKey] } : undefined,
            );
            const allText = extractVisibleTextAndMetadata(svg);

            if (Math.abs(qVal) < 1e-18) {
              expect(allText).not.toMatch(/(?<![\d.])0(?![\d.])/);
              totalChecks += 1;
              continue;
            }

            const mag = Math.abs(qVal);
            const fmtSigned = formatSiQuantity(qVal, "");
            const fmtMag = formatSiQuantity(mag, "");
            expect(allText).not.toMatch(escapedNumberPattern(fmtSigned));
            expect(allText).not.toMatch(escapedNumberPattern(fmtMag));

            const unit = inferQuantityUnit(qKey);
            if (unit) {
              expect(allText).not.toContain(formatSiQuantity(mag, unit));
            }
            if (qKey === "efficiency") {
              const pct = Number((mag * 100).toPrecision(3)).toString();
              expect(allText).not.toContain(`${pct}%`);
            }
            if (mag >= 1e-3 && mag < 1e5 && mag !== 1) {
              const prec3 = Number(mag.toPrecision(3)).toString();
              if (!prec3.includes("e")) {
                expect(allText).not.toMatch(escapedNumberPattern(prec3));
              }
            }
            totalChecks += 1;
          }
        }
      }
      expect(totalChecks).toBeGreaterThan(1500);
    });
  });

  describe("Seeded parametric scenario generators", () => {
    it("is deterministic for identical seeds and produces valid, solvable, renderable batches across all 11 kinds", () => {
      const a1 = generateEmInductionScenario("sixthphysics-seed-42", "rc-transient");
      const a2 = generateEmInductionScenario("sixthphysics-seed-42", "rc-transient");
      expect(a1).toEqual(a2);
      expect(renderEmInductionSvg(a1)).toBe(renderEmInductionSvg(a2));

      const batch = generateEmInductionScenarioBatch("wave-1-em", 55);
      expect(batch).toHaveLength(55);
      const coveredKinds = new Set(batch.map((item) => item.kind));
      expect(coveredKinds.size).toBe(EM_INDUCTION_SCENARIO_KINDS.length);

      for (const spec of batch) {
        const validation = validateEmInductionScenario(spec);
        expect(validation).toEqual({ valid: true, issues: [] });
        const solution = solveEmInductionScenario(spec);
        expect(solution.kind).toBe(spec.kind);
        const svg = renderEmInductionSvg(spec);
        assertWellFormedSvgXml(svg);
      }
    });

    it("supports accelerating-voltage cyclotron specs, allowlist visibility, and all RC layout/plot modes", () => {
      // Accelerating-voltage driven cyclotron: r = (1/B) * sqrt(2 m V_acc / |q|)
      const cycSpec = {
        kind: "magnetic-cyclotron" as const,
        chargeC: ELEMENTARY_CHARGE_C,
        massKg: PROTON_MASS_KG,
        magneticFieldT: 0.25,
        fieldDirection: "into-page" as const,
        acceleratingVoltageV: 1800,
        visibleQuantities: ["cyclotronRadiusM", "magneticFieldT"],
      };
      const cycSol = solveEmInductionScenario(cycSpec);
      if (cycSol.kind !== "magnetic-cyclotron") throw new Error("Wrong kind");
      const expectedR =
        (1 / 0.25) *
        Math.sqrt((2 * PROTON_MASS_KG * 1800) / ELEMENTARY_CHARGE_C);
      expect(cycSol.cyclotronRadiusM).toBeCloseTo(expectedR, 12);
      expect(cycSol.kineticEnergyEv).toBeCloseTo(1800, 10);

      const cycSvg = renderEmInductionSvg(cycSpec);
      assertWellFormedSvgXml(cycSvg);
      const visibleText = extractVisibleTextAndMetadata(cycSvg);
      // Allowlisted cyclotronRadiusM and magneticFieldT appear; non-allowlisted V_acc = 1800 V is hidden
      expect(visibleText).toContain("250 mT");
      expect(visibleText).not.toContain("1.80 kV");
      expect(visibleText).not.toContain("1800");

      for (const layout of [
        "circuit-and-graph",
        "circuit-only",
        "graph-only",
      ] as const) {
        for (const plottedQuantity of [
          "capacitor-voltage",
          "resistor-voltage",
          "current",
          "charge",
        ] as const) {
          const svg = renderEmInductionSvg({
            kind: "rc-transient",
            mode: "discharging",
            resistanceOhm: 2500,
            capacitanceF: 40e-6,
            supplyVoltageV: 10,
            layout,
            plottedQuantity,
          });
          assertWellFormedSvgXml(svg);
        }
      }
    });
  });
});
