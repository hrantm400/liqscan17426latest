export type PlanType = 'first_month' | 'full';

export type Network = 'TRC20' | 'BEP20';

export interface PaymentSession {
    user_id: string;
    amount: number;
    plan_type: PlanType;
    network: Network;
    started_at: number; // Unix timestamp for easy timeout checking
}

export interface PaymentResult {
    confirmed: boolean;
    tx_hash?: string;
}
