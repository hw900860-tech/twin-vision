"""
AERIS-TWIN ML Inference HTTP Server
Listens on http://localhost:8000/predict for real-time model predictions.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
from ml.inference.engine_inference import predict_all_subsystems

class MLInferenceHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/predict':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                state = json.loads(post_data.decode('utf-8')) if post_data else {}
                result = predict_all_subsystems(state)
                response_bytes = json.dumps(result).encode('utf-8')

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(response_bytes)))
                self.end_headers()
                self.wfile.write(response_bytes)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def run_server(port=8000):
    server_address = ('', port)
    httpd = HTTPServer(server_address, MLInferenceHandler)
    print(f"AERIS-TWIN 6-ML Inference Server running on http://localhost:{port}/predict")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down ML inference server.")
        httpd.server_close()

if __name__ == '__main__':
    run_server()
