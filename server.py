from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os

ROOT = Path(__file__).parent

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.split('?', 1)[0] == '/config.js':
            config = {
                'liffId': os.getenv('LIFF_ID', ''),
                'googleMapsApiKey': os.getenv('GOOGLE_MAPS_API_KEY', ''),
                'googleMapsMapId': os.getenv('GOOGLE_MAPS_MAP_ID', ''),
            }
            body = ('window.CHARGE_PLANNER_CONFIG=' + json.dumps(config) + ';').encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def log_message(self, fmt, *args):
        # Avoid logging route query values that can contain user-entered locations.
        super().log_message(fmt, *args)

if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', int(os.getenv('PORT', '8080'))), Handler)
    server.serve_forever()
