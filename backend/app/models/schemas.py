from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class AnnotationType(str, Enum):
    PEN = "pen"
    ELLIPSE = "ellipse"
    STICKY_NOTE = "sticky_note"


class AnnotationColor(str, Enum):
    YELLOW = "#FFEB3B"
    RED = "#F44336"
    CYAN = "#00BCD4"
    VIOLET = "#9C27B0"


class Point(BaseModel):
    x: float
    y: float


class Annotation(BaseModel):
    id: str
    page: int
    type: AnnotationType
    color: str = AnnotationColor.YELLOW
    stroke_width: float = 2.0
    points: list[Point] = []
    text: str = ""
    x: float = 0
    y: float = 0
    width: float = 0
    height: float = 0


class SlideNote(BaseModel):
    page: int
    content: str = ""
    visible: bool = True
    x: float = 0.5
    y: float = 0.5


class Tag(BaseModel):
    id: str
    name: str
    color: str = "#2196F3"
    is_predefined: bool = False


class SlideTag(BaseModel):
    page: int
    tag_id: str


class DefinitionLink(BaseModel):
    id: str
    source_page: int
    target_page: int
    text: str
    label: str = ""


class PDFDocument(BaseModel):
    id: str
    filename: str
    total_pages: int
    file_path: str


class AIExplanationRequest(BaseModel):
    document_id: str
    page: int
    selected_text: str


class AIExplanationResponse(BaseModel):
    explanation: str


class AIRecapRequest(BaseModel):
    document_id: str
    pages: list[int]


class AIRecapResponse(BaseModel):
    recap_content: str
    title: str


class ContentAlterationRequest(BaseModel):
    document_id: str
    page: int
    selected_text: str
    alteration_type: str  # "table", "timeline", "diagram"


class ContentAlterationResponse(BaseModel):
    altered_content: str
    alteration_type: str


class DocumentState(BaseModel):
    document_id: str
    annotations: dict[int, list[Annotation]] = {}
    notes: dict[int, SlideNote] = {}
    tags: list[Tag] = []
    slide_tags: list[SlideTag] = []
    definition_links: list[DefinitionLink] = []
    content_alterations: dict[str, ContentAlterationResponse] = {}
