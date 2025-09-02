/**
 * Cost tracking and budget management service
 */

export interface CostRecord {
  id: string;
  timestamp: Date;
  apiType: 'openrouter' | 'huggingface';
  operation: string;
  tokens: number;
  cost: number;
  metadata: Record<string, any>;
}

export interface BudgetAlert {
  id: string;
  timestamp: Date;
  type: 'warning' | 'critical' | 'exceeded';
  apiType: 'openrouter' | 'huggingface';
  message: string;
  currentCost: number;
  budgetLimit: number;
  percentageUsed: number;
}

export interface CostSummary {
  daily: {
    openrouter: number;
    huggingface: number;
    total: number;
  };
  weekly: {
    openrouter: number;
    huggingface: number;
    total: number;
  };
  monthly: {
    openrouter: number;
    huggingface: number;
    total: number;
  };
}

export class CostTracker {
  private costRecords: CostRecord[] = [];
  private budgetAlerts: BudgetAlert[] = [];
  private maxRecords: number = 10000;
  private alertThresholds = {
    warning: 0.7,   // 70% of budget
    critical: 0.9   // 90% of budget
  };

  /**
   * Track a cost-incurring operation
   */
  trackCost(
    apiType: 'openrouter' | 'huggingface',
    operation: string,
    tokens: number,
    costPerToken: number,
    metadata: Record<string, any> = {}
  ): CostRecord {
    const cost = tokens * costPerToken;
    
    const record: CostRecord = {
      id: this.generateId(),
      timestamp: new Date(),
      apiType,
      operation,
      tokens,
      cost,
      metadata
    };

    this.costRecords.push(record);
    this.maintainRecordLimit();

    // Log significant costs
    if (cost > 0.01) {
      console.log(`Cost tracked: ${apiType} ${operation} - ${tokens} tokens, $${cost.toFixed(4)}`);
    }

    return record;
  }

  /**
   * Check budget status and generate alerts
   */
  checkBudgetStatus(
    dailyBudgets: { openrouter: number; huggingface: number }
  ): BudgetAlert[] {
    const newAlerts: BudgetAlert[] = [];
    const dailyCosts = this.getDailyCosts();

    // Check OpenRouter budget
    const openrouterPercentage = dailyCosts.openrouter / dailyBudgets.openrouter;
    if (openrouterPercentage >= 1.0) {
      newAlerts.push(this.createAlert('exceeded', 'openrouter', dailyCosts.openrouter, dailyBudgets.openrouter, openrouterPercentage));
    } else if (openrouterPercentage >= this.alertThresholds.critical) {
      newAlerts.push(this.createAlert('critical', 'openrouter', dailyCosts.openrouter, dailyBudgets.openrouter, openrouterPercentage));
    } else if (openrouterPercentage >= this.alertThresholds.warning) {
      newAlerts.push(this.createAlert('warning', 'openrouter', dailyCosts.openrouter, dailyBudgets.openrouter, openrouterPercentage));
    }

    // Check Hugging Face budget
    const hfPercentage = dailyCosts.huggingface / dailyBudgets.huggingface;
    if (hfPercentage >= 1.0) {
      newAlerts.push(this.createAlert('exceeded', 'huggingface', dailyCosts.huggingface, dailyBudgets.huggingface, hfPercentage));
    } else if (hfPercentage >= this.alertThresholds.critical) {
      newAlerts.push(this.createAlert('critical', 'huggingface', dailyCosts.huggingface, dailyBudgets.huggingface, hfPercentage));
    } else if (hfPercentage >= this.alertThresholds.warning) {
      newAlerts.push(this.createAlert('warning', 'huggingface', dailyCosts.huggingface, dailyBudgets.huggingface, hfPercentage));
    }

    // Store new alerts
    this.budgetAlerts.push(...newAlerts);
    this.maintainAlertLimit();

    return newAlerts;
  }

  /**
   * Get comprehensive cost summary
   */
  getCostSummary(): CostSummary {
    const now = new Date();
    
    // Daily costs (last 24 hours)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dailyRecords = this.costRecords.filter(r => r.timestamp >= oneDayAgo);
    
    // Weekly costs (last 7 days)
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weeklyRecords = this.costRecords.filter(r => r.timestamp >= oneWeekAgo);
    
    // Monthly costs (last 30 days)
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthlyRecords = this.costRecords.filter(r => r.timestamp >= oneMonthAgo);

    const calculateCosts = (records: CostRecord[]) => {
      const openrouter = records.filter(r => r.apiType === 'openrouter').reduce((sum, r) => sum + r.cost, 0);
      const huggingface = records.filter(r => r.apiType === 'huggingface').reduce((sum, r) => sum + r.cost, 0);
      return { openrouter, huggingface, total: openrouter + huggingface };
    };

    return {
      daily: calculateCosts(dailyRecords),
      weekly: calculateCosts(weeklyRecords),
      monthly: calculateCosts(monthlyRecords)
    };
  }

  /**
   * Get cost breakdown by operation
   */
  getCostBreakdown(timeframe: 'daily' | 'weekly' | 'monthly' = 'daily'): {
    byOperation: Record<string, { cost: number; count: number; averageCost: number }>;
    byAPI: Record<string, number>;
    byHour: Record<string, number>;
  } {
    const now = new Date();
    let cutoffTime: Date;

    switch (timeframe) {
      case 'weekly':
        cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const relevantRecords = this.costRecords.filter(r => r.timestamp >= cutoffTime);

    // By operation
    const byOperation: Record<string, { cost: number; count: number; averageCost: number }> = {};
    relevantRecords.forEach(record => {
      if (!byOperation[record.operation]) {
        byOperation[record.operation] = { cost: 0, count: 0, averageCost: 0 };
      }
      byOperation[record.operation].cost += record.cost;
      byOperation[record.operation].count += 1;
    });

    // Calculate averages
    Object.keys(byOperation).forEach(operation => {
      const data = byOperation[operation];
      data.averageCost = data.cost / data.count;
    });

    // By API
    const byAPI: Record<string, number> = {};
    relevantRecords.forEach(record => {
      byAPI[record.apiType] = (byAPI[record.apiType] || 0) + record.cost;
    });

    // By hour
    const byHour: Record<string, number> = {};
    relevantRecords.forEach(record => {
      const hour = record.timestamp.getHours().toString().padStart(2, '0');
      byHour[hour] = (byHour[hour] || 0) + record.cost;
    });

    return { byOperation, byAPI, byHour };
  }

  /**
   * Get cost projections
   */
  getCostProjections(): {
    dailyProjection: number;
    weeklyProjection: number;
    monthlyProjection: number;
    burnRate: number; // Cost per hour
  } {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const hourlyRecords = this.costRecords.filter(r => r.timestamp >= oneHourAgo);
    const dailyRecords = this.costRecords.filter(r => r.timestamp >= oneDayAgo);

    const hourlyCost = hourlyRecords.reduce((sum, r) => sum + r.cost, 0);
    const dailyCost = dailyRecords.reduce((sum, r) => sum + r.cost, 0);

    // Calculate burn rate (cost per hour)
    const burnRate = hourlyCost;

    // Project based on current burn rate
    const dailyProjection = burnRate * 24;
    const weeklyProjection = burnRate * 24 * 7;
    const monthlyProjection = burnRate * 24 * 30;

    return {
      dailyProjection,
      weeklyProjection,
      monthlyProjection,
      burnRate
    };
  }

  /**
   * Export cost data for analysis
   */
  exportCostData(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify({
        costRecords: this.costRecords,
        budgetAlerts: this.budgetAlerts,
        summary: this.getCostSummary(),
        breakdown: this.getCostBreakdown(),
        projections: this.getCostProjections(),
        exportedAt: new Date().toISOString()
      }, null, 2);
    } else {
      // CSV format
      const headers = 'timestamp,apiType,operation,tokens,cost,metadata\n';
      const rows = this.costRecords.map(record => 
        `${record.timestamp.toISOString()},${record.apiType},${record.operation},${record.tokens},${record.cost},"${JSON.stringify(record.metadata)}"`
      ).join('\n');
      
      return headers + rows;
    }
  }

  /**
   * Get recent budget alerts
   */
  getRecentAlerts(hours: number = 24): BudgetAlert[] {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.budgetAlerts.filter(alert => alert.timestamp >= cutoffTime);
  }

  /**
   * Clear old records and alerts
   */
  cleanup(olderThanDays: number = 30): void {
    const cutoffTime = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    
    const oldRecordCount = this.costRecords.length;
    const oldAlertCount = this.budgetAlerts.length;
    
    this.costRecords = this.costRecords.filter(r => r.timestamp >= cutoffTime);
    this.budgetAlerts = this.budgetAlerts.filter(a => a.timestamp >= cutoffTime);
    
    console.log(`Cleaned up ${oldRecordCount - this.costRecords.length} cost records and ${oldAlertCount - this.budgetAlerts.length} alerts`);
  }

  /**
   * Reset all cost tracking data
   */
  reset(): void {
    this.costRecords = [];
    this.budgetAlerts = [];
  }

  // Private methods

  private getDailyCosts(): { openrouter: number; huggingface: number } {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dailyRecords = this.costRecords.filter(r => r.timestamp >= oneDayAgo);
    
    const openrouter = dailyRecords.filter(r => r.apiType === 'openrouter').reduce((sum, r) => sum + r.cost, 0);
    const huggingface = dailyRecords.filter(r => r.apiType === 'huggingface').reduce((sum, r) => sum + r.cost, 0);
    
    return { openrouter, huggingface };
  }

  private createAlert(
    type: 'warning' | 'critical' | 'exceeded',
    apiType: 'openrouter' | 'huggingface',
    currentCost: number,
    budgetLimit: number,
    percentageUsed: number
  ): BudgetAlert {
    const messages = {
      warning: `${apiType} API approaching budget limit`,
      critical: `${apiType} API near budget limit - immediate attention required`,
      exceeded: `${apiType} API budget exceeded - operations may be throttled`
    };

    return {
      id: this.generateId(),
      timestamp: new Date(),
      type,
      apiType,
      message: messages[type],
      currentCost,
      budgetLimit,
      percentageUsed
    };
  }

  private generateId(): string {
    return `cost-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private maintainRecordLimit(): void {
    if (this.costRecords.length > this.maxRecords) {
      this.costRecords = this.costRecords.slice(-this.maxRecords);
    }
  }

  private maintainAlertLimit(): void {
    const maxAlerts = 1000;
    if (this.budgetAlerts.length > maxAlerts) {
      this.budgetAlerts = this.budgetAlerts.slice(-maxAlerts);
    }
  }
}