/**
 * Main validation engine that orchestrates all validation processes
 */

import {
  RawQuestion,
  RefinedQuestion,
  ValidationResult,
  FormatValidationResult,
  PhysicsValidationResult,
  ComplianceValidationResult
} from '../../types/question-generation';
import { FormatValidator } from './format-validator';
import { PhysicsValidator } from './physics-validator';
import { IBComplianceValidator } from './ib-compliance-validator';

export class ValidationEngine {
  private formatValidator: FormatValidator;
  private physicsValidator: PhysicsValidator;
  private ibComplianceValidator: IBComplianceValidator;

  constructor() {
    this.formatValidator = new FormatValidator();
    this.physicsValidator = new PhysicsValidator();
    this.ibComplianceValidator = new IBComplianceValidator();
  }

  /**
   * Validates the format of a raw question from Llama
   */
  validateFormat(question: RawQuestion): FormatValidationResult {
    return this.formatValidator.validateFormat(question);
  }

  /**
   * Validates the physics accuracy of a refined question from Gemini
   */
  validatePhysics(question: RefinedQuestion): PhysicsValidationResult {
    return this.physicsValidator.validatePhysics(question);
  }

  /**
   * Validates IB curriculum compliance of a refined question
   */
  validateIBCompliance(question: RefinedQuestion): ComplianceValidationResult {
    return this.ibComplianceValidator.validateIBCompliance(question);
  }

  /**
   * Comprehensive validation of a raw question (format only)
   */
  validateRawQuestion(question: RawQuestion): ValidationResult {
    const formatResult = this.validateFormat(question);
    
    return {
      isValid: formatResult.isValid,
      errors: formatResult.errors,
      warnings: formatResult.warnings,
      suggestions: formatResult.suggestions
    };
  }

  /**
   * Comprehensive validation of a refined question (all validations)
   */
  validateRefinedQuestion(question: RefinedQuestion): {
    overall: ValidationResult;
    format: FormatValidationResult;
    physics: PhysicsValidationResult;
    compliance: ComplianceValidationResult;
  } {
    // Convert refined question to raw question format for format validation
    const rawQuestion: RawQuestion = {
      questionText: question.questionText,
      options: question.options,
      suggestedAnswer: question.correctAnswer,
      confidence: 1.0, // Assume high confidence for refined questions
      topic: question.topic
    };

    const formatResult = this.validateFormat(rawQuestion);
    const physicsResult = this.validatePhysics(question);
    const complianceResult = this.validateIBCompliance(question);

    // Combine all validation results
    const allErrors = [
      ...formatResult.errors,
      ...physicsResult.errors,
      ...complianceResult.errors
    ];

    const allWarnings = [
      ...formatResult.warnings,
      ...physicsResult.warnings,
      ...complianceResult.warnings
    ];

    const allSuggestions = [
      ...formatResult.suggestions,
      ...physicsResult.suggestions,
      ...complianceResult.suggestions
    ];

    // Overall validation is valid if all individual validations pass
    const overallValid = formatResult.isValid && 
                        physicsResult.isValid && 
                        complianceResult.isValid;

    const overall: ValidationResult = {
      isValid: overallValid,
      errors: allErrors,
      warnings: allWarnings,
      suggestions: allSuggestions
    };

    return {
      overall,
      format: formatResult,
      physics: physicsResult,
      compliance: complianceResult
    };
  }

  /**
   * Quick validation check for pipeline decisions
   */
  isQuestionAcceptable(question: RefinedQuestion): boolean {
    const validation = this.validateRefinedQuestion(question);

    const hasHighSeverityErrors = validation.overall.errors.some(e => e.severity === 'high');
    const hasPhysicsErrors = validation.physics.physicsAccuracy === 'major-errors';

    // Accept refined question as long as there are no high-severity errors and physics is not majorly flawed.
    // Topic relevance and IB compliance are treated as warnings/suggestions, not blockers.
    return !hasHighSeverityErrors && !hasPhysicsErrors;
  }

  /**
   * Get validation summary for monitoring
   */
  getValidationSummary(question: RefinedQuestion): {
    score: number;
    issues: string[];
    strengths: string[];
  } {
    const validation = this.validateRefinedQuestion(question);
    
    // Calculate overall score (0-100)
    let score = 100;
    
    // Deduct points for errors
    validation.overall.errors.forEach(error => {
      switch (error.severity) {
        case 'high': score -= 20; break;
        case 'medium': score -= 10; break;
        case 'low': score -= 5; break;
      }
    });
    
    // Deduct points for warnings
    score -= validation.overall.warnings.length * 2;
    
    // Adjust for physics accuracy
    switch (validation.physics.physicsAccuracy) {
      case 'major-errors': score -= 30; break;
      case 'minor-issues': score -= 10; break;
      case 'accurate': score += 5; break;
    }
    
    // Adjust for topic relevance
    score += (validation.compliance.topicRelevance - 0.5) * 20;
    
    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));
    
    // Identify key issues
    const issues: string[] = [];
    validation.overall.errors.forEach(error => {
      if (error.severity === 'high') {
        issues.push(error.message);
      }
    });
    
    if (validation.physics.physicsAccuracy === 'major-errors') {
      issues.push('Physics accuracy issues detected');
    }
    
    if (validation.compliance.topicRelevance < 0.5) {
      issues.push('Low topic relevance');
    }
    
    // Identify strengths
    const strengths: string[] = [];
    
    if (validation.physics.physicsAccuracy === 'accurate') {
      strengths.push('Physically accurate');
    }
    
    if (validation.compliance.topicRelevance > 0.8) {
      strengths.push('Highly relevant to topic');
    }
    
    if (validation.compliance.ibCompliant) {
      strengths.push('IB compliant style');
    }
    
    if (validation.physics.unitConsistency) {
      strengths.push('Consistent units');
    }
    
    return { score, issues, strengths };
  }
}