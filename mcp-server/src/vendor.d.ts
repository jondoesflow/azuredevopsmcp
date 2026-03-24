declare module "mammoth" {
  interface Result {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  function extractRawText(input: { buffer: Buffer }): Promise<Result>;
  function convertToHtml(input: { buffer: Buffer }): Promise<Result>;
  export { extractRawText, convertToHtml };
  export default { extractRawText, convertToHtml };
}

declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfData {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfData>;
  export default pdfParse;
}
