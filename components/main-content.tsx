"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"

interface MCQQuestion {
  type: "mcq"
  topic: string
  question: string
  options: string[]
  correct: number
  explanation: string[]
  theory: string
}

interface LongQuestion {
  type: "long"
  topic: string
  question: string
  solution: string[]
  theory: string
}

type Question = MCQQuestion | LongQuestion

export function MainContent() {
  const [prompt, setPrompt] = useState("")
  const [questionType, setQuestionType] = useState<"mcq" | "long" | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generateQuestion = async () => {
    if (!prompt.trim() || !questionType) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/generate-question", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          questionType,
          topics: [], // Could be populated from topic selector
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate question")
      }

      const question: Question = await response.json()
      setCurrentQuestion(question)
    } catch (err) {
      setError("Failed to generate question. Please try again.")
      console.error("Error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="flex-1 container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Chatbot Panel */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-xl text-foreground">AI Practice Generator</CardTitle>
              <p className="text-muted-foreground">
                Enter a physics topic or concept to generate tailored practice questions
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Question Type Selection */}
              <div className="flex flex-wrap gap-3">
                <Button
                  variant={questionType === "mcq" ? "default" : "outline"}
                  onClick={() => setQuestionType("mcq")}
                  className="flex-1 sm:flex-none"
                >
                  Generate Multiple Choice (Paper 1)
                </Button>
                <Button
                  variant={questionType === "long" ? "default" : "outline"}
                  onClick={() => setQuestionType("long")}
                  className="flex-1 sm:flex-none"
                >
                  Generate Long Answer (Paper 2)
                </Button>
              </div>

              {/* Input Area */}
              <div className="space-y-3">
                <Textarea
                  placeholder="e.g., Focus on circular motion and Newton's laws, or describe projectile motion concepts..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[120px] resize-none"
                />
                <Button
                  className="w-full"
                  disabled={!prompt.trim() || !questionType || isLoading}
                  onClick={generateQuestion}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating Question...
                    </>
                  ) : (
                    "Generate Question"
                  )}
                </Button>
              </div>

              {error && <div className="p-4 border border-destructive/20 bg-destructive/10 text-destructive-foreground rounded-lg">{error}</div>}

              {currentQuestion && (
                <div className="mt-8 space-y-4">
                  <div className="p-4 border border-border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="secondary">
                        {currentQuestion.type === "mcq" ? "Paper 1 MCQ" : "Paper 2 Long Answer"}
                      </Badge>
                      <Badge variant="outline">Topic: {currentQuestion.topic}</Badge>
                    </div>
                    <h3 className="font-semibold mb-2">Question:</h3>
                    <p className="text-sm text-muted-foreground mb-4 whitespace-pre-line">{currentQuestion.question}</p>

                    {currentQuestion.type === "mcq" && (
                      <div className="space-y-1 text-sm">
                        {currentQuestion.options.map((option, index) => (
                          <p
                            key={index}
                            className={index === currentQuestion.correct ? "font-semibold text-primary" : ""}
                          >
                            {String.fromCharCode(65 + index)}) {option} {index === currentQuestion.correct && "✓"}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  <details className="border border-border rounded-lg">
                    <summary className="p-4 cursor-pointer hover:bg-muted/50 font-medium">
                      {currentQuestion.type === "mcq" ? "See Step-by-Step Solution" : "See Complete Solution"}
                    </summary>
                    <div className="p-4 pt-0 space-y-2 text-sm">
                      {currentQuestion.type === "mcq"
                        ? currentQuestion.explanation.map((step, index) => (
                            <p key={index}>
                              <strong>Step {index + 1}:</strong> {step.replace(/^Step \d+:\s*/, "")}
                            </p>
                          ))
                        : currentQuestion.solution.map((line, index) => (
                            <p key={index} className={line === "" ? "mb-2" : ""}>
                              {line}
                            </p>
                          ))}
                    </div>
                  </details>

                  <div className="p-3 bg-accent/10 border border-accent/20 rounded-lg">
                    <h4 className="font-medium text-sm mb-1">Theory Reference:</h4>
                    <p className="text-xs text-muted-foreground">{currentQuestion.theory}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Topic Selector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Physics Topics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                "Mechanics",
                "Thermal Physics",
                "Waves",
                "Electricity & Magnetism",
                "Atomic & Nuclear Physics",
                "Energy Production",
              ].map((topic) => (
                <label key={topic} className="flex items-center space-x-2 text-sm">
                  <input type="checkbox" className="rounded border-border" />
                  <span>{topic}</span>
                </label>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
