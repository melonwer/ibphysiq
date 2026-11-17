import { spectralLineColorHex } from "./constants";
import {
  EnergyLevelsScenarioSpec,
  EnergyLevelsSolution,
  MatterWavesScenarioSpec,
  MatterWavesSolution,
  PhotoelectricScenarioSpec,
  PhotoelectricSolution,
} from "./types";
import {
  coord,
  escapeXml,
  formatCleanTick,
  formatScientificSigFigs,
  toSubscript,
  VisibilityGuard,
} from "./visibility";

export interface SvgBodyResult {
  readonly title: string;
  readonly ariaLabel: string;
  readonly desc: string;
  readonly defs: string;
  readonly body: string;
}

function niceStep(span: number, targetSteps = 5): number {
  const rough = span / targetSteps;
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

// ---------------------------------------------------------------------------
// 1. Atomic Energy Levels & Spectral Strip SVG
// ---------------------------------------------------------------------------

export function renderEnergyLevelsBody(
  spec: EnergyLevelsScenarioSpec,
  solution: EnergyLevelsSolution,
  guard: VisibilityGuard,
  width: number,
  height: number,
  uid: string,
): SvgBodyResult {
  const showStrip = spec.showSpectralStrip ?? true;
  const levelTop = 44;
  const levelBottom = showStrip ? height - 132 : height - 42;
  const barLeft = 148;
  const barRight = width - 168;

  const minEv = solution.levels[0].energyEv;
  const maxEv = solution.levels[solution.levels.length - 1].energyEv;
  const evSpan = Math.max(1e-9, maxEv - minEv);

  // Compute exact linear vertical positions (higher energy -> smaller y)
  const rawYs = solution.levels.map(
    (lvl) =>
      levelBottom - ((lvl.energyEv - minEv) / evSpan) * (levelBottom - levelTop),
  );

  // Relax adjacent labels/lines only if closer than 22px, preserving monotonic order
  const adjustedYs = [...rawYs];
  const minGapPx = Math.min(
    22,
    (levelBottom - levelTop) / Math.max(1, solution.levels.length),
  );
  for (let i = adjustedYs.length - 2; i >= 0; i -= 1) {
    if (adjustedYs[i] - adjustedYs[i + 1] < minGapPx) {
      adjustedYs[i] = adjustedYs[i + 1] + minGapPx;
    }
  }
  if (adjustedYs[0] > levelBottom) {
    const shift = adjustedYs[0] - levelBottom;
    for (let i = 0; i < adjustedYs.length; i += 1) {
      adjustedYs[i] -= shift;
    }
  }
  for (let i = 1; i < adjustedYs.length; i += 1) {
    if (adjustedYs[i - 1] - adjustedYs[i] < minGapPx * 0.75) {
      adjustedYs[i] = adjustedYs[i - 1] - minGapPx * 0.75;
    }
  }

  const yById = new Map<string, number>();
  const levelById = new Map(solution.levels.map((lvl) => [lvl.id, lvl]));
  solution.levels.forEach((lvl, idx) => {
    yById.set(lvl.id, adjustedYs[idx]);
  });

  const emitArrowId = `qn-emit-${uid}`;
  const absorbArrowId = `qn-absorb-${uid}`;
  const photonArrowId = `qn-photon-${uid}`;
  const defs = [
    `<marker id="${emitArrowId}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#1d4ed8"/></marker>`,
    `<marker id="${absorbArrowId}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#b91c1c"/></marker>`,
    `<marker id="${photonArrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 1L9 5L0 9Z" fill="#475569"/></marker>`,
  ].join("");

  const parts: string[] = [];
  const displayUnit = spec.displayEnergyUnit ?? "eV";

  // Header label (checks both atomName and atomicNumberZ since hydrogenic atomName contains Z)
  const showAtomTitle =
    guard.canShowInput(["atomName"]) &&
    !guard.isExplicitlyHidden(["atomicNumberZ", "Z"]) &&
    !guard.textContainsHiddenNumber(solution.atomName);
  if (showAtomTitle) {
    parts.push(
      `<text x="${coord(width / 2)}" y="24" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a">${escapeXml(solution.atomName)} energy levels</text>`,
    );
  }

  // Render horizontal energy levels
  solution.levels.forEach((lvl) => {
    const y = yById.get(lvl.id)!;
    const dash = lvl.isContinuum ? ' stroke-dasharray="6 4"' : "";
    const stroke = lvl.isContinuum ? "#475569" : "#1e293b";
    parts.push(
      `<line x1="${coord(barLeft)}" y1="${coord(y)}" x2="${coord(barRight)}" y2="${coord(y)}" stroke="${stroke}" stroke-width="2"${dash}/>`,
    );

    if (
      guard.canShowInput([`level:${lvl.id}:label`, "levelLabels"]) &&
      !guard.isExplicitlyHidden(["maxPrincipalN", "principalQuantumNumber"])
    ) {
      const safeLvlLabel = guard.textContainsHiddenNumber(lvl.label)
        ? lvl.isContinuum
          ? "continuum"
          : lvl.principalQuantumNumber !== undefined
            ? `L${toSubscript(lvl.principalQuantumNumber)}`
            : ""
        : lvl.label;
      if (safeLvlLabel) {
        parts.push(
          `<text x="${coord(barLeft - 12)}" y="${coord(y + 4)}" text-anchor="end" font-size="13" fill="#1e293b">${escapeXml(safeLvlLabel)}</text>`,
        );
      }
    }

    const isGround = lvl.id === solution.groundStateId;
    const isRefBound = lvl.id === solution.referenceBoundLevelId;
    const isCont =
      lvl.isContinuum ||
      Math.abs(lvl.energyEv - solution.continuumEnergyEv) < 1e-9;

    const zeroEndpointTransitionKeys: string[] = [];
    for (const tr of solution.transitions) {
      if (tr.fromLevelId !== lvl.id && tr.toLevelId !== lvl.id) continue;
      const otherId =
        tr.fromLevelId === lvl.id ? tr.toLevelId : tr.fromLevelId;
      const otherLvl = levelById.get(otherId);
      if (
        Math.abs(lvl.energyEv) < 1e-12 ||
        (otherLvl !== undefined && Math.abs(otherLvl.energyEv) < 1e-12)
      ) {
        zeroEndpointTransitionKeys.push(
          `transition:${tr.id}:deltaEnergyEv`,
          `transition:${tr.id}:signedDeltaEnergyEv`,
          `transition:${tr.id}:photonEnergyJ`,
          "deltaEnergyEv",
          "signedDeltaEnergyEv",
          "photonEnergyJ",
          "transitionEnergies",
        );
      }
    }

    const energyAliases = [
      lvl.id,
      `level:${lvl.id}`,
      `level:${lvl.id}:energyEv`,
      `level:${lvl.id}:energyJ`,
      `E_${lvl.id}`,
      lvl.principalQuantumNumber !== undefined
        ? `E_${lvl.principalQuantumNumber}`
        : "",
      lvl.principalQuantumNumber !== undefined
        ? `E${lvl.principalQuantumNumber}`
        : "",
      "levelEnergies",
    ].filter(Boolean);

    const semanticHiddenKeys = [
      ...(isGround
        ? [
            "groundStateEnergyEv",
            "groundStateEnergyJ",
            "groundStateEnergy",
            "groundState",
          ]
        : []),
      ...(isGround || isRefBound
        ? [
            "ionizationEnergyEv",
            "ionizationEnergyJ",
            "ionizationFrequencyHz",
            "ionizationWavelengthM",
            "ionizationWavelengthNm",
          ]
        : []),
      ...(isCont
        ? [
            "continuumEnergyEv",
            "continuumEnergyJ",
            "continuumEnergy",
            "ionizationEnergyEv",
            "ionizationEnergyJ",
          ]
        : []),
      ...zeroEndpointTransitionKeys,
    ];

    const canShowBarEnergy =
      guard.canShowInput(energyAliases) &&
      !guard.isExplicitlyHidden(semanticHiddenKeys) &&
      !guard.matchesHiddenValue(lvl.energyEv) &&
      !guard.matchesHiddenValue(lvl.energyJ);

    if (canShowBarEnergy) {
      const textVal =
        displayUnit === "J"
          ? formatScientificSigFigs(lvl.energyJ, 3, "J")
          : `${lvl.energyEv < 0 ? "−" : ""}${Number(Math.abs(lvl.energyEv).toPrecision(3))} eV`;
      parts.push(
        `<text x="${coord(barRight + 12)}" y="${coord(y + 4)}" text-anchor="start" font-size="13" fill="#0f172a">${escapeXml(textVal)}</text>`,
      );
    } else {
      const sym = guard.placeholder(
        lvl.id,
        lvl.principalQuantumNumber !== undefined
          ? `E${toSubscript(lvl.principalQuantumNumber)}`
          : lvl.isContinuum
            ? "E∞"
            : "E = ?",
      );
      if (sym) {
        parts.push(
          `<text x="${coord(barRight + 12)}" y="${coord(y + 4)}" text-anchor="start" font-size="13" font-style="italic" fill="#475569">${escapeXml(sym)}</text>`,
        );
      }
    }
  });

  // Render vertical transition arrows + wavy photon squiggles
  const trCount = solution.transitions.length;
  const usableWidth = barRight - barLeft - 56;
  solution.transitions.forEach((tr, idx) => {
    const x =
      trCount === 1
        ? (barLeft + barRight) / 2
        : barLeft + 28 + (usableWidth * idx) / (trCount - 1);
    const yFrom = yById.get(tr.fromLevelId)!;
    const yTo = yById.get(tr.toLevelId)!;
    const isEmission = tr.process === "emission";
    const stroke = isEmission ? "#1d4ed8" : "#b91c1c";
    const marker = isEmission ? emitArrowId : absorbArrowId;
    const dir = yTo > yFrom ? 1 : -1;
    const yEnd = yTo - dir * 3;

    parts.push(
      `<line x1="${coord(x)}" y1="${coord(yFrom)}" x2="${coord(x)}" y2="${coord(yEnd)}" stroke="${stroke}" stroke-width="2" marker-end="url(#${marker})"/>`,
      `<circle cx="${coord(x)}" cy="${coord(yFrom)}" r="3" fill="${stroke}"/>`,
    );

    // Small wavy photon cue at midpoint
    const yMid = (yFrom + yTo) / 2;
    const waveLen = 22;
    const xStart = isEmission ? x + 4 : x - waveLen - 4;
    const xFinish = isEmission ? x + 4 + waveLen : x - 4;
    const waveD = `M ${coord(xStart)} ${coord(yMid)} q 3.5 -4 7 0 t 7 0 t 8 0`;
    parts.push(
      `<path d="${waveD}" fill="none" stroke="#475569" stroke-width="1.3" marker-end="url(#${photonArrowId})"/>`,
      `<line x1="${coord(xStart)}" y1="${coord(yMid)}" x2="${coord(xFinish)}" y2="${coord(yMid)}" stroke="none"/>`,
    );

    const safeTrLabel = guard.textContainsHiddenNumber(tr.label)
      ? tr.label.replace(/\d+/g, (digits) => toSubscript(digits))
      : tr.label;

    // Transition label (derived wavelength/energy is hidden unless explicitly in givenQuantities)
    let badgeText = safeTrLabel;
    if (
      guard.canShowDerived([
        `transition:${tr.id}:wavelengthNm`,
        "wavelengthNm",
        "transitionWavelengths",
      ]) &&
      !guard.isExplicitlyHidden([
        `transition:${tr.id}:wavelengthM`,
        "wavelengthM",
        `transition:${tr.id}:frequencyHz`,
        "frequencyHz",
      ]) &&
      !guard.matchesHiddenValue(tr.wavelengthNm) &&
      !guard.matchesHiddenValue(tr.wavelengthM)
    ) {
      badgeText = `${safeTrLabel} (${formatScientificSigFigs(tr.wavelengthNm, 3, "nm")})`;
    } else if (
      guard.canShowDerived([
        `transition:${tr.id}:deltaEnergyEv`,
        "deltaEnergyEv",
        "transitionEnergies",
      ]) &&
      !guard.isExplicitlyHidden([
        `transition:${tr.id}:signedDeltaEnergyEv`,
        "signedDeltaEnergyEv",
        `transition:${tr.id}:photonEnergyJ`,
        "photonEnergyJ",
      ]) &&
      !guard.matchesHiddenValue(tr.deltaEnergyEv) &&
      !guard.matchesHiddenValue(tr.photonEnergyJ)
    ) {
      badgeText = `${safeTrLabel} (${formatScientificSigFigs(tr.deltaEnergyEv, 3, "eV")})`;
    }

    if (!guard.isExplicitlyHidden([`transition:${tr.id}`, "transitionLabels"])) {
      parts.push(
        `<rect x="${coord(x - 14)}" y="${coord(yMid - 19)}" width="28" height="15" rx="3" fill="#ffffff" opacity="0.9"/>`,
        `<text x="${coord(x)}" y="${coord(yMid - 8)}" text-anchor="middle" font-size="12" font-weight="700" fill="${stroke}">${escapeXml(badgeText)}</text>`,
      );
    }
  });

  // Render crisp Spectral Line Strip below energy levels
  if (showStrip) {
    const stripLeft = 92;
    const stripRight = width - 92;
    const stripTop = height - 82;
    const stripHeight = 32;
    const stripWidth = stripRight - stripLeft;

    const allAbsorption =
      spec.spectralStripMode === "absorption" ||
      (spec.spectralStripMode !== "emission" &&
        solution.transitions.every((t) => t.process === "absorption"));

    parts.push(
      `<text x="${coord(stripLeft)}" y="${coord(stripTop - 8)}" font-size="12" font-weight="600" fill="#334155">${allAbsorption ? "Absorption line spectrum" : "Emission line spectrum"}</text>`,
      `<text x="${coord(stripRight)}" y="${coord(stripTop - 8)}" text-anchor="end" font-size="11" fill="#475569">increasing wavelength λ →</text>`,
      `<rect x="${coord(stripLeft)}" y="${coord(stripTop)}" width="${coord(stripWidth)}" height="${coord(stripHeight)}" rx="4" fill="${allAbsorption ? "#e2e8f0" : "#0f172a"}" stroke="#334155" stroke-width="1.5"/>`,
    );

    const wavelengths = solution.transitions.map((t) => t.wavelengthNm);
    const minWl = Math.min(...wavelengths);
    const maxWl = Math.max(...wavelengths);
    const logMin = Math.log(minWl * 0.9);
    const logMax = Math.log(maxWl * 1.1);
    const logSpan = Math.max(1e-6, logMax - logMin);

    solution.transitions.forEach((tr) => {
      const frac =
        solution.transitions.length === 1
          ? 0.5
          : (Math.log(tr.wavelengthNm) - logMin) / logSpan;
      const lx = stripLeft + 18 + frac * (stripWidth - 36);
      const lineStroke = allAbsorption
        ? "#0f172a"
        : spectralLineColorHex(tr.wavelengthNm);
      parts.push(
        `<line x1="${coord(lx)}" y1="${coord(stripTop + 2)}" x2="${coord(lx)}" y2="${coord(stripTop + stripHeight - 2)}" stroke="${lineStroke}" stroke-width="2.8"/>`,
      );
      if (
        !guard.isExplicitlyHidden([`transition:${tr.id}`, "transitionLabels"])
      ) {
        const safeStripLabel = guard.textContainsHiddenNumber(tr.label)
          ? tr.label.replace(/\d+/g, (digits) => toSubscript(digits))
          : tr.label;
        parts.push(
          `<text x="${coord(lx)}" y="${coord(stripTop + stripHeight + 15)}" text-anchor="middle" font-size="11" font-weight="700" fill="#1e293b">${escapeXml(safeStripLabel)}</text>`,
        );
      }
    });
  }

  return {
    title: "Atomic energy level and line spectrum diagram",
    ariaLabel: "Atomic energy level diagram with radiative transitions",
    desc: "Discrete atomic energy levels and radiative transitions",
    defs,
    body: parts.join(""),
  };
}

// ---------------------------------------------------------------------------
// 2. Photoelectric Effect Graph SVG
// ---------------------------------------------------------------------------

export function renderPhotoelectricBody(
  spec: PhotoelectricScenarioSpec,
  solution: PhotoelectricSolution,
  guard: VisibilityGuard,
  width: number,
  height: number,
  uid: string,
): SvgBodyResult {
  const padLeft = 86;
  const padRight = 46;
  const padTop = 38;
  const padBottom = 58;

  const showExtrap = spec.showExtrapolation ?? true;
  const fScale = 1e14;
  const yScale = solution.plotMode === "ek-j-vs-f" ? 1e-19 : 1;

  const f0Scaled = solution.thresholdFrequencyHz / fScale;
  const fIncScaled = solution.incidentFrequencyHz / fScale;
  const compF0Scaled = solution.comparison
    ? solution.comparison.thresholdFrequencyHz / fScale
    : f0Scaled;

  const maxFScaled = Math.ceil(
    Math.max(f0Scaled * 2.1, fIncScaled * 1.25, compF0Scaled * 1.8, 8),
  );
  const slopeScaled = (solution.graphSlope * fScale) / yScale;
  const yIntScaled = solution.yIntercept / yScale;
  const compYIntScaled = solution.comparison
    ? solution.comparison.yIntercept / yScale
    : yIntScaled;

  const maxYScaled = Math.max(
    1,
    Math.ceil((yIntScaled + slopeScaled * maxFScaled) * 1.15),
  );
  const minYScaled = showExtrap
    ? Math.floor(Math.min(yIntScaled, compYIntScaled) * 1.2)
    : 0;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const xPx = (fVal: number) => padLeft + (fVal / maxFScaled) * plotW;
  const yPx = (yVal: number) =>
    padTop + ((maxYScaled - yVal) / (maxYScaled - minYScaled)) * plotH;

  const zeroY = yPx(0);
  const zeroX = xPx(0);

  const axisArrowId = `qn-pe-axis-${uid}`;
  const defs = `<marker id="${axisArrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#0f172a"/></marker>`;
  const parts: string[] = [];

  const xStep = niceStep(maxFScaled, 5);
  const yStep = niceStep(maxYScaled - minYScaled, 6);
  const xTicks = buildTicks(0, maxFScaled, xStep);
  const yTicks = buildTicks(minYScaled, maxYScaled, yStep);

  // Full-axis tick suppression: never leave a deducible single blank tick on a linear axis
  const anyXKeyHidden = guard.isExplicitlyHidden([
    "thresholdFrequencyHz",
    "f0",
    "thresholdWavelengthM",
    "thresholdWavelengthNm",
    "incidentFrequencyHz",
    "incidentWavelengthM",
    "incidentWavelengthNm",
    "incidentPhotonEnergyEv",
    "photonEnergyEv",
    "photonEnergyJ",
    "workFunctionEv",
    "workFunctionJ",
    "comparisonWorkFunctionEv",
    "comparisonThresholdFrequencyHz",
    "comparison:workFunctionEv",
    "comparison:thresholdFrequencyHz",
    "graphSlope",
  ]);
  const anyYKeyHidden = guard.isExplicitlyHidden([
    "workFunctionEv",
    "workFunctionJ",
    "yIntercept",
    "stoppingPotentialV",
    "maxKineticEnergyEv",
    "maxKineticEnergyJ",
    "signedEnergyBalanceEv",
    "maxElectronSpeedMs",
    "photonEnergyEv",
    "photonEnergyJ",
    "incidentPhotonEnergyEv",
    "comparisonWorkFunctionEv",
    "comparisonYIntercept",
    "comparison:workFunctionEv",
    "comparison:yIntercept",
    "graphSlope",
  ]);

  const schematic =
    Boolean(spec.schematicAxes) || guard.isExplicitlyHidden(["axisTicks"]);

  const xTickCollides =
    guard.matchesHiddenValue(10) ||
    guard.matchesHiddenValue(fScale) ||
    xTicks.some(
      (tx) =>
        tx !== 0 &&
        (guard.matchesHiddenValue(tx) ||
          guard.matchesHiddenValue(tx * fScale)),
    );
  const yTickCollides =
    (solution.plotMode === "ek-j-vs-f" &&
      (guard.matchesHiddenValue(10) || guard.matchesHiddenValue(yScale))) ||
    yTicks.some(
      (ty) =>
        guard.matchesHiddenValue(ty) || guard.matchesHiddenValue(ty * yScale),
    );

  const showXTicks =
    !schematic &&
    !anyXKeyHidden &&
    !xTickCollides &&
    guard.canShowInput(["xAxisTicks", "axisTicks"]);
  const showYTicks =
    !schematic &&
    !anyYKeyHidden &&
    !yTickCollides &&
    guard.canShowInput(["yAxisTicks", "axisTicks"]);

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
    `<line x1="${coord(zeroX)}" y1="${coord(padTop + plotH)}" x2="${coord(zeroX)}" y2="${coord(padTop - 8)}" stroke="#0f172a" stroke-width="1.8" marker-end="url(#${axisArrowId})"/>`,
    `<line x1="${coord(padLeft)}" y1="${coord(zeroY)}" x2="${coord(padLeft + plotW + 8)}" y2="${coord(zeroY)}" stroke="#0f172a" stroke-width="1.8" marker-end="url(#${axisArrowId})"/>`,
  );

  // Tick marks and student-safe labels
  if (showXTicks) {
    xTicks.forEach((tx) => {
      if (tx === 0) return;
      const px = xPx(tx);
      parts.push(
        `<line x1="${coord(px)}" y1="${coord(zeroY - 4)}" x2="${coord(px)}" y2="${coord(zeroY + 4)}" stroke="#0f172a" stroke-width="1.3"/>`,
        `<text x="${coord(px)}" y="${coord(zeroY + 18)}" text-anchor="middle" font-size="12" fill="#334155">${escapeXml(formatCleanTick(tx))}</text>`,
      );
    });
  }

  if (showYTicks) {
    yTicks.forEach((ty) => {
      const py = yPx(ty);
      parts.push(
        `<line x1="${coord(zeroX - 4)}" y1="${coord(py)}" x2="${coord(zeroX + 4)}" y2="${coord(py)}" stroke="#0f172a" stroke-width="1.3"/>`,
        `<text x="${coord(zeroX - 10)}" y="${coord(py + 4)}" text-anchor="end" font-size="12" fill="#334155">${escapeXml(formatCleanTick(ty))}</text>`,
      );
    });
  }

  // Axis titles (omit 10^14 / 10^-19 scale factor when numeric axis ticks are suppressed)
  const xAxisTitle = showXTicks
    ? "Frequency f / 10¹⁴ Hz"
    : "Frequency f / Hz";
  const yAxisTitle =
    solution.plotMode === "stopping-potential-vs-f"
      ? "Stopping potential Vₛ / V"
      : solution.plotMode === "ek-j-vs-f"
        ? showYTicks
          ? "Max kinetic energy Eₖ,ₘₐₓ / 10⁻¹⁹ J"
          : "Max kinetic energy Eₖ,ₘₐₓ / J"
        : "Max kinetic energy Eₖ,ₘₐₓ / eV";
  parts.push(
    `<text x="${coord(padLeft + plotW / 2)}" y="${coord(height - 14)}" text-anchor="middle" font-size="13" font-weight="600" fill="#0f172a">${escapeXml(xAxisTitle)}</text>`,
    `<text x="22" y="${coord(padTop + plotH / 2)}" text-anchor="middle" font-size="13" font-weight="600" fill="#0f172a" transform="rotate(-90 22 ${coord(padTop + plotH / 2)})">${escapeXml(yAxisTitle)}</text>`,
  );

  // Dashed extrapolation below f0
  if (showExtrap) {
    parts.push(
      `<line x1="${coord(xPx(0))}" y1="${coord(yPx(yIntScaled))}" x2="${coord(xPx(f0Scaled))}" y2="${coord(zeroY)}" stroke="#1d4ed8" stroke-width="1.8" stroke-dasharray="6 4"/>`,
      `<circle cx="${coord(zeroX)}" cy="${coord(yPx(yIntScaled))}" r="3.5" fill="#1d4ed8"/>`,
    );
    const yIntSym =
      solution.plotMode === "stopping-potential-vs-f" ? "−ϕ/e" : "−ϕ";
    const canShowWf =
      guard.canShowInput(["workFunctionEv", "workFunctionJ"]) &&
      guard.canShowDerived(["yIntercept"]) &&
      !guard.isExplicitlyHidden([
        "workFunctionEv",
        "workFunctionJ",
        "yIntercept",
        "thresholdFrequencyHz",
        "f0",
        "thresholdWavelengthM",
        "thresholdWavelengthNm",
      ]) &&
      !guard.matchesHiddenValue(yIntScaled) &&
      !guard.matchesHiddenValue(solution.yIntercept) &&
      !guard.matchesHiddenValue(solution.workFunctionEv) &&
      !guard.matchesHiddenValue(solution.workFunctionJ);
    const yIntLabel = canShowWf
      ? `${yIntSym} = ${formatCleanTick(Number(yIntScaled.toPrecision(3)))}`
      : guard.placeholder("yIntercept", yIntSym);
    if (yIntLabel) {
      parts.push(
        `<text x="${coord(zeroX + 8)}" y="${coord(yPx(yIntScaled) + 4)}" font-size="12" font-weight="600" fill="#1d4ed8">${escapeXml(yIntLabel)}</text>`,
      );
    }
  }

  // Active photoelectric line for f >= f0
  const fEnd = maxFScaled;
  const yEnd = yIntScaled + slopeScaled * fEnd;
  const fClampedEnd =
    yEnd > maxYScaled ? (maxYScaled - yIntScaled) / slopeScaled : fEnd;
  const yClampedEnd = yIntScaled + slopeScaled * fClampedEnd;

  parts.push(
    `<line x1="${coord(xPx(f0Scaled))}" y1="${coord(zeroY)}" x2="${coord(xPx(fClampedEnd))}" y2="${coord(yPx(yClampedEnd))}" stroke="#1d4ed8" stroke-width="2.6"/>`,
    `<circle cx="${coord(xPx(f0Scaled))}" cy="${coord(zeroY)}" r="4" fill="#1d4ed8"/>`,
  );

  // Threshold frequency callout (derived f0 is never printed numerically unless in givenQuantities and non-colliding)
  const canShowF0Numeric =
    guard.canShowDerived(["thresholdFrequencyHz", "f0"]) &&
    !guard.isExplicitlyHidden([
      "thresholdFrequencyHz",
      "f0",
      "thresholdWavelengthM",
      "thresholdWavelengthNm",
      "workFunctionEv",
      "workFunctionJ",
    ]) &&
    !guard.matchesHiddenValue(solution.thresholdFrequencyHz);
  const f0Text = canShowF0Numeric
    ? `f₀ = ${formatScientificSigFigs(solution.thresholdFrequencyHz, 3, "Hz")}`
    : guard.placeholder("thresholdFrequencyHz", "f₀");
  if (f0Text) {
    parts.push(
      `<text x="${coord(xPx(f0Scaled) + 6)}" y="${coord(zeroY - 8)}" font-size="12" font-weight="700" fill="#1d4ed8">${escapeXml(f0Text)}</text>`,
    );
  }

  // Optional comparison metal parallel line
  if (solution.comparison) {
    if (showExtrap) {
      parts.push(
        `<line x1="${coord(zeroX)}" y1="${coord(yPx(compYIntScaled))}" x2="${coord(xPx(compF0Scaled))}" y2="${coord(zeroY)}" stroke="#0f766e" stroke-width="1.6" stroke-dasharray="5 4"/>`,
      );
    }
    const compYEnd = compYIntScaled + slopeScaled * fEnd;
    const compFEnd =
      compYEnd > maxYScaled
        ? (maxYScaled - compYIntScaled) / slopeScaled
        : fEnd;
    const compYClamped = compYIntScaled + slopeScaled * compFEnd;
    parts.push(
      `<line x1="${coord(xPx(compF0Scaled))}" y1="${coord(zeroY)}" x2="${coord(xPx(compFEnd))}" y2="${coord(yPx(compYClamped))}" stroke="#0f766e" stroke-width="2.2"/>`,
    );
    if (
      guard.canShowInput(["comparisonMetalName"]) &&
      !guard.isExplicitlyHidden(["metalName"]) &&
      !guard.textContainsHiddenNumber(solution.comparison.metalName)
    ) {
      parts.push(
        `<text x="${coord(xPx(compFEnd) - 8)}" y="${coord(yPx(compYClamped) + 16)}" text-anchor="end" font-size="12" font-weight="600" fill="#0f766e">${escapeXml(solution.comparison.metalName)}</text>`,
      );
    }
  }

  // Optional operating point marker
  if (spec.showOperatingPoint && solution.emitsPhotoelectrons) {
    const opY =
      solution.plotMode === "stopping-potential-vs-f"
        ? solution.stoppingPotentialV
        : solution.plotMode === "ek-j-vs-f"
          ? solution.maxKineticEnergyJ / yScale
          : solution.maxKineticEnergyEv;
    parts.push(
      `<line x1="${coord(xPx(fIncScaled))}" y1="${coord(zeroY)}" x2="${coord(xPx(fIncScaled))}" y2="${coord(yPx(opY))}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="4 3"/>`,
      `<line x1="${coord(zeroX)}" y1="${coord(yPx(opY))}" x2="${coord(xPx(fIncScaled))}" y2="${coord(yPx(opY))}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="4 3"/>`,
      `<circle cx="${coord(xPx(fIncScaled))}" cy="${coord(yPx(opY))}" r="4.5" fill="#dc2626"/>`,
    );
  }

  if (
    guard.canShowInput(["metalName"]) &&
    !guard.textContainsHiddenNumber(solution.metalName)
  ) {
    parts.push(
      `<text x="${coord(xPx(fClampedEnd) - 6)}" y="${coord(yPx(yClampedEnd) - 8)}" text-anchor="end" font-size="12" font-weight="700" fill="#1d4ed8">${escapeXml(solution.metalName)}</text>`,
    );
  }

  return {
    title: "Photoelectric effect characteristic graph",
    ariaLabel: "Photoelectric linear graph against incident frequency",
    desc: "Linear relationship between photoelectron maximum energy or stopping potential and incident frequency",
    defs,
    body: parts.join(""),
  };
}

// ---------------------------------------------------------------------------
// 3. Matter Waves & Electron Diffraction SVG
// ---------------------------------------------------------------------------

export function renderMatterWavesBody(
  spec: MatterWavesScenarioSpec,
  solution: MatterWavesSolution,
  guard: VisibilityGuard,
  width: number,
  height: number,
  uid: string,
): SvgBodyResult {
  const arrowId = `qn-mw-arrow-${uid}`;
  const dimArrowId = `qn-mw-dim-${uid}`;
  const defs = [
    `<marker id="${arrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#0f172a"/></marker>`,
    `<marker id="${dimArrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 1L9 5L0 9Z" fill="#1d4ed8"/></marker>`,
  ].join("");

  const parts: string[] = [];
  const cy = height * 0.52;
  const hasDiffraction = Boolean(solution.diffraction);
  const waveStart = 148;
  const waveEnd = hasDiffraction ? width * 0.54 : width - 84;

  // Source / accelerator block on the left
  parts.push(
    `<rect x="36" y="${coord(cy - 36)}" width="92" height="72" rx="6" fill="#f8fafc" stroke="#1e293b" stroke-width="2"/>`,
    `<line x1="128" y1="${coord(cy - 36)}" x2="128" y2="${coord(cy - 10)}" stroke="#0f172a" stroke-width="3"/>`,
    `<line x1="128" y1="${coord(cy + 10)}" x2="128" y2="${coord(cy + 36)}" stroke="#0f172a" stroke-width="3"/>`,
    `<circle cx="66" cy="${coord(cy)}" r="8" fill="#1d4ed8"/>`,
    `<line x1="76" y1="${coord(cy)}" x2="122" y2="${coord(cy)}" stroke="#0f172a" stroke-width="1.8" marker-end="url(#${arrowId})"/>`,
  );

  if (
    guard.canShowInput(["particleLabel", "particle"]) &&
    !guard.textContainsHiddenNumber(solution.particleLabel)
  ) {
    parts.push(
      `<text x="82" y="${coord(cy - 46)}" text-anchor="middle" font-size="13" font-weight="700" fill="#0f172a">${escapeXml(solution.particleLabel)} source</text>`,
    );
  }

  if (
    spec.acceleratingVoltageV !== undefined &&
    solution.acceleratingVoltageV !== null
  ) {
    const vEqualsEkEv =
      Math.abs(solution.kineticEnergyEv - solution.acceleratingVoltageV) <=
      1e-6 * Math.max(1, Math.abs(solution.acceleratingVoltageV));
    const canShowVoltage =
      guard.canShowInput(["acceleratingVoltageV"]) &&
      !(vEqualsEkEv && guard.isExplicitlyHidden(["kineticEnergyEv"])) &&
      !guard.matchesHiddenValue(solution.acceleratingVoltageV);
    const vText = canShowVoltage
      ? `V = ${formatScientificSigFigs(solution.acceleratingVoltageV, 3, "V")}`
      : guard.placeholder("acceleratingVoltageV", "V");
    if (vText) {
      parts.push(
        `<text x="82" y="${coord(cy + 56)}" text-anchor="middle" font-size="12" font-weight="600" fill="#334155">${escapeXml(vText)}</text>`,
      );
    }
  } else if (spec.speedMs !== undefined) {
    const canShowSpeed =
      guard.canShowInput(["speedMs"]) &&
      !guard.matchesHiddenValue(solution.speedMs);
    const sText = canShowSpeed
      ? `v = ${formatScientificSigFigs(solution.speedMs, 3, "m s⁻¹")}`
      : guard.placeholder("speedMs", "v");
    if (sText) {
      parts.push(
        `<text x="82" y="${coord(cy + 56)}" text-anchor="middle" font-size="12" font-weight="600" fill="#334155">${escapeXml(sText)}</text>`,
      );
    }
  }

  // Modulated sinusoidal de Broglie wave packet
  const cycles = 5;
  const spanPx = waveEnd - waveStart;
  const visualWlPx = spanPx / cycles;
  const ampPx = 32;
  const sampleCount = 120;
  const pts: string[] = [];
  for (let i = 0; i <= sampleCount; i += 1) {
    const u = i / sampleCount;
    const x = waveStart + u * spanPx;
    const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0.18, u)));
    const y = cy - ampPx * envelope * Math.sin(2 * Math.PI * cycles * u);
    pts.push(`${coord(x)},${coord(y)}`);
  }
  parts.push(
    `<line x1="${coord(waveStart - 10)}" y1="${coord(cy)}" x2="${coord(waveEnd + 14)}" y2="${coord(cy)}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="5 4"/>`,
    `<polyline points="${pts.join(" ")}" fill="none" stroke="#1d4ed8" stroke-width="2.4"/>`,
  );

  // Crest-to-crest de Broglie wavelength dimension callout
  const crest1X = waveStart + 1.25 * visualWlPx;
  const crest2X = waveStart + 2.25 * visualWlPx;
  const dimY = cy - ampPx - 18;
  parts.push(
    `<line x1="${coord(crest1X)}" y1="${coord(cy - ampPx)}" x2="${coord(crest1X)}" y2="${coord(dimY - 4)}" stroke="#64748b" stroke-width="1" stroke-dasharray="3 3"/>`,
    `<line x1="${coord(crest2X)}" y1="${coord(cy - ampPx)}" x2="${coord(crest2X)}" y2="${coord(dimY - 4)}" stroke="#64748b" stroke-width="1" stroke-dasharray="3 3"/>`,
    `<line x1="${coord(crest1X + 2)}" y1="${coord(dimY)}" x2="${coord(crest2X - 2)}" y2="${coord(dimY)}" stroke="#1d4ed8" stroke-width="1.6" marker-start="url(#${dimArrowId})" marker-end="url(#${dimArrowId})"/>`,
  );

  const canShowLambda =
    guard.canShowDerived([
      "deBroglieWavelengthM",
      "deBroglieWavelengthNm",
      "deBroglieWavelengthPm",
      "wavelength",
    ]) &&
    !guard.isExplicitlyHidden([
      "deBroglieWavelengthM",
      "deBroglieWavelengthNm",
      "deBroglieWavelengthPm",
      "wavelength",
    ]) &&
    !guard.matchesHiddenValue(solution.deBroglieWavelengthM);

  const lambdaLabel = canShowLambda
    ? `λ = ${formatScientificSigFigs(solution.deBroglieWavelengthM, 3, "m")}`
    : guard.placeholder("deBroglieWavelengthM", "λ = h / p");
  if (lambdaLabel) {
    parts.push(
      `<text x="${coord((crest1X + crest2X) / 2)}" y="${coord(dimY - 8)}" text-anchor="middle" font-size="13" font-weight="700" fill="#1d4ed8">${escapeXml(lambdaLabel)}</text>`,
    );
  }

  // Polycrystalline foil + concentric diffraction rings when latticeSpacingM is given
  if (solution.diffraction) {
    const foilX = waveEnd + 18;
    const screenCx = width - 92;
    const screenR = 58;
    const ringR1 = Math.max(
      14,
      Math.min(
        44,
        46 * Math.min(0.95, solution.diffraction.sinTheta * 1.4 + 0.3),
      ),
    );
    const ringR2 = Math.min(52, ringR1 * 1.55);

    parts.push(
      `<rect x="${coord(foilX - 4)}" y="${coord(cy - 54)}" width="8" height="108" fill="#cbd5e1" stroke="#334155" stroke-width="1.6"/>`,
      `<text x="${coord(foilX)}" y="${coord(cy + 72)}" text-anchor="middle" font-size="12" fill="#334155">crystal foil</text>`,
      `<line x1="${coord(foilX + 4)}" y1="${coord(cy)}" x2="${coord(screenCx - screenR - 8)}" y2="${coord(cy - ringR1)}" stroke="#0f766e" stroke-width="1.6" stroke-dasharray="4 3"/>`,
      `<line x1="${coord(foilX + 4)}" y1="${coord(cy)}" x2="${coord(screenCx - screenR - 8)}" y2="${coord(cy + ringR1)}" stroke="#0f766e" stroke-width="1.6" stroke-dasharray="4 3"/>`,
      `<circle cx="${coord(screenCx)}" cy="${coord(cy)}" r="${coord(screenR)}" fill="#0f172a" stroke="#334155" stroke-width="2"/>`,
      `<circle cx="${coord(screenCx)}" cy="${coord(cy)}" r="${coord(ringR2)}" fill="none" stroke="#38bdf8" stroke-width="1.5" opacity="0.7"/>`,
      `<circle cx="${coord(screenCx)}" cy="${coord(cy)}" r="${coord(ringR1)}" fill="none" stroke="#22d3ee" stroke-width="2.4"/>`,
      `<circle cx="${coord(screenCx)}" cy="${coord(cy)}" r="3.5" fill="#f8fafc"/>`,
      `<text x="${coord(screenCx)}" y="${coord(cy + screenR + 18)}" text-anchor="middle" font-size="12" fill="#0f172a">diffraction rings</text>`,
    );
  }

  return {
    title: "De Broglie matter-wave diagram",
    ariaLabel: `Matter-wave schematic${hasDiffraction ? " with polycrystalline diffraction rings" : ""}`,
    desc: "Accelerated matter-wave packet illustrating de Broglie wavelength",
    defs,
    body: parts.join(""),
  };
}
