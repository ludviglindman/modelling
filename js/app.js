/* User interface for the flow trainer. All accounting lives in engine.js, all texts in i18n.js and data/. */
(function () {
  'use strict';

  var E = window.FlowEngine;
  var I = window.FlowI18n;
  var LANG_KEY = 'flowtrainer.lang';

  var state = {
    linesData: null,
    exercises: [],     // all exercises
    list: [],          // exercises at the selected difficulty
    tr: {},            // Swedish texts, keyed by exercise id
    index: 0,          // position in state.list
    filter: 'all',
    lang: 'en',
    t: E.DEFAULT_TAX_RATE,
    checked: false,
    broken: false,
    problems: []
  };

  var $ = function (id) { return document.getElementById(id); };
  var T = function (key, vars) { return I.t(state.lang, key, vars); };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'class') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' returned ' + r.status);
      return r.json();
    });
  }

  function showFatal(title, items) {
    var box = $('fatal');
    box.innerHTML = '';
    box.appendChild(el('strong', { text: title }));
    if (items && items.length) {
      box.appendChild(el('ul', {}, items.map(function (t) { return el('li', { text: t }); })));
    }
    box.hidden = false;
  }

  // ---------- Language ----------

  function storedLang() {
    try {
      var s = localStorage.getItem(LANG_KEY);
      if (s && I.STR[s]) return s;
    } catch (e) { /* storage may be blocked */ }
    var nav = (navigator.language || '').toLowerCase();
    return nav.indexOf('sv') === 0 ? 'sv' : 'en';
  }

  function saveLang() {
    try { localStorage.setItem(LANG_KEY, state.lang); } catch (e) { /* ignore */ }
  }

  function applyStatic() {
    document.documentElement.lang = state.lang;
    document.title = T('pageTitle');
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', T('pageDesc'));

    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (n) {
      n.textContent = T(n.getAttribute('data-i18n'));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-attr]'), function (n) {
      n.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var p = pair.split(':');
        n.setAttribute(p[0], T(p[1]));
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#langBtn .opt'), function (o) {
      o.classList.toggle('on', o.dataset.l === state.lang);
    });

    // Keep the tax rate's decimal separator in step with the language.
    var rate = $('taxRate');
    rate.value = rate.value.replace(/[.,]/, state.lang === 'sv' ? ',' : '.');
  }

  function setLang(lang) {
    var saved = readRaw();
    state.lang = lang;
    E.setLang(lang);
    saveLang();
    applyStatic();
    fillLevelSelect();
    buildStatements();
    writeRaw(saved);
    fillSelect();
    renderTexts();
    updateChecks();
    if (state.checked) check();
  }

  function localized(ex) { return E.localize(ex, state.tr, state.lang); }

  // ---------- Build the three statements ----------

  function buildStatements() {
    var host = $('statements');
    var sv = state.lang === 'sv';
    host.innerHTML = '';
    state.linesData.statements.forEach(function (st) {
      var head = el('div', { class: 'statement-head' }, [
        el('span', { class: 'abbr', text: sv ? st.abbrSv : st.abbr }),
        el('h2', {}, [
          document.createTextNode((sv ? cap(st.sv) : st.name) + ' '),
          el('span', { text: '(' + (sv ? st.name : st.sv) + ')' })
        ]),
        el('p', { text: sv ? st.ruleSv : st.rule })
      ]);

      var colgroup = el('colgroup', {}, [
        el('col', { class: 'c-label' }), el('col', { class: 'c-in' }),
        el('col', { class: 'c-key' }), el('col', { class: 'c-mark' })
      ]);
      var thead = el('thead', {}, [el('tr', {}, [
        el('th', { scope: 'col', text: T('colLine') }),
        el('th', { scope: 'col', text: T('colChange') }),
        el('th', { scope: 'col', class: 'h-key', text: T('colAnswer') }),
        el('th', { scope: 'col', class: 'h-key' }, [el('span', { class: 'visually-hidden', text: T('colResult') })])
      ])]);
      var tbody = el('tbody');
      var lastGroup = null;

      state.linesData.lines.filter(function (l) { return l.statement === st.id; }).forEach(function (line) {
        if (line.group && line.group !== lastGroup) {
          var g = sv ? ((state.linesData.groupsSv || {})[line.group] || line.group) : line.group;
          tbody.appendChild(el('tr', { class: 'group' }, [el('th', { colspan: '4', scope: 'rowgroup', text: g })]));
          lastGroup = line.group;
        }
        var label = E.lineLabel(line);
        var input = el('input', {
          id: 'in-' + line.id,
          type: 'text',
          inputmode: 'decimal',
          autocomplete: 'off',
          spellcheck: 'false',
          enterkeyhint: 'next',
          placeholder: '0',
          'aria-label': T('changeAria', { l: label })
        });
        input.dataset.line = line.id;
        var sign = el('button', { type: 'button', class: 'sign', tabindex: '-1', 'aria-label': T('flipSign', { l: label }), text: '±' });
        sign.dataset.line = line.id;

        var tr = el('tr', { class: 'row kind-' + line.kind, 'data-line': line.id }, [
          el('th', { scope: 'row' }, [
            el('span', { class: 'lbl', text: label }),
            el('span', { class: 'sv', text: E.lineSub(line) })
          ]),
          el('td', { class: 'in' }, [el('div', { class: 'field' }, [sign, input])]),
          el('td', { class: 'key' }),
          el('td', { class: 'mark' })
        ]);
        tbody.appendChild(tr);
      });

      var table = el('table', { class: 'lines' + (state.checked ? ' checked' : '') }, [colgroup, thead, tbody]);
      host.appendChild(el('section', { class: 'statement', 'aria-label': sv ? cap(st.sv) : st.name }, [head, el('div', { class: 'table-scroll' }, [table])]));
    });
  }

  function allInputs() {
    return Array.prototype.slice.call(document.querySelectorAll('.field input'));
  }

  function lineIds() {
    return state.linesData.lines.map(function (l) { return l.id; });
  }

  function readAnswers() {
    var a = {};
    allInputs().forEach(function (inp) { a[inp.dataset.line] = E.parseNumber(inp.value); });
    return a;
  }

  // Raw text of every field, so a language switch keeps what the user typed.
  function readRaw() {
    var r = {};
    allInputs().forEach(function (inp) { r[inp.dataset.line] = inp.value; });
    return r;
  }

  function writeRaw(r) {
    allInputs().forEach(function (inp) { if (r[inp.dataset.line] !== undefined) inp.value = r[inp.dataset.line]; });
  }

  // ---------- Difficulty and exercise lists ----------

  function levelName(n) { return T('levelShort' + n); }

  function fillLevelSelect() {
    var sel = $('level');
    sel.innerHTML = '';
    var opts = [['all', T('levelAll')], ['1', T('level1')], ['2', T('level2')], ['3', T('level3')]];
    opts.forEach(function (o) {
      var count = o[0] === 'all' ? state.exercises.length : state.exercises.filter(function (x) { return String(x.level) === o[0]; }).length;
      if (o[0] !== 'all' && count === 0) return;
      sel.appendChild(el('option', { value: o[0], text: o[1] + ' (' + count + ')' }));
    });
    sel.value = state.filter;
  }

  function buildList(preferId) {
    var f = state.filter;
    state.list = state.exercises.filter(function (x) { return f === 'all' || String(x.level) === f; });
    var i = state.list.findIndex(function (x) { return x.id === preferId; });
    state.index = i >= 0 ? i : 0;
    fillSelect();
  }

  function fillSelect() {
    var sel = $('exercise');
    sel.innerHTML = '';
    state.list.forEach(function (ex, i) {
      sel.appendChild(el('option', { value: ex.id, text: (i + 1) + '. ' + localized(ex).title }));
    });
    if (current()) sel.value = current().id;
  }

  // ---------- Exercise ----------

  function current() { return state.list[state.index]; }

  function renderTexts() {
    var ex = current();
    var lx = localized(ex);
    $('eventMeta').textContent = T('labelExercise') + ' ' + (state.index + 1) + ' ' + T('ofWord') + ' ' + state.list.length +
      ' · ' + T('levelWord') + ' ' + ex.level + ': ' + levelName(ex.level);
    $('eventTitle').textContent = lx.title;
    $('eventText').textContent = lx.event || (lx.events || []).map(function (e, i) { return (i + 1) + '. ' + e.text; }).join(' ');

    var ul = $('assumptions');
    ul.innerHTML = '';
    (lx.assumptions || []).forEach(function (a) { ul.appendChild(el('li', { text: a })); });

    $('exercise').value = ex.id;
    if (state.problems.length) showFatal(T('dataError'), state.problems);
    else $('fatal').hidden = true;
    $('nextBtn').hidden = !state.checked || state.index >= state.list.length - 1;
  }

  function renderExercise() {
    var ex = current();
    if (location.hash.slice(1) !== ex.id) {
      try { history.replaceState(null, '', '#' + ex.id); } catch (e) { /* ignore */ }
    }
    state.problems = E.validateExercise(ex, lineIds());
    state.broken = state.problems.length > 0;
    $('checkBtn').disabled = state.broken;
    renderTexts();
    clearAnswers();
  }

  function clearAnswers() {
    allInputs().forEach(function (inp) { inp.value = ''; });
    setChecked(false);
    updateChecks();
  }

  function setChecked(on) {
    state.checked = on;
    Array.prototype.forEach.call(document.querySelectorAll('table.lines'), function (t) {
      t.classList.toggle('checked', on);
    });
    if (!on) {
      Array.prototype.forEach.call(document.querySelectorAll('tr.row'), function (tr) {
        tr.classList.remove('is-ok', 'is-bad', 'is-zero');
        tr.querySelector('.key').textContent = '';
        tr.querySelector('.mark').textContent = '';
      });
      $('solution').hidden = true;
      $('score').textContent = '';
      $('score').className = 'score';
      $('nextBtn').hidden = true;
    }
  }

  // ---------- Live consistency checks on the user's own numbers ----------

  function updateChecks() {
    var answers = readAnswers();
    var bad = 0;
    allInputs().forEach(function (inp) {
      var isBad = isNaN(answers[inp.dataset.line]);
      inp.classList.toggle('bad-num', isBad);
      if (isBad) { bad++; inp.setAttribute('aria-invalid', 'true'); } else inp.removeAttribute('aria-invalid');
    });
    $('numHint').hidden = bad === 0;

    var c = E.userChecks(answers);
    paintChip($('chkBalance'), c.balance);
    paintChip($('chkCash'), c.cash);
    paintChip($('chkNi'), c.netIncome);
  }

  function paintChip(chip, r) {
    var v = chip.querySelector('.v');
    chip.classList.remove('ok', 'off');
    if (!r.active) { v.textContent = ''; return; }
    if (Math.abs(r.diff) <= E.TOLERANCE) {
      chip.classList.add('ok');
      v.textContent = '✓';
    } else {
      chip.classList.add('off');
      v.textContent = (state.lang === 'sv' ? 'fel ' : 'off ') + E.fmt(Math.abs(r.diff));
    }
  }

  // ---------- Grading and solution ----------

  function check() {
    if (state.broken) return;
    var ex = current();
    var sol = E.solve(ex, state.t);
    var answers = readAnswers();
    var result = E.grade(sol.values, answers, lineIds());

    setChecked(true);
    Object.keys(result.rows).forEach(function (id) {
      var r = result.rows[id];
      var tr = document.querySelector('tr.row[data-line="' + id + '"]');
      var zero = r.expected === 0 && r.correct;
      tr.classList.toggle('is-ok', r.correct);
      tr.classList.toggle('is-bad', !r.correct);
      tr.classList.toggle('is-zero', zero);
      tr.querySelector('.key').textContent = E.fmtSigned(r.expected);
      var mark = tr.querySelector('.mark');
      mark.textContent = r.correct ? '✓' : '✗';
      mark.setAttribute('aria-label', r.correct ? T('correct') : T('wrong'));
    });

    var score = $('score');
    score.innerHTML = '';
    var all = result.correct === result.total;
    score.className = 'score' + (all ? ' all' : '');
    score.appendChild(el('span', { class: 'full', text: all ? T('allCorrect', { n: result.total }) : T('someCorrect', { c: result.correct, n: result.total }) }));
    score.appendChild(el('span', { class: 'short', text: result.correct + '/' + result.total }));
    var link = el('a', { href: '#solution', text: T('solutionLink') });
    link.addEventListener('click', function (e) {
      e.preventDefault();
      $('solution').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    score.appendChild(link);

    $('nextBtn').hidden = state.index >= state.list.length - 1;
    renderSolution();
  }

  function renderSolution() {
    var out = E.explain(localized(current()), state.linesData, state.t);
    var kp = $('keyPoint');
    kp.innerHTML = '';
    kp.hidden = !out.keyPoint;
    if (out.keyPoint) {
      kp.appendChild(el('b', { text: T('keyPoint') }));
      kp.appendChild(document.createTextNode(out.keyPoint));
    }

    var host = $('solutionSteps');
    host.innerHTML = '';
    var n = 0;
    out.sections.forEach(function (sec) {
      var ol = el('ol', { class: 'steps' });
      sec.steps.forEach(function (step) {
        n++;
        var body = [];
        if (step.label) {
          var p = el('div', { class: 'step-text' });
          p.appendChild(el('b', { text: step.label + ' ' + step.value }));
          if (step.text) p.appendChild(document.createTextNode('. ' + step.text));
          body.push(p);
        } else {
          if (step.formula) body.push(el('div', { class: 'formula', text: step.formula }));
          if (step.text) body.push(el('div', { class: 'step-text', text: step.text }));
        }
        ol.appendChild(el('li', {}, [el('span', { class: 'n', text: String(n) })].concat(body)));
      });
      host.appendChild(el('section', { class: 'sol-section' }, [
        el('h3', {}, [el('span', { class: 'abbr', text: sec.abbr }), document.createTextNode(sec.title)]),
        ol
      ]));
    });
    $('solution').hidden = false;
  }

  // ---------- Events ----------

  function onInput(e) {
    if (!e.target.matches('.field input')) return;
    updateChecks();
    if (state.checked) check();
  }

  function onKeydown(e) {
    if (e.key !== 'Enter' || !e.target.matches('.field input')) return;
    e.preventDefault();
    var list = allInputs();
    var i = list.indexOf(e.target) + (e.shiftKey ? -1 : 1);
    if (i >= 0 && i < list.length) list[i].focus();
    else $('checkBtn').focus();
  }

  function flipSign(btn) {
    var inp = $('in-' + btn.dataset.line);
    var v = inp.value.trim();
    if (v === '') inp.value = '-';
    else if (/^[-−]/.test(v)) inp.value = v.slice(1);
    else inp.value = '-' + v.replace(/^\+/, '');
    inp.focus();
    var end = inp.value.length;
    try { inp.setSelectionRange(end, end); } catch (err) { /* ignore */ }
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function onRate() {
    var box = $('rateBox');
    var raw = E.parseNumber($('taxRate').value);
    var ok = isFinite(raw) && raw >= 0 && raw <= 100 && $('taxRate').value.trim() !== '';
    box.classList.toggle('invalid', !ok);
    if (!ok) return;
    state.t = raw / 100;
    if (state.checked) check();
  }

  function goTo(i) {
    state.index = Math.max(0, Math.min(state.list.length - 1, i));
    renderExercise();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToId(id) {
    var i = state.list.findIndex(function (x) { return x.id === id; });
    if (i < 0 && state.exercises.some(function (x) { return x.id === id; })) {
      state.filter = 'all';
      $('level').value = 'all';
      buildList(id);
      i = state.index;
    }
    if (i >= 0) goTo(i);
  }

  function randomExercise() {
    var n = state.list.length;
    if (n < 2) return;
    var i = Math.floor(Math.random() * (n - 1));
    if (i >= state.index) i++;   // never the same exercise twice in a row
    goTo(i);
  }

  function wire() {
    var host = $('statements');
    host.addEventListener('input', onInput);
    host.addEventListener('keydown', onKeydown);
    // Keep focus in the field when the sign button is pressed.
    host.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.sign')) e.preventDefault();
    });
    host.addEventListener('click', function (e) {
      var btn = e.target.closest('.sign');
      if (btn) flipSign(btn);
    });

    $('checkBtn').addEventListener('click', check);
    $('clearBtn').addEventListener('click', clearAnswers);
    $('nextBtn').addEventListener('click', function () { goTo(state.index + 1); });
    $('randomBtn').addEventListener('click', randomExercise);
    $('taxRate').addEventListener('input', onRate);
    $('langBtn').addEventListener('click', function () { setLang(state.lang === 'en' ? 'sv' : 'en'); });
    $('level').addEventListener('change', function (e) {
      var keep = current() ? current().id : null;
      state.filter = e.target.value;
      buildList(keep);
      var stays = current() && current().id === keep;
      if (stays) { fillSelect(); renderTexts(); } else goTo(0);
    });
    $('exercise').addEventListener('change', function (e) {
      var i = state.list.findIndex(function (x) { return x.id === e.target.value; });
      if (i >= 0) goTo(i);
    });
    window.addEventListener('hashchange', function () {
      var id = location.hash.slice(1);
      if (current() && id !== current().id) goToId(id);
    });
  }

  function init() {
    state.lang = storedLang();
    E.setLang(state.lang);
    applyStatic();

    var sv = fetchJson('data/exercises.sv.json').catch(function () { return {}; });   // English still works without it
    Promise.all([fetchJson('data/lines.json'), fetchJson('data/exercises.json'), sv])
      .then(function (res) {
        state.linesData = res[0];
        state.exercises = res[1].exercises || [];
        state.tr = res[2] || {};
        if (!state.exercises.length) {
          showFatal(T('noExercises'));
          return;
        }
        buildStatements();
        fillLevelSelect();
        buildList(location.hash.slice(1));
        wire();
        renderExercise();
      })
      .catch(function (err) {
        showFatal(T('loadError'), [String(err.message || err)]);
      });
  }

  init();
})();
