import { Injectable, Logger } from '@nestjs/common';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletSigningService } from './wallet-signing.service';

export interface UserDeposit {
  userId: string;
  userWalletAddress: string;
  depositedSol: number;
  availableSol: number;
  totalTrades: number;
  depositedAt: Date;
  lastTradeAt?: Date;
}

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);
  private userDeposits = new Map<string, UserDeposit>();
  private connection: Connection;

  constructor(private readonly walletSigningService: WalletSigningService) {
    // Use environment RPC URL with fallback to official Solana RPC
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.logger.log(`🔗 Connecting to Solana RPC: ${rpcUrl}`);
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Get bot wallet public key
   */
  getBotWalletAddress(): string | null {
    return this.walletSigningService.getPublicKey();
  }

  /**
   * Create deposit transaction for user to sign
   */
  async createDepositTransaction(request: {
    userWalletAddress: string;
    amountSol: number;
  }): Promise<{
    success: boolean;
    transaction?: string;
    botWalletAddress?: string;
    message: string;
  }> {
    try {
      const botWalletAddress = this.getBotWalletAddress();
      if (!botWalletAddress) {
        return {
          success: false,
          message: 'Bot wallet not available - check WALLET_PRIVATE_KEY'
        };
      }

      if (request.amountSol <= 0) {
        return {
          success: false,
          message: 'Deposit amount must be greater than 0'
        };
      }

      const userPublicKey = new PublicKey(request.userWalletAddress);
      const botPublicKey = new PublicKey(botWalletAddress);
      const lamports = Math.floor(request.amountSol * LAMPORTS_PER_SOL);

      // Create transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: userPublicKey,
          toPubkey: botPublicKey,
          lamports,
        })
      );

      // Get recent blockhash with retry logic
      let blockhash;
      let retries = 3;
      while (retries > 0) {
        try {
          const result = await this.connection.getLatestBlockhash();
          blockhash = result.blockhash;
          break;
        } catch (error) {
          retries--;
          this.logger.warn(`⚠️ Failed to get blockhash, ${retries} retries left: ${error.message}`);
          if (retries === 0) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        }
      }
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userPublicKey;

      // Serialize transaction for client signing
      const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
      const transactionBase64 = serializedTransaction.toString('base64');

      this.logger.log(`📝 Deposit transaction created: ${request.amountSol} SOL from ${request.userWalletAddress} to ${botWalletAddress}`);

      return {
        success: true,
        transaction: transactionBase64,
        botWalletAddress,
        message: `Deposit transaction created for ${request.amountSol} SOL`
      };

    } catch (error) {
      this.logger.error(`❌ Create deposit transaction failed: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Process signed deposit transaction
   */
  async processDeposit(request: {
    userWalletAddress: string;
    signedTransaction: string;
    amountSol: number;
  }): Promise<{
    success: boolean;
    signature?: string;
    depositBalance?: number;
    message: string;
  }> {
    try {
      // Deserialize and send transaction
      const transactionBuffer = Buffer.from(request.signedTransaction, 'base64');
      const signature = await this.connection.sendRawTransaction(transactionBuffer, {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');

      // Update user deposit record
      const userId = request.userWalletAddress; // Using wallet address as user ID for now
      const existingDeposit = this.userDeposits.get(userId);

      if (existingDeposit) {
        existingDeposit.depositedSol += request.amountSol;
        existingDeposit.availableSol += request.amountSol;
      } else {
        this.userDeposits.set(userId, {
          userId,
          userWalletAddress: request.userWalletAddress,
          depositedSol: request.amountSol,
          availableSol: request.amountSol,
          totalTrades: 0,
          depositedAt: new Date()
        });
      }

      const deposit = this.userDeposits.get(userId)!;
      this.logger.log(`✅ Deposit processed: ${request.amountSol} SOL from ${request.userWalletAddress} - Total: ${deposit.availableSol} SOL`);

      return {
        success: true,
        signature,
        depositBalance: deposit.availableSol,
        message: `Deposit of ${request.amountSol} SOL processed successfully`
      };

    } catch (error) {
      this.logger.error(`❌ Process deposit failed: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Get user deposit balance
   */
  getUserBalance(userWalletAddress: string): {
    success: boolean;
    deposit?: UserDeposit;
    message: string;
  } {
    const deposit = this.userDeposits.get(userWalletAddress);
    
    if (!deposit) {
      return {
        success: false,
        message: 'No deposits found for this wallet'
      };
    }

    return {
      success: true,
      deposit,
      message: `Available balance: ${deposit.availableSol} SOL`
    };
  }

  /**
   * Reserve funds for trading (called when bot starts)
   */
  reserveFundsForTrading(userWalletAddress: string, amountSol: number): {
    success: boolean;
    remainingBalance?: number;
    message: string;
  } {
    const deposit = this.userDeposits.get(userWalletAddress);
    
    if (!deposit) {
      return {
        success: false,
        message: 'No deposits found for this wallet'
      };
    }

    if (deposit.availableSol < amountSol) {
      return {
        success: false,
        message: `Insufficient balance. Available: ${deposit.availableSol} SOL, Required: ${amountSol} SOL`
      };
    }

    deposit.availableSol -= amountSol;
    deposit.totalTrades++;
    deposit.lastTradeAt = new Date();

    this.logger.log(`💰 Reserved ${amountSol} SOL for trading - Remaining: ${deposit.availableSol} SOL`);

    return {
      success: true,
      remainingBalance: deposit.availableSol,
      message: `Reserved ${amountSol} SOL for trading`
    };
  }

  /**
   * Return unused funds after trading session
   */
  returnUnusedFunds(userWalletAddress: string, amountSol: number): void {
    const deposit = this.userDeposits.get(userWalletAddress);
    if (deposit) {
      deposit.availableSol += amountSol;
      this.logger.log(`💰 Returned ${amountSol} SOL unused funds - Available: ${deposit.availableSol} SOL`);
    }
  }

  /**
   * Create withdrawal transaction to return funds to user
   */
  async createWithdrawalTransaction(request: {
    userWalletAddress: string;
    amountSol: number;
  }): Promise<{
    success: boolean;
    transaction?: string;
    signature?: string;
    message: string;
  }> {
    try {
      const deposit = this.userDeposits.get(request.userWalletAddress);
      if (!deposit) {
        return {
          success: false,
          message: 'No deposits found for this wallet'
        };
      }

      if (deposit.availableSol < request.amountSol) {
        return {
          success: false,
          message: `Insufficient balance. Available: ${deposit.availableSol} SOL`
        };
      }

      const botWalletAddress = this.getBotWalletAddress();
      if (!botWalletAddress) {
        return {
          success: false,
          message: 'Bot wallet not available'
        };
      }

      const userPublicKey = new PublicKey(request.userWalletAddress);
      const botPublicKey = new PublicKey(botWalletAddress);
      const lamports = Math.floor(request.amountSol * LAMPORTS_PER_SOL);

      // Create transfer transaction (bot wallet sends back to user)
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: botPublicKey,
          toPubkey: userPublicKey,
          lamports,
        })
      );

      // Get recent blockhash with retry logic
      let blockhash;
      let retries = 3;
      while (retries > 0) {
        try {
          const result = await this.connection.getLatestBlockhash();
          blockhash = result.blockhash;
          break;
        } catch (error) {
          retries--;
          this.logger.warn(`⚠️ Failed to get blockhash, ${retries} retries left: ${error.message}`);
          if (retries === 0) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        }
      }
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = botPublicKey;

      // Sign with bot wallet and send
      const signingResult = this.walletSigningService.signTransaction(
        transaction.serialize({ requireAllSignatures: false }).toString('base64')
      );

      if (!signingResult.success || !signingResult.signedTransaction) {
        throw new Error(`Withdrawal signing failed: ${signingResult.error}`);
      }

      // Send transaction
      const signature = await this.connection.sendRawTransaction(
        Buffer.from(signingResult.signedTransaction, 'base64'),
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');

      // Update balance
      deposit.availableSol -= request.amountSol;

      this.logger.log(`✅ Withdrawal processed: ${request.amountSol} SOL to ${request.userWalletAddress} - Signature: ${signature}`);

      return {
        success: true,
        signature,
        message: `Withdrawal of ${request.amountSol} SOL processed successfully`
      };

    } catch (error) {
      this.logger.error(`❌ Withdrawal failed: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Get all user deposits (admin function)
   */
  getAllDeposits(): UserDeposit[] {
    return Array.from(this.userDeposits.values());
  }
}
