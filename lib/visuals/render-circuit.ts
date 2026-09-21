import { validateVisualSpec } from "./template-registry";
import {
  CircuitComponentSpec,
  CircuitNetworkPayload,
  Point2D,
  VisualSpec,
} from "./types";

export interface CircuitRenderOptions {
  width?: number;
  height?: number;
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

type LabelPosition = "above" | "below" | "left" | "right";

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
}

function formatNumber(value: number): string {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function assertDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 320 ||
    width > 1600 ||
    height < 240 ||
    height > 1200
  ) {
    throw new Error("Invalid SVG dimensions");
  }
}

function assertUnique(ids: readonly string[], kind: string): void {
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error(`Circuit ${kind} IDs must be non-empty and unique`);
  }
}

function isAxisAligned(start: Point2D, end: Point2D): boolean {
  return Math.abs(start.x - end.x) < 1e-8 || Math.abs(start.y - end.y) < 1e-8;
}

function validateVisibleLabel(
  owner: { label?: string; labelParameterId?: string },
  publicIds: ReadonlySet<string>,
  path: string,
): void {
  if (!owner.label) {
    if (owner.labelParameterId) {
      throw new Error(`Circuit label parameter has no label: ${path}`);
    }
    return;
  }
  if (!owner.label.trim() || !owner.labelParameterId) {
    throw new Error(`Circuit label needs a visible parameter ID: ${path}`);
  }
  if (!publicIds.has(owner.labelParameterId)) {
    throw new Error(`Circuit label is not student-visible: ${path}`);
  }
}

function validatePayload(
  payload: CircuitNetworkPayload,
  publicIds: ReadonlySet<string>,
): void {
  if (payload.nodes.length < 2 || payload.components.length < 1) {
    throw new Error("Circuit needs at least two nodes and one component");
  }
  assertUnique(
    payload.nodes.map((node) => node.id),
    "node",
  );
  assertUnique(
    payload.wires.map((wire) => wire.id),
    "wire",
  );
  assertUnique(
    payload.components.map((component) => component.id),
    "component",
  );

  const nodes = new Map(payload.nodes.map((node) => [node.id, node]));
  const positions = payload.layoutHints?.nodePositions;
  if (!positions) {
    throw new Error("Circuit layout needs node positions");
  }
  for (const node of payload.nodes) {
    const position = positions[node.id];
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      position.x < 0 ||
      position.x > 1 ||
      position.y < 0 ||
      position.y > 1
    ) {
      throw new Error(`Invalid circuit node position: ${node.id}`);
    }
    validateVisibleLabel(node, publicIds, `nodes.${node.id}`);
  }

  const degree = new Map(payload.nodes.map((node) => [node.id, 0]));
  const adjacency = new Map(
    payload.nodes.map((node) => [node.id, new Set<string>()]),
  );
  const connect = (from: string, to: string): void => {
    if (!nodes.has(from) || !nodes.has(to) || from === to) {
      throw new Error(`Invalid circuit connection: ${from}–${to}`);
    }
    degree.set(from, degree.get(from)! + 1);
    degree.set(to, degree.get(to)! + 1);
    adjacency.get(from)!.add(to);
    adjacency.get(to)!.add(from);
  };

  for (const wire of payload.wires) {
    connect(wire.from, wire.to);
    if (!isAxisAligned(positions[wire.from], positions[wire.to])) {
      throw new Error(`Circuit wire must be orthogonal: ${wire.id}`);
    }
  }
  for (const component of payload.components) {
    const [from, to] = component.terminals;
    connect(from, to);
    const start = positions[from];
    const end = positions[to];
    if (!isAxisAligned(start, end)) {
      throw new Error(`Circuit component must be orthogonal: ${component.id}`);
    }
    if (Math.hypot(start.x - end.x, start.y - end.y) < 0.08) {
      throw new Error(
        `Circuit component is too short to render: ${component.id}`,
      );
    }
    validateVisibleLabel(component, publicIds, `components.${component.id}`);
    for (const binding of component.quantityBindings ?? []) {
      if (!publicIds.has(binding.parameterId)) {
        throw new Error(
          `Circuit quantity is not student-visible: ${binding.parameterId}`,
        );
      }
    }
  }

  for (const node of payload.nodes) {
    const nodeDegree = degree.get(node.id)!;
    if (nodeDegree === 0) {
      throw new Error(`Disconnected circuit node: ${node.id}`);
    }
    if (nodeDegree >= 3 && node.kind !== "junction") {
      throw new Error(
        `Circuit branch must be an explicit junction: ${node.id}`,
      );
    }
    if (node.kind === "junction" && nodeDegree < 3) {
      throw new Error(
        `Circuit junction needs at least three connections: ${node.id}`,
      );
    }
  }

  const visited = new Set<string>();
  const queue = [payload.nodes[0].id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const neighbour of adjacency.get(current)!) queue.push(neighbour);
  }
  if (visited.size !== payload.nodes.length) {
    throw new Error("Circuit network must be connected");
  }
}

function labelCoordinates(
  point: Point2D,
  placement: LabelPosition,
  distance: number,
): { x: number; y: number; anchor: "start" | "middle" | "end" } {
  if (placement === "above") {
    return { x: point.x, y: point.y - distance, anchor: "middle" };
  }
  if (placement === "below") {
    return { x: point.x, y: point.y + distance, anchor: "middle" };
  }
  if (placement === "left") {
    return { x: point.x - distance, y: point.y + 5, anchor: "end" };
  }
  return { x: point.x + distance, y: point.y + 5, anchor: "start" };
}

function componentHalfLength(kind: CircuitComponentSpec["kind"]): number {
  if (kind === "ammeter" || kind === "voltmeter" || kind === "lamp") return 24;
  if (kind === "cell" || kind === "capacitor") return 10;
  if (kind === "battery") return 20;
  if (kind === "switch") return 36;
  return 40;
}

function renderLocalSymbol(
  component: CircuitComponentSpec,
  arrowId: string,
  rotation: number,
): string {
  const common = `data-component-id="${escapeXml(component.id)}" data-component-kind="${component.kind}"`;
  if (
    component.kind === "resistor" ||
    component.kind === "variable-resistor" ||
    component.kind === "thermistor" ||
    component.kind === "ldr"
  ) {
    const parts = [
      `<rect ${common} x="-38" y="-14" width="76" height="28" fill="white" stroke="#171b1f" stroke-width="2"/>`,
    ];
    if (component.kind === "variable-resistor") {
      parts.push(
        `<path d="M-50 34L46 -30" fill="none" stroke="#171b1f" stroke-width="1.8" marker-end="url(#${arrowId})"/>`,
      );
    } else if (component.kind === "thermistor") {
      parts.push(
        '<path d="M-48 30L44 -30M38 -30H52V-18" fill="none" stroke="#171b1f" stroke-width="1.8"/>',
      );
    } else if (component.kind === "ldr") {
      parts.push(
        `<path d="M-48 -42L-23 -20M-25 -44L0 -22" fill="none" stroke="#171b1f" stroke-width="1.6" marker-end="url(#${arrowId})"/>`,
      );
    }
    return parts.join("");
  }
  if (component.kind === "lamp") {
    const fill = component.state === "inactive" ? "#b8bdc2" : "white";
    return `<g ${common}><circle r="23" fill="${fill}" stroke="#171b1f" stroke-width="2"/><path d="M-15 -15L15 15M-15 15L15 -15" stroke="#171b1f" stroke-width="1.7"/></g>`;
  }
  if (component.kind === "ammeter" || component.kind === "voltmeter") {
    const symbol = component.kind === "ammeter" ? "A" : "V";
    return `<g ${common}><circle r="23" fill="white" stroke="#171b1f" stroke-width="2"/><text x="0" y="7" text-anchor="middle" font-size="22" font-family="Arial, sans-serif" transform="rotate(${-rotation})">${symbol}</text></g>`;
  }
  if (component.kind === "cell") {
    return `<g ${common}><path d="M-6 -22V22M7 -13V13" stroke="#171b1f" stroke-width="2"/></g>`;
  }
  if (component.kind === "battery") {
    return `<g ${common}><path d="M-16 -22V22M-7 -13V13M6 -22V22M15 -13V13" stroke="#171b1f" stroke-width="2"/></g>`;
  }
  if (component.kind === "capacitor") {
    return `<g ${common}><path d="M-6 -20V20M6 -20V20" stroke="#171b1f" stroke-width="2"/></g>`;
  }
  if (component.kind === "switch") {
    const contact =
      component.state === "closed"
        ? '<path d="M-30 0H30" stroke="#171b1f" stroke-width="2"/>'
        : '<path d="M-30 0L24 -20" stroke="#171b1f" stroke-width="2"/>';
    return `<g ${common}><circle cx="-30" r="3" fill="#171b1f"/><circle cx="30" r="3" fill="#171b1f"/>${contact}</g>`;
  }
  if (component.kind === "diode") {
    return `<g ${common}><path d="M-22 -18V18L18 0Z" fill="white" stroke="#171b1f" stroke-width="2"/><path d="M18 -20V20" stroke="#171b1f" stroke-width="2"/></g>`;
  }
  throw new Error(`Unsupported circuit component: ${component.kind}`);
}

function renderPanel(
  payload: CircuitNetworkPayload,
  bounds: Bounds,
  publicIds: ReadonlySet<string>,
  arrowId: string,
  compact: boolean,
): string {
  validatePayload(payload, publicIds);
  const positions = payload.layoutHints!.nodePositions!;
  const padding = compact ? 32 : 48;
  const inner: Bounds = {
    left: bounds.left + padding,
    top: bounds.top + padding,
    right: bounds.right - padding,
    bottom: bounds.bottom - padding,
  };
  if (inner.right - inner.left < 160 || inner.bottom - inner.top < 120) {
    throw new Error("Circuit panel is too small");
  }
  const project = (point: Point2D): Point2D => ({
    x: inner.left + point.x * (inner.right - inner.left),
    y: inner.top + point.y * (inner.bottom - inner.top),
  });
  const points = new Map(
    Object.entries(positions).map(([id, position]) => [id, project(position)]),
  );
  const parts: string[] = [];

  for (const wire of payload.wires) {
    const start = points.get(wire.from)!;
    const end = points.get(wire.to)!;
    parts.push(
      `<path data-wire-id="${escapeXml(wire.id)}" d="M${formatNumber(start.x)} ${formatNumber(start.y)}L${formatNumber(end.x)} ${formatNumber(end.y)}" fill="none" stroke="#171b1f" stroke-width="2"/>`,
    );
  }

  for (const component of payload.components) {
    const start = points.get(component.terminals[0])!;
    const end = points.get(component.terminals[1])!;
    const centre = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const horizontal = Math.abs(start.y - end.y) < 1e-8;
    const angle = horizontal
      ? start.x <= end.x
        ? 0
        : 180
      : start.y <= end.y
        ? 90
        : -90;
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const unit = {
      x: (end.x - start.x) / distance,
      y: (end.y - start.y) / distance,
    };
    const half = componentHalfLength(component.kind);
    if (distance < half * 2 + 6) {
      throw new Error(
        `Circuit component has insufficient drawing space: ${component.id}`,
      );
    }
    const leadStart = {
      x: centre.x - unit.x * half,
      y: centre.y - unit.y * half,
    };
    const leadEnd = {
      x: centre.x + unit.x * half,
      y: centre.y + unit.y * half,
    };
    parts.push(
      `<path d="M${formatNumber(start.x)} ${formatNumber(start.y)}L${formatNumber(leadStart.x)} ${formatNumber(leadStart.y)}M${formatNumber(leadEnd.x)} ${formatNumber(leadEnd.y)}L${formatNumber(end.x)} ${formatNumber(end.y)}" fill="none" stroke="#171b1f" stroke-width="2"/>`,
      `<g transform="translate(${formatNumber(centre.x)} ${formatNumber(centre.y)}) rotate(${angle})">${renderLocalSymbol(component, arrowId, angle)}</g>`,
    );
    if (component.label) {
      const placement =
        payload.layoutHints?.componentLabelPositions?.[component.id] ??
        (horizontal ? "below" : "right");
      const label = labelCoordinates(centre, placement, compact ? 30 : 36);
      parts.push(
        `<text x="${formatNumber(label.x)}" y="${formatNumber(label.y)}" text-anchor="${label.anchor}" font-size="${compact ? 15 : 18}" font-family="Arial, sans-serif">${escapeXml(component.label)}</text>`,
      );
    }
  }

  for (const node of payload.nodes) {
    const point = points.get(node.id)!;
    if (node.kind === "junction") {
      parts.push(
        `<circle data-node-id="${escapeXml(node.id)}" cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="4" fill="#171b1f"/>`,
      );
    } else if (node.kind === "reference") {
      parts.push(
        `<path data-node-id="${escapeXml(node.id)}" d="M${formatNumber(point.x - 14)} ${formatNumber(point.y)}H${formatNumber(point.x + 14)}M${formatNumber(point.x - 9)} ${formatNumber(point.y + 6)}H${formatNumber(point.x + 9)}M${formatNumber(point.x - 4)} ${formatNumber(point.y + 12)}H${formatNumber(point.x + 4)}" stroke="#171b1f" stroke-width="2"/>`,
      );
    } else if (node.label) {
      parts.push(
        `<circle data-node-id="${escapeXml(node.id)}" cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="3" fill="#171b1f"/>`,
      );
    }
    if (node.label) {
      const placement =
        payload.layoutHints?.nodeLabelPositions?.[node.id] ?? "above";
      const label = labelCoordinates(point, placement, compact ? 18 : 22);
      parts.push(
        `<text x="${formatNumber(label.x)}" y="${formatNumber(label.y)}" text-anchor="${label.anchor}" font-size="${compact ? 15 : 18}" font-family="Arial, sans-serif">${escapeXml(node.label)}</text>`,
      );
    }
  }
  return parts.join("");
}

export function renderCircuitNetwork(
  spec: VisualSpec<"circuit_network">,
  options: CircuitRenderOptions = {},
): string {
  const validation = validateVisualSpec(spec);
  if (!validation.valid) {
    throw new Error(
      `Invalid circuit visual spec: ${validation.issues.map((issue) => issue.code).join(", ")}`,
    );
  }
  if (spec.composition?.kind === "overlay") {
    throw new Error("Circuit overlays are not supported");
  }
  const layerPayloads = (spec.layers ?? []).map((layer) => {
    if (layer.family !== "circuit_network") {
      throw new Error(`Unsupported circuit layer family: ${layer.family}`);
    }
    return layer.payload;
  });
  const payloads = [spec.payload, ...layerPayloads];
  const composition = spec.composition?.kind ?? "single";
  if (composition === "single" && payloads.length !== 1) {
    throw new Error("Single circuit composition cannot contain panel layers");
  }
  if (
    spec.composition?.panelLabels &&
    spec.composition.panelLabels.length !== payloads.length
  ) {
    throw new Error("Circuit panel labels must match the panel count");
  }
  const columns =
    payloads.length === 1
      ? 1
      : composition === "sequence"
        ? payloads.length
        : Math.min(
            payloads.length,
            spec.composition?.columns ?? Math.ceil(Math.sqrt(payloads.length)),
          );
  const rows = Math.ceil(payloads.length / columns);
  const width =
    options.width ??
    (payloads.length === 1 ? 760 : Math.max(760, columns * 440));
  const height = options.height ?? (payloads.length === 1 ? 500 : rows * 320);
  assertDimensions(width, height);
  const publicIds = new Set(spec.visibility.publicParameterIds);
  const safeId = spec.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const arrowId = `circuit-arrow-${safeId}`;
  const panelWidth = width / columns;
  const panelHeight = height / rows;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Circuit diagram with ${payloads.reduce((total, payload) => total + payload.components.length, 0)} components">`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
    `<defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#171b1f"/></marker></defs>`,
  ];
  payloads.forEach((payload, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const bounds: Bounds = {
      left: column * panelWidth,
      top: row * panelHeight,
      right: (column + 1) * panelWidth,
      bottom: (row + 1) * panelHeight,
    };
    if (payloads.length > 1) {
      parts.push(
        `<rect x="${formatNumber(bounds.left + 8)}" y="${formatNumber(bounds.top + 8)}" width="${formatNumber(panelWidth - 16)}" height="${formatNumber(panelHeight - 16)}" rx="8" fill="none" stroke="#c9ced3"/>`,
      );
    }
    const panelLabel = spec.composition?.panelLabels?.[index];
    if (panelLabel) {
      parts.push(
        `<text x="${formatNumber(bounds.left + 20)}" y="${formatNumber(bounds.top + 30)}" font-size="20" font-weight="700" font-family="Arial, sans-serif">${escapeXml(panelLabel)}</text>`,
      );
    }
    parts.push(
      renderPanel(payload, bounds, publicIds, arrowId, payloads.length > 1),
    );
  });
  parts.push("</svg>");
  return parts.join("");
}
