/**
 * Scan window recovery copy is authored independently for each supported UI
 * locale. Do not infer native language from keyword search or the X account.
 */
const copy = {
 "zh-CN": {
  helpNormal:"如果X 扫描窗口不见了，或者 数字进度连续几分钟不变，请点下面的「重新打开扫描窗口（保留进度）」。不要点「重新检测」。",
  helpMissing:"没有找到正在扫描的 X 窗口，可能已经卡住。点下面「重新打开扫描窗口（保留进度）」，会接着已保存的位置继续；不要点「重新检测」或卸载插件。",
  helpStalled:"进度已经超过 3 分钟没有增加。若 X 没有限流，点「重新打开扫描窗口（保留进度）」；仍不动就先点「暂停检测」，再点「继续检测」。",
  helpCooling:"X 提示请求太频繁，现在不能继续。请等界面显示的冷却时间结束，不要反复点击。之前读取的数据已经保存。",
  helpPaused:"检测已经暂停，数据没有清零。确认 X 页面能正常打开后，点「继续检测（从断点恢复）」；窗口仍不出现，再点「重新打开扫描窗口」。",

  restart:"重新打开扫描窗口（保留进度）",
  schedule:"冷却结束后重新打开窗口（保留进度）",
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
  helpNormal:"如果數字連續 3 分鐘不變，或 X 掃描視窗不見了，請點下方「重新開啟掃描視窗（保留進度）」。不要點「重新偵測」。",
  helpMissing:"找不到正在掃描的 X 視窗，可能已經卡住。請點「重新開啟掃描視窗（保留進度）」繼續；不要重新偵測或移除擴充功能。",
  helpStalled:"進度超過 3 分鐘沒有增加。若 X 沒有限流，請重新開啟掃描視窗；仍無變化就先暫停，再從儲存的位置繼續。",
  helpCooling:"X 暫時限制請求。請等顯示的冷卻時間結束，不要反覆點擊；已讀取的資料會保留。",
  helpPaused:"已暫停，資料沒有清除。確認 X 頁面可開啟後，點「繼續偵測」；若視窗沒有出現，再重新開啟掃描視窗。",

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
  helpNormal:"If the number does not change for 3 minutes or the X scan window vanishes, use “Reopen scan window (keep progress)” below. Do not start a new scan.",
  helpMissing:"The X scan window is missing. Choose “Reopen scan window (keep progress)” to continue from saved accounts. Do not reset the scan or uninstall.",
  helpStalled:"No new accounts for over 3 minutes. If X is not rate-limiting you, reopen the scan window. If it still stalls, pause, then resume.",
  helpCooling:"X has limited requests. Wait until the cooldown time shown; repeated clicks will not help. Saved accounts remain intact.",
  helpPaused:"The scan is paused, but your data is saved. Once X works again, choose Resume. If no scan window appears, reopen it.",

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
  helpNormal:"3分以上数字が変わらない、またはXのスキャン画面が消えた場合は、下の「スキャン画面を開き直す（進捗を保持）」を押してください。最初からやり直さないでください。",
  helpMissing:"Xのスキャン画面が見つかりません。保存済みの続きから再開するには画面を開き直してください。再スキャンや拡張機能の削除は避けてください。",
  helpStalled:"3分以上進捗がありません。Xの制限中でなければスキャン画面を開き直し、それでも動かなければ一時停止してから再開してください。",
  helpCooling:"Xがリクエストを制限中です。表示された解除時刻まで待ち、何度も押さないでください。保存したデータは残ります。",
  helpPaused:"スキャンは一時停止中で、データは保存されています。Xが正常に開けたら「再開」を押し、画面が現れなければ開き直してください。",

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
  helpNormal:"3분 동안 숫자가 바뀌지 않거나 X 스캔 창이 사라지면 아래의 “스캔 창 다시 열기(진행 상황 유지)”를 누르세요. 새 검사를 시작하지 마세요.",
  helpMissing:"X 스캔 창을 찾을 수 없습니다. 저장된 위치부터 이어가려면 스캔 창을 다시 여세요. 처음부터 재검사하거나 확장 프로그램을 삭제하지 마세요.",
  helpStalled:"3분 넘게 새 계정이 없습니다. X 요청 제한이 아니라면 창을 다시 열고, 계속 멈추면 일시 중지한 뒤 재개하세요.",
  helpCooling:"X에서 요청을 제한하고 있습니다. 표시된 대기 시간이 끝날 때까지 기다리세요. 반복 클릭해도 빨라지지 않으며 저장 데이터는 유지됩니다.",
  helpPaused:"검사가 일시 중지되었지만 데이터는 저장됐습니다. X가 정상 작동하면 계속하기를 누르고, 창이 없으면 다시 여세요.",

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
  helpNormal:"Si le nombre ne change plus pendant 3 minutes ou si la fenêtre X disparaît, cliquez sur « Rouvrir la fenêtre » ci-dessous. Ne recommencez pas à zéro.",
  helpMissing:"La fenêtre d’analyse X est introuvable. Rouvrez-la pour reprendre les comptes enregistrés ; ne réinitialisez pas l’analyse et ne désinstallez pas l’extension.",
  helpStalled:"Aucun nouveau compte depuis plus de 3 minutes. Si X ne limite pas les requêtes, rouvrez la fenêtre. Sinon, mettez en pause puis reprenez.",
  helpCooling:"X limite les requêtes. Attendez l’heure indiquée sans cliquer plusieurs fois. Les comptes déjà enregistrés sont conservés.",
  helpPaused:"L’analyse est en pause, mais les données sont sauvegardées. Quand X fonctionne de nouveau, reprenez ; si la fenêtre manque, rouvrez-la.",

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
  helpNormal:"Si el número no cambia durante 3 minutos o desaparece la ventana de X, pulsa « Volver a abrir la ventana » abajo. No reinicies el análisis.",
  helpMissing:"No aparece la ventana de análisis de X. Vuelve a abrirla para seguir desde lo guardado. No reinicies ni desinstales la extensión.",
  helpStalled:"No hay nuevas cuentas desde hace más de 3 minutos. Si X no está limitando las solicitudes, vuelve a abrir la ventana. Si persiste, pausa y continúa.",
  helpCooling:"X limita temporalmente las solicitudes. Espera hasta la hora indicada sin hacer clic repetidas veces. Los datos guardados permanecen.",
  helpPaused:"El análisis está pausado y los datos siguen guardados. Cuando X funcione, pulsa Continuar; si falta la ventana, vuelve a abrirla.",

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
  helpNormal:"Jika angka tidak berubah selama 3 minit atau tetingkap imbasan X hilang, pilih “Buka semula tetingkap” di bawah. Jangan mulakan imbasan baharu.",
  helpMissing:"Tetingkap imbasan X tidak ditemui. Buka semula untuk menyambung dari data tersimpan. Jangan tetapkan semula atau nyahpasang sambungan.",
  helpStalled:"Tiada akaun baharu lebih 3 minit. Jika X tidak mengehadkan permintaan, buka semula tetingkap; jika masih tersekat, jeda dan sambung.",
  helpCooling:"X mengehadkan permintaan. Tunggu sehingga masa yang dipaparkan; jangan klik berulang kali. Data tersimpan kekal.",
  helpPaused:"Imbasan dijeda, tetapi data disimpan. Apabila X pulih, pilih Sambung. Jika tetingkap tiada, buka semula.",

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
  helpNormal:"Nếu số liệu không đổi trong 3 phút hoặc cửa sổ quét X biến mất, nhấn “Mở lại cửa sổ” bên dưới. Đừng bắt đầu quét lại từ đầu.",
  helpMissing:"Không tìm thấy cửa sổ quét X. Hãy mở lại để tiếp tục từ dữ liệu đã lưu; đừng đặt lại hoặc gỡ tiện ích.",
  helpStalled:"Hơn 3 phút không có tài khoản mới. Nếu X không giới hạn yêu cầu, hãy mở lại cửa sổ; nếu vẫn đứng, tạm dừng rồi tiếp tục.",
  helpCooling:"X đang giới hạn yêu cầu. Chờ đến thời gian được hiển thị, đừng nhấn liên tục. Dữ liệu đã lưu vẫn còn.",
  helpPaused:"Quét đã tạm dừng nhưng dữ liệu vẫn được lưu. Khi X hoạt động bình thường, nhấn Tiếp tục; nếu không thấy cửa sổ, hãy mở lại.",

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
  helpNormal:"Jika angka tidak berubah selama 3 menit atau jendela pemindaian X hilang, pilih “Buka ulang jendela” di bawah. Jangan mulai dari awal.",
  helpMissing:"Jendela pemindaian X tidak ditemukan. Buka ulang untuk melanjutkan dari data tersimpan. Jangan reset atau hapus ekstensi.",
  helpStalled:"Tidak ada akun baru lebih dari 3 menit. Jika X tidak membatasi permintaan, buka ulang jendela; jika tetap macet, jeda lalu lanjutkan.",
  helpCooling:"X sedang membatasi permintaan. Tunggu hingga waktu yang ditampilkan dan jangan klik berulang kali. Data tersimpan tetap ada.",
  helpPaused:"Pemindaian dijeda, tetapi data tersimpan. Saat X normal, pilih Lanjutkan; jika jendela tidak muncul, buka ulang.",

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
