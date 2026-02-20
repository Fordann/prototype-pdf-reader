import { useState, useCallback, useEffect } from "react";
import Markdown from "react-markdown";
import * as api from "../services/api";

export default function RightPanel({
  visible,
  docId,
  currentPage,
  pageNote,
  onSaveNote,
  tags,
  pageTags,
  onAddTag,
  onRemoveTag,
  onTagSlide,
  onUntagSlide,
  defLinks,
  onAddDefLink,
  onRemoveDefLink,
  selectedText,
  totalPages,
  goToPage,
}) {
  const [noteContent, setNoteContent] = useState("");
  const [noteVisible, setNoteVisible] = useState(true);
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#2196F3");
  const [showNewLink, setShowNewLink] = useState(false);
  const [linkTarget, setLinkTarget] = useState(1);
  const [linkText, setLinkText] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [alterResult, setAlterResult] = useState(null);
  const [alterLoading, setAlterLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("notes");

  useEffect(() => {
    setNoteContent(pageNote?.content || "");
    setNoteVisible(pageNote?.visible !== false);
  }, [pageNote, currentPage]);

  const handleSaveNote = useCallback(() => {
    onSaveNote(currentPage, {
      page: currentPage,
      content: noteContent,
      visible: noteVisible,
    });
  }, [currentPage, noteContent, noteVisible, onSaveNote]);

  const handleCreateTag = useCallback(() => {
    if (!newTagName.trim()) return;
    onAddTag({ id: "", name: newTagName.trim(), color: newTagColor, is_predefined: false });
    setNewTagName("");
    setShowNewTag(false);
  }, [newTagName, newTagColor, onAddTag]);

  const handleCreateLink = useCallback(() => {
    if (!linkText.trim()) return;
    onAddDefLink({
      id: "",
      source_page: currentPage,
      target_page: linkTarget,
      text: linkText.trim(),
      label: linkLabel.trim(),
    });
    setLinkText("");
    setLinkLabel("");
    setShowNewLink(false);
  }, [currentPage, linkTarget, linkText, linkLabel, onAddDefLink]);

  const handleExplain = useCallback(async () => {
    if (!selectedText) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await api.explainText(docId, currentPage, selectedText);
      setAiResult(res.explanation);
    } catch (e) {
      setAiResult("Error: " + e.message);
    } finally {
      setAiLoading(false);
    }
  }, [docId, currentPage, selectedText]);

  const handleAlter = useCallback(
    async (type) => {
      if (!selectedText) return;
      setAlterLoading(true);
      setAlterResult(null);
      try {
        const res = await api.alterContent(docId, currentPage, selectedText, type);
        setAlterResult(res.altered_content);
      } catch (e) {
        setAlterResult("Error: " + e.message);
      } finally {
        setAlterLoading(false);
      }
    },
    [docId, currentPage, selectedText]
  );

  const handleRecap = useCallback(async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
      const res = await api.generateRecap(docId, pages);
      setAiResult(`# ${res.title}\n\n${res.recap_content}`);
    } catch (e) {
      setAiResult("Error: " + e.message);
    } finally {
      setAiLoading(false);
    }
  }, [docId, totalPages]);

  if (!visible) return null;

  const pageLinks = defLinks.filter(
    (l) => l.source_page === currentPage || l.target_page === currentPage
  );

  const tabs = [
    { id: "notes", label: "Notes" },
    { id: "tags", label: "Tags" },
    { id: "links", label: "Links" },
    { id: "ai", label: "AI" },
  ];

  return (
    <div className="right-panel">
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className="btn"
            style={{
              flex: 1,
              borderRadius: 0,
              borderBottom: activeTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === tab.id ? "var(--accent)" : "var(--text-muted)",
              padding: "8px 0",
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notes tab */}
      {activeTab === "notes" && (
        <div className="panel-section" style={{ flex: 1 }}>
          <h4>Slide {currentPage} Notes</h4>
          <div className="note-bubble">
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Add notes for this slide..."
              onBlur={handleSaveNote}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={noteVisible}
                onChange={(e) => {
                  setNoteVisible(e.target.checked);
                  onSaveNote(currentPage, {
                    page: currentPage,
                    content: noteContent,
                    visible: e.target.checked,
                  });
                }}
              />
              Show note bubble
            </label>
          </div>
        </div>
      )}

      {/* Tags tab */}
      {activeTab === "tags" && (
        <div className="panel-section" style={{ flex: 1 }}>
          <h4>Slide {currentPage} Tags</h4>
          <div className="tag-list" style={{ marginBottom: 8 }}>
            {tags.map((tag) => {
              const isActive = pageTags.includes(tag.id);
              return (
                <div
                  key={tag.id}
                  className="tag-chip"
                  style={{
                    backgroundColor: isActive ? tag.color : "transparent",
                    color: isActive ? "#fff" : tag.color,
                    border: `1px solid ${tag.color}`,
                    cursor: "pointer",
                    margin: "2px",
                  }}
                  onClick={() => {
                    if (isActive) onUntagSlide(currentPage, tag.id);
                    else onTagSlide(currentPage, tag.id);
                  }}
                >
                  {tag.name}
                  {!tag.is_predefined && (
                    <span
                      className="remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveTag(tag.id);
                      }}
                    >
                      x
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {showNewTag ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Tag name"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
              />
              <div style={{ display: "flex", gap: 4 }}>
                {["#4CAF50", "#2196F3", "#FF9800", "#E91E63", "#9C27B0", "#00BCD4"].map((c) => (
                  <div
                    key={c}
                    className={`color-dot ${newTagColor === c ? "active" : ""}`}
                    style={{ backgroundColor: c, width: 16, height: 16 }}
                    onClick={() => setNewTagColor(c)}
                  />
                ))}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="btn btn-primary" onClick={handleCreateTag}>
                  Create
                </button>
                <button className="btn btn-secondary" onClick={() => setShowNewTag(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-secondary" onClick={() => setShowNewTag(true)}>
              + New tag
            </button>
          )}
        </div>
      )}

      {/* Links tab */}
      {activeTab === "links" && (
        <div className="panel-section" style={{ flex: 1 }}>
          <h4>Definition Links</h4>
          {pageLinks.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No links on this page</div>
          )}
          {pageLinks.map((link) => (
            <div key={link.id} className="def-link-item">
              <span
                className="link-pages"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  const target = link.source_page === currentPage ? link.target_page : link.source_page;
                  goToPage(target);
                }}
              >
                p.{link.source_page} <span className="link-arrow">&#8594;</span> p.{link.target_page}
              </span>
              <span style={{ flex: 1, fontSize: 11 }}>{link.text}</span>
              <button
                className="btn btn-icon"
                style={{ width: 20, height: 20, fontSize: 10 }}
                onClick={() => onRemoveDefLink(link.id)}
              >
                x
              </button>
            </div>
          ))}

          {showNewLink ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              <input
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Link text (definition)"
                autoFocus
              />
              <input
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="Label (optional)"
              />
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                Target page:
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={linkTarget}
                  onChange={(e) => setLinkTarget(Number(e.target.value))}
                  style={{ width: 50 }}
                />
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="btn btn-primary" onClick={handleCreateLink}>
                  Add link
                </button>
                <button className="btn btn-secondary" onClick={() => setShowNewLink(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-secondary"
              style={{ marginTop: 8 }}
              onClick={() => setShowNewLink(true)}
            >
              + New link
            </button>
          )}
        </div>
      )}

      {/* AI tab */}
      {activeTab === "ai" && (
        <div className="panel-section" style={{ flex: 1 }}>
          <h4>AI Tools</h4>

          {selectedText && (
            <div
              style={{
                fontSize: 12,
                padding: 8,
                background: "var(--bg)",
                borderRadius: 6,
                marginBottom: 8,
                maxHeight: 80,
                overflow: "hidden",
              }}
            >
              Selected: <em>"{selectedText.slice(0, 100)}..."</em>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              className="btn btn-secondary"
              onClick={() => handleExplain()}
              disabled={!selectedText || aiLoading}
            >
              Explain selected text
            </button>

            <div style={{ display: "flex", gap: 4 }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => handleAlter("table")}
                disabled={!selectedText || alterLoading}
              >
                Table
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => handleAlter("timeline")}
                disabled={!selectedText || alterLoading}
              >
                Timeline
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => handleAlter("diagram")}
                disabled={!selectedText || alterLoading}
              >
                Diagram
              </button>
            </div>

            <button className="btn btn-primary" onClick={handleRecap} disabled={aiLoading}>
              Generate recap
            </button>
          </div>

          {(aiLoading || alterLoading) && (
            <div className="ai-panel">
              <div className="loading">
                <div className="spinner" />
                Processing...
              </div>
            </div>
          )}

          {aiResult && (
            <div className="ai-panel">
              <div className="markdown-content" style={{ fontSize: 13, maxHeight: 400, overflow: "auto" }}>
                <Markdown>{aiResult}</Markdown>
              </div>
            </div>
          )}

          {alterResult && (
            <div className="ai-panel" style={{ borderColor: "var(--accent-secondary)" }}>
              <div className="markdown-content" style={{ fontSize: 13, maxHeight: 400, overflow: "auto" }}>
                <Markdown>{alterResult}</Markdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

