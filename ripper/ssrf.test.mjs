/* The guard that stops this service being used to fetch things only it can
   reach. Run it with:  node ripper/ssrf.test.mjs
   It needs nothing installed and binds no public socket.

   The hole these tests exist for: publicUrl() judged only the address the
   caller typed, and one 302 was enough to get past it. Everything below
   either proves a hop is judged, or proves a notation that hides a private
   address inside a public-looking one is seen through. */
process.env.RIPPER_NO_LISTEN = '1';
import http from 'node:http';

let pass = 0, fail = 0;
const ok = (c, n, e = '') => {
    if (c) { pass++; console.log('  ok   ' + n); }
    else { fail++; console.log('  FAIL ' + n + (e ? '  ' + e : '')); }
};
const listen = (h) => new Promise(r => { const s = http.createServer(h); s.listen(0, () => r(s)); });
const port = (s) => s.address().port;

/* ---- addresses ------------------------------------------------------- */
{
    const { isPrivate } = await import('./server.mjs');
    console.log('isPrivate');
    for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '172.16.0.1',
                      '169.254.169.254', '100.64.0.1', '0.0.0.0'])
        ok(isPrivate(ip) === true, `${ip} is private`);
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34'])
        ok(isPrivate(ip) === false, `${ip} is public`);

    // Three notations write an IPv4 address inside an IPv6 one. Each is a way
    // to spell 127.0.0.1 or the metadata address that a prefix check misses.
    ok(isPrivate('::ffff:127.0.0.1') === true, '::ffff:127.0.0.1 — IPv4-mapped loopback');
    ok(isPrivate('::ffff:169.254.169.254') === true, '::ffff:169.254.169.254 — mapped metadata');
    ok(isPrivate('64:ff9b::7f00:1') === true, '64:ff9b::7f00:1 — NAT64 loopback');
    ok(isPrivate('64:ff9b::a9fe:a9fe') === true, '64:ff9b::a9fe:a9fe — NAT64 metadata');
    ok(isPrivate('2002:7f00:1::') === true, '2002:7f00:1:: — 6to4 loopback');
    ok(isPrivate('2002:a9fe:a9fe::') === true, '2002:a9fe:a9fe:: — 6to4 metadata');
    ok(isPrivate('::1') === true, '::1');
    ok(isPrivate('fdaa::3') === true, 'fdaa::3 — the private network this runs in');
    ok(isPrivate('fe80::1') === true, 'fe80::1 — link local');
    // Over-blocking is a bug too: these notations around a public address are
    // public, and refusing them would turn away legitimate links.
    ok(isPrivate('64:ff9b::808:808') === false, '64:ff9b::8.8.8.8 is public');
    ok(isPrivate('2a00:1450:4009:81f::200e') === false, 'an ordinary public IPv6');
}

/* ---- the first hop, with the production setting ----------------------- */
{
    const { publicUrl, walkRedirects } = await import('./server.mjs');
    console.log('publicUrl — private addresses refused, as in production');
    ok(await publicUrl('http://127.0.0.1/x') !== null, 'a literal private address');
    ok(await publicUrl('http://[::ffff:127.0.0.1]/x') !== null, 'an IPv4-mapped loopback');
    ok(await publicUrl('http://[64:ff9b::a9fe:a9fe]/x') !== null, 'a NAT64 metadata address');
    ok(await publicUrl('ftp://example.com/x') !== null, 'a non-http scheme');
    ok(await publicUrl('not a url') !== null, 'nonsense');

    const inner = await listen((q, w) => { w.writeHead(200); w.end('x'); });
    const bouncer = await listen((q, w) => {
        w.writeHead(302, { location: `http://127.0.0.1:${port(inner)}/secret` }); w.end();
    });
    ok(!!(await walkRedirects(`http://127.0.0.1:${port(bouncer)}/`)).error,
       'a redirect chain into private space is refused');
    inner.close(); bouncer.close();
}

/* ---- the walk itself --------------------------------------------------
   In a second process with private addresses allowed, so the chain can be
   built out of local servers at all. What is proved here is that the walk
   visits and judges each hop — using refusals that do not depend on the
   address being private. */
{
    const { fork } = await import('node:child_process');
    const code = `
process.env.RIPPER_NO_LISTEN = '1';
process.env.RIPPER_ALLOW_PRIVATE = '1';
import http from 'node:http';
const { walkRedirects } = await import(process.argv[2]);
const listen = (h) => new Promise(r => { const s = http.createServer(h); s.listen(0, () => r(s)); });
const port = (s) => s.address().port;
let hops = 0;
const out = [];
const final = await listen((q, w) => { w.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': '9' }); w.end('123456789'); });
const mid   = await listen((q, w) => { hops++; w.writeHead(302, { location: 'http://127.0.0.1:' + port(final) + '/' }); w.end(); });
const start = await listen((q, w) => { hops++; w.writeHead(302, { location: 'http://127.0.0.1:' + port(mid) + '/' }); w.end(); });
const loop  = await listen((q, w) => { w.writeHead(302, { location: 'http://127.0.0.1:' + port(loop) + '/' }); w.end(); });
const toFtp = await listen((q, w) => { w.writeHead(302, { location: 'ftp://example.com/x' }); w.end(); });
const toNx  = await listen((q, w) => { w.writeHead(302, { location: 'http://nx.invalid/x' }); w.end(); });
const r1 = await walkRedirects('http://127.0.0.1:' + port(start) + '/');
out.push([!r1.error && String(r1.url).includes(String(port(final))), 'ends on the final address, not the first']);
out.push([hops === 2, 'walked both redirects']);
out.push([!!r1.res && r1.res.status === 200, 'carries the final response for the header read']);
const r2 = await walkRedirects('http://127.0.0.1:' + port(loop) + '/');
out.push([!!r2.error && /redirects more than/.test(r2.error), 'refuses an endless redirect loop']);
// Hop 1 is reachable and allowed; hop 2 is a scheme publicUrl refuses whatever
// ALLOW_PRIVATE says. A refusal here can only have come from judging hop 2.
const r3 = await walkRedirects('http://127.0.0.1:' + port(toFtp) + '/');
out.push([!!r3.error && /http/i.test(r3.error), 'refuses at hop 2, having allowed hop 1']);
const r4 = await walkRedirects('http://127.0.0.1:' + port(toNx) + '/');
out.push([!!r4.error && /resolve/i.test(r4.error), 'refuses a hop whose host does not resolve']);
for (const s of [final, mid, start, loop, toFtp, toNx]) s.close();
console.log(JSON.stringify(out));
`;
    const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const dir = mkdtempSync(path.join(tmpdir(), 'ssrf-'));
    const file = path.join(dir, 'walk.mjs');
    writeFileSync(file, code);
    const here = new URL('./server.mjs', import.meta.url).href;
    console.log('walkRedirects — every hop, not only the first');
    const res = await new Promise((r) => {
        const c = fork(file, [here], { stdio: ['ignore', 'pipe', 'inherit', 'ipc'] });
        let buf = ''; c.stdout.on('data', d => buf += d);
        c.on('close', () => r(buf.trim().split('\n').pop()));
    });
    rmSync(dir, { recursive: true, force: true });
    for (const [good, name] of JSON.parse(res)) ok(good, name);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
