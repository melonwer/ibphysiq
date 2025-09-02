"use client"

import { useState, useEffect, useCallback } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, ChevronRight } from "lucide-react"
import { IBPhysicsSubtopic } from "@/lib/types/question-generation"
import { TOPIC_DISPLAY_NAMES, TOPIC_CATEGORIES, THEME_NAMES } from "@/lib/constants/ib-physics-topics"

interface Topic {
  id: IBPhysicsSubtopic
  name: string
  category: string
}

interface TopicSelectorProps {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  questionType?: "multiple-choice" | "long-answer"
}

export function TopicSelector({ value, onValueChange, disabled, questionType = "multiple-choice" }: TopicSelectorProps) {
  const [availableTopics, setAvailableTopics] = useState<Topic[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const initializeTopics = useCallback(() => {
    const topics: Topic[] = []
    
    Object.entries(TOPIC_CATEGORIES).forEach(([categoryKey, subtopics]) => {
      const categoryName = THEME_NAMES[categoryKey as keyof typeof THEME_NAMES]
      
      // Skip option topics for multiple choice questions
      if (questionType === "multiple-choice" && categoryKey === "OPTION_TOPICS") {
        return
      }
      
      subtopics.forEach(subtopic => {
        topics.push({
          id: subtopic,
          name: TOPIC_DISPLAY_NAMES[subtopic],
          category: categoryName
        })
      })
    })
    
    setAvailableTopics(topics)
  }, [questionType])

  useEffect(() => {
    // Initialize with static topics from constants
    initializeTopics()
  }, [initializeTopics])

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const selectedTopic = availableTopics.find(topic => topic.id === value)

  return (
    <div className="space-y-2">
      {/* Enhanced Mobile Select */}
      <div className="md:hidden">
        <Select value={value} onValueChange={onValueChange} disabled={disabled}>
          <SelectTrigger className="h-12 bg-card/80 border-border/50 hover:bg-card/90 transition-colors">
            <SelectValue placeholder="Select a physics topic..." />
          </SelectTrigger>
          <SelectContent className="max-h-[60vh]">
            {Object.entries(TOPIC_CATEGORIES).map(([categoryKey, subtopics]) => {
              const categoryName = THEME_NAMES[categoryKey as keyof typeof THEME_NAMES]

              // Skip option topics for multiple choice questions
              if (questionType === "multiple-choice" && categoryKey === "OPTION_TOPICS") {
                return null
              }

              return (
                <div key={categoryKey}>
                  <div className="px-3 py-2 text-sm font-semibold text-foreground bg-muted/30 border-b border-border/20 sticky top-0">
                    {categoryName}
                  </div>
                  {subtopics.map((subtopic) => (
                    <SelectItem key={subtopic} value={subtopic} className="pl-6 py-3 text-sm">
                      <div className="flex items-center justify-between w-full">
                        <span>{TOPIC_DISPLAY_NAMES[subtopic]}</span>
                        {TOPIC_DISPLAY_NAMES[subtopic].includes("(HL)") && (
                          <Badge variant="secondary" className="text-xs ml-2 bg-primary/20 text-primary">
                            HL
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </div>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Enhanced Desktop Select */}
      <div className="hidden md:block">
        <Select value={value} onValueChange={onValueChange} disabled={disabled}>
          <SelectTrigger className="bg-card/80 border-border/50 hover:bg-card/90 transition-colors">
            <SelectValue placeholder="Select a physics topic...">
              {selectedTopic && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">{selectedTopic.name}</span>
                  <Badge variant="outline" className="text-xs border-primary/30 bg-primary/5 text-primary">
                    {selectedTopic.category.split(':')[0]}
                  </Badge>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[400px]">
            {Object.entries(TOPIC_CATEGORIES).map(([categoryKey, subtopics]) => {
              const categoryName = THEME_NAMES[categoryKey as keyof typeof THEME_NAMES]

              // Skip option topics for multiple choice questions
              if (questionType === "multiple-choice" && categoryKey === "OPTION_TOPICS") {
                return null
              }

              return (
                <div key={categoryKey}>
                  <div className="px-3 py-2 text-sm font-semibold text-foreground bg-muted/40 border-b border-border/20 sticky top-0">
                    {categoryName}
                  </div>
                  {subtopics.map((subtopic) => (
                    <SelectItem key={subtopic} value={subtopic} className="pl-6 py-2 hover:bg-primary/5 transition-colors">
                      <div className="flex items-center justify-between w-full">
                        <span className="font-medium">{TOPIC_DISPLAY_NAMES[subtopic]}</span>
                        {TOPIC_DISPLAY_NAMES[subtopic].includes("(HL)") && (
                          <Badge variant="secondary" className="text-xs ml-2 bg-primary/20 text-primary hover:bg-primary/30">
                            HL
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </div>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Topic Browser Card (Optional Expanded View) */}
      {false && ( // Hidden by default, can be enabled
        <Card className="mt-4">
          <CardContent className="p-4">
            <h4 className="font-medium mb-3">Browse by Theme</h4>
            <div className="space-y-2">
              {Object.entries(TOPIC_CATEGORIES).map(([categoryKey, subtopics]) => {
                const categoryName = THEME_NAMES[categoryKey as keyof typeof THEME_NAMES]
                return (
                  <Collapsible
                    key={categoryKey}
                    open={expandedCategories.has(categoryKey)}
                    onOpenChange={() => toggleCategory(categoryKey)}
                  >
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 text-left hover:bg-muted/50 rounded">
                      <span className="font-medium text-sm">{categoryName}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {subtopics.length} topics
                        </Badge>
                        {expandedCategories.has(categoryKey) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pl-4 space-y-1">
                      {subtopics.map((subtopic) => (
                        <button
                          key={subtopic}
                          className={`block w-full text-left p-2 text-sm rounded hover:bg-muted/50 transition-colors ${
                            value === subtopic ? "bg-primary/10 text-primary" : ""
                          }`}
                          onClick={() => onValueChange(subtopic)}
                          disabled={disabled}
                        >
                          {TOPIC_DISPLAY_NAMES[subtopic]}
                        </button>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}