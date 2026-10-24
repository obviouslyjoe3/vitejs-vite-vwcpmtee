// Small stroke icon set (24px grid). Decorative by default; pass `label` to name one.
const PATHS = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>,
  pin: <><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" /><path d="M12 14v7" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.01" /></>,
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z" />,
  bellOff: <><path d="M6 9a6 6 0 0 1 9.5-4.9M18 11c0 3 1 4 2 5H5" /><path d="M10 20a2 2 0 0 0 4 0M4 4l16 16" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.3 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z" /><path d="M7.5 11v.01M9.5 7.5v.01M14 7.5v.01" /></>,
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
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  userPlus: <><circle cx="10" cy="8" r="4" /><path d="M3 20c.9-3.6 3.5-5.5 7-5.5 1.600 0 3 .4 4.200 1.200M19 9v6M16 12h6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.500 19.500c.8-3.200 3.200-5 6.500-5s5.700 1.800 6.500 5M16 5a3.500 3.500 0 0 1 0 6.500M18 14.800c1.700.7 2.900 2.300 3.500 4.700" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18M10.6 5.1A9.6 9.6 0 0 1 12 5c6.500 0 10 7 10 7a17 17 0 0 1-3.200 4M6.400 6.400C3.600 8.200 2 12 2 12s3.500 7 10 7c1.600 0 3-.4 4.200-1M9.900 9.900a3 3 0 0 0 4.200 4.200" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  ban: <><circle cx="12" cy="12" r="9" /><path d="m5.600 5.600 12.800 12.800" /></>,
  inbox: <><path d="M4 13 6.500 5h11L20 13M4 13v6h16v-6M4 13h4.500l1 2.500h5l1-2.500H20" /></>,
  forward: <path d="m14 5 6 6-6 6M20 11H9a5 5 0 0 0-5 5v2" />,
  link: <path d="M10 14a4.500 4.500 0 0 0 6.400 0l3-3a4.500 4.500 0 0 0-6.400-6.400l-1 1M14 10a4.500 4.500 0 0 0-6.400 0l-3 3a4.500 4.500 0 0 0 6.400 6.400l1-1" />,
  mapPin: <><path d="M12 21s7-6.100 7-11a7 7 0 0 0-14 0c0 4.900 7 11 7 11z" /><circle cx="12" cy="10" r="2.500" /></>,
  image: <><rect x="3.500" y="4.500" width="17" height="15" rx="2.500" /><circle cx="9" cy="10" r="1.500" /><path d="m4 17 5-4.500 4 3.500 3-2.500 4 3.500" /></>,
  tag: <path d="M3.500 12.500V4.500h8l9 9-8 8zM8 8.500v.01" />,
  note: <path d="M5 4h14v12l-4 4H5zM15 20v-4h4M8.500 9h7M8.500 13h4" />,
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
