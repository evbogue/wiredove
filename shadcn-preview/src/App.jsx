import { birdPaths } from '../../client/ui/wiredove-bird.js'
import { lazy, Suspense, useEffect, useState } from 'react'
import { ArrowLeft, createLucideIcon, FolderGit2, MessagesSquare, PanelsTopLeft, Radio, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { Switch } from '@/components/ui/switch'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Feed } from './Feed'
import { socialTarget } from './messages'
import { useHash, usePreference } from './hooks/use-preview-state'
import { readPublicIdentity } from './social'
import { Profile } from './Profile'
import { Repository } from './Workspace'

const Peers = lazy(() => import('./Peers'))

const Bird = createLucideIcon('Bird', birdPaths.map(d => ['path', { d, key: d }]))

function WorkspaceSidebar({ repository, profile }) {
  const { setOpenMobile } = useSidebar()
  const closeDrawer = () => setOpenMobile(false)
  return (
    <Sidebar side="left" className="top-12 h-[calc(100svh-3rem)]">
      <SidebarHeader className="flex-row items-center justify-between">
        <h2 className="px-2 py-1 text-sm font-semibold">Workspace</h2>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Close Workspace navigation" onClick={closeDrawer}><X /></Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton asChild isActive={!repository}><a href="#feed" onClick={closeDrawer}><MessagesSquare /> Feed</a></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton asChild isActive={repository}><a href="#workspace/" onClick={closeDrawer}><FolderGit2 /> Repository</a></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem><Profile {...profile} inSidebar onNavigate={closeDrawer} /></SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

export default function App() {
  const hash = useHash()
  const [mode, setMode] = usePreference('view', hash.startsWith('workspace/') ? 'workspace' : 'social')
  const [name, setName] = usePreference('name', '')
  const [theme, setTheme] = usePreference('theme', 'light')
  const repository = hash.startsWith('workspace/')
  const peers = hash === 'peers'
  const workspace = mode === 'workspace'
  const [identity, setIdentity] = useState(undefined)
  const [identityError, setIdentityError] = useState(false)
  useEffect(() => {
    let active = true
    readPublicIdentity().then(key => { if (active) setIdentity(key || null) })
      .catch(() => { if (active) setIdentityError(true) })
    return () => { active = false }
  }, [])
  const profile = { name, setName, theme, setTheme, identity, identityError, setIdentity }
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark') }, [theme])

  return (
    <TooltipProvider>
      <SidebarProvider className="flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center justify-between gap-2 border-b bg-sidebar px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button asChild variant="ghost" size="icon" className="size-10">
              <a href="#feed" aria-label="Home" title="Home"><Bird aria-hidden="true" /></a>
            </Button>
            {(socialTarget(hash) || peers) && (
              <Button asChild variant="ghost" size="icon" className="size-10">
                <a href="#feed" aria-label="Back to feed" title="Back to feed"><ArrowLeft aria-hidden="true" /></a>
              </Button>
            )}
            {workspace && <SidebarTrigger className="size-10 md:hidden" aria-label="Open Workspace navigation" />}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex shrink-0 items-center gap-1.5" title="Workspace view">
              <Label htmlFor="workspace-view" className="cursor-pointer">
                <PanelsTopLeft aria-hidden="true" className="size-4" />
                <span className="sr-only">Workspace</span>
              </Label>
              <Switch id="workspace-view" checked={workspace} onCheckedChange={checked => setMode(checked ? 'workspace' : 'social')} />
            </div>
            <Button asChild variant="ghost" size="icon" className="size-10">
              <a href="#peers" aria-label="Peers" aria-current={peers ? 'page' : undefined} title="Peers"><Radio aria-hidden="true" /></a>
            </Button>
            <div className="flex w-10 shrink-0 justify-end sm:w-28">
              {!workspace && <Profile {...profile} />}
            </div>
          </div>
        </header>
        <div className="flex min-h-[calc(100svh-3rem)] w-full">
          {workspace && <WorkspaceSidebar repository={repository} profile={profile} />}
          <SidebarInset className="min-w-0">
            <section aria-label="Social feed" hidden={repository || peers} className="mx-auto w-full min-w-0 max-w-2xl p-4 sm:p-6">
              <Feed active={!repository && !peers} hash={hash} name={name} identity={identity} onIdentityChange={setIdentity} />
            </section>
            {peers && (
              <section className="mx-auto w-full min-w-0 max-w-2xl p-4 sm:p-6">
                <Suspense fallback={<p role="status">Loading peers…</p>}><Peers /></Suspense>
              </section>
            )}
            {repository && (
              <section aria-label="Repository" className="mx-auto w-full min-w-0 max-w-5xl space-y-4 p-4 sm:p-6">
                {!workspace && <Button asChild variant="outline" size="sm"><a href="#feed"><MessagesSquare /> Feed</a></Button>}
                <Repository hash={hash} />
              </section>
            )}
          </SidebarInset>
        </div>
      </SidebarProvider>
      <Toaster theme={theme} position="bottom-center" visibleToasts={1} duration={4000} />
    </TooltipProvider>
  )
}
