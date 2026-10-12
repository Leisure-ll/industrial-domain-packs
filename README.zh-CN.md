# Industrial Domain Packs

开发边界：[已接受的架构契约 IH-ARCH-001](docs/architecture-contract.md)。

[English](README.md)

领域实现统一维护在这个公开仓库。本地与远端通过完整 Git commit 固定同一版本，包含执行代码、MCP、Skills、依赖锁、工具定义、验证器和镜像配方。

## Runtime 分发 v2（0.7.0）

当前产品目录提供 Chip、PCB、Godot 和 CAD。托管 Chip、完整 PCB 设计及可选 DXF 容器配置需要 Docker；Godot、FreeCAD 与有限范围的 KiCad 原生检查使用原生应用；macOS Apple Silicon 的 DXF 另提供独立原生运行时。CUDA 独立实现保留，但不再列入产品领域、宿主提供者与默认 Skills。

执行 Profile 将本机、容器与远程工具子集绑定到现有资产及已验证平台。本机应用声明只读检测候选路径和官方手动安装入口。源码、Skill 与 MCP 桥接组件由同一份现有清单生成独立归档，与软件安装包分离；工具及 Verifier 实现保持复用。发布生成、验证范围与兼容关系见 [分发 v2](docs/runtime-distribution-v2.md)。独立发布的 Go 平台组件执行固定的本机环境检测；领域 MCP 迁移属于后续阶段。

## 托管产品发行 0.6.0

兼容的 Harness 从自有 Harbor 自动准备原生应用和预构建工具环境。日常设计项目直接使用领域 Skills、工具和 Runtime，无需 benchmark 任务种子或评分流程。执行前提取决于所选配置。验收见[托管领域记录](docs/managed-domain-runtime-validation.md)、[PCB 记录](docs/pcb-product-validation.md)、[CUDA 记录](packs/cuda/QUALIFICATION.md)与[分发身份](provenance/runtime-distribution.json)。下方旧版本说明为历史记录，实际消费端需固定本次发行提交后才会获得新能力。

| Pack | 当前实现 | 使用边界 |
| --- | --- | --- |
| Chip | 托管结构化 EDA、RTL 断言/VCD、综合、Skills 与原生报告 | Harbor 运行镜像，已验收 macOS ARM64 和 Linux x64；需要 Docker；物理流程需要用户工艺输入 |
| Godot | 类型化场景编辑、原生导入、独立场景回读与逐帧检查 | Harbor 自动准备 Godot 4.7.2；macOS Apple Silicon；结构流程 |
| PCB | 88 项独立原理图/PCB 设计工具、器件资源与原生检查 | Harbor 运行镜像及 KiCad 10.0.6；需要 Docker；macOS Apple Silicon 桌面 |
| CAD / FreeCAD | 单一 CAD Runtime 中的参数化实体建模与 DXF 创建/检查/验证 | Harbor FreeCAD 与独立 DXF 原生运行时；可选 DXF 容器；按明确几何要求校验 |
| CAD guidance | 共享制图方法、ezdxf 操作参考及可选 AutoCAD 指南 | 由 CAD 产品复用；仅 DWG/桌面操作需自备 AutoCAD |

最初迁移来自 Harness 提交 371b011b41417d5cb0c29bc9a0fd4c8bfa4bf75e 和 FreeCAD PR29 提交 62510b22b47803e0841825ec1c2b34fae48b3b15。逐文件来源与哈希见 [迁移记录](provenance/domain-migration.json)。后续发行已携带可复用的 PCB actor 及来源记录。当前 harness-pack.json 为实际安装与 Runtime 声明；保留的 legacy 清单和 bootstrap 说明仅作为历史参考。当前可用范围以上方托管发行与验收记录为准。

remote 直接依赖 npm 包名 @zhiman-bj/industrial-domain-packs 对应的 Git 提交。它读取 Pack 提供的 descriptor、验证器、执行入口、证据导出器和 Dockerfile，不再维护独立 Chip runner。沙箱执行前必须与协调器核对内容身份；身份随能力快照和任务保存。

Chip 本地和沙箱使用同一套 EDA semantic.prepare / semantic.observe；本地和远端的 canonical 验证器都引用 runtime/verifier.cjs。旧 Harness 安装不会自动切换，Harness 消费端后续单独迁移。

开发、真实 MCP 检查、镜像构建和 validate.sh 使用见英文 README。源码修改后先暂存经过检查的 packs/ 和 lib/ 文件，再执行 npm run lock 更新内容身份。消费者和沙箱必须从同一固定版本构建。源码 CI 不构建或发布工具镜像。

[验收记录](docs/migration-validation.md) 区分代码迁入、原生工具执行和远端支持。source-only archive 可覆盖所有六个 Pack，但不是可直接使用的执行镜像；镜像构建使用完整固定版本的包。

本仓库负责领域实现；Harness 继续负责 canonical 合约、Runtime、Broker、Agent、CLI、Desktop、Viewer 框架；私有 remote 仓库负责认证、文件快照、授权、有限调度和沙箱生命周期。工作负载不获得 Docker socket 或 Kubernetes 权限。

原始实现与已导入的 Harness 源码采用 MIT，保留 [第三方与来源说明](THIRD_PARTY_NOTICES.md)。固定版本的 PCB actor 与工程 references 已随包携带，其预构建运行镜像按用户要求从自有 Harbor 提供正常产品分发，支持匿名获取。这不为 actor 新授予 MIT 或其他开源许可证；见 [PCB 来源与分发记录](packs/pcb/PROVENANCE.md)。原生工具和其他第三方组件保留自身许可。仓库不包含客户数据、凭据、私有部署地址、PDK、二进制或历史运行产物。

## Harness 消费发行

0.3.0 提供 `consumerMetadata()`、`hostPacks()`、`sourceDirectory()` 和 `skillResource()`，统一维护宿主清单、能力与 Skill 目录及固定源码资源。Harness 从精确固定的包消费这些声明和源码；维护入口只在本仓库。规范 Pack ID 与已有目录一致。已归并 Harness 后续验收的 FreeCAD 与 Chip 修复，PCB 私有 actor 仍是外部依赖。详见 [消费发行](docs/harness-consumer.md)。

0.4.0 新增 CUDA Pack。两个远程 MCP 使用独立身份与凭据，从宿主可信设置接入。本地准备服务前检查 GPU 与 profile，并明确绑定评测卡 UUID；远程客户端无需本机 GPU。详见[部署与客户端配置](packs/cuda/README.md)。

0.4.0 同时提供 [PCB／Godot 专业 Runtime](docs/professional-runtime.md)，集成路径采用 canonical Actions 和独立验证，原有 MCP 仅保留独立诊断。安装后的 Pack 通过 Harness 注入通用执行接口，不依赖开发目录。没有扩大远端、Linux、Windows 或 Intel Mac 支持声明。

0.4.1 为兼容的 Harness Pack Manager 声明官方 KiCad、Godot 和 FreeCAD 托管下载，范围为 macOS Apple Silicon。下载与安装大小、版本探测及 KiCad 的两个可执行文件映射由本仓维护；使用托管安装时无需用户运行命令或配置环境变量。Chip 仍需外部工具链，CUDA 仍需管理员提供远程服务。详见[安装元数据与边界](docs/native-installation.md)。已有公众安装器须更新消费版本和通用安装层，并完成验收，才会获得这些配方。

FreeCAD 现声明模型、对应版本的预览、导出和诊断成果组。检查关联实际输入快照；修改仅在原生生成成功后显式替代输入版本。Harness 将局部输出名绑定到已登记 Artifact。成果选择按需调用，几何验收仍由原有 Verifier 决定。

[全领域成果声明与扩展计划](docs/result-presentation-plan.md)和[契约校验样例](docs/result-presentation-examples.json)覆盖五个领域、六个 Pack。本次是接入准备；其他 Pack 的生产声明、快照版本关联及 CUDA 消费升级仍待实施和验收。

0.5.1 合并托管安装配方与 0.5.0 成果声明。FreeCAD 发行版本 1.1.4-pack.7 保留 pack.6 的完整安装配方和 pack.5 的成果呈现源码，已发布旧版本的内容保持不变。PCB、Godot 版本与平台资格范围不变。消费者须更新不可变版本固定值，并验证合并后的应用。

0.5.2 保留托管安装配方和 FreeCAD 成果声明，同时合入最新 Godot 场景编辑类型校验与工具说明。Godot 发行版本 0.2.2 将已审查的 Runtime 源码与现有托管原生配方组合；其他 Pack 的版本及内容均保持不变。旧发行版本仍保留各自不可变身份。

PCB 分发 0.3.1 以独立 `pcb.design.*` 能力和产品 Skill 提供原理图/PCB 设计，同时完整保留上游实现与工程 references。兼容 Harness 根据用户选择，从自有 Harbor 单独准备 KiCad 和预构建设计环境；普通工程无需 benchmark 种子、评测器或提交。见 [PCB 设计能力](packs/pcb/README.md)。
