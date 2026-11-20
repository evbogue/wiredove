# Wiredove Social and Workspace layout

**Design draft · 20 November 2026**

Wiredove provides one application shell with two top-level views. **Social**
keeps the existing feed, profiles, composer, conversations, and permalinks.
**Workspace** brings the human-facing Git and agent activity views from ANBot
into Wiredove. Wave can add its editor and revision-specific views through
Workspace as its publishing workflow takes shape.

| Area | Social | Workspace |
|---|---|---|
| Shared header | Wiredove, Social / Workspace, identity, settings | Same header |
| Navigation | Existing feed and profile navigation | Repositories and agent activity. Add Wave entries as those features ship. |
| Main pane | Existing reading column, conversation, or profile | Repository overview, branch or commit detail, or selected activity |
| Context | Existing reply and post controls | Branch or commit metadata beside the detail when space permits |

Start the shell at the existing Social entry point. Use two route links with a
visible current state and `aria-current="page"`. Deep links, reload, and browser
Back should restore the intended view and item. Preserve the current feed
position and unsent composer draft when users switch. Open discussion from a
Workspace item through the same Wiredove conversation route and renderer.

At wide widths, place Workspace navigation beside the main pane. Use a
collapsible navigation drawer on narrow screens and place secondary detail in
the main flow. Close the drawer on selection or Escape and return focus to the
trigger when dismissed. Let repository paths wrap and confine horizontal
scrolling to code and diffs. Check the mounted width as well as the browser
viewport so the layout also works in embeds.

## Framework decision

Render Git pages in the browser with Wiredove's existing hyperscript helper
(`import { h } from 'h'`), as used by the Social router. Build repository,
tree, file, and commit views as Wiredove route renderers. Use the shared shell,
stylesheet, and native controls. CSS Grid and Flexbox handle layout within
Wiredove's existing mount and cleanup lifecycle.

The route loads structured Git data for the requested ref or commit and passes
it to the renderer. Keep Git object resolution and validation in the Git
capability layer. Treat file contents, commit messages, and paths as text.
Keep existing Git page links working through the migration.

## Acceptance

Check Social home, a profile, a post permalink, a repository, and a commit URL
at desktop and phone widths. Switch views with the keyboard, reload each
deep link, and verify Back, scroll restoration, drawer focus, and draft
preservation. Keep Git pushes open and post editing solo. Wave will define
future collaboration rules.

[Shared styles and controls](CONTROLS.md) · [Sync and ownership](SYNC.md)
