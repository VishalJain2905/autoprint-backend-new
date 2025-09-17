import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  private getBaseUrl(): string {
    const url = process.env.SIGNALS_BASE_URL || 'http://localhost:5000';
    return url.replace(/\/$/, '');
  }

  async refreshThenGetSignals(): Promise<any> {
    const baseUrl = this.getBaseUrl();
    const refreshUrl = `${baseUrl}/refresh`;
    const signalsUrl = `${baseUrl}/signals`;

    // Always run refresh first
    const refreshResponse = await fetch(refreshUrl, { method: 'POST' });
    if (!refreshResponse.ok) {
      this.logger.error(`Refresh failed: ${refreshResponse.status} ${refreshResponse.statusText}`);
      throw new Error(`Refresh failed with status: ${refreshResponse.status}`);
    }

    const response = await fetch(signalsUrl, { method: 'GET' });
    if (!response.ok) {
      this.logger.error(`Signals fetch failed: ${response.status} ${response.statusText}`);
      throw new Error(`Signals fetch failed with status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  }
}
