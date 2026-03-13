"""
DCF Calculator - FastAPI Application Entry Point
DCF Maker
"""

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from api.routes import router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
        title="IC DCF Calculator API",
        description="Investment Club DCF Valuation Engine",
        version="1.0.0",
)

# Allow all origins in production (Next.js frontend on Vercel + local dev)
app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/health")
def health_check():
        return {"status": "ok", "service": "IC DCF Calculator"}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
        logger.error("422 Validation error on %s %s", request.method, request.url.path)
        for err in exc.errors():
                    logger.error("  Field: %s | Error: %s | Input: %s", err.get("loc"), err.get("msg"), str(err.get("input", ""))[:200])
                return JSONResponse(
                            status_code=422,
                            content={"detail": exc.errors()},
                )


@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
        return JSONResponse(
            status_code=500,
            content={"error": str(exc), "type": type(exc).__name__},
)


if __name__ == "__main__":
        import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
