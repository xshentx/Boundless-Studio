import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(frontendRoot);
register(pathToFileURL(join(frontendRoot, "scripts/ts-path-alias-loader.mjs")), pathToFileURL(`${frontendRoot}/`));

const { DESKTOP_LOOPBACK_ORIGIN, desktopApiUrl, shouldUseDesktopLoopback } = await import(
  pathToFileURL(join(frontendRoot, "src/services/desktop-api-url.ts")).href
);

assert.equal(shouldUseDesktopLoopback("wails:"), true, "packaged macOS Wails requests must bypass the custom asset scheme");
assert.equal(shouldUseDesktopLoopback("file:"), false, "untrusted opaque file origins must not receive loopback CORS access");
assert.equal(shouldUseDesktopLoopback("http:"), false, "Vite and Windows HTTP origins must retain relative proxy URLs");
assert.equal(desktopApiUrl("/local-relay-proxy/images/edits/", "wails:"), `${DESKTOP_LOOPBACK_ORIGIN}/local-relay-proxy/images/edits/`);
assert.equal(desktopApiUrl("client-api/media?key=image", "wails:"), `${DESKTOP_LOOPBACK_ORIGIN}/client-api/media?key=image`);
assert.equal(desktopApiUrl("/local-relay-proxy/images/edits/", "http:"), "/local-relay-proxy/images/edits/");

const relayProxySource = readFileSync(join(frontendRoot, "src/services/api/relay-proxy.ts"), "utf8");
const desktopStorageSource = readFileSync(join(frontendRoot, "src/services/desktop-storage.ts"), "utf8");
const webdavSource = readFileSync(join(frontendRoot, "src/services/webdav-sync.ts"), "utf8");
const sharedRequestSource = readFileSync(join(frontendRoot, "src/lib/request.ts"), "utf8");
const apiRequestSource = readFileSync(join(frontendRoot, "src/services/api/request.ts"), "utf8");
const videoSource = readFileSync(join(frontendRoot, "src/services/api/video.ts"), "utf8");
const appSource = readFileSync(join(frontendRoot, "../app.go"), "utf8");
const relayGoSource = readFileSync(join(frontendRoot, "../relay.go"), "utf8");
const macInfoPlist = readFileSync(join(frontendRoot, "../build/darwin/Info.plist"), "utf8");
assert.match(relayProxySource, /desktopApiUrl\(`\$\{LOCAL_RELAY_PROXY_PREFIX\}/, "AI JSON and multipart requests must use the macOS loopback transport");
assert.match(desktopStorageSource, /desktopApiUrl\(`\/client-api\/media/, "media blob uploads must bypass the macOS Wails body stream");
assert.match(desktopStorageSource, /desktopApiUrl\(`\/client-api\/state/, "state JSON writes must bypass the macOS Wails body stream");
assert.match(webdavSource, /fetch\(desktopApiUrl\("\/webdav-proxy"\)/, "WebDAV request bodies must use the same macOS-safe transport");
assert.match(sharedRequestSource, /url:\s*desktopApiUrl\(path\)/, "shared JSON and multipart API requests must use the macOS loopback transport");
assert.match(apiRequestSource, /url:\s*desktopApiUrl\(config\.url\)/, "auth and admin JSON requests must bypass the macOS Wails body stream");
assert.match(videoSource, /axios\.post[^\n]+desktopApiUrl\("\/api\/v1\/media\/references"\)/, "reference media FormData uploads must bypass the macOS Wails body stream");
assert.doesNotMatch(appSource, /_\s*=\s*a\.relay\.StartLoopback\(ctx\)/, "loopback bind errors must not be discarded");
assert.match(appSource, /if err := a\.relay\.StartLoopback\(ctx\); err != nil/, "desktop startup must handle loopback bind errors");
assert.match(appSource, /wailsruntime\.MessageDialog\(/, "loopback startup failures must be visible to the user");
assert.match(appSource, /wailsruntime\.Quit\(ctx\)/, "the app must not continue when its required loopback service is unavailable");
assert.match(relayGoSource, new RegExp(`desktopAPIPort\\s*=\\s*"${DESKTOP_LOOPBACK_ORIGIN.split(":").at(-1)}"`), "frontend and Go loopback ports must remain synchronized");
assert.match(macInfoPlist, /<key>NSAllowsLocalNetworking<\/key>\s*<true\/>/, "packaged macOS builds must allow the desktop loopback transport");

console.log("macOS request-body loopback tests passed");
