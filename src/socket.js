import { io } from 'socket.io-client';

// Same origin by default (the server runs inside Vite). Set VITE_SERVER_URL
// when the chat server is hosted somewhere else.
const url = import.meta.env.VITE_SERVER_URL || undefined;

export const socket = io(url, { autoConnect: false });
