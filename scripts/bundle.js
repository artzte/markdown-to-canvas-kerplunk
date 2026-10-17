const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { execSync } = require('child_process');

async function bundle() {
    console.log('📦 Step 1: Pre-compiling themes...');
    execSync('node scripts/build-themes.js', { stdio: 'inherit' });

    console.log('⚡ Step 2: Bundling kerplunk CLI with esbuild...');
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
    fs.chmodSync(outfile, 0o755);

    const stats = fs.statSync(outfile);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`\n✨ Bundled standalone executable: ${outfile} (${sizeMb} MB)`);
    console.log(`\nTo install globally to your user PATH:`);
    console.log(`  cp dist/kerplunk ~/.local/bin/kerplunk`);
    console.log(`\nOr run:`);
    console.log(`  npm run install-cli\n`);
}

bundle().catch(err => {
    console.error('❌ Bundle failed:', err);
    process.exit(1);
});
