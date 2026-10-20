import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { organisation: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.organisationId,
      mustChangePassword: user.mustChangePassword,
    };

    return {
      accessToken: this.jwt.sign(payload),
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        portfolio: user.portfolio,
        phone: user.phone,
        mustChangePassword: user.mustChangePassword,
        organisation: {
          id: user.organisation.id,
          name: user.organisation.name,
          code: user.organisation.code,
          logoUrl: user.organisation.logoUrl,
          primaryColor: user.organisation.primaryColor,
        },
      },
    };
  }

  async changeOwnPassword(userId: string, currentPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 5) {
      throw new BadRequestException('New password must be at least 5 characters');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException('New password must be different from the current one');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });

    return { ok: true, message: 'Password updated' };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { organisation: true },
    });
  }
}
