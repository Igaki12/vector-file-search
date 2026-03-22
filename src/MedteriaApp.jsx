import React, { useEffect, useMemo, useState } from "react";

const DRIVE_ITEMS = [
  {
    fileName: "2021年度 形成外科.pdf",
    sizeBytes: 459573,
    updatedAt: "2026/03/18 13:10",
    description: "PDF / 過去問",
    tag: "形成外科"
  },
  {
    fileName: "2022年度 形成外科.pdf",
    sizeBytes: 627210,
    updatedAt: "2026/03/18 13:16",
    description: "PDF / 過去問",
    tag: "形成外科"
  },
  {
    fileName: "2023年度 形成外科.pdf",
    sizeBytes: 557052,
    updatedAt: "2026/03/18 13:24",
    description: "PDF / 過去問",
    tag: "形成外科"
  },
  {
    fileName: "2024免疫学中間試験問題_奈良医大.pdf",
    sizeBytes: 404932,
    updatedAt: "2026/03/18 13:31",
    description: "PDF / 試験問題",
    tag: "免疫学"
  },
  {
    fileName: "2024年度 形成外科.pdf",
    sizeBytes: 103581,
    updatedAt: "2026/03/18 13:36",
    description: "PDF / 過去問",
    tag: "形成外科"
  },
  {
    fileName: "2024年度 形成外科_小テスト.pdf",
    sizeBytes: 55692,
    updatedAt: "2026/03/18 13:40",
    description: "PDF / 小テスト",
    tag: "形成外科"
  },
  {
    fileName: "2025_力学基礎1.pdf",
    sizeBytes: 3229898,
    updatedAt: "2026/03/18 13:51",
    description: "PDF / 講義資料",
    tag: "力学基礎"
  },
  {
    fileName: "2025_細胞生物学.pdf",
    sizeBytes: 9430096,
    updatedAt: "2026/03/18 14:02",
    description: "PDF / 講義資料",
    tag: "細胞生物学"
  },
  {
    fileName: "2025年度形成外科.pdf",
    sizeBytes: 531715,
    updatedAt: "2026/03/18 14:09",
    description: "PDF / 過去問",
    tag: "形成外科"
  }
];

function formatSize(sizeBytes) {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.round(sizeBytes / 1024)} KB`;
}

function getFileHref(fileName) {
  return `${import.meta.env.BASE_URL}sample-files/${encodeURIComponent(fileName)}`;
}

function Icon({ className = "", viewBox = "0 0 24 24", children }) {
  return (
    <svg className={className} viewBox={viewBox} aria-hidden="true">
      {children}
    </svg>
  );
}

function HeaderLink({ children, href = "#" }) {
  return (
    <a className="med-header-link" href={href}>
      {children}
    </a>
  );
}

export default function MedteriaApp() {
  const [previewState, setPreviewState] = useState({
    isOpen: false,
    fileName: "",
    url: ""
  });
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!previewState.isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsClosing((closing) => {
          if (closing) return true;
          setTimeout(() => {
            setPreviewState({ isOpen: false, fileName: "", url: "" });
            setIsClosing(false);
          }, 360);
          return true;
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewState.isOpen]);

  const previewSrc = previewState.url ? `${previewState.url}#page=1&view=FitH` : "";

  const visibleItems = useMemo(
    () =>
      DRIVE_ITEMS.map((item, index) => ({
        ...item,
        sizeLabel: formatSize(item.sizeBytes),
        href: getFileHref(item.fileName),
        accent: index % 3
      })),
    []
  );

  function openPreview(item) {
    setPreviewState({
      isOpen: true,
      fileName: item.fileName,
      url: item.href
    });
  }

  function closePreview() {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setPreviewState({ isOpen: false, fileName: "", url: "" });
      setIsClosing(false);
    }, 360);
  }

  return (
    <div className={`med-layout ${(previewState.isOpen && !isClosing) ? "preview-open" : ""}`}>
      <header className="med-global-header">
        <div className="med-global-left">
          <div className="med-logo" aria-label="Medteria">
            <span className="med-logo-mark" style={{ display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 'bold' }}>M</span>
            <span className="med-logo-text">Medteria</span>
          </div>
          <div className="med-header-links">
            <HeaderLink>初期研修病院情報</HeaderLink>
            <HeaderLink>病院求人管理画面</HeaderLink>
            <HeaderLink>倍率ナビ</HeaderLink>
          </div>
        </div>
        <div className="med-global-right">
          <button className="med-outlined-button" type="button">
            MedteriaSNSへ切替
          </button>
          <button className="med-icon-button" type="button" aria-label="メッセージ">
            <Icon viewBox="0 0 20 16">
              <path d="M2 2h16v12H2z" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="m3 3 7 5 7-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </Icon>
          </button>
          <button className="med-icon-button has-badge" type="button" aria-label="通知">
            <Icon viewBox="0 0 16 20">
              <path d="M8 1.5a3 3 0 0 0-3 3v1C5 8 4 9.5 3 10.5V12h10v-1.5C12 9.5 11 8 11 5.5v-1a3 3 0 0 0-3-3Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M6 14a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </Icon>
            <span className="med-badge">14</span>
          </button>
          <button className="med-account-button" type="button" aria-label="アカウント">
            <span>M</span>
          </button>
        </div>
      </header>

      <div className="med-body">
        <aside className="med-sidebar">
          <div className="med-sidebar-inner">
            <button className="med-community-card" type="button">
              <div className="med-community-icon">奈</div>
              <div className="med-community-copy">
                <strong>奈良県立医科大学 医学部 医学科</strong>
                <small>コミュニティを選択</small>
              </div>
              <Icon className="med-chevron">
                <path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </Icon>
            </button>

            <div className="med-side-banner">
              <p>過去問演習で生じた疑問はこちらへ</p>
            </div>

            <section className="med-side-section">
              <div className="med-side-section-head">
                <p>スペース</p>
                <div className="med-side-tools">
                  <button className="med-tiny-icon" type="button" aria-label="追加">
                    <Icon>
                      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </Icon>
                  </button>
                  <button className="med-tiny-icon" type="button" aria-label="フィルタ">
                    <Icon>
                      <path d="M5 7h14M8 12h8M10 17h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </Icon>
                  </button>
                </div>
              </div>
              <div className="med-space-list">
                <button className="med-space-item" type="button">フリースペース</button>
                <button className="med-space-item is-active" type="button">4年 ドライブ</button>
                <button className="med-space-item" type="button">試験情報など</button>
              </div>
            </section>
          </div>
        </aside>

        <main className="med-main">
          <section className="med-main-panel">
            <div className="med-main-header">
              <div>
                <p className="med-breadcrumb">コミュニティ / 4年 / ドライブ</p>
                <h1>4年 ドライブ</h1>
              </div>
              <div className="med-main-actions">
                <a className="med-ghost-link" href={`${import.meta.env.BASE_URL}index.html`}>
                  既存検索アプリへ
                </a>
                <button className="med-primary-button" type="button">
                  新規作成
                </button>
              </div>
            </div>

            <div className="med-list-toolbar">
              <div className="med-toolbar-chip">資料一覧</div>
              <div className="med-toolbar-copy">
                既存 Medteria のドライブ一覧風レイアウトに、PDF プレビュー拡張パネルだけを先行統合したモックです。
              </div>
            </div>

            <div className="med-file-list">
              <div className="med-file-list-head">
                <span>名前</span>
                <span>分類</span>
                <span>更新日時</span>
                <span>サイズ</span>
              </div>

              {visibleItems.map((item) => (
                <article
                  className={`med-file-row accent-${item.accent}`}
                  key={item.fileName}
                  onClick={() => openPreview(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPreview(item);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${item.fileName} をプレビュー`}
                >
                  <div className="med-file-name-cell">
                    <div className="med-file-icon">
                      <Icon>
                        <path d="M7 3h7l5 5v13H7z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M14 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </Icon>
                    </div>
                    <div className="med-file-copy">
                      <strong>{item.fileName}</strong>
                      <p>{item.description}</p>
                    </div>
                  </div>
                  <div className="med-file-tag-cell">
                    <span className="med-tag">{item.tag}</span>
                  </div>
                  <div className="med-file-meta-cell">{item.updatedAt}</div>
                  <div className="med-file-meta-cell">{item.sizeLabel}</div>
                </article>
              ))}
            </div>
          </section>

          <footer className="med-footer">
            <a href="https://support.medteria.io/" target="_blank" rel="noreferrer">
              FAQ
            </a>
            <span>Medteria は提案用の見た目再現モックとして表示しています。</span>
          </footer>
        </main>
      </div>

      {(previewState.isOpen || isClosing) ? (
        <div className={`med-preview-dock ${isClosing ? "is-closing" : "is-open"}`} role="presentation">
          <section className="med-preview-panel" aria-label="PDF プレビュー">
            <div className="med-preview-header">
              <div>
                <p className="med-preview-kicker">PDF Preview</p>
                <h2>{previewState.fileName}</h2>
                <p className="med-preview-note">1 ページ目から表示中</p>
              </div>
              <button className="med-icon-button" type="button" onClick={closePreview} aria-label="PDF プレビューを閉じる">
                <Icon>
                  <path d="M6 6 18 18M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </Icon>
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
