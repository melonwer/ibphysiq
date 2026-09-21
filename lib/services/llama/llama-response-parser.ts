/**
 * Parser for Llama model responses
 */

import { RawQuestion, IBPhysicsSubtopic } from '../../types/question-generation';

export interface LlamaParseResult {
  success: boolean;
  question?: RawQuestion;
  error?: string;
  confidence?: number;
}

export class LlamaResponseParser {
  /**
   * Parse Llama model response into RawQuestion format
   */
  static parseResponse(response: string, topic: IBPhysicsSubtopic): LlamaParseResult {
    try {
      // Clean the response
      const cleanResponse = this.cleanResponse(response);
      
      // Extract question components
      const questionText = this.extractQuestionText(cleanResponse);
      const options = this.extractOptions(cleanResponse);
      const answer = this.extractAnswer(cleanResponse);
      
      // Validate extracted components
      const validation = this.validateComponents(questionText, options, answer);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error
        };
      }
      
      // Calculate confidence based on response quality
      const confidence = this.calculateConfidence(cleanResponse, questionText!, options!, answer!);
      
      // Create RawQuestion object
      const rawQuestion: RawQuestion = {
        questionText: questionText!,
        options: this.formatOptions(options!),
        suggestedAnswer: answer!,
        confidence,
        topic
      };
      
      return {
        success: true,
        question: rawQuestion,
        confidence
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse Llama response: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Clean and normalize the response
   */
  private static cleanResponse(response: string): string {
    // Handle LIT response format: {"response": "original_prompt generated_content"}
    if (response.startsWith('{"response":"')) {
      try {
        const parsed = JSON.parse(response);
        if (parsed.response && typeof parsed.response === 'string') {
          // Extract the generated content after the original prompt
          const generatedContent = parsed.response;
          // Find the closing brace of the original JSON prompt and take everything after it
          const jsonEndIndex = generatedContent.indexOf('"}');
          if (jsonEndIndex !== -1) {
            response = generatedContent.substring(jsonEndIndex + 2).trim();
          } else {
            response = generatedContent;
          }
        }
      } catch (e) {
        // If JSON parsing fails, continue with original response
      }
    }

    return response
      .trim()
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      // Trim horizontal whitespace on each line. Using `\s` here would also
      // swallow line breaks (an `m`-anchored `$` matches just before one) and
      // glue the next line on, so `D) Fourth option` ran into `ANSWER: A`.
      .replace(/^[^\S\n]+|[^\S\n]+$/gm, '');
  }

  /**
   * Extract question text from response
   */
  private static extractQuestionText(response: string): string | null {
    // Look for QUESTION: pattern (accept A) A. A: option styles and common output headers)
    const patterns = [
      /QUESTION:\s*([\s\S]+?)(?=\n\s*[A-D][\)\.\:]\s|$)/i,
      /Question:\s*([\s\S]+?)(?=\n\s*[A-D][\)\.\:]\s|$)/i,
      /###\s*Output:\s*([\s\S]+?)(?=\n\s*[A-D][\)\.\:]\s|$)/i,
      /^([\s\S]+?)(?=\n\s*[A-D][\)\.\:]\s)/i // Fallback: everything before options
    ];

    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match && match[1]) {
        const questionText = match[1].trim();
        if (questionText.length > 10) { // Ensure meaningful question
          return questionText;
        }
      }
    }

    return null;
  }

  /**
   * Extract options from response.
   *
   * Returns every labelled option it can find -- including ones whose text is
   * empty -- so callers can report the real number found instead of losing the
   * count when a response does not have exactly four options.
   */
  private static extractOptions(response: string): string[] {
    // Options are normally emitted one per line, which is also the only layout
    // where multi-line option text can be told apart from the answer block.
    const lineAnchored = this.scanOptions(response, true);
    if (lineAnchored.length >= 4) {
      return lineAnchored;
    }

    // Rescue responses that put several options on a single line, but only
    // when that layout explains more options than the anchored scan did.
    const inline = this.scanOptions(response, false);
    return inline.length > lineAnchored.length ? inline : lineAnchored;
  }

  /**
   * Scan for `A) ...` / `B. ...` / `C: ...` option labels.
   *
   * `anchored` restricts matches to the start of a line. The unanchored pass is
   * a fallback for single-line option grids and can therefore be fooled by
   * prose containing an option-like label.
   */
  private static scanOptions(response: string, anchored: boolean): string[] {
    const prefix = anchored ? '^[^\\S\\n]*' : '';
    const boundary = anchored ? '\\n' : '';
    const optionPattern = new RegExp(
      `${prefix}([A-D])[\\)\\.\\:][^\\S\\n]*([\\s\\S]*?)` +
      `(?=${boundary}[^\\S\\n]*[A-D][\\)\\.\\:]` +
      `|${boundary}[^\\S\\n]*(?:ANSWER|CORRECT_ANSWER|IMPROVEMENTS_MADE)\\s*:` +
      `|\\s*$)`,
      anchored ? 'gm' : 'g'
    );

    const options: string[] = [];
    let match;

    while ((match = optionPattern.exec(response)) !== null) {
      options.push(match[2].trim());
    }

    return options;
  }

  /**
   * Extract answer from response
   */
  private static extractAnswer(response: string): string | null {
    // Look for ANSWER: pattern
    const patterns = [
      /ANSWER:\s*([A-D])/i,
      /Answer:\s*([A-D])/i,
      /CORRECT_ANSWER:\s*([A-D])/i,
      /Correct answer:\s*([A-D])/i,
      /The answer is\s*([A-D])/i
    ];

    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match && match[1]) {
        return match[1].toUpperCase();
      }
    }

    // No answer means the response is unusable as a question. Returning a
    // default here would silently relabel a wrong option as correct, so the
    // caller must supply a real answer.
    return null;
  }

  /**
   * Validate extracted components
   */
  private static validateComponents(
    questionText: string | null,
    options: string[] | null,
    answer: string | null
  ): { isValid: boolean; error?: string } {
    if (!questionText) {
      return { isValid: false, error: 'No question text found' };
    }

    // Check the count first so a response with only two options is reported as
    // "found 2" rather than as a wall of empty options.
    if (!options || options.length !== 4) {
      return { isValid: false, error: `Expected 4 options, found ${options?.length || 0}` };
    }

    if (options.some(option => !option || option.trim().length === 0)) {
      return { isValid: false, error: 'One or more options are empty' };
    }

    if (!answer || !['A', 'B', 'C', 'D'].includes(answer)) {
      return { isValid: false, error: 'Invalid or missing answer choice' };
    }

    // Check question length
    if (questionText.length < 10) {
      return { isValid: false, error: 'Question text too short' };
    }

    return { isValid: true };
  }

  /**
   * Format options with proper labeling
   */
  private static formatOptions(options: string[]): string[] {
    return options.map((option, index) => {
      const letter = String.fromCharCode(65 + index); // A, B, C, D
      // Remove existing letter if present
      const cleanOption = option.replace(/^[A-D]\)\s*/, '');
      return `${letter}) ${cleanOption}`;
    });
  }

  /**
   * Calculate confidence score based on response quality
   */
  private static calculateConfidence(
    response: string,
    questionText: string,
    options: string[],
    answer: string
  ): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence for well-formatted responses
    if (response.includes('QUESTION:') && response.includes('ANSWER:')) {
      confidence += 0.2;
    }

    // Increase confidence for proper question structure
    if (questionText.includes('?')) {
      confidence += 0.1;
    }

    // Increase confidence for numerical values (physics questions should have numbers)
    if (/\d+\.?\d*/.test(questionText)) {
      confidence += 0.1;
    }

    // Increase confidence for units in question or options
    const hasUnits = [questionText, ...options].some(text => 
      /\d+\.?\d*\s*[a-zA-Z°]+/.test(text)
    );
    if (hasUnits) {
      confidence += 0.1;
    }

    // Decrease confidence for very short options
    const avgOptionLength = options.reduce((sum, opt) => sum + opt.length, 0) / options.length;
    if (avgOptionLength < 5) {
      confidence -= 0.2;
    }

    // Decrease confidence for duplicate options
    const uniqueOptions = new Set(options.map(opt => opt.toLowerCase().trim()));
    if (uniqueOptions.size < options.length) {
      confidence -= 0.3;
    }

    // Ensure confidence is within bounds
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Check if response appears to be incomplete or malformed
   */
  static isValidResponse(response: string): boolean {
    // Basic checks for valid response
    const hasQuestion = /QUESTION:|Question:/i.test(response);
    const hasOptions = /[A-D][\)\.\:]/.test(response);
    const hasAnswer = /ANSWER:|Answer:|CORRECT_ANSWER:/i.test(response);
    
    // Accept slightly shorter responses coming from some providers
    return hasQuestion && hasOptions && hasAnswer && response.length > 30;
  }

  /**
   * Extract any error messages from the response
   */
  static extractErrorMessage(response: string): string | null {
    const errorPatterns = [
      /error:\s*(.+)/i,
      /cannot\s+(.+)/i,
      /unable\s+to\s+(.+)/i,
      /failed\s+to\s+(.+)/i
    ];

    for (const pattern of errorPatterns) {
      const match = response.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Get parsing statistics for monitoring
   */
  static getParsingStats(responses: string[]): {
    totalResponses: number;
    successfulParses: number;
    averageConfidence: number;
    commonErrors: string[];
  } {
    const results = responses.map(response => 
      this.parseResponse(response, IBPhysicsSubtopic.KINEMATICS) // Use dummy topic for stats
    );

    const successful = results.filter(r => r.success);
    const errors = results.filter(r => !r.success).map(r => r.error!);
    
    // Count error types
    const errorCounts: Record<string, number> = {};
    errors.forEach(error => {
      const key = error.split(':')[0]; // Get error type
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });

    const commonErrors = Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([error]) => error);

    const averageConfidence = successful.length > 0
      ? successful.reduce((sum, r) => sum + (r.confidence || 0), 0) / successful.length
      : 0;

    return {
      totalResponses: responses.length,
      successfulParses: successful.length,
      averageConfidence,
      commonErrors
    };
  }
}