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
  isExplicitlyVisible: (...aliases: string[]) => boolean;
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
function expandAliases(token: string): string[] {
  const norm = normalizeToken(token);
  const out = new Set<string>([norm]);

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
    out.add(`state${stateRef}${propFull}`);
    if (/^[a-z]$/.test(stateRef)) {
      const idx = stateRef.charCodeAt(0) - 97;
      if (idx >= 0 && idx < 26) {
        out.add(`state${idx}${propFull}`);
        out.add(`${propChar}${idx + 1}`);
      }
    } else {
      const num = Number(stateRef);
      if (Number.isInteger(num) && num >= 1 && num <= 26) {
        const letter = String.fromCharCode(96 + num);
        out.add(`state${letter}${propFull}`);
        out.add(`state${num - 1}${propFull}`);
        out.add(`${propChar}${letter}`);
      }
    }
  }

  const synonymGroups: ReadonlyArray<readonly string[]> = [
    ["networkj", "totalworkj", "wnet", "workj", "w"],
    ["heatinputj", "qin", "qinput"],
    ["heatrejectedj", "qout", "qrejected"],
    ["thermalefficiency", "efficiency", "eta"],
    ["carnotefficiency", "etacarnot"],
    ["hottemperaturek", "th", "thot"],
    ["coldtemperaturek", "tc", "tcold"],
    ["entropychangejk", "totalentropychangejk", "deltas", "entropy"],
    ["deltauj", "totaldeltauj", "deltau", "internalenergychange"],
    ["equilibriumtemperaturek", "equilibriumtemperaturec", "teq", "tfinal"],
    ["latentheatfusionjperkg", "lf", "latentheatfusion"],
    ["latentheatvaporizationjperkg", "lv", "latentheatvaporization"],
    ["meltingpointk", "meltingpointc", "tm", "tmelting"],
    ["boilingpointk", "boilingpointc", "tb", "tboiling"],
    ["rmsspeedms", "vrms", "crms"],
    ["mostprobablespeedms", "vp", "vmp"],
    ["meanspeedms", "vmean", "vbar", "averagespeedms"],
    ["averagekineticenergyj", "averagekineticenergyev", "ekavg", "ek", "ke"],
    ["peakwavelengthm", "peakwavelengthnm", "lambdamax", "wienwavelength"],
    ["radiatedpowerw", "powerw", "power", "luminosityw"],
    ["radiatedintensitywm2", "intensitywm2", "intensityatdistancewm2"],
    ["totalenergyj", "energyj", "qtotal", "heatj"],
    ["totaldurations", "durations", "times", "time"],
  ];

  for (const group of synonymGroups) {
    if (group.includes(norm)) {
      for (const item of group) out.add(item);
    }
  }

  return [...out];
}

export function createVisibilityController(
  spec: ThermalScenarioSpec,
  options: ThermalRenderOptions = {},
): VisibilityController {
  const mode = options.mode ?? "student-safe";
  const hiddenSet = new Set<string>();
  for (const item of spec.hiddenQuantities ?? []) {
    for (const expanded of expandAliases(item)) {
      hiddenSet.add(expanded);
    }
  }

  const hasAllowlist = spec.visibleQuantities !== undefined;
  const visibleSet = new Set<string>();
  for (const item of spec.visibleQuantities ?? []) {
    for (const expanded of expandAliases(item)) {
      visibleSet.add(expanded);
    }
  }

  const matchesSet = (targetSet: ReadonlySet<string>, aliases: string[]) =>
    aliases.some((alias) =>
      expandAliases(alias).some((key) => targetSet.has(key)),
    );

  return {
    mode,
    isHidden: (...aliases: string[]): boolean => {
      if (mode === "teacher-complete") return false;
      if (matchesSet(hiddenSet, aliases)) return true;
      if (hasAllowlist && !matchesSet(visibleSet, aliases)) return true;
      return false;
    },
    isExplicitlyVisible: (...aliases: string[]): boolean => {
      if (mode === "teacher-complete") return true;
      if (matchesSet(hiddenSet, aliases)) return false;
      return hasAllowlist && matchesSet(visibleSet, aliases);
    },
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

export function toSuperscript(exponent: number): string {
  return [...String(exponent)]
    .map((ch) => SUPERSCRIPT_MAP[ch] ?? ch)
    .join("");
}

export function formatSignificant(value: number, sigFigs = 3): string {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot format non-finite number");
  }
  if (value === 0) return "0";
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
