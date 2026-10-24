// Two flags facing each other: a conversation between two sides (a parley).
export default function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="var(--logo-a, var(--accent))" d="M3 5h31l-7 8.5 7 8.5H3z" />
      <path fill="var(--logo-b, #ff5a36)" d="M45 26H14l7 8.5-7 8.5h31z" />
    </svg>
  );
}
