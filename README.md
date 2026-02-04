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

将 Live2D 模型文件复制到 `public/live2d/` 目录：

```bash
# Windows
xcopy /E /I "D:\coding_ws\D_sakiko\live2d_related\anon\live2D_model" "public\live2d\live2D_model"

# 或者创建符号链接 (需要管理员权限)
mklink /D "public\live2d\live2D_model" "D:\coding_ws\D_sakiko\live2d_related\anon\live2D_model"
```

目录结构应该是：
```
public/
└── live2d/
    └── live2D_model/
        ├── 3.model.json
        ├── anon_casual-2023.moc
        ├── anon_casual-2023.physics.json
        ├── texture_00.png
        ├── texture_01.png
        └── ... (其他动作和表情文件)
```

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
- Live2D 模型需要正确放置在 `public/live2d/` 目录
- 确保后端服务正常运行
- 推荐使用 Chrome 或 Edge 浏览器

## License

MIT
