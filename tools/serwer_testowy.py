import http.server, os, re, sys
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path) or not os.path.exists(path):
            return super().send_head()
        rng = self.headers.get('Range'); size = os.path.getsize(path); f = open(path, 'rb')
        ctype = self.guess_type(path)
        if ctype.startswith('text/html'): ctype = 'text/html; charset=utf-8'
        if rng:
            m = re.match(r'bytes=(\d*)-(\d*)', rng); a = int(m.group(1) or 0); b = int(m.group(2) or size - 1); b = min(b, size - 1)
            self.send_response(206); self.send_header('Content-Range', f'bytes {a}-{b}/{size}'); self.send_header('Content-Length', str(b - a + 1))
            f.seek(a); self._left = b - a + 1
        else:
            self.send_response(200); self.send_header('Content-Length', str(size)); self._left = size
        self.send_header('Content-Type', ctype); self.send_header('Accept-Ranges', 'bytes'); self.end_headers()
        return f
    def copyfile(self, src, dst):
        left = self._left
        while left > 0:
            chunk = src.read(min(65536, left))
            if not chunk: break
            try: dst.write(chunk)
            except (BrokenPipeError, ConnectionResetError): break
            left -= len(chunk)
os.chdir(sys.argv[1])
http.server.ThreadingHTTPServer(('', int(sys.argv[2])), H).serve_forever()
