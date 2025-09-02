/**
 * Unit tests for QuestionGenerationOrchestrator
 */

import { QuestionGenerationOrchestrator, OrchestrationConfig } from '../question-generation-orchestrator';
import { LlamaModelService } from '../../llama/llama-model-service';
import { OpenRouterRefinementService } from '../../openrouter/openrouter-refinement-service';
import { ValidationEngine } from '../../validation/validation-engine';
import { ErrorHandlingService } from '../error-handling-service';
import { MonitoringService } from '../monitoring-service';
import { IBPhysicsSubtopic, RawQuestion, RefinedQuestion } from '../../../types/question-generation';

// Mock all dependencies
jest.mock('../../llama/llama-model-service');
jest.mock('../../openrouter/openrouter-refinement-service');
jest.mock('../../validation/validation-engine');
jest.mock('../error-handling-service');
jest.mock('../monitoring-service');

describe('QuestionGenerationOrchestrator', () => {
  let orchestrator: QuestionGenerationOrchestrator;
  let mockLlamaService: jest.Mocked<LlamaModelService>;
  let mockRefinementService: jest.Mocked<OpenRouterRefinementService>;
  let mockValidationEngine: jest.Mocked<ValidationEngine>;
  let mockErrorHandler: jest.Mocked<ErrorHandlingService>;
  let mockMonitor: jest.Mocked<MonitoringService>;
  
  const defaultConfig: OrchestrationConfig = {
    enableRefinement: true,
    fallbackToOriginal: true,
    maxProcessingTime: 30000,
    enableValidation: true,
    requireMinimumQuality: false,
    minimumQualityScore: 0.7,
    refinementProvider: 'openrouter'
  };

  beforeEach(() => {
    // Create mocked instances
    mockLlamaService = new LlamaModelService({} as any) as jest.Mocked<LlamaModelService>;
    mockRefinementService = new OpenRouterRefinementService({} as any) as jest.Mocked<OpenRouterRefinementService>;
    mockValidationEngine = new ValidationEngine() as jest.Mocked<ValidationEngine>;
    mockErrorHandler = new ErrorHandlingService() as jest.Mocked<ErrorHandlingService>;
    mockMonitor = new MonitoringService() as jest.Mocked<MonitoringService>;

    // Setup default mock behaviors
    mockLlamaService.isAvailable.mockReturnValue(true);
    mockLlamaService.getModelInfo.mockReturnValue({ version: 'test-llama', status: 'ready' });
    mockRefinementService.isAvailable.mockReturnValue(true);
    mockRefinementService.getModelInfo.mockReturnValue({ version: 'openrouter-deepseek', status: 'available', provider: 'openrouter' });
    mockValidationEngine.validateRawQuestion.mockReturnValue({ isValid: true, errors: [], warnings: [], suggestions: [] });
    mockValidationEngine.isQuestionAcceptable.mockReturnValue(true);
    mockValidationEngine.validateRefinedQuestion.mockReturnValue({
      overall: { isValid: true, errors: [], warnings: [], suggestions: [] },
      format: {} as any,
      physics: {} as any,
      compliance: {} as any
    });
    mockErrorHandler.logError.mockImplementation(() => {});
    mockMonitor.trackGeneration.mockImplementation(() => {});
    mockMonitor.trackError.mockImplementation(() => {});

    orchestrator = new QuestionGenerationOrchestrator(
      mockLlamaService,
      mockRefinementService,
      mockValidationEngine,
      mockErrorHandler,
      mockMonitor,
      defaultConfig
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateQuestion', () => {
    const mockRawQuestion: RawQuestion = {
      questionText: 'Test question from Llama',
      options: ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4'],
      suggestedAnswer: 'A',
      confidence: 0.8,
      topic: IBPhysicsSubtopic.KINEMATICS
    };

    const mockRefinedQuestion: RefinedQuestion = {
      questionText: 'Refined test question from OpenRouter',
      options: ['A) Refined option 1', 'B) Refined option 2', 'C) Refined option 3', 'D) Refined option 4'],
      correctAnswer: 'A',
      improvements: ['Improved clarity', 'Added units'],
      validationStatus: 'valid',
      topic: IBPhysicsSubtopic.KINEMATICS
    };

    it('should generate question successfully with refinement', async () => {
      mockLlamaService.generateQuestion.mockResolvedValue(mockRawQuestion);
      mockRefinementService.refineQuestion.mockResolvedValue(mockRefinedQuestion);

      const result = await orchestrator.generateQuestion(IBPhysicsSubtopic.KINEMATICS);

      expect(result.questionText).toBe('Refined test question from OpenRouter');
      expect(result.options).toEqual(mockRefinedQuestion.options);
      expect(result.correctAnswer).toBe('A');
      expect(result.metadata.refinementApplied).toBe(true);
      expect(result.topic).toBe(IBPhysicsSubtopic.KINEMATICS);

      expect(mockLlamaService.generateQuestion).toHaveBeenCalledWith(IBPhysicsSubtopic.KINEMATICS, 'standard');
      expect(mockRefinementService.refineQuestion).toHaveBeenCalledWith(mockRawQuestion);
    });

    it('should fallback to original question when refinement fails', async () => {
      mockLlamaService.generateQuestion.mockResolvedValue(mockRawQuestion);
      mockRefinementService.refineQuestion.mockRejectedValue(new Error('OpenRouter failed'));

      const result = await orchestrator.generateQuestion(IBPhysicsSubtopic.KINEMATICS);

      expect(result.questionText).toBe('Test question from Llama');
      expect(result.options).toEqual(mockRawQuestion.options);
      expect(result.correctAnswer).toBe('A');
      expect(result.metadata.refinementApplied).toBe(false);
      expect(result.explanation).toContain('Fallback question');
    });

    it('should skip refinement when disabled', async () => {
      const configWithoutRefinement = { ...defaultConfig, enableRefinement: false };
      orchestrator.updateConfig(configWithoutRefinement);

      mockLlamaService.generateQuestion.mockResolvedValue(mockRawQuestion);

      const result = await orchestrator.generateQuestion(IBPhysicsSubtopic.KINEMATICS);

      expect(result.questionText).toBe('Test question from Llama');
      expect(result.metadata.refinementApplied).toBe(false);
      expect(mockRefinementService.refineQuestion).not.toHaveBeenCalled();
    });

    it('should handle Llama generation failure', async () => {
      mockLlamaService.generateQuestion.mockRejectedValue(new Error('Llama failed'));

      await expect(orchestrator.generateQuestion(IBPhysicsSubtopic.KINEMATICS))
        .rejects
        .toThrow('Generation failed at llama_generation');

      expect(mockMonitor.trackError).toHaveBeenCalled();
      expect(mockMonitor.trackGeneration).toHaveBeenCalledWith(IBPhysicsSubtopic.KINEMATICS, false, expect.any(Number));
    });

    it('should handle validation failure', async () => {
      mockLlamaService.generateQuestion.mockResolvedValue(mockRawQuestion);
      mockValidationEngine.validateRawQuestion.mockReturnValue({
        isValid: false,
        errors: [{ type: 'format', message: 'Invalid format', severity: 'high' }],
        warnings: [],
        suggestions: []
      });

      await expect(orchestrator.generateQuestion(IBPhysicsSubtopic.KINEMATICS))
        .rejects
        .toThrow('Raw question validation failed');
    });

    it('should enforce minimum quality when enabled', async () => {
      const configWithQuality = { ...defaultConfig, requireMinimumQuality: true, minimumQualityScore: 0.8 };
      orchestrator.updateConfig(configWithQuality);

      mockLlamaService.generateQuestion.mockResolvedValue(mockRawQuestion);
      mockRefinementService.refineQuestion.mockResolvedValue(mockRefinedQuestion);
      mockValidationEngine.getValidationSummary.mockReturnValue({
        score: 0.6, // Below minimum
        issues: ['Low quality'],
        strengths: []
      });

      await expect(orchestrator.generateQuestion(IBPhysicsSubtopic.KINEMATICS))
        .rejects
        .toThrow('Question quality score 0.6 below minimum 0.8');
    });

    it('should handle different question types and difficulties', async () => {
      mockLlamaService.generateQuestion.mockResolvedValue(mockRawQuestion);
      mockRefinementService.refineQuestion.mockResolvedValue(mockRefinedQuestion);

      const result = await orchestrator.generateQuestion(
        IBPhysicsSubtopic.FORCES_MOMENTUM,
        'higher',
        'long-answer'
      );

      expect(result.difficulty).toBe('standard'); // Currently defaults to standard
      expect(result.type).toBe('long-answer');
      expect(mockLlamaService.generateQuestion).toHaveBeenCalledWith(IBPhysicsSubtopic.FORCES_MOMENTUM, 'higher');
    });
  });

  describe('generateMultipleQuestions', () => {
    it('should generate multiple questions successfully', async () => {
      const mockRawQuestion: RawQuestion = {
        questionText: 'Test question',
        options: ['A) 1', 'B) 2', 'C) 3', 'D) 4'],
        suggestedAnswer: 'A',
        confidence: 0.8,
        topic: IBPhysicsSubtopic.KINEMATICS
      };

      mockLlamaService.generateQuestion.mockResolvedValue(mockRawQuestion);
      mockRefinementService.refineQuestion.mockResolvedValue({
        questionText: 'Refined question',
        options: ['A) 1', 'B) 2', 'C) 3', 'D) 4'],
        correctAnswer: 'A',
        improvements: [],
        validationStatus: 'valid',
        topic: IBPhysicsSubtopic.KINEMATICS
      });

      const requests = [
        { topic: IBPhysicsSubtopic.KINEMATICS },
        { topic: IBPhysicsSubtopic.FORCES_MOMENTUM, difficulty: 'higher' as const }
      ];

      const results = await orchestrator.generateMultipleQuestions(requests);

      expect(results).toHaveLength(2);
      expect(results[0].topic).toBe(IBPhysicsSubtopic.KINEMATICS);
      expect(results[1].topic).toBe(IBPhysicsSubtopic.FORCES_MOMENTUM);
    });

    it('should handle partial failures in batch generation', async () => {
      mockLlamaService.generateQuestion
        .mockResolvedValueOnce({
          questionText: 'Success',
          options: ['A) 1', 'B) 2', 'C) 3', 'D) 4'],
          suggestedAnswer: 'A',
          confidence: 0.8,
          topic: IBPhysicsSubtopic.KINEMATICS
        })
        .mockRejectedValueOnce(new Error('Failed'));

      mockRefinementService.refineQuestion.mockResolvedValue({
        questionText: 'Refined',
        options: ['A) 1', 'B) 2', 'C) 3', 'D) 4'],
        correctAnswer: 'A',
        improvements: [],
        validationStatus: 'valid',
        topic: IBPhysicsSubtopic.KINEMATICS
      });

      const requests = [
        { topic: IBPhysicsSubtopic.KINEMATICS },
        { topic: IBPhysicsSubtopic.FORCES_MOMENTUM }
      ];

      const results = await orchestrator.generateMultipleQuestions(requests);

      expect(results).toHaveLength(1); // Only successful generation
      expect(results[0].topic).toBe(IBPhysicsSubtopic.KINEMATICS);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when all services are working', async () => {
      mockLlamaService.isAvailable.mockReturnValue(true);
      mockRefinementService.isAvailable.mockReturnValue(true);

      const health = await orchestrator.healthCheck();

      expect(health.overall).toBe('healthy');
      expect(health.services.llama).toBe('healthy');
      expect(health.services.refinement).toBe('healthy');
      expect(health.services.validation).toBe('healthy');
      expect(health.details).toHaveLength(0);
    });

    it('should return degraded status when some services have issues', async () => {
      mockLlamaService.isAvailable.mockReturnValue(false);
      mockRefinementService.isAvailable.mockReturnValue(true);

      const health = await orchestrator.healthCheck();

      expect(health.overall).toBe('degraded');
      expect(health.services.llama).toBe('unhealthy');
      expect(health.services.refinement).toBe('healthy');
      expect(health.details).toContain('Llama service not available');
    });

    it('should return unhealthy status when all services fail', async () => {
      mockLlamaService.isAvailable.mockReturnValue(false);
      mockRefinementService.isAvailable.mockReturnValue(false);

      const health = await orchestrator.healthCheck();

      expect(health.overall).toBe('unhealthy');
      expect(health.services.llama).toBe('unhealthy');
      expect(health.services.refinement).toBe('unhealthy');
      expect(health.details.length).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', () => {
      mockLlamaService.getStats = jest.fn().mockReturnValue({
        modelId: 'test-model',
        isInitialized: true,
        status: 'ready',
        config: { maxRetries: 3, timeoutMs: 30000, temperature: 0.7, maxTokens: 500 }
      });

      mockMonitor.getMetrics.mockReturnValue({
        totalGenerations: 100,
        successRate: 0.95,
        averageProcessingTime: 5000,
        errorsByType: { 'llama_failure': 2, 'refinement_failure': 3 },
        generationsByTopic: { 'kinematics': 50, 'forces-momentum': 50 },
        processingTimeByTopic: { 'kinematics': 4500, 'forces-momentum': 5500 },
        hourlyStats: {}
      });

      const stats = orchestrator.getStats();

      expect(stats.llamaService.modelId).toBe('test-model');
      expect(stats.config.enableRefinement).toBe(true);
      expect(stats.metrics.totalGenerations).toBe(100);
      expect(stats.metrics.successRate).toBe(0.95);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration correctly', () => {
      const newConfig = { enableRefinement: false, fallbackToOriginal: false };
      
      orchestrator.updateConfig(newConfig);
      
      const stats = orchestrator.getStats();
      expect(stats.config.enableRefinement).toBe(false);
      expect(stats.config.fallbackToOriginal).toBe(false);
      expect(stats.config.maxProcessingTime).toBe(30000); // Should keep existing values
    });
  });
});