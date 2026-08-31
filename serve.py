#!/usr/bin/env python3
# Local game server with caching disabled, so code updates always load fresh.
import http.server
import os

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def do_GET(self):
        if self.path.split('?', 1)[0] == '/__savoria-test-mode.js':
            self.serve_test_mode()
            return
        super().do_GET()

    def do_HEAD(self):
        if self.path.split('?', 1)[0] == '/__savoria-test-mode.js':
            self.serve_test_mode(head_only=True)
            return
        super().do_HEAD()

    def serve_test_mode(self, head_only=False):
        enabled = os.environ.get('SAVORIA_BROWSER_TESTS') == '1'
        body = f'globalThis.__SAVORIA_BROWSER_TESTS__ = {str(enabled).lower()};\n'.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8977'))
    http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler).serve_forever()
