"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

type GraphNode = {
  id: string;
  name: string;
  label?: string;
};

type GraphLink = {
  source: string;
  target: string;
  relationship: string;
};

export default function Home() {
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadGraph() {
      try {
        setLoading(true);
        const response = await fetch("/api/graph");

        if (!response.ok) {
          throw new Error(`Failed to load graph data (${response.status})`);
        }

        const data = await response.json();
        setGraphData({
          nodes: data.nodes ?? [],
          links: data.links ?? [],
        });
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    loadGraph();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg shadow-slate-950/40">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-400">
            Neo4j Second Brain
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white">Knowledge Graph Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Visualizing the extracted relationships from Markdown notes across software architecture,
            networking, and operating systems concepts.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          {error ? (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
              Unable to load graph data: {error}
            </div>
          ) : loading ? (
            <div className="flex h-[620px] items-center justify-center text-sm text-slate-300">
              Loading graph…
            </div>
          ) : (
            <ForceGraph2D
              graphData={graphData}
              width={1200}
              height={620}
              nodeRelSize={8}
              nodeLabel={(node) => `${node.name ?? node.id} ${node.label ? `· ${node.label}` : ""}`}
              linkDirectionalArrowLength={8}
              linkDirectionalArrowRelPos={0.8}
              linkLabel={(link) => `${link.relationship}`}
              backgroundColor="#0f172a"
              nodeColor={(node) => {
                const id = String(node.id ?? "");
                return id.includes("Operating") || id.includes("System") ? "#22d3ee" : "#a78bfa";
              }}
              linkColor={() => "#94a3b8"}
              d3VelocityDecay={0.4}
              cooldownTicks={100}
            />
          )}
        </section>
      </div>
    </main>
  );
}
