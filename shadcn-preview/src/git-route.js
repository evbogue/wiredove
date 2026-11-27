import { parseWorkspaceGitRoute, workspaceGitHref } from '../../client/runtime/workspace-git.js'

// The legacy client namespaces Git links under Workspace. The preview uses
// the same repository addresses independently of the selected layout.
export const gitHref = request => workspaceGitHref(request).replace('#workspace/', '#')
export const parseGitRoute = hash => hash.startsWith('git/') ? parseWorkspaceGitRoute('workspace/' + hash) : null
