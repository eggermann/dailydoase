# Glas-Kaufhaus: Image-only-Test

Dieser Test erzeugt ausschließlich die geplanten Szenenbilder. WAN-Video, WAN-Sound und Mirelo werden nicht initialisiert.

Der Image-only-Test verwendet vier vorbereitete, fotografische Kaufhaus-Referenzen. Jede enthält bereits genau einen isolierten Green Monster Protagonisten. Dadurch bleibt die reale Kaufhaus-Geometrie in jeder Szene dominant; Posterlayout, Künstlerporträts, Menschen und Schrift werden nicht als Bildreferenz übernommen.

```text
lib/Plak-2_images/monster-reference/green-monster-protagonist.png
lib/Plak-2_images/kaufhaus-location-with-monster/
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
