/**
 * Core types and interfaces for the AI Question Generation Pipeline
 */

// IB Physics Subtopics - Current curriculum (2016+) - All 28 official subtopics
export enum IBPhysicsSubtopic {
  // Theme A: Space, time and motion
  KINEMATICS = 'kinematics',
  FORCES_MOMENTUM = 'forces-momentum',
  WORK_ENERGY_POWER = 'work-energy-power',
  RIGID_BODY_MECHANICS = 'rigid-body-mechanics', // HL only
  GALILEAN_SPECIAL_RELATIVITY = 'galilean-special-relativity', // HL only
  
  // Theme B: The particulate nature of matter
  THERMAL_ENERGY_TRANSFERS = 'thermal-energy-transfers',
  GREENHOUSE_EFFECT = 'greenhouse-effect',
  GAS_LAWS = 'gas-laws',
  CURRENT_CIRCUITS = 'current-circuits',
  THERMODYNAMICS = 'thermodynamics', // HL only
  
  // Theme C: Wave behaviour
  SIMPLE_HARMONIC_MOTION = 'simple-harmonic-motion',
  WAVE_MODEL = 'wave-model',
  WAVE_PHENOMENA = 'wave-phenomena',
  STANDING_WAVES_RESONANCE = 'standing-waves-resonance',
  DOPPLER_EFFECT = 'doppler-effect',
  
  // Theme D: Fields
  GRAVITATIONAL_FIELDS = 'gravitational-fields',
  ELECTRIC_MAGNETIC_FIELDS = 'electric-magnetic-fields',
  MOTION_ELECTROMAGNETIC_FIELDS = 'motion-electromagnetic-fields',
  INDUCTION = 'induction', // HL only
  
  // Theme E: Nuclear and quantum physics
  STRUCTURE_ATOM = 'structure-atom',
  RADIOACTIVE_DECAY = 'radioactive-decay',
  FISSION = 'fission',
  FUSION_STARS = 'fusion-stars',
  QUANTUM_PHYSICS = 'quantum-physics', // HL only
  
  // Additional Option Topics (to reach 28 total)
  RELATIVITY = 'relativity', // Option A
  ENGINEERING_PHYSICS = 'engineering-physics', // Option B
  IMAGING = 'imaging', // Option C
  ASTROPHYSICS = 'astrophysics', // Option D
  PARTICLE_PHYSICS = 'particle-physics' // Option E
}

// Question difficulty levels
export type QuestionDifficulty = 'standard' | 'higher';

// Question types
export type QuestionType = 'multiple-choice' | 'long-answer';

// Raw question from Llama model
export interface RawQuestion {
  questionText: string;
  options: string[];
  suggestedAnswer: string;
  confidence: number;
  topic: IBPhysicsSubtopic;
}

// Refined question from Gemini
export interface RefinedQuestion {
  questionText: string;
  options: string[];
  correctAnswer: string;
  improvements: string[];
  validationStatus: 'valid' | 'corrected' | 'rejected';
  topic: IBPhysicsSubtopic;
}

// Final generated question
export interface GeneratedQuestion {
  id: string;
  topic: IBPhysicsSubtopic;
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
  metadata: QuestionMetadata;
  type: QuestionType;
  difficulty: QuestionDifficulty;
}

// Question metadata
export interface QuestionMetadata {
  generatedAt: Date;
  modelVersions: {
    llama: string;
    refinement: string;
  };
  processingTime: number;
  refinementApplied: boolean;
  refinementAttempted?: boolean;
  validationPassed: boolean;
  topic: IBPhysicsSubtopic;
  difficulty: QuestionDifficulty;
}

// Validation results
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

export interface FormatValidationResult extends ValidationResult {
  hasQuestionText: boolean;
  hasOptions: boolean;
  hasCorrectAnswer: boolean;
  optionCount: number;
}

export interface PhysicsValidationResult extends ValidationResult {
  physicsAccuracy: 'accurate' | 'minor-issues' | 'major-errors';
  unitConsistency: boolean;
  numericalAccuracy: boolean;
}

export interface ComplianceValidationResult extends ValidationResult {
  ibCompliant: boolean;
  difficultyLevel: QuestionDifficulty;
  topicRelevance: number; // 0-1 score
}

// Error types
export interface ValidationError {
  type: 'format' | 'physics' | 'compliance';
  message: string;
  severity: 'low' | 'medium' | 'high';
  field?: string;
}

export interface ValidationWarning {
  type: 'format' | 'physics' | 'compliance';
  message: string;
  suggestion?: string;
}

export interface ModelError extends Error {
  type: 'llama_failure' | 'openrouter_failure' | 'openrouter_timeout' | 'openrouter_api_error' | 'openrouter_network_error' | 'validation_failure' | 'api_limit' | 'configuration_error';
  message: string;
  timestamp: Date;
  context: Record<string, any>;
  retryable: boolean;
}

// API and service interfaces
export interface QuestionGenerationRequest {
  topic: IBPhysicsSubtopic;
  difficulty?: QuestionDifficulty;
  type?: QuestionType;
}

export interface QuestionGenerationResponse {
  success: boolean;
  question?: GeneratedQuestion;
  error?: {
    message: string;
    type: string;
    retryable: boolean;
  };
}

// Rate limiting
export interface QuotaStatus {
  openrouterQuota: {
    used: number;
    limit: number;
    resetTime: Date;
    tokens: {
      used: number;
      limit: number;
    };
    cost: {
      used: number;
      limit: number;
    };
  };
  huggingfaceQuota: {
    used: number;
    limit: number;
    resetTime: Date;
    tokens: {
      used: number;
      limit: number;
    };
    cost: {
      used: number;
      limit: number;
    };
  };
}

export interface APIError {
  type: 'rate_limit' | 'quota_exceeded' | 'service_unavailable' | 'invalid_response';
  message: string;
  retryAfter?: number;
  statusCode?: number;
}

// Fallback response
export interface FallbackResponse {
  question: GeneratedQuestion;
  fallbackReason: string;
  originalError: ModelError;
}

// Utility class for creating ModelError instances
export class ModelErrorImpl extends Error implements ModelError {
  public readonly type: 'llama_failure' | 'openrouter_failure' | 'openrouter_timeout' | 'openrouter_api_error' | 'openrouter_network_error' | 'validation_failure' | 'api_limit' | 'configuration_error';
  public readonly timestamp: Date;
  public readonly context: Record<string, any>;
  public readonly retryable: boolean;

  constructor(details: {
    type: 'llama_failure' | 'openrouter_failure' | 'openrouter_timeout' | 'openrouter_api_error' | 'openrouter_network_error' | 'validation_failure' | 'api_limit' | 'configuration_error';
    message: string;
    timestamp: Date;
    context: Record<string, any>;
    retryable: boolean;
  }) {
    super(details.message);
    this.name = 'ModelError';
    this.type = details.type;
    this.timestamp = details.timestamp;
    this.context = details.context;
    this.retryable = details.retryable;
  }
}

// Factory function for creating ModelError instances
export function createModelError(details: {
  type: 'llama_failure' | 'openrouter_failure' | 'openrouter_timeout' | 'openrouter_api_error' | 'openrouter_network_error' | 'validation_failure' | 'api_limit' | 'configuration_error';
  message: string;
  context?: Record<string, any>;
  retryable?: boolean;
}): ModelError {
  return new ModelErrorImpl({
    type: details.type,
    message: details.message,
    timestamp: new Date(),
    context: details.context || {},
    retryable: details.retryable || false
  });
}