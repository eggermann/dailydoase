# Five-iteration run matching run-003

Committed reproduction snapshot for the five-iteration film generated with the
same visual reference setup as `GENERATIONS/news/exhibition/run-003`.

## Snapshot

- Finished film: `eu-reski-gesamtfilm.mp4`
- Incremental First/Last-Frame glue film: `eu-reski-live-full.mp4`
- Run and per-iteration records: `run.json`, `iterations/001.json` through `iterations/005.json`
- Glue task record: `glue-run.json`
- Exact settings snapshot: `settings.json`
- Machine-readable hashes, prompts metadata, seeds, selected figures, and task IDs: `reconstruction.json`
- Guernica painting and masked figure catalog inputs: `inputs/`

The run uses the Guernica figure crop and full-painting style reference, with
article-photo references disabled. First/Last-Frame glue is enabled and built
as iterations finish. `eu-reski-gesamtfilm.mp4` contains the five iteration
films; `eu-reski-live-full.mp4` contains the assembled live glue output. It
uses FLUX 3 Image Klein and P-Video 2 Pro at 480p.

## Reconstruct

From repository root, run with a fresh output directory:

```sh
./eu-reski-news/scripts/EU-reski-mix-arg-and-camera-moovs.start.sh \
  --iterations=5 \
  --output-dir="$PWD/eu-reski-news/GENERATIONS/news/exhibition/reconstructed-run-003-style" \
  --style-reference="$PWD/eu-reski-news/reproductions/reference-5-run-003-style/inputs/guernica-style-reference.jpg" \
  --guernica-dir="$PWD/eu-reski-news/reproductions/reference-5-run-003-style/inputs/guernica_elemente_maskiert"
```

The committed settings snapshot supplies the run-003 scene-count, timing,
video, and reference behavior. News articles and provider outputs can change;
the per-iteration records preserve the articles, plans, selected figure IDs,
seeds, and provider task IDs from this completed run. Provider regeneration is
not bit-for-bit deterministic.
