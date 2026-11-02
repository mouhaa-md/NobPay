# Traduire NobPay / Translating NobPay

> **Aide bienvenue pour le wolof.** Le wolof est l'une des trois langues de Dakar Bitcoin Days. NobPay ne le propose pas encore : une traduction n'est utile que si elle vient de quelqu'un qui le parle. / **Help wanted for Wolof**, one of the three languages of Dakar Bitcoin Days: a translation is only useful if it comes from someone who speaks it.

## Comment ça marche / How it works

Le texte de l'application est **écrit en français dans le code**. L'anglais vit dans **un seul fichier**, [`frontend/src/lib/i18n/en.ts`](../frontend/src/lib/i18n/en.ts) : une table *phrase française → phrase anglaise*. Une phrase sans traduction s'affiche en français (un trou, jamais un écran cassé).

The app's text is **written in French in the code**. English lives in **one file**: a table of *French sentence → English sentence*. A sentence with no translation is shown in French (a gap, never a broken screen).

```ts
'Valider et payer': 'Approve and pay',
'Étape {index} sur {length}': 'Step {index} of {length}',          // {placeholders} are filled by the code
'{n} événement enchaîné.': '{n} chained event.',                  // plurals are separate sentences
'{n} événements enchaînés.': '{n} chained events.',
```

Règles / Rules:

- Gardez les `{placeholders}` **tels quels** (même nom, même nombre). / Keep the `{placeholders}` as they are.
- Le français **accorde** (« enchaîné », « enchaînés »), pas forcément votre langue : le code choisit entre deux phrases quand le nombre change. / French agrees in number; your language may not: the code picks between two sentences.
- Ne traduisez pas les noms propres (NobPay, Lightning, Bitcoin, Nostr, Wave, Orange Money…). / Do not translate proper names.
- Les montants gardent leurs unités (`$`, `FCFA`, `sats`). / Keep the units.

## Voir ce qui manque / See what is missing

```bash
cd frontend
node scripts/i18n-missing.mjs            # sentences shown by the app that have no translation
node scripts/i18n-missing.mjs --unused   # dictionary entries nothing uses any more
npm test -- tests/i18n.test.ts           # fails when a sentence the screens show has no English wording
```

## Ajouter une langue (par exemple le wolof) / Adding a language

1. Créez `frontend/src/lib/i18n/wo.ts` avec la même forme que `en.ts` (`export const WO: Record<string, string> = { ... }`).
2. Dans `frontend/src/lib/i18n/messages.ts` : ajoutez `'wo'` au type `Lang`, à `LANGS` et à `isLang`; dans `translate`, cherchez la phrase dans `WO` quand la langue est `'wo'`; dans `pickLang`, reconnaissez les étiquettes `wo…` du navigateur.
3. La page d'accueil a son propre texte par langue : ajoutez une entrée `wo` dans `frontend/src/components/site/landingCopy.ts` (le type `Record<Lang, LandingCopy>` vous dit tout ce qui manque) et, si vous voulez une page `/wo`, une page `src/app/(site)/wo/page.tsx` sur le modèle de `en/page.tsx`.
4. Ajoutez le nom de la langue à l'interrupteur (`nav.switchTo` / `switchHref` du texte de la page d'accueil, et le sélecteur du profil).
5. `npm test` : les tests de couverture vous disent ce qui reste.

Ouvrez une *pull request* même incomplète : une traduction partielle vaut mieux que pas de traduction. / Open a pull request even if incomplete.

## Limites connues / Known limits

- Les montants et les dates gardent le format français (`6 000,00 $`). / Numbers and dates keep the French format.
- Les messages d'erreur du serveur sont traduits quand leur texte est fixe ; ceux qui contiennent un nombre restent en français. / Server errors are translated when their text is fixed.
- Le tableau de bord administrateur n'est pas traduit (outil de l'opérateur). / The admin dashboard is not translated.
