import {
  createSeededRng,
  criticalAngleDeg,
  extractOpticsShmQuantities,
  formatMetric,
  generateOpticsShmBatch,
  generateOpticsShmScenario,
  KinematicShmSolution,
  MassSpringShmSolution,
  MultiLayerSlabSolution,
  OPTICS_SHM_ARCHETYPES,
  OpticalFiberSolution,
  OpticsShmScenarioSpec,
  PlanarRefractionSolution,
  renderOpticsShmSvg,
  shmSpeedAtDisplacement,
  SimplePendulumShmSolution,
  snellsLawAngleDeg,
  solveOpticsShmScenario,
  ThinLensSolution,
  validateOpticsShmScenario,
} from "../optics-shm";

const ALLOWED_SVG_ATTRIBUTES: ReadonlySet<string> = new Set([
  "xmlns",
  "width",
  "height",
  "viewBox",
  "role",
  "aria-label",
  "font-family",
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
  "points",
  "d",
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "text-anchor",
  "font-size",
  "font-weight",
]);

function extractAllGeometryElements(svg: string): string[] {
  return [
    ...svg.matchAll(/<(?:line|polyline|polygon|ellipse|circle|path|rect)\b[^>]*>/g),
  ].map((m) => m[0]);
}

function extractVisibleTextAndMetadata(svg: string): string {
  const chunks: string[] = [];
  for (const match of svg.matchAll(
    /<(?:text|tspan|title|desc)\b[^>]*>([\s\S]*?)<\/(?:text|tspan|title|desc)>/g,
  )) {
    chunks.push(match[1]);
  }
  for (const match of svg.matchAll(
    /\b(?:aria-label|aria-description|alt|title|data-[a-z0-9_-]+)="([^"]*)"/gi,
  )) {
    chunks.push(match[1]);
  }
  return chunks.join(" | ");
}

function assertStrictSvgAttributesAndWellFormedness(svg: string): void {
  expect(svg.startsWith("<svg ")).toBe(true);
  expect(svg.endsWith("</svg>")).toBe(true);
  expect(svg).not.toMatch(/NaN|Infinity|undefined/);

  for (const tagMatch of svg.matchAll(/<([a-zA-Z0-9]+)\b([^>]*?)>/g)) {
    const attrsPart = tagMatch[2];
    for (const attrMatch of attrsPart.matchAll(
      /\b([a-zA-Z_:][a-zA-Z0-9_.:-]*)="([^"]*)"/g,
    )) {
      const attrName = attrMatch[1];
      expect(ALLOWED_SVG_ATTRIBUTES.has(attrName)).toBe(true);
    }
  }
}

function escapedNumberTokenRegex(formatted: string): RegExp {
  const normalized = formatted.replace(/^-/, "[−-]?");
  const escaped = normalized
    .replace(/[.*+?^${}()|\\]/g, "\\$&")
    .replace(/\\\[−-\\\]\\\?/g, "[−-]?");
  const suffix = formatted.includes("× 10")
    ? "(?![\\d.])"
    : "(?![\\d.]|\\s*×\\s*10)";
  return new RegExp(`(?<![\\d.])${escaped}${suffix}`);
}

describe("lib/visuals/optics-shm deterministic solver, validator, and SVG renderer", () => {
  describe("Refraction, Multi-Layer Slabs, and Optical Fibers", () => {
    it("solves planar refraction from air into glass with wave speed and wavelength change", () => {
      const spec: OpticsShmScenarioSpec = {
        kind: "planar-refraction",
        n1: 1.0,
        n2: 1.5,
        incidentAngleDeg: 30,
        vacuumWavelengthNm: 600,
      };
      const sol = solveOpticsShmScenario(spec) as PlanarRefractionSolution;

      expect(sol.regime).toBe("refraction");
      expect(sol.isTotalInternalReflection).toBe(false);
      expect(sol.isCriticalAngle).toBe(false);
      expect(sol.criticalAngleDeg).toBeNull();
      expect(sol.refractedAngleDeg).toBeCloseTo(
        (Math.asin(1 / 3) * 180) / Math.PI,
        10,
      );
      expect(sol.signedDeviationDeg).toBeCloseTo(
        sol.refractedAngleDeg! - 30,
        10,
      );
      expect(sol.speed1Ms).toBeCloseTo(3.0e8, 2);
      expect(sol.speed2Ms).toBeCloseTo(2.0e8, 2);
      expect(sol.wavelength1Nm).toBeCloseTo(600, 10);
      expect(sol.wavelength2Nm).toBeCloseTo(400, 10);
      expect(sol.frequencyHz).toBeCloseTo(5.0e14, 2);
    });

    it("handles normal incidence (0 deg) cleanly even from denser to rarer medium", () => {
      const spec: OpticsShmScenarioSpec = {
        kind: "planar-refraction",
        n1: 1.6,
        n2: 1.0,
        incidentAngleDeg: 0,
      };
      const sol = solveOpticsShmScenario(spec) as PlanarRefractionSolution;
      expect(sol.regime).toBe("refraction");
      expect(sol.refractedAngleDeg).toBe(0);
      expect(sol.deviationAngleDeg).toBe(0);
      expect(sol.criticalAngleDeg).toBeCloseTo(
        (Math.asin(1 / 1.6) * 180) / Math.PI,
        10,
      );

      const svg = renderOpticsShmSvg(spec);
      assertStrictSvgAttributesAndWellFormedness(svg);
    });

    it("distinguishes exact critical-angle grazing from subcritical refraction and total internal reflection", () => {
      const thetaC = criticalAngleDeg(1.5, 1.0)!;
      expect(thetaC).toBeCloseTo(41.8103148957786, 10);

      const justBelow = solveOpticsShmScenario({
        kind: "planar-refraction",
        n1: 1.5,
        n2: 1.0,
        incidentAngleDeg: thetaC - 1e-6,
      }) as PlanarRefractionSolution;
      expect(justBelow.regime).toBe("refraction");
      expect(justBelow.isCriticalAngle).toBe(false);
      expect(justBelow.isTotalInternalReflection).toBe(false);
      expect(justBelow.refractedAngleDeg!).toBeLessThan(90);

      const atCritical = solveOpticsShmScenario({
        kind: "planar-refraction",
        n1: 1.5,
        n2: 1.0,
        incidentAngleDeg: thetaC,
      }) as PlanarRefractionSolution;
      expect(atCritical.regime).toBe("critical-angle");
      expect(atCritical.isCriticalAngle).toBe(true);
      expect(atCritical.isTotalInternalReflection).toBe(false);
      expect(atCritical.refractedAngleDeg).toBe(90);
      expect(atCritical.deviationAngleDeg).toBeCloseTo(90 - thetaC, 10);

      const justAbove = solveOpticsShmScenario({
        kind: "planar-refraction",
        n1: 1.5,
        n2: 1.0,
        incidentAngleDeg: thetaC + 1e-6,
      }) as PlanarRefractionSolution;
      expect(justAbove.regime).toBe("total-internal-reflection");
      expect(justAbove.isTotalInternalReflection).toBe(true);
      expect(justAbove.refractedAngleDeg).toBeNull();

      const aboveCritical = solveOpticsShmScenario({
        kind: "planar-refraction",
        n1: 1.5,
        n2: 1.0,
        incidentAngleDeg: 50,
      }) as PlanarRefractionSolution;
      expect(aboveCritical.regime).toBe("total-internal-reflection");
      expect(aboveCritical.isTotalInternalReflection).toBe(true);
      expect(aboveCritical.refractedAngleDeg).toBeNull();
      expect(aboveCritical.reflectedAngleDeg).toBe(50);
      expect(aboveCritical.deviationAngleDeg).toBe(80);
      expect(snellsLawAngleDeg(1.5, 1.0, 50)).toBeNull();
    });

    it("computes parallel-slab emergent angle invariance and exact lateral displacement", () => {
      const t = 0.06;
      const theta0 = 45;
      const nGlass = 1.52;
      const sol = solveOpticsShmScenario({
        kind: "multi-layer-slab",
        incidentAngleDeg: theta0,
        layers: [
          { name: "Air", refractiveIndex: 1.0 },
          { name: "Crown glass", refractiveIndex: nGlass, thicknessM: t },
          { name: "Air", refractiveIndex: 1.0 },
        ],
      }) as MultiLayerSlabSolution;

      expect(sol.transmittedToFinalLayer).toBe(true);
      expect(sol.tirInterfaceIndex).toBeNull();
      expect(sol.emergentAngleDeg).toBeCloseTo(theta0, 11);

      const theta1Rad = Math.asin(Math.sin((theta0 * Math.PI) / 180) / nGlass);
      const expectedLateral =
        (t * Math.sin((theta0 * Math.PI) / 180 - theta1Rad)) /
        Math.cos(theta1Rad);
      expect(sol.lateralDisplacementM).toBeCloseTo(expectedLateral, 12);
    });

    it("detects internal TIR at an intermediate interface in a multi-layer slab", () => {
      const sol = solveOpticsShmScenario({
        kind: "multi-layer-slab",
        incidentAngleDeg: 42,
        layers: [
          { name: "Flint glass", refractiveIndex: 1.65 },
          { name: "Water", refractiveIndex: 1.33, thicknessM: 0.03 },
          { name: "Air", refractiveIndex: 1.0 },
        ],
      }) as MultiLayerSlabSolution;

      expect(sol.transmittedToFinalLayer).toBe(false);
      expect(sol.tirInterfaceIndex).toBe(1);
      expect(sol.emergentAngleDeg).toBeNull();
      expect(sol.steps).toHaveLength(2);
      expect(sol.tirCriticalAngleDeg).toBeCloseTo(
        (Math.asin(1 / 1.33) * 180) / Math.PI,
        9,
      );
    });

    it("solves step-index optical fiber NA, acceptance angle, guided TIR, critical grazing, leakage, and modal dispersion", () => {
      const guided = solveOpticsShmScenario({
        kind: "optical-fiber",
        nCore: 1.5,
        nCladding: 1.44,
        nExternal: 1.0,
        launchAngleDeg: 15,
        fiberLengthM: 1000,
        coreDiameterM: 50e-6,
      }) as OpticalFiberSolution;

      expect(guided.numericalAperture).toBeCloseTo(0.42, 12);
      expect(guided.acceptanceAngleDeg).toBeCloseTo(
        (Math.asin(0.42) * 180) / Math.PI,
        10,
      );
      expect(guided.criticalAngleDeg).toBeCloseTo(
        (Math.asin(0.96) * 180) / Math.PI,
        10,
      );
      expect(guided.isGuidedByTir).toBe(true);
      expect(guided.regime).toBe("guided-tir");
      expect(guided.claddingRefractedAngleDeg).toBeNull();
      expect(guided.axialTransitTimeS).toBeCloseTo(5.0e-6, 12);
      expect(guided.maxGuidedTransitTimeS).toBeCloseTo(
        (1.5 * 1.5 * 1000) / (3.0e8 * 1.44),
        12,
      );
      expect(guided.modalDispersionDelayS).toBeCloseTo(
        guided.maxGuidedTransitTimeS - guided.axialTransitTimeS,
        14,
      );
      expect(guided.reflectionCount).toBeGreaterThan(0);

      const grazing = solveOpticsShmScenario({
        kind: "optical-fiber",
        nCore: 1.5,
        nCladding: 1.44,
        nExternal: 1.0,
        launchAngleDeg: guided.acceptanceAngleDeg,
        fiberLengthM: 1000,
      }) as OpticalFiberSolution;
      expect(grazing.regime).toBe("critical-grazing");
      expect(grazing.isGuidedByTir).toBe(true);
      expect(grazing.claddingRefractedAngleDeg).toBe(90);
      expect(grazing.wallIncidentAngleDeg).toBeCloseTo(
        guided.criticalAngleDeg,
        9,
      );

      const leaking = solveOpticsShmScenario({
        kind: "optical-fiber",
        nCore: 1.5,
        nCladding: 1.44,
        nExternal: 1.0,
        launchAngleDeg: 35,
        coreDiameterM: 50e-6,
      }) as OpticalFiberSolution;
      expect(leaking.isGuidedByTir).toBe(false);
      expect(leaking.regime).toBe("cladding-leakage");
      expect(leaking.claddingRefractedAngleDeg).not.toBeNull();
      expect(leaking.reflectionCount).toBeNull();
    });
  });

  describe("Thin Lenses (Converging and Diverging)", () => {
    it("solves converging real images across diminished, same-size (2F), and magnified regimes", () => {
      const diminished = solveOpticsShmScenario({
        kind: "thin-lens",
        lensType: "converging",
        focalLengthM: 0.1,
        objectDistanceM: 0.3,
        objectHeightM: 0.06,
      }) as ThinLensSolution;
      expect(diminished.imageDistanceM).toBeCloseTo(0.15, 12);
      expect(diminished.magnification).toBeCloseTo(-0.5, 12);
      expect(diminished.imageHeightM).toBeCloseTo(-0.03, 12);
      expect(diminished.opticalPowerD).toBeCloseTo(10, 12);
      expect(diminished.objectImageSeparationM).toBeCloseTo(0.45, 12);
      expect(diminished.imageNature).toBe("real");
      expect(diminished.orientation).toBe("inverted");
      expect(diminished.sizeClassification).toBe("diminished");

      const sameSize = solveOpticsShmScenario({
        kind: "thin-lens",
        lensType: "converging",
        focalLengthM: 0.15,
        objectDistanceM: 0.3,
      }) as ThinLensSolution;
      expect(sameSize.imageDistanceM).toBeCloseTo(0.3, 12);
      expect(sameSize.magnification).toBeCloseTo(-1, 12);
      expect(sameSize.sizeClassification).toBe("same-size");

      const magnified = solveOpticsShmScenario({
        kind: "thin-lens",
        lensType: "converging",
        focalLengthM: 0.1,
        objectDistanceM: 0.15,
      }) as ThinLensSolution;
      expect(magnified.imageDistanceM).toBeCloseTo(0.3, 12);
      expect(magnified.magnification).toBeCloseTo(-2, 12);
      expect(magnified.sizeClassification).toBe("magnified");
    });

    it("handles object at focal point (u = f) with parallel rays and image at infinity", () => {
      const spec: OpticsShmScenarioSpec = {
        kind: "thin-lens",
        lensType: "converging",
        focalLengthM: 0.12,
        objectDistanceM: 0.12,
        objectHeightM: 0.04,
      };
      const sol = solveOpticsShmScenario(spec) as ThinLensSolution;
      expect(sol.isImageAtInfinity).toBe(true);
      expect(sol.imageDistanceM).toBeNull();
      expect(sol.magnification).toBeNull();
      expect(sol.imageNature).toBe("at-infinity");
      expect(sol.orientation).toBe("none");
      expect(sol.sizeClassification).toBe("infinite");
      expect(sol.principalRays).toHaveLength(2);
      expect(sol.principalRays[0].transmittedDirection.x).toBeCloseTo(
        sol.principalRays[1].transmittedDirection.x,
        12,
      );
      expect(sol.principalRays[0].transmittedDirection.y).toBeCloseTo(
        sol.principalRays[1].transmittedDirection.y,
        12,
      );
      assertStrictSvgAttributesAndWellFormedness(renderOpticsShmSvg(spec));
    });

    it("solves converging virtual (magnifying glass) and diverging virtual lenses with exact ray intersections", () => {
      const convVirtualSpec: OpticsShmScenarioSpec = {
        kind: "thin-lens",
        lensType: "converging",
        focalLengthM: 0.2,
        objectDistanceM: 0.1,
        objectHeightM: 0.03,
      };
      const convVirtual = solveOpticsShmScenario(
        convVirtualSpec,
      ) as ThinLensSolution;
      expect(convVirtual.imageDistanceM).toBeCloseTo(-0.2, 12);
      expect(convVirtual.magnification).toBeCloseTo(2.0, 12);
      expect(convVirtual.imageHeightM).toBeCloseTo(0.06, 12);
      expect(convVirtual.imageNature).toBe("virtual");
      expect(convVirtual.orientation).toBe("upright");
      expect(convVirtual.sizeClassification).toBe("magnified");

      const divSpec: OpticsShmScenarioSpec = {
        kind: "thin-lens",
        lensType: "diverging",
        focalLengthM: -0.15,
        objectDistanceM: 0.3,
        objectHeightM: 0.06,
      };
      const divVirtual = solveOpticsShmScenario(divSpec) as ThinLensSolution;
      expect(divVirtual.focalLengthM).toBeCloseTo(-0.15, 12);
      expect(divVirtual.opticalPowerD).toBeCloseTo(-1 / 0.15, 12);
      expect(divVirtual.imageDistanceM).toBeCloseTo(-0.1, 12);
      expect(divVirtual.magnification).toBeCloseTo(1 / 3, 12);
      expect(divVirtual.imageHeightM).toBeCloseTo(0.02, 12);
      expect(divVirtual.imageNature).toBe("virtual");
      expect(divVirtual.orientation).toBe("upright");
      expect(divVirtual.sizeClassification).toBe("diminished");

      const divPositiveInput = solveOpticsShmScenario({
        kind: "thin-lens",
        lensType: "diverging",
        focalLengthM: 0.15,
        objectDistanceM: 0.3,
        objectHeightM: 0.06,
      }) as ThinLensSolution;
      expect(divPositiveInput.focalLengthM).toBeCloseTo(-0.15, 12);
      expect(divPositiveInput.imageDistanceM).toBeCloseTo(-0.1, 12);

      for (const sol of [convVirtual, divVirtual]) {
        for (const ray of sol.principalRays) {
          const slope = ray.transmittedDirection.y / ray.transmittedDirection.x;
          const yAtImage = ray.lensHit.y + slope * sol.imageDistanceM!;
          expect(yAtImage).toBeCloseTo(sol.imageHeightM!, 12);
        }
      }

      const convVirtualSvg = renderOpticsShmSvg(convVirtualSpec);
      const divSvg = renderOpticsShmSvg(divSpec);
      expect(convVirtualSvg).toContain('stroke-dasharray="6 4"');
      expect(divSvg).toContain('stroke-dasharray="5 3"');
    });
  });

  describe("Simple Harmonic Motion (Mass-Spring, Pendulum, and Kinematic SHM)", () => {
    it("solves mass-spring SHM kinematics and conserves total energy across all samples", () => {
      const sol = solveOpticsShmScenario({
        kind: "mass-spring-shm",
        orientation: "vertical",
        massKg: 0.5,
        springConstantNm: 50,
        amplitudeM: 0.08,
        gravityMs2: 9.81,
        queryDisplacementM: 0.04,
      }) as MassSpringShmSolution;

      expect(sol.angularFrequencyRadS).toBeCloseTo(10, 12);
      expect(sol.periodS).toBeCloseTo(Math.PI / 5, 12);
      expect(sol.frequencyHz).toBeCloseTo(5 / Math.PI, 12);
      expect(sol.energyOscillationFrequencyHz).toBeCloseTo(10 / Math.PI, 12);
      expect(sol.maxSpeedMs).toBeCloseTo(0.8, 12);
      expect(sol.maxAccelerationMs2).toBeCloseTo(8.0, 12);
      expect(sol.totalEnergyJ).toBeCloseTo(0.16, 12);
      expect(sol.staticEquilibriumExtensionM).toBeCloseTo(0.0981, 12);
      expect(sol.speedAtQueryDisplacementMs).toBeCloseTo(
        10 * Math.sqrt(0.08 ** 2 - 0.04 ** 2),
        12,
      );
      expect(sol.accelerationAtQueryDisplacementMs2).toBeCloseTo(-4.0, 12);

      for (const sample of sol.timeSeries) {
        expect(sample.accelerationMs2).toBeCloseTo(
          -100 * sample.displacementM,
          11,
        );
        expect(sample.kineticEnergyJ + sample.potentialEnergyJ).toBeCloseTo(
          sol.totalEnergyJ,
          12,
        );
      }

      for (const sample of sol.displacementSeries) {
        expect(sample.kineticEnergyJ + sample.potentialEnergyJ).toBeCloseTo(
          sol.totalEnergyJ,
          12,
        );
      }

      const eqDisp = sol.equalEnergyDisplacementM;
      const vAtEqEnergy = shmSpeedAtDisplacement(10, 0.08, eqDisp);
      expect(0.5 * 0.5 * vAtEqEnergy ** 2).toBeCloseTo(
        0.5 * sol.totalEnergyJ,
        12,
      );
    });

    it("solves simple pendulum SHM period, small-angle arc amplitude, and string tensions", () => {
      const sol = solveOpticsShmScenario({
        kind: "simple-pendulum-shm",
        lengthM: 0.99396,
        gravityMs2: 9.81,
        bobMassKg: 0.25,
        maxAngleDeg: 8,
      }) as SimplePendulumShmSolution;

      expect(sol.periodS).toBeCloseTo(2.0, 4);
      expect(sol.amplitudeM).toBeCloseTo(
        0.99396 * ((8 * Math.PI) / 180),
        12,
      );
      expect(sol.equilibriumTensionN).toBeGreaterThan(0.25 * 9.81);
      expect(sol.extremeTensionN).toBeCloseTo(
        0.25 * 9.81 * Math.cos((8 * Math.PI) / 180),
        12,
      );
    });

    it("supports sine phase convention and all SHM plot modes cleanly", () => {
      const sineSol = solveOpticsShmScenario({
        kind: "kinematic-shm",
        frequencyHz: 2.5,
        amplitudeM: 0.04,
        phaseConvention: "sine",
        queryTimeS: 0,
      }) as KinematicShmSolution;

      expect(sineSol.displacementAtQueryTimeM).toBe(0);
      expect(sineSol.velocityAtQueryTimeMs).toBeCloseTo(
        2 * Math.PI * 2.5 * 0.04,
        12,
      );
      expect(sineSol.accelerationAtQueryTimeMs2).toBe(0);

      for (const plotMode of [
        "time-series",
        "energy-displacement",
        "energy-time",
        "phase-portrait",
      ] as const) {
        const svg = renderOpticsShmSvg({
          kind: "kinematic-shm",
          frequencyHz: 2.5,
          amplitudeM: 0.04,
          plotMode,
          phasePlotKind:
            plotMode === "phase-portrait"
              ? "acceleration-displacement"
              : undefined,
        });
        assertStrictSvgAttributesAndWellFormedness(svg);
      }
    });
  });

  describe("Validation error coverage", () => {
    it("rejects physically invalid optics and SHM specifications", () => {
      const invalidCases: unknown[] = [
        null,
        { kind: "unknown-kind" },
        {
          kind: "planar-refraction",
          n1: 0.8,
          n2: 1.5,
          incidentAngleDeg: 30,
        },
        {
          kind: "planar-refraction",
          n1: 1.0,
          n2: 1.5,
          incidentAngleDeg: 90,
        },
        {
          kind: "multi-layer-slab",
          incidentAngleDeg: 30,
          layers: [{ refractiveIndex: 1.0 }],
        },
        {
          kind: "optical-fiber",
          nCore: 1.4,
          nCladding: 1.45,
          launchAngleDeg: 10,
        },
        {
          kind: "thin-lens",
          lensType: "converging",
          focalLengthM: -0.15,
          objectDistanceM: 0.3,
        },
        {
          kind: "thin-lens",
          lensType: "diverging",
          focalLengthM: 0,
          objectDistanceM: 0.3,
        },
        {
          kind: "mass-spring-shm",
          massKg: 0.5,
          springConstantNm: 20,
          amplitudeM: 0.05,
          queryDisplacementM: 0.09,
        },
        {
          kind: "simple-pendulum-shm",
          lengthM: 1.0,
          maxAngleDeg: 45,
        },
        {
          kind: "simple-pendulum-shm",
          lengthM: 1.0,
          amplitudeM: 0.1,
          maxAngleDeg: 15,
        },
        {
          kind: "kinematic-shm",
          amplitudeM: 0.05,
          periodS: 2.0,
          frequencyHz: 2.0,
        },
        {
          kind: "planar-refraction",
          n1: 1.0,
          n2: 1.5,
          incidentAngleDeg: 30,
          hiddenQuantities: ["n2"],
          customLabels: { n2: "n2 = 1.50" },
        },
      ];

      for (const bad of invalidCases) {
        const res = validateOpticsShmScenario(bad);
        expect(res.valid).toBe(false);
        expect(res.issues.length).toBeGreaterThan(0);
        expect(() =>
          solveOpticsShmScenario(bad as OpticsShmScenarioSpec),
        ).toThrow();
      }

      expect(() =>
        renderOpticsShmSvg(
          {
            kind: "planar-refraction",
            n1: 1.0,
            n2: 1.5,
            incidentAngleDeg: 30,
          },
          { width: 200, height: 400 },
        ),
      ).toThrow("dimensions");
    });
  });

  describe("Zero answer leakage and visibility controls", () => {
    it("never leaks hidden optical quantities while keeping exact physical ray geometry", () => {
      const baseSpec: OpticsShmScenarioSpec = {
        kind: "planar-refraction",
        n1: 1.33,
        n2: 1.65,
        incidentAngleDeg: 47,
        vacuumWavelengthNm: 589,
      };
      const sol = solveOpticsShmScenario(baseSpec) as PlanarRefractionSolution;
      const refrStr = formatMetric(sol.refractedAngleDeg!, 3);
      const lambda2Str = formatMetric(sol.wavelength2Nm!, 3);

      const unhiddenSvg = renderOpticsShmSvg(baseSpec);
      const unhiddenVisible = extractVisibleTextAndMetadata(unhiddenSvg);
      expect(unhiddenVisible).toContain(refrStr);
      expect(unhiddenVisible).toContain(lambda2Str);

      const hiddenSvg = renderOpticsShmSvg({
        ...baseSpec,
        hiddenQuantities: ["theta2", "lambda2", "n2"],
      });
      assertStrictSvgAttributesAndWellFormedness(hiddenSvg);
      const hiddenVisible = extractVisibleTextAndMetadata(hiddenSvg);
      expect(hiddenVisible).not.toContain(refrStr);
      expect(hiddenVisible).not.toContain(lambda2Str);
      expect(hiddenVisible).not.toContain("1.65");
      expect(extractAllGeometryElements(hiddenSvg)).toEqual(
        extractAllGeometryElements(unhiddenSvg),
      );
    });

    it("never leaks hidden thin-lens image distance, magnification, height, or lensType", () => {
      const baseLens: OpticsShmScenarioSpec = {
        kind: "thin-lens",
        lensType: "converging",
        focalLengthM: 0.17,
        objectDistanceM: 0.29,
        objectHeightM: 0.043,
      };
      const sol = solveOpticsShmScenario(baseLens) as ThinLensSolution;
      const vStr = formatMetric(sol.imageDistanceM!, 3);
      const mStr = formatMetric(sol.magnification!, 3);
      const hiStr = formatMetric(Math.abs(sol.imageHeightM!), 3);

      const fullSvg = renderOpticsShmSvg(baseLens);
      const fullVisible = extractVisibleTextAndMetadata(fullSvg);
      expect(fullVisible).toContain(vStr);
      expect(fullVisible).toContain(mStr);

      const studentSvg = renderOpticsShmSvg({
        ...baseLens,
        hiddenQuantities: ["v", "m", "h_i", "f", "lensType"],
      });
      assertStrictSvgAttributesAndWellFormedness(studentSvg);
      const studentVisible = extractVisibleTextAndMetadata(studentSvg);
      expect(studentVisible).not.toContain(vStr);
      expect(studentVisible).not.toContain(mStr);
      expect(studentVisible).not.toContain(hiStr);
      expect(studentVisible).not.toContain("0.17");
      expect(studentSvg.toLowerCase()).not.toContain("converging");
      expect(extractAllGeometryElements(studentSvg)).toEqual(
        extractAllGeometryElements(fullSvg),
      );
    });

    it("prevents coincident-magnitude and companion leaks across u = 2f, u = f/2, TIR, critical angle, parallel slabs, and SHM", () => {
      // 1. Thin lens at u = 2f => v = 2f, |h_i| = h_o, |m| = 1
      const twoFSpec: OpticsShmScenarioSpec = {
        kind: "thin-lens",
        lensType: "converging",
        focalLengthM: 0.15,
        objectDistanceM: 0.3,
        objectHeightM: 0.04,
      };
      const twoFBaseSvg = renderOpticsShmSvg(twoFSpec);

      const hideVAt2F = renderOpticsShmSvg(twoFSpec, {
        hiddenQuantities: ["v"],
      });
      expect(extractVisibleTextAndMetadata(hideVAt2F)).not.toMatch(
        escapedNumberTokenRegex("0.3"),
      );
      expect(extractAllGeometryElements(hideVAt2F)).toEqual(
        extractAllGeometryElements(twoFBaseSvg),
      );

      const hideHiAt2F = renderOpticsShmSvg(twoFSpec, {
        hiddenQuantities: ["imageHeightM"],
      });
      expect(extractVisibleTextAndMetadata(hideHiAt2F)).not.toMatch(
        escapedNumberTokenRegex("0.04"),
      );

      const hideMAt2F = renderOpticsShmSvg(twoFSpec, {
        hiddenQuantities: ["magnification"],
      });
      expect(extractVisibleTextAndMetadata(hideMAt2F)).not.toMatch(
        escapedNumberTokenRegex("1"),
      );

      // 2. Magnifying glass at u = f/2 => |v| = f = 0.2 and m = +2 (guards both f and "2F")
      const magGlassSpec: OpticsShmScenarioSpec = {
        kind: "thin-lens",
        lensType: "converging",
        focalLengthM: 0.2,
        objectDistanceM: 0.1,
        objectHeightM: 0.03,
      };
      expect(
        extractVisibleTextAndMetadata(
          renderOpticsShmSvg(magGlassSpec, { hiddenQuantities: ["v"] }),
        ),
      ).not.toMatch(escapedNumberTokenRegex("0.2"));
      expect(
        extractVisibleTextAndMetadata(
          renderOpticsShmSvg(magGlassSpec, { hiddenQuantities: ["m"] }),
        ),
      ).not.toMatch(escapedNumberTokenRegex("2"));

      // 3. Planar refraction TIR (theta_r === theta_1) and critical angle (theta_1 === theta_c)
      const tirSpec: OpticsShmScenarioSpec = {
        kind: "planar-refraction",
        n1: 1.6,
        n2: 1.0,
        incidentAngleDeg: 52,
      };
      expect(
        extractVisibleTextAndMetadata(
          renderOpticsShmSvg(tirSpec, {
            hiddenQuantities: ["reflectedAngleDeg"],
          }),
        ),
      ).not.toMatch(escapedNumberTokenRegex("52"));

      const critAngle = criticalAngleDeg(1.5, 1.0)!;
      const critSpec: OpticsShmScenarioSpec = {
        kind: "planar-refraction",
        n1: 1.5,
        n2: 1.0,
        incidentAngleDeg: critAngle,
      };
      expect(
        extractVisibleTextAndMetadata(
          renderOpticsShmSvg(critSpec, {
            hiddenQuantities: ["criticalAngleDeg"],
          }),
        ),
      ).not.toMatch(escapedNumberTokenRegex(formatMetric(critAngle, 3)));

      // 4. Parallel slab (emergentAngleDeg === incidentAngleDeg = 40)
      const slabSpec: OpticsShmScenarioSpec = {
        kind: "multi-layer-slab",
        incidentAngleDeg: 40,
        layers: [
          { name: "Air", refractiveIndex: 1.0 },
          { name: "Glass", refractiveIndex: 1.52, thicknessM: 0.05 },
          { name: "Air", refractiveIndex: 1.0 },
        ],
      };
      expect(
        extractVisibleTextAndMetadata(
          renderOpticsShmSvg(slabSpec, {
            hiddenQuantities: ["emergentAngleDeg"],
          }),
        ),
      ).not.toMatch(escapedNumberTokenRegex("40"));

      // 5. Render options hiddenQuantities safely suppresses spec.customLabels
      const specWithCustom: OpticsShmScenarioSpec = {
        kind: "planar-refraction",
        n1: 1.0,
        n2: 1.52,
        incidentAngleDeg: 35,
        customLabels: { n2: "Crown glass n₂ = 1.52" },
      };
      const overriddenSvg = renderOpticsShmSvg(specWithCustom, {
        hiddenQuantities: ["n2"],
      });
      expect(extractVisibleTextAndMetadata(overriddenSvg)).not.toContain(
        "1.52",
      );

      // 6. SHM at omega = 1 rad/s => amplitudeM === maxSpeedMs === maxAccelerationMs2 = 0.09
      const unitOmegaSpec: OpticsShmScenarioSpec = {
        kind: "kinematic-shm",
        angularFrequencyRadS: 1.0,
        amplitudeM: 0.09,
        plotMode: "time-series",
      };
      for (const hiddenKey of [
        "amplitudeM",
        "maxSpeedMs",
        "maxAccelerationMs2",
      ] as const) {
        expect(
          extractVisibleTextAndMetadata(
            renderOpticsShmSvg(unitOmegaSpec, {
              hiddenQuantities: [hiddenKey],
            }),
          ),
        ).not.toMatch(escapedNumberTokenRegex("0.09"));
      }

      // 7. Hiding mass-spring orientation suppresses "vertical"/"horizontal" in metadata
      const vertMassSpring: OpticsShmScenarioSpec = {
        kind: "mass-spring-shm",
        orientation: "vertical",
        massKg: 0.5,
        springConstantNm: 50,
        amplitudeM: 0.06,
      };
      expect(
        renderOpticsShmSvg(vertMassSpring, {
          hiddenQuantities: ["orientation"],
        }).toLowerCase(),
      ).not.toContain("vertical");
    });

    it("suppresses numeric axis ticks on SHM graphs when period, amplitude, speed, or energy is hidden", () => {
      const shmSpec: OpticsShmScenarioSpec = {
        kind: "mass-spring-shm",
        massKg: 0.37,
        springConstantNm: 43,
        amplitudeM: 0.073,
        plotMode: "time-series",
      };
      const sol = solveOpticsShmScenario(shmSpec) as MassSpringShmSolution;
      const periodStr = formatMetric(sol.periodS, 3);
      const vMaxStr = formatMetric(sol.maxSpeedMs, 3);
      const aMaxStr = formatMetric(sol.maxAccelerationMs2, 3);

      const unhidden = renderOpticsShmSvg(shmSpec);
      const unhiddenVisible = extractVisibleTextAndMetadata(unhidden);
      expect(unhiddenVisible).toContain(periodStr);
      expect(unhiddenVisible).toContain(vMaxStr);
      expect(unhiddenVisible).toContain(aMaxStr);

      const hidden = renderOpticsShmSvg({
        ...shmSpec,
        hiddenQuantities: ["T", "x0", "k", "m"],
      });
      assertStrictSvgAttributesAndWellFormedness(hidden);
      const hiddenVisible = extractVisibleTextAndMetadata(hidden);
      expect(hiddenVisible).not.toContain(periodStr);
      expect(hiddenVisible).not.toContain(vMaxStr);
      expect(hiddenVisible).not.toContain(aMaxStr);
      expect(hiddenVisible).not.toContain("0.073");
      expect(hiddenVisible).not.toContain("43");
      expect(hiddenVisible).not.toContain("0.37");
      expect(extractAllGeometryElements(hidden)).toEqual(
        extractAllGeometryElements(unhidden),
      );
    });

    it("enforces allowlist mode, teacher mode override, and XML escaping in labels", () => {
      const studentSpec: OpticsShmScenarioSpec = {
        kind: "planar-refraction",
        n1: 1.0,
        n2: 1.49,
        incidentAngleDeg: 37,
        medium1Name: '<script>alert("xss")</script>',
        visibleQuantities: ["n1"],
      };
      const svg = renderOpticsShmSvg(studentSpec);
      assertStrictSvgAttributesAndWellFormedness(svg);
      expect(svg).not.toContain("<script>");
      expect(svg).toContain("&lt;script&gt;");
      const visible = extractVisibleTextAndMetadata(svg);
      expect(visible).not.toContain("1.49");
      expect(visible).not.toContain("37°");

      const teacherSvg = renderOpticsShmSvg(studentSpec, { mode: "teacher" });
      expect(extractVisibleTextAndMetadata(teacherSvg)).toContain("1.49");
    });

    it("passes exhaustive per-quantity zero-leakage fuzz check across all 16 archetypes and degenerate/coincident states", () => {
      const generatedSpecs = generateOpticsShmBatch("fuzz-wave1-optics-shm", 16, {
        hideTargets: false,
      }).map((item) => item.spec);

      const degenerateAndCoincidentSpecs: OpticsShmScenarioSpec[] = [
        // Normal incidence (0 deg) & Air wavelength1 === vacuumWavelength
        {
          kind: "planar-refraction",
          n1: 1.0,
          n2: 1.5,
          incidentAngleDeg: 0,
          vacuumWavelengthNm: 550,
        },
        // Equal refractive indices (n1 === n2, theta1 === theta2, lambda1 === lambda2)
        {
          kind: "planar-refraction",
          n1: 1.46,
          n2: 1.46,
          incidentAngleDeg: 34,
          vacuumWavelengthNm: 633,
        },
        // Critical angle boundary (theta1 === theta_c)
        {
          kind: "planar-refraction",
          n1: 1.65,
          n2: 1.33,
          incidentAngleDeg: criticalAngleDeg(1.65, 1.33)!,
        },
        // Parallel 3-layer slab (n0 === n2, emergent === incident, totalThickness === t1)
        {
          kind: "multi-layer-slab",
          incidentAngleDeg: 45,
          layers: [
            { name: "Air", refractiveIndex: 1.0 },
            { name: "Silica", refractiveIndex: 1.46, thicknessM: 0.04 },
            { name: "Air", refractiveIndex: 1.0 },
          ],
        },
        // Optical fiber at critical grazing & axial launch (0 deg)
        {
          kind: "optical-fiber",
          nCore: 1.5,
          nCladding: 1.44,
          launchAngleDeg: 0,
          fiberLengthM: 200,
          coreDiameterM: 50e-6,
        },
        // Thin lens u = 2f (v = u, |h_i| = h_o, |m| = 1)
        {
          kind: "thin-lens",
          lensType: "converging",
          focalLengthM: 0.15,
          objectDistanceM: 0.3,
          objectHeightM: 0.04,
        },
        // Thin lens u = f/2 (|v| = f, m = +2)
        {
          kind: "thin-lens",
          lensType: "converging",
          focalLengthM: 0.2,
          objectDistanceM: 0.1,
          objectHeightM: 0.03,
        },
        // Pendulum with L = 1.0 m (amplitudeM === maxAngleRad)
        {
          kind: "simple-pendulum-shm",
          lengthM: 1.0,
          maxAngleDeg: 10,
          bobMassKg: 0.25,
          plotMode: "time-series",
        },
        // Kinematic SHM across energy-time and acceleration-displacement phase portrait
        {
          kind: "kinematic-shm",
          periodS: 2.0,
          amplitudeM: 0.05,
          massKg: 1.0,
          plotMode: "energy-time",
        },
        {
          kind: "kinematic-shm",
          periodS: 1.6,
          amplitudeM: 0.06,
          plotMode: "phase-portrait",
          phasePlotKind: "acceleration-displacement",
        },
      ];

      const allFuzzSpecs = [...generatedSpecs, ...degenerateAndCoincidentSpecs];
      let checkedCount = 0;

      for (const baseSpec of allFuzzSpecs) {
        const cleanSpec: OpticsShmScenarioSpec = {
          ...baseSpec,
          hiddenQuantities: undefined,
        };
        const baseSvg = renderOpticsShmSvg(cleanSpec);
        const baseGeom = extractAllGeometryElements(baseSvg);
        const sol = solveOpticsShmScenario(cleanSpec);
        const quantities = extractOpticsShmQuantities(cleanSpec, sol);

        for (const [qKey, qVal] of Object.entries(quantities)) {
          const viaSpecSvg = renderOpticsShmSvg({
            ...cleanSpec,
            hiddenQuantities: [qKey],
          });
          const viaOptionsSvg = renderOpticsShmSvg(cleanSpec, {
            hiddenQuantities: [qKey],
          });
          expect(viaOptionsSvg).toBe(viaSpecSvg);

          assertStrictSvgAttributesAndWellFormedness(viaSpecSvg);
          expect(viaSpecSvg).not.toContain(qKey);
          expect(extractAllGeometryElements(viaSpecSvg)).toEqual(baseGeom);

          const visible = extractVisibleTextAndMetadata(viaSpecSvg);
          if (Math.abs(qVal) < 1e-12) {
            expect(visible).not.toMatch(/(?<![\d.])0(?![\d.])/);
          } else {
            const fmtSigned = formatMetric(qVal, 3);
            const fmtMag = formatMetric(Math.abs(qVal), 3);
            expect(visible).not.toMatch(escapedNumberTokenRegex(fmtSigned));
            expect(visible).not.toMatch(escapedNumberTokenRegex(fmtMag));
          }
          checkedCount += 2;
        }
      }

      expect(checkedCount).toBeGreaterThan(800);
    });
  });

  describe("Deterministic seeded parametric generators", () => {
    it("produces deterministic results for identical seeds and valid batches across all 16 archetypes and 3 syllabi", () => {
      const rng1 = createSeededRng("sixthphysics-seed-42");
      const rng2 = createSeededRng("sixthphysics-seed-42");
      expect([rng1.next(), rng1.next(), rng1.next()]).toEqual([
        rng2.next(),
        rng2.next(),
        rng2.next(),
      ]);

      const a = generateOpticsShmScenario("seed-alpha-99");
      const b = generateOpticsShmScenario("seed-alpha-99");
      expect(a).toEqual(b);
      expect(renderOpticsShmSvg(a.spec)).toBe(renderOpticsShmSvg(b.spec));

      const batch = generateOpticsShmBatch(
        "sixthphysics-wave1",
        OPTICS_SHM_ARCHETYPES.length * 2,
      );
      expect(batch).toHaveLength(32);

      const seenArchetypes = new Set(batch.map((item) => item.archetype));
      expect(seenArchetypes.size).toBe(OPTICS_SHM_ARCHETYPES.length);

      for (const item of batch) {
        expect(validateOpticsShmScenario(item.spec)).toEqual({
          valid: true,
          issues: [],
        });
        const svg = renderOpticsShmSvg(item.spec);
        assertStrictSvgAttributesAndWellFormedness(svg);
      }

      const ibBatch = generateOpticsShmBatch("ib-wave1", 22, {
        syllabus: "ib",
      });
      for (const item of ibBatch) {
        expect(item.archetype.startsWith("thin-lens-")).toBe(false);
        if (item.solution.kind === "simple-pendulum-shm") {
          expect(item.solution.gravityMs2).toBe(9.8);
        }
      }
    });
  });
});
