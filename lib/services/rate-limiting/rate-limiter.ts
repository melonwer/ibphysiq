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

interface UsageRecord {
  timestamp: Date;
  tokens: number;
  cost: number;
}

interface APIUsage {
  requests: UsageRecord[];
  tokens: number;
  cost: number;
  lastReset: Date;
}

export class RateLimiter implements IRateLimiter {
  private config: RateLimitConfig;
  private usage: {
    openrouter: APIUsage;
    huggingface: APIUsage;
  };
  private requestQueues: {
    openrouter: Array<{ resolve: Function; reject: Function; timestamp: Date }>;
    huggingface: Array<{ resolve: Function; reject: Function; timestamp: Date }>;
  };
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimitConfig) {
    this.config = config;
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
    const now = new Date();
    const usage = this.usage[apiType];
    const limits = this.config[apiType];

    // Clean old records
    this.cleanupOldRecords(apiType);

    // Check daily cost limit
    if (usage.cost >= limits.maxDailyCost) {
      throw new APIErrorImpl({
        type: 'quota_exceeded',
        message: `Daily cost limit exceeded for ${apiType}: $${usage.cost.toFixed(4)} >= $${limits.maxDailyCost}`,
        statusCode: 429
      });
    }

    // Check requests per minute
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const recentRequests = usage.requests.filter(r => r.timestamp >= oneMinuteAgo);
    
    if (recentRequests.length >= limits.requestsPerMinute) {
      const oldestRequest = recentRequests[0];
      const waitTime = 60000 - (now.getTime() - oldestRequest.timestamp.getTime());
      
      if (waitTime > 0) {
        await this.queueRequest(apiType, waitTime);
      }
    }

    // Check requests per day
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dailyRequests = usage.requests.filter(r => r.timestamp >= oneDayAgo);
    
    if (dailyRequests.length >= limits.requestsPerDay) {
      throw new APIErrorImpl({
        type: 'quota_exceeded',
        message: `Daily request limit exceeded for ${apiType}: ${dailyRequests.length} >= ${limits.requestsPerDay}`,
        statusCode: 429
      });
    }

    // Check tokens per minute
    const recentTokens = recentRequests.reduce((sum, r) => sum + r.tokens, 0);
    if (recentTokens >= limits.tokensPerMinute) {
      const waitTime = this.calculateTokenWaitTime(apiType, limits.tokensPerMinute);
      if (waitTime > 0) {
        await this.queueRequest(apiType, waitTime);
      }
    }

    // Check tokens per day
    const dailyTokens = dailyRequests.reduce((sum, r) => sum + r.tokens, 0);
    if (dailyTokens >= limits.tokensPerDay) {
      throw new APIErrorImpl({
        type: 'quota_exceeded',
        message: `Daily token limit exceeded for ${apiType}: ${dailyTokens} >= ${limits.tokensPerDay}`,
        statusCode: 429
      });
    }

    return true;
  }

  /**
   * Track API usage after successful call
   */
  trackUsage(apiType: 'openrouter' | 'huggingface', tokens: number): void {
    const now = new Date();
    const cost = tokens * this.config[apiType].costPerToken;
    
    const record: UsageRecord = {
      timestamp: now,
      tokens,
      cost
    };

    this.usage[apiType].requests.push(record);
    this.usage[apiType].tokens += tokens;
    this.usage[apiType].cost += cost;

    // Log significant usage
    if (cost > 0.01) { // More than 1 cent
      console.log(`${apiType} API usage: ${tokens} tokens, $${cost.toFixed(4)}`);
    }

    // Alert on high usage
    const dailyCost = this.getDailyCost(apiType);
    const costThreshold = this.config[apiType].maxDailyCost * 0.8; // 80% threshold
    
    if (dailyCost > costThreshold) {
      console.warn(`${apiType} daily cost approaching limit: $${dailyCost.toFixed(4)} / $${this.config[apiType].maxDailyCost}`);
    }
  }

  /**
   * Get current quota status
   */
  getQuotaStatus(): QuotaStatus {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const nextReset = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const getAPIStatus = (apiType: 'openrouter' | 'huggingface') => {
      const usage = this.usage[apiType];
      const limits = this.config[apiType];
      const dailyRequests = usage.requests.filter(r => r.timestamp >= oneDayAgo);
      const dailyTokens = dailyRequests.reduce((sum, r) => sum + r.tokens, 0);
      const dailyCost = dailyRequests.reduce((sum, r) => sum + r.cost, 0);

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
    await this.delay(totalWait);
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
    const cost = estimatedTokens * costPerToken;
    const dailyCost = this.getDailyCost(apiType);
    const remainingBudget = this.config[apiType].maxDailyCost - dailyCost;
    const canAfford = cost <= remainingBudget;

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
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const dailyRequests = this.usage[apiType].requests.filter(r => r.timestamp >= oneDayAgo);
      
      const requestsToday = dailyRequests.length;
      const tokensToday = dailyRequests.reduce((sum, r) => sum + r.tokens, 0);
      const costToday = dailyRequests.reduce((sum, r) => sum + r.cost, 0);
      
      // Requests per hour for last 24 hours
      const requestsPerHour: number[] = [];
      for (let i = 0; i < 24; i++) {
        const hourStart = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000);
        const hourEnd = new Date(now.getTime() - i * 60 * 60 * 1000);
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
      lastReset: new Date()
    };
  }

  private cleanupOldRecords(apiType: 'openrouter' | 'huggingface'): void {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const usage = this.usage[apiType];
    
    const oldCount = usage.requests.length;
    usage.requests = usage.requests.filter(r => r.timestamp >= oneDayAgo);
    
    // Recalculate totals
    usage.tokens = usage.requests.reduce((sum, r) => sum + r.tokens, 0);
    usage.cost = usage.requests.reduce((sum, r) => sum + r.cost, 0);
    
    if (oldCount > usage.requests.length) {
      console.log(`Cleaned up ${oldCount - usage.requests.length} old ${apiType} records`);
    }
  }

  private calculateTokenWaitTime(apiType: 'openrouter' | 'huggingface', tokenLimit: number): number {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const recentRequests = this.usage[apiType].requests.filter(r => r.timestamp >= oneMinuteAgo);
    
    if (recentRequests.length === 0) return 0;
    
    const oldestRequest = recentRequests[0];
    return 60000 - (now.getTime() - oldestRequest.timestamp.getTime());
  }

  private async queueRequest(apiType: 'openrouter' | 'huggingface', waitTime: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const queueItem = {
        resolve,
        reject,
        timestamp: new Date()
      };
      
      this.requestQueues[apiType].push(queueItem);
      
      setTimeout(() => {
        const index = this.requestQueues[apiType].indexOf(queueItem);
        if (index > -1) {
          this.requestQueues[apiType].splice(index, 1);
          resolve();
        }
      }, waitTime);
    });
  }

  private getDailyCost(apiType: 'openrouter' | 'huggingface'): number {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.usage[apiType].requests
      .filter(r => r.timestamp >= oneDayAgo)
      .reduce((sum, r) => sum + r.cost, 0);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private startCleanupInterval(): void {
    // Clean up old records every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldRecords('openrouter');
      this.cleanupOldRecords('huggingface');
    }, 60 * 60 * 1000);
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