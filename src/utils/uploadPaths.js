const path = require('node:path');
function uploadPaths(appRoot, configuredRoot) {
  appRoot = path.resolve(appRoot);
  const marker = `${path.sep}hbuilds${path.sep}`;
  const index = appRoot.indexOf(marker);
  const deploymentRoot = index < 0 ? null : appRoot.slice(0, index + marker.length - 1);
  const uploadRoot = configuredRoot ? path.resolve(configuredRoot) : deploymentRoot ? path.join(deploymentRoot, 'uploads') : path.join(appRoot, 'uploads');
  return {uploadRoot, deploymentRoot};
}
module.exports = {uploadPaths};
