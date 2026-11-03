/**
 * Scan window recovery copy is authored independently for each supported UI
 * locale. Do not infer native language from keyword search or the X account.
 */
const copy = {
 "zh-CN": {
  restart:"强制重开扫描窗口（保留进度）",
  schedule:"冷却结束后重开窗口（保留进度）",
  running:"已经扫过的账号会自动保存。如果窗口消失或长时间不动，可以点“强制重开扫描窗口”，会从断点继续。",
  cooling:"X 暂时限制了请求。已保存的数据不会丢失；到冷却时间后，插件会重新打开窗口继续。",
  paused:"扫描已暂停，数据保留。可以点“继续检测”，或者重新打开扫描窗口从断点恢复。",
  limit:"X 请求太频繁，暂时不能继续。最早恢复：",
  recovering:"正在恢复扫描窗口，之前扫到的账号不会清零。",
  scheduled:"已安排重开。等 X 冷却结束后自动打开扫描窗口，之前的数据都保留。",
  restarted:"正在重新打开扫描窗口。已经扫过的账号不会重新计数。",
  fail:"窗口没有成功重开，原来的扫描数据仍保留。请重试。"
 },
 "zh-TW": {
  restart:"強制重開掃描視窗（保留進度）",
  schedule:"冷卻結束後重開視窗（保留進度）",
  running:"已掃過的帳號會自動儲存。如果視窗消失或長時間沒有進度，可以點「強制重開掃描視窗」，從斷點繼續。",
  cooling:"X 暫時限制了請求。已儲存的資料不會消失；冷卻結束後，外掛會重新開啟視窗繼續。",
  paused:"掃描已暫停，資料仍保留。可點「繼續偵測」，或重新開啟掃描視窗從斷點恢復。",
  limit:"X 請求過於頻繁，暫時無法繼續。最早恢復時間：",
  recovering:"正在恢復掃描視窗，先前掃過的帳號不會清零。",
  scheduled:"已安排重新開啟。等 X 冷卻結束，便會自動開啟掃描視窗；進度不會消失。",
  restarted:"正在重新開啟掃描視窗。先前掃過的帳號不會重新計數。",
  fail:"視窗未能重新開啟，原有掃描資料仍保留。請再試一次。"
 },
 en: {
  restart:"Force restart scan window (keep progress)",
  schedule:"Reopen after cooldown (keep progress)",
  running:"Your scanned accounts are saved. If the window disappears or stops progressing, restart the scan window to continue from your checkpoint.",
  cooling:"X is rate-limiting requests. Your progress is safe. A new scan window will open when the cooldown ends.",
  paused:"The scan is paused, but your progress is saved. Continue the scan or reopen its window from the checkpoint.",
  limit:"X is limiting requests. Earliest restart:",
  recovering:"Recovering the scan window without resetting your saved accounts.",
  scheduled:"Restart scheduled. A new X window will open after cooldown, keeping all saved accounts.",
  restarted:"Opening a new X scan window with your saved progress.",
  fail:"Could not reopen the window. Your previous scan progress is still saved."
 },
 ja: {
  restart:"スキャン画面を強制的に開き直す（進捗を保持）",
  schedule:"制限解除後に開き直す（進捗を保持）",
  running:"取得済みのアカウントは保存されています。画面が消えたり処理が長時間止まったりしたら、スキャン画面を開き直して続きから再開できます。",
  cooling:"X がリクエストを制限しています。進捗は保存済みです。制限解除後に新しいスキャン画面を開いて再開します。",
  paused:"スキャンは一時停止中です。進捗は保存されているので、再開するか、画面を開き直して続けられます。",
  limit:"X のリクエスト制限中です。再開可能な時刻：",
  recovering:"保存したアカウントを消さずにスキャン画面を復旧しています。",
  scheduled:"再開を予約しました。制限解除後、新しい画面から保存した続きへ進みます。",
  restarted:"保存した進捗を引き継ぎ、新しい X スキャン画面を開きます。",
  fail:"スキャン画面を開き直せませんでした。これまでの進捗は保存されています。"
 },
 ko: {
  restart:"스캔 창 강제로 다시 열기(진행 상황 유지)",
  schedule:"제한 해제 후 다시 열기(진행 상황 유지)",
  running:"이미 읽은 계정은 저장됩니다. 창이 사라지거나 진행이 오래 멈추면 스캔 창을 다시 열어 저장된 지점부터 이어갈 수 있습니다.",
  cooling:"X가 요청을 일시적으로 제한하고 있습니다. 진행 상황은 안전하게 저장됐으며 제한이 풀리면 새 창에서 이어집니다.",
  paused:"스캔이 일시 중지됐지만 진행 상황은 남아 있습니다. 계속하기 또는 창 다시 열기로 이어갈 수 있습니다.",
  limit:"X 요청 제한 중입니다. 가장 빠른 재개 시각:",
  recovering:"기존 계정을 지우지 않고 스캔 창을 복구하고 있습니다.",
  scheduled:"다시 열기를 예약했습니다. 제한이 풀린 뒤 저장된 지점부터 자동으로 이어집니다.",
  restarted:"저장된 진행 상황으로 새 X 스캔 창을 엽니다.",
  fail:"스캔 창을 다시 열지 못했습니다. 이전 진행 상황은 그대로 저장되어 있습니다."
 },
 fr: {
  restart:"Rouvrir la fenêtre d’analyse (garder la progression)",
  schedule:"Rouvrir après la pause imposée (garder la progression)",
  running:"Les comptes déjà analysés sont enregistrés. Si la fenêtre disparaît ou reste bloquée, rouvrez-la pour reprendre au dernier point de sauvegarde.",
  cooling:"X limite temporairement les requêtes. Votre progression est conservée. Une nouvelle fenêtre s’ouvrira après la période d’attente.",
  paused:"L’analyse est en pause et votre progression est conservée. Vous pouvez la reprendre ou rouvrir sa fenêtre.",
  limit:"X limite les requêtes. Reprise possible au plus tôt :",
  recovering:"Réouverture de la fenêtre sans effacer les comptes déjà analysés.",
  scheduled:"Réouverture programmée après la période d’attente, sans perte de progression.",
  restarted:"Ouverture d’une nouvelle fenêtre X à partir des données enregistrées.",
  fail:"Impossible de rouvrir la fenêtre. Les données déjà analysées sont conservées."
 },
 es: {
  restart:"Forzar reapertura del análisis (conservar progreso)",
  schedule:"Reabrir tras la espera (conservar progreso)",
  running:"Las cuentas ya revisadas se guardan. Si desaparece la ventana o se queda bloqueada, puedes reabrirla y continuar desde el último punto guardado.",
  cooling:"X está limitando las solicitudes. El progreso está guardado y se abrirá una ventana nueva cuando termine la espera.",
  paused:"El análisis está en pausa, pero el progreso se mantiene. Puedes continuarlo o volver a abrir su ventana.",
  limit:"X limita las solicitudes. Primera hora posible para reanudar:",
  recovering:"Recuperando la ventana sin borrar las cuentas ya revisadas.",
  scheduled:"Reapertura programada tras la espera. Se conservarán los datos guardados.",
  restarted:"Abriendo una nueva ventana de X con el progreso guardado.",
  fail:"No se pudo reabrir la ventana. Los datos del análisis siguen guardados."
 },
 ms: {
  restart:"Buka semula tetingkap imbasan (kekalkan kemajuan)",
  schedule:"Buka selepas tempoh menunggu (kekalkan kemajuan)",
  running:"Akaun yang telah diimbas disimpan. Jika tetingkap hilang atau imbasan terhenti lama, buka semula tetingkap untuk menyambung dari kedudukan tersimpan.",
  cooling:"X sedang mengehadkan permintaan. Kemajuan anda selamat dan tetingkap baharu akan dibuka selepas tempoh menunggu.",
  paused:"Imbasan dijeda tetapi kemajuan disimpan. Anda boleh sambung atau buka semula tetingkap imbasan.",
  limit:"X mengehadkan permintaan. Masa paling awal untuk sambung:",
  recovering:"Memulihkan tetingkap imbasan tanpa memadam akaun yang telah disimpan.",
  scheduled:"Tetingkap akan dibuka semula selepas tempoh menunggu. Semua kemajuan disimpan.",
  restarted:"Membuka tetingkap X baharu dan menyambung dari kemajuan tersimpan.",
  fail:"Tidak dapat membuka semula tetingkap. Kemajuan imbasan terdahulu masih disimpan."
 },
 vi: {
  restart:"Mở lại cửa sổ quét (giữ tiến độ)",
  schedule:"Mở lại sau thời gian chờ (giữ tiến độ)",
  running:"Tài khoản đã quét được lưu lại. Nếu cửa sổ biến mất hoặc đứng yên quá lâu, hãy mở lại để tiếp tục từ điểm đã lưu.",
  cooling:"X đang giới hạn yêu cầu. Tiến độ vẫn được giữ nguyên; cửa sổ quét mới sẽ mở sau khi hết thời gian chờ.",
  paused:"Đã tạm dừng quét nhưng tiến độ vẫn được lưu. Bạn có thể tiếp tục hoặc mở lại cửa sổ quét.",
  limit:"X đang giới hạn yêu cầu. Có thể thử lại sớm nhất lúc:",
  recovering:"Đang khôi phục cửa sổ quét, không xóa các tài khoản đã lưu.",
  scheduled:"Đã lên lịch mở lại sau thời gian chờ. Toàn bộ tiến độ được giữ nguyên.",
  restarted:"Đang mở cửa sổ X mới từ điểm đã lưu trước đó.",
  fail:"Không thể mở lại cửa sổ. Tiến độ quét trước đó vẫn được lưu."
 },
 id: {
  restart:"Buka ulang jendela pemindaian (progres tersimpan)",
  schedule:"Buka ulang setelah jeda (progres tersimpan)",
  running:"Akun yang sudah dipindai tersimpan. Jika jendela menghilang atau macet terlalu lama, buka ulang untuk melanjutkan dari titik terakhir.",
  cooling:"X sedang membatasi permintaan. Progres Anda aman; jendela baru akan terbuka setelah masa jeda selesai.",
  paused:"Pemindaian dijeda, tetapi progres tetap disimpan. Anda bisa melanjutkan atau membuka ulang jendelanya.",
  limit:"X membatasi permintaan. Waktu paling awal melanjutkan:",
  recovering:"Memulihkan jendela pemindaian tanpa menghapus akun yang telah disimpan.",
  scheduled:"Pembukaan ulang dijadwalkan setelah masa jeda. Semua progres tetap disimpan.",
  restarted:"Membuka jendela X baru dengan progres yang telah disimpan.",
  fail:"Tidak dapat membuka ulang jendela. Progres sebelumnya tetap disimpan."
 }
};
export function getScanRestartText(language) {
 return copy[language] || copy.en;
}
