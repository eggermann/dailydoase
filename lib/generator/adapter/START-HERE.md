# Freshweb / Selfomat starts

Run these commands from the repository root. Choose one entry point:

| Purpose | Command |
| --- | --- |
| Selfomat film with camera or queued people | `zsh lib/generator/adapter/MIX-again-freshweb.selfomat.sh` |
| Selfomat starter photos, one queued image per iteration | `zsh lib/generator/adapter/MIX-again-freshweb.selfomat-starter-photos.sh` |
| Selfomat placeholder test, Vision + five takt scenes | `FRESHWEB_TEST_INPUT_IMAGE_FOLDER=/absolute/path/surprise_selfies_folder zsh lib/generator/adapter/MIX-again-freshweb.selfomat-placeholder-test.sh` |
| StoryTransport to MiniMax Music 3 MP3 | `node lib/generator/adapter/MIX-again-freshweb.selfomat-story-music-test.mjs` |
| Exhibition trailer preset | `zsh lib/generator/adapter/MIX-again-freshweb.glas-kaufhaus-trailer.sh` |
| General 4:3 preset | `zsh lib/generator/adapter/MIX-again-freshweb.middle-cost-4-3.sh` |
| Fast WAN preset | `zsh lib/generator/adapter/MIX-again-freshweb.prompt-fast-wan-trippy-4-3.sh` |
| Person-gated WAN preset | `zsh lib/generator/adapter/MIX-again-freshweb.prompt-fast-wan-strict-4-3.sh` |

`MIX-again-freshweb.js` is the shared Node entry, called by the presets. It is not another configuration choice.

The starter-photo test needs `FRESHWEB_CAMERA_PERSON_QUEUE_PATH` pointing to a JSON queue. It sets `FRESHWEB_SELFOMAT_IMAGE_ONLY=1`: each iteration creates one opening photo and no video. The film preset leaves this flag off.

For dynamic film length, leave `FRESHWEB_SCENE_COUNT` and `FRESHWEB_SCENE_LENGTHS` unset. `FRESHWEB_SCENE_COUNT_MODE=taktmuster` derives scene count and lengths from rhythm. `FRESHWEB_SCENE_COUNT_MODE=semantic` derives scene count from the number of configured words and lengths from rhythm. Explicit count or lengths override the dynamic count.

The placeholder test uses the sorted image files in `FRESHWEB_TEST_INPUT_IMAGE_FOLDER`, one opening image per iteration. A single `FRESHWEB_TEST_INPUT_IMAGE_PATH` remains supported as an explicit one-image fallback. It skips camera and queue waiting, sends each selected image to Vision, then starts the configured scenes.

The MiniMax test reads the saved story — not a camera frame — and uses `o4-mini` to create separate MiniMax Studio fields: global metadata, vocal details, arrangement, and tagged lyrics. Duration is inferred from scene durations (or short story beats); set `FRESHWEB_STORY_MUSIC_DURATION` to override it. It writes `story-music/iteration-0002.music-blueprint.json`, the source audio, and `iteration-0002.mp3` next to the selected StoryTransport artifact. It reads `OPENAI_API_KEY` and `HF_API_TOKEN` from `../dailydoase/.env`; set `FRESHWEB_DOTENV_PATH` or `FRESHWEB_NODE_MODULES_PATH` when running elsewhere.

Old standalone experiment, quality, and repro wrappers were removed from this branch. Git history retains them if a specific experiment is needed again.
