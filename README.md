# EF SET 30日英語教材

EF SETのスコア向上を目標に、毎日Listening 5分とReading 5分に取り組むための個人学習教材です。

## 使い方

`EF_SET_30日教材.html` をSafariまたはChromeで開いてください。インストールやサーバー接続は不要です。音声もHTML内に埋め込まれているため、オフラインで学習できます。

- Listening：短い音声と内容理解2問
- Reading：2段落の長文と内容理解4問
- 全30日、合計180問
- 日本語の解説、5分タイマー、学習メモ、初回点の記録

メモと採点記録はブラウザのLocalStorageに保存されます。サーバーを起動している場合は、ブラウザごとに発行した匿名IDを使ってサーバーにも同期保存します。「学習記録を保存」ボタンからJSON形式でも書き出せます。

## サーバー保存（ローカル開発）

TypeScriptのローカルサーバーを使うと、回答・メモを `.local-data/records.json` に保存できます。

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:8000` を開いてください。LocalStorageはブラウザ側のバックアップとして残ります。開発版は認証なしの匿名ID方式なので、公開運用ではCognitoなどの認証を追加してください。

## Gemini AI解説

採点後の各選択肢にある「AIで詳しく解説」ボタンと、今日の問題について質問できるチャットは、Google Gemini APIの `models/gemini-3.6-flash` を使います。APIキーはHTMLやブラウザには埋め込まず、ローカルサーバー／AWS Lambdaから中継します。

ローカルでAI機能を使う場合は、Gemini APIキーを環境変数に設定してから起動してください。

```bash
GEMINI_API_KEY=your-api-key npm run dev
```

モデルを変更する場合は `GEMINI_MODEL` で指定できます（既定値は `models/gemini-3.6-flash`）。キー未設定でも教材本体は利用できますが、AIボタンはエラー表示になります。Google AI Studioで発行したキーの利用量・課金設定を確認してから設定してください。

## AWSへのデプロイ（CDK）

`infra/` のAWS CDK（TypeScript）が、S3、CloudFront、API Gateway、Lambda、DynamoDBを定義します。AI用LambdaにはCloudFormationのNoEchoパラメータ `GeminiApiKey` と `GEMINI_MODEL` が渡されます。AWS CLIの認証情報を設定した後、次のコマンドでCloudFormationテンプレートを確認・デプロイできます。

```bash
npm run synth
npx cdk deploy --parameters EfsetStack:GeminiApiKey=your-api-key
```

本番運用では、キーのローテーションが必要になった時に備えてSecrets Manager等で管理する構成も検討してください。`GeminiApiKey` を空欄にするとAI機能は無効になります。

初回のAWSアカウント・リージョンでは、先に `npx cdk bootstrap` が必要です。デプロイ前にAWS Budgetsを設定し、課金上限を確認してください。

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
