# 取关狗：Microsoft Edge 与 Firefox 适配及上架指南

最后更新：2026-09-26
对应源码版本：v0.2.25

## 当前结论
- Edge、Firefox 都有独立 Manifest 和独立发布 ZIP，不要互相混用
- 当前发布包位于 /Users/zhangan/quguangou/04发布包/
- Edge 包：quguangou-edge-v0.2.25.zip
- Firefox 包：quguangou-firefox-v0.2.25.zip
- 单纯更新在线黑名单 / 单向取关名单时，不重新提交商店

## 共用产品定位
取关狗是一款面向 X 中文社区的账号管理辅助工具：展示社区黑名单与单向取关线索，并由用户主动发起、按分批节奏拉黑名单账号。
它不是个人取关检测器，不扫描粉丝 / 关注历史。

## Edge
- Manifest V3
- 权限只保留 storage、scripting、https://x.com/* 与远程名单数据源
- Partner Center 的详细描述、Single Purpose、Permission justification、Privacy、Search terms 不会因 ZIP 更新自动同步
- Search terms 最多 7 个，建议：X、Twitter、黑名单、单向取关、拉黑、互关、中文社区
- 上传：04发布包/quguangou-edge-v0.2.25.zip

本地测试：
1. 打开 edge://extensions
2. 开启开发人员模式
3. 加载 extension/dist/edge/
4. 登录 X，测试名单读取、20 个一批、30 分钟冷却、不可访问账号继续、手动继续、停止任务
5. 冷却状态只应显示一张估值入口，完成状态只显示一张，首页不显示

## Firefox
- Manifest V3
- 使用 Firefox 专用 background 配置和固定扩展 ID
- 数据收集声明必须与实际行为一致；当前扩展不向开发者传输 X 用户数据、任务记录或浏览历史
- 远程名单请求只下载公开 JSON，不上传用户数据
- AMO listing 要提前披露冷却 / 完成阶段的可选估值入口，符合 No Surprises
- 上传：04发布包/quguangou-firefox-v0.2.25.zip

本地测试：
1. 打开 about:debugging#/runtime/this-firefox
2. 临时载入 extension/dist/firefox/manifest.json
3. 登录 X，执行与 Edge 相同的小规模测试
4. 正式发布需通过 Mozilla 签名

## 共用公开页面
- 官网 / 支持页：https://jiedanfadan.com/quguangou/
- 隐私政策：https://jiedanfadan.com/quguangou/privacy
- 在线名单 JSON：https://711stoner.github.io/quguangou/extension/data/blocklist.json

711stoner.github.io 只用于静态名单 JSON，不作为商店官网、支持页或隐私政策。

## 共用上架资料
- Chrome 主文案参考：webstore/商店介绍.md
- Edge 中文资料：docs/Edge商店中文资料.md
- 隐私与权限：webstore/隐私与权限填写.md
- 审核测试步骤：webstore/审核备注.md
- 四平台合规检查：docs/四平台发布前合规检查-2026-09-26.md

## 何时需要重新提交
需要：代码、UI、权限、执行逻辑、数据源地址发生变化。
不需要：只增加、删除、纠正名单账号并更新远程 blocklist.json。
