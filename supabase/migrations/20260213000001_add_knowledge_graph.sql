-- Add metadata column to document_embeddings for page numbers and bounding boxes
ALTER TABLE document_embeddings 
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Create document_relations table for Knowledge Graph
CREATE TABLE IF NOT EXISTS document_relations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    source_document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
    target_document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
    relation_type text NOT NULL, -- e.g., 'cites', 'related', 'mentions'
    strength float DEFAULT 1.0, -- Connection strength (0.0 to 1.0)
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    
    -- Prevent self-reference loops if needed, though sometimes documents reference themselves in sections
    CONSTRAINT no_self_reference CHECK (source_document_id != target_document_id),
    -- Ensure unique directional relationship
    UNIQUE(source_document_id, target_document_id, relation_type)
);

-- Index for faster graph traversal
CREATE INDEX IF NOT EXISTS idx_document_relations_source ON document_relations(source_document_id);
CREATE INDEX IF NOT EXISTS idx_document_relations_target ON document_relations(target_document_id);

-- Enable RLS
ALTER TABLE document_relations ENABLE ROW LEVEL SECURITY;

-- Policies for document_relations
-- Users can see relations involving documents they own
CREATE POLICY "Users can view their own document relations" ON document_relations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM documents d 
            WHERE d.id = document_relations.source_document_id 
            AND d.user_id = auth.uid()
        ) OR 
        EXISTS (
            SELECT 1 FROM documents d 
            WHERE d.id = document_relations.target_document_id 
            AND d.user_id = auth.uid()
        )
    );

-- Users can insert relations if they own the source document
CREATE POLICY "Users can insert relations for their documents" ON document_relations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM documents d 
            WHERE d.id = document_relations.source_document_id 
            AND d.user_id = auth.uid()
        )
    );

-- Users can delete relations if they own the source document
CREATE POLICY "Users can delete relations for their documents" ON document_relations
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM documents d 
            WHERE d.id = document_relations.source_document_id 
            AND d.user_id = auth.uid()
        )
    );
