import json
import os
import uuid
from pathlib import Path
from app.models.schemas import (
    DocumentState, Annotation, SlideNote, Tag, SlideTag,
    DefinitionLink, PDFDocument, ContentAlterationResponse
)

UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
DATA_DIR = Path(__file__).parent.parent.parent / "data"

UPLOAD_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

PREDEFINED_TAGS = [
    Tag(id="tag-ch1", name="Chapitre 1", color="#4CAF50", is_predefined=True),
    Tag(id="tag-ch2", name="Chapitre 2", color="#2196F3", is_predefined=True),
    Tag(id="tag-ch3", name="Chapitre 3", color="#FF9800", is_predefined=True),
    Tag(id="tag-ch4", name="Chapitre 4", color="#9C27B0", is_predefined=True),
    Tag(id="tag-method", name="Méthode", color="#F44336", is_predefined=True),
    Tag(id="tag-def", name="Définition clé", color="#00BCD4", is_predefined=True),
    Tag(id="tag-master", name="À maîtriser", color="#FF5722", is_predefined=True),
]


def get_document_path(doc_id: str) -> Path:
    return DATA_DIR / f"{doc_id}.json"


def save_document_meta(doc: PDFDocument) -> None:
    meta_path = DATA_DIR / f"{doc.id}_meta.json"
    meta_path.write_text(json.dumps(doc.model_dump(), ensure_ascii=False), encoding="utf-8")


def load_document_meta(doc_id: str) -> PDFDocument | None:
    meta_path = DATA_DIR / f"{doc_id}_meta.json"
    if not meta_path.exists():
        return None
    data = json.loads(meta_path.read_text(encoding="utf-8"))
    return PDFDocument(**data)


def save_state(state: DocumentState) -> None:
    path = get_document_path(state.document_id)
    data = state.model_dump()
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_state(doc_id: str) -> DocumentState:
    path = get_document_path(doc_id)
    if not path.exists():
        return DocumentState(
            document_id=doc_id,
            tags=list(PREDEFINED_TAGS),
        )
    data = json.loads(path.read_text(encoding="utf-8"))
    return DocumentState(**data)


def generate_id() -> str:
    return str(uuid.uuid4())[:8]


def list_documents() -> list[PDFDocument]:
    docs = []
    for f in DATA_DIR.glob("*_meta.json"):
        data = json.loads(f.read_text(encoding="utf-8"))
        docs.append(PDFDocument(**data))
    return docs
