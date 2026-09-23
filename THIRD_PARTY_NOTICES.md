# Third-party notices

MechaIntro is licensed under the GNU General Public License, version 3 or (at
your option) any later version. See `LICENSE`.

It ships with the following third-party components, each under its own license.

## Font Awesome Free 7

- Copyright (c) Fonticons, Inc. — https://fontawesome.com
- Icons (the SVG paths MechaIntro draws on the stage and into exported
  videos): Creative Commons Attribution 4.0 International (CC BY 4.0) —
  https://creativecommons.org/licenses/by/4.0/
- Fonts (the webfont used by the editor interface): SIL Open Font License 1.1
  — https://openfontlicense.org
- Code (CSS): MIT License

Full terms: `node_modules/@fortawesome/fontawesome-free/LICENSE.txt` in the
source tree, and https://fontawesome.com/license/free.

Icons from Font Awesome that appear in a video exported with MechaIntro are
covered by CC BY 4.0, which asks for attribution to Font Awesome.

## FFmpeg

- The ffmpeg executable bundled for video encoding, distributed by the
  `ffmpeg-static` package (https://github.com/eugeneware/ffmpeg-static).
- Windows build from https://www.gyan.dev (release "essentials"), including
  libx264, libvpx and libopus.
- License: GNU General Public License, version 3 —
  https://www.gnu.org/licenses/gpl-3.0.html
- Source code: https://github.com/FFmpeg/FFmpeg — the exact revision and build
  configuration are listed in `ffmpeg.exe.README`, shipped next to the binary
  (`resources/app.asar.unpacked/node_modules/ffmpeg-static/`).

## Electron

- Copyright (c) Electron contributors, Copyright (c) 2013-2020 GitHub Inc.
- License: MIT — https://github.com/electron/electron/blob/main/LICENSE
- Electron bundles Chromium and other components; their licenses are listed in
  `LICENSES.chromium.html`, shipped next to the executable.
