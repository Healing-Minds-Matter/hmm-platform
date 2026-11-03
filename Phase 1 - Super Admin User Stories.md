**Epic 1: Authentication & Access Control**

**Story 1.1 — Super Admin Login**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | log in to the Web Application using my registered email and password |
| **So that** | I can securely access the platform administration features assigned to my role |

**Description**  
This story covers standard credential-based login for the Super Admin role. The system must validate credentials, enforce role-based access control (RBAC) so the Super Admin sees system-wide features, and prevent access with invalid or inactive credentials.

**Acceptance Criteria**

**Scenario 01: Successful Login**  
GIVEN a Super Admin has a registered, active account  
WHEN they enter a valid email and password  
THEN the system shall authenticate them and redirect to the Super Admin Dashboard

**Scenario 02: Invalid Credentials**  
GIVEN a Super Admin enters an incorrect email or password  
WHEN they attempt to log in  
THEN the system shall reject the login attempt and display an appropriate error message without indicating whether the email or password was incorrect

**Scenario 03: Deactivated Account**  
GIVEN a Super Admin account has been deactivated  
WHEN they attempt to log in with valid credentials  
THEN the system shall deny access and display a message indicating the account is inactive

---

**Story 1.2 — Forgot Password**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | reset my password via email when I forget it |
| **So that** | I can regain access to my account without needing manual intervention from another user |

**Description**  
Covers the self-service password recovery flow via a registered email address, as required for all Web Application users. Any new password set through this flow must meet the platform's standard password policy.

**Acceptance Criteria**

**Scenario 01: Request Password Reset**  
GIVEN a Super Admin has forgotten their password  
WHEN they select "Forgot Password" and enter their registered email  
THEN the system shall send a secure, time-limited password reset link to that email

**Scenario 02: Unregistered Email**  
GIVEN an email entered on the "Forgot Password" screen is not registered in the system  
WHEN the request is submitted  
THEN the system shall display a generic confirmation message (e.g., "If this email is registered, a reset link has been sent") without revealing whether the account exists, to prevent account enumeration

**Scenario 03: Reset Link Expired**  
GIVEN a password reset link has exceeded its validity period  
WHEN the Super Admin attempts to use it  
THEN the system shall reject the request and prompt them to request a new link

**Scenario 04: Reset Link Single-Use**  
GIVEN a password reset link has already been used once  
WHEN the Super Admin attempts to reuse the same link  
THEN the system shall reject the request and prompt them to request a new link

**Scenario 05: Password Meets Complexity Requirements**  
GIVEN a Super Admin follows a valid reset link  
WHEN they enter a new password  
THEN the system shall require the password to:

* Be a minimum of 8 characters long

* Contain at least one uppercase letter

* Contain at least one lowercase letter

* Contain at least one numeric digit

* Contain at least one special character (e.g., \!@\#$%^&\*)

* Not contain the user's name or email address

* Not be a commonly used/weak password (e.g., "Password123\!")

**Scenario 06: Password Confirmation Match**  
GIVEN a Super Admin enters a new password and a confirmation field  
WHEN the two entries do not match  
THEN the system shall reject the submission and display an error indicating the passwords do not match

**Scenario 07: Password Reuse Prevention**  
GIVEN a Super Admin attempts to set a new password  
WHEN the new password matches their current or a recently used password (e.g., last 3–5 passwords)  
THEN the system shall reject the change and prompt them to choose a different password

**Scenario 08: Successful Reset**  
GIVEN a Super Admin submits a new password that meets all complexity and reuse requirements  
WHEN the reset is confirmed  
THEN the system shall update the stored (hashed) password, invalidate the reset link, log the password change event, and allow login with the new credentials

**Scenario 09: Reset Confirmation Notification**  
GIVEN a password has been successfully reset  
WHEN the reset completes  
THEN the system shall send a confirmation email notifying the account holder that their password was changed, including guidance to contact support if they did not initiate the request

---

**Story 1.3 — Change Password (Authenticated)**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | change my password while logged in |
| **So that** | I can maintain the security of my account |

**Description**  
Allows an authenticated Super Admin to update their password proactively from their profile settings. Any new password must meet the platform's standard password policy.

**Acceptance Criteria**

**Scenario 01: Current Password Verification**  
GIVEN a Super Admin is logged in and initiates a password change  
WHEN they submit the form without entering their current password correctly  
THEN the system shall reject the change and display an error, without disclosing which part of the credential check failed

**Scenario 02: Password Meets Complexity Requirements**  
GIVEN a Super Admin enters a new password  
WHEN they submit the form  
THEN the system shall require the password to:

* Be a minimum of 8 characters long

* Contain at least one uppercase letter

* Contain at least one lowercase letter

* Contain at least one numeric digit

* Contain at least one special character (e.g., \!@\#$%^&\*)

* Not contain the user's name or email address

* Not be a commonly used/weak password

**Scenario 03: Password Confirmation Match**  
GIVEN a Super Admin enters a new password and a confirmation field  
WHEN the two entries do not match  
THEN the system shall reject the submission and display an error indicating the passwords do not match

**Scenario 04: New Password Must Differ from Current**  
GIVEN a Super Admin enters a new password identical to their current password  
WHEN they submit the form  
THEN the system shall reject the change and prompt them to choose a different password

**Scenario 05: Password Reuse Prevention**  
GIVEN a Super Admin attempts to set a new password  
WHEN the new password matches a recently used password (e.g., last 3–5 passwords)  
THEN the system shall reject the change and prompt them to choose a different password

**Scenario 06: Successful Password Change**  
GIVEN a Super Admin enters their current password correctly along with a valid, compliant new password  
WHEN they submit the form  
THEN the system shall update the password, log the change event, and confirm success to the user

**Scenario 07: Session Handling After Change**  
GIVEN a Super Admin successfully changes their password  
WHEN the change is confirmed  
THEN the system shall keep the current session active but require re-authentication with the new password on all other active sessions/devices

**Scenario 08: Change Confirmation Notification**  
GIVEN a password has been successfully changed  
WHEN the change completes  
THEN the system shall send a confirmation email notifying the account holder, including guidance to contact support if they did not make the change

---

**Story 1.4 — Session Timeout & Secure Logout**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | be automatically logged out after a period of inactivity, be warned shortly before this happens, and be able to log out manually |
| **So that** | unauthorized users cannot access the platform through an unattended session, and I don't lose unsaved work without warning |

**Description**  
Enforces session management requirements from the NFR section; automatic session expiry after a defined idle period, plus manual logout. To improve usability, the system should warn the user shortly before the session expires, giving them the option to stay logged in.

**Acceptance Criteria**

**Scenario 01: Manual Logout**  
GIVEN a Super Admin is logged in  
WHEN they select "Log Out"  
THEN the system shall terminate the session and redirect to the login page

**Scenario 02: Idle Session Expiry**  
GIVEN a Super Admin's session has been idle for \[X\] minutes (recommended default: 15–20 minutes \- to be confirmed by Product Owner)  
WHEN they attempt any further action  
THEN the system shall terminate the session and require re-authentication

**Scenario 03: Session Expiry Warning**  
GIVEN a Super Admin's session is approaching its idle timeout  
WHEN \[Y\] minutes remain before expiry (recommended default: 1–2 minutes)  
THEN the system shall display a warning message (e.g., "Your session is about to expire in \[Y\] minutes") 

**Scenario 04: No Response to Warning**  
GIVEN a Super Admin is shown the session expiry warning  
WHEN the countdown reaches zero without any user action  
THEN the system shall terminate the session, redirect to the login page, and display a message indicating the session expired due to inactivity

---

**Epic 2: Dashboard**

**Story 2.1 — View Platform-Wide Dashboard**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | view a system-wide dashboard summarizing platform activity across all active clubs, with each metric displayed in the most useful visual format |
| **So that** | I can quickly assess overall program progress without navigating to each club individually |

**Description**  
Covers the six dashboard elements defined in Section 5.2.1 of the requirements. This story defines what data is shown, how each stat is visually presented, and the filtering rules that apply, so it can be built and tested consistently.

**Dashboard Elements & Display Specification**

| \# | Element | Metric Definition | Display Type | Filter |
| :---- | :---- | :---- | :---- | :---- |
| 1 | Total Active Gatekeeper Count per Club | Count of active Gatekeepers, broken down by club | Horizontal bar chart; one bar per club, sorted descending by count. Bar label shows club name \+ count | None (current-state) |
| 2 | Total Active Champions | Aggregate count of active Champions across all clubs | KPI number tile (large number \+ label) | None (current-state) |
| 3 | Club Onboarding Progress | Count of new Gatekeepers onboarded per club within the selected period | Horizontal bar chart, one bar per active club, scaled relative to the highest count in the period, with the raw count labeled on each bar | Own filter \- This Month (default) / Last Month / This Quarter |
| 4 | Club-wise Gatekeeper Count (active/inactive) | Count of Gatekeepers per club, split by status | Stacked horizontal bar chart \- one bar per club, split into active and inactive segments, with a legend | None (current-state) |
| 5 | Upcoming Events | Count of events scheduled after today, system-wide, with a mini-list of the next 3 events (name, club, date) | KPI number tile \+ mini-list below it | Own filter \- Next 7 Days / Next 30 Days (default) / All Upcoming |
| 6 | Total QPR Certified Gatekeepers & Champions | Count of users with a currently active (non-expired) QPR certification, shown as count and % of total users | KPI number tile (e.g., "342 / 400 (85.5%) certified") | None (current-state) |

Layout Notes

* KPI tiles (\#2, \#5, \#6) are grouped in a top row.

* Chart-based elements (\#1, \#3, \#4) are grouped below, each in its own card/panel.

* Filters for \#3 and \#5 are local to their own widget only; no shared/global filter control.

**Global Rule: Active Clubs Only**  
All six Dashboard elements shall include data from active clubs only. Deactivated clubs are excluded from every count, chart, and aggregate on this dashboard.

**Acceptance Criteria**

**Scenario 01: Dashboard Loads with Correct Widget Types**  
GIVEN the Super Admin logs in  
WHEN they land on the Dashboard  
THEN the system shall render: a bar chart of active Gatekeepers per club, a KPI tile for total active Champions, a bar chart for club onboarding progress, a stacked bar chart for club-wise Gatekeeper status, a KPI tile with mini-list for upcoming events, and a KPI tile for total QPR-certified count

**Scenario 02: No Data Available**  
GIVEN a newly created club has no Gatekeepers, Champions, or events yet  
WHEN the Super Admin views the Dashboard  
THEN the system shall display a zero-state (e.g., "0" or an empty bar with a "No data yet" label) for that club rather than an error or blank section

**Scenario 03: Data Freshness**  
GIVEN underlying data changes (e.g., a Gatekeeper is deactivated)  
WHEN the Super Admin refreshes or reloads the Dashboard  
THEN all affected widgets shall reflect the current state of the system

**Scenario 04: Hover/Tap for Exact Values**  
GIVEN a chart-based widget is displayed with rounded or abbreviated values  
WHEN the Super Admin hovers over (Web) a data point  
THEN the system shall display the exact underlying number in a tooltip

**Scenario 05: Large Number of Clubs**  
GIVEN the number of clubs exceeds what can be legibly displayed in a single chart (e.g., more than 10\)  
WHEN the Dashboard renders the per-club charts (\#1, \#3, \#4)  
THEN the system shall display the top N clubs by count with a "View All" link/button leading to a full sortable table

**Scenario 06: Drill-Down Navigation**  
GIVEN the Super Admin clicks the "Upcoming Events" KPI tile  
WHEN the click is registered  
THEN the system shall navigate to the full Event Calendar view

**Scenario 07: Independent Widget Filters**  
GIVEN the Super Admin changes the filter on the Club Onboarding Progress widget  
WHEN the selection is applied  
THEN only that widget shall update \- the Upcoming Events widget and all current-state KPI tiles shall remain unaffected

**Scenario 08: Onboarding Progress Filter Options**  
GIVEN the Super Admin opens the Club Onboarding Progress filter  
WHEN the available options are displayed  
THEN only "This Month" (default), "Last Month," and "This Quarter" shall be selectable

**Scenario 09: Upcoming Events Filter Options**  
GIVEN the Super Admin opens the Upcoming Events filter  
WHEN the available options are displayed  
THEN only "Next 7 Days," "Next 30 Days" (default), and "All Upcoming" shall be selectable, with no cap on the "All Upcoming" range

**Scenario 10: Default States on Load**  
GIVEN the Super Admin opens the Dashboard for the first time in a session  
WHEN the page loads  
THEN Club Onboarding Progress shall default to "This Month" and Upcoming Events shall default to "Next 30 Days," independent of one another

**Scenario 11: Exclusion of Inactive Clubs**  
GIVEN one or more clubs have been deactivated  
WHEN the Super Admin views any Dashboard metric  
THEN data from deactivated clubs shall be excluded from all counts and charts

---

**Epic 3: Profile Management**

**Story 3.1 — View & Update Own Profile**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | view and update my own profile details |
| **So that** | my account information stays accurate and I can manage my account securely in one place |

**Description**  
Covers Section 5.2.2; viewing personal details, updating permitted fields, changing password, and viewing role/access level.

**Acceptance Criteria**

**Scenario 01: View Profile**  
GIVEN a Super Admin navigates to their profile page  
WHEN the page loads  
THEN the system shall display their name, email, contact information, role, and access level

**Scenario 02: Update Permitted Fields**  
GIVEN a Super Admin edits a permitted field (e.g., phone number)  
WHEN they save the change  
THEN the system shall persist the update and confirm success

**Scenario 03: Restricted Fields**  
GIVEN certain fields (e.g., role, email used for login) are not editable by the user directly  
WHEN the Super Admin views their profile  
THEN those fields shall be displayed as read-only

---

**Epic 4: Resource Management**

**Story 4.1 — Upload Learning Resource**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | upload videos, articles, and documents to the platform |
| **So that** | Champions and Gatekeepers have access to consistent, centralized learning and reference materials |

**Description**  
Covers Section 5.2.3 \- support for multiple resource types, each with title, description, category/tag, and publication date, visible to Champions (Web) and Gatekeepers (Mobile).

**Acceptance Criteria**

**Scenario 01: Upload a Video Resource**  
GIVEN a Super Admin selects "Add Resource" and chooses type "Video"  
WHEN they upload a file OR provide an external URL (e.g., YouTube) along with title, description, category, and publication date  
THEN the system shall save the resource and make it visible to Champions and Gatekeepers

**Scenario 02: Upload an Article**  
GIVEN a Super Admin creates a resource of type "Article"  
WHEN they enter rich text content or an external link  
THEN the system shall publish the article for Champion and Gatekeeper access

**Scenario 03: Upload a Document**  
GIVEN a Super Admin uploads a document (PDF, Word, or other supported format)  
WHEN required data is provided  
THEN the system shall store the file and make it available for in-app viewing or download

**Scenario 04: Missing Required data**  
GIVEN a Super Admin attempts to publish a resource without a required field (e.g., title)  
WHEN they submit the form  
THEN the system shall block submission and highlight the missing field

---

**Story 4.2 — Edit & Delete Resources**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | edit or delete previously uploaded resources |
| **So that** | Champions and Gatekeepers have access to consistent, centralized learning and reference materials |

**Description**  
Covers ongoing resource lifecycle management referenced in Section 5.2.3.

**Acceptance Criteria**

**Scenario 01: Edit Resource**  
GIVEN a Super Admin selects an existing resource  
WHEN they update its title, description, category, or file/link  
THEN the system shall save the changes and reflect them immediately to Champions and Gatekeepers

**Scenario 02: Delete Resource**  
GIVEN a Super Admin selects "Delete" on a resource  
WHEN they confirm the deletion  
THEN the system shall remove the resource from all Champion and Gatekeeper views

---

**Epic 5: Announcement Management**

**Story 5.1 — Create & Schedule Platform-Wide Announcement**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | create and schedule announcements visible to all platform users |
| **So that** | I can communicate important, time-sensitive information across the entire program |

**Description**  
Covers Section 5.2.4 \- announcements with title, body, publication date, and optional expiry date, visible to all users (Web and Mobile).

**Acceptance Criteria**

**Scenario 01: Create Immediate Announcement**  
GIVEN a Super Admin creates an announcement with a title, body, and today's publication date  
WHEN they publish it  
THEN the system shall make it immediately visible to all Champions and Gatekeepers

**Scenario 02: Schedule Future Announcement**  
GIVEN a Super Admin sets a publication date in the future  
WHEN that date is reached  
THEN the system shall automatically make the announcement visible without manual action

**Scenario 03: Announcement Expiry**  
GIVEN an announcement has an optional expiry date  
WHEN the expiry date passes  
THEN the system shall stop displaying the announcement to users

---

**Story 5.2 — Edit & Delete Announcements**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | edit or delete announcements I have created |
| **So that** | I can correct mistakes or remove outdated information |

**Description**  
Covers ongoing announcement lifecycle management from Section 5.2.4.

**Acceptance Criteria**

**Scenario 01: Edit Announcement**  
GIVEN a Super Admin edits an existing announcement's title, body, or expiry date  
WHEN they save the changes  
THEN the updated announcement shall be reflected across all Web and Mobile views

**Scenario 02: Delete Announcement**  
GIVEN a Super Admin deletes an announcement  
WHEN the deletion is confirmed  
THEN the announcement shall no longer be visible to any user

---

**Epic 6: Event & Calendar**

**Story 6.1 — View System-Wide Event Calendar**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | view all events scheduled across all clubs in a single calendar, and see full details of any individual event |
| **So that** | I have full visibility of program activity without needing to check each club separately, and can review specifics of any event without navigating away from the calendar |

**Description**  
Covers Section 5.2.5. Event creation is a Champion capability (Section 5.3.4); the Super Admin's role for events in Phase 1 is view-only. The calendar view shows events at a glance; selecting an event opens a separate detail view showing all fields captured at creation.

**Display Specification**

* **Calendar view**: Month/week/list view showing event tiles with a minimal label (event title \+ time), color-coded or tagged by event type (QPR Certification Session / Awareness Program / Workshop).

* **Event Detail view**: Triggered by clicking/tapping an event tile. Displays as a modal or side panel (not a full-page navigation, so the calendar context isn't lost) showing: 

  * Title

  * Event type

  * Date and time

  * Venue/location

  * Description

  * Maximum participant count (if set)

  * Club (which club created/owns the event)

**Acceptance Criteria**

**Scenario 01: View All Club Events on Calendar**  
GIVEN Champions across multiple clubs have created events  
WHEN the Super Admin opens the Calendar  
THEN the system shall display all events on the calendar regardless of which club created them, each showing at minimum the event title and time

**Scenario 02: Filter by Club or Event Type**  
GIVEN multiple events exist across clubs  
WHEN the Super Admin applies a filter (e.g., by club or event type)  
THEN the system shall display only matching events on the calendar

**Scenario 03: Open Event Details**  
GIVEN an event tile is displayed on the calendar  
WHEN the Super Admin clicks/taps on it  
THEN the system shall display a detail view showing the event's title, type, date and time, venue, description, maximum participant count (if set), and owning club

**Scenario 04: Close Event Details Without Losing Calendar Position**  
GIVEN the Event Detail view is open  
WHEN the Super Admin closes it (e.g., via a close button or clicking outside the panel)  
THEN the system shall return to the calendar at the same view/date the Super Admin was previously on

**Scenario 05: Event Without Optional Fields**  
GIVEN an event was created without a maximum participant count (an optional field)  
WHEN the Super Admin opens its detail view  
THEN the system shall omit that field or display it as "Not specified," rather than showing a blank or error

**Scenario 06: Read-Only Access**  
GIVEN the Super Admin is viewing an event's detail view  
WHEN the view is displayed  
THEN no edit or delete controls shall be shown, since event management is a Champion-only capability in Phase 1

---

**Epic 7: Club Management**

**Story 7.1 — Create a New Club**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | create a new club with its name, location, and relevant details |
| **So that** | Champions and Gatekeepers can be organized and onboarded under it |

**Description**  
Covers Section 5.2.6.

**Acceptance Criteria**

**Scenario 01: Successful Club Creation**  
GIVEN a Super Admin enters a unique club ID, club name, location, and any other required details  
WHEN they submit the form  
THEN the system shall create the club with status "Active" and make it available for Champion assignment

**Scenario 02: Duplicate Club ID**  
GIVEN a club with the same ID already exists  
WHEN the Super Admin attempts to create another with the same ID  
THEN the system shall flag the duplicate and prevent creation until resolved

---

**Story 7.2 — Edit Club Details**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | edit an existing club's name or location |
| **So that** | club records remain accurate as circumstances change |

**Description**  
Covers the club editing requirement in Section 5.2.6.

**Acceptance Criteria**

**Scenario 01: Successful Edit**  
GIVEN a Super Admin updates a club's name or location  
WHEN they save the changes  
THEN the system shall persist the update and reflect it wherever the club is referenced (dashboards, Champion assignments, Gatekeeper records)

---

**Story 7.3 — Deactivate a Club**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | deactivate a club (restricting access for its Champions and Gatekeepers) and reactivate it later (restoring access to those affected), without impacting users who were independently deactivated for other reasons |
| **So that** | inactive clubs are clearly separated from active program operations, and reactivating a club doesn't incorrectly restore access to people who shouldn't have it |

**Description**

Covers Section 5.2.6. Since a Champion or Gatekeeper is assigned to exactly one club at a time, deactivating a club removes the only active assignment they have, so their platform access must be restricted as part of the same action. The system must track *why* a user became inactive (cascaded from club deactivation vs. manually deactivated) so that reactivation only restores users affected by the cascade.

**Acceptance Criteria**

**Scenario 01: Deactivate Club Cascades Access Restriction**  
GIVEN a Super Admin deactivates an active club  
WHEN the deactivation is confirmed  
THEN the system shall set the club status to "Inactive," restrict Web Application login for all Champions currently assigned to that club, and restrict Mobile Application login for all Gatekeepers currently assigned to that club

**Scenario 02: Affected Users Are Flagged, Not Deleted**  
GIVEN a club is deactivated  
WHEN Champions and Gatekeepers of that club have their access restricted  
THEN their accounts and all associated data (profile, history, records) shall be preserved, access is suspended, not deleted, and each shall be tagged with the reason "Inactive \- Club Deactivated" (distinct from a manual deactivation reason)

**Scenario 03: Reactivate Club Restores Cascaded Users Only**  
GIVEN a previously deactivated club is reactivated by the Super Admin  
WHEN the reactivation is confirmed  
THEN the system shall restore access only to Champions and Gatekeepers whose inactive status reason is "Inactive \- Club Deactivated" for that specific club

**Scenario 04: Manually Deactivated Users Are Not Restored on Reactivation**  
GIVEN a Champion or Gatekeeper was manually deactivated by a Super Admin for reasons unrelated to the club's status (before or during the club's deactivation period)  
WHEN the club is later reactivated  
THEN that user's access shall remain restricted \- reactivating the club shall NOT override a manual deactivation

**Scenario 05: Attempted Login During Club Deactivation**  
GIVEN a Champion or Gatekeeper's club is currently deactivated  
WHEN they attempt to log in  
THEN the system shall deny access and display a message indicating their club is currently inactive

**Scenario 06: Single-Club Assignment Rule Enforced**  
GIVEN the current data model restricts each Champion and Gatekeeper to exactly one active club assignment at a time  
WHEN a club is deactivated  
THEN no check for "other active club assignments" is required, since none can exist under this rule \- *(flagged for review if Phase 2 introduces multi-club assignment)*

**Scenario 07: Audit Trail**  
GIVEN a club is deactivated or reactivated  
WHEN the action is confirmed  
THEN the system shall log the club ID, action taken, the Super Admin who performed it, timestamp, and the list of Champions/Gatekeepers whose access was affected

---

**Story 7.4 — View List of All Clubs**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | view a list of all clubs with their status and assigned Champions |
| **So that** | I can monitor the overall club structure of the program |

**Description**  
Covers the club listing requirement in Section 5.2.6.

**Acceptance Criteria**

**Scenario 01: View Club List**  
GIVEN clubs exist in the system  
WHEN the Super Admin opens the Club Management screen  
THEN the system shall display each club's name, location, status (active/inactive), and assigned Champion(s)

**Scenario 02: Search/Filter Clubs**  
GIVEN a large number of clubs exist  
WHEN the Super Admin searches by name or filters by status  
THEN the system shall display only matching results

**Scenario 03: View a club**

GIVEN a club details are exist in the system  
WHEN the Super Admin select & open a club  
THEN a detailed view should be displayed with the champion(s) and gatekeeper(s) in the club

---

**Epic 8: Champion Account Management**

**Story 8.1 — Create Champion Account**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | create a Champion account and assign it to a club |
| **So that** | a coordinator is in place to manage Gatekeepers and events for that club |

**Description**  
Covers Section 5.2.7. On creation, the system auto-generates credentials and sends a welcome email. A Champion can only be assigned to one club at a time, though a club may have multiple Champions.

**Acceptance Criteria**

**Scenario 01: Successful Champion Creation**  
GIVEN a Super Admin enters a Champion's name, email, phone number, and selects a club  
WHEN they submit the form  
THEN the system shall create the Champion account, generate login credentials, and send a welcome email with Web Application access instructions

**Scenario 02: One Club Per Champion**  
GIVEN a Super Admin attempts to assign a Champion to a second club while already assigned to one  
WHEN they submit the change  
THEN the system shall require the existing assignment to be updated/replaced rather than allowing simultaneous assignment to multiple clubs

**Scenario 03: Duplicate Email**  
GIVEN the entered email is already registered to another user  
WHEN the Super Admin submits the form  
THEN the system shall reject creation and display an appropriate error

---

**Story 8.2 — Edit Champion Details**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | edit a Champion's details, including their club assignment |
| **So that** | records stay accurate when a Champion's information or responsibilities change, even if the Champion themselves is unavailable or unaware of the change |

**Description**  
Covers Section 5.2.7. This is distinct from, but overlaps in field scope with the Champion's own self-service profile editing (Section 5.3.2). The Super Admin has authority to edit club assignment and account status, which a Champion cannot do for themselves.

**Field Ownership**

| Field | Editable by Super Admin | Editable by Champion (self-service) |
| :---- | :---- | :---- |
| Name | Yes | Yes |
| Contact information (email, phone) | Yes | Yes |
| Club assignment | Yes | No |
| Account status (active/inactive) | Yes | No |

**Acceptance Criteria**

**Scenario 01: Update Contact Details**  
GIVEN a Super Admin updates a Champion's name or contact information  
WHEN they save the changes  
THEN the system shall persist the update, and it shall be reflected immediately in both the Super Admin's Champion list and the Champion's own profile view

**Scenario 02: Reassign Champion to a Different Club**  
GIVEN a Super Admin changes a Champion's assigned club  
WHEN they save the change  
THEN the system shall update the Champion's club assignment, remove their access/visibility to the previous club's data, and grant access to the new club's data

**Scenario 03: Concurrent Edit Conflict (Optimistic Concurrency Control)**  
GIVEN a Super Admin opens a Champion's record for editing  
AND the Champion updates the same record (e.g., their own contact details) before the Super Admin saves  
WHEN the Super Admin submits their changes  
THEN the system shall detect that the record has changed since it was opened, reject the save, and prompt the Super Admin to reload the latest version before reapplying their edit, rather than silently overwriting the Champion's change

**Scenario 04: Notification on Super-Admin-Initiated Change**  
GIVEN a Super Admin edits a Champion's details, particularly a club reassignment  
WHEN the change is saved  
THEN the system shall notify the affected Champion (e.g., via email or in-app notice) that their details/assignment were updated by an administrator

**Scenario 05: Restricted Fields Remain Super-Admin-Only**  
GIVEN a Champion is viewing their own profile  
WHEN they attempt to change their club assignment or account status  
THEN those fields shall not be editable from the Champion's own profile screen

---

**Story 8.3 — Deactivate & Reactivate Champion Account**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | deactivate a Champion account when they are no longer in the role, and reactivate it later if they return |
| **So that** | former Champions lose platform access without affecting their club, and returning Champions can regain access without needing a brand-new account |

**Description**  
Covers Section 5.2.7. Deactivating a Champion does not affect their club or its other Champions. Reactivation reuses the existing account and credentials rather than creating a new one, but must first confirm the Champion's club is still active before restoring access.

**Acceptance Criteria**

**Scenario 01: Deactivate Champion**  
GIVEN a Super Admin deactivates a Champion account  
WHEN the action is confirmed  
THEN the system shall revoke that Champion's login access while leaving their assigned club and its other Champions unaffected

**Scenario 02: Sole Champion Deactivated**  
GIVEN a club has only one Champion and that Champion is deactivated  
WHEN the deactivation is confirmed  
THEN the system shall flag the club as having no active Champion, for the Super Admin's awareness

**Scenario 03: Reactivate Champion — Club Still Active**  
GIVEN a previously deactivated Champion's assigned club is currently active  
WHEN the Super Admin reactivates the Champion's account  
THEN the system shall restore their login access using their existing credentials, without requiring a new account or new welcome email

**Scenario 04: Reactivate Champion — Club Is Inactive**  
GIVEN a previously deactivated Champion's assigned club is currently inactive  
WHEN the Super Admin attempts to reactivate the Champion  
THEN the system shall block reactivation and prompt the Super Admin to either reassign the Champion to an active club first, or reactivate the club before proceeding

**Scenario 05: Confirm or Reassign Club on Reactivation**  
GIVEN a Super Admin is reactivating a Champion  
WHEN the reactivation screen is displayed  
THEN the system shall show the Champion's current club assignment and allow the Super Admin to confirm it or change it before completing reactivation

**Scenario 06: Notification on Reactivation**  
GIVEN a Champion's account is reactivated  
WHEN the reactivation is confirmed  
THEN the system shall notify the Champion (e.g., via email) that their account has been reactivated and they can log in again

**Scenario 07: No Duplicate Account Created**  
GIVEN a Champion is reactivated  
WHEN the process completes  
THEN the system shall confirm the existing account is reused, and no duplicate Champion record is created

**Scenario 08: Audit Trail**  
GIVEN a Champion account is deactivated or reactivated  
WHEN the action is confirmed  
THEN the system shall log the Champion ID, action taken, the Super Admin who performed it, the timestamp, and (for reactivation) the confirmed or updated club assignment

---

**Story 8.4 — View List of All Champions**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | view a list of all Champions with their assigned club and account status |
| **So that** | I can monitor Champion coverage across all clubs |

**Description**  
Covers the Champion listing requirement in Section 5.2.7.

**Acceptance Criteria**

**Scenario 01: View Champion List**  
GIVEN Champion accounts exist in the system  
WHEN the Super Admin opens the Champion Management screen  
THEN the system shall display each Champion's name, assigned club, and status (active/inactive)

**Scenario 02: Search/Filter Champions**  
GIVEN multiple Champions exist  
WHEN the Super Admin searches by name or filters by club or status  
THEN the system shall display only matching results

---

**Epic 9: Permission Management**

**Story 9.0 — Effective Permission Resolution**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | have one clear, predictable rule for which setting applies when a user's role, group(s), and individual exception disagree on the same permission |
| **So that** | the system's behavior is never ambiguous, and I can reason about any user's actual access just by knowing this one rule |

**Description**  
This story defines the resolution engine that Stories 9.1–9.4 all depend on. It doesn't introduce a new UI — it's the rule the system applies every time it needs to answer the question "does this user currently have permission X?"

The model follows specificity-wins resolution (the pattern used in Windows NTFS/Active Directory ACL inheritance, where a permission set directly on an object overrides one inherited from a group): the most specific source that has an explicit opinion on a given permission is the one that counts. Less specific sources are not combined, added, or blended with it — they are simply not consulted once a more specific source has spoken.

This is a deliberate choice over the alternative real-world standard (AWS IAM's additive-union-with-explicit-deny model), because that model requires reasoning about "explicit deny beats any allow" as a separate concept — a harder mental model for the non-technical Super Admins and Champions this platform is built for (per the NFR Usability requirement). Specificity-wins matches what a Super Admin intuitively expects: "I set this directly on them, so that's final."

**Precedence Order (most specific to least specific):**

1. Individual Exception (Story 9.2)  
2. Group Setting (Story 9.3) — if a user belongs to multiple groups with conflicting settings for the same permission, see Scenario 04 below  
3. Role Default (Story 9.1)

**Worked Example**

| Permission  | Role Default (Champion)  | Group ("Club A Champions")  | Individual Exception  | Effective Result  | Why  |
| :---- | :---- | :---- | ----- | :---- | :---- |
| Create Announcements  | Allow  | Allow  | \- | Allow  | No override exists; role default applies  |
| Manage Events  | Deny  | Allow  | \- | Allow  | Group is more specific than role; role is not consulted  |
| Manage Gatekeepers  | Allow  | Allow  | Deny  | Deny  | Individual is most specific; role and group are not consulted  |

**Acceptance Criteria**

**Scenario 01: Individual Exception Overrides Everything**  
GIVEN a user has an individual exception set for a permission  
WHEN the system evaluates that permission for the user  
THEN the individual exception's value shall be the effective result, regardless of what the role default or any group setting says

**Scenario 02: Group Overrides Role Default (No Individual Exception)**  
GIVEN a user has no individual exception for a permission, but belongs to a group with a setting for it  
WHEN the system evaluates that permission  
THEN the group's value shall be the effective result, regardless of the role default

**Scenario 03: Role Default Applies as Fallback**  
GIVEN a user has no individual exception and belongs to no group with a setting for a given permission  
WHEN the system evaluates that permission  
THEN the role default shall be the effective result

**Scenario 04: Conflicting Group Settings (Multiple Group Membership)**  
GIVEN a user belongs to two or more groups with different settings for the same permission, and no individual exception exists  
WHEN the system evaluates that permission  
THEN the system shall apply Deny-Overrides: if any group the user belongs to denies the permission, the effective result is Deny — even if other groups the user belongs to allow it

*Rationale: this follows the XACML Deny-Overrides combining algorithm, the same principle used in NTFS/Active Directory group ACL resolution and AWS IAM policy evaluation. It is the converging standard across the major real-world implementations of this exact conflict — not a discretionary call.*

**Scenario 05: No Blending or Additive Combination**  
GIVEN multiple sources (role, group, individual) have settings for the same permission  
WHEN the system evaluates that permission  
THEN exactly one source's value shall be used as-is — sources are never merged, averaged, or additively combined

**Scenario 06: Resolution Is Deterministic and Re-Evaluated Live**  
GIVEN any underlying source changes (e.g., an individual exception is revoked)  
WHEN the system next evaluates that permission for the user  
THEN the effective result shall immediately reflect the new highest-precedence source available, with no caching of the old result

**Scenario 07: Effective Permission Visibility**  
GIVEN a Super Admin views a specific user's permissions  
WHEN the screen loads  
THEN the system shall show, for each permission, the effective result AND which layer (Individual / Group / Role) it came from — not just the final Allow/Deny — so the Super Admin can see why a user has the access they have without manually checking all three layers

**Story 9.1 — Role-Based Default Permissions** 

| As a | Super Admin |
| :---- | :---- |
| **I want to** | define and update the default permissions available to the Champion and Gatekeeper roles  |
| **So that** | the platform's baseline access model can evolve without needing a system change  |

**Description**  
Implements core RBAC (NIST/ANSI INCITS 359-2004): permissions attached to roles, users acquire them by holding that role. This is the mandatory baseline layer, every other layer below is an exception to this default, not a replacement for it. 

**Acceptance Criteria**

**Scenario 01: Update Default Role Permissions**  
GIVEN a Super Admin enables or disables a permission for the Champion role default

WHEN the change is saved

THEN all Champions without a Group or Individual exception (see 9.2, 9.3) shall inherit the updated default 

**Scenario 02: Audit Trail**

GIVEN a role default permission changes

WHEN saved

THEN the system shall log the role, permission, prior value, new value, the Super Admin who made the change, and timestamp 

---

**Story 9.2 — Individual Permission Exception** 

| As a | Super Admin |
| :---- | :---- |
| **I want to** | grant or revoke a specific permission for one named user, as an exception to their role/group settings  |
| **So that** | rare one-off access needs can be met without restructuring roles or groups  |

**Description**  
Direct-to-user grants are supported in every major IAM system but are treated as the **exception path**, not the default way to manage access, because they're the hardest thing to audit and the easiest to forget. This story exists for genuinely one-off cases; scenarios involving more than one user should use Groups (Story 9.3), not this.

**Acceptance Criteria**

**Scenario 01: Grant Individual Exception** 

GIVEN a user needs a permission their role/group doesn't grant

WHEN a Super Admin creates an individual override for that one user

THEN only that user is affected, and the override takes precedence over their group and role settings 

**Scenario 02: Individual Exceptions Are Flagged for Review**

GIVEN one or more individual exceptions exist

WHEN a Super Admin views the Permission Management screen

THEN the system shall surface a distinct, filterable list of all users with active individual exceptions, so they don't go unnoticed during periodic access review 

**Scenario 03: Audit Trail**  
GIVEN an individual exception is granted or revoked

WHEN saved

THEN the system shall log the user, permission, the Super Admin who made the change, and timestamp 

---

### **Story 9.3 — Permission Groups**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | create named groups of users and assign permissions to the group as a whole |
| **So that** |  I can grant the same access to multiple people at once, and manage it as a single ongoing setting rather than repeating the same change per person |

**Description**  
This is the standard mechanism (AWS IAM Groups, Azure AD Groups, Google Workspace Groups, Okta Groups) for "same access, multiple people" — it replaces the old idea of a one-time bulk override. Group membership is persistent: adding someone to the group grants the permission; removing them revokes it. A user may belong to multiple groups and gets the union of their groups' permissions, subject to Story 9.2 taking precedence when an individual exception exists.

**Acceptance Criteria**

**Scenario 01: Create Group and Assign Permission**  
 GIVEN a Super Admin creates a named group and adds members  
 WHEN they enable a permission at the group level  
 THEN all current members shall receive that permission

**Scenario 02: New Member Inherits Group Permissions**  
 GIVEN a group has permissions set  
 WHEN a new user is added to the group  
 THEN they shall immediately inherit those permissions

**Scenario 03: Removed Member Loses Group-Derived Permissions**  
 GIVEN a user is removed from a group  
 WHEN the removal is confirmed  
 THEN they lose any permission that came only from that group, reverting to their role default (or another group they still belong to)

**Scenario 04: Precedence Order**  
GIVEN a user may be subject to a role default, one or more groups, and an individual exception simultaneously  
WHEN the system evaluates their effective permissions  
THEN the order shall be: **Individual Exception (9.2) \> Group (9.3) \> Role Default (9.1)**

**Scenario 05: Audit Trail**  
GIVEN a group's membership or permissions change  
WHEN saved  
THEN the system shall log the group, the change (membership or permission), the Super Admin who made it, and timestamp

---

### **Story 9.4 — Temporary Role Delegation (Out-of-Office)**

### 

| As a | Super Admin or (Champion) |
| :---- | :---- |
| **I want to** | delegate my entire role's permission set to another user for a fixed period |
| **So that** | my responsibilities are covered while I'm away, without a permanent access change and without hand-picking individual permissions |

**Description**  
Follows the standard Assume-Role / delegated-administration pattern (AWS STS AssumeRole; Exchange/Outlook mailbox delegation; Salesforce Delegated Administration). Delegation is **whole-role**, not permission-by-permission — there's no established industry pattern for granular delegation, and it would add real complexity (an ambiguous precedence question against Stories 9.2/9.3) without a standard to resolve it. During the delegation window, the delegate temporarily gains the delegator's full effective permission set **in addition to** their own — it does not touch or override the delegate's existing permissions.

**Acceptance Criteria**

**Scenario 01: Create Delegation**  
GIVEN a user wants to delegate their role before going on leave  
WHEN they select a delegate and a start/end date  
THEN the system shall schedule the delegation for that period

**Scenario 02: Delegation Activates and Expires Automatically**  
GIVEN a scheduled delegation's start or end date arrives  
WHEN the system reaches that time  
THEN the delegate's access shall be automatically granted or revoked, with no manual cleanup

**Scenario 03: Delegate Retains Their Own Access**  
GIVEN a delegation is active  
WHEN the delegate's effective permissions are evaluated  
THEN they shall have the union of their own permissions and the delegator's — the delegation adds access, it does not replace or restrict the delegate's existing access

**Scenario 04: Delegator Deactivated Mid-Delegation**  
GIVEN a delegator's account is deactivated while a delegation is active  
WHEN the deactivation is processed  
THEN the delegation shall end immediately and the delegate's borrowed access shall be revoked

**Scenario 05: Audit Trail**  
GIVEN any delegation event (created, activated, expired, manually ended)  
WHEN it occurs  
THEN the system shall log the delegator, delegate, role delegated, time period, and event type with timestamp


---

**Epic 10: Certifications**

This epic replaces the single QPR certification date with a general certification system: any number of certification types, each person holding any number of certificates, digital certificates generated from editable designs, and certifications added by the holders themselves. It applies to the Super Admin portal, the Champion portal and the Gatekeeper mobile app.

The clickable prototype agreed with the stakeholders (November 2026) is the visual reference for every story below.

**Terms used in this epic**

* **Certification type**: a certification HMM recognises, for example QPR or Psychological First Aid. Nothing is built in; QPR is an ordinary type.
* **Official certificate**: a certificate of a type, added to a person by a Super Admin or by the person's Club Champion.
* **Self-reported certificate**: a certification a Gatekeeper or Champion adds themselves, from another organisation. It never counts as an official certificate.
* **Current certificate**: for each person and type, the official certificate with the latest date achieved that has not been removed.

**Open items, not part of Phase 1 until decided**

* QR code on certificates: left out until it is known how certificates will be issued.

---

**Story 10.0 — Certificate Status Rules**

| As a | Super Admin, Champion or Gatekeeper |
| :---- | :---- |
| **I want to** | see each certificate with a clear, consistent status |
| **So that** | everyone reads the same answer in every screen, report and in the mobile app |

**Description**  
Every official certificate has its own status. There is no single "certified" status per person: each certification is shown separately, with its own status. These rules are calculated in one place and used by every screen.

**Acceptance Criteria**

**Scenario 01: Valid**  
GIVEN an official certificate whose expiry date is today or later, or which has no expiry (Lifetime)  
WHEN its status is shown  
THEN it shall be shown as Valid. A certificate is still valid on its expiry date

**Scenario 02: Expiring Soon**  
GIVEN a valid certificate whose expiry date is within the next 90 days  
WHEN its status is shown  
THEN it shall be shown as Expiring Soon

**Scenario 03: Expired**  
GIVEN an official certificate whose expiry date has passed  
WHEN its status is shown  
THEN it shall be shown as Expired

**Scenario 04: Renewed**  
GIVEN a person holds two or more certificates of the same type  
WHEN their certificates are shown  
THEN only the one with the latest date achieved shall be current; older ones shall be shown as Renewed in the certification journey

**Scenario 05: Stopped by a Retired Programme**  
GIVEN a certification type was retired with the "Stop existing certificates" option (Story 10.2)  
WHEN the retirement date arrives  
THEN every certificate of that type achieved before that date shall be shown as Stopped (programme retired) and shall no longer count as valid

**Scenario 06: Removed**  
GIVEN an official certificate has been removed (Story 10.8)  
WHEN statuses are calculated  
THEN it shall never count, and the person's previous certificate of the same type, if any, shall become the current one

**Scenario 07: Deactivated People Keep Their Certificates**  
GIVEN a Champion or Gatekeeper is deactivated, manually or because their club was deactivated  
WHEN their certificates are shown  
THEN their certificates shall keep their own statuses; deactivation affects access only, not certifications

**Scenario 08: Self-Reported Certificates Are Separate**  
GIVEN a person has self-reported certificates  
WHEN official statuses, dashboards or reports are calculated  
THEN self-reported certificates shall never be included

---

**Story 10.1 — Manage Certification Types**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | create and edit the certification types HMM recognises |
| **So that** | Champions can award them and the platform can track them |

**Description**  
Certification types are listed in a new Certifications menu item. Create and edit open as pop-ups. Champions can see the list but cannot change it.

**Acceptance Criteria**

**Scenario 01: Create a Type**  
GIVEN a Super Admin opens New certification type  
WHEN they enter a name, a code, a validity (Lifetime, or a fixed number of months or years), an Offered from date and optionally a description, issuing body and Offered until date  
THEN the type shall be created as Active and the change recorded in the audit history

**Scenario 02: Unique Name and Code**  
GIVEN a name or code is already used by another type, in any combination of capitals  
WHEN the Super Admin saves  
THEN the system shall refuse and say which one is already used. Codes may contain only letters, numbers and hyphens and are stored in capitals

**Scenario 03: Code Locked Once Awarded**  
GIVEN a type has been awarded at least once  
WHEN a Super Admin edits it  
THEN the code shall be read-only

**Scenario 04: Changing Validity**  
GIVEN a Super Admin changes a type's validity  
WHEN they save  
THEN only certificates awarded afterwards shall use the new validity; each existing certificate keeps the validity it was awarded with

**Scenario 05: List of Types**  
GIVEN any Super Admin or Champion opens Certifications  
WHEN the list is shown  
THEN each type shall show its name, code, validity, offered dates and status (Active, Active · retires on a date, or Retired); Super Admins also see the digital certificate design version, the number of holders, and View and Edit actions

**Scenario 06: Type Details**  
GIVEN a Super Admin views a type  
WHEN the page opens  
THEN it shall show the type's details, its digital certificate design (Story 10.4), and a Retirement section only if a retirement date has been set

---

**Story 10.2 — Retire and Reactivate a Certification Type**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | retire a certification type, and bring it back later if needed |
| **So that** | programmes that end stop being awarded, without losing anyone's history |

**Description**  
Retiring never deletes anything. The Offered until date and the retirement date are the same thing.

**Acceptance Criteria**

**Scenario 01: Retire or Schedule a Retirement**  
GIVEN a Super Admin chooses Retire type, or sets an Offered until date  
WHEN they choose a date (today or later) and what happens to existing certificates: Keep them valid until their own expiry, or Stop them on the retirement date  
THEN the retirement shall be saved, shown in the type's Retirement section and recorded in the audit history; before the date the type shows "Active · retires on" that date

**Scenario 02: Impact Shown Before Confirming**  
GIVEN a Super Admin is choosing the retirement option  
WHEN the pop-up is open  
THEN it shall show how many people hold the type and how many valid certificates would stop

**Scenario 03: Retired Types Cannot Be Awarded**  
GIVEN a type is retired  
WHEN anyone adds or renews a certificate  
THEN the type shall not be offered

**Scenario 04: No Design Changes While Retired**  
GIVEN a type is retired  
WHEN a Super Admin views its digital certificate design  
THEN existing design versions can be viewed and issued certificates downloaded, but no design can be created or edited

**Scenario 05: Change the Retirement Option Later**  
GIVEN a type is retired  
WHEN a Super Admin changes Keep or Stop  
THEN the change shall apply to all its certificates and be recorded in the audit history

**Scenario 06: Reactivate**  
GIVEN a type is retired  
WHEN a Super Admin chooses Reactivate type and a date it is offered again from (today or later), and optionally a new Offered until date  
THEN the type shall become Active from that date, can be awarded again, and its design can be edited again

**Scenario 07: Certificates After Reactivation**  
GIVEN a type is reactivated  
WHEN its existing certificates are shown  
THEN certificates that stopped at retirement shall stay stopped and can be renewed (Story 10.7); certificates kept valid at retirement are unaffected; the certification journey shows both the retirement and the reactivation

---

**Story 10.3 — Design a Digital Certificate**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | design the digital certificate for each certification type |
| **So that** | certificates can be issued as PDFs that look the way HMM wants |

**Description**  
Each type has at most one current design, with a full version history. The design is a page (a built-in layout, or HMM's own uploaded artwork) with text boxes and images placed on it.

**Acceptance Criteria**

**Scenario 01: Start From a Layout or Own Template**  
GIVEN a Super Admin opens the designer  
WHEN they choose a built-in layout (Landscape classic, Landscape modern, Portrait) or upload their own template (a PNG or JPG of the whole A4 page, up to 5 MB, landscape or portrait)  
THEN the preview shall show that page

**Scenario 02: Every Word Is Editable**  
GIVEN the designer is open  
WHEN the Super Admin selects a text box  
THEN they can change its text, size, width, position, font, weight, italic, capital letters, alignment, colour and line style, or delete it; and they can add any number of new text boxes

**Scenario 03: Move Anything**  
GIVEN text boxes and images are on the page  
WHEN the Super Admin drags one, or focuses it and uses the arrow keys  
THEN it shall move, and its position fields update

**Scenario 04: Images**  
GIVEN the designer is open  
WHEN the Super Admin adds one or more images (PNG, JPG or SVG, up to 2 MB each) for logos, signatures, seals or photos  
THEN each can be moved, resized, replaced or deleted

**Scenario 05: Placeholders**  
GIVEN a text box contains {full_name}, {certification_name}, {date_achieved}, {expiry_date}, {certificate_number}, {club_name} or {issuing_body}  
WHEN a certificate is generated  
THEN each placeholder shall be replaced with that person's values; {expiry_date} prints "Lifetime" for a Lifetime type. The preview can show a sample person or the placeholders themselves

**Scenario 06: Sinhala and Tamil (Proposed — to confirm)**  
GIVEN a text box will contain Sinhala or Tamil text  
WHEN the Super Admin chooses a font for that text box  
THEN fonts that support Sinhala and Tamil shall be available, and the generated PDF shall show the text correctly

**Scenario 07: Save as a New Version**  
GIVEN the Super Admin has changed the design  
WHEN they save  
THEN a new version shall be created; earlier versions are never overwritten, and certificates already issued keep the version they were made with

**Scenario 08: Discard Changes**  
GIVEN the designer is open  
WHEN the Super Admin chooses Discard changes, which is always available  
THEN the design shall go back to the current saved version

**Scenario 09: Download and Print**  
GIVEN the designer or a saved version is open  
WHEN the Super Admin chooses Download PDF or Print  
THEN an A4 PDF of exactly what the preview shows shall be produced, including unsaved changes

---

**Story 10.4 — View and Edit Certificate Designs**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | see a type's designs and versions from the type itself |
| **So that** | I don't need a separate place to manage designs |

**Acceptance Criteria**

**Scenario 01: Design Section on the Type Page**  
GIVEN a Super Admin views a type that has a design  
WHEN the page opens  
THEN it shall show a preview of the current design and a list of versions with the date saved, who saved it and how many certificates were issued with each, each with View and Edit

**Scenario 02: No Design Yet**  
GIVEN a type has no design  
WHEN a Super Admin views it  
THEN it shall say so and offer Create design (only while the type is active); certificates of this type can then only be recorded as physical

**Scenario 03: View a Version**  
GIVEN a Super Admin chooses View on a version  
WHEN the pop-up opens  
THEN it shall show that version with sample data, allow switching between versions, and offer Download PDF, Print and Edit

**Scenario 04: Edit a Copy of an Older Version**  
GIVEN a Super Admin chooses Edit on an older version  
WHEN the designer opens  
THEN it shall start from a copy of that version, and saving creates a new version

---

**Story 10.5 — Add an Official Certificate to a Person**

| As a | Super Admin or Champion |
| :---- | :---- |
| **I want to** | add a certificate to a Champion's or Gatekeeper's profile |
| **So that** | their certifications are on record |

**Description**  
Super Admins can add certificates to any Champion or Gatekeeper. Champions can add them only to Gatekeepers in their own club, not to themselves or to other Champions. The old single "Certification Date" field on the Add and Edit Gatekeeper forms is replaced by this.

**Acceptance Criteria**

**Scenario 01: Add Certification**  
GIVEN a Super Admin or the person's Champion opens their profile and chooses Add certification  
WHEN they choose an active type, a date achieved, a format (Physical, Digital or Both) and optionally an attachment  
THEN the certificate shall be saved, with its expiry calculated from the type's validity and shown read-only

**Scenario 02: Date Rules**  
GIVEN a date achieved is in the future, or before the type's Offered from date  
WHEN the certificate is saved  
THEN the system shall refuse with a clear message

**Scenario 03: Attachment Rules**  
GIVEN an attachment is added  
WHEN it is not a PDF, JPG or PNG, or is larger than 10 MB  
THEN the system shall refuse it

**Scenario 04: Generate a Digital Certificate**  
GIVEN the type has a design  
WHEN the person adding the certificate chooses Generate digital certificate  
THEN an A4 PDF shall be created from the current design version, with a certificate number HMM-{CODE}-{YEAR}-{six-digit number}, numbered per type per year (for example HMM-QPR-2026-000042)

**Scenario 05: When Registering a Gatekeeper**  
GIVEN a Super Admin or Champion is registering a new Gatekeeper  
WHEN they add one or more certifications in the form (each with a type and date achieved)  
THEN each shall be saved as in Scenario 01; certifications are optional

**Scenario 06: Renewal Notice**  
GIVEN the person already holds a certificate of the chosen type  
WHEN the pop-up is open  
THEN it shall say that this renews the existing certificate and that the older one stays in the history as Renewed

**Scenario 07: Add to Several People at Once (Proposed — to confirm)**  
GIVEN a Champion has run a training session  
WHEN they choose a type and a date achieved and tick the Gatekeepers who attended  
THEN the certificate shall be added to each of them in one step, with the same rules as Scenario 01

---

**Story 10.6 — View and Edit an Issued Certificate**

| As a | Super Admin or Champion |
| :---- | :---- |
| **I want to** | view an issued certificate and correct it if needed |
| **So that** | mistakes can be fixed without removing and re-adding the certificate |

**Description**  
Same scope as Story 10.5: Super Admins for anyone, Champions for Gatekeepers in their own club.

**Acceptance Criteria**

**Scenario 01: View a Digital Certificate**  
GIVEN a certificate has a digital PDF  
WHEN a Super Admin or Champion chooses View  
THEN it shall show the certificate with the person's details, using the design version it was issued with, with Download PDF and Print

**Scenario 02: Edit**  
GIVEN a Super Admin or Champion chooses Edit on a certificate  
WHEN they change the date achieved, the format or the attachment  
THEN the expiry shall be recalculated using the validity the certificate was awarded with; the type itself cannot be changed

**Scenario 03: Re-issue or Generate the PDF**  
GIVEN the certificate has a digital PDF  
WHEN the editor chooses to re-issue it  
THEN a new PDF shall be produced with the same certificate number, using the original design version or the current one, as chosen. If it has no PDF yet and the type has a design, one can be generated with a new number

**Scenario 04: Reason Required**  
GIVEN an edit is being saved  
WHEN no reason has been entered, or nothing has changed  
THEN the system shall refuse

**Scenario 05: Recorded and Notified**  
GIVEN an edit is saved  
WHEN it completes  
THEN the certification journey shall show who changed what and why, the audit history shall record it, and the holder shall be notified with the changes and the reason

---

**Story 10.7 — Renew an Expired Certificate**

| As a | Super Admin or Champion |
| :---- | :---- |
| **I want to** | renew an expired certificate |
| **So that** | a person who has completed the renewal is valid again |

**Description**  
Only Super Admins (for anyone) and Champions (for Gatekeepers in their own club) can renew. Gatekeepers cannot, and Champions cannot renew their own certificates.

**Acceptance Criteria**

**Scenario 01: Where Renew Appears**  
GIVEN a person's current certificate of a type is Expired, or Stopped after its type was reactivated, and the type is active  
WHEN a Super Admin or their Champion views the Gatekeepers list, the Champions list or the person's profile  
THEN a Renew button shall appear next to that certificate

**Scenario 02: Renew**  
GIVEN Renew is chosen  
WHEN the person renewing enters a date achieved  
THEN a new certificate of the same type shall be added with the rules of Story 10.5; the type cannot be changed; the old certificate stays in the journey as Renewed

**Scenario 03: Date Must Follow the Previous Certificate**  
GIVEN the date achieved is on or before the previous certificate's date  
WHEN the renewal is saved  
THEN the system shall refuse

**Scenario 04: Not Renewable**  
GIVEN a certificate is still valid or expiring soon, has been removed, or its type is retired  
WHEN it is shown  
THEN no Renew button shall appear

**Scenario 05: Recorded and Notified**  
GIVEN a renewal is saved  
WHEN it completes  
THEN the holder shall be notified with the new expiry date, and the audit history shall record it

---

**Story 10.8 — Remove an Official Certificate**

| As a | Super Admin or Champion |
| :---- | :---- |
| **I want to** | remove an official certificate that should not be on someone's profile |
| **So that** | records stay accurate |

**Description**  
Same scope as Story 10.5. Removing never deletes: the certificate is hidden from current certifications but kept in the journey and audit history.

**Acceptance Criteria**

**Scenario 01: Valid Reason Required**  
GIVEN a Super Admin or Champion chooses Remove on a certificate, from the profile or the journey  
WHEN they confirm  
THEN they must choose a reason (Added by mistake, Added to the wrong person, Training was not completed, Certificate could not be verified, Duplicate record, or Other) and write an explanation of at least 10 characters; otherwise the system shall refuse

**Scenario 02: Impact Shown**  
GIVEN the remove pop-up is open  
WHEN it is shown  
THEN it shall say that the certificate stops counting straight away, and whether a previous certificate of the same type becomes the current one

**Scenario 03: After Removal**  
GIVEN a certificate is removed  
WHEN the person's certificates are shown  
THEN the status rules of Story 10.0 Scenario 06 shall apply, and the journey shows who removed it, when and why

**Scenario 04: Notified**  
GIVEN a certificate is removed  
WHEN the removal completes  
THEN the holder shall be notified with the reason and told to contact their Club Champion if they think it is a mistake; if someone other than their Champion removed it, the Champion shall be notified too

**Scenario 05: Undo a Removal (Proposed — to confirm)**  
GIVEN a certificate was removed by mistake  
WHEN a Super Admin chooses Undo removal in the person's journey  
THEN the certificate shall be restored, the holder and their Champion notified, and the audit history shall record it. Only Super Admins can undo a removal

---

**Story 10.9 — Add a Certification I Hold (Self-Reported)**

| As a | Gatekeeper or Champion |
| :---- | :---- |
| **I want to** | add certifications I hold from other organisations |
| **So that** | my wider training is on record |

**Description**  
Gatekeepers add these in the mobile app; Champions add them from My Profile in the Champion portal.

**Acceptance Criteria**

**Scenario 01: Add**  
GIVEN a Gatekeeper or Champion chooses Add a certification  
WHEN they enter a certification name, issuing organisation, date achieved, an expiry date or No expiry, and optionally an attachment (PDF, JPG or PNG, up to 10 MB; a photo on the phone)  
THEN it shall be saved as Self-reported – not verified

**Scenario 02: Rules**  
GIVEN a required field is missing, the date achieved is in the future, or the expiry date is before the date achieved  
WHEN it is saved  
THEN the system shall refuse with a clear message

**Scenario 03: Withdraw**  
GIVEN a self-reported certificate has not been reviewed yet  
WHEN its holder chooses Withdraw  
THEN it shall be shown as Withdrawn by holder, kept in their own history only, and hidden from others

**Scenario 04: Never Official**  
GIVEN a self-reported certificate is verified  
WHEN statuses are calculated  
THEN it still shall not count as an official certificate (Story 10.0 Scenario 08)

---

**Story 10.10 — Review Self-Reported Certifications**

| As a | Super Admin or Champion |
| :---- | :---- |
| **I want to** | review certifications people have added themselves |
| **So that** | only genuine certifications are shown as verified |

**Description**  
Super Admins review everyone's self-reported certifications, including Champions'. Champions review only those of Gatekeepers in their own club.

**Acceptance Criteria**

**Scenario 01: Review Queue**  
GIVEN a Super Admin or Champion opens Certifications → Reviews  
WHEN the queue is shown  
THEN it shall list the self-reported certifications in their scope with the person, certification, organisation, dates and attachment, filterable by Waiting for review, Verified, Removed or Everything; the tab shows how many are waiting

**Scenario 02: Verify**  
GIVEN a reviewer chooses Verify  
WHEN it completes  
THEN it shall be shown as Verified by the reviewer, with their role and the date, and the holder notified

**Scenario 03: Remove**  
GIVEN a reviewer chooses Remove  
WHEN they confirm  
THEN they must choose a reason (Attachment doesn't show a completed certificate, Details don't match the attachment, Not a recognised certification, Already recorded as an official certification, or Other) and write an explanation of at least 10 characters; the holder shall be notified with the reason and told they can add it again

---

**Story 10.11 — Certification Journey**

| As a | Super Admin, Champion or Gatekeeper |
| :---- | :---- |
| **I want to** | see the full history of a person's certifications |
| **So that** | it is clear what they hold and what changed over time |

**Acceptance Criteria**

**Scenario 01: Contents**  
GIVEN a person's certification journey is opened (on their portal profile, or View certification journey in the mobile app)  
WHEN it is shown  
THEN it shall list, newest first, every official certificate with its status, dates, format, who added it and its certificate number and design version; every self-reported certificate with its review outcome; and every renewal, expiry, edit (with reason), removal (with reason), undo, programme retirement and programme reactivation

**Scenario 02: Migrated Certificates**  
GIVEN a certificate was created from the old QPR certification date (Story 10.17)  
WHEN it is shown  
THEN it shall be marked as migrated

**Scenario 03: Actions in the Journey**  
GIVEN a Super Admin or the person's Champion views the journey  
WHEN a certificate is shown  
THEN View certificate, Edit and Remove shall be available, with the same rules as Stories 10.6 and 10.8

---

**Story 10.12 — Certifications in Lists and Dashboards**

| As a | Super Admin or Champion |
| :---- | :---- |
| **I want to** | see each person's certifications in lists and dashboards |
| **So that** | I can see who is certified in what at a glance |

**Acceptance Criteria**

**Scenario 01: Gatekeepers and Champions Lists**  
GIVEN a Super Admin opens the Gatekeepers or Champions list, or a Champion opens their Gatekeepers list  
WHEN it is shown  
THEN each person shall show every current certificate with its own status and expiry, or "No certifications"; the list can be filtered by certification (or No certifications) and by status (Valid, Expiring soon, Expired)

**Scenario 02: Profile**  
GIVEN a person's profile is opened  
WHEN it is shown  
THEN it shall list their current certificates with status, dates achieved and expiry, certificate number and actions (View, Renew, Edit, Remove, as permitted), followed by the certification journey

**Scenario 03: Dashboard Figures**  
GIVEN the dashboard is opened  
WHEN certification figures are shown  
THEN they shall be per certification type (valid, expiring in 90 days, expired, holders), plus the number of people with no certifications; a Champion's dashboard covers their club's Gatekeepers only

**Scenario 04: Existing QPR Displays (Proposed — to confirm)**  
GIVEN the existing screens that show one QPR status per person (Super Admin dashboard QPR Certified widget, Champion dashboard, QPR badges in lists, mobile Home QPR card)  
WHEN they are shown  
THEN they shall read the person's current QPR certificate, using the status rules of Story 10.0

---

**Story 10.13 — My Certifications in the Mobile App**

| As a | Gatekeeper |
| :---- | :---- |
| **I want to** | see my certifications in the app |
| **So that** | I know what I hold and when it expires |

**Description**  
Follows the existing app's screens and styles: the Home certification card, the Profile menu and the existing certificate screen.

**Acceptance Criteria**

**Scenario 01: Where to Find It**  
GIVEN a Gatekeeper is signed in  
WHEN they open Home or Profile  
THEN Home shall show a My Certifications card (how many are active and the next expiry), and the Profile menu shall start with My certifications; both open the same screen

**Scenario 02: Two Sections**  
GIVEN My certifications is open  
WHEN it is shown  
THEN official certificates and certifications added by the Gatekeeper shall be in two separate sections (Official, and Added by you), each item with its status; removed items stay at the end of their section, greyed, with the reason when opened. The screen ends with Add a certification and View certification journey

**Scenario 03: Certificate Details**  
GIVEN the Gatekeeper opens an official certificate  
WHEN it is shown  
THEN it shall show the type, status, dates, issuing body, format and certificate number, with Download certificate when a digital PDF exists

**Scenario 04: Expired**  
GIVEN the certificate is expired  
WHEN it is opened  
THEN the app shall explain that after the renewal training their Club Champion records the renewal; the Gatekeeper cannot renew it themselves

**Scenario 05: Removed**  
GIVEN the certificate was removed  
WHEN it is opened  
THEN the app shall show who removed it, when and why, that it no longer counts, and to contact their Club Champion if they think it is a mistake

---

**Story 10.14 — Certification Notifications**

| As a | Super Admin, Champion or Gatekeeper |
| :---- | :---- |
| **I want to** | be told when something changes on certifications that concern me |
| **So that** | I don't have to check manually |

**Description**  
Notifications are shown in the bell in the portals and in the Alerts tab in the mobile app. The portal bell currently shows a fixed red dot; it becomes a real unread count.

**Acceptance Criteria**

**Scenario 01: Holder Notifications**  
GIVEN a certificate is edited, renewed or removed, a removal is undone, or a self-reported certificate is verified or removed  
WHEN the change is saved  
THEN the holder shall be notified with who made the change and, where given, the reason

**Scenario 02: Champion Notifications**  
GIVEN a certificate of a Gatekeeper is removed, or a removal is undone, by someone other than their Champion  
WHEN the change is saved  
THEN the Gatekeeper's Champion shall be notified with the reason

**Scenario 03: Unread Count**  
GIVEN a user has unread notifications  
WHEN they open the bell or the Alerts tab  
THEN the unread count shall be shown, and opening them marks them read

**Scenario 04: Expiry Reminders (Proposed — to confirm)**  
GIVEN an official certificate expires in 90 days, and again in 30 days  
WHEN that day arrives  
THEN the holder and, for a Gatekeeper, their Champion shall get an in-app reminder

---

**Story 10.15 — Certification Permissions**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | control who can do what with certifications |
| **So that** | access follows the platform's permission system (Epic 9) |

**Description**  
Fourteen new permission keys, shown in a Certifications card on the Permissions screen. They are enforced on the server and in the database, not only hidden in the screens.

| Key | Super Admin | Champion default | Gatekeeper default |
| :---- | :---- | :---- | :---- |
| certifications.types.view | Yes | Yes | No |
| certifications.types.manage | Yes | Super Admins only | No |
| certifications.types.retire | Yes | Super Admins only | No |
| certifications.design.manage | Yes | Super Admins only | No |
| certifications.award | Yes | Yes (own club's Gatekeepers) | No |
| certifications.official.edit | Yes | Yes (own club's Gatekeepers) | No |
| certifications.official.remove | Yes | Yes (own club's Gatekeepers) | No |
| certifications.attachments.manage | Yes | Yes (own club's Gatekeepers) | No |
| certifications.digital.generate | Yes | Yes (own club's Gatekeepers) | No |
| certifications.self.manage | No | Yes | Yes |
| certifications.review.view | Yes | Yes (own club's Gatekeepers) | No |
| certifications.review.verify | Yes | Yes (own club's Gatekeepers) | No |
| certifications.review.remove | Yes | Yes (own club's Gatekeepers) | No |
| certifications.journey.view | Yes | Yes (own club's Gatekeepers) | Own only |

**Acceptance Criteria**

**Scenario 01: Enforced Everywhere**  
GIVEN a user does not have a certification permission  
WHEN they try the action, through the screens or directly against the server or database  
THEN it shall be refused

**Scenario 02: Super Admin–Only Keys**  
GIVEN a key is marked Super Admins only  
WHEN anyone tries to give it to a Champion through role defaults, individual exceptions, permission groups or delegation  
THEN the system shall refuse, including at the database level

**Scenario 03: Club Scope**  
GIVEN a Champion has a certification permission  
WHEN they act on a person  
THEN it shall apply only to Gatekeepers in their own club, never to themselves or other Champions

---

**Story 10.16 — Certifications Audit History**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | review every change made to certifications |
| **So that** | I can see who did what, when and why |

**Acceptance Criteria**

**Scenario 01: What Is Recorded**  
GIVEN any of these happen: a certificate added, renewed, edited, removed or a removal undone; a self-reported certificate added, verified, removed or withdrawn; a type created, edited, retired or reactivated; a design saved  
WHEN it happens  
THEN the audit history shall record the date, the action, the person or type, the details including any reason, and who did it

**Scenario 02: Audit History Screen**  
GIVEN a Super Admin opens Certifications → Audit history  
WHEN it is shown  
THEN entries shall be listed newest first and can be filtered by action and searched by name, certification or reason

**Scenario 03: Super Admins Only**  
GIVEN a Champion or Gatekeeper  
WHEN they use the platform  
THEN the audit history shall not be available to them

**Scenario 04: Kept Permanently**  
GIVEN audit entries exist  
WHEN any certificate, type or design changes or is removed  
THEN existing audit entries shall never be changed or deleted

---

**Story 10.17 — Move Existing QPR Certification Dates**

| As a | Super Admin |
| :---- | :---- |
| **I want to** | keep every existing QPR certification when the new system goes live |
| **So that** | no one loses their certification and today's screens keep working |

**Acceptance Criteria**

**Scenario 01: QPR Type Created**  
GIVEN the new system goes live  
WHEN the data is moved  
THEN a QPR certification type shall be created with 3-year validity, marked as created from existing data

**Scenario 02: Certificates Created**  
GIVEN a Champion or Gatekeeper has a QPR certification date  
WHEN the data is moved  
THEN they shall get a QPR certificate with that date achieved and the same expiry they have today, marked as migrated; people without a date get none

**Scenario 03: Same Figures on Day One**  
GIVEN the data has been moved  
WHEN the dashboards and lists are compared with before  
THEN the number of people with a valid QPR shall be the same as before

**Scenario 04: Old Date Fields Kept Until the Mobile App Is Updated**  
GIVEN the mobile app still reads the old QPR date fields  
WHEN a person's current QPR certificate changes (added, renewed, edited, removed)  
THEN the old fields shall be updated automatically to match it; they are removed once the mobile app no longer uses them
