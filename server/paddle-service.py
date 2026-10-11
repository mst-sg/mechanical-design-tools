"""Private GPU OCR adapter. No file paths/URLs are accepted from requests."""
import hmac
import importlib.metadata
import io
import json
import os
import threading
import time
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import paddle
from PIL import Image
from paddleocr import PaddleOCR

DEADLINE = Path(os.environ["MST_PADDLE_DEADLINE_FILE"])
TOKEN = os.environ["MST_PADDLE_TOKEN"]
if len(TOKEN) < 32 or not paddle.is_compiled_with_cuda():
    raise RuntimeError("GPU and private authentication are required")
paddle.set_device("gpu:0")
Image.MAX_IMAGE_PIXELS = 8_100_000
ENGINE = {
    "name": "PaddleOCR", "version": importlib.metadata.version("paddleocr"),
    "model": "PP-OCRv6", "device": paddle.get_device(),
}
if not ENGINE["device"].startswith("gpu:"):
    raise RuntimeError("CPU fallback is not allowed")
OCR = PaddleOCR(
    ocr_version="PP-OCRv6", lang="ch", device="gpu:0",
    use_doc_orientation_classify=False, use_doc_unwarping=False,
    use_textline_orientation=False,
)
SLOT = threading.BoundedSemaphore(1)
DEADLINE.unlink(missing_ok=True)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        # Access paths, credentials and recognized document text are private.
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)
        self.close_connection = True

    def authorized(self):
        return hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + TOKEN)

    def do_GET(self):
        if not self.authorized():
            return self.reply(403, {"error": "forbidden"})
        if self.path != "/health":
            return self.reply(404, {"error": "not_found"})
        self.reply(200, {"status": "ready", "engine": ENGINE})

    def do_POST(self):
        if not self.authorized():
            return self.reply(403, {"error": "forbidden"})
        if self.path != "/ocr" or self.headers.get("Content-Type") != "image/png":
            return self.reply(400, {"error": "invalid_input"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if not 0 < size <= 25 * 1024 * 1024:
            return self.reply(413, {"error": "too_large"})
        if not SLOT.acquire(blocking=False):
            return self.reply(503, {"error": "busy"})
        # A separate supervisor kills this entire process on expiry.
        DEADLINE.write_text(str(time.monotonic() + 75))
        try:
            body = self.rfile.read(size)
            if len(body) != size:
                raise ValueError("incomplete_input")
            image = Image.open(io.BytesIO(body))
            if image.format != "PNG" or image.width * image.height > 8_100_000:
                raise ValueError("invalid_image")
            # Paddle's ndarray input uses BGR, never a caller-controlled path.
            pixels = np.asarray(image.convert("RGB"))[:, :, ::-1].copy()
            words = []
            for prediction in OCR.predict(pixels):
                texts = prediction["rec_texts"]
                boxes = prediction["rec_boxes"]
                scores = prediction["rec_scores"]
                for text, box, score in zip(texts, boxes, scores, strict=True):
                    x1, y1, x2, y2 = (float(v) for v in box)
                    if text.strip() and x2 > x1 and y2 > y1:
                        words.append({"text": text.strip(), "x": max(0, x1), "y": max(0, y1),
                                      "width": x2 - x1, "height": y2 - y1,
                                      "confidence": max(0, min(100, float(score) * 100))})
            if len(words) > 10000:
                raise ValueError("large_output")
            self.reply(200, {"words": words, "engine": ENGINE})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.reply(422, {"error": "recognition_failed"})
        finally:
            DEADLINE.unlink(missing_ok=True)
            SLOT.release()


if __name__ == "__main__":
    server = ThreadingHTTPServer((os.environ.get("MST_PADDLE_BIND", "127.0.0.1"),
                                  int(os.environ.get("MST_PADDLE_PORT", "7018"))), Handler)
    server.daemon_threads = True
    print(json.dumps({"event": "ready", "engine": ENGINE}), flush=True)
    server.serve_forever()
