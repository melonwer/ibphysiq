import { Point2D } from "../types";
import {
  AcGeneratorSolution,
  AcGeneratorSpec,
  BainbridgeSpectrometerSolution,
  BainbridgeSpectrometerSpec,
  CapacitorNetworkSolution,
  CapacitorNetworkSpec,
  ELEMENTARY_CHARGE_C,
  ElectricDeflectionSolution,
  ElectricDeflectionSpec,
  EmInductionRenderOptions,
  EmInductionScenarioSpec,
  EmInductionSolution,
  EmVisibilityControls,
  FluxFaradaySolution,
  FluxFaradaySpec,
  MagneticCyclotronSolution,
  MagneticCyclotronSpec,
  MagneticFieldPageDirection,
  MotionalEmfRailsSolution,
  MotionalEmfRailsSpec,
  ParallelPlateCapacitorSolution,
  ParallelPlateCapacitorSpec,
  RcTransientSolution,
  RcTransientSpec,
  TransformerSolution,
  TransformerSpec,
  VelocitySelectorSolution,
  VelocitySelectorSpec,
  formatSiQuantity,
  inferQuantityUnit,
  isExplicitlyHidden,
  isQuantityVisible,
  mergeEmVisibilityControls,
} from "./types";

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const SUBSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
};

function toSubscriptInt(n: number): string {
  return [...String(n)].map((ch) => SUBSCRIPT_DIGITS[ch] ?? ch).join("");
}

interface EmVisibilityContext {
  controls: EmVisibilityControls;
  hiddenMagnitudes: readonly number[];
  hiddenNumberTokens: ReadonlySet<string>;
  hiddenAxisTickTokens: ReadonlySet<string>;
  hiddenFormattedWithUnit: ReadonlySet<string>;
  zeroIsHidden: boolean;
}

function buildEmVisibilityContext(
  spec: EmInductionScenarioSpec,
  solution: EmInductionSolution,
  options: EmInductionRenderOptions,
): EmVisibilityContext {
  const controls = mergeEmVisibilityControls(spec, options);
  const hiddenMagnitudes: number[] = [];
  const hiddenNumberTokens = new Set<string>();
  const hiddenAxisTickTokens = new Set<string>();
  const hiddenFormattedWithUnit = new Set<string>();
  let zeroIsHidden = false;

  const registerHiddenValue = (key: string, val: number): void => {
    if (!Number.isFinite(val)) {
      return;
    }
    if (Math.abs(val) < 1e-18) {
      zeroIsHidden = true;
      return;
    }
    const mag = Math.abs(val);
    hiddenMagnitudes.push(mag);
    hiddenNumberTokens.add(formatSiQuantity(mag, ""));
    if (mag >= 1e-3 && mag < 1e5) {
      const prec3 = Number(mag.toPrecision(3)).toString();
      if (!prec3.includes("e")) {
        hiddenNumberTokens.add(prec3);
      }
      const prec2 = Number(mag.toPrecision(2)).toString();
      if (!prec2.includes("e")) {
        hiddenAxisTickTokens.add(prec2);
      }
    }
    const unit = inferQuantityUnit(key);
    if (unit) {
      hiddenFormattedWithUnit.add(formatSiQuantity(mag, unit));
    }
    if (key === "efficiency") {
      const pct = Number((mag * 100).toPrecision(3)).toString();
      hiddenFormattedWithUnit.add(`${pct}%`);
      hiddenNumberTokens.add(pct);
    }
  };

  for (const [qKey, qVal] of Object.entries(solution.quantities)) {
    if (isExplicitlyHidden(controls, qKey)) {
      registerHiddenValue(qKey, qVal);
    }
  }

  return {
    controls,
    hiddenMagnitudes,
    hiddenNumberTokens,
    hiddenAxisTickTokens,
    hiddenFormattedWithUnit,
    zeroIsHidden,
  };
}

function matchesAnyHiddenValue(
  ctx: EmVisibilityContext,
  candidateValue: number,
  candidateUnit = "",
): boolean {
  if (!Number.isFinite(candidateValue)) {
    return false;
  }
  if (Math.abs(candidateValue) < 1e-18) {
    return ctx.zeroIsHidden;
  }
  const mag = Math.abs(candidateValue);
  if (ctx.hiddenMagnitudes.some((hMag) => Math.abs(mag - hMag) <= 1e-6 * hMag)) {
    return true;
  }
  const candUnprefixed = formatSiQuantity(mag, "");
  if (ctx.hiddenNumberTokens.has(candUnprefixed)) {
    return true;
  }
  if (mag >= 1e-3 && mag < 1e5) {
    const candPrec3 = Number(mag.toPrecision(3)).toString();
    if (!candPrec3.includes("e") && ctx.hiddenNumberTokens.has(candPrec3)) {
      return true;
    }
  }
  if (candidateUnit) {
    const candWithUnit = formatSiQuantity(mag, candidateUnit);
    if (ctx.hiddenFormattedWithUnit.has(candWithUnit)) {
      return true;
    }
    const spaceIdx = candWithUnit.lastIndexOf(" ");
    if (spaceIdx > 0) {
      const candNumPart = candWithUnit.slice(0, spaceIdx);
      if (ctx.hiddenNumberTokens.has(candNumPart)) {
        return true;
      }
    }
  }
  return false;
}

function matchesAnyHiddenAxisTick(
  ctx: EmVisibilityContext,
  tickValue: number,
  unit: string,
): boolean {
  if (matchesAnyHiddenValue(ctx, tickValue, unit)) {
    return true;
  }
  if (Math.abs(tickValue) >= 1e-18) {
    const tickLabel = Number(Math.abs(tickValue).toPrecision(2)).toString();
    if (
      ctx.hiddenNumberTokens.has(tickLabel) ||
      ctx.hiddenAxisTickTokens.has(tickLabel)
    ) {
      return true;
    }
  }
  return false;
}

interface GuardedLabelOptions {
  isDerived?: boolean;
  aliases?: readonly string[];
  hiddenCompanions?: readonly string[];
  forceSymbolic?: boolean;
}

function canRenderNumericQuantity(
  ctx: EmVisibilityContext,
  canonicalId: string,
  value: number,
  unit: string,
  options: GuardedLabelOptions = {},
): boolean {
  if (options.forceSymbolic) {
    return false;
  }
  if (
    !isQuantityVisible(ctx.controls, canonicalId, {
      isDerived: options.isDerived,
      aliases: options.aliases,
    })
  ) {
    return false;
  }
  if (
    options.hiddenCompanions?.some((comp) =>
      isExplicitlyHidden(ctx.controls, comp),
    )
  ) {
    return false;
  }
  return !matchesAnyHiddenValue(ctx, value, unit);
}

function guardedLabeledQuantity(
  ctx: EmVisibilityContext,
  canonicalId: string,
  symbol: string,
  value: number,
  unit: string,
  options: GuardedLabelOptions = {},
): string {
  if (!canRenderNumericQuantity(ctx, canonicalId, value, unit, options)) {
    return symbol;
  }
  return `${symbol} = ${formatSiQuantity(value, unit)}`;
}

function containsAnyHiddenToken(
  ctx: EmVisibilityContext,
  text: string,
): boolean {
  if (ctx.zeroIsHidden && /(?<![\d.])0(?![\d.])/.test(text)) {
    return true;
  }
  for (const full of ctx.hiddenFormattedWithUnit) {
    if (text.includes(full)) {
      return true;
    }
  }
  for (const tok of ctx.hiddenNumberTokens) {
    const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`);
    if (re.test(text)) {
      return true;
    }
  }
  return false;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return map[ch] ?? ch;
  });
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Non-finite SVG coordinate");
  }
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function assertDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 360 ||
    width > 1800 ||
    height < 240 ||
    height > 1200
  ) {
    throw new Error(
      "Invalid SVG dimensions: width must be 360..1800 and height 240..1200 integers",
    );
  }
}

function defaultDimensions(spec: EmInductionScenarioSpec): {
  width: number;
  height: number;
} {
  if (
    (spec.kind === "rc-transient" &&
      (spec.layout ?? "circuit-and-graph") === "circuit-and-graph") ||
    spec.kind === "ac-generator" ||
    spec.kind === "bainbridge-mass-spectrometer" ||
    (spec.kind === "parallel-plate-capacitor" && spec.afterChange !== undefined)
  ) {
    return { width: 880, height: 440 };
  }
  return { width: 760, height: 430 };
}

function renderUniformBFieldGrid(
  box: Box,
  direction: MagneticFieldPageDirection,
  rows: number,
  cols: number,
): string {
  const parts: string[] = [
    `<rect x="${fmt(box.left)}" y="${fmt(box.top)}" width="${fmt(box.right - box.left)}" height="${fmt(box.bottom - box.top)}" rx="6" fill="#f7f9fb" stroke="#9aa5b1" stroke-width="1.4" stroke-dasharray="6 4"/>`,
  ];
  const padX = (box.right - box.left) / (cols + 1);
  const padY = (box.bottom - box.top) / (rows + 1);
  for (let r = 1; r <= rows; r += 1) {
    const cy = box.top + r * padY;
    for (let c = 1; c <= cols; c += 1) {
      const cx = box.left + c * padX;
      if (direction === "into-page") {
        parts.push(
          `<g data-field-symbol="cross" opacity="0.62"><circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="6.5" fill="none" stroke="#52606d" stroke-width="1.2"/><line x1="${fmt(cx - 4.2)}" y1="${fmt(cy - 4.2)}" x2="${fmt(cx + 4.2)}" y2="${fmt(cy + 4.2)}" stroke="#52606d" stroke-width="1.2"/><line x1="${fmt(cx - 4.2)}" y1="${fmt(cy + 4.2)}" x2="${fmt(cx + 4.2)}" y2="${fmt(cy - 4.2)}" stroke="#52606d" stroke-width="1.2"/></g>`,
        );
      } else {
        parts.push(
          `<g data-field-symbol="dot" opacity="0.62"><circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="6.5" fill="none" stroke="#52606d" stroke-width="1.2"/><circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="2.1" fill="#52606d"/></g>`,
        );
      }
    }
  }
  return parts.join("");
}

function fieldDirectionBadgeText(
  ctx: EmVisibilityContext,
  canonicalId: string,
  symbol: string,
  fieldT: number,
  direction: MagneticFieldPageDirection,
  aliases: readonly string[] = [],
  hiddenCompanions: readonly string[] = [],
): string {
  const dirGlyph =
    direction === "into-page" ? "⊗ into page" : "⊙ out of page";
  const base = guardedLabeledQuantity(ctx, canonicalId, symbol, fieldT, "T", {
    aliases,
    hiddenCompanions,
  });
  return `${base} (${dirGlyph})`;
}

function drawCapacitorSymbolH(cx: number, cy: number, halfGap = 6, plateHalfH = 18): string {
  return `<line x1="${fmt(cx - halfGap)}" y1="${fmt(cy - plateHalfH)}" x2="${fmt(cx - halfGap)}" y2="${fmt(cy + plateHalfH)}" stroke="#171b1f" stroke-width="2.4"/><line x1="${fmt(cx + halfGap)}" y1="${fmt(cy - plateHalfH)}" x2="${fmt(cx + halfGap)}" y2="${fmt(cy + plateHalfH)}" stroke="#171b1f" stroke-width="2.4"/>`;
}

function drawCapacitorSymbolV(cx: number, cy: number, halfGap = 6, plateHalfW = 18): string {
  return `<line x1="${fmt(cx - plateHalfW)}" y1="${fmt(cy - halfGap)}" x2="${fmt(cx + plateHalfW)}" y2="${fmt(cy - halfGap)}" stroke="#171b1f" stroke-width="2.4"/><line x1="${fmt(cx - plateHalfW)}" y1="${fmt(cy + halfGap)}" x2="${fmt(cx + plateHalfW)}" y2="${fmt(cy + halfGap)}" stroke="#171b1f" stroke-width="2.4"/>`;
}

function drawResistorH(cx: number, cy: number, w = 58, h = 22): string {
  return `<rect x="${fmt(cx - w / 2)}" y="${fmt(cy - h / 2)}" width="${fmt(w)}" height="${fmt(h)}" fill="white" stroke="#171b1f" stroke-width="2"/>`;
}

function drawResistorV(cx: number, cy: number, w = 22, h = 58): string {
  return `<rect x="${fmt(cx - w / 2)}" y="${fmt(cy - h / 2)}" width="${fmt(w)}" height="${fmt(h)}" fill="white" stroke="#171b1f" stroke-width="2"/>`;
}

function drawDcCellV(cx: number, cy: number): string {
  return `<line x1="${fmt(cx - 18)}" y1="${fmt(cy - 5)}" x2="${fmt(cx + 18)}" y2="${fmt(cy - 5)}" stroke="#171b1f" stroke-width="2.2"/><line x1="${fmt(cx - 10)}" y1="${fmt(cy + 5)}" x2="${fmt(cx + 10)}" y2="${fmt(cy + 5)}" stroke="#171b1f" stroke-width="3.2"/>`;
}

function drawDcCellH(cx: number, cy: number): string {
  return `<line x1="${fmt(cx - 5)}" y1="${fmt(cy - 18)}" x2="${fmt(cx - 5)}" y2="${fmt(cy + 18)}" stroke="#171b1f" stroke-width="2.2"/><line x1="${fmt(cx + 5)}" y1="${fmt(cy - 10)}" x2="${fmt(cx + 5)}" y2="${fmt(cy + 10)}" stroke="#171b1f" stroke-width="3.2"/>`;
}

function renderParallelPlatePanel(
  box: Box,
  spec: ParallelPlateCapacitorSpec,
  solution: ParallelPlateCapacitorSolution,
  ctx: EmVisibilityContext,
  areaM2: number,
  sepM: number,
  er: number,
  voltageV: number,
  isAfterPanel: boolean,
  arrowId: string,
): string {
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2 + 8;
  const plateHalfW = Math.min(130, (box.right - box.left) * 0.34);
  const baseSepRatio = isAfterPanel && spec.afterChange?.newSeparationM
    ? Math.max(0.55, Math.min(1.65, spec.afterChange.newSeparationM / spec.plateSeparationM))
    : 1;
  const halfGapPx = 46 * baseSepRatio;
  const topY = cy - halfGapPx;
  const botY = cy + halfGapPx;

  const initEr = spec.relativePermittivity ?? 1;
  const afterSep = spec.afterChange
    ? (spec.afterChange.newSeparationM ?? spec.plateSeparationM)
    : undefined;
  const afterEr = spec.afterChange
    ? (spec.afterChange.newRelativePermittivity ?? initEr)
    : undefined;
  const sameSep =
    afterSep !== undefined &&
    Math.abs(afterSep - spec.plateSeparationM) <= 1e-9 * spec.plateSeparationM;
  const sameEr =
    afterEr !== undefined && Math.abs(afterEr - initEr) <= 1e-9 * initEr;
  const sameVoltage =
    solution.afterChange !== undefined &&
    Math.abs(solution.afterChange.voltageV - spec.voltageV) <=
      1e-9 * Math.max(1, spec.voltageV);

  const parts: string[] = [];

  // Optional dielectric block between plates
  if (er > 1) {
    parts.push(
      `<rect x="${fmt(cx - plateHalfW + 6)}" y="${fmt(topY + 4)}" width="${fmt(2 * plateHalfW - 12)}" height="${fmt(botY - topY - 8)}" rx="3" fill="#e6eff7" stroke="#7b93a8" stroke-width="1.2"/>`,
    );
    const erLabel = isAfterPanel
      ? guardedLabeledQuantity(
          ctx,
          "afterRelativePermittivity",
          "εᵣ′",
          er,
          "",
          { aliases: ["relativePermittivity", "epsilon_r"] },
        )
      : guardedLabeledQuantity(ctx, "relativePermittivity", "εᵣ", er, "", {
          hiddenCompanions: sameEr ? ["afterRelativePermittivity"] : [],
        });
    parts.push(
      `<text x="${fmt(cx)}" y="${fmt(cy + 5)}" text-anchor="middle" font-size="14" fill="#243b53">${escapeXml(erLabel)}</text>`,
    );
  }

  // Uniform electric field lines from top (+) to bottom (-)
  const fieldCols = 5;
  for (let i = 0; i < fieldCols; i += 1) {
    const fx =
      cx - plateHalfW * 0.72 + (i * (plateHalfW * 1.44)) / (fieldCols - 1);
    parts.push(
      `<line x1="${fmt(fx)}" y1="${fmt(topY + 6)}" x2="${fmt(fx)}" y2="${fmt(botY - 8)}" stroke="#486581" stroke-width="1.5" marker-end="url(#${arrowId})"/>`,
    );
  }

  // Upper (+) and lower (-) plates
  parts.push(
    `<rect x="${fmt(cx - plateHalfW)}" y="${fmt(topY - 7)}" width="${fmt(2 * plateHalfW)}" height="7" fill="#d9e2ec" stroke="#171b1f" stroke-width="2"/>`,
    `<rect x="${fmt(cx - plateHalfW)}" y="${fmt(botY)}" width="${fmt(2 * plateHalfW)}" height="7" fill="#d9e2ec" stroke="#171b1f" stroke-width="2"/>`,
    `<text x="${fmt(cx - plateHalfW + 14)}" y="${fmt(topY - 13)}" font-size="14" font-weight="700" fill="#171b1f">+  +  +  +</text>`,
    `<text x="${fmt(cx - plateHalfW + 14)}" y="${fmt(botY + 22)}" font-size="14" font-weight="700" fill="#171b1f">−  −  −  −</text>`,
  );

  // Leads on left side (connected battery or isolated open terminals)
  const leadX = box.left + 48;
  const isolated =
    isAfterPanel && spec.afterChange?.constraint === "isolated-charge";
  parts.push(
    `<path d="M${fmt(cx - plateHalfW)} ${fmt(topY - 3.5)}H${fmt(leadX)}V${fmt(cy - 18)}" fill="none" stroke="#171b1f" stroke-width="1.8"/>`,
    `<path d="M${fmt(cx - plateHalfW)} ${fmt(botY + 3.5)}H${fmt(leadX)}V${fmt(cy + 18)}" fill="none" stroke="#171b1f" stroke-width="1.8"/>`,
  );
  if (isolated) {
    parts.push(
      `<circle cx="${fmt(leadX)}" cy="${fmt(cy - 18)}" r="3.5" fill="white" stroke="#171b1f" stroke-width="1.8"/>`,
      `<circle cx="${fmt(leadX)}" cy="${fmt(cy + 18)}" r="3.5" fill="white" stroke="#171b1f" stroke-width="1.8"/>`,
      `<text x="${fmt(leadX + 12)}" y="${fmt(cy + 4)}" font-size="13" fill="#486581">isolated</text>`,
    );
  } else {
    parts.push(
      `<line x1="${fmt(leadX)}" y1="${fmt(cy - 18)}" x2="${fmt(leadX)}" y2="${fmt(cy - 5)}" stroke="#171b1f" stroke-width="1.8"/>`,
      `<line x1="${fmt(leadX)}" y1="${fmt(cy + 5)}" x2="${fmt(leadX)}" y2="${fmt(cy + 18)}" stroke="#171b1f" stroke-width="1.8"/>`,
      drawDcCellV(leadX, cy),
    );
    const vLabel = isAfterPanel
      ? guardedLabeledQuantity(ctx, "afterVoltageV", "V", voltageV, "V", {
          aliases: ["voltageV", "V"],
        })
      : guardedLabeledQuantity(ctx, "voltageV", "V", voltageV, "V", {
          hiddenCompanions: sameVoltage ? ["afterVoltageV"] : [],
        });
    parts.push(
      `<text x="${fmt(leadX + 22)}" y="${fmt(cy + 5)}" font-size="14" fill="#171b1f">${escapeXml(vLabel)}</text>`,
    );
  }

  // Separation dimension on right
  const dimX = cx + plateHalfW + 24;
  parts.push(
    `<line x1="${fmt(dimX - 6)}" y1="${fmt(topY)}" x2="${fmt(dimX + 6)}" y2="${fmt(topY)}" stroke="#52606d" stroke-width="1.4"/>`,
    `<line x1="${fmt(dimX - 6)}" y1="${fmt(botY)}" x2="${fmt(dimX + 6)}" y2="${fmt(botY)}" stroke="#52606d" stroke-width="1.4"/>`,
    `<line x1="${fmt(dimX)}" y1="${fmt(topY + 4)}" x2="${fmt(dimX)}" y2="${fmt(botY - 4)}" stroke="#52606d" stroke-width="1.4" marker-end="url(#${arrowId})"/>`,
  );
  const dLabel = isAfterPanel
    ? guardedLabeledQuantity(ctx, "afterSeparationM", "d′", sepM, "m", {
        aliases: ["plateSeparationM", "d"],
      })
    : guardedLabeledQuantity(ctx, "plateSeparationM", "d", sepM, "m", {
        hiddenCompanions: sameSep ? ["afterSeparationM"] : [],
      });
  parts.push(
    `<text x="${fmt(dimX + 10)}" y="${fmt(cy + 5)}" font-size="14" fill="#171b1f">${escapeXml(dLabel)}</text>`,
  );

  const areaLabel = guardedLabeledQuantity(
    ctx,
    "plateAreaM2",
    "A",
    areaM2,
    "m²",
  );
  parts.push(
    `<text x="${fmt(cx)}" y="${fmt(topY - 30)}" text-anchor="middle" font-size="14" fill="#171b1f">${escapeXml(areaLabel)}</text>`,
  );

  return parts.join("");
}

function renderParallelPlateCapacitorSvg(
  spec: ParallelPlateCapacitorSpec,
  solution: ParallelPlateCapacitorSolution,
  ctx: EmVisibilityContext,
  width: number,
  height: number,
  arrowId: string,
): string {
  const parts: string[] = [];
  if (!spec.afterChange || !solution.afterChange) {
    const box: Box = { left: 32, top: 36, right: width - 32, bottom: height - 32 };
    parts.push(
      renderParallelPlatePanel(
        box,
        spec,
        solution,
        ctx,
        spec.plateAreaM2,
        spec.plateSeparationM,
        spec.relativePermittivity ?? 1,
        spec.voltageV,
        false,
        arrowId,
      ),
    );
    if (
      canRenderNumericQuantity(ctx, "capacitanceF", solution.capacitanceF, "F", {
        isDerived: true,
      })
    ) {
      parts.push(
        `<text x="${fmt(width / 2)}" y="${fmt(height - 20)}" text-anchor="middle" font-size="14" fill="#243b53">${escapeXml(guardedLabeledQuantity(ctx, "capacitanceF", "C", solution.capacitanceF, "F", { isDerived: true }))}</text>`,
      );
    }
    return parts.join("");
  }

  const mid = width / 2;
  const leftBox: Box = { left: 20, top: 44, right: mid - 10, bottom: height - 28 };
  const rightBox: Box = {
    left: mid + 10,
    top: 44,
    right: width - 20,
    bottom: height - 28,
  };
  parts.push(
    `<rect x="${fmt(leftBox.left)}" y="${fmt(leftBox.top - 16)}" width="${fmt(leftBox.right - leftBox.left)}" height="${fmt(leftBox.bottom - leftBox.top + 16)}" rx="8" fill="none" stroke="#cbd2d9"/>`,
    `<rect x="${fmt(rightBox.left)}" y="${fmt(rightBox.top - 16)}" width="${fmt(rightBox.right - rightBox.left)}" height="${fmt(rightBox.bottom - rightBox.top + 16)}" rx="8" fill="none" stroke="#cbd2d9"/>`,
    `<text x="${fmt((leftBox.left + leftBox.right) / 2)}" y="${fmt(leftBox.top + 6)}" text-anchor="middle" font-size="15" font-weight="700" fill="#171b1f">Initial state</text>`,
    `<text x="${fmt((rightBox.left + rightBox.right) / 2)}" y="${fmt(rightBox.top + 6)}" text-anchor="middle" font-size="15" font-weight="700" fill="#171b1f">Modified state (${spec.afterChange.constraint})</text>`,
    renderParallelPlatePanel(
      leftBox,
      spec,
      solution,
      ctx,
      spec.plateAreaM2,
      spec.plateSeparationM,
      spec.relativePermittivity ?? 1,
      spec.voltageV,
      false,
      arrowId,
    ),
    renderParallelPlatePanel(
      rightBox,
      spec,
      solution,
      ctx,
      spec.plateAreaM2,
      spec.afterChange.newSeparationM ?? spec.plateSeparationM,
      spec.afterChange.newRelativePermittivity ?? spec.relativePermittivity ?? 1,
      solution.afterChange.voltageV,
      true,
      arrowId,
    ),
  );
  return parts.join("");
}

function renderCapacitorNetworkSvg(
  spec: CapacitorNetworkSpec,
  solution: CapacitorNetworkSolution,
  ctx: EmVisibilityContext,
  width: number,
  height: number,
): string {
  const parts: string[] = [];
  const { topology } = spec;
  const left = 110;
  const right = width - 110;
  const top = 88;
  const bot = height - 88;
  const midX = (left + right) / 2;

  if (topology.arrangement === "series") {
    const n = topology.capacitancesF.length;
    const span = right - left;
    const step = span / n;
    parts.push(
      `<line x1="${fmt(left)}" y1="${fmt(top)}" x2="${fmt(left)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(right)}" y1="${fmt(top)}" x2="${fmt(right)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(left)}" y1="${fmt(bot)}" x2="${fmt(midX - 5)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(midX + 5)}" y1="${fmt(bot)}" x2="${fmt(right)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
      drawDcCellH(midX, bot),
    );
    const vText = guardedLabeledQuantity(
      ctx,
      "supplyVoltageV",
      "V₀",
      topology.supplyVoltageV,
      "V",
    );
    parts.push(
      `<text x="${fmt(midX)}" y="${fmt(bot + 36)}" text-anchor="middle" font-size="15" fill="#171b1f">${escapeXml(vText)}</text>`,
    );

    let prevX = left;
    topology.capacitancesF.forEach((cVal, idx) => {
      const cx = left + (idx + 0.5) * step;
      const nextX = left + (idx + 1) * step;
      parts.push(
        `<line x1="${fmt(prevX)}" y1="${fmt(top)}" x2="${fmt(cx - 6)}" y2="${fmt(top)}" stroke="#171b1f" stroke-width="2"/>`,
        drawCapacitorSymbolH(cx, top),
        `<line x1="${fmt(cx + 6)}" y1="${fmt(top)}" x2="${fmt(nextX)}" y2="${fmt(top)}" stroke="#171b1f" stroke-width="2"/>`,
      );
      const cText = guardedLabeledQuantity(
        ctx,
        `c${idx + 1}F`,
        `C${toSubscriptInt(idx + 1)}`,
        cVal,
        "F",
        {
          aliases: [
            `C${idx + 1}`,
            `C_${idx + 1}`,
            "capacitancesF",
            "capacitanceF",
            "C",
          ],
        },
      );
      parts.push(
        `<text x="${fmt(cx)}" y="${fmt(top - 28)}" text-anchor="middle" font-size="14" fill="#171b1f">${escapeXml(cText)}</text>`,
      );
      prevX = nextX;
    });
  } else if (topology.arrangement === "parallel") {
    const n = topology.capacitancesF.length;
    const branchTop = 76;
    const branchBot = height - 116;
    const supplyY = height - 54;
    const branchStep = (branchBot - branchTop) / Math.max(1, n - 1);

    parts.push(
      `<line x1="${fmt(left)}" y1="${fmt(branchTop)}" x2="${fmt(left)}" y2="${fmt(supplyY)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(right)}" y1="${fmt(branchTop)}" x2="${fmt(right)}" y2="${fmt(supplyY)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(left)}" y1="${fmt(supplyY)}" x2="${fmt(midX - 5)}" y2="${fmt(supplyY)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(midX + 5)}" y1="${fmt(supplyY)}" x2="${fmt(right)}" y2="${fmt(supplyY)}" stroke="#171b1f" stroke-width="2"/>`,
      drawDcCellH(midX, supplyY),
    );
    const branchVoltageKeys = topology.capacitancesF.map(
      (_, idx) => `v${idx + 1}V`,
    );
    const vText = guardedLabeledQuantity(
      ctx,
      "supplyVoltageV",
      "V₀",
      topology.supplyVoltageV,
      "V",
      { hiddenCompanions: branchVoltageKeys },
    );
    parts.push(
      `<text x="${fmt(midX)}" y="${fmt(supplyY + 34)}" text-anchor="middle" font-size="15" fill="#171b1f">${escapeXml(vText)}</text>`,
    );

    topology.capacitancesF.forEach((cVal, idx) => {
      const y = branchTop + idx * branchStep;
      parts.push(
        `<line x1="${fmt(left)}" y1="${fmt(y)}" x2="${fmt(midX - 6)}" y2="${fmt(y)}" stroke="#171b1f" stroke-width="2"/>`,
        drawCapacitorSymbolH(midX, y),
        `<line x1="${fmt(midX + 6)}" y1="${fmt(y)}" x2="${fmt(right)}" y2="${fmt(y)}" stroke="#171b1f" stroke-width="2"/>`,
      );
      if (idx > 0 || n > 1) {
        parts.push(
          `<circle cx="${fmt(left)}" cy="${fmt(y)}" r="3.5" fill="#171b1f"/>`,
          `<circle cx="${fmt(right)}" cy="${fmt(y)}" r="3.5" fill="#171b1f"/>`,
        );
      }
      const cText = guardedLabeledQuantity(
        ctx,
        `c${idx + 1}F`,
        `C${toSubscriptInt(idx + 1)}`,
        cVal,
        "F",
        {
          aliases: [
            `C${idx + 1}`,
            `C_${idx + 1}`,
            "capacitancesF",
            "capacitanceF",
            "C",
          ],
        },
      );
      parts.push(
        `<text x="${fmt(midX + 22)}" y="${fmt(y - 12)}" font-size="14" fill="#171b1f">${escapeXml(cText)}</text>`,
      );
    });
  } else if (topology.arrangement === "series-parallel") {
    const splitX = left + (right - left) * 0.42;
    const joinX = right - 40;
    const csX = (left + splitX) / 2;
    const cpX = (splitX + joinX) / 2;
    const k = topology.parallelCapacitancesF.length;
    const pSpan = 120;
    const pTop = top - pSpan / 2 + 24;
    const pStep = pSpan / Math.max(1, k - 1);
    const centerTopY = pTop + pSpan / 2;

    parts.push(
      `<line x1="${fmt(left)}" y1="${fmt(centerTopY)}" x2="${fmt(csX - 6)}" y2="${fmt(centerTopY)}" stroke="#171b1f" stroke-width="2"/>`,
      drawCapacitorSymbolH(csX, centerTopY),
      `<line x1="${fmt(csX + 6)}" y1="${fmt(centerTopY)}" x2="${fmt(splitX)}" y2="${fmt(centerTopY)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(splitX)}" y1="${fmt(pTop)}" x2="${fmt(splitX)}" y2="${fmt(pTop + pSpan)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(joinX)}" y1="${fmt(pTop)}" x2="${fmt(joinX)}" y2="${fmt(pTop + pSpan)}" stroke="#171b1f" stroke-width="2"/>`,
      `<circle cx="${fmt(splitX)}" cy="${fmt(centerTopY)}" r="3.8" fill="#171b1f"/>`,
      `<circle cx="${fmt(joinX)}" cy="${fmt(centerTopY)}" r="3.8" fill="#171b1f"/>`,
      `<line x1="${fmt(joinX)}" y1="${fmt(centerTopY)}" x2="${fmt(right)}" y2="${fmt(centerTopY)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(left)}" y1="${fmt(centerTopY)}" x2="${fmt(left)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(right)}" y1="${fmt(centerTopY)}" x2="${fmt(right)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(left)}" y1="${fmt(bot)}" x2="${fmt(midX - 5)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(midX + 5)}" y1="${fmt(bot)}" x2="${fmt(right)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
      drawDcCellH(midX, bot),
    );
    const csText = guardedLabeledQuantity(
      ctx,
      "seriesCapacitanceF",
      "Cₛ",
      topology.seriesCapacitanceF,
      "F",
      { aliases: ["Cs_capacitanceF", "Cs", "C_s", "capacitanceF", "C"] },
    );
    parts.push(
      `<text x="${fmt(csX)}" y="${fmt(centerTopY - 28)}" text-anchor="middle" font-size="14" fill="#171b1f">${escapeXml(csText)}</text>`,
    );
    topology.parallelCapacitancesF.forEach((cVal, idx) => {
      const y = pTop + idx * pStep;
      parts.push(
        `<line x1="${fmt(splitX)}" y1="${fmt(y)}" x2="${fmt(cpX - 6)}" y2="${fmt(y)}" stroke="#171b1f" stroke-width="2"/>`,
        drawCapacitorSymbolH(cpX, y, 5, 14),
        `<line x1="${fmt(cpX + 6)}" y1="${fmt(y)}" x2="${fmt(joinX)}" y2="${fmt(y)}" stroke="#171b1f" stroke-width="2"/>`,
      );
      const cpText = guardedLabeledQuantity(
        ctx,
        `Cp${idx + 1}_capacitanceF`,
        `Cₚ${toSubscriptInt(idx + 1)}`,
        cVal,
        "F",
        {
          aliases: [
            `Cp${idx + 1}`,
            `C_p${idx + 1}`,
            `cp${idx + 1}F`,
            "parallelCapacitancesF",
            "capacitanceF",
            "C",
          ],
        },
      );
      parts.push(
        `<text x="${fmt(cpX + 14)}" y="${fmt(y - 10)}" font-size="13" fill="#171b1f">${escapeXml(cpText)}</text>`,
      );
    });
    const vText = guardedLabeledQuantity(
      ctx,
      "supplyVoltageV",
      "V₀",
      topology.supplyVoltageV,
      "V",
    );
    parts.push(
      `<text x="${fmt(midX)}" y="${fmt(bot + 34)}" text-anchor="middle" font-size="15" fill="#171b1f">${escapeXml(vText)}</text>`,
    );
  } else {
    // Charge-sharing loop with switch S between C1 (left) and C2 (right)
    const midY = (top + bot) / 2;
    const swX = midX;
    parts.push(
      `<line x1="${fmt(left)}" y1="${fmt(top)}" x2="${fmt(swX - 24)}" y2="${fmt(top)}" stroke="#171b1f" stroke-width="2"/>`,
      `<circle cx="${fmt(swX - 24)}" cy="${fmt(top)}" r="3.5" fill="#171b1f"/>`,
      `<line x1="${fmt(swX - 24)}" y1="${fmt(top)}" x2="${fmt(swX + 20)}" y2="${fmt(top - 16)}" stroke="#171b1f" stroke-width="2"/>`,
      `<circle cx="${fmt(swX + 24)}" cy="${fmt(top)}" r="3.5" fill="#171b1f"/>`,
      `<text x="${fmt(swX)}" y="${fmt(top - 24)}" text-anchor="middle" font-size="14" fill="#171b1f">S</text>`,
      `<line x1="${fmt(swX + 24)}" y1="${fmt(top)}" x2="${fmt(right)}" y2="${fmt(top)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(left)}" y1="${fmt(bot)}" x2="${fmt(right)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(left)}" y1="${fmt(top)}" x2="${fmt(left)}" y2="${fmt(midY - 6)}" stroke="#171b1f" stroke-width="2"/>`,
      drawCapacitorSymbolV(left, midY),
      `<line x1="${fmt(left)}" y1="${fmt(midY + 6)}" x2="${fmt(left)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(right)}" y1="${fmt(top)}" x2="${fmt(right)}" y2="${fmt(midY - 6)}" stroke="#171b1f" stroke-width="2"/>`,
      drawCapacitorSymbolV(right, midY),
      `<line x1="${fmt(right)}" y1="${fmt(midY + 6)}" x2="${fmt(right)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
    );
    const c1Text = guardedLabeledQuantity(
      ctx,
      "c1F",
      "C₁",
      topology.c1F,
      "F",
      { aliases: ["C1", "C_1", "capacitanceF", "C"] },
    );
    const v1Text = guardedLabeledQuantity(
      ctx,
      "v1InitialV",
      "V₁",
      topology.v1InitialV,
      "V",
      { aliases: ["V1", "V_1"] },
    );
    const c2Text = guardedLabeledQuantity(
      ctx,
      "c2F",
      "C₂",
      topology.c2F,
      "F",
      { aliases: ["C2", "C_2", "capacitanceF", "C"] },
    );
    const v2Text = guardedLabeledQuantity(
      ctx,
      "v2InitialV",
      "V₂",
      topology.v2InitialV ?? 0,
      "V",
      { aliases: ["V2", "V_2"] },
    );
    parts.push(
      `<text x="${fmt(left + 28)}" y="${fmt(midY - 6)}" font-size="14" fill="#171b1f">${escapeXml(c1Text)}</text>`,
      `<text x="${fmt(left + 28)}" y="${fmt(midY + 16)}" font-size="13" fill="#486581">${escapeXml(v1Text)}</text>`,
      `<text x="${fmt(right - 28)}" y="${fmt(midY - 6)}" text-anchor="end" font-size="14" fill="#171b1f">${escapeXml(c2Text)}</text>`,
      `<text x="${fmt(right - 28)}" y="${fmt(midY + 16)}" text-anchor="end" font-size="13" fill="#486581">${escapeXml(v2Text)}</text>`,
    );
  }

  if (
    canRenderNumericQuantity(
      ctx,
      "equivalentCapacitanceF",
      solution.equivalentCapacitanceF,
      "F",
      { isDerived: true },
    )
  ) {
    parts.push(
      `<text x="${fmt(width / 2)}" y="${fmt(height - 14)}" text-anchor="middle" font-size="14" fill="#243b53">${escapeXml(guardedLabeledQuantity(ctx, "equivalentCapacitanceF", "Cₑq", solution.equivalentCapacitanceF, "F", { isDerived: true }))}</text>`,
    );
  }
  return parts.join("");
}

function renderRcCircuitPanel(
  box: Box,
  spec: RcTransientSpec,
  solution: RcTransientSolution,
  ctx: EmVisibilityContext,
): string {
  const left = box.left + 44;
  const right = box.right - 44;
  const top = box.top + 62;
  const bot = box.bottom - 62;
  const midX = (left + right) / 2;
  const midY = (top + bot) / 2;
  const parts: string[] = [];

  const v0MatchesCapQuery =
    Math.abs(solution.capacitorVoltageAtQueryV - spec.supplyVoltageV) <=
    1e-6 * spec.supplyVoltageV;
  const v0MatchesResQuery =
    Math.abs(solution.resistorVoltageAtQueryV - spec.supplyVoltageV) <=
    1e-6 * spec.supplyVoltageV;
  const v0Companions = [
    ...(v0MatchesCapQuery ? ["capacitorVoltageAtQueryV"] : []),
    ...(v0MatchesResQuery ? ["resistorVoltageAtQueryV"] : []),
  ];

  if (spec.mode === "charging") {
    // Left vertical branch: DC source V0; Top branch: switch + resistor R; Right branch: capacitor C
    const swX = left + (right - left) * 0.28;
    const resX = left + (right - left) * 0.68;
    parts.push(
      `<line x1="${fmt(left)}" y1="${fmt(top)}" x2="${fmt(left)}" y2="${fmt(midY - 5)}" stroke="#171b1f" stroke-width="2"/>`,
      drawDcCellV(left, midY),
      `<line x1="${fmt(left)}" y1="${fmt(midY + 5)}" x2="${fmt(left)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(left)}" y1="${fmt(top)}" x2="${fmt(swX - 18)}" y2="${fmt(top)}" stroke="#171b1f" stroke-width="2"/>`,
      `<circle cx="${fmt(swX - 18)}" cy="${fmt(top)}" r="3" fill="#171b1f"/>`,
      `<line x1="${fmt(swX - 18)}" y1="${fmt(top)}" x2="${fmt(swX + 16)}" y2="${fmt(top - 12)}" stroke="#171b1f" stroke-width="2"/>`,
      `<circle cx="${fmt(swX + 18)}" cy="${fmt(top)}" r="3" fill="#171b1f"/>`,
      `<text x="${fmt(swX)}" y="${fmt(top - 18)}" text-anchor="middle" font-size="13" fill="#171b1f">S</text>`,
      `<line x1="${fmt(swX + 18)}" y1="${fmt(top)}" x2="${fmt(resX - 29)}" y2="${fmt(top)}" stroke="#171b1f" stroke-width="2"/>`,
      drawResistorH(resX, top, 58, 20),
      `<line x1="${fmt(resX + 29)}" y1="${fmt(top)}" x2="${fmt(right)}" y2="${fmt(top)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(right)}" y1="${fmt(top)}" x2="${fmt(right)}" y2="${fmt(midY - 6)}" stroke="#171b1f" stroke-width="2"/>`,
      drawCapacitorSymbolV(right, midY),
      `<line x1="${fmt(right)}" y1="${fmt(midY + 6)}" x2="${fmt(right)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(left)}" y1="${fmt(bot)}" x2="${fmt(right)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
    );
    const v0Label = guardedLabeledQuantity(
      ctx,
      "supplyVoltageV",
      "V₀",
      spec.supplyVoltageV,
      "V",
      { hiddenCompanions: v0Companions },
    );
    const rLabel = guardedLabeledQuantity(
      ctx,
      "resistanceOhm",
      "R",
      spec.resistanceOhm,
      "Ω",
    );
    const cLabel = guardedLabeledQuantity(
      ctx,
      "capacitanceF",
      "C",
      spec.capacitanceF,
      "F",
    );
    parts.push(
      `<text x="${fmt(left + 22)}" y="${fmt(midY + 4)}" font-size="14" fill="#171b1f">${escapeXml(v0Label)}</text>`,
      `<text x="${fmt(resX)}" y="${fmt(top - 18)}" text-anchor="middle" font-size="14" fill="#171b1f">${escapeXml(rLabel)}</text>`,
      `<text x="${fmt(right - 22)}" y="${fmt(midY + 5)}" text-anchor="end" font-size="14" fill="#171b1f">${escapeXml(cLabel)}</text>`,
    );
  } else {
    // Discharging loop: Capacitor C on left (initial V0), switch S on top, Resistor R on right
    const switchLabel =
      ctx.zeroIsHidden || isExplicitlyHidden(ctx.controls, "queryTimeS")
        ? "S"
        : "S (closed at t = 0)";
    parts.push(
      `<line x1="${fmt(left)}" y1="${fmt(top)}" x2="${fmt(left)}" y2="${fmt(midY - 6)}" stroke="#171b1f" stroke-width="2"/>`,
      drawCapacitorSymbolV(left, midY),
      `<line x1="${fmt(left)}" y1="${fmt(midY + 6)}" x2="${fmt(left)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(left)}" y1="${fmt(top)}" x2="${fmt(midX - 20)}" y2="${fmt(top)}" stroke="#171b1f" stroke-width="2"/>`,
      `<circle cx="${fmt(midX - 20)}" cy="${fmt(top)}" r="3" fill="#171b1f"/>`,
      `<line x1="${fmt(midX - 20)}" y1="${fmt(top)}" x2="${fmt(midX + 20)}" y2="${fmt(top)}" stroke="#171b1f" stroke-width="2"/>`,
      `<circle cx="${fmt(midX + 20)}" cy="${fmt(top)}" r="3" fill="#171b1f"/>`,
      `<text x="${fmt(midX)}" y="${fmt(top - 12)}" text-anchor="middle" font-size="13" fill="#171b1f">${escapeXml(switchLabel)}</text>`,
      `<line x1="${fmt(midX + 20)}" y1="${fmt(top)}" x2="${fmt(right)}" y2="${fmt(top)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(right)}" y1="${fmt(top)}" x2="${fmt(right)}" y2="${fmt(midY - 29)}" stroke="#171b1f" stroke-width="2"/>`,
      drawResistorV(right, midY, 20, 58),
      `<line x1="${fmt(right)}" y1="${fmt(midY + 29)}" x2="${fmt(right)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(left)}" y1="${fmt(bot)}" x2="${fmt(right)}" y2="${fmt(bot)}" stroke="#171b1f" stroke-width="2"/>`,
    );
    const cLabel = guardedLabeledQuantity(
      ctx,
      "capacitanceF",
      "C",
      spec.capacitanceF,
      "F",
    );
    const v0Label = guardedLabeledQuantity(
      ctx,
      "supplyVoltageV",
      "V₀",
      spec.supplyVoltageV,
      "V",
      { hiddenCompanions: v0Companions },
    );
    const rLabel = guardedLabeledQuantity(
      ctx,
      "resistanceOhm",
      "R",
      spec.resistanceOhm,
      "Ω",
    );
    parts.push(
      `<text x="${fmt(left + 22)}" y="${fmt(midY - 4)}" font-size="14" fill="#171b1f">${escapeXml(cLabel)}</text>`,
      `<text x="${fmt(left + 22)}" y="${fmt(midY + 16)}" font-size="13" fill="#486581">${escapeXml(v0Label)}</text>`,
      `<text x="${fmt(right - 18)}" y="${fmt(midY + 5)}" text-anchor="end" font-size="14" fill="#171b1f">${escapeXml(rLabel)}</text>`,
    );
  }
  return parts.join("");
}

function renderRcGraphPanel(
  box: Box,
  spec: RcTransientSpec,
  solution: RcTransientSolution,
  ctx: EmVisibilityContext,
  arrowId: string,
): string {
  const plotted = spec.plottedQuantity ?? "capacitor-voltage";
  const plotLeft = box.left + 64;
  const plotRight = box.right - 26;
  const plotTop = box.top + 38;
  const plotBot = box.bottom - 52;
  const plotW = plotRight - plotLeft;
  const plotH = plotBot - plotTop;

  const curve =
    plotted === "capacitor-voltage"
      ? solution.curves.capacitorVoltage
      : plotted === "resistor-voltage"
        ? solution.curves.resistorVoltage
        : plotted === "current"
          ? solution.curves.current
          : solution.curves.charge;

  const yMax =
    plotted === "capacitor-voltage" || plotted === "resistor-voltage"
      ? spec.supplyVoltageV
      : plotted === "current"
        ? solution.initialCurrentA
        : solution.maxChargeC;

  const ySymbol =
    plotted === "capacitor-voltage"
      ? "V_C"
      : plotted === "resistor-voltage"
        ? "V_R"
        : plotted === "current"
          ? "I"
          : "Q";
  const yAsymptoteSymbol =
    plotted === "capacitor-voltage" || plotted === "resistor-voltage"
      ? "V₀"
      : plotted === "current"
        ? "I₀"
        : "Q₀";
  const yUnit =
    plotted === "capacitor-voltage" || plotted === "resistor-voltage"
      ? "V"
      : plotted === "current"
        ? "A"
        : "C";

  const xMax = curve[curve.length - 1].x;

  const xTicks = [1, 2, 3, 4, 5].map((i) => (xMax * i) / 5);
  const timeAxisHidden =
    !isQuantityVisible(ctx.controls, "timeConstantS", { isDerived: true }) ||
    isExplicitlyHidden(ctx.controls, "halfTimeS") ||
    isExplicitlyHidden(ctx.controls, "queryTimeS") ||
    isExplicitlyHidden(ctx.controls, "resistanceOhm") ||
    isExplicitlyHidden(ctx.controls, "capacitanceF") ||
    xTicks.some((tv) => matchesAnyHiddenAxisTick(ctx, tv, "s"));

  const yTicks = [yMax / 2, yMax];
  const yAxisHidden =
    plotted === "capacitor-voltage" || plotted === "resistor-voltage"
      ? !isQuantityVisible(ctx.controls, "supplyVoltageV") ||
        isExplicitlyHidden(ctx.controls, "capacitorVoltageAtQueryV") ||
        isExplicitlyHidden(ctx.controls, "resistorVoltageAtQueryV") ||
        yTicks.some((yv) => matchesAnyHiddenValue(ctx, yv, "V"))
      : plotted === "current"
        ? !isQuantityVisible(ctx.controls, "initialCurrentA", {
            isDerived: true,
          }) ||
          isExplicitlyHidden(ctx.controls, "currentAtQueryA") ||
          isExplicitlyHidden(ctx.controls, "supplyVoltageV") ||
          isExplicitlyHidden(ctx.controls, "resistanceOhm") ||
          yTicks.some((yv) => matchesAnyHiddenValue(ctx, yv, "A"))
        : !isQuantityVisible(ctx.controls, "maxChargeC", {
            isDerived: true,
          }) ||
          isExplicitlyHidden(ctx.controls, "chargeAtQueryC") ||
          isExplicitlyHidden(ctx.controls, "supplyVoltageV") ||
          isExplicitlyHidden(ctx.controls, "capacitanceF") ||
          yTicks.some((yv) => matchesAnyHiddenValue(ctx, yv, "C"));

  const parts: string[] = [];

  // Subtle 5x4 grid
  for (let i = 1; i <= 5; i += 1) {
    const gx = plotLeft + (plotW * i) / 5;
    parts.push(
      `<line x1="${fmt(gx)}" y1="${fmt(plotTop)}" x2="${fmt(gx)}" y2="${fmt(plotBot)}" stroke="#e4e7eb" stroke-width="1"/>`,
    );
  }
  for (let j = 1; j <= 4; j += 1) {
    const gy = plotBot - (plotH * j) / 4;
    parts.push(
      `<line x1="${fmt(plotLeft)}" y1="${fmt(gy)}" x2="${fmt(plotRight)}" y2="${fmt(gy)}" stroke="#e4e7eb" stroke-width="1"/>`,
    );
  }

  // Charging asymptote dashed line at y = yMax
  if (
    spec.mode === "charging" &&
    (plotted === "capacitor-voltage" || plotted === "charge")
  ) {
    parts.push(
      `<line x1="${fmt(plotLeft)}" y1="${fmt(plotTop)}" x2="${fmt(plotRight)}" y2="${fmt(plotTop)}" stroke="#52606d" stroke-width="1.3" stroke-dasharray="6 4"/>`,
    );
  }

  // Axes
  parts.push(
    `<line x1="${fmt(plotLeft)}" y1="${fmt(plotBot)}" x2="${fmt(plotRight + 8)}" y2="${fmt(plotBot)}" stroke="#171b1f" stroke-width="1.8" marker-end="url(#${arrowId})"/>`,
    `<line x1="${fmt(plotLeft)}" y1="${fmt(plotBot)}" x2="${fmt(plotLeft)}" y2="${fmt(plotTop - 10)}" stroke="#171b1f" stroke-width="1.8" marker-end="url(#${arrowId})"/>`,
    `<text x="${fmt((plotLeft + plotRight) / 2)}" y="${fmt(plotBot + 38)}" text-anchor="middle" font-size="14" fill="#171b1f">t / s</text>`,
    `<text x="${fmt(plotLeft - 44)}" y="${fmt((plotTop + plotBot) / 2)}" text-anchor="middle" font-size="14" fill="#171b1f" transform="rotate(-90 ${fmt(plotLeft - 44)} ${fmt((plotTop + plotBot) / 2)})">${escapeXml(`${ySymbol} / ${yUnit}`)}</text>`,
  );

  // X tick labels
  if (timeAxisHidden) {
    if (!ctx.zeroIsHidden) {
      parts.push(
        `<text x="${fmt(plotLeft)}" y="${fmt(plotBot + 18)}" text-anchor="middle" font-size="12" fill="#334e68">0</text>`,
      );
    }
  } else {
    for (let i = 0; i <= 5; i += 1) {
      if (i === 0 && ctx.zeroIsHidden) {
        continue;
      }
      const tx = plotLeft + (plotW * i) / 5;
      const tVal = (xMax * i) / 5;
      const label = i === 0 ? "0" : Number(tVal.toPrecision(2)).toString();
      parts.push(
        `<line x1="${fmt(tx)}" y1="${fmt(plotBot)}" x2="${fmt(tx)}" y2="${fmt(plotBot + 5)}" stroke="#171b1f" stroke-width="1.3"/>`,
        `<text x="${fmt(tx)}" y="${fmt(plotBot + 19)}" text-anchor="middle" font-size="12" fill="#334e68">${escapeXml(label)}</text>`,
      );
    }
  }

  // Y tick labels
  if (yAxisHidden) {
    if (!ctx.zeroIsHidden) {
      parts.push(
        `<text x="${fmt(plotLeft - 8)}" y="${fmt(plotBot + 4)}" text-anchor="end" font-size="12" fill="#334e68">0</text>`,
      );
    }
    parts.push(
      `<text x="${fmt(plotLeft - 8)}" y="${fmt(plotTop + 4)}" text-anchor="end" font-size="12" fill="#334e68">${escapeXml(yAsymptoteSymbol)}</text>`,
    );
  } else {
    for (let j = 0; j <= 2; j += 1) {
      if (j === 0 && ctx.zeroIsHidden) {
        continue;
      }
      const ty = plotBot - (plotH * j) / 2;
      const val = (yMax * j) / 2;
      const text = j === 0 ? "0" : formatSiQuantity(val, yUnit, 3);
      parts.push(
        `<line x1="${fmt(plotLeft - 5)}" y1="${fmt(ty)}" x2="${fmt(plotLeft)}" y2="${fmt(ty)}" stroke="#171b1f" stroke-width="1.3"/>`,
        `<text x="${fmt(plotLeft - 8)}" y="${fmt(ty + 4)}" text-anchor="end" font-size="11" fill="#334e68">${escapeXml(text)}</text>`,
      );
    }
  }

  // Exact analytical exponential path
  const d = curve
    .map((pt, idx) => {
      const px = plotLeft + (pt.x / xMax) * plotW;
      const py = plotBot - (pt.y / yMax) * plotH;
      return `${idx === 0 ? "M" : "L"}${fmt(px)} ${fmt(py)}`;
    })
    .join("");
  parts.push(
    `<path data-series="rc-curve" d="${d}" fill="none" stroke="#171b1f" stroke-width="2.3"/>`,
  );

  // Optional tau marker only when derived labels are enabled and tau is visible
  if (
    canRenderNumericQuantity(
      ctx,
      "timeConstantS",
      solution.timeConstantS,
      "s",
      {
        isDerived: true,
        hiddenCompanions: [
          "halfTimeS",
          "queryTimeS",
          "resistanceOhm",
          "capacitanceF",
        ],
      },
    ) &&
    solution.timeConstantS <= xMax
  ) {
    const tauX = plotLeft + (solution.timeConstantS / xMax) * plotW;
    const tauPtY =
      spec.mode === "charging" &&
      (plotted === "capacitor-voltage" || plotted === "charge")
        ? plotBot - (1 - Math.exp(-1)) * plotH
        : plotBot - Math.exp(-1) * plotH;
    parts.push(
      `<line x1="${fmt(tauX)}" y1="${fmt(tauPtY)}" x2="${fmt(tauX)}" y2="${fmt(plotBot)}" stroke="#627d98" stroke-width="1.2" stroke-dasharray="4 4"/>`,
      `<circle cx="${fmt(tauX)}" cy="${fmt(tauPtY)}" r="3.5" fill="#171b1f"/>`,
      `<text x="${fmt(tauX + 6)}" y="${fmt(tauPtY - 6)}" font-size="12" fill="#243b53">${escapeXml(guardedLabeledQuantity(ctx, "timeConstantS", "τ", solution.timeConstantS, "s", { isDerived: true }))}</text>`,
    );
  }

  return parts.join("");
}

function renderRcTransientSvg(
  spec: RcTransientSpec,
  solution: RcTransientSolution,
  ctx: EmVisibilityContext,
  width: number,
  height: number,
  arrowId: string,
): string {
  const layout = spec.layout ?? "circuit-and-graph";
  if (layout === "circuit-only") {
    return renderRcCircuitPanel(
      { left: 24, top: 20, right: width - 24, bottom: height - 20 },
      spec,
      solution,
      ctx,
    );
  }
  if (layout === "graph-only") {
    return renderRcGraphPanel(
      { left: 24, top: 20, right: width - 24, bottom: height - 20 },
      spec,
      solution,
      ctx,
      arrowId,
    );
  }
  const split = Math.round(width * 0.45);
  return [
    `<rect x="14" y="18" width="${fmt(split - 22)}" height="${fmt(height - 36)}" rx="8" fill="none" stroke="#cbd2d9"/>`,
    `<rect x="${fmt(split + 8)}" y="18" width="${fmt(width - split - 22)}" height="${fmt(height - 36)}" rx="8" fill="none" stroke="#cbd2d9"/>`,
    renderRcCircuitPanel(
      { left: 14, top: 18, right: split - 8, bottom: height - 18 },
      spec,
      solution,
      ctx,
    ),
    renderRcGraphPanel(
      { left: split + 8, top: 18, right: width - 14, bottom: height - 18 },
      spec,
      solution,
      ctx,
      arrowId,
    ),
  ].join("");
}

function renderFluxFaradaySvg(
  spec: FluxFaradaySpec,
  solution: FluxFaradaySolution,
  ctx: EmVisibilityContext,
  width: number,
  height: number,
  arrowId: string,
): string {
  const cx = width * 0.5;
  const cy = height * 0.52;
  const parts: string[] = [];

  // Uniform horizontal magnetic field lines pointing right (+x)
  const fieldRows = 5;
  const topY = 86;
  const botY = height - 86;
  for (let i = 0; i < fieldRows; i += 1) {
    const fy = topY + (i * (botY - topY)) / (fieldRows - 1);
    parts.push(
      `<line x1="90" y1="${fmt(fy)}" x2="${fmt(width - 90)}" y2="${fmt(fy)}" stroke="#486581" stroke-width="1.6" marker-end="url(#${arrowId})"/>`,
    );
  }

  // Coil normal tilted by initialNormalAngleDegrees from horizontal +x
  const thetaRad = (solution.initialNormalAngleDegrees * Math.PI) / 180;
  // Coil plane is perpendicular to the normal
  const normalLen = 96;
  const nx = cx + normalLen * Math.cos(thetaRad);
  const ny = cy - normalLen * Math.sin(thetaRad);
  const coilHalfLen = 84;
  const px1 = cx - coilHalfLen * Math.sin(thetaRad);
  const py1 = cy - coilHalfLen * Math.cos(thetaRad);
  const px2 = cx + coilHalfLen * Math.sin(thetaRad);
  const py2 = cy + coilHalfLen * Math.cos(thetaRad);

  parts.push(
    `<line x1="${fmt(px1)}" y1="${fmt(py1)}" x2="${fmt(px2)}" y2="${fmt(py2)}" stroke="#171b1f" stroke-width="5" stroke-linecap="round"/>`,
    `<line x1="${fmt(cx)}" y1="${fmt(cy)}" x2="${fmt(nx)}" y2="${fmt(ny)}" stroke="#171b1f" stroke-width="1.8" stroke-dasharray="5 4" marker-end="url(#${arrowId})"/>`,
    `<text x="${fmt(nx + 10)}" y="${fmt(ny - 4)}" font-size="14" font-style="italic" fill="#171b1f">n̂</text>`,
  );

  // Angle arc if non-zero
  const displayAngle = spec.initialAngleDegrees ?? 0;
  const finalAngle = spec.finalAngleDegrees ?? displayAngle;
  const sameAngleMag =
    Math.abs(Math.abs(displayAngle) - Math.abs(finalAngle)) <= 1e-9;
  if (displayAngle > 1 && displayAngle < 179) {
    const rArc = 42;
    const endRad = thetaRad;
    const ax = cx + rArc;
    const ay = cy;
    const bx = cx + rArc * Math.cos(endRad);
    const by = cy - rArc * Math.sin(endRad);
    parts.push(
      `<path d="M${fmt(ax)} ${fmt(ay)} A${rArc} ${rArc} 0 0 0 ${fmt(bx)} ${fmt(by)}" fill="none" stroke="#171b1f" stroke-width="1.4"/>`,
    );
    const angleText = guardedLabeledQuantity(
      ctx,
      "initialAngleDegrees",
      "θ",
      displayAngle,
      "°",
      { hiddenCompanions: sameAngleMag ? ["finalAngleDegrees"] : [] },
    );
    parts.push(
      `<text x="${fmt(cx + rArc + 24)}" y="${fmt(cy - 12)}" font-size="13" fill="#171b1f">${escapeXml(angleText)}</text>`,
    );
  }

  // Labels at top/bottom
  const sameFieldMag =
    Math.abs(Math.abs(spec.initialFieldT) - Math.abs(spec.finalFieldT)) <=
    1e-9 * Math.max(1, Math.abs(spec.initialFieldT));
  const nText = guardedLabeledQuantity(ctx, "turns", "N", spec.turns, "");
  const aText = guardedLabeledQuantity(
    ctx,
    "coilAreaM2",
    "A",
    spec.coilAreaM2,
    "m²",
  );
  const b1Text = guardedLabeledQuantity(
    ctx,
    "initialFieldT",
    "B₁",
    spec.initialFieldT,
    "T",
    {
      aliases: ["B", "magneticFieldT"],
      hiddenCompanions: sameFieldMag ? ["finalFieldT"] : [],
    },
  );
  const b2Text = guardedLabeledQuantity(
    ctx,
    "finalFieldT",
    "B₂",
    spec.finalFieldT,
    "T",
    {
      aliases: ["B", "magneticFieldT"],
      hiddenCompanions: sameFieldMag ? ["initialFieldT"] : [],
    },
  );
  const dtText = guardedLabeledQuantity(
    ctx,
    "timeIntervalS",
    "Δt",
    spec.timeIntervalS,
    "s",
  );

  parts.push(
    `<text x="90" y="52" font-size="14" fill="#171b1f">${escapeXml(`${nText},  ${aText}`)}</text>`,
    `<text x="${fmt(width - 90)}" y="52" text-anchor="end" font-size="14" fill="#171b1f">${escapeXml(`${b1Text} → ${b2Text} in ${dtText}`)}</text>`,
  );

  if (
    canRenderNumericQuantity(
      ctx,
      "averageEmfMagnitudeV",
      solution.averageEmfMagnitudeV,
      "V",
      { isDerived: true, aliases: ["signedAverageEmfV", "emf"] },
    )
  ) {
    const emfText = guardedLabeledQuantity(
      ctx,
      "averageEmfMagnitudeV",
      "|ε|",
      solution.averageEmfMagnitudeV,
      "V",
      { isDerived: true, aliases: ["signedAverageEmfV", "emf"] },
    );
    parts.push(
      `<text x="${fmt(width / 2)}" y="${fmt(height - 28)}" text-anchor="middle" font-size="14" fill="#243b53">${escapeXml(emfText)}</text>`,
    );
  }
  return parts.join("");
}

function renderMotionalEmfRailsSvg(
  spec: MotionalEmfRailsSpec,
  solution: MotionalEmfRailsSolution,
  ctx: EmVisibilityContext,
  width: number,
  height: number,
  arrowId: string,
): string {
  const fieldBox: Box = {
    left: 84,
    top: 56,
    right: width - 64,
    bottom: height - 56,
  };
  const railTop = 114;
  const railBot = height - 114;
  const railLeft = 136;
  const railRight = width - 96;
  const rodX = railLeft + (railRight - railLeft) * 0.62;
  const midY = (railTop + railBot) / 2;

  const parts: string[] = [
    renderUniformBFieldGrid(fieldBox, spec.fieldDirection, 5, 8),
  ];

  // Rails + left load resistor + sliding rod
  parts.push(
    `<line x1="${fmt(railLeft)}" y1="${fmt(railTop)}" x2="${fmt(railRight)}" y2="${fmt(railTop)}" stroke="#171b1f" stroke-width="2.4"/>`,
    `<line x1="${fmt(railLeft)}" y1="${fmt(railBot)}" x2="${fmt(railRight)}" y2="${fmt(railBot)}" stroke="#171b1f" stroke-width="2.4"/>`,
    `<line x1="${fmt(railLeft)}" y1="${fmt(railTop)}" x2="${fmt(railLeft)}" y2="${fmt(midY - 29)}" stroke="#171b1f" stroke-width="2.2"/>`,
    drawResistorV(railLeft, midY, 22, 58),
    `<line x1="${fmt(railLeft)}" y1="${fmt(midY + 29)}" x2="${fmt(railLeft)}" y2="${fmt(railBot)}" stroke="#171b1f" stroke-width="2.2"/>`,
    `<rect x="${fmt(rodX - 5)}" y="${fmt(railTop - 14)}" width="10" height="${fmt(railBot - railTop + 28)}" rx="3" fill="#bcccdc" stroke="#171b1f" stroke-width="2.2"/>`,
  );

  // Velocity vector v on rod
  const vDir = (spec.rodDirection ?? "right") === "right" ? 1 : -1;
  const vEndX = rodX + vDir * 72;
  parts.push(
    `<line x1="${fmt(rodX + vDir * 8)}" y1="${fmt(midY)}" x2="${fmt(vEndX)}" y2="${fmt(midY)}" stroke="#171b1f" stroke-width="2.4" marker-end="url(#${arrowId})"/>`,
    `<text x="${fmt((rodX + vEndX) / 2)}" y="${fmt(midY - 12)}" text-anchor="middle" font-size="14" fill="#171b1f">${escapeXml(guardedLabeledQuantity(ctx, "rodSpeedMs", "v", spec.rodSpeedMs, "m s⁻¹"))}</text>`,
  );

  // Optional braking force arrow if derived labels visible
  if (
    canRenderNumericQuantity(
      ctx,
      "magneticBrakingForceN",
      solution.magneticBrakingForceN,
      "N",
      { isDerived: true },
    )
  ) {
    const fDir = solution.magneticForceDirection === "right" ? 1 : -1;
    const fEndX = rodX + fDir * 64;
    parts.push(
      `<line x1="${fmt(rodX + fDir * 8)}" y1="${fmt(midY + 34)}" x2="${fmt(fEndX)}" y2="${fmt(midY + 34)}" stroke="#334e68" stroke-width="2" marker-end="url(#${arrowId})"/>`,
      `<text x="${fmt((rodX + fEndX) / 2)}" y="${fmt(midY + 54)}" text-anchor="middle" font-size="13" fill="#243b53">${escapeXml(guardedLabeledQuantity(ctx, "magneticBrakingForceN", "F_B", solution.magneticBrakingForceN, "N", { isDerived: true }))}</text>`,
    );
  }

  // Rail separation dimension L
  const dimX = railRight - 18;
  parts.push(
    `<line x1="${fmt(dimX)}" y1="${fmt(railTop + 4)}" x2="${fmt(dimX)}" y2="${fmt(railBot - 4)}" stroke="#52606d" stroke-width="1.4" marker-end="url(#${arrowId})"/>`,
    `<text x="${fmt(dimX - 10)}" y="${fmt(midY + 5)}" text-anchor="end" font-size="14" fill="#171b1f">${escapeXml(guardedLabeledQuantity(ctx, "railSeparationM", "L", spec.railSeparationM, "m"))}</text>`,
  );

  // Resistor and B-field labels
  const zeroRodRes = Math.abs(spec.rodResistanceOhm ?? 0) <= 1e-12;
  const rText = guardedLabeledQuantity(
    ctx,
    "loadResistanceOhm",
    "R",
    spec.loadResistanceOhm,
    "Ω",
    {
      hiddenCompanions: zeroRodRes
        ? ["totalResistanceOhm"]
        : [],
    },
  );
  const bBadge = fieldDirectionBadgeText(
    ctx,
    "magneticFieldT",
    "B",
    spec.magneticFieldT,
    spec.fieldDirection,
  );
  parts.push(
    `<text x="${fmt(railLeft - 18)}" y="${fmt(midY + 5)}" text-anchor="end" font-size="14" fill="#171b1f">${escapeXml(rText)}</text>`,
    `<text x="${fmt(fieldBox.left + 12)}" y="${fmt(fieldBox.top - 12)}" font-size="14" fill="#171b1f">${escapeXml(bBadge)}</text>`,
  );

  return parts.join("");
}

function renderAcGeneratorSvg(
  spec: AcGeneratorSpec,
  solution: AcGeneratorSolution,
  ctx: EmVisibilityContext,
  width: number,
  height: number,
  arrowId: string,
): string {
  const split = Math.round(width * 0.42);
  const parts: string[] = [
    `<rect x="14" y="18" width="${fmt(split - 22)}" height="${fmt(height - 36)}" rx="8" fill="none" stroke="#cbd2d9"/>`,
    `<rect x="${fmt(split + 8)}" y="18" width="${fmt(width - split - 22)}" height="${fmt(height - 36)}" rx="8" fill="none" stroke="#cbd2d9"/>`,
  ];

  // Left panel: N/S poles + rotating rectangular coil + slip rings + load
  const cx = (14 + split - 8) / 2;
  const cy = height * 0.43;
  parts.push(
    `<rect x="34" y="${fmt(cy - 54)}" width="46" height="108" rx="4" fill="#d9e2ec" stroke="#171b1f" stroke-width="2"/>`,
    `<text x="57" y="${fmt(cy + 7)}" text-anchor="middle" font-size="20" font-weight="700" fill="#171b1f">N</text>`,
    `<rect x="${fmt(split - 88)}" y="${fmt(cy - 54)}" width="46" height="108" rx="4" fill="#d9e2ec" stroke="#171b1f" stroke-width="2"/>`,
    `<text x="${fmt(split - 65)}" y="${fmt(cy + 7)}" text-anchor="middle" font-size="20" font-weight="700" fill="#171b1f">S</text>`,
    `<polygon points="${fmt(cx - 46)},${fmt(cy - 32)} ${fmt(cx + 46)},${fmt(cy - 48)} ${fmt(cx + 46)},${fmt(cy + 32)} ${fmt(cx - 46)},${fmt(cy + 48)}" fill="none" stroke="#171b1f" stroke-width="2.6"/>`,
    `<line x1="${fmt(cx)}" y1="${fmt(cy - 68)}" x2="${fmt(cx)}" y2="${fmt(cy + 106)}" stroke="#52606d" stroke-width="1.4" stroke-dasharray="5 4"/>`,
    `<path d="M${fmt(cx - 22)} ${fmt(cy - 62)} A24 10 0 1 1 ${fmt(cx + 22)} ${fmt(cy - 62)}" fill="none" stroke="#171b1f" stroke-width="1.6" marker-end="url(#${arrowId})"/>`,
    `<ellipse cx="${fmt(cx)}" cy="${fmt(cy + 82)}" rx="16" ry="6" fill="none" stroke="#171b1f" stroke-width="2"/>`,
    `<ellipse cx="${fmt(cx)}" cy="${fmt(cy + 98)}" rx="16" ry="6" fill="none" stroke="#171b1f" stroke-width="2"/>`,
  );

  const omegaOrF =
    spec.frequencyHz !== undefined
      ? guardedLabeledQuantity(
          ctx,
          "frequencyHz",
          "f",
          solution.frequencyHz,
          "Hz",
        )
      : guardedLabeledQuantity(
          ctx,
          "angularSpeedRadS",
          "ω",
          solution.angularSpeedRadS,
          "rad s⁻¹",
        );
  const bText = guardedLabeledQuantity(
    ctx,
    "magneticFieldT",
    "B",
    spec.magneticFieldT,
    "T",
  );
  const nText = guardedLabeledQuantity(ctx, "turns", "N", spec.turns, "");
  const aText = guardedLabeledQuantity(
    ctx,
    "coilAreaM2",
    "A",
    spec.coilAreaM2,
    "m²",
  );
  parts.push(
    `<text x="${fmt(cx)}" y="46" text-anchor="middle" font-size="13" fill="#171b1f">${escapeXml(`${nText},  ${aText}`)}</text>`,
    `<text x="${fmt(cx)}" y="${fmt(height - 54)}" text-anchor="middle" font-size="13" fill="#171b1f">${escapeXml(`${bText},  ${omegaOrF}`)}</text>`,
  );
  if (spec.loadResistanceOhm !== undefined) {
    const rText = guardedLabeledQuantity(
      ctx,
      "loadResistanceOhm",
      "R",
      spec.loadResistanceOhm,
      "Ω",
    );
    parts.push(
      `<text x="${fmt(cx)}" y="${fmt(height - 32)}" text-anchor="middle" font-size="13" fill="#486581">${escapeXml(rText)}</text>`,
    );
  }

  // Right panel: Sinusoidal EMF waveform
  const gLeft = split + 72;
  const gRight = width - 34;
  const gTop = 58;
  const gBot = height - 58;
  const gMidY = (gTop + gBot) / 2;
  const gW = gRight - gLeft;
  const gHalfH = (gBot - gTop) / 2;
  const xMax = solution.curves.emf[solution.curves.emf.length - 1].x;

  const halfPeriodSteps = Math.max(1, Math.round((spec.cyclesShown ?? 2) * 2));
  const xTicks = Array.from(
    { length: halfPeriodSteps },
    (_, idx) => (xMax * (idx + 1)) / halfPeriodSteps,
  );
  const timeHidden =
    !isQuantityVisible(ctx.controls, "periodS", { isDerived: true }) ||
    isExplicitlyHidden(ctx.controls, "frequencyHz") ||
    isExplicitlyHidden(ctx.controls, "angularSpeedRadS") ||
    isExplicitlyHidden(ctx.controls, "queryTimeS") ||
    xTicks.some((tv) => matchesAnyHiddenAxisTick(ctx, tv, "s"));

  const emfHidden = !canRenderNumericQuantity(
    ctx,
    "peakEmfV",
    solution.peakEmfV,
    "V",
    {
      isDerived: true,
      hiddenCompanions: ["peakToPeakEmfV", "rmsVoltageV", "emfAtQueryV"],
    },
  );

  // Grid + RMS dashed lines
  const rmsOffset = gHalfH / Math.SQRT2;
  parts.push(
    `<line x1="${fmt(gLeft)}" y1="${fmt(gTop)}" x2="${fmt(gRight)}" y2="${fmt(gTop)}" stroke="#e4e7eb" stroke-width="1"/>`,
    `<line x1="${fmt(gLeft)}" y1="${fmt(gBot)}" x2="${fmt(gRight)}" y2="${fmt(gBot)}" stroke="#e4e7eb" stroke-width="1"/>`,
    `<line x1="${fmt(gLeft)}" y1="${fmt(gMidY - rmsOffset)}" x2="${fmt(gRight)}" y2="${fmt(gMidY - rmsOffset)}" stroke="#829ab1" stroke-width="1.2" stroke-dasharray="5 4"/>`,
    `<line x1="${fmt(gLeft)}" y1="${fmt(gMidY + rmsOffset)}" x2="${fmt(gRight)}" y2="${fmt(gMidY + rmsOffset)}" stroke="#829ab1" stroke-width="1.2" stroke-dasharray="5 4"/>`,
    `<line x1="${fmt(gLeft)}" y1="${fmt(gMidY)}" x2="${fmt(gRight + 10)}" y2="${fmt(gMidY)}" stroke="#171b1f" stroke-width="1.8" marker-end="url(#${arrowId})"/>`,
    `<line x1="${fmt(gLeft)}" y1="${fmt(gBot + 6)}" x2="${fmt(gLeft)}" y2="${fmt(gTop - 12)}" stroke="#171b1f" stroke-width="1.8" marker-end="url(#${arrowId})"/>`,
    `<text x="${fmt(gRight)}" y="${fmt(gMidY + 24)}" text-anchor="end" font-size="13" fill="#171b1f">t / s</text>`,
    `<text x="${fmt(gLeft - 46)}" y="${fmt(gMidY)}" text-anchor="middle" font-size="14" fill="#171b1f" transform="rotate(-90 ${fmt(gLeft - 46)} ${fmt(gMidY)})">ε / V</text>`,
  );

  if (emfHidden) {
    parts.push(
      `<text x="${fmt(gLeft - 8)}" y="${fmt(gTop + 5)}" text-anchor="end" font-size="12" fill="#334e68">+ε₀</text>`,
      ...(ctx.zeroIsHidden
        ? []
        : [
            `<text x="${fmt(gLeft - 8)}" y="${fmt(gMidY + 4)}" text-anchor="end" font-size="12" fill="#334e68">0</text>`,
          ]),
      `<text x="${fmt(gLeft - 8)}" y="${fmt(gBot + 5)}" text-anchor="end" font-size="12" fill="#334e68">−ε₀</text>`,
    );
  } else {
    parts.push(
      `<text x="${fmt(gLeft - 8)}" y="${fmt(gTop + 5)}" text-anchor="end" font-size="11" fill="#334e68">+${escapeXml(formatSiQuantity(solution.peakEmfV, "V"))}</text>`,
      ...(ctx.zeroIsHidden
        ? []
        : [
            `<text x="${fmt(gLeft - 8)}" y="${fmt(gMidY + 4)}" text-anchor="end" font-size="11" fill="#334e68">0</text>`,
          ]),
      `<text x="${fmt(gLeft - 8)}" y="${fmt(gBot + 5)}" text-anchor="end" font-size="11" fill="#334e68">−${escapeXml(formatSiQuantity(solution.peakEmfV, "V"))}</text>`,
    );
    if (
      canRenderNumericQuantity(ctx, "rmsVoltageV", solution.rmsVoltageV, "V", {
        isDerived: true,
      })
    ) {
      parts.push(
        `<text x="${fmt(gRight - 4)}" y="${fmt(gMidY - rmsOffset - 5)}" text-anchor="end" font-size="11" fill="#334e68">${escapeXml(guardedLabeledQuantity(ctx, "rmsVoltageV", "Vᵣₘₛ", solution.rmsVoltageV, "V", { isDerived: true }))}</text>`,
      );
    }
  }

  for (let k = 1; k <= halfPeriodSteps; k += 1) {
    const tx = gLeft + (gW * k) / halfPeriodSteps;
    const tVal = (xMax * k) / halfPeriodSteps;
    parts.push(
      `<line x1="${fmt(tx)}" y1="${fmt(gMidY - 4)}" x2="${fmt(tx)}" y2="${fmt(gMidY + 4)}" stroke="#171b1f" stroke-width="1.2"/>`,
    );
    if (timeHidden) {
      let symLabel: string | null = null;
      if (k % 2 === 0) {
        const mult = k / 2;
        if (mult === 1) {
          symLabel = "T";
        } else if (!ctx.hiddenNumberTokens.has(String(mult))) {
          symLabel = `${mult}T`;
        }
      } else if (k === 1) {
        symLabel = "½T";
      } else if (k === 3) {
        symLabel = "³⁄₂T";
      } else if (
        !ctx.hiddenNumberTokens.has(String(k)) &&
        !ctx.hiddenNumberTokens.has("2")
      ) {
        symLabel = `${k}T/2`;
      }
      if (symLabel !== null) {
        parts.push(
          `<text x="${fmt(tx)}" y="${fmt(gBot + 24)}" text-anchor="middle" font-size="11" fill="#334e68">${escapeXml(symLabel)}</text>`,
        );
      }
    } else {
      const label = Number(tVal.toPrecision(2)).toString();
      parts.push(
        `<text x="${fmt(tx)}" y="${fmt(gBot + 24)}" text-anchor="middle" font-size="11" fill="#334e68">${escapeXml(label)}</text>`,
      );
    }
  }

  // Optional normalized flux-linkage quadrature curve
  if (spec.showFluxCurve) {
    const fluxPath = solution.curves.fluxLinkage
      .map((pt, idx) => {
        const px = gLeft + (pt.x / xMax) * gW;
        const py =
          gMidY - (pt.y / solution.peakFluxLinkageWbTurns) * (gHalfH * 0.78);
        return `${idx === 0 ? "M" : "L"}${fmt(px)} ${fmt(py)}`;
      })
      .join("");
    parts.push(
      `<path data-series="ac-flux" d="${fluxPath}" fill="none" stroke="#627d98" stroke-width="1.6" stroke-dasharray="6 4"/>`,
    );
  }

  const emfPath = solution.curves.emf
    .map((pt, idx) => {
      const px = gLeft + (pt.x / xMax) * gW;
      const py = gMidY - (pt.y / solution.peakEmfV) * gHalfH;
      return `${idx === 0 ? "M" : "L"}${fmt(px)} ${fmt(py)}`;
    })
    .join("");
  parts.push(
    `<path data-series="ac-emf" d="${emfPath}" fill="none" stroke="#171b1f" stroke-width="2.3"/>`,
  );

  return parts.join("");
}

function drawCoilLoopsOnVerticalCore(
  coreLeft: number,
  coreRight: number,
  topY: number,
  botY: number,
  loopCount: number,
): string {
  const loops: string[] = [];
  const step = (botY - topY) / loopCount;
  for (let i = 0; i < loopCount; i += 1) {
    const y1 = topY + i * step;
    const y2 = y1 + step * 0.78;
    loops.push(
      `<path d="M${fmt(coreLeft - 5)} ${fmt(y1)} H${fmt(coreRight + 5)} C${fmt(coreRight + 13)} ${fmt(y1)} ${fmt(coreRight + 13)} ${fmt(y2)} ${fmt(coreRight + 5)} ${fmt(y2)} H${fmt(coreLeft - 5)}" fill="none" stroke="#171b1f" stroke-width="2.1"/>`,
    );
  }
  return loops.join("");
}

function renderTransformerSvg(
  spec: TransformerSpec,
  solution: TransformerSolution,
  ctx: EmVisibilityContext,
  width: number,
  height: number,
): string {
  const cx = width / 2;
  const cy = height / 2;
  const coreOuterW = 240;
  const coreOuterH = 220;
  const legW = 42;
  const coreLeft = cx - coreOuterW / 2;
  const coreRight = cx + coreOuterW / 2;
  const coreTop = cy - coreOuterH / 2;
  const coreBot = cy + coreOuterH / 2;

  const primaryLoops =
    spec.primaryTurns > spec.secondaryTurns
      ? 7
      : spec.primaryTurns < spec.secondaryTurns
        ? 4
        : 5;
  const secondaryLoops =
    spec.secondaryTurns > spec.primaryTurns
      ? 7
      : spec.secondaryTurns < spec.primaryTurns
        ? 4
        : 5;

  const acX = coreLeft - 108;
  const loadX = coreRight + 108;

  const parts: string[] = [
    // Laminated soft-iron core + mutual flux dashed loop
    `<rect x="${fmt(coreLeft)}" y="${fmt(coreTop)}" width="${fmt(coreOuterW)}" height="${fmt(coreOuterH)}" rx="6" fill="#e4e7eb" stroke="#171b1f" stroke-width="2.2"/>`,
    `<rect x="${fmt(coreLeft + legW)}" y="${fmt(coreTop + legW)}" width="${fmt(coreOuterW - 2 * legW)}" height="${fmt(coreOuterH - 2 * legW)}" rx="3" fill="white" stroke="#171b1f" stroke-width="2"/>`,
    `<rect x="${fmt(coreLeft + legW / 2)}" y="${fmt(coreTop + legW / 2)}" width="${fmt(coreOuterW - legW)}" height="${fmt(coreOuterH - legW)}" rx="4" fill="none" stroke="#52606d" stroke-width="1.3" stroke-dasharray="6 5"/>`,
    // Primary leads + AC source
    `<path d="M${fmt(coreLeft - 5)} ${fmt(coreTop + 52)} H${fmt(acX)} V${fmt(cy - 22)}" fill="none" stroke="#171b1f" stroke-width="2"/>`,
    `<path d="M${fmt(coreLeft - 5)} ${fmt(coreBot - 52)} H${fmt(acX)} V${fmt(cy + 22)}" fill="none" stroke="#171b1f" stroke-width="2"/>`,
    `<circle cx="${fmt(acX)}" cy="${fmt(cy)}" r="22" fill="white" stroke="#171b1f" stroke-width="2"/>`,
    `<path d="M${fmt(acX - 11)} ${fmt(cy)} Q${fmt(acX - 5.5)} ${fmt(cy - 9)} ${fmt(acX)} ${fmt(cy)} T${fmt(acX + 11)} ${fmt(cy)}" fill="none" stroke="#171b1f" stroke-width="2"/>`,
    drawCoilLoopsOnVerticalCore(
      coreLeft,
      coreLeft + legW,
      coreTop + 52,
      coreBot - 52,
      primaryLoops,
    ),
    drawCoilLoopsOnVerticalCore(
      coreRight - legW,
      coreRight,
      coreTop + 52,
      coreBot - 52,
      secondaryLoops,
    ),
  ];

  // Secondary leads + load resistor (or open terminals)
  if (solution.loadResistanceOhm !== undefined) {
    const loadIsDerived = spec.loadResistanceOhm === undefined;
    parts.push(
      `<path d="M${fmt(coreRight + 5)} ${fmt(coreTop + 52)} H${fmt(loadX)} V${fmt(cy - 29)}" fill="none" stroke="#171b1f" stroke-width="2"/>`,
      drawResistorV(loadX, cy, 22, 58),
      `<path d="M${fmt(coreRight + 5)} ${fmt(coreBot - 52)} H${fmt(loadX)} V${fmt(cy + 29)}" fill="none" stroke="#171b1f" stroke-width="2"/>`,
    );
    const rText = guardedLabeledQuantity(
      ctx,
      "loadResistanceOhm",
      "R_L",
      solution.loadResistanceOhm,
      "Ω",
      {
        isDerived: loadIsDerived,
        hiddenCompanions: loadIsDerived
          ? ["secondaryVoltageRmsV", "secondaryCurrentRmsA", "outputPowerW"]
          : [],
      },
    );
    parts.push(
      `<text x="${fmt(loadX + 20)}" y="${fmt(cy + 5)}" font-size="14" fill="#171b1f">${escapeXml(rText)}</text>`,
    );
  } else {
    parts.push(
      `<line x1="${fmt(coreRight + 5)}" y1="${fmt(coreTop + 52)}" x2="${fmt(loadX - 24)}" y2="${fmt(coreTop + 52)}" stroke="#171b1f" stroke-width="2"/>`,
      `<line x1="${fmt(coreRight + 5)}" y1="${fmt(coreBot - 52)}" x2="${fmt(loadX - 24)}" y2="${fmt(coreBot - 52)}" stroke="#171b1f" stroke-width="2"/>`,
      `<circle cx="${fmt(loadX - 24)}" cy="${fmt(coreTop + 52)}" r="3.5" fill="white" stroke="#171b1f" stroke-width="2"/>`,
      `<circle cx="${fmt(loadX - 24)}" cy="${fmt(coreBot - 52)}" r="3.5" fill="white" stroke="#171b1f" stroke-width="2"/>`,
    );
  }

  // Labels
  const isIsolation = spec.primaryTurns === spec.secondaryTurns;
  const vpText = guardedLabeledQuantity(
    ctx,
    "primaryVoltageRmsV",
    "Vₚ",
    spec.primaryVoltageRmsV,
    "V",
    {
      hiddenCompanions: isIsolation
        ? ["secondaryVoltageRmsV", "secondaryVoltagePeakV"]
        : [],
    },
  );
  const npText = guardedLabeledQuantity(
    ctx,
    "primaryTurns",
    "Nₚ",
    spec.primaryTurns,
    "",
    { hiddenCompanions: isIsolation ? ["secondaryTurns"] : [] },
  );
  const nsText = guardedLabeledQuantity(
    ctx,
    "secondaryTurns",
    "Nₛ",
    spec.secondaryTurns,
    "",
    { hiddenCompanions: isIsolation ? ["primaryTurns"] : [] },
  );
  const vsText = guardedLabeledQuantity(
    ctx,
    "secondaryVoltageRmsV",
    "Vₛ",
    solution.secondaryVoltageRmsV,
    "V",
    {
      isDerived: true,
      hiddenCompanions: isIsolation
        ? ["primaryVoltageRmsV", "primaryVoltagePeakV"]
        : [],
    },
  );

  parts.push(
    `<text x="${fmt(acX)}" y="${fmt(cy + 46)}" text-anchor="middle" font-size="14" fill="#171b1f">${escapeXml(vpText)}</text>`,
    `<text x="${fmt(coreLeft + legW / 2)}" y="${fmt(coreTop - 14)}" text-anchor="middle" font-size="14" fill="#171b1f">${escapeXml(npText)}</text>`,
    `<text x="${fmt(coreRight - legW / 2)}" y="${fmt(coreTop - 14)}" text-anchor="middle" font-size="14" fill="#171b1f">${escapeXml(nsText)}</text>`,
    `<text x="${fmt(coreRight + 48)}" y="${fmt(coreTop + 36)}" text-anchor="middle" font-size="14" fill="#243b53">${escapeXml(vsText)}</text>`,
  );

  if ((spec.efficiency ?? 1) < 1) {
    const canShowEta =
      canRenderNumericQuantity(ctx, "efficiency", solution.efficiency, "") &&
      !matchesAnyHiddenValue(ctx, solution.efficiency * 100, "");
    const etaText = canShowEta
      ? `η = ${Number((solution.efficiency * 100).toPrecision(3))}%`
      : "non-ideal core";
    parts.push(
      `<text x="${fmt(cx)}" y="${fmt(coreBot + 28)}" text-anchor="middle" font-size="14" fill="#486581">${escapeXml(etaText)}</text>`,
    );
  } else {
    parts.push(
      `<text x="${fmt(cx)}" y="${fmt(coreBot + 28)}" text-anchor="middle" font-size="13" fill="#52606d">Laminated soft-iron core</text>`,
    );
  }
  return parts.join("");
}

function renderElectricDeflectionSvg(
  spec: ElectricDeflectionSpec,
  solution: ElectricDeflectionSolution,
  ctx: EmVisibilityContext,
  width: number,
  height: number,
  arrowId: string,
): string {
  const polarity = spec.topPlatePolarity ?? "positive";
  const plateLeft = 148;
  const hasDrift = (spec.driftDistanceAfterPlatesM ?? 0) > 0;
  const plateRight = hasDrift ? width - 210 : width - 120;
  const plateTop = 104;
  const plateBot = height - 104;
  const midY = (plateTop + plateBot) / 2;
  const halfGapPx = (plateBot - plateTop) / 2;

  const totalPhysX =
    spec.plateLengthM + (spec.driftDistanceAfterPlatesM ?? 0);
  const xSpanPx = (hasDrift ? width - 84 : plateRight) - plateLeft;
  const scaleX = xSpanPx / totalPhysX;
  const scaleY = halfGapPx / (spec.plateSeparationM / 2);

  const mapPt = (pt: Point2D): Point2D => ({
    x: plateLeft + pt.x * scaleX,
    y: midY - pt.y * scaleY,
  });

  const parts: string[] = [];

  // Uniform electric field lines between plates
  const eFromTop = polarity === "positive";
  for (let i = 0; i < 6; i += 1) {
    const fx =
      plateLeft + 26 + (i * (plateRight - plateLeft - 52)) / 5;
    const yStart = eFromTop ? plateTop + 8 : plateBot - 8;
    const yEnd = eFromTop ? plateBot - 10 : plateTop + 10;
    parts.push(
      `<line x1="${fmt(fx)}" y1="${fmt(yStart)}" x2="${fmt(fx)}" y2="${fmt(yEnd)}" stroke="#829ab1" stroke-width="1.4" marker-end="url(#${arrowId})"/>`,
    );
  }

  // Parallel plates + polarity signs
  const topSign = polarity === "positive" ? "+  +  +  +  +" : "−  −  −  −  −";
  const botSign = polarity === "positive" ? "−  −  −  −  −" : "+  +  +  +  +";
  parts.push(
    `<rect x="${fmt(plateLeft)}" y="${fmt(plateTop - 7)}" width="${fmt(plateRight - plateLeft)}" height="7" fill="#d9e2ec" stroke="#171b1f" stroke-width="2"/>`,
    `<rect x="${fmt(plateLeft)}" y="${fmt(plateBot)}" width="${fmt(plateRight - plateLeft)}" height="7" fill="#d9e2ec" stroke="#171b1f" stroke-width="2"/>`,
    `<text x="${fmt((plateLeft + plateRight) / 2)}" y="${fmt(plateTop - 15)}" text-anchor="middle" font-size="14" font-weight="700" fill="#171b1f">${topSign}</text>`,
    `<text x="${fmt((plateLeft + plateRight) / 2)}" y="${fmt(plateBot + 24)}" text-anchor="middle" font-size="14" font-weight="700" fill="#171b1f">${botSign}</text>`,
    `<line x1="64" y1="${fmt(midY)}" x2="${fmt(plateRight + 24)}" y2="${fmt(midY)}" stroke="#9aa5b1" stroke-width="1.2" stroke-dasharray="5 5"/>`,
  );

  // Entry particle + initial velocity + parabolic trajectory
  const entryPt = mapPt(solution.trajectory[0]);
  const trajPath = solution.trajectory
    .map((pt, idx) => {
      const p = mapPt(pt);
      return `${idx === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`;
    })
    .join("");

  parts.push(
    `<line x1="${fmt(entryPt.x - 68)}" y1="${fmt(entryPt.y)}" x2="${fmt(entryPt.x - 10)}" y2="${fmt(entryPt.y)}" stroke="#171b1f" stroke-width="2" marker-end="url(#${arrowId})"/>`,
    `<circle cx="${fmt(entryPt.x)}" cy="${fmt(entryPt.y)}" r="5.5" fill="#171b1f"/>`,
    `<path data-trajectory="electric-parabola" d="${trajPath}" fill="none" stroke="#171b1f" stroke-width="2.5" marker-end="url(#${arrowId})"/>`,
  );

  const sameExitSpeed =
    formatSiQuantity(solution.exitSpeedMs, "m s⁻¹") ===
    formatSiQuantity(spec.initialSpeedMs, "m s⁻¹");
  const v0Text = guardedLabeledQuantity(
    ctx,
    "initialSpeedMs",
    "v₀",
    spec.initialSpeedMs,
    "m s⁻¹",
    { hiddenCompanions: sameExitSpeed ? ["exitSpeedMs"] : [] },
  );
  const vPlateText = guardedLabeledQuantity(
    ctx,
    "plateVoltageV",
    "V",
    spec.plateVoltageV,
    "V",
  );
  const lText = guardedLabeledQuantity(
    ctx,
    "plateLengthM",
    "L",
    spec.plateLengthM,
    "m",
    { hiddenCompanions: !solution.hitsPlate ? ["exitXM"] : [] },
  );
  const dText = guardedLabeledQuantity(
    ctx,
    "plateSeparationM",
    "d",
    spec.plateSeparationM,
    "m",
  );

  parts.push(
    `<text x="${fmt(entryPt.x - 38)}" y="${fmt(entryPt.y - 14)}" text-anchor="middle" font-size="13" fill="#171b1f">${escapeXml(v0Text)}</text>`,
    `<text x="84" y="48" font-size="14" fill="#171b1f">${escapeXml(`${vPlateText},  ${dText},  ${lText}`)}</text>`,
  );
  return parts.join("");
}

function renderMagneticCyclotronSvg(
  spec: MagneticCyclotronSpec,
  solution: MagneticCyclotronSolution,
  ctx: EmVisibilityContext,
  width: number,
  height: number,
  arrowId: string,
): string {
  const fieldBox: Box = {
    left: 112,
    top: 58,
    right: width - 64,
    bottom: height - 48,
  };
  const parts: string[] = [
    renderUniformBFieldGrid(fieldBox, spec.fieldDirection, 6, 8),
  ];

  // Isotropic scaling so circular arcs are exact geometric circles
  const xs = solution.trajectory.map((p) => p.x);
  const ys = solution.trajectory.map((p) => p.y);
  const minX = Math.min(0, ...xs);
  const maxX = Math.max(solution.cyclotronRadiusM, ...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);

  const physW = Math.max(maxX - minX, solution.cyclotronRadiusM * 0.8);
  const physH = Math.max(maxY - minY, solution.cyclotronRadiusM * 0.8);
  const availW = fieldBox.right - fieldBox.left - 96;
  const availH = fieldBox.bottom - fieldBox.top - 76;
  const scale = Math.min(availW / physW, availH / physH);

  const originX =
    minX < -1e-12
      ? (fieldBox.left + fieldBox.right) / 2 - ((minX + maxX) / 2) * scale
      : fieldBox.left + 28;
  const originY =
    (fieldBox.top + fieldBox.bottom) / 2 + ((minY + maxY) / 2) * scale;

  const mapPt = (pt: Point2D): Point2D => ({
    x: originX + pt.x * scale,
    y: originY - pt.y * scale,
  });

  const startSvg = mapPt({ x: 0, y: 0 });
  const centerYPhys =
    solution.initialDeflectionDirection === "up"
      ? solution.cyclotronRadiusM
      : -solution.cyclotronRadiusM;
  const centerSvg = mapPt({ x: 0, y: centerYPhys });

  const trajPath = solution.trajectory
    .map((pt, idx) => {
      const p = mapPt(pt);
      return `${idx === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`;
    })
    .join("");

  // Entry beam + particle + circular trajectory + center/radius guide
  const midArcPt = mapPt(
    solution.trajectory[Math.floor(solution.trajectory.length * 0.45)],
  );
  const rLabel = guardedLabeledQuantity(
    ctx,
    "cyclotronRadiusM",
    "r",
    solution.cyclotronRadiusM,
    "m",
    { isDerived: true, hiddenCompanions: ["orbitDiameterM"] },
  );

  parts.push(
    `<line x1="${fmt(Math.max(28, startSvg.x - 72))}" y1="${fmt(startSvg.y)}" x2="${fmt(startSvg.x)}" y2="${fmt(startSvg.y)}" stroke="#171b1f" stroke-width="2.2" marker-end="url(#${arrowId})"/>`,
    `<circle cx="${fmt(startSvg.x)}" cy="${fmt(startSvg.y)}" r="5" fill="#171b1f"/>`,
    `<path data-trajectory="magnetic-arc" d="${trajPath}" fill="none" stroke="#171b1f" stroke-width="2.5" marker-end="url(#${arrowId})"/>`,
    `<circle cx="${fmt(centerSvg.x)}" cy="${fmt(centerSvg.y)}" r="3" fill="#486581"/>`,
    `<line x1="${fmt(centerSvg.x)}" y1="${fmt(centerSvg.y)}" x2="${fmt(midArcPt.x)}" y2="${fmt(midArcPt.y)}" stroke="#486581" stroke-width="1.4" stroke-dasharray="5 4"/>`,
    `<text x="${fmt((centerSvg.x + midArcPt.x) / 2 + 10)}" y="${fmt((centerSvg.y + midArcPt.y) / 2)}" font-size="14" fill="#243b53">${escapeXml(rLabel)}</text>`,
  );

  // Magnetic force vector at entry pointing strictly toward center of curvature
  const forceSvgEndY =
    startSvg.y + (solution.initialDeflectionDirection === "up" ? -42 : 42);
  parts.push(
    `<line data-vector="magnetic-force" x1="${fmt(startSvg.x)}" y1="${fmt(startSvg.y)}" x2="${fmt(startSvg.x)}" y2="${fmt(forceSvgEndY)}" stroke="#334e68" stroke-width="2" marker-end="url(#${arrowId})"/>`,
    `<text x="${fmt(startSvg.x + 12)}" y="${fmt((startSvg.y + forceSvgEndY) / 2 + 4)}" font-size="13" fill="#243b53">F_B</text>`,
  );

  const bBadge = fieldDirectionBadgeText(
    ctx,
    "magneticFieldT",
    "B",
    spec.magneticFieldT,
    spec.fieldDirection,
  );
  const unitElementaryCharge =
    Math.abs(Math.abs(spec.chargeC) - ELEMENTARY_CHARGE_C) <=
    1e-9 * ELEMENTARY_CHARGE_C;
  const entryGivenText =
    spec.speedMs !== undefined
      ? guardedLabeledQuantity(
          ctx,
          "speedMs",
          "v",
          solution.speedMs,
          "m s⁻¹",
        )
      : guardedLabeledQuantity(
          ctx,
          "acceleratingVoltageV",
          "V_acc",
          spec.acceleratingVoltageV!,
          "V",
          { hiddenCompanions: unitElementaryCharge ? ["kineticEnergyEv"] : [] },
        );
  parts.push(
    `<text x="${fmt(fieldBox.left + 10)}" y="${fmt(fieldBox.top - 14)}" font-size="14" fill="#171b1f">${escapeXml(bBadge)}</text>`,
    `<text x="${fmt(fieldBox.right - 10)}" y="${fmt(fieldBox.top - 14)}" text-anchor="end" font-size="14" fill="#171b1f">${escapeXml(entryGivenText)}</text>`,
  );

  return parts.join("");
}

function renderVelocitySelectorSvg(
  spec: VelocitySelectorSpec,
  solution: VelocitySelectorSolution,
  ctx: EmVisibilityContext,
  width: number,
  height: number,
  arrowId: string,
): string {
  const plateLeft = 140;
  const plateRight = width - 140;
  const plateTop = 100;
  const plateBot = height - 100;
  const midY = (plateTop + plateBot) / 2;
  const parts: string[] = [
    renderUniformBFieldGrid(
      { left: plateLeft, top: plateTop, right: plateRight, bottom: plateBot },
      spec.fieldDirection,
      4,
      7,
    ),
  ];

  // Electric field vertical lines
  const eDown = spec.topPlatePolarity === "positive";
  for (let i = 0; i < 5; i += 1) {
    const fx = plateLeft + 38 + (i * (plateRight - plateLeft - 76)) / 4;
    parts.push(
      `<line x1="${fmt(fx)}" y1="${fmt(eDown ? plateTop + 8 : plateBot - 8)}" x2="${fmt(fx)}" y2="${fmt(eDown ? plateBot - 10 : plateTop + 10)}" stroke="#829ab1" stroke-width="1.3" marker-end="url(#${arrowId})"/>`,
    );
  }

  const topSign =
    spec.topPlatePolarity === "positive" ? "+  +  +  +  +" : "−  −  −  −  −";
  const botSign =
    spec.topPlatePolarity === "positive" ? "−  −  −  −  −" : "+  +  +  +  +";

  // Plates + exit collimating slit wall
  const slitX = plateRight + 24;
  parts.push(
    `<rect x="${fmt(plateLeft)}" y="${fmt(plateTop - 7)}" width="${fmt(plateRight - plateLeft)}" height="7" fill="#d9e2ec" stroke="#171b1f" stroke-width="2"/>`,
    `<rect x="${fmt(plateLeft)}" y="${fmt(plateBot)}" width="${fmt(plateRight - plateLeft)}" height="7" fill="#d9e2ec" stroke="#171b1f" stroke-width="2"/>`,
    `<text x="${fmt((plateLeft + plateRight) / 2)}" y="${fmt(plateTop - 15)}" text-anchor="middle" font-size="14" font-weight="700" fill="#171b1f">${topSign}</text>`,
    `<text x="${fmt((plateLeft + plateRight) / 2)}" y="${fmt(plateBot + 24)}" text-anchor="middle" font-size="14" font-weight="700" fill="#171b1f">${botSign}</text>`,
    `<line x1="${fmt(slitX)}" y1="${fmt(plateTop - 16)}" x2="${fmt(slitX)}" y2="${fmt(midY - 12)}" stroke="#171b1f" stroke-width="4"/>`,
    `<line x1="${fmt(slitX)}" y1="${fmt(midY + 12)}" x2="${fmt(slitX)}" y2="${fmt(plateBot + 16)}" stroke="#171b1f" stroke-width="4"/>`,
  );

  // Trajectory
  const lengthM = spec.selectorLengthM ?? 0.12;
  const maxAbsY = Math.max(
    1e-6,
    ...solution.trajectory.map((p) => Math.abs(p.y)),
  );
  const scaleX = (plateRight - plateLeft) / lengthM;
  const scaleY =
    solution.outcome === "undeflected"
      ? 1
      : Math.min(((plateBot - plateTop) * 0.38) / maxAbsY, scaleX * 3);

  const trajPath =
    solution.outcome === "undeflected"
      ? `M64 ${fmt(midY)}L${fmt(slitX + 46)} ${fmt(midY)}`
      : `M64 ${fmt(midY)}` +
        solution.trajectory
          .map((pt) => {
            const px = plateLeft + pt.x * scaleX;
            const py = Math.max(
              plateTop + 6,
              Math.min(plateBot - 6, midY - pt.y * scaleY),
            );
            return `L${fmt(px)} ${fmt(py)}`;
          })
          .join("");

  parts.push(
    `<path data-trajectory="selector-beam" d="${trajPath}" fill="none" stroke="#171b1f" stroke-width="2.4" marker-end="url(#${arrowId})"/>`,
  );

  // Opposing F_E and F_B force vectors on particle inside selector
  const fOriginX = plateLeft + (plateRight - plateLeft) * 0.35;
  const feDir = solution.electricForceYN >= 0 ? -1 : 1; // svgY inverted
  const fbDir = solution.magneticForceYN >= 0 ? -1 : 1;
  parts.push(
    `<circle cx="${fmt(fOriginX)}" cy="${fmt(midY)}" r="5" fill="#171b1f"/>`,
    `<line x1="${fmt(fOriginX)}" y1="${fmt(midY)}" x2="${fmt(fOriginX)}" y2="${fmt(midY + feDir * 44)}" stroke="#334e68" stroke-width="2" marker-end="url(#${arrowId})"/>`,
    `<text x="${fmt(fOriginX + 10)}" y="${fmt(midY + feDir * 36)}" font-size="13" fill="#243b53">F_E</text>`,
    `<line x1="${fmt(fOriginX)}" y1="${fmt(midY)}" x2="${fmt(fOriginX)}" y2="${fmt(midY + fbDir * 44)}" stroke="#334e68" stroke-width="2" marker-end="url(#${arrowId})"/>`,
    `<text x="${fmt(fOriginX + 10)}" y="${fmt(midY + fbDir * 36)}" font-size="13" fill="#243b53">F_B</text>`,
  );

  const eSourceText =
    spec.electricFieldVm !== undefined
      ? guardedLabeledQuantity(
          ctx,
          "electricFieldVm",
          "E",
          spec.electricFieldVm,
          "V m⁻¹",
        )
      : `${guardedLabeledQuantity(ctx, "plateVoltageV", "V", spec.plateVoltageV!, "V")}, ${guardedLabeledQuantity(ctx, "plateSeparationM", "d", spec.plateSeparationM!, "m")}`;
  const bBadge = fieldDirectionBadgeText(
    ctx,
    "magneticFieldT",
    "B",
    spec.magneticFieldT,
    spec.fieldDirection,
  );
  parts.push(
    `<text x="${fmt(plateLeft)}" y="48" font-size="14" fill="#171b1f">${escapeXml(`${eSourceText},  ${bBadge}`)}</text>`,
  );

  const undeflected =
    solution.outcome === "undeflected" ||
    Math.abs(solution.particleSpeedMs - solution.selectedSpeedMs) <=
      1e-6 * solution.selectedSpeedMs;
  if (
    canRenderNumericQuantity(
      ctx,
      "selectedSpeedMs",
      solution.selectedSpeedMs,
      "m s⁻¹",
      {
        isDerived: true,
        hiddenCompanions: undeflected ? ["particleSpeedMs"] : [],
      },
    )
  ) {
    parts.push(
      `<text x="${fmt(plateRight)}" y="48" text-anchor="end" font-size="14" fill="#243b53">${escapeXml(guardedLabeledQuantity(ctx, "selectedSpeedMs", "v_sel", solution.selectedSpeedMs, "m s⁻¹", { isDerived: true, hiddenCompanions: undeflected ? ["particleSpeedMs"] : [] }))}</text>`,
    );
  }
  return parts.join("");
}

function renderBainbridgeSpectrometerSvg(
  spec: BainbridgeSpectrometerSpec,
  solution: BainbridgeSpectrometerSolution,
  ctx: EmVisibilityContext,
  width: number,
  height: number,
  arrowId: string,
): string {
  const defDir = spec.deflectionFieldDirection ?? "into-page";
  const slitX = Math.round(width * 0.38);
  const chamberBox: Box = {
    left: slitX,
    top: 48,
    right: width - 38,
    bottom: height - 42,
  };
  const maxDiameterM = Math.max(
    solution.primaryDiameterM,
    solution.comparisonDiameterM ?? 0,
  );
  const maxRadiusM = maxDiameterM / 2;

  const availW = chamberBox.right - chamberBox.left - 44;
  const availH = chamberBox.bottom - chamberBox.top - 58;
  const scale = Math.min(availW / maxRadiusM, availH / maxDiameterM);

  const slitY =
    solution.deflectionDirection === "up"
      ? chamberBox.bottom - 34
      : chamberBox.top + 34;

  const selLeft = 58;
  const selRight = slitX - 16;
  const selHalfGap = 36;

  const parts: string[] = [
    // Stage 1 selector box + plates
    renderUniformBFieldGrid(
      {
        left: selLeft,
        top: slitY - selHalfGap,
        right: selRight,
        bottom: slitY + selHalfGap,
      },
      defDir,
      2,
      4,
    ),
    `<rect x="${fmt(selLeft)}" y="${fmt(slitY - selHalfGap - 6)}" width="${fmt(selRight - selLeft)}" height="6" fill="#d9e2ec" stroke="#171b1f" stroke-width="1.8"/>`,
    `<rect x="${fmt(selLeft)}" y="${fmt(slitY + selHalfGap)}" width="${fmt(selRight - selLeft)}" height="6" fill="#d9e2ec" stroke="#171b1f" stroke-width="1.8"/>`,
    // Stage 2 deflection chamber + detector wall with slit S
    renderUniformBFieldGrid(chamberBox, defDir, 6, 6),
    `<line x1="${fmt(slitX)}" y1="${fmt(chamberBox.top)}" x2="${fmt(slitX)}" y2="${fmt(slitY - 9)}" stroke="#171b1f" stroke-width="4.2"/>`,
    `<line x1="${fmt(slitX)}" y1="${fmt(slitY + 9)}" x2="${fmt(slitX)}" y2="${fmt(chamberBox.bottom)}" stroke="#171b1f" stroke-width="4.2"/>`,
    `<line x1="26" y1="${fmt(slitY)}" x2="${fmt(slitX)}" y2="${fmt(slitY)}" stroke="#171b1f" stroke-width="2.3" marker-end="url(#${arrowId})"/>`,
    `<text x="${fmt(slitX - 12)}" y="${fmt(slitY - 14)}" text-anchor="end" font-size="13" font-weight="700" fill="#171b1f">S</text>`,
  ];

  const mapChamber = (pt: Point2D): Point2D => ({
    x: slitX + pt.x * scale,
    y: slitY - pt.y * scale,
  });

  // Primary isotope semicircular arc
  const primaryPath = solution.primaryTrajectory
    .map((pt, idx) => {
      const p = mapChamber(pt);
      return `${idx === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`;
    })
    .join("");
  const primaryStrike = mapChamber(
    solution.primaryTrajectory[solution.primaryTrajectory.length - 1],
  );
  parts.push(
    `<path data-trajectory="bainbridge-primary" d="${primaryPath}" fill="none" stroke="#171b1f" stroke-width="2.4"/>`,
    `<circle cx="${fmt(primaryStrike.x)}" cy="${fmt(primaryStrike.y)}" r="4.2" fill="#171b1f"/>`,
  );

  // Optional comparison isotope semicircular arc
  if (solution.comparisonTrajectory) {
    const compPath = solution.comparisonTrajectory
      .map((pt, idx) => {
        const p = mapChamber(pt);
        return `${idx === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`;
      })
      .join("");
    const compStrike = mapChamber(
      solution.comparisonTrajectory[solution.comparisonTrajectory.length - 1],
    );
    parts.push(
      `<path data-trajectory="bainbridge-comparison" d="${compPath}" fill="none" stroke="#334e68" stroke-width="2.1" stroke-dasharray="7 5"/>`,
      `<circle cx="${fmt(compStrike.x)}" cy="${fmt(compStrike.y)}" r="4.2" fill="#334e68"/>`,
    );
  }

  const sameB =
    Math.abs(spec.selectorMagneticFieldT - solution.deflectionMagneticFieldT) <=
    1e-9 * spec.selectorMagneticFieldT;
  const eSelText = guardedLabeledQuantity(
    ctx,
    "selectorElectricFieldVm",
    "E",
    spec.selectorElectricFieldVm,
    "V m⁻¹",
  );
  const b1Text = guardedLabeledQuantity(
    ctx,
    "selectorMagneticFieldT",
    "B₁",
    spec.selectorMagneticFieldT,
    "T",
    {
      aliases: ["magneticFieldT", "B"],
      hiddenCompanions: sameB ? ["deflectionMagneticFieldT"] : [],
    },
  );
  const b2Badge = fieldDirectionBadgeText(
    ctx,
    "deflectionMagneticFieldT",
    "B₂",
    solution.deflectionMagneticFieldT,
    defDir,
    ["magneticFieldT", "B"],
    sameB ? ["selectorMagneticFieldT"] : [],
  );
  const d1Text = guardedLabeledQuantity(
    ctx,
    "primaryDiameterM",
    "D₁",
    solution.primaryDiameterM,
    "m",
    { isDerived: true, aliases: ["primaryRadiusM", "r1", "r_1", "r"] },
  );

  parts.push(
    `<text x="${fmt((selLeft + selRight) / 2)}" y="32" text-anchor="middle" font-size="13" fill="#171b1f">${escapeXml(`Selector: ${eSelText}, ${b1Text}`)}</text>`,
    `<text x="${fmt((chamberBox.left + chamberBox.right) / 2)}" y="32" text-anchor="middle" font-size="13" fill="#171b1f">${escapeXml(`Chamber: ${b2Badge}`)}</text>`,
    `<text x="${fmt(primaryStrike.x - 10)}" y="${fmt(primaryStrike.y + 4)}" text-anchor="end" font-size="13" fill="#243b53">${escapeXml(d1Text)}</text>`,
  );

  return parts.join("");
}

const SCENARIO_ARIA_LABELS: Readonly<Record<EmInductionScenarioSpec["kind"], string>> = {
  "parallel-plate-capacitor": "Parallel-plate capacitor electric field and geometry diagram",
  "capacitor-network": "Capacitor combination circuit diagram",
  "rc-transient": "RC circuit schematic and exponential transient graph",
  "flux-faraday": "Magnetic flux linkage and Faraday electromagnetic induction diagram",
  "motional-emf-rails": "Conducting rod moving on parallel rails in a uniform magnetic field",
  "ac-generator": "Rotating-coil alternating-current generator schematic and waveform graph",
  transformer: "Laminated-core transformer primary and secondary winding diagram",
  "electric-deflection": "Charged particle parabolic deflection between parallel plates",
  "magnetic-cyclotron": "Charged particle circular trajectory in a uniform magnetic field",
  "velocity-selector": "Crossed electric and magnetic field velocity selector diagram",
  "bainbridge-mass-spectrometer": "Bainbridge velocity-selected magnetic mass spectrometer diagram",
};

export function renderSolvedEmInductionSvg(
  spec: EmInductionScenarioSpec,
  solution: EmInductionSolution,
  options: EmInductionRenderOptions = {},
): string {
  const defaults = defaultDimensions(spec);
  const width = options.width ?? defaults.width;
  const height = options.height ?? defaults.height;
  assertDimensions(width, height);

  const ctx = buildEmVisibilityContext(spec, solution, options);
  const arrowId = `em-arrow-${spec.kind}`;
  const safeCustomTitle =
    spec.title && !containsAnyHiddenToken(ctx, spec.title)
      ? spec.title
      : undefined;
  const ariaLabel = safeCustomTitle ?? SCENARIO_ARIA_LABELS[spec.kind];

  let body = "";
  if (
    spec.kind === "parallel-plate-capacitor" &&
    solution.kind === "parallel-plate-capacitor"
  ) {
    body = renderParallelPlateCapacitorSvg(spec, solution, ctx, width, height, arrowId);
  } else if (
    spec.kind === "capacitor-network" &&
    solution.kind === "capacitor-network"
  ) {
    body = renderCapacitorNetworkSvg(spec, solution, ctx, width, height);
  } else if (spec.kind === "rc-transient" && solution.kind === "rc-transient") {
    body = renderRcTransientSvg(spec, solution, ctx, width, height, arrowId);
  } else if (spec.kind === "flux-faraday" && solution.kind === "flux-faraday") {
    body = renderFluxFaradaySvg(spec, solution, ctx, width, height, arrowId);
  } else if (
    spec.kind === "motional-emf-rails" &&
    solution.kind === "motional-emf-rails"
  ) {
    body = renderMotionalEmfRailsSvg(spec, solution, ctx, width, height, arrowId);
  } else if (spec.kind === "ac-generator" && solution.kind === "ac-generator") {
    body = renderAcGeneratorSvg(spec, solution, ctx, width, height, arrowId);
  } else if (spec.kind === "transformer" && solution.kind === "transformer") {
    body = renderTransformerSvg(spec, solution, ctx, width, height);
  } else if (
    spec.kind === "electric-deflection" &&
    solution.kind === "electric-deflection"
  ) {
    body = renderElectricDeflectionSvg(spec, solution, ctx, width, height, arrowId);
  } else if (
    spec.kind === "magnetic-cyclotron" &&
    solution.kind === "magnetic-cyclotron"
  ) {
    body = renderMagneticCyclotronSvg(spec, solution, ctx, width, height, arrowId);
  } else if (
    spec.kind === "velocity-selector" &&
    solution.kind === "velocity-selector"
  ) {
    body = renderVelocitySelectorSvg(spec, solution, ctx, width, height, arrowId);
  } else if (
    spec.kind === "bainbridge-mass-spectrometer" &&
    solution.kind === "bainbridge-mass-spectrometer"
  ) {
    body = renderBainbridgeSpectrometerSvg(spec, solution, ctx, width, height, arrowId);
  } else {
    throw new Error(`Mismatched EM scenario and solution kind: ${spec.kind}`);
  }

  const titleHeading = safeCustomTitle
    ? `<text x="${fmt(width / 2)}" y="22" text-anchor="middle" font-size="15" font-weight="700" fill="#171b1f">${escapeXml(safeCustomTitle)}</text>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(ariaLabel)}" data-scenario-kind="${spec.kind}">`,
    `<title>${escapeXml(ariaLabel)}</title>`,
    `<rect width="${width}" height="${height}" fill="white"/>`,
    `<defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#171b1f"/></marker></defs>`,
    `<g font-family="Arial, sans-serif">`,
    titleHeading,
    body,
    `</g>`,
    `</svg>`,
  ].join("");
}
