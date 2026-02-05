# Live2D 模型动作切换模式

本文档描述当前前端中 Live2D（L2D）模型的**动作（Motion）与表情（Expression）切换**机制，包括情绪映射、触发时机与底层 API。

---

## 1. 概览

动作切换由以下部分组成：

| 模块 | 职责 |
|------|------|
| **情绪→动作/表情映射** | `useLive2D.ts` 中的 `emotionMotionMap`、`emotionExpressionMap` |
| **触发入口** | 助手消息到达、画布点击、空闲定时循环 |
| **底层调用** | `pixi-live2d-display` 的 `model.motion(group, index)`、`model.expression(name)` |

当前使用的 **live2d** 模型在 `model.json` 的 `motions` 中以**名称**为 key（如 `smile01`、`angry01`、`idle01`），每组通常只有一个动作，因此统一使用 `model.motion(groupName, 0)` 播放。

---

## 2. 情绪 → 动作映射（emotionMotionMap）

文件：`src/hooks/useLive2D.ts`

情绪到「动作组名列表」的映射（每组名对应 model.json 中 motions 的一个 key，索引固定为 0）：

```ts
const emotionMotionMap: Record<string, { groups: string[] }> = {
  happy:    { groups: ['smile01', 'smile02', 'smile03', 'smile04'] },
  sad:      { groups: ['sad01', 'sad02'] },
  angry:    { groups: ['angry01', 'angry02', 'angry03', 'angry04'] },
  surprised:{ groups: ['surprised01'] },
  thinking: { groups: ['thinking01', 'thinking02', 'thinking03'] },
  idle:     { groups: ['idle01'] },
  shame:    { groups: ['shame01', 'shame02'] },
  cry:      { groups: ['cry01', 'cry02'] },
};
```

- 播放时从对应 `groups` 中**随机选一个**组名，再调用 `model.motion(groupName, 0)`。
- 未在 map 中声明的情绪会回退到 **`idle`**（`emotionMotionMap.idle`）。

---

## 3. 情绪 → 表情映射（emotionExpressionMap）

同一文件中，情绪到 Live2D **表情名称**的映射（用于 `model.expression(...)`）：

```ts
const emotionExpressionMap: Record<string, string> = {
  happy:    'smile01',
  sad:      'sad01',
  angry:    'angry01',
  surprised:'surprised01',
  thinking: 'thinking01',
  idle:     'idle01',
  shame:    'shame01',
  cry:      'cry01',
  neutral:  'default',  // 中立，用于唇形测试（新模型用 default）
};
```

- 开关 **`USE_NEUTRAL_EXPRESSION_FOR_TEST`**（默认 `true`）：为 `true` 时播放动作强制使用 **`default`** 表情便于观察嘴部；设为 `false` 则按上表按情绪切换表情。

---

## 4. 动作切换的三种触发方式

### 4.1 助手消息到达（按情绪切换）

**位置**：`src/components/Live2DCanvas/Live2DCanvas.tsx`

- 监听 `chatStore` 的 `messages`。
- 当**最后一条消息**为 `role === 'assistant'` 且带有 `emotion` 时：
  - 若该 `emotion` 与上一次记录的 `lastEmotionRef.current` **不同**，则：
    - 更新 `lastEmotionRef.current = emotion`
    - 调用 `controller.playEmotion(emotion)`

即：**每来一条带新情绪的助手消息，就会触发一次「按情绪」的动作+表情切换**；同一情绪不重复触发。

**数据流**：WebSocket 消息 `message.emotion` → `useWebSocket` 写入 `chatStore.messages` → `Live2DCanvas` 的 `useEffect` 读到最新消息 → `controller.playEmotion(emotion)`。

### 4.2 画布点击（随机动作）

**位置**：`src/hooks/useLive2D.ts`，在 `initialize` 里对 canvas 绑定 `click` 事件。

- 用户**点击 Live2D 画布**时，从 `CLICK_RANDOM_MOTIONS`（如 `smile01`、`smile02`、`thinking01`、`wink01`、`bye01` 等）中随机选一个组名，执行 `model.motion(groupName, 0)`。

### 4.3 空闲循环（定时待机动作）

**位置**：`src/hooks/useLive2D.ts`，`startIdleAnimation`。

- 模型加载约 **1 秒后**会调用 `startIdleAnimation()`。
- 内部使用 `setInterval(..., 15000)`，每 **15 秒**执行一次：
  - `model.motion('idle01', 0)`
- 即播放 **idle01** 待机动作（live2d 模型单组单动作）。
- 若 `model.internalModel?.motionManager` 不可用会 catch 并只打 warning，不抛错。

---

## 5. 对外 API（Live2DController）

由 `useLive2D` 通过 `controller` 暴露给 `Live2DCanvas` 等调用方：

| 方法 | 说明 |
|------|------|
| `playEmotion(emotion: string)` | 按情绪播放：从 `emotionMotionMap` 取 `groups` 列表，随机一个组名调用 `model.motion(groupName, 0)`，再按 `emotionExpressionMap`（或测试开关）设置 `model.expression(...)` |
| `playMotion(group: string, index: number)` | 直接播放指定动作组：`model.motion(group, index)`（新模型通常 index 为 0） |
| `setExpression(expression: string)` | 仅设置表情：`model.expression(expression)` |
| `setLipSync(value: number)` | 设置唇形同步嘴部开合（0–1），与动作切换独立，见 [Live2D-LipSync.md](./Live2D-LipSync.md) |
| `startIdleAnimation()` | 开启 15 秒一次的空闲动作定时器（播放 `idle01`） |
| `stopIdleAnimation()` | 清除空闲动作定时器（如卸载时） |

---

## 6. 底层调用关系小结

- **动作**：统一通过 `model.motion(groupName, index)`。live2d 模型下 `groupName` 为 model.json 中 `motions` 的 key（如 `smile01`、`idle01`），`index` 通常为 `0`。
- **表情**：通过 `model.expression(expressionName)`，名称来自 `emotionExpressionMap` 或测试用的 `default`。
- 动作与表情可同时生效：先 `motion` 再 `expression`，表情会叠加在动作之上（具体视觉效果取决于模型配置）。

---

## 7. 相关文件索引

| 文件 | 说明 |
|------|------|
| `src/hooks/useLive2D.ts` | 情绪→动作/表情映射、`playEmotion` / `playMotion`、画布点击、空闲定时、唇形参数 |
| `src/components/Live2DCanvas/Live2DCanvas.tsx` | 监听 messages、在助手消息带新 emotion 时调用 `playEmotion`；唇形 rAF 循环 |
| `src/stores/chatStore.ts` | `ChatMessage` 类型含 `emotion?: string` |
| `src/hooks/useWebSocket.ts` | 将后端消息的 `emotion` 写入 `chatStore.messages` |
| `src/utils/websocket.ts` | 消息类型定义中的 `emotion` 字段 |

---

## 8. 小结表

| 触发场景 | 动作组 | 索引 | 表情 |
|----------|--------|------|------|
| 助手消息 + emotion | 从 `emotionMotionMap[emotion].groups` 随机 | 0 | 测试模式固定 `default`，否则 `emotionExpressionMap[emotion]` |
| 画布点击 | 从 `CLICK_RANDOM_MOTIONS` 随机（如 smile01、thinking01） | 0 | 不单独改 |
| 空闲 15 秒 | `idle01` | 0 | 不单独改 |

整体上，**动作切换模式**是「情绪驱动 + 点击互动 + 定时待机」的组合；情绪来源于**每条助手消息的 `emotion` 字段**，与后端/WebSocket 协议一致即可扩展新情绪或新动作组名。
