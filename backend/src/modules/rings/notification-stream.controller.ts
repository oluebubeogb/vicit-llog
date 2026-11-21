import { Controller, MessageEvent, Query, Sse } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { RingService } from './ring.service';
import { NotificationHub } from '../notifications/notification.hub';

/**
 * v31: GET /notifications/stream?token=… — live in-app notifications for the signed-in user
 * (same pattern as /rings/stream). Lives in the ring module to reuse its JWT check.
 */
@ApiTags('Notifications')
@Controller('notifications')
export class NotificationStreamController {
  constructor(private rings: RingService, private hub: NotificationHub) {}

  @Sse('stream')
  stream(@Query('token') token?: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      let closed = false;
      let unsubscribe = () => {};
      let ping: NodeJS.Timeout | null = null;
      this.rings
        .userFromToken(token)
        .then((user) => {
          if (closed) return;
          const send = (data: any) => subscriber.next({ data });
          send({ type: 'hello' });
          unsubscribe = this.hub.subscribe(user.id, send);
          ping = setInterval(() => send({ type: 'ping', t: Date.now() }), 25000);
        })
        .catch((err) => subscriber.error(err));
      return () => {
        closed = true;
        if (ping) clearInterval(ping);
        unsubscribe();
      };
    });
  }
}
