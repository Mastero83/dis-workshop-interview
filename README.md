# Workshopvoorbereiding · DIS Group

Interactieve vragenlijst waarmee klanten van DIS Group zich voorbereiden op een workshop. Het gesprek loopt als een chat: DIS stelt een vraag, de klant antwoordt met een snelle keuze, een schaal of een tekstveld. Antwoorden blijven in de browser staan. Op de kansenkaart gaan ze ook naar Supabase, zodat je ze voor de workshop kunt teruglezen.

Live: [https://mastero83.github.io/dis-workshop-interview/](https://mastero83.github.io/dis-workshop-interview/)

Een klantlink ziet er zo uit:

```text
https://mastero83.github.io/dis-workshop-interview/?k=van-gelder
```

De slug achter `k` is de klant in Supabase. `?klant=Van%20Gelder` blijft de naam op het welkomstscherm en de sleutel in de browser. Zonder `k` gebruikt de app die slug, en anders `onbekend`. De app vraagt niet om een bedrijfsnaam.

## Lokaal draaien

```bash
npm install
npm run dev
```

De app staat op `http://localhost:5173/dis-workshop-interview/`. Een productiebuild maak je met `npm run build`; de statische bestanden komen in `dist/`.

## Vragen aanpassen

Alle teksten, onderdelen en vragen staan in [`src/vragenlijst.json`](src/vragenlijst.json). Dat bestand is de enige bron. Na een wijziging is een nieuwe build (of de dev-server) genoeg.

De structuur:

```json
{
  "questionnaires": [
    {
      "id": "workshop-voorbereiding",
      "title": "Workshopvoorbereiding",
      "sections": [
        {
          "id": "bedrijf",
          "title": "Over je bedrijf",
          "questions": [
            {
              "id": "organisatie",
              "type": "text",
              "title": "Hoe heet jullie organisatie?",
              "required": true
            }
          ]
        }
      ]
    }
  ]
}
```

Vraagtypes:

| `type` | Wat de klant ziet |
| --- | --- |
| `text` | één regel tekst |
| `longtext` | een open veld |
| `single` | één keuze, als kaarten |
| `multiple` | meerdere keuzes |
| `scale` | cijfer van `min` tot `max` (standaard 1–5) |
| `rank` | volgorde kiezen; `minRanked` is het minimum |
| `roles` | tien rollenkaarten, meerdere keuzes. Elke optie heeft `figure`, `icon`, `hint`, `source` en `sourceKind` (`bron` of `schatting`) |

`id`'s moeten uniek zijn binnen één vragenlijst. `options` hebben een `value` (stabiel, voor de export) en een `label` (wat de klant leest). `required: false` maakt een vraag overslaanbaar.

Een tweede vragenlijst voeg je toe als extra object in `questionnaires`, met een eigen `id`. Open hem met `?vragenlijst=dat-id`. Zonder parameter opent de eerste lijst.

Toon: Nederlands, zakelijk en niet-promotioneel. De app spreekt de klant aan met je/jij, vanuit wij. Gebruik de namen **AI Services** en **BI Services**. Geen ‘DAS’ en geen ‘business unit’. Business Central met 4PS is één aanbod, geen twee losse producten. Voorbeelden komen uit bouw en installatie. Waar AI Services staat, geeft een collega het laatste akkoord. Vraag niet om persoonsgegevens (naam, e-mail, telefoon) en niet om omzet of andere bedragen, ook niet in de voorbeeldteksten.

## Introductie en context in het gesprek

Zet bestanden in `public/media/`. Paden in de JSON zijn relatief aan `public/`, zonder slash ervoor. Een nieuw filmpje toevoegen is een bestand neerzetten en de JSON aanpassen. Geen codewijziging nodig.

Het welkomstscherm toont `openingVideo`: `media/dis-group-ai-v13.mp4` (1280×720, zonder klantnamen) met poster `media/dis-group-ai-v13-poster.jpg`. Dat is de enige plek waar de openingsfilm vandaan komt. `introVideo` en `video` blijven als reserve als `openingVideo` ontbreekt. “Wie zijn wij” (`media/dis-zijn-wij.mp4`) zit niet in het gesprek.

```json
"introVideo": {
  "src": "media/intro.mp4",
  "poster": "media/intro-poster.jpg",
  "srcPortrait": "media/intro-4x5.mp4",
  "posterPortrait": "media/intro-4x5-poster.jpg",
  "srcFullscreen": "media/intro-vertical.mp4",
  "captions": "media/intro.vtt"
}
```

Het gesprek duurt ongeveer twee tot drie minuten. Na de film kiest iemand rollen. Bij meer dan drie volgt een top 3. Per rol staan hooguit vier korte “ik”-uitspraken, met Nee, Soms of Vaak. Daaruit komen maximaal drie kansen. Per kans: graag, misschien of niet nu. Eigen rol, tijdvreter, idee en een slotzin zijn optioneel. Daarna één urgentiecijfer. De kansenkaart staat op het overzicht “Jullie kansenkaart”, met vier even grote vlakken. We vragen niet welk systeem iemand gebruikt en niet om de organisatienaam: klanten werken al met Business Central met 4PS. De clip bij de rollen is `media/ctx-rollen-tijdvreters.mp4`. `ctx-kettingreactie.mp4`, `ctx-herkenbaar.mp4`, `ctx-werksessie-dagdelen.mp4` en `ctx-systemen-bc-4ps.mp4` staan in `disabledMedia` en worden niet getoond. Zet `enabled` niet op `true` tot dat wel zo is.

Op een telefoon vullen contextfilmpjes de breedte van de ballon. *Volledig scherm* vergroot ze, zodat de ingebrande ondertitel leesbaar is.

Elke vraag mag een `context` hebben. Die verschijnt als bericht van de host vóór de vraag.

Een filmpje start pas na een tik, gedempt en met `playsinline`. Nog een tik zet het geluid aan. `captions` wijst naar een WebVTT-bestand; veel clips hebben de ondertitel ook ingebrand.

```json
"context": {
  "type": "video",
  "src": "media/wie-zijn-wij.mp4",
  "poster": "media/wie-zijn-wij.jpg",
  "srcPortrait": "media/wie-zijn-wij-staand.mp4",
  "posterPortrait": "media/wie-zijn-wij-staand.jpg",
  "captions": "media/wie-zijn-wij.vtt",
  "title": "Wie zijn wij",
  "body": "Korte toelichting onder het filmpje."
}
```

Een uitlegkaart, zonder bestand:

```json
"context": {
  "type": "explainer",
  "title": "Wat bedoelen we met BI Services?",
  "body": "Korte uitleg in gewone taal."
}
```

Een foto bij een vraag blijft mogelijk via `media` met `type: "image"`. Die verschijnt in de vraagballon.

De host op het welkomstscherm speelt niet vanzelf. In het gesprek start een contextfilmpje pas na een tik, gedempt, met `playsinline`. De poster blijft staan tot die tik.

## Meerdere klanten

Elke combinatie van vragenlijst en `?klant=` krijgt een eigen localStorage-sleutel. Twee klanten op dezelfde laptop overschrijven elkaar dus niet. Zonder `klant` heet de sleutel `algemeen`.

Handige parameters:

| Parameter | Effect |
| --- | --- |
| `?k=van-gelder` | Klant-slug in Supabase. Wint van de rest |
| `?klant=Naam` | Naam op het welkomstscherm, in de export, en (zonder `k`) de slug |
| `?vragenlijst=id` | Andere lijst uit de JSON |
| `?beheer=1` | Op het eindscherm een debugregel met de laatste opslag. Op de andere schermen het vergelijkscherm |
| `?vergelijk=1` | Altijd het scherm om geëxporteerde JSON te vergelijken |
| `?reset=1` | Wist de opgeslagen antwoorden zonder bevestiging en opent het welkomstscherm |

Het logo linksboven, de kleuren en Poppins volgen de huisstijl (navy `#001A3F`, DIS-blauw `#319FDA`, geel, oranje, groen, pastelkaarten). Het placeholder-klantlogo staat in `public/logos/placeholder-klantlogo.png`. Vervang dat bestand als je een echt logo in de app wilt zetten; de vragenlijst toont standaard de klantnaam in plaats van die placeholder.

## Opslag

Bij elke wijziging schrijft de app de sessie naar `localStorage`, onder een sleutel als:

```text
dis-workshop-v1:workshop-voorbereiding:van-gelder
```

Sluiten en later terugkomen op dezelfde link herstelt de antwoorden op de vraag waar iemand was. De sessie bewaart het vraag-id (schemaversie 6). Een oudere sessie past niet meer op het gesprek: die wordt gewist en het welkomstscherm toont “Het gesprek is bijgewerkt, we beginnen opnieuw.”

*Opnieuw beginnen* staat in de balk van het welkomstscherm en het gesprek, en als tekstlink op het overzicht. Na bevestiging wist de app alle `dis-workshop`-sleutels in `localStorage` en de `sessionStorage`, en opent het welkomstscherm via `?reset=1`. Dat is dezelfde start als een verse pagina: nieuw `sessie_id`, geen oude bubbels of kansenkaart.

### Supabase

Niets gaat vanzelf naar Supabase. Op de kansenkaart staat één knop, *Versturen*. Die stuurt de volledige payload, inclusief de graag-bespreken-keuzes, eigen invoer en `invultijd_seconden` (seconden vanaf het openen van het welkomstscherm). Alleen na een geslaagde response (2xx) opent een bedankvenster met die tijd, en de knop toont “Verstuurd”. Zo komt er één rij per keer dat iemand verstuurt. Lukt het niet, dan heet dezelfde knop *Opnieuw versturen* en blijft het bedankvenster dicht. Er is geen tweede knop en geen automatische herhaalbeurt.

De rij komt in `public.workshop_antwoorden`:

| Kolom | Inhoud |
| --- | --- |
| `klant` | slug uit `?k=`, anders uit de localStorage-sleutel, anders `onbekend` |
| `sessie_id` | vast uuid voor die browsersessie |
| `schema_versie` | de sessie-schemaversie (nu 6) |
| `payload` | de volledige export, inclusief kansen, eigen invoer en `invultijd_seconden` |

De publishable key en de project-URL staan in `.env.production` en als default in de code (`VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`). Het zijn publieke waarden. De app gebruikt een gewone `POST` met `Prefer: return=minimal`. De rol anon mag alleen inserten, niet lezen.

Bekijk de binnengekomen antwoorden in het Supabase-dashboard → Table Editor → `workshop_antwoorden`.

Op het welkomstscherm staat: “Je antwoorden worden opgeslagen voor de workshop van DIS Group.”

## Export

Het overzicht heeft geen download-, mail- of afdrukknop. Op het vergelijkscherm (`?vergelijk=1`) kun je een sessie die nog op dit apparaat staat exporteren als JSON. In het gesprek tik je een eigen antwoordballon aan om dat antwoord te wijzigen. Het overzicht groepeert de antwoorden per hoofdstuk en heeft per vraag *Wijzig*.

## Beheer

Open `?beheer=1`. Sleep een of meer geëxporteerde JSON-bestanden in het vlak, of kies ze via de knop. Vink er twee aan om verschillen geel te markeren. De bestanden blijven in het tabblad; er wordt niets geüpload.

## Publiceren

Push naar `main` start de GitHub Actions-workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml). Die bouwt de site en zet `dist/` op GitHub Pages, met basispad `/dis-workshop-interview/`.

Pages moet op **GitHub Actions** staan (build type `workflow`), niet op een branch. Bij een nieuw repository regel je dat eenmalig onder Settings → Pages, of via de API:

```bash
gh api -X POST repos/Mastero83/dis-workshop-interview/pages -f build_type=workflow
```

Daarna staat de site op `https://mastero83.github.io/dis-workshop-interview/`.
