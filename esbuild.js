//@ts-check
'use strict';

const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

/** @type {import('esbuild').BuildOptions} */
const common = {
    bundle: true,
    external: ['vscode'],
    sourcemap: true,
    minify: isProduction,
    logLevel: 'info',
};

async function main() {
    const desktopCtx = await esbuild.context({
        ...common,
        platform: 'node',
        target: 'node24',
        entryPoints: ['src/desktop/extension.ts'],
        outdir: 'dist/desktop',
        format: 'cjs',
    });

    const browserCtx = await esbuild.context({
        ...common,
        platform: 'browser',
        target: 'es2022',
        entryPoints: ['src/browser/extension.ts'],
        outdir: 'dist/browser',
        format: 'cjs',
        inject: ['scripts/buffer-inject.js'],
        alias: {
            'events': 'events',
            'path': 'path-browserify',
            'stream': 'stream-browserify',
            'timers': 'timers-browserify',
        },
    });

    if (isWatch) {
        await desktopCtx.watch();
        await browserCtx.watch();
        console.log('Watching for changes...');
    } else {
        await desktopCtx.rebuild();
        await desktopCtx.dispose();
        await browserCtx.rebuild();
        await browserCtx.dispose();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
