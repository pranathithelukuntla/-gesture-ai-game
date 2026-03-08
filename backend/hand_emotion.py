import cv2
import numpy as np
import time
import sys
import os

# 1. FORCE PROTOBUF TO USE PYTHON IMPLEMENTATION (Fixes Python 3.13 binary crashes)
os.environ['PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION'] = 'python'

# 2. BULLETPROOF MEDIAPIPE IMPORTS
mp_hands = None
mp_face_mesh = None
mp_draw = None

def try_imports():
    global mp_hands, mp_face_mesh, mp_draw
    
    # # Attempt 1: Standard
    # try:
    #     import mediapipe.solutions.hands as h
    #     import mediapipe.solutions.face_mesh as f
    #     import mediapipe.solutions.drawing_utils as d
    #     mp_hands, mp_face_mesh, mp_draw = h, f, d
    #     return True
    # except Exception: pass

    # # Attempt 2: Direct internal path
    # try:
    #     from mediapipe.python.solutions import hands as h
    #     from mediapipe.python.solutions import face_mesh as f
    #     from mediapipe.python.solutions import drawing_utils as d
    #     mp_hands, mp_face_mesh, mp_draw = h, f, d
    #     return True
    # except Exception: pass
    
    # Attempt 3: Forced submodule import
    try:
        import mediapipe
        mp_hands = getattr(mediapipe, 'solutions', None).hands
        mp_face_mesh = getattr(mediapipe, 'solutions', None).face_mesh
        mp_draw = getattr(mediapipe, 'solutions', None).drawing_utils
        return True
    except Exception: pass
    
    return False

# Run the import attempts
if not try_imports():
    print("\n" + "!"*60)
    print("WARNING: MediaPipe legacy solutions failed to load.")
    print("This is a known issue with MediaPipe on Python 3.13.")
    print("The game will start, but gesture controls may be inactive.")
    print("FIX: Install Python 3.11 for 100% compatibility.")
    print("!"*60 + "\n")

class HandEmotionDetector:
    def __init__(self):
        # We no longer raise RuntimeError here to prevent the app from crashing
        self.hands = None
        self.face_mesh = None
        
        if mp_hands:
            try:
                self.hands = mp_hands.Hands(
                    static_image_mode=False,
                    max_num_hands=1,
                    min_detection_confidence=0.5, # Lowered from 0.7
                    min_tracking_confidence=0.5
                )
            except Exception as e:
                print(f"Hands init failed: {e}")

        if mp_face_mesh:
            try:
                self.face_mesh = mp_face_mesh.FaceMesh(
                    max_num_faces=1,
                    refine_landmarks=True,
                    min_detection_confidence=0.4, # Lowered
                    min_tracking_confidence=0.4
                )
            except Exception as e:
                print(f"FaceMesh init failed: {e}")
        
        # Stress tracking variables
        self.blink_count = 0
        self.last_blink_time = time.time()
        self.blink_history = [] # timestamps of recent blinks
        self.is_blinking = False
        
    def get_distance(self, p1, p2):
        return np.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)

    def process_frame(self, frame):
        if not self.hands:
            return {"gesture": "None", "moveX": 0, "stressScore": 0, "handDetected": False}, frame
        
        try:
            h, w, _ = frame.shape
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            hand_results = self.hands.process(frame_rgb)
            face_results = None
            if self.face_mesh:
                face_results = self.face_mesh.process(frame_rgb)
            
            gesture = "None"
            move_x = 0
            stress_score = 0
            hand_detected = False
            
            # 1. Hand Gesture Detection
            if hand_results.multi_hand_landmarks:
                hand_detected = True
                lm = hand_results.multi_hand_landmarks[0].landmark
                
                # Landmarks mapping
                wrist = lm[0]
                thumb_tip = lm[4]
                index_tip = lm[8]
                middle_tip = lm[12]
                ring_tip = lm[16]
                pinky_tip = lm[20]
                
                index_mcp = lm[5]
                middle_mcp = lm[9]
                ring_mcp = lm[13]
                pinky_mcp = lm[17]
                
                # Basic distances
                pinch_dist = self.get_distance(thumb_tip, index_tip)
                palm_dist = self.get_distance(wrist, middle_tip)
                
                # Finger "UP" checks (y-axis inverted in image space)
                index_up = index_tip.y < index_mcp.y
                middle_up = middle_tip.y < middle_mcp.y
                ring_up = ring_tip.y < ring_mcp.y
                pinky_up = pinky_tip.y < pinky_mcp.y
                
                # Move X based on wrist
                move_x = (wrist.x - 0.5) * 3
                
                # New Gesture Definitions
                # 1. Victory ✌️ (Shoot)
                if index_up and middle_up and not ring_up and not pinky_up:
                    gesture = "Victory"
                # 2. Pinky Up 🤙 (Multiplier) - Thumb + Pinky out
                elif pinky_up and not index_up and not middle_up and not ring_up:
                    gesture = "PinkyUp"
                # 3. OK Sign 👌 (Slow-Mo) - index+thumb touch, others up
                elif pinch_dist < 0.08 and middle_up and ring_up and pinky_up:
                    gesture = "OK"
                # 4. Open Palm 🖐 (Shield)
                elif index_up and middle_up and ring_up and pinky_up and palm_dist > 0.3:
                    gesture = "OpenPalm"
                # 5. Fist ✊ (Bomb) - all curled (lower than MCP)
                elif not index_up and not middle_up and not ring_up and not pinky_up:
                    gesture = "Fist"
                else:
                    gesture = "Neutral"

                # Draw landmarks for user feedback
                if mp_draw:
                    mp_draw.draw_landmarks(frame, hand_results.multi_hand_landmarks[0], mp_hands.HAND_CONNECTIONS)

            # 2. Face/Blink Stress Detection
            if face_results and face_results.multi_face_landmarks:
                face_lms = face_results.multi_face_landmarks[0].landmark
                
                # Eye Aspect Ratio (Simplified for left eye)
                eye_top = face_lms[159]
                eye_bottom = face_lms[145]
                eye_left = face_lms[133]
                eye_right = face_lms[173]
                
                ear = self.get_distance(eye_top, eye_bottom) / (self.get_distance(eye_left, eye_right) + 0.01)
                
                # Blink Detection (EAR < 0.2 usually indicates blink)
                if ear < 0.2:
                    if not self.is_blinking:
                        self.blink_count += 1
                        self.is_blinking = True
                        self.blink_history.append(time.time())
                else:
                    self.is_blinking = False
                
                # Keep only last 5 seconds of blinks
                now = time.time()
                self.blink_history = [t for t in self.blink_history if now - t < 5.0]
                
                # Blink Ratio: 0 to 1 (high blink rate = high stress)
                # Normal is ~0.25 blinks/sec. 1.0/sec is high.
                blink_rate = len(self.blink_history) / 5.0
                stress_from_blinks = min(blink_rate * 100, 80) # capping at 80% from blinking
                
                # Face Tension (Mouth/Brow)
                mouth_dist = self.get_distance(face_lms[13], face_lms[14]) * 500
                brow_dist = self.get_distance(face_lms[21], face_lms[251])
                brow_tension = max(0, (0.05 - brow_dist) * 1000) # brow closer = stress
                
                stress_score = int(stress_from_blinks + mouth_dist + brow_tension)
                stress_score = min(max(stress_score, 0), 100)
                
                if mp_draw:
                    mp_draw.draw_landmarks(frame, face_results.multi_face_landmarks[0], mp_face_mesh.FACEMESH_CONTOURS)

            return {
                "gesture": gesture,
                "moveX": move_x,
                "stressScore": stress_score,
                "handDetected": hand_detected
            }, frame
        except Exception as e:
            print(f"Frame processing error: {e}")
            return {"gesture": "None", "moveX": 0, "stressScore": 0, "handDetected": False}, frame

