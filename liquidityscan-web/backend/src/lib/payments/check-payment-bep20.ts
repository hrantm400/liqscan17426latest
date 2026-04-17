import { PaymentResult } from './types';

const USDT_CONTRACT_BEP20 = '0x55d398326f99059fF775485246999027B3197955';
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export async function checkPaymentBep20(amount: number): Promise<PaymentResult> {
    const bep20Wallet = process.env.WALLET_BEP20;
    const apiKey = process.env.NODEREAL_API_KEY;

    if (!bep20Wallet) {
        throw new Error('WALLET_BEP20 is not configured');
    }

    if (!apiKey) {
        throw new Error('NODEREAL_API_KEY is not configured');
    }

    const endpoint = `https://bsc-mainnet.nodereal.io/v1/${apiKey}`;

    // target amount considering 18 decimals
    const targetAmountBigInt = BigInt(Math.round(amount * 100)) * BigInt(10 ** 16);
    const targetHexAmount = '0x' + targetAmountBigInt.toString(16);

    // Address padded to 32 bytes for Topic2
    // slice(2) to remove '0x', pad to 64 chars (32 bytes)
    const paddedAddress = '0x' + bep20Wallet.toLowerCase().replace('0x', '').padStart(64, '0');

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            // Step 1: Get current block number to narrow down logs search
            const blockRes = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_blockNumber',
                    params: [],
                    id: 1,
                }),
            });

            if (!blockRes.ok) {
                throw new Error(`NodeReal blockNumber error: ${blockRes.status}`);
            }

            const blockData = await blockRes.json();
            const currentBlock = parseInt(blockData.result, 16);

            // Roughly 10 minutes of BSC blocks (approx 3 seconds per block = 200 blocks)
            const fromBlock = '0x' + (currentBlock - 200).toString(16);
            const toBlock = 'latest';

            // Step 2: Query Logs
            const logsRes = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_getLogs',
                    params: [{
                        fromBlock,
                        toBlock,
                        address: USDT_CONTRACT_BEP20,
                        topics: [
                            TRANSFER_EVENT_TOPIC,
                            null,          // Topic 1: from (any)
                            paddedAddress  // Topic 2: to (our wallet)
                        ]
                    }],
                    id: 2,
                }),
            });

            if (!logsRes.ok) {
                throw new Error(`NodeReal getLogs error: ${logsRes.status}`);
            }

            const logsData = await logsRes.json();
            const logs = logsData.result || [];

            // Match amount
            const match = logs.find((log: any) => {
                // The data field contains the amount in hex
                return BigInt(log.data) === targetAmountBigInt;
            });

            if (match) {
                return {
                    confirmed: true,
                    tx_hash: match.transactionHash
                };
            }

            return { confirmed: false };

        } catch (error) {
            attempts++;
            console.error(`[BEP20 Scan Error] Attempt ${attempts}/${maxAttempts}:`, error);
            if (attempts >= maxAttempts) {
                return { confirmed: false };
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    return { confirmed: false };
}
