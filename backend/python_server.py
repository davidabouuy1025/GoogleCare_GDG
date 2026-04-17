import os
import base64
import json
import io
from flask import Flask, request, jsonify
from flask_cors import CORS

import numpy as np
from PIL import Image

# Google Vision
from google.cloud import vision
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

# TFLite
try:
    import tflite_runtime.interpreter as tflite
except ImportError:
    import tensorflow as tf
    tflite = tf.lite


# ───────────────── APP SETUP ─────────────────
app = Flask(__name__)
CORS(app)

# ───────────────── CONFIG ─────────────────
TOKEN_FILE = "token.json"
MODEL_FILE = "wound_classifier.tflite"

IMG_SIZE = (224, 224)
CLASS_NAMES = ["burn", "cut", "infection", "ulcer"]

# ───────────────── GLOBAL STATE ─────────────────
interpreter = None
input_details = None
output_details = None
model_ready = False


# ───────────────── MODEL LOADING (LAZY SAFE) ─────────────────
def load_tflite_model():
    global interpreter, input_details, output_details, model_ready

    if not os.path.exists(MODEL_FILE):
        print("❌ Model not found")
        return False

    interpreter = tflite.Interpreter(model_path=MODEL_FILE)
    interpreter.allocate_tensors()

    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    model_ready = True
    print("✅ TFLite model loaded")
    return True


def ensure_model():
    global model_ready
    if not model_ready:
        try:
            load_tflite_model()
        except Exception as e:
            print("⚠️ Model load failed:", e)


# ───────────────── IMAGE PREPROCESS ─────────────────
def preprocess_image(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize(IMG_SIZE)

    arr = np.array(img, dtype=np.float32) / 255.0
    return np.expand_dims(arr, axis=0)


# ───────────────── TFLITE INFERENCE ─────────────────
def run_tflite(image_bytes):
    ensure_model()

    if interpreter is None:
        return {"error": "Model not available"}

    try:
        img = preprocess_image(image_bytes)

        interpreter.set_tensor(input_details[0]["index"], img)
        interpreter.invoke()

        preds = interpreter.get_tensor(output_details[0]["index"])[0]

        idx = int(np.argmax(preds))
        conf = float(preds[idx])

        if conf < 0.6:
            return {
                "type": "uncertain",
                "confidence": round(conf * 100, 2)
            }

        return {
            "type": CLASS_NAMES[idx],
            "confidence": round(conf * 100, 2),
            "allScores": {
                CLASS_NAMES[i]: round(float(preds[i]) * 100, 2)
                for i in range(len(CLASS_NAMES))
            }
        }

    except Exception as e:
        return {"error": str(e)}


# ───────────────── GOOGLE VISION ─────────────────
def get_vision_client():
    if not os.path.exists(TOKEN_FILE):
        raise RuntimeError("token.json missing")

    with open(TOKEN_FILE) as f:
        data = json.load(f)

    creds = Credentials(
        token=data.get("token"),
        refresh_token=data.get("refresh_token"),
        token_uri=data.get("token_uri"),
        client_id=data.get("client_id"),
        client_secret=data.get("client_secret"),
        scopes=data.get("scopes"),
    )

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())

    return vision.ImageAnnotatorClient(credentials=creds)


def run_vision_api(image_bytes):
    client = get_vision_client()
    image = vision.Image(content=image_bytes)

    response = client.label_detection(image=image)

    labels = [
        {"desc": l.description, "score": round(l.score, 3)}
        for l in response.label_annotations[:10]
    ]

    text = " ".join([l["desc"].lower() for l in labels])

    if "burn" in text:
        wound = "burn"
    elif "cut" in text:
        wound = "cut"
    elif "infection" in text:
        wound = "infection"
    elif "ulcer" in text:
        wound = "ulcer"
    else:
        wound = "unknown"

    return {"type": wound, "labels": labels}


# ───────────────── ROUTES ─────────────────
@app.route("/api/python/health")
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": model_ready,
        "vision_ready": os.path.exists(TOKEN_FILE)
    })


@app.route("/api/python/analyze", methods=["POST"])
def analyze():
    data = request.get_json(force=True)
    images = data.get("images", [])

    if not images:
        return jsonify({"error": "No images"}), 400

    results = []

    for b64 in images:
        try:
            if "," in b64:
                b64 = b64.split(",")[1]

            img_bytes = base64.b64decode(b64)
            results.append(run_tflite(img_bytes))

        except Exception as e:
            results.append({"error": str(e)})

    return jsonify({"results": results})


@app.route("/api/python/vision", methods=["POST"])
def vision_route():
    data = request.get_json(force=True)
    b64 = data.get("image", "")

    if not b64:
        return jsonify({"error": "No image"}), 400

    try:
        if "," in b64:
            b64 = b64.split(",")[1]

        img_bytes = base64.b64decode(b64)
        return jsonify(run_vision_api(img_bytes))

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ───────────────── MAIN (CRITICAL FOR CLOUD RUN) ─────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"🚀 Server starting on 0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port)