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
  "2024年度 形成外科.pdf",
  "2024年度 形成外科_小テスト.pdf",
  "2025年度形成外科.pdf"
];

function makeTextRecords(file, text) {
  return splitTextIntoSegments(text).map((segment, index) => ({
    id: `${file.name}-segment-${index + 1}`,
    fileName: file.name,
    pageNumber: null,
    kind: "text-segment",
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

async function buildRecords(file) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractPdfPages(file);
  }

  const text = await readTextFile(file);
  return makeTextRecords(file, text);
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

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem(API_KEY_STORAGE, apiKey);
    } else {
      localStorage.removeItem(API_KEY_STORAGE);
    }
  }, [apiKey]);

  const indexedSummary = useMemo(() => {
    const pdfPages = records.filter((record) => record.kind === "pdf-page").length;
    const textSegments = records.filter((record) => record.kind === "text-segment").length;

    return { pdfPages, textSegments, files: new Set(records.map((record) => record.fileName)).size };
  }, [records]);

  const topResult = results[0]?.bestMatch ?? null;

  async function handleApiVerify() {
    if (!apiKey.trim()) {
      setApiStatus({ state: "error", message: "API キーを入力してください。" });
      return;
    }

    setApiStatus({ state: "loading", message: "接続確認中..." });

    try {
      await verifyApiKey(apiKey.trim());
      setApiStatus({ state: "success", message: "接続確認に成功しました。" });
    } catch (error) {
      setApiStatus({ state: "error", message: error.message });
    }
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

  async function handleLoadSampleLibrary() {
    if (!apiKey.trim()) {
      setLibraryStatus({ state: "error", message: "先に API キーを設定してください。" });
      return;
    }

    setLibraryStatus({ state: "loading", message: "デモ用ストレージを読み込んでいます..." });

    try {
      const sampleFiles = [];

      for (const fileName of SAMPLE_FILES) {
        sampleFiles.push(await fetchSamplePdf(fileName));
      }

      const units = [];

      for (const file of sampleFiles) {
        const fileUnits = await buildRecords(file);
        units.push(...fileUnits);
      }

      const embedded = await embedUnits(units, (message) => {
        setLibraryStatus({ state: "loading", message });
      });

      setRecords(embedded);
      setResults([]);
      setLibraryStatus({
        state: "success",
        message: `${SAMPLE_FILES.length}件のサンプル PDF を読み込み、${embedded.length}ページをベクトル化しました。`
      });
    } catch (error) {
      setLibraryStatus({ state: "error", message: error.message });
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
        const fileUnits = await buildRecords(file);
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
      const units = makeTextRecords(pseudoFile, textDraft.trim());

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

  return (
    <div className="shell">
      <header className="hero">
        <div className="hero-copy-block">
          <p className="eyebrow">Vector File Search Demo</p>
          <h1>保存済みの資料から、近いページをすぐ見つける。</h1>
          <p className="hero-copy">
            PDF とテキストを対象に、ベクトル検索と語句一致を組み合わせて関連度順に表示します。
          </p>
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

      <section className="results card">
        <div className="section-head">
          <span className="step">RESULTS</span>
          <h2>関連度ランキング</h2>
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
              <article className="result-card" key={result.fileName}>
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
            <p>API キー確認後にサンプルストレージを読み込み、検索フレーズを入力すると結果が表示されます。</p>
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
            <h2>サンプルを読み込む</h2>
          </div>
          <p className="section-copy">
            必要な場合だけ、既定のサンプル PDF を検索対象に追加します。
          </p>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={handleLoadSampleLibrary}>
              サンプル PDF を読み込む
            </button>
          </div>
          <div className="sample-list">
            {SAMPLE_FILES.map((fileName) => (
              <a className="sample-link" href={getSampleFileHref(fileName)} key={fileName} target="_blank" rel="noreferrer">
                {fileName}
              </a>
            ))}
          </div>
          <p className={`status ${libraryStatus.state}`}>
            {libraryStatus.message || "必要なときだけ読み込んでください。"}
          </p>
      </section>
    </div>
  );
}
