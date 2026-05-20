import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Phlix',
  description: 'Phlix Media Server documentation — end-user, developer, and hub-admin guides',
  base: '/phlix-docs/',
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><text y=%2224%22 font-size=%2224%22>📺</text></svg>' }]],
  themeConfig: {
    nav: [
      { text: 'Install', link: '/install/linux' },
      { text: 'Get Started', link: '/first-run' },
      { text: 'Libraries', link: '/libraries/overview' },
      { text: 'Clients', link: '/clients/overview' },
      { text: 'Advanced', link: '/advanced/hardware-transcoding' },
      { text: 'Developers', link: '/dev/architecture-server' },
      { text: 'Hub Admin', link: '/hub-admin/install' },
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
          ]
        }
      ],
      '/first-run': [
        {
          text: 'First Run',
          link: '/first-run'
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
            { text: 'ARR Integration', link: '/advanced/arr-integration' },
          ]
        }
      ],
      '/privacy-security': [
        {
          text: 'Privacy & Security',
          link: '/privacy-security'
        }
      ],
      '/troubleshooting': [
        {
          text: 'Troubleshooting',
          link: '/troubleshooting'
        }
      ],
      '/faq': [
        {
          text: 'FAQ',
          link: '/faq'
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
            { text: 'Trusted Plugin List', link: '/plugins/trusted-plugin-list' },
          ]
        },
        {
          text: 'Developer Guides',
          items: [
            { text: 'Auth Providers', link: '/plugins/auth-providers' },
            { text: 'Plugin Developer Guide', link: '/plugins/developer-guide' },
          ]
        },
        {
          text: 'Developer Reference',
          items: [
            { text: 'Test Harness', link: '/dev/test-harness' },
            { text: 'Debug Recipes', link: '/dev/debug-recipes' },
            { text: 'Release Process', link: '/dev/release-process' },
            { text: 'Contributing', link: '/dev/contributing' },
          ]
        },
        {
          text: 'Streaming & Providers',
          items: [
            { text: 'Streaming Protocols', link: '/developers/streaming-protocols' },
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
    }
  },
  cleanUrls: false,
  ignoreDeadLinks: true
})
