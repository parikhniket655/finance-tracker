import http.server
import socketserver
import os
import sys
import json
import urllib.parse
import urllib.request
import urllib.error
import ssl

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class BlingyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable caching for developer convenience
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == '/api/state':
            query = urllib.parse.parse_qs(parsed_path.query)
            phone = query.get('phone', [None])[0]
            if not phone:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Missing phone parameter"}).encode())
                return
            
            # Proxy request to cloud Supabase (via Vercel api/state)
            vercel_url = f"https://finance-tracker-two-self.vercel.app/api/state?phone={urllib.parse.quote(phone)}"
            req = urllib.request.Request(vercel_url, headers={"User-Agent": "Mozilla/5.0"})
            ctx = ssl._create_unverified_context()
            try:
                with urllib.request.urlopen(req, context=ctx) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(data)
            except urllib.error.HTTPError as e:
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(e.read())
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return
            
        return super().do_GET()

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == '/api/state':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            # Proxy POST request to Vercel api/state
            vercel_url = "https://finance-tracker-two-self.vercel.app/api/state"
            req = urllib.request.Request(
                vercel_url, 
                data=post_data, 
                headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}, 
                method="POST"
            )
            ctx = ssl._create_unverified_context()
            try:
                with urllib.request.urlopen(req, context=ctx) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(data)
            except urllib.error.HTTPError as e:
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(e.read())
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return
            
        self.send_response(404)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode())

# Prevent "Port already in use" errors by enabling reuse_address
class ReuseAddressTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == '__main__':
    # Force working directory to directory of server.py
    os.chdir(DIRECTORY)
    
    Handler = BlingyHTTPRequestHandler
    with ReuseAddressTCPServer(("", PORT), Handler) as httpd:
        print(f"Blingy local server running at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            sys.exit(0)
