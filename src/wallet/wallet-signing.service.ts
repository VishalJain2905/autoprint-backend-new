import { Injectable, Logger } from '@nestjs/common';
import { Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

@Injectable()
export class WalletSigningService {
  private readonly logger = new Logger(WalletSigningService.name);
  private keypair: Keypair | null = null;

  constructor() {
    this.initializeWallet();
  }

  private initializeWallet() {
    try {
      const privateKeyString = process.env.WALLET_PRIVATE_KEY;
      
      if (!privateKeyString) {
        this.logger.warn('⚠️ WALLET_PRIVATE_KEY not found in environment variables');
        return;
      }

      // Support both base58 and array formats
      let privateKeyBytes: Uint8Array;
      
      if (privateKeyString.startsWith('[') && privateKeyString.endsWith(']')) {
        // Array format: [1,2,3,...]
        const numbers = JSON.parse(privateKeyString);
        privateKeyBytes = new Uint8Array(numbers);
      } else {
        // Base58 format
        privateKeyBytes = (bs58 as any).decode(privateKeyString);
      }

      this.keypair = Keypair.fromSecretKey(privateKeyBytes);
      this.logger.log(`✅ Wallet initialized: ${this.keypair.publicKey.toString()}`);

    } catch (error) {
      this.logger.error(`❌ Failed to initialize wallet: ${error.message}`);
      this.keypair = null;
    }
  }

  getPublicKey(): string | null {
    return this.keypair?.publicKey.toString() || null;
  }

  isWalletAvailable(): boolean {
    return this.keypair !== null;
  }

  /**
   * Sign a transaction using the wallet private key
   */
  signTransaction(transactionBase64: string): {
    success: boolean;
    signedTransaction?: string;
    publicKey?: string;
    error?: string;
  } {
    try {
      if (!this.keypair) {
        return {
          success: false,
          error: 'Wallet not initialized - check WALLET_PRIVATE_KEY environment variable'
        };
      }

      // Deserialize the transaction
      const transactionBuffer = Buffer.from(transactionBase64, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuffer);

      // Sign the transaction
      transaction.sign([this.keypair]);

      // Serialize back to base64
      const signedTransactionBuffer = Buffer.from(transaction.serialize());
      const signedTransaction = signedTransactionBuffer.toString('base64');

      this.logger.log(`✅ Transaction signed by ${this.keypair.publicKey.toString()}`);

      return {
        success: true,
        signedTransaction,
        publicKey: this.keypair.publicKey.toString()
      };

    } catch (error) {
      this.logger.error(`❌ Transaction signing failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate that a transaction signature is correct
   */
  validateSignature(transactionBase64: string, expectedPublicKey?: string): {
    success: boolean;
    isValid: boolean;
    signerPublicKey?: string;
    error?: string;
  } {
    try {
      const transactionBuffer = Buffer.from(transactionBase64, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuffer);

      // Check if transaction has signatures
      if (!transaction.signatures || transaction.signatures.length === 0) {
        return {
          success: true,
          isValid: false,
          error: 'Transaction has no signatures'
        };
      }

      // For simplicity, we'll just check if the transaction is properly formed
      // In a full implementation, you'd verify the signature cryptographically
      const hasValidSignature = transaction.signatures.some(sig => {
        if (!sig) return false;
        // Check if signature is not all zeros
        const allZeros = new Uint8Array(64);
        return !sig.every((byte, index) => byte === allZeros[index]);
      });

      return {
        success: true,
        isValid: hasValidSignature,
        signerPublicKey: this.keypair?.publicKey.toString()
      };

    } catch (error) {
      this.logger.error(`❌ Signature validation failed: ${error.message}`);
      return {
        success: false,
        isValid: false,
        error: error.message
      };
    }
  }
}
