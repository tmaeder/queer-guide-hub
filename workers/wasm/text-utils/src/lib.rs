use wasm_bindgen::prelude::*;

/// Clean HTML entities and common blog artifacts from content text.
#[wasm_bindgen]
pub fn clean_html_entities(raw: &str) -> String {
    if raw.is_empty() {
        return String::new();
    }

    let mut text = raw.to_string();

    // Named HTML entities
    let replacements: &[(&str, &str)] = &[
        ("&#8217;", "\u{2019}"),
        ("&#x2019;", "\u{2019}"),
        ("&#8216;", "\u{2018}"),
        ("&#x2018;", "\u{2018}"),
        ("&#8220;", "\u{201C}"),
        ("&#x201C;", "\u{201C}"),
        ("&#8221;", "\u{201D}"),
        ("&#x201D;", "\u{201D}"),
        ("&#8230;", "\u{2026}"),
        ("&#x2026;", "\u{2026}"),
        ("&#8211;", "\u{2013}"),
        ("&#x2013;", "\u{2013}"),
        ("&#8212;", "\u{2014}"),
        ("&#x2014;", "\u{2014}"),
        ("&amp;", "&"),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", "\""),
        ("&#039;", "'"),
        ("&apos;", "'"),
        ("&nbsp;", " "),
        ("&NBSP;", " "),
        ("\u{00A0}", " "),
    ];

    for (from, to) in replacements {
        text = text.replace(from, to);
    }

    // Decode remaining numeric entities: &#NNN;
    text = decode_numeric_entities(&text);

    // Remove blog post artifacts
    text = remove_post_artifacts(&text);

    // Normalize whitespace per line
    let lines: Vec<String> = text.lines().map(|l| l.trim().to_string()).collect();
    text = lines.join("\n");

    // Collapse excessive newlines
    while text.contains("\n\n\n") {
        text = text.replace("\n\n\n", "\n\n");
    }

    text.trim().to_string()
}

fn decode_numeric_entities(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let chars: Vec<char> = input.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        if chars[i] == '&' && i + 2 < len && chars[i + 1] == '#' {
            let is_hex = i + 3 < len && (chars[i + 2] == 'x' || chars[i + 2] == 'X');
            let start = if is_hex { i + 3 } else { i + 2 };
            let mut end = start;

            while end < len && chars[end] != ';' && end - start < 8 {
                end += 1;
            }

            if end < len && chars[end] == ';' {
                let num_str: String = chars[start..end].iter().collect();
                let code = if is_hex {
                    u32::from_str_radix(&num_str, 16).ok()
                } else {
                    num_str.parse::<u32>().ok()
                };

                if let Some(c) = code.and_then(char::from_u32) {
                    result.push(c);
                    i = end + 1;
                    continue;
                }
            }
        }
        result.push(chars[i]);
        i += 1;
    }

    result
}

fn remove_post_artifacts(text: &str) -> String {
    let mut result = text.to_string();

    // Remove "The post ... appeared first on ..." pattern
    if let Some(pos) = result
        .to_lowercase()
        .rfind("the post ")
    {
        if result.to_lowercase()[pos..].contains("appeared first on") {
            result.truncate(pos);
        }
    }

    // Remove "Continue reading ..." pattern
    if let Some(pos) = result
        .to_lowercase()
        .rfind("continue reading")
    {
        // Check that it's near the end (within last 200 chars)
        if result.len() - pos < 200 {
            result.truncate(pos);
        }
    }

    result
}

/// Normalize a JSON record's string fields: trim whitespace, lowercase emails, parse dates.
/// Takes JSON string input, returns JSON string output.
///
/// Matches the TypeScript fallback behavior:
/// - Trims all string values
/// - Lowercases fields named "email" or ending with "_email"
/// - Parses date fields (ending with "_date", or named "start_date", "end_date", "date")
///   to ISO 8601 format when they contain a recognizable date string
#[wasm_bindgen]
pub fn normalize_record_fields(json: &str) -> String {
    let parsed: serde_json::Value = match serde_json::from_str(json) {
        Ok(v) => v,
        Err(_) => return json.to_string(),
    };

    let obj = match parsed.as_object() {
        Some(o) => o,
        None => return json.to_string(),
    };

    let mut normalized = serde_json::Map::new();

    for (key, value) in obj {
        if let Some(s) = value.as_str() {
            let mut v = s.trim().to_string();

            // Lowercase emails
            if key == "email" || key.ends_with("_email") {
                v = v.to_lowercase();
            }

            // Parse date fields to ISO 8601
            if is_date_field(key) && !v.is_empty() {
                if let Some(iso) = try_parse_date(&v) {
                    v = iso;
                }
            }

            normalized.insert(key.clone(), serde_json::Value::String(v));
        } else {
            normalized.insert(key.clone(), value.clone());
        }
    }

    serde_json::to_string(&serde_json::Value::Object(normalized))
        .unwrap_or_else(|_| json.to_string())
}

/// Check if a field name represents a date.
fn is_date_field(key: &str) -> bool {
    key == "date" || key == "start_date" || key == "end_date" || key.ends_with("_date")
}

/// Try to parse a date string into ISO 8601 format.
/// Supports: "YYYY-MM-DD", "MM/DD/YYYY", and strings already containing time components.
fn try_parse_date(input: &str) -> Option<String> {
    let s = input.trim();
    let bytes = s.as_bytes();

    // ISO-style: YYYY-MM-DD...
    if s.len() >= 10 && bytes.get(4) == Some(&b'-') && bytes.get(7) == Some(&b'-') {
        let year: u32 = s[0..4].parse().ok()?;
        let month: u32 = s[5..7].parse().ok()?;
        let day: u32 = s[8..10].parse().ok()?;
        if (1..=12).contains(&month) && (1..=31).contains(&day) && (1900..=2100).contains(&year) {
            if s.len() > 10 && (s.contains('T') || s.contains(' ')) {
                // Already has time component — return as-is
                return Some(s.to_string());
            }
            return Some(format!("{:04}-{:02}-{:02}T00:00:00.000Z", year, month, day));
        }
    }

    // US-style: MM/DD/YYYY
    if s.len() >= 10 && bytes.get(2) == Some(&b'/') && bytes.get(5) == Some(&b'/') {
        let month: u32 = s[0..2].parse().ok()?;
        let day: u32 = s[3..5].parse().ok()?;
        let year: u32 = s[6..10].parse().ok()?;
        if (1..=12).contains(&month) && (1..=31).contains(&day) && (1900..=2100).contains(&year) {
            return Some(format!("{:04}-{:02}-{:02}T00:00:00.000Z", year, month, day));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_basic_entities() {
        assert_eq!(clean_html_entities("&amp; &lt; &gt;"), "& < >");
    }

    #[test]
    fn clean_smart_quotes() {
        assert_eq!(
            clean_html_entities("&#8220;hello&#8221;"),
            "\u{201C}hello\u{201D}"
        );
    }

    #[test]
    fn clean_numeric_entities() {
        assert_eq!(clean_html_entities("&#65;&#66;&#67;"), "ABC");
    }

    #[test]
    fn clean_hex_entities() {
        assert_eq!(clean_html_entities("&#x41;&#x42;"), "AB");
    }

    #[test]
    fn clean_nbsp() {
        assert_eq!(clean_html_entities("hello&nbsp;world"), "hello world");
    }

    #[test]
    fn clean_post_artifacts() {
        let input = "Some content.\nThe post Example appeared first on Blog.";
        let result = clean_html_entities(input);
        assert!(!result.contains("appeared first on"));
    }

    #[test]
    fn normalize_trims_and_lowercases_email() {
        let input = r#"{"name":" John ","email":" JOHN@EXAMPLE.COM "}"#;
        let result = normalize_record_fields(input);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["name"], "John");
        assert_eq!(parsed["email"], "john@example.com");
    }

    #[test]
    fn normalize_preserves_non_strings() {
        let input = r#"{"name":"test","count":42,"active":true}"#;
        let result = normalize_record_fields(input);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["count"], 42);
        assert_eq!(parsed["active"], true);
    }

    #[test]
    fn collapse_newlines() {
        let input = "line1\n\n\n\nline2";
        let result = clean_html_entities(input);
        assert_eq!(result, "line1\n\nline2");
    }

    #[test]
    fn normalize_parses_iso_date() {
        let input = r#"{"start_date":"2024-06-15"}"#;
        let result = normalize_record_fields(input);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["start_date"], "2024-06-15T00:00:00.000Z");
    }

    #[test]
    fn normalize_parses_us_date() {
        let input = r#"{"end_date":"06/15/2024"}"#;
        let result = normalize_record_fields(input);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["end_date"], "2024-06-15T00:00:00.000Z");
    }

    #[test]
    fn normalize_preserves_iso_with_time() {
        let input = r#"{"date":"2024-06-15T10:30:00Z"}"#;
        let result = normalize_record_fields(input);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["date"], "2024-06-15T10:30:00Z");
    }

    #[test]
    fn normalize_skips_non_date_fields() {
        let input = r#"{"name":"2024-06-15","title":"something"}"#;
        let result = normalize_record_fields(input);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["name"], "2024-06-15");
    }

    #[test]
    fn normalize_handles_custom_date_suffix() {
        let input = r#"{"created_date":"2024-01-01"}"#;
        let result = normalize_record_fields(input);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["created_date"], "2024-01-01T00:00:00.000Z");
    }
}
