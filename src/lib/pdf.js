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

function joinTextItems(items) {
  return items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractPdfPages(file, options = {}) {
  const pdfjs = await loadPdfRuntime();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages = [];
  const source = options.source ?? "user";

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
      text,
      label: `${file.name} / ${pageNumber}ページ`
    });
  }

  return pages;
}
