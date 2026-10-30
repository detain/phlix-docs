---
layout: home

hero:
  name: "Phlix"
  text: "Media server for everyone"
  tagline: "Stream your movies, TV shows, music, photos, and more — self-hosted on your own hardware."
  actions:
    - theme: brand
      text: Install Phlix
      link: /install/linux
    - theme: alt
      text: Get Started
      link: /first-run
    - theme: alt
      text: Developer Docs
      link: /dev/architecture-server
    - theme: alt
      text: Plain-English Glossary
      link: /glossary

features:
  - icon: 🐧
    title: Install
    details: "Linux, Docker, Windows, macOS, and Kubernetes installation guides"
    link: /install/linux
    linkText: View install guides

  - icon: 📚
    title: Libraries
    details: "Organize and browse your movies, TV shows, music, photos, books, and audiobooks"
    link: /libraries/overview
    linkText: Library docs

  - icon: 📱
    title: Clients
    details: "Native apps for Samsung Tizen, Roku, Windows, iOS, Android, and web browser"
    link: /clients/overview
    linkText: View clients

  - icon: 🔧
    title: Advanced
    details: "Hardware transcoding, Live TV/DVR, reverse proxy, backup & restore, and ARR integration"
    link: /advanced/hardware-transcoding
    linkText: Advanced guides

  - icon: ⚛️
    title: Developers
    details: "Server & hub architecture, plugin SDK, pairing protocol, event reference, and test harness"
    link: /dev/architecture-server
    linkText: Developer docs

  - icon: 🌐
    title: Hub Admin
    details: "Deploy and manage a Phlix Hub — relay tuning, abuse handling, data-handling guidance, and federation policy"
    link: /hub-admin/overview
    linkText: Hub admin docs
---

## What these docs cover

These pages describe the **current** Phlix estate: `phlix-server` (the media
server), `phlix-hub` (the optional hub and relay service), the `phlix-ui` web
portal, and the shared contract packages (`phlix-shared`, `@phlix/contracts`).
The estate moves continuously, so the docs carry their own currency markers:
feature pages open with a **Since:** stamp, and every page shows a
**Last updated** date drawn from the source file's git history. If a page's
stamp predates a feature you're looking for in the project changelogs
([phlix-server](https://github.com/detain/phlix-server),
[phlix-hub](https://github.com/detain/phlix-hub)), trust the changelog and
[nudge us](https://github.com/detain/phlix-docs/issues) — or read
[Contributing](/dev/contributing) and fix it yourself.
