"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, RefreshCw, Settings, BarChart } from "lucide-react"
import { TopicSelector } from "./topic-selector"
import { QuestionDisplay } from "./question-display"
import { GenerationProgress } from "./generation-progress"
import { ServiceStatus } from "./service-status"
import { GeneratedQuestion, QuestionGenerationResponse } from "@/lib/types/question-generation"

interface GenerationState {
  stage: 'idle' | 'generating' | 'refining' | 'validating' | 'complete' | 'error'
  progress: number
  message: string
  estimatedTime?: number
}

interface ServiceHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  services: {
    llama: 'healthy' | 'unhealthy'
    gemini: 'healthy' | 'unhealthy'
    validation: 'healthy' | 'unhealthy'
  }
  details: string[]
}

export function EnhancedMainContent() {
  const [selectedTopic, setSelectedTopic] = useState<string>("")

  const [questionType, setQuestionType] = useState<"multiple-choice" | "long-answer">("multiple-choice")
  const [generationState, setGenerationState] = useState<GenerationState>({
    stage: 'idle',
    progress: 0,
    message: 'Ready to generate questions'
  })
  const [currentQuestion, setCurrentQuestion] = useState<GeneratedQuestion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [generationHistory, setGenerationHistory] = useState<GeneratedQuestion[]>([])

  // Check service health on component mount
  useEffect(() => {
    checkServiceHealth()
  }, [])

  const checkServiceHealth = async () => {
    try {
      const response = await fetch("/api/generate-question?action=health")
      if (response.ok) {
        const health: ServiceHealth = await response.json()
        setServiceHealth(health)
      }
    } catch (error) {
      console.error("Failed to check service health:", error)
    }
  }

  const startActualTimer = () => {
    const startTime = Date.now()
    const selectedModel = localStorage.getItem('gemini_model') || 'gemini-2.5-pro'
    const isFlashModel = selectedModel === 'gemini-2.5-flash'

    setGenerationState({
      stage: 'generating',
      progress: 10,
      message: 'Generating question with fine-tuned Llama model...'
    })

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const seconds = Math.floor(elapsed / 1000)

      // Update progress based on elapsed time, but don't complete until backend responds
      if (seconds < 3) {
        setGenerationState({
          stage: 'generating',
          progress: Math.min(30, 10 + (seconds * 5)),
          message: 'Generating question with fine-tuned Llama model...'
        })
      } else if (seconds < 8) {
        setGenerationState({
          stage: 'refining',
          progress: Math.min(70, 30 + ((seconds - 3) * 10)),
          message: `Refining question with ${isFlashModel ? 'Gemini 2.5 Flash' : 'Gemini 2.5 Pro'} for accuracy...`
        })
      } else {
        setGenerationState({
          stage: 'validating',
          progress: Math.min(90, 70 + ((seconds - 8) * 5)),
          message: 'Validating physics accuracy and IB compliance...'
        })
      }
    }, 500) // Update every 500ms for smoother progress

    return interval
  }

  const generateQuestion = async () => {
    if (!selectedTopic) {
      setError("Please select a topic first")
      return
    }

    // Check for API key (allow owner-fallback when enabled in server settings)
    const openRouterApiKey = localStorage.getItem('openrouter_api_key')
    const refinementProvider = localStorage.getItem('refinement_provider') || 'openrouter'
    
    // For this version, always allow generation since backend will use .env.example API key as fallback
    // No need to check for API keys on frontend - backend handles fallback logic

    // Reset timer and generation state before starting new generation
    setError(null)
    setGenerationState({ stage: 'idle', progress: 0, message: 'Ready to generate questions' })

    // Small delay to ensure state reset is visible
    await new Promise(resolve => setTimeout(resolve, 100))

    setGenerationState({ stage: 'generating', progress: 0, message: 'Starting generation...', estimatedTime: 15 })

    // Start actual timer that will run until backend responds
    const progressInterval = startActualTimer()

    try {
      const bodyPayload: Record<string, any> = {
        topic: selectedTopic,
        difficulty: "standard", // Always use standard since difficulty is defined in topic selection
        type: questionType,
        refinementProvider: refinementProvider
      };
      
      // Include API keys based on selected provider
      if (openRouterApiKey && refinementProvider === 'openrouter') {
        bodyPayload.openRouterApiKey = openRouterApiKey;
      }

      const response = await fetch("/api/generate-question", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
      })

      clearInterval(progressInterval)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate question")
      }

      const body = await response.json()

      // Support two shapes:
      // 1) { success: true, question: GeneratedQuestion, formatted: {...} }
      // 2) legacy: GeneratedQuestion directly
      let questionObj: any = null;
      let formatted: any = null;
      if (body && typeof body === 'object') {
        if (body.success && body.question) {
          questionObj = body.question;
          formatted = body.formatted || null;
        } else if (body.question && body.question.question) {
          // Sometimes nested differently
          questionObj = body.question;
          formatted = body.formatted || null;
        } else if (body.question && body.success === undefined) {
          // If backend accidentally sent just { question, formatted }
          questionObj = body.question;
          formatted = body.formatted || null;
        } else {
          // Legacy or direct GeneratedQuestion
          questionObj = body;
        }

        // If the backend also provided a 'formatted' representation, prefer it for display.
        // formatted: { question, options: [...], correct: number, ... }
        // Apply a safe override so the UI shows the Gemini-refined content when available.
        if (formatted) {
          try {
            if (formatted.question && typeof formatted.question === 'string') {
              questionObj.questionText = String(formatted.question);
            }

            if (Array.isArray(formatted.options) && formatted.options.length > 0) {
              // Ensure options are displayed with A), B), etc.
              questionObj.options = formatted.options.map((opt: string, idx: number) =>
                `${String.fromCharCode(65 + idx)}) ${opt}`
              );
            }

            if (typeof formatted.correct === 'number' && Number.isFinite(formatted.correct)) {
              questionObj.correctAnswer = String.fromCharCode(65 + formatted.correct);
            }
          } catch (err) {
            console.warn('[EnhancedMainContent] Failed to apply formatted override:', err);
          }
        }
      }

      if (!questionObj || !questionObj.questionText) {
        throw new Error((body && body.error && body.error.message) ? body.error.message : "Failed to generate question")
      }

      // If formatted object is present, prefer its 'correct' numeric index → convert to letter
      if (formatted && typeof formatted.correct === 'number' && (!questionObj.correctAnswer || questionObj.correctAnswer.length === 0)) {
        const idx = formatted.correct;
        questionObj.correctAnswer = String.fromCharCode(65 + idx);
      }

      // Clear the progress interval now that we have the actual result
      clearInterval(progressInterval)

      setCurrentQuestion(questionObj as any)
      setGenerationHistory(prev => [questionObj as any, ...prev.slice(0, 4)]) // Keep last 5 questions

      // Mark that user has completed their first generation
      localStorage.setItem('has_generated_question', 'true')

      // Use actual processing time from backend metadata
      const actualProcessingTime = questionObj.metadata?.processingTime || 0
      const timeInSeconds = Math.ceil(actualProcessingTime / 1000)
      
      let refinementServiceName = 'DeepSeek Chat v3.1:free (OpenRouter)'

      setGenerationState({
        stage: 'complete',
        progress: 100,
        message: `Generated in ${timeInSeconds}s using full Llama + ${refinementServiceName} pipeline`
      })

    } catch (err: unknown) {
      clearInterval(progressInterval)
      const errorMessage = (err as Error)?.message || "Failed to generate question. Please try again."
      setError(errorMessage)
      setGenerationState({
        stage: 'error',
        progress: 0,
        message: errorMessage
      })
      console.error("Error:", err)
    }
  }

  const retryGeneration = () => {
    setError(null)
    generateQuestion()
  }

  const isGenerating = ['generating', 'refining', 'validating'].includes(generationState.stage)

  return (
    <main id="main-content" className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Main Generation Panel */}
        <div className="lg:col-span-3">
          <Card className="h-full card-gradient border-border/50 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-card/95 to-card/85 rounded-t-lg border-b border-border/30">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl text-foreground font-semibold">
                    AI Physics Question Generator
                  </CardTitle>
                  <p className="text-muted-foreground mt-1">
                    Generate IB Physics questions using advanced AI models
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open('/settings', '_blank')}
                    className="hover:bg-primary/10 hover:text-primary transition-all duration-200 rounded-lg"
                    title="Open Settings (OpenRouter & API Keys)"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="hover:bg-primary/10 hover:text-primary transition-all duration-200 rounded-lg"
                    title="Quick Settings"
                  >
                    <BarChart className="h-4 w-4" />
                  </Button>
                  <ServiceStatus health={serviceHealth} onRefresh={checkServiceHealth} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Configuration Section */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Topic Selection */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Physics Topic</label>
                    <TopicSelector
                      value={selectedTopic}
                      onValueChange={setSelectedTopic}
                      disabled={isGenerating}
                      questionType={questionType}
                    />
                  </div>

                  {/* Question Type Selection */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Question Type</label>
                    <Select
                      value={questionType}
                      onValueChange={(value: "multiple-choice" | "long-answer") => setQuestionType(value)}
                      disabled={isGenerating}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="multiple-choice">Multiple Choice (Paper 1)</SelectItem>
                        <SelectItem value="long-answer" disabled>
                          <div className="flex items-center justify-between w-full">
                            <span className="opacity-50">Long Answer (Paper 2)</span>
                            <Badge variant="outline" className="text-xs ml-2 opacity-50">Coming Soon</Badge>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Quick Settings */}
                {showAdvanced && (
                  <Card className="p-4 card-gradient border-border/20 shadow-lg">
                    <h4 className="font-medium mb-3 text-foreground">
                      Quick Settings
                    </h4>
                    <div className="space-y-4">
                      {/* OpenRouter API Key Configuration */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-green-600 dark:text-green-400">OpenRouter API Key (Default & Recommended)</label>
                        <div className="space-y-2">
                          <input
                            type="password"
                            placeholder="Enter your OpenRouter API key..."
                            className="w-full px-3 py-2 text-sm border border-green-300 rounded-md bg-card focus:ring-2 focus:ring-green-200 focus:border-green-400 transition-all"
                            onChange={(e) => {
                              // Store in localStorage for development
                              if (e.target.value) {
                                localStorage.setItem('openrouter_api_key', e.target.value);
                              }
                            }}
                          />
                          <div className="text-xs text-muted-foreground space-y-1 p-3 rounded-lg bg-green-50/50 border border-green-200/50 dark:bg-green-950/20 dark:border-green-800/30">
                            <p><strong className="text-green-700 dark:text-green-400">✨ Default & Free!</strong> DeepSeek Chat v3.1:free is now the default refinement model.</p>
                            <p><strong>Why OpenRouter is now default:</strong> Reliable, free, and no API issues!</p>
                            <p><strong>How to get your free key:</strong></p>
                            <ol className="list-decimal list-inside space-y-1 ml-2">
                              <li>Visit <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 hover:underline transition-colors">openrouter.ai</a></li>
                              <li>Sign up with email, GitHub, or Google</li>
                              <li>Go to <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 hover:underline transition-colors">API Keys page</a></li>
                              <li>Create a new key and copy it here</li>
                            </ol>
                            <p><strong>Benefits:</strong> No cost, high quality, same refinement prompts, no empty responses!</p>
                            <p className="text-green-600 dark:text-green-400"><strong>For full settings:</strong> <a href="/settings" target="_blank" className="text-primary hover:text-primary/80 hover:underline transition-colors">Visit Settings Page</a></p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Gemini Model Selection */}
                      <div className="border-t pt-4">
                        <h5 className="text-sm font-medium mb-3">AI Model Configuration</h5>
                        <div className="space-y-4">
                          {/* Refinement Provider Selection */}
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Refinement Provider</label>
                            <Select
                              value={localStorage.getItem('refinement_provider') || 'openrouter'}
                              onValueChange={(value) => {
                                console.log('Refinement provider changed to:', value);
                                localStorage.setItem('refinement_provider', value);
                                // Force re-render by updating state
                                setGenerationState(prev => ({ ...prev }));
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select refinement provider" />
                              </SelectTrigger>
                              <SelectContent className="z-50">
                                <SelectItem value="openrouter" className="cursor-pointer">
                                  <div className="flex flex-col py-1">
                                    <span className="font-medium text-green-600 dark:text-green-400">OpenRouter (DeepSeek v3.1:free)</span>
                                    <span className="text-xs text-muted-foreground">100% Free, high quality, reliable</span>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Choose which AI service refines questions from Llama.
                            </p>
                          </div>
                          
                          {/* System Status */}
                          <div className="border-t pt-4">
                            <h5 className="text-sm font-medium mb-2">System Status</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              <div className="flex items-center justify-between">
                                <span>Question Refinement</span>
                                <Badge variant="secondary">
                                  OpenRouter (DeepSeek)
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Quality Validation</span>
                                <Badge variant="secondary">Enabled</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Fallback Mode</span>
                                <Badge variant="outline">Auto</Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Model Pipeline</span>
                                <Badge variant="outline">Llama + OpenRouter</Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                )}
              </div>

              {/* Generation Button */}
              <div className="flex gap-3">
                <Button
                  className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground font-medium shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  disabled={!selectedTopic || isGenerating}
                  onClick={generateQuestion}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      Generate {questionType === "multiple-choice" ? "MCQ" : "Long Answer"} Question
                    </>
                  )}
                </Button>

                {error && (
                  <Button
                    variant="outline"
                    onClick={retryGeneration}
                    className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:border-destructive/50 transition-all duration-300 shadow-sm hover:shadow-md"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Progress Indicator */}
              {(isGenerating || generationState.stage === 'complete') && (
                <GenerationProgress state={generationState} />
              )}

              {/* Error Display */}
              {error && (
                <Alert variant="destructive" className="border-destructive/50 bg-destructive/5 shadow-sm">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    {error.includes("API key") ? (
                      <div>
                        <strong className="text-destructive font-semibold">API Key Required:</strong> Please add your OpenRouter API key in Quick Settings above to generate questions.
                      </div>
                    ) : error.includes("rate limit") ? (
                      <div>
                        <strong className="text-destructive font-semibold">Too many requests:</strong> Please wait a moment before generating another question.
                      </div>
                    ) : (
                      <div>
                        <strong className="text-destructive font-semibold">Error:</strong> {error}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Question Display */}
              <QuestionDisplay 
                question={currentQuestion} 
                isLoading={isGenerating}
                onRegenerate={generateQuestion}
              />
            </CardContent>
          </Card>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <Card className="card-gradient border-border/20 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-card/50 to-card/30 rounded-t-lg">
              <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                <BarChart className="h-5 w-5 text-primary" />
                Session Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Questions Generated</span>
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                  {generationHistory.length}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Current Topic</span>
                <Badge variant="outline" className="text-xs border-border/50 bg-card">
                  {selectedTopic || "None"}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Question Type</span>
                <Badge variant="outline" className="text-xs border-border/50 bg-card">
                  {questionType === "multiple-choice" ? "MCQ" : "Long Answer"}
                </Badge>
              </div>
              {currentQuestion?.metadata && (
                <div className="flex justify-between text-sm">
                  <span>Last Generation</span>
                  <Badge variant="outline" className="text-xs border-border/50 bg-card">
                    {currentQuestion.metadata.processingTime}ms
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Questions */}
          {generationHistory.length > 0 && (
            <Card className="card-gradient border-border/20 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-card/50 to-card/30 rounded-t-lg">
                <CardTitle className="text-lg text-foreground">
                  Recent Questions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {generationHistory.slice(0, 3).map((question, index) => (
                  <div
                    key={index}
                    className="p-3 border border-border/20 rounded-lg cursor-pointer hover:bg-primary/5 hover:border-primary/30 transition-all duration-300 bg-card"
                    onClick={() => setCurrentQuestion(question)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-xs">
                        {question.type === "multiple-choice" ? "MCQ" : "Long"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{question.topic}</span>
                    </div>
                    <p className="text-sm line-clamp-2">{question.questionText}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Help & Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• With the right usage, this website is completely free!</p>
              <p>• Select specific topics for more targeted questions</p>
              <p>• Option topics are only available for long-answer questions</p>
              <p>• Long-answer questions coming soon - currently MCQ only</p>
              <p>• Questions are refined using OpenRouter (DeepSeek) for accuracy</p>
              <p>• Generation typically takes 10-15 seconds</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}