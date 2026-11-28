// Fix O: the header search box (components/dashboard-client-layout.tsx) is not
// wired to any search yet, so typing in it did nothing. It stays hidden for
// Super Admin and Champion until search is built. The markup is kept in the
// layout: set this to true to bring it back.
export const SHOW_HEADER_SEARCH = false
