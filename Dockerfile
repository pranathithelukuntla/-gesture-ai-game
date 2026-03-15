FROM python:3.10

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir -r backend/requirements.txt

WORKDIR /app/backend

EXPOSE 8080

# Use shell form so $PORT environment variable is evaluated at runtime
CMD gunicorn -k eventlet -w 1 -b 0.0.0.0:${PORT:-8080} app:app