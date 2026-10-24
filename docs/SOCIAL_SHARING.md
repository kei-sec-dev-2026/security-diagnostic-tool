# SNSでのリンク共有

公開URLは `https://security-diagnostic-tool.kei2026.workers.dev/` です。
`index.html` のheadにOpen GraphとX向けのメタ情報を直接記述しています。SNSクローラーがJavaScriptを実行しなくても、画像・タイトル・説明を取得できます。

## 設定内容

- `og:title` / `og:description` / `og:type` / `og:site_name` / `og:locale`
- `og:url` とcanonicalは公開ページの絶対HTTPS URL
- `og:image` / `og:image:secure_url` は `/assets/social-card-v1.png` の絶対HTTPS URL
- PNGは1200×630px、約70KB。幅・高さ・MIME・画像の代替説明も指定
- `twitter:card` は `summary_large_image`。タイトル・説明・画像と代替説明も個別指定
- `robots.txt` はクロールを許可。画像やページに回答・得点・個人情報を付けない

画像はアプリの既存SVGイラストと色を使って作成しています。編集用の原稿は `design/social-card.svg`、配信用は `assets/social-card-v1.png` です。
画像生成サービスや外部の画像URLには依存せず、PNGをリポジトリに含めます。通常のビルド時に画像生成のパッケージは必要ありません。
原稿からPNGを作り直す場合は、日本語フォントを使えるSVG対応の画像ツールで1200×630pxへ書き出します。

## 公開時の確認

1. ソースとPNG・`robots.txt`・`_headers`をGitHubへ反映して再デプロイします。ビルドは `npm run build`、Workersのデプロイは `npx wrangler deploy --config ./wrangler.json --assets ./dist` です。
2. 公開ページのHTMLソースで `og:image` などを確認し、画像の絶対URLを開いてPNGが取得できることを確認します。
3. SNS投稿欄へ公開URLを貼り付けてプレビューを確認します。実際の投稿は不要です。

表示項目や画像の切り抜き方はSNS側の仕様に左右されます。画像だけを強調するサービスでもアプリ名が伝わるよう、画像内にタイトルを入れています。
SNS側が過去の情報をキャッシュしている場合、すぐに更新されないことがあります。画像を差し替えるときは新しいファイル名にし、Open Graph・X両方の画像URLと幅・高さを更新してください。
アプリのURLを変更するときはcanonical・`og:url`・すべての画像URLと、この文書の公開URLを一緒に更新します。

認証必須のCloudflare Accessや、全アクセスへの対話式チャレンジは、公開用のページ・画像をSNSクローラーが取得できなくする場合があります。
User-Agentは偽装できるため、特定のUser-Agentだけを無条件に防御対象から外す方式にはしません。配信側の対策は [SECURITY_DEPLOYMENT.md](SECURITY_DEPLOYMENT.md) を参照してください。

参考：

- [Open Graph protocol](https://ogp.me/) — 必須プロパティと画像の構造化プロパティ
- [Cloudflare Workers Static Assets: Headers](https://developers.cloudflare.com/workers/static-assets/headers/) — 配信時のヘッダー設定

`tests/social.test.cjs` は初期HTMLのメタ情報、画像の実在・PNG寸法、絶対URL、クロール許可を検証します。
