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

declare module "pdf-parse" {
  interface PDFParseOptions {
    verbosity?: number;
  }
  class PDFParse {
    constructor(options: PDFParseOptions);
    load(data: Buffer): Promise<void>;
    getText(): Promise<string>;
    destroy(): void;
  }
  export { PDFParse };
}
