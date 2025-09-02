import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"

export function Header() {
  return (
    <header className="border-b border-border/40 bg-card/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 rounded-xl blur-sm"></div>
              <span className="relative inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 text-primary text-2xl border border-primary/20 shadow-sm" role="img" aria-label="robot">🤖</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                IBphysiQ
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                Practice physics with tailored questions and clear, friendly solutions.
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="hover:bg-primary/5 hover:text-primary transition-colors">
                <a href="https://huggingface.co/d4ydy" target="_blank" rel="noopener noreferrer">Contact</a>
              </Button>
              <Button asChild variant="ghost" size="sm" className="hover:bg-primary/5 hover:text-primary transition-colors">
                <a href="https://github.com/melonwer" target="_blank" rel="noopener noreferrer">GitHub</a>
              </Button>
              <Button asChild variant="ghost" size="sm" className="hover:bg-primary/5 hover:text-primary transition-colors">
                <a href="https://huggingface.co/d4ydy/ibphysiq" target="_blank" rel="noopener noreferrer">MIT License</a>
              </Button>
            </div>
            <div className="h-6 w-px bg-border hidden md:block"></div>
            <ThemeToggle />
          </nav>
        </div>
      </div>
    </header>
  )
}
