# OAuth 整合設定指南

本文檔說明如何將 NexusMind Chat API 從 API Key 模式切換到 OAuth 模式。

## 快速開始

### 1. 完成 OAuth 授權

首先執行 `gemini init` 完成 Google OAuth 授權：

```bash
npx gemini init
```

這將：
- 開啟瀏覽器進行 Google 授權
- 將憑證儲存到 `~/.gemini/credentials.json`
- Token Manager 會自動管理 token 刷新

### 2. 啟用 OAuth 模式

在 `.env.local` 中設定：

```bash
USE_OAUTH=true
```

### 3. 重啟開發伺服器

```bash
npm run dev
```

## 工作原理

### Architecture

```
Chat API Request
    ↓
USE_OAUTH=true?
    ↓ Yes                    ↓ No
getProviderWithOAuth()   getProvider()
    ↓                        ↓
Token Manager            API Key
    ↓                        ↓
OAuth Access Token       GOOGLE_GENERATIVE_AI_API_KEY
    ↓                        ↓
Vercel AI SDK Provider
    ↓
streamText()
```

### 關鍵函數

#### `getProviderWithOAuth(model: AIModel)`

位於 `src/lib/ai/providers.ts`

**功能**：
- 從 Token Manager 取得 OAuth Access Token
- 使用 `createGoogleGenerativeAI({ apiKey: accessToken })` 建立 Provider
- 如果失敗，自動退回使用 API Key

**錯誤處理**：
- Token 過期時，Token Manager 會自動刷新
- 如果 Token Manager 未初始化，會拋出錯誤並返回 401

#### Chat API 整合

位於 `src/app/api/chat/route.ts`

```typescript
const useOAuth = process.env.USE_OAUTH === 'true'
const provider = useOAuth ? await getProviderWithOAuth(model) : getProvider(model)
```

### Token 管理

Token Manager 會自動處理：
- ✅ Access Token 快取（避免重複讀取檔案）
- ✅ Token 過期檢查（提前 5 分鐘刷新）
- ✅ 自動刷新（使用 Refresh Token）
- ✅ 憑證持久化（儲存到 `~/.gemini/credentials.json`）

## 測試

### 執行整合測試

```bash
npm test -- src/app/api/chat/__tests__/oauth-integration.test.ts
```

測試涵蓋：
- ✅ OAuth Provider 正確使用
- ✅ API Key Provider 退回機制
- ✅ 未初始化錯誤處理（返回 401）
- ✅ Token 過期自動刷新

### 手動測試

1. 啟動開發伺服器：
   ```bash
   npm run dev
   ```

2. 發送測試請求：
   ```bash
   curl -X POST http://localhost:3000/api/chat \
     -H "Content-Type: application/json" \
     -d '{
       "messages": [{"role": "user", "content": "Hello"}],
       "model": "gemini-flash"
     }'
   ```

3. 檢查 Console 日誌：
   - ✅ `使用 OAuth Token 呼叫 Gemini API` → OAuth 成功
   - ⚠️ `OAuth Token 取得失敗，退回使用 API Key` → OAuth 失敗

## 故障排除

### 錯誤: "請先執行 gemini init 完成 Google OAuth 授權"

**原因**: Token Manager 找不到憑證檔案

**解決方法**:
```bash
npx gemini init
```

### 錯誤: "Token expired"

**原因**: Refresh Token 失效（通常是因為撤銷授權）

**解決方法**:
1. 刪除舊憑證：
   ```bash
   rm ~/.gemini/credentials.json
   ```

2. 重新授權：
   ```bash
   npx gemini init
   ```

### OAuth 模式下仍使用 API Key

**檢查清單**:
1. ✅ `.env.local` 中 `USE_OAUTH=true`？
2. ✅ 重啟開發伺服器？
3. ✅ 檢查 Console 日誌確認使用的 Provider？

## 效能考量

### OAuth vs API Key

| 方面 | OAuth | API Key |
|------|-------|---------|
| **安全性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **設定複雜度** | 高 | 低 |
| **Token 刷新** | 自動 | 無需 |
| **成本** | 相同 | 相同 |

### 建議

- **開發環境**: 使用 API Key（快速簡單）
- **生產環境**: 使用 OAuth（更安全）
- **企業部署**: 使用 OAuth + Service Account

## 下一步

- [ ] 實作 Service Account 支援（用於伺服器端）
- [ ] 新增 OAuth Token 監控與告警
- [ ] 支援多租戶 OAuth（每個用戶獨立授權）

## 參考資料

- [Google OAuth 2.0 文檔](https://developers.google.com/identity/protocols/oauth2)
- [Gemini API 認證指南](https://ai.google.dev/gemini-api/docs/oauth)
- [Token Manager 設計文檔](../src/lib/ai/__tests__/token-manager.test.ts)
