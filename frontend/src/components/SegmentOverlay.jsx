import { useState, useEffect, useCallback } from "react";
import Markdown from "react-markdown";
import * as api from "../services/api";

export default function SegmentOverlay({
  docId,
  currentPage,
  canvasWidth,
  canvasHeight,
}) {
  const [segments, setSegments] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
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
      const indices = Array.from(selected).sort((a, b) => a - b);
      if (indices.length === 0) return;

      const combinedContent = indices
        .map((i) => segments[i]?.content || "")
        .filter(Boolean)
        .join("\n\n");

      if (!combinedContent) return;

      // Find an anchor bbox from selected segments (first one with a bbox)
      let anchorBbox = null;
      for (const idx of [...indices].reverse()) {
        if (segments[idx]?.bbox) {
          anchorBbox = segments[idx].bbox;
          break;
        }
      }

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

  // Split: segments with bbox (positioned overlay) vs without (listed at bottom)
  const positionedSegs = [];
  const unpositionedSegs = [];
  segments.forEach((seg, i) => {
    if (seg.bbox) positionedSegs.push({ seg, i });
    else unpositionedSegs.push({ seg, i });
  });

  const hasSelection = selected.size > 0;

  // Popup position
  let popupStyle = {};
  if (popup) {
    if (popup.anchorBbox) {
      popupStyle = {
        left: Math.min(popup.anchorBbox[2] * canvasWidth + 8, canvasWidth - 20),
        top: popup.anchorBbox[1] * canvasHeight,
        maxWidth: Math.max(320, canvasWidth * 0.45),
      };
    } else {
      popupStyle = {
        left: canvasWidth * 0.1,
        top: canvasHeight * 0.1,
        maxWidth: Math.max(320, canvasWidth * 0.6),
      };
    }
  }

  return (
    <div className="segment-overlay" onClick={() => setSelected(new Set())}>
      {/* Positioned segments (with bbox) */}
      {positionedSegs.map(({ seg, i }) => {
        const [x0, y0, x1, y1] = seg.bbox;
        const style = {
          left: x0 * canvasWidth,
          top: y0 * canvasHeight,
          width: (x1 - x0) * canvasWidth,
          height: (y1 - y0) * canvasHeight,
        };
        return (
          <SegmentBlock
            key={i}
            seg={seg}
            index={i}
            style={style}
            isSelected={selected.has(i)}
            onToggle={toggleSelect}
          />
        );
      })}

      {/* Unpositioned segments (no bbox) - stacked at bottom */}
      {unpositionedSegs.length > 0 && (
        <div className="segment-unpositioned" onClick={(e) => e.stopPropagation()}>
          {unpositionedSegs.map(({ seg, i }) => (
            <SegmentBlock
              key={i}
              seg={seg}
              index={i}
              style={{}}
              isSelected={selected.has(i)}
              onToggle={toggleSelect}
              inline
            />
          ))}
        </div>
      )}

      {/* Floating action bar */}
      {hasSelection && !popup && (
        <div className="segment-action-bar" onClick={(e) => e.stopPropagation()}>
          <span className="seg-action-count">
            {selected.size} segment{selected.size > 1 ? "s" : ""}
          </span>
          <button className="seg-action-btn" onClick={() => handleAction("explain")}>Expliquer</button>
          <button className="seg-action-btn" onClick={() => handleAction("table")}>Tableau</button>
          <button className="seg-action-btn" onClick={() => handleAction("timeline")}>Timeline</button>
          <button className="seg-action-btn" onClick={() => handleAction("diagram")}>Diagramme</button>
          <button className="seg-action-btn seg-action-close" onClick={() => setSelected(new Set())}>
            &#10005;
          </button>
        </div>
      )}

      {/* AI result popup */}
      {popup && (
        <div className="segment-popup" style={popupStyle} onClick={(e) => e.stopPropagation()}>
          <div className="segment-popup-header">
            <span className="segment-popup-title">
              {popup.action === "explain" ? "Explication"
                : popup.action === "table" ? "Tableau"
                : popup.action === "timeline" ? "Timeline"
                : "Diagramme"}
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

function SegmentBlock({ seg, index, style, isSelected, onToggle, inline }) {
  const semTag = seg.semantic_tag;
  const tagClass = semTag ? "segment-tagged" : "";

  return (
    <div
      className={`segment-block segment-${seg.type} ${tagClass} ${isSelected ? "selected" : ""} ${inline ? "segment-inline" : ""}`}
      style={{
        ...style,
        ...(semTag && !isSelected
          ? { borderColor: semTag.color + "80", borderLeftColor: semTag.color, borderLeftWidth: 3 }
          : {}),
      }}
      onClick={(e) => onToggle(index, e)}
    >
      {semTag && (
        <span className="segment-badge" style={{ background: semTag.color, color: "#fff" }}>
          {semTag.label}
        </span>
      )}
      {isSelected && <span className="segment-check">&#10003;</span>}
      {/* Show content preview for inline (unpositioned) segments */}
      {inline && (
        <span className="segment-inline-text">
          {seg.content.slice(0, 80)}{seg.content.length > 80 ? "..." : ""}
        </span>
      )}
    </div>
  );
}
