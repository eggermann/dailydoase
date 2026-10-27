# Decision Log
## Decisions
### D-0006: Iteration-local artistic auto-mode
Status: Accepted
Context: The exhibition needs article-specific creative settings while preserving the existing manual pipeline and resume behavior.
Decision: Add a default-off `generation.autoMode` and CLI switch. Use one structured Story-model director decision per new iteration, persist selected and effective flags before Story planning, reuse saved decisions on resume, and keep technical/media controls manual. Constrain scene video mode to executable `image_to_video`.
Consequences: Auto mode adds one bounded GPT planning call per new iteration (with one correction attempt only after invalid output). Manual mode makes no additional calls and leaves Story prompts/schemas untouched. No live run is part of implementation.

### D-0005: P-Video-2-Pro cost recipe for ten new iterations
Status: Complete
Context: User requested ten linear EU-RESKI news iterations with five images and matching videos per iteration.
Decision: Use `prunaai:p-video@2-pro`, 480p, `settings.mode=cost`, first-frame image-to-video, and GPT-timed scene durations clamped to 5–6 seconds. Generate each iteration's videos and FFmpeg merge before selecting the next article/stream fragments.
Consequences: 50 videos cost $2.9375 from Runware; 50 images cost $0.963. GPT billed separately. Artifacts are stored in a fresh date-stamped run folder.

### D-0001: One image-focused iteration before video
Status: Accepted
Context: The user wants to focus first on scene-image generation and inspect the first scene in HTML.
Decision: Plan three scenes and H3-ready prompts, but generate only the first still image in this iteration.
Consequences: No H3 video/audio provider cost is incurred yet; the HTML records the proposed next-step prompt.
### D-0002: Use article photo and Guernica bull mask as references
Status: Accepted
Context: The story should be grounded in a news image and use a recurring fictional crocodile.
Decision: Send the source article photo and masked bull fragment as ordered reference images to FLUX.2 [flex]; ask GPT to analyze the article photo and design the crocodile from that shape cue.
Consequences: The HTML must label references and preserve their source paths.
### D-0003: Interpret semantic input as multilingual anchors
Status: Accepted
Context: User wrote “EU, de EU en EU ru”.
Decision: Interpret this as EU / Europa / Europe / Европа and pass all four anchors to story planning.
Consequences: Store the exact anchors in iteration metadata so this assumption is visible.

### D-0004: Finish all scene stills through API only
Status: Accepted
Context: User clarified that each scene needs a starting image, with no videos, and then specified API only.
Decision: Generate each missing still through Runware API; do not use Playground UI or alternate image providers for the remaining scenes.
Consequences: Iteration remains incomplete until scenes 2 and 3 are generated with a Runware key linked to the funded wallet.
