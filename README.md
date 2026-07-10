# 川轻化课表助手

四川轻化工大学课表助手 PWA：纯前端、零后端，数据只存在浏览器 `localStorage`。

技术栈：React + Vite + Tailwind CSS v4 + React Router（Hash 模式）+ GitHub Pages。

## 功能

- **上传教务 PDF 导入**（推荐）：正方课表导出 PDF → 本站上传识别
- **复制粘贴导入**（备选）
- **Bookmarklet**（高级 / 电脑可选）
- **周视图**：周一至周日，按节次展示；课程分色；单双周斜纹区分
- **新鲜度横幅**：3 / 7 / 14 天阈值变色提醒；超过 7 天强制弹窗
- **频道引流**：底部「加入频道获取调课通知」
- **可安装 PWA**：支持添加到主屏幕、离线缓存

## 本地开发

```bash
npm install
node scripts/generate-icons.mjs
npm run dev
```

浏览器打开终端提示的本地地址即可。

## 部署到 GitHub Pages

1. 新建 GitHub 仓库（建议名与本地文件夹一致，例如 `cursor-kcb`）
2. 推送代码到 `main`
3. 仓库 **Settings → Pages → Build and deployment** 选择 **GitHub Actions**
4. 推送后 Actions 会自动构建并发布
5. 访问：`https://<你的用户名>.github.io/cursor-kcb/`

> Workflow 会根据仓库名自动设置 `VITE_BASE=/仓库名/`。

## 学生怎么用（手机）

1. 打开本站 → 底部 **导入**
2. 手机打开教务 `61.139.105.138`，进入课表页
3. 用教务的 **打印 / 导出 PDF**，把课表存到手机
4. 回到本站，点 **选择课表 PDF** 上传
5. （可选）浏览器菜单「添加到主屏幕」，像 App 一样用

不会下载时，可先点 **先看演示课表**。PDF 不好用时，导入页里还有「复制粘贴」备选。

## 演示与调试

**设置**页可：

- 载入演示课表
- 载入「10 天前」数据以测试过期弹窗
- 修改调课通知频道链接
- 清除本地数据

## 数据格式

Bookmarklet / 内部存储：`#/import?d=<base64url(JSON)>`

```json
{
  "version": 1,
  "school": "四川轻化工大学",
  "updatedAt": "2026-07-10T01:00:00.000Z",
  "termStart": "2026-02-23",
  "courses": [
    {
      "id": "…",
      "name": "高等数学A",
      "teacher": "张老师",
      "room": "一教A301",
      "weekday": 1,
      "startSection": 1,
      "endSection": 2,
      "weeks": "1-16",
      "weekParity": "all"
    }
  ]
}
```

`weekParity`：`all` | `odd` | `even`（也可由 `weeks` 文案中的「单/双」自动推断）。

## 隐私

所有课表数据仅存于用户设备，不经过任何自建后端。
