import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as api from "../services/api";

/**
 * Interactive concept map showing notions linked across pages.
 * Renders as a force-positioned SVG + HTML overlay.
 */
export default function ConceptMap({ docId, goToPage, currentPage, onClose }) {
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [positions, setPositions] = useState({});
  const [dragging, setDragging] = useState(null);
  const containerRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!docId) return;
    setLoading(true);
    api
      .getConceptGraph(docId)
      .then((g) => setGraph(g))
      .catch(() => setGraph({ notions: [], links: [] }))
      .finally(() => setLoading(false));
  }, [docId]);

  // Compute initial layout: arrange nodes in a circle or grid
  useEffect(() => {
    if (!graph?.notions?.length) return;
    const notions = graph.notions;
    const n = notions.length;

    // Group by type for layered layout
    const typeOrder = ["concept", "definition", "property", "theorem", "formula", "method", "example"];
    const sorted = [...notions].sort((a, b) => {
      const ai = typeOrder.indexOf(a.type);
      const bi = typeOrder.indexOf(b.type);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    const cx = 400;
    const cy = 300;
    const rx = Math.min(350, 100 + n * 20);
    const ry = Math.min(250, 80 + n * 15);
    const pos = {};
    sorted.forEach((notion, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      pos[notion.id] = {
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
      };
    });
    setPositions(pos);
  }, [graph]);

  // Drag handlers
  const handleMouseDown = useCallback((e, notionId) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = positions[notionId];
    if (!pos) return;
    dragOffset.current = {
      x: e.clientX - rect.left - pos.x,
      y: e.clientY - rect.top - pos.y,
    };
    setDragging(notionId);
  }, [positions]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - dragOffset.current.x;
    const y = e.clientY - rect.top - dragOffset.current.y;
    setPositions((prev) => ({ ...prev, [dragging]: { x, y } }));
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Find connected notions for highlighting
  const connectedTo = useMemo(() => {
    if (!hovered || !graph?.links) return new Set();
    const ids = new Set();
    for (const link of graph.links) {
      if (link.source === hovered) ids.add(link.target);
      if (link.target === hovered) ids.add(link.source);
    }
    return ids;
  }, [hovered, graph]);

  if (loading) {
    return (
      <div className="concept-map-panel">
        <div className="concept-map-header">
          <h3>Carte des notions</h3>
          <button className="btn btn-icon" onClick={onClose}>&#10005;</button>
        </div>
        <div className="concept-map-loading">
          <div className="spinner" />
          <span>Chargement...</span>
        </div>
      </div>
    );
  }

  if (!graph?.notions?.length) {
    return (
      <div className="concept-map-panel">
        <div className="concept-map-header">
          <h3>Carte des notions</h3>
          <button className="btn btn-icon" onClick={onClose}>&#10005;</button>
        </div>
        <div className="concept-map-empty">
          Aucune notion extraite pour ce document.
        </div>
      </div>
    );
  }

  const { notions, links } = graph;

  // Relation type labels and colors
  const relationStyles = {
    uses: { color: "#64ffda", label: "utilise" },
    proves: { color: "#FF9800", label: "prouve" },
    illustrates: { color: "#8BC34A", label: "illustre" },
    generalizes: { color: "#E91E63", label: "généralise" },
    requires: { color: "#F44336", label: "nécessite" },
    defines: { color: "#00BCD4", label: "définit" },
  };

  const typeLabels = {
    definition: "Définition",
    theorem: "Théorème",
    property: "Propriété",
    formula: "Formule",
    concept: "Concept",
    method: "Méthode",
    example: "Exemple",
  };

  return (
    <div className="concept-map-panel">
      <div className="concept-map-header">
        <h3>Carte des notions</h3>
        <div className="concept-map-legend">
          {Object.entries(typeLabels).map(([type, label]) => {
            const color = {
              definition: "#00BCD4", theorem: "#F44336", property: "#9C27B0",
              formula: "#7C4DFF", concept: "#FF9800", method: "#4CAF50", example: "#8BC34A",
            }[type] || "#78909C";
            return (
              <span key={type} className="concept-legend-item">
                <span className="concept-legend-dot" style={{ background: color }} />
                {label}
              </span>
            );
          })}
        </div>
        <button className="btn btn-icon" onClick={onClose}>&#10005;</button>
      </div>

      <div
        className="concept-map-canvas"
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* SVG links layer */}
        <svg className="concept-map-svg" width="100%" height="100%">
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#64ffda80" />
            </marker>
          </defs>
          {links.map((link, i) => {
            const from = positions[link.source];
            const to = positions[link.target];
            if (!from || !to) return null;

            const isHighlighted =
              hovered && (link.source === hovered || link.target === hovered);
            const style = relationStyles[link.type] || relationStyles.uses;
            const opacity = hovered
              ? isHighlighted ? 1 : 0.15
              : 0.5;

            // Offset line slightly for arrow
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = dx / len;
            const ny = dy / len;
            const x1 = from.x + nx * 40;
            const y1 = from.y + ny * 20;
            const x2 = to.x - nx * 40;
            const y2 = to.y - ny * 20;

            // Curved line
            const mx = (x1 + x2) / 2 + (y2 - y1) * 0.15;
            const my = (y1 + y2) / 2 - (x2 - x1) * 0.15;

            return (
              <g key={i}>
                <path
                  d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
                  fill="none"
                  stroke={style.color}
                  strokeWidth={isHighlighted ? 2.5 : 1.5}
                  strokeOpacity={opacity}
                  markerEnd="url(#arrowhead)"
                />
                {isHighlighted && (
                  <text
                    x={mx}
                    y={my - 6}
                    textAnchor="middle"
                    fill={style.color}
                    fontSize="10"
                    fontWeight="600"
                  >
                    {link.label || style.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* HTML nodes layer */}
        {notions.map((notion) => {
          const pos = positions[notion.id];
          if (!pos) return null;

          const isHovered = hovered === notion.id;
          const isConnected = connectedTo.has(notion.id);
          const dimmed = hovered && !isHovered && !isConnected;
          const isOnCurrentPage = notion.pages?.includes(currentPage);

          return (
            <div
              key={notion.id}
              className={`concept-node ${isHovered ? "hovered" : ""} ${isOnCurrentPage ? "current-page" : ""} ${dimmed ? "dimmed" : ""}`}
              style={{
                left: pos.x,
                top: pos.y,
                borderColor: notion.color || "#78909C",
                boxShadow: isHovered ? `0 0 16px ${notion.color}60` : undefined,
              }}
              onMouseEnter={() => setHovered(notion.id)}
              onMouseLeave={() => setHovered(null)}
              onMouseDown={(e) => handleMouseDown(e, notion.id)}
              onClick={() => {
                if (notion.pages?.length) {
                  goToPage(notion.pages[0]);
                }
              }}
            >
              <div className="concept-node-type" style={{ color: notion.color }}>
                {typeLabels[notion.type] || notion.type}
              </div>
              <div className="concept-node-name">{notion.name}</div>
              {isHovered && (
                <div className="concept-node-tooltip">
                  <div className="concept-tooltip-desc">{notion.description}</div>
                  <div className="concept-tooltip-pages">
                    {notion.pages?.map((p) => (
                      <span
                        key={p}
                        className={`concept-page-link ${p === currentPage ? "active" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          goToPage(p);
                        }}
                      >
                        p.{p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
