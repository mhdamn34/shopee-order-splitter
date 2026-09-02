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
ffmpeg -i demo.mov -vf "fps=10,scale=720:-1:flags=lanczos,palettegen" -y /tmp/pal.png
ffmpeg -i demo.mov -i /tmp/pal.png \
  -lavfi "fps=10,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse" -y docs/media/demo.gif
```

Two passes on purpose. A plain `ffmpeg -i demo.mov demo.gif` quantises to a
generic 256-colour palette and comes out muddy; the first pass builds a palette
from the actual footage instead.

`fps` and `scale` are the two knobs, and duration is the third and largest. For
scale, measured against a 1688x1414 23-second capture:

| Settings | Size |
| --- | --- |
| 900px, 12fps | 6.0 MB |
| **720px, 10fps** | **3.2 MB** |
| 640px, 10fps | 2.8 MB |

720 is the default here because GitHub renders README images at roughly 900px
wide anyway, so the extra pixels cost bandwidth without showing up.

Always re-encode from `demo.mov`, never from an existing `demo.gif` — going
GIF to GIF quantises an already-quantised palette and the result smears.

## Checking the size

```bash
du -h docs/media/demo.gif
```

Aim for under 5 MB.
