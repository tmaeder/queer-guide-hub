use wasm_bindgen::prelude::*;

/// Parse a CSV string into a JSON array of arrays.
/// Handles quoted fields, escaped quotes (""), and embedded newlines within quotes.
#[wasm_bindgen]
pub fn parse_csv(csv: &str) -> JsValue {
    let rows = parse(csv);
    serde_wasm_bindgen::to_value(&rows).unwrap_or(JsValue::NULL)
}

fn parse(csv: &str) -> Vec<Vec<String>> {
    let chars: Vec<char> = csv.chars().collect();
    let len = chars.len();
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut field = String::new();
    let mut in_quotes = false;
    let mut i = 0;

    while i < len {
        let ch = chars[i];

        if in_quotes {
            if ch == '"' {
                if i + 1 < len && chars[i + 1] == '"' {
                    field.push('"');
                    i += 2;
                    continue;
                }
                in_quotes = false;
                i += 1;
                continue;
            }
            field.push(ch);
            i += 1;
        } else {
            match ch {
                '"' => {
                    in_quotes = true;
                    i += 1;
                }
                ',' => {
                    row.push(field.trim().to_string());
                    field = String::new();
                    i += 1;
                }
                '\n' => {
                    row.push(field.trim().to_string());
                    field = String::new();
                    if row.iter().any(|f| !f.is_empty()) {
                        rows.push(row);
                    }
                    row = Vec::new();
                    i += 1;
                }
                '\r' if i + 1 < len && chars[i + 1] == '\n' => {
                    row.push(field.trim().to_string());
                    field = String::new();
                    if row.iter().any(|f| !f.is_empty()) {
                        rows.push(row);
                    }
                    row = Vec::new();
                    i += 2;
                }
                _ => {
                    field.push(ch);
                    i += 1;
                }
            }
        }
    }

    if !field.is_empty() || !row.is_empty() {
        row.push(field.trim().to_string());
        if row.iter().any(|f| !f.is_empty()) {
            rows.push(row);
        }
    }

    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_csv() {
        let result = parse("a,b,c\n1,2,3\n");
        assert_eq!(result, vec![vec!["a", "b", "c"], vec!["1", "2", "3"]]);
    }

    #[test]
    fn quoted_fields() {
        let result = parse("\"hello, world\",b\n");
        assert_eq!(result, vec![vec!["hello, world", "b"]]);
    }

    #[test]
    fn escaped_quotes() {
        let result = parse("\"he said \"\"hi\"\"\",b\n");
        assert_eq!(result, vec![vec!["he said \"hi\"", "b"]]);
    }

    #[test]
    fn embedded_newlines() {
        let result = parse("\"line1\nline2\",b\n");
        assert_eq!(result, vec![vec!["line1\nline2", "b"]]);
    }

    #[test]
    fn crlf_line_endings() {
        let result = parse("a,b\r\n1,2\r\n");
        assert_eq!(result, vec![vec!["a", "b"], vec!["1", "2"]]);
    }

    #[test]
    fn empty_rows_skipped() {
        let result = parse("a,b\n,,\n1,2\n");
        assert_eq!(result, vec![vec!["a", "b"], vec!["1", "2"]]);
    }

    #[test]
    fn trims_whitespace() {
        let result = parse(" a , b \n 1 , 2 \n");
        assert_eq!(result, vec![vec!["a", "b"], vec!["1", "2"]]);
    }

    #[test]
    fn no_trailing_newline() {
        let result = parse("a,b\n1,2");
        assert_eq!(result, vec![vec!["a", "b"], vec!["1", "2"]]);
    }

    #[test]
    fn multibyte_utf8_characters() {
        let result = parse("café,naïve\nBüro,日本語\n");
        assert_eq!(
            result,
            vec![
                vec!["café", "naïve"],
                vec!["Büro", "日本語"],
            ]
        );
    }

    #[test]
    fn quoted_multibyte_with_comma() {
        let result = parse("\"São Paulo, Brazil\",\"München\"\n");
        assert_eq!(result, vec![vec!["São Paulo, Brazil", "München"]]);
    }
}
