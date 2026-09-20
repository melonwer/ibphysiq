import {
  currentFromVoltage,
  emfFromMeasurement,
  internalResistanceFromMeasurements,
  parallelResistance,
  powerFromCurrent,
  resistanceFromVoltageCurrent,
  seriesResistance,
  terminalVoltage,
} from "../circuit-physics";
import {
  CIRCUIT_QUESTION_PACKAGES,
  CircuitQuestionPackage,
  formatToSignificantFigures,
  solveCircuitScenario,
  validateCircuitQuestionPackage,
} from "../index";
import { renderCircuitNetwork } from "../render-circuit";

const clonePackage = (item: CircuitQuestionPackage): CircuitQuestionPackage =>
  structuredClone(item);

describe("complete source-backed circuit question packages", () => {
  it("contains eight distinct packages balanced across Paper 1A and Paper 2", () => {
    expect(CIRCUIT_QUESTION_PACKAGES).toHaveLength(8);
    expect(new Set(CIRCUIT_QUESTION_PACKAGES.map((item) => item.id)).size).toBe(
      8,
    );
    expect(
      CIRCUIT_QUESTION_PACKAGES.filter((item) => item.paper === "1A"),
    ).toHaveLength(4);
    expect(
      CIRCUIT_QUESTION_PACKAGES.filter((item) => item.paper === "2"),
    ).toHaveLength(4);
  });

  it.each(CIRCUIT_QUESTION_PACKAGES)(
    "validates, solves and renders deterministically: $id",
    (item) => {
      expect(validateCircuitQuestionPackage(item)).toEqual({
        valid: true,
        issues: [],
      });
      expect(item.results).toEqual(solveCircuitScenario(item.scenario));
      const svg = renderCircuitNetwork(item.visualSpec);
      expect(svg).toBe(renderCircuitNetwork(item.visualSpec));
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      for (const privateId of item.visualSpec.visibility.privateParameterIds) {
        expect(svg).not.toContain(privateId);
      }
      expect(item.trainingEligibility).toBe("blocked");
      expect(item.trainingBlockers).toEqual([
        "not human reviewed",
        "source-use rights not cleared",
        "training metadata and grouped split not assigned",
      ]);
    },
  );

  it("keeps all student parts, solution parts and marks aligned", () => {
    for (const item of CIRCUIT_QUESTION_PACKAGES) {
      const studentParts =
        item.question.kind === "multiple-choice"
          ? [{ id: "answer", marks: 1 }]
          : item.question.parts;
      expect(item.solution.parts.map((part) => part.partId).sort()).toEqual(
        studentParts.map((part) => part.id).sort(),
      );
      expect(
        item.solution.parts.reduce((total, part) => total + part.marks, 0),
      ).toBe(item.marks);
      expect(studentParts.reduce((total, part) => total + part.marks, 0)).toBe(
        item.marks,
      );
    }
  });

  it("has four unique options and the source-backed P1A answer sequence", () => {
    const multipleChoice = CIRCUIT_QUESTION_PACKAGES.filter(
      (item) => item.question.kind === "multiple-choice",
    );
    expect(multipleChoice).toHaveLength(4);
    expect(multipleChoice.map((item) => item.solution.correctOptionId)).toEqual(
      ["D", "A", "A", "C"],
    );
    for (const item of multipleChoice) {
      if (item.question.kind !== "multiple-choice")
        throw new Error("unreachable");
      expect(item.question.options.map((option) => option.id)).toEqual([
        "A",
        "B",
        "C",
        "D",
      ]);
      expect(
        new Set(item.question.options.map((option) => option.text)).size,
      ).toBe(4);
    }
  });

  it("matches every numerical and qualitative mark-scheme target", () => {
    const byKind = new Map(
      CIRCUIT_QUESTION_PACKAGES.map((item) => [
        item.scenario.kind,
        item.results,
      ]),
    );
    expect(byKind.get("switched-power")?.closedR1PowerW).toBeCloseTo(8);
    expect(
      byKind.get("bypass-equivalent")?.equivalentResistanceOhm,
    ).toBeCloseTo(2);
    expect(byKind.get("lamp-failure")).toMatchObject({
      ammeterRatio: 1 / 3,
      voltmeterRatio: 1,
    });
    expect(byKind.get("series-components")).toMatchObject({
      pResistanceOhm: 50,
      qResistanceTrend: "increases",
      ammeterCurrentA: 0.12,
      emfV: 9,
    });
    expect(byKind.get("internal-resistance")).toMatchObject({
      internalResistanceOhm: 0.75,
      emfV: 24.8,
    });
    expect(byKind.get("ldr-divider")).toMatchObject({
      currentA: 3.6e-5,
      voltmeterTrend: "increases",
      sourcePowerTrend: "increases",
    });
    expect(byKind.get("thermistor-divider")).toMatchObject({
      batteryCurrentA: 0.05,
      thermistorResistanceOhm: 80,
      voltmeterTrend: "decreases",
    });
  });

  it("displays calculated numerical answers to three significant figures", () => {
    expect(formatToSignificantFigures(50)).toBe("50.0");
    expect(formatToSignificantFigures(0.75)).toBe("0.750");
    expect(formatToSignificantFigures(9)).toBe("9.00");
    expect(formatToSignificantFigures(36)).toBe("36.0");
    expect(formatToSignificantFigures(80)).toBe("80.0");
    const finals = CIRCUIT_QUESTION_PACKAGES.flatMap((item) =>
      item.solution.parts.flatMap((part) =>
        part.finalAnswer ? [part.finalAnswer] : [],
      ),
    );
    expect(finals).toEqual(
      expect.arrayContaining([
        "50.0 Ω",
        "120 mA",
        "9.00 V",
        "0.750 Ω",
        "24.8 V",
        "36.0 µA",
        "50.0 mA",
        "80.0 Ω",
      ]),
    );
  });

  it("rejects invalid scenario physics and inconsistent packages", () => {
    expect(() =>
      solveCircuitScenario({
        kind: "series-components",
        pOperatingPoint: { voltageV: 10, currentA: 0.2 },
        qOperatingPoints: [
          { voltageV: 3, currentA: 0.12 },
          { voltageV: 10, currentA: 0.16 },
        ],
        circuitQVoltageV: 4,
      }),
    ).toThrow("Circuit Q voltage needs a supplied operating point");
    expect(() =>
      solveCircuitScenario({
        kind: "thermistor-divider",
        emfV: 12,
        seriesResistanceOhm: 180,
        parallelFixedResistanceOhm: 240,
        parallelVoltageV: 12,
      }),
    ).toThrow("Parallel voltage must be below the source emf");

    const badPackage = clonePackage(CIRCUIT_QUESTION_PACKAGES[5]);
    badPackage.results.emfV = 30;
    expect(validateCircuitQuestionPackage(badPackage)).toMatchObject({
      valid: false,
    });

    const overPrecise = clonePackage(CIRCUIT_QUESTION_PACKAGES[1]);
    if (overPrecise.scenario.kind !== "switched-power") {
      throw new Error("Unexpected fixture order");
    }
    overPrecise.scenario.openR1PowerW = 18.1234;
    expect(validateCircuitQuestionPackage(overPrecise).issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Scenario givens must use at most three significant figures",
        ),
      ]),
    );

    const wrongMcq = clonePackage(CIRCUIT_QUESTION_PACKAGES[0]);
    wrongMcq.solution.correctOptionId = "A";
    wrongMcq.solution.parts[0].finalAnswer = "A — P, Q, R";
    wrongMcq.solution.parts[0].working = ["Therefore the answer is A."];
    expect(validateCircuitQuestionPackage(wrongMcq).valid).toBe(false);

    const incompatibleStem = clonePackage(CIRCUIT_QUESTION_PACKAGES[6]);
    incompatibleStem.question.stem =
      "The LDR is connected to a 12.0 V cell and two unspecified resistors.";
    expect(validateCircuitQuestionPackage(incompatibleStem).issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Student content is inconsistent"),
      ]),
    );

    const emptySolution = clonePackage(CIRCUIT_QUESTION_PACKAGES[7]);
    emptySolution.solution.parts[2].working = [];
    emptySolution.solution.parts[2].markingPoints = [];
    emptySolution.solution.parts[2].finalAnswer = undefined;
    expect(validateCircuitQuestionPackage(emptySolution).issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Solution parts need positive marks"),
      ]),
    );
  });
});

describe("circuit physics helpers", () => {
  it("cross-checks the core equations independently", () => {
    expect(seriesResistance([2, 3, 5])).toBe(10);
    expect(parallelResistance([6, 6, 6])).toBeCloseTo(2);
    expect(currentFromVoltage(9, 250_000)).toBeCloseTo(3.6e-5);
    expect(resistanceFromVoltageCurrent(3, 0.05)).toBeCloseTo(60);
    expect(powerFromCurrent(2, 2)).toBeCloseTo(8);
    expect(terminalVoltage(24.8, 8, 0.75)).toBeCloseTo(18.8);
    const measurements = [
      { currentA: 0, terminalVoltageV: 24.8 },
      { currentA: 8, terminalVoltageV: 18.8 },
    ] as const;
    const internalResistance = internalResistanceFromMeasurements(
      measurements[0],
      measurements[1],
    );
    expect(internalResistance).toBeCloseTo(0.75);
    expect(emfFromMeasurement(measurements[1], internalResistance)).toBeCloseTo(
      24.8,
    );
  });

  it("rejects non-physical helper inputs", () => {
    expect(() => seriesResistance([])).toThrow();
    expect(() => parallelResistance([10, 0])).toThrow();
    expect(() => currentFromVoltage(-1, 10)).toThrow();
    expect(() =>
      internalResistanceFromMeasurements(
        { currentA: 1, terminalVoltageV: 4 },
        { currentA: 2, terminalVoltageV: 5 },
      ),
    ).toThrow("terminal voltage falling");
  });
});
