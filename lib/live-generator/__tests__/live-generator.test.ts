import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { QWEN_HARNESS_SYSTEM_PROMPT } from "@/lib/bank-pipeline/distillation-trace";
import {
  buildAugmentedSystemPrompt,
  buildOllamaChatPayload,
  buildOpenAiChatPayload,
  buildStep1Messages,
  buildStep1UserPayload,
  ChatCompletionOptions,
  ChatCompletionResult,
  ChatMessage,
  DEFAULT_OLLAMA_MODEL,
  formatQuestionMarkdown,
  formatQuestionTerminal,
  generateVerifiedQuestion,
  getDomainToolSchemas,
  listAvailableTopics,
  LiveInferenceClient,
  OllamaBackend,
  OpenAiCompatibleBackend,
  resolveOpenAiChatEndpoint,
  resolvePromptSlice,
  stripThinkingAndFences,
  writeGenerationArtifacts,
} from "@/lib/live-generator";
import {
  parseGenerateLiveArgs,
  runGenerateLiveCli,
} from "@/scripts/generate-with-model";

function createScriptedClient(
  responses: Array<(messages: readonly ChatMessage[], options: ChatCompletionOptions) => string>,
): {
  client: LiveInferenceClient;
  calls: Array<{ messages: ChatMessage[]; options: ChatCompletionOptions }>;
} {
  const calls: Array<{ messages: ChatMessage[]; options: ChatCompletionOptions }> = [];
  let cursor = 0;

  const client: LiveInferenceClient = {
    backend: "ollama",
    model: "mock-sixthphysics-qwen3.5-9b",
    async chat(messages, options): Promise<ChatCompletionResult> {
      const cloned = messages.map((m) => ({ ...m }));
      calls.push({ messages: cloned, options: { ...options } });
      const responder = responses[cursor];
      cursor += 1;
      if (!responder) {
        throw new Error(`Mock LLM ran out of scripted responses at call #${cursor}`);
      }
      return {
        text: responder(cloned, options),
        latencyMs: 12,
        model: "mock-sixthphysics-qwen3.5-9b",
        backend: "ollama",
        promptTokens: 320,
        completionTokens: 140,
      };
    },
  };

  return { client, calls };
}

function makeResponse(status: number, body: unknown): Response {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(raw, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("SixthPhysics Live Generator — Prompt Template & Schema Introspection", () => {
  it("derives all 11 domain tool schemas purely from code without reading dataset/", () => {
    const schemas = getDomainToolSchemas();
    expect(schemas.zeroDatasetReadsVerified).toBe(true);
    expect(schemas.totalDomains).toBe(11);
    expect(schemas.totalScenarioKinds).toBeGreaterThanOrEqual(90);

    for (const domain of schemas.domainOrder) {
      const entry = schemas.domains[domain];
      expect(entry.compactPromptSummary).toContain(`Domain "${domain}"`);
      expect(entry.supportedScenarioKinds.length).toBeGreaterThan(0);
    }

    // Cross-check against checked-in/local dataset/sixthphysics-bank-v2/domain-tool-schemas.json if present
    const localSchemasPath = path.resolve(
      process.cwd(),
      "dataset/sixthphysics-bank-v2/domain-tool-schemas.json",
    );
    if (fs.existsSync(localSchemasPath)) {
      const onDisk = JSON.parse(fs.readFileSync(localSchemasPath, "utf8")) as {
        domains: Record<string, { compactPromptSummary: string }>;
      };
      for (const domain of schemas.domainOrder) {
        expect(schemas.domains[domain].compactPromptSummary).toBe(
          onDisk.domains[domain].compactPromptSummary,
        );
      }
    }
  });

  it("matches exact modal_autonomous_pipeline.py augmented system prompt and train.jsonl contract", () => {
    const slice = resolvePromptSlice({
      syllabus: "ib",
      level: "SL",
      domain: "grav-astro",
      conceptId: "uniform-circular-motion",
      format: "mcq",
      difficulty: "foundation",
      seed: 20261337,
    });

    const [sysMsg, userMsg] = buildStep1Messages(slice);
    const schemas = getDomainToolSchemas();
    const expectedCompact = schemas.domains["grav-astro"].compactPromptSummary;

    expect(sysMsg.role).toBe("system");
    expect(sysMsg.content.startsWith(QWEN_HARNESS_SYSTEM_PROMPT)).toBe(true);
    expect(sysMsg.content).toContain("\n\n--- DOMAIN TOOL & SYLLABUS CONTRACT ---\n");
    expect(sysMsg.content).toContain(expectedCompact);
    expect(sysMsg.content).toContain(
      'Step 1 JSON format: {"action":"solve_and_render_scenario","domain":"grav-astro","scenarioSpec":{"kind":"..."},"hiddenQuantities":["..."],"questionPlan":{"targetSummary":"..."}}',
    );
    expect(sysMsg.content).toContain("IB Physics uses g = 9.8 m s^-2");
    expect(sysMsg.content).toContain("UK A-Level and NCUK IFY use g = 9.81 m s^-2.");

    const userPayload = JSON.parse(userMsg.content) as Record<string, unknown>;
    expect(Object.keys(userPayload)).toEqual([
      "task",
      "syllabi",
      "domain",
      "conceptId",
      "templateArchetype",
      "visualFamily",
      "format",
      "difficulty",
      "totalMarks",
      "seed",
    ]);
    expect(userPayload.task).toBe("generate_verified_physics_question");
    expect(userPayload.domain).toBe("grav-astro");
    expect(userPayload.format).toBe("mcq");
    expect(userPayload.totalMarks).toBe(1);
    expect(userPayload.seed).toBe(20261337);

    // Exact alignment verification against train.jsonl if present on disk
    const trainPath = path.resolve(
      process.cwd(),
      "dataset/sixthphysics-bank-v2/distillation/train.jsonl",
    );
    if (fs.existsSync(trainPath)) {
      const firstLine = fs.readFileSync(trainPath, "utf8").split("\n")[0];
      const trainRow = JSON.parse(firstLine) as {
        messages: Array<{ role: string; content: string }>;
      };
      const trainSys = trainRow.messages[0].content;
      const trainUser = JSON.parse(trainRow.messages[1].content) as Record<
        string,
        unknown
      >;
      expect(buildAugmentedSystemPrompt("grav-astro", trainSys)).toBe(
        sysMsg.content,
      );
      expect(Object.keys(buildStep1UserPayload(slice))).toEqual(
        Object.keys(trainUser),
      );
    }
  });

  it("strips closed <think>, orphaned </think>, <tool_call>, and markdown fences cleanly", () => {
    expect(
      stripThinkingAndFences(
        '<think>\nlet me reason carefully\n</think>\n\n```json\n{"action":"solve_and_render_scenario"}\n```',
      ),
    ).toBe('{"action":"solve_and_render_scenario"}');

    expect(
      stripThinkingAndFences(
        'reasoning prefix when server prefilled opening tag\n</think>\n\n{"ok":true}',
      ),
    ).toBe('{"ok":true}');

    expect(
      stripThinkingAndFences('<tool_call>\n{"domain":"circuits"}\n</tool_call>'),
    ).toBe('{"domain":"circuits"}');
  });

  it("resolves valid crosswalk slices across IB, A-Level, and NCUK and rejects invalid levels", () => {
    const ibSlice = resolvePromptSlice({
      syllabus: "ib",
      level: "SL",
      topicId: "A.2",
      format: "mcq",
      seed: 10,
    });
    expect(ibSlice.gravityConventionMs2).toBe(9.8);
    expect(ibSlice.syllabi[0].syllabus).toBe("ib");
    expect(ibSlice.syllabi[0].level).toBe("SL");

    const alevelSlice = resolvePromptSlice({
      syllabus: "alevel",
      level: "Y12",
      domain: "circuits",
      format: "structured",
      seed: 22,
    });
    expect(alevelSlice.gravityConventionMs2).toBe(9.81);
    expect(alevelSlice.totalMarks).toBe(6);

    const ncukSlice = resolvePromptSlice({
      syllabus: "ncuk",
      topicId: "AC2",
      format: "mcq",
      seed: 33,
    });
    expect(ncukSlice.gravityConventionMs2).toBe(9.81);
    expect(ncukSlice.topicId).toBe("ncuk-ac2");

    expect(() =>
      resolvePromptSlice({
        syllabus: "ib",
        level: "Y13",
        format: "mcq",
        seed: 1,
      }),
    ).toThrow(/Invalid level "Y13" for syllabus "ib"/);
  });
});

describe("SixthPhysics Live Generator — Multi-Backend Payloads & Adapters", () => {
  it("builds Ollama /api/chat payload with stream:false, think:false, and deterministic temperature", async () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ];
    const payload = buildOllamaChatPayload(
      DEFAULT_OLLAMA_MODEL,
      msgs,
      { temperature: 0, maxTokens: 768, seed: 42 },
      8192,
    );
    expect(payload.stream).toBe(false);
    expect(payload.think).toBe(false);
    expect(payload.options.temperature).toBe(0);
    expect(payload.options.num_predict).toBe(768);
    expect(payload.options.num_ctx).toBe(8192);
    expect(payload.options.seed).toBe(42);

    const captured: Array<{ url: string; init?: RequestInit }> = [];
    const mockFetch: typeof fetch = async (input, init) => {
      captured.push({ url: String(input), init });
      return makeResponse(200, {
        message: { role: "assistant", content: '{"ok":true}' },
        prompt_eval_count: 111,
        eval_count: 22,
      });
    };

    const backend = new OllamaBackend({
      backend: "ollama",
      baseUrl: "http://127.0.0.1:11434/",
      fetchImpl: mockFetch,
    });
    const out = await backend.chat(msgs, { temperature: 0, maxTokens: 512, seed: 7 });
    expect(captured[0].url).toBe("http://127.0.0.1:11434/api/chat");
    const sent = JSON.parse(String(captured[0].init?.body)) as Record<string, unknown>;
    expect(sent.think).toBe(false);
    expect(sent.stream).toBe(false);
    expect(out.text).toBe('{"ok":true}');
    expect(out.promptTokens).toBe(111);
    expect(out.completionTokens).toBe(22);
  });

  it("produces clear actionable Ollama errors on connection refusal and missing model", async () => {
    const offlineBackend = new OllamaBackend({
      backend: "ollama",
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(
      offlineBackend.chat([{ role: "user", content: "hi" }], {
        temperature: 0,
        maxTokens: 64,
      }),
    ).rejects.toThrow(/ollama serve.*ollama pull/i);

    const missingModelBackend = new OllamaBackend({
      backend: "ollama",
      model: "hf.co/d4ydy/sixthphysics-qwen3.5-9b-GGUF:Q4_K_M",
      fetchImpl: async () =>
        makeResponse(404, { error: "model 'foo' not found, try pulling it first" }),
    });
    await expect(
      missingModelBackend.chat([{ role: "user", content: "hi" }], {
        temperature: 0,
        maxTokens: 64,
      }),
    ).rejects.toThrow(/ollama pull hf\.co\/d4ydy\/sixthphysics-qwen3\.5-9b-GGUF:Q4_K_M/);
  });

  it("builds OpenAI-compatible payloads with enable_thinking:false and handles strict HTTP 400 fallback", async () => {
    expect(resolveOpenAiChatEndpoint("http://127.0.0.1:8080/v1")).toBe(
      "http://127.0.0.1:8080/v1/chat/completions",
    );
    expect(resolveOpenAiChatEndpoint("http://127.0.0.1:8080")).toBe(
      "http://127.0.0.1:8080/v1/chat/completions",
    );

    const msgs: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "u" },
      { role: "assistant", content: '{"action":"solve_and_render_scenario"}' },
      { role: "tool", content: '{"status":"verified"}' },
    ];
    const directPayload = buildOpenAiChatPayload("sixthphysics-qwen3.5-9b", msgs, {
      temperature: 0,
      maxTokens: 1400,
    });
    expect(directPayload.chat_template_kwargs).toEqual({ enable_thinking: false });

    const requests: Array<{ headers: HeadersInit | undefined; body: Record<string, unknown> }> = [];
    const strictFetch: typeof fetch = async (_input, init) => {
      const parsedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ headers: init?.headers, body: parsedBody });
      if (requests.length === 1) {
        return makeResponse(400, {
          error: {
            message:
              "Unknown field chat_template_kwargs and role 'tool' requires tool_call_id",
          },
        });
      }
      return makeResponse(200, {
        choices: [{ message: { role: "assistant", content: '{"format":"mcq"}' } }],
        usage: { prompt_tokens: 200, completion_tokens: 55 },
      });
    };

    const backend = new OpenAiCompatibleBackend({
      backend: "openai",
      baseUrl: "http://127.0.0.1:8080/v1",
      apiKey: "test-key-placeholder",
      fetchImpl: strictFetch,
    });
    const res = await backend.chat(msgs, { temperature: 0, maxTokens: 1400 });

    expect(requests).toHaveLength(2);
    expect((requests[0].headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key-placeholder",
    );
    expect(requests[1].body.chat_template_kwargs).toBeUndefined();
    const fallbackMsgs = requests[1].body.messages as Array<{
      role: string;
      content: string;
    }>;
    expect(fallbackMsgs[3]).toEqual({
      role: "user",
      content: '<tool_response>\n{"status":"verified"}\n</tool_response>',
    });
    expect(res.text).toBe('{"format":"mcq"}');
    expect(res.promptTokens).toBe(200);
    expect(res.completionTokens).toBe(55);
  });
});

describe("SixthPhysics Live Generator — Closed-Loop 2-Turn Neuro-Symbolic Harness", () => {
  const validBankedCurveStep1Ib = JSON.stringify({
    action: "solve_and_render_scenario",
    domain: "grav-astro",
    scenarioSpec: {
      kind: "banked-curve",
      id: "live-ib-grav-astro-mcq",
      massKg: 160,
      radiusM: 32,
      bankAngleDeg: 14,
      staticFrictionCoeff: 0,
      gravityMs2: 9.8,
    },
    hiddenQuantities: [
      "idealSpeedMs",
      "speedMs",
      "normalForceN",
      "centripetalAccelMs2",
      "centripetalForceN",
    ],
    questionPlan: {
      targetSummary:
        "Resolve normal reaction horizontally and vertically to determine the frictionless design speed of a banked velodrome curve",
      distractorStrategy: [
        "radial-or-component-projection-inversion",
        "missing-prefactor-or-sign-reversal",
        "omitted-square-root",
      ],
    },
  });

  const validBankedCurveStep2Ib = JSON.stringify({
    format: "mcq",
    difficulty: "foundation",
    stem: "An Olympic track cyclist of mass 160 kg rounds a velodrome curve of horizontal radius 32 m banked at 14 ° to the horizontal. Take g = 9.8 m s⁻². At what design speed is zero lateral friction required along the slope?",
    options: [
      { label: "A", text: "8.84 m s⁻¹", isCorrect: true },
      {
        label: "B",
        text: "17.4 m s⁻¹",
        isCorrect: false,
        distractorRationale: "Substitutes cos θ in place of tan θ inside the radical.",
      },
      {
        label: "C",
        text: "35.5 m s⁻¹",
        isCorrect: false,
        distractorRationale: "Divides g r by tan θ after swapping vertical and horizontal components.",
      },
      {
        label: "D",
        text: "78.2 m s⁻¹",
        isCorrect: false,
        distractorRationale: "Evaluates v² = g r tan θ and omits the square root.",
      },
    ],
    correctOptionIndex: 0,
    workedSolution:
      "With zero slope friction, N cos θ = mg and N sin θ = m v² / r. Dividing gives v = √(g r tan θ) = √(9.8 × 32 × tan 14°) = 8.84 m s⁻¹.",
    markScheme: [
      {
        code: "A1",
        criterion: "Uses v = √(g r tan 14°) to obtain 8.84 m s⁻¹.",
        marks: 1,
      },
    ],
    totalMarks: 1,
  });

  it("verifies a 0-retry IB SL MCQ end-to-end with real solver, SVG non-leakage, package-gate, and artifact export", async () => {
    const { client, calls } = createScriptedClient([
      () => `<think>\nChecking banked curve parameters.\n</think>\n${validBankedCurveStep1Ib}`,
      (messages) => {
        // Verify Turn 2 receives the exact real physics_harness tool receipt
        expect(messages).toHaveLength(4);
        expect(messages[3].role).toBe("tool");
        const receipt = JSON.parse(messages[3].content) as {
          status: string;
          formattedQuantities3sf: Record<string, string>;
          visualReceipt: { rendered: boolean };
        };
        expect(receipt.status).toBe("verified");
        expect(receipt.formattedQuantities3sf.idealSpeedMs).toBe("8.84");
        expect(receipt.visualReceipt.rendered).toBe(true);
        return validBankedCurveStep2Ib;
      },
    ]);

    const result = await generateVerifiedQuestion(
      {
        syllabus: "ib",
        level: "SL",
        domain: "grav-astro",
        conceptId: "uniform-circular-motion",
        format: "mcq",
        difficulty: "foundation",
        seed: 20261337,
        maxRetries: 1,
      },
      client,
    );

    expect(calls).toHaveLength(2);
    expect(result.verified).toBe(true);
    expect(result.evaluation.step1SolverPass).toBe(true);
    expect(result.evaluation.step2AuthorGatePass).toBe(true);
    expect(result.evaluation.syllabusAligned).toBe(true);
    expect(result.evaluation.endToEndVerified).toBe(true);
    expect(result.stats.attemptsUsed).toBe(1);
    expect(result.stats.step1Retries).toBe(0);
    expect(result.stats.step2Retries).toBe(0);
    expect(result.svgMarkup).toContain("<svg");
    expect(result.questionPackage?.verified).toBe(true);
    expect(result.questionPackage?.formattedQuantities3sf.idealSpeedMs).toBe("8.84");

    // Verify artifact writing (.json, .svg, .md) and formatters
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sp-live-gen-"));
    try {
      const saved = writeGenerationArtifacts(result, tmpDir);
      expect(fs.existsSync(saved.jsonPath)).toBe(true);
      expect(fs.existsSync(saved.markdownPath)).toBe(true);
      expect(saved.svgPath && fs.existsSync(saved.svgPath)).toBe(true);

      const md = formatQuestionMarkdown(result, path.basename(saved.svgPath!));
      expect(md).toContain("VERIFIED");
      expect(md).toContain("8.84 m s⁻¹");
      expect(md).toContain("![Physics Diagram]");

      const terminal = formatQuestionTerminal(result, saved);
      expect(terminal).toContain("[PASS] VERIFIED");
      expect(terminal).toContain("8.84 m s⁻¹");
      expect(terminal).toContain(saved.svgPath!);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("verifies a 0-retry UK A-Level structured circuit question with real solver & SVG", async () => {
    const step1Circuit = JSON.stringify({
      action: "solve_and_render_scenario",
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV: 12,
        internalOhm: 1,
        seriesOhm: 3,
        parallelBranchOhms: [6, 12],
      },
      hiddenQuantities: ["parallelOhm", "totalCurrentA", "terminalVoltageV"],
      questionPlan: {
        targetSummary: "Compute combined external resistance and supply current in a DC resistor network",
        subpartStrategy: [
          "part (a): find parallel combination resistance",
          "part (b): find total current from the cell",
          "part (c): determine terminal potential difference across the cell",
        ],
      },
    });

    // Real physics: R_par = 4 Ohm, R_ext = 7 Ohm, R_tot = 8 Ohm, I = 1.50 A, V_term = 10.5 V
    const step2Circuit = JSON.stringify({
      format: "structured",
      difficulty: "standard",
      stem: "A cell of emf 12 V and internal resistance 1.0 Ω is connected in series with a 3.0 Ω resistor and a parallel combination of a 6.0 Ω resistor and a 12 Ω resistor.",
      parts: [
        {
          partId: "a",
          prompt: "Calculate the combined resistance of the two parallel branches.",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "parallelOhm",
          expectedAnswer: "4.00 Ω",
          workingSteps: ["1/R_p = 1/6 + 1/12 = 3/12", "R_p = 4.00 Ω"],
        },
        {
          partId: "b",
          prompt: "Calculate the total current supplied by the cell.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetMode: "quantitative",
          targetQuantityKey: "totalCurrentA",
          expectedAnswer: "1.50 A",
          workingSteps: ["R_total = 1 + 3 + 4 = 8.00 Ω", "I = 12 / 8.00 = 1.50 A"],
        },
        {
          partId: "c",
          prompt: "Determine the terminal potential difference across the cell.",
          marks: 2,
          dependsOnPartIds: ["b"],
          targetMode: "quantitative",
          targetQuantityKey: "terminalVoltageV",
          expectedAnswer: "10.5 V",
          workingSteps: ["V = ε - Ir = 12 - (1.50)(1.0) = 10.5 V"],
        },
      ],
      workedSolution:
        "(a) 1/R_p = 1/6 + 1/12 = 1/4 so R_p = 4.00 Ω. (b) Total resistance is 1 + 3 + 4 = 8.00 Ω so I = 12 / 8.00 = 1.50 A. (c) Terminal voltage V = 12 - 1.50 × 1 = 10.5 V.",
      markScheme: [
        { code: "M1", partId: "a", criterion: "Applies 1/R_p = 1/6 + 1/12.", marks: 1 },
        { code: "A1", partId: "a", criterion: "Obtains R_p = 4.00 Ω.", marks: 1 },
        { code: "M1", partId: "b", criterion: "Adds series and internal resistances to get 8.00 Ω.", marks: 1 },
        { code: "A1", partId: "b", criterion: "Calculates total current I = 1.50 A.", marks: 1 },
        { code: "M1", partId: "c", criterion: "Applies V = ε - Ir.", marks: 1 },
        { code: "A1", partId: "c", criterion: "Obtains terminal voltage 10.5 V.", marks: 1 },
      ],
      totalMarks: 6,
    });

    const { client } = createScriptedClient([
      () => step1Circuit,
      () => step2Circuit,
    ]);

    const result = await generateVerifiedQuestion(
      {
        syllabus: "alevel",
        level: "Y12",
        domain: "circuits",
        format: "structured",
        difficulty: "standard",
        totalMarks: 6,
        seed: 77,
      },
      client,
    );

    expect(result.verified).toBe(true);
    expect(result.svgMarkup).toContain("<svg");
    expect(result.questionPackage?.parts).toHaveLength(3);
    expect(result.questionPackage?.totalMarks).toBe(6);
  });

  it("recovers via 1-retry on Step 1 when Attempt 1 violates IB gravity or solver constraints", async () => {
    const wrongGravityStep1 = JSON.stringify({
      action: "solve_and_render_scenario",
      domain: "grav-astro",
      scenarioSpec: {
        kind: "banked-curve",
        id: "live-ib-wrong-g",
        massKg: 160,
        radiusM: 32,
        bankAngleDeg: 14,
        staticFrictionCoeff: 0,
        gravityMs2: 9.81, // IB requires 9.8!
      },
      hiddenQuantities: ["idealSpeedMs"],
      questionPlan: {
        targetSummary: "Find frictionless banking speed",
      },
    });

    const { client, calls } = createScriptedClient([
      () => wrongGravityStep1,
      (messages) => {
        // Retry prompt must include deterministic gravity diagnostic
        expect(messages[1].content).toContain("PREVIOUS_ATTEMPT_DIAGNOSTIC:");
        expect(messages[1].content).toContain("9.8");
        return validBankedCurveStep1Ib;
      },
      () => validBankedCurveStep2Ib,
    ]);

    const result = await generateVerifiedQuestion(
      {
        syllabus: "ib",
        level: "SL",
        domain: "grav-astro",
        conceptId: "uniform-circular-motion",
        format: "mcq",
        difficulty: "foundation",
        seed: 20261337,
        maxRetries: 1,
      },
      client,
    );

    expect(calls).toHaveLength(3);
    expect(result.verified).toBe(true);
    expect(result.stats.step1Retries).toBe(1);
    expect(result.stats.step2Retries).toBe(0);
    expect(result.stats.attemptsUsed).toBe(2);
    expect(result.traces[0].passed).toBe(false);
    expect(result.traces[0].errorSummary).toContain("gravity-convention-mismatch");
    expect(result.traces[1].passed).toBe(true);
  });

  it("recovers via 1-retry on Step 2 when Attempt 1 fails 3-sf ground truth gate", async () => {
    const wrongAnswerStep2 = JSON.stringify({
      format: "mcq",
      difficulty: "foundation",
      stem: "An Olympic track cyclist of mass 160 kg rounds a velodrome curve of horizontal radius 32 m banked at 14 ° to the horizontal. Take g = 9.8 m s⁻². At what design speed is zero lateral friction required along the slope?",
      options: [
        { label: "A", text: "12.3 m s⁻¹", isCorrect: true }, // Wrong vs 8.84!
        {
          label: "B",
          text: "17.4 m s⁻¹",
          isCorrect: false,
          distractorRationale: "Uses cos instead of tan.",
        },
        {
          label: "C",
          text: "35.5 m s⁻¹",
          isCorrect: false,
          distractorRationale: "Inverts tan.",
        },
        {
          label: "D",
          text: "78.2 m s⁻¹",
          isCorrect: false,
          distractorRationale: "Forgets square root.",
        },
      ],
      correctOptionIndex: 0,
      workedSolution: "Evaluates v = 12.3 m s⁻¹.",
      markScheme: [{ code: "A1", criterion: "Obtains 12.3 m s⁻¹.", marks: 1 }],
      totalMarks: 1,
    });

    const { client, calls } = createScriptedClient([
      () => validBankedCurveStep1Ib,
      () => wrongAnswerStep2,
      (messages) => {
        // Step 2 retry tool receipt must include exact gate failure codes!
        const toolPayload = JSON.parse(messages[3].content) as {
          retryFeedback?: { gateIssues: string[] };
        };
        expect(toolPayload.retryFeedback).toBeDefined();
        expect(toolPayload.retryFeedback!.gateIssues.join(" ")).toContain(
          "ground-truth-mismatch",
        );
        return validBankedCurveStep2Ib;
      },
    ]);

    const result = await generateVerifiedQuestion(
      {
        syllabus: "ib",
        level: "SL",
        domain: "grav-astro",
        conceptId: "uniform-circular-motion",
        format: "mcq",
        difficulty: "foundation",
        seed: 20261337,
        maxRetries: 1,
      },
      client,
    );

    expect(calls).toHaveLength(3);
    expect(result.verified).toBe(true);
    expect(result.stats.step1Retries).toBe(0);
    expect(result.stats.step2Retries).toBe(1);
    expect(result.stats.attemptsUsed).toBe(2);
    expect(result.traces[1].passed).toBe(false);
    expect(result.traces[2].passed).toBe(true);
  });

  it("returns verified:false with full diagnostics when maxRetries is 0 and Step 1 fails", async () => {
    const { client } = createScriptedClient([
      () => '{"action":"solve_and_render_scenario","domain":"grav-astro","scenarioSpec":{"kind":"banked-curve","massKg":-5},"hiddenQuantities":["idealSpeedMs"],"questionPlan":{"targetSummary":"Bad spec"}}',
    ]);

    const result = await generateVerifiedQuestion(
      {
        syllabus: "ib",
        level: "SL",
        domain: "grav-astro",
        conceptId: "uniform-circular-motion",
        format: "mcq",
        seed: 5,
        maxRetries: 0,
      },
      client,
    );

    expect(result.verified).toBe(false);
    expect(result.evaluation.step1SolverPass).toBe(false);
    expect(result.evaluation.step1ErrorStage).toBe("scenario-validation");
    expect(result.stats.step1Retries).toBe(0);
  });
});

describe("SixthPhysics Live Generator — CLI Parsing, --help, and --list-topics", () => {
  it("parses all supported CLI flags cleanly", () => {
    const parsed = parseGenerateLiveArgs([
      "--syllabus",
      "alevel",
      "--level=Y13",
      "--topic",
      "3.6",
      "--domain",
      "grav-astro",
      "--format",
      "structured",
      "--difficulty",
      "higher",
      "--count",
      "2",
      "--backend",
      "openai",
      "--model",
      "sixthphysics-qwen3.5-9b",
      "--base-url",
      "http://127.0.0.1:8080/v1",
      "--retries",
      "2",
      "--out",
      "./out-test",
      "--json",
    ]);

    expect(parsed.syllabus).toBe("alevel");
    expect(parsed.level).toBe("Y13");
    expect(parsed.topic).toBe("3.6");
    expect(parsed.domain).toBe("grav-astro");
    expect(parsed.format).toBe("structured");
    expect(parsed.difficulty).toBe("higher");
    expect(parsed.count).toBe(2);
    expect(parsed.backend).toBe("openai");
    expect(parsed.baseUrl).toBe("http://127.0.0.1:8080/v1");
    expect(parsed.retries).toBe(2);
    expect(parsed.outDir).toBe("./out-test");
    expect(parsed.json).toBe(true);
  });

  it("handles --help and --list-topics cleanly in-process and via tsx subprocess", async () => {
    let helpOut = "";
    const helpCode = await runGenerateLiveCli(["--help"], {
      stdout: (s) => {
        helpOut += s;
      },
    });
    expect(helpCode).toBe(0);
    expect(helpOut).toContain("npm run generate:live");
    expect(helpOut).toContain("--backend");
    expect(helpOut).toContain("--list-topics");

    let topicsOut = "";
    const topicsCode = await runGenerateLiveCli(
      ["--list-topics", "--syllabus", "ib"],
      {
        stdout: (s) => {
          topicsOut += s;
        },
      },
    );
    expect(topicsCode).toBe(0);
    expect(topicsOut).toContain("IB PHYSICS (g = 9.8 m s^-2)");
    expect(topicsOut).toContain("ib-theme-a");
    expect(listAvailableTopics().length).toBeGreaterThan(10);

    // Real CLI subprocess smoke check
    const cliHelp = execFileSync(
      "npx",
      ["tsx", "scripts/generate-with-model.ts", "--help"],
      { encoding: "utf8", cwd: process.cwd() },
    );
    expect(cliHelp).toContain("SixthPhysics Live Neuro-Symbolic Question Generator");

    const cliTopics = execFileSync(
      "npx",
      ["tsx", "scripts/generate-with-model.ts", "--list-topics", "--syllabus", "ncuk"],
      { encoding: "utf8", cwd: process.cwd() },
    );
    expect(cliTopics).toContain("NCUK PHYSICS (g = 9.81 m s^-2)");
    expect(cliTopics).toContain("ncuk-ac2");
  });

  it("runs CLI end-to-end with --json and --out using a mocked client and exits 0", async () => {
    const step1 = JSON.stringify({
      action: "solve_and_render_scenario",
      domain: "grav-astro",
      scenarioSpec: {
        kind: "banked-curve",
        id: "cli-ib-mcq",
        massKg: 160,
        radiusM: 32,
        bankAngleDeg: 14,
        staticFrictionCoeff: 0,
        gravityMs2: 9.8,
      },
      hiddenQuantities: ["idealSpeedMs", "speedMs"],
      questionPlan: {
        targetSummary: "Calculate frictionless banking speed",
      },
    });
    const step2 = JSON.stringify({
      format: "mcq",
      difficulty: "foundation",
      stem: "A cyclist of mass 160 kg rounds a velodrome curve of radius 32 m banked at 14 ° (g = 9.8 m s⁻²). What is the frictionless design speed?",
      options: [
        { label: "A", text: "8.84 m s⁻¹", isCorrect: true },
        {
          label: "B",
          text: "17.4 m s⁻¹",
          isCorrect: false,
          distractorRationale: "Uses cos θ instead of tan θ.",
        },
        {
          label: "C",
          text: "35.5 m s⁻¹",
          isCorrect: false,
          distractorRationale: "Divides by tan θ.",
        },
        {
          label: "D",
          text: "78.2 m s⁻¹",
          isCorrect: false,
          distractorRationale: "Omits the square root.",
        },
      ],
      correctOptionIndex: 0,
      workedSolution: "v = √(g r tan θ) = √(9.8 × 32 × tan 14°) = 8.84 m s⁻¹.",
      markScheme: [{ code: "A1", criterion: "Obtains 8.84 m s⁻¹.", marks: 1 }],
      totalMarks: 1,
    });

    const { client } = createScriptedClient([() => step1, () => step2]);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sp-live-cli-"));
    try {
      let stdout = "";
      let stderr = "";
      const code = await runGenerateLiveCli(
        [
          "--syllabus",
          "ib",
          "--level",
          "SL",
          "--domain",
          "grav-astro",
          "--concept",
          "uniform-circular-motion",
          "--format",
          "mcq",
          "--difficulty",
          "foundation",
          "--seed",
          "20261337",
          "--out",
          tmpDir,
          "--json",
        ],
        {
          stdout: (s) => {
            stdout += s;
          },
          stderr: (s) => {
            stderr += s;
          },
          clientOverride: client,
        },
      );

      expect(stderr).toBe("");
      expect(code).toBe(0);
      const parsed = JSON.parse(stdout) as {
        verified: boolean;
        savedFiles?: { jsonPath: string; markdownPath: string; svgPath?: string };
      };
      expect(parsed.verified).toBe(true);
      expect(parsed.savedFiles?.jsonPath && fs.existsSync(parsed.savedFiles.jsonPath)).toBe(true);
      expect(parsed.savedFiles?.markdownPath && fs.existsSync(parsed.savedFiles.markdownPath)).toBe(true);
      expect(parsed.savedFiles?.svgPath && fs.existsSync(parsed.savedFiles.svgPath)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
