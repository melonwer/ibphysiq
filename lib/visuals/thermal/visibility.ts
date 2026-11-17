import { ELEMENTARY_CHARGE, KELVIN_OFFSET } from "./constants";
import { ThermalRenderOptions, ThermalScenarioSpec } from "./types";

export interface AxisTickLayout {
  readonly domain: [number, number];
  readonly majorTicks: readonly number[];
  readonly minorTicks: readonly number[];
  readonly majorStep: number;
  readonly minorStep: number;
}

export interface ScaledUnitSpec {
  readonly scaleFactor: number;
  readonly unitLabel: string;
}

export interface VisibilityController {
  readonly mode: "student-safe" | "teacher-complete";
  isHidden: (...aliases: string[]) => boolean;
  isExplicitlyHidden: (...aliases: string[]) => boolean;
  isExplicitlyVisible: (...aliases: string[]) => boolean;
  leaksHiddenText: (text: string) => boolean;
  matchesHiddenValue: (value: number) => boolean;
}

function normalizeToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_.:/-]+/g, "");
}

/**
 * Expand common physics shorthand aliases so callers can specify e.g.
 * "P_B" or "state:B:pressurePa" or "T_eq" or "equilibriumTemperatureK"
 * interchangeably in hiddenQuantities / visibleQuantities.
 */
function expandAliases(token: string, spec?: ThermalScenarioSpec): string[] {
  const norm = normalizeToken(token);
  const out = new Set<string>([norm]);

  const addStatePropertyVariants = (stateRef: string, propFull: string) => {
    out.add(`state${stateRef}${propFull}`);
    if (propFull === "temperaturek") {
      out.add(`state${stateRef}temperaturec`);
    }
    const propShort =
      propFull === "pressurepa"
        ? "p"
        : propFull === "volumem3"
          ? "v"
          : propFull === "temperaturek" || propFull === "temperaturec"
            ? "t"
            : "u";
    out.add(`${propShort}${stateRef}`);

    if (/^[a-z]$/.test(stateRef)) {
      const idx = stateRef.charCodeAt(0) - 97;
      if (idx >= 0 && idx < 26) {
        out.add(`state${idx}${propFull}`);
        out.add(`${propShort}${idx + 1}`);
      }
    } else if (/^\d+$/.test(stateRef)) {
      const num = Number(stateRef);
      if (Number.isInteger(num) && num >= 1 && num <= 26) {
        const letter = String.fromCharCode(96 + num);
        out.add(`state${letter}${propFull}`);
        out.add(`state${num - 1}${propFull}`);
        out.add(`${propShort}${letter}`);
      }
    }
  };

  // Match P_A, V_B, T_C, U_D or P1, V2, T3
  const statePropMatch = /^([pvtu])([a-z]|\d+)$/.exec(norm);
  if (statePropMatch) {
    const [, propChar, stateRef] = statePropMatch;
    const propFull =
      propChar === "p"
        ? "pressurepa"
        : propChar === "v"
          ? "volumem3"
          : propChar === "t"
            ? "temperaturek"
            : "internalenergyj";
    addStatePropertyVariants(stateRef, propFull);
  }

  // Match explicit state:<id>:<prop>
  const explicitStateMatch =
    /^state([a-z0-9]+)(pressurepa|volumem3|temperaturek|temperaturec|internalenergyj)$/.exec(
      norm,
    );
  if (explicitStateMatch) {
    const [, sRef, propFull] = explicitStateMatch;
    addStatePropertyVariants(sRef, propFull);
    if (spec?.kind === "thermodynamic-process") {
      const stateEntries: Array<{ idx: number; id: string; label: string }> = [
        {
          idx: 0,
          id: normalizeToken(spec.initialState.stateId ?? "A"),
          label: normalizeToken(spec.initialState.label ?? "A"),
        },
      ];
      spec.steps.forEach((st, i) => {
        const def = i + 1 < 26 ? String.fromCharCode(98 + i) : `s${i + 2}`;
        stateEntries.push({
          idx: i + 1,
          id: normalizeToken(st.toStateId ?? def),
          label: normalizeToken(st.toLabel ?? def),
        });
      });
      for (const entry of stateEntries) {
        if (
          sRef === entry.id ||
          sRef === entry.label ||
          sRef === String(entry.idx)
        ) {
          out.add(`state${entry.id}${propFull}`);
          out.add(`state${entry.label}${propFull}`);
          out.add(`state${entry.idx}${propFull}`);
        }
      }
    }
  }

  // Match leg:<idx>:workJ <-> leg:<idx>:workOnGasJ and entropy aliases
  const legWorkMatch = /^leg(\d+)work(?:ongas)?j$/.exec(norm);
  if (legWorkMatch) {
    const idx = legWorkMatch[1];
    out.add(`leg${idx}workj`);
    out.add(`leg${idx}workongasj`);
  }
  const legEntropyMatch = /^leg(\d+)(?:isothermal)?entropychangejk$/.exec(norm);
  if (legEntropyMatch) {
    const idx = legEntropyMatch[1];
    out.add(`leg${idx}entropychangejk`);
    out.add(`leg${idx}isothermalentropychangejk`);
  }

  // Match component:<idx|id>:<prop> on calorimetry-mixing
  const compMatch =
    /^component([a-z0-9]+)(masskg|initialtemperaturek|initialtemperaturec|specificheatjperkgk|signedheatj|sensibleheatj|latentheatj|transitionfraction)$/.exec(
      norm,
    );
  if (compMatch) {
    const [, cRef, cProp] = compMatch;
    const tempTwin =
      cProp === "initialtemperaturek"
        ? "initialtemperaturec"
        : cProp === "initialtemperaturec"
          ? "initialtemperaturek"
          : null;
    const addCompRef = (ref: string) => {
      out.add(`component${ref}${cProp}`);
      if (tempTwin) out.add(`component${ref}${tempTwin}`);
    };
    addCompRef(cRef);
    if (spec?.kind === "calorimetry-mixing") {
      spec.components.forEach((comp, idx) => {
        const normId = normalizeToken(comp.id);
        if (cRef === String(idx) || cRef === normId) {
          addCompRef(String(idx));
          if (normId) addCompRef(normId);
        }
      });
    }
  }

  const synonymGroups: ReadonlyArray<readonly string[]> = [
    ["networkj", "totalworkj", "wnet", "workj", "w", "workongasj", "won"],
    ["netheatj", "totalheatj", "qnet"],
    ["heatinputj", "qin", "qinput"],
    ["heatrejectedj", "qout", "qrejected"],
    ["thermalefficiency", "efficiency", "eta"],
    ["carnotefficiency", "etacarnot"],
    ["copcooling", "cop", "coefficientofperformance"],
    ["hottemperaturek", "th", "thot"],
    ["coldtemperaturek", "tc", "tcold"],
    [
      "entropychangejk",
      "totalentropychangejk",
      "isothermalentropychangejk",
      "deltas",
      "entropy",
    ],
    ["deltauj", "totaldeltauj", "deltau", "internalenergychange"],
    ["equilibriumtemperaturek", "equilibriumtemperaturec", "teq"],
    ["initialtemperaturek", "initialtemperaturec", "ti", "tinitial", "t0"],
    ["finaltemperaturek", "finaltemperaturec", "tf", "tfinal"],
    ["ambienttemperaturek", "ambienttemperaturec", "tambient", "tamb"],
    ["latentheatfusionjperkg", "lf", "latentheatfusion"],
    ["latentheatvaporizationjperkg", "lv", "latentheatvaporization"],
    ["meltingpointk", "meltingpointc", "tm", "tmelting"],
    ["boilingpointk", "boilingpointc", "tb", "tboiling"],
    ["rmsspeedms", "vrms", "crms"],
    ["comparisonrmsspeedms", "vrms2"],
    ["mostprobablespeedms", "vp", "vmp"],
    ["meanspeedms", "vmean", "vbar", "averagespeedms"],
    ["averagekineticenergyj", "averagekineticenergyev", "ekavg", "ek", "ke"],
    ["peakwavelengthm", "peakwavelengthnm", "lambdamax", "wienwavelength"],
    ["comparisonpeakwavelengthm", "comparisonpeakwavelengthnm", "lambdamax2"],
    ["radiatedpowerw", "powerw", "power", "luminosityw"],
    ["netradiatedpowerw", "pnet"],
    ["radiatedintensitywm2", "intensitywm2", "intensityatdistancewm2"],
    ["totalenergyj", "energyj", "qtotal", "heatj", "signedtotalheatj"],
    ["totaldurations", "durations", "times", "time"],
  ];

  for (const group of synonymGroups) {
    if (group.includes(norm)) {
      for (const item of group) out.add(item);
    }
  }

  return [...out];
}

function extractNumericTokens(text: string): string[] {
  const withoutPowersOfTen = text.replace(/×\s*10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, " ");
  return [
    ...withoutPowersOfTen.matchAll(/[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?/gi),
  ].map((m) => m[0]);
}

function collectCompanionValues(qKey: string, rawVal: number): number[] {
  const kNorm = normalizeToken(qKey);
  const vals = [rawVal];

  if (kNorm.endsWith("temperaturek") || kNorm.endsWith("pointk")) {
    vals.push(rawVal - KELVIN_OFFSET);
  } else if (kNorm.endsWith("temperaturec") || kNorm.endsWith("pointc")) {
    vals.push(rawVal + KELVIN_OFFSET);
  } else if (kNorm.includes("pressurepa")) {
    vals.push(rawVal * 1e-3, rawVal * 1e-5, rawVal * 1e-6);
  } else if (kNorm.includes("volumem3")) {
    vals.push(rawVal * 1e3, rawVal * 1e6);
  } else if (
    kNorm.endsWith("energyj") ||
    kNorm.endsWith("workj") ||
    kNorm.endsWith("heatj") ||
    kNorm.endsWith("deltauj")
  ) {
    vals.push(rawVal * 1e-3, rawVal * 1e-6);
    if (kNorm.includes("kineticenergyj")) {
      vals.push(rawVal / ELEMENTARY_CHARGE);
    }
  } else if (kNorm.endsWith("kineticenergyev")) {
    vals.push(rawVal * ELEMENTARY_CHARGE);
  } else if (
    kNorm.includes("efficiency") ||
    kNorm.endsWith("fraction") ||
    kNorm.includes("emissivity")
  ) {
    vals.push(rawVal * 100);
  } else if (kNorm.endsWith("wavelengthm")) {
    vals.push(rawVal * 1e9, rawVal * 1e6, rawVal * 1e3);
  } else if (kNorm.endsWith("wavelengthnm")) {
    vals.push(rawVal * 1e-9, rawVal * 1e-3);
  } else if (kNorm === "molarmasskgpermol") {
    vals.push(rawVal * 1e3);
  } else if (kNorm.endsWith("masskg")) {
    vals.push(rawVal * 1e3);
  }

  return vals;
}

function recordScalarRepresentations(
  value: number,
  tokens: Set<string>,
  substrings: Set<string>,
  includeZero: boolean,
): void {
  if (!Number.isFinite(value)) return;
  const mag = Math.abs(value);
  if (mag < 1e-11) {
    if (includeZero) tokens.add("0");
    return;
  }

  const addToken = (tok: string) => {
    tokens.add(tok);
    const num = Number(tok);
    if (Number.isFinite(num) && num !== 0) {
      tokens.add(String(num));
    }
  };

  const sig3 = formatSignificant(mag, 3);
  if (sig3.includes("×")) {
    substrings.add(sig3);
  } else {
    addToken(sig3);
  }

  if (mag >= 1e-4 && mag < 1e6) {
    const clean4 = formatCleanNumber(mag, 4);
    const num4 = Number(clean4);
    if (num4 > 0 && Math.abs(num4 - mag) <= 1e-4 * mag) {
      addToken(clean4);
    }
    const clean2 = formatCleanNumber(mag, 2);
    const num2 = Number(clean2);
    if (num2 > 0 && Math.abs(num2 - mag) <= 1e-6 * mag) {
      addToken(clean2);
    }
  }

  const plain = String(mag);
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(plain)) {
    addToken(plain);
  }
}

export function createVisibilityController(
  spec: ThermalScenarioSpec,
  options: ThermalRenderOptions = {},
  quantities: Readonly<Record<string, number>> = {},
): VisibilityController {
  const mode = options.mode ?? "student-safe";
  const rawExplicitHidden =
    mode === "teacher-complete"
      ? [...(options.hiddenQuantities ?? [])]
      : [
          ...(spec.hiddenQuantities ?? []),
          ...(options.hiddenQuantities ?? []),
        ];

  const aliasCache = new Map<string, readonly string[]>();
  const getExpanded = (alias: string): readonly string[] => {
    let cached = aliasCache.get(alias);
    if (cached === undefined) {
      cached = expandAliases(alias, spec);
      aliasCache.set(alias, cached);
    }
    return cached;
  };

  let hideAllWildcard = false;
  const explicitHiddenSet = new Set<string>();
  for (const item of rawExplicitHidden) {
    const norm = normalizeToken(item);
    if (norm === "all" || item.trim() === "*") {
      hideAllWildcard = true;
    }
    for (const expanded of getExpanded(item)) {
      explicitHiddenSet.add(expanded);
    }
  }

  const hasAllowlist =
    mode === "student-safe" &&
    (spec.visibleQuantities !== undefined ||
      options.visibleQuantities !== undefined);
  const visibleSet = new Set<string>();
  for (const item of [
    ...(spec.visibleQuantities ?? []),
    ...(options.visibleQuantities ?? []),
  ]) {
    for (const expanded of getExpanded(item)) {
      visibleSet.add(expanded);
    }
  }

  const matchesSet = (targetSet: ReadonlySet<string>, aliases: string[]) =>
    aliases.some((alias) =>
      getExpanded(alias).some((key) => targetSet.has(key)),
    );

  const isExplicitlyHidden = (...aliases: string[]): boolean => {
    if (hideAllWildcard) return true;
    return matchesSet(explicitHiddenSet, aliases);
  };

  const isHidden = (...aliases: string[]): boolean => {
    if (isExplicitlyHidden(...aliases)) return true;
    if (mode === "teacher-complete") return false;
    if (hasAllowlist && !matchesSet(visibleSet, aliases)) return true;
    return false;
  };

  const isExplicitlyVisible = (...aliases: string[]): boolean => {
    if (isExplicitlyHidden(...aliases)) return false;
    if (mode === "teacher-complete") return true;
    return hasAllowlist && matchesSet(visibleSet, aliases);
  };

  const explicitTokens = new Set<string>();
  const explicitSubstrings = new Set<string>();
  const hiddenMagnitudes: number[] = [];
  let zeroExplicitlyHidden = false;

  const allowlistedTokens = new Set<string>();
  const allowlistedSubstrings = new Set<string>();
  const nonAllowlistedTokens = new Set<string>();
  const nonAllowlistedSubstrings = new Set<string>();

  for (const [qKey, qVal] of Object.entries(quantities)) {
    if (!Number.isFinite(qVal)) continue;
    const companions = collectCompanionValues(qKey, qVal);

    if (isExplicitlyHidden(qKey)) {
      if (Math.abs(qVal) < 1e-11) {
        zeroExplicitlyHidden = true;
      } else {
        hiddenMagnitudes.push(Math.abs(qVal));
      }
      for (const compVal of companions) {
        if (Math.abs(compVal) < 1e-11) {
          zeroExplicitlyHidden = true;
        } else {
          hiddenMagnitudes.push(Math.abs(compVal));
        }
        recordScalarRepresentations(
          compVal,
          explicitTokens,
          explicitSubstrings,
          true,
        );
      }
    } else if (hasAllowlist) {
      if (matchesSet(visibleSet, [qKey])) {
        for (const compVal of companions) {
          recordScalarRepresentations(
            compVal,
            allowlistedTokens,
            allowlistedSubstrings,
            false,
          );
        }
      } else {
        for (const compVal of companions) {
          recordScalarRepresentations(
            compVal,
            nonAllowlistedTokens,
            nonAllowlistedSubstrings,
            false,
          );
        }
      }
    }
  }

  const forbiddenTokens = new Set<string>(explicitTokens);
  const forbiddenSubstrings = new Set<string>(explicitSubstrings);
  if (hasAllowlist) {
    for (const tok of nonAllowlistedTokens) {
      if (!allowlistedTokens.has(tok)) forbiddenTokens.add(tok);
    }
    for (const sub of nonAllowlistedSubstrings) {
      if (!allowlistedSubstrings.has(sub)) forbiddenSubstrings.add(sub);
    }
  }

  const leaksHiddenText = (text: string): boolean => {
    for (const sub of forbiddenSubstrings) {
      if (text.includes(sub)) return true;
    }
    if (forbiddenTokens.size > 0) {
      for (const rawTok of extractNumericTokens(text)) {
        if (forbiddenTokens.has(rawTok)) return true;
        const num = Number(rawTok);
        if (Number.isFinite(num)) {
          const normNum = Object.is(num, -0) ? "0" : String(num);
          if (forbiddenTokens.has(normNum)) return true;
        }
      }
    }
    return false;
  };

  const matchesHiddenValue = (value: number): boolean => {
    if (!Number.isFinite(value)) return false;
    const mag = Math.abs(value);
    if (mag < 1e-11) return zeroExplicitlyHidden;
    if (leaksHiddenText(formatSignificant(mag, 3))) return true;
    return hiddenMagnitudes.some(
      (hMag) => Math.abs(mag - hMag) <= 1e-6 * hMag,
    );
  };

  return {
    mode,
    isHidden,
    isExplicitlyHidden,
    isExplicitlyVisible,
    leaksHiddenText,
    matchesHiddenValue,
  };
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[ch] ?? ch;
  });
}

export function coord(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite SVG coordinate: ${String(value)}`);
  }
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function formatCleanNumber(value: number, maxDecimals = 4): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite numeric label: ${String(value)}`);
  }
  if (Math.abs(value) < 1e-12) return "0";
  const rounded = Number(value.toFixed(maxDecimals));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

const SUPERSCRIPT_MAP: Readonly<Record<string, string>> = {
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
  "9": "₉",
};

export function toSuperscript(exponent: number): string {
  return [...String(exponent)]
    .map((ch) => SUPERSCRIPT_MAP[ch] ?? ch)
    .join("");
}

export function toSubscript(value: number | string): string {
  return [...String(value)]
    .map((ch) => SUBSCRIPT_MAP[ch] ?? ch)
    .join("");
}

export function formatSignificant(value: number, sigFigs = 3): string {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot format non-finite number");
  }
  if (Math.abs(value) < 1e-15) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e-2 && abs < 1e4) {
    return String(Number(value.toPrecision(sigFigs)));
  }
  const raw = value.toPrecision(sigFigs);
  const expMatch = /^([+-]?[\d.]+)e([+-]?\d+)$/i.exec(raw);
  if (!expMatch) return String(Number(raw));
  const mantissa = String(Number(expMatch[1]));
  const exp = Number(expMatch[2]);
  if (exp === 0) return mantissa;
  return `${mantissa} × 10${toSuperscript(exp)}`;
}

/**
 * Choose a student-friendly unit prefix / power-of-ten scale so axis tick
 * labels stay compact (between ~0.1 and ~1000).
 */
export function selectQuantityScale(
  maxMagnitude: number,
  quantity: "pressure" | "volume" | "energy" | "wavelength" | "plain",
): ScaledUnitSpec {
  const m = Math.abs(maxMagnitude);
  switch (quantity) {
    case "pressure": {
      if (m >= 8e4 && m < 1e7) {
        return { scaleFactor: 1e-5, unitLabel: "10⁵ Pa" };
      }
      if (m >= 1e3 && m < 8e4) {
        return { scaleFactor: 1e-3, unitLabel: "kPa" };
      }
      if (m >= 1e7) {
        return { scaleFactor: 1e-6, unitLabel: "MPa" };
      }
      return { scaleFactor: 1, unitLabel: "Pa" };
    }
    case "volume": {
      if (m >= 1e-4 && m < 0.2) {
        return { scaleFactor: 1e3, unitLabel: "10⁻³ m³" };
      }
      if (m > 0 && m < 1e-4) {
        return { scaleFactor: 1e6, unitLabel: "10⁻⁶ m³" };
      }
      return { scaleFactor: 1, unitLabel: "m³" };
    }
    case "energy": {
      if (m >= 1e6) {
        return { scaleFactor: 1e-6, unitLabel: "MJ" };
      }
      if (m >= 1e3) {
        return { scaleFactor: 1e-3, unitLabel: "kJ" };
      }
      return { scaleFactor: 1, unitLabel: "J" };
    }
    case "wavelength": {
      if (m > 0 && m < 3e-6) {
        return { scaleFactor: 1e9, unitLabel: "nm" };
      }
      if (m >= 3e-6 && m < 3e-3) {
        return { scaleFactor: 1e6, unitLabel: "μm" };
      }
      if (m >= 3e-3 && m < 1) {
        return { scaleFactor: 1e3, unitLabel: "mm" };
      }
      return { scaleFactor: 1, unitLabel: "m" };
    }
    case "plain":
      return { scaleFactor: 1, unitLabel: "" };
  }
}

/**
 * Compute clean publication-grade major ticks and half-step minor grid ticks
 * covering [rawMin, rawMax].
 */
export function computeHalfStepAxisTicks(
  rawMin: number,
  rawMax: number,
  anchorZero = true,
): AxisTickLayout {
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) {
    throw new Error("Axis bounds must be finite");
  }
  const low = anchorZero && rawMin >= 0 ? 0 : rawMin;
  let high = rawMax;
  if (high <= low) {
    high = low + 1;
  }

  const span = high - low;
  const paddedHigh = high + span * 0.08;
  const paddedLow = anchorZero && rawMin >= 0 ? 0 : low - span * 0.06;
  const targetSpan = paddedHigh - paddedLow;

  const roughStep = targetSpan / 5.5;
  const exp = Math.floor(Math.log10(roughStep));
  const base = 10 ** exp;
  const candidates = [1, 2, 2.5, 5, 10].map((mult) => mult * base);
  const majorStep =
    candidates.find((step) => targetSpan / step <= 6.5) ?? 10 * base;
  const minorStep = majorStep / 2;

  const domainMin = Number(
    (Math.floor(paddedLow / majorStep + 1e-9) * majorStep).toPrecision(12),
  );
  const domainMax = Number(
    (Math.ceil(paddedHigh / majorStep - 1e-9) * majorStep).toPrecision(12),
  );

  const majorCount = Math.round((domainMax - domainMin) / majorStep);
  const majorTicks = Array.from({ length: majorCount + 1 }, (_, i) =>
    Number((domainMin + i * majorStep).toPrecision(12)),
  );

  const minorCount = Math.round((domainMax - domainMin) / minorStep);
  const minorTicks = Array.from({ length: minorCount + 1 }, (_, i) =>
    Number((domainMin + i * minorStep).toPrecision(12)),
  );

  return {
    domain: [domainMin, domainMax],
    majorTicks,
    minorTicks,
    majorStep,
    minorStep,
  };
}
