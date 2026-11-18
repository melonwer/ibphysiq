import fs from "node:fs";
import path from "node:path";

import {
  checkSyllabusAlignment,
  coerceRolloutRecord,
  computeDiversityMetrics,
  computeWilsonConfidenceInterval,
  evaluateBenchmarkRollouts,
  evaluateSingleRollout,
  extractJsonObjectFromAssistantText,
  formatWilsonPercent,
  ItemRolloutEvaluation,
  parsePromptMetadataFromRecord,
  solveStep1Batch,
  solveStep1Proposal,
} from "@/lib/benchmark";
import {
  generateNovelBenchmarkPrompts,
  NOVEL_BASE_SEED,
} from "@/scripts/benchmark/generate-novel-prompts";

describe("SixthPhysics-Bench v1.0 — Stats & Wilson 95% CIs", () => {
  it("computes exact two-sided 95% Wilson score confidence intervals", () => {
    const empty = computeWilsonConfidenceInterval(0, 0);
    expect(empty).toEqual({
      successes: 0,
      total: 0,
      rate: 0,
      lower95: 0,
      upper95: 0,
      confidenceLevel: 0.95,
    });

    const zeroSuccess = computeWilsonConfidenceInterval(0, 100);
    expect(zeroSuccess.rate).toBe(0);
    expect(zeroSuccess.lower95).toBe(0);
    expect(zeroSuccess.upper95).toBeGreaterThan(0.03);
    expect(zeroSuccess.upper95).toBeLessThan(0.04);

    const fullSuccess = computeWilsonConfidenceInterval(100, 100);
    expect(fullSuccess.rate).toBe(1);
    expect(fullSuccess.upper95).toBe(1);
    expect(fullSuccess.lower95).toBeGreaterThan(0.96);
    expect(fullSuccess.lower95).toBeLessThan(0.97);

    const half = computeWilsonConfidenceInterval(50, 100);
    expect(half.rate).toBe(0.5);
    expect(half.lower95).toBeCloseTo(0.403832, 5);
    expect(half.upper95).toBeCloseTo(0.596168, 5);
    expect(formatWilsonPercent(half, 1)).toBe("50.0% [40.4%, 59.6%] (50/100)");

    expect(() => computeWilsonConfidenceInterval(-1, 10)).toThrow();
    expect(() => computeWilsonConfidenceInterval(11, 10)).toThrow();
  });

  it("computes stem 3-gram Jaccard diversity and parameter signature uniqueness", () => {
    const baseEval: Omit<
      ItemRolloutEvaluation,
      "id" | "itemId" | "stemText" | "parameterSignature"
    > = {
      domain: "mechanics",
      conceptId: "kinematics-suvat",
      templateArchetype: "suvat-braking",
      format: "mcq",
      difficulty: "standard",
      syllabi: [{ syllabus: "ib", level: "SL", topicId: "ib-theme-a" }],
      seed: 1,
      step1JsonValid: true,
      step1SolverPass: true,
      step2JsonValid: true,
      step2AuthorGatePass: true,
      inferredTargetKeys: ["stoppingDistanceM"],
      gateIssues: [],
      syllabusAligned: true,
      syllabusIssues: [],
      endToEndVerified: true,
    };

    const diverseItems: ItemRolloutEvaluation[] = [
      {
        ...baseEval,
        id: "i1",
        itemId: "i1",
        stemText:
          "A high-speed electric locomotive travelling at 42 m s^-1 applies emergency uniform braking at 2.8 m s^-2 along a straight level track.",
        parameterSignature: "mechanics|suvat|u=42|a=-2.8",
      },
      {
        ...baseEval,
        id: "i2",
        itemId: "i2",
        stemText:
          "An autonomous warehouse tug decelerates uniformly from 6.5 m s^-1 to rest across a loading bay floor of length 14 m.",
        parameterSignature: "mechanics|suvat|u=6.5|s=14",
      },
      {
        ...baseEval,
        id: "i3",
        itemId: "i3",
        stemText:
          "An autonomous warehouse tug decelerates uniformly from 6.5 m s^-1 to rest across a loading bay floor of length 14 m.",
        parameterSignature: "mechanics|suvat|u=6.5|s=14",
      },
    ];

    const div = computeDiversityMetrics(diverseItems);
    expect(div.evaluatedCount).toBe(3);
    expect(div.nonEmptyStemCount).toBe(3);
    expect(div.uniqueExactStemCount).toBe(2);
    expect(div.uniqueStemFingerprintCount).toBe(2);
    expect(div.uniqueParameterSignatureCount).toBe(2);
    // 1 identical pair out of 3 pairs => 1/3
    expect(div.nearDuplicatePairRate).toBeCloseTo(1 / 3, 5);
    expect(div.meanPairwise3GramJaccardDistance).toBeGreaterThan(0.5);
  });
});

describe("SixthPhysics-Bench v1.0 — Step 1 Batch Solver & Wrapper Unwrapping", () => {
  const validBankedCurveStep1 = JSON.stringify({
    action: "solve_and_render_scenario",
    domain: "grav-astro",
    scenarioSpec: {
      kind: "banked-curve",
      id: "test-banked-curve-1",
      massKg: 160,
      radiusM: 32,
      bankAngleDeg: 14,
      staticFrictionCoeff: 0,
      gravityMs2: 9.8,
    },
    hiddenQuantities: [
      "idealSpeedMs",
      "speedMs",
      "normalForceN",
      "centripetalAccelMs2",
      "centripetalForceN",
    ],
    questionPlan: {
      targetSummary: "Find ideal frictionless banking speed",
      distractorStrategy: ["swap sin/cos", "omit square root"],
    },
  });

  it("solves valid Step 1 proposals, renders student-safe SVGs, and unwraps <think> / code fences", () => {
    const wrapped = `<think>Reasoning silently</think>\n\`\`\`json\n${validBankedCurveStep1}\n\`\`\``;
    const extracted = extractJsonObjectFromAssistantText(wrapped);
    expect(extracted.ok).toBe(true);

    const receipt = solveStep1Proposal({
      id: "test-banked-curve-1",
      domain: "grav-astro",
      assistantStep1Raw: wrapped,
    });
    expect(receipt.valid).toBe(true);
    if (receipt.valid) {
      expect(receipt.formattedQuantities3sf.idealSpeedMs).toBe("8.84");
      expect(receipt.svgMarkup).toContain("<svg");
      expect(receipt.svgMarkup).not.toContain("8.84");
      const parsedToolReceipt = JSON.parse(receipt.toolReceiptJson) as {
        status: string;
        formattedQuantities3sf: Record<string, string>;
      };
      expect(parsedToolReceipt.status).toBe("verified");
      expect(parsedToolReceipt.formattedQuantities3sf.idealSpeedMs).toBe(
        "8.84",
      );
    }
  });

  it("rejects malformed JSON, missing hiddenQuantities, domain conflicts, and invalid scenario parameters", () => {
    const batch = solveStep1Batch([
      {
        id: "bad-json",
        domain: "mechanics",
        assistantStep1Raw: "not valid json",
      },
      {
        id: "empty-hidden",
        domain: "grav-astro",
        assistantStep1Raw: JSON.stringify({
          domain: "grav-astro",
          scenarioSpec: { kind: "banked-curve", massKg: 100, radiusM: 20, bankAngleDeg: 10 },
          hiddenQuantities: [],
          questionPlan: { targetSummary: "test" },
        }),
      },
      {
        id: "domain-conflict",
        domain: "circuits",
        assistantStep1Raw: validBankedCurveStep1,
      },
      {
        id: "invalid-physics",
        domain: "grav-astro",
        assistantStep1Raw: JSON.stringify({
          domain: "grav-astro",
          scenarioSpec: {
            kind: "banked-curve",
            massKg: -50,
            radiusM: -10,
            bankAngleDeg: 140,
          },
          hiddenQuantities: ["idealSpeedMs"],
          questionPlan: { targetSummary: "test" },
        }),
      },
    ]);

    expect(batch[0].valid).toBe(false);
    if (!batch[0].valid) {
      expect(batch[0].jsonValid).toBe(false);
      expect(batch[0].errorStage).toBe("json-parse");
    }

    expect(batch[1].valid).toBe(false);
    if (!batch[1].valid) {
      expect(batch[1].jsonValid).toBe(true);
      expect(batch[1].errorStage).toBe("step1-schema");
    }

    expect(batch[2].valid).toBe(false);
    if (!batch[2].valid) {
      expect(batch[2].errorStage).toBe("domain-mismatch");
    }

    expect(batch[3].valid).toBe(false);
    if (!batch[3].valid) {
      expect(batch[3].errorStage).toBe("scenario-validation");
    }
  });
});

describe("SixthPhysics-Bench v1.0 — Syllabus Alignment Checker", () => {
  it("accepts valid IB 2025, UK A-Level, and NCUK IFY items including planetary gravity", () => {
    const ibValid = checkSyllabusAlignment({
      id: "ib-ok",
      syllabi: [
        {
          syllabus: "ib",
          level: "SL",
          topicId: "ib-theme-a",
          subtopicId: "ib-a1-kinematics",
        },
      ],
      conceptId: "projectile-motion",
      format: "mcq",
      totalMarks: 1,
      scenarioSpec: { gravityMs2: 9.8 },
      stem: "A ball is projected horizontally at 12 m s^-1 on Earth (g = 9.8 m s^-2).",
    });
    expect(ibValid.aligned).toBe(true);

    const marsValid = checkSyllabusAlignment({
      id: "ib-mars",
      syllabi: [
        {
          syllabus: "ib",
          level: "SL",
          topicId: "ib-theme-a",
          subtopicId: "ib-a1-kinematics",
        },
      ],
      conceptId: "kinematics-suvat",
      format: "mcq",
      totalMarks: 1,
      scenarioSpec: { gravityMs2: 3.72 },
      stem: "On Mars, where gravitational field strength is 3.72 m s^-2, a lander drops a probe.",
    });
    expect(marsValid.aligned).toBe(true);

    const alevelNcukValid = checkSyllabusAlignment({
      id: "al-ncuk-ok",
      syllabi: [
        {
          syllabus: "alevel",
          level: "Y12",
          topicId: "alevel-sec4-mechanics-materials",
          subtopicId: "alevel-3-4-1-force-energy-momentum",
        },
        {
          syllabus: "ncuk",
          level: "IFY-S1",
          topicId: "ncuk-ac2",
          subtopicId: "ncuk-ac2-1",
        },
      ],
      conceptId: "projectile-motion",
      format: "structured",
      totalMarks: 6,
      scenarioSpec: { gravityMs2: 9.81 },
      stem: "Take g = 9.81 m s^-2.",
    });
    expect(alevelNcukValid.aligned).toBe(true);
  });

  it("rejects wrong gravity conventions, retired IB 2016 topics, and HL/Y13/S2 leakage into SL/Y12/S1", () => {
    // 1. IB item using g = 9.81 instead of 9.8
    const wrongIbG = checkSyllabusAlignment({
      id: "bad-ib-g",
      syllabi: [
        {
          syllabus: "ib",
          level: "SL",
          topicId: "ib-theme-a",
          subtopicId: "ib-a1-kinematics",
        },
      ],
      conceptId: "projectile-motion",
      format: "mcq",
      totalMarks: 1,
      scenarioSpec: { gravityMs2: 9.81 },
      stem: "Take g = 9.81 m s^-2.",
    });
    expect(wrongIbG.aligned).toBe(false);
    expect(wrongIbG.issues.map((i) => i.code)).toContain(
      "gravity-convention-mismatch",
    );

    // 2. UK A-Level item using g = 9.8 instead of 9.81
    const wrongAlevelG = checkSyllabusAlignment({
      id: "bad-al-g",
      syllabi: [
        {
          syllabus: "alevel",
          level: "Y12",
          topicId: "alevel-sec4-mechanics-materials",
          subtopicId: "alevel-3-4-1-force-energy-momentum",
        },
      ],
      conceptId: "kinematics-suvat",
      format: "mcq",
      totalMarks: 1,
      stem: "Take g = 9.8 m s^-2.",
    });
    expect(wrongAlevelG.aligned).toBe(false);
    expect(wrongAlevelG.issues.map((i) => i.code)).toContain(
      "gravity-convention-mismatch",
    );

    // 3. Retired IB 2016 RC capacitor concept & farad prose on IB 2025
    const retiredIbCap = checkSyllabusAlignment({
      id: "bad-ib-cap",
      syllabi: [
        {
          syllabus: "ib",
          level: "HL",
          topicId: "ib-theme-b",
          subtopicId: "ib-b5-current-circuits",
        },
      ],
      conceptId: "capacitor-rc-decay",
      format: "mcq",
      totalMarks: 1,
      stem: "A 47 μF capacitor discharges through a 10 kΩ resistor.",
    });
    expect(retiredIbCap.aligned).toBe(false);
    expect(retiredIbCap.issues.map((i) => i.code)).toContain(
      "retired-ib-2016-exclusion",
    );

    // 4. IB HL-only rigid body mechanics leaked into IB SL
    const hlIntoSl = checkSyllabusAlignment({
      id: "bad-hl-sl",
      syllabi: [
        {
          syllabus: "ib",
          level: "SL",
          topicId: "ib-theme-a",
          subtopicId: "ib-a4-rigid-body-mechanics",
        },
      ],
      conceptId: "rigid-body-rotational-dynamics",
      format: "structured",
      totalMarks: 5,
      stem: "A flywheel rotates from rest.",
    });
    expect(hlIntoSl.aligned).toBe(false);
    expect(hlIntoSl.issues.map((i) => i.code)).toContain("level-leakage");

    // 5. UK A-Level Y13 Section 7 Fields leaked into AS / Y12
    const y13IntoY12 = checkSyllabusAlignment({
      id: "bad-y13-y12",
      syllabi: [
        {
          syllabus: "alevel",
          level: "Y12",
          topicId: "alevel-sec7-fields",
          subtopicId: "alevel-3-7-2-gravitational-fields",
        },
      ],
      conceptId: "gravitational-force-field",
      format: "mcq",
      totalMarks: 1,
      stem: "Two planets attract each other.",
    });
    expect(y13IntoY12.aligned).toBe(false);
    expect(y13IntoY12.issues.map((i) => i.code)).toContain("level-leakage");

    // 6. MCQ with invalid mark allocation
    const badMcqMarks = checkSyllabusAlignment({
      id: "bad-mcq-marks",
      syllabi: [
        {
          syllabus: "ncuk",
          level: "IFY",
          topicId: "ncuk-ac1",
          subtopicId: "ncuk-ac1-1",
        },
      ],
      conceptId: "si-units-dimensional-analysis",
      format: "mcq",
      totalMarks: 4,
      stem: "Which unit is equivalent to the joule?",
    });
    expect(badMcqMarks.aligned).toBe(false);
    expect(badMcqMarks.issues.map((i) => i.code)).toContain(
      "paper-marks-out-of-bounds",
    );
  });
});

describe("SixthPhysics-Bench v1.0 — End-to-End Rollout Evaluator (Positive & Adversarial)", () => {
  const valPath = path.resolve(
    process.cwd(),
    "dataset/sixthphysics-bank/distillation/val.jsonl",
  );
  const valLines = fs
    .readFileSync(valPath, "utf8")
    .trim()
    .split("\n")
    .slice(0, 20)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

  it("verifies positive held-out bank traces (MCQ with omitted targetQuantityKey + Structured Paper 2)", () => {
    const prompts = valLines.map((r, i) => parsePromptMetadataFromRecord(r, i));
    const rollouts = valLines.map((r, i) => coerceRolloutRecord(r, i));

    // Also strip subpart targetQuantityKeys on structured rollouts to verify omitted-key inference on Paper 2!
    const strippedRollouts = rollouts.map((r) => {
      if (!r.assistantStep2Raw) return r;
      const step2 = JSON.parse(r.assistantStep2Raw) as Record<string, unknown>;
      delete step2.targetQuantityKey;
      if (Array.isArray(step2.parts)) {
        step2.parts = (step2.parts as Array<Record<string, unknown>>).map(
          (p) => {
            const copy = { ...p };
            delete copy.targetQuantityKey;
            return copy;
          },
        );
      }
      return { ...r, assistantStep2Raw: JSON.stringify(step2) };
    });

    const { report, itemEvaluations } = evaluateBenchmarkRollouts(
      prompts,
      strippedRollouts,
    );
    expect(report.totalPrompts).toBe(20);
    expect(report.headline.step1SolverPassRate).toBe(1);
    expect(report.headline.step2AuthorGatePassRate).toBe(1);
    expect(report.headline.syllabusAlignmentRate).toBe(1);
    expect(report.headline.endToEndVerifiedRate).toBe(1);
    expect(itemEvaluations.every((x) => x.inferredTargetKeys.length >= 1)).toBe(
      true,
    );
  });

  it("supports K=4 multi-sample rollouts (id='<itemId>__k0..3') for Round 3 RFT/DPO grading", () => {
    const mcqRow = valLines.find((r) => {
      const p = parsePromptMetadataFromRecord(r);
      return p.format === "mcq";
    })!;
    const prompt = parsePromptMetadataFromRecord(mcqRow);
    const baseRollout = coerceRolloutRecord(mcqRow);

    const badStep2 = JSON.parse(baseRollout.assistantStep2Raw!) as {
      options: Array<{ label: string; text: string; isCorrect: boolean; distractorRationale?: string }>;
    };
    badStep2.options = badStep2.options.map((o) =>
      o.isCorrect ? { ...o, text: "99999 m s^-1" } : o,
    );

    const kRollouts = [
      { ...baseRollout, id: `${prompt.id}__k0`, itemId: prompt.id },
      {
        ...baseRollout,
        id: `${prompt.id}__k1`,
        itemId: prompt.id,
        assistantStep2Raw: JSON.stringify(badStep2),
      },
    ];

    const { report, rolloutEvaluations } = evaluateBenchmarkRollouts(
      [prompt],
      kRollouts,
    );
    expect(rolloutEvaluations).toHaveLength(2);
    expect(rolloutEvaluations[0].id).toBe(`${prompt.id}__k0`);
    expect(rolloutEvaluations[0].itemId).toBe(prompt.id);
    expect(rolloutEvaluations[0].endToEndVerified).toBe(true);
    expect(rolloutEvaluations[1].id).toBe(`${prompt.id}__k1`);
    expect(rolloutEvaluations[1].endToEndVerified).toBe(false);
    expect(report.headline.endToEndVerifiedRate).toBe(0.5);
  });

  it("rejects adversarial wrong numerical answers, echoed input givens, stem leaks, missing rationales, and unbalanced marks", () => {
    const prompt = {
      id: "adv-banked-1",
      syllabi: [
        {
          syllabus: "ib" as const,
          level: "SL",
          topicId: "ib-theme-a",
          subtopicId: "ib-a2-forces-momentum",
        },
      ],
      domain: "grav-astro" as const,
      conceptId: "uniform-circular-motion",
      templateArchetype: "banked-curve-design-and-friction",
      visualFamily: "grav-astro",
      format: "mcq" as const,
      difficulty: "foundation" as const,
      totalMarks: 1,
      seed: 20261337,
    };

    const step1Raw = JSON.stringify({
      action: "solve_and_render_scenario",
      domain: "grav-astro",
      scenarioSpec: {
        kind: "banked-curve",
        id: "adv-banked-1",
        massKg: 160,
        radiusM: 32,
        bankAngleDeg: 14,
        staticFrictionCoeff: 0,
        gravityMs2: 9.8,
      },
      hiddenQuantities: ["idealSpeedMs", "speedMs"],
      questionPlan: {
        targetSummary: "Find ideal frictionless banking speed",
      },
    });

    // Adversarial Case 1: Correct option echoes input given `160` instead of solved `8.84`
    const echoedGivenEval = evaluateSingleRollout(prompt, {
      id: "adv-echo",
      assistantStep1Raw: step1Raw,
      assistantStep2Raw: JSON.stringify({
        format: "mcq",
        difficulty: "foundation",
        stem: "A 160 kg cyclist rounds a track of radius 32 m banked at 14 deg (g = 9.8 m s^-2). Find the ideal speed.",
        options: [
          { label: "A", text: "160 m s^-1", isCorrect: true },
          {
            label: "B",
            text: "17.4 m s^-1",
            isCorrect: false,
            distractorRationale: "Used cos instead of tan.",
          },
          {
            label: "C",
            text: "35.5 m s^-1",
            isCorrect: false,
            distractorRationale: "Inverted tan.",
          },
          {
            label: "D",
            text: "78.2 m s^-1",
            isCorrect: false,
            distractorRationale: "Omitted square root.",
          },
        ],
        workedSolution: "Speed is 160 m s^-1.",
        markScheme: [{ code: "A1", criterion: "160 m s^-1", marks: 1 }],
        totalMarks: 1,
      }),
    });
    expect(echoedGivenEval.endToEndVerified).toBe(false);
    expect(echoedGivenEval.gateIssues.map((g) => g.code)).toContain(
      "ground-truth-mismatch",
    );

    // Adversarial Case 2: Student stem leaks target answer 8.84 m s^-1 AND distractor lacks rationale
    const stemLeakEval = evaluateSingleRollout(prompt, {
      id: "adv-leak",
      assistantStep1Raw: step1Raw,
      assistantStep2Raw: JSON.stringify({
        format: "mcq",
        difficulty: "foundation",
        stem: "A 160 kg cyclist rounds a 32 m curve banked at 14 deg (g = 9.8 m s^-2) at the design speed of 8.84 m s^-1. What is this design speed?",
        options: [
          { label: "A", text: "8.84 m s^-1", isCorrect: true },
          { label: "B", text: "17.4 m s^-1", isCorrect: false },
          {
            label: "C",
            text: "35.5 m s^-1",
            isCorrect: false,
            distractorRationale: "Inverted tan.",
          },
          {
            label: "D",
            text: "78.2 m s^-1",
            isCorrect: false,
            distractorRationale: "Omitted square root.",
          },
        ],
        workedSolution: "v = sqrt(9.8 * 32 * tan 14 deg) = 8.84 m s^-1.",
        markScheme: [{ code: "A1", criterion: "8.84 m s^-1", marks: 1 }],
        totalMarks: 1,
      }),
    });
    expect(stemLeakEval.endToEndVerified).toBe(false);
    const codes = stemLeakEval.gateIssues.map((g) => g.code);
    expect(codes).toContain("stem-answer-leak");
    expect(codes).toContain("mcq-missing-distractor-rationale");

    // Adversarial Case 3: Structured question with unbalanced marks
    const structPrompt = { ...prompt, format: "structured" as const, totalMarks: 4 };
    const badMarksEval = evaluateSingleRollout(structPrompt, {
      id: "adv-struct-marks",
      assistantStep1Raw: step1Raw,
      assistantStep2Raw: JSON.stringify({
        format: "structured",
        difficulty: "foundation",
        stem: "A 160 kg cyclist rounds a 32 m curve banked at 14 deg (g = 9.8 m s^-2).",
        parts: [
          {
            partId: "a",
            prompt: "Calculate the ideal frictionless banking speed.",
            marks: 2,
            expectedAnswer: "8.84 m s^-1",
            workingSteps: ["v = sqrt(g r tan theta) = 8.84 m s^-1"],
          },
        ],
        workedSolution: "v = 8.84 m s^-1.",
        markScheme: [
          { code: "M1", partId: "a", criterion: "Uses tan theta = v^2/(gr)", marks: 1 },
          { code: "A1", partId: "a", criterion: "8.84 m s^-1", marks: 1 },
        ],
        totalMarks: 4,
      }),
    });
    expect(badMarksEval.endToEndVerified).toBe(false);
    expect(badMarksEval.gateIssues.map((g) => g.code)).toContain(
      "mark-sum-mismatch",
    );
  });
});

describe("SixthPhysics-Bench v1.0 — Novel-1500 Stratified Prompt Suite", () => {
  it("generates 1,500 syllabus-aligned out-of-sample prompts across all 3 syllabi, 23 topics, 78 subtopics, and 11 domains", () => {
    const prompts = generateNovelBenchmarkPrompts(500, NOVEL_BASE_SEED);
    expect(prompts).toHaveLength(1500);
    expect(prompts[0].seed).toBe(90_000_001);
    expect(prompts[1499].seed).toBe(90_001_500);

    const bySyl = { ib: 0, alevel: 0, ncuk: 0 };
    const domains = new Set<string>();
    const subtopics = new Set<string>();
    const seeds = new Set<number>();

    for (const p of prompts) {
      bySyl[p.metadata.syllabi[0].syllabus] += 1;
      domains.add(p.metadata.domain);
      if (p.metadata.syllabi[0].subtopicId) {
        subtopics.add(p.metadata.syllabi[0].subtopicId);
      }
      seeds.add(p.seed);
    }

    expect(bySyl).toEqual({ ib: 500, alevel: 500, ncuk: 500 });
    expect(seeds.size).toBe(1500);
    expect(domains.size).toBe(11);
    expect(subtopics.size).toBe(78);
  });
});
