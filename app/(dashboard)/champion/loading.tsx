import { PageLoading } from '@/components/page-loading'

// Fix T: shown straight away when moving between Champion pages.
// Kept at this level on purpose — a loading.tsx inside a section that has an
// @modal slot would also wrap the pop-up and flash this full-page loader.
export default function ChampionLoading() {
  return <PageLoading />
}
