# 取关狗 Opera 上架说明

## 包格式与兼容性

- Opera 基于 Chromium；本项目 Opera 包直接复用 Chrome 的 Manifest V3 运行时与权限声明。
- 发布包名称：quguangou-opera-v<版本>.zip。
- ZIP 根目录必须直接包含 manifest.json，不能额外套一层目录。
- 所有 JavaScript 必须打包在扩展内部，不使用远程 JavaScript；在线名单仅是静态 JSON 数据，不作为代码执行。

## Opera 官方审核重点

- One goal / 单一用途：取关狗的主用途仍是 X 中文社区取关线索名单与用户主动分批拉黑。
- 浏览器工具栏按钮必须直接进入主功能，不应变成无关功能入口。
- 权限只保留实际需要的 storage、scripting、x.com 与在线名单数据源。
- 弹窗应适配弹窗尺寸，避免不必要的纵向滚动，禁止横向滚动。
- 可以链接自有网站，但链接必须相关、作用明确，不能堆叠大量推广链接。
- 不允许外部 JavaScript、混淆代码、无用文件或多余权限。
- 支持页必须与扩展相关。

## 附加账号工具披露

插件包含一个可关闭的附加账号报价工具入口：“你的一条 X 推文，能有多少钱的广告价值？30 秒估个价。”用户可以选择“不再显示”，且不影响取关狗核心功能。

拟人化冷却页的小导流卡与全部处理完成页的大导流卡继续保留；固定卡的“不再显示”不会关闭这两个场景导流。

## 商店资料

- 官网 / 支持页：https://jiedanfadan.com/quguangou/
- 隐私政策：https://jiedanfadan.com/quguangou/privacy
- 截图应突出扩展自身功能；Opera 官方发布指南要求截图不要大于 800×600。
- 截图使用干净的默认 Opera UI，不展示无关页面、其他扩展或无关自定义。

## 本地测试

1. 打开 opera://extensions。
2. 开启 Developer Mode。
3. 使用 Load Unpacked 加载 extension/dist/opera/。
4. 在 Opera 登录 X 后测试名单读取、20 个一批、30 分钟冷却、停用账号自动跳过、继续下一批、反馈/支持二维码和所有估值入口。
