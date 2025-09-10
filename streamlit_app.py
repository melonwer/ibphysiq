# streamlit_app.py
"""
Minimal Streamlit app for IB Physics practice generator.

Usage:
- Add OPENAI_API_KEY to Streamlit secrets (or set as env var OPENAI_API_KEY)
- Deploy to Streamlit Community Cloud and set main file to streamlit_app.py
"""

import streamlit as st
import os
import openai
from typing import Optional


def get_api_key() -> Optional[str]:
    return st.secrets.get("OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")


def generate_with_openai(prompt: str, api_key: str, model: str = "gpt-3.5-turbo") -> str:
    openai.api_key = api_key
    try:
        resp = openai.ChatCompletion.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            temperature=0.7,
        )
        return resp["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"Error: {e}"


def main():
    st.set_page_config(page_title="IB Physics Practice (Streamlit)", layout="centered")
    st.title("IB Physics practice generator — Streamlit demo")
    st.markdown(
        "Enter a prompt to generate an IB-style physics question. "
        "Add your OpenAI key to Streamlit secrets as OPENAI_API_KEY or set env var."
    )

    with st.form("gen_form"):
        topic = st.selectbox("Topic", ["Mechanics", "Electricity", "Waves", "Thermal", "Other"])
        difficulty = st.selectbox("Difficulty", ["SL (Standard)", "HL (Higher)"])
        prompt_input = st.text_area("Prompt", value="Write a short IB-style kinematics question (include the answer).", height=150)
        use_defaults = st.checkbox("Auto-build prompt from topic/difficulty", value=True)
        submitted = st.form_submit_button("Generate")

    if use_defaults and (not prompt_input or prompt_input.strip() == ""):
        prompt_input = f"Write a concise IB-style {difficulty} question about {topic} with answer and short marking scheme."

    if submitted:
        api_key = get_api_key()
        if not api_key:
            st.error("OPENAI_API_KEY not found. Add it to Streamlit secrets or set env var OPENAI_API_KEY.")
        else:
            with st.spinner("Generating..."):
                result = generate_with_openai(prompt_input, api_key)
            if result.startswith("Error:"):
                st.error(result)
            else:
                st.subheader("Generated question")
                st.write(result)
                st.download_button("Download as .txt", result, file_name="ib_physics_question.txt", mime="text/plain")


if __name__ == "__main__":
    main()