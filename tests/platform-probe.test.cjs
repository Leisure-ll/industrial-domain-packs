const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync, spawnSync} = require('node:child_process');
const {createVersionProbe} = require('../lib/probe.cjs');
const available = spawnSync('go',['version']).status === 0;
let directory, binary, sha256;
before(() => {
 if (!available) return;
 directory=fs.mkdtempSync(path.join(os.tmpdir(),'platform-probe-'));
 binary=path.join(directory,'probe');
 execFileSync('go',['build','-o',binary,'.'],{cwd:path.join(__dirname,'../mcp/environment-probe')});
 sha256=crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
});
after(() => {if(directory)fs.rmSync(directory,{recursive:true,force:true});});
const asset={id:'godot',versionArgs:['--version']};
test('platform probe adapter validates identity and native application version', {skip:!available},async()=>{
 const executable=path.join(directory,'app');fs.writeFileSync(executable,'#!/bin/sh\nprintf "4.7.2.fixture\\n"\n',{mode:0o755});
 const run=createVersionProbe({binary,sha256});
 assert.match(await run(asset,executable,{timeout:5000}),/4.7.2.fixture/);
 await assert.rejects(run({...asset,versionArgs:['--script','untrusted']},executable),/Unsupported/);
 await assert.rejects(createVersionProbe({binary,sha256:'0'.repeat(64)})(asset,executable),/identity/);
});
test('platform probe cancellation and timeout terminate the native process group',{skip:!available||process.platform==='win32'},async()=>{
 const executable=path.join(directory,'slow-app');fs.writeFileSync(executable,'#!/bin/sh\nsleep 30\n',{mode:0o755});
 const run=createVersionProbe({binary,sha256});
 const abort=new AbortController();const pending=run(asset,executable,{timeout:5000,signal:abort.signal});
 setTimeout(()=>abort.abort(),80);await assert.rejects(pending,/cancelled/);
 const start=Date.now();await assert.rejects(run(asset,executable,{timeout:50}),/failed/);assert.ok(Date.now()-start<3000);
});
test('platform probe executes the actual installed Godot version',{skip:!available||!fs.existsSync('/Applications/Godot.app/Contents/MacOS/Godot')},async()=>{
 const output=await createVersionProbe({binary,sha256})(asset,'/Applications/Godot.app/Contents/MacOS/Godot',{timeout:120000});
 assert.match(output,/^4\./);
});
