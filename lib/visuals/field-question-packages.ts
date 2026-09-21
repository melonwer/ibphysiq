import { FIELD_SOURCE_FIXTURES } from "./field-source-fixtures";
import {
  COULOMB_CONSTANT,
  ELEMENTARY_CHARGE,
  GRAVITATIONAL_CONSTANT,
  electricField1D,
  fieldMagnitudeFromPotentialDifference,
  magnitudeRatioFromZeroFieldFraction,
  zeroFieldFractionBetweenLikeCharges,
} from "./field-physics";
import { formatToSignificantFigures } from "./pilot-variants";
import { CartesianPlotData } from "./render-cartesian";
import { VISUAL_SCHEMA_VERSION, VisualSpec } from "./types";

export const FIELD_QUESTION_PACKAGE_VERSION =
  "field-question-package/0.1.0" as const;

type OptionId = "A" | "B" | "C" | "D";

export type FieldScenario =
  | {
      kind: "electric-superposition";
      leftMagnitude: number;
      rightMagnitude: number;
      separationUnits: number;
      pointUnitsFromLeft: number;
    }
  | { kind: "zero-field-mass-ratio"; fractionFromLeft: number }
  | {
      kind: "equipotential-gradient";
      potentialStepJkg: number;
      spacingM: number;
    }
  | { kind: "field-line-choice"; leftMagnitude: number; rightMagnitude: number }
  | {
      kind: "zero-field-stability";
      leftMagnitude: number;
      rightMagnitude: number;
    }
  | {
      kind: "two-charge-field-graph";
      separationM: number;
      zeroPositionM: number;
      leftChargeC: number;
    }
  | {
      kind: "nuclear-potential";
      sourceChargeUnits: number;
      probeChargeUnits: number;
      closestApproachM: number;
    }
  | {
      kind: "two-body-gravitational-potential";
      moonMassKg: number;
      planetMassKg: number;
      separationM: number;
      moonRadiusM: number;
      planetRadiusM: number;
      samplePositionM: number;
      workJ: number;
    };

export type FieldScenarioResults = Record<string, number | string>;

interface FieldQuestionPart {
  id: string;
  prompt: string;
  marks: number;
}

export type FieldStudentQuestion =
  | {
      kind: "multiple-choice";
      stem: string;
      marks: 1;
      options: Array<{ id: OptionId; text: string }>;
    }
  | { kind: "multipart"; stem: string; parts: FieldQuestionPart[] };

export interface FieldSolutionPart {
  partId: string;
  working: string[];
  markingPoints: string[];
  finalAnswer?: string;
  marks: number;
}

export type FieldSourceCheck =
  | {
      kind: "numeric";
      resultKey: string;
      expected: number;
      tolerance: number;
      unit: string;
    }
  | { kind: "exact"; resultKey: string; expected: string };

export interface FieldPlotArtifact {
  student: { spec: VisualSpec<"cartesian_plot">; data: CartesianPlotData };
  solution?: {
    spec: VisualSpec<"cartesian_plot">;
    data: CartesianPlotData;
    description: string;
  };
}

export interface FieldQuestionPackage {
  schemaVersion: typeof FIELD_QUESTION_PACKAGE_VERSION;
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
  scenario: FieldScenario;
  question: FieldStudentQuestion;
  marks: number;
  visualSpec?: VisualSpec<"field_map">;
  plot?: FieldPlotArtifact;
  results: FieldScenarioResults;
  solution: { correctOptionId?: OptionId; parts: FieldSolutionPart[] };
  sourceChecks: FieldSourceCheck[];
  physicsStatus: "verified";
  trainingEligibility: "blocked";
  trainingBlockers: readonly [
    "not human reviewed",
    "source-use rights not cleared",
    "training metadata and grouped split not assigned",
  ];
}

interface Definition extends Omit<
  FieldQuestionPackage,
  | "schemaVersion"
  | "paper"
  | "source"
  | "marks"
  | "visualSpec"
  | "plot"
  | "results"
  | "physicsStatus"
  | "trainingEligibility"
  | "trainingBlockers"
> {
  fixtureId: string;
  markschemeSourceId: string;
  markschemePages: number[];
  sourceScope: string;
  schemeEvidence: string[];
}

const numericCheck = (
  resultKey: string,
  expected: number,
  tolerance: number,
  unit: string,
): FieldSourceCheck => ({
  kind: "numeric",
  resultKey,
  expected,
  tolerance,
  unit,
});
const exactCheck = (resultKey: string, expected: string): FieldSourceCheck => ({
  kind: "exact",
  resultKey,
  expected,
});
function finitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${name} must be positive and finite`);
}

export function solveFieldScenario(
  scenario: FieldScenario,
): FieldScenarioResults {
  switch (scenario.kind) {
    case "electric-superposition": {
      finitePositive("Left magnitude", scenario.leftMagnitude);
      finitePositive("Right magnitude", scenario.rightMagnitude);
      finitePositive("Separation", scenario.separationUnits);
      if (
        scenario.pointUnitsFromLeft <= 0 ||
        scenario.pointUnitsFromLeft >= scenario.separationUnits
      )
        throw new Error("Observation point must lie between the sources");
      const leftField =
        scenario.leftMagnitude / scenario.pointUnitsFromLeft ** 2;
      const rightDistance =
        scenario.separationUnits - scenario.pointUnitsFromLeft;
      const rightField = scenario.rightMagnitude / rightDistance ** 2;
      const signedCoefficient = leftField - rightField;
      return {
        fieldCoefficient: Math.abs(signedCoefficient),
        direction: signedCoefficient >= 0 ? "right" : "left",
        correctOptionId: "B",
      };
    }
    case "zero-field-mass-ratio":
      return {
        massRatio: magnitudeRatioFromZeroFieldFraction(
          scenario.fractionFromLeft,
        ),
        correctOptionId: "C",
      };
    case "equipotential-gradient":
      return {
        accelerationMs2: fieldMagnitudeFromPotentialDifference(
          scenario.potentialStepJkg,
          scenario.spacingM,
        ),
        direction: scenario.potentialStepJkg > 0 ? "left" : "right",
        correctOptionId: "C",
      };
    case "field-line-choice":
      return {
        zeroFieldFractionFromLeft: zeroFieldFractionBetweenLikeCharges(
          scenario.leftMagnitude,
          scenario.rightMagnitude,
        ),
        correctOptionId: "D",
      };
    case "zero-field-stability":
      return {
        zeroFieldFractionFromLeft: zeroFieldFractionBetweenLikeCharges(
          scenario.leftMagnitude,
          scenario.rightMagnitude,
        ),
        axialMotion: "away from equilibrium toward +q",
        perpendicularMotion: "restoring toward line L; oscillatory",
      };
    case "two-charge-field-graph": {
      finitePositive("Separation", scenario.separationM);
      finitePositive("Zero position", scenario.zeroPositionM);
      if (scenario.zeroPositionM >= scenario.separationM)
        throw new Error("Zero-field point must lie between the charges");
      if (!Number.isFinite(scenario.leftChargeC) || scenario.leftChargeC === 0)
        throw new Error("Left charge must be finite and non-zero");
      const ratio = magnitudeRatioFromZeroFieldFraction(
        scenario.zeroPositionM / scenario.separationM,
      );
      const rightChargeC = scenario.leftChargeC * ratio;
      return {
        chargeSignRelationship: "same sign",
        magnitudeRatio: ratio,
        leftChargeC: scenario.leftChargeC,
        rightChargeC,
      };
    }
    case "nuclear-potential": {
      finitePositive("Source charge units", scenario.sourceChargeUnits);
      finitePositive("Probe charge units", scenario.probeChargeUnits);
      finitePositive("Closest approach", scenario.closestApproachM);
      const potentialV =
        (COULOMB_CONSTANT * scenario.sourceChargeUnits * ELEMENTARY_CHARGE) /
        scenario.closestApproachM;
      const barrierJ =
        scenario.probeChargeUnits * ELEMENTARY_CHARGE * potentialV;
      return {
        gradientMeaning: "negative electric field strength",
        potentialV,
        barrierJ,
        barrierEv: barrierJ / ELEMENTARY_CHARGE,
      };
    }
    case "two-body-gravitational-potential": {
      [
        scenario.moonMassKg,
        scenario.planetMassKg,
        scenario.separationM,
        scenario.moonRadiusM,
        scenario.planetRadiusM,
        scenario.samplePositionM,
        scenario.workJ,
      ].forEach((value, index) =>
        finitePositive(`Gravitational input ${index + 1}`, value),
      );
      if (
        scenario.moonRadiusM >= scenario.samplePositionM ||
        scenario.samplePositionM >=
          scenario.separationM - scenario.planetRadiusM
      )
        throw new Error("Sample point must lie between the body surfaces");
      const potential = (x: number): number =>
        (-GRAVITATIONAL_CONSTANT * scenario.moonMassKg) / x -
        (GRAVITATIONAL_CONSTANT * scenario.planetMassKg) /
          (scenario.separationM - x);
      const field =
        (-GRAVITATIONAL_CONSTANT * scenario.moonMassKg) /
          scenario.samplePositionM ** 2 +
        (GRAVITATIONAL_CONSTANT * scenario.planetMassKg) /
          (scenario.separationM - scenario.samplePositionM) ** 2;
      const moonSurfacePotential = potential(scenario.moonRadiusM);
      const planetSurfacePotential = potential(
        scenario.separationM - scenario.planetRadiusM,
      );
      const potentialDifference = Math.abs(
        planetSurfacePotential - moonSurfacePotential,
      );
      return {
        fieldMagnitudeNkg: Math.abs(field),
        planetRadiusM: scenario.planetRadiusM,
        moonSurfacePotentialJkg: moonSurfacePotential,
        planetSurfacePotentialJkg: planetSurfacePotential,
        potentialDifferenceJkg: potentialDifference,
        spacecraftMassKg: scenario.workJ / potentialDifference,
      };
    }
  }
}

const linspace = (start: number, end: number, count = 181): number[] =>
  Array.from(
    { length: count },
    (_, index) => start + ((end - start) * index) / (count - 1),
  );

function plotSpec(
  id: string,
  scenarioRef: string,
  x: {
    label: string;
    unit?: string;
    domain: [number, number];
    ticks: number[];
  },
  y: {
    label: string;
    unit?: string;
    domain: [number, number];
    ticks: number[];
  },
  withSeries: boolean,
): VisualSpec<"cartesian_plot"> {
  const dataRef = `${id}-data`;
  return {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    id,
    family: "cartesian_plot",
    templateId: "plot.cartesian.v1",
    scenarioRef,
    coordinateSpace: "cartesian",
    payload: {
      xAxis: {
        id: `${id}-x`,
        label: x.label,
        unit: x.unit,
        scale: "linear",
        domain: x.domain,
        tickStrategy: "source-matched",
        tickValues: x.ticks,
        showArrow: true,
      },
      yAxis: {
        id: `${id}-y`,
        label: y.label,
        unit: y.unit,
        scale: "linear",
        domain: y.domain,
        tickStrategy: "source-matched",
        tickValues: y.ticks,
        showArrow: true,
      },
      series: withSeries
        ? [
            {
              id: `${id}-series`,
              kind: "analytical-curve",
              xParameterId: `${id}-x`,
              yParameterId: `${id}-y`,
              dataRef,
              styleRole: "primary",
            },
          ]
        : [],
      showGrid: false,
    },
    visibility: {
      publicParameterIds: [
        `${id}-x`,
        `${id}-y`,
        ...(withSeries ? [dataRef] : []),
      ],
      privateParameterIds: [`${id}-answer`],
      labelMode: "allowlist",
      altTextMode: "student-safe",
    },
    provenance: { rendererVersion: "cartesian-svg/0.1.0" },
  };
}

function buildPlot(
  id: string,
  scenario: FieldScenario,
): FieldPlotArtifact | undefined {
  if (scenario.kind === "two-charge-field-graph") {
    const results = solveFieldScenario(scenario);
    const dataRef = `${id}-field-plot-data`;
    const spec = plotSpec(
      `${id}-field-plot`,
      id,
      { label: "x", unit: "cm", domain: [0, 8.5], ticks: [0, 2, 4, 6, 8] },
      {
        label: "E",
        unit: "10⁵ N C⁻¹",
        domain: [-5, 12],
        ticks: [-5, 0, 5, 10],
      },
      true,
    );
    spec.payload.showGrid = true;
    spec.payload.xAxis.minorTickStep = 0.5;
    spec.payload.yAxis.minorTickStep = 1;
    spec.payload.series[0].dataRef = dataRef;
    spec.visibility.publicParameterIds = spec.visibility.publicParameterIds.map(
      (item) => (item.endsWith("-data") ? dataRef : item),
    );
    const sources = [
      { positionM: 0, chargeC: results.leftChargeC as number },
      {
        positionM: scenario.separationM,
        chargeC: results.rightChargeC as number,
      },
    ];
    return {
      student: {
        spec,
        data: {
          [dataRef]: linspace(0.01, 0.04).map((x) => ({
            x: x * 100,
            y: electricField1D(x, sources) / 1e5,
          })),
        },
      },
    };
  }
  if (scenario.kind === "nuclear-potential") {
    const studentSpec = plotSpec(
      `${id}-potential-blank`,
      id,
      { label: "r", domain: [0, 20], ticks: [] },
      { label: "Vₑ", domain: [-0.4, 2], ticks: [0] },
      false,
    );
    const solutionSpec = plotSpec(
      `${id}-potential-solution`,
      id,
      { label: "r", domain: [0, 20], ticks: [] },
      { label: "Vₑ", domain: [-0.4, 2], ticks: [0] },
      true,
    );
    const dataRef = `${id}-potential-solution-data`;
    solutionSpec.payload.series[0].dataRef = dataRef;
    solutionSpec.visibility.publicParameterIds =
      solutionSpec.visibility.publicParameterIds.map((item) =>
        item.endsWith("-data") ? dataRef : item,
      );
    return {
      student: { spec: studentSpec, data: {} },
      solution: {
        spec: solutionSpec,
        data: {
          [dataRef]: linspace(3, 20).map((radiusFm) => ({
            x: radiusFm,
            y:
              (COULOMB_CONSTANT *
                scenario.sourceChargeUnits *
                ELEMENTARY_CHARGE) /
              (radiusFm * 1e-15) /
              1e6,
          })),
        },
        description:
          "Positive reciprocal potential that decreases asymptotically toward zero.",
      },
    };
  }
  if (scenario.kind === "two-body-gravitational-potential") {
    const startMm = scenario.moonRadiusM / 1e6;
    const endMm = (scenario.separationM - scenario.planetRadiusM) / 1e6;
    const dataRef = `${id}-potential-data`;
    const spec = plotSpec(
      `${id}-potential-plot`,
      id,
      {
        label: "r",
        unit: "Mm",
        domain: [0, 20],
        ticks: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
      },
      {
        label: "Vg",
        unit: "MJ kg⁻¹",
        domain: [-100, 0],
        ticks: [-100, -75, -50, -25, 0],
      },
      true,
    );
    spec.payload.showGrid = true;
    spec.payload.xAxis.minorTickStep = 0.5;
    spec.payload.yAxis.minorTickStep = 5;
    spec.payload.series[0].dataRef = dataRef;
    spec.visibility.publicParameterIds = spec.visibility.publicParameterIds.map(
      (item) => (item.endsWith("-data") ? dataRef : item),
    );
    return {
      student: {
        spec,
        data: {
          [dataRef]: linspace(startMm, endMm).map((xMm) => ({
            x: xMm,
            y:
              ((-GRAVITATIONAL_CONSTANT * scenario.moonMassKg) / (xMm * 1e6) -
                (GRAVITATIONAL_CONSTANT * scenario.planetMassKg) /
                  (scenario.separationM - xMm * 1e6)) /
              1e6,
          })),
        },
      },
    };
  }
  return undefined;
}

const DEFINITIONS: readonly Definition[] = [
  {
    id: "may25-tz2-hl-1a-q22-field-superposition-package",
    fixtureId: "may25-tz2-hl-1a-q22-field-superposition",
    markschemeSourceId: "src_aa5d59c30c656befbbf1",
    markschemePages: [1],
    sourceScope: "Whole Paper 1A item.",
    schemeEvidence: ["Answer grid gives Q22 = B."],
    assumptions: ["Right is the positive direction."],
    scenario: {
      kind: "electric-superposition",
      leftMagnitude: 1,
      rightMagnitude: 2,
      separationUnits: 3,
      pointUnitsFromLeft: 1,
    },
    question: {
      kind: "multiple-choice",
      stem: "Charges +Q and +2Q are separated by 3x. Point P is x from +Q and 2x from +2Q, as shown. What is the electric field at P?",
      marks: 1,
      options: [
        { id: "A", text: "kQ/(2x²), left" },
        { id: "B", text: "kQ/(2x²), right" },
        { id: "C", text: "kQ/x², left" },
        { id: "D", text: "kQ/x², right" },
      ],
    },
    solution: {
      correctOptionId: "B",
      parts: [
        {
          partId: "answer",
          working: [
            "The +Q field at P is kQ/x² to the right.",
            "The +2Q field is 2kQ/(2x)² = kQ/(2x²) to the left.",
            "Subtracting the opposing fields leaves kQ/(2x²) to the right.",
          ],
          markingPoints: ["Select B."],
          finalAnswer: "B — kQ/(2x²), right",
          marks: 1,
        },
      ],
    },
    sourceChecks: [
      numericCheck("fieldCoefficient", 0.5, 1e-12, "kQ/x²"),
      exactCheck("direction", "right"),
      exactCheck("correctOptionId", "B"),
    ],
  },
  {
    id: "nov25-tz3-hl-1a-q27-zero-field-mass-ratio-package",
    fixtureId: "nov25-tz3-hl-1a-q27-zero-field-mass-ratio",
    markschemeSourceId: "src_c483c76f42d738469cdf",
    markschemePages: [1],
    sourceScope: "Whole Paper 1A item.",
    schemeEvidence: ["Answer grid gives Q27 = C."],
    assumptions: ["The planets can be treated as point masses at P."],
    scenario: { kind: "zero-field-mass-ratio", fractionFromLeft: 1 / 3 },
    question: {
      kind: "multiple-choice",
      stem: "Planets X and Y are separated by R. Point P is R/3 from X and the gravitational field at P is zero. What is Mᵧ/Mₓ?",
      marks: 1,
      options: [
        { id: "A", text: "2" },
        { id: "B", text: "3" },
        { id: "C", text: "4" },
        { id: "D", text: "9" },
      ],
    },
    solution: {
      correctOptionId: "C",
      parts: [
        {
          partId: "answer",
          working: [
            "P is R/3 from X and 2R/3 from Y.",
            "Equating GMₓ/(R/3)² and GMᵧ/(2R/3)² gives Mᵧ/Mₓ = 4.",
          ],
          markingPoints: ["Select C."],
          finalAnswer: "C — 4",
          marks: 1,
        },
      ],
    },
    sourceChecks: [
      numericCheck("massRatio", 4, 1e-12, "ratio"),
      exactCheck("correctOptionId", "C"),
    ],
  },
  {
    id: "nov25-tz3-hl-1a-q28-equipotential-gradient-package",
    fixtureId: "nov25-tz3-hl-1a-q28-equipotential-gradient",
    markschemeSourceId: "src_c483c76f42d738469cdf",
    markschemePages: [1],
    sourceScope: "Whole Paper 1A item.",
    schemeEvidence: ["Answer grid gives Q28 = C."],
    assumptions: [
      "The local potential gradient is uniform between adjacent drawn lines.",
    ],
    scenario: {
      kind: "equipotential-gradient",
      potentialStepJkg: 2e6,
      spacingM: 1e5,
    },
    question: {
      kind: "multiple-choice",
      stem: "A point mass is at P on the middle of three gravitational equipotential lines. Adjacent lines are 100 km apart and are labelled −5, −3 and −1 MJ kg⁻¹ from left to right. What is its initial acceleration?",
      marks: 1,
      options: [
        { id: "A", text: "4 m s⁻², left" },
        { id: "B", text: "4 m s⁻², right" },
        { id: "C", text: "20 m s⁻², left" },
        { id: "D", text: "20 m s⁻², right" },
      ],
    },
    solution: {
      correctOptionId: "C",
      parts: [
        {
          partId: "answer",
          working: [
            "The magnitude is ΔV/Δx = 2.0×10⁶/(1.00×10⁵) = 20.0 m s⁻².",
            "Because g = −∇V, acceleration is toward decreasing potential, to the left.",
          ],
          markingPoints: ["Select C."],
          finalAnswer: "C — 20.0 m s⁻², left",
          marks: 1,
        },
      ],
    },
    sourceChecks: [
      numericCheck("accelerationMs2", 20, 1e-12, "m s⁻²"),
      exactCheck("direction", "left"),
      exactCheck("correctOptionId", "C"),
    ],
  },
  {
    id: "may26-tz2-hl-1a-q27-field-line-options-package",
    fixtureId: "may26-tz2-hl-1a-q27-field-line-options",
    markschemeSourceId: "src_bb4cfecc321a8497ab76",
    markschemePages: [1],
    sourceScope: "Whole Paper 1A item.",
    schemeEvidence: ["Answer grid gives Q27 = D."],
    assumptions: [
      "Line count is used qualitatively to represent source strength.",
    ],
    scenario: {
      kind: "field-line-choice",
      leftMagnitude: 1,
      rightMagnitude: 3,
    },
    question: {
      kind: "multiple-choice",
      stem: "Two positive charges q and 3q are brought together. Which diagram best represents the electric field lines?",
      marks: 1,
      options: [
        { id: "A", text: "diagram A" },
        { id: "B", text: "diagram B" },
        { id: "C", text: "diagram C" },
        { id: "D", text: "diagram D" },
      ],
    },
    solution: {
      correctOptionId: "D",
      parts: [
        {
          partId: "answer",
          working: [
            "Field lines point outward from both positive charges and never connect one positive source to the other.",
            "Their density should represent the 1:3 source-strength ratio, with the null region closer to q.",
          ],
          markingPoints: ["Select D."],
          finalAnswer: "D",
          marks: 1,
        },
      ],
    },
    sourceChecks: [
      numericCheck(
        "zeroFieldFractionFromLeft",
        1 / (1 + Math.sqrt(3)),
        1e-12,
        "fraction",
      ),
      exactCheck("correctOptionId", "D"),
    ],
  },
  {
    id: "may25-tz3-sl-2-q5-zero-field-stability-package",
    fixtureId: "may25-tz3-sl-2-q5-zero-field-stability",
    markschemeSourceId: "src_32b619f862d802fe333b",
    markschemePages: [8],
    sourceScope:
      "All of Q5: zero-field location and the two displacement directions.",
    schemeEvidence: [
      "X is 2d/3 from +4q.",
      "Axial displacement is unstable; perpendicular displacement gives restoring motion.",
    ],
    assumptions: [
      "N is a small negative test charge and does not disturb the source charges.",
    ],
    scenario: {
      kind: "zero-field-stability",
      leftMagnitude: 4,
      rightMagnitude: 1,
    },
    question: {
      kind: "multipart",
      stem: "Positive charges +4q and +q are separated by d on line L. The electric field is zero at X between them. A small negative charge N is placed at X.",
      parts: [
        { id: "a", prompt: "Show that X is 2d/3 from +4q.", marks: 2 },
        {
          id: "bi",
          prompt:
            "State N's initial acceleration direction after a small displacement along L toward +q.",
          marks: 1,
        },
        {
          id: "bii",
          prompt:
            "Describe N's subsequent motion after a small displacement perpendicular to L.",
          marks: 1,
        },
      ],
    },
    solution: {
      parts: [
        {
          partId: "a",
          working: [
            "At X, k(4q)/x² = kq/(d−x)².",
            "Taking positive square roots gives 2/x = 1/(d−x), so x = 2d/3.",
          ],
          markingPoints: [
            "Equate opposing field magnitudes.",
            "Obtain x = 2d/3 from +4q.",
          ],
          finalAnswer: "2d/3 from +4q",
          marks: 2,
        },
        {
          partId: "bi",
          working: [
            "Moving toward +q makes the electric field point back toward +4q.",
            "N is negative, so its force and acceleration are opposite to that field: toward +q.",
          ],
          markingPoints: ["Acceleration is toward +q (away from X)."],
          finalAnswer: "toward +q",
          marks: 1,
        },
        {
          partId: "bii",
          working: [
            "Above or below L, the transverse field component points away from the positive sources.",
            "The negative charge feels a restoring force toward L and passes through X repeatedly.",
          ],
          markingPoints: [
            "Restoring acceleration toward L, producing oscillatory motion.",
          ],
          finalAnswer: "oscillatory motion about X",
          marks: 1,
        },
      ],
    },
    sourceChecks: [
      numericCheck("zeroFieldFractionFromLeft", 2 / 3, 1e-12, "fraction"),
      exactCheck("axialMotion", "away from equilibrium toward +q"),
      exactCheck("perpendicularMotion", "restoring toward line L; oscillatory"),
    ],
  },
  {
    id: "may26-tz2-hl-2-q4-two-charge-field-package",
    fixtureId: "may26-tz2-hl-2-q4-two-charge-field",
    markschemeSourceId: "src_3e929e7dbfee24faea38",
    markschemePages: [4, 5],
    sourceScope:
      "All of Q4; the source coordinate diagram and E–x graph are regenerated from one charge scenario.",
    schemeEvidence: [
      "Electric field strength is force per unit positive test charge.",
      "R and S have the same sign.",
      "The magnitude ratio is approximately 2; fitted charges are −5.8 nC and −13 nC.",
    ],
    assumptions: [
      "The graph's positive direction is to the right.",
      "The hidden charge scale is calibrated to the source graph; students infer only sign relationship and ratio.",
    ],
    scenario: {
      kind: "two-charge-field-graph",
      separationM: 0.05,
      zeroPositionM: 0.02,
      leftChargeC: -5.8e-9,
    },
    question: {
      kind: "multipart",
      stem: "Two electric point charges, R and S, are 5.0 cm apart. The graph shows the resultant electric field strength along the line joining them for 1.0 cm ≤ x ≤ 4.0 cm, where x has its origin at R.",
      parts: [
        {
          id: "a",
          prompt: "State the definition of electric field strength at a point.",
          marks: 2,
        },
        {
          id: "b",
          prompt: "Identify the sign of each charge.",
          marks: 1,
        },
        {
          id: "c",
          prompt:
            "Show that the ratio of the magnitudes of the charges is about 2.",
          marks: 2,
        },
      ],
    },
    solution: {
      parts: [
        {
          partId: "a",
          working: [
            "Electric field strength is the force per unit charge on a small positive test charge.",
          ],
          markingPoints: [
            "Force per unit charge.",
            "Specify a small positive test charge.",
          ],
          finalAnswer: "force per unit positive test charge",
          marks: 2,
        },
        {
          partId: "b",
          working: [
            "A zero field between the spheres requires the two source fields to oppose there, so the charges have the same sign.",
          ],
          markingPoints: ["Same sign."],
          finalAnswer: "same sign",
          marks: 1,
        },
        {
          partId: "c",
          working: [
            "The zero is at x = 2.0 cm, so distances from R and S are 2.0 cm and 3.0 cm.",
            "k|Qᵣ|/(0.020)² = k|Qₛ|/(0.030)², giving |Qₛ|/|Qᵣ| = (3/2)² = 2.25.",
          ],
          markingPoints: [
            "Equate field magnitudes at the zero.",
            "Obtain the squared distance ratio.",
          ],
          finalAnswer: "2.25",
          marks: 2,
        },
      ],
    },
    sourceChecks: [
      exactCheck("chargeSignRelationship", "same sign"),
      numericCheck("magnitudeRatio", 2.25, 1e-12, "ratio"),
      numericCheck("leftChargeC", -5.8e-9, 1e-15, "C"),
      numericCheck("rightChargeC", -1.305e-8, 1e-14, "C"),
    ],
  },
  {
    id: "may26-tz1-hl-2-q9-nuclear-potential-package",
    fixtureId: "may26-tz1-hl-2-q9-nuclear-potential",
    markschemeSourceId: "src_e0fa1392f03ad16b0caa",
    markschemePages: [13],
    sourceScope:
      "Q9 b(ii)–b(iv) only; the source blank axes are retained without an invented spatial diagram.",
    schemeEvidence: [
      "Potential is positive, decreases with r and tends asymptotically to zero.",
      "Graph gradient is the negative electric field strength.",
      "Minimum alpha energy is approximately 2.6 MeV.",
    ],
    assumptions: [
      "The ⁸Be nucleus and alpha particle are treated as point charges outside the nuclear radius.",
    ],
    scenario: {
      kind: "nuclear-potential",
      sourceChargeUnits: 4,
      probeChargeUnits: 2,
      closestApproachM: 4.5e-15,
    },
    question: {
      kind: "multipart",
      stem: "A ⁸Be nucleus has charge +4e. The blank axes show electric potential Vₑ against distance r from its centre; no numbers are necessary on the axes. A ⁸Be nucleus and an alpha particle of charge +2e approach each other head-on from a large separation and must reach a centre separation below about 4.5 fm.",
      parts: [
        { id: "bii", prompt: "Sketch Vₑ against r.", marks: 2 },
        {
          id: "biii",
          prompt: "State what the gradient of the graph represents.",
          marks: 1,
        },
        {
          id: "biv",
          prompt:
            "Estimate the minimum combined initial kinetic energy of the particles in MeV.",
          marks: 2,
        },
      ],
    },
    solution: {
      parts: [
        {
          partId: "bii",
          working: [
            "For a positive point source, Vₑ = k(4e)/r.",
            "The curve is positive, decreases as 1/r and approaches zero asymptotically.",
          ],
          markingPoints: [
            "Positive decreasing reciprocal curve.",
            "Approaches zero asymptotically.",
          ],
          finalAnswer: "positive 1/r curve tending to zero",
          marks: 2,
        },
        {
          partId: "biii",
          working: ["E = −dVₑ/dr, so dVₑ/dr = −E."],
          markingPoints: ["The gradient is negative electric field strength."],
          finalAnswer: "negative electric field strength",
          marks: 1,
        },
        {
          partId: "biv",
          working: [
            "U = k(4e)(2e)/r at the closest approach.",
            "U = 4.09×10⁻¹³ J = 2.56 MeV, so the initial kinetic energy must be at least this value.",
          ],
          markingPoints: [
            "Use electrostatic potential energy at closest approach.",
            "Convert the energy to MeV.",
          ],
          finalAnswer: "2.56 MeV",
          marks: 2,
        },
      ],
    },
    sourceChecks: [
      exactCheck("gradientMeaning", "negative electric field strength"),
      numericCheck("barrierJ", 4.09e-13, 0.02e-13, "J"),
      numericCheck("barrierEv", 2.56e6, 0.02e6, "eV"),
    ],
  },
  {
    id: "nov25-tz1-hl-2-q5-gravitational-potential-package",
    fixtureId: "nov25-tz1-hl-2-q5-gravitational-potential",
    markschemeSourceId: "src_d970eeeb18991d0ce889",
    markschemePages: [9],
    sourceScope:
      "All of Q5; the source potential graph is reconstructed without an invented spatial moon–planet diagram.",
    schemeEvidence: [
      "Tangent gradient at r = 15 Mm gives about 6.0 N kg⁻¹.",
      "Planet radius is about 1.4 Mm.",
      "The spacecraft mass is about 1.4×10³ kg.",
    ],
    assumptions: [
      "The moon and planet are spherical and external potentials are those of point masses at their centres.",
      "The coordinate r is measured from the moon's centre toward the planet.",
    ],
    scenario: {
      kind: "two-body-gravitational-potential",
      moonMassKg: 2.8e23,
      planetMassKg: 1.95e24,
      separationM: 19.6e6,
      moonRadiusM: 0.6e6,
      planetRadiusM: 1.4e6,
      samplePositionM: 15e6,
      workJ: 8.1e10,
    },
    question: {
      kind: "multipart",
      stem: "A moon M orbits a planet P. The graph shows gravitational potential Vg with distance r between their surfaces. The distance between their centres is 19.6 Mm. A spacecraft travels from the surface of P to the surface of M; the work done by the gravitational force is −8.10×10¹⁰ J.",
      parts: [
        {
          id: "a",
          prompt:
            "Use the graph gradient at r = 15.0 Mm to determine the gravitational field strength.",
          marks: 2,
        },
        {
          id: "bi",
          prompt: "Use the graph endpoint to determine the planet's radius.",
          marks: 1,
        },
        { id: "bii", prompt: "Determine the spacecraft mass.", marks: 2 },
      ],
    },
    solution: {
      parts: [
        {
          partId: "a",
          working: [
            "The gravitational field magnitude is the magnitude of −dVg/dr.",
            "The tangent gradient at 15.0 Mm is 6.06 N kg⁻¹.",
          ],
          markingPoints: [
            "Relate field to the potential gradient.",
            "Read/evaluate a value close to 6 N kg⁻¹.",
          ],
          finalAnswer: "6.06 N kg⁻¹",
          marks: 2,
        },
        {
          partId: "bi",
          working: [
            "The curve ends at the near planet surface, r = 18.2 Mm.",
            "Radius = 19.6 − 18.2 = 1.40 Mm.",
          ],
          markingPoints: [
            "Obtain the surface coordinate and subtract from centre separation.",
          ],
          finalAnswer: "1.40 Mm",
          marks: 1,
        },
        {
          partId: "bii",
          working: [
            "The surface potentials are −38.0 and −93.9 MJ kg⁻¹, so |ΔVg| = 56.0 MJ kg⁻¹.",
            "m = |ΔU|/|ΔVg| = 8.10×10¹⁰/(5.60×10⁷) = 1.45×10³ kg.",
          ],
          markingPoints: [
            "Find the potential difference from the endpoints.",
            "Use ΔU = mΔVg.",
          ],
          finalAnswer: "1.45×10³ kg",
          marks: 2,
        },
      ],
    },
    sourceChecks: [
      numericCheck("fieldMagnitudeNkg", 6.06, 0.08, "N kg⁻¹"),
      numericCheck("planetRadiusM", 1.4e6, 1e3, "m"),
      numericCheck("spacecraftMassKg", 1.45e3, 20, "kg"),
    ],
  },
];

const TRAINING_BLOCKERS = [
  "not human reviewed",
  "source-use rights not cleared",
  "training metadata and grouped split not assigned",
] as const;

export const FIELD_QUESTION_PACKAGES: readonly FieldQuestionPackage[] =
  DEFINITIONS.map((definition) => {
    const fixture = FIELD_SOURCE_FIXTURES.find(
      (item) => item.id === definition.fixtureId,
    );
    if (!fixture)
      throw new Error(`Unknown field source fixture: ${definition.fixtureId}`);
    const results = solveFieldScenario(definition.scenario);
    const studentParts =
      definition.question.kind === "multiple-choice"
        ? [{ marks: 1 }]
        : definition.question.parts;
    const marks = studentParts.reduce((total, part) => total + part.marks, 0);
    return {
      schemaVersion: FIELD_QUESTION_PACKAGE_VERSION,
      id: definition.id,
      paper: fixture.paper,
      source: {
        fixtureId: fixture.id,
        questionId: fixture.sourceQuestionId,
        questionLabel: fixture.sourceQuestion,
        sourceScope: definition.sourceScope,
        markscheme: {
          sourceId: definition.markschemeSourceId,
          pages: definition.markschemePages,
          evidence: definition.schemeEvidence,
        },
      },
      assumptions: definition.assumptions,
      scenario: definition.scenario,
      question: definition.question,
      marks,
      visualSpec: fixture.spec ? structuredClone(fixture.spec) : undefined,
      plot: buildPlot(definition.id, definition.scenario),
      results,
      solution: definition.solution,
      sourceChecks: definition.sourceChecks,
      physicsStatus: "verified",
      trainingEligibility: "blocked",
      trainingBlockers: TRAINING_BLOCKERS,
    };
  });

function scenarioNumbers(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(scenarioNumbers);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(scenarioNumbers);
  return [];
}

function authoredScenarioNumbers(scenario: FieldScenario): number[] {
  switch (scenario.kind) {
    case "zero-field-mass-ratio":
      // The source gives the exact symbolic fraction R/3. Its repeating
      // binary decimal is not a student-facing numerical given.
      return [];
    case "two-charge-field-graph":
      // The charge scale only calibrates the supplied curve and is private.
      return [scenario.separationM, scenario.zeroPositionM];
    default:
      return scenarioNumbers(scenario);
  }
}

function significantFigures(value: number): number {
  if (value === 0) return 1;
  const text = Math.abs(value)
    .toExponential(12)
    .split("e")[0]
    .replace(".", "")
    .replace(/0+$/, "");
  return text.length;
}

function requiredStudentTokens(scenario: FieldScenario): string[] {
  switch (scenario.kind) {
    case "electric-superposition":
      return ["+Q", "+2Q", "3x", "x", "2x"];
    case "zero-field-mass-ratio":
      return ["X", "Y", "R", "R/3", "zero"];
    case "equipotential-gradient":
      return ["100 km", "−5", "−3", "−1", "MJ kg⁻¹"];
    case "field-line-choice":
      return ["positive", "q", "3q"];
    case "zero-field-stability":
      return ["+4q", "+q", "d", "negative", "line L"];
    case "two-charge-field-graph":
      return ["R", "S", "5.0 cm", "origin at R"];
    case "nuclear-potential":
      return ["+4e", "+2e", "4.5 fm", "Vₑ", "r"];
    case "two-body-gravitational-potential":
      return ["19.6 Mm", "8.10×10¹⁰ J", "15.0 Mm", "planet's radius"];
  }
}

function expectedFinalAnswers(scenario: FieldScenario): Record<string, string> {
  switch (scenario.kind) {
    case "electric-superposition":
      return { answer: "B — kQ/(2x²), right" };
    case "zero-field-mass-ratio":
      return { answer: "C — 4" };
    case "equipotential-gradient":
      return { answer: "C — 20.0 m s⁻², left" };
    case "field-line-choice":
      return { answer: "D" };
    case "zero-field-stability":
      return {
        a: "2d/3 from +4q",
        bi: "toward +q",
        bii: "oscillatory motion about X",
      };
    case "two-charge-field-graph":
      return {
        a: "force per unit positive test charge",
        b: "same sign",
        c: "2.25",
      };
    case "nuclear-potential":
      return {
        bii: "positive 1/r curve tending to zero",
        biii: "negative electric field strength",
        biv: "2.56 MeV",
      };
    case "two-body-gravitational-potential":
      return {
        a: "6.06 N kg⁻¹",
        bi: "1.40 Mm",
        bii: "1.45×10³ kg",
      };
  }
}

export function validateFieldQuestionPackage(item: FieldQuestionPackage): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const fixture = FIELD_SOURCE_FIXTURES.find(
    (candidate) => candidate.id === item.source.fixtureId,
  );
  if (
    !fixture ||
    fixture.sourceQuestionId !== item.source.questionId ||
    fixture.paper !== item.paper
  )
    issues.push("Package source fixture linkage is inconsistent");
  if (
    fixture &&
    ((fixture.sourceVisualKind === "field-map" &&
      (!fixture.intent || !fixture.spec)) ||
      (fixture.sourceVisualKind === "plot-only" &&
        (fixture.intent !== undefined || fixture.spec !== undefined)))
  ) {
    issues.push("Source visual kind is inconsistent with its field intent");
  }
  let solved: FieldScenarioResults | undefined;
  try {
    solved = solveFieldScenario(item.scenario);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  if (solved && JSON.stringify(solved) !== JSON.stringify(item.results))
    issues.push("Stored results do not match the deterministic field solver");
  if (
    authoredScenarioNumbers(item.scenario).some(
      (value) => significantFigures(value) > 3,
    )
  )
    issues.push("Scenario givens must use at most three significant figures");
  const studentParts =
    item.question.kind === "multiple-choice"
      ? [{ id: "answer", marks: 1 }]
      : item.question.parts;
  const studentContent = [
    item.question.stem,
    ...(item.question.kind === "multipart"
      ? item.question.parts.map((part) => part.prompt)
      : item.question.options.map((option) => option.text)),
    item.visualSpec ? JSON.stringify(item.visualSpec.payload) : "",
    item.plot ? JSON.stringify(item.plot.student.spec.payload) : "",
  ].join("\n");
  const missingToken = requiredStudentTokens(item.scenario).find(
    (token) => !studentContent.includes(token),
  );
  if (missingToken) {
    issues.push(
      `Student content is inconsistent with the scenario; missing ${missingToken}`,
    );
  }
  const solutionIds = item.solution.parts.map((part) => part.partId).sort();
  if (
    JSON.stringify(solutionIds) !==
    JSON.stringify(studentParts.map((part) => part.id).sort())
  )
    issues.push("Student and solution part IDs are inconsistent");
  if (
    studentParts.reduce((sum, part) => sum + part.marks, 0) !== item.marks ||
    item.solution.parts.reduce((sum, part) => sum + part.marks, 0) !==
      item.marks
  )
    issues.push("Student, solution, and package marks are inconsistent");
  if (
    item.solution.parts.some(
      (part) =>
        part.marks <= 0 ||
        part.working.length === 0 ||
        part.markingPoints.length === 0 ||
        !part.finalAnswer?.trim(),
    )
  )
    issues.push(
      "Solution parts need positive marks, working, marking points, and final answers",
    );
  const expectedFinals = expectedFinalAnswers(item.scenario);
  if (
    item.solution.parts.some(
      (part) => part.finalAnswer !== expectedFinals[part.partId],
    )
  ) {
    issues.push(
      "Solution final answers do not match the deterministic scenario",
    );
  }
  if (item.question.kind === "multiple-choice") {
    if (
      item.question.options.map((option) => option.id).join("") !== "ABCD" ||
      new Set(item.question.options.map((option) => option.text)).size !== 4
    )
      issues.push("Multiple-choice packages need four unique A–D options");
    if (
      item.solution.correctOptionId !== item.results.correctOptionId ||
      item.solution.parts[0]?.finalAnswer?.charAt(0) !==
        item.solution.correctOptionId
    )
      issues.push("Multiple-choice solution does not match solver result");
  }
  for (const check of item.sourceChecks) {
    const actual = item.results[check.resultKey];
    const passed =
      check.kind === "exact"
        ? actual === check.expected
        : typeof actual === "number" &&
          Math.abs(actual - check.expected) <= check.tolerance;
    if (!passed) issues.push(`Source check failed: ${check.resultKey}`);
  }
  if (!item.visualSpec && !item.plot) {
    issues.push("Package needs at least one student-facing visual");
  }
  if (
    item.visualSpec &&
    item.visualSpec.scenarioRef !==
      item.visualSpec.id.replace(/-visual$/, "") &&
    item.visualSpec.scenarioRef !== fixture?.id
  ) {
    issues.push("Visual scenario reference is inconsistent");
  }
  if (Boolean(item.visualSpec) !== Boolean(fixture?.spec)) {
    issues.push("Package field map does not match its source fixture");
  }
  if (item.plot) {
    if (
      item.plot.student.spec.scenarioRef !== item.id ||
      (item.plot.solution && item.plot.solution.spec.scenarioRef !== item.id)
    )
      issues.push("Plot scenario reference is inconsistent");
  }
  if (
    item.trainingEligibility !== "blocked" ||
    JSON.stringify(item.trainingBlockers) !== JSON.stringify(TRAINING_BLOCKERS)
  )
    issues.push("Training gate is inconsistent");
  return { valid: issues.length === 0, issues };
}

export { formatToSignificantFigures };
