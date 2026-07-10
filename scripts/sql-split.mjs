// Minimal SQL statement splitter that respects single-quoted strings,
// dollar-quoted strings (with optional tag), line comments (-- ...), and
// block comments (/* ... */). Returns array of trimmed statements.
export function splitSql(sql) {
  const out = [];
  let buf = '';
  let i = 0;
  const N = sql.length;

  // state machine
  const S = { NORMAL: 0, S_QUOTE: 1, D_QUOTE: 2, LINE_COMMENT: 3, BLOCK_COMMENT: 4 };
  let state = S.NORMAL;
  // dollar quote bookkeeping: when we see $tag$ open we record the tag
  // and close on the same tag. Tags are [^$]+$.
  let dollarTag = null; // e.g. 'tag'

  function isDollarAt(pos) {
    if (sql[pos] !== '$') return null;
    // gather tag (may be empty for $$)
    let j = pos + 1;
    while (j < N && (sql[j] === '_' || /[A-Za-z0-9]/.test(sql[j]))) j++;
    if (sql[j] !== '$') return null;
    return sql.slice(pos, j + 1); // includes both $'s ($$ for empty tag)
  }

  while (i < N) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);

    if (state === S.LINE_COMMENT) {
      buf += c;
      if (c === '\n') state = S.NORMAL;
      i++;
      continue;
    }
    if (state === S.BLOCK_COMMENT) {
      buf += c;
      if (two === '*/') { buf += '/'; i += 2; state = S.NORMAL; continue; }
      i++;
      continue;
    }
    if (state === S.S_QUOTE) {
      buf += c;
      if (two === "''") { buf += "'"; i += 2; continue; }
      if (c === "'") { state = S.NORMAL; i++; continue; }
      i++;
      continue;
    }
    if (state === S.D_QUOTE) {
      buf += c;
      if (dollarTag) {
        if (sql.startsWith(dollarTag, i)) {
          buf += dollarTag.slice(1); // we already wrote first $
          i += dollarTag.length;
          dollarTag = null;
          state = S.NORMAL; // exit dollar-quoted region
          continue;
        }
        i++;
        continue;
      }
      // detect $tag$ open
      const tag = isDollarAt(i);
      if (tag) { dollarTag = tag; buf += tag.slice(1); i += tag.length; continue; }
      i++;
      continue;
    }
    // NORMAL
    if (two === '--') { state = S.LINE_COMMENT; buf += c; i++; continue; }
    if (two === '/*') { state = S.BLOCK_COMMENT; buf += c; i++; continue; }
    if (c === "'") { state = S.S_QUOTE; buf += c; i++; continue; }
    {
      const tag = isDollarAt(i);
      if (tag) { state = S.D_QUOTE; dollarTag = tag; buf += tag; i += tag.length; continue; }
    }
    if (c === ';') {
      const s = buf.trim();
      if (s) out.push(s);
      buf = '';
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}
