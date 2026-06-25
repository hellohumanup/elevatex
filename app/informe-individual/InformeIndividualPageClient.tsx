"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import IndividualEmployeeReportView, {
  INFORME_INDIVIDUAL_PDF_ID,
} from "@/components/IndividualEmployeeReportView";
import {
  buildIndividualEmployeeReport,
  createDemoEmployeeReportState,
  resolveDemoEmployeeFromQuery,
} from "@/lib/individualReportEngine";

export default function InformeIndividualPageClient() {
  const searchParams = useSearchParams();
  const employee = useMemo(
    () => resolveDemoEmployeeFromQuery(searchParams.get("nombre")),
    [searchParams],
  );

  const [report, setReport] = useState(createDemoEmployeeReportState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(buildIndividualEmployeeReport(employee.id, employee.name));
  }, [employee.id, employee.name]);

  const handleDownloadPDF = async () => {
    try {
      setLoading(true);
      setError(null);

      // Importación dinámica para evitar fallos de SSR
      const html2pdf = (await import("html2pdf.js")).default;

      const element = document.getElementById(INFORME_INDIVIDUAL_PDF_ID);

      if (!element) {
        throw new Error("No se encontró el contenedor del informe.");
      }

      const opt = {
        margin: 10,
        filename: "ElevateX_Plan_de_Accion.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
      };

      await html2pdf().set(opt).from(element).save();
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("No se pudo generar el PDF. Inténtalo de nuevo.");
      setLoading(false);
    }
  };

  return (
    <IndividualEmployeeReportView
      report={report}
      onDownloadPdf={handleDownloadPDF}
      isDownloading={loading}
      downloadError={error}
    />
  );
}
