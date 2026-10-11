from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from time import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json
import os

ROOT = Path(__file__).parent
TDX_TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'
_tdx_token = {'value': '', 'expires_at': 0, 'client_id': ''}
_tdx_token_lock = Lock()


def get_tdx_access_token():
    client_id = os.getenv('TDX_CLIENT_ID', '').strip()
    client_secret = os.getenv('TDX_CLIENT_SECRET', '').strip()
    if not client_id or not client_secret:
        raise ValueError('TDX credentials are not configured')

    with _tdx_token_lock:
        if _tdx_token['client_id'] == client_id and _tdx_token['value'] and _tdx_token['expires_at'] > time() + 60:
            return _tdx_token['value']
        data = urlencode({
            'grant_type': 'client_credentials',
            'client_id': client_id,
            'client_secret': client_secret,
        }).encode()
        request = Request(TDX_TOKEN_URL, data=data, headers={
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        })
        with urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode('utf-8'))
        token = payload.get('access_token')
        if not token:
            raise ValueError('TDX did not return an access token')
        _tdx_token.update({
            'value': token,
            'expires_at': time() + max(0, int(payload.get('expires_in', 3600)) - 60),
            'client_id': client_id,
        })
        return token

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.split('?', 1)[0] == '/api/tdx/status':
            return self.send_tdx_status()
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

    def send_json(self, payload, code=200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_tdx_status(self):
        configured = bool(os.getenv('TDX_CLIENT_ID', '').strip() and os.getenv('TDX_CLIENT_SECRET', '').strip())
        if not configured:
            return self.send_json({
                'configured': False,
                'authenticated': False,
                'message': '伺服器尚未設定 TDX 憑證。',
            }, 503)
        try:
            get_tdx_access_token()
            return self.send_json({
                'configured': True,
                'authenticated': True,
                'message': 'TDX 憑證驗證成功。',
            })
        except HTTPError as error:
            if error.code in (400, 401, 403):
                message = 'TDX 憑證驗證失敗，請檢查 Zeabur Variables。'
            else:
                message = 'TDX 認證服務暫時無法使用，請稍後再試。'
            return self.send_json({'configured': True, 'authenticated': False, 'message': message}, 502)
        except (URLError, TimeoutError, OSError):
            return self.send_json({
                'configured': True,
                'authenticated': False,
                'message': '目前連不到 TDX 認證服務，請稍後再試。',
            }, 502)
        except (ValueError, json.JSONDecodeError):
            return self.send_json({
                'configured': True,
                'authenticated': False,
                'message': 'TDX 回應格式無法辨識，請稍後再試。',
            }, 502)

if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', int(os.getenv('PORT', '8080'))), Handler)
    server.serve_forever()
