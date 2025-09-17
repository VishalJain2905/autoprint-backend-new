import { Injectable, Logger } from '@nestjs/common';
import { SignalsService } from '../signals/signals.service';
import { TradingService } from '../trading/trading.service';
import { JupiterService } from '../jupiter/jupiter.service';
import { DepositService } from '../wallet/deposit.service';

interface BotSession {
  sessionId: string;
  walletPublicKey: string;
  allocatedSol: number;
  remainingSol: number;
  tradesExecuted: number;
  maxTrades: number;
  status: 'PENDING_DEPOSIT' | 'RUNNING' | 'STOPPED' | 'COMPLETED' | 'FAILED';
  startedAt: Date;
  positions: Position[];
}

interface Position {
  id: string;
  token: string;
  action: 'BUY' | 'SELL';
  entryPrice: number;
  amount: number;
  solSpent: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  status: 'OPEN' | 'CLOSED';
  createdAt: Date;
  autoExitTime: Date; // Auto-exit after 3 minutes
}

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private activeSessions = new Map<string, BotSession>();
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly signalsService: SignalsService,
    private readonly tradingService: TradingService,
    private readonly jupiterService: JupiterService,
    private readonly depositService: DepositService
  ) {
    // Start live monitoring
    this.startLiveMonitoring();
  }

  /**
   * Test network connectivity to Jupiter APIs
   */
  async testConnectivity(): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log('🔍 Testing network connectivity...');
      
      // Test Jupiter service connectivity
      const jupiterTest = await this.jupiterService.testConnectivity();
      if (!jupiterTest.success) {
        return jupiterTest;
      }
      
      // Test signals service connectivity
      try {
        const signals = await this.signalsService.refreshThenGetSignals();
        if (!signals || !signals.data) {
          return {
            success: false,
            message: 'Signals API returned invalid response'
          };
        }
        this.logger.log(`✅ Signals API test successful - ${signals.data.length} signals available`);
      } catch (error) {
        return {
          success: false,
          message: `Signals API connectivity issue: ${error.message}`
        };
      }
      
      this.logger.log('✅ All network connectivity tests passed');
      return {
        success: true,
        message: 'All APIs are accessible and working properly'
      };
    } catch (error) {
      this.logger.error(`❌ Connectivity test failed: ${error.message}`);
      return {
        success: false,
        message: `Connectivity test failed: ${error.message}`
      };
    }
  }

  /**
   * Launch bot: Auto-deposit allocated SOL from user wallet to bot wallet AND start trading
   */
  async launchBot(walletPublicKey: string, allocatedSol: number): Promise<any> {
    try {
      this.logger.log(`🚀 Launching bot: ${allocatedSol} SOL will be deposited from ${walletPublicKey} and trading will start`);

      // Step 1: Create deposit transaction for user to sign
      const depositResult = await this.depositService.createDepositTransaction({
        userWalletAddress: walletPublicKey,
        amountSol: allocatedSol
      });

      if (!depositResult.success || !depositResult.transaction) {
        return {
          success: false,
          message: `Failed to create deposit transaction: ${depositResult.message}`,
          step: 'deposit_creation_failed'
        };
      }

      // Step 2: Return transaction for user to sign, along with session info
      const sessionId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      
      // Create pending session (will be activated after deposit confirmation)
      const session: BotSession = {
        sessionId,
        walletPublicKey,
        allocatedSol,
        remainingSol: allocatedSol,
        tradesExecuted: 0,
        maxTrades: 5,
        status: 'PENDING_DEPOSIT', // New status
        startedAt: new Date(),
        positions: []
      };

      this.activeSessions.set(sessionId, session);

      return {
        success: true,
        sessionId,
        depositTransaction: depositResult.transaction,
        botWalletAddress: depositResult.botWalletAddress,
        message: `Step 1: Sign the deposit transaction to transfer ${allocatedSol} SOL to bot wallet. Trading will start automatically after confirmation.`,
        nextStep: 'sign_and_confirm_deposit',
        session: {
          sessionId,
          allocatedSol,
          maxTrades: 5,
          status: 'PENDING_DEPOSIT'
        }
      };

    } catch (error) {
      this.logger.error(`❌ Bot launch failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
        step: 'launch_failed'
      };
    }
  }

  /**
   * Confirm deposit and start trading (called after user signs deposit transaction)
   */
  async confirmDepositAndStartTrading(request: {
    sessionId: string;
    signedDepositTransaction: string;
    userWalletAddress: string;
    allocatedSol: number;
  }): Promise<any> {
    try {
      const session = this.activeSessions.get(request.sessionId);
      if (!session) {
        return {
          success: false,
          message: 'Session not found'
        };
      }

      if (session.status !== 'PENDING_DEPOSIT') {
        return {
          success: false,
          message: `Session is in ${session.status} status, expected PENDING_DEPOSIT`
        };
      }

      this.logger.log(`💰 Processing deposit for session ${request.sessionId}`);

      // Step 1: Process the deposit transaction
      const depositResult = await this.depositService.processDeposit({
        userWalletAddress: request.userWalletAddress,
        signedTransaction: request.signedDepositTransaction,
        amountSol: request.allocatedSol
      });

      if (!depositResult.success) {
        session.status = 'FAILED';
        return {
          success: false,
          message: `Deposit failed: ${depositResult.message}`,
          step: 'deposit_failed'
        };
      }

      // Step 2: Reserve funds for trading
      const reserveResult = this.depositService.reserveFundsForTrading(
        request.userWalletAddress, 
        request.allocatedSol
      );

      if (!reserveResult.success) {
        session.status = 'FAILED';
        return {
          success: false,
          message: `Fund reservation failed: ${reserveResult.message}`,
          step: 'reservation_failed'
        };
      }

      // Step 3: Start trading
      session.status = 'RUNNING';
      this.logger.log(`🚀 Deposit confirmed! Starting trading for session ${request.sessionId}`);

      // Start trading immediately
      this.startTradingForSession(request.sessionId);

      return {
        success: true,
        sessionId: request.sessionId,
        depositSignature: depositResult.signature,
        message: `✅ Deposit confirmed! Bot is now trading with ${request.allocatedSol} SOL`,
        session: {
          sessionId: request.sessionId,
          allocatedSol: request.allocatedSol,
          maxTrades: 5,
          status: 'RUNNING',
          depositBalance: depositResult.depositBalance
        }
      };

    } catch (error) {
      this.logger.error(`❌ Confirm deposit failed: ${error.message}`);
      const session = this.activeSessions.get(request.sessionId);
      if (session) session.status = 'FAILED';
      
      return {
        success: false,
        message: error.message,
        step: 'confirmation_failed'
      };
    }
  }

  /**
   * Stop bot session and return unused funds
   */
  async stopBot(sessionId: string): Promise<any> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return { success: false, message: 'Session not found' };
    }

    session.status = 'STOPPED';

    // Return unused funds to user's deposit balance
    if (session.remainingSol > 0) {
      this.depositService.returnUnusedFunds(session.walletPublicKey, session.remainingSol);
    }

    this.logger.log(`🛑 Bot stopped - Session: ${sessionId} - Returned ${session.remainingSol} SOL unused funds`);

    return {
      success: true,
      message: `Bot stopped. Returned ${session.remainingSol} SOL unused funds to your deposit balance.`,
      session: {
        sessionId,
        status: session.status,
        tradesExecuted: session.tradesExecuted,
        remainingSol: session.remainingSol,
        fundsReturned: session.remainingSol > 0
      }
    };
  }

  /**
   * Get bot session status
   */
  getBotStatus(sessionId: string): any {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return { success: false, message: 'Session not found' };
    }

    return {
      success: true,
      session: {
        sessionId,
        walletPublicKey: session.walletPublicKey,
        allocatedSol: session.allocatedSol,
        remainingSol: session.remainingSol,
        tradesExecuted: session.tradesExecuted,
        maxTrades: session.maxTrades,
        status: session.status,
        startedAt: session.startedAt,
        openPositions: session.positions.filter(p => p.status === 'OPEN').length
      }
    };
  }

  /**
   * Start continuous trading for a session
   */
  private async startTradingForSession(sessionId: string) {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'RUNNING') return;

    try {
      // Check if we can still trade
      if (session.tradesExecuted >= session.maxTrades) {
        session.status = 'COMPLETED';
        this.logger.log(`✅ Session completed - max trades reached: ${sessionId}`);
        this.logger.log(`💰 Final remaining funds: ${session.remainingSol} SOL`);
        this.logger.log(`📊 Session summary: ${session.tradesExecuted}/${session.maxTrades} trades executed`);
        
        // Return unused funds
        if (session.remainingSol > 0) {
          await this.depositService.returnUnusedFunds(session.walletPublicKey, session.remainingSol);
          this.logger.log(`💸 Returned ${session.remainingSol} SOL to user deposit balance`);
        }
        return;
      }

      if (session.remainingSol < 0.01) { // Minimum 0.01 SOL per trade
        session.status = 'COMPLETED';
        this.logger.log(`✅ Session completed - insufficient SOL: ${sessionId}`);
        return;
      }

      // Analyze signals and execute trade
      const result = await this.analyzeAndTradeForSession(sessionId);
      if (result.executed) {
        session.tradesExecuted++;
        this.logger.log(`📈 Trade ${session.tradesExecuted}/${session.maxTrades} executed for session ${sessionId}`);
        this.logger.log(`💰 Remaining funds after trade: ${session.remainingSol} SOL`);
      }

      // Schedule next entry signal check (every 2 minutes if no open positions)
      if (session.status === 'RUNNING' && session.tradesExecuted < session.maxTrades) {
        const hasOpenPositions = session.positions.some(p => p.status === 'OPEN');
        if (!hasOpenPositions) {
          // Check for entry signals every 2 minutes when no open positions
          setTimeout(() => this.startTradingForSession(sessionId), 2 * 60 * 1000);
        } else {
          // If we have open positions, wait longer before checking for new entries
          setTimeout(() => this.startTradingForSession(sessionId), 10 * 60 * 1000);
        }
      }

    } catch (error) {
      this.logger.error(`❌ Trading error for session ${sessionId}: ${error.message}`);
      // Retry after 2 minutes on error
      setTimeout(() => this.startTradingForSession(sessionId), 2 * 60 * 1000);
    }
  }

  /**
   * Analyze signals and execute trade for specific session
   */
  private async analyzeAndTradeForSession(sessionId: string): Promise<any> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return { success: false, executed: false, message: 'Session not found' };

    const signals = await this.signalsService.refreshThenGetSignals();
    if (!signals?.success || !Array.isArray(signals.data) || signals.data.length === 0) {
      return { success: false, executed: false, message: 'No signals available' };
    }

    // Score signals: prefer higher urgency, higher confidence, BUY over SELL if tie, skip HOLD
    type SignalItem = {
      latest_signal: {
        token: string;
        action: number; // 1 buy, -1 sell, 0 hold
        confidence: number;
        urgency?: number;
        weighted_signal?: number;
        price?: number;
        explanation?: string;
      }
    };

    // Get supported tokens from Jupiter service
    const supportedTokens = this.jupiterService.getDefaultTokenMap();
    
    const candidates = (signals.data as SignalItem[])
      .filter(s => s.latest_signal && s.latest_signal.action !== 0)
      .filter(s => {
        const token = s.latest_signal.token.toUpperCase();
        const isSupported = supportedTokens[token] !== undefined;
        if (!isSupported) {
          this.logger.warn(`⚠️ Skipping unsupported token: ${token}`);
        }
        return isSupported;
      });

    if (candidates.length === 0) {
      return { success: true, executed: false, message: 'No supported tokens with tradeable signals' };
    }

    const scored = candidates.map(item => {
      const sig = item.latest_signal;
      const urgency = sig.urgency ?? 0;
      const confidence = sig.confidence ?? 0;
      const bias = sig.action === 1 ? 0.01 : 0; // slight preference to buys
      const weighted = (urgency * 0.5) + (confidence * 0.5) + bias;
      return { item, score: weighted };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].item.latest_signal;

    // Since bot starts with SOL, we always BUY tokens regardless of signal direction
    // Signal action 1 (BUY) = strong buy signal -> BUY token
    // Signal action -1 (SELL) = bearish signal -> still BUY token (for shorting or contrarian play)
    const action = 'BUY' as const;
    const reason = best.explanation || 'Signal-driven trade';

    // Calculate trade size (90% of remaining balance)
    const maxTradeSize = session.remainingSol * 0.9; // 90% of remaining balance

    const result = await this.tradingService.executeTradeForSession({
      sessionId,
      token: best.token,
      action,
      confidence: best.confidence ?? 0,
      price: best.price,
      reason,
      tradeSizeSol: maxTradeSize
    });

    if (result.executed && result.position) {
      // Add position to session
      session.positions.push(result.position);
      session.remainingSol -= result.position.solSpent;
    }

    return result;
  }

  /**
   * Start live monitoring for exit trades
   */
  private startLiveMonitoring() {
    if (this.monitoringInterval) return;

    // Monitor exit conditions every 15 minutes
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkExitConditions();
      } catch (error) {
        this.logger.error(`❌ Exit monitoring error: ${error.message}`);
      }
    }, 15 * 1000); // Check every 15 seconds

    this.logger.log('📊 Live monitoring started');
  }

  /**
   * Check exit conditions for all open positions
   */
  private async checkExitConditions() {
    const allPositions = Array.from(this.activeSessions.values())
      .flatMap(session => session.positions.filter(p => p.status === 'OPEN'));

    if (allPositions.length === 0) return;

    // Get current prices for all tokens
    const tokens = [...new Set(allPositions.map(p => p.token))];
    const prices = await this.jupiterService.fetchPricesBySymbols(tokens);

    for (const position of allPositions) {
      const tokenMint = this.jupiterService.getDefaultTokenMap()[position.token];
      const currentPrice = prices[tokenMint]?.usdPrice;

      if (!currentPrice) continue;

      // Show countdown to auto-exit
      const now = new Date();
      const timeLeft = Math.max(0, position.autoExitTime.getTime() - now.getTime());
      const minutesLeft = Math.floor(timeLeft / 60000);
      const secondsLeft = Math.floor((timeLeft % 60000) / 1000);
      
      const changePercent = ((currentPrice - position.entryPrice) / position.entryPrice * 100).toFixed(2);
      this.logger.log(`📊 ${position.token}: $${currentPrice.toFixed(6)} (${changePercent}%) | TP: $${position.takeProfitPrice.toFixed(6)} | SL: $${position.stopLossPrice.toFixed(6)} | Auto-exit: ${minutesLeft}m ${secondsLeft}s`);

      const shouldExit = this.shouldExitPosition(position, currentPrice);
      if (shouldExit.exit) {
        await this.executeExitTrade(position, shouldExit.reason);
      }
    }
  }

  /**
   * Check if position should be exited (3% TP, 5% SL, or 3-minute timeout)
   */
  private shouldExitPosition(position: Position, currentPrice: number): { exit: boolean; reason: string } {
    // Check take profit (3%)
    if (currentPrice >= position.takeProfitPrice) {
      return { exit: true, reason: '3% Take Profit reached' };
    }
    
    // Check stop loss (5%)
    if (currentPrice <= position.stopLossPrice) {
      return { exit: true, reason: '5% Stop Loss reached' };
    }
    
    // Check 3-minute auto-exit timeout
    const now = new Date();
    if (now >= position.autoExitTime) {
      const changePercent = ((currentPrice - position.entryPrice) / position.entryPrice * 100).toFixed(2);
      return { exit: true, reason: `3-minute timeout reached (${changePercent}% change)` };
    }
    
    return { exit: false, reason: '' };
  }

  /**
   * Execute exit trade with slippage retries (minimum 3% slippage)
   */
  private async executeExitTrade(position: Position, reason: string) {
    // Start with minimum 3% slippage and increase progressively
    const slippagePercentages = [3, 5, 7, 10, 15, 20]; // Minimum 3% slippage as requested
    
    this.logger.log(`🚪 Exiting position ${position.id} - ${reason}`);
    this.logger.log(`💰 Position details: ${position.amount} ${position.token} @ $${position.entryPrice}`);

    for (let i = 0; i < slippagePercentages.length; i++) {
      const slippagePercent = slippagePercentages[i];
      const slippageBps = slippagePercent * 100; // Convert to basis points (3% = 300 bps)
      
      try {
        this.logger.log(`🔄 Attempt ${i + 1}/${slippagePercentages.length}: Trying exit with ${slippagePercent}% slippage (${slippageBps} bps)`);
        
        const result = await this.tradingService.executeExitTrade({
          positionId: position.id,
          token: position.token,
          action: position.action === 'BUY' ? 'SELL' : 'BUY', // Opposite action
          amount: position.amount,
          slippageBps: slippageBps,
          reason: `${reason} (${slippagePercent}% slippage)`
        });

        if (result.success) {
          position.status = 'CLOSED';
          this.logger.log(`✅ Position ${position.id} closed successfully with ${slippagePercent}% slippage`);
          this.logger.log(`📝 Transaction signature: ${result.transactionSignature || 'N/A'}`);
          return;
        } else {
          this.logger.warn(`⚠️ Exit attempt ${i + 1} failed with ${slippagePercent}% slippage: ${result.message}`);
        }
      } catch (error) {
        this.logger.error(`❌ Exit attempt ${i + 1} error with ${slippagePercent}% slippage: ${error.message}`);
        this.logger.error(`Error type: ${error.constructor.name}`);
        
        // Log more specific error details
        if (error.message.includes('Network error')) {
          this.logger.error(`🌐 Network connectivity issue detected`);
        } else if (error.message.includes('insufficient')) {
          this.logger.error(`💰 Insufficient balance or liquidity issue`);
        } else if (error.message.includes('slippage')) {
          this.logger.error(`📈 Slippage tolerance exceeded`);
        } else if (error.message.includes('timeout')) {
          this.logger.error(`⏰ Request timeout - network or API issue`);
        }
        
        // Wait between retries (except for the last attempt)
        if (i < slippagePercentages.length - 1) {
          this.logger.log(`⏳ Waiting 3 seconds before next attempt...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

    this.logger.error(`❌ CRITICAL: Failed to exit position ${position.id} with all slippage levels (3%-20%)`);
    this.logger.error(`💸 Position remains OPEN: ${position.amount} ${position.token} worth ~$${(position.amount * position.entryPrice).toFixed(2)}`);
    
    // Mark position as failed but keep it open for manual intervention
    position.status = 'OPEN'; // Keep open so it can be retried later
  }

  /**
   * Legacy method for backward compatibility
   */
  async analyzeAndTradeOnce(): Promise<any> {
    return { success: false, message: 'Use launchBot instead' };
  }
}
