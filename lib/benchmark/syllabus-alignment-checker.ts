import {
  getCrosswalkEntry,
  getSubtopicById,
  getSyllabusCatalogue,
  getTopicById,
  SYLLABUS_IDS,
  SyllabusId,
  SyllabusLevel,
} from "@/lib/constants/syllabi";
import {
  SyllabusAlignmentCheckInput,
  SyllabusAlignmentCheckResult,
  SyllabusAlignmentIssue,
} from "@/lib/benchmark/types";

const RETIRED_IB_2016_CONCEPTS = new Set<string>([
  "capacitor-networks-energy",
  "capacitor-rc-decay",
  "thin-lenses-geometric-optics",
  "fundamental-particles-quarks-leptons",
]);

const RETIRED_IB_2016_SPEC_KINDS = new Set<string>([
  "capacitor-network",
  "capacitor-series-parallel",
  "rc-charging",
  "rc-discharging",
  "rc-transient",
  "thin-lens",
  "converging-lens",
  "diverging-lens",
  "lens-ray-diagram",
  "quark-decay",
  "feynman-diagram",
]);

const RETIRED_IB_2016_SPEC_KEYS = new Set<string>([
  "capacitanceF",
  "capacitanceUf",
  "capacitanceMf",
  "c1Uf",
  "c2Uf",
  "c3Uf",
  "focalLengthM",
  "focalLengthCm",
  "focalLengthMm",
  "objectDistanceCm",
  "imageDistanceCm",
]);

const RETIRED_IB_2016_PROSE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  label: string;
}> = [
  {
    pattern:
      /(?<![A-Za-z0-9_])[+-]?(?:\d+\.?\d*|\.\d+)\s*(?:[μunpm]?F\b|farads?\b)/,
    label: "quantitative capacitance in farads (retired IB 2016 Topic 11.3)",
  },
  {
    pattern: /\b1\s*\/\s*f\s*=\s*1\s*\/\s*[uvd]/i,
    label: "thin-lens equation 1/f = 1/u + 1/v (retired IB 2016 Option C)",
  },
  {
    pattern: /\b(?:converging|diverging|biconvex|biconcave)\s+lens\b/i,
    label: "thin-lens geometric optics (retired IB 2016 Option C)",
  },
  {
    pattern:
      /\b(?:quark|antiquark|hadron|baryon|meson|strangeness|feynman\s+diagram|lepton\s+number)\b/i,
    label: "particle physics quarks/hadrons/Feynman diagrams (retired IB 2016 Topic 7.3)",
  },
  {
    pattern: /\bpaper\s*3\s+option\s+[a-d]\b/i,
    label: "legacy IB Paper 3 Option reference (eliminated in IB 2025)",
  },
];

const IB_HL_ONLY_SPEC_KEYS = new Set<string>([
  "momentOfInertiaKgM2",
  "angularImpulseNs",
  "lorentzFactor",
  "properTimeS",
  "properLengthM",
  "entropyChangeJK",
  "carnotEfficiency",
  "fluxLinkageWb",
  "inducedEmfV",
  "comptonShiftM",
  "decayConstantPerS",
  "hubbleConstantKmSMpc",
]);

function buildAllowedFormatsByLevel(
  syllabus: SyllabusId,
): Record<string, Set<string>> {
  const cat = getSyllabusCatalogue(syllabus);
  const byLevel: Record<string, Set<string>> = {};
  for (const lvl of cat.levels) {
    byLevel[lvl] = new Set<string>();
  }
  for (const paper of cat.papers) {
    for (const lvl of paper.levels) {
      if (!byLevel[lvl]) {
        byLevel[lvl] = new Set<string>();
      }
      for (const fmt of paper.formats) {
        byLevel[lvl].add(fmt);
      }
    }
  }
  return byLevel;
}

const ALLOWED_PAPER_FORMATS: Readonly<
  Record<SyllabusId, Readonly<Record<string, ReadonlySet<string>>>>
> = {
  ib: buildAllowedFormatsByLevel("ib"),
  alevel: buildAllowedFormatsByLevel("alevel"),
  ncuk: buildAllowedFormatsByLevel("ncuk"),
};

function extractExplicitEarthGravityMentions(text: string): {
  mentions98: boolean;
  mentions981: boolean;
  mentions10: boolean;
} {
  const normalized = text.replace(/[\u2212\u2013]/g, "-");
  // Match explicit `g = 9.8`, `g ≈ 9.8`, `acceleration of free fall 9.8` etc.
  const mentions981 =
    /\bg\s*(?:=|≈)\s*9\.81(?!\d)/i.test(normalized) ||
    /\b(?:free[- ]fall|gravitational field strength|acceleration due to gravity)[^.;,\n]{0,30}\b9\.81(?!\d)/i.test(
      normalized,
    );
  const mentions98 =
    /\bg\s*(?:=|≈)\s*9\.80?(?!\d)/i.test(normalized) ||
    /\b(?:free[- ]fall|gravitational field strength|acceleration due to gravity)[^.;,\n]{0,30}\b9\.80?(?!\d)/i.test(
      normalized,
    );
  const mentions10 = /\bg\s*(?:=|≈)\s*10(?:\.0+)?\s*(?:m\s*s|N\s*kg)/i.test(
    normalized,
  );
  return { mentions98, mentions981, mentions10 };
}

function extractScenarioEarthGravity(
  spec: Record<string, unknown> | undefined,
): number | undefined {
  if (!spec) return undefined;
  const candidateKeys = [
    "gravityMs2",
    "gMs2",
    "g",
    "gravity",
    "gravitationalFieldStrength",
  ];
  for (const key of candidateKeys) {
    const val = spec[key];
    if (typeof val === "number" && Number.isFinite(val)) {
      // Only treat values in [9.7, 10.1] as Earth standard surface gravity conventions
      // (so Mars 3.7 m s^-2 or Moon 1.6 m s^-2 planetary items are permitted).
      if (val >= 9.7 && val <= 10.1) {
        return val;
      }
    }
  }
  return undefined;
}

/**
 * Deterministically checks a question package against official SixthPhysics
 * syllabus catalogues (`IB 2025`, `UK A-Level`, `NCUK IFY`) and `crosswalk.ts`.
 */
export function checkSyllabusAlignment(
  input: SyllabusAlignmentCheckInput,
): SyllabusAlignmentCheckResult {
  const issues: SyllabusAlignmentIssue[] = [];
  const checkedSyllabiSet = new Set<SyllabusId>();

  if (!Array.isArray(input.syllabi) || input.syllabi.length === 0) {
    return {
      aligned: false,
      issues: [
        {
          code: "empty-syllabi",
          message: "Item must declare at least one syllabus tag",
        },
      ],
      checkedSyllabi: [],
    };
  }

  const conceptEntry = input.conceptId?.trim()
    ? getCrosswalkEntry(input.conceptId.trim())
    : undefined;

  if (input.conceptId !== undefined && !conceptEntry) {
    issues.push({
      code: "unknown-concept-id",
      message: `Unknown canonical conceptId "${input.conceptId}" (not in SYLLABUS_CROSSWALK)`,
    });
  }

  const studentProse = [
    input.stem ?? "",
    ...(input.parts?.map((p) => p.prompt ?? "") ?? []),
  ].join(" ");
  const fullText = [
    studentProse,
    input.workedSolution ?? "",
    ...(input.options?.map((o) => o.text ?? "") ?? []),
    ...(input.markScheme?.map((m) => m.criterion ?? "") ?? []),
  ].join(" ");

  const specKind =
    typeof input.scenarioSpec?.kind === "string"
      ? input.scenarioSpec.kind.trim().toLowerCase()
      : "";

  for (const tag of input.syllabi) {
    const sylRaw: string = String(tag.syllabus ?? "");
    if (!(SYLLABUS_IDS as readonly string[]).includes(sylRaw)) {
      issues.push({
        code: "invalid-syllabus-id",
        message: `Unsupported syllabus ID "${sylRaw}"`,
      });
      continue;
    }

    const syl: SyllabusId = sylRaw as SyllabusId;
    checkedSyllabiSet.add(syl);
    const catalogue = getSyllabusCatalogue(syl);
    const level = tag.level?.trim() ?? "";

    if (!catalogue.levels.includes(level as SyllabusLevel)) {
      issues.push({
        code: "invalid-level-for-syllabus",
        syllabus: syl,
        level,
        message: `Level "${level}" is not valid for syllabus "${syl}" (allowed: ${catalogue.levels.join(", ")})`,
      });
      continue;
    }

    // 1. Paper format & mark bounds rules
    const allowedFormatsAtLevel = ALLOWED_PAPER_FORMATS[syl][level];
    if (allowedFormatsAtLevel && !allowedFormatsAtLevel.has(input.format)) {
      issues.push({
        code: "paper-format-disallowed",
        syllabus: syl,
        level,
        message: `Format "${input.format}" is not assessed at ${syl.toUpperCase()} level "${level}"`,
      });
    }

    if (input.totalMarks !== undefined) {
      if (input.format === "mcq" && input.totalMarks !== 1) {
        issues.push({
          code: "paper-marks-out-of-bounds",
          syllabus: syl,
          level,
          message: `Single-best-answer MCQ in ${syl.toUpperCase()} Paper 1 must carry exactly 1 mark (received totalMarks=${String(input.totalMarks)})`,
        });
      } else if (
        input.format === "structured" &&
        (!Number.isInteger(input.totalMarks) ||
          input.totalMarks < 2 ||
          input.totalMarks > 20)
      ) {
        issues.push({
          code: "paper-marks-out-of-bounds",
          syllabus: syl,
          level,
          message: `Structured multipart question in ${syl.toUpperCase()} must carry an integer mark total in [2, 20] (received totalMarks=${String(input.totalMarks)})`,
        });
      }
    }

    // 2. Topic & Subtopic catalogue membership + Level leakage check
    const topicSpec = tag.topicId?.trim() ? getTopicById(tag.topicId.trim()) : undefined;
    if (!topicSpec) {
      issues.push({
        code: "unknown-topic-id",
        syllabus: syl,
        level,
        message: `Unknown topicId "${String(tag.topicId)}"`,
      });
    } else {
      if (topicSpec.syllabus !== syl) {
        issues.push({
          code: "topic-syllabus-mismatch",
          syllabus: syl,
          level,
          message: `Topic "${topicSpec.id}" belongs to syllabus "${topicSpec.syllabus}", not "${syl}"`,
        });
      }
      if (!topicSpec.levelsCovered.includes(level as SyllabusLevel)) {
        issues.push({
          code: "level-leakage",
          syllabus: syl,
          level,
          message: `Topic "${topicSpec.id}" (${topicSpec.code}: ${topicSpec.title}) is only assessed at [${topicSpec.levelsCovered.join(", ")}] and leaks higher-tier content into "${level}"`,
        });
      }
    }

    if (tag.subtopicId?.trim()) {
      const subId = tag.subtopicId.trim();
      const subSpec = getSubtopicById(subId);
      if (!subSpec) {
        issues.push({
          code: "unknown-subtopic-id",
          syllabus: syl,
          level,
          message: `Unknown subtopicId "${subId}"`,
        });
      } else {
        if (subSpec.syllabus !== syl) {
          issues.push({
            code: "topic-syllabus-mismatch",
            syllabus: syl,
            level,
            message: `Subtopic "${subId}" belongs to syllabus "${subSpec.syllabus}", not "${syl}"`,
          });
        }
        if (
          topicSpec &&
          !topicSpec.subtopics.some((s) => s.id === subSpec.id)
        ) {
          issues.push({
            code: "subtopic-topic-mismatch",
            syllabus: syl,
            level,
            message: `Subtopic "${subId}" does not belong to topic "${topicSpec.id}"`,
          });
        }
        if (!subSpec.levelsCovered.includes(level as SyllabusLevel)) {
          issues.push({
            code: "level-leakage",
            syllabus: syl,
            level,
            message: `Subtopic "${subSpec.id}" (${subSpec.code}: ${subSpec.title}) is strictly [${subSpec.levelsCovered.join(", ")}]-only and cannot appear at "${level}"`,
          });
        }
        const isCrossBoardOptionFormat =
          syl === "alevel" &&
          Boolean(subSpec.isOption || topicSpec?.isOption) &&
          (input.format === "mcq" || input.format === "structured");
        if (
          !subSpec.questionFormats.includes(input.format) &&
          !isCrossBoardOptionFormat
        ) {
          issues.push({
            code: "paper-format-disallowed",
            syllabus: syl,
            level,
            message: `Subtopic "${subSpec.id}" does not permit format "${input.format}"`,
          });
        }
        const mappingSubtopics = conceptEntry?.mappings[syl]?.subtopicIds ?? [];
        if (
          conceptEntry &&
          !subSpec.canonicalConcepts.includes(conceptEntry.conceptId) &&
          !mappingSubtopics.includes(subSpec.id)
        ) {
          issues.push({
            code: "concept-subtopic-mismatch",
            syllabus: syl,
            level,
            message: `Subtopic "${subSpec.id}" does not cover concept "${conceptEntry.conceptId}" (covers: ${subSpec.canonicalConcepts.join(", ")})`,
          });
        }
      }
    }

    // 3. Crosswalk Concept Inclusion, Retired IB 2016 Exclusions & HL/Y13 Leakage
    if (conceptEntry) {
      if (syl === "ib" && RETIRED_IB_2016_CONCEPTS.has(conceptEntry.conceptId)) {
        issues.push({
          code: "retired-ib-2016-exclusion",
          syllabus: "ib",
          level,
          message: `Concept "${conceptEntry.conceptId}" was retired in IB Physics 2025 (${conceptEntry.mappings.ib.assumptionAndSignNotes})`,
        });
      }

      const mapping = conceptEntry.mappings[syl];
      if (!mapping.included) {
        issues.push({
          code: "concept-excluded-from-syllabus",
          syllabus: syl,
          level,
          message: `Concept "${conceptEntry.conceptId}" is excluded from syllabus "${syl}": ${mapping.assumptionAndSignNotes}`,
        });
      } else {
        if (!mapping.levels.includes(level as SyllabusLevel)) {
          const isHigherTierLeak =
            (syl === "ib" && level === "SL") ||
            (syl === "alevel" && level === "Y12") ||
            (syl === "ncuk" && level === "IFY-S1");
          issues.push({
            code: isHigherTierLeak ? "level-leakage" : "concept-level-mismatch",
            syllabus: syl,
            level,
            message: `Concept "${conceptEntry.conceptId}" is restricted to [${mapping.levels.join(", ")}] in ${syl.toUpperCase()} and cannot be assigned to "${level}"`,
          });
        }
        const isCrossBoardConceptOption =
          syl === "alevel" &&
          mapping.topicIds.includes("alevel-options-9-13") &&
          (input.format === "mcq" || input.format === "structured");
        if (
          !mapping.questionFormats.includes(input.format) &&
          !isCrossBoardConceptOption
        ) {
          issues.push({
            code: "paper-format-disallowed",
            syllabus: syl,
            level,
            message: `Concept "${conceptEntry.conceptId}" does not support format "${input.format}" in ${syl.toUpperCase()}`,
          });
        }
      }
    }

    // 4. IB 2025 Retired Content & HL-into-SL Spec/Prose Guards
    if (syl === "ib") {
      if (specKind && RETIRED_IB_2016_SPEC_KINDS.has(specKind)) {
        issues.push({
          code: "retired-ib-2016-exclusion",
          syllabus: "ib",
          level,
          message: `Scenario kind "${specKind}" assesses retired IB 2016 content excluded from IB Physics 2025`,
        });
      }
      if (input.scenarioSpec) {
        for (const key of Object.keys(input.scenarioSpec)) {
          if (RETIRED_IB_2016_SPEC_KEYS.has(key)) {
            issues.push({
              code: "retired-ib-2016-exclusion",
              syllabus: "ib",
              level,
              message: `scenarioSpec parameter "${key}" assesses retired IB 2016 capacitance/thin-lens content`,
            });
          }
          if (level === "SL" && IB_HL_ONLY_SPEC_KEYS.has(key)) {
            issues.push({
              code: "level-leakage",
              syllabus: "ib",
              level: "SL",
              message: `scenarioSpec parameter "${key}" requires IB HL-only equations on an SL item`,
            });
          }
        }
      }
      for (const rule of RETIRED_IB_2016_PROSE_PATTERNS) {
        if (rule.pattern.test(studentProse)) {
          issues.push({
            code: "retired-ib-2016-exclusion",
            syllabus: "ib",
            level,
            message: `IB 2025 student question references ${rule.label}`,
          });
        }
      }
    }
  }

  // 5. Gravity Convention Check (`g = 9.8` IB 2025 vs `g = 9.81` UK A-Level / NCUK IFY)
  const specEarthG = extractScenarioEarthGravity(input.scenarioSpec);
  const proseG = extractExplicitEarthGravityMentions(fullText);
  const hasIb = checkedSyllabiSet.has("ib");
  const has981Board =
    checkedSyllabiSet.has("alevel") || checkedSyllabiSet.has("ncuk");

  if (hasIb && has981Board) {
    if (
      specEarthG !== undefined ||
      proseG.mentions98 ||
      proseG.mentions981 ||
      proseG.mentions10
    ) {
      issues.push({
        code: "gravity-convention-mismatch",
        message:
          "Earth-gravity item cannot simultaneously tag IB (g = 9.8 m s^-2) and UK A-Level/NCUK (g = 9.81 m s^-2)",
      });
    }
  } else if (hasIb) {
    if (specEarthG !== undefined && Math.abs(specEarthG - 9.8) > 1e-6) {
      issues.push({
        code: "gravity-convention-mismatch",
        syllabus: "ib",
        message: `IB Physics 2025 Data Booklet specifies g = 9.8 m s^-2, but scenarioSpec sets g = ${String(specEarthG)}`,
      });
    }
    if (proseG.mentions981 || proseG.mentions10) {
      issues.push({
        code: "gravity-convention-mismatch",
        syllabus: "ib",
        message:
          "IB Physics 2025 question prose/solution states non-IB gravity convention (g = 9.81 or g = 10 instead of g = 9.8 m s^-2)",
      });
    }
  } else if (has981Board) {
    const targetSyl: SyllabusId = checkedSyllabiSet.has("alevel")
      ? "alevel"
      : "ncuk";
    if (specEarthG !== undefined && Math.abs(specEarthG - 9.81) > 1e-6) {
      issues.push({
        code: "gravity-convention-mismatch",
        syllabus: targetSyl,
        message: `UK A-Level / NCUK IFY Data Booklet specifies g = 9.81 m s^-2, but scenarioSpec sets g = ${String(specEarthG)}`,
      });
    }
    if (proseG.mentions98 || proseG.mentions10) {
      issues.push({
        code: "gravity-convention-mismatch",
        syllabus: targetSyl,
        message:
          "UK A-Level / NCUK IFY question prose/solution states g = 9.8 or g = 10 instead of Booklet value g = 9.81 m s^-2",
      });
    }
  }

  return {
    aligned: issues.length === 0,
    issues,
    checkedSyllabi: [...checkedSyllabiSet],
  };
}
