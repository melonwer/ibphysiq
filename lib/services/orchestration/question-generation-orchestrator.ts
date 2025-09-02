/**
 * Main orchestration service for the two-model question generation pipeline
 */
 
import {
  GeneratedQuestion,
  RawQuestion,
  RefinedQuestion,
  IBPhysicsSubtopic,
  QuestionDifficulty,
  QuestionType,
  ModelErrorImpl as ModelError,
  createModelError
} from '../../types/question-generation';
import { LlamaModelService } from '../llama/llama-model-service';
import { OpenRouterRefinementService } from '../openrouter/openrouter-refinement-service';
import { ValidationEngine } from '../validation/validation-engine';
import { ErrorHandlingService } from './error-handling-service';
import { MonitoringService } from './monitoring-service';
import { v4 as uuidv4 } from 'uuid';

export interface OrchestrationConfig {
  enableRefinement: boolean;
  fallbackToOriginal: boolean;
  maxProcessingTime: number;
  enableValidation: boolean;
  requireMinimumQuality: boolean;
  minimumQualityScore: number;
  refinementProvider: 'openrouter';
}

export class QuestionGenerationOrchestrator {
  private llamaService: LlamaModelService;
  private openRouterService: OpenRouterRefinementService | null;
  private validationEngine: ValidationEngine;
  private errorHandler: ErrorHandlingService;
  private monitor: MonitoringService;
  private config: OrchestrationConfig;

  constructor(
    llamaService: LlamaModelService,
    openRouterService: OpenRouterRefinementService | null,
    validationEngine: ValidationEngine,
    errorHandler: ErrorHandlingService,
    monitor: MonitoringService,
    config: OrchestrationConfig
  ) {
    this.llamaService = llamaService;
    this.openRouterService = openRouterService;
    this.validationEngine = validationEngine;
    this.errorHandler = errorHandler;
    this.monitor = monitor;
    this.config = config;
  }

  /**
   * Main method to generate a complete question using the two-model pipeline
   */
  async generateQuestion(
    topic: IBPhysicsSubtopic,
    difficulty: QuestionDifficulty = 'standard',
    type: QuestionType = 'multiple-choice'
  ): Promise<GeneratedQuestion> {
    const startTime = Date.now();
    let processingStage = 'initialization';

    // Add debug logging for topic assignment
    console.log(`[Orchestrator] Starting generation for topic: ${topic}, difficulty: ${difficulty}, type: ${type}`);

    try {
      this.monitor.trackGeneration(topic, false, 0); // Track start

      // Stage 1: Generate raw question with Llama
      processingStage = 'llama_generation';
      console.log(`[Orchestrator] Stage: ${processingStage} - Generating raw question`);
      const rawQuestion = await this.generateRawQuestion(topic, difficulty);
      console.log(`[Orchestrator] Raw question generated successfully for topic: ${topic}`);
      
      // Stage 2: Validate raw question format
      processingStage = 'raw_validation';
      const rawValidation = this.validateQuestion(rawQuestion);
      if (!rawValidation.isValid) {
        throw createModelError({
          type: 'validation_failure',
          message: `Raw question validation failed: ${rawValidation.errors.map(e => e.message).join(', ')}`,
          context: { stage: processingStage, topic, rawQuestion },
          retryable: true
        });
      }

      let finalQuestion: GeneratedQuestion;

      // Stage 3: Refine with OpenRouter (if enabled)
      if (this.config.enableRefinement) {
        processingStage = 'openrouter_refinement';
        try {
          const refinedQuestion = await this.refineQuestion(rawQuestion);

          // Stage 4: Validate refined question
          processingStage = 'refined_validation';
          const refinedValidation = this.validationEngine.validateRefinedQuestion(refinedQuestion);

          if (refinedValidation.overall.isValid && this.validationEngine.isQuestionAcceptable(refinedQuestion)) {
            finalQuestion = this.createFinalQuestion(refinedQuestion, type, true);
          } else if (this.config.fallbackToOriginal) {
            // Fallback to original if refinement failed validation
            finalQuestion = this.createFallbackQuestion(rawQuestion, type, 'refinement_validation_failed');
          } else {
            throw createModelError({
              type: 'validation_failure',
              message: 'Refined question failed validation and fallback is disabled',
              context: { stage: processingStage, validation: refinedValidation.overall },
              retryable: false
            });
          }
        } catch (refinementError) {
          if (this.config.fallbackToOriginal) {
            // Fallback to original if refinement failed
            console.warn('[Orchestrator] OpenRouter refinement failed:', refinementError instanceof Error ? refinementError.message : String(refinementError));
            finalQuestion = this.createFallbackQuestion(rawQuestion, type, 'refinement_failed');
          } else {
            throw refinementError;
          }
        }
      } else {
        // Skip refinement, use raw question directly
        finalQuestion = this.createFallbackQuestion(rawQuestion, type, 'refinement_disabled');
        console.log(`[Orchestrator] Refinement disabled, using original question`);
      }


      // Stage 5: Final quality check
      processingStage = 'quality_check';
      if (this.config.requireMinimumQuality) {
        const qualityScore = await this.assessQuestionQuality(finalQuestion);
        if (qualityScore < this.config.minimumQualityScore) {
          throw createModelError({
            type: 'validation_failure',
            message: `Question quality score ${qualityScore} below minimum ${this.config.minimumQualityScore}`,
            context: { stage: processingStage, qualityScore, question: finalQuestion },
            retryable: true
          });
        }
      }

      // Success - track metrics and return
      const processingTime = Date.now() - startTime;
      this.monitor.trackGeneration(topic, true, processingTime);
      
      return finalQuestion;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Handle different types of errors
      const modelError = this.handleGenerationError(error, processingStage, topic, difficulty);
      this.errorHandler.logError(modelError);
      this.monitor.trackError(modelError);
      this.monitor.trackGeneration(topic, false, processingTime);
      
      throw modelError;
    }
  }

  /**
   * Generate raw question using Llama model
   */
  private async generateRawQuestion(topic: IBPhysicsSubtopic, difficulty: QuestionDifficulty): Promise<RawQuestion> {
    if (!this.llamaService.isAvailable()) {
      await this.llamaService.initialize();
    }

    return await this.llamaService.generateQuestion(topic, difficulty);
  }

  /**
   * Refine question using OpenRouter refinement service
   */
  async refineQuestion(rawQuestion: RawQuestion): Promise<RefinedQuestion> {
    if (!this.openRouterService) {
      throw createModelError({
        type: 'configuration_error',
        message: 'OpenRouter refinement service not available',
        context: { refinementProvider: this.config.refinementProvider },
        retryable: false
      });
    }
    return await this.openRouterService.refineQuestion(rawQuestion);
  }



  /**
   * Validate question format and content
   */
  validateQuestion(question: RawQuestion): { isValid: boolean; errors: any[] } {
    if (!this.config.enableValidation) {
      return { isValid: true, errors: [] };
    }

    return this.validationEngine.validateRawQuestion(question);
  }

  /**
   * Create final question from refined question
   */
  private createFinalQuestion(
    refinedQuestion: RefinedQuestion,
    type: QuestionType,
    wasRefined: boolean
  ): GeneratedQuestion {
    return {
      id: uuidv4(),
      topic: refinedQuestion.topic,
      questionText: refinedQuestion.questionText,
      options: refinedQuestion.options,
      correctAnswer: refinedQuestion.correctAnswer,
      explanation: this.generateExplanation(refinedQuestion),
      metadata: {
        generatedAt: new Date(),
        modelVersions: {
          llama: this.llamaService.getModelInfo().version,
          refinement: this.getRefinementServiceInfo()
        },
        processingTime: 0, // Will be set by caller
        refinementApplied: wasRefined,
        validationPassed: true,
        topic: refinedQuestion.topic,
        difficulty: 'standard' as QuestionDifficulty // Default, could be enhanced
      },
      type,
      difficulty: 'standard' as QuestionDifficulty // Default, could be enhanced
    };
  }

  /**
   * Create fallback question from raw question
   */
  private createFallbackQuestion(
    rawQuestion: RawQuestion,
    type: QuestionType,
    fallbackReason: string
  ): GeneratedQuestion {
    return {
      id: uuidv4(),
      topic: rawQuestion.topic,
      questionText: rawQuestion.questionText,
      options: rawQuestion.options,
      correctAnswer: rawQuestion.suggestedAnswer,
      explanation: `Fallback question (${fallbackReason}). Original Llama-generated content.`,
      metadata: {
        generatedAt: new Date(),
        modelVersions: {
          llama: this.llamaService.getModelInfo().version,
          refinement: 'none'
        },
        processingTime: 0,
        refinementApplied: false,
        validationPassed: true,
        topic: rawQuestion.topic,
        difficulty: 'standard'
      },
      type,
      difficulty: 'standard'
    };
  }

  /**
   * Get refinement service information for metadata
   */
  private getRefinementServiceInfo(): string {
    return this.openRouterService ? 'deepseek-chat-v3.1:free' : 'none';
  }

  /**
   * Generate explanation for the question
   */
  private generateExplanation(question: RefinedQuestion): string {
    // Basic explanation generation - could be enhanced with another AI call
    const improvements = question.improvements.length > 0 
      ? `Improvements made: ${question.improvements.join(', ')}`
      : '';
    
    return `This question tests understanding of ${question.topic}. ${improvements}`.trim();
  }

  /**
   * Assess question quality score
   */
  private async assessQuestionQuality(question: GeneratedQuestion): Promise<number> {
    // Convert to RefinedQuestion format for validation
    const refinedQuestion: RefinedQuestion = {
      questionText: question.questionText,
      options: question.options,
      correctAnswer: question.correctAnswer,
      improvements: [],
      validationStatus: 'valid',
      topic: question.topic
    };

    const summary = this.validationEngine.getValidationSummary(refinedQuestion);
    return summary.score;
  }

  /**
   * Handle generation errors with appropriate error types
   */
  private handleGenerationError(
    error: any,
    stage: string,
    topic: IBPhysicsSubtopic,
    difficulty: QuestionDifficulty
  ): ModelError {
    if (error instanceof ModelError) {
      return error;
    }

    // Convert generic errors to ModelError
    let errorType: ModelError['type'] = 'llama_failure';
    let retryable = true;

    if (stage.includes('openrouter') || stage.includes('refinement')) {
      errorType = 'openrouter_failure';
    } else if (stage.includes('validation')) {
      errorType = 'validation_failure';
    } else if (error.message?.includes('timeout')) {
      retryable = true;
    } else if (error.message?.includes('quota') || error.message?.includes('limit')) {
      errorType = 'api_limit';
      retryable = false;
    }

    return createModelError({
      type: errorType,
      message: `Generation failed at ${stage}: ${error.message || 'Unknown error'}`,
      context: {
        stage,
        topic,
        difficulty,
        originalError: error.message
      },
      retryable
    });
  }

  /**
   * Generate multiple questions in batch
   */
  async generateMultipleQuestions(
    requests: Array<{
      topic: IBPhysicsSubtopic;
      difficulty?: QuestionDifficulty;
      type?: QuestionType;
    }>
  ): Promise<GeneratedQuestion[]> {
    const results: GeneratedQuestion[] = [];
    const errors: ModelError[] = [];

    // Process requests concurrently with limit
    const concurrencyLimit = 3;
    const chunks = this.chunkArray(requests, concurrencyLimit);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (request) => {
        try {
          return await this.generateQuestion(
            request.topic,
            request.difficulty || 'standard',
            request.type || 'multiple-choice'
          );
        } catch (error) {
          errors.push(error instanceof ModelError ? error : createModelError({
            type: 'llama_failure',
            message: `Batch generation failed: ${error}`,
            context: { request },
            retryable: true
          }));
          return null;
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults.filter(result => result !== null) as GeneratedQuestion[]);
    }

    return results;
  }

  /**
   * Get orchestration statistics
   */
  getStats(): {
    llamaService: any;
    refinementService: any;
    config: OrchestrationConfig;
    metrics: any;
  } {
    let refinementServiceStats = null;
    
    if (this.openRouterService) {
      try {
        refinementServiceStats = this.openRouterService.getModelInfo();
      } catch (e) {
        refinementServiceStats = { provider: 'openrouter', status: 'error', error: String(e) };
      }
    } else {
      refinementServiceStats = { provider: 'none', status: 'not_configured' };
    }

    return {
      llamaService: this.llamaService.getStats(),
      refinementService: refinementServiceStats,
      config: this.config,
      metrics: this.monitor.getMetrics()
    };
  }

  /**
   * Update orchestration configuration
   */
  updateConfig(updates: Partial<OrchestrationConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Health check for all services
   */
  async healthCheck(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: {
      llama: 'healthy' | 'unhealthy';
      refinement: 'healthy' | 'unhealthy';
      validation: 'healthy' | 'unhealthy';
    };
    details: string[];
  }> {
    const details: string[] = [];
    const services = {
      llama: 'unhealthy' as 'healthy' | 'unhealthy',
      refinement: 'unhealthy' as 'healthy' | 'unhealthy',
      validation: 'healthy' as 'healthy' | 'unhealthy'
    };

    // Check Llama service
    try {
      if (this.llamaService.isAvailable()) {
        services.llama = 'healthy';
      } else {
        details.push('Llama service not available');
      }
    } catch (error) {
      details.push(`Llama service error: ${error}`);
    }

    // Check OpenRouter refinement service
    try {
      if (this.openRouterService) {
        if (this.openRouterService.isAvailable()) {
          services.refinement = 'healthy';
        } else {
          details.push('OpenRouter service not available');
        }
      } else {
        details.push('No refinement service configured');
      }
    } catch (error) {
      details.push(`Refinement service error: ${error}`);
    }

    // Determine overall health
    const healthyServices = Object.values(services).filter(status => status === 'healthy').length;
    const totalServices = Object.keys(services).length;

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyServices === totalServices) {
      overall = 'healthy';
    } else if (healthyServices > 0) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }

    return { overall, services, details };
  }

  /**
   * Utility to chunk array for batch processing
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}