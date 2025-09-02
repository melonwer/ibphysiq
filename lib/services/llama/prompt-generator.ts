/**
 * Prompt generation for fine-tuned Llama model
 */

import { IBPhysicsSubtopic, QuestionDifficulty } from '../../types/question-generation';
import { TOPIC_DISPLAY_NAMES } from '../../constants/ib-physics-topics';

export class PromptGenerator {
  /**
   * Generate a question prompt for the specified topic and difficulty
   */
  static generateQuestionPrompt(topic: IBPhysicsSubtopic, _difficulty: QuestionDifficulty = 'standard'): string {
    const topicName = TOPIC_DISPLAY_NAMES[topic];
    
    if (!topicName) {
      throw new Error(`No display name found for topic: ${topic}`);
    }

    // Format the prompt to match your model's training format exactly
    return JSON.stringify({
      "instruction": "Generate an IB Physics Paper 1 style multiple-choice question.",
      "input": `Topic: ${topicName}`,
      "output": ""
    });
  }

  /**
   * Get difficulty-specific instructions
   */
  private static getDifficultyInstructions(difficulty: QuestionDifficulty): string {
    const instructions = {
      standard: `- Focus on fundamental concepts and direct applications
- Use straightforward calculations
- Include clear, unambiguous scenarios
- Test basic understanding of physics principles`,
      
      higher: `- Include more complex scenarios and multi-step problems
- Require deeper conceptual understanding
- May involve derivations or explanations
- Test analytical and evaluative skills
- Include advanced applications of physics principles`
    };

    return instructions[difficulty];
  }

  /**
   * Get topic-specific example format
   */
  private static getExampleFormat(topic: IBPhysicsSubtopic): string {
    const examples: Partial<Record<IBPhysicsSubtopic, string>> = {
      [IBPhysicsSubtopic.KINEMATICS]: `
EXAMPLE FORMAT FOR KINEMATICS:

QUESTION: A car accelerates uniformly from rest at 2.0 m/s². What is the velocity of the car after 5.0 s?

A) 5.0 m/s
B) 10.0 m/s
C) 15.0 m/s
D) 20.0 m/s

ANSWER: B`,

      [IBPhysicsSubtopic.FORCES_MOMENTUM]: `
EXAMPLE FORMAT FOR FORCES & MOMENTUM:

QUESTION: A 1500 kg car traveling at 20 m/s collides with a stationary 1000 kg car. If they stick together after collision, what is their combined velocity?

A) 8.0 m/s
B) 10.0 m/s
C) 12.0 m/s
D) 15.0 m/s

ANSWER: C`,

      [IBPhysicsSubtopic.CURRENT_CIRCUITS]: `
EXAMPLE FORMAT FOR CURRENT & CIRCUITS:

QUESTION: A 12 V battery is connected to a 4.0 Ω resistor. What is the current flowing through the circuit?

A) 2.0 A
B) 3.0 A
C) 4.0 A
D) 8.0 A

ANSWER: B`,

      [IBPhysicsSubtopic.WAVE_MODEL]: `
EXAMPLE FORMAT FOR WAVE MODEL:

QUESTION: A wave has a frequency of 50 Hz and travels at 340 m/s. What is the wavelength of this wave?

A) 6.8 m
B) 8.5 m
C) 17.0 m
D) 390 m

ANSWER: A`
    };

    return examples[topic] || `
EXAMPLE FORMAT:

QUESTION: [Physics question with numerical values and proper units]

A) [Option with units]
B) [Option with units]
C) [Option with units]
D) [Option with units]

ANSWER: [Correct letter]`;
  }

  /**
   * Generate system prompt for the fine-tuned model
   */
  static generateSystemPrompt(): string {
    return `You are an expert IB Physics teacher who creates high-quality multiple choice questions. You have been trained on 1026 IB Physics questions and understand the curriculum structure, question formats, and appropriate difficulty levels.

Your task is to generate physics questions that:
- Follow IB Physics curriculum standards
- Include proper scientific terminology and units
- Present realistic physical scenarios
- Have exactly one correct answer among four plausible options
- Are appropriate for the specified difficulty level
- Can be solved with the information provided

Always respond in the exact format requested, with clear question text and four labeled options (A, B, C, D).`;
  }

  /**
   * Generate few-shot examples for better model performance
   */
  static generateFewShotExamples(topic: IBPhysicsSubtopic): string {
    const examples = this.getTopicExamples(topic);
    
    return examples.map((example, index) => `
Example ${index + 1}:

${example}
`).join('\n');
  }

  /**
   * Get multiple examples for a specific topic
   */
  private static getTopicExamples(topic: IBPhysicsSubtopic): string[] {
    const exampleSets: Partial<Record<IBPhysicsSubtopic, string[]>> = {
      [IBPhysicsSubtopic.KINEMATICS]: [
        `QUESTION: A ball is thrown vertically upward with an initial velocity of 20 m/s. What is the maximum height reached? (g = 9.8 m/s²)

A) 15.3 m
B) 20.4 m
C) 25.5 m
D) 40.8 m

ANSWER: B`,

        `QUESTION: A car travels 100 m in 5.0 s while accelerating uniformly from rest. What is the acceleration of the car?

A) 4.0 m/s²
B) 8.0 m/s²
C) 10.0 m/s²
D) 20.0 m/s²

ANSWER: B`
      ],

      [IBPhysicsSubtopic.WORK_ENERGY_POWER]: [
        `QUESTION: A 2.0 kg object is lifted vertically through a height of 3.0 m. What is the work done against gravity? (g = 9.8 m/s²)

A) 29.4 J
B) 58.8 J
C) 19.6 J
D) 6.0 J

ANSWER: B`,

        `QUESTION: A motor does 1200 J of work in 4.0 s. What is the power output of the motor?

A) 300 W
B) 400 W
C) 1200 W
D) 4800 W

ANSWER: A`
      ]
    };

    return exampleSets[topic] || [];
  }

  /**
   * Generate prompt for model fine-tuning format
   */
  static generateTrainingPrompt(topic: IBPhysicsSubtopic, difficulty: QuestionDifficulty): string {
    return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>

${this.generateSystemPrompt()}<|eot_id|><|start_header_id|>user<|end_header_id|>

${this.generateQuestionPrompt(topic, difficulty)}<|eot_id|><|start_header_id|>assistant<|end_header_id|>

`;
  }

  /**
   * Validate generated prompt format
   */
  static validatePrompt(prompt: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!prompt.includes('TOPIC:')) {
      errors.push('Missing topic specification');
    }

    if (!prompt.includes('DIFFICULTY:')) {
      errors.push('Missing difficulty level');
    }

    if (!prompt.includes('FORMAT YOUR RESPONSE')) {
      errors.push('Missing format instructions');
    }

    if (prompt.length < 200) {
      errors.push('Prompt too short - may lack sufficient context');
    }

    if (prompt.length > 2000) {
      errors.push('Prompt too long - may exceed model context limits');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}