export type SupportedWalletType = 'phantom' | 'solflare' | 'trustwallet' | 'other';

export interface WalletSessionSchema {
  id: string;
  publicKey: string;
  walletType: SupportedWalletType;
  connected: boolean;
  balance: number;
  connectedAt: string;
  lastActiveAt?: string;
  permissions?: string[];
}
