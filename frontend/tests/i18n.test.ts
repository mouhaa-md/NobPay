import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { EN } from '@/lib/i18n/en';
import { isLang, normalizeKey, pickLang, safeNext, translate } from '@/lib/i18n/messages';
import { INSTANCE } from '@/lib/instance';
import { LEDGER_LABEL } from '@/lib/ledgerLabels';
import { PROOF_LABEL, PROOF_SHORT, QUICK_TRIAL, SECTORS, STEP_TEMPLATES } from '@/lib/templates';

describe('translate', () => {
  it('leaves French as it is, and fills the placeholders', () => {
    expect(translate('fr', 'Étape {n} sur {total}', { n: 2, total: 6 })).toBe('Étape 2 sur 6');
  });

  it('translates a known sentence, and shows the French one when there is no translation (never a blank)', () => {
    expect(translate('en', 'Valider et payer')).toBe('Approve and pay');
    expect(translate('en', 'Une phrase que personne n’a traduite')).toBe('Une phrase que personne n’a traduite');
  });

  it('fills the placeholders of the English sentence, and leaves an unknown one visible', () => {
    expect(translate('en', 'Étape {index} sur {length}', { index: 3, length: 6 })).toBe('Step 3 of 6');
    expect(translate('en', 'Étape {index} sur {length}', { index: 3 })).toBe('Step 3 of {length}');
  });

  it('finds a sentence whatever the whitespace around it, and keeps that whitespace (text built around it still reads right)', () => {
    expect(translate('en', '  Valider\n   et payer ')).toBe('  Approve and pay ');
    expect(normalizeKey('  a \n b ')).toBe('a b');
  });

  it('a user-written text that looks like an Object property is shown as written (a step called « constructor »)', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) expect(translate('en', name)).toBe(name);
  });

  it('plural forms are separate sentences, because French agreement does not carry over', () => {
    expect(translate('en', '{n} événements enchaînés.', { n: 3 })).toBe('3 chained events.');
    expect(translate('en', '{n} événement enchaîné.', { n: 1 })).toBe('1 chained event.');
  });
});

describe('the language of a visitor', () => {
  it('the cookie wins, then the browser, then French', () => {
    expect(pickLang('en', 'fr-FR,fr;q=0.9')).toBe('en');
    expect(pickLang('fr', 'en-US')).toBe('fr');
    expect(pickLang(undefined, 'en-GB,en;q=0.8')).toBe('en');
    expect(pickLang(undefined, 'fr-SN,fr;q=0.9,en;q=0.5')).toBe('fr');
    expect(pickLang(undefined, 'wo-SN,en;q=0.5')).toBe('en'); // Wolof is not available yet: next language the browser asks for
    expect(pickLang(undefined, 'de-DE')).toBe('fr');
    expect(pickLang(undefined, null)).toBe('fr');
    expect(pickLang('de', undefined)).toBe('fr'); // an unknown cookie value is ignored
  });

  it('knows which languages exist', () => {
    expect(isLang('fr') && isLang('en')).toBe(true);
    expect(isLang('de')).toBe(false);
    expect(isLang(undefined)).toBe(false);
  });

  it('the language switch only ever sends the visitor to a page of this site', () => {
    for (const ok of ['/', '/app', '/en', '/verifier/a_123', '/app/projets?secteur=immobilier']) expect(safeNext(ok), ok).toBe(ok);
    for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', 'app', '', '/a b', null, undefined]) expect(safeNext(bad as string | null | undefined), String(bad)).toBe('/');
  });
});

describe('the labels the code keeps in tables have an English wording', () => {
  const needs = (fr: string) => expect(EN[normalizeKey(fr)], `no English for « ${fr} »`).toBeTruthy();

  it('sectors, template steps, proofs, ledger events and instance modes', () => {
    for (const s of Object.values(SECTORS)) {
      needs(s.label);
      needs(s.tagline);
    }
    for (const steps of Object.values(STEP_TEMPLATES)) for (const t of steps) needs(t.title);
    for (const s of QUICK_TRIAL.steps) needs(s.title);
    needs(QUICK_TRIAL.managerName);
    for (const l of [...Object.values(PROOF_LABEL), ...Object.values(PROOF_SHORT)]) needs(l);
    for (const l of Object.values(LEDGER_LABEL)) needs(l.label);
    for (const m of Object.values(INSTANCE)) {
      needs(m.short);
      needs(m.long);
      needs(m.custody);
      needs(m.about);
    }
  });
});

describe('every sentence the screens show', () => {
  it('has an English wording (scripts/i18n-missing.mjs lists the ones that do not)', () => {
    let output = '';
    try {
      output = execFileSync(process.execPath, ['scripts/i18n-missing.mjs', '--check'], { encoding: 'utf8', timeout: 60_000 });
    } catch (e) {
      throw new Error(`Sentences without an English translation:\n${(e as { stdout?: string }).stdout ?? e}`);
    }
    expect(output).toMatch(/\d+\/\d+ sentences translated, 0 missing\./);
  }, 70_000);
});
