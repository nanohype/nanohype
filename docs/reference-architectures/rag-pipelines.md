# Reference Architecture: RAG Pipelines

**Status:** Reference
**Audience:** Template users evaluating RAG templates, developers building retrieval-augmented generation systems

---

## 1. What Is RAG?

Retrieval-Augmented Generation (RAG) is a pattern where an LLM generates responses grounded in retrieved documents rather than relying solely on its training data. The system retrieves relevant content from an external knowledge base, injects it into the prompt, and the LLM uses that context to produce an answer.

The core value proposition: **you get the LLM's reasoning and language ability applied to your specific data, without training or fine-tuning a model.**

### 1.1 RAG vs Fine-Tuning vs Long Context

These are three approaches to getting an LLM to work with your data. They are not mutually exclusive.

**RAG** — retrieve relevant chunks at query time, include them in the prompt.

- Best for: large or frequently changing knowledge bases, when you need source attribution, when different queries need different subsets of data
- Requires: an ingestion pipeline, a vector store, retrieval logic
- Limitation: retrieval quality bottlenecks generation quality; context window still limits how much you can include

**Fine-tuning** — train the model on your data so it internalizes the knowledge.

- Best for: teaching the model a consistent style, domain-specific terminology, or behavior patterns
- Requires: training data, compute, evaluation pipeline
- Limitation: expensive to update, can hallucinate about facts not in training data, no source attribution

**Long context** — pass the entire knowledge base (or large portions) directly in the prompt.

- Best for: small knowledge bases (under ~200k tokens), when you do not want to build retrieval infrastructure
- Requires: a model with a large context window
- Limitation: cost scales linearly with context size on every query, attention degradation on very long contexts ("lost in the middle"), impractical for large corpora

**Decision framework:**

| Criterion | RAG | Fine-tuning | Long context |
|---|---|---|---|
| Knowledge base size | Any | Small-medium | Small |
| Update frequency | High (re-index) | Low (re-train) | High (just pass it) |
| Source attribution | Yes | No | Possible but harder |
| Per-query cost | Moderate | Low (amortized) | High |
| Setup complexity | Medium | High | Low |
| Accuracy ceiling | High (with good retrieval) | High (with good data) | High (for short docs) |

Most production systems use RAG. Fine-tuning and long context are complements, not replacements.

---

## 2. Pipeline Overview

A RAG system has two pipelines: **ingestion** (offline, processes documents into a searchable index) and **query** (online, handles user questions).

```text
Ingestion Pipeline:
  Documents → Load → Parse → Clean → Chunk → Embed → Store

Query Pipeline:
  User Query → Embed → Retrieve → Rerank → Build Prompt → Generate → Return
```

Each stage has meaningful design choices. The following sections walk through them.

---

## 3. Ingestion Pipeline

### 3.1 Document Loading

Load source documents from wherever they live. Common sources:

- **Files on disk** — PDF, Markdown, HTML, DOCX, plain text, code files
- **APIs** — Notion, Confluence, Google Docs, Slack, GitHub
- **Databases** — SQL queries, document stores
- **Web** — crawled pages, sitemaps

The loader's job is to produce a list of `Document` objects, each with `content` (text) and `metadata` (source URL, title, author, date, file type, etc.). Metadata is critical for filtering and attribution later.

```python
@dataclass
class Document:
    content: str
    metadata: dict  # source, title, date, file_type, etc.
```

### 3.2 Parsing

Convert raw file formats into clean text. This is where most ingestion bugs live.

- **PDF** — notoriously inconsistent. Libraries like `pypdf`, `pdfplumber`, or `unstructured` each handle different PDF variants better. Tables, multi-column layouts, and scanned documents (OCR) all need special handling.
- **HTML** — strip tags, handle navigation/boilerplate removal, preserve semantic structure (headings, lists).
- **Markdown** — generally straightforward, but handle frontmatter, code blocks, and link references.
- **Code** — preserve structure. Consider whether to include comments, docstrings, import statements.
- **DOCX/PPTX** — use `python-docx` or similar. Watch for embedded images and tables.

**Practical advice:** test your parser on real documents from your corpus before building the rest of the pipeline. A parser that works on 90% of your documents is not good enough — the 10% it mangles will produce wrong answers.

### 3.3 Cleaning

Post-parsing cleanup:

- Remove excessive whitespace, control characters, null bytes
- Normalize unicode (NFC normalization)
- Strip boilerplate headers/footers that repeat across documents
- Remove or replace PII if your use case requires it
- Deduplicate identical or near-identical content

### 3.4 Metadata Enrichment

Before chunking, attach metadata that will be useful at retrieval time:

- Document title, section headers, file path
- Date created / last modified
- Author or owner
- Document type or category
- Any structured fields from the source (tags, labels, status)

Rich metadata enables filtered retrieval later ("find chunks from documents written in the last 6 months" or "only search the API documentation").

---

## 4. Chunking Strategies

Chunking splits documents into pieces small enough to embed and retrieve. This is the single most impactful design decision in a RAG pipeline. Bad chunking produces bad retrieval produces bad answers.

### 4.1 Fixed-Size Chunking

Split text into chunks of N tokens (or characters) with an overlap of M tokens.

**Pros:** Simple, predictable chunk sizes, easy to reason about token budgets.
**Cons:** Splits mid-sentence, mid-paragraph, mid-thought. Overlap helps but does not fully solve this. Semantically incoherent chunks hurt retrieval quality.

**When to use:** Prototyping, uniform documents with no clear structure, as a fallback.

### 4.2 Recursive / Structure-Aware Chunking

Split on natural boundaries — paragraphs, then sentences, then tokens — with a target chunk size. Try the largest boundary first; if chunks are still too large, recurse to smaller boundaries. The separator hierarchy is typically: `["\n\n", "\n", ". ", " "]` (paragraph, line, sentence, word).

**Pros:** Respects natural text boundaries. Produces more coherent chunks.
**Cons:** Variable chunk sizes (complicates batching). Still not semantically aware — a paragraph about two different topics gets chunked together.

**When to use:** General-purpose RAG on prose documents. Good default choice.

### 4.3 Semantic Chunking

Use embeddings to detect topic shifts. Compute sentence-level embeddings, measure similarity between consecutive sentences, and split where similarity drops below a threshold.

**Pros:** Chunks are semantically coherent. Each chunk is about one topic.
**Cons:** Expensive (requires embedding every sentence). Threshold tuning is fiddly. Chunk sizes are unpredictable.

**When to use:** High-quality RAG where retrieval precision matters more than ingestion speed. Research papers, documentation with mixed topics.

### 4.4 Document-Structure-Aware Chunking

Use the document's own structure — headings, sections, code blocks, table boundaries — to determine chunk boundaries. Parse the document into a tree, then chunk at section boundaries. For Markdown, split on heading lines; for HTML, split on semantic elements; for code, split on function/class boundaries.

**Pros:** Preserves the author's intended structure. Headings provide natural context. Works well with documents that have clear hierarchy.
**Cons:** Requires format-specific parsers. Sections can be very large (need recursive fallback) or very small (need merging).

**When to use:** Technical documentation, knowledge bases, any corpus with consistent formatting.

### 4.5 Chunk Size Guidelines

| Chunk size (tokens) | Retrieval behavior | Typical use |
|---|---|---|
| 128-256 | High precision, narrow context | FAQ, definitions, factoid QA |
| 256-512 | Balanced precision and context | General-purpose RAG |
| 512-1024 | More context per chunk, lower precision | Long-form answers, summarization |
| 1024+ | Document-level retrieval | When you need full sections |

Smaller chunks are better for precise retrieval (finding the exact sentence that answers a question). Larger chunks provide more context to the LLM (helpful for nuanced answers). Test with your actual data and queries.

---

## 5. Embedding

Convert text chunks into dense vector representations for similarity search.

### 5.1 Model Selection

| Model | Dimensions | Notes |
|---|---|---|
| OpenAI `text-embedding-3-small` | 1536 | Good balance of cost and quality. Supports dimension reduction. |
| OpenAI `text-embedding-3-large` | 3072 | Higher quality, higher cost. Supports dimension reduction. |
| Cohere `embed-v3` | 1024 | Strong multilingual support. Separate query/document modes. |
| Voyage AI `voyage-3` | 1024 | Strong on code and technical content. |
| Open source (`bge-large`, `e5-large-v2`) | 1024 | Self-hostable. No API dependency. Requires GPU for production throughput. |

**Selection criteria:**

- **Quality on your domain** — test with your actual queries and documents. Benchmarks (MTEB) give a starting point but your data may differ.
- **Dimensionality** — higher dimensions generally mean better quality but more storage and slower search. 1024 dimensions is a good default.
- **Cost** — embedding is a per-token API call. Large corpora with frequent re-indexing can add up.
- **Latency** — query-time embedding must be fast (single query, <100ms).
- **Self-hosted vs API** — API is easier to start. Self-hosted gives control, lower per-query cost at scale, and no data leaving your infrastructure.

### 5.2 Dimensionality Tradeoffs

More dimensions capture more nuance but:

- Use more storage (4 bytes per float32 dimension per vector)
- Slow down similarity search (more computation per comparison)
- Require more data to fill the space meaningfully

For a corpus of 100k chunks at 1024 dimensions in float32: ~400MB of vector data. At 3072 dimensions: ~1.2GB. These numbers matter when choosing self-hosted vs managed.

Some models (OpenAI `text-embedding-3-*`) support dimension reduction via Matryoshka representation learning — you can truncate the vector to fewer dimensions with graceful quality degradation.

### 5.3 Batch Processing

Embed chunks in batches, not one at a time. Most APIs support batch requests (typically 100 chunks per batch). Include retry logic with exponential backoff for API rate limits. For large corpora (1M+ chunks), consider async/parallel batching and checkpointing so you can resume if the process fails midway.

---

## 6. Vector Stores

Where you store embeddings and perform similarity search.

### 6.1 In-Memory (Development)

Store vectors in a NumPy array or a lightweight library like FAISS. Search via brute-force cosine similarity. **Use for:** development, testing, small corpora (<10k chunks). Not suitable for production.

### 6.2 Managed Services

| Service | Notes |
|---|---|
| Pinecone | Fully managed, serverless option. Good DX. Pay per query + storage. |
| Weaviate Cloud | Managed Weaviate. Supports hybrid search natively. |
| Qdrant Cloud | Managed Qdrant. Strong filtering support. |
| MongoDB Atlas Vector Search | If you already use MongoDB. |
| Supabase (pgvector) | If you already use Supabase/Postgres. |

**Use for:** production, when you do not want to manage infrastructure.

### 6.3 Self-Hosted

| Option | Notes |
|---|---|
| pgvector (Postgres extension) | Use your existing Postgres. Good enough for most scales. Familiar SQL interface. |
| Qdrant | Purpose-built. Excellent filtering and performance. Rust-based. |
| Chroma | Python-native. Easy to embed in applications. Good for prototyping. |
| Milvus | High scale. More operational complexity. |
| FAISS (Facebook) | Library, not a database. No persistence by default. Best for read-heavy batch workloads. |

**Use for:** production, when you need control over data locality, cost optimization at scale, or air-gapped environments.

### 6.4 Selection Criteria

- **Scale** — how many vectors? <100k: almost anything works. 100k-10M: pgvector, Qdrant, Pinecone. >10M: purpose-built vector DBs.
- **Filtering** — do you need metadata filters combined with similarity search? Not all stores handle this well.
- **Operational complexity** — pgvector adds to an existing Postgres. Qdrant/Milvus are separate services.
- **Hybrid search** — do you need dense + sparse (keyword) search? Weaviate and Qdrant support this natively.
- **Existing infrastructure** — use what you already run when possible.

---

## 7. Retrieval

Given a user query, find the most relevant chunks.

### 7.1 Similarity Search

Embed the query, find the K nearest vectors by cosine similarity (or dot product, or L2 distance — cosine is standard for normalized embeddings).

```python
query_embedding = embedding_model.embed(query)
results = vector_store.search(query_embedding, top_k=10)
```

This is the baseline. It works well when the query is semantically similar to the relevant chunks.

### 7.2 Maximum Marginal Relevance (MMR)

Standard similarity search can return multiple chunks that all say the same thing (high relevance, low diversity). MMR balances relevance with diversity — each selected chunk should be relevant to the query but different from already-selected chunks.

```text
MMR(chunk) = λ * similarity(chunk, query) - (1-λ) * max(similarity(chunk, already_selected))
```

Set λ between 0.5 and 0.7 for a typical balance. Use MMR when your corpus has redundant content (e.g., multiple documents covering the same topic).

### 7.3 Hybrid Retrieval (Dense + Sparse)

Dense retrieval (embeddings) captures semantic meaning. Sparse retrieval (BM25/TF-IDF) captures exact keyword matches. Combining them handles cases where one fails. Dense wins on paraphrases ("side effects" matches "adverse reactions"). Sparse wins on identifiers and exact terms ("ERR_SSL_PROTOCOL_ERROR").

Combine results using Reciprocal Rank Fusion (RRF): score each result as `1 / (k + rank)` from each retriever, sum the scores, sort. This is simple and effective.

**When to use:** most production systems. The incremental complexity is low and the retrieval quality improvement is significant, especially for technical content.

### 7.4 Metadata Filtering

Filter candidates before or during similarity search using metadata.

```python
# Only search documentation from the last year
results = vector_store.search(
    query_embedding,
    top_k=10,
    filter={"date": {"$gte": "2025-01-01"}, "type": "documentation"}
)
```

Use metadata filtering to:

- Scope search to a specific document set, time range, or category
- Implement access control (user can only retrieve documents they have access to)
- Exclude known-stale content

### 7.5 Query Transformation

Sometimes the user's query is not well-suited for retrieval. Transformations can help:

- **Query rewriting** — use the LLM to rephrase the query for better retrieval
- **Hypothetical Document Embedding (HyDE)** — generate a hypothetical answer, embed it, and use that as the search query (closer in embedding space to relevant chunks)
- **Multi-query** — generate multiple query variants, retrieve for each, merge results

These add latency (an extra LLM call) but can significantly improve recall for vague or complex queries.

---

## 8. Reranking

Reranking takes the initial retrieval results (typically top 20-50) and reorders them using a more expensive but more accurate model.

### 8.1 Cross-Encoder Rerankers

An embedding model encodes query and document independently (bi-encoder). A cross-encoder takes query and document together as input and produces a relevance score. This captures interaction between query and document terms that bi-encoders miss.

```python
# Retrieve broadly, then rerank
initial_results = vector_store.search(query_embedding, top_k=25)
reranked = reranker.rank(query, [r.content for r in initial_results])
final_results = reranked[:5]  # Take top 5 after reranking
```

Common rerankers:

- Cohere Rerank (`rerank-v3`) — API-based, strong quality
- Voyage AI Rerank — API-based, good on code
- `bge-reranker-v2-m3` — open source, self-hostable
- Jina Reranker — open source, multilingual

### 8.2 When Reranking Helps

- When initial retrieval returns 10+ results and you need to narrow to 3-5 for the prompt
- When retrieval precision matters more than latency (adds 100-500ms)
- When your queries are complex (multi-part questions, nuanced intent)

Reranking does **not** help if your initial retrieval misses relevant documents entirely — it can only reorder what was retrieved.

### 8.3 Cost-Benefit

For most RAG systems, adding a reranker improves answer quality measurably. The latency and cost are modest. It is one of the highest-ROI improvements you can make after getting basic retrieval working.

---

## 9. Generation

Construct a prompt with retrieved context and generate an answer.

### 9.1 Prompt Construction

The standard pattern:

```text
System: You are a helpful assistant. Answer questions based on the provided
        context. If the context doesn't contain the answer, say so.

Context:
[Source: deployment-guide.md, Section: "Rolling Updates"]
Rolling updates allow you to update pods incrementally...

[Source: troubleshooting.md, Section: "Failed Deployments"]
If a deployment fails, check the pod logs first...

User: How do I fix a failed deployment?
```

**Guidelines:**

- Place context before the user question (models attend to recent content more strongly)
- Include source metadata with each chunk (enables citation)
- Keep total context within a reasonable fraction of the context window — leave room for the answer
- Use clear delimiters between chunks
- Instruct the model on how to handle missing context ("say you don't know" vs "use your general knowledge")

### 9.2 Citation and Attribution

Users need to know where the answer came from. Strategies:

- **Inline citations** — instruct the model to cite sources like `[1]` with a reference list at the end
- **Chunk-level attribution** — return the retrieved chunks alongside the answer so the user can verify
- **Sentence-level grounding** — map each sentence in the answer to its source chunk (harder, requires post-processing or specialized prompting)

```text
System: When you use information from the context, cite the source using
        [Source: filename] notation. Include a "Sources" section at the end
        listing all sources you referenced.
```

### 9.3 Handling No-Context Scenarios

When retrieval returns nothing relevant (low similarity scores across the board), you have three options:

1. **Refuse** — "I don't have information about that in my knowledge base." Safest.
2. **Fall back to general knowledge** — let the model answer from training data. Riskier (may hallucinate) but sometimes useful.
3. **Ask for clarification** — "Could you rephrase your question? I found some related content about X — is that what you're asking about?"

Set a similarity threshold below which retrieved results are discarded. Typical range: 0.3-0.5 cosine similarity, depending on your embedding model.

---

## 10. Evaluation

### 10.1 Retrieval Metrics

Measure whether the right chunks are being retrieved.

- **Recall@K** — of all relevant chunks in the corpus, what fraction appears in the top K results? High recall means you are finding what you need.
- **Precision@K** — of the top K results, what fraction is actually relevant? High precision means you are not polluting the context with irrelevant chunks.
- **MRR (Mean Reciprocal Rank)** — how high does the first relevant result appear? 1/rank, averaged across queries. High MRR means the most relevant chunk is near the top.
- **NDCG (Normalized Discounted Cumulative Gain)** — accounts for the position of all relevant results, not just the first.

To compute these, you need a labeled dataset: queries paired with their relevant documents/chunks. Start with 50-100 manually labeled examples.

### 10.2 Generation Quality

Measure whether the final answer is good.

- **Faithfulness** — does the answer only contain information that is in the retrieved context? Unfaithful answers hallucinate facts not in the chunks. Measured with LLM-as-judge.
- **Relevance** — does the answer address the user's question? Measured with LLM-as-judge or human evaluation.
- **Completeness** — does the answer cover all relevant information from the retrieved context? Also LLM-as-judge.

A common approach is an LLM-as-judge prompt that takes the context, answer, and question, then evaluates each claim in the answer for support in the context, producing a 0.0-1.0 faithfulness score.

### 10.3 End-to-End Evaluation

Frameworks like RAGAS provide automated evaluation pipelines that combine retrieval and generation metrics. The key metrics from RAGAS:

- **Answer relevancy** — is the answer relevant to the question?
- **Faithfulness** — is the answer grounded in the retrieved context?
- **Context relevancy** — are the retrieved chunks relevant to the question?
- **Context recall** — do the retrieved chunks contain the information needed to answer?

Build an eval dataset, run it on every pipeline change, track metrics over time.

---

## 11. Common Failure Modes

### 11.1 Retrieval Failures

| Symptom | Likely cause | Fix |
|---|---|---|
| Relevant documents exist but are not retrieved | Poor chunking (answer split across chunks), embedding model mismatch | Try smaller chunks, add overlap, test a different embedding model |
| Top results are all about the wrong topic | Query-document vocabulary mismatch | Add hybrid search (BM25), try query rewriting |
| Retrieved chunks are relevant but too short to be useful | Chunks too small | Increase chunk size, include surrounding context |
| Retrieved chunks are relevant but contain too much noise | Chunks too large, poor document cleaning | Decrease chunk size, improve parsing/cleaning |
| Retrieval works for some query types but not others | Single retrieval strategy does not cover all cases | Add hybrid search, query transformation, per-query-type routing |

### 11.2 Generation Failures

| Symptom | Likely cause | Fix |
|---|---|---|
| Answer contradicts the context | Model ignoring context (especially with strong priors) | Move context closer to the question in the prompt, increase temperature=0, add explicit instruction to only use context |
| Answer is correct but does not cite sources | Citation instruction not strong enough or not in system prompt | Reinforce citation instruction, provide few-shot examples |
| Answer says "I don't know" when context contains the answer | Similarity threshold too high, or context placed too far from question | Lower threshold, restructure prompt, check chunk quality |
| Answer includes information not in the context | Hallucination, model falling back to training data | Add faithfulness check, instruct model to only use provided context, reduce temperature |
| Answer is verbose and unfocused | Too many chunks included, no instruction on conciseness | Reduce number of chunks, add reranking, instruct model on desired length |

### 11.3 Debugging Strategy

When a RAG pipeline gives a bad answer:

1. **Check retrieval first.** Look at the top 10 retrieved chunks. Is the answer in there? If not, generation cannot help — fix retrieval.
2. **Check chunk quality.** If the answer is in a chunk but the chunk is garbled, truncated, or lacks context, fix parsing or chunking.
3. **Check the assembled prompt.** Is the context placed well? Is the instruction clear? Are there too many or too few chunks?
4. **Check generation.** If retrieval is good and the prompt is good but the answer is bad, the problem is the model or the generation parameters.

Always debug from retrieval forward. Most RAG problems are retrieval problems.

---

## 12. Implementation Checklist

When evaluating or extending a RAG template, verify these are addressed:

- [ ] Document loaders for your source formats with proper error handling
- [ ] Parsing tested on real documents from your corpus (not just clean samples)
- [ ] Chunking strategy chosen and chunk size tested with real queries
- [ ] Metadata attached at ingestion time (source, title, date at minimum)
- [ ] Embedding model selected and tested on your domain
- [ ] Vector store appropriate to your scale and infrastructure
- [ ] Retrieval tested with at least 50 representative queries
- [ ] Reranking evaluated (even if you decide not to use it)
- [ ] Prompt template with clear context placement and citation instructions
- [ ] Similarity threshold tuned (not just default)
- [ ] Eval dataset with labeled query-document pairs
- [ ] Retrieval metrics (recall@K, MRR) tracked on every change
- [ ] Generation quality (faithfulness, relevance) tracked on every change
- [ ] Error handling for empty retrieval results
- [ ] Ingestion pipeline is re-runnable (idempotent) for when documents change
