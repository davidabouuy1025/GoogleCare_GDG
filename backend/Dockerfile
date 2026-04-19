FROM python:3.11-slim

WORKDIR /app

# system deps
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# copy EVERYTHING (backend + static)
COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["python", "python_server.py"]