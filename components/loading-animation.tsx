"use client"

import { Loader2, Zap, Brain, BookOpen } from "lucide-react"

interface LoadingAnimationProps {
  message?: string
  stage?: 'generating' | 'refining' | 'validating' | 'complete'
}

export function LoadingAnimation({ message = "Loading...", stage = 'generating' }: LoadingAnimationProps) {
  const getIcon = () => {
    switch (stage) {
      case 'generating':
        return <Brain className="h-6 w-6 text-primary animate-pulse" />
      case 'refining':
        return <Zap className="h-6 w-6 text-primary animate-bounce" />
      case 'validating':
        return <BookOpen className="h-6 w-6 text-primary animate-pulse" />
      default:
        return <Loader2 className="h-6 w-6 text-primary animate-spin" />
    }
  }

  const getStageMessage = () => {
    switch (stage) {
      case 'generating':
        return "Generating question with AI..."
      case 'refining':
        return "Refining with Gemini 2.0 Flash..."
      case 'validating':
        return "Validating physics accuracy..."
      default:
        return message
    }
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4">
      <div className="relative">
        {/* Animated background circle */}
        <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping"></div>
        <div className="relative bg-card rounded-full p-4 border border-border/20">
          {getIcon()}
        </div>
      </div>
      
      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-foreground">{getStageMessage()}</p>
        <div className="flex space-x-1 justify-center">
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
        </div>
      </div>
    </div>
  )
}