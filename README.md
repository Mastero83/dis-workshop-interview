# Workshopvoorbereiding · DIS Group

Interactieve vragenlijst waarmee klanten van DIS Group zich voorbereiden op een workshop. Eén vraag per scherm, in de DIS-huisstijl, volledig statisch. Antwoorden blijven in de browser staan tot iemand ze exporteert.

Live: [https://mastero83.github.io/dis-workshop-interview/](https://mastero83.github.io/dis-workshop-interview/)

Een klantlink ziet er zo uit:

```text
https://mastero83.github.io/dis-workshop-interview/?klant=Van%20Gelder
```

De naam achter `klant` verschijnt op het welkomstscherm en wordt de sleutel waaronder de antwoorden op dat apparaat worden bewaard.

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

`id`'s moeten uniek zijn binnen één vragenlijst. `options` hebben een `value` (stabiel, voor de export) en een `label` (wat de klant leest). `required: false` maakt een vraag overslaanbaar.

Een tweede vragenlijst voeg je toe als extra object in `questionnaires`, met een eigen `id`. Open hem met `?vragenlijst=dat-id`. Zonder parameter opent de eerste lijst.

Toon: Nederlands, zakelijk en niet-promotioneel. De app spreekt de klant aan met je/jij, vanuit wij. Gebruik de namen **AI Services** en **BI Services**. Geen ‘DAS’ en geen ‘business unit’. Business Central met 4PS is één aanbod, geen twee losse producten. Voorbeelden komen uit bouw en installatie. Waar AI Services staat, geeft een collega het laatste akkoord. Vraag niet om persoonsgegevens (naam, e-mail, telefoon) en niet om omzet of andere bedragen, ook niet in de voorbeeldteksten.

## Video of foto bij een vraag of onderdeel

Zet bestanden in `public/`. Paden in de JSON zijn relatief aan die map, zonder slash ervoor. De video op het welkomstscherm én bij het onderdeel *Processen en systemen* is `public/media/dis-zijn-wij.mp4` (de actuele film “DIS, zijn wij”, ongeveer 9 MB), met poster `public/media/dis-zijn-wij-poster.jpg`. Vervang die twee bestanden als er een nieuwere versie is.

Op het welkomstscherm:

```json
"video": {
  "type": "video",
  "src": "media/dis-zijn-wij.mp4",
  "poster": "media/dis-zijn-wij-poster.jpg",
  "caption": "DIS, zijn wij"
}
```

Hetzelfde object mag aan een onderdeel (`sections[].media`) of aan een vraag (`questions[].media`). Een foto werkt net zo:

```json
"media": {
  "type": "image",
  "src": "fotos/collegas-beeldscherm.jpeg",
  "alt": "Twee collega's kijken samen naar een scherm",
  "caption": "Korte toelichting onder de foto"
}
```

De speler gebruikt `playsinline`, `preload="none"`, een poster en de normale bediening. De poster blijft staan tot iemand op afspelen drukt. Niets start vanzelf.

Foto's voor achtergronden horen bij `image` op een onderdeel of `heroImage` op de vragenlijst. Gebruik de beelden uit `public/fotos/`. Ze zijn verkleind voor mobiel gebruik; de originelen zaten in het huisstijlarchief.

## Meerdere klanten

Elke combinatie van vragenlijst en `?klant=` krijgt een eigen localStorage-sleutel. Twee klanten op dezelfde laptop overschrijven elkaar dus niet. Zonder `klant` heet de sleutel `algemeen`.

Handige parameters:

| Parameter | Effect |
| --- | --- |
| `?klant=Naam` | Naam op het welkomstscherm en in de export |
| `?vragenlijst=id` | Andere lijst uit de JSON |
| `?naar=workshop@bedrijf.nl` | Vooringevuld adres voor de mailknop |
| `?beheer=1` | Scherm om geëxporteerde JSON te vergelijken |

Het logo linksboven, de kleuren en Poppins volgen de huisstijl (navy `#001A3F`, DIS-blauw `#319FDA`, geel, oranje, groen, pastelkaarten). Het placeholder-klantlogo staat in `public/logos/placeholder-klantlogo.png`. Vervang dat bestand als je een echt logo in de app wilt zetten; de vragenlijst toont standaard de klantnaam in plaats van die placeholder.

## Opslag

Er is geen backend. Bij elke wijziging schrijft de app de sessie naar `localStorage`, onder een sleutel als:

```text
dis-workshop-v1:workshop-voorbereiding:van-gelder
```

Sluiten en later terugkomen op dezelfde link herstelt de antwoorden en het scherm waar iemand was. *Opnieuw beginnen* wist alleen die sleutel op dit apparaat.

### Optionele remote opslag (uit)

Standaard verlaat niets de browser. Wil je antwoorden bij het bereiken van het overzicht ook naar een endpoint POST'en, zet dan bij de build:

```bash
VITE_REMOTE_STORE_URL=https://example.com/api/workshop-antwoorden npm run build
```

Zie `.env.example`. Het endpoint ontvangt dezelfde JSON als de download, zonder authenticatie. Laat de variabele leeg om de functie uit te laten. Mislukt het versturen, dan blijft de lokale kopie staan en kan iemand alsnog exporteren.

## Export

Op het overzicht:

- **Download JSON** — volledig bestand, versie 1, geschikt voor het beheerscherm.
- **Afdrukken / PDF** — printvriendelijke weergave. Kies in het printdialoogvenster *Opslaan als PDF*.
- **Kopieer tekst** — platte samenvatting op het klembord.
- **Mail naar ons** — opent het mailprogramma. Lange antwoorden worden ingekort; voeg de JSON toe als bijlage. Het adres komt uit `?naar=`, anders uit `consultantEmail` in de JSON, anders vraagt de app erom.

## Beheer

Open `?beheer=1`. Sleep een of meer geëxporteerde JSON-bestanden in het vlak, of kies ze via de knop. Vink er twee aan om verschillen geel te markeren. De bestanden blijven in het tabblad; er wordt niets geüpload.

## Publiceren

Push naar `main` start de GitHub Actions-workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml). Die bouwt de site en zet `dist/` op GitHub Pages, met basispad `/dis-workshop-interview/`.

Pages moet op **GitHub Actions** staan (build type `workflow`), niet op een branch. Bij een nieuw repository regel je dat eenmalig onder Settings → Pages, of via de API:

```bash
gh api -X POST repos/Mastero83/dis-workshop-interview/pages -f build_type=workflow
```

Daarna staat de site op `https://mastero83.github.io/dis-workshop-interview/`.
