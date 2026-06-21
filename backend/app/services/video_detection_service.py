"""
VideoDetectionService – YOLOv8-based vehicle detection, violation tracking,
CCS scoring, HUD overlay, and alert banner rendering.
"""
import cv2
import numpy as np
from collections import deque, defaultdict
from ultralytics import YOLO
from app.utils.ccs_helper import get_ccs_category as _ccs_category, get_ccs_color as _ccs_color


# YOLO class IDs for vehicles of interest
VEHICLE_CLASSES = {2: "CAR", 3: "MOTORCYCLE", 5: "BUS", 7: "TRUCK"}
HEAVY_VEHICLES = {"BUS", "TRUCK"}

# Violation thresholds
STATIONARY_FRAMES = 10
MOVEMENT_THRESHOLD_PX = 25
HEAVY_MOVEMENT_THRESHOLD_PX = 15

# HUD / overlay constants
ZONE_NAME = "Btp082 - Kr Market Junction"
HUD_BG = (0, 0, 0)
HUD_TEXT_COLOR = (255, 255, 255)
VIOLATION_BOX_COLOR = (0, 0, 255)       # Red in BGR
NORMAL_BOX_COLOR = (0, 200, 100)        # Green in BGR
ALERT_BG = (0, 0, 200)                  # Dark red
ALERT_TEXT = "ALERT: HIGH CONGESTION RISK - DEPLOY ENFORCEMENT NOW"
ALERT_CCS_THRESHOLD = 3.5

class VideoDetectionService:
    """Processes video frames with YOLOv8 nano, tracks vehicles, detects
    stationary violations, computes live CCS, and renders overlays."""

    def __init__(self, video_path: str):
        self.video_path = video_path
        self.model = YOLO("yolov8n.pt")
        self.cap = cv2.VideoCapture(video_path)
        if not self.cap.isOpened():
            raise RuntimeError(f"Cannot open video: {video_path}")

        # Per-track history: track_id -> deque of (cx, cy) positions
        self.tracks: dict[int, deque] = defaultdict(lambda: deque(maxlen=30))
        # Per-track class label
        self.track_classes: dict[int, str] = {}
        # Set of track_ids currently flagged as violations
        self.violation_ids: set[int] = set()

        # Cumulative counters (reset never – grow over session)
        self.total_violations = 0
        self.frame_id = 0

    def _read_frame(self) -> np.ndarray:
        """Read the next frame, looping the video on EOF."""
        ret, frame = self.cap.read()
        if not ret:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = self.cap.read()
            if not ret:
                raise RuntimeError("Video cannot be read even after rewind")
        return frame

    def process_frame(self) -> dict:
        """Run detection + tracking on the next frame and return metadata."""
        frame = self._read_frame()
        self.frame_id += 1
        h, w = frame.shape[:2]

        # Run YOLO with built-in tracker
        results = self.model.track(
            frame,
            persist=True,
            classes=list(VEHICLE_CLASSES.keys()),
            conf=0.35,
            verbose=False,
        )

        vehicle_counts = {"CAR": 0, "MOTORCYCLE": 0, "BUS": 0, "TRUCK": 0}
        violations_this_frame: list[dict] = []

        if results and results[0].boxes is not None:
            boxes = results[0].boxes
            for box in boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                vtype = VEHICLE_CLASSES.get(cls_id)
                if vtype is None:
                    continue
                vehicle_counts[vtype] += 1

                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

                # Track ID (may be None if tracker lost it)
                track_id = int(box.id[0]) if box.id is not None else None

                is_violation = False
                if track_id is not None:
                    self.tracks[track_id].append((cx, cy))
                    self.track_classes[track_id] = vtype
                    positions = self.tracks[track_id]

                    if len(positions) > STATIONARY_FRAMES:
                        first = positions[0]
                        last = positions[-1]
                        dx = abs(last[0] - first[0])
                        dy = abs(last[1] - first[1])
                        total_movement = (dx ** 2 + dy ** 2) ** 0.5

                        threshold = (
                            HEAVY_MOVEMENT_THRESHOLD_PX
                            if vtype in HEAVY_VEHICLES
                            else MOVEMENT_THRESHOLD_PX
                        )

                        if total_movement < threshold:
                            is_violation = True
                            if track_id not in self.violation_ids:
                                self.violation_ids.add(track_id)
                                self.total_violations += 1

                # Draw bounding box
                if is_violation:
                    cv2.rectangle(frame, (x1, y1), (x2, y2), VIOLATION_BOX_COLOR, 2)
                    label = f"VIOLATION: {vtype}"
                    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                    cv2.rectangle(frame, (x1, y1 - th - 8), (x1 + tw + 6, y1), VIOLATION_BOX_COLOR, -1)
                    cv2.putText(frame, label, (x1 + 3, y1 - 4),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
                    violations_this_frame.append({"type": vtype, "track_id": track_id})
                else:
                    cv2.rectangle(frame, (x1, y1), (x2, y2), NORMAL_BOX_COLOR, 2)
                    label = f"{vtype} {conf:.2f}"
                    cv2.putText(frame, label, (x1, y1 - 6),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, NORMAL_BOX_COLOR, 1, cv2.LINE_AA)

        # Compute CCS
        total_vehicles = sum(vehicle_counts.values())
        violation_density = min(self.total_violations / 20, 1.0)
        heavy_count = vehicle_counts.get("BUS", 0) + vehicle_counts.get("TRUCK", 0)
        heavy_ratio = heavy_count / max(total_vehicles, 1)
        ccs = round((0.4 * violation_density + 0.3 * heavy_ratio + 0.3 * 0.5) * 10, 2)
        ccs = min(ccs, 10.0)
        alert_active = ccs >= ALERT_CCS_THRESHOLD

        # HUD overlay (top-left)
        hud_lines = [
            f"ZONE: {ZONE_NAME}",
            f"CCS: {ccs:.2f} ({_ccs_category(ccs)})",
            f"VIOLATIONS: {self.total_violations}",
        ]
        pad = 10
        line_h = 22
        hud_h = pad * 2 + line_h * len(hud_lines)
        hud_w = 380
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (hud_w, hud_h), HUD_BG, -1)
        cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

        for i, line in enumerate(hud_lines):
            y_pos = pad + (i + 1) * line_h - 4
            color = HUD_TEXT_COLOR
            if i == 1:
                color = _ccs_color(ccs)
            cv2.putText(frame, line, (pad, y_pos),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1, cv2.LINE_AA)

        # Alert banner (bottom)
        if alert_active:
            banner_h = 40
            overlay2 = frame.copy()
            cv2.rectangle(overlay2, (0, h - banner_h), (w, h), ALERT_BG, -1)
            cv2.addWeighted(overlay2, 0.85, frame, 0.15, 0, frame)
            (atw, ath), _ = cv2.getTextSize(ALERT_TEXT, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            tx = (w - atw) // 2
            ty = h - (banner_h - ath) // 2
            cv2.putText(frame, ALERT_TEXT, (tx, ty),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)

        # Encode to JPEG
        _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])

        return {
            "jpeg_bytes": jpeg.tobytes(),
            "frame_id": self.frame_id,
            "violation_count": self.total_violations,
            "ccs_score": ccs,
            "ccs_category": _ccs_category(ccs),
            "alert_active": alert_active,
            "zone_name": ZONE_NAME,
            "vehicle_counts": vehicle_counts,
            "violations_this_frame": violations_this_frame,
        }

    def release(self):
        """Release video capture resources."""
        if self.cap and self.cap.isOpened():
            self.cap.release()