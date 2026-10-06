/*
 * Flow engine for the three statements.
 *
 * An exercise only states the direct, pre-tax effects of an event
 * (e.g. D&A +100, PP&E -100). The engine derives everything else:
 * tax, net income, the whole cash flow statement, cash and retained
 * earnings. The solution therefore follows the tax rate the user picks,
 * and a data error shows up as a balance sheet that does not balance.
 *
 * Sign rule: every value is a change.
 *   Income statement: + means the line increases (a higher cost is +).
 *   Cash flow statement: + means cash comes in.
 *   Balance sheet: + means the line increases.
 *
 * Works in the browser (global FlowEngine) and in Node (require).
 */
(function (root) {
  'use strict';

  var DEFAULT_TAX_RATE = 0.206;
  var TOLERANCE = 0.051;

  // Lines an exercise may set directly in "inputs".
  var INPUT_LINES = [
    'revenue', 'cogs', 'da', 'impairments', 'gain_on_sale', 'interest',
    'capex', 'asset_sale_proceeds', 'net_borrowing', 'equity_issuance', 'dividends',
    'ar', 'inventory', 'ppe', 'rou', 'goodwill',
    'ap', 'deferred_revenue', 'tax_payable', 'debt', 'lease_liabilities',
    'share_capital', 'retained_earnings'
  ];

  var IS_ITEMS = ['revenue', 'cogs', 'da', 'impairments', 'gain_on_sale', 'interest'];
  var CFI_ITEMS = ['capex', 'asset_sale_proceeds'];
  var CFF_ITEMS = ['net_borrowing', 'equity_issuance', 'dividends'];
  var ASSET_ITEMS = ['cash', 'ar', 'inventory', 'ppe', 'rou', 'goodwill'];
  var LE_ITEMS = ['ap', 'deferred_revenue', 'tax_payable', 'debt', 'lease_liabilities', 'share_capital', 'retained_earnings'];
  var BS_INPUTS = ['ar', 'inventory', 'ppe', 'rou', 'goodwill', 'ap', 'deferred_revenue', 'tax_payable', 'debt', 'lease_liabilities', 'share_capital'];

  function clean(x) {
    var r = Math.round(x * 1e9) / 1e9;
    return r === 0 ? 0 : r;
  }

  // Sum inputs over one event ("inputs") or several in sequence ("events").
  function collectInputs(ex) {
    var parts = ex.events ? ex.events.map(function (e) { return e.inputs || {}; }) : [ex.inputs || {}];
    var out = {};
    parts.forEach(function (p) {
      Object.keys(p).forEach(function (k) { out[k] = (out[k] || 0) + Number(p[k]); });
    });
    return out;
  }

  function solve(ex, t) {
    if (typeof t !== 'number') t = DEFAULT_TAX_RATE;
    var inp = collectInputs(ex);
    var g = function (id) { return inp[id] || 0; };
    var v = {};

    INPUT_LINES.forEach(function (id) { v[id] = g(id); });

    // Income statement
    v.ebit = v.revenue - v.cogs - v.da - v.impairments + v.gain_on_sale;
    v.ebt = v.ebit - v.interest;
    var nonDeductible = Number(ex.nonDeductible || 0);
    v.tax = t * (v.ebt + nonDeductible);
    v.net_income = v.ebt - v.tax;

    // Unpaid tax sits in tax payable instead of leaving cash.
    var taxUnpaid = ex.taxSettlement === 'payable';
    v.tax_payable = g('tax_payable') + (taxUnpaid ? v.tax : 0);

    // Cash flow statement, indirect method
    v.cf_net_income = v.net_income;
    v.cf_da = v.da + v.impairments;
    v.cf_gain = -v.gain_on_sale;
    v.cf_wc = -v.ar - v.inventory + v.ap + v.deferred_revenue + v.tax_payable;
    v.cfo = v.cf_net_income + v.cf_da + v.cf_gain + v.cf_wc;
    v.cfi = v.capex + v.asset_sale_proceeds;
    v.cff = v.net_borrowing + v.equity_issuance + v.dividends;
    v.net_change_cash = v.cfo + v.cfi + v.cff;

    // Balance sheet
    v.cash = v.net_change_cash;
    v.retained_earnings = v.net_income + v.dividends + g('retained_earnings');
    v.total_assets = sum(v, ASSET_ITEMS);
    v.total_le = sum(v, LE_ITEMS);

    Object.keys(v).forEach(function (k) { v[k] = clean(v[k]); });
    return { values: v, inputs: inp, t: t, nonDeductible: nonDeductible, taxUnpaid: taxUnpaid };
  }

  function sum(v, ids) {
    return ids.reduce(function (s, id) { return s + (v[id] || 0); }, 0);
  }

  // Data checks for one exercise. Returns a list of problems (empty = fine).
  function validateExercise(ex, lineIds) {
    var problems = [];
    var known = {};
    (lineIds || []).forEach(function (id) { known[id] = true; });
    if (!ex.id) problems.push('missing id');
    if (!ex.title) problems.push('missing title');
    if (!ex.event && !ex.events) problems.push('missing event text');
    if ([1, 2, 3].indexOf(ex.level) < 0) problems.push('level must be 1, 2 or 3');
    if (ex.taxSettlement && ['cash', 'payable'].indexOf(ex.taxSettlement) < 0) problems.push('taxSettlement must be "cash" or "payable"');
    var inp = collectInputs(ex);
    Object.keys(inp).forEach(function (k) {
      if (INPUT_LINES.indexOf(k) < 0) problems.push('"' + k + '" cannot be an input; the engine derives it');
      if (!isFinite(inp[k])) problems.push('"' + k + '" is not a number');
    });
    Object.keys(ex.notes || {}).forEach(function (k) {
      if (lineIds && !known[k]) problems.push('note for unknown line "' + k + '"');
    });
    String(ex.keyPoint || '').replace(/\{(abs:)?([a-z_]+)\}/g, function (m, abs, id) {
      if (id !== 't' && lineIds && !known[id]) problems.push('keyPoint refers to unknown line "' + id + '"');
      return m;
    });
    [0, DEFAULT_TAX_RATE, 0.3, 0.5].forEach(function (t) {
      var v = solve(ex, t).values;
      var diff = clean(v.total_assets - v.total_le);
      if (Math.abs(diff) > 1e-6) {
        problems.push('does not balance at tax rate ' + fmtPct(t) + ': assets ' + fmt(v.total_assets) + ', liabilities and equity ' + fmt(v.total_le));
      }
    });
    return problems;
  }

  function validateAll(linesData, exData) {
    var lineIds = linesData.lines.map(function (l) { return l.id; });
    var report = [];
    var seen = {};
    exData.exercises.forEach(function (ex, i) {
      var p = validateExercise(ex, lineIds);
      if (ex.id && seen[ex.id]) p.push('duplicate id');
      seen[ex.id] = true;
      report.push({ id: ex.id || ('#' + (i + 1)), problems: p });
    });
    return report;
  }

  // ---------- Answers ----------

  function parseNumber(str) {
    if (str === null || str === undefined) return 0;
    var s = String(str).trim().replace(/\s/g, '').replace(/−/g, '-').replace(',', '.');
    if (s === '' || s === '-' || s === '+') return 0;
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  function grade(values, answers, lineIds) {
    var rows = {};
    var correct = 0;
    lineIds.forEach(function (id) {
      var expected = values[id] || 0;
      var given = answers[id];
      var ok = isFinite(given) && Math.abs(given - expected) <= TOLERANCE;
      if (ok) correct++;
      rows[id] = { expected: expected, given: given, correct: ok };
    });
    return { rows: rows, correct: correct, total: lineIds.length };
  }

  // Consistency of the user's own numbers, regardless of the solution.
  function userChecks(a) {
    var n = function (id) { return isFinite(a[id]) ? a[id] : 0; };
    var touched = function (ids) { return ids.some(function (id) { return a[id] !== 0 && a[id] !== undefined; }); };
    var assets = ASSET_ITEMS.reduce(function (s, id) { return s + n(id); }, 0);
    var le = LE_ITEMS.reduce(function (s, id) { return s + n(id); }, 0);
    return {
      balance: { active: touched(ASSET_ITEMS.concat(LE_ITEMS)), diff: clean(assets - le) },
      cash: { active: touched(['cash', 'net_change_cash']), diff: clean(n('cash') - n('net_change_cash')) },
      netIncome: { active: touched(['net_income', 'cf_net_income']), diff: clean(n('net_income') - n('cf_net_income')) }
    };
  }

  // ---------- Formatting ----------

  function fmt(x) {
    var r = Math.round(x * 100) / 100;
    if (r === 0) return '0';
    var s = Math.abs(r).toFixed(2).replace(/\.?0+$/, '');
    return (r < 0 ? '−' : '') + s;
  }

  function fmtSigned(x) {
    var s = fmt(x);
    return (Math.round(x * 100) / 100 > 0 ? '+' : '') + s;
  }

  function fmtPct(t) {
    return fmt(t * 100) + '%';
  }

  // ---------- Step-by-step solution ----------

  /*
   * Returns sections: [{ title, steps: [{ text, formula, label, value }] }]
   * text: plain sentence. formula: string in "a = b = c" form.
   */
  function explain(ex, linesData, t) {
    var sol = solve(ex, t);
    var v = sol.values;
    var inp = sol.inputs;
    var notes = ex.notes || {};
    var byId = {};
    linesData.lines.forEach(function (l) { byId[l.id] = l; });
    var S = function (id) { return byId[id] ? byId[id].short : id; };
    var nz = function (x) { return Math.abs(x) > 1e-9; };

    function term(sign, id, value, label) {
      return { sign: sign, label: label || S(id), value: value };
    }

    function paren(x) { return x < 0 ? '(' + fmt(x) + ')' : fmt(x); }

    // "Result = A − B = 150 − 100 = 50", dropping zero terms unless keepZeros.
    function formula(resultLabel, terms, result, keepZeros) {
      var ts = keepZeros ? terms : terms.filter(function (x) { return nz(x.value); });
      if (!ts.length) return resultLabel + ' = 0';
      var sym = ts.map(function (x, i) {
        if (i === 0) return (x.sign < 0 ? '−' : '') + x.label;
        return (x.sign < 0 ? ' − ' : ' + ') + x.label;
      }).join('');
      var num = ts.map(function (x, i) {
        if (i === 0) return x.sign < 0 ? '−' + paren(x.value) : fmt(x.value);
        return (x.sign < 0 ? ' − ' : ' + ') + paren(x.value);
      }).join('');
      var res = fmt(result);
      var parts = [resultLabel, sym];
      if (num !== res && num !== sym) parts.push(num);
      parts.push(res);
      return parts.join(' = ');
    }

    function itemStep(id, value) {
      return { label: byId[id] ? byId[id].label : id, value: fmtSigned(value), text: notes[id] || '' };
    }

    var sections = [];

    // Income statement
    var isSteps = [];
    var isTouched = IS_ITEMS.some(function (id) { return nz(v[id]); });
    if (!isTouched) {
      isSteps.push({ text: 'Nothing in the income statement changes, so EBIT, tax and net income are all 0.' });
    } else {
      IS_ITEMS.forEach(function (id) { if (nz(v[id])) isSteps.push(itemStep(id, v[id])); });
      isSteps.push({ formula: formula('EBIT', [
        term(1, 'revenue', v.revenue), term(-1, 'cogs', v.cogs), term(-1, 'da', v.da),
        term(-1, 'impairments', v.impairments), term(1, 'gain_on_sale', v.gain_on_sale)
      ], v.ebit) });
      isSteps.push({ formula: formula('EBT', [term(1, 'ebit', v.ebit), term(-1, 'interest', v.interest)], v.ebt) });
      var taxText;
      if (nz(sol.nonDeductible)) {
        taxText = 'Tax = ' + fmtPct(t) + ' × (EBT + non-deductible costs) = ' + fmtPct(t) + ' × (' + fmt(v.ebt) + ' + ' + paren(sol.nonDeductible) + ') = ' + fmt(v.tax);
      } else {
        taxText = 'Tax = ' + fmtPct(t) + ' × EBT = ' + fmtPct(t) + ' × ' + paren(v.ebt) + ' = ' + fmt(v.tax);
      }
      var taxWhy = v.tax < 0 ? 'Lower pre-tax profit means lower tax.' : (v.tax > 0 ? 'Higher pre-tax profit means higher tax.' : 'Taxable profit does not change.');
      if (nz(sol.nonDeductible)) taxWhy += ' ' + fmt(sol.nonDeductible) + ' of the cost is not tax deductible.';
      isSteps.push({ formula: taxText, text: taxWhy });
      isSteps.push({ formula: formula('Net income', [term(1, 'ebt', v.ebt), term(-1, 'tax', v.tax)], v.net_income) });
    }
    sections.push({ title: 'Income statement', abbr: 'IS', steps: isSteps });

    // Cash flow statement
    var cfSteps = [];
    cfSteps.push({ text: nz(v.cf_net_income) ? 'Start from net income: ' + fmtSigned(v.cf_net_income) + '.' : 'Net income does not change, so the starting point is 0.' });
    if (nz(v.cf_da)) cfSteps.push({ text: 'Add back D&A and impairments. They lowered net income but are not cash: ' + fmtSigned(v.cf_da) + '.' });
    if (nz(v.cf_gain)) {
      cfSteps.push({ text: v.gain_on_sale > 0
        ? 'Remove the gain on the sale. The cash received is shown in investing instead: ' + fmtSigned(v.cf_gain) + '.'
        : 'Add back the loss on the sale. It is not a cash outflow: ' + fmtSigned(v.cf_gain) + '.' });
    }
    var wcTerms = [
      term(-1, 'ar', v.ar), term(-1, 'inventory', v.inventory), term(1, 'ap', v.ap),
      term(1, 'deferred_revenue', v.deferred_revenue), term(1, 'tax_payable', v.tax_payable)
    ];
    if (wcTerms.some(function (x) { return nz(x.value); })) {
      cfSteps.push({ formula: formula('Working capital', wcTerms, v.cf_wc), text: 'An asset that grows ties up cash (−). A liability that grows frees up cash (+).' });
    }
    cfSteps.push({ formula: formula('CFO', [
      term(1, 'cf_net_income', v.cf_net_income), term(1, 'cf_da', v.cf_da),
      term(1, 'cf_gain', v.cf_gain), term(1, 'cf_wc', v.cf_wc)
    ], v.cfo) });
    CFI_ITEMS.forEach(function (id) { if (nz(v[id])) cfSteps.push(itemStep(id, v[id])); });
    if (CFI_ITEMS.some(function (id) { return nz(v[id]); })) {
      cfSteps.push({ formula: formula('CFI', [term(1, 'capex', v.capex), term(1, 'asset_sale_proceeds', v.asset_sale_proceeds)], v.cfi) });
    } else {
      cfSteps.push({ formula: 'CFI = 0', text: 'No investing cash flows.' });
    }
    CFF_ITEMS.forEach(function (id) { if (nz(v[id])) cfSteps.push(itemStep(id, v[id])); });
    if (CFF_ITEMS.some(function (id) { return nz(v[id]); })) {
      cfSteps.push({ formula: formula('CFF', [term(1, 'net_borrowing', v.net_borrowing), term(1, 'equity_issuance', v.equity_issuance), term(1, 'dividends', v.dividends)], v.cff) });
    } else {
      cfSteps.push({ formula: 'CFF = 0', text: 'No financing cash flows.' });
    }
    cfSteps.push({ formula: formula('Change in cash', [term(1, 'cfo', v.cfo), term(1, 'cfi', v.cfi), term(1, 'cff', v.cff)], v.net_change_cash, true) });
    sections.push({ title: 'Cash flow statement', abbr: 'CF', steps: cfSteps });

    // Balance sheet
    var bsSteps = [];
    bsSteps.push({ text: 'Cash is the change in cash from the cash flow statement: ' + fmtSigned(v.cash) + '.' });
    BS_INPUTS.forEach(function (id) {
      var direct = inp[id] || 0;
      if (nz(direct)) bsSteps.push(itemStep(id, direct));
    });
    if (sol.taxUnpaid && nz(v.tax)) {
      bsSteps.push({ text: 'The tax is not paid yet, so tax payable changes by the tax expense: ' + fmtSigned(v.tax) + '.' });
    }
    var reTerms = [term(1, 'net_income', v.net_income), term(-1, 'dividends', -v.dividends, 'Dividends paid')];
    if (nz(inp.retained_earnings || 0)) reTerms.push(term(1, 'retained_earnings', inp.retained_earnings, 'Direct equity entry'));
    bsSteps.push({
      formula: formula('Retained earnings', reTerms, v.retained_earnings),
      text: notes.retained_earnings || 'Net income ends up in equity.'
    });
    bsSteps.push({ formula: formula('Total assets', ASSET_ITEMS.map(function (id) { return term(1, id, v[id]); }), v.total_assets) });
    bsSteps.push({ formula: formula('Total liabilities and equity', LE_ITEMS.map(function (id) { return term(1, id, v[id]); }), v.total_le) });
    bsSteps.push({ text: 'Assets ' + fmtSigned(v.total_assets) + ' and liabilities plus equity ' + fmtSigned(v.total_le) + '. The balance sheet balances.' });
    sections.push({ title: 'Balance sheet', abbr: 'BS', steps: bsSteps });

    return { sections: sections, keyPoint: fill(ex.keyPoint || '', v, t) };
  }

  function fill(text, v, t) {
    return String(text).replace(/\{(abs:)?([a-z_]+)\}/g, function (m, abs, id) {
      if (id === 't') return fmtPct(t);
      if (!(id in v)) return m;
      return abs ? fmt(Math.abs(v[id])) : fmt(v[id]);
    });
  }

  var api = {
    DEFAULT_TAX_RATE: DEFAULT_TAX_RATE,
    TOLERANCE: TOLERANCE,
    INPUT_LINES: INPUT_LINES,
    solve: solve,
    validateExercise: validateExercise,
    validateAll: validateAll,
    parseNumber: parseNumber,
    grade: grade,
    userChecks: userChecks,
    explain: explain,
    fmt: fmt,
    fmtSigned: fmtSigned,
    fmtPct: fmtPct
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FlowEngine = api;
})(this);
