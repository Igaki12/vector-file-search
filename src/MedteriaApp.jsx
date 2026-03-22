import React, { useEffect, useMemo, useState } from "react";
import { verifyApiKey, embedText } from "./lib/googleEmbeddings.js";
import { extractPdfPages } from "./lib/pdf.js";
import { splitTextIntoSegments, combinedScore, summarizeText } from "./lib/search.js";

const API_KEY_STORAGE = "vector-file-search-api-key";
const OUTPUT_DIMENSIONALITY = 3072;
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

function ShellIcon({ children, className = "", viewBox = "0 0 24 24" }) {
  return (
    <svg className={className} viewBox={viewBox} aria-hidden="true">
      {children}
    </svg>
  );
}

function MedteriaLogo() {
  return (
    <div className="med-brand">
      <div className="med-brand-mark">
        <span />
        <span />
        <span />
      </div>
      <div>
        <strong>Medteria</strong>
        <p>Drive Prototype</p>
      </div>
    </div>
  );
}

export default function MedteriaApp() {
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
          }, 420);
          return true;
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewState.isOpen]);

  useEffect(() => {
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
    }, 420);
  }

  return (
    <div className={`med-page ${(previewState.isOpen && !isClosing) ? "preview-open" : ""}`}>
      <aside className="med-sidebar">
        <div className="med-sidebar-top">
          <MedteriaLogo />
          <button className="med-community-switch" type="button">
            <span className="med-avatar">奈</span>
            <span>
              <strong>奈良県立医科大学 医学部 医学科</strong>
              <small>4年 ドライブ</small>
            </span>
            <ShellIcon className="med-chevron">
              <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </ShellIcon>
          </button>
        </div>

        <nav className="med-nav">
          <p className="med-nav-label">スペース</p>
          <button className="med-nav-item" type="button">ホーム</button>
          <button className="med-nav-item is-active" type="button">ドライブ</button>
          <button className="med-nav-item" type="button">トピック</button>
          <button className="med-nav-item" type="button">メンバー</button>
        </nav>

        <section className="med-sidebar-card">
          <p className="med-nav-label">ワークスペース</p>
          <ul className="med-mini-list">
            <li>形成外科 過去問</li>
            <li>免疫学 試験資料</li>
            <li>力学基礎1</li>
          </ul>
        </section>

        <section className="med-sidebar-card med-sidebar-note">
          <strong>検索中心のデモ導線</strong>
          <p>API キー確認後にサンプルPDFを自動で読み込み、そのまま検索できます。</p>
        </section>
      </aside>

      <div className="med-main-shell">
        <header className="med-topbar">
          <div>
            <p className="med-breadcrumbs">コミュニティ / 4年 / Drive</p>
            <h1>ファイル検索を統合した Medteria Drive</h1>
          </div>
          <div className="med-topbar-actions">
            <a className="med-link-button" href={`${import.meta.env.BASE_URL}index.html`}>
              既存フロントへ戻る
            </a>
            <button className="med-icon-button" type="button" aria-label="通知">
              <ShellIcon>
                <path d="M12 4a4 4 0 0 0-4 4v2.2c0 .5-.2 1-.5 1.4L6 13.5h12l-1.5-1.9c-.3-.4-.5-.9-.5-1.4V8a4 4 0 0 0-4-4Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M10 17a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </ShellIcon>
            </button>
            <div className="med-user-chip">
              <span className="med-user-avatar">M</span>
              <span>Medteria公式</span>
            </div>
          </div>
        </header>

        <main className="med-content">
          <section className="med-panel med-hero-panel">
            <div className="med-section-head">
              <div>
                <p className="med-kicker">Drive Search</p>
                <h2>保存済み資料から、近いページを直感的に見つける</h2>
              </div>
              <div className="med-chip-row">
                <span className="med-stat-pill">ファイル {indexedSummary.files}</span>
                <span className="med-stat-pill">PDFページ {indexedSummary.pdfPages}</span>
                <span className="med-stat-pill">テキスト {indexedSummary.textSegments}</span>
              </div>
            </div>
            <div className="med-control-grid">
              <section className="med-input-card">
                <div className="med-card-head">
                  <h3>API キー接続</h3>
                  <span>STEP 1</span>
                </div>
                <p className="med-muted">キーはブラウザ内だけで保持します。接続確認と同時にサンプルPDFを準備します。</p>
                <label className="med-field">
                  <span>API Key</span>
                  <input
                    type="password"
                    placeholder="AIza..."
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </label>
                <div className="med-action-row">
                  <button className="med-primary-button" type="button" onClick={handleApiVerify}>
                    接続確認
                  </button>
                </div>
                <p className={`med-status ${apiStatus.state}`}>
                  {apiStatus.message || "接続成功後に sample-files/ のPDFを自動ベクトル化します。"}
                </p>
              </section>

              <section className="med-input-card">
                <div className="med-card-head">
                  <h3>意味検索</h3>
                  <span>STEP 2</span>
                </div>
                <p className="med-muted">ベクトル検索を主体に、語句一致を補助で加えたハイブリッドスコアで並べ替えます。</p>
                <label className="med-field">
                  <span>検索フレーズ</span>
                  <textarea
                    rows="5"
                    placeholder="例: 皮弁形成の基本手技について説明しているページ"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <div className="med-action-row">
                  <button className="med-primary-button" type="button" onClick={handleSearch}>
                    関連度順に表示
                  </button>
                </div>
                <p className={`med-status ${searchStatus.state}`}>
                  {searchStatus.message || "最も近いファイルと、PDFなら最関連ページを一覧表示します。"}
                </p>
              </section>
            </div>
          </section>

          <section className="med-panel med-library-panel">
            <div className="med-library-header">
              <div>
                <p className="med-kicker">Storage Overview</p>
                <h2>検索対象ストレージ</h2>
              </div>
              <p className={`med-status inline ${libraryStatus.state}`}>
                {libraryStatus.message || "接続確認が完了すると、既定のサンプルを自動で準備します。"}
              </p>
            </div>
            <div className="med-summary-table">
              <div className="med-summary-row">
                <span>索引済みファイル数</span>
                <strong>{indexedSummary.files}</strong>
              </div>
              <div className="med-summary-row">
                <span>PDFページ単位</span>
                <strong>{indexedSummary.pdfPages}</strong>
              </div>
              <div className="med-summary-row">
                <span>テキストセグメント</span>
                <strong>{indexedSummary.textSegments}</strong>
              </div>
            </div>
          </section>

          <section className={`med-panel med-results-panel ${isResultsAnimating ? "is-animating" : ""}`}>
            <div className="med-results-head">
              <div>
                <p className="med-results-tag">RESULTS</p>
                <h2>関連度ランキング</h2>
              </div>
              {topResult ? (
                <div className="med-top-match">
                  <span>Top Match</span>
                  <strong>{topResult.fileName}</strong>
                  <small>
                    {topResult.pageNumber ? `${topResult.pageNumber}ページ` : "テキストセグメント"}
                  </small>
                </div>
              ) : null}
            </div>

            <div className="med-result-table">
              <div className="med-result-header">
                <span>順位</span>
                <span>ファイル</span>
                <span>種別</span>
                <span>一致箇所</span>
                <span>スコア</span>
              </div>
              {results.length ? (
                results.map((result, index) => (
                  <article
                    className={`med-result-row ${result.kind === "pdf" ? "clickable" : "inactive"}`}
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
                    <div className="med-rank-cell">{String(index + 1).padStart(2, "0")}</div>
                    <div className="med-file-cell">
                      <strong>{result.fileName}</strong>
                      <p>{result.bestMatch.snippet || "この検索単位の抜粋がありません。"}</p>
                    </div>
                    <div className="med-type-cell">
                      <span className={`med-type-badge ${result.kind}`}>{result.kind === "pdf" ? "PDF" : "TEXT"}</span>
                    </div>
                    <div className="med-match-cell">
                      {result.kind === "pdf"
                        ? `最関連ページ: ${result.bestMatch.pageNumber}ページ`
                        : "最関連セグメント"}
                    </div>
                    <div className="med-score-cell">
                      <strong>{formatScore(result.bestMatch.scores.finalScore)}</strong>
                      <small>S {formatScore(result.bestMatch.scores.semantic)} / L {formatScore(result.bestMatch.scores.lexical)}</small>
                    </div>
                  </article>
                ))
              ) : (
                <div className="med-empty-state">
                  <h3>まだ検索結果はありません。</h3>
                  <p>接続確認後にサンプルを準備し、検索フレーズを入力するとランキングが表示されます。</p>
                </div>
              )}
            </div>
          </section>

          <details className="med-panel med-optional-panel">
            <summary>
              <span>追加資料とサンプル確認</span>
              <small>OPTIONAL</small>
            </summary>
            <div className="med-optional-grid">
              <section className="med-subpanel">
                <h3>ファイルを追加</h3>
                <label className="med-upload-box">
                  <input type="file" accept=".txt,.pdf" multiple onChange={handleExtraFileChange} />
                  <span>.txt / .pdf を選択</span>
                  <small>追加時にその場で解析してベクトル化します。</small>
                </label>
                <div className="med-selection-list">
                  {extraFiles.length ? (
                    extraFiles.map((file) => (
                      <div className="med-selection-row" key={file.name}>
                        <strong>{file.name}</strong>
                        <span>{file.type || "text/plain"}</span>
                      </div>
                    ))
                  ) : (
                    <p className="med-muted">追加ファイルは未選択です。</p>
                  )}
                </div>
                <button className="med-secondary-button" type="button" onClick={handleAddFilesToStorage}>
                  ファイルを追加
                </button>
              </section>

              <section className="med-subpanel">
                <h3>テキストメモを追加</h3>
                <label className="med-field">
                  <span>メモ本文</span>
                  <textarea
                    rows="7"
                    placeholder="検索対象に加えたい説明や要点を入力"
                    value={textDraft}
                    onChange={(event) => setTextDraft(event.target.value)}
                  />
                </label>
                <button className="med-secondary-button" type="button" onClick={handleAddTextToStorage}>
                  テキストを追加
                </button>
              </section>
            </div>
            <section className="med-subpanel med-sample-panel">
              <div className="med-sample-panel-head">
                <h3>サンプルPDFを確認</h3>
                <p className={`med-status inline ${storageStatus.state}`}>
                  {storageStatus.message || "必要な場合のみ、ここから追加資料を登録してください。"}
                </p>
              </div>
              <div className="med-sample-grid">
                {SAMPLE_FILES.map((fileName) => (
                  <button
                    className="med-sample-link"
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
                    <span>{fileName}</span>
                    <small>先頭ページから表示</small>
                  </button>
                ))}
              </div>
            </section>
          </details>
        </main>
      </div>

      {(previewState.isOpen || isClosing) ? (
        <div className={`med-preview-dock ${isClosing ? "is-closing" : "is-open"}`} role="presentation">
          <section className="med-preview-panel" aria-label="PDF プレビュー">
            <div className="med-preview-header">
              <div>
                <p className="med-kicker">PDF Preview</p>
                <h3>{previewState.fileName}</h3>
                <p className="med-muted">表示ページ: {previewState.pageNumber}</p>
              </div>
              <button className="med-icon-button" type="button" onClick={closePdfPreview} aria-label="PDF プレビューを閉じる">
                <ShellIcon>
                  <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </ShellIcon>
              </button>
            </div>
            <div className="med-preview-frame-wrap">
              <iframe className="med-preview-frame" src={previewSrc} title={previewState.fileName} />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
