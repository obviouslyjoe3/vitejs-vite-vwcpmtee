# Parley

Real-time chat built with React, Vite and Socket.IO.

## Run it
    npm install
    npm run dev

Open the URL in two tabs (or on two devices) and join with different names.
The chat server runs inside Vite's dev server, so there is nothing else to start.

## Features
- Chat rooms, plus create your own
- Private direct messages with anyone who has joined (online or not)
- Live presence, typing indicators, unread badges
- Emoji reactions, link detection, automatic reconnect
- Messages are saved on the server in `.data/parley.json`

## Notes
- Each browser tab is its own person (identity lives in sessionStorage), which makes
  testing easy. Closing the tab forgets who you were; rejoin with the same name.
- This is a demo-grade app: names are not passwords, so anyone can pick any name.
  Add real accounts before using it for anything private.

## Host it (Render, Railway, Fly.io, any Node host)
Parley needs a Node server that stays running (it holds live connections), so static
hosts like GitHub Pages, Netlify or Vercel will not work.

1. Put this project in a GitHub repository.
2. Create a new **Web Service** from the repo on your host.
3. Build command: `npm install --include=dev && npm run build`
4. Start command: `npm start`
5. Open the URL the host gives you. The site and the chat share one address.

Notes:
- The host provides the PORT variable automatically.
- Messages are saved to `.data/parley.json`. Many free plans wipe the disk on every
  restart or deploy, so history disappears. Attach a persistent disk, or swap the
  save/load functions in `server/chatServer.js` for a database.
- Free plans often sleep after inactivity, so the first visit can take ~30 seconds.
- Run one instance only. Chat state lives in that process's memory.
