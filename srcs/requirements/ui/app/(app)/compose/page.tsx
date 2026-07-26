import { getStrategy } from '@/lib/data'
import { ComposeScreen } from './compose-screen'

// /compose — split-screen composer (Pietro.md L61, frontend.md §5 "post is the prompt").
// Server Component: resolve optional ?fork=<id> → ENS description prefill.
// The description is the literal compiler input — no trim/reflow on the way to /api/compile.
export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ fork?: string }>
}

export default async function ComposePage({ searchParams }: Props) {
  const { fork } = await searchParams
  const forkSource = fork ? await getStrategy(fork) : null

  return (
    <ComposeScreen
      initialDescription={forkSource?.description ?? ''}
      forkAuthor={forkSource?.authorHandle}
      forkId={forkSource?.id}
    />
  )
}
