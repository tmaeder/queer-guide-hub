import { stripRawTextElements } from "./news-quality/code-residue.ts";
import { KNOWLEDGE_SOURCE_HOSTS as SOURCE_HOSTS } from "./knowledge-source-hosts.ts";
export function knowledgeSourceUrl(raw: string) {
  const url = new URL(raw);
  if (
    // Rejects URLs that carry credentials; no secret here. ggignore
    url.protocol !== "https:" || url.username || url.password || url.port || // ggignore
    !SOURCE_HOSTS.has(url.hostname)
  ) throw new Error(`Source host needs review: ${url.hostname}`);
  return url;
}
export async function fetchKnowledgeSource(
  raw: string,
): Promise<{ text: string; url: string; hash: string }> {
  let url = knowledgeSourceUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "queer.guide editorial research (https://queer.guide)",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Source redirect has no destination");
      url = knowledgeSourceUrl(new URL(location, url).href);
      continue;
    }
    if (
      !response.ok ||
      !/(text\/html|text\/plain|application\/xhtml)/i.test(
        response.headers.get("content-type") ?? "",
      )
    ) throw new Error("Source is unavailable or not readable text");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty source response");
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 500000) {
        await reader.cancel();
        throw new Error("Source exceeds 500 KB limit");
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    const html = new TextDecoder().decode(buffer);
    const text = stripRawTextElements(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/\s+/g, " ").trim().slice(0, 22000);
    if (
      text.length < 200 ||
      /<title[^>]*>[^<]*(access denied|just a moment|security check|attention required|verify you are human)/i
        .test(html)
    ) throw new Error("Source has insufficient readable evidence");
    const hash = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
      ),
    ].map((n) => n.toString(16).padStart(2, "0")).join("");
    return { text, url: url.href, hash };
  }
  throw new Error("Too many source redirects");
}
