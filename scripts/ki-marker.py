"""
Prueft die Seitentexte auf die Anzeichen, die die deutsche Wikipedia fuer
KI-generierte Inhalte zusammengestellt hat.

    python3 scripts/ki-marker.py           Zusammenfassung je Seite
    python3 scripts/ki-marker.py -v        zusaetzlich jeder Treffer im Satz

Grundlage und Einordnung der einzelnen Punkte:
_quellen/Anzeichen für KI-generierte Inhalte.md

Was die Pruefung bewusst auslaesst:
- <script>, <style> und Kommentare, dort steht kein Besuchertext.
- <blockquote>: Auf den Zitatkarten ist der Gegensatz das vorgesehene
  Gestaltungsmuster und kein Stilfehler.

Ein Treffer ist kein Urteil. Die Liste nennt weiche Anzeichen, und mehrere
davon sind in bestimmten Zusammenhaengen richtig: "statt" zwischen zwei
Werten ist ein Vergleich, "Trotz dieser Grundlagen" in der
Datenschutzerklaerung benennt eine juristische Einschraenkung. Die Ausgabe
ist eine Leseliste, keine Fehlerliste.
"""

import collections
import html
import os
import re
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UEBERGEHEN = ('/node_modules/', '/dist/', '/.git/')

MUSTER = [
    ("Negativer Parallelismus",   r"nicht nur\b[^.!?]{0,120}?\bsondern"),
    ("Antithese nicht/sondern",   r"\bnicht\b[^.!?]{0,80}?,\s*sondern\b"),
    ("Antithese statt",           r"\bstatt\b"),
    ("Mechanische Konjunktion",   r"\b(darüber hinaus|zusätzlich|außerdem|ferner|andererseits|des Weiteren|zudem)\b"),
    ("Zusammenfassungsfloskel",   r"\b(zusammenfassend|abschließend|insgesamt|letztlich|im Endeffekt)\b"),
    ("Fazit-Abschnitt",           r"\bFazit\b"),
    ("Redaktioneller Kommentar",  r"(es ist wichtig|wichtig zu (beachten|bemerken|wissen)|bemerkenswert|sei erwähnt|nicht zu unterschätzen)"),
    ("Schlussfolgerungsfloskel",  r"\b(Trotz (seiner|dieser|all)|steht vor (mehreren )?Herausforderungen|Vermächtnis|Zukunftsaussichten)\b"),
    ("Werbesprache",              r"\b(atemberaubend|beeindruckend|einzigartig|maßgeschneidert|ganzheitlich|innovativ|wegweisend|hochmodern|erstklassig|im Herzen (von|der)|eingebettet|reiche[rsn]? (Geschichte|Erbe|Tradition)|nachhaltige[rn]? Erfolg|echte[rn]? Mehrwert|Full-Service)\b"),
    ("Vage Autoritaet",           r"\b(Branchenberichte|Beobachter|Experten (sagen|betonen|empfehlen)|Studien (zeigen|belegen)|einige Kritiker|man sagt|es gilt als|allgemein anerkannt|bekanntlich)\b"),
    ("Falsche Erweiterung",       r"\bvon\b[^.!?]{0,60}?\bbis (hin )?zu\b"),
    ("Partizip I als Deutung",    r"\b\w{4,}end\b(?=[,.]| und)"),
    ("Zeitgeistfloskel",          r"in der (heutigen|schnelllebigen)"),
    ("Emoji",                     "[\U0001F300-\U0001FAFF☀-➿]"),
]

# Partizipien, die hier als gewoehnliches Wort stehen und nichts deuten.
PARTIZIP_OK = {"spannend", "dringend", "bestehend", "folgend", "entsprechend",
               "während", "wesentlich", "laufend"}

# "statt" ist im Deutschen mehrdeutig. Zwei Verwendungen sind keine Antithese
# und werden ausgesondert, weil sie die Liste sonst unlesbar machen:
# die Verbpartikel ("findet nicht statt", "fand ein Relaunch statt") und der
# nackte Wertvergleich ("424.190 EUR statt 307.096 EUR").
VERBPARTIKEL = re.compile(r"\b(findet|finden|fand|fanden|stattfinden|Relaunch)\b", re.I)
WERTVERGLEICH = re.compile(r"[\d]\s*(€|%|×|x)?\s*$")


def antithese(text, treffer):
    """Traegt dieses "statt" einen Gegensatz, oder ist es Grammatik?"""
    davor = text[max(0, treffer.start() - 60):treffer.start()]
    return not (VERBPARTIKEL.search(davor) or WERTVERGLEICH.search(davor))


def seitentext(pfad):
    """Besuchertext, Rohfassung und Zahl der Zitatkarten."""
    roh = open(pfad, encoding="utf-8").read()
    s = re.sub(r"(?is)<script.*?</script>", " ", roh)
    s = re.sub(r"(?is)<style.*?</style>", " ", s)
    s = re.sub(r"(?is)<!--.*?-->", " ", s)
    zitate = len(re.findall(r"(?is)<blockquote[^>]*>.*?</blockquote>", s))
    s = re.sub(r"(?is)<blockquote[^>]*>.*?</blockquote>", " ", s)
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"[ \t ]+", " ", s), roh, zitate


def seiten():
    for ordner, unterordner, dateien in os.walk(WURZEL):
        # Versteckte Ordner enthalten Werkzeuge, keinen Besuchertext.
        unterordner[:] = [u for u in unterordner if not u.startswith('.')]
        for d in sorted(dateien):
            p = os.path.join(ordner, d)
            if d.endswith(".html") and not any(u in p + "/" for u in UEBERGEHEN):
                yield p


def main():
    ausfuehrlich = "-v" in sys.argv
    summe = collections.Counter()
    zeilen, einzeln = [], collections.defaultdict(list)

    for pfad in sorted(seiten()):
        rel = os.path.relpath(pfad, WURZEL)
        text, roh, zitate = seitentext(pfad)
        je = collections.Counter()
        for name, muster in MUSTER:
            for t in re.finditer(muster, text, re.I):
                wort = t.group(0)
                if name == "Partizip I als Deutung" and wort.lower().rstrip(",.") in PARTIZIP_OK:
                    continue
                if name == "Antithese statt" and not antithese(text, t):
                    continue
                je[name] += 1
                summe[name] += 1
                a, b = max(0, t.start() - 70), min(len(text), t.end() + 70)
                einzeln[name].append((rel, wort, re.sub(r"\s+", " ", text[a:b]).strip()))
        zeilen.append((rel, je, len(re.findall(r"(?i)<strong", roh)), zitate))

    print("=== Je Seite ===")
    print(f"  {'Seite':52s} {'Treffer':>7s} {'strong':>7s} {'Zitate':>7s}")
    for rel, je, strongs, zitate in zeilen:
        print(f"  {rel:52s} {sum(je.values()):7d} {strongs:7d} {zitate:7d}")

    print("\n=== Je Anzeichen ===")
    if not summe:
        print("  keine Treffer")
    for name, zahl in summe.most_common():
        print(f"  {zahl:4d}  {name}")

    if ausfuehrlich:
        for name, _ in MUSTER:
            if name not in einzeln:
                continue
            print(f"\n=== {name} ({len(einzeln[name])}) ===")
            for rel, wort, satz in einzeln[name]:
                print(f"  {rel}: „{wort}“\n      ... {satz} ...")


if __name__ == "__main__":
    main()
