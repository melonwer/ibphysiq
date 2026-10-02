import {
  MechanicsIntent,
  MECHANICS_INTENT_SCHEMA_VERSION,
  compileMechanicsIntent,
} from "./mechanics-intent";
import {
  MechanicsScenario,
  MechanicsResults,
  solveMechanicsScenario,
} from "./mechanics-physics";
import {
  MechanicsSourceFixture,
  MECHANICS_SOURCE_FIXTURES,
} from "./mechanics-source-fixtures";
import { formatToSignificantFigures } from "./pilot-variants";
import { renderMechanicsScene } from "./render-mechanics";
import { VISUAL_SCHEMA_VERSION, VisualSpec } from "./types";

export { solveMechanicsScenario } from "./mechanics-physics";
export const MECHANICS_QUESTION_PACKAGE_VERSION =
  "mechanics-question-package/0.1.0" as const;
type OptionId = "A" | "B" | "C" | "D";
export type MechanicsStudentQuestion =
  | {
      kind: "multiple-choice";
      stem: string;
      marks: 1;
      options: Array<{ id: OptionId; text: string }>;
    }
  | {
      kind: "multipart";
      stem: string;
      parts: Array<{ id: string; prompt: string; marks: number }>;
    };
export interface MechanicsSolutionPart {
  partId: string;
  marks: number;
  working: string[];
  markingPoints: string[];
  finalAnswer: string;
}
export type MechanicsSourceCheck =
  | {
      kind: "numeric";
      resultKey: string;
      expected: number;
      tolerance: number;
      unit: string;
    }
  | { kind: "exact"; resultKey: string; expected: string };
export interface MechanicsQuestionPackage {
  schemaVersion: typeof MECHANICS_QUESTION_PACKAGE_VERSION;
  id: string;
  paper: "1A" | "2";
  source: {
    fixtureId: string;
    questionId: string;
    questionLabel: string;
    sourceScope: string;
    markscheme: { sourceId: string; pages: number[]; evidence: string[] };
  };
  assumptions: string[];
  scenario: MechanicsScenario;
  intent: MechanicsIntent;
  visualSpec: VisualSpec<"mechanics_scene">;
  question: MechanicsStudentQuestion;
  marks: number;
  results: MechanicsResults;
  solution: { correctOptionId?: OptionId; parts: MechanicsSolutionPart[] };
  sourceChecks: MechanicsSourceCheck[];
  physicsStatus: "verified";
  trainingEligibility: "blocked";
  trainingBlockers: readonly [
    "not human reviewed",
    "source-use rights not cleared",
    "training metadata and grouped split not assigned",
  ];
}
interface Definition {
  scenario: MechanicsScenario;
  sourceChecks: MechanicsSourceCheck[];
  assumptions: string[];
}
const n = (
  resultKey: string,
  expected: number,
  tolerance: number,
  unit: string,
): MechanicsSourceCheck => ({
  kind: "numeric",
  resultKey,
  expected,
  tolerance,
  unit,
});
const e = (resultKey: string, expected: string): MechanicsSourceCheck => ({
  kind: "exact",
  resultKey,
  expected,
});
const DEFINITIONS: readonly Definition[] = [
  {
    scenario: { kind: "projectile-flight" },
    sourceChecks: [e("flightTimeExpression", "2v sinθ/g")],
    assumptions: [
      "Constant downward gravitational acceleration, negligible drag and equal launch/landing heights.",
      "Launch angle lies strictly between zero and 90 degrees.",
    ],
  },
  {
    scenario: {
      kind: "cart-collision",
      massXKg: 2,
      massYKg: 1,
      initialXMs: 3,
      initialYMs: 0,
      finalYMs: 4,
    },
    sourceChecks: [n("finalXMs", 1, 1e-12, "m s⁻¹")],
    assumptions: [
      "Right is positive; external horizontal impulse during impact is negligible.",
      "Momentum conservation is sufficient; kinetic-energy conservation is not assumed.",
    ],
  },
  {
    scenario: {
      kind: "circle-bottom",
      massKg: 0.4,
      radiusM: 0.8,
      speedMs: 6,
      gravityMs2: 9.81,
    },
    sourceChecks: [n("tensionN", 22, 0.1, "N")],
    assumptions: [
      "The light, taut, inextensible string sets the radius.",
      "At the bottom, inward acceleration is upward; g = 9.81 m s⁻².",
    ],
  },
  {
    scenario: {
      kind: "ramp-resistance",
      weightN: 1500,
      lengthM: 30,
      heightM: 14,
    },
    sourceChecks: [n("resistanceN", 700, 1e-12, "N")],
    assumptions: [
      "Speed is constant and the normal force does no work.",
      "The resistance is the mean tangential force opposing descent.",
    ],
  },
  {
    scenario: {
      kind: "incline-friction",
      massKg: 1.3,
      lengthM: 1.6,
      angleDegrees: 25,
      finalSpeedMs: 2.4,
      gravityMs2: 9.8,
    },
    sourceChecks: [
      n("potentialJ", 8.6, 0.15, "J"),
      n("kineticJ", 3.7, 0.1, "J"),
      n("frictionCoefficient", 0.26, 0.03, "dimensionless"),
    ],
    assumptions: [
      "The box starts from rest; dynamic friction is the only dissipative force.",
      "g = 9.8 m s⁻²; ramp distance is measured along the slope.",
    ],
  },
  {
    scenario: {
      kind: "pendulum-collision",
      massKg: 0.2,
      targetMassKg: 0.2,
      lengthM: 0.8,
      gravityMs2: 9.8,
    },
    sourceChecks: [
      n("bottomSpeedMs", 3.96, 0.02, "m s⁻¹"),
      n("tensionN", 5.88, 0.02, "N"),
      n("riseM", 0.2, 0.005, "m"),
    ],
    assumptions: [
      "The ball starts at rest with a horizontal, light, inextensible string.",
      "The second ball is initially stationary; impact is perfectly inelastic.",
      "Mechanical energy is conserved during each swing, not during impact; g = 9.8 m s⁻².",
    ],
  },
  {
    scenario: {
      kind: "elastic-rope",
      massKg: 4,
      lengthM: 2.2,
      extensionM: 0.58,
      intervalS: 0.13,
      gravityMs2: 9.8,
    },
    sourceChecks: [
      n("speedAtAMs", 6.567, 0.02, "m s⁻¹"),
      n("springConstantNm", 648, 1, "N m⁻¹"),
      n("meanRopeForceN", 241.4, 1, "N"),
      e("equilibriumAtB", "no, the resultant force is upward"),
    ],
    assumptions: [
      "The ball is released from rest at the support; the rope is initially slack.",
      "The rope obeys Hooke's law after it becomes taut and mechanical energy is conserved.",
      "At B the speed is instantaneously zero; g = 9.8 m s⁻².",
    ],
  },
  {
    scenario: {
      kind: "truck",
      deflectionDegrees: 30,
      inclineDegrees: 10,
      radiusM: 75,
      frictionCoefficient: 0.6,
      massKg: 1400,
      initialSpeedMs: 15,
      resistanceN: 520,
      gravityMs2: 9.8,
    },
    sourceChecks: [
      n("accelerationMs2", 5.66, 0.02, "m s⁻²"),
      n("constantSpeedVerticalAngleDegrees", 0, 0, "degrees"),
      n("maximumCornerSpeedMs", 21, 0.1, "m s⁻¹"),
      n("stoppingDistanceM", 303, 1, "m"),
      n("arrivalSpeedMs", 7, 0.1, "m s⁻¹"),
      e("reachesStation", "yes"),
    ],
    assumptions: [
      "The pendulum follows the truck's constant horizontal acceleration.",
      "Constant-speed incline motion is along a straight line.",
      "The corner is a flat semicircle of radius 75 m; static friction supplies centripetal force.",
      "The stated coasting resistance is constant; g = 9.8 m s⁻².",
    ],
  },
];
const f = (value: number): string => formatToSignificantFigures(value, 3);
function value(results: MechanicsResults, key: string): number {
  const result = results[key];
  if (typeof result !== "number")
    throw new Error(`Missing numeric mechanics result: ${key}`);
  return result;
}
function author(
  s: MechanicsScenario,
  r: MechanicsResults,
): Pick<MechanicsQuestionPackage, "question" | "solution" | "marks"> {
  const numeric = (key: string, unit: string) =>
    `${f(value(r, key))}${unit ? ` ${unit}` : ""}`;
  const part = (
    partId: string,
    marks: number,
    working: string[],
    markingPoints: string[],
    finalAnswer: string,
  ): MechanicsSolutionPart => ({
    partId,
    marks,
    working,
    markingPoints,
    finalAnswer,
  });
  const mcq = (
    stem: string,
    result: number | string,
    choices: Array<{
      text: string;
      value: number | string;
      tolerance?: number;
    }>,
    working: string[],
    finalAnswer: string,
  ) => {
    const ids: readonly OptionId[] = ["A", "B", "C", "D"];
    const matches = choices
      .map((choice, i) => {
        const same =
          typeof result === "number" && typeof choice.value === "number"
            ? Math.abs(result - choice.value) <= (choice.tolerance ?? 1e-9)
            : result === choice.value;
        return same ? ids[i] : undefined;
      })
      .filter((id): id is OptionId => id !== undefined);
    if (matches.length !== 1)
      throw new Error("Mechanics MCQ needs exactly one correct choice");
    return {
      question: {
        kind: "multiple-choice",
        stem,
        marks: 1,
        options: choices.map((choice, i) => ({
          id: ids[i],
          text: choice.text,
        })),
      } satisfies MechanicsStudentQuestion,
      solution: {
        correctOptionId: matches[0],
        parts: [
          part(
            "answer",
            1,
            working,
            [
              "Use the appropriate physical relationship and select the unique valid option.",
            ],
            `${matches[0]} — ${finalAnswer}`,
          ),
        ],
      },
      marks: 1,
    };
  };
  const multipart = (
    stem: string,
    parts: Array<{ id: string; prompt: string; marks: number }>,
    solutions: MechanicsSolutionPart[],
  ) => ({
    question: {
      kind: "multipart",
      stem,
      parts,
    } satisfies MechanicsStudentQuestion,
    solution: { parts: solutions },
    marks: parts.reduce((sum, p) => sum + p.marks, 0),
  });
  switch (s.kind) {
    case "projectile-flight":
      return mcq(
        "A projectile launches from level ground with speed v at angle θ above the horizontal. It lands at its starting height. Ignore air resistance. Which expression gives the total flight time?",
        r.flightTimeExpression,
        [
          { text: "v sinθ/g", value: "v sinθ/g" },
          { text: "2v sinθ/g", value: "2v sinθ/g" },
          { text: "2v cosθ/g", value: "2v cosθ/g" },
          { text: "2v sinθ cosθ/g", value: "2v sinθ cosθ/g" },
        ],
        [
          "Vertical displacement is v sinθ·t − gt²/2.",
          "At the landing height, the nonzero root is t = 2v sinθ/g.",
        ],
        "2v sinθ/g",
      );
    case "cart-collision":
      return mcq(
        `Cart X, mass ${f(s.massXKg)} kg, moves right at ${f(s.initialXMs)} m s⁻¹ towards stationary cart Y, mass ${f(s.massYKg)} kg. After impact Y moves right at ${f(s.finalYMs)} m s⁻¹. Which is X's final velocity? Take right as positive.`,
        value(r, "finalXMs"),
        [
          { text: "1.00 m s⁻¹ right", value: 1 },
          { text: "1.00 m s⁻¹ left", value: -1 },
          { text: "2.00 m s⁻¹ right", value: 2 },
          { text: "2.00 m s⁻¹ left", value: -2 },
        ],
        [
          `mₓuₓ + mᵧuᵧ = mₓvₓ + mᵧvᵧ; initial momentum is ${numeric("momentumBeforeKgMs", "kg m s⁻¹")}.`,
          "Solve vₓ = (mₓuₓ + mᵧuᵧ − mᵧvᵧ)/mₓ.",
        ],
        `${numeric("finalXMs", "m s⁻¹")} right`,
      );
    case "circle-bottom":
      return mcq(
        `A ${f(s.massKg)} kg ball moves in a vertical circle on a string of length ${f(s.radiusM)} m. At the bottom its speed is ${f(s.speedMs)} m s⁻¹. Use g = ${f(s.gravityMs2)} m s⁻². Which tension is closest to the calculated value?`,
        value(r, "tensionN"),
        [
          { text: "4.00 N", value: 4 },
          { text: "14.0 N", value: 14 },
          { text: "18.0 N", value: 18 },
          { text: "22.0 N", value: 22, tolerance: 0.1 },
        ],
        [
          "At the bottom T − mg = mv²/r.",
          `Therefore T = m(v²/r + g) = ${numeric("tensionN", "N")}.`,
        ],
        numeric("tensionN", "N"),
      );
    case "ramp-resistance":
      return mcq(
        `A crate weighs ${f(s.weightN / 1000)} kN and slides down a slope at constant speed. The diagram gives the distance along the slope and the vertical drop. Which expression gives the mean resistance in kN?`,
        value(r, "resistanceN") / 1000,
        [
          { text: "14/(1.5 × 30)", value: 14 / (1.5 * 30) },
          { text: "30/(1.5 × 14)", value: 30 / (1.5 * 14) },
          { text: "(1.5 × 30)/14", value: (1.5 * 30) / 14 },
          { text: "(1.5 × 14)/30", value: (1.5 * 14) / 30 },
        ],
        [
          "Constant speed gives zero change in kinetic energy.",
          `Resistance × slope distance = weight × height drop = ${numeric("lostPotentialEnergyJ", "J")}.`,
        ],
        `${f(value(r, "resistanceN") / 1000)} kN`,
      );
    case "incline-friction":
      return multipart(
        `A ${f(s.massKg)} kg box starts from rest at the top of the pictured ramp. Its speed at the bottom is ${f(s.finalSpeedMs)} m s⁻¹. Dynamic friction is the only energy loss. Use g = ${f(s.gravityMs2)} m s⁻².`,
        [
          {
            id: "a",
            prompt:
              "Calculate its gravitational potential energy relative to the bottom.",
            marks: 1,
          },
          {
            id: "bi",
            prompt: "Calculate its kinetic energy at the bottom.",
            marks: 1,
          },
          {
            id: "bii",
            prompt: "Determine the coefficient of dynamic friction.",
            marks: 2,
          },
          {
            id: "c",
            prompt:
              "For a frictionless ramp, explain why moving the box to the same vertical height requires the same work at a different ramp angle.",
            marks: 1,
          },
        ],
        [
          part(
            "a",
            1,
            ["h = L sinθ; Eₚ = mgL sinθ."],
            ["Substitute the vertical height into mgh."],
            numeric("potentialJ", "J"),
          ),
          part(
            "bi",
            1,
            ["Eₖ = mv²/2."],
            ["Use the bottom speed in the kinetic-energy equation."],
            numeric("kineticJ", "J"),
          ),
          part(
            "bii",
            2,
            [
              `Friction dissipates Eₚ − Eₖ = ${numeric("frictionLossJ", "J")}.`,
              "μmg cosθ·L = Eₚ − Eₖ, so μ = (Eₚ − Eₖ)/(mgL cosθ).",
            ],
            [
              "Find the energy dissipated.",
              "Relate frictional work to μmg cosθ and infer μ.",
            ],
            numeric("frictionCoefficient", ""),
          ),
          part(
            "c",
            1,
            [
              "Force along the ramp is mg sinθ and the distance to height h is h/sinθ.",
              "Their product is mgh, so the smaller force acts over proportionately greater distance.",
            ],
            ["Explain the compensating force-distance relationship."],
            "The work is mgh for either angle.",
          ),
        ],
      );
    case "pendulum-collision":
      return multipart(
        `A ball of mass ${f(s.massKg)} kg hangs from a ${f(s.lengthM)} m string. It is released from rest with the string horizontal, then collides at the lowest point with a stationary ${f(s.targetMassKg)} kg ball. They stick together and rise. Use g = ${f(s.gravityMs2)} m s⁻².`,
        [
          {
            id: "ai",
            prompt: "Calculate the speed just before the collision.",
            marks: 1,
          },
          {
            id: "aii",
            prompt: "Calculate the string tension just before the collision.",
            marks: 2,
          },
          {
            id: "b",
            prompt:
              "Determine the maximum vertical rise of the joined balls after impact.",
            marks: 2,
          },
        ],
        [
          part(
            "ai",
            1,
            ["mgL = mv²/2; v = √(2gL)."],
            ["Convert the lost gravitational energy into kinetic energy."],
            numeric("bottomSpeedMs", "m s⁻¹"),
          ),
          part(
            "aii",
            2,
            ["T − mg = mv²/L.", "T = mg + mv²/L."],
            [
              "Write the inward resultant force.",
              "Calculate the tension including weight.",
            ],
            numeric("tensionN", "N"),
          ),
          part(
            "b",
            2,
            [
              `Momentum conservation gives u = mv/(m + M) = ${numeric("combinedSpeedMs", "m s⁻¹")}.`,
              "After impact (m + M)u²/2 = (m + M)gh, so h = u²/(2g).",
            ],
            [
              "Use momentum during the sticking collision.",
              "Use energy during the subsequent rise.",
            ],
            numeric("riseM", "m"),
          ),
        ],
      );
    case "elastic-rope":
      return multipart(
        `A ${f(s.massKg)} kg ball is released from rest at its elastic rope's support. The rope is slack initially and just taut at A. At the lowest point B its speed is zero. The diagram gives the natural length and maximum extension. Travel from A to B takes ${f(s.intervalS)} s. Use g = ${f(s.gravityMs2)} m s⁻².`,
        [
          {
            id: "a",
            prompt: "State Hooke's law for the stretched rope.",
            marks: 1,
          },
          { id: "bi", prompt: "Calculate the speed at A.", marks: 2 },
          {
            id: "bii",
            prompt: "Determine the rope's spring constant.",
            marks: 2,
          },
          {
            id: "biii",
            prompt: "Explain whether the ball is in equilibrium at B.",
            marks: 2,
          },
          {
            id: "biv",
            prompt:
              "Calculate the mean force exerted by the rope between A and B.",
            marks: 3,
          },
        ],
        [
          part(
            "a",
            1,
            [
              "The restoring force magnitude is F = kx, proportional to extension x within the elastic range.",
            ],
            ["State proportionality between restoring force and extension."],
            "F = kx within the elastic range",
          ),
          part(
            "bi",
            2,
            [
              "The ball falls freely through the natural length L.",
              "vₐ² = 2gL.",
            ],
            ["Use free-fall energy or kinematics.", "Calculate the speed."],
            numeric("speedAtAMs", "m s⁻¹"),
          ),
          part(
            "bii",
            2,
            [
              "The total drop is L + x, not x alone.",
              "mg(L + x) = kx²/2, giving k = 2mg(L + x)/x².",
            ],
            [
              "Conserve energy over the full fall.",
              "Solve for the spring constant.",
            ],
            numeric("springConstantNm", "N m⁻¹"),
          ),
          part(
            "biii",
            2,
            [
              `At B the tension kx = ${numeric("tensionAtBN", "N")} exceeds mg = ${f(s.massKg * s.gravityMs2)} N.`,
              "Zero velocity at a turning point does not imply zero acceleration; the resultant force is upward.",
            ],
            [
              "State that it is not in equilibrium.",
              "Explain the unbalanced upward force.",
            ],
            "No; the resultant force is upward.",
          ),
          part(
            "biv",
            3,
            [
              "Take upward as positive. The ball's momentum changes from −mvₐ to zero.",
              "Mean net upward force = mvₐ/Δt.",
              "Mean rope force = mvₐ/Δt + mg.",
            ],
            [
              "Calculate the momentum change.",
              "Divide by the time to find mean resultant force.",
              "Add the weight to find the rope force.",
            ],
            numeric("meanRopeForceN", "N"),
          ),
        ],
      );
    case "truck":
      return multipart(
        `A suspended ball inside a truck deflects as shown during rightward acceleration. The truck later moves at constant speed up a straight ${f(s.inclineDegrees)}° incline. It then takes a flat semicircular road with the pictured radius; the static friction coefficient is ${f(s.frictionCoefficient)}. For the coasting test its mass is ${f(s.massKg)} kg, initial speed is ${f(s.initialSpeedMs)} m s⁻¹ and constant opposing force is ${f(s.resistanceN)} N. Use g = ${f(s.gravityMs2)} m s⁻².`,
        [
          {
            id: "ai",
            prompt:
              "Draw and label the forces on the suspended ball during horizontal acceleration.",
            marks: 2,
          },
          {
            id: "aii",
            prompt: "Calculate the truck's acceleration.",
            marks: 2,
          },
          {
            id: "b",
            prompt:
              "State and explain the string's angle to the true vertical during constant-speed motion up the straight incline.",
            marks: 2,
          },
          {
            id: "c",
            prompt:
              "Calculate the maximum speed on the flat curved road without sliding.",
            marks: 2,
          },
          {
            id: "d",
            prompt:
              "Determine whether the coasting truck reaches the station at the other end of the semicircle.",
            marks: 3,
          },
        ],
        [
          part(
            "ai",
            2,
            [
              "Draw weight mg vertically down and tension T along the string upward and right.",
              "There is no additional centripetal or acceleration force; T cosθ = mg.",
            ],
            [
              "Label only tension along the string and weight downward.",
              "Show the vertical component of tension balancing weight.",
            ],
            "Weight downward; tension upward-right along the string.",
          ),
          part(
            "aii",
            2,
            [
              "T sinθ = ma and T cosθ = mg.",
              "Divide the equations: a = g tanθ.",
            ],
            [
              "Resolve tension vertically and horizontally.",
              "Calculate the acceleration from tanθ.",
            ],
            numeric("accelerationMs2", "m s⁻²"),
          ),
          part(
            "b",
            2,
            [
              "Straight constant-speed motion gives zero acceleration.",
              "Tension balances gravity along the true vertical, irrespective of the truck floor angle.",
            ],
            [
              "Explain zero acceleration and force balance.",
              "Give zero angle to the true vertical.",
            ],
            "0°",
          ),
          part(
            "c",
            2,
            ["Maximum static friction μmg supplies mv²/R.", "vₘₐₓ = √(μgR)."],
            [
              "Equate limiting friction to the centripetal resultant.",
              "Calculate the speed using the radius.",
            ],
            numeric("maximumCornerSpeedMs", "m s⁻¹"),
          ),
          part(
            "d",
            3,
            [
              `Initial energy is ${numeric("initialEnergyJ", "J")}.`,
              `The road length is πR = ${numeric("arcLengthM", "m")}; opposing work is ${numeric("resistingWorkJ", "J")}.`,
              `Since the energy exceeds the opposing work, it reaches the station with speed ${numeric("arrivalSpeedMs", "m s⁻¹")}.`,
            ],
            [
              "Calculate initial kinetic energy.",
              "Calculate resisting work along the semicircular arc.",
              "Compare and conclude whether the station is reached.",
            ],
            "Yes; the initial kinetic energy exceeds the resisting work.",
          ),
        ],
      );
    default: {
      const exhaustive: never = s;
      throw new Error(`Unsupported mechanics question: ${exhaustive}`);
    }
  }
}
function makeIntent(
  s: MechanicsScenario,
  id: string,
  results: MechanicsResults,
): MechanicsIntent {
  const base = {
    schemaVersion: MECHANICS_INTENT_SCHEMA_VERSION,
    id: `${id}-visual`,
    scenarioRef: id,
    labels: [] as MechanicsIntent["labels"],
    privateParameterIds: Object.keys(results).map((key) => `result:${key}`),
  };
  const labels = (values: Record<string, string>) =>
    Object.entries(values).map(([parameterId, text]) => ({
      parameterId,
      text,
    }));
  switch (s.kind) {
    case "projectile-flight":
      return {
        ...base,
        template: "projectile",
        launchAngleDegrees: 40,
        labels: labels({ speed: "v", angle: "θ" }),
      };
    case "cart-collision":
      return {
        ...base,
        template: "collision",
        labels: labels({
          "cart-x": `X: ${f(s.massXKg)} kg`,
          "cart-y": `Y: ${f(s.massYKg)} kg`,
          "speed-x": `${f(s.initialXMs)} m s⁻¹`,
        }),
      };
    case "circle-bottom":
      return {
        ...base,
        template: "vertical-circle",
        labels: labels({
          radius: `${f(s.radiusM)} m`,
          body: `${f(s.massKg)} kg`,
        }),
      };
    case "ramp-resistance":
      return {
        ...base,
        template: "incline",
        angleDegrees: (Math.asin(s.heightM / s.lengthM) * 180) / Math.PI,
        showStartEnd: true,
        labels: labels({
          length: `${f(s.lengthM)} m`,
          height: `${f(s.heightM)} m`,
        }),
      };
    case "incline-friction":
      return {
        ...base,
        template: "incline",
        angleDegrees: s.angleDegrees,
        showStartEnd: false,
        labels: labels({
          body: `${f(s.massKg)} kg`,
          length: `${f(s.lengthM)} m`,
          angle: `${f(s.angleDegrees)}°`,
        }),
      };
    case "pendulum-collision":
      return {
        ...base,
        template: "pendulum",
        labels: labels({
          body: `${f(s.massKg)} kg`,
          target: `${f(s.targetMassKg)} kg`,
          length: `${f(s.lengthM)} m`,
          combined: "joined balls",
          rise: "h",
        }),
      };
    case "elastic-rope":
      return {
        ...base,
        template: "elastic-rope",
        labels: labels({
          release: "S",
          "point-a": "A",
          "point-b": "B",
          length: `${f(s.lengthM)} m`,
          extension: `${f(s.extensionM)} m`,
        }),
      };
    case "truck":
      return {
        ...base,
        template: "accelerometer",
        angleDegrees: s.deflectionDegrees,
        labels: labels({
          angle: `${f(s.deflectionDegrees)}°`,
          motion: "acceleration →",
          radius: `${f(s.radiusM)} m`,
          station: "station",
        }),
      };
    default: {
      const exhaustive: never = s;
      throw new Error(`Unsupported mechanics visual: ${exhaustive}`);
    }
  }
}
function buildPackage(
  fixture: MechanicsSourceFixture,
  definition: Definition,
): MechanicsQuestionPackage {
  const id = `${fixture.id}-package`,
    results = solveMechanicsScenario(definition.scenario);
  const intent = makeIntent(definition.scenario, id, results);
  const visualSpec = compileMechanicsIntent(intent);
  visualSpec.provenance = {
    ...visualSpec.provenance,
    sourceQuestionId: fixture.questionId,
  };
  return {
    schemaVersion: MECHANICS_QUESTION_PACKAGE_VERSION,
    id,
    paper: fixture.paper,
    source: {
      fixtureId: fixture.id,
      questionId: fixture.questionId,
      questionLabel: fixture.questionLabel,
      sourceScope: fixture.scope,
      markscheme: {
        sourceId: fixture.markscheme.sourceId,
        pages: fixture.markscheme.pages,
        evidence: [fixture.evidence],
      },
    },
    assumptions: definition.assumptions,
    scenario: definition.scenario,
    intent,
    visualSpec,
    results,
    ...author(definition.scenario, results),
    sourceChecks: definition.sourceChecks,
    physicsStatus: "verified",
    trainingEligibility: "blocked",
    trainingBlockers: [
      "not human reviewed",
      "source-use rights not cleared",
      "training metadata and grouped split not assigned",
    ],
  };
}
export const MECHANICS_QUESTION_PACKAGES: readonly MechanicsQuestionPackage[] =
  MECHANICS_SOURCE_FIXTURES.map((fixture, index) =>
    buildPackage(fixture, DEFINITIONS[index]),
  );

export function validateMechanicsQuestionPackage(
  item: MechanicsQuestionPackage,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const index = MECHANICS_SOURCE_FIXTURES.findIndex(
    (fixture) => fixture.id === item.source.fixtureId,
  );
  if (index < 0)
    return { valid: false, issues: ["Unknown mechanics source fixture"] };
  try {
    const expected = buildPackage(
      MECHANICS_SOURCE_FIXTURES[index],
      DEFINITIONS[index],
    );
    if (
      item.schemaVersion !== MECHANICS_QUESTION_PACKAGE_VERSION ||
      item.id !== expected.id ||
      JSON.stringify(item.source) !== JSON.stringify(expected.source) ||
      item.paper !== expected.paper
    )
      issues.push("Mechanics source identity or schema mismatch");
    if (JSON.stringify(item.scenario) !== JSON.stringify(expected.scenario))
      issues.push("Source-backed scenario differs from verified givens");
    const results = solveMechanicsScenario(item.scenario);
    if (JSON.stringify(item.results) !== JSON.stringify(results))
      issues.push("Stored results disagree with the mechanics solver");
    const authored = author(item.scenario, results);
    if (JSON.stringify(item.question) !== JSON.stringify(authored.question))
      issues.push("Student givens or choices disagree with the scenario");
    if (JSON.stringify(item.solution) !== JSON.stringify(authored.solution))
      issues.push("Solution disagrees with verified physics");
    const intent = makeIntent(item.scenario, item.id, results);
    if (
      JSON.stringify(item.intent) !== JSON.stringify(intent) ||
      JSON.stringify(item.visualSpec) !== JSON.stringify(expected.visualSpec)
    )
      issues.push("Student diagram disagrees with the verified scenario");
    renderMechanicsScene(item.visualSpec);
    if (
      !item.sourceChecks.length ||
      JSON.stringify(item.sourceChecks) !==
        JSON.stringify(expected.sourceChecks)
    )
      issues.push("Independent source expectations are missing or changed");
    for (const check of expected.sourceChecks) {
      const result = results[check.resultKey];
      const passes =
        check.kind === "numeric"
          ? typeof result === "number" &&
            Math.abs(result - check.expected) <= check.tolerance
          : result === check.expected;
      if (!passes) issues.push(`Source target failed: ${check.resultKey}`);
    }
    const fixture = MECHANICS_SOURCE_FIXTURES[index];
    if (
      fixture.expectedOption &&
      item.solution.correctOptionId !== fixture.expectedOption
    )
      issues.push("MCQ answer differs from the linked scheme");
    const parts =
      item.question.kind === "multiple-choice"
        ? [{ id: "answer", marks: 1 }]
        : item.question.parts;
    if (
      new Set(parts.map((p) => p.id)).size !== parts.length ||
      item.marks !== authored.marks ||
      item.marks !== parts.reduce((sum, p) => sum + p.marks, 0) ||
      item.solution.parts.length !== parts.length
    )
      issues.push("Mechanics marks or part structure disagree");
    for (const p of parts) {
      const solution = item.solution.parts.find(
        (candidate) => candidate.partId === p.id,
      );
      if (
        !solution ||
        solution.marks !== p.marks ||
        solution.markingPoints.length !== p.marks ||
        !solution.working.length ||
        !solution.finalAnswer.trim()
      )
        issues.push(`Incomplete solution or marking points: ${p.id}`);
    }
    if (
      item.physicsStatus !== "verified" ||
      item.trainingEligibility !== "blocked" ||
      JSON.stringify(item.trainingBlockers) !==
        JSON.stringify(expected.trainingBlockers) ||
      JSON.stringify(item.assumptions) !== JSON.stringify(expected.assumptions)
    )
      issues.push("Mechanics review status or assumptions changed");
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  return { valid: issues.length === 0, issues };
}

export function renderMechanicsSolutionVisuals(
  item: MechanicsQuestionPackage,
): Array<{ partId: string; svg: string }> {
  if (item.scenario.kind !== "truck") return [];
  const horizontal =
    0.2 * Math.tan((item.scenario.deflectionDegrees * Math.PI) / 180);
  const spec: VisualSpec<"mechanics_scene"> = {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    id: `${item.id}-teacher-forces`,
    scenarioRef: item.id,
    family: "mechanics_scene",
    templateId: "scene.mechanics.v1",
    coordinateSpace: "scene",
    composition: { kind: "single" },
    visibility: {
      publicParameterIds: ["weight", "tension"],
      privateParameterIds: [],
      labelMode: "allowlist",
      altTextMode: "student-safe",
    },
    payload: {
      panels: [
        {
          id: "forces",
          bodies: [
            {
              id: "bob",
              kind: "ball",
              position: { x: 0.4, y: 0.45 },
              angleDegrees: 0,
            },
          ],
          paths: [],
          angles: [],
          vectors: [
            {
              id: "weight",
              originRef: "bob",
              direction: { x: 0, y: 0.2 },
              label: { parameterId: "weight", text: "mg" },
            },
            {
              id: "tension",
              originRef: "bob",
              direction: { x: horizontal, y: -0.2 },
              label: { parameterId: "tension", text: "T" },
            },
          ],
        },
      ],
    },
  };
  return [{ partId: "ai", svg: renderMechanicsScene(spec) }];
}
