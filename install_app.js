const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
const APPDATA = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
const USERPROFILE = process.env.USERPROFILE;

const INSTALL_DIR = path.join(LOCALAPPDATA, 'Programs', 'WinLocker');
const APP_DIR = path.join(INSTALL_DIR, 'resources', 'app');
const SRC_PROJECT = __dirname;

console.log('====================================================');
console.log('   WinLocker - Standalone Windows Installation      ');
console.log('====================================================');
console.log(`Installing to: ${INSTALL_DIR}\n`);

// 1. Ensure target directory exists
if (fs.existsSync(INSTALL_DIR)) {
  console.log('Existing installation found. Cleaning up...');
  try {
    fs.rmSync(INSTALL_DIR, { recursive: true, force: true });
  } catch (e) {
    console.log('Note: Some files might be locked. Overwriting...');
  }
}
fs.mkdirSync(INSTALL_DIR, { recursive: true });
fs.mkdirSync(APP_DIR, { recursive: true });

// 2. Copy Electron runtime binaries
console.log('1. Copying Electron runtime binaries...');
const electronDist = path.join(SRC_PROJECT, 'node_modules', 'electron', 'dist');

function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
  const files = fs.readdirSync(source);
  for (const file of files) {
    const curSource = path.join(source, file);
    const curTarget = path.join(target, file);
    if (fs.lstatSync(curSource).isDirectory()) {
      copyFolderRecursiveSync(curSource, curTarget);
    } else {
      fs.copyFileSync(curSource, curTarget);
    }
  }
}

// Copy dist files
const distFiles = fs.readdirSync(electronDist);
for (const file of distFiles) {
  const curSource = path.join(electronDist, file);
  if (file.toLowerCase() === 'electron.exe') {
    fs.copyFileSync(curSource, path.join(INSTALL_DIR, 'WinLocker.exe'));
    console.log('   - Created WinLocker.exe');
  } else if (file.toLowerCase() === 'resources') {
    // skip default electron resources, we will build app resources
    const electronDefaultRes = path.join(curSource, 'default_app.asar');
    if (fs.existsSync(electronDefaultRes)) {
      // ignore
    }
  } else {
    const curTarget = path.join(INSTALL_DIR, file);
    if (fs.lstatSync(curSource).isDirectory()) {
      copyFolderRecursiveSync(curSource, curTarget);
    } else {
      fs.copyFileSync(curSource, curTarget);
    }
  }
}

// 3. Copy application code into resources/app
console.log('2. Deploying WinLocker application assets & core...');
const copyItems = ['package.json', 'main.js', 'lib', 'src', 'assets'];
for (const item of copyItems) {
  const srcPath = path.join(SRC_PROJECT, item);
  const destPath = path.join(APP_DIR, item);
  if (fs.existsSync(srcPath)) {
    if (fs.lstatSync(srcPath).isDirectory()) {
      copyFolderRecursiveSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
    console.log(`   - Copied ${item}`);
  }
}

// Copy runtime dependencies from node_modules into resources/app/node_modules
console.log('3. Copying runtime dependencies...');
const destNodeModules = path.join(APP_DIR, 'node_modules');
fs.mkdirSync(destNodeModules, { recursive: true });

const pkgJson = JSON.parse(fs.readFileSync(path.join(SRC_PROJECT, 'package.json'), 'utf8'));
const runtimeDeps = Object.keys(pkgJson.dependencies || {});

for (const dep of runtimeDeps) {
  const depSrc = path.join(SRC_PROJECT, 'node_modules', dep);
  const depDest = path.join(destNodeModules, dep);
  if (fs.existsSync(depSrc)) {
    copyFolderRecursiveSync(depSrc, depDest);
    console.log(`   - Dependency: ${dep}`);
  }
}

// 4. Create Desktop and Start Menu Shortcuts
console.log('4. Creating Windows Shortcuts...');
const exePath = path.join(INSTALL_DIR, 'WinLocker.exe');
const iconPath = path.join(APP_DIR, 'src', 'assets', 'icon.ico');
const desktopPath = path.join(USERPROFILE, 'Desktop', 'WinLocker.lnk');
const startMenuPrograms = path.join(APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
const startMenuPath = path.join(startMenuPrograms, 'WinLocker.lnk');

const vbsScript = `
Set oWS = WScript.CreateObject("WScript.Shell")
sDesktop = "${desktopPath.replace(/\\/g, '\\\\')}"
Set oLink = oWS.CreateShortcut(sDesktop)
oLink.TargetPath = "${exePath.replace(/\\/g, '\\\\')}"
oLink.WorkingDirectory = "${INSTALL_DIR.replace(/\\/g, '\\\\')}"
oLink.Description = "WinLocker - Secure Stealth Vault"
oLink.IconLocation = "${iconPath.replace(/\\/g, '\\\\')}, 0"
oLink.Save

sStartMenu = "${startMenuPath.replace(/\\/g, '\\\\')}"
Set oLink2 = oWS.CreateShortcut(sStartMenu)
oLink2.TargetPath = "${exePath.replace(/\\/g, '\\\\')}"
oLink2.WorkingDirectory = "${INSTALL_DIR.replace(/\\/g, '\\\\')}"
oLink2.Description = "WinLocker - Secure Stealth Vault"
oLink2.IconLocation = "${iconPath.replace(/\\/g, '\\\\')}, 0"
oLink2.Save
`;

const tempVbs = path.join(INSTALL_DIR, 'create_shortcuts.vbs');
fs.writeFileSync(tempVbs, vbsScript);
execSync(`cscript //nologo "${tempVbs}"`);
try { fs.unlinkSync(tempVbs); } catch (_) {}
console.log('   - Desktop Shortcut created');
console.log('   - Start Menu Shortcut created');

// 5. Register Context Menu and .lock File Associations in HKCU
console.log('5. Registering Windows Context Menu & File Associations...');

const regCommands = [
  // .lock association
  `reg add "HKCU\\Software\\Classes\\.lock" /ve /d "WinLocker.LockFile" /f`,
  `reg add "HKCU\\Software\\Classes\\WinLocker.LockFile" /ve /d "WinLocker Encrypted File" /f`,
  `reg add "HKCU\\Software\\Classes\\WinLocker.LockFile\\DefaultIcon" /ve /d "\\"${iconPath}\\",0" /f`,
  `reg add "HKCU\\Software\\Classes\\WinLocker.LockFile\\shell\\open\\command" /ve /d "\\"${exePath}\\" \\"%%1\\"" /f`,

  // Right-click files
  `reg add "HKCU\\Software\\Classes\\*\\shell\\WinLocker" /ve /d "Lock with WinLocker" /f`,
  `reg add "HKCU\\Software\\Classes\\*\\shell\\WinLocker" /v "Icon" /d "${iconPath}" /f`,
  `reg add "HKCU\\Software\\Classes\\*\\shell\\WinLocker\\command" /ve /d "\\"${exePath}\\" \\"%%1\\"" /f`,

  // Right-click folders
  `reg add "HKCU\\Software\\Classes\\Directory\\shell\\WinLocker" /ve /d "Lock with WinLocker" /f`,
  `reg add "HKCU\\Software\\Classes\\Directory\\shell\\WinLocker" /v "Icon" /d "${iconPath}" /f`,
  `reg add "HKCU\\Software\\Classes\\Directory\\shell\\WinLocker\\command" /ve /d "\\"${exePath}\\" \\"%%1\\"" /f`
];

for (const cmd of regCommands) {
  try {
    execSync(cmd, { stdio: 'ignore' });
  } catch (err) {
    console.error('Failed to run registry cmd:', cmd, err.message);
  }
}
console.log('   - Registered Right-Click Context Menu ("Lock with WinLocker")');
console.log('   - Registered .lock File Association');

console.log('\n====================================================');
console.log('   INSTALLATION COMPLETE! 🎉                        ');
console.log('====================================================');
console.log(`The app is installed standalone at:\n${INSTALL_DIR}`);
console.log('\nYou can now safely delete the source repository folder (E:\\Win_locker).');
console.log('The app, context menu, desktop shortcut, and all your vault data in %APPDATA% will continue to work flawlessly!');
