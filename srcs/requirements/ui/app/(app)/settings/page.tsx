import { getCurrentUser, getAuthorAvatarUrl } from '@/lib/data'
import { networkOptions, selectedNetworkId } from '@/lib/networks'
import { readSessionCookie } from '@/lib/session-cookie'
import { approvalGateConfig } from '@/app/actions/ship'
import { RequireSession } from '@/components/require-session'
import { SettingsForm } from './settings-form'

export default async function SettingsPage() {
  const [user, selected, hint, gate] = await Promise.all([
    getCurrentUser(),
    selectedNetworkId(),
    readSessionCookie(),
    approvalGateConfig(),
  ])
  if (hint?.address && !user.walletAddress) {
    user.walletAddress = hint.address
    user.handle = hint.address.toLowerCase()
    user.avatarUrl = await getAuthorAvatarUrl(hint.address)
  }
  return (
    <RequireSession>
      <SettingsForm
        user={user}
        network={{ selected, options: await networkOptions() }}
        gate={gate}
      />
    </RequireSession>
  )
}
