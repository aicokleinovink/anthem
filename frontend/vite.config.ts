import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // The API holds the TCP socket to the receiver; proxying keeps us same-origin,
    // so there is no CORS to configure on the Express side.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
