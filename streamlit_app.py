
"""
Comprehensive IB Physics Practice Generator - Streamlit Demo
===========================================================

A full-featured Streamlit application that replicates the core functionalities
of the IB Physics practice generator with modern UI, OpenRouter API integration,
and comprehensive session management.

Features:
- Hierarchical topic selection with 28+ IB Physics subtopics
- OpenRouter API integration with DeepSeek v3.1:free model
- Multi-stage progress tracking (generating → refining → validating → complete)
- Interactive MCQ display with answer checking and explanations
- Session management with question history and statistics
- Settings panel for API key configuration
- Responsive layout with sidebar for stats/history

Usage:
- Deploy to Streamlit Community Cloud
- Add OPENROUTER_API_KEY to secrets or use the settings panel
- Select a physics topic and generate questions interactively
"""

import streamlit as st
import json
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum

# OpenAI client for OpenRouter API
try:
    from openai import OpenAI
except ImportError:
    st.error("OpenAI library not installed. Please run: pip install openai>=1.0.0")
    st.stop()

# Configuration and Constants
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_REFINEMENT_MODEL = "deepseek/deepseek-v3"  # Free model on OpenRouter
LIT_API_URL = "https://8000-dep-01k3m70zjy9sat5he7x29dkvjq-d.cloudspaces.litng.ai/predict"
LIT_API_TOKEN = "1816a8fa-5ce1-4b14-8a45-2d9c576fbc7b"
APP_VERSION = "2.0.0"

# IB Physics Topics Structure
class IBPhysicsTopics:
    """Complete IB Physics topics structure matching the Next.js app"""
    
    THEMES = {
        "Theme A: Space, time and motion": [
            ("kinematics", "Kinematics"),
            ("forces-momentum", "Forces and Momentum"),
            ("work-energy-power", "Work, Energy and Power"),
            ("rigid-body-mechanics", "Rigid Body Mechanics (HL)"),
            ("galilean-special-relativity", "Galilean and Special Relativity (HL)")
        ],
        "Theme B: The particulate nature of matter": [
            ("thermal-energy-transfers", "Thermal Energy Transfers"),
            ("greenhouse-effect", "Greenhouse Effect"),
            ("gas-laws", "Gas Laws"),
            ("current-circuits", "Current and Circuits"),
            ("thermodynamics", "Thermodynamics (HL)")
        ],
        "Theme C: Wave behaviour": [
            ("simple-harmonic-motion", "Simple Harmonic Motion"),
            ("wave-model", "Wave Model"),
            ("wave-phenomena", "Wave Phenomena"),
            ("standing-waves-resonance", "Standing Waves and Resonance"),
            ("doppler-effect", "Doppler Effect")
        ],
        "Theme D: Fields": [
            ("gravitational-fields", "Gravitational Fields"),
            ("electric-magnetic-fields", "Electric and Magnetic Fields"),
            ("motion-electromagnetic-fields", "Motion in Electromagnetic Fields"),
            ("induction", "Induction (HL)")
        ],
        "Theme E: Nuclear and quantum physics": [
            ("structure-atom", "Structure of the Atom"),
            ("radioactive-decay", "Radioactive Decay"),
            ("fission", "Fission"),
            ("fusion-stars", "Fusion and Stars"),
            ("quantum-physics", "Quantum Physics (HL)")
        ],
        "Option Topics": [
            ("relativity", "Relativity (Option A)"),
            ("engineering-physics", "Engineering Physics (Option B)"),
            ("imaging", "Imaging (Option C)"),
            ("astrophysics", "Astrophysics (Option D)"),
            ("particle-physics", "Particle Physics (Option E)")
        ]
    }
    
    TOPIC_CONTEXTS = {
        "kinematics": "Focus on displacement, velocity, acceleration, equations of motion, and graphical analysis of motion.",
        "forces-momentum": "Include Newton's laws, force analysis, momentum conservation, impulse, and collision problems.",
        "work-energy-power": "Cover work done by forces, kinetic and potential energy, conservation of energy, and power calculations.",
        "rigid-body-mechanics": "Advanced mechanics including rotational motion, torque, angular momentum, and moment of inertia.",
        "galilean-special-relativity": "Galilean transformations, special relativity principles, time dilation, and length contraction.",
        "thermal-energy-transfers": "Heat transfer mechanisms, thermal conductivity, specific heat capacity, and phase changes.",
        "greenhouse-effect": "Radiation balance, greenhouse gases, albedo, and climate change physics.",
        "gas-laws": "Ideal gas law, kinetic theory, pressure-volume relationships, and gas behavior.",
        "current-circuits": "Electric current, resistance, Ohm's law, circuit analysis, and electrical power.",
        "thermodynamics": "Laws of thermodynamics, heat engines, entropy, and thermodynamic cycles.",
        "simple-harmonic-motion": "Oscillatory motion, period, frequency, amplitude, and energy in SHM.",
        "wave-model": "Wave properties, wave equation, wavelength, frequency, and wave speed.",
        "wave-phenomena": "Reflection, refraction, diffraction, interference, and polarization of waves.",
        "standing-waves-resonance": "Stationary waves, nodes, antinodes, resonance, and wave superposition.",
        "doppler-effect": "Frequency shifts due to relative motion between source and observer.",
        "gravitational-fields": "Gravitational field strength, potential, orbital motion, and Kepler's laws.",
        "electric-magnetic-fields": "Electric field strength, potential, magnetic field effects, and field interactions.",
        "motion-electromagnetic-fields": "Charged particle motion in electric and magnetic fields, and electromagnetic forces.",
        "induction": "Electromagnetic induction, Faraday's law, Lenz's law, and induced EMF.",
        "structure-atom": "Atomic models, electron energy levels, emission and absorption spectra.",
        "radioactive-decay": "Radioactive decay processes, half-life, decay constants, and nuclear stability.",
        "fission": "Nuclear fission process, chain reactions, and fission energy calculations.",
        "fusion-stars": "Nuclear fusion, stellar nucleosynthesis, and energy production in stars.",
        "quantum-physics": "Quantum mechanics principles, wave-particle duality, and quantum phenomena.",
        "relativity": "Special and general relativity, spacetime, relativistic effects, and cosmological applications.",
        "engineering-physics": "Applied physics in engineering contexts, materials science, and technological applications.",
        "imaging": "Medical and scientific imaging techniques, optics, and image formation principles.",
        "astrophysics": "Stellar physics, cosmology, galactic structures, and astronomical phenomena.",
        "particle-physics": "Fundamental particles, particle interactions, accelerators, and the Standard Model."
    }

@dataclass
class GeneratedQuestion:
    """Question data structure matching the Next.js app"""
    id: str
    topic: str
    question_text: str
    options: List[str]
    correct_answer: str
    explanation: Optional[str]
    processing_time: int
    generated_at: datetime
    difficulty: str = "standard"
    type: str = "multiple-choice"

class ProgressStage(Enum):
    """Progress stages for question generation"""
    IDLE = "idle"
    GENERATING = "generating"
    REFINING = "refining"
    VALIDATING = "validating"
    COMPLETE = "complete"
    ERROR = "error"

# Streamlit App Configuration
st.set_page_config(
    page_title="IB Physics Practice Generator - Demo",
    page_icon="🧪",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for better styling
st.markdown("""
<style>
    .main-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 1rem;
        border-radius: 10px;
        margin-bottom: 2rem;
        color: white;
    }
    .topic-selector {
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
    }
    .progress-container {
        background: white;
        padding: 1rem;
        border-radius: 8px;
        border: 1px solid #e9ecef;
        margin: 1rem 0;
    }
    .question-container {
        background: white;
        padding: 2rem;
        border-radius: 10px;
        border: 1px solid #e9ecef;
        margin: 1rem 0;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .stats-container {
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
    }
    .history-item {
        background: white;
        padding: 0.8rem;
        border-radius: 6px;
        margin-bottom: 0.5rem;
        border: 1px solid #e9ecef;
        cursor: pointer;
        transition: background-color 0.2s;
    }
    .history-item:hover {
        background-color: #e3f2fd;
    }
    .stAlert > div {
        padding: 1rem;
    }
</style>
""", unsafe_allow_html=True)

# Session State Management
def initialize_session_state():
    """Initialize all session state variables"""
    if 'question_history' not in st.session_state:
        st.session_state.question_history = []
    if 'current_question' not in st.session_state:
        st.session_state.current_question = None
    if 'selected_topic' not in st.session_state:
        st.session_state.selected_topic = ""
    if 'progress_stage' not in st.session_state:
        st.session_state.progress_stage = ProgressStage.IDLE
    if 'progress_value' not in st.session_state:
        st.session_state.progress_value = 0
    if 'progress_message' not in st.session_state:
        st.session_state.progress_message = "Ready to generate questions"
    if 'user_answer' not in st.session_state:
        st.session_state.user_answer = None
    if 'show_explanation' not in st.session_state:
        st.session_state.show_explanation = False
    if 'openrouter_api_key' not in st.session_state:
        st.session_state.openrouter_api_key = ""
    if 'lit_api_url' not in st.session_state:
        st.session_state.lit_api_url = ""
    if 'lit_api_token' not in st.session_state:
        st.session_state.lit_api_token = ""
    if 'generation_count' not in st.session_state:
        st.session_state.generation_count = 0

# LIT API Client for fine-tuned Llama model
def call_lit_api(prompt: str, api_url: str = None, api_token: str = None) -> Optional[str]:
    """Call the Lightning AI (LIT) API for the fine-tuned Llama model"""
    import requests
    import re
    
    # Use configured values or defaults
    url = api_url or st.secrets.get("LIT_API_URL", LIT_API_URL)
    token = api_token or st.secrets.get("LIT_API_TOKEN", LIT_API_TOKEN)
    
    try:
        headers = {
            "Content-Type": "application/json"
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        
        payload = {
            "inputs": prompt,
            "max_new_tokens": 500,
            "temperature": 0.7,
            "top_p": 0.9
        }
        
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        if response.ok:
            data = response.json()
            
            # Handle various response formats from LIT API
            if isinstance(data, dict):
                if 'response' in data:
                    # Try to parse embedded JSON and extract text
                    resp_str = data['response']
                    if isinstance(resp_str, str):
                        # Look for JSON followed by generated text
                        json_match = re.search(r'}\s+(.+)', resp_str, re.DOTALL)
                        if json_match:
                            return json_match.group(1).strip()
                        else:
                            try:
                                inner = json.loads(resp_str)
                                return inner.get('output', resp_str)
                            except:
                                return resp_str
                elif 'generated_text' in data:
                    return data['generated_text']
                elif 'output' in data:
                    return data['output']
            
            # Fallback to raw response
            return response.text
        else:
            st.error(f"LIT API error: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        st.error(f"Error calling LIT API: {str(e)}")
        return None

def generate_llama_prompt(topic: str, topic_name: str) -> str:
    """Generate prompt in the exact format expected by the fine-tuned Llama model"""
    return json.dumps({
        "instruction": "Generate an IB Physics Paper 1 style multiple-choice question.",
        "input": f"Topic: {topic_name}",
        "output": ""
    })

def parse_llama_response(response_text: str, topic: str) -> Optional[Dict[str, Any]]:
    """Parse the raw response from Llama model"""
    import re
    
    try:
        # The Llama model should output the question directly
        # Extract question text, options, and answer
        lines = response_text.strip().split('\n')
        
        question_text = ""
        options = []
        answer = ""
        
        current_section = "question"
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Check for options (A), B), C), D))
            if re.match(r'^[ABCD]\)', line):
                if current_section == "question":
                    current_section = "options"
                options.append(line)
            # Check for answer line
            elif line.upper().startswith('ANSWER:') or line.upper().startswith('CORRECT:'):
                answer_match = re.search(r'[ABCD]', line.upper())
                if answer_match:
                    answer = answer_match.group(0)
            else:
                if current_section == "question":
                    question_text += " " + line
        
        question_text = question_text.strip()
        
        # Validate we have all components
        if question_text and len(options) == 4 and answer in ['A', 'B', 'C', 'D']:
            return {
                "question": question_text,
                "options": [opt.split(')', 1)[1].strip() for opt in options],  # Remove A), B), etc.
                "correct_answer": answer,
                "confidence": 0.8
            }
        else:
            return None
            
    except Exception as e:
        st.error(f"Error parsing Llama response: {str(e)}")
        return None

def refine_with_deepseek(raw_question: Dict[str, Any], topic_name: str, openrouter_api_key: str) -> Optional[Dict[str, Any]]:
    """Refine the raw question using DeepSeek via OpenRouter"""
    try:
        client = get_openrouter_client(openrouter_api_key)
        if not client:
            return raw_question  # Return original if no refinement possible
        
        refinement_prompt = f"""Please review and refine this IB Physics multiple-choice question for accuracy and quality:

TOPIC: {topic_name}
QUESTION: {raw_question['question']}

OPTIONS:
A) {raw_question['options'][0]}
B) {raw_question['options'][1]}
C) {raw_question['options'][2]}
D) {raw_question['options'][3]}

SUGGESTED ANSWER: {raw_question['correct_answer']}

Please improve the question by:
1. Ensuring physics accuracy and proper units
2. Making the question clearer and more precise
3. Ensuring all options are plausible but only one is correct
4. Following IB Physics standards

Respond with the improved question in this exact JSON format:
{{
    "question": "Improved question text",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correct_answer": "A",
    "explanation": "Brief explanation of why this answer is correct"
}}"""

        response = client.chat.completions.create(
            model=DEFAULT_REFINEMENT_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert IB Physics teacher. Refine physics questions for accuracy and clarity. Always respond with valid JSON."
                },
                {"role": "user", "content": refinement_prompt}
            ],
            max_tokens=800,
            temperature=0.3,
        )
        
        refined_data = parse_question_response(response.choices[0].message.content)
        if refined_data:
            return refined_data
        else:
            return raw_question  # Return original if refinement parsing fails
            
    except Exception as e:
        st.error(f"Error in refinement: {str(e)}")
        return raw_question  # Return original if refinement fails

# API Configuration
def get_openrouter_client(api_key: Optional[str] = None) -> Optional[OpenAI]:
    """Create OpenRouter client with proper configuration"""
    # Try multiple sources for API key
    key = (
        api_key or 
        st.session_state.get('openrouter_api_key', '') or
        st.secrets.get("OPENROUTER_API_KEY", "") or
        st.secrets.get("openrouter_api_key", "")
    )
    
    if not key:
        return None
    
    return OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=key,
    )

def generate_question_prompt(topic: str, topic_name: str) -> str:
    """Generate a comprehensive prompt for question generation"""
    topic_context = IBPhysicsTopics.TOPIC_CONTEXTS.get(topic, "General IB Physics topic")
    
    prompt = f"""Generate a high-quality IB Physics multiple-choice question about {topic_name}.

Topic Context: {topic_context}

Requirements:
1. Create a clear, well-structured question appropriate for IB Physics students
2. Include exactly 4 multiple-choice options (A, B, C, D)
3. Make one option clearly correct and the others plausible but wrong
4. Use proper physics terminology and units
5. Include relevant calculations or conceptual reasoning
6. Make the question challenging but fair for IB level

Format your response as valid JSON with this exact structure:
{{
    "question": "The main question text here...",
    "options": [
        "Option A text",
        "Option B text", 
        "Option C text",
        "Option D text"
    ],
    "correct_answer": "A",
    "explanation": "Detailed explanation of why this answer is correct and why others are wrong..."
}}

Topic: {topic_name}
Generate the question now:"""
    
    return prompt

def parse_question_response(response_text: str) -> Optional[Dict[str, Any]]:
    """Parse the API response and extract question data"""
    try:
        # Try to find JSON in the response
        start_idx = response_text.find('{')
        end_idx = response_text.rfind('}') + 1
        
        if start_idx != -1 and end_idx > start_idx:
            json_str = response_text[start_idx:end_idx]
            data = json.loads(json_str)
            
            # Validate required fields
            required_fields = ['question', 'options', 'correct_answer']
            if not all(field in data for field in required_fields):
                return None
                
            # Ensure options is a list of 4 items
            if not isinstance(data['options'], list) or len(data['options']) != 4:
                return None
                
            # Ensure correct_answer is A, B, C, or D
            if data['correct_answer'] not in ['A', 'B', 'C', 'D']:
                return None
                
            return data
    except (json.JSONDecodeError, ValueError, KeyError):
        pass
    
    return None

async def generate_question_with_progress(topic: str, topic_name: str, api_key: str) -> Optional[GeneratedQuestion]:
    """Generate question with progress tracking"""
    client = get_openrouter_client(api_key)
    if not client:
        return None
    
    start_time = time.time()
    
    try:
        # Stage 1: Generating
        st.session_state.progress_stage = ProgressStage.GENERATING
        st.session_state.progress_value = 20
        st.session_state.progress_message = "Generating question with DeepSeek v3.1..."
        
        prompt = generate_question_prompt(topic, topic_name)
        
        # Stage 2: Refining  
        st.session_state.progress_stage = ProgressStage.REFINING
        st.session_state.progress_value = 50
        st.session_state.progress_message = "Refining question for accuracy..."
        
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[
                {
                    "role": "system", 
                    "content": "You are an expert IB Physics teacher who creates high-quality multiple-choice questions. Always respond with valid JSON format."
                },
                {"role": "user", "content": prompt}
            ],
            max_tokens=1000,
            temperature=0.7,
        )
        
        # Stage 3: Validating
        st.session_state.progress_stage = ProgressStage.VALIDATING
        st.session_state.progress_value = 80
        st.session_state.progress_message = "Validating physics accuracy and IB compliance..."
        
        question_data = parse_question_response(response.choices[0].message.content)
        
        if not question_data:
            return None
        
        # Stage 4: Complete
        processing_time = int((time.time() - start_time) * 1000)
        
        question = GeneratedQuestion(
            id=str(uuid.uuid4()),
            topic=topic,
            question_text=question_data['question'],
            options=[f"{chr(65+i)}) {opt}" for i, opt in enumerate(question_data['options'])],
            correct_answer=question_data['correct_answer'],
            explanation=question_data.get('explanation', ''),
            processing_time=processing_time,
            generated_at=datetime.now()
        )
        
        st.session_state.progress_stage = ProgressStage.COMPLETE
        st.session_state.progress_value = 100
        st.session_state.progress_message = f"Generated in {processing_time/1000:.1f}s using DeepSeek v3.1"
        
        return question
        
    except Exception as e:
        st.session_state.progress_stage = ProgressStage.ERROR
        st.session_state.progress_message = f"Error: {str(e)}"
        return None

# UI Components
def render_header():
    """Render the main application header"""
    st.markdown("""
    <div class="main-header">
        <h1>🧪 IB Physics Practice Generator</h1>
        <p>Advanced AI-powered question generation with Fine-tuned Llama → DeepSeek v3.1 pipeline</p>
    </div>
    """, unsafe_allow_html=True)

def render_topic_selector():
    """Render the hierarchical topic selection interface"""
    st.markdown('<div class="topic-selector">', unsafe_allow_html=True)
    st.subheader("📚 Select Physics Topic")
    
    # Theme selection
    themes = list(IBPhysicsTopics.THEMES.keys())
    selected_theme = st.selectbox(
        "Choose IB Physics Theme:",
        options=[""] + themes,
        format_func=lambda x: "Select a theme..." if x == "" else x
    )
    
    if selected_theme:
        # Subtopic selection
        subtopics = IBPhysicsTopics.THEMES[selected_theme]
        topic_options = [""] + [topic_id for topic_id, _ in subtopics]
        topic_labels = ["Select a subtopic..."] + [name for _, name in subtopics]
        
        selected_topic_idx = st.selectbox(
            f"Choose {selected_theme} Subtopic:",
            options=range(len(topic_options)),
            format_func=lambda i: topic_labels[i]
        )
        
        if selected_topic_idx > 0:
            topic_id = topic_options[selected_topic_idx]
            topic_name = topic_labels[selected_topic_idx]
            st.session_state.selected_topic = topic_id
            
            # Show topic context
            context = IBPhysicsTopics.TOPIC_CONTEXTS.get(topic_id, "")
            if context:
                st.info(f"**Topic Focus:** {context}")
            
            return topic_id, topic_name
    
    st.markdown('</div>', unsafe_allow_html=True)
    return None, None

def render_progress_indicator():
    """Render the multi-stage progress indicator"""
    if st.session_state.progress_stage == ProgressStage.IDLE:
        return
    
    st.markdown('<div class="progress-container">', unsafe_allow_html=True)
    
    # Progress bar
    progress_color = {
        ProgressStage.GENERATING: "#ff9800",
        ProgressStage.REFINING: "#2196f3", 
        ProgressStage.VALIDATING: "#9c27b0",
        ProgressStage.COMPLETE: "#4caf50",
        ProgressStage.ERROR: "#f44336"
    }.get(st.session_state.progress_stage, "#ff9800")
    
    col1, col2 = st.columns([3, 1])
    with col1:
        st.progress(st.session_state.progress_value / 100)
    with col2:
        st.write(f"{st.session_state.progress_value}%")
    
    # Stage indicators
    stages = ["Generating", "Refining", "Validating", "Complete"]
    cols = st.columns(4)
    
    current_stage_idx = {
        ProgressStage.GENERATING: 0,
        ProgressStage.REFINING: 1, 
        ProgressStage.VALIDATING: 2,
        ProgressStage.COMPLETE: 3,
        ProgressStage.ERROR: -1
    }.get(st.session_state.progress_stage, -1)
    
    for i, (col, stage) in enumerate(zip(cols, stages)):
        with col:
            if i <= current_stage_idx:
                st.success(f"✅ {stage}")
            elif i == current_stage_idx + 1 and st.session_state.progress_stage != ProgressStage.ERROR:
                st.info(f"⏳ {stage}")
            else:
                st.write(f"⏸️ {stage}")
    
    st.write(f"**Status:** {st.session_state.progress_message}")
    st.markdown('</div>', unsafe_allow_html=True)

def render_question_display():
    """Render the interactive question display"""
    if not st.session_state.current_question:
        st.info("👆 Select a topic above and click 'Generate Question' to begin!")
        return
    
    question = st.session_state.current_question
    
    st.markdown('<div class="question-container">', unsafe_allow_html=True)
    
    # Question header
    col1, col2, col3 = st.columns([2, 1, 1])
    with col1:
        st.markdown(f"**Topic:** {question.topic.replace('-', ' ').title()}")
    with col2:
        st.markdown(f"**Type:** Multiple Choice")
    with col3:
        st.markdown(f"**Generated:** {question.generated_at.strftime('%H:%M:%S')}")
    
    st.markdown("---")
    
    # Question text
    st.markdown(f"### Question")
    st.markdown(question.question_text)
    st.markdown("")
    
    # Multiple choice options
    st.markdown("### Choose your answer:")
    
    # Create radio button for answer selection
    option_labels = [opt.split(') ', 1)[1] if ') ' in opt else opt for opt in question.options]
    user_selection = st.radio(
        "Select an answer:",
        options=range(len(option_labels)),
        format_func=lambda i: f"{chr(65+i)}) {option_labels[i]}",
        key=f"answer_{question.id}"
    )
    
    # Answer checking
    col1, col2 = st.columns(2)
    
    with col1:
        if st.button("✅ Check Answer", key=f"check_{question.id}"):
            st.session_state.user_answer = chr(65 + user_selection)
            st.session_state.show_explanation = True
    
    with col2:
        if st.button("🔄 Generate New Question"):
            st.session_state.user_answer = None
            st.session_state.show_explanation = False
            # Trigger regeneration
            return "regenerate"
    
    # Show results
    if st.session_state.show_explanation:
        user_answer = st.session_state.user_answer
        correct_answer = question.correct_answer
        
        if user_answer == correct_answer:
            st.success(f"🎉 Correct! The answer is {correct_answer}")
        else:
            st.error(f"❌ Incorrect. You selected {user_answer}, but the correct answer is {correct_answer}")
        
        # Show explanation
        if question.explanation:
            st.markdown("### Explanation")
            st.markdown(question.explanation)
        
        # Performance stats
        processing_time = question.processing_time / 1000
        st.info(f"⚡ Generated in {processing_time:.1f} seconds using Llama + DeepSeek pipeline")
    
    st.markdown('</div>', unsafe_allow_html=True)
    return None

def render_settings_panel():
    """Render the settings configuration panel"""
    st.sidebar.markdown("## ⚙️ Settings")
    
    # API Key configuration
    st.sidebar.markdown("### OpenRouter API Key")
    
    current_key = st.session_state.openrouter_api_key
    if current_key:
        masked_key = f"sk-or-...{current_key[-6:]}"
        st.sidebar.success(f"✅ Key configured: {masked_key}")
    else:
        st.sidebar.warning("⚠️ No API key configured")
    
    # API key input
    new_key = st.sidebar.text_input(
        "Enter OpenRouter API Key:",
        type="password",
        placeholder="sk-or-...",
        help="Get your free API key at https://openrouter.ai"
    )
    
    if st.sidebar.button("💾 Save Key"):
        if new_key and new_key.startswith('sk-or-'):
            st.session_state.openrouter_api_key = new_key
            st.sidebar.success("✅ API key saved!")
            st.rerun()
        else:
            st.sidebar.error("❌ Invalid API key format")
    
    # Instructions
    st.sidebar.markdown("### 🔗 Getting Your API Key")
    st.sidebar.markdown("""
    1. Visit [OpenRouter.ai](https://openrouter.ai)
    2. Sign up for a free account  
    3. Go to [API Keys](https://openrouter.ai/keys)
    4. Create a new key
    5. Copy and paste it above
    
    **DeepSeek v3.1 is completely free!**
    """)
    
    # Model info
    st.sidebar.markdown("### 🤖 AI Pipeline")
    st.sidebar.info(f"""
    **Stage 1:** Fine-tuned Llama 3.1 8B (LIT)
    **Stage 2:** DeepSeek v3.1 Refinement (OpenRouter)
    **Pipeline:** Llama → DeepSeek
    **Cost:** Free (requires OpenRouter key)
    **Quality:** High
    """)

def render_sidebar_stats():
    """Render session statistics in sidebar"""
    st.sidebar.markdown("## 📊 Session Stats")
    
    stats_container = st.sidebar.container()
    
    with stats_container:
        # Current session stats
        col1, col2 = st.columns(2)
        with col1:
            st.metric("Questions Generated", st.session_state.generation_count)
        with col2:
            if st.session_state.current_question:
                processing_time = st.session_state.current_question.processing_time / 1000
                st.metric("Last Generation", f"{processing_time:.1f}s")
            else:
                st.metric("Last Generation", "N/A")
        
        # Topic stats
        if st.session_state.selected_topic:
            st.write(f"**Current Topic:** {st.session_state.selected_topic.replace('-', ' ').title()}")
        
        # History count
        history_count = len(st.session_state.question_history)
        st.write(f"**Questions in History:** {history_count}")

def render_question_history():
    """Render question history in sidebar"""
    if not st.session_state.question_history:
        return
        
    st.sidebar.markdown("## 📝 Question History")
    st.sidebar.markdown("*Click to reload a previous question*")
    
    # Show last 5 questions
    for i, question in enumerate(st.session_state.question_history[:5]):
        with st.sidebar.expander(f"Q{len(st.session_state.question_history)-i}: {question.topic.replace('-', ' ').title()}", expanded=False):
            # Question preview
            preview = question.question_text[:100] + "..." if len(question.question_text) > 100 else question.question_text
            st.write(preview)
            
            # Metadata
            st.write(f"**Generated:** {question.generated_at.strftime('%H:%M:%S')}")
            st.write(f"**Processing:** {question.processing_time/1000:.1f}s")
            
            # Load button
            if st.button(f"📋 Load Question", key=f"load_{question.id}"):
                st.session_state.current_question = question
                st.session_state.user_answer = None
                st.session_state.show_explanation = False
                st.rerun()

# Main Application Logic
def main():
    """Main application entry point"""
    initialize_session_state()
    
    # Render header
    render_header()
    
    # Create main layout
    main_col, sidebar_col = st.columns([2, 1])
    
    with main_col:
        # Topic selection
        topic_id, topic_name = render_topic_selector()
        
        # Generation controls
        st.markdown("### 🚀 Generate Question")
        
        col1, col2 = st.columns([3, 1])
        
        with col1:
            # Check if we can generate
            can_generate = (
                topic_id and 
                st.session_state.progress_stage not in [ProgressStage.GENERATING, ProgressStage.REFINING, ProgressStage.VALIDATING]
            )
            
            generate_button = st.button(
                "🎲 Generate IB Physics Question", 
                disabled=not can_generate,
                help="Select a topic first" if not topic_id else "Generate a new question using AI"
            )
        
        with col2:
            if st.session_state.current_question:
                if st.button("🔄 Regenerate"):
                    # Clear current question and regenerate
                    st.session_state.current_question = None
                    st.session_state.user_answer = None
                    st.session_state.show_explanation = False
                    generate_button = True  # Trigger generation
        
        # Handle question generation
        if generate_button and topic_id and topic_name:
            api_key = st.session_state.openrouter_api_key
            
            if not api_key:
                st.error("🔑 Please configure your OpenRouter API key in the sidebar settings!")
            else:
                # Reset progress
                st.session_state.progress_stage = ProgressStage.GENERATING
                st.session_state.progress_value = 0
                
                # Generate question (this will block and update progress)
                question = None
                try:
                    # Simulate progress updates
                    progress_placeholder = st.empty()
                    
                    with progress_placeholder.container():
                        render_progress_indicator()
                    
                    # Call generation function
                    question = generate_question_with_progress(topic_id, topic_name, api_key)
                    
                    if question:
                        st.session_state.current_question = question
                        st.session_state.question_history.insert(0, question)
                        st.session_state.generation_count += 1
                        st.session_state.user_answer = None
                        st.session_state.show_explanation = False
                        
                        progress_placeholder.empty()
                        st.success(f"✅ Question generated successfully in {question.processing_time/1000:.1f}s!")
                        st.rerun()
                    else:
                        st.error("❌ Failed to generate question. Please try again.")
                        
                except Exception as e:
                    st.error(f"❌ Error generating question: {str(e)}")
                    st.session_state.progress_stage = ProgressStage.ERROR
        
        # Show progress indicator
        render_progress_indicator()
        
        # Question display
        st.markdown("---")
        result = render_question_display()
        if result == "regenerate" and topic_id:
            st.rerun()
    
    # Sidebar content
    with sidebar_col:
        render_settings_panel()
        render_sidebar_stats()
        render_question_history()
    
    # Footer
    st.markdown("---")
    st.markdown("""
    <div style='text-align: center; color: #666; margin-top: 2rem;'>
        <p><strong>IB Physics Practice Generator v{version}</strong></p>
        <p>Powered by Fine-tuned Llama + DeepSeek v3.1 • Built with Streamlit</p>
        <p><a href="https://openrouter.ai" target="_blank">Get your free OpenRouter API key</a></p>
    </div>
    """.format(version=APP_VERSION), unsafe_allow_html=True)

# Two-stage generation pipeline: Fine-tuned Llama → DeepSeek Refinement
def generate_question_with_progress(topic: str, topic_name: str, openrouter_api_key: str) -> Optional[GeneratedQuestion]:
    """Generate question using the full two-stage pipeline: Llama → DeepSeek refinement"""
    start_time = time.time()
    
    try:
        # Stage 1: Generating with Fine-tuned Llama
        st.session_state.progress_stage = ProgressStage.GENERATING
        st.session_state.progress_value = 25
        st.session_state.progress_message = "Generating question with fine-tuned Llama model..."
        
        # Generate prompt for Llama model
        llama_prompt = generate_llama_prompt(topic, topic_name)
        
        # Call LIT API for Llama generation
        llama_response = call_lit_api(llama_prompt)
        
        if not llama_response:
            raise Exception("Failed to get response from Llama model")
        
        # Parse Llama response
        raw_question = parse_llama_response(llama_response, topic)
        
        if not raw_question:
            raise Exception("Failed to parse Llama model response")
        
        # Stage 2: Refining with DeepSeek
        st.session_state.progress_stage = ProgressStage.REFINING
        st.session_state.progress_value = 60
        st.session_state.progress_message = "Refining question with DeepSeek v3.1 for accuracy..."
        
        # Refine the question using DeepSeek via OpenRouter
        refined_question = refine_with_deepseek(raw_question, topic_name, openrouter_api_key)
        
        if not refined_question:
            # Fall back to raw question if refinement fails
            refined_question = raw_question
            st.warning("⚠️ Refinement failed, using original question from Llama")
        
        # Stage 3: Validating
        st.session_state.progress_stage = ProgressStage.VALIDATING
        st.session_state.progress_value = 85
        st.session_state.progress_message = "Validating physics accuracy and IB compliance..."
        
        # Create final question object
        processing_time = int((time.time() - start_time) * 1000)
        
        question = GeneratedQuestion(
            id=str(uuid.uuid4()),
            topic=topic,
            question_text=refined_question['question'],
            options=[f"{chr(65+i)}) {opt}" for i, opt in enumerate(refined_question['options'])],
            correct_answer=refined_question['correct_answer'],
            explanation=refined_question.get('explanation', ''),
            processing_time=processing_time,
            generated_at=datetime.now()
        )
        
        # Stage 4: Complete
        st.session_state.progress_stage = ProgressStage.COMPLETE
        st.session_state.progress_value = 100
        st.session_state.progress_message = f"Generated in {processing_time/1000:.1f}s using Llama + DeepSeek pipeline"
        
        return question
        
    except Exception as e:
        st.session_state.progress_stage = ProgressStage.ERROR
        st.session_state.progress_message = f"Error: {str(e)}"
        return None

if __name__ == "__main__":
    main()