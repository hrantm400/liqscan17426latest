import { PaymentResult } from './types';

const USDT_CONTRACT_TRC20 = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

export async function checkPaymentTrc20(amount: number): Promise<PaymentResult> {
    const trc20Wallet = process.env.WALLET_TRC20 || process.env.TRC20_WALLET_ADDRESS;
    const apiKey = process.env.TRONGRID_API_KEY;

    if (!trc20Wallet) {
        throw new Error('TRC20 wallet address is not configured (WALLET_TRC20 or TRC20_WALLET_ADDRESS)');
    }

    // TRON USDT decimals is 6
    const targetAmountStr = amount.toFixed(2);
    const url = `https://api.trongrid.io/v1/accounts/${trc20Wallet}/transactions/trc20?contract_address=${USDT_CONTRACT_TRC20}&limit=50`;

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    ...(apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {})
                }
            });

            if (!response.ok) {
                throw new Error(`TronGrid API error: ${response.status}`);
            }

            const data = await response.json();
            const transactions = data.data || [];

            // We only want transactions from the last 10 minutes (with a small grace period)
            const tenMinutesAgoMs = Date.now() - (11 * 60 * 1000);

            const match = transactions.find((tx: any) => {
                const txAmount = parseFloat(tx.value) / 1000000;
                const txAmountStr = txAmount.toFixed(2);
                const txTime = new Date(tx.block_timestamp).getTime();
                const isIncoming = tx.to === trc20Wallet;

                return isIncoming && txAmountStr === targetAmountStr && txTime >= tenMinutesAgoMs;
            });

            if (match) {
                return {
                    confirmed: true,
                    tx_hash: match.transaction_id
                };
            }

            return { confirmed: false };

        } catch (error) {
            attempts++;
            console.error(`[TRC20 Scan Error] Attempt ${attempts}/${maxAttempts}:`, error);
            if (attempts >= maxAttempts) {
                return { confirmed: false };
            }
            // Wait 2 seconds before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    return { confirmed: false };
}
