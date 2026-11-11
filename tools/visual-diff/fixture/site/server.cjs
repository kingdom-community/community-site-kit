'use strict';
// The self-test's fixture "site": static files from this directory on 127.0.0.1.
// "/" serves index.html and "/x" serves x.html.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const port = Number(process.argv[2]);
const types = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.json': 'application/json'};
http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? 'index.html' : path.extname(p) ? p.slice(1) : `${p.slice(1)}.html`;
    const file = path.resolve(__dirname, rel);
    if (!file.startsWith(__dirname + path.sep) || !fs.existsSync(file) || file.endsWith('.cjs')) {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end('not found');
        return;
    }
    res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1');
