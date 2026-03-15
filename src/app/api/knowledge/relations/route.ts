import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { embed, generateText } from 'ai'
import { getEmbeddingModel, getProvider, EMBEDDING_PROVIDER_OPTIONS } from '@/lib/ai/providers'

/**
 * POST /api/knowledge/relations
 * AI 自動推導文件關係：基於向量相似度 + Gemini 判斷關係類型
 */
export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { documentId } = await req.json() as { documentId: string }

    if (!documentId) {
        return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
    }

    // 1. Get the target document info
    const { data: doc, error: docError } = await supabase
        .from('documents')
        .select('id, title, summary, content')
        .eq('id', documentId)
        .eq('user_id', user.id)
        .single()

    if (docError || !doc) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // 2. Get all other user documents for comparison
    const { data: otherDocs } = await supabase
        .from('documents')
        .select('id, title, summary')
        .eq('user_id', user.id)
        .eq('enabled', true)
        .neq('id', documentId)

    if (!otherDocs || otherDocs.length === 0) {
        return NextResponse.json({ success: true, data: { relationsCount: 0 } })
    }

    // 3. Generate embedding for this document's summary/title for quick comparison
    const queryText = `${doc.title} ${doc.summary ?? doc.content?.slice(0, 500) ?? ''}`
    const embeddingModel = getEmbeddingModel()
    const { embedding: queryEmbedding } = await embed({
        model: embeddingModel,
        value: queryText,
        providerOptions: EMBEDDING_PROVIDER_OPTIONS,
    })

    // 4. Use match_documents to find similar chunks across all user documents
    const { data: matches, error: matchError } = await supabase.rpc('match_documents', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: 0.65,
        match_count: 30,
        p_user_id: user.id,
    })

    if (matchError) {
        return NextResponse.json({ error: matchError.message }, { status: 500 })
    }

    // 5. Aggregate by document_id, compute average similarity
    const docSimilarityMap = new Map<string, { totalSim: number; count: number; title: string }>()

    for (const match of matches ?? []) {
        if (match.document_id === documentId) continue // skip self

        const existing = docSimilarityMap.get(match.document_id)
        if (existing) {
            docSimilarityMap.set(match.document_id, {
                ...existing,
                totalSim: existing.totalSim + match.similarity,
                count: existing.count + 1,
            })
        } else {
            const targetDoc = otherDocs.find(d => d.id === match.document_id)
            docSimilarityMap.set(match.document_id, {
                totalSim: match.similarity,
                count: 1,
                title: targetDoc?.title ?? 'Unknown',
            })
        }
    }

    // 6. Filter: only keep docs with avg similarity > 0.7
    const candidates: Array<{ docId: string; avgSim: number; title: string }> = []
    for (const [docId, data] of docSimilarityMap) {
        const avgSim = data.totalSim / data.count
        if (avgSim > 0.7) {
            candidates.push({ docId, avgSim, title: data.title })
        }
    }

    if (candidates.length === 0) {
        return NextResponse.json({ success: true, data: { relationsCount: 0 } })
    }

    // 7. Use Gemini to classify relation types (batch)
    const relations = await classifyRelations(doc.title, candidates)

    // 8. Delete old relations for this document, then insert new ones
    await supabase
        .from('document_relations')
        .delete()
        .eq('source_document_id', documentId)

    let insertedCount = 0
    for (const rel of relations) {
        const { error: insertError } = await supabase
            .from('document_relations')
            .insert({
                source_document_id: documentId,
                target_document_id: rel.docId,
                relation_type: rel.relationType,
                strength: rel.strength,
            })

        if (!insertError) {
            insertedCount++
        }
    }

    return NextResponse.json({
        success: true,
        data: { relationsCount: insertedCount },
    })
}

interface Candidate {
    docId: string
    avgSim: number
    title: string
}

interface ClassifiedRelation {
    docId: string
    relationType: string
    strength: number
}

async function classifyRelations(
    sourceTitle: string,
    candidates: Candidate[],
): Promise<ClassifiedRelation[]> {
    // For small number of candidates, use AI to classify
    // For large number, use heuristic
    if (candidates.length > 10) {
        // Heuristic: just use similarity-based type
        return candidates.slice(0, 10).map(c => ({
            docId: c.docId,
            relationType: c.avgSim > 0.85 ? '高度相關' : '相關',
            strength: Math.round(c.avgSim * 100) / 100,
        }))
    }

    const candidateList = candidates
        .map((c, i) => `${i + 1}. 「${c.title}」（相似度 ${(c.avgSim * 100).toFixed(0)}%）`)
        .join('\n')

    try {
        const model = getProvider('gemini-flash')
        const { text } = await generateText({
            model,
            experimental_telemetry: {
              isEnabled: true,
              functionId: 'knowledge-relations',
              metadata: { feature: 'knowledge-relations' },
            },
            prompt: `你是知識管理專家。請分析以下文件之間的關係類型。

來源文件：「${sourceTitle}」

候選相關文件：
${candidateList}

請為每個候選文件判斷與來源文件的關係類型，只能從以下四種選擇：
- 相關（主題相近）
- 引用（被來源文件引用或參考）
- 補充（提供額外的細節或延伸）
- 對比（觀點或方法不同）

請用以下 JSON 格式回覆（不要加任何說明文字）：
[{"index": 1, "type": "相關"}, {"index": 2, "type": "補充"}]`,
            temperature: 0.1,
        })

        // Parse response
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (!jsonMatch) {
            return candidates.map(c => ({
                docId: c.docId,
                relationType: '相關',
                strength: Math.round(c.avgSim * 100) / 100,
            }))
        }

        const parsed = JSON.parse(jsonMatch[0]) as Array<{ index: number; type: string }>
        return candidates.map((c, i) => {
            const match = parsed.find(p => p.index === i + 1)
            return {
                docId: c.docId,
                relationType: match?.type ?? '相關',
                strength: Math.round(c.avgSim * 100) / 100,
            }
        })
    } catch {
        // Fallback: use similarity-based type
        return candidates.map(c => ({
            docId: c.docId,
            relationType: '相關',
            strength: Math.round(c.avgSim * 100) / 100,
        }))
    }
}
