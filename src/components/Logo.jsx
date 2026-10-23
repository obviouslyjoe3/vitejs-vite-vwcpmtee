export default function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size * 0.96} viewBox="0 0 52 50" aria-hidden="true">
      <path
        fill="var(--violet)"
        d="M0 8a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H18l-8 7v-7H6a6 6 0 0 1-6-6z"
      />
      <path
        transform="translate(14 15)"
        fill="var(--mint)"
        stroke="var(--canvas)"
        strokeWidth="2.5"
        d="M0 8a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6h-4v7l-8-7H6a6 6 0 0 1-6-6z"
      />
    </svg>
  );
}
