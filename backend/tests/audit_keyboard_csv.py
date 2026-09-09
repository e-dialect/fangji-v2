#!/usr/bin/env python3
"""Audit exact keyboard input coverage; reports codepoints/counts, never CSV text."""
import argparse
import collections
import csv
import json
from pathlib import Path
import unicodedata

COMMON = set('，。！？：；、（）【】《》“”‘’…')


def ordinary(char):
    return (ord(char) < 128 or char.isspace() or char in COMMON
            or unicodedata.name(char, '').startswith(('CJK ', 'IDEOGRAPHIC ', 'KANGXI ')))


def missing_sequences(text, values):
    # Split by base + following marks, not by independent codepoint coverage.
    # A tilde inside ø̃ does not make a standalone tilde available after another base.
    clusters = []
    for char in text:
        if unicodedata.category(char).startswith('M') and clusters:
            clusters[-1] += char
        else:
            clusters.append(char)
    missing = []
    for cluster in clusters:
        reachable = {0}
        for i in range(len(cluster)):
            if i not in reachable:
                continue
            if ordinary(cluster[i]):
                reachable.add(i + 1)
            for value in values:
                if cluster.startswith(value, i):
                    reachable.add(i + len(value))
        if len(cluster) not in reachable:
            missing.append(cluster)
    return missing


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv_files', nargs='+', type=Path)
    parser.add_argument('--keyboard', type=Path, default=Path(__file__).resolve().parents[1] / 'keyboards/hinghwa-dialect.json')
    args = parser.parse_args()
    keyboard = json.loads(args.keyboard.read_text())
    values = {key['value'] for section in keyboard['sections'] for key in section['keys']}
    failures = 0
    for index, file in enumerate(args.csv_files, 1):
        missing = collections.Counter()
        rows = 0
        with file.open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.reader(stream)
            next(reader)
            for row in reader:
                rows += 1
                for column, cell in enumerate(row, 1):
                    for value in missing_sequences(cell, values):
                        missing[(column, ' '.join(f'U+{ord(ch):04X}' for ch in value))] += 1
        print(json.dumps({'input': index, 'rows': rows, 'missing': [
            {'column': column, 'sequence': seq, 'count': count}
            for (column, seq), count in sorted(missing.items())]}, ensure_ascii=True))
        failures += len(missing)
    return bool(failures)


if __name__ == '__main__':
    raise SystemExit(main())
