# Film-Generierung aus Iteration 015

Verwende `film-plan.json` als Szenenplan. Der Artikel, die drei geprüften Startbilder, ihre Bildprompts, Story-Beats, Laufzeiten und Bewegungs-Prompts stehen dort zusammen.

Erzeuge aus `scenePlan` drei einzelne Image-to-Video-Clips in der Reihenfolge 1, 2, 3. Löse `startImagePath` relativ zum Ordner dieser `film-plan.json` auf und lade genau diese Datei als Startbild. Übergib den zugehörigen `videoPrompt` unverändert an das Videomodell und halte die geplanten sieben Sekunden ein. Erfinde keine zusätzlichen Figuren, Schriftzüge oder Szenenwechsel. Bewahre den gemalten Guernica-Look der jeweiligen Startbilder und halte vorhandene Buchstaben stabil. Dieses Ergebnis soll die drei Clips in derselben Iteration neben den Startbildern und Prompts ablegen.

Die Iteration enthält derzeit noch keine Videoclips. Dieses Dokument und `film-plan.json` bereiten den nächsten Image-to-Video-Lauf vor.
