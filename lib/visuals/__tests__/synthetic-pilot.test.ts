import { buildSyntheticPilot, solveSyntheticScenario, validateSyntheticPackage } from "../synthetic-pilot";
import { renderCartesianPlot } from "../render-cartesian";
import { renderCircuitNetwork } from "../render-circuit";
import { renderFieldMap } from "../render-field-map";
import { renderMechanicsScene } from "../render-mechanics";
import { measurementAxisTicks } from "../measurement-axis";

const packages = buildSyntheticPilot();
const expected: Array<[number, string, number]> = [
  [0, "distanceM", 27], [0, "displacementM", 18],
  [1, "workJ", 40], [1, "finalSpeedMs", 6],
  [2, "distanceM", 63], [2, "meanSpeedMs", 6.3], [2, "brakingAccelerationMs2", -3],
  [3, "finalSpeedMs", 7], [3, "maxSpeedMs", 13], [3, "peakTimeS", 6],
  [4, "meanForceN", 0.4], [4, "workJ", 4.8],
  [5, "totalCurrentA", 3], [5, "branchTwoPowerW", 24],
  [6, "totalCurrentA", 3], [7, "externalEnergyJ", 240],
  [8, "totalOhm", 7], [8, "totalCurrentA", 2.142857142857], [8, "branchVoltageV", 8.571428571429], [8, "branchOnePowerW", 12.244897959184],
  [9, "darkCurrentA", 0.0005], [9, "darkOutputV", 2.5], [9, "brightOutputV", 5],
  [10, "fieldNC", 1011.375], [11, "workJ", 1.6e-7],
  [12, "nullPositionM", 0.2], [12, "potentialV", 449.5], [12, "fieldNC", 0],
  [13, "fieldNC", 379.577777777778], [13, "potentialV", -29.966666666667], [13, "forceN", -1.138733333333e-6],
  [14, "fieldNC", 2000], [14, "accelerationMs2", 1], [14, "finalSpeedMs", 0.173205080757],
  [15, "finalXMs", 0], [15, "lostEnergyJ", 1.2], [16, "safeSpeedMs", 8.845337754998],
  [17, "thermalPowerW", 32.4], [18, "frictionLossJ", 12.849953790353], [18, "frictionN", 3.212488447588], [18, "shortRampSpeedMs", 2.828427124746],
  [19, "bottomSpeedMs", 4.2], [19, "combinedSpeedMs", 1.05], [19, "lostEnergyJ", 1.323], [19, "riseM", 0.05625],
];

test.each(expected)("question %i has independently calculated %s = %f", (index, key, value) => {
  expect(Math.abs(packages[index].results[key] - value)).toBeLessThan(Math.max(1e-12, Math.abs(value) * 1e-10));
});

test("the review batch is 20 complete new questions with balanced paper coverage", () => {
  expect(packages).toHaveLength(20);
  expect(new Set(packages.map(p => p.question.stem)).size).toBe(20);
  expect(packages.filter(p => p.paper === "1A")).toHaveLength(10);
  expect(packages.filter(p => p.paper === "2")).toHaveLength(10);
  for (const family of ["cartesian_plot", "circuit_network", "field_map", "mechanics_scene"]) expect(packages.filter(p => p.visual.family === family)).toHaveLength(5);
  for (const p of packages) {
    expect(validateSyntheticPackage(p)).toEqual([]);
    expect(p.reviewStatus).toBe("awaiting-human-review");
    expect(p.provenance.author).toBe("deterministic-code");
    expect(p.solution.parts.every(part => part.finalAnswer && part.working.length && part.markingPoints.length === part.marks)).toBe(true);
  }
});

test("negative velocity areas contribute positively to distance", () => {
  expect(solveSyntheticScenario({ kind: "rover-distance", durationS: 4, points: [{ x: 0, y: 4 }, { x: 4, y: -4 }] })).toEqual({ displacementM: 0, distanceM: 8 });
  expect(packages[0].solution.parts[0].working.join(" ")).toContain("22.5 m");
  expect(packages[0].solution.parts[0].working.join(" ")).toContain("4.50 m");
});

test("MCQ correct letters have distinct options and balanced placement", () => {
  expect(packages.filter(p => p.paper === "1A").map(p => p.solution.correctOptionId)).toEqual(["A", "B", "C", "D", "A", "B", "C", "D", "A", "B"]);
  expect(packages[0].question.kind).toBe("multiple-choice");
  if (packages[0].question.kind === "multiple-choice") expect(packages[0].question.options).toEqual([{ id: "A", text: "27.0 m" }, { id: "B", text: "18.0 m" }, { id: "C", text: "24.0 m" }, { id: "D", text: "30.0 m" }]);
});

test("tampering with working, the answer or student givens is rejected", () => {
  const changedAnswer = structuredClone(packages[0]);
  changedAnswer.results.distanceM = 18;
  expect(validateSyntheticPackage(changedAnswer)).toContain("Physics targets disagree with the scenario");
  const changedWorking = structuredClone(packages[0]);
  changedWorking.solution.parts[0].working = ["Distance is signed displacement."];
  expect(validateSyntheticPackage(changedWorking)).toContain("Solution differs from checked working");
  const changedFigure = structuredClone(packages[5]);
  changedFigure.visual.spec.scenarioRef = "some-other-scenario";
  expect(validateSyntheticPackage(changedFigure)).toContain("Student figure differs from scenario-derived givens");
});

test("all real student SVG renderers accept the new scenarios without private labels", () => {
  for (const p of packages) {
    const v = p.visual;
    const svg = v.family === "cartesian_plot" ? renderCartesianPlot(v.spec, v.data) : v.family === "circuit_network" ? renderCircuitNetwork(v.spec) : v.family === "field_map" ? renderFieldMap(v.spec) : renderMechanicsScene(v.spec);
    expect(svg).toMatch(/^<svg/);
    expect(svg).not.toMatch(/NaN|Infinity|undefined|<script/);
    expect(v.spec.visibility.publicParameterIds.some(id => v.spec.visibility.privateParameterIds.includes(id))).toBe(false);
    expect(svg).not.toContain("answer");
  }
});

test("measurement grids support half-interval readings across positive, signed and decimal scales", () => {
  expect(measurementAxisTicks([0, 8])).toEqual({ tickStrategy: "fixed", tickValues: [0, 1, 2, 3, 4, 5, 6, 7, 8], minorTickStep: 0.5 });
  expect(measurementAxisTicks([-2, 2])).toEqual({ tickStrategy: "fixed", tickValues: [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2], minorTickStep: 0.25 });
  expect(measurementAxisTicks([0, 1.8])).toEqual({ tickStrategy: "fixed", tickValues: [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8], minorTickStep: 0.1 });
  expect(() => measurementAxisTicks([1, 1])).toThrow("increasing finite domain");
});

test("student rover graph labels 5 s and draws the regular 5.5 s grid line", () => {
  const rover = packages[0].visual;
  if (rover.family !== "cartesian_plot") throw new Error("Expected rover plot");
  const svg = renderCartesianPlot(rover.spec, rover.data);
  expect(svg).toMatch(/<text x="442"[^>]*>5<\/text>/);
  expect(svg).toContain('<path d="M475 38V416" stroke="#d9dde1" stroke-width="0.7"/>');
  expect(svg).not.toMatch(/>5\.5<\/text>/);
  const lift = packages[3].visual;
  if (lift.family !== "cartesian_plot") throw new Error("Expected lift plot");
  expect(lift.spec.payload.xAxis.tickValues).toContain(6);
});

test("pendulum height rounding and ramp follow-through are usable for marking", () => {
  expect(packages[19].solution.parts[2].finalAnswer).toBe("0.0563 m");
  expect(packages[18].solution.parts[1].markingPoints.join(" ")).toContain("Accept 3.20 N");
  expect(packages[18].solution.parts[2].markingPoints.join(" ")).toContain("halve the final kinetic energy");
});
