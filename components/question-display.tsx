"use client"

import { useState } from "react"
import ReactMarkdown from 'react-markdown'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  BookOpen, 
  Clock, 
  Check,
  RefreshCw, 
  Copy, 
  Download,
  Lightbulb,
  Zap,
  Brain,
  Loader2,
  X
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { GeneratedQuestion } from "@/lib/types/question-generation"

interface QuestionDisplayProps {
  question: GeneratedQuestion | null
  isLoading?: boolean
  onRegenerate?: () => void
}

export function QuestionDisplay({ question, isLoading = false, onRegenerate }: QuestionDisplayProps) {
  const [showSolution, setShowSolution] = useState(false)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [isGeneratingExplanation, setIsGeneratingExplanation] = useState(false)
  const [showExplanation, setShowExplanation] = useState(false)

  const generateExplanation = async () => {
    if (!question) return;
    
    setIsGeneratingExplanation(true);
    try {
      // Get API key from localStorage (set in Quick Settings)
      const apiKey = localStorage.getItem('openrouter_api_key') || localStorage.getItem('openRouterApiKey');
      
      const response = await fetch('/api/generate-explanation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-openrouter-api-key': apiKey || ''
        },
        body: JSON.stringify({
          question: question.questionText,
          options: question.options,
          correctAnswer: question.correctAnswer,
          topic: question.topic,
          openRouterApiKey: apiKey
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setExplanation(data.explanation);
        setShowExplanation(true);
      } else {
        alert('Failed to generate explanation: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error generating explanation:', error);
      alert('Failed to generate explanation. Please check your API key in Quick Settings.');
    } finally {
      setIsGeneratingExplanation(false);
    }
  };

  const copyToClipboard = async () => {
    if (!question) return;
    const text = formatQuestionForCopy(question)
    try {
      await navigator.clipboard.writeText(text)
      // Could add a toast notification here
    } catch (error) {
      console.error("Failed to copy:", error)
    }
  }

  const formatQuestionForCopy = (q: GeneratedQuestion): string => {
    let text = `Topic: ${q.topic}\n\nQuestion: ${q.questionText}\n\n`

    text += "Options:\n"
    q.options.forEach((option, index) => {
      text += `${String.fromCharCode(65 + index)}) ${option}\n`
    })
    text += `\nCorrect Answer: ${q.correctAnswer}\n\n`

    return text
  }

  const downloadQuestion = () => {
    if (!question) return;
    const text = formatQuestionForCopy(question)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `physics-question-${question.topic.toLowerCase().replace(/\s+/g, '-')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const checkAnswer = () => {
    if (selectedAnswer !== null) {
      setShowSolution(true)
    }
  }

  if (isLoading) {
    return (
      <Card className="card-gradient border-border/20 shadow-lg bg-gradient-to-br from-card/95 to-card/90">
        <CardContent className="p-12">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping"></div>
              <Loader2 className="relative h-8 w-8 animate-spin text-primary" />
            </div>
            <div className="text-center space-y-2">
              <span className="text-lg font-medium text-foreground">Generating your question...</span>
              <p className="text-sm text-muted-foreground">This may take 20-60 seconds depending on the model you chose</p>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!question) {
    return (
      <Card className="card-gradient border-border/20 shadow-lg">
        <CardContent className="p-8">
          <div className="text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50 text-primary/50" />
            <p>No question generated yet. Select a topic and click &quot;Generate Question&quot; to get started.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Question Header */}
      <Card className="card-gradient border-border/20 shadow-lg bg-gradient-to-br from-card/95 to-card/90">
        <CardHeader className="bg-gradient-to-r from-card/60 to-card/40 rounded-t-lg border-b border-border/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="default" className="text-sm bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground font-medium shadow-sm">
                Multiple Choice
              </Badge>
              <Badge variant="outline" className="border-border/50 bg-card/80 text-foreground font-medium">{question.topic}</Badge>
              {question.metadata?.refinementApplied ? (
                <Badge variant="secondary" className="text-xs bg-gradient-to-r from-primary/10 to-accent/10 text-primary border-primary/30 font-medium">
                  <Zap className="h-3 w-3 mr-1" />
                  AI Refined
                </Badge>
              ) : question.metadata?.refinementAttempted ? (
                <Badge variant="outline" className="text-xs bg-yellow-50 text-amber-700 border-amber-200 font-medium">
                  <Zap className="h-3 w-3 mr-1" />
                  Refinement attempted — unavailable
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={generateExplanation}
                disabled={isGeneratingExplanation}
                variant="outline"
                size="sm"
                className="bg-card border-border/50 hover:bg-card transition-all duration-300"
              >
                {isGeneratingExplanation ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <BookOpen className="w-3 h-3 mr-1" />
                    Get Explanation
                  </>
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={copyToClipboard}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadQuestion}>
                <Download className="h-4 w-4" />
              </Button>
              {onRegenerate && (
                <Button variant="outline" size="sm" onClick={onRegenerate}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <h3 className="text-lg font-semibold mb-3">Question:</h3>
              <div className="text-foreground leading-relaxed">
                <ReactMarkdown 
                  components={{
                    p: ({children}) => <p className="mb-2 leading-relaxed">{children}</p>,
                    strong: ({children}) => <strong className="font-semibold">{children}</strong>,
                    em: ({children}) => <em className="italic">{children}</em>,
                    code: ({children}) => <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono">{children}</code>
                  }}
                >
                  {question.questionText}
                </ReactMarkdown>
              </div>
            </div>

            {/* MCQ Options */}
            <div className="space-y-3">
              <h4 className="font-medium">Options:</h4>
              <div className="space-y-2">
                {question.options.map((option, index) => {
                  const optionLetter = String.fromCharCode(65 + index)
                  const isCorrect = optionLetter === question.correctAnswer
                  const isSelected = selectedAnswer === optionLetter
                  const showCorrectness = showSolution
                  
                  return (
                    <button
                      key={index}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        showCorrectness
                          ? isCorrect
                            ? "border-success/60 bg-success/10 text-success-foreground"
                            : isSelected && !isCorrect
                            ? "border-destructive/60 bg-destructive/10 text-destructive-foreground"
                            : "border-border"
                          : isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => !showSolution && setSelectedAnswer(optionLetter)}
                      disabled={showSolution}
                    >
                      <div className="flex items-center justify-between">
                        <span>
                          <strong>{optionLetter})</strong> {option.replace(/^[A-D]\)\s*/, '')}
                        </span>
                        {showCorrectness && isCorrect && (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Check Answer Button */}
              {!showSolution && (
                <div className="flex gap-2">
                  <Button
                    onClick={checkAnswer}
                    disabled={selectedAnswer === null}
                    className="flex-1"
                  >
                    Check Answer
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowHint(!showHint)}
                  >
                    <Lightbulb className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Hint */}
              {showHint && !showSolution && (
                <Alert>
                  <Lightbulb className="h-4 w-4" />
                  <AlertDescription>
                    Think about the physics principles involved in {question.topic.toLowerCase()}. 
                    Consider the given values and which equations might apply.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </CardContent>
      </Card>


      {/* AI-Generated Explanation */}
      {showExplanation && explanation && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Step-by-Step Explanation
                <Badge variant="secondary" className="text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  OpenRouter (DeepSeek)
                </Badge>
              </CardTitle>
              <Button
                onClick={() => setShowExplanation(false)}
                variant="ghost"
                size="sm"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <div className="text-sm leading-relaxed">
                <ReactMarkdown 
                  components={{
                    // Custom components for better styling
                    h1: ({children}) => <h1 className="text-lg font-semibold mb-3 text-foreground">{children}</h1>,
                    h2: ({children}) => <h2 className="text-base font-medium mb-2 text-foreground">{children}</h2>,
                    h3: ({children}) => <h3 className="text-sm font-medium mb-2 text-foreground">{children}</h3>,
                    p: ({children}) => <p className="mb-3 text-foreground leading-relaxed">{children}</p>,
                    ul: ({children}) => <ul className="mb-3 ml-4 space-y-1">{children}</ul>,
                    ol: ({children}) => <ol className="mb-3 ml-4 space-y-1 list-decimal">{children}</ol>,
                    li: ({children}) => <li className="text-foreground">{children}</li>,
                    strong: ({children}) => <strong className="font-semibold text-foreground">{children}</strong>,
                    code: ({children}) => <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono">{children}</code>,
                    pre: ({children}) => <pre className="bg-muted p-3 rounded-lg overflow-x-auto text-sm font-mono mb-3">{children}</pre>
                  }}
                >
                  {explanation}
                </ReactMarkdown>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      {question.metadata && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Generated in {question.metadata.processingTime}ms</span>
                </div>
                <div className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  <span>
                    {question.metadata.refinementApplied ? "Refined" : "Original"}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div>Models: {question.metadata.modelVersions.llama.split('/').pop()} + OpenRouter (DeepSeek)</div>
                <div>{new Date(question.metadata.generatedAt).toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}