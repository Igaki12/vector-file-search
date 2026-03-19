let pdfRuntimePromise;

async function loadPdfRuntime() {
  if (!pdfRuntimePromise) {
    pdfRuntimePromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url")
    ]).then(([pdfjs, workerModule]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
      return pdfjs;
    });
  }

  return pdfRuntimePromise;
}

export async function getPdfDocument(source) {
  const pdfjs = await loadPdfRuntime();
  return pdfjs.getDocument(source).promise;
}

function joinTextItems(items) {
  return items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractPdfPages(file, options = {}) {
  const buffer = await file.arrayBuffer();
  const pdf = await getPdfDocument({ data: buffer });
  const pages = [];
  const source = options.source ?? "user";
  const previewUrl = options.previewUrl ?? null;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = joinTextItems(content.items);

    pages.push({
      id: `${file.name}-page-${pageNumber}`,
      fileName: file.name,
      pageNumber,
      kind: "pdf-page",
      source,
      previewUrl,
      text,
      label: `${file.name} / ${pageNumber}ページ`
    });
  }

  return pages;
}
