# CSV Cleanroom

A free, single-page CSV cleaner that runs **entirely in the browser**. No server, no uploads, no cookies, no trackers, no build step. Built as a free companion to the [Python Automation Bundle](https://jachym00.gumroad.com/l/qafztd).

## What it does

Drop in a CSV (or paste the text) and get a cleaner copy:

- **Load a file or paste text** — `.csv`, `.tsv`, `.txt`; file never leaves the tab.
- **Delimiter detection** — comma, semicolon, tab, or pipe; quoted delimiters are ignored while voting. You can also force one.
- **UTF-8 BOM handling** — a BOM is detected and stripped, and the detected encoding is reported.
- **Trimmed cells** — spaces, tabs, NBSP, and stray BOM characters at cell edges.
- **Decimal commas → dots** — `12,5` → `12.5`, `1 234,56` → `1234.56`, `1.234,56` → `1234.56`, percentages included.
- **Dates → ISO 8601** — `05.01.2024`, `5/1/24`, `2024/1/5`, `05-Jan-2024`, `Jan 5, 2024`, `5 January 2024`, optional times. Invalid calendar dates are left untouched.
- **Duplicate removal** — compares rows *after* cleaning, so rows that differ only by whitespace or formatting collapse. First occurrence wins.
- **Headers → `snake_case` ASCII** — diacritics removed, punctuation collapsed, duplicates suffixed (`_2`, `_3`), numeric names prefixed.
- **20-row preview** and stats: rows out, rows repaired, duplicates removed, cells trimmed, decimals fixed, dates fixed, headers renamed.
- **Download cleaned CSV** — same delimiter as the input, RFC 4180 quoting, CRLF line endings, optional UTF-8 BOM for older Excel.
- **Copy to clipboard** as a bonus.

Dark mode follows `prefers-color-scheme`; the page is keyboard accessible and has no external assets.

## Run locally

Option 1 — just open the file:

```bash
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

Option 2 — serve it (nicer for testing, still no build):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Tests

Node 18+ and no dependencies:

```bash
node test.js
```

The suite covers delimiter detection, quoted fields with embedded newlines, BOM handling, trimming, decimal conversion, date formats, header normalization, deduplication, ragged rows, and CSV round-tripping.

## Deploy to GitHub Pages (3 steps)

1. Create a public repository and push the contents of this folder to the `main` branch (or upload the files through GitHub's web UI).
2. In the repository, open **Settings → Pages**, set **Source** to *Deploy from a branch*, choose branch **`main`** and folder **`/ (root)`**, then **Save**.
3. Wait about a minute. The page is live at `https://<your-user>.github.io/<repo>/`. No Actions, build command, or base path is needed.

All paths are relative, so the same files also work from a subdirectory or a USB stick.

## Limits

- This is a browser tool. It assumes **UTF-8**. A BOM is handled, and invalid UTF-8 files fall back to Windows-1252 with a warning, but other encodings (e.g. Windows-1250, UTF-16) should be re-saved as UTF-8 first.
- **The first row is always treated as the header row.** There is no option to clean a headerless file.
- **Ambiguous dates** (`05/01/2024`, `05.01.2024`) follow the on-page selector; the default is day-first. Dates where one component is greater than 12 are auto-resolved. Month names are English only. Years 1000–2999 only; invalid dates such as `31.02.2024` stay as-is.
- **`1,234` is treated as a decimal comma** (`1.234`), not as one-thousand-two-hundred-thirty-four. This follows the decimal-comma feature; convert US-style thousands separators before pasting if that matters.
- **Ragged rows:** short rows are padded with empty cells, extra cells are truncated. Both are reported in the warning message.
- **All data stays in memory.** The upload limit is 25 MB; practical comfort is lower (roughly a few hundred thousand rows, depending on the browser). Use the Python Automation Bundle for 100k+ row jobs and repeatable pipelines.
- **Formula injection is not sanitized.** Values starting with `=`, `+`, `-`, or `@` are passed through unchanged. Review CSVs from untrusted sources before opening them in Excel.
- Time zones are not converted; naive date-times become `YYYY-MM-DDTHH:MM:SS`. Date strings with `Z` or an offset are left unchanged.
- Output is CSV only — no `.xlsx` export.

## License

MIT © 2026 Jachym Solta. See [LICENSE](LICENSE).
