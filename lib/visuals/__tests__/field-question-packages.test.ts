import {
  FIELD_QUESTION_PACKAGES,
  FieldQuestionPackage,
  accelerationInElectricField,
  electricField1D,
  electricPotential1D,
  gravitationalField1D,
  solveFieldScenario,
  validateFieldQuestionPackage,
} from "../index";
import { renderCartesianPlot } from "../render-cartesian";
import { renderFieldMap } from "../render-field-map";

const clonePackage = (item: FieldQuestionPackage): FieldQuestionPackage =>
  structuredClone(item);

describe("complete source-backed field question packages", () => {
  it("contains eight distinct packages balanced 4/4", () => {
    expect(FIELD_QUESTION_PACKAGES).toHaveLength(8);
    expect(new Set(FIELD_QUESTION_PACKAGES.map((item) => item.id)).size).toBe(
      8,
    );
    expect(
      FIELD_QUESTION_PACKAGES.filter((item) => item.paper === "1A"),
    ).toHaveLength(4);
    expect(
      FIELD_QUESTION_PACKAGES.filter((item) => item.paper === "2"),
    ).toHaveLength(4);
  });

  it.each(FIELD_QUESTION_PACKAGES)(
    "validates, solves and renders: $id",
    (item) => {
      expect(validateFieldQuestionPackage(item)).toEqual({
        valid: true,
        issues: [],
      });
      expect(item.results).toEqual(solveFieldScenario(item.scenario));
      if (item.visualSpec) {
        const spatial = renderFieldMap(item.visualSpec);
        expect(spatial).toBe(renderFieldMap(item.visualSpec));
        expect(spatial).not.toMatch(/NaN|Infinity|undefined/);
      }
      if (item.plot) {
        const student = renderCartesianPlot(
          item.plot.student.spec,
          item.plot.student.data,
        );
        expect(student).not.toMatch(/NaN|Infinity|undefined/);
        if (item.plot.solution)
          expect(
            renderCartesianPlot(
              item.plot.solution.spec,
              item.plot.solution.data,
            ),
          ).toContain("<path");
      }
      expect(item.trainingEligibility).toBe("blocked");
    },
  );

  it("matches the four P1A answer keys and key P2 targets", () => {
    expect(
      FIELD_QUESTION_PACKAGES.filter((item) => item.paper === "1A").map(
        (item) => item.solution.correctOptionId,
      ),
    ).toEqual(["B", "C", "C", "D"]);
    const results = new Map(
      FIELD_QUESTION_PACKAGES.map((item) => [item.scenario.kind, item.results]),
    );
    expect(results.get("zero-field-stability")).toMatchObject({
      zeroFieldFractionFromLeft: 2 / 3,
      axialMotion: "away from equilibrium toward +q",
      perpendicularMotion: "restoring toward line L; oscillatory",
    });
    expect(results.get("two-charge-field-graph")?.chargeSignRelationship).toBe(
      "same sign",
    );
    expect(results.get("two-charge-field-graph")?.magnitudeRatio).toBeCloseTo(
      2.25,
      12,
    );
    expect(results.get("nuclear-potential")?.barrierEv).toBeCloseTo(2.56e6, -4);
    expect(
      results.get("two-body-gravitational-potential")?.fieldMagnitudeNkg,
    ).toBeCloseTo(6.06, 1);
  });

  it("keeps every asked part aligned with a complete solution", () => {
    for (const item of FIELD_QUESTION_PACKAGES) {
      const parts =
        item.question.kind === "multiple-choice"
          ? [{ id: "answer", marks: 1 }]
          : item.question.parts;
      expect(item.solution.parts.map((part) => part.partId).sort()).toEqual(
        parts.map((part) => part.id).sort(),
      );
      expect(parts.reduce((total, part) => total + part.marks, 0)).toBe(
        item.marks,
      );
      expect(
        item.solution.parts.reduce((total, part) => total + part.marks, 0),
      ).toBe(item.marks);
    }
  });

  it("renders three significant-figure calculated answers", () => {
    const finalAnswers = FIELD_QUESTION_PACKAGES.flatMap((item) =>
      item.solution.parts.map((part) => part.finalAnswer),
    );
    expect(finalAnswers).toEqual(
      expect.arrayContaining([
        "C — 20.0 m s⁻², left",
        "2.25",
        "2.56 MeV",
        "6.06 N kg⁻¹",
        "1.40 Mm",
        "1.45×10³ kg",
      ]),
    );
  });

  it("does not invent spatial diagrams for source graph-only questions", () => {
    for (const kind of [
      "nuclear-potential",
      "two-body-gravitational-potential",
    ]) {
      const item = FIELD_QUESTION_PACKAGES.find(
        (candidate) => candidate.scenario.kind === kind,
      );
      expect(item).toBeDefined();
      expect(item?.visualSpec).toBeUndefined();
      expect(item?.plot).toBeDefined();
    }
  });

  it("rejects singularities, inconsistent answers and incomplete solutions", () => {
    expect(() => electricField1D(0, [{ positionM: 0, chargeC: 1e-9 }])).toThrow(
      "undefined at a point source",
    );
    expect(() =>
      electricPotential1D(1, [{ positionM: 1, chargeC: 1e-9 }]),
    ).toThrow("undefined at a point source");
    expect(() =>
      gravitationalField1D(0, [{ positionM: 0, massKg: 1 }]),
    ).toThrow("undefined at a point source");
    expect(() => accelerationInElectricField(0, 1, 2)).toThrow(
      "cannot be zero",
    );

    const wrong = clonePackage(FIELD_QUESTION_PACKAGES[0]);
    wrong.solution.correctOptionId = "A";
    expect(validateFieldQuestionPackage(wrong).valid).toBe(false);

    const wrongMultipart = clonePackage(FIELD_QUESTION_PACKAGES[6]);
    wrongMultipart.solution.parts[2].finalAnswer = "3.00 MeV";
    expect(validateFieldQuestionPackage(wrongMultipart).issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Solution final answers do not match the deterministic scenario",
        ),
      ]),
    );

    const missingGiven = clonePackage(FIELD_QUESTION_PACKAGES[7]);
    if (missingGiven.question.kind !== "multipart")
      throw new Error("unexpected fixture");
    missingGiven.question.stem = missingGiven.question.stem.replace(
      "19.6 Mm",
      "an unspecified distance",
    );
    expect(validateFieldQuestionPackage(missingGiven).issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Student content is inconsistent"),
      ]),
    );

    const overPrecise = clonePackage(FIELD_QUESTION_PACKAGES[4]);
    if (overPrecise.scenario.kind !== "zero-field-stability")
      throw new Error("unexpected fixture");
    overPrecise.scenario.leftMagnitude = 4.1234;
    expect(validateFieldQuestionPackage(overPrecise).issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("at most three significant figures"),
      ]),
    );

    const empty = clonePackage(FIELD_QUESTION_PACKAGES[7]);
    empty.solution.parts[0].working = [];
    expect(validateFieldQuestionPackage(empty).issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Solution parts need positive marks"),
      ]),
    );
  });
});

describe("field physics sign conventions", () => {
  it("uses right-positive electric fields and attractive gravitational fields", () => {
    expect(
      electricField1D(1, [{ positionM: 0, chargeC: 1e-9 }]),
    ).toBeGreaterThan(0);
    expect(electricField1D(-1, [{ positionM: 0, chargeC: 1e-9 }])).toBeLessThan(
      0,
    );
    expect(
      gravitationalField1D(1, [{ positionM: 0, massKg: 1e12 }]),
    ).toBeLessThan(0);
    expect(
      gravitationalField1D(-1, [{ positionM: 0, massKg: 1e12 }]),
    ).toBeGreaterThan(0);
  });
});
