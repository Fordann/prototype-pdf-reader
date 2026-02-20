"""Extract structured segments from PDF pages using PyMuPDF + Claude Haiku vision.

Approach:
1. Render each page as an image
2. Also extract positioned text blocks from PyMuPDF (for bbox mapping)
3. Send page image to Haiku vision: segment by MEANING, classify, read text from images
4. Map AI segments back to PyMuPDF blocks for bounding boxes
"""

import base64
import json
import re
import fitz  # PyMuPDF
import anthropic

TAG_PALETTE = {
    "definition":   {"label": "Définition",   "color": "#00BCD4"},
    "theorem":      {"label": "Théorème",     "color": "#F44336"},
    "proposition":  {"label": "Proposition",  "color": "#FF5722"},
    "lemma":        {"label": "Lemme",        "color": "#E91E63"},
    "corollary":    {"label": "Corollaire",   "color": "#D32F2F"},
    "proof":        {"label": "Preuve",       "color": "#795548"},
    "example":      {"label": "Exemple",      "color": "#4CAF50"},
    "remark":       {"label": "Remarque",     "color": "#FF9800"},
    "property":     {"label": "Propriété",    "color": "#9C27B0"},
    "exercise":     {"label": "Exercice",     "color": "#2196F3"},
    "important":    {"label": "Important",    "color": "#FF1744"},
    "title":        {"label": "Titre",        "color": "#607D8B"},
    "formula":      {"label": "Formule",      "color": "#7C4DFF"},
    "introduction": {"label": "Introduction", "color": "#009688"},
    "conclusion":   {"label": "Conclusion",   "color": "#455A64"},
    "list":         {"label": "Liste",        "color": "#8BC34A"},
    "text":         {"label": "Texte",        "color": "#78909C"},
    "figure":       {"label": "Figure",       "color": "#FFD740"},
}


def _normalize(text: str) -> str:
    """Normalize text for fuzzy matching."""
    return " ".join(text.lower().split())


def _extract_positioned_blocks(page) -> list[dict]:
    """Get text blocks with their absolute bboxes from PyMuPDF."""
    blocks = []
    raw = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
    for block in raw:
        if block["type"] == 0:
            lines = []
            for line in block.get("lines", []):
                t = "".join(span["text"] for span in line.get("spans", []))
                if t.strip():
                    lines.append(t)
            text = "\n".join(lines).strip()
            if text:
                blocks.append({"text": text, "bbox": list(block["bbox"])})
        elif block["type"] == 1:
            # Keep image blocks for position reference
            blocks.append({"text": None, "bbox": list(block["bbox"]), "is_image": True})
    return blocks


def _match_bbox(segment_content: str, positioned_blocks: list[dict], page_w: float, page_h: float) -> list[float] | None:
    """Find bounding box for an AI segment by matching its text to positioned blocks."""
    seg_norm = _normalize(segment_content)
    if not seg_norm or len(seg_norm) < 3:
        return None

    matched = []
    for block in positioned_blocks:
        if block.get("is_image"):
            continue
        block_norm = _normalize(block["text"])
        if not block_norm:
            continue

        # Check if block text (or a significant chunk) appears in the segment
        # Use first 30 normalized chars as fingerprint
        fingerprint = block_norm[:30]
        if len(fingerprint) >= 5 and fingerprint in seg_norm:
            matched.append(block["bbox"])
            continue

        # Also check if segment text appears in block
        seg_fingerprint = seg_norm[:30]
        if len(seg_fingerprint) >= 5 and seg_fingerprint in block_norm:
            matched.append(block["bbox"])
            continue

        # Word overlap check for shorter texts
        if len(block_norm) < 30:
            block_words = set(block_norm.split())
            seg_words = set(seg_norm.split())
            if block_words and len(block_words & seg_words) >= len(block_words) * 0.7:
                matched.append(block["bbox"])

    if matched:
        return [
            min(b[0] for b in matched) / page_w,
            min(b[1] for b in matched) / page_h,
            max(b[2] for b in matched) / page_w,
            max(b[3] for b in matched) / page_h,
        ]
    return None


def _ai_segment_page(page_image_b64: str) -> list[dict]:
    """Send page image to Haiku vision for semantic segmentation."""
    tag_list = ", ".join(TAG_PALETTE.keys())

    prompt = f"""Analyse cette page de cours/slide. Tu dois :

1. LIRE tout le texte visible, y compris le texte dans les images, figures, schémas, graphiques
2. SEGMENTER le contenu en sections logiques basées sur le SENS et l'enchaînement des idées (PAS la mise en page)
3. CLASSIFIER chaque section
4. FORMATER chaque section en Markdown lisible

Tags disponibles : {tag_list}

Règles de segmentation :
- Regroupe les paragraphes qui traitent du même sujet/idée
- Un théorème et son énoncé = un seul segment
- Une définition avec ses notations = un seul segment
- Un exemple avec ses calculs = un seul segment
- Les listes d'items liés = un seul segment
- Le texte dans les figures/images doit être inclus dans un segment "figure"
- Les titres/sous-titres sont des segments "title" séparés

Règles de formatage du contenu :
- Utilise du Markdown : **gras** pour les termes importants, *italique* pour les variables
- Sépare les paragraphes avec des sauts de ligne
- Utilise des listes à puces (- ) ou numérotées (1. ) quand c'est pertinent
- Les formules mathématiques DOIVENT être en LaTeX :
  - Formule inline : $formule$ (ex: $x^2 + y^2 = r^2$)
  - Formule en bloc (display) : $$formule$$ sur sa propre ligne (ex: $$\\int_0^1 f(x)\\,dx$$)
  - TOUJOURS utiliser le mode display $$ $$ pour les formules importantes, les équations, les définitions mathématiques
  - Utilise les commandes LaTeX : \\frac, \\sum, \\int, \\lim, \\sqrt, \\mathbb, \\forall, \\exists, \\in, \\cup, \\cap, etc.
- Aère le texte : jamais un bloc compact sans sauts de ligne
- Conserve fidèlement le contenu, mais rends-le lisible

Réponds UNIQUEMENT avec un JSON array. Chaque élément :
{{"tag": "...", "content": "contenu formaté en markdown"}}

JSON :"""

    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": page_image_b64,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }],
        )

        result_text = ""
        for block in response.content:
            if block.type == "text":
                result_text = block.text
                break

        # Parse JSON array from response
        match = re.search(r"\[.*\]", result_text, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception:
        pass

    return []


def extract_page_segments(pdf_path: str, page_number: int, classify: bool = True) -> list[dict]:
    """Extract segments from a PDF page (0-indexed).

    Returns list of segments:
        - type: "text" | "formula" | "image"
        - content: text content
        - bbox: [x0, y0, x1, y1] normalized [0,1] or null
        - semantic_tag: { tag, label, color } or null
    """
    doc = fitz.open(pdf_path)
    if page_number < 0 or page_number >= len(doc):
        doc.close()
        return []

    page = doc[page_number]
    page_w = page.rect.width
    page_h = page.rect.height

    # Get positioned blocks for bbox mapping
    positioned_blocks = _extract_positioned_blocks(page)

    if not classify:
        # Simple extraction without AI
        doc.close()
        segments = []
        for block in positioned_blocks:
            if block.get("is_image"):
                continue
            segments.append({
                "type": "text",
                "content": block["text"],
                "bbox": [
                    block["bbox"][0] / page_w,
                    block["bbox"][1] / page_h,
                    block["bbox"][2] / page_w,
                    block["bbox"][3] / page_h,
                ],
                "semantic_tag": None,
            })
        return segments

    # Render page as image for Haiku vision
    pix = page.get_pixmap(dpi=150)
    img_b64 = base64.b64encode(pix.tobytes("png")).decode("ascii")
    doc.close()

    # AI segmentation + classification
    ai_segments = _ai_segment_page(img_b64)

    if not ai_segments:
        # Fallback: return raw blocks without tags
        segments = []
        for block in positioned_blocks:
            if block.get("is_image"):
                continue
            segments.append({
                "type": "text",
                "content": block["text"],
                "bbox": [
                    block["bbox"][0] / page_w,
                    block["bbox"][1] / page_h,
                    block["bbox"][2] / page_w,
                    block["bbox"][3] / page_h,
                ],
                "semantic_tag": None,
            })
        return segments

    # Build final segments with bboxes and tags
    result = []
    for ai_seg in ai_segments:
        tag_key = ai_seg.get("tag", "text")
        content = ai_seg.get("content", "").strip()
        if not content:
            continue

        tag_info = TAG_PALETTE.get(tag_key)
        semantic_tag = {
            "tag": tag_key,
            "label": tag_info["label"],
            "color": tag_info["color"],
        } if tag_info else None

        seg_type = "text"
        if tag_key == "formula":
            seg_type = "formula"
        elif tag_key == "figure":
            seg_type = "image"

        bbox = _match_bbox(content, positioned_blocks, page_w, page_h)

        result.append({
            "type": seg_type,
            "content": content,
            "bbox": bbox,
            "semantic_tag": semantic_tag,
        })

    return result


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


def extract_concept_graph(all_segments: dict) -> dict:
    """Build a concept graph linking notions across pages.

    Takes {page_number: [segments]} and returns:
        { notions: [...], links: [...] }
    """
    # Build a condensed summary of all segments for the AI
    summary_lines = []
    for page_str, segs in all_segments.items():
        page = int(page_str)
        for idx, seg in enumerate(segs):
            tag = seg.get("semantic_tag", {})
            tag_name = tag.get("tag", "text") if tag else "text"
            content = seg.get("content", "").strip()
            # Keep first 200 chars to stay within token limits
            preview = content[:200].replace("\n", " ")
            if preview:
                summary_lines.append(f"[Page {page}, #{idx}, {tag_name}] {preview}")

    if not summary_lines:
        return {"notions": [], "links": []}

    summary = "\n".join(summary_lines)

    prompt = f"""Tu es un assistant pédagogique. Voici les segments extraits d'un cours :

{summary}

Analyse ce contenu et identifie :
1. Les NOTIONS CLÉS (concepts, définitions, théorèmes, propriétés, formules importantes)
2. Les LIENS entre ces notions (quelle notion utilise, dépend de, illustre, prouve, généralise une autre)

Pour chaque notion, indique :
- Un identifiant court (id)
- Le nom de la notion
- Le type (definition, theorem, property, formula, concept, method, example)
- Les pages où elle apparaît
- Une description courte (1 phrase)

Pour chaque lien, indique :
- La source (id de la notion)
- La cible (id de la notion)
- Le type de relation : "uses" (utilise), "proves" (démontre), "illustrates" (illustre), "generalizes" (généralise), "requires" (nécessite), "defines" (définit)
- Un label court décrivant le lien

Réponds UNIQUEMENT avec un JSON :
{{"notions": [{{"id": "...", "name": "...", "type": "...", "pages": [1, 3], "description": "..."}}], "links": [{{"source": "...", "target": "...", "type": "...", "label": "..."}}]}}

JSON :"""

    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )

        result_text = ""
        for block in response.content:
            if block.type == "text":
                result_text = block.text
                break

        match = re.search(r"\{.*\}", result_text, re.DOTALL)
        if match:
            graph = json.loads(match.group())
            # Assign colors based on type
            type_colors = {
                "definition": "#00BCD4",
                "theorem": "#F44336",
                "property": "#9C27B0",
                "formula": "#7C4DFF",
                "concept": "#FF9800",
                "method": "#4CAF50",
                "example": "#8BC34A",
            }
            for notion in graph.get("notions", []):
                notion["color"] = type_colors.get(notion.get("type", ""), "#78909C")
            return graph
    except Exception:
        pass

    return {"notions": [], "links": []}
