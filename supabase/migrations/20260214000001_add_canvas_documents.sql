-- Canvas 文件表：儲存編輯器內容
CREATE TABLE IF NOT EXISTS canvas_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '未命名文件',
  content JSONB NOT NULL DEFAULT '{}',
  plain_text TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE canvas_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own canvas documents"
  ON canvas_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own canvas documents"
  ON canvas_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own canvas documents"
  ON canvas_documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own canvas documents"
  ON canvas_documents FOR DELETE
  USING (auth.uid() = user_id);

-- 索引
CREATE INDEX idx_canvas_documents_user_id ON canvas_documents(user_id);
CREATE INDEX idx_canvas_documents_updated_at ON canvas_documents(updated_at DESC);
