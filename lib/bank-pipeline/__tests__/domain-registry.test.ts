import {
  getDomainAdapter,
  hasDomainAdapter,
  listRegisteredDomains,
  registerVisualModule,
  resetDomainRegistryToDefaults,
} from "@/lib/bank-pipeline/domain-registry";
import { inspectSvgSanity } from "@/lib/bank-pipeline/svg-guard";
import { PhysicsDomainId } from "@/lib/bank-pipeline/types";

describe("domain-registry", () => {
  afterEach(() => {
    resetDomainRegistryToDefaults();
  });

  it("registers fa50e43 visual families plus pure-calculation out of the box", () => {
    const domains = listRegisteredDomains();
    expect(domains).toEqual(
      expect.arrayContaining([
        "graphs",
        "circuits",
        "fields",
        "mechanics",
        "pure-calculation",
      ]),
    );
  });

  it("solves and renders clean SVGs across graphs, circuits, fields, and mechanics", () => {
    for (const domain of ["graphs", "circuits", "fields", "mechanics"] as const) {
      const adapter = getDomainAdapter(domain);
      const sampled = adapter.sampleScenario!(42);
      const validation = adapter.validateScenario(sampled);
      expect(validation.valid).toBe(true);

      const solved = adapter.solveScenario(sampled);
      expect(Object.keys(solved.quantities).length).toBeGreaterThan(0);

      const rendered = adapter.renderSvg!(sampled, {
        id: `test-${domain}`,
        hiddenQuantities: Object.keys(solved.quantities),
      });
      expect(rendered).toBeDefined();
      const sanity = inspectSvgSanity(rendered!.svgMarkup);
      expect(sanity.valid).toBe(true);
    }
  });

  it("supports general piecewise-linear-graph and masks hidden circuit/mechanics labels", () => {
    const graphs = getDomainAdapter("graphs");
    const graphOut = graphs.solveScenario({
      kind: "piecewise-linear-graph",
      xLabel: "position",
      xUnit: "m",
      yLabel: "force",
      yUnit: "N",
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 10 },
        { x: 10, y: 10 },
      ],
      initialValue: 0,
      massKg: 2,
      gradientInterval: [0, 4],
    });
    expect(graphOut.quantities.signedArea).toBeCloseTo(80, 6);
    expect(graphOut.quantities.gradient).toBeCloseTo(2.5, 6);
    expect(graphOut.quantities.finalSpeedFromWorkMs).toBeCloseTo(
      Math.sqrt(80),
      6,
    );

    const circuits = getDomainAdapter("circuits");
    const renderedMasked = circuits.renderSvg!(
      {
        kind: "dc-series-parallel",
        emfV: 24,
        internalOhm: 2,
        seriesOhm: 4,
        parallelBranchOhms: [12, 6],
      },
      {
        id: "masked-circuit",
        hiddenQuantities: ["seriesOhm"],
      },
    );
    expect(renderedMasked!.svgMarkup).not.toContain("4 Ω");
    expect(renderedMasked!.svgMarkup).toContain("24 V");
  });

  it("plugs in all 6 incoming Wave 1 visual modules with 1 line each", () => {
    const incomingDomains: PhysicsDomainId[] = [
      "waves",
      "optics-shm",
      "thermal",
      "grav-astro",
      "em-induction",
      "quantum-nuclear",
    ];

    for (const domain of incomingDomains) {
      registerVisualModule(domain, {
        validate: (spec) =>
          typeof spec.frequencyHz === "number" && spec.frequencyHz > 0
            ? []
            : ["frequencyHz must be positive"],
        solve: (spec) => ({
          wavelengthM: 340 / Number(spec.frequencyHz),
        }),
        render: (spec) => {
          const hidden = Array.isArray(spec.hiddenQuantities)
            ? spec.hiddenQuantities
            : [];
          const label = hidden.includes("wavelengthM")
            ? `f = ${String(spec.frequencyHz)} Hz`
            : `λ = ${String(340 / Number(spec.frequencyHz))} m`;
          return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><path d="M 10 100 L 390 100" stroke="#111"/><text x="200" y="50">${label}</text></svg>`;
        },
      });

      expect(hasDomainAdapter(domain)).toBe(true);
      const adapter = getDomainAdapter(domain);
      expect(adapter.validateScenario({ frequencyHz: -5 }).valid).toBe(false);

      const solved = adapter.solveScenario({ frequencyHz: 170 });
      expect(solved.quantities.wavelengthM).toBeCloseTo(2.0, 6);

      const rendered = adapter.renderSvg!(
        { frequencyHz: 170 },
        { hiddenQuantities: ["wavelengthM"] },
      );
      expect(rendered!.svgMarkup).toContain("f = 170 Hz");
      expect(rendered!.svgMarkup).not.toContain("λ = 2 m");
    }
  });
});
