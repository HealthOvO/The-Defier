import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    minify: false, // temporarily disable minification to fix scoping issues for global variables
    rollupOptions: {
      output: {
        format: 'iife'
      }
    }
  }
});
