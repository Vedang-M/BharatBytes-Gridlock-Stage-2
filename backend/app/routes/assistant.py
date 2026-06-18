"""
ParkIQ Assistant – 100% Sarvam AI powered
  • Chat:      Sarvam Chat Completions (sarvam-30b)
  • STT:       Sarvam saaras:v3
  • Translate: Sarvam mayura:v1
  • TTS:       Sarvam bulbul:v3
No Google / Gemini dependency.
"""

import os
import requests
from fastapi import APIRouter, Request, UploadFile, File
from pydantic import BaseModel
import google.genai as genai

router = APIRouter()

# ── Constants ────────────────────────────────────────────────────────────────
SARVAM_CHAT_URL = "https://api.sarvam.ai/v1/chat/completions"
SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate"
SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"
SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"

LANG_NAMES = {
    "en-IN": "English",
    "hi-IN": "Hindi",
    "kn-IN": "Kannada",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
}


# ── Pydantic models ──────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    query: str
    language: str = "en-IN"


# ── Helpers ───────────────────────────────────────────────────────────────────
def _sarvam_key() -> str:
    return os.getenv("SARVAM_API_KEY", "").strip('"').strip("'")


def _sarvam_headers() -> dict:
    return {
        "api-subscription-key": _sarvam_key(),
        "Content-Type": "application/json",
    }


# ── Sarvam Chat Completions (LLM) ────────────────────────────────────────────
def generate_chat_response(system_prompt: str, user_query: str) -> str:
    """
    Generate a chat response via Sarvam AI's OpenAI-compatible endpoint.
    Uses sarvam-30b with reasoning_effort="low" and max_tokens=2048 to prevent
    the model from exhausting the token limit during its reasoning process.
    """
    key = _sarvam_key()
    if not key:
        return "Configuration Error: SARVAM_API_KEY is missing."

    payload = {
        "model": "sarvam-30b",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_query},
        ],
        "temperature": 0.4,
        "max_tokens": 2048,
        "reasoning_effort": "low",
    }

    try:
        res = requests.post(
            SARVAM_CHAT_URL,
            json=payload,
            headers=_sarvam_headers(),
            timeout=30,
        )
        print(f"[Sarvam LLM] HTTP {res.status_code}")
        if res.status_code != 200:
            print(f"[Sarvam LLM] Error: {res.text[:400]}")
            res.raise_for_status()

        data = res.json()
        choices = data.get("choices", [])
        if not choices:
            print(f"[Sarvam LLM] No choices returned. Full response: {str(data)[:500]}")
            return "I'm sorry, the AI service did not return a response. Please try again."

        message = choices[0].get("message", {})
        content = message.get("content")

        if not content:
            # Check fallback fields in case of different API shapes
            content = message.get("text") or choices[0].get("text") or ""
            print(f"[Sarvam LLM] content was None/empty, fallback text length: {len(content)}")

        if not content:
            print(f"[Sarvam LLM] Empty content. Full message: {message}")
            return "I'm sorry, the AI could not generate a response. Please try again."

        return content.strip()
    except Exception as e:
        print(f"[Sarvam LLM Error] {type(e).__name__}: {e}")
        return f"LLM Error: {e}"


# ── Sarvam Translate ──────────────────────────────────────────────────────────
def translate_text_with_detection(text: str, source_lang: str, target_lang: str) -> tuple[str, str]:
    """
    Translate text between languages via Sarvam AI mayura:v1.
    Returns a tuple of (translated_text, detected_source_language).
    """
    key = _sarvam_key()
    if not key:
        return text, source_lang

    if source_lang != "auto" and source_lang == target_lang:
        return text, source_lang

    payload = {
        "input": text,
        "source_language_code": source_lang,
        "target_language_code": target_lang,
        "speaker_gender": "Female",
        "mode": "formal",
        "model": "mayura:v1",
    }
    try:
        res = requests.post(
            SARVAM_TRANSLATE_URL,
            json=payload,
            headers=_sarvam_headers(),
            timeout=15,
        )
        res.raise_for_status()
        data = res.json()
        translated = data.get("translated_text", text)
        detected = data.get("source_language_code", source_lang)
        return translated, detected
    except Exception as e:
        print(f"[Sarvam Translate Error] {e}")
        return text, source_lang


# ── Sarvam TTS ────────────────────────────────────────────────────────────────
def generate_speech(text: str, language_code: str) -> str:
    """Generate TTS audio via Sarvam AI bulbul:v3. Returns base64-encoded WAV."""
    key = _sarvam_key()
    if not key:
        print("[TTS] No SARVAM_API_KEY – skipping")
        return ""

    speaker_map = {
        "en-IN": "ritu",
        "hi-IN": "ritu",
        "kn-IN": "ritu",
        "ta-IN": "ritu",
        "te-IN": "ritu",
    }
    speaker = speaker_map.get(language_code, "ritu")

    # bulbul:v3 limit ≈ 2500 chars; trim safely
    trimmed = text[:2000] if len(text) > 2000 else text

    payload = {
        "text": trimmed,
        "target_language_code": language_code,
        "speaker": speaker,
        "model": "bulbul:v3",
        "pace": 1.0,
        "output_audio_codec": "wav",
    }
    try:
        res = requests.post(
            SARVAM_TTS_URL,
            json=payload,
            headers=_sarvam_headers(),
            timeout=25,
        )
        print(f"[TTS] HTTP {res.status_code}")
        if res.status_code != 200:
            print(f"[TTS] Error: {res.text[:300]}")
            res.raise_for_status()

        data = res.json()
        audios = data.get("audios", [])
        if audios:
            return audios[0]
        else:
            print(f"[TTS] No audio in response. Keys: {list(data.keys())}")
    except Exception as e:
        print(f"[Sarvam TTS Error] {type(e).__name__}: {e}")
    return ""


# ── STT endpoint ──────────────────────────────────────────────────────────────
@router.post("/stt")
async def speech_to_text_sarvam(file: UploadFile = File(...)):
    """
    Convert speech audio to text using Sarvam AI saaras:v3.
    Returns { transcript, language_code }.
    """
    key = _sarvam_key()
    if not key:
        return {"transcript": "", "language_code": "en-IN", "error": "No SARVAM_API_KEY"}

    audio_bytes = await file.read()
    print(f"[STT] Received audio: {len(audio_bytes)} bytes, type={file.content_type}")

    filename = file.filename or "audio.wav"
    content_type = file.content_type or "application/octet-stream"

    # Map browser webm/opus types to application/octet-stream to bypass Sarvam's MIME validator
    if "webm" in content_type or "opus" in content_type:
        content_type = "application/octet-stream"
        if not filename.endswith(".webm") and not filename.endswith(".bin"):
            filename = "audio.webm"
    elif "wav" in content_type and not filename.endswith(".wav"):
        filename = "audio.wav"

    try:
        res = requests.post(
            SARVAM_STT_URL,
            headers={"api-subscription-key": key},
            files={"file": (filename, audio_bytes, content_type)},
            data={"model": "saaras:v3", "mode": "transcribe", "language_code": "unknown"},
            timeout=25,
        )
        print(f"[STT] HTTP {res.status_code}")
        if res.status_code != 200:
            print(f"[STT] Error: {res.text[:300]}")
            res.raise_for_status()

        data = res.json()
        transcript = data.get("transcript", "")
        language_code = data.get("language_code", "en-IN")
        print(f"[STT] lang={language_code}, text='{transcript[:60]}'")
        return {"transcript": transcript, "language_code": language_code}
    except Exception as e:
        print(f"[STT Error] {type(e).__name__}: {e}")
        return {"transcript": "", "language_code": "en-IN", "error": str(e)}


# ── Chat endpoint ─────────────────────────────────────────────────────────────
@router.post("/chat")
async def chat_with_assistant(request: Request, payload: ChatRequest):
    # ── 1. Validate hotspot service ───────────────────────────────────────────
    try:
        hs = request.app.state.hotspot_service
    except Exception as e:
        return {
            "text": f"System Error: Hotspot service not initialized. {e}",
            "audio_base64": "",
            "language": payload.language,
        }

    sarvam_key = _sarvam_key()
    if not sarvam_key:
        return {
            "text": "Configuration Error: SARVAM_API_KEY is missing from .env",
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

    # ── 3. Translate input query to English (en-IN) & auto-detect language ────
    translated_query, detected_lang = translate_text_with_detection(payload.query, "auto", "en-IN")
    
    # Fallback to payload language if detected language is unrecognized or not supported
    if not detected_lang or detected_lang not in LANG_NAMES:
        detected_lang = payload.language or "en-IN"

    lang_name = LANG_NAMES.get(detected_lang, "English")

    # ── 4. Build system prompt ────────────────────────────────────────────────
    system_prompt = f"""You are ParkIQ, an intelligent AI copilot for the Bengaluru Traffic Police.
You answer questions based ONLY on the following parsed data from DBSCAN clustering and CCS scoring models.
If the user asks something not covered by the data, politely say you don't know based on current data.
Be concise, professional, actionable, and data-driven. Kindly add the names of the officers and inspectors of the particular division/junction only if available.Keep answers under 120 words. Avoid using Astricks in text randomly.
Always respond in English. Translation to {lang_name} is handled by a downstream service.

=== DATA SUMMARY ===
Total Violations: {summary.get('total_violations')}
Total Clusters: {summary.get('total_clusters')}
Critical Zones: {summary.get('critical_zones')}
High Risk Zones: {summary.get('high_zones')}
Peak Hour Percentage: {summary.get('peak_pct')}%

=== TOP HOTSPOTS ===
"""
    for h in hotspots:
        system_prompt += (
            f"- {h.get('top_junction', 'Unknown')}: CCS {h.get('CCS')}/10 "
            f"({h.get('CCS_category')}), Peak: {h.get('peak_pct')}%, Violations: {h.get('violations')}\n"
        )

    system_prompt += "\n=== DEPLOYMENT SCHEDULE ===\n"
    for s in schedule:
        system_prompt += (
            f"- {s.get('top_junction')}: {s.get('deploy_window')} (Priority: {s.get('priority')})\n"
        )

    # ── 5. Generate LLM response in English ───────────────────────────────────
    english_answer = generate_chat_response(system_prompt, translated_query)

    if english_answer.startswith("LLM Error:") or english_answer.startswith("Configuration Error:"):
        return {
            "text": english_answer,
            "audio_base64": "",
            "language": detected_lang,
        }

    # ── 6. Translate English response back to detected user language ──────────
    if detected_lang != "en-IN":
        final_text, _ = translate_text_with_detection(english_answer, "en-IN", detected_lang)
    else:
        final_text = english_answer

    # ── 7. Generate TTS audio in the target language ──────────────────────────
    audio_base64 = ""
    try:
        audio_base64 = generate_speech(final_text, detected_lang)
    except Exception as e:
        print(f"[TTS top-level error] {e}")

    return {
        "text": final_text,
        "audio_base64": audio_base64,
        "language": detected_lang,
    }
