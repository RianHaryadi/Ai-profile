import io
import qrcode
from qrcode.image.svg import SvgImage


class QRService:
    """QR Code generation service."""

    @staticmethod
    def generate_png(url: str, box_size: int = 10, border: int = 4, fill_color: str = "#1a1a3e", back_color: str = "white") -> bytes:
        """
        Generate a QR code as PNG bytes.
        
        Args:
            url: The URL to encode in the QR code
            box_size: Size of each box in pixels
            border: Border size in boxes
            fill_color: The color of the QR code data boxes
            back_color: The color of the background
            
        Returns:
            PNG image as bytes
        """
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=box_size,
            border=border,
        )
        qr.add_data(url)
        qr.make(fit=True)

        img = qr.make_image(fill_color=fill_color, back_color=back_color)
        
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer.getvalue()

    @staticmethod
    def generate_svg(url: str, fill_color: str = "#1a1a3e", back_color: str = "white") -> str:
        """
        Generate a QR code as SVG string.
        
        Args:
            url: The URL to encode in the QR code
            fill_color: The color of the QR code data boxes
            back_color: The color of the background
            
        Returns:
            SVG markup as string
        """
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(url)
        qr.make(fit=True)

        # SVG image generation accepts styling
        img = qr.make_image(image_factory=SvgImage)
        
        buffer = io.BytesIO()
        img.save(buffer)
        buffer.seek(0)
        return buffer.getvalue().decode("utf-8")


# Singleton instance
qr_service = QRService()
