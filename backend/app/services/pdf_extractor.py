"""Extract structured segments (text blocks, formulas, images) from PDF pages using PyMuPDF."""

import base64
import re
import fitz  # PyMuPDF
from pathlib import Path

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
            # Combine all lines/spans into text
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
            segments.append({
                "type": seg_type,
                "content": text,
                "bbox": bbox,
            })

        elif block["type"] == 1:  # image block
            bbox = [
                block["bbox"][0] / width,
                block["bbox"][1] / height,
                block["bbox"][2] / width,
                block["bbox"][3] / height,
            ]
            # Extract image bytes
            try:
                img_data = block.get("image", b"")
                if img_data:
                    b64 = base64.b64encode(img_data).decode("ascii")
                    ext = block.get("ext", "png")
                    segments.append({
                        "type": "image",
                        "content": f"data:image/{ext};base64,{b64}",
                        "bbox": bbox,
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
