import neo4j from 'neo4j-driver';

export async function GET() {
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const username = process.env.NEO4J_USERNAME || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'testpassword';

  const driver = neo4j.driver(uri, neo4j.auth.basic(username, password));

  try {
    const session = driver.session();
    const result = await session.run(`
      MATCH (n)-[r]->(m)
      RETURN n, r, m
    `);

    const nodes = new Map<string, { id: string; name: string; label?: string }>();
    const links: Array<{ source: string; target: string; relationship: string }> = [];

    for (const record of result.records) {
      const sourceNode = record.get('n');
      const relationship = record.get('r');
      const targetNode = record.get('m');

      const sourceId = sourceNode.properties.name ?? sourceNode.identity.toString();
      const targetId = targetNode.properties.name ?? targetNode.identity.toString();

      if (!nodes.has(sourceId)) {
        nodes.set(sourceId, {
          id: sourceId,
          name: sourceNode.properties.name ?? sourceId,
          label: sourceNode.labels[0] ?? 'Entity',
        });
      }

      if (!nodes.has(targetId)) {
        nodes.set(targetId, {
          id: targetId,
          name: targetNode.properties.name ?? targetId,
          label: targetNode.labels[0] ?? 'Entity',
        });
      }

      links.push({
        source: sourceId,
        target: targetId,
        relationship: relationship.type,
      });
    }

    return Response.json({
      nodes: [...nodes.values()],
      links,
    });
  } catch (error) {
    console.error('Graph API error:', error);
    return Response.json(
      {
        nodes: [],
        links: [],
        error: 'Unable to load graph data from Neo4j.',
      },
      { status: 500 }
    );
  } finally {
    await driver.close();
  }
}
