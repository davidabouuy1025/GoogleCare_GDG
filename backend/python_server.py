import os
import base64
import json
import io
from flask import Flask, request, jsonify
from flask_cors import CORS

# Google Auth
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google.auth.exceptions import RefreshError

# Google Cloud Vision
from google.cloud import vision

# TFLite / TensorFlow
import numpy as np
from PIL import Image

# ── Try TFLite runtime first (faster) ─────────────────────────
try:
    import tflite_runtime.interpreter as tflite
except ImportError:
    import tensorflow as tf
    tflite = tf.lite

app = Flask(__name__)
CORS(app)

# ── CONFIG ───────────────────────────────────────────────────
TOKEN_FILE = "token.json"
TFLITE_MODEL_FILE = "wound_classifier.tflite"

IMG_SIZE = (224, 224)  # MUST match training
CLASS_NAMES = ["burn", "cut", "infection", "ulcer"]

# ── GLOBAL MODEL ─────────────────────────────────────────────
interpreter = None
input_details = None
output_details = None

# ── LOAD MODEL ───────────────────────────────────────────────
def load_tflite_model():
    global interpreter, input_details, output_details

    if not os.path.exists(TFLITE_MODEL_FILE):
        print("❌ Model not found. Run wound_model.py first.")
        return False

    interpreter = tflite.Interpreter(model_path=TFLITE_MODEL_FILE)
    interpreter.allocate_tensors()

    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    print("✅ TFLite model loaded")
    return True


# ── IMAGE PREPROCESS ─────────────────────────────────────────
def preprocess_image(image_bytes):
    img = Image.open(io.BytesIO(image_bytes))

    if img.mode != "RGB":
        img = img.convert("RGB")

    img = img.resize(IMG_SIZE)

    img_array = np.array(img, dtype=np.float32) / 255.0
    img_array = np.expand_dims(img_array, axis=0)

    return img_array


# ── TFLITE INFERENCE ─────────────────────────────────────────
def run_tflite(image_bytes):
    if interpreter is None:
        return {"error": "Model not loaded"}

    if len(image_bytes) > 5 * 1024 * 1024:
        return {"error": "Image too large"}

    try:
        img_array = preprocess_image(image_bytes)

        interpreter.set_tensor(input_details[0]['index'], img_array)
        interpreter.invoke()

        predictions = interpreter.get_tensor(output_details[0]['index'])[0]

        predicted_idx = int(np.argmax(predictions))
        confidence = float(predictions[predicted_idx])

        # Confidence safety
        if confidence < 0.6:
            return {
                "type": "uncertain",
                "confidence": round(confidence * 100, 2)
            }

        return {
            "type": CLASS_NAMES[predicted_idx],
            "confidence": round(confidence * 100, 2),
            "allScores": {
                CLASS_NAMES[i]: round(float(predictions[i]) * 100, 2)
                for i in range(len(CLASS_NAMES))
            }
        }

    except Exception as e:
        return {"error": str(e)}


# ── GOOGLE VISION ────────────────────────────────────────────
def get_vision_client():
    if not os.path.exists(TOKEN_FILE):
        raise RuntimeError("Run setup_auth.py first")

    with open(TOKEN_FILE) as f:
        token_data = json.load(f)

    creds = Credentials(
        token=token_data.get("token"),
        refresh_token=token_data.get("refresh_token"),
        token_uri=token_data.get("token_uri"),
        client_id=token_data.get("client_id"),
        client_secret=token_data.get("client_secret"),
        scopes=token_data.get("scopes"),
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

    label_names = " ".join([l["desc"].lower() for l in labels])

    if "burn" in label_names:
        wound = "burn"
    elif "cut" in label_names:
        wound = "cut"
    elif "infection" in label_names:
        wound = "infection"
    elif "ulcer" in label_names:
        wound = "ulcer"
    else:
        wound = "unknown"

    return {
        "type": wound,
        "labels": labels
    }


# ───────────────── ROUTES ─────────────────

@app.route("/api/python/health")
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": interpreter is not None,
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

            image_bytes = base64.b64decode(b64)
            result = run_tflite(image_bytes)

            results.append(result)

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

        image_bytes = base64.b64decode(b64)
        result = run_vision_api(image_bytes)

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ───────────────── MAIN ─────────────────
if __name__ == "__main__":
    load_tflite_model()
    port = int(os.environ.get("PORT", 8080))
    print("🚀 Server running at http://localhost:{port}")
    app.run(host="0.0.0.0", port=port)
    