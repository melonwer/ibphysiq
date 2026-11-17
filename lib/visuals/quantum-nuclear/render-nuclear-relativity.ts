import { REFERENCE_BINDING_CURVE_POINTS } from "./constants";
import { SvgBodyResult } from "./render-quantum-atomic";
import {
  NuclearBindingScenarioSpec,
  NuclearBindingSolution,
  NuclearDecayChainScenarioSpec,
  NuclearDecayChainSolution,
  NuclearDecayMode,
  RadioactiveDecayScenarioSpec,
  RadioactiveDecaySolution,
  RutherfordScatteringScenarioSpec,
  RutherfordScatteringSolution,
  SpecialRelativityScenarioSpec,
  SpecialRelativitySolution,
} from "./types";
import {
  coord,
  escapeXml,
  formatCleanTick,
  formatNuclidePlain,
  formatScientificSigFigs,
  toSubscript,
  VisibilityGuard,
} from "./visibility";

function niceStep(span: number, targetSteps = 5): number {
  const rough = span / Math.max(1, targetSteps);
  const pow10 = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / pow10;
  if (norm <= 1) return pow10;
  if (norm <= 2) return 2 * pow10;
  if (norm <= 2.5) return 2.5 * pow10;
  if (norm <= 5) return 5 * pow10;
  return 10 * pow10;
}

function buildTicks(min: number, max: number, step: number): number[] {
  const start = Math.ceil((min - 1e-9) / step);
  const end = Math.floor((max + 1e-9) / step);
  const ticks: number[] = [];
  for (let i = start; i <= end; i += 1) {
    const val = Number((i * step).toPrecision(10));
    ticks.push(Object.is(val, -0) ? 0 : val);
  }
  return ticks;
}

/**
 * Exact Liang-Barsky 2D line segment clipper against [xMin, xMax] x [yMin, yMax].
 */
function clipLineToBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): [number, number, number, number] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let u1 = 0;
  let u2 = 1;
  const checks: ReadonlyArray<[number, number]> = [
    [-dx, x0 - xMin],
    [dx, xMax - x0],
    [-dy, y0 - yMin],
    [dy, yMax - y0],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < -1e-12) return null;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > u2) return null;
        if (r > u1) u1 = r;
      } else {
        if (r < u1) return null;
        if (r < u2) u2 = r;
      }
    }
  }
  return [x0 + u1 * dx, y0 + u1 * dy, x0 + u2 * dx, y0 + u2 * dy];
}

// ---------------------------------------------------------------------------
// 4. Radioactive Exponential Decay & Background Radiation SVG
// ---------------------------------------------------------------------------

export function renderRadioactiveDecayBody(
  spec: RadioactiveDecayScenarioSpec,
  solution: RadioactiveDecaySolution,
  guard: VisibilityGuard,
  width: number,
  height: number,
  uid: string,
): SvgBodyResult {
  const padLeft = 86;
  const padRight = 44;
  const padTop = 36;
  const padBottom = 56;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  // Choose vertical quantity to plot
  const mode =
    spec.plotQuantity ??
    (solution.initialTotalCountRate !== null
      ? "count-rate"
      : solution.initialActivityBq !== null && spec.initialActivityBq !== undefined
        ? "activity"
        : "nuclei");

  let y0Total: number;
  let yBg = 0;
  let yLabelBase: string;

  if (mode === "count-rate" && solution.initialTotalCountRate !== null) {
    y0Total = solution.initialTotalCountRate;
    yBg = solution.backgroundCountRate;
    yLabelBase = `Count rate / ${spec.countRateUnitLabel ?? `counts ${solution.timeUnit}⁻¹`}`;
  } else if (mode === "activity" && solution.initialActivityBq !== null) {
    y0Total = solution.initialActivityBq;
    yLabelBase = "Activity A / Bq";
  } else {
    y0Total =
      solution.initialNuclei ??
      solution.initialActivityBq ??
      solution.initialTotalCountRate ??
      100;
    yLabelBase = "Undecayed nuclei N";
  }

  // Scale large numbers cleanly (e.g. 10^12 nuclei -> / 10^12)
  const yExponent =
    y0Total >= 10000 || y0Total < 0.01
      ? Math.floor(Math.log10(y0Total))
      : 0;
  const yScale = 10 ** yExponent;
  const yMaxRaw = (y0Total / yScale) * 1.12;
  const yStep = niceStep(yMaxRaw, 5);
  const yMax = Math.ceil(yMaxRaw / yStep) * yStep;

  const spanHalfLives = Math.max(
    spec.plotSpanHalfLives ?? 4,
    solution.numberOfHalfLives * 1.2,
    2.5,
  );
  const rawMaxT = spanHalfLives * solution.halfLife;
  const xStep = niceStep(rawMaxT, 5);
  const xMax = Math.ceil(rawMaxT / xStep) * xStep;

  const xPx = (t: number) => padLeft + (t / xMax) * plotW;
  const yPx = (yScaled: number) => padTop + ((yMax - yScaled) / yMax) * plotH;

  const arrowId = `qn-rd-axis-${uid}`;
  const defs = `<marker id="${arrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#0f172a"/></marker>`;
  const parts: string[] = [];

  const schematic =
    Boolean(spec.schematicAxes) || guard.isExplicitlyHidden(["axisTicks"]);
  const showXTicks =
    !schematic && guard.canShowInput(["xAxisTicks", "axisTicks"]);
  const showYTicks =
    !schematic && guard.canShowInput(["yAxisTicks", "axisTicks"]);

  const xTicks = buildTicks(0, xMax, xStep);
  const yTicks = buildTicks(0, yMax, yStep);

  const hiddenX: number[] = [];
  if (guard.isExplicitlyHidden(["halfLife", "decayConstant"])) {
    hiddenX.push(solution.halfLife);
  }
  const hiddenY: number[] = [];
  if (guard.isExplicitlyHidden(["backgroundCountRate"])) {
    hiddenY.push(yBg / yScale);
  }

  if (!schematic) {
    xTicks.forEach((tx) => {
      parts.push(
        `<line x1="${coord(xPx(tx))}" y1="${coord(padTop)}" x2="${coord(xPx(tx))}" y2="${coord(padTop + plotH)}" stroke="#e2e8f0" stroke-width="1"/>`,
      );
    });
    yTicks.forEach((ty) => {
      parts.push(
        `<line x1="${coord(padLeft)}" y1="${coord(yPx(ty))}" x2="${coord(padLeft + plotW)}" y2="${coord(yPx(ty))}" stroke="#e2e8f0" stroke-width="1"/>`,
      );
    });
  }

  // Axes
  parts.push(
    `<line x1="${coord(padLeft)}" y1="${coord(padTop + plotH)}" x2="${coord(padLeft)}" y2="${coord(padTop - 8)}" stroke="#0f172a" stroke-width="1.8" marker-end="url(#${arrowId})"/>`,
    `<line x1="${coord(padLeft)}" y1="${coord(padTop + plotH)}" x2="${coord(padLeft + plotW + 8)}" y2="${coord(padTop + plotH)}" stroke="#0f172a" stroke-width="1.8" marker-end="url(#${arrowId})"/>`,
  );

  if (showXTicks) {
    xTicks.forEach((tx) => {
      const px = xPx(tx);
      parts.push(
        `<line x1="${coord(px)}" y1="${coord(padTop + plotH - 4)}" x2="${coord(px)}" y2="${coord(padTop + plotH + 4)}" stroke="#0f172a" stroke-width="1.3"/>`,
      );
      const collides = hiddenX.some((h) => Math.abs(tx - h) <= xStep * 0.02);
      if (!collides) {
        parts.push(
          `<text x="${coord(px)}" y="${coord(padTop + plotH + 18)}" text-anchor="middle" font-size="12" fill="#334155">${escapeXml(formatCleanTick(tx))}</text>`,
        );
      }
    });
  }

  if (showYTicks) {
    yTicks.forEach((ty) => {
      const py = yPx(ty);
      parts.push(
        `<line x1="${coord(padLeft - 4)}" y1="${coord(py)}" x2="${coord(padLeft + 4)}" y2="${coord(py)}" stroke="#0f172a" stroke-width="1.3"/>`,
      );
      const collides = hiddenY.some(
        (h) => h > 0 && Math.abs(ty - h) <= yStep * 0.02,
      );
      if (!collides) {
        parts.push(
          `<text x="${coord(padLeft - 10)}" y="${coord(py + 4)}" text-anchor="end" font-size="12" fill="#334155">${escapeXml(formatCleanTick(ty))}</text>`,
        );
      }
    });
  }

  const yTitleWithScale =
    yExponent !== 0
      ? `${yLabelBase} (× 10${toSuperscriptSafe(yExponent)})`
      : yLabelBase;
  parts.push(
    `<text x="${coord(padLeft + plotW / 2)}" y="${coord(height - 14)}" text-anchor="middle" font-size="13" font-weight="600" fill="#0f172a">Time t / ${escapeXml(solution.timeUnit)}</text>`,
    `<text x="22" y="${coord(padTop + plotH / 2)}" text-anchor="middle" font-size="13" font-weight="600" fill="#0f172a" transform="rotate(-90 22 ${coord(padTop + plotH / 2)})">${escapeXml(yTitleWithScale)}</text>`,
  );

  // Background radiation asymptote
  if (yBg > 0) {
    const bgY = yPx(yBg / yScale);
    parts.push(
      `<line x1="${coord(padLeft)}" y1="${coord(bgY)}" x2="${coord(padLeft + plotW)}" y2="${coord(bgY)}" stroke="#b91c1c" stroke-width="1.5" stroke-dasharray="6 4"/>`,
    );
    const bgLabel = guard.canShowInput(["backgroundCountRate"])
      ? `background = ${formatCleanTick(Number(yBg.toPrecision(3)))}`
      : guard.placeholder("backgroundCountRate", "background");
    if (bgLabel) {
      parts.push(
        `<text x="${coord(padLeft + plotW - 6)}" y="${coord(bgY - 6)}" text-anchor="end" font-size="11" font-weight="600" fill="#b91c1c">${escapeXml(bgLabel)}</text>`,
      );
    }
  }

  // Optional half-life dashed guide lines (never shown if halfLife is hidden)
  if (
    spec.showHalfLifeGuides &&
    !guard.isExplicitlyHidden(["halfLife", "decayConstant"]) &&
    solution.halfLife <= xMax
  ) {
    const net0 = y0Total - yBg;
    const yHalf = (yBg + 0.5 * net0) / yScale;
    const hx = xPx(solution.halfLife);
    const hy = yPx(yHalf);
    parts.push(
      `<line x1="${coord(padLeft)}" y1="${coord(hy)}" x2="${coord(hx)}" y2="${coord(hy)}" stroke="#0f766e" stroke-width="1.3" stroke-dasharray="4 3"/>`,
      `<line x1="${coord(hx)}" y1="${coord(hy)}" x2="${coord(hx)}" y2="${coord(padTop + plotH)}" stroke="#0f766e" stroke-width="1.3" stroke-dasharray="4 3"/>`,
      `<circle cx="${coord(hx)}" cy="${coord(hy)}" r="3.5" fill="#0f766e"/>`,
      `<text x="${coord(hx + 5)}" y="${coord(hy - 6)}" font-size="11" font-weight="700" fill="#0f766e">t₁/₂</text>`,
    );
  }

  // Exact analytical exponential decay curve (100 samples)
  const net0 = y0Total - yBg;
  const curvePts: string[] = [];
  const samples = 100;
  for (let i = 0; i <= samples; i += 1) {
    const t = (i / samples) * xMax;
    const yVal = (yBg + net0 * Math.exp(-solution.decayConstant * t)) / yScale;
    curvePts.push(`${coord(xPx(t))},${coord(yPx(yVal))}`);
  }
  parts.push(
    `<polyline points="${curvePts.join(" ")}" fill="none" stroke="#1d4ed8" stroke-width="2.6"/>`,
  );

  // Elapsed time query point (plotted accurately without leaking numerical y(t))
  if (solution.elapsedTime > 0 && solution.elapsedTime <= xMax) {
    const qVal =
      (yBg + net0 * Math.exp(-solution.decayConstant * solution.elapsedTime)) /
      yScale;
    parts.push(
      `<circle cx="${coord(xPx(solution.elapsedTime))}" cy="${coord(yPx(qVal))}" r="4" fill="#1d4ed8"/>`,
    );
  }

  return {
    title: "Radioactive exponential decay curve",
    ariaLabel: "Radioactive decay curve against time",
    desc: "Exponential decay curve showing sample decay over time",
    defs,
    body: parts.join(""),
  };
}

function toSuperscriptSafe(exp: number): string {
  const map: Record<string, string> = {
    "-": "⁻",
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
  };
  return [...String(exp)].map((c) => map[c] ?? c).join("");
}

// ---------------------------------------------------------------------------
// 5. Nuclear Decay Chain & N-Z / A-Z Stability Chart SVG
// ---------------------------------------------------------------------------

function modeBadge(mode: NuclearDecayMode): string {
  switch (mode) {
    case "alpha":
      return "α";
    case "beta-minus":
      return "β⁻";
    case "beta-plus":
      return "β⁺";
    case "gamma":
      return "γ";
    case "electron-capture":
      return "EC";
    case "neutron-emission":
      return "n";
  }
}

export function renderNuclearDecayChainBody(
  spec: NuclearDecayChainScenarioSpec,
  solution: NuclearDecayChainSolution,
  guard: VisibilityGuard,
  width: number,
  height: number,
  uid: string,
): SvgBodyResult {
  const axes = spec.chartAxes ?? "N-vs-Z";
  const padLeft = 82;
  const padRight = 54;
  const padTop = 38;
  const padBottom = 56;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const zs = solution.nuclides.map((n) => n.atomicNumberZ);
  const ys = solution.nuclides.map((n) =>
    axes === "N-vs-Z" ? n.neutronNumberN : n.massNumberA,
  );

  const zMin = Math.max(0, Math.min(...zs) - 2);
  const zMax = Math.max(...zs) + 2;
  const yMin = Math.max(0, Math.min(...ys) - 2);
  const yMax = Math.max(...ys) + 2;

  const zSpan = Math.max(1, zMax - zMin);
  const ySpan = Math.max(1, yMax - yMin);

  const xPx = (z: number) => padLeft + ((z - zMin) / zSpan) * plotW;
  const yPx = (v: number) => padTop + ((yMax - v) / ySpan) * plotH;

  const stepArrowId = `qn-dc-step-${uid}`;
  const axisArrowId = `qn-dc-axis-${uid}`;
  const defs = [
    `<marker id="${stepArrowId}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#1d4ed8"/></marker>`,
    `<marker id="${axisArrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#0f172a"/></marker>`,
  ].join("");

  const parts: string[] = [];
  const zStep = Math.max(1, Math.round(niceStep(zSpan, 6)));
  const yStep = Math.max(1, Math.round(niceStep(ySpan, 6)));

  const zTicks = buildTicks(zMin, zMax, 1);
  const yTicks = buildTicks(yMin, yMax, 1);
  const showXTicks = guard.canShowInput(["xAxisTicks", "axisTicks"]);
  const showYTicks = guard.canShowInput(["yAxisTicks", "axisTicks"]);

  // Integer lattice grid
  zTicks.forEach((tz) => {
    parts.push(
      `<line x1="${coord(xPx(tz))}" y1="${coord(padTop)}" x2="${coord(xPx(tz))}" y2="${coord(padTop + plotH)}" stroke="#e2e8f0" stroke-width="${tz % zStep === 0 ? "1.2" : "0.7"}"/>`,
    );
  });
  yTicks.forEach((ty) => {
    parts.push(
      `<line x1="${coord(padLeft)}" y1="${coord(yPx(ty))}" x2="${coord(padLeft + plotW)}" y2="${coord(yPx(ty))}" stroke="#e2e8f0" stroke-width="${ty % yStep === 0 ? "1.2" : "0.7"}"/>`,
    );
  });

  // Optional N = Z reference line on N-vs-Z chart
  if (axes === "N-vs-Z" && (spec.showStabilityLine ?? true)) {
    const clipped = clipLineToBox(
      zMin,
      zMin,
      zMax,
      zMax,
      zMin,
      zMax,
      yMin,
      yMax,
    );
    if (clipped) {
      parts.push(
        `<line x1="${coord(xPx(clipped[0]))}" y1="${coord(yPx(clipped[1]))}" x2="${coord(xPx(clipped[2]))}" y2="${coord(yPx(clipped[3]))}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="5 4"/>`,
        `<text x="${coord(xPx(clipped[2]) - 6)}" y="${coord(yPx(clipped[3]) - 6)}" text-anchor="end" font-size="11" fill="#64748b">N = Z</text>`,
      );
    }
  }

  // Axes
  parts.push(
    `<line x1="${coord(padLeft)}" y1="${coord(padTop + plotH)}" x2="${coord(padLeft)}" y2="${coord(padTop - 8)}" stroke="#0f172a" stroke-width="1.8" marker-end="url(#${axisArrowId})"/>`,
    `<line x1="${coord(padLeft)}" y1="${coord(padTop + plotH)}" x2="${coord(padLeft + plotW + 8)}" y2="${coord(padTop + plotH)}" stroke="#0f172a" stroke-width="1.8" marker-end="url(#${axisArrowId})"/>`,
  );

  //Suppress exact daughter coordinate tick labels only if daughter Z/A/N are explicitly hidden
  const hiddenDaughterCoords = guard.isExplicitlyHidden([
    "daughterZ",
    "daughterA",
    "daughterN",
    "finalZ",
    "finalA",
    "finalN",
    "daughterCoordinates",
  ]);
  const secretZs = new Set(
    hiddenDaughterCoords
      ? solution.nuclides.slice(1).map((n) => n.atomicNumberZ)
      : [],
  );
  const secretYs = new Set(
    hiddenDaughterCoords
      ? solution.nuclides
          .slice(1)
          .map((n) => (axes === "N-vs-Z" ? n.neutronNumberN : n.massNumberA))
      : [],
  );

  if (showXTicks) {
    zTicks
      .filter((tz) => tz % zStep === 0)
      .forEach((tz) => {
        if (!secretZs.has(tz)) {
          parts.push(
            `<text x="${coord(xPx(tz))}" y="${coord(padTop + plotH + 18)}" text-anchor="middle" font-size="12" fill="#334155">${tz}</text>`,
          );
        }
      });
  }
  if (showYTicks) {
    yTicks
      .filter((ty) => ty % yStep === 0)
      .forEach((ty) => {
        if (!secretYs.has(ty)) {
          parts.push(
            `<text x="${coord(padLeft - 10)}" y="${coord(yPx(ty) + 4)}" text-anchor="end" font-size="12" fill="#334155">${ty}</text>`,
          );
        }
      });
  }

  parts.push(
    `<text x="${coord(padLeft + plotW / 2)}" y="${coord(height - 14)}" text-anchor="middle" font-size="13" font-weight="600" fill="#0f172a">Proton number Z</text>`,
    `<text x="22" y="${coord(padTop + plotH / 2)}" text-anchor="middle" font-size="13" font-weight="600" fill="#0f172a" transform="rotate(-90 22 ${coord(padTop + plotH / 2)})">${axes === "N-vs-Z" ? "Neutron number N" : "Nucleon number A"}</text>`,
  );

  // Decay transition arrows
  solution.steps.forEach((step) => {
    const x1 = xPx(step.parent.atomicNumberZ);
    const y1 = yPx(
      axes === "N-vs-Z"
        ? step.parent.neutronNumberN
        : step.parent.massNumberA,
    );
    const x2 = xPx(step.daughter.atomicNumberZ);
    const y2 = yPx(
      axes === "N-vs-Z"
        ? step.daughter.neutronNumberN
        : step.daughter.massNumberA,
    );

    const modeVisible = guard.canShowInput([
      `step:${step.id}`,
      `step:${step.id}:mode`,
      "decayModes",
    ]);
    const labelText = modeVisible
      ? modeBadge(step.mode)
      : guard.placeholder(`step:${step.id}`, "?");

    if (step.mode === "gamma") {
      parts.push(
        `<path d="M ${coord(x1 + 5)} ${coord(y1 - 5)} C ${coord(x1 + 24)} ${coord(y1 - 24)}, ${coord(x1 + 24)} ${coord(y1 + 16)}, ${coord(x1 + 7)} ${coord(y1 + 5)}" fill="none" stroke="#7c3aed" stroke-width="1.8" marker-end="url(#${stepArrowId})"/>`,
      );
      if (labelText) {
        parts.push(
          `<text x="${coord(x1 + 26)}" y="${coord(y1 - 4)}" font-size="12" font-weight="700" fill="#7c3aed">${escapeXml(labelText)}</text>`,
        );
      }
      return;
    }

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const ux = len > 0 ? dx / len : 0;
    const uy = len > 0 ? dy / len : 0;
    const sx = x1 + ux * 7;
    const sy = y1 + uy * 7;
    const ex = x2 - ux * 9;
    const ey = y2 - uy * 9;

    parts.push(
      `<line x1="${coord(sx)}" y1="${coord(sy)}" x2="${coord(ex)}" y2="${coord(ey)}" stroke="#1d4ed8" stroke-width="2.2" marker-end="url(#${stepArrowId})"/>`,
    );
    if (labelText) {
      const mx = (sx + ex) / 2 - uy * 12;
      const my = (sy + ey) / 2 + ux * 12;
      parts.push(
        `<text x="${coord(mx)}" y="${coord(my + 4)}" text-anchor="middle" font-size="12" font-weight="700" fill="#1d4ed8">${escapeXml(labelText)}</text>`,
      );
    }
  });

  // Nuclide vertex markers & non-leaking labels
  solution.nuclides.forEach((nuc, idx) => {
    const cx = xPx(nuc.atomicNumberZ);
    const cy = yPx(
      axes === "N-vs-Z" ? nuc.neutronNumberN : nuc.massNumberA,
    );
    parts.push(
      `<circle cx="${coord(cx)}" cy="${coord(cy)}" r="5" fill="${idx === 0 ? "#0f172a" : "#1d4ed8"}" stroke="#ffffff" stroke-width="1.5"/>`,
    );

    const canShowNuclide =
      idx === 0
        ? guard.canShowInput(["parentNuclide", "nuclide:0"])
        : guard.canShowDerived([
            `nuclide:${idx}`,
            idx === solution.nuclides.length - 1 ? "finalNuclide" : "",
            "daughterNuclides",
            "allNuclides",
          ].filter(Boolean));

    const textLabel = canShowNuclide
      ? nuc.notation
      : guard.placeholder(
          `nuclide:${idx}`,
          idx === 0
            ? "P"
            : solution.nuclides.length === 2
              ? "X"
              : `X${toSubscript(idx)}`,
        );

    if (textLabel) {
      parts.push(
        `<text x="${coord(cx + 9)}" y="${coord(cy - 8)}" font-size="12" font-weight="700" fill="#0f172a">${escapeXml(textLabel)}</text>`,
      );
    }
  });

  return {
    title: "Nuclear decay series stability chart",
    ariaLabel: `Nuclear decay chart with ${solution.steps.length} transitions`,
    desc: `Nuclear chart on ${axes} coordinates`,
    defs,
    body: parts.join(""),
  };
}

// ---------------------------------------------------------------------------
// 6. Nuclear Mass Defect, Binding Energy Curve & Q-Value SVG
// ---------------------------------------------------------------------------

export function renderNuclearBindingBody(
  spec: NuclearBindingScenarioSpec,
  solution: NuclearBindingSolution,
  guard: VisibilityGuard,
  width: number,
  height: number,
  uid: string,
): SvgBodyResult {
  const style = spec.diagramStyle ?? "binding-curve";
  const arrowId = `qn-nb-arrow-${uid}`;
  const defs = `<marker id="${arrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#0f172a"/></marker>`;
  const parts: string[] = [];

  if (style === "mass-energy-balance") {
    const leftX = 110;
    const rightX = width - 250;
    const colW = 140;
    const highY = 96;
    const lowY = height - 96;

    const highTitle =
      solution.calculationMode === "single-nuclide"
        ? guard.canShowInput(["atomicNumberZ", "neutronNumberN", "constituents"])
          ? `${solution.atomicNumberZ}p + ${solution.neutronNumberN}n (free)`
          : "Separated nucleons"
        : "Reactants";
    const lowTitle =
      solution.calculationMode === "single-nuclide"
        ? guard.canShowInput(["symbol", "nuclide"])
          ? `${formatNuclidePlain(solution.massNumberA, solution.atomicNumberZ, solution.symbol)} nucleus`
          : "Bound nucleus"
        : "Products";

    const isEndothermic =
      solution.calculationMode === "reaction" && !solution.isExothermic;
    const leftY = isEndothermic ? lowY : highY;
    const rightY = isEndothermic ? highY : lowY;

    parts.push(
      `<text x="${coord(width / 2)}" y="30" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a">Nuclear mass–energy balance</text>`,
      `<line x1="${coord(leftX)}" y1="${coord(leftY)}" x2="${coord(leftX + colW)}" y2="${coord(leftY)}" stroke="#0f172a" stroke-width="3"/>`,
      `<text x="${coord(leftX + colW / 2)}" y="${coord(leftY - 12)}" text-anchor="middle" font-size="13" font-weight="600" fill="#0f172a">${escapeXml(highTitle)}</text>`,
      `<line x1="${coord(rightX)}" y1="${coord(rightY)}" x2="${coord(rightX + colW)}" y2="${coord(rightY)}" stroke="#1d4ed8" stroke-width="3"/>`,
      `<text x="${coord(rightX + colW / 2)}" y="${coord(rightY + 22)}" text-anchor="middle" font-size="13" font-weight="600" fill="#1d4ed8">${escapeXml(lowTitle)}</text>`,
      `<line x1="${coord(leftX + colW)}" y1="${coord(leftY)}" x2="${coord(rightX + 36)}" y2="${coord(leftY)}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="5 4"/>`,
      `<line x1="${coord(rightX + 24)}" y1="${coord(leftY)}" x2="${coord(rightX + 24)}" y2="${coord(rightY + (rightY > leftY ? -4 : 4))}" stroke="#dc2626" stroke-width="2.2" marker-end="url(#${arrowId})"/>`,
    );

    const deltaLabel =
      solution.calculationMode === "single-nuclide"
        ? guard.canShowDerived(["bindingEnergyMeV", "massDefectU"])
          ? `ΔE = ${formatScientificSigFigs(solution.bindingEnergyMeV, 3, "MeV")}`
          : guard.placeholder("bindingEnergyMeV", "B = Δm c²")
        : guard.canShowDerived(["qValueMeV", "massDifferenceU"])
          ? `Q = ${formatScientificSigFigs(solution.qValueMeV, 3, "MeV")}`
          : guard.placeholder("qValueMeV", "Q = Δm c²");

    if (deltaLabel) {
      parts.push(
        `<text x="${coord(rightX + 36)}" y="${coord((leftY + rightY) / 2 + 4)}" font-size="13" font-weight="700" fill="#dc2626">${escapeXml(deltaLabel)}</text>`,
      );
    }

    return {
      title: "Nuclear mass-energy balance diagram",
      ariaLabel: "Mass-energy comparison between nuclear states",
      desc: "Comparison of rest mass-energy before and after nuclear binding or reaction",
      defs,
      body: parts.join(""),
    };
  }

  // Default: Canonical Binding Energy per Nucleon (B/A) vs Mass Number (A) curve
  const padLeft = 82;
  const padRight = 44;
  const padTop = 36;
  const padBottom = 56;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxA = 250;
  const maxBe = 10;
  const xPx = (a: number) => padLeft + (a / maxA) * plotW;
  const yPx = (be: number) => padTop + ((maxBe - be) / maxBe) * plotH;

  const showXTicks = guard.canShowInput(["xAxisTicks", "axisTicks"]);
  const showYTicks = guard.canShowInput(["yAxisTicks", "axisTicks"]);

  for (let a = 0; a <= maxA; a += 50) {
    parts.push(
      `<line x1="${coord(xPx(a))}" y1="${coord(padTop)}" x2="${coord(xPx(a))}" y2="${coord(padTop + plotH)}" stroke="#e2e8f0" stroke-width="1"/>`,
    );
  }
  for (let be = 0; be <= maxBe; be += 2) {
    parts.push(
      `<line x1="${coord(padLeft)}" y1="${coord(yPx(be))}" x2="${coord(padLeft + plotW)}" y2="${coord(yPx(be))}" stroke="#e2e8f0" stroke-width="1"/>`,
    );
  }

  parts.push(
    `<line x1="${coord(padLeft)}" y1="${coord(padTop + plotH)}" x2="${coord(padLeft)}" y2="${coord(padTop - 8)}" stroke="#0f172a" stroke-width="1.8" marker-end="url(#${arrowId})"/>`,
    `<line x1="${coord(padLeft)}" y1="${coord(padTop + plotH)}" x2="${coord(padLeft + plotW + 8)}" y2="${coord(padTop + plotH)}" stroke="#0f172a" stroke-width="1.8" marker-end="url(#${arrowId})"/>`,
  );

  if (showXTicks) {
    for (let a = 0; a <= maxA; a += 50) {
      parts.push(
        `<text x="${coord(xPx(a))}" y="${coord(padTop + plotH + 18)}" text-anchor="middle" font-size="12" fill="#334155">${a}</text>`,
      );
    }
  }
  if (showYTicks) {
    for (let be = 0; be <= maxBe; be += 2) {
      parts.push(
        `<text x="${coord(padLeft - 10)}" y="${coord(yPx(be) + 4)}" text-anchor="end" font-size="12" fill="#334155">${be}</text>`,
      );
    }
  }

  parts.push(
    `<text x="${coord(padLeft + plotW / 2)}" y="${coord(height - 14)}" text-anchor="middle" font-size="13" font-weight="600" fill="#0f172a">Nucleon number A</text>`,
    `<text x="22" y="${coord(padTop + plotH / 2)}" text-anchor="middle" font-size="13" font-weight="600" fill="#0f172a" transform="rotate(-90 22 ${coord(padTop + plotH / 2)})">Binding energy per nucleon / MeV</text>`,
  );

  const curvePts = REFERENCE_BINDING_CURVE_POINTS.map(
    (pt) => `${coord(xPx(pt.massNumberA))},${coord(yPx(pt.bindingEnergyPerNucleonMeV))}`,
  ).join(" ");
  parts.push(
    `<polyline points="${curvePts}" fill="none" stroke="#1e293b" stroke-width="2.3"/>`,
    `<text x="${coord(xPx(28))}" y="${coord(padTop + 20)}" font-size="11" fill="#0f766e">← fusion</text>`,
    `<text x="${coord(xPx(168))}" y="${coord(padTop + 20)}" font-size="11" fill="#b45309">← fission</text>`,
  );

  // Highlight queried nuclide without revealing derived B/A value unless allowed
  if (solution.calculationMode === "single-nuclide") {
    const hx = xPx(Math.min(maxA, solution.massNumberA));
    const hy = yPx(Math.min(maxBe, solution.bindingEnergyPerNucleonMeV));
    parts.push(
      `<circle cx="${coord(hx)}" cy="${coord(hy)}" r="5" fill="#dc2626" stroke="#ffffff" stroke-width="1.5"/>`,
    );
    if (guard.canShowInput(["symbol", "nuclide"])) {
      const valSuffix = guard.canShowDerived(["bindingEnergyPerNucleonMeV"])
        ? ` (${formatScientificSigFigs(solution.bindingEnergyPerNucleonMeV, 3, "MeV")})`
        : "";
      parts.push(
        `<text x="${coord(hx + 8)}" y="${coord(hy - 8)}" font-size="12" font-weight="700" fill="#dc2626">${escapeXml(`${formatNuclidePlain(solution.massNumberA, solution.atomicNumberZ, solution.symbol)}${valSuffix}`)}</text>`,
      );
    }
  }

  return {
    title: "Binding energy per nucleon curve",
    ariaLabel: "Nuclear binding energy per nucleon against nucleon number A",
    desc: "Empirical curve of average binding energy per nucleon across light to heavy nuclei",
    defs,
    body: parts.join(""),
  };
}

// ---------------------------------------------------------------------------
// 7. Rutherford Closest Approach & Coulomb Scattering SVG
// ---------------------------------------------------------------------------

export function renderRutherfordScatteringBody(
  spec: RutherfordScatteringScenarioSpec,
  solution: RutherfordScatteringSolution,
  guard: VisibilityGuard,
  width: number,
  height: number,
  uid: string,
): SvgBodyResult {
  const arrowId = `qn-rs-arrow-${uid}`;
  const dimId = `qn-rs-dim-${uid}`;
  const defs = [
    `<marker id="${arrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#1d4ed8"/></marker>`,
    `<marker id="${dimId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 1L9 5L0 9Z" fill="#b91c1c"/></marker>`,
  ].join("");

  const parts: string[] = [];
  const nucX = width - 150;
  const nucY = height * 0.52;
  const rNucPx = 30;
  const ratioDToR = Math.max(
    1.25,
    Math.min(4.2, solution.closestApproachFm / solution.estimatedNuclearRadiusFm),
  );
  const dPx = rNucPx * ratioDToR;
  const turnX = nucX - dPx;
  const startX = 48;

  // Target nucleus + nuclear radius boundary
  parts.push(
    `<circle cx="${coord(nucX)}" cy="${coord(nucY)}" r="${coord(rNucPx)}" fill="#fee2e2" stroke="#b91c1c" stroke-width="2" stroke-dasharray="5 3"/>`,
    `<circle cx="${coord(nucX)}" cy="${coord(nucY)}" r="10" fill="#dc2626"/>`,
  );

  const targetText = guard.canShowInput(["targetChargeZ", "targetSymbol"])
    ? `${solution.targetSymbol} (+${solution.targetChargeZ}e)`
    : guard.placeholder("targetSymbol", "+Ze");
  if (targetText) {
    parts.push(
      `<text x="${coord(nucX)}" y="${coord(nucY + rNucPx + 20)}" text-anchor="middle" font-size="13" font-weight="700" fill="#991b1b">${escapeXml(targetText)}</text>`,
    );
  }

  const rLabel = guard.canShowDerived([
    "estimatedNuclearRadiusFm",
    "estimatedNuclearRadiusM",
    "nuclearRadius",
  ])
    ? `R = ${formatScientificSigFigs(solution.estimatedNuclearRadiusFm, 3, "fm")}`
    : guard.placeholder("nuclearRadius", "R");
  if (rLabel) {
    parts.push(
      `<line x1="${coord(nucX)}" y1="${coord(nucY)}" x2="${coord(nucX + rNucPx * 0.707)}" y2="${coord(nucY - rNucPx * 0.707)}" stroke="#991b1b" stroke-width="1.4"/>`,
      `<text x="${coord(nucX + rNucPx * 0.85)}" y="${coord(nucY - rNucPx * 0.85)}" font-size="11" font-weight="600" fill="#991b1b">${escapeXml(rLabel)}</text>`,
    );
  }

  // Head-on 180-degree closest-approach path
  parts.push(
    `<line x1="${coord(startX)}" y1="${coord(nucY - 3)}" x2="${coord(turnX - 6)}" y2="${coord(nucY - 3)}" stroke="#1d4ed8" stroke-width="2.2" marker-end="url(#${arrowId})"/>`,
    `<path d="M ${coord(turnX - 4)} ${coord(nucY - 3)} A 4 4 0 0 1 ${coord(turnX - 4)} ${coord(nucY + 3)}" fill="none" stroke="#1d4ed8" stroke-width="2"/>`,
    `<line x1="${coord(turnX - 4)}" y1="${coord(nucY + 3)}" x2="${coord(startX + 26)}" y2="${coord(nucY + 3)}" stroke="#1d4ed8" stroke-width="1.8" stroke-dasharray="5 3" marker-end="url(#${arrowId})"/>`,
    `<circle cx="${coord(turnX)}" cy="${coord(nucY)}" r="4" fill="#1d4ed8"/>`,
  );

  // Closest-approach distance d dimension line
  const dimY = nucY - rNucPx - 28;
  parts.push(
    `<line x1="${coord(turnX)}" y1="${coord(nucY)}" x2="${coord(turnX)}" y2="${coord(dimY - 4)}" stroke="#64748b" stroke-width="1" stroke-dasharray="3 3"/>`,
    `<line x1="${coord(nucX)}" y1="${coord(nucY)}" x2="${coord(nucX)}" y2="${coord(dimY - 4)}" stroke="#64748b" stroke-width="1" stroke-dasharray="3 3"/>`,
    `<line x1="${coord(turnX + 2)}" y1="${coord(dimY)}" x2="${coord(nucX - 2)}" y2="${coord(dimY)}" stroke="#b91c1c" stroke-width="1.6" marker-start="url(#${dimId})" marker-end="url(#${dimId})"/>`,
  );

  const dLabel = guard.canShowDerived([
    "closestApproachFm",
    "closestApproachM",
    "closestApproach",
  ])
    ? `d = ${formatScientificSigFigs(solution.closestApproachFm, 3, "fm")}`
    : guard.placeholder("closestApproachFm", "d");
  if (dLabel) {
    parts.push(
      `<text x="${coord((turnX + nucX) / 2)}" y="${coord(dimY - 8)}" text-anchor="middle" font-size="13" font-weight="700" fill="#b91c1c">${escapeXml(dLabel)}</text>`,
    );
  }

  // Optional off-axis hyperbolic Rutherford deflections using cot(theta/2) = 2b/d
  if (spec.showDeflectedPaths ?? true) {
    const offsets = [-96, -54, 54, 96];
    offsets.forEach((bPx) => {
      const sign = Math.sign(bPx);
      const absB = Math.abs(bPx);
      const theta = 2 * Math.atan(dPx / (2 * absB));
      const bendX = nucX - dPx * 0.55;
      const outLen = 115;
      const endX = bendX + outLen * Math.cos(theta);
      const endY = nucY + bPx + sign * outLen * Math.sin(theta);
      const pathD = `M ${coord(startX)} ${coord(nucY + bPx)} L ${coord(bendX - 38)} ${coord(nucY + bPx)} Q ${coord(bendX)} ${coord(nucY + bPx)} ${coord(endX)} ${coord(endY)}`;
      parts.push(
        `<path d="${pathD}" fill="none" stroke="#3b82f6" stroke-width="1.5" opacity="0.8" marker-end="url(#${arrowId})"/>`,
      );
    });
  }

  // Incoming projectile callout
  const projParts: string[] = [];
  if (guard.canShowInput(["projectileLabel", "projectileChargeZ"])) {
    projParts.push(solution.projectileLabel);
  }
  if (guard.canShowInput(["kineticEnergyMeV", "kineticEnergyJ"])) {
    projParts.push(
      `Eₖ = ${formatScientificSigFigs(solution.initialKineticEnergyMeV, 3, "MeV")}`,
    );
  }
  if (projParts.length > 0) {
    parts.push(
      `<text x="${coord(startX)}" y="${coord(nucY - 18)}" font-size="12" font-weight="700" fill="#1e293b">${escapeXml(projParts.join(", "))}</text>`,
    );
  }

  return {
    title: "Rutherford Coulomb scattering diagram",
    ariaLabel: "Rutherford alpha scattering and closest-approach geometry",
    desc: "Positively charged projectile approaching target nucleus to closest-approach turning point d",
    defs,
    body: parts.join(""),
  };
}

// ---------------------------------------------------------------------------
// 8. Special Relativity Minkowski Spacetime Worldline SVG
// ---------------------------------------------------------------------------

export function renderSpecialRelativityBody(
  spec: SpecialRelativityScenarioSpec,
  solution: SpecialRelativitySolution,
  guard: VisibilityGuard,
  width: number,
  height: number,
  uid: string,
): SvgBodyResult {
  const symmetric = spec.symmetricTimeAxis ?? true;
  const maxEventCoord = solution.events.reduce(
    (acc, ev) =>
      Math.max(acc, Math.abs(ev.xLightSeconds), Math.abs(ev.ctLightSeconds)),
    0,
  );
  const D = Math.max(
    spec.domainLightSeconds ?? 5,
    Math.ceil(maxEventCoord * 1.25),
  );
  const xMin = -D;
  const xMax = D;
  const ctMin = symmetric ? -D : 0;
  const ctMax = D;

  // Enforce EXACT 1:1 pixel scale between x and ct so light cone is strictly 45 degrees
  const availW = width - 120;
  const availH = height - 88;
  const unitPx = Math.min(availW / (xMax - xMin), availH / (ctMax - ctMin));
  const boxW = unitPx * (xMax - xMin);
  const boxH = unitPx * (ctMax - ctMin);
  const boxLeft = (width - boxW) / 2;
  const boxTop = (height - boxH) / 2;
  const boxRight = boxLeft + boxW;
  const boxBottom = boxTop + boxH;

  const xPx = (x: number) => boxLeft + (x - xMin) * unitPx;
  const yPx = (ct: number) => boxTop + (ctMax - ct) * unitPx;

  const sArrowId = `qn-sr-s-${uid}`;
  const spArrowId = `qn-sr-sp-${uid}`;
  const wlArrowId = `qn-sr-wl-${uid}`;
  const defs = [
    `<marker id="${sArrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#0f172a"/></marker>`,
    `<marker id="${spArrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#1d4ed8"/></marker>`,
    `<marker id="${wlArrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#0f766e"/></marker>`,
  ].join("");

  const parts: string[] = [];
  const schematic =
    Boolean(spec.schematicAxes) || guard.isExplicitlyHidden(["axisTicks"]);
  const tickStep = niceStep(2 * D, 8);
  const xTicks = buildTicks(xMin, xMax, tickStep);
  const ctTicks = buildTicks(ctMin, ctMax, tickStep);

  // Subtle square grid
  parts.push(
    `<rect x="${coord(boxLeft)}" y="${coord(boxTop)}" width="${coord(boxW)}" height="${coord(boxH)}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/>`,
  );
  if (!schematic) {
    xTicks.forEach((tx) => {
      parts.push(
        `<line x1="${coord(xPx(tx))}" y1="${coord(boxTop)}" x2="${coord(xPx(tx))}" y2="${coord(boxBottom)}" stroke="#e2e8f0" stroke-width="1"/>`,
      );
    });
    ctTicks.forEach((tct) => {
      parts.push(
        `<line x1="${coord(boxLeft)}" y1="${coord(yPx(tct))}" x2="${coord(boxRight)}" y2="${coord(yPx(tct))}" stroke="#e2e8f0" stroke-width="1"/>`,
      );
    });
  }

  // Exact 45-degree light cone lines (x = +ct and x = -ct)
  if (spec.showLightCone ?? true) {
    const rayPlus = clipLineToBox(-D, -D, D, D, xMin, xMax, ctMin, ctMax);
    const rayMinus = clipLineToBox(D, -D, -D, D, xMin, xMax, ctMin, ctMax);
    if (rayPlus) {
      parts.push(
        `<line x1="${coord(xPx(rayPlus[0]))}" y1="${coord(yPx(rayPlus[1]))}" x2="${coord(xPx(rayPlus[2]))}" y2="${coord(yPx(rayPlus[3]))}" stroke="#b45309" stroke-width="1.6" stroke-dasharray="5 4"/>`,
      );
    }
    if (rayMinus) {
      parts.push(
        `<line x1="${coord(xPx(rayMinus[0]))}" y1="${coord(yPx(rayMinus[1]))}" x2="${coord(xPx(rayMinus[2]))}" y2="${coord(yPx(rayMinus[3]))}" stroke="#b45309" stroke-width="1.6" stroke-dasharray="5 4"/>`,
      );
    }
    parts.push(
      `<text x="${coord(boxRight - 6)}" y="${coord(boxTop + 16)}" text-anchor="end" font-size="11" font-weight="600" fill="#b45309">x = ct</text>`,
    );
  }

  // Orthogonal rest-frame S axes (x and ct)
  const ox = xPx(0);
  const oy = yPx(0);
  parts.push(
    `<line x1="${coord(boxLeft)}" y1="${coord(oy)}" x2="${coord(boxRight + 8)}" y2="${coord(oy)}" stroke="#0f172a" stroke-width="2" marker-end="url(#${sArrowId})"/>`,
    `<line x1="${coord(ox)}" y1="${coord(boxBottom)}" x2="${coord(ox)}" y2="${coord(boxTop - 8)}" stroke="#0f172a" stroke-width="2" marker-end="url(#${sArrowId})"/>`,
    `<text x="${coord(boxRight + 14)}" y="${coord(oy + 4)}" font-size="14" font-weight="700" fill="#0f172a">x</text>`,
    `<text x="${coord(ox)}" y="${coord(boxTop - 14)}" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a">ct</text>`,
  );

  if (!schematic && guard.canShowInput(["xAxisTicks", "axisTicks"])) {
    xTicks.forEach((tx) => {
      if (tx === 0) return;
      parts.push(
        `<text x="${coord(xPx(tx))}" y="${coord(oy + 15)}" text-anchor="middle" font-size="10" fill="#475569">${escapeXml(formatCleanTick(tx))}</text>`,
      );
    });
  }
  if (!schematic && guard.canShowInput(["yAxisTicks", "axisTicks"])) {
    ctTicks.forEach((tct) => {
      if (tct === 0) return;
      parts.push(
        `<text x="${coord(ox - 7)}" y="${coord(yPx(tct) + 3)}" text-anchor="end" font-size="10" fill="#475569">${escapeXml(formatCleanTick(tct))}</text>`,
      );
    });
  }

  // Tilted primed frame S' axes (ct': x = beta*ct, x': ct = beta*x)
  if ((spec.showPrimedAxes ?? true) && Math.abs(solution.beta) > 1e-6) {
    const b = solution.beta;
    const ctPrimeSeg = clipLineToBox(
      b * -2 * D,
      -2 * D,
      b * 2 * D,
      2 * D,
      xMin,
      xMax,
      ctMin,
      ctMax,
    );
    const xPrimeSeg = clipLineToBox(
      -2 * D,
      b * -2 * D,
      2 * D,
      b * 2 * D,
      xMin,
      xMax,
      ctMin,
      ctMax,
    );
    if (ctPrimeSeg) {
      parts.push(
        `<line x1="${coord(xPx(ctPrimeSeg[0]))}" y1="${coord(yPx(ctPrimeSeg[1]))}" x2="${coord(xPx(ctPrimeSeg[2]))}" y2="${coord(yPx(ctPrimeSeg[3]))}" stroke="#1d4ed8" stroke-width="2.1" marker-end="url(#${spArrowId})"/>`,
        `<text x="${coord(xPx(ctPrimeSeg[2]) + (b >= 0 ? 8 : -8))}" y="${coord(yPx(ctPrimeSeg[3]) - 6)}" text-anchor="${b >= 0 ? "start" : "end"}" font-size="13" font-weight="700" fill="#1d4ed8">ct′</text>`,
      );
    }
    if (xPrimeSeg) {
      parts.push(
        `<line x1="${coord(xPx(xPrimeSeg[0]))}" y1="${coord(yPx(xPrimeSeg[1]))}" x2="${coord(xPx(xPrimeSeg[2]))}" y2="${coord(yPx(xPrimeSeg[3]))}" stroke="#1d4ed8" stroke-width="2.1" marker-end="url(#${spArrowId})"/>`,
        `<text x="${coord(xPx(xPrimeSeg[2]) + 8)}" y="${coord(yPx(xPrimeSeg[3]) + 4)}" font-size="13" font-weight="700" fill="#1d4ed8">x′</text>`,
      );
    }
  }

  // Additional worldlines
  (spec.worldlines ?? []).forEach((wl) => {
    const x0 = wl.x0LightSeconds ?? 0;
    const seg = clipLineToBox(
      x0 + wl.beta * -2 * D,
      -2 * D,
      x0 + wl.beta * 2 * D,
      2 * D,
      xMin,
      xMax,
      ctMin,
      ctMax,
    );
    if (!seg) return;
    const stroke = wl.isPhoton ? "#d97706" : "#0f766e";
    const dash = wl.isPhoton ? ' stroke-dasharray="4 3"' : "";
    parts.push(
      `<line x1="${coord(xPx(seg[0]))}" y1="${coord(yPx(seg[1]))}" x2="${coord(xPx(seg[2]))}" y2="${coord(yPx(seg[3]))}" stroke="${stroke}" stroke-width="2"${dash} marker-end="url(#${wlArrowId})"/>`,
    );
    if (guard.canShowInput([`worldline:${wl.id}`, "worldlineLabels"])) {
      parts.push(
        `<text x="${coord(xPx(seg[2]) + 6)}" y="${coord(yPx(seg[3]) + 14)}" font-size="12" font-weight="600" fill="${stroke}">${escapeXml(wl.label)}</text>`,
      );
    }
  });

  // Spacetime events & optional Lorentz projections onto S' axes
  solution.events.forEach((ev, idx) => {
    const rawEv = spec.events![idx];
    const ex = ev.xLightSeconds;
    const ect = ev.ctLightSeconds;
    if (ex < xMin || ex > xMax || ect < ctMin || ect > ctMax) return;

    if (rawEv.showProjections && Math.abs(solution.beta) > 1e-6) {
      const g = solution.lorentzFactor;
      const b = solution.beta;
      // Intersection with ct' axis (parallel to x'): (beta*gamma*ct', gamma*ct')
      const intCtPrimeX = b * g * ev.ctPrimeLightSeconds;
      const intCtPrimeCt = g * ev.ctPrimeLightSeconds;
      const segTime = clipLineToBox(
        ex,
        ect,
        intCtPrimeX,
        intCtPrimeCt,
        xMin,
        xMax,
        ctMin,
        ctMax,
      );
      if (segTime) {
        parts.push(
          `<line x1="${coord(xPx(segTime[0]))}" y1="${coord(yPx(segTime[1]))}" x2="${coord(xPx(segTime[2]))}" y2="${coord(yPx(segTime[3]))}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="4 3"/>`,
        );
      }
      // Intersection with x' axis (parallel to ct'): (gamma*x', beta*gamma*x')
      const intXPrimeX = g * ev.xPrimeLightSeconds;
      const intXPrimeCt = b * g * ev.xPrimeLightSeconds;
      const segPos = clipLineToBox(
        ex,
        ect,
        intXPrimeX,
        intXPrimeCt,
        xMin,
        xMax,
        ctMin,
        ctMax,
      );
      if (segPos) {
        parts.push(
          `<line x1="${coord(xPx(segPos[0]))}" y1="${coord(yPx(segPos[1]))}" x2="${coord(xPx(segPos[2]))}" y2="${coord(yPx(segPos[3]))}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="4 3"/>`,
        );
      }
    }

    parts.push(
      `<circle cx="${coord(xPx(ex))}" cy="${coord(yPx(ect))}" r="4.5" fill="#dc2626" stroke="#ffffff" stroke-width="1.5"/>`,
    );
    if (guard.canShowInput([`event:${ev.id}`, "eventLabels"])) {
      parts.push(
        `<text x="${coord(xPx(ex) + 7)}" y="${coord(yPx(ect) - 7)}" font-size="12" font-weight="700" fill="#dc2626">${escapeXml(ev.label)}</text>`,
      );
    }
  });

  // Relative frame speed legend (only shown if beta / frameSpeedMs is not hidden)
  if (guard.canShowInput(["beta", "frameSpeedMs"])) {
    const sign = solution.beta < 0 ? "−" : "";
    const absB = Number(Math.abs(solution.beta).toPrecision(3));
    parts.push(
      `<text x="${coord(boxLeft + 8)}" y="${coord(boxTop + 18)}" font-size="12" font-weight="600" fill="#1d4ed8">v = ${sign}${absB}c</text>`,
    );
  }

  return {
    title: "Minkowski spacetime diagram",
    ariaLabel: "Minkowski spacetime diagram with light cone and inertial axes",
    desc: "Spacetime diagram plotting ct against x with Lorentz-transformed axes",
    defs,
    body: parts.join(""),
  };
}
