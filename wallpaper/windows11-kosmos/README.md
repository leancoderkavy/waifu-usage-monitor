# KOS-MOS Windows 11 design pack

Personal fan-art assets built from the existing `../kosmos-5k.png` wallpaper and the existing Lively artwork. Open [preview.html](preview.html) for the full visual overview. No replacement character art or AI model was needed.

## Ready-to-use files

- `kosmos-lock-5k.png`: 5120 × 2880 lock-screen art with space for the Windows clock.
- `icons/*.ico`: twelve desktop and shortcut icons with embedded 16, 24, 32, 48, 64, 128, and 256 pixel sizes. SVG and PNG masters are alongside them.
- `cursors/*.cur`: eight Windows pointer roles, each with 32 and 64 pixel images and defined hotspots. SVG and PNG masters are alongside them.
- `kosmos-account-portrait.png`: 512 × 512 crop of the exact wallpaper illustration.
- `terminal/kosmos-terminal.json`: a valid Windows Terminal `settings.json` fragment containing the dark UI theme, 16-color scheme, and profile defaults.
- `KOS-MOS.theme`: wallpaper, desktop icons, dark mode, sound scheme reference, accent color request, and cursor mappings for this machine.

## App status assets and concepts

- `live-states/*.svg`: transparent 5K standby, monitoring, and warning overlays designed for the existing Lively scene. They do not read usage data or modify the installed live wallpaper.
- `status/*.png`: five tray marks (standby, working, limit warning, sign-in required, rate-limited) and a notification hero image. The monitor now selects tray marks from real report state in `src/tray-status.ts`; the notification hero remains a design asset because the current desktop notification plugin does not expose a Windows hero-image field.
- `widget/widget-preview.json`: an Adaptive Card content sketch with explicit preview labels. A packaged Windows widget provider and live data binding are required before it becomes an installable widget.

## Apply selectively

1. Double-click `KOS-MOS.theme` to select the static wallpaper, theme icons, and cursor roles. This can replace the visible Lively wallpaper, so skip the theme file if you want the restored live wallpaper to stay visible.
2. Set `kosmos-lock-5k.png` from **Settings → Personalization → Lock screen**.
3. Set `kosmos-account-portrait.png` from **Settings → Accounts → Your info**. Windows may crop the image again for the circular account control.
4. For an individual shortcut, use **Properties → Change Icon** and select one of `icons/*.ico`.
5. For Windows Terminal, open `settings.json` and merge the `themes`, `schemes`, and `profiles.defaults` entries from `terminal/kosmos-terminal.json`; set root `theme` to `KOS-MOS // R-CORE` if desired. Preserve existing profiles and schemes. [Microsoft documents themes](https://learn.microsoft.com/en-us/windows/terminal/customize-settings/themes) and [profile appearance](https://learn.microsoft.com/en-us/windows/terminal/customize-settings/profile-appearance).

On this machine, the Terminal theme, default profile icon, eight cursor roles, lock screen image, and core desktop icon paths were applied on 2026-09-28 without reactivating the static theme. The installed live wallpaper layout was preserved. The previous settings and monitor executable are in the folder named by `last-apply-backup.txt`. The new tray art is compiled into the running monitor. The Documents and Pictures folder icons were also applied to their OneDrive `desktop.ini` files after explicit approval; their prior files are backed up under `folder-icons` in the backup directory. The Downloads, Music, and Videos icons remain staged in `%LOCALAPPDATA%\KOS-MOS\Icons\R-CORE`.

The `.theme` file contains local absolute paths, so keep this folder in this location or edit its paths before using it elsewhere. The eight custom cursors cover Arrow, IBeam, Wait, AppStarting, Crosshair, Hand, No, and SizeAll; Windows uses the default for other roles. [Microsoft documents `.theme` cursor sections](https://learn.microsoft.com/en-us/windows/win32/controls/themesfileformat-overview).

## Rebuild

```powershell
node wallpaper/windows11-kosmos/generate-icons.mjs
node wallpaper/windows11-kosmos/generate-ui-assets.mjs
npm.cmd exec --yes --package=sharp-cli -- sharp -i 'wallpaper/windows11-kosmos/icons/*.svg' -o 'wallpaper/windows11-kosmos/icons' -f png
npm.cmd exec --yes --package=sharp-cli -- sharp -i 'wallpaper/windows11-kosmos/cursors/*.svg' -o 'wallpaper/windows11-kosmos/cursors' -f png
npm.cmd exec --yes --package=sharp-cli -- sharp -i 'wallpaper/windows11-kosmos/status/*.svg' -o 'wallpaper/windows11-kosmos/status' -f png
python wallpaper/windows11-kosmos/pack-windows-assets.py
```

The source `../kosmos-5k.png` must be present for the portrait crop. PNG previews of the live overlays are optional; the SVG files are the full-resolution source.

KOS-MOS and Xenosaga belong to their respective rights holders. This is an unofficial personal fan-art theme.
