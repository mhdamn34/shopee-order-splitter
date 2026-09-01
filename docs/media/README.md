# Media

`demo.gif` is the animation at the top of the main README. It is not generated
by any build step — recapture it by hand when the UI changes enough to matter.

## Recording

macOS: `Cmd+Shift+5` → **Record Selected Portion** → drag around the app window
→ Record → stop from the menu bar. Save as `demo.mov`.

Keep it short. Ten to fifteen seconds covering one pass — edit an item, watch
the plan change, tap a comparison row, share — is plenty.

## Converting

```bash
ffmpeg -i demo.mov -vf "fps=12,scale=900:-1:flags=lanczos,palettegen" -y /tmp/pal.png
ffmpeg -i demo.mov -i /tmp/pal.png \
  -lavfi "fps=12,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse" -y docs/media/demo.gif
```

Two passes on purpose. A plain `ffmpeg -i demo.mov demo.gif` quantises to a
generic 256-colour palette and comes out muddy; the first pass builds a palette
from the actual footage instead.

`fps=12` and `scale=900` are the two knobs. Drop either if the file is too big —
GitHub will serve a large GIF, but anything past a few megabytes is slow to load
on a phone.

## Checking the size

```bash
du -h docs/media/demo.gif
```

Aim for under 5 MB.
