# Wiredove shadcn/ui preview

This standalone Vite entry point runs alongside Wiredove's website and embeds. Both views use React components installed from the official shadcn/ui registry with the Radix Nova preset. The components live in `src/components/ui` and are imported directly by the preview.

## Run locally

Start Wiredove from the repository root:

```sh
npm ci
HOST=127.0.0.1 npm start
```

Start the preview from a second terminal in the repository root:

```sh
npm --prefix shadcn-preview ci
npm --prefix shadcn-preview run dev -- --strictPort --port 5173
```

Open http://localhost:5173/. The preview proxies API requests to `http://127.0.0.1:8000`. Set `WIREDOVE_PREVIEW_BACKEND` when starting Vite to use another Wiredove origin.

- **Social** shows up to 50 recent verified plaintext posts from the Wiredove node archive and can publish signed text posts to that archive. The preview uses the same pinned APDS module as Wiredove and creates an identity in a preview-specific browser database on the first publish if you have not set one up. Failed deliveries can be retried from the saved signed outbox.
- **Message cards** offer replies, thread and author views, shareable links, author-owned edits, edit history, and raw signed data. Hide, mute, and block apply to this browser’s preview. These controls are reversible and leave the archive intact. A share link opens the message on a preview connected to an archive that has that record.
- **Workspace** uses the same feed and adds a sidebar and read-only repository browsing. On phones, use the left header button to open the sidebar as a drawer. Start Wiredove with `WORKSPACE_GIT_UPSTREAM` pointing to an ANBot instance with a selected repository to try the file tree and text previews.
- The **Workspace** switch stays at the right edge of the header and changes the layout without navigating away from the current page.
- **Profile** sits at the top right in Social and at the bottom of the Workspace sidebar. Create a signing identity here, view its public key and posts, or download and restore a Wiredove backup file. Import is validated before it replaces the preview identity, and pending signed deliveries must be retried first. Backup files contain a private signing key. Profile also saves a display name and light/dark preference.
- Set `VITE_WIREDOVE_HOSTED=1` when running or building the preview to use the ANBot-backed feed and publishing routes of a Wiredove gateway. Use a disposable local gateway for publishing tests. The origin selected for the preview keeps its own browser storage.

Run `npm --prefix shadcn-preview run build` to bundle the preview and `npm --prefix shadcn-preview run preview` to serve that bundle with the same API proxy. This is a minimal evaluation build. Rich media, full profile management, and advanced Git views remain features of the existing app.
