/**
 * Monitoring service for tracking pipeline performance and metrics
 */

import {
  IBPhysicsSubtopic,
  ModelError
} from '../../types/question-generation';
import { MonitoringService as IMonitoringService } from '../../interfaces/question-generation-services';

export interface GenerationMetric {
  id: string;
  timestamp: Date;
  topic: IBPhysicsSubtopic;
  success: boolean;
  processingTime: number;
  stage?: string;
  modelVersions?: {
    llama: string;
    gemini: string;
  };
}

export interface ErrorMetric {
  id: string;
  timestamp: Date;
  error: ModelError;
  topic?: IBPhysicsSubtopic;
  stage?: string;
}

export interface PerformanceMetrics {
  totalGenerations: number;
  successRate: number;
  averageProcessingTime: number;
  errorsByType: Record<string, number>;
  generationsByTopic: Record<string, number>;
  processingTimeByTopic: Record<string, number>;
  hourlyStats: Record<string, {
    generations: number;
    successes: number;
    averageTime: number;
  }>;
}

export class MonitoringService implements IMonitoringService {
  private generationMetrics: GenerationMetric[] = [];
  private errorMetrics: ErrorMetric[] = [];
  private maxMetricsSize: number = 10000;
  private metricsRetentionHours: number = 24;

  /**
   * Track a question generation attempt
   */
  trackGeneration(topic: IBPhysicsSubtopic, success: boolean, processingTime: number): void {
    const metric: GenerationMetric = {
      id: this.generateMetricId(),
      timestamp: new Date(),
      topic,
      success,
      processingTime
    };

    this.generationMetrics.push(metric);
    this.cleanupOldMetrics();

    // Log significant events
    if (processingTime > 30000) { // Over 30 seconds
      console.warn(`Slow generation detected: ${processingTime}ms for ${topic}`);
    }

    if (!success) {
      console.warn(`Generation failed for topic: ${topic}`);
    }
  }

  /**
   * Track an error occurrence
   */
  trackError(error: ModelError): void {
    const metric: ErrorMetric = {
      id: this.generateMetricId(),
      timestamp: new Date(),
      error,
      topic: error.context?.topic,
      stage: error.context?.stage
    };

    this.errorMetrics.push(metric);
    this.cleanupOldMetrics();

    // Alert on critical errors
    if (error.type === 'api_limit') {
      console.error(`API limit reached: ${error.message}`);
    }

    // Track error patterns
    this.detectErrorPatterns();
  }

  /**
   * Get comprehensive performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Filter recent metrics
    const recentGenerations = this.generationMetrics.filter(m => m.timestamp >= oneDayAgo);
    const recentErrors = this.errorMetrics.filter(m => m.timestamp >= oneDayAgo);

    // Calculate basic stats
    const totalGenerations = recentGenerations.length;
    const successfulGenerations = recentGenerations.filter(m => m.success).length;
    const successRate = totalGenerations > 0 ? successfulGenerations / totalGenerations : 0;
    
    const processingTimes = recentGenerations
      .filter(m => m.success)
      .map(m => m.processingTime);
    const averageProcessingTime = processingTimes.length > 0 
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length 
      : 0;

    // Error statistics
    const errorsByType: Record<string, number> = {};
    recentErrors.forEach(error => {
      errorsByType[error.error.type] = (errorsByType[error.error.type] || 0) + 1;
    });

    // Topic statistics
    const generationsByTopic: Record<string, number> = {};
    const processingTimeByTopic: Record<string, number> = {};
    const topicProcessingTimes: Record<string, number[]> = {};

    recentGenerations.forEach(metric => {
      const topic = metric.topic;
      generationsByTopic[topic] = (generationsByTopic[topic] || 0) + 1;
      
      if (metric.success) {
        if (!topicProcessingTimes[topic]) {
          topicProcessingTimes[topic] = [];
        }
        topicProcessingTimes[topic].push(metric.processingTime);
      }
    });

    // Calculate average processing time by topic
    Object.entries(topicProcessingTimes).forEach(([topic, times]) => {
      processingTimeByTopic[topic] = times.reduce((sum, time) => sum + time, 0) / times.length;
    });

    // Hourly statistics
    const hourlyStats: Record<string, { generations: number; successes: number; averageTime: number }> = {};
    
    for (let i = 0; i < 24; i++) {
      const hour = i.toString().padStart(2, '0');
      hourlyStats[hour] = { generations: 0, successes: 0, averageTime: 0 };
    }

    recentGenerations.forEach(metric => {
      const hour = metric.timestamp.getHours().toString().padStart(2, '0');
      hourlyStats[hour].generations++;
      if (metric.success) {
        hourlyStats[hour].successes++;
      }
    });

    // Calculate average times for each hour
    Object.keys(hourlyStats).forEach(hour => {
      const hourMetrics = recentGenerations.filter(m => 
        m.timestamp.getHours().toString().padStart(2, '0') === hour && m.success
      );
      
      if (hourMetrics.length > 0) {
        const totalTime = hourMetrics.reduce((sum, m) => sum + m.processingTime, 0);
        hourlyStats[hour].averageTime = totalTime / hourMetrics.length;
      }
    });

    return {
      totalGenerations,
      successRate,
      averageProcessingTime,
      errorsByType,
      generationsByTopic,
      processingTimeByTopic,
      hourlyStats
    };
  }

  /**
   * Get real-time system health indicators
   */
  getHealthIndicators(): {
    status: 'healthy' | 'warning' | 'critical';
    indicators: {
      recentSuccessRate: number;
      averageResponseTime: number;
      errorRate: number;
      apiQuotaStatus: 'ok' | 'warning' | 'critical';
    };
    alerts: string[];
  } {
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    
    const recentMetrics = this.generationMetrics.filter(m => m.timestamp >= fifteenMinutesAgo);
    const recentErrors = this.errorMetrics.filter(m => m.timestamp >= fifteenMinutesAgo);

    // Calculate indicators
    const recentSuccessRate = recentMetrics.length > 0 
      ? recentMetrics.filter(m => m.success).length / recentMetrics.length 
      : 1;

    const recentSuccessfulMetrics = recentMetrics.filter(m => m.success);
    const averageResponseTime = recentSuccessfulMetrics.length > 0
      ? recentSuccessfulMetrics.reduce((sum, m) => sum + m.processingTime, 0) / recentSuccessfulMetrics.length
      : 0;

    const errorRate = recentMetrics.length > 0 
      ? recentErrors.length / recentMetrics.length 
      : 0;

    // Check API quota status
    const apiLimitErrors = recentErrors.filter(e => e.error.type === 'api_limit').length;
    let apiQuotaStatus: 'ok' | 'warning' | 'critical' = 'ok';
    if (apiLimitErrors > 5) {
      apiQuotaStatus = 'critical';
    } else if (apiLimitErrors > 2) {
      apiQuotaStatus = 'warning';
    }

    // Generate alerts
    const alerts: string[] = [];
    
    if (recentSuccessRate < 0.8) {
      alerts.push(`Low success rate: ${(recentSuccessRate * 100).toFixed(1)}%`);
    }
    
    if (averageResponseTime > 20000) {
      alerts.push(`High response time: ${(averageResponseTime / 1000).toFixed(1)}s`);
    }
    
    if (errorRate > 0.2) {
      alerts.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
    }
    
    if (apiQuotaStatus === 'critical') {
      alerts.push('API quota limits reached');
    } else if (apiQuotaStatus === 'warning') {
      alerts.push('API quota usage high');
    }

    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (recentSuccessRate < 0.5 || averageResponseTime > 30000 || apiQuotaStatus === 'critical') {
      status = 'critical';
    } else if (recentSuccessRate < 0.8 || averageResponseTime > 15000 || errorRate > 0.1 || apiQuotaStatus === 'warning') {
      status = 'warning';
    }

    return {
      status,
      indicators: {
        recentSuccessRate,
        averageResponseTime,
        errorRate,
        apiQuotaStatus
      },
      alerts
    };
  }

  /**
   * Get topic performance analysis
   */
  getTopicAnalysis(): Record<string, {
    totalAttempts: number;
    successRate: number;
    averageTime: number;
    commonErrors: string[];
    recommendation: string;
  }> {
    const analysis: Record<string, any> = {};
    
    Object.values(IBPhysicsSubtopic).forEach(topic => {
      const topicMetrics = this.generationMetrics.filter(m => m.topic === topic);
      const topicErrors = this.errorMetrics.filter(m => m.topic === topic);
      
      if (topicMetrics.length === 0) {
        analysis[topic] = {
          totalAttempts: 0,
          successRate: 0,
          averageTime: 0,
          commonErrors: [],
          recommendation: 'No data available'
        };
        return;
      }

      const successfulMetrics = topicMetrics.filter(m => m.success);
      const successRate = successfulMetrics.length / topicMetrics.length;
      const averageTime = successfulMetrics.length > 0
        ? successfulMetrics.reduce((sum, m) => sum + m.processingTime, 0) / successfulMetrics.length
        : 0;

      // Common errors for this topic
      const errorCounts: Record<string, number> = {};
      topicErrors.forEach(error => {
        errorCounts[error.error.type] = (errorCounts[error.error.type] || 0) + 1;
      });
      
      const commonErrors = Object.entries(errorCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([type]) => type);

      // Generate recommendation
      let recommendation = 'Performance is good';
      if (successRate < 0.7) {
        recommendation = 'High failure rate - check model training for this topic';
      } else if (averageTime > 25000) {
        recommendation = 'Slow generation - consider optimizing prompts';
      } else if (commonErrors.includes('validation_failure')) {
        recommendation = 'Validation issues - review question format requirements';
      }

      analysis[topic] = {
        totalAttempts: topicMetrics.length,
        successRate,
        averageTime,
        commonErrors,
        recommendation
      };
    });

    return analysis;
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(format: 'json' | 'csv' = 'json'): string {
    const data = {
      generationMetrics: this.generationMetrics,
      errorMetrics: this.errorMetrics,
      summary: this.getMetrics(),
      exportedAt: new Date().toISOString()
    };

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else {
      // Simple CSV export for generation metrics
      const headers = 'timestamp,topic,success,processingTime\n';
      const rows = this.generationMetrics.map(m => 
        `${m.timestamp.toISOString()},${m.topic},${m.success},${m.processingTime}`
      ).join('\n');
      
      return headers + rows;
    }
  }

  /**
   * Clear all metrics (for testing or reset)
   */
  clearMetrics(): void {
    this.generationMetrics = [];
    this.errorMetrics = [];
  }

  /**
   * Generate unique metric ID
   */
  private generateMetricId(): string {
    return `metric-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up old metrics to prevent memory issues
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = new Date(Date.now() - this.metricsRetentionHours * 60 * 60 * 1000);
    
    this.generationMetrics = this.generationMetrics.filter(m => m.timestamp >= cutoffTime);
    this.errorMetrics = this.errorMetrics.filter(m => m.timestamp >= cutoffTime);

    // Also enforce max size
    if (this.generationMetrics.length > this.maxMetricsSize) {
      this.generationMetrics = this.generationMetrics.slice(-this.maxMetricsSize);
    }
    
    if (this.errorMetrics.length > this.maxMetricsSize) {
      this.errorMetrics = this.errorMetrics.slice(-this.maxMetricsSize);
    }
  }

  /**
   * Detect error patterns and alert
   */
  private detectErrorPatterns(): void {
    const recentErrors = this.errorMetrics.filter(m => 
      m.timestamp >= new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
    );

    // Check for error spikes
    if (recentErrors.length > 10) {
      console.warn(`Error spike detected: ${recentErrors.length} errors in last 10 minutes`);
    }

    // Check for repeated errors of same type
    const errorTypeCounts: Record<string, number> = {};
    recentErrors.forEach(error => {
      errorTypeCounts[error.error.type] = (errorTypeCounts[error.error.type] || 0) + 1;
    });

    Object.entries(errorTypeCounts).forEach(([type, count]) => {
      if (count > 5) {
        console.warn(`Repeated ${type} errors: ${count} occurrences in last 10 minutes`);
      }
    });
  }
}