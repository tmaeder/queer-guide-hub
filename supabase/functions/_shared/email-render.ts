import { stripEmailEditorMetadata } from "./email-template-content.ts";
import { toPlainText } from "./branding.ts";
interface Template {
  subject: string;
  html_content: string;
  text_content?: string | null;
  variables?: unknown;
}
interface Variable {
  name: string;
  required?: boolean;
  type?: string;
}
const token = /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g;
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]!),
  );
export function renderEmailTemplate(
  template: Template,
  values: Record<string, string>,
) {
  if (
    !values || typeof values !== "object" || Array.isArray(values) ||
    Object.values(values).some((v) => typeof v !== "string")
  ) throw new Error("Email variables must be strings");
  const declarations =
    (Array.isArray(template.variables) ? template.variables : []).filter((
      v,
    ): v is Variable =>
      !!v && typeof v === "object" && typeof v.name === "string"
    );
  for (const variable of declarations) {
    if (
      variable.required &&
      (!Object.hasOwn(values, variable.name) || !values[variable.name])
    ) throw new Error(`Missing email variable: ${variable.name}`);
  }
  const render = (source: string, html: boolean) =>
    source.replace(token, (_match, name: string) => {
      if (["__proto__", "prototype", "constructor"].includes(name)) {
        throw new Error("Unsafe email variable");
      }
      const declaration = declarations.find((v) => v.name === name);
      if (!Object.hasOwn(values, name)) {
        if (declaration?.required === false) return "";
        throw new Error(`Missing email variable: ${name}`);
      }
      const value = values[name];
      // Do not allow unsafe schemes to hide in quoted HTML attributes. Character
      // escaping alone does not make javascript: safe in a link.
      if (
        /^(javascript|vbscript|data):/i.test(
          Array.from(value).filter((character) =>
            character.charCodeAt(0) > 32 && character.charCodeAt(0) !== 127
          ).join(""),
        )
      ) throw new Error(`Unsafe email variable: ${name}`);
      if (declaration?.type === "url" || name.endsWith("_url")) {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password) {
          throw new Error(`Invalid email URL: ${name}`);
        }
      }
      // A callback preserves literal replacement sequences such as $& and $`.
      return html ? escapeHtml(value) : value;
    });
  const subject = render(template.subject, false);
  if (!subject.trim() || subject.length > 998 || /[\r\n]/.test(subject)) {
    throw new Error("Invalid email subject");
  }
  const html = render(stripEmailEditorMetadata(template.html_content), true);
  const text = template.text_content
    ? render(template.text_content, false)
    : toPlainText(html);
  return { subject, html, text };
}
