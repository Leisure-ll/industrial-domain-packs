# Runtime 资产自有镜像源（runbook）

**问题**：pack 的 `runtimeAssets` 原先直连上游 release CDN（KiCad/Godot/FreeCAD 的 GitHub
release 资产）。上游撤档或国内直连不可达都会让用户在"域安装→准备原生依赖"一步失败。

**原则**：用户只从**组织自有存储**下载重型资产；上游 URL 只在我们拉取一次时使用，并作为
`upstreamUrl` 溯源字段留在声明里。sha256 钉死不变，自有源与上游比特级一致。

## 一次性：上架资产（维护者执行）

1. **取回并校验**（在上游可直连的机器上）：

   ```sh
   node scripts/mirror-runtime-assets.cjs dist/runtime-assets
   ```

   脚本逐个下载所有 pack 声明的 `runtimeAssets`，校验钉住的 sha256，落到
   `dist/runtime-assets/<id>-<version>/<file>` 并生成 `manifest.json`。

2. **上传到组织 MinIO/静态存储**（目标 bucket 必须允许**匿名 GET**——pack-manager
   禁止 URL 带凭据）：

   ```sh
   mc cp --recursive dist/runtime-assets/ <alias>/industrial-runtime-assets/
   # 或 aws s3 sync dist/runtime-assets/ s3://industrial-runtime-assets/ --endpoint-url https://<minio-host>
   mc anonymous set download <alias>/industrial-runtime-assets
   ```

3. **验证**（任意网络）：

   ```sh
   curl -fsSL https://<mirror-host>/industrial-runtime-assets/manifest.json
   shasum -a 256 -c <<< "<sha256>  kicad-10.0.6/kicad-unified-universal-10.0.6.dmg"
   ```

## 切换 pack 声明

对 `packs/{pcb,godot,freecad}/harness-pack.json` 的每个 asset：

- `url` → `https://<mirror-host>/industrial-runtime-assets/<id>-<version>/<file>`
- 新增 `upstreamUrl`（原 url，仅溯源）
- `sha256`/`size`/其余字段不动（同一份比特）

随后走标准版本链：pack `version`/`releaseVersion`/consumer.json + content-lock
（`npm run lock`）→ harness 侧三处 package.json pin bump。

## 新增资产 / 升级版本时

- 上游版本升级 = 重新资格化（native 版本钉、verifier、Dockerfile apt pin 都要跟着过一遍），
  不要只改 URL；
- 新资产先在 harness-pack.json 声明（指向上游），再跑 mirror 脚本上架，最后把 url 切到
  镜像源，同一 PR 内完成。

## 已知边界

- 镜像源本身是单点：MinIO 挂了 = 新用户首装失败（已装用户不受影响，资产在本地 pack store）；
  可在 runtimeAssets 引入 fallbackUrls（需要 pack-manager 扩展）作为后续加固。
- KiCad 10.0.6 是全链路行为钉（native.py/verifier/容器 apt pin），与镜像源问题正交。
