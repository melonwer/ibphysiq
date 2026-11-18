import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildDistillationTrace,
  buildFamilyGroupKey,
  buildSampleCandidates,
  CandidateQuestionInput,
  checkSvgHiddenQuantityLeaks,
  CompiledBankSummary,
  evaluateCandidatePackage,
  generateAllDomainCandidates,
  getDomainAdapter,
  inspectSvgSanity,
  listRegisteredDomains,
  parseFrozenManifest,
  PHYSICS_DOMAIN_IDS,
  PhysicsDomainId,
  planWorkOrders,
  PURE_CALCULATION_CONCEPT_CATALOGUE,
  readShardRecords,
  resetDomainRegistryToDefaults,
  SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
  SixthPhysicsBankItem,
  validateQwenDistillationTrace,
  WorkOrderManifest,
} from "@/lib/bank-pipeline";
import {
  getCrosswalkEntry,
  getGeneratableSlices,
  getSubtopicById,
  getTopicById,
} from "@/lib/constants/syllabi";

import { runCompileBankCli } from "../../../scripts/bank-generation/compile-bank";
import { runGenerateFullBankCli } from "../../../scripts/bank-generation/generate-full-bank";
import { runPlanWorkOrdersCli } from "../../../scripts/bank-generation/plan-work-orders";
import { runVerifyAndIngestCli } from "../../../scripts/bank-generation/verify-and-ingest-shard";

const ALL_TEN_VISUAL_DOMAINS: readonly PhysicsDomainId[] = [
  "graphs",
  "circuits",
  "fields",
  "mechanics",
  "waves",
  "optics-shm",
  "thermal",
  "grav-astro",
  "em-induction",
  "quantum-nuclear",
];

describe("Wave 1 unified 10-domain + 3-syllabus harness integration", () => {
  let tempRoot: string;

  beforeEach(() => {
    resetDomainRegistryToDefaults();
    tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "sixthphysics-all-domains-"),
    );
  });

  afterEach(() => {
    resetDomainRegistryToDefaults();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("registers all 10 visual domains + pure-calculation by default and evaluates + builds Qwen/Qwen3.5-9B traces for every domain", () => {
    const registered = listRegisteredDomains();
    expect(registered).toEqual([...PHYSICS_DOMAIN_IDS]);
    expect(registered).toHaveLength(11);

    const samples = buildSampleCandidates();
    const coveredDomains = new Set<PhysicsDomainId>(
      samples.map((c) => c.domain),
    );
    expect([...coveredDomains].sort()).toEqual([...PHYSICS_DOMAIN_IDS].sort());

    for (const domain of PHYSICS_DOMAIN_IDS) {
      const domainCandidates = samples.filter((c) => c.domain === domain);
      expect(domainCandidates.length).toBeGreaterThanOrEqual(1);

      for (const candidate of domainCandidates) {
        const exec = evaluateCandidatePackage(candidate);
        expect({
          id: candidate.id,
          domain: candidate.domain,
          valid: exec.evaluation.valid,
          issues: exec.evaluation.issues,
        }).toEqual({
          id: candidate.id,
          domain: candidate.domain,
          valid: true,
          issues: [],
        });

        expect(exec.solveOutput).toBeDefined();
        expect(
          Object.keys(exec.solveOutput!.quantities).length,
        ).toBeGreaterThan(0);

        if (domain === "pure-calculation") {
          expect(exec.effectiveSvgMarkup).toBeUndefined();
          expect(exec.evaluation.passedChecks).toContain("figureless-verified");
        } else {
          expect(exec.effectiveSvgMarkup).toBeDefined();
          expect(exec.evaluation.passedChecks).toContain(
            "svg-sanity-and-non-leakage",
          );

          const sanity = inspectSvgSanity(exec.effectiveSvgMarkup!);
          expect(sanity.valid).toBe(true);

          const publicNums = Object.entries(candidate.scenarioSpec)
            .filter(
              ([k, v]) =>
                !candidate.hiddenQuantities.includes(k) &&
                typeof v === "number" &&
                Number.isFinite(v),
            )
            .map(([, v]) => v as number);

          const leaks = checkSvgHiddenQuantityLeaks({
            svgMarkup: exec.effectiveSvgMarkup!,
            hiddenQuantities: candidate.hiddenQuantities,
            verifiedQuantities: exec.solveOutput!.quantities,
            publicNumbers: [
              ...(exec.renderOutput?.publicNumbers ?? []),
              ...(exec.solveOutput?.publicNumbers ?? []),
              ...publicNums,
            ],
            publicLabels: [
              ...(exec.renderOutput?.publicLabels ?? []),
              ...(exec.solveOutput?.publicLabels ?? []),
            ],
          });
          expect(leaks).toEqual([]);
        }

        // Construct BankItem & verify two-step QwenDistillationTrace
        const familyGroupKey = buildFamilyGroupKey({
          conceptId: candidate.conceptId,
          templateArchetype: candidate.templateArchetype,
          sourceParentId: candidate.sourceParentId,
        });
        const bankItem: SixthPhysicsBankItem = {
          schemaVersion: SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
          id: candidate.id,
          familyGroupKey,
          syllabi: candidate.syllabi,
          format: candidate.format,
          difficulty: candidate.difficulty,
          visualFamily:
            exec.renderOutput?.visualFamily ??
            (domain === "pure-calculation" ? "none" : domain),
          stem: candidate.stem,
          ...(exec.effectiveSvgMarkup
            ? { svgMarkup: exec.effectiveSvgMarkup }
            : {}),
          ...(candidate.format === "mcq" && candidate.options
            ? {
                options: candidate.options as [
                  SixthPhysicsBankItem["options"] extends
                    | [infer A, unknown, unknown, unknown]
                    | undefined
                    ? A
                    : never,
                  SixthPhysicsBankItem["options"] extends
                    | [unknown, infer B, unknown, unknown]
                    | undefined
                    ? B
                    : never,
                  SixthPhysicsBankItem["options"] extends
                    | [unknown, unknown, infer C, unknown]
                    | undefined
                    ? C
                    : never,
                  SixthPhysicsBankItem["options"] extends
                    | [unknown, unknown, unknown, infer D]
                    | undefined
                    ? D
                    : never,
                ],
                correctOptionIndex: exec.correctOptionIndex,
              }
            : {}),
          ...(candidate.format === "structured" && candidate.parts
            ? { parts: candidate.parts }
            : {}),
          workedSolution: candidate.workedSolution,
          markScheme: candidate.markScheme,
          totalMarks: candidate.totalMarks,
          verifiedQuantities: exec.solveOutput!.quantities,
          provenance: {
            domain: candidate.domain,
            conceptId: candidate.conceptId,
            templateArchetype: candidate.templateArchetype,
            familyGroupKey,
            seed: candidate.seed,
            shardId: "test-all-domains",
            generatorModel: "Gemini 4 Carbon (High)",
            solverId: exec.solveOutput!.solverId,
            ...(exec.renderOutput?.rendererVersion
              ? { rendererVersion: exec.renderOutput.rendererVersion }
              : {}),
            stemFingerprint: exec.evaluation.stemFingerprint,
            ...(exec.evaluation.svgFingerprint
              ? { svgFingerprint: exec.evaluation.svgFingerprint }
              : {}),
            split: "train",
            createdAt: "2026-11-17T21:30:00.000Z",
          },
        };

        const trace = buildDistillationTrace({
          candidate,
          bankItem,
          split: "train",
          publicVisualLabels: exec.renderOutput?.publicLabels,
        });
        const traceValidation = validateQwenDistillationTrace(trace);
        expect({
          id: candidate.id,
          valid: traceValidation.valid,
          issues: traceValidation.issues,
        }).toEqual({
          id: candidate.id,
          valid: true,
          issues: [],
        });

        expect(trace.targetModel).toBe("Qwen/Qwen3.5-9B");
        expect(trace.messages).toHaveLength(5);
        expect(trace.messages[2].step).toBe("propose_scenario");
        expect(trace.messages[3].name).toBe("physics_harness");
        expect(trace.messages[4].step).toBe("author_package");

        const step1Payload = JSON.parse(trace.messages[2].content) as {
          action: string;
          domain: string;
          scenarioSpec: Record<string, unknown>;
          hiddenQuantities: string[];
        };
        expect(step1Payload.action).toBe("solve_and_render_scenario");
        expect(step1Payload.domain).toBe(domain);

        const toolPayload = JSON.parse(trace.messages[3].content) as {
          status: string;
          verifiedQuantities: Record<string, unknown>;
          visualReceipt: { rendered: boolean };
        };
        expect(toolPayload.status).toBe("verified");
        expect(toolPayload.visualReceipt.rendered).toBe(
          domain !== "pure-calculation",
        );

        const step2Payload = JSON.parse(trace.messages[4].content) as {
          stem: string;
          workedSolution: string;
        };
        expect(step2Payload.stem).toBe(candidate.stem);
      }
    }
  });

  it("ingests and compiles all 11 domains end-to-end via verify-and-ingest-shard and compile-bank CLIs", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const candidatesPath = path.join(tempRoot, "all-domains-candidates.json");
      const shardsDir = path.join(tempRoot, "shards");
      const compiledDir = path.join(tempRoot, "compiled");

      expect(runVerifyAndIngestCli(["--emit-sample", candidatesPath])).toBe(0);
      expect(
        runVerifyAndIngestCli(["--solve-only", "--input", candidatesPath]),
      ).toBe(0);
      expect(
        runVerifyAndIngestCli([
          "--shard",
          "wave1-unified-11domains",
          "--shards-dir",
          shardsDir,
          "--input",
          candidatesPath,
        ]),
      ).toBe(0);

      const shardRecords = readShardRecords(
        shardsDir,
        "wave1-unified-11domains",
      );
      expect(shardRecords).toHaveLength(15);

      const shardDomainSet = new Set(
        shardRecords.map((r) => r.bankItem.provenance.domain),
      );
      expect([...shardDomainSet].sort()).toEqual(
        [...PHYSICS_DOMAIN_IDS].sort(),
      );

      expect(
        runCompileBankCli([
          "--shards-dir",
          shardsDir,
          "--out-dir",
          compiledDir,
        ]),
      ).toBe(0);

      const summary = JSON.parse(
        fs.readFileSync(path.join(compiledDir, "SUMMARY.json"), "utf8"),
      ) as CompiledBankSummary;
      expect(summary.totalCompiledItems).toBe(15);
      expect(summary.splitSummary.zeroContaminationVerified).toBe(true);

      for (const domain of PHYSICS_DOMAIN_IDS) {
        expect(summary.coverageByDomain[domain].total).toBeGreaterThanOrEqual(
          1,
        );
        const domainBundlePath = path.join(
          compiledDir,
          "bank",
          "by-domain",
          `${domain}.json`,
        );
        expect(fs.existsSync(domainBundlePath)).toBe(true);
      }
    } finally {
      logSpy.mockRestore();
    }
  });

  it("verifies viewport-control scenarios across waves, optics-shm (A-Level thin lens), thermal, grav-astro, em-induction (RC), and quantum-nuclear (Bohr levels)", () => {
    const extraWave2StyleCandidates: CandidateQuestionInput[] = [
      // Waves progressive wave with cosmetic cyclesShown
      {
        id: "int-waves-prog-001",
        conceptId: "progressive-waves-polarization",
        templateArchetype: "progressive-wave-speed-from-f-lambda",
        seed: 201001,
        syllabi: [
          {
            syllabus: "ib",
            level: "SL",
            topicId: "ib-theme-c",
            subtopicId: "ib-c2-wave-model",
          },
        ],
        format: "mcq",
        difficulty: "foundation",
        domain: "waves",
        scenarioSpec: {
          kind: "progressive-wave",
          profileKind: "displacement-position",
          amplitudeM: 0.04,
          wavelengthM: 0.5,
          frequencyHz: 15,
          direction: "right",
          cyclesShown: 2.5,
        },
        hiddenQuantities: [
          "waveSpeedMs",
          "periodS",
          "angularFrequencyRadS",
          "wavenumberRadM",
          "crestToTroughM",
        ],
        targetQuantityKey: "waveSpeedMs",
        stem: "A progressive transverse wave of amplitude 0.04 m and wavelength 0.5 m travels to the right at a frequency of 15 Hz. What is the speed of the wave?",
        options: [
          {
            label: "A",
            text: "0.600 m s⁻¹",
            isCorrect: false,
            distractorRationale:
              "Multiplies frequency by amplitude instead of wavelength.",
          },
          { label: "B", text: "7.50 m s⁻¹", isCorrect: true },
          {
            label: "C",
            text: "15.5 m s⁻¹",
            isCorrect: false,
            distractorRationale: "Adds frequency and wavelength.",
          },
          {
            label: "D",
            text: "30.0 m s⁻¹",
            isCorrect: false,
            distractorRationale:
              "Divides frequency by wavelength instead of multiplying.",
          },
        ],
        workedSolution: "v = fλ = 15 × 0.5 = 7.50 m s⁻¹.",
        markScheme: [
          {
            code: "A1",
            criterion: "Uses v = fλ = 15 × 0.5 = 7.50 m s⁻¹ (B).",
            marks: 1,
          },
        ],
        totalMarks: 1,
      },
      // A-Level Y13 thin lens (excluded from IB 2025 & NCUK)
      {
        id: "int-optics-lens-002",
        conceptId: "thin-lenses-geometric-optics",
        templateArchetype: "converging-lens-real-image-distance",
        seed: 201002,
        syllabi: [
          {
            syllabus: "alevel",
            level: "Y13",
            topicId: "alevel-options-9-13",
            subtopicId: "alevel-3-9-astrophysics",
          },
        ],
        format: "mcq",
        difficulty: "standard",
        domain: "optics-shm",
        scenarioSpec: {
          kind: "thin-lens",
          lensType: "converging",
          focalLengthM: 0.15,
          objectDistanceM: 0.3,
          objectHeightM: 0.04,
        },
        hiddenQuantities: [
          "imageDistanceM",
          "magnification",
          "absMagnification",
          "imageHeightM",
          "objectImageSeparationM",
          "opticalPowerD",
        ],
        targetQuantityKey: "opticalPowerD",
        stem: "An object of height 0.04 m is placed 0.3 m in front of a thin converging lens of focal length 0.15 m. What is the optical power of the lens?",
        options: [
          {
            label: "A",
            text: "3.33 D",
            isCorrect: false,
            distractorRationale:
              "Computes the reciprocal of the object distance 1 / 0.30 instead of 1 / f.",
          },
          { label: "B", text: "6.67 D", isCorrect: true },
          {
            label: "C",
            text: "10.0 D",
            isCorrect: false,
            distractorRationale: "Adds 1/u + 1/f instead of computing 1/f.",
          },
          {
            label: "D",
            text: "25.0 D",
            isCorrect: false,
            distractorRationale:
              "Computes the reciprocal of the object height 1 / 0.04.",
          },
        ],
        workedSolution: "Optical power P = 1 / f = 1 / 0.15 = 6.67 D.",
        markScheme: [
          {
            code: "A1",
            criterion: "Computes P = 1 / 0.15 = 6.67 D (B).",
            marks: 1,
          },
        ],
        totalMarks: 1,
      },
      // EM-induction RC transient (with cosmetic durationTimeConstants)
      {
        id: "int-em-rc-003",
        conceptId: "capacitor-rc-decay",
        templateArchetype: "rc-charging-time-constant",
        seed: 201003,
        syllabi: [
          {
            syllabus: "alevel",
            level: "Y13",
            topicId: "alevel-sec7-fields-consequences",
            subtopicId: "alevel-3-7-4-capacitance",
          },
          {
            syllabus: "ncuk",
            level: "IFY-S1",
            topicId: "ncuk-ac4",
            subtopicId: "ncuk-ac4-4",
          },
        ],
        format: "mcq",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: {
          kind: "rc-transient",
          mode: "charging",
          resistanceOhm: 2000,
          capacitanceF: 5.0e-5,
          supplyVoltageV: 12,
          queryTimeS: 0.2,
          durationTimeConstants: 5,
        },
        hiddenQuantities: [
          "timeConstantS",
          "halfLifeS",
          "initialCurrentA",
          "finalChargeC",
          "finalEnergyJ",
          "capacitorVoltageAtQueryV",
          "resistorVoltageAtQueryV",
          "currentAtQueryA",
          "chargeAtQueryC",
          "storedEnergyAtQueryJ",
        ],
        targetQuantityKey: "timeConstantS",
        stem: "An uncharged 50 μF capacitor is charged from a 12 V DC supply through a 2.0 kΩ series resistor, and its state is sampled at t = 0.2 s. What is the RC time constant of the circuit?",
        options: [
          { label: "A", text: "0.100 s", isCorrect: true },
          {
            label: "B",
            text: "0.0693 s",
            isCorrect: false,
            distractorRationale:
              "Multiplies RC by ln 2, finding the half-time t_{1/2} instead of τ = RC.",
          },
          {
            label: "C",
            text: "1.20 s",
            isCorrect: false,
            distractorRationale:
              "Multiplies RC by the 12 V supply emf.",
          },
          {
            label: "D",
            text: "4.00 × 10⁷ s",
            isCorrect: false,
            distractorRationale:
              "Divides R by C instead of multiplying R by C.",
          },
        ],
        workedSolution:
          "τ = RC = (2.0 × 10³ Ω)(5.0 × 10⁻⁵ F) = 0.100 s.",
        markScheme: [
          {
            code: "A1",
            criterion: "Calculates τ = RC = 2000 × 5.0 × 10⁻⁵ = 0.100 s (A).",
            marks: 1,
          },
        ],
        totalMarks: 1,
      },
      // Thermal Carnot cycle (IB HL & A-Level Option 3.11)
      {
        id: "int-thermal-carnot-004",
        conceptId: "thermodynamics-entropy-engines",
        templateArchetype: "carnot-engine-efficiency-from-reservoirs",
        seed: 201004,
        syllabi: [
          {
            syllabus: "ib",
            level: "HL",
            topicId: "ib-theme-b",
            subtopicId: "ib-b4-thermodynamics",
          },
        ],
        format: "mcq",
        difficulty: "standard",
        domain: "thermal",
        scenarioSpec: {
          kind: "carnot-cycle",
          moles: 0.5,
          hotTemperatureK: 600,
          coldTemperatureK: 360,
          initialVolumeM3: 0.002,
          isothermalExpansionVolumeM3: 0.006,
        },
        hiddenQuantities: [
          "carnotEfficiency",
          "thermalEfficiency",
          "netWorkJ",
          "totalWorkJ",
          "netHeatJ",
          "totalHeatJ",
          "heatInputJ",
          "heatRejectedJ",
        ],
        targetQuantityKey: "carnotEfficiency",
        stem: "An ideal monatomic gas (0.5 mol) operates in a reversible Carnot heat-engine cycle between a hot reservoir at 600 K and a cold reservoir at 360 K, expanding isothermally from 0.002 m³ to 0.006 m³. What is the thermal efficiency of the Carnot cycle?",
        options: [
          {
            label: "A",
            text: "0.250",
            isCorrect: false,
            distractorRationale:
              "Uses volume ratio instead of absolute temperature ratio.",
          },
          { label: "B", text: "0.400", isCorrect: true },
          {
            label: "C",
            text: "0.600",
            isCorrect: false,
            distractorRationale:
              "Computes T_C / T_H = 360 / 600 without subtracting from 1.",
          },
          {
            label: "D",
            text: "0.667",
            isCorrect: false,
            distractorRationale:
              "Computes (T_H − T_C) / T_C instead of (T_H − T_C) / T_H.",
          },
        ],
        workedSolution: "η_Carnot = 1 − T_C / T_H = 1 − 360 / 600 = 0.400.",
        markScheme: [
          {
            code: "A1",
            criterion: "Evaluates 1 − 360 / 600 = 0.400 (B).",
            marks: 1,
          },
        ],
        totalMarks: 1,
      },
      // Grav-astro conical pendulum
      {
        id: "int-grav-conical-005",
        conceptId: "uniform-circular-motion",
        templateArchetype: "conical-pendulum-string-tension",
        seed: 201005,
        syllabi: [
          {
            syllabus: "ib",
            level: "SL",
            topicId: "ib-theme-a",
            subtopicId: "ib-a2-forces-momentum",
          },
        ],
        format: "mcq",
        difficulty: "standard",
        domain: "grav-astro",
        scenarioSpec: {
          kind: "conical-pendulum",
          massKg: 0.5,
          stringLengthM: 1.25,
          semiVerticalAngleDeg: 36.87,
          gravityMs2: 9.8,
        },
        hiddenQuantities: [
          "orbitRadiusM",
          "verticalHeightM",
          "weightN",
          "tensionN",
          "centripetalForceN",
          "centripetalAccelMs2",
          "linearSpeedMs",
          "angularSpeedRadS",
          "periodS",
          "frequencyHz",
        ],
        targetQuantityKey: "tensionN",
        stem: "A bob of mass 0.5 kg suspended from a light inextensible string of length 1.25 m whirls in a horizontal circle as a conical pendulum with a semi-vertical angle of 36.87°. Take g = 9.8 m s⁻². What is the tension in the string?",
        options: [
          {
            label: "A",
            text: "3.92 N",
            isCorrect: false,
            distractorRationale:
              "Multiplies mg by cos 36.87° instead of dividing by cos 36.87°.",
          },
          {
            label: "B",
            text: "4.90 N",
            isCorrect: false,
            distractorRationale:
              "Equates tension directly to weight mg without accounting for the angle.",
          },
          { label: "C", text: "6.13 N", isCorrect: true },
          {
            label: "D",
            text: "8.17 N",
            isCorrect: false,
            distractorRationale:
              "Divides mg by sin 36.87° instead of cos 36.87°.",
          },
        ],
        workedSolution:
          "Vertical equilibrium gives T cos θ = mg, so T = (0.5 × 9.8) / cos 36.87° = 4.90 / 0.800 = 6.125 N ≈ 6.13 N.",
        markScheme: [
          {
            code: "A1",
            criterion:
              "Resolves vertically T cos 36.87° = mg to obtain 6.13 N (C).",
            marks: 1,
          },
        ],
        totalMarks: 1,
      },
      // Quantum-nuclear Bohr hydrogen energy levels (with cosmetic maxPrincipalN)
      {
        id: "int-qn-bohr-006",
        conceptId: "atomic-spectra-energy-levels",
        templateArchetype: "hydrogen-ionization-wavelength",
        seed: 201006,
        syllabi: [
          {
            syllabus: "ib",
            level: "SL",
            topicId: "ib-theme-e",
            subtopicId: "ib-e1-structure-atom",
          },
        ],
        format: "mcq",
        difficulty: "standard",
        domain: "quantum-nuclear",
        scenarioSpec: {
          kind: "energy-levels",
          atomModel: "bohr-hydrogen",
          atomicNumberZ: 1,
          maxPrincipalN: 4,
          includeContinuumZero: true,
          transitions: [
            { id: "t1", fromLevelId: "n=2", toLevelId: "n=1", label: "Lα" },
          ],
        },
        hiddenQuantities: [
          "ionizationFrequencyHz",
          "ionizationWavelengthM",
          "ionizationWavelengthNm",
        ],
        targetQuantityKey: "ionizationWavelengthNm",
        stem: "The Bohr energy-level diagram for atomic hydrogen (Z = 1) has a ground-state energy of −13.6 eV relative to the ionization continuum. Take h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, and e = 1.60 × 10⁻¹⁹ C. What is the maximum photon wavelength capable of ionizing a hydrogen atom from its ground state?",
        options: [
          { label: "A", text: "91.4 nm", isCorrect: true },
          {
            label: "B",
            text: "122 nm",
            isCorrect: false,
            distractorRationale:
              "Calculates the Lyman-alpha n = 2 → 1 wavelength instead of the n = 1 → ∞ continuum limit.",
          },
          {
            label: "C",
            text: "366 nm",
            isCorrect: false,
            distractorRationale:
              "Calculates the Balmer n = 2 ionization threshold instead of the n = 1 ground state.",
          },
          {
            label: "D",
            text: "656 nm",
            isCorrect: false,
            distractorRationale:
              "Selects the visible H-alpha Balmer line instead of the Lyman continuum limit.",
          },
        ],
        workedSolution:
          "Ionization requires ΔE = 13.6 eV = 13.6 × 1.60 × 10⁻¹⁹ = 2.176 × 10⁻¹⁸ J, so λ_max = hc / ΔE = (6.63 × 10⁻³⁴ × 3.00 × 10⁸) / 2.176 × 10⁻¹⁸ = 9.14 × 10⁻⁸ m = 91.4 nm.",
        markScheme: [
          {
            code: "A1",
            criterion:
              "Uses λ = hc / ΔE = (6.63 × 10⁻³⁴ × 3.00 × 10⁸) / 2.176 × 10⁻¹⁸ = 91.4 nm (A).",
            marks: 1,
          },
        ],
        totalMarks: 1,
      },
    ];

    for (const candidate of extraWave2StyleCandidates) {
      const exec = evaluateCandidatePackage(candidate);
      expect({
        id: candidate.id,
        valid: exec.evaluation.valid,
        issues: exec.evaluation.issues,
      }).toEqual({
        id: candidate.id,
        valid: true,
        issues: [],
      });
    }
  });

  it("plans spec-accurate 3-syllabus work orders across all 10 visual domains and never assigns excluded topics", () => {
    const fullManifest = planWorkOrders({ itemsPerSlice: 10, baseSeed: 100_000 });
    const coreManifest = planWorkOrders({
      itemsPerSlice: 10,
      baseSeed: 100_000,
      includeOptionTopics: false,
    });

    expect(fullManifest.totalSlices).toBe(
      getGeneratableSlices({ includeOptionTopics: true }).length,
    );
    expect(fullManifest.totalSlices).toBe(539);
    expect(coreManifest.totalSlices).toBe(
      getGeneratableSlices({ includeOptionTopics: false }).length,
    );
    expect(coreManifest.totalSlices).toBe(532);

    // Every one of the 10 visual domains is planned
    const plannedDomains = new Set(fullManifest.slices.map((s) => s.domain));
    expect([...plannedDomains].sort()).toEqual([...ALL_TEN_VISUAL_DOMAINS].sort());

    // Exact levels per syllabus
    const levelsBySyllabus = {
      ib: new Set(
        fullManifest.slices
          .filter((s) => s.syllabus === "ib")
          .map((s) => s.level),
      ),
      alevel: new Set(
        fullManifest.slices
          .filter((s) => s.syllabus === "alevel")
          .map((s) => s.level),
      ),
      ncuk: new Set(
        fullManifest.slices
          .filter((s) => s.syllabus === "ncuk")
          .map((s) => s.level),
      ),
    };
    expect([...levelsBySyllabus.ib].sort()).toEqual(["HL", "SL"]);
    expect([...levelsBySyllabus.alevel].sort()).toEqual(["Y12", "Y13"]);
    expect([...levelsBySyllabus.ncuk].sort()).toEqual(["IFY", "IFY-S1", "IFY-S2"]);

    // Verify EVERY slice against official crosswalk & syllabus subtopic catalogues
    for (const slice of fullManifest.slices) {
      const entry = getCrosswalkEntry(slice.conceptId);
      expect(entry).toBeDefined();
      const mapping = entry!.mappings[slice.syllabus];
      expect(mapping.included).toBe(true);
      expect(mapping.levels).toContain(slice.level);
      expect(mapping.questionFormats).toContain(slice.format);

      const topic = getTopicById(slice.topicId);
      expect(topic).toBeDefined();
      expect(topic!.syllabus).toBe(slice.syllabus);

      expect(slice.subtopicId).toBeDefined();
      const subtopic = getSubtopicById(slice.subtopicId!);
      expect(subtopic).toBeDefined();
      expect(subtopic!.levelsCovered).toContain(slice.level);
      expect(subtopic!.questionFormats).toContain(slice.format);
    }

    // Explicit syllabus-boundary exclusion guards:
    // 1. Thin lenses NEVER assigned to IB 2025 or NCUK IFY (only UK A-Level Y13)
    const thinLensSlices = fullManifest.slices.filter(
      (s) => s.conceptId === "thin-lenses-geometric-optics",
    );
    expect(thinLensSlices.length).toBeGreaterThan(0);
    expect(thinLensSlices.every((s) => s.syllabus === "alevel")).toBe(true);
    expect(
      fullManifest.slices.filter(
        (s) =>
          (s.syllabus === "ib" || s.syllabus === "ncuk") &&
          s.conceptId === "thin-lenses-geometric-optics",
      ),
    ).toEqual([]);

    // 2. Capacitors & RC decay NEVER assigned to IB 2025
    expect(
      fullManifest.slices.filter(
        (s) =>
          s.syllabus === "ib" &&
          (s.conceptId === "capacitor-networks-energy" ||
            s.conceptId === "capacitor-rc-decay"),
      ),
    ).toEqual([]);
    expect(
      fullManifest.slices.filter(
        (s) =>
          (s.syllabus === "alevel" || s.syllabus === "ncuk") &&
          (s.conceptId === "capacitor-networks-energy" ||
            s.conceptId === "capacitor-rc-decay"),
      ).length,
    ).toBeGreaterThan(0);

    // 3. Quarks/leptons NEVER assigned to IB 2025
    expect(
      fullManifest.slices.filter(
        (s) =>
          s.syllabus === "ib" &&
          s.conceptId === "fundamental-particles-quarks-leptons",
      ),
    ).toEqual([]);

    // 4. IB HL-only concepts NEVER assigned to IB SL
    for (const hlOnlyConcept of [
      "special-relativity-spacetime",
      "rigid-body-rotational-dynamics",
      "thermodynamics-entropy-engines",
      "electromagnetic-induction-faraday-lenz",
      "photoelectric-effect",
    ]) {
      expect(
        fullManifest.slices.filter(
          (s) =>
            s.syllabus === "ib" &&
            s.level === "SL" &&
            s.conceptId === hlOnlyConcept,
        ),
      ).toEqual([]);
      expect(
        fullManifest.slices.filter(
          (s) =>
            s.syllabus === "ib" &&
            s.level === "HL" &&
            s.conceptId === hlOnlyConcept,
        ).length,
      ).toBeGreaterThan(0);
    }

    // 5. CLI --levels & --exclude-options smoke check
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const ibSlOut = path.join(tempRoot, "ib-sl-orders.json");
      expect(
        runPlanWorkOrdersCli([
          "--syllabi",
          "ib",
          "--levels",
          "SL",
          "--exclude-options",
          "--output",
          ibSlOut,
        ]),
      ).toBe(0);
      const ibSlManifest = JSON.parse(
        fs.readFileSync(ibSlOut, "utf8"),
      ) as WorkOrderManifest;
      expect(ibSlManifest.totalSlices).toBe(78);
      expect(
        ibSlManifest.slices.every(
          (s) => s.syllabus === "ib" && s.level === "SL",
        ),
      ).toBe(true);

      // 6. Verify PURE_CALCULATION_CONCEPT_CATALOGUE, domains: ["pure-calculation"], and --include-pure-calculation
      expect(PURE_CALCULATION_CONCEPT_CATALOGUE.length).toBeGreaterThan(0);
      const pureOnlyManifest = planWorkOrders({
        domains: ["pure-calculation"],
        itemsPerSlice: 10,
      });
      expect(pureOnlyManifest.totalSlices).toBeGreaterThan(0);
      expect(
        pureOnlyManifest.slices.every(
          (s) => s.domain === "pure-calculation" && s.visualFamily === "none",
        ),
      ).toBe(true);

      const withPureManifest = planWorkOrders({
        includePureCalculation: true,
        itemsPerSlice: 10,
      });
      expect(withPureManifest.totalSlices).toBe(
        fullManifest.totalSlices + pureOnlyManifest.totalSlices,
      );

      const cliWithPureOut = path.join(tempRoot, "with-pure-orders.json");
      expect(
        runPlanWorkOrdersCli([
          "--include-pure-calculation",
          "--output",
          cliWithPureOut,
        ]),
      ).toBe(0);
      const cliWithPureManifest = JSON.parse(
        fs.readFileSync(cliWithPureOut, "utf8"),
      ) as WorkOrderManifest;
      expect(cliWithPureManifest.totalSlices).toBe(
        fullManifest.totalSlices + pureOnlyManifest.totalSlices,
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it("computes parallel-plates-particle accelerationMs2 = qE / m with exact argument order and validates candidate packages", () => {
    const adapter = getDomainAdapter("fields");
    const scenarioSpec = {
      kind: "parallel-plates-particle",
      potentialDifferenceV: 240,
      plateSeparationM: 0.03,
      chargeC: 2.5e-8,
      massKg: 4.0e-6,
    };
    const solved = adapter.solveScenario(scenarioSpec);
    // E = 240 / 0.03 = 8000 N/C; a = qE / m = (2.5e-8 * 8000) / 4.0e-6 = 50 m s^-2
    expect(solved.quantities.fieldNC).toBeCloseTo(8000, 6);
    expect(solved.quantities.accelerationMs2).toBeCloseTo(50, 6);
    expect(solved.quantities.workJ).toBeCloseTo(6.0e-6, 12);
    expect(solved.quantities.finalSpeedMs).toBeCloseTo(Math.sqrt(3), 6);

    const candidate: CandidateQuestionInput = {
      id: "int-fields-plate-accel-001",
      conceptId: "electrostatic-coulomb-uniform-fields",
      templateArchetype: "parallel-plate-particle-acceleration",
      seed: 201999,
      syllabi: [
        {
          syllabus: "ib",
          level: "SL",
          topicId: "ib-theme-d",
          subtopicId: "ib-d2-electric-magnetic-fields",
        },
      ],
      format: "mcq",
      difficulty: "standard",
      domain: "fields",
      scenarioSpec,
      hiddenQuantities: [
        "fieldNC",
        "accelerationMs2",
        "workJ",
        "finalSpeedMs",
      ],
      targetQuantityKey: "accelerationMs2",
      stem: "Two parallel conducting plates separated by 0.03 m are held at a potential difference of 240 V in vacuum. A charged micro-droplet of charge +2.5 × 10⁻⁸ C and mass 4.0 × 10⁻⁶ kg is released between the plates (neglecting gravity). What is the magnitude of its electrostatic acceleration?",
      options: [
        {
          label: "A",
          text: "1.50 m s⁻²",
          isCorrect: false,
          distractorRationale:
            "Computes qV / m instead of dividing by the 0.03 m plate separation.",
        },
        { label: "B", text: "50.0 m s⁻²", isCorrect: true },
        {
          label: "C",
          text: "100 m s⁻²",
          isCorrect: false,
          distractorRationale:
            "Uses the half-gap spacing 0.015 m instead of the full 0.03 m separation.",
        },
        {
          label: "D",
          text: "8.00 × 10³ m s⁻²",
          isCorrect: false,
          distractorRationale:
            "Reports the electric field strength E = V / d instead of a = qE / m.",
        },
      ],
      workedSolution:
        "Uniform field E = V / d = 240 / 0.03 = 8.00 × 10³ V m⁻¹, so a = qE / m = (2.5 × 10⁻⁸ × 8.00 × 10³) / (4.0 × 10⁻⁶) = 50.0 m s⁻².",
      markScheme: [
        {
          code: "A1",
          criterion:
            "Evaluates E = 240 / 0.03 = 8000 V m⁻¹ and a = qE / m = 50.0 m s⁻² (B).",
          marks: 1,
        },
      ],
      totalMarks: 1,
    };

    const exec = evaluateCandidatePackage(candidate);
    expect({
      valid: exec.evaluation.valid,
      issues: exec.evaluation.issues,
    }).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("generates unified multi-domain batches via generateAllDomainCandidates and compiles in-place via generate-full-bank CLI", () => {
    const miniBatch = generateAllDomainCandidates({ countPerDomain: 2 });
    expect(miniBatch).toHaveLength(PHYSICS_DOMAIN_IDS.length * 2);
    const domainSet = new Set(miniBatch.map((c) => c.domain));
    expect([...domainSet].sort()).toEqual([...PHYSICS_DOMAIN_IDS].sort());

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const bankRoot = path.join(tempRoot, "full-bank-root");
      expect(
        runGenerateFullBankCli([
          "--out-dir",
          bankRoot,
          "--domains",
          "graphs,fields,pure-calculation",
          "--count-per-domain",
          "2",
          "--clean-shards",
          "--lock-held-out",
        ]),
      ).toBe(0);

      // Verify shards/ survived inside bankRoot alongside SUMMARY.json, frozen-eval-manifest.json, distillation/, and bank/
      expect(
        fs.existsSync(path.join(bankRoot, "shards", "gen-graphs.jsonl")),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(bankRoot, "shards", "gen-fields.jsonl")),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(bankRoot, "shards", "gen-pure-calc.jsonl")),
      ).toBe(true);

      const summary = JSON.parse(
        fs.readFileSync(path.join(bankRoot, "SUMMARY.json"), "utf8"),
      ) as CompiledBankSummary;
      expect(summary.totalCompiledItems).toBe(6);
      expect(summary.splitSummary.zeroContaminationVerified).toBe(true);

      const frozenTop = parseFrozenManifest(
        fs.readFileSync(
          path.join(bankRoot, "frozen-eval-manifest.json"),
          "utf8",
        ),
      );
      const frozenDist = parseFrozenManifest(
        fs.readFileSync(
          path.join(bankRoot, "distillation", "frozen-eval-manifest.json"),
          "utf8",
        ),
      );
      expect(frozenTop.lockHeldOut).toBe(true);
      expect(frozenTop.manifestSha256).toBe(frozenDist.manifestSha256);
    } finally {
      logSpy.mockRestore();
    }
  });
});
