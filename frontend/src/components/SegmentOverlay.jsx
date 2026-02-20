import { useState, useEffect, useCallback } from "react";
import * as api from "../services/api";

const SEGMENT_COLORS = {
  text: "rgba(100, 255, 218, 0.08)",
  formula: "rgba(124, 77, 255, 0.12)",
  image: "rgba(255, 215, 64, 0.10)",
};

const SEGMENT_BORDERS = {
  text: "rgba(100, 255, 218, 0.25)",
  formula: "rgba(124, 77, 255, 0.4)",
  image: "rgba(255, 215, 64, 0.35)",
};

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
  onAiAction,
}) {
  const [segments, setSegments] = useState([]);
  const [activeSegment, setActiveSegment] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!docId || !currentPage) return;
    setActiveSegment(null);
    setLoading(true);
    api
      .getPageSegments(docId, currentPage)
      .then((segs) => setSegments(segs || []))
      .catch(() => setSegments([]))
      .finally(() => setLoading(false));
  }, [docId, currentPage]);

  const handleAction = useCallback(
    (action, segment) => {
      setActiveSegment(null);
      if (onAiAction) {
        onAiAction(action, segment.content, segment.type);
      }
    },
    [onAiAction]
  );

  if (!canvasWidth || !canvasHeight || loading) return null;

  return (
    <div className="segment-overlay">
      {segments.map((seg, i) => {
        const [x0, y0, x1, y1] = seg.bbox;
        const style = {
          left: x0 * canvasWidth,
          top: y0 * canvasHeight,
          width: (x1 - x0) * canvasWidth,
          height: (y1 - y0) * canvasHeight,
        };
        const isActive = activeSegment === i;

        return (
          <div
            key={i}
            className={`segment-block segment-${seg.type} ${isActive ? "active" : ""}`}
            style={style}
            onClick={(e) => {
              e.stopPropagation();
              setActiveSegment(isActive ? null : i);
            }}
          >
            {/* Type badge */}
            <span className={`segment-badge segment-badge-${seg.type}`}>
              {SEGMENT_LABELS[seg.type] || seg.type}
            </span>

            {/* Action bar on click */}
            {isActive && (
              <div
                className="segment-actions"
                onClick={(e) => e.stopPropagation()}
              >
                {seg.type !== "image" && (
                  <>
                    <button
                      className="seg-action-btn"
                      title="Expliquer"
                      onClick={() => handleAction("explain", seg)}
                    >
                      Expliquer
                    </button>
                    <button
                      className="seg-action-btn"
                      title="Tableau"
                      onClick={() => handleAction("table", seg)}
                    >
                      Tableau
                    </button>
                    <button
                      className="seg-action-btn"
                      title="Timeline"
                      onClick={() => handleAction("timeline", seg)}
                    >
                      Timeline
                    </button>
                    <button
                      className="seg-action-btn"
                      title="Diagramme"
                      onClick={() => handleAction("diagram", seg)}
                    >
                      Diagramme
                    </button>
                  </>
                )}
                {seg.type === "image" && (
                  <button
                    className="seg-action-btn"
                    title="Décrire l'image"
                    onClick={() => handleAction("explain", seg)}
                  >
                    Décrire
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
