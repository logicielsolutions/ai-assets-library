# Video workspace

This folder is a video studio for Claude Code. `README.md` is the map: read it at the start of a session.

Owner: <YOUR_NAME>. Brand: `brand/brand.md`.

## How work flows
- New video: the person drops files in `inbox/` and runs `/video-studio:make-video`. That skill owns the flow.
- Every video gets its own folder: `projects/<kebab-slug>/`, copied from `projects/_template/`. Never create video projects anywhere else.
- Continue a video: read the newest file for that project in `projects/handovers/` first.
- Asked for a handover: write `projects/handovers/YYYY-MM-DD_<slug>.md`.

## House rules
- Stop at two checkpoints: the plan (before anything is generated or built) and the first draft.
- Rendering: HyperFrames (`/hyperframes:hyperframes`, `npx hyperframes`).
- Voiceover: `python3 -I <plugin>/scripts/vo.py` with the key from `.env`. Never print, log or commit `.env`.
- Google Flow images are free. Veo / Omni clips cost credits: ask before every clip batch.
- Never overwrite a render. Write v1, v2, v3 into `05_final/`.
- Every name, number or claim on screen must come from the person or their references.
- Music: only tracks the person says they have the rights to, or music generated in code.
- Before showing a draft: `npx hyperframes check`, then look at the frames around every cut and transition for flashes (an element showing in place for one frame before its entrance) and anything cut off mid-move.
- Reviews and plans go to the person as an artifact page or a short rendered preview, not a long .md file.
- Keep replies short.
