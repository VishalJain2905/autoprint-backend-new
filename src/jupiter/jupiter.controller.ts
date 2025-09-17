import { Controller, Get, Query } from '@nestjs/common';
import { JupiterService } from './jupiter.service';

@Controller('jupiter')
export class JupiterController {
  constructor(private readonly jupiterService: JupiterService) {}

  // Get prices by explicit mints (comma-separated)
  @Get('prices')
  async getPrices(@Query('ids') ids?: string) {
    const mints = ids ? ids.split(',').map(x => x.trim()).filter(Boolean) : this.jupiterService.getDefaultMints();
    return this.jupiterService.fetchPricesByMints(mints);
  }

  // Get prices by symbols (comma-separated)
  @Get('prices/symbols')
  async getPricesBySymbols(@Query('symbols') symbols?: string) {
    const list = symbols ? symbols.split(',').map(x => x.trim()).filter(Boolean) : Object.keys(this.jupiterService.getDefaultTokenMap());
    return this.jupiterService.fetchPricesBySymbols(list);
  }
}
