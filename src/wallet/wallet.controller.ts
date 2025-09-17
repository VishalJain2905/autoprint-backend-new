import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import * as Wallet from './wallet.service';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import { WalletSigningService } from './wallet-signing.service';
import { DepositService, UserDeposit } from './deposit.service';

@Controller('wallet')
export class WalletController {

  constructor(
    private readonly walletSigningService: WalletSigningService,
    private readonly depositService: DepositService
  ) {}

  @Get('health')
  health() {
    return Wallet.getHealth();
  }

  @Get('info')
  getWalletInfo() {
    return {
      success: true,
      publicKey: this.walletSigningService.getPublicKey(),
      isAvailable: this.walletSigningService.isWalletAvailable(),
      message: this.walletSigningService.isWalletAvailable() 
        ? 'Wallet ready for signing' 
        : 'Wallet not available - check WALLET_PRIVATE_KEY'
    };
  }

  @Post('sign-transaction')
  signTransaction(@Body() body: { transaction: string }) {
    return this.walletSigningService.signTransaction(body.transaction);
  }

  @Post('validate-signature')
  validateSignature(@Body() body: { signedTransaction: string; expectedPublicKey?: string }) {
    return this.walletSigningService.validateSignature(body.signedTransaction, body.expectedPublicKey);
  }

  @Post('connect')
  async connect(@Body() body: ConnectWalletDto) {
    return await Wallet.connect(body);
  }

  @Delete('disconnect/:sessionId')
  disconnect(@Param('sessionId') sessionId: string) {
    return Wallet.disconnect(sessionId);
  }

  @Get('session/:sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    return Wallet.getSession(sessionId);
  }

  @Post('refresh-balance/:sessionId')
  async refreshBalance(@Param('sessionId') sessionId: string) {
    return await Wallet.refreshBalance(sessionId);
  }

  @Get('sessions')
  getActiveSessions() {
    return Wallet.getActiveSessions();
  }

  @Get('stats')
  getWalletStats() {
    return Wallet.getStats();
  }

  @Post('verify')
  verify(@Body() body: { publicKey: string; message: string; signature: string }) {
    return Wallet.verifyWalletSignature(body.publicKey, body.message, body.signature);
  }

  // Deposit endpoints
  @Get('bot-address')
  getBotWalletAddress() {
    return {
      success: true,
      botWalletAddress: this.depositService.getBotWalletAddress(),
      message: 'Bot wallet address for deposits'
    };
  }

  @Post('create-deposit')
  async createDeposit(@Body() body: { userWalletAddress: string; amountSol: number }) {
    return this.depositService.createDepositTransaction({
      userWalletAddress: body.userWalletAddress,
      amountSol: body.amountSol
    });
  }

  @Post('process-deposit')
  async processDeposit(@Body() body: { userWalletAddress: string; signedTransaction: string; amountSol: number }) {
    return this.depositService.processDeposit({
      userWalletAddress: body.userWalletAddress,
      signedTransaction: body.signedTransaction,
      amountSol: body.amountSol
    });
  }

  @Get('balance/:walletAddress')
  getUserBalance(@Param('walletAddress') walletAddress: string) {
    return this.depositService.getUserBalance(walletAddress);
  }

  @Post('withdraw')
  async withdraw(@Body() body: { userWalletAddress: string; amountSol: number }) {
    return this.depositService.createWithdrawalTransaction({
      userWalletAddress: body.userWalletAddress,
      amountSol: body.amountSol
    });
  }

  @Get('deposits')
  getAllDeposits() {
    return {
      success: true,
      deposits: this.depositService.getAllDeposits(),
      message: 'All user deposits'
    };
  }
}
