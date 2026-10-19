import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto, orgId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        fullName: dto.fullName,
        role: dto.role || Role.STAFF,
        portfolio: dto.portfolio,
        organisationId: orgId,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        portfolio: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async findAll(orgId: string) {
    return this.prisma.user.findMany({
      where: { organisationId: orgId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        portfolio: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        portfolio: true,
        isActive: true,
        organisationId: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
