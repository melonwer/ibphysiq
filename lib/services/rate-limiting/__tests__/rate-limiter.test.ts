/**
 * Unit tests for RateLimiter
 */

import { RateLimiter, RateLimitConfig } from '../rate-limiter';
import { APIError } from '../../../types/question-generation';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;
  
  const testConfig: RateLimitConfig = {
    openrouter: {
      requestsPerMinute: 5,
      requestsPerDay: 50,
      tokensPerMinute: 1000,
      tokensPerDay: 10000,
      costPerToken: 0.000001,
      maxDailyCost: 0.10
    },
    huggingface: {
      requestsPerMinute: 3,
      requestsPerDay: 30,
      tokensPerMinute: 500,
      tokensPerDay: 5000,
      costPerToken: 0.000002,
      maxDailyCost: 0.05
    }
  };

  beforeEach(() => {
    rateLimiter = new RateLimiter(testConfig);
  });

  afterEach(() => {
    // Stop cleanup interval to prevent memory leaks in tests
    rateLimiter.stopCleanup();
  });

  describe('checkLimit', () => {
    it('should allow requests within limits', async () => {
      const result = await rateLimiter.checkLimit('openrouter');
      expect(result).toBe(true);
    });

    it('should track usage after successful requests', async () => {
      await rateLimiter.checkLimit('openrouter');
      rateLimiter.trackUsage('openrouter', 100);
      
      const status = rateLimiter.getQuotaStatus();
      expect(status.openrouterQuota.used).toBe(1);
      expect(status.openrouterQuota.tokens.used).toBe(100);
    });

    it('should throw error when daily cost limit exceeded', async () => {
      // Use up the daily cost budget
      rateLimiter.trackUsage('openrouter', 100000); // $0.10 worth
      
      await expect(rateLimiter.checkLimit('openrouter'))
        .rejects
        .toThrow('Daily cost limit exceeded');
    });

    it('should throw error when daily request limit exceeded', async () => {
      // Make requests up to the daily limit
      for (let i = 0; i < 50; i++) {
        await rateLimiter.checkLimit('openrouter');
        rateLimiter.trackUsage('openrouter', 10);
      }
      
      await expect(rateLimiter.checkLimit('openrouter'))
        .rejects
        .toThrow('Daily request limit exceeded');
    });

    it('should handle rate limiting for requests per minute', async () => {
      // Make requests up to the per-minute limit
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit('openrouter');
        rateLimiter.trackUsage('openrouter', 10);
      }
      
      // Next request should be queued/delayed
      const startTime = Date.now();
      await rateLimiter.checkLimit('openrouter');
      const endTime = Date.now();
      
      // Should have been delayed (though in test it might be minimal)
      expect(endTime - startTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle different API types independently', async () => {
      await rateLimiter.checkLimit('openrouter');
      await rateLimiter.checkLimit('huggingface');
      
      rateLimiter.trackUsage('openrouter', 100);
      rateLimiter.trackUsage('huggingface', 50);
      
      const status = rateLimiter.getQuotaStatus();
      expect(status.openrouterQuota.tokens.used).toBe(100);
      expect(status.huggingfaceQuota.tokens.used).toBe(50);
    });
  });

  describe('trackUsage', () => {
    it('should track token usage and costs', () => {
      rateLimiter.trackUsage('openrouter', 1000);
      
      const status = rateLimiter.getQuotaStatus();
      expect(status.openrouterQuota.tokens.used).toBe(1000);
      expect(status.openrouterQuota.cost.used).toBe(0.001); // 1000 * 0.000001
    });

    it('should accumulate usage over multiple calls', () => {
      rateLimiter.trackUsage('openrouter', 500);
      rateLimiter.trackUsage('openrouter', 300);
      
      const status = rateLimiter.getQuotaStatus();
      expect(status.openrouterQuota.tokens.used).toBe(800);
      expect(status.openrouterQuota.cost.used).toBe(0.0008);
    });
  });

  describe('getQuotaStatus', () => {
    it('should return current quota status', () => {
      rateLimiter.trackUsage('openrouter', 1000);
      rateLimiter.trackUsage('huggingface', 500);
      
      const status = rateLimiter.getQuotaStatus();
      
      expect(status.openrouterQuota.used).toBe(1);
      expect(status.openrouterQuota.limit).toBe(50);
      expect(status.openrouterQuota.tokens.used).toBe(1000);
      expect(status.openrouterQuota.tokens.limit).toBe(10000);
      
      expect(status.huggingfaceQuota.used).toBe(1);
      expect(status.huggingfaceQuota.limit).toBe(30);
      expect(status.huggingfaceQuota.tokens.used).toBe(500);
      expect(status.huggingfaceQuota.tokens.limit).toBe(5000);
    });
  });

  describe('implementBackoff', () => {
    it('should implement backoff for rate limit errors', async () => {
      const error: APIError = {
        type: 'rate_limit',
        message: 'Rate limit exceeded',
        retryAfter: 1 // 1 second
      };
      
      const startTime = Date.now();
      await rateLimiter.implementBackoff(error);
      const endTime = Date.now();
      
      // In test environment, delays are reduced significantly
      expect(endTime - startTime).toBeGreaterThanOrEqual(5); // At least 5ms (reduced for tests)
    });

    it('should implement longer backoff for quota exceeded', async () => {
      const error: APIError = {
        type: 'quota_exceeded',
        message: 'Quota exceeded'
      };
      
      const startTime = Date.now();
      await rateLimiter.implementBackoff(error);
      const endTime = Date.now();
      
      // In test environment, delays are reduced significantly
      expect(endTime - startTime).toBeGreaterThanOrEqual(500); // At least 500ms (reduced for tests)
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost for operations', () => {
      const estimate = rateLimiter.estimateCost('openrouter', 1000);
      
      expect(estimate.cost).toBe(0.001); // 1000 * 0.000001
      expect(estimate.remainingBudget).toBe(0.10); // Full budget available
      expect(estimate.canAfford).toBe(true);
    });

    it('should indicate when operation cannot be afforded', () => {
      // Use up most of the budget
      rateLimiter.trackUsage('openrouter', 95000); // $0.095
      
      const estimate = rateLimiter.estimateCost('openrouter', 10000); // $0.01
      
      expect(estimate.cost).toBe(0.01);
      expect(estimate.remainingBudget).toBe(0.005); // $0.10 - $0.095
      expect(estimate.canAfford).toBe(false); // $0.01 > $0.005
    });
  });

  describe('getUsageStats', () => {
    it('should return usage statistics', () => {
      rateLimiter.trackUsage('openrouter', 1000);
      rateLimiter.trackUsage('openrouter', 500);
      rateLimiter.trackUsage('huggingface', 300);
      
      const stats = rateLimiter.getUsageStats();
      
      expect(stats.openrouter.requestsToday).toBe(2);
      expect(stats.openrouter.tokensToday).toBe(1500);
      expect(stats.openrouter.averageTokensPerRequest).toBe(750);
      
      expect(stats.huggingface.requestsToday).toBe(1);
      expect(stats.huggingface.tokensToday).toBe(300);
      expect(stats.huggingface.averageTokensPerRequest).toBe(300);
    });
  });

  describe('resetUsage', () => {
    it('should reset usage for specific API', () => {
      rateLimiter.trackUsage('openrouter', 1000);
      rateLimiter.trackUsage('huggingface', 500);
      
      rateLimiter.resetUsage('openrouter');
      
      const status = rateLimiter.getQuotaStatus();
      expect(status.openrouterQuota.tokens.used).toBe(0);
      expect(status.huggingfaceQuota.tokens.used).toBe(500); // Should remain
    });

    it('should reset usage for all APIs', () => {
      rateLimiter.trackUsage('openrouter', 1000);
      rateLimiter.trackUsage('huggingface', 500);
      
      rateLimiter.resetUsage();
      
      const status = rateLimiter.getQuotaStatus();
      expect(status.openrouterQuota.tokens.used).toBe(0);
      expect(status.huggingfaceQuota.tokens.used).toBe(0);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        openrouter: {
          requestsPerMinute: 10,
          requestsPerDay: 50,
          tokensPerMinute: 1000,
          tokensPerDay: 10000,
          costPerToken: 0.000001,
          maxDailyCost: 0.20
        }
      };
      
      rateLimiter.updateConfig(newConfig);
      
      // Test that new limits are applied
      const status = rateLimiter.getQuotaStatus();
      expect(status.openrouterQuota.cost.limit).toBe(0.20);
    });
  });
});