#!/usr/bin/env python3
"""
🎓 IB Physics Practice Generator - Hugging Face Spaces App

This is a Gradio interface for the IB Physics Question Generator.
It allows users to generate curriculum-aligned physics questions using AI.

For the full Next.js application, visit: https://github.com/melonwer/ibphysiq
"""

import gradio as gr
import requests
import json
import os
import time
from typing import Dict, Any, Optional, Tuple
import subprocess
import threading
import signal
import sys

# Configuration
NEXTJS_PORT = 3000
NEXTJS_URL = f"http://localhost:{NEXTJS_PORT}"
NEXTJS_PROCESS = None

# IB Physics Topics (matching the TypeScript definitions)
IB_PHYSICS_TOPICS = {
    "measurements-and-uncertainties": "🔬 Measurements and Uncertainties",
    "mechanics": "⚙️ Mechanics", 
    "thermal-physics": "🌡️ Thermal Physics",
    "waves": "🌊 Waves",
    "electricity-and-magnetism": "⚡ Electricity and Magnetism",
    "circular-motion-and-gravitation": "🌍 Circular Motion and Gravitation",
    "atomic-nuclear-particle-physics": "⚛️ Atomic, Nuclear & Particle Physics",
    "energy-production": "🔋 Energy Production",
    "wave-phenomena": "🌈 Wave Phenomena (HL)",
    "fields": "🧲 Fields (HL)",
    "electromagnetic-induction": "🔌 Electromagnetic Induction (HL)",
    "quantum-and-nuclear-physics": "🔬 Quantum and Nuclear Physics (HL)"
}

DIFFICULTY_LEVELS = {
    "easy": "📗 Easy",
    "standard": "📘 Standard", 
    "hard": "📕 Hard"
}

def start_nextjs_server():
    """Start the Next.js development server in the background."""
    global NEXTJS_PROCESS
    
    try:
        print("🚀 Starting Next.js server...")
        
        # Install dependencies if needed
        if not os.path.exists("node_modules"):
            print("📦 Installing dependencies...")
            subprocess.run(["npm", "install"], check=True, cwd=".")
        
        # Start the Next.js server
        NEXTJS_PROCESS = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=".",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            preexec_fn=os.setsid if os.name != 'nt' else None
        )
        
        # Wait for server to start
        max_attempts = 30
        for i in range(max_attempts):
            try:
                response = requests.get(f"{NEXTJS_URL}/api/generate-question?action=health", timeout=5)
                if response.status_code == 200:
                    print("✅ Next.js server is ready!")
                    return True
            except requests.exceptions.RequestException:
                pass
            
            time.sleep(2)
            print(f"⏳ Waiting for server to start... ({i+1}/{max_attempts})")
        
        print("❌ Failed to start Next.js server")
        return False
        
    except Exception as e:
        print(f"❌ Error starting Next.js server: {e}")
        return False

def stop_nextjs_server():
    """Stop the Next.js server."""
    global NEXTJS_PROCESS
    
    if NEXTJS_PROCESS:
        try:
            if os.name == 'nt':  # Windows
                NEXTJS_PROCESS.terminate()
            else:  # Unix/Linux/macOS
                os.killpg(os.getpgid(NEXTJS_PROCESS.pid), signal.SIGTERM)
            NEXTJS_PROCESS.wait(timeout=10)
            print("🛑 Next.js server stopped")
        except Exception as e:
            print(f"⚠️ Error stopping Next.js server: {e}")

def generate_question(
    topic: str, 
    difficulty: str, 
    openrouter_api_key: Optional[str] = None
) -> Tuple[str, str]:
    """
    Generate an IB Physics question using the Next.js API.
    
    Returns:
        Tuple of (question_text, status_message)
    """
    
    try:
        # Validate inputs
        if not topic or topic not in IB_PHYSICS_TOPICS:
            return "", "❌ Please select a valid topic."
        
        if not difficulty or difficulty not in DIFFICULTY_LEVELS:
            return "", "❌ Please select a valid difficulty level."
        
        # Prepare request data
        request_data = {
            "topic": topic,
            "difficulty": difficulty,
            "type": "multiple-choice"
        }
        
        # Add OpenRouter API key if provided
        if openrouter_api_key and openrouter_api_key.strip():
            request_data["openRouterApiKey"] = openrouter_api_key.strip()
            request_data["refinementProvider"] = "openrouter"
        
        # Make request to Next.js API
        response = requests.post(
            f"{NEXTJS_URL}/api/generate-question",
            json=request_data,
            timeout=60,  # 60 second timeout for AI generation
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get("success") and data.get("question"):
                question = data["question"]
                
                # Format the question nicely
                question_text = question.get("questionText", "")
                
                # Add metadata
                metadata = f"""
**Topic:** {IB_PHYSICS_TOPICS.get(topic, topic)}
**Difficulty:** {DIFFICULTY_LEVELS.get(difficulty, difficulty)}
**Type:** Multiple Choice (Paper 1 style)

---

{question_text}
"""
                
                status = f"✅ Question generated successfully! Using {data.get('provider', 'demo')} AI."
                if data.get("fallbackUsed"):
                    status += " (Fallback mode used)"
                
                return metadata, status
            else:
                error_msg = data.get("error", "Unknown error occurred")
                return "", f"❌ Failed to generate question: {error_msg}"
        
        else:
            error_detail = ""
            try:
                error_data = response.json()
                error_detail = error_data.get("error", response.text)
            except:
                error_detail = response.text
            
            return "", f"❌ API Error ({response.status_code}): {error_detail}"
    
    except requests.exceptions.Timeout:
        return "", "⏱️ Request timed out. The AI model might be starting up. Please try again in a moment."
    
    except requests.exceptions.ConnectionError:
        return "", "🔌 Cannot connect to the question generator service. Please try again."
    
    except Exception as e:
        return "", f"❌ Unexpected error: {str(e)}"

def get_server_status() -> str:
    """Check if the Next.js server is running."""
    try:
        response = requests.get(f"{NEXTJS_URL}/api/generate-question?action=health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            return f"✅ Server Status: {data.get('status', 'Running')}"
        else:
            return f"⚠️ Server Status: Error ({response.status_code})"
    except:
        return "❌ Server Status: Offline"

# Custom CSS for better UI
custom_css = """
.gradio-container {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.question-output {
    font-family: 'Georgia', serif;
    line-height: 1.6;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 10px;
    border-left: 4px solid #007bff;
}

.status-message {
    padding: 10px;
    border-radius: 5px;
    margin-top: 10px;
}

.gr-button {
    background: linear-gradient(90deg, #007bff, #0056b3);
    border: none;
    color: white;
    font-weight: bold;
}

.gr-button:hover {
    background: linear-gradient(90deg, #0056b3, #004085);
}
"""

def create_interface():
    """Create the Gradio interface."""
    
    with gr.Blocks(
        title="🎓 IB Physics Practice Generator",
        theme=gr.themes.Soft(),
        css=custom_css
    ) as interface:
        
        # Header
        gr.Markdown("""
        # 🎓 IB Physics Practice Generator
        
        **Never run out of physics practice questions again!** 🚀
        
        This AI-powered tool creates unlimited, curriculum-aligned IB Physics questions instantly. 
        Perfect for students preparing for exams or teachers creating practice materials.
        
        > 💡 **Tip:** For the best experience and unlimited questions, add your free OpenRouter API key below!
        """)
        
        # Status indicator
        status_display = gr.Textbox(
            value=get_server_status(),
            label="🔧 System Status",
            interactive=False
        )
        
        with gr.Row():
            with gr.Column(scale=1):
                # Input controls
                gr.Markdown("### 📋 Question Settings")
                
                topic_dropdown = gr.Dropdown(
                    choices=list(IB_PHYSICS_TOPICS.keys()),
                    value="mechanics",
                    label="📚 Physics Topic",
                    info="Choose the IB Physics topic for your question"
                )
                
                difficulty_dropdown = gr.Dropdown(
                    choices=list(DIFFICULTY_LEVELS.keys()),
                    value="standard",
                    label="📊 Difficulty Level", 
                    info="Select the appropriate difficulty for your level"
                )
                
                # API Key input
                gr.Markdown("### 🔑 AI Configuration (Optional)")
                api_key_input = gr.Textbox(
                    label="OpenRouter API Key",
                    placeholder="sk-or-your-free-api-key-here",
                    type="password",
                    info="Get a free API key at openrouter.ai for unlimited, high-quality questions"
                )
                
                # Generate button
                generate_btn = gr.Button(
                    "🎲 Generate Question",
                    variant="primary",
                    size="lg"
                )
                
                # Refresh status button
                refresh_btn = gr.Button(
                    "🔄 Refresh Status",
                    variant="secondary",
                    size="sm"
                )
            
            with gr.Column(scale=2):
                # Output area
                gr.Markdown("### 📝 Generated Question")
                
                question_output = gr.Markdown(
                    value="Click '🎲 Generate Question' to create your first IB Physics practice question!",
                    elem_classes=["question-output"]
                )
                
                status_output = gr.Textbox(
                    label="Status",
                    value="Ready to generate questions! 🚀",
                    interactive=False,
                    elem_classes=["status-message"]
                )
        
        # Footer with links
        gr.Markdown("""
        ---
        
        ### 🔗 Useful Links
        
        - 🆓 **[Get Free OpenRouter API Key](https://openrouter.ai)** - For unlimited AI questions
        - 📖 **[Full Documentation](https://github.com/melonwer/ibphysiq)** - Complete setup guide
        - 🌐 **[GitHub Repository](https://github.com/melonwer/ibphysiq)** - Source code and issues
        - 💬 **[Community Discussions](https://github.com/melonwer/ibphysiq/discussions)** - Get help and share feedback
        
        ### ℹ️ About This Tool
        
        This generator uses advanced AI models to create IB Physics questions that are:
        - ✅ **Curriculum-aligned** with official IB Physics syllabus
        - ✅ **Paper 1 style** multiple choice format
        - ✅ **Quality-checked** by AI refinement systems
        - ✅ **Free to use** in demo mode or with OpenRouter
        
        Made with ❤️ for IB Physics students and educators worldwide.
        """)
        
        # Event handlers
        generate_btn.click(
            fn=generate_question,
            inputs=[topic_dropdown, difficulty_dropdown, api_key_input],
            outputs=[question_output, status_output]
        )
        
        refresh_btn.click(
            fn=get_server_status,
            outputs=status_display
        )
        
        # Auto-refresh status every 30 seconds
        interface.load(
            fn=get_server_status,
            outputs=status_display,
            every=30
        )
    
    return interface

def main():
    """Main application entry point."""
    
    # Handle graceful shutdown
    def signal_handler(signum, frame):
        print("\n🛑 Shutting down...")
        stop_nextjs_server()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        print("🎓 IB Physics Practice Generator - Hugging Face Spaces")
        print("=" * 60)
        
        # Start Next.js server in background
        server_thread = threading.Thread(target=start_nextjs_server)
        server_thread.daemon = True
        server_thread.start()
        
        # Wait a moment for server to initialize
        time.sleep(5)
        
        # Create and launch Gradio interface
        interface = create_interface()
        
        print("\n🌐 Starting Gradio interface...")
        interface.launch(
            server_name="0.0.0.0",
            server_port=7860,
            share=False,
            show_error=True,
            show_tips=True,
            enable_queue=True,
            max_threads=10
        )
        
    except KeyboardInterrupt:
        print("\n🛑 Interrupted by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
    finally:
        stop_nextjs_server()

if __name__ == "__main__":
    main()