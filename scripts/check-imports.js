// Pre-release check: every import between app files must exist in the target file's exports, and no
// file may mix `module.exports = {…}` with ES `export` (Babel then drops the exported names).
// Usage: NODE_PATH=../dine-app/node_modules node scripts/check-imports.js .
// Every named/default import between app files must exist in the target's exports.
const fs = require('fs'), path = require('path');
const parser = require('@babel/parser');
const ROOT = process.argv[2];
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', '.git', 'android', 'ios', '.expo', 'dist'].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|jsx)$/.test(e.name)) files.push(p); } })(ROOT);
const parse = (f) => parser.parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx', 'classProperties', 'optionalChaining', 'dynamicImport'], errorRecovery: true });
const exportsOf = new Map();
function getExports(f) {
  if (exportsOf.has(f)) return exportsOf.get(f);
  const ex = { names: new Set(), hasDefault: false, cjsKeys: null, cjsAny: false };
  let ast; try { ast = parse(f); } catch (e) { ex.cjsAny = true; exportsOf.set(f, ex); return ex; }
  for (const n of ast.program.body) {
    if (n.type === 'ExportDefaultDeclaration') ex.hasDefault = true;
    if (n.type === 'ExportNamedDeclaration') {
      if (n.declaration) { if (n.declaration.id) ex.names.add(n.declaration.id.name); (n.declaration.declarations || []).forEach(d => d.id && d.id.name && ex.names.add(d.id.name)); }
      (n.specifiers || []).forEach(s => ex.names.add(s.exported.name === 'default' ? (ex.hasDefault = true, 'default') : s.exported.name));
    }
    if (n.type === 'ExportAllDeclaration') ex.cjsAny = true;
    if (n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' && n.expression.left.type === 'MemberExpression' && n.expression.left.object.name === 'module' && n.expression.left.property.name === 'exports') {
      const r = n.expression.right; if (r.type === 'ObjectExpression') { ex.cjsKeys = new Set(r.properties.map(p => p.key && (p.key.name || p.key.value)).filter(Boolean)); } else ex.cjsAny = true;
    }
  }
  exportsOf.set(f, ex); return ex;
}
const resolve = (from, src) => { const b = path.resolve(path.dirname(from), src); for (const c of [b, b + '.js', b + '.jsx', path.join(b, 'index.js')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; return null; };
let problems = 0, checked = 0;
for (const f of files) {
  let ast; try { ast = parse(f); } catch (_) { continue; }
  for (const n of ast.program.body) {
    if (n.type !== 'ImportDeclaration' || !n.source.value.startsWith('.')) continue;
    const t = resolve(f, n.source.value); if (!t) { console.log(`MISSING FILE ${path.relative(ROOT, f)} → ${n.source.value}`); problems++; continue; }
    const ex = getExports(t);
    for (const s of n.specifiers) {
      checked++;
      if (ex.cjsAny) continue;
      if (s.type === 'ImportDefaultSpecifier') { if (!ex.hasDefault && !ex.cjsKeys) { console.log(`NO DEFAULT  ${path.relative(ROOT, f)} ← ${path.relative(ROOT, t)}`); problems++; } continue; }
      if (s.type === 'ImportNamespaceSpecifier') continue;
      const name = s.imported.name;
      const mixed = ex.cjsKeys && ex.names.size > 0;
      const ok = ex.cjsKeys ? ex.cjsKeys.has(name) && !mixed : ex.names.has(name);
      if (!ok) { console.log(`${mixed ? 'MIXED-EXPORT' : 'NOT EXPORTED'} ${path.relative(ROOT, f)}: { ${name} } ← ${path.relative(ROOT, t)}`); problems++; }
    }
  }
}
console.log(`checked ${checked} imports in ${files.length} files → ${problems} problem(s)`);
