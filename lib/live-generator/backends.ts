import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

import {
  BackendConfig,
  ChatCompletionOptions,
  ChatCompletionResult,
  ChatMessage,
  DEFAULT_HF_ADAPTER,
  DEFAULT_HF_BASE_MODEL,
  DEFAULT_HF_QUANT,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
  HfBackendConfig,
  HfQuantMode,
  LiveInferenceClient,
  OllamaBackendConfig,
  OpenAiBackendConfig,
} from "./types";

export interface OllamaChatRequestBody {
  model: string;
  messages: Array<{ role: ChatMessage["role"]; content: string }>;
  stream: false;
  think: false;
  options: {
    temperature: number;
    num_predict: number;
    num_ctx: number;
    seed?: number;
    top_p?: number;
  };
}

export interface OpenAiChatCompatOptions {
  omitChatTemplateKwargs?: boolean;
  wrapToolRoleAsUser?: boolean;
}

export interface OpenAiChatRequestBody {
  model: string;
  messages: Array<{ role: ChatMessage["role"]; content: string }>;
  stream: false;
  temperature: number;
  max_tokens: number;
  seed?: number;
  top_p?: number;
  chat_template_kwargs?: {
    enable_thinking: false;
  };
}

export function buildOllamaChatPayload(
  model: string,
  messages: readonly ChatMessage[],
  options: ChatCompletionOptions,
  numCtx = 8192,
): OllamaChatRequestBody {
  return {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: false,
    think: false,
    options: {
      temperature: options.temperature,
      num_predict: options.maxTokens,
      num_ctx: numCtx,
      ...(options.seed !== undefined ? { seed: options.seed } : {}),
      ...(options.topP !== undefined && options.temperature > 0
        ? { top_p: options.topP }
        : {}),
    },
  };
}

/**
 * Under Qwen3.5's chat template, a `user` turn wrapped in
 * `<tool_response>\n...\n</tool_response>` renders to the exact same token
 * sequence as a `tool` turn while satisfying strict OpenAI-schema servers that
 * reject `role: "tool"` without an assistant `tool_calls` array.
 */
export function normalizeOpenAiMessagesForStrictToolCompat(
  messages: readonly ChatMessage[],
): Array<{ role: ChatMessage["role"]; content: string }> {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "user",
        content: `<tool_response>\n${m.content}\n</tool_response>`,
      };
    }
    return { role: m.role, content: m.content };
  });
}

export function buildOpenAiChatPayload(
  model: string,
  messages: readonly ChatMessage[],
  options: ChatCompletionOptions,
  compat: OpenAiChatCompatOptions = {},
): OpenAiChatRequestBody {
  const formattedMessages = compat.wrapToolRoleAsUser
    ? normalizeOpenAiMessagesForStrictToolCompat(messages)
    : messages.map((m) => ({ role: m.role, content: m.content }));

  return {
    model,
    messages: formattedMessages,
    stream: false,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.topP !== undefined && options.temperature > 0
      ? { top_p: options.topP }
      : {}),
    ...(compat.omitChatTemplateKwargs
      ? {}
      : { chat_template_kwargs: { enable_thinking: false } }),
  };
}

export function resolveOpenAiChatEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  if (/\/v\d+$/i.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function describeFetchError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) {
      return `${error.message} (${cause.message})`;
    }
    if (
      cause &&
      typeof cause === "object" &&
      "code" in cause &&
      typeof (cause as { code?: unknown }).code === "string"
    ) {
      return `${error.message} (${(cause as { code: string }).code})`;
    }
    return error.message;
  }
  return String(error);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extractErrorSnippet(bodyText: string): string {
  const trimmed = bodyText.trim();
  if (!trimmed) return "";
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (isPlainObject(parsed)) {
      if (typeof parsed.error === "string") {
        return parsed.error;
      }
      if (isPlainObject(parsed.error) && typeof parsed.error.message === "string") {
        return parsed.error.message;
      }
      if (typeof parsed.message === "string") {
        return parsed.message;
      }
    }
  } catch {
    // plain text body
  }
  return trimmed.slice(0, 300);
}

export class OllamaBackend implements LiveInferenceClient {
  public readonly backend = "ollama" as const;
  public readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly numCtx: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OllamaBackendConfig) {
    this.model = config.model?.trim() || DEFAULT_OLLAMA_MODEL;
    this.baseUrl = (config.baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.timeoutMs = config.timeoutMs ?? 180_000;
    this.numCtx = config.numCtx ?? 8192;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  public async chat(
    messages: readonly ChatMessage[],
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const endpoint = `${this.baseUrl}/api/chat`;
    const body = buildOllamaChatPayload(
      this.model,
      messages,
      options,
      this.numCtx,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = Date.now();

    try {
      let response: Response;
      try {
        response = await this.fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        const detail = describeFetchError(error);
        if (controller.signal.aborted) {
          throw new Error(
            `Ollama request timed out after ${Math.round(this.timeoutMs / 1000)}s at ${endpoint}.`,
          );
        }
        throw new Error(
          `Cannot reach Ollama at ${this.baseUrl} (${detail}). Start Ollama ('ollama serve') and pull the model ('ollama pull ${this.model}').`,
        );
      }

      const rawText = await response.text();
      if (!response.ok) {
        const snippet = extractErrorSnippet(rawText);
        if (
          response.status === 404 ||
          /not found|pull|no such model/i.test(snippet)
        ) {
          throw new Error(
            `Ollama model "${this.model}" is not pulled at ${this.baseUrl} (${snippet || `HTTP ${response.status}`}). Run: ollama pull ${this.model}`,
          );
        }
        throw new Error(
          `Ollama request failed with HTTP ${response.status} at ${endpoint}: ${snippet || "empty error response"}`,
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new Error(
          `Ollama returned non-JSON response from ${endpoint}: "${rawText.slice(0, 160)}"`,
        );
      }

      if (!isPlainObject(parsed)) {
        throw new Error(`Ollama returned unexpected payload from ${endpoint}`);
      }

      const messageObj = isPlainObject(parsed.message) ? parsed.message : undefined;
      const content =
        messageObj && typeof messageObj.content === "string"
          ? messageObj.content
          : typeof parsed.response === "string"
            ? parsed.response
            : "";

      const latencyMs = Date.now() - start;
      const promptTokens =
        typeof parsed.prompt_eval_count === "number"
          ? parsed.prompt_eval_count
          : undefined;
      const completionTokens =
        typeof parsed.eval_count === "number" ? parsed.eval_count : undefined;

      return {
        text: content,
        latencyMs,
        model: this.model,
        backend: "ollama",
        ...(promptTokens !== undefined ? { promptTokens } : {}),
        ...(completionTokens !== undefined ? { completionTokens } : {}),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export class OpenAiCompatibleBackend implements LiveInferenceClient {
  public readonly backend = "openai" as const;
  public readonly model: string;
  private readonly baseUrl: string;
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private compatState: OpenAiChatCompatOptions = {};

  constructor(config: OpenAiBackendConfig) {
    this.model = config.model?.trim() || DEFAULT_OPENAI_MODEL;
    this.baseUrl = (config.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.endpoint = resolveOpenAiChatEndpoint(this.baseUrl);
    this.apiKey = config.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
    this.timeoutMs = config.timeoutMs ?? 180_000;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  private async postChat(
    body: OpenAiChatRequestBody,
  ): Promise<{ ok: boolean; status: number; rawText: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      let response: Response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        const detail = describeFetchError(error);
        if (controller.signal.aborted) {
          throw new Error(
            `OpenAI-compatible request timed out after ${Math.round(this.timeoutMs / 1000)}s at ${this.endpoint}.`,
          );
        }
        throw new Error(
          `Cannot reach OpenAI-compatible server at ${this.endpoint} (${detail}). Start llama-server / LM Studio / vLLM or pass --base-url.`,
        );
      }

      const rawText = await response.text();
      return { ok: response.ok, status: response.status, rawText };
    } finally {
      clearTimeout(timer);
    }
  }

  public async chat(
    messages: readonly ChatMessage[],
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const start = Date.now();
    let payload = buildOpenAiChatPayload(
      this.model,
      messages,
      options,
      this.compatState,
    );
    let resp = await this.postChat(payload);

    // Gracefully fall back if a strict OpenAI-compatible server rejects
    // `chat_template_kwargs` or bare `role: "tool"` messages without `tool_calls`.
    if (!resp.ok && (resp.status === 400 || resp.status === 422)) {
      const snippet = extractErrorSnippet(resp.rawText);
      const hasToolRole = messages.some((m) => m.role === "tool");
      const nextCompat: OpenAiChatCompatOptions = { ...this.compatState };
      let shouldRetry = false;

      if (
        !nextCompat.omitChatTemplateKwargs &&
        /chat_template_kwargs|unknown|extra|unrecognized|additional/i.test(
          snippet,
        )
      ) {
        nextCompat.omitChatTemplateKwargs = true;
        shouldRetry = true;
      }
      if (
        hasToolRole &&
        !nextCompat.wrapToolRoleAsUser &&
        /tool|role|tool_call_id|messages/i.test(snippet)
      ) {
        nextCompat.wrapToolRoleAsUser = true;
        shouldRetry = true;
      }
      if (
        !shouldRetry &&
        (!nextCompat.omitChatTemplateKwargs ||
          (hasToolRole && !nextCompat.wrapToolRoleAsUser))
      ) {
        nextCompat.omitChatTemplateKwargs = true;
        if (hasToolRole) {
          nextCompat.wrapToolRoleAsUser = true;
        }
        shouldRetry = true;
      }

      if (shouldRetry) {
        this.compatState = nextCompat;
        payload = buildOpenAiChatPayload(
          this.model,
          messages,
          options,
          this.compatState,
        );
        resp = await this.postChat(payload);
      }
    }

    if (!resp.ok) {
      const snippet = extractErrorSnippet(resp.rawText);
      throw new Error(
        `OpenAI-compatible server returned HTTP ${resp.status} at ${this.endpoint}: ${snippet || "empty error response"}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(resp.rawText);
    } catch {
      throw new Error(
        `OpenAI-compatible server returned non-JSON response from ${this.endpoint}: "${resp.rawText.slice(0, 160)}"`,
      );
    }

    if (!isPlainObject(parsed) || !Array.isArray(parsed.choices)) {
      throw new Error(
        `OpenAI-compatible response missing 'choices' array from ${this.endpoint}`,
      );
    }

    const firstChoice = parsed.choices[0];
    const msg =
      isPlainObject(firstChoice) && isPlainObject(firstChoice.message)
        ? firstChoice.message
        : undefined;
    const text =
      msg && typeof msg.content === "string"
        ? msg.content
        : isPlainObject(firstChoice) && typeof firstChoice.text === "string"
          ? firstChoice.text
          : "";

    const usage = isPlainObject(parsed.usage) ? parsed.usage : undefined;
    const promptTokens =
      usage && typeof usage.prompt_tokens === "number"
        ? usage.prompt_tokens
        : undefined;
    const completionTokens =
      usage && typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : undefined;

    return {
      text,
      latencyMs: Date.now() - start,
      model: this.model,
      backend: "openai",
      ...(promptTokens !== undefined ? { promptTokens } : {}),
      ...(completionTokens !== undefined ? { completionTokens } : {}),
    };
  }
}

interface PendingBridgeLine {
  resolve: (line: string) => void;
  reject: (err: Error) => void;
}

export class HfLocalBridgeBackend implements LiveInferenceClient {
  public readonly backend = "hf" as const;
  public readonly model: string;
  private readonly baseModel: string;
  private readonly adapter: string;
  private readonly quant: HfQuantMode;
  private readonly pythonBin: string;
  private readonly bridgeScriptPath: string;
  private readonly deviceMap: string;
  private readonly timeoutMs: number;

  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private lineQueue: string[] = [];
  private waiters: PendingBridgeLine[] = [];
  private stderrChunks: string[] = [];
  private readyPromise: Promise<void> | null = null;

  constructor(config: HfBackendConfig) {
    this.baseModel = config.baseModel?.trim() || DEFAULT_HF_BASE_MODEL;
    this.adapter =
      config.adapter !== undefined
        ? config.adapter.trim()
        : DEFAULT_HF_ADAPTER;
    this.quant = config.quant ?? DEFAULT_HF_QUANT;
    this.model = this.adapter
      ? `${this.baseModel}+${this.adapter} (${this.quant})`
      : `${this.baseModel} (${this.quant})`;
    this.pythonBin =
      config.pythonBin?.trim() ||
      process.env.SIXTHPHYSICS_PYTHON?.trim() ||
      "python3";
    this.bridgeScriptPath =
      config.bridgeScriptPath?.trim() ||
      path.resolve(process.cwd(), "training/qwen35/local_nf4_bridge.py");
    this.deviceMap = config.deviceMap?.trim() || "auto";
    this.timeoutMs = config.timeoutMs ?? 600_000;
  }

  private pushLine(line: string): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve(line);
    } else {
      this.lineQueue.push(line);
    }
  }

  private failAllWaiters(err: Error): void {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter.reject(err);
    }
  }

  private nextJsonLine(timeoutMs: number): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `HF NF4 bridge timed out after ${Math.round(timeoutMs / 1000)}s. Recent stderr: ${this.stderrChunks.slice(-8).join("").trim()}`,
          ),
        );
      }, timeoutMs);

      const handleLine = (line: string): void => {
        clearTimeout(timer);
        try {
          const parsed: unknown = JSON.parse(line);
          if (!isPlainObject(parsed)) {
            reject(
              new Error(
                `HF NF4 bridge emitted non-object JSON: "${line.slice(0, 160)}"`,
              ),
            );
            return;
          }
          resolve(parsed);
        } catch (error) {
          reject(
            new Error(
              `HF NF4 bridge emitted malformed JSON (${error instanceof Error ? error.message : String(error)}): "${line.slice(0, 160)}"`,
            ),
          );
        }
      };

      const queued = this.lineQueue.shift();
      if (queued !== undefined) {
        handleLine(queued);
        return;
      }

      this.waiters.push({
        resolve: handleLine,
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  private async ensureStarted(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = (async () => {
      const args = [
        this.bridgeScriptPath,
        "--serve-stdio",
        "--base-model",
        this.baseModel,
        "--quant",
        this.quant,
        "--device-map",
        this.deviceMap,
      ];
      if (this.adapter && this.adapter.toLowerCase() !== "none") {
        args.push("--adapter", this.adapter);
      }

      const child = spawn(this.pythonBin, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          TOKENIZERS_PARALLELISM: "false",
        },
      });
      this.proc = child;
      this.stderrChunks = [];
      this.lineQueue = [];
      this.waiters = [];

      child.stderr.on("data", (chunk: Buffer) => {
        this.stderrChunks.push(chunk.toString("utf8"));
        if (this.stderrChunks.length > 64) {
          this.stderrChunks.shift();
        }
      });

      child.on("error", (err) => {
        this.failAllWaiters(
          new Error(
            `Failed to launch Python HF bridge (${this.pythonBin}): ${err.message}`,
          ),
        );
      });

      child.on("close", (code, signal) => {
        const stderrTail = this.stderrChunks.join("").trim().slice(-800);
        this.failAllWaiters(
          new Error(
            `HF NF4 bridge exited unexpectedly (code=${String(code)}, signal=${String(signal)}). ${stderrTail}`,
          ),
        );
        this.proc = null;
        this.rl = null;
        this.readyPromise = null;
      });

      const rl = readline.createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });
      this.rl = rl;
      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (trimmed) {
          this.pushLine(trimmed);
        }
      });

      const readyMsg = await this.nextJsonLine(this.timeoutMs);
      if (readyMsg.ok === false || readyMsg.type === "error") {
        throw new Error(
          `HF NF4 bridge startup error: ${String(readyMsg.error ?? "unknown error")}`,
        );
      }
      if (readyMsg.type !== "ready") {
        throw new Error(
          `HF NF4 bridge sent unexpected startup banner: ${JSON.stringify(readyMsg)}`,
        );
      }
    })();

    try {
      await this.readyPromise;
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  public async chat(
    messages: readonly ChatMessage[],
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    await this.ensureStarted();
    if (!this.proc || this.proc.killed) {
      throw new Error("HF NF4 bridge process is not running");
    }

    const start = Date.now();
    const requestPayload = {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      ...(options.seed !== undefined ? { seed: options.seed } : {}),
      ...(options.topP !== undefined ? { top_p: options.topP } : {}),
    };

    this.proc.stdin.write(`${JSON.stringify(requestPayload)}\n`, "utf8");
    const response = await this.nextJsonLine(this.timeoutMs);

    if (response.ok !== true) {
      throw new Error(
        `HF NF4 bridge inference failed: ${String(response.error ?? "unknown error")}`,
      );
    }

    const text = typeof response.text === "string" ? response.text : "";
    const latencyMs =
      typeof response.latency_ms === "number"
        ? Math.round(response.latency_ms)
        : Date.now() - start;
    const promptTokens =
      typeof response.prompt_tokens === "number"
        ? response.prompt_tokens
        : undefined;
    const completionTokens =
      typeof response.completion_tokens === "number"
        ? response.completion_tokens
        : undefined;

    return {
      text,
      latencyMs,
      model: this.model,
      backend: "hf",
      ...(promptTokens !== undefined ? { promptTokens } : {}),
      ...(completionTokens !== undefined ? { completionTokens } : {}),
    };
  }

  public async close(): Promise<void> {
    this.readyPromise = null;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.proc) {
      const proc = this.proc;
      this.proc = null;
      try {
        proc.stdin.end();
      } catch {
        // ignore broken pipe
      }
      if (!proc.killed) {
        proc.kill("SIGTERM");
      }
    }
  }
}

export function createInferenceClient(
  config: BackendConfig,
): LiveInferenceClient {
  if (config.backend === "ollama") {
    return new OllamaBackend(config);
  }
  if (config.backend === "openai") {
    return new OpenAiCompatibleBackend(config);
  }
  return new HfLocalBridgeBackend(config);
}
