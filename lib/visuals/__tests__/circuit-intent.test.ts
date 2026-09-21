import {
  CIRCUIT_INTENT_JSON_SCHEMA,
  CIRCUIT_INTENT_SCHEMA_VERSION,
  CircuitIntent,
  compileCircuitIntent,
  compileCircuitTopology,
  validateCircuitIntent,
} from "../circuit-intent";
import { CIRCUIT_INTENT_SOURCE_FIXTURES } from "../circuit-intent-fixtures";
import { CIRCUIT_SOURCE_FIXTURES } from "../circuit-source-fixtures";
import { renderCircuitNetwork } from "../render-circuit";
import { CircuitNetworkPayload, VisualSpec } from "../types";

const payloads = (
  spec: VisualSpec<"circuit_network">,
): CircuitNetworkPayload[] => [
  spec.payload,
  ...(spec.layers ?? []).flatMap((layer) =>
    layer.family === "circuit_network" ? [layer.payload] : [],
  ),
];

const componentInventory = (payload: CircuitNetworkPayload): string[] =>
  payload.components
    .map((component) =>
      JSON.stringify({
        id: component.id,
        kind: component.kind,
        label: component.label,
        state: component.state,
      }),
    )
    .sort();

const electricalAdjacency = (payload: CircuitNetworkPayload): string[] => {
  const parent = new Map(payload.nodes.map((node) => [node.id, node.id]));
  const find = (id: string): string => {
    const current = parent.get(id)!;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };
  payload.wires.forEach((wire) => union(wire.from, wire.to));
  const components = [...payload.components].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const result: string[] = [];
  for (let left = 0; left < components.length; left += 1) {
    for (let right = left + 1; right < components.length; right += 1) {
      const leftNets = new Set(components[left].terminals.map(find));
      const rightNets = new Set(components[right].terminals.map(find));
      const shared = [...leftNets].filter((net) => rightNets.has(net)).length;
      if (shared > 0) {
        result.push(`${components[left].id}|${components[right].id}:${shared}`);
      }
    }
  }
  return result;
};

describe("circuit intent compiler", () => {
  it.each(CIRCUIT_INTENT_SOURCE_FIXTURES)(
    "validates and deterministically renders source-backed intent: $id",
    (fixture) => {
      expect(validateCircuitIntent(fixture.intent)).toEqual({
        valid: true,
        issues: [],
      });
      const spec = compileCircuitIntent(fixture.intent);
      const svg = renderCircuitNetwork(spec);
      expect(svg).toBe(
        renderCircuitNetwork(compileCircuitIntent(fixture.intent)),
      );
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      expect(svg).not.toContain(
        fixture.intent.visibility?.privateParameterIds?.[0],
      );
      for (const payload of payloads(spec)) {
        expect(payload.layoutHints?.nodePositions).toBeDefined();
        expect(
          payload.nodes.every(
            (node) => node.id in payload.layoutHints!.nodePositions!,
          ),
        ).toBe(true);
      }
    },
  );

  it.each(CIRCUIT_INTENT_SOURCE_FIXTURES)(
    "preserves the source fixture's component inventory: $id",
    (fixture) => {
      const source = CIRCUIT_SOURCE_FIXTURES.find(
        (candidate) => candidate.id === fixture.sourceFixtureId,
      );
      expect(source).toBeDefined();
      const compiledPayloads = payloads(compileCircuitIntent(fixture.intent));
      const sourcePayloads = payloads(source!.spec);
      expect(compiledPayloads).toHaveLength(sourcePayloads.length);
      compiledPayloads.forEach((payload, index) => {
        expect(componentInventory(payload)).toEqual(
          componentInventory(sourcePayloads[index]),
        );
        expect(electricalAdjacency(payload)).toEqual(
          electricalAdjacency(sourcePayloads[index]),
        );
      });
    },
  );

  it("keeps coordinates out of the model-facing intent and schema", () => {
    const fixture = CIRCUIT_INTENT_SOURCE_FIXTURES[1];
    const serializedIntent = JSON.stringify(fixture.intent);
    const serializedSchema = JSON.stringify(CIRCUIT_INTENT_JSON_SCHEMA);
    expect(serializedIntent).not.toMatch(/nodePositions|\"x\"|\"y\"/);
    expect(serializedSchema).not.toMatch(/nodePositions|coordinate/);
    expect(CIRCUIT_INTENT_JSON_SCHEMA.properties.topology).toEqual({
      $ref: "#/$defs/topology",
    });
  });

  it("maps semantic failed-open state only into the second lamp panel", () => {
    const fixture = CIRCUIT_INTENT_SOURCE_FIXTURES.find(
      (candidate) => candidate.id === "lamp-failure-intent",
    )!;
    const spec = compileCircuitIntent(fixture.intent);
    const panels = payloads(spec);
    expect(
      panels[0].components.find((component) => component.id === "lamp-z")
        ?.state,
    ).toBe("active");
    expect(
      panels[1].components.find((component) => component.id === "lamp-z")
        ?.state,
    ).toBe("inactive");
    expect(spec.composition).toMatchObject({
      kind: "sequence",
      columns: 2,
      panelLabels: ["initial", "Z burnt out"],
    });
  });

  it("compiles nested series/parallel topology into an orthogonal payload", () => {
    const payload = compileCircuitTopology(
      {
        type: "parallel",
        branches: [
          {
            type: "series",
            items: [
              { type: "component", id: "cell", componentKind: "cell" },
              {
                type: "component",
                id: "switch",
                componentKind: "switch",
                state: "closed",
              },
            ],
          },
          {
            type: "series",
            items: [
              {
                type: "component",
                id: "r1",
                componentKind: "resistor",
              },
              {
                type: "parallel",
                branches: [
                  {
                    type: "component",
                    id: "r2",
                    componentKind: "resistor",
                  },
                  { type: "wire", id: "bypass" },
                ],
              },
            ],
          },
        ],
      },
      {
        idPrefix: "nested",
        terminalLabels: { start: "X", end: "Y" },
      },
    );
    const positions = payload.layoutHints!.nodePositions!;
    for (const wire of payload.wires) {
      const start = positions[wire.from];
      const end = positions[wire.to];
      expect(start.x === end.x || start.y === end.y).toBe(true);
    }
    for (const component of payload.components) {
      const start = positions[component.terminals[0]];
      const end = positions[component.terminals[1]];
      expect(start.x === end.x || start.y === end.y).toBe(true);
    }
    expect(
      payload.nodes.filter((node) => node.kind === "junction").length,
    ).toBeGreaterThan(0);
    expect(
      payload.nodes.filter((node) => node.label).map((node) => node.label),
    ).toEqual(["X", "Y"]);
  });

  it.each([
    {
      name: "duplicate component IDs",
      mutate: (intent: CircuitIntent) => {
        intent.topology = {
          type: "series",
          items: [
            { type: "component", id: "same", componentKind: "cell" },
            { type: "component", id: "same", componentKind: "resistor" },
          ],
        };
      },
      issue: "Duplicate circuit component ID: same",
    },
    {
      name: "underspecified parallel groups",
      mutate: (intent: CircuitIntent) => {
        intent.topology = {
          type: "parallel",
          branches: [
            { type: "component", id: "only", componentKind: "resistor" },
          ],
        };
      },
      issue: "intent.topology.branches must contain at least two entries",
    },
    {
      name: "state on an incompatible component",
      mutate: (intent: CircuitIntent) => {
        intent.topology = {
          type: "series",
          items: [
            {
              type: "component",
              id: "r1",
              componentKind: "resistor",
              state: "open",
            },
            { type: "component", id: "r2", componentKind: "resistor" },
          ],
        };
      },
      issue:
        "intent.topology.items[0].state is only supported for switches and lamps",
    },
  ])("rejects $name", ({ mutate, issue }) => {
    const intent = structuredClone(CIRCUIT_INTENT_SOURCE_FIXTURES[2].intent);
    mutate(intent);
    expect(validateCircuitIntent(intent)).toEqual({
      valid: false,
      issues: [issue],
    });
    expect(() => compileCircuitIntent(intent)).toThrow(issue);
  });

  it("rejects panel overrides that reference absent components", () => {
    const intent = structuredClone(CIRCUIT_INTENT_SOURCE_FIXTURES[1].intent);
    intent.panels![1].componentOverrides = {
      missing: { state: "failed-open" },
    };
    expect(validateCircuitIntent(intent)).toEqual({
      valid: false,
      issues: [
        "intent.panels[1].componentOverrides references unknown component: missing",
      ],
    });
  });

  it("requires the explicit versioned model contract", () => {
    const intent = structuredClone(
      CIRCUIT_INTENT_SOURCE_FIXTURES[0].intent,
    ) as {
      schemaVersion: string;
    };
    intent.schemaVersion = "circuit-intent/99.0.0";
    expect(validateCircuitIntent(intent)).toEqual({
      valid: false,
      issues: [
        "Unsupported circuit intent schema version: circuit-intent/99.0.0",
      ],
    });
    expect(CIRCUIT_INTENT_SCHEMA_VERSION).toBe("circuit-intent/0.1.0");
  });
});
