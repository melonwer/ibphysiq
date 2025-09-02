#!/usr/bin/env npx tsx

/**
 * Script to fix JSONL storage format by adding proper multiple choice options
 * using Gemini 2.5 refinement service
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { IBPhysicsSubtopic } from '../lib/types/question-generation';
import { TOPIC_DISPLAY_NAMES } from '../lib/constants/ib-physics-topics';

// Create reverse mapping from display name to enum
const DISPLAY_TO_ENUM: Record<string, IBPhysicsSubtopic> = {};
for (const [enumValue, displayName] of Object.entries(TOPIC_DISPLAY_NAMES)) {
  DISPLAY_TO_ENUM[displayName] = enumValue as IBPhysicsSubtopic;
}

interface JsonlEntry {
  instruction: string;
  input: string;
  output: string;
}

interface GeminiConfig {
  apiKey: string;
  model: string;
  maxRetries: number;
  timeoutMs: number;
  temperature: number;
  maxOutputTokens: number;
}

class GeminiOptionsGenerator {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private config: GeminiConfig;

  constructor(apiKey: string) {
    this.config = {
      apiKey,
      model: 'gemini-2.5-pro-exp',
      maxRetries: 3,
      timeoutMs: 30000,
      temperature: 0.7,
      maxOutputTokens: 1000
    };

    this.genAI = new GoogleGenerativeAI(this.config.apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: this.config.model,
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxOutputTokens,
      }
    });
  }

  /**
   * Generate multiple choice options for a question
   */
  async generateOptions(questionText: string, topic: IBPhysicsSubtopic): Promise<{
    questionText: string;
    options: string[];
    correctAnswer: string;
  }> {
    const topicName = TOPIC_DISPLAY_NAMES[topic];

    const prompt = `You are an expert IB Physics teacher creating multiple-choice options for a physics question.

QUESTION: ${questionText}

TOPIC: ${topicName}

YOUR TASK:
Create 4 multiple-choice options (A, B, C, D) for this question. The options should:
1. Be scientifically accurate and appropriate for IB Physics level
2. Include one correct answer and three plausible distractors
3. Use proper units and formatting
4. Be similar in length and style

REQUIRED OUTPUT FORMAT:

REFINED_QUESTION: [The original question text, possibly improved]

OPTIONS:
A) [First option]
B) [Second option]
C) [Third option]
D) [Fourth option]

CORRECT_ANSWER: [Single letter: A, B, C, or D]

Make sure the correct answer is clearly the best choice and the distractors are common misconceptions or calculation errors.`;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        if (!text || text.trim().length === 0) {
          throw new Error('Empty response from Gemini API');
        }

        // Parse the response
        const parsed = this.parseGeminiResponse(text);
        if (parsed) {
          return parsed;
        } else {
          throw new Error('Failed to parse Gemini response');
        }

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Gemini attempt ${attempt} failed:`, lastError.message);

        if (attempt < this.config.maxRetries) {
          await this.delay(1000 * Math.pow(2, attempt - 1));
        }
      }
    }

    throw new Error(`Failed to generate options after ${this.config.maxRetries} attempts: ${lastError?.message}`);
  }

  private parseGeminiResponse(response: string): {
    questionText: string;
    options: string[];
    correctAnswer: string;
  } | null {
    try {
      // Extract question text
      const questionMatch = response.match(/REFINED_QUESTION:\s*(.+?)(?=\n\n|\nOPTIONS:|$)/i);
      const questionText = questionMatch ? questionMatch[1].trim() : '';

      // Extract options section
      const optionsStart = response.indexOf('OPTIONS:');
      if (optionsStart === -1) return null;

      const optionsEnd = response.indexOf('CORRECT_ANSWER:');
      const optionsText = optionsEnd === -1
        ? response.substring(optionsStart + 8)
        : response.substring(optionsStart + 8, optionsEnd);

      const options: string[] = [];

      const optionPattern = /([A-D])\)\s*(.+?)(?=\n[A-D]\)|$)/g;
      let match;
      while ((match = optionPattern.exec(optionsText)) !== null) {
        options.push(`${match[1]}) ${match[2].trim()}`);
      }

      if (options.length !== 4) return null;

      // Extract correct answer
      const answerMatch = response.match(/CORRECT_ANSWER:\s*([A-D])/i);
      const correctAnswer = answerMatch ? answerMatch[1].toUpperCase() : '';

      if (!correctAnswer || !['A', 'B', 'C', 'D'].includes(correctAnswer)) {
        return null;
      }

      return {
        questionText: questionText || 'Question text not found',
        options,
        correctAnswer
      };

    } catch (error) {
      console.error('Error parsing Gemini response:', error);
      return null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

async function fixJsonlFormat() {
  const jsonlPath = join(process.cwd(), 'data', 'onejsonfile.jsonl');
  const backupPath = join(process.cwd(), 'data', 'onejsonfile.jsonl.backup');

  // Check for API key
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_API_KEY environment variable is required');
    process.exit(1);
  }

  console.log('Starting JSONL format fix...');

  // Create backup
  await fs.copyFile(jsonlPath, backupPath);
  console.log('Created backup at onejsonfile.jsonl.backup');

  // Read the JSONL file
  const content = await fs.readFile(jsonlPath, 'utf8');
  const lines = content.trim().split('\n');

  console.log(`Processing ${lines.length} questions...`);

  const generator = new GeminiOptionsGenerator(apiKey);
  const updatedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      const entry: JsonlEntry = JSON.parse(line);

      // Extract topic from input (format: "Topic: TopicName")
      const topicMatch = entry.input.match(/Topic:\s*(.+)$/);
      if (!topicMatch) {
        console.warn(`Skipping line ${i + 1}: Could not extract topic from "${entry.input}"`);
        updatedLines.push(line);
        continue;
      }

      const topicDisplayName = topicMatch[1].trim();
      const topic = DISPLAY_TO_ENUM[topicDisplayName];

      if (!topic) {
        console.warn(`Skipping line ${i + 1}: Unknown topic "${topicDisplayName}"`);
        updatedLines.push(line);
        continue;
      }

      console.log(`Processing question ${i + 1}/${lines.length}: ${topicDisplayName}`);

      // Generate options using Gemini
      const result = await generator.generateOptions(entry.output, topic);

      // Create updated entry with proper format
      const updatedEntry = {
        instruction: entry.instruction,
        input: entry.input,
        output: {
          questionText: result.questionText,
          options: result.options,
          correctAnswer: result.correctAnswer,
          topic: topic,
          formatted: true
        }
      };

      updatedLines.push(JSON.stringify(updatedEntry));

    } catch (error) {
      console.error(`Error processing line ${i + 1}:`, error);
      // Keep original line on error
      updatedLines.push(line);
    }

    // Add delay to avoid rate limiting
    if (i < lines.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Write back to file
  const newContent = updatedLines.join('\n') + '\n';
  await fs.writeFile(jsonlPath, newContent, 'utf8');

  console.log('JSONL format fix completed!');
  console.log(`Processed ${lines.length} questions`);
  console.log('Original file backed up as onejsonfile.jsonl.backup');
}

// Run the script
if (require.main === module) {
  fixJsonlFormat().catch(console.error);
}

export { fixJsonlFormat };