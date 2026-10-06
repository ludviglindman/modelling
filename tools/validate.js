#!/usr/bin/env node
/*
 * Checks every exercise in data/exercises.json:
 *   - only allowed input lines, valid fields, placeholders that resolve
 *   - the balance sheet balances at several tax rates
 * Then prints the solution for each exercise at the default tax rate.
 *
 * Usage: node tools/validate.js            (all exercises)
 *        node tools/validate.js e01-depreciation   (one exercise, with steps)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Engine = require('../js/engine.js');

const root = path.join(__dirname, '..');
const linesData = JSON.parse(fs.readFileSync(path.join(root, 'data/lines.json'), 'utf8'));
const exData = JSON.parse(fs.readFileSync(path.join(root, 'data/exercises.json'), 'utf8'));
const svData = JSON.parse(fs.readFileSync(path.join(root, 'data/exercises.sv.json'), 'utf8'));
const only = process.argv[2];
const lang = process.argv[3] === 'sv' ? 'sv' : 'en';
Engine.setLang(lang);

let failed = 0;
const report = Engine.validateAll(linesData, exData);
report.forEach((r) => {
  if (r.problems.length) {
    failed++;
    console.log('FAIL ' + r.id);
    r.problems.forEach((p) => console.log('     - ' + p));
  } else {
    console.log('ok   ' + r.id);
  }
});

// Swedish translations must match their exercises, and no text may contain dashes used as punctuation.
exData.exercises.forEach((ex) => {
  const problems = Engine.validateTranslation(ex, svData[ex.id]);
  const text = JSON.stringify([ex, svData[ex.id]]);
  if (/[—–]/.test(text)) problems.push('contains an em or en dash; use a comma, semicolon or new sentence');
  if (problems.length) {
    failed++;
    console.log('FAIL ' + ex.id + ' (translation)');
    problems.forEach((p) => console.log('     - ' + p));
  }
});
Object.keys(svData).forEach((id) => {
  if (!exData.exercises.some((ex) => ex.id === id)) { failed++; console.log('FAIL sv entry without exercise: ' + id); }
});

const t = Engine.DEFAULT_TAX_RATE;
exData.exercises
  .filter((ex) => !only || ex.id === only)
  .map((ex) => Engine.localize(ex, svData, lang))
  .forEach((ex) => {
    const v = Engine.solve(ex, t).values;
    console.log('\n' + ex.id + ' at ' + Engine.fmtPct(t));
    linesData.statements.forEach((st) => {
      console.log('  ' + st.abbr);
      linesData.lines
        .filter((l) => l.statement === st.id)
        .forEach((l) => {
          const val = v[l.id] || 0;
          if (val !== 0 || l.kind !== 'item') {
            console.log('    ' + Engine.lineLabel(l).padEnd(38) + Engine.fmtSigned(val).padStart(9));
          }
        });
    });
    if (only) {
      const ex2 = Engine.explain(ex, linesData, t);
      ex2.sections.forEach((s) => {
        console.log('\n  ' + s.title);
        s.steps.forEach((st) => {
          if (st.label) console.log('    ' + st.label + ' ' + st.value + (st.text ? '. ' + st.text : ''));
          else {
            if (st.formula) console.log('    ' + st.formula);
            if (st.text) console.log('      ' + st.text);
          }
        });
      });
      console.log('\n  Key point: ' + ex2.keyPoint);
    }
  });

console.log('\n' + (failed ? failed + ' exercise(s) failed.' : 'All exercises pass.'));
process.exit(failed ? 1 : 0);
