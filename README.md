# KyleGPT

Kyle's personal site. It opens on a chat page that looks like an AI assistant, titled KyleGPT. After a visitor types 5 characters, one long crack runs across the glass from near the bottom-left corner to near the top-right. At 10 characters the glass is hit just above the input box: radial cracks burst out, fork and stop where they meet other cracks, concentric cracks join them at staggered points, and later fractures start from the existing cracks. Shards of every shape and size fall away, showing green Matrix-style rain underneath until it fills the screen. What happens after that is still open.

There is no build step. Everything is plain HTML, CSS, and JavaScript, and all of the effects are drawn in code.

| Path | What it is |
|---|---|
| `/` | KyleGPT (`index.html`, `kylegpt/`) |
| `/tavern/` | The earlier pixel-art tavern, plus the plain résumé page at `/tavern/?view=page` |
| `/3d/` | The 3D tavern prototype |

## KyleGPT files

- `kylegpt/main.js`: the chat page, the 5- and 10-character triggers, and the timing knobs in `CONFIG` at the top.
- `kylegpt/glass.js`: builds the fracture (the long crack, the impact, the cascade), works out the shards from the regions the cracks enclose, and draws the cracks, the hole and the falling shards.
- `kylegpt/matrix.js`: the green rain.
- `kylegpt/style.css`: the chat layout.

URL options for working on the effect: `?progress=0` shows the long crack fully formed, `?progress=0.4` (any value up to 1) jumps that far into the shatter, and `?seed=123` gives the same fracture every time. Visitors who prefer reduced motion get the cracks without the spreading, no falling shards, a still frame of the rain, and no screen jolt. The "Skip to plain résumé" link stays on screen the whole time, and old `/?view=page` links redirect to the plain page.

---

## The Wayward Lantern (/tavern/)

The earlier version of the site: a pixel-art fantasy tavern you walk around to read about Kyle.

| Spot in the inn | Section |
|---|---|
| Brom, the dwarf barkeep | About me |
| Quest board by the door | Work experience |
| Fireplace and bookshelf | Interests |
| Hooded stranger in the corner | Other |

There is no build step. Everything is plain HTML, CSS, and JavaScript, and all art and sound are generated in code.

### Editing content

All text lives in the `<main id="content">` block of `tavern/index.html`. Each `<section data-section="...">` is one section. The game windows, the Menu, and the plain-page version (`?view=page`) all read from that block, so edit it once and every view updates.

NPC chatter and the lines they say to visitors are in `tavern/js/npcs.js` (`DEFS` and `SCENES`).

### Running locally

Serve the repo folder and open http://localhost:8000:

```
python3 -m http.server 8000
```

### Files

- `tavern/js/world.js`: tavern map, static art, rain, fire, and lighting
- `tavern/js/npcs.js`: characters, idle animations, walking, and banter
- `tavern/js/sprites.js`: character sprite templates and palettes
- `tavern/js/audio.js`: synthesized ambience (rain, fire, crowd, laughter, clinks, thunder, lute)
- `tavern/js/main.js`: game loop, player movement, input, dialog, and menus

### 3D prototype

`3d/` holds a separate 3D version of the tavern in a classic MMO style, built
with [three.js](https://threejs.org) (vendored in `3d/vendor/`, no build step).
It lives at `/3d/`.

- Walk with WASD or the arrow keys, drag to look around, scroll or pinch to zoom, and press E or Space to talk. On phones, tap to walk or talk.
- Section text is read from `tavern/index.html`, so both versions stay in sync. Sound reuses `tavern/js/audio.js`.
- Models are free CC0 KayKit packs. See `3d/assets/CREDITS.md`, and `3d/js/manifest.js` for swapping in other art.
- Stairs along the north wall lead to a second floor with a hallway, two small bedrooms, and a large bedroom with a canopy bed. The upstairs only shows while you're on it.
- `3d/js/world.js`: taproom, fireplace, quest board, lighting, lightning. `3d/js/upstairs.js`: stairs and bedrooms. `3d/js/cast.js`: characters and banter. `3d/js/main.js`: camera, controls, dialog, menus.
- Performance: `3d/js/quality.js` renders at 1x with an FXAA pass and steps the resolution down on slow devices. Add `?pr=1.5` (or any ratio) to the URL to pin a pixel ratio for testing. The scene uses only three point lights, which move upstairs with the player, and identical textures are shared after loading.
