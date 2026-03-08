import cv2
from flask import Flask, render_template, request
from flask_socketio import SocketIO
from hand_emotion import HandEmotionDetector
import threading
import time
import base64

app = Flask(__name__, template_folder='../frontend', static_folder='../frontend')
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
detector = HandEmotionDetector()

# ── NOTE: Camera is owned by the browser (MediaPipe JS) ─────────────────
# The Python backend does NOT open the webcam to avoid device conflicts.
# Stress analysis happens via the 'frame_data' socket event below:
# the frontend can optionally send JPEG frames here for backend AI analysis.
def capture_and_process():
    print("[Backend] Standby. Browser owns the camera (MediaPipe JS).")
    print("[Backend] Stress updates will be sent when frontend emits 'frame_data'.")
    return


# ── Optional route: frontend can POST a JPEG frame for backend analysis ─
@socketio.on('frame_data')
def handle_frame(data):
    """
    Frontend sends base64-encoded JPEG frame here for backend analysis.
    Useful when you want the backend AI to see the same webcam feed as
    the browser (e.g., when running on a remote server without webcam).
    """
    try:
        img_bytes = base64.b64decode(data.get('frame', ''))
        import numpy as np
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is not None:
            result, _ = detector.process_frame(frame)
            socketio.emit('stress_update', {
                'stressScore':  int(result.get('stressScore', 0)),
                'gesture':      result.get('gesture', 'None'),
                'moveX':        float(result.get('moveX', 0)),
                'handDetected': bool(result.get('handDetected', False))
            }, room=request.sid)
    except Exception as e:
        print(f"[Backend] frame_data handler error: {e}")


# Also handle 'process_frame' event (sent by the updated game.js)
@socketio.on('process_frame')
def handle_process_frame(data):
    try:
        img_data  = data.get('image', '').split(',')[-1]
        img_bytes = base64.b64decode(img_data)
        import numpy as np
        frame = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
        if frame is not None:
            result, _ = detector.process_frame(frame)
            from flask_socketio import emit as sio_emit
            sio_emit('gesture_data', {
                'stressScore':  int(result.get('stressScore', 0)),
                'gesture':      result.get('gesture', 'None'),
                'moveX':        float(result.get('moveX', 0)),
                'handDetected': bool(result.get('handDetected', False))
            })
    except Exception as e:
        print(f"[Backend] process_frame handler error: {e}")


@app.route('/')
def index():
    return render_template('index.html')


if __name__ == '__main__':
    print("[Backend] Starting Finger Ninja Backend...")
    print("[Backend] Socket.io server running on http://localhost:5000")
    print("[Backend] Camera is handled by the browser via MediaPipe JS.")

    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
