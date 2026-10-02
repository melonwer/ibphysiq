import {
  MECHANICS_QUESTION_PACKAGES,
  validateMechanicsQuestionPackage,
  renderMechanicsSolutionVisuals,
} from "../mechanics-question-packages";
import {
  projectileFlightTime,
  solveMechanicsScenario,
} from "../mechanics-physics";
import {
  parseMechanicsIntent,
  compileMechanicsIntent,
} from "../mechanics-intent";
import { renderMechanicsScene } from "../render-mechanics";

describe("source-backed mechanics packages", () => {
  it("renders steep supported inclines and binds dimensions to crate displacement", () => {
    const item = MECHANICS_QUESTION_PACKAGES[3];
    for (const angleDegrees of [0.01, 25, 80, 89.99]) {
      const intent = {
        ...item.intent,
        template: "incline",
        angleDegrees,
        showStartEnd: true,
      } as const;
      const spec = compileMechanicsIntent(intent);
      expect(renderMechanicsScene(spec)).not.toMatch(/NaN|Infinity/);
      const panel = spec.payload.panels[0];
      const [first, last] = panel.bodies;
      const length = panel.paths.find((path) => path.id === "ramp-length");
      if (!length) throw new Error("missing dimension");
      expect(last.position.x - first.position.x).toBeCloseTo(
        length.points[1].x - length.points[0].x,
        12,
      );
      expect(last.position.y - first.position.y).toBeCloseTo(
        length.points[1].y - length.points[0].y,
        12,
      );
      expect(
        (Math.atan2(
          last.position.y - first.position.y,
          last.position.x - first.position.x,
        ) *
          180) /
          Math.PI,
      ).toBeCloseTo(angleDegrees, 9);
    }
  });
  it("shows the joined pendulum pair and keeps the worked force diagram separate", () => {
    const pendulum = MECHANICS_QUESTION_PACKAGES[5].visualSpec.payload.panels;
    expect(pendulum[1].bodies.map((body) => body.id)).toEqual([
      "combined",
      "joined-target",
    ]);
    expect(pendulum[1].bodies[0].label?.text).toBe("joined balls");
    const truck = MECHANICS_QUESTION_PACKAGES[7];
    const worked = renderMechanicsSolutionVisuals(truck);
    expect(worked).toHaveLength(1);
    expect(worked[0].svg).toContain(">mg<");
    expect(worked[0].svg).toContain(">T<");
    expect(renderMechanicsScene(truck.visualSpec)).not.toContain(">mg<");
    expect(renderMechanicsScene(truck.visualSpec)).not.toContain(">T<");
  });
  it("contains eight independent sources, balanced four per paper", () => {
    expect(MECHANICS_QUESTION_PACKAGES).toHaveLength(8);
    expect(
      new Set(MECHANICS_QUESTION_PACKAGES.map((p) => p.source.questionId)).size,
    ).toBe(8);
    expect(
      MECHANICS_QUESTION_PACKAGES.filter((p) => p.paper === "1A"),
    ).toHaveLength(4);
    expect(
      MECHANICS_QUESTION_PACKAGES.filter((p) => p.paper === "2"),
    ).toHaveLength(4);
    expect(
      MECHANICS_QUESTION_PACKAGES.filter((p) => p.paper === "1A").map(
        (p) => p.solution.correctOptionId,
      ),
    ).toEqual(["B", "A", "D", "D"]);
  });
  it.each(MECHANICS_QUESTION_PACKAGES)(
    "solves, validates and renders $id",
    (item) => {
      expect(validateMechanicsQuestionPackage(item)).toEqual({
        valid: true,
        issues: [],
      });
      const svg = renderMechanicsScene(item.visualSpec);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      expect(svg).toBe(
        renderMechanicsScene(compileMechanicsIntent(item.intent)),
      );
      expect(item.trainingEligibility).toBe("blocked");
      expect(item.source.markscheme.pages.every((page) => page > 0)).toBe(true);
    },
  );
  it("matches independent numerical targets with unrounded intermediate results", () => {
    const results = MECHANICS_QUESTION_PACKAGES.map((p) => p.results);
    expect(results[1].finalXMs).toBe(1);
    expect(results[2].tensionN).toBeCloseTo(21.924, 8);
    expect(results[3].resistanceN).toBe(700);
    expect(results[4].potentialJ).toBeCloseTo(8.614650647, 8);
    expect(results[4].kineticJ).toBeCloseTo(3.744, 8);
    expect(results[4].frictionCoefficient).toBeCloseTo(0.263646408, 8);
    expect(results[5].bottomSpeedMs).toBeCloseTo(3.959797975, 8);
    expect(results[5].tensionN).toBeCloseTo(5.88, 10);
    expect(results[5].riseM).toBeCloseTo(0.2, 10);
    expect(results[6].springConstantNm).toBeCloseTo(647.8953627, 6);
    expect(results[6].meanRopeForceN).toBeCloseTo(241.2486789, 6);
    expect(results[7].accelerationMs2).toBeCloseTo(5.658032638, 8);
    expect(results[7].maximumCornerSpeedMs).toBe(21);
    expect(results[7].arrivalSpeedMs).toBeCloseTo(7.068833659, 8);
    expect(projectileFlightTime(20, 30, 9.81)).toBeCloseTo(2.038735984, 8);
  });
  it("supports changed physical parameters and rejects impossible inputs", () => {
    expect(
      solveMechanicsScenario({
        kind: "ramp-resistance",
        weightN: 100,
        lengthM: 10,
        heightM: 3,
      }).resistanceN,
    ).toBe(30);
    expect(
      solveMechanicsScenario({
        kind: "pendulum-collision",
        massKg: 1,
        targetMassKg: 3,
        lengthM: 2,
        gravityMs2: 10,
      }).riseM,
    ).toBeCloseTo(0.125, 10);
    expect(() =>
      solveMechanicsScenario({
        kind: "circle-bottom",
        massKg: 1,
        radiusM: 0,
        speedMs: 4,
        gravityMs2: 9.8,
      }),
    ).toThrow("Radius");
    expect(() =>
      solveMechanicsScenario({
        kind: "incline-friction",
        massKg: 1,
        lengthM: 1,
        angleDegrees: 25,
        finalSpeedMs: 20,
        gravityMs2: 9.8,
      }),
    ).toThrow("exceeds");
    expect(() =>
      solveMechanicsScenario({
        kind: "elastic-rope",
        massKg: 4,
        lengthM: 2.2,
        extensionM: 0.58,
        intervalS: 0,
        gravityMs2: 9.8,
      }),
    ).toThrow("Time");
  });
  it("rejects altered givens, final answers, schemes, marks and visual labels", () => {
    const mutations = [
      (p: (typeof MECHANICS_QUESTION_PACKAGES)[number]) => {
        p.question.stem = "Missing givens.";
      },
      (p: (typeof MECHANICS_QUESTION_PACKAGES)[number]) => {
        p.solution.parts[0].finalAnswer = "Wrong answer";
      },
      (p: (typeof MECHANICS_QUESTION_PACKAGES)[number]) => {
        p.sourceChecks = [];
      },
      (p: (typeof MECHANICS_QUESTION_PACKAGES)[number]) => {
        p.marks = 100;
      },
      (p: (typeof MECHANICS_QUESTION_PACKAGES)[number]) => {
        p.results.potentialJ = 100;
      },
      (p: (typeof MECHANICS_QUESTION_PACKAGES)[number]) => {
        p.visualSpec.payload.panels[0].bodies[0].label = {
          parameterId: "result:potentialJ",
          text: "8.61 J",
        };
      },
    ];
    for (const mutate of mutations) {
      const item = structuredClone(MECHANICS_QUESTION_PACKAGES[4]);
      mutate(item);
      expect(validateMechanicsQuestionPackage(item).valid).toBe(false);
    }
  });
  it("rejects coordinates in model intent and unsupported/private labels", () => {
    const intent = MECHANICS_QUESTION_PACKAGES[0].intent;
    expect(() =>
      parseMechanicsIntent({ ...intent, coordinates: { x: 0, y: 0 } }),
    ).toThrow("not part");
    expect(() =>
      parseMechanicsIntent({
        ...intent,
        labels: [{ parameterId: "answer", text: "secret" }],
      }),
    ).toThrow("Unsupported or private");
    expect(() =>
      parseMechanicsIntent({ ...intent, privateParameterIds: ["speed"] }),
    ).toThrow("Unsupported or private");
    expect(() =>
      parseMechanicsIntent({ ...intent, template: "__proto__" }),
    ).toThrow("Unsupported");
  });
  it("rejects broken vector references, out-of-bounds geometry and unsupported overlays", () => {
    const spec = structuredClone(MECHANICS_QUESTION_PACKAGES[1].visualSpec);
    spec.payload.panels[0].vectors[0].originRef = "missing";
    expect(() => renderMechanicsScene(spec)).toThrow("origin");
    const outside = structuredClone(MECHANICS_QUESTION_PACKAGES[0].visualSpec);
    outside.payload.panels[0].bodies[0].position.x = 2;
    expect(() => renderMechanicsScene(outside)).toThrow("normalized");
    const overlay = structuredClone(MECHANICS_QUESTION_PACKAGES[0].visualSpec);
    overlay.composition = { kind: "overlay" };
    expect(() => renderMechanicsScene(overlay)).toThrow("composition");
  });
  it("escapes labels and keeps solution values out of student SVG and alt text", () => {
    const spec = structuredClone(MECHANICS_QUESTION_PACKAGES[1].visualSpec);
    const label = spec.payload.panels[0].bodies[0].label;
    if (!label) throw new Error("missing fixture label");
    label.text = '<script>alert("x")</script>';
    expect(renderMechanicsScene(spec)).not.toContain("<script>");
    expect(renderMechanicsScene(spec)).toContain("&lt;script&gt;");
    expect(
      renderMechanicsScene(MECHANICS_QUESTION_PACKAGES[2].visualSpec),
    ).not.toMatch(/21\.9|22\.0|tension/i);
    expect(
      renderMechanicsScene(MECHANICS_QUESTION_PACKAGES[6].visualSpec),
    ).not.toMatch(/648|241|spring constant/i);
    expect(
      renderMechanicsScene(MECHANICS_QUESTION_PACKAGES[7].visualSpec),
    ).not.toMatch(/21\.0|7\.07|weight|tension/i);
  });
});
