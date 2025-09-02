/**
 * Physics accuracy validation for generated questions
 */

import {
  RefinedQuestion,
  PhysicsValidationResult,
  ValidationError,
  ValidationWarning,
  IBPhysicsSubtopic
} from '../../types/question-generation';

export class PhysicsValidator {
  /**
   * Validates the physics accuracy of a refined question
   */
  validatePhysics(question: RefinedQuestion): PhysicsValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Validate unit consistency
    const unitConsistency = this.validateUnitConsistency(question.questionText, errors, warnings);
    
    // Validate numerical accuracy
    const numericalAccuracy = this.validateNumericalAccuracy(question, errors, warnings);
    
    // Validate physics concepts for the specific topic
    this.validateTopicSpecificPhysics(question, errors, warnings, suggestions);
    
    // Validate formula usage
    this.validateFormulaUsage(question.questionText, question.topic, warnings, suggestions);
    
    // Determine overall physics accuracy
    const physicsAccuracy = this.determinePhysicsAccuracy(errors, warnings);
    
    const isValid = errors.filter(e => e.severity === 'high').length === 0;

    return {
      isValid,
      errors,
      warnings,
      suggestions,
      physicsAccuracy,
      unitConsistency,
      numericalAccuracy
    };
  }

  private validateUnitConsistency(questionText: string, errors: ValidationError[], warnings: ValidationWarning[]): boolean {
    // Extract units from the question text
    const unitPattern = /(\d+\.?\d*)\s*([a-zA-Z°]+(?:\/[a-zA-Z°]+)*(?:\^?-?\d+)?)/g;
    const matches = [...questionText.matchAll(unitPattern)];
    
    let hasInconsistencies = false;

    // Check for common unit inconsistencies
    matches.forEach(match => {
      const value = parseFloat(match[1]);
      const unit = match[2];
      
      // Check for impossible physical values
      if (this.isImpossibleValue(value, unit)) {
        errors.push({
          type: 'physics',
          message: `Physically impossible value: ${value} ${unit}`,
          severity: 'high'
        });
        hasInconsistencies = true;
      }
      
      // Check for unit format issues
      if (this.hasUnitFormatIssues(unit)) {
        warnings.push({
          type: 'physics',
          message: `Unit format may be incorrect: ${unit}`,
          suggestion: 'Check unit notation and formatting'
        });
      }
    });

    return !hasInconsistencies;
  }

  private validateNumericalAccuracy(question: RefinedQuestion, errors: ValidationError[], warnings: ValidationWarning[]): boolean {
    // Extract numerical calculations from question and options
    const questionNumbers = this.extractNumbers(question.questionText);
    const optionNumbers = question.options.map(opt => this.extractNumbers(opt)).flat();
    
    const numericallyAccurate = true;

    // Check for reasonable order of magnitude
    [...questionNumbers, ...optionNumbers].forEach(num => {
      if (this.isUnreasonableOrderOfMagnitude(num, question.topic)) {
        warnings.push({
          type: 'physics',
          message: `Number ${num} may have unreasonable order of magnitude for ${question.topic}`,
          suggestion: 'Verify the calculation and units'
        });
      }
    });

    // Check for significant figures consistency
    if (!this.hasConsistentSignificantFigures(questionNumbers, optionNumbers)) {
      warnings.push({
        type: 'physics',
        message: 'Inconsistent significant figures in numerical values',
        suggestion: 'Ensure consistent precision throughout the question'
      });
    }

    return numericallyAccurate;
  }

  private validateTopicSpecificPhysics(
    question: RefinedQuestion, 
    errors: ValidationError[], 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ): void {
    switch (question.topic) {
      case IBPhysicsSubtopic.KINEMATICS:
        this.validateKinematics(question, errors, warnings, suggestions);
        break;
      case IBPhysicsSubtopic.FORCES_MOMENTUM:
        this.validateForcesMomentum(question, errors, warnings, suggestions);
        break;
      case IBPhysicsSubtopic.WORK_ENERGY_POWER:
        this.validateWorkEnergyPower(question, errors, warnings, suggestions);
        break;
      case IBPhysicsSubtopic.CURRENT_CIRCUITS:
        this.validateCurrentCircuits(question, errors, warnings, suggestions);
        break;
      // Add more topic-specific validations as needed
      default:
        // Generic physics validation
        this.validateGenericPhysics(question, warnings, suggestions);
    }
  }

  private validateKinematics(
    question: RefinedQuestion,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    _suggestions: string[]
  ): void {
    const text = question.questionText.toLowerCase();
    
    // Check for proper kinematic variables
    const hasVelocity = text.includes('velocity') || text.includes('speed');
    const hasAcceleration = text.includes('acceleration');
    const hasTime = text.includes('time');
    
    if (!hasTime && (hasVelocity || hasAcceleration)) {
      warnings.push({
        type: 'physics',
        message: 'Kinematic problem may be missing time component',
        suggestion: 'Consider if time should be specified or calculated'
      });
    }
    
    // Check for reasonable values
    const velocities = this.extractValuesWithUnit(question.questionText, ['m/s', 'ms⁻¹', 'km/h']);
    velocities.forEach(v => {
      if (v > 300000000) { // Speed of light
        errors.push({
          type: 'physics',
          message: `Velocity ${v} m/s exceeds speed of light`,
          severity: 'high'
        });
      }
    });
  }

  private validateForcesMomentum(
    question: RefinedQuestion, 
    errors: ValidationError[], 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ): void {
    const text = question.questionText.toLowerCase();
    
    // Check for Newton's laws context
    if (text.includes('force') && text.includes('mass')) {
      const forces = this.extractValuesWithUnit(question.questionText, ['N', 'newton']);
      const masses = this.extractValuesWithUnit(question.questionText, ['kg', 'g']);
      
      // Check F = ma consistency if both are present
      if (forces.length > 0 && masses.length > 0) {
        suggestions.push('Verify F = ma relationship in the problem');
      }
    }
    
    // Check momentum conservation context
    if (text.includes('collision') || text.includes('momentum')) {
      suggestions.push('Ensure momentum conservation principles are correctly applied');
    }
  }

  private validateWorkEnergyPower(
    question: RefinedQuestion, 
    errors: ValidationError[], 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ): void {
    const text = question.questionText.toLowerCase();
    
    // Check energy units
    this.extractValuesWithUnit(question.questionText, ['J', 'joule', 'kJ', 'MJ']);
    const powers = this.extractValuesWithUnit(question.questionText, ['W', 'watt', 'kW', 'MW']);
    
    // Check for energy conservation
    if (text.includes('potential') && text.includes('kinetic')) {
      suggestions.push('Verify energy conservation principles in the solution');
    }
    
    // Check power = work/time relationship
    if (powers.length > 0 && text.includes('time')) {
      suggestions.push('Check P = W/t relationship if applicable');
    }
  }

  private validateCurrentCircuits(
    question: RefinedQuestion, 
    errors: ValidationError[], 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ): void {
    const questionText = question.questionText.toLowerCase();
    
    // Check Ohm's law components
    const voltages = this.extractValuesWithUnit(question.questionText, ['V', 'volt']);
    const currents = this.extractValuesWithUnit(question.questionText, ['A', 'amp', 'mA']);
    const resistances = this.extractValuesWithUnit(question.questionText, ['Ω', 'ohm', 'kΩ']);
    
    if ((voltages.length > 0 && currents.length > 0) || 
        (voltages.length > 0 && resistances.length > 0) || 
        (currents.length > 0 && resistances.length > 0)) {
      suggestions.push('Verify V = IR relationship in the circuit');
    }
    
    // Check for reasonable electrical values
    currents.forEach(current => {
      if (current > 1000) {
        warnings.push({
          type: 'physics',
          message: `Very high current value: ${current} A`,
          suggestion: 'Check if current value is realistic for the scenario'
        });
      }
    });
  }

  private validateGenericPhysics(
    question: RefinedQuestion,
    warnings: ValidationWarning[],
    suggestions: string[]
  ): void {
    // Generic physics checks
    const questionText = question.questionText.toLowerCase();
    
    if (questionText.includes('calculate') || questionText.includes('find')) {
      suggestions.push('Ensure the question provides sufficient information for calculation');
    }
    
    if (questionText.includes('graph') || questionText.includes('diagram')) {
      warnings.push({
        type: 'physics',
        message: 'Question references visual elements that may not be present',
        suggestion: 'Verify that all referenced diagrams or graphs are included'
      });
    }
  }

  private validateFormulaUsage(
    questionText: string, 
    topic: IBPhysicsSubtopic, 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ): void {
    // Check if formulas are mentioned or implied
    const hasFormula = questionText.includes('=') || questionText.includes('equation');
    
    if (hasFormula) {
      suggestions.push('Verify that any formulas used are correct for the given topic');
    }
    
    // Topic-specific formula checks
    const topicFormulas = this.getExpectedFormulas(topic);
    if (topicFormulas.length > 0) {
      suggestions.push(`Consider if these formulas are relevant: ${topicFormulas.join(', ')}`);
    }
  }

  private determinePhysicsAccuracy(errors: ValidationError[], warnings: ValidationWarning[]): 'accurate' | 'minor-issues' | 'major-errors' {
    const highSeverityErrors = errors.filter(e => e.severity === 'high').length;
    const mediumSeverityErrors = errors.filter(e => e.severity === 'medium').length;
    
    if (highSeverityErrors > 0) {
      return 'major-errors';
    } else if (mediumSeverityErrors > 2 || warnings.length > 5) {
      return 'minor-issues';
    } else {
      return 'accurate';
    }
  }

  // Helper methods
  private isImpossibleValue(value: number, unit: string): boolean {
    const impossibleCombinations: Record<string, { min?: number; max?: number }> = {
      'K': { min: 0 }, // Absolute zero
      '°C': { min: -273.15 }, // Absolute zero in Celsius
      'm/s': { max: 299792458 }, // Speed of light
      'kg': { min: 0 }, // Mass cannot be negative
      'Hz': { min: 0 }, // Frequency cannot be negative
    };
    
    const limits = impossibleCombinations[unit];
    if (!limits) return false;
    
    return (limits.min !== undefined && value < limits.min) || 
           (limits.max !== undefined && value > limits.max);
  }

  private hasUnitFormatIssues(unit: string): boolean {
    // Check for common unit format issues
    const commonIssues = [
      /\d/, // Units shouldn't contain digits (except in exponents)
      /[^a-zA-Z°\/\^\-\d]/, // Invalid characters
    ];
    
    return commonIssues.some(pattern => pattern.test(unit));
  }

  private extractNumbers(text: string): number[] {
    const matches = text.match(/\d+\.?\d*/g);
    return matches ? matches.map(m => parseFloat(m)) : [];
  }

  private extractValuesWithUnit(text: string, units: string[]): number[] {
    const values: number[] = [];
    units.forEach(unit => {
      const pattern = new RegExp(`(\\d+\\.?\\d*)\\s*${unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => values.push(parseFloat(match[1])));
    });
    return values;
  }

  private isUnreasonableOrderOfMagnitude(num: number, topic: IBPhysicsSubtopic): boolean {
    // Topic-specific reasonable ranges
    const reasonableRanges: Partial<Record<IBPhysicsSubtopic, { min: number; max: number }>> = {
      [IBPhysicsSubtopic.KINEMATICS]: { min: 1e-3, max: 1e8 },
      [IBPhysicsSubtopic.CURRENT_CIRCUITS]: { min: 1e-6, max: 1e6 },
      [IBPhysicsSubtopic.FORCES_MOMENTUM]: { min: 1e-6, max: 1e12 },
    };
    
    const range = reasonableRanges[topic];
    if (!range) return false;
    
    return num < range.min || num > range.max;
  }

  private hasConsistentSignificantFigures(questionNumbers: number[], optionNumbers: number[]): boolean {
    // Simple check for significant figures consistency
    const allNumbers = [...questionNumbers, ...optionNumbers];
    if (allNumbers.length < 2) return true;
    
    // Check if numbers have similar precision
    const precisions = allNumbers.map(num => {
      const str = num.toString();
      const decimalIndex = str.indexOf('.');
      return decimalIndex === -1 ? 0 : str.length - decimalIndex - 1;
    });
    
    const maxPrecision = Math.max(...precisions);
    const minPrecision = Math.min(...precisions);
    
    return maxPrecision - minPrecision <= 2; // Allow some variation
  }

  private getExpectedFormulas(topic: IBPhysicsSubtopic): string[] {
    const formulaMap: Partial<Record<IBPhysicsSubtopic, string[]>> = {
      [IBPhysicsSubtopic.KINEMATICS]: ['v = u + at', 's = ut + ½at²', 'v² = u² + 2as'],
      [IBPhysicsSubtopic.FORCES_MOMENTUM]: ['F = ma', 'p = mv', 'F = Δp/Δt'],
      [IBPhysicsSubtopic.WORK_ENERGY_POWER]: ['W = Fd', 'KE = ½mv²', 'PE = mgh', 'P = W/t'],
      [IBPhysicsSubtopic.CURRENT_CIRCUITS]: ['V = IR', 'P = VI', 'P = I²R', 'P = V²/R'],
    };
    
    return formulaMap[topic] || [];
  }
}