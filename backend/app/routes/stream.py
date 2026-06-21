"""
WebSocket streaming route – sends YOLO-processed video frames as JSON.
Mounted WITHOUT the /api prefix so the endpoint is /ws/stream.
"""
import os
import asyncio
import base64
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

# VideoDetectionService import moved inside the websocket handler to defer loading PyTorch

router = APIRouter()

# Build video path relative to this file:
# stream.py -> routes/ -> app/ -> backend/ -> traffic.mp4
VIDEO_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'traffic.mp4')
)


@router.websocket("/ws/stream")
async def video_stream(websocket: WebSocket):
    """Stream YOLO-processed video frames over WebSocket at ~15 FPS."""
    await websocket.accept()
    print(f"[Stream] WebSocket connected. Video: {VIDEO_PATH}")

    detector = None
    try:
        from app.services.video_detection_service import VideoDetectionService
        detector = VideoDetectionService(VIDEO_PATH)

        while True:
            result = detector.process_frame()

            # Base64-encode the JPEG frame
            frame_b64 = base64.b64encode(result["jpeg_bytes"]).decode("ascii")

            payload = {
                "frame": frame_b64,
                "frame_id": result["frame_id"],
                "violation_count": result["violation_count"],
                "ccs_score": result["ccs_score"],
                "ccs_category": result["ccs_category"],
                "alert_active": result["alert_active"],
                "zone_name": result["zone_name"],
                "vehicle_counts": result["vehicle_counts"],
                "violations_this_frame": result["violations_this_frame"],
            }

            await websocket.send_json(payload)

            # ~15 FPS
            await asyncio.sleep(0.067)

    except WebSocketDisconnect:
        print("[Stream] Client disconnected")
    except Exception as e:
        print(f"[Stream] Error: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass
    finally:
        if detector:
            detector.release()
        print("[Stream] Cleanup done")
