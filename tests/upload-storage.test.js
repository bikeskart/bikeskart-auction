const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {uploadPaths} = require('../src/utils/uploadPaths');
const {recoverUploads} = require('../scripts/recoverUploads');
test('Hostinger deployments share upload storage across version changes',()=>{
  const first=uploadPaths('/home/user/domains/auction.example.com/hbuilds/versions/one/nodejs');
  const second=uploadPaths('/home/user/domains/auction.example.com/hbuilds/versions/two/nodejs');
  assert.equal(first.uploadRoot,second.uploadRoot);
  assert.equal(first.uploadRoot,'/home/user/domains/auction.example.com/hbuilds/uploads');
  assert.equal(uploadPaths('/tmp/local-app').uploadRoot,'/tmp/local-app/uploads');
  assert.equal(uploadPaths('/tmp/local-app','/mnt/persistent').uploadRoot,'/mnt/persistent');
});
test('recovery preserves current photos and private RC documents without overwriting',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bk-recovery-'));
  try {
    const source=path.join(root,'old'),destination=path.join(root,'shared');
    for(const dir of ['old/bikes','old/rc','shared/bikes'])fs.mkdirSync(path.join(root,dir),{recursive:true});
    fs.writeFileSync(path.join(source,'bikes','old.jpg'),'old image');
    fs.writeFileSync(path.join(source,'bikes','same.jpg'),'old duplicate');
    fs.writeFileSync(path.join(destination,'bikes','same.jpg'),'current image');
    fs.writeFileSync(path.join(source,'bikes','bad.html'),'excluded');
    fs.writeFileSync(path.join(source,'rc','document.pdf'),'private rc');
    fs.symlinkSync(path.join(source,'rc','document.pdf'),path.join(source,'bikes','link.jpg'));
    assert.deepEqual(recoverUploads([source],destination),{copied:2,skipped:1});
    assert.equal(fs.readFileSync(path.join(destination,'bikes','same.jpg'),'utf8'),'current image');
    assert.equal(fs.readFileSync(path.join(destination,'rc','document.pdf'),'utf8'),'private rc');
    assert.ok(!fs.existsSync(path.join(destination,'bikes','bad.html')));
    assert.ok(!fs.existsSync(path.join(destination,'bikes','link.jpg')));
    assert.deepEqual(recoverUploads([source],destination),{copied:0,skipped:3});
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
