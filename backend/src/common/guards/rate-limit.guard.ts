import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Tiny in-memory fixed-window rate limiter (per user, falling back to IP) — enough to stop
 * accidental hammering of heavy endpoints such as analytics drill-downs and CSV exports
 * without adding a dependency. Single-process; for multi-instance deployments put a proxy
 * limit in front as well.
 *
 *   @UseGuards(JwtAuthGuard, RateLimitGuard) @RateLimit(6, 60)  → 6 requests / 60 s
 */
export const RATE_LIMIT_KEY = 'rate-limit';
export const RateLimit = (limit: number, windowSec: number) => SetMetadata(RATE_LIMIT_KEY, { limit, windowSec });

const hits = new Map<string, { start: number; count: number }>();
let lastSweep = Date.now();

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const cfg = this.reflector.getAllAndOverride<{ limit: number; windowSec: number }>(RATE_LIMIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!cfg) return true;
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const who = req.user?.id || req.ip || 'anon';
    const key = `${ctx.getClass().name}.${ctx.getHandler().name}:${who}`;
    const now = Date.now();
    const win = cfg.windowSec * 1000;

    if (now - lastSweep > 60_000) {
      for (const [k, v] of hits) if (now - v.start > 10 * 60_000) hits.delete(k);
      lastSweep = now;
    }

    const e = hits.get(key);
    if (!e || now - e.start >= win) {
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    e.count++;
    if (e.count > cfg.limit) {
      const retry = Math.ceil((e.start + win - now) / 1000);
      res.setHeader?.('Retry-After', String(retry));
      throw new HttpException(`Too many requests — try again in ${retry}s`, HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
