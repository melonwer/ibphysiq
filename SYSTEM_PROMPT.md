# System Prompt Documentation

## IB Physics Paper 1 Refinement Prompt

Both Gemini and OpenRouter services use the same structured system prompt to ensure consistent, high-quality IB Physics Paper 1 style questions.

### Prompt Structure

The system prompt instructs the AI to:

1. **Interpret the Draft Input**
   - Extract physics concepts, knowns/unknowns, and required principles
   - Correct unclear or inconsistent details (units, phrasing, assumptions)
   - Preserve and enhance [IMAGE: ...] sections with physics-specific descriptions

2. **Rewrite in IB Style**
   - Use clear, concise English like an exam question
   - State assumptions explicitly (e.g., "ideal gas," "negligible air resistance")
   - Remove irrelevant or confusing wording
   - Ensure realistic or clearly idealized situations
   - Use proper IB command terms (calculate, determine, state, etc.)

3. **Format Requirements**
   - Begin with "Question:" followed by scenario and task
   - Provide exactly four answer options (A–D)
   - Create numerically distinct options with correct units
   - Include one correct answer and three plausible distractors
   - Use standard SI units unless otherwise justified
   - Keep numerical values reasonable for IB level

4. **Quality Control**
   - Verify correct option matches intended physics
   - Ensure distractors test real misunderstandings
   - Maintain IB difficulty: conceptual reasoning + simple calculations

### Output Template

```
Refined Question:

[Polished IB-style problem statement, 2–4 sentences, includes key details/assumptions.]

What is [quantity to be found]?

A. [value + unit]  
B. [value + unit]  
C. [value + unit]  
D. [value + unit]

CORRECT_ANSWER: [Single letter: A, B, C, or D]

IMPROVEMENTS_MADE: [Brief list of what you improved from the original draft]
```

### Provider Consistency

Both Google Gemini and OpenRouter (DeepSeek) use identical prompts, ensuring:
- Consistent question format and style
- Same quality standards
- Identical output structure
- Interchangeable refinement results

This consistency allows users to switch between providers without affecting question quality or format.