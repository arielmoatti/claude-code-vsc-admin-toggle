// VS Code Admin Toggle - a status bar button that decides whether VS Code's NEXT launch runs as
// administrator. It sets or clears Windows' RUNASADMIN compatibility flag for the running VS Code
// executable (HKCU AppCompatFlags\Layers, the same value the "Run this program as an
// administrator" checkbox writes). Elevation is fixed when a process starts, so a change applies
// only after VS Code is closed completely and reopened.
const vscode = require('vscode');
const cp = require('child_process');

const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers';
const FLAG = 'RUNASADMIN';
const RUN = { windowsHide: true };

let item;

// The running editor executable: Code.exe, or Insiders / a fork under its own name.
const exePath = () => process.execPath;

// The exe's compatibility layers as tokens, e.g. "~ HIGHDPIAWARE RUNASADMIN" -> ['HIGHDPIAWARE', 'RUNASADMIN'].
// Other layers are kept untouched when the flag is added or removed.
function readLayers() {
  try {
    const out = cp.execFileSync('reg', ['query', REG_KEY, '/v', exePath()],
      { ...RUN, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = /REG_SZ\s+(.*)$/m.exec(out);
    return m ? m[1].trim().split(/\s+/).filter(t => t && t !== '~') : [];
  } catch (e) {
    return []; // value absent
  }
}

const hasFlag = layers => layers.some(t => t.toUpperCase() === FLAG);

function writeLayers(layers) {
  if (layers.length) {
    cp.execFileSync('reg', ['add', REG_KEY, '/v', exePath(), '/t', 'REG_SZ', '/d', '~ ' + layers.join(' '), '/f'],
      { ...RUN, stdio: 'ignore' });
  } else {
    cp.execFileSync('reg', ['delete', REG_KEY, '/v', exePath(), '/f'], { ...RUN, stdio: 'ignore' });
  }
}

// Is THIS window's process elevated? `net session` succeeds only with an admin token.
function currentlyElevated() {
  try {
    cp.execFileSync('net', ['session'], { ...RUN, stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function render() {
  const next = hasFlag(readLayers());
  const now = currentlyElevated();
  item.text = next ? '$(shield) Admin: ON' : '$(shield) Admin: OFF';
  item.backgroundColor = next ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
  item.tooltip = [
    `This window: ${now ? 'running as administrator' : 'normal'}`,
    `Next launch: ${next ? 'as administrator' : 'normal'}`,
    '',
    'Click to switch. Applies after VS Code is closed completely and reopened.',
  ].join('\n');
}

async function toggle() {
  const layers = readLayers();
  const willSet = !hasFlag(layers);
  try {
    writeLayers(willSet ? [...layers, FLAG] : layers.filter(t => t.toUpperCase() !== FLAG));
  } catch (e) {
    vscode.window.showErrorMessage('Admin Toggle: could not change the setting. ' + e.message);
    return;
  }
  render();
  vscode.window.showInformationMessage(willSet
    ? 'Next launch: as administrator. Windows will ask for approval (UAC) on every launch, and dragging files from Explorer into VS Code will not work. Close VS Code completely and reopen to apply.'
    : 'Next launch: normal. No approval prompt, and dragging files into VS Code works again. Close VS Code completely and reopen to apply.');
}

function activate(context) {
  if (process.platform !== 'win32') return; // a Windows mechanism
  item = vscode.window.createStatusBarItem('adminToggle', vscode.StatusBarAlignment.Right, 100);
  item.name = 'Admin Toggle';
  item.command = 'adminToggle.toggle';
  context.subscriptions.push(item, vscode.commands.registerCommand('adminToggle.toggle', toggle));
  render();
  item.show();
}

function deactivate() {}

module.exports = { activate, deactivate };
