import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { InvitesModule } from './modules/invites/invites.module';
import { VisitorsModule } from './modules/visitors/visitors.module';
import { GateModule } from './modules/gate/gate.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { PrismaModule } from './common/prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    InvitesModule,
    VisitorsModule,
    GateModule,
    NotificationsModule,
    AuditModule,
  ],
})
export class AppModule {}
