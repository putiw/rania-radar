# Rania Radar

A small, phone-first reaction-time experiment made as a goodbye gift for Rania. Each run selects 25 unique photos from the 111-photo library: five randomly selected Rania targets and 20 randomly selected distractors. Each face is shown for 500 ms, with a 1.5-second response window and a uniformly random 0–3 second inter-trial delay. The results screen separates the latest run from cumulative results saved in that browser/PWA installation, and the histogram uses cumulative target responses only.

## Run it locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Vite also prints a network URL that you can open on a phone connected to the same Wi-Fi.

For a production-like local test, including the offline service worker:

```bash
npm run build
npm run preview
```

The public app is deployed automatically to
`https://putiw.github.io/rania-radar/` whenever `main` is updated.

## Face images

The original files remain unchanged. Phone-optimized WebP copies live in `public/faces/`; the importer detects the actual image data, so JPEG, PNG, HEIC, misleading extensions, and files without extensions are all safe once converted. The browser never has to decode HEIC itself.

The background uses one unique 1536×3328 lossless 1/f noise field (`public/noise-1f-full.png`) fitted over the viewport. It is generated in MATLAB by `scripts/generate_noise_background.m` with the original experiment toolbox's `oneoverf(1.1, ...)` method. It is never tiled, so there are no repeated quadrants or hard seams. Stimulus images keep automatic width and height with only maximum width/height limits, so their full natural aspect ratios are preserved without clipping or cropping.

To regenerate the background with the installed MATLAB release:

```bash
/Applications/MATLAB_R2024b.app/bin/matlab -batch "addpath('scripts'); generate_noise_background"
```

To add or replace a stimulus:

1. Create a phone-sized WebP copy in `public/faces/`.
2. Add its path to the `PEOPLE` list in `src/main.js`.
3. Set `isTarget: true` for a Rania photo or `false` for a distractor.

For example:

```js
{
  id: "rania-9",
  name: "Rania",
  image: "faces/rania9.webp",
  isTarget: true,
}
```

Names are never shown during a trial.

## PWA hosting

GitHub Actions tests and builds the app with the repository base path before
deploying `dist/` to GitHub Pages. The hosted app uses HTTPS and can be installed
as a PWA. Its service worker caches the experiment shell and face library for
offline use after the first successful visit.

The original high-resolution files in `face/` are intentionally excluded from
Git. Only the phone-optimized copies under `public/faces/` are published.

## Checks

```bash
npm test
npm run build
```
