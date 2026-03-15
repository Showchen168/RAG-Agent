import {
    buildTagColorMap,
    getNodeColor,
    transformToCytoscapeElements,
    filterTimelineData,
    TAG_COLORS,
    DEFAULT_DOC_COLOR,
    DEFAULT_TAG_COLOR,
    type GraphData,
    type GraphNode,
} from '../cytoscape-helpers'

// ─── Test Data Fixtures ───

function makeTagNode(label: string): GraphNode {
    return { id: `tag-${label}`, label, type: 'tag', val: 5 }
}

function makeDocNode(id: string, label: string, tags: string[] = []): GraphNode {
    return { id, label, type: 'document', val: 5, tags, summary: null, created_at: null }
}

function makeGraphData(): GraphData {
    return {
        nodes: [
            makeTagNode('AI'),
            makeTagNode('DevOps'),
            makeDocNode('doc-1', 'GPT Paper', ['AI']),
            makeDocNode('doc-2', 'Kubernetes Guide', ['DevOps']),
            makeDocNode('doc-3', 'MLOps Tutorial', ['AI', 'DevOps']),
            makeDocNode('doc-4', 'Orphan Doc'),
        ],
        links: [
            { source: 'tag-AI', target: 'doc-1', value: 1 },
            { source: 'tag-AI', target: 'doc-3', value: 1 },
            { source: 'tag-DevOps', target: 'doc-2', value: 1 },
            { source: 'tag-DevOps', target: 'doc-3', value: 1 },
            { source: 'doc-1', target: 'doc-3', value: 0.8, relationType: '引用' },
        ],
    }
}

// ─── Tests ───

describe('buildTagColorMap', () => {
    it('assigns unique colors to each tag', () => {
        const data = makeGraphData()
        const map = buildTagColorMap(data.nodes)

        expect(map.size).toBe(2)
        expect(map.has('AI')).toBe(true)
        expect(map.has('DevOps')).toBe(true)
        expect(map.get('AI')).not.toBe(map.get('DevOps'))
    })

    it('cycles colors when tags exceed palette size', () => {
        const nodes = Array.from({ length: TAG_COLORS.length + 1 }, (_, i) =>
            makeTagNode(`Tag${i}`)
        )
        const map = buildTagColorMap(nodes)

        expect(map.size).toBe(TAG_COLORS.length + 1)
        // First and (length+1)th should share same color (cycled)
        expect(map.get('Tag0')).toBe(map.get(`Tag${TAG_COLORS.length}`))
    })

    it('ignores document nodes', () => {
        const nodes = [makeDocNode('d1', 'Doc'), makeTagNode('AI')]
        const map = buildTagColorMap(nodes)
        expect(map.size).toBe(1)
    })
})

describe('getNodeColor', () => {
    it('returns tag color for tag nodes', () => {
        const map = new Map([['AI', '#3b82f6']])
        const node = makeTagNode('AI')
        expect(getNodeColor(node, map)).toBe('#3b82f6')
    })

    it('returns default tag color for unknown tags', () => {
        const map = new Map<string, string>()
        const node = makeTagNode('Unknown')
        expect(getNodeColor(node, map)).toBe(DEFAULT_TAG_COLOR)
    })

    it('returns first tag color for document nodes', () => {
        const map = new Map([['AI', '#3b82f6'], ['DevOps', '#ef4444']])
        const node = makeDocNode('d1', 'Doc', ['AI', 'DevOps'])
        expect(getNodeColor(node, map)).toBe('#3b82f6')
    })

    it('returns default doc color for documents with no tags', () => {
        const map = new Map<string, string>()
        const node = makeDocNode('d1', 'Doc')
        expect(getNodeColor(node, map)).toBe(DEFAULT_DOC_COLOR)
    })
})

describe('transformToCytoscapeElements', () => {
    it('creates compound parent nodes for tags', () => {
        const data = makeGraphData()
        const tagColorMap = buildTagColorMap(data.nodes)
        const elements = transformToCytoscapeElements(data, tagColorMap)

        const tagElements = elements.filter(e => e.data.type === 'tag')
        expect(tagElements).toHaveLength(2)
        expect(tagElements.map(e => e.data.label).sort()).toEqual(['AI', 'DevOps'])
        expect(tagElements.every(e => e.classes?.toString().includes('tag-group'))).toBe(true)
    })

    it('assigns documents to their primary tag as parent', () => {
        const data = makeGraphData()
        const tagColorMap = buildTagColorMap(data.nodes)
        const elements = transformToCytoscapeElements(data, tagColorMap)

        const doc1 = elements.find(e => e.data.id === 'doc-1')
        expect(doc1?.data.parent).toBe('tag-AI')

        const doc2 = elements.find(e => e.data.id === 'doc-2')
        expect(doc2?.data.parent).toBe('tag-DevOps')
    })

    it('assigns multi-tag documents to their first linked tag', () => {
        const data = makeGraphData()
        const tagColorMap = buildTagColorMap(data.nodes)
        const elements = transformToCytoscapeElements(data, tagColorMap)

        // doc-3 (MLOps) is linked to AI first in the links array
        const doc3 = elements.find(e => e.data.id === 'doc-3')
        expect(doc3?.data.parent).toBe('tag-AI')
    })

    it('orphan documents have no parent', () => {
        const data = makeGraphData()
        const tagColorMap = buildTagColorMap(data.nodes)
        const elements = transformToCytoscapeElements(data, tagColorMap)

        const doc4 = elements.find(e => e.data.id === 'doc-4')
        expect(doc4?.data.parent).toBeUndefined()
    })

    it('skips primary tag→doc edges (parent-child relationship)', () => {
        const data = makeGraphData()
        const tagColorMap = buildTagColorMap(data.nodes)
        const elements = transformToCytoscapeElements(data, tagColorMap)

        const edges = elements.filter(e => e.data.source && e.data.target)
        // tag-AI → doc-1 (primary, skipped)
        // tag-AI → doc-3 (primary, skipped)
        // tag-DevOps → doc-2 (primary, skipped)
        // tag-DevOps → doc-3 (secondary, kept as edge)
        // doc-1 → doc-3 (doc-doc, kept)
        expect(edges).toHaveLength(2)
    })

    it('keeps secondary tag→doc edges', () => {
        const data = makeGraphData()
        const tagColorMap = buildTagColorMap(data.nodes)
        const elements = transformToCytoscapeElements(data, tagColorMap)

        const edges = elements.filter(e => e.data.source && e.data.target)
        const secondaryTagEdge = edges.find(
            e => e.data.source === 'tag-DevOps' && e.data.target === 'doc-3'
        )
        expect(secondaryTagEdge).toBeDefined()
    })

    it('preserves doc-to-doc edges with relation types', () => {
        const data = makeGraphData()
        const tagColorMap = buildTagColorMap(data.nodes)
        const elements = transformToCytoscapeElements(data, tagColorMap)

        const docEdge = elements.find(
            e => e.data.source === 'doc-1' && e.data.target === 'doc-3'
        )
        expect(docEdge).toBeDefined()
        expect(docEdge?.data.relationType).toBe('引用')
    })

    it('hides children of collapsed tags', () => {
        const data = makeGraphData()
        const tagColorMap = buildTagColorMap(data.nodes)
        const collapsed = new Set(['AI'])
        const elements = transformToCytoscapeElements(data, tagColorMap, collapsed)

        const doc1 = elements.find(e => e.data.id === 'doc-1')
        expect(doc1?.classes?.toString()).toContain('hidden')

        // doc-3 is primarily under AI, so it should also be hidden
        const doc3 = elements.find(e => e.data.id === 'doc-3')
        expect(doc3?.classes?.toString()).toContain('hidden')
    })

    it('marks collapsed tag nodes with collapsed class', () => {
        const data = makeGraphData()
        const tagColorMap = buildTagColorMap(data.nodes)
        const collapsed = new Set(['AI'])
        const elements = transformToCytoscapeElements(data, tagColorMap, collapsed)

        const aiTag = elements.find(e => e.data.id === 'tag-AI')
        expect(aiTag?.classes?.toString()).toContain('collapsed')

        const devopsTag = elements.find(e => e.data.id === 'tag-DevOps')
        expect(devopsTag?.classes?.toString()).not.toContain('collapsed')
    })

    it('hides edges connected to collapsed children', () => {
        const data = makeGraphData()
        const tagColorMap = buildTagColorMap(data.nodes)
        const collapsed = new Set(['AI'])
        const elements = transformToCytoscapeElements(data, tagColorMap, collapsed)

        const edges = elements.filter(e => e.data.source && e.data.target)
        // doc-1 and doc-3 are hidden (under collapsed AI)
        // doc-1→doc-3 edge should be hidden
        // tag-DevOps→doc-3 edge should be hidden (doc-3 is hidden)
        expect(edges).toHaveLength(0)
    })
})

describe('filterTimelineData', () => {
    it('keeps only tag→doc links for acyclic layout', () => {
        const data = makeGraphData()
        const filtered = filterTimelineData(data)

        expect(filtered.nodes).toHaveLength(data.nodes.length) // nodes unchanged
        expect(filtered.links.every(l => l.source.startsWith('tag-'))).toBe(true)
        expect(filtered.links).toHaveLength(4) // 4 tag→doc links
    })

    it('removes doc→doc links', () => {
        const data = makeGraphData()
        const filtered = filterTimelineData(data)

        const docToDoc = filtered.links.filter(
            l => !l.source.startsWith('tag-')
        )
        expect(docToDoc).toHaveLength(0)
    })
})
