import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { validateQwenDistillationTrace } from "@/lib/bank-pipeline/distillation-trace";
import { buildSampleCandidates } from "@/lib/bank-pipeline/sample-candidates";
import {
  compileBankFromShards,
  ingestCandidatesIntoShard,
  readShardRecords,
  solveCandidateScenariosOnly,
} from "@/lib/bank-pipeline/shard-store";
import { parseFrozenManifest } from "@/lib/bank-pipeline/split-assigner";
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
});
