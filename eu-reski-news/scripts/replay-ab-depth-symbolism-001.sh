#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WORKTREE_ROOT="$(git -C "$SCRIPT_DIR/../.." rev-parse --show-toplevel)"
SOURCE_RUN="$WORKTREE_ROOT/eu-reski-news/GENERATIONS/news/ab-depth-symbolism-001"
SOURCE_RECORD="$SOURCE_RUN/iteration-001/record.json"
SOURCE_STREAM="$SOURCE_RUN/iteration-001/semantic-stream.json"
NEWS_ROOT="$(node -e 'process.stdout.write(require(process.argv[1]).sourceAggregate)' "$SOURCE_RECORD")"
NEWS_FILE="$(dirname "$NEWS_ROOT")/$(basename "$NEWS_ROOT")"
ENV_FILE="$WORKTREE_ROOT/.env"
cd "$WORKTREE_ROOT"

if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE="/Users/eggermann/Projekte/dailydoase/.env"
fi
if [ ! -f "$NEWS_FILE" ] || [ ! -f "$SOURCE_STREAM" ] || [ ! -f "$ENV_FILE" ]; then
  echo 'Missing saved article aggregate, semantic snapshot, or API .env file.' >&2
  exit 1
fi

RUN_NAME="${1:-ab-depth-symbolism-replay-$(date +%Y%m%d-%H%M%S)}"
OUTPUT_DIR="$WORKTREE_ROOT/eu-reski-news/GENERATIONS/news/$RUN_NAME"
if [ -e "$OUTPUT_DIR" ]; then
  echo "Output already exists: $OUTPUT_DIR" >&2
  exit 1
fi
mkdir -p "$OUTPUT_DIR/input"
cp "$NEWS_FILE" "$OUTPUT_DIR/input/"
cp "$SOURCE_STREAM" "$OUTPUT_DIR/semantic-stream.json"

GENERATOR="$SCRIPT_DIR/run-news-scene-image-iteration.mjs"
COMMON="--iterations=1 --scenes=5 --pause-ms=0 --output-dir=$OUTPUT_DIR --news-dir=$OUTPUT_DIR/input --article-id=474719518 --stream-file=$OUTPUT_DIR/semantic-stream.json --image-provider=hf-flux-klein --no-style-reference --article-image-reference"

node --env-file="$ENV_FILE" "$GENERATOR" $COMMON --symbolic --no-room-deepness
node --env-file="$ENV_FILE" "$GENERATOR" $COMMON --symbolic --room-deepness
node --env-file="$ENV_FILE" "$GENERATOR" $COMMON --no-symbolic --room-deepness

RUN_OUTPUT_DIR="$OUTPUT_DIR" node --input-type=module <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderRunReport } from './eu-reski-news/news-scene/report.mjs';

const root = process.env.RUN_OUTPUT_DIR;
const iterations = [];
for (let index = 1; index <= 3; index += 1) {
  const directory = `iteration-${String(index).padStart(3, '0')}`;
  const record = JSON.parse(await readFile(join(root, directory, 'record.json'), 'utf8'));
  iterations.push({ index, directory, report: `${directory}/index.html`, record });
}
const run = {
  status: 'completed',
  profile: 'Bildvergleich: Symbolik × Raumtiefe',
  description: 'Drei Einstellungen mit je fünf Szenen. Gleicher Artikel und identischer Semantic-Stream-Snapshot; Figurenreferenz und Nachrichtenfoto, ohne vollständiges Guernica-Gemälde.',
  iterationLimit: 3,
  startedAt: iterations[0].record.createdAt,
  finishedAt: new Date().toISOString(),
  iterations: iterations.map(({ index, directory, report }) => ({ index, directory, report })),
};
await writeFile(join(root, 'run.json'), `${JSON.stringify(run, null, 2)}\n`);
await writeFile(join(root, 'index.html'), renderRunReport(run, iterations));
console.log(`Comparison HTML: ${join(root, 'index.html')}`);
NODE
