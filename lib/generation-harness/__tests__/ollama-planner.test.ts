import { createServer, Server } from "node:http";
import { createOllamaPlanner, LocalModelConfig } from "../ollama-planner";
import { QuestionBlueprint, QuestionRunRequest } from "../question-run";

const request: QuestionRunRequest = {
  mode: "generate",
  paper: "1A",
  level: "SL",
  topics: ["mechanics"],
  assessedSkills: ["conserve momentum"],
  difficulty: "standard",
  visualPolicy: "required",
};
const blueprint: QuestionBlueprint = {
  schemaVersion: "question-blueprint/0.1.0",
  id: "momentum-plan",
  paper: "1A",
  level: "SL",
  topic: "mechanics",
  assessedSkills: ["conserve momentum"],
  structure: "multiple-choice",
  scenarioKind: "cart-collision",
  visual: {
    required: true,
    purposes: ["show initial cart motion"],
    families: ["mechanics_scene"],
  },
  novelty: { strategy: "original-generation" },
};

describe("local Qwen planner", () => {
  let server: Server;
  let config: LocalModelConfig;
  let content: unknown;
  let status: number;
  let reason: string;

  beforeEach(async () => {
    content = blueprint;
    status = 200;
    reason = "stop";
    server = createServer((_request, response) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          model: "qwen3:8b",
          done: true,
          done_reason: reason,
          message: {
            role: "assistant",
            content:
              typeof content === "string" ? content : JSON.stringify(content),
          },
          eval_count: 75,
        }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test server address");
    config = {
      baseUrl: `http://127.0.0.1:${address.port}`,
      model: "qwen3:8b",
      timeoutMs: 2000,
      maxOutputTokens: 512,
    };
  });
  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("returns a validated plan through a real HTTP boundary", async () => {
    const planner = createOllamaPlanner(
      [{ scenarioKind: "cart-collision", visualFamilies: ["mechanics_scene"] }],
      config,
    );
    expect(await planner(request)).toEqual(blueprint);
  });
  it("rejects an unsupported scenario despite valid JSON", async () => {
    content = { ...blueprint, scenarioKind: "unimplemented-nuclear-model" };
    const planner = createOllamaPlanner(
      [{ scenarioKind: "cart-collision", visualFamilies: ["mechanics_scene"] }],
      config,
    );
    await expect(planner(request)).rejects.toMatchObject({
      code: "unsupported-physics",
      retryable: false,
    });
  });
  it("allows a model-decides request without a visual for a nonvisual capability", async () => {
    content = {
      ...blueprint,
      visual: { required: false, families: [], purposes: [] },
    };
    const planner = createOllamaPlanner(
      [{ scenarioKind: "cart-collision", visualFamilies: [] }],
      config,
    );
    expect(
      await planner({ ...request, visualPolicy: "model-decides" }),
    ).toEqual(content);
    await expect(planner(request)).rejects.toMatchObject({
      code: "unsupported-visual-family",
      retryable: false,
    });
  });
  it("rejects changes to requested paper and assessed skills", async () => {
    content = { ...blueprint, paper: "2", assessedSkills: ["invented skill"] };
    const planner = createOllamaPlanner(
      [{ scenarioKind: "cart-collision", visualFamilies: ["mechanics_scene"] }],
      config,
    );
    await expect(planner(request)).rejects.toMatchObject({
      code: "invalid-blueprint",
      retryable: true,
    });
  });
  it("rejects malformed model JSON and truncated completion", async () => {
    const planner = createOllamaPlanner(
      [{ scenarioKind: "cart-collision", visualFamilies: ["mechanics_scene"] }],
      config,
    );
    content = "this is not JSON";
    await expect(planner(request)).rejects.toMatchObject({
      code: "invalid-structured-output",
    });
    content = blueprint;
    reason = "length";
    await expect(planner(request)).rejects.toMatchObject({
      code: "invalid-structured-output",
    });
  });
  it("makes provider failures eligible for the graph's bounded retry", async () => {
    status = 503;
    const planner = createOllamaPlanner(
      [{ scenarioKind: "cart-collision", visualFamilies: ["mechanics_scene"] }],
      config,
    );
    await expect(planner(request)).rejects.toMatchObject({
      code: "internal-stage-error",
      retryable: true,
    });
  });
  it("rejects non-local endpoints before making requests", () => {
    expect(() =>
      createOllamaPlanner(
        [
          {
            scenarioKind: "cart-collision",
            visualFamilies: ["mechanics_scene"],
          },
        ],
        { ...config, baseUrl: "https://example.com" },
      ),
    ).toThrow("loopback");
  });
});
