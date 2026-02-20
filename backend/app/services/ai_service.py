import os
import anthropic

MODEL = "claude-haiku-4-5-20251001"


def get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic()


def explain_text(selected_text: str, page_context: str = "") -> str:
    client = get_client()
    prompt = f"""Tu es un assistant pédagogique. Un étudiant a sélectionné le texte suivant dans ses cours (page de cours PDF) et demande une explication claire et concise.

Texte sélectionné :
\"\"\"{selected_text}\"\"\"

{f"Contexte de la page : {page_context}" if page_context else ""}

Fournis une explication claire, structurée et pédagogique de ce passage. Utilise des exemples si pertinent. Réponds en français."""

    response = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )

    for block in response.content:
        if block.type == "text":
            return block.text
    return ""


def generate_recap(pages_text: list[str]) -> dict:
    client = get_client()
    combined = "\n\n---\n\n".join(
        [f"[Slide {i+1}]\n{text}" for i, text in enumerate(pages_text)]
    )

    prompt = f"""Tu es un assistant pédagogique. À partir des slides de cours suivantes, génère une fiche de synthèse récapitulative des points clés.

Slides :
{combined}

Génère :
1. Un titre pour cette synthèse
2. Les points clés sous forme de liste structurée
3. Les définitions importantes
4. Les formules ou concepts à retenir

Réponds en français. Formate en Markdown."""

    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    text = ""
    for block in response.content:
        if block.type == "text":
            text = block.text
            break

    lines = text.strip().split("\n")
    title = "Récapitulatif"
    for line in lines:
        if line.startswith("# "):
            title = line[2:].strip()
            break
        elif line.startswith("## "):
            title = line[3:].strip()
            break

    return {"title": title, "recap_content": text}


def alter_content(selected_text: str, alteration_type: str) -> str:
    client = get_client()

    type_instructions = {
        "table": "Transforme ce contenu en un tableau récapitulatif clair et structuré en Markdown.",
        "timeline": "Transforme ce contenu en une frise chronologique textuelle en Markdown, avec les dates/étapes clés.",
        "diagram": "Transforme ce contenu en un schéma textuel (utilise des caractères ASCII/Unicode pour représenter les relations, ou décris le schéma en Markdown structuré).",
    }

    instruction = type_instructions.get(
        alteration_type,
        "Transforme ce contenu en un format plus clair et structuré."
    )

    prompt = f"""Tu es un assistant pédagogique. Un étudiant souhaite transformer le contenu suivant de ses cours.

Contenu original :
\"\"\"{selected_text}\"\"\"

Instruction : {instruction}

Réponds uniquement avec le contenu transformé, en français, formaté en Markdown."""

    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    for block in response.content:
        if block.type == "text":
            return block.text
    return ""
