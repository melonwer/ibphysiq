/**
 * OpenRouter configuration with DeepSeek Chat v3.1 free model settings
 */

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  maxRetries: number;
  timeoutMs: number;
  temperature: number;
  maxTokens: number;
  baseUrl: string;
}

/**
 * Create OpenRouter configuration from environment or provided values
 */
export function createOpenRouterConfig(apiKey?: string): OpenRouterConfig {
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  
  if (!key) {
    throw new Error('OpenRouter API key is required');
  }

  return {
    apiKey: key,
    model: 'deepseek/deepseek-chat-v3.1:free',
    maxRetries: 3,
    timeoutMs: 30000, // 30 seconds
    temperature: 0.1, // Low temperature for consistency
    maxTokens: 2048,
    baseUrl: 'https://openrouter.ai/api/v1'
  };
}

/**
 * Default OpenRouter configuration for testing
 */
export const DEFAULT_OPENROUTER_CONFIG: Omit<OpenRouterConfig, 'apiKey'> = {
  model: 'deepseek/deepseek-chat-v3.1:free',
  maxRetries: 3,
  timeoutMs: 30000,
  temperature: 0.1,
  maxTokens: 2048,
  baseUrl: 'https://openrouter.ai/api/v1'
};

/**
 * Validate OpenRouter configuration
 */
export function validateOpenRouterConfig(config: OpenRouterConfig): { isValid: boolean; error?: string } {
  if (!config.apiKey) {
    return { isValid: false, error: 'API key is required' };
  }

  if (!config.apiKey.startsWith('sk-or-')) {
    return { isValid: false, error: 'OpenRouter API key should start with "sk-or-"' };
  }

  if (config.maxRetries < 1 || config.maxRetries > 5) {
    return { isValid: false, error: 'Max retries should be between 1 and 5' };
  }

  if (config.timeoutMs < 5000 || config.timeoutMs > 60000) {
    return { isValid: false, error: 'Timeout should be between 5 and 60 seconds' };
  }

  if (config.temperature < 0 || config.temperature > 2) {
    return { isValid: false, error: 'Temperature should be between 0 and 2' };
  }

  if (config.maxTokens < 100 || config.maxTokens > 4096) {
    return { isValid: false, error: 'Max tokens should be between 100 and 4096' };
  }

  return { isValid: true };
}