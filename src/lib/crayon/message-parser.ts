/**
 * parseAssistantResponseParts
 *
 * 將 DB 儲存的 assistant message content 還原為 Crayon parts 陣列。
 * 支援三種格式：
 *   1. 純 JSON: {"response":[...]}
 *   2. Code fence JSON: ```json\n{"response":[...]}\n```
 *   3. 混合格式: 前綴文字 + JSON
 *
 * 注意：code fence 標記（```json, ```）必須從 prefix 中剝除，
 * 不得作為 text part 洩漏到 UI。
 */
export function parseAssistantResponseParts(content: unknown) {
  if (typeof content !== "string" || !content.trim()) return null;

  const trimmedContent = content.trim();

  // 極短殘缺 JSON（常見於中止時只存到 "{\""）
  if (
    trimmedContent === "{" ||
    trimmedContent === '{"' ||
    trimmedContent === '{"response"'
  ) {
    return [{ type: "text", text: "（回覆中斷，內容未完整儲存）" }];
  }

  // 1. 嘗試完整 JSON 解析
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed?.response)) return parsed.response;
    if (parsed?.type === "template" || parsed?.type === "text") return [parsed];
  } catch {
    // ignore
  }

  // 2. 嘗試提取 JSON candidate
  let responseKeyIdx = content.search(/"response"\s*:/);
  let isBareObject = false;

  if (responseKeyIdx < 0) {
    // Fallback: 支援直接從中途擷取的 bare object (無需 "response": 包裝)
    responseKeyIdx = content.search(/"type"\s*:\s*"(?:template|text)"/);
    if (responseKeyIdx >= 0) {
      isBareObject = true;
    } else {
      return null;
    }
  }

  const objectStart = content.lastIndexOf("{", responseKeyIdx);
  const objectEnd = content.lastIndexOf("}");
  if (objectStart < 0 || objectEnd <= objectStart) return null;

  // 3. 檢查是否為混合格式（前綴 Markdown + 尾部 JSON）
  // 剝除 code fence 標記（```json, ```），避免洩漏到 UI
  const rawPrefix = content.slice(0, objectStart).trim();
  const prefix = rawPrefix
    .replace(/^```(?:json|ts|typescript|javascript|js)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  try {
    const parsed = JSON.parse(content.slice(objectStart, objectEnd + 1));
    const partsArray = isBareObject ? [parsed] : parsed?.response;

    if (Array.isArray(partsArray)) {
      // 有前綴文字 → 混合格式：將前綴包裝成 text part 插入最前面
      if (prefix) {
        return [{ type: "text", text: prefix }, ...partsArray];
      }
      return partsArray;
    }
  } catch {
    // ignore
  }

  // 4. 嘗試從殘缺 JSON 抽取 text 欄位，降低 JSON 外露機率
  const textFieldMatches = [
    ...content.matchAll(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/g),
  ];
  if (textFieldMatches.length > 0) {
    const joinedText = textFieldMatches
      .map((match) => {
        const raw = match[1];
        try {
          return JSON.parse(`"${raw}"`) as string;
        } catch {
          return raw;
        }
      })
      .join("\n\n")
      .trim();

    if (joinedText) {
      return [{ type: "text", text: joinedText }];
    }
  }

  return null;
}
