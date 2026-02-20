import { useEffect, useRef, useState } from "react";

export default function Sidebar({ pdfDoc, currentPage, totalPages, visible, slideTags, tags, onPageClick }) {
  const [thumbs, setThumbs] = useState([]);
  const canvasRefs = useRef({});

  useEffect(() => {
    if (!pdfDoc) return;
    const render = async () => {
      const results = [];
      for (let i = 1; i <= totalPages; i++) {
        results.push(i);
      }
      setThumbs(results);
    };
    render();
  }, [pdfDoc, totalPages]);

  useEffect(() => {
    if (!pdfDoc) return;
    thumbs.forEach(async (pageNum) => {
      const canvas = canvasRefs.current[pageNum];
      if (!canvas || canvas.dataset.rendered === "true") return;
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.25 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        canvas.dataset.rendered = "true";
      } catch {
        // cancelled
      }
    });
  }, [pdfDoc, thumbs]);

  if (!visible) return null;

  const tagMap = {};
  for (const t of tags) tagMap[t.id] = t;

  return (
    <div className="sidebar">
      {thumbs.map((pageNum) => {
        const pageSlideTags = slideTags.filter((st) => st.page === pageNum);
        return (
          <div
            key={pageNum}
            className={`thumb-item ${pageNum === currentPage ? "active" : ""}`}
            onClick={() => onPageClick(pageNum)}
          >
            <canvas ref={(el) => (canvasRefs.current[pageNum] = el)} />
            <span className="page-num">{pageNum}</span>
            {pageSlideTags.length > 0 && (
              <div className="thumb-tags">
                {pageSlideTags.map((st) => (
                  <div
                    key={st.tag_id}
                    className="mini-tag"
                    style={{ backgroundColor: tagMap[st.tag_id]?.color || "#888" }}
                    title={tagMap[st.tag_id]?.name || ""}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
