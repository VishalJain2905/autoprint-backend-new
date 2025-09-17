export type SupportedWalletType = 'phantom' | 'solflare' | 'trustwallet' | 'other';

export class ConnectWalletDto {
  publicKey!: string;
  walletType!: SupportedWalletType;
  signature?: string;
  message?: string;
}


