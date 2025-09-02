/**
 * Service interfaces for the AI Question Generation Pipeline
 */

import {
  IBPhysicsSubtopic,
  GeneratedQuestion,
  RawQuestion,
  RefinedQuestion,
  ValidationResult,
  FormatValidationResult,
  PhysicsValidationResult,
  ComplianceValidationResult,
  ModelError,
  FallbackResponse,
  QuotaStatus,
  APIError,
  QuestionDifficulty,
  QuestionType
} from '../types/question-generation';

// Main orchestration service
export interface QuestionGenerationService {
  generateQuestion(topic: IBPhysicsSubtopic, difficulty?: QuestionDifficulty, type?: QuestionType): Promise<GeneratedQuestion>;
  validateQuestion(question: RawQuestion): ValidationResult;
  refineQuestion(rawQuestion: RawQuestion): Promise<RefinedQuestion>;
}

// Model integration layer
export interface ModelIntegrationLayer {
  llamaGenerate(prompt: string, topic: IBPhysicsSubtopic): Promise<RawQuestion>;
  openRouterRefine(question: RawQuestion): Promise<RefinedQuestion>;
  handleModelFailure(error: ModelError): Promise<FallbackResponse>;
}

// Validation engine
export interface ValidationEngine {
  validateFormat(question: RawQuestion): FormatValidationResult;
  validatePhysics(question: RefinedQuestion): PhysicsValidationResult;
  validateIBCompliance(question: RefinedQuestion): ComplianceValidationResult;
}

// Rate limiter
export interface RateLimiter {
  checkLimit(apiType: 'openrouter' | 'huggingface'): Promise<boolean>;
  trackUsage(apiType: string, tokens: number): void;
  getQuotaStatus(): QuotaStatus;
  implementBackoff(error: APIError): Promise<void>;
}

// Llama model service
export interface LlamaModelService {
  initialize(): Promise<void>;
  generateQuestion(topic: IBPhysicsSubtopic, difficulty: QuestionDifficulty): Promise<RawQuestion>;
  isAvailable(): boolean;
  getModelInfo(): { version: string; status: string };
}



// Topic management service
export interface TopicManagementService {
  getTopicPrompt(topic: IBPhysicsSubtopic): string;
  validateTopicRelevance(question: string, topic: IBPhysicsSubtopic): number;
  getAllTopics(): IBPhysicsSubtopic[];
  getTopicDisplayName(topic: IBPhysicsSubtopic): string;
}

// Error handling service
export interface ErrorHandlingService {
  logError(error: ModelError): void;
  shouldRetry(error: ModelError): boolean;
  getRetryDelay(attempt: number): number;
  createFallbackQuestion(topic: IBPhysicsSubtopic, originalError: ModelError): GeneratedQuestion;
}

// Monitoring service
export interface MonitoringService {
  trackGeneration(topic: IBPhysicsSubtopic, success: boolean, processingTime: number): void;
  trackError(error: ModelError): void;
  getMetrics(): {
    totalGenerations: number;
    successRate: number;
    averageProcessingTime: number;
    errorsByType: Record<string, number>;
  };
}