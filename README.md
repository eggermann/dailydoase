# Dailydoase — preserved Freshweb exhibition stand

This branch preserves the exact working stand for the Freshweb 4:3 test. The generator script uses the current dirty-state words `exhibition animal,en | fries,en`.

## Start the generator

From the repository root on the Mac mini:

```sh
cd /Users/dominikeggermann/Projekte/dailydoase
sh lib/generator/adapter/MIX-again-freshweb.prompt-fast-wan-strict-4-3.sh
```

## Start the local player

In a second terminal:

```sh
cd /Users/dominikeggermann/Projekte/dailydoase
node lib/server/continuous-player.cjs
```

Then open:

<http://localhost:4000/continuous-video?folder=lib%2Fgenerator%2Fadapter%2Ftests%2FGENERATIONS%2F87-freshweb-prompt-fast-wan-strict-4-3-test%2Fparts>

The server should print `Server running at http://0.0.0.0:4000/`. Keep that terminal running while using the continuous player.
