# Chat Anon Frontend

一个与 Live2D 角色实时聊天的前端应用，支持文字和语音交互。

## 功能特性

- **文字聊天**: 实时文字对话
- **语音交互**: 支持三种语音模式
  - 按住说话 (Push-to-talk)
  - 流式语音 (Streaming)
  - Agent 模式 (持续监听)
- **Live2D 模型**: 实时渲染，情感驱动动画，口型同步
- **处理状态**: 可视化 ASR → LLM → TTS 处理流程
- **主题切换**: 支持深色/浅色主题

## 技术栈

- React 18 + TypeScript
- Vite
- Tailwind CSS
- PixiJS + pixi-live2d-display
- Zustand
- Web Audio API

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 设置 Live2D 模型

将 Live2D 模型放在 `public/live2d/` 下，按**角色 + 模型套**组织；每套模型一个子目录，内含 `model.json` 和 `data/` 素材。

目录结构：

```
public/
└── live2d/
    ├── anon/                      # 角色名
    │   ├── casual-2023/            # 模型套（默认）
    │   │   ├── model.json          # 入口
    │   │   └── data/
    │   │       ├── model.moc
    │   │       ├── physics.json
    │   │       ├── textures/
    │   │       ├── motions/
    │   │       └── expressions/
    │   └── ...                    # 可放多套，如 other-2023
    └── mutsumi/
        ├── school_winter-2023/     # 默认模型套
        │   ├── model.json
        │   └── data/
        │       └── ...
        └── ...
```

- **路径规则**：前端加载 `/live2d/{角色名}/{模型套名}/model.json`。`model.json` 内使用相对路径（如 `data/model.moc`），由加载器自动解析。
- **角色默认模型套**：后端 `GET /characters` 可返回每角色的 `live2d_model_set`（如 anon → `casual-2023`，mutsumi → `school_summer-2023`）；未配置时前端使用内置默认映射。
- **回退**：若某角色对应路径加载失败（例如 mutsumi 未放置），会回退到 anon 的默认模型套。

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

**HTTPS 开发**：若需使用证书启动 HTTPS，可运行 `./dev-https.sh`（首次使用请执行 `chmod +x dev-https.sh`）。修改脚本顶部的 `CERT_DIR` 可更换证书目录（默认 `/etc/letsencrypt/live/anontokyo.ltd`）。

### 4. 连接后端

1. 确保后端服务运行在 `ws://localhost:8765/ws`
2. 点击设置按钮，输入 API Token
3. 点击"连接"按钮

## 使用说明

### 文字聊天

1. 在输入框输入消息
2. 按 Enter 或点击发送按钮

### 语音交互

- **按住说话**: 按住麦克风按钮，说话后松开
- **流式模式**: 点击"流式"按钮开始/停止
- **Agent 模式**: 点击"Agent"按钮，持续监听，自动检测语音

### 快捷操作

- **清除历史**: 点击垃圾桶图标
- **切换角色**: 点击角色选择器
- **主题切换**: 点击太阳/月亮图标

## 项目结构

```
src/
├── components/
│   ├── ChatPanel/         # 聊天面板
│   ├── CharacterSelector/ # 角色选择器
│   ├── Header/            # 顶部导航
│   ├── Live2DCanvas/      # Live2D 渲染
│   ├── StatusIndicator/   # 状态指示器
│   └── VoiceControls/     # 语音控制
├── hooks/
│   ├── useWebSocket.ts    # WebSocket 连接
│   ├── useAudioRecorder.ts # 音频录制
│   ├── useAudioPlayer.ts  # 音频播放
│   └── useLive2D.ts       # Live2D 控制
├── stores/
│   └── chatStore.ts       # 全局状态
├── utils/
│   ├── audio.ts           # 音频处理
│   ├── websocket.ts       # 消息类型
│   └── cn.ts              # 样式工具
└── App.tsx
```

## 构建

```bash
npm run build
```

构建产物在 `dist/` 目录。

## 注意事项

- 语音功能需要浏览器授予麦克风权限
- Live2D 模型需放在 `public/live2d/{角色}/{模型套}/`，详见上文目录结构
- 确保后端服务正常运行
- 推荐使用 Chrome 或 Edge 浏览器

## License

MIT
