import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BotModule } from './bot/bot.module';
import { JupiterModule } from './jupiter/jupiter.module';
import { SignalsModule } from './signals/signals.module';
import { WalletModule } from './wallet/wallet.module';
import { UsersModule } from './users/users.module';
import { TradingModule } from './trading/trading.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BotModule,
    JupiterModule,
    SignalsModule,
    WalletModule,
    UsersModule,
    TradingModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
