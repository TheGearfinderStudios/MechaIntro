# MechaIntro

Video intro builder for **The Gearfinder Society**. Put together a short opening from Font Awesome icons, text, images and a soundtrack on a timeline, and export it straight to MP4 or WebM.

It is not a cinematic tool. It is for making the bumper that opens a video, fast: a logo that pops in, a title that slides up, music that fades out.

## Features

- **Font Awesome Free 7 icons**: around 2,000 icons (Solid, Regular and Brands), searchable. They are drawn as vectors, so they stay sharp at any resolution.
- **Layers**: icon, text and image, each with position, rotation, opacity, color and shadow/glow.
- **Entrance and exit animations**: fade, zoom, pop, slide, spin, blur and drop, with adjustable easing.
- **Continuous motion** while a layer is on screen: rotate, pulse, float and swing.
- **Background**: solid color, linear or radial gradient, image (with dimming) or transparent, with an optional vignette.
- **Audio**: volume, fade in/out, trimming the start of the file, and a waveform on the timeline.
- **Timeline**: drag, resize, snapping (magnet) and zoom.
- **Export** to MP4 (H.264 + AAC) or WebM (VP9 + Opus). WebM keeps transparency, ready to overlay in a video editor.
- Undo/redo, and projects saved as `.mintro` files.

## Requirements

- Windows 10 or 11 (x64)
- [Node.js](https://nodejs.org) 22 or newer, only to run from source or build the installer

FFmpeg is bundled (through the `ffmpeg-static` package); nothing else needs installing.

## Running

```bat
start.bat
```

On first run, `start.bat` installs the dependencies itself. `start.bat --dev` also opens DevTools.

With npm:

```bash
npm install
npm start        # or: npm run dev
```

> Always use `start.bat` or `npm start`, not `electron .` directly. Terminals in Electron-based editors such as VS Code can set `ELECTRON_RUN_AS_NODE=1`, which stops Electron from opening. The launcher in [scripts/start.mjs](scripts/start.mjs) clears that variable.

## Building

| Script | What it does |
| --- | --- |
| `build.bat` | Runs the tests and builds the installer, `dist\MechaIntro Setup <version>.exe` |
| `build-dir.bat` | Quick build with no installer and no tests, `dist\win-unpacked\MechaIntro.exe` |

Extra options are passed through to electron-builder. Close MechaIntro before building: if it is running from `dist\`, the folder is locked and the build fails.

The application icon lives in [build/icon.png](build/icon.png) (a PNG of at least 256×256; the `.ico` is generated at build time).

## Usage

1. Add elements with the buttons in the **Layers** panel: icon, text, image or audio.
2. Position them by dragging on the stage. They snap to the centre lines; hold **Alt** to place freely or **Shift** to lock the axis.
3. Adjust timing, look and animations in the **Properties** panel on the right.
4. On the **Timeline**, drag the bars to change when each layer is on screen. On audio clips, the edges trim the sound and the dots on top set the fades.
5. Click **Export video**.

Right-click a layer or a sound (in the Layers panel, on the timeline or on the stage) to copy, cut, paste, duplicate or delete it. Copied elements go on the system clipboard, so they paste into another project, or another MechaIntro window, with all their settings. A pasted layer lands just above the selected one, in the same place on the canvas and on the timeline.

The interface is in English by default; Brazilian Portuguese is available from the language button in the titlebar. The choice is remembered.

### Shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause |
| Home / End | Go to start / end |
| `,` / `.` | Step back / forward one frame (Shift: 10 frames) |
| Arrows | Move the selected layer 1 px (Shift: 10 px) |
| PageUp / PageDown | Raise / lower the layer in the stack |
| Delete | Delete the selection |
| Esc | Clear the selection |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / cut / paste the selected layer or sound |
| Ctrl+D | Duplicate |
| Ctrl+N / Ctrl+O | New project / open |
| Ctrl+S / Ctrl+Shift+S | Save / save as |
| Ctrl+E | Export video |
| Ctrl+mouse wheel | Zoom the timeline |

### Project files

A `.mintro` file is JSON holding the settings, the background, the layers and the audio clips. Images and sounds are referenced by **absolute path** on disk, not copied into the project: move or rename them and the project can no longer find them.

## How it works

- **One function draws everything.** [render/scene.js](src/js/render/scene.js) draws a frame onto a 2D canvas. The stage uses it for the preview and the exporter for every frame of the video, so what you see in the editor is what ends up in the file.
- **Frame-by-frame export.** The [exporter](src/js/export/exporter.js) renders each frame off the clock and streams the pixels to an ffmpeg process ([electron/export.js](electron/export.js)). A heavy frame takes longer, but is never dropped.
- **Audio.** The same Web Audio scheduling plays the preview and, in an `OfflineAudioContext`, renders the final mix to a WAV for ffmpeg. Fades use an equal-power (sine) curve.
- **Icons.** On `npm install`, [scripts/build-icon-catalog.mjs](scripts/build-icon-catalog.mjs) extracts the SVG paths of the free Font Awesome icons into `src/generated/icons.js`. Run `npm run icons` if that file goes missing.

### Layout

```
electron/        main process: window, dialogs, disk access, ffmpeg
src/
  index.html
  styles/        theme.css (Steampunk theme tokens) and app.css
  js/
    core/        project model, animation, audio, store, icons (no DOM)
    render/      scene drawing and the image/sound cache
    audio/       playback and mixdown
    export/      video export
    i18n/        interface text: en.js (default) and pt-BR.js
    ui/          stage, layers, properties, timeline, dialogs
scripts/         icon catalogue and launcher
tests/           core tests
```

The look follows the Gear Mechanica **Steampunk** standard: the palette in [theme.css](src/styles/theme.css) is the one in `Gear-Mechanica-Client/src/UI/Theme/Steampunk.css`. Change one, change the other.

### Translations

Every string the interface shows (the main process's dialogs included) comes from [src/js/i18n/](src/js/i18n/), through `t('key')`. English is the reference and the fallback. To add a language, copy `en.js`, translate the values, and register the file in `LOCALES` and `DICTIONARIES` in [i18n/index.js](src/js/i18n/index.js). The tests fail if a language is missing a key, has one English lacks, or drops a `{placeholder}`.

The GPL notice in the About dialog stays in English whatever the language: it is the license's own legal wording.

## Tests

```bash
npm test
```

They cover the DOM-free core (animations, audio envelopes, WAV encoding, the project model, undo history and the icon catalogue) and the translations.

## Contributing

Contributions are accepted under the [Contributor License Agreement](CLA.md). By submitting one, you agree to it.

## License

Copyright (C) 2026 The Gearfinder Studios.

MechaIntro is free software, released under the [GNU General Public License, version 3](LICENSE) or (at your option) any later version. It comes with **no warranty**.

Third-party components (Font Awesome Free, FFmpeg, Electron) carry their own licenses, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Font Awesome icons used in exported videos are under CC BY 4.0, which asks for attribution to Font Awesome.
