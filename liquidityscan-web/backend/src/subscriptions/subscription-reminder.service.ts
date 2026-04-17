import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { TelegramService } from '../telegram/telegram.service';

function daysLeftCeil(from: Date, to: Date): number {
  const diffMs = to.getTime() - from.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

@Injectable()
export class SubscriptionReminderService {
  private readonly logger = new Logger(SubscriptionReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly telegram: TelegramService,
  ) {}

  @Cron('0 10 * * *')
  async cronSendRenewalReminders() {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const users = await this.prisma.user.findMany({
      where: {
        subscriptionStatus: 'active',
        subscriptionExpiresAt: {
          gt: now,
          lte: in3Days,
        },
      },
      select: {
        id: true,
        email: true,
        telegramId: true,
        subscriptionExpiresAt: true,
      },
    });

    if (users.length === 0) return;

    let emailsSent = 0;
    let telegramSent = 0;

    for (const user of users) {
      if (!user.subscriptionExpiresAt) continue;
      const daysLeft = daysLeftCeil(now, user.subscriptionExpiresAt);
      if (![1, 2, 3].includes(daysLeft)) continue;

      const subject = `Your Liquidity Scan subscription expires in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;
      const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.55; color: #0f172a;">
          <h2 style="margin: 0 0 12px 0;">Subscription renewal reminder</h2>
          <p style="margin: 0 0 10px 0;">
            Your Liquidity Scan PRO subscription expires in <strong>${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}</strong>.
          </p>
          <p style="margin: 0 0 10px 0;">
            Renew now to keep full access to all signals, strategies, and alerts.
          </p>
          <p style="margin: 0 0 14px 0;">
            <a href="https://liquidityscan.io/subscription" style="display: inline-block; padding: 10px 14px; background: #13ec37; color: #000; text-decoration: none; border-radius: 10px; font-weight: 700;">
              Renew subscription ($49/month)
            </a>
          </p>
          <p style="margin: 0; font-size: 12px; color: #64748b;">
            If you don't renew, your account will be downgraded to the Free tier when the subscription expires.
          </p>
        </div>
      `;

      if (user.email) {
        try {
          await this.mail.sendMail({ to: user.email, subject, html });
          emailsSent++;
        } catch (e: any) {
          this.logger.error(`Failed to send renewal email to user ${user.id}: ${e.message}`, e.stack);
        }
      }

      if (user.telegramId) {
        await this.telegram.sendSubscriptionReminder(user.telegramId, daysLeft);
        telegramSent++;
      }
    }

    this.logger.log(`Renewal reminders sent: email=${emailsSent}, telegram=${telegramSent}`);
  }
}

