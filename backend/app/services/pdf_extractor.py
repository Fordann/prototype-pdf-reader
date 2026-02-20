"""Extract structured segments from PDF pages using PyMuPDF.

Two-pass approach:
1. Extract raw blocks and merge spatially adjacent ones into logical paragraphs
2. Classify merged segments semantically using Claude Haiku
"""

import base64
import json
import re
import fitz  # PyMuPDF
import anthropic

MATH_SYMBOLS = set("=+−×÷∑∏∫∂∇√∞≈≠≤≥±∈∉⊂⊃∪∩∀∃αβγδεζηθικλμνξπρσφψω")

MATH_PATTERNS = re.compile(
    r"(?:"
    r"[∑∏∫∂∇√∞≈≠≤≥±×÷∈∉⊂⊃∪∩∀∃]"
    r"|\\(?:frac|sqrt|sum|int|lim|log|ln|sin|cos|tan)"
    r")"
)

# Tag palette used by the AI classifier
TAG_PALETTE = {
    "definition":  {"label": "Définition",   "color": "#00BCD4"},
    "theorem":     {"label": "Théorème",     "color": "#F44336"},
    "proposition": {"label": "Proposition",  "color": "#FF5722"},
    "lemma":       {"label": "Lemme",        "color": "#E91E63"},
    "corollary":   {"label": "Corollaire",   "color": "#D32F2F"},
    "proof":       {"label": "Preuve",       "color": "#795548"},
    "example":     {"label": "Exemple",      "color": "#4CAF50"},
    "remark":      {"label": "Remarque",     "color": "#FF9800"},
    "property":    {"label": "Propriété",    "color": "#9C27B0"},
    "exercise":    {"label": "Exercice",     "color": "#2196F3"},
    "important":   {"label": "Important",    "color": "#FF1744"},
    "title":       {"label": "Titre",        "color": "#607D8B"},
    "formula":     {"label": "Formule",      "color": "#7C4DFF"},
    "introduction":{"label": "Introduction", "color": "#009688"},
    "conclusion":  {"label": "Conclusion",   "color": "#455A64"},
    "list":        {"label": "Liste",        "color": "#8BC34A"},
}


def _is_math_block(text: str) -> bool:
    if len(text.strip()) < 2:
        return False
    symbol_count = sum(1 for c in text if c in MATH_SYMBOLS)
    if symbol_count >= 3:
        return True
    matches = MATH_PATTERNS.findall(text)
    ratio = len(matches) / max(len(text.split()), 1)
    return ratio > 0.4


def _merge_blocks(raw_blocks: list[dict], page_height: float) -> list[dict]:
    """Merge spatially adjacent text blocks into logical paragraphs.

    Heuristic: two consecutive blocks are merged if:
    - They are vertically close (gap < threshold based on font size)
    - They have similar horizontal alignment (same column)
    - Neither is a title/header (large font or short + bold)
    """
    if not raw_blocks:
        return []

    # Sort by vertical position
    sorted_blocks = sorted(raw_blocks, key=lambda b: (b["bbox"][1], b["bbox"][0]))

    merged = [sorted_blocks[0]]

    for block in sorted_blocks[1:]:
        prev = merged[-1]

        prev_bottom = prev["bbox"][3]
        curr_top = block["bbox"][1]
        gap = curr_top - prev_bottom

        # Estimate line height from the previous block
        prev_height = prev["bbox"][3] - prev["bbox"][1]
        prev_lines = max(prev["content"].count("\n") + 1, 1)
        avg_line_h = prev_height / prev_lines

        # Threshold: merge if gap is less than 1.2x average line height
        gap_threshold = max(avg_line_h * 1.2, page_height * 0.015)

        # Check horizontal overlap (same column)
        prev_left, prev_right = prev["bbox"][0], prev["bbox"][2]
        curr_left, curr_right = block["bbox"][0], block["bbox"][2]
        h_overlap = min(prev_right, curr_right) - max(prev_left, curr_left)
        min_width = min(prev_right - prev_left, curr_right - curr_left)
        h_aligned = h_overlap > min_width * 0.5 if min_width > 0 else False

        # Don't merge if the block looks like a title (very short, single line)
        is_title_like = (
            block["content"].count("\n") == 0
            and len(block["content"].strip()) < 60
            and (block.get("avg_font_size", 0) > prev.get("avg_font_size", 12) * 1.2)
        )

        if gap < gap_threshold and gap >= 0 and h_aligned and not is_title_like:
            # Merge: expand bbox and concatenate content
            merged[-1] = {
                "type": prev["type"],
                "content": prev["content"] + "\n" + block["content"],
                "bbox": [
                    min(prev["bbox"][0], block["bbox"][0]),
                    prev["bbox"][1],
                    max(prev["bbox"][2], block["bbox"][2]),
                    block["bbox"][3],
                ],
                "avg_font_size": prev.get("avg_font_size", 12),
            }
        else:
            merged.append(block)

    return merged


def _extract_raw_blocks(page) -> tuple[list[dict], list[dict]]:
    """Extract raw text and image blocks from a PyMuPDF page."""
    width = page.rect.width
    height = page.rect.height
    text_blocks = []
    image_blocks = []

    blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
    for block in blocks:
        if block["type"] == 0:
            lines_text = []
            font_sizes = []
            for line in block.get("lines", []):
                spans_text = "".join(span["text"] for span in line.get("spans", []))
                if spans_text.strip():
                    lines_text.append(spans_text)
                for span in line.get("spans", []):
                    if span["text"].strip():
                        font_sizes.append(span["size"])

            text = "\n".join(lines_text).strip()
            if not text:
                continue

            avg_fs = sum(font_sizes) / len(font_sizes) if font_sizes else 12

            text_blocks.append({
                "type": "formula" if _is_math_block(text) else "text",
                "content": text,
                "bbox": list(block["bbox"]),  # absolute coords
                "avg_font_size": avg_fs,
            })

        elif block["type"] == 1:
            try:
                img_data = block.get("image", b"")
                if img_data:
                    b64 = base64.b64encode(img_data).decode("ascii")
                    ext = block.get("ext", "png")
                    image_blocks.append({
                        "type": "image",
                        "content": f"data:image/{ext};base64,{b64}",
                        "bbox": list(block["bbox"]),
                    })
            except Exception:
                pass

    return text_blocks, image_blocks


def _classify_segments_ai(segments: list[dict]) -> list[dict]:
    """Use Claude Haiku to classify each text segment semantically."""
    text_segments = [s for s in segments if s["type"] != "image"]
    if not text_segments:
        return segments

    # Build the prompt with numbered segments
    numbered = []
    for i, seg in enumerate(text_segments):
        preview = seg["content"][:300]
        numbered.append(f"[{i}] {preview}")

    segments_text = "\n---\n".join(numbered)
    tag_list = ", ".join(TAG_PALETTE.keys())

    prompt = f"""Tu analyses des segments extraits d'une page de cours PDF. Pour chaque segment, détermine son type sémantique en te basant sur SON CONTENU (pas seulement les mots-clés d'introduction).

Tags disponibles : {tag_list}

Si aucun tag ne correspond, réponds "null".

Segments :
{segments_text}

Réponds UNIQUEMENT avec un JSON array, un tag par segment dans l'ordre. Exemple : ["definition", "example", null, "theorem"]
Pas d'explication, juste le JSON array."""

    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )

        result_text = ""
        for block in response.content:
            if block.type == "text":
                result_text = block.text
                break

        # Parse JSON from response
        # Extract JSON array from response (might have markdown formatting)
        match = re.search(r"\[.*\]", result_text, re.DOTALL)
        if match:
            tags = json.loads(match.group())
        else:
            tags = []

        # Apply tags to text segments
        tag_idx = 0
        for seg in segments:
            if seg["type"] == "image":
                seg["semantic_tag"] = None
                continue
            if tag_idx < len(tags) and tags[tag_idx] and tags[tag_idx] in TAG_PALETTE:
                tag_key = tags[tag_idx]
                info = TAG_PALETTE[tag_key]
                seg["semantic_tag"] = {
                    "tag": tag_key,
                    "label": info["label"],
                    "color": info["color"],
                }
                # Also update type if classified as formula
                if tag_key == "formula":
                    seg["type"] = "formula"
            else:
                seg["semantic_tag"] = None
            tag_idx += 1

    except Exception:
        # If AI fails, leave all tags as None
        for seg in segments:
            if "semantic_tag" not in seg:
                seg["semantic_tag"] = None

    return segments


def extract_page_segments(pdf_path: str, page_number: int, classify: bool = True) -> list[dict]:
    """Extract and merge segments from a single PDF page (0-indexed).

    Returns list of segments with keys:
        - type: "text" | "formula" | "image"
        - content: text content or base64-encoded image
        - bbox: [x0, y0, x1, y1] normalized to [0,1]
        - semantic_tag: { tag, label, color } or null
    """
    doc = fitz.open(pdf_path)
    if page_number < 0 or page_number >= len(doc):
        doc.close()
        return []

    page = doc[page_number]
    width = page.rect.width
    height = page.rect.height

    text_blocks, image_blocks = _extract_raw_blocks(page)
    doc.close()

    # Merge adjacent text blocks into logical paragraphs
    merged_text = _merge_blocks(text_blocks, height)

    # Normalize bboxes to [0,1]
    segments = []
    for block in merged_text:
        block.pop("avg_font_size", None)
        block["bbox"] = [
            block["bbox"][0] / width,
            block["bbox"][1] / height,
            block["bbox"][2] / width,
            block["bbox"][3] / height,
        ]
        segments.append(block)

    for img in image_blocks:
        img["bbox"] = [
            img["bbox"][0] / width,
            img["bbox"][1] / height,
            img["bbox"][2] / width,
            img["bbox"][3] / height,
        ]
        img["semantic_tag"] = None
        segments.append(img)

    # Sort all segments top-to-bottom
    segments.sort(key=lambda s: (s["bbox"][1], s["bbox"][0]))

    # AI classification
    if classify:
        segments = _classify_segments_ai(segments)
    else:
        for seg in segments:
            seg.setdefault("semantic_tag", None)

    return segments


def extract_all_pages(pdf_path: str) -> dict[int, list[dict]]:
    """Extract segments from all pages. Returns {page_number: [segments]}."""
    doc = fitz.open(pdf_path)
    total = len(doc)
    doc.close()

    result = {}
    for i in range(total):
        segs = extract_page_segments(pdf_path, i, classify=True)
        if segs:
            result[i + 1] = segs
    return result
