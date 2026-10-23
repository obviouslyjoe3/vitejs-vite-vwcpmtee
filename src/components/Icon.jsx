// Small stroke icon set (24px grid). Decorative by default; pass `label` to name one.
const PATHS = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>,
  pin: <><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" /><path d="M12 14v7" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.01" /></>,
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z" />,
  bellOff: <><path d="M6 9a6 6 0 0 1 9.5-4.9M18 11c0 3 1 4 2 5H5" /><path d="M10 20a2 2 0 0 0 4 0M4 4l16 16" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 4 1 5 2 6H4c1-1 2-2 2-6z" /><path d="M10 19a2 2 0 0 0 4 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  send: <path d="M4 12 20 4l-5 16-3.5-6.5z" />,
  clip: <path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L14 7" />,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5v.01M15 9.5v.01" /></>,
  reply: <path d="M10 8 4 13l6 5v-3.5c5 0 8 1 10 5-.5-6-4-9-10-9z" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  back: <path d="m15 5-7 7 7 7" />,
  down: <path d="m6 9 6 6 6-6" />,
  poll: <path d="M5 20V10M12 20V4M19 20v-7" />,
  hash: <path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  logout: <><path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" /></>,
  checks: <><path d="m3 12.5 4 4L15 8M11 16.5l1 1L21 8" /></>,
  bold: <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />,
  italic: <path d="M14 5h-4M14 19h-4M13 5l-2 14" />,
  code: <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12" />,
  strike: <path d="M5 12h14M16 7c-.5-1.5-2-2.5-4-2.5-2.5 0-4 1.2-4 3 0 1.5 1 2.2 4 3M8 17c.5 1.5 2 2.5 4 2.5 2.5 0 4-1.2 4-3" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20c1-4 4-6 8-6s7 2 8 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  bookmark: <path d="M7 4h10v16l-5-3.5L7 20z" />,
  download: <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />,
  command: <path d="M9 9V6a3 3 0 1 0-3 3zM9 9h6M9 9v6M15 9V6a3 3 0 1 1 3 3zM15 9v6M9 15H6a3 3 0 1 0 3 3zM15 15h3a3 3 0 1 1-3 3zM9 15h6" />,
};

export default function Icon({ name, size = 18, label, className = '' }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      {PATHS[name]}
    </svg>
  );
}
