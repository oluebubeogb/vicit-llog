import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { MailModule } from '../mail/mail.module';
import { AuditModule } from '../audit/audit.module';

@Module({ imports: [MailModule, AuditModule], controllers: [PlatformController], providers: [PlatformService] })
export class PlatformModule {}
