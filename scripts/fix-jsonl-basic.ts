#!/usr/bin/env npx tsx

/**
 * Script to fix JSONL storage format by adding basic multiple choice structure
 * This version creates placeholder options that can be refined later with Gemini
 */

import { promises as fs } from 'fs';
import { join } from 'path';
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

interface FormattedQuestion {
  questionText: string;
  options: string[];
  correctAnswer: string;
  topic: IBPhysicsSubtopic;
  formatted: boolean;
  needsGeminiRefinement: boolean;
}

/**
 * Generate basic multiple choice options for a question
 * These are placeholder options that should be refined with Gemini later
 */
function generateBasicOptions(questionText: string, topic: IBPhysicsSubtopic): {
  questionText: string;
  options: string[];
  correctAnswer: string;
} {
  // For now, create generic options based on common physics answer patterns
  // These should be replaced with proper Gemini-generated options

  const options = [
    'A) 10 m/s',
    'B) 20 m/s',
    'C) 5 m/s',
    'D) 15 m/s'
  ];

  // Default to option B as "correct" - this is just a placeholder
  const correctAnswer = 'B';

  return {
    questionText,
    options,
    correctAnswer
  };
}

async function fixJsonlBasicFormat() {
  const jsonlPath = join(process.cwd(), 'data', 'onejsonfile.jsonl');
  const backupPath = join(process.cwd(), 'data', 'onejsonfile.jsonl.backup');

  console.log('Starting basic JSONL format fix...');

  // Create backup
  await fs.copyFile(jsonlPath, backupPath);
  console.log('Created backup at onejsonfile.jsonl.backup');

  // Read the JSONL file
  const content = await fs.readFile(jsonlPath, 'utf8');
  const lines = content.trim().split('\n');

  console.log(`Processing ${lines.length} questions...`);

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

      // Generate basic options
      const result = generateBasicOptions(entry.output, topic);

      // Create updated entry with proper format
      const updatedEntry = {
        instruction: entry.instruction,
        input: entry.input,
        output: {
          questionText: result.questionText,
          options: result.options,
          correctAnswer: result.correctAnswer,
          topic: topic,
          formatted: true,
          needsGeminiRefinement: true
        } as FormattedQuestion
      };

      updatedLines.push(JSON.stringify(updatedEntry));

    } catch (error) {
      console.error(`Error processing line ${i + 1}:`, error);
      // Keep original line on error
      updatedLines.push(line);
    }
  }

  // Write back to file
  const newContent = updatedLines.join('\n') + '\n';
  await fs.writeFile(jsonlPath, newContent, 'utf8');

  console.log('Basic JSONL format fix completed!');
  console.log(`Processed ${lines.length} questions`);
  console.log('Original file backed up as onejsonfile.jsonl.backup');
  console.log('');
  console.log('NOTE: The questions now have basic multiple choice structure, but the options are placeholders.');
  console.log('To get properly refined options using Gemini 2.0, run the fix-jsonl-format.ts script with a valid GOOGLE_API_KEY.');
}

// Run the script
if (require.main === module) {
  fixJsonlBasicFormat().catch(console.error);
}

export { fixJsonlBasicFormat };