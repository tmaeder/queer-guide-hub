// ============================================================
// Safe Condition Parser — for pipeline edge conditions
// Uses a recursive descent parser (no dynamic code execution)
// ============================================================

type Value = string | number | boolean | null | undefined

interface ParseContext {
  items_count: number
  items_valid: number
  items_invalid: number
  entity_type: string
  source_name: string
  dry_run: boolean
  [key: string]: Value | Value[]
}

/**
 * Parse and check a simple condition expression against a context.
 * Supports: ==, !=, >, <, >=, <=, &&, ||, !, true, false
 *
 * Examples:
 *   "items_count > 0"
 *   "entity_type == 'venue'"
 *   "source_name != 'foursquare' && items_count >= 10"
 *   "dry_run == false"
 *   "true" (always pass)
 */
export function evaluateCondition(expression: string, context: ParseContext): boolean {
  if (!expression || expression.trim() === '' || expression.trim() === 'true') {
    return true
  }
  if (expression.trim() === 'false') {
    return false
  }

  try {
    return parseOr(expression.trim(), context)
  } catch (e) {
    console.error(`[condition-parser] Failed to parse "${expression}":`, e)
    return false // fail-closed: broken conditions block the edge, not pass silently
  }
}

// ---- Recursive descent parser ----

function parseOr(expr: string, ctx: ParseContext): boolean {
  const parts = splitTopLevel(expr, '||')
  return parts.some(part => parseAnd(part.trim(), ctx))
}

function parseAnd(expr: string, ctx: ParseContext): boolean {
  const parts = splitTopLevel(expr, '&&')
  return parts.every(part => parseComparison(part.trim(), ctx))
}

function parseComparison(expr: string, ctx: ParseContext): boolean {
  if (expr.startsWith('!')) {
    return !parseComparison(expr.slice(1).trim(), ctx)
  }

  if (expr.startsWith('(') && expr.endsWith(')')) {
    return parseOr(expr.slice(1, -1), ctx)
  }

  for (const op of ['>=', '<=', '!=', '==', '>', '<']) {
    const idx = expr.indexOf(op)
    if (idx !== -1) {
      const left = resolveValue(expr.slice(0, idx).trim(), ctx)
      const right = resolveValue(expr.slice(idx + op.length).trim(), ctx)
      return compare(left, op, right)
    }
  }

  const val = resolveValue(expr, ctx)
  return !!val
}

function resolveValue(token: string, ctx: ParseContext): Value {
  if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
    return token.slice(1, -1)
  }
  if (/^-?\d+(\.\d+)?$/.test(token)) {
    return parseFloat(token)
  }
  if (token === 'true') return true
  if (token === 'false') return false
  if (token === 'null') return null

  if (token in ctx) {
    return ctx[token] as Value
  }

  const parts = token.split('.')
  let current: unknown = ctx
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current as Value
}

function compare(left: Value, op: string, right: Value): boolean {
  switch (op) {
    case '==': return left === right
    case '!=': return left !== right
    case '>':  return (left as number) > (right as number)
    case '<':  return (left as number) < (right as number)
    case '>=': return (left as number) >= (right as number)
    case '<=': return (left as number) <= (right as number)
    default: return false
  }
}

function splitTopLevel(expr: string, delimiter: string): string[] {
  const parts: string[] = []
  let depth = 0
  let inQuote = ''
  let current = ''

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]

    if (inQuote) {
      current += ch
      if (ch === inQuote) inQuote = ''
      continue
    }

    if (ch === "'" || ch === '"') {
      inQuote = ch
      current += ch
      continue
    }

    if (ch === '(') { depth++; current += ch; continue }
    if (ch === ')') { depth--; current += ch; continue }

    if (depth === 0 && expr.slice(i, i + delimiter.length) === delimiter) {
      parts.push(current)
      current = ''
      i += delimiter.length - 1
      continue
    }

    current += ch
  }

  parts.push(current)
  return parts
}
