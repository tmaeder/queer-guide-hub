import {
  MAX_LIST_ROWS,
  formatScalar,
  humanizeKey,
  isPlainObject,
  normalizeStructured,
} from './structuredValue';

interface StructuredValueViewProps {
  value: unknown;
  /** Text shown when there is nothing to display. */
  emptyLabel?: string;
  className?: string;
}

const URL_RE = /^https?:\/\/\S+$/i;

function Scalar({ value }: { value: unknown }) {
  if (typeof value === 'string' && URL_RE.test(value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="break-all underline">
        {value}
      </a>
    );
  }
  const text = formatScalar(value);
  return (
    <span className={text === '—' ? 'text-muted-foreground' : 'break-words whitespace-pre-wrap'}>
      {text}
    </span>
  );
}

function Node({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">No items</span>;
    if (value.length > MAX_LIST_ROWS) {
      return (
        <span className="text-muted-foreground">
          {value.length.toLocaleString()} items (too many to list)
        </span>
      );
    }
    const allScalar = value.every((x) => !Array.isArray(x) && !isPlainObject(x));
    if (allScalar) {
      return (
        <ul className="flex flex-col gap-0.5 list-disc pl-4">
          {value.map((item, i) => (
            <li key={i}>
              <Scalar value={item} />
            </li>
          ))}
        </ul>
      );
    }
    return (
      <ol className="flex flex-col gap-2">
        {value.map((item, i) => (
          <li key={i} className="border-l-2 border-border pl-2">
            <span className="text-2xs uppercase tracking-wide text-muted-foreground">
              Item {i + 1}
            </span>
            <Node value={item} />
          </li>
        ))}
      </ol>
    );
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return <span className="text-muted-foreground">No fields</span>;
    return (
      <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{humanizeKey(k)}</dt>
            <dd className="min-w-0">
              {Array.isArray(v) || isPlainObject(v) ? (
                <div className="border-l-2 border-border pl-2">
                  <Node value={v} />
                </div>
              ) : (
                <Scalar value={v} />
              )}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <Scalar value={value} />;
}

/**
 * Read-only rendering of a jsonb value as labelled rows and lists.
 * Never shows JSON syntax.
 */
export function StructuredValueView({ value, emptyLabel = 'No data yet.', className }: StructuredValueViewProps) {
  const v = normalizeStructured(value);
  const empty =
    v === null ||
    v === undefined ||
    v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    (isPlainObject(v) && Object.keys(v).length === 0);
  return (
    <div className={`text-sm ${className ?? ''}`}>
      {empty ? <span className="text-muted-foreground">{emptyLabel}</span> : <Node value={v} />}
    </div>
  );
}
