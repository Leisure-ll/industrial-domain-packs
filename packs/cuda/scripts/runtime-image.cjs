// Administrator-only immutable Harbor acquisition; no registry secret enters MCP.
async function ensureRuntimeImage(distribution, { docker = '/usr/bin/docker', run } = {}) {
  if (!/^harbor\.pvg2\.zhiman\.tech\/[a-z0-9_/-]+@sha256:[a-f0-9]{64}$/.test(distribution?.image || '') ||
      !/^sha256:[a-f0-9]{64}$/.test(distribution?.imageId || '') || distribution.platform !== 'linux/amd64')
    throw Error('Invalid pinned CUDA runtime distribution.');
  const inspect = async () => {
    const rows = JSON.parse(await run(docker, ['image', 'inspect', distribution.image], undefined, { timeout: 15000 }));
    if (!Array.isArray(rows) || rows.length !== 1) throw Error('CUDA runtime image identity is ambiguous.');
    const image = rows[0], config = image.Descriptor?.annotations?.['config.digest'] || image.Id;
    if (config !== distribution.imageId || image.Os !== 'linux' || image.Architecture !== 'amd64' ||
        !image.RepoDigests?.includes(distribution.image)) throw Error('CUDA Harbor runtime config, platform or manifest identity mismatch.');
    return distribution.imageId;
  };
  try { return await inspect(); } catch {}
  try {
    await run(docker, ['pull', '--platform', distribution.platform, distribution.image], undefined, { timeout: 30 * 60 * 1000 });
    return await inspect();
  } catch (error) {
    throw Error('Prepare the private CUDA runtime with administrator Harbor pull access. ' + error.message, { cause: error });
  }
}
module.exports = { ensureRuntimeImage };
