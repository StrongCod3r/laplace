const keywords = new Set(
  `add all alter analyze and any apply as asc authorization backup begin between by
  cascade case cast check collate column commit conflict constraint create cross current_date
  current_time current_timestamp database declare default delete desc describe distinct do drop
  else end escape except exclude exists explain false fetch filter first following for foreign
  from full function grant group groups having if ilike in index inner insert intersect interval
  into is join key last lateral left like limit materialized merge natural next not null nulls
  offset on only or order outer over partition preceding primary procedure qualify range recursive
  references rename replace returning revoke right rollback row rows schema select set show some
  table temporary then ties top transaction trigger true truncate unbounded union unique update
  use using vacuum values view when where window with within without`.split(/\s+/),
);

const types = new Set(
  `bigint bigserial binary bit blob bool boolean bytea char character clob date datetime
  datetime2 decimal double enum float image int int2 int4 int8 integer json jsonb money
  national nchar ntext numeric nvarchar precision real serial serial2 serial4 serial8 smallint
  smallserial text time timestamp timestamptz timetz tinyint uniqueidentifier uuid varbinary
  varchar varying xml`.split(/\s+/),
);

// Keep quoted content and comments atomic so their contents never become keywords.
const tokenPattern =
  /--[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|(?:\$([A-Za-z_][\w]*|)\$)[\s\S]*?(?:\$\1\$|$)|(?:\b(?:[eEnNbBxX]|[uU]&))?'(?:''|\\[\s\S]|[^'\\])*(?:'|$)|"(?:""|[^"])*(?:"|$)|`(?:``|[^`])*(?:`|$)|\[(?:\]\]|[^\]])*(?:\]|$)|::|:[A-Za-z_][\w$]*|@@?[A-Za-z_][\w$]*|\$\d+|\?|\b0[xX][\da-fA-F]+\b|(?:\b\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][\w$]*|->>|->|#>>|#>|\|\||<>|!=|<=|>=|!<|!>|[-+*/%=<>~^|&]/g;

export function highlightSql(
  source: string,
  escape: (text: string) => string,
  style: (html: string) => string,
): string {
  const pattern = new RegExp(tokenPattern);
  let output = '';
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    const token = match[0];
    const start = match.index;
    const normalized = token.toLowerCase();
    let kind = '';
    if (token.startsWith('--') || token.startsWith('/*')) kind = 'comment';
    else if (/^(?:'|(?:[enbx]|u&)'|\$(?:[a-z_][\w]*|)\$)/i.test(token)) kind = 'string';
    else if (/^["`\[]/.test(token)) kind = 'attr';
    else if (/^(?::(?!:)|@|\$\d|\?)/.test(token)) kind = 'directive';
    else if (/^(?:\d|\.\d)/.test(token)) kind = 'number';
    else if (keywords.has(normalized)) kind = 'keyword';
    else if (types.has(normalized)) kind = 'type';
    else if (/^[a-z_]/i.test(token) && /^\s*\(/.test(source.slice(start + token.length)))
      kind = 'function';
    else if (!/^[a-z_]/i.test(token)) kind = 'operator';
    output += escape(source.slice(last, start));
    output += kind
      ? style(`<span class="code-token ${kind}">${escape(token)}</span>`)
      : escape(token);
    last = start + token.length;
  }
  return output + escape(source.slice(last));
}
