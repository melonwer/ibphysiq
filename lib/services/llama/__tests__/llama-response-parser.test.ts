/**
 * Unit tests for LlamaResponseParser
 */

import { LlamaResponseParser } from '../llama-response-parser';
import { IBPhysicsSubtopic } from '../../../types/question-generation';

describe('LlamaResponseParser', () => {
  describe('parseResponse', () => {
    it('should parse a well-formatted response', () => {
      const response = `
QUESTION: A car accelerates uniformly from rest at 2.0 m/s². What is the velocity of the car after 5.0 s?

A) 5.0 m/s
B) 10.0 m/s
C) 15.0 m/s
D) 20.0 m/s

ANSWER: B
      `;

      const result = LlamaResponseParser.parseResponse(response, IBPhysicsSubtopic.KINEMATICS);

      expect(result.success).toBe(true);
      expect(result.question).toBeDefined();
      expect(result.question!.questionText).toContain('car accelerates uniformly');
      expect(result.question!.options).toHaveLength(4);
      expect(result.question!.options[0]).toBe('A) 5.0 m/s');
      expect(result.question!.suggestedAnswer).toBe('B');
      expect(result.question!.topic).toBe(IBPhysicsSubtopic.KINEMATICS);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should handle response without QUESTION: header', () => {
      const response = `
A ball is thrown upward with initial velocity 20 m/s. What is the maximum height?

A) 15.3 m
B) 20.4 m
C) 25.5 m
D) 40.8 m

ANSWER: B
      `;

      const result = LlamaResponseParser.parseResponse(response, IBPhysicsSubtopic.KINEMATICS);

      expect(result.success).toBe(true);
      expect(result.question!.questionText).toContain('ball is thrown upward');
    });

    it('should handle missing options', () => {
      const response = `
QUESTION: What is the speed of light?

A) 3.0 × 10⁸ m/s
B) 2.0 × 10⁸ m/s

ANSWER: A
      `;

      const result = LlamaResponseParser.parseResponse(response, IBPhysicsSubtopic.WAVE_MODEL);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Expected 4 options, found 2');
    });

    it('should handle missing answer', () => {
      const response = `
QUESTION: Calculate the force needed.

A) 10 N
B) 20 N
C) 30 N
D) 40 N
      `;

      const result = LlamaResponseParser.parseResponse(response, IBPhysicsSubtopic.FORCES_MOMENTUM);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid or missing answer choice');
    });

    it('should handle malformed options', () => {
      const response = `
QUESTION: What is the answer?

A) Option A
B) Option B
C) 
D) Option D

ANSWER: A
      `;

      const result = LlamaResponseParser.parseResponse(response, IBPhysicsSubtopic.KINEMATICS);

      expect(result.success).toBe(false);
      expect(result.error).toContain('One or more options are empty');
    });

    it('should calculate confidence based on response quality', () => {
      const highQualityResponse = `
QUESTION: A 2.0 kg mass is accelerated at 3.0 m/s². Calculate the applied force.

A) 6.0 N
B) 5.0 N
C) 1.5 N
D) 0.67 N

ANSWER: A
      `;

      const lowQualityResponse = `
QUESTION: What?

A) A
B) B
C) C
D) D

ANSWER: A
      `;

      const highResult = LlamaResponseParser.parseResponse(highQualityResponse, IBPhysicsSubtopic.FORCES_MOMENTUM);
      const lowResult = LlamaResponseParser.parseResponse(lowQualityResponse, IBPhysicsSubtopic.FORCES_MOMENTUM);

      expect(highResult.success).toBe(true);
      expect(lowResult.success).toBe(true);
      expect(highResult.confidence!).toBeGreaterThan(lowResult.confidence!);
    });

    it('should format options correctly', () => {
      const response = `
QUESTION: Test question

A) First option
B) Second option
C) Third option
D) Fourth option

ANSWER: A
      `;

      const result = LlamaResponseParser.parseResponse(response, IBPhysicsSubtopic.KINEMATICS);

      expect(result.success).toBe(true);
      expect(result.question!.options[0]).toBe('A) First option');
      expect(result.question!.options[1]).toBe('B) Second option');
      expect(result.question!.options[2]).toBe('C) Third option');
      expect(result.question!.options[3]).toBe('D) Fourth option');
    });
  });

  describe('isValidResponse', () => {
    it('should validate complete responses', () => {
      const validResponse = `
QUESTION: Test question

A) Option A
B) Option B
C) Option C
D) Option D

ANSWER: A
      `;

      expect(LlamaResponseParser.isValidResponse(validResponse)).toBe(true);
    });

    it('should reject incomplete responses', () => {
      const incompleteResponse = 'Just some text without proper format';
      expect(LlamaResponseParser.isValidResponse(incompleteResponse)).toBe(false);
    });

    it('should reject very short responses', () => {
      const shortResponse = 'A) Yes';
      expect(LlamaResponseParser.isValidResponse(shortResponse)).toBe(false);
    });
  });

  describe('extractErrorMessage', () => {
    it('should extract error messages', () => {
      expect(LlamaResponseParser.extractErrorMessage('Error: Model failed to load')).toBe('Model failed to load');
      expect(LlamaResponseParser.extractErrorMessage('Cannot generate question')).toBe('generate question');
      expect(LlamaResponseParser.extractErrorMessage('Unable to process request')).toBe('process request');
      expect(LlamaResponseParser.extractErrorMessage('Failed to parse input')).toBe('parse input');
    });

    it('should return null for normal responses', () => {
      expect(LlamaResponseParser.extractErrorMessage('QUESTION: Normal question')).toBeNull();
    });
  });

  describe('getParsingStats', () => {
    it('should calculate parsing statistics', () => {
      const responses = [
        `QUESTION: Good question\nA) 1\nB) 2\nC) 3\nD) 4\nANSWER: A`,
        `QUESTION: Another good question\nA) 1\nB) 2\nC) 3\nD) 4\nANSWER: B`,
        `Bad response without proper format`,
        `QUESTION: Missing options\nANSWER: A`
      ];

      const stats = LlamaResponseParser.getParsingStats(responses);

      expect(stats.totalResponses).toBe(4);
      expect(stats.successfulParses).toBe(2);
      expect(stats.averageConfidence).toBeGreaterThan(0);
      expect(stats.commonErrors.length).toBeGreaterThan(0);
    });
  });
});