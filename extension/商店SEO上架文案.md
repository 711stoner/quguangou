# 取关狗｜全语言商店 SEO 上架文案（当前唯一版本）

> 当前源码版本：v0.2.74。11 个商店语言／地区配置、10 种可选界面语言。zh_TW / zh_HK 使用同一套繁体内容。
> **只使用本文件上架，不要复制历史 v0.2.25、v0.2.63、v0.2.67 等旧文案。**

## 发布与 SEO 规则

- 一个插件 ID，每个浏览器按相应语言完善同一个 listing，不创建独立语言商品。
- 本文件的标题和简短介绍已写入 `_locales/<locale>/messages.json`，构建 ZIP 时包含；详细介绍和 Edge 搜索词仍需到开发者后台逐语言填写，**不会因为上传 ZIP 自动填好**。
- SEO 重点是「X / Twitter + 谁没有回关 / follow back / non-followers + 真实功能」。自然表述而非重复关键词；不要宣称可查谁刚刚取关、过去退关历史、100% 成功或 X 官方授权。
- Edge 每个语言最多 7 条搜索词，每条不超过 30 字符，合计不超过 21 个词；以下均经过校验。Edge 的完整介绍 250–10000 字符。
- Firefox AMO 可本地化名称、摘要和介绍；摘要建议尽量精炼，最多 250 字符；**Firefox 页面只有一组共用截图**，不应声称会按语言自动切换截图。
- Chrome Web Store 禁止关键词堆砌。已有图片若不是当前界面，必须在上传前核对截图与实际功能是否一致。

参考：
- Chrome：https://developer.chrome.com/docs/webstore/program-policies/listing-requirements
- Edge：https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
- Firefox：https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/

## 简体中文 — zh_CN

**Chrome / Edge / Firefox 标题**

取关狗｜X/Twitter 未回关检测与取关管理

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

查看 X（Twitter）谁没有回关你，对比当前关注与粉丝列表；支持白名单保护、社区黑名单，确认后分批取关或拉黑。

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

取关狗帮助你在 X（Twitter／推特）检查谁没有回关你，并管理当前关注关系。它提供个人账号检测和社区名单两种独立模式。

个人账号模式：读取当前登录账号的关注列表和粉丝列表，找出你关注但对方没有关注你的账号。支持查看扫描进度、暂停和从已保存进度继续；扫描需要时间，遇到 X 限流时可能暂停。检测完成后，你可以查看未回关名单，并将重要账号加入仅存于本机的白名单。

社区名单模式：浏览社区提交并经审核的共享名单，自行决定是否处理。拉黑或取关操作不会在未确认的情况下自动开始。每批最多处理 20 个账号，批次之间有 30 分钟冷却时间。

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

社群名單模式：查看由社群提交並經審核的共享封鎖名單。是否封鎖或取消追蹤由你選擇並確認，不會自行啟動。每批最多處理 20 個帳號，批次之間需等待 30 分鐘。

注意：檢查結果只反映掃描當下的追蹤關係，不能判斷誰最近取消追蹤你，也不提供歷史退追紀錄。本擴充功能並非 X 官方產品。

**Edge 搜索词（逐条填写）**

未回追檢查；X 追蹤管理；推特取消追蹤；互追檢查；Twitter 粉絲；社群封鎖名單；白名單

---

## 繁體中文（香港） — zh_HK

**Chrome / Edge / Firefox 标题**

取關狗｜X/Twitter 未回追檢查與追蹤管理

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

在 X（Twitter）找出你追蹤但沒有回追你的帳號。支援追蹤關係檢查、白名單保護、社群封鎖名單，以及確認後分批取消追蹤。

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

取關狗可幫你在 X（Twitter）查看哪些帳號沒有回追你，管理目前的追蹤關係。擴充功能提供個人帳號與社群名單兩種獨立模式。

個人帳號模式：比對目前登入帳號的追蹤名單與粉絲名單，列出你已追蹤、對方卻沒有追蹤你的帳號。你可以查看掃描進度、暫停並從儲存的位置繼續；X 限制請求時，掃描可能暫停。重要帳號可加入只儲存在目前瀏覽器的白名單，避免批次操作時誤處理。

社群名單模式：查看由社群提交並經審核的共享封鎖名單。是否封鎖或取消追蹤由你選擇並確認，不會自行啟動。每批最多處理 20 個帳號，批次之間需等待 30 分鐘。

注意：檢查結果只反映掃描當下的追蹤關係，不能判斷誰最近取消追蹤你，也不提供歷史退追紀錄。本擴充功能並非 X 官方產品。

**Edge 搜索词（逐条填写）**

未回追檢查；X 追蹤管理；推特取消追蹤；互追檢查；Twitter 粉絲；社群封鎖名單；白名單

---

## English — en

**Chrome / Edge / Firefox 标题**

Followback Watchdog | X Non-Follower Checker

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

See who doesn't follow you back on X (Twitter). Compare followers and following, protect accounts, and review community blocklists.

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

Who doesn't follow you back on X (formerly Twitter)? Followback Watchdog helps you compare your current Following and Followers lists and manage accounts you choose.

Personal account scan: Find people you follow who do not follow you back. Review the progress, pause a scan, and resume from saved progress if X stops loading. Protect selected accounts with a whitelist stored in your browser so they are excluded from bulk actions.

Community blocklist: Browse a community-submitted, reviewed list of accounts. You choose which accounts to block or unfollow and confirm the action before it begins. Actions run in batches of up to 20 accounts, with a 30-minute cooldown between batches.

Important: Results show the follow relationships at the time of scanning. This is not a historical unfollower tracker and cannot tell you who recently unfollowed you. Followback Watchdog is independent and not affiliated with X or Twitter.

**Edge 搜索词（逐条填写）**

not following back；X non followers；Twitter followback；unfollow checker；unfollow X；community blocklist；protect accounts

---

## 日本語 — ja

**Chrome / Edge / Firefox 标题**

フォローバック確認｜X・Twitterの片思いフォロー管理

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

X（旧Twitter）で自分をフォローしていない相手を確認。フォロー中とフォロワーを比較し、保護リストやブロックリストも管理できます。

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

X（旧Twitter）で、フォローバックされていない「片思いフォロー」のアカウントを確認したい方のための拡張機能です。現在のフォロー関係を調べ、必要に応じて整理できます。

個人アカウント：自分がフォロー中のアカウントとフォロワーを比較し、相互フォローではない相手を一覧にします。スキャンの進捗を確認でき、一時停止や保存位置からの再開にも対応しています。Xの読み込み制限によりスキャンが止まる場合があります。保護したいアカウントはブラウザー内の保護リストに登録し、一括処理の対象から外せます。

コミュニティリスト：投稿後に審査されたブロックリストを閲覧できます。ブロックやフォロー解除は、自分で対象を選択して確認した場合のみ実行されます。最大20件ずつ処理し、各回の間に30分間の待機時間があります。

このツールは現在のフォロー関係のみを確認します。最近フォローを外した人や過去の解除履歴は分かりません。X公式の拡張機能ではありません。

**Edge 搜索词（逐条填写）**

フォローバック確認；片思いフォロー；X フォロー管理；Twitter フォロワー；フォロー解除；ブロックリスト；相互フォロー

---

## 한국어 — ko

**Chrome / Edge / Firefox 标题**

맞팔 확인 | X(트위터) 맞팔 아닌 계정 찾기

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

X(트위터)에서 나를 팔로우하지 않는 계정을 확인하세요. 팔로잉·팔로워 비교, 보호 목록, 커뮤니티 차단 목록을 제공합니다.

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

X(옛 트위터)에서 내가 팔로우하지만 나를 팔로우하지 않는 계정이 궁금하신가요? 맞팔 확인 도구를 사용하면 현재 팔로우 관계를 비교하고 필요한 계정만 정리할 수 있습니다.

개인 계정 검사: 팔로잉 목록과 팔로워 목록을 비교해 맞팔이 아닌 계정을 찾습니다. 검사 진행 상황을 확인하고, 중지하거나 저장된 지점에서 이어서 검사할 수 있습니다. X의 요청 제한으로 검사가 잠시 멈출 수도 있습니다. 중요한 계정은 브라우저에만 저장되는 보호 목록에 넣어 일괄 차단·언팔로우 대상에서 제외할 수 있습니다.

커뮤니티 차단 목록: 커뮤니티가 제출하고 검토한 목록을 확인하세요. 차단이나 언팔로우는 계정을 직접 선택하고 확인한 뒤에만 실행됩니다. 한 번에 최대 20개를 처리하며, 다음 작업 전에는 30분간 기다립니다.

결과는 검사 당시의 팔로우 관계만 보여 줍니다. 최근 누가 언팔로우했는지 또는 과거 언팔 기록을 추적하지 않습니다. X의 공식 제품이 아닙니다.

**Edge 搜索词（逐条填写）**

맞팔 확인；맞팔 아닌 사람；X 팔로워 확인；트위터 언팔；팔로우 관리；차단 목록；언팔로우

---

## Français — fr

**Chrome / Edge / Firefox 标题**

Qui ne me suit pas sur X ? | Followback

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

Repérez qui ne vous suit pas sur X (Twitter). Comparez vos abonnements, protégez des comptes et consultez les listes de blocage.

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

Qui ne me suit pas sur X (anciennement Twitter) ? Followback Watchdog vous aide à repérer les abonnements non réciproques en comparant les comptes que vous suivez avec vos abonnés actuels.

Analyse du compte personnel : consultez les comptes qui ne vous suivent pas en retour. Suivez l’avancement de l’analyse, mettez-la en pause et reprenez depuis les données enregistrées si X interrompt le chargement. Ajoutez les comptes importants à une liste de protection conservée dans votre navigateur pour les exclure des actions groupées.

Liste de blocage communautaire : parcourez des comptes proposés par la communauté et examinés avant leur publication. Vous choisissez les comptes à bloquer ou dont vous souhaitez vous désabonner, puis confirmez chaque traitement. Les actions s’effectuent par lots de 20 comptes au maximum, avec une pause de 30 minutes entre les lots.

Les résultats décrivent uniquement les abonnements au moment de l’analyse. L’extension ne permet pas de savoir qui vient de se désabonner ni de consulter un historique des désabonnements. Elle n’est pas affiliée à X ou Twitter.

**Edge 搜索词（逐条填写）**

qui ne me suit pas；abonnements non réciproques；abonnés X；se désabonner X；liste de blocage；abonnés Twitter；suivi mutuel

---

## Español — es

**Chrome / Edge / Firefox 标题**

Quién no me sigue en X (Twitter) | Followback

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

Mira quién no te sigue en X (Twitter). Compara seguidores y seguidos, protege cuentas y revisa las listas de bloqueos.

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

¿Quién no me sigue en X (antes Twitter)? Followback Watchdog te ayuda a detectar cuentas que sigues pero que no te siguen de vuelta, comparando las listas actuales de seguidos y seguidores.

Análisis de cuenta personal: revisa tus seguidores y encuentra cuentas sin seguimiento recíproco. Puedes ver el avance, pausar el análisis y retomarlo desde los datos guardados si X deja de cargar la lista. Añade cuentas importantes a una lista protegida que se guarda en tu navegador y las excluye de las acciones masivas.

Lista de bloqueos comunitaria: consulta una lista compartida por la comunidad y revisada antes de publicarse. Tú eliges qué cuentas bloquear o dejar de seguir y confirmas la acción antes de empezar. Se procesan hasta 20 cuentas por tanda, con una espera de 30 minutos entre tandas.

El resultado refleja únicamente la relación de seguimiento en el momento del análisis. No indica quién dejó de seguirte recientemente ni ofrece un historial de unfollows. Esta extensión no está afiliada con X ni Twitter.

**Edge 搜索词（逐条填写）**

quién no me sigue；no me siguen en X；seguidores Twitter；dejar de seguir；bloquear cuentas；lista de bloqueados；seguimiento mutuo

---

## Bahasa Melayu — ms

**Chrome / Edge / Firefox 标题**

Siapa Tak Follow Balik di X | Followback

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

Semak siapa yang tidak follow balik di X (Twitter). Bandingkan pengikut, lindungi akaun penting dan lihat senarai sekatan komuniti.

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

Siapa yang tidak follow balik anda di X (dahulu Twitter)? Followback Watchdog membantu anda menyemak akaun yang anda ikuti tetapi tidak mengikuti anda kembali berdasarkan hubungan semasa.

Mod Akaun Peribadi: bandingkan senarai akaun yang anda ikuti dengan pengikut anda untuk mencari akaun yang tidak mengikuti balik. Pantau kemajuan imbasan, jeda dan sambung dari data yang disimpan jika X berhenti memuatkan senarai. Simpan akaun penting dalam senarai perlindungan pada penyemak imbas anda supaya ia tidak termasuk dalam tindakan pukal.

Mod Senarai Sekatan Komuniti: lihat senarai yang dihantar oleh komuniti dan disemak sebelum diterbitkan. Anda sendiri memilih akaun untuk disekat atau berhenti mengikuti dan mengesahkan tindakan dahulu. Setiap kelompok memproses sehingga 20 akaun, diikuti tempoh menunggu selama 30 minit sebelum kelompok berikutnya.

Keputusan hanya menunjukkan hubungan mengikuti semasa imbasan. Sambungan ini tidak boleh mengenal pasti siapa yang baru berhenti mengikuti anda atau menyimpan sejarah unfollow. Ia bukan produk rasmi X atau Twitter.

**Edge 搜索词（逐条填写）**

tak follow balik；semak pengikut X；unfollow Twitter；senarai sekatan；akaun tak ikut balik；lindungi akaun；ikut balik

---

## Tiếng Việt — vi

**Chrome / Edge / Firefox 标题**

Ai không theo dõi lại trên X | Followback

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

Kiểm tra ai không theo dõi lại bạn trên X (Twitter). So sánh danh sách theo dõi, bảo vệ tài khoản và xem danh sách chặn cộng đồng.

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

Ai không theo dõi lại bạn trên X (trước đây là Twitter)? Followback Watchdog giúp kiểm tra các tài khoản bạn đang theo dõi nhưng họ không theo dõi lại bạn, dựa trên quan hệ theo dõi hiện tại.

Chế độ tài khoản cá nhân: so sánh danh sách bạn đang theo dõi với danh sách người theo dõi bạn để tìm những tài khoản không follow lại. Bạn có thể xem tiến độ quét, tạm dừng và tiếp tục từ dữ liệu đã lưu nếu X ngừng tải danh sách. Thêm các tài khoản quan trọng vào danh sách bảo vệ lưu trong trình duyệt để tránh bị xử lý hàng loạt.

Danh sách chặn cộng đồng: xem các tài khoản do cộng đồng gửi và đã được kiểm duyệt trước khi xuất hiện trong danh sách. Bạn tự chọn tài khoản cần chặn hoặc bỏ theo dõi và xác nhận trước khi thực hiện. Mỗi đợt xử lý tối đa 20 tài khoản, sau đó nghỉ 30 phút trước đợt tiếp theo.

Kết quả chỉ phản ánh quan hệ theo dõi tại thời điểm quét. Tiện ích không thể cho biết ai vừa bỏ theo dõi bạn và không lưu lịch sử unfollow. Tiện ích độc lập, không thuộc X hay Twitter.

**Edge 搜索词（逐条填写）**

không follow lại；không theo dõi lại；người theo dõi；bỏ theo dõi；danh sách chặn；bảo vệ tài khoản；followback

---

## Bahasa Indonesia — id

**Chrome / Edge / Firefox 标题**

Cek Tidak Follow Back di X (Twitter)

**Chrome 简介／Edge 简短介绍／Firefox 摘要**

Cek siapa yang tidak mengikuti balik di X (Twitter). Bandingkan pengikut, lindungi akun penting, dan lihat daftar blokir komunitas.

**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**

Siapa yang tidak follow back di X (dulu Twitter)? Followback Watchdog membantu Anda menemukan akun yang Anda ikuti tetapi tidak mengikuti Anda balik, berdasarkan hubungan mengikuti saat ini.

Mode Akun Pribadi: bandingkan daftar akun yang Anda ikuti dengan daftar pengikut untuk mengecek siapa yang tidak follow balik. Pantau proses pemindaian, jeda, dan lanjutkan dari data tersimpan jika X berhenti memuat daftar. Tambahkan akun penting ke daftar terlindungi yang disimpan di browser agar tidak masuk tindakan massal.

Mode Daftar Blokir Komunitas: tinjau daftar akun yang dikirim komunitas dan diperiksa moderator sebelum ditampilkan. Anda memilih sendiri akun yang akan diblokir atau berhenti diikuti, lalu mengonfirmasi tindakan terlebih dahulu. Setiap tahap memproses maksimal 20 akun, diikuti jeda 30 menit sebelum tahap berikutnya.

Hasil hanya menunjukkan hubungan mengikuti saat pemindaian. Ekstensi tidak dapat mengetahui siapa yang baru saja unfollow Anda dan tidak menyediakan riwayat unfollow. Ekstensi ini independen dan bukan produk resmi X atau Twitter.

**Edge 搜索词（逐条填写）**

tidak follow balik；cek follow back；unfollow Twitter；pengikut X；daftar blokir；berhenti mengikuti；akun terlindungi

---
