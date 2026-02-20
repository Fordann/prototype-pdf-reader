"""Extract structured segments (text blocks, formulas, images) from PDF pages using PyMuPDF."""

import base64
import re
import fitz  # PyMuPDF

MATH_PATTERNS = re.compile(
    r"(?:"
    r"[=+\-*/^∑∏∫∂∇√∞≈≠≤≥±×÷∈∉⊂⊃∪∩∀∃]"
    r"|\\(?:frac|sqrt|sum|int|lim|log|ln|sin|cos|tan|alpha|beta|gamma|delta|theta|lambda|mu|sigma|phi|pi|omega)"
    r"|\b(?:lim|sup|inf|max|min|det|dim|ker|Im|Re)\b"
    r"|\b\d+[a-zA-Z]\b"
    r"|[a-zA-Z][\s]*[=<>]"
    r"|\b[A-Z]\s*\("
    r")"
)

MATH_SYMBOLS = set("=+−×÷∑∏∫∂∇√∞≈≠≤≥±∈∉⊂⊃∪∩∀∃αβγδεζηθικλμνξπρσφψω")

# Semantic tag detection patterns (French + English)
SEMANTIC_TAGS = [
    {
        "tag": "definition",
        "label": "Définition",
        "color": "#00BCD4",
        "patterns": [
            r"(?i)^d[ée]finition\b",
            r"(?i)\bon\s+d[ée]finit\b",
            r"(?i)\bon\s+appelle\b",
            r"(?i)\best\s+d[ée]fini[e]?\s+(?:par|comme)\b",
            r"(?i)^definition\b",
        ],
    },
    {
        "tag": "theorem",
        "label": "Théorème",
        "color": "#F44336",
        "patterns": [
            r"(?i)^th[ée]or[èe]me\b",
            r"(?i)^theorem\b",
        ],
    },
    {
        "tag": "proposition",
        "label": "Proposition",
        "color": "#FF5722",
        "patterns": [
            r"(?i)^proposition\b",
        ],
    },
    {
        "tag": "lemma",
        "label": "Lemme",
        "color": "#E91E63",
        "patterns": [
            r"(?i)^lemme\b",
            r"(?i)^lemma\b",
        ],
    },
    {
        "tag": "corollary",
        "label": "Corollaire",
        "color": "#D32F2F",
        "patterns": [
            r"(?i)^corollaire\b",
            r"(?i)^corollary\b",
        ],
    },
    {
        "tag": "proof",
        "label": "Preuve",
        "color": "#795548",
        "patterns": [
            r"(?i)^(?:preuve|d[ée]monstration)\b",
            r"(?i)^proof\b",
        ],
    },
    {
        "tag": "example",
        "label": "Exemple",
        "color": "#4CAF50",
        "patterns": [
            r"(?i)^exemples?\b",
            r"(?i)^examples?\b",
            r"(?i)^ex\s*[\d.:)]",
            r"(?i)\bpar\s+exemple\b",
        ],
    },
    {
        "tag": "remark",
        "label": "Remarque",
        "color": "#FF9800",
        "patterns": [
            r"(?i)^remarques?\b",
            r"(?i)^remark\b",
            r"(?i)^nota\s*bene\b",
            r"(?i)^n\.?b\.?\b",
        ],
    },
    {
        "tag": "property",
        "label": "Propriété",
        "color": "#9C27B0",
        "patterns": [
            r"(?i)^propri[ée]t[ée]s?\b",
            r"(?i)^property\b",
            r"(?i)^properties\b",
        ],
    },
    {
        "tag": "exercise",
        "label": "Exercice",
        "color": "#2196F3",
        "patterns": [
            r"(?i)^exercices?\b",
            r"(?i)^exercise\b",
            r"(?i)^exo\s*[\d.:)]",
        ],
    },
    {
        "tag": "important",
        "label": "Important",
        "color": "#FF1744",
        "patterns": [
            r"(?i)^important\b",
            r"(?i)^attention\b",
            r"(?i)^warning\b",
        ],
    },
]

_compiled_tags = [
    {**t, "compiled": [re.compile(p) for p in t["patterns"]]}
    for t in SEMANTIC_TAGS
]


def _classify_segment(text: str) -> dict | None:
    """Classify a text segment into a semantic tag. Returns tag info or None."""
    text_stripped = text.strip()
    # Check first 150 chars for tag patterns
    head = text_stripped[:150]
    for tag_def in _compiled_tags:
        for pat in tag_def["compiled"]:
            if pat.search(head):
                return {
                    "tag": tag_def["tag"],
                    "label": tag_def["label"],
                    "color": tag_def["color"],
                }
    return None


def _is_math_block(text: str) -> bool:
    """Heuristic: detect if a text block is likely a formula/math expression."""
    if len(text.strip()) < 2:
        return False
    symbol_count = sum(1 for c in text if c in MATH_SYMBOLS)
    if symbol_count >= 2:
        return True
    matches = MATH_PATTERNS.findall(text)
    ratio = len(matches) / max(len(text.split()), 1)
    return ratio > 0.3


def extract_page_segments(pdf_path: str, page_number: int) -> list[dict]:
    """Extract segments from a single PDF page (0-indexed).

    Returns list of segments with keys:
        - type: "text" | "formula" | "image"
        - content: text content or base64-encoded image
        - bbox: [x0, y0, x1, y1] normalized to [0,1] relative to page size
        - semantic_tag: { tag, label, color } or null
    """
    doc = fitz.open(pdf_path)
    if page_number < 0 or page_number >= len(doc):
        doc.close()
        return []

    page = doc[page_number]
    width = page.rect.width
    height = page.rect.height
    segments = []

    # Extract text blocks
    blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
    for block in blocks:
        if block["type"] == 0:  # text block
            lines_text = []
            for line in block.get("lines", []):
                spans_text = "".join(span["text"] for span in line.get("spans", []))
                if spans_text.strip():
                    lines_text.append(spans_text)

            text = "\n".join(lines_text).strip()
            if not text:
                continue

            bbox = [
                block["bbox"][0] / width,
                block["bbox"][1] / height,
                block["bbox"][2] / width,
                block["bbox"][3] / height,
            ]

            seg_type = "formula" if _is_math_block(text) else "text"
            semantic = _classify_segment(text)

            segments.append({
                "type": seg_type,
                "content": text,
                "bbox": bbox,
                "semantic_tag": semantic,
            })

        elif block["type"] == 1:  # image block
            bbox = [
                block["bbox"][0] / width,
                block["bbox"][1] / height,
                block["bbox"][2] / width,
                block["bbox"][3] / height,
            ]
            try:
                img_data = block.get("image", b"")
                if img_data:
                    b64 = base64.b64encode(img_data).decode("ascii")
                    ext = block.get("ext", "png")
                    segments.append({
                        "type": "image",
                        "content": f"data:image/{ext};base64,{b64}",
                        "bbox": bbox,
                        "semantic_tag": None,
                    })
            except Exception:
                pass

    doc.close()
    return segments


def extract_all_pages(pdf_path: str) -> dict[int, list[dict]]:
    """Extract segments from all pages. Returns {page_number: [segments]}."""
    doc = fitz.open(pdf_path)
    total = len(doc)
    doc.close()

    result = {}
    for i in range(total):
        segs = extract_page_segments(pdf_path, i)
        if segs:
            result[i + 1] = segs  # 1-indexed page numbers
    return result
