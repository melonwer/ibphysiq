import {
  CandidateQuestionPlan,
  MarkSchemePoint,
  McqOptionItem,
  PhysicsDomainId,
  QuestionDifficulty,
  QuestionFormat,
  StructuredQuestionPart,
  SyllabusId,
  SyllabusTag,
  VerifiedQuantityMap,
} from "@/lib/bank-pipeline/types";
import {
  ItemRolloutEvaluation,
  Step1BatchReceipt,
} from "@/lib/benchmark/types";

export const LIVE_GENERATOR_SCHEMA_VERSION =
  "sixthphysics-live-question/1.0.0" as const;

export const LIVE_BACKEND_KINDS = ["ollama", "openai", "hf"] as const;
export type LiveBackendKind = (typeof LIVE_BACKEND_KINDS)[number];

export const HF_QUANT_MODES = ["4bit", "8bit", "bf16"] as const;
export type HfQuantMode = (typeof HF_QUANT_MODES)[number];

export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL =
  "hf.co/d4ydy/sixthphysics-qwen3.5-9b-GGUF:Q4_K_M";

export const DEFAULT_OPENAI_BASE_URL = "http://127.0.0.1:8080/v1";
export const DEFAULT_OPENAI_MODEL = "sixthphysics-qwen3.5-9b";

export const DEFAULT_HF_BASE_MODEL = "Qwen/Qwen3.5-9B";
export const DEFAULT_HF_ADAPTER = "d4ydy/sixthphysics-qwen3.5-9b-lora";
export const DEFAULT_HF_QUANT: HfQuantMode = "4bit";

export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
}

export interface ChatCompletionOptions {
  temperature: number;
  maxTokens: number;
  seed?: number;
  topP?: number;
}

export interface ChatCompletionResult {
  text: string;
  latencyMs: number;
  model: string;
  backend: LiveBackendKind;
  promptTokens?: number;
  completionTokens?: number;
}

export interface LiveInferenceClient {
  readonly backend: LiveBackendKind;
  readonly model: string;
  chat(
    messages: readonly ChatMessage[],
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult>;
  close?(): Promise<void>;
}

export interface OllamaBackendConfig {
  backend: "ollama";
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  numCtx?: number;
  fetchImpl?: typeof fetch;
}

export interface OpenAiBackendConfig {
  backend: "openai";
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface HfBackendConfig {
  backend: "hf";
  baseModel?: string;
  adapter?: string;
  quant?: HfQuantMode;
  pythonBin?: string;
  bridgeScriptPath?: string;
  deviceMap?: string;
  timeoutMs?: number;
}

export type BackendConfig =
  | OllamaBackendConfig
  | OpenAiBackendConfig
  | HfBackendConfig;

export interface LiveGenerationRequest {
  syllabus: SyllabusId;
  level?: string;
  topicId?: string;
  domain?: PhysicsDomainId;
  conceptId?: string;
  format: QuestionFormat;
  difficulty?: QuestionDifficulty;
  totalMarks?: number;
  seed?: number;
  maxRetries?: number;
  temperature?: number;
  retryTemperature?: number;
  step1MaxTokens?: number;
  step2MaxTokens?: number;
  itemId?: string;
}

export interface ResolvedPromptSlice {
  itemId: string;
  syllabus: SyllabusId;
  level: string;
  topicId: string;
  subtopicId: string;
  topicCode: string;
  topicTitle: string;
  subtopicCode: string;
  subtopicTitle: string;
  conceptId: string;
  conceptTitle: string;
  domain: PhysicsDomainId;
  visualFamily: string;
  templateArchetype: string;
  format: QuestionFormat;
  difficulty: QuestionDifficulty;
  totalMarks: number;
  seed: number;
  gravityConventionMs2: 9.8 | 9.81;
  syllabi: [SyllabusTag];
}

export interface Step1UserRequestPayload {
  task: "generate_verified_physics_question";
  syllabi: [SyllabusTag];
  domain: PhysicsDomainId;
  conceptId: string;
  templateArchetype: string;
  visualFamily: string;
  format: QuestionFormat;
  difficulty: QuestionDifficulty;
  totalMarks: number;
  seed: number;
}

export interface Step1RetryFeedback {
  status: "error";
  errorStage: string;
  errorMessage: string;
  syllabusIssues: string[];
  instruction: string;
}

export interface Step2RetryFeedback {
  gateIssues: string[];
  syllabusIssues: string[];
  instruction: string;
}

export interface VerifiedLiveQuestionPackage {
  schemaVersion: typeof LIVE_GENERATOR_SCHEMA_VERSION;
  id: string;
  generatedAt: string;
  verified: boolean;
  syllabi: SyllabusTag[];
  domain: PhysicsDomainId;
  conceptId: string;
  conceptTitle: string;
  templateArchetype: string;
  visualFamily: string;
  format: QuestionFormat;
  difficulty: QuestionDifficulty;
  totalMarks: number;
  seed: number;
  gravityConventionMs2: 9.8 | 9.81;
  stem: string;
  options?: McqOptionItem[];
  correctOptionIndex?: number;
  parts?: StructuredQuestionPart[];
  workedSolution: string;
  markScheme: MarkSchemePoint[];
  scenarioSpec: Record<string, unknown>;
  hiddenQuantities: string[];
  questionPlan: CandidateQuestionPlan;
  verifiedQuantities: VerifiedQuantityMap;
  formattedQuantities3sf: Record<string, string>;
  solverId: string;
  svgMarkup?: string;
  svgFingerprint?: string | null;
}

export interface LiveAttemptTrace {
  attempt: number;
  phase: "step1" | "step2";
  latencyMs: number;
  rawOutput: string;
  cleanedOutput: string;
  passed: boolean;
  errorSummary?: string;
}

export interface LiveGenerationStats {
  attemptsUsed: number;
  step1Retries: number;
  step2Retries: number;
  totalLatencyMs: number;
  step1LatencyMs: number;
  step2LatencyMs: number;
  backend: LiveBackendKind;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface LiveGenerationRawTurns {
  systemPrompt: string;
  userPromptJson: string;
  assistantStep1Raw: string;
  toolReceiptJson: string;
  assistantStep2Raw: string;
}

export interface LiveGenerationResult {
  verified: boolean;
  slice: ResolvedPromptSlice;
  questionPackage?: VerifiedLiveQuestionPackage;
  svgMarkup?: string;
  step1Receipt?: Step1BatchReceipt;
  evaluation: ItemRolloutEvaluation;
  stats: LiveGenerationStats;
  traces: LiveAttemptTrace[];
  rawTurns: LiveGenerationRawTurns;
}

export interface SavedOutputFiles {
  jsonPath: string;
  markdownPath: string;
  svgPath?: string;
}

export interface TopicListingEntry {
  syllabus: SyllabusId;
  topicId: string;
  topicCode: string;
  topicTitle: string;
  levels: string[];
  domains: PhysicsDomainId[];
  subtopics: Array<{
    subtopicId: string;
    subtopicCode: string;
    subtopicTitle: string;
    levels: string[];
    concepts: string[];
  }>;
}
