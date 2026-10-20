import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { InvitesModule } from './modules/invites/invites.module';
import { VisitorsModule } from './modules/visitors/visitors.module';
import { GateModule } from './modules/gate/gate.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { BlacklistModule } from './modules/blacklist/blacklist.module';
import { LocationsModule } from './modules/locations/locations.module';
import { ReportsModule } from './modules/reports/reports.module';
import { BrandingModule } from './modules/branding/branding.module';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { MailModule } from './modules/mail/mail.module';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    AuthModule,
    UsersModule,
    InvitesModule,
    VisitorsModule,
    GateModule,
    NotificationsModule,
    AuditModule,
    // Phase 2
    AnalyticsModule,
    BlacklistModule,
    LocationsModule,
    ReportsModule,
    BrandingModule,
    HealthModule,
  ],
})
export class AppModule {}
