-- 專業報告表：儲存對話中產生的報告，可在知識庫查看並用 Canvas 編輯
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '未命名報告',
  markdown_content TEXT NOT NULL DEFAULT '',
  canvas_content JSONB NOT NULL DEFAULT '{}',
  plain_text TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports"
  ON reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reports"
  ON reports FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reports"
  ON reports FOR DELETE
  USING (auth.uid() = user_id);

-- 索引
CREATE INDEX idx_reports_user_id ON reports(user_id);
CREATE INDEX idx_reports_updated_at ON reports(updated_at DESC);
CREATE INDEX idx_reports_conversation_id ON reports(conversation_id);
