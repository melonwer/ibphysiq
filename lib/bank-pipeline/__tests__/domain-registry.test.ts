import {
  getDomainAdapter,
  hasDomainAdapter,
  listRegisteredDomains,
  registerVisualModule,
  resetDomainRegistryToDefaults,
} from "@/lib/bank-pipeline/domain-registry";
import { verifyCandidateWithGate } from "@/lib/bank-pipeline/package-gate";
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

  it("SHOULD-FIX 7 regression: supports exact solve/validate/render signatures of em-induction, waves, grav-astro, and quantum-nuclear while merging spec + candidate hiddenQuantities", () => {
    // 1. EM-INDUCTION mock: interface spec with hiddenQuantities, { valid, issues }, { quantities, afterChange }, render reading spec.hiddenQuantities
    interface MockEmSpec {
      kind: "parallel-plate-capacitor";
      plateAreaM2: number;
      plateSeparationM: number;
      voltageV: number;
      hiddenQuantities?: readonly string[];
    }
    interface MockEmRenderOptions {
      width?: number;
      height?: number;
    }
    const validateEm = (spec: MockEmSpec) => ({
      valid: spec.plateSeparationM > 0,
      issues:
        spec.plateSeparationM > 0
          ? []
          : [
              {
                code: "BAD_SEP",
                path: "plateSeparationM",
                message: "Separation must be positive",
              },
            ],
    });
    const solveEm = (spec: MockEmSpec) => {
      const cap = (8.85e-12 * spec.plateAreaM2) / spec.plateSeparationM;
      const charge = cap * spec.voltageV;
      return {
        kind: "parallel-plate-capacitor" as const,
        capacitanceF: cap,
        chargeC: charge,
        afterChange: {
          newCapacitanceF: cap * 2,
        },
        quantities: {
          capacitanceF: cap,
          chargeC: { value: charge, unit: "C" },
        },
      };
    };
    let capturedEmOpts: unknown;
    const renderEm = (spec: MockEmSpec, options: MockEmRenderOptions = {}) => {
      capturedEmOpts = options;
      const hidden = new Set(spec.hiddenQuantities ?? []);
      const labels = [
        !hidden.has("capacitanceF") ? "C=8.85e-11 F" : "C=?",
        !hidden.has("chargeC") ? "Q=1.06e-9 C" : "Q=?",
      ];
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect x="20" y="20" width="100" height="60"/><text x="40" y="50">${labels.join(" ")}</text></svg>`;
    };

    registerVisualModule("em-induction", {
      validate: validateEm,
      solve: solveEm,
      render: renderEm,
    });

    const emAdapter = getDomainAdapter("em-induction");
    expect(
      emAdapter.validateScenario({
        kind: "parallel-plate-capacitor",
        plateAreaM2: 0.01,
        plateSeparationM: -1,
        voltageV: 12,
      }),
    ).toEqual({
      valid: false,
      issues: ["plateSeparationM: Separation must be positive"],
    });

    const emSolved = emAdapter.solveScenario({
      kind: "parallel-plate-capacitor",
      plateAreaM2: 0.01,
      plateSeparationM: 0.001,
      voltageV: 12,
    });
    expect(emSolved.quantities.capacitanceF).toBeCloseTo(8.85e-11, 16);
    expect(emSolved.quantities.chargeC).toBeCloseTo(1.062e-9, 14);
    expect(emSolved.quantities.newCapacitanceF).toBeCloseTo(1.77e-10, 15);

    // Crucial test: spec ALREADY has hiddenQuantities: ["capacitanceF"], and candidate passes ["chargeC"]!
    const emRendered = emAdapter.renderSvg!(
      {
        kind: "parallel-plate-capacitor",
        plateAreaM2: 0.01,
        plateSeparationM: 0.001,
        voltageV: 12,
        hiddenQuantities: ["capacitanceF"],
      },
      { hiddenQuantities: ["chargeC"] },
    );
    expect(emRendered!.svgMarkup).toContain("C=? Q=?");
    expect(emRendered!.svgMarkup).not.toContain("1.06e-9");
    expect(capturedEmOpts).toEqual({
      hiddenQuantities: ["capacitanceF", "chargeC"],
    });

    // 2. WAVES mock: validate(spec: unknown) with errors, narrow literal HiddenQuantityId[] in render options
    type MockWaveHiddenId = "wavelengthM" | "waveSpeedMs";
    interface MockWaveSpec {
      kind: "progressive-wave";
      frequencyHz: number;
      wavelengthM: number;
    }
    interface MockWaveRenderOptions {
      width?: number;
      hiddenQuantities?: readonly MockWaveHiddenId[];
    }
    registerVisualModule("waves", {
      validate: (spec: unknown) => {
        const s = spec as Partial<MockWaveSpec>;
        return typeof s.frequencyHz === "number" && s.frequencyHz > 0
          ? { valid: true, errors: [] }
          : { valid: false, errors: ["frequencyHz must be > 0"] };
      },
      solve: (spec: MockWaveSpec) => ({
        kind: "progressive-wave" as const,
        wavelengthM: spec.wavelengthM,
        waveSpeedMs: spec.frequencyHz * spec.wavelengthM,
        quantities: {
          wavelengthM: spec.wavelengthM,
          waveSpeedMs: spec.frequencyHz * spec.wavelengthM,
        },
      }),
      render: (spec: MockWaveSpec, options: MockWaveRenderOptions = {}) => {
        const hidden = new Set<string>(options.hiddenQuantities ?? []);
        const speedText = hidden.has("waveSpeedMs")
          ? "v = ?"
          : `v = ${spec.frequencyHz * spec.wavelengthM} m/s`;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><line x1="0" y1="100" x2="400" y2="100"/><text x="50" y="50">${speedText}</text></svg>`;
      },
    });

    const wavesAdapter = getDomainAdapter("waves");
    expect(wavesAdapter.validateScenario({ frequencyHz: 0 }).valid).toBe(false);
    const wavesSolved = wavesAdapter.solveScenario({
      kind: "progressive-wave",
      frequencyHz: 50,
      wavelengthM: 6.8,
    });
    expect(wavesSolved.quantities.waveSpeedMs).toBeCloseTo(340, 6);
    const wavesSvg = wavesAdapter.renderSvg!(
      { kind: "progressive-wave", frequencyHz: 50, wavelengthM: 6.8 },
      { hiddenQuantities: ["waveSpeedMs"] },
    );
    expect(wavesSvg!.svgMarkup).toContain("v = ?");
    expect(wavesSvg!.svgMarkup).not.toContain("340");

    // 3. GRAV-ASTRO mock: { quantities, classifications, curves, details } + visibility.hiddenQuantities + options.hiddenQuantities
    interface MockGravSpec {
      kind: "circular-orbit-energy";
      orbitRadiusM: number;
      hiddenQuantities?: readonly string[];
      visibility?: { hiddenQuantities?: readonly string[] };
    }
    registerVisualModule("grav-astro", {
      validate: (spec: MockGravSpec) => ({
        valid: spec.orbitRadiusM > 0,
        issues: spec.orbitRadiusM > 0 ? [] : [{ message: "orbitRadiusM <= 0" }],
      }),
      solve: (spec: MockGravSpec) => ({
        kind: "circular-orbit-energy" as const,
        quantities: {
          orbitalSpeedMs: Math.sqrt(3.986e14 / spec.orbitRadiusM),
        },
        classifications: {
          boundOrbit: true,
          regime: "low-earth",
        },
        curves: {
          energy: [
            { x: 1, y: -10 },
            { x: 2, y: -5 },
          ],
        },
        details: {
          escapeSpeedMs: Math.sqrt((2 * 3.986e14) / spec.orbitRadiusM),
        },
      }),
      render: (
        spec: MockGravSpec,
        options: { hiddenQuantities?: readonly string[] } = {},
      ) => {
        const hidden = new Set([
          ...(spec.visibility?.hiddenQuantities ?? []),
          ...(options.hiddenQuantities ?? []),
        ]);
        const txt =
          hidden.has("orbitalSpeedMs") && hidden.has("escapeSpeedMs")
            ? "speeds hidden"
            : "speed leaked";
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><circle cx="200" cy="100" r="60"/><text x="20" y="30">${txt}</text></svg>`;
      },
    });

    const gravAdapter = getDomainAdapter("grav-astro");
    const gravSolved = gravAdapter.solveScenario({
      kind: "circular-orbit-energy",
      orbitRadiusM: 7.0e6,
    });
    expect(gravSolved.quantities.orbitalSpeedMs).toBeCloseTo(
      Math.sqrt(3.986e14 / 7.0e6),
      4,
    );
    expect(gravSolved.quantities.escapeSpeedMs).toBeCloseTo(
      Math.sqrt((2 * 3.986e14) / 7.0e6),
      4,
    );
    expect(gravSolved.quantities.regime).toBe("low-earth");
    expect(gravSolved.quantities.boundOrbit).toBe(true);

    const gravSvg = gravAdapter.renderSvg!(
      {
        kind: "circular-orbit-energy",
        orbitRadiusM: 7.0e6,
        visibility: { hiddenQuantities: ["orbitalSpeedMs"] },
      },
      { hiddenQuantities: ["escapeSpeedMs"] },
    );
    expect(gravSvg!.svgMarkup).toContain("speeds hidden");

    // 4. QUANTUM-NUCLEAR mock: top-level & nested solution fields without .quantities, readonly QuantumNuclearRenderOptions { width?, height? }
    interface MockQuantumSpec {
      readonly kind: "matter-waves";
      readonly acceleratingVoltageV: number;
      readonly hiddenQuantities?: readonly string[];
    }
    interface MockQuantumRenderOptions {
      readonly width?: number;
      readonly height?: number;
    }
    registerVisualModule("quantum-nuclear", {
      validate: (spec: MockQuantumSpec) => ({
        valid: spec.acceleratingVoltageV > 0,
        issues:
          spec.acceleratingVoltageV > 0
            ? []
            : [
                {
                  code: "V_NON_POS",
                  path: "acceleratingVoltageV",
                  message: "must be > 0",
                },
              ],
      }),
      solve: (spec: MockQuantumSpec) => ({
        kind: "matter-waves" as const,
        acceleratingVoltageV: spec.acceleratingVoltageV,
        deBroglieWavelengthNm: 1.226 / Math.sqrt(spec.acceleratingVoltageV),
        diffraction: {
          firstOrderAngleDeg: 14.5,
        },
        levels: [{ id: "n1", energyEv: -13.6 }],
      }),
      render: (
        spec: MockQuantumSpec,
        options: MockQuantumRenderOptions = {},
      ) => {
        const w = options.width ?? 720;
        const h = options.height ?? 460;
        const hidden = new Set(spec.hiddenQuantities ?? []);
        const label =
          hidden.has("deBroglieWavelengthNm") &&
          hidden.has("firstOrderAngleDeg")
            ? `V = ${spec.acceleratingVoltageV} V`
            : "λ = 0.123 nm, θ = 14.5°";
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><line x1="10" y1="10" x2="200" y2="10"/><text x="30" y="50">${label}</text></svg>`;
      },
    });

    const qnGate = verifyCandidateWithGate({
      id: "sp-qn-mcq-reg",
      conceptId: "matter-waves",
      templateArchetype: "electron-diffraction-wavelength",
      seed: 777,
      syllabi: [{ syllabus: "ib", level: "HL", topicId: "E.1" }],
      format: "mcq",
      difficulty: "standard",
      domain: "quantum-nuclear",
      scenarioSpec: {
        kind: "matter-waves",
        acceleratingVoltageV: 100,
        hiddenQuantities: ["firstOrderAngleDeg"],
      },
      hiddenQuantities: ["deBroglieWavelengthNm"],
      targetQuantityKey: "deBroglieWavelengthNm",
      stem: "Electrons are accelerated from rest through a potential difference of 100 V. What is their de Broglie wavelength?",
      options: [
        { label: "A", text: "0.123 nm", isCorrect: true },
        {
          label: "B",
          text: "1.23 nm",
          isCorrect: false,
          distractorRationale: "Forgets to take the square root of 100 V.",
        },
        {
          label: "C",
          text: "0.0123 nm",
          isCorrect: false,
          distractorRationale: "Divides by 100 instead of √100.",
        },
        {
          label: "D",
          text: "2.45 nm",
          isCorrect: false,
          distractorRationale: "Doubles the numerator constant.",
        },
      ],
      workedSolution: "λ = 1.226 / √100 = 0.123 nm.",
      markScheme: [{ code: "A1", criterion: "Obtains 0.123 nm (A).", marks: 1 }],
      totalMarks: 1,
    });
    expect(qnGate.evaluation.valid).toBe(true);
    expect(qnGate.effectiveSvgMarkup).toContain("V = 100 V");
    expect(qnGate.effectiveSvgMarkup).not.toContain("0.123");
    expect(qnGate.effectiveSvgMarkup).not.toContain("14.5");
  });
});
