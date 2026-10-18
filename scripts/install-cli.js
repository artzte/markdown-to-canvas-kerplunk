const fs = require('fs');
const path = require('path');
const os = require('os');
const { bundle } = require('./bundle.js');

async function install() {
    await bundle();

    const distDir = path.join(__dirname, '..', 'dist');
    const sourceExe = path.join(distDir, 'kerplunk');

    if (!fs.existsSync(sourceExe)) {
        throw new Error(`Bundled executable not found at '${sourceExe}'`);
    }

    const isWin = process.platform === 'win32';
    const targetDir = path.join(os.homedir(), '.local', 'bin');

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy main binary
    const targetExe = path.join(targetDir, 'kerplunk');
    fs.copyFileSync(sourceExe, targetExe);
    try {
        fs.chmodSync(targetExe, 0o755);
    } catch {}

    // On Windows, also copy .cmd and .ps1 shims so it can be executed in cmd and PowerShell
    if (isWin) {
        const cmdSource = path.join(distDir, 'kerplunk.cmd');
        const psSource = path.join(distDir, 'kerplunk.ps1');
        if (fs.existsSync(cmdSource)) {
            fs.copyFileSync(cmdSource, path.join(targetDir, 'kerplunk.cmd'));
        }
        if (fs.existsSync(psSource)) {
            fs.copyFileSync(psSource, path.join(targetDir, 'kerplunk.ps1'));
        }
    }

    console.log(`\n✅ kerplunk installed to: ${targetExe}`);

    // Check if targetDir is in PATH
    const envPath = process.env.PATH || '';
    const inPath = envPath
        .split(path.delimiter)
        .some(p => path.resolve(p).toLowerCase() === path.resolve(targetDir).toLowerCase());

    if (!inPath) {
        if (isWin) {
            console.log(`\n💡 Tip: Add '${targetDir}' to your Windows PATH, or run:`);
            console.log(`   npm link`);
            console.log(`   to make 'kerplunk' available everywhere.\n`);
        } else {
            console.log(`\n💡 Tip: Add '${targetDir}' to your PATH by adding this to ~/.bashrc or ~/.zshrc:`);
            console.log(`   export PATH="$HOME/.local/bin:$PATH"\n`);
        }
    } else {
        console.log(`\n✨ 'kerplunk' is now ready to use from your terminal!\n`);
    }
}

install().catch(err => {
    console.error('❌ Installation failed:', err.message || err);
    process.exit(1);
});
