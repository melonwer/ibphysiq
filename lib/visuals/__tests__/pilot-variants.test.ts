import { computePilotMetric } from "../pilot-physics";
import {
  createPilotVariant,
  formatToSignificantFigures,
  generatePilotVariants,
  kineticEnergyFraction,
} from "../pilot-variants";
import { renderCartesianPlot } from "../render-cartesian";

const variants = generatePilotVariants();

function frameSize(svg: string): { width: number; height: number } {
  const match = svg.match(
    /<clipPath id="[^"]+"><rect x="[^"]+" y="[^"]+" width="([^"]+)" height="([^"]+)"\/><\/clipPath>/,
  );
  if (!match) throw new Error("Missing plot frame");
  return { width: Number(match[1]), height: Number(match[2]) };
}

describe("parameterized Cartesian pilot", () => {
  it("produces three distinct scenarios for each of eight source cases", () => {
    expect(variants).toHaveLength(24);
    expect(new Set(variants.map((item) => item.id)).size).toBe(24);
    expect(new Set(variants.map((item) => item.sourceFixtureId)).size).toBe(8);
    for (const sourceFixtureId of new Set(
      variants.map((item) => item.sourceFixtureId),
    )) {
      const group = variants.filter(
        (item) => item.sourceFixtureId === sourceFixtureId,
      );
      expect(group).toHaveLength(3);
      expect(
        new Set(group.map((item) => JSON.stringify(item.scenario))).size,
      ).toBe(3);
      expect(
        new Set(group.map((item) => item.solution.value.toPrecision(8))).size,
      ).toBe(3);
    }
  });

  it.each(variants)(
    "keeps renderer, calculation and student labels consistent: $id",
    (variant) => {
      const actual = computePilotMetric(variant);
      expect(Math.abs(actual - variant.solution.value)).toBeLessThanOrEqual(
        variant.check.tolerance,
      );
      const svg = renderCartesianPlot(variant.spec, variant.data);
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/NaN|Infinity|undefined|<script>/);
      expect(svg).not.toContain(`${variant.id}-answer`);
      expect(svg).not.toContain(variant.solution.method);
      expect(variant.spec.visibility.publicParameterIds).not.toContain(
        `${variant.id}-answer`,
      );
      expect(
        variant.spec.payload.xAxis.tickValues!.every(
          (value) =>
            value >= variant.spec.payload.xAxis.domain[0] &&
            value <= variant.spec.payload.xAxis.domain[1],
        ),
      ).toBe(true);
    },
  );

  it("blocks engineering variants from training and formats answers to 3 s.f.", () => {
    for (const variant of variants) {
      expect(variant.trainingEligibility).toBe("blocked");
      expect(variant.solution.significantFigures).toBe(3);
      expect(variant.solution.displayValue).toBe(
        formatToSignificantFigures(variant.solution.value),
      );
      expect(variant.solution.parts.some((part) => part.finalAnswer)).toBe(true);
    }
    expect(formatToSignificantFigures(123.245)).toBe("123");
    expect(formatToSignificantFigures(1.2)).toBe("1.20");
    expect(formatToSignificantFigures(0.001234)).toBe("0.00123");
  });

  it("derives square cells from changing axis ranges instead of a fixed frame", () => {
    const firstTwoFamilies = variants.filter((item) =>
      ["may25-tz1-hl-1a-q2", "nov25-tz3-hl-1a-q3"].includes(
        item.sourceFixtureId,
      ),
    );
    const ratios = new Set<number>();
    for (const variant of firstTwoFamilies) {
      expect(variant.spec.payload.squareGridCells).toBe(true);
      const { width, height } = frameSize(
        renderCartesianPlot(variant.spec, variant.data),
      );
      const { xAxis, yAxis } = variant.spec.payload;
      const horizontalCell =
        (width * xAxis.minorTickStep!) / (xAxis.domain[1] - xAxis.domain[0]);
      const verticalCell =
        (height * yAxis.minorTickStep!) / (yAxis.domain[1] - yAxis.domain[0]);
      expect(horizontalCell).toBeCloseTo(verticalCell, 6);
      if (variant.sourceFixtureId === "nov25-tz3-hl-1a-q3")
        ratios.add(Number((width / height).toFixed(3)));
    }
    expect(ratios.size).toBe(3);
  });

  it("cross-checks harmonic slopes, spring extrema and terminal approach", () => {
    for (const variant of variants) {
      if (variant.scenario.kind === "harmonic-speed") {
        const points = Object.values(variant.data)[0];
        const time = variant.scenario.queryTime;
        const index = points.findIndex((point) => point.x >= time);
        const left = points[Math.max(0, index - 2)];
        const right = points[Math.min(points.length - 1, index + 2)];
        const finiteDifferenceSpeed = Math.abs(
          (right.y - left.y) / (right.x - left.x),
        );
        expect(finiteDifferenceSpeed).toBeCloseTo(variant.solution.value, 1);
      }
      if (variant.scenario.kind === "spring-max-speed") {
        const values = Object.values(variant.data)[0].map((point) => point.y);
        expect(Math.min(...values)).toBeCloseTo(
          variant.check.inputs.energyMin * 100,
          2,
        );
        expect(Math.max(...values)).toBeCloseTo(
          variant.check.inputs.energyMax * 100,
          2,
        );
      }
      if (variant.scenario.kind === "terminal-drag-speed") {
        const values = Object.values(variant.data)[0].map((point) => point.y);
        expect(
          values.every(
            (value, index) => index === 0 || value >= values[index - 1],
          ),
        ).toBe(true);
        expect(values.at(-1)! / variant.solution.value).toBeGreaterThan(0.99);
        const reynoldsNumber =
          (2 *
            variant.scenario.fluidDensity *
            variant.scenario.radius *
            variant.solution.value) /
          variant.scenario.viscosity;
        expect(reynoldsNumber).toBeLessThan(0.1);
      }
    }
  });

  it("keeps every answer-to-sketch kinetic-energy curve private", () => {
    const angularFrequencies: number[] = [];
    for (const variant of variants) {
      if (variant.scenario.kind !== "harmonic-max-acceleration") continue;
      angularFrequencies.push(variant.scenario.angularFrequency);
      expect(variant.spec.payload.series).toEqual([]);
      expect(variant.data).toEqual({});
      expect(variant.studentPrompt).toContain(
        `cos(${variant.scenario.angularFrequency}t)`,
      );
      expect(variant.studentPrompt).not.toMatch(/cos\(\d+\.\d{4,}t\)/);
      const omega = variant.scenario.angularFrequency;
      const amplitude = variant.scenario.amplitude;
      const step = 0.0001 / omega;
      const displacement = (time: number) => amplitude * Math.cos(omega * time);
      const numericalAcceleration = Math.abs(
        (displacement(step) - 2 * displacement(0) + displacement(-step)) /
          step ** 2,
      );
      expect(numericalAcceleration).toBeCloseTo(variant.solution.value, 2);
      expect(kineticEnergyFraction(0, omega)).toBe(0);
      expect(kineticEnergyFraction(Math.PI / (2 * omega), omega)).toBeCloseTo(
        1,
      );
      expect(kineticEnergyFraction(Math.PI / omega, omega)).toBeCloseTo(0);
      expect(renderCartesianPlot(variant.spec, variant.data)).not.toContain(
        'stroke="#15191d"',
      );
      const graph = variant.solution.expectedGraph;
      expect(graph).toBeDefined();
      expect(variant.solution.parts.map((part) => part.id)).toEqual([
        "maximum-acceleration",
        "kinetic-energy-sketch",
      ]);
      const solutionPoints = Object.values(graph!.data)[0];
      expect(solutionPoints).toHaveLength(201);
      expect(solutionPoints[0]).toEqual({ x: 0, y: 0 });
      expect(
        solutionPoints.some((point) => Math.abs(point.y - 1) < 0.001),
      ).toBe(true);
      const solutionSvg = renderCartesianPlot(graph!.spec, graph!.data);
      expect(solutionSvg).toContain('stroke="#15191d"');
      expect(graph!.description).toContain("repeats every π/ω seconds");
    }
    expect(angularFrequencies).toEqual([12.6, 15.7, 18.8]);
  });

  it("rejects physically or geometrically invalid parameter sets", () => {
    expect(() =>
      createPilotVariant("may25-tz1-hl-1a-q2", 1, {
        kind: "area-speed",
        duration: 8,
        finalAcceleration: 6,
        queryTime: 9,
      }),
    ).toThrow("Query time must lie on the graph");
    expect(() =>
      createPilotVariant("nov25-tz1-hl-2-q1", 1, {
        kind: "terminal-drag-speed",
        fluidDensity: 850,
        oilDensity: 900,
        radius: 0.001,
        viscosity: 0.1,
        gravity: 9.8,
      }),
    ).toThrow("Droplet must be buoyant");
    expect(() =>
      createPilotVariant("nov25-tz1-hl-2-q1", 1, {
        kind: "terminal-drag-speed",
        fluidDensity: 1000,
        oilDensity: 850,
        radius: 0.0032,
        viscosity: 0.0011,
        gravity: 9.8,
      }),
    ).toThrow("low Reynolds number");
    expect(() =>
      createPilotVariant("may25-tz1-hl-2-q9", 1, {
        kind: "spring-max-speed",
        mass: 0.1,
        springConstant: 10,
        amplitude: 0.2,
        gravity: 9.8,
      }),
    ).toThrow("Spring must remain stretched");
    expect(() =>
      createPilotVariant("may25-tz1-hl-2-q1", 1, {
        kind: "work-speed",
        forceKiloNewton: 3,
        flatDistance: 40,
        totalDistance: 80,
        mass: -10,
      }),
    ).toThrow("mass must be positive");
    expect(() =>
      createPilotVariant("may26-tz1-hl-2-q6", 1, {
        kind: "harmonic-max-acceleration",
        amplitude: 0.5,
        angularFrequency: 15.707963267948966,
        duration: 0.8,
      }),
    ).toThrow("angular frequency must use at most 3 significant figures");
  });
});
