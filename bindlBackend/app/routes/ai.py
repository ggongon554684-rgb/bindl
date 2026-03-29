from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import google.generativeai as genai
import json
import logging

from app.core.config import get_settings

settings = get_settings()
genai.configure(api_key=settings.GEMINI_API_KEY)
logger = logging.getLogger(__name__)
model = genai.GenerativeModel("gemini-2.0-flash")

router = APIRouter()


class ScopeRequest(BaseModel):
    raw_description: str
    contract_type: str


class ReputationSummaryRequest(BaseModel):
    score: float
    total_contracts: int
    completed_contracts: int
    disputes_raised: int
    disputes_won: int
    disputes_lost: int
    ghosting_incidents: int
    avg_response_hours: Optional[float]
    signal_tags: list[str]
    is_new: bool


@router.post("/scope")
async def generate_scope(data: ScopeRequest):
    prompt = f"""You are a contract structuring assistant for TrustLink.
Convert this {data.contract_type.replace("_", " ")} job description into a clear contract scope.

User description: \"\"\"{data.raw_description}\"\"\"

Return ONLY valid JSON, no markdown, no explanation:
{{
  "title": "Short contract title (max 60 chars)",
  "description": "One clear paragraph",
  "deliverables": ["Specific deliverable 1", "Specific deliverable 2"],
  "acceptance_criteria": ["Measurable criterion 1"],
  "suggested_revision_count": 2,
  "suggested_deadline_days": 7,
  "warnings": ["Any vague language flagged"]
}}"""

    try:
        response = model.generate_content(prompt)
        raw = response.text.strip()
        
        # ✅ Strip markdown code blocks if present (handles ```json, ```python, etc)
        if raw.startswith("```"):
            raw = raw.split("```")[1]  # Get content between markers
            raw = raw.lstrip("json").lstrip("python").lstrip()  # Remove language identifier
        
        raw = raw.strip()
        parsed = json.loads(raw)
        
        # Validate response has required fields
        required = ["title", "description", "deliverables", "acceptance_criteria"]
        missing = [k for k in required if k not in parsed]
        if missing:
            raise ValueError(f"AI response missing fields: {missing}")
        
        return parsed
    except json.JSONDecodeError as e:
        logger.error(f"AI JSON parse failed. Raw: {raw}", exc_info=True)
        raise HTTPException(
            500, 
            "AI returned malformed data. Please try rephrasing your description with more specific deliverables."
        )
    except ValueError as e:
        raise HTTPException(400, f"AI scope validation failed: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected AI error", exc_info=True)
        raise HTTPException(500, "Unable to generate scope. Please try again or contact support.")


@router.post("/reputation-summary")
async def reputation_summary(data: ReputationSummaryRequest):
    if data.is_new:
        return {
            "summary": "This user is new with no transaction history. Consider starting with a smaller amount or using milestones.",
            "risk_level": "unknown",
        }

    prompt = f"""Write a 2-3 sentence plain-language summary of this TrustLink user's reputation.
Score: {data.score:.1f}/5 | Contracts: {data.total_contracts} | Completed: {data.completed_contracts}
Disputes: {data.disputes_raised} raised, {data.disputes_won} won, {data.disputes_lost} lost
Ghosting incidents: {data.ghosting_incidents}
Tags: {", ".join(data.signal_tags)}

Be honest about red flags. End with a practical suggestion.
Return ONLY valid JSON: {{"summary": "...", "risk_level": "low|medium|high"}}"""

    try:
        response = model.generate_content(prompt)
        raw = response.text.strip().strip("```").strip("json").strip()
        return json.loads(raw)
    except Exception:
        risk = "low" if data.score >= 4.0 else "medium" if data.score >= 2.5 else "high"
        return {"summary": f"Trust score: {data.score:.1f}/5 across {data.total_contracts} contracts.", "risk_level": risk}
