import { HelpCentre } from '@/components/help/help-centre'
import { CHAMPION_MANUAL } from '@/lib/help/manual-champion'
import { supportEmail } from '@/lib/help/support'

export const metadata = { title: 'Help — HMM Champion' }

// Sheet row 55: the Champion user manual.
export default function ChampionHelpPage() {
  return <HelpCentre manual={CHAMPION_MANUAL} supportEmail={supportEmail()} />
}
