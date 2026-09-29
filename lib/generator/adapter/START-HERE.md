# Freshweb / Selfomat starts

Run these commands from the repository root. Choose one entry point:

| Purpose | Command |
| --- | --- |
| Selfomat film with camera or queued people | `zsh lib/generator/adapter/MIX-again-freshweb.selfomat.sh` |
| Selfomat starter photos, one queued image per iteration | `zsh lib/generator/adapter/MIX-again-freshweb.selfomat-starter-photos.sh` |
| Exhibition trailer preset | `zsh lib/generator/adapter/MIX-again-freshweb.glas-kaufhaus-trailer.sh` |
| General 4:3 preset | `zsh lib/generator/adapter/MIX-again-freshweb.middle-cost-4-3.sh` |
| Fast WAN preset | `zsh lib/generator/adapter/MIX-again-freshweb.prompt-fast-wan-trippy-4-3.sh` |
| Person-gated WAN preset | `zsh lib/generator/adapter/MIX-again-freshweb.prompt-fast-wan-strict-4-3.sh` |

`MIX-again-freshweb.js` is the shared Node entry, called by the presets. It is not another configuration choice.

The starter-photo test needs `FRESHWEB_CAMERA_PERSON_QUEUE_PATH` pointing to a JSON queue. It sets `FRESHWEB_SELFOMAT_IMAGE_ONLY=1`: each iteration creates one opening photo and no video. The film preset leaves this flag off.

For dynamic film length, leave `FRESHWEB_SCENE_COUNT` and `FRESHWEB_SCENE_LENGTHS` unset. `FRESHWEB_SCENE_COUNT_MODE=taktmuster` derives scene count and lengths from rhythm. `FRESHWEB_SCENE_COUNT_MODE=semantic` derives scene count from the number of configured words and lengths from rhythm. Explicit count or lengths override the dynamic count.

Old standalone experiment, quality, and repro wrappers were removed from this branch. Git history retains them if a specific experiment is needed again.
