import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

const SITE_URL = (process.env.VITE_SITE_URL || 'https://pdftools.example.com').replace(/\/$/, '');

function sitemapPlugin() {
  return {
    name: 'pdftools-sitemap',
    apply: 'build',
    generateBundle() {
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        `  <url><loc>${SITE_URL}/</loc></url>`,
        '</urlset>',
        ''
      ].join('\n');
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: xml });
    }
  };
}

export default defineConfig({
  plugins: [react(), sitemapPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  preview: {
    allowedHosts: true
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.{js,ts}', 'src/config/**/*.js'],
      exclude: ['src/lib/**/__tests__/**'],
      thresholds: {
        lines: 55,
        functions: 55,
        statements: 55,
        branches: 45
      }
    }
  },
  build: {
    target: 'es2020',
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('pdfjs-dist') || id.includes('pdf-lib')) return 'pdf-vendor';
          if (id.includes('heic2any')) return 'media-vendor';
          if (id.includes('jszip')) return 'file-vendor';
          if (id.includes('react') || id.includes('react-router') || id.includes('scheduler'))
            return 'react-vendor';
          return undefined;
        }
      }
    }
  }
});
