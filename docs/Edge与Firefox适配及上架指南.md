# 取关狗：Microsoft Edge 与 Firefox 适配及上架指南

> 文档更新：2026-09-13
> 对应源码版本：v0.2.13

## 1. 结论

这项适配的代码改动不大，但两个市场都需要分别注册、填写上架资料、上传安装包并等待审核。

- **Microsoft Edge** 和 Chrome 都基于 Chromium，当前业务代码可以直接复用，只需使用 Edge 专用清单和安装包。
- **Firefox** 不使用 Chrome MV3 的 `background.service_worker`，需改为 `background.scripts`；其余 `storage`、`tabs`、`scripting` 和弹窗功能可以复用。
- 当前项目已准备好两个独立清单和统一打包脚本。
- 代码准备好不等于已上架；市场提交必须使用开发者本人的 Microsoft 和 Mozilla 账号完成。

## 2. 已完成的适配

### Microsoft Edge

清单文件：`extension/manifests/edge.json`

- 继续使用 Manifest V3。
- 继续使用 `background.service_worker` 和 ES Module。
- 保留最小权限：`storage`、`scripting` 和 `https://x.com/*`。
- 不包含 Chrome Web Store 专用的 `update_url`。

### Firefox Add-ons

清单文件：`extension/manifests/firefox.json`

- 继续使用 Manifest V3。
- 后台入口改为 `background.scripts`，并保留 `type: module`。
- 设置 Firefox 扩展 ID：`quguangou@zhangan.studio`。第一次提交后不要随意更换，否则 Firefox 会把它当作另一个扩展。
- 设置最低版本 Firefox 140，以使用当前的数据收集声明机制。
- 明确声明 `data_collection_permissions.required: ["none"]`：扩展不向浏览器外部收集或传输用户数据。

### 共用代码

- 登录错误文案已从“Chrome 中尚未登录 X”改为“当前浏览器中尚未登录 X”。
- 暂时不需要引入第三方 polyfill，可以减少审核时的依赖和远程代码疑虑。
- 两个版本使用同一份名单、弹窗、图标和业务脚本，仅 Manifest 不同。

## 3. 打包命令

在 `extension` 文件夹中运行：

```bash
npm test
npm run build
```

也可以分别打包：

```bash
npm run build:edge
npm run build:firefox
```

产物位于：

- `extension/dist/quguangou-edge-v0.2.13.zip`
- `extension/dist/quguangou-firefox-v0.2.13.zip`
- `extension/dist/edge/`：Edge 本地加载目录。
- `extension/dist/firefox/`：Firefox 临时加载目录。

`dist` 目录是生成产物，已被 `.gitignore` 忽略。每次上架前都应重新运行打包命令，不要手动替换 ZIP 里的文件。

## 4. 上架前的本地测试

### Edge 本地测试

1. 打开 `edge://extensions`。
2. 打开“开发人员模式”。
3. 选择“加载解压缩的扩展”。
4. 选择 `extension/dist/edge` 文件夹。
5. 在 Edge 中登录 X，先用 1–2 个测试账号检查名单显示、任务暂停、继续、停止和已拉黑判断。

### Firefox 本地测试

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 点击“临时载入附加组件”。
3. 选择 `extension/dist/firefox/manifest.json`。
4. 在 Firefox 中登录 X，执行与 Edge 相同的小规模测试。
5. 注意：正式版 Firefox 不能长期安装未签名 ZIP；公开发布前必须经过 Mozilla 签名。

### 必测清单

- 扩展弹窗能正常打开，名单版本和数量正确。
- 未登录 X 时能正确提示并暂停。
- 能创建非活动工作标签页，访问 `x.com` 并执行拉黑。
- 失败时保留问题页面，不继续处理后续账号。
- “停止任务”和“继续剩余账号”正常。
- 本地进度在关闭弹窗后仍能恢复。
- 实际页面不应出现“Chrome”专属文案。

## 5. Microsoft Edge Add-ons 上架

### 账号和费用

1. 使用 Microsoft 账号登录 [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview)。
2. 注册 Microsoft Edge 扩展开发者账号，选择个人或公司类型，填写发布者名称和联系信息。
3. Microsoft 官方目前说明 Edge 扩展开发者注册不收费。

官方说明：<https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account>

### 提交步骤

1. 在 Partner Center 的 Edge 工作区点击“Create new extension”。
2. 上传 `extension/dist/quguangou-edge-v0.2.13.zip`。
3. 选择可见性：正式上架选 `Public`；只想先用链接测试可选 `Hidden`。
4. 选择发布市场。
5. 填写属性、隐私说明、商店介绍和分类。
6. 上传图标、屏幕截图和宣传图。
7. 在认证测试备注中说明如何登录 X、查看名单、执行一个测试账号，以及扩展为什么需要 `storage`、`scripting` 和 `x.com` 权限。
8. 提交审核。Microsoft 官方提示认证可能需要最长 7 个工作日。

官方上架流程：<https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension>

## 6. Firefox Add-ons 上架

### 账号和签名

1. 使用 Mozilla/Firefox 账号登录 [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/)。
2. 选择提交新附加组件，发布方式选公开列出（On this site / Listed）。
3. Firefox 正式版安装的扩展必须经过 Mozilla 签名；即使选择自行分发，也需要先上传 AMO 获取签名。

官方说明：<https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/>

### 提交步骤

1. 上传 `extension/dist/quguangou-firefox-v0.2.13.zip`。
2. 选择平台，建议首版只选 Firefox Desktop，暂不声称支持 Android。
3. 填写中文名称、摘要、详细介绍、分类、支持链接和隐私政策链接。
4. 数据收集选择“不收集或传输数据”，必须与 Manifest 里的 `required: ["none"]` 一致。
5. 填写审核测试步骤。如功能需要账号，Mozilla 政策要求提供可供审核的测试方法或测试凭据；不要在公开文档中写入密码。
6. 本项目不压缩、不混淆、不使用打包器生成业务代码，通常不需要额外源码包。如 AMO 页面仍要求源码，则上传完整的 `extension` 目录，并附上本文档中的打包命令。
7. 提交验证和审核。官方说明自动签名可能很快，一般提交也可能需要 24 小时，如被抽中人工审核则可能更久。

官方提交流程：<https://extensionworkshop.com/documentation/publish/submitting-an-add-on/>
官方审核政策：<https://extensionworkshop.com/documentation/publish/add-on-policies/>

## 7. 两个市场共用的上架资料

项目已有可复用资料：

- 商店介绍：`webstore/商店介绍.md`
- 权限与隐私说明：`webstore/隐私与权限填写.md`
- 审核备注：`webstore/审核备注.md`
- 隐私政策：`webstore/privacy-policy.html`
- 屏幕截图：`webstore/screenshot-template-1280x800.png`
- 宣传图：`webstore/promo-440x280.png`
- 应用图标：`extension/assets/icon-128.png`

上架前需要检查：

- 把资料中所有“Chrome”专属表述替换成对应的“Microsoft Edge”或“Firefox”。
- 屏幕截图中不要出现另一家浏览器的品牌、地址栏或商店页面。
- 对扩展的功能、权限、风险和不收集数据的说明必须与实际代码一致。
- 隐私政策使用可公开访问的 HTTPS 网址，建议继续使用：`https://711stoner.github.io/quguangou/privacy.html`。

## 8. 建议的审核备注

可在 Edge 和 Firefox 的审核备注中使用下面这段，再按实际测试账号调整：

> 取关狗只在用户主动点击“一键拉黑全部账号”后运行。扩展会创建一个非活动标签页，依次打开内置名单中的 X 用户页面，找到页面的拉黑菜单并点击确认。`storage` 只用于在本地保存任务进度与结果；`scripting` 只用于在 `x.com` 用户页面识别并操作相关控件。扩展没有开发者服务器、分析工具或广告组件，不会把用户数据传输到浏览器外部。审核时请先在当前浏览器登录 X，再打开扩展弹窗测试。

## 9. 上架风险

这个扩展的主要风险不是浏览器兼容性，而是市场审核和 X 平台规则：

- 扩展会自动操作 X 页面，审核人员可能询问自动化的用户控制、速率限制和单一用途。
- 应保留现有的用户主动确认、随时停止、遇错暂停、每批上限和冷却机制，并在审核备注中如实说明。
- X 网页结构变动可能导致选择器失效；每次提交新版前都应在两个浏览器上重做小规模测试。
- 不能保证两个市场一定通过审核；若被拒，根据具体审核意见修改，不要为了绕过审核而隐瞒功能。

## 10. 后续更新流程

1. 同时更新 `extension/manifest.json`、`extension/package.json`、`extension/manifests/edge.json` 和 `extension/manifests/firefox.json` 的版本号。
2. 更新名单或代码。
3. 运行 `npm test` 和 `npm run build`。
4. 分别在 Edge 和 Firefox 完成小规模实测。
5. 将 Edge ZIP 上传 Partner Center，将 Firefox ZIP 上传 AMO Developer Hub。
6. 审核通过后，再把官网文案从“其他浏览器上架中”改为对应的商店安装链接。

## 11. 官方参考

- Edge 移植指南：<https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension>
- Edge 开发者注册：<https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account>
- Edge 上架流程：<https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension>
- Edge 开发者政策：<https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies>
- Firefox MV3 后台脚本：<https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background>
- Firefox 打包与 `web-ext`：<https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/>
- Firefox 签名与分发：<https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/>
- Firefox 上架流程：<https://extensionworkshop.com/documentation/publish/submitting-an-add-on/>
- Firefox 扩展政策：<https://extensionworkshop.com/documentation/publish/add-on-policies/>
