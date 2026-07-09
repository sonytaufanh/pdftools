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

The app is a static Vite build, so the generated `dist/` folder can be deployed to any static host such as Cloudflare Pages, Netlify, Vercel, GitHub Pages, or a regular web server.

## Privacy Note

The core document processing runs client-side in the browser. A normal static deployment does not need a backend to receive uploaded files.
