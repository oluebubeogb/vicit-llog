import { Injectable } from '@nestjs/common';

type Listener = (event: any) => void;

/** In-memory fan-out for open browser tabs. One user can have several listeners. */
@Injectable()
export class RingHub {
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

  publish(userId: string, event: any) {
    for (const listener of this.listeners.get(userId) || []) {
      try {
        listener(event);
      } catch {
        /* a closed tab should not break the others */
      }
    }
  }
}
