import { useEffect, useState } from 'react';
import { api, onSignal } from '../../data/client.ts';

/**
 * Live window sharing on a canvas. The person sharing sends the picture straight to each viewer's
 * browser; the server only passes the short messages that set those connections up. Nothing of the
 * shared window is stored.
 */
const local = new Map<string, MediaStream>();
const remote = new Map<string, MediaStream>();
const peers = new Map<string, RTCPeerConnection>();
const watchers = new Set<() => void>();
const changed = () => watchers.forEach((w) => w());
const send = (to: string, data: Record<string, unknown>) =>
  void api('/signal', { body: { to, data } }).catch(() => undefined);

function connection(key: string, to: string, piece: string) {
  peers.get(key)?.close();
  const pc = new RTCPeerConnection();
  peers.set(key, pc);
  pc.onicecandidate = (e) =>
    e.candidate && send(to, { type: 'ice', piece, candidate: e.candidate.toJSON() });
  return pc;
}

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  onSignal(async ({ from, data }) => {
    const piece = String(data.piece ?? '');
    try {
      if (data.type === 'want' && local.has(piece)) {
        // A viewer asked for the window: offer it to them.
        const pc = connection(`${piece}:${from}`, from, piece);
        for (const track of local.get(piece)!.getTracks()) pc.addTrack(track, local.get(piece)!);
        await pc.setLocalDescription(await pc.createOffer());
        send(from, { type: 'offer', piece, sdp: pc.localDescription });
      } else if (data.type === 'offer') {
        const pc = connection(`${piece}:${from}`, from, piece);
        pc.ontrack = (e) => {
          remote.set(piece, e.streams[0]);
          changed();
        };
        await pc.setRemoteDescription(data.sdp as RTCSessionDescriptionInit);
        await pc.setLocalDescription(await pc.createAnswer());
        send(from, { type: 'answer', piece, sdp: pc.localDescription });
      } else if (data.type === 'answer') {
        await peers
          .get(`${piece}:${from}`)
          ?.setRemoteDescription(data.sdp as RTCSessionDescriptionInit);
      } else if (data.type === 'ice') {
        await peers.get(`${piece}:${from}`)?.addIceCandidate(data.candidate as RTCIceCandidateInit);
      } else if (data.type === 'stopped') {
        remote.delete(piece);
        changed();
      }
    } catch {
      // A connection that fails to set up simply shows as not connected.
    }
  });
}

export const canShare = () => !!navigator.mediaDevices?.getDisplayMedia;

/** Asks the browser which window to share. Resolves to nothing if the person cancels. */
export async function pickWindow() {
  try {
    return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch {
    return null;
  }
}

export function startSharing(piece: string, stream: MediaStream, onEnded: () => void) {
  listen();
  local.set(piece, stream);
  stream.getVideoTracks()[0]?.addEventListener('ended', onEnded);
  changed();
}

export function stopSharing(piece: string, viewers: string[]) {
  local
    .get(piece)
    ?.getTracks()
    .forEach((t) => t.stop());
  local.delete(piece);
  for (const [key, pc] of peers) if (key.startsWith(`${piece}:`)) (pc.close(), peers.delete(key));
  for (const to of viewers) send(to, { type: 'stopped', piece });
  changed();
}

/** The live picture for a shared window: your own if you are sharing it, else the sharer's. */
export function useShared(piece: string, sharerId: string, mine: boolean) {
  const [, tick] = useState(0);
  useEffect(() => {
    listen();
    const watch = () => tick((n) => n + 1);
    watchers.add(watch);
    let timer: ReturnType<typeof setInterval> | undefined;
    if (!mine) {
      // Keep asking until the sharer answers; they may have only just opened the canvas.
      const ask = () => !remote.has(piece) && send(sharerId, { type: 'want', piece });
      ask();
      timer = setInterval(ask, 4000);
    }
    return () => {
      watchers.delete(watch);
      clearInterval(timer);
    };
  }, [piece, sharerId, mine]);
  return (mine ? local.get(piece) : remote.get(piece)) ?? null;
}
