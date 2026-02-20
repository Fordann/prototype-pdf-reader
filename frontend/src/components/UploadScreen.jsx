import { useState, useRef, useEffect, useCallback } from "react";
import * as api from "../services/api";

export default function UploadScreen({ onDocOpen }) {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragover, setDragover] = useState(false);
  const fileRef = useRef(null);

  const loadDocs = useCallback(async () => {
    try {
      const list = await api.getDocuments();
      setDocs(list);
    } catch {
      // backend may not be running
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleFile = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;
    setUploading(true);
    setProgress(0);
    try {
      const doc = await api.uploadDocument(file, setProgress);
      onDocOpen(doc);
    } catch (e) {
      alert("Upload failed: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setDragover(true);
  };

  const handleDelete = async (e, docId) => {
    e.stopPropagation();
    try {
      await api.deleteDocument(docId);
      loadDocs();
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  };

  return (
    <div className="upload-screen">
      <h1>StudyInk</h1>
      <p>Import your PDF course slides to annotate, tag, and study with AI-powered tools.</p>

      <div
        className={`drop-zone ${dragover ? "dragover" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragover(false)}
        onClick={() => fileRef.current?.click()}
      >
        <div className="icon">&#128196;</div>
        <span>Drop a PDF here or click to browse</span>
        {uploading && (
          <div className="progress-bar" style={{ width: "80%" }}>
            <div className="progress-bar-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files[0])}
      />

      {docs.length > 0 && (
        <div className="recent-docs">
          <h3>Recent documents</h3>
          {docs.map((d) => (
            <div key={d.id} className="doc-list-item" onClick={() => onDocOpen(d)}>
              <span className="doc-icon">&#128210;</span>
              <div className="doc-info">
                <div className="name">{d.filename}</div>
                <div className="pages">{d.total_pages > 0 ? `${d.total_pages} pages` : "..."}</div>
              </div>
              <button
                className="btn btn-icon doc-delete"
                onClick={(e) => handleDelete(e, d.id)}
                title="Delete"
              >
                &#128465;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
