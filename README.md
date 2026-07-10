# 川轻化课表助手

四川轻化工大学课表助手 PWA：纯前端、零后端，数据只存在浏览器 `localStorage`。

技术栈：React + Vite + Tailwind CSS v4 + React Router（Hash 模式）+ GitHub Pages。

## 功能

- **Bookmarklet**：在正方课表页一键提取课程并跳转导入（当前为模拟数据，便于联调）
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
2. 推送代码到 `main`：

```bash
git remote add origin https://github.com/<你的用户名>/cursor-kcb.git
git add .
git commit -m "feat: 川轻化课表助手 PWA"
git push -u origin main
```

3. 仓库 **Settings → Pages → Build and deployment** 选择 **GitHub Actions**
4. 推送后 Actions 会自动构建并发布
5. 访问：`https://<你的用户名>.github.io/cursor-kcb/`

> Workflow 会根据仓库名自动设置 `VITE_BASE=/仓库名/`。若仓库是 `username.github.io`，请把 `.github/workflows/deploy.yml` 里的 `VITE_BASE` 改成 `/`。

## 使用 Bookmarklet

1. 打开站点 → **导入** 页
2. 确认 PWA 地址后，复制书签代码 / 拖到书签栏
3. 登录正方教务（`61.139.105.138`）打开课表页，点击书签
4. 自动跳回本站并写入本地课表

当前书签使用**模拟课程数据**。拿到真实课表 HTML 后，替换 `src/lib/bookmarklet.ts` 里的 `extractCourses()`（文件中已附正方表格解析模板注释）。

## 演示与调试

**设置**页可：

- 载入演示课表
- 载入「10 天前」数据以测试过期弹窗
- 修改调课通知频道链接
- 清除本地数据

## 数据格式

Bookmarklet 跳转：`#/import?d=<base64url(JSON)>`

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
