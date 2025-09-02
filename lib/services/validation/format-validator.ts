/**
 * Format validation for generated questions
 */

import {
  RawQuestion,
  FormatValidationResult,
  ValidationError,
  ValidationWarning
} from '../../types/question-generation';

export class FormatValidator {
  /**
   * Validates the basic format structure of a question
   */
  validateFormat(question: RawQuestion): FormatValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Check if question text exists and is meaningful
    const hasQuestionText = this.validateQuestionText(question.questionText, errors, warnings);
    
    // Check options format and count
    const { hasOptions, optionCount } = this.validateOptions(question.options, errors, warnings);
    
    // Check if correct answer is provided
    const hasCorrectAnswer = this.validateCorrectAnswer(question.suggestedAnswer, question.options, errors, warnings);
    
    // Additional format checks
    this.validateUnits(question.questionText, warnings, suggestions);
    this.validateNumericalValues(question.questionText, warnings, suggestions);
    
    const isValid = errors.length === 0;

    return {
      isValid,
      errors,
      warnings,
      suggestions,
      hasQuestionText,
      hasOptions,
      hasCorrectAnswer,
      optionCount
    };
  }

  private validateQuestionText(questionText: string, errors: ValidationError[], warnings: ValidationWarning[]): boolean {
    if (!questionText || questionText.trim().length === 0) {
      errors.push({
        type: 'format',
        message: 'Question text is missing or empty',
        severity: 'high',
        field: 'questionText'
      });
      return false;
    }

    if (questionText.trim().length < 10) {
      warnings.push({
        type: 'format',
        message: 'Question text seems too short',
        suggestion: 'Consider adding more context or detail to the question'
      });
    }

    if (questionText.length > 500) {
      warnings.push({
        type: 'format',
        message: 'Question text is very long',
        suggestion: 'Consider making the question more concise'
      });
    }

    // Check for question mark
    if (!questionText.includes('?')) {
      warnings.push({
        type: 'format',
        message: 'Question text does not contain a question mark',
        suggestion: 'Add a question mark to clearly indicate the question'
      });
    }

    return true;
  }

  private validateOptions(options: string[], errors: ValidationError[], warnings: ValidationWarning[]): { hasOptions: boolean; optionCount: number } {
    if (!options || !Array.isArray(options)) {
      errors.push({
        type: 'format',
        message: 'Options array is missing or invalid',
        severity: 'high',
        field: 'options'
      });
      return { hasOptions: false, optionCount: 0 };
    }

    const optionCount = options.length;

    if (optionCount !== 4) {
      errors.push({
        type: 'format',
        message: `Expected 4 options, but found ${optionCount}`,
        severity: 'high',
        field: 'options'
      });
    }

    // Check each option
    options.forEach((option, index) => {
      if (!option || option.trim().length === 0) {
        errors.push({
          type: 'format',
          message: `Option ${index + 1} is empty`,
          severity: 'medium',
          field: `options[${index}]`
        });
      }

      // Check for proper option labeling (A), B), etc.)
      const expectedLabel = String.fromCharCode(65 + index); // A, B, C, D
      if (!option.trim().startsWith(expectedLabel + ')') && !option.trim().startsWith(expectedLabel + '.')) {
        warnings.push({
          type: 'format',
          message: `Option ${index + 1} should start with "${expectedLabel})"`,
          suggestion: `Format option as "${expectedLabel}) ${option.trim()}"`
        });
      }
    });

    // Check for duplicate options
    const uniqueOptions = new Set(options.map(opt => opt.trim().toLowerCase()));
    if (uniqueOptions.size !== options.length) {
      warnings.push({
        type: 'format',
        message: 'Some options appear to be duplicates',
        suggestion: 'Ensure all options are distinct'
      });
    }

    return { hasOptions: optionCount > 0, optionCount };
  }

  private validateCorrectAnswer(suggestedAnswer: string, options: string[], errors: ValidationError[], _warnings: ValidationWarning[]): boolean {
    if (!suggestedAnswer || suggestedAnswer.trim().length === 0) {
      errors.push({
        type: 'format',
        message: 'Correct answer is missing',
        severity: 'high',
        field: 'suggestedAnswer'
      });
      return false;
    }

    // Check if answer is a valid option letter (A, B, C, D)
    const answerLetter = suggestedAnswer.trim().toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(answerLetter)) {
      errors.push({
        type: 'format',
        message: 'Correct answer must be A, B, C, or D',
        severity: 'high',
        field: 'suggestedAnswer'
      });
      return false;
    }

    // Check if the answer corresponds to an existing option
    const answerIndex = answerLetter.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
    if (!options || answerIndex >= options.length) {
      errors.push({
        type: 'format',
        message: `Answer "${answerLetter}" does not correspond to any option`,
        severity: 'high',
        field: 'suggestedAnswer'
      });
      return false;
    }

    return true;
  }

  private validateUnits(questionText: string, warnings: ValidationWarning[], suggestions: string[]): void {
    // Common physics units that should be present (kept for future reference)
    const unitPattern = /\d+\.?\d*\s*[a-zA-Z°]+/g;
    const foundUnits = questionText.match(unitPattern);

    if (foundUnits) {
      // Check for proper unit formatting
      foundUnits.forEach(unit => {
        if (!/\s/.test(unit)) {
          suggestions.push(`Consider adding space between number and unit in "${unit}"`);
        }
      });
    }

    // Check for missing units in numerical values
    const numbersWithoutUnits = questionText.match(/\d+\.?\d*(?!\s*[a-zA-Z°])/g);
    if (numbersWithoutUnits && numbersWithoutUnits.length > 0) {
      warnings.push({
        type: 'format',
        message: 'Some numerical values may be missing units',
        suggestion: 'Ensure all physical quantities include appropriate units'
      });
    }
  }

  private validateNumericalValues(questionText: string, warnings: ValidationWarning[], _suggestions: string[]): void {
    // Check for reasonable numerical values
    const numbers = questionText.match(/\d+\.?\d*/g);
    
    if (numbers) {
      numbers.forEach(numStr => {
        const num = parseFloat(numStr);
        
        // Check for extremely large or small numbers that might be errors
        if (num > 1e10) {
          warnings.push({
            type: 'format',
            message: `Very large number detected: ${numStr}`,
            suggestion: 'Consider using scientific notation for very large numbers'
          });
        }
        
        if (num > 0 && num < 1e-6) {
          warnings.push({
            type: 'format',
            message: `Very small number detected: ${numStr}`,
            suggestion: 'Consider using scientific notation for very small numbers'
          });
        }
      });
    }
  }
}