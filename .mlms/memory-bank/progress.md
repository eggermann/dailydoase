# Progress

## Done

- Added canonical structured cue records plus legacy serialization from the same records.
- Preserved exactly one `getNext()` call per assigned scene.
- Added mandatory semantic schema fields and semantic derivation report.
- Added hard causal validation for cue identity, physicalization, absence agency, clues, tension, consequence inheritance, and FLUX/WAN propagation.
- Added two-attempt targeted scene repair and strict semantic abort.
- Added four scene-plan debug artifacts and extended image-only summaries.
- Made semantic priority mandatory even when camera mode supplies a custom planner system prompt.
- Passed 36 focused tests, 84 Shorty-Book tests, webpack build, syntax checks, and `git diff --check`.
- Confirmed trailer branch is active.
- Inspected `lib/Plak-2_images/`.
- Found four poster pages, three additional JPG references, and exhibition JSON.
- Initialized project brief and memory bank.
- Selected `6d94760a...jpg` as Green Monster Ware Haus protagonist/reference.
- Implemented three-scene Glass Kaufhaus trailer runner.
- Added dedicated output root `GENRATIONS-KAUFHAUF/`.
- Added scene-planner model/request/response console logging via the existing logger.
- Reworked trailer runner to derive monster prompt, creative rule, artist dossier, and three-scene film arc from the rich exhibition JSON.
- Added four people-free, 4:3 Kaufhaus location photos and local scene-context path support.
- Mapped three people-free location views across the three trailer scenes while retaining the monster as separate protagonist reference.
- Generated and logged a three-scene plan twice.
- Generated six real Runware image-only scenes in persistent generation folder 717.
- Validated all six PNGs as distinct, decodable 1184×880 RGBA images.
- Saved `run-01-summary.json` with six existing output paths.
- Added model-safe Runware payload handling for FLUX Kontext Pro fixed controls and dimensions.
- Created a transparent monster-only identity asset without poster text, panels, or people.
- Created four canonical Kaufhaus-plus-monster location references.
- Generated corrected Run 5: six scenes preserve the photographed Kaufhaus, contain one monster protagonist, and contain no people or poster layout.
- Generated one real FLUX Kontext scene-1 start image and two real silent Runware WAN 2.6 Flash clips at the two-second minimum.
- Continued scene 2 from scene 1's extracted WAN last frame; scene-prompt metadata records the exact handoff path.
- Concatenated the clips to a verified four-second MP4 and created a 272×208 local review copy.
- Added a two-video snapshot-resume entry point so the cost test does not re-query Wikipedia before WAN starts.
- Ran a fresh normal Semantic Stream iteration in generation folder `720-glas-kaufhaus-fresh-sound-iteration-1`.
- Generated six fresh WAN scene clips with the whole-second 1+ rhythm.
- Created a collision-cut concat with continuous forward dolly and compact exhibition end card.
- Preserved Mirelo's final-sound failure artifact without losing the visual concat.

## In Progress

- Runware Mirelo fallback needs a provider-compatible video upload/reference instead of the rejected inline data URL.

## Next

- Replace or rehost oversized Runware Mirelo video input, then regenerate final sound without rerendering scenes.
- Cap or compact FLUX image prompts before the provider's 3000-character boundary.

## Semantic Story Engine Iteration 2

### Acceptance Result

- [x] Fresh Semantic Stream produced six collision cue records.
- [x] Mandatory semantic validation passed for all six scenes with zero errors and warnings.
- [x] Six WAN clips rendered and were concatenated in narrative order.
- [x] Final silent collision cut exists and decodes as H.264, 448x336, 17.428571 seconds.
- [ ] Final sound track: Mirelo fetch failed; Runware fallback rejected the inline video input and returned the silent cut.

### Output

- Generation: `GENRATIONS-KAUFHAUF/726-semantic-story-engine-iteration-2/`
- Video: `GENRATIONS-KAUFHAUF/726-semantic-story-engine-iteration-2/merged/1785921513140-collision-cut.mp4`
- Validation: `GENRATIONS-KAUFHAUF/726-semantic-story-engine-iteration-2/parts/scene-prompts/semantic-validation-report.json`

### Observed Gap

- Scene 2 FLUX prompt exceeded Runware's 3000-character limit, so generation reused the preceding frame. WAN rendering and the six-scene merge still completed.
- Contact-sheet QA shows the fallback leaks a bright magenta reference background into one scene; this is the highest-priority visual correction.
