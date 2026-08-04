# Glas-Kaufhaus: Image-only-Test

Dieser Test erzeugt ausschließlich die geplanten Szenenbilder. WAN-Video, WAN-Sound und Mirelo werden nicht initialisiert.

Der Image-only-Test verwendet rohe fotografische Kaufhaus-Referenzen und eine getrennte realistische Monster-Referenz. Dadurch bleibt die reale Kaufhaus-Geometrie dominant, während jede Szene eine neue Monster-Inkarnation aus ihrer Semantic-Stream-Kollision baut.

```text
lib/Plak-2_images/monster-reference/green-monster-protagonist-realistic-chroma.png
lib/Plak-2_images/kaufhaus-location/
```

Alle Runden laufen im selben Node-Prozess. Dadurch bleiben dieselben Semantic-Stream-Objekte, ihre fortlaufenden `getNext`-Positionen, dieselbe Generatorinstanz und derselbe Generation-Ordner erhalten.

## Standardtest: zwei Runden

Vom Projektordner aus starten:

```sh
sh lib/generator/adapter/MIX-again-freshweb.glas-kaufhaus-image-only-test.sh
```

Der Standardwert ist:

```sh
FRESHWEB_IMAGE_ONLY_TEST_RUN_COUNT=2
```

Nach der zweiten vollständigen Runde wird kein weiterer Timer geplant und der Prozess endet.

## Anzahl der Runden verändern

Fünf Runden im selben Stream und Ordner:

```sh
FRESHWEB_IMAGE_ONLY_TEST_RUN_COUNT=5 \
sh lib/generator/adapter/MIX-again-freshweb.glas-kaufhaus-image-only-test.sh
```

Unbegrenzt weiterlaufen:

```sh
FRESHWEB_IMAGE_ONLY_TEST_RUN_COUNT=-1 \
sh lib/generator/adapter/MIX-again-freshweb.glas-kaufhaus-image-only-test.sh
```

Einen unbegrenzten Test mit `Ctrl+C` beenden.

## Wichtige Variablen

```text
FRESHWEB_IMAGE_ONLY_TEST_ENABLED=1      Nur Szenenbilder erzeugen
FRESHWEB_IMAGE_ONLY_TEST_RUN_COUNT=2    Anzahl Runden; -1 bedeutet unbegrenzt
FRESHWEB_POLLING_TIME_MS=1000           Pause zwischen Runden im selben Prozess
FRESHWEB_FOLDER=glas-kaufhaus-shorty-book-image-only-test
```

Die normalen Trailer-Variablen bleiben von außen überschreibbar. Beispiel für Modell B:

```sh
FRESHWEB_PROMPT_MODEL_AB_TEST_ENABLED=1 \
FRESHWEB_PROMPT_MODEL_AB_VARIANT=B \
sh lib/generator/adapter/MIX-again-freshweb.glas-kaufhaus-image-only-test.sh
```

## Ausgabeordner

Generation-Root:

```text
/Users/eggermann/Projekte/dailydoase/GENRATIONS-KAUFHAUF
```

Beim Start wird einmal ein nummerierter Generation-Ordner angelegt:

```text
/Users/eggermann/Projekte/dailydoase/GENRATIONS-KAUFHAUF/<nummer>-glas-kaufhaus-shorty-book-image-only-test
```

Alle Szenenbilder aller Runden liegen gemeinsam hier:

```text
/Users/eggermann/Projekte/dailydoase/GENRATIONS-KAUFHAUF/<nummer>-glas-kaufhaus-shorty-book-image-only-test/parts/image-only-scenes
```

Der erste vollständig visuell geprüfte korrigierte Satz ist Run 5 im Generation-Ordner 717.

Beispiel-Dateinamen:

```text
run-01-scene-01.png
run-01-scene-02.png
run-02-scene-01.png
run-02-scene-02.png
run-01-summary.json
run-02-summary.json
```

Der korrigierte, visuell geprüfte Satz liegt unter:

```text
/Users/eggermann/Projekte/dailydoase/GENRATIONS-KAUFHAUF/717-glas-kaufhaus-shorty-book-image-only-test/parts/image-only-scenes/run-05-scene-01.png
...
/Users/eggermann/Projekte/dailydoase/GENRATIONS-KAUFHAUF/717-glas-kaufhaus-shorty-book-image-only-test/parts/image-only-scenes/run-05-scene-06.png
```

Der konkrete neueste Ordner lässt sich anzeigen mit:

```sh
find /Users/eggermann/Projekte/dailydoase/GENRATIONS-KAUFHAUF \
  -maxdepth 1 \
  -type d \
  -name '*-glas-kaufhaus-shorty-book-image-only-test*' \
  -print
```

## Video-Test: zwei billige Szenen mit Concat

Dieser Test ist für den ersten echten Bewegungs- und Continuity-Check. Er erzeugt genau zwei WAN-Videos und verbindet sie anschließend. Es wird keine Endcard und kein Sound erzeugt.

Vom Projektordner starten:

```sh
./lib/generator/adapter/MIX-again-freshweb.glas-kaufhaus-two-video-preview.sh
```

Der feste Ablauf:

```text
Szene 1: Kaufhaus + Monster + erste Semantic-Stream-Kollision → WAN, 2 Sekunden
Endframe: wird analysiert, falls WAN einen letzten Frame liefern konnte
Szene 2: übernimmt diesen sichtbaren Endzustand → WAN, 2 Sekunden
Ergebnis: beide WAN-Clips werden concateniert
Preview: Concat wird lokal klein und stark komprimiert exportiert
```

Der Test setzt diese kostensparenden Werte:

```text
FRESHWEB_SCENE_COUNT=2
FRESHWEB_SCENE_LENGTHS=2,2
FRESHWEB_SINGLE_VIDEO_MAX_DURATION=2
FRESHWEB_MIRELO_MODE=off
FRESHWEB_WAN_AUDIO_ENABLED=0
FRESHWEB_END_CARD_ENABLED=0
FRESHWEB_ENABLE_DRIFT_CORRECTION=0
FRESHWEB_END_FRAME_ANALYSIS=1
```

`FRESHWEB_END_FRAME_ANALYSIS=1` ist wichtig: Es beschreibt Pose, Monster-Silhouette, Kaufhaus-Geometrie, Licht und sichtbare Mutation des ersten WAN-Endframes. Diese Beschreibung ergänzt den Prompt von Szene 2. Falls kein Endframe vorhanden ist, läuft der Test trotzdem weiter: Szene 2 verwendet den normalen bestehenden Startframe-Fallback.

WAN 2.6 Flash erzeugt bei Runware nur 720p oder 1080p. Für geringe Kosten nutzt der Test daher die kleinste WAN-Stufe, 720p, ohne Audio und mit der erlaubten Mindestlänge von zwei Sekunden. Erst nach dem Concat erzeugt FFmpeg eine kleine Kontrollkopie.

Ungefähre WAN-Video-Kosten: zwei Clips × zwei Sekunden × $0.025 ohne Audio = $0.10. Ein FLUX-Kontext-Startbild und die Vision-Anfragen kommen zusätzlich hinzu.

Nach Erfolg zeigt das Script zwei Pfade an:

```text
WAN concat: .../merged/<zeitstempel>-concat.mp4
Small preview: .../merged/two-scene-preview-272x208.mp4
```

Die kleine Preview ist die schnelle Sichtkontrolle. Der WAN-Concat bleibt die bessere Datei für die Beurteilung von Bewegung, Drift und Übergang.

### Video-Test variieren

Andere kleine Preview-Größe:

```sh
FRESHWEB_PREVIEW_WIDTH=544 \
FRESHWEB_PREVIEW_HEIGHT=416 \
./lib/generator/adapter/MIX-again-freshweb.glas-kaufhaus-two-video-preview.sh
```

Endframe-Analyse ausschalten, wenn nur WAN-Bewegung geprüft werden soll:

```sh
FRESHWEB_END_FRAME_ANALYSIS=0 \
./lib/generator/adapter/MIX-again-freshweb.glas-kaufhaus-two-video-preview.sh
```

Einen klar getrennten Generation-Ordner vergeben:

```sh
FRESHWEB_FOLDER=glas-kaufhaus-two-video-preview-a \
./lib/generator/adapter/MIX-again-freshweb.glas-kaufhaus-two-video-preview.sh
```
