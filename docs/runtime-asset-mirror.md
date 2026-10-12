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

2. **上传到组织 Harbor（OCI artifact，blob 即原文件）**：

   ```sh
   oras push --username <robot> --password-stdin --disable-path-validation \
     harbor.pvg2.zhiman.tech/industrial-runtime-assets/<name>:<version> \
     dist/runtime-assets/<id>-<version>/<file>:application/octet-stream
   ```

   Harbor 对公开项目也要求 Bearer token；pack-manager 已支持匿名 token 握手
   （harness PR #123）。`application/octet-stream` 不压缩——blob digest 即文件
   sha256，因此资产 URL 自带校验：

   `https://harbor.pvg2.zhiman.tech/v2/industrial-runtime-assets/<name>/blobs/sha256:<pin>`

   bucket 侧要求：项目 `industrial-runtime-assets` 保持 **public**（匿名 pull）。

3. **验证**（任意网络）：

   ```sh
   python3 scripts/verify-harbor-artifact.py \
     https://harbor.pvg2.zhiman.tech/v2/industrial-runtime-assets/<name>/blobs/sha256:<pin> \
     --size <declared-size> --output /tmp/runtime-asset-verification.json
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

## KiCad 大文件验收纠正（2026-10-12）

此前记录将 HTTP 201 后的 404 归因为 Harbor 存储丢失，证据不足。复查本机旧
`kicad-retry.sh` / `kicad-chunked.sh` 发现验收变量使用了 **63 位、拼错的 digest**：
`ef4dcd4278c46d3efcd2888db273d5957d68efda0286bf79b4811fc5302dc68`。
真实 DMG 的 SHA-256 为
`ef4dcd4278c46d3efcd28c8db273d5957d68efda028f6bf79b4811fc5302dc68`。
错误路径的 404 不能证明已上传的正确 blob 消失，也不能据此更改服务器配置。

维护者应使用 `scripts/verify-harbor-artifact.py` 验收。它拒绝非 64 位摘要、使用
全新匿名 Bearer 会话、读取完整 blob 并比对大小和 SHA-256；对 image 同时校验
manifest、config 与每个 layer。大型 blob 通过覆盖全部字节的有界并发 Range GET
读取并按原顺序计算摘要，避免单连接限速；Range 位置和响应长度也必须匹配。
发布后重新启动该脚本再验收一次，不能以 HEAD、上传 201 或本机 Docker 缓存代替。

```sh
python3 scripts/verify-harbor-artifact.py \
  https://harbor.pvg2.zhiman.tech/v2/industrial-runtime-assets/kicad/blobs/sha256:ef4dcd4278c46d3efcd28c8db273d5957d68efda028f6bf79b4811fc5302dc68 \
  --size 1404303659 --output /tmp/kicad-verification.json
```

## 发布工具

维护者用已有 Docker/ORAS 登录发布新 tag，脚本不输出或保存凭据。目标 tag 已存在
则拒绝写入；公开产物上传后从全新匿名 registry 会话读取全部内容，验证完成才返回成功。

```sh
python3 scripts/publish-runtime-artifact.py \
  harbor.pvg2.zhiman.tech/industrial-runtime-assets/<repo>:<new-release> \
  --image <maintainer-local-image> --output /tmp/release-verification.json
```

大 image 如果 Docker Desktop 的出口代理在长时间 PUT 时返回 broken pipe，增加
`--transport oras`：导出保持原 manifest digest 的 OCI archive，由宿主 ORAS 上传，
无需更改 Docker/Harbor 全局代理。已用于 1,248,460,170 字节的 Chip clean layer。

受限 CUDA worker 只发布到已有 private 项目，并用 `--private` 验收；脚本先核对
`metadata.public=false`，再使用已有 Docker 登录，绝不把受限源发布到 public 项目。
普通远程用户无需 registry 凭据，由部署管理员认证拉取。

原生安装包用 `--file <installer> --sha256 <pin>` 替代 `--image`。不要把 manifest digest
当成安装包的 blob digest：原生 `url` 必须从 artifact layer descriptor 取得。

## 预构建 Runtime

`provenance/runtime-distribution.json` 记录下载地址及访问前提、registry manifest digest、
config digest、平台、真实下载字节数、依赖版本和上游来源。digest 引用是消费入口；tag
只方便维护者发现。Docker 的某些 image store 会将 `inspect.Id` 返回为 manifest/index
identity，因此消费者同时接受并核对 `Descriptor.annotations["config.digest"]`，不把
manifest digest 和 config digest 混为一谈。

PCB image 从钉住的 actor image 派生，仅添加 CPython 3.13.12 和 `packs/pcb/uv.lock`
中 hash 锁定的 MCP gateway 依赖。原生 actor 仍用 `/usr/bin/python3` 及 KiCad 10.0.6；
gateway 用 `/opt/pcb-gateway/bin/python3`。bridge/controller 来自已验证 pack，readonly
挂载到托管容器中。用户只需要拉取产物；维护者使用
`scripts/build-pcb-gateway-image.py` 构建更新。

CAD DXF image 包含 Python 3.13.12、ezdxf 1.4.3 和
`packs/freecad/images/dxf-requirements.txt` 的精确依赖；入口为
`python3 -I /opt/cad/dxf-native.py`。维护者执行
`scripts/build-dxf-runtime.py`，用户自动拉取固定 digest。

Chip 通用工具 image 从工具基底清除工艺库、示例设计、构建结果及缓存，再通过
`FROM scratch` 只复制清理后的文件系统，确保被移除内容不留在历史 OCI layers。
维护方构建时可以使用上游软件源，最终用户安装及运行不访问上游软件源。
