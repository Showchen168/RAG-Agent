jest.mock("@ai-sdk/google", () => {
  const mockModel = { modelId: "gemini-3-flash-preview" };
  const mockProvider = jest.fn(() => mockModel);
  return {
    google: {
      textEmbeddingModel: jest.fn(() => ({ modelId: "gemini-embedding-2-preview" })),
    },
    createGoogleGenerativeAI: jest.fn(() => mockProvider),
  };
});

import {
  getProvider,
  getEmbeddingModel,
  EMBEDDING_PROVIDER_OPTIONS,
} from "../providers";

describe("providers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GOOGLE_GENERATIVE_AI_API_KEY: "test-key-123",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe("getProvider", () => {
    it("should return a provider for gemini-flash", () => {
      const model = getProvider("gemini-flash");
      expect(model).toBeDefined();
    });

    it("should throw error when API key is not set", () => {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      expect(() => getProvider("gemini-flash")).toThrow(
        "GOOGLE_GENERATIVE_AI_API_KEY 環境變數未設定",
      );
    });

    it("should call createGoogleGenerativeAI with the API key", () => {
      const { createGoogleGenerativeAI } = require("@ai-sdk/google");
      getProvider("gemini-flash");
      expect(createGoogleGenerativeAI).toHaveBeenCalledWith({
        apiKey: "test-key-123",
      });
    });
  });

  describe("getEmbeddingModel", () => {
    it("should return an embedding model", () => {
      const model = getEmbeddingModel();
      expect(model).toBeDefined();
    });
  });

  describe("EMBEDDING_PROVIDER_OPTIONS", () => {
    it("should have correct dimensionality", () => {
      expect(EMBEDDING_PROVIDER_OPTIONS.google.outputDimensionality).toBe(3072);
    });
  });
});
