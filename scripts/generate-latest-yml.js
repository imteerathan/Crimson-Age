const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distDir = path.resolve(process.cwd(), 'dist');
const version = require(path.resolve(process.cwd(), 'package.json')).version;
const versionInfo = require(path.resolve(process.cwd(), 'versioning.json'));

if (!fs.existsSync(distDir)) {
  throw new Error('dist directory not found');
}

const files = fs.readdirSync(distDir);
const installer = files.find((name) =>
  /^Crimson-Age-Setup-.*\.exe$/i.test(name)
);

if (!installer) {
  throw new Error(
    `NSIS installer not found in dist. Found: ${files.join(', ')}`
  );
}

const expectedVersion = `${version}`;
if (!installer.includes(expectedVersion)) {
  throw new Error(
    `Installer version mismatch. package.json=${version}, installer=${installer}`
  );
}

const installerPath = path.join(distDir, installer);
const buffer = fs.readFileSync(installerPath);
const sha512 = crypto.createHash('sha512').update(buffer).digest('base64');
const size = fs.statSync(installerPath).size;
const releaseDate = new Date().toISOString();

const metadata = [
  `version: ${version}`,
  'files:',
  `  - url: ${installer}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  `path: ${installer}`,
  `sha512: ${sha512}`,
  `releaseDate: ${releaseDate}`,
  `publicVersion: ${versionInfo.publicVersion}`,
  ''
].join('\n');

fs.writeFileSync(path.join(distDir, 'latest.yml'), metadata, 'utf8');

console.log('Updater metadata generated successfully.');
console.log(`Installer: ${installer}`);
console.log(`Size: ${size}`);
console.log(`SHA-512: ${sha512}`);
console.log(metadata);
