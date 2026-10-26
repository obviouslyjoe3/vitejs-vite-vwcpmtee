import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from './socket.js';
import { toast } from './toast.js';
import { startRing, stopRing, blip } from './ringer.js';
import { showDesktop } from './notify.js';

// One-to-one voice and video calls over WebRTC. The server only relays the handshake (see the
// "calls" section of server/chatServer.js); audio and video go straight between the two browsers.
//
// phase: 'calling' (you dialled, waiting) | 'ringing' (incoming) | 'connecting' | 'active'

const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const VIDEO = { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };

async function getMedia(wantVideo) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error('insecure');
    err.insecure = true;
    throw err;
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: wantVideo ? VIDEO : false });
  } catch (e) {
    if (!wantVideo) throw e;
    // no camera, or camera blocked: carry on with sound only
    const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: false });
    toast('Couldn’t use your camera, so this call is audio only.');
    return stream;
  }
}

const explain = (e) => {
  if (e?.insecure) return 'Calls need a secure (https) connection.';
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return 'Allow microphone access in your browser to make calls.';
  if (e?.name === 'NotFoundError') return 'No microphone found.';
  return 'Couldn’t start the call.';
};

export function useCall({ getPrefs, isSilenced } = {}) {
  const [call, setCall] = useState(null);
  const [remote, setRemote] = useState(null); // MediaStream from the other person
  const [self, setSelf] = useState(null); // MediaStream with your camera (null when it is off)

  const ref = useRef(null); // mirror of `call` for event handlers
  const pcRef = useRef(null);
  const micStream = useRef(null);
  const camTrack = useRef(null);
  const screenTrack = useRef(null);
  const videoTx = useRef(null);
  const queued = useRef([]); // network candidates that arrived before the offer/answer
  const ice = useRef([]);
  const wake = useRef(null);
  const prefsRef = useRef({ getPrefs, isSilenced });
  prefsRef.current = { getPrefs, isSilenced };

  const set = useCallback((next) => {
    ref.current = next;
    setCall(next);
  }, []);
  const patch = useCallback((p) => {
    if (!ref.current) return;
    ref.current = { ...ref.current, ...p };
    setCall(ref.current);
  }, []);

  const cleanup = useCallback(() => {
    stopRing();
    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
    camTrack.current?.stop();
    camTrack.current = null;
    screenTrack.current?.stop();
    screenTrack.current = null;
    videoTx.current = null;
    queued.current = [];
    try {
      wake.current?.release();
    } catch {}
    wake.current = null;
    setRemote(null);
    setSelf(null);
    set(null);
  }, [set]);

  const sendMedia = () => {
    const c = ref.current;
    if (!c?.id || c.phase === 'calling' || c.phase === 'ringing') return;
    const mic = micStream.current?.getAudioTracks()[0];
    socket.emit('call:media', { id: c.id, mic: !!mic?.enabled, cam: !!camTrack.current, screen: !!screenTrack.current });
  };

  const sendSignal = (data) => socket.emit('call:signal', { id: ref.current?.id, data });

  // Build the connection once both sides have said yes
  const buildPeer = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    pcRef.current = pc;
    const incoming = new MediaStream();
    setRemote(incoming);
    pc.ontrack = (e) => {
      if (!incoming.getTracks().includes(e.track)) incoming.addTrack(e.track);
    };
    const mic = micStream.current?.getAudioTracks()[0];
    if (mic) pc.addTrack(mic, micStream.current);
    // A video line is always negotiated, so the camera can be switched on mid-call without a new handshake
    videoTx.current = pc.addTransceiver(camTrack.current || 'video', { direction: 'sendrecv' });
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal({ candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (!ref.current) return;
      if (st === 'connected') {
        stopRing();
        if (ref.current.phase !== 'active') {
          blip('up');
          navigator.wakeLock?.request('screen').then((l) => (wake.current = l)).catch(() => {});
        }
        patch({ phase: 'active', startedAt: ref.current.startedAt || Date.now(), reconnecting: false });
        sendMedia();
      } else if (st === 'disconnected') {
        patch({ reconnecting: true });
      } else if (st === 'failed') {
        toast('The call lost its connection.', 'error');
        hangup();
      }
    };
    return pc;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flushQueued = async (pc) => {
    for (const c of queued.current.splice(0)) {
      try {
        await pc.addIceCandidate(c);
      } catch {}
    }
  };

  const hangup = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    if (c.id) {
      if (c.dir === 'in' && c.phase === 'ringing') socket.emit('call:decline', { id: c.id });
      else socket.emit('call:end', { id: c.id });
    }
    if (c.phase === 'active') blip('down');
    cleanup();
  }, [cleanup]);

  const start = useCallback(
    async (peer, video) => {
      if (ref.current) return toast('You’re already in a call.');
      const token = Math.random();
      set({ id: null, token, peer, video: !!video, dir: 'out', phase: 'calling', mic: true, cam: false, peerMic: true, peerCam: false, peerScreen: false, sharing: false, minimized: false });
      let stream;
      try {
        stream = await getMedia(!!video);
      } catch (e) {
        if (ref.current?.token === token) cleanup();
        return toast(explain(e), 'error');
      }
      if (ref.current?.token !== token) return stream.getTracks().forEach((t) => t.stop()); // cancelled while the browser asked for permission
      micStream.current = stream;
      const v = stream.getVideoTracks()[0];
      if (v) {
        camTrack.current = v;
        setSelf(new MediaStream([v]));
      }
      patch({ cam: !!v });
      socket.emit('call:invite', { to: peer.id, video: !!video }, (res) => {
        if (res?.error || !res?.id) {
          if (ref.current?.token === token) cleanup();
          return toast(res?.error || 'Couldn’t start the call.', 'error');
        }
        if (ref.current?.token !== token) return socket.emit('call:end', { id: res.id }); // hung up before the server answered
        ice.current = res.ice || [];
        patch({ id: res.id });
        startRing('out', getPrefs?.().volume);
      });
    },
    [set, patch, cleanup, getPrefs]
  );

  const accept = useCallback(
    async (withVideo) => {
      const c = ref.current;
      if (!c || c.dir !== 'in' || c.phase !== 'ringing') return;
      const id = c.id;
      stopRing();
      patch({ phase: 'connecting' });
      let stream;
      try {
        stream = await getMedia(!!withVideo && c.video);
      } catch (e) {
        toast(explain(e), 'error');
        socket.emit('call:decline', { id });
        return cleanup();
      }
      if (ref.current?.id !== id) return stream.getTracks().forEach((t) => t.stop()); // ended while the browser asked
      micStream.current = stream;
      const v = stream.getVideoTracks()[0];
      if (v) {
        camTrack.current = v;
        setSelf(new MediaStream([v]));
      }
      patch({ cam: !!v });
      buildPeer();
      socket.emit('call:answer', { id }, (res) => {
        if (res?.error && ref.current?.id === id) {
          toast(res.error);
          cleanup();
        }
      });
    },
    [patch, cleanup, buildPeer]
  );

  const decline = useCallback(() => hangup(), [hangup]);

  const toggleMic = useCallback(() => {
    const t = micStream.current?.getAudioTracks()[0];
    if (!t || !ref.current) return;
    t.enabled = !t.enabled;
    patch({ mic: t.enabled });
    sendMedia();
  }, [patch]);

  const toggleCam = useCallback(async () => {
    if (!ref.current) return;
    if (camTrack.current) {
      camTrack.current.stop();
      camTrack.current = null;
      if (!screenTrack.current) {
        try {
          await videoTx.current?.sender.replaceTrack(null);
        } catch {}
        setSelf(null);
      }
      patch({ cam: false });
    } else {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: VIDEO });
        const t = s.getVideoTracks()[0];
        if (!ref.current) return t.stop();
        camTrack.current = t;
        if (!screenTrack.current) {
          try {
            await videoTx.current?.sender.replaceTrack(t);
          } catch {}
          setSelf(new MediaStream([t]));
        }
        patch({ cam: true });
      } catch (e) {
        toast(e?.name === 'NotAllowedError' ? 'Allow camera access in your browser to turn it on.' : 'Couldn’t turn the camera on.', 'error');
        return;
      }
    }
    sendMedia();
  }, [patch]);

  // Screen sharing replaces what you send on the video line; stopping puts your camera (or nothing) back.
  const stopShare = useCallback(async () => {
    const t = screenTrack.current;
    if (!t) return;
    screenTrack.current = null;
    t.onended = null;
    t.stop();
    if (!ref.current) return;
    try {
      await videoTx.current?.sender.replaceTrack(camTrack.current || null);
    } catch {}
    setSelf(camTrack.current ? new MediaStream([camTrack.current]) : null);
    patch({ sharing: false });
    sendMedia();
  }, [patch]);

  const startShare = useCallback(async () => {
    const c = ref.current;
    if (!c || c.phase !== 'active' || screenTrack.current) return;
    if (!navigator.mediaDevices?.getDisplayMedia) return toast('Your browser can’t share its screen.', 'error');
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
    } catch (e) {
      if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') toast('Couldn’t start screen sharing.', 'error');
      return; // closing the picker is not an error
    }
    const t = stream.getVideoTracks()[0];
    if (!ref.current || !t) return stream.getTracks().forEach((x) => x.stop());
    screenTrack.current = t;
    t.onended = () => stopShare(); // the browser’s own “Stop sharing” button
    try {
      await videoTx.current?.sender.replaceTrack(t);
    } catch {
      t.stop();
      screenTrack.current = null;
      return toast('Couldn’t start screen sharing.', 'error');
    }
    setSelf(new MediaStream([t]));
    patch({ sharing: true });
    sendMedia();
  }, [patch, stopShare]);

  const setMinimized = useCallback((minimized) => patch({ minimized }), [patch]);

  // ---- messages from the server ----
  useEffect(() => {
    const onIncoming = ({ id, video, from, ice: servers }) => {
      if (ref.current) return;
      ice.current = servers || [];
      set({ id, peer: from, video: !!video, dir: 'in', phase: 'ringing', mic: true, cam: false, peerMic: true, peerCam: false, peerScreen: false, sharing: false, minimized: false });
      const silent = prefsRef.current.isSilenced?.();
      if (!silent) {
        startRing('in', prefsRef.current.getPrefs?.().volume);
        if (document.hidden) showDesktop(`${from.name} is calling`, video ? 'Video call' : 'Voice call');
      }
    };

    // the other person said yes: you make the offer
    const onAccepted = async ({ id }) => {
      if (ref.current?.id !== id || ref.current.dir !== 'out') return;
      stopRing();
      patch({ phase: 'connecting' });
      try {
        const pc = buildPeer();
        await pc.setLocalDescription();
        sendSignal({ description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      } catch {
        toast('Couldn’t set up the call.', 'error');
        hangup();
      }
    };

    const onSignal = async ({ id, data }) => {
      const pc = pcRef.current;
      if (!pc || ref.current?.id !== id) return;
      try {
        if (data.description) {
          await pc.setRemoteDescription(data.description);
          await flushQueued(pc);
          if (data.description.type === 'offer') {
            await pc.setLocalDescription();
            sendSignal({ description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
          }
        } else if (data.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
          else queued.current.push(data.candidate);
        }
      } catch {}
    };

    const onMedia = ({ id, mic, cam, screen }) => {
      if (ref.current?.id === id) patch({ peerMic: !!mic, peerCam: !!cam, peerScreen: !!screen });
    };

    const onEnded = ({ id, reason }) => {
      const c = ref.current;
      if (!c || c.id !== id) return;
      if (reason === 'declined') toast(`${c.peer.name} declined the call.`);
      else if (reason === 'missed' && c.dir === 'out') toast(`${c.peer.name} didn’t answer.`);
      else if (reason === 'dropped') toast('The call ended: the connection dropped.');
      if (c.phase === 'active' && reason !== 'elsewhere') blip('down');
      cleanup();
    };

    const onDisconnect = () => {
      if (ref.current) {
        toast('The call ended: you went offline.');
        cleanup();
      }
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:signal', onSignal);
    socket.on('call:media', onMedia);
    socket.on('call:ended', onEnded);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:signal', onSignal);
      socket.off('call:media', onMedia);
      socket.off('call:ended', onEnded);
      socket.off('disconnect', onDisconnect);
    };
  }, [set, patch, cleanup, buildPeer, hangup]);

  // leaving the page ends the call
  useEffect(() => {
    const bye = () => {
      const c = ref.current;
      if (c?.id) socket.emit(c.dir === 'in' && c.phase === 'ringing' ? 'call:decline' : 'call:end', { id: c.id });
    };
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, []);

  return { call, remote, self, start, accept, decline, hangup, toggleMic, toggleCam, startShare, stopShare, setMinimized };
}
