# 公開時のセキュリティ設定

対象URL: https://security-diagnostic-tool.kei2026.workers.dev/  
確認日: 2026-10-24

このアプリは回答処理をブラウザ内で行う静的サイトです。HTMLやCSPは、ブラウザ上での不正な実行や埋め込みを制限します。大量の通信を送るDoS/DDoSは、配信基盤と運用で軽減する必要があります。これらの設定で、攻撃による停止や侵害が起きないと保証するものではありません。

## 実装と本番設定の区別

| 項目 | このリポジトリでの対応 | 本番で必要な確認・操作 |
| --- | --- | --- |
| HTTPセキュリティヘッダー | ルートの`_headers`を`dist/_headers`へ含める構成 | 更新後のビルドをデプロイし、公開応答のヘッダーを確認 |
| ページのCSP補助 | `index.html`のmeta CSP | metaでは`frame-ancestors`を強制できないため、HTTPヘッダーも必要 |
| 公開するファイル | ビルドの固定許可リストと`dist`のみ配信 | `assets.directory`が`./dist`であることを確認 |
| DDoSの基盤対策 | Cloudflareによる自動軽減を利用する構成 | 可用性・異常な通信・公開状態を継続確認 |
| 独自WAF・レート制限 | 管理画面のルールはこの変更では作成していない | 必要なら所有する独自ドメインをCloudflareのゾーンに登録して設定 |
| 管理者アカウント・CI | ソースコードだけでは設定できない | Cloudflare/GitHubのMFA、復旧手段、権限とデプロイトークンを確認 |

ファイルを作成した段階と、Cloudflareにデプロイして有効になった段階は異なります。この文書は、本番へのデプロイや管理画面への設定適用が完了したことを示しません。

## `_headers`の適用範囲

Cloudflare Workers Static Assetsは、静的アセットのディレクトリに置いた`_headers`を解釈します。ビルド後の`dist/_headers`が必要です。`/*`の1ルールで、HTML・JavaScript・CSS・JSON・画像の静的応答へ共通ヘッダーを指定します。`_headers`自体は公開アセットとして配信されません。Workerが生成する応答には、このファイルの指定は適用されません。将来APIやSSR、`run_worker_first`を加える場合は、その応答にも別途ヘッダーが必要です。[Cloudflare: Headers](https://developers.cloudflare.com/workers/static-assets/headers/)

同じパスに重複するCSPルールを追加せず、共通ルールを編集してください。ホスティング先を変更した場合も、その配信サービスのHTTPヘッダー設定へ移す必要があります。

### CSPと現在の画面の互換性

- `default-src 'none'`を基本とし、スクリプト、CSS、画像、フォント、データ取得を同一オリジンに限定します。外部スクリプト、インラインスクリプト、イベント属性、`eval`は許可しません。
- `object-src`、`base-uri`、`frame-ancestors`、`frame-src`、`form-action`を`'none'`にし、プラグイン、基準URLの変更、フレーム埋め込み、フォーム送信を制限します。使っていないWorker・メディア・manifestの読み込みも無効です。
- `style-src-attr 'none'`でHTMLのstyle属性と`setAttribute('style', ...)`、`style.cssText`を制限します。進行バー・結果内訳の`element.style.width = ...`という個別プロパティ代入は許可されるため、`'unsafe-inline'`は不要です。今後スタイルの設定方法を変更するときは再検証してください。[MDN: style-src-attr](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr)
- イラストはページ内のSVG symbol/useと描画属性、SNS画像は同一オリジンのPNGです。外部コードを必要としません。根拠資料へのHTTPSリンクは通常のページ移動であり、`connect-src 'self'`によるfetch制限の対象ではありません。
- コピー用の`clipboard.writeText`は維持します。Permissions Policyでカメラ・マイク・位置情報など未使用の機能を無効にしますが、クリップボード書き込みは無効にしません。テキスト保存用のBlobダウンロードも維持します。

`meta`のCSPは、HTTPヘッダーを付けられない環境で使える補助です。クリックジャッキングを防ぐ`frame-ancestors`はmetaに対応していません。HTTPヘッダーには`X-Frame-Options: DENY`も設定します。[MDN: frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)

### その他のヘッダー

| ヘッダー | 方針 |
| --- | --- |
| `X-Content-Type-Options: nosniff` | 配信されたMIMEタイプを尊重させる。JS/CSSのContent-Typeも正しく配信する |
| `Referrer-Policy: no-referrer` | 外部の根拠資料へ移動するときなどに参照元URLを送らない |
| `Strict-Transport-Security: max-age=31536000` | HTTPS応答を受け取ったブラウザに、当該ホストでのHTTPS利用を1年間指示する |
| `Permissions-Policy` | アプリが使わない端末機能を制限する |

HSTSの`includeSubDomains`と`preload`は設定していません。別のサブドメインを含めたTLSの維持や、preload登録の運用を、この公開サイトだけで約束しないためです。HSTSは初回接続前の防御やDoS対策にはなりません。ローカルのHTTPプレビューでは送信しません。[MDN: Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security)

公開画像をSNSクローラが取得できるよう、認証や全アクセスへのチャレンジは追加しません。User-Agent文字列だけによる許可リストも設けません。User-Agentは本人性の証明にはなりません。不要なクロスオリジン埋め込み制限を画像へ追加することも避けています。

## DoS/DDoSと配信構成

Cloudflareは各サービスでDDoSの自動検知・軽減を提供しています。ただし、基盤が軽減していてもアプリの可用性に影響が残る可能性があります。CSPや`robots.txt`は、送信者に大量アクセスをやめさせる仕組みではありません。[Cloudflare: DDoS protectionについて](https://developers.cloudflare.com/ddos-protection/about/)、[Proactive DDoS defense](https://developers.cloudflare.com/ddos-protection/best-practices/proactive-defense/)

この構成ではユーザー定義のWorkerスクリプトを追加せず、Static Assetsから直接配信します。静的アセットのリクエストは無料・回数無制限とされています。一方、Workerスクリプトの呼び出しにはWorkersの料金・制限が適用され、`run_worker_first`は静的ファイルへのアクセスでもスクリプトを実行します。ヘッダーや独自レート制限のためだけにWorkerを追加せず、配信に必要な処理を小さく保ちます。この説明は将来のAPI、別サービス、アカウントの他の利用料金に対する上限保証ではありません。[Cloudflare: Static Assetsの料金と制限](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)

### `workers.dev`で現在利用できる範囲

現在のURLはCloudflareが提供する`workers.dev`サブドメインです。自分が所有・管理するCloudflareゾーンではないため、所有ゾーン向けのWAFカスタムルールやレート制限ルールを、このホストの管理設定として直接作成する構成にはできません。Cloudflareのレート制限設定はゾーンを選択して作成する方式です。この違いを、Cloudflare基盤のDDoS軽減が存在しないという意味で説明しないでください。[Cloudflare: workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)、[Rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)

独自のWAF・レート制限が必要になった場合は、所有するドメインをCloudflareの有効なゾーンとして登録し、WorkerへCustom Domainを追加するのが次の段階です。利用可能なルール数・条件・アクションは契約プランで異なります。Cloudflare自身も本番用途にルートまたは独自ドメインを推奨しています。[Cloudflare: Custom Domainsの前提条件](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

Cloudflare Accessによる`workers.dev`へのログイン要求も可能ですが、登録不要で公開する本サイトやSNSクローラには適さないため有効化していません。非公開プレビューを保護する場合は、公開本番と対象を区別してください。[Cloudflare: workers.devのアクセス管理](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/#manage-access-to-workersdev)

### 独自ドメインを追加したときの運用

1. 新しいHTTPSホストでページ・SNS画像・データを取得できることを確認し、canonicalとOG/Twitter URLを更新する。
2. ゾーンのWAF・DDoS設定、利用可能なレート制限を確認する。通常の利用とSNSクローラを観察してから、対象パスと条件を絞って適用する。すべての閲覧にチャレンジを出す運用は避ける。
3. レート制限は厳密な世界共通の回数上限や請求上限として扱わない。制限の反映には遅延があり、集計特性も設定によって異なる。[Cloudflare: レート制限の重要事項](https://developers.cloudflare.com/waf/rate-limiting-rules/)、[Request rate](https://developers.cloudflare.com/waf/rate-limiting-rules/request-rate/)
4. 独自ドメインのルールが旧`workers.dev`やプレビューURLへも適用されると思い込まない。公開URLを一本化する場合は、移行確認後に`workers_dev: false`を設定し、プレビュー・バージョンURLの公開状態も別に確認する。[Cloudflare: workers.devの無効化](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/#disabling-workersdev)
5. 異常時はCloudflare側の状態と応答を確認し、必要な範囲でルールを調整する。既知の正常デプロイへ戻せるようGit履歴・復旧手順と管理者の復旧手段を保持する。

## デプロイ後の確認

1. `npm test`と`npm run build`を実行し、`dist/_headers`とSNS画像が含まれることを確認する。`node_modules`、`.git`、秘密情報、開発用ファイルを公開しない。
2. デプロイ後に、次のような少数の通常リクエストでHTML・JS・JSON・SNS画像の応答を確認する。負荷試験はこの確認に含めない。

   ```powershell
   curl.exe -I https://security-diagnostic-tool.kei2026.workers.dev/
   curl.exe -I https://security-diagnostic-tool.kei2026.workers.dev/js/app.js
   curl.exe -I https://security-diagnostic-tool.kei2026.workers.dev/data/questions.json
   curl.exe -I https://security-diagnostic-tool.kei2026.workers.dev/assets/social-card-v1.png
   ```

3. CSP、X-Frame-Options、nosniff、Referrer-Policy、Permissions-Policy、HSTSと正しいContent-Typeを確認する。`/_headers`の内容が公開されていないことも確認する。
4. ブラウザのコンソールでCSP違反がないこと、自己チェックの自動遷移・進行バー・内訳棒・SVG、コピーとテキスト保存、知識テストの採点と再挑戦、外部根拠リンクが動くことを確認する。
5. SNSプレビューでタイトル・説明・画像を確認する。SNS側のキャッシュで古いカードが表示される場合がある。プレビュー失敗時は画像応答、URL、クロール制限を確認する。

自動テストは設定の退行を防ぐためのものです。Cloudflare管理画面の設定、本番への反映、全ブラウザの互換性や攻撃耐性まで証明するものではありません。
