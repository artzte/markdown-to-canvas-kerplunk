const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { execSync } = require('child_process');

async function bundle() {
    console.log('⚡ Bundling kerplunk CLI with esbuild...');
    const distDir = path.join(__dirname, '..', 'dist');
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
    }

    const outfile = path.join(distDir, 'kerplunk');

    await esbuild.build({
        entryPoints: [path.join(__dirname, '..', 'bin', 'kerplunk.js')],
        bundle: true,
        platform: 'node',
        target: 'node18',
        outfile: outfile,
        minify: true,
        legalComments: 'inline'
    });

    // Make executable
    try {
        fs.chmodSync(outfile, 0o755);
    } catch {}

    // Generate Windows cmd shim in dist/
    const cmdFile = path.join(distDir, 'kerplunk.cmd');
    const cmdContent = `@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0
IF EXIST "%dp0%\\node.exe" (
  "%dp0%\\node.exe" "%dp0%\\kerplunk" %*
) ELSE (
  @SET PATHEXT=%PATHEXT:;.JS;=;%
  node "%dp0%\\kerplunk" %*
)
`;
    fs.writeFileSync(cmdFile, cmdContent, 'utf8');

    // Generate Windows PowerShell shim in dist/
    const psFile = path.join(distDir, 'kerplunk.ps1');
    const psContent = `#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent
if (Test-Path "$basedir/node.exe") {
  & "$basedir/node.exe" "$basedir/kerplunk" $args
} else {
  & "node" "$basedir/kerplunk" $args
}
exit $LASTEXITCODE
`;
    fs.writeFileSync(psFile, psContent, 'utf8');

    const stats = fs.statSync(outfile);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`\n✨ Bundled standalone executable: ${outfile} (${sizeMb} MB)`);
    console.log(`\nTo install globally to your user PATH:`);
    console.log(`  npm run install-cli`);
    console.log(`  (or run 'npm link' to install globally via npm)\n`);
}

if (require.main === module) {
    bundle().catch(err => {
        console.error('❌ Bundle failed:', err);
        process.exit(1);
    });
}

module.exports = { bundle };
