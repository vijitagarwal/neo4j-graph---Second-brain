# Project Plan: Markdown to Neo4j Knowledge Graph

## Objective
Autonomously scaffold a Node.js data pipeline that reads local Markdown files, extracts entities and relationships using the Groq API (LLaMA 3 model), and pushes the structured data into a local Dockerized Neo4j database.

## Architecture & Tech Stack
*   **Runtime:** Node.js
*   **Database:** Neo4j (Docker)
*   **AI Inference:** Groq SDK (`llama3-8b-8192` or similar fast model)
*   **Dependencies:** `neo4j-driver`, `dotenv`, `fs`, `groq-sdk`

## Phase 1: Environment Setup
1. Initialize a new Node.js project (`package.json`) with `ES6` modules enabled.
2. Install the required dependencies: `neo4j-driver`, `dotenv`, `groq-sdk`.
3. Create a `docker-compose.yml` file that pulls the official `neo4j:latest` image, maps ports `7474:7474` and `7687:7687`, and sets a default dummy password (`NEO4J_AUTH=neo4j/testpassword`).
4. Create a `.env` template file for the `GROQ_API_KEY` and Neo4j credentials.

## Phase 2: Core Logic Implementation
Create an `index.js` file and implement the following modular functions:
1.  **File System Module:** Write a function to recursively read a `./notes` directory and extract raw text from any `.md` files.
2.  **LLM Extraction Module:** Write a function that sends the extracted Markdown text to the Groq API. The system prompt must instruct the LLM to return a strict JSON object with this exact structure: 
    `{ "nodes": [{ "id": "Name", "label": "Category" }], "edges": [{ "source": "Name1", "target": "Name2", "relationship": "KNOWS_ABOUT" }] }`
3.  **Database Connection:** Initialize the `neo4j-driver` and write a function to test the connection.
4.  **Cypher Injection:** Write a function that takes the parsed JSON from Groq and executes the Cypher queries to `MERGE` the nodes and `MERGE` the edges in Neo4j.

## Phase 3: Execution & Testing
1. Create a sample directory called `notes` and generate two dummy markdown files containing a few paragraphs about computer science concepts (e.g., Data Structures, Operating Systems).
2. Wire the modules together in a main execution block in `index.js` so that running `node index.js` processes the files and logs the successful graph injection.
3. Handle API rate limits and add basic `console.log` statements for progress tracking.