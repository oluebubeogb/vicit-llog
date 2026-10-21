import {
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Requires a signed-in ADMIN or GATE user.
 * Any other case (anonymous, staff, bad token) returns a generic 404
 * so probes cannot distinguish existence or authorization.
 */
@Injectable()
export class AdminOrGateSilentGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  handleRequest(err: any, user: any) {
    if (err || !user || (user.role !== 'ADMIN' && user.role !== 'GATE')) {
      throw new NotFoundException('Not found');
    }
    return user;
  }
}
