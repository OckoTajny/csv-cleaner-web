/* CSV Cleanroom — a zero-dependency, client-side CSV cleaner.
 * MIT License © 2026 Jachym Solta
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CSVCleaner = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DELIMITERS = [',', ';', '\t', '|'];
  var DELIMITER_NAMES = { ',': 'Comma', ';': 'Semicolon', '\t': 'Tab', '|': 'Pipe' };
  var CELL_WS = /^[\s\u00A0\uFEFF]+|[\s\u00A0\uFEFF]+$/g;
  var PREVIEW_LIMIT = 20;
  var MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
  };

  function stripBom(text) {
    var value = text == null ? '' : String(text);
    if (value.charCodeAt(0) === 0xFEFF) {
      return { text: value.slice(1), hadBom: true };
    }
    return { text: value, hadBom: false };
  }

  function countOutsideQuotes(line, delimiter) {
    var count = 0;
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (ch === '"') {
        if (inQuotes && line.charAt(i + 1) === '"') {
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes && ch === delimiter) {
        count += 1;
      }
    }
    return count;
  }

  function detectDelimiter(input) {
    var clean = stripBom(input).text;
    var lines = clean.split(/\r\n|\n|\r/).filter(function (line) {
      return line.trim() !== '';
    }).slice(0, 50);

    if (!lines.length) return ',';

    var best = ',';
    var bestScore = -Infinity;

    DELIMITERS.forEach(function (delimiter, index) {
      var counts = lines.map(function (line) {
        return countOutsideQuotes(line, delimiter);
      });
      var freq = {};
      counts.forEach(function (count) {
        freq[count] = (freq[count] || 0) + 1;
      });

      var mode = 0;
      var modeFreq = 0;
      Object.keys(freq).forEach(function (key) {
        var value = Number(key);
        if (value > 0 && (freq[key] > modeFreq || (freq[key] === modeFreq && value > mode))) {
          mode = value;
          modeFreq = freq[key];
        }
      });
      if (!mode) return;

      var coverage = modeFreq / lines.length;
      var score = coverage * 100 + Math.min(mode, 20) * 2 + modeFreq - index * 0.01;
      if (score > bestScore) {
        bestScore = score;
        best = delimiter;
      }
    });

    return best;
  }

  function parseDelimited(input, delimiter) {
    var src = stripBom(input).text;
    var sep = delimiter || ',';
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    for (var i = 0; i < src.length; i++) {
      var ch = src.charAt(i);

      if (inQuotes) {
        if (ch === '"') {
          if (src.charAt(i + 1) === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === '"' && field.trim() === '') {
        field = '';
        inQuotes = true;
      } else if (ch === sep) {
        row.push(field);
        field = '';
      } else if (ch === '\r') {
        if (src.charAt(i + 1) === '\n') i += 1;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }

    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function escapeField(value, delimiter) {
    var s = value == null ? '' : String(value);
    if (
      s.indexOf(delimiter) !== -1 ||
      /["\r\n]/.test(s) ||
      /^\s|\s$/.test(s)
    ) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function toCsv(headers, rows, delimiter) {
    var sep = delimiter || ',';
    var lines = [headers.map(function (header) {
      return escapeField(header, sep);
    }).join(sep)];

    rows.forEach(function (row) {
      lines.push(row.map(function (cell) {
        return escapeField(cell, sep);
      }).join(sep));
    });

    return lines.join('\r\n') + '\r\n';
  }

  function normalizeNumber(value) {
    var raw = value == null ? '' : String(value);
    var trimmed = raw.trim();
    if (!trimmed) return { value: trimmed, changed: false };

    var percent = /%$/.test(trimmed);
    var core = percent ? trimmed.slice(0, -1).trim() : trimmed;
    var changed = false;

    // European grouping plus decimal comma: 1.234,56 / 1 234,56 / 1 234,5
    if (/^-?\d{1,3}(?:[.\u00A0 ]\d{3})*,\d+$/.test(core)) {
      core = core.replace(/[.\u00A0 ]/g, '').replace(',', '.');
      changed = true;
    // Unambiguous grouped integer with at least two dot groups: 1.234.567
    } else if (/^-?\d{1,3}(?:\.\d{3}){2,}$/.test(core)) {
      core = core.replace(/\./g, '');
      changed = true;
    // Plain decimal comma: 12,5 -> 12.5
    } else if (/^-?\d+,\d+$/.test(core)) {
      core = core.replace(',', '.');
      changed = true;
    }

    if (!changed) return { value: trimmed, changed: false };
    return { value: core + (percent ? '%' : ''), changed: true };
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function toIsoDate(year, month, day, hour, minute, second) {
    year = Number(year);
    month = Number(month);
    day = Number(day);

    if (!Number.isInteger(year) || year < 1000 || year > 2999) return null;
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return null;

    var out = String(year).padStart(4, '0') + '-' + pad2(month) + '-' + pad2(day);
    if (hour === null || hour === undefined) return out;

    hour = Number(hour);
    minute = Number(minute);
    second = second === null || second === undefined ? 0 : Number(second);

    if (hour < 0 || hour > 23) return null;
    if (minute < 0 || minute > 59) return null;
    if (second < 0 || second > 59) return null;

    return out + 'T' + pad2(hour) + ':' + pad2(minute) + ':' + pad2(second);
  }

  function expandYear(value) {
    var year = Number(value);
    if (year >= 100) return year;
    return year < 70 ? 2000 + year : 1900 + year;
  }

  function monthFromName(name) {
    return MONTHS[String(name).toLowerCase().replace(/\.$/, '')] || 0;
  }

  function normalizeDate(value, dateOrder) {
    var raw = value == null ? '' : String(value);
    var s = raw.trim();
    if (!s) return { value: s, changed: false };

    var order = dateOrder === 'MDY' ? 'MDY' : 'DMY';
    var match;
    var year;
    var month;
    var day;
    var hour;
    var minute;
    var second;
    var iso;

    // ISO / year first: 2024-01-05, 2024/1/5, 2024-01-05 09:30
    match = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
      iso = toIsoDate(
        match[1], match[2], match[3],
        match[4] === undefined ? null : match[4],
        match[5] === undefined ? null : match[5],
        match[6] === undefined ? null : match[6]
      );
      if (iso) return { value: iso, changed: iso !== raw };
      return { value: raw, changed: false };
    }

    // Day/month/year or month/day/year: 05.01.2024, 5/1/24, 05-01-2024 10:30
    match = s.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
      var first = Number(match[1]);
      var secondPart = Number(match[2]);
      year = expandYear(match[3]);

      if (first > 12 && secondPart <= 12) {
        day = first;
        month = secondPart;
      } else if (secondPart > 12 && first <= 12) {
        month = first;
        day = secondPart;
      } else if (first <= 12 && secondPart <= 12) {
        if (order === 'MDY') {
          month = first;
          day = secondPart;
        } else {
          day = first;
          month = secondPart;
        }
      } else {
        return { value: raw, changed: false };
      }

      iso = toIsoDate(
        year, month, day,
        match[4] === undefined ? null : match[4],
        match[5] === undefined ? null : match[5],
        match[6] === undefined ? null : match[6]
      );
      if (iso) return { value: iso, changed: iso !== raw };
      return { value: raw, changed: false };
    }

    // Jan 5, 2024 / January 5th 2024
    match = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
      month = monthFromName(match[1]);
      day = Number(match[2]);
      year = Number(match[3]);
      iso = toIsoDate(
        year, month, day,
        match[4] === undefined ? null : match[4],
        match[5] === undefined ? null : match[5],
        match[6] === undefined ? null : match[6]
      );
      if (iso) return { value: iso, changed: iso !== raw };
      return { value: raw, changed: false };
    }

    // 5 Jan 2024 / 5 January 2024
    match = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
      day = Number(match[1]);
      month = monthFromName(match[2]);
      year = Number(match[3]);
      iso = toIsoDate(
        year, month, day,
        match[4] === undefined ? null : match[4],
        match[5] === undefined ? null : match[5],
        match[6] === undefined ? null : match[6]
      );
      if (iso) return { value: iso, changed: iso !== raw };
      return { value: raw, changed: false };
    }

    // 05-Jan-2024 / 5 Jan, 2024
    match = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})\.?[-\s,]\s*(\d{2}|\d{4})$/);
    if (match) {
      day = Number(match[1]);
      month = monthFromName(match[2]);
      year = expandYear(match[3]);
      iso = toIsoDate(year, month, day);
      if (iso) return { value: iso, changed: iso !== raw };
      return { value: raw, changed: false };
    }

    return { value: raw, changed: false };
  }

  function deaccent(value) {
    var s = String(value).toLowerCase();
    s = s
      .replace(/ß/g, 'ss')
      .replace(/æ/g, 'ae')
      .replace(/œ/g, 'oe')
      .replace(/ø/g, 'o')
      .replace(/ł/g, 'l')
      .replace(/đ/g, 'd')
      .replace(/ð/g, 'd')
      .replace(/þ/g, 'th');
    s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    return s;
  }

  function snakeCase(value) {
    var s = deaccent(String(value).trim());
    s = s.replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!s) return '';
    if (/^[0-9]/.test(s)) s = 'col_' + s;
    return s;
  }

  function makeHeaders(rawHeaders) {
    var used = Object.create(null);
    var headers = [];
    var renamed = 0;

    rawHeaders.forEach(function (raw, index) {
      var base = snakeCase(raw);
      if (!base) base = 'column_' + (index + 1);

      var name = base;
      var suffix = 2;
      while (used[name]) {
        name = base + '_' + suffix;
        suffix += 1;
      }
      used[name] = true;
      headers.push(name);

      if (String(raw).trim() !== name) renamed += 1;
    });

    return { headers: headers, renamed: renamed };
  }

  function cleanCsv(input, options) {
    options = options || {};
    var source = input == null ? '' : String(input);
    var bom = stripBom(source);
    var requested = options.delimiter;
    var delimiter = requested && requested !== 'auto' ? requested : detectDelimiter(bom.text);
    var dateOrder = options.dateOrder === 'MDY' ? 'MDY' : 'DMY';

    var matrix = parseDelimited(bom.text, delimiter);
    var nonEmpty = matrix.filter(function (row) {
      return row.some(function (cell) {
        return String(cell).trim() !== '';
      });
    });

    var stats = {
      inputRows: 0,
      outputRows: 0,
      duplicatesRemoved: 0,
      repairedRows: 0,
      cellsTrimmed: 0,
      decimalsFixed: 0,
      datesFixed: 0,
      headersRenamed: 0,
      emptyRowsRemoved: matrix.length - nonEmpty.length,
      raggedRows: 0
    };

    if (!nonEmpty.length) {
      return {
        isEmpty: true,
        headers: [],
        rows: [],
        preview: [],
        delimiter: delimiter,
        delimiterName: DELIMITER_NAMES[delimiter] || delimiter,
        hadBom: bom.hadBom,
        stats: stats
      };
    }

    var headerResult = makeHeaders(nonEmpty[0]);
    var headers = headerResult.headers;
    stats.headersRenamed = headerResult.renamed;

    var dataRows = nonEmpty.slice(1);
    stats.inputRows = dataRows.length;

    var seen = Object.create(null);
    var rows = [];

    dataRows.forEach(function (row) {
      if (row.length !== headers.length) stats.raggedRows += 1;

      var transformed = [];
      var rowChanged = false;

      for (var index = 0; index < headers.length; index++) {
        var cell = row[index] === undefined ? '' : row[index];
        var trimmed = cell.replace(CELL_WS, '');

        if (trimmed !== cell) {
          stats.cellsTrimmed += 1;
          rowChanged = true;
        }
        cell = trimmed;

        var dateResult = normalizeDate(cell, dateOrder);
        if (dateResult.changed) {
          cell = dateResult.value;
          stats.datesFixed += 1;
          rowChanged = true;
        } else {
          var numberResult = normalizeNumber(cell);
          if (numberResult.changed) {
            cell = numberResult.value;
            stats.decimalsFixed += 1;
            rowChanged = true;
          }
        }

        transformed.push(cell);
      }

      if (rowChanged) stats.repairedRows += 1;

      var key = transformed.join('\u001F');
      if (seen[key]) {
        stats.duplicatesRemoved += 1;
        return;
      }
      seen[key] = true;
      rows.push(transformed);
    });

    stats.outputRows = rows.length;

    return {
      isEmpty: false,
      headers: headers,
      rows: rows,
      preview: rows.slice(0, PREVIEW_LIMIT),
      delimiter: delimiter,
      delimiterName: DELIMITER_NAMES[delimiter] || delimiter,
      hadBom: bom.hadBom,
      stats: stats
    };
  }

  var api = {
    PREVIEW_LIMIT: PREVIEW_LIMIT,
    DELIMITERS: DELIMITERS,
    stripBom: stripBom,
    detectDelimiter: detectDelimiter,
    parseDelimited: parseDelimited,
    toCsv: toCsv,
    normalizeNumber: normalizeNumber,
    normalizeDate: normalizeDate,
    snakeCase: snakeCase,
    makeHeaders: makeHeaders,
    cleanCsv: cleanCsv
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        initUi(api);
      });
    } else {
      initUi(api);
    }
  }

  return api;
});

/* ------------------------------------------------------------------ */
/* Browser UI. Kept out of the test path: Node has no document object. */
/* ------------------------------------------------------------------ */
function initUi(api) {
  'use strict';

  var fileInput = document.getElementById('file-input');
  if (!fileInput) return;

  var dropZone = document.getElementById('drop-zone');
  var fileName = document.getElementById('file-name');
  var input = document.getElementById('csv-input');
  var delimiterSelect = document.getElementById('delimiter');
  var dateOrderSelect = document.getElementById('date-order');
  var bomOutput = document.getElementById('bom-output');
  var cleanBtn = document.getElementById('clean-btn');
  var sampleBtn = document.getElementById('sample-btn');
  var clearBtn = document.getElementById('clear-btn');
  var downloadBtn = document.getElementById('download-btn');
  var copyBtn = document.getElementById('copy-btn');
  var notice = document.getElementById('notice');
  var resultMeta = document.getElementById('result-meta');
  var statRows = document.getElementById('stat-rows');
  var statRepaired = document.getElementById('stat-repaired');
  var statDuplicates = document.getElementById('stat-duplicates');
  var statDetails = document.getElementById('stat-details');
  var previewHead = document.getElementById('preview-head');
  var previewBody = document.getElementById('preview-body');
  var previewNote = document.getElementById('preview-note');
  var tableEmpty = document.getElementById('table-empty');
  var tableScroll = document.getElementById('table-scroll');

  var numberFormat = new Intl.NumberFormat('en-US');
  var state = {
    result: null,
    fileName: 'data.csv',
    fallbackEncoding: false
  };

  var SAMPLE = [
    'Customer;E-mail;Amount;Order date;Note',
    '  José García ;jose@example.com;1 234,50;05.01.2024;"VIP, Prague"',
    'Zoë Müller;zoe@example.com;89,9;7.1.2024;New customer',
    'Peter Novak;peter@example.com;1.234,56;2024-01-09;Repeat order',
    'José García;jose@example.com;1234,50;Jan 10, 2024;"VIP, Prague"',
    '  José García ;jose@example.com;1 234,50;05.01.2024;"VIP, Prague"',
    'Marta Nováková;marta@example.com;0,5;31.02.2024;Invalid date stays'
  ].join('\n');

  var DEFAULT_DETAILS = 'Trimmed cells, decimal fixes, date fixes, and renamed headers will show up here.';

  function formatNumber(value) {
    return numberFormat.format(value);
  }

  function countLabel(value, singular, plural) {
    return formatNumber(value) + ' ' + (value === 1 ? singular : plural);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function setNotice(message, tone) {
    if (!message) {
      notice.hidden = true;
      notice.textContent = '';
      return;
    }
    notice.hidden = false;
    notice.textContent = message;
    notice.dataset.tone = tone || 'ok';
  }

  function renderTable(headers, rows) {
    previewHead.replaceChildren();
    previewBody.replaceChildren();

    if (!headers.length) {
      tableEmpty.hidden = false;
      tableScroll.hidden = true;
      return;
    }

    var headRow = document.createElement('tr');
    headers.forEach(function (header) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.textContent = header;
      headRow.appendChild(th);
    });
    previewHead.appendChild(headRow);

    var fragment = document.createDocumentFragment();
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      headers.forEach(function (_, index) {
        var td = document.createElement('td');
        td.textContent = row[index] == null ? '' : row[index];
        tr.appendChild(td);
      });
      fragment.appendChild(tr);
    });
    previewBody.appendChild(fragment);

    tableEmpty.hidden = true;
    tableScroll.hidden = false;
  }

  function renderResult(result) {
    state.result = result;
    var stats = result.stats;

    statRows.textContent = formatNumber(stats.outputRows);
    statRepaired.textContent = formatNumber(stats.repairedRows);
    statDuplicates.textContent = formatNumber(stats.duplicatesRemoved);

    var details = [];
    if (stats.cellsTrimmed) details.push(countLabel(stats.cellsTrimmed, 'cell', 'cells') + ' trimmed');
    if (stats.decimalsFixed) details.push(countLabel(stats.decimalsFixed, 'decimal comma', 'decimal commas') + ' fixed');
    if (stats.datesFixed) details.push(countLabel(stats.datesFixed, 'date', 'dates') + ' normalized');
    if (stats.headersRenamed) details.push(countLabel(stats.headersRenamed, 'header', 'headers') + ' renamed');
    if (stats.emptyRowsRemoved) details.push(countLabel(stats.emptyRowsRemoved, 'blank row', 'blank rows') + ' skipped');
    if (stats.duplicatesRemoved) details.push(countLabel(stats.duplicatesRemoved, 'duplicate', 'duplicates') + ' removed');
    statDetails.textContent = details.length ? details.join(' · ') : 'No cell values needed changes.';

    if (result.isEmpty) {
      resultMeta.textContent = 'No CSV data found.';
    } else {
      resultMeta.textContent = (result.delimiterName || 'Detected') + ' delimiter · UTF-8' +
        (result.hadBom ? ' BOM removed' : '') + ' · ' + countLabel(stats.inputRows, 'data row', 'data rows');
    }

    renderTable(result.headers, result.preview || []);

    if (!result.isEmpty && result.rows.length) {
      var note = result.rows.length > result.preview.length
        ? 'Showing first ' + result.preview.length + ' of ' + formatNumber(result.rows.length) + ' cleaned rows.'
        : 'Showing all ' + countLabel(result.rows.length, 'cleaned row', 'cleaned rows') + '.';
      if (result.headers.length > 3) note += ' Scroll the table sideways to see every column.';
      previewNote.textContent = note;
    } else if (!result.isEmpty) {
      previewNote.textContent = 'Header row only — no data rows to preview.';
    } else {
      previewNote.textContent = '';
    }

    downloadBtn.disabled = result.isEmpty || !result.rows.length;
    copyBtn.disabled = result.isEmpty || !result.headers.length;

    var warnings = [];
    if (state.fallbackEncoding) {
      warnings.push('The file was not valid UTF-8, so it was decoded as Windows-1252. Check accented characters.');
    }
    if (stats.raggedRows) {
      warnings.push(countLabel(stats.raggedRows, 'row', 'rows') + ' had a different column count and were padded or truncated.');
    }

    var message;
    if (result.isEmpty) {
      message = 'No CSV rows found. Check the input or try a different delimiter.';
    } else if (!stats.inputRows) {
      message = 'Header row found, but there are no data rows.';
    } else {
      message = 'Cleaned ' + countLabel(stats.inputRows, 'row', 'rows') + ' → ' + formatNumber(stats.outputRows);
      if (stats.repairedRows) message += ' · ' + countLabel(stats.repairedRows, 'row', 'rows') + ' repaired';
      if (stats.duplicatesRemoved) message += ' · ' + countLabel(stats.duplicatesRemoved, 'duplicate', 'duplicates') + ' removed';
      message += '.';
    }
    if (warnings.length) {
      message += (message ? ' ' : '') + warnings.join(' ');
    }

    var tone = result.isEmpty ? 'error' : warnings.length || !stats.inputRows ? 'warn' : 'ok';
    setNotice(message, tone);
  }

  function resetOutput() {
    state.result = null;
    resultMeta.textContent = 'Nothing cleaned yet.';
    statRows.textContent = '0';
    statRepaired.textContent = '0';
    statDuplicates.textContent = '0';
    statDetails.textContent = DEFAULT_DETAILS;
    previewHead.replaceChildren();
    previewBody.replaceChildren();
    tableEmpty.hidden = false;
    tableScroll.hidden = true;
    previewNote.textContent = '';
    downloadBtn.disabled = true;
    copyBtn.disabled = true;
  }

  function invalidateOutput() {
    if (!state.result) return;
    downloadBtn.disabled = true;
    copyBtn.disabled = true;
    resultMeta.textContent = 'Input changed — press Clean CSV to refresh.';
  }

  function runClean() {
    var text = input.value;
    if (!text.trim()) {
      setNotice('Paste CSV text or choose a file first.', 'error');
      input.focus();
      return;
    }

    var result;
    try {
      result = api.cleanCsv(text, {
        delimiter: delimiterSelect.value,
        dateOrder: dateOrderSelect.value
      });
    } catch (error) {
      setNotice('Could not read this CSV: ' + error.message, 'error');
      return;
    }

    renderResult(result);
  }

  function buildCsv() {
    if (!state.result || !state.result.headers.length) return '';
    return api.toCsv(state.result.headers, state.result.rows, state.result.delimiter);
  }

  function downloadName() {
    var stem = (state.fileName || 'data.csv').replace(/\.[^.]*$/, '');
    var safe = stem.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
    if (!safe) safe = 'data';
    return safe + '-cleaned.csv';
  }

  function loadFile(file) {
    if (file.size > 25 * 1024 * 1024) {
      setNotice('This file is larger than 25 MB. Split it first — browser tools must keep the whole table in memory.', 'error');
      return;
    }

    var reader = new FileReader();
    reader.onerror = function () {
      setNotice('Could not read that file. Try another file or paste the text.', 'error');
    };
    reader.onload = function () {
      var buffer = reader.result;
      var bytes = new Uint8Array(buffer);
      var hasBom = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
      var text;
      var fallback = false;

      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } catch (error) {
        text = new TextDecoder('windows-1252').decode(buffer);
        fallback = true;
      }

      if (hasBom && text.charCodeAt(0) !== 0xFEFF) text = '\uFEFF' + text;

      state.fallbackEncoding = fallback;
      state.fileName = file.name || 'data.csv';
      input.value = text;
      fileInput.value = '';
      fileName.textContent = state.fileName + ' · ' + formatBytes(file.size) +
        (hasBom ? ' · UTF-8 BOM' : '') + (fallback ? ' · Windows-1252 fallback' : '');
      fileName.hidden = false;
      runClean();
    };
    reader.readAsArrayBuffer(file);
  }

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (file) loadFile(file);
  });

  ['dragenter', 'dragover'].forEach(function (eventName) {
    dropZone.addEventListener(eventName, function (event) {
      event.preventDefault();
      dropZone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'dragend'].forEach(function (eventName) {
    dropZone.addEventListener(eventName, function () {
      dropZone.classList.remove('is-dragover');
    });
  });

  dropZone.addEventListener('drop', function (event) {
    event.preventDefault();
    dropZone.classList.remove('is-dragover');
    var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  // Stop the browser from navigating away when a file is dropped outside the zone.
  window.addEventListener('dragover', function (event) {
    event.preventDefault();
  });
  window.addEventListener('drop', function (event) {
    event.preventDefault();
  });

  input.addEventListener('input', function () {
    state.fallbackEncoding = false;
    fileName.hidden = true;
    state.fileName = 'data.csv';
    invalidateOutput();
  });

  input.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      runClean();
    }
  });

  delimiterSelect.addEventListener('change', function () {
    if (input.value.trim()) runClean();
  });

  dateOrderSelect.addEventListener('change', function () {
    if (input.value.trim()) runClean();
  });

  cleanBtn.addEventListener('click', runClean);

  sampleBtn.addEventListener('click', function () {
    state.fileName = 'sample.csv';
    state.fallbackEncoding = false;
    fileInput.value = '';
    fileName.hidden = true;
    input.value = SAMPLE;
    runClean();
  });

  clearBtn.addEventListener('click', function () {
    input.value = '';
    fileInput.value = '';
    fileName.hidden = true;
    fileName.textContent = '';
    state.fileName = 'data.csv';
    state.fallbackEncoding = false;
    setNotice('', 'ok');
    resetOutput();
    input.focus();
  });

  downloadBtn.addEventListener('click', function () {
    var csv = buildCsv();
    if (!csv) return;

    var payload = bomOutput.checked ? '\uFEFF' + csv : csv;
    var blob = new Blob([payload], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = downloadName();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
    setNotice('Downloaded ' + anchor.download + '.', 'ok');
  });

  copyBtn.addEventListener('click', function () {
    var csv = buildCsv();
    if (!csv) return;
    var payload = bomOutput.checked ? '\uFEFF' + csv : csv;

    function fallbackCopy() {
      var textarea = document.createElement('textarea');
      textarea.value = payload;
      textarea.setAttribute('readonly', '');
      textarea.className = 'clipboard-fallback';
      document.body.appendChild(textarea);
      textarea.select();
      var copied = false;
      try {
        copied = document.execCommand('copy');
      } catch (error) {
        copied = false;
      }
      textarea.remove();
      setNotice(
        copied ? 'Cleaned CSV copied to the clipboard.' : 'Copy failed — use Download instead.',
        copied ? 'ok' : 'error'
      );
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(payload).then(function () {
        setNotice('Cleaned CSV copied to the clipboard.', 'ok');
      }).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  });

  resetOutput();
}
