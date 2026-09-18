import { CARTESIAN_PILOT_FIXTURES } from "../pilot-fixtures";
import { computePilotMetric, kineticEnergyFraction } from "../pilot-physics";
import { renderCartesianPlot } from "../render-cartesian";

describe("eight-question Cartesian reconstruction pilot", () => {
  it("uses eight distinct source questions, balanced across the two papers", () => {
    expect(CARTESIAN_PILOT_FIXTURES).toHaveLength(8);
    expect(
      new Set(CARTESIAN_PILOT_FIXTURES.map((item) => item.sourceQuestionId))
        .size,
    ).toBe(8);
    expect(
      CARTESIAN_PILOT_FIXTURES.filter((item) => item.paper === "1A"),
    ).toHaveLength(4);
    expect(
      CARTESIAN_PILOT_FIXTURES.filter((item) => item.paper === "2"),
    ).toHaveLength(4);
    expect(
      CARTESIAN_PILOT_FIXTURES.every(
        (item) => item.markschemeSourceId && item.sourceCrop,
      ),
    ).toBe(true);
  });

  it.each(CARTESIAN_PILOT_FIXTURES)(
    "checks physics against the linked scheme: $id",
    (fixture) => {
      const actual = computePilotMetric(fixture);
      expect(Math.abs(actual - fixture.check.expected)).toBeLessThanOrEqual(
        fixture.check.tolerance,
      );
    },
  );

  it.each(CARTESIAN_PILOT_FIXTURES)(
    "renders a deterministic, finite student SVG: $id",
    (fixture) => {
      const svg = renderCartesianPlot(fixture.spec, fixture.data);
      expect(svg).toBe(renderCartesianPlot(fixture.spec, fixture.data));
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      expect(svg).not.toContain(`${fixture.id}-answer`);
    },
  );

  it("keeps the requested kinetic-energy curve off the student plot", () => {
    const fixture = CARTESIAN_PILOT_FIXTURES.find(
      (item) => item.id === "may26-tz1-hl-2-q6",
    )!;
    expect(fixture.spec.payload.series).toEqual([]);
    expect(fixture.data).toEqual({});
    const svg = renderCartesianPlot(fixture.spec, fixture.data);
    expect(svg).not.toContain('stroke="#15191d"');
    expect(kineticEnergyFraction(0, 15.7)).toBe(0);
    expect(kineticEnergyFraction(Math.PI / (2 * 15.7), 15.7)).toBeCloseTo(1);
    expect(kineticEnergyFraction(Math.PI / 15.7, 15.7)).toBeCloseTo(0);
  });

  it.each(CARTESIAN_PILOT_FIXTURES.slice(0, 2))(
    "renders square source-grid cells for $id",
    (fixture) => {
      const svg = renderCartesianPlot(fixture.spec, fixture.data);
      const rect = svg.match(
        /<clipPath id="[^"]+"><rect x="[^"]+" y="[^"]+" width="([^"]+)" height="([^"]+)"\/><\/clipPath>/,
      );
      expect(rect).not.toBeNull();
      const plotWidth = Number(rect![1]);
      const plotHeight = Number(rect![2]);
      const { xAxis, yAxis } = fixture.spec.payload;
      expect(fixture.spec.payload.squareGridCells).toBe(true);
      const horizontalCell =
        (plotWidth * xAxis.minorTickStep!) /
        (xAxis.domain[1] - xAxis.domain[0]);
      const verticalCell =
        (plotHeight * yAxis.minorTickStep!) /
        (yAxis.domain[1] - yAxis.domain[0]);
      expect(horizontalCell).toBeCloseTo(verticalCell);
    },
  );

  it("rejects an invalid square-grid configuration", () => {
    const fixture = CARTESIAN_PILOT_FIXTURES[0];
    const spec = structuredClone(fixture.spec);
    spec.payload.xAxis.minorTickStep = undefined;
    expect(() => renderCartesianPlot(spec, fixture.data)).toThrow(
      "Square grid requires visible x and y minor ticks",
    );
  });

  it("rejects crowded tick labels before emitting an unreadable graph", () => {
    const fixture = CARTESIAN_PILOT_FIXTURES[0];
    const spec = structuredClone(fixture.spec);
    spec.payload.xAxis.tickLabels = {
      "2": "overlong-label-one",
      "4": "overlong-label-two",
    };
    expect(() => renderCartesianPlot(spec, fixture.data)).toThrow(
      "Overlapping x-axis tick labels",
    );
  });

  it("rejects private series data and out-of-bounds points", () => {
    const fixture = CARTESIAN_PILOT_FIXTURES[0];
    const privateSpec = structuredClone(fixture.spec);
    privateSpec.payload.series[0].dataRef = `${fixture.id}-answer`;
    expect(() => renderCartesianPlot(privateSpec, fixture.data)).toThrow(
      "not student-visible",
    );

    const badData = {
      ...fixture.data,
      [`${fixture.id}-data`]: [
        { x: 0, y: 0 },
        { x: 100, y: 1 },
      ],
    };
    expect(() => renderCartesianPlot(fixture.spec, badData)).toThrow(
      "outside plot domain",
    );
  });

  it("escapes untrusted axis labels", () => {
    const fixture = CARTESIAN_PILOT_FIXTURES[0];
    const spec = structuredClone(fixture.spec);
    spec.payload.xAxis.label = '<script>alert("x")</script>';
    const svg = renderCartesianPlot(spec, fixture.data);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });
});
