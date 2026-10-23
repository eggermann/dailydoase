# System Patterns
## Working Pattern
1. Randomly select an image-bearing article from the newest aggregate and log the draw.
2. Analyze the article photo and available article text with GPT vision.
3. Plan a short EU story with three scenes, each 5–15 seconds.
4. Generate the first scene image using the article photo and Guernica mask references.
5. Save exact prompts, sanitized request/response metadata, costs, hashes, and media paths.
6. Build static HTML with source photo, generated frame, and collapsible logs.
7. Verify image files, links, scene durations, and memory updates.
## Quality Pattern
- Clearly separate article facts from invented metaphor/story elements.
- Keep the crocodile present as the recurring fictional protagonist.
- Let GPT choose dialogue/music only when the story benefits; otherwise record no dialogue/music.
- Use H3 prompt sections for scene, reference, characters, action, timeline, dialogue, voice, camera, lighting, sound, music, mix, ending, and constraints.
- Do not generate video during this still-image iteration.
