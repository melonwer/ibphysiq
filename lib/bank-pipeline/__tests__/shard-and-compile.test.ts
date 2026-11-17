import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildQwenDistillationTrace,
  validateQwenDistillationTrace,
} from "@/lib/bank-pipeline/distillation-trace";
import { buildSampleCandidates } from "@/lib/bank-pipeline/sample-candidates";
import {
  CompiledBankSummary,
  compileBankFromShards,
  ingestCandidatesIntoShard,
  readShardAttempts,
  readShardRecords,
  shardAttemptsPath,
  shardJsonlPath,
  solveCandidateScenariosOnly,
} from "@/lib/bank-pipeline/shard-store";
import {
  assignSplit,
  parseFrozenManifest,
} from "@/lib/bank-pipeline/split-assigner";
import { QwenDistillationTrace } from "@/lib/bank-pipeline/types";
import { planWorkOrders } from "@/lib/bank-pipeline/work-order-planner";

import { runCompileBankCli } from "../../../scripts/bank-generation/compile-bank";
import { runPlanWorkOrdersCli } from "../../../scripts/bank-generation/plan-work-orders";
import { runVerifyAndIngestCli } from "../../../scripts/bank-generation/verify-and-ingest-shard";

describe("shard-store, distillation traces, work-order planner, and CLIs", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sixthphysics-bank-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("plans non-overlapping work-order slices with strictly disjoint seed ranges", () => {
    const manifest = planWorkOrders({
      itemsPerSlice: 12,
      maxItemsPerShard: 10,
      baseSeed: 200_000,
    });

    expect(manifest.totalSlices).toBeGreaterThan(20);
    expect(manifest.totalTargetQuestions).toBe(
      manifest.slices.reduce((acc, s) => acc + s.targetCount, 0),
    );

    const shardIds = new Set<string>();
    for (let i = 0; i < manifest.slices.length; i += 1) {
      const slice = manifest.slices[i];
      expect(shardIds.has(slice.shardId)).toBe(false);
      shardIds.add(slice.shardId);
      expect(slice.seedRange[0]).toBeLessThanOrEqual(slice.seedRange[1]);
      if (i > 0) {
        const prev = manifest.slices[i - 1];
        expect(slice.seedRange[0]).toBeGreaterThan(prev.seedRange[1]);
      }
    }
  });

  it("ingests parallel shards lock-free, supports idempotent repair, and compiles bank + Qwen3.5-9B traces", () => {
    const shardsDir = path.join(tempRoot, "shards");
    const compiledDir = path.join(tempRoot, "compiled");
    const samples = buildSampleCandidates();

    // Split samples across 3 independent shards + inject 1 defective candidate into shard-2
    const shard1Batch = samples.slice(0, 3);
    const defectiveItem = {
      ...samples[3],
      id: "sp-circuits-broken",
      totalMarks: 99, // deliberate mark-sum-mismatch
    };
    const shard2Batch = [defectiveItem, ...samples.slice(4, 7)];
    const shard3Batch = samples.slice(7);

    const r1 = ingestCandidatesIntoShard({
      shardId: "worker-shard-01",
      shardsDir,
      candidates: shard1Batch,
    });
    expect(r1.ingestedCount).toBe(3);
    expect(r1.rejectedCount).toBe(0);

    const r2First = ingestCandidatesIntoShard({
      shardId: "worker-shard-02",
      shardsDir,
      candidates: shard2Batch,
    });
    expect(r2First.ingestedCount).toBe(3);
    expect(r2First.rejectedCount).toBe(1);
    expect(r2First.results[0].status).toBe("rejected");

    // Worker repairs the 1 rejected item and re-runs the batch idempotently
    const r2Repaired = ingestCandidatesIntoShard({
      shardId: "worker-shard-02",
      shardsDir,
      candidates: [samples[3], ...samples.slice(4, 7)],
    });
    expect(r2Repaired.ingestedCount).toBe(1);
    expect(r2Repaired.alreadyPresentCount).toBe(3);
    expect(r2Repaired.rejectedCount).toBe(0);

    const r3 = ingestCandidatesIntoShard({
      shardId: "worker-shard-03",
      shardsDir,
      candidates: shard3Batch,
    });
    expect(r3.ingestedCount).toBe(2);

    // Verify stored Qwen/Qwen3.5-9B two-step distillation traces
    const shard1Records = readShardRecords(shardsDir, "worker-shard-01");
    expect(shard1Records).toHaveLength(3);
    for (const rec of shard1Records) {
      const traceCheck = validateQwenDistillationTrace(rec.distillationTrace);
      expect(traceCheck).toEqual({ valid: true, issues: [] });
      expect(rec.distillationTrace.targetModel).toBe("Qwen/Qwen3.5-9B");
      expect(rec.distillationTrace.messages).toHaveLength(5);

      const step1 = JSON.parse(rec.distillationTrace.messages[2].content) as {
        action: string;
        scenarioSpec: Record<string, unknown>;
      };
      expect(step1.action).toBe("solve_and_render_scenario");
      expect(step1.scenarioSpec).toBeDefined();

      const receipt = JSON.parse(rec.distillationTrace.messages[3].content) as {
        status: string;
        verifiedQuantities: Record<string, unknown>;
      };
      expect(receipt.status).toBe("verified");
      expect(Object.keys(receipt.verifiedQuantities).length).toBeGreaterThan(0);
    }

    // Compile all shards deterministically
    const summary = compileBankFromShards({
      shardsDir,
      outDir: compiledDir,
    });

    expect(summary.totalCompiledItems).toBe(9);
    expect(summary.splitSummary.zeroContaminationVerified).toBe(true);
    expect(summary.attemptMetrics.totalRejectedInAttempts).toBe(1);
    expect(summary.coverageBySyllabus.ib.total).toBe(9);
    expect(summary.coverageBySyllabus.alevel.total).toBe(9);
    expect(summary.coverageBySyllabus.ncuk.total).toBe(9);

    // Check emitted QLoRA JSONL splits sum to 9 traces
    let totalTracesOnDisk = 0;
    for (const split of ["train", "val", "test"] as const) {
      const splitFile = path.join(compiledDir, "distillation", `${split}.jsonl`);
      expect(fs.existsSync(splitFile)).toBe(true);
      const content = fs.readFileSync(splitFile, "utf8").trim();
      if (content) {
        const lines = content.split("\n");
        totalTracesOnDisk += lines.length;
        for (const line of lines) {
          const trace = JSON.parse(line) as QwenDistillationTrace;
          expect(trace.split).toBe(split);
          expect(validateQwenDistillationTrace(trace).valid).toBe(true);
        }
      }
    }
    expect(totalTracesOnDisk).toBe(9);

    // Check frozen evaluation manifest round-trip
    const frozenPath = path.join(
      compiledDir,
      "distillation",
      "frozen-eval-manifest.json",
    );
    const frozenManifest = parseFrozenManifest(
      fs.readFileSync(frozenPath, "utf8"),
    );
    const recompiled = compileBankFromShards({
      shardsDir,
      outDir: path.join(tempRoot, "compiled-recheck"),
      frozenManifest,
    });
    expect(recompiled.totalCompiledItems).toBe(9);
    expect(recompiled.splitSummary.zeroContaminationVerified).toBe(true);
  });

  it("executes all three CLI runners end-to-end (plan, solve-only, verify-and-ingest, compile)", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const workOrdersPath = path.join(tempRoot, "work-orders.json");
      const samplePath = path.join(tempRoot, "candidates.json");
      const shardsDir = path.join(tempRoot, "cli-shards");
      const outDir = path.join(tempRoot, "cli-compiled");

      expect(
        runPlanWorkOrdersCli([
          "--registered-only",
          "--items-per-slice",
          "5",
          "--output",
          workOrdersPath,
        ]),
      ).toBe(0);
      expect(fs.existsSync(workOrdersPath)).toBe(true);

      expect(runVerifyAndIngestCli(["--emit-sample", samplePath])).toBe(0);
      expect(fs.existsSync(samplePath)).toBe(true);

      const previews = solveCandidateScenariosOnly(buildSampleCandidates());
      expect(previews.every((p) => p.valid)).toBe(true);

      expect(
        runVerifyAndIngestCli(["--solve-only", "--input", samplePath]),
      ).toBe(0);

      expect(
        runVerifyAndIngestCli([
          "--shard",
          "cli-smoke-01",
          "--shards-dir",
          shardsDir,
          "--input",
          samplePath,
        ]),
      ).toBe(0);

      expect(
        runCompileBankCli(["--shards-dir", shardsDir, "--out-dir", outDir]),
      ).toBe(0);

      expect(fs.existsSync(path.join(outDir, "SUMMARY.json"))).toBe(true);
      expect(fs.existsSync(path.join(outDir, "bank/index.json"))).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("SHOULD-FIX 3 regression: truncates/repairs trailing incomplete crash fragments before appending new shard records", () => {
    const shardsDir = path.join(tempRoot, "crash-shards");
    const samples = buildSampleCandidates();

    // 1. Ingest 2 valid candidates cleanly
    const initial = ingestCandidatesIntoShard({
      shardId: "worker-crash-01",
      shardsDir,
      candidates: samples.slice(0, 2),
    });
    expect(initial.ingestedCount).toBe(2);

    // 2. Simulate an interrupted process crash leaving a non-newline-terminated JSON fragment on both files
    const shardFile = shardJsonlPath(shardsDir, "worker-crash-01");
    const attemptsFile = shardAttemptsPath(shardsDir, "worker-crash-01");
    fs.appendFileSync(
      shardFile,
      '{"schemaVersion":"sixthphysics-shard-record/1.0.0","shardId":"worker-crash-01","truncated',
      "utf8",
    );
    fs.appendFileSync(
      attemptsFile,
      '{"shardId":"worker-crash-01","totalCandidates":',
      "utf8",
    );

    expect(readShardRecords(shardsDir, "worker-crash-01")).toHaveLength(2);

    // 3. Re-ingest with a 3rd candidate: must truncate the incomplete fragment BEFORE appending!
    const afterCrash = ingestCandidatesIntoShard({
      shardId: "worker-crash-01",
      shardsDir,
      candidates: samples.slice(0, 3),
    });
    expect(afterCrash.alreadyPresentCount).toBe(2);
    expect(afterCrash.ingestedCount).toBe(1);

    // 4. Subsequent reads and full bank compilation must succeed with zero mid-file JSON errors
    const recoveredRecords = readShardRecords(shardsDir, "worker-crash-01");
    expect(recoveredRecords).toHaveLength(3);
    expect(recoveredRecords.map((r) => r.bankItem.id)).toEqual([
      samples[0].id,
      samples[1].id,
      samples[2].id,
    ]);

    const rawLines = fs
      .readFileSync(shardFile, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0);
    expect(rawLines).toHaveLength(3);
    for (const line of rawLines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    expect(readShardAttempts(shardsDir, "worker-crash-01")).toHaveLength(2);
  });

  it("SHOULD-FIX 5 regression: keeps frozen val/test 100% immutable during compile-bank and records newPostFreezeFamiliesRoutedToTrain in SUMMARY.json", () => {
    const shardsDir = path.join(tempRoot, "freeze-shards");
    const compiledV1 = path.join(tempRoot, "compiled-v1");
    const compiledV2 = path.join(tempRoot, "compiled-v2");
    const samples = buildSampleCandidates();

    ingestCandidatesIntoShard({
      shardId: "wave1-shard",
      shardsDir,
      candidates: samples,
    });

    const summaryV1 = compileBankFromShards({
      shardsDir,
      outDir: compiledV1,
    });
    expect(summaryV1.newPostFreezeFamiliesRoutedToTrain).toEqual([]);

    const frozenManifest = parseFrozenManifest(
      fs.readFileSync(
        path.join(compiledV1, "distillation/frozen-eval-manifest.json"),
        "utf8",
      ),
    );
    expect(frozenManifest.lockHeldOut).toBe(true);

    // Find an unseen post-freeze archetype that would naturally hash to "test" without lockHeldOut
    let unseenTestArchetype = "";
    for (let i = 1; i < 300; i += 1) {
      const arch = `post-freeze-motor-variant-${i}`;
      if (
        assignSplit(`uncertainties-suvat-and-efficiency::${arch}`) === "test"
      ) {
        unseenTestArchetype = arch;
        break;
      }
    }
    expect(unseenTestArchetype).not.toBe("");

    // Ingest post-freeze candidate (even without passing frozenManifest at ingest time!)
    const postFreezeCandidate = {
      ...samples[8], // sp-pure-mcq-009
      id: "sp-pure-mcq-postfreeze-010",
      templateArchetype: unseenTestArchetype,
      stem: "A hoist motor consumes 800 W from a DC bus while delivering 600 W of mechanical lifting power steadily over a 20 s lift. What thermal energy is dissipated to the air during the 20 s?",
    };
    const postIngest = ingestCandidatesIntoShard({
      shardId: "wave2-postfreeze-shard",
      shardsDir,
      candidates: [postFreezeCandidate],
    });
    expect(postIngest.ingestedCount).toBe(1);

    // Also verify ingesting with frozenManifest rejects a new item targeting a locked held-out family
    const heldOutTestId = frozenManifest.heldOutItemIds.test[0];
    if (heldOutTestId) {
      const heldOutSample = samples.find((s) => s.id === heldOutTestId)!;
      const blockedAttempt = ingestCandidatesIntoShard({
        shardId: "wave2-blocked-shard",
        shardsDir,
        frozenManifest,
        candidates: [
          {
            ...heldOutSample,
            id: `${heldOutSample.id}-intruder`,
            stem: `${heldOutSample.stem} Assume standard laboratory conditions throughout.`,
          },
        ],
      });
      expect(blockedAttempt.rejectedCount).toBe(1);
      expect(blockedAttempt.results[0].issues[0].code).toBe(
        "split-contamination",
      );
    }

    // Compile with frozenManifest: unseen family is routed to train, val & test stay 100% immutable!
    const summaryV2 = compileBankFromShards({
      shardsDir,
      outDir: compiledV2,
      frozenManifest,
    });
    const expectedNewFamily = `uncertainties-suvat-and-efficiency::${unseenTestArchetype}`;
    expect(summaryV2.newPostFreezeFamiliesRoutedToTrain).toEqual([
      expectedNewFamily,
    ]);
    expect(summaryV2.splitSummary.itemCounts.val).toBe(
      summaryV1.splitSummary.itemCounts.val,
    );
    expect(summaryV2.splitSummary.itemCounts.test).toBe(
      summaryV1.splitSummary.itemCounts.test,
    );
    expect(summaryV2.splitSummary.itemCounts.train).toBe(
      summaryV1.splitSummary.itemCounts.train + 1,
    );

    const summaryOnDisk = JSON.parse(
      fs.readFileSync(path.join(compiledV2, "SUMMARY.json"), "utf8"),
    ) as CompiledBankSummary;
    expect(summaryOnDisk.newPostFreezeFamiliesRoutedToTrain).toEqual([
      expectedNewFamily,
    ]);
  });

  it("SHOULD-FIX 6 regression: prevents post-solve distractorRationale and solved numbers from leaking into Step 1 propose_scenario", () => {
    const shardsDir = path.join(tempRoot, "leak-check-shards");
    const samples = buildSampleCandidates();
    ingestCandidatesIntoShard({
      shardId: "trace-audit-shard",
      shardsDir,
      candidates: samples,
    });

    const records = readShardRecords(shardsDir, "trace-audit-shard");
    expect(records).toHaveLength(9);

    for (const rec of records) {
      const step1 = JSON.parse(rec.distillationTrace.messages[2].content) as {
        questionPlan: {
          targetSummary: string;
          distractorStrategy?: string[];
        };
      };
      const postSolveRationales = (rec.bankItem.options ?? [])
        .filter((o) => !o.isCorrect && o.distractorRationale)
        .map((o) => o.distractorRationale!);

      for (const rationale of postSolveRationales) {
        expect(step1.questionPlan.distractorStrategy ?? []).not.toContain(
          rationale,
        );
        expect(rec.distillationTrace.messages[2].content).not.toContain(
          rationale,
        );
      }
    }

    // Specifically verify sp-circuits-mcq-003 (where distractorRationale mentions solved I = 3.0 A)
    const circuitsRec = records.find(
      (r) => r.bankItem.id === "sp-circuits-mcq-003",
    )!;
    expect(circuitsRec.distillationTrace.messages[2].content).not.toContain(
      "3.0 A",
    );
    expect(circuitsRec.distillationTrace.messages[2].content).not.toContain(
      "24.0",
    );

    // Verify caller-supplied questionPlan with copied distractorRationale is stripped in buildQwenDistillationTrace
    const circuitsCandidate = samples[2];
    const copiedRationale = circuitsCandidate.options![2].distractorRationale!;
    const strippedTrace = buildQwenDistillationTrace({
      candidate: {
        ...circuitsCandidate,
        questionPlan: {
          targetSummary: "Compute resistor power",
          distractorStrategy: [copiedRationale],
        },
      },
      bankItem: circuitsRec.bankItem,
      split: "train",
    });
    expect(strippedTrace.messages[2].content).not.toContain(copiedRationale);
    expect(validateQwenDistillationTrace(strippedTrace).valid).toBe(true);

    // Verify validateQwenDistillationTrace rejects a trace if Step 1 questionPlan leaks solved hidden value 24.0
    const leakedTrace = buildQwenDistillationTrace({
      candidate: {
        ...circuitsCandidate,
        questionPlan: {
          targetSummary: "Compute branch power equal to 24.0 W",
        },
      },
      bankItem: circuitsRec.bankItem,
      split: "train",
    });
    const leakCheck = validateQwenDistillationTrace(leakedTrace);
    expect(leakCheck.valid).toBe(false);
    expect(leakCheck.issues.join(" ")).toMatch(/Step 1 propose_scenario/);

    // Verify digits inside pre-solve identifiers (e.g. "dc-4-terminal-sensing" when parallelOhm = 4,
    // or "projectile-motion-2d" when a hidden quantity = 2) NEVER trigger false-positive Step 1 leak rejection!
    const fourTerminalClone = {
      ...samples[2], // sp-circuits-mcq-003 has parallelOhm = 4, totalOhm = 7
      id: "sp-circuits-4terminal-ok",
      conceptId: "dc-4-terminal-sensing",
      templateArchetype: "unseen-post-freeze-4",
      stem: "A 21 V source drives a 3 Ω series resistor connected to parallel 12 Ω and 6 Ω sensing branches. Find the power dissipated in the 6 Ω branch.",
    };
    const twoDimClone = {
      ...samples[3], // sp-circuits-struct-004 has totalCurrentA = 2
      id: "sp-circuits-2d-slug-ok",
      conceptId: "projectile-motion-2d",
      templateArchetype: "mesh-2-loop-network",
      stem: "A cell of emf 18 V and internal resistance 1 Ω feeds a 4 Ω resistor in series with parallel 12 Ω and 6 Ω resistors for 10 s.",
    };
    const identifierSlugIngest = ingestCandidatesIntoShard({
      shardId: "identifier-slug-shard",
      shardsDir,
      candidates: [fourTerminalClone, twoDimClone],
    });
    expect({
      ingestedCount: identifierSlugIngest.ingestedCount,
      rejectedCount: identifierSlugIngest.rejectedCount,
      issues: identifierSlugIngest.results.flatMap((r) => r.issues),
    }).toEqual({
      ingestedCount: 2,
      rejectedCount: 0,
      issues: [],
    });

    // Meanwhile a genuine solved numeric leak ("compute slope 2.00 A") on that same item IS still rejected!
    const genuineSlugLeak = ingestCandidatesIntoShard({
      shardId: "identifier-slug-shard",
      shardsDir,
      candidates: [
        {
          ...twoDimClone,
          id: "sp-circuits-2d-genuine-leak",
          stem: "An 18 V battery with 1 Ω internal resistance supplies a 4 Ω series resistor and parallel 12 Ω and 6 Ω branches over 10 s.",
          questionPlan: {
            targetSummary: "Compute total battery current 2.00 A",
          },
        },
      ],
    });
    expect(genuineSlugLeak.rejectedCount).toBe(1);
    expect(genuineSlugLeak.results[0].issues[0].message).toMatch(
      /Step 1 propose_scenario questionPlan leaks post-solve hidden quantity/,
    );
  });
});
