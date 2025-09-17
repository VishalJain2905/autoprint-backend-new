import { Module } from '@nestjs/common';
import { SignalsModule } from '../signals/signals.module';
import { TradingModule } from '../trading/trading.module';
import { JupiterModule } from '../jupiter/jupiter.module';
import { WalletModule } from '../wallet/wallet.module';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';

@Module({
  imports: [SignalsModule, TradingModule, JupiterModule, WalletModule],
  controllers: [BotController],
  providers: [BotService]
})
export class BotModule {}
