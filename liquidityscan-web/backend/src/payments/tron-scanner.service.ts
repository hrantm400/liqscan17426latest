import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "./payments.service";
import { Cron, CronExpression } from "@nestjs/schedule";
import { checkPaymentBep20 } from "../lib/payments/check-payment-bep20";

@Injectable()
export class TronScannerService implements OnModuleInit {
  private readonly logger = new Logger(TronScannerService.name);
  private readonly walletAddress =
    process.env.TRC20_WALLET_ADDRESS || process.env.WALLET_TRC20;
  private readonly bep20Wallet = process.env.WALLET_BEP20;
  private isScanning = false;

  constructor(
    private prisma: PrismaService,
    private paymentsService: PaymentsService,
  ) {}

  onModuleInit() {
    if (!this.walletAddress) {
      this.logger.warn(
        "TRC20 wallet address is not set (TRC20_WALLET_ADDRESS or WALLET_TRC20). Custom TRC20 payment scanning will not work.",
      );
    } else {
      this.logger.log(
        `TronScannerService initialized. Monitoring wallet: ${this.walletAddress}`,
      );
    }

    if (!this.bep20Wallet) {
      this.logger.warn(
        "BEP20 wallet address is not set (WALLET_BEP20). Custom BEP20 payment scanning will not work.",
      );
    } else {
      this.logger.log(`BEP20 scanning enabled. Monitoring wallet: ${this.bep20Wallet}`);
    }
  }

  // Run every 20 seconds
  @Cron("*/20 * * * * *")
  async scanForPayments() {
    if (this.isScanning || (!this.walletAddress && !this.bep20Wallet)) return;
    this.isScanning = true;

    try {
      // 1. Get all pending payments that haven't expired
      const now = new Date();
      // Only get payments from the last 15 minutes to be safe
      const fifteenMinsAgo = new Date(now.getTime() - 15 * 60000);

      const [pendingTrc20, pendingBep20] = await Promise.all([
        this.walletAddress
          ? this.prisma.payment.findMany({
              where: {
                status: "pending",
                paymentMethod: "crypto_trc20",
                createdAt: { gte: fifteenMinsAgo },
              },
            })
          : Promise.resolve([]),
        this.bep20Wallet
          ? this.prisma.payment.findMany({
              where: {
                status: "pending",
                paymentMethod: "crypto_bep20",
                createdAt: { gte: fifteenMinsAgo },
              },
            })
          : Promise.resolve([]),
      ]);

      if (pendingTrc20.length === 0 && pendingBep20.length === 0) {
        this.isScanning = false;
        return;
      }

      // Expire old ones manually just in case
      const allPending = [...pendingTrc20, ...pendingBep20];
      const toExpire = allPending.filter((p) => {
        const meta = p.metadata as any;
        const expiresAt = meta?.expiresAt
          ? new Date(meta.expiresAt)
          : new Date(p.createdAt.getTime() + 10 * 60000);
        return expiresAt < now;
      });

      for (const expired of toExpire) {
        await this.prisma.payment.update({
          where: { id: expired.id },
          data: { status: "failed" }, // or expired string depending on schema
        });
        this.logger.log(`Payment ${expired.id} expired due to timeout.`);
      }

      const activeTrc20 = pendingTrc20.filter((p) => !toExpire.includes(p));
      const activeBep20 = pendingBep20.filter((p) => !toExpire.includes(p));

      // 2. Fetch recent transactions from TronGrid for our wallet
      // TRC20 Contract Address for USDT: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
      const usdtContract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

      const processingPromises: Promise<void>[] = [];

      if (this.walletAddress && activeTrc20.length > 0) {
        const url = `https://api.trongrid.io/v1/accounts/${this.walletAddress}/transactions/trc20?contract_address=${usdtContract}&limit=20`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            // Optional: Add TronGrid API Key if process.env.TRONGRID_API_KEY is available
            ...(process.env.TRONGRID_API_KEY
              ? { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY }
              : {}),
          },
        });

        if (!response.ok) {
          throw new Error(`TronGrid API error: ${response.status}`);
        }

        const data = await response.json();
        const transactions = data.data || [];

        // 3. Match transactions to active payments
        for (const payment of activeTrc20) {
          const pAmountStr = parseFloat(payment.amount.toString()).toFixed(2);

          // Look for a transaction that matches the amount and came AFTER the payment was created
          const match = transactions.find((tx: any) => {
            // Tron amounts are in micro-USDT (6 decimals)
            const txValue = parseFloat(tx.value) / 1000000;
            const txValueStr = txValue.toFixed(2);

            // Must be incoming
            const isIncoming = tx.to === this.walletAddress;

            // Must be after payment creation
            const txTime = new Date(tx.block_timestamp);
            const isAfterCreation =
              txTime >= new Date(payment.createdAt.getTime() - 60000); // 1-minute grace period

            return isIncoming && isAfterCreation && txValueStr === pAmountStr;
          });

          if (match) {
            this.logger.log(
              `Found matching TRC20 transaction for payment ${payment.id}: TxID ${match.transaction_id}`,
            );

            // We found a match! Process the payment
            const promise = (async () => {
              // Important: processSubscriptionPayment expects status === 'pending'.
              // Do not mark payment as completed before processing subscription upgrade.
              await this.paymentsService.processSubscriptionPayment(payment.id);

              // Store TxID + confirmation metadata (idempotent update).
              await this.prisma.payment.update({
                where: { id: payment.id },
                data: {
                  paymentId: match.transaction_id,
                  metadata: {
                    ...((payment.metadata as any) || {}),
                    transactionHash: match.transaction_id,
                    confirmedAt: new Date().toISOString(),
                    network: "TRC20",
                  },
                },
              });
            })();

            processingPromises.push(promise);
          }
        }
      }

      if (activeBep20.length > 0) {
        for (const payment of activeBep20) {
          const payAmount = Number(payment.amount);
          const promise = (async () => {
            const res = await checkPaymentBep20(payAmount);
            if (!res.confirmed) return;

            this.logger.log(
              `Found matching BEP20 transaction for payment ${payment.id}: TxHash ${res.tx_hash}`,
            );

            await this.paymentsService.processSubscriptionPayment(payment.id);

            await this.prisma.payment.update({
              where: { id: payment.id },
              data: {
                paymentId: res.tx_hash,
                metadata: {
                  ...((payment.metadata as any) || {}),
                  transactionHash: res.tx_hash,
                  confirmedAt: new Date().toISOString(),
                  network: "BEP20",
                },
              },
            });
          })();
          processingPromises.push(promise);
        }
      }

      if (processingPromises.length > 0) {
        await Promise.all(processingPromises);
      }
    } catch (error) {
      this.logger.error("Error scanning Tron blockchain for payments", error);
    } finally {
      this.isScanning = false;
    }
  }
}
