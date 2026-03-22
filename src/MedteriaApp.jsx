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
        </div>
        <div className="med-global-right">
          <div className="med-header-links">
            <HeaderLink>初期研修病院情報</HeaderLink>
            <HeaderLink>病院求人管理画面</HeaderLink>
            <HeaderLink>倍率ナビ</HeaderLink>
          </div>
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
              </div>
            </div>

            <div className="med-tabs-row">
              <div className="med-tabs">
                <button className="med-tab" type="button">
                  <Icon viewBox="0 0 24 24"><path d="M21 10.12h-6.78l2.74-2.82c-2.73-2.7-7.15-2.8-9.88-.1-2.73 2.71-2.73 7.08 0 9.79s7.15 2.71 9.88 0C18.32 15.65 19 14.08 19 12.1h2c0 1.98-.88 4.55-2.64 6.29-3.51 3.48-9.21 3.48-12.72 0-3.5-3.47-3.53-9.11-.02-12.58s9.14-3.47 12.65 0L21 3zM12.5 8v4.25l3.5 2.08-.72 1.21L11 13V8z" fill="currentColor"/></Icon>
                  タイムライン
                </button>
                <button className="med-tab is-active" type="button">
                  <Icon viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" fill="currentColor"/></Icon>
                  ドライブ
                </button>
                <button className="med-tab" type="button">更新履歴</button>
              </div>

              <div className="med-toolbar-actions">
                <div className="med-search-bar">
                  <Icon viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="currentColor"/></Icon>
                  <input type="text" placeholder="コミュニティ内を検索" className="med-search-input" />
                </div>
                <button className="med-primary-button" type="button">
                  <Icon viewBox="0 0 22 22">
                    <path d="M15.958,3.778H8.487l-.25-.792A2.375,2.375,0,0,0,6,1.4H2.375A2.376,2.376,0,0,0,0,3.778V14.07a2.375,2.375,0,0,0,2.375,2.375H10V14.778H2.375a.709.709,0,0,1-.708-.708V3.779a.71.71,0,0,1,.708-.709H6a.71.71,0,0,1,.661.453l.239.757.368,1.164h8.692a.71.71,0,0,1,.709.708V9.758h1.667V6.153a2.376,2.376,0,0,0-2.375-2.375M9.1,2.945h2.348L14.313,1.9l.38,1.043h1.265A3.253,3.253,0,0,1,16.487,3L15.6.548a.834.834,0,0,0-1.068-.5L9.387,1.921A.818.818,0,0,0,8.9,2.43c.042.092.089.183.123.279Zm6.737,9.313H14.167v1.667H12.5v1.667h1.667v1.667h1.667V15.592H17.5V13.925H15.833Z" transform="translate(0.833 1.667)" fill="currentColor"/>
                  </Icon>
                  作成・アップロード
                  <Icon viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z" fill="currentColor"/></Icon>
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
