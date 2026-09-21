import { validateVisualSpec } from "./template-registry";
import {
  AxisSpec,
  CartesianPlotPayload,
  PlotAnnotationSpec,
  PlotSeriesSpec,
  Point2D,
  VisualLayer,
  VisualSpec,
} from "./types";

export interface CartesianPlotData {
  [dataRef: string]: readonly Point2D[];
}

export interface CartesianRenderOptions {
  width?: number;
  height?: number;
}

interface Frame {
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

function validateAxis(axis: AxisSpec): void {
  const [minimum, maximum] = axis.domain;
  if (
    !["linear", "log"].includes(axis.scale) ||
    ![undefined, "ascending", "descending"].includes(axis.direction) ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum >= maximum ||
    (axis.scale === "log" && minimum <= 0)
  ) {
    throw new Error(`Invalid axis domain: ${axis.id}`);
  }
  if (
    axis.tickValues?.some(
      (value, index, values) =>
        !Number.isFinite(value) ||
        value < minimum ||
        value > maximum ||
        (index > 0 && value <= values[index - 1]),
    )
  ) {
    throw new Error(`Tick outside axis domain: ${axis.id}`);
  }
  if (
    axis.minorTickStep !== undefined &&
    (axis.scale !== "linear" ||
      !Number.isFinite(axis.minorTickStep) ||
      axis.minorTickStep <= 0 ||
      (maximum - minimum) / axis.minorTickStep > 300)
  ) {
    throw new Error(`Invalid minor tick step: ${axis.id}`);
  }
}

function tickValues(axis: AxisSpec): number[] {
  if (axis.tickValues) return axis.tickValues;
  const [minimum, maximum] = axis.domain;
  if (axis.scale === "log") {
    const firstPower = Math.ceil(Math.log10(minimum));
    const lastPower = Math.floor(Math.log10(maximum));
    const powers = Array.from(
      { length: Math.max(0, lastPower - firstPower + 1) },
      (_, index) => 10 ** (firstPower + index),
    );
    if (powers.length >= 2) return powers;
    const ratio = maximum / minimum;
    return Array.from({ length: 6 }, (_, index) =>
      minimum * ratio ** (index / 5),
    );
  }
  return Array.from(
    { length: 6 },
    (_, index) => minimum + ((maximum - minimum) * index) / 5,
  );
}

function minorTicks(axis: AxisSpec): number[] {
  if (!axis.minorTickStep || axis.scale !== "linear") return [];
  const [minimum, maximum] = axis.domain;
  const start = Math.ceil(minimum / axis.minorTickStep);
  const end = Math.floor(maximum / axis.minorTickStep);
  return Array.from(
    { length: end - start + 1 },
    (_, index) => (start + index) * axis.minorTickStep!,
  );
}

function displayLabel(axis: AxisSpec): string {
  return axis.unit ? `${axis.label} / ${axis.unit}` : axis.label;
}

function tickLabel(axis: AxisSpec, value: number): string {
  return axis.tickLabels?.[formatNumber(value)] ?? formatNumber(value);
}

function axisFraction(axis: AxisSpec, value: number): number {
  const [minimum, maximum] = axis.domain;
  const fraction =
    axis.scale === "log"
      ? (Math.log(value) - Math.log(minimum)) /
        (Math.log(maximum) - Math.log(minimum))
      : (value - minimum) / (maximum - minimum);
  return axis.direction === "descending" ? 1 - fraction : fraction;
}

function isPointInDomain(
  point: Point2D,
  xAxis: AxisSpec,
  yAxis: AxisSpec,
): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= xAxis.domain[0] - 1e-8 &&
    point.x <= xAxis.domain[1] + 1e-8 &&
    point.y >= yAxis.domain[0] - 1e-8 &&
    point.y <= yAxis.domain[1] + 1e-8 &&
    (xAxis.scale !== "log" || point.x > 0) &&
    (yAxis.scale !== "log" || point.y > 0)
  );
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

function seriesStroke(item: PlotSeriesSpec): string {
  if (item.styleRole === "comparison") return "#4f5962";
  if (item.styleRole === "construction") return "#69747d";
  return "#15191d";
}

function seriesDash(item: PlotSeriesSpec): string | undefined {
  const lineStyle =
    item.lineStyle ??
    (item.styleRole === "comparison"
      ? "dashed"
      : item.styleRole === "construction"
        ? "dotted"
        : "solid");
  if (lineStyle === "dashed") return "8 5";
  if (lineStyle === "dotted") return "2 4";
  return undefined;
}

function seriesStrokeWidth(item: PlotSeriesSpec): number {
  if (item.lineWeight === "thin") return 1.2;
  if (item.lineWeight === "wide") return 14;
  return 2.2;
}

function linePath(
  item: PlotSeriesSpec,
  points: readonly Point2D[],
  projectX: (value: number) => number,
  projectY: (value: number) => number,
): string {
  if (item.kind === "step") {
    const [first, ...rest] = points;
    const commands = [
      `M${formatNumber(projectX(first.x))} ${formatNumber(projectY(first.y))}`,
    ];
    for (const point of rest) {
      commands.push(
        `H${formatNumber(projectX(point.x))}`,
        `V${formatNumber(projectY(point.y))}`,
      );
    }
    if (item.closed) commands.push("Z");
    return commands.join(" ");
  }
  const commands = points.map(
    (point, index) =>
      `${index ? "L" : "M"}${formatNumber(projectX(point.x))} ${formatNumber(projectY(point.y))}`,
  );
  if (item.closed) commands.push("Z");
  return commands.join(" ");
}

function directionSegment(
  points: readonly Point2D[],
  projectX: (value: number) => number,
  projectY: (value: number) => number,
): string {
  const interpolate = (start: Point2D, end: Point2D, fraction: number) => ({
    x: start.x + (end.x - start.x) * fraction,
    y: start.y + (end.y - start.y) * fraction,
  });
  let start: Point2D;
  let end: Point2D;
  if (points.length === 2) {
    start = interpolate(points[0], points[1], 0.4);
    end = interpolate(points[0], points[1], 0.55);
  } else {
    const index = Math.min(
      points.length - 2,
      Math.max(0, Math.floor((points.length - 1) / 2)),
    );
    start = points[index];
    end = points[index + 1];
  }
  return `M${formatNumber(projectX(start.x))} ${formatNumber(projectY(start.y))}L${formatNumber(projectX(end.x))} ${formatNumber(projectY(end.y))}`;
}

function renderMarker(
  marker: NonNullable<PlotSeriesSpec["marker"]>,
  point: Point2D,
  projectX: (value: number) => number,
  projectY: (value: number) => number,
  stroke: string,
  clipId: string,
): string {
  const x = formatNumber(projectX(point.x));
  const y = formatNumber(projectY(point.y));
  if (marker === "circle") {
    return `<circle cx="${x}" cy="${y}" r="4" fill="white" stroke="${stroke}" stroke-width="1.8" clip-path="url(#${clipId})"/>`;
  }
  if (marker === "dot") {
    return `<circle cx="${x}" cy="${y}" r="3.2" fill="${stroke}" clip-path="url(#${clipId})"/>`;
  }
  if (marker === "cross") {
    return `<path d="M${formatNumber(Number(x) - 4)} ${formatNumber(Number(y) - 4)}L${formatNumber(Number(x) + 4)} ${formatNumber(Number(y) + 4)}M${formatNumber(Number(x) - 4)} ${formatNumber(Number(y) + 4)}L${formatNumber(Number(x) + 4)} ${formatNumber(Number(y) - 4)}" fill="none" stroke="${stroke}" stroke-width="1.8" clip-path="url(#${clipId})"/>`;
  }
  return "";
}

function annotationStroke(annotation: PlotAnnotationSpec): string {
  if (annotation.styleRole === "comparison") return "#4f5962";
  if (annotation.styleRole === "construction") return "#69747d";
  return "#15191d";
}

function validatePayload(
  payload: CartesianPlotPayload,
  data: CartesianPlotData,
  publicIds: ReadonlySet<string>,
): void {
  const { xAxis, yAxis, series, annotations = [] } = payload;
  validateAxis(xAxis);
  validateAxis(yAxis);
  for (const id of [xAxis.id, yAxis.id]) {
    if (!publicIds.has(id)) {
      throw new Error(`Axis is not student-visible: ${id}`);
    }
  }
  for (const item of series) {
    for (const id of [item.xParameterId, item.yParameterId, item.dataRef]) {
      if (!publicIds.has(id)) {
        throw new Error(`Series parameter is not student-visible: ${id}`);
      }
    }
    const points = data[item.dataRef];
    const minimumPoints =
      item.kind === "measured-points" || item.kind === "histogram" ? 1 : 2;
    if (!points || points.length < minimumPoints || points.length > 1000) {
      throw new Error(
        `Series needs ${minimumPoints}–1000 points: ${item.dataRef}`,
      );
    }
    if (points.some((point) => !isPointInDomain(point, xAxis, yAxis))) {
      throw new Error(`Series point outside plot domain: ${item.dataRef}`);
    }
    if (
      item.kind === "histogram" &&
      points.some((point, index) => index > 0 && point.x <= points[index - 1].x)
    ) {
      throw new Error(`Histogram points must be x-ordered: ${item.dataRef}`);
    }
  }
  for (const annotation of annotations) {
    if (!publicIds.has(annotation.id)) {
      throw new Error(`Annotation is not student-visible: ${annotation.id}`);
    }
    if (!isPointInDomain(annotation.position, xAxis, yAxis)) {
      throw new Error(`Annotation outside plot domain: ${annotation.id}`);
    }
    if (
      annotation.offset &&
      (!Number.isFinite(annotation.offset.x) ||
        !Number.isFinite(annotation.offset.y) ||
        Math.abs(annotation.offset.x) > 200 ||
        Math.abs(annotation.offset.y) > 200)
    ) {
      throw new Error(`Invalid annotation offset: ${annotation.id}`);
    }
  }
}

function renderSingleCartesianPlot(
  spec: VisualSpec<"cartesian_plot">,
  payload: CartesianPlotPayload,
  data: CartesianPlotData,
  width: number,
  height: number,
  compact: boolean,
): string {
  const {
    xAxis,
    yAxis,
    series,
    showGrid = true,
    squareGridCells = false,
    annotations = [],
  } = payload;
  const publicIds = new Set(spec.visibility.publicParameterIds);
  validatePayload(payload, data, publicIds);

  const frame: Frame = compact
    ? { left: 72, top: 26, right: width - 32, bottom: height - 58 }
    : { left: 112, top: 38, right: width - 80, bottom: height - 84 };
  if (frame.right - frame.left < 100 || frame.bottom - frame.top < 80) {
    throw new Error("Panel is too small for readable axes");
  }
  if (
    squareGridCells &&
    (!showGrid || !xAxis.minorTickStep || !yAxis.minorTickStep)
  ) {
    throw new Error("Square grid requires visible x and y minor ticks");
  }
  if (
    squareGridCells &&
    (xAxis.scale !== "linear" || yAxis.scale !== "linear")
  ) {
    throw new Error("Square grid requires linear axes");
  }
  if (squareGridCells && spec.layoutHints?.aspectRatio !== undefined) {
    throw new Error("Square grid cannot have a fixed aspect ratio");
  }
  const aspectRatio = squareGridCells
    ? (xAxis.domain[1] - xAxis.domain[0]) /
      xAxis.minorTickStep! /
      ((yAxis.domain[1] - yAxis.domain[0]) / yAxis.minorTickStep!)
    : spec.layoutHints?.aspectRatio;
  if (aspectRatio !== undefined) {
    if (
      !Number.isFinite(aspectRatio) ||
      aspectRatio < 0.25 ||
      aspectRatio > 4
    ) {
      throw new Error("Invalid plot aspect ratio");
    }
    const availableWidth = frame.right - frame.left;
    const availableHeight = frame.bottom - frame.top;
    if (aspectRatio < availableWidth / availableHeight) {
      const plotWidth = availableHeight * aspectRatio;
      frame.left += (availableWidth - plotWidth) / 2;
      frame.right = frame.left + plotWidth;
    } else {
      const plotHeight = availableWidth / aspectRatio;
      frame.top += (availableHeight - plotHeight) / 2;
      frame.bottom = frame.top + plotHeight;
    }
  }

  const plotWidth = frame.right - frame.left;
  const plotHeight = frame.bottom - frame.top;
  const projectX = (value: number) =>
    frame.left + axisFraction(xAxis, value) * plotWidth;
  const projectY = (value: number) =>
    frame.bottom - axisFraction(yAxis, value) * plotHeight;
  const tickFontSize = compact ? 12 : 17;
  const axisFontSize = compact ? 14 : 20;

  let previousLabelRight = -Infinity;
  const positionedXTicks = tickValues(xAxis)
    .map((value) => ({
      value,
      centre: projectX(value),
      label: tickLabel(xAxis, value),
    }))
    .sort((left, right) => left.centre - right.centre);
  for (const tick of positionedXTicks) {
    const estimatedWidth =
      Array.from(tick.label).length * tickFontSize * 0.58;
    const labelLeft = tick.centre - estimatedWidth / 2;
    if (labelLeft < previousLabelRight + 3) {
      throw new Error(`Overlapping x-axis tick labels: ${xAxis.id}`);
    }
    previousLabelRight = tick.centre + estimatedWidth / 2;
  }

  const xAxisY =
    yAxis.scale === "linear" &&
    yAxis.domain[0] <= 0 &&
    yAxis.domain[1] >= 0
      ? projectY(0)
      : frame.bottom;
  const yAxisX =
    xAxis.scale === "linear" &&
    xAxis.domain[0] <= 0 &&
    xAxis.domain[1] >= 0
      ? projectX(0)
      : frame.left;
  const safeId = spec.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const clipId = `plot-${safeId}`;
  const arrowId = `arrow-${safeId}`;
  const axisArrowId = `axis-arrow-${safeId}`;
  const hasDirection = series.some((item) => item.showDirection);
  const hasAxisArrow = xAxis.showArrow || yAxis.showArrow;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(`${displayLabel(yAxis)} against ${displayLabel(xAxis)}`)}">`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
    `<defs><clipPath id="${clipId}"><rect x="${formatNumber(frame.left)}" y="${formatNumber(frame.top)}" width="${formatNumber(plotWidth)}" height="${formatNumber(plotHeight)}"/></clipPath>${hasDirection ? `<marker id="${arrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="context-stroke"/></marker>` : ""}${hasAxisArrow ? `<marker id="${axisArrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#202429"/></marker>` : ""}</defs>`,
  ];
  if (showGrid) {
    for (const value of minorTicks(xAxis)) {
      const x = formatNumber(projectX(value));
      parts.push(
        `<path d="M${x} ${formatNumber(frame.top)}V${formatNumber(frame.bottom)}" stroke="#d9dde1" stroke-width="0.7"/>`,
      );
    }
    for (const value of minorTicks(yAxis)) {
      const y = formatNumber(projectY(value));
      parts.push(
        `<path d="M${formatNumber(frame.left)} ${y}H${formatNumber(frame.right)}" stroke="#d9dde1" stroke-width="0.7"/>`,
      );
    }
    for (const value of tickValues(xAxis)) {
      const x = formatNumber(projectX(value));
      parts.push(
        `<path d="M${x} ${formatNumber(frame.top)}V${formatNumber(frame.bottom)}" stroke="#a0a7ad" stroke-width="1"/>`,
      );
    }
    for (const value of tickValues(yAxis)) {
      const y = formatNumber(projectY(value));
      parts.push(
        `<path d="M${formatNumber(frame.left)} ${y}H${formatNumber(frame.right)}" stroke="#a0a7ad" stroke-width="1"/>`,
      );
    }
  }
  parts.push(
    `<path d="M${formatNumber(frame.left)} ${formatNumber(xAxisY)}H${formatNumber(frame.right)}" fill="none" stroke="#202429" stroke-width="1.7"${xAxis.showArrow ? ` marker-end="url(#${axisArrowId})"` : ""}/>`,
    `<path d="M${formatNumber(yAxisX)} ${formatNumber(frame.bottom)}V${formatNumber(frame.top)}" fill="none" stroke="#202429" stroke-width="1.7"${yAxis.showArrow ? ` marker-end="url(#${axisArrowId})"` : ""}/>`,
  );
  for (const value of tickValues(xAxis)) {
    const x = formatNumber(projectX(value));
    const label = tickLabel(xAxis, value);
    parts.push(
      `<path d="M${x} ${formatNumber(xAxisY - 5)}v10" stroke="#202429"/><text x="${x}" y="${formatNumber(xAxisY + tickFontSize + 9)}" text-anchor="middle" font-size="${tickFontSize}" font-family="Arial, sans-serif">${escapeXml(label)}</text>`,
    );
  }
  for (const value of tickValues(yAxis)) {
    const y = formatNumber(projectY(value));
    const label = tickLabel(yAxis, value);
    parts.push(
      `<path d="M${formatNumber(yAxisX - 5)} ${y}h10" stroke="#202429"/><text x="${formatNumber(yAxisX - 12)}" y="${formatNumber(Number(y) + tickFontSize * 0.35)}" text-anchor="end" font-size="${tickFontSize}" font-family="Arial, sans-serif">${escapeXml(label)}</text>`,
    );
  }

  for (const item of series) {
    const points = data[item.dataRef];
    const stroke = seriesStroke(item);
    const dash = seriesDash(item);
    if (item.kind === "histogram") {
      const projectedCentres = points.map((point) => projectX(point.x));
      const baselineValue =
        yAxis.scale === "linear" &&
        yAxis.domain[0] <= 0 &&
        yAxis.domain[1] >= 0
          ? 0
          : yAxis.domain[0];
      const baseline = projectY(baselineValue);
      points.forEach((point, index) => {
        const centre = projectedCentres[index];
        const previous = projectedCentres[index - 1];
        const next = projectedCentres[index + 1];
        const firstHalfWidth = next === undefined ? plotWidth / 20 : Math.abs(next - centre) / 2;
        const lastHalfWidth = previous === undefined ? plotWidth / 20 : Math.abs(centre - previous) / 2;
        const left = Math.max(frame.left, Math.min(centre - lastHalfWidth, centre + firstHalfWidth));
        const right = Math.min(frame.right, Math.max(centre - lastHalfWidth, centre + firstHalfWidth));
        const top = projectY(point.y);
        parts.push(
          `<rect x="${formatNumber(left)}" y="${formatNumber(Math.min(top, baseline))}" width="${formatNumber(Math.max(0, right - left))}" height="${formatNumber(Math.abs(baseline - top))}" fill="#eef0f2" stroke="${stroke}" stroke-width="1.8" clip-path="url(#${clipId})"/>`,
        );
      });
    } else if (item.kind !== "measured-points" || item.lineStyle) {
      const path = linePath(item, points, projectX, projectY);
      parts.push(
        `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="${formatNumber(seriesStrokeWidth(item))}"${dash ? ` stroke-dasharray="${dash}"` : ""} stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${clipId})"/>`,
      );
      if (item.showDirection) {
        parts.push(
          `<path d="${directionSegment(points, projectX, projectY)}" fill="none" stroke="${stroke}" stroke-width="${formatNumber(seriesStrokeWidth(item))}" marker-end="url(#${arrowId})" stroke-linecap="round" clip-path="url(#${clipId})"/>`,
        );
      }
    }
    const marker =
      item.marker ?? (item.kind === "measured-points" ? "circle" : "none");
    if (marker !== "none") {
      for (const point of points) {
        parts.push(
          renderMarker(marker, point, projectX, projectY, stroke, clipId),
        );
      }
    }
  }

  for (const annotation of annotations) {
    const x = projectX(annotation.position.x);
    const y = projectY(annotation.position.y);
    const offsetX = annotation.offset?.x ?? 8;
    const offsetY = annotation.offset?.y ?? -8;
    const stroke = annotationStroke(annotation);
    if (annotation.kind === "point-label") {
      parts.push(
        `<circle cx="${formatNumber(x)}" cy="${formatNumber(y)}" r="3.2" fill="${stroke}" clip-path="url(#${clipId})"/>`,
      );
    }
    parts.push(
      `<text x="${formatNumber(x + offsetX)}" y="${formatNumber(y + offsetY)}" text-anchor="${annotation.textAnchor ?? "start"}" font-size="${compact ? 13 : 17}" font-family="Arial, sans-serif" fill="${stroke}">${escapeXml(annotation.label)}</text>`,
    );
  }

  parts.push(
    `<text x="${formatNumber((frame.left + frame.right) / 2)}" y="${height - (compact ? 10 : 20)}" text-anchor="middle" font-size="${axisFontSize}" font-family="Arial, sans-serif">${escapeXml(displayLabel(xAxis))}</text>`,
  );
  parts.push(
    `<text transform="translate(${formatNumber(frame.left - (compact ? 50 : 84))} ${formatNumber((frame.top + frame.bottom) / 2)}) rotate(-90)" text-anchor="middle" font-size="${axisFontSize}" font-family="Arial, sans-serif">${escapeXml(displayLabel(yAxis))}</text>`,
  );
  parts.push("</svg>");
  return parts.join("");
}

type CartesianLayer = Extract<VisualLayer, { family: "cartesian_plot" }>;

function cartesianLayers(spec: VisualSpec<"cartesian_plot">): CartesianLayer[] {
  return (spec.layers ?? [])
    .filter(
      (layer): layer is CartesianLayer => layer.family === "cartesian_plot",
    )
    .sort((left, right) => left.zIndex - right.zIndex);
}

function sameAxis(left: AxisSpec, right: AxisSpec): boolean {
  return (
    left.scale === right.scale &&
    left.direction === right.direction &&
    left.domain[0] === right.domain[0] &&
    left.domain[1] === right.domain[1]
  );
}

function renderOverlay(
  spec: VisualSpec<"cartesian_plot">,
  data: CartesianPlotData,
  width: number,
  height: number,
): string {
  const layerPayloads = cartesianLayers(spec).map((layer) => layer.payload);
  for (const payload of layerPayloads) {
    if (
      !sameAxis(spec.payload.xAxis, payload.xAxis) ||
      !sameAxis(spec.payload.yAxis, payload.yAxis)
    ) {
      throw new Error("Overlay plots require shared axis domains and scales");
    }
  }
  const payload: CartesianPlotPayload = {
    ...spec.payload,
    series: [
      ...spec.payload.series,
      ...layerPayloads.flatMap((layer) => layer.series),
    ],
    annotations: [
      ...(spec.payload.annotations ?? []),
      ...layerPayloads.flatMap((layer) => layer.annotations ?? []),
    ],
  };
  return renderSingleCartesianPlot(spec, payload, data, width, height, false);
}

function renderPanels(
  spec: VisualSpec<"cartesian_plot">,
  data: CartesianPlotData,
  options: CartesianRenderOptions,
): string {
  const payloads = [
    spec.payload,
    ...cartesianLayers(spec).map((layer) => layer.payload),
  ];
  if (payloads.length < 2) {
    throw new Error("Panel composition requires at least two Cartesian plots");
  }
  const requestedColumns =
    spec.composition?.columns ??
    (spec.composition?.kind === "sequence"
      ? payloads.length
      : Math.ceil(Math.sqrt(payloads.length)));
  if (
    !Number.isInteger(requestedColumns) ||
    requestedColumns < 1 ||
    requestedColumns > payloads.length
  ) {
    throw new Error("Invalid panel column count");
  }
  const columns = requestedColumns;
  const rows = Math.ceil(payloads.length / columns);
  const width = options.width ?? Math.min(1600, Math.max(720, columns * 420));
  const height =
    options.height ?? Math.min(1200, Math.max(500, rows * 350));
  assertDimensions(width, height);
  const labels = spec.composition?.panelLabels;
  if (labels && labels.length !== payloads.length) {
    throw new Error("Panel labels must match the panel count");
  }
  const gap = 16;
  const padding = 18;
  const cellWidth = Math.floor(
    (width - padding * 2 - gap * (columns - 1)) / columns,
  );
  const cellHeight = Math.floor(
    (height - padding * 2 - gap * (rows - 1)) / rows,
  );
  const labelHeight = labels ? 24 : 0;
  if (cellWidth < 220 || cellHeight - labelHeight < 180) {
    throw new Error("Panel composition is too small to remain readable");
  }
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Multi-panel Cartesian plot">`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
  ];
  payloads.forEach((payload, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = padding + column * (cellWidth + gap);
    const y = padding + row * (cellHeight + gap);
    if (labels) {
      parts.push(
        `<text x="${x}" y="${y + 17}" font-size="16" font-weight="bold" font-family="Arial, sans-serif">${escapeXml(labels[index])}</text>`,
      );
    }
    const childSpec: VisualSpec<"cartesian_plot"> = {
      ...spec,
      id: `${spec.id}-panel-${index + 1}`,
      payload,
      layers: undefined,
      composition: { kind: "single" },
      layoutHints: {
        ...spec.layoutHints,
        compact: true,
      },
    };
    const child = renderSingleCartesianPlot(
      childSpec,
      payload,
      data,
      cellWidth,
      cellHeight - labelHeight,
      true,
    ).replace(
      "<svg ",
      `<svg x="${x}" y="${y + labelHeight}" `,
    );
    parts.push(child);
  });
  parts.push("</svg>");
  return parts.join("");
}

/** Deterministic, student-safe SVG from validated semantic plot data. */
export function renderCartesianPlot(
  spec: VisualSpec<"cartesian_plot">,
  data: CartesianPlotData,
  options: CartesianRenderOptions = {},
): string {
  const validation = validateVisualSpec(spec);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join("; "));
  }
  const composition = spec.composition?.kind ?? "single";
  if (composition === "panel-grid" || composition === "sequence") {
    return renderPanels(spec, data, options);
  }
  const width = options.width ?? 720;
  const height = options.height ?? 500;
  assertDimensions(width, height);
  if (composition === "overlay") {
    return renderOverlay(spec, data, width, height);
  }
  return renderSingleCartesianPlot(
    spec,
    spec.payload,
    data,
    width,
    height,
    false,
  );
}
