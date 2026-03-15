"""LightRAG GraphRAG 微服務 — FastAPI wrapper for lightrag-hku."""

import asyncio
import json
import os
import time
import traceback
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="LightRAG GraphRAG Service", version="1.0.0")

# --- Configuration ---
GOOGLE_API_KEY = os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY", "")
DATA_DIR = Path("/app/data")
EMBEDDING_DIM = 768
EMBEDDING_MODEL = "gemini-embedding-001"
LLM_MODEL = "gemini-2.0-flash"


# --- Custom Embedding & LLM for Gemini ---
async def gemini_embedding(texts: list[str]) -> np.ndarray:
    """使用 Google Gemini embedding API 生成向量。"""
    from google import genai

    client = genai.Client(api_key=GOOGLE_API_KEY)
    result = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=texts,
        config={"output_dimensionality": EMBEDDING_DIM},
    )
    return np.array([e.values for e in result.embeddings])


async def gemini_llm(prompt: str, **kwargs) -> str:
    """使用 Google Gemini LLM 生成文本。"""
    from google import genai

    client = genai.Client(api_key=GOOGLE_API_KEY)
    response = client.models.generate_content(
        model=LLM_MODEL,
        contents=prompt,
    )
    return response.text or ""


# --- LightRAG Instance Cache (per user) ---
_rag_instances: dict[str, Any] = {}


def get_rag_instance(user_id: str):
    """取得或建立 LightRAG 實例（每個 user 獨立 workspace）。"""
    if user_id in _rag_instances:
        return _rag_instances[user_id]

    from lightrag import LightRAG, QueryParam
    from lightrag.utils import EmbeddingFunc

    workspace = DATA_DIR / user_id
    workspace.mkdir(parents=True, exist_ok=True)

    rag = LightRAG(
        working_dir=str(workspace),
        llm_model_func=gemini_llm,
        embedding_func=EmbeddingFunc(
            embedding_dim=EMBEDDING_DIM,
            max_token_size=8192,
            func=gemini_embedding,
        ),
    )

    _rag_instances[user_id] = rag
    return rag


# --- Request Models ---
class IndexRequest(BaseModel):
    text: str
    doc_id: str
    user_id: str


class QueryRequest(BaseModel):
    query: str
    user_id: str
    mode: str = "hybrid"  # naive, local, global, hybrid, mix, bypass


class GraphRequest(BaseModel):
    user_id: str


# --- Endpoints ---
@app.get("/health")
async def health():
    """健康檢查端點。"""
    has_api_key = bool(GOOGLE_API_KEY)
    return {
        "status": "ok" if has_api_key else "degraded",
        "service": "lightrag",
        "api_key_configured": has_api_key,
    }


@app.post("/index")
async def index_document(req: IndexRequest):
    """索引文件到 LightRAG 知識圖譜。"""
    start_time = time.time()

    try:
        rag = get_rag_instance(req.user_id)
        await rag.ainsert(req.text)

        elapsed = time.time() - start_time

        return JSONResponse(content={
            "success": True,
            "doc_id": req.doc_id,
            "index_time_seconds": round(elapsed, 2),
        })

    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)},
        )


@app.post("/query")
async def query_knowledge(req: QueryRequest):
    """查詢 LightRAG 知識圖譜。"""
    start_time = time.time()

    try:
        from lightrag import QueryParam

        rag = get_rag_instance(req.user_id)
        result = await rag.aquery(
            req.query,
            param=QueryParam(mode=req.mode),
        )

        elapsed = time.time() - start_time

        return JSONResponse(content={
            "success": True,
            "result": result,
            "mode": req.mode,
            "query_time_seconds": round(elapsed, 2),
        })

    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)},
        )


@app.post("/graph")
async def get_graph(req: GraphRequest):
    """取得使用者的知識圖譜（節點 + 邊）。"""
    try:
        workspace = DATA_DIR / req.user_id

        # 讀取 NetworkX JSON
        graph_file = workspace / "graph_chunk_entity_relation.graphml"
        if not graph_file.exists():
            return JSONResponse(content={
                "success": True,
                "nodes": [],
                "edges": [],
            })

        import networkx as nx

        G = nx.read_graphml(str(graph_file))

        nodes = []
        for node_id, data in G.nodes(data=True):
            nodes.append({
                "id": node_id,
                "label": data.get("entity_name", node_id),
                "type": data.get("entity_type", "unknown"),
                "description": data.get("description", ""),
            })

        edges = []
        for src, tgt, data in G.edges(data=True):
            edges.append({
                "source": src,
                "target": tgt,
                "relation": data.get("relation", ""),
                "weight": data.get("weight", 1.0),
            })

        return JSONResponse(content={
            "success": True,
            "nodes": nodes,
            "edges": edges,
            "node_count": len(nodes),
            "edge_count": len(edges),
        })

    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)},
        )
