import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { attachChat } from './server/chatServer.js';

// Runs the Parley chat server inside Vite's own HTTP server, so one `npm run dev`
// gives you the website AND the real-time backend on the same URL.
const parleyServer = () => ({
  name: 'parley-chat-server',
  configureServer(server) {
    if (server.httpServer) attachChat(server.httpServer);
  },
  configurePreviewServer(server) {
    attachChat(server.httpServer);
  },
});

export default defineConfig({
  plugins: [react(), parleyServer()],
  server: { watch: { ignored: ['**/.data/**'] } },
});
