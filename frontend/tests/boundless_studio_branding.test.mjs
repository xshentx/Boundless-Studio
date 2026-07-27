import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = join(frontendRoot, "..");
const read = (base, file) => readFileSync(join(base, file), "utf8");

const html = read(frontendRoot, "index.html");
assert.match(html, /<title>无界创作台 \u00b7 Boundless Studio<\/title>/);

const home = read(frontendRoot, "src/app/canvas/home/page.tsx");
assert.match(home, />无界创作台<\/h1>/);

const frontendPackage = JSON.parse(read(frontendRoot, "package.json"));
const frontendLock = JSON.parse(read(frontendRoot, "package-lock.json"));
assert.equal(frontendPackage.name, "boundless-studio");
assert.equal(frontendLock.name, "boundless-studio");
assert.equal(frontendLock.packages[""].name, "boundless-studio");

const wailsConfig = JSON.parse(read(projectRoot, "wails.json"));
assert.equal(wailsConfig.name, "boundless-studio");
assert.equal(wailsConfig.outputfilename, "BoundlessStudio");
assert.equal(wailsConfig.info.productName, "Boundless Studio");
assert.equal(wailsConfig.info.comments, "无界创作台");

const icon = readFileSync(join(projectRoot, "build/windows/icon.ico"));
assert.equal(icon.readUInt16LE(0), 0);
assert.equal(icon.readUInt16LE(2), 1);
const iconCount = icon.readUInt16LE(4);
assert.equal(iconCount, 9);
const iconSizes = Array.from({ length: iconCount }, (_, index) => {
  const size = icon.readUInt8(6 + index * 16);
  return size === 0 ? 256 : size;
});
assert.deepEqual(iconSizes, [16, 20, 24, 32, 40, 48, 64, 128, 256]);
assert.equal(readFileSync(join(projectRoot, "build/appicon.png")).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");

const mainGo = read(projectRoot, "main.go");
assert.match(mainGo, /applicationTitle\s+=\s+"无界创作台"/);
assert.match(mainGo, /SingleInstanceLock:\s*&options\.SingleInstanceLock/);
assert.match(mainGo, /UniqueId:\s+singleInstanceUniqueID/);
assert.match(mainGo, /OnSecondInstanceLaunch:[\s\S]*app\.showMainWindow\(\)/);
assert.match(mainGo, /OnBeforeClose:\s+app\.onBeforeClose/);

const trayGo = read(projectRoot, "tray.go");
assert.match(trayGo, /go:embed build\/windows\/icon\.ico/);
assert.match(trayGo, /trayOpenLabel\s+=\s+"打开无界创作台"/);
assert.match(trayGo, /trayHideLabel\s+=\s+"隐藏窗口"/);
assert.match(trayGo, /trayQuitLabel\s+=\s+"退出"/);
assert.match(trayGo, /runtime\.LockOSThread\(\)/);
assert.match(read(projectRoot, "go.mod"), /^module boundless-studio$/m);

// These legacy identifiers intentionally remain stable so existing data and settings migrate safely.
assert.match(read(projectRoot, "datastore.go"), /INFINITE_CANVAS_DATA_DIR/);
const relay = read(projectRoot, "relay.go");
assert.match(relay, /INFINITE_CANVAS_UPSTREAM/);
assert.match(relay, /"service": "boundless-studio"/);
assert.match(relay, /filepath\.Join\(dir, "InfiniteCanvas", "config\.json"\)/);

console.log("Boundless Studio branding and compatibility contract tests passed");
