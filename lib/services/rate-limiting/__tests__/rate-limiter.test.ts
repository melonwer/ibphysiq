/**
 * Unit tests for RateLimiter
 *
 * Time is injected so every quota path is deterministic: no test waits on a
 * real timer and no test depends on how fast the suite happens to run.
 */

import { RateLimiter, RateLimitConfig } from '../rate-limiter';
import { APIError } from '../../../types/question-generation';

const BASE_TIME = Date.UTC(2026, 0, 1, 0, 0, 0);

interface Harness {
  limiter: RateLimiter;
  /** Every wait the limiter asked for, in request order. */
  sleeps: number[];
  /** Advance the injected clock. */
  advance: (ms: number) => void;
}

describe('RateLimiter', () => {
  let harness: Harness;

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

  const createHarness = (config: RateLimitConfig = testConfig): Harness => {
    let nowMs = BASE_TIME;
    const sleeps: number[] = [];

    const limiter = new RateLimiter(config, {
      now: () => nowMs,
      sleep: async (ms: number) => {
        sleeps.push(ms);
      }
    });

    return {
      limiter,
      sleeps,
      advance: (ms: number) => {
        nowMs += ms;
      }
    };
  };

  // Convenience aliases so the assertions below stay readable.
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    harness = createHarness();
    rateLimiter = harness.limiter;
  });

  afterEach(() => {
    rateLimiter.stopCleanup();
  });

  describe('checkLimit', () => {
    it('should allow requests within limits', async () => {
      const result = await rateLimiter.checkLimit('openrouter');
      expect(result).toBe(true);
      expect(harness.sleeps).toHaveLength(0);
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

    it('should enforce the daily cost cap as accrued spend reaches it', async () => {
      // Generous token budgets so cost is the only binding constraint.
      const costHarness = createHarness({
        ...testConfig,
        openrouter: {
          ...testConfig.openrouter,
          tokensPerMinute: 1_000_000,
          tokensPerDay: 10_000_000
        }
      });
      const { limiter } = costHarness;

      try {
        // Each batch is $0.04; accumulated dollars must compare cleanly
        // against the cap rather than drifting a hair underneath it.
        limiter.trackUsage('openrouter', 40000);
        limiter.trackUsage('openrouter', 40000);
        expect(limiter.getQuotaStatus().openrouterQuota.cost.used).toBe(0.08);
        await expect(limiter.checkLimit('openrouter')).resolves.toBe(true);

        // One more request pushes the day's spend exactly onto the cap.
        limiter.trackUsage('openrouter', 20000);
        expect(limiter.getQuotaStatus().openrouterQuota.cost.used).toBe(0.10);

        await expect(limiter.checkLimit('openrouter'))
          .rejects
          .toThrow('Daily cost limit exceeded');
      } finally {
        limiter.stopCleanup();
      }
    });

    it('should throw error when daily request limit exceeded', async () => {
      // Space requests 15s apart so the per-minute budget is never the
      // binding constraint -- this isolates daily exhaustion.
      for (let i = 0; i < 50; i++) {
        await rateLimiter.checkLimit('openrouter');
        rateLimiter.trackUsage('openrouter', 10);
        harness.advance(15000);
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

      // The sixth request within the same minute must be paced, not rejected.
      await expect(rateLimiter.checkLimit('openrouter')).resolves.toBe(true);
      expect(harness.sleeps).toEqual([60000]);

      // Once the window rolls over the limiter stops pacing.
      harness.advance(60001);
      await rateLimiter.checkLimit('openrouter');
      expect(harness.sleeps).toEqual([60000]);
    });

    it('should pace on tokens per minute once the token budget is spent', async () => {
      rateLimiter.trackUsage('openrouter', 1000); // tokensPerMinute budget exactly

      await expect(rateLimiter.checkLimit('openrouter')).resolves.toBe(true);
      expect(harness.sleeps).toEqual([60000]);
    });

    it('should not enforce a zero daily cost cap', async () => {
      // Free tiers configure maxDailyCost: 0, which means "no ceiling" rather
      // than "nothing may be spent".
      const freeTier = createHarness({
        ...testConfig,
        openrouter: {
          ...testConfig.openrouter,
          costPerToken: 0.001,
          maxDailyCost: 0,
          tokensPerMinute: 10_000_000,
          tokensPerDay: 10_000_000
        }
      });
      const { limiter } = freeTier;

      try {
        limiter.trackUsage('openrouter', 100000);
        await expect(limiter.checkLimit('openrouter')).resolves.toBe(true);
      } finally {
        limiter.stopCleanup();
      }
    });

    it('treats zero daily cost as unlimited when estimating affordability', () => {
      const freeTier = createHarness({
        ...testConfig,
        openrouter: { ...testConfig.openrouter, maxDailyCost: 0 }
      });
      try {
        freeTier.limiter.trackUsage('openrouter', 100000);
        expect(freeTier.limiter.estimateCost('openrouter', 100000)).toEqual({
          cost: 0.1,
          remainingBudget: Number.POSITIVE_INFINITY,
          canAfford: true
        });
      } finally {
        freeTier.limiter.stopCleanup();
      }
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

    it('should drop records once they fall outside the daily window', async () => {
      rateLimiter.trackUsage('openrouter', 1000);
      harness.advance(24 * 60 * 60 * 1000 + 1);

      await rateLimiter.checkLimit('openrouter');

      const status = rateLimiter.getQuotaStatus();
      expect(status.openrouterQuota.used).toBe(0);
      expect(status.openrouterQuota.cost.used).toBe(0);
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

      await rateLimiter.implementBackoff(error);

      // In test environment, delays are reduced significantly
      expect(harness.sleeps).toHaveLength(1);
      expect(harness.sleeps[0]).toBeGreaterThanOrEqual(5);
    });

    it('should implement longer backoff for quota exceeded', async () => {
      const error: APIError = {
        type: 'quota_exceeded',
        message: 'Quota exceeded'
      };

      await rateLimiter.implementBackoff(error);

      // In test environment, delays are reduced significantly
      expect(harness.sleeps).toHaveLength(1);
      expect(harness.sleeps[0]).toBeGreaterThanOrEqual(500);
    });

    it('should wait longer for quota exhaustion than for a transient rate limit', async () => {
      await rateLimiter.implementBackoff({ type: 'rate_limit', message: 'slow down' });
      await rateLimiter.implementBackoff({ type: 'quota_exceeded', message: 'out of quota' });

      const [transientWait, quotaWait] = harness.sleeps;
      expect(quotaWait).toBeGreaterThan(transientWait);
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
