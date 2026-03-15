/**
 * youtube-fetcher.test.ts
 * 測試 YouTube 內容擷取模組的純函式
 */

// Mock ESM 外部模組（youtube-transcript-plus 和 @google/generative-ai 為 ESM，Jest 無法直接載入）
jest.mock("youtube-transcript-plus", () => ({
  YoutubeTranscript: { fetchTranscript: jest.fn() },
}));

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn().mockReturnValue({
  generateContent: mockGenerateContent,
});
jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

jest.mock("../youtube-utils", () => ({
  getVideoMetadata: jest.fn().mockResolvedValue({
    title: "Test Video",
    author_name: "TestChannel",
    thumbnail_url: "https://img.youtube.com/vi/test/0.jpg",
  }),
  buildVideoUrl: jest.fn(
    (id: string) => `https://www.youtube.com/watch?v=${id}`,
  ),
}));

jest.mock("../content-fetcher", () => ({
  computeHash: jest.fn().mockResolvedValue("mock-hash"),
}));

import {
  formatTranscriptToMarkdown,
  groupSegmentsByTime,
  buildStructuredContent,
  fetchVideoContent,
} from "../youtube-fetcher";
import { YoutubeTranscript } from "youtube-transcript-plus";

describe("formatTranscriptToMarkdown", () => {
  it("formats transcript segments into markdown with timestamps", () => {
    const segments = [
      { text: "Hello world", offset: 0, duration: 5000, lang: "en" },
      { text: "This is a test", offset: 5000, duration: 3000, lang: "en" },
    ];
    const result = formatTranscriptToMarkdown(
      segments,
      "Test Video",
      "TestChannel",
    );
    expect(result).toContain("# Test Video");
    expect(result).toContain("**頻道:** TestChannel");
    expect(result).toContain("[00:00]");
    expect(result).toContain("Hello world");
    expect(result).toContain("[00:05]");
    expect(result).toContain("This is a test");
  });

  it("formats hours correctly for long videos", () => {
    const segments = [
      { text: "Late content", offset: 3661000, duration: 2000, lang: "en" },
    ];
    const result = formatTranscriptToMarkdown(segments, "Long Video", "Ch");
    expect(result).toContain("[1:01:01]");
  });

  it("handles empty segments", () => {
    const result = formatTranscriptToMarkdown([], "Empty", "Ch");
    expect(result).toContain("# Empty");
  });

  it("handles segments with zero offset", () => {
    const segments = [{ text: "Start", offset: 0, duration: 1000 }];
    const result = formatTranscriptToMarkdown(segments, "Title", "Ch");
    expect(result).toContain("[00:00] Start");
  });

  it("handles very long timestamp", () => {
    const segments = [
      { text: "End", offset: 86400000, duration: 1000 }, // 24 hours
    ];
    const result = formatTranscriptToMarkdown(segments, "Title", "Ch");
    expect(result).toContain("[24:00:00]");
  });
});

describe("groupSegmentsByTime", () => {
  it("groups segments into 5-minute intervals by default", () => {
    const segments = [
      { text: "Intro", offset: 0, duration: 2000 },
      { text: "Point A", offset: 60000, duration: 3000 },
      { text: "Point B", offset: 290000, duration: 2000 }, // 4:50
      { text: "Point C", offset: 310000, duration: 2000 }, // 5:10 -> next group
      { text: "Point D", offset: 600000, duration: 2000 }, // 10:00 -> third group
    ];
    const groups = groupSegmentsByTime(segments);
    expect(groups).toHaveLength(3);
    expect(groups[0].label).toBe("00:00 - 05:00");
    expect(groups[0].segments).toHaveLength(3);
    expect(groups[1].label).toBe("05:00 - 10:00");
    expect(groups[1].segments).toHaveLength(1);
    expect(groups[2].label).toBe("10:00 - 15:00");
    expect(groups[2].segments).toHaveLength(1);
  });

  it("handles custom interval", () => {
    const segments = [
      { text: "A", offset: 0, duration: 1000 },
      { text: "B", offset: 120000, duration: 1000 }, // 2:00
      { text: "C", offset: 200000, duration: 1000 }, // 3:20 -> next group
    ];
    const groups = groupSegmentsByTime(segments, 180000); // 3 min intervals
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("00:00 - 03:00");
    expect(groups[0].segments).toHaveLength(2);
    expect(groups[1].label).toBe("03:00 - 06:00");
    expect(groups[1].segments).toHaveLength(1);
  });

  it("returns empty array for empty segments", () => {
    expect(groupSegmentsByTime([])).toEqual([]);
  });

  it("puts all segments in one group if video is short", () => {
    const segments = [
      { text: "A", offset: 0, duration: 1000 },
      { text: "B", offset: 10000, duration: 1000 },
    ];
    const groups = groupSegmentsByTime(segments);
    expect(groups).toHaveLength(1);
    expect(groups[0].segments).toHaveLength(2);
  });
});

describe("buildStructuredContent", () => {
  it("combines summary and segmented transcript", () => {
    const segments = [
      { text: "Hello", offset: 0, duration: 2000 },
      { text: "World", offset: 5000, duration: 2000 },
    ];
    const result = buildStructuredContent(
      segments,
      "Test Video",
      "TestChannel",
      "subtitle",
      "This is a summary of the video.",
    );

    // Header
    expect(result).toContain("# Test Video");
    expect(result).toContain("**頻道:** TestChannel");
    expect(result).toContain("**來源:** 字幕");

    // Summary section
    expect(result).toContain("## 摘要");
    expect(result).toContain("This is a summary of the video.");

    // Transcript section
    expect(result).toContain("## 逐字稿");
    expect(result).toContain("[00:00] Hello");
    expect(result).toContain("[00:05] World");
  });

  it("marks gemini-audio source correctly", () => {
    const result = buildStructuredContent([], "T", "C", "gemini-audio", "sum");
    expect(result).toContain("**來源:** 語音轉錄");
  });

  it("uses time group headers for long videos", () => {
    const segments = [
      { text: "A", offset: 0, duration: 1000 },
      { text: "B", offset: 310000, duration: 1000 }, // 5:10
    ];
    const result = buildStructuredContent(
      segments,
      "T",
      "C",
      "subtitle",
      "sum",
    );
    expect(result).toContain("### 00:00 - 05:00");
    expect(result).toContain("### 05:00 - 10:00");
  });

  it("omits group headers for short videos with single group", () => {
    const segments = [{ text: "Short", offset: 0, duration: 1000 }];
    const result = buildStructuredContent(
      segments,
      "T",
      "C",
      "subtitle",
      "sum",
    );
    expect(result).not.toContain("### 00:00");
    expect(result).toContain("[00:00] Short");
  });

  it("preserves all time groups for 32-minute video", () => {
    // Simulate a 32-minute video with segments every 30 seconds
    const segments = Array.from({ length: 64 }, (_, i) => ({
      text: `Content at ${i * 30} seconds`,
      offset: i * 30000,
      duration: 5000,
    }));

    const result = buildStructuredContent(
      segments,
      "32 Min Video",
      "Channel",
      "subtitle",
      "Summary text",
    );

    // Must have time groups spanning the full 32 minutes
    expect(result).toContain("### 00:00 - 05:00");
    expect(result).toContain("### 05:00 - 10:00");
    expect(result).toContain("### 10:00 - 15:00");
    expect(result).toContain("### 15:00 - 20:00");
    expect(result).toContain("### 20:00 - 25:00");
    expect(result).toContain("### 25:00 - 30:00");
    expect(result).toContain("### 30:00 - 35:00");
    // All 64 segments preserved
    expect(result).toContain("[31:00]");
    expect(result).toContain("[31:30]");
  });
});

describe("fetchVideoContent - Gemini L2 fallback for long videos", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, GOOGLE_GENERATIVE_AI_API_KEY: "test-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns full 32-minute transcript via Gemini when subtitles disabled", async () => {
    // L1 fails
    (YoutubeTranscript.fetchTranscript as jest.Mock).mockRejectedValue(
      new Error("Transcripts are disabled"),
    );

    // Build Gemini response spanning full 32 minutes
    const lines: string[] = ["# 32 Min Tutorial", "**頻道:** TestChannel", ""];
    for (let min = 0; min < 32; min++) {
      const ts = String(min).padStart(2, "0");
      lines.push(`[${ts}:00] Content at minute ${min}`);
      lines.push(`[${ts}:30] More content at minute ${min}`);
    }
    const fullTranscript = lines.join("\n");

    mockGenerateContent.mockResolvedValue({
      response: { text: () => fullTranscript },
    });

    const result = await fetchVideoContent("test-32min");

    expect(result.source).toBe("gemini-audio");
    // Must contain timestamps from beginning to end
    expect(result.transcript).toContain("[00:00]");
    expect(result.transcript).toContain("[15:00]");
    expect(result.transcript).toContain("[25:00]");
    expect(result.transcript).toContain("[31:00]");
    expect(result.transcript).toContain("[31:30]");
  });

  it("does not truncate transcript under MAX_TRANSCRIPT_LENGTH", async () => {
    (YoutubeTranscript.fetchTranscript as jest.Mock).mockRejectedValue(
      new Error("Transcripts are disabled"),
    );

    // Build a transcript that's under 50k chars but has timestamps throughout
    const lines: string[] = [];
    for (let i = 0; i < 64; i++) {
      const min = Math.floor((i * 30) / 60);
      const sec = (i * 30) % 60;
      const ts = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
      lines.push(`[${ts}] Segment ${i} with some content text.`);
    }
    const transcript = lines.join("\n");

    mockGenerateContent.mockResolvedValue({
      response: { text: () => transcript },
    });

    const result = await fetchVideoContent("test-no-truncate");

    // Last segment (31:30) should be preserved
    expect(result.transcript).toContain("[31:30]");
    expect(result.transcript).toContain("Segment 63");
  });

  it("Gemini model is configured with maxOutputTokens >= 65536", async () => {
    (YoutubeTranscript.fetchTranscript as jest.Mock).mockRejectedValue(
      new Error("Transcripts are disabled"),
    );

    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          "[00:00] Some content that is long enough to pass validation check here.",
      },
    });

    await fetchVideoContent("test-config");

    // Verify getGenerativeModel was called with generationConfig including maxOutputTokens
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: expect.objectContaining({
          maxOutputTokens: expect.any(Number),
        }),
      }),
      expect.any(Object),
    );
    const config = mockGetGenerativeModel.mock.calls[0][0];
    expect(config.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(
      65536,
    );
  });

  it("uses gemini-3.1-pro-preview model for long video transcription", async () => {
    (YoutubeTranscript.fetchTranscript as jest.Mock).mockRejectedValue(
      new Error("Transcripts are disabled"),
    );

    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          "[00:00] Some content that is long enough to pass validation check here.",
      },
    });

    await fetchVideoContent("test-model");

    const config = mockGetGenerativeModel.mock.calls[0][0];
    expect(config.model).toBe("gemini-3.1-pro-preview");
  });

  it("sets request timeout for model calls", async () => {
    (YoutubeTranscript.fetchTranscript as jest.Mock).mockRejectedValue(
      new Error("Transcripts are disabled"),
    );

    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          "[00:00] Some content that is long enough to pass validation check here.",
      },
    });

    await fetchVideoContent("test-timeout");

    // getGenerativeModel second arg is requestOptions with timeout
    const requestOptions = mockGetGenerativeModel.mock.calls[0][1];
    expect(requestOptions).toBeDefined();
    expect(requestOptions.timeout).toBeGreaterThanOrEqual(60_000);
  });

  it("falls back to gemini-3-flash-preview when pro model returns 503", async () => {
    (YoutubeTranscript.fetchTranscript as jest.Mock).mockRejectedValue(
      new Error("Transcripts are disabled"),
    );

    // First call (pro) fails with 503, second call (flash) succeeds
    mockGenerateContent
      .mockRejectedValueOnce(new Error("[503 Service Unavailable]"))
      .mockResolvedValueOnce({
        response: {
          text: () =>
            "[00:00] Fallback content that is long enough to pass validation.",
        },
      });

    const result = await fetchVideoContent("test-fallback");

    expect(result.source).toBe("gemini-audio");
    expect(result.transcript).toContain("[00:00]");
    // Should have called getGenerativeModel twice: pro then flash
    expect(mockGetGenerativeModel).toHaveBeenCalledTimes(2);
    expect(mockGetGenerativeModel.mock.calls[0][0].model).toBe(
      "gemini-3.1-pro-preview",
    );
    expect(mockGetGenerativeModel.mock.calls[1][0].model).toBe(
      "gemini-3-flash-preview",
    );
  });

  it("falls back to flash on 429 rate limit error", async () => {
    (YoutubeTranscript.fetchTranscript as jest.Mock).mockRejectedValue(
      new Error("Transcripts are disabled"),
    );

    mockGenerateContent
      .mockRejectedValueOnce(new Error("[429 Too Many Requests]"))
      .mockResolvedValueOnce({
        response: {
          text: () =>
            "[00:00] Rate limit fallback content long enough to pass check.",
        },
      });

    const result = await fetchVideoContent("test-429");

    expect(result.source).toBe("gemini-audio");
    expect(mockGetGenerativeModel).toHaveBeenCalledTimes(2);
    expect(mockGetGenerativeModel.mock.calls[1][0].model).toBe(
      "gemini-3-flash-preview",
    );
  });

  it("throws when both pro and flash models fail", async () => {
    (YoutubeTranscript.fetchTranscript as jest.Mock).mockRejectedValue(
      new Error("Transcripts are disabled"),
    );

    mockGenerateContent
      .mockRejectedValueOnce(new Error("[503 Service Unavailable]"))
      .mockRejectedValueOnce(new Error("[503 Service Unavailable]"));

    await expect(fetchVideoContent("test-both-fail")).rejects.toThrow(
      "無法取得影片內容",
    );
  });
});
