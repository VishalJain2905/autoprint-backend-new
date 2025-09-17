import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BotService } from './bot.service';

@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post('launch')
  async launchBot(@Body() body: { walletPublicKey: string; allocatedSol: number }) {
    return this.botService.launchBot(body.walletPublicKey, body.allocatedSol);
  }

  @Post('confirm-deposit')
  async confirmDeposit(@Body() body: { 
    sessionId: string; 
    signedDepositTransaction: string; 
    userWalletAddress: string; 
    allocatedSol: number; 
  }) {
    return this.botService.confirmDepositAndStartTrading({
      sessionId: body.sessionId,
      signedDepositTransaction: body.signedDepositTransaction,
      userWalletAddress: body.userWalletAddress,
      allocatedSol: body.allocatedSol
    });
  }

  @Post('stop/:sessionId')
  async stopBot(@Param('sessionId') sessionId: string) {
    return this.botService.stopBot(sessionId);
  }

  @Get('status/:sessionId')
  async getBotStatus(@Param('sessionId') sessionId: string) {
    return this.botService.getBotStatus(sessionId);
  }

  @Get('test-connectivity')
  async testConnectivity() {
    return this.botService.testConnectivity();
  }

  // Legacy endpoint
  @Post('trade-once')
  async tradeOnce() {
    return this.botService.analyzeAndTradeOnce();
  }
}
