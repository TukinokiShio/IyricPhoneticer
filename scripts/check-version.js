import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const version = manifest.version;
const releaseVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

if (typeof version !== 'string' || !releaseVersion.test(version)) {
  console.error('package.json 的 version 必须采用 X.Y.Z 格式。');
  process.exitCode = 1;
} else if (lock.version !== version || lock.packages?.['']?.version !== version) {
  console.error('package-lock.json 的项目版本与 package.json 不一致。请同步两个文件。');
  process.exitCode = 1;
} else {
  console.log(`版本一致：v${version}`);
}
