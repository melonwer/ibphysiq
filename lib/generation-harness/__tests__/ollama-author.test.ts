import { createServer, Server } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHECKED_SOURCE_PACKAGES,
  AuthoredContent,
  buildModelAuthoredPackage,
  createOllamaAuthor,
  parseAuthoredContent,
  parseModelAuthoredPackage,
} from "../ollama-author";
import {
  createMechanicsReplayAdapters,
  packageContentFingerprint,
} from "../replay-fixtures";
import { artifactJsonSchema, validateArtifact } from "../contracts";
import { authoredPackageResolver } from "../../review/authored-package-resolver";
import { buildReviewView } from "../../review/review-service";
import { runQuestionGraph } from "../question-run-graph";
import { mechanicsReplayRequest } from "../replay-fixtures";

const base = CHECKED_SOURCE_PACKAGES.find(
  (item) => item.scenario.kind === "cart-collision",
)!;
const content: AuthoredContent = JSON.parse(
  JSON.stringify({ question: base.question, solution: base.solution }),
);
const candidateId = "qwen-author-test-cart-collision";

describe("local author candidates", () => {
  it("preserves actual authored prose and fixed physics in a separate fingerprint-bound candidate", () => {
    const authored = {
      ...content,
      question: {
        ...content.question,
        stem: "Two carts collide. Determine the final velocity of cart X using the stated masses and velocities.",
      },
    };
    const candidate = buildModelAuthoredPackage(
      base,
      candidateId,
      parseAuthoredContent(base, authored),
    );
    expect(candidate.question.stem).toBe(authored.question.stem);
    expect(candidate.schemaVersion).toBe(
      "model-authored-question-package/0.1.0",
    );
    expect(candidate.sourcePackageId).toBe(base.id);
    expect(candidate.results.finalXMs).toBe(1);
    expect(candidate.trainingEligibility).toBe("blocked");
    expect(
      parseModelAuthoredPackage(JSON.parse(JSON.stringify(candidate))),
    ).toEqual(candidate);
    const forged = {
      ...candidate,
      results: { ...candidate.results, finalXMs: 99 },
    };
    expect(() => parseModelAuthoredPackage(forged)).toThrow(
      "provenance or verified artifacts",
    );
  });
  it("rejects duplicate options, incorrect final answers and incomplete marking points", () => {
    if (content.question.kind !== "multiple-choice")
      throw new Error("Expected MCQ");
    const firstOption = content.question.options[0];
    const options = content.question.options;
    expect(() =>
      parseAuthoredContent(base, {
        ...content,
        question: {
          ...content.question,
          options: options.map(() => firstOption),
        },
      }),
    ).toThrow("Options");
    expect(() =>
      parseAuthoredContent(base, {
        ...content,
        solution: {
          ...content.solution,
          parts: [
            { ...content.solution.parts[0], finalAnswer: "2.00 m s⁻¹ right" },
          ],
        },
      }),
    ).toThrow();
    expect(() =>
      parseAuthoredContent(base, {
        ...content,
        solution: {
          ...content.solution,
          parts: [{ ...content.solution.parts[0], markingPoints: [] }],
        },
      }),
    ).toThrow();
  });
  it("rejects omitted or changed multipart assessment targets", () => {
    const multipart = CHECKED_SOURCE_PACKAGES.find(
      (item) => item.scenario.kind === "incline-friction",
    )!;
    if (multipart.question.kind !== "multipart")
      throw new Error("Expected multipart");
    const valid = {
      question: multipart.question,
      solution: multipart.solution,
    };
    expect(parseAuthoredContent(multipart, valid).solution.parts).toHaveLength(
      4,
    );
    expect(() =>
      parseAuthoredContent(multipart, {
        ...valid,
        question: { ...valid.question, parts: valid.question.parts.slice(1) },
      }),
    ).toThrow();
    expect(() =>
      parseAuthoredContent(multipart, {
        ...valid,
        solution: {
          ...valid.solution,
          parts: [...valid.solution.parts].reverse(),
        },
      }),
    ).toThrow("differs");
  });
  it("runs a real HTTP author response through the graph and fingerprint-bound review resolver", async () => {
    let requestBody = "";
    const server: Server = createServer((request, response) => {
      request.on("data", (chunk) => {
        requestBody += chunk.toString();
      });
      request.on("end", () => {
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            model: "qwen3:8b",
            done: true,
            message: { role: "assistant", content: JSON.stringify(content) },
          }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing server address");
    const directory = mkdtempSync(join(tmpdir(), "ibphysiq-author-"));
    try {
      const author = createOllamaAuthor(
        base,
        candidateId,
        async (candidate) => {
          writeFileSync(
            join(directory, `${candidate.id}.json`),
            JSON.stringify(candidate),
          );
        },
        {
          baseUrl: `http://127.0.0.1:${address.port}`,
          model: "qwen3:8b",
          timeoutMs: 2000,
          maxOutputTokens: 1000,
        },
      );
      const replay = createMechanicsReplayAdapters(base.id);
      const run = await runQuestionGraph(mechanicsReplayRequest(base.id), {
        ...replay,
        author,
        async validatePackage(summary) {
          expect(
            validateArtifact("question-package-artifact", summary).valid,
          ).toBe(true);
        },
      });
      expect(run.status).toBe("awaiting-human-review");
      const view = buildReviewView(run, authoredPackageResolver(directory));
      expect(view.packageResolved).toBe(true);
      expect(view.question?.stem).toBe(content.question.stem);
      expect(view.solution?.parts[0].finalAnswer).toBe("A — 1.00 m s⁻¹ right");
      expect(view.renderedVisuals[0].svg).toContain("<svg");
      expect(run.questionPackage?.contentFingerprint).toBe(
        packageContentFingerprint(
          parseModelAuthoredPackage(
            JSON.parse(
              readFileSync(join(directory, `${candidateId}.json`), "utf8"),
            ),
          ),
        ),
      );
      expect(view.readiness.ready).toBe(false);
      expect(authoredPackageResolver(directory)("../../bad")).toBeUndefined();
      const sent = JSON.parse(requestBody);
      expect(sent.think).toBe(false);
      expect(sent.format.properties.question.properties.kind.enum).toEqual([
        "multiple-choice",
      ]);
      expect(
        artifactJsonSchema("question-package-artifact").properties,
      ).toBeDefined();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(directory, { recursive: true });
    }
  });
});
