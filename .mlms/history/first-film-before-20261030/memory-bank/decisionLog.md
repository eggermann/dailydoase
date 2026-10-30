# Decision Log
## Decisions
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
