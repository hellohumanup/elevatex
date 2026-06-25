declare module "html2pdf.js" {
  type Html2PdfOptions = {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: {
      unit?: string;
      format?: string | number[];
      orientation?: "portrait" | "landscape";
    };
    pagebreak?: { mode?: string | string[]; before?: string; after?: string };
  };

  type Html2PdfWorker = {
    set(options: Html2PdfOptions): Html2PdfWorker;
    from(element: HTMLElement): Html2PdfWorker;
    save(): Promise<void>;
  };

  export default function html2pdf(): Html2PdfWorker;
}
