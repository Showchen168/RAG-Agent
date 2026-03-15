/**
 * Cytoscape.js helper functions for knowledge graph.
 * Pure functions for data transformation, styling, and graph algorithms.
 */
import type { ElementDefinition } from "cytoscape";

// ─── Types ───

export interface CytoscapeStyleRule {
  selector: string;
  style: Record<string, unknown>;
}

export interface GraphNode {
  id: string;
  label: string;
  type: "document" | "tag";
  val: number;
  color?: string;
  summary?: string | null;
  created_at?: string | null;
  tags?: string[];
  contentLength?: number;
  level?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  value: number;
  relationType?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ─── Constants ───

export const TAG_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

export const DEFAULT_DOC_COLOR = "#64748b";
export const DEFAULT_TAG_COLOR = "#a78bfa";
export const HIGHLIGHT_COLOR = "#f59e0b";
export const SEARCH_MATCH_COLOR = "#f59e0b";
export const PATH_COLOR = "#ef4444";

// ─── Color Helpers ───

export function buildTagColorMap(nodes: GraphNode[]): Map<string, string> {
  const tagColorMap = new Map<string, string>();
  let colorIndex = 0;
  for (const node of nodes) {
    if (node.type === "tag" && !tagColorMap.has(node.label)) {
      tagColorMap.set(node.label, TAG_COLORS[colorIndex % TAG_COLORS.length]);
      colorIndex++;
    }
  }
  return tagColorMap;
}

export function getNodeColor(
  node: GraphNode,
  tagColorMap: Map<string, string>,
): string {
  if (node.type === "tag") {
    return tagColorMap.get(node.label) ?? DEFAULT_TAG_COLOR;
  }
  const firstTag = node.tags?.[0];
  if (firstTag && tagColorMap.has(firstTag)) {
    return tagColorMap.get(firstTag)!;
  }
  return DEFAULT_DOC_COLOR;
}

// ─── Data Transformation ───

/**
 * Transform GraphData (from API) into Cytoscape ElementDefinition[].
 * Tags become compound parent nodes; documents become children of their first tag.
 */
export function transformToCytoscapeElements(
  data: GraphData,
  tagColorMap: Map<string, string>,
  collapsedTags: Set<string> = new Set(),
): ElementDefinition[] {
  const elements: ElementDefinition[] = [];

  // Build O(1) lookup index
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const tagNodeIds = new Set(
    data.nodes.filter((n) => n.type === "tag").map((n) => n.id),
  );

  // Build a map: tag label → tag node id
  const tagLabelToId = new Map<string, string>();
  for (const node of data.nodes) {
    if (node.type === "tag") {
      tagLabelToId.set(node.label, node.id);
    }
  }

  // Build a set of tag-to-doc links to determine primary parent
  const docPrimaryTag = new Map<string, string>();
  for (const link of data.links) {
    if (tagNodeIds.has(link.source) && !docPrimaryTag.has(link.target)) {
      const tagNode = nodeById.get(link.source);
      if (tagNode) {
        docPrimaryTag.set(link.target, tagNode.label);
      }
    }
  }

  // Add tag nodes (compound parents)
  for (const node of data.nodes) {
    if (node.type === "tag") {
      const color = tagColorMap.get(node.label) ?? DEFAULT_TAG_COLOR;
      const isCollapsed = collapsedTags.has(node.label);
      elements.push({
        data: {
          id: node.id,
          label: node.label,
          type: "tag",
          color,
          collapsed: isCollapsed,
        },
        classes: isCollapsed ? "tag-group collapsed" : "tag-group",
      });
    }
  }

  // Add document nodes (children of their primary tag)
  for (const node of data.nodes) {
    if (node.type === "document") {
      const primaryTagLabel = docPrimaryTag.get(node.id);
      const parentId = primaryTagLabel
        ? tagLabelToId.get(primaryTagLabel)
        : undefined;
      const color = getNodeColor(node, tagColorMap);
      const isHidden = primaryTagLabel
        ? collapsedTags.has(primaryTagLabel)
        : false;

      elements.push({
        data: {
          id: node.id,
          label: node.label,
          type: "document",
          parent: parentId,
          color,
          summary: node.summary,
          created_at: node.created_at,
          tags: node.tags,
          contentLength: node.contentLength,
          val: node.val,
        },
        classes: isHidden ? "document hidden" : "document",
      });
    }
  }

  // Add edges (skip tag→doc links that are now represented by parent-child)
  for (const link of data.links) {
    const isTagToDoc = tagNodeIds.has(link.source);
    // For tag→doc links: only add if the doc is NOT a child of this tag
    if (isTagToDoc) {
      const tagNode = nodeById.get(link.source);
      if (tagNode) {
        const isPrimaryLink = docPrimaryTag.get(link.target) === tagNode.label;
        if (isPrimaryLink) {
          continue;
        }
      }
    }

    // Check if both endpoints are visible (O(1) via nodeById)
    if (
      isNodeHidden(link.source, nodeById, collapsedTags, docPrimaryTag) ||
      isNodeHidden(link.target, nodeById, collapsedTags, docPrimaryTag)
    ) {
      continue;
    }

    // Sanitize relationType for CSS class safety
    const safeRelClass = link.relationType
      ? `rel-${sanitizeCssClass(link.relationType)}`
      : undefined;

    elements.push({
      data: {
        id: `edge-${link.source}-${link.target}`,
        source: link.source,
        target: link.target,
        value: link.value,
        relationType: link.relationType,
      },
      classes: safeRelClass,
    });
  }

  return elements;
}

function isNodeHidden(
  nodeId: string,
  nodeById: Map<string, GraphNode>,
  collapsedTags: Set<string>,
  docPrimaryTag: Map<string, string>,
): boolean {
  const node = nodeById.get(nodeId);
  if (!node) return true;
  if (node.type === "tag") return false;
  const primaryTag = docPrimaryTag.get(nodeId);
  return primaryTag ? collapsedTags.has(primaryTag) : false;
}

/** Strip non-alphanumeric chars to prevent CSS class injection */
function sanitizeCssClass(value: string): string {
  return value.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, "");
}

// ─── Cytoscape Stylesheet ───

export function buildCytoscapeStylesheet(
  isDark: boolean,
): CytoscapeStyleRule[] {
  const textColor = isDark ? "#e5e7eb" : "#374151";
  const edgeColor = isDark
    ? "rgba(156,163,175,0.25)"
    : "rgba(156,163,175,0.35)";
  const labelBg = isDark ? "rgba(17,24,39,0.85)" : "rgba(255,255,255,0.85)";

  return [
    // Compound (tag) nodes
    {
      selector: "node.tag-group",
      style: {
        shape: "round-rectangle",
        "background-color": "data(color)",
        "background-opacity": isDark ? 0.15 : 0.08,
        "border-color": "data(color)",
        "border-width": 2,
        "border-opacity": 0.5,
        label: "data(label)",
        "font-size": 14,
        "font-weight": "bold",
        color: "data(color)",
        "text-valign": "top",
        "text-halign": "center",
        "text-margin-y": -8,
        padding: "20px",
        "min-width": "80px",
        "min-height": "60px",
      },
    },
    // Collapsed tag groups
    {
      selector: "node.tag-group.collapsed",
      style: {
        "background-opacity": isDark ? 0.3 : 0.15,
        "border-width": 3,
        "border-style": "dashed",
        "min-width": "40px",
        "min-height": "30px",
        padding: "10px",
      },
    },
    // Document nodes
    {
      selector: "node.document",
      style: {
        shape: "ellipse",
        "background-color": "data(color)",
        width: "mapData(val, 3, 20, 25, 55)",
        height: "mapData(val, 3, 20, 25, 55)",
        label: "data(label)",
        "font-size": 11,
        color: textColor,
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 5,
        "text-max-width": "100px",
        "text-wrap": "ellipsis",
        "text-background-color": labelBg,
        "text-background-opacity": 0.85,
        "text-background-padding": "2px",
        "text-background-shape": "roundrectangle",
      },
    },
    // Hidden nodes (collapsed children)
    {
      selector: "node.hidden",
      style: {
        display: "none",
      },
    },
    // Edges
    {
      selector: "edge",
      style: {
        width: "mapData(value, 0, 1, 1, 4)",
        "line-color": edgeColor,
        "curve-style": "bezier",
        "target-arrow-shape": "none",
        opacity: 0.7,
      },
    },
    // Edge with relation type label
    {
      selector: "edge[relationType]",
      style: {
        label: "data(relationType)",
        "font-size": 9,
        color: isDark ? "#9ca3af" : "#6b7280",
        "text-background-color": labelBg,
        "text-background-opacity": 0.9,
        "text-background-padding": "2px",
        "text-background-shape": "roundrectangle",
        "text-rotation": "autorotate",
      },
    },
    // Highlighted (hover) nodes
    {
      selector: "node.highlighted",
      style: {
        "border-color": HIGHLIGHT_COLOR,
        "border-width": 3,
        "z-index": 10,
      },
    },
    // Highlighted edges
    {
      selector: "edge.highlighted",
      style: {
        "line-color": "#3b82f6",
        width: 3,
        opacity: 1,
        "z-index": 10,
      },
    },
    // Dimmed (non-highlighted when hovering)
    {
      selector: ".dimmed",
      style: {
        opacity: 0.15,
      },
    },
    // Search match
    {
      selector: "node.search-match",
      style: {
        "border-color": SEARCH_MATCH_COLOR,
        "border-width": 4,
        "z-index": 20,
        "overlay-color": SEARCH_MATCH_COLOR,
        "overlay-opacity": 0.15,
        "overlay-padding": 6,
      },
    },
    // Path nodes
    {
      selector: "node.path-node",
      style: {
        "border-color": PATH_COLOR,
        "border-width": 4,
        "z-index": 20,
        "overlay-color": PATH_COLOR,
        "overlay-opacity": 0.12,
        "overlay-padding": 8,
      },
    },
    // Path edges
    {
      selector: "edge.path-edge",
      style: {
        "line-color": PATH_COLOR,
        width: 4,
        opacity: 1,
        "z-index": 20,
        "target-arrow-color": PATH_COLOR,
        "target-arrow-shape": "triangle",
      },
    },
  ];
}

// ─── Layout Configs ───

export function getCoseLayout(animate: boolean = true) {
  return {
    name: "cose-bilkent",
    animate: animate ? "end" : false,
    animationDuration: 800,
    quality: "default",
    nodeDimensionsIncludeLabels: true,
    nodeRepulsion: 8000,
    idealEdgeLength: 120,
    edgeElasticity: 0.45,
    nestingFactor: 0.1,
    gravity: 0.25,
    gravityRange: 3.8,
    numIter: 2500,
    tile: true,
    tilingPaddingVertical: 20,
    tilingPaddingHorizontal: 20,
    fit: true,
    padding: 50,
  };
}

export function getDagreLayout(direction: "TB" | "LR" = "LR") {
  return {
    name: "dagre",
    rankDir: direction,
    nodeSep: 50,
    rankSep: 150,
    edgeSep: 10,
    animate: true,
    animationDuration: 600,
    fit: true,
    padding: 50,
  };
}

// ─── Timeline data filter ───

export function filterTimelineData(data: GraphData): GraphData {
  // In timeline mode, only keep tag→doc links (acyclic for dagre)
  const tagNodeIds = new Set(
    data.nodes.filter((n) => n.type === "tag").map((n) => n.id),
  );
  const filteredLinks = data.links.filter((l) => tagNodeIds.has(l.source));
  return { nodes: data.nodes, links: filteredLinks };
}
