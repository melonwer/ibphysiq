import { Point2D } from "@/lib/visuals/types";
import {
  DEFAULT_HUBBLE_CONSTANT_KMS_MPC,
  STANDARD_GRAVITY_MS2,
} from "./constants";
import { solveGravAstroScenario } from "./physics";
import {
  BankedCurveScenario,
  BankedCurveSolution,
  CircularOrbitEnergyScenario,
  CircularOrbitEnergySolution,
  ConicalPendulumScenario,
  ConicalPendulumSolution,
  CosmologicalRedshiftScenario,
  CosmologicalRedshiftSolution,
  FlatCurveScenario,
  FlatCurveSolution,
  GravAstroRenderOptions,
  GravAstroScenario,
  HrDiagramScenario,
  HrDiagramSolution,
  PlanetaryFieldPotentialScenario,
  PlanetaryFieldPotentialSolution,
  StellarParallaxScenario,
  StellarParallaxSolution,
  StellarRadiationScenario,
  StellarRadiationSolution,
  TwoBodyNullPointScenario,
  TwoBodyNullPointSolution,
  VerticalCircleScenario,
  VerticalCircleSolution,
} from "./types";
import { expandHiddenQuantityKeys } from "./validation";

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  "-": "⁻",
  "+": "",
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

export function escapeXml(value: string): string {
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

function fmtCoord(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Non-finite SVG coordinate");
  }
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function formatQuantityValue(
  value: number,
  unit = "",
  sigFigs = 3,
): string {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot format non-finite physical value");
  }
  if (value === 0) {
    return unit ? `0 ${unit}` : "0";
  }
  const abs = Math.abs(value);
  let numText: string;
  if (abs >= 0.01 && abs < 10000) {
    numText = String(Number(value.toPrecision(sigFigs)));
  } else {
    const expParts = value.toExponential(sigFigs - 1).split("e");
    const mantissa = expParts[0];
    const exponent = String(parseInt(expParts[1], 10));
    const sup = [...exponent]
      .map((c) => SUPERSCRIPT_DIGITS[c] ?? c)
      .join("");
    numText = `${mantissa} × 10${sup}`;
  }
  return unit ? `${numText} ${unit}` : numText;
}

interface VisibilityContext {
  hiddenSet: ReadonlySet<string>;
  visibleSet: ReadonlySet<string>;
  labelMode: "blacklist" | "allowlist" | "symbolic-only";
  showDerivedValues: boolean;
  showSymbolsForHidden: boolean;
  customLabels: Readonly<Record<string, string>>;
  emittedLabels: string[];
}

function buildVisibilityContext(
  spec: GravAstroScenario,
  options: GravAstroRenderOptions,
): VisibilityContext {
  const rawHidden = [
    ...(spec.hiddenQuantities ?? []),
    ...(spec.visibility?.hiddenQuantities ?? []),
    ...(options.hiddenQuantities ?? []),
  ];
  const hiddenSet = expandHiddenQuantityKeys(rawHidden);
  const visibleSet = new Set(spec.visibility?.visibleQuantities ?? []);
  for (const key of visibleSet) {
    if (hiddenSet.has(key)) {
      throw new Error(
        `Visibility conflict: "${key}" is both hidden and visible`,
      );
    }
  }
  const customLabels = spec.visibility?.customLabels ?? {};
  for (const [key, text] of Object.entries(customLabels)) {
    if (hiddenSet.has(key) && /\d/.test(text)) {
      throw new Error(
        `Custom label for hidden quantity "${key}" cannot contain numeric digits`,
      );
    }
  }
  return {
    hiddenSet,
    visibleSet,
    labelMode: spec.visibility?.labelMode ?? "blacklist",
    showDerivedValues: spec.visibility?.showDerivedValues ?? false,
    showSymbolsForHidden: spec.visibility?.showSymbolsForHidden ?? true,
    customLabels,
    emittedLabels: [],
  };
}

function canShowNumeric(
  ctx: VisibilityContext,
  key: string,
  isInput: boolean,
): boolean {
  if (ctx.hiddenSet.has(key)) return false;
  if (ctx.labelMode === "symbolic-only") return false;
  if (ctx.labelMode === "allowlist") return ctx.visibleSet.has(key);
  return isInput || ctx.showDerivedValues || ctx.visibleSet.has(key);
}

function resolveQuantityLabel(
  ctx: VisibilityContext,
  key: string,
  symbol: string,
  value: number,
  unit: string,
  isInput: boolean,
): string | null {
  const custom = ctx.customLabels[key];
  if (custom !== undefined) {
    ctx.emittedLabels.push(custom);
    return custom;
  }
  if (canShowNumeric(ctx, key, isInput)) {
    const formatted = `${symbol} = ${formatQuantityValue(value, unit)}`;
    ctx.emittedLabels.push(formatted);
    return formatted;
  }
  if (ctx.hiddenSet.has(key) && !ctx.showSymbolsForHidden) {
    return null;
  }
  ctx.emittedLabels.push(symbol);
  return symbol;
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "-");
  return cleaned || "grav-astro";
}

function svgText(
  x: number,
  y: number,
  content: string | null,
  opts: {
    anchor?: "start" | "middle" | "end";
    size?: number;
    fill?: string;
    weight?: "normal" | "bold";
    italic?: boolean;
  } = {},
): string {
  if (!content) return "";
  const anchor = opts.anchor ?? "middle";
  const size = opts.size ?? 13;
  const fill = opts.fill ?? "#1f2937";
  const weightAttr = opts.weight === "bold" ? ' font-weight="bold"' : "";
  const styleAttr = opts.italic ? ' font-style="italic"' : "";
  return `<text x="${fmtCoord(x)}" y="${fmtCoord(y)}" text-anchor="${anchor}" font-size="${size}" fill="${fill}"${weightAttr}${styleAttr}>${escapeXml(content)}</text>`;
}

function svgVectorArrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  markerId: string,
  stroke = "#1f2937",
  dashed = false,
  width = 2,
): string {
  const dashAttr = dashed ? ' stroke-dasharray="5 4"' : "";
  return `<line x1="${fmtCoord(x1)}" y1="${fmtCoord(y1)}" x2="${fmtCoord(x2)}" y2="${fmtCoord(y2)}" stroke="${stroke}" stroke-width="${width}"${dashAttr} marker-end="url(#${markerId})"/>`;
}

function svgAngleArc(
  cx: number,
  cy: number,
  radius: number,
  startRadScreen: number,
  endRadScreen: number,
  stroke = "#374151",
): string {
  const sx = cx + radius * Math.cos(startRadScreen);
  const sy = cy + radius * Math.sin(startRadScreen);
  const ex = cx + radius * Math.cos(endRadScreen);
  const ey = cy + radius * Math.sin(endRadScreen);
  const sweep = endRadScreen >= startRadScreen ? 1 : 0;
  return `<path d="M ${fmtCoord(sx)} ${fmtCoord(sy)} A ${fmtCoord(radius)} ${fmtCoord(radius)} 0 0 ${sweep} ${fmtCoord(ex)} ${fmtCoord(ey)}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
}

function renderConicalPendulum(
  spec: ConicalPendulumScenario,
  sol: ConicalPendulumSolution,
  ctx: VisibilityContext,
  width: number,
  height: number,
  prefix: string,
): string {
  const parts: string[] = [];
  const pivotX = width * 0.46;
  const pivotY = height * 0.16;
  const thetaRad = (spec.semiVerticalAngleDeg * Math.PI) / 180;
  const clampedVisRad = Math.min(
    Math.max(thetaRad, (18 * Math.PI) / 180),
    (62 * Math.PI) / 180,
  );
  const stringPx = Math.min(width * 0.42, height * 0.56);
  const bobX = pivotX + stringPx * Math.sin(clampedVisRad);
  const bobY = pivotY + stringPx * Math.cos(clampedVisRad);
  const orbitRx = bobX - pivotX;
  const orbitRy = Math.max(16, orbitRx * 0.24);

  parts.push(
    `<line x1="${fmtCoord(pivotX - 70)}" y1="${fmtCoord(pivotY)}" x2="${fmtCoord(pivotX + 70)}" y2="${fmtCoord(pivotY)}" stroke="#1f2937" stroke-width="3"/>`,
  );
  for (let hx = -60; hx <= 60; hx += 15) {
    parts.push(
      `<line x1="${fmtCoord(pivotX + hx)}" y1="${fmtCoord(pivotY)}" x2="${fmtCoord(pivotX + hx + 8)}" y2="${fmtCoord(pivotY - 10)}" stroke="#6b7280" stroke-width="1.2"/>`,
    );
  }

  parts.push(
    `<ellipse cx="${fmtCoord(pivotX)}" cy="${fmtCoord(bobY)}" rx="${fmtCoord(orbitRx)}" ry="${fmtCoord(orbitRy)}" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="6 4"/>`,
  );
  parts.push(
    `<line x1="${fmtCoord(pivotX)}" y1="${fmtCoord(pivotY)}" x2="${fmtCoord(pivotX)}" y2="${fmtCoord(bobY + 28)}" stroke="#6b7280" stroke-width="1.4" stroke-dasharray="5 4"/>`,
  );
  parts.push(
    `<line x1="${fmtCoord(pivotX)}" y1="${fmtCoord(bobY)}" x2="${fmtCoord(bobX)}" y2="${fmtCoord(bobY)}" stroke="#4b5563" stroke-width="1.4" stroke-dasharray="4 3"/>`,
  );
  parts.push(
    `<circle cx="${fmtCoord(pivotX)}" cy="${fmtCoord(bobY)}" r="3" fill="#374151"/>`,
  );
  parts.push(svgText(pivotX - 12, bobY + 4, "O", { size: 12, fill: "#4b5563" }));

  parts.push(
    `<line x1="${fmtCoord(pivotX)}" y1="${fmtCoord(pivotY)}" x2="${fmtCoord(bobX)}" y2="${fmtCoord(bobY)}" stroke="#1f2937" stroke-width="2.2"/>`,
  );

  const startScreen = Math.PI / 2 - clampedVisRad;
  const endScreen = Math.PI / 2;
  parts.push(svgAngleArc(pivotX, pivotY, 44, startScreen, endScreen));
  const midAngle = (startScreen + endScreen) / 2;
  const angleLbl = resolveQuantityLabel(
    ctx,
    "semiVerticalAngleDeg",
    "θ",
    spec.semiVerticalAngleDeg,
    "°",
    true,
  );
  parts.push(
    svgText(
      pivotX + 64 * Math.cos(midAngle),
      pivotY + 64 * Math.sin(midAngle) + 4,
      angleLbl,
      { anchor: "start", size: 13 },
    ),
  );

  const lengthLbl = resolveQuantityLabel(
    ctx,
    "stringLengthM",
    "L",
    spec.stringLengthM,
    "m",
    true,
  );
  parts.push(
    svgText(
      (pivotX + bobX) / 2 + 16,
      (pivotY + bobY) / 2 - 6,
      lengthLbl,
      { anchor: "start", size: 13 },
    ),
  );

  const radiusLbl = resolveQuantityLabel(
    ctx,
    "orbitRadiusM",
    "r",
    sol.details.orbitRadiusM,
    "m",
    false,
  );
  parts.push(
    svgText((pivotX + bobX) / 2, bobY + 18, radiusLbl, {
      size: 12,
      fill: "#374151",
    }),
  );

  const tVecLen = 68;
  const tx = bobX - tVecLen * Math.sin(clampedVisRad);
  const ty = bobY - tVecLen * Math.cos(clampedVisRad);
  parts.push(
    svgVectorArrow(bobX, bobY, tx, ty, `${prefix}-arrow-blue`, "#1d4ed8"),
  );
  const tensionLbl = resolveQuantityLabel(
    ctx,
    "tensionN",
    "T",
    sol.details.tensionN,
    "N",
    false,
  );
  parts.push(
    svgText(tx + 14, ty - 6, tensionLbl, {
      anchor: "start",
      fill: "#1d4ed8",
      weight: "bold",
    }),
  );

  const wVecLen = 62;
  parts.push(
    svgVectorArrow(
      bobX,
      bobY,
      bobX,
      bobY + wVecLen,
      `${prefix}-arrow-red`,
      "#b91c1c",
    ),
  );
  const weightLbl = ctx.hiddenSet.has("massKg")
    ? resolveQuantityLabel(ctx, "weightN", "W", sol.details.weightN, "N", false)
    : resolveQuantityLabel(ctx, "massKg", "m", spec.massKg, "kg", true);
  parts.push(
    svgText(bobX + 10, bobY + wVecLen + 4, weightLbl, {
      anchor: "start",
      fill: "#b91c1c",
    }),
  );

  const acLen = Math.min(58, orbitRx * 0.55);
  parts.push(
    svgVectorArrow(
      bobX,
      bobY - 16,
      bobX - acLen,
      bobY - 16,
      `${prefix}-arrow-green`,
      "#047857",
      true,
      1.8,
    ),
  );
  const acLbl = resolveQuantityLabel(
    ctx,
    "centripetalAccelMs2",
    "a_c",
    sol.details.centripetalAccelMs2,
    "m s⁻²",
    false,
  );
  parts.push(
    svgText(bobX - acLen / 2, bobY - 24, acLbl, {
      size: 12,
      fill: "#047857",
    }),
  );

  parts.push(
    `<circle cx="${fmtCoord(bobX)}" cy="${fmtCoord(bobY)}" r="11" fill="#f3f4f6" stroke="#1f2937" stroke-width="2.2"/>`,
  );

  const speedLbl = resolveQuantityLabel(
    ctx,
    "linearSpeedMs",
    "v",
    sol.details.linearSpeedMs,
    "m s⁻¹",
    false,
  );
  parts.push(
    svgText(pivotX, bobY + orbitRy + 22, speedLbl, {
      size: 13,
      fill: "#1f2937",
    }),
  );

  return parts.join("");
}

function renderFlatCurve(
  spec: FlatCurveScenario,
  sol: FlatCurveSolution,
  ctx: VisibilityContext,
  width: number,
  height: number,
  prefix: string,
): string {
  const parts: string[] = [];
  const centerX = width * 0.22;
  const centerY = height * 0.52;
  const arcR = Math.min(width * 0.46, height * 0.64);
  const carX = centerX + arcR;
  const carY = centerY;

  const a1 = -0.68;
  const a2 = 0.68;
  for (const dr of [-26, 0, 26]) {
    const r = arcR + dr;
    const sx = centerX + r * Math.cos(a1);
    const sy = centerY + r * Math.sin(a1);
    const ex = centerX + r * Math.cos(a2);
    const ey = centerY + r * Math.sin(a2);
    const dash = dr === 0 ? ' stroke-dasharray="8 6"' : "";
    const stroke = dr === 0 ? "#6b7280" : "#1f2937";
    parts.push(
      `<path d="M ${fmtCoord(sx)} ${fmtCoord(sy)} A ${fmtCoord(r)} ${fmtCoord(r)} 0 0 1 ${fmtCoord(ex)} ${fmtCoord(ey)}" fill="none" stroke="${stroke}" stroke-width="${dr === 0 ? 1.4 : 2.2}"${dash}/>`,
    );
  }

  parts.push(
    `<circle cx="${fmtCoord(centerX)}" cy="${fmtCoord(centerY)}" r="4" fill="#1f2937"/>`,
  );
  parts.push(
    svgText(centerX - 14, centerY + 5, "O", { size: 13, weight: "bold" }),
  );
  parts.push(
    `<line x1="${fmtCoord(centerX)}" y1="${fmtCoord(centerY)}" x2="${fmtCoord(carX - 24)}" y2="${fmtCoord(carY)}" stroke="#4b5563" stroke-width="1.5" stroke-dasharray="5 4"/>`,
  );

  const rLbl = resolveQuantityLabel(
    ctx,
    "radiusM",
    "r",
    spec.radiusM,
    "m",
    true,
  );
  parts.push(
    svgText((centerX + carX) / 2, centerY + 20, rLbl, {
      size: 13,
      fill: "#374151",
    }),
  );

  parts.push(
    `<rect x="${fmtCoord(carX - 16)}" y="${fmtCoord(carY - 26)}" width="32" height="52" rx="6" fill="#ffffff" stroke="#1f2937" stroke-width="2.2"/>`,
  );

  parts.push(
    svgVectorArrow(
      carX,
      carY - 26,
      carX,
      carY - 102,
      `${prefix}-arrow-blue`,
      "#1d4ed8",
    ),
  );
  const vLbl = resolveQuantityLabel(
    ctx,
    "speedMs",
    "v",
    spec.speedMs,
    "m s⁻¹",
    true,
  );
  parts.push(
    svgText(carX + 12, carY - 94, vLbl, {
      anchor: "start",
      fill: "#1d4ed8",
      weight: "bold",
    }),
  );

  parts.push(
    svgVectorArrow(
      carX - 16,
      carY,
      carX - 98,
      carY,
      `${prefix}-arrow-red`,
      "#b91c1c",
    ),
  );
  const fsLbl = resolveQuantityLabel(
    ctx,
    "frictionForceN",
    "f_s",
    sol.details.frictionForceN,
    "N",
    false,
  );
  parts.push(
    svgText(carX - 60, carY - 10, fsLbl, {
      fill: "#b91c1c",
      weight: "bold",
    }),
  );

  const mLbl = resolveQuantityLabel(
    ctx,
    "massKg",
    "m",
    spec.massKg,
    "kg",
    true,
  );
  const muLbl = resolveQuantityLabel(
    ctx,
    "staticFrictionCoeff",
    "μ_s",
    spec.staticFrictionCoeff,
    "",
    true,
  );
  parts.push(
    svgText(width * 0.78, height * 0.22, mLbl, { anchor: "middle", size: 13 }),
  );
  parts.push(
    svgText(width * 0.78, height * 0.29, muLbl, { anchor: "middle", size: 13 }),
  );
  parts.push(
    svgText(width * 0.5, height * 0.1, "Top view (horizontal circular track)", {
      size: 14,
      weight: "bold",
    }),
  );

  return parts.join("");
}

function renderBankedCurve(
  spec: BankedCurveScenario,
  sol: BankedCurveSolution,
  ctx: VisibilityContext,
  width: number,
  height: number,
  prefix: string,
): string {
  const parts: string[] = [];
  const thetaRad = (spec.bankAngleDeg * Math.PI) / 180;
  const visRad = Math.min(
    Math.max(thetaRad, (14 * Math.PI) / 180),
    (52 * Math.PI) / 180,
  );

  const baseLeftX = width * 0.18;
  const baseY = height * 0.78;
  const wedgeWidth = width * 0.58;
  const baseRightX = baseLeftX + wedgeWidth;
  const topRightY = baseY - wedgeWidth * Math.tan(visRad);

  parts.push(
    `<polygon points="${fmtCoord(baseLeftX)},${fmtCoord(baseY)} ${fmtCoord(baseRightX)},${fmtCoord(baseY)} ${fmtCoord(baseRightX)},${fmtCoord(topRightY)}" fill="#f9fafb" stroke="#1f2937" stroke-width="2.2"/>`,
  );

  parts.push(svgAngleArc(baseLeftX, baseY, 54, -visRad, 0));
  const bankLbl = resolveQuantityLabel(
    ctx,
    "bankAngleDeg",
    "θ",
    spec.bankAngleDeg,
    "°",
    true,
  );
  parts.push(
    svgText(
      baseLeftX + 76 * Math.cos(-visRad / 2),
      baseY + 76 * Math.sin(-visRad / 2) + 4,
      bankLbl,
      { anchor: "start", size: 13 },
    ),
  );

  const frac = 0.52;
  const slopePtX = baseLeftX + frac * wedgeWidth;
  const slopePtY = baseY - frac * wedgeWidth * Math.tan(visRad);
  const nx = -Math.sin(visRad);
  const ny = -Math.cos(visRad);
  const carCx = slopePtX + 16 * nx;
  const carCy = slopePtY + 16 * ny;
  const rotDeg = (-visRad * 180) / Math.PI;

  parts.push(
    `<g transform="translate(${fmtCoord(carCx)} ${fmtCoord(carCy)}) rotate(${fmtCoord(rotDeg)})"><rect x="-24" y="-14" width="48" height="28" rx="4" fill="#ffffff" stroke="#1f2937" stroke-width="2.2"/><circle cx="-14" cy="14" r="4" fill="#1f2937"/><circle cx="14" cy="14" r="4" fill="#1f2937"/></g>`,
  );

  const nLen = 78;
  const nEndX = carCx + nLen * nx;
  const nEndY = carCy + nLen * ny;
  parts.push(
    svgVectorArrow(
      carCx,
      carCy,
      nEndX,
      nEndY,
      `${prefix}-arrow-blue`,
      "#1d4ed8",
    ),
  );
  const nLbl = resolveQuantityLabel(
    ctx,
    "normalForceN",
    "N",
    sol.details.normalForceN,
    "N",
    false,
  );
  parts.push(
    svgText(nEndX - 8, nEndY - 8, nLbl, {
      anchor: "end",
      fill: "#1d4ed8",
      weight: "bold",
    }),
  );

  const wLen = 74;
  parts.push(
    svgVectorArrow(
      carCx,
      carCy,
      carCx,
      carCy + wLen,
      `${prefix}-arrow-red`,
      "#b91c1c",
    ),
  );
  const wLbl = ctx.hiddenSet.has("massKg")
    ? resolveQuantityLabel(ctx, "weightN", "mg", sol.details.weightN, "N", false)
    : resolveQuantityLabel(ctx, "massKg", "m", spec.massKg, "kg", true);
  parts.push(
    svgText(carCx + 10, carCy + wLen + 4, wLbl, {
      anchor: "start",
      fill: "#b91c1c",
    }),
  );

  const hideFrictionDir = ctx.hiddenSet.has("frictionDirection");
  if (
    !hideFrictionDir &&
    sol.details.frictionDirection !== "none" &&
    spec.staticFrictionCoeff > 0
  ) {
    const dirSign = sol.details.frictionDirection === "down-slope" ? -1 : 1;
    const sx = dirSign * Math.cos(visRad);
    const sy = -dirSign * Math.sin(visRad);
    const fLen = 64;
    const fEndX = slopePtX + fLen * sx;
    const fEndY = slopePtY + fLen * sy;
    parts.push(
      svgVectorArrow(
        slopePtX,
        slopePtY,
        fEndX,
        fEndY,
        `${prefix}-arrow-amber`,
        "#b45309",
      ),
    );
    const fLbl = resolveQuantityLabel(
      ctx,
      "frictionForceN",
      "f_s",
      sol.details.frictionForceN,
      "N",
      false,
    );
    parts.push(
      svgText(
        fEndX + (dirSign < 0 ? -8 : 8),
        fEndY + (dirSign < 0 ? 16 : -8),
        fLbl,
        {
          anchor: dirSign < 0 ? "end" : "start",
          fill: "#b45309",
          weight: "bold",
        },
      ),
    );
  }

  parts.push(
    svgVectorArrow(
      carCx - 32,
      carCy - 34,
      carCx - 110,
      carCy - 34,
      `${prefix}-arrow-green`,
      "#047857",
      true,
      1.8,
    ),
  );
  const acLbl = resolveQuantityLabel(
    ctx,
    "centripetalAccelMs2",
    "a_c (to center)",
    sol.details.centripetalAccelMs2,
    "m s⁻²",
    false,
  );
  parts.push(
    svgText(carCx - 72, carCy - 44, acLbl, {
      size: 12,
      fill: "#047857",
    }),
  );

  const rLbl = resolveQuantityLabel(
    ctx,
    "radiusM",
    "r",
    spec.radiusM,
    "m",
    true,
  );
  const vLbl =
    spec.speedMs !== undefined
      ? resolveQuantityLabel(ctx, "speedMs", "v", spec.speedMs, "m s⁻¹", true)
      : resolveQuantityLabel(
          ctx,
          "idealSpeedMs",
          "v_ideal",
          sol.details.idealSpeedMs,
          "m s⁻¹",
          false,
        );
  const muLbl =
    spec.staticFrictionCoeff > 0
      ? resolveQuantityLabel(
          ctx,
          "staticFrictionCoeff",
          "μ_s",
          spec.staticFrictionCoeff,
          "",
          true,
        )
      : canShowNumeric(ctx, "staticFrictionCoeff", true)
        ? "Smooth bank (μ_s = 0)"
        : "Smooth bank";
  if (
    spec.staticFrictionCoeff === 0 &&
    muLbl !== null &&
    !ctx.hiddenSet.has("staticFrictionCoeff")
  ) {
    ctx.emittedLabels.push(muLbl);
  }

  parts.push(svgText(width * 0.24, height * 0.16, rLbl, { anchor: "start" }));
  parts.push(svgText(width * 0.24, height * 0.23, vLbl, { anchor: "start" }));
  if (!ctx.hiddenSet.has("staticFrictionCoeff")) {
    parts.push(svgText(width * 0.24, height * 0.3, muLbl, { anchor: "start" }));
  }

  return parts.join("");
}

function renderVerticalCircle(
  spec: VerticalCircleScenario,
  sol: VerticalCircleSolution,
  ctx: VisibilityContext,
  width: number,
  height: number,
  prefix: string,
): string {
  const parts: string[] = [];
  const cx = width * 0.48;
  const cy = height * 0.5;
  const loopR = Math.min(width * 0.27, height * 0.33);
  const constraint = spec.constraintKind ?? "string";

  parts.push(
    `<circle cx="${fmtCoord(cx)}" cy="${fmtCoord(cy)}" r="${fmtCoord(loopR)}" fill="none" stroke="#374151" stroke-width="${constraint === "inside-track" ? 2.4 : 1.6}"${constraint === "string" || constraint === "rigid-rod" ? ' stroke-dasharray="7 5"' : ""}/>`,
  );
  parts.push(
    `<circle cx="${fmtCoord(cx)}" cy="${fmtCoord(cy)}" r="3.5" fill="#1f2937"/>`,
  );

  if (constraint === "string" || constraint === "rigid-rod") {
    parts.push(
      `<line x1="${fmtCoord(cx)}" y1="${fmtCoord(cy)}" x2="${fmtCoord(cx)}" y2="${fmtCoord(cy + loopR)}" stroke="#1f2937" stroke-width="${constraint === "rigid-rod" ? 3 : 1.8}"/>`,
    );
    parts.push(
      `<line x1="${fmtCoord(cx)}" y1="${fmtCoord(cy)}" x2="${fmtCoord(cx)}" y2="${fmtCoord(cy - loopR)}" stroke="#6b7280" stroke-width="1.4" stroke-dasharray="4 3"/>`,
    );
  }

  const rLbl = resolveQuantityLabel(
    ctx,
    "radiusM",
    "R",
    spec.radiusM,
    "m",
    true,
  );
  parts.push(
    svgText(cx + 18, cy + loopR * 0.45, rLbl, { anchor: "start", size: 13 }),
  );

  const topY = cy - loopR;
  const botY = cy + loopR;
  parts.push(
    `<circle cx="${fmtCoord(cx)}" cy="${fmtCoord(topY)}" r="9" fill="#ffffff" stroke="#1f2937" stroke-width="2"/>`,
  );
  parts.push(
    `<circle cx="${fmtCoord(cx)}" cy="${fmtCoord(botY)}" r="10" fill="#f3f4f6" stroke="#1f2937" stroke-width="2.2"/>`,
  );

  parts.push(
    svgVectorArrow(
      cx,
      topY,
      cx + 66,
      topY,
      `${prefix}-arrow-blue`,
      "#1d4ed8",
    ),
  );
  const refPos =
    spec.referencePosition ??
    (spec.motionMode === "energy-conserving" ? "bottom" : "top");
  const topSpeedIsInput =
    spec.motionMode === "uniform" || refPos === "top";
  const vTopKey =
    ctx.hiddenSet.has("speedTopMs") || !topSpeedIsInput
      ? "speedTopMs"
      : "referenceSpeedMs";
  const vTopLbl = resolveQuantityLabel(
    ctx,
    vTopKey,
    "v_top",
    sol.details.speedTopMs,
    "m s⁻¹",
    topSpeedIsInput && !ctx.hiddenSet.has("speedTopMs"),
  );
  parts.push(
    svgText(cx + 72, topY + 4, vTopLbl, {
      anchor: "start",
      fill: "#1d4ed8",
      size: 12,
    }),
  );

  parts.push(
    svgVectorArrow(
      cx,
      botY,
      cx + 76,
      botY,
      `${prefix}-arrow-blue`,
      "#1d4ed8",
    ),
  );
  const botSpeedIsInput =
    spec.motionMode === "uniform" || refPos === "bottom";
  const vBotKey =
    ctx.hiddenSet.has("speedBottomMs") || !botSpeedIsInput
      ? "speedBottomMs"
      : "referenceSpeedMs";
  const vBotLbl = resolveQuantityLabel(
    ctx,
    vBotKey,
    "v_bot",
    sol.details.speedBottomMs,
    "m s⁻¹",
    botSpeedIsInput && !ctx.hiddenSet.has("speedBottomMs"),
  );
  parts.push(
    svgText(cx + 82, botY + 4, vBotLbl, {
      anchor: "start",
      fill: "#1d4ed8",
      size: 12,
    }),
  );

  parts.push(
    svgVectorArrow(
      cx - 8,
      topY,
      cx - 8,
      topY + 46,
      `${prefix}-arrow-red`,
      "#b91c1c",
    ),
  );
  parts.push(
    svgText(cx - 14, topY + 38, "mg", {
      anchor: "end",
      fill: "#b91c1c",
      size: 12,
    }),
  );

  const topForceSym =
    constraint === "inside-track" || constraint === "over-crest"
      ? "N_top"
      : "T_top";
  if (sol.details.supportForceTopN !== 0 || ctx.hiddenSet.has("supportForceTopN")) {
    const downAtTop =
      constraint === "over-crest" ? false : sol.details.supportForceTopN >= 0;
    const fTopEndY = downAtTop ? topY + 42 : topY - 42;
    parts.push(
      svgVectorArrow(
        cx + 8,
        topY,
        cx + 8,
        fTopEndY,
        `${prefix}-arrow-green`,
        "#047857",
      ),
    );
    const fTopLbl = resolveQuantityLabel(
      ctx,
      "supportForceTopN",
      topForceSym,
      Math.abs(sol.details.supportForceTopN),
      "N",
      false,
    );
    parts.push(
      svgText(cx + 16, (topY + fTopEndY) / 2 + 4, fTopLbl, {
        anchor: "start",
        fill: "#047857",
        size: 12,
      }),
    );
  }

  const botForceSym =
    constraint === "inside-track" || constraint === "over-crest"
      ? "N_bot"
      : "T_bot";
  parts.push(
    svgVectorArrow(
      cx - 8,
      botY,
      cx - 8,
      botY - 64,
      `${prefix}-arrow-green`,
      "#047857",
    ),
  );
  const fBotLbl = resolveQuantityLabel(
    ctx,
    "supportForceBottomN",
    botForceSym,
    sol.details.supportForceBottomN,
    "N",
    false,
  );
  parts.push(
    svgText(cx - 14, botY - 46, fBotLbl, {
      anchor: "end",
      fill: "#047857",
      size: 12,
    }),
  );

  parts.push(
    svgVectorArrow(
      cx + 8,
      botY,
      cx + 8,
      botY + 44,
      `${prefix}-arrow-red`,
      "#b91c1c",
    ),
  );
  parts.push(
    svgText(cx + 14, botY + 38, "mg", {
      anchor: "start",
      fill: "#b91c1c",
      size: 12,
    }),
  );

  const mLbl = resolveQuantityLabel(
    ctx,
    "massKg",
    "m",
    spec.massKg,
    "kg",
    true,
  );
  const gVal = spec.gravityMs2 ?? STANDARD_GRAVITY_MS2;
  const gLbl = resolveQuantityLabel(
    ctx,
    "gravityMs2",
    "g",
    gVal,
    "m s⁻²",
    true,
  );
  parts.push(svgText(width * 0.14, height * 0.18, mLbl, { anchor: "start" }));
  parts.push(svgText(width * 0.14, height * 0.25, gLbl, { anchor: "start" }));

  return parts.join("");
}

function polylineFromData(
  points: readonly Point2D[],
  projX: (x: number) => number,
  projY: (y: number) => number,
): string {
  return points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${fmtCoord(projX(p.x))} ${fmtCoord(projY(p.y))}`)
    .join(" ");
}

function renderPlanetaryFieldPotential(
  spec: PlanetaryFieldPotentialScenario,
  sol: PlanetaryFieldPotentialSolution,
  ctx: VisibilityContext,
  width: number,
  height: number,
  prefix: string,
): string {
  const parts: string[] = [];
  const plotMode = spec.plotQuantity ?? "field-strength";
  const curve =
    plotMode === "field-strength"
      ? (sol.curves?.fieldStrength ?? [])
      : (sol.curves?.potential ?? []);

  const left = 92;
  const right = width - 48;
  const top = 56;
  const bottom = height - 64;
  const maxR = curve[curve.length - 1]?.x ?? spec.planetRadiusM * 4;
  const projX = (r: number) => left + ((r / maxR) * (right - left));

  if (plotMode === "field-strength") {
    const maxG = sol.details.surfaceFieldNkg * 1.15;
    const projY = (gVal: number) => bottom - (gVal / maxG) * (bottom - top);
    const rx = projX(spec.planetRadiusM);

    parts.push(
      `<rect x="${fmtCoord(left)}" y="${fmtCoord(top)}" width="${fmtCoord(rx - left)}" height="${fmtCoord(bottom - top)}" fill="#f3f4f6"/>`,
    );
    parts.push(
      `<line x1="${fmtCoord(rx)}" y1="${fmtCoord(top)}" x2="${fmtCoord(rx)}" y2="${fmtCoord(bottom)}" stroke="#6b7280" stroke-width="1.4" stroke-dasharray="5 4"/>`,
    );

    parts.push(
      svgVectorArrow(
        left,
        bottom,
        right + 12,
        bottom,
        `${prefix}-arrow-dark`,
        "#1f2937",
      ),
    );
    parts.push(
      svgVectorArrow(
        left,
        bottom,
        left,
        top - 12,
        `${prefix}-arrow-dark`,
        "#1f2937",
      ),
    );
    parts.push(svgText(left - 12, bottom + 5, "0", { anchor: "end", size: 12 }));

    const pathD = polylineFromData(curve, projX, projY);
    parts.push(
      `<path d="${pathD}" fill="none" stroke="#1d4ed8" stroke-width="2.4" stroke-linejoin="round"/>`,
    );

    const probeX = projX(spec.probeRadiusM);
    const probeY = projY(sol.details.fieldStrengthNkg);
    parts.push(
      `<line x1="${fmtCoord(probeX)}" y1="${fmtCoord(probeY)}" x2="${fmtCoord(probeX)}" y2="${fmtCoord(bottom)}" stroke="#b91c1c" stroke-width="1.4" stroke-dasharray="4 3"/>`,
    );
    parts.push(
      `<circle cx="${fmtCoord(probeX)}" cy="${fmtCoord(probeY)}" r="4.5" fill="#b91c1c"/>`,
    );

    const rPlanetLbl = resolveQuantityLabel(
      ctx,
      "planetRadiusM",
      "R",
      spec.planetRadiusM,
      "m",
      true,
    );
    parts.push(svgText(rx, bottom + 20, rPlanetLbl, { size: 12 }));

    if (Math.abs(spec.probeRadiusM - spec.planetRadiusM) > 0.05 * maxR) {
      const rProbeLbl = resolveQuantityLabel(
        ctx,
        "probeRadiusM",
        "r",
        spec.probeRadiusM,
        "m",
        true,
      );
      parts.push(
        svgText(probeX, bottom + 36, rProbeLbl, {
          size: 12,
          fill: "#b91c1c",
        }),
      );
    }

    const gSurfLbl = resolveQuantityLabel(
      ctx,
      "surfaceFieldNkg",
      "g₀",
      sol.details.surfaceFieldNkg,
      "N kg⁻¹",
      false,
    );
    if (!ctx.hiddenSet.has("fieldStrengthNkg")) {
      const gSurfY = projY(sol.details.surfaceFieldNkg);
      parts.push(
        `<line x1="${fmtCoord(left)}" y1="${fmtCoord(gSurfY)}" x2="${fmtCoord(rx)}" y2="${fmtCoord(gSurfY)}" stroke="#9ca3af" stroke-width="1.2" stroke-dasharray="4 3"/>`,
      );
      parts.push(
        svgText(left - 8, gSurfY + 4, gSurfLbl, { anchor: "end", size: 12 }),
      );
    }

    parts.push(
      svgText((left + right) / 2, height - 14, "Radial distance r / m", {
        size: 14,
      }),
    );
    parts.push(
      `<text transform="translate(26 ${fmtCoord((top + bottom) / 2)}) rotate(-90)" text-anchor="middle" font-size="14" fill="#1f2937">g(r) / N kg⁻¹</text>`,
    );
  } else {
    const minV = -1.5 * Math.abs(sol.details.surfacePotentialJkg) * 1.12;
    const projY = (vVal: number) => top + (vVal / minV) * (bottom - top);
    const rx = projX(spec.planetRadiusM);

    parts.push(
      `<rect x="${fmtCoord(left)}" y="${fmtCoord(top)}" width="${fmtCoord(rx - left)}" height="${fmtCoord(bottom - top)}" fill="#f3f4f6"/>`,
    );
    parts.push(
      `<line x1="${fmtCoord(rx)}" y1="${fmtCoord(top)}" x2="${fmtCoord(rx)}" y2="${fmtCoord(bottom)}" stroke="#6b7280" stroke-width="1.4" stroke-dasharray="5 4"/>`,
    );

    parts.push(
      svgVectorArrow(
        left,
        top,
        right + 12,
        top,
        `${prefix}-arrow-dark`,
        "#1f2937",
      ),
    );
    parts.push(
      `<line x1="${fmtCoord(left)}" y1="${fmtCoord(top)}" x2="${fmtCoord(left)}" y2="${fmtCoord(bottom + 10)}" stroke="#1f2937" stroke-width="2"/>`,
    );
    parts.push(svgText(left - 10, top + 5, "0", { anchor: "end", size: 12 }));

    const pathD = polylineFromData(curve, projX, projY);
    parts.push(
      `<path d="${pathD}" fill="none" stroke="#b91c1c" stroke-width="2.4" stroke-linejoin="round"/>`,
    );

    const probeX = projX(spec.probeRadiusM);
    const probeY = projY(sol.details.gravitationalPotentialJkg);
    parts.push(
      `<circle cx="${fmtCoord(probeX)}" cy="${fmtCoord(probeY)}" r="4.5" fill="#1d4ed8"/>`,
    );

    const rPlanetLbl = resolveQuantityLabel(
      ctx,
      "planetRadiusM",
      "R",
      spec.planetRadiusM,
      "m",
      true,
    );
    parts.push(svgText(rx, top - 12, rPlanetLbl, { size: 12 }));
    parts.push(
      svgText((left + right) / 2, height - 16, "Radial distance r / m", {
        size: 14,
      }),
    );
    parts.push(
      `<text transform="translate(26 ${fmtCoord((top + bottom) / 2)}) rotate(-90)" text-anchor="middle" font-size="14" fill="#1f2937">V_g(r) / J kg⁻¹</text>`,
    );
  }

  const mCentralLbl = resolveQuantityLabel(
    ctx,
    "centralMassKg",
    "M",
    spec.centralMassKg,
    "kg",
    true,
  );
  parts.push(svgText(right - 10, top + 20, mCentralLbl, { anchor: "end" }));

  return parts.join("");
}

function renderOrbitSchematicPane(
  spec: CircularOrbitEnergyScenario,
  sol: CircularOrbitEnergySolution,
  ctx: VisibilityContext,
  boxLeft: number,
  boxTop: number,
  boxWidth: number,
  boxHeight: number,
  prefix: string,
): string {
  const parts: string[] = [];
  const cx = boxLeft + boxWidth * 0.5;
  const cy = boxTop + boxHeight * 0.52;
  const maxPaneR = Math.min(boxWidth, boxHeight) * 0.39;
  const hasTransfer = sol.details.transfer !== undefined;
  const r1 = spec.orbitRadiusM;
  const r2 = sol.details.transfer?.targetOrbitRadiusM;
  const outerPhys = r2 !== undefined ? Math.max(r1, r2) : r1;
  const scale = maxPaneR / outerPhys;
  const planetPx = Math.max(16, Math.min(maxPaneR * 0.34, spec.centralRadiusM * scale));
  const r1Px = Math.max(planetPx + 22, r1 * scale);

  parts.push(
    `<circle cx="${fmtCoord(cx)}" cy="${fmtCoord(cy)}" r="${fmtCoord(planetPx)}" fill="#e5e7eb" stroke="#1f2937" stroke-width="2"/>`,
  );
  parts.push(svgText(cx, cy + 4, "M", { size: 12, weight: "bold" }));

  parts.push(
    `<circle cx="${fmtCoord(cx)}" cy="${fmtCoord(cy)}" r="${fmtCoord(r1Px)}" fill="none" stroke="#1d4ed8" stroke-width="1.8" stroke-dasharray="6 4"/>`,
  );

  if (hasTransfer && r2 !== undefined) {
    const r2Px = Math.max(planetPx + 22, r2 * scale);
    parts.push(
      `<circle cx="${fmtCoord(cx)}" cy="${fmtCoord(cy)}" r="${fmtCoord(r2Px)}" fill="none" stroke="#047857" stroke-width="1.8" stroke-dasharray="6 4"/>`,
    );
    const aPx = (r1Px + r2Px) / 2;
    const cOffset = (r2Px - r1Px) / 2;
    const bPx = Math.sqrt(r1Px * r2Px);
    const startX = cx + r1Px;
    const endX = cx - r2Px;
    parts.push(
      `<path d="M ${fmtCoord(startX)} ${fmtCoord(cy)} A ${fmtCoord(aPx)} ${fmtCoord(bPx)} 0 0 0 ${fmtCoord(endX)} ${fmtCoord(cy)}" fill="none" stroke="#b45309" stroke-width="1.8" stroke-dasharray="4 3"/>`,
    );
    void cOffset;
    const r2Lbl = resolveQuantityLabel(
      ctx,
      "targetOrbitRadiusM",
      "r₂",
      r2,
      "m",
      true,
    );
    parts.push(
      svgText(cx, cy + r2Px + 16, r2Lbl, { size: 11, fill: "#047857" }),
    );
  }

  const satX = cx + r1Px;
  const satY = cy;
  parts.push(
    `<circle cx="${fmtCoord(satX)}" cy="${fmtCoord(satY)}" r="5.5" fill="#1f2937"/>`,
  );

  parts.push(
    svgVectorArrow(
      satX,
      satY,
      satX,
      satY - 52,
      `${prefix}-arrow-blue`,
      "#1d4ed8",
    ),
  );
  const vOrbLbl = resolveQuantityLabel(
    ctx,
    "orbitalSpeedMs",
    "v",
    sol.details.orbitalSpeedMs,
    "m s⁻¹",
    false,
  );
  parts.push(
    svgText(satX + 8, satY - 46, vOrbLbl, {
      anchor: "start",
      size: 11,
      fill: "#1d4ed8",
    }),
  );

  parts.push(
    svgVectorArrow(
      satX,
      satY,
      satX - Math.min(44, r1Px - planetPx - 4),
      satY,
      `${prefix}-arrow-red`,
      "#b91c1c",
    ),
  );
  parts.push(
    svgText(satX - 22, satY + 15, "F_g", {
      size: 11,
      fill: "#b91c1c",
    }),
  );

  const r1Lbl = resolveQuantityLabel(
    ctx,
    "orbitRadiusM",
    hasTransfer ? "r₁" : "r",
    r1,
    "m",
    true,
  );
  parts.push(
    svgText(cx, cy - r1Px - 8, r1Lbl, { size: 12, fill: "#1d4ed8" }),
  );

  return parts.join("");
}

function renderOrbitEnergyCurvesPane(
  spec: CircularOrbitEnergyScenario,
  sol: CircularOrbitEnergySolution,
  ctx: VisibilityContext,
  boxLeft: number,
  boxTop: number,
  boxWidth: number,
  boxHeight: number,
  prefix: string,
): string {
  const parts: string[] = [];
  const ekCurve = sol.curves?.kineticEnergy ?? [];
  const epCurve = sol.curves?.potentialEnergy ?? [];
  const etotCurve = sol.curves?.totalEnergy ?? [];

  const left = boxLeft + 58;
  const right = boxLeft + boxWidth - 28;
  const top = boxTop + 34;
  const bottom = boxTop + boxHeight - 48;
  const zeroY = (top + bottom) * 0.42;

  const rMin = ekCurve[0]?.x ?? spec.orbitRadiusM * 0.5;
  const rMax = ekCurve[ekCurve.length - 1]?.x ?? spec.orbitRadiusM * 2;
  const maxAbsE = Math.abs(epCurve[0]?.y ?? 1) * 1.06;

  const projX = (r: number) =>
    left + ((r - rMin) / (rMax - rMin)) * (right - left);
  const projY = (eVal: number) =>
    eVal >= 0
      ? zeroY - (eVal / (maxAbsE * 0.55)) * (zeroY - top)
      : zeroY + (Math.abs(eVal) / maxAbsE) * (bottom - zeroY);

  parts.push(
    svgVectorArrow(
      left,
      zeroY,
      right + 10,
      zeroY,
      `${prefix}-arrow-dark`,
      "#1f2937",
    ),
  );
  parts.push(
    `<line x1="${fmtCoord(left)}" y1="${fmtCoord(top - 8)}" x2="${fmtCoord(left)}" y2="${fmtCoord(bottom + 8)}" stroke="#1f2937" stroke-width="1.8"/>`,
  );
  parts.push(svgText(left - 10, zeroY + 4, "0", { anchor: "end", size: 12 }));

  const r1X = projX(spec.orbitRadiusM);
  parts.push(
    `<line x1="${fmtCoord(r1X)}" y1="${fmtCoord(projY(sol.details.kineticEnergyJ))}" x2="${fmtCoord(r1X)}" y2="${fmtCoord(projY(sol.details.potentialEnergyJ))}" stroke="#9ca3af" stroke-width="1.3" stroke-dasharray="4 3"/>`,
  );

  if (sol.details.transfer !== undefined) {
    const r2X = projX(sol.details.transfer.targetOrbitRadiusM);
    parts.push(
      `<line x1="${fmtCoord(r2X)}" y1="${fmtCoord(projY(sol.details.transfer.targetKineticEnergyJ))}" x2="${fmtCoord(r2X)}" y2="${fmtCoord(projY(sol.details.transfer.targetPotentialEnergyJ))}" stroke="#9ca3af" stroke-width="1.3" stroke-dasharray="4 3"/>`,
    );
  }

  parts.push(
    `<path d="${polylineFromData(ekCurve, projX, projY)}" fill="none" stroke="#1d4ed8" stroke-width="2.2"/>`,
  );
  parts.push(
    `<path d="${polylineFromData(etotCurve, projX, projY)}" fill="none" stroke="#047857" stroke-width="2.2"/>`,
  );
  parts.push(
    `<path d="${polylineFromData(epCurve, projX, projY)}" fill="none" stroke="#b91c1c" stroke-width="2.2" stroke-dasharray="6 3"/>`,
  );

  const lastIdx = Math.max(0, ekCurve.length - 8);
  const ekLbl = resolveQuantityLabel(
    ctx,
    "kineticEnergyJ",
    "E_k",
    sol.details.kineticEnergyJ,
    "J",
    false,
  );
  const etotLbl = resolveQuantityLabel(
    ctx,
    "totalEnergyJ",
    "E_tot",
    sol.details.totalEnergyJ,
    "J",
    false,
  );
  const epLbl = resolveQuantityLabel(
    ctx,
    "potentialEnergyJ",
    "E_p",
    sol.details.potentialEnergyJ,
    "J",
    false,
  );

  parts.push(
    svgText(
      projX(ekCurve[lastIdx].x),
      projY(ekCurve[lastIdx].y) - 8,
      ekLbl,
      { anchor: "end", size: 12, fill: "#1d4ed8", weight: "bold" },
    ),
  );
  parts.push(
    svgText(
      projX(etotCurve[lastIdx].x),
      projY(etotCurve[lastIdx].y) + 15,
      etotLbl,
      { anchor: "end", size: 12, fill: "#047857", weight: "bold" },
    ),
  );
  parts.push(
    svgText(
      projX(epCurve[lastIdx].x),
      projY(epCurve[lastIdx].y) + 16,
      epLbl,
      { anchor: "end", size: 12, fill: "#b91c1c", weight: "bold" },
    ),
  );

  parts.push(
    svgText((left + right) / 2, boxTop + boxHeight - 12, "Orbital radius r", {
      size: 13,
    }),
  );
  parts.push(
    `<text transform="translate(${fmtCoord(boxLeft + 18)} ${fmtCoord((top + bottom) / 2)}) rotate(-90)" text-anchor="middle" font-size="13" fill="#1f2937">Energy E / J</text>`,
  );

  return parts.join("");
}

function renderCircularOrbitEnergy(
  spec: CircularOrbitEnergyScenario,
  sol: CircularOrbitEnergySolution,
  ctx: VisibilityContext,
  width: number,
  height: number,
  prefix: string,
): string {
  const variant = spec.diagramVariant ?? "split-orbit-energy";
  if (variant === "orbit-schematic") {
    return renderOrbitSchematicPane(spec, sol, ctx, 0, 0, width, height, prefix);
  }
  if (variant === "energy-curves") {
    return renderOrbitEnergyCurvesPane(
      spec,
      sol,
      ctx,
      0,
      0,
      width,
      height,
      prefix,
    );
  }
  const splitX = Math.floor(width * 0.44);
  return [
    renderOrbitSchematicPane(spec, sol, ctx, 0, 0, splitX, height, prefix),
    `<line x1="${splitX}" y1="24" x2="${splitX}" y2="${height - 24}" stroke="#e5e7eb" stroke-width="1.5"/>`,
    renderOrbitEnergyCurvesPane(
      spec,
      sol,
      ctx,
      splitX,
      0,
      width - splitX,
      height,
      prefix,
    ),
  ].join("");
}

function renderTwoBodyNullPoint(
  spec: TwoBodyNullPointScenario,
  sol: TwoBodyNullPointSolution,
  ctx: VisibilityContext,
  width: number,
  height: number,
  prefix: string,
): string {
  const parts: string[] = [];
  const left = 88;
  const right = width - 56;
  const schematicY = height * 0.22;
  const plotTop = height * 0.38;
  const plotBottom = height - 54;
  const d = spec.separationM;

  const projX = (xM: number) => left + (xM / d) * (right - left);

  const r1Vis = 20;
  const r2Vis = Math.max(
    11,
    Math.min(18, 20 * Math.pow(spec.secondaryMassKg / spec.primaryMassKg, 0.16)),
  );
  parts.push(
    `<line x1="${fmtCoord(left)}" y1="${fmtCoord(schematicY)}" x2="${fmtCoord(right)}" y2="${fmtCoord(schematicY)}" stroke="#9ca3af" stroke-width="1.3" stroke-dasharray="5 4"/>`,
  );
  parts.push(
    `<circle cx="${fmtCoord(left)}" cy="${fmtCoord(schematicY)}" r="${fmtCoord(r1Vis)}" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2"/>`,
  );
  parts.push(
    `<circle cx="${fmtCoord(right)}" cy="${fmtCoord(schematicY)}" r="${fmtCoord(r2Vis)}" fill="#fef3c7" stroke="#b45309" stroke-width="2"/>`,
  );

  const m1Lbl = resolveQuantityLabel(
    ctx,
    "primaryMassKg",
    spec.primaryLabel ?? "M₁",
    spec.primaryMassKg,
    "kg",
    true,
  );
  const m2Lbl = resolveQuantityLabel(
    ctx,
    "secondaryMassKg",
    spec.secondaryLabel ?? "M₂",
    spec.secondaryMassKg,
    "kg",
    true,
  );
  parts.push(
    svgText(left, schematicY - r1Vis - 10, m1Lbl, {
      size: 12,
      fill: "#1d4ed8",
    }),
  );
  parts.push(
    svgText(right, schematicY - r2Vis - 10, m2Lbl, {
      size: 12,
      fill: "#b45309",
    }),
  );

  const sepLbl = resolveQuantityLabel(
    ctx,
    "separationM",
    "d",
    spec.separationM,
    "m",
    true,
  );
  parts.push(
    svgText((left + right) / 2, schematicY - 26, sepLbl, { size: 12 }),
  );

  const potCurve = sol.curves?.potential ?? [];
  const minPot =
    Math.min(...potCurve.map((pt) => pt.y), sol.details.potentialAtNullPointJkg) *
    1.08;
  const projY = (vVal: number) =>
    plotTop + (vVal / minPot) * (plotBottom - plotTop);

  parts.push(
    svgVectorArrow(
      left,
      plotTop,
      right + 14,
      plotTop,
      `${prefix}-arrow-dark`,
      "#1f2937",
    ),
  );
  parts.push(
    `<line x1="${fmtCoord(left)}" y1="${fmtCoord(plotTop)}" x2="${fmtCoord(left)}" y2="${fmtCoord(plotBottom)}" stroke="#1f2937" stroke-width="1.8"/>`,
  );
  parts.push(svgText(left - 10, plotTop + 4, "0", { anchor: "end", size: 12 }));

  parts.push(
    `<path d="${polylineFromData(potCurve, projX, projY)}" fill="none" stroke="#047857" stroke-width="2.4" stroke-linejoin="round"/>`,
  );

  const nullX = projX(sol.details.nullPointFromPrimaryM);
  const nullY = projY(sol.details.potentialAtNullPointJkg);
  if (!ctx.hiddenSet.has("nullPointFromPrimaryM")) {
    parts.push(
      `<line x1="${fmtCoord(nullX)}" y1="${fmtCoord(schematicY)}" x2="${fmtCoord(nullX)}" y2="${fmtCoord(nullY)}" stroke="#6b7280" stroke-width="1.3" stroke-dasharray="4 3"/>`,
    );
    parts.push(
      `<circle cx="${fmtCoord(nullX)}" cy="${fmtCoord(nullY)}" r="4.2" fill="#047857"/>`,
    );
    const x0Lbl = resolveQuantityLabel(
      ctx,
      "nullPointFromPrimaryM",
      "x₀",
      sol.details.nullPointFromPrimaryM,
      "m",
      false,
    );
    parts.push(
      svgText(nullX, plotTop - 8, x0Lbl, { size: 12, fill: "#047857" }),
    );
  }

  parts.push(
    svgText((left + right) / 2, height - 14, "Distance x from primary center", {
      size: 13,
    }),
  );
  parts.push(
    `<text transform="translate(24 ${fmtCoord((plotTop + plotBottom) / 2)}) rotate(-90)" text-anchor="middle" font-size="13" fill="#1f2937">V_g(x) / J kg⁻¹</text>`,
  );

  return parts.join("");
}

function renderStellarRadiation(
  spec: StellarRadiationScenario,
  sol: StellarRadiationSolution,
  ctx: VisibilityContext,
  width: number,
  height: number,
  prefix: string,
): string {
  const parts: string[] = [];
  const variant = spec.diagramVariant ?? "blackbody-curve";

  if (variant === "inverse-square") {
    const starX = width * 0.2;
    const starY = height * 0.52;
    const detX = width * 0.78;
    const shellR = detX - starX;

    parts.push(
      `<path d="M ${fmtCoord(starX + shellR * Math.cos(-0.48))} ${fmtCoord(starY + shellR * Math.sin(-0.48))} A ${fmtCoord(shellR)} ${fmtCoord(shellR)} 0 0 1 ${fmtCoord(starX + shellR * Math.cos(0.48))} ${fmtCoord(starY + shellR * Math.sin(0.48))}" fill="none" stroke="#9ca3af" stroke-width="1.6" stroke-dasharray="6 4"/>`,
    );
    for (const ang of [-0.32, -0.16, 0, 0.16, 0.32]) {
      parts.push(
        svgVectorArrow(
          starX + 30 * Math.cos(ang),
          starY + 30 * Math.sin(ang),
          starX + (shellR - 10) * Math.cos(ang),
          starY + (shellR - 10) * Math.sin(ang),
          `${prefix}-arrow-amber`,
          "#d97706",
          false,
          1.5,
        ),
      );
    }

    parts.push(
      `<circle cx="${fmtCoord(starX)}" cy="${fmtCoord(starY)}" r="26" fill="#fef3c7" stroke="#d97706" stroke-width="2.4"/>`,
    );
    parts.push(
      `<rect x="${fmtCoord(detX - 6)}" y="${fmtCoord(starY - 22)}" width="12" height="44" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2"/>`,
    );

    const tLbl = resolveQuantityLabel(
      ctx,
      "surfaceTempK",
      "T",
      spec.surfaceTempK,
      "K",
      true,
    );
    const rLbl = resolveQuantityLabel(
      ctx,
      "stellarRadiusM",
      "R",
      spec.stellarRadiusM,
      "m",
      true,
    );
    const lLbl = resolveQuantityLabel(
      ctx,
      "luminosityW",
      "L",
      sol.details.luminosityW,
      "W",
      false,
    );
    const dLbl = resolveQuantityLabel(
      ctx,
      "distanceM",
      "d",
      spec.distanceM,
      "m",
      true,
    );
    const bLbl = resolveQuantityLabel(
      ctx,
      "apparentBrightnessWm2",
      "b",
      sol.details.apparentBrightnessWm2,
      "W m⁻²",
      false,
    );

    parts.push(svgText(starX, starY - 42, tLbl, { size: 13 }));
    parts.push(svgText(starX, starY + 48, rLbl, { size: 13 }));
    parts.push(svgText(starX, starY + 68, lLbl, { size: 13, fill: "#b45309" }));
    parts.push(svgText((starX + detX) / 2, starY + 26, dLbl, { size: 13 }));
    parts.push(
      svgText(detX, starY - 34, bLbl, {
        size: 13,
        fill: "#1d4ed8",
        weight: "bold",
      }),
    );
    return parts.join("");
  }

  const primary = sol.curves?.primarySpectrum ?? [];
  const comp = sol.curves?.comparisonSpectrum ?? [];
  const left = 84;
  const right = width - 48;
  const top = 48;
  const bottom = height - 62;

  const xMin = primary[0]?.x ?? 100;
  const xMax = primary[primary.length - 1]?.x ?? 2000;
  const yMax =
    Math.max(
      1,
      ...primary.map((p) => p.y),
      ...comp.map((p) => p.y),
    ) * 1.12;

  const projX = (lamNm: number) =>
    left + ((lamNm - xMin) / (xMax - xMin)) * (right - left);
  const projY = (intensity: number) =>
    bottom - (intensity / yMax) * (bottom - top);

  parts.push(
    svgVectorArrow(
      left,
      bottom,
      right + 12,
      bottom,
      `${prefix}-arrow-dark`,
      "#1f2937",
    ),
  );
  parts.push(
    svgVectorArrow(
      left,
      bottom,
      left,
      top - 12,
      `${prefix}-arrow-dark`,
      "#1f2937",
    ),
  );

  parts.push(
    `<path d="${polylineFromData(primary, projX, projY)}" fill="none" stroke="#1d4ed8" stroke-width="2.4" stroke-linejoin="round"/>`,
  );
  if (comp.length > 0) {
    parts.push(
      `<path d="${polylineFromData(comp, projX, projY)}" fill="none" stroke="#b91c1c" stroke-width="2" stroke-dasharray="6 4" stroke-linejoin="round"/>`,
    );
  }

  const peakX = projX(sol.details.peakWavelengthNm);
  const peakY = projY(1);
  parts.push(
    `<line x1="${fmtCoord(peakX)}" y1="${fmtCoord(peakY)}" x2="${fmtCoord(peakX)}" y2="${fmtCoord(bottom)}" stroke="#1d4ed8" stroke-width="1.3" stroke-dasharray="4 3"/>`,
  );

  const lamLbl = resolveQuantityLabel(
    ctx,
    "peakWavelengthNm",
    "λ_max",
    sol.details.peakWavelengthNm,
    "nm",
    false,
  );
  parts.push(
    svgText(peakX, bottom + 20, lamLbl, { size: 12, fill: "#1d4ed8" }),
  );

  if (canShowNumeric(ctx, "peakWavelengthNm", false)) {
    for (let k = 1; k <= 4; k += 1) {
      const tickVal = Math.round((xMin + ((xMax - xMin) * k) / 4) / 50) * 50;
      if (
        tickVal > xMin &&
        tickVal < xMax &&
        Math.abs(tickVal - sol.details.peakWavelengthNm) > 0.08 * (xMax - xMin)
      ) {
        const tx = projX(tickVal);
        parts.push(
          `<line x1="${fmtCoord(tx)}" y1="${fmtCoord(bottom - 4)}" x2="${fmtCoord(tx)}" y2="${fmtCoord(bottom + 4)}" stroke="#374151"/>`,
        );
        parts.push(
          svgText(tx, bottom + 20, String(tickVal), {
            size: 11,
            fill: "#4b5563",
          }),
        );
      }
    }
  }

  const tLbl = resolveQuantityLabel(
    ctx,
    "surfaceTempK",
    "T",
    spec.surfaceTempK,
    "K",
    true,
  );
  parts.push(
    svgText(Math.min(right - 20, peakX + 18), peakY - 8, tLbl, {
      anchor: "start",
      size: 13,
      fill: "#1d4ed8",
      weight: "bold",
    }),
  );

  parts.push(
    svgText((left + right) / 2, height - 14, "Wavelength λ / nm", { size: 14 }),
  );
  parts.push(
    `<text transform="translate(26 ${fmtCoord((top + bottom) / 2)}) rotate(-90)" text-anchor="middle" font-size="14" fill="#1f2937">Relative spectral intensity</text>`,
  );

  return parts.join("");
}

function renderHrDiagram(
  spec: HrDiagramScenario,
  sol: HrDiagramSolution,
  ctx: VisibilityContext,
  width: number,
  height: number,
): string {
  const parts: string[] = [];
  const left = 90;
  const right = width - 44;
  const top = 52;
  const bottom = height - 64;

  const logTMax = Math.log10(40000);
  const logTMin = Math.log10(2500);
  const logLMin = -4;
  const logLMax = 6;

  const projX = (tempK: number) => {
    const clamped = Math.min(40000, Math.max(2500, tempK));
    return (
      left +
      ((logTMax - Math.log10(clamped)) / (logTMax - logTMin)) * (right - left)
    );
  };
  const projY = (lumSolar: number) => {
    const logL = Math.min(logLMax, Math.max(logLMin, Math.log10(lumSolar)));
    return bottom - ((logL - logLMin) / (logLMax - logLMin)) * (bottom - top);
  };

  parts.push(
    `<rect x="${fmtCoord(left)}" y="${fmtCoord(top)}" width="${fmtCoord(right - left)}" height="${fmtCoord(bottom - top)}" fill="#ffffff" stroke="#1f2937" stroke-width="1.8"/>`,
  );

  if (
    spec.showRadiusIsolines !== false &&
    canShowNumeric(ctx, "radiusSolar", true)
  ) {
    for (const [rSol, rText] of [
      [0.01, "0.01 R☉"],
      [1, "1 R☉"],
      [100, "100 R☉"],
    ] as const) {
      const pts: Point2D[] = [];
      for (let i = 0; i <= 30; i += 1) {
        const t = 2600 + ((38000 - 2600) * i) / 30;
        const l = rSol ** 2 * (t / 5772) ** 4;
        if (l >= 1e-4 && l <= 1e6) {
          pts.push({ x: t, y: l });
        }
      }
      if (pts.length >= 2) {
        parts.push(
          `<path d="${polylineFromData(pts, projX, projY)}" fill="none" stroke="#d1d5db" stroke-width="1.2" stroke-dasharray="4 4"/>`,
        );
        const mid = pts[Math.floor(pts.length / 2)];
        parts.push(
          svgText(projX(mid.x) + 6, projY(mid.y) - 4, rText, {
            anchor: "start",
            size: 10,
            fill: "#6b7280",
          }),
        );
      }
    }
  }

  parts.push(
    `<path d="M ${fmtCoord(projX(32000))} ${fmtCoord(projY(6e4))} Q ${fmtCoord(projX(7500))} ${fmtCoord(projY(15))} ${fmtCoord(projX(3000))} ${fmtCoord(projY(3e-3))}" fill="none" stroke="#dbeafe" stroke-width="22" stroke-linecap="round"/>`,
  );
  parts.push(
    `<ellipse cx="${fmtCoord(projX(4200))}" cy="${fmtCoord(projY(150))}" rx="54" ry="26" fill="#fef3c7" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="4 3"/>`,
  );
  parts.push(
    `<ellipse cx="${fmtCoord(projX(6500))}" cy="${fmtCoord(projY(8e4))}" rx="92" ry="20" fill="#fee2e2" stroke="#ef4444" stroke-width="1.2" stroke-dasharray="4 3"/>`,
  );
  parts.push(
    `<ellipse cx="${fmtCoord(projX(14000))}" cy="${fmtCoord(projY(4e-3))}" rx="56" ry="18" fill="#f3f4f6" stroke="#6b7280" stroke-width="1.2" stroke-dasharray="4 3"/>`,
  );

  const maskRegions =
    spec.hideRegionNames === true || ctx.hiddenSet.has("region");
  parts.push(
    svgText(
      projX(9200),
      projY(30) - 10,
      maskRegions ? "Region I" : "Main Sequence",
      { size: 12, fill: "#1e40af", weight: "bold" },
    ),
  );
  parts.push(
    svgText(
      projX(4200),
      projY(150) + 4,
      maskRegions ? "Region II" : "Red Giants",
      { size: 11, fill: "#92400e", weight: "bold" },
    ),
  );
  parts.push(
    svgText(
      projX(6500),
      projY(8e4) + 4,
      maskRegions ? "Region III" : "Supergiants",
      { size: 11, fill: "#991b1b", weight: "bold" },
    ),
  );
  parts.push(
    svgText(
      projX(14000),
      projY(4e-3) + 4,
      maskRegions ? "Region IV" : "White Dwarfs",
      { size: 11, fill: "#374151", weight: "bold" },
    ),
  );

  if (spec.showEvolutionTrack) {
    const track: Point2D[] = [
      { x: 5800, y: 1 },
      { x: 4200, y: 200 },
      { x: 22000, y: 500 },
      { x: 14000, y: 5e-3 },
    ];
    parts.push(
      `<path d="${polylineFromData(track, projX, projY)}" fill="none" stroke="#7c3aed" stroke-width="1.8" stroke-dasharray="5 3"/>`,
    );
  }

  for (const star of sol.details.stars) {
    const sx = projX(star.surfaceTempK);
    const sy = projY(star.luminositySolar);
    parts.push(
      `<circle cx="${fmtCoord(sx)}" cy="${fmtCoord(sy)}" r="5.5" fill="#111827" stroke="#ffffff" stroke-width="1.5"/>`,
    );
    parts.push(
      svgText(sx + 9, sy - 7, star.label, {
        anchor: "start",
        size: 12,
        weight: "bold",
      }),
    );
    ctx.emittedLabels.push(star.label);
  }

  if (canShowNumeric(ctx, "surfaceTempK", true)) {
    for (const tTick of [40000, 20000, 10000, 5000, 2500]) {
      const tx = projX(tTick);
      parts.push(
        `<line x1="${fmtCoord(tx)}" y1="${fmtCoord(bottom)}" x2="${fmtCoord(tx)}" y2="${fmtCoord(bottom + 6)}" stroke="#1f2937"/>`,
      );
      parts.push(svgText(tx, bottom + 20, String(tTick), { size: 11 }));
    }
  }

  if (canShowNumeric(ctx, "luminositySolar", true)) {
    for (const exp of [-4, -2, 0, 2, 4, 6]) {
      const ly = projY(10 ** exp);
      const sup = [...String(exp)].map((c) => SUPERSCRIPT_DIGITS[c] ?? c).join("");
      const txt = exp === 0 ? "1" : `10${sup}`;
      parts.push(
        `<line x1="${fmtCoord(left - 6)}" y1="${fmtCoord(ly)}" x2="${fmtCoord(left)}" y2="${fmtCoord(ly)}" stroke="#1f2937"/>`,
      );
      parts.push(svgText(left - 10, ly + 4, txt, { anchor: "end", size: 11 }));
    }
  }

  if (!ctx.hiddenSet.has("spectralClass")) {
    for (const [cls, temp] of [
      ["O", 34000],
      ["B", 18000],
      ["A", 8600],
      ["F", 6700],
      ["G", 5600],
      ["K", 4400],
      ["M", 3100],
    ] as const) {
      parts.push(
        svgText(projX(temp), top - 10, cls, {
          size: 12,
          weight: "bold",
          fill: "#374151",
        }),
      );
    }
  }

  parts.push(
    svgText(
      (left + right) / 2,
      height - 14,
      "Surface temperature T / K (decreasing →)",
      { size: 13 },
    ),
  );
  parts.push(
    `<text transform="translate(24 ${fmtCoord((top + bottom) / 2)}) rotate(-90)" text-anchor="middle" font-size="13" fill="#1f2937">Luminosity L / L☉</text>`,
  );

  return parts.join("");
}

function renderStellarParallax(
  spec: StellarParallaxScenario,
  sol: StellarParallaxSolution,
  ctx: VisibilityContext,
  width: number,
  height: number,
  prefix: string,
): string {
  const parts: string[] = [];
  const sunX = width * 0.18;
  const sunY = height * 0.5;
  const orbitRy = Math.min(height * 0.28, 108);
  const orbitRx = orbitRy * 0.42;
  const starX = width * 0.68;
  const starY = sunY;
  const bgX = width * 0.92;

  parts.push(
    `<ellipse cx="${fmtCoord(sunX)}" cy="${fmtCoord(sunY)}" rx="${fmtCoord(orbitRx)}" ry="${fmtCoord(orbitRy)}" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="5 4"/>`,
  );
  parts.push(
    `<circle cx="${fmtCoord(sunX)}" cy="${fmtCoord(sunY)}" r="13" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>`,
  );
  parts.push(svgText(sunX - 24, sunY + 4, "Sun", { anchor: "end", size: 12 }));

  const earthTopY = sunY - orbitRy;
  const earthBotY = sunY + orbitRy;
  parts.push(
    `<circle cx="${fmtCoord(sunX)}" cy="${fmtCoord(earthTopY)}" r="6.5" fill="#dbeafe" stroke="#1d4ed8" stroke-width="1.8"/>`,
  );
  parts.push(
    `<circle cx="${fmtCoord(sunX)}" cy="${fmtCoord(earthBotY)}" r="6.5" fill="#dbeafe" stroke="#1d4ed8" stroke-width="1.8"/>`,
  );
  parts.push(svgText(sunX, earthTopY - 12, "Earth (Jan)", { size: 11 }));
  parts.push(svgText(sunX, earthBotY + 20, "Earth (Jul)", { size: 11 }));

  parts.push(
    svgVectorArrow(
      sunX,
      sunY,
      sunX,
      earthTopY + 8,
      `${prefix}-arrow-dark`,
      "#374151",
      false,
      1.5,
    ),
  );
  const baseAu = spec.baselineAu ?? 1;
  const baseLbl = resolveQuantityLabel(
    ctx,
    "baselineAu",
    "b",
    baseAu,
    "AU",
    true,
  );
  parts.push(
    svgText(sunX - 10, (sunY + earthTopY) / 2 + 4, baseLbl, {
      anchor: "end",
      size: 12,
    }),
  );

  parts.push(
    `<line x1="${fmtCoord(sunX)}" y1="${fmtCoord(sunY)}" x2="${fmtCoord(bgX)}" y2="${fmtCoord(sunY)}" stroke="#6b7280" stroke-width="1.3" stroke-dasharray="5 4"/>`,
  );
  const extTopY =
    starY + ((bgX - starX) / (starX - sunX)) * (starY - earthTopY);
  const extBotY =
    starY + ((bgX - starX) / (starX - sunX)) * (starY - earthBotY);
  parts.push(
    `<line x1="${fmtCoord(sunX)}" y1="${fmtCoord(earthTopY)}" x2="${fmtCoord(bgX)}" y2="${fmtCoord(extTopY)}" stroke="#1d4ed8" stroke-width="1.5"/>`,
  );
  parts.push(
    `<line x1="${fmtCoord(sunX)}" y1="${fmtCoord(earthBotY)}" x2="${fmtCoord(bgX)}" y2="${fmtCoord(extBotY)}" stroke="#1d4ed8" stroke-width="1.5" stroke-dasharray="5 3"/>`,
  );

  for (const by of [0.16, 0.28, 0.42, 0.58, 0.72, 0.84]) {
    parts.push(
      `<circle cx="${fmtCoord(bgX)}" cy="${fmtCoord(height * by)}" r="2.2" fill="#6b7280"/>`,
    );
  }
  parts.push(
    svgText(bgX - 6, height * 0.11, "Distant stars", {
      anchor: "end",
      size: 11,
      fill: "#4b5563",
    }),
  );

  parts.push(
    `<circle cx="${fmtCoord(starX)}" cy="${fmtCoord(starY)}" r="7" fill="#f59e0b" stroke="#92400e" stroke-width="1.8"/>`,
  );

  const halfAngle = Math.atan2(sunY - earthTopY, starX - sunX);
  parts.push(
    svgAngleArc(starX, starY, 58, Math.PI, Math.PI + halfAngle, "#b91c1c"),
  );
  const pLbl = resolveQuantityLabel(
    ctx,
    "parallaxArcsec",
    "p",
    spec.parallaxArcsec,
    "arcsec",
    true,
  );
  parts.push(
    svgText(starX - 72, starY - 14, pLbl, {
      anchor: "end",
      size: 12,
      fill: "#b91c1c",
      weight: "bold",
    }),
  );

  const dLbl = resolveQuantityLabel(
    ctx,
    "distancePc",
    "d",
    sol.details.distancePc,
    "pc",
    false,
  );
  parts.push(
    svgText((sunX + starX) / 2, sunY + 20, dLbl, {
      size: 13,
      fill: "#1f2937",
      weight: "bold",
    }),
  );
  parts.push(
    svgText(width * 0.5, height - 14, "Diagram not to scale", {
      size: 11,
      fill: "#6b7280",
      italic: true,
    }),
  );

  return parts.join("");
}

function renderCosmologicalRedshift(
  spec: CosmologicalRedshiftScenario,
  sol: CosmologicalRedshiftSolution,
  ctx: VisibilityContext,
  width: number,
  height: number,
  prefix: string,
): string {
  const parts: string[] = [];
  const variant = spec.diagramVariant ?? "spectral-shift";

  if (variant === "hubble-plot") {
    const left = 92;
    const right = width - 48;
    const top = 48;
    const bottom = height - 62;
    const line = sol.curves?.hubbleLine ?? [];
    const maxD = line[1]?.x ?? Math.max(100, sol.details.distanceMpc * 1.4);
    const maxV = line[1]?.y ?? maxD * 70;
    const projX = (dMpc: number) => left + (dMpc / maxD) * (right - left);
    const projY = (vKms: number) => bottom - (vKms / maxV) * (bottom - top);

    parts.push(
      svgVectorArrow(
        left,
        bottom,
        right + 12,
        bottom,
        `${prefix}-arrow-dark`,
        "#1f2937",
      ),
    );
    parts.push(
      svgVectorArrow(
        left,
        bottom,
        left,
        top - 12,
        `${prefix}-arrow-dark`,
        "#1f2937",
      ),
    );
    parts.push(svgText(left - 10, bottom + 5, "0", { anchor: "end", size: 12 }));

    parts.push(
      `<path d="${polylineFromData(line, projX, projY)}" fill="none" stroke="#1d4ed8" stroke-width="2.2"/>`,
    );

    const gx = projX(sol.details.distanceMpc);
    const gy = projY(sol.details.recessionSpeedKmS);
    parts.push(
      `<line x1="${fmtCoord(gx)}" y1="${fmtCoord(gy)}" x2="${fmtCoord(gx)}" y2="${fmtCoord(bottom)}" stroke="#9ca3af" stroke-width="1.3" stroke-dasharray="4 3"/>`,
    );
    parts.push(
      `<line x1="${fmtCoord(left)}" y1="${fmtCoord(gy)}" x2="${fmtCoord(gx)}" y2="${fmtCoord(gy)}" stroke="#9ca3af" stroke-width="1.3" stroke-dasharray="4 3"/>`,
    );
    parts.push(
      `<circle cx="${fmtCoord(gx)}" cy="${fmtCoord(gy)}" r="5" fill="#b91c1c"/>`,
    );

    const dLbl = resolveQuantityLabel(
      ctx,
      "distanceMpc",
      "d",
      sol.details.distanceMpc,
      "Mpc",
      false,
    );
    const vLbl = resolveQuantityLabel(
      ctx,
      "recessionSpeedKmS",
      "v",
      sol.details.recessionSpeedKmS,
      "km s⁻¹",
      false,
    );
    const h0Val = spec.hubbleConstantKmSMpc ?? DEFAULT_HUBBLE_CONSTANT_KMS_MPC;
    const h0Lbl = resolveQuantityLabel(
      ctx,
      "hubbleConstantKmSMpc",
      "H₀",
      h0Val,
      "km s⁻¹ Mpc⁻¹",
      true,
    );

    parts.push(svgText(gx, bottom + 20, dLbl, { size: 12, fill: "#b91c1c" }));
    parts.push(
      svgText(left - 10, gy + 4, vLbl, {
        anchor: "end",
        size: 12,
        fill: "#b91c1c",
      }),
    );
    parts.push(
      svgText(right - 12, top + 24, h0Lbl, {
        anchor: "end",
        size: 13,
        fill: "#1d4ed8",
      }),
    );

    parts.push(
      svgText((left + right) / 2, height - 14, "Distance d / Mpc", { size: 14 }),
    );
    parts.push(
      `<text transform="translate(26 ${fmtCoord((top + bottom) / 2)}) rotate(-90)" text-anchor="middle" font-size="14" fill="#1f2937">Recession speed v / km s⁻¹</text>`,
    );
    return parts.join("");
  }

  const left = 84;
  const right = width - 48;
  const bandH = 58;
  const refTop = height * 0.22;
  const obsTop = height * 0.56;

  const lam0 = sol.details.restWavelengthNm;
  const lamObs = sol.details.observedWavelengthNm;
  const span = Math.max(lamObs - lam0, 0.18 * lam0);
  const minLam = Math.max(50, lam0 - 0.9 * span);
  const maxLam = lamObs + 0.7 * span;
  const projX = (lamNm: number) =>
    left + ((lamNm - minLam) / (maxLam - minLam)) * (right - left);

  parts.push(
    `<rect x="${fmtCoord(left)}" y="${fmtCoord(refTop)}" width="${fmtCoord(right - left)}" height="${bandH}" fill="#f3f4f6" stroke="#1f2937" stroke-width="1.8"/>`,
  );
  parts.push(
    `<rect x="${fmtCoord(left)}" y="${fmtCoord(obsTop)}" width="${fmtCoord(right - left)}" height="${bandH}" fill="#f3f4f6" stroke="#1f2937" stroke-width="1.8"/>`,
  );

  parts.push(
    svgText(left, refTop - 10, "Laboratory reference spectrum (at rest)", {
      anchor: "start",
      size: 13,
      weight: "bold",
    }),
  );
  parts.push(
    svgText(left, obsTop - 10, "Distant galaxy spectrum (redshifted)", {
      anchor: "start",
      size: 13,
      weight: "bold",
    }),
  );

  const companionMultipliers = [0.84, 1.0];
  for (const mult of companionMultipliers) {
    const restLine = lam0 * mult;
    const obsLine = restLine * (1 + sol.details.redshiftZ);
    const isPrimary = mult === 1.0;
    if (restLine > minLam && restLine < maxLam) {
      const rx = projX(restLine);
      parts.push(
        `<line x1="${fmtCoord(rx)}" y1="${fmtCoord(refTop)}" x2="${fmtCoord(rx)}" y2="${fmtCoord(refTop + bandH)}" stroke="${isPrimary ? "#1d4ed8" : "#6b7280"}" stroke-width="${isPrimary ? 3.2 : 1.8}"/>`,
      );
    }
    if (obsLine > minLam && obsLine < maxLam) {
      const ox = projX(obsLine);
      parts.push(
        `<line x1="${fmtCoord(ox)}" y1="${fmtCoord(obsTop)}" x2="${fmtCoord(ox)}" y2="${fmtCoord(obsTop + bandH)}" stroke="${isPrimary ? "#b91c1c" : "#6b7280"}" stroke-width="${isPrimary ? 3.2 : 1.8}"/>`,
      );
    }
  }

  const x0 = projX(lam0);
  const xObs = projX(lamObs);
  const midY = (refTop + bandH + obsTop) / 2;
  parts.push(
    `<line x1="${fmtCoord(x0)}" y1="${fmtCoord(refTop + bandH)}" x2="${fmtCoord(x0)}" y2="${fmtCoord(obsTop)}" stroke="#9ca3af" stroke-width="1.2" stroke-dasharray="4 3"/>`,
  );
  parts.push(
    svgVectorArrow(
      x0,
      midY,
      xObs,
      midY,
      `${prefix}-arrow-red`,
      "#b91c1c",
      false,
      1.8,
    ),
  );

  const lam0Lbl = resolveQuantityLabel(
    ctx,
    "restWavelengthNm",
    "λ₀",
    lam0,
    "nm",
    true,
  );
  const lamObsLbl = resolveQuantityLabel(
    ctx,
    "observedWavelengthNm",
    "λ_obs",
    lamObs,
    "nm",
    true,
  );
  const dLamLbl = resolveQuantityLabel(
    ctx,
    "deltaWavelengthNm",
    "Δλ",
    sol.details.deltaWavelengthNm,
    "nm",
    false,
  );

  parts.push(
    svgText(x0, refTop + bandH + 16, lam0Lbl, {
      size: 12,
      fill: "#1d4ed8",
      weight: "bold",
    }),
  );
  parts.push(
    svgText(xObs, obsTop + bandH + 20, lamObsLbl, {
      size: 12,
      fill: "#b91c1c",
      weight: "bold",
    }),
  );
  parts.push(
    svgText((x0 + xObs) / 2, midY - 7, dLamLbl, {
      size: 12,
      fill: "#b91c1c",
    }),
  );

  parts.push(
    svgText(
      (left + right) / 2,
      height - 14,
      "Increasing wavelength λ →",
      { size: 13 },
    ),
  );

  return parts.join("");
}

const SCENARIO_TITLES: Readonly<Record<GravAstroScenario["kind"], string>> = {
  "conical-pendulum": "Conical pendulum circular motion diagram",
  "flat-curve": "Flat circular road curve diagram",
  "banked-curve": "Banked circular road curve force diagram",
  "vertical-circle": "Vertical circular motion diagram",
  "planetary-field-potential": "Planetary gravitational field and potential diagram",
  "circular-orbit-energy": "Orbital mechanics and energy profile diagram",
  "two-body-null-point": "Two-body collinear gravitational potential diagram",
  "stellar-radiation": "Stellar radiation and Wien-Stefan-Boltzmann diagram",
  "hr-diagram": "Hertzsprung-Russell stellar diagram",
  "stellar-parallax": "Stellar parallax geometry diagram",
  "cosmological-redshift": "Cosmological redshift and Hubble law diagram",
};

export function renderGravAstroSvg(
  spec: GravAstroScenario,
  options: GravAstroRenderOptions = {},
): string {
  const width = options.width ?? 720;
  const height = options.height ?? 460;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 320 ||
    width > 1800 ||
    height < 240 ||
    height > 1400
  ) {
    throw new Error("Invalid grav-astro SVG dimensions");
  }

  const ctx = buildVisibilityContext(spec, options);
  const solution = solveGravAstroScenario(spec);
  const prefix = sanitizeId(spec.id ?? `ga-${spec.kind}`);
  const safeTitle = SCENARIO_TITLES[spec.kind];

  let bodyMarkup: string;
  switch (spec.kind) {
    case "conical-pendulum":
      bodyMarkup = renderConicalPendulum(
        spec,
        solution as ConicalPendulumSolution,
        ctx,
        width,
        height,
        prefix,
      );
      break;
    case "flat-curve":
      bodyMarkup = renderFlatCurve(
        spec,
        solution as FlatCurveSolution,
        ctx,
        width,
        height,
        prefix,
      );
      break;
    case "banked-curve":
      bodyMarkup = renderBankedCurve(
        spec,
        solution as BankedCurveSolution,
        ctx,
        width,
        height,
        prefix,
      );
      break;
    case "vertical-circle":
      bodyMarkup = renderVerticalCircle(
        spec,
        solution as VerticalCircleSolution,
        ctx,
        width,
        height,
        prefix,
      );
      break;
    case "planetary-field-potential":
      bodyMarkup = renderPlanetaryFieldPotential(
        spec,
        solution as PlanetaryFieldPotentialSolution,
        ctx,
        width,
        height,
        prefix,
      );
      break;
    case "circular-orbit-energy":
      bodyMarkup = renderCircularOrbitEnergy(
        spec,
        solution as CircularOrbitEnergySolution,
        ctx,
        width,
        height,
        prefix,
      );
      break;
    case "two-body-null-point":
      bodyMarkup = renderTwoBodyNullPoint(
        spec,
        solution as TwoBodyNullPointSolution,
        ctx,
        width,
        height,
        prefix,
      );
      break;
    case "stellar-radiation":
      bodyMarkup = renderStellarRadiation(
        spec,
        solution as StellarRadiationSolution,
        ctx,
        width,
        height,
        prefix,
      );
      break;
    case "hr-diagram":
      bodyMarkup = renderHrDiagram(
        spec,
        solution as HrDiagramSolution,
        ctx,
        width,
        height,
      );
      break;
    case "stellar-parallax":
      bodyMarkup = renderStellarParallax(
        spec,
        solution as StellarParallaxSolution,
        ctx,
        width,
        height,
        prefix,
      );
      break;
    case "cosmological-redshift":
      bodyMarkup = renderCosmologicalRedshift(
        spec,
        solution as CosmologicalRedshiftSolution,
        ctx,
        width,
        height,
        prefix,
      );
      break;
    default: {
      const exhaustive: never = spec;
      throw new Error(`Unsupported grav-astro scenario: ${JSON.stringify(exhaustive)}`);
    }
  }

  const descContent = [...new Set(ctx.emittedLabels)].join("; ");
  const defs = [
    ["dark", "#1f2937"],
    ["blue", "#1d4ed8"],
    ["red", "#b91c1c"],
    ["green", "#047857"],
    ["amber", "#b45309"],
  ]
    .map(
      ([name, color]) =>
        `<marker id="${prefix}-arrow-${name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(safeTitle)}"><title>${escapeXml(safeTitle)}</title><desc>${escapeXml(descContent)}</desc><defs>${defs}</defs><rect width="${width}" height="${height}" fill="#ffffff"/><g font-family="Arial, sans-serif">${bodyMarkup}</g></svg>`;
}
