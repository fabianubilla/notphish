#!/usr/bin/env python3
"""
server.py — NotPhish ML Server
Servidor HTTP local usando solo stdlib de Python (sin FastAPI, sin Flask).
Expone /predict para que hybrid.js lo llame desde el browser.

Uso:
    python3 server.py
    python3 server.py --port 8765   # puerto alternativo

El servidor carga los modelos una sola vez al arrancar.
Si no está disponible, hybrid.js continúa solo con el motor JS.
"""
import sys
import os
import json
import re
import argparse
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# ── Rutas de modelos ──────────────────────────────────────────────────────────
HERE = Path(__file__).parent
MODEL_DIR = HERE / "models"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("notphish")

# ── Cargar modelos al arranque ────────────────────────────────────────────────
log.info("Cargando modelos...")
try:
    import joblib
    _primary_pkg  = joblib.load(MODEL_DIR / "primary_model_candidate.joblib")
    _secondary_pkg = joblib.load(MODEL_DIR / "subcategory_model_candidate.joblib")
    _models_ok = True
    log.info(f"Modelo primario: {_primary_pkg['model_name']} | "
              f"Secundario: {_secondary_pkg['model_name']}")
except Exception as e:
    _models_ok = False
    log.error(f"Error cargando modelos: {e}")
    log.warning("El servidor responderá con ml_available=false")

# ── Función de predicción ─────────────────────────────────────────────────────
_UNCERTAIN_THRESHOLD = 0.55
_SUBCAT_MIN_CONF     = 0.40

def _clean(text: str) -> str:
    text = re.sub(r'<[^>]{1,100}>', '', text[:800])
    text = text.replace('\ufeff', '').replace('\x00', '')
    return re.sub(r'\s+', ' ', text).strip()

def _predict(text: str) -> dict:
    if not _models_ok:
        return {"ml_available": False}

    text_clean = _clean(text)
    if not text_clean or len(text_clean) < 5:
        return {
            "ml_available":    True,
            "ml_label":        "legit",
            "ml_confidence":   0.50,
            "ml_probabilities": {"legit": 0.50, "scam": 0.50},
            "ml_subcategory":  "unknown",
            "ml_subcat_conf":  0.0,
            "uncertain":       True,
            "word_count":      0,
        }

    try:
        import numpy as np

        # Primario
        vec  = _primary_pkg["vectorizer"]
        clf  = _primary_pkg["classifier"]
        X    = vec.transform([text_clean])
        proba = clf.predict_proba(X)[0]
        classes = _primary_pkg["classes"]  # ['legit', 'scam']
        pred_idx = int(np.argmax(proba))
        ml_label     = classes[pred_idx]
        ml_confidence = float(proba[pred_idx])
        probs = {c: round(float(proba[i]), 4) for i, c in enumerate(classes)}

        uncertain = ml_confidence < _UNCERTAIN_THRESHOLD
        word_count = len(text_clean.split())

        # Secundario (solo si scam y confiante)
        ml_subcategory = "unknown"
        ml_subcat_conf = 0.0
        if ml_label == "scam" and not uncertain:
            try:
                sec_clf    = _secondary_pkg["classifier"]
                groups     = _secondary_pkg["groups"]
                sub_proba  = sec_clf.predict_proba(X)[0]
                sub_idx    = int(np.argmax(sub_proba))
                ml_subcat_conf = float(sub_proba[sub_idx])
                if ml_subcat_conf >= _SUBCAT_MIN_CONF:
                    ml_subcategory = groups[sub_idx]
                else:
                    ml_subcategory = "other_scam"
            except Exception:
                ml_subcategory = "phishing_generic"

        return {
            "ml_available":    True,
            "ml_label":        ml_label,
            "ml_confidence":   round(ml_confidence, 4),
            "ml_probabilities": probs,
            "ml_subcategory":  ml_subcategory,
            "ml_subcat_conf":  round(ml_subcat_conf, 4),
            "uncertain":       uncertain,
            "word_count":      word_count,
        }

    except Exception as e:
        log.error(f"Prediction error: {e}")
        return {"ml_available": False, "error": str(e)}


# ── HTTP Handler ──────────────────────────────────────────────────────────────
class MLHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        # Silenciar el log HTTP por defecto, usar el nuestro
        pass

    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        # CORS para localhost / file://
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send_json({})

    def do_GET(self):
        if self.path == "/health":
            self._send_json({
                "status": "ok",
                "models_loaded": _models_ok,
                "primary": _primary_pkg.get("model_name", "?") if _models_ok else None,
            })
        else:
            self._send_json({"error": "Not found"}, 404)

    def do_POST(self):
        if self.path != "/predict":
            self._send_json({"error": "Not found"}, 404)
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            raw    = self.rfile.read(length)
            body   = json.loads(raw.decode("utf-8"))
            text   = body.get("text", "")
            if not isinstance(text, str):
                self._send_json({"error": "text must be a string"}, 400)
                return

            result = _predict(text)
            log.info(f"/predict → {result.get('ml_label','?')} "
                     f"conf={result.get('ml_confidence','?')} "
                     f"sub={result.get('ml_subcategory','?')} "
                     f"wc={result.get('word_count','?')} "
                     f"'{text[:50]}'")
            self._send_json(result)

        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON"}, 400)
        except Exception as e:
            log.error(f"Handler error: {e}")
            self._send_json({"error": str(e), "ml_available": False}, 500)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="NotPhish ML Server")
    parser.add_argument("--port", type=int, default=8765,
                        help="Puerto local (default: 8765)")
    parser.add_argument("--host", default="127.0.0.1",
                        help="Host (default: 127.0.0.1)")
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), MLHandler)
    log.info(f"NotPhish ML Server corriendo en http://{args.host}:{args.port}")
    log.info(f"  GET  /health  → estado del servidor")
    log.info(f"  POST /predict → {{\"text\": \"...\"}} → resultado ML")
    log.info("  Ctrl+C para detener\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Servidor detenido.")
        server.server_close()


if __name__ == "__main__":
    main()
