import React, { useEffect, useMemo, useState } from "react";
import { verifyApiKey, embedText } from "./lib/googleEmbeddings.js";
import { extractPdfPages } from "./lib/pdf.js";
import { splitTextIntoSegments, combinedScore, summarizeText } from "./lib/search.js";

const API_KEY_STORAGE = "vector-file-search-api-key";
const OUTPUT_DIMENSIONALITY = 3072;
const APP_ICON_PATH = `${import.meta.env.BASE_URL}icon.png`;
const SAMPLE_FILES = [
  "2021年度 形成外科.pdf",
  "2022年度 形成外科.pdf",
  "2023年度 形成外科.pdf",
  "2024免疫学中間試験問題_奈良医大.pdf",
  "2024年度 形成外科.pdf",
  "2024年度 形成外科_小テスト.pdf",
  "2025_力学基礎1.pdf",
  "2025_細胞生物学.pdf",
  "2025年度形成外科.pdf"
];

function makeTextRecords(file, text, source = "user") {
  return splitTextIntoSegments(text).map((segment, index) => ({
    id: `${file.name}-segment-${index + 1}`,
    fileName: file.name,
    pageNumber: null,
    kind: "text-segment",
    source,
    previewUrl: null,
    text: segment,
    label: `${file.name} / セグメント ${index + 1}`
  }));
}

async function readTextFile(file) {
  return file.text();
}

async function fetchSamplePdf(fileName) {
  const response = await fetch(`${import.meta.env.BASE_URL}sample-files/${encodeURIComponent(fileName)}`);

  if (!response.ok) {
    throw new Error(`サンプル PDF の取得に失敗しました: ${fileName}`);
  }

  const blob = await response.blob();
  return new File([blob], fileName, { type: "application/pdf" });
}

async function buildRecords(file, options = {}) {
  const source = options.source ?? "user";
  const previewUrl = options.previewUrl ?? null;

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractPdfPages(file, { source, previewUrl });
  }

  const text = await readTextFile(file);
  return makeTextRecords(file, text, source);
}

function formatScore(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function getSampleFileHref(fileName) {
  return `${import.meta.env.BASE_URL}sample-files/${encodeURIComponent(fileName)}`;
}

function rankRecords(records, query, queryVector) {
  const scored = records.map((record) => {
    const scores = combinedScore(query, record.text, queryVector, record.embedding);

    return {
      ...record,
      scores,
      snippet: summarizeText(record.text)
    };
  });

  const grouped = new Map();

  for (const item of scored) {
    const existing = grouped.get(item.fileName);

    if (!existing || item.scores.finalScore > existing.bestMatch.scores.finalScore) {
      grouped.set(item.fileName, {
        fileName: item.fileName,
        kind: item.kind === "pdf-page" ? "pdf" : "text",
        bestMatch: item
      });
    }
  }

  return Array.from(grouped.values()).sort(
    (left, right) => right.bestMatch.scores.finalScore - left.bestMatch.scores.finalScore
  );
}

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? "");
  const [apiStatus, setApiStatus] = useState({ state: "idle", message: "" });
  const [records, setRecords] = useState([]);
  const [libraryStatus, setLibraryStatus] = useState({ state: "idle", message: "" });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState({ state: "idle", message: "" });
  const [extraFiles, setExtraFiles] = useState([]);
  const [textDraft, setTextDraft] = useState("");
  const [storageStatus, setStorageStatus] = useState({ state: "idle", message: "" });
  const [isResultsAnimating, setIsResultsAnimating] = useState(false);
  const [previewState, setPreviewState] = useState({
    isOpen: false,
    fileName: "",
    url: "",
    pageNumber: 1
  });
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem(API_KEY_STORAGE, apiKey);
    } else {
      localStorage.removeItem(API_KEY_STORAGE);
    }
  }, [apiKey]);

  useEffect(() => {
    if (!previewState.isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsClosing((closing) => {
          if (closing) return true;
          setTimeout(() => {
            setPreviewState((current) => ({ ...current, isOpen: false }));
            setIsClosing(false);
          }, 450);
          return true;
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewState.isOpen]);

  useEffect(() => {
    // アニメーションを確実に再トリガーするため一旦 false にする
    setIsResultsAnimating(false);

    const timer1 = window.setTimeout(() => {
      setIsResultsAnimating(true);
    }, 50);

    const timer2 = window.setTimeout(() => {
      setIsResultsAnimating(false);
    }, 3050);

    return () => {
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
    };
  }, [results]);

  const indexedSummary = useMemo(() => {
    const pdfPages = records.filter((record) => record.kind === "pdf-page").length;
    const textSegments = records.filter((record) => record.kind === "text-segment").length;

    return { pdfPages, textSegments, files: new Set(records.map((record) => record.fileName)).size };
  }, [records]);

  const topResult = results[0]?.bestMatch ?? null;
  const previewSrc = previewState.url
    ? `${previewState.url}#page=${previewState.pageNumber}&view=FitH`
    : "";

  function mergeRecords(current, incoming) {
    const next = new Map(current.map((record) => [record.id, record]));

    for (const record of incoming) {
      next.set(record.id, record);
    }

    return Array.from(next.values());
  }

  async function embedUnits(units, nextStatus) {
    const embedded = [];

    for (const unit of units) {
      nextStatus(`${unit.label} のベクトルを生成しています...`);

      const embedding = await embedText({
        apiKey: apiKey.trim(),
        text: unit.text || `${unit.fileName} ${unit.pageNumber ?? ""}`.trim(),
        outputDimensionality: OUTPUT_DIMENSIONALITY,
        taskType: "RETRIEVAL_DOCUMENT"
      });

      embedded.push({
        ...unit,
        embedding
      });
    }

    return embedded;
  }

  async function loadSampleLibraryIntoStorage() {
    const existingSampleRecords = records.filter((record) => record.source === "sample");

    if (existingSampleRecords.length) {
      setLibraryStatus({
        state: "success",
        message: `${SAMPLE_FILES.length}件のサンプル PDF は読み込み済みです。`
      });
      return { addedRecords: [], reused: true };
    }

    setLibraryStatus({ state: "loading", message: "サンプル PDF を解析しています..." });

    const sampleFiles = [];

    for (const fileName of SAMPLE_FILES) {
      sampleFiles.push(await fetchSamplePdf(fileName));
    }

    const units = [];

    for (const file of sampleFiles) {
      const fileUnits = await buildRecords(file, {
        source: "sample",
        previewUrl: getSampleFileHref(file.name)
      });
      units.push(...fileUnits);
    }

    const embedded = await embedUnits(units, (message) => {
      setLibraryStatus({ state: "loading", message });
    });

    setRecords((current) => mergeRecords(current, embedded));
    setResults([]);
    setLibraryStatus({
      state: "success",
      message: `${SAMPLE_FILES.length}件のサンプル PDF を自動で読み込み、${embedded.length}ページをベクトル化しました。`
    });

    return { addedRecords: embedded, reused: false };
  }

  async function handleApiVerify() {
    if (!apiKey.trim()) {
      setApiStatus({ state: "error", message: "API キーを入力してください。" });
      return;
    }

    setApiStatus({ state: "loading", message: "接続確認とサンプル準備を進めています..." });

    try {
      await verifyApiKey(apiKey.trim());

      const { addedRecords, reused } = await loadSampleLibraryIntoStorage();
      const sampleMessage = reused
        ? "サンプル PDF は既にベクトル化済みです。"
        : `${addedRecords.length}件の検索単位をサンプルから準備しました。`;

      setApiStatus({ state: "success", message: `接続確認に成功しました。${sampleMessage}` });
    } catch (error) {
      setApiStatus({ state: "error", message: error.message });
    }
  }

  function handleExtraFileChange(event) {
    const selected = Array.from(event.target.files ?? []);
    setExtraFiles(selected);
    setStorageStatus({
      state: "idle",
      message: selected.length ? `${selected.length}件の追加ファイルを選択しました。` : ""
    });
  }

  async function handleAddFilesToStorage() {
    if (!apiKey.trim()) {
      setStorageStatus({ state: "error", message: "先に API キーを設定してください。" });
      return;
    }

    if (!extraFiles.length) {
      setStorageStatus({ state: "error", message: "追加するファイルを選択してください。" });
      return;
    }

    try {
      const units = [];

      setStorageStatus({ state: "loading", message: "追加ファイルを解析しています..." });

      for (const file of extraFiles) {
        const previewUrl =
          file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
            ? URL.createObjectURL(file)
            : null;
        const fileUnits = await buildRecords(file, { source: "user", previewUrl });
        if (!fileUnits.length) {
          continue;
        }
        units.push(...fileUnits);
      }

      const embedded = await embedUnits(units, (message) => {
        setStorageStatus({ state: "loading", message });
      });

      setRecords((current) => [...current, ...embedded]);
      setResults([]);
      setExtraFiles([]);
      setStorageStatus({
        state: "success",
        message: `${embedded.length}件の検索単位をストレージに追加しました。`
      });
    } catch (error) {
      setStorageStatus({ state: "error", message: error.message });
    }
  }

  async function handleAddTextToStorage() {
    if (!apiKey.trim()) {
      setStorageStatus({ state: "error", message: "先に API キーを設定してください。" });
      return;
    }

    if (!textDraft.trim()) {
      setStorageStatus({ state: "error", message: "追加するテキストを入力してください。" });
      return;
    }

    try {
      const pseudoFile = { name: `pasted-note-${Date.now()}.txt` };
      const units = makeTextRecords(pseudoFile, textDraft.trim(), "user");

      setStorageStatus({ state: "loading", message: "テキストをストレージに追加しています..." });
      const embedded = await embedUnits(units, (message) => {
        setStorageStatus({ state: "loading", message });
      });

      setRecords((current) => [...current, ...embedded]);
      setResults([]);
      setTextDraft("");
      setStorageStatus({
        state: "success",
        message: `${embedded.length}件のテキストセグメントをストレージに追加しました。`
      });
    } catch (error) {
      setStorageStatus({ state: "error", message: error.message });
    }
  }

  async function handleSearch() {
    if (!query.trim()) {
      setSearchStatus({ state: "error", message: "検索フレーズを入力してください。" });
      return;
    }

    if (!records.length) {
      setSearchStatus({ state: "error", message: "先にファイルをベクトル化してください。" });
      return;
    }

    setSearchStatus({ state: "loading", message: "関連度を計算しています..." });

    try {
      const queryVector = await embedText({
        apiKey: apiKey.trim(),
        text: query.trim(),
        outputDimensionality: OUTPUT_DIMENSIONALITY,
        taskType: "RETRIEVAL_QUERY"
      });

      const ranked = rankRecords(records, query.trim(), queryVector);
      setResults(ranked);
      setSearchStatus({ state: "success", message: `${ranked.length}件のファイルを並び替えました。` });
    } catch (error) {
      setSearchStatus({ state: "error", message: error.message });
    }
  }

  function openPdfPreview({ fileName, url, pageNumber = 1 }) {
    if (!url) {
      return;
    }

    setPreviewState({
      isOpen: true,
      fileName,
      url,
      pageNumber
    });
  }

  function closePdfPreview() {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setPreviewState((current) => ({ ...current, isOpen: false }));
      setIsClosing(false);
    }, 450);
  }

  return (
    <div className={`shell ${(previewState.isOpen && !isClosing) ? "preview-open" : ""}`}>
      <div className="app-content">
        <header className="hero">
          <div className="hero-copy-block">
            <p className="eyebrow">Vector File Search Demo</p>
            <div className="hero-title-row">
              <img className="hero-icon" src={APP_ICON_PATH} alt="Vector File Search アイコン" />
              <div className="hero-title-copy">
                <h1>保存済みの資料から、近いページをすぐ見つける。</h1>
                <p className="hero-copy">
                  PDF とテキストを対象に、ベクトル検索と語句一致を組み合わせて関連度順に表示します。
                </p>
              </div>
            </div>
          </div>
          <div className="summary-row">
            <div className="summary-chip">
              <span>ファイル</span>
              <strong>{indexedSummary.files}</strong>
            </div>
            <div className="summary-chip">
              <span>PDFページ</span>
              <strong>{indexedSummary.pdfPages}</strong>
            </div>
            <div className="summary-chip">
              <span>テキスト</span>
              <strong>{indexedSummary.textSegments}</strong>
            </div>
          </div>
        </header>

        <main className="page-stack">
          <section className="card section-card">
            <div className="section-head">
              <span className="step">STEP 1</span>
              <h2>API キー</h2>
            </div>
            <p className="section-copy">ブラウザ内だけで保持します。</p>
            <label className="field">
              <span>API Key</span>
              <input
                type="password"
                placeholder="AIza..."
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button className="primary-button" type="button" onClick={handleApiVerify}>
                接続確認
              </button>
            </div>
            <p className={`status ${apiStatus.state}`}>{apiStatus.message || "キーはブラウザの localStorage にだけ保持します。"}</p>
          </section>

          <section className="card section-card search-card">
            <div className="section-head">
              <span className="step">STEP 2</span>
              <h2>検索</h2>
            </div>
            <p className="section-copy">検索対象が入っていれば、そのまま関連度順に並べ替えます。</p>
            <label className="field">
              <span>検索フレーズ</span>
              <textarea
                rows="4"
                placeholder="例: 皮弁形成の基本手技について説明しているページ"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button className="primary-button" type="button" onClick={handleSearch}>
                関連度順に並べる
              </button>
            </div>
            <p className={`status ${searchStatus.state}`}>{searchStatus.message || "検索フレーズを入力すると、最も近いファイルと PDF ページを表示します。"}</p>
          </section>
        </main>

        <section className={`results card ${isResultsAnimating ? "is-animating" : ""}`}>
          <div className="section-head">
            <span className="step results-step">RESULTS</span>
            <h2 className="results-title">関連度ランキング</h2>
          </div>
          {topResult ? (
            <div className="spotlight">
              <div>
                <span className="spotlight-label">Top Match</span>
                <h3>{topResult.fileName}</h3>
                <p>{topResult.pageNumber ? `${topResult.pageNumber}ページが最も近い候補です。` : "最も近いテキストセグメントです。"}</p>
              </div>
              <div className="spotlight-score">{formatScore(topResult.scores.finalScore)}</div>
            </div>
          ) : null}
          {results.length ? (
            <div className="result-list">
              {results.map((result, index) => (
                <article
                  className={`result-card ${result.kind === "pdf" ? "clickable" : "inactive"}`}
                  key={result.fileName}
                  onClick={() => {
                    if (result.kind !== "pdf") {
                      return;
                    }

                    openPdfPreview({
                      fileName: result.fileName,
                      url: result.bestMatch.previewUrl,
                      pageNumber: result.bestMatch.pageNumber ?? 1
                    });
                  }}
                  onKeyDown={(event) => {
                    if (result.kind !== "pdf") {
                      return;
                    }

                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPdfPreview({
                        fileName: result.fileName,
                        url: result.bestMatch.previewUrl,
                        pageNumber: result.bestMatch.pageNumber ?? 1
                      });
                    }
                  }}
                  role={result.kind === "pdf" ? "button" : undefined}
                  tabIndex={result.kind === "pdf" ? 0 : -1}
                  aria-label={
                    result.kind === "pdf"
                      ? `${result.fileName} の ${result.bestMatch.pageNumber} ページをプレビュー`
                      : undefined
                  }
                >
                  <div className="result-rank">{String(index + 1).padStart(2, "0")}</div>
                  <div className="result-body">
                    <div className="result-head">
                      <div>
                        <h3>{result.fileName}</h3>
                        <p>
                          {result.kind === "pdf"
                            ? `最も関連したページ: ${result.bestMatch.pageNumber}ページ`
                            : "最も関連したセグメントを表示中"}
                        </p>
                      </div>
                      <div className="score-stack">
                        <span className="score-label">Final {formatScore(result.bestMatch.scores.finalScore)}</span>
                        <span className="score-sub">Semantic {formatScore(result.bestMatch.scores.semantic)}</span>
                        <span className="score-sub">Lexical {formatScore(result.bestMatch.scores.lexical)}</span>
                      </div>
                    </div>
                    <div className="score-bar">
                      <div
                        className="score-bar-fill"
                        style={{ width: `${Math.max(result.bestMatch.scores.finalScore * 100, 4)}%` }}
                      />
                    </div>
                    <p className="snippet">{result.bestMatch.snippet || "このページから取得できるテキストが見つかりませんでした。"}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>まだ検索結果はありません。</h3>
              <p>API キー確認後にサンプル PDF を自動準備します。検索フレーズを入力すると結果が表示されます。</p>
            </div>
          )}
        </section>

        <section className="card storage-card">
          <div className="section-head">
            <span className="step">OPTIONAL</span>
            <h2>ストレージに資料を追加</h2>
          </div>
          <p className="section-copy">
            必要な場合のみ、`.txt` / `.pdf` や短いメモを追加します。
          </p>
          <div className="storage-layout">
            <div>
              <label className="upload-box compact">
                <input type="file" accept=".txt,.pdf" multiple onChange={handleExtraFileChange} />
                <span>追加ファイルを選択</span>
                <small>選択後にストレージへ追加します</small>
              </label>
              <div className="file-list">
                {extraFiles.length ? (
                  extraFiles.map((file) => (
                    <div className="file-chip" key={file.name}>
                      <strong>{file.name}</strong>
                      <span>{file.type || "text/plain"}</span>
                    </div>
                  ))
                ) : (
                  <p className="muted">追加ファイルは未選択です。</p>
                )}
              </div>
              <div className="button-row">
                <button className="primary-button" type="button" onClick={handleAddFilesToStorage}>
                  ファイルを追加
                </button>
              </div>
            </div>
            <div>
              <label className="field">
                <span>テキストを直接追加</span>
                <textarea
                  rows="7"
                  placeholder="検索対象に加えたいメモや説明文を入力"
                  value={textDraft}
                  onChange={(event) => setTextDraft(event.target.value)}
                />
              </label>
              <div className="button-row">
                <button className="primary-button" type="button" onClick={handleAddTextToStorage}>
                  テキストを追加
                </button>
              </div>
            </div>
          </div>
          <p className={`status ${storageStatus.state}`}>
            {storageStatus.message || "必要な場合のみ、ここから検索対象を追加してください。"}
          </p>
        </section>

        <section className="card side-card">
          <div className="section-head">
            <span className="step">OPTIONAL</span>
            <h2>サンプルを確認する</h2>
          </div>
          <p className="section-copy">
            既定のサンプル PDF は API 接続確認時に自動でベクトル化されます。
          </p>

          <div className="sample-list">
            {SAMPLE_FILES.map((fileName) => (
              <button
                className="sample-link"
                type="button"
                key={fileName}
                onClick={() =>
                  openPdfPreview({
                    fileName,
                    url: getSampleFileHref(fileName),
                    pageNumber: 1
                  })
                }
              >
                {fileName}
              </button>
            ))}
          </div>
          <p className={`status ${libraryStatus.state}`}>
            {libraryStatus.message || "接続確認が完了すると、自動でサンプルを準備します。"}
          </p>

        </section>
      </div>
      {(previewState.isOpen || isClosing) ? (
        <div className={`preview-overlay ${isClosing ? "is-closing" : "is-open"}`} role="presentation">
          <section className="preview-panel" aria-label="PDF プレビュー">
            <div className="preview-header">
              <div className="preview-header-main">
                <span className="step">PDF Preview</span>
                <h4>{previewState.fileName}</h4>
              </div>
              <button className="preview-close" type="button" onClick={closePdfPreview} aria-label="PDF プレビューを閉じる">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6L18 18" />
                  <path d="M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="preview-frame-wrap">
              <iframe className="preview-frame" src={previewSrc} title={previewState.fileName} />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
