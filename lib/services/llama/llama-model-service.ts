/**
 * Service for interacting with fine-tuned Llama model on Hugging Face
 */

import { HfInference } from '@huggingface/inference';
import {
  RawQuestion,
  IBPhysicsSubtopic,
  QuestionDifficulty,
  createModelError
} from '../../types/question-generation';
import { LlamaModelService as ILlamaModelService } from '../../interfaces/question-generation-services';
import { PromptGenerator } from './prompt-generator';
import { LlamaResponseParser } from './llama-response-parser';

const maskSecret = (s?: string) => {
  if (!s) return '';
  const str = String(s);
  return str.length <= 4 ? '****' : '****' + str.slice(-4);
};

const truncate = (s?: string, n = 300) => {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
};

export interface LlamaConfig {
  apiKey: string;
  modelId: string;
  maxRetries: number;
  timeoutMs: number;
  temperature: number;
  maxTokens: number;
  topP: number;
  // Optional Lightning AI (LIT) provider fields
  litUrl?: string;
  litToken?: string;
  provider?: 'lit' | 'huggingface';
}

export class LlamaModelService implements ILlamaModelService {
  private hf: HfInference | null;
  private config: LlamaConfig;
  private isInitialized: boolean = false;
  private modelInfo: { version: string; status: string } = { version: 'unknown', status: 'not_initialized' };
  // If local TGI returns auth errors (403) we disable further attempts to it for the life of this process
  private localTgiDisabled: boolean = false;

  constructor(config: LlamaConfig) {
    this.config = config;
    console.log('[LlamaModelService] Constructor called with config:', {
      provider: config.provider,
      modelId: config.modelId,
      hasApiKey: !!config.apiKey,
      hasLitUrl: !!config.litUrl,
      hasLitToken: !!config.litToken,
      timeoutMs: config.timeoutMs
    });
    this.hf = (config.apiKey && config.apiKey.length > 0) ? new HfInference(config.apiKey) : null;
    console.log('[LlamaModelService] HF client initialized:', !!this.hf);
  }

  /**
   * Initialize the model service
   */
  async initialize(): Promise<void> {
    console.log('[LlamaModelService] Initializing service, development mode:', this.isDevelopmentMode());
    console.log('[LlamaModelService] Config provider:', this.config.provider);

    // Check if we're in development mode with placeholder API key
    if (this.isDevelopmentMode()) {
      this.isInitialized = true;
      this.modelInfo = {
        version: 'development-fallback',
        status: 'ready'
      };
      console.log('🔧 Development mode: Using fallback questions (API key not configured)');
      return;
    }

    try {
      console.log('[LlamaModelService] Testing model connection...');
      // Test model availability
      await this.testModelConnection();
      this.isInitialized = true;
      this.modelInfo = {
        version: this.config.modelId,
        status: 'ready'
      };
      console.log('[LlamaModelService] Initialization successful');
    } catch (error) {
      console.error('[LlamaModelService] Model connection test failed:', error);
      this.modelInfo.status = 'error';
      console.warn(`⚠️ Model ${this.config.modelId} not available, falling back to demo questions`);

      // Don't throw error, just mark as initialized with fallback mode
      this.isInitialized = true;
      this.modelInfo = {
        version: 'demo-fallback',
        status: 'fallback'
      };
    }
  }

  /**
   * Generate a physics question for the specified topic
   */
  async generateQuestion(topic: IBPhysicsSubtopic, difficulty: QuestionDifficulty = 'standard'): Promise<RawQuestion> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Use fallback questions in development mode
    if (this.isDevelopmentMode()) {
      return this.generateFallbackQuestion(topic, difficulty);
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const prompt = PromptGenerator.generateQuestionPrompt(topic, difficulty);
        const response = await this.callModel(prompt);
        
        // Parse the response
        const parseResult = LlamaResponseParser.parseResponse(response, topic);
        
        if (parseResult.success && parseResult.question) {
          return parseResult.question;
        } else {
          throw new Error(`Parse failed on attempt ${attempt}: ${parseResult.error}`);
        }
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        console.warn(`Llama generation attempt ${attempt} failed:`, lastError.message);
        
        // If this is not the last attempt, wait before retrying
        if (attempt < this.config.maxRetries) {
          await this.delay(this.getRetryDelay(attempt));
        }
      }
    }

    // All attempts failed
    throw createModelError({
      type: 'llama_failure',
      message: `Failed to generate question after ${this.config.maxRetries} attempts: ${lastError?.message}`,
      context: {
        topic,
        difficulty,
        lastError: lastError?.message
      },
      retryable: true
    });
  }

  /**
   * Check if the model service is available
   */
  isAvailable(): boolean {
    return this.isInitialized && this.modelInfo.status === 'ready';
  }

  /**
   * Get model information
   */
  getModelInfo(): { version: string; status: string } {
    return { ...this.modelInfo };
  }

  /**
   * Call the Hugging Face model
   */
  private async callModel(prompt: string): Promise<string> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // First try a local text-generation API if configured (e.g. text-generation-webui / TGI)
    const localUrl = process.env.LOCAL_TGI_URL;
    if (localUrl && !this.localTgiDisabled) {
      let id: ReturnType<typeof setTimeout> | null = null;
      try {
        const endpoint = `${localUrl.replace(/\/$/, '')}/api/v1/generate`;
        console.info(`[LlamaModelService] attempting local TGI at ${endpoint}`);
        const controller = new AbortController();
        id = setTimeout(() => controller.abort(), this.config.timeoutMs);
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_new_tokens: this.config.maxTokens,
              temperature: this.config.temperature,
              top_p: this.config.topP,
              do_sample: true
            }
          }),
          signal: controller.signal
        });
        if (id) { clearTimeout(id); id = null; }

        const raw = await res.text();
        console.info(`[LlamaModelService] local TGI response status=${res.status} body=${truncate(raw, 1000)}`);

        if (res.ok) {
          let json: any = null;
          try { json = JSON.parse(raw); } catch (e) { /* plain text */ }

          const text =
            (json?.results?.[0]?.text) ||
            json?.generated_text ||
            (json?.output && (json.output[0]?.text || json.output[0]?.generated_text)) ||
            (Array.isArray(json?.data) && json.data[0]?.text) ||
            (typeof raw === 'string' ? raw : null) ||
            null;

          if (text) {
            return text;
          } else {
            throw new Error("Local server returned no generated text");
          }
        } else {
          // disable local TGI fast if 403 to avoid repeated retries
          if (res.status === 403) {
            console.warn(`[LlamaModelService] local TGI returned 403 — disabling local TGI for this process.`);
            this.localTgiDisabled = true;
          }
          throw new Error(`Local server returned status ${res.status}`);
        }
      } catch (err: any) {
        if (id) { clearTimeout(id); id = null; }
        console.warn("Local generation failed, falling back to other providers:", err);
      }
    }
 
    // Next try Lightning AI / LIT endpoint if configured in config
    if (this.config.litUrl) {
      let id: ReturnType<typeof setTimeout> | null = null;
      try {
        const endpoint = this.config.litUrl.replace(/\/$/, '');
        console.info(`[LlamaModelService] attempting LIT at ${endpoint} token=${maskSecret(this.config.litToken)}`);
        const controller = new AbortController();
        id = setTimeout(() => controller.abort(), this.config.timeoutMs);
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.config.litToken ? { "Authorization": `Bearer ${this.config.litToken}` } : {})
          },
          body: JSON.stringify({
            inputs: prompt,
            max_new_tokens: this.config.maxTokens,
            temperature: this.config.temperature,
            top_p: this.config.topP
          }),
          signal: controller.signal
        });
        if (id) { clearTimeout(id); id = null; }

        const raw = await res.text();
        console.info(`[LlamaModelService] LIT response status=${res.status} body=${truncate(raw, 1000)}`);

        if (res.ok) {
          let json: any = null;
          try { json = JSON.parse(raw); } catch (e) { /* ignore parse error */ }

          // Robust extraction: handle JSON-in-string in json.response, or many shapes
          let text: string | null = null;

          if (json) {
            text =
              (json?.results?.[0]?.text) ||
              json?.generated_text ||
              (json?.output && (json.output[0]?.text || json.output[0]?.generated_text)) ||
              (Array.isArray(json?.data) && json.data[0]?.text) ||
              null;

            if (!text && typeof json.response === 'string') {
              const respStr: string = json.response;
              // Try to parse embedded JSON prefix then extract tail text
              let parsedInner: any = null;
              let jsonEndPos: number | null = null;
              const bracePositions: number[] = [];
              for (let i = 0; i < respStr.length; i++) if (respStr[i] === '}') bracePositions.push(i);
              for (const pos of bracePositions) {
                const candidate = respStr.slice(0, pos + 1);
                try {
                  parsedInner = JSON.parse(candidate);
                  jsonEndPos = pos;
                  break;
                } catch {}
              }
              if (parsedInner && jsonEndPos !== null) {
                const tail = respStr.slice(jsonEndPos + 1).trim();
                text = tail || parsedInner?.output || parsedInner?.generated_text || null;
              } else {
                const m = respStr.match(/}\s+/);
                if (m && m.index !== undefined) text = respStr.slice(m.index + 1).trim();
                else {
                  try {
                    const inner = JSON.parse(respStr);
                    text = inner?.output || inner?.generated_text || respStr;
                  } catch {
                    text = respStr;
                  }
                }
              }
            }
          }

          if (!text && typeof raw === 'string') {
            const m = raw.match(/}\s+/);
            if (m && m.index !== undefined) text = raw.slice(m.index + 1).trim();
            else text = raw;
          }

          if (text) return text;
          throw new Error("LIT endpoint returned no generated text");
        } else {
          throw new Error(`LIT endpoint returned status ${res.status}`);
        }
      } catch (err) {
        if (id) { clearTimeout(id); id = null; }
        console.warn("LIT generation failed, falling back to Hugging Face:", err);
      }
    }
 
    // Only attempt Hugging Face if it's properly configured
    if (this.hf && this.config.apiKey && this.config.apiKey.length > 0 && this.config.apiKey.startsWith('hf_')) {
      try {
        console.log('[LlamaModelService] Attempting Hugging Face call, HF client exists:', !!this.hf);

      const requestPromise = this.hf.textGeneration({
        model: this.config.modelId,
        inputs: prompt,
        parameters: {
          max_new_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          top_p: this.config.topP,
          do_sample: true,
          return_full_text: false
        }
      });

      // Create a per-request timeout for the Hugging Face call
      const hfTimeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Model API timeout')), this.config.timeoutMs);
      });

      const result = await Promise.race([requestPromise, hfTimeoutPromise]);

      if (!result || typeof result !== "object" || !("generated_text" in result)) {
        if (timeoutId) clearTimeout(timeoutId);
        throw new Error("Empty response from model");
      }

      if (timeoutId) clearTimeout(timeoutId);
      return (result as any).generated_text;

    } catch (error) {
      if (error instanceof Error) {
        // Handle specific Hugging Face API errors
        if (error.message.includes("quota") || error.message.includes("limit")) {
          throw createModelError({
            type: "api_limit",
            message: "Hugging Face API quota or rate limit exceeded",
            context: { originalError: error.message },
            retryable: false
          });
        }

        if (error.message.includes("model") && error.message.includes("loading")) {
          throw createModelError({
            type: "llama_failure",
            message: "Model is still loading, please try again",
            context: { originalError: error.message },
            retryable: true
          });
        }
      }

      throw error;
    }
  }

  // No provider available
  console.error('[LlamaModelService] No model provider available - local TGI, LIT, and Hugging Face all failed or not configured');
  throw new Error('No model provider available');
  }

  /**
   * Test model connection
   */
  private async testModelConnection(): Promise<void> {
    const testPrompt = PromptGenerator.generateQuestionPrompt(IBPhysicsSubtopic.KINEMATICS, 'standard');
    
    try {
      const response = await this.callModel(testPrompt.substring(0, 500) + '\n\nGenerate a simple test response.');
      
      if (!response || response.length < 10) {
        throw new Error('Model test failed: insufficient response');
      }
      
    } catch (error) {
      throw new Error(`Model connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get retry delay with exponential backoff
   */
  private getRetryDelay(attempt: number): number {
    return Math.min(2000 * Math.pow(2, attempt - 1), 30000); // Max 30 seconds
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate multiple questions for batch processing
   */
  async generateMultipleQuestions(
    topics: IBPhysicsSubtopic[], 
    difficulty: QuestionDifficulty = 'standard'
  ): Promise<RawQuestion[]> {
    const questions: RawQuestion[] = [];
    const errors: Error[] = [];

    for (const topic of topics) {
      try {
        const question = await this.generateQuestion(topic, difficulty);
        questions.push(question);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (questions.length === 0 && errors.length > 0) {
      throw createModelError({
        type: 'llama_failure',
        message: `Failed to generate any questions. Errors: ${errors.map(e => e.message).join(', ')}`,
        context: { topics, difficulty, errorCount: errors.length },
        retryable: true
      });
    }

    return questions;
  }

  /**
   * Get service statistics
   */
  getStats(): {
    modelId: string;
    isInitialized: boolean;
    status: string;
    config: {
      maxRetries: number;
      timeoutMs: number;
      temperature: number;
      maxTokens: number;
    };
  } {
    return {
      modelId: this.config.modelId,
      isInitialized: this.isInitialized,
      status: this.modelInfo.status,
      config: {
        maxRetries: this.config.maxRetries,
        timeoutMs: this.config.timeoutMs,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens
      }
    };
  }

  /**
   * Update model configuration
   */
  updateConfig(updates: Partial<LlamaConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Reinitialize HF client if API key changed
    if (updates.apiKey) {
      this.hf = new HfInference(updates.apiKey);
      this.isInitialized = false;
      this.modelInfo.status = 'not_initialized';
    } else if (updates.litUrl) {
      // Switched to LIT provider — drop HF client
      this.hf = null;
      this.isInitialized = false;
      this.modelInfo.status = 'not_initialized';
    }
  }

  /**
   * Validate a generated question before returning
   */
  private validateGeneratedQuestion(question: RawQuestion): boolean {
    // Basic validation checks
    if (!question.questionText || question.questionText.length < 10) {
      return false;
    }

    if (!question.options || question.options.length !== 4) {
      return false;
    }

    if (!question.suggestedAnswer || !['A', 'B', 'C', 'D'].includes(question.suggestedAnswer)) {
      return false;
    }

    if (question.confidence < 0.1) {
      return false;
    }

    return true;
  }

  /**
   * Check if we're in development mode with placeholder API key or model issues
   */
  private isDevelopmentMode(): boolean {
    // Treat as development fallback when running in development and no provider is configured
    if (process.env.NODE_ENV !== 'development') return false;
    const hasHf = !!this.config.apiKey && this.config.apiKey.length > 10 && this.config.apiKey.startsWith('hf_');
    const hasLit = !!this.config.litUrl;
    return (!hasHf && !hasLit) || this.modelInfo.status === 'error';
  }

  /**
   * Generate fallback question for development mode
   */
  private generateFallbackQuestion(topic: IBPhysicsSubtopic, difficulty: QuestionDifficulty): RawQuestion {
    const fallbackQuestions: Partial<Record<IBPhysicsSubtopic, RawQuestion[]>> = {
      [IBPhysicsSubtopic.KINEMATICS]: [
        {
          questionText: "A car travels 100 m in 10 s at constant velocity. What is its speed?",
          options: ["A) 5 m/s", "B) 10 m/s", "C) 15 m/s", "D) 20 m/s"],
          suggestedAnswer: "B",
          confidence: 0.9,
          topic: IBPhysicsSubtopic.KINEMATICS
        },
        {
          questionText: "An object accelerates from rest at 2 m/s² for 5 s. What is its final velocity?",
          options: ["A) 5 m/s", "B) 10 m/s", "C) 15 m/s", "D) 20 m/s"],
          suggestedAnswer: "B",
          confidence: 0.9,
          topic: IBPhysicsSubtopic.KINEMATICS
        }
      ],
      [IBPhysicsSubtopic.FORCES_MOMENTUM]: [
        {
          questionText: "What force is needed to accelerate a 10 kg mass at 2 m/s²?",
          options: ["A) 5 N", "B) 10 N", "C) 20 N", "D) 40 N"],
          suggestedAnswer: "C",
          confidence: 0.9,
          topic: IBPhysicsSubtopic.FORCES_MOMENTUM
        }
      ],
      [IBPhysicsSubtopic.WORK_ENERGY_POWER]: [
        {
          questionText: "How much work is done lifting a 5 kg object 2 m high? (g = 10 m/s²)",
          options: ["A) 50 J", "B) 100 J", "C) 150 J", "D) 200 J"],
          suggestedAnswer: "B",
          confidence: 0.9,
          topic: IBPhysicsSubtopic.WORK_ENERGY_POWER
        }
      ],
      [IBPhysicsSubtopic.CURRENT_CIRCUITS]: [
        {
          questionText: "What current flows through a 10 Ω resistor connected to a 12 V battery?",
          options: ["A) 0.8 A", "B) 1.2 A", "C) 2.0 A", "D) 2.4 A"],
          suggestedAnswer: "B",
          confidence: 0.9,
          topic: IBPhysicsSubtopic.CURRENT_CIRCUITS
        }
      ]
    };

    // Get questions for the topic, or use a generic fallback
    const topicQuestions = fallbackQuestions[topic] || [
      {
        questionText: `This is a development fallback question for ${topic}. What is the correct approach to solve physics problems?`,
        options: ["A) Identify given values", "B) Apply relevant formulas", "C) Check units and calculations", "D) All of the above"],
        suggestedAnswer: "D",
        confidence: 0.8,
        topic
      }
    ];

    // Return a random question from the available ones
    const randomIndex = Math.floor(Math.random() * topicQuestions.length);
    return topicQuestions[randomIndex];
  }
}