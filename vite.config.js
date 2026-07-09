import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: true
  },
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('pdfjs-dist') || id.includes('pdf-lib')) return 'pdf-vendor';
          if (id.includes('heic2any')) return 'media-vendor';
          if (id.includes('jszip')) return 'file-vendor';
          if (id.includes('react') || id.includes('react-router') || id.includes('scheduler')) return 'react-vendor';
          return undefined;
        }
      }
    }
  }
});
