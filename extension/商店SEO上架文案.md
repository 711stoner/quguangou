# 取关狗｜全语言商店 SEO 上架文案（当前唯一版本）

> 当前源码版本：v0.2.75。11 份项目地区配置（Chrome 官方实际支持的 locale 为其中 10 种，另有一份 zh_HK 兼容资源），10 种可选界面语言。zh_TW / zh_HK 使用同一套繁体内容。
> **只使用本文件上架，不要复制历史 v0.2.25、v0.2.63、v0.2.67 等旧文案。**

## 发布与 SEO 规则

- 一个插件 ID，每个浏览器按官方支持的语言完善同一个 listing，不创建独立语言商品。
- **Chrome 上架顺序（请勿误操作）：** 只向既有商品 `ahpjikfghfgekmjcomhcmknlkicloblf` 上传 **一次** `quguangou-chrome.zip`（v0.2.75，包含 10 个有效 Chrome locale）。不要为十种语言上传十次不同 ZIP；同一商品后续上传包会替换之前的待发布代码，也不要创建十个新商品 ID。
- **十种语言逐项上传的是 Store listing 资料，不是十份安装包：** 后台选 `zh_CN`、`zh_TW`、`en`、`ja`、`ko`、`fr`、`es`、`ms`、`vi`、`id`，分别填对应的完整介绍与当地语言截图；商品标题、短摘要来自 ZIP 里的 `_locales/*/messages.json`。`zh_HK` 仅本地兼容，不是 Chrome 独立语言。
- **容易遗漏的全球图片回退：** Chrome 官方显示顺序是本地化视频／本地化截图，然后是全球视频／全球截图；如“Global screenshots”残留中文截图，其他语言用户仍可能在后面看到中文图片。检查并清理非中立的全球图片；不可通过上传每种语言截图自动移除旧全局图片。Small/Marquee 宣传图不能按语言本地化，应使用无中文文字的中立素材。
- **本轮全球宣传图已改成无文字：** 由于 Chrome 的 440×280 和 1400×560 宣传图不能按语言分别配置，已将七种外语原素材、简体及繁体原素材中的对应图片统一替换为同一份无文字、无语言的插件图形设计；后台仍须检查是否有之前已上传的中文／英文 Global screenshots。
- **本轮已重制七种外语商店截图：** 日语、韩语、法语、西班牙语、马来语、越南语、印尼语各 5 张图片，均已用 v0.2.75 的真实插件界面重拍并覆盖原 Chrome／Edge／Firefox 素材（共 105 份截图文件）。旧图片中的英文品牌和“英文网站”提示不再沿用；文件夹虽然保留 v0.2.68／v0.2.70 的历史目录名，里面的五张截图是新内容。经尺寸、逐语一致性及部分视觉抽样核验；简体／繁体／英文旧图尚未在本轮整体重制。
- **安装后的语言例外：** 插件初次运行按浏览器 UI 语言选择界面；如果用户曾手动选语言并保存，`quguangouUILanguageV1` 优先于浏览器语言。Chrome 商店并不知道搜索框所用语言，插件也无法在安装时读取用户的商店搜索关键词，因此不能保证“在英文商店输入中文关键词后，插件自动成为中文”。
- **线上发布差异（2026-11-04 核查）**：当前 Chrome 商店插件 `ahpjikfghfgekmjcomhcmknlkicloblf` 仍为 **v0.2.63**，而本地当前唯一安装包是 **v0.2.75**。修改本地 ZIP 或 GitHub 不会直接更新线上商店；必须在已有商品中提交新版本，审核发布后重新做线上逐语言验证，不能提前声称线上修复。
- **香港繁体兼容说明：** Chrome 官方扩展 locale 列表有 `zh_CN`、`zh_TW`，没有独立的 `zh_HK`。当前项目仍保留 `zh_HK` 地区文案与资源供兼容及核对，但香港用户的界面使用 `zh-TW` 繁体；Chrome 商店上传请使用 `zh_TW` 的繁体 Listing，不要将 `zh_HK` 作为第 11 个可独立选择的 Chrome 商店语言。Edge 和 Firefox 以各自开发者后台实际可选语言为准。
- **Chrome 商店搜索词不决定展示语言。** 2026-11-04 线上实测：使用 `?hl=zh-CN` 打开同一商店页时显示简体中文，`?hl=en` 则显示英文；已发布 v0.2.63 的繁体中文、日语等其他语言均回退到简体中文。输入「取关狗」搜索不能强制将英文版搜索结果切为中文。要给不同语言用户提供可靠入口，使用下方各语言官方商店链接的 `?hl=` 参数，并在平台商店后台完成各自语言的 Listing（非浏览器设置）。
- **商店标题不是界面语言开关：** 浏览器中切换插件界面不会自动更新扩展管理页或商店的 Listing 标题。中文／英文地区的商店标题、摘要、完整介绍和图片必须在浏览器商店后台分别核对；仅打包 ZIP 或切换界面并不能保证搜索结果同步更新。
- **重新上传版本号：** 三个浏览器的发布 ZIP 始终只保留固定文件名，但代码／manifest 更新后，若商店已发布版本号 ≥ 当前包的 `manifest.version`，下次上架必须先提高包内版本号，再覆盖这三个固定文件并提交审核；否则 Chrome 商店会拒绝上传。不要为了修复文案创建新的商店商品或新的 ZIP 名称。
- 本文件的标题和简短介绍已写入 `_locales/<locale>/messages.json`，构建 ZIP 时包含；详细介绍和 Edge 搜索词仍需到开发者后台逐语言填写，**不会因为上传 ZIP 自动填好**。
- SEO 重点是「X / Twitter + 谁没有回关 / follow back / non-followers + 真实功能」。自然表述而非重复关键词；不要宣称可查谁刚刚取关、过去退关历史、100% 成功或 X 官方授权。
- **标题长度（官方 2026-11-04 复核）：** Chrome Web Store ≤75 字符；Microsoft Edge Add-ons、Firefox AMO ≤45 字符。同一份本地化标题在三端通用，因此取更严格的 ≤45，不能把 Chrome 的 75 当成三端通用限制。
- **短摘要：** Chrome manifest description ≤132 字符；Firefox AMO 上架页面的独立 Summary ≤250 字符。这里实际共用一份 ≤132 的摘要，所以两者都满足。
- **详细介绍：** Edge 每个上架语言的完整版介绍必须是 **250–10,000 字符**；Chrome 要求自然准确、不可关键词堆砌；Firefox AMO 完整描述没有同样的 10,000 字符上限。三端完整介绍必须在商店后台填写，ZIP 不自动提交。
- **Edge 搜索词：** 每个语言最多 7 条，每条不超过 30 字符，合计不超过 21 个词；以下均经过校验。这是 Edge 的独立 SEO 字段，不能复制到 Chrome 作为关键词堆砌。
- **截图与素材：** Chrome 每个上架语言建议 1–5 张截图，1280×800 或 640×400；Edge 每种语言需上传扩展 Logo，详细介绍必填，截图可选（最多 6 张，1280×800 或 640×480），440×280 小型宣传图片与 1400×560 大型宣传图可选。Firefox AMO 页面只允许一组共用截图，可分别本地化截图描述，不会切换独立语言截图集。历史图片不是新版本画面验收。
- **关键词与功能真实性：** 按用户真实搜索意图自然写入“谁没有回关／非互相关注／X 账号关系”。不能宣称能查到谁刚刚取关，不能把社区名单的拉黑能力说成可直接批量取关；不可把浏览器语言切换与商店 Listing 语言选择混同。
- Firefox AMO 可本地化名称、摘要和介绍；摘要建议尽量精炼，最多 250 字符；**Firefox 页面只有一组共用截图**，不应声称会按语言自动切换截图。
- Chrome Web Store 禁止关键词堆砌。已有图片若不是当前界面，必须在上传前核对截图与实际功能是否一致。

参考：
- Chrome 官方扩展 locale：https://developer.chrome.com/docs/extensions/reference/api/i18n
- Chrome 版本更新：https://developer.chrome.com/docs/webstore/update
- Chrome：https://developer.chrome.com/docs/webstore/program-policies/listing-requirements
- Edge：https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
- Firefox：https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/
- Firefox AMO 45 字符与 Chrome/Edge 名称上限：https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/name
- Chrome 截图与摘要：https://developer.chrome.com/docs/webstore/best-listing

## Chrome 商店多语言直达链接（无须修改浏览器设置）

以下链接都指向同一个插件 ID；不会新增商品。可用于官网/SEO 落地页。**仅确保商店界面选择对应语言，不代表该语言的 Listing 已经发布，未发布会回退。**

- 简体中文：https://chromewebstore.google.com/detail/ahpjikfghfgekmjcomhcmknlkicloblf?hl=zh-CN
- 繁體中文：https://chromewebstore.google.com/detail/ahpjikfghfgekmjcomhcmknlkicloblf?hl=zh-TW
- English：https://chromewebstore.google.com/detail/ahpjikfghfgekmjcomhcmknlkicloblf?hl=en
- 日本語：https://chromewebstore.google.com/detail/ahpjikfghfgekmjcomhcmknlkicloblf?hl=ja
- 한국어：https://chromewebstore.google.com/detail/ahpjikfghfgekmjcomhcmknlkicloblf?hl=ko
- Français：https://chromewebstore.google.com/detail/ahpjikfghfgekmjcomhcmknlkicloblf?hl=fr
- Español：https://chromewebstore.google.com/detail/ahpjikfghfgekmjcomhcmknlkicloblf?hl=es
- Bahasa Melayu：https://chromewebstore.google.com/detail/ahpjikfghfgekmjcomhcmknlkicloblf?hl=ms
- Tiếng Việt：https://chromewebstore.google.com/detail/ahpjikfghfgekmjcomhcmknlkicloblf?hl=vi
- Bahasa Indonesia：https://chromewebstore.google.com/detail/ahpjikfghfgekmjcomhcmknlkicloblf?hl=id

## 三端官方规则与本地 SEO 长度核对（2026-11-04）

| 地区 | 标题长度（≤45） | 短摘要（≤132） | 完整介绍（Edge 250–10000） | Edge 搜索词数（≤7） | Edge 总词数（≤21） |
|---|---:|---:|---:|---:|---:|
| `zh_CN` | 24 | 57 | 344 | 7 | 9 |
| `zh_TW` | 24 | 61 | 346 | 7 | 9 |
| `zh_HK` | 24 | 61 | 346 | 7 | 9 |
| `en` | 44 | 123 | 1040 | 7 | 16 |
| `ja` | 21 | 67 | 465 | 7 | 9 |
| `ko` | 20 | 69 | 545 | 7 | 15 |
| `fr` | 42 | 128 | 1234 | 7 | 21 |
| `es` | 42 | 115 | 1162 | 7 | 21 |
| `ms` | 44 | 125 | 1197 | 7 | 18 |
| `vi` | 38 | 118 | 1100 | 7 | 21 |
| `id` | 43 | 118 | 1194 | 7 | 16 |

这些是**本地源码的静态校验结果**。Firefox `zh_HK` 是兼容地区资料，Chrome/Edge 实际上传包没有独立 `zh_HK`，由 `zh_TW` 承担繁体。
本地字数、关键词合规不代表审核已通过或搜索排名有保障；需上传新版、在各商店完成对应语言 Listing 和实际截图验收。


---

## 简体中文 — zh_CN

**Chrome / Edge / Firefox 标题**

取关狗｜X/Twitter 未回关检测与取关管理

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

查看 X（Twitter）谁没有回关你，对比当前关注与粉丝列表；支持白名单保护、社区黑名单，确认后分批取关或拉黑。

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

取关狗帮助你在 X（Twitter／推特）检查谁没有回关你，并管理当前关注关系。它提供个人账号检测和社区名单两种独立模式。

个人账号模式：读取当前登录账号的关注列表和粉丝列表，找出你关注但对方没有关注你的账号。支持查看扫描进度、暂停和从已保存进度继续；扫描需要时间，遇到 X 限流时可能暂停。检测完成后，你可以查看未回关名单，并将重要账号加入仅存于本机的白名单。

社区名单模式：查看社区提交并经审核的共享名单，确认后可分批拉黑其中的账号。私人账号模式的未回关名单则支持选择取关或拉黑。所有操作都由你主动确认，每批最多处理 20 个账号，批次之间有 30 分钟冷却时间。

注意：结果只代表扫描时的关注关系，不能判断谁最近取消关注了你，也不会提供历史取关记录。本扩展不是 X 官方产品。

**Edge 搜索词（逐条填写）**

未回关检测；X 关注管理；推特取关；互关检测；Twitter 粉丝；社区黑名单；白名单

---

## 繁體中文（台灣） — zh_TW

**Chrome / Edge / Firefox 标题**

取關狗｜X/Twitter 未回追檢查與追蹤管理

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

在 X（Twitter）找出你追蹤但沒有回追你的帳號。支援追蹤關係檢查、白名單保護、社群封鎖名單，以及確認後分批取消追蹤。

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

取關狗可幫你在 X（Twitter）查看哪些帳號沒有回追你，管理目前的追蹤關係。擴充功能提供個人帳號與社群名單兩種獨立模式。

個人帳號模式：比對目前登入帳號的追蹤名單與粉絲名單，列出你已追蹤、對方卻沒有追蹤你的帳號。你可以查看掃描進度、暫停並從儲存的位置繼續；X 限制請求時，掃描可能暫停。重要帳號可加入只儲存在目前瀏覽器的白名單，避免批次操作時誤處理。

社群名單模式：查看由社群提交並經審核的共享封鎖名單，確認後可分批封鎖其中的帳號。取消追蹤或封鎖未回追帳號，則是在個人帳號模式中操作。每次都需要你主動確認，每批最多處理 20 個帳號，批次之間需等待 30 分鐘。

注意：檢查結果只反映掃描當下的追蹤關係，不能判斷誰最近取消追蹤你，也不提供歷史退追紀錄。本擴充功能並非 X 官方產品。

**Edge 搜索词（逐条填写）**

未回追檢查；X 追蹤管理；推特取消追蹤；互追檢查；Twitter 粉絲；社群封鎖名單；白名單

---

## 繁體中文（香港兼容資料／非獨立 Chrome 商店語言） — zh_HK

**Chrome / Edge / Firefox 标题**

取關狗｜X/Twitter 未回追檢查與追蹤管理

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

在 X（Twitter）找出你追蹤但沒有回追你的帳號。支援追蹤關係檢查、白名單保護、社群封鎖名單，以及確認後分批取消追蹤。

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

取關狗可幫你在 X（Twitter）查看哪些帳號沒有回追你，管理目前的追蹤關係。擴充功能提供個人帳號與社群名單兩種獨立模式。

個人帳號模式：比對目前登入帳號的追蹤名單與粉絲名單，列出你已追蹤、對方卻沒有追蹤你的帳號。你可以查看掃描進度、暫停並從儲存的位置繼續；X 限制請求時，掃描可能暫停。重要帳號可加入只儲存在目前瀏覽器的白名單，避免批次操作時誤處理。

社群名單模式：查看由社群提交並經審核的共享封鎖名單，確認後可分批封鎖其中的帳號。取消追蹤或封鎖未回追帳號，則是在個人帳號模式中操作。每次都需要你主動確認，每批最多處理 20 個帳號，批次之間需等待 30 分鐘。

注意：檢查結果只反映掃描當下的追蹤關係，不能判斷誰最近取消追蹤你，也不提供歷史退追紀錄。本擴充功能並非 X 官方產品。

**Edge 搜索词（逐条填写）**

未回追檢查；X 追蹤管理；推特取消追蹤；互追檢查；Twitter 粉絲；社群封鎖名單；白名單

---

## English — en

**Chrome / Edge / Firefox 标题**

Followback Watchdog | X Non-Follower Checker

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

Check who doesn't follow you back on X (Twitter). Compare followers and following, protect accounts, and review blocklists.

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

Who doesn't follow you back on X (formerly Twitter)? Followback Watchdog helps you compare your current Following and Followers lists and manage accounts you choose.

Personal account scan: Find people you follow who do not follow you back. Review the progress, pause a scan, and resume from saved progress if X stops loading. Protect selected accounts with a whitelist stored in your browser so they are excluded from bulk actions.

Community blocklist: Browse a community-submitted list reviewed before publication. You can choose to block accounts from this list after confirming. To unfollow or block accounts that do not follow you back, use the personal account scan instead. All bulk actions require your confirmation and run in batches of up to 20, with a 30-minute cooldown between batches.

Important: Results show the follow relationships at the time of scanning. This is not a historical unfollower tracker and cannot tell you who recently unfollowed you. Followback Watchdog is independent and not affiliated with X or Twitter.

**Edge 搜索词（逐条填写）**

not following back；X non followers；Twitter followback；following checker；unfollow X；community blocklist；whitelist X

---

## 日本語 — ja

**Chrome / Edge / Firefox 标题**

フォローバック番犬｜Xの片思いフォロー確認

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

X（旧Twitter）で自分をフォローしていない相手を確認。フォロー中とフォロワーを比較し、保護リストやブロックリストも管理できます。

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

X（旧Twitter）で、フォローバックされていない「片思いフォロー」のアカウントを確認したい方のための拡張機能です。現在のフォロー関係を調べ、必要に応じて整理できます。

個人アカウント：自分がフォロー中のアカウントとフォロワーを比較し、相互フォローではない相手を一覧にします。スキャンの進捗を確認でき、一時停止や保存位置からの再開にも対応しています。Xの読み込み制限によりスキャンが止まる場合があります。保護したいアカウントはブラウザー内の保護リストに登録し、一括処理の対象から外せます。

コミュニティリスト：投稿後に審査されたブロックリストを閲覧し、確認したアカウントをまとめてブロックできます。フォロー解除や、フォローバックのない相手のブロックは、個人アカウントのスキャン結果から選べます。どちらのモードも操作前の確認が必要です。最大20件ずつ処理し、各回の間に30分間待機します。

このツールは現在のフォロー関係のみを確認します。最近フォローを外した人や過去の解除履歴は分かりません。X公式の拡張機能ではありません。

**Edge 搜索词（逐条填写）**

フォローバック確認；片思いフォロー；X フォロー管理；Twitter フォロワー；フォロー解除；ブロックリスト；相互フォロー

---

## 한국어 — ko

**Chrome / Edge / Firefox 标题**

맞팔 지킴이｜X 맞팔 아닌 계정 찾기

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

X(트위터)에서 나를 팔로우하지 않는 계정을 확인하세요. 팔로잉·팔로워 비교, 보호 목록, 커뮤니티 차단 목록을 제공합니다.

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

X(옛 트위터)에서 내가 팔로우하지만 나를 팔로우하지 않는 계정이 궁금하신가요? 맞팔 확인 도구를 사용하면 현재 팔로우 관계를 비교하고 필요한 계정만 정리할 수 있습니다.

개인 계정 검사: 팔로잉 목록과 팔로워 목록을 비교해 맞팔이 아닌 계정을 찾습니다. 검사 진행 상황을 확인하고, 중지하거나 저장된 지점에서 이어서 검사할 수 있습니다. X의 요청 제한으로 검사가 잠시 멈출 수도 있습니다. 중요한 계정은 브라우저에만 저장되는 보호 목록에 넣어 일괄 차단·언팔로우 대상에서 제외할 수 있습니다.

커뮤니티 차단 목록: 커뮤니티에서 제출하고 검토한 계정 목록을 확인한 뒤, 직접 선택한 계정을 일괄 차단할 수 있습니다. 맞팔이 아닌 계정을 언팔로우하거나 차단하는 기능은 개인 계정 검사 결과에서 이용할 수 있습니다. 두 모드 모두 작업 전에 확인이 필요하며, 한 번에 최대 20개씩 처리하고 다음 작업까지 30분간 기다립니다.

결과는 검사 당시의 팔로우 관계만 보여 줍니다. 최근 누가 언팔로우했는지 또는 과거 언팔 기록을 추적하지 않습니다. X의 공식 제품이 아닙니다.

**Edge 搜索词（逐条填写）**

맞팔 확인；맞팔 아닌 사람；X 팔로워 확인；트위터 언팔；팔로우 관리；차단 목록；언팔로우

---

## Français — fr

**Chrome / Edge / Firefox 标题**

Qui ne me suit pas ? | Gardien des abonnés

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

Qui ne vous suit pas sur X (Twitter) ? Comparez abonnements et abonnés, protégez des comptes et consultez des listes de blocage.

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

Qui ne me suit pas sur X (anciennement Twitter) ? Gardien des abonnés vous aide à repérer les abonnements non réciproques en comparant les comptes que vous suivez avec vos abonnés actuels.

Analyse du compte personnel : consultez les comptes qui ne vous suivent pas en retour. Suivez l’avancement de l’analyse, mettez-la en pause et reprenez depuis les données enregistrées si X interrompt le chargement. Ajoutez les comptes importants à une liste de protection conservée dans votre navigateur pour les exclure des actions groupées.

Liste de blocage communautaire : consultez les comptes proposés par la communauté et examinés avant publication. Dans ce mode, vous pouvez bloquer les comptes que vous choisissez, après confirmation. Pour vous désabonner de comptes qui ne vous suivent pas en retour, ou les bloquer, utilisez plutôt l’analyse du compte personnel. Chaque action groupée nécessite votre confirmation et s’effectue par lots de 20 comptes maximum, avec une pause de 30 minutes entre les lots.

Les résultats décrivent uniquement les abonnements au moment de l’analyse. L’extension ne permet pas de savoir qui vient de se désabonner ni de consulter un historique des désabonnements. Elle n’est pas affiliée à X ou Twitter.

**Edge 搜索词（逐条填写）**

qui ne me suit pas；abonnements non réciproques；abonnés X；se désabonner sur X；liste de blocage；abonnés Twitter；suivi mutuel

---

## Español — es

**Chrome / Edge / Firefox 标题**

Guardián de seguidores | No me siguen en X

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

¿Quién no te sigue en X (Twitter)? Compara tus seguidores y seguidos, protege cuentas y consulta listas de bloqueo.

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

¿Quién no me sigue en X (antes Twitter)? Guardián de seguidores te ayuda a detectar cuentas que sigues pero que no te siguen de vuelta, comparando las listas actuales de seguidos y seguidores.

Análisis de cuenta personal: revisa tus seguidores y encuentra cuentas sin seguimiento recíproco. Puedes ver el avance, pausar el análisis y retomarlo desde los datos guardados si X deja de cargar la lista. Añade cuentas importantes a una lista protegida que se guarda en tu navegador y las excluye de las acciones masivas.

Lista de bloqueos comunitaria: consulta las cuentas compartidas por la comunidad y revisadas antes de publicarse. En este modo puedes bloquear las cuentas que elijas, siempre tras confirmar la acción. Para dejar de seguir o bloquear a quienes no te siguen de vuelta, utiliza el análisis de tu cuenta personal. Las acciones se realizan en tandas de hasta 20 cuentas, con una espera de 30 minutos entre tandas.

El resultado refleja únicamente la relación de seguimiento en el momento del análisis. No indica quién dejó de seguirte recientemente ni ofrece un historial de quién dejó de seguirte. Esta extensión no está afiliada con X ni Twitter.

**Edge 搜索词（逐条填写）**

quién no me sigue；no me siguen en X；seguidores Twitter；dejar de seguir；bloquear cuentas；lista de bloqueo；seguimiento mutuo

---

## Bahasa Melayu — ms

**Chrome / Edge / Firefox 标题**

Penjaga Pengikut | Siapa tak ikut balik di X

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

Semak siapa yang tidak follow balik di X (Twitter). Bandingkan pengikut dan akaun diikuti, serta lindungi akaun pilihan anda.

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

Siapa yang tidak follow balik anda di X (dahulu Twitter)? Penjaga Pengikut membantu anda menyemak akaun yang anda ikuti tetapi tidak mengikuti anda kembali berdasarkan hubungan semasa.

Mod Akaun Peribadi: bandingkan senarai akaun yang anda ikuti dengan pengikut anda untuk mencari akaun yang tidak mengikuti balik. Pantau kemajuan imbasan, jeda dan sambung dari data yang disimpan jika X berhenti memuatkan senarai. Simpan akaun penting dalam senarai perlindungan pada penyemak imbas anda supaya ia tidak termasuk dalam tindakan pukal.

Mod Senarai Sekatan Komuniti: lihat senarai akaun yang dihantar oleh komuniti dan disemak sebelum diterbitkan. Dalam mod ini, anda boleh memilih akaun untuk disekat selepas mengesahkan tindakan. Untuk berhenti mengikuti atau menyekat akaun yang tidak mengikuti anda kembali, gunakan hasil imbasan Akaun Peribadi. Semua tindakan pukal memerlukan pengesahan anda dan memproses sehingga 20 akaun setiap kelompok, diikuti tempoh menunggu 30 minit.

Keputusan hanya menunjukkan hubungan mengikuti semasa imbasan. Sambungan ini tidak boleh mengenal pasti siapa yang baru berhenti mengikuti anda atau menyimpan sejarah unfollow. Ia bukan produk rasmi X atau Twitter.

**Edge 搜索词（逐条填写）**

tak follow balik；semak pengikut X；unfollow Twitter；senarai sekatan；akaun tak ikut balik；lindungi akaun；ikut balik

---

## Tiếng Việt — vi

**Chrome / Edge / Firefox 标题**

Trợ lý theo dõi | Ai chưa theo dõi lại

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

Kiểm tra ai không theo dõi lại trên X (Twitter). So sánh người theo dõi và đang theo dõi, bảo vệ tài khoản quan trọng.

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

Ai không theo dõi lại bạn trên X (trước đây là Twitter)? Trợ lý theo dõi giúp kiểm tra các tài khoản bạn đang theo dõi nhưng họ không theo dõi lại bạn, dựa trên quan hệ theo dõi hiện tại.

Chế độ tài khoản cá nhân: so sánh danh sách bạn đang theo dõi với danh sách người theo dõi bạn để tìm những tài khoản không follow lại. Bạn có thể xem tiến độ quét, tạm dừng và tiếp tục từ dữ liệu đã lưu nếu X ngừng tải danh sách. Thêm các tài khoản quan trọng vào danh sách bảo vệ lưu trong trình duyệt để tránh bị xử lý hàng loạt.

Danh sách chặn cộng đồng: xem các tài khoản do cộng đồng gửi và đã được kiểm duyệt trước khi hiển thị. Ở chế độ này, bạn có thể chọn tài khoản để chặn sau khi xác nhận. Muốn bỏ theo dõi hoặc chặn những tài khoản không theo dõi lại, hãy sử dụng kết quả quét tài khoản cá nhân. Mọi thao tác hàng loạt đều cần bạn xác nhận, xử lý tối đa 20 tài khoản mỗi đợt và nghỉ 30 phút trước đợt tiếp theo.

Kết quả chỉ phản ánh quan hệ theo dõi tại thời điểm quét. Tiện ích không thể cho biết ai vừa bỏ theo dõi bạn và không lưu lịch sử unfollow. Tiện ích độc lập, không thuộc X hay Twitter.

**Edge 搜索词（逐条填写）**

không follow lại；không theo dõi lại；người theo dõi；bỏ theo dõi；danh sách chặn；bảo vệ tài khoản；followback

---

## Bahasa Indonesia — id

**Chrome / Edge / Firefox 标题**

Penjaga Pengikut | Akun tak mengikuti balik

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

Cek siapa yang tidak follow back di X (Twitter). Bandingkan daftar mengikuti dan pengikut, lalu lindungi akun penting.

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

Siapa yang tidak follow back di X (dulu Twitter)? Penjaga Pengikut membantu Anda menemukan akun yang Anda ikuti tetapi tidak mengikuti Anda balik, berdasarkan hubungan mengikuti saat ini.

Mode Akun Pribadi: bandingkan daftar akun yang Anda ikuti dengan daftar pengikut untuk mengecek siapa yang tidak follow balik. Pantau proses pemindaian, jeda, dan lanjutkan dari data tersimpan jika X berhenti memuat daftar. Tambahkan akun penting ke daftar terlindungi yang disimpan di browser agar tidak masuk tindakan massal.

Mode Daftar Blokir Komunitas: tinjau akun yang dikirim komunitas dan diperiksa moderator sebelum ditampilkan. Dalam mode ini, Anda dapat memilih akun untuk diblokir setelah mengonfirmasi tindakan. Untuk berhenti mengikuti atau memblokir akun yang tidak mengikuti balik, gunakan hasil pemindaian Akun Pribadi. Semua tindakan massal memerlukan konfirmasi Anda dan diproses maksimal 20 akun per tahap, dengan jeda 30 menit sebelum tahap berikutnya.

Hasil hanya menunjukkan hubungan mengikuti saat pemindaian. Ekstensi tidak dapat mengetahui siapa yang baru saja unfollow Anda dan tidak menyediakan riwayat unfollow. Ekstensi ini independen dan bukan produk resmi X atau Twitter.

**Edge 搜索词（逐条填写）**

tidak follow balik；cek follow back；unfollow Twitter；pengikut X；daftar blokir；berhenti mengikuti；akun terlindungi

---
