import {
  QuantumNuclearBaseSpec,
  QuantumNuclearRenderOptions,
  QuantumNuclearScenarioSpec,
  QuantumNuclearSolution,
} from "./types";

const SUPERSCRIPT_MAP: Readonly<Record<string, string>> = {
  "-": "⁻",
  "+": "⁺",
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

const SUBSCRIPT_MAP: Readonly<Record<string, string>> = {
  "-": "₋",
  "+": "₊",
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "\u2089",
};

const UNICODE_DIGIT_TO_ASCII: Readonly<Record<string, string>> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
  "⁻": "-",
  "₋": "-",
  "−": "-",
  "⁺": "+",
  "₊": "+",
};

export function normalizeUnicodeNumericText(value: string): string {
  return [...value].map((ch) => UNICODE_DIGIT_TO_ASCII[ch] ?? ch).join("");
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&apos;";
      default:
        return character;
    }
  });
}

export function coord(value: number): string {
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function toSuperscript(value: number | string): string {
  return [...String(value)].map((ch) => SUPERSCRIPT_MAP[ch] ?? ch).join("");
}

export function toSubscript(value: number | string): string {
  return [...String(value)].map((ch) => SUBSCRIPT_MAP[ch] ?? ch).join("");
}

export function formatNuclidePlain(
  massNumberA: number | string,
  atomicNumberZ: number | string,
  symbol: string,
): string {
  return `${toSuperscript(massNumberA)}${toSubscript(atomicNumberZ)}${symbol}`;
}

export function formatScientificSigFigs(
  value: number,
  sigFigs = 3,
  unit = "",
): string {
  if (!Number.isFinite(value)) return "undefined";
  if (Math.abs(value) === 0) {
    return unit ? `0 ${unit}` : "0";
  }
  const absVal = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  let formatted: string;
  if (absVal >= 0.01 && absVal < 10000) {
    const raw = absVal.toPrecision(sigFigs);
    if (raw.includes("e")) {
      formatted = String(Number(raw));
    } else {
      formatted = raw;
    }
  } else {
    const expParts = absVal.toExponential(sigFigs - 1).split("e");
    const mantissa = expParts[0];
    const exponent = Number(expParts[1]);
    formatted = `${mantissa} × 10${toSuperscript(exponent)}`;
  }
  return `${sign}${formatted}${unit ? ` ${unit}` : ""}`;
}

export function formatCleanTick(value: number): string {
  if (Math.abs(value) < 1e-12) return "0";
  const rounded = Number(value.toPrecision(6));
  return rounded < 0 ? `−${Math.abs(rounded)}` : String(rounded);
}

const SYNONYM_KEY_GROUPS: ReadonlyArray<readonly string[]> = [
  ["thresholdFrequencyHz", "f0"],
  ["incidentPhotonEnergyEv", "photonEnergyEv"],
  ["deBroglieWavelengthM", "wavelength"],
  ["kineticEnergyMeV", "initialKineticEnergyMeV"],
  ["kineticEnergyJ", "initialKineticEnergyJ"],
  ["closestApproachFm", "closestApproach"],
  ["estimatedNuclearRadiusFm", "nuclearRadius"],
  ["objectVelocityPrimeFractionC", "transformedVelocityFractionC"],
  [
    "parentA",
    "parentNuclide.massNumberA",
    "nuclide:0:A",
    "nuclide:0:massNumberA",
  ],
  [
    "parentZ",
    "parentNuclide.atomicNumberZ",
    "nuclide:0:Z",
    "nuclide:0:atomicNumberZ",
  ],
  ["parentN", "nuclide:0:N", "nuclide:0:neutronNumberN"],
  ["comparisonWorkFunctionEv", "comparison:workFunctionEv"],
  ["comparisonThresholdFrequencyHz", "comparison:thresholdFrequencyHz"],
  ["comparisonYIntercept", "comparison:yIntercept"],
];

function expandSynonymSet(rawKeys: readonly string[]): Set<string> {
  const expanded = new Set<string>(rawKeys);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of SYNONYM_KEY_GROUPS) {
      if (group.some((k) => expanded.has(k))) {
        for (const k of group) {
          if (!expanded.has(k)) {
            expanded.add(k);
            changed = true;
          }
        }
      }
    }
  }
  return expanded;
}

function addQuantityValue(
  bucket: Record<string, number[]>,
  key: string,
  value: number | null | undefined,
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  if (!bucket[key]) {
    bucket[key] = [];
  }
  bucket[key].push(value);
}

/**
 * Extracts every numeric input and solved quantity (including canonical aliases)
 * for universal hidden-magnitude protection and per-quantity leakage auditing.
 */
export function extractQuantumNuclearQuantityMap(
  spec: QuantumNuclearScenarioSpec,
  solution: QuantumNuclearSolution,
): Readonly<Record<string, readonly number[]>> {
  const map: Record<string, number[]> = {};
  const put = (key: string, val: number | null | undefined) =>
    addQuantityValue(map, key, val);

  switch (solution.kind) {
    case "energy-levels": {
      if (spec.kind === "energy-levels") {
        put("atomicNumberZ", spec.atomicNumberZ);
        put("Z", spec.atomicNumberZ);
        put("maxPrincipalN", spec.maxPrincipalN);
      }
      put("groundStateEnergyEv", solution.groundStateEnergyEv);
      put("groundStateEnergyJ", solution.groundStateEnergyJ);
      put("continuumEnergyEv", solution.continuumEnergyEv);
      put("ionizationEnergyEv", solution.ionizationEnergyEv);
      put("ionizationEnergyJ", solution.ionizationEnergyJ);
      put("ionizationFrequencyHz", solution.ionizationFrequencyHz);
      put("ionizationWavelengthM", solution.ionizationWavelengthM);
      put("ionizationWavelengthNm", solution.ionizationWavelengthNm);

      for (const lvl of solution.levels) {
        put(lvl.id, lvl.energyEv);
        put(lvl.id, lvl.energyJ);
        put(`level:${lvl.id}`, lvl.energyEv);
        put(`level:${lvl.id}`, lvl.energyJ);
        put(`level:${lvl.id}:energyEv`, lvl.energyEv);
        put(`level:${lvl.id}:energyJ`, lvl.energyJ);
        put(`E_${lvl.id}`, lvl.energyEv);
        put(`E_${lvl.id}`, lvl.energyJ);
        put("levelEnergies", lvl.energyEv);
        put("levelEnergies", lvl.energyJ);
        if (lvl.principalQuantumNumber !== undefined) {
          put(`E_${lvl.principalQuantumNumber}`, lvl.energyEv);
          put(`E_${lvl.principalQuantumNumber}`, lvl.energyJ);
          put(`E${lvl.principalQuantumNumber}`, lvl.energyEv);
          put(`E${lvl.principalQuantumNumber}`, lvl.energyJ);
        }
      }

      for (const tr of solution.transitions) {
        put(`transition:${tr.id}:initialEnergyEv`, tr.initialEnergyEv);
        put(`transition:${tr.id}:finalEnergyEv`, tr.finalEnergyEv);
        put(`transition:${tr.id}:signedDeltaEnergyEv`, tr.signedDeltaEnergyEv);
        put(`transition:${tr.id}:deltaEnergyEv`, tr.deltaEnergyEv);
        put(`transition:${tr.id}:photonEnergyJ`, tr.photonEnergyJ);
        put(`transition:${tr.id}:frequencyHz`, tr.frequencyHz);
        put(`transition:${tr.id}:wavelengthM`, tr.wavelengthM);
        put(`transition:${tr.id}:wavelengthNm`, tr.wavelengthNm);
        put(`transition:${tr.id}:photonMomentumNs`, tr.photonMomentumNs);
        put("signedDeltaEnergyEv", tr.signedDeltaEnergyEv);
        put("deltaEnergyEv", tr.deltaEnergyEv);
        put("photonEnergyJ", tr.photonEnergyJ);
        put("frequencyHz", tr.frequencyHz);
        put("wavelengthM", tr.wavelengthM);
        put("wavelengthNm", tr.wavelengthNm);
        put("photonMomentumNs", tr.photonMomentumNs);
        put("transitionWavelengths", tr.wavelengthNm);
        put("transitionEnergies", tr.deltaEnergyEv);
      }
      break;
    }

    case "photoelectric-effect": {
      put("workFunctionEv", solution.workFunctionEv);
      put("workFunctionJ", solution.workFunctionJ);
      put("thresholdFrequencyHz", solution.thresholdFrequencyHz);
      put("f0", solution.thresholdFrequencyHz);
      put("thresholdWavelengthM", solution.thresholdWavelengthM);
      put("thresholdWavelengthNm", solution.thresholdWavelengthNm);
      put("incidentFrequencyHz", solution.incidentFrequencyHz);
      put("incidentWavelengthM", solution.incidentWavelengthM);
      put("incidentWavelengthNm", solution.incidentWavelengthNm);
      put("photonEnergyEv", solution.photonEnergyEv);
      put("incidentPhotonEnergyEv", solution.photonEnergyEv);
      put("photonEnergyJ", solution.photonEnergyJ);
      put("signedEnergyBalanceEv", solution.signedEnergyBalanceEv);
      put("maxKineticEnergyEv", solution.maxKineticEnergyEv);
      put("maxKineticEnergyJ", solution.maxKineticEnergyJ);
      put("stoppingPotentialV", solution.stoppingPotentialV);
      put("maxElectronSpeedMs", solution.maxElectronSpeedMs);
      put("graphSlope", solution.graphSlope);
      put("yIntercept", solution.yIntercept);
      if (solution.comparison) {
        put("comparisonWorkFunctionEv", solution.comparison.workFunctionEv);
        put("comparison:workFunctionEv", solution.comparison.workFunctionEv);
        put(
          "comparisonThresholdFrequencyHz",
          solution.comparison.thresholdFrequencyHz,
        );
        put(
          "comparison:thresholdFrequencyHz",
          solution.comparison.thresholdFrequencyHz,
        );
        put("comparisonYIntercept", solution.comparison.yIntercept);
        put("comparison:yIntercept", solution.comparison.yIntercept);
      }
      break;
    }

    case "matter-waves": {
      put("massKg", solution.massKg);
      put("chargeMagnitudeC", solution.chargeMagnitudeC);
      put("acceleratingVoltageV", solution.acceleratingVoltageV);
      put("kineticEnergyJ", solution.kineticEnergyJ);
      put("kineticEnergyEv", solution.kineticEnergyEv);
      put("speedMs", solution.speedMs);
      put("momentumNs", solution.momentumNs);
      put("deBroglieWavelengthM", solution.deBroglieWavelengthM);
      put("wavelength", solution.deBroglieWavelengthM);
      put("deBroglieWavelengthNm", solution.deBroglieWavelengthNm);
      put("deBroglieWavelengthPm", solution.deBroglieWavelengthPm);
      if (solution.diffraction) {
        put("latticeSpacingM", solution.diffraction.latticeSpacingM);
        put("screenDistanceM", solution.diffraction.screenDistanceM);
        put("sinTheta", solution.diffraction.sinTheta);
        put("firstOrderAngleRad", solution.diffraction.firstOrderAngleRad);
        put("firstOrderAngleDeg", solution.diffraction.firstOrderAngleDeg);
        put("ringRadiusM", solution.diffraction.ringRadiusM);
        put("diffraction:sinTheta", solution.diffraction.sinTheta);
        put(
          "diffraction:firstOrderAngleRad",
          solution.diffraction.firstOrderAngleRad,
        );
        put(
          "diffraction:firstOrderAngleDeg",
          solution.diffraction.firstOrderAngleDeg,
        );
        put("diffraction:ringRadiusM", solution.diffraction.ringRadiusM);
      }
      break;
    }

    case "radioactive-decay": {
      put("halfLife", solution.halfLife);
      put("halfLifeS", solution.halfLifeS);
      put("decayConstant", solution.decayConstant);
      put("decayConstantPerS", solution.decayConstantPerS);
      put("elapsedTime", solution.elapsedTime);
      put("elapsedTimeS", solution.elapsedTimeS);
      put("numberOfHalfLives", solution.numberOfHalfLives);
      put("remainingFraction", solution.remainingFraction);
      put("decayedFraction", solution.decayedFraction);
      put("initialNuclei", solution.initialNuclei);
      put("remainingNuclei", solution.remainingNuclei);
      put("decayedNuclei", solution.decayedNuclei);
      put("initialActivityBq", solution.initialActivityBq);
      put("remainingActivityBq", solution.remainingActivityBq);
      put("backgroundCountRate", solution.backgroundCountRate);
      put("initialNetCountRate", solution.initialNetCountRate);
      put("initialTotalCountRate", solution.initialTotalCountRate);
      put("remainingNetCountRate", solution.remainingNetCountRate);
      put("remainingTotalCountRate", solution.remainingTotalCountRate);
      break;
    }

    case "nuclear-decay-chain": {
      put("totalAlphaCount", solution.totalAlphaCount);
      put("totalBetaMinusCount", solution.totalBetaMinusCount);
      put("totalBetaPlusCount", solution.totalBetaPlusCount);
      put("totalGammaCount", solution.totalGammaCount);
      put("netDeltaA", solution.netDeltaA);
      put("netDeltaZ", solution.netDeltaZ);
      put("netDeltaN", solution.netDeltaN);

      solution.nuclides.forEach((nuc, idx) => {
        put(`nuclide:${idx}:A`, nuc.massNumberA);
        put(`nuclide:${idx}:Z`, nuc.atomicNumberZ);
        put(`nuclide:${idx}:N`, nuc.neutronNumberN);
        put(`nuclide:${idx}:massNumberA`, nuc.massNumberA);
        put(`nuclide:${idx}:atomicNumberZ`, nuc.atomicNumberZ);
        put(`nuclide:${idx}:neutronNumberN`, nuc.neutronNumberN);
        if (idx === 0) {
          put("parentA", nuc.massNumberA);
          put("parentZ", nuc.atomicNumberZ);
          put("parentN", nuc.neutronNumberN);
          put("parentNuclide.massNumberA", nuc.massNumberA);
          put("parentNuclide.atomicNumberZ", nuc.atomicNumberZ);
        } else {
          put("daughterA", nuc.massNumberA);
          put("daughterZ", nuc.atomicNumberZ);
          put("daughterN", nuc.neutronNumberN);
          if (idx === solution.nuclides.length - 1) {
            put("finalA", nuc.massNumberA);
            put("finalZ", nuc.atomicNumberZ);
            put("finalN", nuc.neutronNumberN);
          }
        }
      });

      solution.steps.forEach((st) => {
        put(`step:${st.id}:deltaA`, st.deltaA);
        put(`step:${st.id}:deltaZ`, st.deltaZ);
        put(`step:${st.id}:deltaN`, st.deltaN);
      });
      break;
    }

    case "nuclear-binding": {
      if (solution.calculationMode === "single-nuclide") {
        put("massNumberA", solution.massNumberA);
        put("atomicNumberZ", solution.atomicNumberZ);
        put("neutronNumberN", solution.neutronNumberN);
        put("nuclearMassU", solution.nuclearMassU);
        if (spec.kind === "nuclear-binding" && spec.calculationMode === "single-nuclide") {
          put("atomicMassU", spec.atomicMassU);
        }
        put("constituentMassU", solution.constituentMassU);
        put("massDefectU", solution.massDefectU);
        put("massDefectKg", solution.massDefectKg);
        put("bindingEnergyMeV", solution.bindingEnergyMeV);
        put("bindingEnergyJ", solution.bindingEnergyJ);
        put("bindingEnergyPerNucleonMeV", solution.bindingEnergyPerNucleonMeV);
        put("bindingEnergyPerNucleonJ", solution.bindingEnergyPerNucleonJ);
      } else {
        put("totalReactantA", solution.totalReactantA);
        put("totalProductA", solution.totalProductA);
        put("totalReactantZ", solution.totalReactantZ);
        put("totalProductZ", solution.totalProductZ);
        put("massDifferenceU", solution.massDifferenceU);
        put("massDifferenceKg", solution.massDifferenceKg);
        put("qValueMeV", solution.qValueMeV);
        put("qValueJ", solution.qValueJ);
        put("reactantTotalBindingMeV", solution.reactantTotalBindingMeV);
        put("productTotalBindingMeV", solution.productTotalBindingMeV);
        if (
          spec.kind === "nuclear-binding" &&
          spec.calculationMode === "reaction"
        ) {
          for (const sp of spec.reactants) {
            put(`reactant:${sp.id}:massNumberA`, sp.massNumberA);
            put(`reactant:${sp.id}:atomicNumberZ`, sp.atomicNumberZ);
            put(`reactant:${sp.id}:massU`, sp.massU);
            put(
              `reactant:${sp.id}:bindingEnergyPerNucleonMeV`,
              sp.bindingEnergyPerNucleonMeV,
            );
          }
          for (const sp of spec.products) {
            put(`product:${sp.id}:massNumberA`, sp.massNumberA);
            put(`product:${sp.id}:atomicNumberZ`, sp.atomicNumberZ);
            put(`product:${sp.id}:massU`, sp.massU);
            put(
              `product:${sp.id}:bindingEnergyPerNucleonMeV`,
              sp.bindingEnergyPerNucleonMeV,
            );
          }
        }
      }
      break;
    }

    case "rutherford-scattering": {
      put("projectileChargeZ", solution.projectileChargeZ);
      put("projectileChargeC", solution.projectileChargeC);
      put("targetChargeZ", solution.targetChargeZ);
      put("targetChargeC", solution.targetChargeC);
      put("targetMassNumberA", solution.targetMassNumberA);
      put("initialKineticEnergyMeV", solution.initialKineticEnergyMeV);
      put("kineticEnergyMeV", solution.initialKineticEnergyMeV);
      put("initialKineticEnergyJ", solution.initialKineticEnergyJ);
      put("kineticEnergyJ", solution.initialKineticEnergyJ);
      put("closestApproachM", solution.closestApproachM);
      put("closestApproachFm", solution.closestApproachFm);
      put("closestApproach", solution.closestApproachFm);
      put("estimatedNuclearRadiusM", solution.estimatedNuclearRadiusM);
      put("estimatedNuclearRadiusFm", solution.estimatedNuclearRadiusFm);
      put("nuclearRadius", solution.estimatedNuclearRadiusFm);
      put("nuclearDensityKgM3", solution.nuclearDensityKgM3);
      break;
    }

    case "special-relativity": {
      put("beta", solution.beta);
      put("frameSpeedMs", solution.frameSpeedMs);
      put("lorentzFactor", solution.lorentzFactor);
      put("minkowskiAxisAngleRad", solution.minkowskiAxisAngleRad);
      put("minkowskiAxisAngleDeg", solution.minkowskiAxisAngleDeg);
      put("properTimeS", solution.properTimeS);
      put("dilatedTimeS", solution.dilatedTimeS);
      put("properLengthM", solution.properLengthM);
      put("contractedLengthM", solution.contractedLengthM);
      put("objectVelocityFractionC", solution.objectVelocityFractionC);
      put("objectVelocityMs", solution.objectVelocityMs);
      put("transformedVelocityFractionC", solution.transformedVelocityFractionC);
      put("objectVelocityPrimeFractionC", solution.transformedVelocityFractionC);
      put("transformedVelocityMs", solution.transformedVelocityMs);
      if (spec.kind === "special-relativity") {
        put("domainLightSeconds", spec.domainLightSeconds);
        for (const wl of spec.worldlines ?? []) {
          put(`worldline:${wl.id}:beta`, wl.beta);
          put(`worldline:${wl.id}:x0LightSeconds`, wl.x0LightSeconds);
        }
      }
      for (const ev of solution.events) {
        put(`event:${ev.id}:xLightSeconds`, ev.xLightSeconds);
        put(`event:${ev.id}:ctLightSeconds`, ev.ctLightSeconds);
        put(`event:${ev.id}:xPrimeLightSeconds`, ev.xPrimeLightSeconds);
        put(`event:${ev.id}:ctPrimeLightSeconds`, ev.ctPrimeLightSeconds);
        put(
          `event:${ev.id}:invariantIntervalSquaredLs2`,
          ev.invariantIntervalSquaredLs2,
        );
        put("xLightSeconds", ev.xLightSeconds);
        put("ctLightSeconds", ev.ctLightSeconds);
        put("xPrimeLightSeconds", ev.xPrimeLightSeconds);
        put("ctPrimeLightSeconds", ev.ctPrimeLightSeconds);
        put("invariantIntervalSquaredLs2", ev.invariantIntervalSquaredLs2);
      }
      break;
    }
  }

  return map;
}

export interface VisibilityGuard {
  readonly zeroIsHidden: boolean;
  readonly canShowInput: (keys: string | readonly string[]) => boolean;
  readonly canShowDerived: (keys: string | readonly string[]) => boolean;
  readonly isExplicitlyHidden: (keys: string | readonly string[]) => boolean;
  readonly matchesHiddenValue: (candidate: number) => boolean;
  readonly textContainsHiddenNumber: (text: string) => boolean;
  readonly placeholder: (key: string, fallback: string) => string;
}

function normalizeList(keys: string | readonly string[]): readonly string[] {
  return typeof keys === "string" ? [keys] : keys;
}

export function createVisibilityGuard(
  spec: QuantumNuclearBaseSpec,
  options: QuantumNuclearRenderOptions = {},
  quantityMap: Readonly<Record<string, readonly number[]>> = {},
): VisibilityGuard {
  const mergedHiddenList = [
    ...(spec.hiddenQuantities ?? []),
    ...(options.hiddenQuantities ?? []),
  ];
  const mergedGivenList = [
    ...(spec.givenQuantities ?? []),
    ...(options.givenQuantities ?? []),
  ];
  const mergedPlaceholders: Readonly<Record<string, string>> = {
    ...(spec.placeholders ?? {}),
    ...(options.placeholders ?? {}),
  };

  const hidden = expandSynonymSet(mergedHiddenList);
  const given = expandSynonymSet(mergedGivenList);
  const mode = options.visibilityMode ?? spec.visibilityMode ?? "hide-listed";
  const globalHidden = hidden.has("*") || hidden.has("all");

  const hiddenMagnitudes: number[] = [];
  const hiddenFormattedMagnitudes = new Set<string>();
  let zeroIsHidden = globalHidden;

  for (const hKey of hidden) {
    const vals = quantityMap[hKey];
    if (!vals) continue;
    for (const val of vals) {
      if (!Number.isFinite(val)) continue;
      if (val === 0) {
        zeroIsHidden = true;
      } else {
        const mag = Math.abs(val);
        hiddenMagnitudes.push(mag);
        hiddenFormattedMagnitudes.add(formatScientificSigFigs(mag, 3));
        hiddenFormattedMagnitudes.add(String(Number(mag.toPrecision(3))));
        if (mag >= 1e-6 && mag < 1e9) {
          hiddenFormattedMagnitudes.add(formatCleanTick(mag));
        }
      }
    }
  }

  const matchesHiddenValue = (candidate: number): boolean => {
    if (!Number.isFinite(candidate)) return false;
    if (globalHidden) return true;
    if (candidate === 0) return zeroIsHidden;
    const cMag = Math.abs(candidate);
    if (
      hiddenFormattedMagnitudes.has(formatScientificSigFigs(cMag, 3)) ||
      hiddenFormattedMagnitudes.has(String(Number(cMag.toPrecision(3)))) ||
      (cMag >= 1e-6 &&
        cMag < 1e9 &&
        hiddenFormattedMagnitudes.has(formatCleanTick(cMag)))
    ) {
      return true;
    }
    return hiddenMagnitudes.some(
      (hMag) => Math.abs(cMag - hMag) <= 1e-6 * hMag,
    );
  };

  const textContainsHiddenNumber = (text: string): boolean => {
    if (globalHidden) return /\d/.test(text);
    const matches = text.match(/\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi);
    if (!matches) return false;
    return matches.some((tok) => matchesHiddenValue(Number(tok)));
  };

  const isExplicitlyHidden = (keys: string | readonly string[]): boolean => {
    if (globalHidden) return true;
    const list = normalizeList(keys);
    return list.some((key) => hidden.has(key));
  };

  const isExplicitlyGiven = (keys: string | readonly string[]): boolean => {
    if (given.has("*") || given.has("all")) return true;
    const list = normalizeList(keys);
    return list.some((key) => given.has(key));
  };

  return {
    zeroIsHidden,
    isExplicitlyHidden,
    matchesHiddenValue,
    textContainsHiddenNumber,
    canShowInput: (keys: string | readonly string[]): boolean => {
      if (isExplicitlyHidden(keys)) return false;
      if (mode === "strict-allowlist") {
        return isExplicitlyGiven(keys);
      }
      return true;
    },
    canShowDerived: (keys: string | readonly string[]): boolean => {
      if (isExplicitlyHidden(keys)) return false;
      return isExplicitlyGiven(keys);
    },
    placeholder: (key: string, fallback: string): string => {
      return mergedPlaceholders[key] ?? fallback;
    },
  };
}
