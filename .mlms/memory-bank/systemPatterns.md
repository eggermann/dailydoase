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

## Failure Pattern

Mirelo is an optional post-process. If it fails, retain video parts and continue to concatenation.
