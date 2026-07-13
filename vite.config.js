import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    minify: 'terser',
    manifest: true,
    terserOptions: {
      mangle: false,
      keep_classnames: true,
      keep_fnames: true,
      compress: {
        passes: 2,
      },
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      output: {
        // format: 'iife' causes Vite to wrap things and break window attachment in some edge cases during partial migration
      }
    }
  }
});
