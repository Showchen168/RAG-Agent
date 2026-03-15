import https from "https";
import { Resolver } from "dns";

export const TELEGRAM_API_HOST = "api.telegram.org";
const MAX_MESSAGE_LENGTH = 4096;

// Custom DNS resolver using public DNS servers.
// Docker containers on certain NAS environments have DNS
// that cannot resolve api.telegram.org (ESERVFAIL).
export const telegramResolver = new Resolver();
telegramResolver.setServers(["8.8.8.8", "1.1.1.1"]);

/**
 * Custom DNS lookup for https.request.
 * Falls back to public DNS (8.8.8.8, 1.1.1.1) to bypass
 * broken container DNS for api.telegram.org.
 */
export function telegramLookup(
  hostname: string,
  _options: object,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string,
    family: number,
  ) => void,
): void {
  telegramResolver.resolve4(hostname, (err, addresses) => {
    if (err || !addresses.length) {
      callback(err ?? new Error(`No addresses found for ${hostname}`), "", 0);
      return;
    }
    callback(null, addresses[0], 4);
  });
}

/**
 * 取得 Bot Token。
 * 優先從 DB 讀取（透過 bot-config.ts），fallback 到 env var。
 * 使用 lazy import 避免循環依賴。
 */
async function getBotToken(): Promise<string> {
  try {
    const { getActiveBotToken } = await import("./bot-config");
    const token = await getActiveBotToken();
    if (token) return token;
  } catch {
    // bot-config 模組載入失敗，fallback
  }
  const envToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!envToken) throw new Error("TELEGRAM_BOT_TOKEN 環境變數未設定");
  return envToken;
}

/**
 * Low-level POST helper for Telegram Bot API.
 * Uses Node.js https module with custom DNS resolver and IPv4,
 * bypassing Docker container DNS issues (ESERVFAIL for api.telegram.org).
 */
export function telegramPost(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; statusCode: number }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: TELEGRAM_API_HOST,
        port: 443,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        family: 4,
        lookup: telegramLookup as Parameters<typeof https.request>[0] extends {
          lookup?: infer L;
        }
          ? L
          : never,
      },
      (res) => {
        res.resume();
        resolve({
          ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
          statusCode: res.statusCode ?? 0,
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/**
 * POST helper that returns the parsed JSON response body.
 * Used by bot-config.ts for getMe, setWebhook, getWebhookInfo etc.
 * Reuses the same custom DNS resolver and IPv4 settings as telegramPost.
 */
export function telegramRequest<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<{ ok: boolean; statusCode: number; result?: T }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: TELEGRAM_API_HOST,
        port: 443,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        family: 4,
        lookup: telegramLookup as Parameters<typeof https.request>[0] extends {
          lookup?: infer L;
        }
          ? L
          : never,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            const json = JSON.parse(raw) as {
              ok: boolean;
              result?: T;
              description?: string;
            };
            resolve({
              ok: json.ok,
              statusCode: res.statusCode ?? 0,
              result: json.result,
            });
          } catch {
            resolve({
              ok: false,
              statusCode: res.statusCode ?? 0,
            });
          }
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function markdownToTelegramHtml(md: string): string {
  let result = md;

  // 1. Extract code blocks (protect content inside from further transforms)
  const blocks: Array<{ placeholder: string; html: string }> = [];
  let blockIdx = 0;
  result = result.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_match, lang: string | undefined, code: string) => {
      const escaped = escapeHtml(code.trimEnd());
      const placeholder = `\x00BLOCK${blockIdx++}\x00`;
      blocks.push({
        placeholder,
        html: lang
          ? `<pre><code class="language-${lang}">${escaped}</code></pre>`
          : `<pre>${escaped}</pre>`,
      });
      return placeholder;
    },
  );

  // Extract inline code
  const inlines: Array<{ placeholder: string; html: string }> = [];
  let inlineIdx = 0;
  result = result.replace(/`([^`]+)`/g, (_match, code: string) => {
    const placeholder = `\x00INLINE${inlineIdx++}\x00`;
    inlines.push({
      placeholder,
      html: `<code>${escapeHtml(code)}</code>`,
    });
    return placeholder;
  });

  // Escape remaining HTML
  result = result
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Bold: **text**
  result = result.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  // Italic: *text* (not preceded/followed by *)
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<i>$1</i>");

  // Restore code blocks and inline code
  for (const block of blocks) {
    result = result.replace(block.placeholder, block.html);
  }
  for (const inline of inlines) {
    result = result.replace(inline.placeholder, inline.html);
  }

  return result;
}

export function splitMessage(
  text: string,
  maxLength = MAX_MESSAGE_LENGTH,
): string[] {
  if (text.length <= maxLength) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining);
      break;
    }

    // Try to split at last newline within limit
    const chunk = remaining.slice(0, maxLength);
    const lastNewline = chunk.lastIndexOf("\n");
    const splitAt = lastNewline > maxLength * 0.3 ? lastNewline : maxLength;

    parts.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }

  return parts;
}

export async function sendMessage(chatId: number, text: string): Promise<void> {
  const token = await getBotToken();
  const html = markdownToTelegramHtml(text);
  const parts = splitMessage(html);

  for (const part of parts) {
    const res = await telegramPost(`/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: part,
      parse_mode: "HTML",
    });

    if (!res.ok) {
      // Fallback: send without parse_mode
      await telegramPost(`/bot${token}/sendMessage`, {
        chat_id: chatId,
        text,
      });
    }
  }
}

export async function sendChatAction(
  chatId: number,
  action: "typing" = "typing",
): Promise<void> {
  const token = await getBotToken();
  await telegramPost(`/bot${token}/sendChatAction`, {
    chat_id: chatId,
    action,
  }).catch(() => {
    // non-critical, ignore errors
  });
}
