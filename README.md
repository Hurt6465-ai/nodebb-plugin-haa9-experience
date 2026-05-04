以下是翻译后的中文版 README：

---

nodebb-plugin-haa9-experience

一个整合的 NodeBB 插件，用于 HAA9 界面体验：

· 现代化的 /categories 英雄卡片式版块索引，支持封面图片及缓存版块数据
· 为指定版块 CID 提供 HAA9 主题列表动态卡片
· 默认启用所有版块的主题详情页 UI 增强
· 翻译设置/按钮在版块索引、主题列表、主题详情和编辑器之间共享
· 录音功能（audioBitsPerSecond: 16000）并带有浏览器安全回退
· 批量服务端点，用于聚合主题媒体和用户资料，避免每个主题卡片都单独请求 API
· ACP 设置页面及国际化资源文件

从 GitHub 安装

将本文件夹推送至 GitHub 后执行：

```bash
cd /path/to/nodebb
npm install git+https://github.com/YOUR_GITHUB_USERNAME/nodebb-plugin-haa9-experience.git
./nodebb activate nodebb-plugin-haa9-experience
./nodebb build
./nodebb restart
```

或者从 ACP → 插件 → 已安装的插件 中激活，然后重建并重启。

重要文件

```text
plugin.json                         NodeBB 插件清单
package.json                        npm / GitHub 安装元数据
library.js                          服务端钩子和 API 路由
public/js/client.js                 配置加载器 + 批量媒体 / 资料队列
public/js/category-index.js         /categories 英雄卡片界面
public/js/haa9-category.js          主题列表及 HAA9 媒体界面
public/js/x-topic-detail.js         主题详情页界面
public/js/x-translate-tools.js      翻译设置 / 工具
templates/admin/plugins/*.tpl       ACP 设置页面
languages/*/haa9-experience.json    i18n 文件
```

批量和缓存端点

本插件提供以下接口：

· GET /api/haa9-experience/config
· GET /api/haa9-experience/media?ids=1,2,3
· GET /api/haa9-experience/profiles?slugs=a,b&uids=1,2
· GET /api/haa9-experience/categories

public/js/client.js 会在短暂延迟内批量请求主题媒体及用户资料，并存入短期有效的 localStorage 缓存。服务端同时维护带 TTL 的内存缓存。这样即可避免对每个可见主题卡片都调用一次 /api/topic/:tid，大幅减少服务器压力。

多语言支持

现有语言文件：

· languages/zh-CN/haa9-experience.json
· languages/en-GB/haa9-experience.json
· languages/my/haa9-experience.json（占位文件，后续可用于缅甸语翻译）

版块封面

ACP 设置字段示例：

```json
{
  "6": { "cover": "/assets/uploads/category/chat.jpg" },
  "8": { "cover": "/assets/uploads/category/life.jpg" }
}
```

注意事项

· 主题详情页增强默认对所有版块 CID 启用。
· 主题列表动态卡片增强默认作用范围为 CID 6，可在 ACP 中更改。
· 请勿在启用本插件的同时加载旧的 Custom CSS/JS 代码片段。

---
