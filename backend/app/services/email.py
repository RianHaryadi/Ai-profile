import resend
import base64
from datetime import datetime
from app.config import get_settings

settings = get_settings()
resend.api_key = settings.RESEND_API_KEY


class EmailService:
    """Email service using Resend for transactional emails with clean, minimalist professional templates."""

    @staticmethod
    async def send_welcome_email(to_email: str, slug: str, qr_code_url: str, onboarding_link: str):
        """
        Send welcome email after successful payment.
        Contains QR code and onboarding link.
        """
        from app.services.qr import qr_service

        app_url = settings.APP_URL
        current_year = datetime.now().year

        # Generate QR code as base64 inline (bypasses Gmail image blocking)
        card_url = f"{app_url}/card/{slug}"
        img_src = None
        qr_b64 = None
        attachments = []

        try:
            qr_png = qr_service.generate_png(card_url)
            qr_b64 = base64.b64encode(qr_png).decode("utf-8")
            img_src = f"data:image/png;base64,{qr_b64}"
            attachments = [
                {
                    "content": qr_b64,
                    "filename": "qr-code.png",
                    "content_type": "image/png",
                }
            ]
        except Exception as e:
            print(f"[Email] Failed to generate QR: {e}")
            img_src = f"{app_url}/api/qr/{slug}"

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Kartu Bisnis AI Anda Telah Siap</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1f2937;">
            <div style="background-color: #f9fafb; padding: 40px 20px; min-height: 100%;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03); border-collapse: collapse;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 10px 40px;">
                            <span style="font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.02em;">CardAI</span>
                        </td>
                    </tr>
                    <!-- Main Body -->
                    <tr>
                        <td style="padding: 20px 40px 20px 40px;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #111827; letter-spacing: -0.02em; line-height: 1.25;">Kartu Bisnis AI Anda Siap!</h1>
                            <p style="margin: 16px 0 0 0; font-size: 15px; color: #4b5563; line-height: 1.6;">Selamat bergabung! QR Code dan tautan akses untuk kartu bisnis profesional Anda telah berhasil dibuat.</p>
                        </td>
                    </tr>
                    <!-- QR Code and Link Block -->
                    <tr>
                        <td style="padding: 10px 40px 20px 40px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; border-collapse: collapse;">
                                <tr>
                                    <td align="center" style="padding-bottom: 20px;">
                                        <div style="background-color: #ffffff; padding: 8px; border: 1px solid #e5e7eb; border-radius: 8px; display: inline-block;">
                                            <img src="{img_src}" alt="QR Code" width="150" height="150" style="display: block; border: none; outline: none;" />
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center">
                                        <span style="display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Link Akses Kartu Anda</span>
                                        <a href="{app_url}/card/{slug}" target="_blank" style="display: inline-block; margin-top: 6px; font-size: 15px; font-weight: 600; color: #2563eb; text-decoration: none; word-break: break-all;">{app_url.replace('http://', '').replace('https://', '')}/card/{slug}</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Next Steps -->
                    <tr>
                        <td style="padding: 10px 40px 20px 40px;">
                            <h2 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #374151;">Langkah Berikutnya</h2>
                            <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #4b5563; line-height: 1.65;">
                                <li style="margin-bottom: 8px;"><strong style="color: #111827;">Setup Profil Bisnis</strong>: Isi detail data bisnis, kontak, dan tautan sosial media Anda.</li>
                                <li style="margin-bottom: 8px;"><strong style="color: #111827;">Unggah Katalog (AI Knowledge)</strong>: Upload file PDF brosur atau info perusahaan agar chatbot AI Anda dapat melayani calon klien.</li>
                                <li><strong style="color: #111827;">Bagikan Kartu Bisnis</strong>: Cetak QR Code Anda atau bagikan tautan secara online.</li>
                            </ul>
                        </td>
                    </tr>
                    <!-- Action Button -->
                    <tr>
                        <td style="padding: 20px 40px 10px 40px;">
                            <a href="{onboarding_link}" target="_blank" style="display: inline-block; padding: 14px 28px; background-color: #111827; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 6px; text-align: center;">Mulai Setup Profil</a>
                        </td>
                    </tr>
                    <!-- Secret Warning -->
                    <tr>
                        <td style="padding: 10px 40px 30px 40px;">
                            <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">&#9203; Tautan setup di atas bersifat rahasia dan hanya berlaku selama 48 jam.</p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">Anda menerima email ini karena mendaftar di CardAI. Jika Anda merasa tidak melakukan ini, Anda dapat mengabaikan email ini.</p>
                            <p style="margin: 12px 0 0 0; font-size: 12px; font-weight: 600; color: #9ca3af;">&copy; {current_year} CardAI. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </div>
        </body>
        </html>
        """

        try:
            email_payload = {
                "from": settings.EMAIL_FROM,
                "to": [to_email],
                "subject": "🎉 Kartu Bisnis AI Kamu Siap! - Setup Sekarang",
                "html": html_content,
            }
            if attachments:
                email_payload["attachments"] = attachments

            resend.Emails.send(email_payload)
        except Exception as e:
            print(f"[Email] Failed to send welcome email: {e}")

    @staticmethod
    async def send_magic_link(to_email: str, magic_link: str):
        """Send magic link for accessing dashboard."""
        current_year = datetime.now().year

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Link Akses Dashboard</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1f2937;">
            <div style="background-color: #f9fafb; padding: 40px 20px; min-height: 100%;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03); border-collapse: collapse;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 10px 40px;">
                            <span style="font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.02em;">CardAI</span>
                        </td>
                    </tr>
                    <!-- Main Body -->
                    <tr>
                        <td style="padding: 20px 40px 20px 40px;">
                            <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #111827; letter-spacing: -0.02em; line-height: 1.25;">Link Masuk Dashboard</h1>
                            <p style="margin: 16px 0 24px 0; font-size: 15px; color: #4b5563; line-height: 1.6;">Silakan klik tombol di bawah ini untuk masuk ke dashboard akun CardAI Anda. Tautan masuk ini tidak memerlukan kata sandi.</p>
                            <!-- Action Button -->
                            <a href="{magic_link}" target="_blank" style="display: inline-block; padding: 14px 28px; background-color: #111827; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 6px; text-align: center;">Masuk ke Dashboard</a>
                        </td>
                    </tr>
                    <!-- Secret Warning -->
                    <tr>
                        <td style="padding: 0 40px 30px 40px;">
                            <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">&#9203; Tautan masuk ini bersifat rahasia dan hanya berlaku selama 48 jam.</p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">Jika Anda tidak meminta tautan masuk ini, Anda dapat mengabaikan email ini dengan aman.</p>
                            <p style="margin: 12px 0 0 0; font-size: 12px; font-weight: 600; color: #9ca3af;">&copy; {current_year} CardAI. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </div>
        </body>
        </html>
        """

        try:
            resend.Emails.send(
                {
                    "from": settings.EMAIL_FROM,
                    "to": [to_email],
                    "subject": "🔑 Link Akses Dashboard - AI Business Card",
                    "html": html_content,
                }
            )
        except Exception as e:
            print(f"[Email] Failed to send magic link: {e}")

    @staticmethod
    async def send_subscription_reminder(to_email: str, days_left: int):
        """Send subscription expiry reminder."""
        current_year = datetime.now().year

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Subscription Hampir Habis</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1f2937;">
            <div style="background-color: #f9fafb; padding: 40px 20px; min-height: 100%;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03); border-collapse: collapse;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 10px 40px;">
                            <span style="font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.02em;">CardAI</span>
                        </td>
                    </tr>
                    <!-- Main Body -->
                    <tr>
                        <td style="padding: 20px 40px 20px 40px;">
                            <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #b45309; letter-spacing: -0.02em; line-height: 1.25;">Masa Aktif Akun Hampir Berakhir</h1>
                            <p style="margin: 16px 0 12px 0; font-size: 15px; color: #4b5563; line-height: 1.6;">Subscription paket kartu bisnis AI Anda akan berakhir dalam <strong style="color: #111827;">{days_left} hari</strong>.</p>
                            <p style="margin: 0 0 24px 0; font-size: 14px; color: #6b7280; line-height: 1.6;">Jika masa aktif habis, kartu bisnis AI Anda akan dinonaktifkan sementara dan chatbot tidak dapat melayani calon klien.</p>
                            <!-- Action Button -->
                            <a href="{settings.APP_URL}/dashboard" target="_blank" style="display: inline-block; padding: 14px 28px; background-color: #b45309; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 6px; text-align: center;">Perpanjang Subscription</a>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">Pembayaran Anda akan otomatis diperpanjang jika Anda mengaktifkan perpanjangan otomatis dengan metode pembayaran aktif.</p>
                            <p style="margin: 12px 0 0 0; font-size: 12px; font-weight: 600; color: #9ca3af;">&copy; {current_year} CardAI. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </div>
        </body>
        </html>
        """

        try:
            resend.Emails.send(
                {
                    "from": settings.EMAIL_FROM,
                    "to": [to_email],
                    "subject": f"⚠️ Subscription Berakhir dalam {days_left} Hari",
                    "html": html_content,
                }
            )
        except Exception as e:
            print(f"[Email] Failed to send reminder: {e}")


# Singleton instance
email_service = EmailService()