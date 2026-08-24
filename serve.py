#!/usr/bin/env python3
# Local game server with caching disabled, so code updates always load fresh.
import http.server

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

if __name__ == '__main__':
    http.server.ThreadingHTTPServer(('127.0.0.1', 8977), NoCacheHandler).serve_forever()
