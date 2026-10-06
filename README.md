# Flow Trainer

Gratis träningssida för hur resultaträkning, kassaflödesanalys och balansräkning hänger ihop. Fas 1 i projektet Modellträning.

## Filer

```
index.html            sidan
css/style.css         utseende
js/engine.js          all redovisningslogik: räknar facit, rättar, skriver stegen
js/app.js             gränssnittet
js/i18n.js            sidans texter på engelska och svenska
data/lines.json       radlistan (samma rader i alla övningar)
data/exercises.json   övningarna (engelska)
data/exercises.sv.json  svenska texter till övningarna, nyckel = övningens id
tools/validate.js     kontrollerar alla övningar innan publicering
```

## Köra lokalt

Sidan läser JSON med `fetch`, så den måste öppnas via en webbserver, inte genom att dubbelklicka på filen.

```
python3 -m http.server 8000
```

Öppna sedan http://localhost:8000. På GitHub Pages fungerar det utan extra steg.

## Lägga till en övning

1. Lägg till ett objekt i `data/exercises.json`. Ange bara händelsens direkta effekter före skatt i `inputs`. Motorn räknar själv fram skatt, årets resultat, hela kassaflödesanalysen, kassan, balanserade vinstmedel och alla summor.
2. Lägg till motsvarande svenska texter i `data/exercises.sv.json` (rubrik, händelse, antaganden, förklaringar, huvudpoäng). Antal antaganden och nycklarna i `notes` ska vara samma som på engelska, och `{platshållare}` i `keyPoint` ska vara identiska. Utan översättning visas övningen på engelska även i svenskt läge, men valideringen slår larm.
3. Kör `node tools/validate.js <id>` (lägg till `sv` efter id för svensk utskrift). Skriptet kontrollerar att balansräkningen balanserar vid flera skattesatser och skriver ut facit och stegen.
3. Pusha. Övningen går live direkt.

### Fält

| Fält | Krav | Betydelse |
|---|---|---|
| `id` | ja | Unikt, t.ex. `e02-inventory-cash`. Används i länken (`#e02-inventory-cash`). |
| `level` | ja | 1 = en händelse, 2 = två händelser i följd, 3 = andra ordningens effekter. |
| `title` | ja | Kort rubrik på engelska. |
| `event` | ja | Händelsen, som användaren ser den. |
| `assumptions` | nej | Lista med antaganden. |
| `inputs` | ja | Direkta effekter, se nedan. |
| `notes` | nej | Förklaring per rad i facit, nyckel = rad-id. |
| `keyPoint` | nej | Huvudpoängen. `{tax}` ger radens värde, `{abs:tax}` absolutbeloppet, `{t}` skattesatsen. |
| `taxSettlement` | nej | `cash` (standard) eller `payable` om skatten inte betalas i perioden. |
| `nonDeductible` | nej | Belopp som inte är avdragsgillt, t.ex. 100 vid nedskrivning av goodwill. |
| `events` | nej | Vid nivå 2: lista med `{ "text": ..., "inputs": {...} }` i stället för `event` och `inputs`. |

### Rader som får sättas i `inputs`

Teckenregel: allt är förändringar. I RR är en högre kostnad +. I KA betyder + att pengar kommer in. I BR betyder + att raden ökar.

- RR: `revenue`, `cogs`, `da`, `impairments`, `gain_on_sale`, `interest`
- KA: `capex`, `asset_sale_proceeds`, `net_borrowing`, `equity_issuance`, `dividends`
- BR: `ar`, `inventory`, `ppe`, `rou`, `goodwill`, `ap`, `deferred_revenue`, `tax_payable`, `debt`, `lease_liabilities`, `share_capital`, `retained_earnings` (bara direkta poster mot eget kapital)

Allt annat räknar motorn fram. Två saker att hålla koll på:

- Nedskrivning av varulager bokförs i `cogs`, inte i `impairments`. `impairments` läggs tillbaka i KA, och lagerminskningen fångas redan i rörelsekapitalet.
- Kassaflöden i KA måste anges uttryckligen. En maskin köpt kontant är `"ppe": 100, "capex": -100`. Valideringen hittar felet om något saknas, eftersom balansräkningen då inte balanserar.

### Exempel

```json
{
  "id": "e01-depreciation",
  "level": 1,
  "title": "Depreciation increases",
  "event": "Depreciation (avskrivningar) increases by 100. ...",
  "inputs": { "da": 100, "ppe": -100 },
  "notes": { "ppe": "Depreciation lowers the book value of the machines." },
  "keyPoint": "... The lower tax bill, {abs:tax}, is the only cash effect."
}
```

## Språk, nivåer och slump

Språkknappen (EN / SV) byter hela sidan mellan engelska och svenska, ett språk i taget. Valet sparas i webbläsaren och startspråket följer webbläsarens språk. Rubriker, förklaringar och facit-steg finns på båda språken; i svenskt läge visas engelsk term som underrad. Decimaltecknet följer språket (punkt eller komma), men både komma och punkt fungerar alltid när man skriver.

Svårighetsgraden väljs i en rullista (alla nivåer, 1, 2 eller 3) och filtrerar övningslistan. Knappen Random/Slumpa väljer en övning på vald nivå, aldrig samma som den som visas.

## Rättning

Ett svar räknas som rätt om det ligger inom 0,05 från facit, så avrundning till en decimal går alltid igenom. Tom ruta = 0. Både komma och punkt fungerar som decimaltecken.

## Publicera

Lägg mappen i ett GitHub-repo och slå på Pages (Settings, Pages, Deploy from branch). Kör `node tools/validate.js` före varje publicering.
