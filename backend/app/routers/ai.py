from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    AIExplanationRequest, AIExplanationResponse,
    AIRecapRequest, AIRecapResponse,
    ContentAlterationRequest, ContentAlterationResponse,
)
from app.services.ai_service import explain_text, generate_recap, alter_content

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/explain", response_model=AIExplanationResponse)
async def explain(request: AIExplanationRequest):
    try:
        explanation = explain_text(request.selected_text)
        return AIExplanationResponse(explanation=explanation)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recap", response_model=AIRecapResponse)
async def recap(request: AIRecapRequest):
    try:
        result = generate_recap([f"Page {p}" for p in request.pages])
        return AIRecapResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alter", response_model=ContentAlterationResponse)
async def alter(request: ContentAlterationRequest):
    try:
        altered = alter_content(request.selected_text, request.alteration_type)
        return ContentAlterationResponse(
            altered_content=altered,
            alteration_type=request.alteration_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
