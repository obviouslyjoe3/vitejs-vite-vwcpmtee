# Parley

Real-time chat built with React, Vite and Socket.IO.

## Run it
    npm install
    npm run dev

Open the URL in two tabs (or on two devices) and join with different names.
The chat server runs inside Vite's dev server, so there is nothing else to start.

## Features
- One shared public room, **global**, that everyone joins. It is silent by default: no unread badge, sounds or desktop alerts (an @mention still gets through)
- Rooms (create your own, edit the topic) and private direct messages, online or offline
- **Private groups**: invite-only rooms with an owner. Members can add people; the owner can rename, change the icon, remove members or delete the group. Non-members never receive the group or its messages. Groups get an emoji icon (or #), and small notices show who created, added, removed or renamed
- **Profiles**: pronouns, a short bio and a time zone (Settings > Profile). Click any avatar or name, or anyone in a member list, to open their profile card with local time, status, last seen, member-since and a Message button
- **Blocking**: block anyone from their profile card. Blocking removes the friendship, cancels pending requests, closes the DM and stops them from messaging you or sending requests (enforced on the server). Their messages in rooms are hidden from you and never alert you, and they are not told. Manage the list in Settings > Privacy & blocking
- **Privacy**: appear offline (hides online status and last seen) and choose whether anyone can send you friend requests
- **Friends, v17**: star friends as **favorites** (they sit at the top of your list and the Online now strip), **search, sort and filter** your friends, see **friends since** dates, get **People you may know** suggestions (friends of friends and people from your private groups, one tap to add), **Accept all / Decline all** on requests, and see how long ago a request was sent
- **Messages, v17**: click **edited** to see earlier versions (last 5); **Remind me** from the ⋯ menu (20 min, 1 hour, 3 hours, tomorrow 9 am, fires as a toast while Parley is open); messages made only of a few emoji show **big**; new slash commands `/pick pizza, tacos, sushi` and `/8ball will it work?` (both decided on the server)
- **New in v18**
  - **Photo viewer**: click any photo to open a gallery of every photo in the conversation. Use ← / → (or the side buttons) to move between them, click to zoom, and download from the top bar
  - **Drag and drop**: drop a photo anywhere on the chat to attach it to your message
  - **Pause alerts** (moon button in the sidebar header): silence sounds and desktop alerts for 30 minutes, 1 hour, 4 hours or until 9 am. Unread counts keep updating, and it turns itself off when the time is up
  - **Recent reactions**: the reaction picker shows the ones you used last at the top
  - **Draft and @ markers** in the sidebar: a *Draft* tag on conversations holding an unsent message, and an **@** badge when someone mentioned you (this includes the global room)
  - **Keyboard shortcut list**: press **?** anywhere (not while typing)
  - **Look**: softer rounded surfaces, squircle avatars, a gentler active-conversation highlight, date dividers drawn as lines, and a floating message box with a focus glow
- **Profile pictures**: upload one in Settings > Profile. It is cropped to a square and shrunk in your browser, then shows everywhere your avatar does. Remove it any time to go back to your color and first letter
- **v21 redesign**: floating rounded panels on a soft backdrop, a light sidebar (dark in dark mode), new cooler palette, Figtree body type, round header tools, a bigger floating message box and pill buttons. On phones the panels go back to full screen
- **Online now** strip in the sidebar: friends who are online right now, one tap to message them
- **Toasts** for saves, blocks, connection drops and incoming friend requests, and **confetti** when you send or react with 🎉
- **Chat backgrounds**: dots, plain, grid, aurora or dusk (Settings > Appearance)
- Replies, edit and delete your own messages, 20 emoji reactions
- **Polls** (single or multiple choice, live votes) and **pinned messages** per conversation
- **Search** inside a conversation, plus a **quick switcher** (Ctrl/Cmd+K) that jumps to rooms, people or any message
- Formatting: **bold**, _italic_, ~~strike~~, `code`, code blocks, > quotes, links; toolbar and Ctrl+B / Ctrl+I
- Slash commands: `/me`, `/shrug`, `/poll`, `/roll` (or `/roll 2d6`), `/flip`, `/pick`, `/8ball`. Dice are rolled on the server so results can't be faked
- ||Spoiler text|| stays blurred until clicked; `:fire:` style emoji shortcodes with autocomplete
- **Saved messages**: bookmark any message from the ⋯ menu and find it again across all conversations
- **Parley's own emoji**: 52 hand-drawn emoji (faces, hands, hearts, objects) replace the system ones in reactions, the picker, messages, room icons and statuses. Messages are still stored as normal Unicode, and anything not drawn falls back to the system emoji. Artwork lives in `src/emojiArt.js`
- Press **↑** in an empty composer to edit your last message; hover a reaction to see who gave it
- Export any conversation as a `.txt` file from the Details panel
- @mentions with autocomplete; image sharing by paperclip or paste
- Unread counts that survive reloads, a "New" divider, jump-to-latest, mark all read
- Star and mute conversations; unsent drafts are kept per conversation
- Custom status (emoji and text); pick your avatar color
- **Settings** (two-pane dialog: Profile, Account, Privacy & blocking, Appearance, Notifications, Messaging, Shortcuts, Data & reset)
  - Appearance: theme cards (system/light/dark), five accents, bubble or flat style, text size, comfortable or compact spacing, avatars on/off, 12/24-hour clock, Parley or system emoji, animations auto/full/reduced, with a live preview
  - Notifications: pause all, quiet hours (can span midnight), choose what alerts you (DMs + @mentions, everything, or @mentions only), sound with volume and a test button, desktop notifications with optional message text, tab-title unread count
  - Messaging: send with Enter or Ctrl/Cmd+Enter, shortcode conversion, spell check, share typing status on/off
  - Data: clear drafts, clear saved messages, reset all settings (each asks to confirm)
- Live presence, last-seen times, typing indicators, automatic reconnect
- Messages saved on the server in `.data/parley.json`

## Notes
- To test with two people, use two different browsers or a private window.
- Accounts: username + password (scrypt-hashed). Sign-ins last 90 days, are extended every time you come back (so you stay signed in as long as you visit now and then), and are shared by all tabs in a browser.
- Friends: add people by exact username. DMs need friendship; unfriending keeps history readable but closes the chat.
- Public rooms: browse and join from the compass button. You only get messages from rooms you joined. Owners can ban people.
- Data from older versions (name-only users and chats) is wiped on first start of this version.

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
