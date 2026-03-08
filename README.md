# Finger Ninja - Gesture Magic with Emotion Adaptive Gameplay

This project uses Computer Vision to control a game via hand gestures and adapts difficulty based on your stress levels (facial cues).

## 🚀 Setup Instructions (Local VS Code)

1. **Install Python 3.10+**
2. **Install Dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```
3. **Run the Backend**:
   ```bash
   python backend/app.py
   ```
4. **Open the Game**:
   Open `frontend/index.html` in your browser.

## 🎮 Controls
- **Swipe Hand Left/Right**: Move the Ninja.
- **Pinch (Thumb + Index)**: Shoot Shuriken.
- **Open Palm**: Activate Energy Shield.
- **Stress Detection**: If you blink rapidly or furrow your brows, the enemies will speed up! Stay calm to keep the game easy.

## 🛠 Tech Stack
- **Backend**: Python, Flask, OpenCV, MediaPipe, Flask-SocketIO.
- **Frontend**: HTML5 Canvas, JavaScript, Socket.io.
- **AI**: Real-time Hand Landmark Tracking & Face Mesh Analysis.
