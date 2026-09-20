import {
  CIRCUIT_INTENT_SCHEMA_VERSION,
  CircuitComponentIntent,
  CircuitIntent,
  CircuitParallelIntent,
  CircuitSeriesIntent,
  CircuitTopologyIntent,
} from "./circuit-intent";
import { CircuitComponentSpec } from "./types";

export interface CircuitIntentSourceFixture {
  id: string;
  sourceFixtureId: string;
  sourceQuestionId: string;
  sourceNote: string;
  trainingEligibility: "blocked";
  intent: CircuitIntent;
}

const component = (
  id: string,
  componentKind: CircuitComponentSpec["kind"],
  options: Omit<CircuitComponentIntent, "type" | "id" | "componentKind"> = {},
): CircuitComponentIntent => ({
  type: "component",
  id,
  componentKind,
  ...options,
});

const series = (...items: CircuitTopologyIntent[]): CircuitSeriesIntent => ({
  type: "series",
  items,
});

const parallel = (
  ...branches: CircuitTopologyIntent[]
): CircuitParallelIntent => ({
  type: "parallel",
  branches,
});

const resistorPanelP = series(
  component("r1", "resistor"),
  component("r2", "resistor"),
  parallel(component("r3", "resistor"), component("r4", "resistor")),
);

const resistorPanelQ = series(
  component("r1", "resistor"),
  parallel(
    component("r2", "resistor"),
    component("r3", "resistor"),
    component("r4", "resistor"),
  ),
);

const resistorPanelR = series(
  component("r1", "resistor"),
  parallel(
    component("r2", "resistor"),
    series(component("r3", "resistor"), component("r4", "resistor")),
  ),
);

const resistorOptionsIntent = {
  schemaVersion: CIRCUIT_INTENT_SCHEMA_VERSION,
  id: "may25-tz1-hl-1a-q14-circuit-intent",
  scenarioRef: "q_56ee5730ce4806d73e6e",
  templateId: "series-parallel.v1",
  topology: resistorPanelP,
  panels: [
    { id: "p", label: "P" },
    { id: "q", label: "Q", topology: resistorPanelQ },
    { id: "r", label: "R", topology: resistorPanelR },
  ],
  composition: { kind: "panel-grid", columns: 1 },
  visibility: {
    privateParameterIds: ["may25-tz1-hl-1a-q14-answer"],
    altTextMode: "student-safe",
  },
  provenance: { sourceQuestionId: "q_56ee5730ce4806d73e6e" },
} satisfies CircuitIntent;

const lampFailureIntent = {
  schemaVersion: CIRCUIT_INTENT_SCHEMA_VERSION,
  id: "may26-tz2-hl-1a-q16-circuit-intent",
  scenarioRef: "q_51680d0cd4c8b6343dab",
  templateId: "series-parallel.v1",
  topology: parallel(
    series(component("ammeter", "ammeter"), component("cell", "cell")),
    series(
      component("lamp-x", "lamp", { label: "X", labelPosition: "left" }),
      component("lamp-y", "lamp", { label: "Y", labelPosition: "left" }),
    ),
    component("lamp-z", "lamp", {
      state: "active",
      label: "Z",
      labelPosition: "right",
    }),
    component("voltmeter", "voltmeter"),
  ),
  layout: { direction: "top-to-bottom" },
  panels: [
    { id: "initial", label: "initial" },
    {
      id: "failed",
      label: "Z burnt out",
      componentOverrides: { "lamp-z": { state: "failed-open" } },
    },
  ],
  composition: { kind: "sequence", columns: 2 },
  visibility: {
    privateParameterIds: ["may26-tz2-hl-1a-q16-answer"],
    altTextMode: "student-safe",
  },
  provenance: { sourceQuestionId: "q_51680d0cd4c8b6343dab" },
} satisfies CircuitIntent;

const internalResistanceIntent = {
  schemaVersion: CIRCUIT_INTENT_SCHEMA_VERSION,
  id: "nov25-tz1-hl-2-q2-circuit-intent",
  scenarioRef: "q_cf9c9d9e434d847ca84c",
  templateId: "series-parallel.v1",
  topology: parallel(
    series(component("ammeter", "ammeter"), component("cell", "cell")),
    component("voltmeter", "voltmeter"),
    component("variable-resistor", "variable-resistor"),
  ),
  visibility: {
    privateParameterIds: ["nov25-tz1-hl-2-q2-answer"],
    altTextMode: "student-safe",
  },
  provenance: { sourceQuestionId: "q_cf9c9d9e434d847ca84c" },
} satisfies CircuitIntent;

export const CIRCUIT_INTENT_SOURCE_FIXTURES: readonly CircuitIntentSourceFixture[] =
  [
    {
      id: "resistor-options-intent",
      sourceFixtureId: "may25-tz1-hl-1a-q14-circuit-source",
      sourceQuestionId: "q_56ee5730ce4806d73e6e",
      sourceNote:
        "Three source-backed resistor options expressed without node coordinates.",
      trainingEligibility: "blocked",
      intent: resistorOptionsIntent,
    },
    {
      id: "lamp-failure-intent",
      sourceFixtureId: "may26-tz2-hl-1a-q16-circuit-source",
      sourceQuestionId: "q_51680d0cd4c8b6343dab",
      sourceNote:
        "A base circuit plus a semantic failed-open override for the second panel.",
      trainingEligibility: "blocked",
      intent: lampFailureIntent,
    },
    {
      id: "internal-resistance-intent",
      sourceFixtureId: "nov25-tz1-hl-2-q2-circuit-source",
      sourceQuestionId: "q_cf9c9d9e434d847ca84c",
      sourceNote:
        "An internal-resistance measurement circuit encoded as three parallel paths.",
      trainingEligibility: "blocked",
      intent: internalResistanceIntent,
    },
  ];
