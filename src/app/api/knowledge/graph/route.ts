import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface GraphNode {
    id: string
    label: string
    type: 'document' | 'tag'
    val: number
    color?: string
    summary?: string | null
    created_at?: string | null
    tags?: string[]
    contentLength?: number
    level?: number
}

interface GraphLink {
    source: string
    target: string
    value: number
    relationType?: string
}

export async function GET(req: Request) {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 若 source=lightrag，從 LightRAG 取實體級圖
    const url = new URL(req.url)
    const source = url.searchParams.get('source')
    if (source === 'lightrag') {
        return getLightRAGGraphResponse(user.id)
    }

    // 1. Fetch documents with extended fields
    const { data: docs, error: docError } = await supabase
        .from('documents')
        .select('id, title, tags, summary, content, created_at')
        .eq('user_id', user.id)
        .eq('enabled', true)
        .order('created_at', { ascending: true })

    if (docError) {
        return NextResponse.json({ error: docError.message }, { status: 500 })
    }

    const nodes: GraphNode[] = []
    const links: GraphLink[] = []
    const tagMap = new Map<string, string[]>() // tag -> docIds
    const docDegree = new Map<string, number>() // docId -> link count

    // 2. Build nodes from documents
    docs?.forEach((doc, index) => {
        nodes.push({
            id: doc.id,
            label: doc.title,
            type: 'document',
            val: 5, // will be recalculated after links
            summary: doc.summary,
            created_at: doc.created_at,
            tags: doc.tags ?? [],
            contentLength: doc.content?.length ?? 0,
            level: index, // chronological order for timeline mode
        })
        docDegree.set(doc.id, 0)

        // Group by tags
        doc.tags?.forEach((tag: string) => {
            if (!tagMap.has(tag)) {
                tagMap.set(tag, [])
            }

            const tagNodeId = `tag-${tag}`
            if (!nodes.find(n => n.id === tagNodeId)) {
                nodes.push({
                    id: tagNodeId,
                    label: tag,
                    type: 'tag',
                    val: 3, // will be recalculated
                })
            }

            links.push({
                source: tagNodeId,
                target: doc.id,
                value: 0.5,
            })

            tagMap.get(tag)!.push(doc.id)
            docDegree.set(doc.id, (docDegree.get(doc.id) ?? 0) + 1)
        })
    })

    // 3. Fetch explicit relations
    const { data: relations } = await supabase
        .from('document_relations')
        .select('source_document_id, target_document_id, relation_type, strength')

    relations?.forEach(rel => {
        links.push({
            source: rel.source_document_id,
            target: rel.target_document_id,
            value: rel.strength ?? 0.5,
            relationType: rel.relation_type,
        })
        docDegree.set(rel.source_document_id, (docDegree.get(rel.source_document_id) ?? 0) + 1)
        docDegree.set(rel.target_document_id, (docDegree.get(rel.target_document_id) ?? 0) + 1)
    })

    // 4. Recalculate node sizes based on degree
    for (const node of nodes) {
        if (node.type === 'document') {
            const degree = docDegree.get(node.id) ?? 0
            node.val = Math.min(15, 3 + degree * 1.5)
        } else if (node.type === 'tag') {
            const tagName = node.label
            const docCount = tagMap.get(tagName)?.length ?? 0
            node.val = 2 + docCount
        }
    }

    return NextResponse.json({ nodes, links })
}

async function getLightRAGGraphResponse(userId: string) {
    try {
        const { getLightRAGGraph } = await import('@/lib/rag/lightrag-client')
        const result = await getLightRAGGraph(userId)

        if (!result.success) {
            return NextResponse.json({ nodes: [], links: [], error: result.error })
        }

        const nodes: GraphNode[] = result.nodes.map((n) => ({
            id: n.id,
            label: n.label,
            type: 'document' as const,
            val: 5,
            summary: n.description,
        }))

        const links: GraphLink[] = result.edges.map((e) => ({
            source: e.source,
            target: e.target,
            value: e.weight,
            relationType: e.relation,
        }))

        return NextResponse.json({ nodes, links, source: 'lightrag' })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ nodes: [], links: [], error: msg })
    }
}
