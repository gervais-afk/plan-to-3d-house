import http.server
import socketserver
import webbrowser
import os
import sys
from urllib.parse import unquote, urlsplit

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        requested = unquote(urlsplit(self.path).path).lower().rstrip('/')
        if requested.endswith('/openrouter.key') or requested.endswith('/.env') or '/.env.' in requested:
            self.send_error(403, 'Fichier local sensible')
            return
        super().do_GET()

def main():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print("=" * 60)
        print("  SERVEUR LOCAL 'PLAN DE MAISON ANIME' ACTIF")
        print(f"  URL : {url}")
        print("  Appuyez sur Ctrl+C pour arreter le serveur.")
        print("=" * 60)
        webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nArret du serveur.")

if __name__ == "__main__":
    main()
