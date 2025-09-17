import { Injectable, Logger } from '@nestjs/common';

interface CreateOrderParams {
  inputMint: string;
  outputMint: string;
  maker: string;
  payer: string;
  makingAmount: string; // minor units as string
  takingAmount: string; // minor units as string
  slippageBps?: number;
  computeUnitPrice?: 'auto' | string;
  feeAccount?: string;
  wrapAndUnwrapSol?: boolean;
}

@Injectable()
export class TriggerService {
  private readonly logger = new Logger(TriggerService.name);

  async createOrder(params: CreateOrderParams): Promise<any> {
    const body: any = {
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      maker: params.maker,
      payer: params.payer,
      params: {
        makingAmount: params.makingAmount,
        takingAmount: params.takingAmount,
      },
      computeUnitPrice: params.computeUnitPrice || 'auto',
      wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
    };

    if (params.slippageBps !== undefined) {
      body.params.slippageBps = String(params.slippageBps);
    }
    if (params.feeAccount) {
      body.feeAccount = params.feeAccount;
    }

    this.logger.log(`🔧 Creating Jupiter order:`);
    this.logger.log(`📝 Request body: ${JSON.stringify(body, null, 2)}`);

    this.logger.log(`🌐 Making request to Jupiter Trigger API: https://lite-api.jup.ag/trigger/v1/createOrder`);
    
    const res = await fetch('https://lite-api.jup.ag/trigger/v1/createOrder', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'AutoPrint-Bot/1.0'
      },
      body: JSON.stringify(body),
      // Add 30 second timeout
      signal: AbortSignal.timeout(30000)
    }).catch(error => {
      this.logger.error(`❌ Network error creating order: ${error.message}`);
      this.logger.error(`Error type: ${error.constructor.name}`);
      if (error.name === 'AbortError') {
        throw new Error('Jupiter Trigger API request timed out after 30 seconds');
      }
      throw new Error(`Network error: ${error.message}`);
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`CreateOrder failed: ${res.status} ${res.statusText} - ${text}`);
      this.logger.error(`Request body: ${JSON.stringify(body, null, 2)}`);
      
      // If 401, it might be a request format issue
      if (res.status === 401) {
        this.logger.warn(`⚠️ Jupiter Lite Trigger API returned 401. Check request parameters.`);
      }
      
      throw new Error(`CreateOrder failed: ${res.status}`);
    }

    const response = await res.json();
    this.logger.log(`✅ Jupiter order created successfully:`);
    this.logger.log(`📄 Response: ${JSON.stringify(response, null, 2)}`);
    
    return response;
  }

  async executeSignedTransaction(signedTransaction: string, requestId: string): Promise<any> {
    this.logger.log(`🚀 Executing transaction with requestId: ${requestId}`);
    this.logger.log(`📝 Signed transaction: ${signedTransaction.substring(0, 50)}...`);
    
    const requestBody = { signedTransaction, requestId };
    this.logger.log(`📝 Execute request body: ${JSON.stringify(requestBody, null, 2)}`);
    
    this.logger.log(`🌐 Making request to Jupiter Execute API: https://lite-api.jup.ag/trigger/v1/execute`);
    
    const res = await fetch('https://lite-api.jup.ag/trigger/v1/execute', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'AutoPrint-Bot/1.0'
      },
      body: JSON.stringify(requestBody),
      // Add 30 second timeout
      signal: AbortSignal.timeout(30000)
    }).catch(error => {
      this.logger.error(`❌ Network error executing transaction: ${error.message}`);
      this.logger.error(`Error type: ${error.constructor.name}`);
      if (error.name === 'AbortError') {
        throw new Error('Jupiter Execute API request timed out after 30 seconds');
      }
      throw new Error(`Network error: ${error.message}`);
    });

    const responseData = await res.json();
    this.logger.log(`📄 Execute response: ${JSON.stringify(responseData, null, 2)}`);
    this.logger.log(`📄 HTTP Status: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      this.logger.error(`Execute failed: ${res.status} ${res.statusText}`);
      return { success: false, error: responseData.error || responseData.message || `HTTP ${res.status}` };
    }

    // Check if the response indicates success
    if (responseData.code !== undefined && responseData.code !== 0) {
      this.logger.error(`Execute failed with code ${responseData.code}: ${responseData.message || responseData.error}`);
      return { success: false, error: responseData.message || responseData.error || `Code ${responseData.code}` };
    }

    // Additional check for Jupiter-specific success indicators
    if (responseData.status && responseData.status !== 'Success') {
      this.logger.warn(`⚠️ Jupiter returned status: ${responseData.status}`);
    }

    return { success: true, ...responseData };
  }
}


