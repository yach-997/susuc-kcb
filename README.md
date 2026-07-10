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

站点「导入」页也写了同样的截取说明，方便小白按步骤操作。

## 如何截取真实课表页（给开发者升级解析用）

1. **打开课表**
   - 浏览器打开教务：`61.139.105.138`
   - 登录后进入「个人课表」或「学期理论课表」
   - 确保能看到周一到周日、按节次排列的大表格

2. **截图（二选一）**
   - **整页截图（推荐，Chrome / Edge）**：按 `F12` → `Ctrl + Shift + P` → 输入 `screenshot` → 选 **Capture full size screenshot**，把下载的长图发给开发者
   - **普通截图**：按 `Win + Shift + S`，框选整张课表，粘贴发给开发者或先保存成图片

3. **复制 HTML（更准，强烈建议）**
   - 在课表表格上右键 → **检查**
   - 左侧高亮到 `<table>` 或带 `kbgrid` 的区域
   - 右键 → **Copy → Copy element**
   - 粘贴到记事本，保存为 `课表.html` 发给开发者

至少发 2～3 张清晰截图也可以先改一版；有 HTML 解析会更准。请注明是本学期个人课表，尽量让单双周、连堂课也出现在画面里。

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
