# Sculpy 语音与聊天接口

正式客户端携带当前 Supabase 会话。语音服务核实用户身份并检查有效团队档案，聊天通过当前用户令牌读取获准的数据。

- `POST /functions/v1/sculpy-ai?action=transcribe` 接收 `multipart/form-data`，字段名为 `audio`，单段最多 5 MB。成功返回 `text`。缺少有效登录返回 401，账号停用返回 403。
- 历史演示专用的识别和搜索入口返回 410。正式询盘及沟通识别使用独立的 `sculpy-intake`。
- `POST /functions/v1/sculpy-chat` 使用当前账号读取或发送对话，旧演示请求返回 410。
