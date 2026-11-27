import { CreateClubForm } from '../create-club-form'

export const metadata = { title: 'Create Club — HMM Super Admin' }

export default function NewClubPage() {
  return (
    <div className="flex justify-center p-8 max-sm:p-4">
      <CreateClubForm />
    </div>
  )
}
