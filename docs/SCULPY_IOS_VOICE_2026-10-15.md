# iPhone网页录音转写修复

日期：2026-10-15

用户实机反馈：`Audio file might be corrupted or unsupported`。

## 原因与修复

录音上传统一用了`.webm`后缀，iPhone生成的MP4音频也被这样命名。用FFmpeg生成的合成英语语音、AAC/MP4封装，发送给线上旧版接口时复现HTTP 500和相同错误。

- 前端按浏览器支持能力选择录音格式，优先使用实际录音块的MIME类型；不再把未知格式硬写成WebM。
- 上传前检查音频容器头、MIME及后缀，MP4、WebM、Ogg、WAV、MP3分别使用匹配的类型和文件名，不转码、不改声音内容。
- 后端同样识别实际容器，修复旧缓存页面传来的错误后缀。
- 空录音、未知格式和录音中断给出可理解的提示；保留输入草稿和转写后人工发送流程。
- 更新相关资源版本，聊天和工作记录的录音入口都使用新逻辑。
- 保留原接口权限、来源限制、5MB上限、模型及API密钥配置。

## 实际转写验证

后端`sculpy-ai` v5 ACTIVE。
测试音频完全由FFmpeg/flite生成，无用户录音或客户数据。
原文：This is a synthetic Sculpy microphone test. Miranda has a wedding booking tomorrow.

| 用例 | 修复后 |
|---|---|
| MP4音频，旧页面错误命名为WebM | HTTP 200，完整正确原文 |
| MP4音频，正确MP4命名 | HTTP 200，完整正确原文 |
| WebM音频，正确WebM命名 | HTTP 200，完整正确原文 |

[原始接口结果](evaluations/ios-voice-20261015-v5.json)

本地完整162项：161通过、0失败、1项外部PostgreSQL条件跳过。新增测试覆盖错误后缀/MIME、真实字节保留、Safari式MP4录音器、最终音频块类型、原草稿保留及前后端上传。

这些测试验证了真实转写服务和录音格式路径；没有声称已经用用户的实体iPhone完成验收。

完整浏览器、录音生命周期、手机布局、权限、PostgreSQL与恢复CI通过：[38820185583](https://github.com/2ez4jz/sculp-database/actions/runs/38820185583)。
