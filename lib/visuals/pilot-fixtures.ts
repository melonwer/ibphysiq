import { CartesianPlotData } from "./render-cartesian";
import { Point2D, VISUAL_SCHEMA_VERSION, VisualSpec } from "./types";

export interface PilotCheck {
  kind:
    | "area-speed"
    | "mean-force"
    | "dissipated-energy"
    | "harmonic-speed"
    | "work-speed"
    | "terminal-drag-speed"
    | "spring-max-speed"
    | "harmonic-max-acceleration";
  expected: number;
  tolerance: number;
  unit: string;
  inputs: Record<string, number>;
}

export interface PilotFixture {
  id: string;
  sourceQuestionId: string;
  paper: "1A" | "2";
  sourceCrop: string;
  markschemeSourceId: string;
  markschemePdf: string;
  markschemePage: number;
  sourceNote: string;
  spec: VisualSpec<"cartesian_plot">;
  data: CartesianPlotData;
  check: PilotCheck;
}

const linspace = (start: number, end: number, count = 161): number[] =>
  Array.from(
    { length: count },
    (_, index) => start + ((end - start) * index) / (count - 1),
  );

const sampled = (
  start: number,
  end: number,
  ordinate: (x: number) => number,
): Point2D[] => linspace(start, end).map((x) => ({ x, y: ordinate(x) }));

function plot(
  id: string,
  x: {
    label: string;
    unit?: string;
    domain: [number, number];
    ticks: number[];
    minor?: number;
  },
  y: {
    label: string;
    unit?: string;
    domain: [number, number];
    ticks: number[];
    minor?: number;
    tickLabels?: Record<string, string>;
  },
  hasSeries = true,
  showGrid = true,
  aspectRatio?: number,
): VisualSpec<"cartesian_plot"> {
  return {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    id,
    family: "cartesian_plot",
    templateId: "plot.cartesian.v1",
    scenarioRef: id,
    coordinateSpace: "cartesian",
    payload: {
      xAxis: {
        id: `${id}-x`,
        label: x.label,
        unit: x.unit,
        scale: "linear",
        domain: x.domain,
        tickStrategy: "source-matched",
        tickValues: x.ticks,
        minorTickStep: x.minor,
      },
      yAxis: {
        id: `${id}-y`,
        label: y.label,
        unit: y.unit,
        scale: "linear",
        domain: y.domain,
        tickStrategy: "source-matched",
        tickValues: y.ticks,
        minorTickStep: y.minor,
        tickLabels: y.tickLabels,
      },
      series: hasSeries
        ? [
            {
              id: `${id}-series`,
              kind: "analytical-curve",
              xParameterId: `${id}-x`,
              yParameterId: `${id}-y`,
              dataRef: `${id}-data`,
              styleRole: "primary",
            },
          ]
        : [],
      showGrid,
    },
    visibility: {
      publicParameterIds: [
        `${id}-x`,
        `${id}-y`,
        ...(hasSeries ? [`${id}-data`] : []),
      ],
      privateParameterIds: [`${id}-answer`],
      labelMode: "allowlist",
      altTextMode: "student-safe",
    },
    layoutHints: aspectRatio === undefined ? undefined : { aspectRatio },
    provenance: { rendererVersion: "cartesian-svg/0.1.0" },
  };
}

const base = "dataset/_derived/paper-mining-v0.1/";
const may25 =
  "dataset/2025 Examination Session/May 2025 Examination Session/files and resources/Experimental sciences/";
const nov25 =
  "dataset/2025 Examination Session/November 2025 Examination Session/files and resources/Experimental sciences/";
const may26 =
  "dataset/2026 Examination Session/May 2026 Examination Session/files and resources/Experimental sciences/";

export const CARTESIAN_PILOT_FIXTURES: readonly PilotFixture[] = [
  {
    id: "may25-tz1-hl-1a-q2",
    sourceQuestionId: "q_02c69313113ef121a893",
    paper: "1A",
    sourceCrop: `${base}assets/src_b05dc046d8866ece9f01/p002_v01.png`,
    markschemeSourceId: "src_20d37bf55c41880ae819",
    markschemePdf: `${may25}Physics_paper_1A_TZ1_HL_markscheme.pdf`,
    markschemePage: 1,
    sourceNote: "Acceleration–time triangle; marked B (32 m/s).",
    spec: plot(
      "may25-tz1-hl-1a-q2",
      {
        label: "t",
        unit: "s",
        domain: [0, 10],
        ticks: [0, 2, 4, 6, 8, 10],
        minor: 0.4,
      },
      {
        label: "a",
        unit: "m s⁻²",
        domain: [0, 10],
        ticks: [0, 2, 4, 6, 8, 10],
        minor: 0.4,
      },
      true,
      true,
      1,
    ),
    data: {
      "may25-tz1-hl-1a-q2-data": [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    },
    check: {
      kind: "area-speed",
      expected: 32,
      tolerance: 0.01,
      unit: "m/s",
      inputs: { end: 8 },
    },
  },
  {
    id: "nov25-tz3-hl-1a-q3",
    sourceQuestionId: "q_2d6e74ca22bdf226f98b",
    paper: "1A",
    sourceCrop: `${base}assets/src_cc6825c9bc4a3c008f1a/p002_v01.png`,
    markschemeSourceId: "src_c483c76f42d738469cdf",
    markschemePdf: `${nov25}Physics_paper_1A_TZ3_HL_markscheme.pdf`,
    markschemePage: 1,
    sourceNote: "Piecewise acceleration–time graph; marked B (6 N).",
    spec: plot(
      "nov25-tz3-hl-1a-q3",
      {
        label: "t",
        unit: "s",
        domain: [0, 6],
        ticks: [0, 2, 4, 6],
        minor: 0.4,
      },
      {
        label: "a",
        unit: "m s⁻²",
        domain: [0, 5],
        ticks: [0, 1, 2, 3, 4, 5],
        minor: 0.2,
      },
      true,
      true,
      0.6,
    ),
    data: {
      "nov25-tz3-hl-1a-q3-data": [
        { x: 0, y: 1 },
        { x: 2, y: 1 },
        { x: 6, y: 4 },
      ],
    },
    check: {
      kind: "mean-force",
      expected: 6,
      tolerance: 0.01,
      unit: "N",
      inputs: { start: 0, end: 6, mass: 3 },
    },
  },
  {
    id: "may26-tz2-hl-1a-q7",
    sourceQuestionId: "q_0269ede5adfa4dbb1028",
    paper: "1A",
    sourceCrop: `${base}assets/src_35c32668e012ab7e7601/p005_v01.png`,
    markschemeSourceId: "src_bb4cfecc321a8497ab76",
    markschemePdf: `${may26}Physics_paper_1A_TZ2_HL_markscheme.pdf`,
    markschemePage: 1,
    sourceNote: "Negative acceleration–distance graph; marked C (120 kJ).",
    spec: plot(
      "may26-tz2-hl-1a-q7",
      {
        label: "d",
        unit: "m",
        domain: [0, 45],
        ticks: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45],
      },
      {
        label: "a",
        unit: "m s⁻²",
        domain: [-5, 1],
        ticks: [-5, -4, -3, -2, -1, 0, 1],
      },
    ),
    data: {
      "may26-tz2-hl-1a-q7-data": [
        { x: 10, y: 0 },
        { x: 10, y: -2 },
        { x: 20, y: -2 },
        { x: 40, y: -4 },
        { x: 40, y: 0 },
      ],
    },
    check: {
      kind: "dissipated-energy",
      expected: 120,
      tolerance: 0.01,
      unit: "kJ",
      inputs: { start: 10, end: 40, mass: 1500 },
    },
  },
  {
    id: "may26-tz1-hl-1a-q19",
    sourceQuestionId: "q_627125190ef8b819ab04",
    paper: "1A",
    sourceCrop: `${base}assets/src_07cc74f1fb5cb120bf37/p010_v01.png`,
    markschemeSourceId: "src_616433af16830177b2da",
    markschemePdf: `${may26}Physics_paper_1A_TZ1_HL_markscheme.pdf`,
    markschemePage: 1,
    sourceNote: "Pendulum displacement–time wave; marked C (3.9 cm/s).",
    spec: plot(
      "may26-tz1-hl-1a-q19",
      {
        label: "t",
        unit: "s",
        domain: [0, 2],
        ticks: [0, 0.5, 1, 1.5, 2],
        minor: 0.1,
      },
      {
        label: "y",
        unit: "cm",
        domain: [-1.5, 1.5],
        ticks: [-1.5, -1, -0.5, 0, 0.5, 1, 1.5],
        minor: 0.1,
      },
    ),
    data: {
      "may26-tz1-hl-1a-q19-data": sampled(
        0,
        2,
        (t) => -1.2 * Math.sin((2 * Math.PI * t) / 1.8),
      ),
    },
    check: {
      kind: "harmonic-speed",
      expected: 3.9,
      tolerance: 0.12,
      unit: "cm/s",
      inputs: { amplitude: 1.2, period: 1.8, time: 1 },
    },
  },
  {
    id: "may25-tz1-hl-2-q1",
    sourceQuestionId: "q_264d0ad02f46ab7dbab8",
    paper: "2",
    sourceCrop: `${base}assets/src_06b087bbc8e1887cb3ca/p002_v01.png`,
    markschemeSourceId: "src_c6bf835e43426fdb64fe",
    markschemePdf: `${may25}Physics_paper_2_TZ1_HL_markscheme.pdf`,
    markschemePage: 2,
    sourceNote: "Force–distance work graph; scheme gives 2.4×10⁵ J and 17 m/s.",
    spec: plot(
      "may25-tz1-hl-2-q1",
      {
        label: "d",
        unit: "m",
        domain: [0, 100],
        ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
        minor: 2,
      },
      {
        label: "F",
        unit: "10³ N",
        domain: [0, 4],
        ticks: [0, 1, 2, 3, 4],
        minor: 0.2,
      },
    ),
    data: {
      "may25-tz1-hl-2-q1-data": [
        { x: 0, y: 3 },
        { x: 60, y: 3 },
        { x: 100, y: 0 },
      ],
    },
    check: {
      kind: "work-speed",
      expected: 17,
      tolerance: 0.4,
      unit: "m/s",
      inputs: { start: 0, end: 100, forceScale: 1000, mass: 1600 },
    },
  },
  {
    id: "nov25-tz1-hl-2-q1",
    sourceQuestionId: "q_37c4c9c24fd310ce4088",
    paper: "2",
    sourceCrop: `${base}assets/src_934551dd63d06ab53bc0/p002_v01.png`,
    markschemeSourceId: "src_d970eeeb18991d0ce889",
    markschemePdf: `${nov25}Physics_paper_2_TZ1_HL_markscheme.pdf`,
    markschemePage: 3,
    sourceNote:
      "Qualitative terminal-velocity curve; scheme gives about 2.2 m/s from buoyancy and drag.",
    spec: plot(
      "nov25-tz1-hl-2-q1",
      { label: "t", unit: "s", domain: [0, 6], ticks: [0, 1, 2, 3, 4, 5] },
      { label: "vertical velocity", domain: [0, 1.1], ticks: [] },
      true,
      false,
    ),
    data: {
      "nov25-tz1-hl-2-q1-data": sampled(0, 6, (t) => 1 - Math.exp(-t / 0.5)),
    },
    check: {
      kind: "terminal-drag-speed",
      expected: 2.2,
      tolerance: 0.1,
      unit: "m/s",
      inputs: {
        density: 1000,
        volume: 1.8e-7,
        gravity: 9.8,
        weight: 1.6e-3,
        viscosity: 1.1e-3,
        radius: 3.5e-3,
      },
    },
  },
  {
    id: "may25-tz1-hl-2-q9",
    sourceQuestionId: "q_3b01d94d7b3a68b51994",
    paper: "2",
    sourceCrop: `${base}assets/src_06b087bbc8e1887cb3ca/p020_v01.png`,
    markschemeSourceId: "src_c6bf835e43426fdb64fe",
    markschemePdf: `${may25}Physics_paper_2_TZ1_HL_markscheme.pdf`,
    markschemePage: 19,
    sourceNote:
      "Spring elastic-energy cycle; scheme gives maximum speed 0.83 m/s.",
    spec: plot(
      "may25-tz1-hl-2-q9",
      {
        label: "t",
        unit: "s",
        domain: [0, 0.8],
        ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        minor: 0.02,
      },
      {
        label: "Eₚ",
        unit: "10⁻² J",
        domain: [0, 30],
        ticks: [0, 5, 10, 15, 20, 25, 30],
        minor: 1,
      },
    ),
    data: {
      "may25-tz1-hl-2-q9-data": sampled(
        0,
        0.8,
        (t) =>
          100 *
          0.5 *
          7.4 *
          (0.159 + 0.106 * Math.cos((2 * Math.PI * t) / 0.8)) ** 2,
      ),
    },
    check: {
      kind: "spring-max-speed",
      expected: 0.83,
      tolerance: 0.02,
      unit: "m/s",
      inputs: {
        energyMin: 0.01,
        energyMax: 0.26,
        springConstant: 7.4,
        period: 0.8,
      },
    },
  },
  {
    id: "may26-tz1-hl-2-q6",
    sourceQuestionId: "q_66267378eb4d796bdf30",
    paper: "2",
    sourceCrop: `${base}assets/src_0386c1ec35efa9b6cda6/p016_v01.png`,
    markschemeSourceId: "src_e0fa1392f03ad16b0caa",
    markschemePdf: `${may26}Physics_paper_2_TZ1_HL_markscheme.pdf`,
    markschemePage: 7,
    sourceNote:
      "Student-facing blank kinetic-energy axes; expected sine-squared answer curve remains private. Scheme gives 111 m/s² for part b.",
    spec: plot(
      "may26-tz1-hl-2-q6",
      {
        label: "t",
        unit: "s",
        domain: [0, 0.8],
        ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        minor: 0.02,
      },
      {
        label: "kinetic energy",
        domain: [0, 1],
        ticks: [0, 1],
        minor: 0.05,
        tickLabels: { "1": "Eₜ" },
      },
      false,
    ),
    data: {},
    check: {
      kind: "harmonic-max-acceleration",
      expected: 111,
      tolerance: 1,
      unit: "m/s²",
      inputs: { amplitude: 0.45, angularFrequency: 15.7 },
    },
  },
];
