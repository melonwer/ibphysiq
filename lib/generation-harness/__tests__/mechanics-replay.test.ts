import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MECHANICS_QUESTION_PACKAGES } from "../../visuals/mechanics-question-packages";
import {
  buildReviewView,
  findReviewablePackage,
} from "../../review/review-service";
import {
  createMechanicsReplayAdapters,
  mechanicsReplayRequest,
} from "../replay-fixtures";
import { JsonlQuestionRunStore } from "../question-run-store";
import { runQuestionGraph } from "../question-run-graph";

describe("mechanics harness and human-review integration", () => {
  it.each(MECHANICS_QUESTION_PACKAGES)(
    "persists and resolves the full checked package $id",
    async (item) => {
      const directory = await fs.mkdtemp(join(tmpdir(), "mechanics-run-"));
      try {
        const run = await runQuestionGraph(
          mechanicsReplayRequest(item.id),
          createMechanicsReplayAdapters(item.id),
          { store: new JsonlQuestionRunStore(directory) },
        );
        expect(run.status).toBe("awaiting-human-review");
        expect(run.questionPackage).toMatchObject({
          kind: "mechanics-question-package",
          paper: item.paper,
          marks: item.marks,
          visualFamilies: ["mechanics_scene"],
          trainingEligibility: "blocked",
        });
        const reopened = await new JsonlQuestionRunStore(directory).resume(
          run.runId,
        );
        expect(reopened).toEqual(run);
        expect(findReviewablePackage(item.id)?.question.stem).toBe(
          item.question.stem,
        );
        const view = buildReviewView(reopened);
        expect(view.packageResolved).toBe(true);
        expect(view.question?.stem).toBe(item.question.stem);
        expect(view.solution?.parts).toHaveLength(item.solution.parts.length);
        expect(view.renderedVisuals[0].svg).toContain("<svg");
        expect(view.renderedVisuals[0].family).toBe("mechanics_scene");
        expect(view.readiness.ready).toBe(false);
      } finally {
        await fs.rm(directory, { recursive: true, force: true });
      }
    },
  );
  it("rejects an altered authored mechanics artifact", async () => {
    const adapters = createMechanicsReplayAdapters();
    const author = adapters.author;
    adapters.author = async (blueprint, artifacts) => ({
      ...(await author(blueprint, artifacts)),
      marks: 99,
    });
    const run = await runQuestionGraph(mechanicsReplayRequest(), adapters);
    expect(run.status).toBe("rejected");
    expect(run.rejection?.code).toBe("package-validation-failed");
    expect(run.reviewEnvelope).toBeUndefined();
  });
});
