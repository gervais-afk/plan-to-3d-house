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

    def send_head(self):
        requested = unquote(urlsplit(self.path).path).lower().split('/')
        if any(part.startswith('.') or part.endswith('.key') for part in requested):
            self.send_error(404, 'Fichier local sensible')
            return None
        return super().send_head()

def main():
    if (os.environ.get('PRIVATE_PORTAL') == '1' or os.environ.get('PORTAL_PASSWORD')
            or os.path.exists(os.path.join(DIRECTORY, '.private-portal'))):
        sys.exit('Le portail privé doit être lancé avec Node.js (serve.js).')
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
