/**
 * Rate limiter for API calls with cost tracking and quota management
 */

import {
  QuotaStatus
} from '../../types/question-generation';
import { RateLimiter as IRateLimiter } from '../../interfaces/question-generation-services';

// Local APIError interface to avoid import issues
interface APIError {
  type: 'rate_limit' | 'quota_exceeded' | 'service_unavailable' | 'invalid_response';
  message: string;
  retryAfter?: number;
  statusCode?: number;
}
class APIErrorImpl extends Error implements APIError {
  public readonly type: 'rate_limit' | 'quota_exceeded' | 'service_unavailable' | 'invalid_response';
  public readonly retryAfter?: number;
  public readonly statusCode?: number;

  constructor(details: APIError) {
    super(details.message);
    this.name = 'APIError';
    this.type = details.type;
    this.retryAfter = details.retryAfter;
    this.statusCode = details.statusCode;
  }
}

export interface RateLimitConfig {
  openrouter: {
    requestsPerMinute: number;
    requestsPerDay: number;
    tokensPerMinute: number;
    tokensPerDay: number;
    costPerToken: number;
    maxDailyCost: number;
  };
  huggingface: {
    requestsPerMinute: number;
    requestsPerDay: number;
    tokensPerMinute: number;
    tokensPerDay: number;
    costPerToken: number;
    maxDailyCost: number;
  };
}

/**
 * Injectable time source. Supplying a fake clock and sleep keeps quota tests
 * deterministic and free of real waiting.
 */
export interface RateLimiterOptions {
  /** Current wall-clock time in milliseconds. Defaults to `Date.now`. */
  now?: () => number;
  /** Wait implementation. Defaults to a real `setTimeout` delay. */
  sleep?: (ms: number) => Promise<void>;
}

interface UsageRecord {
  /** Epoch milliseconds. */
  timestamp: number;
  tokens: number;
  cost: number;
}

interface APIUsage {
  requests: UsageRecord[];
  tokens: number;
  cost: number;
  lastReset: number;
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Costs are computed as `tokens * costPerToken` and accumulated over a day.
 * Binary floating point cannot represent those products exactly, so sums drift
 * by ~1e-17 and can sit just below a limit that they logically equal. Rounding
 * to nanodollars keeps comparisons meaningful without visible precision loss.
 */
const USD_SCALE = 1e9;

function roundUsd(amount: number): number {
  return Math.round(amount * USD_SCALE) / USD_SCALE;
}

export class RateLimiter implements IRateLimiter {
  private config: RateLimitConfig;
  private usage: {
    openrouter: APIUsage;
    huggingface: APIUsage;
  };
  private requestQueues: {
    openrouter: Array<{ timestamp: number }>;
    huggingface: Array<{ timestamp: number }>;
  };
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(config: RateLimitConfig, options: RateLimiterOptions = {}) {
    this.config = config;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
    this.usage = {
      openrouter: this.initializeUsage(),
      huggingface: this.initializeUsage()
    };
    this.requestQueues = {
      openrouter: [],
      huggingface: []
    };

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Check if API call is within rate limits
   */
  async checkLimit(apiType: 'openrouter' | 'huggingface'): Promise<boolean> {
    const nowMs = this.now();
    const usage = this.usage[apiType];
    const limits = this.config[apiType];

    // Clean old records
    this.cleanupOldRecords(apiType);

    const oneMinuteAgoMs = nowMs - MINUTE_MS;
    const oneDayAgoMs = nowMs - DAY_MS;

    const recentRequests = usage.requests.filter(r => r.timestamp >= oneMinuteAgoMs);
    const dailyRequests = usage.requests.filter(r => r.timestamp >= oneDayAgoMs);
    const dailyTokens = dailyRequests.reduce((sum, r) => sum + r.tokens, 0);
    const dailyCost = roundUsd(dailyRequests.reduce((sum, r) => sum + r.cost, 0));

    // Hard daily quotas are terminal: surface them immediately rather than
    // sleeping on the soft per-minute queue and only then rejecting the call.
    // A non-positive cap means "no cost ceiling" (free tiers set it to 0.0).
    if (limits.maxDailyCost > 0 && dailyCost >= limits.maxDailyCost) {
      throw new APIErrorImpl({
        type: 'quota_exceeded',
        message: `Daily cost limit exceeded for ${apiType}: $${dailyCost.toFixed(4)} >= $${limits.maxDailyCost}`,
        statusCode: 429
      });
    }

    if (dailyRequests.length >= limits.requestsPerDay) {
      throw new APIErrorImpl({
        type: 'quota_exceeded',
        message: `Daily request limit exceeded for ${apiType}: ${dailyRequests.length} >= ${limits.requestsPerDay}`,
        statusCode: 429
      });
    }

    if (dailyTokens >= limits.tokensPerDay) {
      throw new APIErrorImpl({
        type: 'quota_exceeded',
        message: `Daily token limit exceeded for ${apiType}: ${dailyTokens} >= ${limits.tokensPerDay}`,
        statusCode: 429
      });
    }

    // Soft per-minute limits: pause until the window has room again.
    if (recentRequests.length >= limits.requestsPerMinute) {
      const oldestRequest = recentRequests[0];
      const waitTime = MINUTE_MS - (nowMs - oldestRequest.timestamp);
      if (waitTime > 0) {
        await this.queueRequest(apiType, waitTime);
      }
    }

    const recentTokens = recentRequests.reduce((sum, r) => sum + r.tokens, 0);
    if (recentTokens >= limits.tokensPerMinute) {
      const waitTime = this.calculateTokenWaitTime(apiType, limits.tokensPerMinute);
      if (waitTime > 0) {
        await this.queueRequest(apiType, waitTime);
      }
    }

    return true;
  }

  /**
   * Track API usage after successful call
   */
  trackUsage(apiType: 'openrouter' | 'huggingface', tokens: number): void {
    const cost = roundUsd(tokens * this.config[apiType].costPerToken);

    const record: UsageRecord = {
      timestamp: this.now(),
      tokens,
      cost
    };

    this.usage[apiType].requests.push(record);
    this.usage[apiType].tokens += tokens;
    this.usage[apiType].cost = roundUsd(this.usage[apiType].cost + cost);

    // Log significant usage
    if (cost > 0.01) { // More than 1 cent
      console.log(`${apiType} API usage: ${tokens} tokens, $${cost.toFixed(4)}`);
    }

    // Alert on high usage
    const dailyCost = this.getDailyCost(apiType);
    const costThreshold = this.config[apiType].maxDailyCost * 0.8; // 80% threshold

    if (this.config[apiType].maxDailyCost > 0 && dailyCost > costThreshold) {
      console.warn(`${apiType} daily cost approaching limit: $${dailyCost.toFixed(4)} / $${this.config[apiType].maxDailyCost}`);
    }
  }

  /**
   * Get current quota status
   */
  getQuotaStatus(): QuotaStatus {
    const nowMs = this.now();
    const oneDayAgoMs = nowMs - DAY_MS;
    const nextReset = new Date(nowMs + DAY_MS);

    const getAPIStatus = (apiType: 'openrouter' | 'huggingface') => {
      const usage = this.usage[apiType];
      const limits = this.config[apiType];
      const dailyRequests = usage.requests.filter(r => r.timestamp >= oneDayAgoMs);
      const dailyTokens = dailyRequests.reduce((sum, r) => sum + r.tokens, 0);
      const dailyCost = roundUsd(dailyRequests.reduce((sum, r) => sum + r.cost, 0));

      return {
        used: dailyRequests.length,
        limit: limits.requestsPerDay,
        resetTime: nextReset,
        tokens: {
          used: dailyTokens,
          limit: limits.tokensPerDay
        },
        cost: {
          used: dailyCost,
          limit: limits.maxDailyCost
        }
      };
    };

    return {
      openrouterQuota: getAPIStatus('openrouter'),
      huggingfaceQuota: getAPIStatus('huggingface')
    } as QuotaStatus;
  }

  /**
   * Implement exponential backoff for API failures
   */
  async implementBackoff(error: APIError): Promise<void> {
    let waitTime = 1000; // Start with 1 second

    // Use shorter delays in test environment
    const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
    const testMultiplier = isTest ? 0.01 : 1; // Reduce to 1% in tests

    if (error.type === 'rate_limit') {
      // Use retry-after header if available
      waitTime = error.retryAfter ? error.retryAfter * 1000 : 5000;
    } else if (error.type === 'quota_exceeded') {
      // Longer wait for quota issues
      waitTime = 60000; // 1 minute
    } else if (error.statusCode === 429) {
      // Rate limit response
      waitTime = 10000; // 10 seconds
    }

    // Apply test multiplier
    waitTime *= testMultiplier;

    // Add jitter to prevent thundering herd (reduced for tests)
    const jitter = Math.random() * (isTest ? 10 : 1000);
    const totalWait = waitTime + jitter;

    console.log(`Implementing backoff: waiting ${totalWait}ms for ${error.type}`);
    await this.sleep(totalWait);
  }

  /**
   * Get cost estimates for operations
   */
  estimateCost(apiType: 'openrouter' | 'huggingface', estimatedTokens: number): {
    cost: number;
    remainingBudget: number;
    canAfford: boolean;
  } {
    const costPerToken = this.config[apiType].costPerToken;
    const cost = roundUsd(estimatedTokens * costPerToken);
    const dailyCost = this.getDailyCost(apiType);
    const cap = this.config[apiType].maxDailyCost;
    const remainingBudget = cap <= 0
      ? Number.POSITIVE_INFINITY
      : roundUsd(cap - dailyCost);
    const canAfford = cap <= 0 || cost <= remainingBudget;

    return {
      cost,
      remainingBudget,
      canAfford
    };
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): {
    openrouter: {
      requestsToday: number;
      tokensToday: number;
      costToday: number;
      requestsPerHour: number[];
      averageTokensPerRequest: number;
    };
    huggingface: {
      requestsToday: number;
      tokensToday: number;
      costToday: number;
      requestsPerHour: number[];
      averageTokensPerRequest: number;
    };
  } {
    const getStats = (apiType: 'openrouter' | 'huggingface') => {
      const nowMs = this.now();
      const oneDayAgoMs = nowMs - DAY_MS;
      const dailyRequests = this.usage[apiType].requests.filter(r => r.timestamp >= oneDayAgoMs);

      const requestsToday = dailyRequests.length;
      const tokensToday = dailyRequests.reduce((sum, r) => sum + r.tokens, 0);
      const costToday = roundUsd(dailyRequests.reduce((sum, r) => sum + r.cost, 0));

      // Requests per hour for last 24 hours
      const requestsPerHour: number[] = [];
      for (let i = 0; i < 24; i++) {
        const hourStart = nowMs - (i + 1) * 60 * 60 * 1000;
        const hourEnd = nowMs - i * 60 * 60 * 1000;
        const hourRequests = dailyRequests.filter(r =>
          r.timestamp >= hourStart && r.timestamp < hourEnd
        ).length;
        requestsPerHour.unshift(hourRequests);
      }

      const averageTokensPerRequest = requestsToday > 0 ? tokensToday / requestsToday : 0;

      return {
        requestsToday,
        tokensToday,
        costToday,
        requestsPerHour,
        averageTokensPerRequest
      };
    };

    return {
      openrouter: getStats('openrouter'),
      huggingface: getStats('huggingface')
    };
  }

  /**
   * Reset usage counters (for testing or manual reset)
   */
  resetUsage(apiType?: 'openrouter' | 'huggingface'): void {
    if (apiType) {
      this.usage[apiType] = this.initializeUsage();
    } else {
      this.usage.openrouter = this.initializeUsage();
      this.usage.huggingface = this.initializeUsage();
    }
  }

  /**
   * Update rate limit configuration
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = {
      openrouter: { ...this.config.openrouter, ...newConfig.openrouter },
      huggingface: { ...this.config.huggingface, ...newConfig.huggingface }
    };
  }

  // Private methods

  private initializeUsage(): APIUsage {
    return {
      requests: [],
      tokens: 0,
      cost: 0,
      lastReset: this.now()
    };
  }

  private cleanupOldRecords(apiType: 'openrouter' | 'huggingface'): void {
    const oneDayAgoMs = this.now() - DAY_MS;
    const usage = this.usage[apiType];

    const oldCount = usage.requests.length;
    usage.requests = usage.requests.filter(r => r.timestamp >= oneDayAgoMs);

    // Recalculate totals
    usage.tokens = usage.requests.reduce((sum, r) => sum + r.tokens, 0);
    usage.cost = roundUsd(usage.requests.reduce((sum, r) => sum + r.cost, 0));

    if (oldCount > usage.requests.length) {
      console.log(`Cleaned up ${oldCount - usage.requests.length} old ${apiType} records`);
    }
  }

  private calculateTokenWaitTime(apiType: 'openrouter' | 'huggingface', tokenLimit: number): number {
    const nowMs = this.now();
    const oneMinuteAgoMs = nowMs - MINUTE_MS;
    const recentRequests = this.usage[apiType].requests.filter(r => r.timestamp >= oneMinuteAgoMs);

    if (recentRequests.length === 0) return 0;

    const oldestRequest = recentRequests[0];
    return MINUTE_MS - (nowMs - oldestRequest.timestamp);
  }

  private async queueRequest(apiType: 'openrouter' | 'huggingface', waitTime: number): Promise<void> {
    const queueItem = { timestamp: this.now() };
    this.requestQueues[apiType].push(queueItem);

    try {
      await this.sleep(waitTime);
    } finally {
      const index = this.requestQueues[apiType].indexOf(queueItem);
      if (index > -1) {
        this.requestQueues[apiType].splice(index, 1);
      }
    }
  }

  private getDailyCost(apiType: 'openrouter' | 'huggingface'): number {
    const oneDayAgoMs = this.now() - DAY_MS;
    return roundUsd(this.usage[apiType].requests
      .filter(r => r.timestamp >= oneDayAgoMs)
      .reduce((sum, r) => sum + r.cost, 0));
  }

  private startCleanupInterval(): void {
    // Clean up old records every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldRecords('openrouter');
      this.cleanupOldRecords('huggingface');
    }, 60 * 60 * 1000);
    // Do not hold the event loop open purely for housekeeping.
    this.cleanupInterval.unref?.();
  }

  /**
   * Stop the cleanup interval (for testing)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
