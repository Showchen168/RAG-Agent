export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_model: AIModel;
  system_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  user_id: string;
  title: string;
  content: string;
  summary: string | null;
  tags: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentEmbedding {
  id: string;
  document_id: string;
  chunk_text: string;
  chunk_index: number;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  model: AIModel;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export interface MatchResult {
  id: string;
  document_id: string;
  chunk_text: string;
  similarity: number;
}

export type AIModel = "gemini-flash" | "gemini-pro" | "gemini-flash-lite";

