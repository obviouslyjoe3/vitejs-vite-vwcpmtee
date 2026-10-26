import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';

const clock = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

// Attach a MediaStream to a <video>. A callback ref, so it also works when the element mounts later
// (for example your own camera appearing after you switch it on, or after un-minimizing).
function useStream(stream) {
  return useCallback(
    (node) => {
      if (!node) return;
      node.srcObject = stream || null;
      if (stream) node.play?.().catch(() => {});
    },
    [stream]
  );
}

export default function CallOverlay({ call, remote, self, onAccept, onDecline, onHangup, onMic, onCam, onShare, onStopShare, onMinimize }) {
  const remoteEl = useStream(remote);
  const selfEl = useStream(self);
  const [, tick] = useState(0);
  const acceptRef = useRef(null);

  // the timer
  const active = call?.phase === 'active';
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  // focus Accept when a call comes in, so Enter answers it
  const ringing = call?.dir === 'in' && call?.phase === 'ringing';
  useEffect(() => {
    if (ringing) acceptRef.current?.focus();
  }, [ringing]);

  // Esc declines while it rings
  useEffect(() => {
    if (!ringing) return undefined;
    const onKey = (e) => e.key === 'Escape' && onDecline();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ringing, onDecline]);

  if (!call) return null;
  const { peer } = call;

  if (ringing) {
    return (
      <div className="call-incoming" role="alertdialog" aria-live="assertive" aria-label={`Incoming call from ${peer.name}`}>
        <Avatar user={peer} size={56} />
        <div className="ci-text">
          <strong>{peer.name}</strong>
          <span>Incoming {call.video ? 'video' : 'voice'} call…</span>
        </div>
        <div className="ci-actions">
          <button className="call-btn decline" onClick={onDecline} aria-label="Decline" title="Decline">
            <Icon name="phone" size={22} />
          </button>
          {call.video && (
            <button className="call-btn audio" onClick={() => onAccept(false)} aria-label="Answer with audio only" title="Answer with audio only">
              <Icon name="phone" size={22} />
            </button>
          )}
          <button ref={acceptRef} className="call-btn accept" onClick={() => onAccept(true)} aria-label={call.video ? 'Answer with video' : 'Answer'} title={call.video ? 'Answer with video' : 'Answer'}>
            <Icon name={call.video ? 'video' : 'phone'} size={22} />
          </button>
        </div>
      </div>
    );
  }

  const status =
    call.phase === 'calling'
      ? 'Calling…'
      : call.phase === 'connecting'
      ? 'Connecting…'
      : call.reconnecting
      ? 'Reconnecting…'
      : clock(Date.now() - (call.startedAt || Date.now()));
  const mini = !!call.minimized;
  const showRemote = (call.peerCam || call.peerScreen) && active;
  // screen sharing works from desktop browsers only
  const canShare = !!navigator.mediaDevices?.getDisplayMedia && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <div className={`call ${mini ? 'mini' : ''}`} role="dialog" aria-label={`Call with ${peer.name}`}>
      {/* one remote <video> for sound and picture, kept mounted so audio never cuts out when minimized */}
      <video ref={remoteEl} className={`call-remote ${showRemote ? 'on' : ''} ${call.peerScreen ? 'screen' : ''}`} autoPlay playsInline />
      {!showRemote && (
        <div className="call-stage">
          <Avatar user={peer} size={mini ? 44 : 120} />
        </div>
      )}

      <div className="call-top">
        <div className="call-who">
          <strong>{peer.name}</strong>
          <span className={call.reconnecting ? 'warn' : ''}>
            {status}
            {call.peerScreen && active && (
              <span className="call-muted">
                <Icon name="screen" size={13} /> Sharing their screen
              </span>
            )}
            {call.peerMic === false && active && (
              <span className="call-muted" title={`${peer.name} is muted`}>
                <Icon name="micOff" size={13} /> Muted
              </span>
            )}
          </span>
        </div>
        <button className="call-btn small ghost" onClick={() => onMinimize(!mini)} aria-label={mini ? 'Expand call' : 'Minimize call'} title={mini ? 'Expand' : 'Keep chatting'}>
          <Icon name={mini ? 'expand' : 'shrink'} size={18} />
        </button>
      </div>

      {(call.cam || call.sharing) && self && !mini && (
        <video ref={selfEl} className={`call-self ${call.sharing ? 'sharing' : ''}`} autoPlay playsInline muted aria-label="Your camera" />
      )}

      <div className="call-controls">
        <button className={`call-btn ${call.mic ? '' : 'off'}`} onClick={onMic} aria-pressed={!call.mic} aria-label={call.mic ? 'Mute microphone' : 'Unmute microphone'} title={call.mic ? 'Mute' : 'Unmute'}>
          <Icon name={call.mic ? 'mic' : 'micOff'} size={22} />
        </button>
        {!mini && (
          <button className={`call-btn ${call.cam ? '' : 'off'}`} onClick={onCam} aria-pressed={!call.cam} aria-label={call.cam ? 'Turn camera off' : 'Turn camera on'} title={call.cam ? 'Camera off' : 'Camera on'}>
            <Icon name={call.cam ? 'video' : 'videoOff'} size={22} />
          </button>
        )}
        {!mini && canShare && active && (
          <button className={`call-btn ${call.sharing ? 'sharing' : ''}`} onClick={call.sharing ? onStopShare : onShare} aria-pressed={!!call.sharing} aria-label={call.sharing ? 'Stop sharing your screen' : 'Share your screen'} title={call.sharing ? 'Stop sharing' : 'Share screen'}>
            <Icon name="screen" size={22} />
          </button>
        )}
        <button className="call-btn decline" onClick={onHangup} aria-label={call.phase === 'calling' ? 'Cancel call' : 'End call'} title={call.phase === 'calling' ? 'Cancel' : 'End call'}>
          <Icon name="phone" size={22} />
        </button>
      </div>
    </div>
  );
}
