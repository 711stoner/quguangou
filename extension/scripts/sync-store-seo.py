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
locales=('zh_CN','zh_TW','zh_HK','en','ja','ko','fr','es','ms','vi','id')
assert set(entries)==set(locales),'Store locales mismatch'
assert entries['zh_HK']==entries['zh_TW'],'Traditional Chinese regional listing must stay aligned'
for locale in locales:
 e=entries[locale]
 title=e['title'].strip();short=e['short'].strip();long=e['long'].strip()
 terms=e['edge_search_terms']
 assert 5<=len(title)<=75,(locale,'title',len(title))
 assert 20<=len(short)<=132,(locale,'short description',len(short))
 assert 250<=len(long)<=10000,(locale,'Edge description',len(long))
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
 '> 当前源码版本：v0.2.74。11 份项目地区配置（Chrome 官方实际支持的 locale 为其中 10 种，另有一份 zh_HK 兼容资源），10 种可选界面语言。zh_TW / zh_HK 使用同一套繁体内容。',
 '> **只使用本文件上架，不要复制历史 v0.2.25、v0.2.63、v0.2.67 等旧文案。**',
 '',
 '## 发布与 SEO 规则',
 '',
 '- 一个插件 ID，每个浏览器按官方支持的语言完善同一个 listing，不创建独立语言商品。',
 '- **香港繁体兼容说明：** Chrome 官方扩展 locale 列表有 `zh_CN`、`zh_TW`，没有独立的 `zh_HK`。当前项目仍保留 `zh_HK` 地区文案与资源供兼容及核对，但香港用户的界面使用 `zh-TW` 繁体；Chrome 商店上传请使用 `zh_TW` 的繁体 Listing，不要将 `zh_HK` 作为第 11 个可独立选择的 Chrome 商店语言。Edge 和 Firefox 以各自开发者后台实际可选语言为准。',
 '- **商店标题不是界面语言开关：** 浏览器中切换插件界面不会自动更新扩展管理页或商店的 Listing 标题。中文／英文地区的商店标题、摘要、完整介绍和图片必须在浏览器商店后台分别核对；仅打包 ZIP 或切换界面并不能保证搜索结果同步更新。',
 '- **重新上传版本号：** 三个浏览器的发布 ZIP 始终只保留固定文件名，但代码／manifest 更新后，若商店已发布版本号 ≥ 当前包的 `manifest.version`，下次上架必须先提高包内版本号，再覆盖这三个固定文件并提交审核；否则 Chrome 商店会拒绝上传。不要为了修复文案创建新的商店商品或新的 ZIP 名称。',
 '- 本文件的标题和简短介绍已写入 `_locales/<locale>/messages.json`，构建 ZIP 时包含；详细介绍和 Edge 搜索词仍需到开发者后台逐语言填写，**不会因为上传 ZIP 自动填好**。',
 '- SEO 重点是「X / Twitter + 谁没有回关 / follow back / non-followers + 真实功能」。自然表述而非重复关键词；不要宣称可查谁刚刚取关、过去退关历史、100% 成功或 X 官方授权。',
 '- Edge 每个语言最多 7 条搜索词，每条不超过 30 字符，合计不超过 21 个词；以下均经过校验。Edge 的完整介绍 250–10000 字符。',
 '- Firefox AMO 可本地化名称、摘要和介绍；摘要建议尽量精炼，最多 250 字符；**Firefox 页面只有一组共用截图**，不应声称会按语言自动切换截图。',
 '- Chrome Web Store 禁止关键词堆砌。已有图片若不是当前界面，必须在上传前核对截图与实际功能是否一致。',
 '',
 '参考：',
 '- Chrome 官方扩展 locale：https://developer.chrome.com/docs/extensions/reference/api/i18n',
 '- Chrome 版本更新：https://developer.chrome.com/docs/webstore/update',
 '- Chrome：https://developer.chrome.com/docs/webstore/program-policies/listing-requirements',
 '- Edge：https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension',
 '- Firefox：https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/',
 '',
]
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
  '# 当前最新版商店资料（v0.2.74）',
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
   header='> ⚠️ 旧版历史文案，不可用于当前上架。请改用 `上架资料/取关狗-全语言SEO上架文案.md`（v0.2.74、11 个地区配置）。\n\n'
   if not data.startswith(header) and not data.startswith('> ⚠️ 旧版历史文案'):
    old.write_text(header+data)
 print('SEO: release guide and stale current-listing templates updated')
else:
 print('SEO: release drive unavailable; updated desktop files only')
