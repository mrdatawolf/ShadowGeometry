#!/usr/bin/env python3
"""Serve this directory over HTTP with correct MIME types for ES modules.

Some systems (notably Windows, via the registry) map .js to text/plain,
which browsers refuse to load as an ES module. This overrides the map
before serving. Usage: python serve.py [port]  (default 8000)
"""
import sys
import http.server
import socketserver

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

Handler = http.server.SimpleHTTPRequestHandler
Handler.extensions_map.update({
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
})
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', port), Handler) as httpd:
    print(f'Serving http://localhost:{port}/ (Ctrl+C to stop)')
    httpd.serve_forever()
