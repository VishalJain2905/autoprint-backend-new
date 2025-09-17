import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class JupiterService {
  private readonly logger = new Logger(JupiterService.name);

  /**
   * Test network connectivity to Jupiter APIs
   */
  async testConnectivity(): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log('🔍 Testing connectivity to Jupiter APIs...');
      
      // Test price API
      const priceResponse = await fetch('https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112', {
        method: 'GET',
        headers: { 'User-Agent': 'AutoPrint-Bot/1.0' },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (!priceResponse.ok) {
        throw new Error(`Price API returned ${priceResponse.status}`);
      }
      
      const priceData = await priceResponse.json();
      this.logger.log(`✅ Price API test successful - SOL price: $${priceData?.data?.So11111111111111111111111111111111111111112?.price || 'N/A'}`);
      
      return {
        success: true,
        message: 'All Jupiter APIs are accessible'
      };
    } catch (error) {
      this.logger.error(`❌ Connectivity test failed: ${error.message}`);
      return {
        success: false,
        message: `Network connectivity issue: ${error.message}`
      };
    }
  }

  private readonly tokenSymbolToMint: Record<string, string> = {
    // Base tokens
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',

    // Provided tokens
    BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    PENGU: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
    JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
    TRUMP: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN',
    JTO: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
    ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE'
  };

  getDefaultTokenMap(): Record<string, string> {
    return this.tokenSymbolToMint;
  }

  getDefaultMints(): string[] {
    return Object.values(this.tokenSymbolToMint);
  }

  async fetchPricesByMints(mints: string[]): Promise<any> {
    if (!mints || mints.length === 0) {
      throw new Error('No mints provided');
    }
    const uniqueMints = Array.from(new Set(mints));
    const idsParam = uniqueMints.join(',');
    const url = `https://lite-api.jup.ag/price/v3?ids=${encodeURIComponent(idsParam)}`;

    this.logger.log(`🌐 Fetching prices from Jupiter API: ${url}`);
    
    try {
      const response = await fetch(url, { 
        method: 'GET',
        headers: {
          'User-Agent': 'AutoPrint-Bot/1.0'
        },
        // Add 30 second timeout
        signal: AbortSignal.timeout(30000)
      });
      
      if (!response.ok) {
        this.logger.error(`Jupiter price API error: ${response.status} ${response.statusText}`);
        this.logger.error(`Response headers: ${JSON.stringify(Object.fromEntries(response.headers))}`);
        const errorText = await response.text().catch(() => 'Could not read response');
        this.logger.error(`Response body: ${errorText}`);
        throw new Error(`Jupiter price API error: ${response.status} - ${response.statusText}`);
      }
      
      const data = await response.json();
      this.logger.log(`✅ Successfully fetched prices for ${uniqueMints.length} tokens`);
      return data;
    } catch (error) {
      this.logger.error(`❌ Network error fetching prices: ${error.message}`);
      this.logger.error(`Error type: ${error.constructor.name}`);
      if (error.name === 'AbortError') {
        throw new Error('Jupiter price API request timed out after 30 seconds');
      }
      throw new Error(`Network error: ${error.message}`);
    }
  }

  async fetchPricesBySymbols(symbols: string[]): Promise<any> {
    if (!symbols || symbols.length === 0) {
      throw new Error('No symbols provided');
    }
    const mints = symbols
      .map(s => this.tokenSymbolToMint[s.toUpperCase()])
      .filter(Boolean);
    if (mints.length === 0) {
      throw new Error('No valid symbols provided');
    }
    return this.fetchPricesByMints(mints);
  }

  /**
   * Create Jupiter swap transaction (alternative to Trigger API)
   */
  async createSwapTransaction(params: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippageBps?: number;
    userPublicKey: string;
  }): Promise<any> {
    try {
      // Step 1: Get quote
      const quoteResponse = await fetch(
        `https://quote-api.jup.ag/v6/quote?` +
        `inputMint=${params.inputMint}&` +
        `outputMint=${params.outputMint}&` +
        `amount=${params.amount}&` +
        `slippageBps=${params.slippageBps || 50}`
      );

      if (!quoteResponse.ok) {
        throw new Error(`Quote API error: ${quoteResponse.status}`);
      }

      const quoteData = await quoteResponse.json();

      // Step 2: Get swap transaction
      const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: params.userPublicKey,
          wrapAndUnwrapSol: true,
        }),
      });

      if (!swapResponse.ok) {
        throw new Error(`Swap API error: ${swapResponse.status}`);
      }

      const swapData = await swapResponse.json();
      
      return {
        success: true,
        transaction: swapData.swapTransaction,
        quote: quoteData,
      };
    } catch (error) {
      this.logger.error(`Jupiter swap error: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
