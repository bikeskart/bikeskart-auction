// Copy retained deployment uploads to shared storage without overwriting files.
const fs = require('node:fs');
const path = require('node:path');
const {uploadPaths} = require('../src/utils/uploadPaths');
function recoverUploads(sources, destination) {
  const counts = {copied:0, skipped:0};
  for (const source of sources) for (const kind of ['bikes','rc']) {
    const directory = path.join(source, kind);
    if (!fs.existsSync(directory)) continue;
    fs.mkdirSync(path.join(destination, kind), {recursive:true, mode:0o700});
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      if (!entry.isFile() || !/\.(?:jpg|jpeg|png|webp|pdf)$/i.test(entry.name) || kind === 'bikes' && /\.pdf$/i.test(entry.name)) continue;
      try {
        fs.copyFileSync(path.join(directory, entry.name), path.join(destination, kind, entry.name), fs.constants.COPYFILE_EXCL);
        fs.chmodSync(path.join(destination, kind, entry.name), 0o600);
        counts.copied++;
      } catch (error) { if (error.code !== 'EEXIST') throw error; counts.skipped++; }
    }
  }
  return counts;
}
function main() {
  const appRoot = path.resolve(__dirname, '..');
  const {uploadRoot, deploymentRoot} = uploadPaths(appRoot, process.env.UPLOAD_ROOT);
  if (!deploymentRoot) throw new Error('Run this script from the deployed Hostinger application.');
  const versions = path.join(deploymentRoot, 'versions');
  const sources = [];
  if (fs.existsSync(versions)) for (const entry of fs.readdirSync(versions, {withFileTypes:true}).filter(e=>e.isDirectory())) {
    sources.push(path.join(versions,entry.name,'nodejs','uploads'));
  }
  sources.push(path.join(deploymentRoot,'last-source','uploads'),path.join(deploymentRoot,'last-source','nodejs','uploads'));
  sources.sort((a,b)=>(fs.existsSync(b)?fs.statSync(b).mtimeMs:0)-(fs.existsSync(a)?fs.statSync(a).mtimeMs:0));
  const counts = recoverUploads(sources, uploadRoot);
  console.log(`Recovered ${counts.copied} upload files. Kept ${counts.skipped} existing files. Database records were unchanged.`);
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode=1; } }
module.exports = {recoverUploads};
