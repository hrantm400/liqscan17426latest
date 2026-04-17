import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private prisma: PrismaService) {
    try {
      const nm = nodemailer?.createTransport ?? (nodemailer as any)?.default?.createTransport;
      if (typeof nm === 'function') {
        this.transporter = nm({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 465),
          secure: Number(process.env.SMTP_PORT || 465) === 465,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
      } else {
        this.logger.warn('nodemailer.createTransport is not available — email sending disabled');
      }
    } catch (err) {
      this.logger.error(`Failed to initialize mail transporter: ${err instanceof Error ? err.message : err}`);
    }
  }

  async sendMail(args: { to: string; subject: string; html: string }) {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    if (!from) throw new Error('SMTP_FROM/SMTP_USER not configured');
    if (!this.transporter) throw new Error('Mail transporter not initialized');

    try {
      await this.transporter.sendMail({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
      });

      await this.prisma.emailLog.create({
        data: {
          to: args.to,
          subject: args.subject,
          status: 'sent',
        },
      });
    } catch (error: any) {
      await this.prisma.emailLog.create({
        data: {
          to: args.to,
          subject: args.subject,
          status: 'failed',
          error: String(error?.message || error),
        },
      });
      throw error;
    }
  }
}

