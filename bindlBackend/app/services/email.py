"""
app/services/email.py
Email notification service for TrustLink contracts.
Uses Gmail SMTP via credentials in .env
"""

import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _send(to_email: str, subject: str, html_body: str) -> bool:
    """
    Internal: send a single email via Gmail SMTP.
    Returns True on success, False on failure (never raises).
    """
    settings = get_settings()

    if not settings.MAIL_USERNAME or not settings.MAIL_PASSWORD:
        logger.warning("Email not configured — skipping send to %s", to_email)
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = settings.MAIL_FROM
    msg["To"]      = to_email
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.MAIL_SERVER, settings.MAIL_PORT) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(settings.MAIL_USERNAME, settings.MAIL_PASSWORD)
            smtp.sendmail(settings.MAIL_FROM, to_email, msg.as_string())
        logger.info("Email sent to %s — %s", to_email, subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to_email, exc)
        return False


# ── Public helpers ─────────────────────────────────────────────────────────────

def send_contract_invite(
    party_b_email: str,
    party_a_name: str,
    contract_title: str,
    amount_usdc: str,
    deadline: str,
    pay_url: str,
) -> bool:
    """
    Sent to Party B when Party A creates a contract and adds their email.
    """
    subject = f"📄 {party_a_name} sent you a contract on Bindl"
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:auto;background:#0f1117;color:#e5e7eb;padding:32px;border-radius:16px;">
      <div style="margin-bottom:24px;">
        <span style="background:#22c55e;color:#0f172a;font-weight:700;padding:6px 12px;border-radius:8px;font-size:14px;">Bindl</span>
      </div>
      <h1 style="font-size:20px;font-weight:700;color:#fff;margin:0 0 8px;">You've been sent a contract</h1>
      <p style="color:#9ca3af;font-size:14px;margin:0 0 24px;">
        <strong style="color:#fff">{party_a_name}</strong> has created a secure escrow contract with you on Bindl.
      </p>

      <div style="background:#1f2937;border-radius:12px;padding:20px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Contract details</p>
        <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">{contract_title}</p>
        <p style="margin:0 0 4px;font-size:14px;color:#22c55e;font-weight:600;">{amount_usdc} USDC</p>
        <p style="margin:0;font-size:13px;color:#9ca3af;">Due {deadline}</p>
      </div>

      <a href="{pay_url}"
         style="display:block;text-align:center;background:#22c55e;color:#0f172a;font-weight:700;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;margin-bottom:24px;">
        Review &amp; Accept Contract →
      </a>

      <p style="font-size:12px;color:#4b5563;text-align:center;">
        This link is unique to you. Do not share it.<br>
        Bindl — Secure peer-to-peer escrow
      </p>
    </div>
    """
    return _send(party_b_email, subject, html)


def send_contract_locked(
    party_a_email: str,
    party_b_name: str,
    contract_title: str,
    amount_usdc: str,
    dashboard_url: str,
) -> bool:
    """
    Sent to Party A when Party B locks funds (contract is now ACTIVE).
    """
    subject = f"🔒 Funds locked — {contract_title}"
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:auto;background:#0f1117;color:#e5e7eb;padding:32px;border-radius:16px;">
      <div style="margin-bottom:24px;">
        <span style="background:#22c55e;color:#0f172a;font-weight:700;padding:6px 12px;border-radius:8px;font-size:14px;">Bindl</span>
      </div>
      <h1 style="font-size:20px;font-weight:700;color:#fff;margin:0 0 8px;">Contract is now active</h1>
      <p style="color:#9ca3af;font-size:14px;margin:0 0 24px;">
        <strong style="color:#fff">{party_b_name}</strong> has accepted and locked
        <strong style="color:#22c55e">{amount_usdc} USDC</strong> into escrow for
        <strong style="color:#fff">{contract_title}</strong>.
      </p>
      <p style="color:#9ca3af;font-size:14px;margin:0 0 24px;">
        You can now begin work. Once complete, release the funds from your dashboard.
      </p>
      <a href="{dashboard_url}"
         style="display:block;text-align:center;background:#22c55e;color:#0f172a;font-weight:700;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;">
        Go to Dashboard →
      </a>
    </div>
    """
    return _send(party_a_email, subject, html)


def send_funds_released(
    party_b_email: str,
    contract_title: str,
    amount_usdc: str,
) -> bool:
    """
    Sent to Party B when Party A releases funds.
    """
    subject = f"✅ Payment released — {contract_title}"
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:auto;background:#0f1117;color:#e5e7eb;padding:32px;border-radius:16px;">
      <div style="margin-bottom:24px;">
        <span style="background:#22c55e;color:#0f172a;font-weight:700;padding:6px 12px;border-radius:8px;font-size:14px;">Bindl</span>
      </div>
      <h1 style="font-size:20px;font-weight:700;color:#fff;margin:0 0 8px;">Your payment has been released 🎉</h1>
      <p style="color:#9ca3af;font-size:14px;margin:0 0 24px;">
        <strong style="color:#22c55e">{amount_usdc} USDC</strong> has been released to your wallet
        for <strong style="color:#fff">{contract_title}</strong>.
      </p>
      <p style="font-size:12px;color:#4b5563;text-align:center;">Bindl — Secure peer-to-peer escrow</p>
    </div>
    """
    return _send(party_b_email, subject, html)