import {
  computeShingleSet,
  computeStemFingerprint,
} from "@/lib/bank-pipeline/numeric-checker";
import {
  DiversityMetrics,
  ItemRolloutEvaluation,
  StratifiedMetricsBucket,
  WilsonConfidenceInterval,
} from "@/lib/benchmark/types";

function jaccardSimilarity(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  let intersection = 0;
  for (const item of smaller) {
    if (larger.has(item)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

const Z_95 = 1.959963984540054;

function round6(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Number(val.toFixed(6));
}

/**
 * Computes the exact two-sided 95% Wilson score confidence interval for a binomial proportion.
 */
export function computeWilsonConfidenceInterval(
  successes: number,
  total: number,
): WilsonConfidenceInterval {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error(`Invalid total=${String(total)}; expected non-negative integer`);
  }
  if (!Number.isInteger(successes) || successes < 0 || successes > total) {
    throw new Error(
      `Invalid successes=${String(successes)} for total=${String(total)}`,
    );
  }
  if (total === 0) {
    return {
      successes: 0,
      total: 0,
      rate: 0,
      lower95: 0,
      upper95: 0,
      confidenceLevel: 0.95,
    };
  }

  const pHat = successes / total;
  const z2 = Z_95 * Z_95;
  const denom = 1 + z2 / total;
  const center = (pHat + z2 / (2 * total)) / denom;
  const varianceTerm = (pHat * (1 - pHat) + z2 / (4 * total)) / total;
  const halfWidth = (Z_95 * Math.sqrt(Math.max(0, varianceTerm))) / denom;

  const lower = successes === 0 ? 0 : Math.max(0, Math.min(1, center - halfWidth));
  const upper =
    successes === total ? 1 : Math.max(0, Math.min(1, center + halfWidth));

  return {
    successes,
    total,
    rate: round6(pHat),
    lower95: round6(lower),
    upper95: round6(upper),
    confidenceLevel: 0.95,
  };
}

export function formatWilsonPercent(
  ci: WilsonConfidenceInterval,
  decimals = 1,
): string {
  const pct = (x: number) => `${(x * 100).toFixed(decimals)}%`;
  return `${pct(ci.rate)} [${pct(ci.lower95)}, ${pct(ci.upper95)}] (${ci.successes}/${ci.total})`;
}

export function summarizeStratifiedBucket(
  stratum: string,
  items: readonly ItemRolloutEvaluation[],
): StratifiedMetricsBucket {
  const n = items.length;
  let s1Json = 0;
  let s1Pass = 0;
  let s2Json = 0;
  let s2Gate = 0;
  let sylPass = 0;
  let e2e = 0;
  let s2GivenS1 = 0;

  for (const item of items) {
    if (item.step1JsonValid) s1Json += 1;
    if (item.step1SolverPass) s1Pass += 1;
    if (item.step2JsonValid) s2Json += 1;
    if (item.step2AuthorGatePass) s2Gate += 1;
    if (item.syllabusAligned) sylPass += 1;
    if (item.endToEndVerified) e2e += 1;
    if (item.step1SolverPass && item.step2AuthorGatePass) s2GivenS1 += 1;
  }

  return {
    stratum,
    count: n,
    step1JsonValid: computeWilsonConfidenceInterval(s1Json, n),
    step1SolverPass: computeWilsonConfidenceInterval(s1Pass, n),
    step2JsonValid: computeWilsonConfidenceInterval(s2Json, n),
    step2AuthorGatePass: computeWilsonConfidenceInterval(s2Gate, n),
    syllabusAlignment: computeWilsonConfidenceInterval(sylPass, n),
    endToEndVerified: computeWilsonConfidenceInterval(e2e, n),
    conditionalStep2PassGivenStep1: computeWilsonConfidenceInterval(
      s2GivenS1,
      s1Pass,
    ),
  };
}

export interface ComputeDiversityOptions {
  nearDuplicateThreshold?: number;
  maxPairwiseSampleSize?: number;
}

export function computeDiversityMetrics(
  items: readonly ItemRolloutEvaluation[],
  options: ComputeDiversityOptions = {},
): DiversityMetrics {
  const nearDuplicateThreshold = options.nearDuplicateThreshold ?? 0.9;
  const maxSample = options.maxPairwiseSampleSize ?? 400;

  const nonEmptyStems: Array<{
    exactKey: string;
    fingerprint: string;
    shingles: Set<string>;
  }> = [];
  const paramSignatures = new Set<string>();
  let paramEligibleCount = 0;

  for (const item of items) {
    if (item.parameterSignature) {
      paramEligibleCount += 1;
      paramSignatures.add(item.parameterSignature);
    }
    const stem = item.stemText?.trim() ?? "";
    if (!stem) continue;
    const exactKey = stem.toLowerCase().replace(/\s+/g, " ");
    const fingerprint = item.stemFingerprint ?? computeStemFingerprint(stem);
    nonEmptyStems.push({
      exactKey,
      fingerprint,
      shingles: computeShingleSet(stem, 3),
    });
  }

  const nonEmptyCount = nonEmptyStems.length;
  const uniqueExactStemCount = new Set(nonEmptyStems.map((s) => s.exactKey)).size;
  const uniqueStemFingerprintCount = new Set(
    nonEmptyStems.map((s) => s.fingerprint),
  ).size;

  // Deterministic stride sample for O(K^2) 3-gram Jaccard pairwise diversity
  let sampled = nonEmptyStems;
  if (nonEmptyStems.length > maxSample && maxSample > 1) {
    sampled = [];
    const step = nonEmptyStems.length / maxSample;
    for (let i = 0; i < maxSample; i += 1) {
      sampled.push(nonEmptyStems[Math.floor(i * step)]);
    }
  }

  let totalPairs = 0;
  let nearDupPairs = 0;
  let sumDistance = 0;

  for (let i = 0; i < sampled.length; i += 1) {
    for (let j = i + 1; j < sampled.length; j += 1) {
      totalPairs += 1;
      if (sampled[i].fingerprint === sampled[j].fingerprint) {
        nearDupPairs += 1;
        continue;
      }
      const sim = jaccardSimilarity(sampled[i].shingles, sampled[j].shingles);
      if (sim >= nearDuplicateThreshold) {
        nearDupPairs += 1;
      }
      sumDistance += 1 - sim;
    }
  }

  return {
    evaluatedCount: items.length,
    nonEmptyStemCount: nonEmptyCount,
    uniqueExactStemCount,
    uniqueStemFingerprintCount,
    uniqueFingerprintRatio:
      nonEmptyCount > 0 ? round6(uniqueStemFingerprintCount / nonEmptyCount) : 0,
    nearDuplicatePairRate:
      totalPairs > 0 ? round6(nearDupPairs / totalPairs) : 0,
    meanPairwise3GramJaccardDistance:
      totalPairs > 0 ? round6(sumDistance / totalPairs) : 0,
    uniqueParameterSignatureCount: paramSignatures.size,
    uniqueParameterSignatureRatio:
      paramEligibleCount > 0
        ? round6(paramSignatures.size / paramEligibleCount)
        : 0,
  };
}
