/**
 * Configuration for rate limiting and cost management
 */

import { RateLimitConfig } from './rate-limiter';

/**
 * Default rate limiting configuration
 * Based on typical API limits and reasonable cost controls
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  openrouter: {
    requestsPerMinute: 60, // OpenRouter typical limit
    requestsPerDay: 1000,
    tokensPerMinute: 32000, // Generous limit for free tier
    tokensPerDay: 1000000,
    costPerToken: 0.0, // DeepSeek v3.1:free is free!
    maxDailyCost: 0.0 // No cost for free tier
  },
  huggingface: {
    requestsPerMinute: 30, // Conservative limit for inference API
    requestsPerDay: 500,
    tokensPerMinute: 10000,
    tokensPerDay: 100000,
    costPerToken: 0.0000002, // Estimated cost for hosted inference
    maxDailyCost: 2.00 // $2 daily limit
  }
};

/**
 * Development configuration with lower limits
 */
export const DEVELOPMENT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  openrouter: {
    requestsPerMinute: 5,  // Conservative for development
    requestsPerDay: 100,   // Adequate for dev testing
    tokensPerMinute: 5000,
    tokensPerDay: 50000,
    costPerToken: 0.0,
    maxDailyCost: 0.0
  },
  huggingface: {
    requestsPerMinute: 5,
    requestsPerDay: 50,
    tokensPerMinute: 2000,
    tokensPerDay: 20000,
    costPerToken: 0.0000002,
    maxDailyCost: 0.50
  }
};

/**
 * Production configuration with higher limits
 */
export const PRODUCTION_RATE_LIMIT_CONFIG: RateLimitConfig = {
  openrouter: {
    requestsPerMinute: 100,
    requestsPerDay: 5000,
    tokensPerMinute: 50000,
    tokensPerDay: 5000000,
    costPerToken: 0.0,
    maxDailyCost: 0.0
  },
  huggingface: {
    requestsPerMinute: 60,
    requestsPerDay: 2000,
    tokensPerMinute: 20000,
    tokensPerDay: 500000,
    costPerToken: 0.0000002,
    maxDailyCost: 10.00
  }
};

/**
 * Testing configuration with very low limits
 */
export const TESTING_RATE_LIMIT_CONFIG: RateLimitConfig = {
  openrouter: {
    requestsPerMinute: 5,
    requestsPerDay: 20,
    tokensPerMinute: 1000,
    tokensPerDay: 5000,
    costPerToken: 0.0,
    maxDailyCost: 0.0
  },
  huggingface: {
    requestsPerMinute: 3,
    requestsPerDay: 10,
    tokensPerMinute: 500,
    tokensPerDay: 2000,
    costPerToken: 0.0000002,
    maxDailyCost: 0.05
  }
};

/**
 * Get configuration based on environment
 */
export function getRateLimitConfig(): RateLimitConfig {
  const env = process.env.NODE_ENV;
  
  switch (env) {
    case 'production':
      return PRODUCTION_RATE_LIMIT_CONFIG;
    case 'development':
      return DEVELOPMENT_RATE_LIMIT_CONFIG;
    case 'test':
      return TESTING_RATE_LIMIT_CONFIG;
    default:
      return DEFAULT_RATE_LIMIT_CONFIG;
  }
}

/**
 * Create configuration from environment variables
 */
export function createRateLimitConfigFromEnv(): RateLimitConfig {
  const baseConfig = getRateLimitConfig();
  
  return {
    openrouter: {
      requestsPerMinute: parseInt(process.env.OPENROUTER_REQUESTS_PER_MINUTE || String(baseConfig.openrouter.requestsPerMinute)),
      requestsPerDay: parseInt(process.env.OPENROUTER_REQUESTS_PER_DAY || String(baseConfig.openrouter.requestsPerDay)),
      tokensPerMinute: parseInt(process.env.OPENROUTER_TOKENS_PER_MINUTE || String(baseConfig.openrouter.tokensPerMinute)),
      tokensPerDay: parseInt(process.env.OPENROUTER_TOKENS_PER_DAY || String(baseConfig.openrouter.tokensPerDay)),
      costPerToken: parseFloat(process.env.OPENROUTER_COST_PER_TOKEN || String(baseConfig.openrouter.costPerToken)),
      maxDailyCost: parseFloat(process.env.OPENROUTER_MAX_DAILY_COST || String(baseConfig.openrouter.maxDailyCost))
    },
    huggingface: {
      requestsPerMinute: parseInt(process.env.HF_REQUESTS_PER_MINUTE || String(baseConfig.huggingface.requestsPerMinute)),
      requestsPerDay: parseInt(process.env.HF_REQUESTS_PER_DAY || String(baseConfig.huggingface.requestsPerDay)),
      tokensPerMinute: parseInt(process.env.HF_TOKENS_PER_MINUTE || String(baseConfig.huggingface.tokensPerMinute)),
      tokensPerDay: parseInt(process.env.HF_TOKENS_PER_DAY || String(baseConfig.huggingface.tokensPerDay)),
      costPerToken: parseFloat(process.env.HF_COST_PER_TOKEN || String(baseConfig.huggingface.costPerToken)),
      maxDailyCost: parseFloat(process.env.HF_MAX_DAILY_COST || String(baseConfig.huggingface.maxDailyCost))
    }
  };
}

/**
 * Validate rate limit configuration
 */
export function validateRateLimitConfig(config: RateLimitConfig): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const validateAPIConfig = (apiName: string, apiConfig: any) => {
    if (apiConfig.requestsPerMinute <= 0) {
      errors.push(`${apiName}: requestsPerMinute must be positive`);
    }
    
    if (apiConfig.requestsPerDay <= 0) {
      errors.push(`${apiName}: requestsPerDay must be positive`);
    }
    
    if (apiConfig.tokensPerMinute <= 0) {
      errors.push(`${apiName}: tokensPerMinute must be positive`);
    }
    
    if (apiConfig.tokensPerDay <= 0) {
      errors.push(`${apiName}: tokensPerDay must be positive`);
    }
    
    if (apiConfig.costPerToken < 0) {
      errors.push(`${apiName}: costPerToken cannot be negative`);
    }
    
    if (apiConfig.maxDailyCost <= 0) {
      errors.push(`${apiName}: maxDailyCost must be positive`);
    }
    
    // Logical consistency checks
    if (apiConfig.requestsPerMinute * 60 * 24 < apiConfig.requestsPerDay) {
      errors.push(`${apiName}: requestsPerDay exceeds theoretical maximum based on requestsPerMinute`);
    }
    
    if (apiConfig.tokensPerMinute * 60 * 24 < apiConfig.tokensPerDay) {
      errors.push(`${apiName}: tokensPerDay exceeds theoretical maximum based on tokensPerMinute`);
    }
  };

  validateAPIConfig('OpenRouter', config.openrouter);
  validateAPIConfig('Hugging Face', config.huggingface);

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Cost estimation utilities
 */
export const COST_ESTIMATES = {
  // Typical token counts for different operations
  QUESTION_GENERATION: {
    llamaInput: 300, // Prompt tokens
    llamaOutput: 150, // Generated question tokens
    openrouterInput: 200, // Question to refine
    openrouterOutput: 200 // Refined question
  },
  
  // Cost per operation estimates
  OPERATION_COSTS: {
    questionGeneration: 0.0001, // Estimated total cost per question
    batchGeneration: 0.0008, // Cost for 10 questions
    validation: 0.00002 // Cost for validation only
  }
};

/**
 * Get cost estimate for operations
 */
export function estimateOperationCost(operation: keyof typeof COST_ESTIMATES.OPERATION_COSTS): number {
  return COST_ESTIMATES.OPERATION_COSTS[operation];
}

/**
 * Calculate monthly cost projection
 */
export function calculateMonthlyCostProjection(
  dailyQuestions: number,
  config: RateLimitConfig
): {
  openrouterMonthlyCost: number;
  huggingfaceMonthlyCost: number;
  totalMonthlyCost: number;
  isWithinBudget: boolean;
} {
  const tokensPerQuestion = COST_ESTIMATES.QUESTION_GENERATION;
  const daysInMonth = 30;
  
  const openrouterTokensPerDay = (tokensPerQuestion.openrouterInput + tokensPerQuestion.openrouterOutput) * dailyQuestions;
  const hfTokensPerDay = (tokensPerQuestion.llamaInput + tokensPerQuestion.llamaOutput) * dailyQuestions;
  
  const openrouterMonthlyCost = openrouterTokensPerDay * config.openrouter.costPerToken * daysInMonth;
  const huggingfaceMonthlyCost = hfTokensPerDay * config.huggingface.costPerToken * daysInMonth;
  const totalMonthlyCost = openrouterMonthlyCost + huggingfaceMonthlyCost;
  
  const monthlyBudget = (config.openrouter.maxDailyCost + config.huggingface.maxDailyCost) * daysInMonth;
  const isWithinBudget = totalMonthlyCost <= monthlyBudget;
  
  return {
    openrouterMonthlyCost,
    huggingfaceMonthlyCost,
    totalMonthlyCost,
    isWithinBudget
  };
}

/**
 * Recommended configurations for different usage patterns
 */
export const USAGE_PATTERN_CONFIGS = {
  // Light usage: Few questions per day, development/testing
  light: {
    ...DEVELOPMENT_RATE_LIMIT_CONFIG,
    openrouter: {
      ...DEVELOPMENT_RATE_LIMIT_CONFIG.openrouter,
      maxDailyCost: 0.0 // Free!
    },
    huggingface: {
      ...DEVELOPMENT_RATE_LIMIT_CONFIG.huggingface,
      maxDailyCost: 0.25
    }
  },
  
  // Medium usage: Regular use, small to medium applications
  medium: {
    ...DEFAULT_RATE_LIMIT_CONFIG,
    openrouter: {
      ...DEFAULT_RATE_LIMIT_CONFIG.openrouter,
      maxDailyCost: 0.0 // Free!
    },
    huggingface: {
      ...DEFAULT_RATE_LIMIT_CONFIG.huggingface,
      maxDailyCost: 1.50
    }
  },
  
  // Heavy usage: High volume, production applications
  heavy: {
    ...PRODUCTION_RATE_LIMIT_CONFIG,
    openrouter: {
      ...PRODUCTION_RATE_LIMIT_CONFIG.openrouter,
      maxDailyCost: 0.0 // Free!
    },
    huggingface: {
      ...PRODUCTION_RATE_LIMIT_CONFIG.huggingface,
      maxDailyCost: 7.50
    }
  }
} as const;

/**
 * Get recommended configuration for usage pattern
 */
export function getConfigForUsagePattern(pattern: keyof typeof USAGE_PATTERN_CONFIGS): RateLimitConfig {
  return USAGE_PATTERN_CONFIGS[pattern];
}