import { Header } from "@/components/header"
import { EnhancedMainContent } from "@/components/enhanced-main-content"
import { Footer } from "@/components/footer"

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <Header />
      <EnhancedMainContent />
      <Footer />
    </div>
  )
}
