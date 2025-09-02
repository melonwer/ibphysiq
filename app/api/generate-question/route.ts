import { type NextRequest, NextResponse } from "next/server";
import { 
  IBPhysicsSubtopic, 
  QuestionDifficulty, 
  QuestionType,
  GeneratedQuestion
} from "../../../lib/types/question-generation";
import { QuestionGenerationOrchestrator } from "../../../lib/services/orchestration/question-generation-orchestrator";
import { ErrorHandlingService } from "../../../lib/services/orchestration/error-handling-service";
import { MonitoringService } from "../../../lib/services/orchestration/monitoring-service";
import { ValidationEngine } from "../../../lib/services/validation/validation-engine";
import { LlamaModelService } from "../../../lib/services/llama/llama-model-service";
import { OpenRouterRefinementService } from "../../../lib/services/openrouter/openrouter-refinement-service";
import { RateLimiter } from "../../../lib/services/rate-limiting/rate-limiter";
import { CostTracker } from "../../../lib/services/rate-limiting/cost-tracker";
import { createLlamaConfig } from "../../../lib/services/llama/config";
import { createOpenRouterConfig } from "../../../lib/services/openrouter/config";
import { createRateLimitConfigFromEnv } from "../../../lib/services/rate-limiting/config";
import { TOPIC_DISPLAY_NAMES } from "../../../lib/constants/ib-physics-topics";
import { promises as fs } from 'fs';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

// Global service instances (initialized once)
let orchestrator: QuestionGenerationOrchestrator | null = null;
let rateLimiter: RateLimiter | null = null;
let costTracker: CostTracker | null = null;

/**
 * Store generated question in the specified format
 */
async function storeGeneratedQuestion(
  question: GeneratedQuestion,
  topic: IBPhysicsSubtopic,
  type: QuestionType
): Promise<void> {
  try {
    const questionData = {
      instruction: `Generate an IB Physics ${type === 'multiple-choice' ? 'Paper 1 style multiple-choice' : 'Paper 2 style long-answer'} question.`,
      input: `Topic: ${TOPIC_DISPLAY_NAMES[topic] || topic}`,
      output: question.questionText
    };

    // Ensure the data directory exists
    const dataDir = join(process.cwd(), 'data');
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }

    // Append the question as a JSONL record to onejsonfile.jsonl
    const jsonlPath = join(dataDir, 'onejsonfile.jsonl');
    // JSON.stringify will escape newlines in the output string so the file remains valid JSONL
    await fs.appendFile(jsonlPath, JSON.stringify(questionData) + '\n', 'utf8');

    console.log(`Appended question to onejsonfile.jsonl`);
  } catch (error) {
    console.error('Failed to store question:', error);
    // Don't throw error - storage failure shouldn't break question generation
  }
}

/**
 * Initialize services if not already initialized
 */
async function initializeServices(
  openRouterApiKey?: string,
  refinementProvider?: 'openrouter'
): Promise<{
  orchestrator: QuestionGenerationOrchestrator;
  rateLimiter: RateLimiter;
  costTracker: CostTracker;
}> {
  // Check if we need to re-initialize due to provider change
  const currentStats = orchestrator?.getStats();
  const currentProvider = orchestrator?.getStats()?.config?.refinementProvider;
  const providerChanged = refinementProvider && currentProvider && refinementProvider !== currentProvider;

  if (orchestrator && rateLimiter && costTracker && !providerChanged) {
    return { orchestrator, rateLimiter, costTracker };
  }

  try {
    // Determine which refinement provider to use - default to OpenRouter
    const provider = refinementProvider || 'openrouter';
    
    // Initialize configurations
    const llamaConfig = createLlamaConfig();
    const rateLimitConfig = createRateLimitConfigFromEnv();

    // Initialize refinement services
    const refinementServices: {
      openrouter?: OpenRouterRefinementService;
    } = {};

    // Initialize OpenRouter service if API key is available
    if (openRouterApiKey || process.env.OPENROUTER_API_KEY) {
      try {
        const openRouterConfig = createOpenRouterConfig(openRouterApiKey);
        refinementServices.openrouter = new OpenRouterRefinementService(openRouterConfig);
        console.log('OpenRouter refinement service initialized');
      } catch (error) {
        console.warn('Failed to initialize OpenRouter service:', error);
      }
    }

    // Ensure OpenRouter service is available
    if (!refinementServices.openrouter) {
      throw new Error('OpenRouter refinement service must be configured.');
    }

    // Validate the selected provider has a service available
    if (provider === 'openrouter' && !refinementServices.openrouter) {
      throw new Error('OpenRouter API key is required when using OpenRouter as refinement provider.');
    }

    // Initialize other services
    const llamaService = new LlamaModelService(llamaConfig);
    const validationEngine = new ValidationEngine();
    const errorHandler = new ErrorHandlingService();
    const monitor = new MonitoringService();

    // Initialize rate limiting and cost tracking
    rateLimiter = new RateLimiter(rateLimitConfig);
    costTracker = new CostTracker();

    // Initialize orchestrator
    orchestrator = new QuestionGenerationOrchestrator(
      llamaService,
      refinementServices.openrouter || null,
      validationEngine,
      errorHandler,
      monitor,
      {
        enableRefinement: process.env.ENABLE_REFINEMENT !== 'false',
        fallbackToOriginal: process.env.FALLBACK_TO_ORIGINAL !== 'false',
        maxProcessingTime: parseInt(process.env.MAX_PROCESSING_TIME || '30000'),
        enableValidation: process.env.ENABLE_VALIDATION !== 'false',
        requireMinimumQuality: process.env.REQUIRE_MINIMUM_QUALITY === 'true',
        minimumQualityScore: parseInt(process.env.MINIMUM_QUALITY_SCORE || '70'),
        refinementProvider: provider
      }
    );

    console.log(`AI Question Generation Pipeline initialized successfully with ${provider} refinement`);
    return { orchestrator, rateLimiter, costTracker };
 
  } catch (error) {
    console.error('Failed to initialize AI services:', error);
    throw new Error('Service initialization failed');
  }
}

/**
 * Reload services at runtime (admin)
 * - Clears cached global instances and re-runs initialization.
 * - Optionally accepts API keys and refinement provider to initialize services without storing them.
 */
export async function reloadServices(
  openRouterApiKey?: string,
  refinementProvider?: 'openrouter'
): Promise<{ ok: true }> {
  try {
    // Always clear in-memory singletons when reloading to ensure fresh initialization
    orchestrator = null;
    rateLimiter = null;
    costTracker = null;

    // Attempt to initialize with the provided keys and settings
    await initializeServices(openRouterApiKey, refinementProvider);

    console.info('Services reloaded successfully via reloadServices');
    return { ok: true };
  } catch (err) {
    console.error('reloadServices error:', err);
    throw err;
  }
}

/**
 * Validate request parameters
 */
function validateRequest(body: unknown): {
  isValid: boolean;
  error?: string;
  topic?: IBPhysicsSubtopic;
  difficulty?: QuestionDifficulty;
  type?: QuestionType;
} {
  // Type guard to check if body is an object
  if (!body || typeof body !== 'object') {
    return { isValid: false, error: 'Invalid request body' };
  }

  const bodyObj = body as Record<string, unknown>;

  // Handle legacy format
  if (bodyObj.prompt || bodyObj.questionType) {
    return handleLegacyRequest(body);
  }

  // New format validation
  const { topic, difficulty = 'standard', type = 'multiple-choice' } = bodyObj;

  if (!topic) {
    return { isValid: false, error: 'Topic is required' };
  }

  if (!Object.values(IBPhysicsSubtopic).includes(topic as IBPhysicsSubtopic)) {
    return { 
      isValid: false, 
      error: `Invalid topic. Must be one of: ${Object.values(IBPhysicsSubtopic).join(', ')}` 
    };
  }

  if (!['standard', 'higher'].includes(difficulty as string)) {
    return { isValid: false, error: 'Difficulty must be "standard" or "higher"' };
  }

  if (!['multiple-choice', 'long-answer'].includes(type as string)) {
    return { isValid: false, error: 'Type must be "multiple-choice" or "long-answer"' };
  }

  return {
    isValid: true,
    topic: topic as IBPhysicsSubtopic,
    difficulty: difficulty as QuestionDifficulty,
    type: type as QuestionType
  };
}

/**
 * Handle legacy request format for backward compatibility
 */
function handleLegacyRequest(body: unknown): {
  isValid: boolean;
  error?: string;
  topic?: IBPhysicsSubtopic;
  difficulty?: QuestionDifficulty;
  type?: QuestionType;
} {
  if (!body || typeof body !== 'object') {
    return { isValid: false, error: 'Invalid request body' };
  }

  const bodyObj = body as Record<string, unknown>;
  const { questionType, topics } = bodyObj;

  // Map legacy question types
  const type: QuestionType = questionType === 'mcq' ? 'multiple-choice' : 'long-answer';
  
  // Try to map legacy topics to new format
  let topic: IBPhysicsSubtopic = IBPhysicsSubtopic.KINEMATICS; // Default

  if (topics && Array.isArray(topics) && topics.length > 0) {
    const legacyTopic = topics[0].toLowerCase();
    
    // Legacy topic mapping
    const topicMapping: Record<string, IBPhysicsSubtopic> = {
      'mechanics': IBPhysicsSubtopic.KINEMATICS,
      'waves': IBPhysicsSubtopic.WAVE_MODEL,
      'electricity & magnetism': IBPhysicsSubtopic.CURRENT_CIRCUITS,
      'electricity': IBPhysicsSubtopic.CURRENT_CIRCUITS,
      'magnetism': IBPhysicsSubtopic.ELECTRIC_MAGNETIC_FIELDS,
      'thermal': IBPhysicsSubtopic.THERMAL_ENERGY_TRANSFERS,
      'energy': IBPhysicsSubtopic.WORK_ENERGY_POWER,
      'forces': IBPhysicsSubtopic.FORCES_MOMENTUM
    };

    topic = topicMapping[legacyTopic] || IBPhysicsSubtopic.KINEMATICS;
  }

  return {
    isValid: true,
    topic,
    difficulty: 'standard',
    type
  };
}

/**
 * Format response for client
 */
function formatResponse(question: GeneratedQuestion, type: QuestionType): Record<string, unknown> {
  const topicName = TOPIC_DISPLAY_NAMES[question.topic] || question.topic;
  
  if (type === 'multiple-choice') {
    return {
      type: 'mcq',
      topic: topicName,
      question: question.questionText,
      options: question.options.map((opt: string) => opt.replace(/^[A-D]\)\s*/, '')), // Remove A), B), etc.
      correct: question.correctAnswer.charCodeAt(0) - 65, // Convert A,B,C,D to 0,1,2,3
      explanation: question.explanation ? [question.explanation] : [
        "This question was generated using AI and refined for accuracy.",
        "The answer demonstrates proper application of IB Physics principles.",
        `Topic: ${topicName}`
      ],
      theory: `Topic: ${topicName} - ${question.explanation || 'Generated using advanced AI models trained on IB Physics curriculum.'}`
    };
  } else {
    return {
      type: 'long',
      topic: topicName,
      question: question.questionText,
      solution: question.explanation ? question.explanation.split('\n') : [
        "This is an AI-generated long-answer question.",
        "Approach this systematically by identifying given values,",
        "selecting appropriate physics equations,",
        "substituting values carefully,",
        "and presenting your solution clearly with proper units."
      ],
      theory: `Topic: ${topicName} - Advanced problem requiring detailed analysis and calculation.`
    };
  }
}

/**
 * Handle errors and provide appropriate responses
 */
function handleError(error: unknown): NextResponse {
  console.error('Question generation error:', error);

  // Check for specific error types
  const errorMessage = (error as Error)?.message || '';
  if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
    return NextResponse.json(
      { 
        error: 'Service temporarily unavailable due to usage limits. Please try again later.',
        code: 'QUOTA_EXCEEDED'
      }, 
      { status: 429 }
    );
  }

  if (errorMessage.includes('timeout')) {
    return NextResponse.json(
      { 
        error: 'Request timed out. Please try again.',
        code: 'TIMEOUT'
      }, 
      { status: 408 }
    );
  }

  if (errorMessage.includes('validation')) {
    return NextResponse.json(
      { 
        error: 'Unable to generate a valid question. Please try a different topic.',
        code: 'VALIDATION_FAILED'
      }, 
      { status: 422 }
    );
  }

  // Generic error
  return NextResponse.json(
    { 
      error: 'Failed to generate question. Please try again.',
      code: 'GENERATION_FAILED'
    }, 
    { status: 500 }
  );
}

/**
 * Main POST handler
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await request.json();
    
    // Extract API keys and configuration from request
    const bodyObj = body as Record<string, unknown>;
    let openRouterApiKey = bodyObj.openRouterApiKey as string | undefined;
    const refinementProvider = bodyObj.refinementProvider as 'openrouter' | undefined;
 
    // Log configuration (safe - do NOT log the keys themselves)
    console.log('[GenerateQuestion] Request configuration:', {
      topic: bodyObj.topic,
      difficulty: bodyObj.difficulty,
      type: bodyObj.type,
      refinementProvider: refinementProvider || 'openrouter (default)',
      hasOpenRouterKey: !!openRouterApiKey
    });
 
    // Track where we obtained the API key from (safe - do NOT log the key itself)
    let openRouterApiKeySource: 'request' | 'settings.json' | 'env' | 'none' = openRouterApiKey ? 'request' : 'none';
 
    // Check environment variables first (preferred source)
    if (!openRouterApiKey && process.env.OPENROUTER_API_KEY) {
      openRouterApiKey = process.env.OPENROUTER_API_KEY;
      openRouterApiKeySource = 'env';
    }
    
    // If no API key provided in request or env, try to read from settings file
    if (!openRouterApiKey) {
      try {
        const settingsPath = join(process.cwd(), 'data', 'settings.json');
        if (existsSync(settingsPath)) {
          const raw = readFileSync(settingsPath, 'utf8');
          const settings = JSON.parse(raw || '{}');
          
          if (!openRouterApiKey && settings.openRouterApiKey) {
            openRouterApiKey = settings.openRouterApiKey;
            openRouterApiKeySource = 'settings.json';
          }
        }
      } catch (e) {
        console.warn('Could not read API keys from settings file:', String(e));
      }
    }
 
    // Log only the sources of the keys for debugging purposes (do NOT log the API keys themselves)
    try {
      console.log('[GenerateQuestion] API key sources:', {
        openrouter: openRouterApiKeySource,
        refinementProvider: refinementProvider || 'auto'
      });
    } catch (logErr) {
      // ignore logging errors
    }

    // Validate that OpenRouter service is configured
    const hasOpenRouter = openRouterApiKey || process.env.OPENROUTER_API_KEY;
    
    if (!hasOpenRouter) {
      return NextResponse.json(
        {
          error: 'OpenRouter API key is required. Please provide an OpenRouter API key in the settings.',
          code: 'MISSING_API_KEY'
        },
        { status: 400 }
      );
    }
    
    // Validate request
    const validation = validateRequest(body);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error, code: 'INVALID_REQUEST' }, 
        { status: 400 }
      );
    }

    const { topic, difficulty, type } = validation;

    // Use OpenRouter as default provider if none specified
    const finalRefinementProvider = refinementProvider || 'openrouter';

    // Initialize services with API keys and configuration
    const { orchestrator: orch, rateLimiter: limiter, costTracker: tracker } = await initializeServices(
      openRouterApiKey,
      finalRefinementProvider
    );

    // Check rate limits
    try {
      await limiter.checkLimit('huggingface');
    } catch (rateLimitError: unknown) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded. Please try again later.',
          code: 'RATE_LIMITED',
          retryAfter: (rateLimitError as any)?.retryAfter || 60
        }, 
        { status: 429 }
      );
    }

    // Generate question using the orchestrator
    const question = await orch.generateQuestion(topic!, difficulty!, type!);

    // Store the generated question
    await storeGeneratedQuestion(question, topic!, type!);

    // Track usage for rate limiting
    const estimatedTokens = 400; // Rough estimate for question generation
    limiter.trackUsage('huggingface', estimatedTokens);

    // Track costs
    tracker.trackCost('openrouter', 'question_generation', estimatedTokens, 0.000000075);

    // Format response for client
    const response = formatResponse(question, type!);
    
    // Add metadata
    response.metadata = {
      processingTime: Date.now() - startTime,
      modelVersions: question.metadata.modelVersions,
      refinementApplied: question.metadata.refinementApplied,
      generatedAt: question.metadata.generatedAt
    };
    
    // Log outgoing question for debugging (concise preview)
    try {
      console.log('[GenerateQuestion] Outgoing payload preview:', {
        questionTextPreview: (question && question.questionText) ? String(question.questionText).slice(0, 300) + (question.questionText.length > 300 ? '...' : '') : null,
        optionsCount: question?.options?.length ?? 0,
        correctAnswer: question?.correctAnswer ?? null,
        refinementApplied: question?.metadata?.refinementApplied ?? false,
        processingTime: question?.metadata?.processingTime ?? null
      });
    } catch (logErr) {
      console.warn('[GenerateQuestion] Failed to log outgoing payload:', logErr);
    }
    
    // Return a stable API shape for frontends: { success: true, question: {...} }
    return NextResponse.json({ success: true, question, formatted: response });

  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET handler for service status and health check
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'health') {
      // Health check
      if (!orchestrator) {
        return NextResponse.json({ status: 'not_initialized' }, { status: 503 });
      }

      const health = await orchestrator.healthCheck();
      return NextResponse.json(health);
    }

    if (action === 'stats') {
      // Service statistics
      if (!orchestrator || !rateLimiter || !costTracker) {
        return NextResponse.json({ error: 'Services not initialized' }, { status: 503 });
      }

      const stats = {
        orchestrator: orchestrator.getStats(),
        rateLimiting: rateLimiter.getUsageStats(),
        costs: costTracker.getCostSummary(),
        quotas: rateLimiter.getQuotaStatus()
      };

      return NextResponse.json(stats);
    }

    if (action === 'topics') {
      // Available topics
      const topics = Object.entries(TOPIC_DISPLAY_NAMES).map(([key, name]) => ({
        id: key,
        name,
        category: getTopicCategory(key as IBPhysicsSubtopic)
      }));

      return NextResponse.json({ topics });
    }

    // Default: API information
    return NextResponse.json({
      name: 'IB Physics Question Generator API',
      version: '1.0.0',
      description: 'AI-powered question generation using fine-tuned Llama 3.1 8B and Gemini 2.5 Flash',
      endpoints: {
        'POST /': 'Generate a physics question',
        'GET /?action=health': 'Service health check',
        'GET /?action=stats': 'Service statistics',
        'GET /?action=topics': 'Available topics'
      },
      supportedTopics: Object.keys(IBPhysicsSubtopic).length,
      features: [
        'Two-model AI pipeline (Llama + Gemini)',
        'Comprehensive validation',
        'Rate limiting and cost control',
        'Real-time monitoring',
        'Fallback mechanisms'
      ]
    });

  } catch (error) {
    console.error('GET request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Helper function to categorize topics
 */
function getTopicCategory(topic: IBPhysicsSubtopic): string {
  const categories: Record<string, string[]> = {
    'Space, time and motion': [
      IBPhysicsSubtopic.KINEMATICS,
      IBPhysicsSubtopic.FORCES_MOMENTUM,
      IBPhysicsSubtopic.WORK_ENERGY_POWER,
      IBPhysicsSubtopic.RIGID_BODY_MECHANICS,
      IBPhysicsSubtopic.GALILEAN_SPECIAL_RELATIVITY
    ],
    'Particulate nature of matter': [
      IBPhysicsSubtopic.THERMAL_ENERGY_TRANSFERS,
      IBPhysicsSubtopic.GREENHOUSE_EFFECT,
      IBPhysicsSubtopic.GAS_LAWS,
      IBPhysicsSubtopic.CURRENT_CIRCUITS,
      IBPhysicsSubtopic.THERMODYNAMICS
    ],
    'Wave behaviour': [
      IBPhysicsSubtopic.SIMPLE_HARMONIC_MOTION,
      IBPhysicsSubtopic.WAVE_MODEL,
      IBPhysicsSubtopic.WAVE_PHENOMENA,
      IBPhysicsSubtopic.STANDING_WAVES_RESONANCE,
      IBPhysicsSubtopic.DOPPLER_EFFECT
    ],
    'Fields': [
      IBPhysicsSubtopic.GRAVITATIONAL_FIELDS,
      IBPhysicsSubtopic.ELECTRIC_MAGNETIC_FIELDS,
      IBPhysicsSubtopic.MOTION_ELECTROMAGNETIC_FIELDS,
      IBPhysicsSubtopic.INDUCTION
    ],
    'Nuclear and quantum physics': [
      IBPhysicsSubtopic.STRUCTURE_ATOM,
      IBPhysicsSubtopic.RADIOACTIVE_DECAY,
      IBPhysicsSubtopic.FISSION,
      IBPhysicsSubtopic.FUSION_STARS,
      IBPhysicsSubtopic.QUANTUM_PHYSICS
    ]
  };

  for (const [category, topics] of Object.entries(categories)) {
    if (topics.includes(topic)) {
      return category;
    }
  }

  return 'Other';
}