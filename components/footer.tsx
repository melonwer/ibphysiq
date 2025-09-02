export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-card mt-auto shadow-sm">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Disclaimer:</strong> This tool is for revision practice. It does not predict official IB exam content.
          </p>
          <div className="flex items-center gap-4 text-sm">
            <a
              href="https://github.com/melonwer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-all duration-300 hover:underline"
            >
              GitHub Repository
            </a>
            <span className="text-muted-foreground/50">•</span>
            <a
              href="https://huggingface.co/d4ydy/ibphysiq"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-all duration-300 hover:underline"
            >
              MIT License
            </a>
          </div>
        </div>

        {/* Gradient line */}
        <div className="mt-4 h-px bg-gradient-to-r from-transparent via-border to-transparent"></div>

        <div className="mt-4 text-center">
          <p className="text-xs text-muted-foreground/70">
            Built with ❤️ for IB Physics students worldwide
          </p>
        </div>
      </div>
    </footer>
  )
}
