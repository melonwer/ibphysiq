import { QuantumNuclearBaseSpec } from "./types";

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
  "9": "₉",
};

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

export interface VisibilityGuard {
  readonly canShowInput: (keys: string | readonly string[]) => boolean;
  readonly canShowDerived: (keys: string | readonly string[]) => boolean;
  readonly isExplicitlyHidden: (keys: string | readonly string[]) => boolean;
  readonly placeholder: (key: string, fallback: string) => string;
}

function normalizeList(keys: string | readonly string[]): readonly string[] {
  return typeof keys === "string" ? [keys] : keys;
}

export function createVisibilityGuard(
  spec: QuantumNuclearBaseSpec,
): VisibilityGuard {
  const hidden = new Set(spec.hiddenQuantities ?? []);
  const given = new Set(spec.givenQuantities ?? []);
  const mode = spec.visibilityMode ?? "hide-listed";
  const globalHidden = hidden.has("*") || hidden.has("all");

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
    isExplicitlyHidden,
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
      return spec.placeholders?.[key] ?? fallback;
    },
  };
}
