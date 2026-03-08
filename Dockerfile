FROM python:3.10

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir -r backend/requirements.txt

WORKDIR /app/backend

CMD ["gunicorn", "app:app", "-k", "eventlet", "-w", "1", "--bind", "0.0.0.0:8080"]