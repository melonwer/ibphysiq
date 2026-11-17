import { KELVIN_OFFSET, MONATOMIC_ADIABATIC_GAMMA } from "./constants";
import {
  maxwellBoltzmannSpeedDensity,
  planckSpectralExitance,
  solveCalorimetryMixing,
  solveCarnotCycle,
  solveKineticTheory,
  solvePhaseChangeCurve,
  solveThermalRadiation,
  solveThermodynamicProcess,
} from "./solver";
import {
  CalorimetryMixingScenarioSpec,
  CalorimetryMixingSolution,
  CarnotCycleScenarioSpec,
  KineticTheoryScenarioSpec,
  KineticTheorySolution,
  PhaseChangeScenarioSpec,
  PhaseChangeSolution,
  SolvedGasState,
  SolvedProcessLeg,
  ThermalDiagramPlane,
  ThermalRadiationScenarioSpec,
  ThermalRadiationSolution,
  ThermalRenderOptions,
  ThermalScenarioSpec,
  ThermodynamicCycleMetrics,
  ThermodynamicProcessScenarioSpec,
} from "./types";
import {
  computeHalfStepAxisTicks,
  coord,
  createVisibilityController,
  escapeXml,
  formatCleanNumber,
  formatSignificant,
  selectQuantityScale,
  toSubscript,
  VisibilityController,
} from "./visibility";

interface PlotFrame {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

interface Point2D {
  readonly x: number;
  readonly y: number;
}

/**
 * Deterministic lowercase-alpha clipPath identifier (zero ASCII digits 0-9 so
 * clipPath attributes can never collide with hidden numeric quantities).
 */
function makeAlphaClipId(prefix: string, rawId: string | undefined): string {
  const source = `${prefix}::${rawId ?? "default"}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
  }
  let letters = "";
  let n1 = h1;
  let n2 = h2;
  for (let k = 0; k < 4; k++) {
    letters += String.fromCharCode(97 + (n1 % 26));
    n1 = Math.floor(n1 / 26);
  }
  for (let k = 0; k < 4; k++) {
    letters += String.fromCharCode(97 + (n2 % 26));
    n2 = Math.floor(n2 / 26);
  }
  return `${prefix}-${letters}`;
}

/**
 * Substitute scale-equivalent digit-free SI unit names if a power-of-ten unit
 * prefix ("10⁵ Pa", "10⁻³ m³", etc.) collides with a hidden quantity equal to 10.
 */
function safeScaleUnitLabel(
  unitLabel: string,
  vis: VisibilityController,
): string {
  if (!vis.leaksHiddenText(unitLabel)) return unitLabel;
  const fallbackMap: Readonly<Record<string, string>> = {
    "10⁵ Pa": "bar",
    "10⁻³ m³": "dm³",
    "10⁻⁶ m³": "cm³",
    "10⁻³ m⁻¹ s": "km⁻¹ s",
  };
  return fallbackMap[unitLabel] ?? unitLabel;
}

function resolveDimensions(options: ThermalRenderOptions): {
  width: number;
  height: number;
} {
  const width = options.width ?? 720;
  const height = options.height ?? 500;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 320 ||
    width > 1800 ||
    height < 240 ||
    height > 1400
  ) {
    throw new Error(
      "SVG width must be an integer in [320, 1800] and height in [240, 1400].",
    );
  }
  return { width, height };
}

function createFrame(width: number, height: number): PlotFrame {
  const left = 96;
  const right = width - 48;
  const top = 42;
  const bottom = height - 74;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function makeArrowheadPolygon(
  cx: number,
  cy: number,
  ux: number,
  uy: number,
  fill: string,
  size = 6.2,
): string {
  const tipX = cx + ux * size;
  const tipY = cy + uy * size;
  const baseX = cx - ux * (size * 0.85);
  const baseY = cy - uy * (size * 0.85);
  const nx = -uy;
  const ny = ux;
  const wing = size * 0.68;
  const leftX = baseX + nx * wing;
  const leftY = baseY + ny * wing;
  const rightX = baseX - nx * wing;
  const rightY = baseY - ny * wing;
  return `<polygon points="${coord(tipX)},${coord(tipY)} ${coord(leftX)},${coord(leftY)} ${coord(rightX)},${coord(rightY)}" fill="${fill}"/>`;
}

function renderMidPolylineArrow(
  pixelPoints: readonly Point2D[],
  fill = "#15191d",
): string {
  if (pixelPoints.length < 2) return "";
  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 1; i < pixelPoints.length; i++) {
    const dx = pixelPoints[i].x - pixelPoints[i - 1].x;
    const dy = pixelPoints[i].y - pixelPoints[i - 1].y;
    const len = Math.hypot(dx, dy);
    segLengths.push(len);
    totalLen += len;
  }
  if (totalLen < 18) return "";
  const halfLen = totalLen * 0.52;
  let acc = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i];
    if (acc + segLen >= halfLen && segLen > 1e-6) {
      const frac = (halfLen - acc) / segLen;
      const p0 = pixelPoints[i];
      const p1 = pixelPoints[i + 1];
      const cx = p0.x + (p1.x - p0.x) * frac;
      const cy = p0.y + (p1.y - p0.y) * frac;
      const ux = (p1.x - p0.x) / segLen;
      const uy = (p1.y - p0.y) / segLen;
      return makeArrowheadPolygon(cx, cy, ux, uy, fill);
    }
    acc += segLen;
  }
  return "";
}

function renderBaseGridAndAxes(params: {
  frame: PlotFrame;
  svgWidth: number;
  svgHeight: number;
  xDomain: [number, number];
  yDomain: [number, number];
  xMajorTicks: readonly number[];
  xMinorTicks: readonly number[];
  yMajorTicks: readonly number[];
  yMinorTicks: readonly number[];
  showGrid: boolean;
  showNumericXTicks: boolean;
  showNumericYTicks: boolean;
  xAxisTitle: string;
  yAxisTitle: string;
  vis: VisibilityController;
}): string[] {
  const {
    frame,
    svgHeight,
    xDomain,
    yDomain,
    xMajorTicks,
    xMinorTicks,
    yMajorTicks,
    yMinorTicks,
    showGrid,
    showNumericXTicks,
    showNumericYTicks,
    xAxisTitle,
    yAxisTitle,
    vis,
  } = params;

  const projectX = (val: number) =>
    frame.left + ((val - xDomain[0]) / (xDomain[1] - xDomain[0])) * frame.width;
  const projectY = (val: number) =>
    frame.bottom -
    ((val - yDomain[0]) / (yDomain[1] - yDomain[0])) * frame.height;

  const out: string[] = [];

  if (showGrid) {
    if (showNumericXTicks) {
      for (const v of xMinorTicks) {
        const x = coord(projectX(v));
        out.push(
          `<line x1="${x}" y1="${coord(frame.top)}" x2="${x}" y2="${coord(frame.bottom)}" stroke="#e4e8ec" stroke-width="0.7"/>`,
        );
      }
      for (const v of xMajorTicks) {
        const x = coord(projectX(v));
        out.push(
          `<line x1="${x}" y1="${coord(frame.top)}" x2="${x}" y2="${coord(frame.bottom)}" stroke="#bcc4cc" stroke-width="1"/>`,
        );
      }
    }
    if (showNumericYTicks) {
      for (const v of yMinorTicks) {
        const y = coord(projectY(v));
        out.push(
          `<line x1="${coord(frame.left)}" y1="${y}" x2="${coord(frame.right)}" y2="${y}" stroke="#e4e8ec" stroke-width="0.7"/>`,
        );
      }
      for (const v of yMajorTicks) {
        const y = coord(projectY(v));
        out.push(
          `<line x1="${coord(frame.left)}" y1="${y}" x2="${coord(frame.right)}" y2="${y}" stroke="#bcc4cc" stroke-width="1"/>`,
        );
      }
    }
  }

  // Crisp axes with end arrows
  out.push(
    `<line x1="${coord(frame.left)}" y1="${coord(frame.bottom)}" x2="${coord(frame.right + 8)}" y2="${coord(frame.bottom)}" stroke="#202429" stroke-width="1.8"/>`,
    makeArrowheadPolygon(frame.right + 8, frame.bottom, 1, 0, "#202429", 5),
    `<line x1="${coord(frame.left)}" y1="${coord(frame.bottom)}" x2="${coord(frame.left)}" y2="${coord(frame.top - 8)}" stroke="#202429" stroke-width="1.8"/>`,
    makeArrowheadPolygon(frame.left, frame.top - 8, 0, -1, "#202429", 5),
  );

  if (showNumericXTicks) {
    let prevRight = -Infinity;
    for (const v of xMajorTicks) {
      const px = projectX(v);
      const label = formatCleanNumber(v, 4);
      const halfWidth = label.length * 4.6;
      if (px - halfWidth < prevRight + 4) continue;
      prevRight = px + halfWidth;
      out.push(
        `<line x1="${coord(px)}" y1="${coord(frame.bottom - 4)}" x2="${coord(px)}" y2="${coord(frame.bottom + 5)}" stroke="#202429" stroke-width="1.4"/>`,
      );
      if (!vis.leaksHiddenText(label)) {
        out.push(
          `<text x="${coord(px)}" y="${coord(frame.bottom + 22)}" text-anchor="middle" font-size="14" font-family="Arial, sans-serif" fill="#202429">${escapeXml(label)}</text>`,
        );
      }
    }
  }

  if (showNumericYTicks) {
    for (const v of yMajorTicks) {
      const py = projectY(v);
      const label = formatCleanNumber(v, 4);
      out.push(
        `<line x1="${coord(frame.left - 5)}" y1="${coord(py)}" x2="${coord(frame.left + 4)}" y2="${coord(py)}" stroke="#202429" stroke-width="1.4"/>`,
      );
      if (!vis.leaksHiddenText(label)) {
        out.push(
          `<text x="${coord(frame.left - 10)}" y="${coord(py + 5)}" text-anchor="end" font-size="14" font-family="Arial, sans-serif" fill="#202429">${escapeXml(label)}</text>`,
        );
      }
    }
  }

  // Axis titles
  out.push(
    `<text x="${coord((frame.left + frame.right) / 2)}" y="${coord(svgHeight - 18)}" text-anchor="middle" font-size="16" font-family="Arial, sans-serif" fill="#15191d">${escapeXml(xAxisTitle)}</text>`,
    `<text transform="translate(${coord(26)} ${coord((frame.top + frame.bottom) / 2)}) rotate(-90)" text-anchor="middle" font-size="16" font-family="Arial, sans-serif" fill="#15191d">${escapeXml(yAxisTitle)}</text>`,
  );

  return out;
}

/* -------------------------------------------------------------------------- */
/* 1. Thermodynamic Processes & Cycles (PV, PT, VT)                           */
/* -------------------------------------------------------------------------- */

interface GasSamplePoint {
  readonly pressurePa: number;
  readonly volumeM3: number;
  readonly temperatureK: number;
}

function sampleLegCurve(
  leg: SolvedProcessLeg,
  from: SolvedGasState,
  to: SolvedGasState,
  cGas: number,
  sampleCount = 68,
): GasSamplePoint[] {
  const gamma = MONATOMIC_ADIABATIC_GAMMA;
  const pts: GasSamplePoint[] = [];
  for (let k = 0; k <= sampleCount; k++) {
    const s = k / sampleCount;
    if (k === 0) {
      pts.push({
        pressurePa: from.pressurePa,
        volumeM3: from.volumeM3,
        temperatureK: from.temperatureK,
      });
      continue;
    }
    if (k === sampleCount) {
      pts.push({
        pressurePa: to.pressurePa,
        volumeM3: to.volumeM3,
        temperatureK: to.temperatureK,
      });
      continue;
    }
    switch (leg.process) {
      case "isobaric": {
        const v = from.volumeM3 + (to.volumeM3 - from.volumeM3) * s;
        const p = from.pressurePa;
        pts.push({ pressurePa: p, volumeM3: v, temperatureK: (p * v) / cGas });
        break;
      }
      case "isochoric": {
        const p = from.pressurePa + (to.pressurePa - from.pressurePa) * s;
        const v = from.volumeM3;
        pts.push({ pressurePa: p, volumeM3: v, temperatureK: (p * v) / cGas });
        break;
      }
      case "isothermal": {
        const v = from.volumeM3 * (to.volumeM3 / from.volumeM3) ** s;
        const t = from.temperatureK;
        pts.push({ pressurePa: (cGas * t) / v, volumeM3: v, temperatureK: t });
        break;
      }
      case "adiabatic": {
        const v = from.volumeM3 * (to.volumeM3 / from.volumeM3) ** s;
        const p = from.pressurePa * (from.volumeM3 / v) ** gamma;
        pts.push({ pressurePa: p, volumeM3: v, temperatureK: (p * v) / cGas });
        break;
      }
    }
  }
  return pts;
}

function safeStateSymbol(
  state: SolvedGasState,
  vis: VisibilityController,
): string {
  if (!vis.leaksHiddenText(state.label)) return state.label;
  return state.stateIndex < 26
    ? String.fromCharCode(65 + state.stateIndex)
    : `S${toSubscript(state.stateIndex + 1)}`;
}

function renderThermodynamicDiagram(
  spec: ThermodynamicProcessScenarioSpec | CarnotCycleScenarioSpec,
  metrics: ThermodynamicCycleMetrics,
  vis: VisibilityController,
  width: number,
  height: number,
): string {
  const plane: ThermalDiagramPlane = spec.diagramPlane ?? "PV";
  const showGrid = spec.showGrid ?? true;
  const showIsotherms = spec.showIsotherms ?? plane === "PV";
  const showShadedWork = spec.showShadedWork ?? plane === "PV";
  const frame = createFrame(width, height);
  const clipId = makeAlphaClipId("thermclip", spec.id);

  const stateById = new Map(metrics.states.map((s) => [s.stateId, s]));
  const sampledLegs = metrics.legs.map((leg) => {
    const from = stateById.get(leg.fromStateId)!;
    const to = stateById.get(leg.toStateId)!;
    return {
      leg,
      points: sampleLegCurve(leg, from, to, metrics.thermalCapacityConstantJK),
    };
  });

  const allPoints = sampledLegs.flatMap((l) => l.points);
  const maxP = Math.max(...allPoints.map((p) => p.pressurePa));
  const maxV = Math.max(...allPoints.map((p) => p.volumeM3));

  const pScale = selectQuantityScale(maxP, "pressure");
  const vScale = selectQuantityScale(maxV, "volume");

  const getRawX = (pt: GasSamplePoint): number => {
    if (plane === "PV") return pt.volumeM3 * vScale.scaleFactor;
    return pt.temperatureK;
  };
  const getRawY = (pt: GasSamplePoint): number => {
    if (plane === "VT") return pt.volumeM3 * vScale.scaleFactor;
    return pt.pressurePa * pScale.scaleFactor;
  };

  const xValues = allPoints.map(getRawX);
  const yValues = allPoints.map(getRawY);
  const xTickLayout = computeHalfStepAxisTicks(
    Math.min(...xValues),
    Math.max(...xValues),
    true,
  );
  const yTickLayout = computeHalfStepAxisTicks(
    Math.min(...yValues),
    Math.max(...yValues),
    true,
  );

  // Determine whether any quantity on X or Y axis is marked hidden
  const statePressureAliases = metrics.states.flatMap((s) => [
    `state:${s.stateId}:pressurePa`,
    `state:${s.stateIndex}:pressurePa`,
    `P_${s.label}`,
    `P${s.stateIndex + 1}`,
  ]);
  const stateVolumeAliases = metrics.states.flatMap((s) => [
    `state:${s.stateId}:volumeM3`,
    `state:${s.stateIndex}:volumeM3`,
    `V_${s.label}`,
    `V${s.stateIndex + 1}`,
  ]);
  const stateTempAliases = metrics.states.flatMap((s) => [
    `state:${s.stateId}:temperatureK`,
    `state:${s.stateIndex}:temperatureK`,
    `T_${s.label}`,
    `T${s.stateIndex + 1}`,
  ]);

  const anyPressureHidden = vis.isHidden(
    "pressurePa",
    "pressure",
    "P",
    ...statePressureAliases,
  );
  const anyVolumeHidden = vis.isHidden(
    "volumeM3",
    "volume",
    "V",
    "initialVolumeM3",
    "isothermalExpansionVolumeM3",
    ...stateVolumeAliases,
  );
  const anyTempHidden = vis.isHidden(
    "temperatureK",
    "temperature",
    "T",
    "hotTemperatureK",
    "coldTemperatureK",
    "minTemperatureK",
    "maxTemperatureK",
    ...stateTempAliases,
  );

  const anyXTickCollides = xTickLayout.majorTicks.some((v) =>
    vis.leaksHiddenText(formatCleanNumber(v, 4)),
  );
  const anyYTickCollides = yTickLayout.majorTicks.some((v) =>
    vis.leaksHiddenText(formatCleanNumber(v, 4)),
  );
  const hideXNumbers =
    (plane === "PV" ? anyVolumeHidden : anyTempHidden) || anyXTickCollides;
  const hideYNumbers =
    (plane === "VT" ? anyVolumeHidden : anyPressureHidden) || anyYTickCollides;

  const safeVUnit = safeScaleUnitLabel(vScale.unitLabel, vis);
  const safePUnit = safeScaleUnitLabel(pScale.unitLabel, vis);

  const xAxisTitle =
    plane === "PV"
      ? hideXNumbers
        ? "volume V"
        : `volume V / ${safeVUnit}`
      : hideXNumbers
        ? "temperature T"
        : "temperature T / K";
  const yAxisTitle =
    plane === "VT"
      ? hideYNumbers
        ? "volume V"
        : `volume V / ${safeVUnit}`
      : hideYNumbers
        ? "pressure P"
        : `pressure P / ${safePUnit}`;

  const projectX = (val: number) =>
    frame.left +
    ((val - xTickLayout.domain[0]) /
      (xTickLayout.domain[1] - xTickLayout.domain[0])) *
      frame.width;
  const projectY = (val: number) =>
    frame.bottom -
    ((val - yTickLayout.domain[0]) /
      (yTickLayout.domain[1] - yTickLayout.domain[0])) *
      frame.height;

  const ariaLabel =
    plane === "PV"
      ? "Pressure against volume diagram for an ideal gas"
      : plane === "PT"
        ? "Pressure against temperature diagram for an ideal gas"
        : "Volume against temperature diagram for an ideal gas";

  const elements: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(ariaLabel)}">`,
    `<title>${escapeXml(ariaLabel)}</title>`,
    `<desc>${escapeXml(ariaLabel)}</desc>`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
    `<defs><clipPath id="${clipId}"><rect x="${coord(frame.left)}" y="${coord(frame.top)}" width="${coord(frame.width)}" height="${coord(frame.height)}"/></clipPath></defs>`,
  ];

  // Shaded work area on PV diagram (drawn underneath grid/curves)
  if (plane === "PV" && showShadedWork) {
    if (metrics.isClosedCycle) {
      const loopPixels = sampledLegs.flatMap((sl, idx) =>
        (idx === 0 ? sl.points : sl.points.slice(1)).map((pt) => ({
          x: projectX(getRawX(pt)),
          y: projectY(getRawY(pt)),
        })),
      );
      if (loopPixels.length >= 3) {
        const d =
          loopPixels
            .map(
              (p, idx) => `${idx === 0 ? "M" : "L"}${coord(p.x)} ${coord(p.y)}`,
            )
            .join(" ") + " Z";
        elements.push(
          `<path d="${d}" fill="#dfe8f3" fill-opacity="0.65" stroke="none" clip-path="url(#${clipId})"/>`,
        );
      }
    } else {
      for (const sl of sampledLegs) {
        const first = sl.points[0];
        const last = sl.points[sl.points.length - 1];
        if (Math.abs(last.volumeM3 - first.volumeM3) <= 1e-15) continue;
        const curveCmds = sl.points
          .map(
            (pt, idx) =>
              `${idx === 0 ? "M" : "L"}${coord(projectX(getRawX(pt)))} ${coord(projectY(getRawY(pt)))}`,
          )
          .join(" ");
        const d = `${curveCmds} L${coord(projectX(getRawX(last)))} ${coord(frame.bottom)} L${coord(projectX(getRawX(first)))} ${coord(frame.bottom)} Z`;
        elements.push(
          `<path d="${d}" fill="#e4ecf5" fill-opacity="0.58" stroke="none" clip-path="url(#${clipId})"/>`,
        );
      }
    }
  }

  elements.push(
    ...renderBaseGridAndAxes({
      frame,
      svgWidth: width,
      svgHeight: height,
      xDomain: xTickLayout.domain,
      yDomain: yTickLayout.domain,
      xMajorTicks: xTickLayout.majorTicks,
      xMinorTicks: xTickLayout.minorTicks,
      yMajorTicks: yTickLayout.majorTicks,
      yMinorTicks: yTickLayout.minorTicks,
      showGrid,
      showNumericXTicks: !hideXNumbers,
      showNumericYTicks: !hideYNumbers,
      xAxisTitle,
      yAxisTitle,
      vis,
    }),
  );

  // Schematic projection drop-lines and symbolic labels when an axis hides numbers
  if (hideXNumbers) {
    const symPrefix = plane === "PV" ? "V" : "T";
    const seenX: number[] = [];
    for (const s of metrics.states) {
      const rx = getRawX(s);
      const px = projectX(rx);
      if (seenX.some((prev) => Math.abs(prev - px) < 22)) continue;
      seenX.push(px);
      const py = projectY(getRawY(s));
      const sSym = safeStateSymbol(s, vis);
      elements.push(
        `<line x1="${coord(px)}" y1="${coord(py)}" x2="${coord(px)}" y2="${coord(frame.bottom)}" stroke="#7b8590" stroke-width="1.1" stroke-dasharray="4 4"/>`,
        `<text x="${coord(px)}" y="${coord(frame.bottom + 21)}" text-anchor="middle" font-size="14" font-family="Arial, sans-serif" fill="#202429">${escapeXml(`${symPrefix}_${sSym}`)}</text>`,
      );
    }
  }

  if (hideYNumbers) {
    const symPrefix = plane === "VT" ? "V" : "P";
    const seenY: number[] = [];
    for (const s of metrics.states) {
      const ry = getRawY(s);
      const py = projectY(ry);
      if (seenY.some((prev) => Math.abs(prev - py) < 18)) continue;
      seenY.push(py);
      const px = projectX(getRawX(s));
      const sSym = safeStateSymbol(s, vis);
      elements.push(
        `<line x1="${coord(frame.left)}" y1="${coord(py)}" x2="${coord(px)}" y2="${coord(py)}" stroke="#7b8590" stroke-width="1.1" stroke-dasharray="4 4"/>`,
        `<text x="${coord(frame.left - 8)}" y="${coord(py + 5)}" text-anchor="end" font-size="14" font-family="Arial, sans-serif" fill="#202429">${escapeXml(`${symPrefix}_${sSym}`)}</text>`,
      );
    }
  }

  // Reference isotherms on PV diagram
  if (plane === "PV" && showIsotherms) {
    const uniqueTemps: number[] = [];
    for (const s of metrics.states) {
      if (
        !uniqueTemps.some(
          (t) => Math.abs(t - s.temperatureK) / Math.max(t, 1e-12) < 1e-4,
        )
      ) {
        uniqueTemps.push(s.temperatureK);
      }
    }
    const maxDomainV = xTickLayout.domain[1] / vScale.scaleFactor;
    const minSampleV = Math.max(maxDomainV * 0.02, 1e-12);
    for (const tempK of uniqueTemps) {
      const isoPts: Point2D[] = [];
      const steps = 90;
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const v = minSampleV * (maxDomainV / minSampleV) ** frac;
        const p = (metrics.thermalCapacityConstantJK * tempK) / v;
        isoPts.push({
          x: projectX(v * vScale.scaleFactor),
          y: projectY(p * pScale.scaleFactor),
        });
      }
      const d = isoPts
        .map((p, i) => `${i === 0 ? "M" : "L"}${coord(p.x)} ${coord(p.y)}`)
        .join(" ");
      elements.push(
        `<path d="${d}" fill="none" stroke="#7d8894" stroke-width="1.15" stroke-dasharray="5 4" clip-path="url(#${clipId})"/>`,
      );
      if (spec.showIsothermLabels && !anyTempHidden) {
        const isoText = `T = ${formatSignificant(tempK)} K`;
        if (!vis.leaksHiddenText(isoText)) {
          const anchorV = maxDomainV * 0.88;
          const anchorP = (metrics.thermalCapacityConstantJK * tempK) / anchorV;
          const ax = projectX(anchorV * vScale.scaleFactor);
          const ay = projectY(anchorP * pScale.scaleFactor);
          if (ay >= frame.top + 14 && ay <= frame.bottom - 8) {
            elements.push(
              `<text x="${coord(ax - 4)}" y="${coord(ay - 6)}" text-anchor="end" font-size="12" font-family="Arial, sans-serif" fill="#5a6570">${escapeXml(isoText)}</text>`,
            );
          }
        }
      }
    }
  }

  // Origin guide construction lines for isochoric on PT / isobaric on VT
  if (plane === "PT" || plane === "VT") {
    for (const sl of sampledLegs) {
      const isRadial =
        (plane === "PT" && sl.leg.process === "isochoric") ||
        (plane === "VT" && sl.leg.process === "isobaric");
      if (!isRadial) continue;
      const nearPt = sl.points.reduce((best, p) =>
        p.temperatureK < best.temperatureK ? p : best,
      );
      elements.push(
        `<line x1="${coord(projectX(0))}" y1="${coord(projectY(0))}" x2="${coord(projectX(getRawX(nearPt)))}" y2="${coord(projectY(getRawY(nearPt)))}" stroke="#8a949e" stroke-width="1.1" stroke-dasharray="4 4" clip-path="url(#${clipId})"/>`,
      );
    }
  }

  // Primary thermodynamic process legs + directional arrows
  for (const sl of sampledLegs) {
    const pxPts = sl.points.map((pt) => ({
      x: projectX(getRawX(pt)),
      y: projectY(getRawY(pt)),
    }));
    const d = pxPts
      .map((p, idx) => `${idx === 0 ? "M" : "L"}${coord(p.x)} ${coord(p.y)}`)
      .join(" ");
    elements.push(
      `<path d="${d}" fill="none" stroke="#15191d" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#${clipId})"/>`,
    );
    const arrow = renderMidPolylineArrow(pxPts, "#15191d");
    if (arrow) elements.push(arrow);
  }

  // State markers & radial non-overlapping state labels
  const statePixels = metrics.states.map((s) => ({
    state: s,
    px: projectX(getRawX(s)),
    py: projectY(getRawY(s)),
  }));
  const cxMean =
    statePixels.reduce((sum, item) => sum + item.px, 0) / statePixels.length;
  const cyMean =
    statePixels.reduce((sum, item) => sum + item.py, 0) / statePixels.length;

  for (const item of statePixels) {
    elements.push(
      `<circle cx="${coord(item.px)}" cy="${coord(item.py)}" r="4.2" fill="white" stroke="#15191d" stroke-width="2"/>`,
    );
    let dx = item.px - cxMean;
    let dy = item.py - cyMean;
    const norm = Math.hypot(dx, dy);
    if (norm < 1e-3) {
      dx = 0.7;
      dy = -0.7;
    } else {
      dx /= norm;
      dy /= norm;
    }
    const lx = Math.min(
      frame.right - 8,
      Math.max(frame.left + 10, item.px + dx * 16),
    );
    const ly = Math.min(
      frame.bottom - 8,
      Math.max(frame.top + 14, item.py + dy * 16 + 5),
    );
    const sSym = safeStateSymbol(item.state, vis);
    elements.push(
      `<text x="${coord(lx)}" y="${coord(ly)}" text-anchor="middle" font-size="15" font-weight="bold" font-family="Arial, sans-serif" fill="#15191d">${escapeXml(sSym)}</text>`,
    );
  }

  // Optional summary badge ONLY if explicitly marked visible (or teacher-complete)
  // On closed cycles W_net === Q_net, and on Carnot cycles eta === eta_Carnot!
  if (
    metrics.isClosedCycle &&
    vis.isExplicitlyVisible("netWorkJ", "thermalEfficiency")
  ) {
    const summaryParts: string[] = [];
    const netHeatExplicitlyHidden = vis.isExplicitlyHidden(
      "netHeatJ",
      "totalHeatJ",
      "heatJ",
    );
    const wText = `W_net = ${formatSignificant(metrics.netWorkJ)} J`;
    if (
      vis.isExplicitlyVisible("netWorkJ") &&
      !netHeatExplicitlyHidden &&
      !vis.leaksHiddenText(wText)
    ) {
      summaryParts.push(wText);
    }

    if (metrics.thermalEfficiency !== null) {
      const coincidesWithCarnot =
        metrics.carnotEfficiency !== null &&
        Math.abs(metrics.thermalEfficiency - metrics.carnotEfficiency) < 1e-6;
      const carnotExplicitlyHidden =
        coincidesWithCarnot && vis.isExplicitlyHidden("carnotEfficiency");
      const etaText = `η = ${formatSignificant(metrics.thermalEfficiency * 100)}%`;
      if (
        vis.isExplicitlyVisible("thermalEfficiency") &&
        !carnotExplicitlyHidden &&
        !vis.leaksHiddenText(etaText)
      ) {
        summaryParts.push(etaText);
      }
    }

    if (summaryParts.length > 0) {
      elements.push(
        `<text x="${coord(frame.right - 8)}" y="${coord(frame.top + 18)}" text-anchor="end" font-size="13" font-family="Arial, sans-serif" fill="#343c44">${escapeXml(summaryParts.join("   "))}</text>`,
      );
    }
  }

  elements.push("</svg>");
  return elements.join("");
}

/* -------------------------------------------------------------------------- */
/* 2. Phase-Change Heating / Cooling Curve                                    */
/* -------------------------------------------------------------------------- */

function renderPhaseChangeSvg(
  spec: PhaseChangeScenarioSpec,
  sol: PhaseChangeSolution,
  vis: VisibilityController,
  width: number,
  height: number,
): string {
  const frame = createFrame(width, height);
  const xMode = spec.xAxisMode ?? "energy";
  const tempUnit = spec.temperatureDisplayUnit ?? "K";
  const showGrid = spec.showGrid ?? true;
  const showPhaseAnnotations = spec.showPhaseAnnotations ?? true;

  const toDisplayTemp = (k: number) =>
    tempUnit === "C" ? k - KELVIN_OFFSET : k;

  const eScale =
    xMode === "energy"
      ? selectQuantityScale(sol.totalEnergyJ, "energy")
      : { scaleFactor: 1, unitLabel: "s" };

  const rawVertices: Array<{ x: number; y: number }> = [
    { x: 0, y: toDisplayTemp(sol.initialTemperatureK) },
  ];
  for (const stage of sol.stages) {
    const xVal =
      xMode === "time"
        ? stage.cumulativeTimeEndS!
        : stage.cumulativeEnergyEndJ * eScale.scaleFactor;
    rawVertices.push({ x: xVal, y: toDisplayTemp(stage.endTemperatureK) });
  }

  const yValues = rawVertices.map((v) => v.y);
  const xTickLayout = computeHalfStepAxisTicks(
    0,
    rawVertices[rawVertices.length - 1].x,
    true,
  );
  const yTickLayout = computeHalfStepAxisTicks(
    Math.min(...yValues),
    Math.max(...yValues),
    tempUnit === "K" && Math.min(...yValues) < 120,
  );

  const stageEnergyAliases = sol.stages.flatMap((s) => [
    `stage:${s.stageIndex}:energyJ`,
    `stage:${s.stageIndex}:durationS`,
  ]);
  const hideXNumbers =
    vis.isHidden(
      "totalEnergyJ",
      "signedTotalHeatJ",
      "sensibleEnergyJ",
      "latentEnergyJ",
      "energyJ",
      "latentHeatFusionJPerKg",
      "latentHeatVaporizationJPerKg",
      "meltingEnergyJ",
      "boilingEnergyJ",
      "totalDurationS",
      "durationS",
      "meltingDurationS",
      "boilingDurationS",
      "effectivePowerW",
      "heaterPowerW",
      "heaterEfficiency",
      "specificHeatSolidJPerKgK",
      "specificHeatLiquidJPerKgK",
      "specificHeatGasJPerKgK",
      ...stageEnergyAliases,
    ) ||
    xTickLayout.majorTicks.some((v) =>
      vis.leaksHiddenText(formatCleanNumber(v, 4)),
    );
  const hideYNumbers =
    vis.isHidden(
      "temperatureK",
      "T",
      "meltingPointK",
      "meltingPointC",
      "boilingPointK",
      "boilingPointC",
      "initialTemperatureK",
      "initialTemperatureC",
      "finalTemperatureK",
      "finalTemperatureC",
    ) ||
    yTickLayout.majorTicks.some((v) =>
      vis.leaksHiddenText(formatCleanNumber(v, 4)),
    );

  const safeEUnit = safeScaleUnitLabel(eScale.unitLabel, vis);
  const xAxisTitle =
    xMode === "time"
      ? hideXNumbers
        ? "time t"
        : "time t / s"
      : hideXNumbers
        ? "thermal energy transferred Q"
        : `thermal energy transferred Q / ${safeEUnit}`;
  const yAxisTitle = hideYNumbers
    ? "temperature T"
    : `temperature T / ${tempUnit === "C" ? "°C" : "K"}`;

  const projectX = (val: number) =>
    frame.left +
    ((val - xTickLayout.domain[0]) /
      (xTickLayout.domain[1] - xTickLayout.domain[0])) *
      frame.width;
  const projectY = (val: number) =>
    frame.bottom -
    ((val - yTickLayout.domain[0]) /
      (yTickLayout.domain[1] - yTickLayout.domain[0])) *
      frame.height;

  const ariaLabel =
    xMode === "time"
      ? "Temperature against time phase-change graph"
      : "Temperature against thermal energy phase-change graph";

  const elements: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(ariaLabel)}">`,
    `<title>${escapeXml(ariaLabel)}</title>`,
    `<desc>${escapeXml(ariaLabel)}</desc>`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
    ...renderBaseGridAndAxes({
      frame,
      svgWidth: width,
      svgHeight: height,
      xDomain: xTickLayout.domain,
      yDomain: yTickLayout.domain,
      xMajorTicks: xTickLayout.majorTicks,
      xMinorTicks: xTickLayout.minorTicks,
      yMajorTicks: yTickLayout.majorTicks,
      yMinorTicks: yTickLayout.minorTicks,
      showGrid,
      showNumericXTicks: !hideXNumbers,
      showNumericYTicks: !hideYNumbers,
      xAxisTitle,
      yAxisTitle,
      vis,
    }),
  ];

  // Plateau horizontal dashed drop-lines to temperature axis
  for (const stage of sol.stages) {
    if (!stage.isLatentPlateau) continue;
    const xStart =
      xMode === "time"
        ? stage.cumulativeTimeStartS!
        : stage.cumulativeEnergyStartJ * eScale.scaleFactor;
    const py = projectY(toDisplayTemp(stage.startTemperatureK));
    elements.push(
      `<line x1="${coord(frame.left)}" y1="${coord(py)}" x2="${coord(projectX(xStart))}" y2="${coord(py)}" stroke="#7b8590" stroke-width="1.15" stroke-dasharray="5 4"/>`,
    );
    if (hideYNumbers) {
      const sym =
        stage.stageKind === "melting" || stage.stageKind === "freezing"
          ? "T_m"
          : "T_b";
      elements.push(
        `<text x="${coord(frame.left - 8)}" y="${coord(py + 5)}" text-anchor="end" font-size="14" font-family="Arial, sans-serif" fill="#202429">${sym}</text>`,
      );
    }
  }

  if (hideXNumbers) {
    const prefix = xMode === "time" ? "t" : "Q";
    let prevPx = -Infinity;
    rawVertices.slice(1).forEach((v, idx) => {
      const px = projectX(v.x);
      if (px - prevPx < 26) return;
      prevPx = px;
      elements.push(
        `<line x1="${coord(px)}" y1="${coord(projectY(v.y))}" x2="${coord(px)}" y2="${coord(frame.bottom)}" stroke="#7b8590" stroke-width="1.05" stroke-dasharray="4 4"/>`,
        `<text x="${coord(px)}" y="${coord(frame.bottom + 21)}" text-anchor="middle" font-size="13" font-family="Arial, sans-serif" fill="#202429">${escapeXml(`${prefix}${toSubscript(idx + 1)}`)}</text>`,
      );
    });
  }

  // Piecewise linear phase-change curve
  const polyCmds = rawVertices
    .map(
      (v, idx) =>
        `${idx === 0 ? "M" : "L"}${coord(projectX(v.x))} ${coord(projectY(v.y))}`,
    )
    .join(" ");
  elements.push(
    `<path d="${polyCmds}" fill="none" stroke="#15191d" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`,
  );

  for (const v of rawVertices) {
    elements.push(
      `<circle cx="${coord(projectX(v.x))}" cy="${coord(projectY(v.y))}" r="3.6" fill="#15191d"/>`,
    );
  }

  if (showPhaseAnnotations) {
    const labelMap: Record<string, string> = {
      solid: "solid",
      melting: "solid + liquid",
      freezing: "liquid + solid",
      liquid: "liquid",
      boiling: "liquid + gas",
      condensing: "gas + liquid",
      gas: "gas",
    };
    for (const stage of sol.stages) {
      const x0 = projectX(
        xMode === "time"
          ? stage.cumulativeTimeStartS!
          : stage.cumulativeEnergyStartJ * eScale.scaleFactor,
      );
      const x1 = projectX(
        xMode === "time"
          ? stage.cumulativeTimeEndS!
          : stage.cumulativeEnergyEndJ * eScale.scaleFactor,
      );
      const y0 = projectY(toDisplayTemp(stage.startTemperatureK));
      const y1 = projectY(toDisplayTemp(stage.endTemperatureK));
      if (Math.hypot(x1 - x0, y1 - y0) < 52) continue;
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2 - 10;
      elements.push(
        `<text x="${coord(mx)}" y="${coord(Math.max(frame.top + 14, my))}" text-anchor="middle" font-size="12.5" font-family="Arial, sans-serif" fill="#4f5962">${escapeXml(labelMap[stage.stageKind] ?? stage.stageKind)}</text>`,
      );
    }
  }

  elements.push("</svg>");
  return elements.join("");
}

/* -------------------------------------------------------------------------- */
/* 3. Calorimetry Thermal Equilibrium Mixing                                  */
/* -------------------------------------------------------------------------- */

function renderCalorimetrySchematicSvg(
  spec: CalorimetryMixingScenarioSpec,
  sol: CalorimetryMixingSolution,
  vis: VisibilityController,
  width: number,
  height: number,
): string {
  const tempUnit = spec.temperatureDisplayUnit ?? "K";
  const fmtTemp = (k: number) =>
    tempUnit === "C"
      ? `${formatSignificant(k - KELVIN_OFFSET)} °C`
      : `${formatSignificant(k)} K`;

  const ariaLabel = "Insulated calorimeter thermal equilibrium diagram";
  const elements: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(ariaLabel)}">`,
    `<title>${escapeXml(ariaLabel)}</title>`,
    `<desc>${escapeXml(ariaLabel)}</desc>`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
  ];

  // Apparatus geometry on the left half
  const cx = Math.round(width * 0.29);
  const topY = 92;
  const outerW = 210;
  const outerH = 290;
  const wall = 14;
  const innerX = cx - outerW / 2 + wall;
  const innerY = topY + wall;
  const innerW = outerW - wall * 2;
  const innerH = outerH - wall * 2;
  const liquidTopY = innerY + 68;

  // Outer insulated jacket + lid
  elements.push(
    `<rect x="${coord(cx - outerW / 2)}" y="${coord(topY)}" width="${coord(outerW)}" height="${coord(outerH)}" rx="6" fill="#eceff2" stroke="#202429" stroke-width="2"/>`,
    `<rect x="${coord(cx - outerW / 2 - 8)}" y="${coord(topY - 14)}" width="${coord(outerW + 16)}" height="14" rx="3" fill="#d9dfe5" stroke="#202429" stroke-width="1.8"/>`,
    `<rect x="${coord(innerX)}" y="${coord(innerY)}" width="${coord(innerW)}" height="${coord(innerH)}" fill="white" stroke="#202429" stroke-width="1.6"/>`,
    // Liquid bath
    `<rect x="${coord(innerX + 1)}" y="${coord(liquidTopY)}" width="${coord(innerW - 2)}" height="${coord(innerY + innerH - liquidTopY - 1)}" fill="#e3eef8"/>`,
    `<line x1="${coord(innerX + 1)}" y1="${coord(liquidTopY)}" x2="${coord(innerX + innerW - 1)}" y2="${coord(liquidTopY)}" stroke="#3b5b78" stroke-width="1.6" stroke-dasharray="6 3"/>`,
  );

  // Thermometer & stirrer piercing the lid
  const thermX = cx - 36;
  const stirX = cx + 44;
  elements.push(
    `<rect x="${coord(thermX - 4)}" y="42" width="8" height="${coord(liquidTopY + 118 - 42)}" rx="3" fill="white" stroke="#202429" stroke-width="1.6"/>`,
    `<circle cx="${coord(thermX)}" cy="${coord(liquidTopY + 122)}" r="7.5" fill="#4f5962" stroke="#202429" stroke-width="1.6"/>`,
    `<line x1="${coord(thermX)}" y1="98" x2="${coord(thermX)}" y2="${coord(liquidTopY + 118)}" stroke="#4f5962" stroke-width="2.4"/>`,
    `<line x1="${coord(stirX)}" y1="48" x2="${coord(stirX)}" y2="${coord(liquidTopY + 135)}" stroke="#202429" stroke-width="2"/>`,
    `<ellipse cx="${coord(stirX)}" cy="${coord(liquidTopY + 138)}" rx="14" ry="4.5" fill="none" stroke="#202429" stroke-width="2"/>`,
  );

  // Submerged sample block inside bath + heat flow arrows
  const sampleX = cx - 12;
  const sampleY = innerY + innerH - 64;
  elements.push(
    `<rect x="${coord(sampleX - 28)}" y="${coord(sampleY)}" width="56" height="42" rx="4" fill="#cfd6dd" stroke="#202429" stroke-width="1.8"/>`,
    `<line x1="${coord(sampleX)}" y1="${coord(sampleY - 4)}" x2="${coord(sampleX)}" y2="${coord(sampleY - 32)}" stroke="#202429" stroke-width="1.6"/>`,
    makeArrowheadPolygon(sampleX, sampleY - 32, 0, -1, "#202429", 5),
    `<text x="${coord(cx)}" y="${coord(topY + outerH + 26)}" text-anchor="middle" font-size="14" font-family="Arial, sans-serif" fill="#343c44">insulated calorimeter</text>`,
  );

  // Component & Equilibrium cards on the right half (strictly student-safe)
  const cardLeft = Math.round(width * 0.54);
  const cardWidth = width - cardLeft - 32;
  let cursorY = 66;

  sol.components.forEach((comp, idx) => {
    const specComp = spec.components[idx];
    const mFormatted = formatSignificant(comp.massKg);
    const hideMass =
      vis.isHidden(
        "massKg",
        `component:${idx}:massKg`,
        `component:${comp.id}:massKg`,
      ) ||
      vis.leaksHiddenText(mFormatted) ||
      vis.matchesHiddenValue(comp.massKg);

    const eqCoincidesAndHidden =
      Math.abs(comp.initialTemperatureK - sol.equilibriumTemperatureK) < 1e-6 &&
      vis.isHidden(
        "equilibriumTemperatureK",
        "equilibriumTemperatureC",
        "T_eq",
      );
    const tFormatted = fmtTemp(comp.initialTemperatureK);
    const hideInitT =
      eqCoincidesAndHidden ||
      vis.isHidden(
        "initialTemperatureK",
        "temperatureK",
        `component:${idx}:initialTemperatureK`,
        `component:${comp.id}:initialTemperatureK`,
      ) ||
      vis.leaksHiddenText(tFormatted) ||
      vis.matchesHiddenValue(comp.initialTemperatureK);

    const detailParts: string[] = [];
    detailParts.push(hideMass ? "m = ?" : `m = ${mFormatted} kg`);
    detailParts.push(hideInitT ? "T_i = ?" : `T_i = ${tFormatted}`);
    if (specComp.specificHeatJPerKgK !== undefined) {
      const cFormatted = formatSignificant(specComp.specificHeatJPerKgK);
      const hideC =
        vis.isHidden(
          "specificHeatJPerKgK",
          "specificHeatSolidJPerKgK",
          "specificHeatLiquidJPerKgK",
          `component:${idx}:specificHeatJPerKgK`,
          `component:${comp.id}:specificHeatJPerKgK`,
        ) ||
        vis.leaksHiddenText(cFormatted) ||
        vis.matchesHiddenValue(specComp.specificHeatJPerKgK);
      detailParts.push(hideC ? "c = ?" : `c = ${cFormatted} J kg⁻¹ K⁻¹`);
    }

    const safeCompLabel = vis.leaksHiddenText(comp.label)
      ? `Component ${String.fromCharCode(65 + (idx % 26))}`
      : comp.label;

    elements.push(
      `<rect x="${coord(cardLeft)}" y="${coord(cursorY)}" width="${coord(cardWidth)}" height="64" rx="6" fill="#f8fafc" stroke="#c5cdd5" stroke-width="1.3"/>`,
      `<text x="${coord(cardLeft + 14)}" y="${coord(cursorY + 24)}" font-size="14.5" font-weight="bold" font-family="Arial, sans-serif" fill="#15191d">${escapeXml(safeCompLabel)}</text>`,
      `<text x="${coord(cardLeft + 14)}" y="${coord(cursorY + 47)}" font-size="13" font-family="Arial, sans-serif" fill="#343c44">${escapeXml(detailParts.join("  |  "))}</text>`,
    );
    cursorY += 78;
  });

  // Equilibrium state box: NEVER show numeric equilibrium temperature unless explicitly visible
  const eqFormatted = fmtTemp(sol.equilibriumTemperatureK);
  const showEqValue =
    vis.isExplicitlyVisible(
      "equilibriumTemperatureK",
      "equilibriumTemperatureC",
      "T_eq",
    ) &&
    !vis.leaksHiddenText(eqFormatted) &&
    !vis.matchesHiddenValue(sol.equilibriumTemperatureK);
  const eqText = showEqValue
    ? `Thermal equilibrium: T_eq = ${eqFormatted}`
    : "Thermal equilibrium: T_eq";

  elements.push(
    `<rect x="${coord(cardLeft)}" y="${coord(cursorY + 6)}" width="${coord(cardWidth)}" height="48" rx="6" fill="#eef3f8" stroke="#8a99a8" stroke-width="1.4"/>`,
    `<text x="${coord(cardLeft + 14)}" y="${coord(cursorY + 35)}" font-size="14" font-weight="bold" font-family="Arial, sans-serif" fill="#15191d">${escapeXml(eqText)}</text>`,
  );

  elements.push("</svg>");
  return elements.join("");
}

function renderCalorimetryConvergenceSvg(
  spec: CalorimetryMixingScenarioSpec,
  sol: CalorimetryMixingSolution,
  vis: VisibilityController,
  width: number,
  height: number,
): string {
  const frame = createFrame(width, height);
  const tempUnit = spec.temperatureDisplayUnit ?? "K";
  const showGrid = spec.showGrid ?? true;
  const toDisp = (k: number) => (tempUnit === "C" ? k - KELVIN_OFFSET : k);

  const allTemps = [
    sol.equilibriumTemperatureK,
    ...sol.components.map((c) => c.initialTemperatureK),
  ].map(toDisp);
  const yTickLayout = computeHalfStepAxisTicks(
    Math.min(...allTemps),
    Math.max(...allTemps),
    false,
  );
  const xTickLayout = computeHalfStepAxisTicks(0, 10, true);

  const hideEq =
    vis.isHidden(
      "equilibriumTemperatureK",
      "equilibriumTemperatureC",
      "T_eq",
    ) ||
    (vis.mode === "student-safe" &&
      !vis.isExplicitlyVisible(
        "equilibriumTemperatureK",
        "equilibriumTemperatureC",
        "T_eq",
      ));
  const compInitTempAliases = sol.components.flatMap((c, idx) => [
    `component:${idx}:initialTemperatureK`,
    `component:${c.id}:initialTemperatureK`,
  ]);
  const hideAnyInitT = vis.isHidden(
    "initialTemperatureK",
    "temperatureK",
    "T",
    ...compInitTempAliases,
  );
  const showNumericY =
    !hideEq &&
    !hideAnyInitT &&
    !yTickLayout.majorTicks.some((v) =>
      vis.leaksHiddenText(formatCleanNumber(v, 4)),
    );

  const ariaLabel = "Temperature against time thermal equilibrium graph";
  const elements: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(ariaLabel)}">`,
    `<title>${escapeXml(ariaLabel)}</title>`,
    `<desc>${escapeXml(ariaLabel)}</desc>`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
    ...renderBaseGridAndAxes({
      frame,
      svgWidth: width,
      svgHeight: height,
      xDomain: xTickLayout.domain,
      yDomain: yTickLayout.domain,
      xMajorTicks: xTickLayout.majorTicks,
      xMinorTicks: xTickLayout.minorTicks,
      yMajorTicks: yTickLayout.majorTicks,
      yMinorTicks: yTickLayout.minorTicks,
      showGrid,
      showNumericXTicks: false,
      showNumericYTicks: showNumericY,
      xAxisTitle: "time t",
      yAxisTitle: showNumericY
        ? `temperature T / ${tempUnit === "C" ? "°C" : "K"}`
        : "temperature T",
      vis,
    }),
  ];

  const projectX = (val: number) =>
    frame.left +
    ((val - xTickLayout.domain[0]) /
      (xTickLayout.domain[1] - xTickLayout.domain[0])) *
      frame.width;
  const projectY = (val: number) =>
    frame.bottom -
    ((val - yTickLayout.domain[0]) /
      (yTickLayout.domain[1] - yTickLayout.domain[0])) *
      frame.height;

  const eqY = projectY(toDisp(sol.equilibriumTemperatureK));
  elements.push(
    `<line x1="${coord(frame.left)}" y1="${coord(eqY)}" x2="${coord(frame.right)}" y2="${coord(eqY)}" stroke="#5a6570" stroke-width="1.5" stroke-dasharray="6 4"/>`,
    `<text x="${coord(frame.left - 8)}" y="${coord(eqY + 5)}" text-anchor="end" font-size="14" font-family="Arial, sans-serif" fill="#202429">T_eq</text>`,
  );

  sol.components.forEach((comp, idx) => {
    const startT = toDisp(comp.initialTemperatureK);
    const endT = toDisp(sol.equilibriumTemperatureK);
    const samples = 60;
    const pts: string[] = [];
    for (let i = 0; i <= samples; i++) {
      const t = (10 * i) / samples;
      const temp = endT + (startT - endT) * Math.exp(-t / 2.2);
      pts.push(
        `${i === 0 ? "M" : "L"}${coord(projectX(t))} ${coord(projectY(temp))}`,
      );
    }
    const dash = idx % 2 === 1 ? ' stroke-dasharray="8 4"' : "";
    const safeCompLabel = vis.leaksHiddenText(comp.label)
      ? `Component ${String.fromCharCode(65 + (idx % 26))}`
      : comp.label;
    elements.push(
      `<path d="${pts.join(" ")}" fill="none" stroke="#15191d" stroke-width="2.2"${dash}/>`,
      `<text x="${coord(projectX(1.6))}" y="${coord(projectY(endT + (startT - endT) * Math.exp(-1.6 / 2.2)) - 8)}" font-size="13" font-family="Arial, sans-serif" fill="#202429">${escapeXml(safeCompLabel)}</text>`,
    );
  });

  elements.push("</svg>");
  return elements.join("");
}

/* -------------------------------------------------------------------------- */
/* 4. Kinetic Theory: Maxwell-Boltzmann Speed Distribution                    */
/* -------------------------------------------------------------------------- */

function renderKineticTheorySvg(
  spec: KineticTheoryScenarioSpec,
  sol: KineticTheorySolution,
  vis: VisibilityController,
  width: number,
  height: number,
): string {
  const kB = spec.boltzmannConstant;
  const frame = createFrame(width, height);
  const showGrid = spec.showGrid ?? true;
  const showSpeeds = spec.showCharacteristicSpeeds ?? true;
  const clipId = makeAlphaClipId("mbclip", spec.id);

  const maxRefRms = Math.max(sol.rmsSpeedMs, sol.comparisonRmsSpeedMs ?? 0);
  const maxSpeed = maxRefRms * 2.65;
  const sampleCount = 120;

  const primarySamples: Point2D[] = [];
  const compSamples: Point2D[] = [];
  for (let i = 0; i <= sampleCount; i++) {
    const v = (maxSpeed * i) / sampleCount;
    primarySamples.push({
      x: v,
      y: maxwellBoltzmannSpeedDensity(
        v,
        sol.temperatureK,
        sol.particleMassKg,
        kB,
      ),
    });
    if (sol.comparisonTemperatureK !== null) {
      compSamples.push({
        x: v,
        y: maxwellBoltzmannSpeedDensity(
          v,
          sol.comparisonTemperatureK,
          sol.particleMassKg,
          kB,
        ),
      });
    }
  }

  const maxDensity = Math.max(
    ...primarySamples.map((p) => p.y),
    ...compSamples.map((p) => p.y),
  );
  // Normalize density to 10^-3 (m s^-1)^-1 for compact ticks
  const yScale = 1e3;
  const xTickLayout = computeHalfStepAxisTicks(0, maxSpeed, true);
  const yTickLayout = computeHalfStepAxisTicks(0, maxDensity * yScale, true);

  const hideSpeedNumbers = vis.isHidden(
    "rmsSpeedMs",
    "meanSpeedMs",
    "mostProbableSpeedMs",
    "comparisonRmsSpeedMs",
    "comparisonMeanSpeedMs",
    "comparisonMostProbableSpeedMs",
  );
  const hideKtXNumbers =
    hideSpeedNumbers ||
    xTickLayout.majorTicks.some((v) =>
      vis.leaksHiddenText(formatCleanNumber(v, 4)),
    );
  const hideKtYNumbers =
    hideSpeedNumbers ||
    yTickLayout.majorTicks.some((v) =>
      vis.leaksHiddenText(formatCleanNumber(v, 4)),
    );
  const hideTemp = vis.isHidden(
    "temperatureK",
    "T",
    "comparisonTemperatureK",
    "averageKineticEnergyJ",
    "comparisonAverageKineticEnergyJ",
    "molarInternalEnergyJPerMol",
  );
  const hideMass = vis.isHidden(
    "molarMassKgPerMol",
    "particleMassKg",
    "M",
    "m",
  );

  const safeDensityUnit = safeScaleUnitLabel("10⁻³ m⁻¹ s", vis);
  const ariaLabel = "Maxwell-Boltzmann molecular speed distribution graph";
  const elements: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(ariaLabel)}">`,
    `<title>${escapeXml(ariaLabel)}</title>`,
    `<desc>${escapeXml(ariaLabel)}</desc>`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
    `<defs><clipPath id="${clipId}"><rect x="${coord(frame.left)}" y="${coord(frame.top)}" width="${coord(frame.width)}" height="${coord(frame.height)}"/></clipPath></defs>`,
    ...renderBaseGridAndAxes({
      frame,
      svgWidth: width,
      svgHeight: height,
      xDomain: xTickLayout.domain,
      yDomain: yTickLayout.domain,
      xMajorTicks: xTickLayout.majorTicks,
      xMinorTicks: xTickLayout.minorTicks,
      yMajorTicks: yTickLayout.majorTicks,
      yMinorTicks: yTickLayout.minorTicks,
      showGrid,
      showNumericXTicks: !hideKtXNumbers,
      showNumericYTicks: !hideKtYNumbers,
      xAxisTitle: hideKtXNumbers
        ? "molecular speed v"
        : "molecular speed v / m s⁻¹",
      yAxisTitle: hideKtYNumbers
        ? "probability density f(v)"
        : `probability density f(v) / ${safeDensityUnit}`,
      vis,
    }),
  ];

  const projectX = (val: number) =>
    frame.left +
    ((val - xTickLayout.domain[0]) /
      (xTickLayout.domain[1] - xTickLayout.domain[0])) *
      frame.width;
  const projectY = (val: number) =>
    frame.bottom -
    ((val - yTickLayout.domain[0]) /
      (yTickLayout.domain[1] - yTickLayout.domain[0])) *
      frame.height;

  if (compSamples.length > 0) {
    const compPath = compSamples
      .map(
        (p, idx) =>
          `${idx === 0 ? "M" : "L"}${coord(projectX(p.x))} ${coord(projectY(p.y * yScale))}`,
      )
      .join(" ");
    elements.push(
      `<path d="${compPath}" fill="none" stroke="#5a6570" stroke-width="1.9" stroke-dasharray="7 4" clip-path="url(#${clipId})"/>`,
    );
  }

  const primPath = primarySamples
    .map(
      (p, idx) =>
        `${idx === 0 ? "M" : "L"}${coord(projectX(p.x))} ${coord(projectY(p.y * yScale))}`,
    )
    .join(" ");
  elements.push(
    `<path d="${primPath}" fill="none" stroke="#15191d" stroke-width="2.4" clip-path="url(#${clipId})"/>`,
  );

  // Characteristic speeds markers on primary curve
  if (showSpeeds) {
    const markers: Array<{ speed: number; label: string }> = [
      { speed: sol.mostProbableSpeedMs, label: "v_p" },
      { speed: sol.meanSpeedMs, label: "v̄" },
      { speed: sol.rmsSpeedMs, label: "v_rms" },
    ];
    markers.forEach((m, idx) => {
      const dens = maxwellBoltzmannSpeedDensity(
        m.speed,
        sol.temperatureK,
        sol.particleMassKg,
        kB,
      );
      const px = projectX(m.speed);
      const py = projectY(dens * yScale);
      elements.push(
        `<line x1="${coord(px)}" y1="${coord(py)}" x2="${coord(px)}" y2="${coord(frame.bottom)}" stroke="#69747d" stroke-width="1.15" stroke-dasharray="4 4"/>`,
        `<circle cx="${coord(px)}" cy="${coord(py)}" r="3.2" fill="#15191d"/>`,
        `<text x="${coord(px + (idx - 1) * 8)}" y="${coord(Math.max(frame.top + 14, py - 10 - (idx === 1 ? 10 : 0)))}" text-anchor="middle" font-size="12.5" font-family="Arial, sans-serif" fill="#202429">${escapeXml(m.label)}</text>`,
      );
    });
  }

  // Legend top-right (suppress gasLabel when mass is hidden so e.g. "Helium-4" never leaks M = 4 g/mol)
  const gasTitle =
    spec.gasLabel && !hideMass && !vis.leaksHiddenText(spec.gasLabel)
      ? `${spec.gasLabel}: `
      : "";
  const candidatePrimLegend = `${gasTitle}T = ${formatSignificant(sol.temperatureK)} K`;
  const primLegend =
    hideTemp || vis.leaksHiddenText(candidatePrimLegend)
      ? `${gasTitle}T₁`
      : candidatePrimLegend;
  elements.push(
    `<text x="${coord(frame.right - 10)}" y="${coord(frame.top + 20)}" text-anchor="end" font-size="13.5" font-family="Arial, sans-serif" fill="#15191d">${escapeXml(primLegend)}</text>`,
  );
  if (sol.comparisonTemperatureK !== null) {
    const candidateCompLegend = `T₂ = ${formatSignificant(sol.comparisonTemperatureK)} K (dashed)`;
    const compLegend =
      hideTemp || vis.leaksHiddenText(candidateCompLegend)
        ? "T₂ (dashed)"
        : candidateCompLegend;
    elements.push(
      `<text x="${coord(frame.right - 10)}" y="${coord(frame.top + 40)}" text-anchor="end" font-size="13" font-family="Arial, sans-serif" fill="#5a6570">${escapeXml(compLegend)}</text>`,
    );
  }

  elements.push("</svg>");
  return elements.join("");
}

/* -------------------------------------------------------------------------- */
/* 5. Thermal Radiation: Planck Blackbody / Greybody Spectral Curve           */
/* -------------------------------------------------------------------------- */

function renderThermalRadiationSvg(
  spec: ThermalRadiationScenarioSpec,
  sol: ThermalRadiationSolution,
  vis: VisibilityController,
  width: number,
  height: number,
): string {
  const frame = createFrame(width, height);
  const showGrid = spec.showGrid ?? true;
  const showVisible = spec.showVisibleBand ?? true;
  const clipId = makeAlphaClipId("bbclip", spec.id);

  const maxPeakWavelength = Math.max(
    sol.peakWavelengthM,
    sol.comparisonPeakWavelengthM ?? 0,
  );
  const minPeakWavelength = Math.min(
    sol.peakWavelengthM,
    sol.comparisonPeakWavelengthM ?? sol.peakWavelengthM,
  );
  const maxLambdaM = maxPeakWavelength * 4.2;
  const minLambdaM = minPeakWavelength * 0.14;

  const wScale = selectQuantityScale(maxLambdaM, "wavelength");
  const sampleCount = 150;

  const primarySamples: Point2D[] = [{ x: 0, y: 0 }];
  const compSamples: Point2D[] =
    sol.comparisonTemperatureK !== null ? [{ x: 0, y: 0 }] : [];

  for (let i = 0; i <= sampleCount; i++) {
    const lambdaM = minLambdaM + ((maxLambdaM - minLambdaM) * i) / sampleCount;
    primarySamples.push({
      x: lambdaM * wScale.scaleFactor,
      y: planckSpectralExitance(
        lambdaM,
        sol.temperatureK,
        sol.emissivity,
        spec.wienConstantMK,
        spec.stefanBoltzmannConstant,
      ),
    });
    if (sol.comparisonTemperatureK !== null) {
      compSamples.push({
        x: lambdaM * wScale.scaleFactor,
        y: planckSpectralExitance(
          lambdaM,
          sol.comparisonTemperatureK,
          sol.comparisonEmissivity ?? 1,
          spec.wienConstantMK,
          spec.stefanBoltzmannConstant,
        ),
      });
    }
  }

  const maxExitance = Math.max(
    ...primarySamples.map((p) => p.y),
    ...compSamples.map((p) => p.y),
  );
  const yOrder =
    maxExitance > 0 ? 10 ** Math.floor(Math.log10(maxExitance)) : 1;
  const yNormFactor = 1 / yOrder;

  const xTickLayout = computeHalfStepAxisTicks(
    0,
    maxLambdaM * wScale.scaleFactor,
    true,
  );
  const yTickLayout = computeHalfStepAxisTicks(
    0,
    maxExitance * yNormFactor,
    true,
  );

  const hideWavelength =
    vis.isHidden(
      "peakWavelengthM",
      "peakWavelengthNm",
      "lambdaMax",
      "comparisonPeakWavelengthM",
      "comparisonPeakWavelengthNm",
    ) ||
    xTickLayout.majorTicks.some((v) =>
      vis.leaksHiddenText(formatCleanNumber(v, 4)),
    );
  const hidePowerOrIntensity =
    vis.isHidden(
      "radiatedPowerW",
      "P",
      "radiatedIntensityWm2",
      "netRadiatedPowerW",
      "intensityAtDistanceWm2",
      "emissivity",
      "comparisonEmissivity",
      "comparisonRadiatedPowerW",
      "comparisonPowerRatio",
    ) ||
    yTickLayout.majorTicks.some((v) =>
      vis.leaksHiddenText(formatCleanNumber(v, 4)),
    );
  const ambientCoincidesPrimary =
    sol.ambientTemperatureK !== null &&
    Math.abs(sol.ambientTemperatureK - sol.temperatureK) < 1e-6;
  const hideTemp =
    vis.isHidden("temperatureK", "T", "comparisonTemperatureK") ||
    (ambientCoincidesPrimary && vis.isHidden("ambientTemperatureK"));

  const safeWUnit = safeScaleUnitLabel(wScale.unitLabel, vis);
  const ariaLabel =
    "Spectral radiance against wavelength thermal radiation graph";
  const elements: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(ariaLabel)}">`,
    `<title>${escapeXml(ariaLabel)}</title>`,
    `<desc>${escapeXml(ariaLabel)}</desc>`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
    `<defs><clipPath id="${clipId}"><rect x="${coord(frame.left)}" y="${coord(frame.top)}" width="${coord(frame.width)}" height="${coord(frame.height)}"/></clipPath></defs>`,
  ];

  const projectX = (val: number) =>
    frame.left +
    ((val - xTickLayout.domain[0]) /
      (xTickLayout.domain[1] - xTickLayout.domain[0])) *
      frame.width;
  const projectY = (val: number) =>
    frame.bottom -
    ((val - yTickLayout.domain[0]) /
      (yTickLayout.domain[1] - yTickLayout.domain[0])) *
      frame.height;

  // Optional subtle visible-light band (400 nm - 700 nm) when visible on domain
  if (showVisible && !hideWavelength) {
    const visLeft = 400e-9 * wScale.scaleFactor;
    const visRight = 700e-9 * wScale.scaleFactor;
    const pxL = projectX(visLeft);
    const pxR = projectX(visRight);
    if (pxR - pxL >= 14 && pxL >= frame.left && pxR <= frame.right) {
      elements.push(
        `<rect x="${coord(pxL)}" y="${coord(frame.top)}" width="${coord(pxR - pxL)}" height="${coord(frame.height)}" fill="#f3f5f8" clip-path="url(#${clipId})"/>`,
        `<text x="${coord((pxL + pxR) / 2)}" y="${coord(frame.top + 16)}" text-anchor="middle" font-size="11" font-family="Arial, sans-serif" fill="#69747d">visible</text>`,
      );
    }
  }

  elements.push(
    ...renderBaseGridAndAxes({
      frame,
      svgWidth: width,
      svgHeight: height,
      xDomain: xTickLayout.domain,
      yDomain: yTickLayout.domain,
      xMajorTicks: xTickLayout.majorTicks,
      xMinorTicks: xTickLayout.minorTicks,
      yMajorTicks: yTickLayout.majorTicks,
      yMinorTicks: yTickLayout.minorTicks,
      showGrid,
      showNumericXTicks: !hideWavelength,
      showNumericYTicks: !hidePowerOrIntensity,
      xAxisTitle: hideWavelength
        ? "wavelength λ"
        : `wavelength λ / ${safeWUnit}`,
      yAxisTitle: "spectral radiance (arb. units)",
      vis,
    }),
  );

  if (compSamples.length > 0) {
    const compPath = compSamples
      .map(
        (p, idx) =>
          `${idx === 0 ? "M" : "L"}${coord(projectX(p.x))} ${coord(projectY(p.y * yNormFactor))}`,
      )
      .join(" ");
    elements.push(
      `<path d="${compPath}" fill="none" stroke="#5a6570" stroke-width="1.9" stroke-dasharray="7 4" clip-path="url(#${clipId})"/>`,
    );
  }

  const primPath = primarySamples
    .map(
      (p, idx) =>
        `${idx === 0 ? "M" : "L"}${coord(projectX(p.x))} ${coord(projectY(p.y * yNormFactor))}`,
    )
    .join(" ");
  elements.push(
    `<path d="${primPath}" fill="none" stroke="#15191d" stroke-width="2.4" clip-path="url(#${clipId})"/>`,
  );

  // Peak wavelength vertical dashed drop-line
  const peakX = projectX(sol.peakWavelengthM * wScale.scaleFactor);
  const peakVal = planckSpectralExitance(
    sol.peakWavelengthM,
    sol.temperatureK,
    sol.emissivity,
    spec.wienConstantMK,
    spec.stefanBoltzmannConstant,
  );
  const peakY = projectY(peakVal * yNormFactor);
  elements.push(
    `<line x1="${coord(peakX)}" y1="${coord(peakY)}" x2="${coord(peakX)}" y2="${coord(frame.bottom)}" stroke="#69747d" stroke-width="1.2" stroke-dasharray="4 4"/>`,
    `<circle cx="${coord(peakX)}" cy="${coord(peakY)}" r="3.6" fill="#15191d"/>`,
  );
  if (hideWavelength) {
    elements.push(
      `<text x="${coord(peakX)}" y="${coord(frame.bottom + 21)}" text-anchor="middle" font-size="14" font-family="Arial, sans-serif" fill="#202429">λ_max</text>`,
    );
  }

  // Curve callout / legend
  const bodyPrefix =
    spec.bodyLabel && !vis.leaksHiddenText(spec.bodyLabel)
      ? `${spec.bodyLabel}: `
      : "";
  const eFormatted = formatSignificant(sol.emissivity);
  const emissivitySuffix =
    sol.emissivity < 1 &&
    !vis.isHidden("emissivity", "comparisonEmissivity") &&
    !vis.leaksHiddenText(eFormatted)
      ? `, e = ${eFormatted}`
      : "";
  const candidatePrimLabel = `${bodyPrefix}T = ${formatSignificant(sol.temperatureK)} K${emissivitySuffix}`;
  const primLabel =
    hideTemp || vis.leaksHiddenText(candidatePrimLabel)
      ? `${bodyPrefix ? bodyPrefix.slice(0, -2) : "Body A"}${emissivitySuffix}`
      : candidatePrimLabel;
  elements.push(
    `<text x="${coord(frame.right - 10)}" y="${coord(frame.top + 22)}" text-anchor="end" font-size="13.5" font-family="Arial, sans-serif" fill="#15191d">${escapeXml(primLabel)}</text>`,
  );

  if (sol.comparisonTemperatureK !== null) {
    const compPrefix =
      spec.comparisonLabel && !vis.leaksHiddenText(spec.comparisonLabel)
        ? `${spec.comparisonLabel}: `
        : "";
    const candidateCompLabel = `${compPrefix}T₂ = ${formatSignificant(sol.comparisonTemperatureK)} K (dashed)`;
    const compLabel =
      hideTemp || vis.leaksHiddenText(candidateCompLabel)
        ? `${compPrefix ? compPrefix.slice(0, -2) : "Body B"} (dashed)`
        : candidateCompLabel;
    elements.push(
      `<text x="${coord(frame.right - 10)}" y="${coord(frame.top + 42)}" text-anchor="end" font-size="13" font-family="Arial, sans-serif" fill="#5a6570">${escapeXml(compLabel)}</text>`,
    );
  }

  elements.push("</svg>");
  return elements.join("");
}

/* -------------------------------------------------------------------------- */
/* Public Entry Point                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Render a deterministic, publication-grade, student-safe SVG for any
 * validated ThermalScenarioSpec.
 */
export function renderThermalSvg(
  spec: ThermalScenarioSpec,
  options: ThermalRenderOptions = {},
): string {
  const { width, height } = resolveDimensions(options);

  switch (spec.kind) {
    case "thermodynamic-process": {
      const sol = solveThermodynamicProcess(spec);
      const vis = createVisibilityController(spec, options, sol.quantities);
      return renderThermodynamicDiagram(spec, sol, vis, width, height);
    }
    case "carnot-cycle": {
      const sol = solveCarnotCycle(spec);
      const vis = createVisibilityController(spec, options, sol.quantities);
      return renderThermodynamicDiagram(spec, sol, vis, width, height);
    }
    case "phase-change-curve": {
      const sol = solvePhaseChangeCurve(spec);
      const vis = createVisibilityController(spec, options, sol.quantities);
      return renderPhaseChangeSvg(spec, sol, vis, width, height);
    }
    case "calorimetry-mixing": {
      const sol = solveCalorimetryMixing(spec);
      const vis = createVisibilityController(spec, options, sol.quantities);
      return spec.diagramVariant === "convergence-graph"
        ? renderCalorimetryConvergenceSvg(spec, sol, vis, width, height)
        : renderCalorimetrySchematicSvg(spec, sol, vis, width, height);
    }
    case "kinetic-theory": {
      const sol = solveKineticTheory(spec);
      const vis = createVisibilityController(spec, options, sol.quantities);
      return renderKineticTheorySvg(spec, sol, vis, width, height);
    }
    case "thermal-radiation": {
      const sol = solveThermalRadiation(spec);
      const vis = createVisibilityController(spec, options, sol.quantities);
      return renderThermalRadiationSvg(spec, sol, vis, width, height);
    }
    default: {
      const exhaustive: never = spec;
      throw new Error(
        `Unsupported thermal scenario for SVG rendering: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}
