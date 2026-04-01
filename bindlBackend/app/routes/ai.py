from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from google import genai
import json
import logging
from google.genai import errors
from app.core.config import get_settings
from app.core.database import get_db
from app.models.models import User, Reputation

settings = get_settings()
client = genai.Client(api_key=settings.GEMINI_API_KEY)
logger = logging.getLogger(__name__)

router = APIRouter()


# ── Request schemas ───────────────────────────────────────────────────────────

class ScopeRequest(BaseModel):
    raw_description: str
    contract_type: str


class ReputationSummaryRequest(BaseModel):
    # Frontend sends { address } — backend does the DB lookup itself
    address: str


# ── Helper ────────────────────────────────────────────────────────────────────

def _strip_markdown(raw: str) -> str:
    """Strip ```json ... ``` fences that Gemini sometimes wraps output in."""
    raw = raw.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1].lstrip("json").lstrip("python").strip()
    return raw.strip()


# ── Routes ────────────────────────────────────────────────────────────────────

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

    raw = ""
    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )
        raw = _strip_markdown(response.text)
        parsed = json.loads(raw)

        required = ["title", "description", "deliverables", "acceptance_criteria"]
        missing = [k for k in required if k not in parsed]
        if missing:
            raise ValueError(f"AI response missing fields: {missing}")

        return parsed

    except json.JSONDecodeError:
        logger.error(f"AI JSON parse failed. Raw: {raw}", exc_info=True)
        raise HTTPException(
            500,
            "AI returned malformed data. Please try rephrasing your description with more specific deliverables.",
        )
    except ValueError as e:
        raise HTTPException(400, f"AI scope validation failed: {str(e)}")
    except Exception:
        logger.error("Unexpected AI error in /scope", exc_info=True)
        raise HTTPException(500, "Unable to generate scope. Please try again or contact support.")


@router.post("/reputation-summary")
async def reputation_summary(
    data: ReputationSummaryRequest,
    db: Session = Depends(get_db),
):
    wallet_lower = data.address.lower()

    # ── Fetch user + reputation ───────────────────────────────────────────────
    user = db.query(User).filter(User.wallet_address == wallet_lower).first()

    if not user or not user.reputation:
        return {
            "summary": (
                "This wallet has no transaction history on TrustLink yet. "
                "Consider starting with a smaller amount or using milestones to reduce risk."
            ),
            "risk_level": "unknown",
        }

    rep = user.reputation

    if rep.total_contracts == 0:
        return {
            "summary": (
                "This user is new with no completed contracts. "
                "Consider starting with a smaller amount or using milestones."
            ),
            "risk_level": "unknown",
        }

    # ── Build signal tags ─────────────────────────────────────────────────────
    tags: list[str] = []
    if rep.ghosting_incidents == 0 and rep.total_contracts >= 3:
        tags.append("No ghosting record")
    if rep.avg_response_hours and rep.avg_response_hours < 6:
        tags.append("Fast responder")
    if rep.completed_contracts >= 10:
        tags.append("Experienced")
    if rep.score >= 4.5:
        tags.append("Highly trusted")
    if rep.ghosting_incidents > 0:
        tags.append(f"Ghosted {rep.ghosting_incidents}x")
    if rep.disputes_lost > 1:
        tags.append("High dispute rate")
    if not tags:
        tags = ["Active user"]

    # ── Call Gemini ───────────────────────────────────────────────────────────
    prompt = f"""Write a 2-3 sentence plain-language summary of this TrustLink user's reputation.
Score: {rep.score:.1f}/5 | Contracts: {rep.total_contracts} | Completed: {rep.completed_contracts}
Disputes: {rep.disputes_raised} raised, {rep.disputes_won} won, {rep.disputes_lost} lost
Ghosting incidents: {rep.ghosting_incidents}
Tags: {", ".join(tags)}

Be honest about red flags. End with a practical suggestion for the counterparty.
Return ONLY valid JSON with no markdown: {{"summary": "...", "risk_level": "low|medium|high"}}"""

    raw = ""
    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )
        raw = _strip_markdown(response.text)
        parsed = json.loads(raw)

        if "summary" not in parsed or "risk_level" not in parsed:
            raise ValueError("Missing fields in Gemini response")

        return parsed

    except Exception:
        logger.error("Gemini reputation-summary failed", exc_info=True)
        risk = "low" if rep.score >= 4.0 else "medium" if rep.score >= 2.5 else "high"
        return {
            "summary": (
                f"Trust score {rep.score:.1f}/5 across {rep.total_contracts} contracts "
                f"({rep.completed_contracts} completed). "
                + (f"{rep.ghosting_incidents} ghosting incident(s) on record. " if rep.ghosting_incidents else "")
                + ("Exercise caution." if risk == "high" else "Generally reliable counterparty.")
            ),
            "risk_level": risk,
        }