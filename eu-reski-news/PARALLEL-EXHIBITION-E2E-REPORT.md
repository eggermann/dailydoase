# EU-RESKI Parallel Exhibition Runner – Testbericht

**Datum:** 2026-10-29  
**Branch:** `codex/auto-director-fresh`  
**Revision:** `25c699a5` plus lokale Teständerungen  
**Kommando:** `npm run test:exhibition-parallel-e2e`

## Ergebnis

Der isolierte EU-RESKI-Regressionstest bestand mit **20 Suites und 64 Tests**. Provider-Schlüssel werden aus den Kindprozess-Umgebungen entfernt; Netzwerkzugriffe sind in den Runner-Startup-Fixtures blockiert beziehungsweise gemockt. Keine kostenpflichtigen Provider-Aufrufe wurden ausgelöst.

Das Ergebnis ist **keine Produktionsfreigabe**: Die komplette Kette aus zwei parallel generierenden Workern, echten Provider-Protokoll-Mocks, fertigen Videodateien, First/Last-Frame-Glue und finaler Ausstellungsmontage wurde in diesem Lauf nicht als ein einzelner End-to-End-Test ausgeführt.

## PASS

| Testbereich | Nachweis |
|---|---|
| Echter paralleler Runner-Start | `exhibition-runner-startup.test.js` startet den Exhibition Runner als Kindprozess. Er startet zwei Generatorprozesse, erzeugt getrennte Run-Verzeichnisse und speichert getrennte Zeitpläne von 360.000 ms und 720.000 ms. Netzwerk ist blockiert. |
| `generationInterval=-1` | `parallel-runner-corrections.test.js` startet den echten Generatorprozess mit deaktiviertem Zeitplan und bestätigt erfolgreich gespeichertes `run.json`. |
| Scheduler-Grundlagen | `parallel-schedule.test.js` prüft 10/h, 5/h, lange Generierungen, Resume und verpasste Slots ohne Burst-Nachholen. |
| Artikelkonkurrenz und Crash-Recovery | `global-article-reservations.test.js` verwendet konkurrierende Prozesse, SIGKILL vor Commit und Wiederherstellung nach gespeichertem Datensatz. Keine doppelte Reservierung im Konkurrenzfall. |
| Lock-Konkurrenz | `directory-lock.test.js` prüft konkurrierende Prozesse, verzögerte Owner-Initialisierung, SIGKILL, verwaiste Sperren und wiederholtes Erwerben/Freigeben. |
| Zwei Exhibition Runner | `exhibition-runner-lock-e2e.test.js` startet zwei echte Runner mit demselben temporären Ausgabeordner. Der zweite wartet auf die Sperre, startet nach SIGTERM des ersten und gibt die Sperre nach eigenem SIGTERM frei. |
| `pending_media` | `pending-media-resume.test.js` startet den echten Generator bei zwei Resume-Läufen. Derselbe gespeicherte Video-Task wird gepollt; der Run wird nicht allein durch ausstehende Medien als fehlgeschlagen markiert. |
| Shutdown bei Worker-Fehler | `parallel-runner-corrections.test.js` simuliert Worker-Fehler, beendet den Geschwisterprozess und wartet dessen Settlement ab. |
| Montagefortschritt | `parallel-runner-corrections.test.js` prüft Wiederherstellung des `gluedThroughIteration`-Zustands nach bereits fertiger Montage. |
| Ein-Szenen-Montage | `one-scene-assembly.test.js` nutzt isolierte Medien und Fake-FFmpeg; Ein-Szenen-Auto und nachfolgende Iteration sind montagefähig. |
| Künstlerische/manuelle Kompatibilität | Auto-Director-, Konzept-, Szenenzahl-, historische Auto-V1- und manuelle Prompt-Golden-Master-Tests bestanden. |

## NOT RUN

| Testbereich | Fehlender Nachweis |
|---|---|
| Vollständige Zwei-Worker-Generierung | Kein einzelner Lauf mit zwei Workern, die je zwei abgeschlossene Iterationen samt Artikeln, GPT-Prompts, Bildern, Videos und Filmen erzeugen. |
| 1-, 3- und 12-Szenen-Providerlauf | Szenenzahl und Prompthandoff sind durch bestehende Tests geprüft; zwölf Szenen wurden nicht durch die gesamte Medienpipeline generiert. |
| Runware/Hugging Face/Video-Provider | Keine vollständigen Request-/Response-Mocks für Bild- und Videoanbieter mit heruntergeladenen gültigen Medien. |
| Komplette Glue-/Filmvarianten | Die vollständige First/Last-Glue-, Audio-Normalisierungs- und Sparse/Full-Film-Kette wurde nicht für 1, 3 und 12 Szenen ausgeführt. |
| Montage-Crashpunkte | Abbruch während Glue/FFmpeg sowie Crash nach fertiger Datei vor Statusspeicherung wurden nicht vollständig als Prozess-Resume-Kette getestet. |
| Alle Artikelreservierungs-Crashpunkte | Crash vor Reservierung, vor GPT-Aufruf und nach GPT-Antwort wurden nicht alle durch einen echten Runner-Resume-Prozess getestet. |
| Historischer Auto V1 | Fixture, Requests, Task-IDs und Entscheidungswiederverwendung geprüft; kein echter gespeicherter Run im Original oder in vollständiger isolierter Kopie durch den gesamten Generator wiederaufgenommen. |
| SIGINT/SIGTERM gesamter Runner | SIGTERM beim Start ohne Montage ist geprüft; SIGINT und Signaltests während aktiver Montage fehlen. |
| Wiederholter vollständiger Lauf | Die Regression-Suite lief einmal; identischer Doppel-Durchlauf und endlicher Zwei-Iterationen-pro-Worker-Lauf wurden nicht ausgeführt. |

## Codeänderungen

- `package.json`: Testkommando `test:exhibition-parallel-e2e`.
- `tests/eu-reski-news/offline-test-environment.js`: Provider-Schlüssel aus Test-Kindprozessen entfernen.
- EU-RESKI-Subprozess-Tests verwenden diese bereinigte Umgebung.
- Keine Änderungen an `planner.mjs`, Auto-Director-Prompts, Guernica-Prompts, Scene-Konfigurationen, Defaults oder Run-Daten.

**Freigabe:** nicht empfohlen, bis die oben als NOT RUN markierten kritischen vollständigen Provider-, Montage-, Crash-Resume- und Doppel-Runner-Tests bestanden sind.
