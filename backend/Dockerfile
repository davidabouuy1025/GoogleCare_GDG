# Use a slim Python base — TF is large, so we slim where possible
FROM python:3.11-slim

WORKDIR /app

# Install system deps for TensorFlow
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy model files and server code
COPY . .

# Cloud Run uses PORT env var
ENV PORT=8080
EXPOSE 8080

CMD ["python", "server.py"]