# Runtime image release runbook

This repository is the public release surface for the container images its
packs define. Images ship through two anonymous, free channels:

1. **GHCR** — `ghcr.io/zhiman-bj/<image>:<tag>` for `docker pull` and Engine-API
   consumers. Digests are the immutable identity.
2. **GitHub Release assets** — compressed `oci-archive` tarballs
   (`<image>-<tag>.tar` + `.sha256`) for registry-free, air-gapped or
   bandwidth-constrained installs: download, verify, `docker load`.

The organization Harbor stays internal-only; nothing here depends on it.
`provenance/runtime-distribution.json` is the single lock that records what is
currently released (image digest, config digest, archive sha256/size, source
commit) and how to address both channels.

## Released images

| Image | Pack | Recipe | Tag prefix |
| --- | --- | --- | --- |
| `industrial-pcb-runtime` | pcb | `packs/pcb/Dockerfile.local-dev` | `pcb-v*` |
| `industrial-chip-tools` | chip | `packs/chip/eda-harness/Dockerfile.tools` | `chip-v*` |
| `industrial-chip-rtl` | chip | `packs/chip/images/Dockerfile.rtl-cpu` | `chip-v*` |

Recipes pin their base layers by digest. Bump a base digest deliberately, in
its own change, with the reason recorded in the commit message.

## Releasing

1. Ensure the recipes and tests on `main` are what you want to ship
   (images are built from the pushed tag's commit).
2. Tag and push, e.g. `git tag pcb-v1.0.0 && git push origin pcb-v1.0.0`.
   Tag shape is `<pack>-v<semver>`; `pcb-v*` releases the pcb image,
   `chip-v*` releases both chip images under the same tag.
3. The `release-images` workflow then, without human intervention:
   builds for `linux/amd64`, pushes to GHCR, exports the compressed
   `oci-archive` tarball, attempts to set the package public, **verifies the
   pushed bytes anonymously** (full blob download and hash), attaches the
   tarball + `.sha256` to the GitHub Release, and opens a lock-update pull
   request against `provenance/runtime-distribution.json`.
4. Merge the lock PR after reviewing it (never merged automatically). The
   release is complete when the lock PR is merged.

Re-running for an existing tag: `workflow_dispatch` with the tag (and pack)
inputs; assets are re-uploaded with `--clobber` and the lock branch is
force-updated.

## One-time setup / first release notes

- **GHCR package visibility.** Newly created packages may start private; the
  workflow tries to flip them public via the API and warns when it cannot.
  If the anonymous verify step fails with 401/403, flip visibility manually:
  GitHub → Packages → `<image>` → Package settings → Change visibility →
  Public, then re-run the workflow.
- **Org package creation rights.** If the push itself fails with 403, the org
  restricts package creation; allow this repository to push to GHCR in the org
  packages settings.
- **`PACK_BUMP_PAT`.** The lock-update PR step needs this repository secret
  (same PAT used by `harness-pin-bump.yml`). Without it the updated lock is
  still attached to the release asset list, but no PR opens — apply the same
  JSON to `provenance/runtime-distribution.json` by hand.

## Acceptance (what a consumer verifies)

```sh
# Registry bytes: full anonymous manifest + blob verification
python3 scripts/verify-release-artifact.py image \
  'https://ghcr.io/v2/zhiman-bj/industrial-pcb-runtime/manifests/<digest>'

# Release asset bytes: plain HTTPS + sha256
python3 scripts/verify-release-artifact.py asset \
  'https://github.com/Zhiman-BJ/industrial-domain-packs/releases/download/<tag>/<archive>.tar' \
  --sha256 <64-hex>
```

Both commands re-download every byte and fail on any mismatch; use the
identity values from `provenance/runtime-distribution.json`. Air-gapped
install of a verified tarball: `sha256sum -c <archive>.tar.sha256 && docker load -i <archive>.tar`.

## Scope and boundaries

- Only the three images above are released today. The pcb *gateway* runs on
  the host (uv-managed Python), not inside the image; a gateway-baked image is
  future work if a profile needs it.
- macOS runtime assets (KiCad/FreeCAD/Godot DMG & zip) still pin their
  upstream GitHub Release URLs with sha256 in each pack's `harness-pack.json`.
  Mirroring them into this repository's releases is optional redundancy and
  not implemented yet.
- Evaluation task data (PCB-bench tasks) is never distributed through this
  surface; it lives in its own repository with separate licensing.
