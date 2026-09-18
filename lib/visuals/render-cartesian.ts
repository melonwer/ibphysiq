import { validateVisualSpec } from "./template-registry";
import { AxisSpec, Point2D, VisualSpec } from "./types";

export interface CartesianPlotData {
  [dataRef: string]: readonly Point2D[];
}

export interface CartesianRenderOptions {
  width?: number;
  height?: number;
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
    axis.scale !== "linear" ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum >= maximum
  ) {
    throw new Error(`Invalid linear axis domain: ${axis.id}`);
  }
  if (
    axis.tickValues?.some(
      (value) => !Number.isFinite(value) || value < minimum || value > maximum,
    )
  ) {
    throw new Error(`Tick outside axis domain: ${axis.id}`);
  }
  if (
    axis.minorTickStep !== undefined &&
    (!Number.isFinite(axis.minorTickStep) ||
      axis.minorTickStep <= 0 ||
      (maximum - minimum) / axis.minorTickStep > 300)
  ) {
    throw new Error(`Invalid minor tick step: ${axis.id}`);
  }
}

function tickValues(axis: AxisSpec): number[] {
  if (axis.tickValues) return axis.tickValues;
  const [minimum, maximum] = axis.domain;
  return Array.from(
    { length: 6 },
    (_, index) => minimum + ((maximum - minimum) * index) / 5,
  );
}

function minorTicks(axis: AxisSpec): number[] {
  if (!axis.minorTickStep) return [];
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
  const { xAxis, yAxis, series, showGrid = true } = spec.payload;
  validateAxis(xAxis);
  validateAxis(yAxis);
  const publicIds = new Set(spec.visibility.publicParameterIds);
  for (const id of [xAxis.id, yAxis.id]) {
    if (!publicIds.has(id))
      throw new Error(`Axis is not student-visible: ${id}`);
  }
  for (const item of series) {
    for (const id of [item.xParameterId, item.yParameterId, item.dataRef]) {
      if (!publicIds.has(id)) {
        throw new Error(`Series parameter is not student-visible: ${id}`);
      }
    }
    const points = data[item.dataRef];
    if (!points || points.length < 2 || points.length > 1000) {
      throw new Error(`Series needs 2–1000 points: ${item.dataRef}`);
    }
    for (const point of points) {
      if (
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < xAxis.domain[0] - 1e-8 ||
        point.x > xAxis.domain[1] + 1e-8 ||
        point.y < yAxis.domain[0] - 1e-8 ||
        point.y > yAxis.domain[1] + 1e-8
      ) {
        throw new Error(`Series point outside plot domain: ${item.dataRef}`);
      }
    }
  }

  const width = options.width ?? 720;
  const height = options.height ?? 500;
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
  const frame = { left: 112, top: 38, right: width - 80, bottom: height - 84 };
  const aspectRatio = spec.layoutHints?.aspectRatio;
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
    frame.left +
    ((value - xAxis.domain[0]) / (xAxis.domain[1] - xAxis.domain[0])) *
      plotWidth;
  const projectY = (value: number) =>
    frame.bottom -
    ((value - yAxis.domain[0]) / (yAxis.domain[1] - yAxis.domain[0])) *
      plotHeight;
  const xAxisY = projectY(
    Math.max(yAxis.domain[0], Math.min(0, yAxis.domain[1])),
  );
  const yAxisX = projectX(
    Math.max(xAxis.domain[0], Math.min(0, xAxis.domain[1])),
  );
  const clipId = `plot-${spec.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(`${displayLabel(yAxis)} against ${displayLabel(xAxis)}`)}">`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
    `<defs><clipPath id="${clipId}"><rect x="${frame.left}" y="${frame.top}" width="${plotWidth}" height="${plotHeight}"/></clipPath></defs>`,
  ];
  if (showGrid) {
    for (const value of minorTicks(xAxis)) {
      const x = formatNumber(projectX(value));
      parts.push(
        `<path d="M${x} ${frame.top}V${frame.bottom}" stroke="#d9dde1" stroke-width="0.7"/>`,
      );
    }
    for (const value of minorTicks(yAxis)) {
      const y = formatNumber(projectY(value));
      parts.push(
        `<path d="M${frame.left} ${y}H${frame.right}" stroke="#d9dde1" stroke-width="0.7"/>`,
      );
    }
    for (const value of tickValues(xAxis)) {
      const x = formatNumber(projectX(value));
      parts.push(
        `<path d="M${x} ${frame.top}V${frame.bottom}" stroke="#a0a7ad" stroke-width="1"/>`,
      );
    }
    for (const value of tickValues(yAxis)) {
      const y = formatNumber(projectY(value));
      parts.push(
        `<path d="M${frame.left} ${y}H${frame.right}" stroke="#a0a7ad" stroke-width="1"/>`,
      );
    }
  }
  parts.push(
    `<path d="M${frame.left} ${formatNumber(xAxisY)}H${frame.right + 16} M${formatNumber(yAxisX)} ${frame.bottom}V${frame.top - 16}" fill="none" stroke="#202429" stroke-width="1.7"/>`,
  );
  for (const value of tickValues(xAxis)) {
    const x = formatNumber(projectX(value));
    const label =
      xAxis.tickLabels?.[formatNumber(value)] ?? formatNumber(value);
    parts.push(
      `<path d="M${x} ${formatNumber(xAxisY - 5)}v10" stroke="#202429"/><text x="${x}" y="${formatNumber(xAxisY + 26)}" text-anchor="middle" font-size="17" font-family="Arial, sans-serif">${escapeXml(label)}</text>`,
    );
  }
  for (const value of tickValues(yAxis)) {
    const y = formatNumber(projectY(value));
    const label =
      yAxis.tickLabels?.[formatNumber(value)] ?? formatNumber(value);
    parts.push(
      `<path d="M${formatNumber(yAxisX - 5)} ${y}h10" stroke="#202429"/><text x="${formatNumber(yAxisX - 12)}" y="${formatNumber(Number(y) + 6)}" text-anchor="end" font-size="17" font-family="Arial, sans-serif">${escapeXml(label)}</text>`,
    );
  }
  for (const item of series) {
    const path = data[item.dataRef]
      .map(
        (point, index) =>
          `${index ? "L" : "M"}${formatNumber(projectX(point.x))} ${formatNumber(projectY(point.y))}`,
      )
      .join(" ");
    parts.push(
      `<path d="${path}" fill="none" stroke="#15191d" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${clipId})"/>`,
    );
  }
  parts.push(
    `<text x="${formatNumber((frame.left + frame.right) / 2)}" y="${height - 20}" text-anchor="middle" font-size="20" font-family="Arial, sans-serif">${escapeXml(displayLabel(xAxis))}</text>`,
  );
  parts.push(
    `<text transform="translate(${formatNumber(frame.left - 84)} ${formatNumber((frame.top + frame.bottom) / 2)}) rotate(-90)" text-anchor="middle" font-size="20" font-family="Arial, sans-serif">${escapeXml(displayLabel(yAxis))}</text>`,
  );
  parts.push("</svg>");
  return parts.join("");
}
