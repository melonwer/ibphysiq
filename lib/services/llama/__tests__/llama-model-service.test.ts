/**
 * Unit tests for LlamaModelService
 *
 * The provider boundary is the `HfInference` instance the service constructs,
 * so the mocks are bound to that instance rather than to a throwaway client.
 * Retry backoff is injected, and the local TGI provider is exercised through a
 * stubbed `fetch`, so no test touches the network.
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
  let sleeps: number[];

  const testConfig: LlamaConfig = {
    apiKey: 'hf_test-api-key',
    modelId: 'd4ydy/ib-physics-question-generator',
    maxRetries: 2,
    timeoutMs: 10000,
    temperature: 0.7,
    maxTokens: 500,
    topP: 0.9
  };

  /**
   * Build a service and capture the Hugging Face client it actually created,
   * which is the boundary the assertions below drive.
   */
  const createService = (overrides: Partial<LlamaConfig> = {}): LlamaModelService => {
    const { HfInference } = require('@huggingface/inference');
    HfInference.mockClear();

    sleeps = [];
    const instance = new LlamaModelService(
      { ...testConfig, ...overrides },
      {
        sleep: async (ms: number) => {
          sleeps.push(ms);
        }
      }
    );

    const results = HfInference.mock.results;
    expect(results.length).toBeGreaterThan(0);
    mockTextGeneration = results[results.length - 1].value.textGeneration;

    return instance;
  };

  beforeEach(() => {
    // No local provider configured: the local path must be opt-in, otherwise
    // these tests would probe localhost.
    delete process.env.LOCAL_TGI_URL;
    service = createService();
  });

  afterEach(() => {
    jest.clearAllMocks();
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

    it('should degrade to fallback mode when the model cannot be reached', async () => {
      mockTextGeneration.mockRejectedValue(new Error('Model not found'));

      // Initialization is documented as best-effort: the service falls back
      // rather than aborting the whole pipeline.
      await expect(service.initialize()).resolves.toBeUndefined();

      expect(service.isAvailable()).toBe(false);
      expect(service.getModelInfo().status).toBe('fallback');
    });
  });

  describe('generateQuestion', () => {
    beforeEach(async () => {
      mockTextGeneration.mockResolvedValueOnce({
        generated_text: 'Test initialization response'
      });
      await service.initialize();

      // Start each test from a clean call history; the response queue is
      // already drained by the initialization above.
      mockTextGeneration.mockClear();
      sleeps = [];
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
      // One backoff wait between the two attempts.
      expect(sleeps).toEqual([2000]);
    });

    it('should throw error after max retries', async () => {
      mockTextGeneration.mockResolvedValue({
        generated_text: 'Invalid response'
      });

      await expect(service.generateQuestion(IBPhysicsSubtopic.KINEMATICS))
        .rejects
        .toThrow('Failed to generate question after 2 attempts');

      expect(mockTextGeneration).toHaveBeenCalledTimes(2);
      expect(sleeps).toEqual([2000]);
    });

    it('should handle API timeout', async () => {
      service = createService({ timeoutMs: 25 });
      mockTextGeneration.mockResolvedValueOnce({ generated_text: 'init response' });
      await service.initialize();
      mockTextGeneration.mockClear();

      // Never settles, so only the per-request timeout can finish the attempt.
      mockTextGeneration.mockImplementation(() => new Promise(() => {}));

      await expect(service.generateQuestion(IBPhysicsSubtopic.KINEMATICS))
        .rejects
        .toThrow('Model API timeout');

      // The underlying cause is preserved rather than flattened away.
      expect(mockTextGeneration).toHaveBeenCalledTimes(2);
    });

    it('should not retry a quota error that cannot succeed later', async () => {
      mockTextGeneration.mockRejectedValue(new Error('quota exceeded'));

      await expect(service.generateQuestion(IBPhysicsSubtopic.KINEMATICS))
        .rejects
        .toThrow('quota');

      expect(mockTextGeneration).toHaveBeenCalledTimes(1);
      expect(sleeps).toEqual([]);
    });

    it('should handle model loading error', async () => {
      mockTextGeneration.mockRejectedValue(new Error('model is loading'));

      await expect(service.generateQuestion(IBPhysicsSubtopic.KINEMATICS))
        .rejects
        .toThrow('Model is still loading');

      // Still loading is transient, so it is retried.
      expect(mockTextGeneration).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateMultipleQuestions', () => {
    beforeEach(async () => {
      mockTextGeneration.mockResolvedValueOnce({
        generated_text: 'Test initialization response'
      });
      await service.initialize();
      mockTextGeneration.mockClear();
      sleeps = [];
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
        .mockRejectedValue(new Error('Generation failed'));

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

  describe('local TGI provider', () => {
    let originalFetch: typeof global.fetch;
    let mockFetch: jest.Mock;

    beforeEach(() => {
      originalFetch = global.fetch;
      mockFetch = jest.fn();
      global.fetch = mockFetch as unknown as typeof global.fetch;
      process.env.LOCAL_TGI_URL = 'http://localhost:5000';
      service = createService();
    });

    afterEach(() => {
      global.fetch = originalFetch;
      delete process.env.LOCAL_TGI_URL;
    });

    it('should use the local server when it responds', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ results: [{ text: 'Local provider response' }] })
      });

      await service.initialize();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:5000/api/v1/generate');
      expect(mockTextGeneration).not.toHaveBeenCalled();
      expect(service.getModelInfo().status).toBe('ready');
    });

    it('should stop trying the local server after an auth failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'forbidden'
      });
      mockTextGeneration.mockResolvedValueOnce({
        generated_text: 'Response from Hugging Face'
      });

      // Falls back to Hugging Face and marks the local provider unusable.
      await service.initialize();
      expect(service.getModelInfo().status).toBe('ready');

      mockFetch.mockClear();
      mockTextGeneration.mockResolvedValue({
        generated_text: `QUESTION: A valid question\nA) 1\nB) 2\nC) 3\nD) 4\nANSWER: A`
      });

      await service.generateQuestion(IBPhysicsSubtopic.KINEMATICS);

      // The 403 must not be retried on every subsequent request.
      expect(mockFetch).not.toHaveBeenCalled();
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
      service.updateConfig({ apiKey: 'new-api-key' });

      expect(service.isAvailable()).toBe(false);
      expect(service.getModelInfo().status).toBe('not_initialized');
    });
  });
});
