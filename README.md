# sbg-figma-plugins

Figma plugins for the AWS Student Builder Group. One monorepo, one shared core, one plugin per folder.

| Plugin | What it does |
| --- | --- |
| [Pixel Render](plugins/pixel-render) | Draw the AWS pixel-grid look on a grid and render it to Figma as vector shapes. Merged boxes you can carve into any shape, gradients, effects, light, dark and custom themes, overlay on a photo. |

## Set up

You need the Figma desktop app (plugin development does not work in the browser) and this repo on your machine. The built plugin is committed, so you do not need Node to use it.

1. Clone the repo, or download it as a ZIP and unzip it.

   ```bash
   git clone https://github.com/cGradying/sbg-figma-plugins.git
   ```

2. Open any file in Figma desktop.
3. Go to **Plugins → Development → Import plugin from manifest…**
4. Choose `plugins/pixel-render/manifest.json` inside the folder you just cloned.
5. Run it from **Plugins → Development → Pixel Render**. After the first time it also shows under your recent plugins.

Works on Free and Professional plans. The plugin makes no network requests, and the manifest allows no domains.

To update, pull the repo and run the plugin again. Figma reads the files fresh each time you launch it.

## Quick start

1. Run the plugin. The panel opens with an empty grid. Click **Load the Co-Lead example** if you want something to poke at.
2. Pick a color chip, then drag on the grid with **Brush**.
3. Pick **Box** and drag a rectangle. That adds a merged box. Drag over a box again to grow it into any shape.
4. Pick **Erase** and drag across part of a box. Only those cells are carved out, the rest of the box stays, and the result is a clean shape.
5. Press **Render to Figma**. A `Pixel Render` frame appears in the middle of your view. Resize it and everything inside scales with it.

## The tools

| Tool | Key | What it does |
| --- | --- | --- |
| Brush | `B` | Paints cells as you drag. |
| Box | `A` | Drag a rectangle to add a merged box. Drag over an existing box and the two become one shape. |
| Fill | `R` | Fills a dragged rectangle of cells with the color. |
| Bucket | `G` | Flood-fills an empty or same-colored area. |
| Erase | `E` | Erases cells. On a box it carves only the cells you touch. If that cuts the box in two, the pieces become separate boxes. |
| Lines | `L` | Hides single grid line segments. Click or drag across a line. Hold Shift to bring a line back. Boxes and cells stay. |
| Select | `S` | Drag to select, click a box to select all of it, Shift adds, drag a selection to move it. Esc deselects. |

Undo and redo are `Cmd/Ctrl+Z` and `Cmd/Ctrl+Shift+Z`.

**Color and opacity.** Pick a role color, then choose Solid or Outline. The opacity slider goes from 0 to 100 percent. A fully transparent cell or box still exists, and the editor shows a dashed marker where it is.

**Selection bar.** When cells are selected, a bar under the grid offers Merge (turns the selection into one box, touching cells only), Split (box back to cells), Paint, More and Erase. More opens gradient, nudge and box text.

**Box text.** Select one box, open Selection, type the text, choose font, style, size, color and alignment. In Figma, a rectangular box becomes an auto-layout frame with live text. A carved box is a frame with one outline vector, with the text inside its biggest rectangle.

**Gradients.** Select cells or a box, pick two theme colors and an angle. Stepped gives each cell one flat sampled color. Smooth is a true Figma gradient across the shape.

**Effects.** Pixel fade, stair stagger, hard shadow, seeded scatter and outline, all on the selection. The same seed gives the same scatter.

**Grid lines.** Canvas and lines has a grid line opacity slider that goes all the way to 0. The Lines tool removes one segment at a time, and Restore hidden lines brings them all back.

**Themes.** Light and Dark are built in, with colors sampled from the SBG posts. A Photo theme adds a yellow role. Drawings reference roles, not colors, so switching theme recolors everything. Make a custom copy to edit roles or add one, and export or import it as JSON to share with the team.

**Canvas.** 1080 × 1080 and 1080 × 1350 presets, or any size, with a cell size you choose (54 px by default). Overlay mode sizes the grid to the layer you select in Figma, puts a transparent frame on top of it, and starts with grid lines off. Raise the grid line opacity if you want them over a photo.

## Rendering to Figma

| Button | Result |
| --- | --- |
| Render to Figma | A new `Pixel Render` frame in the middle of the viewport. In Overlay mode: a transparent frame over the layer you selected. |
| Update frame | Redraws the selected `Pixel Render` frame from the editor. Hand edits inside that frame are replaced. |
| Edit frame | Loads the selected frame's saved drawing back into the editor. If you resized the frame, the grid grows or shrinks to match, keeping the cell size. |
| Flatten copy | A copy next to the frame where same-color cells are merged into single outline paths. The original keeps its drawing data. |

What gets created:

```
Pixel Render (frame, clipped)
├── Grid      one vector with all visible grid lines
├── Cells     one named rectangle per cell, or merged outline paths after Flatten
└── Boxes     rectangular boxes are auto-layout frames, carved boxes are frames with one outline vector
```

- **Resizing.** Every shape has Scale constraints, so dragging the frame's handles in Figma stretches the whole drawing. Text keeps its font size. Use Figma's Scale tool (`K`) to scale text too.
- **Assets.** The frame carries export settings for PNG at 2x and SVG, so select it and use Export. A carved box is one clean vector outline, usable as a mask or a standalone asset.
- **Saving.** The drawing is stored on the frame, so Edit frame works after closing and reopening the plugin. An unsent draft is also kept per Figma user.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Plugin is missing from the Development menu | You imported in the browser. Use Figma desktop. |
| Buttons grayed out | Update, Edit and Flatten need a `Pixel Render` frame selected in Figma. Render over selection needs a layer selected. |
| Text shows in the wrong font | The font name must match an installed Figma font exactly. Pick from the list in the Font field. |
| A merge failed | Merge needs cells that touch each other. Select one connected area. |
| Grid looks different after switching to Overlay | Overlay turns the grid lines off. Raise the slider under Canvas and lines. |

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

Commit the rebuilt `plugins/pixel-render/dist/code.js` and `ui.html` with source changes, since teammates import the built files.

### Layout

```
packages/core    Pure TypeScript. Grid model, themes, tools, effects, gradients, geometry, serialize, scene builder.
packages/ui      pixel-id-maker tokens and fonts shared by every plugin panel.
plugins/*        One folder per plugin: manifest.json, src/main.ts (Figma side), src/ui.ts (panel).
```

Everything that decides what gets drawn lives in `core` and has tests: a `Doc` (sparse cells, boxes as cell sets, gradients, grid line cuts, theme id) goes in, a `Scene` (rects, outline paths, boxes with resolved colors) comes out. `plugins/pixel-render/src/main.ts` only turns a `Scene` into Figma nodes, and the dev preview turns the same `Scene` into SVG.

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
