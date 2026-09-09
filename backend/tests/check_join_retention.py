#!/usr/bin/env python3
"""Verify the real retention migration and rollback on a disposable database."""
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile

backend = Path(__file__).resolve().parents[1]
env = {**os.environ, 'FANGJI_SKIP_ADMIN_BOOTSTRAP': '1'}
with tempfile.TemporaryDirectory(prefix='fangji-retention-') as temp:
    root = Path(temp)
    binary, data = root / 'pocketbase', root / 'data'
    subprocess.run(['go', 'build', '-o', str(binary), '.'], cwd=backend, check=True)
    args = [str(binary), 'migrate']
    options = [f'--dir={data}', f'--migrationsDir={backend / "pb_migrations"}']
    def migrate(*command):
        subprocess.run(args + list(command) + options, env=env, input='y\n', text=True, check=True)
    expected = {'idx_project_join_attempt_window', 'idx_project_join_source_attempt_window'}
    def check(present):
        with sqlite3.connect(data / 'data.db') as db:
            indexes = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='index'")}
            assert (indexes & expected) == (expected if present else set()), indexes & expected
            for table, name in [('project_join_attempts', 'idx_project_join_attempt_window'),
                                ('project_join_source_attempts', 'idx_project_join_source_attempt_window')]:
                db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()
                if present:
                    plan = str(db.execute(f"EXPLAIN QUERY PLAN SELECT id FROM {table} WHERE window_started != '' AND window_started <= ? AND blocked_until <= ? ORDER BY window_started,id LIMIT 250", ('2026-01-01', '2026-01-01')).fetchall())
                    assert name in plan, plan
    migrate('up')
    check(True)
    migrate('down', '1')
    check(False)
    migrate('up')
    check(True)
print('PASS: fresh schema, retention indexes/query plans, down and reapply')
