#!/usr/bin/env python3
"""Run a backend integration script against a disposable, fully migrated server."""
import os
import sys
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request

backend = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='fangji-integration-') as temp:
    root = Path(temp)
    binary = root / 'pocketbase'
    data = root / 'data'
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    env = {**os.environ, 'PB_URL': f'http://127.0.0.1:{port}',
           'APP_ADMIN_EMAIL': 'unicode-admin@example.com', 'APP_ADMIN_PASSWORD': 'UnicodeTest12345!',
           'PB_ADMIN_EMAIL': 'unicode-super@example.com', 'PB_ADMIN_PASSWORD': 'UnicodeTest12345!',
           'PB_SUPER_EMAIL': 'unicode-super@example.com', 'PB_SUPER_PASSWORD': 'UnicodeTest12345!',
           'FANGJI_SKIP_ADMIN_BOOTSTRAP': '0', 'HINGHWA_IDENTITY_BASE_URL': ''}
    subprocess.run(['go', 'build', '-o', str(binary), '.'], cwd=backend, check=True)
    for migration in sorted((backend / 'pb_migrations').glob('*.js'), key=lambda p: int(p.name.split('_')[0])):
        with tempfile.TemporaryDirectory(dir=root) as one:
            shutil.copy(migration, one)
            subprocess.run([str(binary), 'migrate', 'up', f'--dir={data}', f'--migrationsDir={one}'],
                           env={**env, 'FANGJI_SKIP_ADMIN_BOOTSTRAP': '1'}, check=True, stdout=subprocess.DEVNULL)
    with (root / 'server.log').open('a') as log:
        server = subprocess.Popen([str(binary), 'serve', f'--http=127.0.0.1:{port}', f'--dir={data}',
                                   f'--hooksDir={backend / "pb_hooks"}', f'--migrationsDir={backend / "pb_migrations"}',
                                   '--hooksWatch=false'], env=env, stdout=log, stderr=log)
        try:
            for _ in range(100):
                try:
                    with urllib.request.urlopen(env['PB_URL'] + '/api/health', timeout=1):
                        break
                except OSError:
                    if server.poll() is not None:
                        raise RuntimeError((root / 'server.log').read_text())
                    time.sleep(.1)
            else:
                raise RuntimeError('Temporary server did not become ready')
            args = ['node', str(backend / 'tests' / sys.argv[1])]
            subprocess.run(args, env=env, check=True)
        except Exception:
            # Emit diagnostics before TemporaryDirectory removes the evidence.
            # This server only contains generated, disposable test identities.
            print(f'FAILED integration: {sys.argv[1]}', file=sys.stderr)
            print((root / 'server.log').read_text()[-20000:], file=sys.stderr)
            raise
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
print('PASS: disposable migration, backend integration and cleanup')
