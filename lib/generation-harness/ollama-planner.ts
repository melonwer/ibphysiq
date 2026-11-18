import { artifactJsonSchema, validateArtifact } from "./contracts";
import type { QuestionBlueprint, QuestionRunRequest } from "./question-run";
import { QuestionRunStageError } from "./question-run-graph";
import { JsonSchema, SchemaNode, validateSchemaValue } from "./schema";

export interface LocalModelConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
}

export const DEFAULT_LOCAL_MODEL_CONFIG: LocalModelConfig = {
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen3:8b",
  timeoutMs: 60_000,
  maxOutputTokens: 1600,
};

export interface PlannerCapability {
  scenarioKind: string;
  visualFamilies: string[];
}

export interface LocalModelReceipt {
  model: string;
  endpoint: string;
  outputTokens: number;
  durationNs: number;
  thinkingEnabled: false;
}

interface ChatResponse {
  model: string;
  done: boolean;
  done_reason?: string;
  message: { role: "assistant"; content: string };
  eval_count?: number;
  total_duration?: number;
}

const responseSchema: SchemaNode = {
  kind: "object",
  allowAdditionalProperties: true,
  properties: {
    model: { kind: "string", minLength: 1 },
    done: { kind: "boolean" },
    done_reason: { kind: "string", optional: true },
    message: {
      kind: "object",
      allowAdditionalProperties: true,
      properties: {
        role: { kind: "string", values: ["assistant"] },
        content: { kind: "string", minLength: 1 },
      },
    },
    eval_count: { kind: "integer", minimum: 0, optional: true },
    total_duration: { kind: "number", minimum: 0, optional: true },
  },
};

function chatEndpoint(config: LocalModelConfig): string {
  const url = new URL(config.baseUrl);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Local model baseUrl must be a loopback HTTP origin");
  if (
    !config.model.trim() ||
    !Number.isInteger(config.timeoutMs) ||
    config.timeoutMs < 100 ||
    config.timeoutMs > 300_000 ||
    !Number.isInteger(config.maxOutputTokens) ||
    config.maxOutputTokens < 64 ||
    config.maxOutputTokens > 8192
  )
    throw new Error("Invalid local model limits");
  return new URL("/api/chat", url).toString();
}

export function createOllamaPlanner(
  capabilities: readonly [PlannerCapability, ...PlannerCapability[]],
  config: LocalModelConfig = DEFAULT_LOCAL_MODEL_CONFIG,
  onReceipt: (receipt: LocalModelReceipt) => void = () => {},
  onContent: (content: string) => void = () => {},
  onRequest: (body: Record<string, unknown>) => void = () => {},
): (request: QuestionRunRequest) => Promise<QuestionBlueprint> {
  chatEndpoint(config);
  return async (request) => {
    const value = await callOllamaJson(
      config,
      artifactJsonSchema("question-blueprint"),
      [
        {
          role: "system",
          content:
            "Plan one IB Physics question using only the supplied supported scenarios. " +
            "Return the question-blueprint/0.1.0 JSON contract. Copy the requested paper, level and assessedSkills exactly. " +
            "Use the first requested topic as topic. Paper 1A requires multiple-choice and Paper 2 requires multipart. " +
            "Use source-replay novelty for a source-replay request and original-generation otherwise. " +
            "Copy sourcePackageRef when supplied; omit it otherwise. A forbidden visual policy uses required=false and empty families/purposes. " +
            "Otherwise use the selected capability's visualFamilies. Set required=true only when that list is nonempty; empty families also need empty purposes. " +
            "A required visual policy cannot select a capability with no visual families. Do not invent physics or renderer names. " +
            "This stage supplies a plan only; do not author answers or claim acceptance.",
        },
        {
          role: "user",
          content: JSON.stringify({
            request,
            supportedScenarios: capabilities,
            schema: artifactJsonSchema("question-blueprint"),
          }),
        },
      ],
      onReceipt,
      onContent,
      onRequest,
    );
    const validation = validateArtifact("question-blueprint", value);
    if (!validation.valid)
      throw new QuestionRunStageError(
        "invalid-structured-output",
        validation.issues.map((issue) => issue.message).join("; "),
        true,
      );
    const blueprint = value as QuestionBlueprint;
    const capability = capabilities.find(
      (candidate) => candidate.scenarioKind === blueprint.scenarioKind,
    );
    if (!capability)
      throw new QuestionRunStageError(
        "unsupported-physics",
        "Model planned an unsupported physics scenario",
      );
    const expectedFamilies =
      request.visualPolicy === "forbidden" ? [] : capability.visualFamilies;
    if (request.visualPolicy === "required" && expectedFamilies.length === 0)
      throw new QuestionRunStageError(
        "unsupported-visual-family",
        "Requested visual has no supported renderer",
      );
    if (
      blueprint.paper !== request.paper ||
      blueprint.level !== request.level ||
      blueprint.topic !== request.topics[0] ||
      JSON.stringify(blueprint.assessedSkills) !==
        JSON.stringify(request.assessedSkills) ||
      blueprint.structure !==
        (request.paper === "1A" ? "multiple-choice" : "multipart") ||
      blueprint.sourcePackageRef !== request.sourcePackageRef ||
      blueprint.novelty.strategy !==
        (request.mode === "source-replay"
          ? "source-replay"
          : "original-generation") ||
      blueprint.visual.required !== expectedFamilies.length > 0 ||
      (expectedFamilies.length === 0 && blueprint.visual.purposes.length !== 0)
    )
      throw new QuestionRunStageError(
        "invalid-blueprint",
        "Model plan differs from the generation request",
        true,
      );
    if (
      JSON.stringify([...blueprint.visual.families].sort()) !==
      JSON.stringify([...expectedFamilies].sort())
    )
      throw new QuestionRunStageError(
        "unsupported-visual-family",
        "Model planned an unsupported or mismatched renderer",
      );
    return blueprint;
  };
}

export async function callOllamaJson(
  config: LocalModelConfig,
  schema: JsonSchema,
  messages: ReadonlyArray<{ role: "system" | "user"; content: string }>,
  onReceipt: (receipt: LocalModelReceipt) => void = () => {},
  onContent: (content: string) => void = () => {},
  onRequest: (body: Record<string, unknown>) => void = () => {},
): Promise<unknown> {
  const endpoint = chatEndpoint(config);
  const body = {
    model: config.model,
    stream: false,
    think: false,
    keep_alive: "2m",
    format: schema,
    options: { temperature: 0, seed: 42, num_predict: config.maxOutputTokens },
    messages,
  };
  onRequest(body);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(config.timeoutMs),
      body: JSON.stringify(body),
    });
  } catch {
    throw new QuestionRunStageError(
      "internal-stage-error",
      "Local model request failed or exceeded its time limit",
      true,
    );
  }
  if (!response.ok)
    throw new QuestionRunStageError(
      "internal-stage-error",
      `Local model returned HTTP ${response.status}`,
      response.status >= 500 || response.status === 429,
    );
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new QuestionRunStageError(
      "invalid-structured-output",
      "Local model did not return a JSON response",
      true,
    );
  }
  const envelope = validateSchemaValue(responseSchema, raw);
  if (!envelope.valid)
    throw new QuestionRunStageError(
      "invalid-structured-output",
      envelope.issues.map((issue) => issue.message).join("; "),
      true,
    );
  const chat = raw as ChatResponse;
  onContent(chat.message.content);
  onReceipt({
    model: chat.model,
    endpoint,
    outputTokens: chat.eval_count ?? 0,
    durationNs: chat.total_duration ?? 0,
    thinkingEnabled: false,
  });
  if (
    !chat.done ||
    chat.done_reason === "length" ||
    chat.model !== config.model
  )
    throw new QuestionRunStageError(
      "invalid-structured-output",
      "Local model response is incomplete or uses a different model",
      true,
    );
  try {
    return JSON.parse(chat.message.content);
  } catch {
    throw new QuestionRunStageError(
      "invalid-structured-output",
      "Local model content is not JSON",
      true,
    );
  }
}
