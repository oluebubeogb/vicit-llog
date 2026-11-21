import { Injectable } from '@nestjs/common';

type Listener = (event: any) => void;

/**
 * v31: in-memory fan-out of new notifications to open browser tabs (Server-Sent Events), so the
 * bell, toast and chime fire within about a second. Web push stays as the backup for closed apps.
 * One API instance: listeners live in this process (same model as the call RingHub).
 */
@Injectable()
export class NotificationHub {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(userId: string, listener: Listener) {
    const set = this.listeners.get(userId) || new Set<Listener>();
    set.add(listener);
    this.listeners.set(userId, set);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(userId);
    };
  }

  isOnline(userId: string) {
    return (this.listeners.get(userId)?.size || 0) > 0;
  }

  publish(userId: string, event: any) {
    for (const listener of this.listeners.get(userId) || []) {
      try {
        listener(event);
      } catch {
        /* a closed tab must not break the others */
      }
    }
  }
}
