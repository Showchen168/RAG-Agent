import { getOAuth2Client } from './auth';
import { encryptToken, decryptToken } from '../telegram/crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

/**
 * 取得 Supabase 客戶端
 */
function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
  }
  return supabaseClient;
}

/**
 * 取得加密金鑰
 */
function getEncryptionKey(): string {
  const keyHex = process.env.K_MASTER_KEY;
  if (!keyHex) {
    throw new Error('K_MASTER_KEY environment variable not set');
  }
  return keyHex;
}

/**
 * 存儲 tokens 到 DB（加密）
 */
export async function saveTokens(
  userId: string,
  tokens: {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
    email?: string;
  }
): Promise<void> {
  const keyHex = getEncryptionKey();

  const encryptedAccess = encryptToken(tokens.access_token, keyHex);
  const encryptedRefresh = encryptToken(tokens.refresh_token, keyHex);

  const { error } = await getSupabaseClient()
    .from('gdrive_user_tokens')
    .upsert({
      user_id: userId,
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      token_expiry: new Date(tokens.expiry_date).toISOString(),
      email: tokens.email || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    throw new Error(`Failed to save Google Drive tokens: ${error.message}`);
  }
}

/**
 * 從 DB 讀取 tokens（解密）
 */
export async function getTokens(userId: string): Promise<{
  access_token: string;
  refresh_token: string;
  token_expiry: Date;
  email: string | null;
}> {
  const { data, error } = await getSupabaseClient()
    .from('gdrive_user_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw new Error('User not connected to Google Drive');
  }

  const keyHex = getEncryptionKey();

  return {
    access_token: decryptToken(data.access_token, keyHex),
    refresh_token: decryptToken(data.refresh_token, keyHex),
    token_expiry: new Date(data.token_expiry),
    email: data.email,
  };
}

/**
 * 刪除 tokens
 */
export async function deleteTokens(userId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('gdrive_user_tokens')
    .delete()
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete Google Drive tokens: ${error.message}`);
  }
}

/**
 * 檢查用戶是否已連接 Google Drive
 */
export async function isConnected(userId: string): Promise<boolean> {
  try {
    await getTokens(userId);
    return true;
  } catch {
    return false;
  }
}

/**
 * 取得有效的 access token（自動刷新過期 token）
 */
export async function getValidToken(userId: string): Promise<string> {
  const tokens = await getTokens(userId);

  // 檢查 token 是否已過期（提前 5 分鐘刷新）
  const now = new Date();
  const refreshThreshold = new Date(now.getTime() + 5 * 60 * 1000); // 5 分鐘

  if (tokens.token_expiry > refreshThreshold) {
    // Token 仍有效
    return tokens.access_token;
  }

  // Token 已過期或即將過期，需要進行刷新
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: tokens.refresh_token,
  });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token || !credentials.refresh_token) {
    throw new Error('Failed to refresh Google Drive token');
  }

  // 存儲新的 tokens
  await saveTokens(userId, {
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token,
    expiry_date: credentials.expiry_date || Date.now() + 3600000,
    email: tokens.email || undefined,
  });

  return credentials.access_token;
}
