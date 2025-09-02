import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LoadingAnimation } from "@/components/loading-animation"
import { Zap, Brain, BookOpen, Sparkles } from "lucide-react"

export default function DemoPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-4">
            Beautiful Dark Theme Demo
          </h1>
          <p className="text-muted-foreground text-lg">
            Experience the stunning dark gradients and smooth animations
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Gradient Cards */}
          <Card className="card-gradient border-border/20 shadow-lg hover-lift">
            <CardHeader className="bg-gradient-to-r from-card/50 to-card/30 rounded-t-lg">
              <CardTitle className="flex items-center gap-2 gradient-text">
                <Brain className="h-5 w-5 text-primary" />
                AI Generation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <p className="text-muted-foreground mb-4">
                Powered by fine-tuned Llama 3.1 8B model for accurate physics questions.
              </p>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                Advanced AI
              </Badge>
            </CardContent>
          </Card>

          <Card className="card-gradient border-border/20 shadow-lg hover-lift">
            <CardHeader className="bg-gradient-to-r from-card/50 to-card/30 rounded-t-lg">
              <CardTitle className="flex items-center gap-2 gradient-text">
                <Zap className="h-5 w-5 text-primary" />
                Gemini Refinement
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <p className="text-muted-foreground mb-4">
                Enhanced with Gemini 2.0 Flash for superior question quality and accuracy.
              </p>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                AI Refined
              </Badge>
            </CardContent>
          </Card>

          <Card className="card-gradient border-border/20 shadow-lg hover-lift">
            <CardHeader className="bg-gradient-to-r from-card/50 to-card/30 rounded-t-lg">
              <CardTitle className="flex items-center gap-2 gradient-text">
                <BookOpen className="h-5 w-5 text-primary" />
                IB Compliant
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <p className="text-muted-foreground mb-4">
                Questions follow official IB Physics curriculum and exam format.
              </p>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                Validated
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Loading Animation Demo */}
        <Card className="card-gradient border-border/20 shadow-lg mb-8">
          <CardHeader className="bg-gradient-to-r from-card/50 to-card/30 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 gradient-text">
              <Sparkles className="h-5 w-5 text-primary" />
              Beautiful Loading Animations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <h4 className="font-medium mb-2">Generating</h4>
                <LoadingAnimation stage="generating" />
              </div>
              <div className="text-center">
                <h4 className="font-medium mb-2">Refining</h4>
                <LoadingAnimation stage="refining" />
              </div>
              <div className="text-center">
                <h4 className="font-medium mb-2">Validating</h4>
                <LoadingAnimation stage="validating" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Theme Toggle Demo */}
        <Card className="card-gradient border-border/20 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-card/50 to-card/30 rounded-t-lg">
            <CardTitle className="gradient-text">Theme Toggle</CardTitle>
          </CardHeader>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground mb-4">
              Use the theme toggle in the header to switch between beautiful dark and light modes.
            </p>
            <Button className="gradient-primary text-primary-foreground hover:opacity-90 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-[1.02]">
              Try the Theme Toggle Above ↗
            </Button>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  )
}