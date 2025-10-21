const fs = require('fs');
const path = require('path');


const DEFAULT_DB = path.resolve(process.cwd(), 'frags.json');

function sampleData() {
    return [
        { id: 't1', key: 'engine/start', frag: 'Ignition sequence start', tags: ['engine', 'start'] },
        { id: 't2', key: 'engine/stop', frag: 'Shutdown sequence', tags: ['engine', 'stop'] },
        { id: 'trq/limit', key: 'torque/limit', frag: 'Torque limit handler', tags: ['torque'] },
        { id: 'brk/check', key: 'brake/check', frag: 'Brake pressure check', tags: ['brake'] },
        { id: 'trx/frag', key: 'transmission/fragment', frag: 'Transmission fragment example', tags: ['transmission'] },
    ];
}

function ensureDb(file) {
    if (!fs.existsSync(file)) {
        const data = sampleData();
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
        console.log(`Created sample DB at ${file}`);
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function levenshtein(a, b) {
    // iterative two-row algorithm
    if (!a) return b ? b.length : 0;
    if (!b) return a.length;
    const m = a.length, n = b.length;
    let prev = new Array(n + 1).map((_, i) => i);
    let cur = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
        cur[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, cur] = [cur, prev];
    }
    return prev[n];
}

function similarity(a, b) {
    if (!a && !b) return 1;
    const d = levenshtein(a, b);
    const max = Math.max(a.length, b.length);
    return max === 0 ? 1 : 1 - d / max;
}

function search(db, q, { threshold = 0.4, limit = 10 } = {}) {
    q = String(q).toLowerCase();
    const results = db.map(item => {
        const key = String(item.key || '').toLowerCase();
        const frag = String(item.frag || '').toLowerCase();
        const tags = (item.tags || []).join(' ').toLowerCase();
        // scoring:
        if (key === q || frag === q) return { item, score: 1.0, reason: 'exact' };
        if (key.startsWith(q) || frag.startsWith(q)) return { item, score: 0.95, reason: 'prefix' };
        if (key.includes(q) || frag.includes(q) || tags.includes(q)) return { item, score: 0.8, reason: 'contains' };
        // fuzzy match against key and frag
        const s1 = similarity(q, key);
        const s2 = similarity(q, frag);
        const s = Math.max(s1, s2);
        return { item, score: s, reason: 'fuzzy' };
    }).filter(r => r.score >= threshold);

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
}

function printResults(results) {
    if (!results.length) {
        console.log('No results.');
        return;
    }
    for (const r of results) {
        const i = r.item;
        console.log('---');
        console.log(`id: ${i.id || '-'}`);
        console.log(`key: ${i.key || '-'}`);
        console.log(`score: ${r.score.toFixed(3)} (${r.reason})`);
        console.log(`frag: ${i.frag || '-'}`);
        if (i.tags && i.tags.length) console.log(`tags: ${i.tags.join(', ')}`);
    }
}

// --- arg parsing (very small) ---
const argv = process.argv.slice(2);
if (argv.length === 0) {
    console.log('Usage: node index.js <query> [-f db.json] [--threshold 0.5] [--limit 10]');
    process.exit(0);
}

let query = null;
let dbFile = DEFAULT_DB;
let threshold = 0.4;
let limit = 10;

for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!query && !a.startsWith('-')) {
        query = a;
        continue;
    }
    if (a === '-f' && argv[i + 1]) {
        dbFile = path.resolve(argv[++i]);
        continue;
    }
    if (a === '--threshold' && argv[i + 1]) {
        threshold = Math.max(0, Math.min(1, parseFloat(argv[++i]) || 0));
        continue;
    }
    if (a === '--limit' && argv[i + 1]) {
        limit = Math.max(1, parseInt(argv[++i], 10) || 10);
        continue;
    }
    // ignore unknown flags
}

if (!query) {
    console.error('Query missing.');
    process.exit(2);
}

try {
    const db = ensureDb(dbFile);
    const results = search(db, query, { threshold, limit });
    printResults(results);
} catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}