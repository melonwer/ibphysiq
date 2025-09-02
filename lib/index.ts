// Main library exports
export * from './types';
export * from './utils';

// Re-export commonly used types (avoiding duplicates from above export *)
export type {
  QuestionGenerationService,
  LlamaModelService as ILlamaModelService,
  ValidationEngine as IValidationEngine,
  RateLimiter as IRateLimiter,
  ErrorHandlingService as IErrorHandlingService,
  MonitoringService as IMonitoringService,
} from './interfaces/question-generation-services';

// Re-export core services - orchestration
export {
  QuestionGenerationOrchestrator,
  ErrorHandlingService,
  MonitoringService,
} from './services/orchestration';

// Re-export core services - llama
export {
  LlamaModelService,
  LlamaResponseParser,
  PromptGenerator,
} from './services/llama';



// Re-export core services - validation
export {
  ValidationEngine,
  FormatValidator,
  IBComplianceValidator,
  PhysicsValidator,
} from './services/validation';

// Re-export core services - rate limiting
export {
  RateLimiter,
  CostTracker,
} from './services/rate-limiting';

// Re-export constants
export {
  TOPIC_DISPLAY_NAMES,
  TOPIC_CATEGORIES,
  THEME_NAMES,
  TOPIC_CONTEXTS,
  GENERATION_CONFIG,
} from './constants/ib-physics-topics';