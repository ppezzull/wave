// `/u` is the signed-in user's profile shortcut. A usable ENS handle is not
// guaranteed for a Privy wallet, so route it to Settings rather than rendering
// the nonexistent dynamic route `/u/[handle]` and returning a 404.
import { redirect } from 'next/navigation'

export default function CurrentUserProfilePage() {
  redirect('/settings')
}
