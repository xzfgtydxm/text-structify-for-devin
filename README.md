# Text Structify for Devin ✨

> **一键用 AI 整理输入框中的文字** — 专为 [Devin](https://devin.ai) 打造的 Chrome 浏览器扩展

在 Devin 中使用语音输入后，文字往往口语化、缺乏结构。点击输入框旁边的 **✨ 整理** 按钮，AI 会自动读取 Devin 的对话上下文，将零散的语音转写内容整理成清晰、结构化的指令，直接替换回输入框。

**适用场景：** 你在 Devin 中用语音输入了一段话，但转出来的文字乱糟糟的 → 点击 ✨ → 瞬间变成条理清晰的文字。

---

## 功能特性

- **🎙️ 不需要自带 STT** — 使用 Devin 网页自带的语音输入功能，本插件专注于后续文字整理
- **✨ 一键整理** — 在每个输入框旁自动注入 ✨ 整理按钮，点击即可将口语化文字变成结构化表达
- **🧠 上下文感知** — 自动读取 Devin 的回复内容和页面对话历史，辅助 AI 更精准地理解你在说什么
- **🔌 自定义 API 端点** — 支持任何 OpenAI 兼容的 API（OpenAI / DeepSeek / Groq / Ollama 等）
- **📋 多端点管理** — 配置多个 API 端点，随时切换
- **📝 提示词模板** — 内置 "默认整理"、"学术模式"、"会议纪要" 等多种模板，也支持自定义
- **⌨️ 快捷键支持** — 可在 `chrome://extensions/shortcuts` 自行配置快捷键
- **🔒 隐私安全** — 所有处理通过你自己的 API 完成，不收集任何数据

---

## 安装方法

### 从 Release 下载安装（推荐）

1. 前往 [Releases 页面](https://github.com/xzfgtydxm/text-structify-for-devin/releases) 下载最新版本的 `.zip` 文件
2. 解压下载的压缩包到一个固定目录
3. **编辑 `config.default.json`**，填入你的 API Key（见下方说明）
4. 打开 Chrome 浏览器，地址栏输入 `chrome://extensions/`
5. 开启右上角的 **开发者模式**
6. 点击 **加载已解压的扩展程序**，选择解压后的目录
7. 完成！插件会自动读取你的配置，开箱即用

### 从源码安装

```bash
git clone https://github.com/xzfgtydxm/text-structify-for-devin.git
```

然后按照上述步骤 3-7 操作，在第 6 步选择克隆下来的项目目录即可。

---

## 配置文件（开箱即用）

插件目录下有一个 `config.default.json` 文件，安装前编辑它即可预配置 API 端点：

```json
{
  "endpoints": [
    {
      "name": "OpenAI",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-你的密钥"
    },
    {
      "name": "DeepSeek",
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": ""
    }
  ],
  "activeEndpoint": "OpenAI",
  "model": "gpt-4o"
}
```

| 字段 | 说明 |
|------|------|
| `endpoints` | API 端点列表，每个包含 `name`、`baseUrl`、`apiKey` |
| `activeEndpoint` | 默认使用的端点名称（对应 `name` 字段） |
| `model` | 默认使用的模型名（可选，留空则手动选择） |

> **提示：** 只需填好你常用的那个端点的 `apiKey`，安装后就能直接使用，无需在界面中手动配置。你也可以之后在插件弹出面板中随时修改。

---

## 使用方法

### 1. 配置 API

**方式 A（推荐）：** 安装前编辑 `config.default.json`，填入 API Key，加载后自动配置。

**方式 B：** 点击浏览器工具栏的 Text Structify for Devin 图标，在弹出面板中手动配置：

1. 添加你的 API 端点（Base URL + API Key）
2. 点击 🔄 按钮获取可用模型列表
3. 选择一个 LLM 模型

### 2. 整理文字

1. 在 Devin（或其他网页）的输入框中输入文字（手动输入或使用语音输入）
2. 点击输入框旁边自动出现的 **✨ 整理** 按钮（或使用自定义快捷键）
3. AI 自动整理，整理后的文字直接替换回输入框

### 3. 高级设置（可选）

在插件弹出面板点击 **⚙️ 高级设置** 可以：

- 管理提示词模板（新增 / 编辑 / 删除）

---

## 上下文感知

插件会自动读取页面上的对话上下文（最近 5 条消息），辅助 AI 理解你在说什么：

| 平台 | 支持情况 |
|------|---------|
| **Devin** | ✅ 读取 Devin 的回复内容（主要适配平台） |
| **ChatGPT** | ✅ 读取对话历史 |
| **Claude** | ✅ 读取对话历史 |
| **通用网页** | ✅ 自动检测聊天容器 |

---

## 支持的 API 端点

| 服务 | Base URL | 说明 |
|------|----------|------|
| OpenAI | `https://api.openai.com/v1` | GPT-4o 等 |
| DeepSeek | `https://api.deepseek.com/v1` | 国产模型 |
| Groq | `https://api.groq.com/openai/v1` | 免费额度，速度快 |
| Ollama | `http://localhost:11434/v1` | 本地模型，完全离线 |
| 其他 | 自定义 URL | 任何 OpenAI 兼容 API |

---

## 内置提示词模板

| 模板 | 说明 |
|------|------|
| **默认整理** | 通用文本整理，根据应用场景自动调整语气 |
| **学术模式** | 学术风格，正式用语，逻辑严谨 |
| **会议纪要** | 结构化输出：议题、要点、决定事项、待办 |

你也可以在高级设置中创建自定义模板。

---

## 项目结构

```
text-structify-for-devin/
├── config.default.json # 预配置文件（填入 API Key 即可开箱即用）
├── manifest.json       # Chrome 扩展清单文件 (Manifest V3)
├── background.js       # Service Worker - LLM API 调用
├── content.js          # Content Script - 页面注入 & 上下文提取
├── popup.html          # 弹出面板 UI
├── popup.js            # 弹出面板逻辑
├── config.html         # 高级设置页面
├── config.js           # 高级设置逻辑
├── styles.css          # 高级设置样式
├── icons/              # 扩展图标
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── icon.svg
├── LICENSE.md         # 许可证
└── README.md          # 本文件
```

---

## 技术细节

- **Manifest V3** — 使用最新的 Chrome 扩展标准
- **最低 Chrome 版本** — 116+
- **权限** — `activeTab`、`storage`、`scripting`
- **Slate 编辑器兼容** — 特别处理了 Slate 富文本编辑器的文本注入（通过 ClipboardEvent 模拟粘贴），避免 DOM 模型不一致的问题
- **无外部依赖** — 纯原生 JavaScript，无需构建工具

---

## 致谢

本项目基于 [AI-Dictation](https://github.com/peterkrueck/AI-Dictation) 开源项目改造，感谢原作者 Peter Krück。

## 许可证

[CC BY-NC 4.0](LICENSE.md) — 非商业用途可自由使用和修改，商业使用请联系原作者获取授权。
