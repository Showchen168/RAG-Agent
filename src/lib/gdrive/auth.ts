import { google } from 'googleapis';
import type { Auth } from 'googleapis';
import { getValidToken as getValidTokenFromStore, getTokens, deleteTokens } from './tokens';

export type OAuth2Client = Auth.OAuth2Client;

/**
 * 建立 Google OAuth2 Client
 * 使用環境變數中的認證資訊
 */
export function getOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI'
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * 生成 Google OAuth 授權 URL
 * @param userId 用戶 ID（作為 state 參數）
 * @returns 授權 URL，用戶點擊後會登入並授權
 */
export function getAuthUrl(userId: string): string {
  const oauth2Client = getOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // 需要 refresh token
    prompt: 'consent', // 強制重新授權，確保取得 refresh_token
    scope: ['https://www.googleapis.com/auth/drive.readonly'],
    state: userId, // 用 userId 作為 state，callback 時用來辨識用戶
  });
}

/**
 * 處理 OAuth callback，用授權碼換取 tokens
 * @param code 授權碼（來自 Google OAuth callback）
 * @returns tokens 物件 { access_token, refresh_token, expiry_date }
 */
export async function handleCallback(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  // 驗證 tokens 有效性
  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    throw new Error('Invalid tokens received from Google OAuth');
  }

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  };
}

/**
 * 取得有效的 access token（自動刷新過期 token）
 * @param userId 用戶 ID
 * @returns 有效的 access token
 */
export async function getValidToken(userId: string): Promise<string> {
  return getValidTokenFromStore(userId);
}

/**
 * 撤銷用戶的 Google Drive 授權
 * @param userId 用戶 ID
 */
export async function revokeToken(userId: string): Promise<void> {
  const tokens = await getTokens(userId);
  const oauth2Client = getOAuth2Client();
  
  // 撤銷 token
  await oauth2Client.revokeToken(tokens.access_token);
  
  // 從 DB 刪除
  await deleteTokens(userId);
}
