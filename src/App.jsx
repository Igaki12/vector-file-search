import { useEffect, useMemo, useState } from "react";
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
  const [files, setFiles] = useState([]);
  const [indexStatus, setIndexStatus] = useState({ state: "idle", message: "" });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState({ state: "idle", message: "" });

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

    return { pdfPages, textSegments };
  }, [records]);

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

  function handleFileChange(event) {
    const selected = Array.from(event.target.files ?? []);
    setFiles(selected);
    setResults([]);
    setRecords([]);
    setIndexStatus({
      state: "idle",
      message: selected.length ? `${selected.length}件のファイルを読み込み待ちです。` : ""
    });
  }

  async function handleIndexFiles() {
    if (!apiKey.trim()) {
      setIndexStatus({ state: "error", message: "先に API キーを設定してください。" });
      return;
    }

    if (!files.length) {
      setIndexStatus({ state: "error", message: "テキストまたは PDF ファイルを追加してください。" });
      return;
    }

    setIndexStatus({ state: "loading", message: "ファイルを解析しています..." });

    try {
      const extractedRecords = [];

      for (const file of files) {
        const units = await buildRecords(file);

        if (!units.length) {
          continue;
        }

        for (const unit of units) {
          setIndexStatus({
            state: "loading",
            message: `${unit.label} のベクトルを生成しています...`
          });

          const embedding = await embedText({
            apiKey: apiKey.trim(),
            text: unit.text || `${unit.fileName} ${unit.pageNumber ?? ""}`.trim(),
            outputDimensionality: OUTPUT_DIMENSIONALITY,
            taskType: "RETRIEVAL_DOCUMENT"
          });

          extractedRecords.push({
            ...unit,
            embedding
          });
        }
      }

      setRecords(extractedRecords);
      setResults([]);
      setIndexStatus({
        state: "success",
        message: `${extractedRecords.length}件の検索単位をベクトル化しました。`
      });
    } catch (error) {
      setIndexStatus({ state: "error", message: error.message });
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
        <div>
          <p className="eyebrow">Vector File Search Demo</p>
          <h1>検索フレーズに最も近い PDF ページを、直感的に見つける。</h1>
          <p className="hero-copy">
            テキストと PDF を対象に、`gemini-embedding-2-preview` と一般的な RAG 方式に近い
            ハイブリッド検索で関連度を数値化します。
          </p>
        </div>
        <div className="hero-panel">
          <p>初期版の前提</p>
          <ul>
            <li>API キーのみで開始</li>
            <li>テキストと PDF のみ</li>
            <li>PDF はページ単位でスコア化</li>
            <li>API キーは localStorage にのみ保持</li>
          </ul>
        </div>
      </header>

      <main className="layout">
        <section className="card section-card">
          <div className="section-head">
            <span className="step">STEP 1</span>
            <h2>API キー</h2>
          </div>
          <p className="section-copy">Google の API キーを入力し、接続確認を行ってからベクトル化を開始します。</p>
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

        <section className="card section-card">
          <div className="section-head">
            <span className="step">STEP 2</span>
            <h2>ファイル投入</h2>
          </div>
          <p className="section-copy">
            `.txt` と `.pdf` を受け付けます。PDF はページ単位、テキストはセグメント単位で検索対象を作ります。
          </p>
          <label className="upload-box">
            <input type="file" accept=".txt,.pdf" multiple onChange={handleFileChange} />
            <span>クリックしてファイルを選択</span>
            <small>または sample-files の PDF を手元で選んでください</small>
          </label>
          <div className="file-list">
            {files.length ? (
              files.map((file) => (
                <div className="file-chip" key={file.name}>
                  <strong>{file.name}</strong>
                  <span>{file.type || "text/plain"}</span>
                </div>
              ))
            ) : (
              <p className="muted">まだファイルは追加されていません。</p>
            )}
          </div>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={handleIndexFiles}>
              ベクトル化を開始
            </button>
          </div>
          <p className={`status ${indexStatus.state}`}>{indexStatus.message || "ファイル追加後にベクトル化を実行します。"}</p>
          <div className="meta-grid">
            <div className="metric">
              <span>PDF pages</span>
              <strong>{indexedSummary.pdfPages}</strong>
            </div>
            <div className="metric">
              <span>Text segments</span>
              <strong>{indexedSummary.textSegments}</strong>
            </div>
          </div>
        </section>

        <section className="card section-card">
          <div className="section-head">
            <span className="step">STEP 3</span>
            <h2>検索</h2>
          </div>
          <p className="section-copy">完全一致の語句一致とベクトル類似度を組み合わせて関連度を計算します。</p>
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

        <aside className="card side-card">
          <div className="section-head">
            <span className="step">DEMO</span>
            <h2>同梱サンプル</h2>
          </div>
          <p className="section-copy">
            GitHub Pages で公開したあとも `sample-files` をそのまま配信します。打ち合わせ用のサンプル PDF として利用できます。
          </p>
          <div className="sample-list">
            {SAMPLE_FILES.map((fileName) => (
              <a className="sample-link" href={getSampleFileHref(fileName)} key={fileName} target="_blank" rel="noreferrer">
                {fileName}
              </a>
            ))}
          </div>
        </aside>
      </main>

      <section className="results card">
        <div className="section-head">
          <span className="step">RESULTS</span>
          <h2>関連度ランキング</h2>
        </div>
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
            <p>API キー設定、ファイルのベクトル化、検索フレーズ入力の順に進めると結果が表示されます。</p>
          </div>
        )}
      </section>
    </div>
  );
}
