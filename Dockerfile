FROM python:3.11-slim

WORKDIR /app

# System dependencies needed by OpenCV headless & mediapipe
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN pip install --no-cache-dir -r backend/requirements.txt

WORKDIR /app/backend

EXPOSE 8080

# $PORT is injected by Render at runtime
CMD gunicorn -k eventlet -w 1 -b 0.0.0.0:${PORT:-8080} app:app