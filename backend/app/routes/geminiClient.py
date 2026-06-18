import os
import json
import time
import logging

from google import genai
from google.genai import types
from google.genai.errors import ServerError

logger = logging.getLogger("parkiq.gemini")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL_NAME = "gemini-2.5-flash"

_client = None
if GEMINI_API_KEY:
    _client = genai.Client(api_key=GEMINI_API_KEY)
else:
    logger.warning(
        "GEMINI_API_KEY is not set. AI insight generation will fail until it is configured."
    )


def get_client() -> genai.Client:
    if _client is None:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured on the backend."
        )
    return _client


def generate_json(prompt: str, max_output_tokens: int = 4096) -> dict:
    """
    Generate structured JSON from Gemini.
    Includes:
      - Retry on 503 errors
      - Forced JSON schema
      - Higher token limit
      - Better parsing
    """

    client = get_client()

    schema = {
        "type": "object",
        "properties": {
            "executive_summary": {"type": "string"},
            "metrics_insight": {"type": "string"},
            "hotspot_insight": {"type": "string"},
            "schedule_insight": {"type": "string"},
            "forecast_insight": {"type": "string"},
            "violation_insight": {"type": "string"},
            "vehicle_insight": {"type": "string"},
        },
        "required": [
            "executive_summary",
            "metrics_insight",
            "hotspot_insight",
            "schedule_insight",
            "forecast_insight",
            "violation_insight",
            "vehicle_insight",
        ],
    }

    last_error = None

    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL_NAME,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.3,
                    max_output_tokens=max_output_tokens,
                    response_mime_type="application/json",
                    response_schema=schema,
                ),
            )

            raw_text = (response.text or "").strip()

            if not raw_text:
                raise ValueError("Gemini returned empty response")

            # Debug logging
            print("=" * 100)
            print(raw_text[:2000])
            print("=" * 100)

            return json.loads(raw_text)

        except ServerError as exc:
            last_error = exc

            logger.warning(
                "Gemini temporarily unavailable (attempt %s/3)",
                attempt + 1,
            )

            if attempt < 2:
                time.sleep(2)
                continue

        except json.JSONDecodeError as exc:
            logger.error(
                "Invalid JSON from Gemini: %s",
                str(exc)
            )

            logger.error(
                "Response preview: %s",
                raw_text[:1000] if "raw_text" in locals() else "No response"
            )

            raise ValueError(
                f"Gemini returned invalid JSON: {exc}"
            ) from exc

        except Exception as exc:
            logger.exception("Gemini request failed")
            raise exc

    raise last_error