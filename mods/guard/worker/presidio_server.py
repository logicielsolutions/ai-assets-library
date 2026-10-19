"""Local PII detector for the guard mod.

Listens on 127.0.0.1 only. POST /analyze {"text": "...", "entities": [...], "score_threshold": 0.5}
answers [{"entity_type", "start", "end", "score"}]. GET /health answers {"ok": true}.
Text is never logged or stored. Exits by itself after a period with no requests.

usage: presidio_server.py PORT [IDLE_MINUTES] [PIDFILE]
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider

PORT = int(sys.argv[1])
IDLE_SECONDS = float(sys.argv[2] if len(sys.argv) > 2 else 60) * 60
PIDFILE = sys.argv[3] if len(sys.argv) > 3 else None
MAX_BODY = 1_000_000
MODEL = "en_core_web_sm"

nlp = NlpEngineProvider(
    nlp_configuration={
        "nlp_engine_name": "spacy",
        "models": [{"lang_code": "en", "model_name": MODEL}],
    }
).create_engine()
analyzer = AnalyzerEngine(nlp_engine=nlp, supported_languages=["en"])

# Presidio ships India recognisers but does not load them by default.
import presidio_analyzer.predefined_recognizers as predefined

for name in ("InAadhaarRecognizer", "InPanRecognizer", "InPassportRecognizer", "InVoterRecognizer"):
    if hasattr(predefined, name):
        analyzer.registry.add_recognizer(getattr(predefined, name)())
last_request = time.time()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # never log request details
        pass

    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        global last_request
        last_request = time.time()
        if self.path == "/health":
            self._send(200, {"ok": True, "model": MODEL})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        global last_request
        last_request = time.time()
        if self.path != "/analyze":
            return self._send(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BODY:
            return self._send(413, {"error": "body too large or empty"})
        try:
            req = json.loads(self.rfile.read(length))
            results = analyzer.analyze(
                text=req["text"],
                language="en",
                entities=req.get("entities") or None,
                score_threshold=float(req.get("score_threshold", 0.5)),
            )
            self._send(200, [
                {"entity_type": r.entity_type, "start": r.start, "end": r.end, "score": round(r.score, 3)}
                for r in results
            ])
        except Exception as err:  # keep serving
            self._send(400, {"error": type(err).__name__})


def watchdog(server):
    while True:
        time.sleep(30)
        if time.time() - last_request > IDLE_SECONDS:
            if PIDFILE and os.path.exists(PIDFILE):
                os.remove(PIDFILE)
            server.shutdown()
            return


server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
if PIDFILE:
    with open(PIDFILE, "w") as f:
        f.write(str(os.getpid()))
threading.Thread(target=watchdog, args=(server,), daemon=True).start()
server.serve_forever()
