from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routers import documents, state, ai
from app.services.storage import UPLOAD_DIR

app = FastAPI(title="StudyInk API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.include_router(documents.router)
app.include_router(state.router)
app.include_router(ai.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
