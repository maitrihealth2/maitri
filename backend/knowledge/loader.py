"""
Knowledge Base Loader
Reads therapy documents, chunks them, embeds with sentence-transformers,
and stores in ChromaDB vector database.

Run once: python -m knowledge.loader
Then RAG retriever can query it on every chat request.
"""

import os
import chromadb
from chromadb.utils import embedding_functions

DOCS_DIR = os.path.join(os.path.dirname(__file__), "docs")
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")
COLLECTION_NAME = "therapy_knowledge"
CHUNK_SIZE = 400       # characters per chunk
CHUNK_OVERLAP = 80     # overlap between chunks


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += chunk_size - overlap
    return chunks


def load_documents() -> list[dict]:
    """Load all .txt files from docs/ folder."""
    documents = []
    for filename in os.listdir(DOCS_DIR):
        if filename.endswith(".txt"):
            filepath = os.path.join(DOCS_DIR, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                text = f.read()
            chunks = chunk_text(text)
            for i, chunk in enumerate(chunks):
                documents.append({
                    "id": f"{filename}_{i}",
                    "text": chunk,
                    "source": filename.replace(".txt", ""),
                })
            print(f"  📄 {filename} → {len(chunks)} chunks")
    return documents


def build_knowledge_base():
    """Embed all documents and store in ChromaDB."""
    print("\n🧠 Building MindBridge Knowledge Base...")
    print(f"   Source: {DOCS_DIR}")
    print(f"   Store:  {CHROMA_DIR}\n")

    # Load documents
    documents = load_documents()
    print(f"\n✅ Total chunks: {len(documents)}")

    # Initialize ChromaDB
    client = chromadb.PersistentClient(path=CHROMA_DIR)

    # Delete existing collection if rebuilding
    try:
        client.delete_collection(COLLECTION_NAME)
        print("🗑  Deleted existing collection")
    except Exception:
        pass

    # Use sentence-transformers for embeddings (free, local)
    embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name="all-MiniLM-L6-v2"
    )

    collection = client.create_collection(
        name=COLLECTION_NAME,
        embedding_function=embedding_fn,
        metadata={"hnsw:space": "cosine"},
    )

    # Add in batches
    batch_size = 50
    for i in range(0, len(documents), batch_size):
        batch = documents[i:i + batch_size]
        collection.add(
            ids=[d["id"] for d in batch],
            documents=[d["text"] for d in batch],
            metadatas=[{"source": d["source"]} for d in batch],
        )

    print(f"✅ Knowledge base built: {collection.count()} chunks stored")
    print(f"   Location: {CHROMA_DIR}")
    return collection


if __name__ == "__main__":
    build_knowledge_base()
    print("\n🎉 Done! Run the backend now — RAG is ready.")