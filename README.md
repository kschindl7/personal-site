# KyleGPT

Kyle's personal site. It opens on a chat page that looks like an AI assistant, titled KyleGPT. After a visitor types 5 characters, one long crack runs across the glass from near the bottom-left corner to near the top-right. At 10 characters the glass is hit just above the input box: radial cracks burst out, fork and stop where they meet other cracks, concentric cracks join them at staggered points, and later fractures start from the existing cracks. Shards of every shape and size fall away, showing green Matrix-style rain underneath until it fills the screen. Once half the glass is going, the input bar gives way too: one end is heavier, so it swings down around the other end, then slips free and falls. When the screen is gone, a menu forms in the rain. The section names are large glowing letters made of streaming code that stand in front of the rain: bright vertical strands run down inside each letter, their top and right edges burn almost white, a green bloom surrounds them and lights the floor beneath, and strands drip a little past their bottoms. Each word appears by filling with falling code. About, work, interests and résumé are stacked in the middle of the screen; "other" is small and dim in the bottom-right corner, lighting up only when pointed at, like a hidden extra. A small `kyle/` label above the stack condenses out of the rain. Choosing a section makes the other words fall away while the chosen word and `kyle/` fly up to become its heading. The rain parts to leave a clear column, headings and dates decode out of scrambled characters, and the rest of the section fades in. Any images or video dissolve out of a patch of rain as they scroll into view. Back reverses it. Each section has its own address (`#work`), so the browser's back button and direct links work.

There is no build step. Everything is plain HTML, CSS, and JavaScript, and all of the effects are drawn in code.

| Path | What it is |
|---|---|
| `/` | KyleGPT (`index.html`, `kylegpt/`) |
| `/tavern/` | The earlier pixel-art tavern, plus the plain résumé page at `/tavern/?view=page` |
| `/3d/` | The 3D tavern prototype |

## KyleGPT files

- `kylegpt/main.js`: the chat page, the 5- and 10-character triggers, and the timing knobs in `CONFIG` at the top.
- `kylegpt/glass.js`: builds the fracture (the long crack, the impact, the cascade), works out the shards from the regions the cracks enclose, and draws the cracks, the hole and the falling shards.
- `kylegpt/matrix.js`: the green rain, including how it forms the small `kyle/` label and parts around a section.
- `kylegpt/section.js`: a section's view: decoding text, fading blocks in, and revealing media.
- `kylegpt/codeword.js`: a menu word drawn as glowing letters made of streaming code.
- `kylegpt/menu.js`: the menu that forms in the rain, and the transition into and out of a section.
- `kylegpt/runs.js`: the small shooter behind "other?" (see below). Its links in `index.html` point at the plain page, so they still work without JavaScript, and the panel reads each section from `tavern/index.html`, so the content still lives in one place.
- `kylegpt/style.css`: the chat layout.

URL options for working on the effect: `?progress=0` shows the long crack fully formed, `?progress=0.4` (any value up to 1) jumps that far into the shatter, `?seed=123` gives the same fracture every time, and `?view=menu` skips straight to the menu. Without a seed, every visit breaks differently: where the long crack runs and how it forks, where the impact lands, how many cracks burst out, how many later fractures follow and when, and how fast the glass comes apart. Visitors who prefer reduced motion get the cracks without the spreading, no falling shards, a still frame of the rain, and no screen jolt. The "Skip to plain résumé" link stays on screen the whole time, and old `/?view=page` links redirect to the plain page.

### The game behind "other?"

"other?" answers the old question "can it run…?": a terminal checks whether the site can run it, then drops you into a small first-person maze whose walls are falling code. Delete the 11 bugs (corrupted red glyphs) with the blinking cursor and reach the exit, and the build passes, unlocking the actual kyle/other page. Everything in it is original. It lives at `#run`, so it can be linked to directly, and you can always skip straight to kyle/other or go back to the menu.

Controls: WASD or the arrow keys to move, the mouse or Q/E to turn (click to capture the mouse), click or Space to fire, Esc to pause or leave. On touch screens, drag on the left to move, drag on the right to turn, and tap the fire button. The level is the `MAP` at the top of `kylegpt/runs.js`: `#` wall, `.` floor, `S` start, `b` bug, `+` repair patch, `E` exit.

### Adding images, video and animations

Media is optional: a section can be all text. Where you want media, put it in that section (or a sub-section, such as a job or project) in `tavern/index.html`, and it shows on the plain page and in KyleGPT alike. Give images and videos their real `width` and `height` so the space is kept while they load.

```html
<!-- An image with a caption -->
<figure>
  <img src="media/project.jpg" width="1600" height="900" alt="What the image shows">
  <figcaption>A short caption.</figcaption>
</figure>

<!-- A video people can play -->
<video src="media/demo.mp4" controls width="1280" height="720"></video>

<!-- An animation: a looping, muted clip. It plays only while on screen,
     and not at all for visitors who prefer reduced motion. -->
<video src="media/loop.mp4" autoplay muted loop playsinline width="1280" height="720"></video>

<!-- An embed (YouTube, Vimeo, CodePen...) -->
<iframe src="https://www.youtube-nocookie.com/embed/VIDEO_ID" width="1280" height="720" title="What the video is"></iframe>

<!-- Anything else to reveal the same way (a canvas, an SVG...) -->
<div data-media>...</div>
```

Paths are relative to `tavern/`, so a `media/` folder there works for both pages.

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
