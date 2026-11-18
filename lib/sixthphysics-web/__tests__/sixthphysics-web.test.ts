import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  MOCK_PAPER_PRESETS,
  PHYSICS_DOMAIN_IDS,
  STUDENT_PROGRESS_STORAGE_KEY,
  SEED_FALLBACK_ITEMS,
  SEED_FALLBACK_MANIFEST,
  advanceDailyStreak,
  buildMockPaperSession,
  clearProgressState,
  computeOverallSyllabusMastery,
  computeTopicMasteryStats,
  createConfigFromPreset,
  createDefaultProgressState,
  filterIndexRows,
  getFallbackManifest,
  getFallbackQuestionById,
  getFallbackQuestions,
  getMockPresetsForSyllabus,
  isQuestionBookmarked,
  loadBankManifest,
  loadDomainChunk,
  loadProgressState,
  loadQuestionById,
  loadQuestionsByIds,
  prefetchChunk,
  recordCompletedMock,
  recordQuestionAttempt,
  resetBankClientCache,
  saveProgressState,
  scoreMockPaperSession,
  setLastQuestionForSyllabus,
  toggleBookmark,
  updateActiveFilters,
  type PublicBankChunkFile,
  type PublicBankItem,
  type PublicBankManifest,
} from "../index";
import { compilePublicBank } from "../../../scripts/static-site/compile-public-bank";

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) ?? null) : null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe("SixthPhysics Static Web Bank, Loader, Mastery Store & Mock Builder", () => {
  beforeEach(() => {
    resetBankClientCache();
  });

  describe("Seed fallback & compiled public bank invariants", () => {
    it("provides 18 verified sample items across IB, UK A-Level, and NCUK IFY with distinct familyGroupKeys and stripped internals", () => {
      expect(SEED_FALLBACK_ITEMS).toHaveLength(18);
      expect(SEED_FALLBACK_MANIFEST.totalItems).toBe(18);
      expect(getFallbackQuestions()).toHaveLength(18);
      expect(getFallbackManifest().totalItems).toBe(18);

      const familyKeys = new Set(
        SEED_FALLBACK_ITEMS.map((item) => item.familyGroupKey),
      );
      expect(familyKeys.size).toBe(18);

      const formats = new Set(SEED_FALLBACK_ITEMS.map((item) => item.format));
      expect(formats.has("mcq")).toBe(true);
      expect(formats.has("structured")).toBe(true);

      const svgItems = SEED_FALLBACK_ITEMS.filter((item) =>
        Boolean(item.svgMarkup && item.svgMarkup.includes("<svg")),
      );
      expect(svgItems.length).toBeGreaterThanOrEqual(16);

      expect(SEED_FALLBACK_MANIFEST.syllabi.ib.gravityConvention).toBe(
        "g = 9.8 m s⁻²",
      );
      expect(SEED_FALLBACK_MANIFEST.syllabi.alevel.gravityConvention).toBe(
        "g = 9.81 m s⁻²",
      );
      expect(SEED_FALLBACK_MANIFEST.syllabi.ncuk.gravityConvention).toBe(
        "g = 9.81 m s⁻²",
      );

      expect(SEED_FALLBACK_MANIFEST.syllabi.ib.questionCount).toBeGreaterThan(
        0,
      );
      expect(
        SEED_FALLBACK_MANIFEST.syllabi.alevel.questionCount,
      ).toBeGreaterThan(0);
      expect(SEED_FALLBACK_MANIFEST.syllabi.ncuk.questionCount).toBeGreaterThan(
        0,
      );

      for (const item of SEED_FALLBACK_ITEMS) {
        const rawRecord = item as unknown as Record<string, unknown>;
        expect(rawRecord.verifiedQuantities).toBeUndefined();
        expect(rawRecord.provenance).toBeUndefined();
        expect(item.conceptId.length).toBeGreaterThan(0);
        expect(getFallbackQuestionById(item.id)?.id).toBe(item.id);
      }
    });

    it("verifies compiled public/sixthphysics-data contains all 7,643+ items stored once across 11 chunks when present", () => {
      const manifestPath = path.resolve(
        process.cwd(),
        "public/sixthphysics-data/manifest.json",
      );
      if (!fs.existsSync(manifestPath)) {
        return;
      }

      const summaryPath = path.resolve(
        process.cwd(),
        "dataset/sixthphysics-bank/SUMMARY.json",
      );
      const expectedTotal = fs.existsSync(summaryPath)
        ? (
            JSON.parse(fs.readFileSync(summaryPath, "utf8")) as {
              totalCompiledItems: number;
            }
          ).totalCompiledItems
        : 7643;

      const manifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf8"),
      ) as PublicBankManifest;

      expect(manifest.totalItems).toBeGreaterThanOrEqual(7200);
      expect(manifest.totalItems).toBe(expectedTotal);
      expect(manifest.items).toHaveLength(expectedTotal);
      expect(manifest.syllabi.ib.questionCount).toBeGreaterThanOrEqual(6000);
      expect(manifest.syllabi.alevel.questionCount).toBeGreaterThanOrEqual(
        6000,
      );
      expect(manifest.syllabi.ncuk.questionCount).toBeGreaterThanOrEqual(6000);

      let totalChunkItems = 0;
      const seenChunkItemIds = new Set<string>();

      for (const domainId of PHYSICS_DOMAIN_IDS) {
        const chunkPath = path.resolve(
          process.cwd(),
          `public/sixthphysics-data/chunks/${domainId}.json`,
        );
        expect(fs.existsSync(chunkPath)).toBe(true);
        const chunk = JSON.parse(
          fs.readFileSync(chunkPath, "utf8"),
        ) as PublicBankChunkFile;
        expect(chunk.chunkKey).toBe(domainId);
        expect(chunk.items).toHaveLength(chunk.itemCount);
        totalChunkItems += chunk.items.length;

        for (const item of chunk.items) {
          expect(seenChunkItemIds.has(item.id)).toBe(false);
          seenChunkItemIds.add(item.id);
          const rawRecord = item as unknown as Record<string, unknown>;
          expect(rawRecord.verifiedQuantities).toBeUndefined();
          expect(rawRecord.provenance).toBeUndefined();
        }
      }

      // Zero 3x syllabus duplication: all compiled items stored exactly once across chunks
      expect(totalChunkItems).toBe(expectedTotal);
      expect(seenChunkItemIds.size).toBe(expectedTotal);
    });

    it("compiles cleanly from seed-fallback when dataset/sixthphysics-bank is absent", async () => {
      const tmpOut = fs.mkdtempSync(
        path.join(os.tmpdir(), "sp-compile-fallback-test-"),
      );
      try {
        const res = await compilePublicBank({
          sourceItemsPath: path.join(tmpOut, "nonexistent-all-items.json"),
          outDir: tmpOut,
          writeSeedFallback: false,
        });
        expect(res.usedSeedFallbackInput).toBe(true);
        expect(res.totalItems).toBe(18);
        expect(fs.existsSync(path.join(tmpOut, "manifest.json"))).toBe(true);
        expect(fs.existsSync(path.join(tmpOut, "chunks", "waves.json"))).toBe(
          true,
        );
      } finally {
        fs.rmSync(tmpOut, { recursive: true, force: true });
      }
    });
  });

  describe("Client loader & index filtering", () => {
    it("fetches relative GitHub Pages URLs, deduplicates in-flight chunk requests, and caches items", async () => {
      const requestedUrls: string[] = [];
      const sampleItem = SEED_FALLBACK_ITEMS[0];
      const sampleRow = SEED_FALLBACK_MANIFEST.items.find(
        (r) => r.id === sampleItem.id,
      )!;

      const mockFetch = jest.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.endsWith("/manifest.json")) {
          return {
            ok: true,
            status: 200,
            json: async () => SEED_FALLBACK_MANIFEST,
          } as Response;
        }
        if (url.endsWith(`/chunks/${sampleRow.chunkKey}.json`)) {
          const chunkItems = SEED_FALLBACK_ITEMS.filter((it) => {
            const row = SEED_FALLBACK_MANIFEST.items.find(
              (r) => r.id === it.id,
            );
            return row?.chunkKey === sampleRow.chunkKey;
          });
          return {
            ok: true,
            status: 200,
            json: async () => ({
              schemaVersion: "sixthphysics-public-chunk/1.0.0",
              chunkKey: sampleRow.chunkKey,
              generatedAt: SEED_FALLBACK_MANIFEST.generatedAt,
              itemCount: chunkItems.length,
              items: chunkItems,
            }),
          } as Response;
        }
        return {
          ok: false,
          status: 404,
          json: async () => ({}),
        } as Response;
      }) as unknown as typeof fetch;

      const manifest = await loadBankManifest({ fetchImpl: mockFetch });
      expect(manifest.totalItems).toBe(18);
      expect(requestedUrls).toEqual(["./sixthphysics-data/manifest.json"]);

      // Second call uses in-memory cache without re-fetching
      await loadBankManifest({ fetchImpl: mockFetch });
      expect(requestedUrls).toHaveLength(1);

      // Concurrent prefetchChunk + loadQuestionById deduplicate to a single fetch
      const [, loadedItem] = await Promise.all([
        prefetchChunk(sampleRow.chunkKey, { fetchImpl: mockFetch }),
        loadQuestionById(sampleItem.id, manifest, { fetchImpl: mockFetch }),
      ]);

      expect(loadedItem?.id).toBe(sampleItem.id);
      expect(requestedUrls).toEqual([
        "./sixthphysics-data/manifest.json",
        `./sixthphysics-data/chunks/${sampleRow.chunkKey}.json`,
      ]);

      // Batch loading across multiple IDs
      const secondItem = SEED_FALLBACK_ITEMS[1];
      const batch = await loadQuestionsByIds(
        [sampleItem.id, secondItem.id],
        manifest,
        { fetchImpl: mockFetch },
      );
      expect(batch[sampleItem.id]?.id).toBe(sampleItem.id);
      expect(batch[secondItem.id]?.id).toBe(secondItem.id);
    });

    it("falls back cleanly to SEED_FALLBACK_MANIFEST and SEED_FALLBACK_ITEMS on network failure", async () => {
      const failingFetch = jest.fn(async () => {
        throw new Error("Offline");
      }) as unknown as typeof fetch;

      const manifest = await loadBankManifest({ fetchImpl: failingFetch });
      expect(manifest.totalItems).toBe(18);

      const firstId = SEED_FALLBACK_ITEMS[0].id;
      const item = await loadQuestionById(firstId, manifest, {
        fetchImpl: failingFetch,
      });
      expect(item?.id).toBe(firstId);

      const chunk = await loadDomainChunk("mechanics", {
        fetchImpl: failingFetch,
      });
      expect(chunk.length).toBeGreaterThan(0);
    });

    it("filters index rows accurately across syllabus, S1/S2 shorthand levels, format, difficulty, and progress status", () => {
      const rows = SEED_FALLBACK_MANIFEST.items;
      const ibRows = filterIndexRows(rows, { syllabus: "ib" });
      expect(ibRows.length).toBe(SEED_FALLBACK_MANIFEST.syllabi.ib.questionCount);

      const ibMcqRows = filterIndexRows(rows, {
        syllabus: "ib",
        format: "mcq",
      });
      expect(ibMcqRows.every((r) => r.format === "mcq")).toBe(true);

      // Verify NCUK S1 shorthand normalizes to IFY-S1
      const s1Shorthand = filterIndexRows(rows, {
        syllabus: "ncuk",
        level: "S1",
      });
      const s1Canonical = filterIndexRows(rows, {
        syllabus: "ncuk",
        level: "IFY-S1",
      });
      expect(s1Shorthand).toEqual(s1Canonical);

      // Progress status filters: unseen, needs-review, saved
      let progress = createDefaultProgressState();
      const targetId = ibRows[0].id;
      const secondId = ibRows[1].id;

      progress = recordQuestionAttempt(progress, {
        questionId: targetId,
        format: "mcq",
        earnedMarks: 0,
        totalMarks: 1,
        selectedOptionIndex: 0,
        isCorrect: false,
      });
      progress = toggleBookmark(progress, secondId);

      const unseenRows = filterIndexRows(
        rows,
        { syllabus: "ib", status: "unseen" },
        progress,
      );
      expect(unseenRows.some((r) => r.id === targetId)).toBe(false);
      expect(unseenRows).toHaveLength(ibRows.length - 1);

      const reviewRows = filterIndexRows(
        rows,
        { syllabus: "ib", status: "needs-review" },
        progress,
      );
      expect(reviewRows.map((r) => r.id)).toEqual([targetId]);

      const savedRows = filterIndexRows(
        rows,
        { syllabus: "ib", status: "saved" },
        progress,
      );
      expect(savedRows.map((r) => r.id)).toEqual([secondId]);
    });
  });

  describe("SSR-safe progress store & topic mastery calculation", () => {
    it("persists and reloads sixthphysics.progress.v1 cleanly and handles SSR null / corrupt storage safely", () => {
      // SSR-safe null storage
      const ssrState = loadProgressState(null);
      expect(ssrState.schemaVersion).toBe(STUDENT_PROGRESS_STORAGE_KEY);
      expect(() => saveProgressState(ssrState, null)).not.toThrow();

      const storage = new MemoryStorage();
      storage.setItem(STUDENT_PROGRESS_STORAGE_KEY, "{corrupted-json");
      const recovered = loadProgressState(storage);
      expect(recovered.attempts).toEqual({});

      let state = createDefaultProgressState("2026-11-17T10:00:00.000Z");
      state = recordQuestionAttempt(
        state,
        {
          questionId: "q-mcq-1",
          format: "mcq",
          earnedMarks: 1,
          totalMarks: 1,
          selectedOptionIndex: 2,
          isCorrect: true,
        },
        new Date("2026-11-17T10:05:00.000Z"),
      );

      state = recordQuestionAttempt(
        state,
        {
          questionId: "q-struct-1",
          format: "structured",
          earnedMarks: 3,
          totalMarks: 6,
          checkedCriterionKeys: ["a:M1:0", "a:A1:1", "b:M1:2"],
          partNotes: { a: "v = f lambda", b: "0.31 m" },
        },
        new Date("2026-11-18T11:00:00.000Z"),
      );

      state = toggleBookmark(state, "q-struct-1");
      expect(isQuestionBookmarked(state, "q-struct-1")).toBe(true);

      state = updateActiveFilters(state, {
        syllabus: "alevel",
        level: "Y13",
        format: "structured",
      });
      state = setLastQuestionForSyllabus(state, "alevel", "q-struct-1");

      saveProgressState(state, storage);
      const reloaded = loadProgressState(storage);

      expect(reloaded.attempts["q-mcq-1"]?.isCorrect).toBe(true);
      expect(reloaded.attempts["q-mcq-1"]?.needsReview).toBe(false);
      // 3 / 6 = 50% (< 70% structured mastery threshold) -> needsReview: true
      expect(reloaded.attempts["q-struct-1"]?.earnedMarks).toBe(3);
      expect(reloaded.attempts["q-struct-1"]?.needsReview).toBe(true);
      expect(reloaded.attempts["q-struct-1"]?.partNotes?.a).toBe(
        "v = f lambda",
      );
      expect(reloaded.streak.currentDays).toBe(2);
      expect(reloaded.streak.longestDays).toBe(2);
      expect(reloaded.activeFilters.syllabus).toBe("alevel");
      expect(reloaded.lastQuestionIdBySyllabus.alevel).toBe("q-struct-1");

      clearProgressState(storage);
      expect(storage.getItem(STUDENT_PROGRESS_STORAGE_KEY)).toBeNull();
    });

    it("tracks consecutive daily streaks and resets currentDays after multi-day gaps while preserving longestDays", () => {
      let streak = createDefaultProgressState().streak;
      streak = advanceDailyStreak(streak, new Date("2026-11-10T09:00:00Z"));
      expect(streak.currentDays).toBe(1);

      // Same day does not double-increment
      streak = advanceDailyStreak(streak, new Date("2026-11-10T21:00:00Z"));
      expect(streak.currentDays).toBe(1);

      // Consecutive days
      streak = advanceDailyStreak(streak, new Date("2026-11-11T08:00:00Z"));
      streak = advanceDailyStreak(streak, new Date("2026-11-12T08:00:00Z"));
      expect(streak.currentDays).toBe(3);
      expect(streak.longestDays).toBe(3);

      // 3-day gap resets currentDays to 1, keeps longestDays = 3
      streak = advanceDailyStreak(streak, new Date("2026-11-15T08:00:00Z"));
      expect(streak.currentDays).toBe(1);
      expect(streak.longestDays).toBe(3);
    });

    it("computes accurate per-topic and overall syllabus mastery stats", () => {
      const ibRows = filterIndexRows(SEED_FALLBACK_MANIFEST.items, {
        syllabus: "ib",
      });
      const firstRow = ibRows[0];
      const firstTopicId = firstRow.syllabi.find(
        (t) => t.syllabus === "ib",
      )!.topicId;

      let state = createDefaultProgressState();
      state = recordCompletedMock(state, [
        {
          questionId: firstRow.id,
          format: firstRow.format,
          earnedMarks: firstRow.totalMarks,
          totalMarks: firstRow.totalMarks,
          isCorrect: true,
        },
      ]);

      expect(state.completedMockCount).toBe(1);

      const topicStats = computeTopicMasteryStats(
        "ib",
        SEED_FALLBACK_MANIFEST.items,
        state,
        SEED_FALLBACK_MANIFEST.syllabi.ib.topics,
      );
      expect(topicStats[firstTopicId]?.attemptedCount).toBe(1);
      expect(topicStats[firstTopicId]?.masteredCount).toBe(1);
      expect(topicStats[firstTopicId]?.accuracyPercent).toBe(100);

      const overall = computeOverallSyllabusMastery(
        "ib",
        SEED_FALLBACK_MANIFEST.items,
        state,
      );
      expect(overall.attemptedCount).toBe(1);
      expect(overall.accuracyPercent).toBe(100);
    });
  });

  describe("Mock paper builder & familyGroupKey deduplication", () => {
    it("exposes presets for all 3 syllabi and strictly deduplicates familyGroupKey in every generated mock paper", () => {
      expect(getMockPresetsForSyllabus("ib").length).toBeGreaterThanOrEqual(3);
      expect(getMockPresetsForSyllabus("alevel").length).toBeGreaterThanOrEqual(
        3,
      );
      expect(getMockPresetsForSyllabus("ncuk").length).toBeGreaterThanOrEqual(
        3,
      );

      const manifestPath = path.resolve(
        process.cwd(),
        "public/sixthphysics-data/manifest.json",
      );
      const manifest: PublicBankManifest = fs.existsSync(manifestPath)
        ? (JSON.parse(
            fs.readFileSync(manifestPath, "utf8"),
          ) as PublicBankManifest)
        : SEED_FALLBACK_MANIFEST;

      for (const preset of MOCK_PAPER_PRESETS) {
        const config = createConfigFromPreset(preset, { seed: 20261117 });
        const session = buildMockPaperSession(
          manifest,
          config,
          new Date("2026-11-17T12:00:00Z"),
        );

        expect(session.questionRows.length).toBeGreaterThan(0);
        expect(session.questionIds).toHaveLength(session.questionRows.length);

        const uniqueFamilies = new Set(
          session.questionRows.map((row) => row.familyGroupKey),
        );
        // Zero duplicate familyGroupKeys inside any generated mock paper!
        expect(uniqueFamilies.size).toBe(session.questionRows.length);

        if (fs.existsSync(manifestPath)) {
          if (preset.formatMode === "mcq") {
            expect(session.questionRows).toHaveLength(preset.questionCount);
            expect(
              session.questionRows.every((r) => r.format === "mcq"),
            ).toBe(true);
          } else if (preset.formatMode === "structured") {
            expect(
              session.questionRows.every((r) => r.format === "structured"),
            ).toBe(true);
            expect(session.totalMarks).toBeGreaterThanOrEqual(20);
            expect(session.totalMarks).toBeLessThanOrEqual(32);
          } else {
            expect(session.questionRows).toHaveLength(preset.questionCount);
          }
        }
      }
    });

    it("scores MCQ + self-marked Paper 2 structured responses and identifies weak topics", () => {
      const config = createConfigFromPreset(
        getMockPresetsForSyllabus("ib")[2],
        {
          questionCount: 4,
          mcqCount: 2,
          structuredCount: 2,
          seed: 42,
        },
      );
      const session = buildMockPaperSession(SEED_FALLBACK_MANIFEST, config);
      const itemsById: Record<string, PublicBankItem> = {};
      for (const item of SEED_FALLBACK_ITEMS) {
        itemsById[item.id] = item;
      }

      const mcqRows = session.questionRows.filter((r) => r.format === "mcq");
      const structRows = session.questionRows.filter(
        (r) => r.format === "structured",
      );

      if (mcqRows[0]) {
        const correctIdx = itemsById[mcqRows[0].id]?.correctOptionIndex ?? 0;
        session.responses[mcqRows[0].id].selectedOptionIndex = correctIdx;
      }
      if (mcqRows[1]) {
        const correctIdx = itemsById[mcqRows[1].id]?.correctOptionIndex ?? 0;
        session.responses[mcqRows[1].id].selectedOptionIndex =
          (correctIdx + 1) % 4;
      }
      if (structRows[0]) {
        session.responses[structRows[0].id].isSelfMarked = true;
        session.responses[structRows[0].id].selfMarkedEarnedMarks =
          structRows[0].totalMarks;
      }
      // Leave structRows[1] unmarked to test unmarkedStructuredCount

      const summary = scoreMockPaperSession(
        session,
        itemsById,
        SEED_FALLBACK_MANIFEST,
      );

      expect(summary.totalQuestions).toBe(session.questionRows.length);
      expect(summary.mcqCorrect).toBe(1);
      expect(summary.mcqTotal).toBe(mcqRows.length);
      expect(summary.unmarkedStructuredCount).toBe(
        Math.max(0, structRows.length - 1),
      );
      expect(summary.topicBreakdown.length).toBeGreaterThan(0);
      expect(summary.weakTopicIds.length).toBeGreaterThan(0);
    });
  });
});
