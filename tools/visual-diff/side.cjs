#!/usr/bin/env node
'use strict';
// Builds and serves one side (base or head) with the site config's own commands.
//
//   node side.cjs build --config visual-diff.json --dir checkout/head
//   node side.cjs serve --config visual-diff.json --dir checkout/head --port 3101 [--log serve.log]
//   node side.cjs stop  --dir checkout/head
//
// `build` runs `install` then `build`. `serve` starts `serve` in the background
// (with {port} filled in), writes its process group id to <dir>/.visual-diff.pid
// and waits until http://127.0.0.1:<port>/ answers. `stop` kills that group.
// The config's `env` is set for every command, with NEXT_TELEMETRY_DISABLED=1
// and CI=1 unless the config sets them.

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');
const lib = require('./lib.cjs');

function usage(message) {
    process.stderr.write(`side.cjs: ${message}\n` +
        'usage: node side.cjs build|serve|stop --dir DIR [--config FILE] [--port N] [--log FILE]\n');
    process.exit(2);
}

function parseArgs(argv) {
    const args = {cmd: argv[0]};
    if (!['build', 'serve', 'stop'].includes(args.cmd)) usage('first argument must be build, serve or stop');
    const keys = {'--config': 'config', '--dir': 'dir', '--port': 'port', '--log': 'log', '--timeout': 'timeout'};
    for (let i = 1; i < argv.length; i++) {
        const key = keys[argv[i]];
        if (!key || i + 1 >= argv.length) usage(`bad argument ${argv[i]}`);
        args[key] = argv[++i];
    }
    if (!args.dir) usage('--dir is required');
    if (args.cmd !== 'stop' && !args.config) usage('--config is required');
    if (args.cmd === 'serve' && !/^\d+$/.test(args.port || '')) usage('--port must be a number');
    return args;
}

function commandEnv(config) {
    return {NEXT_TELEMETRY_DISABLED: '1', CI: '1', ...process.env, ...config.env};
}

function run(label, command, dir, env) {
    process.stdout.write(`[${label}] $ ${command}\n`);
    const r = spawnSync(command, {cwd: dir, env, shell: '/bin/bash', stdio: 'inherit'});
    if (r.status !== 0) {
        process.stderr.write(`side.cjs: ${label} failed (exit ${r.status})\n`);
        process.exit(1);
    }
}

function probe(port) {
    return new Promise((resolve) => {
        const req = http.get({host: '127.0.0.1', port, path: '/', timeout: 5000}, (res) => {
            res.resume();
            resolve(res.statusCode);
        });
        req.on('error', () => resolve(0));
        req.on('timeout', () => { req.destroy(); resolve(0); });
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const dir = path.resolve(args.dir);
    const pidFile = path.join(dir, '.visual-diff.pid');
    if (args.cmd === 'stop') {
        if (fs.existsSync(pidFile)) {
            const pgid = Number(fs.readFileSync(pidFile, 'utf8'));
            try { process.kill(-pgid, 'SIGTERM'); } catch (e) { /* already gone */ }
            fs.rmSync(pidFile, {force: true});
        }
        return;
    }
    const config = lib.loadConfig(args.config);
    const env = commandEnv(config);
    if (args.cmd === 'build') {
        run('install', config.install, dir, env);
        run('build', config.build, dir, env);
        return;
    }
    const command = config.serve.split('{port}').join(args.port);
    const log = fs.openSync(args.log || path.join(dir, '.visual-diff-serve.log'), 'a');
    process.stdout.write(`[serve] $ ${command}\n`);
    const child = spawn(command, {cwd: dir, env: {...env, PORT: args.port}, shell: '/bin/bash',
        detached: true, stdio: ['ignore', log, log]});
    fs.writeFileSync(pidFile, String(child.pid));
    let exited = null;
    child.on('exit', (code) => { exited = code; });
    child.unref();
    const deadline = Date.now() + Number(args.timeout || 120) * 1000;
    while (Date.now() < deadline) {
        if (exited !== null) {
            process.stderr.write(`side.cjs: serve exited (${exited}) before answering on port ${args.port}\n`);
            process.exit(1);
        }
        const status = await probe(Number(args.port));
        if (status) {
            process.stdout.write(`[serve] http://127.0.0.1:${args.port}/ answered HTTP ${status}\n`);
            process.exit(0);
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    process.stderr.write(`side.cjs: nothing answered on port ${args.port} in time\n`);
    process.exit(1);
}

main();
