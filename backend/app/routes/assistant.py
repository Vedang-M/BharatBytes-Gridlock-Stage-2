import os
import requests
from fastapi import APIRouter, Request, UploadFile, File
from pydantic import BaseModel
# pyrefly: ignore [missing-import]
import google.generativeai as genai

router = APIRouter()


class ChatRequest(BaseModel):
    query: str
    language: str = "en-IN"


def _sarvam_key() -> str:
    return os.getenv("SARVAM_API_KEY", "").strip('"').strip("'")


def _sarvam_headers() -> dict:
    return {
        "api-subscription-key": _sarvam_key(),
        "Content-Type": "application/json",
    }


def translate_text(text: str, target_lang: str) -> str:
    """Translate English text to the target language via Sarvam AI."""
    key = _sarvam_key()
    if target_lang == "en-IN" or not key:
        return text

    payload = {
        "input": text,
        "source_language_code": "en-IN",
        "target_language_code": target_lang,
        "speaker_gender": "Female",
        "mode": "formal",
        "model": "mayura:v1",
    }
    try:
        res = requests.post(
            "https://api.sarvam.ai/translate",
            json=payload,
            headers=_sarvam_headers(),
            timeout=15,
        )
        res.raise_for_status()
        return res.json().get("translated_text", text)
    except Exception as e:
        print(f"[Sarvam Translate Error] {e}")
        return text


def generate_speech(text: str, language_code: str) -> str:
    """Generate TTS audio via Sarvam AI bulbul:v3. Returns base64-encoded WAV string."""
    key = _sarvam_key()
    if not key:
        print("[TTS] No SARVAM_API_KEY configured - skipping TTS")
        return ""

    # bulbul:v3 speaker voices — 'meera' is v2-only; v3 default is 'shubh'
    # Female Indian voices for v3: ritu, priya, neha, pooja, rohan, simran...
    speaker_map = {
        "en-IN": "ritu",
        "hi-IN": "ritu",
        "kn-IN": "ritu",
        "ta-IN": "ritu",
        "te-IN": "ritu",
    }
    speaker = speaker_map.get(language_code, "shubh")

    # Sarvam v3 limit: 2500 chars; trim safely
    trimmed = text[:2000] if len(text) > 2000 else text

    # bulbul:v3 request – uses "text" (not "inputs"), no pitch/loudness/enable_preprocessing
    payload = {
        "text": trimmed,
        "target_language_code": language_code,
        "speaker": speaker,
        "model": "bulbul:v3",
        "pace": 1.0,
        "output_audio_codec": "wav",   # explicit WAV so browser can decode reliably
    }
    try:
        res = requests.post(
            "https://api.sarvam.ai/text-to-speech",
            json=payload,
            headers=_sarvam_headers(),
            timeout=25,
        )
        print(f"[TTS] HTTP {res.status_code}")
        if res.status_code != 200:
            print(f"[TTS] Error body: {res.text[:300]}")
            res.raise_for_status()

        data = res.json()
        audios = data.get("audios", [])
        if audios:
            audio_b64 = audios[0]
            print(f"[TTS] Success - audio base64 length: {len(audio_b64)} chars")
            return audio_b64
        else:
            print(f"[TTS] API returned no audio. Full response keys: {list(data.keys())}")
    except Exception as e:
        print(f"[Sarvam TTS Error] {type(e).__name__}: {e}")
    return ""


def _get_preferred_models():
    """Returns a list of model names in preference order."""
    # gemini-2.5-flash is the primary model requested by the user.
    preferred = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
    ]
    try:
        available = [
            m.name.replace("models/", "")
            for m in genai.list_models()
            if "generateContent" in m.supported_generation_methods
        ]
        print(f"[Gemini] Available models: {available}")
        
        candidates = []
        for p in preferred:
            if p in available:
                candidates.append(p)
        for a in available:
            if a not in candidates:
                candidates.append(a)
        
        # Ensure preferred are included even if listing failed to return them
        for p in preferred:
            if p not in candidates:
                candidates.append(p)
        return candidates
    except Exception as e:
        print(f"[Gemini] list_models failed: {e} - returning preferred list")
        return preferred


# ──────────────────────────────────────────────────────────────────
# Sarvam STT endpoint
# ──────────────────────────────────────────────────────────────────
@router.post("/stt")
async def speech_to_text_sarvam(file: UploadFile = File(...)):
    """
    Convert speech audio to text using Sarvam AI saarika:v2 STT model.
    Returns the transcript and the auto-detected language code.
    """
    key = _sarvam_key()
    if not key:
        return {"transcript": "", "language_code": "en-IN", "error": "No SARVAM_API_KEY"}

    audio_bytes = await file.read()
    print(f"[STT] Received audio: {len(audio_bytes)} bytes, type={file.content_type}")

    try:
        res = requests.post(
            "https://api.sarvam.ai/speech-to-text",
            headers={"api-subscription-key": key},
            files={"file": (file.filename or "audio.wav", audio_bytes, file.content_type or "audio/wav")},
            data={"model": "saarika:v2", "with_timestamps": "false"},
            timeout=25,
        )
        print(f"[STT] HTTP {res.status_code}")
        if res.status_code != 200:
            print(f"[STT] Error body: {res.text[:300]}")
            res.raise_for_status()
        data = res.json()
        transcript = data.get("transcript", "")
        language_code = data.get("language_code", "en-IN")
        print(f"[STT] Detected lang={language_code}, transcript='{transcript[:60]}'")
        return {"transcript": transcript, "language_code": language_code}
    except Exception as e:
        print(f"[STT Error] {type(e).__name__}: {e}")
        return {"transcript": "", "language_code": "en-IN", "error": str(e)}


@router.post("/chat")
async def chat_with_assistant(request: Request, payload: ChatRequest):
    # ── 1. Validate services ──────────────────────────────────────────────────
    try:
        hs = request.app.state.hotspot_service
    except Exception as e:
        return {
            "text": f"System Error: Hotspot service not initialized. {e}",
            "audio_base64": "",
            "language": payload.language,
        }

    gemini_key = os.getenv("GEMINI_API_KEY", "").strip('"').strip("'")
    if not gemini_key:
        return {
            "text": "Configuration Error: GEMINI_API_KEY is missing from .env",
            "audio_base64": "",
            "language": payload.language,
        }

    try:
        genai.configure(api_key=gemini_key)
    except Exception as e:
        return {
            "text": f"Configuration Error: Failed to configure Gemini. {e}",
            "audio_base64": "",
            "language": payload.language,
        }

    # ── 2. Load context data ──────────────────────────────────────────────────
    try:
        summary = hs.get_summary()
        hotspots = hs.get_hotspots(20)
        schedule = hs.get_schedule(5)
    except Exception as e:
        return {
            "text": f"Data Error: Failed to fetch context data. {e}",
            "audio_base64": "",
            "language": payload.language,
        }

    # ── 3. Build system prompt (Gemini ALWAYS responds in English) ──────────────
    # Language adaptation is done by Sarvam (translate + TTS), not Gemini.
    context_prompt = f"""You are ParkIQ, an intelligent AI assistant for the Bengaluru Traffic Police.
You answer questions based ONLY on the following parsed data from our DBSCAN clustering and CCS scoring models.
If the user asks something not covered by the data, politely say you don't know based on current data.
Be concise, professional, actionable, and data-driven. Keep answers under 120 words.
Always respond in English — translation is handled downstream by Sarvam AI.

=== DATA SUMMARY ===
Total Violations: {summary.get('total_violations')}
Total Clusters: {summary.get('total_clusters')}
Critical Zones: {summary.get('critical_zones')}
High Risk Zones: {summary.get('high_zones')}
Peak Hour Percentage: {summary.get('peak_pct')}%

=== TOP HOTSPOTS ===
"""
    for h in hotspots:
        context_prompt += (
            f"- {h.get('top_junction', 'Unknown')}: CCS {h.get('CCS')}/10 "
            f"({h.get('CCS_category')}), Peak: {h.get('peak_pct')}%, Violations: {h.get('violations')}\n"
        )

    context_prompt += "\n=== DEPLOYMENT SCHEDULE ===\n"
    for s in schedule:
        context_prompt += (
            f"- {s.get('top_junction')}: {s.get('deploy_window')} (Priority: {s.get('priority')})\n"
        )

    context_prompt += f"\nUser Query: {payload.query}"

    # ── 4. Generate Gemini response in English ───────────────────────────────────
    candidates = _get_preferred_models()
    english_answer = None
    last_error = None

    for model_name in candidates:
        try:
            print(f"[Gemini] Attempting generation with {model_name}...")
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(context_prompt)
            english_answer = response.text.strip()
            print(f"[Gemini] Success using {model_name}. Response length: {len(english_answer)} chars")
            break
        except Exception as e:
            last_error = e
            print(f"[Gemini Error] Failed with {model_name}: {e}")
            continue

    if not english_answer:
        return {
            "text": f"Gemini Error: All models failed. Last error: {last_error}",
            "audio_base64": "",
            "language": payload.language,
        }

    # ── 5. Sarvam Translate (English → target language) ──────────────────────
    # Sarvam handles ALL language adaptation — translation + TTS voice.
    try:
        final_text = translate_text(english_answer, payload.language)
    except Exception as e:
        final_text = english_answer
        print(f"[Translation Error] {e}")

    # ── 6. Sarvam TTS (bulbul:v3 → spoken audio in target language) ─────────
    audio_base64 = ""
    try:
        audio_base64 = generate_speech(final_text, payload.language)
    except Exception as e:
        print(f"[TTS top-level error] {e}")

    return {
        "text": final_text,
        "audio_base64": audio_base64,
        "language": payload.language,
    }
