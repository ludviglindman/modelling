/* User interface for the flow trainer. All accounting lives in engine.js. */
(function () {
  'use strict';

  var E = window.FlowEngine;
  var state = {
    linesData: null,
    exercises: [],
    index: 0,
    t: E.DEFAULT_TAX_RATE,
    checked: false
  };

  var $ = function (id) { return document.getElementById(id); };
  var LEVELS = { 1: 'One event', 2: 'Two events in a row', 3: 'Second-order effects' };

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

  // ---------- Build the three statements once ----------

  function buildStatements() {
    var host = $('statements');
    host.innerHTML = '';
    state.linesData.statements.forEach(function (st) {
      var head = el('div', { class: 'statement-head' }, [
        el('span', { class: 'abbr', text: st.abbr }),
        el('h2', {}, [document.createTextNode(st.name + ' '), el('span', { text: '(' + st.sv + ')' })]),
        el('p', { text: st.rule })
      ]);

      var colgroup = el('colgroup', {}, [
        el('col', { class: 'c-label' }), el('col', { class: 'c-in' }),
        el('col', { class: 'c-key' }), el('col', { class: 'c-mark' })
      ]);
      var thead = el('thead', {}, [el('tr', {}, [
        el('th', { scope: 'col', text: 'Line' }),
        el('th', { scope: 'col', text: 'Change' }),
        el('th', { scope: 'col', class: 'h-key', text: 'Answer' }),
        el('th', { scope: 'col', class: 'h-key' }, [el('span', { class: 'visually-hidden', text: 'Result' })])
      ])]);
      var tbody = el('tbody');
      var lastGroup = null;

      state.linesData.lines.filter(function (l) { return l.statement === st.id; }).forEach(function (line) {
        if (line.group && line.group !== lastGroup) {
          tbody.appendChild(el('tr', { class: 'group' }, [el('th', { colspan: '4', scope: 'rowgroup', text: line.group })]));
          lastGroup = line.group;
        }
        var input = el('input', {
          id: 'in-' + line.id,
          type: 'text',
          inputmode: 'decimal',
          autocomplete: 'off',
          spellcheck: 'false',
          enterkeyhint: 'next',
          placeholder: '0',
          'aria-label': line.label + ', change'
        });
        input.dataset.line = line.id;
        var sign = el('button', { type: 'button', class: 'sign', tabindex: '-1', 'aria-label': 'Flip sign of ' + line.label, text: '±' });
        sign.dataset.line = line.id;

        var tr = el('tr', { class: 'row kind-' + line.kind, 'data-line': line.id }, [
          el('th', { scope: 'row' }, [
            el('span', { class: 'lbl', text: line.label }),
            el('span', { class: 'sv', text: line.sv })
          ]),
          el('td', { class: 'in' }, [el('div', { class: 'field' }, [sign, input])]),
          el('td', { class: 'key' }),
          el('td', { class: 'mark' })
        ]);
        tbody.appendChild(tr);
      });

      var table = el('table', { class: 'lines' }, [colgroup, thead, tbody]);
      host.appendChild(el('section', { class: 'statement', 'aria-label': st.name }, [head, el('div', { class: 'table-scroll' }, [table])]));
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

  // ---------- Exercise ----------

  function current() { return state.exercises[state.index]; }

  function renderExercise() {
    var ex = current();
    $('fatal').hidden = true;
    $('eventMeta').textContent = 'Exercise ' + (state.index + 1) + ' of ' + state.exercises.length + ' · Level ' + ex.level + ': ' + (LEVELS[ex.level] || '');
    $('eventTitle').textContent = ex.title;

    var text = ex.event || (ex.events || []).map(function (e, i) { return (i + 1) + '. ' + e.text; }).join(' ');
    $('eventText').textContent = text;

    var ul = $('assumptions');
    ul.innerHTML = '';
    (ex.assumptions || []).forEach(function (a) { ul.appendChild(el('li', { text: a })); });

    $('exercise').value = ex.id;
    if (location.hash.slice(1) !== ex.id) {
      try { history.replaceState(null, '', '#' + ex.id); } catch (e) { /* ignore */ }
    }

    var problems = E.validateExercise(ex, lineIds());
    if (problems.length) showFatal('This exercise has a data error. Fix it in data/exercises.json:', problems);

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
    var c = E.userChecks(readAnswers());
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
      v.textContent = 'off ' + E.fmt(Math.abs(r.diff));
    }
  }

  // ---------- Grading and solution ----------

  function check() {
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
      mark.setAttribute('aria-label', r.correct ? 'Correct' : 'Wrong');
    });

    var score = $('score');
    score.innerHTML = '';
    var all = result.correct === result.total;
    score.className = 'score' + (all ? ' all' : '');
    score.appendChild(el('span', { class: 'full', text: all ? 'All ' + result.total + ' lines correct' : result.correct + ' of ' + result.total + ' lines correct' }));
    score.appendChild(el('span', { class: 'short', text: result.correct + '/' + result.total }));
    var link = el('a', { href: '#solution', text: 'Solution' });
    link.addEventListener('click', function (e) {
      e.preventDefault();
      $('solution').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    score.appendChild(link);

    $('nextBtn').hidden = state.index >= state.exercises.length - 1;
    renderSolution();
  }

  function renderSolution() {
    var ex = current();
    var out = E.explain(ex, state.linesData, state.t);
    var kp = $('keyPoint');
    kp.innerHTML = '';
    kp.hidden = !out.keyPoint;
    if (out.keyPoint) {
      kp.appendChild(el('b', { text: 'Key point' }));
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
    state.index = Math.max(0, Math.min(state.exercises.length - 1, i));
    renderExercise();
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    $('taxRate').addEventListener('input', onRate);
    $('exercise').addEventListener('change', function (e) {
      var i = state.exercises.findIndex(function (x) { return x.id === e.target.value; });
      if (i >= 0) goTo(i);
    });
    window.addEventListener('hashchange', function () {
      var i = state.exercises.findIndex(function (x) { return x.id === location.hash.slice(1); });
      if (i >= 0 && i !== state.index) goTo(i);
    });
  }

  function fillSelect() {
    var sel = $('exercise');
    sel.innerHTML = '';
    state.exercises.forEach(function (ex, i) {
      sel.appendChild(el('option', {
        value: ex.id,
        text: (i + 1) + '. ' + ex.title
      }));
    });
  }

  function init() {
    Promise.all([fetchJson('data/lines.json'), fetchJson('data/exercises.json')])
      .then(function (res) {
        state.linesData = res[0];
        state.exercises = res[1].exercises || [];
        if (!state.exercises.length) {
          showFatal('No exercises found in data/exercises.json.');
          return;
        }
        buildStatements();
        fillSelect();
        wire();
        var start = state.exercises.findIndex(function (x) { return x.id === location.hash.slice(1); });
        state.index = start >= 0 ? start : 0;
        renderExercise();
      })
      .catch(function (err) {
        showFatal('Could not load the exercise data. Open the page through a web server, not as a local file.', [String(err.message || err)]);
      });
  }

  init();
})();
