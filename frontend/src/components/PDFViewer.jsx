import { useState, useEffect, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { useDocumentState } from "../hooks/useDocumentState";
import * as api from "../services/api";
import Toolbar from "./Toolbar";
import Sidebar from "./Sidebar";
import RightPanel from "./RightPanel";
import AnnotationCanvas from "./AnnotationCanvas";
import SegmentOverlay from "./SegmentOverlay";
import ShortcutsOverlay from "./ShortcutsOverlay";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

const TOOLS = { SELECT: "select", PEN: "pen", ELLIPSE: "ellipse", STICKY: "sticky_note" };
const COLORS = ["#FFEB3B", "#F44336", "#00BCD4", "#9C27B0"];

export default function PDFViewer({ doc, onBack }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(doc.total_pages || 0);
  const [scale, setScale] = useState(1.2);
  const [tool, setTool] = useState(TOOLS.SELECT);
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [revisionMode, setRevisionMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [canvasDims, setCanvasDims] = useState({ width: 0, height: 0 });

  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);

  const {
    state,
    loading: stateLoading,
    addAnnotation,
    deleteAnnotation,
    clearPageAnnotations,
    saveNote,
    addTag,
    removeTag,
    tagSlide,
    untagSlide,
    addDefLink,
    removeDefLink,
    undo,
  } = useDocumentState(doc.id);

  // Load PDF
  useEffect(() => {
    const url = `${api.PDF_BASE_URL}/${doc.id}.pdf`;
    pdfjsLib.getDocument(url).promise.then((pdf) => {
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      if (doc.total_pages === 0) {
        api.updatePageCount(doc.id, pdf.numPages).catch(() => {});
      }
    });
  }, [doc]);

  // Render page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    pdfDoc.getPage(currentPage).then((page) => {
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");

      setCanvasDims({ width: viewport.width, height: viewport.height });

      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      task.promise.catch(() => {});

      // Render text layer for selection
      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = "";
        page.getTextContent().then((textContent) => {
          const items = textContent.items;
          for (const item of items) {
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const span = document.createElement("span");
            span.textContent = item.str;
            span.style.left = `${tx[4]}px`;
            span.style.top = `${tx[5] - item.height * scale}px`;
            span.style.fontSize = `${item.height * scale}px`;
            span.style.fontFamily = item.fontName || "sans-serif";
            textLayerRef.current?.appendChild(span);
          }
        });
      }
    });
  }, [pdfDoc, currentPage, scale]);

  const goToPage = useCallback(
    (p) => {
      const page = Math.max(1, Math.min(totalPages, p));
      setCurrentPage(page);
    },
    [totalPages]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          goToPage(currentPage + 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          goToPage(currentPage - 1);
          break;
        case "Home":
          e.preventDefault();
          goToPage(1);
          break;
        case "End":
          e.preventDefault();
          goToPage(totalPages);
          break;
        case "+":
        case "=":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setScale((s) => Math.min(3, s + 0.2));
          }
          break;
        case "-":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setScale((s) => Math.max(0.4, s - 0.2));
          }
          break;
        case "0":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setScale(1.2);
          }
          break;
        case "p":
          setTool(TOOLS.PEN);
          break;
        case "e":
          setTool(TOOLS.ELLIPSE);
          break;
        case "s":
          if (!e.ctrlKey) setTool(TOOLS.STICKY);
          break;
        case "v":
          setTool(TOOLS.SELECT);
          break;
        case "r":
          setRevisionMode((m) => !m);
          break;
        case "z":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            undo();
          }
          break;
        case "?":
          setShowShortcuts((s) => !s);
          break;
        case "Escape":
          setShowShortcuts(false);
          setTool(TOOLS.SELECT);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentPage, totalPages, goToPage, undo]);

  // Text selection handler
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (sel && sel.toString().trim()) {
        setSelectedText(sel.toString().trim());
      }
    };
    document.addEventListener("mouseup", handler);
    return () => document.removeEventListener("mouseup", handler);
  }, []);

  const pageAnnotations = state?.annotations?.[String(currentPage)] || [];
  const pageNote = state?.notes?.[String(currentPage)];
  const pageTags =
    state?.slide_tags?.filter((st) => st.page === currentPage).map((st) => st.tag_id) || [];

  return (
    <div className={`app ${revisionMode ? "revision-mode" : ""}`}>
      {/* Top bar */}
      <div className="topbar">
        <button className="btn btn-icon" onClick={onBack} title="Back">
          &#8592;
        </button>
        <span className="logo">StudyInk</span>
        <span className="doc-name">{doc.filename}</span>
        <div className="page-nav">
          <button className="btn btn-icon" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
            &#9664;
          </button>
          <input
            type="number"
            value={currentPage}
            min={1}
            max={totalPages}
            onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
          />
          <span>/ {totalPages}</span>
          <button
            className="btn btn-icon"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            &#9654;
          </button>
        </div>
        <button
          className={`btn btn-icon ${revisionMode ? "active" : ""}`}
          onClick={() => setRevisionMode((m) => !m)}
          title="Revision mode (R)"
        >
          &#128065;
        </button>
        <button className="btn btn-icon" onClick={() => setShowShortcuts(true)} title="Shortcuts (?)">
          &#9000;
        </button>
      </div>

      <div className="main-layout">
        {/* Sidebar */}
        <Sidebar
          pdfDoc={pdfDoc}
          currentPage={currentPage}
          totalPages={totalPages}
          visible={showSidebar}
          slideTags={state?.slide_tags || []}
          tags={state?.tags || []}
          onPageClick={goToPage}
        />

        {/* Viewer */}
        <div className="viewer-area">
          <Toolbar
            tool={tool}
            setTool={setTool}
            color={color}
            setColor={setColor}
            strokeWidth={strokeWidth}
            setStrokeWidth={setStrokeWidth}
            colors={COLORS}
            tools={TOOLS}
            showSidebar={showSidebar}
            setShowSidebar={setShowSidebar}
            showRightPanel={showRightPanel}
            setShowRightPanel={setShowRightPanel}
            onClearAnnotations={() => clearPageAnnotations(currentPage)}
            onUndo={undo}
            scale={scale}
            setScale={setScale}
          />

          <div className="pdf-container" ref={containerRef}>
            <div className="pdf-page-wrapper">
              <canvas ref={canvasRef} />
              <div className="text-layer" ref={textLayerRef} />
              <SegmentOverlay
                docId={doc.id}
                currentPage={currentPage}
                canvasWidth={canvasDims.width}
                canvasHeight={canvasDims.height}
              />
              <AnnotationCanvas
                annotations={pageAnnotations}
                tool={tool}
                color={color}
                strokeWidth={strokeWidth}
                currentPage={currentPage}
                canvasRef={canvasRef}
                onAddAnnotation={addAnnotation}
                onDeleteAnnotation={deleteAnnotation}
              />
            </div>
          </div>
        </div>

        {/* Right panel */}
        <RightPanel
          visible={showRightPanel}
          docId={doc.id}
          currentPage={currentPage}
          pageNote={pageNote}
          onSaveNote={saveNote}
          tags={state?.tags || []}
          pageTags={pageTags}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          onTagSlide={tagSlide}
          onUntagSlide={untagSlide}
          defLinks={state?.definition_links || []}
          onAddDefLink={addDefLink}
          onRemoveDefLink={removeDefLink}
          selectedText={selectedText}
          totalPages={totalPages}
          goToPage={goToPage}
        />
      </div>

      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
