import {
  parseYouTubeUrl,
  isYouTubeUrl,
  extractVideoId,
  buildVideoUrl,
  getVideoMetadata,
  fetchPlaylistVideoIds,
} from "../youtube-utils";

describe("parseYouTubeUrl", () => {
  it("parses standard watch URL", () => {
    const result = parseYouTubeUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(result).toEqual({ type: "video", videoId: "dQw4w9WgXcQ" });
  });

  it("parses short youtu.be URL", () => {
    const result = parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(result).toEqual({ type: "video", videoId: "dQw4w9WgXcQ" });
  });

  it("parses playlist URL", () => {
    const result = parseYouTubeUrl(
      "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf",
    );
    expect(result).toEqual({
      type: "playlist",
      playlistId: "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf",
    });
  });

  it("parses channel URL", () => {
    const result = parseYouTubeUrl("https://www.youtube.com/@channelname");
    expect(result).toEqual({ type: "channel", channelHandle: "channelname" });
  });

  it("parses video with playlist context", () => {
    const result = parseYouTubeUrl(
      "https://www.youtube.com/watch?v=abc123&list=PLxyz",
    );
    expect(result).toEqual({
      type: "video",
      videoId: "abc123",
      playlistId: "PLxyz",
    });
  });

  it("returns null for non-YouTube URL", () => {
    expect(parseYouTubeUrl("https://vimeo.com/123")).toBeNull();
  });

  it("returns null for invalid URL", () => {
    expect(parseYouTubeUrl("not a url")).toBeNull();
  });
});

describe("isYouTubeUrl", () => {
  it("returns true for youtube.com", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
  });

  it("returns true for youtu.be", () => {
    expect(isYouTubeUrl("https://youtu.be/abc")).toBe(true);
  });

  it("returns false for other domains", () => {
    expect(isYouTubeUrl("https://google.com")).toBe(false);
  });
});

describe("extractVideoId", () => {
  it("extracts from standard URL", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("extracts from short URL", () => {
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for non-video URL", () => {
    expect(
      extractVideoId("https://www.youtube.com/playlist?list=PLxyz"),
    ).toBeNull();
  });
});

describe("buildVideoUrl", () => {
  it("returns correct YouTube URL for a valid video ID", () => {
    expect(buildVideoUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("returns URL with empty v param for empty string", () => {
    expect(buildVideoUrl("")).toBe("https://www.youtube.com/watch?v=");
  });
});

describe("getVideoMetadata", () => {
  const mockMetadata = {
    title: "Test Video",
    author_name: "Test Author",
    thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  };

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns metadata on successful fetch", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockMetadata),
    });

    const result = await getVideoMetadata("dQw4w9WgXcQ");
    expect(result).toEqual(mockMetadata);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&format=json",
      { signal: expect.any(AbortSignal) },
    );
  });

  it("returns null when fetch response is not ok", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await getVideoMetadata("nonexistent");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws a network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    const result = await getVideoMetadata("dQw4w9WgXcQ");
    expect(result).toBeNull();
  });
});

describe("fetchPlaylistVideoIds", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("extracts video IDs from YouTube RSS feed XML", async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry><yt:videoId>vid1</yt:videoId></entry>
  <entry><yt:videoId>vid2</yt:videoId></entry>
  <entry><yt:videoId>vid3</yt:videoId></entry>
</feed>`;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockXml),
    });

    const ids = await fetchPlaylistVideoIds("PLtest123");
    expect(ids).toEqual(["vid1", "vid2", "vid3"]);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://www.youtube.com/feeds/videos.xml?playlist_id=PLtest123",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns empty array when RSS feed has no entries", async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
</feed>`;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockXml),
    });

    const ids = await fetchPlaylistVideoIds("PLempty");
    expect(ids).toEqual([]);
  });

  it("returns empty array when fetch fails", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const ids = await fetchPlaylistVideoIds("PLnotfound");
    expect(ids).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    const ids = await fetchPlaylistVideoIds("PLerror");
    expect(ids).toEqual([]);
  });
});
