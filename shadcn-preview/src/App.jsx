import { useEffect, useState } from 'react'
import { Bird, FolderGit2, MessagesSquare, UserRound } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, useSidebar } from '@/components/ui/sidebar'
import { Switch } from '@/components/ui/switch'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Feed } from './Feed'
import { useHash, usePreference } from './hooks/use-preview-state'
import { readPublicIdentity } from './social'
import { Repository } from './Workspace'

function Profile({ name, setName, theme, setTheme, inSidebar = false }) {
  const [open, setOpen] = useState(false)
  const [identity, setIdentity] = useState(null)
  const displayName = name.trim()

  useEffect(() => {
    if (!open) return
    let active = true
    readPublicIdentity().then(key => {
      if (active) setIdentity({ key })
    }).catch(() => {
      if (active) setIdentity({ error: true })
    })
    return () => { active = false }
  }, [open])

  const label = (
    <>
      <Avatar size="sm">
        <AvatarFallback>{displayName ? Array.from(displayName).slice(0, 2).join('').toUpperCase() : <UserRound className="size-3.5" />}</AvatarFallback>
      </Avatar>
      <span className={inSidebar ? 'truncate' : 'hidden truncate sm:inline'}>{displayName || 'Profile'}</span>
    </>
  )

  function changeOpen(value) {
    setIdentity(null)
    setOpen(value)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        {inSidebar
          ? <SidebarMenuButton size="lg" aria-label="Profile">{label}</SidebarMenuButton>
          : <Button variant="ghost" aria-label="Profile" className="min-w-0 max-w-full px-1 sm:px-2">{label}</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>Your social identity and preferences for this preview browser.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="display-name">Display name for new posts</FieldLabel>
          <Input id="display-name" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
        </Field>
        <div className="space-y-1 text-sm">
          <p className="font-medium">Public identity key</p>
          <div role="status">
            {identity?.key
              ? <code className="select-all break-all">{identity.key}</code>
              : <p className="text-muted-foreground">{!identity ? 'Loading identity…' : identity.error ? 'Identity is unavailable.' : 'Your first post creates your preview identity.'}</p>}
          </div>
        </div>
        <Field orientation="horizontal">
          <Switch id="dark-mode" checked={theme === 'dark'} onCheckedChange={value => setTheme(value ? 'dark' : 'light')} />
          <FieldLabel htmlFor="dark-mode">Dark mode</FieldLabel>
        </Field>
      </DialogContent>
    </Dialog>
  )
}

function WorkspaceSidebar({ repository, profile }) {
  const { isMobile } = useSidebar()
  return (
    <Sidebar
      collapsible={isMobile ? 'none' : 'offcanvas'}
      className={isMobile ? 'h-auto w-full border-b' : 'top-12 h-[calc(100svh-3rem)]'}
    >
      <SidebarHeader className="hidden md:flex"><h2 className="px-2 py-1 text-sm font-semibold">Workspace</h2></SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu className="max-md:grid max-md:grid-cols-2">
            <SidebarMenuItem><SidebarMenuButton asChild isActive={!repository}><a href="#feed"><MessagesSquare /> Feed</a></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton asChild isActive={repository}><a href="#workspace/"><FolderGit2 /> Repository</a></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem><Profile {...profile} inSidebar /></SidebarMenuItem>
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
  const workspace = mode === 'workspace'
  const profile = { name, setName, theme, setTheme }
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark') }, [theme])

  return (
    <TooltipProvider>
      <SidebarProvider className="flex-col">
        <header className="sticky top-0 z-20 grid h-12 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 border-b bg-background px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-1">
            <h1 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
              <Bird className="size-4 shrink-0" />
              <span>Wiredove</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="workspace-view" checked={workspace} onCheckedChange={checked => setMode(checked ? 'workspace' : 'social')} />
            <Label htmlFor="workspace-view">Workspace</Label>
          </div>
          {!workspace && <div className="flex min-w-0 justify-end"><Profile {...profile} /></div>}
        </header>
        <div className="flex min-h-[calc(100svh-3rem)] w-full flex-col md:flex-row">
          {workspace && <WorkspaceSidebar repository={repository} profile={profile} />}
          <SidebarInset className="min-w-0">
            <section aria-label="Social feed" hidden={repository} className="mx-auto w-full min-w-0 max-w-2xl p-4 sm:p-6">
              <Feed name={name} />
            </section>
            {repository && (
              <section aria-label="Repository" className="mx-auto w-full min-w-0 max-w-5xl space-y-4 p-4 sm:p-6">
                {!workspace && <Button asChild variant="outline" size="sm"><a href="#feed"><MessagesSquare /> Feed</a></Button>}
                <Repository hash={hash} />
              </section>
            )}
          </SidebarInset>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  )
}
