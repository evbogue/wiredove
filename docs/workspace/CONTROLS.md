# Wiredove shared styles and buttons

Use [Wiredove's existing theme](../../style.css) as the color source
for both views. The [application stylesheet](../../client/application.css)
already imports it into the application shadow root. Keep control variants
and state styles in the shared theme. Limit view-specific CSS to layout and
content needs such as diff overflow or feed width.

| Role | Existing Wiredove source |
|---|---|
| Page, panels and text | `--wiredove-page`, `--wiredove-surface`, `--wiredove-text`, `--wiredove-muted` |
| Borders and corners | `--wiredove-border`, `--wiredove-control-border`, `--wiredove-radius` |
| Neutral commands | `--wiredove-control` and `--wiredove-control-hover` |
| Primary action | Existing `.primary-action` purple, `#6552d9` |
| Keyboard focus | Existing Wiredove focus outline, `#796afd` |

Use the existing light and dark theme values. Check text and focus contrast
on both backgrounds before applying a style to a new control.

| Pattern | Use |
|---|---|
| Primary button | One leading action per task area where needed. Use a verb such as **Publish revision**. Preserve the existing Social composer controls on migration. |
| Neutral button | Commands such as **Copy clone URL**, **Refresh**, or **Cancel**. Place related controls together and wrap the group at narrow widths. |
| Navigation link | Social, Workspace, repositories, branches, and permalinks. A branch picker uses a native select when it fits. |
| Icon button | Familiar compact actions such as refresh or close. Give each an accessible name and a visible focus outline. Use a text label when the action would be ambiguous. |
| Overflow | Infrequent actions belonging to the current item. Use text labels inside the menu. Reserve confirmation for destructive actions. |

Use native buttons for commands. Keep hover, focus, pressed, pending, and
disabled states visually stable. Size new mobile action targets at least
44 CSS pixels where practical. Show waiting and retry feedback beside the
action and announce results through a status region. A failed request should
leave existing content and any unsent input available.

[Layout and framework](LAYOUT.md) · [Sync and ownership](SYNC.md)
