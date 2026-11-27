import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthorAvatar } from './AuthorAvatar'

export function MessageAuthorHeader({ name, image, href, className, children }) {
  const avatar = <AuthorAvatar name={name} image={image} />
  return (
    <CardHeader className={cn('flex items-start gap-3', className)}>
      {href ? (
        <Button asChild variant="ghost" size="icon" className="shrink-0" aria-label={`Profile for ${name}`}>
          <a href={href}>{avatar}</a>
        </Button>
      ) : (
        <div className="flex size-8 shrink-0 items-center justify-center">{avatar}</div>
      )}
      <div className="min-w-0 flex-1">
        <CardTitle className="break-all text-sm">
          {href ? <a className="hover:underline focus-visible:underline" href={href}>{name}</a> : name}
        </CardTitle>
        <CardDescription className="flex min-w-0 items-baseline gap-2">{children}</CardDescription>
      </div>
    </CardHeader>
  )
}
