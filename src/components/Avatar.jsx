export default function Avatar({ user, size = 40, online }) {
  return (
    <span className="avatar-wrap" style={{ width: size, height: size }}>
      <span
        className="avatar"
        style={{ background: user.color, fontSize: size * 0.44 }}
        aria-hidden="true"
      >
        {user.name.charAt(0).toUpperCase()}
      </span>
      {online !== undefined && (
        <span className={online ? 'presence on' : 'presence'} title={online ? 'Online' : 'Offline'} />
      )}
    </span>
  );
}
