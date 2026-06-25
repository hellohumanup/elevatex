"use client";

import { useRef, useState } from "react";

const ACCEPTED_EXTENSIONS = [".xlsx", ".csv"];
const ACCEPTED_MIME_TYPES = [
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

function isAcceptedFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();

  return (
    ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext)) ||
    ACCEPTED_MIME_TYPES.includes(file.type)
  );
}

function CloudUploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M14 34h20a8 8 0 0 0 1.2-15.93A11 11 0 0 0 13.5 18.5 9 9 0 0 0 14 34Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 22v12M19 27l5-5 5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocumentCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M14 8h14l8 8v24a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M28 8v8h8M18 28l4 4 8-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4 10h10M11 7l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type TeamVotesImportZoneProps = {
  onProcess: (
    file: File,
    reportProgress: (label: string) => void,
  ) => Promise<void>;
  successMessage?: string | null;
};

export default function TeamVotesImportZone({
  onProcess,
  successMessage,
}: TeamVotesImportZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState("Procesando…");

  function handleFile(file: File) {
    if (!isAcceptedFile(file)) {
      setFileError("Formato no válido. Usa un archivo .xlsx o .csv.");
      setUploadedFile(null);
      return;
    }

    setFileError(null);
    setUploadedFile(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }

  function handleBrowseClick() {
    inputRef.current?.click();
  }

  function handleRemoveFile() {
    setUploadedFile(null);
    setFileError(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function handleProcess() {
    if (!uploadedFile || isProcessing) {
      return;
    }

    setIsProcessing(true);
    setFileError(null);
    setProcessingLabel("Procesando…");

    try {
      await onProcess(uploadedFile, setProcessingLabel);
    } catch (processError) {
      setFileError(
        processError instanceof Error
          ? processError.message
          : "No se pudo procesar el archivo.",
      );
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="space-y-4">
      {!uploadedFile ? (
        <div
          role="button"
          tabIndex={0}
          onClick={handleBrowseClick}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleBrowseClick();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          className={`group relative cursor-pointer rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all ${
            isDragging
              ? "border-indigo-400 bg-indigo-50/60 shadow-inner"
              : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100/80"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleInputChange}
            className="sr-only"
          />

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 transition-colors group-hover:text-indigo-500">
            <CloudUploadIcon className="h-9 w-9" />
          </div>

          <p className="mt-5 text-sm font-medium text-slate-700">
            Arrastra tu archivo Excel (.xlsx) o CSV aquí, o haz clic para
            explorar
          </p>
          <p className="mt-2 text-xs text-slate-500">
            El archivo debe contener las columnas: Empleado, Voto1, Voto2, Voto3
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-6 py-8">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-200">
              <DocumentCheckIcon className="h-8 w-8" />
            </div>

            <div className="mt-4 sm:mt-0 sm:ml-5 sm:flex-1">
              <p className="text-sm font-semibold text-emerald-800">
                Archivo cargado con éxito: {uploadedFile.name}
              </p>
              <p className="mt-1 text-xs text-emerald-700/80">
                {(uploadedFile.size / 1024).toFixed(1)} KB · Listo para
                procesar las votaciones del equipo
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
            <button
              type="button"
              onClick={handleProcess}
              disabled={isProcessing}
              className="group relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-lg bg-gradient-to-b from-slate-800 to-slate-950 px-6 py-3 text-sm font-semibold tracking-wide text-white shadow-[0_1px_2px_rgba(15,23,42,0.12),0_8px_24px_rgba(15,23,42,0.18)] ring-1 ring-white/10 transition-all duration-200 hover:from-slate-700 hover:to-slate-900 hover:shadow-[0_2px_4px_rgba(15,23,42,0.14),0_12px_32px_rgba(15,23,42,0.22)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-[0_1px_2px_rgba(15,23,42,0.12),0_8px_24px_rgba(15,23,42,0.18)]"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
              />
              {isProcessing ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                  <span>{processingLabel}</span>
                </>
              ) : (
                <>
                  <span>Procesar Datos</span>
                  <ArrowRightIcon className="h-4 w-4 text-white/70 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleRemoveFile}
              disabled={isProcessing}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cambiar archivo
            </button>
          </div>
        </div>
      )}

      {fileError && (
        <p className="text-sm text-red-600">{fileError}</p>
      )}

      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {successMessage}
        </div>
      )}
    </div>
  );
}
