import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) { }

  private isAdminEmail(email: string): boolean {
    const adminEmails = this.configService.get<string>('ADMIN_EMAILS', '');
    if (!adminEmails) return false;

    const emailList = adminEmails.split(',').map(e => e.trim().toLowerCase());
    return emailList.includes(email.toLowerCase());
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        isAdmin: true,
        email: true,
      },
    });

    if (!dbUser) {
      throw new ForbiddenException('User not found');
    }

    // Check both: isAdmin flag in DB and email in ADMIN_EMAILS list
    const isEmailInAdminList = this.isAdminEmail(dbUser.email);
    if (!dbUser.isAdmin || !isEmailInAdminList) {
      this.logger.warn(`Access denied for user ${dbUser.email}: isAdmin=${dbUser.isAdmin}, isEmailInAdminList=${isEmailInAdminList}`);
      throw new ForbiddenException(`Admin access required. Your email (${dbUser.email}) must be in ADMIN_EMAILS list and isAdmin must be true.`);
    }

    return true;
  }
}
