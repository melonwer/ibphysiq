import { validateVisualSpec } from "./template-registry";
import {
  FieldEntitySpec,
  FieldMapPayload,
  FieldPathSpec,
  Point2D,
  VisualSpec,
} from "./types";

export interface FieldMapRenderOptions {
  width?: number;
  height?: number;
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

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
    width > 1800 ||
    height < 240 ||
    height > 1400
  ) {
    throw new Error("Invalid field-map SVG dimensions");
  }
}

function assertPoint(point: Point2D, path: string): void {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.x > 1 ||
    point.y < 0 ||
    point.y > 1
  ) {
    throw new Error(`Invalid normalized field point: ${path}`);
  }
}

function assertUnique(ids: readonly string[], kind: string): void {
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error(`Field ${kind} IDs must be non-empty and unique`);
  }
}

function validateVisibleLabel(
  label: string | undefined,
  parameterId: string | undefined,
  publicIds: ReadonlySet<string>,
  path: string,
): void {
  if (!label) {
    if (parameterId)
      throw new Error(`Field label parameter has no label: ${path}`);
    return;
  }
  if (!label.trim() || !parameterId || !publicIds.has(parameterId)) {
    throw new Error(`Field label is not student-visible: ${path}`);
  }
}

function validateEntity(
  entity: FieldEntitySpec,
  publicIds: ReadonlySet<string>,
): void {
  assertPoint(entity.position, `entities.${entity.id}.position`);
  if (entity.endPosition) {
    assertPoint(entity.endPosition, `entities.${entity.id}.endPosition`);
  }
  if (
    entity.size &&
    (!Number.isFinite(entity.size.x) ||
      !Number.isFinite(entity.size.y) ||
      entity.size.x <= 0 ||
      entity.size.y <= 0 ||
      entity.size.x > 1 ||
      entity.size.y > 1)
  ) {
    throw new Error(`Invalid field entity size: ${entity.id}`);
  }
  if (
    entity.kind === "point-charge" &&
    entity.sign !== -1 &&
    entity.sign !== 1
  ) {
    throw new Error(`Point charge needs a sign: ${entity.id}`);
  }
  if (
    (entity.kind === "point-charge" ||
      entity.kind === "point-mass" ||
      entity.kind === "sphere") &&
    entity.relativeMagnitude !== undefined &&
    (!Number.isFinite(entity.relativeMagnitude) ||
      entity.relativeMagnitude <= 0)
  ) {
    throw new Error(`Invalid field-source magnitude: ${entity.id}`);
  }
  if (
    (entity.kind === "plate" && !entity.endPosition) ||
    (entity.kind === "bar-magnet" && !entity.size)
  ) {
    throw new Error(`Incomplete field entity geometry: ${entity.id}`);
  }
  validateVisibleLabel(
    entity.label,
    entity.labelParameterId,
    publicIds,
    `entities.${entity.id}.label`,
  );
  validateVisibleLabel(
    entity.secondaryLabel,
    entity.secondaryLabelParameterId,
    publicIds,
    `entities.${entity.id}.secondaryLabel`,
  );
}

function validatePath(
  path: FieldPathSpec,
  publicIds: ReadonlySet<string>,
): void {
  if (path.points.length < 2) {
    throw new Error(`Field path needs at least two points: ${path.id}`);
  }
  path.points.forEach((point, index) =>
    assertPoint(point, `paths.${path.id}.points.${index}`),
  );
  if (path.kind === "field-line" && !path.direction) {
    throw new Error(`Field line needs a direction: ${path.id}`);
  }
  validateVisibleLabel(
    path.label,
    path.labelParameterId,
    publicIds,
    `paths.${path.id}.label`,
  );
}

function validatePayload(
  payload: FieldMapPayload,
  publicIds: ReadonlySet<string>,
): void {
  if (payload.entities.length === 0 && payload.paths.length === 0) {
    throw new Error("Field map needs at least one entity or path");
  }
  assertUnique(
    payload.entities.map((item) => item.id),
    "entity",
  );
  assertUnique(
    payload.paths.map((item) => item.id),
    "path",
  );
  assertUnique(
    (payload.vectors ?? []).map((item) => item.id),
    "vector",
  );
  assertUnique(
    (payload.annotations ?? []).map((item) => item.id),
    "annotation",
  );
  payload.entities.forEach((entity) => validateEntity(entity, publicIds));
  payload.paths.forEach((path) => validatePath(path, publicIds));
  for (const vector of payload.vectors ?? []) {
    assertPoint(vector.origin, `vectors.${vector.id}.origin`);
    if (
      !Number.isFinite(vector.direction.x) ||
      !Number.isFinite(vector.direction.y) ||
      Math.hypot(vector.direction.x, vector.direction.y) < 1e-8
    ) {
      throw new Error(`Invalid field vector direction: ${vector.id}`);
    }
    assertPoint(
      {
        x: vector.origin.x + vector.direction.x,
        y: vector.origin.y + vector.direction.y,
      },
      `vectors.${vector.id}.end`,
    );
    validateVisibleLabel(
      vector.label,
      vector.labelParameterId,
      publicIds,
      `vectors.${vector.id}.label`,
    );
  }
  for (const annotation of payload.annotations ?? []) {
    assertPoint(annotation.position, `annotations.${annotation.id}.position`);
    validateVisibleLabel(
      annotation.label,
      annotation.labelParameterId,
      publicIds,
      `annotations.${annotation.id}.label`,
    );
  }
}

function project(point: Point2D, bounds: Bounds): Point2D {
  const paddingX = Math.min(52, (bounds.right - bounds.left) * 0.09);
  const paddingY = Math.min(48, (bounds.bottom - bounds.top) * 0.13);
  return {
    x:
      bounds.left +
      paddingX +
      point.x * (bounds.right - bounds.left - 2 * paddingX),
    y:
      bounds.top +
      paddingY +
      point.y * (bounds.bottom - bounds.top - 2 * paddingY),
  };
}

function pathData(path: FieldPathSpec, bounds: Bounds): string {
  const source =
    path.direction === "reverse" ? [...path.points].reverse() : path.points;
  const points = [...source, ...(path.closed ? [source[0]] : [])].map((point) =>
    project(point, bounds),
  );
  if (path.smooth && points.length >= 3 && !path.closed) {
    let data = `M${formatNumber(points[0].x)} ${formatNumber(points[0].y)}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const previous = points[Math.max(0, index - 1)];
      const current = points[index];
      const next = points[index + 1];
      const following = points[Math.min(points.length - 1, index + 2)];
      const control1 = {
        x: current.x + (next.x - previous.x) / 6,
        y: current.y + (next.y - previous.y) / 6,
      };
      const control2 = {
        x: next.x - (following.x - current.x) / 6,
        y: next.y - (following.y - current.y) / 6,
      };
      data += `C${formatNumber(control1.x)} ${formatNumber(control1.y)} ${formatNumber(control2.x)} ${formatNumber(control2.y)} ${formatNumber(next.x)} ${formatNumber(next.y)}`;
    }
    return data;
  }
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${formatNumber(point.x)} ${formatNumber(point.y)}`,
    )
    .join("");
}

function pointAtPathMidpoint(points: readonly Point2D[]): Point2D {
  if (points.length === 1) return points[0];
  const lengths = points
    .slice(1)
    .map((point, index) =>
      Math.hypot(point.x - points[index].x, point.y - points[index].y),
    );
  const halfway = lengths.reduce((sum, value) => sum + value, 0) / 2;
  let traversed = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    if (traversed + lengths[index] >= halfway) {
      const fraction = (halfway - traversed) / lengths[index];
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * fraction,
        y: points[index].y + (points[index + 1].y - points[index].y) * fraction,
      };
    }
    traversed += lengths[index];
  }
  return points[points.length - 1];
}

function strokeDash(lineStyle: FieldPathSpec["lineStyle"]): string {
  if (lineStyle === "dashed") return ' stroke-dasharray="8 6"';
  if (lineStyle === "dotted") return ' stroke-dasharray="2 6"';
  return "";
}

function renderPath(
  path: FieldPathSpec,
  bounds: Bounds,
  arrowId: string,
  doubleArrowId: string,
): string {
  const color =
    path.kind === "equipotential"
      ? "#46545d"
      : path.kind === "guide" || path.kind === "dimension"
        ? "#59656c"
        : "#171b1f";
  const marker =
    path.kind === "field-line" || path.showArrow
      ? ` marker-end="url(#${arrowId})"`
      : path.kind === "dimension"
        ? ` marker-start="url(#${doubleArrowId})" marker-end="url(#${arrowId})"`
        : "";
  const d = pathData(path, bounds);
  const labelSource =
    path.labelAt === "start"
      ? path.points[0]
      : path.labelAt === "end"
        ? path.points[path.points.length - 1]
        : pointAtPathMidpoint(path.points);
  const labelPoint = project(labelSource, bounds);
  const placement = path.labelPlacement ?? "above";
  const offset =
    placement === "below"
      ? { x: 0, y: 23, anchor: "middle" }
      : placement === "left"
        ? { x: -11, y: 5, anchor: "end" }
        : placement === "right"
          ? { x: 11, y: 5, anchor: "start" }
          : { x: 0, y: -9, anchor: "middle" };
  return `<path data-path-id="${escapeXml(path.id)}" d="${d}" fill="none" stroke="${color}" stroke-width="${path.kind === "field-line" ? 1.6 : 1.8}" stroke-linecap="round" stroke-linejoin="round"${strokeDash(path.lineStyle)}${marker}/>${path.label ? `<text x="${formatNumber(labelPoint.x + offset.x)}" y="${formatNumber(labelPoint.y + offset.y)}" text-anchor="${offset.anchor}" font-size="15" font-family="Arial, sans-serif">${escapeXml(path.label)}</text>` : ""}`;
}

function entityLabel(
  point: Point2D,
  label: string,
  placement: FieldEntitySpec["labelPlacement"] = "below",
): string {
  if (!label || placement === "center") return "";
  const attributes =
    placement === "above"
      ? { x: point.x, y: point.y - 17, anchor: "middle" }
      : placement === "left"
        ? { x: point.x - 13, y: point.y + 5, anchor: "end" }
        : placement === "right"
          ? { x: point.x + 13, y: point.y + 5, anchor: "start" }
          : { x: point.x, y: point.y + 29, anchor: "middle" };
  return `<text x="${formatNumber(attributes.x)}" y="${formatNumber(attributes.y)}" text-anchor="${attributes.anchor}" font-size="17" font-family="Arial, sans-serif">${label}</text>`;
}

function renderEntity(entity: FieldEntitySpec, bounds: Bounds): string {
  const point = project(entity.position, bounds);
  const label = entity.label ? escapeXml(entity.label) : "";
  const secondary = entity.secondaryLabel
    ? escapeXml(entity.secondaryLabel)
    : "";
  if (entity.appearance === "dot") {
    return `<g data-entity-id="${escapeXml(entity.id)}"><circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="6" fill="#171b1f"/>${entityLabel(point, label, entity.labelPlacement)}</g>`;
  }
  if (entity.appearance === "cross") {
    return `<g data-entity-id="${escapeXml(entity.id)}"><line x1="${formatNumber(point.x - 7)}" y1="${formatNumber(point.y - 7)}" x2="${formatNumber(point.x + 7)}" y2="${formatNumber(point.y + 7)}" stroke="#171b1f" stroke-width="1.6"/><line x1="${formatNumber(point.x - 7)}" y1="${formatNumber(point.y + 7)}" x2="${formatNumber(point.x + 7)}" y2="${formatNumber(point.y - 7)}" stroke="#171b1f" stroke-width="1.6"/>${entityLabel(point, label, entity.labelPlacement)}</g>`;
  }
  switch (entity.kind) {
    case "point-charge": {
      const symbol = entity.sign === 1 ? "+" : "−";
      const centerText = entity.labelPlacement === "center" ? label : symbol;
      return `<g data-entity-id="${escapeXml(entity.id)}"><circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="18" fill="white" stroke="#171b1f" stroke-width="2"/><text x="${formatNumber(point.x)}" y="${formatNumber(point.y + 6)}" text-anchor="middle" font-size="20" font-family="Arial, sans-serif">${centerText}</text>${entityLabel(point, label, entity.labelPlacement)}</g>`;
    }
    case "point-mass":
      return `<g data-entity-id="${escapeXml(entity.id)}"><circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="12" fill="#b6b6b6" stroke="#171b1f" stroke-width="1.5"/>${entityLabel(point, label, entity.labelPlacement)}</g>`;
    case "sphere": {
      const radius = Math.max(
        22,
        Math.min(
          52,
          ((entity.size?.x ?? 0.12) * (bounds.right - bounds.left)) / 2,
        ),
      );
      return `<g data-entity-id="${escapeXml(entity.id)}"><circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="${formatNumber(radius)}" fill="#f7f8f9" stroke="#171b1f" stroke-width="2"/>${label ? `<text x="${formatNumber(point.x)}" y="${formatNumber(point.y + 6)}" text-anchor="middle" font-size="18" font-family="Arial, sans-serif">${label}</text>` : ""}</g>`;
    }
    case "bar-magnet": {
      const width = (entity.size?.x ?? 0.24) * (bounds.right - bounds.left);
      const height = (entity.size?.y ?? 0.1) * (bounds.bottom - bounds.top);
      const left = point.x - width / 2;
      const top = point.y - height / 2;
      return `<g data-entity-id="${escapeXml(entity.id)}"><rect x="${formatNumber(left)}" y="${formatNumber(top)}" width="${formatNumber(width)}" height="${formatNumber(height)}" fill="white" stroke="#171b1f" stroke-width="2"/><line x1="${formatNumber(point.x)}" y1="${formatNumber(top)}" x2="${formatNumber(point.x)}" y2="${formatNumber(top + height)}" stroke="#9aa3a9"/>${label ? `<text x="${formatNumber(left + width * 0.25)}" y="${formatNumber(point.y + 6)}" text-anchor="middle" font-size="18" font-family="Arial, sans-serif">${label}</text>` : ""}${secondary ? `<text x="${formatNumber(left + width * 0.75)}" y="${formatNumber(point.y + 6)}" text-anchor="middle" font-size="18" font-family="Arial, sans-serif">${secondary}</text>` : ""}</g>`;
    }
    case "plate": {
      const end = project(entity.endPosition!, bounds);
      return `<g data-entity-id="${escapeXml(entity.id)}"><line x1="${formatNumber(point.x)}" y1="${formatNumber(point.y)}" x2="${formatNumber(end.x)}" y2="${formatNumber(end.y)}" stroke="#171b1f" stroke-width="3"/>${label ? `<text x="${formatNumber((point.x + end.x) / 2)}" y="${formatNumber((point.y + end.y) / 2 - 12)}" text-anchor="middle" font-size="16" font-family="Arial, sans-serif">${label}</text>` : ""}</g>`;
    }
    case "test-particle":
      return `<g data-entity-id="${escapeXml(entity.id)}"><circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="7" fill="#171b1f"/>${label ? `<text x="${formatNumber(point.x + 12)}" y="${formatNumber(point.y - 10)}" font-size="16" font-family="Arial, sans-serif">${label}</text>` : ""}</g>`;
    case "point-marker":
      return `<g data-entity-id="${escapeXml(entity.id)}"><circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="5" fill="#171b1f"/>${entityLabel(point, label, entity.labelPlacement)}</g>`;
  }
}

function renderPanel(
  payload: FieldMapPayload,
  bounds: Bounds,
  arrowId: string,
  doubleArrowId: string,
): string {
  const parts: string[] = [];
  for (const path of payload.paths) {
    parts.push(renderPath(path, bounds, arrowId, doubleArrowId));
  }
  for (const vector of payload.vectors ?? []) {
    const origin = project(vector.origin, bounds);
    const end = project(
      {
        x: vector.origin.x + vector.direction.x,
        y: vector.origin.y + vector.direction.y,
      },
      bounds,
    );
    parts.push(
      `<line data-vector-id="${escapeXml(vector.id)}" x1="${formatNumber(origin.x)}" y1="${formatNumber(origin.y)}" x2="${formatNumber(end.x)}" y2="${formatNumber(end.y)}" stroke="#171b1f" stroke-width="2.4" marker-end="url(#${arrowId})"/>`,
    );
    if (vector.label) {
      parts.push(
        `<text x="${formatNumber((origin.x + end.x) / 2)}" y="${formatNumber((origin.y + end.y) / 2 - 10)}" text-anchor="middle" font-size="16" font-family="Arial, sans-serif">${escapeXml(vector.label)}</text>`,
      );
    }
  }
  for (const entity of payload.entities)
    parts.push(renderEntity(entity, bounds));
  for (const annotation of payload.annotations ?? []) {
    const point = project(annotation.position, bounds);
    parts.push(
      `<text data-annotation-id="${escapeXml(annotation.id)}" x="${formatNumber(point.x)}" y="${formatNumber(point.y)}" text-anchor="${annotation.textAnchor ?? "middle"}" font-size="16" font-family="Arial, sans-serif">${escapeXml(annotation.label)}</text>`,
    );
  }
  return parts.join("");
}

export function renderFieldMap(
  spec: VisualSpec<"field_map">,
  options: FieldMapRenderOptions = {},
): string {
  const validation = validateVisualSpec(spec);
  if (!validation.valid) {
    throw new Error(
      `Invalid field-map visual spec: ${validation.issues.map((issue) => issue.code).join(", ")}`,
    );
  }
  if (spec.composition?.kind === "overlay") {
    throw new Error("Field-map overlays are not supported");
  }
  const layerPayloads = (spec.layers ?? []).map((layer) => {
    if (layer.family !== "field_map") {
      throw new Error(`Unsupported field-map layer family: ${layer.family}`);
    }
    return layer.payload;
  });
  const payloads = [spec.payload, ...layerPayloads];
  const composition = spec.composition?.kind ?? "single";
  if (composition === "single" && payloads.length !== 1) {
    throw new Error("Single field-map composition cannot contain panel layers");
  }
  if (
    spec.composition?.panelLabels &&
    spec.composition.panelLabels.length !== payloads.length
  ) {
    throw new Error("Field-map panel labels must match the panel count");
  }
  const publicIds = new Set(spec.visibility.publicParameterIds);
  payloads.forEach((payload) => validatePayload(payload, publicIds));
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
    (payloads.length === 1 ? 800 : Math.max(840, columns * 440));
  const height = options.height ?? (payloads.length === 1 ? 500 : rows * 350);
  assertDimensions(width, height);
  const safeId = spec.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const arrowId = `field-arrow-${safeId}`;
  const reverseArrowId = `field-reverse-arrow-${safeId}`;
  const panelWidth = width / columns;
  const panelHeight = height / rows;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Field diagram with ${payloads.reduce((total, payload) => total + payload.entities.length, 0)} source or marker entities">`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
    `<defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#171b1f"/></marker><marker id="${reverseArrowId}" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M10 0L0 5L10 10Z" fill="#59656c"/></marker></defs>`,
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
    parts.push(renderPanel(payload, bounds, arrowId, reverseArrowId));
  });
  parts.push("</svg>");
  return parts.join("");
}
