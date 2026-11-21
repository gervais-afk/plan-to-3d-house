"""Lance le serveur de l'application avec les mêmes API et règles d'accès que Node."""
import subprocess
from pathlib import Path
import shutil
import sys

if __name__ == '__main__':
    node = shutil.which('node')
    if not node:
        sys.exit('Node.js est requis pour le catalogue, les documents et la visite privée.')
    root = Path(__file__).resolve().parent
    sys.exit(subprocess.call([node, 'serve.js'], cwd=root))
