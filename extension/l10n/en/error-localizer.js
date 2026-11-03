/* Display-only translation of error messages returned by the shared background service.
 * Never changes backend identifiers, scan state, or the actual operations.
 */
(() => {
  const han = /[\u3400-\u9fff]/;
  const patterns = [
    [/HTTP[_ ]?429|Too Many Requests|请求过多|限流冷却|rate.?limit/i,
      "X rate limit (HTTP 429). Your saved follow data and checkpoints are intact. Wait for the cooldown before resuming."],
    [/白名单保护|受到白名单保护|所选账号全部受到白名单保护/,
      "This account is protected by your local whitelist and has been skipped."],
    [/尚未登录|重新登录|登录状态已失效|当前浏览器中尚未登录/, "Sign in to X and try again."],
    [/与.*账号.*不一致|账号.*不一致|切回原账号/, "The signed-in X account does not match the account used for this scan. Switch back to the original X account before continuing."],
    [/账号状态尚未稳定|页面中的账号信息不一致/, "X account details are inconsistent or still loading. Verify the signed-in account and try again."],
    [/无法识别.*登录.*账号/, "Could not identify the signed-in X account. The page layout may have changed."],
    [/关注关系已发生变化|检测结果已失效|关注关系可能已变化/, "Follow relationships have changed. Run a new scan before taking action."],
    [/权限|无法访问.*页面/, "The extension could not access this page. Confirm permissions and try again."],
    [/验证码|频率限制|rate.?limit/i, "X may be rate-limiting or requiring verification. Stop, check the X page and try again later."],
    [/被 X 限制|X 限制/, "This account is restricted by X. This item was skipped; consider reviewing it manually later."],
    [/已注销|已停用|无法访问/, "This X account has been deactivated, suspended or is currently inaccessible."],
    [/订阅页面/, "X opened a subscription page. This item was skipped; consider handling it manually."],
    [/已经回关/, "This account now follows you back and has been skipped."],
    [/已经没有关注/, "You no longer follow this account."],
    [/已经被拉黑/, "This account is already blocked."],
    [/找不到.*正在关注|找不到.*拉黑|用户操作菜单|确认窗口/, "The expected X action controls could not be found. The X interface may have changed; no action was confirmed."],
    [/操作可能未成功|本次没有处理成功|失败页面/, "This action could not be verified. Review the X page before retrying."],
    [/网络|接口持续失败|请求暂时失败|返回可用数据|列表加载异常|读取失败/, "X did not return usable data. Your saved progress can be resumed once the X page works again."],
    [/扫描标签.*关闭|扫描标签.*休眠|扫描窗口.*超时|扫描窗口.*失败/, "The dedicated scan tab closed, went to sleep or could not be restored. The scan may be resumed from its saved checkpoint."],
    [/页面暂时没有继续加载|暂时没有继续加载|分页暂时卡住/, "The X list stopped loading. Your checkpoint was saved for resuming."],
    [/系统级异常|处理页面.*异常|页面响应太慢/, "The processing page encountered an error. The task is paused to avoid acting on the wrong account."],
    [/任务已暂停|暂停扫描|已暂停自动重试/, "The task is paused. Saved progress will be retained."],
    [/任务正在执行|已有处理任务|任务正在进行/, "Another task is already running. Finish or pause it before starting another."],
    [/冷却|后继续|后手动继续下一批/, "A mandatory cooldown is active. Wait until it ends before resuming the next batch."],
    [/结果不完整|少.*个|没有可处理的账号/, "The scan is incomplete or has no eligible accounts. Verify the results before acting."],
    [/没有可继续|没有可跳过|任务已经结束/, "There is no eligible task available for this action."],
    [/无法创建|无法打开取关狗窗口/, "Could not open the extension window. Try reopening the extension."],
    [/内置名单|在线名单.*无法|社区名单暂时无法读取/, "The community blocklist could not be loaded. Try again later."],
    [/名单格式错误|accounts.*数组/, "The community list contains an invalid data format."],
    [/社区名单.*上传|保存这个选择|提交.*失败/, "Your community submission could not be saved right now. Please retry later."],
    [/无法读取|无法确认|未能完整加载/, "X data could not be read or verified. The operation was not completed."],
    [/未标注/, "Unlabeled"],
    [/未知/, "Unknown"]
  ];
  const toEnglish = input => {
    const original = String(input ?? "");
    if (!han.test(original)) return original;
    const handle = original.match(/@[\w.-]+/)?.[0];
    for (const [re, message] of patterns) {
      if (re.test(original)) return handle && !message.includes(handle) ? message + " (" + handle + ")" : message;
    }
    return "X returned an error that could not be verified. Review the open X page and try again. The requested operation has not been confirmed.";
  };
  window.QGDLocalizeError = toEnglish;
})();
