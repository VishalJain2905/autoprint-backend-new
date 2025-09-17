import { Module } from '@nestjs/common';
import { JupiterModule } from '../jupiter/jupiter.module';
import { WalletModule } from '../wallet/wallet.module';
import { TradingController } from './trading.controller';
import { TradingService } from './trading.service';

@Module({
  imports: [JupiterModule, WalletModule],
  controllers: [TradingController],
  providers: [TradingService],
  exports: [TradingService]
})
export class TradingModule {}
