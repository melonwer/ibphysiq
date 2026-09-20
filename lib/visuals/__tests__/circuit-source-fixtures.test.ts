import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { CIRCUIT_SOURCE_FIXTURES } from "../circuit-source-fixtures";
import { renderCircuitNetwork } from "../render-circuit";
import { VisualSpec } from "../types";

const cloneSpec = (
  spec: VisualSpec<"circuit_network">,
): VisualSpec<"circuit_network"> => structuredClone(spec);

describe("eight-question source-linked circuit pilot", () => {
  it("keeps a distinct 4 Paper 1A / 4 Paper 2 balance", () => {
    expect(CIRCUIT_SOURCE_FIXTURES).toHaveLength(8);
    expect(
      new Set(
        CIRCUIT_SOURCE_FIXTURES.map((fixture) => fixture.sourceQuestionId),
      ).size,
    ).toBe(8);
    expect(
      CIRCUIT_SOURCE_FIXTURES.filter((fixture) => fixture.paper === "1A"),
    ).toHaveLength(4);
    expect(
      CIRCUIT_SOURCE_FIXTURES.filter((fixture) => fixture.paper === "2"),
    ).toHaveLength(4);
  });

  it.each(CIRCUIT_SOURCE_FIXTURES)(
    "renders a deterministic student-safe circuit: $id",
    (fixture) => {
      const svg = renderCircuitNetwork(fixture.spec);
      expect(svg).toBe(renderCircuitNetwork(fixture.spec));
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      expect(svg).not.toContain(`${fixture.id}-answer`);
      expect(fixture.trainingEligibility).toBe("blocked");
    },
  );

  it.each(CIRCUIT_SOURCE_FIXTURES)(
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

  it("covers every component and layout capability observed in the selected sources", () => {
    const capabilities = new Set(
      CIRCUIT_SOURCE_FIXTURES.flatMap((fixture) => fixture.capabilities),
    );
    expect([...capabilities]).toEqual(
      expect.arrayContaining([
        "panel-grid",
        "explicit-junctions",
        "open-switch",
        "bypass-wires",
        "sequence",
        "inactive-component",
        "ammeter",
        "voltmeter",
        "variable-resistor",
        "ldr",
        "thermistor",
        "battery",
      ]),
    );
    const componentKinds = new Set(
      CIRCUIT_SOURCE_FIXTURES.flatMap((fixture) => [
        ...fixture.spec.payload.components.map((item) => item.kind),
        ...(fixture.spec.layers ?? []).flatMap((layer) =>
          layer.family === "circuit_network"
            ? layer.payload.components.map((item) => item.kind)
            : [],
        ),
      ]),
    );
    expect([...componentKinds]).toEqual(
      expect.arrayContaining([
        "cell",
        "battery",
        "resistor",
        "variable-resistor",
        "thermistor",
        "ldr",
        "lamp",
        "switch",
        "ammeter",
        "voltmeter",
      ]),
    );
  });

  it("renders the lamp-failure state only in the second sequence panel", () => {
    const fixture = CIRCUIT_SOURCE_FIXTURES.find((item) =>
      item.id.includes("q16-circuit"),
    )!;
    expect(fixture.spec.composition).toMatchObject({
      kind: "sequence",
      panelLabels: ["initial", "Z burnt out"],
    });
    expect(
      fixture.spec.payload.components.find((item) => item.id === "lamp-z")
        ?.state,
    ).toBe("active");
    const secondPanel = fixture.spec.layers?.[0];
    expect(secondPanel?.family).toBe("circuit_network");
    if (secondPanel?.family !== "circuit_network")
      throw new Error("Missing panel");
    expect(
      secondPanel.payload.components.find((item) => item.id === "lamp-z")
        ?.state,
    ).toBe("inactive");
    expect(renderCircuitNetwork(fixture.spec)).toContain('fill="#b8bdc2"');
  });

  it("rejects unresolved terminals", () => {
    const spec = cloneSpec(CIRCUIT_SOURCE_FIXTURES[1].spec);
    spec.payload.components[0].terminals[1] = "missing";
    expect(() => renderCircuitNetwork(spec)).toThrow(
      "Invalid circuit connection",
    );
  });

  it("rejects missing or diagonal layout geometry", () => {
    const missing = cloneSpec(CIRCUIT_SOURCE_FIXTURES[2].spec);
    delete missing.payload.layoutHints!.nodePositions!.x;
    expect(() => renderCircuitNetwork(missing)).toThrow(
      "Invalid circuit node position",
    );

    const diagonal = cloneSpec(CIRCUIT_SOURCE_FIXTURES[4].spec);
    diagonal.payload.layoutHints!.nodePositions!["left-top"] = {
      x: 0.2,
      y: 0.12,
    };
    expect(() => renderCircuitNetwork(diagonal)).toThrow(
      "Circuit component must be orthogonal",
    );
  });

  it("rejects implicit branch points and private labels", () => {
    const implicitBranch = cloneSpec(CIRCUIT_SOURCE_FIXTURES[1].spec);
    implicitBranch.payload.nodes.find((item) => item.id === "left")!.kind =
      "terminal";
    expect(() => renderCircuitNetwork(implicitBranch)).toThrow(
      "Circuit branch must be an explicit junction",
    );

    const privateLabel = cloneSpec(CIRCUIT_SOURCE_FIXTURES[6].spec);
    const ldrLabel = privateLabel.payload.components.find(
      (item) => item.id === "ldr",
    )!.labelParameterId!;
    privateLabel.visibility.publicParameterIds =
      privateLabel.visibility.publicParameterIds.filter(
        (parameter) => parameter !== ldrLabel,
      );
    privateLabel.visibility.privateParameterIds.push(ldrLabel);
    expect(() => renderCircuitNetwork(privateLabel)).toThrow(
      "Circuit label is not student-visible",
    );
  });
});
