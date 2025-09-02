/**
 * Configuration for Llama model service
 */

import { LlamaConfig } from './llama-model-service';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Default configuration for Llama service
 */
export const DEFAULT_LLAMA_CONFIG: Omit<LlamaConfig, 'apiKey' | 'modelId'> = {
  maxRetries: 3,
  timeoutMs: 120000, // 120 seconds for model generation (increased to handle slower hosted endpoints)
  temperature: 0.7, // Balanced creativity and consistency
  maxTokens: 500, // Sufficient for question generation
  topP: 0.9 // Good diversity in responses
};

/**
 * Create Llama configuration from environment variables or server-side settings file.
 *
 * Supports Hugging Face (HUGGINGFACE_API_KEY) or Lightning AI (LIT_API_URL + LIT_API_TOKEN).
 * If neither is present in env, this function will attempt to read owner-provided fallbacks from
 * data/settings.json (used when useOwnerCredits=true). Development fallback is still supported.
 */
export function createLlamaConfig(): LlamaConfig {
  let hfApiKey = process.env.HUGGINGFACE_API_KEY || '';
  let litUrl = process.env.LIT_API_URL || process.env.LIT_PROXY_URL || '';
  let litToken = process.env.LIT_API_TOKEN || '';
  let modelId = process.env.LLAMA_MODEL_ID || getRecommendedModel();
  let useOwnerCredits = false;

  console.log('[LlamaConfig] Initial environment values:', {
    hfApiKey: hfApiKey ? '****' + hfApiKey.slice(-4) : 'empty',
    litUrl: litUrl ? 'configured' : 'empty',
    litToken: litToken ? '****' + litToken.slice(-4) : 'empty',
    modelId,
    nodeEnv: process.env.NODE_ENV
  });

  // Try reading data/settings.json for owner-provided fallbacks
  try {
    const settingsPath = join(process.cwd(), 'data', 'settings.json');
    console.log('[LlamaConfig] Checking settings file at:', settingsPath);
    if (existsSync(settingsPath)) {
      const raw = readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(raw || '{}');

      console.log('[LlamaConfig] Settings file contents:', {
        hasHfKey: !!settings.huggingfaceApiKey,
        hasLitUrl: !!settings.litUrl,
        hasLitToken: !!settings.litToken,
        hasModelId: !!settings.llamaModelId,
        useOwnerCredits: !!settings.useOwnerCredits
      });

      if (!hfApiKey && settings.huggingfaceApiKey) hfApiKey = settings.huggingfaceApiKey;
      if (!litUrl && settings.litUrl) litUrl = settings.litUrl;
      if (!litToken && settings.litToken) litToken = settings.litToken;
      if (!modelId && settings.llamaModelId) modelId = settings.llamaModelId;
      useOwnerCredits = !!settings.useOwnerCredits;

      // If owner credits are enabled and no explicit litUrl is configured, prefer the server-side proxy
      // so the owner's LIT token remains server-side and clients can call /api/predict-proxy safely.
      if (!litUrl && useOwnerCredits) {
        litUrl = process.env.LIT_PROXY_URL || 'http://localhost:3000/api/predict-proxy';
        console.info('Using server-side proxy for LIT by default because useOwnerCredits=true');
      }
    } else {
      console.log('[LlamaConfig] Settings file does not exist');
    }
  } catch {
    console.warn('Could not read data/settings.json — continuing with environment variables only.');
  }

  console.log('[LlamaConfig] After settings file processing:', {
    hfApiKey: hfApiKey ? '****' + hfApiKey.slice(-4) : 'empty',
    litUrl: litUrl ? 'configured' : 'empty',
    litToken: litToken ? '****' + litToken.slice(-4) : 'empty',
    modelId,
    useOwnerCredits
  });

  // If neither provider configured, allow development fallback or use owner credits if enabled
  if (!hfApiKey && !litUrl) {
    console.log('[LlamaConfig] No providers configured - checking fallback options');
    if (process.env.NODE_ENV === 'development') {
      console.warn('No HUGGINGFACE_API_KEY or LIT_API_URL configured — using development fallback API key placeholder.');
      const devConfig = {
        ...DEFAULT_LLAMA_CONFIG,
        apiKey: 'your_huggingface_api_key_here',
        modelId,
        provider: 'huggingface' as const,
        maxRetries: parseInt(process.env.LLAMA_MAX_RETRIES || String(DEFAULT_LLAMA_CONFIG.maxRetries)),
        timeoutMs: parseInt(process.env.LLAMA_TIMEOUT_MS || String(DEFAULT_LLAMA_CONFIG.timeoutMs)),
        temperature: parseFloat(process.env.LLAMA_TEMPERATURE || String(DEFAULT_LLAMA_CONFIG.temperature)),
        maxTokens: parseInt(process.env.LLAMA_MAX_TOKENS || String(DEFAULT_LLAMA_CONFIG.maxTokens)),
        topP: parseFloat(process.env.LLAMA_TOP_P || String(DEFAULT_LLAMA_CONFIG.topP))
      };
      console.log('[LlamaConfig] Development config created:', {
        provider: devConfig.provider,
        modelId: devConfig.modelId,
        hasApiKey: !!devConfig.apiKey
      });
      return devConfig;
    }

    if (useOwnerCredits && (litUrl || hfApiKey)) {
      console.info('Using owner-provided credentials from data/settings.json because useOwnerCredits=true.');
      // proceed to construct config from available owner credentials
    } else {
      throw new Error('HUGGINGFACE_API_KEY or LIT_API_URL environment variable is required (or configure owner credentials in data/settings.json).');
    }
  }

  // Prefer LIT if configured (either via env or settings.json)
  if (litUrl) {
    console.log('[LlamaConfig] Using LIT provider');
    const litConfig = {
      ...DEFAULT_LLAMA_CONFIG,
      apiKey: hfApiKey || '',
      modelId,
      provider: 'lit' as const,
      litUrl,
      litToken,
      maxRetries: parseInt(process.env.LLAMA_MAX_RETRIES || String(DEFAULT_LLAMA_CONFIG.maxRetries)),
      timeoutMs: parseInt(process.env.LLAMA_TIMEOUT_MS || String(DEFAULT_LLAMA_CONFIG.timeoutMs)),
      temperature: parseFloat(process.env.LLAMA_TEMPERATURE || String(DEFAULT_LLAMA_CONFIG.temperature)),
      maxTokens: parseInt(process.env.LLAMA_MAX_TOKENS || String(DEFAULT_LLAMA_CONFIG.maxTokens)),
      topP: parseFloat(process.env.LLAMA_TOP_P || String(DEFAULT_LLAMA_CONFIG.topP))
    };
    console.log('[LlamaConfig] LIT config created:', {
      provider: litConfig.provider,
      litUrl: litConfig.litUrl ? 'configured' : 'empty',
      litToken: litConfig.litToken ? '****' + litConfig.litToken.slice(-4) : 'empty',
      modelId: litConfig.modelId
    });
    return litConfig;
  }

  // Otherwise fall back to Hugging Face
  console.log('[LlamaConfig] Using Hugging Face provider');
  const hfConfig = {
    ...DEFAULT_LLAMA_CONFIG,
    apiKey: hfApiKey,
    modelId,
    provider: 'huggingface' as const,
    maxRetries: parseInt(process.env.LLAMA_MAX_RETRIES || String(DEFAULT_LLAMA_CONFIG.maxRetries)),
    timeoutMs: parseInt(process.env.LLAMA_TIMEOUT_MS || String(DEFAULT_LLAMA_CONFIG.timeoutMs)),
    temperature: parseFloat(process.env.LLAMA_TEMPERATURE || String(DEFAULT_LLAMA_CONFIG.temperature)),
    maxTokens: parseInt(process.env.LLAMA_MAX_TOKENS || String(DEFAULT_LLAMA_CONFIG.maxTokens)),
    topP: parseFloat(process.env.LLAMA_TOP_P || String(DEFAULT_LLAMA_CONFIG.topP))
  };
  console.log('[LlamaConfig] Hugging Face config created:', {
    provider: hfConfig.provider,
    apiKey: hfConfig.apiKey ? '****' + hfConfig.apiKey.slice(-4) : 'empty',
    modelId: hfConfig.modelId
  });
  return hfConfig;
}

/**
 * Validate Llama configuration
 */
export function validateLlamaConfig(config: LlamaConfig): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.provider === 'lit') {
    if (!config.litUrl || config.litUrl.trim().length === 0) {
      errors.push('LIT API URL is required for provider "lit"');
    }
  } else {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      errors.push('API key is required');
    }

    if (!config.modelId || config.modelId.trim().length === 0) {
      errors.push('Model ID is required');
    }
  }

  if (config.maxRetries < 1 || config.maxRetries > 10) {
    errors.push('Max retries must be between 1 and 10');
  }

  if (config.timeoutMs < 5000 || config.timeoutMs > 120000) {
    errors.push('Timeout must be between 5 and 120 seconds');
  }

  if (config.temperature < 0 || config.temperature > 2) {
    errors.push('Temperature must be between 0 and 2');
  }

  if (config.maxTokens < 100 || config.maxTokens > 2000) {
    errors.push('Max tokens must be between 100 and 2000');
  }

  if (config.topP < 0.1 || config.topP > 1.0) {
    errors.push('Top P must be between 0.1 and 1.0');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Configuration for different environments
 */
export const ENVIRONMENT_CONFIGS = {
  development: {
    ...DEFAULT_LLAMA_CONFIG,
    maxRetries: 2,
    timeoutMs: 20000,
    temperature: 0.8
  },
  
  production: {
    ...DEFAULT_LLAMA_CONFIG,
    maxRetries: 3,
    timeoutMs: 60000, // Increased production timeout to 60s to accommodate hosted inference latency
    temperature: 0.7
  },
  
  testing: {
    ...DEFAULT_LLAMA_CONFIG,
    maxRetries: 1,
    timeoutMs: 10000,
    temperature: 0.5,
    maxTokens: 200
  }
} as const;

/**
 * Get configuration for current environment
 */
export function getEnvironmentConfig(): Omit<LlamaConfig, 'apiKey' | 'modelId'> {
  const env = process.env.NODE_ENV as keyof typeof ENVIRONMENT_CONFIGS;
  return ENVIRONMENT_CONFIGS[env] || ENVIRONMENT_CONFIGS.development;
}

/**
 * Model-specific configurations for different fine-tuned versions
 */
export const MODEL_CONFIGS = {
  'ib-physics-question-generator': {
    temperature: 0.7,
    maxTokens: 500,
    topP: 0.9
  },
  'ib-physics-question-generator-v2': {
    temperature: 0.6,
    maxTokens: 600,
    topP: 0.85
  }
} as const;

/**
 * Get model-specific configuration
 */
export function getModelConfig(modelId: string): Partial<LlamaConfig> {
  const modelName = modelId.split('/').pop() || modelId;
  return MODEL_CONFIGS[modelName as keyof typeof MODEL_CONFIGS] || {};
}

/**
 * Recommended model IDs for different use cases
 */
export const RECOMMENDED_MODELS = {
  production: 'd4ydy/ib-physics-question-generator',
  development: 'd4ydy/ib-physics-question-generator',
  testing: 'd4ydy/ib-physics-question-generator'
} as const;

/**
 * Get recommended model for environment
 */
export function getRecommendedModel(): string {
  const env = process.env.NODE_ENV as keyof typeof RECOMMENDED_MODELS;
  return RECOMMENDED_MODELS[env] || RECOMMENDED_MODELS.development;
}