// The Champion user manual (sheet row 55). Keep it in step with the portal.
import type { HelpManual } from '@/lib/help/types'

export const CHAMPION_MANUAL: HelpManual = {
  portal: 'champion',
  title: 'Champion guide',
  sections: [
    {
      id: 'getting-started',
      title: 'Signing in and your session',
      summary: 'Signing in, staying signed in, and signing out safely.',
      paths: ['/champion/profile'],
      articles: [
        {
          id: 'sign-in',
          title: 'Sign in',
          steps: [
            'Go to the Champion login page and enter your email and password.',
            'The first time, use the “Set your password” link in your welcome email to choose your password, then sign in with it. The link works once and expires after 72 hours; if it has expired, use “Forgot password?” on the sign-in page to get a new link.',
            'Forgot your password? Choose “Forgot Password?” on the Champion login page.',
          ],
        },
        {
          id: 'session-timeout',
          title: 'Why was I signed out?',
          notes: [
            'You are signed out after 30 minutes without activity. Two minutes before, choose “Stay signed in” to carry on.',
            'Working in any open portal tab counts as activity.',
            'You are asked to sign in again 12 hours after signing in.',
          ],
        },
        {
          id: 'sign-out',
          title: 'Sign out',
          steps: ['Select your name in the top-right corner, then Logout, and confirm with Log out.'],
        },
        {
          id: 'profile',
          title: 'Your profile and permissions',
          notes: [
            'My Profile lets you update your details and change your password.',
            'Role & Access lists what your account can do right now. If something you need is missing, ask a Super Admin.',
          ],
        },
      ],
    },
    {
      id: 'dashboard',
      title: 'Dashboard',
      summary: 'Your club at a glance.',
      paths: ['/champion'],
      articles: [
        {
          id: 'dashboard-figures',
          title: 'What the dashboard shows',
          notes: [
            'Active and inactive Gatekeepers, people added this month, and onboarding over time.',
            'Certifications shows your club’s figures per type, and how many people have a current certification.',
            'Upcoming and recent events for your club.',
          ],
        },
      ],
    },
    {
      id: 'gatekeepers',
      title: 'Gatekeepers',
      summary: 'Adding and managing the Gatekeepers in your club.',
      paths: ['/champion/gatekeepers'],
      articles: [
        {
          id: 'add-gatekeeper',
          title: 'Add Gatekeepers',
          steps: [
            'Open Gatekeepers and choose Add Gatekeeper.',
            'Enter the name, email and phone. They are added to your club.',
            'For many at once, use Bulk CSV Upload with the template.',
          ],
        },
        {
          id: 'manage-gatekeeper',
          title: 'Edit, deactivate or reactivate',
          notes: [
            'Select a Gatekeeper’s name to open their profile.',
            'From there you can edit their details, add certificates, or deactivate and reactivate them, as your permissions allow.',
          ],
        },
      ],
    },
    {
      id: 'certifications',
      title: 'Certifications',
      summary: 'Certificates for your club’s Gatekeepers.',
      paths: ['/champion/certifications'],
      articles: [
        {
          id: 'award',
          title: 'Award and review certificates',
          notes: [
            'Award a certificate from a Gatekeeper’s profile.',
            'Review certifications your Gatekeepers report themselves, then verify or remove them.',
          ],
        },
      ],
    },
    {
      id: 'events',
      title: 'Events & calendar',
      summary: 'Your club’s events, and viewing other clubs’ events.',
      paths: ['/champion/events'],
      articles: [
        {
          id: 'schedule-event',
          title: 'Schedule an event for your club',
          steps: [
            'Open Events and choose Schedule New Event.',
            'Choose the type (for Other, describe it), the date and times in Sri Lanka time, the venue and facilitator.',
            'Save. Your club’s Gatekeepers see it in the mobile app.',
          ],
          notes: ['You can edit or cancel events you created for your own club.'],
        },
        {
          id: 'other-clubs',
          title: 'See other clubs’ events',
          notes: ['Use the club filter to view any club’s events. Other clubs’ events are read-only.'],
        },
        {
          id: 'registrations',
          title: 'See who registered',
          notes: ['Open an event to see who from your club registered and when, with the total.'],
        },
      ],
    },
    {
      id: 'announcements',
      title: 'Announcements',
      summary: 'Announcements for your club.',
      paths: ['/champion/announcements'],
      articles: [
        {
          id: 'create-announcement',
          title: 'Create an announcement',
          steps: [
            'Open Announcements and choose Add New Announcement.',
            'Write the title and content, and choose a priority.',
            'It goes to your club. To reach only some people, tick them in the list and check the number it will reach.',
            'Publish now, or schedule it for a later date and time (Sri Lanka time). You can set an expiry after the publication time.',
          ],
          notes: ['You can edit and delete the announcements you created, as your permissions allow.'],
        },
      ],
    },
    {
      id: 'resources',
      title: 'Resources',
      summary: 'Learning resources published for Champions.',
      paths: ['/champion/resources'],
      articles: [
        {
          id: 'browse',
          title: 'Find and read resources',
          notes: [
            'Search or filter by category and type.',
            'Select View on an article to read it in full, or open a video or document.',
          ],
        },
      ],
    },
  ],
}
