import { Body, Controller, Get, MessageEvent, Param, Patch, Post, Query, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RingService } from './ring.service';
import { RingHub } from './ring.hub';
import { RingActionDto, RingSignalDto, StartRingDto } from './dto/ring.dto';

@ApiTags('Rings')
@Controller('rings')
export class RingController {
  constructor(private rings: RingService, private hub: RingHub) {}

  /** EventSource cannot set an Authorization header, so the JWT travels as a query param. */
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

  @Get('ice-servers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  iceServers() {
    return this.rings.iceServers();
  }

  @Get('active')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  active(@CurrentUser() user: any) {
    return this.rings.active(user);
  }

  @Post(':id/signal')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  signal(@Param('id') id: string, @Body() body: RingSignalDto, @CurrentUser() user: any) {
    return this.rings.signal(user, id, body);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  one(@Param('id') id: string, @CurrentUser() user: any) {
    return this.rings.one(user, id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  start(@Body() body: StartRingDto, @CurrentUser() user: any) {
    return this.rings.start(user, body);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  act(@Param('id') id: string, @Body() body: RingActionDto, @CurrentUser() user: any) {
    return this.rings.act(user, id, body.action);
  }
}
