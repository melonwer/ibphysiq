import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { CARTESIAN_EXPANSION_FIXTURES } from "../cartesian-expansion-fixtures";
import { renderCartesianPlot } from "../render-cartesian";

describe("24-question source-linked Cartesian expansion", () => {
  it("keeps the audited 12 Paper 1A / 12 Paper 2 balance", () => {
    expect(CARTESIAN_EXPANSION_FIXTURES).toHaveLength(24);
    expect(
      new Set(
        CARTESIAN_EXPANSION_FIXTURES.map(
          (fixture) => fixture.sourceQuestionId,
        ),
      ).size,
    ).toBe(24);
    expect(
      CARTESIAN_EXPANSION_FIXTURES.filter(
        (fixture) => fixture.paper === "1A",
      ),
    ).toHaveLength(12);
    expect(
      CARTESIAN_EXPANSION_FIXTURES.filter(
        (fixture) => fixture.paper === "2",
      ),
    ).toHaveLength(12);
  });

  it.each(CARTESIAN_EXPANSION_FIXTURES)(
    "renders finite deterministic source fixture: $id",
    (fixture) => {
      const svg = renderCartesianPlot(fixture.spec, fixture.data);
      expect(svg).toBe(renderCartesianPlot(fixture.spec, fixture.data));
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      expect(svg).not.toContain(`${fixture.id}-answer`);
      expect(fixture.trainingEligibility).toBe("blocked");
    },
  );

  it.each(CARTESIAN_EXPANSION_FIXTURES)(
    "retains local source evidence: $id",
    (fixture) => {
      expect(fixture.sourceCrops.length).toBeGreaterThan(0);
      expect(
        fixture.sourceCrops.every((sourceCrop) =>
          existsSync(resolve(process.cwd(), sourceCrop)),
        ),
      ).toBe(true);
    },
  );

  it("covers each renderer gap observed in the audited expansion", () => {
    const capabilities = new Set(
      CARTESIAN_EXPANSION_FIXTURES.flatMap(
        (fixture) => fixture.capabilities,
      ),
    );
    expect([...capabilities]).toEqual(
      expect.arrayContaining([
        "option-panel-grid",
        "multiple-panels",
        "multiple-series",
        "log-axes",
        "reversed-axis",
        "spacetime-axes",
        "closed-cycle",
        "direction-arrows",
        "measured-points",
        "blank-student-plot",
      ]),
    );
  });

  it("records audit false positives instead of promoting them to templates", () => {
    const corrections = CARTESIAN_EXPANSION_FIXTURES.filter(
      (fixture) => fixture.auditCorrection,
    );
    expect(corrections.length).toBeGreaterThanOrEqual(8);
    expect(
      corrections.some((fixture) =>
        fixture.auditCorrection?.includes("no drawn tangent"),
      ),
    ).toBe(true);
    expect(
      corrections.some((fixture) =>
        fixture.auditCorrection?.includes("not radioactive decay"),
      ),
    ).toBe(true);
  });

  it("keeps requested student additions out of the rendered SVG", () => {
    const potential = CARTESIAN_EXPANSION_FIXTURES.find(
      (fixture) => fixture.id === "may26-tz1-hl-2-q9-source",
    )!;
    expect(potential.spec.payload.series).toEqual([]);
    expect(renderCartesianPlot(potential.spec, potential.data)).not.toContain(
      'stroke="#15191d"',
    );

    const standingWave = CARTESIAN_EXPANSION_FIXTURES.find(
      (fixture) => fixture.id === "nov25-tz3-sl-2-q5-source",
    )!;
    expect(renderCartesianPlot(standingWave.spec, standingWave.data)).not.toContain(
      "displacement of Q",
    );
  });
});
