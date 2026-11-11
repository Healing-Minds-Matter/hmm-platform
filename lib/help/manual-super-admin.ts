// The Super Admin user manual (sheet row 55). Keep it in step with the portal:
// when a screen changes, update its section here in the same branch.
import type { HelpManual } from '@/lib/help/types'

export const SUPER_ADMIN_MANUAL: HelpManual = {
  portal: 'super_admin',
  title: 'Super Admin guide',
  sections: [
    {
      id: 'getting-started',
      title: 'Signing in and your session',
      summary: 'Signing in, staying signed in, and signing out safely.',
      paths: ['/super-admin/profile'],
      articles: [
        {
          id: 'sign-in',
          title: 'Sign in',
          steps: [
            'Go to the Super Admin login page and enter your email and password.',
            'Super Admin accounts sign in here; Champions use the Champion login page.',
            'Forgot your password? Choose “Forgot Password?” and follow the link we email you.',
          ],
        },
        {
          id: 'two-step-verification',
          title: 'Two-step verification',
          steps: [
            'After your password, enter the 6-digit code from your authenticator app (for example Google Authenticator or Microsoft Authenticator).',
            'The first time, scan the QR code shown with the app (or type in the key under it), then enter the code it shows.',
          ],
          notes: [
            'Super Admin accounts always need the code. Codes change every 30 seconds; if one is refused, check your phone sets its time automatically.',
            'Lost or replaced your phone? Ask the person who manages the HMM Supabase project to reset your two-step verification, then sign in and set it up again.',
          ],
        },
        {
          id: 'session-timeout',
          title: 'Why was I signed out?',
          notes: [
            'For safety you are signed out after 30 minutes without activity. Two minutes before, a message lets you choose “Stay signed in”.',
            'Working in any open portal tab counts as activity, so an idle second tab won’t sign you out.',
            'However active you are, you are asked to sign in again 12 hours after signing in.',
          ],
        },
        {
          id: 'sign-out',
          title: 'Sign out',
          steps: [
            'Select your name in the top-right corner, then Logout.',
            'Confirm with Log out. Cancel keeps you signed in.',
          ],
        },
        {
          id: 'profile',
          title: 'Your profile and password',
          steps: [
            'Select your name, then My Profile.',
            'Edit your name, phone, job title, office location or language, then Save Changes.',
            'Use Change Password to set a new one. It must be at least 12 characters with upper- and lower-case letters, a number and a symbol, and can’t match your last five passwords.',
          ],
          notes: ['Role & Access lists what your account can do right now.'],
        },
      ],
    },
    {
      id: 'dashboard',
      title: 'Dashboard',
      summary: 'Platform-wide figures at a glance.',
      paths: ['/super-admin'],
      articles: [
        {
          id: 'dashboard-figures',
          title: 'What the dashboard shows',
          notes: [
            'Active Champions, upcoming events and certification figures for active clubs.',
            'Active Gatekeepers by Club and Club Onboarding Progress compare clubs.',
            'Certifications shows, per certification type, how many are valid, expiring soon or expired, and how many people have a current certification.',
          ],
        },
      ],
    },
    {
      id: 'clubs',
      title: 'Clubs',
      summary: 'Creating, editing, deactivating and reactivating clubs.',
      paths: ['/super-admin/clubs'],
      articles: [
        {
          id: 'create-club',
          title: 'Create a club',
          steps: [
            'Open Clubs and choose Create New Club.',
            'Enter the club name, a unique club code and the venue address. Contact details are optional.',
            'Choose Create Club & Activate. Fields with a problem are marked in red with the reason underneath.',
          ],
          notes: ['To add many clubs at once, use the Bulk CSV Upload tab and download the template first.'],
        },
        {
          id: 'deactivate-club',
          title: 'Deactivate or reactivate a club',
          intro: 'Deactivating a club pauses access for its Champions and Gatekeepers. Their records are kept.',
          steps: [
            'Open the club and choose Deactivate.',
            'To restore it, open the club and choose Reactivate. Only people who were deactivated with the club get their access back.',
          ],
        },
      ],
    },
    {
      id: 'champions',
      title: 'Champions',
      summary: 'Adding Champions, editing them and controlling their access.',
      paths: ['/super-admin/champions'],
      articles: [
        {
          id: 'add-champion',
          title: 'Add a Champion',
          steps: [
            'Open Champions and choose Add Champion.',
            'Enter their name, email and phone, and choose their club. Each Champion manages one club.',
            'Save. They receive an email with a single-use link (valid for 72 hours) to set their own password. Nobody else ever sees or chooses it.',
          ],
        },
        {
          id: 'champion-access',
          title: 'Deactivate, reactivate or check permissions',
          steps: [
            'Open the Champion’s page.',
            'Use Deactivate or Reactivate to stop or restore their access.',
            'Use View Permissions to see exactly what they can do and why.',
          ],
        },
      ],
    },
    {
      id: 'gatekeepers',
      title: 'Gatekeepers',
      summary: 'Adding and managing Gatekeepers in any club.',
      paths: ['/super-admin/gatekeepers'],
      articles: [
        {
          id: 'add-gatekeeper',
          title: 'Add Gatekeepers',
          steps: [
            'Open Gatekeepers and choose Add Gatekeeper.',
            'Enter the name, email and phone, and choose the club. Every phone number must be unique.',
            'For many people at once, use Bulk CSV Upload: download the template, fill one row per person (club_id is the club’s ID from the list shown), check the file, then save.',
          ],
        },
        {
          id: 'gatekeeper-profile',
          title: 'Open a Gatekeeper’s profile',
          notes: ['Select a Gatekeeper’s name in any list or club roster to open their profile, certifications and status.'],
        },
      ],
    },
    {
      id: 'certifications',
      title: 'Certifications',
      summary: 'Certification types, awarding certificates and reviewing self-reported ones.',
      paths: ['/super-admin/certifications'],
      articles: [
        {
          id: 'certification-types',
          title: 'Manage certification types',
          steps: [
            'Open Certifications to see every type.',
            'Create a type with its name, code, validity and issuing body.',
            'Retire a type that is no longer offered; choose whether existing certificates stay valid.',
          ],
        },
        {
          id: 'award',
          title: 'Award or review certificates',
          notes: [
            'Award a certificate from a person’s profile, or award one to several people at once.',
            'Self-reported certifications appear in the review queue to verify or remove.',
          ],
        },
      ],
    },
    {
      id: 'resources',
      title: 'Resources',
      summary: 'Publishing learning resources and managing their categories.',
      paths: ['/super-admin/resources'],
      articles: [
        {
          id: 'add-resource',
          title: 'Add a resource',
          steps: [
            'Open Resources and choose Add Resource.',
            'Pick the type (Video, Article or Document), enter a title and choose a category.',
            'Upload a file or add a link. For an article you can type the text, add a link, or both.',
            'Choose Publish Resource, or Save as Draft to finish later.',
          ],
        },
        {
          id: 'view-article',
          title: 'Read an article in full',
          notes: ['Select View on an article to read the whole text and its link without opening Edit.'],
        },
        {
          id: 'categories',
          title: 'Manage resource categories',
          steps: [
            'On Resources, choose Categories.',
            'Add a category, rename one, or deactivate one you no longer want offered.',
            'A category that is used by resources can’t be deleted. Deactivate it instead: existing resources keep it, but it isn’t offered for new ones.',
          ],
        },
      ],
    },
    {
      id: 'announcements',
      title: 'Announcements',
      summary: 'Sending announcements to everyone, a role, or chosen clubs and people.',
      paths: ['/super-admin/announcements'],
      articles: [
        {
          id: 'create-announcement',
          title: 'Create an announcement',
          steps: [
            'Open Announcements and choose New Announcement.',
            'Write a title and the content.',
            'Choose who it’s for: All Users, Champions, Gatekeepers, or Specific Cohort.',
            'Choose a priority and, if needed, pin it to the top of the Gatekeeper feed.',
            'Publish now, or schedule it for a later date and time.',
          ],
        },
        {
          id: 'cohort',
          title: 'Send to particular clubs or people',
          steps: [
            'Choose Specific Cohort, then All clubs or Selected clubs.',
            'With selected clubs you can also tick particular Champions and Gatekeepers in them. Leave everyone unticked to reach everyone in those clubs.',
            'Check the number of people it will reach before you publish. Each person receives it once.',
          ],
        },
        {
          id: 'schedule',
          title: 'Scheduling and expiry',
          notes: [
            'Times are Sri Lanka time.',
            'If you schedule for today, choose a time later than now.',
            'An expiry must be after the publication date and time. After it expires, the announcement disappears from the mobile app.',
            'Drafts are never published automatically; publish them when ready.',
          ],
        },
      ],
    },
    {
      id: 'events',
      title: 'Events & calendar',
      summary: 'Scheduling events, calendar views and registrations.',
      paths: ['/super-admin/events'],
      articles: [
        {
          id: 'schedule-event',
          title: 'Schedule an event',
          steps: [
            'Open Events and choose Schedule New Event.',
            'Choose the event type. For Other, describe the type in a few words.',
            'Enter the date and times (Sri Lanka time), venue and facilitator, and choose all clubs or selected clubs.',
            'Save. The event appears in the calendar and the mobile app.',
          ],
        },
        {
          id: 'calendar-views',
          title: 'Calendar views',
          notes: ['Switch between Year, Quarter, Month, Week and Agenda. Filter by club, type or search.'],
        },
        {
          id: 'registrations',
          title: 'See who registered',
          notes: ['Open an event to see its Registrations: each person’s name, club and when they registered, with the total.'],
        },
      ],
    },
    {
      id: 'permissions',
      title: 'Permissions',
      summary: 'Role defaults, individual exceptions, groups and temporary cover.',
      paths: ['/super-admin/permissions'],
      articles: [
        {
          id: 'role-defaults',
          title: 'Role defaults',
          notes: ['Turn a permission on or off for every Champion or every Gatekeeper. Changes save straight away and are recorded in Audit History.'],
        },
        {
          id: 'exceptions',
          title: 'Give one person an exception',
          steps: [
            'Open Permissions, then Individual Exceptions, then Grant Exception.',
            'Choose the person, Allow or Deny, and tick one or more permissions.',
            'Grant. Permissions the person already has are skipped and listed so you know.',
          ],
          notes: ['Some permissions are for Super Admins only and can’t be given to anyone else.'],
        },
        {
          id: 'groups-delegation',
          title: 'Groups and temporary cover',
          notes: [
            'Groups apply a set of permissions to several people at once.',
            'Delegations let one person cover for another for a set period.',
          ],
        },
      ],
    },
  ],
}
