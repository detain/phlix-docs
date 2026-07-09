/**
 * VitePress site configuration.
 *
 * @copyright 2026 Joe Huss <detain@interserver.net>
 */

import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Phlix',
  description: 'Phlix Media Server documentation — end-user, developer, and hub-admin guides',
  base: '/phlix-docs/',
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><text y=%2224%22 font-size=%2224%22>📺</text></svg>' }]],
  themeConfig: {
    nav: [
      { text: 'Install', link: '/install/linux' },
      { text: 'FAQ', link: '/faq' },
      { text: 'Get Started', link: '/first-run' },
      { text: 'Libraries', link: '/libraries/overview' },
      { text: 'Clients', link: '/clients/overview' },
      { text: 'Advanced', link: '/advanced/hardware-transcoding' },
      { text: 'Developers', link: '/dev/architecture-server' },
      { text: 'Integrations', link: '/integrations/lastfm' },
      { text: 'Security', link: '/security/passkeys' },
      { text: 'Admin', link: '/admin/webhooks' },
      { text: 'Hub Admin', link: '/hub-admin/overview' },
    ],
    sidebar: {
      '/install/': [
        {
          text: 'Installation',
          items: [
            { text: 'Linux', link: '/install/linux' },
            { text: 'Docker', link: '/install/docker' },
            { text: 'Windows', link: '/install/windows' },
            { text: 'macOS', link: '/install/macos' },
            { text: 'Kubernetes', link: '/install/kubernetes' },
            { text: 'Upgrade', link: '/install/upgrade' },
          ]
        }
      ],
      '/first-run': [
        {
          text: 'First Run',
          link: '/first-run'
        }
      ],
      '/faq': [
        {
          text: 'FAQ',
          link: '/faq'
        }
      ],
      '/libraries/': [
        {
          text: 'Libraries',
          items: [
            { text: 'Overview', link: '/libraries/overview' },
            { text: 'Movies', link: '/libraries/movies' },
            { text: 'TV Shows', link: '/libraries/tv-shows' },
            { text: 'Music', link: '/libraries/music' },
            { text: 'Photos', link: '/libraries/photos' },
            { text: 'Books', link: '/libraries/books' },
            { text: 'Audiobooks', link: '/libraries/audiobooks' },
          ]
        }
      ],
      '/clients/': [
        {
          text: 'Clients',
          items: [
            { text: 'Overview', link: '/clients/overview' },
            { text: 'Mobile', link: '/clients/mobile' },
            { text: 'Samsung Tizen', link: '/clients/tizen' },
            { text: 'Roku', link: '/clients/roku' },
            { text: 'Windows App', link: '/clients/windows' },
            { text: 'Web App', link: '/clients/web' },
            { text: 'DLNA / Play To', link: '/clients/dlna' },
            { text: 'Skip Button Integration Brief', link: '/clients/skip-button-integration-brief' },
          ]
        }
      ],
      '/advanced/': [
        {
          text: 'Advanced',
          items: [
            { text: 'Hardware Transcoding', link: '/advanced/hardware-transcoding' },
            { text: 'Live TV & DVR', link: '/advanced/live-tv' },
            { text: 'Remote Access', link: '/advanced/remote-access-without-hub' },
            { text: 'Reverse Proxy', link: '/advanced/reverse-proxy' },
            { text: 'Backup & Restore', link: '/advanced/backup-restore' },
            { text: 'DLNA Server', link: '/advanced/dlna' },
            { text: 'Live TV Comskip', link: '/advanced/live-tv-comskip' },
            { text: 'Trickplay Thumbnails', link: '/advanced/trickplay' },
            { text: 'ARR Integration', link: '/advanced/arr-integration' },
            { text: 'Player Experience', link: '/advanced/player-experience' },
            { text: 'Recommendations & Discovery', link: '/advanced/recommendations' },
            { text: 'Parental & Session Controls', link: '/advanced/parental-controls' },
            { text: 'Music & Audio', link: '/advanced/music-audio' },
            { text: 'SyncPlay', link: '/advanced/syncplay' },
          ]
        }
      ],
      '/privacy-security': [
        {
          text: 'Privacy & Security',
          link: '/privacy-security'
        }
      ],
      '/admin/': [
        {
          text: 'Server Admin',
          items: [
            { text: 'Webhooks', link: '/admin/webhooks' },
            { text: 'Stats', link: '/admin/stats' },
            { text: 'Dashboard', link: '/admin/dashboard' },
            { text: 'Backup', link: '/admin/backup' },
            { text: 'Library Management', link: '/admin/library-management' },
            { text: 'User Management', link: '/admin/user-management' },
            { text: 'Server Settings', link: '/admin/server-settings' },
          ]
        }
      ],
      '/troubleshooting': [
        {
          text: 'Troubleshooting',
          link: '/troubleshooting'
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Environment Variables', link: '/reference/env-vars' },
            { text: 'Config Files', link: '/reference/config-files' },
            { text: 'CLI', link: '/reference/cli' },
            { text: 'API', link: '/reference/api' },
            { text: 'Admin Reference', link: '/reference/admin-reference' },
            { text: 'Skip Button Protocol', link: '/reference/skip-button-protocol' },
            { text: 'WebAuthn / Passkey API', link: '/reference/api/auth-webauthn' },
            { text: 'Hub Media Requests API', link: '/reference/api/hub-media-requests' },
          ]
        }
      ],
      '/dev/': [
        {
          text: 'Architecture',
          items: [
            { text: 'Server Architecture', link: '/dev/architecture-server' },
            { text: 'Hub Architecture', link: '/dev/architecture-hub' },
            { text: 'Pairing Protocol', link: '/dev/pairing-protocol' },
            { text: 'Relay Protocol', link: '/dev/relay-protocol' },
            { text: 'Hub Database Schema', link: '/dev/schema-hub' },
            { text: 'TLS Certificates', link: '/dev/tls-certificates' },
            { text: 'Event Reference', link: '/dev/event-reference' },
          ]
        },
        {
          text: 'Plugin SDK',
          items: [
            { text: 'Plugin SDK', link: '/dev/plugin-sdk' },
            { text: 'Plugin Manifest', link: '/plugins/manifest' },
            { text: 'Install from Catalog', link: '/plugins/install-from-catalog' },
            { text: 'Install from URL', link: '/plugins/install-from-url' },
            { text: 'Managing Plugins (Admin UI)', link: '/plugins/admin-management' },
            { text: 'Plugin Catalog', link: '/plugins/plugin-catalog' },
            { text: 'Trusted Plugin List', link: '/plugins/trusted-plugin-list' },
          ]
        },
        {
          text: 'Developer Guides',
          items: [
            { text: 'Auth Providers', link: '/plugins/auth-providers' },
            { text: 'Plugin Developer Guide', link: '/plugins/developer-guide' },
            { text: 'Arr API Clients', link: '/dev/arr-clients' },
            { text: 'Shared Schemas & Catalogs', link: '/dev/shared-schemas' },
            { text: 'Library Scan Worker', link: '/dev/library-scan-worker' },
          ]
        },
        {
          text: 'Developer Reference',
          items: [
            { text: 'Contributing', link: '/dev/contributing' },
            { text: 'Admin SPA (admin-ui)', link: '/dev/admin-spa' },
            { text: 'Test Harness', link: '/dev/test-harness' },
            { text: 'Debug Recipes', link: '/dev/debug-recipes' },
            { text: 'Release Process', link: '/dev/release-process' },
          ]
        },
        {
          text: 'Client App Build Guides',
          items: [
            { text: 'Mobile (iOS & Android)', link: '/dev/client-mobile' },
            { text: 'Samsung Tizen', link: '/dev/client-tizen' },
            { text: 'Roku', link: '/dev/client-roku' },
            { text: 'Windows', link: '/dev/client-windows' },
          ]
        },
        {
          text: 'Streaming & Providers',
          items: [
            { text: 'Streaming Protocols', link: '/developers/streaming-protocols' },
            { text: 'Stream Quality / ABR', link: '/developers/stream-quality-abr' },
            { text: 'Music Providers', link: '/developers/music-providers' },
            { text: 'IPTV', link: '/developers/iptv' },
            { text: 'HDHomeRun', link: '/developers/hdhomerun' },
            { text: 'DVB-T', link: '/developers/dvbt' },
            { text: 'DVR', link: '/developers/dvr' },
            { text: 'Schedules Direct', link: '/developers/schedules-direct' },
            { text: 'Live Relay', link: '/developers/live-relay' },
            { text: 'Comskip / Live', link: '/developers/comskip-live' },
            { text: 'Chromaprint', link: '/developers/chromaprint' },
            { text: 'Scrobbler Plugins', link: '/developers/scrobbler-plugins' },
            { text: 'Last.fm Plugin', link: '/developers/lastfm-plugin' },
            { text: 'Intro/Outro Detection', link: '/developers/intro-outro-detection' },
            { text: 'Subtitle Processing', link: '/developers/subtitle-processing' },
            { text: 'Theme Media', link: '/developers/theme-media' },
            { text: 'Trailers & Extras', link: '/developers/trailers-and-extras' },
            { text: 'Smart Playlists', link: '/developers/smart-playlists' },
            { text: 'Collections', link: '/developers/collections' },
            { text: 'Discovery', link: '/developers/discovery' },
            { text: 'UI Themes', link: '/developers/ui-themes' },
            { text: 'Hardware Acceleration', link: '/developers/hardware-acceleration' },
          ]
        }
      ],
      '/hub-admin/': [
        {
          text: 'Hub Admin',
          items: [
            { text: 'Overview', link: '/hub-admin/overview' },
            { text: 'Admin Console', link: '/hub-admin/admin-console' },
            { text: 'Install', link: '/hub-admin/install' },
            { text: 'First Boot', link: '/hub-admin/first-boot' },
            { text: 'Capacity Planning', link: '/hub-admin/capacity-planning' },
            { text: 'Relay Tuning', link: '/hub-admin/relay-tuning' },
            { text: 'Abuse Handling', link: '/hub-admin/abuse-handling' },
            { text: 'GDPR & Data Rights', link: '/hub-admin/gdpr-data-rights' },
            { text: 'Monitoring & Alerting', link: '/hub-admin/monitoring-alerting' },
            { text: 'Scaling', link: '/hub-admin/scaling' },
            { text: 'Backup & Restore', link: '/hub-admin/backup-restore' },
            { text: 'Federation Policy', link: '/hub-admin/federation-policy' },
            { text: 'Audit Log', link: '/hub-admin/audit-log' },
            { text: 'Network', link: '/hub-admin/network' },
            { text: 'TLS Certificates', link: '/hub-admin/tls' },
          ]
        }
      ],
      '/hub/': [
        {
          text: 'Hub',
          items: [
            { text: 'What is the Hub', link: '/hub/what-is-the-hub' },
            { text: 'Claim Server', link: '/hub/claim-server' },
            { text: 'Share with Friends', link: '/hub/share-with-friends' },
            { text: 'Remote Access', link: '/hub/remote-access' },
            { text: 'Self-Host the Hub', link: '/hub/self-host-the-hub' },
            { text: 'Media Requests', link: '/hub/requests' },
          ]
        },
        {
          text: 'Relay Internals',
          items: [
            { text: 'Tunnel / TunnelManager', link: '/hub/relay/tunnel' },
            { text: 'Frame Decoder / Encoder', link: '/hub/relay/frame-decoder' },
            { text: 'Idle Reaper', link: '/hub/relay/idle-reaper' },
            { text: 'WS Multiplexer Plan', link: '/hub/relay/ws-multiplexer-plan' },
          ]
        }
      ],
      '/integrations/': [
        {
          text: 'Integrations',
          items: [
            { text: 'Last.fm Scrobbling', link: '/integrations/lastfm' },
            { text: 'Trakt.tv', link: '/integrations/trakt' },
          ]
        }
      ],
      '/security/': [
        {
          text: 'Security',
          items: [
            { text: 'Passkeys', link: '/security/passkeys' },
            { text: 'Signed Media URLs', link: '/security/signed-media-urls' },
            { text: 'Hardening Checklist', link: '/security/hardening' },
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/detain/phlix-docs' }
    ],
    footer: {
      message: 'BSD-3-Clause',
      copyright: 'Copyright 2026 Phlix contributors'
    },
    darkModeSwitch: true,
    search: {
      provider: 'local'
    }
  },
  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    // Shiki doesn't bundle grammars for these fence languages; alias each to
    // the closest bundled grammar so highlighting works and the
    // "language not loaded, falling back to txt" build warnings go away.
    languageAlias: {
      env: 'dotenv',        // dotenv is the real id for .env files
      brightscript: 'vb',   // BrightScript is BASIC-like → Visual Basic grammar
      smarty: 'twig',       // Smarty templates ≈ Twig's {…} delimited syntax
      caddy: 'nginx'        // Caddyfile ≈ nginx-style web-server config directives
    }
  },
  cleanUrls: false,
  ignoreDeadLinks: false
})
