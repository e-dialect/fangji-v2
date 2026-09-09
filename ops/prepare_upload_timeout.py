#!/usr/bin/env python3
"""Prepare a Traefik JSON static config on stdout; never edit the live input."""
import argparse
import json
from pathlib import Path


def prepare(config, entrypoint, seconds):
    if not 60 < seconds <= 3600:
        raise ValueError('timeout must be between 61 and 3600 seconds')
    entry = config['entryPoints'][entrypoint]  # Fail closed on a misspelled name.
    entry.setdefault('transport', {}).setdefault('respondingTimeouts', {})['readTimeout'] = f'{seconds}s'
    return config


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config', type=Path)
    parser.add_argument('--entrypoint', default='websecure')
    parser.add_argument('--seconds', type=int, default=600)
    args = parser.parse_args()
    print(json.dumps(prepare(json.loads(args.config.read_text()), args.entrypoint, args.seconds), indent=2))
