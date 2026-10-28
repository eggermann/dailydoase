#!/usr/bin/env python3
"""Create compact posters for the merged films listed in the overview HTML."""

from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import re
import shutil
import subprocess
import unicodedata


ROOT = Path(__file__).resolve().parent
OVERVIEW = ROOT / 'eu-reski-film-uebersicht.html'
THUMBNAILS = ROOT / 'eu-reski-film-thumbnails'


def slug(value):
    value = unicodedata.normalize('NFD', value).encode('ascii', 'ignore').decode()
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', value.lower())).strip('-')


def quoted_value(row, key):
    found = re.search(rf"(?:\b{re.escape(key)}:'([^']*)'|\"{re.escape(key)}\":\"([^\"]*)\")", row)
    return next((value for value in found.groups() if value is not None), None) if found else None


def list_value(row, key):
    found = re.search(rf'(?:\b{re.escape(key)}:(\[[^\]]*\])|"{re.escape(key)}":(\[[^\]]*\]))', row)
    raw = next((value for value in found.groups() if value is not None), None) if found else None
    return [int(value) for value in re.findall(r'\d+', raw)] if raw else []


def boolean_value(row, key):
    found = re.search(rf'(?:\b{re.escape(key)}:(true|false)|"{re.escape(key)}":(true|false))', row)
    value = next((value for value in found.groups() if value is not None), None) if found else None
    return value == 'true'


def listed_outputs():
    html = OVERVIEW.read_text(encoding='utf-8')
    runs_block = re.search(r'const runs = \[(.*?)\n  \];', html, re.S)
    if not runs_block:
        raise RuntimeError('Could not find the runs list in the overview HTML.')

    outputs = []
    for row in re.findall(r'\{(?:name|"name"):.*?(?=\n    \{|\Z)', runs_block.group(1), re.S):
        name = quoted_value(row, 'name')
        base = quoted_value(row, 'base')
        if not name or not base:
            continue

        output_sources = []
        whole = quoted_value(row, 'whole')
        if whole:
            first_iteration = min(list_value(row, 'iterations'), default=0)
            number = f'{first_iteration:03}'
            no_title_card = f'iteration-{number}.mp4' if first_iteration else whole
            output_sources.append((whole, no_title_card))
        title_iterations = set(list_value(row, 'withTitle'))
        normalized_title_cards = boolean_value(row, 'normalizedTitleCards')
        for iteration in list_value(row, 'iterations'):
            number = f'{iteration:03}'
            if iteration in title_iterations:
                suffix = '-with-title-card-audio-normalized' if normalized_title_cards else '-with-title-card'
                output_filename = f'iteration-{number}{suffix}.mp4'
            else:
                output_filename = f'iteration-{number}.mp4'
            output_sources.append((output_filename, f'iteration-{number}.mp4'))

        for output_filename, source_filename in output_sources:
            source = Path(base) / 'merged' / source_filename
            if not source.is_file():
                fallback = Path(base) / 'merged' / output_filename
                if fallback.is_file():
                    source = fallback
                else:
                    print(f'Missing merged file: {source}')
                    continue
            poster = THUMBNAILS / f'{slug(name)}__{slug(output_filename)}.jpg'
            outputs.append((source, poster))
    return outputs


def create_poster(pair):
    source, poster = pair
    if poster.exists():
        return False

    duration = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'default=noprint_wrappers=1:nokey=1', str(source)],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    seek = max(0, float(duration or 0) * 0.42)
    poster.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(seek),
         '-i', str(source), '-frames:v', '1', '-vf', 'scale=480:-2',
         '-q:v', '5', str(poster)],
        check=True, capture_output=True,
    )
    return True


def main():
    for command in ('ffmpeg', 'ffprobe'):
        if not shutil.which(command):
            raise SystemExit(f'Required command not found: {command}')

    outputs = listed_outputs()
    created = 0
    with ThreadPoolExecutor(max_workers=6) as workers:
        futures = [workers.submit(create_poster, output) for output in outputs]
        for future in as_completed(futures):
            created += int(future.result())
    expected = {poster for _, poster in outputs}
    for poster in THUMBNAILS.glob('*.jpg'):
        if poster not in expected:
            poster.unlink()
    print(f'{created} thumbnails created; {len(outputs)} merged videos listed.')


if __name__ == '__main__':
    main()
