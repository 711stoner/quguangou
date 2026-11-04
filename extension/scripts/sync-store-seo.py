#!/usr/bin/env python3
"""Synchronize native-language store titles/summaries and generate one SEO upload guide.

The desktop project's 商店SEO文案.json is the single source of truth.
Don't create new versioned folders or ZIPs; scripts/build.py overwrites fixed packages.
"""
import json
from pathlib import Path
root=Path(__file__).resolve().parent.parent
source=root/'商店SEO文案.json'
entries=json.loads(source.read_text())
native_brands=json.loads((root/'本地化产品名称.json').read_text())
current_version=json.loads((root/'manifest.json').read_text())['version']
locales=('zh_CN','zh_TW','zh_HK','en','ja','ko','fr','es','ms','vi','id')
assert set(entries)==set(locales),'Store locales mismatch'
assert entries['zh_HK']==entries['zh_TW'],'Traditional Chinese regional listing must stay aligned'
for locale in locales:
 e=entries[locale]
 title=e['title'].strip();short=e['short'].strip();long=e['long'].strip()
 if locale in native_brands:
  assert native_brands[locale]['name'] in title,(locale,'native brand name absent')
  assert title==native_brands[locale]['title'],(locale,'title differs from native-language source')
  assert 'Followback Watchdog' not in title and 'Followback Watchdog' not in long,(locale,'English brand leaked')
  assert '取关狗' not in title and '取关狗' not in long,(locale,'Chinese brand leaked')
 terms=e['edge_search_terms']
 assert 5<=len(title)<=45,(locale,'cross-store name limit (Edge/AMO ≤45)',len(title))
 assert 20<=len(short)<=132,(locale,'short description',len(short))
 assert 250<=len(long)<=10000,(locale,'Edge description',len(long))
 assert len(short)<=250,(locale,'Firefox AMO listing summary >250',len(short))
 assert 1<=len(terms)<=7 and len(set(terms))==len(terms),(locale,'Edge search terms')
 assert all(1<=len(t)<=30 for t in terms),(locale,'search term >30 chars')
 assert sum(len(t.split()) for t in terms)<=21,(locale,'>21 words across Edge terms')
 assert all('\n' not in t for t in terms)
 p=root/'_locales'/locale/'messages.json'
 m=json.loads(p.read_text())
 for key in ('extensionName','extensionNameChrome','extensionNameEdge'):
  assert key in m,(locale,key)
  m[key]['message']=title
 for key in ('extensionDescription','extensionDescriptionChrome'):
  assert key in m,(locale,key)
  m[key]['message']=short
 # Keep extensionShortName / existing translations untouched.
 updated=json.dumps(m,ensure_ascii=False,indent=2)+'\n'
 if p.read_text()!=updated:p.write_text(updated)
print('SEO: manifest metadata synced for',len(locales),'store/region locales')

notes=[
 '# 取关狗｜全语言商店 SEO 上架文案（当前唯一版本）',
 '',
 f'> 当前源码版本：v{current_version}。11 份项目地区配置（Chrome 官方实际支持的 locale 为其中 10 种，另有一份 zh_HK 兼容资源），10 种可选界面语言。zh_TW / zh_HK 使用同一套繁体内容。',
 '> **只使用本文件上架，不要复制历史 v0.2.25、v0.2.63、v0.2.67 等旧文案。**',
 '',
 '## 发布与 SEO 规则',
 '',
 '- 一个插件 ID，每个浏览器按官方支持的语言完善同一个 listing，不创建独立语言商品。',
 '- **Chrome 上架顺序（请勿误操作）：** 只向既有商品 `ahpjikfghfgekmjcomhcmknlkicloblf` 上传 **一次** `quguangou-chrome.zip`（v0.2.75，包含 10 个有效 Chrome locale）。不要为十种语言上传十次不同 ZIP；同一商品后续上传包会替换之前的待发布代码，也不要创建十个新商品 ID。',
 '- **十种语言逐项上传的是 Store listing 资料，不是十份安装包：** 后台选 `zh_CN`、`zh_TW`、`en`、`ja`、`ko`、`fr`、`es`、`ms`、`vi`、`id`，分别填对应的完整介绍与当地语言截图；商品标题、短摘要来自 ZIP 里的 `_locales/*/messages.json`。`zh_HK` 仅本地兼容，不是 Chrome 独立语言。',
 '- **容易遗漏的全球图片回退：** Chrome 官方显示顺序是本地化视频／本地化截图，然后是全球视频／全球截图；如“Global screenshots”残留中文截图，其他语言用户仍可能在后面看到中文图片。检查并清理非中立的全球图片；不可通过上传每种语言截图自动移除旧全局图片。Small/Marquee 宣传图不能按语言本地化，应使用无中文文字的中立素材。',
 '- **本轮全球宣传图已改成无文字：** 由于 Chrome 的 440×280 和 1400×560 宣传图不能按语言分别配置，已将七种外语原素材、简体及繁体原素材中的对应图片统一替换为同一份无文字、无语言的插件图形设计；后台仍须检查是否有之前已上传的中文／英文 Global screenshots。',
 '- **本轮已重制七种外语商店截图：** 日语、韩语、法语、西班牙语、马来语、越南语、印尼语各 5 张图片，均已用 v0.2.75 的真实插件界面重拍并覆盖原 Chrome／Edge／Firefox 素材（共 105 份截图文件）。旧图片中的英文品牌和“英文网站”提示不再沿用；文件夹虽然保留 v0.2.68／v0.2.70 的历史目录名，里面的五张截图是新内容。经尺寸、逐语一致性及部分视觉抽样核验；简体／繁体／英文旧图尚未在本轮整体重制。',
 '- **安装后的语言例外：** 插件初次运行按浏览器 UI 语言选择界面；如果用户曾手动选语言并保存，`quguangouUILanguageV1` 优先于浏览器语言。Chrome 商店并不知道搜索框所用语言，插件也无法在安装时读取用户的商店搜索关键词，因此不能保证“在英文商店输入中文关键词后，插件自动成为中文”。',

 f'- **线上发布差异（2026-11-04 核查）**：当前 Chrome 商店插件 `ahpjikfghfgekmjcomhcmknlkicloblf` 仍为 **v0.2.63**，而本地当前唯一安装包是 **v{current_version}**。修改本地 ZIP 或 GitHub 不会直接更新线上商店；必须在已有商品中提交新版本，审核发布后重新做线上逐语言验证，不能提前声称线上修复。',
 '- **香港繁体兼容说明：** Chrome 官方扩展 locale 列表有 `zh_CN`、`zh_TW`，没有独立的 `zh_HK`。当前项目仍保留 `zh_HK` 地区文案与资源供兼容及核对，但香港用户的界面使用 `zh-TW` 繁体；Chrome 商店上传请使用 `zh_TW` 的繁体 Listing，不要将 `zh_HK` 作为第 11 个可独立选择的 Chrome 商店语言。Edge 和 Firefox 以各自开发者后台实际可选语言为准。',
 '- **Chrome 商店搜索词不决定展示语言。** 2026-11-04 线上实测：使用 `?hl=zh-CN` 打开同一商店页时显示简体中文，`?hl=en` 则显示英文；已发布 v0.2.63 的繁体中文、日语等其他语言均回退到简体中文。输入「取关狗」搜索不能强制将英文版搜索结果切为中文。要给不同语言用户提供可靠入口，使用下方各语言官方商店链接的 `?hl=` 参数，并在平台商店后台完成各自语言的 Listing（非浏览器设置）。',
 '- **商店标题不是界面语言开关：** 浏览器中切换插件界面不会自动更新扩展管理页或商店的 Listing 标题。中文／英文地区的商店标题、摘要、完整介绍和图片必须在浏览器商店后台分别核对；仅打包 ZIP 或切换界面并不能保证搜索结果同步更新。',
 '- **重新上传版本号：** 三个浏览器的发布 ZIP 始终只保留固定文件名，但代码／manifest 更新后，若商店已发布版本号 ≥ 当前包的 `manifest.version`，下次上架必须先提高包内版本号，再覆盖这三个固定文件并提交审核；否则 Chrome 商店会拒绝上传。不要为了修复文案创建新的商店商品或新的 ZIP 名称。',
 '- 本文件的标题和简短介绍已写入 `_locales/<locale>/messages.json`，构建 ZIP 时包含；详细介绍和 Edge 搜索词仍需到开发者后台逐语言填写，**不会因为上传 ZIP 自动填好**。',
 '- SEO 重点是「X / Twitter + 谁没有回关 / follow back / non-followers + 真实功能」。自然表述而非重复关键词；不要宣称可查谁刚刚取关、过去退关历史、100% 成功或 X 官方授权。',
 '- **标题长度（官方 2026-11-04 复核）：** Chrome Web Store ≤75 字符；Microsoft Edge Add-ons、Firefox AMO ≤45 字符。同一份本地化标题在三端通用，因此取更严格的 ≤45，不能把 Chrome 的 75 当成三端通用限制。',
 '- **短摘要：** Chrome manifest description ≤132 字符；Firefox AMO 上架页面的独立 Summary ≤250 字符。这里实际共用一份 ≤132 的摘要，所以两者都满足。',
 '- **详细介绍：** Edge 每个上架语言的完整版介绍必须是 **250–10,000 字符**；Chrome 要求自然准确、不可关键词堆砌；Firefox AMO 完整描述没有同样的 10,000 字符上限。三端完整介绍必须在商店后台填写，ZIP 不自动提交。',
 '- **Edge 搜索词：** 每个语言最多 7 条，每条不超过 30 字符，合计不超过 21 个词；以下均经过校验。这是 Edge 的独立 SEO 字段，不能复制到 Chrome 作为关键词堆砌。',
 '- **截图与素材：** Chrome 每个上架语言建议 1–5 张截图，1280×800 或 640×400；Edge 每种语言需上传扩展 Logo，详细介绍必填，截图可选（最多 6 张，1280×800 或 640×480），440×280 小型宣传图片与 1400×560 大型宣传图可选。Firefox AMO 页面只允许一组共用截图，可分别本地化截图描述，不会切换独立语言截图集。历史图片不是新版本画面验收。',
 '- **关键词与功能真实性：** 按用户真实搜索意图自然写入“谁没有回关／非互相关注／X 账号关系”。不能宣称能查到谁刚刚取关，不能把社区名单的拉黑能力说成可直接批量取关；不可把浏览器语言切换与商店 Listing 语言选择混同。',
 '- Firefox AMO 可本地化名称、摘要和介绍；摘要建议尽量精炼，最多 250 字符；**Firefox 页面只有一组共用截图**，不应声称会按语言自动切换截图。',
 '- Chrome Web Store 禁止关键词堆砌。已有图片若不是当前界面，必须在上传前核对截图与实际功能是否一致。',
 '',
 '参考：',
 '- Chrome 官方扩展 locale：https://developer.chrome.com/docs/extensions/reference/api/i18n',
 '- Chrome 版本更新：https://developer.chrome.com/docs/webstore/update',
 '- Chrome：https://developer.chrome.com/docs/webstore/program-policies/listing-requirements',
 '- Edge：https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension',
 '- Firefox：https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/',
 '- Firefox AMO 45 字符与 Chrome/Edge 名称上限：https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/name',
 '- Chrome 截图与摘要：https://developer.chrome.com/docs/webstore/best-listing',
 '',
]
# Explicit language-specific CWS entry points are the only link-level
# localization control we can offer. Search terms never set the listing locale.
notes.extend(['## Chrome 商店多语言直达链接（无须修改浏览器设置）','',
 '以下链接都指向同一个插件 ID；不会新增商品。可用于官网/SEO 落地页。**仅确保商店界面选择对应语言，不代表该语言的 Listing 已经发布，未发布会回退。**',''])
for lc,tag in [('简体中文','zh-CN'),('繁體中文','zh-TW'),('English','en'),('日本語','ja'),('한국어','ko'),('Français','fr'),('Español','es'),('Bahasa Melayu','ms'),('Tiếng Việt','vi'),('Bahasa Indonesia','id')]:
 notes.append(f'- {lc}：https://chromewebstore.google.com/detail/ahpjikfghfgekmjcomhcmknlkicloblf?hl={tag}')
# Runtime source audit table. This is factual, not a claim that the public
# storefront has accepted every language listing or screenshot.
notes.extend(['', '## 三端官方规则与本地 SEO 长度核对（2026-11-04）', '',
 '| 地区 | 标题长度（≤45） | 短摘要（≤132） | 完整介绍（Edge 250–10000） | Edge 搜索词数（≤7） | Edge 总词数（≤21） |',
 '|---|---:|---:|---:|---:|---:|'])
for locale in locales:
 e=entries[locale]
 notes.append(f"| `{locale}` | {len(e['title'])} | {len(e['short'])} | {len(e['long'])} | {len(e['edge_search_terms'])} | {sum(len(t.split()) for t in e['edge_search_terms'])} |")
notes.extend(['', '这些是**本地源码的静态校验结果**。Firefox `zh_HK` 是兼容地区资料，Chrome/Edge 实际上传包没有独立 `zh_HK`，由 `zh_TW` 承担繁体。',
 '本地字数、关键词合规不代表审核已通过或搜索排名有保障；需上传新版、在各商店完成对应语言 Listing 和实际截图验收。', ''])
notes.extend(['','---',''])
locale_names={'zh_CN':'简体中文','zh_TW':'繁體中文（台灣）','zh_HK':'繁體中文（香港兼容資料／非獨立 Chrome 商店語言）','en':'English','ja':'日本語','ko':'한국어','fr':'Français','es':'Español','ms':'Bahasa Melayu','vi':'Tiếng Việt','id':'Bahasa Indonesia'}
for locale in locales:
 e=entries[locale]
 notes.extend([
  f'## {locale_names[locale]} — {locale}',
  '',
  '**Chrome / Edge / Firefox 标题**',
  '',
  e['title'],
  '',
  '**Chrome 简介／Edge 简短介绍／Firefox 摘要**',
  '',
  e['short'],
  '',
  '**Chrome、Edge、Firefox 完整介绍（手动填入商店后台）**',
  '',
  e['long'],
  '',
  '**Edge 搜索词（逐条填写）**',
  '',
  '；'.join(e['edge_search_terms']),
  '',
  '---',
  '',
 ])
md='\n'.join(notes).rstrip()+'\n'
out=root/'商店SEO上架文案.md'
if not out.exists() or out.read_text()!=md:out.write_text(md)
print('SEO: written current store listing guide',out)

# The release drive is optional; publishing metadata there doesn't affect packages.
release_root=Path('/Volumes/15055751248/vibe的脚本/04-发布包/取关狗')
if release_root.is_dir():
 from shutil import copyfile
 dest=release_root/'上架资料'
 dest.mkdir(exist_ok=True)
 for file,name in ((out,'取关狗-全语言SEO上架文案.md'),(source,'取关狗-全语言SEO上架文案.json')):
  if not (dest/name).exists() or (dest/name).read_bytes()!=file.read_bytes():copyfile(file,dest/name)
 chinese=entries['zh_CN'];formatted='\n\n'.join([
  f'# 当前最新版商店资料（v{current_version}）',
  '**其他语言及三浏览器的完整文案请见：`取关狗-全语言SEO上架文案.md`。不要使用旧版“不能扫描粉丝”的文案。**',
  '## 标题\n'+chinese['title'],
  '## 简短说明\n'+chinese['short'],
  '## 详细介绍\n'+chinese['long'],
 ])+'\n'
 for rel in ('Chrome商店介绍.md','Edge商店中文资料.md'):
  f=dest/rel
  if not f.exists() or f.read_text()!=formatted:f.write_text(formatted)
 edge_search='\n\n## Edge 搜索词\n'+'；'.join(chinese['edge_search_terms'])+'\n'
 p=dest/'Edge商店中文资料.md';p.write_text(formatted+edge_search)
 # One additional existing top-level copy was still a stale 2026-09 guide.
 old=release_root/'Edge商店中文资料.md'
 if old.is_file():old.write_text(formatted+edge_search)
 for legacy in ('Chrome商店七语言Listing-v0.2.67-待提交.md','商店三语标题与搜索配置-2026-11-01.md'):
  old=release_root/legacy
  if old.is_file():
   data=old.read_text()
   header=f'> ⚠️ 旧版历史文案，不可用于当前上架。请改用 `上架资料/取关狗-全语言SEO上架文案.md`（v{current_version}、11 个地区配置）。\n\n'
   if not data.startswith(header) and not data.startswith('> ⚠️ 旧版历史文案'):
    old.write_text(header+data)
 print('SEO: release guide and stale current-listing templates updated')
else:
 print('SEO: release drive unavailable; updated desktop files only')
