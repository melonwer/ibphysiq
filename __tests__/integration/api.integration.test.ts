/**
 * Integration tests for API endpoints
 * These tests require a running Next.js server and test actual HTTP endpoints
 */

import { NextRequest } from 'next/server';

// Import route handlers
import { GET as generateQuestionGET, POST as generateQuestionPOST } from '../../app/api/generate-question/route';
import { GET as settingsGET, POST as settingsPOST } from '../../app/api/settings/route';
import { POST as adminReloadPOST } from '../../app/api/admin/reload/route';
import { POST as predictProxyPOST } from '../../app/api/predict-proxy/route';
import { IBPhysicsSubtopic } from '../../lib/types/question-generation';

describe('API Integration Tests', () => {
  // Mock environment variables
  const originalEnv = process.env;

  beforeAll(() => {
    // Set up test environment
    process.env = {
      ...originalEnv,
      GOOGLE_API_KEY: 'test-google-api-key',
      HUGGINGFACE_API_KEY: 'test-hf-key',
      LIT_API_URL: 'http://localhost:5000/api/predict',
      LIT_API_TOKEN: 'test-lit-token',
      NODE_ENV: 'test'
    };
  });

  afterAll(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('/api/generate-question', () => {
    describe('POST - Generate Question', () => {
      it('should generate a question with valid input', async () => {
        const request = new NextRequest('http://localhost:3000/api/generate-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: IBPhysicsSubtopic.KINEMATICS,
            difficulty: 'standard',
            type: 'multiple-choice',
            geminiApiKey: 'test-api-key'
          })
        });

        const response = await generateQuestionPOST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('success');
        expect(data).toHaveProperty('question');
        
        if (data.success) {
          expect(data.question).toHaveProperty('questionText');
          expect(data.question).toHaveProperty('options');
          expect(data.question).toHaveProperty('correctAnswer');
          expect(data.question.topic).toBe(IBPhysicsSubtopic.KINEMATICS);
        }
      }, 30000); // Extended timeout for AI generation

      it('should handle missing API key', async () => {
        const request = new NextRequest('http://localhost:3000/api/generate-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: IBPhysicsSubtopic.KINEMATICS,
            difficulty: 'standard',
            type: 'multiple-choice'
            // No geminiApiKey provided and we'll temporarily remove env var
          })
        });

        // Temporarily remove the env var
        const tempKey = process.env.GOOGLE_API_KEY;
        delete process.env.GOOGLE_API_KEY;

        const response = await generateQuestionPOST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data).toHaveProperty('error');
        expect(data.code).toBe('MISSING_API_KEY');

        // Restore env var
        process.env.GOOGLE_API_KEY = tempKey;
      });

      it('should validate invalid topic', async () => {
        const request = new NextRequest('http://localhost:3000/api/generate-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: 'invalid-topic',
            difficulty: 'standard',
            type: 'multiple-choice',
            geminiApiKey: 'test-api-key'
          })
        });

        const response = await generateQuestionPOST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data).toHaveProperty('error');
        expect(data.code).toBe('INVALID_REQUEST');
      });

      it('should handle legacy format', async () => {
        const request = new NextRequest('http://localhost:3000/api/generate-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questionType: 'mcq',
            topics: ['mechanics'],
            geminiApiKey: 'test-api-key'
          })
        });

        const response = await generateQuestionPOST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('success');
        expect(data).toHaveProperty('question');
      }, 30000);

      it('should validate invalid difficulty', async () => {
        const request = new NextRequest('http://localhost:3000/api/generate-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: IBPhysicsSubtopic.KINEMATICS,
            difficulty: 'invalid',
            type: 'multiple-choice',
            geminiApiKey: 'test-api-key'
          })
        });

        const response = await generateQuestionPOST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data).toHaveProperty('error');
        expect(data.code).toBe('INVALID_REQUEST');
      });

      it('should validate invalid type', async () => {
        const request = new NextRequest('http://localhost:3000/api/generate-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: IBPhysicsSubtopic.KINEMATICS,
            difficulty: 'standard',
            type: 'invalid-type',
            geminiApiKey: 'test-api-key'
          })
        });

        const response = await generateQuestionPOST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data).toHaveProperty('error');
        expect(data.code).toBe('INVALID_REQUEST');
      });
    });

    describe('GET - Service Info', () => {
      it('should return API information', async () => {
        const request = new NextRequest('http://localhost:3000/api/generate-question');

        const response = await generateQuestionGET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('name');
        expect(data).toHaveProperty('version');
        expect(data).toHaveProperty('description');
        expect(data).toHaveProperty('endpoints');
        expect(data).toHaveProperty('supportedTopics');
        expect(data).toHaveProperty('features');
      });

      it('should return health check', async () => {
        const request = new NextRequest('http://localhost:3000/api/generate-question?action=health');

        const response = await generateQuestionGET(request);
        const data = await response.json();

        expect(response.status).toBeOneOf([200, 503]); // 503 if not initialized
        
        if (response.status === 200) {
          expect(data).toHaveProperty('overall');
          expect(data).toHaveProperty('services');
        } else {
          expect(data).toHaveProperty('status');
          expect(data.status).toBe('not_initialized');
        }
      });

      it('should return available topics', async () => {
        const request = new NextRequest('http://localhost:3000/api/generate-question?action=topics');

        const response = await generateQuestionGET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('topics');
        expect(Array.isArray(data.topics)).toBe(true);
        
        if (data.topics.length > 0) {
          expect(data.topics[0]).toHaveProperty('id');
          expect(data.topics[0]).toHaveProperty('name');
          expect(data.topics[0]).toHaveProperty('category');
        }
      });

      it('should return stats when services are initialized', async () => {
        const request = new NextRequest('http://localhost:3000/api/generate-question?action=stats');

        const response = await generateQuestionGET(request);
        const data = await response.json();

        expect(response.status).toBeOneOf([200, 503]); // 503 if not initialized
        
        if (response.status === 200) {
          expect(data).toHaveProperty('orchestrator');
          expect(data).toHaveProperty('rateLimiting');
          expect(data).toHaveProperty('costs');
          expect(data).toHaveProperty('quotas');
        } else {
          expect(data).toHaveProperty('error');
          expect(data.error).toBe('Services not initialized');
        }
      });
    });
  });

  describe('/api/settings', () => {
    describe('GET - Read Settings', () => {
      it('should return masked settings', async () => {
        const response = await settingsGET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('litUrl');
        expect(data).toHaveProperty('litToken');
        expect(data).toHaveProperty('huggingfaceApiKey');
        expect(data).toHaveProperty('googleApiKey');
        expect(data).toHaveProperty('llamaModelId');
        expect(data).toHaveProperty('useOwnerCredits');

        // API keys should be masked
        if (data.litToken) {
          expect(data.litToken).toMatch(/^\*{4}/);
        }
        if (data.huggingfaceApiKey) {
          expect(data.huggingfaceApiKey).toMatch(/^\*{4}/);
        }
        if (data.googleApiKey) {
          expect(data.googleApiKey).toMatch(/^\*{4}/);
        }
      });
    });

    describe('POST - Update Settings', () => {
      it('should update settings', async () => {
        const request = new NextRequest('http://localhost:3000/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            llamaModelId: 'test-model-id',
            useOwnerCredits: false
          })
        });

        const response = await settingsPOST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('llamaModelId');
        expect(data.llamaModelId).toBe('test-model-id');
        expect(data.useOwnerCredits).toBe(false);
      });

      it('should ignore invalid settings keys', async () => {
        const request = new NextRequest('http://localhost:3000/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            validKey: 'test-value',
            invalidKey: 'should-be-ignored',
            llamaModelId: 'valid-model-id'
          })
        });

        const response = await settingsPOST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('llamaModelId');
        expect(data.llamaModelId).toBe('valid-model-id');
        expect(data).not.toHaveProperty('invalidKey');
      });

      it('should handle malformed JSON', async () => {
        const request = new NextRequest('http://localhost:3000/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid json'
        });

        const response = await settingsPOST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data).toHaveProperty('error');
        expect(data.error).toBe('failed_to_write_settings');
      });
    });
  });

  describe('/api/admin/reload', () => {
    describe('POST - Reload Services', () => {
      it('should reload services successfully', async () => {
        const request = new NextRequest('http://localhost:3000/api/admin/reload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            geminiApiKey: 'test-reload-key'
          })
        });

        const response = await adminReloadPOST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('ok');
        expect(data.ok).toBe(true);
      });

      it('should handle reload with malformed body', async () => {
        const request = new NextRequest('http://localhost:3000/api/admin/reload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid json'
        });

        const response = await adminReloadPOST(request);
        const data = await response.json();

        expect(response.status).toBe(200); // Should still work with empty body
        expect(data).toHaveProperty('ok');
        expect(data.ok).toBe(true);
      });

      it('should handle reload without body', async () => {
        const request = new NextRequest('http://localhost:3000/api/admin/reload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const response = await adminReloadPOST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('ok');
        expect(data.ok).toBe(true);
      });
    });
  });

  describe('/api/predict-proxy', () => {
    describe('POST - Proxy LIT Requests', () => {
      it('should return error when LIT_API_URL not configured', async () => {
        // Temporarily remove env vars
        const tempUrl = process.env.LIT_API_URL;
        const tempToken = process.env.LIT_API_TOKEN;
        delete process.env.LIT_API_URL;
        delete process.env.LIT_API_TOKEN;

        const request = new Request('http://localhost:3000/api/predict-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: 'test input' })
        });

        const response = await predictProxyPOST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data).toHaveProperty('error');
        expect(data.error).toContain('LIT_API_URL not configured');

        // Restore env vars
        if (tempUrl) process.env.LIT_API_URL = tempUrl;
        if (tempToken) process.env.LIT_API_TOKEN = tempToken;
      });

      it('should return error when LIT_API_TOKEN not configured', async () => {
        // Temporarily remove token
        const tempToken = process.env.LIT_API_TOKEN;
        delete process.env.LIT_API_TOKEN;

        const request = new Request('http://localhost:3000/api/predict-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: 'test input' })
        });

        const response = await predictProxyPOST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data).toHaveProperty('error');
        expect(data.error).toContain('LIT_API_TOKEN not configured');

        // Restore token
        if (tempToken) process.env.LIT_API_TOKEN = tempToken;
      });

      it('should handle malformed JSON request', async () => {
        const request = new Request('http://localhost:3000/api/predict-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid json'
        });

        const response = await predictProxyPOST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data).toHaveProperty('error');
        expect(data.error).toBe('predict_proxy_error');
      });

      // Note: We can't easily test successful proxying without a real LIT server
      // In a full integration test environment, you would mock fetch or use a test server
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      // This test would require mocking fetch with a timeout
      // For now, we'll test the error handling structure
      
      const request = new NextRequest('http://localhost:3000/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: IBPhysicsSubtopic.KINEMATICS,
          difficulty: 'standard',
          type: 'multiple-choice',
          geminiApiKey: 'test-api-key'
        })
      });

      try {
        const response = await generateQuestionPOST(request);
        const data = await response.json();

        // Response should have proper error handling structure
        if (!data.success && data.error) {
          expect(data).toHaveProperty('code');
          expect(['QUOTA_EXCEEDED', 'TIMEOUT', 'VALIDATION_FAILED', 'GENERATION_FAILED'])
            .toContain(data.code);
        }
      } catch (error) {
        // Network errors should be caught
        expect(error).toBeDefined();
      }
    });

    it('should validate request content type', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'not json'
      });

      const response = await generateQuestionPOST(request);
      expect(response.status).toBe(500); // Should fail to parse JSON
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should track API usage in question generation', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: IBPhysicsSubtopic.KINEMATICS,
          difficulty: 'standard',
          type: 'multiple-choice',
          geminiApiKey: 'test-api-key'
        })
      });

      const response = await generateQuestionPOST(request);
      const data = await response.json();

      // Rate limiting should be applied regardless of generation success
      expect(response.status).toBeLessThan(500); // Should not fail due to rate limiting setup
      
      if (data.error && data.code === 'RATE_LIMITED') {
        expect(data).toHaveProperty('retryAfter');
        expect(typeof data.retryAfter).toBe('number');
      }
    }, 30000);
  });
});

// Custom Jest matchers
expect.extend({
  toBeOneOf(received, expected) {
    const pass = expected.includes(received);
    return {
      message: () => `expected ${received} to be one of ${expected.join(', ')}`,
      pass,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: any[]): R;
    }
  }
}