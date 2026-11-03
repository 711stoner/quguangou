// Conservative handling of X follower/following page errors.
export const MAX_X_PAGE_ERROR_RECOVERIES = 2;
// Common page/rate-limit errors pause after two failed recovery cycles.
// Any other recoverable error also has a hard cap, preventing indefinite loops.
export const MAX_OTHER_RECOVERIES_WITHOUT_PROGRESS = 4;
export function shouldPauseForRepeatedXError(reason, failures) {
  const count = Number(failures || 0);
  if (!Number.isFinite(count) || count < 1) return false;
  if (count >= MAX_OTHER_RECOVERIES_WITHOUT_PROGRESS) return true;
  const s = String(reason || "");
  return count >= MAX_X_PAGE_ERROR_RECOVERIES &&
    /Something went wrong|Try reloading|X 页面|列表.*(?:错误|出错|失败)|分页.*(?:错误|失败|卡住)|持续显示临时错误|HTTP_(?:429|401|403|5\d\d)|Too Many Requests|GRAPHQL_ERROR|(?:无法找到|找不到)重试入口/i.test(s);
}
export function safeRelationFailure(failure, now=Date.now()) {
  if (!failure || !Number.isFinite(Number(failure.observedAt)) ||
      now-Number(failure.observedAt)>120000 || now<Number(failure.observedAt)) return null;
  const status=Number(failure.status);
  const err=String(failure.error||"");
  if (status===429 || err==="HTTP_429") return "HTTP_429：X 请求过多，暂时无法继续";
  if (status===401 || status===403) return "HTTP_"+status+"：X 拒绝此请求";
  if (status>=500 && status<600) return "HTTP_"+status+"：X 服务暂时出错";
  if (/^GRAPHQL_ERROR_\d+$/.test(err)) return err+"：X 数据接口返回错误";
  return null;
}
