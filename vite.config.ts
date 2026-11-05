import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4174',
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, _req, res) => {
            // Vite handles downstream close after upstream headers arrive.
            // Also cancel pending requests while a tuner is still starting.
            const cancel = () => proxyReq.destroy();
            res.once('close', cancel);
            proxyReq.once('close', () => res.off('close', cancel));
            if (res.destroyed) cancel();
          });
        },
      },
    },
  },
});
