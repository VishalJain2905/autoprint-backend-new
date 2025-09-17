import { ConnectWalletDto, SupportedWalletType } from './dto/connect-wallet.dto';
import { WalletSession } from './dto/session.dto';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

const sessions: Map<string, WalletSession> = new Map();
let currentActiveSessionId: string | null = null;

// Initialize Solana connection with reliable RPC endpoints
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 
  'confirmed'
);

function generateSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getHealth() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'wallet',
  };
}

export async function connect(request: ConnectWalletDto): Promise<{ success: boolean; sessionId?: string; publicKey?: string; balance?: number; error?: string }> {
  const { publicKey, walletType } = request;

  if (!publicKey || !walletType) {
    return { success: false, error: 'publicKey and walletType are required' };
  }

  if (currentActiveSessionId) {
    const existing = sessions.get(currentActiveSessionId);
    if (existing) {
      existing.connected = false;
      existing.lastActiveAt = new Date().toISOString();
    }
    sessions.delete(currentActiveSessionId);
    currentActiveSessionId = null;
  }

  const sessionId = generateSessionId();
  
  // Fetch initial balance from Solana blockchain
  let initialBalance = 0;
  try {
    const pubKey = new PublicKey(publicKey);
    const balanceLamports = await connection.getBalance(pubKey);
    initialBalance = balanceLamports / LAMPORTS_PER_SOL;
    console.log(`💰 Initial balance fetched for ${publicKey}: ${initialBalance} SOL`);
  } catch (error) {
    console.error('Error fetching initial balance:', error);
    // Continue with balance 0 if fetch fails
  }
  
  const newSession: WalletSession = {
    id: sessionId,
    publicKey,
    walletType,
    connected: true,
    balance: initialBalance,
    connectedAt: new Date().toISOString(),
    permissions: [],
  };

  sessions.set(sessionId, newSession);
  currentActiveSessionId = sessionId;

  return { success: true, sessionId, publicKey, balance: initialBalance };
}

export function disconnect(sessionId: string): { success: boolean; message?: string; error?: string } {
  const session = sessions.get(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found' };
  }
  session.connected = false;
  session.lastActiveAt = new Date().toISOString();
  sessions.delete(sessionId);
  if (currentActiveSessionId === sessionId) {
    currentActiveSessionId = null;
  }
  return { success: true, message: 'Disconnected' };
}

export function getSession(sessionId: string): { success: boolean; session?: WalletSession; error?: string } {
  const session = sessions.get(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found' };
  }
  return { success: true, session };
}

export async function refreshBalance(sessionId: string): Promise<{ success: boolean; balance?: number; error?: string }> {
  const session = sessions.get(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  try {
    // Fetch actual balance from Solana blockchain
    const publicKey = new PublicKey(session.publicKey);
    const balanceLamports = await connection.getBalance(publicKey);
    const balanceSOL = balanceLamports / LAMPORTS_PER_SOL;
    
    // Update the session with real balance
    session.balance = balanceSOL;
    sessions.set(sessionId, session);
    
    console.log(`💰 Balance fetched for ${session.publicKey}: ${balanceSOL} SOL`);
    
    return { success: true, balance: balanceSOL };
  } catch (error) {
    console.error('Error fetching balance:', error);
    return { success: false, error: `Failed to fetch balance: ${error.message}` };
  }
}

export function getActiveSessions(): { success: boolean; sessions: WalletSession[] } {
  const list = Array.from(sessions.values()).filter((s) => s.connected);
  return { success: true, sessions: list };
}

export function getStats(): { success: boolean; stats: { totalConnections: number; walletTypes: Record<string, number>; totalBalance: number; averageBalance: number; lastHourConnections: number } } {
  const list = Array.from(sessions.values());
  const totalConnections = list.length;
  const walletTypes: Record<string, number> = {};
  for (const s of list) {
    walletTypes[s.walletType] = (walletTypes[s.walletType] || 0) + 1;
  }
  const totalBalance = list.reduce((sum, s) => sum + (s.balance || 0), 0);
  const averageBalance = totalConnections > 0 ? totalBalance / totalConnections : 0;
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const lastHourConnections = list.filter((s) => new Date(s.connectedAt).getTime() >= oneHourAgo).length;
  return { success: true, stats: { totalConnections, walletTypes, totalBalance, averageBalance, lastHourConnections } };
}

export function verifyWalletSignature(_publicKey: string, _message: string, _signature: string): { success: boolean; verified: boolean; message: string } {
  if (_publicKey && _message && _signature) {
    return { success: true, verified: true, message: 'Signature accepted (stub verification)' };
  }
  return { success: false, verified: false, message: 'Missing fields' };
}

/**
 * Get actual token balance from wallet (not stored position amount)
 */
export async function getTokenBalance(walletPublicKey: string, tokenMintAddress: string, decimals: number = 9): Promise<{ success: boolean; balance?: number; error?: string }> {
  try {
    const walletPubKey = new PublicKey(walletPublicKey);
    const mintPubKey = new PublicKey(tokenMintAddress);
    
    // Special case for SOL (native token)
    if (tokenMintAddress === 'So11111111111111111111111111111111111111112') {
      const balanceLamports = await connection.getBalance(walletPubKey);
      const balanceSOL = balanceLamports / LAMPORTS_PER_SOL;
      console.log(`💰 SOL balance for ${walletPublicKey}: ${balanceSOL}`);
      return { success: true, balance: balanceSOL };
    }
    
    // For SPL tokens, get associated token account
    const associatedTokenAddress = await getAssociatedTokenAddress(mintPubKey, walletPubKey);
    
    try {
      // Try to get the token account info from RPC
      const accountInfo = await connection.getAccountInfo(associatedTokenAddress);
      
      if (!accountInfo) {
        // Token account doesn't exist = 0 balance
        console.log(`💰 Token balance for ${walletPublicKey} (${tokenMintAddress}): 0 (no account)`);
        return { success: true, balance: 0 };
      }
      
      // Parse token account data (simplified)
      // The amount is stored as a u64 at offset 64 in the account data
      const dataView = new DataView(accountInfo.data.buffer);
      const amount = dataView.getBigUint64(64, true); // little endian
      const balance = Number(amount) / Math.pow(10, decimals);
      
      console.log(`💰 Token balance for ${walletPublicKey} (${tokenMintAddress}): ${balance}`);
      return { success: true, balance };
    } catch (error) {
      // Token account doesn't exist = 0 balance
      if (error.message?.includes('could not find account')) {
        console.log(`💰 Token balance for ${walletPublicKey} (${tokenMintAddress}): 0 (no account)`);
        return { success: true, balance: 0 };
      }
      throw error;
    }
  } catch (error) {
    console.error(`❌ Error fetching token balance:`, error);
    return { success: false, error: error.message };
  }
}
