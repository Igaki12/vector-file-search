# vector-file-search

React と Vite で作る、テキストファイルと PDF 向けのベクトル検索デモです。`gemini-embedding-2-preview` を前提に、API キー入力、ファイルごとのベクトル化、検索フレーズとの関連度ランキング、PDF の最関連ページ表示を行います。

## 開発

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
```

ビルド成果物は [`docs/`](/Users/igaki/Documents/GitHub/vector-file-search/docs) に出力され、GitHub Pages でそのまま配信できる構成です。`sample-files/` の PDF も `docs/sample-files/` にコピーされます。

## 仕様メモ

- 対応形式: `.txt`, `.pdf`
- PDF はページ単位で処理
- 関連度は semantic score と lexical score のハイブリッド
- API キーはブラウザの `localStorage` に保持
