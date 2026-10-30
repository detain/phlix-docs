# Security Policy

This repository is part of the Phlix estate (documentation for Phlix Server,
Phlix Hub, and the Phlix client apps). Vulnerabilities found **in the
documentation itself** (instructions that are actively dangerous, leaked
secrets, wrong security guidance) and vulnerabilities found in the software
the documentation describes should both be reported privately — please do not
open a public issue for an unfixed security problem.

## Reporting a vulnerability

- **Email:** the maintainer, Joe Huss <detain@interserver.net> (the author
  contact carried by every file header in this estate). Include what you
  found, the affected component and version, and steps to reproduce.
- **GitHub:** use *private vulnerability reporting* from the **Security** tab
  of the affected repository (`detain/phlix-server`, `detain/phlix-hub`, a
  `detain/phlix-*-client` repo, or this repo) where the form is offered;
  otherwise use the email above.

For the full policy — scope, what we ask of reporters, and how fixes and
disclosure are coordinated — see the served page:
<https://detain.github.io/phlix-docs/security/vulnerability-disclosure.html>.

## Supported versions

Security guidance applies to the current `master` of each component; releases
documented on the [Upgrading](docs/install/upgrade.md) pages. Older versions
are fixed on a best-effort basis when feasible.
