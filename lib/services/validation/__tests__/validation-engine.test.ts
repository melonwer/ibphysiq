/**
 * Unit tests for ValidationEngine
 */

import { ValidationEngine } from '../validation-engine';
import { RawQuestion, RefinedQuestion, IBPhysicsSubtopic } from '../../../types/question-generation';

describe('ValidationEngine', () => {
  let validationEngine: ValidationEngine;

  beforeEach(() => {
    validationEngine = new ValidationEngine();
  });

  describe('validateFormat', () => {
    it('should validate a properly formatted question', () => {
      const question: RawQuestion = {
        questionText: 'A car accelerates from rest at 2.0 m/s². What is its velocity after 5.0 s?',
        options: [
          'A) 5.0 m/s',
          'B) 10.0 m/s',
          'C) 15.0 m/s',
          'D) 20.0 m/s'
        ],
        suggestedAnswer: 'B',
        confidence: 0.9,
        topic: IBPhysicsSubtopic.KINEMATICS
      };

      const result = validationEngine.validateFormat(question);
      
      expect(result.isValid).toBe(true);
      expect(result.hasQuestionText).toBe(true);
      expect(result.hasOptions).toBe(true);
      expect(result.hasCorrectAnswer).toBe(true);
      expect(result.optionCount).toBe(4);
    });

    it('should detect missing question text', () => {
      const question: RawQuestion = {
        questionText: '',
        options: ['A) 1', 'B) 2', 'C) 3', 'D) 4'],
        suggestedAnswer: 'A',
        confidence: 0.9,
        topic: IBPhysicsSubtopic.KINEMATICS
      };

      const result = validationEngine.validateFormat(question);
      
      expect(result.isValid).toBe(false);
      expect(result.hasQuestionText).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Question text is missing');
    });

    it('should detect incorrect number of options', () => {
      const question: RawQuestion = {
        questionText: 'What is 2 + 2?',
        options: ['A) 3', 'B) 4'], // Only 2 options instead of 4
        suggestedAnswer: 'B',
        confidence: 0.9,
        topic: IBPhysicsSubtopic.KINEMATICS
      };

      const result = validationEngine.validateFormat(question);
      
      expect(result.isValid).toBe(false);
      expect(result.optionCount).toBe(2);
      expect(result.errors.some(e => e.message.includes('Expected 4 options'))).toBe(true);
    });

    it('should detect invalid answer choice', () => {
      const question: RawQuestion = {
        questionText: 'What is 2 + 2?',
        options: ['A) 3', 'B) 4', 'C) 5', 'D) 6'],
        suggestedAnswer: 'E', // Invalid answer choice
        confidence: 0.9,
        topic: IBPhysicsSubtopic.KINEMATICS
      };

      const result = validationEngine.validateFormat(question);
      
      expect(result.isValid).toBe(false);
      expect(result.hasCorrectAnswer).toBe(false);
      expect(result.errors.some(e => e.message.includes('must be A, B, C, or D'))).toBe(true);
    });
  });

  describe('validatePhysics', () => {
    it('should validate physically accurate kinematics question', () => {
      const question: RefinedQuestion = {
        questionText: 'A car accelerates from rest at 2.0 m/s². What is its velocity after 5.0 s?',
        options: [
          'A) 5.0 m/s',
          'B) 10.0 m/s',
          'C) 15.0 m/s',
          'D) 20.0 m/s'
        ],
        correctAnswer: 'B',
        improvements: ['Corrected units'],
        validationStatus: 'valid',
        topic: IBPhysicsSubtopic.KINEMATICS
      };

      const result = validationEngine.validatePhysics(question);
      
      expect(result.isValid).toBe(true);
      expect(result.physicsAccuracy).toBe('accurate');
      expect(result.unitConsistency).toBe(true);
    });

    it('should detect impossible velocity values', () => {
      const question: RefinedQuestion = {
        questionText: 'A car travels at 500000000 m/s. How far does it go in 1 second?',
        options: [
          'A) 500000000 m',
          'B) 1000000000 m',
          'C) 1500000000 m',
          'D) 2000000000 m'
        ],
        correctAnswer: 'A',
        improvements: [],
        validationStatus: 'valid',
        topic: IBPhysicsSubtopic.KINEMATICS
      };

      const result = validationEngine.validatePhysics(question);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('exceeds speed of light'))).toBe(true);
    });
  });

  describe('validateIBCompliance', () => {
    it('should validate IB-compliant question style', () => {
      const question: RefinedQuestion = {
        questionText: 'A satellite orbits Earth at a height of 400 km above the surface. Calculate the orbital velocity of the satellite.',
        options: [
          'A) 6.2 × 10³ m/s',
          'B) 7.7 × 10³ m/s',
          'C) 8.9 × 10³ m/s',
          'D) 9.8 × 10³ m/s'
        ],
        correctAnswer: 'B',
        improvements: ['Added real-world context'],
        validationStatus: 'valid',
        topic: IBPhysicsSubtopic.GRAVITATIONAL_FIELDS
      };

      const result = validationEngine.validateIBCompliance(question);
      
      expect(result.isValid).toBe(true);
      expect(result.ibCompliant).toBe(true);
      expect(result.topicRelevance).toBeGreaterThan(0.5);
    });

    it('should detect low topic relevance', () => {
      const question: RefinedQuestion = {
        questionText: 'What color is the sky?',
        options: [
          'A) Blue',
          'B) Red',
          'C) Green',
          'D) Yellow'
        ],
        correctAnswer: 'A',
        improvements: [],
        validationStatus: 'valid',
        topic: IBPhysicsSubtopic.KINEMATICS // Not relevant to kinematics
      };

      const result = validationEngine.validateIBCompliance(question);
      
      expect(result.topicRelevance).toBeLessThan(0.3); // Updated threshold
      expect(result.warnings.some(w => w.message.includes('not be sufficiently relevant'))).toBe(true);
    });
  });

  describe('isQuestionAcceptable', () => {
    it('should accept a high-quality question', () => {
      const question: RefinedQuestion = {
        questionText: 'A car accelerates uniformly from rest at 2.0 m/s². Calculate its velocity after 5.0 s.',
        options: [
          'A) 5.0 m/s',
          'B) 10.0 m/s',
          'C) 15.0 m/s',
          'D) 20.0 m/s'
        ],
        correctAnswer: 'B',
        improvements: ['Improved clarity'],
        validationStatus: 'valid',
        topic: IBPhysicsSubtopic.KINEMATICS
      };

      const result = validationEngine.isQuestionAcceptable(question);
      expect(result).toBe(true);
    });

    it('should reject a question with high-severity errors', () => {
      const question: RefinedQuestion = {
        questionText: '', // Missing question text - high severity error
        options: [
          'A) 5.0 m/s',
          'B) 10.0 m/s',
          'C) 15.0 m/s',
          'D) 20.0 m/s'
        ],
        correctAnswer: 'B',
        improvements: [],
        validationStatus: 'valid',
        topic: IBPhysicsSubtopic.KINEMATICS
      };

      const result = validationEngine.isQuestionAcceptable(question);
      expect(result).toBe(false);
    });
  });

  describe('getValidationSummary', () => {
    it('should provide comprehensive validation summary', () => {
      const question: RefinedQuestion = {
        questionText: 'A car accelerates uniformly from rest at 2.0 m/s². Calculate its velocity after 5.0 s.',
        options: [
          'A) 5.0 m/s',
          'B) 10.0 m/s',
          'C) 15.0 m/s',
          'D) 20.0 m/s'
        ],
        correctAnswer: 'B',
        improvements: ['Improved clarity'],
        validationStatus: 'valid',
        topic: IBPhysicsSubtopic.KINEMATICS
      };

      const summary = validationEngine.getValidationSummary(question);
      
      expect(summary.score).toBeGreaterThan(80);
      expect(summary.strengths).toContain('Physically accurate');
      expect(summary.issues).toHaveLength(0);
    });
  });
});