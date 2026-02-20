export default function ShortcutsOverlay({ onClose }) {
  const shortcuts = [
    ["Arrow Left / Up", "Previous page"],
    ["Arrow Right / Down", "Next page"],
    ["Home", "First page"],
    ["End", "Last page"],
    ["Ctrl + / Ctrl -", "Zoom in / out"],
    ["Ctrl 0", "Reset zoom"],
    ["V", "Select tool"],
    ["P", "Pen tool"],
    ["E", "Ellipse tool"],
    ["S", "Sticky note tool"],
    ["R", "Toggle revision mode"],
    ["Ctrl Z", "Undo"],
    ["?", "Show shortcuts"],
    ["Escape", "Close / reset tool"],
  ];

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Keyboard Shortcuts</h3>
        {shortcuts.map(([key, desc]) => (
          <div key={key} className="shortcut-row">
            <span>{desc}</span>
            <kbd>{key}</kbd>
          </div>
        ))}
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
