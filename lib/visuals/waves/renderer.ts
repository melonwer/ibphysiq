import {
  DiffractionGratingScenarioSpec,
  DiffractionGratingSolution,
  DopplerEffectScenarioSpec,
  DopplerEffectSolution,
  DoubleSlitScenarioSpec,
  DoubleSlitSolution,
  HiddenQuantityId,
  MalusPolarizationScenarioSpec,
  MalusPolarizationSolution,
  ProgressiveWaveScenarioSpec,
  ProgressiveWaveSolution,
  SingleSlitScenarioSpec,
  SingleSlitSolution,
  StandingWaveScenarioSpec,
  StandingWaveSolution,
  WavesQuantityKey,
  WavesRenderOptions,
  WavesScenarioSpec,
  WavesSolution,
} from "./types";
import {
  evaluateDoubleSlitRelativeIntensity,
  evaluateProgressiveWaveProfile,
  evaluateSingleSlitRelativeIntensity,
  evaluateStandingWaveEnvelope,
  exactCosDegrees,
  solveWavesScenario,
} from "./solver";

const SUPERSCRIPT_DIGITS: Record<string, string> = {
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

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[ch] ?? ch,
  );
}

function num(value: number): string {
  const rounded = Number(value.toFixed(4));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function formatSignificant(value: number, sigFigs: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot format non-finite value: ${value}`);
  }
  if (Math.abs(value) < 1e-15) {
    return "0";
  }
  const abs = Math.abs(value);
  if (abs >= 1e4 || abs < 1e-3) {
    const expStr = value.toExponential(sigFigs - 1);
    const [mantissa, expPart] = expStr.split("e");
    const sup = [...expPart].map((c) => SUPERSCRIPT_DIGITS[c] ?? c).join("");
    return `${Number(mantissa)} × 10${sup}`;
  }
  const precise = Number(value.toPrecision(sigFigs));
  return Object.is(precise, -0) ? "0" : String(precise);
}

function formatLengthAuto(meters: number, sigFigs: number): string {
  const abs = Math.abs(meters);
  if (abs === 0) return "0 m";
  if (abs >= 1e-7 && abs < 1e-6) {
    return `${formatSignificant(meters * 1e9, sigFigs)} nm`;
  }
  if (abs >= 1e-6 && abs < 1e-4) {
    return `${formatSignificant(meters * 1e6, sigFigs)} μm`;
  }
  if (abs >= 1e-4 && abs < 1e-1) {
    return `${formatSignificant(meters * 1e3, sigFigs)} mm`;
  }
  return `${formatSignificant(meters, sigFigs)} m`;
}

function formatQuantityWithUnit(
  value: number,
  unit: string,
  sigFigs: number,
): string {
  const formatted = formatSignificant(value, sigFigs);
  return unit ? `${formatted} ${unit}` : formatted;
}

interface VisibilityGuard {
  isHidden: (...keys: HiddenQuantityId[]) => boolean;
  leaksHiddenText: (text: string) => boolean;
  labelText: (
    key: WavesQuantityKey,
    symbolOnly: string,
    fullWithValue: string,
    coupledKeys?: readonly HiddenQuantityId[],
  ) => string;
  tryBadge: (
    badges: string[],
    text: string,
    ...keys: HiddenQuantityId[]
  ) => void;
  recordVisible: (text: string) => void;
  descriptions: string[];
  sigFigs: number;
}

const SOLVED_DEFAULT_KEYS: ReadonlySet<string> = new Set([
  "waveSpeedMs",
  "periodS",
  "angularFrequencyRadS",
  "wavenumberRadM",
  "crestToTroughM",
  "phaseDifferenceRad",
  "phaseDifferenceModulo2PiRad",
  "principalPhaseDifferenceRad",
  "phaseDifferenceDegrees",
  "effectiveLengthM",
  "wavelengthM",
  "fundamentalFrequencyHz",
  "harmonicFrequencyHz",
  "adjacentNodeSpacingM",
  "nodeToAntinodeSpacingM",
  "fringeSpacingM",
  "nthOrderAngleRad",
  "nthOrderAngleDegrees",
  "nthBrightPositionM",
  "nthBrightExactPositionM",
  "firstDarkPositionM",
  "pathDifferenceM",
  "maxOrder",
  "centralEnvelopeHalfWidthM",
  "centralEnvelopeFullWidthM",
  "linesPerMeter",
  "querySinTheta",
  "queryAngleRad",
  "queryAngleDegrees",
  "queryScreenPositionM",
  "strictlySubNinetyMaxOrder",
  "totalPrincipalMaxima",
  "flatScreenMaximaCount",
  "firstMinimumAngleRad",
  "firstMinimumExactAngleRad",
  "firstMinimumExactAngleDegrees",
  "centralAngularWidthRad",
  "centralHalfWidthM",
  "centralFullWidthM",
  "centralExactHalfWidthM",
  "centralExactFullWidthM",
  "observedFrequencyHz",
  "observedPeriodS",
  "frequencyShiftHz",
  "fractionalFrequencyShift",
  "emittedWavelengthM",
  "mediumWavelengthTowardsObserverM",
  "relativeWaveSpeedAtObserverMs",
  "lowSpeedShiftApproximationHz",
  "intensityBeforeAnalyzerWm2",
  "transmittedIntensityWm2",
  "absorbedIntensityAtAnalyzerWm2",
  "cosThetaSquared",
  "amplitudeTransmissionFactor",
  "overallTransmissionFraction",
]);

function getPrimaryInputKeys(spec: WavesScenarioSpec): Set<string> {
  switch (spec.kind) {
    case "progressive-wave":
      return new Set([
        "amplitudeM",
        "wavelengthM",
        "frequencyHz",
        "initialPhaseRad",
        "snapshotTimeS",
        "fixedPositionM",
        "point1Coord",
        "point2Coord",
      ]);
    case "standing-wave": {
      const keys = new Set(["lengthM", "harmonicNumber", "endCorrectionM"]);
      if (spec.waveSpeedMs !== undefined) keys.add("waveSpeedMs");
      if (spec.tensionN !== undefined) keys.add("tensionN");
      if (spec.linearDensityKgM !== undefined) keys.add("linearDensityKgM");
      if (spec.amplitudeM !== undefined) keys.add("amplitudeM");
      return keys;
    }
    case "double-slit": {
      const keys = new Set([
        "wavelengthM",
        "slitSeparationM",
        "screenDistanceM",
        "orderN",
      ]);
      if (spec.slitWidthM !== undefined) keys.add("slitWidthM");
      return keys;
    }
    case "diffraction-grating": {
      const keys = new Set(["wavelengthM", "slitSpacingM", "queryOrderN"]);
      if (spec.linesPerMm !== undefined) keys.add("linesPerMm");
      if (spec.screenDistanceM !== undefined) keys.add("screenDistanceM");
      return keys;
    }
    case "single-slit":
      return new Set(["wavelengthM", "slitWidthM", "screenDistanceM"]);
    case "doppler-effect":
      return new Set([
        "emittedFrequencyHz",
        "waveSpeedMs",
        "sourceSpeedMs",
        "observerSpeedMs",
        "sourceMotion",
        "observerMotion",
      ]);
    case "malus-polarization":
      return new Set(["incidentIntensityWm2", "analyzerAngleDegrees"]);
  }
}

function extractNumericTokens(text: string): string[] {
  const withoutPowersOfTen = text.replace(/×\s*10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, " ");
  return [...withoutPowersOfTen.matchAll(/[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?/gi)].map(
    (m) => m[0],
  );
}

function createVisibilityGuard(
  spec: WavesScenarioSpec,
  options: WavesRenderOptions,
  solution: WavesSolution,
): VisibilityGuard {
  const hiddenSet = new Set<string>([
    ...(spec.hiddenQuantities ?? []),
    ...(options.hiddenQuantities ?? []),
    ...(spec.visibility?.privateParameterIds ?? []),
    ...(options.visibility?.privateParameterIds ?? []),
  ]);

  const publicList = [
    ...(spec.visibility?.publicParameterIds ?? []),
    ...(options.visibility?.publicParameterIds ?? []),
  ];
  const publicSet = new Set<string>(publicList);

  for (const id of hiddenSet) {
    if (publicSet.has(id)) {
      throw new Error(
        `Visibility conflict: quantity "${id}" cannot be both public and hidden/private`,
      );
    }
  }

  const labelMode =
    options.visibility?.labelMode ??
    spec.visibility?.labelMode ??
    "all-public";
  const showSolved = options.showSolvedQuantities ?? true;
  const primaryInputs = getPrimaryInputKeys(spec);
  const sigFigs = options.significantFigures ?? 3;
  const descriptions: string[] = [];

  const isSingleKeyHidden = (key: string): boolean => {
    if (hiddenSet.has("all") || hiddenSet.has("*")) return true;
    if (hiddenSet.has(key)) return true;
    if (labelMode === "allowlist" && !publicSet.has(key)) return true;
    if (
      !showSolved &&
      SOLVED_DEFAULT_KEYS.has(key) &&
      !primaryInputs.has(key) &&
      !publicSet.has(key)
    ) {
      return true;
    }
    return false;
  };

  const forbiddenTokens = new Set<string>();
  const forbiddenSubstrings = new Set<string>();

  for (const [key, val] of Object.entries(solution.quantities)) {
    if (!isSingleKeyHidden(key)) continue;
    const absVal = Math.abs(val);
    if (absVal < 1e-15) {
      // Only suppress literal "0" when the key was explicitly listed as hidden/private
      if (hiddenSet.has(key) || hiddenSet.has("all") || hiddenSet.has("*")) {
        forbiddenTokens.add("0");
      }
      continue;
    }
    const sigStr = formatSignificant(absVal, sigFigs);
    if (sigStr.includes("×")) {
      forbiddenSubstrings.add(sigStr);
    } else {
      forbiddenTokens.add(sigStr);
    }

    const rawStr = String(absVal);
    if (/^[0-9]+(?:\.[0-9]+)?$/.test(rawStr)) {
      forbiddenTokens.add(rawStr);
    } else {
      forbiddenSubstrings.add(rawStr);
    }

    const isSpatialCoord =
      key.endsWith("M") ||
      (spec.kind === "progressive-wave" &&
        spec.profileKind === "displacement-position" &&
        (key === "point1Coord" ||
          key === "point2Coord" ||
          key === "coordSeparation"));

    if (isSpatialCoord) {
      const lenStr = formatLengthAuto(absVal, sigFigs);
      const numericPart = lenStr.replace(/\s+[a-zμ]+$/i, "").trim();
      if (numericPart.includes("×")) {
        forbiddenSubstrings.add(numericPart);
      } else if (numericPart) {
        forbiddenTokens.add(numericPart);
      }
    }
  }

  const isHidden = (...keys: HiddenQuantityId[]): boolean =>
    keys.some((k) => isSingleKeyHidden(String(k)));

  const leaksHiddenText = (text: string): boolean => {
    for (const sub of forbiddenSubstrings) {
      if (text.includes(sub)) return true;
    }
    if (forbiddenTokens.size > 0) {
      for (const tok of extractNumericTokens(text)) {
        if (forbiddenTokens.has(tok)) return true;
      }
    }
    return false;
  };

  const recordVisible = (text: string): void => {
    const trimmed = text.trim();
    if (trimmed) {
      descriptions.push(trimmed);
    }
  };

  const labelText = (
    key: WavesQuantityKey,
    symbolOnly: string,
    fullWithValue: string,
    coupledKeys: readonly HiddenQuantityId[] = [],
  ): string => {
    if (isHidden(key, ...coupledKeys)) {
      recordVisible(symbolOnly);
      return symbolOnly;
    }
    const custom = spec.customLabels?.[key];
    const chosen = custom ? custom.trim() : fullWithValue;
    if (!publicSet.has(key) && leaksHiddenText(chosen)) {
      recordVisible(symbolOnly);
      return symbolOnly;
    }
    recordVisible(chosen);
    return chosen;
  };

  const tryBadge = (
    badges: string[],
    text: string,
    ...keys: HiddenQuantityId[]
  ): void => {
    if (isHidden(...keys)) return;
    const explicitlyPublic = keys.some((k) => publicSet.has(String(k)));
    if (!explicitlyPublic && leaksHiddenText(text)) return;
    recordVisible(text);
    badges.push(text);
  };

  return {
    isHidden,
    leaksHiddenText,
    labelText,
    tryBadge,
    recordVisible,
    descriptions,
    sigFigs,
  };
}

function defaultSafeTitle(spec: WavesScenarioSpec): string {
  switch (spec.kind) {
    case "progressive-wave":
      return spec.profileKind === "displacement-position"
        ? "Progressive wave displacement-position diagram"
        : "Progressive wave displacement-time diagram";
    case "standing-wave":
      if (spec.boundaryKind === "string-fixed-both") {
        return "Standing wave on a fixed string";
      }
      if (spec.boundaryKind === "pipe-open-both") {
        return "Standing wave in an open pipe";
      }
      return "Standing wave in a closed-end pipe";
    case "double-slit":
      return "Double-slit interference diagram";
    case "diffraction-grating":
      return "Diffraction grating interference diagram";
    case "single-slit":
      return "Single-slit diffraction diagram";
    case "doppler-effect":
      return "Doppler effect wavefront diagram";
    case "malus-polarization":
      return "Malus's law polarization diagram";
  }
}

function sanitizeMarkerSeed(raw?: string): string {
  if (!raw) return "default";
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
  return cleaned || "default";
}

function renderProgressiveWaveSvg(
  spec: ProgressiveWaveScenarioSpec,
  sol: ProgressiveWaveSolution,
  width: number,
  height: number,
  guard: VisibilityGuard,
  markerId: string,
): string {
  const parts: string[] = [];
  const left = 82;
  const right = width - 52;
  const top = 74;
  const bottom = height - 68;
  const midY = (top + bottom) / 2;
  const plotW = right - left;
  const ampPx = (bottom - top) * 0.38;
  const sf = guard.sigFigs;

  const xPx = (coord: number): number =>
    left + (coord / sol.axisDomainMax) * plotW;
  const yPx = (disp: number): number => midY - (disp / sol.amplitudeM) * ampPx;

  // Grid & axes
  parts.push(
    `<line x1="${num(left)}" y1="${num(midY - ampPx)}" x2="${num(right)}" y2="${num(midY - ampPx)}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="4 4"/>`,
    `<line x1="${num(left)}" y1="${num(midY + ampPx)}" x2="${num(right)}" y2="${num(midY + ampPx)}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="4 4"/>`,
    `<line x1="${num(left)}" y1="${num(bottom)}" x2="${num(left)}" y2="${num(top - 12)}" stroke="#1f2937" stroke-width="1.75" marker-end="url(#${markerId})"/>`,
    `<line x1="${num(left)}" y1="${num(midY)}" x2="${num(right + 14)}" y2="${num(midY)}" stroke="#1f2937" stroke-width="1.75" marker-end="url(#${markerId})"/>`,
  );

  const yAxisTitle = "y / m";
  const xAxisTitle =
    spec.profileKind === "displacement-position" ? "x / m" : "t / s";
  guard.recordVisible(yAxisTitle);
  guard.recordVisible(xAxisTitle);
  parts.push(
    `<text x="${num(left - 12)}" y="${num(top - 16)}" text-anchor="middle" font-size="13" font-weight="600" fill="#111827">${escapeXml(yAxisTitle)}</text>`,
    `<text x="${num(right + 8)}" y="${num(midY + 24)}" text-anchor="end" font-size="13" font-weight="600" fill="#111827">${escapeXml(xAxisTitle)}</text>`,
  );
  if (!guard.leaksHiddenText("0")) {
    parts.push(
      `<text x="${num(left - 10)}" y="${num(midY + 4)}" text-anchor="end" font-size="12" fill="#374151">0</text>`,
    );
  }

  // Y-axis amplitude tick numbers (suppressed if amplitudeM hidden or colliding)
  const posAmp = `+${formatSignificant(sol.amplitudeM, sf)}`;
  const negAmp = `-${formatSignificant(sol.amplitudeM, sf)}`;
  if (!guard.isHidden("amplitudeM") && !guard.leaksHiddenText(posAmp)) {
    parts.push(
      `<line x1="${num(left - 5)}" y1="${num(midY - ampPx)}" x2="${num(left)}" y2="${num(midY - ampPx)}" stroke="#1f2937" stroke-width="1.5"/>`,
      `<line x1="${num(left - 5)}" y1="${num(midY + ampPx)}" x2="${num(left)}" y2="${num(midY + ampPx)}" stroke="#1f2937" stroke-width="1.5"/>`,
      `<text x="${num(left - 9)}" y="${num(midY - ampPx + 4)}" text-anchor="end" font-size="12" fill="#374151">${escapeXml(posAmp)}</text>`,
      `<text x="${num(left - 9)}" y="${num(midY + ampPx + 4)}" text-anchor="end" font-size="12" fill="#374151">${escapeXml(negAmp)}</text>`,
    );
  }

  // X-axis ticks (suppressed if horizontal cycle quantity is hidden)
  const xHidden =
    spec.profileKind === "displacement-position"
      ? guard.isHidden("wavelengthM")
      : guard.isHidden("periodS");
  const cycleSpan =
    spec.profileKind === "displacement-position" ? sol.wavelengthM : sol.periodS;
  const halfSteps = Math.min(12, Math.floor(sol.cyclesShown * 2));
  for (let i = 1; i <= halfSteps; i += 1) {
    const coord = i * 0.5 * cycleSpan;
    const tx = xPx(coord);
    parts.push(
      `<line x1="${num(tx)}" y1="${num(midY - 4)}" x2="${num(tx)}" y2="${num(midY + 4)}" stroke="#1f2937" stroke-width="1.25"/>`,
    );
    if (!xHidden && i % 2 === 0) {
      const tickStr = formatSignificant(coord, sf);
      const lenStr =
        spec.profileKind === "displacement-position"
          ? formatLengthAuto(coord, sf)
          : tickStr;
      if (!guard.leaksHiddenText(tickStr) && !guard.leaksHiddenText(lenStr)) {
        parts.push(
          `<text x="${num(tx)}" y="${num(midY + 19)}" text-anchor="middle" font-size="11.5" fill="#374151">${escapeXml(tickStr)}</text>`,
        );
      }
    }
  }

  // Exact sinusoidal waveform curve
  const samples = 240;
  const pathCommands: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const coord = (i / samples) * sol.axisDomainMax;
    const disp = evaluateProgressiveWaveProfile(spec, coord);
    pathCommands.push(
      `${i === 0 ? "M" : "L"} ${num(xPx(coord))} ${num(yPx(disp))}`,
    );
  }
  parts.push(
    `<path d="${pathCommands.join(" ")}" fill="none" stroke="#2563eb" stroke-width="2.5"/>`,
  );

  // Locate first crest in [0, cycleSpan) for clean dimension callouts
  const dirSign = sol.direction === "right" ? 1 : -1;
  const baseOffset =
    spec.profileKind === "displacement-position"
      ? -dirSign * sol.angularFrequencyRadS * sol.snapshotTimeS +
        sol.initialPhaseRad
      : -dirSign * sol.wavenumberRadM * sol.fixedPositionM +
        sol.initialPhaseRad;
  const twoPi = 2 * Math.PI;
  let deltaPhase = (Math.PI / 2 - baseOffset) % twoPi;
  if (deltaPhase < -1e-12) deltaPhase += twoPi;
  if (Math.abs(deltaPhase) < 1e-12) deltaPhase = 0;
  const firstCrestCoord = (deltaPhase / twoPi) * cycleSpan;

  if (firstCrestCoord <= sol.axisDomainMax) {
    const cx = xPx(firstCrestCoord);
    const cyTop = midY - ampPx;
    const ampLabel = guard.labelText(
      "amplitudeM",
      "A",
      `A = ${formatLengthAuto(sol.amplitudeM, sf)}`,
    );
    parts.push(
      `<line x1="${num(cx)}" y1="${num(midY - 3)}" x2="${num(cx)}" y2="${num(cyTop + 3)}" stroke="#dc2626" stroke-width="1.5" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>`,
      `<text x="${num(cx + 8)}" y="${num((midY + cyTop) / 2 + 4)}" text-anchor="start" font-size="12.5" font-weight="600" fill="#b91c1c">${escapeXml(ampLabel)}</text>`,
    );
  }

  // Crest-to-crest horizontal span callout if a full cycle fits
  const secondCrestCoord = firstCrestCoord + cycleSpan;
  if (secondCrestCoord <= sol.axisDomainMax + 1e-9 * cycleSpan) {
    const x1 = xPx(firstCrestCoord);
    const x2 = xPx(Math.min(sol.axisDomainMax, secondCrestCoord));
    const dimY = midY - ampPx - 20;
    const spanText =
      spec.profileKind === "displacement-position"
        ? guard.labelText(
            "wavelengthM",
            "λ",
            `λ = ${formatLengthAuto(sol.wavelengthM, sf)}`,
          )
        : guard.labelText(
            "periodS",
            "T",
            `T = ${formatQuantityWithUnit(sol.periodS, "s", sf)}`,
          );
    parts.push(
      `<line x1="${num(x1)}" y1="${num(midY - ampPx)}" x2="${num(x1)}" y2="${num(dimY - 4)}" stroke="#6b7280" stroke-width="1" stroke-dasharray="3 3"/>`,
      `<line x1="${num(x2)}" y1="${num(midY - ampPx)}" x2="${num(x2)}" y2="${num(dimY - 4)}" stroke="#6b7280" stroke-width="1" stroke-dasharray="3 3"/>`,
      `<line x1="${num(x1 + 3)}" y1="${num(dimY)}" x2="${num(x2 - 3)}" y2="${num(dimY)}" stroke="#111827" stroke-width="1.4" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>`,
      `<text x="${num((x1 + x2) / 2)}" y="${num(dimY - 7)}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#111827">${escapeXml(spanText)}</text>`,
    );
  }

  // Optional phase-comparison points P and Q
  if (spec.point1Coord !== undefined && spec.point2Coord !== undefined) {
    const p1x = xPx(sol.point1Coord);
    const p1y = yPx(sol.point1DisplacementM);
    const p2x = xPx(sol.point2Coord);
    const p2y = yPx(sol.point2DisplacementM);
    parts.push(
      `<circle cx="${num(p1x)}" cy="${num(p1y)}" r="4.5" fill="#111827" stroke="#ffffff" stroke-width="1.5"/>`,
      `<text x="${num(p1x)}" y="${num(p1y <= midY ? p1y - 10 : p1y + 18)}" text-anchor="middle" font-size="12" font-weight="700" fill="#111827">P</text>`,
      `<circle cx="${num(p2x)}" cy="${num(p2y)}" r="4.5" fill="#111827" stroke="#ffffff" stroke-width="1.5"/>`,
      `<text x="${num(p2x)}" y="${num(p2y <= midY ? p2y - 10 : p2y + 18)}" text-anchor="middle" font-size="12" font-weight="700" fill="#111827">Q</text>`,
    );
  }

  // Top header badges (strictly gated by visibility)
  const badges: string[] = [];
  guard.tryBadge(
    badges,
    spec.customLabels?.frequencyHz ??
      `f = ${formatQuantityWithUnit(sol.frequencyHz, "Hz", sf)}`,
    "frequencyHz",
  );
  if (spec.profileKind === "displacement-time") {
    guard.tryBadge(
      badges,
      spec.customLabels?.wavelengthM ??
        `λ = ${formatLengthAuto(sol.wavelengthM, sf)}`,
      "wavelengthM",
    );
  }
  const vCandidate =
    spec.customLabels?.waveSpeedMs ??
    `v = ${formatQuantityWithUnit(sol.waveSpeedMs, "m s⁻¹", sf)}`;
  if (!guard.isHidden("waveSpeedMs") && !guard.leaksHiddenText(vCandidate)) {
    guard.recordVisible(vCandidate);
    badges.push(vCandidate);
  } else {
    const vSym = sol.direction === "right" ? "v →" : "← v";
    guard.recordVisible(vSym);
    badges.push(vSym);
  }
  if (spec.point1Coord !== undefined && spec.point2Coord !== undefined) {
    guard.tryBadge(
      badges,
      `Δφ = ${formatSignificant(sol.phaseDifferenceRad, sf)} rad (${formatSignificant(sol.phaseDifferenceDegrees, sf)}°)`,
      "phaseDifferenceRad",
      "phaseDifferenceModulo2PiRad",
      "principalPhaseDifferenceRad",
      "phaseDifferenceDegrees",
    );
  }

  if (badges.length > 0) {
    parts.push(
      `<text x="${num(left)}" y="28" text-anchor="start" font-size="13" font-weight="500" fill="#1f2937">${escapeXml(badges.join("   |   "))}</text>`,
    );
  }

  if (spec.profileKind === "displacement-position") {
    const arrowStartX = sol.direction === "right" ? right - 88 : right - 8;
    const arrowEndX = sol.direction === "right" ? right - 8 : right - 88;
    parts.push(
      `<line x1="${num(arrowStartX)}" y1="24" x2="${num(arrowEndX)}" y2="24" stroke="#1f2937" stroke-width="1.75" marker-end="url(#${markerId})"/>`,
    );
  }

  return parts.join("");
}

function renderStandingWaveSvg(
  spec: StandingWaveScenarioSpec,
  sol: StandingWaveSolution,
  width: number,
  height: number,
  guard: VisibilityGuard,
  markerId: string,
): string {
  const parts: string[] = [];
  const sf = guard.sigFigs;
  const eLeft =
    spec.boundaryKind === "pipe-open-both" ? sol.endCorrectionM : 0;
  const eRight =
    spec.boundaryKind === "string-fixed-both" ? 0 : sol.endCorrectionM;
  const acousticMinM = -eLeft;
  const acousticMaxM = sol.lengthM + eRight;
  const totalAcousticSpanM = acousticMaxM - acousticMinM;

  const marginX = 92;
  const usableW = width - 2 * marginX;
  const pxPerMeter = usableW / totalAcousticSpanM;
  const xPx = (posM: number): number =>
    marginX + (posM - acousticMinM) * pxPerMeter;

  const midY = Math.round(height * 0.5);
  const pipeHalfH = 56;
  const ampPx = 44;

  const physLeftPx = xPx(0);
  const physRightPx = xPx(sol.lengthM);

  // Equilibrium axis
  parts.push(
    `<line x1="${num(xPx(acousticMinM))}" y1="${num(midY)}" x2="${num(xPx(acousticMaxM))}" y2="${num(midY)}" stroke="#9ca3af" stroke-width="1.2" stroke-dasharray="5 4"/>`,
  );

  // Physical boundary walls / clamps
  if (spec.boundaryKind === "string-fixed-both") {
    parts.push(
      `<rect x="${num(physLeftPx - 10)}" y="${num(midY - 38)}" width="10" height="76" fill="#d1d5db" stroke="#1f2937" stroke-width="2"/>`,
      `<rect x="${num(physRightPx)}" y="${num(midY - 38)}" width="10" height="76" fill="#d1d5db" stroke="#1f2937" stroke-width="2"/>`,
    );
  } else if (spec.boundaryKind === "pipe-open-both") {
    parts.push(
      `<line x1="${num(physLeftPx)}" y1="${num(midY - pipeHalfH)}" x2="${num(physRightPx)}" y2="${num(midY - pipeHalfH)}" stroke="#1f2937" stroke-width="3.5" stroke-linecap="round"/>`,
      `<line x1="${num(physLeftPx)}" y1="${num(midY + pipeHalfH)}" x2="${num(physRightPx)}" y2="${num(midY + pipeHalfH)}" stroke="#1f2937" stroke-width="3.5" stroke-linecap="round"/>`,
    );
  } else {
    parts.push(
      `<polyline points="${num(physRightPx)},${num(midY - pipeHalfH)} ${num(physLeftPx)},${num(midY - pipeHalfH)} ${num(physLeftPx)},${num(midY + pipeHalfH)} ${num(physRightPx)},${num(midY + pipeHalfH)}" fill="none" stroke="#1f2937" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
  }

  // End correction dashed boundary lines if e > 0
  if (sol.endCorrectionM > 0) {
    if (eLeft > 0) {
      const lx = xPx(-eLeft);
      parts.push(
        `<line x1="${num(lx)}" y1="${num(midY - pipeHalfH - 8)}" x2="${num(lx)}" y2="${num(midY + pipeHalfH + 8)}" stroke="#6b7280" stroke-width="1.2" stroke-dasharray="3 3"/>`,
      );
    }
    if (eRight > 0) {
      const rx = xPx(sol.lengthM + eRight);
      const ecLabel = guard.labelText(
        "endCorrectionM",
        "e",
        `e = ${formatLengthAuto(sol.endCorrectionM, sf)}`,
        ["effectiveLengthM"],
      );
      parts.push(
        `<line x1="${num(rx)}" y1="${num(midY - pipeHalfH - 8)}" x2="${num(rx)}" y2="${num(midY + pipeHalfH + 8)}" stroke="#6b7280" stroke-width="1.2" stroke-dasharray="3 3"/>`,
        `<text x="${num((physRightPx + rx) / 2)}" y="${num(midY - pipeHalfH - 14)}" text-anchor="middle" font-size="11.5" fill="#4b5563">${escapeXml(ecLabel)}</text>`,
      );
    }
  }

  // Standing wave upper (solid) & lower (dashed) envelopes
  const samples = 240;
  const upperPts: string[] = [];
  const lowerPts: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const posM = acousticMinM + (i / samples) * totalAcousticSpanM;
    const env = evaluateStandingWaveEnvelope(spec, posM);
    const sx = xPx(posM);
    upperPts.push(`${i === 0 ? "M" : "L"} ${num(sx)} ${num(midY - env * ampPx)}`);
    lowerPts.push(`${i === 0 ? "M" : "L"} ${num(sx)} ${num(midY + env * ampPx)}`);
  }
  parts.push(
    `<path d="${lowerPts.join(" ")}" fill="none" stroke="#60a5fa" stroke-width="2" stroke-dasharray="6 4"/>`,
    `<path d="${upperPts.join(" ")}" fill="none" stroke="#1d4ed8" stroke-width="2.5"/>`,
  );

  // Nodes & antinode labels
  const hideNodeAntinodeLabels = guard.isHidden(
    "nodePositionsM",
    "antinodePositionsM",
    "nodeCount",
    "antinodeCount",
  );
  for (const nodeM of sol.nodePositionsM) {
    const nx = xPx(nodeM);
    parts.push(
      `<circle cx="${num(nx)}" cy="${num(midY)}" r="3.8" fill="#dc2626"/>`,
    );
    if (!hideNodeAntinodeLabels && sol.harmonicNumber <= 8) {
      parts.push(
        `<text x="${num(nx)}" y="${num(midY + 18)}" text-anchor="middle" font-size="11" font-weight="700" fill="#b91c1c">N</text>`,
      );
    }
  }
  if (!hideNodeAntinodeLabels && sol.harmonicNumber <= 8) {
    for (const antiM of sol.antinodePositionsM) {
      const ax = xPx(antiM);
      parts.push(
        `<text x="${num(ax)}" y="${num(midY - ampPx - 8)}" text-anchor="middle" font-size="11" font-weight="700" fill="#1d4ed8">A</text>`,
      );
    }
  }

  // Physical length dimension arrow
  const dimY = midY + pipeHalfH + 34;
  const lengthLabel = guard.labelText(
    "lengthM",
    "L",
    `L = ${formatLengthAuto(sol.lengthM, sf)}`,
  );
  parts.push(
    `<line x1="${num(physLeftPx)}" y1="${num(midY + pipeHalfH + 6)}" x2="${num(physLeftPx)}" y2="${num(dimY + 6)}" stroke="#6b7280" stroke-width="1" stroke-dasharray="3 3"/>`,
    `<line x1="${num(physRightPx)}" y1="${num(midY + pipeHalfH + 6)}" x2="${num(physRightPx)}" y2="${num(dimY + 6)}" stroke="#6b7280" stroke-width="1" stroke-dasharray="3 3"/>`,
    `<line x1="${num(physLeftPx + 3)}" y1="${num(dimY)}" x2="${num(physRightPx - 3)}" y2="${num(dimY)}" stroke="#111827" stroke-width="1.5" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>`,
    `<text x="${num((physLeftPx + physRightPx) / 2)}" y="${num(dimY + 20)}" text-anchor="middle" font-size="13" font-weight="600" fill="#111827">${escapeXml(lengthLabel)}</text>`,
  );

  // Header badges
  const badges: string[] = [];
  guard.tryBadge(badges, `n = ${sol.harmonicNumber}`, "harmonicNumber", "modeIndex");
  guard.tryBadge(
    badges,
    spec.customLabels?.waveSpeedMs ??
      `v = ${formatQuantityWithUnit(sol.waveSpeedMs, "m s⁻¹", sf)}`,
    "waveSpeedMs",
  );
  if (spec.tensionN !== undefined) {
    guard.tryBadge(
      badges,
      `T = ${formatQuantityWithUnit(spec.tensionN, "N", sf)}`,
      "tensionN",
    );
  }
  if (spec.linearDensityKgM !== undefined) {
    guard.tryBadge(
      badges,
      `μ = ${formatQuantityWithUnit(spec.linearDensityKgM, "kg m⁻¹", sf)}`,
      "linearDensityKgM",
    );
  }
  guard.tryBadge(
    badges,
    `λ = ${formatLengthAuto(sol.wavelengthM, sf)}`,
    "wavelengthM",
    "adjacentNodeSpacingM",
    "nodeToAntinodeSpacingM",
  );
  guard.tryBadge(
    badges,
    `f = ${formatQuantityWithUnit(sol.harmonicFrequencyHz, "Hz", sf)}`,
    "harmonicFrequencyHz",
    "fundamentalFrequencyHz",
    "frequencyHz",
    "periodS",
  );

  if (badges.length > 0) {
    parts.push(
      `<text x="${num(marginX)}" y="30" text-anchor="start" font-size="12.5" font-weight="500" fill="#1f2937">${escapeXml(badges.join("   |   "))}</text>`,
    );
  }

  return parts.join("");
}

function renderDoubleSlitSvg(
  spec: DoubleSlitScenarioSpec,
  sol: DoubleSlitSolution,
  width: number,
  height: number,
  guard: VisibilityGuard,
  markerId: string,
): string {
  const parts: string[] = [];
  const sf = guard.sigFigs;
  const midY = Math.round(height * 0.5);
  const barrierX = 148;
  const screenX = Math.round(width * 0.62);
  const profileBaseX = screenX + 18;
  const profilePeakSpan = width - profileBaseX - 42;
  const slitHalfSepPx = 36;
  const slitHalfOpeningPx = 6;
  const screenHalfH = Math.round(height * 0.36);

  // Incident plane wavefronts
  for (const wx of [54, 78, 102, 126]) {
    parts.push(
      `<line x1="${wx}" y1="${num(midY - 76)}" x2="${wx}" y2="${num(midY + 76)}" stroke="#60a5fa" stroke-width="1.8"/>`,
    );
  }
  parts.push(
    `<line x1="42" y1="${num(midY)}" x2="134" y2="${num(midY)}" stroke="#1f2937" stroke-width="1.5" marker-end="url(#${markerId})"/>`,
  );
  const wlLabel = guard.labelText(
    "wavelengthM",
    "λ",
    `λ = ${formatLengthAuto(sol.wavelengthM, sf)}`,
    ["pathDifferenceM"],
  );
  parts.push(
    `<text x="90" y="${num(midY - 86)}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#1d4ed8">${escapeXml(wlLabel)}</text>`,
  );

  // Double-slit barrier
  const s1Y = midY - slitHalfSepPx;
  const s2Y = midY + slitHalfSepPx;
  parts.push(
    `<line x1="${barrierX}" y1="${num(midY - screenHalfH)}" x2="${barrierX}" y2="${num(s1Y - slitHalfOpeningPx)}" stroke="#111827" stroke-width="4"/>`,
    `<line x1="${barrierX}" y1="${num(s1Y + slitHalfOpeningPx)}" x2="${barrierX}" y2="${num(s2Y - slitHalfOpeningPx)}" stroke="#111827" stroke-width="4"/>`,
    `<line x1="${barrierX}" y1="${num(s2Y + slitHalfOpeningPx)}" x2="${barrierX}" y2="${num(midY + screenHalfH)}" stroke="#111827" stroke-width="4"/>`,
    `<text x="${barrierX - 10}" y="${num(s1Y - 8)}" text-anchor="end" font-size="11.5" font-weight="600" fill="#111827">S₁</text>`,
    `<text x="${barrierX - 10}" y="${num(s2Y + 16)}" text-anchor="end" font-size="11.5" font-weight="600" fill="#111827">S₂</text>`,
  );

  // Slit separation d callout
  const dLabel = guard.labelText(
    "slitSeparationM",
    "d",
    `d = ${formatLengthAuto(sol.slitSeparationM, sf)}`,
  );
  parts.push(
    `<line x1="${barrierX + 14}" y1="${num(s1Y)}" x2="${barrierX + 14}" y2="${num(s2Y)}" stroke="#374151" stroke-width="1.3" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>`,
    `<text x="${barrierX + 20}" y="${num(midY - 5)}" text-anchor="start" font-size="12" font-weight="600" fill="#111827">${escapeXml(dLabel)}</text>`,
  );

  // Central axis & screen
  parts.push(
    `<line x1="${barrierX}" y1="${num(midY)}" x2="${screenX}" y2="${num(midY)}" stroke="#9ca3af" stroke-width="1.2" stroke-dasharray="5 4"/>`,
    `<line x1="${screenX}" y1="${num(midY - screenHalfH)}" x2="${screenX}" y2="${num(midY + screenHalfH)}" stroke="#1f2937" stroke-width="2.5"/>`,
  );

  // Physical screen span mapped into [-screenHalfH, +screenHalfH]
  const physicalHalfSpanM =
    sol.centralEnvelopeHalfWidthM !== undefined
      ? Math.max(3.2 * sol.fringeSpacingM, 1.35 * sol.centralEnvelopeHalfWidthM)
      : Math.max(3.2, sol.orderN + 1.2) * sol.fringeSpacingM;
  const screenYPx = (yMeters: number): number =>
    midY - (yMeters / physicalHalfSpanM) * screenHalfH;

  // Coherent rays from S1 and S2 to n-th bright fringe
  const targetY = Math.min(
    0.85 * physicalHalfSpanM,
    sol.nthBrightPositionM,
  );
  const targetPxY = screenYPx(targetY);
  parts.push(
    `<line x1="${barrierX}" y1="${num(s1Y)}" x2="${screenX}" y2="${num(targetPxY)}" stroke="#dc2626" stroke-width="1.4" stroke-opacity="0.85"/>`,
    `<line x1="${barrierX}" y1="${num(s2Y)}" x2="${screenX}" y2="${num(targetPxY)}" stroke="#dc2626" stroke-width="1.4" stroke-opacity="0.85"/>`,
    `<line x1="${barrierX}" y1="${num(midY)}" x2="${screenX}" y2="${num(targetPxY)}" stroke="#6b7280" stroke-width="1.1" stroke-dasharray="4 3"/>`,
  );

  // Screen distance D dimension
  const dScreenY = midY + screenHalfH + 26;
  const screenDistLabel = guard.labelText(
    "screenDistanceM",
    "D",
    `D = ${formatLengthAuto(sol.screenDistanceM, sf)}`,
  );
  parts.push(
    `<line x1="${barrierX + 3}" y1="${num(dScreenY)}" x2="${screenX - 3}" y2="${num(dScreenY)}" stroke="#111827" stroke-width="1.5" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>`,
    `<text x="${num((barrierX + screenX) / 2)}" y="${num(dScreenY + 18)}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#111827">${escapeXml(screenDistLabel)}</text>`,
  );

  // Continuous exact intensity profile I(y) beside screen
  parts.push(
    `<line x1="${profileBaseX}" y1="${num(midY - screenHalfH)}" x2="${profileBaseX}" y2="${num(midY + screenHalfH)}" stroke="#9ca3af" stroke-width="1"/>`,
    `<text x="${num(profileBaseX + profilePeakSpan / 2)}" y="${num(midY - screenHalfH - 10)}" text-anchor="middle" font-size="12" font-weight="600" fill="#374151">Intensity I(y)</text>`,
  );

  const samples = 280;
  const intensityCommands: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const frac = -1 + (2 * i) / samples;
    const yM = frac * physicalHalfSpanM;
    const relI = evaluateDoubleSlitRelativeIntensity(spec, yM);
    const ix = profileBaseX + relI * profilePeakSpan;
    const iy = screenYPx(yM);
    intensityCommands.push(`${i === 0 ? "M" : "L"} ${num(ix)} ${num(iy)}`);
  }
  parts.push(
    `<path d="${intensityCommands.join(" ")}" fill="none" stroke="#2563eb" stroke-width="2"/>`,
  );

  // Single-slit envelope curve if slitWidthM is present
  if (spec.slitWidthM !== undefined) {
    const envCommands: string[] = [];
    for (let i = 0; i <= 140; i += 1) {
      const frac = -1 + (2 * i) / 140;
      const yM = frac * physicalHalfSpanM;
      const envI = evaluateSingleSlitRelativeIntensity(
        {
          kind: "single-slit",
          wavelengthM: spec.wavelengthM,
          slitWidthM: spec.slitWidthM,
          screenDistanceM: spec.screenDistanceM,
        },
        yM,
      );
      const ix = profileBaseX + envI * profilePeakSpan;
      const iy = screenYPx(yM);
      envCommands.push(`${i === 0 ? "M" : "L"} ${num(ix)} ${num(iy)}`);
    }
    parts.push(
      `<path d="${envCommands.join(" ")}" fill="none" stroke="#9333ea" stroke-width="1.3" stroke-dasharray="4 3"/>`,
    );
  }

  // Fringe spacing s callout between m=0 and m=1 maxima
  const y0Px = screenYPx(0);
  const y1Px = screenYPx(sol.fringeSpacingM);
  if (Math.abs(y0Px - y1Px) >= 12) {
    const sCalloutX = profileBaseX + profilePeakSpan + 10;
    const sLabel = guard.labelText(
      "fringeSpacingM",
      "s",
      `s = ${formatLengthAuto(sol.fringeSpacingM, sf)}`,
      ["nthBrightPositionM", "nthBrightExactPositionM", "firstDarkPositionM"],
    );
    parts.push(
      `<line x1="${num(sCalloutX)}" y1="${num(y0Px)}" x2="${num(sCalloutX)}" y2="${num(y1Px)}" stroke="#111827" stroke-width="1.3" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>`,
      `<text x="${num(sCalloutX - 4)}" y="${num(y1Px - 8)}" text-anchor="end" font-size="12" font-weight="600" fill="#111827">${escapeXml(sLabel)}</text>`,
    );
  }

  // Top header extra info if slitWidthM or angle is public
  const badges: string[] = [];
  if (spec.slitWidthM !== undefined) {
    guard.tryBadge(
      badges,
      `b = ${formatLengthAuto(spec.slitWidthM, sf)}`,
      "slitWidthM",
    );
  }
  const thetaSymbol =
    guard.isHidden("orderN") || guard.leaksHiddenText(String(sol.orderN))
      ? "θ"
      : `θ_${sol.orderN}`;
  guard.tryBadge(
    badges,
    `${thetaSymbol} = ${formatSignificant(sol.nthOrderAngleDegrees, sf)}°`,
    "nthOrderAngleDegrees",
    "nthOrderAngleRad",
  );
  if (badges.length > 0) {
    parts.push(
      `<text x="42" y="26" text-anchor="start" font-size="12.5" font-weight="500" fill="#1f2937">${escapeXml(badges.join("   |   "))}</text>`,
    );
  }

  return parts.join("");
}

function renderDiffractionGratingSvg(
  spec: DiffractionGratingScenarioSpec,
  sol: DiffractionGratingSolution,
  width: number,
  height: number,
  guard: VisibilityGuard,
  markerId: string,
): string {
  const parts: string[] = [];
  const sf = guard.sigFigs;
  const gratingX = 205;
  const midY = Math.round(height * 0.53);
  const arcR = Math.min(width - gratingX - 105, Math.round(height * 0.38));

  // Incident monochromatic laser beam
  parts.push(
    `<line x1="44" y1="${num(midY)}" x2="${gratingX - 6}" y2="${num(midY)}" stroke="#dc2626" stroke-width="2.6" marker-end="url(#${markerId})"/>`,
  );
  const wlLabel = guard.labelText(
    "wavelengthM",
    "λ",
    `λ = ${formatLengthAuto(sol.wavelengthM, sf)}`,
  );
  parts.push(
    `<text x="${num((44 + gratingX) / 2)}" y="${num(midY - 14)}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#b91c1c">${escapeXml(wlLabel)}</text>`,
  );

  // Grating plate with multi-slit rulings
  const gratingHalfH = 74;
  parts.push(
    `<line x1="${gratingX}" y1="${num(midY - gratingHalfH)}" x2="${gratingX}" y2="${num(midY + gratingHalfH)}" stroke="#111827" stroke-width="3.5"/>`,
  );
  for (let tickY = midY - 64; tickY <= midY + 64; tickY += 8) {
    parts.push(
      `<line x1="${gratingX - 5}" y1="${num(tickY)}" x2="${gratingX + 5}" y2="${num(tickY)}" stroke="#ffffff" stroke-width="2"/>`,
    );
  }

  // Semicircular detector arc from -90 deg to +90 deg
  parts.push(
    `<path d="M ${num(gratingX)} ${num(midY - arcR)} A ${num(arcR)} ${num(arcR)} 0 0 1 ${num(gratingX)} ${num(midY + arcR)}" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-dasharray="5 4"/>`,
  );

  const hideOrderCount = guard.isHidden(
    "maxOrder",
    "strictlySubNinetyMaxOrder",
    "totalPrincipalMaxima",
    "flatScreenMaximaCount",
    "queryOrderN",
  );

  const centralLabel = guard.leaksHiddenText("0") ? "central max" : "n = 0";

  if (hideOrderCount) {
    // Draw central n=0 and representative first-order rays without revealing n_max
    const repAngle =
      sol.queryOrderN >= 1 && !guard.isHidden("queryAngleRad", "queryAngleDegrees", "querySinTheta")
        ? sol.queryAngleRad
        : Math.PI / 6;
    const ux = gratingX + arcR * Math.cos(repAngle);
    const uyTop = midY - arcR * Math.sin(repAngle);
    const uyBot = midY + arcR * Math.sin(repAngle);
    parts.push(
      `<line x1="${gratingX}" y1="${num(midY)}" x2="${num(gratingX + arcR)}" y2="${num(midY)}" stroke="#dc2626" stroke-width="2" marker-end="url(#${markerId})"/>`,
      `<text x="${num(gratingX + arcR + 10)}" y="${num(midY + 4)}" text-anchor="start" font-size="12" font-weight="600" fill="#111827">${centralLabel}</text>`,
      `<line x1="${gratingX}" y1="${num(midY)}" x2="${num(ux)}" y2="${num(uyTop)}" stroke="#dc2626" stroke-width="1.7" stroke-dasharray="5 3" marker-end="url(#${markerId})"/>`,
      `<line x1="${gratingX}" y1="${num(midY)}" x2="${num(ux)}" y2="${num(uyBot)}" stroke="#dc2626" stroke-width="1.7" stroke-dasharray="5 3" marker-end="url(#${markerId})"/>`,
      `<text x="${num(ux + 8)}" y="${num(uyTop)}" text-anchor="start" font-size="12" fill="#374151">+n</text>`,
      `<text x="${num(ux + 8)}" y="${num(uyBot + 4)}" text-anchor="start" font-size="12" fill="#374151">-n</text>`,
    );
  } else {
    // Draw exact solved principal maxima rays m = 0 .. maxOrder
    parts.push(
      `<line x1="${gratingX}" y1="${num(midY)}" x2="${num(gratingX + arcR)}" y2="${num(midY)}" stroke="#dc2626" stroke-width="2.1" marker-end="url(#${markerId})"/>`,
      `<circle cx="${num(gratingX + arcR)}" cy="${num(midY)}" r="4" fill="#dc2626"/>`,
      `<text x="${num(gratingX + arcR + 10)}" y="${num(midY + 4)}" text-anchor="start" font-size="12" font-weight="600" fill="#111827">${centralLabel}</text>`,
    );

    const maxDrawn = Math.min(sol.maxOrder, 6);
    for (let m = 1; m <= maxDrawn; m += 1) {
      const theta = sol.orderAnglesRad[m];
      const dx = arcR * Math.cos(theta);
      const dy = arcR * Math.sin(theta);
      const tx = gratingX + dx;
      const tyPlus = midY - dy;
      const tyMinus = midY + dy;
      const labelOffsetX = 10 * Math.cos(theta);
      const labelOffsetY = 10 * Math.sin(theta);
      const plusTag = guard.leaksHiddenText(String(m)) ? "+n" : `n = +${m}`;
      const minusTag = guard.leaksHiddenText(String(m)) ? "-n" : `n = -${m}`;

      parts.push(
        `<line x1="${gratingX}" y1="${num(midY)}" x2="${num(tx)}" y2="${num(tyPlus)}" stroke="#dc2626" stroke-width="1.6"/>`,
        `<circle cx="${num(tx)}" cy="${num(tyPlus)}" r="3.5" fill="#dc2626"/>`,
        `<text x="${num(tx + labelOffsetX + 4)}" y="${num(tyPlus - labelOffsetY + 4)}" text-anchor="start" font-size="11.5" fill="#1f2937">${plusTag}</text>`,
        `<line x1="${gratingX}" y1="${num(midY)}" x2="${num(tx)}" y2="${num(tyMinus)}" stroke="#dc2626" stroke-width="1.6"/>`,
        `<circle cx="${num(tx)}" cy="${num(tyMinus)}" r="3.5" fill="#dc2626"/>`,
        `<text x="${num(tx + labelOffsetX + 4)}" y="${num(tyMinus + labelOffsetY + 4)}" text-anchor="start" font-size="11.5" fill="#1f2937">${minusTag}</text>`,
      );
    }
  }

  // Angle arc for queryOrderN >= 1
  if (sol.queryOrderN >= 1) {
    const arcTheta = hideOrderCount ? Math.PI / 6 : sol.queryAngleRad;
    const smallR = 54;
    const arcEndX = gratingX + smallR * Math.cos(arcTheta);
    const arcEndY = midY - smallR * Math.sin(arcTheta);
    const angLabel = guard.labelText(
      "queryAngleDegrees",
      "θ",
      `θ = ${formatSignificant(sol.queryAngleDegrees, sf)}°`,
      ["queryAngleRad", "querySinTheta", "queryScreenPositionM"],
    );
    parts.push(
      `<path d="M ${num(gratingX + smallR)} ${num(midY)} A ${smallR} ${smallR} 0 0 0 ${num(arcEndX)} ${num(arcEndY)}" fill="none" stroke="#1d4ed8" stroke-width="1.5"/>`,
      `<text x="${num(gratingX + (smallR + 22) * Math.cos(arcTheta / 2))}" y="${num(midY - (smallR + 18) * Math.sin(arcTheta / 2))}" text-anchor="start" font-size="12" font-weight="600" fill="#1d4ed8">${escapeXml(angLabel)}</text>`,
    );
  }

  // Header & grating ruling badges
  const badges: string[] = [];
  guard.tryBadge(
    badges,
    `d = ${formatLengthAuto(sol.slitSpacingM, sf)}`,
    "slitSpacingM",
  );
  guard.tryBadge(
    badges,
    `N = ${formatSignificant(sol.linesPerMm, sf)} lines mm⁻¹`,
    "linesPerMm",
    "linesPerMeter",
  );
  if (!hideOrderCount) {
    guard.tryBadge(badges, `n_max = ${sol.maxOrder}`, "maxOrder");
  }
  if (sol.screenDistanceM !== undefined) {
    guard.tryBadge(
      badges,
      `D = ${formatLengthAuto(sol.screenDistanceM, sf)}`,
      "screenDistanceM",
    );
  }
  if (badges.length > 0) {
    parts.push(
      `<text x="44" y="28" text-anchor="start" font-size="12.5" font-weight="500" fill="#1f2937">${escapeXml(badges.join("   |   "))}</text>`,
    );
  }

  return parts.join("");
}

function renderSingleSlitSvg(
  spec: SingleSlitScenarioSpec,
  sol: SingleSlitSolution,
  width: number,
  height: number,
  guard: VisibilityGuard,
  markerId: string,
): string {
  const parts: string[] = [];
  const sf = guard.sigFigs;
  const midY = Math.round(height * 0.5);
  const barrierX = 148;
  const screenX = Math.round(width * 0.6);
  const profileBaseX = screenX + 18;
  const profilePeakSpan = width - profileBaseX - 46;
  const slitHalfPx = 20;
  const screenHalfH = Math.round(height * 0.36);

  // Incident plane wavefronts
  for (const wx of [54, 80, 106, 130]) {
    parts.push(
      `<line x1="${wx}" y1="${num(midY - 68)}" x2="${wx}" y2="${num(midY + 68)}" stroke="#60a5fa" stroke-width="1.8"/>`,
    );
  }
  parts.push(
    `<line x1="42" y1="${num(midY)}" x2="136" y2="${num(midY)}" stroke="#1f2937" stroke-width="1.5" marker-end="url(#${markerId})"/>`,
  );
  const wlLabel = guard.labelText(
    "wavelengthM",
    "λ",
    `λ = ${formatLengthAuto(sol.wavelengthM, sf)}`,
  );
  parts.push(
    `<text x="88" y="${num(midY - 78)}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#1d4ed8">${escapeXml(wlLabel)}</text>`,
  );

  // Single-slit aperture barrier
  parts.push(
    `<line x1="${barrierX}" y1="${num(midY - screenHalfH)}" x2="${barrierX}" y2="${num(midY - slitHalfPx)}" stroke="#111827" stroke-width="4.5"/>`,
    `<line x1="${barrierX}" y1="${num(midY + slitHalfPx)}" x2="${barrierX}" y2="${num(midY + screenHalfH)}" stroke="#111827" stroke-width="4.5"/>`,
  );

  const bLabel = guard.labelText(
    "slitWidthM",
    "b",
    `b = ${formatLengthAuto(sol.slitWidthM, sf)}`,
  );
  parts.push(
    `<line x1="${barrierX - 14}" y1="${num(midY - slitHalfPx)}" x2="${barrierX - 14}" y2="${num(midY + slitHalfPx)}" stroke="#111827" stroke-width="1.3" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>`,
    `<text x="${barrierX - 20}" y="${num(midY + 4)}" text-anchor="end" font-size="12" font-weight="600" fill="#111827">${escapeXml(bLabel)}</text>`,
  );

  // Screen & central axis
  const physicalHalfSpanM = 2.75 * sol.centralExactHalfWidthM;
  const screenYPx = (yMeters: number): number =>
    midY - (yMeters / physicalHalfSpanM) * screenHalfH;

  const firstMinTopPx = screenYPx(sol.centralExactHalfWidthM);
  const firstMinBotPx = screenYPx(-sol.centralExactHalfWidthM);

  parts.push(
    `<line x1="${barrierX}" y1="${num(midY)}" x2="${screenX}" y2="${num(midY)}" stroke="#9ca3af" stroke-width="1.2" stroke-dasharray="5 4"/>`,
    `<line x1="${screenX}" y1="${num(midY - screenHalfH)}" x2="${screenX}" y2="${num(midY + screenHalfH)}" stroke="#1f2937" stroke-width="2.5"/>`,
    `<line x1="${barrierX}" y1="${num(midY)}" x2="${screenX}" y2="${num(firstMinTopPx)}" stroke="#dc2626" stroke-width="1.3" stroke-dasharray="5 3"/>`,
    `<line x1="${barrierX}" y1="${num(midY)}" x2="${screenX}" y2="${num(firstMinBotPx)}" stroke="#dc2626" stroke-width="1.3" stroke-dasharray="5 3"/>`,
  );

  // Angle θ callout
  const thetaLabel = guard.labelText(
    "firstMinimumAngleRad",
    "θ",
    `θ = ${formatSignificant(sol.firstMinimumAngleRad, sf)} rad`,
    [
      "firstMinimumExactAngleRad",
      "firstMinimumExactAngleDegrees",
      "centralAngularWidthRad",
    ],
  );
  const raySlopeAngle = Math.atan2(midY - firstMinTopPx, screenX - barrierX);
  const arcR = 56;
  parts.push(
    `<path d="M ${num(barrierX + arcR)} ${num(midY)} A ${arcR} ${arcR} 0 0 0 ${num(barrierX + arcR * Math.cos(raySlopeAngle))} ${num(midY - arcR * Math.sin(raySlopeAngle))}" fill="none" stroke="#dc2626" stroke-width="1.4"/>`,
    `<text x="${num(barrierX + arcR + 8)}" y="${num(midY - 12)}" text-anchor="start" font-size="12" font-weight="600" fill="#b91c1c">${escapeXml(thetaLabel)}</text>`,
  );

  // Screen distance D callout
  const dScreenY = midY + screenHalfH + 26;
  const dScreenLabel = guard.labelText(
    "screenDistanceM",
    "D",
    `D = ${formatLengthAuto(sol.screenDistanceM, sf)}`,
  );
  parts.push(
    `<line x1="${barrierX + 3}" y1="${num(dScreenY)}" x2="${screenX - 3}" y2="${num(dScreenY)}" stroke="#111827" stroke-width="1.5" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>`,
    `<text x="${num((barrierX + screenX) / 2)}" y="${num(dScreenY + 18)}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#111827">${escapeXml(dScreenLabel)}</text>`,
  );

  // Exact sinc^2 intensity curve along screen
  parts.push(
    `<line x1="${profileBaseX}" y1="${num(midY - screenHalfH)}" x2="${profileBaseX}" y2="${num(midY + screenHalfH)}" stroke="#9ca3af" stroke-width="1"/>`,
    `<text x="${num(profileBaseX + profilePeakSpan / 2)}" y="${num(midY - screenHalfH - 10)}" text-anchor="middle" font-size="12" font-weight="600" fill="#374151">Intensity I(θ)</text>`,
  );

  const samples = 260;
  const curveCommands: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const frac = -1 + (2 * i) / samples;
    const yM = frac * physicalHalfSpanM;
    const relI = evaluateSingleSlitRelativeIntensity(spec, yM);
    const ix = profileBaseX + relI * profilePeakSpan;
    const iy = screenYPx(yM);
    curveCommands.push(`${i === 0 ? "M" : "L"} ${num(ix)} ${num(iy)}`);
  }
  parts.push(
    `<path d="${curveCommands.join(" ")}" fill="none" stroke="#2563eb" stroke-width="2.2"/>`,
  );

  // Central maximum full width w = 2 y_1 dimension arrow
  const wDimX = profileBaseX + profilePeakSpan + 14;
  const wLabel = guard.labelText(
    "centralFullWidthM",
    "w",
    `w = ${formatLengthAuto(sol.centralFullWidthM, sf)}`,
    ["centralHalfWidthM", "centralExactHalfWidthM", "centralExactFullWidthM"],
  );
  parts.push(
    `<line x1="${profileBaseX}" y1="${num(firstMinTopPx)}" x2="${num(wDimX + 4)}" y2="${num(firstMinTopPx)}" stroke="#9ca3af" stroke-width="1" stroke-dasharray="3 3"/>`,
    `<line x1="${profileBaseX}" y1="${num(firstMinBotPx)}" x2="${num(wDimX + 4)}" y2="${num(firstMinBotPx)}" stroke="#9ca3af" stroke-width="1" stroke-dasharray="3 3"/>`,
    `<line x1="${num(wDimX)}" y1="${num(firstMinTopPx + 3)}" x2="${num(wDimX)}" y2="${num(firstMinBotPx - 3)}" stroke="#111827" stroke-width="1.4" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>`,
    `<text x="${num(wDimX - 6)}" y="${num(firstMinTopPx - 8)}" text-anchor="end" font-size="12" font-weight="600" fill="#111827">${escapeXml(wLabel)}</text>`,
  );

  return parts.join("");
}

function renderDopplerEffectSvg(
  spec: DopplerEffectScenarioSpec,
  sol: DopplerEffectSolution,
  width: number,
  height: number,
  guard: VisibilityGuard,
  markerId: string,
): string {
  const parts: string[] = [];
  const sf = guard.sigFigs;
  const midY = Math.round(height * 0.54);
  const sourceX = Math.round(width * 0.37);
  const observerX = Math.round(width * 0.8);
  const maxWaveR = Math.min(130, Math.round(height * 0.33));

  // Propagation baseline
  parts.push(
    `<line x1="36" y1="${num(midY)}" x2="${width - 36}" y2="${num(midY)}" stroke="#d1d5db" stroke-width="1.3" stroke-dasharray="5 4"/>`,
  );

  // Eccentric emitted wavefront circles
  const rawBeta = sol.sourceSpeedMs / sol.waveSpeedMs;
  const visualBeta = Math.min(0.9, rawBeta);
  const sourceDirSign =
    guard.isHidden("sourceMotion")
      ? 0
      : sol.sourceMotion === "towards-observer"
        ? 1
        : sol.sourceMotion === "away-from-observer"
          ? -1
          : 0;

  const ringCount = 5;
  for (let k = 1; k <= ringCount; k += 1) {
    const radius = (k / ringCount) * maxWaveR;
    const cx = sourceX - sourceDirSign * visualBeta * radius;
    parts.push(
      `<circle cx="${num(cx)}" cy="${num(midY)}" r="${num(radius)}" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-opacity="${num(0.95 - k * 0.12)}"/>`,
    );
  }

  // Source S marker & velocity vector
  parts.push(
    `<circle cx="${sourceX}" cy="${num(midY)}" r="8" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>`,
    `<text x="${sourceX}" y="${num(midY + 26)}" text-anchor="middle" font-size="13" font-weight="700" fill="#991b1b">Source S</text>`,
  );

  if (sol.sourceMotion !== "stationary" && !guard.isHidden("sourceMotion")) {
    const dir = sol.sourceMotion === "towards-observer" ? 1 : -1;
    const vecLen = 54;
    const vsLabel = guard.labelText(
      "sourceSpeedMs",
      "v_s",
      `v_s = ${formatQuantityWithUnit(sol.sourceSpeedMs, "m s⁻¹", sf)}`,
    );
    parts.push(
      `<line x1="${sourceX}" y1="${num(midY - 16)}" x2="${num(sourceX + dir * vecLen)}" y2="${num(midY - 16)}" stroke="#b91c1c" stroke-width="2.2" marker-end="url(#${markerId})"/>`,
      `<text x="${num(sourceX + dir * (vecLen / 2))}" y="${num(midY - 26)}" text-anchor="middle" font-size="12" font-weight="600" fill="#b91c1c">${escapeXml(vsLabel)}</text>`,
    );
  }

  // Observer O marker & velocity vector
  parts.push(
    `<rect x="${observerX - 8}" y="${num(midY - 10)}" width="16" height="20" rx="3" fill="#059669" stroke="#ffffff" stroke-width="1.5"/>`,
    `<text x="${observerX}" y="${num(midY + 28)}" text-anchor="middle" font-size="13" font-weight="700" fill="#065f46">Observer O</text>`,
  );

  if (
    sol.observerMotion !== "stationary" &&
    !guard.isHidden("observerMotion")
  ) {
    // Source is to the left of Observer, so towards-source points left (-1)
    const dir = sol.observerMotion === "towards-source" ? -1 : 1;
    const vecLen = 52;
    const voLabel = guard.labelText(
      "observerSpeedMs",
      "v_o",
      `v_o = ${formatQuantityWithUnit(sol.observerSpeedMs, "m s⁻¹", sf)}`,
    );
    parts.push(
      `<line x1="${observerX}" y1="${num(midY - 18)}" x2="${num(observerX + dir * vecLen)}" y2="${num(midY - 18)}" stroke="#047857" stroke-width="2.2" marker-end="url(#${markerId})"/>`,
      `<text x="${num(observerX + dir * (vecLen / 2))}" y="${num(midY - 28)}" text-anchor="middle" font-size="12" font-weight="600" fill="#047857">${escapeXml(voLabel)}</text>`,
    );
  }

  // Observed frequency label at O
  const fObsLabel = guard.labelText(
    "observedFrequencyHz",
    "f′",
    `f′ = ${formatQuantityWithUnit(sol.observedFrequencyHz, "Hz", sf)}`,
    [
      "observedPeriodS",
      "frequencyShiftHz",
      "fractionalFrequencyShift",
      "lowSpeedShiftApproximationHz",
    ],
  );
  parts.push(
    `<text x="${observerX}" y="${num(midY + 48)}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#065f46">${escapeXml(fObsLabel)}</text>`,
  );

  // Header badges for emitted frequency, wave speed, and apparent wavelength
  const badges: string[] = [];
  const fEmitLabel = guard.labelText(
    "emittedFrequencyHz",
    "f",
    `f = ${formatQuantityWithUnit(sol.emittedFrequencyHz, "Hz", sf)}`,
    ["emittedWavelengthM"],
  );
  badges.push(fEmitLabel);

  const vWaveLabel = guard.labelText(
    "waveSpeedMs",
    "v",
    `v = ${formatQuantityWithUnit(sol.waveSpeedMs, "m s⁻¹", sf)}`,
    ["relativeWaveSpeedAtObserverMs"],
  );
  badges.push(vWaveLabel);

  guard.tryBadge(
    badges,
    `λ′ = ${formatLengthAuto(sol.mediumWavelengthTowardsObserverM, sf)}`,
    "mediumWavelengthTowardsObserverM",
    "emittedWavelengthM",
    "emittedFrequencyHz",
    "waveSpeedMs",
    "sourceSpeedMs",
  );

  parts.push(
    `<text x="44" y="30" text-anchor="start" font-size="13" font-weight="500" fill="#1f2937">${escapeXml(badges.join("   |   "))}</text>`,
  );

  return parts.join("");
}

function renderMalusPolarizationSvg(
  spec: MalusPolarizationScenarioSpec,
  sol: MalusPolarizationSolution,
  width: number,
  height: number,
  guard: VisibilityGuard,
  markerId: string,
): string {
  const parts: string[] = [];
  const sf = guard.sigFigs;
  const benchMidY = Math.round(height * 0.54);

  // Left optical bench schematic (x = 38 .. 370)
  const benchStart = 42;
  const benchEnd = 360;
  parts.push(
    `<line x1="${benchStart}" y1="${num(benchMidY)}" x2="${benchEnd}" y2="${num(benchMidY)}" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#${markerId})"/>`,
  );

  const isUnpolarized = sol.incidentPolarization === "unpolarized";
  const analyzerX = isUnpolarized ? 248 : 196;

  if (isUnpolarized) {
    // Unpolarized star symbol at x = 78, Polarizer P1 at x = 142
    const starX = 76;
    for (const deg of [0, 45, 90, 135]) {
      const rad = (deg * Math.PI) / 180;
      const dx = 24 * Math.sin(rad);
      const dy = 24 * Math.cos(rad);
      parts.push(
        `<line x1="${num(starX - dx)}" y1="${num(benchMidY - dy)}" x2="${num(starX + dx)}" y2="${num(benchMidY + dy)}" stroke="#2563eb" stroke-width="1.6"/>`,
      );
    }
    const p1X = 142;
    parts.push(
      `<ellipse cx="${p1X}" cy="${num(benchMidY)}" rx="14" ry="52" fill="#eff6ff" stroke="#1e40af" stroke-width="2"/>`,
      `<line x1="${p1X}" y1="${num(benchMidY - 42)}" x2="${p1X}" y2="${num(benchMidY + 42)}" stroke="#1e40af" stroke-width="1.8"/>`,
      `<text x="${p1X}" y="${num(benchMidY + 70)}" text-anchor="middle" font-size="12" font-weight="600" fill="#1e3a8a">Polarizer P₁</text>`,
      // Vertically polarized wave between P1 and Analyzer
      `<line x1="194" y1="${num(benchMidY - 34)}" x2="194" y2="${num(benchMidY + 34)}" stroke="#2563eb" stroke-width="2" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>`,
    );
    const i1Candidate = `I₁ = ${formatQuantityWithUnit(sol.intensityBeforeAnalyzerWm2, "W m⁻²", sf)}`;
    if (
      !guard.isHidden("intensityBeforeAnalyzerWm2", "incidentIntensityWm2") &&
      !guard.leaksHiddenText(i1Candidate)
    ) {
      guard.recordVisible(i1Candidate);
      parts.push(
        `<text x="194" y="${num(benchMidY - 44)}" text-anchor="middle" font-size="11.5" fill="#1d4ed8">${escapeXml(i1Candidate)}</text>`,
      );
    }
  } else {
    // Vertically polarized incident E-field arrows
    for (const vx of [82, 122]) {
      parts.push(
        `<line x1="${vx}" y1="${num(benchMidY - 38)}" x2="${vx}" y2="${num(benchMidY + 38)}" stroke="#2563eb" stroke-width="2" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>`,
      );
    }
  }

  // Incident intensity label
  const i0Label = guard.labelText(
    "incidentIntensityWm2",
    "I₀",
    `I₀ = ${formatQuantityWithUnit(sol.incidentIntensityWm2, "W m⁻²", sf)}`,
  );
  parts.push(
    `<text x="90" y="${num(benchMidY - 56)}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#1d4ed8">${escapeXml(i0Label)}</text>`,
  );

  // Analyzer plate
  const thetaRad = (sol.analyzerAngleDegrees * Math.PI) / 180;
  const slotDx = 10 * Math.sin(thetaRad);
  const slotDy = 42 * Math.cos(thetaRad);
  parts.push(
    `<ellipse cx="${analyzerX}" cy="${num(benchMidY)}" rx="16" ry="54" fill="#fef2f2" stroke="#991b1b" stroke-width="2"/>`,
    `<line x1="${num(analyzerX - slotDx)}" y1="${num(benchMidY + slotDy)}" x2="${num(analyzerX + slotDx)}" y2="${num(benchMidY - slotDy)}" stroke="#b91c1c" stroke-width="2"/>`,
    `<text x="${analyzerX}" y="${num(benchMidY + 72)}" text-anchor="middle" font-size="12" font-weight="600" fill="#991b1b">Analyzer A</text>`,
  );

  // Transmitted E-field vector on bench
  const transX = Math.round((analyzerX + benchEnd) / 2);
  const transHalfH = 38 * sol.amplitudeTransmissionFactor;
  if (transHalfH >= 3) {
    parts.push(
      `<line x1="${transX}" y1="${num(benchMidY - transHalfH)}" x2="${transX}" y2="${num(benchMidY + transHalfH)}" stroke="#059669" stroke-width="2.2" marker-start="url(#${markerId})" marker-end="url(#${markerId})"/>`,
    );
  } else {
    parts.push(
      `<circle cx="${transX}" cy="${num(benchMidY)}" r="3.5" fill="#059669"/>`,
    );
  }

  const iTransLabel = guard.labelText(
    "transmittedIntensityWm2",
    "I",
    `I = ${formatQuantityWithUnit(sol.transmittedIntensityWm2, "W m⁻²", sf)}`,
    [
      "overallTransmissionFraction",
      "amplitudeTransmissionFactor",
      "absorbedIntensityAtAnalyzerWm2",
      "cosThetaSquared",
    ],
  );
  parts.push(
    `<text x="${transX}" y="${num(benchMidY - 56)}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#065f46">${escapeXml(iTransLabel)}</text>`,
  );

  // Right panel: Front-view polarization vector projection circle
  const cx = width - 148;
  const cy = benchMidY;
  const r0 = 92;

  parts.push(
    `<circle cx="${cx}" cy="${num(cy)}" r="${r0}" fill="#f9fafb" stroke="#d1d5db" stroke-width="1.4"/>`,
    `<text x="${cx}" y="${num(cy - r0 - 16)}" text-anchor="middle" font-size="12" font-weight="600" fill="#374151">Front view (along beam)</text>`,
    // Incident vertical E_0 vector
    `<line x1="${cx}" y1="${num(cy)}" x2="${cx}" y2="${num(cy - r0)}" stroke="#2563eb" stroke-width="2.2" marker-end="url(#${markerId})"/>`,
    `<text x="${cx - 10}" y="${num(cy - r0 + 12)}" text-anchor="end" font-size="12" font-weight="600" fill="#1d4ed8">E₀</text>`,
  );

  // Rotated analyzer axis unit vector u = (sin θ, -cos θ)
  const ux = Math.sin(thetaRad);
  const uy = -exactCosDegrees(sol.analyzerAngleDegrees);
  parts.push(
    `<line x1="${num(cx - r0 * ux)}" y1="${num(cy - r0 * uy)}" x2="${num(cx + r0 * ux)}" y2="${num(cy + r0 * uy)}" stroke="#b91c1c" stroke-width="1.6" stroke-dasharray="5 3"/>`,
  );

  // Projected transmitted E = (E_0 cos θ) u
  const projScalar = r0 * exactCosDegrees(sol.analyzerAngleDegrees);
  const projX = cx + projScalar * ux;
  const projY = cy + projScalar * uy;

  if (Math.abs(projScalar) > 2) {
    parts.push(
      // Orthogonal dashed drop-line from tip of E_0 (cx, cy - r0) to projected tip (projX, projY)
      `<line x1="${cx}" y1="${num(cy - r0)}" x2="${num(projX)}" y2="${num(projY)}" stroke="#6b7280" stroke-width="1.2" stroke-dasharray="3 3"/>`,
      `<line x1="${cx}" y1="${num(cy)}" x2="${num(projX)}" y2="${num(projY)}" stroke="#059669" stroke-width="2.6" marker-end="url(#${markerId})"/>`,
      `<text x="${num(projX + 10)}" y="${num(projY + 4)}" text-anchor="start" font-size="12" font-weight="700" fill="#065f46">E</text>`,
    );
  }

  // Angle arc θ from vertical (0, -1) clockwise to analyzer axis (ux, uy)
  const angleLabel = guard.labelText(
    "analyzerAngleDegrees",
    "θ",
    `θ = ${formatSignificant(sol.analyzerAngleDegrees, sf)}°`,
    ["cosThetaSquared", "amplitudeTransmissionFactor"],
  );
  if (sol.analyzerAngleDegrees > 0.5) {
    const arcR = 38;
    const endArcX = cx + arcR * Math.sin(thetaRad);
    const endArcY = cy - arcR * exactCosDegrees(sol.analyzerAngleDegrees);
    const largeArc = sol.analyzerAngleDegrees > 180 ? 1 : 0;
    parts.push(
      `<path d="M ${cx} ${num(cy - arcR)} A ${arcR} ${arcR} 0 ${largeArc} 1 ${num(endArcX)} ${num(endArcY)}" fill="none" stroke="#991b1b" stroke-width="1.5"/>`,
    );
  }
  const midTheta = thetaRad / 2;
  parts.push(
    `<text x="${num(cx + 52 * Math.sin(midTheta) + 4)}" y="${num(cy - 52 * Math.cos(midTheta))}" text-anchor="start" font-size="12" font-weight="600" fill="#991b1b">${escapeXml(angleLabel)}</text>`,
  );

  return parts.join("");
}

export function renderWavesSvg(
  spec: WavesScenarioSpec,
  options: WavesRenderOptions = {},
): string {
  const width = options.width ?? 680;
  const height = options.height ?? 420;
  const sigFigs = options.significantFigures ?? 3;

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 320 ||
    width > 1800 ||
    height < 240 ||
    height > 1400
  ) {
    throw new Error(
      `Invalid waves SVG dimensions: ${width}x${height} (expected integers in 320..1800 x 240..1400)`,
    );
  }
  if (!Number.isInteger(sigFigs) || sigFigs < 2 || sigFigs > 6) {
    throw new Error(
      `Invalid significantFigures: ${sigFigs} (expected integer in 2..6)`,
    );
  }

  const solution = solveWavesScenario(spec);
  const guard = createVisibilityGuard(spec, options, solution);
  const markerId = `waves-arrow-${sanitizeMarkerSeed(spec.id)}`;

  let bodySvg: string;
  switch (spec.kind) {
    case "progressive-wave":
      bodySvg = renderProgressiveWaveSvg(
        spec,
        solution as ProgressiveWaveSolution,
        width,
        height,
        guard,
        markerId,
      );
      break;
    case "standing-wave":
      bodySvg = renderStandingWaveSvg(
        spec,
        solution as StandingWaveSolution,
        width,
        height,
        guard,
        markerId,
      );
      break;
    case "double-slit":
      bodySvg = renderDoubleSlitSvg(
        spec,
        solution as DoubleSlitSolution,
        width,
        height,
        guard,
        markerId,
      );
      break;
    case "diffraction-grating":
      bodySvg = renderDiffractionGratingSvg(
        spec,
        solution as DiffractionGratingSolution,
        width,
        height,
        guard,
        markerId,
      );
      break;
    case "single-slit":
      bodySvg = renderSingleSlitSvg(
        spec,
        solution as SingleSlitSolution,
        width,
        height,
        guard,
        markerId,
      );
      break;
    case "doppler-effect":
      bodySvg = renderDopplerEffectSvg(
        spec,
        solution as DopplerEffectSolution,
        width,
        height,
        guard,
        markerId,
      );
      break;
    case "malus-polarization":
      bodySvg = renderMalusPolarizationSvg(
        spec,
        solution as MalusPolarizationSolution,
        width,
        height,
        guard,
        markerId,
      );
      break;
  }

  const fallbackTitle = defaultSafeTitle(spec);
  const altMode =
    options.visibility?.altTextMode ??
    spec.visibility?.altTextMode ??
    "student-safe";

  let safeTitle = fallbackTitle;
  if (spec.title && spec.title.trim()) {
    if (altMode === "teacher-complete") {
      safeTitle = spec.title.trim();
    } else {
      // Only honor a custom title in student-safe mode if no hidden quantity name or value appears in it
      const candidate = spec.title.trim();
      const leaksHidden = Object.entries(solution.quantities).some(
        ([key, val]) => {
          if (!guard.isHidden(key)) return false;
          const valStr = formatSignificant(val, sigFigs);
          const lenStr = formatLengthAuto(val, sigFigs);
          return (
            candidate.includes(key) ||
            candidate.includes(valStr) ||
            candidate.includes(lenStr) ||
            candidate.includes(String(val))
          );
        },
      );
      if (!leaksHidden) {
        safeTitle = candidate;
      }
    }
  }

  const uniqueDescriptions = [...new Set(guard.descriptions)];
  const descContent =
    uniqueDescriptions.length > 0
      ? uniqueDescriptions.join("; ")
      : fallbackTitle;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(safeTitle)}">`,
    `<title>${escapeXml(safeTitle)}</title>`,
    `<desc>${escapeXml(descContent)}</desc>`,
    `<defs>`,
    `<marker id="${markerId}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">`,
    `<path d="M 0 0.5 L 10 5 L 0 9.5 z" fill="#1f2937"/>`,
    `</marker>`,
    `</defs>`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
    `<g font-family="Arial, Helvetica, sans-serif" font-size="13">`,
    bodySvg,
    `<text x="${num(width - 16)}" y="${num(height - 12)}" text-anchor="end" font-size="11" fill="#6b7280">Diagram not to scale</text>`,
    `</g>`,
    `</svg>`,
  ].join("");
}
