import {
  CircuitComponentSpec,
  CircuitNetworkPayload,
  CircuitNodeSpec,
  CircuitWireSpec,
  Point2D,
  VISUAL_SCHEMA_VERSION,
  VisualSpec,
} from "./types";

type NodeDefinition = Omit<CircuitNodeSpec, "labelParameterId"> & {
  position: Point2D;
};

type ComponentDefinition = Omit<CircuitComponentSpec, "labelParameterId">;

interface PanelDefinition {
  nodes: NodeDefinition[];
  wires: CircuitWireSpec[];
  components: ComponentDefinition[];
  componentLabelPositions?: CircuitNetworkPayload["layoutHints"] extends infer H
    ? H extends { componentLabelPositions?: infer P }
      ? P
      : never
    : never;
  nodeLabelPositions?: CircuitNetworkPayload["layoutHints"] extends infer H
    ? H extends { nodeLabelPositions?: infer P }
      ? P
      : never
    : never;
}

interface FixtureDefinition {
  id: string;
  sourceQuestionId: string;
  sourceQuestion: string;
  paper: "1A" | "2";
  sourceCrops: string[];
  capabilities: string[];
  sourceNote: string;
  panels: PanelDefinition[];
  panelLabels?: string[];
  columns?: number;
  compositionKind?: "panel-grid" | "sequence";
}

export interface CircuitSourceFixture {
  id: string;
  sourceQuestionId: string;
  sourceQuestion: string;
  paper: "1A" | "2";
  sourceCrops: string[];
  sourceEvidence: "mined-crop";
  capabilities: string[];
  sourceNote: string;
  trainingEligibility: "blocked";
  spec: VisualSpec<"circuit_network">;
}

const MINED = "dataset/_derived/paper-mining-v0.1/";
const crop = (path: string): string => `${MINED}${path}`;

const node = (
  id: string,
  x: number,
  y: number,
  kind: CircuitNodeSpec["kind"] = "terminal",
  label?: string,
): NodeDefinition => ({ id, kind, label, position: { x, y } });

const wire = (id: string, from: string, to: string): CircuitWireSpec => ({
  id,
  from,
  to,
});

const component = (
  id: string,
  kind: CircuitComponentSpec["kind"],
  from: string,
  to: string,
  label?: string,
  state?: CircuitComponentSpec["state"],
): ComponentDefinition => ({
  id,
  kind,
  terminals: [from, to],
  label,
  state,
});

function buildFixture(definition: FixtureDefinition): CircuitSourceFixture {
  const publicParameterIds: string[] = [];
  const payloads = definition.panels.map((panel, panelIndex) => {
    const prefix = `${definition.id}-p${panelIndex + 1}`;
    const nodePositions: Record<string, Point2D> = {};
    const nodes = panel.nodes.map((item): CircuitNodeSpec => {
      nodePositions[item.id] = item.position;
      const built: CircuitNodeSpec = {
        id: item.id,
        kind: item.kind,
        label: item.label,
      };
      if (item.label) {
        built.labelParameterId = `${prefix}-${item.id}-label`;
        publicParameterIds.push(built.labelParameterId);
      }
      return built;
    });
    const components = panel.components.map((item): CircuitComponentSpec => {
      const built: CircuitComponentSpec = { ...item };
      if (item.label) {
        built.labelParameterId = `${prefix}-${item.id}-label`;
        publicParameterIds.push(built.labelParameterId);
      }
      for (const binding of item.quantityBindings ?? []) {
        publicParameterIds.push(binding.parameterId);
      }
      return built;
    });
    return {
      nodes,
      wires: panel.wires,
      components,
      layoutHints: {
        nodePositions,
        componentLabelPositions: panel.componentLabelPositions,
        nodeLabelPositions: panel.nodeLabelPositions,
      },
    } satisfies CircuitNetworkPayload;
  });
  const composition =
    payloads.length === 1
      ? { kind: "single" as const }
      : {
          kind: definition.compositionKind ?? ("panel-grid" as const),
          columns: definition.columns,
          panelLabels: definition.panelLabels,
        };
  const spec: VisualSpec<"circuit_network"> = {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    id: definition.id,
    family: "circuit_network",
    templateId: "network.circuit.v1",
    scenarioRef: definition.sourceQuestionId,
    coordinateSpace: "network",
    payload: payloads[0],
    layers: payloads.slice(1).map((payload, index) => ({
      id: `${definition.id}-layer-${index + 2}`,
      family: "circuit_network",
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
      rendererVersion: "circuit-svg/0.1.0",
    },
  };
  return {
    id: definition.id,
    sourceQuestionId: definition.sourceQuestionId,
    sourceQuestion: definition.sourceQuestion,
    paper: definition.paper,
    sourceCrops: definition.sourceCrops,
    sourceEvidence: "mined-crop",
    capabilities: definition.capabilities,
    sourceNote: definition.sourceNote,
    trainingEligibility: "blocked",
    spec,
  };
}

const resistorNetworks: PanelDefinition[] = [
  {
    nodes: [
      node("left", 0.02, 0.5),
      node("n1", 0.22, 0.5),
      node("jl", 0.42, 0.5, "junction"),
      node("utl", 0.42, 0.22),
      node("utr", 0.78, 0.22),
      node("btl", 0.42, 0.78),
      node("btr", 0.78, 0.78),
      node("jr", 0.78, 0.5, "junction"),
      node("right", 0.98, 0.5),
    ],
    wires: [
      wire("w1", "jl", "utl"),
      wire("w2", "jl", "btl"),
      wire("w3", "utr", "jr"),
      wire("w4", "btr", "jr"),
      wire("w5", "jr", "right"),
    ],
    components: [
      component("r1", "resistor", "left", "n1"),
      component("r2", "resistor", "n1", "jl"),
      component("r3", "resistor", "utl", "utr"),
      component("r4", "resistor", "btl", "btr"),
    ],
  },
  {
    nodes: [
      node("left", 0.02, 0.5),
      node("jl", 0.27, 0.5, "junction"),
      node("utl", 0.27, 0.18),
      node("utr", 0.78, 0.18),
      node("mtl", 0.27, 0.5),
      node("mtr", 0.78, 0.5),
      node("btl", 0.27, 0.82),
      node("btr", 0.78, 0.82),
      node("jr", 0.78, 0.5, "junction"),
      node("right", 0.98, 0.5),
    ],
    wires: [
      wire("w1", "jl", "utl"),
      wire("w2", "jl", "mtl"),
      wire("w3", "jl", "btl"),
      wire("w4", "utr", "jr"),
      wire("w5", "mtr", "jr"),
      wire("w6", "btr", "jr"),
      wire("w7", "jr", "right"),
    ],
    components: [
      component("r1", "resistor", "left", "jl"),
      component("r2", "resistor", "utl", "utr"),
      component("r3", "resistor", "mtl", "mtr"),
      component("r4", "resistor", "btl", "btr"),
    ],
  },
  {
    nodes: [
      node("left", 0.02, 0.5),
      node("jl", 0.26, 0.5, "junction"),
      node("utl", 0.26, 0.2),
      node("utr", 0.82, 0.2),
      node("btl", 0.26, 0.67),
      node("btm", 0.52, 0.67),
      node("btr", 0.82, 0.67),
      node("jr", 0.82, 0.5, "junction"),
      node("right", 0.98, 0.5),
    ],
    wires: [
      wire("w1", "jl", "utl"),
      wire("w2", "jl", "btl"),
      wire("w3", "utr", "jr"),
      wire("w4", "btr", "jr"),
      wire("w5", "jr", "right"),
    ],
    components: [
      component("r1", "resistor", "left", "jl"),
      component("r2", "resistor", "utl", "utr"),
      component("r3", "resistor", "btl", "btm"),
      component("r4", "resistor", "btm", "btr"),
    ],
  },
];

const switchNetwork: PanelDefinition = {
  nodes: [
    node("top-left", 0.16, 0.16),
    node("top-right", 0.82, 0.16),
    node("left", 0.16, 0.57, "junction"),
    node("middle", 0.48, 0.57, "junction"),
    node("right", 0.82, 0.57),
    node("lower-left", 0.16, 0.86),
    node("lower-right", 0.48, 0.86),
  ],
  wires: [
    wire("w1", "top-left", "left"),
    wire("w2", "top-right", "right"),
    wire("w3", "lower-right", "middle"),
  ],
  components: [
    component("cell", "cell", "top-left", "top-right"),
    component("r1", "resistor", "left", "middle", "R₁"),
    component("r2", "resistor", "middle", "right", "R₂"),
    component("switch", "switch", "left", "lower-left", "S", "open"),
    component("r3", "resistor", "lower-left", "lower-right", "R₃"),
  ],
  componentLabelPositions: {
    r1: "below",
    r2: "below",
    r3: "below",
    switch: "left",
  },
};

const bypassNetwork: PanelDefinition = {
  nodes: [
    node("x", 0.02, 0.5, "terminal", "X"),
    node("a", 0.14, 0.5, "junction"),
    node("b", 0.38, 0.5, "junction"),
    node("c", 0.62, 0.5, "junction"),
    node("d", 0.86, 0.5, "junction"),
    node("y", 0.98, 0.5, "terminal", "Y"),
    node("top-a", 0.14, 0.2),
    node("top-c", 0.62, 0.2),
    node("bottom-b", 0.38, 0.8),
    node("bottom-d", 0.86, 0.8),
  ],
  wires: [
    wire("w1", "x", "a"),
    wire("w2", "d", "y"),
    wire("w3", "a", "top-a"),
    wire("w4", "top-a", "top-c"),
    wire("w5", "top-c", "c"),
    wire("w6", "b", "bottom-b"),
    wire("w7", "bottom-b", "bottom-d"),
    wire("w8", "bottom-d", "d"),
  ],
  components: [
    component("r1", "resistor", "a", "b", "6 Ω"),
    component("r2", "resistor", "b", "c", "6 Ω"),
    component("r3", "resistor", "c", "d", "6 Ω"),
  ],
  componentLabelPositions: { r1: "below", r2: "below", r3: "above" },
  nodeLabelPositions: { x: "left", y: "right" },
};

function lampPanel(failed: boolean): PanelDefinition {
  return {
    nodes: [
      node("left-top", 0.1, 0.2),
      node("left-bottom", 0.1, 0.8),
      node("x-top", 0.42, 0.2, "junction"),
      node("x-middle", 0.42, 0.5),
      node("x-bottom", 0.42, 0.8, "junction"),
      node("z-top", 0.68, 0.2, "junction"),
      node("z-bottom", 0.68, 0.8, "junction"),
      node("v-top", 0.9, 0.2),
      node("v-bottom", 0.9, 0.8),
    ],
    wires: [
      wire("w1", "x-top", "z-top"),
      wire("w2", "z-top", "v-top"),
      wire("w3", "left-bottom", "x-bottom"),
      wire("w4", "x-bottom", "z-bottom"),
      wire("w5", "z-bottom", "v-bottom"),
    ],
    components: [
      component("cell", "cell", "left-top", "left-bottom"),
      component("ammeter", "ammeter", "left-top", "x-top"),
      component("lamp-x", "lamp", "x-top", "x-middle", "X"),
      component("lamp-y", "lamp", "x-middle", "x-bottom", "Y"),
      component(
        "lamp-z",
        "lamp",
        "z-top",
        "z-bottom",
        "Z",
        failed ? "inactive" : "active",
      ),
      component("voltmeter", "voltmeter", "v-top", "v-bottom"),
    ],
    componentLabelPositions: {
      "lamp-x": "left",
      "lamp-y": "left",
      "lamp-z": "right",
    },
  };
}

const currentVoltageCircuit: PanelDefinition = {
  nodes: [
    node("left-top", 0.16, 0.2),
    node("left-bottom", 0.16, 0.8),
    node("top", 0.64, 0.2, "junction"),
    node("bottom", 0.64, 0.8, "junction"),
    node("v-top", 0.88, 0.2),
    node("v-bottom", 0.88, 0.8),
  ],
  wires: [wire("w1", "top", "v-top"), wire("w2", "bottom", "v-bottom")],
  components: [
    component("cell", "cell", "left-top", "left-bottom"),
    component("p", "resistor", "left-top", "top", "P"),
    component("q", "resistor", "top", "bottom", "Q"),
    component("ammeter", "ammeter", "bottom", "left-bottom"),
    component("voltmeter", "voltmeter", "v-top", "v-bottom"),
  ],
  componentLabelPositions: { p: "above", q: "right" },
};

const internalResistanceCircuit: PanelDefinition = {
  nodes: [
    node("left-top", 0.25, 0.14),
    node("right-top", 0.76, 0.14),
    node("left-mid", 0.25, 0.5, "junction"),
    node("right-mid", 0.76, 0.5, "junction"),
    node("left-bottom", 0.25, 0.84),
    node("right-bottom", 0.76, 0.84),
  ],
  wires: [
    wire("w1", "right-top", "right-mid"),
    wire("w2", "right-mid", "right-bottom"),
    wire("w3", "left-mid", "left-bottom"),
  ],
  components: [
    component("ammeter", "ammeter", "left-top", "left-mid"),
    component("cell", "cell", "left-top", "right-top"),
    component("voltmeter", "voltmeter", "left-mid", "right-mid"),
    component(
      "variable-resistor",
      "variable-resistor",
      "left-bottom",
      "right-bottom",
    ),
  ],
};

const ldrCircuit: PanelDefinition = {
  nodes: [
    node("left-top", 0.2, 0.17),
    node("right-top", 0.74, 0.17),
    node("left-mid", 0.2, 0.52, "junction"),
    node("right-mid", 0.74, 0.52, "junction"),
    node("left-bottom", 0.2, 0.84),
    node("right-bottom", 0.74, 0.84),
  ],
  wires: [
    wire("w1", "left-mid", "left-bottom"),
    wire("w2", "right-mid", "right-bottom"),
  ],
  components: [
    component("cell", "cell", "left-top", "left-mid", "9.0 V"),
    component("ldr", "ldr", "left-top", "right-top", "LDR"),
    component("ammeter", "ammeter", "right-top", "right-mid"),
    component("fixed-resistor", "resistor", "left-mid", "right-mid", "50 kΩ"),
    component("voltmeter", "voltmeter", "left-bottom", "right-bottom"),
  ],
  componentLabelPositions: {
    cell: "left",
    ldr: "below",
    "fixed-resistor": "below",
  },
};

const thermistorCircuit: PanelDefinition = {
  nodes: [
    node("top-left", 0.13, 0.14),
    node("top-right", 0.88, 0.14),
    node("left", 0.13, 0.58),
    node("middle", 0.46, 0.58, "junction"),
    node("right", 0.88, 0.58, "junction"),
    node("therm-left", 0.46, 0.34),
    node("therm-right", 0.88, 0.34),
    node("v-left", 0.46, 0.86),
    node("v-right", 0.88, 0.86),
  ],
  wires: [
    wire("w1", "top-left", "left"),
    wire("w2", "top-right", "right"),
    wire("w3", "middle", "therm-left"),
    wire("w4", "therm-right", "right"),
    wire("w5", "middle", "v-left"),
    wire("w6", "v-right", "right"),
  ],
  components: [
    component("battery", "battery", "top-left", "top-right", "emf = 12 V"),
    component("r1", "resistor", "left", "middle", "R₁ = 180 Ω"),
    component("r2", "resistor", "middle", "right", "R₂ = 240 Ω"),
    component("thermistor", "thermistor", "therm-left", "therm-right"),
    component("voltmeter", "voltmeter", "v-left", "v-right"),
  ],
  componentLabelPositions: {
    battery: "above",
    r1: "below",
    r2: "below",
  },
};

const definitions: FixtureDefinition[] = [
  {
    id: "may25-tz1-hl-1a-q14-circuit-source",
    sourceQuestionId: "q_56ee5730ce4806d73e6e",
    sourceQuestion: "May 2025 TZ1 HL Paper 1A Q14",
    paper: "1A",
    sourceCrops: [
      crop("assets/src_b05dc046d8866ece9f01/p008_v01.png"),
      crop("assets/src_b05dc046d8866ece9f01/p008_v02.png"),
      crop("assets/src_b05dc046d8866ece9f01/p008_v03.png"),
    ],
    capabilities: ["panel-grid", "series-parallel", "explicit-junctions"],
    sourceNote: "Three resistor networks labelled P, Q and R.",
    panels: resistorNetworks,
    panelLabels: ["P", "Q", "R"],
    columns: 1,
  },
  {
    id: "may25-tz3-hl-1a-q17-circuit-source",
    sourceQuestionId: "q_466d4fd9da4961ff4f41",
    sourceQuestion: "May 2025 TZ3 HL Paper 1A Q17",
    paper: "1A",
    sourceCrops: [crop("assets/src_111ea8ab4a35db2436ae/p008_v01.png")],
    capabilities: ["open-switch", "cell", "labelled-resistors"],
    sourceNote: "Open-switch network with one series and one parallel branch.",
    panels: [switchNetwork],
  },
  {
    id: "may25-tz3-hl-1a-q18-circuit-source",
    sourceQuestionId: "q_b74fc30572f0a2920bdd",
    sourceQuestion: "May 2025 TZ3 HL Paper 1A Q18",
    paper: "1A",
    sourceCrops: [crop("assets/src_111ea8ab4a35db2436ae/p009_v01.png")],
    capabilities: ["bypass-wires", "terminal-labels", "quantity-labels"],
    sourceNote: "Three 6 Ω resistors with upper and lower bypass connections.",
    panels: [bypassNetwork],
  },
  {
    id: "may26-tz2-hl-1a-q16-circuit-source",
    sourceQuestionId: "q_51680d0cd4c8b6343dab",
    sourceQuestion: "May 2026 TZ2 HL Paper 1A Q16",
    paper: "1A",
    sourceCrops: [
      crop("assets/src_35c32668e012ab7e7601/p009_v01.png"),
      crop("assets/src_35c32668e012ab7e7601/p009_v02.png"),
    ],
    capabilities: ["sequence", "lamps", "inactive-component", "meters"],
    sourceNote: "Before-and-after circuit when lamp Z burns out.",
    panels: [lampPanel(false), lampPanel(true)],
    panelLabels: ["initial", "Z burnt out"],
    columns: 2,
    compositionKind: "sequence",
  },
  {
    id: "may25-tz1-sl-2-q3-circuit-source",
    sourceQuestionId: "q_54c80db279d59785da58",
    sourceQuestion: "May 2025 TZ1 SL Paper 2 Q3",
    paper: "2",
    sourceCrops: [crop("assets/src_cb87fa290cf104cb52ae/p007_v01.png")],
    capabilities: ["ammeter", "voltmeter", "parallel-meter-branch"],
    sourceNote:
      "Components P and Q with an ammeter in series and voltmeter in parallel.",
    panels: [currentVoltageCircuit],
  },
  {
    id: "nov25-tz1-hl-2-q2-circuit-source",
    sourceQuestionId: "q_cf9c9d9e434d847ca84c",
    sourceQuestion: "November 2025 TZ1 HL Paper 2 Q2",
    paper: "2",
    sourceCrops: [crop("assets/src_934551dd63d06ab53bc0/p004_v01.png")],
    capabilities: ["variable-resistor", "ammeter", "voltmeter", "cell"],
    sourceNote:
      "Internal-resistance experiment with ideal meters and a variable resistor.",
    panels: [internalResistanceCircuit],
  },
  {
    id: "may26-tz1-hl-2-q2-circuit-source",
    sourceQuestionId: "q_dba820fc1fe247d8f096",
    sourceQuestion: "May 2026 TZ1 HL Paper 2 Q2",
    paper: "2",
    sourceCrops: [crop("assets/src_0386c1ec35efa9b6cda6/p004_v01.png")],
    capabilities: ["ldr", "ammeter", "voltmeter", "quantity-labels"],
    sourceNote: "LDR and 50 kΩ divider supplied by a 9.0 V cell.",
    panels: [ldrCircuit],
  },
  {
    id: "may26-tz3-hl-2-q1-circuit-source",
    sourceQuestionId: "q_8b1a93754de07e0b93e0",
    sourceQuestion: "May 2026 TZ3 HL Paper 2 Q1",
    paper: "2",
    sourceCrops: [crop("assets/src_88b42b05ad36a23a42bf/p002_v01.png")],
    capabilities: ["battery", "thermistor", "voltmeter", "quantity-labels"],
    sourceNote:
      "Thermistor network with two labelled fixed resistors and a voltmeter.",
    panels: [thermistorCircuit],
  },
];

export const CIRCUIT_SOURCE_FIXTURES: readonly CircuitSourceFixture[] =
  definitions.map(buildFixture);
