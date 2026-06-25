"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphLink, SociogramNode } from "@/lib/mathEngine";

type RenderGraphNode = SociogramNode & {
  val: number;
  color: string;
  x?: number;
  y?: number;
};

type SociogramGraphProps = {
  nodes: SociogramNode[];
  links: GraphLink[];
  /** Fuerza re-layout al cambiar capa de red. */
  graphKey?: string;
};

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 500;

function toRenderNodes(nodes: SociogramNode[]): RenderGraphNode[] {
  const maxVotes = Math.max(0, ...nodes.map((node) => node.votes));

  return nodes.map((node) => {
    const ratio = maxVotes > 0 ? node.votes / maxVotes : 0;

    return {
      ...node,
      val: 6 + node.votes * 4,
      color:
        node.votes === 0
          ? "#94a3b8"
          : ratio >= 0.75
            ? "#4338ca"
            : ratio >= 0.4
              ? "#6366f1"
              : "#818cf8",
    };
  });
}

function SociogramGraphInner({ nodes, links, graphKey = "default" }: SociogramGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  });
  const [ForceGraph2D, setForceGraph2D] = useState<
    React.ComponentType<Record<string, unknown>> | null
  >(null);

  const renderNodes = useMemo(() => toRenderNodes(nodes), [nodes]);

  const graphData = useMemo(
    () => ({
      nodes: renderNodes,
      links,
    }),
    [renderNodes, links],
  );

  useEffect(() => {
    import("react-force-graph-2d").then((module) => {
      setForceGraph2D(() => module.default);
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    function updateDimensions() {
      const measuredWidth = containerRef.current?.offsetWidth ?? 0;
      setDimensions({
        width: measuredWidth > 0 ? measuredWidth : DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
      });
    }

    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    observer.observe(container);
    window.addEventListener("resize", updateDimensions);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateDimensions);
    };
  }, [ForceGraph2D, links.length]);

  const nodeLabel = useCallback((node: RenderGraphNode) => {
    const votesLabel =
      node.votes === 1 ? "1 conexión" : `${node.votes} conexiones`;
    return `${node.name}\n${votesLabel}`;
  }, []);

  const nodeCanvasObject = useCallback(
    (
      node: RenderGraphNode,
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      const radius = Math.sqrt(node.val) * 2.5;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI, false);
      ctx.fillStyle = node.color;
      ctx.fill();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 / globalScale;
      ctx.stroke();

      const fontSize = Math.max(10, 14 / globalScale);
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#1e293b";
      ctx.fillText(node.name, node.x ?? 0, (node.y ?? 0) + radius + 2);
    },
    [],
  );

  console.log("Nodos:", graphData.nodes, "Enlaces:", graphData.links);

  if (nodes.length === 0) {
    return (
      <div className="flex h-[500px] w-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
        No hay colaboradores para visualizar.
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="flex h-[500px] w-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
        Aún no hay conexiones en este equipo
      </div>
    );
  }

  const graphWidth = dimensions.width > 0 ? dimensions.width : DEFAULT_WIDTH;
  const graphHeight = dimensions.height > 0 ? dimensions.height : DEFAULT_HEIGHT;

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-indigo-50/40"
      style={{ width: "100%", minHeight: DEFAULT_HEIGHT, height: DEFAULT_HEIGHT }}
    >
      {!ForceGraph2D ? (
        <div
          className="flex items-center justify-center text-sm text-slate-500"
          style={{ width: graphWidth, height: graphHeight }}
        >
          Cargando mapa interactivo…
        </div>
      ) : (
        <ForceGraph2D
          key={graphKey}
          graphData={graphData}
          width={graphWidth}
          height={graphHeight}
          backgroundColor="rgba(248, 250, 252, 0.8)"
          nodeLabel={nodeLabel}
          nodeVal="val"
          nodeColor={(node: RenderGraphNode) => node.color}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => "replace"}
          linkColor={() => "rgba(99, 102, 241, 0.45)"}
          linkWidth={1.5}
          linkDirectionalArrowLength={5}
          linkDirectionalArrowRelPos={0.85}
          linkDirectionalParticles={1}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => "#6366f1"}
          cooldownTicks={120}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          enableNodeDrag
          enableZoomInteraction
          enablePanInteraction
        />
      )}
    </div>
  );
}

export default dynamic(() => Promise.resolve(SociogramGraphInner), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] w-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
      Cargando mapa interactivo…
    </div>
  ),
});
