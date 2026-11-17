import { Point2D } from "../types";
import { RenderedSvgBody } from "./render-optics";
import {
  KinematicShmSolution,
  KinematicShmSpec,
  MassSpringShmSolution,
  MassSpringShmSpec,
  ShmCoreKinematics,
  ShmPhasePlotKind,
  ShmPlotMode,
  SimplePendulumShmSolution,
  SimplePendulumShmSpec,
} from "./types";
import {
  escapeXml,
  formatCoord,
  formatMetric,
  VisibilityController,
} from "./visibility";

interface PlotBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function buildSpringPoints(
  start: Point2D,
  end: Point2D,
  coils = 8,
  amplitudePx = 8,
): string {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return `${formatCoord(start.x)},${formatCoord(start.y)}`;
  }
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const lead = Math.min(12, len * 0.12);
  const coilSpan = Math.max(4, len - 2 * lead);
  const pts: Point2D[] = [
    start,
    { x: start.x + ux * lead, y: start.y + uy * lead },
  ];

  const halfSteps = coils * 2;
  for (let i = 0; i < halfSteps; i++) {
    const frac = (i + 0.5) / halfSteps;
    const sign = i % 2 === 0 ? 1 : -1;
    const base = lead + frac * coilSpan;
    pts.push({
      x: start.x + ux * base + nx * sign * amplitudePx,
      y: start.y + uy * base + ny * sign * amplitudePx,
    });
  }

  pts.push({ x: end.x - ux * lead, y: end.y - uy * lead }, end);
  return pts.map((p) => `${formatCoord(p.x)},${formatCoord(p.y)}`).join(" ");
}

function renderHorizontalMassSpringApparatus(
  sol: MassSpringShmSolution,
  vis: VisibilityController,
  box: PlotBox,
): string[] {
  const out: string[] = [];
  const wallX = box.left + 18;
  const trackY = box.top + box.height * 0.56;
  const eqX = box.left + box.width * 0.56;
  const maxSwingPx = box.width * 0.25;
  const normX =
    sol.amplitudeM > 0 ? sol.queryDisplacementM / sol.amplitudeM : 0;
  const blockCenterX = eqX + normX * maxSwingPx;
  const blockW = 40;
  const blockH = 30;
  const blockY = trackY - blockH;

  out.push(
    `<line x1="${formatCoord(wallX)}" y1="${formatCoord(trackY - 56)}" x2="${formatCoord(wallX)}" y2="${formatCoord(trackY + 4)}" stroke="#1e293b" stroke-width="2.4"/>`,
    `<line x1="${formatCoord(wallX)}" y1="${formatCoord(trackY)}" x2="${formatCoord(box.left + box.width - 8)}" y2="${formatCoord(trackY)}" stroke="#1e293b" stroke-width="2"/>`,
  );

  for (let h = 0; h < 5; h++) {
    const hy = trackY - 50 + h * 12;
    out.push(
      `<line x1="${formatCoord(wallX)}" y1="${formatCoord(hy)}" x2="${formatCoord(wallX - 8)}" y2="${formatCoord(hy + 7)}" stroke="#64748b" stroke-width="1.3"/>`,
    );
  }

  const eqTag = vis.isZeroHidden() ? "O" : "0";
  for (const [offset, tag] of [
    [-maxSwingPx, "−x₀"],
    [0, eqTag],
    [maxSwingPx, "+x₀"],
  ] as const) {
    const rx = eqX + offset;
    out.push(
      `<line x1="${formatCoord(rx)}" y1="${formatCoord(trackY - 52)}" x2="${formatCoord(rx)}" y2="${formatCoord(trackY + 14)}" stroke="#94a3b8" stroke-width="1.1" stroke-dasharray="4 3"/>`,
      `<text x="${formatCoord(rx)}" y="${formatCoord(trackY + 28)}" text-anchor="middle" font-size="11" fill="#475569">${tag}</text>`,
    );
  }

  const springPts = buildSpringPoints(
    { x: wallX, y: trackY - blockH / 2 },
    { x: blockCenterX - blockW / 2, y: trackY - blockH / 2 },
    8,
    7.5,
  );
  out.push(
    `<polyline points="${springPts}" fill="none" stroke="#1e293b" stroke-width="1.8" stroke-linejoin="round"/>`,
    `<rect x="${formatCoord(blockCenterX - blockW / 2)}" y="${formatCoord(blockY)}" width="${blockW}" height="${blockH}" rx="3" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/>`,
  );

  const mLabel = vis.formatNumericLabel("massKg", "m", sol.massKg, "kg");
  if (mLabel) {
    out.push(
      `<text x="${formatCoord(blockCenterX)}" y="${formatCoord(blockY - 9)}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#0f172a">${escapeXml(mLabel)}</text>`,
    );
  }
  const kLabel = vis.formatNumericLabel(
    "springConstantNm",
    "k",
    sol.springConstantNm,
    "N m⁻¹",
  );
  if (kLabel) {
    out.push(
      `<text x="${formatCoord((wallX + blockCenterX - blockW / 2) / 2)}" y="${formatCoord(trackY - blockH - 12)}" text-anchor="middle" font-size="11.5" fill="#334155">${escapeXml(kLabel)}</text>`,
    );
  }

  if (Math.abs(normX) > 0.08) {
    const dir = normX > 0 ? -1 : 1;
    const ay = blockY + blockH / 2;
    const ax1 = blockCenterX;
    const ax2 = blockCenterX + dir * 28;
    out.push(
      `<line x1="${formatCoord(ax1)}" y1="${formatCoord(ay)}" x2="${formatCoord(ax2)}" y2="${formatCoord(ay)}" stroke="#dc2626" stroke-width="2"/>`,
      `<polygon points="${formatCoord(ax2)},${formatCoord(ay)} ${formatCoord(ax2 - dir * 6)},${formatCoord(ay - 3.5)} ${formatCoord(ax2 - dir * 6)},${formatCoord(ay + 3.5)}" fill="#dc2626"/>`,
    );
  }

  return out;
}

function renderVerticalMassSpringApparatus(
  sol: MassSpringShmSolution,
  vis: VisibilityController,
  box: PlotBox,
): string[] {
  const out: string[] = [];
  const cx = box.left + box.width * 0.48;
  const ceilY = box.top + 28;
  const eqY = box.top + box.height * 0.56;
  const maxSwingPx = box.height * 0.2;
  const normX =
    sol.amplitudeM > 0 ? sol.queryDisplacementM / sol.amplitudeM : 0;
  const blockCenterY = eqY - normX * maxSwingPx;
  const blockW = 42;
  const blockH = 28;

  out.push(
    `<line x1="${formatCoord(cx - 46)}" y1="${formatCoord(ceilY)}" x2="${formatCoord(cx + 46)}" y2="${formatCoord(ceilY)}" stroke="#1e293b" stroke-width="2.4"/>`,
  );
  for (let h = -3; h <= 3; h++) {
    const hx = cx + h * 12;
    out.push(
      `<line x1="${formatCoord(hx)}" y1="${formatCoord(ceilY)}" x2="${formatCoord(hx + 6)}" y2="${formatCoord(ceilY - 8)}" stroke="#64748b" stroke-width="1.3"/>`,
    );
  }

  const eqTag = vis.isZeroHidden() ? "O" : "0";
  for (const [offset, tag] of [
    [-maxSwingPx, "+x₀"],
    [0, eqTag],
    [maxSwingPx, "−x₀"],
  ] as const) {
    const ry = eqY + offset;
    out.push(
      `<line x1="${formatCoord(cx - 42)}" y1="${formatCoord(ry)}" x2="${formatCoord(cx + 52)}" y2="${formatCoord(ry)}" stroke="#94a3b8" stroke-width="1.1" stroke-dasharray="4 3"/>`,
      `<text x="${formatCoord(cx + 58)}" y="${formatCoord(ry + 4)}" font-size="11" fill="#475569">${tag}</text>`,
    );
  }

  const springPts = buildSpringPoints(
    { x: cx, y: ceilY },
    { x: cx, y: blockCenterY - blockH / 2 },
    8,
    8,
  );
  out.push(
    `<polyline points="${springPts}" fill="none" stroke="#1e293b" stroke-width="1.8" stroke-linejoin="round"/>`,
    `<rect x="${formatCoord(cx - blockW / 2)}" y="${formatCoord(blockCenterY - blockH / 2)}" width="${blockW}" height="${blockH}" rx="3" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/>`,
  );

  const mLabel = vis.formatNumericLabel("massKg", "m", sol.massKg, "kg");
  if (mLabel) {
    out.push(
      `<text x="${formatCoord(cx)}" y="${formatCoord(blockCenterY + blockH / 2 + 18)}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#0f172a">${escapeXml(mLabel)}</text>`,
    );
  }
  const kLabel = vis.formatNumericLabel(
    "springConstantNm",
    "k",
    sol.springConstantNm,
    "N m⁻¹",
  );
  if (kLabel) {
    out.push(
      `<text x="${formatCoord(cx - 16)}" y="${formatCoord((ceilY + blockCenterY - blockH / 2) / 2)}" text-anchor="end" font-size="11.5" fill="#334155">${escapeXml(kLabel)}</text>`,
    );
  }

  return out;
}

function renderPendulumApparatus(
  sol: SimplePendulumShmSolution,
  vis: VisibilityController,
  box: PlotBox,
): string[] {
  const out: string[] = [];
  const pivotX = box.left + box.width * 0.5;
  const pivotY = box.top + 32;
  const rodPx = box.height * 0.62;

  const visualMaxRad =
    (Math.max(12, Math.min(24, sol.maxAngleDeg * 1.4)) * Math.PI) / 180;
  const norm =
    sol.amplitudeM > 0 ? sol.queryDisplacementM / sol.amplitudeM : 1;
  const curRad = norm * visualMaxRad;

  const bobX = pivotX + rodPx * Math.sin(curRad);
  const bobY = pivotY + rodPx * Math.cos(curRad);
  const arcLeftX = pivotX - rodPx * Math.sin(visualMaxRad);
  const arcLeftY = pivotY + rodPx * Math.cos(visualMaxRad);
  const arcRightX = pivotX + rodPx * Math.sin(visualMaxRad);
  const arcRightY = pivotY + rodPx * Math.cos(visualMaxRad);

  out.push(
    `<line x1="${formatCoord(pivotX - 42)}" y1="${formatCoord(pivotY)}" x2="${formatCoord(pivotX + 42)}" y2="${formatCoord(pivotY)}" stroke="#1e293b" stroke-width="2.4"/>`,
    `<line x1="${formatCoord(pivotX)}" y1="${formatCoord(pivotY)}" x2="${formatCoord(pivotX)}" y2="${formatCoord(pivotY + rodPx + 18)}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="5 4"/>`,
    `<path d="M ${formatCoord(arcLeftX)} ${formatCoord(arcLeftY)} A ${formatCoord(rodPx)} ${formatCoord(rodPx)} 0 0 0 ${formatCoord(arcRightX)} ${formatCoord(arcRightY)}" fill="none" stroke="#94a3b8" stroke-width="1.3" stroke-dasharray="4 3"/>`,
    `<line x1="${formatCoord(pivotX)}" y1="${formatCoord(pivotY)}" x2="${formatCoord(bobX)}" y2="${formatCoord(bobY)}" stroke="#0f172a" stroke-width="2"/>`,
    `<circle cx="${formatCoord(bobX)}" cy="${formatCoord(bobY)}" r="11" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/>`,
  );

  const lLabel = vis.formatNumericLabel("lengthM", "L", sol.lengthM, "m");
  if (lLabel) {
    out.push(
      `<text x="${formatCoord((pivotX + bobX) / 2 + 12)}" y="${formatCoord((pivotY + bobY) / 2)}" font-size="11.5" font-weight="600" fill="#0f172a">${escapeXml(lLabel)}</text>`,
    );
  }
  const angLabel = vis.formatNumericLabel(
    "maxAngleDeg",
    "θ₀",
    sol.maxAngleDeg,
    "°",
  );
  if (angLabel) {
    out.push(
      `<text x="${formatCoord(pivotX)}" y="${formatCoord(pivotY + rodPx + 36)}" text-anchor="middle" font-size="11.5" fill="#334155">${escapeXml(angLabel)}</text>`,
    );
  }

  return out;
}

function renderTimeSeriesPlots(
  sol: ShmCoreKinematics,
  vis: VisibilityController,
  box: PlotBox,
  showGrid: boolean,
): string[] {
  const out: string[] = [];
  const gap = 22;
  const subH = (box.height - 2 * gap - 22) / 3;
  const plotLeft = box.left + 58;
  const plotW = box.width - 70;
  const durationS = sol.timeSeries[sol.timeSeries.length - 1].timeS;

  const rawShowTimeNums =
    vis.isVisible("periodS") &&
    vis.isVisible("frequencyHz") &&
    vis.isVisible("angularFrequencyRadS") &&
    vis.isVisible("energyOscillationPeriodS") &&
    vis.isVisible("energyOscillationFrequencyHz") &&
    vis.isVisible("queryTimeS");
  const anyPositiveTickCollides = [1, 2, 3, 4].some((tick) =>
    vis.matchesHiddenValue((durationS * tick) / 4),
  );
  const showTimeNums = rawShowTimeNums && !anyPositiveTickCollides;

  const showDispNums =
    vis.canShowValue("amplitudeM", sol.amplitudeM) &&
    vis.isVisible("queryDisplacementM") &&
    vis.isVisible("displacementAtQueryTimeM");

  const showVelNums =
    showTimeNums &&
    vis.canShowValue("maxSpeedMs", sol.maxSpeedMs) &&
    vis.isVisible("velocityAtQueryTimeMs") &&
    vis.isVisible("speedAtQueryDisplacementMs") &&
    vis.isVisible("positiveVelocityAtQueryDisplacementMs") &&
    vis.isVisible("negativeVelocityAtQueryDisplacementMs");

  const showAccNums =
    showTimeNums &&
    vis.canShowValue("maxAccelerationMs2", sol.maxAccelerationMs2) &&
    vis.isVisible("accelerationAtQueryTimeMs2") &&
    vis.isVisible("accelerationAtQueryDisplacementMs2");

  const channels: Array<{
    title: string;
    maxVal: number;
    showMaxNum: boolean;
    posSymbol: string;
    negSymbol: string;
    unit: string;
    stroke: string;
    dash?: string;
    valueOf: (s: (typeof sol.timeSeries)[number]) => number;
  }> = [
    {
      title: "x",
      maxVal: sol.amplitudeM,
      showMaxNum: showDispNums,
      posSymbol: "+x₀",
      negSymbol: "−x₀",
      unit: "m",
      stroke: "#0f172a",
      valueOf: (s) => s.displacementM,
    },
    {
      title: "v",
      maxVal: sol.maxSpeedMs,
      showMaxNum: showVelNums,
      posSymbol: "+v_max",
      negSymbol: "−v_max",
      unit: "m s⁻¹",
      stroke: "#1d4ed8",
      dash: "6 3",
      valueOf: (s) => s.velocityMs,
    },
    {
      title: "a",
      maxVal: sol.maxAccelerationMs2,
      showMaxNum: showAccNums,
      posSymbol: "+a_max",
      negSymbol: "−a_max",
      unit: "m s⁻²",
      stroke: "#b91c1c",
      valueOf: (s) => s.accelerationMs2,
    },
  ];

  channels.forEach((ch, idx) => {
    const top = box.top + idx * (subH + gap);
    const midY = top + subH * 0.5;
    const halfAmpPx = subH * 0.42;

    out.push(
      `<rect x="${formatCoord(plotLeft)}" y="${formatCoord(top)}" width="${formatCoord(plotW)}" height="${formatCoord(subH)}" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>`,
      `<line x1="${formatCoord(plotLeft)}" y1="${formatCoord(midY)}" x2="${formatCoord(plotLeft + plotW)}" y2="${formatCoord(midY)}" stroke="#64748b" stroke-width="1.2"/>`,
    );

    if (showGrid) {
      for (let g = 1; g <= 3; g++) {
        const gx = plotLeft + (plotW * g) / 4;
        out.push(
          `<line x1="${formatCoord(gx)}" y1="${formatCoord(top)}" x2="${formatCoord(gx)}" y2="${formatCoord(top + subH)}" stroke="#e2e8f0" stroke-width="1"/>`,
        );
      }
    }

    const posText = ch.showMaxNum
      ? `+${formatMetric(ch.maxVal, 3)}`
      : ch.posSymbol;
    const negText = ch.showMaxNum
      ? `−${formatMetric(ch.maxVal, 3)}`
      : ch.negSymbol;
    const axisLabel = ch.showMaxNum ? `${ch.title} / ${ch.unit}` : ch.title;

    out.push(
      `<text x="${formatCoord(plotLeft - 6)}" y="${formatCoord(top + 11)}" text-anchor="end" font-size="10.5" fill="#475569">${escapeXml(posText)}</text>`,
    );
    if (!vis.isZeroHidden()) {
      out.push(
        `<text x="${formatCoord(plotLeft - 6)}" y="${formatCoord(midY + 4)}" text-anchor="end" font-size="10.5" fill="#475569">0</text>`,
      );
    }
    out.push(
      `<text x="${formatCoord(plotLeft - 6)}" y="${formatCoord(top + subH - 3)}" text-anchor="end" font-size="10.5" fill="#475569">${escapeXml(negText)}</text>`,
      `<text x="${formatCoord(plotLeft + 8)}" y="${formatCoord(top + 14)}" font-size="11" font-weight="600" fill="${ch.stroke}">${escapeXml(axisLabel)}</text>`,
    );

    const pts = sol.timeSeries
      .map((sample) => {
        const px = plotLeft + (sample.timeS / durationS) * plotW;
        const norm = ch.maxVal > 0 ? ch.valueOf(sample) / ch.maxVal : 0;
        const py = midY - norm * halfAmpPx;
        return `${formatCoord(px)},${formatCoord(py)}`;
      })
      .join(" ");

    const dashAttr = ch.dash ? ` stroke-dasharray="${ch.dash}"` : "";
    out.push(
      `<polyline points="${pts}" fill="none" stroke="${ch.stroke}" stroke-width="2"${dashAttr}/>`,
    );

    if (idx === channels.length - 1) {
      const botY = top + subH;
      if (showTimeNums) {
        for (let tick = 0; tick <= 4; tick++) {
          const tVal = (durationS * tick) / 4;
          if (vis.matchesHiddenValue(tVal)) continue;
          const tx = plotLeft + (plotW * tick) / 4;
          out.push(
            `<text x="${formatCoord(tx)}" y="${formatCoord(botY + 15)}" text-anchor="middle" font-size="10.5" fill="#475569">${escapeXml(formatMetric(tVal, 3))}</text>`,
          );
        }
        out.push(
          `<text x="${formatCoord(plotLeft + plotW / 2)}" y="${formatCoord(botY + 30)}" text-anchor="middle" font-size="11.5" fill="#1e293b">t / s</text>`,
        );
      } else {
        if (!vis.isZeroHidden()) {
          out.push(
            `<text x="${formatCoord(plotLeft)}" y="${formatCoord(botY + 15)}" text-anchor="middle" font-size="10.5" fill="#475569">0</text>`,
          );
        }
        out.push(
          `<text x="${formatCoord(plotLeft + plotW)}" y="${formatCoord(botY + 16)}" text-anchor="end" font-size="11.5" fill="#1e293b">t</text>`,
        );
      }
    }
  });

  return out;
}

function renderEnergyPlot(
  sol: ShmCoreKinematics,
  vis: VisibilityController,
  box: PlotBox,
  vsTime: boolean,
): string[] {
  const out: string[] = [];
  const plotLeft = box.left + 58;
  const plotTop = box.top + 24;
  const plotW = box.width - 72;
  const plotH = box.height - 68;
  const plotBot = plotTop + plotH;

  const showEnergyNums =
    vis.canShowValue("totalEnergyJ", sol.totalEnergyJ) &&
    vis.isVisible("kineticEnergyJ") &&
    vis.isVisible("potentialEnergyJ") &&
    vis.isVisible("kineticEnergyAtQueryTimeJ") &&
    vis.isVisible("potentialEnergyAtQueryTimeJ") &&
    vis.isVisible("kineticEnergyAtQueryDisplacementJ") &&
    vis.isVisible("potentialEnergyAtQueryDisplacementJ");

  out.push(
    `<rect x="${formatCoord(plotLeft)}" y="${formatCoord(plotTop)}" width="${formatCoord(plotW)}" height="${formatCoord(plotH)}" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.2"/>`,
  );

  const eMax = sol.totalEnergyJ > 0 ? sol.totalEnergyJ : 1;
  const mapEY = (e: number): number =>
    plotBot - (e / eMax) * (plotH * 0.86);

  const eTopY = mapEY(sol.totalEnergyJ);
  out.push(
    `<line x1="${formatCoord(plotLeft)}" y1="${formatCoord(eTopY)}" x2="${formatCoord(plotLeft + plotW)}" y2="${formatCoord(eTopY)}" stroke="#b91c1c" stroke-width="1.8" stroke-dasharray="3 3"/>`,
    `<text x="${formatCoord(plotLeft - 6)}" y="${formatCoord(eTopY + 4)}" text-anchor="end" font-size="10.5" fill="#475569">${escapeXml(showEnergyNums ? `${formatMetric(sol.totalEnergyJ, 3)}` : "E_tot")}</text>`,
  );
  if (!vis.isZeroHidden()) {
    out.push(
      `<text x="${formatCoord(plotLeft - 6)}" y="${formatCoord(plotBot)}" text-anchor="end" font-size="10.5" fill="#475569">0</text>`,
    );
  }
  out.push(
    `<text x="${formatCoord(plotLeft + 8)}" y="${formatCoord(plotTop + 15)}" font-size="11.5" font-weight="600" fill="#0f172a">${showEnergyNums ? "Energy / J" : "Energy"}</text>`,
  );

  if (vsTime) {
    const durationS = sol.timeSeries[sol.timeSeries.length - 1].timeS;
    const ekPts = sol.timeSeries
      .map(
        (s) =>
          `${formatCoord(plotLeft + (s.timeS / durationS) * plotW)},${formatCoord(mapEY(s.kineticEnergyJ))}`,
      )
      .join(" ");
    const epPts = sol.timeSeries
      .map(
        (s) =>
          `${formatCoord(plotLeft + (s.timeS / durationS) * plotW)},${formatCoord(mapEY(s.potentialEnergyJ))}`,
      )
      .join(" ");
    out.push(
      `<polyline points="${ekPts}" fill="none" stroke="#0f172a" stroke-width="2.1"/>`,
      `<polyline points="${epPts}" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-dasharray="6 4"/>`,
    );

    const rawShowTimeNums =
      vis.isVisible("periodS") &&
      vis.isVisible("frequencyHz") &&
      vis.isVisible("angularFrequencyRadS") &&
      vis.isVisible("energyOscillationPeriodS") &&
      vis.isVisible("energyOscillationFrequencyHz") &&
      vis.isVisible("queryTimeS");
    const anyPositiveTickCollides = [1, 2, 3, 4].some((tick) =>
      vis.matchesHiddenValue((durationS * tick) / 4),
    );
    const showTimeNums = rawShowTimeNums && !anyPositiveTickCollides;

    if (showTimeNums) {
      for (let tick = 0; tick <= 4; tick++) {
        const tVal = (durationS * tick) / 4;
        if (vis.matchesHiddenValue(tVal)) continue;
        const tx = plotLeft + (plotW * tick) / 4;
        out.push(
          `<text x="${formatCoord(tx)}" y="${formatCoord(plotBot + 16)}" text-anchor="middle" font-size="10.5" fill="#475569">${escapeXml(formatMetric(tVal, 3))}</text>`,
        );
      }
      out.push(
        `<text x="${formatCoord(plotLeft + plotW / 2)}" y="${formatCoord(plotBot + 34)}" text-anchor="middle" font-size="11.5" fill="#1e293b">t / s</text>`,
      );
    } else {
      if (!vis.isZeroHidden()) {
        out.push(
          `<text x="${formatCoord(plotLeft)}" y="${formatCoord(plotBot + 16)}" text-anchor="middle" font-size="10.5" fill="#475569">0</text>`,
        );
      }
      out.push(
        `<text x="${formatCoord(plotLeft + plotW)}" y="${formatCoord(plotBot + 18)}" text-anchor="end" font-size="11.5" fill="#1e293b">t</text>`,
      );
    }
  } else {
    const x0 = sol.amplitudeM;
    const mapX = (x: number): number =>
      plotLeft + ((x + x0) / (2 * x0)) * plotW;

    out.push(
      `<line x1="${formatCoord(mapX(0))}" y1="${formatCoord(plotTop)}" x2="${formatCoord(mapX(0))}" y2="${formatCoord(plotBot)}" stroke="#e2e8f0" stroke-width="1.2"/>`,
    );

    const ekPts = sol.displacementSeries
      .map(
        (s) =>
          `${formatCoord(mapX(s.displacementM))},${formatCoord(mapEY(s.kineticEnergyJ))}`,
      )
      .join(" ");
    const epPts = sol.displacementSeries
      .map(
        (s) =>
          `${formatCoord(mapX(s.displacementM))},${formatCoord(mapEY(s.potentialEnergyJ))}`,
      )
      .join(" ");
    out.push(
      `<polyline points="${ekPts}" fill="none" stroke="#0f172a" stroke-width="2.2"/>`,
      `<polyline points="${epPts}" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-dasharray="6 4"/>`,
    );

    const showAmp =
      vis.canShowValue("amplitudeM", x0) &&
      vis.isVisible("queryDisplacementM") &&
      vis.isVisible("displacementAtQueryTimeM") &&
      vis.isVisible("equalEnergyDisplacementM");
    const leftLbl = showAmp ? `−${formatMetric(x0, 3)}` : "−x₀";
    const rightLbl = showAmp ? `+${formatMetric(x0, 3)}` : "+x₀";
    out.push(
      `<text x="${formatCoord(plotLeft)}" y="${formatCoord(plotBot + 16)}" text-anchor="middle" font-size="10.5" fill="#475569">${escapeXml(leftLbl)}</text>`,
    );
    if (!vis.isZeroHidden()) {
      out.push(
        `<text x="${formatCoord(mapX(0))}" y="${formatCoord(plotBot + 16)}" text-anchor="middle" font-size="10.5" fill="#475569">0</text>`,
      );
    }
    out.push(
      `<text x="${formatCoord(plotLeft + plotW)}" y="${formatCoord(plotBot + 16)}" text-anchor="middle" font-size="10.5" fill="#475569">${escapeXml(rightLbl)}</text>`,
      `<text x="${formatCoord(plotLeft + plotW / 2)}" y="${formatCoord(plotBot + 34)}" text-anchor="middle" font-size="11.5" fill="#1e293b">${showAmp ? "x / m" : "x"}</text>`,
    );
  }

  out.push(
    `<text x="${formatCoord(plotLeft + plotW - 10)}" y="${formatCoord(plotTop + 16)}" text-anchor="end" font-size="11" fill="#0f172a">── Ek   - - Ep   ··· Etot</text>`,
  );

  return out;
}

function renderPhasePortraitPlot(
  sol: ShmCoreKinematics,
  vis: VisibilityController,
  box: PlotBox,
  phasePlotKind: ShmPhasePlotKind,
): string[] {
  const out: string[] = [];
  const plotLeft = box.left + 44;
  const plotTop = box.top + 22;
  const plotW = box.width - 58;
  const plotH = box.height - 56;
  const cx = plotLeft + plotW * 0.5;
  const cy = plotTop + plotH * 0.5;
  const rx = plotW * 0.4;
  const ry = plotH * 0.39;

  out.push(
    `<rect x="${formatCoord(plotLeft)}" y="${formatCoord(plotTop)}" width="${formatCoord(plotW)}" height="${formatCoord(plotH)}" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.2"/>`,
    `<line x1="${formatCoord(plotLeft + 8)}" y1="${formatCoord(cy)}" x2="${formatCoord(plotLeft + plotW - 8)}" y2="${formatCoord(cy)}" stroke="#64748b" stroke-width="1.3"/>`,
    `<line x1="${formatCoord(cx)}" y1="${formatCoord(plotTop + 8)}" x2="${formatCoord(cx)}" y2="${formatCoord(plotTop + plotH - 8)}" stroke="#64748b" stroke-width="1.3"/>`,
  );

  const showAmp =
    vis.canShowValue("amplitudeM", sol.amplitudeM) &&
    vis.isVisible("queryDisplacementM") &&
    vis.isVisible("displacementAtQueryTimeM");
  const xPosLbl = showAmp ? `+${formatMetric(sol.amplitudeM, 3)}` : "+x₀";
  const xNegLbl = showAmp ? `−${formatMetric(sol.amplitudeM, 3)}` : "−x₀";
  out.push(
    `<text x="${formatCoord(cx + rx)}" y="${formatCoord(cy + 16)}" text-anchor="middle" font-size="10.5" fill="#475569">${escapeXml(xPosLbl)}</text>`,
    `<text x="${formatCoord(cx - rx)}" y="${formatCoord(cy + 16)}" text-anchor="middle" font-size="10.5" fill="#475569">${escapeXml(xNegLbl)}</text>`,
    `<text x="${formatCoord(plotLeft + plotW - 10)}" y="${formatCoord(cy - 6)}" text-anchor="end" font-size="11.5" font-weight="600" fill="#1e293b">${showAmp ? "x / m" : "x"}</text>`,
  );

  const showFreq =
    vis.isVisible("angularFrequencyRadS") &&
    vis.isVisible("periodS") &&
    vis.isVisible("frequencyHz");

  if (phasePlotKind === "acceleration-displacement") {
    const showAMax =
      showFreq &&
      vis.canShowValue("maxAccelerationMs2", sol.maxAccelerationMs2) &&
      vis.isVisible("accelerationAtQueryTimeMs2") &&
      vis.isVisible("accelerationAtQueryDisplacementMs2");
    const aPosLbl = showAMax
      ? `+${formatMetric(sol.maxAccelerationMs2, 3)}`
      : "+a_max";
    const aNegLbl = showAMax
      ? `−${formatMetric(sol.maxAccelerationMs2, 3)}`
      : "−a_max";

    out.push(
      `<line x1="${formatCoord(cx - rx)}" y1="${formatCoord(cy - ry)}" x2="${formatCoord(cx + rx)}" y2="${formatCoord(cy + ry)}" stroke="#b91c1c" stroke-width="2.4"/>`,
      `<text x="${formatCoord(cx + 8)}" y="${formatCoord(cy - ry + 4)}" font-size="10.5" fill="#475569">${escapeXml(aPosLbl)}</text>`,
      `<text x="${formatCoord(cx + 8)}" y="${formatCoord(cy + ry + 4)}" font-size="10.5" fill="#475569">${escapeXml(aNegLbl)}</text>`,
      `<text x="${formatCoord(cx + 8)}" y="${formatCoord(plotTop + 18)}" font-size="11.5" font-weight="600" fill="#b91c1c">${showAMax ? "a / m s⁻²" : "a"}</text>`,
    );
  } else {
    const showVMax =
      showFreq &&
      vis.canShowValue("maxSpeedMs", sol.maxSpeedMs) &&
      vis.isVisible("velocityAtQueryTimeMs") &&
      vis.isVisible("speedAtQueryDisplacementMs") &&
      vis.isVisible("positiveVelocityAtQueryDisplacementMs") &&
      vis.isVisible("negativeVelocityAtQueryDisplacementMs");
    const vPosLbl = showVMax
      ? `+${formatMetric(sol.maxSpeedMs, 3)}`
      : "+v_max";
    const vNegLbl = showVMax
      ? `−${formatMetric(sol.maxSpeedMs, 3)}`
      : "−v_max";

    out.push(
      `<ellipse cx="${formatCoord(cx)}" cy="${formatCoord(cy)}" rx="${formatCoord(rx)}" ry="${formatCoord(ry)}" fill="none" stroke="#0f172a" stroke-width="2.3"/>`,
      `<polygon points="${formatCoord(cx + 5)},${formatCoord(cy - ry)} ${formatCoord(cx - 4)},${formatCoord(cy - ry - 4)} ${formatCoord(cx - 4)},${formatCoord(cy - ry + 4)}" fill="#0f172a"/>`,
      `<polygon points="${formatCoord(cx - 5)},${formatCoord(cy + ry)} ${formatCoord(cx + 4)},${formatCoord(cy + ry - 4)} ${formatCoord(cx + 4)},${formatCoord(cy + ry + 4)}" fill="#0f172a"/>`,
      `<text x="${formatCoord(cx + 8)}" y="${formatCoord(cy - ry - 6)}" font-size="10.5" fill="#475569">${escapeXml(vPosLbl)}</text>`,
      `<text x="${formatCoord(cx + 8)}" y="${formatCoord(cy + ry + 14)}" font-size="10.5" fill="#475569">${escapeXml(vNegLbl)}</text>`,
      `<text x="${formatCoord(cx + 8)}" y="${formatCoord(plotTop + 18)}" font-size="11.5" font-weight="600" fill="#0f172a">${showVMax ? "v / m s⁻¹" : "v"}</text>`,
    );
  }

  return out;
}

function renderShmGraphPanel(
  sol: ShmCoreKinematics,
  vis: VisibilityController,
  box: PlotBox,
  plotMode: ShmPlotMode,
  phasePlotKind: ShmPhasePlotKind,
  showGrid: boolean,
): string[] {
  switch (plotMode) {
    case "energy-displacement":
      return renderEnergyPlot(sol, vis, box, false);
    case "energy-time":
      return renderEnergyPlot(sol, vis, box, true);
    case "phase-portrait":
      return renderPhasePortraitPlot(sol, vis, box, phasePlotKind);
    case "time-series":
    default:
      return renderTimeSeriesPlots(sol, vis, box, showGrid);
  }
}

export function renderMassSpringShmBody(
  spec: MassSpringShmSpec,
  sol: MassSpringShmSolution,
  vis: VisibilityController,
  width: number,
  height: number,
  showGrid: boolean,
): RenderedSvgBody {
  const leftBox: PlotBox = {
    left: 24,
    top: 28,
    width: Math.floor(width * 0.36),
    height: height - 56,
  };
  const rightBox: PlotBox = {
    left: leftBox.left + leftBox.width + 14,
    top: 24,
    width: width - (leftBox.left + leftBox.width + 38),
    height: height - 48,
  };

  const apparatus =
    sol.orientation === "vertical"
      ? renderVerticalMassSpringApparatus(sol, vis, leftBox)
      : renderHorizontalMassSpringApparatus(sol, vis, leftBox);

  const graphs = renderShmGraphPanel(
    sol,
    vis,
    rightBox,
    spec.plotMode ?? "time-series",
    spec.phasePlotKind ?? "velocity-displacement",
    showGrid,
  );

  const orientPrefix = vis.isVisible("orientation")
    ? sol.orientation === "vertical"
      ? "Vertical "
      : "Horizontal "
    : "";

  return {
    title: "Mass-spring simple harmonic motion diagram",
    desc: `${orientPrefix}mass-spring oscillator schematic and synchronized SHM plot`,
    ariaLabel: `${orientPrefix}mass-spring simple harmonic motion diagram`,
    elements: [...apparatus, ...graphs],
  };
}

export function renderSimplePendulumShmBody(
  spec: SimplePendulumShmSpec,
  sol: SimplePendulumShmSolution,
  vis: VisibilityController,
  width: number,
  height: number,
  showGrid: boolean,
): RenderedSvgBody {
  const leftBox: PlotBox = {
    left: 24,
    top: 28,
    width: Math.floor(width * 0.35),
    height: height - 56,
  };
  const rightBox: PlotBox = {
    left: leftBox.left + leftBox.width + 14,
    top: 24,
    width: width - (leftBox.left + leftBox.width + 38),
    height: height - 48,
  };

  const apparatus = renderPendulumApparatus(sol, vis, leftBox);
  const graphs = renderShmGraphPanel(
    sol,
    vis,
    rightBox,
    spec.plotMode ?? "time-series",
    spec.phasePlotKind ?? "velocity-displacement",
    showGrid,
  );

  return {
    title: "Simple pendulum SHM diagram",
    desc: "Simple pendulum small-angle oscillation schematic and synchronized SHM plot",
    ariaLabel: "Simple pendulum simple harmonic motion diagram",
    elements: [...apparatus, ...graphs],
  };
}

export function renderKinematicShmBody(
  spec: KinematicShmSpec,
  sol: KinematicShmSolution,
  vis: VisibilityController,
  width: number,
  height: number,
  showGrid: boolean,
): RenderedSvgBody {
  const fullBox: PlotBox = {
    left: 36,
    top: 24,
    width: width - 72,
    height: height - 48,
  };
  const graphs = renderShmGraphPanel(
    sol,
    vis,
    fullBox,
    spec.plotMode ?? "time-series",
    spec.phasePlotKind ?? "velocity-displacement",
    showGrid,
  );

  return {
    title: "Simple harmonic motion graph",
    desc: "Simple harmonic motion kinematic and energy curves",
    ariaLabel: "Simple harmonic motion graph",
    elements: graphs,
  };
}
