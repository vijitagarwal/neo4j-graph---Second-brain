import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';
import neo4j from 'neo4j-driver';
import Groq from 'groq-sdk';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_BATCH_SIZE = Number(process.env.BATCH_SIZE || 5);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ENTITY_ALIASES = {
  os: 'Operating System',
  'operating system': 'Operating System',
  'operating systems': 'Operating System',
  api: 'API',
  'rest api': 'REST API',
  'tcp/ip': 'TCP/IP',
  'tcpip': 'TCP/IP',
  http: 'HTTP',
  https: 'HTTPS',
  'distributed system': 'Distributed System',
  'distributed systems': 'Distributed System',
  'microservice': 'Microservice',
  'microservices': 'Microservice',
  'load balancer': 'Load Balancer',
  'load balancers': 'Load Balancer',
  'database': 'Database',
  'databases': 'Database',
  'network protocol': 'Network Protocol',
  'network protocols': 'Network Protocol',
};

function createNeo4jDriver() {
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const username = process.env.NEO4J_USERNAME || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'testpassword';

  return neo4j.driver(uri, neo4j.auth.basic(username, password));
}

function canonicalizeEntityName(value = '') {
  const clean = String(value)
    .trim()
    .replace(/[\r\n]+/g, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s/\-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const alias = ENTITY_ALIASES[clean];
  if (alias) {
    return alias.toLowerCase();
  }

  return clean || 'unknown';
}

function displayEntityName(value = '') {
  const canonical = canonicalizeEntityName(value);

  const alias = Object.entries(ENTITY_ALIASES).find(([, normalized]) => canonical === normalized.toLowerCase());
  if (alias) {
    return alias[1];
  }

  return canonical
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function chunkArray(items, size = DEFAULT_BATCH_SIZE) {
  const safeSize = Math.max(1, Number(size) || DEFAULT_BATCH_SIZE);
  const chunks = [];

  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize));
  }

  return chunks;
}

async function readMarkdownFiles(dirPath = path.join(__dirname, 'notes')) {
  const directoryEntries = await fs.readdir(dirPath, { withFileTypes: true });
  const markdownFiles = [];

  for (const entry of directoryEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const nestedFiles = await readMarkdownFiles(fullPath);
      markdownFiles.push(...nestedFiles);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const content = await fs.readFile(fullPath, 'utf8');
      markdownFiles.push({
        file: path.relative(__dirname, fullPath),
        content,
      });
    }
  }

  return markdownFiles;
}

function normalizeJsonResponse(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error('Groq response was empty.');
  }

  const stripped = rawContent.trim();

  const fencedMatch = stripped.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fencedMatch) {
    return JSON.parse(fencedMatch[1]);
  }

  const objectMatch = stripped.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return JSON.parse(objectMatch[0]);
  }

  return JSON.parse(stripped);
}

async function callGroqWithRetry(client, model, messages, maxAttempts = 4) {
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      const response = await client.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages,
      });
      return response;
    } catch (error) {
      const status = error?.status || error?.statusCode;

      if (status === 429 && attempt < maxAttempts - 1) {
        const delayMs = 1000 * 2 ** attempt + Math.floor(Math.random() * 500);
        console.warn(`Groq rate limit hit. Retrying in ${delayMs}ms (attempt ${attempt + 2}/${maxAttempts}).`);
        await sleep(delayMs);
        attempt += 1;
        continue;
      }

      throw error;
    }
  }
}

async function extractGraphFromMarkdown(markdownText) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GROQ_API_KEY. Add it to the .env file before running the pipeline.');
  }

  const client = new Groq({ apiKey });
  const model = process.env.GROQ_MODEL || 'llama3-8b-8192';

  const systemPrompt = `You are a strict knowledge graph extraction engine.
Transform the provided Markdown notes into a JSON object with exactly this schema:
{
  "nodes": [{ "id": "Name", "label": "Category" }],
  "edges": [{ "source": "Name1", "target": "Name2", "relationship": "KNOWS_ABOUT" }]
}
Rules:
- Return only valid JSON and nothing else.
- Use concise names rather than long sentences.
- Normalize entity names by merging common synonyms such as OS and Operating System.
- Prefer a small graph with relevant entities and relationships.
- Ensure the relationship type is uppercase and consistent.
- Use relationship values such as USES, RELATED_TO, DEPENDS_ON, IMPLEMENTS, RUNS_ON.
- If no entities are found, return {"nodes": [], "edges": []}.`;

  const response = await callGroqWithRetry(client, model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: markdownText.slice(0, 8000) },
  ]);


  const content = response?.choices?.[0]?.message?.content;
  return normalizeJsonResponse(content);
}

function deduplicateGraph(payload) {
  const nodeMap = new Map();
  const edgeMap = new Map();

  for (const node of Array.isArray(payload?.nodes) ? payload.nodes : []) {
    const originalName = String(node?.id ?? '').trim();
    if (!originalName) {
      continue;
    }

    const canonical = canonicalizeEntityName(originalName);
    const existing = nodeMap.get(canonical) || {
      id: displayEntityName(originalName),
      label: node?.label || 'Concept',
      canonicalName: canonical,
      aliases: [],
    };

    existing.id = displayEntityName(originalName);
    existing.label = node?.label || existing.label || 'Concept';

    if (!existing.aliases.includes(originalName)) {
      existing.aliases.push(originalName);
    }

    nodeMap.set(canonical, existing);
  }

  for (const edge of Array.isArray(payload?.edges) ? payload.edges : []) {
    const source = String(edge?.source ?? '').trim();
    const target = String(edge?.target ?? '').trim();
    const relationship = String(edge?.relationship ?? 'RELATED_TO').trim().toUpperCase();

    if (!source || !target) {
      continue;
    }

    const canonicalSource = canonicalizeEntityName(source);
    const canonicalTarget = canonicalizeEntityName(target);
    const key = `${canonicalSource}|${relationship}|${canonicalTarget}`;

    if (!edgeMap.has(key)) {
      edgeMap.set(key, {
        source: displayEntityName(source),
        target: displayEntityName(target),
        relationship,
      });
    }
  }

  return {
    nodes: [...nodeMap.values()].map((node) => ({
      id: node.id,
      label: node.label,
      canonicalName: node.canonicalName,
      aliases: node.aliases,
    })),
    edges: [...edgeMap.values()],
  };
}

async function testNeo4jConnection(driver) {
  const session = driver.session();

  try {
    const result = await session.run('RETURN 1 AS ok');
    return result.records[0].get('ok');
  } finally {
    await session.close();
  }
}

async function injectGraphIntoNeo4j(driver, payload) {
  const session = driver.session();
  const nodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
  const edges = Array.isArray(payload?.edges) ? payload.edges : [];

  try {
    if (nodes.length > 0) {
      await session.run(
        `
        UNWIND $nodes AS node
        MERGE (n:Entity {name: node.id})
        ON CREATE SET n.label = node.label, n.canonicalName = toLower(node.id)
        ON MATCH SET n.label = coalesce(node.label, n.label)
        `,
        { nodes }
      );
    }

    if (edges.length > 0) {
      await session.run(
        `
        UNWIND $edges AS edge
        MATCH (source:Entity {name: edge.source})
        MATCH (target:Entity {name: edge.target})
        MERGE (source)-[r:RELATIONSHIP]->(target)
        SET r.type = edge.relationship
        `,
        { edges }
      );
    }

    return {
      insertedNodes: nodes.length,
      insertedEdges: edges.length,
    };
  } finally {
    await session.close();
  }
}

async function main() {
  console.log('Reading Markdown notes from ./notes...');

  const markdownFiles = await readMarkdownFiles();

  if (!markdownFiles.length) {
    console.warn('No Markdown files found in ./notes. Add some .md files and run the script again.');
    return;
  }

  const batches = chunkArray(markdownFiles, Number(process.env.BATCH_SIZE || 5));
  const driver = createNeo4jDriver();

  try {
    const connectionValue = await testNeo4jConnection(driver);
    console.log(`Neo4j connection successful: ${connectionValue}`);

    let totalNodes = 0;
    let totalEdges = 0;

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      const markdownText = batch
        .map(({ file, content }) => `# ${file}\n${content}`)
        .join('\n\n');

      console.log(`Processing batch ${index + 1}/${batches.length} with ${batch.length} file(s)...`);

      const rawGraph = await extractGraphFromMarkdown(markdownText);
      const dedupedGraph = deduplicateGraph(rawGraph);
      const summary = await injectGraphIntoNeo4j(driver, dedupedGraph);

      totalNodes += summary.insertedNodes;
      totalEdges += summary.insertedEdges;
      console.log(`Batch ${index + 1} complete: ${summary.insertedNodes} nodes, ${summary.insertedEdges} edges.`);
    }

    console.log(`Graph ingestion complete: ${totalNodes} total nodes and ${totalEdges} total edges merged.`);
  } catch (error) {
    console.error('Failed to connect to Neo4j or inject the graph:', error.message);
    process.exitCode = 1;
  } finally {
    await driver.close();
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((error) => {
    console.error('Pipeline failed:', error.message);
    process.exit(1);
  });
}

export {
  readMarkdownFiles,
  extractGraphFromMarkdown,
  createNeo4jDriver,
  injectGraphIntoNeo4j,
  testNeo4jConnection,
  deduplicateGraph,
  chunkArray,
  canonicalizeEntityName,
  displayEntityName,
  main,
};
