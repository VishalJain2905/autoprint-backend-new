import { Module } from '@nestjs/common';
import { JupiterController } from './jupiter.controller';
import { JupiterService } from './jupiter.service';
import { TriggerService } from './trigger.service';

@Module({
  controllers: [JupiterController],
  providers: [JupiterService, TriggerService],
  exports: [JupiterService, TriggerService]
})
export class JupiterModule {}
