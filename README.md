# EF SET 30日英語教材

EF SETのスコア向上を目標に、毎日Listening 5分とReading 5分に取り組むための個人学習教材です。

## 使い方

`EF_SET_30日教材.html` をSafariまたはChromeで開いてください。インストールやサーバー接続は不要です。音声もHTML内に埋め込まれているため、オフラインで学習できます。

- Listening：短い音声と内容理解2問
- Reading：2段落の長文と内容理解4問
- 全30日、合計180問
- 日本語の解説、5分タイマー、学習メモ、初回点の記録

メモと採点記録はブラウザのLocalStorageに保存され、外部サーバーへ送信されません。「学習記録を保存」ボタンからJSON形式でも書き出せます。

## ファイル

- `EF_SET_30日教材.html`：音声を内包した完成版教材
- `EF_SET_30日教材_本文と解説.md`：印刷・検索用の本文、問題、解説
- `materials/content.json`：全30日分の教材データ
- `materials/player-template.html`：完成版HTMLのテンプレート
- `materials/audio/`：日別のMP3音声
- `materials/package_materials.py`：完成版HTMLと配布ファイルの生成

Day 1のListeningにはGemini 3.1 Flash TTS（Kore）を使用しています。Day 2以降はmacOS標準の英語合成音声です。APIキーはリポジトリに含まれません。

## 再生成

Python 3とFFmpegが必要です。

```bash
python3 materials/package_materials.py
```

本教材はEFの公式教材・模擬試験ではありません。英文、設問、日本語解説は学習用に作成したオリジナルコンテンツです。出題形式の参考：[EF SET リーディング](https://www.efjapan.co.jp/english-tests/efset/reading/)
