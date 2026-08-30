/* eslint-disable no-console */

import { readFileSync } from 'fs';
import { execSync, spawn } from 'child_process';

let prog = '??';
let tagName = '';
let isDryRun = false;
let vsxAlso = false;
let openVsxPat = '';

function errExit(...args) {
    console.error(`${prog}: Error:`, ...args);
    process.exit(1);
}

function ensureGitClean() {
    const gitStatus = execSync('git status --short').toString().trim();
    if (gitStatus) {
        errExit('Uncommitted changes exist. Cannot continue');
    }
}

function isPreRelease() {
    const path = './package.json';
    let obj;
    try {
        obj = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
        errExit(`Could not open/read file ${path}`, e);
    }
    const version = obj.version;
    if (!version) {
        errExit(`"version" property not found in ${path}`);
    }
    const minor = parseInt(version.split('.')[1], 10);
    tagName = 'v' + version;
    return (minor % 2) === 1;
}

function runProg(args) {
    return new Promise((resolve) => {
        const cmd = args.join(' ');
        if (isDryRun) {
            console.log(`[dryrun] ${cmd}`);
            resolve(0);
            return;
        }
        const [arg0, ...rest] = args;
        const child = spawn(arg0, rest, { stdio: 'inherit' });
        child.on('error', (error) => {
            console.error(`Error running '${cmd}': ${error.message}`);
            resolve(-1);
        });
        child.on('close', (code) => {
            console.log(`'${cmd}' ... exited with code ${code}`);
            resolve(code);
        });
    });
}

async function vsceRun(pkgOnly) {
    const args = ['npx', 'vsce', pkgOnly ? 'package' : 'publish'];
    if (!pkgOnly) {
        const envVar = process.env.VSCE_MD;
        if (!envVar) {
            errExit('Environment variable VSCE_MD not found. It should contain the Personal Access Token for VSCE publishing');
        }
        args.push('-p', envVar);
    }
    if (isPreRelease()) {
        args.push('--pre-release');
        if (vsxAlso) {
            console.log(`${prog}: Note: Not publishing to open-vsx because this is a pre-release`);
            vsxAlso = false;
        }
    }
    if (!isDryRun && !pkgOnly) {
        ensureGitClean();
    }
    const code = await runProg(args);
    if (!pkgOnly && code === 0) {
        const tagCode = await runProg(['git', 'tag', tagName]);
        if (tagCode !== 0) {
            errExit(`Failed 'git tag ${tagName}'`);
        }
        const pushCode = await runProg(['git', 'push', 'origin', tagName]);
        if (pushCode !== 0) {
            errExit(`Failed 'git push origin ${tagName}'`);
        }
        if (vsxAlso) {
            const vsxCode = await runProg(['npx', 'ovsx', 'publish', '-p', openVsxPat]);
            if (vsxCode !== 0) {
                errExit('Failed \'npx ovsx publish\'');
            }
        }
    }
}

async function run() {
    prog = process.argv[1];
    const argv = process.argv.slice(2);
    let isPkg = true;

    for (const arg of argv) {
        switch (arg) {
            case '-h':
            case '--help':
                console.log(`Usage: node ${prog} [--dryrun] [--package] [--publish] [--vsx-also]`);
                console.log('\t--package is the default');
                process.exit(0);
                break;
            case '--dryrun':
                isDryRun = true;
                console.log(`${prog}: This is a dryrun`);
                break;
            case '--package':
                isPkg = true;
                break;
            case '--publish':
                isPkg = false;
                break;
            case '--vsx-also':
                vsxAlso = true;
                openVsxPat = process.env.OPEN_VSX_PAT;
                if (!openVsxPat) {
                    errExit('Environment variable OPEN_VSX_PAT not found');
                }
                break;
            default:
                errExit(`Unknown argument '${arg}'`);
        }
    }

    if (isPkg) {
        vsxAlso = false;
    }
    await vsceRun(isPkg);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});

