"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type Ref,
} from "react";
import type { ForceGraphMethods } from "react-force-graph-2d";
import type { GraphLink, SociogramNode } from "@/lib/mathEngine";

type AffinityGraphLink = GraphLink & {
  value?: number;
};

export type SociogramGraphData = {
  nodes: SociogramNode[];
  links: AffinityGraphLink[];
};

type RenderGraphNode = SociogramNode & {
  val: number;
  color: string;
  x?: number;
  y?: number;
};

type SociogramGraphProps = {
  graphData?: SociogramGraphData;
  /** Compatibilidad con consumidores legacy (p. ej. admin ONA). */
  nodes?: SociogramNode[];
  links?: GraphLink[];
  /** Prefijo opcional de instancia (p. ej. capa ONA). Se combina con la firma de datos. */
  graphKey?: string;
};

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 500;
const ZOOM_TO_FIT_DURATION_MS = 400;
const ZOOM_TO_FIT_PADDING = 50;

type ForceGraph2DComponent = ComponentType<
  Record<string, unknown> & {
    ref?: Ref<ForceGraphMethods<RenderGraphNode, AffinityGraphLink>>;
  }
>;

/** Firma estable para forzar remount del canvas solo cuando cambian los datos reales. */
export function buildSociogramGraphInstanceKey(
  nodes: SociogramNode[],
  links: AffinityGraphLink[],
  prefix?: string,
): string {
  const nodeSignature = nodes
    .map((node) => `${node.id}:${node.votes}:${node.name}`)
    .join("|");
  const linkSignature = links
    .map((link) => `${link.source}->${link.target}:${link.value ?? 0}`)
    .join("|");

  const dataSignature = `${nodes.length}:${links.length}:${nodeSignature}::${linkSignature}`;

  return prefix ? `${prefix}::${dataSignature}` : dataSignature;
}

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

function cloneGraphPayload(
  nodes: SociogramNode[],
  links: AffinityGraphLink[],
): { nodes: RenderGraphNode[]; links: AffinityGraphLink[] } {
  return {
    nodes: toRenderNodes(nodes.map((node) => ({ ...node }))),
    links: links.map((link) => ({ ...link })),
  };
}

function SociogramGraphInner({
  graphData,
  nodes,
  links,
  graphKey,
}: SociogramGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<
    RenderGraphNode,
    AffinityGraphLink
  > | null>(null);
  const shouldAutoFitRef = useRef(true);

  const [dimensions, setDimensions] = useState({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  });
  const [ForceGraph2D, setForceGraph2D] = useState<ForceGraph2DComponent | null>(
    null,
  );

  const sourceNodes = graphData?.nodes ?? nodes ?? [];
  const sourceLinks = (graphData?.links ?? links ?? []) as AffinityGraphLink[];

  const graphInstanceKey = useMemo(
    () => buildSociogramGraphInstanceKey(sourceNodes, sourceLinks, graphKey),
    [sourceNodes, sourceLinks, graphKey],
  );

  const graphDataForCanvas = useMemo(
    () => cloneGraphPayload(sourceNodes, sourceLinks),
    [graphInstanceKey, sourceNodes, sourceLinks],
  );

  useEffect(() => {
    shouldAutoFitRef.current = true;
  }, [graphInstanceKey]);

  useEffect(() => {
    import("react-force-graph-2d").then((module) => {
      setForceGraph2D(() => module.default as ForceGraph2DComponent);
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    function updateDimensions() {
      const measuredWidth = containerRef.current?.offsetWidth ?? 0;
      const measuredHeight = containerRef.current?.offsetHeight ?? 0;
      setDimensions({
        width: measuredWidth > 0 ? measuredWidth : DEFAULT_WIDTH,
        height: measuredHeight > 0 ? measuredHeight : DEFAULT_HEIGHT,
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
  }, [ForceGraph2D]);

  const runZoomToFit = useCallback(() => {
    if (!shouldAutoFitRef.current) {
      return;
    }

    const graph = fgRef.current;
    if (!graph || graphDataForCanvas.nodes.length === 0) {
      return;
    }

    shouldAutoFitRef.current = false;
    graph.zoomToFit(ZOOM_TO_FIT_DURATION_MS, ZOOM_TO_FIT_PADDING);
  }, [graphDataForCanvas.nodes.length]);

  useEffect(() => {
    if (!ForceGraph2D || graphDataForCanvas.nodes.length === 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      runZoomToFit();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    ForceGraph2D,
    graphInstanceKey,
    dimensions.width,
    dimensions.height,
    graphDataForCanvas.nodes.length,
    runZoomToFit,
  ]);

  const handleEngineStop = useCallback(() => {
    runZoomToFit();
  }, [runZoomToFit]);

  const nodeLabel = useCallback((node: RenderGraphNode) => {
    const votesLabel =
      node.votes === 1 ? "1 conexión" : `${node.votes} conexiones`;
    return `${node.name}\n${votesLabel}`;
  }, []);

  const linkWidth = useCallback((link: AffinityGraphLink) => {
    const affinity = link.value ?? 1;
    return 1 + affinity / 6;
  }, []);

  const linkLabel = useCallback((link: AffinityGraphLink) => {
    if (link.value === undefined) {
      return "";
    }

    return `${link.value} coincidencias EDT`;
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
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(node.name, node.x ?? 0, (node.y ?? 0) + radius + 2);
    },
    [],
  );

  if (sourceNodes.length === 0) {
    return (
      <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden rounded-xl bg-slate-950 text-sm text-slate-400">
        No hay colaboradores para visualizar.
      </div>
    );
  }

  if (sourceLinks.length === 0) {
    return (
      <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden rounded-xl bg-slate-950 text-sm text-slate-400">
        Aún no hay conexiones de afinidad EDT en este equipo
      </div>
    );
  }

  const graphWidth = dimensions.width > 0 ? dimensions.width : DEFAULT_WIDTH;
  const graphHeight = dimensions.height > 0 ? dimensions.height : DEFAULT_HEIGHT;

  return (
    <div
      ref={containerRef}
      className="relative h-[500px] w-full overflow-hidden rounded-xl bg-slate-950"
    >
      {!ForceGraph2D ? (
        <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
          Cargando mapa interactivo…
        </div>
      ) : (
        <ForceGraph2D
          key={graphInstanceKey}
          ref={fgRef}
          graphData={graphDataForCanvas}
          width={graphWidth}
          height={graphHeight}
          backgroundColor="rgba(2, 6, 23, 0.95)"
          nodeLabel={nodeLabel}
          nodeVal="val"
          nodeColor={(node: RenderGraphNode) => node.color}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => "replace"}
          linkLabel={linkLabel}
          linkColor={() => "rgba(99, 102, 241, 0.45)"}
          linkWidth={linkWidth}
          linkDirectionalArrowLength={0}
          linkDirectionalParticles={0}
          cooldownTicks={120}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          onEngineStop={handleEngineStop}
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
    <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden rounded-xl bg-slate-950 text-sm text-slate-400">
      Cargando mapa interactivo…
    </div>
  ),
});
