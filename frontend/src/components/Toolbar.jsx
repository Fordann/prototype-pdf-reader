export default function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
  colors,
  tools,
  showSidebar,
  setShowSidebar,
  showRightPanel,
  setShowRightPanel,
  onClearAnnotations,
  onUndo,
  scale,
  setScale,
}) {
  return (
    <div className="toolbar">
      <button
        className={`btn btn-icon ${showSidebar ? "active" : ""}`}
        onClick={() => setShowSidebar((s) => !s)}
        title="Toggle thumbnails"
      >
        &#9776;
      </button>

      <div className="separator" />

      <div className="tool-group">
        <button
          className={`btn btn-icon ${tool === tools.SELECT ? "active" : ""}`}
          onClick={() => setTool(tools.SELECT)}
          title="Select (V)"
        >
          &#9995;
        </button>
        <button
          className={`btn btn-icon ${tool === tools.PEN ? "active" : ""}`}
          onClick={() => setTool(tools.PEN)}
          title="Pen (P)"
        >
          &#9998;
        </button>
        <button
          className={`btn btn-icon ${tool === tools.ELLIPSE ? "active" : ""}`}
          onClick={() => setTool(tools.ELLIPSE)}
          title="Ellipse (E)"
        >
          &#9711;
        </button>
        <button
          className={`btn btn-icon ${tool === tools.STICKY ? "active" : ""}`}
          onClick={() => setTool(tools.STICKY)}
          title="Sticky note (S)"
        >
          &#128221;
        </button>
      </div>

      <div className="separator" />

      <div className="colors">
        {colors.map((c) => (
          <div
            key={c}
            className={`color-dot ${color === c ? "active" : ""}`}
            style={{ backgroundColor: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>

      <div className="separator" />

      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
        Width:
        <input
          type="range"
          min="1"
          max="10"
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(Number(e.target.value))}
          style={{ width: 60 }}
        />
      </label>

      <div className="separator" />

      <button className="btn btn-icon" onClick={onUndo} title="Undo (Ctrl+Z)">
        &#8630;
      </button>
      <button className="btn btn-icon" onClick={onClearAnnotations} title="Clear page annotations">
        &#128465;
      </button>

      <div style={{ flex: 1 }} />

      <div className="tool-group">
        <button className="btn btn-icon" onClick={() => setScale((s) => Math.max(0.4, s - 0.2))} title="Zoom out">
          &#8722;
        </button>
        <span style={{ fontSize: 12, width: 42, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
        <button className="btn btn-icon" onClick={() => setScale((s) => Math.min(3, s + 0.2))} title="Zoom in">
          &#43;
        </button>
      </div>

      <div className="separator" />

      <button
        className={`btn btn-icon ${showRightPanel ? "active" : ""}`}
        onClick={() => setShowRightPanel((s) => !s)}
        title="Toggle panel"
      >
        &#9881;
      </button>
    </div>
  );
}
