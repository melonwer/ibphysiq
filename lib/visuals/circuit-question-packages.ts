import { CIRCUIT_SOURCE_FIXTURES } from "./circuit-source-fixtures";
import {
  currentFromVoltage,
  emfFromMeasurement,
  internalResistanceFromMeasurements,
  parallelResistance,
  powerFromCurrent,
  resistanceFromVoltageCurrent,
  seriesResistance,
} from "./circuit-physics";
import { formatToSignificantFigures } from "./pilot-variants";
import { CartesianPlotData } from "./render-cartesian";
import { VISUAL_SCHEMA_VERSION, VisualSpec } from "./types";

export const CIRCUIT_QUESTION_PACKAGE_VERSION =
  "circuit-question-package/0.1.0" as const;

type OptionId = "A" | "B" | "C" | "D";

export type CircuitScenario =
  | {
      kind: "resistance-order";
      identicalResistanceOhm: number;
    }
  | {
      kind: "switched-power";
      resistorOhm: number;
      openR1PowerW: number;
    }
  | {
      kind: "bypass-equivalent";
      resistorOhm: number;
    }
  | {
      kind: "lamp-failure";
      lampResistanceOhm: number;
      supplyVoltageV: number;
    }
  | {
      kind: "series-components";
      pOperatingPoint: { voltageV: number; currentA: number };
      qOperatingPoints: readonly [
        { voltageV: number; currentA: number },
        { voltageV: number; currentA: number },
      ];
      circuitQVoltageV: number;
    }
  | {
      kind: "internal-resistance";
      measurements: readonly [
        { currentA: number; terminalVoltageV: number },
        { currentA: number; terminalVoltageV: number },
      ];
    }
  | {
      kind: "ldr-divider";
      emfV: number;
      darkLdrResistanceOhm: number;
      fixedResistanceOhm: number;
    }
  | {
      kind: "thermistor-divider";
      emfV: number;
      seriesResistanceOhm: number;
      parallelFixedResistanceOhm: number;
      parallelVoltageV: number;
    };

export type CircuitScenarioResults = Record<string, number | string>;

export interface CircuitQuestionPart {
  id: string;
  prompt: string;
  marks: number;
}

export type CircuitStudentQuestion =
  | {
      kind: "multiple-choice";
      stem: string;
      marks: 1;
      options: Array<{ id: OptionId; text: string }>;
    }
  | {
      kind: "multipart";
      stem: string;
      parts: CircuitQuestionPart[];
    };

export interface CircuitSolutionPart {
  partId: string;
  working: string[];
  markingPoints: string[];
  finalAnswer?: string;
  marks: number;
}

export type CircuitSourceCheck =
  | {
      kind: "numeric";
      resultKey: string;
      expected: number;
      tolerance: number;
      unit: string;
    }
  | {
      kind: "exact";
      resultKey: string;
      expected: string;
    };

export interface CircuitPlotArtifact {
  student: {
    spec: VisualSpec<"cartesian_plot">;
    data: CartesianPlotData;
  };
}

export interface CircuitQuestionPackage {
  schemaVersion: typeof CIRCUIT_QUESTION_PACKAGE_VERSION;
  id: string;
  paper: "1A" | "2";
  source: {
    fixtureId: string;
    questionId: string;
    questionLabel: string;
    sourceScope: string;
    markscheme: {
      sourceId: string;
      pages: number[];
      evidence: string[];
    };
  };
  assumptions: string[];
  scenario: CircuitScenario;
  question: CircuitStudentQuestion;
  marks: number;
  visualSpec: VisualSpec<"circuit_network">;
  plot?: CircuitPlotArtifact;
  results: CircuitScenarioResults;
  solution: {
    correctOptionId?: OptionId;
    parts: CircuitSolutionPart[];
  };
  sourceChecks: CircuitSourceCheck[];
  physicsStatus: "verified";
  trainingEligibility: "blocked";
  trainingBlockers: readonly [
    "not human reviewed",
    "source-use rights not cleared",
    "training metadata and grouped split not assigned",
  ];
}

interface PackageDefinition {
  id: string;
  fixtureId: string;
  markschemeSourceId: string;
  markschemePages: number[];
  sourceScope: string;
  schemeEvidence: string[];
  assumptions: string[];
  scenario: CircuitScenario;
  question: CircuitStudentQuestion;
  solution: {
    correctOptionId?: OptionId;
    parts: CircuitSolutionPart[];
  };
  sourceChecks: CircuitSourceCheck[];
}

const answer = (value: number, unit: string): string =>
  `${formatToSignificantFigures(value)} ${unit}`;

const numericCheck = (
  resultKey: string,
  expected: number,
  tolerance: number,
  unit: string,
): CircuitSourceCheck => ({
  kind: "numeric",
  resultKey,
  expected,
  tolerance,
  unit,
});

const exactCheck = (
  resultKey: string,
  expected: string,
): CircuitSourceCheck => ({ kind: "exact", resultKey, expected });

function finitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive and finite`);
  }
}

export function solveCircuitScenario(
  scenario: CircuitScenario,
): CircuitScenarioResults {
  switch (scenario.kind) {
    case "resistance-order": {
      finitePositive("Identical resistance", scenario.identicalResistanceOhm);
      const resistanceP = seriesResistance([
        scenario.identicalResistanceOhm,
        scenario.identicalResistanceOhm,
        parallelResistance([
          scenario.identicalResistanceOhm,
          scenario.identicalResistanceOhm,
        ]),
      ]);
      const resistanceQ = seriesResistance([
        scenario.identicalResistanceOhm,
        parallelResistance([
          scenario.identicalResistanceOhm,
          scenario.identicalResistanceOhm,
          scenario.identicalResistanceOhm,
        ]),
      ]);
      const resistanceR = seriesResistance([
        scenario.identicalResistanceOhm,
        parallelResistance([
          scenario.identicalResistanceOhm,
          seriesResistance([
            scenario.identicalResistanceOhm,
            scenario.identicalResistanceOhm,
          ]),
        ]),
      ]);
      return {
        resistancePOhm: resistanceP,
        resistanceQOhm: resistanceQ,
        resistanceROhm: resistanceR,
        increasingOrder: "Q,R,P",
        correctOptionId: "D",
      };
    }
    case "switched-power": {
      finitePositive("Resistor resistance", scenario.resistorOhm);
      finitePositive("Open-switch R1 power", scenario.openR1PowerW);
      const openCurrentA = Math.sqrt(
        scenario.openR1PowerW / scenario.resistorOhm,
      );
      const emfV =
        openCurrentA *
        seriesResistance([scenario.resistorOhm, scenario.resistorOhm]);
      const closedParallelResistanceOhm = parallelResistance([
        scenario.resistorOhm,
        scenario.resistorOhm,
      ]);
      const closedTotalResistanceOhm = seriesResistance([
        scenario.resistorOhm,
        closedParallelResistanceOhm,
      ]);
      const closedTotalCurrentA = currentFromVoltage(
        emfV,
        closedTotalResistanceOhm,
      );
      const closedParallelVoltageV =
        closedTotalCurrentA * closedParallelResistanceOhm;
      const closedR1CurrentA = currentFromVoltage(
        closedParallelVoltageV,
        scenario.resistorOhm,
      );
      return {
        openCurrentA,
        emfV,
        closedTotalResistanceOhm,
        closedTotalCurrentA,
        closedR1CurrentA,
        closedR1PowerW: powerFromCurrent(
          closedR1CurrentA,
          scenario.resistorOhm,
        ),
        correctOptionId: "A",
      };
    }
    case "bypass-equivalent":
      finitePositive("Resistor resistance", scenario.resistorOhm);
      return {
        equivalentResistanceOhm: parallelResistance([
          scenario.resistorOhm,
          scenario.resistorOhm,
          scenario.resistorOhm,
        ]),
        correctOptionId: "A",
      };
    case "lamp-failure": {
      finitePositive("Lamp resistance", scenario.lampResistanceOhm);
      finitePositive("Supply voltage", scenario.supplyVoltageV);
      const seriesBranchResistanceOhm = seriesResistance([
        scenario.lampResistanceOhm,
        scenario.lampResistanceOhm,
      ]);
      const initialEquivalentResistanceOhm = parallelResistance([
        seriesBranchResistanceOhm,
        scenario.lampResistanceOhm,
      ]);
      const initialCurrentA = currentFromVoltage(
        scenario.supplyVoltageV,
        initialEquivalentResistanceOhm,
      );
      const finalCurrentA = currentFromVoltage(
        scenario.supplyVoltageV,
        seriesBranchResistanceOhm,
      );
      return {
        initialCurrentA,
        finalCurrentA,
        ammeterRatio: finalCurrentA / initialCurrentA,
        voltmeterRatio: 1,
        correctOptionId: "C",
      };
    }
    case "series-components": {
      const pResistanceOhm = resistanceFromVoltageCurrent(
        scenario.pOperatingPoint.voltageV,
        scenario.pOperatingPoint.currentA,
      );
      const qResistanceLowOhm = resistanceFromVoltageCurrent(
        scenario.qOperatingPoints[0].voltageV,
        scenario.qOperatingPoints[0].currentA,
      );
      const qResistanceHighOhm = resistanceFromVoltageCurrent(
        scenario.qOperatingPoints[1].voltageV,
        scenario.qOperatingPoints[1].currentA,
      );
      if (qResistanceHighOhm <= qResistanceLowOhm) {
        throw new Error(
          "Q resistance must increase across the supplied points",
        );
      }
      const ammeterCurrentA = scenario.qOperatingPoints.find(
        (point) => Math.abs(point.voltageV - scenario.circuitQVoltageV) < 1e-12,
      )?.currentA;
      if (ammeterCurrentA === undefined) {
        throw new Error("Circuit Q voltage needs a supplied operating point");
      }
      return {
        pResistanceOhm,
        qResistanceLowOhm,
        qResistanceHighOhm,
        qResistanceTrend: "increases",
        ammeterCurrentA,
        emfV: scenario.circuitQVoltageV + ammeterCurrentA * pResistanceOhm,
      };
    }
    case "internal-resistance": {
      const internalResistanceOhm = internalResistanceFromMeasurements(
        scenario.measurements[0],
        scenario.measurements[1],
      );
      return {
        internalResistanceOhm,
        emfV: emfFromMeasurement(
          scenario.measurements[0],
          internalResistanceOhm,
        ),
        terminalVoltageTrend: "changes when current changes",
      };
    }
    case "ldr-divider": {
      const totalResistanceOhm = seriesResistance([
        scenario.darkLdrResistanceOhm,
        scenario.fixedResistanceOhm,
      ]);
      return {
        totalResistanceOhm,
        currentA: currentFromVoltage(scenario.emfV, totalResistanceOhm),
        voltmeterTrend: "increases",
        sourcePowerTrend: "increases",
      };
    }
    case "thermistor-divider": {
      if (scenario.parallelVoltageV >= scenario.emfV) {
        throw new Error("Parallel voltage must be below the source emf");
      }
      const batteryCurrentA = currentFromVoltage(
        scenario.emfV - scenario.parallelVoltageV,
        scenario.seriesResistanceOhm,
      );
      const parallelEquivalentResistanceOhm = resistanceFromVoltageCurrent(
        scenario.parallelVoltageV,
        batteryCurrentA,
      );
      const reciprocalThermistor =
        1 / parallelEquivalentResistanceOhm -
        1 / scenario.parallelFixedResistanceOhm;
      if (reciprocalThermistor <= 0) {
        throw new Error("Thermistor branch must have a positive resistance");
      }
      return {
        batteryCurrentA,
        parallelEquivalentResistanceOhm,
        thermistorResistanceOhm: 1 / reciprocalThermistor,
        voltmeterTrend: "decreases",
      };
    }
  }
}

const definitions: PackageDefinition[] = [
  {
    id: "may25-tz1-hl-1a-q14-circuit-package",
    fixtureId: "may25-tz1-hl-1a-q14-circuit-source",
    markschemeSourceId: "src_20d37bf55c41880ae819",
    markschemePages: [1],
    sourceScope: "Whole multiple-choice circuit item.",
    schemeEvidence: ["The mark-scheme answer grid gives option D for Q14."],
    assumptions: [
      "Every resistor has the same positive resistance R.",
      "Connecting wires have negligible resistance.",
    ],
    scenario: { kind: "resistance-order", identicalResistanceOhm: 12 },
    question: {
      kind: "multiple-choice",
      stem: "The diagrams show three networks P, Q and R made from identical resistors. Which option lists their equivalent resistances in increasing order?",
      marks: 1,
      options: [
        { id: "A", text: "P, Q, R" },
        { id: "B", text: "Q, P, R" },
        { id: "C", text: "P, R, Q" },
        { id: "D", text: "Q, R, P" },
      ],
    },
    solution: {
      correctOptionId: "D",
      parts: [
        {
          partId: "answer",
          working: [
            "P = 2R + (R ∥ R) = 2.50R.",
            "Q = R + (R ∥ R ∥ R) = 1.33R.",
            "R = R + [R ∥ (2R)] = 1.67R.",
            "Therefore the increasing order is Q, R, P.",
          ],
          markingPoints: ["Select D."],
          finalAnswer: "D — Q, R, P",
          marks: 1,
        },
      ],
    },
    sourceChecks: [exactCheck("correctOptionId", "D")],
  },
  {
    id: "may25-tz3-hl-1a-q17-circuit-package",
    fixtureId: "may25-tz3-hl-1a-q17-circuit-source",
    markschemeSourceId: "src_3e77beb175aefbd3cb58",
    markschemePages: [1],
    sourceScope: "Whole multiple-choice switched-resistor item.",
    schemeEvidence: ["The mark-scheme answer grid gives option A for Q17."],
    assumptions: [
      "The cell and connecting wires are ideal.",
      "All three resistors have resistance 2.00 Ω.",
    ],
    scenario: {
      kind: "switched-power",
      resistorOhm: 2,
      openR1PowerW: 18,
    },
    question: {
      kind: "multiple-choice",
      stem: "The three resistors are identical and each has resistance 2.00 Ω. With the switch open, the power in R1 is 18.0 W. What is the power in R1 after the switch is closed?",
      marks: 1,
      options: [
        { id: "A", text: "8.00 W" },
        { id: "B", text: "16.0 W" },
        { id: "C", text: "18.0 W" },
        { id: "D", text: "36.0 W" },
      ],
    },
    solution: {
      correctOptionId: "A",
      parts: [
        {
          partId: "answer",
          working: [
            "With the switch open, I = √(P/R) = √(18.0/2.00) = 3.00 A.",
            "The emf is 3.00 × (2.00 + 2.00) = 12.0 V.",
            "When closed, R1 ∥ R3 = 1.00 Ω, so the total resistance is 3.00 Ω and the total current is 4.00 A.",
            "The parallel branch has 4.00 V across it, so the current in R1 is 2.00 A.",
            "P(R1) = I²R = 2.00² × 2.00 = 8.00 W.",
          ],
          markingPoints: ["Select A."],
          finalAnswer: "A — 8.00 W",
          marks: 1,
        },
      ],
    },
    sourceChecks: [
      numericCheck("closedR1PowerW", 8, 1e-9, "W"),
      exactCheck("correctOptionId", "A"),
    ],
  },
  {
    id: "may25-tz3-hl-1a-q18-circuit-package",
    fixtureId: "may25-tz3-hl-1a-q18-circuit-source",
    markschemeSourceId: "src_3e77beb175aefbd3cb58",
    markschemePages: [1],
    sourceScope: "Whole multiple-choice bypass-network item.",
    schemeEvidence: ["The mark-scheme answer grid gives option A for Q18."],
    assumptions: [
      "Each resistor has resistance 6.00 Ω.",
      "The bypass connections are ideal wires.",
    ],
    scenario: { kind: "bypass-equivalent", resistorOhm: 6 },
    question: {
      kind: "multiple-choice",
      stem: "Three identical 6.00 Ω resistors are connected between X and Y as shown. What is the equivalent resistance between X and Y?",
      marks: 1,
      options: [
        { id: "A", text: "2.00 Ω" },
        { id: "B", text: "4.00 Ω" },
        { id: "C", text: "9.00 Ω" },
        { id: "D", text: "18.0 Ω" },
      ],
    },
    solution: {
      correctOptionId: "A",
      parts: [
        {
          partId: "answer",
          working: [
            "The bypass wires place both ends of all three resistors on the same two nodes.",
            "1/R_eq = 1/6.00 + 1/6.00 + 1/6.00, so R_eq = 2.00 Ω.",
          ],
          markingPoints: ["Select A."],
          finalAnswer: "A — 2.00 Ω",
          marks: 1,
        },
      ],
    },
    sourceChecks: [
      numericCheck("equivalentResistanceOhm", 2, 1e-9, "Ω"),
      exactCheck("correctOptionId", "A"),
    ],
  },
  {
    id: "may26-tz2-hl-1a-q16-circuit-package",
    fixtureId: "may26-tz2-hl-1a-q16-circuit-source",
    markschemeSourceId: "src_bb4cfecc321a8497ab76",
    markschemePages: [1],
    sourceScope: "Whole multiple-choice lamp-failure item.",
    schemeEvidence: ["The mark-scheme answer grid gives option C for Q16."],
    assumptions: [
      "The three lamps are identical and ohmic for this comparison.",
      "The cell has negligible internal resistance and the meters are ideal.",
      "A burnt-out lamp is an open circuit.",
    ],
    scenario: {
      kind: "lamp-failure",
      lampResistanceOhm: 9,
      supplyVoltageV: 12,
    },
    question: {
      kind: "multiple-choice",
      stem: "Initially the ammeter and voltmeter read I₀ and V₀. Lamp Z then burns out and becomes an open circuit. What are the new meter readings?",
      marks: 1,
      options: [
        { id: "A", text: "I₀/3; less than V₀" },
        { id: "B", text: "2I₀/3; less than V₀" },
        { id: "C", text: "I₀/3; V₀" },
        { id: "D", text: "2I₀/3; V₀" },
      ],
    },
    solution: {
      correctOptionId: "C",
      parts: [
        {
          partId: "answer",
          working: [
            "Initially, the XY branch has resistance 2R and is in parallel with Z of resistance R, so R_eq = 2R/3.",
            "After Z fails, only the 2R branch conducts. The total-current ratio is (V/2R)/(3V/2R) = 1/3.",
            "The ideal cell keeps the potential difference across the network unchanged, so the voltmeter remains at V₀.",
          ],
          markingPoints: ["Select C."],
          finalAnswer: "C — I₀/3 and V₀",
          marks: 1,
        },
      ],
    },
    sourceChecks: [
      numericCheck("ammeterRatio", 1 / 3, 1e-12, "ratio"),
      numericCheck("voltmeterRatio", 1, 1e-12, "ratio"),
      exactCheck("correctOptionId", "C"),
    ],
  },
  {
    id: "may25-tz1-sl-2-q3-circuit-package",
    fixtureId: "may25-tz1-sl-2-q3-circuit-source",
    markschemeSourceId: "src_f498c500ab593561758d",
    markschemePages: [4],
    sourceScope:
      "All of Q3; the source I–V graph and circuit are both retained.",
    schemeEvidence: [
      "P has resistance 50 Ω.",
      "Q resistance increases with current.",
      "The ammeter reads 120 mA and the source emf is 9.0 V.",
    ],
    assumptions: [
      "The ammeter and voltmeter are ideal.",
      "Graph readings use the source scale and tolerate normal plotting precision.",
    ],
    scenario: {
      kind: "series-components",
      pOperatingPoint: { voltageV: 10, currentA: 0.2 },
      qOperatingPoints: [
        { voltageV: 3, currentA: 0.12 },
        { voltageV: 10, currentA: 0.18 },
      ],
      circuitQVoltageV: 3,
    },
    question: {
      kind: "multipart",
      stem: "The graph shows how current I varies with potential difference V for an ohmic resistor P and a non-ohmic component Q. P and Q are connected in the circuit shown. The ideal voltmeter reads 3.0 V.",
      parts: [
        { id: "a", prompt: "Calculate the resistance of P.", marks: 1 },
        {
          id: "b",
          prompt:
            "Outline how the resistance of Q changes when the current in it increases.",
          marks: 1,
        },
        {
          id: "c",
          prompt: "State, in mA, the reading of the ammeter.",
          marks: 1,
        },
        { id: "d", prompt: "Determine the emf of the source.", marks: 2 },
      ],
    },
    solution: {
      parts: [
        {
          partId: "a",
          working: [
            "Read a point on P from the graph, for example 10.0 V at 0.200 A.",
            "R(P) = V/I = 10.0/0.200.",
          ],
          markingPoints: ["Uses R = V/I to obtain the resistance."],
          finalAnswer: answer(50, "Ω"),
          marks: 1,
        },
        {
          partId: "b",
          working: [
            "From the graph, Q is about 3.0 V at 0.120 A and 10.0 V at 0.180 A.",
            "V/I rises from about 25 Ω to about 56 Ω, so its resistance increases with current.",
          ],
          markingPoints: ["States that the resistance increases with current."],
          finalAnswer: "The resistance of Q increases.",
          marks: 1,
        },
        {
          partId: "c",
          working: ["Read Q's current at 3.0 V from the graph: 0.120 A."],
          markingPoints: ["Reads or uses the matching Q operating point."],
          finalAnswer: answer(120, "mA"),
          marks: 1,
        },
        {
          partId: "d",
          working: [
            "V(P) = IR = 0.120 × 50.0 = 6.00 V.",
            "emf = V(P) + V(Q) = 6.00 + 3.00 = 9.00 V.",
          ],
          markingPoints: [
            "Calculates the potential difference across P as 6.00 V.",
            "Adds the series potential differences to obtain the emf.",
          ],
          finalAnswer: answer(9, "V"),
          marks: 2,
        },
      ],
    },
    sourceChecks: [
      numericCheck("pResistanceOhm", 50, 1e-9, "Ω"),
      exactCheck("qResistanceTrend", "increases"),
      numericCheck("ammeterCurrentA", 0.12, 1e-12, "A"),
      numericCheck("emfV", 9, 1e-9, "V"),
    ],
  },
  {
    id: "nov25-tz1-hl-2-q2-circuit-package",
    fixtureId: "nov25-tz1-hl-2-q2-circuit-source",
    markschemeSourceId: "src_d970eeeb18991d0ce889",
    markschemePages: [4, 5],
    sourceScope:
      "Circuit experiment parts a–c only; the source V–I graph is retained and the unrelated entropy part is excluded.",
    schemeEvidence: [
      "Changing the variable resistor changes current and hence terminal voltage through V = ε − Ir.",
      "The source gradient gives internal resistance about 0.8 Ω.",
      "The source intercept gives an emf in the accepted 24.6–25.2 V range.",
    ],
    assumptions: [
      "The ammeter and voltmeter are ideal.",
      "The source obeys V = ε − Ir with constant internal resistance.",
    ],
    scenario: {
      kind: "internal-resistance",
      measurements: [
        { currentA: 2, terminalVoltageV: 23.2 },
        { currentA: 10, terminalVoltageV: 17.2 },
      ],
    },
    question: {
      kind: "multipart",
      stem: "A student investigates the emf and internal resistance of a cell using the circuit shown. The ideal voltmeter reading V is plotted against the ideal ammeter reading I on the graph.",
      parts: [
        {
          id: "a",
          prompt:
            "Explain why adjusting the variable resistor changes the terminal voltage.",
          marks: 2,
        },
        {
          id: "b",
          prompt:
            "Show that the internal resistance of the cell is about 0.8 Ω.",
          marks: 2,
        },
        { id: "c", prompt: "Determine the emf of the source.", marks: 2 },
      ],
    },
    solution: {
      parts: [
        {
          partId: "a",
          working: [
            "Adjusting the variable resistor changes the circuit current.",
            "Since V = ε − Ir, changing I changes the lost volts Ir and therefore the terminal voltage.",
          ],
          markingPoints: [
            "Links the variable resistor to a change in current.",
            "Uses V = ε − Ir to link current to terminal voltage.",
          ],
          marks: 2,
        },
        {
          partId: "b",
          working: [
            "The magnitude of the V–I gradient is the internal resistance.",
            "Using two well-separated graph readings, r = 6.00 V/8.00 A = 0.750 Ω.",
          ],
          markingPoints: [
            "Identifies internal resistance with the magnitude of the gradient.",
            "Substitutes the two data points correctly.",
          ],
          finalAnswer: answer(0.75, "Ω"),
          marks: 2,
        },
        {
          partId: "c",
          working: [
            "Extrapolate the straight line to I = 0, where V = ε.",
            "The graph intercept is 24.7 V.",
          ],
          markingPoints: [
            "Uses the zero-current intercept or ε = V + Ir.",
            "Obtains an emf consistent with the data.",
          ],
          finalAnswer: answer(24.7, "V"),
          marks: 2,
        },
      ],
    },
    sourceChecks: [
      numericCheck("internalResistanceOhm", 0.75, 1e-12, "Ω"),
      numericCheck("emfV", 24.7, 1e-12, "V"),
    ],
  },
  {
    id: "may26-tz1-hl-2-q2-circuit-package",
    fixtureId: "may26-tz1-hl-2-q2-circuit-source",
    markschemeSourceId: "src_e0fa1392f03ad16b0caa",
    markschemePages: [3],
    sourceScope: "Whole LDR circuit item.",
    schemeEvidence: [
      "An ideal ammeter has zero or negligible resistance.",
      "The dark current is 3.6 × 10⁻⁵ A.",
      "Increasing illumination raises the voltmeter reading and source power.",
    ],
    assumptions: [
      "The meters are ideal and the cell emf remains 9.00 V.",
      "The LDR resistance decreases when illumination increases.",
    ],
    scenario: {
      kind: "ldr-divider",
      emfV: 9,
      darkLdrResistanceOhm: 200_000,
      fixedResistanceOhm: 50_000,
    },
    question: {
      kind: "multipart",
      stem: "In darkness, the LDR has resistance 200 kΩ. It is in series with a 50.0 kΩ resistor and a 9.00 V cell as shown.",
      parts: [
        {
          id: "a",
          prompt: "State one property of an ideal ammeter.",
          marks: 1,
        },
        {
          id: "b",
          prompt: "Calculate the current when the LDR is in darkness.",
          marks: 2,
        },
        {
          id: "c-i",
          prompt:
            "Explain what happens to the voltmeter reading when the light intensity increases.",
          marks: 2,
        },
        {
          id: "c-ii",
          prompt:
            "State and explain what happens to the power transferred by the cell.",
          marks: 1,
        },
      ],
    },
    solution: {
      parts: [
        {
          partId: "a",
          working: [],
          markingPoints: [
            "States zero/negligible resistance or zero/negligible potential difference while carrying current.",
          ],
          finalAnswer: "It has negligible resistance.",
          marks: 1,
        },
        {
          partId: "b",
          working: [
            "R_total = 200 kΩ + 50.0 kΩ = 250 kΩ.",
            "I = 9.00/(250 × 10³) = 3.60 × 10⁻⁵ A.",
          ],
          markingPoints: [
            "Finds the series resistance as 250 kΩ.",
            "Uses I = V/R correctly.",
          ],
          finalAnswer: answer(36, "µA"),
          marks: 2,
        },
        {
          partId: "c-i",
          working: [
            "Greater light intensity lowers the LDR resistance, so total resistance falls and current increases.",
            "The voltmeter is across the fixed resistor, so V = IR increases.",
          ],
          markingPoints: [
            "Links increased illumination to lower total resistance and higher current.",
            "Links the higher current to a greater voltage across the fixed resistor.",
          ],
          finalAnswer: "The voltmeter reading increases.",
          marks: 2,
        },
        {
          partId: "c-ii",
          working: [
            "The current increases while the emf is constant, so P = εI increases.",
          ],
          markingPoints: [
            "States that source power increases with a valid reason.",
          ],
          finalAnswer: "The power transferred by the cell increases.",
          marks: 1,
        },
      ],
    },
    sourceChecks: [
      numericCheck("currentA", 3.6e-5, 1e-12, "A"),
      exactCheck("voltmeterTrend", "increases"),
      exactCheck("sourcePowerTrend", "increases"),
    ],
  },
  {
    id: "may26-tz3-hl-2-q1-circuit-package",
    fixtureId: "may26-tz3-hl-2-q1-circuit-source",
    markschemeSourceId: "src_94e3aa19e98b0839139a",
    markschemePages: [2],
    sourceScope: "Whole thermistor circuit item.",
    schemeEvidence: [
      "The battery current is 50 mA and thermistor resistance is 80 Ω.",
      "As temperature rises, the voltmeter reading decreases.",
    ],
    assumptions: [
      "The 12.0 V source has negligible internal resistance.",
      "The voltmeter is ideal.",
      "Thermistor resistance decreases as temperature increases.",
    ],
    scenario: {
      kind: "thermistor-divider",
      emfV: 12,
      seriesResistanceOhm: 180,
      parallelFixedResistanceOhm: 240,
      parallelVoltageV: 3,
    },
    question: {
      kind: "multipart",
      stem: "A 12.0 V source supplies a 180 Ω resistor in series with a parallel combination of a 240 Ω resistor and a thermistor. The voltmeter across the parallel combination reads 3.00 V.",
      parts: [
        {
          id: "a-i",
          prompt: "Show that the current in the source is 50.0 mA.",
          marks: 2,
        },
        {
          id: "a-ii",
          prompt: "Calculate the resistance of the thermistor.",
          marks: 2,
        },
        {
          id: "b",
          prompt:
            "The thermistor resistance decreases as temperature rises. State and explain what happens to the voltmeter reading.",
          marks: 3,
        },
      ],
    },
    solution: {
      parts: [
        {
          partId: "a-i",
          working: [
            "The voltage across the 180 Ω resistor is 12.0 − 3.00 = 9.00 V.",
            "I = 9.00/180 = 0.0500 A.",
          ],
          markingPoints: [
            "Finds 9.00 V across the series resistor.",
            "Uses I = V/R to obtain the source current.",
          ],
          finalAnswer: answer(50, "mA"),
          marks: 2,
        },
        {
          partId: "a-ii",
          working: [
            "The equivalent resistance of the parallel section is 3.00/0.0500 = 60.0 Ω.",
            "1/60.0 = 1/240 + 1/R_T, giving R_T = 80.0 Ω.",
          ],
          markingPoints: [
            "Finds the equivalent resistance of the parallel section.",
            "Uses the parallel-resistance relation to find the thermistor resistance.",
          ],
          finalAnswer: answer(80, "Ω"),
          marks: 2,
        },
        {
          partId: "b",
          working: [
            "A higher temperature lowers the thermistor resistance and hence the parallel equivalent resistance.",
            "The total circuit resistance falls, so the source current and voltage drop across the 180 Ω resistor increase.",
            "The remaining voltage across the parallel section therefore decreases.",
          ],
          markingPoints: [
            "Links temperature rise to lower thermistor and parallel resistance.",
            "Links lower total resistance to greater current and a greater drop across the series resistor.",
            "Concludes that the voltmeter reading decreases.",
          ],
          finalAnswer: "The voltmeter reading decreases.",
          marks: 3,
        },
      ],
    },
    sourceChecks: [
      numericCheck("batteryCurrentA", 0.05, 1e-12, "A"),
      numericCheck("thermistorResistanceOhm", 80, 1e-9, "Ω"),
      exactCheck("voltmeterTrend", "decreases"),
    ],
  },
];

function buildVisualSpec(
  fixtureId: string,
  packageId: string,
): VisualSpec<"circuit_network"> {
  const fixture = CIRCUIT_SOURCE_FIXTURES.find((item) => item.id === fixtureId);
  if (!fixture) throw new Error(`Unknown circuit source fixture: ${fixtureId}`);
  const spec = structuredClone(fixture.spec);
  spec.id = `${packageId}-visual`;
  spec.scenarioRef = packageId;
  spec.visibility.privateParameterIds = [`${packageId}-answer`];
  return spec;
}

function smoothCurve(
  knots: readonly { x: number; y: number }[],
  samplesPerInterval = 12,
): Array<{ x: number; y: number }> {
  const slopes = knots.map((point, index) => {
    if (index === 0) return (knots[1].y - point.y) / (knots[1].x - point.x);
    if (index === knots.length - 1)
      return (point.y - knots[index - 1].y) / (point.x - knots[index - 1].x);
    return (
      (knots[index + 1].y - knots[index - 1].y) /
      (knots[index + 1].x - knots[index - 1].x)
    );
  });
  return knots
    .slice(0, -1)
    .flatMap((start, index) => {
      const end = knots[index + 1];
      const width = end.x - start.x;
      return Array.from({ length: samplesPerInterval }, (_, sample) => {
        const t = sample / samplesPerInterval;
        const t2 = t * t;
        const t3 = t2 * t;
        return {
          x: start.x + width * t,
          y:
            (2 * t3 - 3 * t2 + 1) * start.y +
            (t3 - 2 * t2 + t) * width * slopes[index] +
            (-2 * t3 + 3 * t2) * end.y +
            (t3 - t2) * width * slopes[index + 1],
        };
      });
    })
    .concat(knots[knots.length - 1]);
}

function buildCircuitPlot(
  packageId: string,
  scenario: CircuitScenario,
): CircuitPlotArtifact | undefined {
  const baseSpec = (
    xAxis: VisualSpec<"cartesian_plot">["payload"]["xAxis"],
    yAxis: VisualSpec<"cartesian_plot">["payload"]["yAxis"],
    series: VisualSpec<"cartesian_plot">["payload"]["series"],
    annotations: NonNullable<
      VisualSpec<"cartesian_plot">["payload"]["annotations"]
    >,
  ): VisualSpec<"cartesian_plot"> => ({
    schemaVersion: VISUAL_SCHEMA_VERSION,
    id: `${packageId}-source-plot`,
    family: "cartesian_plot",
    templateId: "plot.cartesian.v1",
    scenarioRef: packageId,
    coordinateSpace: "cartesian",
    payload: {
      xAxis,
      yAxis,
      series,
      annotations,
      showGrid: true,
    },
    visibility: {
      publicParameterIds: [
        xAxis.id,
        yAxis.id,
        ...series.flatMap((item) => [
          item.xParameterId,
          item.yParameterId,
          item.dataRef,
        ]),
        ...annotations.map((item) => item.id),
      ],
      privateParameterIds: [`${packageId}-answer`],
      labelMode: "allowlist",
      altTextMode: "student-safe",
    },
    provenance: { rendererVersion: "cartesian-svg/0.1.0" },
  });

  if (scenario.kind === "series-components") {
    const pRef = `${packageId}-p-data`;
    const qRef = `${packageId}-q-data`;
    const xId = `${packageId}-voltage`;
    const yId = `${packageId}-current`;
    const spec = baseSpec(
      {
        id: xId,
        label: "V",
        unit: "V",
        scale: "linear",
        domain: [0, 10],
        tickStrategy: "source-matched",
        tickValues: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        minorTickStep: 0.2,
        showArrow: true,
      },
      {
        id: yId,
        label: "I",
        unit: "mA",
        scale: "linear",
        domain: [0, 200],
        tickStrategy: "source-matched",
        tickValues: [0, 40, 80, 120, 160, 200],
        minorTickStep: 10,
        showArrow: true,
      },
      [
        {
          id: `${packageId}-p-series`,
          kind: "analytical-curve",
          xParameterId: xId,
          yParameterId: yId,
          dataRef: pRef,
          styleRole: "primary",
        },
        {
          id: `${packageId}-q-series`,
          kind: "analytical-curve",
          xParameterId: xId,
          yParameterId: yId,
          dataRef: qRef,
          styleRole: "primary",
        },
      ],
      [
        {
          id: `${packageId}-p-label`,
          kind: "text",
          position: { x: 5.2, y: 94 },
          label: "P",
          offset: { x: 12, y: 12 },
        },
        {
          id: `${packageId}-q-label`,
          kind: "text",
          position: { x: 3.1, y: 121 },
          label: "Q",
          offset: { x: 10, y: -10 },
        },
      ],
    );
    return {
      student: {
        spec,
        data: {
          [pRef]: Array.from({ length: 51 }, (_, index) => ({
            x: index / 5,
            y: index * 4,
          })),
          [qRef]: smoothCurve([
            { x: 0, y: 0 },
            { x: 0.5, y: 42 },
            { x: 1, y: 67 },
            { x: 2, y: 101 },
            { x: 3, y: 120 },
            { x: 4, y: 135 },
            { x: 5, y: 145 },
            { x: 6, y: 152 },
            { x: 7, y: 158 },
            { x: 8, y: 164 },
            { x: 8.4, y: 168 },
            { x: 9, y: 172 },
            { x: 10, y: 180 },
          ]),
        },
      },
    };
  }

  if (scenario.kind === "internal-resistance") {
    const dataRef = `${packageId}-terminal-voltage-data`;
    const xId = `${packageId}-current`;
    const yId = `${packageId}-terminal-voltage`;
    const spec = baseSpec(
      {
        id: xId,
        label: "I",
        unit: "A",
        scale: "linear",
        domain: [0, 10],
        tickStrategy: "source-matched",
        tickValues: [2, 4, 6, 8, 10],
        minorTickStep: 1,
        showArrow: true,
      },
      {
        id: yId,
        label: "V",
        unit: "V",
        scale: "linear",
        domain: [16, 25],
        tickStrategy: "source-matched",
        tickValues: [18, 20, 22, 24],
        minorTickStep: 1,
        showArrow: true,
      },
      [
        {
          id: `${packageId}-line`,
          kind: "analytical-curve",
          xParameterId: xId,
          yParameterId: yId,
          dataRef,
          styleRole: "primary",
        },
      ],
      [],
    );
    const [first, second] = scenario.measurements;
    const gradient =
      (second.terminalVoltageV - first.terminalVoltageV) /
      (second.currentA - first.currentA);
    const intercept = first.terminalVoltageV - gradient * first.currentA;
    return {
      student: {
        spec,
        data: {
          [dataRef]: Array.from({ length: 71 }, (_, index) => {
            const currentA = 3 + index / 10;
            return {
              x: currentA,
              y: intercept + gradient * currentA,
            };
          }),
        },
      },
    };
  }
  return undefined;
}

function questionMarks(question: CircuitStudentQuestion): number {
  return question.kind === "multiple-choice"
    ? question.marks
    : question.parts.reduce((total, part) => total + part.marks, 0);
}

function buildPackage(definition: PackageDefinition): CircuitQuestionPackage {
  const fixture = CIRCUIT_SOURCE_FIXTURES.find(
    (item) => item.id === definition.fixtureId,
  );
  if (!fixture)
    throw new Error(`Unknown circuit source fixture: ${definition.fixtureId}`);
  return {
    schemaVersion: CIRCUIT_QUESTION_PACKAGE_VERSION,
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
    marks: questionMarks(definition.question),
    visualSpec: buildVisualSpec(definition.fixtureId, definition.id),
    plot: buildCircuitPlot(definition.id, definition.scenario),
    results: solveCircuitScenario(definition.scenario),
    solution: definition.solution,
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

export function generateCircuitQuestionPackages(): CircuitQuestionPackage[] {
  return definitions.map(buildPackage);
}

function checkSourceResult(
  results: CircuitScenarioResults,
  check: CircuitSourceCheck,
): boolean {
  const actual = results[check.resultKey];
  if (check.kind === "exact") return actual === check.expected;
  return (
    typeof actual === "number" &&
    Number.isFinite(actual) &&
    Math.abs(actual - check.expected) <= check.tolerance
  );
}

function overPreciseGivenPaths(value: unknown, path = "scenario"): string[] {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return [path];
    return value === Number(formatToSignificantFigures(value, 3)) ? [] : [path];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      overPreciseGivenPaths(item, `${path}[${index}]`),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      overPreciseGivenPaths(item, `${path}.${key}`),
    );
  }
  return [];
}

interface ExpectedPackageContent {
  studentTokens: string[];
  solutionTokens: string[];
  finalAnswers: Record<string, string | undefined>;
  optionTexts?: string[];
}

function numericResult(results: CircuitScenarioResults, key: string): number {
  const value = results[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Missing numeric result: ${key}`);
  }
  return value;
}

function expectedPackageContent(
  item: CircuitQuestionPackage,
): ExpectedPackageContent {
  const { scenario, results } = item;
  switch (scenario.kind) {
    case "resistance-order":
      return {
        studentTokens: ["identical resistors", "increasing order"],
        solutionTokens: ["2.50R", "1.33R", "1.67R", "Q, R, P"],
        finalAnswers: { answer: "D — Q, R, P" },
        optionTexts: ["P, Q, R", "Q, P, R", "P, R, Q", "Q, R, P"],
      };
    case "switched-power": {
      const resistance = formatToSignificantFigures(scenario.resistorOhm);
      const openPower = formatToSignificantFigures(scenario.openR1PowerW);
      const closedPower = numericResult(results, "closedR1PowerW");
      return {
        studentTokens: [
          `${resistance} Ω`,
          `${openPower} W`,
          "switch is closed",
        ],
        solutionTokens: ["12.0 V", "4.00 A", answer(closedPower, "W")],
        finalAnswers: { answer: `A — ${answer(closedPower, "W")}` },
        optionTexts: ["8.00 W", "16.0 W", "18.0 W", "36.0 W"],
      };
    }
    case "bypass-equivalent": {
      const resistance = formatToSignificantFigures(scenario.resistorOhm);
      const equivalent = numericResult(results, "equivalentResistanceOhm");
      return {
        studentTokens: [`${resistance} Ω`, "between X and Y"],
        solutionTokens: ["same two nodes", answer(equivalent, "Ω")],
        finalAnswers: { answer: `A — ${answer(equivalent, "Ω")}` },
        optionTexts: ["2.00 Ω", "4.00 Ω", "9.00 Ω", "18.0 Ω"],
      };
    }
    case "lamp-failure":
      return {
        studentTokens: ["I₀", "V₀", "open circuit"],
        solutionTokens: ["2R/3", "1/3", "V₀"],
        finalAnswers: { answer: "C — I₀/3 and V₀" },
        optionTexts: [
          "I₀/3; less than V₀",
          "2I₀/3; less than V₀",
          "I₀/3; V₀",
          "2I₀/3; V₀",
        ],
      };
    case "series-components": {
      const pResistance = numericResult(results, "pResistanceOhm");
      const currentMa = numericResult(results, "ammeterCurrentA") * 1000;
      const emf = numericResult(results, "emfV");
      return {
        studentTokens: [
          "graph shows",
          "ohmic resistor P",
          "non-ohmic component Q",
          "3.0 V",
        ],
        solutionTokens: [
          answer(pResistance, "Ω"),
          "resistance of Q increases",
          answer(currentMa, "mA"),
          answer(emf, "V"),
        ],
        finalAnswers: {
          a: answer(pResistance, "Ω"),
          b: "The resistance of Q increases.",
          c: answer(currentMa, "mA"),
          d: answer(emf, "V"),
        },
      };
    }
    case "internal-resistance": {
      const internalResistance = numericResult(
        results,
        "internalResistanceOhm",
      );
      const emf = numericResult(results, "emfV");
      return {
        studentTokens: [
          "emf and internal resistance",
          "voltmeter reading V",
          "ammeter reading I",
        ],
        solutionTokens: [
          "variable resistor",
          "V = ε − Ir",
          answer(internalResistance, "Ω"),
          answer(emf, "V"),
        ],
        finalAnswers: {
          a: undefined,
          b: answer(internalResistance, "Ω"),
          c: answer(emf, "V"),
        },
      };
    }
    case "ldr-divider": {
      const currentMicroamp = numericResult(results, "currentA") * 1e6;
      return {
        studentTokens: [
          `${formatToSignificantFigures(scenario.darkLdrResistanceOhm / 1000)} kΩ`,
          `${formatToSignificantFigures(scenario.fixedResistanceOhm / 1000)} kΩ`,
          `${formatToSignificantFigures(scenario.emfV)} V`,
        ],
        solutionTokens: [
          "250 kΩ",
          "3.60 × 10⁻⁵ A",
          "V = IR increases",
          "P = εI increases",
        ],
        finalAnswers: {
          a: "It has negligible resistance.",
          b: answer(currentMicroamp, "µA"),
          "c-i": "The voltmeter reading increases.",
          "c-ii": "The power transferred by the cell increases.",
        },
      };
    }
    case "thermistor-divider": {
      const currentMa = numericResult(results, "batteryCurrentA") * 1000;
      const thermistorResistance = numericResult(
        results,
        "thermistorResistanceOhm",
      );
      return {
        studentTokens: [
          `${formatToSignificantFigures(scenario.emfV)} V`,
          `${formatToSignificantFigures(scenario.seriesResistanceOhm)} Ω`,
          `${formatToSignificantFigures(scenario.parallelFixedResistanceOhm)} Ω`,
          `${formatToSignificantFigures(scenario.parallelVoltageV)} V`,
        ],
        solutionTokens: [
          answer(currentMa, "mA"),
          "60.0 Ω",
          answer(thermistorResistance, "Ω"),
          "voltmeter reading decreases",
        ],
        finalAnswers: {
          "a-i": answer(currentMa, "mA"),
          "a-ii": answer(thermistorResistance, "Ω"),
          b: "The voltmeter reading decreases.",
        },
      };
    }
  }
}

function questionText(question: CircuitStudentQuestion): string {
  return [
    question.stem,
    ...(question.kind === "multiple-choice"
      ? question.options.map((option) => option.text)
      : question.parts.map((part) => part.prompt)),
  ].join("\n");
}

function solutionText(solution: CircuitQuestionPackage["solution"]): string {
  return solution.parts
    .flatMap((part) => [
      ...part.working,
      ...part.markingPoints,
      part.finalAnswer ?? "",
    ])
    .join("\n");
}

export function validateCircuitQuestionPackage(item: CircuitQuestionPackage): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const fixture = CIRCUIT_SOURCE_FIXTURES.find(
    (candidate) => candidate.id === item.source.fixtureId,
  );
  if (!fixture || fixture.sourceQuestionId !== item.source.questionId) {
    issues.push("Source fixture and question linkage must resolve");
  }
  if (fixture?.paper !== item.paper) {
    issues.push("Package paper must match its source fixture");
  }
  if (item.visualSpec.scenarioRef !== item.id) {
    issues.push("Visual scenarioRef must point to the package");
  }
  if (
    (item.scenario.kind === "series-components" ||
      item.scenario.kind === "internal-resistance") &&
    !item.plot
  ) {
    issues.push("Source graph-reading package must retain its Cartesian plot");
  }
  if (item.plot && item.plot.student.spec.scenarioRef !== item.id) {
    issues.push("Plot scenarioRef must point to the package");
  }
  if (
    fixture &&
    (JSON.stringify(item.visualSpec.payload) !==
      JSON.stringify(fixture.spec.payload) ||
      JSON.stringify(item.visualSpec.layers ?? []) !==
        JSON.stringify(fixture.spec.layers ?? []))
  ) {
    issues.push("Package visual topology must match the source fixture");
  }
  const publicIds = new Set(item.visualSpec.visibility.publicParameterIds);
  if (
    item.visualSpec.visibility.privateParameterIds.some((id) =>
      publicIds.has(id),
    )
  ) {
    issues.push("Public and private visual parameter IDs must be disjoint");
  }
  if (
    item.assumptions.length === 0 ||
    item.assumptions.some((x) => !x.trim())
  ) {
    issues.push("At least one explicit assumption is required");
  }
  const overPreciseGivens = overPreciseGivenPaths(item.scenario);
  if (overPreciseGivens.length > 0) {
    issues.push(
      `Scenario givens must use at most three significant figures: ${overPreciseGivens.join(", ")}`,
    );
  }
  if (
    !item.source.sourceScope.trim() ||
    item.source.markscheme.pages.length === 0 ||
    item.source.markscheme.evidence.length === 0
  ) {
    issues.push("Source scope and mark-scheme evidence are required");
  }
  if (!item.question.stem.trim()) {
    issues.push("Student question stem must not be empty");
  }
  if (item.question.kind === "multiple-choice") {
    const optionIds = item.question.options.map((option) => option.id);
    const optionTexts = item.question.options.map((option) => option.text);
    if (
      optionIds.length !== 4 ||
      new Set(optionIds).size !== 4 ||
      new Set(optionTexts).size !== 4 ||
      optionIds.some((id) => !(["A", "B", "C", "D"] as string[]).includes(id))
    ) {
      issues.push("Multiple-choice questions need four unique A–D options");
    }
    if (
      !item.solution.correctOptionId ||
      !optionIds.includes(item.solution.correctOptionId)
    ) {
      issues.push("Multiple-choice solution needs a valid correct option");
    }
    if (item.results.correctOptionId !== item.solution.correctOptionId) {
      issues.push("Multiple-choice answer must match the solver result");
    }
  } else if (item.solution.correctOptionId) {
    issues.push("Multipart solutions must not define a correct option");
  } else if (
    item.question.parts.some(
      (part) =>
        !part.id.trim() ||
        !part.prompt.trim() ||
        !Number.isInteger(part.marks) ||
        part.marks < 1,
    )
  ) {
    issues.push(
      "Multipart question parts need text and positive integer marks",
    );
  }
  const questionPartIds =
    item.question.kind === "multiple-choice"
      ? ["answer"]
      : item.question.parts.map((part) => part.id);
  const solutionPartIds = item.solution.parts.map((part) => part.partId);
  if (
    new Set(questionPartIds).size !== questionPartIds.length ||
    new Set(solutionPartIds).size !== solutionPartIds.length ||
    JSON.stringify([...questionPartIds].sort()) !==
      JSON.stringify([...solutionPartIds].sort())
  ) {
    issues.push("Every student part needs exactly one matching solution part");
  }
  if (
    item.marks !== questionMarks(item.question) ||
    item.marks !==
      item.solution.parts.reduce((total, part) => total + part.marks, 0)
  ) {
    issues.push("Question and solution marks must match the package total");
  }
  if (
    item.solution.parts.some(
      (part) =>
        !Number.isInteger(part.marks) ||
        part.marks < 1 ||
        part.markingPoints.length < part.marks ||
        part.markingPoints.some((point) => !point.trim()) ||
        part.working.some((step) => !step.trim()) ||
        (part.working.length === 0 && !part.finalAnswer?.trim()),
    )
  ) {
    issues.push(
      "Solution parts need positive marks, substantive marking points and worked or final content",
    );
  }
  try {
    const expected = expectedPackageContent(item);
    const studentContent = questionText(item.question);
    const teacherContent = solutionText(item.solution);
    for (const token of expected.studentTokens) {
      if (!studentContent.includes(token)) {
        issues.push(
          `Student content is inconsistent with the scenario: ${token}`,
        );
      }
    }
    for (const token of expected.solutionTokens) {
      if (!teacherContent.includes(token)) {
        issues.push(`Solution is inconsistent with solver results: ${token}`);
      }
    }
    for (const part of item.solution.parts) {
      if (
        !(part.partId in expected.finalAnswers) ||
        part.finalAnswer !== expected.finalAnswers[part.partId]
      ) {
        issues.push(
          `Final answer is inconsistent with results: ${part.partId}`,
        );
      }
    }
    if (
      expected.optionTexts &&
      (item.question.kind !== "multiple-choice" ||
        JSON.stringify(item.question.options.map((option) => option.text)) !==
          JSON.stringify(expected.optionTexts))
    ) {
      issues.push("Multiple-choice options do not match the checked package");
    }
  } catch (error) {
    issues.push(
      `Package content could not be checked: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  for (const [key, value] of Object.entries(item.results)) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      issues.push(`Result must be finite: ${key}`);
    }
  }
  for (const check of item.sourceChecks) {
    if (!checkSourceResult(item.results, check)) {
      issues.push(`Source check failed: ${check.resultKey}`);
    }
  }
  try {
    const recomputed = solveCircuitScenario(item.scenario);
    if (JSON.stringify(recomputed) !== JSON.stringify(item.results)) {
      issues.push("Stored results must match the deterministic solver");
    }
  } catch (error) {
    issues.push(
      `Scenario is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    item.physicsStatus !== "verified" ||
    item.trainingEligibility !== "blocked" ||
    JSON.stringify(item.trainingBlockers) !==
      JSON.stringify([
        "not human reviewed",
        "source-use rights not cleared",
        "training metadata and grouped split not assigned",
      ])
  ) {
    issues.push("Package status or training blockers are inconsistent");
  }
  return { valid: issues.length === 0, issues };
}

export const CIRCUIT_QUESTION_PACKAGES: readonly CircuitQuestionPackage[] =
  generateCircuitQuestionPackages();
