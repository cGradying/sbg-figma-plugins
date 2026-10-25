# sbg-figma-plugins

Figma plugins for the AWS Student Builder Group. One monorepo, one shared core, one plugin per folder.

| Plugin | What it does |
| --- | --- |
| [Pixel Render](plugins/pixel-render) | Draw the AWS pixel-grid look on a grid, render it to Figma as vector shapes. Gradients, merged text boxes, effects, light and dark and custom themes, overlay on a photo. |

## Install Pixel Render

You need the Figma desktop app and a built copy of the plugin. The built files are committed, so there is nothing to compile.

1. Clone the repo.
2. In Figma desktop, open any file and go to **Plugins → Development → Import plugin from manifest…**
3. Pick `plugins/pixel-render/manifest.json`.
4. Run it from **Plugins → Development → Pixel Render**.

Works on Free and Professional plans. Nothing is sent over the network, and the manifest allows no domains.

## Using Pixel Render

**Draw.** Pick a color chip, then use the tools: Brush, Erase, Rect, Bucket, Select (shortcuts `B E R G S`, undo with Cmd or Ctrl `Z`). The grid is 54 px cells on 1080 × 1080 by default, which is the AWS post layout.

**Select and merge.** Drag with Select to box a region, click a box to select it, Shift to add, drag inside a selection to move it. In the Selection section, Merge turns the region into one box. A box takes live text, a font, a color, and a gradient. Split puts the cells back.

**Gradients.** Select cells or a box, pick two theme colors and an angle. Stepped gives each cell one flat sampled color. Smooth is a true Figma gradient across the region.

**Effects.** Pixel fade, stair stagger, hard shadow, seeded scatter and outline, all on the selection. The same seed gives the same scatter.

**Themes.** Light and Dark are built in, with colors sampled from the SBG posts. A Photo theme adds a yellow role. Everything you draw references a role, never a color, so switching theme recolors the whole drawing. Make a custom copy to edit roles or add one, and export or import it as JSON to share with the team.

**Render.**

| Button | Result |
| --- | --- |
| Render to Figma | A new `Pixel Render` frame in the middle of the viewport. |
| Render over selection | In Overlay mode: sizes the grid to the layer you selected and lays a transparent, gridless frame on top of it. |
| Update frame | Redraws the selected `Pixel Render` frame from the editor. Hand edits inside that frame are replaced. |
| Edit frame | Loads the selected frame's saved drawing back into the editor. |
| Flatten copy | A copy next to the frame where same-color cells are merged into single vector paths. The original keeps its drawing data. |

The drawing is stored on the frame as plugin data, so Edit frame works after closing and reopening the plugin. An unsent draft is kept per Figma user.

### What Render produces

```
Pixel Render (frame, clipped)
├── Grid      one vector with all grid lines
├── Cells     one named rectangle per cell, or paths after Flatten
└── Boxes     auto-layout frames with live text
```

Everything is vector. Smooth gradients are one vector path with a gradient fill.

## Develop

Needs Node 22.18 or newer, which runs the TypeScript tests directly.

```bash
npm install
npm test            # core unit tests
npm run typecheck   # core and plugin
npm run build       # writes plugins/pixel-render/dist
```

The panel runs in a browser with a stand-in for Figma, which draws the scene the plugin would create as SVG:

```bash
npm run dev                                  # rebuild on change
python3 -m http.server 4881 -d plugins/pixel-render/dist
# open http://localhost:4881/preview.html
```

### Layout

```
packages/core    Pure TypeScript. Grid model, themes, tools, effects, gradients, geometry, serialize, scene builder.
packages/ui      pixel-id-maker tokens and fonts shared by every plugin panel.
plugins/*        One folder per plugin: manifest.json, src/main.ts (Figma side), src/ui.ts (panel).
```

Everything that decides what gets drawn lives in `core` and has tests: a `Doc` (sparse cells, merged boxes, gradients, theme id) goes in, a `Scene` (rects, paths, boxes with resolved colors) comes out. `plugins/pixel-render/src/main.ts` only turns a `Scene` into Figma nodes, and the dev preview turns the same `Scene` into SVG.

### Add a plugin

1. Copy `plugins/pixel-render` to `plugins/<name>` and change the `name` in `package.json` and `manifest.json`.
2. Import from `@sbg/core` for the shared model and `packages/ui` for the look.
3. Add the build to the root `build` script.

### Limits

- Figma stores plugin data per node. Large drawings are split across keys of 90 kB, which has only been tested with the chunking logic, not inside Figma.
- Grids are capped at 120 cells per side.
- The Figma-side code is checked against the Figma typings and the simulated preview, and has not been run inside Figma yet.

## License

MIT © 2026 cgradying. See [LICENSE](LICENSE).
