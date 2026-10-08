const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const release = require('../../android/release.json');
const apk = path.join(__dirname, '../../android/releases', release.fileName);
router.get('/api/app/android-release', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!fs.existsSync(apk)) return res.status(503).json({error:'App update is not available yet. Please try again later.'});
  res.json({versionCode:release.versionCode,versionName:release.versionName,downloadUrl:'https://auction.bikeskart.com/downloads/'+release.fileName,sha256:release.sha256,sizeBytes:release.sizeBytes});
});
router.get('/downloads/'+release.fileName, (req, res, next) => {
  res.set('Cache-Control','no-cache');
  res.type('application/vnd.android.package-archive');
  res.download(apk, release.fileName, err => {if(err && !res.headersSent) next(err);});
});
module.exports = router;
