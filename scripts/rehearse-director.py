#!/usr/bin/env python3
"""Rehearse migration 010 against a protected SQL export, never a remote database."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--backup', required=True, type=Path)
parser.add_argument('--report', type=Path)
args = parser.parse_args()
os.umask(0o077)
root = Path(__file__).resolve().parent.parent
migration = root / 'api/migrations/010_director.sql'
with tempfile.TemporaryDirectory(prefix='spill4-rehearsal-') as directory:
    db = sqlite3.connect(Path(directory) / 'rehearsal.sqlite')
    db.executescript(args.backup.read_text())
    db.execute('PRAGMA foreign_keys=ON')
    tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")]
    def fingerprint(table):
        escaped = table.replace('"', '""')
        rows = db.execute(f'SELECT * FROM "{escaped}"').fetchall()
        return len(rows), hashlib.sha256(json.dumps(sorted(rows, key=repr), default=str).encode()).hexdigest()
    before = {table: fingerprint(table) for table in tables}
    for _ in range(2):
        db.executescript(migration.read_text())
    after = {table: fingerprint(table) for table in tables}
    assert all(value == after[table] for table, value in before.items() if table != 'spill_schema_migrations'), 'Existing data changed'
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert db.execute('PRAGMA foreign_key_check').fetchall() == []
    report = {'backupSha256': hashlib.sha256(args.backup.read_bytes()).hexdigest(), 'migrationSha256': hashlib.sha256(migration.read_bytes()).hexdigest(), 'appliedTwice': True, 'existingTablesPreserved': {table: value[0] for table, value in before.items()}, 'integrity': 'ok', 'foreignKeys': 'ok', 'remoteWrites': False}
    db.close()
if args.report:
    args.report.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
