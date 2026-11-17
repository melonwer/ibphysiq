import {
  getCompatibleSyllabiForConcept,
  SyllabusLevel,
} from "@/lib/constants/syllabi";

import { getDomainAdapter } from "../domain-registry";
import {
  buildOptionEquivalenceKey,
  computeStemFingerprint,
} from "../numeric-checker";
import { ExistingStemEntry, verifyCandidateWithGate } from "../package-gate";
import {
  CandidateQuestionInput,
  CandidateQuestionPlan,
  MarkSchemePoint,
  MCQ_OPTION_LABELS,
  McqOptionItem,
  QuestionDifficulty,
  QuestionFormat,
  RequiredGivenSpec,
  StructuredQuestionPart,
  SyllabusTag,
} from "../types";

export const PURE_CALCULATION_ARCHETYPE_IDS = [
  "si-cubed-prefix-bulk-density",
  "dimensional-homogeneity-tension-wave-speed",
  "power-quotient-fractional-uncertainty",
  "sum-difference-extension-stiffness-uncertainty",
  "angled-tow-vector-resolution-kinematics",
  "oblique-haulage-vector-power-efficiency",
  "rectilinear-suvat-kmh-braking-acceleration",
  "vertical-freefall-projection-gravity",
  "rebound-impact-impulse-average-force",
  "tractive-power-fv-drivetrain-efficiency",
  "gravitational-hoist-pump-efficiency",
  "hydrostatic-depth-pressure-uncertainty",
  "wire-tensile-stress-strain-young-modulus",
  "cylindrical-wire-diameter-stress-uncertainty",
  "ohmic-wire-resistivity-power-uncertainty",
  "immersion-calorimetry-thermal-efficiency",
] as const;

export type PureCalculationArchetypeId =
  (typeof PURE_CALCULATION_ARCHETYPE_IDS)[number];

export interface GeneratePureCalculationOptions {
  readonly baseSeed?: number;
  readonly totalCount?: number;
  readonly mcqRatio?: number;
  readonly idPrefix?: string;
  readonly generatorModel?: string;
  readonly archetypes?: readonly PureCalculationArchetypeId[];
}

interface MisconceptionCandidate {
  readonly value: number;
  readonly rationale: string;
}

interface ArchetypeBuildArgs {
  readonly id: string;
  readonly seed: number;
  readonly variantIndex: number;
  readonly format: QuestionFormat;
  readonly difficulty: QuestionDifficulty;
  readonly generatorModel: string;
}

interface ArchetypeDefinition {
  readonly conceptId: string;
  readonly templateArchetype: PureCalculationArchetypeId;
  buildCandidate(args: ArchetypeBuildArgs): CandidateQuestionInput;
}

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  "-": "⁻",
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

function toSuperscriptInt(exp: number): string {
  return [...String(exp)].map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch).join("");
}

/**
 * Formats a finite scalar to 3 significant figures using exam-standard plain
 * decimal notation for moderate magnitudes and Unicode scientific notation
 * (`a.bc × 10ⁿ`) outside `[10⁻², 10³)`.
 */
export function formatPhysicsValue(value: number, unit?: string): string {
  if (Object.is(value, -0) || Math.abs(value) < 1e-15) {
    if (!unit) return "0";
    return unit === "%" ? "0%" : `0 ${unit}`;
  }
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const rounded = Number(abs.toPrecision(3));
  let numericStr: string;
  if (rounded >= 1e3 || rounded < 1e-2) {
    let exp = Math.floor(Math.log10(abs));
    let mant = abs / 10 ** exp;
    if (Number(mant.toPrecision(3)) >= 10) {
      exp += 1;
      mant /= 10;
    }
    numericStr = `${sign}${mant.toPrecision(3)} × 10${toSuperscriptInt(exp)}`;
  } else {
    numericStr = `${sign}${abs.toPrecision(3)}`;
  }
  if (!unit) {
    return numericStr;
  }
  if (unit === "%") {
    return `${numericStr}%`;
  }
  return `${numericStr} ${unit}`;
}

function seededPrng(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(arr: readonly T[], index: number): T {
  return arr[((index % arr.length) + arr.length) % arr.length];
}

function solvePureCalc(
  scenarioSpec: Record<string, unknown>,
): Record<string, number> {
  const adapter = getDomainAdapter("pure-calculation");
  const out = adapter.solveScenario(scenarioSpec);
  const numeric: Record<string, number> = {};
  for (const [k, v] of Object.entries(out.quantities)) {
    if (typeof v === "number") {
      numeric[k] = v;
    }
  }
  return numeric;
}

type SyllabusTagMode = "all-three" | "ib-only" | "alevel-ncuk-only";

function resolveSyllabusTags(
  conceptId: string,
  format: QuestionFormat,
  variantIndex: number,
  mode: SyllabusTagMode,
): SyllabusTag[] {
  const tags: SyllabusTag[] = [];
  const ibLevel: SyllabusLevel = variantIndex % 2 === 0 ? "SL" : "HL";
  const alevelPreferred: SyllabusLevel = variantIndex % 2 === 0 ? "Y12" : "Y13";

  if (mode === "all-three" || mode === "ib-only") {
    const ibMatches = getCompatibleSyllabiForConcept(conceptId, {
      level: ibLevel,
      format,
      excludeOptionTopics: true,
    }).filter((m) => m.syllabus === "ib");
    const chosenIb =
      ibMatches.length > 0
        ? ibMatches[0]
        : getCompatibleSyllabiForConcept(conceptId, {
            level: "HL",
            format,
            excludeOptionTopics: true,
          }).find((m) => m.syllabus === "ib");
    if (chosenIb && chosenIb.topicIds[0]) {
      tags.push({
        syllabus: "ib",
        level: chosenIb.levels[0] ?? ibLevel,
        topicId: chosenIb.topicIds[0],
        subtopicId: chosenIb.subtopicIds[0],
      });
    }
  }

  if (mode === "all-three" || mode === "alevel-ncuk-only") {
    const alPreferred = getCompatibleSyllabiForConcept(conceptId, {
      level: alevelPreferred,
      format,
      excludeOptionTopics: true,
    }).find((m) => m.syllabus === "alevel");
    const alFallback =
      alPreferred ??
      getCompatibleSyllabiForConcept(conceptId, {
        level: "Y13",
        format,
        excludeOptionTopics: true,
      }).find((m) => m.syllabus === "alevel");
    if (alFallback && alFallback.topicIds[0]) {
      tags.push({
        syllabus: "alevel",
        level: alFallback.levels[0] ?? "Y13",
        topicId: alFallback.topicIds[0],
        subtopicId: alFallback.subtopicIds[0],
      });
    }

    const ncukMatch = getCompatibleSyllabiForConcept(conceptId, {
      level: "IFY",
      format,
      excludeOptionTopics: true,
    }).find((m) => m.syllabus === "ncuk");
    if (ncukMatch && ncukMatch.topicIds[0]) {
      tags.push({
        syllabus: "ncuk",
        level: "IFY",
        topicId: ncukMatch.topicIds[0],
        subtopicId: ncukMatch.subtopicIds[0],
      });
    }
  }

  return tags;
}

function valuesDistinct3sf(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a) < 1e-12 && Math.abs(b) < 1e-12) return false;
  const maxMag = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  if (Math.abs(a - b) / maxMag < 0.035) {
    return false;
  }
  return a.toPrecision(3) !== b.toPrecision(3);
}

function buildMcqOptions(
  correctValue: number,
  unit: string | undefined,
  distractors: readonly MisconceptionCandidate[],
  seed: number,
): McqOptionItem[] {
  const correctText = formatPhysicsValue(correctValue, unit);
  const usedKeys = new Set<string>([buildOptionEquivalenceKey(correctText)]);
  const usedValues: number[] = [correctValue];
  const selectedDistractors: Array<{ text: string; rationale: string }> = [];

  const fallbacks: MisconceptionCandidate[] = [
    {
      value: correctValue * 0.5,
      rationale:
        "Introduces an extraneous factor of one-half during algebraic rearrangement.",
    },
    {
      value: correctValue * 2.0,
      rationale:
        "Doubles the quantity through an algebraic factor-of-two slip.",
    },
    {
      value: correctValue * 0.25,
      rationale:
        "Divides by four through a squared scaling slip during substitution.",
    },
    {
      value: correctValue * 10,
      rationale:
        "Makes a single-decade power-of-ten slip when converting SI prefixes.",
    },
  ];

  for (const cand of [...distractors, ...fallbacks]) {
    if (selectedDistractors.length >= 3) break;
    if (!Number.isFinite(cand.value)) continue;
    if (Math.abs(correctValue) > 1e-12 && Math.abs(cand.value) < 1e-12) {
      continue;
    }
    if (!usedValues.every((prev) => valuesDistinct3sf(cand.value, prev))) {
      continue;
    }
    const text = formatPhysicsValue(cand.value, unit);
    const key = buildOptionEquivalenceKey(text);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    usedValues.push(cand.value);
    selectedDistractors.push({ text, rationale: cand.rationale });
  }

  const correctSlot = ((seed % 4) + 4) % 4;
  const items: McqOptionItem[] = [];
  let dIdx = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === correctSlot) {
      items.push({
        label: MCQ_OPTION_LABELS[i],
        text: correctText,
        isCorrect: true,
      });
    } else {
      const d = selectedDistractors[dIdx];
      dIdx += 1;
      items.push({
        label: MCQ_OPTION_LABELS[i],
        text: d.text,
        isCorrect: false,
        distractorRationale: d.rationale,
      });
    }
  }
  return items;
}

function makeMcqPlan(
  conceptPhrase: string,
  misconceptionStrategies: readonly [string, string, string],
  assumptions: readonly string[],
): CandidateQuestionPlan {
  return {
    targetSummary: `Evaluate ${conceptPhrase} via deterministic algebraic formulation prior to numerical substitution.`,
    distractorStrategy: [...misconceptionStrategies],
    assumptions: [...assumptions],
  };
}

function makeStructuredPlan(
  conceptPhrase: string,
  subpartStrategies: readonly string[],
  assumptions: readonly string[],
): CandidateQuestionPlan {
  return {
    targetSummary: `Author a multi-step structured problem on ${conceptPhrase} linking intermediate quantities to propagated uncertainty or energy balance.`,
    subpartStrategy: [...subpartStrategies],
    assumptions: [...assumptions],
  };
}

// ============================================================================
// ARCHETYPE 1: SI Base Units & Cubed Prefix Bulk Density
// ============================================================================
const ARCHETYPE_SI_DENSITY: ArchetypeDefinition = {
  conceptId: "si-units-dimensional-analysis",
  templateArchetype: "si-cubed-prefix-bulk-density",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const rand = seededPrng(seed);
    const edgeCmChoices = [2.4, 2.5, 3.0, 3.2, 4.0, 4.5, 5.0, 6.0, 7.5, 8.0];
    const dEdgeCmChoices = [0.03, 0.04, 0.05, 0.06, 0.08];
    const densityGcm3Choices = [1.8, 2.2, 2.7, 3.2, 4.5, 5.4, 7.2, 7.8, 8.4, 8.9];
    const dmGChoices = [1.2, 1.5, 2.0, 2.5, 3.0, 4.0];

    const edgeCm = edgeCmChoices[(variantIndex + Math.floor(rand() * 3)) % edgeCmChoices.length];
    const dEdgeCm = dEdgeCmChoices[(variantIndex + Math.floor(rand() * 2)) % dEdgeCmChoices.length];
    const rhoNominal = densityGcm3Choices[(variantIndex * 3 + 1) % densityGcm3Choices.length];
    const massG = Number((rhoNominal * edgeCm ** 3).toPrecision(3));
    const dmG = dmGChoices[variantIndex % dmGChoices.length];

    const mKg = Number((massG * 1e-3).toPrecision(6));
    const dmKg = Number((dmG * 1e-3).toPrecision(6));
    const lM = Number((edgeCm * 1e-2).toPrecision(6));
    const dlM = Number((dEdgeCm * 1e-2).toPrecision(6));

    const scenarioSpec = {
      kind: "uncertainty-power-product",
      aValue: mKg,
      aAbsUnc: dmKg,
      aPower: 1,
      bValue: lM,
      bAbsUnc: dlM,
      bPower: -3,
    };
    const solved = solvePureCalc(scenarioSpec);
    const syllabi = resolveSyllabusTags(
      "si-units-dimensional-analysis",
      format,
      variantIndex,
      "all-three",
    );

    const contexts = [
      `In a materials metrology audit, a machined titanium-aluminide reference cube records a mass of ${massG} g ± ${dmG} g on a digital balance and an edge length of ${edgeCm} cm ± ${dEdgeCm} cm using vernier callipers.`,
      `During quality inspection of a syntactic-foam subsea buoyancy block, a technician measures the cubic specimen to have edge length ${edgeCm} cm ± ${dEdgeCm} cm and mass ${massG} g ± ${dmG} g.`,
      `A solid-state laboratory prepares a cubic silicon-carbide ceramic billet of measured mass ${massG} g ± ${dmG} g; micrometric gauging gives each side of the cube as ${edgeCm} cm ± ${dEdgeCm} cm.`,
      `For a radiation-shielding verification test, a cubic alloy sample is weighed at ${massG} g ± ${dmG} g while its side length is determined to be ${edgeCm} cm ± ${dEdgeCm} cm.`,
      `A geophysics technician machines a cubic basaltic core specimen whose mass is ${massG} g ± ${dmG} g and whose edge dimension measures ${edgeCm} cm ± ${dEdgeCm} cm.`,
      `Before thermal cycling, an aerospace ceramic insulator cube is logged with side length ${edgeCm} cm ± ${dEdgeCm} cm and mass ${massG} g ± ${dmG} g.`,
      `An undergraduate metrology bench characterizes a precision-ground metallic cube of mass ${massG} g ± ${dmG} g and side length ${edgeCm} cm ± ${dEdgeCm} cm.`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "massG", value: massG, unit: "g", source: "stem" },
      { name: "massUncG", value: dmG, unit: "g", source: "stem" },
      { name: "edgeCm", value: edgeCm, unit: "cm", source: "stem" },
      { name: "edgeUncCm", value: dEdgeCm, unit: "cm", source: "stem" },
    ];

    if (format === "mcq") {
      const targetCycle = variantIndex % 3;
      if (targetCycle === 0) {
        const rho = solved.resultValue;
        const stem = `${baseProse} What is the bulk density of the cube expressed in coherent SI base units (kg m⁻³)?`;
        const options = buildMcqOptions(
          rho,
          "kg m⁻³",
          [
            {
              value: rho * 1e-3,
              rationale:
                "Evaluates density in g cm⁻³ without applying the factor of 1000 needed to convert g cm⁻³ into kg m⁻³.",
            },
            {
              value: mKg / (edgeCm * 1e-2),
              rationale:
                "Divides mass in kilograms by a single edge length in metres instead of cubing the converted length.",
            },
            {
              value: mKg / (edgeCm ** 3 * 1e-2),
              rationale:
                "Applies the centimetre prefix 10⁻² once rather than cubing it to (10⁻²)³ = 10⁻⁶ when converting cm³ to m³.",
            },
            {
              value: mKg / lM ** 2,
              rationale:
                "Squares the side length instead of cubing it when computing cubic volume.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(rho, "kg m⁻³");
        return {
          id,
          conceptId: "si-units-dimensional-analysis",
          templateArchetype: "si-cubed-prefix-bulk-density",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "resultValue",
            "fractionalUncertainty",
            "percentageUncertainty",
            "absoluteUncertainty",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "bulk density in coherent SI base units from gram and centimetre measurements",
            [
              "reporting gram-per-cubic-centimetre numerical magnitude without scaling to kilograms per cubic metre",
              "applying linear centimetre prefix conversion instead of cubing the prefix factor",
              "dividing mass by squared edge length rather than cubic volume",
            ],
            ["Specimen geometry is an exact cube with uniform composition"],
          ),
          targetQuantityKey: "resultValue",
          stem,
          options,
          workedSolution: `Convert to SI base units: m = ${massG} × 10⁻³ = ${mKg} kg and L = ${edgeCm} × 10⁻² = ${lM} m. Volume V = L³ = (${lM})³ m³. Bulk density ρ = m / L³ = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Converts mass to kg and cubed edge length to m³ to obtain ρ = ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      if (targetCycle === 1) {
        const pct = solved.percentageUncertainty;
        const pctM = (dmG / massG) * 100;
        const pctL = (dEdgeCm / edgeCm) * 100;
        const stem = `${baseProse} What is the percentage uncertainty in the calculated density of the cube?`;
        const options = buildMcqOptions(
          pct,
          "%",
          [
            {
              value: pctM + pctL,
              rationale:
                "Adds the percentage uncertainty in edge length once instead of multiplying it by the power exponent 3 for L³.",
            },
            {
              value: Math.abs(3 * pctL - pctM),
              rationale:
                "Subtracts percentage uncertainties in the quotient m / L³ instead of adding worst-case contributions.",
            },
            {
              value: pctM + pctL ** 3,
              rationale:
                "Cubes the percentage uncertainty in L rather than multiplying the fractional uncertainty by 3.",
            },
            {
              value: 3 * pctM * pctL,
              rationale:
                "Multiplies the percentage uncertainties together instead of summing fractional uncertainties.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(pct, "%");
        return {
          id,
          conceptId: "si-units-dimensional-analysis",
          templateArchetype: "si-cubed-prefix-bulk-density",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "resultValue",
            "fractionalUncertainty",
            "percentageUncertainty",
            "absoluteUncertainty",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "percentage uncertainty propagation in cubic density determination",
            [
              "omitting the cubic exponent multiplier on the length fractional uncertainty",
              "subtracting fractional uncertainties in a quotient expression",
              "raising percentage uncertainty to the third power instead of multiplying by three",
            ],
            ["Worst-case linear uncertainty propagation applies"],
          ),
          targetQuantityKey: "percentageUncertainty",
          stem,
          options,
          workedSolution: `Since ρ = m L⁻³, Δρ / ρ = Δm / m + 3(ΔL / L) = (${dmG}/${massG}) + 3(${dEdgeCm}/${edgeCm}). Expressing as a percentage gives ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Applies Δρ/ρ = Δm/m + 3(ΔL/L) to obtain ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const absUnc = solved.absoluteUncertainty;
      const pctNo3 = dmG / massG + dEdgeCm / edgeCm;
      const stem = `${baseProse} What is the absolute uncertainty Δρ in the density when expressed in kg m⁻³?`;
      const options = buildMcqOptions(
        absUnc,
        "kg m⁻³",
        [
          {
            value: solved.resultValue * pctNo3,
            rationale:
              "Forgets the factor of 3 from L³ when propagating the fractional uncertainty of the edge length.",
          },
          {
            value: absUnc * 1e-3,
            rationale:
              "Leaves the absolute uncertainty in g cm⁻³ rather than converting to kg m⁻³.",
          },
          {
            value:
              solved.resultValue *
              Math.abs(dmG / massG - (3 * dEdgeCm) / edgeCm),
            rationale:
              "Subtracts the fractional uncertainty of L³ from that of mass in the quotient m / L³.",
          },
          {
            value: solved.percentageUncertainty,
            rationale:
              "Reports the percentage uncertainty figure directly without multiplying by the density ρ.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(absUnc, "kg m⁻³");
      return {
        id,
        conceptId: "si-units-dimensional-analysis",
        templateArchetype: "si-cubed-prefix-bulk-density",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [
          "resultValue",
          "fractionalUncertainty",
          "percentageUncertainty",
          "absoluteUncertainty",
        ],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "absolute uncertainty of density in SI base units",
          [
            "omitting the exponent multiplier on the cubed length uncertainty",
            "failing to convert gram-per-cubic-centimetre uncertainty to kilograms per cubic metre",
            "subtracting fractional uncertainties in a division formula",
          ],
          ["Specimen edges have equal fractional uncertainty"],
        ),
        targetQuantityKey: "absoluteUncertainty",
        stem,
        options,
        workedSolution: `First find ρ = (${mKg}) / (${lM})³ = ${formatPhysicsValue(solved.resultValue, "kg m⁻³")}. Fractional uncertainty Δρ/ρ = (${dmG}/${massG}) + 3(${dEdgeCm}/${edgeCm}) = ${formatPhysicsValue(solved.fractionalUncertainty)}. Therefore Δρ = ρ × (Δρ/ρ) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Combines SI density with fractional uncertainty Δm/m + 3ΔL/L to obtain Δρ = ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // Structured (3 parts: a -> resultValue, b -> percentageUncertainty, c -> absoluteUncertainty)
    const ansRho = formatPhysicsValue(solved.resultValue, "kg m⁻³");
    const ansPct = formatPhysicsValue(solved.percentageUncertainty, "%");
    const ansAbs = formatPhysicsValue(solved.absoluteUncertainty, "kg m⁻³");

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt:
          "Calculate the nominal density ρ of the cubic specimen in coherent SI units (kg m⁻³).",
        marks: 2,
        targetQuantityKey: "resultValue",
        expectedAnswer: ansRho,
        workingSteps: [
          `Convert inputs to SI base units: m = ${massG} × 10⁻³ = ${mKg} kg, L = ${edgeCm} × 10⁻² = ${lM} m.`,
          `ρ = m / L³ = ${mKg} / (${lM})³ = ${ansRho}.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Determine the percentage uncertainty in the calculated density.",
        marks: 2,
        targetQuantityKey: "percentageUncertainty",
        expectedAnswer: ansPct,
        workingSteps: [
          `Apply power-quotient propagation: %Δρ = (%Δm) + 3(%ΔL).`,
          `%Δρ = (${dmG}/${massG}) × 100% + 3 × (${dEdgeCm}/${edgeCm}) × 100% = ${ansPct}.`,
        ],
      },
      {
        partId: "c",
        prompt:
          "Hence state the absolute uncertainty Δρ in kg m⁻³.",
        marks: 1,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "absoluteUncertainty",
        expectedAnswer: ansAbs,
        workingSteps: [
          `Δρ = ρ × (%Δρ / 100%) = ${ansAbs}.`,
        ],
      },
    ];

    const markScheme: MarkSchemePoint[] = [
      {
        code: "M1",
        partId: "a",
        criterion:
          "Converts mass to kg (× 10⁻³) and cubes converted side length (× 10⁻⁶ m³).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains ρ = ${ansRho}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b",
        criterion:
          "Sums percentage uncertainty in mass with three times the percentage uncertainty in side length.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Obtains ${ansPct}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Multiplies nominal density by fractional uncertainty to obtain Δρ = ${ansAbs}.`,
        marks: 1,
      },
    ];

    return {
      id,
      conceptId: "si-units-dimensional-analysis",
      templateArchetype: "si-cubed-prefix-bulk-density",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: [
        "resultValue",
        "fractionalUncertainty",
        "percentageUncertainty",
        "absoluteUncertainty",
      ],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "SI prefix conversion and cubic uncertainty propagation for specimen density",
        [
          "convert gram and centimetre readings into coherent SI base units to compute bulk density",
          "propagate fractional uncertainties across mass and cubed edge length",
          "evaluate absolute density uncertainty in kilograms per cubic metre",
        ],
        ["Specimen edges are mutually perpendicular and equal within stated tolerance"],
      ),
      stem: baseProse,
      parts,
      workedSolution: `(a) m = ${mKg} kg and L = ${lM} m, so ρ = m / L³ = ${ansRho}. (b) %Δρ = (${dmG}/${massG} + 3 × ${dEdgeCm}/${edgeCm}) × 100% = ${ansPct}. (c) Δρ = ρ × (Δρ/ρ) = ${ansAbs}.`,
      markScheme,
      totalMarks: 5,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 2: Dimensional Homogeneity — Transverse Wave Speed v = sqrt(T / μ)
// ============================================================================
const ARCHETYPE_DIMENSIONAL_WAVE_SPEED: ArchetypeDefinition = {
  conceptId: "si-units-dimensional-analysis",
  templateArchetype: "dimensional-homogeneity-tension-wave-speed",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const tensionChoices = [48, 64, 75, 96, 120, 144, 180, 216, 250, 320];
    const dTChoices = [1.2, 1.5, 2.0, 2.4, 3.0, 4.0];
    const muGmChoices = [2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 12.0, 15.0, 16.0];
    const dMuGmChoices = [0.06, 0.08, 0.1, 0.15, 0.2, 0.3];

    const tensionN = tensionChoices[variantIndex % tensionChoices.length];
    const dTN = dTChoices[variantIndex % dTChoices.length];
    const muGm = muGmChoices[(variantIndex * 2 + 1) % muGmChoices.length];
    const dMuGm = dMuGmChoices[(variantIndex + 2) % dMuGmChoices.length];

    const muKgM = Number((muGm * 1e-3).toPrecision(6));
    const dMuKgM = Number((dMuGm * 1e-3).toPrecision(6));

    const scenarioSpec = {
      kind: "uncertainty-power-product",
      aValue: tensionN,
      aAbsUnc: dTN,
      aPower: 0.5,
      bValue: muKgM,
      bAbsUnc: dMuKgM,
      bPower: -0.5,
    };
    const solved = solvePureCalc(scenarioSpec);
    const syllabi = resolveSyllabusTags(
      "si-units-dimensional-analysis",
      format,
      variantIndex,
      "all-three",
    );

    const contexts = [
      `By dimensional homogeneity, the transverse wave speed v along a taut cable depends only on tension T (in N, i.e. kg m s⁻²) and linear mass density μ (mass per unit length) via v = Tᵃ μᵇ with dimensionless constant equal to unity. In an acoustic wire rig, T = ${tensionN} N ± ${dTN} N and μ = ${muGm} g m⁻¹ ± ${dMuGm} g m⁻¹.`,
      `Dimensional analysis of a tensioned overhead catenary wire shows that mechanical pulse speed obeys v = Tᵃ μᵇ (unit prefactor), where T is axial tension and μ is mass per unit length. Field sensors record T = ${tensionN} N ± ${dTN} N on a conductor of μ = ${muGm} g m⁻¹ ± ${dMuGm} g m⁻¹.`,
      `On a structural stay-cable testbed, transverse pulse propagation speed is governed by the dimensionally homogeneous relation v = Tᵃ μᵇ (k = 1). A load cell reads T = ${tensionN} N ± ${dTN} N for a strand rated at μ = ${muGm} g m⁻¹ ± ${dMuGm} g m⁻¹.`,
      `A stringed-instrument physics bench models steel-wire wave speed using dimensional consistency v = Tᵃ μᵇ (with unit constant), measuring wire tension ${tensionN} N ± ${dTN} N and linear density ${muGm} g m⁻¹ ± ${dMuGm} g m⁻¹.`,
      `An ultrasonic magnetostrictive wire waveguide operates under axial tension T = ${tensionN} N ± ${dTN} N with linear mass density μ = ${muGm} g m⁻¹ ± ${dMuGm} g m⁻¹; dimensional homogeneity fixes the exponents in v = Tᵃ μᵇ (unit prefactor).`,
      `Telemetry on a guyed meteorological mast cable measures tension ${tensionN} N ± ${dTN} N along a wire of mass per unit length ${muGm} g m⁻¹ ± ${dMuGm} g m⁻¹, where transverse wave speed satisfies the dimensionally consistent power law v = Tᵃ μᵇ (prefactor 1).`,
      `In a mooring-tether vibration experiment, wave speed follows the dimensionally homogeneous formula v = Tᵃ μᵇ (unit constant) for measured tension ${tensionN} N ± ${dTN} N and linear density ${muGm} g m⁻¹ ± ${dMuGm} g m⁻¹.`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "tensionN", value: tensionN, unit: "N", source: "stem" },
      { name: "tensionUncN", value: dTN, unit: "N", source: "stem" },
      { name: "linearDensityGm", value: muGm, unit: "g m⁻¹", source: "stem" },
      { name: "linearDensityUncGm", value: dMuGm, unit: "g m⁻¹", source: "stem" },
    ];

    if (format === "mcq") {
      if (variantIndex % 2 === 0) {
        const v = solved.resultValue;
        const stem = `${baseProse} Deduce the exponents a and b by dimensional homogeneity and calculate the wave speed v in m s⁻¹.`;
        const options = buildMcqOptions(
          v,
          "m s⁻¹",
          [
            {
              value: Math.sqrt(tensionN / muGm),
              rationale:
                "Deduces v = √(T/μ) correctly but forgets to convert μ from g m⁻¹ into kg m⁻¹ (off by √1000).",
            },
            {
              value: tensionN / muKgM,
              rationale:
                "Uses a = 1, b = −1 (computing T/μ with units m² s⁻²) without taking the square root required by dimensional homogeneity.",
            },
            {
              value: Math.sqrt(muKgM / tensionN),
              rationale:
                "Inverts the dimensional ratio to √(μ/T), yielding s m⁻¹ instead of m s⁻¹.",
            },
            {
              value: Math.sqrt(tensionN * muKgM),
              rationale:
                "Multiplies T and μ inside the radical (giving kg s⁻¹) instead of dividing T by μ.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(v, "m s⁻¹");
        return {
          id,
          conceptId: "si-units-dimensional-analysis",
          templateArchetype: "dimensional-homogeneity-tension-wave-speed",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "resultValue",
            "fractionalUncertainty",
            "percentageUncertainty",
            "absoluteUncertainty",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "wave speed from dimensional homogeneity of tension and linear mass density",
            [
              "omitting gram-to-kilogram conversion on linear mass density",
              "forgetting square-root exponents required to match inverse-second time dimensions",
              "inverting tension and linear density inside the radical",
            ],
            ["Dimensionless proportionality constant equals unity"],
          ),
          targetQuantityKey: "resultValue",
          stem,
          options,
          workedSolution: `Matching SI base units: [v] = m s⁻¹, [T] = kg m s⁻², [μ] = kg m⁻¹. For kgᵃ⁺ᵇ mᵃ⁻ᵇ s⁻²ᵃ = m¹ s⁻¹, −2a = −1 ⇒ a = 0.5 and b = −0.5, so v = √(T/μ). With μ = ${muGm} × 10⁻³ = ${muKgM} kg m⁻¹, v = √(${tensionN} / ${muKgM}) = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Finds a = 1/2, b = −1/2, converts μ to ${muKgM} kg m⁻¹, and obtains v = ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const pct = solved.percentageUncertainty;
      const pctT = (dTN / tensionN) * 100;
      const pctMu = (dMuGm / muGm) * 100;
      const stem = `${baseProse} What is the percentage uncertainty in the wave speed v deduced from dimensional homogeneity?`;
      const options = buildMcqOptions(
        pct,
        "%",
        [
          {
            value: pctT + pctMu,
            rationale:
              "Sums %ΔT + %Δμ without multiplying by the 1/2 power factor from the square-root exponents.",
          },
          {
            value: 0.5 * Math.abs(pctT - pctMu),
            rationale:
              "Subtracts the percentage uncertainties because μ appears in the denominator of √(T/μ).",
          },
          {
            value: 2 * (pctT + pctMu),
            rationale:
              "Multiplies the combined percentage uncertainty by 2 instead of 1/2 for a square-root power.",
          },
          {
            value: 0.25 * pctT * pctMu,
            rationale:
              "Multiplies scaled percentage uncertainties instead of adding fractional uncertainties.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(pct, "%");
      return {
        id,
        conceptId: "si-units-dimensional-analysis",
        templateArchetype: "dimensional-homogeneity-tension-wave-speed",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [
          "resultValue",
          "fractionalUncertainty",
          "percentageUncertainty",
          "absoluteUncertainty",
        ],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "percentage uncertainty of square-root tension-to-density wave speed",
          [
            "omitting the one-half fractional exponent multiplier on each measured variable",
            "subtracting uncertainties for the denominator variable inside the radical",
            "doubling rather than halving percentage uncertainties for a square root",
          ],
          ["Linear worst-case uncertainty propagation applies"],
        ),
        targetQuantityKey: "percentageUncertainty",
        stem,
        options,
        workedSolution: `Dimensional homogeneity gives v = T^(1/2) μ^(−1/2). Hence %Δv = ½(%ΔT) + ½(%Δμ) = 0.5(${dTN}/${tensionN} + ${dMuGm}/${muGm}) × 100% = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses exponents |1/2| and |−1/2| to obtain %Δv = ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansV = formatPhysicsValue(solved.resultValue, "m s⁻¹");
    const ansPct = formatPhysicsValue(solved.percentageUncertainty, "%");
    const ansAbs = formatPhysicsValue(solved.absoluteUncertainty, "m s⁻¹");

    return {
      id,
      conceptId: "si-units-dimensional-analysis",
      templateArchetype: "dimensional-homogeneity-tension-wave-speed",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: [
        "resultValue",
        "fractionalUncertainty",
        "percentageUncertainty",
        "absoluteUncertainty",
      ],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "dimensional homogeneity of wave speed and square-root uncertainty propagation",
        [
          "equate SI base-unit exponents to establish square-root dependence and calculate wave speed",
          "propagate half-power fractional uncertainties to obtain percentage uncertainty",
          "compute the absolute uncertainty in wave speed",
        ],
        ["Transverse wave amplitude is small and cable stiffness is negligible"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt:
            "By equating SI base units on both sides of v = Tᵃ μᵇ, determine a and b and calculate the wave speed v in m s⁻¹.",
          marks: 3,
          targetQuantityKey: "resultValue",
          expectedAnswer: ansV,
          workingSteps: [
            `[T] = kg m s⁻² and [μ] = kg m⁻¹ ⇒ kgᵃ⁺ᵇ mᵃ⁻ᵇ s⁻²ᵃ = m¹ s⁻¹, so a = 0.5 and b = −0.5.`,
            `Convert μ = ${muGm} × 10⁻³ = ${muKgM} kg m⁻¹; v = √(${tensionN} / ${muKgM}) = ${ansV}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Calculate the percentage uncertainty in v.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "percentageUncertainty",
          expectedAnswer: ansPct,
          workingSteps: [
            `%Δv = 0.5(%ΔT) + 0.5(%Δμ) = 0.5 × (${dTN}/${tensionN} + ${dMuGm}/${muGm}) × 100% = ${ansPct}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Determine the absolute uncertainty Δv in m s⁻¹.",
          marks: 1,
          dependsOnPartIds: ["a", "b"],
          targetQuantityKey: "absoluteUncertainty",
          expectedAnswer: ansAbs,
          workingSteps: [
            `Δv = v × (%Δv / 100%) = ${ansAbs}.`,
          ],
        },
      ],
      workedSolution: `(a) Dimensional homogeneity requires −2a = −1 ⇒ a = 0.5 and a + b = 0 ⇒ b = −0.5, so v = √(T/μ) = √(${tensionN}/${muKgM}) = ${ansV}. (b) %Δv = 0.5(${dTN}/${tensionN} + ${dMuGm}/${muGm}) × 100% = ${ansPct}. (c) Δv = ${ansAbs}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion:
            "Equates SI base dimensions kg, m, s to deduce a = 0.5 and b = −0.5.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "a",
          criterion: `Converts linear density to ${muKgM} kg m⁻¹ and substitutes into √(T/μ).`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains v = ${ansV}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Multiplies both %ΔT and %Δμ by 1/2 before adding.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains ${ansPct}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains Δv = ${ansAbs}.`,
          marks: 1,
        },
      ],
      totalMarks: 6,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 3: Fractional/Percentage Uncertainty in Power-Quotient a_c = v² / r
// ============================================================================
const ARCHETYPE_UNCERTAINTY_QUOTIENT: ArchetypeDefinition = {
  conceptId: "uncertainties-error-propagation",
  templateArchetype: "power-quotient-fractional-uncertainty",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const vChoices = [6.0, 8.0, 9.0, 12.0, 14.0, 15.0, 16.0, 18.0, 20.0, 24.0];
    const dvChoices = [0.15, 0.2, 0.25, 0.3, 0.4, 0.5];
    const rChoices = [0.5, 0.8, 1.2, 1.5, 1.6, 2.0, 2.5, 3.0, 4.0, 5.0];
    const drChoices = [0.02, 0.03, 0.04, 0.05, 0.06, 0.08];

    const v = vChoices[variantIndex % vChoices.length];
    const dv = dvChoices[(variantIndex + 1) % dvChoices.length];
    const r = rChoices[(variantIndex * 3 + 2) % rChoices.length];
    const dr = drChoices[(variantIndex * 2 + 1) % drChoices.length];

    const scenarioSpec = {
      kind: "uncertainty-power-product",
      aValue: v,
      aAbsUnc: dv,
      aPower: 2,
      bValue: r,
      bAbsUnc: dr,
      bPower: -1,
    };
    const solved = solvePureCalc(scenarioSpec);
    const syllabi = resolveSyllabusTags(
      "uncertainties-error-propagation",
      format,
      variantIndex,
      "all-three",
    );

    const contexts = [
      `An aerospace human-centrifuge gondola orbits at tangential speed v = ${v} m s⁻¹ ± ${dv} m s⁻¹ along a circular arm of radius r = ${r} m ± ${dr} m, producing centripetal acceleration a = v² / r.`,
      `On a laboratory flywheel test rig, an optical tachometer records rim speed v = ${v} m s⁻¹ ± ${dv} m s⁻¹ at radial distance r = ${r} m ± ${dr} m (where centripetal acceleration is a = v² / r).`,
      `Telemetry from an indoor velodrome timing loop logs a cyclist's speed as ${v} m s⁻¹ ± ${dv} m s⁻¹ around a circular bend of radius ${r} m ± ${dr} m to evaluate centripetal acceleration a = v² / r.`,
      `A biochemistry ultracentrifuge calibration head travels at tangential speed ${v} m s⁻¹ ± ${dv} m s⁻¹ on a rotor path of radius ${r} m ± ${dr} m, experiencing radial acceleration a = v² / r.`,
      `During an autonomous vehicle skid-pad trial, radar velocimetry measures speed ${v} m s⁻¹ ± ${dv} m s⁻¹ on a circular track of radius ${r} m ± ${dr} m (radial acceleration a = v² / r).`,
      `A wind-turbine hub sensor test rotates an accelerometer pod at speed ${v} m s⁻¹ ± ${dv} m s⁻¹ around a circle of radius ${r} m ± ${dr} m, where a = v² / r.`,
      `In a rotary arm calibration facility, a test mass moves steadily at v = ${v} m s⁻¹ ± ${dv} m s⁻¹ in a horizontal circle of radius r = ${r} m ± ${dr} m (a = v² / r).`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "speedMs", value: v, unit: "m s⁻¹", source: "stem" },
      { name: "speedUncMs", value: dv, unit: "m s⁻¹", source: "stem" },
      { name: "radiusM", value: r, unit: "m", source: "stem" },
      { name: "radiusUncM", value: dr, unit: "m", source: "stem" },
    ];

    const fracV = dv / v;
    const fracR = dr / r;

    if (format === "mcq") {
      const mode = variantIndex % 3;
      if (mode === 0) {
        const pct = solved.percentageUncertainty;
        const stem = `${baseProse} What is the percentage uncertainty in the calculated centripetal acceleration a?`;
        const options = buildMcqOptions(
          pct,
          "%",
          [
            {
              value: (fracV + fracR) * 100,
              rationale:
                "Omits the factor of 2 on the fractional uncertainty of v despite v being squared in v²/r.",
            },
            {
              value: Math.abs(2 * fracV - fracR) * 100,
              rationale:
                "Subtracts the percentage uncertainty of r from 2(%Δv) because r is in the denominator.",
            },
            {
              value: 2 * (fracV * 100) * (fracR * 100),
              rationale:
                "Multiplies the percentage uncertainties instead of adding fractional uncertainties.",
            },
            {
              value: (fracV ** 2 + fracR) * 100,
              rationale:
                "Squares the fractional uncertainty Δv/v instead of multiplying it by the exponent 2.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(pct, "%");
        return {
          id,
          conceptId: "uncertainties-error-propagation",
          templateArchetype: "power-quotient-fractional-uncertainty",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "resultValue",
            "fractionalUncertainty",
            "percentageUncertainty",
            "absoluteUncertainty",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "percentage uncertainty in centripetal acceleration from squared speed over radius",
            [
              "omitting the squared exponent multiplier on speed fractional uncertainty",
              "subtracting denominator fractional uncertainty in a quotient",
              "multiplying percentage uncertainties instead of summing",
            ],
            ["Linear worst-case uncertainty propagation applies"],
          ),
          targetQuantityKey: "percentageUncertainty",
          stem,
          options,
          workedSolution: `For a = v² / r, Δa/a = 2(Δv/v) + (Δr/r) = 2(${dv}/${v}) + (${dr}/${r}). Multiplying by 100% gives ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Uses %Δa = 2(%Δv) + (%Δr) to obtain ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      if (mode === 1) {
        const absUnc = solved.absoluteUncertainty;
        const stem = `${baseProse} What is the absolute uncertainty Δa in the centripetal acceleration?`;
        const options = buildMcqOptions(
          absUnc,
          "m s⁻²",
          [
            {
              value: solved.resultValue * (fracV + fracR),
              rationale:
                "Forgets to double Δv/v for the squared v² factor before multiplying by a.",
            },
            {
              value: solved.resultValue * Math.abs(2 * fracV - fracR),
              rationale:
                "Subtracts Δr/r instead of adding it when propagating uncertainty across a quotient.",
            },
            {
              value: dv ** 2 / dr,
              rationale:
                "Substitutes absolute uncertainties (Δv)² / Δr directly into the formula v² / r.",
            },
            {
              value: solved.fractionalUncertainty,
              rationale:
                "Stops at the dimensionless fractional uncertainty Δa/a without multiplying by a = v²/r.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(absUnc, "m s⁻²");
        return {
          id,
          conceptId: "uncertainties-error-propagation",
          templateArchetype: "power-quotient-fractional-uncertainty",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "resultValue",
            "fractionalUncertainty",
            "percentageUncertainty",
            "absoluteUncertainty",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "absolute uncertainty in centripetal acceleration",
            [
              "omitting factor of two on speed fractional uncertainty",
              "subtracting radius fractional uncertainty in quotient",
              "substituting raw absolute uncertainties directly into the physical equation",
            ],
            ["Circular path radius and tangential speed errors are independent"],
          ),
          targetQuantityKey: "absoluteUncertainty",
          stem,
          options,
          workedSolution: `Nominal acceleration a = v²/r = ${v}² / ${r} = ${formatPhysicsValue(solved.resultValue, "m s⁻²")}. Fractional uncertainty Δa/a = 2(${dv}/${v}) + (${dr}/${r}) = ${formatPhysicsValue(solved.fractionalUncertainty)}. Absolute uncertainty Δa = a(Δa/a) = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Calculates a = v²/r and multiplies by 2(Δv/v) + (Δr/r) to obtain Δa = ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const frac = solved.fractionalUncertainty;
      const stem = `${baseProse} What is the fractional uncertainty Δa / a in the centripetal acceleration?`;
      const options = buildMcqOptions(
        frac,
        undefined,
        [
          {
            value: fracV + fracR,
            rationale:
              "Forgets the exponent multiplier 2 on Δv/v for the v² term.",
          },
          {
            value: Math.abs(2 * fracV - fracR),
            rationale:
              "Subtracts Δr/r from 2(Δv/v) in the quotient v²/r.",
          },
          {
            value: solved.percentageUncertainty,
            rationale:
              "Confuses percentage uncertainty with dimensionless fractional uncertainty (off by a factor of 100).",
          },
          {
            value: (2 * fracV) / fracR,
            rationale:
              "Divides the fractional uncertainties instead of adding them.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(frac);
      return {
        id,
        conceptId: "uncertainties-error-propagation",
        templateArchetype: "power-quotient-fractional-uncertainty",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [
          "resultValue",
          "fractionalUncertainty",
          "percentageUncertainty",
          "absoluteUncertainty",
        ],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "dimensionless fractional uncertainty in power-quotient acceleration",
          [
            "omitting exponent factor on squared numerator variable",
            "subtracting denominator fractional uncertainty",
            "reporting percentage value instead of dimensionless fractional ratio",
          ],
          ["Worst-case linear error propagation applies"],
        ),
        targetQuantityKey: "fractionalUncertainty",
        stem,
        options,
        workedSolution: `Δa / a = 2(Δv / v) + (Δr / r) = 2(${dv} / ${v}) + (${dr} / ${r}) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates 2(Δv/v) + (Δr/r) = ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansA = formatPhysicsValue(solved.resultValue, "m s⁻²");
    const ansPct = formatPhysicsValue(solved.percentageUncertainty, "%");
    const ansAbs = formatPhysicsValue(solved.absoluteUncertainty, "m s⁻²");

    return {
      id,
      conceptId: "uncertainties-error-propagation",
      templateArchetype: "power-quotient-fractional-uncertainty",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: [
        "resultValue",
        "fractionalUncertainty",
        "percentageUncertainty",
        "absoluteUncertainty",
      ],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "centripetal acceleration and power-quotient uncertainty propagation",
        [
          "compute nominal centripetal acceleration from tangential speed and radius",
          "determine percentage uncertainty including squared-speed multiplier",
          "calculate absolute uncertainty in metres per second squared",
        ],
        ["Speed is uniform around the circular trajectory"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt: "Calculate the nominal centripetal acceleration a.",
          marks: 2,
          targetQuantityKey: "resultValue",
          expectedAnswer: ansA,
          workingSteps: [
            `a = v² / r = (${v})² / ${r} = ${ansA}.`,
          ],
        },
        {
          partId: "b",
          prompt: "Calculate the percentage uncertainty in a.",
          marks: 2,
          targetQuantityKey: "percentageUncertainty",
          expectedAnswer: ansPct,
          workingSteps: [
            `%Δa = 2(%Δv) + (%Δr) = [2(${dv}/${v}) + (${dr}/${r})] × 100% = ${ansPct}.`,
          ],
        },
        {
          partId: "c",
          prompt: "Determine the absolute uncertainty Δa.",
          marks: 1,
          dependsOnPartIds: ["a", "b"],
          targetQuantityKey: "absoluteUncertainty",
          expectedAnswer: ansAbs,
          workingSteps: [
            `Δa = a × (%Δa / 100%) = ${ansAbs}.`,
          ],
        },
      ],
      workedSolution: `(a) a = ${v}² / ${r} = ${ansA}. (b) %Δa = [2(${dv}/${v}) + (${dr}/${r})] × 100% = ${ansPct}. (c) Δa = ${ansAbs}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: "Substitutes v and r into a = v² / r.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains a = ${ansA}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Uses 2(Δv/v) + (Δr/r) and converts to a percentage.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains ${ansPct}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains Δa = ${ansAbs}.`,
          marks: 1,
        },
      ],
      totalMarks: 5,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 4: Sum/Difference Absolute Uncertainties + Spring Stiffness k = F / (x₂ − x₁)
// ============================================================================
const ARCHETYPE_SUM_DIFF_STIFFNESS: ArchetypeDefinition = {
  conceptId: "uncertainties-error-propagation",
  templateArchetype: "sum-difference-extension-stiffness-uncertainty",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const x1MmChoices = [12.0, 14.0, 15.0, 18.0, 20.0, 22.0, 25.0, 28.0];
    const extMmChoices = [40.0, 45.0, 50.0, 60.0, 75.0, 80.0, 90.0, 100.0];
    const dxMmChoices = [0.5, 0.8, 1.0];
    const forceChoices = [12.0, 15.0, 18.0, 24.0, 30.0, 36.0, 42.0, 48.0, 60.0];
    const dForceChoices = [0.3, 0.4, 0.5, 0.6, 0.8, 1.0];

    const x1Mm = x1MmChoices[variantIndex % x1MmChoices.length];
    const extMm = extMmChoices[(variantIndex * 2 + 1) % extMmChoices.length];
    const x2Mm = x1Mm + extMm;
    const dxMm = dxMmChoices[variantIndex % dxMmChoices.length];
    const forceN = forceChoices[(variantIndex * 3 + 2) % forceChoices.length];
    const dForceN = dForceChoices[(variantIndex + 1) % dForceChoices.length];

    const eM = Number((extMm * 1e-3).toPrecision(6));
    const deM = Number((2 * dxMm * 1e-3).toPrecision(6));

    const scenarioSpec = {
      kind: "uncertainty-power-product",
      aValue: forceN,
      aAbsUnc: dForceN,
      aPower: 1,
      bValue: eM,
      bAbsUnc: deM,
      bPower: -1,
    };
    const solved = solvePureCalc(scenarioSpec);
    const syllabi = resolveSyllabusTags(
      "uncertainties-error-propagation",
      format,
      variantIndex,
      "all-three",
    );

    const contexts = [
      `On a vertical Hooke's-law stand, the pointer of a helical coil spring reads x₁ = ${x1Mm} mm ± ${dxMm} mm when unloaded and x₂ = ${x2Mm} mm ± ${dxMm} mm under a calibrated load F = ${forceN} N ± ${dForceN} N.`,
      `During calibration of a railway buffer spring scale, a technician records datum position x₁ = ${x1Mm} mm ± ${dxMm} mm before loading and x₂ = ${x2Mm} mm ± ${dxMm} mm when axial force F = ${forceN} N ± ${dForceN} N is applied.`,
      `A biomechanics lab tests a carbon-composite leaf spring: optical ruler readings shift from x₁ = ${x1Mm} mm ± ${dxMm} mm at zero load to x₂ = ${x2Mm} mm ± ${dxMm} mm under tension F = ${forceN} N ± ${dForceN} N.`,
      `In a seismometer suspension test, the lower fiducial mark sits at x₁ = ${x1Mm} mm ± ${dxMm} mm unloaded and moves to x₂ = ${x2Mm} mm ± ${dxMm} mm when force F = ${forceN} N ± ${dForceN} N is suspended.`,
      `An engine-valve spring fixture logs an initial collar reading x₁ = ${x1Mm} mm ± ${dxMm} mm and a compressed reading x₂ = ${x2Mm} mm ± ${dxMm} mm under force F = ${forceN} N ± ${dForceN} N.`,
      `A precision dynamometer audit records pointer positions x₁ = ${x1Mm} mm ± ${dxMm} mm (unloaded) and x₂ = ${x2Mm} mm ± ${dxMm} mm under force F = ${forceN} N ± ${dForceN} N.`,
      `While characterizing an actuator return spring, students note scale readings x₁ = ${x1Mm} mm ± ${dxMm} mm and x₂ = ${x2Mm} mm ± ${dxMm} mm for an applied load of ${forceN} N ± ${dForceN} N.`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "x1Mm", value: x1Mm, unit: "mm", source: "stem" },
      { name: "x2Mm", value: x2Mm, unit: "mm", source: "stem" },
      { name: "dxMm", value: dxMm, unit: "mm", source: "stem" },
      { name: "forceN", value: forceN, unit: "N", source: "stem" },
      { name: "forceUncN", value: dForceN, unit: "N", source: "stem" },
    ];

    const fracF = dForceN / forceN;
    const fracSingle = dxMm / extMm;
    const fracDouble = (2 * dxMm) / extMm;

    if (format === "mcq") {
      if (variantIndex % 2 === 0) {
        const pct = solved.percentageUncertainty;
        const stem = `${baseProse} Using Δ(x₂ − x₁) = Δx₁ + Δx₂, what is the percentage uncertainty in the spring constant k = F / (x₂ − x₁)?`;
        const options = buildMcqOptions(
          pct,
          "%",
          [
            {
              value: (fracF + fracSingle) * 100,
              rationale:
                "Uses the uncertainty of a single ruler reading Δx rather than summing Δx₁ + Δx₂ = 2Δx for the difference x₂ − x₁.",
            },
            {
              value: fracF * 100,
              rationale:
                "Assumes Δ(x₂ − x₁) = Δx − Δx = 0 by subtracting absolute uncertainties in a difference.",
            },
            {
              value: Math.abs(fracF - fracDouble) * 100,
              rationale:
                "Subtracts the fractional uncertainty of extension from %ΔF in the quotient F / e.",
            },
            {
              value: (fracF + (2 * dxMm) / x2Mm) * 100,
              rationale:
                "Divides 2Δx by the final reading x₂ instead of by the extension e = x₂ − x₁.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(pct, "%");
        return {
          id,
          conceptId: "uncertainties-error-propagation",
          templateArchetype: "sum-difference-extension-stiffness-uncertainty",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "resultValue",
            "fractionalUncertainty",
            "percentageUncertainty",
            "absoluteUncertainty",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "percentage uncertainty in spring stiffness combining difference and quotient rules",
            [
              "using single pointer uncertainty instead of summing both reading uncertainties",
              "cancelling equal absolute uncertainties to zero when subtracting scale readings",
              "subtracting fractional uncertainties in the force-over-extension quotient",
            ],
            ["Spring obeys Hooke's law below its limit of proportionality"],
          ),
          targetQuantityKey: "percentageUncertainty",
          stem,
          options,
          workedSolution: `Extension e = x₂ − x₁ = ${x2Mm} − ${x1Mm} = ${extMm} mm with absolute uncertainty Δe = Δx₁ + Δx₂ = ${dxMm} + ${dxMm} = ${2 * dxMm} mm. Thus %Δk = (%ΔF) + (%Δe) = (${dForceN}/${forceN} + ${2 * dxMm}/${extMm}) × 100% = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Finds e = ${extMm} mm, Δe = ${2 * dxMm} mm, and obtains %Δk = ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const absK = solved.absoluteUncertainty;
      const stem = `${baseProse} What is the absolute uncertainty Δk in the spring constant expressed in N m⁻¹?`;
      const options = buildMcqOptions(
        absK,
        "N m⁻¹",
        [
          {
            value: solved.resultValue * (fracF + fracSingle),
            rationale:
              "Includes only one reading uncertainty Δx instead of 2Δx when evaluating Δ(x₂ − x₁).",
          },
          {
            value: solved.resultValue * fracF,
            rationale:
              "Subtracts Δx₂ − Δx₁ = 0 on the extension difference, ignoring ruler uncertainty completely.",
          },
          {
            value: absK * 1e-3,
            rationale:
              "Leaves k in N mm⁻¹ instead of converting extension from millimetres to metres.",
          },
          {
            value: solved.resultValue * Math.abs(fracF - fracDouble),
            rationale:
              "Subtracts %Δe from %ΔF in the quotient k = F / e.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(absK, "N m⁻¹");
      return {
        id,
        conceptId: "uncertainties-error-propagation",
        templateArchetype: "sum-difference-extension-stiffness-uncertainty",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [
          "resultValue",
          "fractionalUncertainty",
          "percentageUncertainty",
          "absoluteUncertainty",
        ],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "absolute uncertainty in spring constant in newtons per metre",
          [
            "omitting second pointer reading uncertainty in difference propagation",
            "failing to convert millimetre extension to metres",
            "subtracting fractional uncertainties in division",
          ],
          ["Spring remains within linear elastic regime"],
        ),
        targetQuantityKey: "absoluteUncertainty",
        stem,
        options,
        workedSolution: `Extension e = (${x2Mm} − ${x1Mm}) × 10⁻³ = ${eM} m with Δe = 2(${dxMm}) × 10⁻³ = ${deM} m. Nominal k = ${forceN} / ${eM} = ${formatPhysicsValue(solved.resultValue, "N m⁻¹")}. Fractional uncertainty Δk/k = ${dForceN}/${forceN} + ${deM}/${eM} = ${formatPhysicsValue(solved.fractionalUncertainty)}, so Δk = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Combines Δe = 2Δx with ΔF/F + Δe/e to obtain Δk = ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansK = formatPhysicsValue(solved.resultValue, "N m⁻¹");
    const ansPct = formatPhysicsValue(solved.percentageUncertainty, "%");
    const ansAbs = formatPhysicsValue(solved.absoluteUncertainty, "N m⁻¹");

    return {
      id,
      conceptId: "uncertainties-error-propagation",
      templateArchetype: "sum-difference-extension-stiffness-uncertainty",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: [
        "resultValue",
        "fractionalUncertainty",
        "percentageUncertainty",
        "absoluteUncertainty",
      ],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "spring stiffness and combined difference-plus-quotient uncertainty propagation",
        [
          "subtract pointer positions and convert extension to metres to calculate nominal spring constant",
          "sum absolute reading uncertainties on extension and combine with force uncertainty for percentage uncertainty",
          "evaluate absolute uncertainty in newtons per metre",
        ],
        ["Scale zero offset cancels in the difference while reading uncertainties add"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt:
            "Calculate the spring constant k in N m⁻¹.",
          marks: 2,
          targetQuantityKey: "resultValue",
          expectedAnswer: ansK,
          workingSteps: [
            `e = x₂ − x₁ = ${x2Mm} − ${x1Mm} = ${extMm} mm = ${eM} m.`,
            `k = F / e = ${forceN} / ${eM} = ${ansK}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Determine the percentage uncertainty in k.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "percentageUncertainty",
          expectedAnswer: ansPct,
          workingSteps: [
            `Δe = Δx₁ + Δx₂ = ${dxMm} + ${dxMm} = ${2 * dxMm} mm.`,
            `%Δk = (${dForceN}/${forceN} + ${2 * dxMm}/${extMm}) × 100% = ${ansPct}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Hence find the absolute uncertainty Δk in N m⁻¹.",
          marks: 1,
          dependsOnPartIds: ["a", "b"],
          targetQuantityKey: "absoluteUncertainty",
          expectedAnswer: ansAbs,
          workingSteps: [
            `Δk = k × (%Δk / 100%) = ${ansAbs}.`,
          ],
        },
      ],
      workedSolution: `(a) e = ${extMm} mm = ${eM} m, giving k = ${forceN}/${eM} = ${ansK}. (b) Δe = ${2 * dxMm} mm, so %Δk = (${dForceN}/${forceN} + ${2 * dxMm}/${extMm}) × 100% = ${ansPct}. (c) Δk = ${ansAbs}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: `Subtracts readings to get e = ${eM} m and uses k = F / e.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains k = ${ansK}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: `Sums absolute uncertainties Δe = ${2 * dxMm} mm and adds %ΔF + %Δe.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains ${ansPct}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains Δk = ${ansAbs}.`,
          marks: 1,
        },
      ],
      totalMarks: 5,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 5: 2D Vector Resolution + Rectilinear Kinematics
// ============================================================================
const ARCHETYPE_VECTOR_TOW_KINEMATICS: ArchetypeDefinition = {
  conceptId: "vectors-equilibrium-moments",
  templateArchetype: "angled-tow-vector-resolution-kinematics",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const angleSpecs = [
      { deg: 60, cos: 0.5, sin: 0.8660254 },
      { deg: 36.87, cos: 0.8, sin: 0.6 },
      { deg: 53.13, cos: 0.6, sin: 0.8 },
    ] as const;
    const angle = angleSpecs[variantIndex % angleSpecs.length];
    const massChoices = [10, 12, 15, 20, 25, 30, 40, 50, 80];
    const accelChoices = [0.8, 1.2, 1.5, 1.6, 2.0, 2.4, 2.5, 3.0];
    const uChoices = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0];
    const tChoices = [3.0, 4.0, 5.0, 6.0, 8.0, 10.0];

    const massKg = massChoices[variantIndex % massChoices.length];
    const ax = accelChoices[(variantIndex * 2 + 1) % accelChoices.length];
    const forceN = Number(((massKg * ax) / angle.cos).toPrecision(6));
    const uMs = uChoices[(variantIndex + 2) % uChoices.length];
    const tS = tChoices[(variantIndex * 3 + 1) % tChoices.length];

    const scenarioSpec = {
      kind: "suvat-motion",
      uMs,
      aMs2: ax,
      tS,
    };
    const solved = solvePureCalc(scenarioSpec);
    const syllabi = resolveSyllabusTags(
      "vectors-equilibrium-moments",
      format,
      variantIndex,
      "all-three",
    );

    const contexts = [
      `A glaciology instrument sled of mass ${massKg} kg glides along horizontal frictionless ice at initial speed ${uMs} m s⁻¹ when a winch cable applies a constant tension of ${forceN} N angled at ${angle.deg}° above the horizontal for ${tS} s (sled remains in contact with the ice).`,
      `In a cleanroom air-bearing guideway, a ${massKg} kg wafer carrier moving initially at ${uMs} m s⁻¹ is pulled for ${tS} s by a tether of constant tension ${forceN} N inclined at ${angle.deg}° to the horizontal track.`,
      `Along a smooth horizontal wave-tank rail, a ${massKg} kg sensor carriage travelling at ${uMs} m s⁻¹ experiences a steady tow force of ${forceN} N directed at ${angle.deg}° above the rail for an interval of ${tS} s.`,
      `An airport cargo pallet of mass ${massKg} kg rolls on negligible-friction rollers at ${uMs} m s⁻¹ before a strap pulls it with constant force ${forceN} N at ${angle.deg}° above the horizontal for ${tS} s.`,
      `On a frictionless linear air track, a ${massKg} kg test sled has initial velocity ${uMs} m s⁻¹ along the track when an angled cord exerts ${forceN} N at ${angle.deg}° to the track axis for ${tS} s.`,
      `A shipyard transfer cradle of mass ${massKg} kg moves horizontally at ${uMs} m s⁻¹ on hydrostatic bearings while a hawser pulls with ${forceN} N at an angle of ${angle.deg}° to the horizontal path over ${tS} s.`,
      `During a laboratory dynamics run, a ${massKg} kg low-friction trolley moving at ${uMs} m s⁻¹ is accelerated for ${tS} s by a cord tension of ${forceN} N held at ${angle.deg}° above the horizontal.`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "massKg", value: massKg, unit: "kg", source: "stem" },
      { name: "initialSpeedMs", value: uMs, unit: "m s⁻¹", source: "stem" },
      { name: "forceN", value: forceN, unit: "N", source: "stem" },
      { name: "angleDeg", value: angle.deg, unit: "°", source: "stem" },
      { name: "durationS", value: tS, unit: "s", source: "stem" },
    ];

    const aSin = (forceN * angle.sin) / massKg;
    const aUnresolved = forceN / massKg;

    if (format === "mcq") {
      if (variantIndex % 2 === 0) {
        const s = solved.displacementM;
        const stem = `${baseProse} What horizontal distance does the body travel during the ${tS} s interval?`;
        const options = buildMcqOptions(
          s,
          "m",
          [
            {
              value: uMs * tS + 0.5 * aSin * tS ** 2,
              rationale:
                "Resolves the towing force using F sin θ instead of the horizontal component F cos θ.",
            },
            {
              value: uMs * tS + 0.5 * aUnresolved * tS ** 2,
              rationale:
                "Substitutes the full cable tension F/m without resolving along the horizontal direction of motion.",
            },
            {
              value: uMs * tS + ax * tS ** 2,
              rationale:
                "Omits the factor of 1/2 in s = ut + ½at².",
            },
            {
              value: 0.5 * ax * tS ** 2,
              rationale:
                "Omits the initial-velocity displacement term ut.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(s, "m");
        return {
          id,
          conceptId: "vectors-equilibrium-moments",
          templateArchetype: "angled-tow-vector-resolution-kinematics",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: ["vMs", "displacementM", "averageVelocityMs"],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "horizontal displacement under an oblique towing force",
            [
              "swapping sine and cosine components when resolving force along the track",
              "using full un-resolved tension magnitude in Newton's second law",
              "omitting the one-half coefficient on the squared-time acceleration term",
            ],
            ["Track is horizontal and resistive friction is negligible"],
          ),
          targetQuantityKey: "displacementM",
          stem,
          options,
          workedSolution: `Horizontal force F_x = ${forceN} cos(${angle.deg}°) = ${massKg * ax} N, so a_x = F_x / m = ${ax} m s⁻². Using s = ut + ½a_x t² = (${uMs})(${tS}) + 0.5(${ax})(${tS})² = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Resolves F cos ${angle.deg}° to get a_x = ${ax} m s⁻² and obtains s = ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const v = solved.vMs;
      const stem = `${baseProse} What is the horizontal speed at the end of the ${tS} s interval?`;
      const options = buildMcqOptions(
        v,
        "m s⁻¹",
        [
          {
            value: uMs + aSin * tS,
            rationale:
              "Uses the vertical component F sin θ instead of F cos θ to compute horizontal acceleration.",
          },
          {
            value: uMs + aUnresolved * tS,
            rationale:
              "Applies F/m directly without resolving the angled force vector horizontally.",
          },
          {
            value: ax * tS,
            rationale:
              "Calculates only the velocity change Δv = a_x t and forgets to add the initial speed u.",
          },
          {
            value: solved.averageVelocityMs,
            rationale:
              "Calculates the mean velocity over the interval rather than the final velocity.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(v, "m s⁻¹");
      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "angled-tow-vector-resolution-kinematics",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: ["vMs", "displacementM", "averageVelocityMs"],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "final horizontal speed from resolved oblique force and kinematics",
          [
            "resolving force with sine instead of cosine of elevation angle",
            "ignoring force inclination angle completely",
            "omitting initial velocity when computing final velocity",
          ],
          ["Body remains on the horizontal guide throughout motion"],
        ),
        targetQuantityKey: "vMs",
        stem,
        options,
        workedSolution: `Horizontal component F_x = ${forceN} cos(${angle.deg}°) = ${massKg * ax} N ⇒ a_x = ${ax} m s⁻². Final speed v = u + a_x t = ${uMs} + (${ax})(${tS}) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds a_x = ${ax} m s⁻² via F cos ${angle.deg}° / m and obtains v = ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansV = formatPhysicsValue(solved.vMs, "m s⁻¹");
    const ansS = formatPhysicsValue(solved.displacementM, "m");
    const ansAvg = formatPhysicsValue(solved.averageVelocityMs, "m s⁻¹");

    return {
      id,
      conceptId: "vectors-equilibrium-moments",
      templateArchetype: "angled-tow-vector-resolution-kinematics",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: ["vMs", "displacementM", "averageVelocityMs"],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "vector force resolution coupled to horizontal constant-acceleration kinematics",
        [
          "resolve oblique cable tension horizontally to determine final speed",
          "calculate horizontal displacement over the towing interval",
          "evaluate mean horizontal velocity",
        ],
        ["Vertical cable component does not lift the body off the horizontal support"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt:
            "Resolve the cable force horizontally to find the acceleration and calculate the speed at the end of the interval.",
          marks: 2,
          targetQuantityKey: "vMs",
          expectedAnswer: ansV,
          workingSteps: [
            `a_x = (F cos ${angle.deg}°) / m = (${forceN} × ${angle.cos}) / ${massKg} = ${ax} m s⁻².`,
            `v = u + a_x t = ${uMs} + (${ax})(${tS}) = ${ansV}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Calculate the horizontal displacement during the interval.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "displacementM",
          expectedAnswer: ansS,
          workingSteps: [
            `s = ut + ½a_x t² = (${uMs})(${tS}) + 0.5(${ax})(${tS})² = ${ansS}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "State the mean horizontal velocity over the interval.",
          marks: 1,
          dependsOnPartIds: ["b"],
          targetQuantityKey: "averageVelocityMs",
          expectedAnswer: ansAvg,
          workingSteps: [
            `v_mean = s / t = ${ansAvg}.`,
          ],
        },
      ],
      workedSolution: `(a) a_x = (${forceN} cos ${angle.deg}°)/${massKg} = ${ax} m s⁻², so v = ${uMs} + (${ax})(${tS}) = ${ansV}. (b) s = (${uMs})(${tS}) + 0.5(${ax})(${tS})² = ${ansS}. (c) v_mean = s / ${tS} = ${ansAvg}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: `Uses F cos ${angle.deg}° / m = ${ax} m s⁻² and v = u + at.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains v = ${ansV}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Substitutes into s = ut + ½at² or ½(u + v)t.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains s = ${ansS}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains v_mean = ${ansAvg}.`,
          marks: 1,
        },
      ],
      totalMarks: 5,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 6: Oblique Haulage Vector Power P = Fv cos θ & Drivetrain Efficiency
// ============================================================================
const ARCHETYPE_VECTOR_POWER: ArchetypeDefinition = {
  conceptId: "vectors-equilibrium-moments",
  templateArchetype: "oblique-haulage-vector-power-efficiency",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const angleSpecs = [
      { deg: 60, cos: 0.5, sin: 0.8660254 },
      { deg: 36.87, cos: 0.8, sin: 0.6 },
      { deg: 53.13, cos: 0.6, sin: 0.8 },
    ] as const;
    const angle = angleSpecs[variantIndex % angleSpecs.length];
    const forceChoices = [300, 400, 500, 600, 750, 900, 1200, 1500];
    const speedChoices = [2.0, 2.5, 3.0, 4.0, 5.0, 6.0];
    const effChoices = [0.6, 0.64, 0.72, 0.75, 0.8, 0.85];
    const tChoices = [20, 25, 30, 40, 50, 60];

    const forceN = forceChoices[variantIndex % forceChoices.length];
    const vMs = speedChoices[(variantIndex + 2) % speedChoices.length];
    const pUseful = Number((forceN * vMs * angle.cos).toPrecision(6));
    const effNominal = effChoices[(variantIndex * 2 + 1) % effChoices.length];
    const pIn = Math.round(pUseful / effNominal);
    const tS = tChoices[(variantIndex * 3 + 1) % tChoices.length];

    const scenarioSpec = {
      kind: "power-efficiency",
      inputPowerW: pIn,
      usefulPowerW: pUseful,
      durationS: tS,
    };
    const solved = solvePureCalc(scenarioSpec);
    const syllabi = resolveSyllabusTags(
      "vectors-equilibrium-moments",
      format,
      variantIndex,
      "all-three",
    );

    const contexts = [
      `A canal electric mule winch draws ${pIn} W of electrical power while towing a barge at constant horizontal speed ${vMs} m s⁻¹ for ${tS} s via a hawser under tension ${forceN} N angled at ${angle.deg}° to the canal bank.`,
      `On a forestry cableway, an electric capstan consuming ${pIn} W pulls a timber sled horizontally at steady speed ${vMs} m s⁻¹ for ${tS} s using a cable of tension ${forceN} N inclined at ${angle.deg}° above the path.`,
      `A subsea trenching winch takes an electrical input of ${pIn} W for ${tS} s to advance a sled along a level seabed at constant speed ${vMs} m s⁻¹ through a tow line of tension ${forceN} N at ${angle.deg}° to the seabed.`,
      `In an industrial shipyard dock, an electric haulage drum drawing ${pIn} W moves a hull cradle steadily at ${vMs} m s⁻¹ for ${tS} s via a cable exerting ${forceN} N at ${angle.deg}° to the horizontal rail.`,
      `A ski-area surface tow motor draws ${pIn} W from the supply while pulling a maintenance sled along a level flat at constant velocity ${vMs} m s⁻¹ over ${tS} s with rope tension ${forceN} N at ${angle.deg}° to the travel direction.`,
      `An automated agricultural cable gantry drawing ${pIn} W hauls an implement at constant speed ${vMs} m s⁻¹ for ${tS} s using a tether tension of ${forceN} N inclined at ${angle.deg}° to the furrow.`,
      `A wave-basin carriage drive draws ${pIn} W electrically while towing a hydrofoil rig horizontally at ${vMs} m s⁻¹ for ${tS} s by a line of tension ${forceN} N held at ${angle.deg}° to the motion.`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "inputPowerW", value: pIn, unit: "W", source: "stem" },
      { name: "speedMs", value: vMs, unit: "m s⁻¹", source: "stem" },
      { name: "durationS", value: tS, unit: "s", source: "stem" },
      { name: "forceN", value: forceN, unit: "N", source: "stem" },
      { name: "angleDeg", value: angle.deg, unit: "°", source: "stem" },
    ];

    if (format === "mcq") {
      if (variantIndex % 2 === 0) {
        const effPct = solved.efficiencyPercent;
        const stem = `${baseProse} What is the percentage efficiency of the haulage system?`;
        const options = buildMcqOptions(
          effPct,
          "%",
          [
            {
              value: ((forceN * vMs * angle.sin) / pIn) * 100,
              rationale:
                "Uses Fv sin θ instead of the component parallel to velocity Fv cos θ.",
            },
            {
              value: ((forceN * vMs) / pIn) * 100,
              rationale:
                "Uses un-resolved product Fv without multiplying by cos θ.",
            },
            {
              value: 100 - effPct,
              rationale:
                "Calculates the percentage of input power wasted rather than the useful efficiency.",
            },
            {
              value: (pIn / pUseful) * 100,
              rationale:
                "Inverts the efficiency ratio as P_in / P_useful.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(effPct, "%");
        return {
          id,
          conceptId: "vectors-equilibrium-moments",
          templateArchetype: "oblique-haulage-vector-power-efficiency",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "efficiency",
            "efficiencyPercent",
            "usefulEnergyJ",
            "totalInputEnergyJ",
            "wastedEnergyJ",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "percentage efficiency of oblique cable haulage using scalar product power",
            [
              "using sine component perpendicular to velocity instead of cosine component",
              "omitting vector angle resolution when calculating mechanical output power",
              "computing wasted power percentage instead of useful efficiency",
            ],
            ["Motion is at constant velocity along a straight path"],
          ),
          targetQuantityKey: "efficiencyPercent",
          stem,
          options,
          workedSolution: `Useful mechanical power P_out = F v cos θ = ${forceN} × ${vMs} × cos(${angle.deg}°) = ${pUseful} W. Efficiency η = (${pUseful} / ${pIn}) × 100% = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Evaluates P_out = Fv cos ${angle.deg}° = ${pUseful} W and obtains η = ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const wasted = solved.wastedEnergyJ;
      const stem = `${baseProse} How much energy is wasted to the surroundings over the ${tS} s interval?`;
      const options = buildMcqOptions(
        wasted,
        "J",
        [
          {
            value: pIn - pUseful,
            rationale:
              "Computes wasted power in watts (P_in − P_out) and forgets to multiply by the time interval.",
          },
          {
            value: solved.usefulEnergyJ,
            rationale:
              "Calculates the useful mechanical work done Fvt cos θ instead of the wasted energy.",
          },
          {
            value: Math.abs(pIn - forceN * vMs) * tS,
            rationale:
              "Forgets to resolve cable tension by cos θ before subtracting from input power.",
          },
          {
            value: solved.totalInputEnergyJ,
            rationale:
              "Computes the total electrical energy supplied P_in t rather than wasted energy.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(wasted, "J");
      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "oblique-haulage-vector-power-efficiency",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [
          "efficiency",
          "efficiencyPercent",
          "usefulEnergyJ",
          "totalInputEnergyJ",
          "wastedEnergyJ",
        ],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "wasted thermal energy during oblique constant-velocity towing",
          [
            "stopping at wasted power without integrating over time duration",
            "omitting cosine factor in mechanical work done",
            "reporting useful work or total electrical input instead of dissipated loss",
          ],
          ["All non-propulsive electrical input is dissipated as heat"],
        ),
        targetQuantityKey: "wastedEnergyJ",
        stem,
        options,
        workedSolution: `Useful power P_out = Fv cos(${angle.deg}°) = ${pUseful} W. Wasted power = ${pIn} − ${pUseful} = ${pIn - pUseful} W. Over ${tS} s, E_wasted = (${pIn - pUseful})(${tS}) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Subtracts Fv cos ${angle.deg}° from ${pIn} W and multiplies by ${tS} s to get ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansUseful = formatPhysicsValue(solved.usefulEnergyJ, "J");
    const ansEff = formatPhysicsValue(solved.efficiencyPercent, "%");
    const ansWasted = formatPhysicsValue(solved.wastedEnergyJ, "J");

    return {
      id,
      conceptId: "vectors-equilibrium-moments",
      templateArchetype: "oblique-haulage-vector-power-efficiency",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: [
        "efficiency",
        "efficiencyPercent",
        "usefulEnergyJ",
        "totalInputEnergyJ",
        "wastedEnergyJ",
      ],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "resolved mechanical work, percentage efficiency, and energy dissipation",
        [
          "resolve cable force along travel velocity to find useful mechanical work done",
          "determine percentage efficiency of the electric haulage system",
          "calculate energy wasted to the surroundings",
        ],
        ["Speed and cable angle remain constant throughout the haul"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt:
            "Calculate the useful mechanical work done by the cable over the interval.",
          marks: 2,
          targetQuantityKey: "usefulEnergyJ",
          expectedAnswer: ansUseful,
          workingSteps: [
            `P_useful = F v cos ${angle.deg}° = ${forceN} × ${vMs} × ${angle.cos} = ${pUseful} W.`,
            `W_useful = P_useful × t = ${pUseful} × ${tS} = ${ansUseful}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Calculate the percentage efficiency of the winch system.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "efficiencyPercent",
          expectedAnswer: ansEff,
          workingSteps: [
            `E_in = P_in × t = ${pIn} × ${tS} = ${solved.totalInputEnergyJ} J.`,
            `η = (W_useful / E_in) × 100% = (${pUseful} / ${pIn}) × 100% = ${ansEff}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Determine the energy wasted to the surroundings during the interval.",
          marks: 1,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "wastedEnergyJ",
          expectedAnswer: ansWasted,
          workingSteps: [
            `E_wasted = E_in − W_useful = ${solved.totalInputEnergyJ} − ${solved.usefulEnergyJ} = ${ansWasted}.`,
          ],
        },
      ],
      workedSolution: `(a) P_useful = ${forceN}(${vMs}) cos ${angle.deg}° = ${pUseful} W, so W_useful = ${pUseful}(${tS}) = ${ansUseful}. (b) η = (${pUseful}/${pIn}) × 100% = ${ansEff}. (c) E_wasted = (${pIn} − ${pUseful})(${tS}) = ${ansWasted}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: `Resolves component F cos ${angle.deg}° and multiplies by v and t.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains ${ansUseful}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Divides useful output power (or energy) by electrical input.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains ${ansEff}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains E_wasted = ${ansWasted}.`,
          marks: 1,
        },
      ],
      totalMarks: 5,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 7: 1D SUVAT with km h⁻¹ Unit Conversion & Braking Deceleration
// ============================================================================
const ARCHETYPE_SUVAT_KMH: ArchetypeDefinition = {
  conceptId: "kinematics-suvat",
  templateArchetype: "rectilinear-suvat-kmh-braking-acceleration",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const uKmhChoices = [54, 72, 90, 108, 126, 144, 162];
    const decelChoices = [1.5, 2.0, 2.4, 2.5, 3.0, 3.5];
    const tChoices = [3.0, 3.5, 4.0, 4.5, 5.0];

    const uKmh = uKmhChoices[variantIndex % uKmhChoices.length];
    const uMs = uKmh / 3.6;
    const decel = decelChoices[(variantIndex + 1) % decelChoices.length];
    const tS = tChoices[(variantIndex * 2 + 1) % tChoices.length];
    const aMs2 = -decel;

    const scenarioSpec = {
      kind: "suvat-motion",
      uMs,
      aMs2,
      tS,
    };
    const solved = solvePureCalc(scenarioSpec);
    const syllabi = resolveSyllabusTags(
      "kinematics-suvat",
      format,
      variantIndex,
      "all-three",
    );

    const contexts = [
      `An intercity electric express train cruising along a straight level track at ${uKmh} km h⁻¹ applies regenerative brakes producing a uniform deceleration of ${decel} m s⁻² for ${tS} s.`,
      `During a wet-runway braking certification, an autonomous tow tractor travelling at ${uKmh} km h⁻¹ decelerates uniformly at ${decel} m s⁻² over an interval of ${tS} s.`,
      `A high-speed maglev test pod moving at ${uKmh} km h⁻¹ engages eddy-current brakes that provide a constant retardation of ${decel} m s⁻² for ${tS} s along a straight guideway.`,
      `Approaching a toll gantry on a straight test highway, an instrumented freight lorry slows from ${uKmh} km h⁻¹ at a steady deceleration rate of ${decel} m s⁻² for ${tS} s.`,
      `On a straight proving ground, a battery-electric prototype car travelling at ${uKmh} km h⁻¹ brakes with constant deceleration ${decel} m s⁻² over ${tS} s.`,
      `A light-rail commuter tram moving at ${uKmh} km h⁻¹ along a straight viaduct applies uniform service braking of ${decel} m s⁻² for ${tS} s.`,
      `During a telemetry run on a linear rocket-sled track, the carriage enters the braking zone at ${uKmh} km h⁻¹ and decelerates steadily at ${decel} m s⁻² for ${tS} s.`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "initialSpeedKmh", value: uKmh, unit: "km h⁻¹", source: "stem" },
      { name: "decelerationMs2", value: decel, unit: "m s⁻²", source: "stem" },
      { name: "durationS", value: tS, unit: "s", source: "stem" },
    ];

    if (format === "mcq") {
      if (variantIndex % 2 === 0) {
        const s = solved.displacementM;
        const stem = `${baseProse} What distance in metres does the vehicle cover during this ${tS} s braking interval?`;
        const options = buildMcqOptions(
          s,
          "m",
          [
            {
              value: uKmh * tS - 0.5 * decel * tS ** 2,
              rationale:
                "Mixes km h⁻¹ and m s⁻¹ by substituting the speed in km h⁻¹ directly into s = ut + ½at² without dividing by 3.6.",
            },
            {
              value: uMs * tS + 0.5 * decel * tS ** 2,
              rationale:
                "Converts speed to m s⁻¹ correctly but uses +½at² instead of −½|a|t² during braking deceleration.",
            },
            {
              value: uMs * tS - decel * tS ** 2,
              rationale:
                "Omits the factor of 1/2 in the ½at² term.",
            },
            {
              value: uKmh * 3.6 * tS - 0.5 * decel * tS ** 2,
              rationale:
                "Multiplies by 3.6 instead of dividing by 3.6 when converting km h⁻¹ to m s⁻¹.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(s, "m");
        return {
          id,
          conceptId: "kinematics-suvat",
          templateArchetype: "rectilinear-suvat-kmh-braking-acceleration",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: ["vMs", "displacementM", "averageVelocityMs"],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "braking displacement in metres from initial speed in kilometres per hour",
            [
              "substituting kilometres-per-hour value directly into metre-second SUVAT equation",
              "using positive acceleration sign during braking retardation",
              "multiplying rather than dividing when converting kilometres per hour to metres per second",
            ],
            ["Deceleration is uniform along a straight horizontal track"],
          ),
          targetQuantityKey: "displacementM",
          stem,
          options,
          workedSolution: `Convert initial speed: u = ${uKmh} / 3.6 = ${uMs} m s⁻¹. With a = −${decel} m s⁻², s = ut + ½at² = (${uMs})(${tS}) − 0.5(${decel})(${tS})² = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Converts ${uKmh} km h⁻¹ to ${uMs} m s⁻¹ and evaluates s = ut − ½|a|t² = ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const v = solved.vMs;
      const stem = `${baseProse} What is the speed of the vehicle in m s⁻¹ at the end of the ${tS} s braking interval?`;
      const options = buildMcqOptions(
        v,
        "m s⁻¹",
        [
          {
            value: uKmh - decel * tS,
            rationale:
              "Subtracts |a|t in m s⁻¹ directly from u in km h⁻¹ without converting units.",
          },
          {
            value: uMs + decel * tS,
            rationale:
              "Adds |a|t instead of subtracting |a|t during braking deceleration.",
          },
          {
            value: solved.averageVelocityMs,
            rationale:
              "Computes the average velocity ½(u + v) over the interval instead of the final velocity.",
          },
          {
            value: decel * tS,
            rationale:
              "Computes only the magnitude of speed reduction |Δv| rather than the remaining speed.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(v, "m s⁻¹");
      return {
        id,
        conceptId: "kinematics-suvat",
        templateArchetype: "rectilinear-suvat-kmh-braking-acceleration",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: ["vMs", "displacementM", "averageVelocityMs"],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "final speed in metres per second after uniform braking from kilometres per hour",
          [
            "subtracting metre-per-second velocity change directly from kilometres-per-hour initial speed",
            "reversing sign of braking deceleration",
            "reporting speed loss instead of final speed",
          ],
          ["Braking deceleration remains constant throughout the interval"],
        ),
        targetQuantityKey: "vMs",
        stem,
        options,
        workedSolution: `u = ${uKmh} / 3.6 = ${uMs} m s⁻¹. Final speed v = u + at = ${uMs} − (${decel})(${tS}) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Converts u to ${uMs} m s⁻¹ and obtains v = ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansV = formatPhysicsValue(solved.vMs, "m s⁻¹");
    const ansS = formatPhysicsValue(solved.displacementM, "m");
    const ansAvg = formatPhysicsValue(solved.averageVelocityMs, "m s⁻¹");

    return {
      id,
      conceptId: "kinematics-suvat",
      templateArchetype: "rectilinear-suvat-kmh-braking-acceleration",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: ["vMs", "displacementM", "averageVelocityMs"],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "one-dimensional braking kinematics with kilometres-per-hour conversion",
        [
          "convert initial velocity into metres per second and compute final speed",
          "determine braking distance covered during the interval",
          "calculate mean velocity over the braking phase",
        ],
        ["Braking force is constant along a straight level guideway"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt:
            "Convert the initial speed into m s⁻¹ and calculate the speed at the end of the braking interval.",
          marks: 2,
          targetQuantityKey: "vMs",
          expectedAnswer: ansV,
          workingSteps: [
            `u = ${uKmh} / 3.6 = ${uMs} m s⁻¹.`,
            `v = u + at = ${uMs} − (${decel})(${tS}) = ${ansV}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Calculate the distance travelled during the braking interval.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "displacementM",
          expectedAnswer: ansS,
          workingSteps: [
            `s = ut + ½at² = (${uMs})(${tS}) − 0.5(${decel})(${tS})² = ${ansS}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Determine the mean speed over this interval in m s⁻¹.",
          marks: 1,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "averageVelocityMs",
          expectedAnswer: ansAvg,
          workingSteps: [
            `v_mean = ½(u + v) = ${ansAvg}.`,
          ],
        },
      ],
      workedSolution: `(a) u = ${uKmh}/3.6 = ${uMs} m s⁻¹; v = ${uMs} − (${decel})(${tS}) = ${ansV}. (b) s = (${uMs})(${tS}) − 0.5(${decel})(${tS})² = ${ansS}. (c) v_mean = ${ansAvg}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: `Divides ${uKmh} by 3.6 to obtain u = ${uMs} m s⁻¹ and applies v = u − |a|t.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains v = ${ansV}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Uses s = ut − ½|a|t² or ½(u + v)t with SI units.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains s = ${ansS}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains v_mean = ${ansAvg}.`,
          marks: 1,
        },
      ],
      totalMarks: 5,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 8: Vertical Projection & Free-Fall SUVAT (IB g=9.8 vs AL/NCUK g=9.81)
// ============================================================================
const ARCHETYPE_VERTICAL_GRAVITY: ArchetypeDefinition = {
  conceptId: "kinematics-suvat",
  templateArchetype: "vertical-freefall-projection-gravity",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const isIb = variantIndex % 3 === 0;
    const g = isIb ? 9.8 : 9.81;
    const tagMode: SyllabusTagMode = isIb ? "ib-only" : "alevel-ncuk-only";

    const uChoices = [15.0, 18.0, 22.0, 25.0, 28.0, 32.0, 36.0, 40.0];
    const tChoices = [1.4, 1.8, 2.2, 2.6, 3.4, 4.2, 4.8];

    const uMs = uChoices[variantIndex % uChoices.length];
    let tS = tChoices[(variantIndex * 2 + 1) % tChoices.length];
    // Ensure vertical velocity and displacement are well away from 0
    if (Math.abs(uMs - g * tS) < 1.2 || Math.abs(uMs - 0.5 * g * tS) < 1.2) {
      tS += 0.7;
    }

    const scenarioSpec = {
      kind: "suvat-motion",
      uMs,
      aMs2: -g,
      tS,
    };
    const solved = solvePureCalc(scenarioSpec);
    const syllabi = resolveSyllabusTags(
      "kinematics-suvat",
      format,
      variantIndex,
      tagMode,
    );

    const contexts = [
      `Taking upward as positive and g = ${g} m s⁻² (air resistance negligible), a microgravity drop-tower catapult launches a sensor capsule vertically upward at ${uMs} m s⁻¹; telemetry is sampled at t = ${tS} s after launch.`,
      `An atmospheric lidar calibration sphere is projected vertically upward from a tower platform with initial velocity +${uMs} m s⁻¹. Neglecting drag and taking upward as positive with g = ${g} m s⁻², consider its state ${tS} s later.`,
      `From the rim of a deep research shaft, a geophysical probe is ejected vertically upward at +${uMs} m s⁻¹. Take upward to be positive, neglect air resistance, and use g = ${g} m s⁻² over an elapsed time of ${tS} s.`,
      `A coastal distress flare mortar fires a flare vertically upward at +${uMs} m s⁻¹. Defining upward as the positive axis with g = ${g} m s⁻² and negligible air drag, analyse the motion at t = ${tS} s.`,
      `In an evacuated vertical test tube, a steel ball is projected upward at +${uMs} m s⁻¹ (upward positive, g = ${g} m s⁻²). Photogates record the motion after ${tS} s.`,
      `A volcanic plume ejector launches an instrumented pebble vertically upward at +${uMs} m s⁻¹; neglect air resistance, take upward as positive, and use g = ${g} m s⁻² at elapsed time ${tS} s.`,
      `During a ballistic gravimeter check, a retroreflector is thrown vertically upward with initial velocity +${uMs} m s⁻¹ in vacuum (upward positive, g = ${g} m s⁻²) and tracked for ${tS} s.`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "gravityMs2", value: g, unit: "m s⁻²", source: "stem" },
      { name: "launchVelocityMs", value: uMs, unit: "m s⁻¹", source: "stem" },
      { name: "elapsedTimeS", value: tS, unit: "s", source: "stem" },
    ];

    if (format === "mcq") {
      if (variantIndex % 2 === 0) {
        const s = solved.displacementM;
        const stem = `${baseProse} What is the vertical displacement of the object relative to the launch point at t = ${tS} s?`;
        const options = buildMcqOptions(
          s,
          "m",
          [
            {
              value: uMs * tS + 0.5 * g * tS ** 2,
              rationale:
                "Uses +g instead of −g when initial velocity is upward, adding ½gt² to ut.",
            },
            {
              value: uMs * tS - g * tS ** 2,
              rationale:
                "Forgets the factor of 1/2 in the gravitational displacement term −½gt².",
            },
            {
              value: -0.5 * g * tS ** 2,
              rationale:
                "Treats the motion as release from rest and omits the upward initial-velocity term ut.",
            },
            {
              value: uMs ** 2 / (2 * g),
              rationale:
                "Calculates the maximum apex height u²/(2g) rather than the displacement at the specified time t.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(s, "m");
        return {
          id,
          conceptId: "kinematics-suvat",
          templateArchetype: "vertical-freefall-projection-gravity",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: ["vMs", "displacementM", "averageVelocityMs"],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "signed vertical displacement under uniform gravitational acceleration",
            [
              "assigning identical positive signs to upward launch velocity and downward gravity",
              "omitting the one-half factor on squared time",
              "computing apex height instead of displacement at elapsed time",
            ],
            ["Air resistance is negligible and gravitational field strength is uniform"],
          ),
          targetQuantityKey: "displacementM",
          stem,
          options,
          workedSolution: `With upward positive, u = +${uMs} m s⁻¹ and a = −${g} m s⁻². Vertical displacement s = ut + ½at² = (${uMs})(${tS}) − 0.5(${g})(${tS})² = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Uses s = ut − ½gt² with g = ${g} m s⁻² to obtain ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const v = solved.vMs;
      const stem = `${baseProse} What is the signed vertical velocity at t = ${tS} s?`;
      const options = buildMcqOptions(
        v,
        "m s⁻¹",
        [
          {
            value: uMs + g * tS,
            rationale:
              "Adds gt to u instead of subtracting gt when upward is defined as positive.",
          },
          {
            value: -v,
            rationale:
              "Reverses the algebraic sign of the vertical velocity vector.",
          },
          {
            value: solved.averageVelocityMs,
            rationale:
              "Computes the mean vertical velocity u − ½gt rather than the instantaneous velocity u − gt.",
          },
          {
            value: -g * tS,
            rationale:
              "Computes only the gravitational velocity change −gt and omits initial launch velocity +u.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(v, "m s⁻¹");
      return {
        id,
        conceptId: "kinematics-suvat",
        templateArchetype: "vertical-freefall-projection-gravity",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: ["vMs", "displacementM", "averageVelocityMs"],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "signed vertical velocity under downward gravitational acceleration",
          [
            "adding gravitational velocity change instead of subtracting",
            "reversing sign convention relative to upward axis",
            "halving gravity term by confusing mean and instantaneous velocity",
          ],
          ["Upward direction is positive and drag is negligible"],
        ),
        targetQuantityKey: "vMs",
        stem,
        options,
        workedSolution: `Using v = u + at with u = +${uMs} m s⁻¹ and a = −${g} m s⁻² gives v = ${uMs} − (${g})(${tS}) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates v = ${uMs} − (${g})(${tS}) = ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansV = formatPhysicsValue(solved.vMs, "m s⁻¹");
    const ansS = formatPhysicsValue(solved.displacementM, "m");
    const ansAvg = formatPhysicsValue(solved.averageVelocityMs, "m s⁻¹");

    return {
      id,
      conceptId: "kinematics-suvat",
      templateArchetype: "vertical-freefall-projection-gravity",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: ["vMs", "displacementM", "averageVelocityMs"],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "vertical projection kinematics with sign-sensitive velocity and displacement",
        [
          "compute signed vertical velocity at elapsed time",
          "determine signed vertical displacement from launch datum",
          "evaluate mean vertical velocity over the interval",
        ],
        ["Uniform gravitational field and negligible aerodynamic drag"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt:
            "Calculate the signed vertical velocity at the stated time.",
          marks: 2,
          targetQuantityKey: "vMs",
          expectedAnswer: ansV,
          workingSteps: [
            `v = u + at = ${uMs} − (${g})(${tS}) = ${ansV}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Calculate the vertical displacement relative to the launch point.",
          marks: 2,
          targetQuantityKey: "displacementM",
          expectedAnswer: ansS,
          workingSteps: [
            `s = ut + ½at² = (${uMs})(${tS}) − 0.5(${g})(${tS})² = ${ansS}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Determine the average vertical velocity over this time interval.",
          marks: 1,
          dependsOnPartIds: ["b"],
          targetQuantityKey: "averageVelocityMs",
          expectedAnswer: ansAvg,
          workingSteps: [
            `v_avg = s / t = ${ansAvg}.`,
          ],
        },
      ],
      workedSolution: `(a) v = ${uMs} − (${g})(${tS}) = ${ansV}. (b) s = (${uMs})(${tS}) − 0.5(${g})(${tS})² = ${ansS}. (c) v_avg = s / ${tS} = ${ansAvg}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: `Substitutes u = +${uMs} m s⁻¹ and a = −${g} m s⁻² into v = u + at.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains v = ${ansV}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Uses s = ut − ½gt² with consistent signs.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains s = ${ansS}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains v_avg = ${ansAvg}.`,
          marks: 1,
        },
      ],
      totalMarks: 5,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 9: Rebound Linear Momentum, Impulse & Average Impact Force
// ============================================================================
const ARCHETYPE_IMPULSE_REBOUND: ArchetypeDefinition = {
  conceptId: "linear-momentum-impulse",
  templateArchetype: "rebound-impact-impulse-average-force",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const massKgChoices = [0.06, 0.12, 0.15, 0.25, 0.4, 0.5, 0.8, 1.2, 1.5];
    const uChoices = [12, 15, 18, 20, 24, 28, 30, 32];
    const vRebChoices = [8, 9, 10, 12, 14, 16, 18, 20];
    const dtMsChoices = [4.0, 5.0, 8.0, 10.0, 12.5, 16.0, 20.0, 25.0];

    const massKg = massKgChoices[variantIndex % massKgChoices.length];
    const u = uChoices[(variantIndex + 1) % uChoices.length];
    let vReb = vRebChoices[(variantIndex * 2 + 3) % vRebChoices.length];
    if (vReb >= u) {
      vReb = Math.max(5, u - 6);
    }
    const dtMs = dtMsChoices[(variantIndex * 3 + 1) % dtMsChoices.length];
    const dtS = Number((dtMs * 1e-3).toPrecision(6));

    const scenarioSpec = {
      kind: "momentum-impulse",
      massKg,
      initialVelocityMs: u,
      finalVelocityMs: -vReb,
      contactTimeS: dtS,
    };
    const solved = solvePureCalc(scenarioSpec);
    const syllabi = resolveSyllabusTags(
      "linear-momentum-impulse",
      format,
      variantIndex,
      "all-three",
    );

    const contexts = [
      `In a sports-engineering impact canon test, a ball of mass ${massKg} kg strikes a rigid force plate normally at +${u} m s⁻¹ and rebounds straight back along the same line at speed ${vReb} m s⁻¹ (final velocity −${vReb} m s⁻¹) after a contact duration of ${dtMs} ms.`,
      `During an aerospace radome hail-impact simulation, an ice sphere of mass ${massKg} kg hits a flat target perpendicularly at +${u} m s⁻¹ and rebounds directly opposite at ${vReb} m s⁻¹ (v = −${vReb} m s⁻¹) with contact time ${dtMs} ms.`,
      `On a crash-attenuator sled track, a ${massKg} kg buffer module travelling at +${u} m s⁻¹ impacts an elastomeric stop for ${dtMs} ms and rebounds in the reverse direction at speed ${vReb} m s⁻¹.`,
      `A pneumatic forging tup of mass ${massKg} kg strikes a hardened anvil face at +${u} m s⁻¹ and rebounds upward at speed ${vReb} m s⁻¹ (opposite sign) following a ${dtMs} ms impact.`,
      `In a materials restitution bench, a ${massKg} kg alloy striker approaches a vertical wall at +${u} m s⁻¹, remains in contact for ${dtMs} ms, and rebounds normally at ${vReb} m s⁻¹.`,
      `A robotic assembly bumper stops and reverses a ${massKg} kg shuttle arriving at +${u} m s⁻¹ so that it rebounds at ${vReb} m s⁻¹ in the opposite direction after ${dtMs} ms of contact.`,
      `High-speed video on a Pelton-vane test rig shows a ${massKg} kg polymer slug striking a flat plate normally at +${u} m s⁻¹ and rebounding straight back at ${vReb} m s⁻¹ over a ${dtMs} ms contact interval.`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "massKg", value: massKg, unit: "kg", source: "stem" },
      { name: "initialSpeedMs", value: u, unit: "m s⁻¹", source: "stem" },
      { name: "reboundSpeedMs", value: vReb, unit: "m s⁻¹", source: "stem" },
      { name: "contactTimeMs", value: dtMs, unit: "ms", source: "stem" },
    ];

    if (format === "mcq") {
      if (variantIndex % 2 === 0) {
        const fMag = solved.averageForceMagnitudeN;
        const stem = `${baseProse} What is the magnitude of the average force exerted on the object during the ${dtMs} ms impact?`;
        const options = buildMcqOptions(
          fMag,
          "N",
          [
            {
              value: (massKg * Math.abs(u - vReb)) / dtS,
              rationale:
                "Subtracts speed magnitudes m(u − v_reb)/Δt instead of accounting for velocity reversal m(u + v_reb)/Δt.",
            },
            {
              value: fMag * 1e-3,
              rationale:
                "Divides by contact time in milliseconds without converting ms to seconds (off by 10³).",
            },
            {
              value: Math.abs(solved.impulseNs),
              rationale:
                "Calculates the impulse magnitude |Δp| in N s and forgets to divide by contact time Δt.",
            },
            {
              value: (massKg * u) / dtS,
              rationale:
                "Assumes the object comes to rest on impact and ignores the rebound momentum.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(fMag, "N");
        return {
          id,
          conceptId: "linear-momentum-impulse",
          templateArchetype: "rebound-impact-impulse-average-force",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "impulseNs",
            "averageForceN",
            "averageForceMagnitudeN",
            "kineticEnergyChangeJ",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "average impact force magnitude during normal rebound",
            [
              "subtracting scalar speeds instead of computing signed vector velocity change",
              "forgetting millisecond-to-second conversion on contact duration",
              "stopping at impulse magnitude without dividing by contact time",
            ],
            ["Gravitational impulse during brief millisecond impact is negligible"],
          ),
          targetQuantityKey: "averageForceMagnitudeN",
          stem,
          options,
          workedSolution: `Taking incoming velocity as +${u} m s⁻¹ and rebound velocity as −${vReb} m s⁻¹, |Δp| = ${massKg}(${u} + ${vReb}) = ${Math.abs(solved.impulseNs)} N s. With Δt = ${dtMs} × 10⁻³ = ${dtS} s, F_avg = |Δp| / Δt = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Computes |Δp| = m(u + v_reb) and divides by ${dtS} s to obtain ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const dEk = solved.kineticEnergyChangeJ;
      const stem = `${baseProse} What is the signed change in kinetic energy ΔE_k = E_k,f − E_k,i during the impact?`;
      const options = buildMcqOptions(
        dEk,
        "J",
        [
          {
            value: -dEk,
            rationale:
              "Computes positive energy lost (E_k,i − E_k,f) instead of the signed change E_k,f − E_k,i.",
          },
          {
            value: 0.5 * massKg * (vReb - u) ** 2,
            rationale:
              "Evaluates ½m(v − u)² instead of ½mv² − ½mu².",
          },
          {
            value: -0.5 * massKg * (u ** 2 + vReb ** 2),
            rationale:
              "Adds the two kinetic energies because the velocity reversed sign, forgetting v² is always positive.",
          },
          {
            value: 0.5 * massKg * vReb ** 2,
            rationale:
              "Calculates only the final rebound kinetic energy rather than ΔE_k.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(dEk, "J");
      return {
        id,
        conceptId: "linear-momentum-impulse",
        templateArchetype: "rebound-impact-impulse-average-force",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [
          "impulseNs",
          "averageForceN",
          "averageForceMagnitudeN",
          "kineticEnergyChangeJ",
        ],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "signed kinetic energy change across an inelastic rebound",
          [
            "reversing sign by subtracting final from initial kinetic energy",
            "squaring velocity difference instead of subtracting squared speeds",
            "adding kinetic energies due to negative rebound velocity",
          ],
          ["Rotational kinetic energy is negligible"],
        ),
        targetQuantityKey: "kineticEnergyChangeJ",
        stem,
        options,
        workedSolution: `ΔE_k = ½m(v² − u²) = 0.5(${massKg})((−${vReb})² − ${u}²) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates ½m(v² − u²) including negative sign to obtain ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansJ = formatPhysicsValue(solved.impulseNs, "N s");
    const ansF = formatPhysicsValue(solved.averageForceMagnitudeN, "N");
    const ansEk = formatPhysicsValue(solved.kineticEnergyChangeJ, "J");

    return {
      id,
      conceptId: "linear-momentum-impulse",
      templateArchetype: "rebound-impact-impulse-average-force",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: [
        "impulseNs",
        "averageForceN",
        "averageForceMagnitudeN",
        "kineticEnergyChangeJ",
      ],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "vector impulse, average contact force, and kinetic energy change in a normal rebound",
        [
          "evaluate signed impulse from initial and reversed rebound velocities",
          "convert contact duration to seconds to determine average force magnitude",
          "calculate signed change in translational kinetic energy",
        ],
        ["Motion is strictly collinear perpendicular to the impact surface"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt:
            "Taking the incoming direction as positive, calculate the signed impulse J delivered to the object.",
          marks: 2,
          targetQuantityKey: "impulseNs",
          expectedAnswer: ansJ,
          workingSteps: [
            `J = m(v − u) = ${massKg} × (−${vReb} − ${u}) = ${ansJ}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Calculate the magnitude of the average contact force during the impact.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "averageForceMagnitudeN",
          expectedAnswer: ansF,
          workingSteps: [
            `Convert Δt = ${dtMs} × 10⁻³ = ${dtS} s.`,
            `F_avg = |J| / Δt = ${Math.abs(solved.impulseNs)} / ${dtS} = ${ansF}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Determine the signed change in kinetic energy ΔE_k = E_k,f − E_k,i.",
          marks: 2,
          targetQuantityKey: "kineticEnergyChangeJ",
          expectedAnswer: ansEk,
          workingSteps: [
            `ΔE_k = ½m(v² − u²) = 0.5(${massKg})(${vReb}² − ${u}²) = ${ansEk}.`,
          ],
        },
      ],
      workedSolution: `(a) J = ${massKg}(−${vReb} − ${u}) = ${ansJ}. (b) F_avg = |J| / (${dtMs} × 10⁻³) = ${ansF}. (c) ΔE_k = 0.5(${massKg})(${vReb}² − ${u}²) = ${ansEk}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: "Accounts for opposite signs of u and v in Δp = m(v − u).",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains J = ${ansJ}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: `Divides |J| by contact time in seconds (${dtS} s).`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains F_avg = ${ansF}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "c",
          criterion: "Uses ½m(v² − u²).",
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains ΔE_k = ${ansEk}.`,
          marks: 1,
        },
      ],
      totalMarks: 6,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 10: Tractive Power P = Fv & Electric Drivetrain Efficiency
// ============================================================================
const ARCHETYPE_TRACTIVE_POWER: ArchetypeDefinition = {
  conceptId: "work-energy-power",
  templateArchetype: "tractive-power-fv-drivetrain-efficiency",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const speedKmhChoices = [36, 54, 72, 90, 108, 126];
    const dragNChoices = [600, 800, 1200, 1500, 1800, 2400, 3000, 4000];
    const effChoices = [0.75, 0.8, 0.84, 0.85, 0.88, 0.9];
    const tChoices = [25, 30, 40, 45, 50, 60, 80];

    const vKmh = speedKmhChoices[variantIndex % speedKmhChoices.length];
    const vMs = vKmh / 3.6;
    const dragN = dragNChoices[(variantIndex * 2 + 1) % dragNChoices.length];
    const pUseful = dragN * vMs;
    const effNom = effChoices[(variantIndex + 2) % effChoices.length];
    const pIn = Math.round(pUseful / effNom);
    const tS = tChoices[(variantIndex * 3 + 1) % tChoices.length];

    const scenarioSpec = {
      kind: "power-efficiency",
      inputPowerW: pIn,
      usefulPowerW: pUseful,
      durationS: tS,
    };
    const solved = solvePureCalc(scenarioSpec);
    const syllabi = resolveSyllabusTags(
      "work-energy-power",
      format,
      variantIndex,
      "all-three",
    );

    const contexts = [
      `An electric delivery truck cruises at a steady speed of ${vKmh} km h⁻¹ on a flat horizontal road against a total resistive drag force of ${dragN} N while its battery inverter supplies ${pIn} W for ${tS} s.`,
      `A battery-electric harbour ferry maintains constant speed ${vKmh} km h⁻¹ against hydrodynamic drag of ${dragN} N; its propulsion bus draws ${pIn} W continuously over ${tS} s.`,
      `On a level test oval, a solar-electric prototype cruiser travels steadily at ${vKmh} km h⁻¹ overcoming ${dragN} N of aerodynamic and rolling resistance while drawing ${pIn} W from its motor controller for ${tS} s.`,
      `An autonomous underground haulage shuttle moves along a horizontal drift at constant speed ${vKmh} km h⁻¹ against ${dragN} N of resistive force, consuming ${pIn} W electrically for ${tS} s.`,
      `A catenary-fed shunting locomotive pulls freight along level rails at constant speed ${vKmh} km h⁻¹ against ${dragN} N of track and air resistance while drawing ${pIn} W over ${tS} s.`,
      `During a steady-state dyno road-load run at ${vKmh} km h⁻¹, an electric drivetrain overcomes ${dragN} N of resistive force while drawing ${pIn} W of DC electrical power for ${tS} s.`,
      `An electric hydrofoil water-taxi cruises at constant velocity ${vKmh} km h⁻¹ against ${dragN} N of drag while its motor pack draws ${pIn} W for ${tS} s.`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "speedKmh", value: vKmh, unit: "km h⁻¹", source: "stem" },
      { name: "dragForceN", value: dragN, unit: "N", source: "stem" },
      { name: "inputPowerW", value: pIn, unit: "W", source: "stem" },
      { name: "durationS", value: tS, unit: "s", source: "stem" },
    ];

    if (format === "mcq") {
      if (variantIndex % 2 === 0) {
        const effPct = solved.efficiencyPercent;
        const stem = `${baseProse} What is the percentage efficiency of the propulsion drivetrain?`;
        const options = buildMcqOptions(
          effPct,
          "%",
          [
            {
              value: Math.min(360, ((dragN * vKmh) / pIn) * 100),
              rationale:
                "Multiplies drag force in N by speed in km h⁻¹ without dividing speed by 3.6 to obtain watts.",
            },
            {
              value: 100 - effPct,
              rationale:
                "Calculates the percentage of electrical power dissipated as heat rather than drivetrain efficiency.",
            },
            {
              value: ((dragN / vMs) / pIn) * 100,
              rationale:
                "Divides force by velocity (F/v) instead of multiplying P = Fv.",
            },
            {
              value: (pIn / pUseful) * 100,
              rationale:
                "Inverts the efficiency ratio as P_in / P_out.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(effPct, "%");
        return {
          id,
          conceptId: "work-energy-power",
          templateArchetype: "tractive-power-fv-drivetrain-efficiency",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "efficiency",
            "efficiencyPercent",
            "usefulEnergyJ",
            "totalInputEnergyJ",
            "wastedEnergyJ",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "drivetrain percentage efficiency from constant cruising speed and resistive drag",
            [
              "failing to convert kilometres per hour to metres per second in tractive power",
              "computing wasted loss percentage instead of useful efficiency",
              "inverting output and input powers in efficiency ratio",
            ],
            ["Zero net acceleration so tractive thrust equals resistive drag"],
          ),
          targetQuantityKey: "efficiencyPercent",
          stem,
          options,
          workedSolution: `At constant velocity, tractive force F = ${dragN} N and v = ${vKmh}/3.6 = ${vMs} m s⁻¹. Useful power P_out = Fv = ${dragN} × ${vMs} = ${pUseful} W. Efficiency η = (${pUseful}/${pIn}) × 100% = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Converts speed to ${vMs} m s⁻¹, computes P_out = Fv = ${pUseful} W, and obtains η = ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const wasted = solved.wastedEnergyJ;
      const stem = `${baseProse} How much thermal energy is wasted by the drivetrain during the ${tS} s interval?`;
      const options = buildMcqOptions(
        wasted,
        "J",
        [
          {
            value: pIn - pUseful,
            rationale:
              "Finds wasted power P_in − Fv in watts without multiplying by the duration in seconds.",
          },
          {
            value: solved.usefulEnergyJ,
            rationale:
              "Calculates useful mechanical work Fvt rather than wasted energy.",
          },
          {
            value: Math.abs(pIn - dragN * vKmh) * tS,
            rationale:
              "Uses speed in km h⁻¹ directly inside Fv without converting to m s⁻¹.",
          },
          {
            value: solved.totalInputEnergyJ,
            rationale:
              "Calculates total electrical input energy P_in t instead of wasted energy.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(wasted, "J");
      return {
        id,
        conceptId: "work-energy-power",
        templateArchetype: "tractive-power-fv-drivetrain-efficiency",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [
          "efficiency",
          "efficiencyPercent",
          "usefulEnergyJ",
          "totalInputEnergyJ",
          "wastedEnergyJ",
        ],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "thermal energy dissipated in constant-speed electric propulsion",
          [
            "reporting wasted power in watts rather than energy over time",
            "mixing kilometres per hour with metres per second in tractive power",
            "confusing useful propulsive work with dissipated heat",
          ],
          ["Speed and resistive drag remain constant"],
        ),
        targetQuantityKey: "wastedEnergyJ",
        stem,
        options,
        workedSolution: `v = ${vKmh}/3.6 = ${vMs} m s⁻¹, so P_out = Fv = ${pUseful} W. Wasted power = ${pIn} − ${pUseful} = ${pIn - pUseful} W; over ${tS} s, E_wasted = (${pIn - pUseful})(${tS}) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates (P_in − Fv)t in SI units to obtain ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansUseful = formatPhysicsValue(solved.usefulEnergyJ, "J");
    const ansEff = formatPhysicsValue(solved.efficiencyPercent, "%");
    const ansWasted = formatPhysicsValue(solved.wastedEnergyJ, "J");

    return {
      id,
      conceptId: "work-energy-power",
      templateArchetype: "tractive-power-fv-drivetrain-efficiency",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: [
        "efficiency",
        "efficiencyPercent",
        "usefulEnergyJ",
        "totalInputEnergyJ",
        "wastedEnergyJ",
      ],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "constant-velocity tractive work, drivetrain efficiency, and wasted energy",
        [
          "convert cruising speed to metres per second and compute useful propulsive work",
          "calculate percentage efficiency of the electric drivetrain",
          "determine thermal energy dissipated to the surroundings",
        ],
        ["Level road with zero change in kinetic or gravitational potential energy"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt:
            "Calculate the useful mechanical energy delivered against drag over the interval.",
          marks: 2,
          targetQuantityKey: "usefulEnergyJ",
          expectedAnswer: ansUseful,
          workingSteps: [
            `v = ${vKmh} / 3.6 = ${vMs} m s⁻¹; P_useful = Fv = ${dragN} × ${vMs} = ${pUseful} W.`,
            `E_useful = P_useful × t = ${pUseful} × ${tS} = ${ansUseful}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Determine the percentage efficiency of the drivetrain.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "efficiencyPercent",
          expectedAnswer: ansEff,
          workingSteps: [
            `η = (P_useful / P_in) × 100% = (${pUseful} / ${pIn}) × 100% = ${ansEff}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Calculate the energy wasted as heat during the interval.",
          marks: 1,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "wastedEnergyJ",
          expectedAnswer: ansWasted,
          workingSteps: [
            `E_wasted = P_in t − E_useful = ${solved.totalInputEnergyJ} − ${solved.usefulEnergyJ} = ${ansWasted}.`,
          ],
        },
      ],
      workedSolution: `(a) v = ${vMs} m s⁻¹, P_useful = ${pUseful} W, E_useful = ${ansUseful}. (b) η = (${pUseful}/${pIn}) × 100% = ${ansEff}. (c) E_wasted = ${ansWasted}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: `Converts speed to ${vMs} m s⁻¹ and uses E_useful = Fvt.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains ${ansUseful}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Divides useful mechanical power/energy by electrical input.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains ${ansEff}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains E_wasted = ${ansWasted}.`,
          marks: 1,
        },
      ],
      totalMarks: 5,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 11: Gravitational Hoist / Pump Power & Efficiency (IB 9.8 vs AL/NCUK 9.81)
// ============================================================================
const ARCHETYPE_HOIST_EFFICIENCY: ArchetypeDefinition = {
  conceptId: "work-energy-power",
  templateArchetype: "gravitational-hoist-pump-efficiency",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const isIb = variantIndex % 3 === 0;
    const g = isIb ? 9.8 : 9.81;
    const tagMode: SyllabusTagMode = isIb ? "ib-only" : "alevel-ncuk-only";

    const massChoices = [80, 120, 150, 200, 250, 300, 400, 500, 600];
    const heightChoices = [8, 10, 12, 15, 18, 20, 24, 30];
    const tChoices = [10, 12, 15, 16, 20, 24, 25, 30];
    const effChoices = [0.64, 0.68, 0.72, 0.75, 0.8, 0.85];

    const massKg = massChoices[variantIndex % massChoices.length];
    const heightM = heightChoices[(variantIndex * 2 + 1) % heightChoices.length];
    const tS = tChoices[(variantIndex + 3) % tChoices.length];
    const pUseful = Number(((massKg * g * heightM) / tS).toPrecision(8));
    const effNom = effChoices[(variantIndex * 2 + 2) % effChoices.length];
    const pIn = Math.round(pUseful / effNom);

    const scenarioSpec = {
      kind: "power-efficiency",
      inputPowerW: pIn,
      usefulPowerW: pUseful,
      durationS: tS,
    };
    const solved = solvePureCalc(scenarioSpec);
    const syllabi = resolveSyllabusTags(
      "work-energy-power",
      format,
      variantIndex,
      tagMode,
    );

    const contexts = [
      `Take g = ${g} m s⁻². A tower-crane hoist motor draws ${pIn} W from a three-phase supply while lifting a ${massKg} kg steel beam vertically at steady speed through ${heightM} m in ${tS} s.`,
      `Using g = ${g} m s⁻², a pumped-storage auxiliary pump consuming ${pIn} W raises ${massKg} kg of water vertically through a head of ${heightM} m in ${tS} s at constant flow speed.`,
      `A mine-shaft skip winch drawing ${pIn} W lifts an ore cage of mass ${massKg} kg at constant velocity through a vertical height of ${heightM} m in ${tS} s (take g = ${g} m s⁻²).`,
      `Take g = ${g} m s⁻². A shipyard gantry hoist supplied with ${pIn} W of electrical power raises a ${massKg} kg marine engine block steadily through ${heightM} m over ${tS} s.`,
      `In a grain-silo elevator test (g = ${g} m s⁻²), an electric drive consuming ${pIn} W lifts a ${massKg} kg batch vertically through ${heightM} m at constant speed in ${tS} s.`,
      `A borehole submersible pump drawing ${pIn} W raises ${massKg} kg of brine through a vertical pipe of height ${heightM} m in ${tS} s at steady speed; take g = ${g} m s⁻².`,
      `Take g = ${g} m s⁻². An automated warehouse vertical lift drawing ${pIn} W elevates a ${massKg} kg pallet at constant speed through ${heightM} m in ${tS} s.`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "gravityMs2", value: g, unit: "m s⁻²", source: "stem" },
      { name: "inputPowerW", value: pIn, unit: "W", source: "stem" },
      { name: "massKg", value: massKg, unit: "kg", source: "stem" },
      { name: "heightM", value: heightM, unit: "m", source: "stem" },
      { name: "durationS", value: tS, unit: "s", source: "stem" },
    ];

    if (format === "mcq") {
      if (variantIndex % 2 === 0) {
        const effPct = solved.efficiencyPercent;
        const stem = `${baseProse} What is the percentage efficiency of the lifting system?`;
        const options = buildMcqOptions(
          effPct,
          "%",
          [
            {
              value: ((massKg * heightM) / (pIn * tS)) * 100,
              rationale:
                "Omits gravitational field strength g when computing gravitational potential energy mgh.",
            },
            {
              value: 100 - effPct,
              rationale:
                "Calculates the percentage of input energy wasted rather than the useful efficiency.",
            },
            {
              value: ((massKg * g * heightM) / pIn) * 100,
              rationale:
                "Divides useful energy mgh in joules directly by input power P_in in watts without dividing by time t.",
            },
            {
              value: (pIn / pUseful) * 100,
              rationale:
                "Inverts the efficiency ratio as P_in / P_useful.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(effPct, "%");
        return {
          id,
          conceptId: "work-energy-power",
          templateArchetype: "gravitational-hoist-pump-efficiency",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "efficiency",
            "efficiencyPercent",
            "usefulEnergyJ",
            "totalInputEnergyJ",
            "wastedEnergyJ",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "percentage efficiency of steady vertical gravitational lifting",
            [
              "omitting gravitational field strength when computing potential energy gain",
              "comparing energy in joules directly against power in watts without time factor",
              "reporting wasted energy percentage instead of efficiency",
            ],
            ["Lift occurs at constant vertical speed so kinetic energy change is zero"],
          ),
          targetQuantityKey: "efficiencyPercent",
          stem,
          options,
          workedSolution: `Useful gravitational potential energy ΔE_p = mgh = ${massKg} × ${g} × ${heightM} = ${formatPhysicsValue(solved.usefulEnergyJ, "J")}. Input electrical energy E_in = ${pIn} × ${tS} = ${solved.totalInputEnergyJ} J. Efficiency η = (ΔE_p / E_in) × 100% = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Evaluates mgh / (P_in t) × 100% with g = ${g} m s⁻² to obtain ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const wasted = solved.wastedEnergyJ;
      const stem = `${baseProse} How much energy is wasted during the ${tS} s lift?`;
      const options = buildMcqOptions(
        wasted,
        "J",
        [
          {
            value: solved.usefulEnergyJ,
            rationale:
              "Calculates the gravitational potential energy gained mgh instead of wasted energy.",
          },
          {
            value: pIn - pUseful,
            rationale:
              "Calculates wasted power in watts without multiplying by duration t.",
          },
          {
            value: Math.abs(pIn * tS - massKg * heightM),
            rationale:
              "Forgets to multiply mass and height by g when subtracting useful work from P_in t.",
          },
          {
            value: solved.totalInputEnergyJ,
            rationale:
              "Computes total electrical input energy P_in t instead of wasted energy.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(wasted, "J");
      return {
        id,
        conceptId: "work-energy-power",
        templateArchetype: "gravitational-hoist-pump-efficiency",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [
          "efficiency",
          "efficiencyPercent",
          "usefulEnergyJ",
          "totalInputEnergyJ",
          "wastedEnergyJ",
        ],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "dissipated energy during steady gravitational hoisting",
          [
            "confusing gravitational potential energy gain with wasted energy",
            "stopping at wasted power without multiplying by duration",
            "omitting gravitational field strength in mgh",
          ],
          ["Load rises at constant speed"],
        ),
        targetQuantityKey: "wastedEnergyJ",
        stem,
        options,
        workedSolution: `E_in = ${pIn} × ${tS} = ${solved.totalInputEnergyJ} J and ΔE_p = ${massKg} × ${g} × ${heightM} = ${formatPhysicsValue(solved.usefulEnergyJ, "J")}. Wasted energy = E_in − ΔE_p = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Subtracts mgh from P_in t to obtain ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansEp = formatPhysicsValue(solved.usefulEnergyJ, "J");
    const ansEff = formatPhysicsValue(solved.efficiencyPercent, "%");
    const ansWasted = formatPhysicsValue(solved.wastedEnergyJ, "J");

    return {
      id,
      conceptId: "work-energy-power",
      templateArchetype: "gravitational-hoist-pump-efficiency",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: [
        "efficiency",
        "efficiencyPercent",
        "usefulEnergyJ",
        "totalInputEnergyJ",
        "wastedEnergyJ",
      ],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "gravitational potential energy gain, hoist efficiency, and energy loss",
        [
          "calculate gravitational potential energy gained by the lifted mass",
          "determine percentage efficiency from total electrical input energy",
          "compute energy dissipated to the surroundings",
        ],
        ["Vertical ascent speed is steady"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt:
            "Calculate the gravitational potential energy gained by the load.",
          marks: 2,
          targetQuantityKey: "usefulEnergyJ",
          expectedAnswer: ansEp,
          workingSteps: [
            `ΔE_p = mgh = ${massKg} × ${g} × ${heightM} = ${ansEp}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Calculate the percentage efficiency of the hoisting system.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "efficiencyPercent",
          expectedAnswer: ansEff,
          workingSteps: [
            `E_in = P_in t = ${pIn} × ${tS} = ${solved.totalInputEnergyJ} J.`,
            `η = (ΔE_p / E_in) × 100% = ${ansEff}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Determine the energy wasted during the lift.",
          marks: 1,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "wastedEnergyJ",
          expectedAnswer: ansWasted,
          workingSteps: [
            `E_wasted = E_in − ΔE_p = ${ansWasted}.`,
          ],
        },
      ],
      workedSolution: `(a) ΔE_p = ${massKg}(${g})(${heightM}) = ${ansEp}. (b) E_in = ${pIn}(${tS}) = ${solved.totalInputEnergyJ} J, so η = ${ansEff}. (c) E_wasted = ${ansWasted}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: `Uses ΔE_p = mgh with g = ${g} m s⁻².`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains ${ansEp}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Divides ΔE_p by P_in t and multiplies by 100%.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains ${ansEff}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains E_wasted = ${ansWasted}.`,
          marks: 1,
        },
      ],
      totalMarks: 5,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 12: Hydrostatic Gauge Pressure ΔP = ρgh & Uncertainty (IB 9.8 vs AL/NCUK 9.81)
// ============================================================================
const ARCHETYPE_HYDROSTATIC_PRESSURE: ArchetypeDefinition = {
  conceptId: "fluid-drag-buoyancy",
  templateArchetype: "hydrostatic-depth-pressure-uncertainty",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const isIb = variantIndex % 3 === 0;
    const g = isIb ? 9.8 : 9.81;
    const tagMode: SyllabusTagMode = isIb ? "ib-only" : "alevel-ncuk-only";

    const rhoChoices = [800, 900, 1000, 1020, 1100, 1200, 1250];
    const dRhoChoices = [10, 12, 15, 20, 25];
    const hChoices = [6.0, 8.5, 12.0, 15.0, 18.0, 24.0, 32.0, 45.0, 60.0];
    const dhChoices = [0.15, 0.2, 0.3, 0.4, 0.5, 0.8];

    const rho = rhoChoices[variantIndex % rhoChoices.length];
    const dRho = dRhoChoices[(variantIndex + 1) % dRhoChoices.length];
    const h = hChoices[(variantIndex * 2 + 1) % hChoices.length];
    const dh = dhChoices[(variantIndex * 3 + 2) % dhChoices.length];

    const specificWeight = Number((rho * g).toPrecision(10));
    const dSpecificWeight = Number((dRho * g).toPrecision(10));

    const scenarioSpec = {
      kind: "uncertainty-power-product",
      aValue: specificWeight,
      aAbsUnc: dSpecificWeight,
      aPower: 1,
      bValue: h,
      bAbsUnc: dh,
      bPower: 1,
    };
    const solved = solvePureCalc(scenarioSpec);
    const syllabi = resolveSyllabusTags(
      "fluid-drag-buoyancy",
      format,
      variantIndex,
      tagMode,
    );

    const contexts = [
      `Take g = ${g} N kg⁻¹ (exact). An autonomous underwater vehicle hovers at depth h = ${h} m ± ${dh} m in water of measured density ρ = ${rho} kg m⁻³ ± ${dRho} kg m⁻³.`,
      `In a chemical-process storage column (g = ${g} N kg⁻¹ exact), a diaphragm gauge sits at depth h = ${h} m ± ${dh} m below the free surface of a liquid of density ρ = ${rho} kg m⁻³ ± ${dRho} kg m⁻³.`,
      `A hydroelectric reservoir piezometer tube measures head depth h = ${h} m ± ${dh} m in fluid of density ρ = ${rho} kg m⁻³ ± ${dRho} kg m⁻³; take g = ${g} N kg⁻¹ as exact.`,
      `During a sub-glacial lake borehole survey (exact g = ${g} N kg⁻¹), a pressure sonde is lowered to depth h = ${h} m ± ${dh} m through liquid of density ρ = ${rho} kg m⁻³ ± ${dRho} kg m⁻³.`,
      `An offshore riser column holds drilling fluid of density ρ = ${rho} kg m⁻³ ± ${dRho} kg m⁻³ to vertical height h = ${h} m ± ${dh} m; take g = ${g} N kg⁻¹ (negligible uncertainty).`,
      `In a desalination feed tower (take exact g = ${g} N kg⁻¹), brine of density ρ = ${rho} kg m⁻³ ± ${dRho} kg m⁻³ stands at depth h = ${h} m ± ${dh} m above the bottom port.`,
      `An oceanographic CTD profiler records depth h = ${h} m ± ${dh} m in a stratified layer of mean density ρ = ${rho} kg m⁻³ ± ${dRho} kg m⁻³ (take exact g = ${g} N kg⁻¹).`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "gravityNkg", value: g, unit: "N kg⁻¹", source: "stem" },
      { name: "depthM", value: h, unit: "m", source: "stem" },
      { name: "depthUncM", value: dh, unit: "m", source: "stem" },
      { name: "densityKgm3", value: rho, unit: "kg m⁻³", source: "stem" },
      { name: "densityUncKgm3", value: dRho, unit: "kg m⁻³", source: "stem" },
    ];

    if (format === "mcq") {
      if (variantIndex % 2 === 0) {
        const p = solved.resultValue;
        const stem = `${baseProse} What is the hydrostatic gauge pressure p = ρgh at this depth in pascals?`;
        const options = buildMcqOptions(
          p,
          "Pa",
          [
            {
              value: rho * h,
              rationale:
                "Computes ρh and omits gravitational field strength g.",
            },
            {
              value: p * 1e-3,
              rationale:
                "Reports the numerical value in kilopascals while labelling the unit as pascals.",
            },
            {
              value: (rho * g) / h,
              rationale:
                "Divides ρg by depth h instead of multiplying ρgh.",
            },
            {
              value: rho * g * h ** 2,
              rationale:
                "Squares the depth h as if integrating hydrostatic force on a vertical wall.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(p, "Pa");
        return {
          id,
          conceptId: "fluid-drag-buoyancy",
          templateArchetype: "hydrostatic-depth-pressure-uncertainty",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "resultValue",
            "fractionalUncertainty",
            "percentageUncertainty",
            "absoluteUncertainty",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "hydrostatic gauge pressure at depth in pascals",
            [
              "omitting gravitational field strength from hydrostatic product",
              "confusing kilopascal magnitude with pascals",
              "dividing specific weight by depth instead of multiplying",
            ],
            ["Fluid is incompressible and gauge pressure excludes atmospheric pressure"],
          ),
          targetQuantityKey: "resultValue",
          stem,
          options,
          workedSolution: `Hydrostatic gauge pressure p = ρgh = ${rho} × ${g} × ${h} = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Evaluates p = ρgh = ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const absP = solved.absoluteUncertainty;
      const fracDiff = Math.abs(dRho / rho - dh / h);
      const stem = `${baseProse} What is the absolute uncertainty Δp in the hydrostatic gauge pressure in pascals?`;
      const options = buildMcqOptions(
        absP,
        "Pa",
        [
          {
            value: solved.resultValue * fracDiff,
            rationale:
              "Subtracts the fractional uncertainties |Δρ/ρ − Δh/h| instead of adding them.",
          },
          {
            value: dRho * g * dh,
            rationale:
              "Multiplies absolute uncertainties Δρ × g × Δh directly instead of adding fractional uncertainties.",
          },
          {
            value: rho * h * (dRho / rho + dh / h),
            rationale:
              "Propagates fractional uncertainties correctly but forgets the factor of g in p = ρgh.",
          },
          {
            value: solved.percentageUncertainty,
            rationale:
              "Reports the percentage uncertainty figure instead of the absolute uncertainty in pascals.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(absP, "Pa");
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "hydrostatic-depth-pressure-uncertainty",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [
          "resultValue",
          "fractionalUncertainty",
          "percentageUncertainty",
          "absoluteUncertainty",
        ],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "absolute uncertainty in hydrostatic gauge pressure",
          [
            "subtracting density and depth fractional uncertainties",
            "taking product of raw absolute uncertainties",
            "omitting gravitational field strength when scaling fractional uncertainty",
          ],
          ["Gravitational field strength has negligible uncertainty"],
        ),
        targetQuantityKey: "absoluteUncertainty",
        stem,
        options,
        workedSolution: `Nominal gauge pressure p = ρgh = ${formatPhysicsValue(solved.resultValue, "Pa")}. Fractional uncertainty Δp/p = Δρ/ρ + Δh/h = ${dRho}/${rho} + ${dh}/${h} = ${formatPhysicsValue(solved.fractionalUncertainty)}. Hence Δp = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes p(Δρ/ρ + Δh/h) to obtain Δp = ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansP = formatPhysicsValue(solved.resultValue, "Pa");
    const ansPct = formatPhysicsValue(solved.percentageUncertainty, "%");
    const ansAbs = formatPhysicsValue(solved.absoluteUncertainty, "Pa");

    return {
      id,
      conceptId: "fluid-drag-buoyancy",
      templateArchetype: "hydrostatic-depth-pressure-uncertainty",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: [
        "resultValue",
        "fractionalUncertainty",
        "percentageUncertainty",
        "absoluteUncertainty",
      ],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "hydrostatic gauge pressure and propagated product uncertainty",
        [
          "compute hydrostatic gauge pressure in pascals",
          "determine percentage uncertainty from density and depth",
          "calculate absolute gauge pressure uncertainty",
        ],
        ["Liquid density is uniform over the column"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt:
            "Calculate the hydrostatic gauge pressure p at depth h in pascals.",
          marks: 2,
          targetQuantityKey: "resultValue",
          expectedAnswer: ansP,
          workingSteps: [
            `p = ρgh = ${rho} × ${g} × ${h} = ${ansP}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Calculate the percentage uncertainty in p.",
          marks: 2,
          targetQuantityKey: "percentageUncertainty",
          expectedAnswer: ansPct,
          workingSteps: [
            `%Δp = (%Δρ) + (%Δh) = (${dRho}/${rho} + ${dh}/${h}) × 100% = ${ansPct}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Hence state the absolute uncertainty Δp in pascals.",
          marks: 1,
          dependsOnPartIds: ["a", "b"],
          targetQuantityKey: "absoluteUncertainty",
          expectedAnswer: ansAbs,
          workingSteps: [
            `Δp = p × (%Δp / 100%) = ${ansAbs}.`,
          ],
        },
      ],
      workedSolution: `(a) p = ${rho}(${g})(${h}) = ${ansP}. (b) %Δp = (${dRho}/${rho} + ${dh}/${h}) × 100% = ${ansPct}. (c) Δp = ${ansAbs}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: `Substitutes into p = ρgh with g = ${g} N kg⁻¹.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains p = ${ansP}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Adds percentage uncertainties in ρ and h.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains ${ansPct}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains Δp = ${ansAbs}.`,
          marks: 1,
        },
      ],
      totalMarks: 5,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 13: Young Modulus E = σ / ε (A-Level & NCUK ONLY — NEVER IB 2025!)
// ============================================================================
const ARCHETYPE_YOUNG_MODULUS: ArchetypeDefinition = {
  conceptId: "elasticity-young-modulus",
  templateArchetype: "wire-tensile-stress-strain-young-modulus",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const cases = [
      { forceN: 90, areaMm2: 0.75, lengthM: 2.0, extMm: 1.2, pctS: 0.025, pctE: 0.03 },
      { forceN: 120, areaMm2: 0.8, lengthM: 2.5, extMm: 1.875, pctS: 0.02, pctE: 0.04 },
      { forceN: 144, areaMm2: 1.2, lengthM: 3.0, extMm: 1.8, pctS: 0.03, pctE: 0.025 },
      { forceN: 168, areaMm2: 1.4, lengthM: 2.4, extMm: 2.4, pctS: 0.025, pctE: 0.02 },
      { forceN: 180, areaMm2: 1.5, lengthM: 2.0, extMm: 1.5, pctS: 0.02, pctE: 0.03 },
      { forceN: 210, areaMm2: 1.75, lengthM: 2.8, extMm: 2.1, pctS: 0.03, pctE: 0.035 },
      { forceN: 135, areaMm2: 0.9, lengthM: 1.8, extMm: 1.35, pctS: 0.02, pctE: 0.025 },
      { forceN: 192, areaMm2: 1.6, lengthM: 3.2, extMm: 2.56, pctS: 0.025, pctE: 0.03 },
      { forceN: 108, areaMm2: 1.2, lengthM: 2.0, extMm: 1.8, pctS: 0.035, pctE: 0.025 },
      { forceN: 225, areaMm2: 1.5, lengthM: 2.5, extMm: 1.875, pctS: 0.02, pctE: 0.02 },
    ] as const;

    const c = cases[variantIndex % cases.length];
    const scale = 1 + (variantIndex % 3) * 0.2;
    const forceN = Number((c.forceN * scale).toPrecision(4));
    const sigmaPa = Number(((forceN / (c.areaMm2 * 1e-6))).toPrecision(6));
    const dSigmaPa = Number((sigmaPa * c.pctS).toPrecision(5));
    const strain = Number(((c.extMm * 1e-3) / c.lengthM).toPrecision(6));
    const dStrain = Number((strain * c.pctE).toPrecision(5));

    const scenarioSpec = {
      kind: "uncertainty-power-product",
      aValue: sigmaPa,
      aAbsUnc: dSigmaPa,
      aPower: 1,
      bValue: strain,
      bAbsUnc: dStrain,
      bPower: -1,
    };
    const solved = solvePureCalc(scenarioSpec);
    // STRICTLY A-Level & NCUK ONLY — NEVER IB 2025!
    const syllabi = resolveSyllabusTags(
      "elasticity-young-modulus",
      format,
      variantIndex,
      "alevel-ncuk-only",
    );

    const pctSPerc = Number((c.pctS * 100).toPrecision(3));
    const pctEPerc = Number((c.pctE * 100).toPrecision(3));

    const contexts = [
      `In a Searle's-apparatus wire practical below the limit of proportionality, a wire of original length ${c.lengthM} m and cross-sectional area ${c.areaMm2} mm² extends by ${c.extMm} mm under tensile load ${forceN} N; tensile stress has uncertainty ±${pctSPerc}% and tensile strain has uncertainty ±${pctEPerc}%.`,
      `An overhead railway phosphor-bronze contact wire sample of length ${c.lengthM} m and area ${c.areaMm2} mm² stretches elastically by ${c.extMm} mm when loaded with ${forceN} N (uncertainties: ±${pctSPerc}% in stress, ±${pctEPerc}% in strain).`,
      `During a biomedical materials test, a nickel-titanium alloy wire of gauge length ${c.lengthM} m and cross-section ${c.areaMm2} mm² elongates by ${c.extMm} mm under axial force ${forceN} N, with ±${pctSPerc}% stress uncertainty and ±${pctEPerc}% strain uncertainty.`,
      `A structural tie-wire specimen of unstretched length ${c.lengthM} m and uniform area ${c.areaMm2} mm² records an elastic extension of ${c.extMm} mm under tension ${forceN} N; stress and strain carry uncertainties of ±${pctSPerc}% and ±${pctEPerc}%.`,
      `On an acoustic string tensile bench, a brass wire of length ${c.lengthM} m and cross-sectional area ${c.areaMm2} mm² extends elastically by ${c.extMm} mm under a load of ${forceN} N (stress ±${pctSPerc}%, strain ±${pctEPerc}%).`,
      `Quality control on an aerospace alloy filament (original length ${c.lengthM} m, area ${c.areaMm2} mm²) measures an elastic extension of ${c.extMm} mm at ${forceN} N load, with ±${pctSPerc}% uncertainty in stress and ±${pctEPerc}% in strain.`,
      `In a materials testing machine, a metallic wire of length ${c.lengthM} m and cross-section ${c.areaMm2} mm² undergoes elastic extension ${c.extMm} mm under ${forceN} N tension (uncertainties ±${pctSPerc}% in stress and ±${pctEPerc}% in strain).`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "lengthM", value: c.lengthM, unit: "m", source: "stem" },
      { name: "areaMm2", value: c.areaMm2, unit: "mm²", source: "stem" },
      { name: "extensionMm", value: c.extMm, unit: "mm", source: "stem" },
      { name: "forceN", value: forceN, unit: "N", source: "stem" },
      { name: "stressUncPct", value: pctSPerc, unit: "%", source: "stem" },
      { name: "strainUncPct", value: pctEPerc, unit: "%", source: "stem" },
    ];

    if (format === "mcq") {
      if (variantIndex % 2 === 0) {
        const ym = solved.resultValue;
        const stem = `${baseProse} What is the Young modulus E of the wire in pascals?`;
        const options = buildMcqOptions(
          ym,
          "Pa",
          [
            {
              value: ym * 1e-3,
              rationale:
                "Converts mm² to m² using 10⁻³ instead of (10⁻³)² = 10⁻⁶, underestimating stress and Young modulus by 10³.",
            },
            {
              value: ym * 1e-6,
              rationale:
                "Forgets both mm² → 10⁻⁶ m² and mm → 10⁻³ m unit prefix powers properly.",
            },
            {
              value: sigmaPa * strain,
              rationale:
                "Multiplies tensile stress by tensile strain (σ × ε) instead of dividing σ / ε.",
            },
            {
              value: (forceN * c.extMm * 1e-3) / (c.areaMm2 * 1e-6 * c.lengthM),
              rationale:
                "Inverts strain by using Fe / (AL) instead of FL / (Ae).",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(ym, "Pa");
        return {
          id,
          conceptId: "elasticity-young-modulus",
          templateArchetype: "wire-tensile-stress-strain-young-modulus",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "resultValue",
            "fractionalUncertainty",
            "percentageUncertainty",
            "absoluteUncertainty",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "Young modulus of a tensile wire from stress and strain in SI units",
            [
              "converting square millimetres with linear milli factor instead of squared factor",
              "multiplying stress and strain rather than dividing",
              "inverting original length and extension in the strain ratio",
            ],
            ["Deformation is purely elastic within Hooke's-law proportionality"],
          ),
          targetQuantityKey: "resultValue",
          stem,
          options,
          workedSolution: `Tensile stress σ = F / A = ${forceN} / (${c.areaMm2} × 10⁻⁶) = ${formatPhysicsValue(sigmaPa, "Pa")}. Tensile strain ε = ΔL / L = (${c.extMm} × 10⁻³) / ${c.lengthM} = ${formatPhysicsValue(strain)}. Young modulus E = σ / ε = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Evaluates σ = F/A and ε = ΔL/L in SI units to obtain E = ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const absE = solved.absoluteUncertainty;
      const stem = `${baseProse} What is the absolute uncertainty ΔE in the Young modulus in pascals?`;
      const options = buildMcqOptions(
        absE,
        "Pa",
        [
          {
            value: solved.resultValue * Math.abs(c.pctS - c.pctE),
            rationale:
              "Subtracts percentage uncertainties |%Δσ − %Δε| in the quotient E = σ / ε.",
          },
          {
            value: absE * 1e-3,
            rationale:
              "Uses 10⁻³ m² instead of 10⁻⁶ m² when converting area from mm² to m².",
          },
          {
            value: solved.resultValue * (c.pctS * c.pctE * 100),
            rationale:
              "Multiplies percentage uncertainties instead of adding fractional uncertainties.",
          },
          {
            value: solved.resultValue * c.pctS,
            rationale:
              "Includes only the stress uncertainty and ignores strain uncertainty.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(absE, "Pa");
      return {
        id,
        conceptId: "elasticity-young-modulus",
        templateArchetype: "wire-tensile-stress-strain-young-modulus",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [
          "resultValue",
          "fractionalUncertainty",
          "percentageUncertainty",
          "absoluteUncertainty",
        ],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "absolute uncertainty in Young modulus from stress and strain tolerances",
          [
            "subtracting stress and strain uncertainties in quotient",
            "failing to square millimetre prefix on cross-sectional area",
            "multiplying percentage uncertainties instead of summing",
          ],
          ["Linear elastic behaviour holds"],
        ),
        targetQuantityKey: "absoluteUncertainty",
        stem,
        options,
        workedSolution: `E = σ / ε = ${formatPhysicsValue(solved.resultValue, "Pa")}. Total percentage uncertainty %ΔE = ${pctSPerc}% + ${pctEPerc}% = ${formatPhysicsValue(solved.percentageUncertainty, "%")}. Absolute uncertainty ΔE = E × (%ΔE / 100%) = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes E and multiplies by (${pctSPerc}% + ${pctEPerc}%) to obtain ΔE = ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansE = formatPhysicsValue(solved.resultValue, "Pa");
    const ansPct = formatPhysicsValue(solved.percentageUncertainty, "%");
    const ansAbs = formatPhysicsValue(solved.absoluteUncertainty, "Pa");

    return {
      id,
      conceptId: "elasticity-young-modulus",
      templateArchetype: "wire-tensile-stress-strain-young-modulus",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: [
        "resultValue",
        "fractionalUncertainty",
        "percentageUncertainty",
        "absoluteUncertainty",
      ],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "tensile stress, strain, Young modulus, and uncertainty propagation",
        [
          "convert area and extension to SI units to calculate Young modulus",
          "combine stress and strain uncertainties to obtain percentage uncertainty",
          "determine absolute uncertainty in Young modulus",
        ],
        ["Wire cross-section is uniform below elastic limit"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt:
            "Calculate the Young modulus E of the wire in pascals.",
          marks: 3,
          targetQuantityKey: "resultValue",
          expectedAnswer: ansE,
          workingSteps: [
            `σ = F / A = ${forceN} / (${c.areaMm2} × 10⁻⁶) = ${formatPhysicsValue(sigmaPa, "Pa")}.`,
            `ε = ΔL / L = (${c.extMm} × 10⁻³) / ${c.lengthM} = ${formatPhysicsValue(strain)}; E = σ / ε = ${ansE}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "State the combined percentage uncertainty in E.",
          marks: 1,
          targetQuantityKey: "percentageUncertainty",
          expectedAnswer: ansPct,
          workingSteps: [
            `%ΔE = %Δσ + %Δε = ${pctSPerc}% + ${pctEPerc}% = ${ansPct}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Calculate the absolute uncertainty ΔE in pascals.",
          marks: 1,
          dependsOnPartIds: ["a", "b"],
          targetQuantityKey: "absoluteUncertainty",
          expectedAnswer: ansAbs,
          workingSteps: [
            `ΔE = E × (%ΔE / 100%) = ${ansAbs}.`,
          ],
        },
      ],
      workedSolution: `(a) σ = ${formatPhysicsValue(sigmaPa, "Pa")}, ε = ${formatPhysicsValue(strain)}, so E = σ/ε = ${ansE}. (b) %ΔE = ${pctSPerc}% + ${pctEPerc}% = ${ansPct}. (c) ΔE = ${ansAbs}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: "Converts area to m² (× 10⁻⁶) and extension to m (× 10⁻³).",
          marks: 1,
        },
        {
          code: "M1",
          partId: "a",
          criterion: "Applies E = FL / (A ΔL) = σ / ε.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains E = ${ansE}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Sums percentage uncertainties to obtain ${ansPct}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains ΔE = ${ansAbs}.`,
          marks: 1,
        },
      ],
      totalMarks: 5,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 14: Cylindrical Wire Diameter Stress σ = 4F/(πd²) & d² Uncertainty
//               (A-Level & NCUK ONLY — NEVER IB 2025!)
// ============================================================================
const ARCHETYPE_WIRE_DIAMETER_STRESS: ArchetypeDefinition = {
  conceptId: "elasticity-young-modulus",
  templateArchetype: "cylindrical-wire-diameter-stress-uncertainty",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const dMmChoices = [0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.5, 1.6, 2.0];
    const ddMmChoices = [0.01, 0.02];
    const forceChoices = [24, 32, 45, 60, 75, 90, 110, 135, 160];
    const dForceChoices = [0.5, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0];

    const dMm = dMmChoices[variantIndex % dMmChoices.length];
    const ddMm = ddMmChoices[variantIndex % ddMmChoices.length];
    const forceN = forceChoices[(variantIndex * 2 + 1) % forceChoices.length];
    const dForceN = dForceChoices[(variantIndex + 2) % dForceChoices.length];

    const areaM2 = Number(((Math.PI * (dMm * 1e-3) ** 2) / 4).toPrecision(5));
    const dAreaM2 = Number((areaM2 * 2 * (ddMm / dMm)).toPrecision(5));

    const scenarioSpec = {
      kind: "uncertainty-power-product",
      aValue: forceN,
      aAbsUnc: dForceN,
      aPower: 1,
      bValue: areaM2,
      bAbsUnc: dAreaM2,
      bPower: -1,
    };
    const solved = solvePureCalc(scenarioSpec);
    // STRICTLY A-Level & NCUK ONLY — NEVER IB 2025!
    const syllabi = resolveSyllabusTags(
      "elasticity-young-modulus",
      format,
      variantIndex,
      "alevel-ncuk-only",
    );

    const contexts = [
      `Using a digital micrometer, a student measures the diameter of a cylindrical constantan wire as d = ${dMm} mm ± ${ddMm} mm while hanging a calibrated tensile load F = ${forceN} N ± ${dForceN} N from it.`,
      `A surgical stainless-steel suture wire of circular cross-section has micrometer diameter d = ${dMm} mm ± ${ddMm} mm and carries an axial tensile load F = ${forceN} N ± ${dForceN} N.`,
      `On a bicycle-spoke tension rig, a cylindrical steel spoke of diameter d = ${dMm} mm ± ${ddMm} mm is subjected to axial pull F = ${forceN} N ± ${dForceN} N.`,
      `A molybdenum furnace-hanger filament of circular diameter d = ${dMm} mm ± ${ddMm} mm supports a tensile load of F = ${forceN} N ± ${dForceN} N.`,
      `During a Required Practical wire check, micrometer readings give wire diameter d = ${dMm} mm ± ${ddMm} mm under suspended tension F = ${forceN} N ± ${dForceN} N.`,
      `A prestressing tendon strand filament with circular diameter d = ${dMm} mm ± ${ddMm} mm is tensioned to F = ${forceN} N ± ${dForceN} N in a calibration frame.`,
      `An acoustic piano-wire gauge of diameter d = ${dMm} mm ± ${ddMm} mm experiences an axial tension of F = ${forceN} N ± ${dForceN} N.`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "diameterMm", value: dMm, unit: "mm", source: "stem" },
      { name: "diameterUncMm", value: ddMm, unit: "mm", source: "stem" },
      { name: "forceN", value: forceN, unit: "N", source: "stem" },
      { name: "forceUncN", value: dForceN, unit: "N", source: "stem" },
    ];

    const fracF = dForceN / forceN;
    const fracD = ddMm / dMm;

    if (format === "mcq") {
      if (variantIndex % 2 === 0) {
        const sigma = solved.resultValue;
        const stem = `${baseProse} What is the tensile stress σ in the wire in pascals?`;
        const options = buildMcqOptions(
          sigma,
          "Pa",
          [
            {
              value: sigma / 4,
              rationale:
                "Uses A = πd² instead of A = πd²/4 (treating diameter d as if it were radius r, off by a factor of 4).",
            },
            {
              value: sigma * 1e-6,
              rationale:
                "Substitutes diameter in millimetres directly without converting d² from mm² to 10⁻⁶ m².",
            },
            {
              value: forceN / (Math.PI * dMm * 1e-3),
              rationale:
                "Divides force by circumference πd instead of cross-sectional area πd²/4.",
            },
            {
              value: sigma * 1e-3,
              rationale:
                "Applies a single factor of 10⁻³ instead of squaring (10⁻³)² = 10⁻⁶ for d².",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(sigma, "Pa");
        return {
          id,
          conceptId: "elasticity-young-modulus",
          templateArchetype: "cylindrical-wire-diameter-stress-uncertainty",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "resultValue",
            "fractionalUncertainty",
            "percentageUncertainty",
            "absoluteUncertainty",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "tensile stress in a circular wire from force and micrometer diameter",
            [
              "treating measured diameter as radius and omitting the quarter-pi area factor",
              "applying linear millimetre conversion instead of squaring for area",
              "dividing by circumference rather than circular area",
            ],
            ["Wire has uniform circular cross-section"],
          ),
          targetQuantityKey: "resultValue",
          stem,
          options,
          workedSolution: `Cross-sectional area A = πd²/4 = π(${dMm} × 10⁻³)² / 4 = ${formatPhysicsValue(areaM2, "m²")}. Tensile stress σ = F / A = 4F / (πd²) = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Uses A = πd²/4 in m² to obtain σ = ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const pct = solved.percentageUncertainty;
      const stem = `${baseProse} What is the percentage uncertainty in the tensile stress σ = 4F / (πd²)?`;
      const options = buildMcqOptions(
        pct,
        "%",
        [
          {
            value: (fracF + fracD) * 100,
            rationale:
              "Forgets the power exponent 2 on d² when propagating uncertainty in A = πd²/4.",
          },
          {
            value: Math.abs(fracF - 2 * fracD) * 100,
            rationale:
              "Subtracts 2(%Δd) from %ΔF because d² sits in the denominator of 4F/(πd²).",
          },
          {
            value: (fracF + 4 * fracD) * 100,
            rationale:
              "Multiplies %Δd by the constant prefactor 4 in 4F/(πd²) instead of by the exponent 2.",
          },
          {
            value: 2 * (fracF * 100) * (fracD * 100),
            rationale:
              "Multiplies the percentage uncertainties instead of adding them.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(pct, "%");
      return {
        id,
        conceptId: "elasticity-young-modulus",
        templateArchetype: "cylindrical-wire-diameter-stress-uncertainty",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [
          "resultValue",
          "fractionalUncertainty",
          "percentageUncertainty",
          "absoluteUncertainty",
        ],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "percentage uncertainty in wire tensile stress with squared diameter denominator",
          [
            "omitting power-of-two multiplier on diameter fractional uncertainty",
            "subtracting denominator uncertainty in quotient",
            "multiplying uncertainty by numerical constant four rather than power exponent",
          ],
          ["Exact geometrical constants four and pi contribute zero uncertainty"],
        ),
        targetQuantityKey: "percentageUncertainty",
        stem,
        options,
        workedSolution: `In σ = 4F / (πd²), the constant 4/π has zero uncertainty, so %Δσ = %ΔF + 2(%Δd) = (${dForceN}/${forceN} + 2 × ${ddMm}/${dMm}) × 100% = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates %ΔF + 2(%Δd) = ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansSigma = formatPhysicsValue(solved.resultValue, "Pa");
    const ansPct = formatPhysicsValue(solved.percentageUncertainty, "%");
    const ansAbs = formatPhysicsValue(solved.absoluteUncertainty, "Pa");

    return {
      id,
      conceptId: "elasticity-young-modulus",
      templateArchetype: "cylindrical-wire-diameter-stress-uncertainty",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: [
        "resultValue",
        "fractionalUncertainty",
        "percentageUncertainty",
        "absoluteUncertainty",
      ],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "circular wire tensile stress and squared-diameter uncertainty propagation",
        [
          "evaluate circular cross-sectional area from diameter to find tensile stress",
          "propagate force and squared-diameter fractional uncertainties",
          "calculate absolute tensile stress uncertainty in pascals",
        ],
        ["Wire cross-section is circular throughout"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt:
            "Calculate the tensile stress σ in the wire in pascals.",
          marks: 2,
          targetQuantityKey: "resultValue",
          expectedAnswer: ansSigma,
          workingSteps: [
            `A = πd²/4 = π(${dMm} × 10⁻³)² / 4 = ${formatPhysicsValue(areaM2, "m²")}.`,
            `σ = F / A = ${forceN} / ${areaM2} = ${ansSigma}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Calculate the percentage uncertainty in σ.",
          marks: 2,
          targetQuantityKey: "percentageUncertainty",
          expectedAnswer: ansPct,
          workingSteps: [
            `%Δσ = %ΔF + 2(%Δd) = (${dForceN}/${forceN} + 2 × ${ddMm}/${dMm}) × 100% = ${ansPct}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Hence state the absolute uncertainty Δσ in pascals.",
          marks: 1,
          dependsOnPartIds: ["a", "b"],
          targetQuantityKey: "absoluteUncertainty",
          expectedAnswer: ansAbs,
          workingSteps: [
            `Δσ = σ × (%Δσ / 100%) = ${ansAbs}.`,
          ],
        },
      ],
      workedSolution: `(a) A = π(${dMm} × 10⁻³)²/4 = ${formatPhysicsValue(areaM2, "m²")}, so σ = F/A = ${ansSigma}. (b) %Δσ = (${dForceN}/${forceN} + 2 × ${ddMm}/${dMm}) × 100% = ${ansPct}. (c) Δσ = ${ansAbs}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: "Uses A = πd²/4 with d converted from mm to m.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains σ = ${ansSigma}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Doubles %Δd and adds to %ΔF.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains ${ansPct}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains Δσ = ${ansAbs}.`,
          marks: 1,
        },
      ],
      totalMarks: 5,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 15: Electrical Power Dissipation P = V² / R & Quotient Uncertainty
// ============================================================================
const ARCHETYPE_ELECTRICAL_POWER_UNC: ArchetypeDefinition = {
  conceptId: "resistivity-ohmic-conductors",
  templateArchetype: "ohmic-wire-resistivity-power-uncertainty",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const vChoices = [8.0, 12.0, 15.0, 18.0, 24.0, 30.0, 36.0, 42.0, 48.0];
    const dvChoices = [0.2, 0.3, 0.4, 0.5, 0.6, 0.8];
    const rChoices = [5.0, 6.0, 8.0, 10.0, 12.0, 15.0, 16.0, 20.0, 25.0];
    const drChoices = [0.15, 0.2, 0.25, 0.3, 0.4, 0.5];

    const v = vChoices[variantIndex % vChoices.length];
    const dv = dvChoices[(variantIndex + 1) % dvChoices.length];
    const r = rChoices[(variantIndex * 2 + 3) % rChoices.length];
    const dr = drChoices[(variantIndex * 3 + 1) % drChoices.length];

    const scenarioSpec = {
      kind: "uncertainty-power-product",
      aValue: v,
      aAbsUnc: dv,
      aPower: 2,
      bValue: r,
      bAbsUnc: dr,
      bPower: -1,
    };
    const solved = solvePureCalc(scenarioSpec);
    const syllabi = resolveSyllabusTags(
      "resistivity-ohmic-conductors",
      format,
      variantIndex,
      "all-three",
    );

    const contexts = [
      `Across a constantan heating coil of measured resistance R = ${r} Ω ± ${dr} Ω, a calibrated voltmeter reads a steady potential difference V = ${v} V ± ${dv} V.`,
      `In a spacecraft shunt-regulator test, a ceramic load resistor rated at R = ${r} Ω ± ${dr} Ω operates with terminal p.d. V = ${v} V ± ${dv} V.`,
      `During a thermal-rating audit of an avionics de-icing strip, resistance is measured as R = ${r} Ω ± ${dr} Ω while applied voltage is V = ${v} V ± ${dv} V.`,
      `A laboratory manganin standard resistor of resistance R = ${r} Ω ± ${dr} Ω carries a steady potential difference of V = ${v} V ± ${dv} V.`,
      `On an electric kiln element bench, instruments record element resistance R = ${r} Ω ± ${dr} Ω and terminal voltage V = ${v} V ± ${dv} V.`,
      `A 3D-printer cartridge heater of ohmic resistance R = ${r} Ω ± ${dr} Ω is driven at regulated DC voltage V = ${v} V ± ${dv} V.`,
      `In a dynamic-braking resistor verification, R = ${r} Ω ± ${dr} Ω is subjected to steady DC potential difference V = ${v} V ± ${dv} V.`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "resistanceOhm", value: r, unit: "Ω", source: "stem" },
      { name: "resistanceUncOhm", value: dr, unit: "Ω", source: "stem" },
      { name: "voltageV", value: v, unit: "V", source: "stem" },
      { name: "voltageUncV", value: dv, unit: "V", source: "stem" },
    ];

    const fracV = dv / v;
    const fracR = dr / r;

    if (format === "mcq") {
      const mode = variantIndex % 3;
      if (mode === 0) {
        const pct = solved.percentageUncertainty;
        const stem = `${baseProse} What is the percentage uncertainty in the electrical power dissipated P = V² / R?`;
        const options = buildMcqOptions(
          pct,
          "%",
          [
            {
              value: (fracV + fracR) * 100,
              rationale:
                "Omits the exponent factor 2 on %ΔV for the squared V² term.",
            },
            {
              value: Math.abs(2 * fracV - fracR) * 100,
              rationale:
                "Subtracts %ΔR from 2(%ΔV) because R is in the denominator.",
            },
            {
              value: 2 * (fracV * 100) * (fracR * 100),
              rationale:
                "Multiplies the percentage uncertainties instead of adding them.",
            },
            {
              value: (fracV + 2 * fracR) * 100,
              rationale:
                "Applies the factor of 2 to %ΔR instead of %ΔV.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(pct, "%");
        return {
          id,
          conceptId: "resistivity-ohmic-conductors",
          templateArchetype: "ohmic-wire-resistivity-power-uncertainty",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "resultValue",
            "fractionalUncertainty",
            "percentageUncertainty",
            "absoluteUncertainty",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "percentage uncertainty in electrical Joule heating power",
            [
              "omitting squared-voltage multiplier in fractional uncertainty sum",
              "subtracting resistance uncertainty in quotient",
              "applying factor of two to resistance rather than voltage",
            ],
            ["Conductor obeys Ohm's law at operating temperature"],
          ),
          targetQuantityKey: "percentageUncertainty",
          stem,
          options,
          workedSolution: `For P = V² / R, %ΔP = 2(%ΔV) + (%ΔR) = [2(${dv}/${v}) + (${dr}/${r})] × 100% = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Evaluates 2(%ΔV) + (%ΔR) = ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      if (mode === 1) {
        const absP = solved.absoluteUncertainty;
        const stem = `${baseProse} What is the absolute uncertainty ΔP in the dissipated electrical power in watts?`;
        const options = buildMcqOptions(
          absP,
          "W",
          [
            {
              value: solved.resultValue * (fracV + fracR),
              rationale:
                "Uses ΔV/V + ΔR/R without doubling ΔV/V for V².",
            },
            {
              value: solved.resultValue * Math.abs(2 * fracV - fracR),
              rationale:
                "Subtracts ΔR/R from 2(ΔV/V) in the quotient V²/R.",
            },
            {
              value: dv ** 2 / dr,
              rationale:
                "Evaluates (ΔV)² / ΔR directly instead of propagating fractional uncertainties.",
            },
            {
              value: (v / r) * (2 * fracV + fracR),
              rationale:
                "Multiplies the fractional uncertainty by current V/R instead of power V²/R.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(absP, "W");
        return {
          id,
          conceptId: "resistivity-ohmic-conductors",
          templateArchetype: "ohmic-wire-resistivity-power-uncertainty",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "resultValue",
            "fractionalUncertainty",
            "percentageUncertainty",
            "absoluteUncertainty",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "absolute uncertainty in dissipated resistor power",
            [
              "forgetting factor of two on voltage fractional uncertainty",
              "subtracting resistance fractional uncertainty",
              "plugging raw absolute uncertainties into the power equation",
            ],
            ["Voltmeter and resistance meter uncertainties are independent"],
          ),
          targetQuantityKey: "absoluteUncertainty",
          stem,
          options,
          workedSolution: `Nominal power P = V² / R = ${v}² / ${r} = ${formatPhysicsValue(solved.resultValue, "W")}. Fractional uncertainty ΔP/P = 2(${dv}/${v}) + (${dr}/${r}) = ${formatPhysicsValue(solved.fractionalUncertainty)}, giving ΔP = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Calculates P = V²/R and multiplies by 2(ΔV/V) + (ΔR/R) to obtain ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const pVal = solved.resultValue;
      const stem = `${baseProse} What is the nominal electrical power dissipated in the resistor?`;
      const options = buildMcqOptions(
        pVal,
        "W",
        [
          {
            value: v / r,
            rationale:
              "Computes current I = V / R instead of electrical power P = V² / R.",
          },
          {
            value: v * r,
            rationale:
              "Multiplies V × R (confusing V = IR with P = VI).",
          },
          {
            value: v ** 2 * r,
            rationale:
              "Computes V²R (confusing I²R with V²/R).",
          },
          {
            value: r / v ** 2,
            rationale:
              "Inverts the ratio to R / V².",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(pVal, "W");
      return {
        id,
        conceptId: "resistivity-ohmic-conductors",
        templateArchetype: "ohmic-wire-resistivity-power-uncertainty",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [
          "resultValue",
          "fractionalUncertainty",
          "percentageUncertainty",
          "absoluteUncertainty",
        ],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "nominal ohmic power dissipation from voltage and resistance",
          [
            "calculating conduction current rather than power",
            "multiplying squared voltage by resistance instead of dividing",
            "multiplying voltage by resistance directly",
          ],
          ["Steady DC excitation across purely resistive element"],
        ),
        targetQuantityKey: "resultValue",
        stem,
        options,
        workedSolution: `P = V² / R = ${v}² / ${r} = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates P = V²/R = ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansP = formatPhysicsValue(solved.resultValue, "W");
    const ansPct = formatPhysicsValue(solved.percentageUncertainty, "%");
    const ansAbs = formatPhysicsValue(solved.absoluteUncertainty, "W");

    return {
      id,
      conceptId: "resistivity-ohmic-conductors",
      templateArchetype: "ohmic-wire-resistivity-power-uncertainty",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: [
        "resultValue",
        "fractionalUncertainty",
        "percentageUncertainty",
        "absoluteUncertainty",
      ],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "ohmic resistor power dissipation and uncertainty propagation",
        [
          "compute nominal electrical power dissipated from voltage and resistance",
          "determine percentage uncertainty accounting for squared voltage",
          "evaluate absolute power uncertainty in watts",
        ],
        ["Resistance remains constant during measurement"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt:
            "Calculate the nominal electrical power P dissipated in the resistor.",
          marks: 2,
          targetQuantityKey: "resultValue",
          expectedAnswer: ansP,
          workingSteps: [
            `P = V² / R = ${v}² / ${r} = ${ansP}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Calculate the percentage uncertainty in P.",
          marks: 2,
          targetQuantityKey: "percentageUncertainty",
          expectedAnswer: ansPct,
          workingSteps: [
            `%ΔP = 2(%ΔV) + (%ΔR) = [2(${dv}/${v}) + (${dr}/${r})] × 100% = ${ansPct}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Determine the absolute uncertainty ΔP in watts.",
          marks: 1,
          dependsOnPartIds: ["a", "b"],
          targetQuantityKey: "absoluteUncertainty",
          expectedAnswer: ansAbs,
          workingSteps: [
            `ΔP = P × (%ΔP / 100%) = ${ansAbs}.`,
          ],
        },
      ],
      workedSolution: `(a) P = ${v}² / ${r} = ${ansP}. (b) %ΔP = [2(${dv}/${v}) + (${dr}/${r})] × 100% = ${ansPct}. (c) ΔP = ${ansAbs}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: "Uses P = V² / R.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains P = ${ansP}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Uses 2(ΔV/V) + (ΔR/R) × 100%.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains ${ansPct}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains ΔP = ${ansAbs}.`,
          marks: 1,
        },
      ],
      totalMarks: 5,
      generatorModel,
    };
  },
};

// ============================================================================
// ARCHETYPE 16: Immersion Calorimetry Q = mcΔT & Electrical Heating Efficiency
//               (IB SL/HL, A-Level Y13 ONLY, NCUK IFY)
// ============================================================================
const ARCHETYPE_CALORIMETRY_EFFICIENCY: ArchetypeDefinition = {
  conceptId: "specific-heat-latent-heat",
  templateArchetype: "immersion-calorimetry-thermal-efficiency",
  buildCandidate({ id, seed, variantIndex, format, difficulty, generatorModel }) {
    const media = [
      { name: "water", c: 4200 },
      { name: "glycerol", c: 2400 },
      { name: "silicone heat-transfer oil", c: 1800 },
      { name: "aluminium calorimetry block", c: 900 },
      { name: "copper calorimetry block", c: 390 },
      { name: "ethylene-glycol coolant", c: 3200 },
    ] as const;

    const medium = media[variantIndex % media.length];
    const massChoices = [0.4, 0.5, 0.6, 0.8, 1.2, 1.5, 2.0];
    const dTChoices = [12, 15, 18, 20, 24, 25, 30];
    const tChoices = [60, 80, 100, 120, 150, 180, 200];
    const effChoices = [0.72, 0.75, 0.8, 0.84, 0.85, 0.88];

    const massKg = massChoices[variantIndex % massChoices.length];
    const dTK = dTChoices[(variantIndex * 2 + 1) % dTChoices.length];
    const tS = tChoices[(variantIndex + 2) % tChoices.length];
    const qUseful = massKg * medium.c * dTK;
    const pUseful = Number((qUseful / tS).toPrecision(8));
    const effNom = effChoices[(variantIndex * 3 + 1) % effChoices.length];
    const pIn = Math.max(Math.round(pUseful / effNom), Math.ceil(pUseful) + 25);

    const scenarioSpec = {
      kind: "power-efficiency",
      inputPowerW: pIn,
      usefulPowerW: pUseful,
      durationS: tS,
    };
    const solved = solvePureCalc(scenarioSpec);
    // Automatically tags IB (SL/HL), A-Level (Y13 ONLY via crosswalk), NCUK (IFY)
    const syllabi = resolveSyllabusTags(
      "specific-heat-latent-heat",
      format,
      variantIndex,
      "all-three",
    );

    const contexts = [
      `An electric immersion heater rated at ${pIn} W is switched on for ${tS} s inside a ${massKg} kg sample of ${medium.name} (specific heat capacity c = ${medium.c} J kg⁻¹ K⁻¹), raising its uniform temperature by ${dTK} K.`,
      `During a calorimetry practical, a ${pIn} W cartridge heater operates continuously for ${tS} s in ${massKg} kg of ${medium.name} (c = ${medium.c} J kg⁻¹ K⁻¹) and produces a temperature rise of ${dTK} K.`,
      `In an industrial thermal-bath check, ${massKg} kg of ${medium.name} (specific heat capacity ${medium.c} J kg⁻¹ K⁻¹) is heated for ${tS} s by an electrical element drawing ${pIn} W, increasing the temperature by ${dTK} K.`,
      `A Callendar-style batch calorimeter containing ${massKg} kg of ${medium.name} (c = ${medium.c} J kg⁻¹ K⁻¹) receives ${pIn} W of electrical input power for ${tS} s, resulting in a temperature increase of ${dTK} K.`,
      `On a materials thermal bench, a ${pIn} W heating coil supplies energy for ${tS} s to a ${massKg} kg specimen of ${medium.name} (c = ${medium.c} J kg⁻¹ K⁻¹), elevating its temperature by ${dTK} K.`,
      `A laboratory heater consuming ${pIn} W runs for ${tS} s while immersed in ${massKg} kg of ${medium.name} of specific heat capacity ${medium.c} J kg⁻¹ K⁻¹, causing a ${dTK} K temperature rise.`,
      `In a process-engineering calibration, ${massKg} kg of ${medium.name} (c = ${medium.c} J kg⁻¹ K⁻¹) warms by ${dTK} K when heated for ${tS} s by a ${pIn} W resistive element.`,
    ];
    const baseProse = pick(contexts, variantIndex);
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "inputPowerW", value: pIn, unit: "W", source: "stem" },
      { name: "durationS", value: tS, unit: "s", source: "stem" },
      { name: "massKg", value: massKg, unit: "kg", source: "stem" },
      { name: "specificHeatCapacity", value: medium.c, unit: "J kg⁻¹ K⁻¹", source: "stem" },
      { name: "tempRiseK", value: dTK, unit: "K", source: "stem" },
    ];

    if (format === "mcq") {
      if (variantIndex % 2 === 0) {
        const wasted = solved.wastedEnergyJ;
        const stem = `${baseProse} How much thermal energy is lost to the surroundings during the ${tS} s heating period?`;
        const options = buildMcqOptions(
          wasted,
          "J",
          [
            {
              value: solved.usefulEnergyJ,
              rationale:
                "Calculates the thermal energy absorbed by the sample Q = mcΔT rather than the heat lost to the surroundings.",
            },
            {
              value: solved.totalInputEnergyJ,
              rationale:
                "Calculates the total electrical energy supplied P_in t instead of subtracting mcΔT.",
            },
            {
              value: pIn - pUseful,
              rationale:
                "Calculates the rate of heat loss in watts without multiplying by the heating time t.",
            },
            {
              value: Math.abs(pIn * tS - medium.c * dTK),
              rationale:
                "Omits mass m when evaluating mcΔT before subtracting from electrical energy input.",
            },
          ],
          seed,
        );
        const ans = formatPhysicsValue(wasted, "J");
        return {
          id,
          conceptId: "specific-heat-latent-heat",
          templateArchetype: "immersion-calorimetry-thermal-efficiency",
          seed,
          syllabi,
          format,
          difficulty,
          domain: "pure-calculation",
          scenarioSpec,
          hiddenQuantities: [
            "efficiency",
            "efficiencyPercent",
            "usefulEnergyJ",
            "totalInputEnergyJ",
            "wastedEnergyJ",
          ],
          requiredGivens,
          questionPlan: makeMcqPlan(
            "thermal energy lost to surroundings during electrical calorimetry",
            [
              "reporting sensible heat absorbed by the sample instead of ambient heat loss",
              "reporting total electrical input energy without subtracting sample enthalpy gain",
              "computing rate of heat loss in watts rather than total lost energy",
            ],
            ["No phase change occurs during the temperature rise"],
          ),
          targetQuantityKey: "wastedEnergyJ",
          stem,
          options,
          workedSolution: `Electrical energy supplied E_in = P_in t = ${pIn} × ${tS} = ${solved.totalInputEnergyJ} J. Thermal energy retained by sample Q = mcΔT = ${massKg} × ${medium.c} × ${dTK} = ${solved.usefulEnergyJ} J. Energy lost to surroundings = E_in − Q = ${ans}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Subtracts mcΔT (${solved.usefulEnergyJ} J) from P_in t (${solved.totalInputEnergyJ} J) to obtain ${ans}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      const effPct = solved.efficiencyPercent;
      const stem = `${baseProse} What percentage of the electrical energy supplied is retained as internal thermal energy of the ${medium.name}?`;
      const options = buildMcqOptions(
        effPct,
        "%",
        [
          {
            value: 100 - effPct,
            rationale:
              "Calculates the percentage of electrical energy lost to the surroundings instead of the percentage retained.",
          },
          {
            value: (qUseful / pIn) * 100,
            rationale:
              "Divides Q = mcΔT in joules directly by heater power P_in in watts without dividing by time t.",
          },
          {
            value: ((medium.c * dTK) / (pIn * tS)) * 100,
            rationale:
              "Omits sample mass m from Q = mcΔT.",
          },
          {
            value: ((pIn * tS) / qUseful) * 100,
            rationale:
              "Inverts the efficiency ratio as E_in / Q.",
          },
        ],
        seed,
      );
      const ans = formatPhysicsValue(effPct, "%");
      return {
        id,
        conceptId: "specific-heat-latent-heat",
        templateArchetype: "immersion-calorimetry-thermal-efficiency",
        seed,
        syllabi,
        format,
        difficulty,
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [
          "efficiency",
          "efficiencyPercent",
          "usefulEnergyJ",
          "totalInputEnergyJ",
          "wastedEnergyJ",
        ],
        requiredGivens,
        questionPlan: makeMcqPlan(
          "thermal efficiency of an electric immersion calorimeter",
          [
            "calculating percentage heat loss rather than percentage retained",
            "omitting heating duration when comparing thermal energy to electrical power",
            "omitting sample mass in sensible heat calculation",
          ],
          ["Sample temperature is uniform at start and end of heating"],
        ),
        targetQuantityKey: "efficiencyPercent",
        stem,
        options,
        workedSolution: `Q = mcΔT = ${massKg} × ${medium.c} × ${dTK} = ${solved.usefulEnergyJ} J and E_in = ${pIn} × ${tS} = ${solved.totalInputEnergyJ} J. Percentage retained η = (Q / E_in) × 100% = ${ans}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates mcΔT / (P_in t) × 100% = ${ans}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const ansQ = formatPhysicsValue(solved.usefulEnergyJ, "J");
    const ansWasted = formatPhysicsValue(solved.wastedEnergyJ, "J");
    const ansEff = formatPhysicsValue(solved.efficiencyPercent, "%");

    return {
      id,
      conceptId: "specific-heat-latent-heat",
      templateArchetype: "immersion-calorimetry-thermal-efficiency",
      seed,
      syllabi,
      format,
      difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: [
        "efficiency",
        "efficiencyPercent",
        "usefulEnergyJ",
        "totalInputEnergyJ",
        "wastedEnergyJ",
      ],
      requiredGivens,
      questionPlan: makeStructuredPlan(
        "sensible heat absorption, ambient thermal loss, and calorimetry efficiency",
        [
          "calculate thermal energy absorbed by the sample from specific heat capacity",
          "determine thermal energy lost to the surroundings from electrical input",
          "compute percentage thermal efficiency of the heating process",
        ],
        ["Heater power remains constant and no phase transition occurs"],
      ),
      stem: baseProse,
      parts: [
        {
          partId: "a",
          prompt:
            "Calculate the thermal energy Q absorbed by the sample.",
          marks: 2,
          targetQuantityKey: "usefulEnergyJ",
          expectedAnswer: ansQ,
          workingSteps: [
            `Q = mcΔT = ${massKg} × ${medium.c} × ${dTK} = ${ansQ}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Calculate the thermal energy lost to the surroundings during the heating interval.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "wastedEnergyJ",
          expectedAnswer: ansWasted,
          workingSteps: [
            `E_in = P_in t = ${pIn} × ${tS} = ${solved.totalInputEnergyJ} J.`,
            `E_lost = E_in − Q = ${solved.totalInputEnergyJ} − ${solved.usefulEnergyJ} = ${ansWasted}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Determine the percentage efficiency of the heating arrangement.",
          marks: 1,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "efficiencyPercent",
          expectedAnswer: ansEff,
          workingSteps: [
            `η = (Q / E_in) × 100% = ${ansEff}.`,
          ],
        },
      ],
      workedSolution: `(a) Q = ${massKg}(${medium.c})(${dTK}) = ${ansQ}. (b) E_in = ${pIn}(${tS}) = ${solved.totalInputEnergyJ} J, so E_lost = ${ansWasted}. (c) η = (${solved.usefulEnergyJ}/${solved.totalInputEnergyJ}) × 100% = ${ansEff}.`,
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: "Substitutes into Q = mcΔT.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains Q = ${ansQ}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Subtracts Q from total electrical energy P_in t.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains E_lost = ${ansWasted}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains η = ${ansEff}.`,
          marks: 1,
        },
      ],
      totalMarks: 5,
      generatorModel,
    };
  },
};

export const PURE_CALCULATION_ARCHETYPE_REGISTRY: readonly ArchetypeDefinition[] =
  [
    ARCHETYPE_SI_DENSITY,
    ARCHETYPE_DIMENSIONAL_WAVE_SPEED,
    ARCHETYPE_UNCERTAINTY_QUOTIENT,
    ARCHETYPE_SUM_DIFF_STIFFNESS,
    ARCHETYPE_VECTOR_TOW_KINEMATICS,
    ARCHETYPE_VECTOR_POWER,
    ARCHETYPE_SUVAT_KMH,
    ARCHETYPE_VERTICAL_GRAVITY,
    ARCHETYPE_IMPULSE_REBOUND,
    ARCHETYPE_TRACTIVE_POWER,
    ARCHETYPE_HOIST_EFFICIENCY,
    ARCHETYPE_HYDROSTATIC_PRESSURE,
    ARCHETYPE_YOUNG_MODULUS,
    ARCHETYPE_WIRE_DIAMETER_STRESS,
    ARCHETYPE_ELECTRICAL_POWER_UNC,
    ARCHETYPE_CALORIMETRY_EFFICIENCY,
  ];

const DIFFICULTY_ROTATION: readonly QuestionDifficulty[] = [
  "foundation",
  "standard",
  "standard",
  "higher",
];

/**
 * Generates deterministic, solver-verified `pure-calculation` bank candidates
 * (~65% Paper 1 `mcq`, ~35% Paper 2 `structured`) across 16 `(conceptId, templateArchetype)`
 * family groups spanning IB (SL/HL, g = 9.8), UK A-Level (Y12/Y13, g = 9.81),
 * and NCUK IFY (g = 9.81) with zero near-duplicate stems and zero Step-1 answer leaks.
 */
export function generatePureCalculationCandidates(
  options: GeneratePureCalculationOptions = {},
): CandidateQuestionInput[] {
  const baseSeed = options.baseSeed ?? 820_000;
  const totalCount = options.totalCount ?? 336;
  const mcqRatio = options.mcqRatio ?? 0.65;
  const idPrefix = options.idPrefix ?? "sp-pure-calc";
  const generatorModel = options.generatorModel ?? "gemini-4-carbon-high";

  if (!Number.isInteger(totalCount) || totalCount < 1) {
    throw new Error("totalCount must be a positive integer");
  }
  if (!(mcqRatio > 0 && mcqRatio < 1)) {
    throw new Error("mcqRatio must lie strictly between 0 and 1");
  }

  const activeArchetypes = options.archetypes
    ? PURE_CALCULATION_ARCHETYPE_REGISTRY.filter((a) =>
        options.archetypes!.includes(a.templateArchetype),
      )
    : PURE_CALCULATION_ARCHETYPE_REGISTRY;

  if (activeArchetypes.length === 0) {
    throw new Error("At least one pure-calculation archetype must be selected");
  }

  const targetMcqTotal = Math.round(totalCount * mcqRatio);
  const perArchetypeCounts = activeArchetypes.map((_, idx) => {
    const base = Math.floor(totalCount / activeArchetypes.length);
    const rem = idx < totalCount % activeArchetypes.length ? 1 : 0;
    return base + rem;
  });

  // Allocate MCQ counts per archetype so total MCQs equal targetMcqTotal
  const perArchetypeMcq = perArchetypeCounts.map((cnt) =>
    Math.floor(cnt * mcqRatio),
  );
  let mcqAssigned = perArchetypeMcq.reduce((a, b) => a + b, 0);
  let archCursor = 0;
  while (mcqAssigned < targetMcqTotal) {
    const idx = archCursor % activeArchetypes.length;
    if (perArchetypeMcq[idx] < perArchetypeCounts[idx]) {
      perArchetypeMcq[idx] += 1;
      mcqAssigned += 1;
    }
    archCursor += 1;
  }

  const accepted: CandidateQuestionInput[] = [];
  const existingStems: ExistingStemEntry[] = [];
  let globalIndex = 0;

  for (let aIdx = 0; aIdx < activeArchetypes.length; aIdx += 1) {
    const archetype = activeArchetypes[aIdx];
    const countForArch = perArchetypeCounts[aIdx];
    const mcqForArch = perArchetypeMcq[aIdx];

    let attemptOffset = 0;
    for (let localIdx = 0; localIdx < countForArch; localIdx += 1) {
      globalIndex += 1;
      const format: QuestionFormat =
        localIdx < mcqForArch ? "mcq" : "structured";
      const difficulty =
        DIFFICULTY_ROTATION[(localIdx + aIdx) % DIFFICULTY_ROTATION.length];
      const id = `${idPrefix}-${String(globalIndex).padStart(4, "0")}`;

      let chosen: CandidateQuestionInput | undefined;
      for (let retry = 0; retry < 40; retry += 1) {
        const variantIndex = localIdx + attemptOffset * 17;
        const seed = baseSeed + aIdx * 2_000 + localIdx * 37 + retry * 3;
        const candidate = archetype.buildCandidate({
          id,
          seed,
          variantIndex,
          format,
          difficulty,
          generatorModel,
        });

        const check = verifyCandidateWithGate(candidate, {
          existingShardItems: existingStems,
          nearDuplicateSimilarityThreshold: 0.82,
        });
        if (check.evaluation.valid) {
          chosen = candidate;
          existingStems.push({
            id: candidate.id,
            stem: candidate.stem,
            stemFingerprint:
              check.evaluation.stemFingerprint ||
              computeStemFingerprint(candidate.stem),
          });
          break;
        }
        attemptOffset += 1;
      }

      if (!chosen) {
        throw new Error(
          `Failed to synthesize gate-valid unique pure-calculation candidate for ${archetype.templateArchetype} (${id})`,
        );
      }

      accepted.push(chosen);
    }
  }

  return accepted;
}
