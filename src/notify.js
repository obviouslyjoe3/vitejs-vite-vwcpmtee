const KEY = 'parley:prefs';
export const defaultPrefs = {
  // alerts
  sound: true,
  volume: 60, // 0-100
  desktop: false,
  preview: true, // show message text in desktop notifications
  scope: 'default', // 'default' = DMs + @mentions, 'all' = every unmuted conversation, 'mentions' = @mentions only
  title: true, // unread count in the tab title
  pause: false, // pause all alerts
  quiet: false, // quiet hours
  quietFrom: '22:00',
  quietTo: '07:00',
  // messaging
  sendKey: 'enter', // 'enter' or 'mod' (Ctrl/Cmd+Enter)
  shortcodes: true, // turn :fire: into emoji when sending
  spellcheck: true,
  typing: true, // let others see when you are typing
  reqAlerts: true, // alert when someone sends a message request
};

const mins = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// True while alerts should stay silent (paused, or inside quiet hours, which may span midnight).
export function alertsSilenced(prefs, now = new Date()) {
  if (prefs.pause) return true;
  if (!prefs.quiet) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const from = mins(prefs.quietFrom);
  const to = mins(prefs.quietTo);
  if (from === to) return false;
  return from < to ? cur >= from && cur < to : cur >= from || cur < to;
}

export function loadPrefs() {
  try {
    return { ...defaultPrefs, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return { ...defaultPrefs };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {}
}

let ctx;
export function beep(volume = 60) {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume?.();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, (Math.max(0, Math.min(100, volume)) / 100) * 0.3), ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch {}
}

export async function askDesktopPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export function showDesktop(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, tag: 'parley' });
    }
  } catch {}
}
