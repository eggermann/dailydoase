# Active Context
## Current Goal
First fresh film from Generation running in the Mac mini player.
## Current Loop
Loop: 4
Phase: Complete
## Shared Loop Budget
Root Context: .mlms
Used: 4
Maximum: 5
## Current Focus
Diagnose failed generator autostart and restore it safely.
## Assumptions
- The user authorizes generation needed to produce the requested film.
## Risks / Unknowns
- A failed startup reported EPERM on the external volume.
- Firefox exhausted process slots with zombie children and has been terminated gracefully.
- Existing pending provider tasks must not be duplicated.
## Next Action
Await permission to commit, push and deploy the tested equivalent-duration restart fix.
