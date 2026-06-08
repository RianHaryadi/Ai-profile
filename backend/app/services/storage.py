import io
from minio import Minio
from minio.error import S3Error
from app.config import get_settings

settings = get_settings()


class StorageService:
    """MinIO S3-compatible storage handler for file uploads."""

    def __init__(self):
        self.client = Minio(
            endpoint=settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_USE_SSL,
        )
        self.bucket = settings.MINIO_BUCKET_NAME
        self._ensure_bucket()

    def _ensure_bucket(self):
        """Create bucket if it doesn't exist."""
        try:
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)
        except S3Error as e:
            print(f"[Storage] Error creating bucket: {e}")

    def upload_file(self, file_path: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """
        Upload a file to MinIO.
        
        Args:
            file_path: Path within the bucket (e.g., "users/{user_id}/profile.jpg")
            data: File content as bytes
            content_type: MIME type of the file
            
        Returns:
            The file path in the bucket
        """
        try:
            self.client.put_object(
                bucket_name=self.bucket,
                object_name=file_path,
                data=io.BytesIO(data),
                length=len(data),
                content_type=content_type,
            )
            return file_path
        except S3Error as e:
            raise Exception(f"Failed to upload file: {e}")

    def get_presigned_url(self, file_path: str, expires_hours: int = 24) -> str:
        """Get a presigned URL for downloading a file."""
        from datetime import timedelta
        try:
            return self.client.presigned_get_object(
                bucket_name=self.bucket,
                object_name=file_path,
                expires=timedelta(hours=expires_hours),
            )
        except S3Error as e:
            raise Exception(f"Failed to get presigned URL: {e}")

    def get_file(self, file_path: str) -> bytes:
        """Download a file from MinIO and return its content."""
        try:
            response = self.client.get_object(
                bucket_name=self.bucket,
                object_name=file_path,
            )
            data = response.read()
            response.close()
            response.release_conn()
            return data
        except S3Error as e:
            raise Exception(f"Failed to get file: {e}")

    def delete_file(self, file_path: str):
        """Delete a file from MinIO."""
        try:
            self.client.remove_object(
                bucket_name=self.bucket,
                object_name=file_path,
            )
        except S3Error as e:
            raise Exception(f"Failed to delete file: {e}")


# Singleton instance
storage_service = StorageService()
