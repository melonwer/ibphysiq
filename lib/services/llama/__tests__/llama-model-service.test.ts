/**
 * Unit tests for LlamaModelService
 */

import { LlamaModelService, LlamaConfig } from '../llama-model-service';
import { IBPhysicsSubtopic } from '../../../types/question-generation';

// Mock the Hugging Face Inference
jest.mock('@huggingface/inference', () => ({
  HfInference: jest.fn().mockImplementation(() => ({
    textGeneration: jest.fn()
  }))
}));

describe('LlamaModelService', () => {
  let service: LlamaModelService;
  let mockTextGeneration: jest.Mock;
  
  const testConfig: LlamaConfig = {
    apiKey: 'hf_test-api-key',
    modelId: 'd4ydy/ib-physics-question-generator',
    maxRetries: 2,
    timeoutMs: 10000,
    temperature: 0.7,
    maxTokens: 500,
    topP: 0.9
  };

  beforeEach(() => {
    // Mock environment variables
    process.env.LOCAL_TGI_URL = 'http://localhost:5000';

    const { HfInference } = require('@huggingface/inference');
    const mockHf = new HfInference();
    mockTextGeneration = mockHf.textGeneration;

    service = new LlamaModelService(testConfig);

    // Add logging to verify providers
    console.log('[Test] LlamaModelService initialized with config:', {
      apiKey: testConfig.apiKey.substring(0, 10) + '...',
      provider: testConfig.provider,
      localTgiUrl: process.env.LOCAL_TGI_URL,
      litUrl: testConfig.litUrl
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clean up environment variables
    delete process.env.LOCAL_TGI_URL;
  });

  describe('initialize', () => {
    it('should initialize successfully with valid model', async () => {
      mockTextGeneration.mockResolvedValue({
        generated_text: 'Test response from model'
      });

      await service.initialize();

      expect(service.isAvailable()).toBe(true);
      expect(service.getModelInfo().status).toBe('ready');
    });

    it('should handle initialization failure', async () => {
      mockTextGeneration.mockRejectedValue(new Error('Model not found'));

      await expect(service.initialize()).rejects.toThrow('Failed to initialize Llama model');
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('generateQuestion', () => {
    beforeEach(async () => {
      // Mock successful initialization
      mockTextGeneration.mockResolvedValueOnce({
        generated_text: 'Test initialization response'
      });
      await service.initialize();
    });

    it('should generate a valid question', async () => {
      const mockResponse = `
QUESTION: A car accelerates uniformly from rest at 2.0 m/s². What is the velocity after 5.0 s?

A) 5.0 m/s
B) 10.0 m/s
C) 15.0 m/s
D) 20.0 m/s

ANSWER: B
      `;

      mockTextGeneration.mockResolvedValue({
        generated_text: mockResponse
      });

      const result = await service.generateQuestion(IBPhysicsSubtopic.KINEMATICS, 'standard');

      expect(result.questionText).toContain('car accelerates uniformly');
      expect(result.options).toHaveLength(4);
      expect(result.suggestedAnswer).toBe('B');
      expect(result.topic).toBe(IBPhysicsSubtopic.KINEMATICS);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should retry on parse failure', async () => {
      // First call returns invalid response
      mockTextGeneration
        .mockResolvedValueOnce({
          generated_text: 'Invalid response format'
        })
        .mockResolvedValueOnce({
          generated_text: `
QUESTION: Valid question on retry

A) Option A
B) Option B
C) Option C
D) Option D

ANSWER: A
          `
        });

      const result = await service.generateQuestion(IBPhysicsSubtopic.KINEMATICS);

      expect(mockTextGeneration).toHaveBeenCalledTimes(2);
      expect(result.questionText).toContain('Valid question on retry');
    });

    it('should throw error after max retries', async () => {
      mockTextGeneration.mockResolvedValue({
        generated_text: 'Invalid response'
      });

      await expect(service.generateQuestion(IBPhysicsSubtopic.KINEMATICS))
        .rejects
        .toThrow('Failed to generate question after 2 attempts');

      expect(mockTextGeneration).toHaveBeenCalledTimes(2);
    });

    it('should handle API timeout', async () => {
      mockTextGeneration.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000)) // Longer than timeout
      );

      await expect(service.generateQuestion(IBPhysicsSubtopic.KINEMATICS))
        .rejects
        .toThrow();
    });

    it('should handle quota exceeded error', async () => {
      mockTextGeneration.mockRejectedValue(new Error('quota exceeded'));

      await expect(service.generateQuestion(IBPhysicsSubtopic.KINEMATICS))
        .rejects
        .toThrow('quota');
    });

    it('should handle model loading error', async () => {
      mockTextGeneration.mockRejectedValue(new Error('model is loading'));

      await expect(service.generateQuestion(IBPhysicsSubtopic.KINEMATICS))
        .rejects
        .toThrow('Model is still loading');
    });
  });

  describe('generateMultipleQuestions', () => {
    beforeEach(async () => {
      mockTextGeneration.mockResolvedValueOnce({
        generated_text: 'Test initialization response'
      });
      await service.initialize();
    });

    it('should generate multiple questions', async () => {
      const mockResponse = `
QUESTION: Test question

A) Option A
B) Option B
C) Option C
D) Option D

ANSWER: A
      `;

      mockTextGeneration.mockResolvedValue({
        generated_text: mockResponse
      });

      const topics = [IBPhysicsSubtopic.KINEMATICS, IBPhysicsSubtopic.FORCES_MOMENTUM];
      const results = await service.generateMultipleQuestions(topics);

      expect(results).toHaveLength(2);
      expect(results[0].topic).toBe(IBPhysicsSubtopic.KINEMATICS);
      expect(results[1].topic).toBe(IBPhysicsSubtopic.FORCES_MOMENTUM);
    });

    it('should handle partial failures', async () => {
      mockTextGeneration
        .mockResolvedValueOnce({
          generated_text: `QUESTION: Good question\nA) 1\nB) 2\nC) 3\nD) 4\nANSWER: A`
        })
        .mockRejectedValueOnce(new Error('Generation failed'));

      const topics = [IBPhysicsSubtopic.KINEMATICS, IBPhysicsSubtopic.FORCES_MOMENTUM];
      const results = await service.generateMultipleQuestions(topics);

      expect(results).toHaveLength(1);
      expect(results[0].topic).toBe(IBPhysicsSubtopic.KINEMATICS);
    });

    it('should throw error if all generations fail', async () => {
      mockTextGeneration.mockRejectedValue(new Error('All failed'));

      const topics = [IBPhysicsSubtopic.KINEMATICS, IBPhysicsSubtopic.FORCES_MOMENTUM];
      
      await expect(service.generateMultipleQuestions(topics))
        .rejects
        .toThrow('Failed to generate any questions');
    });
  });

  describe('getStats', () => {
    it('should return service statistics', () => {
      const stats = service.getStats();

      expect(stats.modelId).toBe('d4ydy/ib-physics-question-generator');
      expect(stats.isInitialized).toBe(false); // Not initialized in this test
      expect(stats.config.maxRetries).toBe(2);
      expect(stats.config.timeoutMs).toBe(10000);
      expect(stats.config.temperature).toBe(0.7);
      expect(stats.config.maxTokens).toBe(500);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      service.updateConfig({ temperature: 0.5, maxTokens: 300 });
      
      const stats = service.getStats();
      expect(stats.config.temperature).toBe(0.5);
      expect(stats.config.maxTokens).toBe(300);
    });

    it('should reinitialize on API key change', () => {
      const initialStatus = service.getModelInfo().status;
      
      service.updateConfig({ apiKey: 'new-api-key' });
      
      expect(service.isAvailable()).toBe(false);
      expect(service.getModelInfo().status).toBe('not_initialized');
    });
  });
});