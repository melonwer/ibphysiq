import { renderCartesianPlot } from "../render-cartesian";
import {
  CartesianPlotPayload,
  VISUAL_SCHEMA_VERSION,
  VisualSpec,
} from "../types";

function payload(dataRef = "curve-data"): CartesianPlotPayload {
  return {
    xAxis: {
      id: "x-axis",
      label: "x",
      scale: "linear",
      domain: [0, 10],
      tickStrategy: "fixed",
      tickValues: [0, 5, 10],
    },
    yAxis: {
      id: "y-axis",
      label: "y",
      scale: "linear",
      domain: [0, 10],
      tickStrategy: "fixed",
      tickValues: [0, 5, 10],
    },
    series: [
      {
        id: "curve",
        kind: "analytical-curve",
        xParameterId: "x-axis",
        yParameterId: "y-axis",
        dataRef,
      },
    ],
  };
}

function spec(plotPayload = payload()): VisualSpec<"cartesian_plot"> {
  const dataRefs = plotPayload.series.map((series) => series.dataRef);
  const annotationIds = (plotPayload.annotations ?? []).map(
    (annotation) => annotation.id,
  );
  return {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    id: "capability-test",
    family: "cartesian_plot",
    templateId: "plot.cartesian.v1",
    scenarioRef: "capability-test-scenario",
    coordinateSpace: "cartesian",
    payload: plotPayload,
    composition: { kind: "single" },
    visibility: {
      publicParameterIds: [
        plotPayload.xAxis.id,
        plotPayload.yAxis.id,
        ...dataRefs,
        ...annotationIds,
      ],
      privateParameterIds: [],
      labelMode: "allowlist",
      altTextMode: "student-safe",
    },
  };
}

describe("audited Cartesian capability expansion", () => {
  it("projects logarithmic, descending axes in the requested direction", () => {
    const plot = payload();
    plot.xAxis = {
      ...plot.xAxis,
      scale: "log",
      direction: "descending",
      domain: [100, 10_000],
      tickValues: [100, 1000, 10_000],
    };
    plot.series[0].xParameterId = plot.xAxis.id;
    const svg = renderCartesianPlot(spec(plot), {
      "curve-data": [
        { x: 100, y: 2 },
        { x: 1000, y: 5 },
        { x: 10_000, y: 8 },
      ],
    });

    expect(svg).toContain('<text x="640" y="442"');
    expect(svg).toContain(">100</text>");
    expect(svg).toContain('<text x="112" y="442"');
    expect(svg).toContain(">10000</text>");
  });

  it("distinguishes multiple series with line styles and point markers", () => {
    const plot = payload("primary-data");
    plot.series.push({
      id: "comparison",
      kind: "measured-points",
      xParameterId: "x-axis",
      yParameterId: "y-axis",
      dataRef: "comparison-data",
      styleRole: "comparison",
      lineStyle: "dashed",
      marker: "cross",
    });
    const visualSpec = spec(plot);
    visualSpec.visibility.publicParameterIds.push("comparison-data");
    const svg = renderCartesianPlot(visualSpec, {
      "primary-data": [
        { x: 0, y: 1 },
        { x: 10, y: 9 },
      ],
      "comparison-data": [
        { x: 0, y: 8 },
        { x: 10, y: 2 },
      ],
    });

    expect(svg).toContain('stroke="#15191d"');
    expect(svg).toContain('stroke="#4f5962"');
    expect(svg).toContain('stroke-dasharray="8 5"');
    expect(svg).toContain("M108 109.6L116 117.6M108 117.6L116 109.6");
  });

  it("renders labelled, directional closed cycles", () => {
    const plot = payload("cycle-data");
    plot.series[0].closed = true;
    plot.series[0].showDirection = true;
    plot.annotations = [
      {
        id: "state-a",
        kind: "point-label",
        position: { x: 2, y: 2 },
        label: "A & B",
      },
    ];
    const visualSpec = spec(plot);
    const svg = renderCartesianPlot(visualSpec, {
      "cycle-data": [
        { x: 2, y: 2 },
        { x: 8, y: 2 },
        { x: 8, y: 8 },
        { x: 2, y: 8 },
      ],
    });

    expect(svg).toContain(" Z\"");
    expect(svg).toContain('marker-end="url(#arrow-capability-test)"');
    expect(svg).toContain("A &amp; B");
    expect(svg).toContain('r="3.2"');
  });

  it("renders source-style A-D panel grids from Cartesian layers", () => {
    const first = payload("panel-a");
    const visualSpec = spec(first);
    visualSpec.composition = {
      kind: "panel-grid",
      columns: 2,
      panelLabels: ["A", "B", "C", "D"],
    };
    visualSpec.layers = ["panel-b", "panel-c", "panel-d"].map(
      (dataRef, index) => ({
        id: `layer-${index}`,
        family: "cartesian_plot" as const,
        payload: payload(dataRef),
        zIndex: index + 1,
      }),
    );
    visualSpec.visibility.publicParameterIds.push(
      "panel-b",
      "panel-c",
      "panel-d",
    );
    const data = Object.fromEntries(
      ["panel-a", "panel-b", "panel-c", "panel-d"].map(
        (dataRef, index) => [
          dataRef,
          [
            { x: 0, y: index + 1 },
            { x: 10, y: 9 - index },
          ],
        ],
      ),
    );
    const svg = renderCartesianPlot(visualSpec, data);

    expect(svg.match(/<svg/g)).toHaveLength(5);
    expect(svg).toContain(">A</text>");
    expect(svg).toContain(">D</text>");
    expect(svg).toContain('id="plot-capability-test-panel-4"');
  });

  it("renders step and histogram encodings without arbitrary SVG input", () => {
    const plot = payload("step-data");
    plot.series[0].kind = "step";
    plot.series.push({
      id: "bars",
      kind: "histogram",
      xParameterId: "x-axis",
      yParameterId: "y-axis",
      dataRef: "bar-data",
      styleRole: "comparison",
    });
    const visualSpec = spec(plot);
    visualSpec.visibility.publicParameterIds.push("bar-data");
    const svg = renderCartesianPlot(visualSpec, {
      "step-data": [
        { x: 0, y: 2 },
        { x: 5, y: 6 },
        { x: 10, y: 4 },
      ],
      "bar-data": [
        { x: 2, y: 3 },
        { x: 5, y: 7 },
        { x: 8, y: 5 },
      ],
    });

    expect(svg).toContain("H376 V189.2 H640 V264.8");
    expect(svg).toContain('fill="#eef0f2"');
  });

  it("rejects invalid log data, private annotations, and mismatched overlays", () => {
    const logPlot = payload();
    logPlot.xAxis.scale = "log";
    logPlot.xAxis.domain = [0, 10];
    expect(() =>
      renderCartesianPlot(spec(logPlot), {
        "curve-data": [
          { x: 1, y: 1 },
          { x: 10, y: 10 },
        ],
      }),
    ).toThrow("Invalid axis domain");

    const annotatedPlot = payload();
    annotatedPlot.annotations = [
      {
        id: "private-answer",
        kind: "text",
        position: { x: 5, y: 5 },
        label: "secret",
      },
    ];
    const annotatedSpec = spec(annotatedPlot);
    annotatedSpec.visibility.publicParameterIds =
      annotatedSpec.visibility.publicParameterIds.filter(
        (id) => id !== "private-answer",
      );
    expect(() =>
      renderCartesianPlot(annotatedSpec, {
        "curve-data": [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
      }),
    ).toThrow("Annotation is not student-visible");

    const overlaySpec = spec();
    overlaySpec.composition = { kind: "overlay" };
    const mismatchedPayload = payload("other-data");
    mismatchedPayload.xAxis.domain = [0, 20];
    overlaySpec.layers = [
      {
        id: "overlay",
        family: "cartesian_plot",
        payload: mismatchedPayload,
        zIndex: 1,
      },
    ];
    overlaySpec.visibility.publicParameterIds.push("other-data");
    expect(() =>
      renderCartesianPlot(overlaySpec, {
        "curve-data": [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        "other-data": [
          { x: 0, y: 0 },
          { x: 20, y: 10 },
        ],
      }),
    ).toThrow("Overlay plots require shared axis domains and scales");
  });
});
