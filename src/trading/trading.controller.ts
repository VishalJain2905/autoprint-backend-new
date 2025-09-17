import { Body, Controller, Post } from '@nestjs/common';
import { TradingService } from './trading.service';

@Controller('trading')
export class TradingController {
  constructor(private readonly tradingService: TradingService) {}

  // Legacy endpoint
  @Post('execute-once')
  async executeOnce(@Body() body: { token: string; action: 'BUY' | 'SELL'; confidence?: number; price?: number; reason?: string; }) {
    return this.tradingService.executeTradeOnce({
      token: body.token,
      action: body.action,
      confidence: body.confidence ?? 0,
      price: body.price,
      reason: body.reason
    });
  }

  // Create entry order (returns transaction for client signing)
  @Post('create-entry-order')
  async createEntryOrder(@Body() body: { 
    token: string; 
    action: 'BUY' | 'SELL'; 
    tradeSizeSol: number; 
    walletPublicKey: string; 
  }) {
    return this.tradingService.createEntryOrder({
      token: body.token,
      action: body.action,
      tradeSizeSol: body.tradeSizeSol,
      walletPublicKey: body.walletPublicKey
    });
  }

  // Execute signed entry order
  @Post('execute-entry-order')
  async executeEntryOrder(@Body() body: { 
    signedTransaction: string; 
    requestId: string; 
    orderId?: string; 
  }) {
    return this.tradingService.executeEntryOrder({
      signedTransaction: body.signedTransaction,
      requestId: body.requestId,
      orderId: body.orderId
    });
  }

  // Create exit order (returns transaction for client signing)
  @Post('create-exit-order')
  async createExitOrder(@Body() body: { 
    token: string; 
    action: 'BUY' | 'SELL'; 
    amount: number; 
    slippageBps: number; 
    walletPublicKey: string; 
    reason: string; 
  }) {
    return this.tradingService.createExitOrder({
      token: body.token,
      action: body.action,
      amount: body.amount,
      slippageBps: body.slippageBps,
      walletPublicKey: body.walletPublicKey,
      reason: body.reason
    });
  }

  // Execute signed exit order
  @Post('execute-exit-order')
  async executeExitOrder(@Body() body: { 
    signedTransaction: string; 
    requestId: string; 
    orderId?: string; 
  }) {
    return this.tradingService.executeExitOrder({
      signedTransaction: body.signedTransaction,
      requestId: body.requestId,
      orderId: body.orderId
    });
  }

  // Test transaction signing flow
  @Post('test-signing')
  async testSigning(@Body() body: { 
    token: string; 
    action: 'BUY' | 'SELL'; 
    tradeSizeSol: number; 
  }) {
    try {
      // Create order
      const createResult = await this.tradingService.createEntryOrder({
        token: body.token,
        action: body.action,
        tradeSizeSol: body.tradeSizeSol,
        walletPublicKey: 'test' // This will be replaced by wallet service
      });

      if (!createResult.success || !createResult.transaction) {
        return createResult;
      }

      return {
        success: true,
        message: 'Test signing flow works',
        createOrderResult: createResult,
        transactionLength: createResult.transaction.length,
        transactionPreview: createResult.transaction.substring(0, 50) + '...'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
