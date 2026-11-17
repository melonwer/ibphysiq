import { Point2D } from "../types";
import {
  MultiLayerSlabSolution,
  MultiLayerSlabSpec,
  OpticalFiberSolution,
  OpticalFiberSpec,
  PlanarRefractionSolution,
  PlanarRefractionSpec,
  ThinLensSolution,
  ThinLensSpec,
} from "./types";
import {
  escapeXml,
  formatCoord,
  formatMetric,
  toSubscript,
  VisibilityController,
} from "./visibility";

export interface RenderedSvgBody {
  title: string;
  desc: string;
  ariaLabel: string;
  elements: string[];
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function drawRaySegment(
  p1: Point2D,
  p2: Point2D,
  options: {
    stroke?: string;
    strokeWidth?: number;
    dashed?: boolean;
    dotted?: boolean;
    arrowAt?: number | null;
  } = {},
): string {
  const stroke = options.stroke ?? "#15191d";
  const strokeWidth = options.strokeWidth ?? 2;
  const dashAttr = options.dashed
    ? ' stroke-dasharray="6 4"'
    : options.dotted
      ? ' stroke-dasharray="2 4"'
      : "";
  const line = `<line x1="${formatCoord(p1.x)}" y1="${formatCoord(p1.y)}" x2="${formatCoord(p2.x)}" y2="${formatCoord(p2.y)}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round"${dashAttr}/>`;

  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const arrowFraction = options.arrowAt === undefined ? 0.56 : options.arrowAt;
  if (arrowFraction === null || len < 22) {
    return line;
  }

  const mx = p1.x + (p2.x - p1.x) * arrowFraction;
  const my = p1.y + (p2.y - p1.y) * arrowFraction;
  const ux = (p2.x - p1.x) / len;
  const uy = (p2.y - p1.y) / len;
  const nx = -uy;
  const ny = ux;
  const headLen = 8.5;
  const halfWidth = 4.2;

  const tipX = mx + ux * (headLen * 0.45);
  const tipY = my + uy * (headLen * 0.45);
  const baseX = mx - ux * (headLen * 0.55);
  const baseY = my - uy * (headLen * 0.55);
  const leftX = baseX + nx * halfWidth;
  const leftY = baseY + ny * halfWidth;
  const rightX = baseX - nx * halfWidth;
  const rightY = baseY - ny * halfWidth;

  const arrow = `<polygon points="${formatCoord(tipX)},${formatCoord(tipY)} ${formatCoord(leftX)},${formatCoord(leftY)} ${formatCoord(rightX)},${formatCoord(rightY)}" fill="${stroke}"/>`;
  return `${line}${arrow}`;
}

function drawAngleArc(
  cx: number,
  cy: number,
  radius: number,
  screenAngle1Rad: number,
  screenAngle2Rad: number,
  label: string | null,
  stroke = "#475569",
): string {
  const delta = Math.atan2(
    Math.sin(screenAngle2Rad - screenAngle1Rad),
    Math.cos(screenAngle2Rad - screenAngle1Rad),
  );
  if (Math.abs(delta) < degToRad(1.5)) {
    return "";
  }
  const x1 = cx + radius * Math.cos(screenAngle1Rad);
  const y1 = cy + radius * Math.sin(screenAngle1Rad);
  const x2 = cx + radius * Math.cos(screenAngle2Rad);
  const y2 = cy + radius * Math.sin(screenAngle2Rad);
  const sweep = delta >= 0 ? 1 : 0;
  const arc = `<path d="M ${formatCoord(x1)} ${formatCoord(y1)} A ${formatCoord(radius)} ${formatCoord(radius)} 0 0 ${sweep} ${formatCoord(x2)} ${formatCoord(y2)}" fill="none" stroke="${stroke}" stroke-width="1.4"/>`;

  if (!label) return arc;
  const mid = screenAngle1Rad + delta / 2;
  const labelRadius = radius + 16;
  const lx = cx + labelRadius * Math.cos(mid);
  const ly = cy + labelRadius * Math.sin(mid) + 4;
  return `${arc}<text x="${formatCoord(lx)}" y="${formatCoord(ly)}" text-anchor="middle" font-size="12.5" fill="#1e293b">${escapeXml(label)}</text>`;
}

export function renderPlanarRefractionBody(
  spec: PlanarRefractionSpec,
  sol: PlanarRefractionSolution,
  vis: VisibilityController,
  width: number,
  height: number,
): RenderedSvgBody {
  const elements: string[] = [];
  const padX = 48;
  const padY = 36;
  const boxW = width - 2 * padX;
  const boxH = height - 2 * padY - 18;
  const cx = padX + boxW * 0.5;
  const cy = padY + boxH * 0.5;

  const denserTop = sol.n1 > sol.n2;
  const topFill = denserTop ? "#eaf2fb" : "#f8fafc";
  const bottomFill = denserTop ? "#f8fafc" : "#eaf2fb";

  elements.push(
    `<rect x="${formatCoord(padX)}" y="${formatCoord(padY)}" width="${formatCoord(boxW)}" height="${formatCoord(boxH / 2)}" fill="${topFill}" stroke="#cbd5e1" stroke-width="1"/>`,
    `<rect x="${formatCoord(padX)}" y="${formatCoord(cy)}" width="${formatCoord(boxW)}" height="${formatCoord(boxH / 2)}" fill="${bottomFill}" stroke="#cbd5e1" stroke-width="1"/>`,
    `<line x1="${formatCoord(padX)}" y1="${formatCoord(cy)}" x2="${formatCoord(padX + boxW)}" y2="${formatCoord(cy)}" stroke="#1e293b" stroke-width="2"/>`,
    `<line x1="${formatCoord(cx)}" y1="${formatCoord(padY + 12)}" x2="${formatCoord(cx)}" y2="${formatCoord(padY + boxH - 12)}" stroke="#64748b" stroke-width="1.4" stroke-dasharray="6 4"/>`,
    `<text x="${formatCoord(cx + 8)}" y="${formatCoord(padY + 24)}" font-size="11.5" fill="#64748b">normal</text>`,
  );

  const n1Label = vis.formatNumericLabel("n1", "n₁", sol.n1);
  const n2Label = vis.formatNumericLabel("n2", "n₂", sol.n2);
  const m1Prefix = spec.medium1Name ? `${spec.medium1Name}: ` : "";
  const m2Prefix = spec.medium2Name ? `${spec.medium2Name}: ` : "";
  if (n1Label) {
    elements.push(
      `<text x="${formatCoord(padX + 14)}" y="${formatCoord(padY + 26)}" font-size="13" font-weight="600" fill="#0f172a">${escapeXml(`${m1Prefix}${n1Label}`)}</text>`,
    );
  }
  if (n2Label) {
    elements.push(
      `<text x="${formatCoord(padX + 14)}" y="${formatCoord(cy + 26)}" font-size="13" font-weight="600" fill="#0f172a">${escapeXml(`${m2Prefix}${n2Label}`)}</text>`,
    );
  }

  if (
    sol.wavelength1Nm !== null &&
    vis.canShowValue("wavelength1Nm", sol.wavelength1Nm)
  ) {
    elements.push(
      `<text x="${formatCoord(padX + 14)}" y="${formatCoord(padY + 45)}" font-size="12" fill="#334155">${escapeXml(`λ₁ = ${formatMetric(sol.wavelength1Nm, 3)} nm`)}</text>`,
    );
  }
  if (
    !sol.isTotalInternalReflection &&
    sol.wavelength2Nm !== null &&
    vis.canShowValue("wavelength2Nm", sol.wavelength2Nm)
  ) {
    elements.push(
      `<text x="${formatCoord(padX + 14)}" y="${formatCoord(cy + 45)}" font-size="12" fill="#334155">${escapeXml(`λ₂ = ${formatMetric(sol.wavelength2Nm, 3)} nm`)}</text>`,
    );
  }

  const rayLen = Math.min(boxW * 0.42, boxH * 0.44);
  const theta1Rad = degToRad(sol.incidentAngleDeg);
  const incStart: Point2D = {
    x: cx - rayLen * Math.sin(theta1Rad),
    y: cy - rayLen * Math.cos(theta1Rad),
  };
  const origin: Point2D = { x: cx, y: cy };

  elements.push(
    drawRaySegment(incStart, origin, { stroke: "#0f172a", strokeWidth: 2.3 }),
  );

  const theta1Label = vis.formatNumericLabel(
    "incidentAngleDeg",
    "θ₁",
    sol.incidentAngleDeg,
    "°",
  );
  elements.push(
    drawAngleArc(
      cx,
      cy,
      40,
      -Math.PI / 2 - theta1Rad,
      -Math.PI / 2,
      theta1Label,
    ),
  );

  if (sol.regime === "total-internal-reflection") {
    const reflEnd: Point2D = {
      x: cx + rayLen * Math.sin(theta1Rad),
      y: cy - rayLen * Math.cos(theta1Rad),
    };
    elements.push(
      drawRaySegment(origin, reflEnd, { stroke: "#0f172a", strokeWidth: 2.3 }),
    );
    const reflLabel = vis.formatNumericLabel(
      "reflectedAngleDeg",
      "θᵣ",
      sol.reflectedAngleDeg,
      "°",
    );
    elements.push(
      drawAngleArc(
        cx,
        cy,
        40,
        -Math.PI / 2,
        -Math.PI / 2 + theta1Rad,
        reflLabel,
      ),
    );
  } else if (sol.regime === "critical-angle") {
    const grazeEnd: Point2D = {
      x: cx + rayLen,
      y: cy,
    };
    elements.push(
      drawRaySegment(origin, grazeEnd, { stroke: "#0f172a", strokeWidth: 2.3 }),
    );
    const reflEnd: Point2D = {
      x: cx + rayLen * 0.85 * Math.sin(theta1Rad),
      y: cy - rayLen * 0.85 * Math.cos(theta1Rad),
    };
    elements.push(
      drawRaySegment(origin, reflEnd, {
        stroke: "#64748b",
        strokeWidth: 1.5,
        dashed: true,
      }),
    );
    const theta2Label =
      vis.canShowValue("refractedAngleDeg", 90) && vis.isVisible("regime")
        ? vis.formatNumericLabel("refractedAngleDeg", "θ₂", 90, "°")
        : vis.showSymbolicHiddenLabels
          ? "θ₂"
          : null;
    elements.push(drawAngleArc(cx, cy, 36, 0, Math.PI / 2, theta2Label));
  } else if (sol.refractedAngleDeg !== null) {
    const theta2Rad = degToRad(sol.refractedAngleDeg);
    const refrEnd: Point2D = {
      x: cx + rayLen * Math.sin(theta2Rad),
      y: cy + rayLen * Math.cos(theta2Rad),
    };
    elements.push(
      drawRaySegment(origin, refrEnd, { stroke: "#0f172a", strokeWidth: 2.3 }),
    );
    const theta2Label = vis.formatNumericLabel(
      "refractedAngleDeg",
      "θ₂",
      sol.refractedAngleDeg,
      "°",
    );
    elements.push(
      drawAngleArc(
        cx,
        cy,
        42,
        Math.PI / 2 - theta2Rad,
        Math.PI / 2,
        theta2Label,
      ),
    );

    if (spec.showPartialReflection) {
      const reflEnd: Point2D = {
        x: cx + rayLen * 0.82 * Math.sin(theta1Rad),
        y: cy - rayLen * 0.82 * Math.cos(theta1Rad),
      };
      elements.push(
        drawRaySegment(origin, reflEnd, {
          stroke: "#64748b",
          strokeWidth: 1.4,
          dashed: true,
        }),
      );
    }
  }

  if (
    sol.criticalAngleDeg !== null &&
    vis.mode === "teacher" &&
    vis.canShowValue("criticalAngleDeg", sol.criticalAngleDeg)
  ) {
    elements.push(
      `<text x="${formatCoord(padX + boxW - 14)}" y="${formatCoord(padY + 26)}" text-anchor="end" font-size="12" fill="#475569">${escapeXml(`θc = ${formatMetric(sol.criticalAngleDeg, 3)}°`)}</text>`,
    );
  }

  const publicDesc: string[] = ["Planar optical boundary diagram"];
  if (n1Label && vis.canShowValue("n1", sol.n1)) publicDesc.push(n1Label);
  if (n2Label && vis.canShowValue("n2", sol.n2)) publicDesc.push(n2Label);
  if (theta1Label && vis.canShowValue("incidentAngleDeg", sol.incidentAngleDeg))
    publicDesc.push(theta1Label);

  return {
    title: "Planar boundary ray diagram",
    desc: publicDesc.join("; "),
    ariaLabel: publicDesc.join(", "),
    elements,
  };
}

export function renderMultiLayerSlabBody(
  spec: MultiLayerSlabSpec,
  sol: MultiLayerSlabSolution,
  vis: VisibilityController,
  width: number,
  height: number,
): RenderedSvgBody {
  const elements: string[] = [];
  const padX = 48;
  const padY = 32;
  const boxW = width - 2 * padX;
  const boxH = height - 2 * padY - 18;
  const layerCount = spec.layers.length;
  const bandH = boxH / layerCount;

  const tints = ["#f8fafc", "#e8f1fb", "#f1f5f9", "#e0ecfa"];
  for (let i = 0; i < layerCount; i++) {
    const yTop = padY + i * bandH;
    const nVal = spec.layers[i].refractiveIndex;
    const fill = tints[i % tints.length];
    elements.push(
      `<rect x="${formatCoord(padX)}" y="${formatCoord(yTop)}" width="${formatCoord(boxW)}" height="${formatCoord(bandH)}" fill="${fill}" stroke="#cbd5e1" stroke-width="1"/>`,
    );
    if (i > 0) {
      elements.push(
        `<line x1="${formatCoord(padX)}" y1="${formatCoord(yTop)}" x2="${formatCoord(padX + boxW)}" y2="${formatCoord(yTop)}" stroke="#1e293b" stroke-width="1.8"/>`,
      );
    }
    const nKey = `layerN:${i}`;
    const nLabel = vis.formatNumericLabel(nKey, `n${toSubscript(i)}`, nVal);
    const namePrefix = spec.layers[i].name ? `${spec.layers[i].name}: ` : "";
    if (nLabel) {
      elements.push(
        `<text x="${formatCoord(padX + 12)}" y="${formatCoord(yTop + 22)}" font-size="12.5" font-weight="600" fill="#0f172a">${escapeXml(`${namePrefix}${nLabel}`)}</text>`,
      );
    }
    if (
      i > 0 &&
      i < layerCount - 1 &&
      spec.layers[i].thicknessM !== undefined
    ) {
      const tLabel = vis.formatNumericLabel(
        `layerThickness:${i}`,
        `t${toSubscript(i)}`,
        spec.layers[i].thicknessM!,
        "m",
      );
      if (tLabel) {
        elements.push(
          `<text x="${formatCoord(padX + boxW - 12)}" y="${formatCoord(yTop + 22)}" text-anchor="end" font-size="12" fill="#475569">${escapeXml(tLabel)}</text>`,
        );
      }
    }
  }

  let rawDxTotal = 0;
  for (let i = 0; i < sol.steps.length; i++) {
    const ang = Math.min(72, sol.steps[i].angleDeg);
    rawDxTotal += bandH * Math.tan(degToRad(ang));
  }
  const usableW = boxW * 0.62;
  const horizScale = rawDxTotal > usableW ? usableW / rawDxTotal : 1;
  let curX = padX + boxW * 0.24;

  for (let i = 0; i < sol.steps.length; i++) {
    const step = sol.steps[i];
    const yTop = padY + i * bandH;
    const yBot = yTop + bandH;
    const clampedAng = Math.min(75, step.angleDeg);
    const dx = bandH * Math.tan(degToRad(clampedAng)) * horizScale;

    if (i === 0) {
      const hitX = curX + dx;
      const pStart: Point2D = { x: curX, y: yTop + 10 };
      const pHit: Point2D = { x: hitX, y: yBot };
      elements.push(
        `<line x1="${formatCoord(hitX)}" y1="${formatCoord(yBot - bandH * 0.65)}" x2="${formatCoord(hitX)}" y2="${formatCoord(yBot + bandH * 0.65)}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="5 4"/>`,
        drawRaySegment(pStart, pHit, { stroke: "#0f172a", strokeWidth: 2.2 }),
      );
      const screenAng = Math.atan2(pStart.y - pHit.y, pStart.x - pHit.x);
      const t0Label = vis.formatNumericLabel(
        "incidentAngleDeg",
        "θ₀",
        step.angleDeg,
        "°",
      );
      elements.push(
        drawAngleArc(hitX, yBot, 30, screenAng, -Math.PI / 2, t0Label),
      );
      curX = hitX;
    } else if (i < layerCount - 1) {
      const nextX = curX + dx;
      const pStart: Point2D = { x: curX, y: yTop };
      const pEnd: Point2D = { x: nextX, y: yBot };
      elements.push(
        drawRaySegment(pStart, pEnd, { stroke: "#0f172a", strokeWidth: 2.2 }),
      );
      const screenAng = Math.atan2(pEnd.y - pStart.y, pEnd.x - pStart.x);
      const tiLabel = vis.formatNumericLabel(
        `layerAngle:${i}`,
        `θ${toSubscript(i)}`,
        step.angleDeg,
        "°",
      );
      elements.push(
        drawAngleArc(curX, yTop, 28, screenAng, Math.PI / 2, tiLabel),
      );

      if (i + 1 < sol.steps.length || sol.tirInterfaceIndex === i) {
        elements.push(
          `<line x1="${formatCoord(nextX)}" y1="${formatCoord(yBot - bandH * 0.65)}" x2="${formatCoord(nextX)}" y2="${formatCoord(yBot + bandH * 0.65)}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="5 4"/>`,
        );
      }
      curX = nextX;
    } else {
      const pStart: Point2D = { x: curX, y: yTop };
      const pEnd: Point2D = { x: curX + dx * 0.9, y: yBot - 10 };
      elements.push(
        drawRaySegment(pStart, pEnd, { stroke: "#0f172a", strokeWidth: 2.2 }),
      );
      const screenAng = Math.atan2(pEnd.y - pStart.y, pEnd.x - pStart.x);
      const emergentSymbol = `θ${toSubscript(i)}`;
      const teVisible =
        vis.canShowValue("emergentAngleDeg", step.angleDeg) &&
        vis.canShowValue(`layerAngle:${i}`, step.angleDeg);
      const teLabel = teVisible
        ? vis.formatNumericLabel(
            "emergentAngleDeg",
            emergentSymbol,
            step.angleDeg,
            "°",
          )
        : vis.showSymbolicHiddenLabels
          ? emergentSymbol
          : null;
      elements.push(
        drawAngleArc(curX, yTop, 28, screenAng, Math.PI / 2, teLabel),
      );
    }

    if (sol.tirInterfaceIndex === i) {
      const baseScale = i === 0 ? 0.88 : 1;
      const maxAvailDx = Math.max(8, padX + boxW - 14 - curX);
      const reflScale =
        dx * baseScale > maxAvailDx
          ? maxAvailDx / Math.max(1e-6, dx)
          : baseScale;
      const reflEnd: Point2D = {
        x: curX + dx * reflScale,
        y: yBot - bandH * reflScale,
      };
      elements.push(
        drawRaySegment(
          { x: curX, y: yBot },
          reflEnd,
          { stroke: "#0f172a", strokeWidth: 2.2 },
        ),
      );
    }
  }

  return {
    title: "Multi-layer optical slab diagram",
    desc: "Multi-layer optical slab ray diagram",
    ariaLabel: "Multi-layer optical slab ray diagram",
    elements,
  };
}

export function renderOpticalFiberBody(
  _spec: OpticalFiberSpec,
  sol: OpticalFiberSolution,
  vis: VisibilityController,
  width: number,
  height: number,
): RenderedSvgBody {
  const elements: string[] = [];
  const fiberLeft = 135;
  const fiberRight = width - 44;
  const fiberW = fiberRight - fiberLeft;
  const cy = (height - 20) * 0.5;
  const coreHalfH = 54;
  const cladThick = 42;

  elements.push(
    `<rect x="${formatCoord(fiberLeft)}" y="${formatCoord(cy - coreHalfH - cladThick)}" width="${formatCoord(fiberW)}" height="${formatCoord(cladThick)}" fill="#dde8f6" stroke="#94a3b8" stroke-width="1.3"/>`,
    `<rect x="${formatCoord(fiberLeft)}" y="${formatCoord(cy - coreHalfH)}" width="${formatCoord(fiberW)}" height="${formatCoord(coreHalfH * 2)}" fill="#f8fbff" stroke="#1e293b" stroke-width="1.8"/>`,
    `<rect x="${formatCoord(fiberLeft)}" y="${formatCoord(cy + coreHalfH)}" width="${formatCoord(fiberW)}" height="${formatCoord(cladThick)}" fill="#dde8f6" stroke="#94a3b8" stroke-width="1.3"/>`,
    `<line x1="${formatCoord(34)}" y1="${formatCoord(cy)}" x2="${formatCoord(fiberRight + 10)}" y2="${formatCoord(cy)}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="6 4"/>`,
  );

  const nCoreLabel = vis.formatNumericLabel("nCore", "n_core", sol.nCore);
  const nCladLabel = vis.formatNumericLabel(
    "nCladding",
    "n_clad",
    sol.nCladding,
  );
  const nExtLabel = vis.formatNumericLabel(
    "nExternal",
    "n_ext",
    sol.nExternal,
  );

  if (nCladLabel) {
    elements.push(
      `<text x="${formatCoord(fiberRight - 12)}" y="${formatCoord(cy - coreHalfH - 15)}" text-anchor="end" font-size="12.5" font-weight="600" fill="#1e293b">${escapeXml(`Cladding (${nCladLabel})`)}</text>`,
    );
  }
  if (nCoreLabel) {
    elements.push(
      `<text x="${formatCoord(fiberRight - 12)}" y="${formatCoord(cy + coreHalfH - 12)}" text-anchor="end" font-size="12.5" font-weight="600" fill="#0f172a">${escapeXml(`Core (${nCoreLabel})`)}</text>`,
    );
  }
  if (nExtLabel) {
    elements.push(
      `<text x="${formatCoord(40)}" y="${formatCoord(cy - coreHalfH - 12)}" font-size="12" fill="#334155">${escapeXml(nExtLabel)}</text>`,
    );
  }

  const entryPoint: Point2D = { x: fiberLeft, y: cy };
  const launchRad = degToRad(Math.min(70, sol.launchAngleDeg));
  const extLen = 92;
  const launchStart: Point2D = {
    x: fiberLeft - extLen * Math.cos(launchRad),
    y: cy + extLen * Math.sin(launchRad),
  };
  elements.push(
    drawRaySegment(launchStart, entryPoint, {
      stroke: "#0f172a",
      strokeWidth: 2.2,
    }),
  );

  const launchLabel = vis.formatNumericLabel(
    "launchAngleDeg",
    "θ_in",
    sol.launchAngleDeg,
    "°",
  );
  if (sol.launchAngleDeg >= 1.5) {
    const startScreenAng = Math.atan2(
      launchStart.y - entryPoint.y,
      launchStart.x - entryPoint.x,
    );
    elements.push(
      drawAngleArc(
        entryPoint.x,
        entryPoint.y,
        42,
        Math.PI,
        startScreenAng,
        launchLabel,
      ),
    );
  }

  if (sol.coreAxisAngleDeg < 0.5) {
    elements.push(
      drawRaySegment(
        entryPoint,
        { x: fiberRight, y: cy },
        { stroke: "#0f172a", strokeWidth: 2.2 },
      ),
    );
  } else {
    const visualSlope = Math.max(
      0.26,
      Math.min(0.85, Math.tan(degToRad(sol.coreAxisAngleDeg)) * 1.35),
    );
    const firstDx = coreHalfH / visualSlope;
    const hit1X = Math.min(fiberLeft + fiberW * 0.42, fiberLeft + firstDx);
    const topWallY = cy - coreHalfH;
    const botWallY = cy + coreHalfH;
    const hit1: Point2D = { x: hit1X, y: topWallY };

    elements.push(
      drawRaySegment(entryPoint, hit1, { stroke: "#0f172a", strokeWidth: 2.2 }),
      `<line x1="${formatCoord(hit1X)}" y1="${formatCoord(topWallY - 28)}" x2="${formatCoord(hit1X)}" y2="${formatCoord(topWallY + 46)}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="4 3"/>`,
    );

    const incScreenAng = Math.atan2(
      entryPoint.y - hit1.y,
      entryPoint.x - hit1.x,
    );
    const wallLabel = vis.formatNumericLabel(
      "wallIncidentAngleDeg",
      "θ_w",
      sol.wallIncidentAngleDeg,
      "°",
    );
    elements.push(
      drawAngleArc(hit1.x, hit1.y, 28, Math.PI / 2, incScreenAng, wallLabel),
    );

    const bounceSpan = 2 * (hit1X - fiberLeft);
    if (sol.isGuidedByTir) {
      let prev = hit1;
      let goingDown = true;
      while (prev.x < fiberRight - 10) {
        const nextX = prev.x + bounceSpan;
        if (nextX <= fiberRight) {
          const nextPt: Point2D = {
            x: nextX,
            y: goingDown ? botWallY : topWallY,
          };
          elements.push(
            drawRaySegment(prev, nextPt, {
              stroke: "#0f172a",
              strokeWidth: 2.2,
            }),
          );
          prev = nextPt;
          goingDown = !goingDown;
        } else {
          const frac = (fiberRight - prev.x) / bounceSpan;
          const exitY = goingDown
            ? topWallY + frac * (2 * coreHalfH)
            : botWallY - frac * (2 * coreHalfH);
          elements.push(
            drawRaySegment(
              prev,
              { x: fiberRight, y: exitY },
              { stroke: "#0f172a", strokeWidth: 2.2 },
            ),
          );
          break;
        }
      }
      if (sol.regime === "critical-grazing") {
        elements.push(
          drawRaySegment(
            hit1,
            { x: Math.min(fiberRight, hit1.x + 120), y: topWallY },
            { stroke: "#475569", strokeWidth: 1.6, dashed: true },
          ),
        );
      }
    } else {
      const cladRad = degToRad(sol.claddingRefractedAngleDeg ?? 75);
      const leakLen = cladThick / Math.max(0.2, Math.cos(cladRad));
      const leakEnd: Point2D = {
        x: Math.min(fiberRight, hit1.x + leakLen * Math.sin(cladRad)),
        y: topWallY - cladThick,
      };
      elements.push(
        drawRaySegment(hit1, leakEnd, { stroke: "#0f172a", strokeWidth: 2.1 }),
      );
      const weakReflEnd: Point2D = {
        x: Math.min(fiberRight, hit1.x + bounceSpan),
        y: botWallY,
      };
      elements.push(
        drawRaySegment(hit1, weakReflEnd, {
          stroke: "#64748b",
          strokeWidth: 1.4,
          dashed: true,
        }),
      );
    }
  }

  return {
    title: "Step-index optical fiber ray diagram",
    desc: "Step-index optical fiber core and cladding ray propagation diagram",
    ariaLabel: "Step-index optical fiber core and cladding ray diagram",
    elements,
  };
}

export function renderThinLensBody(
  _spec: ThinLensSpec,
  sol: ThinLensSolution,
  vis: VisibilityController,
  width: number,
  height: number,
): RenderedSvgBody {
  const elements: string[] = [];
  const padX = 52;
  const padY = 38;
  const plotW = width - 2 * padX;
  const plotH = height - 2 * padY - 22;
  const cx = padX + plotW * 0.5;
  const cy = padY + plotH * 0.5;

  const fMag = sol.focalLengthMagnitudeM;
  const u = sol.objectDistanceM;
  const vAbs = sol.imageDistanceM !== null ? Math.abs(sol.imageDistanceM) : 0;
  const maxPhysZ = Math.max(u, 2.15 * fMag, vAbs) * 1.15;
  const scaleZ = (plotW * 0.5) / maxPhysZ;

  const ho = sol.objectHeightM;
  const hiAbs = sol.imageHeightM !== null ? Math.abs(sol.imageHeightM) : ho;
  const maxPhysY = Math.max(ho, hiAbs) * 1.35;
  const scaleY = (plotH * 0.5) / maxPhysY;

  const mapZ = (z: number): number => cx + z * scaleZ;
  const mapY = (y: number): number => cy - y * scaleY;
  const mapPt = (pt: Point2D): Point2D => ({ x: mapZ(pt.x), y: mapY(pt.y) });

  elements.push(
    `<line x1="${formatCoord(padX - 10)}" y1="${formatCoord(cy)}" x2="${formatCoord(padX + plotW + 10)}" y2="${formatCoord(cy)}" stroke="#475569" stroke-width="1.5"/>`,
  );

  const lensHalfPx = Math.min(
    plotH * 0.46,
    Math.max(ho, hiAbs) * scaleY * 1.18 + 14,
  );
  const topLensY = cy - lensHalfPx;
  const botLensY = cy + lensHalfPx;

  if (sol.lensType === "converging") {
    const bulge = 14;
    elements.push(
      `<path d="M ${formatCoord(cx)} ${formatCoord(topLensY)} Q ${formatCoord(cx + bulge)} ${formatCoord(cy)} ${formatCoord(cx)} ${formatCoord(botLensY)} Q ${formatCoord(cx - bulge)} ${formatCoord(cy)} ${formatCoord(cx)} ${formatCoord(topLensY)} Z" fill="#eaf3fc" fill-opacity="0.65" stroke="#1e293b" stroke-width="1.8"/>`,
      `<line x1="${formatCoord(cx)}" y1="${formatCoord(topLensY)}" x2="${formatCoord(cx)}" y2="${formatCoord(botLensY)}" stroke="#1e293b" stroke-width="1.3" stroke-dasharray="4 3"/>`,
      `<polyline points="${formatCoord(cx - 6)},${formatCoord(topLensY + 8)} ${formatCoord(cx)},${formatCoord(topLensY)} ${formatCoord(cx + 6)},${formatCoord(topLensY + 8)}" fill="none" stroke="#1e293b" stroke-width="1.8"/>`,
      `<polyline points="${formatCoord(cx - 6)},${formatCoord(botLensY - 8)} ${formatCoord(cx)},${formatCoord(botLensY)} ${formatCoord(cx + 6)},${formatCoord(botLensY - 8)}" fill="none" stroke="#1e293b" stroke-width="1.8"/>`,
    );
  } else {
    const waist = 5;
    const edge = 13;
    elements.push(
      `<path d="M ${formatCoord(cx - edge)} ${formatCoord(topLensY)} L ${formatCoord(cx + edge)} ${formatCoord(topLensY)} Q ${formatCoord(cx + waist)} ${formatCoord(cy)} ${formatCoord(cx + edge)} ${formatCoord(botLensY)} L ${formatCoord(cx - edge)} ${formatCoord(botLensY)} Q ${formatCoord(cx - waist)} ${formatCoord(cy)} ${formatCoord(cx - edge)} ${formatCoord(topLensY)} Z" fill="#eaf3fc" fill-opacity="0.65" stroke="#1e293b" stroke-width="1.8"/>`,
      `<line x1="${formatCoord(cx)}" y1="${formatCoord(topLensY)}" x2="${formatCoord(cx)}" y2="${formatCoord(botLensY)}" stroke="#1e293b" stroke-width="1.3" stroke-dasharray="4 3"/>`,
    );
  }

  elements.push(
    `<text x="${formatCoord(cx + 8)}" y="${formatCoord(cy + 16)}" font-size="12" fill="#334155">O</text>`,
  );

  for (const [mult, tag] of [
    [-2, "2F"],
    [-1, "F"],
    [1, "F"],
    [2, "2F"],
  ] as const) {
    const fx = mapZ(mult * fMag);
    if (fx >= padX - 4 && fx <= padX + plotW + 4) {
      elements.push(
        `<line x1="${formatCoord(fx)}" y1="${formatCoord(cy - 5)}" x2="${formatCoord(fx)}" y2="${formatCoord(cy + 5)}" stroke="#1e293b" stroke-width="1.6"/>`,
      );
      if (Math.abs(mult) !== 2 || !vis.matchesHiddenValue(2)) {
        elements.push(
          `<text x="${formatCoord(fx)}" y="${formatCoord(cy + 19)}" text-anchor="middle" font-size="11.5" fill="#334155">${tag}</text>`,
        );
      }
    }
  }

  const drawVerticalArrow = (
    z: number,
    heightPhys: number,
    color: string,
    dashed: boolean,
    caption: string | null,
  ) => {
    const base = mapPt({ x: z, y: 0 });
    const tip = mapPt({ x: z, y: heightPhys });
    const sign = tip.y < base.y ? -1 : 1;
    const dash = dashed ? ' stroke-dasharray="5 3"' : "";
    elements.push(
      `<line x1="${formatCoord(base.x)}" y1="${formatCoord(base.y)}" x2="${formatCoord(tip.x)}" y2="${formatCoord(tip.y)}" stroke="${color}" stroke-width="2.6"${dash}/>`,
      `<polygon points="${formatCoord(tip.x)},${formatCoord(tip.y)} ${formatCoord(tip.x - 5)},${formatCoord(tip.y - sign * 9)} ${formatCoord(tip.x + 5)},${formatCoord(tip.y - sign * 9)}" fill="${color}"/>`,
    );
    if (caption) {
      const labelY = tip.y < base.y ? tip.y - 8 : tip.y + 16;
      elements.push(
        `<text x="${formatCoord(tip.x)}" y="${formatCoord(labelY)}" text-anchor="middle" font-size="12" font-weight="600" fill="${color}">${escapeXml(caption)}</text>`,
      );
    }
  };

  const objCaption = vis.canShowValue("objectHeightM", ho)
    ? `Object (${formatMetric(ho, 3)} m)`
    : "Object";
  drawVerticalArrow(-u, ho, "#0f172a", false, objCaption);

  const rightLimitZ =
    sol.imageDistanceM !== null && sol.imageDistanceM > 0
      ? Math.max(sol.imageDistanceM * 1.12, fMag * 1.4)
      : maxPhysZ * 0.92;

  for (const ray of sol.principalRays) {
    const incStartPx = mapPt(ray.incidentStart);
    const lensHitPx = mapPt(ray.lensHit);

    if (ray.frontFocusGuideStart && ray.frontFocusGuideStart.x < 0) {
      elements.push(
        drawRaySegment(mapPt(ray.frontFocusGuideStart), incStartPx, {
          stroke: "#64748b",
          strokeWidth: 1.2,
          dotted: true,
          arrowAt: null,
        }),
      );
    }

    elements.push(
      drawRaySegment(incStartPx, lensHitPx, {
        stroke: "#1d4ed8",
        strokeWidth: 1.8,
      }),
    );

    const slope =
      Math.abs(ray.transmittedDirection.x) > 1e-12
        ? ray.transmittedDirection.y / ray.transmittedDirection.x
        : 0;
    let endZ = rightLimitZ;
    let endY = ray.lensHit.y + slope * endZ;
    if (Math.abs(endY) > maxPhysY * 0.98 && Math.abs(slope) > 1e-12) {
      const targetY = Math.sign(endY) * maxPhysY * 0.98;
      endZ = Math.max(0.05 * maxPhysZ, (targetY - ray.lensHit.y) / slope);
      endY = ray.lensHit.y + slope * endZ;
    }

    elements.push(
      drawRaySegment(lensHitPx, mapPt({ x: endZ, y: endY }), {
        stroke: "#1d4ed8",
        strokeWidth: 1.8,
      }),
    );

    if (ray.virtualExtensionEnd) {
      const virtStartPx =
        ray.id === "optical-center" ? incStartPx : lensHitPx;
      elements.push(
        drawRaySegment(virtStartPx, mapPt(ray.virtualExtensionEnd), {
          stroke: "#64748b",
          strokeWidth: 1.4,
          dashed: true,
          arrowAt: null,
        }),
      );
    }

    if (ray.frontFocusGuideStart && ray.frontFocusGuideStart.x > 0) {
      elements.push(
        drawRaySegment(lensHitPx, mapPt(ray.frontFocusGuideStart), {
          stroke: "#94a3b8",
          strokeWidth: 1.2,
          dotted: true,
          arrowAt: null,
        }),
      );
    }
  }

  if (
    !sol.isImageAtInfinity &&
    sol.imageDistanceM !== null &&
    sol.imageHeightM !== null
  ) {
    const imgCaption = vis.canShowValue(
      "imageHeightM",
      Math.abs(sol.imageHeightM),
    )
      ? `Image (${formatMetric(Math.abs(sol.imageHeightM), 3)} m)`
      : "Image";
    drawVerticalArrow(
      sol.imageDistanceM,
      sol.imageHeightM,
      "#b91c1c",
      sol.imageNature === "virtual",
      imgCaption,
    );
  }

  const callouts: string[] = [];
  if (vis.canShowValue("focalLengthM", sol.focalLengthM)) {
    callouts.push(`f = ${formatMetric(sol.focalLengthM, 3)} m`);
  }
  if (vis.canShowValue("objectDistanceM", sol.objectDistanceM)) {
    callouts.push(`u = ${formatMetric(sol.objectDistanceM, 3)} m`);
  }
  if (
    sol.imageDistanceM !== null &&
    vis.canShowValue("imageDistanceM", sol.imageDistanceM)
  ) {
    callouts.push(`v = ${formatMetric(sol.imageDistanceM, 3)} m`);
  }
  if (
    sol.magnification !== null &&
    vis.canShowValue("magnification", sol.magnification)
  ) {
    callouts.push(`m = ${formatMetric(sol.magnification, 3)}`);
  }

  if (callouts.length > 0) {
    elements.push(
      `<text x="${formatCoord(padX)}" y="${formatCoord(22)}" font-size="12.5" fill="#1e293b">${escapeXml(callouts.join("   |   "))}</text>`,
    );
  }

  const lensTitle = vis.isVisible("lensType")
    ? sol.lensType === "converging"
      ? "Converging thin-lens ray diagram"
      : "Diverging thin-lens ray diagram"
    : "Thin-lens ray diagram";

  return {
    title: lensTitle,
    desc: `${lensTitle} showing principal axis, focal points, and principal rays`,
    ariaLabel: lensTitle,
    elements,
  };
}
