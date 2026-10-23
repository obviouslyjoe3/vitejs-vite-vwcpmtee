# Parley

Real-time chat built with React, Vite and Socket.IO.

## Run it
    npm install
    npm run dev

Open the URL in two tabs (or on two devices) and join with different names.
The chat server runs inside Vite's dev server, so there is nothing else to start.

## Features
- Rooms (create your own, edit the topic) and private direct messages, online or offline
- **Private groups**: invite-only rooms with an owner. Members can add people; the owner can rename, change the icon, remove members or delete the group. Non-members never receive the group or its messages. Groups get an emoji icon (or #), and small notices show who created, added, removed or renamed
- **Profiles**: pronouns, a short bio and a time zone (Settings > Profile). Click any avatar or name, or anyone in a member list, to open their profile card with local time, status, last seen, member-since and a Message button
- Replies, edit and delete your own messages, 20 emoji reactions
- **Polls** (single or multiple choice, live votes) and **pinned messages** per conversation
- **Search** inside a conversation, plus a **quick switcher** (Ctrl/Cmd+K) that jumps to rooms, people or any message
- Formatting: **bold**, _italic_, ~~strike~~, `code`, code blocks, > quotes, links; toolbar and Ctrl+B / Ctrl+I
- Slash commands: `/me`, `/shrug`, `/poll`, `/roll` (or `/roll 2d6`), `/flip`. Dice are rolled on the server so results can't be faked
- ||Spoiler text|| stays blurred until clicked; `:fire:` style emoji shortcodes with autocomplete
- **Saved messages**: bookmark any message from the ⋯ menu and find it again across all conversations
- Press **↑** in an empty composer to edit your last message; hover a reaction to see who gave it
- Export any conversation as a `.txt` file from the Details panel
- @mentions with autocomplete; image sharing by paperclip or paste
- Unread counts that survive reloads, a "New" divider, jump-to-latest, mark all read
- Star and mute conversations; unsent drafts are kept per conversation
- Custom status (emoji and text); pick your avatar color
- Appearance: light, dark or system; five accents; bubble or flat message style; three text sizes
- Alerts for DMs and mentions: sound, desktop notifications, unread count in the tab title
- Live presence, last-seen times, typing indicators, automatic reconnect
- Messages saved on the server in `.data/parley.json`

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
