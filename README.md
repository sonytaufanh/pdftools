# PDFTools

Browser-based PDF and image utilities for public use. Files are processed locally in the browser for common workflows such as:

- Rotate, reorder, split, merge, and watermark PDF pages
- Merge PDF and image files into one PDF
- Compress PDF files
- Convert PDF pages to JPG or PNG
- Convert multiple images into a PDF

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

## Quality Checks

```bash
npm run lint          # ESLint (JS/TS)
npm run typecheck     # tsc --noEmit
npm run format        # Prettier (write)
npm run format:check  # verify formatting
npm run test          # Vitest (unit tests)
npm run test:coverage # Vitest + coverage thresholds
npm run test:e2e      # builds, then runs Playwright tests
npm run build         # production bundle
```

Playwright needs browsers once: `npm run test:e2e:install`. To use an already
installed Chrome instead, set `PW_CHANNEL=chrome` when running the tests.

## Production Notes

- Documents are processed client-side; no file is uploaded to a server.
- Route chunks are lazy-loaded. The first paint only ships the shell, then each
  module loads its own chunk on demand.
- Errors are contained by an app-level and per-module error boundary; uncaught
  errors and rejections are logged via the global handlers in
  `src/lib/errorReporting.js`.
- Sessions with unsaved work trigger a `beforeunload` warning and are stored in
  IndexedDB, so PDF Tools, Merge, and Image-to-PDF sessions survive a reload.
  Closing a document clears its saved session.
- Long-running pdf.js renders are cancelled through `AbortController` when a
  preview is replaced or a modal closes.
- Errors are reported with a build version and, when `VITE_ERROR_ENDPOINT` is
  set, sent via `navigator.sendBeacon`. The footer shows the build version and
  lets users clear all sessions saved in the browser.
- Card reordering is keyboard-accessible through the move controls on each card,
  and animations respect `prefers-reduced-motion`.
- `public/_headers` ships security headers (including a strict CSP) and asset
  cache rules. It is read by hosts such as Netlify and Cloudflare Pages; adapt
  it if you deploy elsewhere. `public/robots.txt` is included as well.
- Sourcemaps are emitted as hidden maps (`build.sourcemap: 'hidden'`) for error
  tracking without exposing them from the app.
- A web app manifest and a small service worker (`public/sw.js`, registered in
  production only) make the app installable and offline-capable for the shell.
- Feature highlights: watermarks can be positioned; PDF-to-image supports page
  ranges and 72–216 DPI output; image-to-PDF supports A4/Letter/Legal and image
  quality; compression accepts an optional target size; merging shows a review
  step before download; and a User Guide explains each tool.
- The pure modules under `src/lib` are TypeScript; React pages/components remain
  JSX. Run `npm run typecheck` after changes.
- `sitemap.xml` is generated at build time from `VITE_SITE_URL`
  (defaults to `https://pdftools.example.com`).
- pdf.js v6 removed `PDFDocumentProxy.destroy()`; teardown goes through
  `destroyPdfProxy()` (`src/lib/pdfjs.ts`), which uses the loading task.
- CI (`.github/workflows/ci.yml`) runs lint, format check, unit tests, build,
  and Playwright end-to-end tests on every push and pull request.
- Keep dependencies patched: `npm audit` should report zero vulnerabilities.

The app is a static Vite build, so the generated `dist/` folder can be deployed to any static host such as Cloudflare Pages, Netlify, Vercel, GitHub Pages, or a regular web server.

## Privacy Note

The core document processing runs client-side in the browser. A normal static deployment does not need a backend to receive uploaded files.
