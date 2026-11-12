# Appearance and Themes

## TL;DR

Phlix themes change how the web app looks. Three rules explain almost every "my theme did not change" report:

1. **Enabled is not applied.** Enabling a theme plugin makes the theme *available*; it does not switch your account to it.
2. **Picking a theme in Settings → Appearance is instant.** Clicking a card in the gallery applies it immediately. There is no Save button.
3. **Your theme follows your account.** The choice is stored on the server, so it shows up on every device you sign in on.

---

## 1. Enabled vs. applied

Theme plugins (see [Install from the Catalog](../plugins/install-from-catalog.md)) register one or more themes with the server when you enable them. A newly enabled theme appears in the gallery without a server restart, but your active theme stays the same until you choose the new one yourself.

Disabling or removing a theme plugin removes its themes from the gallery. If your account was using a removed theme, pick another one.

## 2. Applying a theme

1. Open **Settings → Appearance**.
2. Click the card for the theme you want.

The new look applies the moment you click. There is no Save or Apply button to press, and nothing to confirm. To switch back, click another card.

::: tip
If a card click appears to do nothing, check that the theme is enabled in the plugin list, then reload the page.
:::

## 3. Themes follow your account

The selected theme is saved to your user settings on the server, not in the browser. That means:

- Signing in on another browser, phone, or TV client shows the same theme.
- Clearing browser data does not reset your theme.
- If you change the theme on two devices, the **last change wins** on every device.

Each user on a server picks their own theme; your choice does not affect other accounts.

## See Also

- [Theme plugins (developer reference)](../developers/ui-themes.md) — how themes are packaged and registered.
- [Install from the Catalog](../plugins/install-from-catalog.md)
