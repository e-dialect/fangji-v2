#!/usr/bin/env python3
"""Verify PDF affinity index metadata, query use, rollback and reapply."""
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile

backend = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='fangji-affinity-') as temp:
    root = Path(temp)
    binary, data = root / 'pocketbase', root / 'data'
    subprocess.run(['go', 'build', '-o', str(binary), '.'], cwd=backend, check=True)
    def migrate(*command):
        subprocess.run([str(binary), 'migrate', *command, f'--dir={data}',
                        f'--migrationsDir={backend / "pb_migrations"}'],
                       env={**os.environ, 'FANGJI_SKIP_ADMIN_BOOTSTRAP': '1'},
                       input='y\n', text=True, check=True, stdout=subprocess.DEVNULL)
    def check(present):
        with sqlite3.connect(data / 'data.db') as db:
            name = 'idx_pages_pdf_affinity'
            indexes = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='index'")}
            assert (name in indexes) == present
            assert 'idx_pages_project_status_order' in indexes, 'existing queue index lost'
            metadata = json.loads(db.execute("SELECT indexes FROM _collections WHERE name='pages'").fetchone()[0])
            assert any(name in sql for sql in metadata) == present
            if present:
                plan = str(db.execute("EXPLAIN QUERY PLAN SELECT id FROM pages WHERE project=? AND project_file=? AND pdf_page=? AND status=? ORDER BY page_number,id", ('p', 'f', 2, 'pending')).fetchall())
                assert name in plan, plan
    migrate('up')
    check(True)
    with sqlite3.connect(data / 'data.db') as db:
        count = db.execute("SELECT COUNT(*) FROM _migrations WHERE file >= '1789027200_pdf_task_affinity.js'").fetchone()[0]
    migrate('down', str(count))
    check(False)
    migrate('up')
    check(True)
print('PASS: PDF affinity index metadata/query plan, rollback and reapply')
