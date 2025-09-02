"use client"

import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Clock, Loader2, AlertCircle, Zap, Brain, Shield } from "lucide-react"

interface GenerationState {
  stage: 'idle' | 'generating' | 'refining' | 'validating' | 'complete' | 'error'
  progress: number
  message: string
  estimatedTime?: number
}

interface GenerationProgressProps {
  state: GenerationState
}

const STAGE_ICONS = {
  generating: Brain,
  refining: Zap,
  validating: Shield,
  complete: CheckCircle,
  error: AlertCircle,
  idle: Clock
}

const STAGE_COLORS = {
  generating: "text-primary",
  refining: "text-primary", 
  validating: "text-primary",
  complete: "text-green-500",
  error: "text-destructive",
  idle: "text-muted-foreground"
}

const STAGE_DESCRIPTIONS = {
  generating: "Using fine-tuned Llama 3.1 8B model to generate initial question based on your topic selection",
  refining: "Applying Gemini 2.5 Flash to refine question quality, fix physics errors, and improve IB compliance",
  validating: "Running comprehensive validation checks for format, physics accuracy, and curriculum alignment",
  complete: "Question generation completed successfully with all quality checks passed",
  error: "An error occurred during generation. Please try again or select a different topic",
  idle: "Ready to generate your next physics question"
}

export function GenerationProgress({ state }: GenerationProgressProps) {
   const [timeElapsed, setTimeElapsed] = useState(0)
   const [generationStartTime, setGenerationStartTime] = useState<number | null>(null)
   const [showDetails, setShowDetails] = useState(false)
   const [isFirstGeneration, setIsFirstGeneration] = useState(false)
   const [showStartupMessage, setShowStartupMessage] = useState(false)

  useEffect(() => {
    if (state.stage === 'generating' && generationStartTime === null) {
      setGenerationStartTime(Date.now())
      setTimeElapsed(0)

      // Check if this is the first generation ever
      const hasGeneratedBefore = localStorage.getItem('has_generated_question')
      if (!hasGeneratedBefore) {
        setIsFirstGeneration(true)
      }
    } else if (state.stage === 'idle') {
      setGenerationStartTime(null)
      setTimeElapsed(0)
      setShowStartupMessage(false)
      setIsFirstGeneration(false)
    }
  }, [state.stage, generationStartTime])

  useEffect(() => {
    if (generationStartTime && ['generating', 'refining', 'validating'].includes(state.stage)) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - generationStartTime) / 1000)
        setTimeElapsed(elapsed)

        // Show startup message if first generation takes more than 30 seconds
        if (isFirstGeneration && elapsed > 30 && !showStartupMessage) {
          setShowStartupMessage(true)
        }
      }, 500) // Update every 500ms for smoother display
      return () => clearInterval(interval)
    }
  }, [generationStartTime, state.stage, isFirstGeneration, showStartupMessage])

  const Icon = STAGE_ICONS[state.stage]
  const colorClass = STAGE_COLORS[state.stage]
  const isActive = ['generating', 'refining', 'validating'].includes(state.stage)

  return (
    <Card className="border-l-4 border-l-primary card-gradient border-border/20 shadow-lg bg-gradient-to-r from-card/95 to-card/90">
      <CardContent className="p-6">
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                {isActive && (
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping"></div>
                )}
                <div className="relative z-10 p-2 rounded-full bg-primary/10 border border-primary/20">
                  <Icon className={`h-5 w-5 ${colorClass} ${isActive ? 'animate-pulse' : ''}`} />
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-foreground capitalize">
                  {state.stage === 'idle' ? 'Ready' : state.stage}
                </h4>
                <p className="text-sm text-muted-foreground">{state.message}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {timeElapsed > 0 && isActive && (
                <Badge variant="outline" className="text-xs border-border/50 bg-card">
                  {timeElapsed}s elapsed
                </Badge>
              )}
              {state.stage === 'complete' && timeElapsed > 0 && (
                <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
                  {timeElapsed}s total
                </Badge>
              )}
              {state.estimatedTime && isActive && (
                <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                  ~{state.estimatedTime}s
                </Badge>
              )}
            </div>
          </div>

          {/* Startup Message for Long Generations */}
          {showStartupMessage && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center mt-0.5">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                    Server Starting Up...
                  </h4>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    When the Lightning AI doesn't use the model for a long time, it goes to sleep to save credit money. The AI models are loading for the first time. This initial generation may take up to 5 minutes (about 300 seconds), but subsequent questions will generate much faster (10-30 seconds).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {state.stage !== 'idle' && (
            <div className="space-y-3">
              <div className="relative">
                <Progress value={state.progress} className="h-4 bg-muted/30 rounded-full overflow-hidden" />
                {isActive && (
                  <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary/20 to-primary/5 rounded-full animate-pulse"></div>
                )}
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-medium">{state.progress}% complete</span>
                {state.stage === 'complete' && (
                  <span className="text-green-600 font-semibold flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    Generated successfully
                  </span>
                )}
                {state.stage === 'error' && (
                  <span className="text-destructive font-semibold flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    Generation failed
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Stage Indicators */}
          <div className="flex items-center justify-center gap-6 text-sm">
            <div className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-300 ${
              ['generating', 'refining', 'validating', 'complete'].includes(state.stage)
                ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30'
            }`}>
              <div className={`p-1 rounded-full ${
                ['generating', 'refining', 'validating', 'complete'].includes(state.stage)
                  ? 'bg-primary/20' : 'bg-muted'
              }`}>
                {state.stage === 'generating' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <CheckCircle className={`h-4 w-4 ${
                    ['generating', 'refining', 'validating', 'complete'].includes(state.stage)
                      ? 'text-primary' : 'text-muted-foreground'
                  }`} />
                )}
              </div>
              <span className={`font-medium ${
                ['generating', 'refining', 'validating', 'complete'].includes(state.stage)
                  ? 'text-primary' : 'text-muted-foreground'
              }`}>Generate</span>
            </div>

            <div className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-300 ${
              ['refining', 'validating', 'complete'].includes(state.stage)
                ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30'
            }`}>
              <div className={`p-1 rounded-full ${
                ['refining', 'validating', 'complete'].includes(state.stage)
                  ? 'bg-primary/20' : 'bg-muted'
              }`}>
                {state.stage === 'refining' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : ['validating', 'complete'].includes(state.stage) ? (
                  <CheckCircle className="h-4 w-4 text-primary" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <span className={`font-medium ${
                ['refining', 'validating', 'complete'].includes(state.stage)
                  ? 'text-primary' : 'text-muted-foreground'
              }`}>Refine</span>
            </div>

            <div className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-300 ${
              ['validating', 'complete'].includes(state.stage)
                ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30'
            }`}>
              <div className={`p-1 rounded-full ${
                ['validating', 'complete'].includes(state.stage)
                  ? 'bg-primary/20' : 'bg-muted'
              }`}>
                {state.stage === 'validating' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : state.stage === 'complete' ? (
                  <CheckCircle className="h-4 w-4 text-primary" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <span className={`font-medium ${
                ['validating', 'complete'].includes(state.stage)
                  ? 'text-primary' : 'text-muted-foreground'
              }`}>Validate</span>
            </div>
          </div>

          {/* Detailed Description */}
          <div className="pt-2 border-t">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showDetails ? 'Hide details' : 'Show details'}
            </button>
            
            {showDetails && (
              <div className="mt-2 p-3 bg-muted/30 rounded text-xs text-muted-foreground">
                {STAGE_DESCRIPTIONS[state.stage]}
                
                {state.stage === 'complete' && (
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between">
                      <span>Pipeline:</span>
                      <span>Llama 3.1 8B → Gemini 2.5 Flash</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Validation:</span>
                      <span>Format + Physics + IB Compliance</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}