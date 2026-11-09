# 上传到 GitHub

仓库已经 `git init` 并做好了第一个提交，你只需要把它推上去。

## 方式一：命令行（推荐）

1. 在 GitHub 上 **新建仓库**（不要勾选 README / .gitignore / LICENSE，避免冲突）
2. 拿到仓库地址，例如 `https://github.com/你的用户名/yusheng.git`
3. 在 `yusheng-github/` 目录里执行：

```bash
git remote add origin https://github.com/你的用户名/yusheng.git
git branch -M main
git push -u origin main
```

> 如果终端提示要密码：GitHub 早已不支持密码，请用 **Personal Access Token**
> （Settings → Developer settings → Personal access tokens → 勾 `repo`）当密码。

## 方式二：GitHub Desktop

1. 打开 GitHub Desktop → Add → Add Existing Repository → 选 `E:\QQ-Bot\yusheng-github`
2. 右上角 Publish repository → 填名字 → 取消勾选 "Keep this code private"（如果要公开）
3. 点 Publish

## 方式三：网页上传

如果不想折腾 git：
1. 把 `yusheng-github` 打包成 zip，解压
2. GitHub 新仓库 → "uploading an existing file" → 把**文件夹里的内容**全选拖进去
3. 注意：`room/web/pets/*.webm` 总共约 8MB，网页上传单次上限 25MB，一次能传完

---

## 上传前检查（重要）

- [ ] **没有任何凭证**：`grep -r "sk-" .` 应该没有结果
- [ ] `config.json`、`volc-tts.json` 不在仓库里（`.gitignore` 已排除）
- [ ] 没有 `*.log`、`*.err`、`pet-bounds.json` 这类运行时文件
- [ ] `electron/` 目录没被提交（110MB 的二进制）
- [ ] 截图体积正常（现在三张 jpg 共约 560KB）

一条命令自查：

```bash
git ls-files | Select-String -Pattern "config.json$|\.log$|\.err$|electron/"
# 期望：没有任何输出
```

## 建议的仓库信息

| 项 | 建议值 |
|---|---|
| 仓库名 | `yusheng` 或 `yusheng-desktop-companion` |
| 描述 | 住在你桌面和 QQ 里的 AI 女儿：人格卡 + 声音复刻 + 虚拟房间 + 桌宠 |
| Topics | `ai-companion` `desktop-pet` `qq-bot` `tts` `voice-clone` `deepseek` `electron` `live2d-alternative` |
| 许可证 | MIT（已在仓库里） |
| 首页 | 可以把 `screenshots/room.jpg` 设成 Social preview |

## 之后怎么更新

```bash
git add -A
git commit -m "feat: 改了 xxx"
git push
```
