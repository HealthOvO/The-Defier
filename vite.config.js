import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    minify: false,
    terserOptions: {
      mangle: false, // Will enable mangle to true once ESM migration is fully completed
    },
    rollupOptions: {
      output: {
        // format: 'iife' causes Vite to wrap things and break window attachment in some edge cases during partial migration
      }
    }
  }
});
