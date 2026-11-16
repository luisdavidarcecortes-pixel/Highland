let channel: MessageChannel | null = null;
const queue: (() => void)[] = [];

/** Yield to input without the one-second nested-timer clamp in background tabs. */
export function schedulePdfWork(work: () => void) {
  if (typeof MessageChannel === 'undefined') { setTimeout(work, 0); return; }
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = () => queue.shift()?.();
  }
  queue.push(work);
  channel.port2.postMessage(null);
}
