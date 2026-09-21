import { CartesianPlotData } from "./render-cartesian";
import {
  AxisSpec,
  CartesianPlotPayload,
  PlotAnnotationSpec,
  PlotSeriesSpec,
  Point2D,
  VISUAL_SCHEMA_VERSION,
  VisualSpec,
} from "./types";

type AxisDefinition = Omit<AxisSpec, "id" | "tickStrategy" | "tickValues"> & {
  ticks?: number[];
};

type SeriesDefinition = Omit<
  PlotSeriesSpec,
  "id" | "xParameterId" | "yParameterId" | "dataRef"
> & {
  points: Point2D[];
};

type AnnotationDefinition = Omit<PlotAnnotationSpec, "id">;

interface PanelDefinition {
  x: AxisDefinition;
  y: AxisDefinition;
  series: SeriesDefinition[];
  annotations?: AnnotationDefinition[];
  showGrid?: boolean;
  squareGridCells?: boolean;
}

interface FixtureDefinition {
  id: string;
  sourceQuestionId: string;
  sourceQuestion: string;
  paper: "1A" | "2";
  sourceCrops: string[];
  sourceEvidence:
    | "mined-crop"
    | "derived-page-crop"
    | "canonical-duplicate-crop";
  capabilities: string[];
  sourceNote: string;
  auditCorrection?: string;
  panels: PanelDefinition[];
  panelLabels?: string[];
  columns?: number;
  compositionKind?: "panel-grid" | "sequence";
}

export interface CartesianExpansionFixture {
  id: string;
  sourceQuestionId: string;
  sourceQuestion: string;
  paper: "1A" | "2";
  sourceCrops: string[];
  sourceEvidence: FixtureDefinition["sourceEvidence"];
  capabilities: string[];
  sourceNote: string;
  auditCorrection?: string;
  trainingEligibility: "blocked";
  spec: VisualSpec<"cartesian_plot">;
  data: CartesianPlotData;
}

const MINED = "dataset/_derived/paper-mining-v0.1/";
const REPAIRS = "dataset/_derived/visual-pilot-v0.1/source-repairs/";
const crop = (path: string): string => `${MINED}${path}`;

const sampled = (
  start: number,
  end: number,
  ordinate: (value: number) => number,
  count = 81,
): Point2D[] =>
  Array.from({ length: count }, (_, index) => {
    const x = start + ((end - start) * index) / (count - 1);
    return { x, y: ordinate(x) };
  });

const reversed = (points: readonly Point2D[]): Point2D[] =>
  [...points].reverse();

const qualitativeAxis = (label: string): AxisDefinition => ({
  label,
  scale: "linear",
  domain: [0, 10],
  ticks: [],
  showArrow: true,
});

const cycle = (
  top: (volume: number) => number,
  bottom: (volume: number) => number,
): Point2D[] => [
  ...sampled(2, 8, top, 31),
  ...reversed(sampled(2, 8, bottom, 31)),
];

function buildFixture(definition: FixtureDefinition): CartesianExpansionFixture {
  const data: CartesianPlotData = {};
  const publicParameterIds: string[] = [];
  const payloads = definition.panels.map((panel, panelIndex) => {
    const prefix = `${definition.id}-p${panelIndex + 1}`;
    const xAxis: AxisSpec = {
      ...panel.x,
      id: `${prefix}-x`,
      tickStrategy: "source-matched",
      tickValues: panel.x.ticks ?? [],
    };
    const yAxis: AxisSpec = {
      ...panel.y,
      id: `${prefix}-y`,
      tickStrategy: "source-matched",
      tickValues: panel.y.ticks ?? [],
    };
    publicParameterIds.push(xAxis.id, yAxis.id);
    const series = panel.series.map((item, seriesIndex): PlotSeriesSpec => {
      const id = `${prefix}-s${seriesIndex + 1}`;
      const dataRef = `${id}-data`;
      data[dataRef] = item.points;
      publicParameterIds.push(dataRef);
      const seriesSpec = { ...item };
      delete (seriesSpec as Partial<SeriesDefinition>).points;
      return {
        ...seriesSpec,
        id,
        xParameterId: xAxis.id,
        yParameterId: yAxis.id,
        dataRef,
      };
    });
    const annotations = panel.annotations?.map(
      (item, annotationIndex): PlotAnnotationSpec => {
        const annotation = {
          ...item,
          id: `${prefix}-a${annotationIndex + 1}`,
        };
        publicParameterIds.push(annotation.id);
        return annotation;
      },
    );
    return {
      xAxis,
      yAxis,
      series,
      annotations,
      showGrid: panel.showGrid,
      squareGridCells: panel.squareGridCells,
    } satisfies CartesianPlotPayload;
  });
  const composition =
    payloads.length === 1
      ? { kind: "single" as const }
      : {
          kind: definition.compositionKind ?? ("panel-grid" as const),
          columns: definition.columns,
          panelLabels: definition.panelLabels,
        };
  const spec: VisualSpec<"cartesian_plot"> = {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    id: definition.id,
    family: "cartesian_plot",
    templateId: "plot.cartesian.v1",
    scenarioRef: definition.sourceQuestionId,
    coordinateSpace: "cartesian",
    payload: payloads[0],
    layers: payloads.slice(1).map((payload, index) => ({
      id: `${definition.id}-layer-${index + 2}`,
      family: "cartesian_plot",
      payload,
      zIndex: index + 1,
    })),
    composition,
    visibility: {
      publicParameterIds,
      privateParameterIds: [`${definition.id}-answer`],
      labelMode: "allowlist",
      altTextMode: "student-safe",
    },
    provenance: {
      sourceQuestionId: definition.sourceQuestionId,
      rendererVersion: "cartesian-svg/0.2.0",
    },
  };
  return {
    id: definition.id,
    sourceQuestionId: definition.sourceQuestionId,
    sourceQuestion: definition.sourceQuestion,
    paper: definition.paper,
    sourceCrops: definition.sourceCrops,
    sourceEvidence: definition.sourceEvidence,
    capabilities: definition.capabilities,
    sourceNote: definition.sourceNote,
    auditCorrection: definition.auditCorrection,
    trainingEligibility: "blocked",
    spec,
    data,
  };
}

const pressureVolumePanelsMay25: PanelDefinition[] = [
  {
    x: qualitativeAxis("V"),
    y: qualitativeAxis("P"),
    series: [
      {
        kind: "analytical-curve",
        points: cycle(() => 8, (v) => 2 + 12 / v),
        closed: true,
        showDirection: true,
      },
    ],
  },
  {
    x: qualitativeAxis("V"),
    y: qualitativeAxis("P"),
    series: [
      {
        kind: "analytical-curve",
        points: cycle((v) => 2 + v ** 1.25 / 2.2, (v) => 1 + v / 2.4),
        closed: true,
        showDirection: true,
      },
    ],
  },
  {
    x: qualitativeAxis("V"),
    y: qualitativeAxis("P"),
    series: [
      {
        kind: "analytical-curve",
        points: cycle((v) => 3 + 13 / v, (v) => 1.3 + 8 / v),
        closed: true,
        showDirection: true,
      },
    ],
  },
  {
    x: qualitativeAxis("V"),
    y: qualitativeAxis("P"),
    series: [
      {
        kind: "analytical-curve",
        points: cycle((v) => 2 + v ** 1.35 / 2.2, (v) => 1 + v / 2.6),
        closed: true,
        showDirection: true,
      },
    ],
  },
];

const inductionOptionPanels: PanelDefinition[] = [
  [1, 1.5 * Math.PI, 0],
  [1, 2 * Math.PI, 0],
  [0.48, 1.5 * Math.PI, 0],
  [0.48, 2 * Math.PI, 0],
].map(([amplitude, angularFactor, phase], index) => ({
  x: {
    label: "t",
    scale: "linear",
    domain: [0, 1],
    ticks: [0, 1],
    tickLabels: { "1": "T" },
    showArrow: true,
  },
  y: {
    label: "I",
    scale: "linear",
    domain: [-1.2, 1.2],
    ticks: [-1, 0, 1],
    tickLabels: { "-1": "−I₀", "1": "I₀" },
    showArrow: true,
  },
  series: [
    {
      kind: "waveform" as const,
      points: sampled(
        0,
        1,
        (t) => amplitude * Math.sin(angularFactor * t + phase),
      ),
      styleRole: index === 3 ? ("primary" as const) : ("comparison" as const),
    },
  ],
}));

const transferOptionPanels: PanelDefinition[] = [
  () => 5,
  (diameter: number) => 7 * (1 - Math.exp(-diameter / 2.7)),
  (diameter: number) => 0.75 * diameter,
  (diameter: number) => 0.08 * diameter ** 2,
].map((rate) => ({
  x: qualitativeAxis("d"),
  y: qualitativeAxis("ΔQ/Δt"),
  series: [
    {
      kind: "analytical-curve" as const,
      points: sampled(0, 9, rate),
    },
  ],
}));

const idealGasOptionPanels: PanelDefinition[] = [
  { direction: 1, rising: false },
  { direction: -1, rising: false },
  { direction: -1, rising: true },
  { direction: 1, rising: true },
].map(({ direction, rising }) => {
  const top = rising
    ? sampled(2.5, 8, (v) => 1.3 + 0.13 * v ** 1.8, 35)
    : sampled(2.5, 8, (v) => 2.2 + 13 / v, 35);
  const bottom = rising
    ? sampled(2.5, 8, (v) => 0.8 + 0.1 * v ** 1.75, 35)
    : sampled(2.5, 8, (v) => 1.15 + 9 / v, 35);
  return {
    x: qualitativeAxis("V"),
    y: qualitativeAxis("P"),
    series: [
      {
        kind: "analytical-curve" as const,
        points: direction > 0 ? top : reversed(top),
        showDirection: true,
      },
      {
        kind: "analytical-curve" as const,
        points: direction > 0 ? reversed(bottom) : bottom,
        showDirection: true,
      },
      {
        kind: "analytical-curve" as const,
        points: [top[top.length - 1], bottom[bottom.length - 1]],
        showDirection: true,
      },
    ],
  };
});

const soundWavePanels: PanelDefinition[] = [
  {
    x: {
      label: "x",
      unit: "m",
      scale: "linear",
      domain: [0, 4.1],
      ticks: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
      minorTickStep: 0.1,
    },
    y: {
      label: "d",
      unit: "mm",
      scale: "linear",
      domain: [-0.0012, 0.0012],
      ticks: [-0.001, 0, 0.001],
      minorTickStep: 0.0002,
    },
    series: [
      {
        kind: "waveform",
        points: sampled(0, 4.1, (x) => 0.00062 * Math.sin((2 * Math.PI * x) / 0.69)),
      },
    ],
    showGrid: true,
  },
  {
    x: {
      label: "t",
      unit: "s",
      scale: "linear",
      domain: [0, 0.0064],
      ticks: [0, 0.001, 0.002, 0.003, 0.004, 0.005, 0.006],
      minorTickStep: 0.0002,
    },
    y: {
      label: "d",
      unit: "mm",
      scale: "linear",
      domain: [-0.0012, 0.0012],
      ticks: [-0.001, 0, 0.001],
      minorTickStep: 0.0002,
    },
    series: [
      {
        kind: "waveform",
        points: sampled(
          0,
          0.0064,
          (time) => 0.00062 * Math.sin((2 * Math.PI * time) / 0.002),
        ),
      },
    ],
    showGrid: true,
  },
];

const standingWaveStudentPanel: PanelDefinition = {
  x: {
    label: "time",
    scale: "linear",
    domain: [0, 1],
    ticks: [],
    showArrow: true,
  },
  y: {
    label: "displacement",
    scale: "linear",
    domain: [-1.2, 1.2],
    ticks: [],
    showArrow: true,
  },
  series: [
    {
      kind: "waveform",
      points: sampled(0, 1, (time) => Math.sin(2 * Math.PI * time)),
    },
  ],
  annotations: [
    {
      kind: "text",
      position: { x: 0.36, y: 0.78 },
      label: "displacement of P",
      offset: { x: 0, y: 0 },
    },
  ],
};

const hrAxes = {
  x: {
    label: "effective temperature",
    unit: "K",
    scale: "log" as const,
    direction: "descending" as const,
    domain: [2500, 40_000] as [number, number],
    ticks: [2500, 5000, 10_000, 20_000, 40_000],
  },
  y: {
    label: "luminosity",
    unit: "L☉",
    scale: "log" as const,
    domain: [0.0001, 1_000_000] as [number, number],
    ticks: [0.0001, 0.01, 1, 100, 10_000, 1_000_000],
    tickLabels: {
      "0.0001": "10⁻⁴",
      "0.01": "10⁻²",
      "1": "1",
      "100": "10²",
      "10000": "10⁴",
      "1000000": "10⁶",
    },
  },
};

const hrMainSequence = Array.from({ length: 60 }, (_, index) => {
  const fraction = index / 59;
  const temperature = 2500 * 16 ** fraction;
  const logLuminosity =
    -4 +
    10 * fraction +
    16 * ((fraction - 0.5) ** 3 - 0.25 * (fraction - 0.5));
  return { x: temperature, y: 10 ** logLuminosity };
});

const fixtures: FixtureDefinition[] = [
  {
    id: "may25-tz1-hl-1a-q13-source",
    sourceQuestionId: "q_b77f1db8fd3100afebb6",
    sourceQuestion: "May 2025 TZ1 HL Paper 1A Q13",
    paper: "1A",
    sourceCrops: [
      crop("assets/src_b05dc046d8866ece9f01/p007_v02.png"),
      crop("assets/src_b05dc046d8866ece9f01/p007_v03.png"),
      crop("assets/src_b05dc046d8866ece9f01/p007_v04.png"),
      crop("assets/src_b05dc046d8866ece9f01/p007_v05.png"),
    ],
    sourceEvidence: "mined-crop",
    capabilities: ["option-panel-grid", "closed-cycle", "pressure-volume"],
    sourceNote: "Four qualitative P–V answer options for a Carnot-cycle question.",
    panels: pressureVolumePanelsMay25,
    panelLabels: ["A", "B", "C", "D"],
    columns: 2,
  },
  {
    id: "may25-tz1-hl-1a-q18-source",
    sourceQuestionId: "q_f177a70785a4416987cb",
    sourceQuestion: "May 2025 TZ1 HL Paper 1A Q18",
    paper: "1A",
    sourceCrops: [crop("assets/src_b05dc046d8866ece9f01/p011_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["quantitative-waveform"],
    sourceNote: "Displacement–time wave with 5 nm amplitude and 4 ms period.",
    panels: [
      {
        x: {
          label: "t",
          unit: "ms",
          scale: "linear",
          domain: [0, 5],
          ticks: [0, 1, 2, 3, 4, 5],
          minorTickStep: 0.2,
        },
        y: {
          label: "d",
          unit: "nm",
          scale: "linear",
          domain: [-5, 5],
          ticks: [-5, 0, 5],
          minorTickStep: 0.5,
        },
        series: [
          {
            kind: "waveform",
            points: sampled(0, 5, (time) => 5 * Math.cos((Math.PI * time) / 2)),
          },
        ],
        showGrid: true,
      },
    ],
  },
  {
    id: "may25-tz2-hl-1a-q30-source",
    sourceQuestionId: "q_13083ffab1d1050f057d",
    sourceQuestion: "May 2025 TZ2 HL Paper 1A Q30",
    paper: "1A",
    sourceCrops: [
      crop("assets/src_1a8e1d9cb248f5fddbda/p016_v02.png"),
      crop("assets/src_1a8e1d9cb248f5fddbda/p017_v01.png"),
      crop("assets/src_1a8e1d9cb248f5fddbda/p017_v02.png"),
      crop("assets/src_1a8e1d9cb248f5fddbda/p017_v03.png"),
      crop("assets/src_1a8e1d9cb248f5fddbda/p017_v04.png"),
    ],
    sourceEvidence: "mined-crop",
    capabilities: ["option-panel-grid", "waveform", "symbolic-ticks"],
    sourceNote: "Four induced-current waveform choices with symbolic I₀ and T scales.",
    panels: inductionOptionPanels,
    panelLabels: ["A", "B", "C", "D"],
    columns: 2,
  },
  {
    id: "may25-tz2-hl-1a-q34-source",
    sourceQuestionId: "q_e3b1eae0a922546327cc",
    sourceQuestion: "May 2025 TZ2 HL Paper 1A Q34",
    paper: "1A",
    sourceCrops: [crop("assets/src_1a8e1d9cb248f5fddbda/p019_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["multiple-series", "qualitative-axes", "annotations"],
    sourceNote: "Two photoelectric kinetic-energy lines with different threshold frequencies.",
    panels: [
      {
        x: qualitativeAxis("f"),
        y: qualitativeAxis("Eₖ"),
        series: [
          {
            kind: "analytical-curve",
            points: [
              { x: 2, y: 0 },
              { x: 8, y: 8 },
            ],
            styleRole: "comparison",
            lineStyle: "dashed",
          },
          {
            kind: "analytical-curve",
            points: [
              { x: 4, y: 0 },
              { x: 9, y: 6.7 },
            ],
          },
        ],
        annotations: [
          { kind: "text", position: { x: 7.3, y: 7.3 }, label: "X" },
          { kind: "text", position: { x: 8, y: 5.1 }, label: "Y" },
        ],
      },
    ],
  },
  {
    id: "may25-tz3-hl-1a-q39-source",
    sourceQuestionId: "q_c44a7bfcfd551546b497",
    sourceQuestion: "May 2025 TZ3 HL Paper 1A Q39",
    paper: "1A",
    sourceCrops: [crop("assets/src_111ea8ab4a35db2436ae/p017_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["log-axes", "reversed-axis", "wide-band", "annotations"],
    sourceNote: "Qualitative HR main-sequence band with stars X and Y.",
    panels: [
      {
        x: { ...hrAxes.x, ticks: [] },
        y: { ...hrAxes.y, ticks: [] },
        series: [
          {
            kind: "analytical-curve",
            points: hrMainSequence,
            styleRole: "comparison",
            lineWeight: "wide",
          },
        ],
        annotations: [
          {
            kind: "point-label",
            position: { x: 24_000, y: 15_000 },
            label: "X",
          },
          {
            kind: "point-label",
            position: { x: 3600, y: 0.2 },
            label: "Y",
          },
        ],
      },
    ],
  },
  {
    id: "nov25-tz1-hl-1a-q9-source",
    sourceQuestionId: "q_7ad736afdec390bf8dd8",
    sourceQuestion: "November 2025 TZ1 HL Paper 1A Q9",
    paper: "1A",
    sourceCrops: [crop("assets/src_f74642bf578e0fbc29cc/p006_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["spacetime-axes", "multiple-series", "dashed-construction"],
    sourceNote: "Qualitative Minkowski diagram with primed axes and labelled events.",
    panels: [
      {
        x: qualitativeAxis("x"),
        y: qualitativeAxis("ct"),
        series: [
          {
            kind: "analytical-curve",
            points: [
              { x: 0, y: 0 },
              { x: 6.1, y: 10 },
            ],
          },
          {
            kind: "analytical-curve",
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 6.1 },
            ],
            styleRole: "comparison",
          },
          {
            kind: "analytical-curve",
            points: sampled(0, 10, (x) => Math.sqrt(25 + 0.45 * x ** 2)),
            styleRole: "construction",
            lineStyle: "dashed",
          },
        ],
        annotations: [
          { kind: "point-label", position: { x: 0.1, y: 5 }, label: "X" },
          { kind: "point-label", position: { x: 3.3, y: 5.7 }, label: "P" },
          { kind: "point-label", position: { x: 4.6, y: 6.4 }, label: "Q" },
          { kind: "point-label", position: { x: 6, y: 8.7 }, label: "R" },
          { kind: "text", position: { x: 5.9, y: 9.6 }, label: "ct′" },
          { kind: "text", position: { x: 9, y: 5.6 }, label: "x′" },
        ],
        showGrid: true,
      },
    ],
  },
  {
    id: "nov25-tz1-hl-1a-q28-source",
    sourceQuestionId: "q_d49680809d9da4dc3f91",
    sourceQuestion: "November 2025 TZ1 HL Paper 1A Q28",
    paper: "1A",
    sourceCrops: [crop("assets/src_f74642bf578e0fbc29cc/p017_v02.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["straight-line", "qualitative-axes"],
    sourceNote: "Radius R against speed v is a straight line through the origin.",
    auditCorrection:
      "The question asks for the gradient of the whole line; no drawn tangent construction is present.",
    panels: [
      {
        x: qualitativeAxis("v"),
        y: qualitativeAxis("R"),
        series: [
          {
            kind: "analytical-curve",
            points: [
              { x: 0, y: 0 },
              { x: 7, y: 8 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "nov25-tz3-sl-1a-q6-source",
    sourceQuestionId: "q_734b9cd07a4f1cfcd552",
    sourceQuestion: "November 2025 TZ3 SL Paper 1A Q6",
    paper: "1A",
    sourceCrops: [
      crop("assets/src_345852ed246fa22feacd/p004_v02.png"),
      crop("assets/src_345852ed246fa22feacd/p004_v03.png"),
      crop("assets/src_345852ed246fa22feacd/p004_v04.png"),
      crop("assets/src_345852ed246fa22feacd/p004_v05.png"),
    ],
    sourceEvidence: "mined-crop",
    capabilities: ["option-panel-grid", "qualitative-curves"],
    sourceNote: "Four candidate relationships between heat-transfer rate and rod diameter.",
    panels: transferOptionPanels,
    panelLabels: ["A", "B", "C", "D"],
    columns: 2,
  },
  {
    id: "may26-tz2-hl-1a-q36-source",
    sourceQuestionId: "q_c82142b228f5f2f56499",
    sourceQuestion: "May 2026 TZ2 HL Paper 1A Q36",
    paper: "1A",
    sourceCrops: [crop("assets/src_35c32668e012ab7e7601/p021_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["quantitative-decay", "asymptote"],
    sourceNote: "Radioactive decay curve with a 600 s half-life.",
    panels: [
      {
        x: {
          label: "t",
          unit: "s",
          scale: "linear",
          domain: [0, 3000],
          ticks: [0, 500, 1000, 1500, 2000, 2500, 3000],
          minorTickStep: 100,
        },
        y: {
          label: "N",
          scale: "linear",
          domain: [0, 1200],
          ticks: [0, 200, 400, 600, 800, 1000, 1200],
          minorTickStep: 100,
        },
        series: [
          {
            kind: "analytical-curve",
            points: sampled(0, 3000, (time) => 1000 * 2 ** (-time / 600)),
          },
        ],
        showGrid: true,
      },
    ],
  },
  {
    id: "may26-tz2-hl-1a-q39-source",
    sourceQuestionId: "q_f33edd15b8ec63ce58af",
    sourceQuestion: "May 2026 TZ2 HL Paper 1A Q39",
    paper: "1A",
    sourceCrops: [crop("assets/src_35c32668e012ab7e7601/p022_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["log-axes", "reversed-axis", "measured-points", "annotations"],
    sourceNote: "Dense HR distribution with labelled regions Q, R and S.",
    panels: [
      {
        x: hrAxes.x,
        y: hrAxes.y,
        series: [
          {
            kind: "measured-points",
            points: hrMainSequence,
            marker: "dot",
          },
          {
            kind: "measured-points",
            points: sampled(3000, 9000, (temperature) => 50 * (9000 / temperature) ** 2, 30),
            marker: "dot",
            styleRole: "comparison",
          },
        ],
        annotations: [
          { kind: "text", position: { x: 6200, y: 0.15 }, label: "Q" },
          { kind: "text", position: { x: 3100, y: 20 }, label: "R" },
          { kind: "text", position: { x: 4700, y: 25_000 }, label: "S" },
        ],
      },
    ],
  },
  {
    id: "may26-tz3-hl-1a-q13-source",
    sourceQuestionId: "q_eaf6dcb046cf79ee0c0a",
    sourceQuestion: "May 2026 TZ3 HL Paper 1A Q13",
    paper: "1A",
    sourceCrops: [crop("assets/src_8a148b6249e004472daa/p008_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["straight-line", "symbolic-axis", "annotation"],
    sourceNote: "Pressure against reciprocal volume, labelled with gradient q.",
    auditCorrection:
      "The source labels the gradient of a straight line; it does not contain a tangent construction.",
    panels: [
      {
        x: qualitativeAxis("1/V"),
        y: qualitativeAxis("P"),
        series: [
          {
            kind: "analytical-curve",
            points: [
              { x: 0, y: 0 },
              { x: 8, y: 8 },
            ],
          },
        ],
        annotations: [
          {
            kind: "text",
            position: { x: 5.3, y: 6.2 },
            label: "gradient = q",
          },
        ],
      },
    ],
  },
  {
    id: "may26-tz3-hl-1a-q14-source",
    sourceQuestionId: "q_9b471a481533fdd45f0b",
    sourceQuestion: "May 2026 TZ3 HL Paper 1A Q14",
    paper: "1A",
    sourceCrops: [
      crop("assets/src_8a148b6249e004472daa/p009_v01.png"),
      crop("assets/src_8a148b6249e004472daa/p009_v02.png"),
      crop("assets/src_8a148b6249e004472daa/p009_v03.png"),
      crop("assets/src_8a148b6249e004472daa/p009_v04.png"),
    ],
    sourceEvidence: "mined-crop",
    capabilities: ["option-panel-grid", "pressure-volume", "direction-arrows"],
    sourceNote: "Four directional P–V cycles made from curved and isovolumetric processes.",
    panels: idealGasOptionPanels,
    panelLabels: ["A", "B", "C", "D"],
    columns: 2,
  },
  {
    id: "may25-tz1-hl-2-q8-source",
    sourceQuestionId: "q_90ba14b14bd2f9cebe7b",
    sourceQuestion: "May 2025 TZ1 HL Paper 2 Q8",
    paper: "2",
    sourceCrops: [crop("assets/src_06b087bbc8e1887cb3ca/p019_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["log-axes", "reversed-axis", "measured-points", "annotations"],
    sourceNote: "Sparse HR point distribution with the Sun and Antares highlighted.",
    panels: [
      {
        x: hrAxes.x,
        y: hrAxes.y,
        series: [
          {
            kind: "measured-points",
            marker: "dot",
            points: [
              ...hrMainSequence.filter((_, index) => index % 4 === 0),
              { x: 18_000, y: 10_000 },
              { x: 4000, y: 40_000 },
              { x: 7000, y: 0.00012 },
              { x: 16_000, y: 0.001 },
            ],
          },
        ],
        annotations: [
          {
            kind: "point-label",
            position: { x: 5800, y: 1 },
            label: "Sun",
          },
          {
            kind: "point-label",
            position: { x: 3500, y: 45_000 },
            label: "Antares",
          },
        ],
        showGrid: true,
      },
    ],
  },
  {
    id: "may25-tz2-sl-2-q2-source",
    sourceQuestionId: "q_5ff7ae2cef57932fdfbb",
    sourceQuestion: "May 2025 TZ2 SL Paper 2 Q2",
    paper: "2",
    sourceCrops: [crop("assets/src_a4e5295ac319bc1ef0c5/p007_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["quantitative-decay", "horizontal-asymptote"],
    sourceNote: "Room-temperature cooling curve approaching about 6 °C.",
    auditCorrection:
      "The prompt discusses a changing gradient, but no tangent line is drawn in the source.",
    panels: [
      {
        x: {
          label: "t",
          unit: "min",
          scale: "linear",
          domain: [0, 120],
          ticks: [0, 20, 40, 60, 80, 100, 120],
          minorTickStep: 5,
        },
        y: {
          label: "T",
          unit: "°C",
          scale: "linear",
          domain: [0, 25],
          ticks: [0, 5, 10, 15, 20, 25],
          minorTickStep: 1,
        },
        series: [
          {
            kind: "analytical-curve",
            points: sampled(0, 120, (time) => 6 + 16 * Math.exp(-time / 15)),
          },
        ],
        showGrid: true,
      },
    ],
  },
  {
    id: "may25-tz2-hl-2-q6-source",
    sourceQuestionId: "q_7cdb39c9e4c1dc7886ba",
    sourceQuestion: "May 2025 TZ2 HL Paper 2 Q6",
    paper: "2",
    sourceCrops: [crop("assets/src_dce0c69d973befedba9a/p014_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["spacetime-axes", "quantitative-grid", "multiple-series"],
    sourceNote: "Earth and spacecraft spacetime axes for speed 0.60c.",
    panels: [
      {
        x: {
          label: "x",
          unit: "ly",
          scale: "linear",
          domain: [0, 150],
          ticks: [0, 20, 40, 60, 80, 100, 120, 140],
          minorTickStep: 5,
          showArrow: true,
        },
        y: {
          label: "ct",
          unit: "ly",
          scale: "linear",
          domain: [0, 150],
          ticks: [0, 20, 40, 60, 80, 100, 120, 140],
          minorTickStep: 5,
          showArrow: true,
        },
        series: [
          {
            kind: "analytical-curve",
            points: [
              { x: 0, y: 0 },
              { x: 90, y: 150 },
            ],
          },
          {
            kind: "analytical-curve",
            points: [
              { x: 0, y: 0 },
              { x: 150, y: 90 },
            ],
            styleRole: "comparison",
          },
        ],
        annotations: [
          { kind: "text", position: { x: 87, y: 142 }, label: "ct′" },
          { kind: "text", position: { x: 143, y: 82 }, label: "x′" },
        ],
        showGrid: true,
      },
    ],
  },
  {
    id: "may25-tz3-sl-2-q2-source",
    sourceQuestionId: "q_bc7e65096ff692ea1749",
    sourceQuestion: "May 2025 TZ3 SL Paper 2 Q2",
    paper: "2",
    sourceCrops: [`${REPAIRS}may25-tz3-sl-p2-q2-waves.png`],
    sourceEvidence: "derived-page-crop",
    capabilities: ["multiple-panels", "quantitative-waveforms"],
    sourceNote: "Separate displacement–position and displacement–time plots for one sound wave.",
    auditCorrection:
      "The mined crop showed the later car diagram. A clean graph crop was derived non-destructively from PDF page 4; the waveforms are separate panels, not multiple series on one plot.",
    panels: soundWavePanels,
    panelLabels: ["Graph 1", "Graph 2"],
    columns: 1,
    compositionKind: "sequence",
  },
  {
    id: "may25-tz3-hl-2-q2-source",
    sourceQuestionId: "q_f086c001418af000aaae",
    sourceQuestion: "May 2025 TZ3 HL Paper 2 Q2",
    paper: "2",
    sourceCrops: [crop("assets/src_d155c696e37b77ffc666/p004_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["spacetime-axes", "student-drawn-overlay", "dashed-series"],
    sourceNote: "Spacetime grid with train world lines and a blank student construction task.",
    panels: [
      {
        x: {
          label: "x",
          unit: "m",
          scale: "linear",
          domain: [-4, 10],
          ticks: [0, 5, 10],
          minorTickStep: 0.2,
          showArrow: true,
        },
        y: {
          label: "ct",
          unit: "m",
          scale: "linear",
          domain: [-2, 11],
          ticks: [0, 5, 10],
          minorTickStep: 0.2,
          showArrow: true,
        },
        series: [
          {
            kind: "analytical-curve",
            points: [
              { x: -1, y: -2 },
              { x: 5.5, y: 11 },
            ],
          },
          {
            kind: "analytical-curve",
            points: [
              { x: -3.5, y: -2 },
              { x: 3, y: 11 },
            ],
            styleRole: "construction",
            lineStyle: "dashed",
          },
          {
            kind: "analytical-curve",
            points: [
              { x: 2, y: -2 },
              { x: 8.5, y: 11 },
            ],
            styleRole: "construction",
            lineStyle: "dashed",
          },
        ],
        annotations: [
          { kind: "point-label", position: { x: 2, y: 4 }, label: "E" },
          { kind: "text", position: { x: -2.2, y: 0.2 }, label: "B" },
          { kind: "text", position: { x: 3.5, y: 0.2 }, label: "F" },
          { kind: "text", position: { x: 5.2, y: 10.2 }, label: "ct′" },
        ],
        showGrid: true,
      },
    ],
  },
  {
    id: "may25-tz3-hl-2-q3-source",
    sourceQuestionId: "q_9dd43d47bdbe3deb051a",
    sourceQuestion: "May 2025 TZ3 HL Paper 2 Q3",
    paper: "2",
    sourceCrops: [crop("assets/src_d155c696e37b77ffc666/p006_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["pressure-volume", "closed-cycle", "direction-arrows"],
    sourceNote: "Three-stage quantitative ideal-gas cycle with A, B and C states.",
    panels: [
      {
        x: {
          label: "volume",
          unit: "m³",
          scale: "linear",
          domain: [0, 0.012],
          ticks: [0, 0.005, 0.01],
          minorTickStep: 0.001,
        },
        y: {
          label: "pressure",
          unit: "10⁵ Pa",
          scale: "linear",
          domain: [0, 21],
          ticks: [0, 5, 10, 15, 20],
          minorTickStep: 1,
        },
        series: [
          {
            kind: "analytical-curve",
            points: sampled(0.001, 0.01, (volume) => 0.02 / volume),
            showDirection: true,
          },
          {
            kind: "analytical-curve",
            points: [
              { x: 0.01, y: 2 },
              { x: 0.01, y: 0.5 },
            ],
            showDirection: true,
          },
          {
            kind: "analytical-curve",
            points: sampled(0.01, 0.001, (volume) => 0.5 * (0.01 / volume) ** 1.6),
            showDirection: true,
          },
        ],
        annotations: [
          { kind: "point-label", position: { x: 0.001, y: 20 }, label: "A" },
          { kind: "point-label", position: { x: 0.01, y: 2 }, label: "B" },
          { kind: "point-label", position: { x: 0.01, y: 0.5 }, label: "C" },
        ],
        showGrid: true,
      },
    ],
  },
  {
    id: "may25-tz3-hl-2-q4-source",
    sourceQuestionId: "q_ccf7f724100ba982fa50",
    sourceQuestion: "May 2025 TZ3 HL Paper 2 Q4",
    paper: "2",
    sourceCrops: [`${REPAIRS}may25-tz3-hl-p2-q4-waves.png`],
    sourceEvidence: "derived-page-crop",
    capabilities: ["multiple-panels", "quantitative-waveforms"],
    sourceNote: "HL version of the two sound-wave plots.",
    auditCorrection:
      "The mined crop showed the later car diagram. A clean graph crop was derived non-destructively from PDF page 8; the waveforms are separate panels, not multiple series on one plot.",
    panels: soundWavePanels,
    panelLabels: ["Graph 1", "Graph 2"],
    columns: 1,
    compositionKind: "sequence",
  },
  {
    id: "nov25-tz3-sl-2-q5-source",
    sourceQuestionId: "q_85022a23e765b1768df0",
    sourceQuestion: "November 2025 TZ3 SL Paper 2 Q5",
    paper: "2",
    sourceCrops: [crop("assets/src_a8e0518f50610843217e/p016_v02.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["waveform", "student-drawn-overlay"],
    sourceNote: "Displacement of atom P; the requested curve for atom Q remains absent from the student SVG.",
    auditCorrection:
      "The second mined visual is the only Cartesian plot. The rod diagram and plot are not a multi-panel Cartesian composition.",
    panels: [standingWaveStudentPanel],
  },
  {
    id: "nov25-tz3-hl-2-q9-source",
    sourceQuestionId: "q_9edcd1c45851ed9df2be",
    sourceQuestion: "November 2025 TZ3 HL Paper 2 Q9",
    paper: "2",
    sourceCrops: [crop("assets/src_a8e0518f50610843217e/p016_v02.png")],
    sourceEvidence: "canonical-duplicate-crop",
    capabilities: ["waveform", "student-drawn-overlay"],
    sourceNote: "HL duplicate of the atom-P displacement plot; canonical clean crop comes from the identical SL stem.",
    auditCorrection:
      "The question is a duplicated stem and its own automatic second crop is blank. It does not add a second Cartesian template.",
    panels: [standingWaveStudentPanel],
  },
  {
    id: "may26-tz1-hl-2-q5-source",
    sourceQuestionId: "q_aa520a901844e276bf7a",
    sourceQuestion: "May 2026 TZ1 HL Paper 2 Q5",
    paper: "2",
    sourceCrops: [crop("assets/src_0386c1ec35efa9b6cda6/p011_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["pressure-volume", "closed-cycle", "direction-arrows", "annotations"],
    sourceNote: "Qualitative Carnot cycle with four labelled states and directed processes.",
    panels: [
      {
        x: qualitativeAxis("volume"),
        y: qualitativeAxis("pressure"),
        series: [
          {
            kind: "analytical-curve",
            points: sampled(8, 4, (volume) => 17.6 / volume),
            showDirection: true,
          },
          {
            kind: "analytical-curve",
            points: sampled(
              4,
              3,
              (volume) => (17.6 / 4) * (4 / volume) ** 1.71,
            ),
            showDirection: true,
          },
          {
            kind: "analytical-curve",
            points: sampled(3, 5, (volume) => 21.6 / volume),
            showDirection: true,
          },
          {
            kind: "analytical-curve",
            points: sampled(
              5,
              8,
              (volume) => (21.6 / 5) * (5 / volume) ** 1.43,
            ),
            showDirection: true,
          },
        ],
        annotations: [
          { kind: "point-label", position: { x: 8, y: 2.2 }, label: "A" },
          {
            kind: "point-label",
            position: { x: 4, y: 17.6 / 4 },
            label: "B",
          },
          { kind: "point-label", position: { x: 3, y: 7.2 }, label: "C" },
          { kind: "point-label", position: { x: 5, y: 4.32 }, label: "D" },
        ],
      },
    ],
  },
  {
    id: "may26-tz1-hl-2-q9-source",
    sourceQuestionId: "q_73bbdbfeb32226d6e68a",
    sourceQuestion: "May 2026 TZ1 HL Paper 2 Q9",
    paper: "2",
    sourceCrops: [crop("assets/src_0386c1ec35efa9b6cda6/p029_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["blank-student-plot", "qualitative-axes", "answer-privacy"],
    sourceNote: "Blank axes for a student-drawn electric-potential curve.",
    auditCorrection:
      "The source visual is blank student axes. The expected inverse-distance curve and its gradient belong only in the teacher solution.",
    panels: [
      {
        x: qualitativeAxis("r"),
        y: qualitativeAxis("Vₑ"),
        series: [],
      },
    ],
  },
  {
    id: "may26-tz2-sl-2-q6-source",
    sourceQuestionId: "q_e9c050333a4e1b7279bc",
    sourceQuestion: "May 2026 TZ2 SL Paper 2 Q6",
    paper: "2",
    sourceCrops: [crop("assets/src_9fc970b2371569631f07/p011_v01.png")],
    sourceEvidence: "mined-crop",
    capabilities: ["quantitative-axis", "smooth-curve", "student-marker-task"],
    sourceNote: "Binding energy per nucleon against nucleon number; the requested X is intentionally absent.",
    auditCorrection:
      "This is not radioactive decay or an asymptote plot; it rises to a maximum and then declines slowly.",
    panels: [
      {
        x: {
          label: "nucleon number A",
          scale: "linear",
          domain: [0, 240],
          ticks: [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240],
          showArrow: true,
        },
        y: {
          label: "binding energy per nucleon",
          scale: "linear",
          domain: [0, 10],
          ticks: [],
          showArrow: true,
        },
        series: [
          {
            kind: "analytical-curve",
            points: sampled(
              0,
              240,
              (massNumber) =>
                8.8 * (1 - Math.exp(-massNumber / 8)) -
                0.014 * Math.max(0, massNumber - 55),
            ),
          },
        ],
      },
    ],
  },
];

export const CARTESIAN_EXPANSION_FIXTURES: readonly CartesianExpansionFixture[] =
  fixtures.map(buildFixture);
