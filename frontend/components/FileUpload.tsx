"use client";

import { useCallback, useState } from "react";

interface FileUploadProps {
  onUpload: (file: File) => Promise<void>;
  accept?: string;
  maxSizeMB?: number;
}

export default function FileUpload({
  onUpload,
  accept = ".pdf",
  maxSizeMB = 20,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) await processFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onUpload]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) await processFile(file);
      e.target.value = "";
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onUpload]
  );

  const processFile = async (file: File) => {
    setError(null);

    // Validate file type
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Hanya file PDF yang didukung");
      return;
    }

    // Validate size
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`Ukuran file maksimal ${maxSizeMB}MB`);
      return;
    }

    setIsUploading(true);
    setUploadProgress("Mengupload...");

    try {
      await onUpload(file);
      setUploadProgress("Berhasil diupload!");
      setTimeout(() => setUploadProgress(null), 3000);
    } catch (err: any) {
      setError(err.message || "Gagal mengupload file. Silakan coba lagi.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-3 text-center">
      <div
        className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition-all duration-300 relative text-center min-h-[220px] ${
          isDragging 
            ? "border-accent-primary bg-accent-primary/5 shadow-md shadow-blue-500/10" 
            : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50"
        } ${isUploading ? "opacity-70 pointer-events-none" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        id="file-upload-dropzone"
      >
        <div className={`w-14 h-14 rounded-2xl bg-accent-primary/10 flex items-center justify-center mb-4 transition-transform duration-300 ${isDragging ? "scale-110" : ""}`}>
          {isUploading ? (
            <div className="w-6 h-6 border-2 border-slate-300 border-t-accent-primary rounded-full animate-spin" />
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-primary" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="12" y2="12" />
              <line x1="15" y1="15" x2="12" y2="12" />
            </svg>
          )}
        </div>
        <p className="text-sm font-semibold text-slate-800 mb-1">
          {isUploading
            ? uploadProgress
            : "Drag & drop file PDF Anda di sini"}
        </p>
        <p className="text-xs text-slate-400 mb-5 leading-relaxed">
          atau telusuri berkas dari komputer Anda<br/>
          Maksimal {maxSizeMB}MB • Format: PDF
        </p>

        {!isUploading && (
          <label className="inline-flex items-center justify-center gap-1.5 py-2 px-5 font-primary font-semibold text-xs bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-lg cursor-pointer transition-all shadow-sm">
            <span>Pilih File PDF</span>
            <input
              type="file"
              accept={accept}
              onChange={handleFileSelect}
              className="hidden"
              disabled={isUploading}
              id="file-upload-input"
            />
          </label>
        )}

        {isUploading && (
          <div className="flex flex-col items-center gap-2.5 mt-2">
            <span className="text-xs font-semibold text-accent-primary animate-pulse">Menghubungkan ke Storage...</span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3.5 text-xs text-left flex items-center gap-2 animate-fade-in">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}
    </div>
  );
}
