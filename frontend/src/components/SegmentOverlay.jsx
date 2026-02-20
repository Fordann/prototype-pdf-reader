import { useState, useEffect, useCallback } from "react";
import Markdown from "react-markdown";
import * as api from "../services/api";

const SEGMENT_LABELS = {
  text: "Texte",
  formula: "Formule",
  image: "Image",
};

export default function SegmentOverlay({
  docId,
  currentPage,
  canvasWidth,
  canvasHeight,
}) {
  const [segments, setSegments] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  // AI popup state: { segmentIndex, anchorBbox, result, loading, action }
  const [popup, setPopup] = useState(null);

  useEffect(() => {
    if (!docId || !currentPage) return;
    setSelected(new Set());
    setPopup(null);
    setLoading(true);
    api
      .getPageSegments(docId, currentPage)
      .then((segs) => setSegments(segs || []))
      .catch(() => setSegments([]))
      .finally(() => setLoading(false));
  }, [docId, currentPage]);

  const toggleSelect = useCallback((i, e) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const handleAction = useCallback(
    async (action) => {
      // Combine content of all selected segments
      const indices = Array.from(selected).sort((a, b) => a - b);
      if (indices.length === 0) return;

      const combinedContent = indices
        .map((i) => segments[i]?.content || "")
        .filter(Boolean)
        .join("\n\n");

      if (!combinedContent) return;

      // Position popup near the last selected segment
      const anchorSeg = segments[indices[indices.length - 1]];
      const anchorBbox = anchorSeg.bbox;

      setPopup({ anchorBbox, result: null, loading: true, action });

      try {
        let result;
        if (action === "explain") {
          const res = await api.explainText(docId, currentPage, combinedContent);
          result = res.explanation;
        } else {
          const res = await api.alterContent(docId, currentPage, combinedContent, action);
          result = res.altered_content;
        }
        setPopup((prev) => (prev ? { ...prev, result, loading: false } : null));
      } catch (e) {
        setPopup((prev) =>
          prev ? { ...prev, result: "Erreur: " + e.message, loading: false } : null
        );
      }
    },
    [selected, segments, docId, currentPage]
  );

  const closePopup = useCallback(() => setPopup(null), []);

  if (!canvasWidth || !canvasHeight || loading) return null;

  const hasSelection = selected.size > 0;

  return (
    <div className="segment-overlay" onClick={() => setSelected(new Set())}>
      {/* Segments */}
      {segments.map((seg, i) => {
        const [x0, y0, x1, y1] = seg.bbox;
        const style = {
          left: x0 * canvasWidth,
          top: y0 * canvasHeight,
          width: (x1 - x0) * canvasWidth,
          height: (y1 - y0) * canvasHeight,
        };
        const isSelected = selected.has(i);
        const semTag = seg.semantic_tag;
        const tagClass = semTag ? `segment-tagged segment-tag-${semTag.tag}` : "";

        return (
          <div
            key={i}
            className={`segment-block segment-${seg.type} ${tagClass} ${isSelected ? "selected" : ""}`}
            style={{
              ...style,
              ...(semTag && !isSelected
                ? { borderColor: semTag.color + "80", borderLeftColor: semTag.color, borderLeftWidth: 3 }
                : {}),
            }}
            onClick={(e) => toggleSelect(i, e)}
          >
            {/* Semantic tag badge */}
            {semTag && (
              <span
                className="segment-badge"
                style={{ background: semTag.color, color: "#fff" }}
              >
                {semTag.label}
              </span>
            )}
            {/* Type badge (only if no semantic tag) */}
            {!semTag && (
              <span className={`segment-badge segment-badge-${seg.type}`}>
                {SEGMENT_LABELS[seg.type] || seg.type}
              </span>
            )}
            {/* Selection indicator */}
            {isSelected && (
              <span className="segment-check">&#10003;</span>
            )}
          </div>
        );
      })}

      {/* Floating action bar when segments are selected */}
      {hasSelection && !popup && (
        <div
          className="segment-action-bar"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="seg-action-count">{selected.size} segment{selected.size > 1 ? "s" : ""}</span>
          <button className="seg-action-btn" onClick={() => handleAction("explain")}>
            Expliquer
          </button>
          <button className="seg-action-btn" onClick={() => handleAction("table")}>
            Tableau
          </button>
          <button className="seg-action-btn" onClick={() => handleAction("timeline")}>
            Timeline
          </button>
          <button className="seg-action-btn" onClick={() => handleAction("diagram")}>
            Diagramme
          </button>
          <button
            className="seg-action-btn seg-action-close"
            onClick={() => setSelected(new Set())}
          >
            &#10005;
          </button>
        </div>
      )}

      {/* AI result popup near source */}
      {popup && (
        <div
          className="segment-popup"
          style={{
            left: Math.min(popup.anchorBbox[2] * canvasWidth + 8, canvasWidth - 20),
            top: popup.anchorBbox[1] * canvasHeight,
            maxWidth: Math.max(320, canvasWidth * 0.45),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="segment-popup-header">
            <span className="segment-popup-title">
              {popup.action === "explain" ? "Explication" :
               popup.action === "table" ? "Tableau" :
               popup.action === "timeline" ? "Timeline" : "Diagramme"}
            </span>
            <button className="segment-popup-close" onClick={closePopup}>&#10005;</button>
          </div>
          <div className="segment-popup-body">
            {popup.loading ? (
              <div className="segment-popup-loading">
                <div className="spinner" />
                <span>Génération en cours...</span>
              </div>
            ) : (
              <div className="markdown-content">
                <Markdown>{popup.result || ""}</Markdown>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
