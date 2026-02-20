import json
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.models.schemas import PDFDocument
from app.services.storage import (
    UPLOAD_DIR, DATA_DIR, save_document_meta, load_document_meta,
    generate_id, list_documents,
)
from app.services.pdf_extractor import extract_all_pages, extract_page_segments

router = APIRouter(prefix="/api/documents", tags=["documents"])

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB


@router.post("/upload", response_model=PDFDocument)
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 100 MB limit")

    doc_id = generate_id()
    file_path = UPLOAD_DIR / f"{doc_id}.pdf"
    file_path.write_bytes(content)

    # Extract segments from every page using PyMuPDF
    all_segments = extract_all_pages(str(file_path))
    total_pages = max(all_segments.keys()) if all_segments else 0
    segments_path = DATA_DIR / f"{doc_id}_segments.json"
    segments_path.write_text(json.dumps(all_segments, ensure_ascii=False), encoding="utf-8")

    doc = PDFDocument(
        id=doc_id,
        filename=file.filename,
        total_pages=total_pages,
        file_path=str(file_path),
    )
    save_document_meta(doc)
    return doc


@router.patch("/{doc_id}/pages")
async def update_page_count(doc_id: str, total_pages: int):
    doc = load_document_meta(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.total_pages = total_pages
    save_document_meta(doc)
    return {"status": "ok"}


@router.get("/", response_model=list[PDFDocument])
async def get_documents():
    return list_documents()


@router.get("/{doc_id}", response_model=PDFDocument)
async def get_document(doc_id: str):
    doc = load_document_meta(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/{doc_id}/segments/{page}")
async def get_page_segments(doc_id: str, page: int):
    """Get extracted segments for a specific page (1-indexed)."""
    segments_path = DATA_DIR / f"{doc_id}_segments.json"
    if segments_path.exists():
        all_segments = json.loads(segments_path.read_text(encoding="utf-8"))
        return all_segments.get(str(page), [])
    # Fallback: extract on the fly
    doc = load_document_meta(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return extract_page_segments(doc.file_path, page - 1)


@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    doc = load_document_meta(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    pdf_path = UPLOAD_DIR / f"{doc_id}.pdf"
    if pdf_path.exists():
        pdf_path.unlink()

    from app.services.storage import get_document_path
    meta_path = DATA_DIR / f"{doc_id}_meta.json"
    state_path = get_document_path(doc_id)
    segments_path = DATA_DIR / f"{doc_id}_segments.json"
    for p in [meta_path, state_path, segments_path]:
        if p.exists():
            p.unlink()

    return {"status": "deleted"}
