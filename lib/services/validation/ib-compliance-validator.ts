/**
 * IB Physics compliance validation for generated questions
 */

import {
  RefinedQuestion,
  ComplianceValidationResult,
  ValidationError,
  ValidationWarning,
  IBPhysicsSubtopic,
  QuestionDifficulty
} from '../../types/question-generation';
import { TOPIC_CONTEXTS, TOPIC_DISPLAY_NAMES } from '../../constants/ib-physics-topics';

/**
 * Words that carry no topic signal: ordinary function words plus the
 * boilerplate that every `TOPIC_CONTEXTS` entry is written with.
 */
const TOPIC_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
  'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'as', 'into', 'its', 'it', 'this', 'that', 'these', 'those', 'their',
  'between', 'more', 'most', 'than', 'then', 'when', 'where', 'which',
  'while', 'also', 'such', 'from', 'not', 'only',
  // Instruction boilerplate used to describe topics.
  'focus', 'include', 'including', 'cover', 'advanced', 'based'
]);

/**
 * How many distinct topic concepts a question is expected to engage before it
 * counts as fully relevant. Short questions legitimately touch only one or two
 * concepts, so requiring coverage of the whole topic would be unrealistic.
 */
const CONCEPTS_FOR_FULL_RELEVANCE = 2;

export class IBComplianceValidator {
  /**
   * Reduce a word to a comparable stem so `acceleration`, `accelerates` and
   * `accelerating` all match, and `orbits` matches `orbital`.
   *
   * Both sides of a comparison run through this, so consistency matters more
   * than linguistic correctness.
   */
  private static stemWord(word: string): string {
    return word
      .replace(/(ations|ation|ating|ated|ates|ate)$/, 'at')
      .replace(/ies$/, 'y')
      .replace(/(ions|ion)$/, 'ion')
      .replace(/(ally|al)$/, 'al')
      .replace(/(ing|ers|er|ed|es|s)$/, '');
  }

  /**
   * Extract the distinct content words of a passage, deduplicated by stem.
   */
  private static contentTerms(text: string): string[] {
    const terms: string[] = [];
    const seenStems = new Set<string>();

    for (const word of IBComplianceValidator.tokenize(text)) {
      const stem = IBComplianceValidator.stemWord(word);
      if (stem.length === 0 || seenStems.has(stem)) continue;
      seenStems.add(stem);
      terms.push(word);
    }

    return terms;
  }

  private static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !TOPIC_STOPWORDS.has(word));
  }

  /**
   * Validates IB Physics curriculum compliance
   */
  validateIBCompliance(question: RefinedQuestion): ComplianceValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Validate topic relevance
    const topicRelevance = this.validateTopicRelevance(question, warnings, suggestions);
    
    // Validate difficulty level
    const difficultyLevel = this.validateDifficultyLevel(question, warnings, suggestions);
    
    // Validate IB question style
    const ibCompliant = this.validateIBQuestionStyle(question, errors, warnings, suggestions);
    
    // Validate curriculum alignment
    this.validateCurriculumAlignment(question, warnings, suggestions);
    
    // Consider a question valid wrt IB compliance when there are no explicit errors.
    // Topic relevance is reported as a warning/suggestion rather than a hard failure,
    // so we don't block refinement solely for lower topicRelevance scores.
    const isValid = errors.length === 0;

    return {
      isValid,
      errors,
      warnings,
      suggestions,
      ibCompliant,
      difficultyLevel,
      topicRelevance
    };
  }

  private validateTopicRelevance(
    question: RefinedQuestion, 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ): number {
    const topicKeywords = IBComplianceValidator.contentTerms(TOPIC_CONTEXTS[question.topic]);
    const questionStems = new Set(
      IBComplianceValidator.tokenize(question.questionText)
        .map(IBComplianceValidator.stemWord)
    );

    const matchedTerms = topicKeywords.filter(term =>
      questionStems.has(IBComplianceValidator.stemWord(term))
    );

    // Word overlap cannot grade relevance finely: a well-targeted question that
    // touches one or two concepts scores just as low as an off-topic one under
    // a set-similarity metric, because the topic description itself contributes
    // most of the vocabulary. So the score answers a narrower question that the
    // signal really supports -- does the question engage any concept of this
    // topic at all -- and then rises with the number of distinct concepts
    // matched, saturating at CONCEPTS_FOR_FULL_RELEVANCE.
    const relevanceScore = matchedTerms.length === 0
      ? 0
      : Math.min(1, 0.5 + 0.5 * (matchedTerms.length / CONCEPTS_FOR_FULL_RELEVANCE));

    if (relevanceScore < 0.5) {
      warnings.push({
        type: 'compliance',
        message: `Question may not be sufficiently relevant to ${TOPIC_DISPLAY_NAMES[question.topic]}`,
        suggestion: `Include more concepts related to: ${topicKeywords.slice(0, 3).join(', ')}`
      });
    }
    
    if (relevanceScore < 0.3) {
      suggestions.push(`Consider focusing more on ${question.topic} concepts`);
    }

    return relevanceScore;
  }

  private validateDifficultyLevel(
    question: RefinedQuestion,
    warnings: ValidationWarning[],
    _suggestions: string[]
  ): QuestionDifficulty {
    const questionText = question.questionText.toLowerCase();
    
    // Indicators of higher-level questions
    const hlIndicators = [
      'derive', 'explain', 'analyze', 'evaluate', 'compare', 'contrast',
      'discuss', 'justify', 'predict', 'suggest', 'outline',
      'complex', 'advanced', 'detailed', 'comprehensive'
    ];
    
    // Indicators of standard-level questions
    const slIndicators = [
      'calculate', 'determine', 'find', 'state', 'identify', 'list',
      'define', 'describe', 'simple', 'basic', 'straightforward'
    ];
    
    const hlCount = hlIndicators.filter(indicator => questionText.includes(indicator)).length;
    const slCount = slIndicators.filter(indicator => questionText.includes(indicator)).length;
    
    // Check if topic is HL-only
    const hlOnlyTopics = [
      IBPhysicsSubtopic.RIGID_BODY_MECHANICS,
      IBPhysicsSubtopic.GALILEAN_SPECIAL_RELATIVITY,
      IBPhysicsSubtopic.THERMODYNAMICS,
      IBPhysicsSubtopic.INDUCTION,
      IBPhysicsSubtopic.QUANTUM_PHYSICS
    ];
    
    if (hlOnlyTopics.includes(question.topic)) {
      if (slCount > hlCount) {
        warnings.push({
          type: 'compliance',
          message: 'HL-only topic should have higher-level question complexity',
          suggestion: 'Consider adding more analytical or evaluative elements'
        });
      }
      return 'higher';
    }
    
    // Determine difficulty based on indicators
    if (hlCount > slCount) {
      return 'higher';
    } else {
      return 'standard';
    }
  }

  private validateIBQuestionStyle(
    question: RefinedQuestion, 
    errors: ValidationError[], 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ): boolean {
    const isCompliant = true;
    const questionText = question.questionText;
    
    // Check for IB-style language
    this.validateIBLanguage(questionText, warnings, suggestions);
    
    // Check for proper question structure
    this.validateQuestionStructure(question, warnings, suggestions);
    
    // Check for appropriate complexity
    this.validateComplexity(question, warnings, suggestions);
    
    // Check for data booklet references if applicable
    this.validateDataBookletUsage(questionText, warnings, suggestions);
    
    return isCompliant;
  }

  private validateIBLanguage(
    questionText: string, 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ): void {
    // IB Physics commonly uses specific terminology
    const ibTerminology = [
      'determine', 'calculate', 'state', 'outline', 'explain', 'discuss',
      'suggest', 'predict', 'estimate', 'identify', 'describe'
    ];
    
    const hasIBTerminology = ibTerminology.some(term => 
      questionText.toLowerCase().includes(term)
    );
    
    if (!hasIBTerminology) {
      suggestions.push('Consider using IB command terms like "determine", "calculate", or "explain"');
    }
    
    // Check for overly casual language
    const casualTerms = ['find out', 'figure out', 'work out', 'get'];
    const hasCasualLanguage = casualTerms.some(term => 
      questionText.toLowerCase().includes(term)
    );
    
    if (hasCasualLanguage) {
      warnings.push({
        type: 'compliance',
        message: 'Question uses casual language not typical of IB Physics',
        suggestion: 'Use more formal IB command terms'
      });
    }
  }

  private validateQuestionStructure(
    question: RefinedQuestion, 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ): void {
    const questionText = question.questionText;
    
    // Check for context setting (IB questions often provide context)
    if (questionText.length < 50) {
      warnings.push({
        type: 'compliance',
        message: 'Question may lack sufficient context',
        suggestion: 'IB questions typically provide more background information'
      });
    }
    
    // Check for multiple parts (common in IB)
    const hasMultipleParts = /\([a-z]\)|\(i\)|\(1\)/.test(questionText);
    if (!hasMultipleParts && questionText.length > 200) {
      suggestions.push('Consider breaking complex questions into multiple parts (a), (b), etc.');
    }
    
    // Check for proper scientific notation
    const hasScientificNotation = /\d+\.?\d*\s*×\s*10\^?-?\d+/.test(questionText);
    const hasLargeNumbers = /\d{6,}/.test(questionText);
    
    if (hasLargeNumbers && !hasScientificNotation) {
      suggestions.push('Consider using scientific notation for large numbers');
    }
  }

  private validateComplexity(
    question: RefinedQuestion, 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ): void {
    const questionText = question.questionText;
    
    // Check for appropriate mathematical complexity
    const hasMath = /\d+\.?\d*/.test(questionText);
    const hasFormulas = /[a-zA-Z]\s*=/.test(questionText);
    const hasCalculation = questionText.toLowerCase().includes('calculate');
    
    if (hasCalculation && !hasMath) {
      warnings.push({
        type: 'compliance',
        message: 'Calculation question should include numerical values',
        suggestion: 'Provide specific values for calculation'
      });
    }
    
    // Check for conceptual depth
    const conceptualWords = [
      'because', 'therefore', 'however', 'although', 'since', 'due to',
      'relationship', 'principle', 'theory', 'law', 'effect'
    ];
    
    const hasConceptualDepth = conceptualWords.some(word => 
      questionText.toLowerCase().includes(word)
    );
    
    if (questionText.length > 100 && !hasConceptualDepth) {
      suggestions.push('Consider adding conceptual elements to enhance question depth');
    }
  }

  private validateDataBookletUsage(
    questionText: string, 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ): void {
    // Common constants that should reference data booklet
    const dataBookletConstants = [
      'speed of light', 'planck constant', 'avogadro constant',
      'gravitational constant', 'elementary charge', 'mass of electron'
    ];
    
    const mentionsConstants = dataBookletConstants.some(constant => 
      questionText.toLowerCase().includes(constant)
    );
    
    if (mentionsConstants && !questionText.includes('data booklet')) {
      suggestions.push('Consider referencing the IB Physics data booklet for constants');
    }
    
    // Check for values that should be in data booklet
    const specificValues = [
      '3.00 × 10⁸', '6.63 × 10⁻³⁴', '6.02 × 10²³', '9.81'
    ];
    
    const hasSpecificValues = specificValues.some(value => 
      questionText.includes(value)
    );
    
    if (hasSpecificValues) {
      suggestions.push('Values like these are typically provided in the IB data booklet');
    }
  }

  private validateCurriculumAlignment(
    question: RefinedQuestion, 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ): void {
    // Check for cross-topic connections (encouraged in IB)
    const topicConnections = this.identifyTopicConnections(question);
    
    if (topicConnections.length > 0) {
      suggestions.push(`Question connects to: ${topicConnections.join(', ')} - good for IB integration`);
    }
    
    // Check for real-world applications (valued in IB)
    const realWorldIndicators = [
      'satellite', 'car', 'building', 'power plant', 'medical', 'technology',
      'environment', 'energy', 'climate', 'space', 'communication'
    ];
    
    const hasRealWorldContext = realWorldIndicators.some(indicator => 
      question.questionText.toLowerCase().includes(indicator)
    );
    
    if (hasRealWorldContext) {
      suggestions.push('Good use of real-world context - aligns with IB philosophy');
    } else if (question.questionText.length > 100) {
      suggestions.push('Consider adding real-world context to enhance IB alignment');
    }
  }

  // Helper methods

  private identifyTopicConnections(question: RefinedQuestion): string[] {
    const questionText = question.questionText.toLowerCase();
    const connections: string[] = [];
    
    // Check for connections to other topics
    const topicKeywords: Record<string, string[]> = {
      'Energy': ['energy', 'work', 'power', 'joule', 'watt'],
      'Forces': ['force', 'newton', 'acceleration', 'mass'],
      'Waves': ['wave', 'frequency', 'wavelength', 'amplitude'],
      'Electricity': ['current', 'voltage', 'resistance', 'circuit'],
      'Fields': ['field', 'gravitational', 'electric', 'magnetic']
    };
    
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some(keyword => questionText.includes(keyword))) {
        connections.push(topic);
      }
    });
    
    return connections.filter(connection => connection !== question.topic);
  }
}