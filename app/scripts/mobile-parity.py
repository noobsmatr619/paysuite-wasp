#!/usr/bin/env python3
"""
Mobile parity between the Flutter PaySuite app and the Wasp mobile API.

The Flutter app declares every endpoint it can reach in util/app_constants.dart.
Some of those constants are declared but never called from a repository, a
controller, or a screen — dead in the Flutter app itself. This script separates
the two, because "the Wasp API does not serve X" only matters when the Flutter
app actually asks for X.

    python3 scripts/mobile-parity.py
"""
import os
import re
import subprocess
import sys

FLUTTER = "../../paysuite/main/PaySuite/lib"
API = "src/paysuite/mobile/api.ts"

# Flutter URI -> the path the Wasp mobile API answers on. Every alias was
# checked by reading both sides.
ALIAS = {
    "customer-details/": "customers/",
    "customer/invoice-details/": "customers//invoices",
    "customer/estimate-details/": "customers//estimates",
    "customer/transaction-details/": "customers//transactions",
    "estimate-download/": "estimates//document",
    "estimate-invoice-convert/": "estimates//convert",
    "estimate-resend-mail/": "estimates//resend-mail",
    "invoice-download/": "invoices//document",
    "invoice-due-payment/": "invoices//pay",
    "invoice-customer-due-payment/": "invoices//pay",
    "invoice-clone/": "invoices//clone",
    "ticket-comment": "tickets//comments",
    "ticket-details": "tickets/",
    "ticket-rating/": "tickets//rating",
    "invoice-details/": "invoices/",
    "estimate-details/": "estimates/",
    "transaction-details/": "customers//transactions",
    "read-notifications/": "notifications//read",
    "tickets/change-status/": "tickets//status",
    "customer/change-status/": "customers/",
}

# Routes the Wasp API intentionally does not serve, with the reason.
KNOWN_ABSENT = {
    "customer-resend-portal-access/": "no matching Laravel route exists either",
    # The Flutter repository declares getTutorialData(), but the Laravel backend
    # has no tutorials route, controller, model or migration — the constant
    # points at an endpoint that never existed. Serving one would be inventing a
    # feature the original does not have, not converting it.
    "tutorials": "no Laravel route, controller or model exists for it",
}


def flutter_uris() -> dict[str, str]:
    """constant name -> URI path, from app_constants.dart."""
    text = open(f"{FLUTTER}/util/app_constants.dart", errors="ignore").read()
    out = {}
    for m in re.finditer(
        r"static const String (\w+)\s*=\s*\n?\s*'([^']+)'", text
    ):
        name, uri = m.group(1), m.group(2)
        # Base/domain URLs are configuration, not endpoints.
        if "/" not in uri or uri.startswith("http"):
            continue
        out[name] = uri.replace("$VERSION/", "").replace("/tenant/", "").lstrip("/")
    return out


def is_called(constant: str) -> bool:
    """True when something outside app_constants.dart references the constant."""
    hits = subprocess.run(
        ["grep", "-rn", "--include=*.dart", constant, FLUTTER],
        capture_output=True,
        text=True,
    ).stdout
    return any("app_constants.dart" not in line for line in hits.splitlines() if line)


def api_paths() -> set[str]:
    text = open(API, errors="ignore").read()
    paths = set(re.findall(r'path (?:===|\.startsWith\()\s*"([^"]+)"', text))
    # Regex-matched routes: /^tickets\/[^/]+\/rating$/ -> tickets//rating
    for pattern in re.findall(r"path\.match\(/\^([^)]+)\$/\)", text):
        paths.add(pattern.replace("\\/", "/").replace("[^/]+", "").rstrip("$"))
    return {p.rstrip("/") if p.endswith("/") and "//" not in p else p for p in paths}


def main() -> int:
    os.chdir(os.path.dirname(os.path.abspath(__file__)) + "/..")
    uris = flutter_uris()
    served = api_paths()

    live, dead, missing = [], [], []
    for name, uri in sorted(uris.items()):
        target = ALIAS.get(uri, uri).rstrip("/")
        if not is_called(name):
            dead.append(uri)
            continue
        live.append(uri)
        if target in served or target + "/" in served:
            continue
        if uri in KNOWN_ABSENT:
            continue
        missing.append(f"{uri}  (constant {name})")

    print(f"Flutter URI constants:      {len(uris)}")
    print(f"  reached from Flutter UI:  {len(live)}")
    print(f"  declared but never used:  {len(dead)}")
    print(f"Served by the Wasp API:     {len(live) - len(missing) - len(KNOWN_ABSENT)}")
    print(f"Absent by design:           {len(KNOWN_ABSENT)}")
    print(f"Missing:                    {len(missing)}")
    for uri, why in KNOWN_ABSENT.items():
        print(f"  ABSENT   {uri} — {why}")
    for m in missing:
        print(f"  MISSING  {m}")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
