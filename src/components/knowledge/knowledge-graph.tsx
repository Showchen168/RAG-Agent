"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Loader2,
  ExternalLink,
  X,
  Search,
  ChevronRight,
  Clock,
  Waypoints,
} from "lucide-react";
import type cytoscape from "cytoscape";

import {
  type GraphData,
  type GraphNode,
  buildTagColorMap,
  transformToCytoscapeElements,
  buildCytoscapeStylesheet,
  getCoseLayout,
  getDagreLayout,
  filterTimelineData,
} from "./cytoscape-helpers";

// ─── Types ───

interface ContextMenu {
  x: number;
  y: number;
  node: GraphNode;
}

// ─── Cytoscape lazy init (browser only, Promise singleton) ───

let initPromise: Promise<void> | null = null;

function initCytoscape(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      const cy = (await import("cytoscape")).default;
      const coseBilkent = (await import("cytoscape-cose-bilkent")).default;
      const dagre = (await import("cytoscape-dagre")).default;
      cy.use(coseBilkent);
      cy.use(dagre);
    })();
  }
  return initPromise;
}

// ─── Component ───

export function KnowledgeGraph() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const layoutRef = useRef<cytoscape.Layouts | null>(null);

  // Data
  const [rawData, setRawData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Interaction
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [, setHoverNodeId] = useState<string | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Set<string>>(new Set());

  // Collapse
  const [collapsedTags, setCollapsedTags] = useState<Set<string>>(new Set());

  // Layout mode
  const [layoutMode, setLayoutMode] = useState<"force" | "timeline">("force");

  // Path exploration (use ref for pathStart to avoid stale closures)
  const [pathMode, setPathMode] = useState(false);
  const [pathStart, setPathStart] = useState<string | null>(null);
  const pathStartRef = useRef<string | null>(null);
  useEffect(() => {
    pathStartRef.current = pathStart;
  }, [pathStart]);

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  // Cytoscape ready flag
  const [cyReady, setCyReady] = useState(false);

  // Tag color mapping
  const tagColorMap = useMemo(
    () => buildTagColorMap(rawData.nodes),
    [rawData.nodes],
  );

  // ─── Data fetch ───

  useEffect(() => {
    fetch("/api/knowledge/graph")
      .then((res) => res.json())
      .then((graphData) => {
        if (graphData.error) throw new Error(graphData.error);
        const normalized: GraphData = {
          nodes: graphData.nodes,
          links: graphData.links.map(
            (l: {
              source: string | { id: string };
              target: string | { id: string };
              value: number;
              relationType?: string;
            }) => ({
              source: typeof l.source === "object" ? l.source.id : l.source,
              target: typeof l.target === "object" ? l.target.id : l.target,
              value: l.value,
              relationType: l.relationType,
            }),
          ),
        };
        setRawData(normalized);
      })
      .catch(() => setError("無法載入知識圖譜資料"))
      .finally(() => setLoading(false));
  }, []);

  // ─── Initialize Cytoscape ───

  useEffect(() => {
    if (loading || !containerRef.current) return;
    let destroyed = false;

    async function setup() {
      await initCytoscape();
      if (destroyed || !containerRef.current) return;

      const cytoscapeModule = await import("cytoscape");
      if (destroyed || !containerRef.current) return;

      const cy = cytoscapeModule.default({
        container: containerRef.current,
        elements: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Cytoscape stylesheet types are incomplete
        style: buildCytoscapeStylesheet(isDark) as any,
        layout: { name: "preset" },
        minZoom: 0.1,
        maxZoom: 5,
        wheelSensitivity: 0.3,
      });

      cyRef.current = cy;
      setCyReady(true);
    }

    setup();

    return () => {
      destroyed = true;
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
        setCyReady(false);
      }
    };
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Update stylesheet on theme change ───

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Cytoscape stylesheet types are incomplete
    cy.style(buildCytoscapeStylesheet(isDark) as any);
  }, [isDark]);

  // ─── Update elements when data/collapsed changes ───

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady) return;

    const effectiveData =
      layoutMode === "timeline" ? filterTimelineData(rawData) : rawData;
    const elements = transformToCytoscapeElements(
      effectiveData,
      tagColorMap,
      collapsedTags,
    );

    // Batch update
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });

    // Stop previous layout before starting new one
    layoutRef.current?.stop();

    const layoutConfig =
      layoutMode === "timeline" ? getDagreLayout("LR") : getCoseLayout(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Plugin layout options not in base types
    const layout = cy.layout(layoutConfig as any);
    layoutRef.current = layout;
    layout.run();

    return () => {
      layout.stop();
    };
  }, [rawData, tagColorMap, collapsedTags, layoutMode, cyReady]);

  // ─── Search logic ───

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady) return;

    if (!searchQuery.trim()) {
      setSearchMatches(new Set());
      cy.nodes(".search-match").removeClass("search-match");
      return;
    }

    const q = searchQuery.toLowerCase();
    const matches = new Set<string>();

    cy.nodes().forEach((node) => {
      const label = ((node.data("label") as string) || "").toLowerCase();
      if (label.includes(q)) {
        matches.add(node.id());
        node.addClass("search-match");
      } else {
        node.removeClass("search-match");
      }
    });

    setSearchMatches(matches);

    if (matches.size > 0) {
      const matched = cy.nodes(".search-match");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Cytoscape animate types incomplete
      cy.animate({ fit: { eles: matched, padding: 80 }, duration: 400 } as any);
    }
  }, [searchQuery, cyReady]);

  // ─── Event handlers (attached to Cytoscape) ───

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady) return;

    // Hover highlight
    const onMouseover = (evt: cytoscape.EventObject) => {
      const node = evt.target;
      setHoverNodeId(node.id());

      const neighborhood = node.neighborhood().add(node);
      cy.elements().not(neighborhood).addClass("dimmed");
      neighborhood.addClass("highlighted");
    };

    const onMouseout = () => {
      setHoverNodeId(null);
      cy.elements().removeClass("dimmed highlighted");
    };

    // Tap (click)
    const onTap = (evt: cytoscape.EventObject) => {
      const node = evt.target;
      const nodeId = node.id();
      const nodeData = rawData.nodes.find((n) => n.id === nodeId) ?? null;
      if (!nodeData) return;

      // Path mode — read from ref to avoid stale closure
      if (pathMode) {
        handlePathClick(nodeId, cy);
        return;
      }

      // Tag collapse
      if (nodeData.type === "tag") {
        setCollapsedTags((prev) => {
          const next = new Set(prev);
          if (next.has(nodeData.label)) next.delete(nodeData.label);
          else next.add(nodeData.label);
          return next;
        });
        return;
      }

      // Select document
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Cytoscape animate types incomplete
      cy.animate({ center: { eles: node }, zoom: 2, duration: 600 } as any);
      setSelectedNode(nodeData);
    };

    // Right-click (context menu)
    const onCxttap = (evt: cytoscape.EventObject) => {
      const node = evt.target;
      const nodeData = rawData.nodes.find((n) => n.id === node.id()) ?? null;
      if (!nodeData) return;

      const renderedPos = evt.renderedPosition || evt.position;
      setContextMenu({
        x:
          renderedPos.x +
          (containerRef.current?.getBoundingClientRect().left ?? 0),
        y:
          renderedPos.y +
          (containerRef.current?.getBoundingClientRect().top ?? 0),
        node: nodeData,
      });
    };

    // Background click
    const onBgTap = (evt: cytoscape.EventObject) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        setContextMenu(null);
      }
    };

    cy.on("mouseover", "node", onMouseover);
    cy.on("mouseout", "node", onMouseout);
    cy.on("tap", "node", onTap);
    cy.on("cxttap", "node", onCxttap);
    cy.on("tap", onBgTap);

    return () => {
      cy.off("mouseover", "node", onMouseover);
      cy.off("mouseout", "node", onMouseout);
      cy.off("tap", "node", onTap);
      cy.off("cxttap", "node", onCxttap);
      cy.off("tap", onBgTap);
    };
  }, [cyReady, pathMode, rawData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Close context menu on outside click ───

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  // ─── Path mode helpers ───

  const handlePathClick = useCallback((nodeId: string, cy: cytoscape.Core) => {
    const currentPathStart = pathStartRef.current;

    if (!currentPathStart) {
      setPathStart(nodeId);
      cy.getElementById(nodeId).addClass("path-node");
      return;
    }

    // Calculate shortest path using Cytoscape built-in
    const source = cy.getElementById(currentPathStart);
    const target = cy.getElementById(nodeId);

    if (source.empty() || target.empty()) {
      setPathStart(null);
      return;
    }

    const result = cy.elements().aStar({
      root: source,
      goal: target,
      directed: false,
    });

    // Clear previous path
    cy.elements().removeClass("path-node path-edge");

    if (result.found && result.path) {
      result.path.nodes().forEach((node) => {
        node.addClass("path-node");
      });
      result.path.edges().forEach((edge) => {
        edge.addClass("path-edge");
      });

      /* eslint-disable @typescript-eslint/no-explicit-any -- Cytoscape animate types incomplete */
      cy.animate({
        fit: { eles: result.path, padding: 80 },
        duration: 600,
      } as any);
      /* eslint-enable @typescript-eslint/no-explicit-any */
    } else {
      cy.getElementById(nodeId).addClass("path-node");
    }

    setPathStart(null);
  }, []);

  const togglePathMode = useCallback(() => {
    setPathMode((prev) => {
      if (prev) {
        setPathStart(null);
        cyRef.current?.elements().removeClass("path-node path-edge");
      }
      return !prev;
    });
  }, []);

  // ─── Helper: 取得某文件的所有關聯文件 ID ───

  const getRelatedDocIds = useCallback(
    (nodeId: string): string[] => {
      const ids: string[] = [];
      for (const link of rawData.links) {
        if (link.source === nodeId || link.target === nodeId) {
          const otherId = link.source === nodeId ? link.target : link.source;
          const otherNode = rawData.nodes.find((n) => n.id === otherId);
          if (otherNode && otherNode.type === "document") {
            ids.push(otherNode.id);
          }
        }
      }
      return ids;
    },
    [rawData],
  );

  /** 建構含關聯文件的 chat URL */
  const buildChatUrl = useCallback(
    (docId: string): string => {
      const relatedIds = getRelatedDocIds(docId);
      const base = `/chat?docId=${encodeURIComponent(docId)}`;
      if (relatedIds.length === 0) return base;
      return `${base}&relatedDocIds=${relatedIds.map(encodeURIComponent).join(",")}`;
    },
    [getRelatedDocIds],
  );

  // ─── Neighbor list for sidebar ───

  const neighborDocs = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "document") return [];
    const neighbors: Array<{
      id: string;
      label: string;
      relationType?: string;
    }> = [];
    for (const link of rawData.links) {
      if (link.source === selectedNode.id || link.target === selectedNode.id) {
        const otherId =
          link.source === selectedNode.id ? link.target : link.source;
        const otherNode = rawData.nodes.find((n) => n.id === otherId);
        if (otherNode && otherNode.type === "document") {
          neighbors.push({
            id: otherNode.id,
            label: otherNode.label,
            relationType: link.relationType,
          });
        }
      }
    }
    return neighbors;
  }, [selectedNode, rawData]);

  // ─── Render ───

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 p-4">載入失敗: {error}</div>;
  }

  return (
    <div className="relative w-full h-full bg-gray-50 dark:bg-gray-900 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
      {/* Top toolbar: search + mode toggles */}
      <div className="absolute top-3 left-3 z-10 flex items-start gap-2">
        {/* Search */}
        <div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋節點..."
              className="w-28 md:w-48 pl-8 pr-8 py-1.5 text-xs bg-white/90 dark:bg-gray-800/90 backdrop-blur border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {searchMatches.size > 0 && (
            <p className="mt-1 text-[10px] text-gray-500 bg-white/80 dark:bg-gray-800/80 px-2 py-0.5 rounded">
              找到 {searchMatches.size} 個匹配
            </p>
          )}
        </div>

        {/* Layout toggle */}
        <button
          onClick={() =>
            setLayoutMode((prev) => (prev === "force" ? "timeline" : "force"))
          }
          className={`whitespace-nowrap flex items-center gap-1.5 px-2 md:px-3 py-1.5 text-xs rounded-lg border backdrop-blur transition-colors ${
            layoutMode === "timeline"
              ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400"
              : "bg-white/90 dark:bg-gray-800/90 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-300"
          }`}
          title="切換時間線佈局"
        >
          <Clock className="w-3.5 h-3.5" />
          時間線
        </button>

        {/* Path mode toggle */}
        <button
          onClick={togglePathMode}
          className={`whitespace-nowrap flex items-center gap-1.5 px-2 md:px-3 py-1.5 text-xs rounded-lg border backdrop-blur transition-colors ${
            pathMode
              ? "bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400"
              : "bg-white/90 dark:bg-gray-800/90 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-red-300"
          }`}
          title="知識路徑探索"
        >
          <Waypoints className="w-3.5 h-3.5" />
          路徑
        </button>
      </div>

      {/* Path mode instruction */}
      {pathMode && (
        <div className="absolute top-14 left-3 z-10 bg-red-50 dark:bg-red-900/30 backdrop-blur px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
          {pathStart ? "點擊目標節點查看路徑" : "點擊起點節點開始探索"}
        </div>
      )}

      {/* Collapsed tags indicator */}
      {collapsedTags.size > 0 && (
        <div className="absolute top-3 right-3 z-10 bg-white/90 dark:bg-gray-800/90 backdrop-blur px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500">
          <button
            onClick={() => setCollapsedTags(new Set())}
            className="hover:text-blue-500 transition-colors"
          >
            {collapsedTags.size} 個標籤已收合 · 展開全部
          </button>
        </div>
      )}

      {/* Cytoscape container */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ minHeight: "400px" }}
      />

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node.type === "document" && (
            <>
              <button
                className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-foreground"
                onClick={() => {
                  router.push(buildChatUrl(contextMenu.node.id));
                  setContextMenu(null);
                }}
              >
                開啟對話
              </button>
              <button
                className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-foreground"
                onClick={() => {
                  setPathMode(true);
                  setPathStart(contextMenu.node.id);
                  cyRef.current
                    ?.getElementById(contextMenu.node.id)
                    .addClass("path-node");
                  setContextMenu(null);
                }}
              >
                從此節點開始路徑探索
              </button>
              <button
                className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-foreground"
                onClick={() => {
                  setSelectedNode(contextMenu.node);
                  setContextMenu(null);
                }}
              >
                查看詳細資訊
              </button>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              <button
                className="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={async () => {
                  const docId = contextMenu.node.id;
                  setContextMenu(null);
                  try {
                    const res = await fetch(`/api/knowledge/${docId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ enabled: false }),
                    });
                    if (!res.ok) return;
                    setRawData((prev) => ({
                      nodes: prev.nodes.filter((n) => n.id !== docId),
                      links: prev.links.filter(
                        (l) => l.source !== docId && l.target !== docId,
                      ),
                    }));
                  } catch {
                    // Network error — state unchanged
                  }
                }}
              >
                禁用此文件
              </button>
            </>
          )}
          {contextMenu.node.type === "tag" && (
            <button
              className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-foreground"
              onClick={() => {
                const tagName = contextMenu.node.label;
                setCollapsedTags((prev) => {
                  const next = new Set(prev);
                  if (next.has(tagName)) next.delete(tagName);
                  else next.add(tagName);
                  return next;
                });
                setContextMenu(null);
              }}
            >
              {collapsedTags.has(contextMenu.node.label)
                ? "展開此標籤"
                : "收合此標籤"}
            </button>
          )}
        </div>
      )}

      {/* Node Detail Sidebar */}
      {selectedNode && (
        <div className="absolute bottom-4 right-4 w-72 max-h-[70%] overflow-y-auto bg-white dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-10">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-semibold text-lg text-foreground leading-tight pr-2">
              {selectedNode.label}
            </h3>
            <button
              onClick={() => setSelectedNode(null)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex-shrink-0"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="text-xs text-gray-500 mb-3">
            {selectedNode.type === "tag" ? "標籤" : "文件"}
          </div>

          {selectedNode.type === "document" && (
            <>
              {selectedNode.summary && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 line-clamp-4 leading-relaxed">
                  {selectedNode.summary}
                </p>
              )}

              {selectedNode.tags && selectedNode.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {selectedNode.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs rounded-full"
                      style={{
                        backgroundColor: `${tagColorMap.get(tag) ?? "#64748b"}20`,
                        color: tagColorMap.get(tag) ?? "#64748b",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="text-xs text-gray-400 space-y-1 mb-3">
                {selectedNode.created_at && (
                  <p>
                    建立於{" "}
                    {new Date(selectedNode.created_at).toLocaleDateString(
                      "zh-TW",
                    )}
                  </p>
                )}
                {selectedNode.contentLength != null &&
                  selectedNode.contentLength > 0 && (
                    <p>{selectedNode.contentLength.toLocaleString()} 字</p>
                  )}
                <p>{neighborDocs.length} 個關聯文件</p>
              </div>

              {neighborDocs.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-500 mb-1.5">
                    關聯文件
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {neighborDocs.map((n) => (
                      <div
                        key={n.id}
                        className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400"
                      >
                        <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{n.label}</span>
                        {n.relationType && (
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            ({n.relationType})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => router.push(buildChatUrl(selectedNode.id))}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md text-sm transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                開啟對話
              </button>
            </>
          )}

          {selectedNode.type === "tag" && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">
                標籤下文件
              </p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {rawData.links
                  .filter((l) => l.source === selectedNode.id)
                  .map((l) => {
                    const docNode = rawData.nodes.find(
                      (n) => n.id === l.target,
                    );
                    if (!docNode) return null;
                    return (
                      <div
                        key={l.target}
                        className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400"
                      >
                        <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{docNode.label}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
