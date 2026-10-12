"""Cross-compile the fixed native version probe as independent platform assets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
ROOT = Path(__file__).resolve().parents[1]
PLATFORMS = {'darwin-arm64': ('darwin','arm64'), 'linux-x64': ('linux','amd64')}
def build(output, platforms):
    commit = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip()
    sources = {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'mcp/environment-probe').glob('*')) if p.is_file()}
    components=[]
    for platform in platforms:
        goos,goarch=PLATFORMS[platform]; target=output/platform/'industrial-environment-probe';target.parent.mkdir(parents=True,exist_ok=True)
        env={**os.environ,'GOOS':goos,'GOARCH':goarch,'CGO_ENABLED':'0'}
        subprocess.run(['go','build','-trimpath','-buildvcs=false','-ldflags=-s -w','-o',str(target.resolve()),'.'],cwd=ROOT/'mcp/environment-probe',env=env,check=True)
        components.append({'id':'environment-probe','platform':platform,'file':str(target.relative_to(output)), 'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'sizeBytes':target.stat().st_size})
    index={'schemaVersion':2,'kind':'platform-components','sourceCommit':commit,'sourceState':'working-tree' if subprocess.check_output(['git','status','--porcelain','--','mcp/environment-probe'],cwd=ROOT).strip() else 'committed','sourceFiles':sources,'qualification':'Fixed native version probe only; cross compilation does not qualify native domain execution.','components':components}
    destination=output/'platform-probe-index.json';destination.write_text(json.dumps(index,indent=2)+'\n');print(destination)
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=ROOT/'dist/platform-probe');parser.add_argument('--platform',choices=list(PLATFORMS),action='append');args=parser.parse_args();build(args.output,args.platform or list(PLATFORMS))
