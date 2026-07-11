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
