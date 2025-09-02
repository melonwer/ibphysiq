import { type NextRequest, NextResponse } from "next/server";
import { createOpenRouterConfig } from "../../../lib/services/openrouter/config";
import { OpenRouterRefinementService } from "../../../lib/services/openrouter/openrouter-refinement-service";

interface ExplanationRequest {
  question: string;
  options: string[];
  correctAnswer?: string;
  topic: string;
  openRouterApiKey?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ExplanationRequest = await request.json();
    const { question, options, correctAnswer, topic, openRouterApiKey } = body;

    if (!question || !options) {
      return NextResponse.json(
        { error: "Missing required fields: question, options" },
        { status: 400 }
      );
    }

    // Get API key using the same fallback system as generate-question
    let apiKey = openRouterApiKey || request.headers.get('x-openrouter-api-key') || undefined;
    
    try {
      const openRouterConfig = createOpenRouterConfig(apiKey);
      const openRouterService = new OpenRouterRefinementService(openRouterConfig);
      
      if (!openRouterService.isAvailable()) {
        return NextResponse.json(
          { error: "OpenRouter API key not configured. Please provide your API key or configure it in settings." },
          { status: 400 }
        );
      }

      const prompt = `
Return a detailed explanation using markdown formatting for better readability:

**Topic:** ${topic}

**Question:** ${question}

**Options:**
${options.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt.replace(/^[A-D]\)\s*/, '')}`).join('\n')}

${correctAnswer ? `**Correct Answer:** ${correctAnswer}` : '**Note:** The correct answer needs to be determined through analysis.'}

Structure your response using markdown formatting as follows:

## 1. Physics Concepts
The physics principles and concepts involved in this question are:

## 2. Given Information
The data and information provided in the question:

## 3. Step-by-Step Solution
Problem-solving process:

## 4. Answer Analysis
Analysis of each option:

## 5. Key Formulas
Required equations and formulas:

## 6. Common Mistakes
Typical errors students make with this type of question:

**Instructions:**
- Use markdown headers (##) for sections
- Use **bold** for emphasis
- Use bullet points (-) for lists
- Use \`code\` for formulas and variables
- Use proper line breaks for readability
- Start directly with "## 1. Physics Concepts"
`;

      const explanation = await openRouterService.generateExplanation(prompt);

      return NextResponse.json({
        explanation,
        success: true
      });

    } catch (configError) {
      return NextResponse.json(
        { error: "Failed to initialize OpenRouter service: " + (configError instanceof Error ? configError.message : 'Unknown error') },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Explanation generation error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate explanation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}