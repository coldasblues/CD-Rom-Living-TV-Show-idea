import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Ensures assets load correctly in sub-path preview environments
  server: {
    port: 5173,
    host: true
  },
  define: {
    // Safely polyfill process.env for the browser
    // We use JSON.stringify to ensure the object is injected as code
    'process.env': JSON.stringify({
      API_KEY: process.env.API_KEY || '',
      NODE_ENV: process.env.NODE_ENV || 'development'
    })
  }
});