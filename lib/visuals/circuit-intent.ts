import {
  CircuitComponentSpec,
  CircuitNetworkPayload,
  CircuitNodeSpec,
  CircuitWireSpec,
  Point2D,
  VISUAL_SCHEMA_VERSION,
  VisualSpec,
} from "./types";

export const CIRCUIT_INTENT_SCHEMA_VERSION = "circuit-intent/0.1.0" as const;

export const CIRCUIT_INTENT_TEMPLATE_IDS = ["series-parallel.v1"] as const;

export type CircuitIntentTemplateId =
  (typeof CIRCUIT_INTENT_TEMPLATE_IDS)[number];

export type CircuitIntentDirection = "left-to-right" | "top-to-bottom";

export type CircuitIntentState =
  NonNullable<CircuitComponentSpec["state"]> | "failed-open";

export interface CircuitComponentIntent {
  type: "component";
  id: string;
  componentKind: CircuitComponentSpec["kind"];
  state?: CircuitIntentState;
  label?: string;
  labelPosition?: "above" | "below" | "left" | "right";
}

export interface CircuitWireIntent {
  type: "wire";
  id?: string;
}

export interface CircuitSeriesIntent {
  type: "series";
  items: CircuitTopologyIntent[];
}

export interface CircuitParallelIntent {
  type: "parallel";
  branches: CircuitTopologyIntent[];
}

export type CircuitTopologyIntent =
  | CircuitComponentIntent
  | CircuitWireIntent
  | CircuitSeriesIntent
  | CircuitParallelIntent;

export interface CircuitComponentOverride {
  state?: CircuitIntentState;
  label?: string;
  labelPosition?: "above" | "below" | "left" | "right";
}

export interface CircuitIntentPanel {
  id: string;
  label?: string;
  topology?: CircuitTopologyIntent;
  componentOverrides?: Record<string, CircuitComponentOverride>;
}

export interface CircuitTerminalLabels {
  start?: string;
  end?: string;
}

export interface CircuitIntent {
  schemaVersion: typeof CIRCUIT_INTENT_SCHEMA_VERSION;
  id: string;
  scenarioRef: string;
  templateId: CircuitIntentTemplateId;
  topology: CircuitTopologyIntent;
  layout?: {
    direction?: CircuitIntentDirection;
    terminalLabels?: CircuitTerminalLabels;
  };
  panels?: CircuitIntentPanel[];
  composition?: {
    kind: "panel-grid" | "sequence";
    columns?: number;
  };
  visibility?: {
    privateParameterIds?: string[];
    altTextMode?: "student-safe" | "teacher-complete";
  };
  provenance?: {
    sourceQuestionId?: string;
  };
}

export interface CircuitTopologyCompileOptions {
  idPrefix?: string;
  direction?: CircuitIntentDirection;
  terminalLabels?: CircuitTerminalLabels;
  componentOverrides?: Record<string, CircuitComponentOverride>;
}

export interface CircuitIntentValidationResult {
  valid: boolean;
  issues: string[];
}

const COMPONENT_KINDS: readonly CircuitComponentSpec["kind"][] = [
  "cell",
  "battery",
  "resistor",
  "variable-resistor",
  "thermistor",
  "ldr",
  "capacitor",
  "diode",
  "lamp",
  "switch",
  "ammeter",
  "voltmeter",
];

const COMPONENT_STATES: readonly CircuitIntentState[] = [
  "open",
  "closed",
  "active",
  "inactive",
  "failed-open",
];

const LABEL_POSITIONS = ["above", "below", "left", "right"] as const;
const MAX_TOPOLOGY_DEPTH = 8;
const MAX_COMPONENTS = 48;
const PARALLEL_GAP = 0.75;

export const CIRCUIT_INTENT_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ibphysiq.local/schema/circuit-intent-0.1.0.json",
  title: "IBPhysiq circuit intent",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "id", "scenarioRef", "templateId", "topology"],
  properties: {
    schemaVersion: { const: CIRCUIT_INTENT_SCHEMA_VERSION },
    id: { type: "string", minLength: 1 },
    scenarioRef: { type: "string", minLength: 1 },
    templateId: { enum: CIRCUIT_INTENT_TEMPLATE_IDS },
    topology: { $ref: "#/$defs/topology" },
    layout: {
      type: "object",
      additionalProperties: false,
      properties: {
        direction: { enum: ["left-to-right", "top-to-bottom"] },
        terminalLabels: {
          type: "object",
          additionalProperties: false,
          properties: {
            start: { type: "string", minLength: 1 },
            end: { type: "string", minLength: 1 },
          },
        },
      },
    },
    panels: {
      type: "array",
      minItems: 2,
      items: { $ref: "#/$defs/panel" },
    },
    composition: {
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: {
        kind: { enum: ["panel-grid", "sequence"] },
        columns: { type: "integer", minimum: 1 },
      },
    },
    visibility: {
      type: "object",
      additionalProperties: false,
      properties: {
        privateParameterIds: {
          type: "array",
          uniqueItems: true,
          items: { type: "string", minLength: 1 },
        },
        altTextMode: { enum: ["student-safe", "teacher-complete"] },
      },
    },
    provenance: {
      type: "object",
      additionalProperties: false,
      properties: {
        sourceQuestionId: { type: "string", minLength: 1 },
      },
    },
  },
  $defs: {
    component: {
      type: "object",
      additionalProperties: false,
      required: ["type", "id", "componentKind"],
      properties: {
        type: { const: "component" },
        id: { type: "string", minLength: 1 },
        componentKind: { enum: COMPONENT_KINDS },
        state: { enum: COMPONENT_STATES },
        label: { type: "string", minLength: 1 },
        labelPosition: { enum: LABEL_POSITIONS },
      },
    },
    wire: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: { const: "wire" },
        id: { type: "string", minLength: 1 },
      },
    },
    series: {
      type: "object",
      additionalProperties: false,
      required: ["type", "items"],
      properties: {
        type: { const: "series" },
        items: {
          type: "array",
          minItems: 2,
          items: { $ref: "#/$defs/topology" },
        },
      },
    },
    parallel: {
      type: "object",
      additionalProperties: false,
      required: ["type", "branches"],
      properties: {
        type: { const: "parallel" },
        branches: {
          type: "array",
          minItems: 2,
          items: { $ref: "#/$defs/topology" },
        },
      },
    },
    topology: {
      oneOf: [
        { $ref: "#/$defs/component" },
        { $ref: "#/$defs/wire" },
        { $ref: "#/$defs/series" },
        { $ref: "#/$defs/parallel" },
      ],
    },
    override: {
      type: "object",
      additionalProperties: false,
      properties: {
        state: { enum: COMPONENT_STATES },
        label: { type: "string", minLength: 1 },
        labelPosition: { enum: LABEL_POSITIONS },
      },
    },
    panel: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", minLength: 1 },
        label: { type: "string", minLength: 1 },
        topology: { $ref: "#/$defs/topology" },
        componentOverrides: {
          type: "object",
          additionalProperties: { $ref: "#/$defs/override" },
        },
      },
    },
  },
} as const;

interface Size {
  width: number;
  height: number;
}

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface DraftNode {
  id: string;
  position: Point2D;
  label?: string;
  labelParameterId?: string;
}

interface DraftContext {
  idPrefix: string;
  nodes: DraftNode[];
  wires: CircuitWireSpec[];
  components: CircuitComponentSpec[];
  componentLabelPositions: NonNullable<
    CircuitNetworkPayload["layoutHints"]
  >["componentLabelPositions"];
  nodeLabelPositions: NonNullable<
    CircuitNetworkPayload["layoutHints"]
  >["nodeLabelPositions"];
  nodeCounter: number;
  wireCounter: number;
  explicitWireIds: Set<string>;
  overrides: Record<string, CircuitComponentOverride>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  return value;
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw new Error(`${path}.${unexpected} is not supported`);
}

function assertStateForKind(
  kind: CircuitComponentSpec["kind"],
  state: CircuitIntentState | undefined,
  path: string,
): void {
  if (!state) return;
  if (!COMPONENT_STATES.includes(state)) {
    throw new Error(`${path} has an unsupported value`);
  }
  if (kind === "switch" && state !== "open" && state !== "closed") {
    throw new Error(`${path} for a switch must be open or closed`);
  }
  if (
    kind === "lamp" &&
    state !== "active" &&
    state !== "inactive" &&
    state !== "failed-open"
  ) {
    throw new Error(
      `${path} for a lamp must be active, inactive, or failed-open`,
    );
  }
  if (kind !== "switch" && kind !== "lamp") {
    throw new Error(`${path} is only supported for switches and lamps`);
  }
}

function assertLabelPosition(value: unknown, path: string): void {
  if (
    value !== undefined &&
    !LABEL_POSITIONS.includes(value as (typeof LABEL_POSITIONS)[number])
  ) {
    throw new Error(`${path} has an unsupported label position`);
  }
}

function assertOverride(
  value: unknown,
  componentKind: CircuitComponentSpec["kind"],
  path: string,
): void {
  const override = requireRecord(value, path);
  assertAllowedKeys(override, ["state", "label", "labelPosition"], path);
  if (override.label !== undefined)
    requireNonEmptyString(override.label, `${path}.label`);
  assertLabelPosition(override.labelPosition, `${path}.labelPosition`);
  assertStateForKind(
    componentKind,
    override.state as CircuitIntentState | undefined,
    `${path}.state`,
  );
}

interface TopologyFacts {
  componentKinds: Map<string, CircuitComponentSpec["kind"]>;
  wireIds: Set<string>;
  componentCount: number;
}

function assertTopology(
  value: unknown,
  path: string,
  depth = 0,
  facts: TopologyFacts = {
    componentKinds: new Map(),
    wireIds: new Set(),
    componentCount: 0,
  },
): TopologyFacts {
  if (depth > MAX_TOPOLOGY_DEPTH) {
    throw new Error(`${path} exceeds the maximum topology depth`);
  }
  const topology = requireRecord(value, path);
  const type = topology.type;
  if (type === "component") {
    assertAllowedKeys(
      topology,
      ["type", "id", "componentKind", "state", "label", "labelPosition"],
      path,
    );
    const id = requireNonEmptyString(topology.id, `${path}.id`);
    const kind = topology.componentKind as CircuitComponentSpec["kind"];
    if (!COMPONENT_KINDS.includes(kind)) {
      throw new Error(`${path}.componentKind is not supported`);
    }
    if (facts.componentKinds.has(id)) {
      throw new Error(`Duplicate circuit component ID: ${id}`);
    }
    facts.componentKinds.set(id, kind);
    facts.componentCount += 1;
    if (facts.componentCount > MAX_COMPONENTS) {
      throw new Error(`Circuit intent exceeds ${MAX_COMPONENTS} components`);
    }
    assertStateForKind(
      kind,
      topology.state as CircuitIntentState | undefined,
      `${path}.state`,
    );
    if (topology.label !== undefined) {
      requireNonEmptyString(topology.label, `${path}.label`);
    }
    assertLabelPosition(topology.labelPosition, `${path}.labelPosition`);
    return facts;
  }
  if (type === "wire") {
    assertAllowedKeys(topology, ["type", "id"], path);
    if (topology.id !== undefined) {
      const id = requireNonEmptyString(topology.id, `${path}.id`);
      if (facts.wireIds.has(id))
        throw new Error(`Duplicate circuit wire ID: ${id}`);
      facts.wireIds.add(id);
    }
    return facts;
  }
  if (type === "series" || type === "parallel") {
    const key = type === "series" ? "items" : "branches";
    assertAllowedKeys(topology, ["type", key], path);
    const children = topology[key];
    if (!Array.isArray(children) || children.length < 2) {
      throw new Error(`${path}.${key} must contain at least two entries`);
    }
    children.forEach((child, index) =>
      assertTopology(child, `${path}.${key}[${index}]`, depth + 1, facts),
    );
    return facts;
  }
  throw new Error(`${path}.type is not supported`);
}

function assertIntent(value: unknown): asserts value is CircuitIntent {
  const intent = requireRecord(value, "intent");
  assertAllowedKeys(
    intent,
    [
      "schemaVersion",
      "id",
      "scenarioRef",
      "templateId",
      "topology",
      "layout",
      "panels",
      "composition",
      "visibility",
      "provenance",
    ],
    "intent",
  );
  if (intent.schemaVersion !== CIRCUIT_INTENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported circuit intent schema version: ${String(intent.schemaVersion)}`,
    );
  }
  requireNonEmptyString(intent.id, "intent.id");
  requireNonEmptyString(intent.scenarioRef, "intent.scenarioRef");
  if (
    !CIRCUIT_INTENT_TEMPLATE_IDS.includes(
      intent.templateId as CircuitIntentTemplateId,
    )
  ) {
    throw new Error(
      `Unsupported circuit intent template: ${String(intent.templateId)}`,
    );
  }
  const baseFacts = assertTopology(intent.topology, "intent.topology");
  if (baseFacts.componentCount === 0) {
    throw new Error("Circuit intent needs at least one component");
  }

  if (intent.layout !== undefined) {
    const layout = requireRecord(intent.layout, "intent.layout");
    assertAllowedKeys(layout, ["direction", "terminalLabels"], "intent.layout");
    if (
      layout.direction !== undefined &&
      layout.direction !== "left-to-right" &&
      layout.direction !== "top-to-bottom"
    ) {
      throw new Error("intent.layout.direction is not supported");
    }
    if (layout.terminalLabels !== undefined) {
      const labels = requireRecord(
        layout.terminalLabels,
        "intent.layout.terminalLabels",
      );
      assertAllowedKeys(
        labels,
        ["start", "end"],
        "intent.layout.terminalLabels",
      );
      if (labels.start !== undefined) {
        requireNonEmptyString(
          labels.start,
          "intent.layout.terminalLabels.start",
        );
      }
      if (labels.end !== undefined) {
        requireNonEmptyString(labels.end, "intent.layout.terminalLabels.end");
      }
    }
  }

  const panelIds = new Set<string>();
  if (intent.panels !== undefined) {
    if (!Array.isArray(intent.panels) || intent.panels.length < 2) {
      throw new Error("intent.panels must contain at least two panels");
    }
    let labelledPanels = 0;
    intent.panels.forEach((value, index) => {
      const path = `intent.panels[${index}]`;
      const panel = requireRecord(value, path);
      assertAllowedKeys(
        panel,
        ["id", "label", "topology", "componentOverrides"],
        path,
      );
      const panelId = requireNonEmptyString(panel.id, `${path}.id`);
      if (panelIds.has(panelId))
        throw new Error(`Duplicate circuit panel ID: ${panelId}`);
      panelIds.add(panelId);
      if (panel.label !== undefined) {
        requireNonEmptyString(panel.label, `${path}.label`);
        labelledPanels += 1;
      }
      const facts =
        panel.topology !== undefined
          ? assertTopology(panel.topology, `${path}.topology`)
          : baseFacts;
      if (facts.componentCount === 0) {
        throw new Error(`${path} needs at least one component`);
      }
      if (panel.componentOverrides !== undefined) {
        const overrides = requireRecord(
          panel.componentOverrides,
          `${path}.componentOverrides`,
        );
        for (const [componentId, override] of Object.entries(overrides)) {
          const kind = facts.componentKinds.get(componentId);
          if (!kind) {
            throw new Error(
              `${path}.componentOverrides references unknown component: ${componentId}`,
            );
          }
          assertOverride(
            override,
            kind,
            `${path}.componentOverrides.${componentId}`,
          );
        }
      }
    });
    if (labelledPanels > 0 && labelledPanels !== intent.panels.length) {
      throw new Error(
        "Circuit intent panels must either all have labels or none have labels",
      );
    }
  }

  if (intent.composition !== undefined) {
    if (!intent.panels) {
      throw new Error("Circuit intent composition requires panels");
    }
    const composition = requireRecord(intent.composition, "intent.composition");
    assertAllowedKeys(composition, ["kind", "columns"], "intent.composition");
    if (composition.kind !== "panel-grid" && composition.kind !== "sequence") {
      throw new Error("intent.composition.kind is not supported");
    }
    if (
      composition.columns !== undefined &&
      (!Number.isInteger(composition.columns) ||
        (composition.columns as number) < 1 ||
        (composition.columns as number) > intent.panels.length)
    ) {
      throw new Error("intent.composition.columns is outside the panel count");
    }
  }

  if (intent.visibility !== undefined) {
    const visibility = requireRecord(intent.visibility, "intent.visibility");
    assertAllowedKeys(
      visibility,
      ["privateParameterIds", "altTextMode"],
      "intent.visibility",
    );
    if (visibility.privateParameterIds !== undefined) {
      if (!Array.isArray(visibility.privateParameterIds)) {
        throw new Error(
          "intent.visibility.privateParameterIds must be an array",
        );
      }
      const ids = visibility.privateParameterIds.map((id, index) =>
        requireNonEmptyString(
          id,
          `intent.visibility.privateParameterIds[${index}]`,
        ),
      );
      if (new Set(ids).size !== ids.length) {
        throw new Error("Circuit private parameter IDs must be unique");
      }
    }
    if (
      visibility.altTextMode !== undefined &&
      visibility.altTextMode !== "student-safe" &&
      visibility.altTextMode !== "teacher-complete"
    ) {
      throw new Error("intent.visibility.altTextMode is not supported");
    }
  }

  if (intent.provenance !== undefined) {
    const provenance = requireRecord(intent.provenance, "intent.provenance");
    assertAllowedKeys(provenance, ["sourceQuestionId"], "intent.provenance");
    if (provenance.sourceQuestionId !== undefined) {
      requireNonEmptyString(
        provenance.sourceQuestionId,
        "intent.provenance.sourceQuestionId",
      );
    }
  }
}

export function validateCircuitIntent(
  value: unknown,
): CircuitIntentValidationResult {
  try {
    assertIntent(value);
    return { valid: true, issues: [] };
  } catch (error) {
    return {
      valid: false,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function measureTopology(topology: CircuitTopologyIntent): Size {
  if (topology.type === "component" || topology.type === "wire") {
    return { width: topology.type === "wire" ? 1.5 : 2, height: 1 };
  }
  if (topology.type === "series") {
    const sizes = topology.items.map(measureTopology);
    return {
      width: sizes.reduce((total, size) => total + size.width, 0),
      height: Math.max(...sizes.map((size) => size.height)),
    };
  }
  const sizes = topology.branches.map(measureTopology);
  return {
    width: Math.max(...sizes.map((size) => size.width)),
    height:
      sizes.reduce((total, size) => total + size.height, 0) +
      PARALLEL_GAP * (sizes.length - 1),
  };
}

function addNode(context: DraftContext, position: Point2D): string {
  const id = `${context.idPrefix}-node-${++context.nodeCounter}`;
  context.nodes.push({ id, position });
  return id;
}

function addWire(
  context: DraftContext,
  from: string,
  to: string,
  requestedId?: string,
): void {
  if (from === to) return;
  const id = requestedId ?? `${context.idPrefix}-wire-${++context.wireCounter}`;
  if (context.explicitWireIds.has(id)) {
    throw new Error(`Duplicate compiled circuit wire ID: ${id}`);
  }
  context.explicitWireIds.add(id);
  context.wires.push({ id, from, to });
}

function mapState(
  state: CircuitIntentState | undefined,
): CircuitComponentSpec["state"] {
  return state === "failed-open" ? "inactive" : state;
}

function layoutTopology(
  topology: CircuitTopologyIntent,
  bounds: Bounds,
  startNode: string,
  endNode: string,
  context: DraftContext,
): void {
  if (topology.type === "component") {
    const override = context.overrides[topology.id];
    const label = override?.label ?? topology.label;
    const component: CircuitComponentSpec = {
      id: topology.id,
      kind: topology.componentKind,
      terminals: [startNode, endNode],
      state: mapState(override?.state ?? topology.state),
      label,
    };
    if (label) {
      component.labelParameterId = `${context.idPrefix}-${topology.id}-label`;
    }
    context.components.push(component);
    const labelPosition = override?.labelPosition ?? topology.labelPosition;
    if (labelPosition) {
      context.componentLabelPositions![topology.id] = labelPosition;
    }
    return;
  }
  if (topology.type === "wire") {
    addWire(context, startNode, endNode, topology.id);
    return;
  }
  if (topology.type === "series") {
    const sizes = topology.items.map(measureTopology);
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    const totalWidth = sizes.reduce((total, size) => total + size.width, 0);
    const maxHeight = Math.max(...sizes.map((size) => size.height));
    let x = bounds.left;
    let currentNode = startNode;
    topology.items.forEach((item, index) => {
      const itemWidth = (width * sizes[index].width) / totalWidth;
      const nextX =
        index === topology.items.length - 1 ? bounds.right : x + itemWidth;
      const childHeight = (height * sizes[index].height) / maxHeight;
      const centreY = (bounds.top + bounds.bottom) / 2;
      const childBounds: Bounds = {
        left: x,
        right: nextX,
        top: centreY - childHeight / 2,
        bottom: centreY + childHeight / 2,
      };
      const nextNode =
        index === topology.items.length - 1
          ? endNode
          : addNode(context, { x: nextX, y: centreY });
      layoutTopology(item, childBounds, currentNode, nextNode, context);
      currentNode = nextNode;
      x = nextX;
    });
    return;
  }

  const sizes = topology.branches.map(measureTopology);
  const totalHeight =
    sizes.reduce((total, size) => total + size.height, 0) +
    PARALLEL_GAP * (sizes.length - 1);
  const availableHeight = bounds.bottom - bounds.top;
  const gap = (availableHeight * PARALLEL_GAP) / totalHeight;
  const leftRail: Array<{ id: string; y: number }> = [
    { id: startNode, y: (bounds.top + bounds.bottom) / 2 },
  ];
  const rightRail: Array<{ id: string; y: number }> = [
    { id: endNode, y: (bounds.top + bounds.bottom) / 2 },
  ];
  let y = bounds.top;
  const branchLayouts = topology.branches.map((branch, index) => {
    const branchHeight = (availableHeight * sizes[index].height) / totalHeight;
    const branchTop = y;
    const branchBottom = y + branchHeight;
    const branchY = (branchTop + branchBottom) / 2;
    const start =
      Math.abs(branchY - leftRail[0].y) < 1e-8
        ? startNode
        : addNode(context, { x: bounds.left, y: branchY });
    const end =
      Math.abs(branchY - rightRail[0].y) < 1e-8
        ? endNode
        : addNode(context, { x: bounds.right, y: branchY });
    leftRail.push({ id: start, y: branchY });
    rightRail.push({ id: end, y: branchY });
    y = branchBottom + gap;
    return {
      branch,
      bounds: {
        left: bounds.left,
        right: bounds.right,
        top: branchTop,
        bottom: branchBottom,
      },
      start,
      end,
    };
  });

  const connectRail = (rail: Array<{ id: string; y: number }>): void => {
    const ordered = [
      ...new Map(rail.map((item) => [item.id, item])).values(),
    ].sort((a, b) => a.y - b.y);
    for (let index = 1; index < ordered.length; index += 1) {
      addWire(context, ordered[index - 1].id, ordered[index].id);
    }
  };
  connectRail(leftRail);
  connectRail(rightRail);
  branchLayouts.forEach((branch) =>
    layoutTopology(
      branch.branch,
      branch.bounds,
      branch.start,
      branch.end,
      context,
    ),
  );
}

function normalisePosition(
  point: Point2D,
  size: Size,
  direction: CircuitIntentDirection,
): Point2D {
  const normalised = {
    x: 0.08 + (0.84 * point.x) / size.width,
    y: 0.08 + (0.84 * point.y) / size.height,
  };
  return direction === "top-to-bottom"
    ? { x: normalised.y, y: normalised.x }
    : normalised;
}

function rootBranchOrder(
  topology: CircuitTopologyIntent,
): string[][] | undefined {
  if (topology.type !== "parallel") return undefined;
  const collect = (item: CircuitTopologyIntent): string[] => {
    if (item.type === "component") return [item.id];
    if (item.type === "wire") return item.id ? [item.id] : ["wire"];
    const children = item.type === "series" ? item.items : item.branches;
    return children.flatMap(collect);
  };
  return topology.branches.map(collect);
}

function compileValidatedTopology(
  topology: CircuitTopologyIntent,
  options: CircuitTopologyCompileOptions,
): CircuitNetworkPayload {
  const size = measureTopology(topology);
  const direction = options.direction ?? "left-to-right";
  const context: DraftContext = {
    idPrefix: options.idPrefix ?? "circuit",
    nodes: [],
    wires: [],
    components: [],
    componentLabelPositions: {},
    nodeLabelPositions: {},
    nodeCounter: 0,
    wireCounter: 0,
    explicitWireIds: new Set(),
    overrides: options.componentOverrides ?? {},
  };
  const startNode = addNode(context, { x: 0, y: size.height / 2 });
  const endNode = addNode(context, { x: size.width, y: size.height / 2 });
  layoutTopology(
    topology,
    { left: 0, right: size.width, top: 0, bottom: size.height },
    startNode,
    endNode,
    context,
  );

  const labels = options.terminalLabels;
  if (labels?.start) {
    const node = context.nodes.find((item) => item.id === startNode)!;
    node.label = labels.start;
    node.labelParameterId = `${context.idPrefix}-start-label`;
    context.nodeLabelPositions![startNode] =
      direction === "top-to-bottom" ? "above" : "left";
  }
  if (labels?.end) {
    const node = context.nodes.find((item) => item.id === endNode)!;
    node.label = labels.end;
    node.labelParameterId = `${context.idPrefix}-end-label`;
    context.nodeLabelPositions![endNode] =
      direction === "top-to-bottom" ? "below" : "right";
  }

  const degree = new Map(context.nodes.map((node) => [node.id, 0]));
  const countEdge = (from: string, to: string): void => {
    degree.set(from, degree.get(from)! + 1);
    degree.set(to, degree.get(to)! + 1);
  };
  context.wires.forEach((wire) => countEdge(wire.from, wire.to));
  context.components.forEach((component) =>
    countEdge(component.terminals[0], component.terminals[1]),
  );

  const nodePositions: Record<string, Point2D> = {};
  const nodes: CircuitNodeSpec[] = context.nodes.map((node) => {
    nodePositions[node.id] = normalisePosition(node.position, size, direction);
    return {
      id: node.id,
      kind: degree.get(node.id)! >= 3 ? "junction" : "terminal",
      label: node.label,
      labelParameterId: node.labelParameterId,
    };
  });

  return {
    nodes,
    wires: context.wires,
    components: context.components,
    layoutHints: {
      preferredDirection: direction,
      branchOrder: rootBranchOrder(topology),
      nodePositions,
      componentLabelPositions:
        Object.keys(context.componentLabelPositions!).length > 0
          ? context.componentLabelPositions
          : undefined,
      nodeLabelPositions:
        Object.keys(context.nodeLabelPositions!).length > 0
          ? context.nodeLabelPositions
          : undefined,
    },
  };
}

export function compileCircuitTopology(
  topology: unknown,
  options: CircuitTopologyCompileOptions = {},
): CircuitNetworkPayload {
  const facts = assertTopology(topology, "topology");
  if (facts.componentCount === 0) {
    throw new Error("Circuit topology needs at least one component");
  }
  for (const [componentId, override] of Object.entries(
    options.componentOverrides ?? {},
  )) {
    const kind = facts.componentKinds.get(componentId);
    if (!kind) {
      throw new Error(
        `Circuit component override references unknown component: ${componentId}`,
      );
    }
    assertOverride(override, kind, `componentOverrides.${componentId}`);
  }
  return compileValidatedTopology(topology as CircuitTopologyIntent, options);
}

function publicParameterIds(payloads: CircuitNetworkPayload[]): string[] {
  const ids = new Set<string>();
  for (const payload of payloads) {
    for (const node of payload.nodes) {
      if (node.labelParameterId) ids.add(node.labelParameterId);
    }
    for (const component of payload.components) {
      if (component.labelParameterId) ids.add(component.labelParameterId);
      for (const binding of component.quantityBindings ?? []) {
        ids.add(binding.parameterId);
      }
    }
  }
  return [...ids];
}

export function compileCircuitIntent(
  value: unknown,
): VisualSpec<"circuit_network"> {
  assertIntent(value);
  const intent = value;
  const direction = intent.layout?.direction ?? "left-to-right";
  const panelDefinitions = intent.panels ?? [{ id: "main" }];
  const payloads = panelDefinitions.map((panel) =>
    compileValidatedTopology(panel.topology ?? intent.topology, {
      idPrefix: `${intent.id}-${panel.id}`,
      direction,
      terminalLabels: intent.layout?.terminalLabels,
      componentOverrides: panel.componentOverrides,
    }),
  );
  const publicIds = publicParameterIds(payloads);
  const privateIds = intent.visibility?.privateParameterIds ?? [
    `${intent.id}-answer`,
  ];
  const overlap = privateIds.find((id) => publicIds.includes(id));
  if (overlap) {
    throw new Error(
      `Circuit parameter cannot be public and private: ${overlap}`,
    );
  }
  const hasPanelLabels = panelDefinitions.some((panel) => panel.label);
  const spec: VisualSpec<"circuit_network"> = {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    id: intent.id,
    family: "circuit_network",
    templateId: "network.circuit.v1",
    scenarioRef: intent.scenarioRef,
    coordinateSpace: "network",
    payload: payloads[0],
    layers: payloads.slice(1).map((payload, index) => ({
      id: `${intent.id}-layer-${index + 2}`,
      family: "circuit_network",
      payload,
      zIndex: index + 1,
    })),
    composition:
      payloads.length === 1
        ? { kind: "single" }
        : {
            kind: intent.composition?.kind ?? "panel-grid",
            columns: intent.composition?.columns,
            panelLabels: hasPanelLabels
              ? panelDefinitions.map((panel) => panel.label!)
              : undefined,
          },
    visibility: {
      publicParameterIds: publicIds,
      privateParameterIds: privateIds,
      labelMode: "allowlist",
      altTextMode: intent.visibility?.altTextMode ?? "student-safe",
    },
    provenance: {
      sourceQuestionId: intent.provenance?.sourceQuestionId,
      rendererVersion: "circuit-intent-compiler/0.1.0+circuit-svg/0.1.0",
    },
  };
  return spec;
}
