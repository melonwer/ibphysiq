import {
  registerVisualModule,
  resetDomainRegistryToDefaults,
} from "@/lib/bank-pipeline/domain-registry";
import { extractNumbersFromPhysicsText } from "@/lib/bank-pipeline/numeric-checker";
import { verifyCandidateWithGate } from "@/lib/bank-pipeline/package-gate";
import { buildSampleCandidates } from "@/lib/bank-pipeline/sample-candidates";
import {
  CandidateQuestionInput,
  PhysicsDomainId,
} from "@/lib/bank-pipeline/types";

describe("package-gate", () => {
  afterEach(() => {
    resetDomainRegistryToDefaults();
  });
  it("accepts all 15 solver-verified sample candidates across all 10 visual domains and pure-calculation", () => {
    const samples = buildSampleCandidates();
    expect(samples).toHaveLength(15);

    for (const candidate of samples) {
      const result = verifyCandidateWithGate(candidate);
      expect({
        id: candidate.id,
        valid: result.evaluation.valid,
        issues: result.evaluation.issues,
      }).toEqual({
        id: candidate.id,
        valid: true,
        issues: [],
      });
    }
  });

  it("rejects candidates when solver fails physical constraints or domain is unknown", () => {
    const base = buildSampleCandidates()[6]; // mechanics collision-loss
    const invalidScenario: CandidateQuestionInput = {
      ...base,
      id: "bad-ramp-height",
      scenarioSpec: {
        kind: "ramp-heating",
        weightN: 90,
        lengthM: 2,
        heightM: 5, // impossible: height > length
        speedMs: 1.2,
      },
    };
    const res = verifyCandidateWithGate(invalidScenario);
    expect(res.evaluation.valid).toBe(false);
    expect(res.evaluation.issues[0].code).toBe("scenario-validation-failed");

    const unknownDomain = verifyCandidateWithGate({
      ...base,
      id: "bad-domain",
      domain: "fluid-dynamics" as unknown as PhysicsDomainId,
    });
    expect(unknownDomain.evaluation.valid).toBe(false);
    expect(unknownDomain.evaluation.issues[0].code).toBe("unknown-domain");
  });

  it("rejects MCQ and structured candidates when answers or mark schemes disagree with solver ground truth", () => {
    const mcqBase = buildSampleCandidates()[2]; // circuits branch-heater, answer = 24.0 W
    const wrongMcq: CandidateQuestionInput = {
      ...mcqBase,
      id: "wrong-mcq-answer",
      options: mcqBase.options!.map((opt) =>
        opt.label === "B" ? { ...opt, text: "31.5 W" } : opt,
      ),
    };
    const resMcq = verifyCandidateWithGate(wrongMcq);
    expect(resMcq.evaluation.valid).toBe(false);
    expect(
      resMcq.evaluation.issues.some((i) => i.code === "ground-truth-mismatch"),
    ).toBe(true);

    const structBase = buildSampleCandidates()[1]; // shuttle-motion, distanceM = 63.0 m
    const wrongStruct: CandidateQuestionInput = {
      ...structBase,
      id: "wrong-struct-answer",
      parts: structBase.parts!.map((p) =>
        p.partId === "a" ? { ...p, expectedAnswer: "75.0 m" } : p,
      ),
    };
    const resStruct = verifyCandidateWithGate(wrongStruct);
    expect(resStruct.evaluation.valid).toBe(false);
    expect(
      resStruct.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);
  });

  it("rejects student stems that omit required givens or prematurely leak hidden answers", () => {
    const pureBase = buildSampleCandidates()[8]; // inputPowerW: 800, usefulPowerW: 600, durationS: 20
    const missingGiven: CandidateQuestionInput = {
      ...pureBase,
      id: "missing-duration-given",
      stem: "An electric winch motor draws 800 W of electrical input power and delivers 600 W of useful mechanical output power. How much energy is wasted?",
    };
    const resMissing = verifyCandidateWithGate(missingGiven);
    expect(resMissing.evaluation.valid).toBe(false);
    expect(
      resMissing.evaluation.issues.some(
        (i) => i.code === "missing-required-given",
      ),
    ).toBe(true);

    const leakedInStem: CandidateQuestionInput = {
      ...pureBase,
      id: "leaked-stem-answer",
      stem: `${pureBase.stem} (Note: wasted energy is 4000 J.)`,
    };
    const resLeak = verifyCandidateWithGate(leakedInStem);
    expect(resLeak.evaluation.valid).toBe(false);
    expect(
      resLeak.evaluation.issues.some((i) => i.code === "stem-answer-leak"),
    ).toBe(true);
  });

  it("accepts SI-prefixed givens (e.g. kΩ, nC) while enforcing MCQ option uniqueness and single correct choice", () => {
    const pureBase = buildSampleCandidates()[8];
    const siPrefixedGiven: CandidateQuestionInput = {
      ...pureBase,
      id: "si-prefix-ok",
      stem: "An electric winch motor draws 0.800 kW of electrical input power and delivers 0.600 kW of useful mechanical output power continuously for 20 s. How much energy is wasted to the surroundings in this 20 s interval?",
    };
    expect(verifyCandidateWithGate(siPrefixedGiven).evaluation.valid).toBe(
      true,
    );

    // Duplicate numerical value ("24 W" vs "24.0 W")
    const circuitsMcq = buildSampleCandidates()[2];
    const duplicateNumericMcq: CandidateQuestionInput = {
      ...circuitsMcq,
      id: "dup-num-mcq",
      options: [
        {
          label: "A",
          text: "24 W",
          isCorrect: false,
          distractorRationale: "Formatted without decimal.",
        },
        { label: "B", text: "24.0 W", isCorrect: true },
        {
          label: "C",
          text: "54.0 W",
          isCorrect: false,
          distractorRationale: "Wrong current.",
        },
        {
          label: "D",
          text: "73.5 W",
          isCorrect: false,
          distractorRationale: "Wrong voltage.",
        },
      ],
    };
    const dupRes = verifyCandidateWithGate(duplicateNumericMcq);
    expect(dupRes.evaluation.valid).toBe(false);
    expect(
      dupRes.evaluation.issues.some(
        (i) =>
          i.code === "mcq-duplicate-options" ||
          i.code === "mcq-distractor-matches-answer",
      ),
    ).toBe(true);

    // != 1 correct option
    const twoCorrectMcq: CandidateQuestionInput = {
      ...circuitsMcq,
      id: "two-correct-mcq",
      options: circuitsMcq.options!.map((o, idx) =>
        idx === 0 ? { ...o, isCorrect: true } : o,
      ),
    };
    const twoRes = verifyCandidateWithGate(twoCorrectMcq);
    expect(twoRes.evaluation.valid).toBe(false);
    expect(
      twoRes.evaluation.issues.some((i) => i.code === "mcq-non-unique-correct"),
    ).toBe(true);
  });

  it("rejects structured questions with unbalanced part marks, incomplete mark-scheme coverage, or invalid dependencies", () => {
    const structBase = buildSampleCandidates()[3]; // totalMarks = 6 (2 + 2 + 2)

    const badTotal: CandidateQuestionInput = {
      ...structBase,
      id: "bad-total-marks",
      totalMarks: 7,
    };
    expect(
      verifyCandidateWithGate(badTotal).evaluation.issues.some(
        (i) => i.code === "mark-sum-mismatch",
      ),
    ).toBe(true);

    const uncoveredPart: CandidateQuestionInput = {
      ...structBase,
      id: "uncovered-part-c",
      markScheme: structBase.markScheme.map((m) =>
        m.partId === "c" ? { ...m, partId: "b" } : m,
      ),
    };
    expect(
      verifyCandidateWithGate(uncoveredPart).evaluation.issues.some(
        (i) => i.code === "mark-scheme-coverage-mismatch",
      ),
    ).toBe(true);

    const forwardDep: CandidateQuestionInput = {
      ...structBase,
      id: "forward-dep",
      parts: structBase.parts!.map((p) =>
        p.partId === "a" ? { ...p, dependsOnPartIds: ["c"] } : p,
      ),
    };
    expect(
      verifyCandidateWithGate(forwardDep).evaluation.issues.some(
        (i) => i.code === "structured-dependency-invalid",
      ),
    ).toBe(true);
  });

  it("rejects malformed SVGs and SVGs leaking hiddenQuantities in <text>, <title>, or aria-label", () => {
    const pureBase = buildSampleCandidates()[8]; // wastedEnergyJ = 4000

    const malformedSvg = verifyCandidateWithGate({
      ...pureBase,
      id: "malformed-svg",
      svgMarkupOverride:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><g><line x1="0" y1="0" x2="10" y2="10"/></svg>',
    });
    expect(malformedSvg.evaluation.valid).toBe(false);
    expect(
      malformedSvg.evaluation.issues.some((i) => i.code === "svg-xml-invalid"),
    ).toBe(true);

    const leakInText = verifyCandidateWithGate({
      ...pureBase,
      id: "leak-svg-text",
      svgMarkupOverride:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect x="10" y="10" width="80" height="40"/><text x="50" y="30">Wasted = 4000 J</text></svg>',
    });
    expect(leakInText.evaluation.valid).toBe(false);
    expect(
      leakInText.evaluation.issues.some((i) => i.code === "svg-answer-leak"),
    ).toBe(true);

    const leakInAriaLabel = verifyCandidateWithGate({
      ...pureBase,
      id: "leak-svg-aria",
      svgMarkupOverride:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" aria-label="Winch diagram showing 4.00e3 J loss"><rect x="10" y="10" width="80" height="40"/></svg>',
    });
    expect(leakInAriaLabel.evaluation.valid).toBe(false);
    expect(
      leakInAriaLabel.evaluation.issues.some(
        (i) => i.code === "svg-answer-leak",
      ),
    ).toBe(true);

    const leakInTitle = verifyCandidateWithGate({
      ...pureBase,
      id: "leak-svg-title",
      svgMarkupOverride:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><title>wastedEnergyJ = 4000</title><rect x="10" y="10" width="80" height="40"/></svg>',
    });
    expect(leakInTitle.evaluation.valid).toBe(false);
    expect(
      leakInTitle.evaluation.issues.some((i) => i.code === "svg-answer-leak"),
    ).toBe(true);
  });

  it("rejects near-duplicate stems colliding with existing shard items", () => {
    const sample = buildSampleCandidates()[0];
    const first = verifyCandidateWithGate(sample);
    expect(first.evaluation.valid).toBe(true);

    const nearClone: CandidateQuestionInput = {
      ...sample,
      id: "sp-graphs-mcq-clone",
      stem: "An inspection rover travels along a straight rail! The velocity-time graph shows its motion over an 8.0 s interval. What total distance does the rover travel during the 8.0 s?",
    };
    const second = verifyCandidateWithGate(nearClone, {
      existingShardItems: [
        {
          id: sample.id,
          stem: sample.stem,
          stemFingerprint: first.evaluation.stemFingerprint,
        },
      ],
    });
    expect(second.evaluation.valid).toBe(false);
    expect(
      second.evaluation.issues.some((i) => i.code === "near-duplicate-stem"),
    ).toBe(true);
  });

  it("BLOCKER 1 regression: rejects quantitative MCQs missing resolvable targetQuantityKey (0 or 2 hiddenQuantities) and blocks qualitative-mode numeric bypass", () => {
    const graphsMcq = buildSampleCandidates()[0]; // sp-graphs-mcq-001, true distanceM = 27.0 m
    const forgedOptions = graphsMcq.options!.map((opt) =>
      opt.isCorrect ? { ...opt, text: "987654 units" } : opt,
    );

    // Case A: 2 hiddenQuantities, targetQuantityKey removed, wrong option "987654 units"
    const twoHiddenNoTarget: CandidateQuestionInput = {
      ...graphsMcq,
      id: "sp-graphs-mcq-bypass-2hidden",
      targetQuantityKey: undefined,
      hiddenQuantities: ["distanceM", "displacementM"],
      options: forgedOptions,
    };
    const resTwoHidden = verifyCandidateWithGate(twoHiddenNoTarget);
    expect(resTwoHidden.evaluation.valid).toBe(false);
    expect(
      resTwoHidden.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);

    // Case B: 0 hiddenQuantities, targetQuantityKey removed, wrong option "987654 units"
    const zeroHiddenNoTarget: CandidateQuestionInput = {
      ...graphsMcq,
      id: "sp-graphs-mcq-bypass-0hidden",
      targetQuantityKey: undefined,
      hiddenQuantities: [],
      options: forgedOptions,
    };
    const resZeroHidden = verifyCandidateWithGate(zeroHiddenNoTarget);
    expect(resZeroHidden.evaluation.valid).toBe(false);
    expect(
      resZeroHidden.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);

    // Case C: Attempting to abuse targetMode: "qualitative" with numeric option "987654 units"
    const fakeQualitativeNumeric: CandidateQuestionInput = {
      ...graphsMcq,
      id: "sp-graphs-mcq-fake-qualitative",
      targetMode: "qualitative",
      targetQuantityKey: undefined,
      hiddenQuantities: [],
      options: forgedOptions,
    };
    const resFakeQual = verifyCandidateWithGate(fakeQualitativeNumeric);
    expect(resFakeQual.evaluation.valid).toBe(false);
    expect(
      resFakeQual.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);

    // Case D: Legitimate qualitative MCQ verified against a non-numeric solver classification
    registerVisualModule("em-induction", {
      validate: () => ({ valid: true, issues: [] }),
      solve: () => ({
        inducedCurrentSense: "counterclockwise",
      }),
      render: () =>
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><circle cx="150" cy="100" r="50"/></svg>',
    });

    const validQualitativeMcq: CandidateQuestionInput = {
      id: "sp-em-qualitative-ok",
      conceptId: "lenz-law",
      templateArchetype: "increasing-into-page-flux",
      seed: 901,
      syllabi: [{ syllabus: "ib", level: "HL", topicId: "D.3" }],
      format: "mcq",
      targetMode: "qualitative",
      targetQuantityKey: "inducedCurrentSense",
      difficulty: "foundation",
      domain: "em-induction",
      scenarioSpec: { kind: "lenz-ring" },
      hiddenQuantities: ["inducedCurrentSense"],
      requiredGivens: [],
      stem: "A conducting ring lies in the plane of the page while a uniform magnetic field directed into the page increases steadily. What is the sense of the induced current in the ring?",
      options: [
        {
          label: "A",
          text: "Clockwise around the ring",
          isCorrect: false,
          distractorRationale: "Applies right-hand grip rule to the external field rather than the opposing induced field.",
        },
        {
          label: "B",
          text: "Counterclockwise around the ring",
          isCorrect: true,
        },
        {
          label: "C",
          text: "Radially outward",
          isCorrect: false,
          distractorRationale: "Confuses closed-loop induced emf with radial Hall deflection.",
        },
        {
          label: "D",
          text: "Zero induced current",
          isCorrect: false,
          distractorRationale: "Assumes uniform spatial field means constant magnetic flux despite dB/dt > 0.",
        },
      ],
      workedSolution:
        "By Lenz's law, the induced magnetic flux opposes the increasing into-the-page flux, pointing out of the page and driving a counterclockwise current.",
      markScheme: [
        {
          code: "A1",
          criterion: "Identifies counterclockwise induced current by Lenz's law.",
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
    expect(verifyCandidateWithGate(validQualitativeMcq).evaluation.valid).toBe(
      true,
    );

    const wrongQualitativeMcq: CandidateQuestionInput = {
      ...validQualitativeMcq,
      id: "sp-em-qualitative-wrong",
      options: validQualitativeMcq.options!.map((o) =>
        o.label === "A"
          ? { label: "A", text: o.text, isCorrect: true }
          : o.label === "B"
            ? {
                label: "B",
                text: o.text,
                isCorrect: false,
                distractorRationale: "Reversed.",
              }
            : o,
      ),
    };
    const resWrongQual = verifyCandidateWithGate(wrongQualitativeMcq);
    expect(resWrongQual.evaluation.valid).toBe(false);
    expect(
      resWrongQual.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);
  });

  it("BLOCKER 2 regression: rejects structured items when numeric parts omit targetQuantityKey or item has zero solver-checked quantitative parts", () => {
    const graphsStruct = buildSampleCandidates()[1]; // sp-graphs-struct-002

    // Case A: Every part's targetQuantityKey removed and expectedAnswer set to "987654 units"
    const allBypassed: CandidateQuestionInput = {
      ...graphsStruct,
      id: "sp-graphs-struct-bypass-all",
      parts: graphsStruct.parts!.map((part) => ({
        ...part,
        targetQuantityKey: undefined,
        expectedAnswer: "987654 units",
      })),
    };
    const resAll = verifyCandidateWithGate(allBypassed);
    expect(resAll.evaluation.valid).toBe(false);
    expect(
      resAll.evaluation.issues.some((i) => i.code === "ground-truth-mismatch"),
    ).toBe(true);

    // Case B: Only part (b) omits targetQuantityKey while claiming numeric answer "987654 units"
    const singlePartBypassed: CandidateQuestionInput = {
      ...graphsStruct,
      id: "sp-graphs-struct-bypass-one",
      parts: graphsStruct.parts!.map((part) =>
        part.partId === "b"
          ? { ...part, targetQuantityKey: undefined, expectedAnswer: "987654 units" }
          : part,
      ),
    };
    const resOne = verifyCandidateWithGate(singlePartBypassed);
    expect(resOne.evaluation.valid).toBe(false);
    expect(
      resOne.evaluation.issues.some((i) => i.code === "ground-truth-mismatch"),
    ).toBe(true);

    // Case C: Quantitative structured item with 0 solver-checked parts even if prose avoids digits
    const zeroCheckedParts: CandidateQuestionInput = {
      ...graphsStruct,
      id: "sp-graphs-struct-zero-quant",
      parts: graphsStruct.parts!.map((part) => ({
        ...part,
        targetQuantityKey: undefined,
        expectedAnswer: "Motion decelerates uniformly along straight rail",
        workingSteps: ["Read slope qualitatively from velocity-time graph"],
      })),
    };
    const resZeroChecked = verifyCandidateWithGate(zeroCheckedParts);
    expect(resZeroChecked.evaluation.valid).toBe(false);
    expect(
      resZeroChecked.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);

    // Case D: Mixed structured item with 1 valid qualitative conceptual part + solver-checked quantitative parts passes
    const mixedStructured: CandidateQuestionInput = {
      ...graphsStruct,
      id: "sp-graphs-struct-mixed-ok",
      totalMarks: 6,
      parts: [
        {
          partId: "a",
          prompt: "State the physical feature of the velocity–time graph that represents acceleration.",
          marks: 1,
          targetMode: "qualitative",
          expectedAnswer: "Gradient of the velocity–time line",
          workingSteps: ["Identify acceleration as rate of change of velocity, given by graph gradient."],
        },
        ...graphsStruct.parts!.map((p, idx) => ({
          ...p,
          partId: idx === 0 ? "b" : idx === 1 ? "c" : "d",
          dependsOnPartIds: p.dependsOnPartIds?.map(() => "b"),
        })),
      ],
      markScheme: [
        {
          code: "B1",
          partId: "a",
          criterion: "States gradient (or slope) of the velocity–time graph.",
          marks: 1,
        },
        ...graphsStruct.markScheme.map((m) => ({
          ...m,
          partId: m.partId === "a" ? "b" : m.partId === "b" ? "c" : "d",
        })),
      ],
    };
    expect(verifyCandidateWithGate(mixedStructured).evaluation.valid).toBe(true);
  });

  it("Numeric extraction & qualitative prose regression: ignores kebab-case slugs, ordinals, dimensions, and multi-letter subscripts while preserving real numbers and spaced '2 d'", () => {
    expect(extractNumbersFromPhysicsText("projectile-motion-2d")).toEqual([]);
    expect(extractNumbersFromPhysicsText("dc-4-terminal-sensing")).toEqual([]);
    expect(extractNumbersFromPhysicsText("unseen-post-freeze-4")).toEqual([]);
    expect(extractNumbersFromPhysicsText("4-terminal bridge")).toEqual([]);
    expect(
      extractNumbersFromPhysicsText(
        "According to Newton's 2nd law in 3D (and 2D) motion, KE_1 equals KE_2 and Ek_2 = theta_1",
      ),
    ).toEqual([]);

    // Preserves spaced "2 d", signed decimals "-4.5 m s^-1", SI units "4.00 Ω", and scientific notation "1.01e-3"
    const spacedD = extractNumbersFromPhysicsText("2 d");
    expect(spacedD).toHaveLength(1);
    expect(spacedD[0]).toMatchObject({ rawValue: 2, unitToken: "d" });

    const signedVel = extractNumbersFromPhysicsText("-4.5 m s^-1 and 4.00 Ω and 1.01e-3 T");
    expect(signedVel.map((m) => m.rawValue)).toEqual([-4.5, 4, 1.01e-3]);

    // Qualitative MCQ and qualitative structured subpart with "Newton's 2nd law in 2D motion, KE_1 equals KE_2" pass cleanly
    registerVisualModule("mechanics", {
      validate: () => ({ valid: true, issues: [] }),
      solve: () => ({
        collisionType: "kinetic energy conserved",
        finalSpeedMs: 6.0,
      }),
      render: () =>
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180"><line x1="10" y1="90" x2="290" y2="90"/></svg>',
    });

    const qualMcqWithOrdinalsAndSubscripts: CandidateQuestionInput = {
      id: "sp-mech-qual-2nd-law-2d",
      conceptId: "elastic-2d-scattering",
      templateArchetype: "equal-mass-2d-glancing",
      seed: 915,
      syllabi: [{ syllabus: "alevel", level: "Y12", topicId: "3.4.1" }],
      format: "mcq",
      targetMode: "qualitative",
      targetQuantityKey: "collisionType",
      difficulty: "standard",
      domain: "mechanics",
      scenarioSpec: { kind: "elastic-2d" },
      hiddenQuantities: ["collisionType"],
      requiredGivens: [],
      stem: "In an isolated elastic collision in 2D space, how does total kinetic energy before impact compare with after impact?",
      options: [
        {
          label: "A",
          text: "According to Newton's 2nd law in 2D motion, KE_1 equals KE_2 (kinetic energy conserved)",
          isCorrect: true,
        },
        {
          label: "B",
          text: "KE_1 is greater than KE_2 in 2D collisions",
          isCorrect: false,
          distractorRationale: "Confuses elastic 2D collisions with inelastic impacts.",
        },
        {
          label: "C",
          text: "KE_1 is less than KE_2",
          isCorrect: false,
          distractorRationale: "Violates conservation of energy.",
        },
        {
          label: "D",
          text: "Only 1st-order momentum components are conserved",
          isCorrect: false,
          distractorRationale: "Ignores kinetic energy conservation in elastic collisions.",
        },
      ],
      workedSolution:
        "In an elastic 2D collision, total kinetic energy conserved means KE_1 equals KE_2.",
      markScheme: [
        {
          code: "A1",
          criterion: "States kinetic energy conserved so KE_1 equals KE_2 (A).",
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
    const qualMcqResult = verifyCandidateWithGate(qualMcqWithOrdinalsAndSubscripts);
    expect({
      valid: qualMcqResult.evaluation.valid,
      issues: qualMcqResult.evaluation.issues,
    }).toEqual({ valid: true, issues: [] });

    // Structured question with a qualitative subpart referencing Newton's 2nd law, 2D, and KE_1 / KE_2 + quantitative subpart
    const structWithQualSubpart: CandidateQuestionInput = {
      id: "sp-mech-struct-2nd-law-2d",
      conceptId: "elastic-2d-scattering",
      templateArchetype: "glider-2d-speed",
      seed: 916,
      syllabi: [{ syllabus: "ib", level: "SL", topicId: "A.2" }],
      format: "structured",
      difficulty: "standard",
      domain: "mechanics",
      scenarioSpec: { kind: "elastic-2d" },
      hiddenQuantities: ["finalSpeedMs"],
      requiredGivens: [],
      stem: "Two gliders interact elastically on a frictionless 2D air table.",
      parts: [
        {
          partId: "a",
          prompt: "State the kinetic energy condition for an elastic 2D collision.",
          marks: 1,
          targetMode: "qualitative",
          expectedAnswer:
            "By Newton's 2nd and 3rd laws in 2D elastic motion, total KE_1 equals total KE_2.",
          workingSteps: ["In a 2D elastic collision, Ek_1 and Ek_2 are equal."],
        },
        {
          partId: "b",
          prompt: "State the final speed of glider X.",
          marks: 1,
          targetQuantityKey: "finalSpeedMs",
          expectedAnswer: "6.00 m s⁻¹",
          workingSteps: ["Final speed = 6.00 m s⁻¹."],
        },
      ],
      workedSolution:
        "(a) Total KE_1 equals KE_2 in an elastic 2D collision. (b) Final speed is 6.00 m s⁻¹.",
      markScheme: [
        { code: "B1", partId: "a", criterion: "KE_1 equals KE_2.", marks: 1 },
        { code: "A1", partId: "b", criterion: "6.00 m s⁻¹.", marks: 1 },
      ],
      totalMarks: 2,
    };
    expect(verifyCandidateWithGate(structWithQualSubpart).evaluation.valid).toBe(
      true,
    );
  });
});
