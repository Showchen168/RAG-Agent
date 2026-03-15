import { google } from 'googleapis';
import { Readable } from 'stream';
import { getValidToken } from './tokens';

/**
 * 用 access token 建立已授權的 OAuth2Client
 */
function createAuthClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

/**
 * 檔案資訊結構
 */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
}

/**
 * 檔案列表結果
 */
export interface DriveFileListResult {
  files: DriveFile[];
  nextPageToken?: string;
}

/**
 * 將 Stream 轉換為 Buffer
 */
function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * 列出 Google Drive 檔案
 * @param userId 用戶 ID
 * @param options 查詢選項
 */
export async function listFiles(
  userId: string,
  options?: {
    pageSize?: number;
    mimeType?: string;
    pageToken?: string;
    folderId?: string;
    searchQuery?: string;
    mimeTypeFilter?: string[];
  }
): Promise<DriveFileListResult> {
  const accessToken = await getValidToken(userId);

  const driveClient = google.drive({
    version: 'v3',
    auth: createAuthClient(accessToken),
  });

  let query = 'trashed=false';
  
  // 資料夾過濾
  if (options?.folderId && options.folderId !== 'root') {
    query += ` and '${options.folderId}' in parents`;
  }
  
  // MIME 類型過濾
  if (options?.mimeTypeFilter && options.mimeTypeFilter.length > 0) {
    const mimeQueries = options.mimeTypeFilter.map((m) => `mimeType='${m}'`).join(' or ');
    query += ` and (${mimeQueries})`;
  } else if (options?.mimeType) {
    query += ` and mimeType='${options.mimeType}'`;
  }
  
  // 搜尋查詢
  if (options?.searchQuery) {
    query += ` and name contains '${options.searchQuery}'`;
  }

  const res = await driveClient.files.list({
    spaces: 'drive',
    fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, parents), nextPageToken',
    pageSize: options?.pageSize || 100,
    q: query,
    pageToken: options?.pageToken,
  });

  return {
    files: (res.data.files || []).map((f) => ({
      id: f.id || '',
      name: f.name || 'Untitled',
      mimeType: f.mimeType || 'application/octet-stream',
      size: f.size ? Number(f.size) : undefined,
      createdTime: f.createdTime ?? undefined,
      modifiedTime: f.modifiedTime ?? undefined,
      parents: f.parents || undefined,
    })),
    nextPageToken: res.data.nextPageToken ?? undefined,
  };
}

/**
 * 下載 Google Drive 檔案（一般檔案）
 * @param userId 用戶 ID
 * @param fileId 檔案 ID
 */
export async function downloadFile(
  userId: string,
  fileId: string
): Promise<Buffer> {
  const accessToken = await getValidToken(userId);

  const driveClient = google.drive({
    version: 'v3',
    auth: createAuthClient(accessToken),
  });

  const res = await driveClient.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  return streamToBuffer(res.data as Readable);
}

/**
 * 匯出 Google Drive 檔案（Google 原生檔案如 Docs, Sheets, Slides）
 * @param userId 用戶 ID
 * @param fileId 檔案 ID
 * @param mimeType 目標 MIME 型態（如 application/pdf）
 */
export async function exportFile(
  userId: string,
  fileId: string,
  mimeType: string
): Promise<Buffer> {
  const accessToken = await getValidToken(userId);

  const driveClient = google.drive({
    version: 'v3',
    auth: createAuthClient(accessToken),
  });

  const res = await driveClient.files.export(
    { fileId, mimeType },
    { responseType: 'stream' }
  );

  return streamToBuffer(res.data as Readable);
}

/**
 * 取得檔案元資料
 */
export async function getFileMetadata(
  userId: string,
  fileId: string
): Promise<DriveFile> {
  const accessToken = await getValidToken(userId);

  const driveClient = google.drive({
    version: 'v3',
    auth: createAuthClient(accessToken),
  });

  const res = await driveClient.files.get({
    fileId,
    fields: 'id, name, mimeType, size, createdTime, modifiedTime, parents',
  });

  const file = res.data;
  return {
    id: file.id || '',
    name: file.name || 'Untitled',
    mimeType: file.mimeType || 'application/octet-stream',
    size: file.size ? Number(file.size) : undefined,
    createdTime: file.createdTime ?? undefined,
    modifiedTime: file.modifiedTime ?? undefined,
    parents: file.parents || undefined,
  };
}
