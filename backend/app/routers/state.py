from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    Annotation, SlideNote, Tag, SlideTag, DefinitionLink,
    DocumentState, ContentAlterationResponse,
)
from app.services.storage import load_state, save_state, generate_id, PREDEFINED_TAGS

router = APIRouter(prefix="/api/state", tags=["state"])


@router.get("/{doc_id}", response_model=DocumentState)
async def get_state(doc_id: str):
    return load_state(doc_id)


# --- Annotations ---

@router.post("/{doc_id}/annotations")
async def add_annotation(doc_id: str, annotation: Annotation):
    state = load_state(doc_id)
    page = annotation.page
    page_key = str(page)
    if page_key not in state.annotations:
        state.annotations[page_key] = []
    annotation.id = annotation.id or generate_id()
    state.annotations[page_key].append(annotation)
    save_state(state)
    return annotation


@router.delete("/{doc_id}/annotations/{annotation_id}")
async def delete_annotation(doc_id: str, annotation_id: str):
    state = load_state(doc_id)
    for page_key, anns in state.annotations.items():
        state.annotations[page_key] = [a for a in anns if a.id != annotation_id]
    save_state(state)
    return {"status": "deleted"}


@router.delete("/{doc_id}/annotations")
async def clear_annotations(doc_id: str, page: int | None = None):
    state = load_state(doc_id)
    if page is not None:
        state.annotations[str(page)] = []
    else:
        state.annotations = {}
    save_state(state)
    return {"status": "cleared"}


# --- Notes ---

@router.put("/{doc_id}/notes/{page}")
async def save_note(doc_id: str, page: int, note: SlideNote):
    state = load_state(doc_id)
    note.page = page
    state.notes[str(page)] = note
    save_state(state)
    return note


@router.get("/{doc_id}/notes/{page}", response_model=SlideNote | None)
async def get_note(doc_id: str, page: int):
    state = load_state(doc_id)
    return state.notes.get(str(page))


# --- Tags ---

@router.get("/{doc_id}/tags", response_model=list[Tag])
async def get_tags(doc_id: str):
    state = load_state(doc_id)
    return state.tags


@router.post("/{doc_id}/tags")
async def create_tag(doc_id: str, tag: Tag):
    state = load_state(doc_id)
    tag.id = tag.id or generate_id()
    state.tags.append(tag)
    save_state(state)
    return tag


@router.delete("/{doc_id}/tags/{tag_id}")
async def delete_tag(doc_id: str, tag_id: str):
    state = load_state(doc_id)
    state.tags = [t for t in state.tags if t.id != tag_id or t.is_predefined]
    state.slide_tags = [st for st in state.slide_tags if st.tag_id != tag_id]
    save_state(state)
    return {"status": "deleted"}


@router.post("/{doc_id}/slide-tags")
async def add_slide_tag(doc_id: str, slide_tag: SlideTag):
    state = load_state(doc_id)
    exists = any(
        st.page == slide_tag.page and st.tag_id == slide_tag.tag_id
        for st in state.slide_tags
    )
    if not exists:
        state.slide_tags.append(slide_tag)
        save_state(state)
    return slide_tag


@router.delete("/{doc_id}/slide-tags/{page}/{tag_id}")
async def remove_slide_tag(doc_id: str, page: int, tag_id: str):
    state = load_state(doc_id)
    state.slide_tags = [
        st for st in state.slide_tags
        if not (st.page == page and st.tag_id == tag_id)
    ]
    save_state(state)
    return {"status": "deleted"}


# --- Definition Links ---

@router.post("/{doc_id}/links")
async def add_link(doc_id: str, link: DefinitionLink):
    state = load_state(doc_id)
    link.id = link.id or generate_id()
    state.definition_links.append(link)
    save_state(state)
    return link


@router.delete("/{doc_id}/links/{link_id}")
async def delete_link(doc_id: str, link_id: str):
    state = load_state(doc_id)
    state.definition_links = [l for l in state.definition_links if l.id != link_id]
    save_state(state)
    return {"status": "deleted"}


@router.get("/{doc_id}/links", response_model=list[DefinitionLink])
async def get_links(doc_id: str):
    state = load_state(doc_id)
    return state.definition_links
