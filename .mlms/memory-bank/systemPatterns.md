# System Patterns

## Working Pattern

Use one vertical slice:
1. Confirm poster inputs and words.
2. Build deterministic manifest and prompts.
3. Generate scene/video.
4. Concatenate/save output.
5. Verify files and media.
6. Review diff and update memory.

## Generation Pattern

`poster JPGs + exhibition JSON + words -> scene prompt -> protagonist/story context -> video part(s) -> ffmpeg concat -> final.mp4`

## Cheap Two-Video Preview Pattern

`saved semantic scene plan -> one FLUX Kontext location/monster start frame -> WAN scene 1 (2 s) -> extracted actual last frame -> WAN scene 2 (2 s) -> lossless concat -> small local review copy`

Use this only as a media-cost and continuity probe. It avoids a fresh Wikipedia request but does not replace the normal Semantic Stream in production.

## Failure Pattern

Mirelo is an optional post-process. If it fails, retain video parts and continue to concatenation.

## Fresh Trailer Pattern

`fresh Semantic Stream -> whole-second 1+ scene plan -> six WAN clips -> collision-cut concat + continuous forward dolly -> compact readable end card -> one Mirelo final-sound attempt`

## Semantic Story Engine Pattern

`getNext once -> structured anchor/collision cue -> productive contradiction -> physical rule -> monster interpretation/intent/tactic -> visible action -> local consequence/clue/tension -> semantic + visual inheritance -> FLUX/WAN prompts -> end frame`

Legacy cue strings serialize from structured records. They never become the canonical source again.
