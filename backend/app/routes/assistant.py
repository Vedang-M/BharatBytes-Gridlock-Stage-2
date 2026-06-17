import os
import json
import requests
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
# pyrefly: ignore [missing-import]
import google.generativeai as genai

router = APIRouter()

class ChatRequest(BaseModel):
    query: str
    language: str = "en-IN"

def get_sarvam_headers():
    key = os.getenv("SARVAM_API_KEY", "").strip('"').strip("'")
    return {
        "api-subscription-key": key,
        "Content-Type": "application/json"
    }

def translate_text(text: str, target_lang: str) -> str:
    key = os.getenv("SARVAM_API_KEY", "").strip('"').strip("'")
    if target_lang == "en-IN" or not key:
        return text
    
    payload = {
        "input": text,
        "source_language_code": "en-IN",
        "target_language_code": target_lang,
        "speaker_gender": "Female",
        "mode": "formal",
        "model": "mayura:v1"
    }
    try:
        res = requests.post("https://api.sarvam.ai/translate", json=payload, headers=get_sarvam_headers(), timeout=10)
        res.raise_for_status()
        return res.json().get("translated_text", text)
    except Exception as e:
        print(f"Sarvam Translate Error: {e}")
        return text

def generate_speech(text: str, language_code: str) -> str:
    key = os.getenv("SARVAM_API_KEY", "").strip('"').strip("'")
    if not key:
        return ""
    
    payload = {
        "inputs": [text],
        "target_language_code": language_code,
        "speaker": "meera",
        "pitch": 0,
        "pace": 1.0,
        "loudness": 1.5,
        "speech_sample_rate": 8000,
        "enable_preprocessing": True,
        "model": "bulbul:v1"
    }
    try:
        res = requests.post("https://api.sarvam.ai/text-to-speech", json=payload, headers=get_sarvam_headers(), timeout=15)
        res.raise_for_status()
        audios = res.json().get("audios", [])
        if audios:
            return audios[0]
    except Exception as e:
        print(f"Sarvam TTS Error: {e}")
    return ""

@router.post("/chat")
async def chat_with_assistant(request: Request, payload: ChatRequest):
    try:
        hs = request.app.state.hotspot_service
    except Exception as e:
        return {"text": f"System Error: Hotspot service not initialized. {str(e)}", "audio_base64": "", "language": payload.language}
    
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip('"').strip("'")
    if not gemini_key:
        return {"text": "Configuration Error: GEMINI_API_KEY is missing from .env", "audio_base64": "", "language": payload.language}
        
    try:
        genai.configure(api_key=gemini_key)
    except Exception as e:
        return {"text": f"Configuration Error: Failed to configure Gemini. {str(e)}", "audio_base64": "", "language": payload.language}

    try:
        summary = hs.get_summary()
        hotspots = hs.get_hotspots(20)
        schedule = hs.get_schedule(5)
    except Exception as e:
        return {"text": f"Data Error: Failed to fetch context data. {str(e)}", "audio_base64": "", "language": payload.language}

    context_prompt = f"""
    You are ParkIQ, an intelligent AI assistant for the Bengaluru Traffic Police.
    You answer questions based ONLY on the following parsed data from our DBSCAN clustering and CCS scoring models.
    If the user asks something not covered by the data, politely say you don't know based on current data.
    Be concise, professional, and lucid.
    
    === DATA SUMMARY ===
    Total Violations: {summary.get('total_violations')}
    Total Clusters: {summary.get('total_clusters')}
    Critical Zones: {summary.get('critical_zones')}
    High Risk Zones: {summary.get('high_zones')}
    Peak Hour Percentage: {summary.get('peak_pct')}%
    
    === TOP HOTSPOTS ===
    """
    for h in hotspots:
        context_prompt += f"- {h.get('top_junction', 'Unknown')}: CCS {h.get('CCS')}/10 ({h.get('CCS_category')}), Peak: {h.get('peak_pct')}%, Violations: {h.get('violations')}\n"

    context_prompt += "\n=== DEPLOYMENT SCHEDULE ===\n"
    for s in schedule:
        context_prompt += f"- {s.get('top_junction')}: {s.get('deploy_window')} (Priority: {s.get('priority')})\n"

    context_prompt += f"\nUser Query: {payload.query}"

    try:
        # Using gemini-1.5-flash as it is the current standard. If it 404s, we'll see the exact error.
        model = genai.GenerativeModel("gemini-3-flash-preview")
        response = model.generate_content(context_prompt)
        english_answer = response.text.strip()
    except Exception as e:
        return {"text": f"Gemini API Error: {str(e)}", "audio_base64": "", "language": payload.language}

    # Translate and TTS via Sarvam AI
    try:
        final_text = translate_text(english_answer, payload.language)
    except Exception as e:
        final_text = f"Translation Error: {str(e)} | Original: {english_answer}"

    try:
        audio_base64 = generate_speech(final_text, payload.language)
    except Exception as e:
        audio_base64 = ""
        final_text += f"\n(TTS Error: {str(e)})"

    return {
        "text": final_text,
        "audio_base64": audio_base64,
        "language": payload.language
    }
