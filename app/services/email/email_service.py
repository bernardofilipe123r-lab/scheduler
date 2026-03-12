"""
Email service — sends transactional emails via Resend.
Uses RESEND_API_KEY env var.
"""
import os
import logging

logger = logging.getLogger(__name__)


def send_buffer_reminder(to_email: str, days_remaining: float, pipeline_url: str = "https://viraltoby.com/pipeline"):
    """Send a buffer expiry reminder email.

    Args:
        to_email: recipient email address
        days_remaining: approximate days of content remaining
        pipeline_url: link to the pipeline page
    """
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        logger.warning("RESEND_API_KEY not set — skipping buffer reminder email")
        return False

    try:
        import resend
        resend.api_key = api_key

        hours_left = max(0, int(days_remaining * 24))
        time_label = f"{hours_left} hours" if hours_left > 0 else "less than an hour"

        resend.Emails.send({
            "from": "Viral Toby <noreply@viraltoby.com>",
            "to": [to_email],
            "subject": f"⏰ Your content buffer expires in {time_label}",
            "html": f"""
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
                <h2 style="color: #1a1a2e; margin-bottom: 8px;">Your content buffer is running low</h2>
                <p style="color: #555; line-height: 1.6;">
                    Toby has about <strong>{time_label}</strong> of scheduled content remaining.
                    Head to the Pipeline to review and approve pending posts before your buffer runs out.
                </p>
                <a href="{pipeline_url}"
                   style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                    Open Pipeline →
                </a>
                <p style="color: #999; font-size: 12px; margin-top: 24px;">
                    You can disable this reminder in Toby Settings → General → Buffer Reminder.
                </p>
            </div>
            """,
        })
        logger.info(f"Buffer reminder email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send buffer reminder email to {to_email}: {e}")
        return False
