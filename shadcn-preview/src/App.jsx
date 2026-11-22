import { useEffect } from 'react'
import { Bird, FolderGit2, MessagesSquare, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sidebar, SidebarContent, SidebarGroup, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Feed } from './Feed'
import { useHash, usePreference } from './hooks/use-preview-state'
import { Repository } from './Workspace'

function Settings({ name, setName, theme, setTheme }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" aria-label="Settings" className="max-sm:px-2">
          <Settings2 /><span className="hidden sm:inline">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Preferences for this preview browser.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="display-name">Display name for new posts</FieldLabel>
          <Input id="display-name" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
        </Field>
        <Field orientation="horizontal">
          <Switch id="dark-mode" checked={theme === 'dark'} onCheckedChange={value => setTheme(value ? 'dark' : 'light')} />
          <FieldLabel htmlFor="dark-mode">Dark mode</FieldLabel>
        </Field>
      </DialogContent>
    </Dialog>
  )
}

function WorkspaceSidebar({ repository, chooseWorkspace }) {
  const { setOpenMobile } = useSidebar()
  function navigate() {
    chooseWorkspace()
    setOpenMobile(false)
  }
  return (
    <Sidebar>
      <SidebarHeader><h1 className="flex items-center gap-2 px-2 py-1 text-base font-semibold"><Bird className="size-4" /> Wiredove</h1></SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton asChild isActive={!repository}><a href="#feed" onClick={navigate}><MessagesSquare /> Feed</a></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton asChild isActive={repository}><a href="#workspace/" onClick={navigate}><FolderGit2 /> Repository</a></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

export default function App() {
  const hash = useHash()
  const [preferredMode, setMode] = usePreference('view', 'social')
  const [name, setName] = usePreference('name', '')
  const [theme, setTheme] = usePreference('theme', 'light')
  const repository = hash.startsWith('workspace/')
  const mode = repository ? 'workspace' : preferredMode
  const workspace = mode === 'workspace'
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark') }, [theme])

  function changeMode(value) {
    if (!value) return
    setMode(value)
    if (value === 'social' && repository) location.hash = 'feed'
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        {workspace && <WorkspaceSidebar repository={repository} chooseWorkspace={() => setMode('workspace')} />}
        <SidebarInset className="min-w-0">
          <header className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-3 sm:px-6">
            {workspace && <SidebarTrigger className="md:hidden" />}
            {!workspace && <h1 className="mr-auto flex items-center gap-2 text-base font-semibold"><Bird className="size-4" /> Wiredove</h1>}
            <ToggleGroup type="single" variant="outline" value={mode} onValueChange={changeMode} aria-label="Wiredove views" className={workspace ? 'mr-auto' : undefined}>
              <ToggleGroupItem value="social">Social</ToggleGroupItem>
              <ToggleGroupItem value="workspace">Workspace</ToggleGroupItem>
            </ToggleGroup>
            <Settings name={name} setName={setName} theme={theme} setTheme={setTheme} />
          </header>
          <section aria-label="Social feed" hidden={repository} className="mx-auto w-full min-w-0 max-w-2xl p-4 sm:p-6">
            <Feed name={name} />
          </section>
          {repository && (
            <section aria-label="Repository" className="mx-auto w-full min-w-0 max-w-5xl p-4 sm:p-6">
              <Repository hash={hash} />
            </section>
          )}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
