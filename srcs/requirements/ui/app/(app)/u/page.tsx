// `/u` is the signed-in user's profile shortcut. A profile handle is not
// guaranteed for a Privy wallet (the identity seam's handle is just a
// truncated address), so route it to Settings rather than rendering the
// dynamic route `/u/[handle]` and returning a 404.
import { redirect } from 'next/navigation'

export default function CurrentUserProfilePage() {
  redirect('/settings')
}
