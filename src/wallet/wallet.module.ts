import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletSigningService } from './wallet-signing.service';
import { DepositService } from './deposit.service';

@Module({
  controllers: [WalletController],
  providers: [WalletSigningService, DepositService],
  exports: [WalletSigningService, DepositService]
})
export class WalletModule {}
