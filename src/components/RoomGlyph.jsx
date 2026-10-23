import Icon from './Icon.jsx';
import Emoji from '../Emoji.jsx';

// The square badge for a room: its emoji icon, or # (with a lock for private groups).
export default function RoomGlyph({ room, className = '' }) {
  return (
    <span className={`room-glyph ${className}`}>
      {room?.icon ? <Emoji char={room.icon} /> : '#'}
      {room?.private && (
        <span className="glyph-lock" title="Private group">
          <Icon name="lock" size={9} />
        </span>
      )}
    </span>
  );
}
