import { useState, useRef, useCallback } from "react";

export default function AnnotationCanvas({
  annotations,
  tool,
  color,
  strokeWidth,
  currentPage,
  canvasRef,
  onAddAnnotation,
  onDeleteAnnotation,
}) {
  const [drawing, setDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState([]);
  const [ellipseStart, setEllipseStart] = useState(null);
  const [ellipseEnd, setEllipseEnd] = useState(null);
  const [stickyPopup, setStickyPopup] = useState(null);
  const [stickyText, setStickyText] = useState("");
  const svgRef = useRef(null);

  const getPos = useCallback(
    (e) => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e) => {
      if (tool === "select") return;
      const pos = getPos(e);

      if (tool === "pen") {
        setDrawing(true);
        setCurrentPoints([pos]);
      } else if (tool === "ellipse") {
        setDrawing(true);
        setEllipseStart(pos);
        setEllipseEnd(pos);
      } else if (tool === "sticky_note") {
        setStickyPopup(pos);
        setStickyText("");
      }
    },
    [tool, getPos]
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!drawing) return;
      const pos = getPos(e);
      if (tool === "pen") {
        setCurrentPoints((pts) => [...pts, pos]);
      } else if (tool === "ellipse") {
        setEllipseEnd(pos);
      }
    },
    [drawing, tool, getPos]
  );

  const handleMouseUp = useCallback(() => {
    if (!drawing) return;
    setDrawing(false);

    if (tool === "pen" && currentPoints.length > 1) {
      onAddAnnotation({
        id: "",
        page: currentPage,
        type: "pen",
        color,
        stroke_width: strokeWidth,
        points: currentPoints,
        text: "",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      });
      setCurrentPoints([]);
    } else if (tool === "ellipse" && ellipseStart && ellipseEnd) {
      const x = Math.min(ellipseStart.x, ellipseEnd.x);
      const y = Math.min(ellipseStart.y, ellipseEnd.y);
      const w = Math.abs(ellipseEnd.x - ellipseStart.x);
      const h = Math.abs(ellipseEnd.y - ellipseStart.y);
      if (w > 5 || h > 5) {
        onAddAnnotation({
          id: "",
          page: currentPage,
          type: "ellipse",
          color,
          stroke_width: strokeWidth,
          points: [],
          text: "",
          x,
          y,
          width: w,
          height: h,
        });
      }
      setEllipseStart(null);
      setEllipseEnd(null);
    }
  }, [drawing, tool, currentPoints, ellipseStart, ellipseEnd, currentPage, color, strokeWidth, onAddAnnotation]);

  const handleStickySubmit = useCallback(() => {
    if (stickyPopup && stickyText.trim()) {
      onAddAnnotation({
        id: "",
        page: currentPage,
        type: "sticky_note",
        color,
        stroke_width: 0,
        points: [],
        text: stickyText,
        x: stickyPopup.x,
        y: stickyPopup.y,
        width: 0,
        height: 0,
      });
    }
    setStickyPopup(null);
    setStickyText("");
  }, [stickyPopup, stickyText, currentPage, color, onAddAnnotation]);

  const isDrawing = tool !== "select";

  const pointsToPath = (pts) => {
    if (pts.length < 2) return "";
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  };

  return (
    <div className={`annotation-layer ${isDrawing ? "drawing" : ""}`}>
      <svg
        ref={svgRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Existing annotations */}
        {annotations.map((ann) => {
          if (ann.type === "pen" && ann.points?.length > 1) {
            return (
              <path
                key={ann.id}
                d={pointsToPath(ann.points)}
                fill="none"
                stroke={ann.color}
                strokeWidth={ann.stroke_width}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (tool === "select" && confirm("Delete this annotation?")) {
                    onDeleteAnnotation(ann.id);
                  }
                }}
              />
            );
          }
          if (ann.type === "ellipse") {
            return (
              <ellipse
                key={ann.id}
                cx={ann.x + ann.width / 2}
                cy={ann.y + ann.height / 2}
                rx={ann.width / 2}
                ry={ann.height / 2}
                fill="none"
                stroke={ann.color}
                strokeWidth={ann.stroke_width}
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (tool === "select" && confirm("Delete this annotation?")) {
                    onDeleteAnnotation(ann.id);
                  }
                }}
              />
            );
          }
          return null;
        })}

        {/* Current drawing */}
        {drawing && tool === "pen" && currentPoints.length > 1 && (
          <path d={pointsToPath(currentPoints)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        )}
        {drawing && tool === "ellipse" && ellipseStart && ellipseEnd && (
          <ellipse
            cx={(ellipseStart.x + ellipseEnd.x) / 2}
            cy={(ellipseStart.y + ellipseEnd.y) / 2}
            rx={Math.abs(ellipseEnd.x - ellipseStart.x) / 2}
            ry={Math.abs(ellipseEnd.y - ellipseStart.y) / 2}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray="4"
          />
        )}
      </svg>

      {/* Sticky notes */}
      {annotations
        .filter((a) => a.type === "sticky_note")
        .map((ann) => (
          <div
            key={ann.id}
            className="sticky-note"
            style={{ left: ann.x, top: ann.y, color: ann.color }}
            title={ann.text}
            onClick={(e) => {
              e.stopPropagation();
              if (tool === "select" && confirm(`Note: "${ann.text}"\n\nDelete?`)) {
                onDeleteAnnotation(ann.id);
              }
            }}
          >
            &#128204;
          </div>
        ))}

      {/* Sticky note popup */}
      {stickyPopup && (
        <div
          className="sticky-note-popup"
          style={{ left: stickyPopup.x + 10, top: stickyPopup.y + 10 }}
        >
          <textarea
            autoFocus
            value={stickyText}
            onChange={(e) => setStickyText(e.target.value)}
            placeholder="Write a note..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleStickySubmit();
              }
              if (e.key === "Escape") setStickyPopup(null);
            }}
          />
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <button className="btn btn-primary" onClick={handleStickySubmit}>
              Add
            </button>
            <button className="btn btn-secondary" onClick={() => setStickyPopup(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
