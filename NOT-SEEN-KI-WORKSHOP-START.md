# Not-seen KI workshop — Startbefehle

Repository auf dem Mac mini:

```sh
cd /Users/dominikeggermann/Projekte/dailydoase
```

## Generator 1: Strict 4:3

```sh
sh lib/generator/adapter/MIX-again-freshweb.prompt-fast-wan-strict-4-3.sh
```

Ausgabeordner:

```text
lib/generator/adapter/tests/GENERATIONS/freshweb-prompt-fast-wan-strict-4-3-test/parts
```

## Generator 2: Seen-90

```sh
sh lib/generator/adapter/MIX-again-freshweb.prompt-fast-wan-strict-4-3-seen-90.sh
```

Wörter dieses Stands:

```text
exhibition opening,en | point of view,en | horror,en | fries,en
```

Ausgabeordner:

```text
lib/generator/adapter/tests/GENERATIONS/freshweb-prompt-fast-wan-strict-4-3-seen-90-test/parts
```

## Player starten

In einem zweiten Terminal:

```sh
cd /Users/dominikeggermann/Projekte/dailydoase
node lib/server/test.cjs
```

Danach Player für Strict 4:3 öffnen:

<http://localhost:4000/continuous-video?folder=lib%2Fgenerator%2Fadapter%2Ftests%2FGENERATIONS%2Ffreshweb-prompt-fast-wan-strict-4-3-test%2Fparts>

Oder Player für Seen-90 öffnen:

<http://localhost:4000/continuous-video?folder=lib%2Fgenerator%2Fadapter%2Ftests%2FGENERATIONS%2Ffreshweb-prompt-fast-wan-strict-4-3-seen-90-test%2Fparts>

Server bleibt im zweiten Terminal laufen. Erwartete Meldung:

```text
Server running at http://0.0.0.0:4000/
```

Ohne `folder`-Parameter erwartet der Player den neuesten `parts`-Ordner. Solange
dieser noch keine Videos hat, spielt er stattdessen aus
`87-freshweb-prompt-fast-wan-strict-4-3-test/parts`. Sobald im neuesten Ordner
ein Video liegt, wird dieser automatisch zum Standard.

## 3× see all

Neben `Tail size` kann `3× see all` aktiviert werden. Der Player spielt dann
`Tail size × 3 × 10` Clips, danach alle stabilen Parts seit Erstellung der
Steuerdatei einmal, und kehrt anschließend zum neuesten Tail zurück.

Beim ersten Laden eines Parts-Ordners erstellt der Server dort diese editierbare
Steuerdatei:

```js
var repeatallaafter = -1;
```

`-1` bedeutet nur neuesten Tail. Die Checkbox schreibt `3` in dieselbe Datei.
Die Erstellungszeit der Datei bleibt dabei die Grenze für den vollständigen
Durchlauf.
