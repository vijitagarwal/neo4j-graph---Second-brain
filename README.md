# Neo4j Second Brain Project

## Project Overview
This project is a Node.js pipeline that reads local Markdown notes, extracts knowledge graph entities and relationships using the Groq API, and stores the result in a Neo4j graph database. The goal is to turn local notes into a searchable, connected knowledge graph that can support future semantic retrieval, graph queries, and AI-driven reasoning.

The project is intentionally simple and modular so it can be extended later with better extraction logic, entity deduplication, embeddings, or a web interface.

---

## Current Status
The project is now in a multi-stage prototype state: the backend ingestion pipeline is implemented and improved, and a frontend dashboard scaffold exists, but live end-to-end validation against Neo4j and Groq is still required on a machine with Docker and a valid API key.

Completed:
- Node.js project initialized with ES modules enabled
- Project dependencies installed for the backend and frontend
- Docker Compose file added for a local Neo4j database
- Environment templates created for Groq and Neo4j configuration
- Sample Markdown notes created for pipeline testing
- Batch-aware ETL processing implemented in the backend
- Retry logic for Groq 429 rate limits added
- Entity normalization and deduplication added for common aliases such as OS / Operating System
- Next.js dashboard scaffolded to visualize graph data
- Graph API route added to query Neo4j and return graph JSON for the frontend

Still pending for full verification:
- Docker not available in this execution environment, so Neo4j live startup has not yet been validated here
- Groq API key is still required for live extraction testing
- Full pipeline execution against actual Neo4j data has not been confirmed in this session
- Browser rendering and graph visual behavior still need runtime validation in a real local environment

---

## High-Level Architecture

### Components
1. File ingestion layer
   - Recursively reads files in a `notes` folder
   - Collects all `.md` files
   - Extracts raw Markdown text

2. LLM extraction layer
   - Sends Markdown to Groq using a model such as `llama3-8b-8192`
   - Uses a strict prompt to force JSON output of the form:
     ```json
     {
       "nodes": [{ "id": "Name", "label": "Category" }],
       "edges": [{ "source": "Name1", "target": "Name2", "relationship": "KNOWS_ABOUT" }]
     }
     ```

3. Neo4j persistence layer
   - Connects to Neo4j via the official driver
   - Merges nodes using `MERGE`
   - Merges relationships using `MERGE` on connected pairs
   - Stores labels and relationship types in graph properties

4. Execution orchestration
   - Reads notes
   - Sends combined note content to the LLM
   - Parses JSON output
   - Injects graph into Neo4j
   - Logs progress and success

---

## Project Structure

```text
neo4js second brain/
├── .env
├── .env.example
├── .gitignore
├── docker-compose.yml
├── index.js
├── package.json
├── notes/
│   ├── algorithms.md
│   ├── api-design.md
│   ├── cloud-computing.md
│   ├── computer-science.md
│   ├── database-systems.md
│   ├── devops.md
│   ├── distributed-systems.md
│   ├── machine-learning.md
│   ├── networking.md
│   ├── operating-systems.md
│   ├── os-fundamentals.md
│   ├── security.md
│   ├── software-architecture.md
│   └── ...
├── README.md
└── web/
    ├── src/
    ├── package.json
    └── ...
```

### File responsibilities

#### `package.json`
Defines the project metadata and dependencies.

Includes:
- `type: "module"` for ES modules
- `start` script: `node index.js`
- `docker:up` / `docker:down` convenience scripts

#### `docker-compose.yml`
Starts Neo4j using the official Docker image.

Ports:
- `7474:7474` for the browser UI
- `7687:7687` for Bolt connection

Credentials:
- Username: `neo4j`
- Password: `testpassword`

#### `.env.example`
Template for local config.

Contains:
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `NEO4J_URI`
- `NEO4J_USERNAME`
- `NEO4J_PASSWORD`

#### `index.js`
The main implementation file.

Contains modules for:
- reading Markdown files recursively
- normalizing raw LLM output into valid JSON
- calling the Groq API
- connecting to Neo4j
- testing the database connectivity
- injecting nodes and relationships into the graph
- running the pipeline in a main execution block

#### `notes/`
Sample files used to verify the project works before production notes are added.

---

## Implementation Details

### 1. Markdown ingestion and batching
The app recursively scans the `notes` directory and finds any `.md` file. It reads each file and stores:
- relative path
- content

This is done in `readMarkdownFiles()`. The pipeline then chunks note collections into configurable batches (default: 5 files) to reduce context overflow and keep LLM prompting manageable.

### 2. LLM extraction prompt and retry logic
The project sends Markdown content to Groq with a strict system prompt telling the model to return valid JSON only.

The expected schema is:
```json
{
  "nodes": [{ "id": "Name", "label": "Category" }],
  "edges": [{ "source": "Name1", "target": "Name2", "relationship": "KNOWS_ABOUT" }]
}
```

The code also contains a guard that tries to extract JSON from fenced markdown blocks or fallback match patterns if the model adds formatting. Groq responses are retried with exponential backoff when a `429` rate-limit error is returned.

### 3. Neo4j connection
The database driver is initialized using:
```js
neo4j.driver(uri, neo4j.auth.basic(username, password))
```

The app tests connectivity using a simple Cypher query:
```cypher
RETURN 1 AS ok
```

### 4. Deduplication and graph injection
The app normalizes common entity aliases such as `OS`, `Operating System`, and similar variants before merging them into a single canonical node. That reduces duplicate graph entries and produces more coherent graph data.

Graph injection occurs with Cypher merges as follows:

Nodes:
```cypher
UNWIND $nodes AS node
MERGE (n:Entity {name: node.id})
ON CREATE SET n.label = node.label, n.canonicalName = toLower(node.id)
```

Edges:
```cypher
UNWIND $edges AS edge
MATCH (source:Entity {name: edge.source})
MATCH (target:Entity {name: edge.target})
MERGE (source)-[r:RELATIONSHIP]->(target)
SET r.type = edge.relationship
```

This makes the graph resilient to repeated ingestion runs without duplicating nodes or edges.

---

## How the Pipeline Works

The program flow is:

1. Load environment variables from `.env`
2. Read all Markdown files from `./notes`
3. Combine all note content into a single text payload
4. Send that payload to Groq with a strict extraction prompt
5. Parse the returned JSON
6. Connect to Neo4j
7. Merge nodes and edges
8. Log success summary

---

## Sample Data Included
The project currently includes a broader mock knowledge base covering software engineering topics:

- `notes/software-architecture.md`
- `notes/networking.md`
- `notes/os-fundamentals.md`
- `notes/distributed-systems.md`
- `notes/database-systems.md`
- `notes/cloud-computing.md`
- `notes/security.md`
- `notes/algorithms.md`
- `notes/machine-learning.md`
- `notes/api-design.md`
- `notes/devops.md`

These notes cover topics such as:
- architecture patterns
- networking protocols
- operating systems
- distributed systems
- databases
- cloud systems
- security
- algorithms
- ML pipelines
- API design
- DevOps workflows

This dataset is intended to stress-test the pipeline and create richer graph relationships than the original minimal example set.

---

## Required Environment

### Local machine requirements
- Node.js installed
- npm installed
- Docker installed (for Neo4j)
- Groq API key
- A local terminal environment able to run both Node.js and Docker Compose

### Environment variables
In `.env`, set:
```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama3-8b-8192
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=testpassword
BATCH_SIZE=5
```

---

## Run Instructions

### 1. Install dependencies
```bash
npm install
npm --prefix web install
```

### 2. Start Neo4j
```bash
docker compose up -d
```

### 3. Run the app locally
```bash
npm run dev
```

This should launch the backend ingestion pipeline and the Next.js dashboard together.

### 4. Check the result in Neo4j browser
Open:
```text
http://localhost:7474
```

Use:
- username: `neo4j`
- password: `testpassword`

Then run queries such as:
```cypher
MATCH (n)-[r]->(m)
RETURN n, r, m
LIMIT 25;
```

### 5. Open the dashboard
Open:
```text
http://localhost:3000
```

This is the frontend graph visualization page that reads from the Neo4j graph API.

---

## What This Project Is Good For
This project is a strong starting point for:
- personal knowledge graphs
- research note linking
- idea discovery from notes
- semantic network visualizations
- future AI memory systems
- LLM-grounded knowledge retrieval

---

## Current Limitations
At this stage, the project is intentionally minimal. It does not yet include:
- entity deduplication across files
- relationship normalization
- confidence scoring
- embeddings for semantic search
- rate-limit retry logic for Groq API failures
- a web UI or dashboard
- database schema versioning
- a proper CLI argument system
- dataset summarization and enrichment

---

## Recommended Next Steps
The next logical improvements are:

### Phase 1: Reliability
- Add retry logic for Groq API rate limits
- Handle empty or invalid LLM responses more gracefully
- Add logging and progress stages for each pipeline step
- Validate against a real Neo4j instance

### Phase 2: Data quality
- Deduplicate overlapping concepts like `Operating System` vs `OS`
- Normalize labels and relationship names
- Handle repeated notes and incremental graph updates
- Add support for file metadata such as timestamps and source links

### Phase 3: Intelligence
- Extract not just nodes and edges, but richer metadata
- Include entity types like Person, Concept, Tool, Project, Topic
- Add a summarization pass for each note
- Store embeddings for semantic retrieval

### Phase 4: Productization
- Build a web dashboard to visualize graph relationships
- Add search by node or topic
- Add export/import features
- Integrate with a vector database for hybrid retrieval

---

## Best AI Prompt to Continue This Project
If you want to ask another AI for guidance, use something like:

```text
I have a Node.js project that reads Markdown notes, calls Groq to extract a knowledge graph in JSON format, and stores nodes/edges in Neo4j. The project is scaffolded in this workspace and currently includes sample notes, Docker Compose for Neo4j, and a working pipeline skeleton. Please review the project and recommend the best next steps to make it production-ready, with a focus on reliability, extraction quality, and graph design.
```

A good follow-up to that prompt would be:

```text
Based on the current project, propose a prioritized roadmap, identify the biggest technical risks, and suggest the next minimal feature set to implement.
```

---

## Summary
This project already lays the foundation for a local markdown-to-knowledge-graph system. It is structurally sound, modular, and ready for the next stage of real-world testing. The most important next move is to validate the end-to-end flow with a live Groq API key and a running Neo4j instance, then improve reliability and extraction quality before scaling the graph.

This is a good base for a personal second-brain system, research graph, or AI memory layer.
