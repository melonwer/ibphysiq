/**
 * Error handling service for the question generation pipeline
 */

import {
  ModelErrorImpl as ModelError,
  GeneratedQuestion,
  IBPhysicsSubtopic
} from '../../types/question-generation';
export interface ErrorLog {
  id: string;
  timestamp: Date;
  error: ModelError;
  context: Record<string, any>;
  resolved: boolean;
  retryCount: number;
}

export class ErrorHandlingService {
  private errorLogs: ErrorLog[] = [];
  private maxLogSize: number = 1000;
  private retryDelays: number[] = [1000, 2000, 5000, 10000]; // Exponential backoff

  /**
   * Log an error with context
   */
  logError(error: ModelError): void {
    const errorLog: ErrorLog = {
      id: this.generateErrorId(),
      timestamp: new Date(),
      error,
      context: error.context || {},
      resolved: false,
      retryCount: 0
    };

    this.errorLogs.push(errorLog);
    
    // Maintain log size limit
    if (this.errorLogs.length > this.maxLogSize) {
      this.errorLogs = this.errorLogs.slice(-this.maxLogSize);
    }

    // Log to console for development
    if (process.env.NODE_ENV === 'development') {
      console.error(`[${error.type}] ${error.message}`, {
        timestamp: errorLog.timestamp,
        context: error.context
      });
    }

    // Could integrate with external logging service here
    this.sendToExternalLogger(errorLog);
  }

  /**
   * Determine if an error should be retried
   */
  shouldRetry(error: ModelError): boolean {
    // Don't retry if explicitly marked as non-retryable
    if (!error.retryable) {
      return false;
    }

    // Don't retry quota/limit errors
    if (error.type === 'api_limit') {
      return false;
    }

    // Check retry count for this error type
    const recentErrors = this.getRecentErrors(error.type, 5 * 60 * 1000); // Last 5 minutes
    const retryCount = recentErrors.length;

    // Max retries per error type
    const maxRetries: Record<string, number> = {
      'llama_failure': 3,
      'gemini_failure': 3,
      'validation_failure': 2,
      'api_limit': 0
    };

    return retryCount < (maxRetries[error.type] || 2);
  }

  /**
   * Get retry delay for an error
   */
  getRetryDelay(attempt: number): number {
    const index = Math.min(attempt - 1, this.retryDelays.length - 1);
    const baseDelay = this.retryDelays[index];
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 1000;
    return baseDelay + jitter;
  }

  /**
   * Create a fallback question when all else fails
   */
  createFallbackQuestion(topic: IBPhysicsSubtopic, originalError: ModelError): GeneratedQuestion {
    const fallbackQuestions = this.getFallbackQuestions(topic);
    const selectedQuestion = fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];

    return {
      id: `fallback-${Date.now()}`,
      topic,
      questionText: selectedQuestion.questionText,
      options: selectedQuestion.options,
      correctAnswer: selectedQuestion.correctAnswer,
      explanation: `This is a fallback question due to generation error: ${originalError.message}`,
      metadata: {
        generatedAt: new Date(),
        modelVersions: {
          llama: 'fallback',
          refinement: 'none'
        },
        processingTime: 0,
        refinementApplied: false,
        validationPassed: false,
        topic,
        difficulty: 'standard'
      },
      type: 'multiple-choice',
      difficulty: 'standard'
    };
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    errorsByHour: Record<string, number>;
    recentErrors: ErrorLog[];
    retryableErrors: number;
    resolvedErrors: number;
  } {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const errorsByType: Record<string, number> = {};
    const errorsByHour: Record<string, number> = {};
    let retryableErrors = 0;
    let resolvedErrors = 0;

    this.errorLogs.forEach(log => {
      // Count by type
      errorsByType[log.error.type] = (errorsByType[log.error.type] || 0) + 1;

      // Count by hour
      const hour = log.timestamp.getHours().toString();
      errorsByHour[hour] = (errorsByHour[hour] || 0) + 1;

      // Count retryable and resolved
      if (log.error.retryable) retryableErrors++;
      if (log.resolved) resolvedErrors++;
    });

    const recentErrors = this.errorLogs.filter(log => log.timestamp >= oneHourAgo);

    return {
      totalErrors: this.errorLogs.length,
      errorsByType,
      errorsByHour,
      recentErrors,
      retryableErrors,
      resolvedErrors
    };
  }

  /**
   * Mark an error as resolved
   */
  markErrorResolved(errorId: string): void {
    const errorLog = this.errorLogs.find(log => log.id === errorId);
    if (errorLog) {
      errorLog.resolved = true;
    }
  }

  /**
   * Clear old error logs
   */
  clearOldErrors(olderThanHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    this.errorLogs = this.errorLogs.filter(log => log.timestamp >= cutoffTime);
  }

  /**
   * Get recent errors of a specific type
   */
  private getRecentErrors(errorType: string, timeWindowMs: number): ErrorLog[] {
    const cutoffTime = new Date(Date.now() - timeWindowMs);
    return this.errorLogs.filter(log => 
      log.error.type === errorType && log.timestamp >= cutoffTime
    );
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Send error to external logging service
   */
  private sendToExternalLogger(errorLog: ErrorLog): void {
    // In production, this would send to services like:
    // - Sentry
    // - LogRocket
    // - DataDog
    // - CloudWatch
    
    if (process.env.NODE_ENV === 'production') {
      // Example: Send to external service
      // await externalLogger.log(errorLog);
    }
  }

  /**
   * Get fallback questions for each topic
   */
  private getFallbackQuestions(topic: IBPhysicsSubtopic): Array<{
    questionText: string;
    options: string[];
    correctAnswer: string;
  }> {
    // Predefined fallback questions for each topic
    const fallbacks: Partial<Record<IBPhysicsSubtopic, Array<{
      questionText: string;
      options: string[];
      correctAnswer: string;
    }>>> = {
      [IBPhysicsSubtopic.KINEMATICS]: [
        {
          questionText: "A car travels 100 m in 10 s at constant velocity. What is its speed?",
          options: ["A) 5 m/s", "B) 10 m/s", "C) 15 m/s", "D) 20 m/s"],
          correctAnswer: "B"
        },
        {
          questionText: "An object accelerates from rest at 2 m/s² for 5 s. What is its final velocity?",
          options: ["A) 5 m/s", "B) 10 m/s", "C) 15 m/s", "D) 20 m/s"],
          correctAnswer: "B"
        }
      ],
      [IBPhysicsSubtopic.FORCES_MOMENTUM]: [
        {
          questionText: "What force is needed to accelerate a 10 kg mass at 2 m/s²?",
          options: ["A) 5 N", "B) 10 N", "C) 20 N", "D) 40 N"],
          correctAnswer: "C"
        }
      ],
      [IBPhysicsSubtopic.WORK_ENERGY_POWER]: [
        {
          questionText: "How much work is done lifting a 5 kg object 2 m high? (g = 10 m/s²)",
          options: ["A) 50 J", "B) 100 J", "C) 150 J", "D) 200 J"],
          correctAnswer: "B"
        }
      ],
      [IBPhysicsSubtopic.CURRENT_CIRCUITS]: [
        {
          questionText: "What current flows through a 10 Ω resistor connected to a 12 V battery?",
          options: ["A) 0.8 A", "B) 1.2 A", "C) 2.0 A", "D) 2.4 A"],
          correctAnswer: "B"
        }
      ],
      // Add more fallback questions for other topics...
      // For brevity, using a generic fallback for remaining topics
      ...Object.fromEntries(
        Object.values(IBPhysicsSubtopic)
          .filter(topic => ![
            IBPhysicsSubtopic.KINEMATICS,
            IBPhysicsSubtopic.FORCES_MOMENTUM,
            IBPhysicsSubtopic.WORK_ENERGY_POWER,
            IBPhysicsSubtopic.CURRENT_CIRCUITS
          ].includes(topic))
          .map(topic => [topic, [
            {
              questionText: `This is a fallback question for ${topic}. What is the correct answer?`,
              options: ["A) Option A", "B) Option B", "C) Option C", "D) Option D"],
              correctAnswer: "A"
            }
          ]])
      )
    };

    return fallbacks[topic] || [{
      questionText: "Fallback question - system error occurred during generation.",
      options: ["A) Try again", "B) Contact support", "C) Use different topic", "D) Check system status"],
      correctAnswer: "A"
    }];
  }

  /**
   * Get error recovery suggestions
   */
  getRecoverySuggestions(error: ModelError): string[] {
    const suggestions: Record<string, string[]> = {
      'llama_failure': [
        'Check Hugging Face API key and model availability',
        'Verify model ID is correct',
        'Try a different topic or difficulty level',
        'Check network connectivity'
      ],
      'gemini_failure': [
        'Check Gemini API key and quota',
        'Verify API endpoint is accessible',
        'Try disabling refinement temporarily',
        'Check prompt format and length'
      ],
      'validation_failure': [
        'Review question format requirements',
        'Check if topic is supported',
        'Verify model outputs are complete',
        'Consider adjusting validation thresholds'
      ],
      'api_limit': [
        'Wait for quota reset',
        'Upgrade API plan if needed',
        'Implement request queuing',
        'Use fallback questions temporarily'
      ]
    };

    return suggestions[error.type] || [
      'Check system logs for more details',
      'Try again in a few minutes',
      'Contact technical support if issue persists'
    ];
  }
}