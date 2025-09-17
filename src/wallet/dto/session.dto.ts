import type { SupportedWalletType } from './connect-wallet.dto';

export interface WalletSession {
  id: string;
  publicKey: string;
  walletType: SupportedWalletType;
  connected: boolean;
  balance: number;
  connectedAt: string;
  lastActiveAt?: string;
  permissions?: string[];
}


