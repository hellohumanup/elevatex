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
  /** true si existe el arco inverso (canal de confianza mutua). */
  isReciprocal?: boolean;
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
  fx?: number | null;
  fy?: number | null;
};

type SociogramGraphProps = {
  graphData?: SociogramGraphData;
  /** Compatibilidad con consumidores legacy (p. ej. admin ONA). */
  nodes?: SociogramNode[];
  links?: GraphLink[];
  /** Grafo dirigido (nombramientos ONA: source → target). */
  directed?: boolean;
  /** Mensaje cuando no hay enlaces. */
  emptyLinksMessage?: string;
  /** Prefijo opcional de instancia (p. ej. capa ONA). Se combina con la firma de datos. */
  graphKey?: string;
  /** Click en nodo → ficha individual del colaborador. */
  onNodeClick?: (node: SociogramNode) => void;
  /** Ancho inicial/forzado del canvas (evita colapso a 0px en hidratación). */
  width?: number;
  /** Alto inicial/forzado del canvas (evita colapso a 0px en hidratación). */
  height?: number;
};

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 500;
const GRAPH_CONTAINER_CLASS =
  "relative h-[500px] w-full touch-none overflow-hidden rounded-xl bg-slate-950 [&_.force-graph-container]:h-full [&_.force-graph-container]:w-full [&_canvas]:block [&>div]:h-full [&>div]:w-full";
const ZOOM_TO_FIT_DURATION_MS = 450;
const ZOOM_TO_FIT_PADDING = 72;

/** Repulsión entre nodos (más negativo = más separación). */
const CHARGE_STRENGTH = -240;
/** Distancia objetivo de los enlaces en el layout de fuerzas. */
const LINK_DISTANCE = 120;
/** Margen extra alrededor del círculo + etiqueta para la fuerza collide. */
const COLLIDE_PADDING = 20;
const LABEL_GAP = 8;
const MAX_VISIBLE_NAME_LENGTH = 20;

/** Grosor por defecto cuando el enlace no trae peso ONA. */
const DEFAULT_LINK_WIDTH = 1;
/** Factor de escala: weight 1.0 → 3px, 0.7 → 2.1px, 0.4 → 1.2px. */
const WEIGHTED_LINK_WIDTH_SCALE = 3;

/** Colores ONA (Tailwind indigo/violet) según fuerza del voto — solo unidireccionales. */
const LINK_COLOR_STRONG = "rgba(129, 140, 248, 0.95)"; // indigo-400
const LINK_COLOR_MEDIUM = "rgba(139, 92, 246, 0.72)"; // violet-500
const LINK_COLOR_WEAK = "rgba(99, 102, 241, 0.28)"; // indigo-500 tenue
const LINK_COLOR_DEFAULT_DIRECTED = "rgba(129, 140, 248, 0.55)";
const LINK_COLOR_DEFAULT_UNDIRECTED = "rgba(99, 102, 241, 0.45)";

/** Canal mutuo A↔B — verde esmeralda (confianza relacional). */
const LINK_COLOR_RECIPROCAL_GLOW = "rgba(16, 185, 129, 0.92)"; // #10B981
const LINK_ARROW_RECIPROCAL = "rgba(52, 211, 153, 0.98)"; // emerald-400
const LINK_PARTICLE_RECIPROCAL = "#34D399";
const LINK_PARTICLE_STRONG = "rgba(165, 180, 252, 0.95)";
const LINK_PARTICLE_MEDIUM = "rgba(167, 139, 250, 0.85)";
const LINK_PARTICLE_WEAK = "rgba(129, 140, 248, 0.55)";

function resolveEndpointId(endpoint: unknown): string {
  if (endpoint === null || endpoint === undefined) {
    return "";
  }

  if (typeof endpoint === "object") {
    const id = (endpoint as { id?: unknown }).id;
    return id === null || id === undefined ? "" : String(id).trim();
  }

  return String(endpoint).trim();
}

function directedEdgeKey(sourceId: string, targetId: string): string {
  return `${sourceId}\u2192${targetId}`;
}

/** Lee el peso ONA de un enlace de forma segura (ForceGraph puede mutar source/target). */
function resolveLinkWeight(link: AffinityGraphLink | null | undefined): number | null {
  if (!link || typeof link !== "object") {
    return null;
  }

  const weight = link.weight;
  if (typeof weight === "number" && Number.isFinite(weight) && weight > 0) {
    return weight;
  }

  return null;
}

function isReciprocalLink(link: AffinityGraphLink | null | undefined): boolean {
  return link?.isReciprocal === true;
}

/**
 * Marca cada enlace como recíproco si ya trae `isReciprocal: true`
 * o si existe el arco inverso equivalente en el array de links.
 */
function enrichLinksWithReciprocity(
  links: readonly AffinityGraphLink[],
): AffinityGraphLink[] {
  const directedEdges = new Set<string>();

  for (const link of links) {
    const sourceId = resolveEndpointId(link?.source);
    const targetId = resolveEndpointId(link?.target);

    if (!sourceId || !targetId || sourceId === targetId) {
      continue;
    }

    directedEdges.add(directedEdgeKey(sourceId, targetId));
  }

  return links.map((link) => {
    const sourceId = resolveEndpointId(link?.source);
    const targetId = resolveEndpointId(link?.target);
    const reverseExists =
      sourceId.length > 0 &&
      targetId.length > 0 &&
      directedEdges.has(directedEdgeKey(targetId, sourceId));

    return {
      ...link,
      isReciprocal: link?.isReciprocal === true || reverseExists,
    };
  });
}

function resolveLinkWidth(link: AffinityGraphLink, directed: boolean): number {
  const weight = resolveLinkWeight(link);
  const reciprocalBoost = isReciprocalLink(link) ? 1.15 : 1;

  if (weight !== null) {
    return Math.max(0.75, weight * WEIGHTED_LINK_WIDTH_SCALE * reciprocalBoost);
  }

  if (!directed) {
    const affinity = link?.value;
    if (typeof affinity === "number" && Number.isFinite(affinity)) {
      return (1 + affinity / 6) * reciprocalBoost;
    }
  }

  return DEFAULT_LINK_WIDTH * reciprocalBoost;
}

function resolveLinkColor(link: AffinityGraphLink, directed: boolean): string {
  if (isReciprocalLink(link)) {
    return LINK_COLOR_RECIPROCAL_GLOW;
  }

  const weight = resolveLinkWeight(link);

  if (weight !== null) {
    if (weight >= 0.95) {
      return LINK_COLOR_STRONG;
    }
    if (weight >= 0.6) {
      return LINK_COLOR_MEDIUM;
    }
    return LINK_COLOR_WEAK;
  }

  return directed ? LINK_COLOR_DEFAULT_DIRECTED : LINK_COLOR_DEFAULT_UNDIRECTED;
}

function resolveLinkArrowColor(link: AffinityGraphLink): string {
  if (isReciprocalLink(link)) {
    return LINK_ARROW_RECIPROCAL;
  }

  const weight = resolveLinkWeight(link);

  if (weight !== null && weight >= 0.95) {
    return "rgba(167, 139, 250, 0.95)"; // violet-400
  }
  if (weight !== null && weight >= 0.6) {
    return "rgba(167, 139, 250, 0.75)";
  }
  if (weight !== null) {
    return "rgba(167, 139, 250, 0.35)";
  }

  return "rgba(167, 139, 250, 0.9)";
}

function resolveLinkParticleColor(link: AffinityGraphLink): string {
  if (isReciprocalLink(link)) {
    return LINK_PARTICLE_RECIPROCAL;
  }

  const weight = resolveLinkWeight(link);

  if (weight !== null && weight >= 0.95) {
    return LINK_PARTICLE_STRONG;
  }
  if (weight !== null && weight >= 0.6) {
    return LINK_PARTICLE_MEDIUM;
  }
  if (weight !== null) {
    return LINK_PARTICLE_WEAK;
  }

  return LINK_PARTICLE_MEDIUM;
}

/** Más partículas en canales mutuos para leer el flujo bidireccional. */
function resolveLinkParticleCount(link: AffinityGraphLink, directed: boolean): number {
  if (!directed) {
    return 0;
  }

  if (isReciprocalLink(link)) {
    return 4;
  }

  const weight = resolveLinkWeight(link);
  if (weight !== null && weight >= 0.95) {
    return 2;
  }
  if (weight !== null && weight >= 0.6) {
    return 1;
  }

  return 0;
}

function resolveLinkParticleSpeed(link: AffinityGraphLink): number {
  return isReciprocalLink(link) ? 0.006 : 0.0035;
}

function resolveLinkParticleWidth(link: AffinityGraphLink): number {
  return isReciprocalLink(link) ? 2.4 : 1.4;
}

function getNodeCanvasRadius(node: RenderGraphNode): number {
  return Math.sqrt(Math.max(node.val ?? 1, 1)) * 2.5;
}

function getNodeCollisionRadius(node: RenderGraphNode): number {
  const circleRadius = getNodeCanvasRadius(node);
  return circleRadius + LABEL_GAP + 12 + COLLIDE_PADDING;
}

function truncateNodeLabel(name: string): string {
  const trimmed = typeof name === "string" ? name.trim() : "";

  if (trimmed.length <= MAX_VISIBLE_NAME_LENGTH) {
    return trimmed || "—";
  }

  return `${trimmed.slice(0, MAX_VISIBLE_NAME_LENGTH - 1)}…`;
}

type ForceGraph2DComponent = ComponentType<
  Record<string, unknown> & {
    ref?: Ref<ForceGraphMethods<RenderGraphNode, AffinityGraphLink>>;
  }
>;

/** Firma estable para forzar remount del canvas solo cuando cambian los datos reales. */
export function buildSociogramGraphInstanceKey(
  nodes: SociogramNode[] | null | undefined,
  links: AffinityGraphLink[] | null | undefined,
  prefix?: string,
): string {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeLinks = Array.isArray(links) ? links : [];

  const nodeSignature = safeNodes
    .map(
      (node) =>
        `${node?.id ?? "?"}:${node?.votes ?? 0}:${node?.weightedVotes ?? 0}:${node?.name ?? ""}`,
    )
    .join("|");
  const linkSignature = safeLinks
    .map((link) => {
      const source = resolveEndpointId(link?.source);
      const target = resolveEndpointId(link?.target);
      return `${source}->${target}:w${link?.weight ?? 0}:v${link?.value ?? 0}:r${link?.isReciprocal ? 1 : 0}`;
    })
    .join("|");

  const dataSignature = `${safeNodes.length}:${safeLinks.length}:${nodeSignature}::${linkSignature}`;

  return prefix ? `${prefix}::${dataSignature}` : dataSignature;
}

function toRenderNodes(nodes: SociogramNode[]): RenderGraphNode[] {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const maxVotes = Math.max(0, ...safeNodes.map((node) => node?.votes ?? 0));

  return safeNodes.map((node) => {
    const votes = node?.votes ?? 0;
    const ratio = maxVotes > 0 ? votes / maxVotes : 0;

    return {
      ...node,
      id: String(node?.id ?? ""),
      name: typeof node?.name === "string" ? node.name : String(node?.id ?? ""),
      votes,
      val: 5 + votes * 3,
      color:
        votes === 0
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
  nodes: SociogramNode[] | null | undefined,
  links: AffinityGraphLink[] | null | undefined,
): { nodes: RenderGraphNode[]; links: AffinityGraphLink[] } {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeLinks = Array.isArray(links) ? links : [];
  const enrichedLinks = enrichLinksWithReciprocity(safeLinks);

  return {
    nodes: toRenderNodes(safeNodes.map((node) => ({ ...node }))),
    links: enrichedLinks.map((link) => ({
      ...link,
      weight:
        typeof link?.weight === "number" && Number.isFinite(link.weight)
          ? link.weight
          : link?.weight,
      value: link?.value,
      isReciprocal: link.isReciprocal === true,
    })),
  };
}

function SociogramGraphInner({
  graphData,
  nodes,
  links,
  directed = false,
  emptyLinksMessage,
  graphKey,
  onNodeClick,
  width: widthProp,
  height: heightProp,
}: SociogramGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<
    RenderGraphNode,
    AffinityGraphLink
  > | null>(null);
  const shouldAutoFitRef = useRef(true);

  const initialWidth =
    typeof widthProp === "number" && widthProp > 0 ? widthProp : DEFAULT_WIDTH;
  const initialHeight =
    typeof heightProp === "number" && heightProp > 0
      ? heightProp
      : DEFAULT_HEIGHT;

  const [dimensions, setDimensions] = useState({
    width: initialWidth,
    height: initialHeight,
  });
  const [ForceGraph2D, setForceGraph2D] = useState<ForceGraph2DComponent | null>(
    null,
  );

  const sourceNodes = Array.isArray(graphData?.nodes)
    ? graphData.nodes
    : Array.isArray(nodes)
      ? nodes
      : [];
  const sourceLinks = (
    Array.isArray(graphData?.links)
      ? graphData.links
      : Array.isArray(links)
        ? links
        : []
  ) as AffinityGraphLink[];

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
    if (process.env.NODE_ENV === "development") {
      console.log("[SociogramGraph] graphData recibido:", {
        graphKey,
        nodeCount: sourceNodes.length,
        linkCount: sourceLinks.length,
        sampleNode: sourceNodes[0] ?? null,
        sampleLink: sourceLinks[0] ?? null,
      });
    }
  }, [graphInstanceKey, graphKey, sourceNodes, sourceLinks]);

  useEffect(() => {
    let cancelled = false;

    import("react-force-graph-2d")
      .then((module) => {
        if (!cancelled) {
          setForceGraph2D(() => module.default as ForceGraph2DComponent);
        }
      })
      .catch((error) => {
        console.error("[SociogramGraph] Error cargando react-force-graph-2d:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    function updateDimensions() {
      const measuredWidth = containerRef.current?.clientWidth ?? 0;
      const measuredHeight = containerRef.current?.clientHeight ?? 0;
      setDimensions({
        width: measuredWidth > 0 ? measuredWidth : initialWidth,
        // Altura fija del contenedor (h-[500px]); nunca dejar el canvas en 0.
        height: measuredHeight > 0 ? measuredHeight : initialHeight,
      });
    }

    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    observer.observe(container);
    window.addEventListener("resize", updateDimensions);

    // Evita que el scroll de la página robe el zoom de la rueda sobre el canvas.
    function handleWheel(event: WheelEvent) {
      event.preventDefault();
    }

    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateDimensions);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [ForceGraph2D, initialWidth, initialHeight]);

  const configureSimulationForces = useCallback(async () => {
    const graph = fgRef.current;
    if (!graph) {
      return;
    }

    const { forceCollide } = await import("d3-force-3d");

    const chargeForce = graph.d3Force("charge");
    if (chargeForce && typeof chargeForce.strength === "function") {
      chargeForce.strength(CHARGE_STRENGTH);
    }

    const linkForce = graph.d3Force("link");
    if (linkForce && typeof linkForce.distance === "function") {
      linkForce.distance(LINK_DISTANCE);
    }

    graph.d3Force(
      "collide",
      forceCollide<RenderGraphNode>()
        .radius((node) => getNodeCollisionRadius(node as RenderGraphNode))
        .strength(0.9)
        .iterations(3),
    );

    graph.d3ReheatSimulation();
  }, []);

  useEffect(() => {
    if (!ForceGraph2D || graphDataForCanvas.nodes.length === 0) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      if (cancelled) {
        return;
      }

      await configureSimulationForces();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    ForceGraph2D,
    graphInstanceKey,
    graphDataForCanvas.nodes.length,
    configureSimulationForces,
  ]);

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

  const nodeLabel = useCallback(
    (node: RenderGraphNode) => {
      const votesLabel = directed
        ? node.votes === 1
          ? "1 nombramiento recibido"
          : `${node.votes} nombramientos recibidos`
        : node.votes === 1
          ? "1 conexión"
          : `${node.votes} conexiones`;

      return `${node.name}\n${votesLabel}`;
    },
    [directed],
  );

  const linkWidth = useCallback(
    (link: AffinityGraphLink) => resolveLinkWidth(link, directed),
    [directed],
  );

  const linkColor = useCallback(
    (link: AffinityGraphLink) => resolveLinkColor(link, directed),
    [directed],
  );

  const linkDirectionalArrowColor = useCallback(
    (link: AffinityGraphLink) => resolveLinkArrowColor(link),
    [],
  );

  const linkDirectionalArrowLength = useCallback(
    (link: AffinityGraphLink) => {
      if (!directed) {
        return 0;
      }

      return isReciprocalLink(link) ? 6.5 : 5;
    },
    [directed],
  );

  const linkDirectionalParticles = useCallback(
    (link: AffinityGraphLink) => resolveLinkParticleCount(link, directed),
    [directed],
  );

  const linkDirectionalParticleSpeed = useCallback(
    (link: AffinityGraphLink) => resolveLinkParticleSpeed(link),
    [],
  );

  const linkDirectionalParticleWidth = useCallback(
    (link: AffinityGraphLink) => resolveLinkParticleWidth(link),
    [],
  );

  const linkDirectionalParticleColor = useCallback(
    (link: AffinityGraphLink) => resolveLinkParticleColor(link),
    [],
  );

  const linkLabel = useCallback(
    (link: AffinityGraphLink) => {
      if (directed) {
        const weight = resolveLinkWeight(link);
        const reciprocalTag = isReciprocalLink(link)
          ? " · canal mutuo (confianza)"
          : " · unidireccional";

        if (weight !== null) {
          return `Nombramiento ONA · peso ${weight.toFixed(1)}${reciprocalTag}`;
        }

        return `Nombramiento ONA (influencia / comunicación)${reciprocalTag}`;
      }

      if (link?.value === undefined) {
        return "";
      }

      return `${link.value} coincidencias EDT`;
    },
    [directed],
  );

  const nodeCanvasObject = useCallback(
    (
      node: RenderGraphNode,
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const radius = getNodeCanvasRadius(node);
      const label = truncateNodeLabel(node.name);

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
      ctx.fillStyle = node.color;
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
      ctx.lineWidth = Math.max(1.25, 2 / globalScale);
      ctx.stroke();

      const fontSize = Math.min(12, Math.max(9, 11 / globalScale));
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#cbd5e1";
      ctx.fillText(label, x, y + radius + LABEL_GAP / globalScale);
    },
    [],
  );

  const nodePointerAreaPaint = useCallback(
    (
      node: RenderGraphNode,
      color: string,
      ctx: CanvasRenderingContext2D,
    ) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const radius = getNodeCollisionRadius(node);

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [],
  );

  const handleUserInteraction = useCallback(() => {
    shouldAutoFitRef.current = false;
  }, []);

  const handleNodeDrag = useCallback(
    (node: RenderGraphNode) => {
      shouldAutoFitRef.current = false;
      // Fija el nodo mientras se arrastra para una interacción más estable.
      node.fx = node.x;
      node.fy = node.y;
    },
    [],
  );

  const handleNodeDragEnd = useCallback((node: RenderGraphNode) => {
    shouldAutoFitRef.current = false;
    node.fx = node.x;
    node.fy = node.y;
  }, []);

  const handleNodeClick = useCallback(
    (node: RenderGraphNode) => {
      shouldAutoFitRef.current = false;
      if (!onNodeClick || !node) {
        return;
      }

      onNodeClick({
        id: String(node.id ?? ""),
        name: typeof node.name === "string" ? node.name : String(node.id ?? ""),
        votes: node.votes ?? 0,
        weightedVotes: node.weightedVotes,
      });
    },
    [onNodeClick],
  );

  if (!Array.isArray(sourceNodes) || sourceNodes.length === 0) {
    return (
      <div className={`flex items-center justify-center text-sm text-slate-400 ${GRAPH_CONTAINER_CLASS}`}>
        No hay colaboradores para visualizar.
      </div>
    );
  }

  if (!Array.isArray(sourceLinks) || sourceLinks.length === 0) {
    return (
      <div className={`flex items-center justify-center text-sm text-slate-400 ${GRAPH_CONTAINER_CLASS}`}>
        {emptyLinksMessage ??
          (directed
            ? "Aún no hay nombramientos ONA en este equipo"
            : "Aún no hay conexiones de afinidad EDT en este equipo")}
      </div>
    );
  }

  const graphWidth = dimensions.width > 0 ? dimensions.width : DEFAULT_WIDTH;
  const graphHeight = dimensions.height > 0 ? dimensions.height : DEFAULT_HEIGHT;

  return (
    <div
      ref={containerRef}
      className={GRAPH_CONTAINER_CLASS}
      style={{ touchAction: "none", height: DEFAULT_HEIGHT }}
      role="img"
      aria-label="Sociograma interactivo del equipo"
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
          nodeColor={(node: RenderGraphNode) => node?.color ?? "#94a3b8"}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => "replace"}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkLabel={linkLabel}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalArrowLength={linkDirectionalArrowLength}
          linkDirectionalArrowColor={linkDirectionalArrowColor}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticles={linkDirectionalParticles}
          linkDirectionalParticleSpeed={linkDirectionalParticleSpeed}
          linkDirectionalParticleWidth={linkDirectionalParticleWidth}
          linkDirectionalParticleColor={linkDirectionalParticleColor}
          warmupTicks={40}
          cooldownTicks={160}
          d3AlphaDecay={0.018}
          d3VelocityDecay={0.35}
          onEngineStop={handleEngineStop}
          onZoom={handleUserInteraction}
          onNodeClick={handleNodeClick}
          onNodeDrag={handleNodeDrag}
          onNodeDragEnd={handleNodeDragEnd}
          enablePointerInteraction={true}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />
      )}
    </div>
  );
}

export default dynamic(() => Promise.resolve(SociogramGraphInner), {
  ssr: false,
  loading: () => (
    <div className={`flex items-center justify-center text-sm text-slate-400 ${GRAPH_CONTAINER_CLASS}`}>
      Cargando mapa interactivo…
    </div>
  ),
});
