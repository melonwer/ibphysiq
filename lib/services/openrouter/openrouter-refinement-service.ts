/**
 * OpenRouter refinement service for DeepSeek Chat v3.1 with structured prompting and retry logic
 * Compatible with the same interface as GeminiRefinementService
 */

import {
  RawQuestion,
  RefinedQuestion,
  createModelError,
  IBPhysicsSubtopic
} from '../../types/question-generation';
import { OpenRouterConfig } from './config';

export class OpenRouterRefinementService {
  private config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    // Cap maxRetries to avoid very long retry loops for transient OpenRouter failures
    this.config = {
      ...config,
      maxRetries: Math.max(1, Math.min((config.maxRetries ?? 3), 3))
    };
  }

  /**
   * Refine a raw question using OpenRouter DeepSeek with structured prompting
   */
  async refineQuestion(rawQuestion: RawQuestion): Promise<RefinedQuestion> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const prompt = this.createRefinementPrompt(rawQuestion);
        const response = await this.callOpenRouterAPI(prompt, attempt);
        
        // Basic validation - check if response has content
        if (!response || response.trim().length < 50) {
          throw new Error(`Incomplete response on attempt ${attempt}`);
        }

        // Parse the response
        const parsed = this.parseOpenRouterResponse(response, rawQuestion);
        
        if (parsed) {
          return parsed;
        } else {
          throw new Error(`Parse failed on attempt ${attempt}`);
        }
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        console.warn(`OpenRouter refinement attempt ${attempt} failed:`, lastError.message);
        
        // If the error is non-retryable (e.g., auth errors), abort retries
        if (error instanceof Error && /API_KEY_INVALID|api key not valid|invalid api key|unauthorized/i.test(error.message)) {
          console.error('[OpenRouterRefinement] Authentication error detected, aborting retries.');
          throw error;
        }
        
        // If this is not the last attempt, wait before retrying
        if (attempt < this.config.maxRetries) {
          const baseDelay = this.getRetryDelay(attempt);
          const jitter = Math.floor(Math.random() * 500);
          await this.delay(baseDelay + jitter);
        }
      }
    }

    // All recovery attempts failed — throw the original model error
    throw createModelError({
      type: 'openrouter_failure',
      message: `Failed to refine question after ${this.config.maxRetries} attempts: ${lastError?.message}`,
      context: {
        originalQuestion: rawQuestion,
        lastError: lastError?.message
      },
      retryable: false
    });
  }

  /**
   * Create a refinement prompt for OpenRouter
   */
  private createRefinementPrompt(rawQuestion: RawQuestion): string {
    return `Please refine the following IB Physics question to improve its clarity, accuracy, and educational value.

Topic: ${rawQuestion.topic}

Original Question:
${rawQuestion.questionText}

Options:
${rawQuestion.options.map((opt, idx) => `${String.fromCharCode(65 + idx)}) ${opt}`).join('\n')}

Suggested Answer: ${rawQuestion.suggestedAnswer}

Please provide your response in this exact format:

Refined Question:
[Improved question text here]

A) [Option A]
B) [Option B] 
C) [Option C]
D) [Option D]

CORRECT_ANSWER: [A, B, C, or D]

IMPROVEMENTS_MADE:
- [List of improvements made]

Focus on making the question clearer, more accurate, and better aligned with IB Physics standards.`;
  }

  /**
   * Parse OpenRouter response into a RefinedQuestion
   */
  private parseOpenRouterResponse(response: string, rawQuestion: RawQuestion): RefinedQuestion | null {
    try {
      // Extract question text
      const questionMatch = response.match(/Refined Question:\s*([\s\S]*?)(?=A\)|B\)|C\)|D\)|CORRECT_ANSWER)/i);
      const questionText = questionMatch ? questionMatch[1].trim() : rawQuestion.questionText;

      // Extract options
      const optionMatches = response.match(/([A-D])\)\s*(.+?)(?=\n[A-D]\)|\nCORRECT_ANSWER|$)/g);
      let options: string[] = [];
      
      if (optionMatches && optionMatches.length === 4) {
        options = optionMatches.map(match => {
          const parsed = match.match(/([A-D])\)\s*(.+)/);
          return parsed ? `${parsed[1]}) ${parsed[2].trim()}` : match;
        });
      } else {
        options = rawQuestion.options; // Fallback to original
      }

      // Extract correct answer
      const answerMatch = response.match(/CORRECT_ANSWER:\s*([A-D])/i);
      const correctAnswer = answerMatch ? answerMatch[1] : rawQuestion.suggestedAnswer;

      // Extract improvements
      const improvementsMatch = response.match(/IMPROVEMENTS_MADE:\s*([\s\S]*?)$/i);
      const improvementsText = improvementsMatch ? improvementsMatch[1].trim() : '';
      const improvements = improvementsText
        .split(/[\n-]/) 
        .map(item => item.trim())
        .filter(item => item.length > 0)
        .slice(0, 5); // Limit to 5 improvements

      return {
        questionText,
        options,
        correctAnswer,
        improvements,
        validationStatus: 'valid' as const,
        topic: rawQuestion.topic
      };
    } catch (error) {
      console.warn('Failed to parse OpenRouter response:', error);
      return null;
    }
  }

  /**
   * Call OpenRouter API with timeout and error handling
   */
  private async callOpenRouterAPI(prompt: string, attempt: number = 1): Promise<string> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('OpenRouter API timeout')), this.config.timeoutMs);
    });

    const requestPromise = this.makeOpenRouterRequest(prompt, attempt);

    try {
      const response = await Promise.race([requestPromise, timeoutPromise]);
      return response;
    } catch (error) {
      if (error instanceof Error && error.message === 'OpenRouter API timeout') {
        throw createModelError({
          type: 'openrouter_timeout',
          message: `OpenRouter API timeout after ${this.config.timeoutMs}ms`,
          context: { attempt, prompt: prompt.substring(0, 100) + '...' },
          retryable: true
        });
      }
      throw error;
    }
  }

  /**
   * Make the actual HTTP request to OpenRouter API
   */
  private async makeOpenRouterRequest(prompt: string, attempt: number): Promise<string> {
    try {
      const requestBody = {
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: false
      };

      console.log(`[OpenRouterRefinement] Calling ${this.config.model} (attempt ${attempt})`);

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://ibphysiq.com', // Optional: your site URL
          'X-Title': 'IB Physics Question Generator' // Optional: your app name
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.text();
        let errorMessage = `OpenRouter API error: ${response.status} ${response.statusText}`;
        
        try {
          const errorJson = JSON.parse(errorData);
          if (errorJson.error && errorJson.error.message) {
            errorMessage = errorJson.error.message;
          }
        } catch (e) {
          // If we can't parse error data, use the generic message
        }

        throw createModelError({
          type: 'openrouter_api_error',
          message: errorMessage,
          context: { 
            status: response.status, 
            attempt,
            model: this.config.model
          },
          retryable: response.status >= 500 || response.status === 429
        });
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from OpenRouter API');
      }

      const content = data.choices[0].message.content;
      
      if (!content || typeof content !== 'string') {
        throw new Error('Empty or invalid content in OpenRouter response');
      }

      console.log(`[OpenRouterRefinement] Received response from ${this.config.model} (${content.length} characters)`);
      return content;

    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      
      throw createModelError({
        type: 'openrouter_network_error',
        message: `Network error calling OpenRouter: ${String(error)}`,
        context: { attempt, model: this.config.model },
        retryable: true
      });
    }
  }

  /**
   * Format raw question for refinement
   */
  private formatRawQuestion(rawQuestion: RawQuestion): string {
    return `${rawQuestion.questionText}\n\nOptions:\n${rawQuestion.options.map((opt, idx) => `${String.fromCharCode(65 + idx)}) ${opt}`).join('\n')}\n\nSuggested Answer: ${rawQuestion.suggestedAnswer}`;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private getRetryDelay(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt - 1), 10000);
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate explanation for a physics question
   */
  async generateExplanation(prompt: string): Promise<string> {
    try {
      const response = await this.callOpenRouterAPI(prompt, 1);
      return response;
    } catch (error) {
      throw createModelError({
        type: 'openrouter_failure',
        message: `Failed to generate explanation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context: { originalError: error },
        retryable: true
      });
    }
  }

  /**
   * Get service information
   */
  getModelInfo(): { version: string; status: string; provider: string } {
    return {
      version: this.config.model,
      status: 'available',
      provider: 'openrouter'
    };
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return !!this.config.apiKey;
  }
}