import crypto from "node:crypto";

export interface ExtractedNumericMention {
  rawText: string;
  rawValue: number;
  unitToken?: string;
  siBaseValue?: number;
  alternateConvertedValues: number[];
}

export interface SigFigToleranceOptions {
  significantFigures?: number;
  relativeTolerance?: number;
  absoluteZeroTolerance?: number;
}

const SUPERSCRIPT_CHAR_MAP: Record<string, string> = {
  "⁺": "+",
  "⁻": "-",
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
};

const SI_PREFIX_FACTORS: Record<string, number> = {
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  μ: 1e-6,
  u: 1e-6,
  m: 1e-3,
  c: 1e-2,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

const UNAMBIGUOUS_BASE_UNITS = new Set([
  "m",
  "s",
  "A",
  "V",
  "W",
  "J",
  "N",
  "C",
  "F",
  "H",
  "T",
  "Ω",
  "Ohm",
  "ohm",
  "Hz",
  "Pa",
  "Wb",
  "Bq",
  "eV",
  "mol",
  "L",
]);

function decodeSuperscriptDigits(text: string): string {
  return [...text].map((ch) => SUPERSCRIPT_CHAR_MAP[ch] ?? ch).join("");
}

/**
 * Normalizes scientific notation (Unicode superscripts, LaTeX \times 10^{...})
 * into standard `e` notation while stripping unit exponents (`s⁻¹`, `m²`, `s^{-2}`)
 * so unit exponents are never misread as standalone numbers.
 */
export function normalizePhysicsNumericText(input: string): string {
  let text = input
    .replace(/\\mu\b/g, "μ")
    .replace(/\\Omega\b/g, "Ω")
    .replace(/[\u2212\u2013]/g, "-");

  // 1. Convert explicit scientific notation `a × 10^b` / `a \times 10^{b}` / `a × 10⁻⁹` -> `ae-9`
  text = text.replace(
    /([+-]?\d+(?:\.\d+)?)\s*(?:×|\\times|⋅|\\cdot|\bx\b)\s*10(?:\^\{\s*([+-]?\d+)\s*\}|\^([+-]?\d+)|([⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+))/g,
    (_match, mantissa: string, bracedExp?: string, caretExp?: string, supExp?: string) => {
      const expRaw = bracedExp ?? caretExp ?? (supExp ? decodeSuperscriptDigits(supExp) : "0");
      return `${mantissa}e${expRaw}`;
    },
  );

  // 2. Convert standalone `10^b` / `10⁻⁹` (not preceded by digit) -> `1e-9`
  text = text.replace(
    /(?<![\d.])10(?:\^\{\s*([+-]?\d+)\s*\}|\^([+-]?\d+)|([⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+))/g,
    (_match, bracedExp?: string, caretExp?: string, supExp?: string) => {
      const expRaw = bracedExp ?? caretExp ?? (supExp ? decodeSuperscriptDigits(supExp) : "0");
      return `1e${expRaw}`;
    },
  );

  // 3. Strip LaTeX/ASCII/Unicode exponents attached to alphabetic unit symbols (e.g. s⁻¹ -> s, m^{-2} -> m)
  text = text.replace(
    /([A-Za-zΩμ]+)(?:\^\{\s*[+-]?\d+(?:\/\d+)?\s*\}|\^[+-]?\d+|[⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g,
    "$1",
  );

  // 4. Strip variable subscripts like R_1, q_2, V_{out}, t_{1/2} so subscript indices do not pollute extraction
  text = text.replace(/\b([A-Za-z])_(?:\{[^}]+\}|\d+)\b/g, "$1");

  return text;
}

function resolveUnitConversions(
  rawValue: number,
  unitToken: string | undefined,
): { siBaseValue?: number; alternateConvertedValues: number[] } {
  if (!unitToken) {
    return { alternateConvertedValues: [] };
  }
  const alternates: number[] = [];

  // Grams -> kg (note: kg is already base SI mass!)
  if (unitToken === "g") {
    const kg = rawValue * 1e-3;
    return { siBaseValue: kg, alternateConvertedValues: [kg] };
  }
  if (unitToken === "mg") {
    const kg = rawValue * 1e-6;
    return { siBaseValue: kg, alternateConvertedValues: [kg] };
  }
  if (unitToken === "min") {
    alternates.push(rawValue * 60);
    return { siBaseValue: rawValue * 60, alternateConvertedValues: alternates };
  }
  if (unitToken === "h" || unitToken === "hr") {
    alternates.push(rawValue * 3600);
    return {
      siBaseValue: rawValue * 3600,
      alternateConvertedValues: alternates,
    };
  }
  if (unitToken === "eV") {
    const joules = rawValue * 1.602176634e-19;
    const joulesIb = rawValue * 1.6e-19;
    return {
      siBaseValue: joules,
      alternateConvertedValues: [joules, joulesIb],
    };
  }

  // Check single-character SI prefix + unambiguous base unit (e.g., kΩ, mA, nC, mm, cm, km, MHz)
  if (unitToken.length >= 2 && unitToken !== "kg" && unitToken !== "mol") {
    const prefix = unitToken[0];
    const base = unitToken.slice(1);
    const factor = SI_PREFIX_FACTORS[prefix];
    if (factor !== undefined && UNAMBIGUOUS_BASE_UNITS.has(base)) {
      const scaled = rawValue * factor;
      alternates.push(scaled);
      if (base === "eV") {
        alternates.push(scaled * 1.602176634e-19, scaled * 1.6e-19);
      }
      return { siBaseValue: scaled, alternateConvertedValues: alternates };
    }
  }

  return { alternateConvertedValues: alternates };
}

/**
 * Extracts all numeric quantities (including scientific notation and SI-prefixed
 * units) from student or mark-scheme physics prose.
 */
export function extractNumbersFromPhysicsText(
  text: string,
): ExtractedNumericMention[] {
  const normalized = normalizePhysicsNumericText(text);
  const pattern =
    /(?<![A-Za-z0-9_])([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(?:\s*(°C|[A-Za-zΩμ]+))?/g;

  const results: ExtractedNumericMention[] = [];
  let match: RegExpExecArray | null = pattern.exec(normalized);
  while (match !== null) {
    const rawNumberStr = match[1];
    const unitToken = match[2];
    const rawValue = Number(rawNumberStr);
    if (Number.isFinite(rawValue)) {
      const conversions = resolveUnitConversions(rawValue, unitToken);
      const alternates = [...conversions.alternateConvertedValues];
      if (unitToken === "°C") {
        alternates.push(rawValue + 273.15, rawValue + 273);
      }
      results.push({
        rawText: match[0].trim(),
        rawValue,
        unitToken,
        siBaseValue: conversions.siBaseValue,
        alternateConvertedValues: alternates,
      });
    }
    match = pattern.exec(normalized);
  }
  return results;
}

export function formatSignificantFigures(
  value: number,
  significantFigures = 3,
): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot format non-finite value: ${String(value)}`);
  }
  if (!Number.isInteger(significantFigures) || significantFigures < 1) {
    throw new Error("significantFigures must be a positive integer");
  }
  if (Object.is(value, -0) || value === 0) {
    return "0";
  }
  return value.toPrecision(significantFigures).replace("e+", "e");
}

/**
 * Checks whether `actual` agrees with solver ground-truth `expected` within
 * explicit significant-figure / relative tolerance.
 */
export function numbersAgreeWithinTolerance(
  actual: number,
  expected: number,
  options: SigFigToleranceOptions = {},
): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return false;
  }
  const sigFigs = options.significantFigures ?? 3;
  const relTol = options.relativeTolerance ?? 0.01;
  const zeroTol = options.absoluteZeroTolerance ?? 1e-9;

  if (Math.abs(expected) <= zeroTol) {
    return Math.abs(actual) <= zeroTol;
  }

  const relDiff = Math.abs(actual - expected) / Math.abs(expected);
  if (relDiff <= relTol) {
    return true;
  }

  const roundedExpected = Number(expected.toPrecision(sigFigs));
  if (
    Math.abs(actual - roundedExpected) / Math.max(Math.abs(roundedExpected), zeroTol) <=
    1e-9
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if `text` contains a numeric mention matching `targetValue` (either directly
 * or after standard SI unit prefix conversion, e.g. `5 kΩ` matching `5000`).
 */
export function textContainsNumericValue(
  text: string,
  targetValue: number,
  options: SigFigToleranceOptions & { allowMagnitudeMatch?: boolean } = {},
): boolean {
  const mentions = extractNumbersFromPhysicsText(text);
  for (const mention of mentions) {
    const candidates = [
      mention.rawValue,
      ...(mention.siBaseValue !== undefined ? [mention.siBaseValue] : []),
      ...mention.alternateConvertedValues,
    ];
    for (const candidate of candidates) {
      if (numbersAgreeWithinTolerance(candidate, targetValue, options)) {
        return true;
      }
      if (
        options.allowMagnitudeMatch &&
        numbersAgreeWithinTolerance(Math.abs(candidate), Math.abs(targetValue), options)
      ) {
        return true;
      }
    }
  }
  return false;
}

function canonicalNumberToken(value: number): string {
  if (Math.abs(value) < 1e-12) return "0";
  return Number(value.toPrecision(6)).toString();
}

export function normalizeStemForDeduplication(stem: string): string {
  const normalized = normalizePhysicsNumericText(stem).toLowerCase();
  const withCanonicalNums = normalized.replace(
    /(?<![a-z0-9_])([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(?:\s*([a-zΩμ]+))?/gi,
    (_full, numStr: string, unitStr?: string) => {
      const raw = Number(numStr);
      if (!Number.isFinite(raw)) return _full;
      const conv = resolveUnitConversions(raw, unitStr);
      const val = conv.siBaseValue ?? raw;
      const cleanUnit = unitStr ? ` ${unitStr.toLowerCase()}` : "";
      return `${canonicalNumberToken(val)}${cleanUnit}`;
    },
  );
  return withCanonicalNums
    .replace(/[^a-z0-9Ωμ.\-+]+/g, " ")
    .replace(/(?<!\d)[.]/g, " ")
    .replace(/[.](?!\d)/g, " ")
    .replace(/(?<=[a-zΩμ])[-+](?=[a-zΩμ])/g, " ")
    .replace(/[-+](?!\d)/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function computeStemFingerprint(stem: string): string {
  const canonical = normalizeStemForDeduplication(stem);
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function computeShingleSet(stem: string, ngramSize = 3): Set<string> {
  const canonical = normalizeStemForDeduplication(stem);
  const tokens = canonical.split(" ").filter(Boolean);
  if (tokens.length === 0) return new Set<string>();
  if (tokens.length < ngramSize) {
    return new Set<string>([tokens.join(" ")]);
  }
  const shingles = new Set<string>();
  for (let i = 0; i <= tokens.length - ngramSize; i += 1) {
    shingles.add(tokens.slice(i, i + ngramSize).join(" "));
  }
  return shingles;
}

export function computeStemSimilarity(stemA: string, stemB: string): number {
  const setA = computeShingleSet(stemA);
  const setB = computeShingleSet(stemB);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Normalizes an MCQ option into `(numericSignature, nonNumericQualifier)` so we can
 * detect duplicate numerical options like `"24 m"` vs `"24.0 m"` while preserving
 * legitimate directional/sign contrasts like `"674 N C⁻¹ to the right"` vs `"674 N C⁻¹ to the left"`.
 */
export function buildOptionEquivalenceKey(optionText: string): string {
  const trimmed = optionText.trim();
  const mentions = extractNumbersFromPhysicsText(trimmed);
  if (mentions.length === 0) {
    return `text:${trimmed.toLowerCase().replace(/\s+/g, " ")}`;
  }
  const normalized = normalizePhysicsNumericText(trimmed);
  const withoutNumbers = normalized
    .replace(
      /(?<![A-Za-z0-9_])[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g,
      "#",
    )
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const numericTuple = mentions
    .map((m) => {
      const val = m.siBaseValue ?? m.rawValue;
      return Number(val.toPrecision(3)).toString();
    })
    .join(",");
  return `num:${numericTuple}|qual:${withoutNumbers}`;
}
