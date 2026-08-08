# Phlix Console Client

**Since:** 0.10.0

> [!TIP]
> The Phlix console client is a full-window terminal (TUI) application for browsing media libraries, viewing poster grids, and playing media — all rendered in your terminal using sixel, kitty, iTerm2, or ANSI half-block graphics.

## Install / Download

- **PHAR download:** [github.com/detain/phlix-console-client/releases](https://github.com/detain/phlix-console-client/releases) — pre-built PHAR for end users
- **Source:** clone the repository and run `composer install`

## Requirements

- **PHP ≥ 8.3** with `ext-gd` (image decode), `pcntl` + `posix` (TTY/raw mode)
- **ffmpeg** + **ffprobe** (video decode + frame grabs)
- **ffplay** or **mpv** (audio playback — music, audiobooks)
- A terminal with **sixel**, **kitty**, or **iTerm2** graphics protocol (half-block is the universal fallback)

## Installation

### PHAR (recommended for end users)

```sh
# Download the latest release PHAR
curl -fsSL https://github.com/detain/phlix-console-client/releases/latest/download/phlix.phar -o phlix.phar

# Make it executable
chmod +x phlix.phar

# Run it (first run will prompt for server URL)
./phlix.phar run

# Or add it to your PATH
sudo mv phlix.phar /usr/local/bin/phlix
phlix run
```

**Verify the download** (recommended):
```sh
# Fetch the checksums file
curl -fsSL https://github.com/detain/phlix-console-client/releases/latest/download/SHA256SUMS.txt

# Verify (on Linux/macOS)
sha256sum phlix.phar
# Compare the output against SHA256SUMS.txt
```

### Composer (developers)

```sh
composer install
bin/phlix run
```

## Configuration

On first run, the client prompts for your Phlix server URL. This is saved to `~/.config/phlix/config.json` (or `$XDG_CONFIG_HOME/phlix/config.json`).

### In-App Server URL

1. Launch the client with `phlix run`
2. On first launch, enter your server address:
   - **Local:** `https://192.168.1.100:8096` (replace with your server's LAN IP)
   - **Hub relay:** `https://hub.phlix.example.com` (after signing in with Hub)
3. The URL is saved automatically. Use the command palette (Ctrl-K or `:`) to change it later.

### Environment Variable (for CI / automated runs)

Set `PHLIX_SERVER_URL` in your environment to override the saved config:

```sh
PHLIX_SERVER_URL=https://your-server:8096 phlix run
```

## Usage

```sh
phlix run                    # Launch the full-window app (needs a real TTY)
phlix doctor                 # Report terminal capabilities and server diagnostics
phlix poster <image> [w] [h] # Render an image at a cell size
phlix frame <video> [n]     # Decode N frames to ANSI
```

## Navigation Keys

| Key | Action |
|-----|--------|
| `↑↓←→` | Navigate through lists and grids |
| `Enter` | Open selected item |
| `/` | Search (or filter, in a grid) |
| `Ctrl-K` / `:` | Open command palette |
| `A`–`Z` | Jump to items by first letter |
| `p` | Play media |
| `C` | Cast to Chromecast/Roku/AirPlay/DLNA |
| `Tab` | Switch focus on the home screen |
| `Esc` | Go back |
| `Ctrl-C` | Quit |

## Command Palette

Press `Ctrl-K` or `:` from anywhere to open the command palette. Actions include:

- Search libraries
- Jump to any library
- Open Settings (theme, slideshow interval)
- View Stats
- Sign out / Quit
- Toggle metrics HUD

## Media Types

The console client supports all Phlix library types:

- **Movies / TV Shows** — poster grid with detail screens
- **Music** — album list → track table; Enter plays through ffplay/mpv
- **Audiobooks** — list → chapter table; Enter plays, `r` resumes, progress saved
- **Books** — cover grid → detail with copyable download URL
- **Photos** — album covers → thumbnail grid → fullscreen with EXIF panel and slideshow

## Render Modes

The `--mode` flag controls how media is rendered:

| Mode | Type | Description |
|------|------|-------------|
| `sixel` | graphics | Sixel protocol (highest fidelity on supported terminals) |
| `kitty` | graphics | Kitty protocol |
| `iterm2` | graphics | iTerm2 inline images |
| `halfblock` (default) | cell | 24-bit colour half-block characters |
| `quarterblock` | cell | Dense colour blocks |
| `ascii` | cell | Monochrome character ramp |
| `ansi256` | cell | 256-colour character ramp |
| `truecolor` | cell | 24-bit colour character ramp |
| `auto` | mixed | Half-block by default; pass `--mode=sixel` for graphics |

```sh
# Force sixel mode
phlix run --mode=sixel

# Render a poster in halfblock mode
phlix poster /path/to/poster.jpg 40 --mode=halfblock
```

## Troubleshooting

### "PHP not found" or version error

Ensure PHP 8.3+ is installed and in your PATH:

```sh
php --version  # Should show 8.3 or higher
```

### Terminal graphics not working

If posters appear as text characters instead of images:

1. Check your terminal supports sixel, kitty, or iTerm2 protocols
2. Try `--mode=halfblock` as a fallback (works in any terminal)
3. Run `phlix doctor` to see what your terminal supports

### Server connection issues

1. Verify the server is running and accessible from your network
2. Check the server URL in `~/.config/phlix/config.json`
3. Run `phlix doctor` to test server reachability
4. If using Hub relay, ensure you're signed in

### Video playback fails

- Ensure ffmpeg and ffprobe are installed: `ffmpeg -version`
- For audio playback, ensure ffplay or mpv is installed

## Next Steps

- [Windows client](./windows) — native desktop app with system tray
- [Samsung Tizen](./tizen) — Smart TV app
- [Mobile](./mobile) — iOS & Android streaming
- [Web](./web) — browser-based access
