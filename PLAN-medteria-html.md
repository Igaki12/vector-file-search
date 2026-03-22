# Medteria外観版の再設計計画

## Summary
`medteria.html` を、既存の検索アプリとは独立した「Medteria ドライブ一覧風の見た目再現ページ」として作り直す。今回の対象は PDF プレビューの拡張パネル表現だけに絞り、ベクトル検索、API キー入力、関連度計算、検索結果UIは `medteria.html` には持ち込まない。中央のドライブ一覧で PDF 行を押すと、Medteria 画面の右側拡張パネルまたは下部シートで PDF を開く体験を実装する。

## Key Changes
- `medteria.html` を別エントリとして復活させる。
  - 既存トップ `index.html` は維持。
  - Vite を multi-page build に戻し、`docs/index.html` と `docs/medteria.html` を同時出力する。
- Medteria 風 UI は専用の React エントリと専用 CSS で実装する。
  - 既存 `src/App.jsx` の検索UIは流用しない。
  - Roboto 系、MUI 風の余白、薄いグレー境界、白ベース、細い影、控えめな青アクセントに寄せる。
  - 上部バー、左サイドバー、中央のドライブ一覧、下部フッター相当を持つ画面骨格にする。
- 中央のドライブ一覧は「静的な Medteria 風ファイル画面」として作る。
  - 表示対象は `sample-files/` の PDF 一覧をベースにした行データにする。
  - 行にはファイル名、更新っぽい補助情報、PDF アイコン/種別、サイズやメモのような補助列を出す。
  - クリック可能なのは PDF 行のみとし、フォルダ検索やスコア表示は出さない。
- PDF プレビューは既存アプリの `iframe + #page` の仕組みを縮小転用する。
  - クリックした PDF を右側固定パネルで開く。
  - モバイル幅では下側シートに切り替える。
  - 背景全体を覆う暗いオーバーレイは使わず、中央リスト側を少し圧縮して擬似スプリットビューにする。
  - 初期表示ページは常に 1 ページ目にする。検索連動はまだ入れない。
- 既存 Medteria により似せるため、見た目の再現ポイントを固定する。
  - ヘッダーの文字サイズ、アウトラインボタン、通知/アカウントの丸ボタン、サイドバーの ListItem 風行、中央一覧の行高と区切り線を近づける。
  - `screenshot-medteria.html` の DOM 配置を模倣し、`_app-473b12f3f682a78f.js` と埋め込み CSS から確認できる色・余白・フォントトーンを優先して反映する。
  - 以前の濃色 `RESULTS` ブロックや検索デモ用演出は `medteria.html` では削除する。

## Interfaces / Behavior
- `medteria.html` 側の新規実装対象
  - ルート HTML エントリ
  - 専用 React エントリ
  - Medteria 外観専用コンポーネント
  - Medteria 外観専用 CSS
- 既存ロジックの扱い
  - `src/lib/googleEmbeddings.js` と `src/lib/search.js` は `medteria.html` からは使わない。
  - PDF 表示の URL 解決とプレビュー開閉の考え方のみ、既存の PDF プレビュー実装を参考にする。
- ドライブ一覧データ
  - `sample-files/` の PDF 名を元に静的に構成する。
  - 追加アップロード、API キー、検索入力、スコア表示は `medteria.html` から除外する。

## Test Plan
- ビルド後に `docs/index.html` と `docs/medteria.html` が両方出力される。
- `medteria.html` を開くと、左サイドバー・上部バー・中央一覧・フッターを持つ Medteria 風レイアウトになる。
- PDF 行クリックで、デスクトップでは右拡張パネル、モバイルでは下部シートが開く。
- 開いたプレビューは対象 PDF の 1 ページ目を表示し、閉じる操作と `Esc` で閉じられる。
- `index.html` 側の既存検索アプリは挙動を変えない。
- `medteria.html` には API キー入力、検索実行、結果ランキング、ベクトル化処理が存在しない。

## Assumptions
- `medteria.html` は提案用モック兼プロトタイプであり、現時点では「見た目再現 + PDF プレビュー」までを完成条件とする。
- 一覧データは動的取得ではなく `sample-files/` ベースの静的表示でよい。
- MUI は新規導入せず、React + CSS で MUI/Medteria 風の見た目を再現する。
- 既存トップから `medteria.html` へ移動する導線は維持する前提で実装計画を立てる。
