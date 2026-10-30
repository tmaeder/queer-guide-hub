import { buildProductRelevanceRequest } from '../_shared/jev-product-relevance.ts'

// Public adapter snapshots captured 2026-10-29. Labels were fixed before inference.
// These are text-scope judgments, not current product or merchant-ownership verification.
const records = [
  {
    "name": "public-product-00",
    "title": "Obsessive - Bodystocking",
    "text": "Highlights Schwarzes Netz-Bodystocking mit floralem Muster Offener Schritt für besonderen Tragekomfort Kurze Ärmel und betonter, offener Rücken Fishnet-Strumpf-Optik an den Beinen Elastisches, angenehmes Material ProduktbeschreibungDer Bodystocking überzeugt mit einem schwarzen Netzstoff, der mit einem floralen Muster verziert ist. Streifen verlaufen dezent über Brust und Bauch und sorgen zusammen mit dem betonten Rücken für ein aufregendes Gesamtbild. Kurze Ärmel und ein offener Rücken unterstreichen den verführerischen Charakter des Designs, während die strumpfartige Fishnet-Optik an den Beinen für ein stimmiges Erscheinungsbild sorgt.Gefertigt aus einem elastischen Materialmix aus Polyamid und Elasthan, passt sich der Bodystocking angenehm an die Körperform an und bietet dabei ein weiches Hautgefühl. Der leicht durchscheinende Netzstoff sorgt für eine luftige, dennoch gut sitzende Passform. Der offene Schritt macht den Bodystocking zu einem bequemen Kleidungsstück für besondere Momente im Schlafzimmer.Details Modellbezeichnung: F238 Material: 90% Polyamid, 10% Elasthan Schwarzes florales Netzmuster Kurze Ärmel, offener Rücken und offener Schritt Strumpf-Optik im Fishnet-Stil",
    "source_url": "https://ohmyfantasy.com/products/obsessive-bodystocking-1",
    "source_name": "ohmyfantasy",
    "expected": "reject"
  },
  {
    "name": "public-product-01",
    "title": "Cottelli - Strapsstrumpfhose",
    "text": "Highlights Strapsstrumpfhose in Strapsgurt-Optik Grobes Netzmaterial Rote Zierschnürung hinten Mit Elasthan für angenehmen Tragekomfort ProduktbeschreibungDie Strapsstrumpfhose von Cottelli Collection Stockings & Hosiery überzeugt durch ihre auffällige Strapsgurt-Optik. Das grobe Netzmaterial verleiht ihr einen extravaganten Look, während die rote Zierschnürung im hinteren Bereich einen besonderen Blickfang setzt. So bringt dieses Kleidungsstück alles mit, was du für einen aufsehenerregenden Auftritt benötigst.Dank des Elasthan-Anteils ist die Strapsstrumpfhose trotz ihres extravaganten Designs so bequem wie eine klassische Strumpfhose. Das Material liegt angenehm auf der Haut und passt sich flexibel an. Für die Pflege empfiehlt sich die schonende Handwäsche mit Feinwaschmittel, damit du lange etwas von deiner Strapsstrumpfhose hast.Details Lieferumfang: 1 x Strapsstrumpfhose in Strapsgurt-Optik von Cottelli Collection Stockings & Hosiery Material: 90% Polyamid, 10% Elasthan Größe: S/M, L/XL Farbe: schwarz",
    "source_url": "https://ohmyfantasy.com/products/cottelli-strapsstrumpfhose",
    "source_name": "ohmyfantasy",
    "expected": "reject"
  },
  {
    "name": "public-product-02",
    "title": "Pretty Love - Orlando - Vibrator-Fingerhülle",
    "text": "Highlights 10 Vibrationsmodi für vielseitige Stimulation Aufsteckbares Fingerdesign für präzise Kontrolle Kompakte Form für gezielte Anwendung Weiches Silikon für angenehme Haptik Einfache Bedienung über Tastensteuerung ProduktbeschreibungDieser Finger-Vibrator ermöglicht Dir eine besonders präzise und kontrollierte Stimulation. Das kompakte Aufsteckdesign wird einfach über den Finger geschoben und erlaubt eine intuitive Anwendung sowie gezielte Bewegungen. Mit insgesamt 10 Vibrationsmodi bietet der Stimulator verschiedene Intensitäten und Rhythmen für abwechslungsreiche Empfindungen. Die Oberfläche aus weichem Silikon sorgt für eine angenehme Haptik während der Anwendung.Dank der 10 Vibrationsmodi lässt sich das Erlebnis individuell anpassen – von sanften Impulsen bis hin zu intensiveren Vibrationen. Die Bedienung erfolgt über eine einfache Tastensteuerung, sodass Du die Intensität schnell und unkompliziert wechseln kannst. Durch das kompakte, aufsteckbare Design eignet sich der Fingerstimulator sowohl für die Anwendung allein als auch zu zweit.Details Finger-Vibrator für präzise Stimulation 10 Vibrationsfunktionen Aufsteckbares Fingerdesign Batteriebetrieben Material aus Silikon und ABS Einfache Reinigung und Pflege",
    "source_url": "https://ohmyfantasy.com/products/pretty-love-orlando-vibrator-fingerhulle",
    "source_name": "ohmyfantasy",
    "expected": "reject"
  },
  {
    "name": "public-product-03",
    "title": "SVAKOM - Sam Neo 2 Pro - Masturbator",
    "text": "Highlights Intensive Vibrationen USB wiederaufladbar App-Steuerung Mit Heizfunktion Leiser Betrieb ProduktbeschreibungDer Sam Neo 2 Pro von SVAKOM ist ein vollautomatischer, interaktiver Masturbator, der für ein besonders realistisches und intensives Erlebnis entwickelt wurde. Er kombiniert Vibration mit einer kontrahierenden Saugfunktion sowie der Extended O' Funktion. Eine integrierte Wärmefunktion bringt das Innere auf angenehme Betriebs- und Körpertemperatur, sodass sich das Erlebnis besonders lebensecht anfühlt. Im Inneren des kompakten, stylischen Gehäuses befindet sich eine genoppt-gerillte Innenstruktur aus TPE, die für zusätzliche Stimulation sorgt.Dank App-Steuerung kannst Du den Sam Neo 2 Pro ganz bequem und individuell bedienen, ohne selbst aktiv werden zu müssen. Die verschiedenen Funktionen lassen sich passgenau auf Deine Vorlieben abstimmen, während der leise Betrieb diskrete Nutzung ermöglicht. Das handliche Format liegt gut in der Hand und ist einfach zu bedienen. Über den USB-Anschluss wird der Masturbator wiederaufgeladen, sodass er kabellos und flexibel einsetzbar ist.Details Material: TPE, ABS Farbe: blau USB wiederaufladbar App-Steuerung verfügbar",
    "source_url": "https://ohmyfantasy.com/products/svakom-sam-neo-2-pro-masturbator",
    "source_name": "ohmyfantasy",
    "expected": "reject"
  },
  {
    "name": "public-product-04",
    "title": "Hot - Volume Sperma & - Nahrungsergänzungsmittel für Männer",
    "text": "Highlights Nahrungsergänzungsmittel speziell für den Mann Flüssige Formulierung Praktische 30 ml Flasche Einfache Einnahme im Alltag ProduktbeschreibungDieses Nahrungsergänzungsmittel wurde speziell für den Mann entwickelt. Die flüssige Formulierung lässt sich unkompliziert in den Alltag integrieren und ergänzt eine ausgewogene Ernährung als zusätzliche Nährstoffquelle.Die flüssige Konsistenz sorgt für eine einfache Dosierung und angenehme Einnahme. Durch die kompakte 30 ml Flasche ist das Produkt handlich und lässt sich bequem aufbewahren. Bitte beachte, dass Nahrungsergänzungsmittel eine ausgewogene und abwechslungsreiche Ernährung nicht ersetzen sollen.Details Inhalt: 30 ml Nahrungsergänzungsmittel für den Mann Flüssige Formulierung Kein Ersatz für ausgewogene Ernährung",
    "source_url": "https://ohmyfantasy.com/products/hot-volume-sperma-steigerung-des-samenvolumens",
    "source_name": "ohmyfantasy",
    "expected": "reject"
  },
  {
    "name": "public-product-05",
    "title": "Xpower - Delay-Whipes - Verzögerungsgel",
    "text": "Highlights Essbar Praktische Tücher in Reisegröße, einzeln verpackt Mit Pfefferminze, Hafer und Johanniskraut Zur Anwendung vor dem Geschlechtsverkehr Sicher mit Kondomen verwendbar ProduktbeschreibungDie Delay Wipes sind ein praktisches Feuchttuch-Format des bekannten Delay Gels und wurden speziell zur Anwendung vor dem Geschlechtsverkehr entwickelt. Die Formulierung basiert auf natürlichen Inhaltsstoffen wie Pfefferminze, Hafer und Johanniskraut.Die Anwendung der Tücher ist denkbar einfach: Reibe das Tuch vor dem Geschlechtsverkehr über deinen Penis. Vor der ersten Anwendung solltest du die Hautverträglichkeit testen, indem du eine kleine Menge auf deinen Unterarm aufträgst. Bei einer allergischen Reaktion solltest du die Anwendung sofort beenden. Die Tücher sind essbar und lassen sich problemlos mit Kondomen kombinieren, wodurch sie unkompliziert in den Geschlechtsverkehr integriert werden können. Lagere die Tücher kühl und trocken und bewahre sie außerhalb der Reichweite von Kindern auf.Details Nur zur einmaligen Verwendung bestimmt Netto-Volumen: 6 Stück à 2,5 ml Enthält Pfefferminze, Hafer und Johanniskraut Praktische Verpackung in Reisegröße",
    "source_url": "https://ohmyfantasy.com/products/xpower-delay-whipes-gel-zur-orgasmusverzogerung",
    "source_name": "ohmyfantasy",
    "expected": "reject"
  },
  {
    "name": "public-product-06",
    "title": "Control - Wild Nature 3-in-1 - Natürliches Massagegel",
    "text": "Highlights 3-in-1 Gel für Massage und sinnliche Momente 99,4 % Inhaltsstoffe natürlichen Ursprungs Feuchtigkeitsspendende Formel für sinnliche Momente Kondomgeeignet und vielseitig einsetzbar ProduktbeschreibungWild Nature 3-in-1 ist ein feuchtigkeitsspendendes Massagegel mit einem besonders hohen Anteil an Inhaltsstoffen natürlichen Ursprungs. Die Formel verbindet drei Funktionen in einem Produkt und eignet sich damit ideal für sinnliche Massagen und stimulierende Momente zu zweit.Die leichte, feuchtigkeitsspendende Textur lässt sich angenehm auf der Haut verteilen und hinterlässt ein sanftes Hautgefühl. Du kannst das Gel unkompliziert dosieren und vielseitig einsetzen. Das Massagegel kann zudem in Kombination mit Kondomen verwendet werden.Details Funktion: Massagegel, 3-in-1 Eigenschaft: feuchtigkeitsspendend Inhaltsstoffe: 99,4 % natürlichen Ursprungs Kompatibilität: kondomgeeignet Inhalt: 200 ml",
    "source_url": "https://ohmyfantasy.com/products/control-wild-nature-3-in-1-naturliches-massagegel",
    "source_name": "ohmyfantasy",
    "expected": "reject"
  },
  {
    "name": "public-product-07",
    "title": "Rocks-off - Bamboo - Lipstick-Vibrator",
    "text": "Highlights 10 Vibrationsstufen für intensives Vergnügen Wasserfest – ideal für Dusche und Spa Elegantes, diskretes Design mit seidiger Oberfläche Präzisionsdesign für gezielte Stimulation Inklusive 1 AAA-Batterie ProduktbeschreibungDer Bamboo Lipstick-Vibrator von Rocks-Off überzeugt durch ein diskretes und elegantes Design mit einem Hauch von Klasse. Die seidig-glatte, flache Oberfläche sorgt für einen besonders sinnlichen Hautkontakt und macht den Vibrator zu einem stilvollen Begleiter für intime Momente. Das durchdachte Präzisionsdesign wurde speziell entwickelt, um gezielte Stimulation zu ermöglichen.Mit 10 unterschiedlichen Vibrationsstufen kannst Du die Intensität ganz nach Deinen Wünschen anpassen und individuell dosieren. Der Bamboo Lipstick-Vibrator ist wasserbeständig und lässt sich daher problemlos unter der Dusche oder in der Badewanne verwenden. Die flache, seidige Oberfläche liegt angenehm in der Hand und ermöglicht eine präzise, komfortable Anwendung.Details 10 Vibrationsstufen Wasserbeständig, geeignet für Dusche und Spa Elegante, schlanke Linienführung Benötigt 1 AAA-Batterie (im Lieferumfang enthalten) Marke: Rocks-Off",
    "source_url": "https://ohmyfantasy.com/products/rocks-off-bamboo-lipstick-vibrator",
    "source_name": "ohmyfantasy",
    "expected": "reject"
  },
  {
    "name": "public-product-08",
    "title": "Ruf - Aphrodict - Guarana Tropfen",
    "text": "Highlights Nahrungsergänzungsmittel mit Guarana-Extrakt und Süßungsmitteln Enthält Koffein Für die Anwendung im Rahmen einer ausgewogenen Ernährung Praktische Tropfenform zum Mischen in Getränke Empfohlene Tagesdosis beachten ProduktbeschreibungDie Aphrodict Guarana Tropfen sind ein Nahrungsergänzungsmittel auf Basis von Guarana-Extrakt, ergänzt durch Süßungsmittel. Guarana ist bekannt für seinen natürlichen Koffeingehalt. Die flüssige Formulierung lässt sich unkompliziert in den Alltag integrieren und eignet sich für alle, die auf der Suche nach einer natürlichen Ergänzung ihrer Ernährung sind.Die Tropfen weisen eine leicht dosierbare, flüssige Konsistenz auf und lassen sich problemlos in ein beliebiges Getränk einrühren. Es wird empfohlen, dreimal täglich einen Esslöffel (3 ml) einzunehmen. Du solltest die angegebene Tagesdosis nicht überschreiten. Das Produkt ist nicht für Kinder sowie schwangere oder stillende Frauen geeignet und sollte im Rahmen einer abwechslungsreichen und ausgewogenen Ernährung verwendet werden.Details Darreichungsform: Tropfen Inhalt: 3 ml pro Anwendungseinheit (Behältergröße 100 ml) Enthält Guarana-Extrakt, Süßungsmittel und Koffein Anwendungshinweis: dreimal täglich 1 Esslöffel (3 ml) in ein Getränk mischen",
    "source_url": "https://ohmyfantasy.com/products/ruf-aphrodict-guarana-stimuliernde-tropfen",
    "source_name": "ohmyfantasy",
    "expected": "reject"
  },
  {
    "name": "public-product-09",
    "title": "Obsessive - Augenmaske",
    "text": "Highlights Elegante, geheimnisvolle Augenmaske Feine, weiche Guipure-Spitze Satinbänder zum Binden Individuell an jede Kopfgröße anpassbar ProduktbeschreibungDiese Augenmaske von Obsessive ist ein geheimnisvolles Accessoire für besondere Momente. Sie besteht aus feiner, weicher Guipure-Spitze in Schwarz, die einen eleganten und zugleich verführerischen Look erzeugt. Die kunstvolle Spitzenoptik verleiht der Maske einen edlen Charakter und macht sie zu einem stilvollen Blickfang.Dank der seidigen Satinbänder lässt sich die Augenmaske ganz einfach binden und optimal an jede Kopfgröße anpassen. So sitzt sie angenehm und sicher, ohne zu drücken. Die weiche Spitze liegt sanft auf der Haut auf und sorgt für ein komfortables Trageerlebnis.Details Material: 100% Polyester Feine Guipure-Spitze Satinbänder zum Binden Passend für jede Kopfgröße",
    "source_url": "https://ohmyfantasy.com/products/obsessive-augenmaske",
    "source_name": "ohmyfantasy",
    "expected": "reject"
  },
  {
    "name": "public-product-10",
    "title": "Pretty Love - Berger - Vibrations-Ei mit Fernbedienung",
    "text": "Highlights Kabellose Fernbedienung für gemeinsame Kontrolle 12 Vibrationsmodi für abwechslungsreiche Stimulation Kompakte, ergonomische Form für diskrete Anwendung Weiches Silikon für angenehmes Tragegefühl Vielseitig einsetzbar für Solo- oder Paarmomente ProduktbeschreibungDieses Vibrations-Ei sorgt für intensive und diskrete Stimulation und eignet sich ideal für Solo- oder Paarerlebnisse. Gefertigt aus weichem, körperfreundlichem Silikon bietet es eine angenehme Oberfläche und hohen Tragekomfort. Mit zwölf verschiedenen Vibrationsmodi stehen dir abwechslungsreiche Intensitäten und Rhythmen zur Verfügung, die du individuell anpassen kannst. Durch das diskrete Design und den leisen Motor eignet sich das Spielzeug sowohl für private Momente zu Hause als auch für aufregende Situationen unterwegs.Die kompakte, ergonomische Form passt sich angenehm dem Körper an und ermöglicht komfortables Tragen während der Anwendung. Über die kabellose Fernbedienung steuerst du die Einstellungen bequem aus der Distanz - perfekt, um die Kontrolle an einen Partner zu übergeben und das Erlebnis noch spannender zu gestalten. Die Fernbedienung wird mit Batterien betrieben, während das Vibrations-Ei selbst über USB wiederaufladbar ist, sodass du es jederzeit einsatzbereit hast.Details Vibrations-Ei mit kabelloser Fernbedienung 12 Vibrationsfunktionen Kompakte und ergonomische Form Batteriebetriebene Fernbedienung Wiederaufladbare Einheit (USB) Oberfläche aus weichem Silikon",
    "source_url": "https://ohmyfantasy.com/products/pretty-love-berger-vibrations-ei-mit-fernbedienung",
    "source_name": "ohmyfantasy",
    "expected": "reject"
  },
  {
    "name": "public-product-11",
    "title": "Rebel - Hodenvibrator mit Fernbedienung",
    "text": "Highlights Hodenvibrator mit Fernbedienung Dehnbarer Penis- und Hodenring 10 Vibrationsmodi Fernbedienung mit 8 m Reichweite Wiederaufladbar inkl. USB-Ladekabel ProduktbeschreibungDer Hodenvibrator mit Fernbedienung von Rebel ist ein kombinierter Penis- und Hodenring, der gezielt das hintere Skrotum mit tiefen Vibrationen stimuliert. Er eignet sich als zusätzlicher Reiz beim Solo- oder Partnerspiel und sorgt für abwechslungsreiche Empfindungen. Gefertigt aus seidig softem Silikon, überzeugt der Artikel durch eine angenehme Haptik und hochwertige Verarbeitung.Ein leiser, aber kraftvoller Motor liefert Dir 10 unterschiedliche Vibrationsmodi, die Du bequem über die Fernbedienung mit einer Reichweite von bis zu 8 Metern steuern kannst. Alternativ lassen sich die Modi auch direkt am Toy per Knopfdruck einstellen. Die hohe Dehnbarkeit und Flexibilität der Ringe sorgt für eine optimale Passform und einen sicheren, festen Sitz, der auch bei intensiver Nutzung nicht verrutscht. Dank des weichen Silikonmaterials lässt sich der Ring leicht überstreifen und bietet einen hohen Tragekomfort. Toy und Fernbedienung sind wiederaufladbar und werden inklusive USB-Ladekabel geliefert.Details Gesamtlänge 9,4 cm Penisring-Durchmesser 3,4 cm (dehnbar) Hodenring-Durchmesser 4,6 cm (dehnbar) Gewicht 80 g Material: Silikon, PU, ABS",
    "source_url": "https://ohmyfantasy.com/products/rebel-hodenvibrator-mit-fernbedienung",
    "source_name": "ohmyfantasy",
    "expected": "reject"
  },
  {
    "name": "public-product-12",
    "title": "Autostraddle Print Issue #03",
    "text": "** Add AF+ ALL-ACCESS Quarterly Membership to cart, and you'll pay $0 for the magazine ** For over a decade, you’ve read us online. Now you can hold us in your hands. This is The Autostraddle Insider, our first printed magazine full of queer essays, reported features, photography, horoscopes, puzzles, and more. You can own a piece of physical queer media that builds on a long legacy of LGBTQ+ zines. The Autostraddle Insider is a full-color zine that’s made by and for the community, full of the hottest queer and trans stories of today. *all Magazines are FINAL SALE and not eligible for return.",
    "source_url": "https://forthem.com/products/autostraddle-print-issue-03",
    "source_name": "autostraddle",
    "expected": "approve"
  },
  {
    "name": "public-product-13",
    "title": "Very Gay Sticker Pack - On Screen",
    "text": "Very Gay Stickers for those who nerd out on queer film and tv... and are very very gay.",
    "source_url": "https://forthem.com/products/very-gay-sticker-pack-on-screen",
    "source_name": "autostraddle",
    "expected": "approve"
  },
  {
    "name": "public-product-14",
    "title": "Classified ad",
    "text": "Advertise your small business, service or queer side-thing in the Autostraddle Insider: Submit your classified here",
    "source_url": "https://forthem.com/products/classified-ad",
    "source_name": "autostraddle",
    "expected": "reject"
  },
  {
    "name": "public-product-15",
    "title": "AF Media",
    "text": "Support Queer, Lesbian and Trans-Led Media and get the only ad-free Autostraddle reading experience - plus access to exclusive AF+ Member content.",
    "source_url": "https://forthem.com/products/af-media-toki",
    "source_name": "autostraddle",
    "expected": "approve"
  },
  {
    "name": "public-product-16",
    "title": "AF+",
    "text": "Your all access pass to AF+, the membership that supports queer media and innovation. AF+ members get the only ad-free Autostraddle reading experience, deep For Them product discounts, exclusive member content + invites to member events.",
    "source_url": "https://forthem.com/products/af-plus-toki",
    "source_name": "autostraddle",
    "expected": "approve"
  },
  {
    "name": "public-product-17",
    "title": "Support",
    "text": "Your all access pass to AF+, the membership that supports queer media and innovation. AF+ members get the only ad-free Autostraddle reading experience in the app, deep For Them product discounts, exclusive member content + invites to member events. Queer AF Dykey AF Trans AF",
    "source_url": "https://forthem.com/products/support-the-community",
    "source_name": "autostraddle",
    "expected": "approve"
  },
  {
    "name": "public-product-18",
    "title": "Autostraddle Print Issue #00",
    "text": "** Add AF+ ALL-ACCESS Quarterly Membership to cart, and you'll pay $0 for the magazine ** For over a decade, you’ve read us online. Now you can hold us in your hands. This is The Autostraddle Insider, our first printed magazine full of queer essays, reported features, photography, horoscopes, puzzles, and more. You can own a piece of physical queer media that builds on a long legacy of LGBTQ+ zines. The Autostraddle Insider is a full-color magazine that’s made by and for the community, full of the best queer and trans stories of today. *all Magazines are FINAL SALE and not eligible for return.",
    "source_url": "https://forthem.com/products/autostraddle-insider",
    "source_name": "autostraddle",
    "expected": "approve"
  },
  {
    "name": "public-product-19",
    "title": "Very Gay Sticker Pack",
    "text": "Stickers! And they're gay! Enjoy an assortment of silly (but seriously fun) stickers designed by members of our team from all walks of queer life. Stick 'em on your water bottle, laptop, a dive bar mirror, or anywhere else you want people to know you're gay.",
    "source_url": "https://forthem.com/products/sticker-pack",
    "source_name": "autostraddle",
    "expected": "approve"
  }
] as const

export const PUBLIC_PRODUCT_FIXTURES = Object.fromEntries(records.map(record => [record.name, {
  request: buildProductRelevanceRequest({ title: record.title, text: record.text }), expected: record.expected,
  source_url: record.source_url, source_name: record.source_name,
}]))
