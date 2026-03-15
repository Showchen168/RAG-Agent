-- Extend knowledge_sources source_type CHECK constraint to include 'youtube'
ALTER TABLE knowledge_sources DROP CONSTRAINT IF EXISTS knowledge_sources_source_type_check;
ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_source_type_check
  CHECK (source_type IN ('url', 'rss', 'sitemap', 'youtube'));

COMMENT ON TABLE knowledge_sources IS 'YouTube sources store channel_handle, last_video_ids in metadata JSONB column';
