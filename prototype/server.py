"""Loopback-only static preview plus local bounded Office import. No remote service."""
import argparse, json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote
from office_import import parse_office, PreviewError, MAX_FILE
ROOT=Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Cache-Control','no-store')
        super().end_headers()
    def do_POST(self):
        if self.path!='/api/import': self.send_error(404);return
        host=self.headers.get('Host','')
        if host.split(':')[0] not in ('127.0.0.1','localhost'): self.send_error(403);return
        origin=self.headers.get('Origin')
        if origin and origin not in ('http://'+host,'https://'+host): self.send_error(403);return
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=MAX_FILE: raise PreviewError('Choose a file between 1 byte and 15 MB.')
            filename=Path(unquote(self.headers.get('X-Filename','document'))).name
            value=parse_office(self.rfile.read(length),filename);payload=json.dumps(value).encode();self.send_response(200)
        except (PreviewError,ValueError) as e:
            payload=json.dumps({'error':str(e)}).encode();self.send_response(400)
        self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=4173);args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(Handler,directory=str(ROOT)))
    print(f'Local preview: http://127.0.0.1:{args.port}/',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
