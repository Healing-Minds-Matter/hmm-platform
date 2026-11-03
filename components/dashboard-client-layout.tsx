'use client'

import { useState, useCallback, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useSessionTimeout } from '@/hooks/use-session-timeout'
import { SessionTimeoutModal } from '@/components/session-timeout-modal'
import { logoutAction, sessionTimeoutLogoutAction } from '@/actions/auth'

const TIMEOUT_MS = 20 * 60 * 1000
const WARNING_MS =  2 * 60 * 1000

interface Profile {
  full_name: string
  role: 'super_admin' | 'champion' | 'gatekeeper'
}

// ── Sidebar icons (from design/Icons/) ────────────────────────────────────────

function IconDashboard({ active }: { active: boolean }) {
  const c = active ? '#022C51' : '#64748B'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M11.6667 7.5C11.4306 7.5 11.2328 7.42 11.0733 7.26C10.9139 7.1 10.8339 6.90222 10.8333 6.66667V3.33333C10.8333 3.09722 10.9133 2.89944 11.0733 2.74C11.2333 2.58056 11.4311 2.50056 11.6667 2.5H16.6667C16.9028 2.5 17.1008 2.58 17.2608 2.74C17.4208 2.9 17.5006 3.09778 17.5 3.33333V6.66667C17.5 6.90278 17.42 7.10083 17.26 7.26083C17.1 7.42083 16.9022 7.50056 16.6667 7.5H11.6667ZM3.33333 10.8333C3.09722 10.8333 2.89944 10.7533 2.74 10.5933C2.58056 10.4333 2.50056 10.2356 2.5 10V3.33333C2.5 3.09722 2.58 2.89944 2.74 2.74C2.9 2.58056 3.09778 2.50056 3.33333 2.5H8.33333C8.56944 2.5 8.7675 2.58 8.9275 2.74C9.0875 2.9 9.16722 3.09778 9.16667 3.33333V10C9.16667 10.2361 9.08667 10.4342 8.92667 10.5942C8.76667 10.7542 8.56889 10.8339 8.33333 10.8333H3.33333ZM11.6667 17.5C11.4306 17.5 11.2328 17.42 11.0733 17.26C10.9139 17.1 10.8339 16.9022 10.8333 16.6667V10C10.8333 9.76389 10.9133 9.56611 11.0733 9.40667C11.2333 9.24722 11.4311 9.16722 11.6667 9.16667H16.6667C16.9028 9.16667 17.1008 9.24667 17.2608 9.40667C17.4208 9.56667 17.5006 9.76444 17.5 10V16.6667C17.5 16.9028 17.42 17.1008 17.26 17.2608C17.1 17.4208 16.9022 17.5006 16.6667 17.5H11.6667ZM3.33333 17.5C3.09722 17.5 2.89944 17.42 2.74 17.26C2.58056 17.1 2.50056 16.9022 2.5 16.6667V13.3333C2.5 13.0972 2.58 12.8994 2.74 12.74C2.9 12.5806 3.09778 12.5006 3.33333 12.5H8.33333C8.56944 12.5 8.7675 12.58 8.9275 12.74C9.0875 12.9 9.16722 13.0978 9.16667 13.3333V16.6667C9.16667 16.9028 9.08667 17.1008 8.92667 17.2608C8.76667 17.4208 8.56889 17.5006 8.33333 17.5H3.33333Z" fill={c}/>
    </svg>
  )
}

function IconClubs({ active }: { active: boolean }) {
  const c = active ? '#022C51' : '#64748B'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M15.7732 8.33317V11.6665M11.4432 15.8332L12.8866 14.9998L14.3299 14.1665M8.55656 15.8332L7.11281 14.9998L5.66948 14.1665M4.22656 8.33317V11.6665M5.66948 5.83317L7.11323 4.99984L8.55656 4.1665M11.4432 4.1665L12.8866 4.99984L14.3299 5.83317" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 18.3332C10.442 18.3332 10.866 18.1576 11.1785 17.845C11.4911 17.5325 11.6667 17.1085 11.6667 16.6665C11.6667 16.2245 11.4911 15.8006 11.1785 15.488C10.866 15.1754 10.442 14.9998 10 14.9998C9.55797 14.9998 9.13405 15.1754 8.82149 15.488C8.50893 15.8006 8.33333 16.2245 8.33333 16.6665C8.33333 17.1085 8.50893 17.5325 8.82149 17.845C9.13405 18.1576 9.55797 18.3332 10 18.3332ZM10 4.99984C10.442 4.99984 10.866 4.82424 11.1785 4.51168C11.4911 4.19912 11.6667 3.7752 11.6667 3.33317C11.6667 2.89114 11.4911 2.46722 11.1785 2.15466C10.866 1.8421 10.442 1.6665 10 1.6665C9.55797 1.6665 9.13405 1.8421 8.82149 2.15466C8.50893 2.46722 8.33333 2.89114 8.33333 3.33317C8.33333 3.7752 8.50893 4.19912 8.82149 4.51168C9.13405 4.82424 9.55797 4.99984 10 4.99984ZM10 11.6665C10.442 11.6665 10.866 11.4909 11.1785 11.1783C11.4911 10.8658 11.6667 10.4419 11.6667 9.99984C11.6667 9.55781 11.4911 9.13389 11.1785 8.82133C10.866 8.50877 10.442 8.33317 10 8.33317C9.55797 8.33317 9.13405 8.50877 8.82149 8.82133C8.50893 9.13389 8.33333 9.55781 8.33333 9.99984C8.33333 10.4419 8.50893 10.8658 8.82149 11.1783C9.13405 11.4909 9.55797 11.6665 10 11.6665ZM15.8333 8.33317C16.2754 8.33317 16.6993 8.15758 17.0118 7.84501C17.3244 7.53245 17.5 7.10853 17.5 6.6665C17.5 6.22448 17.3244 5.80055 17.0118 5.48799C16.6993 5.17543 16.2754 4.99984 15.8333 4.99984C15.3913 4.99984 14.9674 5.17543 14.6548 5.48799C14.3423 5.80055 14.1667 6.22448 14.1667 6.6665C14.1667 7.10853 14.3423 7.53245 14.6548 7.84501C14.9674 8.15758 15.3913 8.33317 15.8333 8.33317ZM15.8333 14.9998C16.2754 14.9998 16.6993 14.8242 17.0118 14.5117C17.3244 14.1991 17.5 13.7752 17.5 13.3332C17.5 12.8911 17.3244 12.4672 17.0118 12.1547C16.6993 11.8421 16.2754 11.6665 15.8333 11.6665C15.3913 11.6665 14.9674 11.8421 14.6548 12.1547C14.3423 12.4672 14.1667 12.8911 14.1667 13.3332C14.1667 13.7752 14.3423 14.1991 14.6548 14.5117C14.9674 14.8242 15.3913 14.9998 15.8333 14.9998ZM4.16667 8.33317C4.60869 8.33317 5.03262 8.15758 5.34518 7.84501C5.65774 7.53245 5.83333 7.10853 5.83333 6.6665C5.83333 6.22448 5.65774 5.80055 5.34518 5.48799C5.03262 5.17543 4.60869 4.99984 4.16667 4.99984C3.72464 4.99984 3.30072 5.17543 2.98816 5.48799C2.67559 5.80055 2.5 6.22448 2.5 6.6665C2.5 7.10853 2.67559 7.53245 2.98816 7.84501C3.30072 8.15758 3.72464 8.33317 4.16667 8.33317ZM4.16667 14.9998C4.60869 14.9998 5.03262 14.8242 5.34518 14.5117C5.65774 14.1991 5.83333 13.7752 5.83333 13.3332C5.83333 12.8911 5.65774 12.4672 5.34518 12.1547C5.03262 11.8421 4.60869 11.6665 4.16667 11.6665C3.72464 11.6665 3.30072 11.8421 2.98816 12.1547C2.67559 12.4672 2.5 12.8911 2.5 13.3332C2.5 13.7752 2.67559 14.1991 2.98816 14.5117C3.30072 14.8242 3.72464 14.9998 4.16667 14.9998Z" fill={c} stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconChampions({ active }: { active: boolean }) {
  const c = active ? '#022C51' : '#64748B'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 0.833496L2.5 4.16683V9.16683C2.5 13.7918 5.7 18.1168 10 19.1668C14.3 18.1168 17.5 13.7918 17.5 9.16683V4.16683L10 0.833496ZM10 4.0835C10.4945 4.0835 10.9778 4.23012 11.3889 4.50482C11.8 4.77953 12.1205 5.16997 12.3097 5.62679C12.4989 6.0836 12.5484 6.58627 12.452 7.07122C12.3555 7.55617 12.1174 8.00163 11.7678 8.35126C11.4181 8.70089 10.9727 8.939 10.4877 9.03546C10.0028 9.13192 9.50011 9.08241 9.04329 8.8932C8.58648 8.70398 8.19603 8.38354 7.92133 7.97242C7.64662 7.5613 7.5 7.07795 7.5 6.5835C7.5 5.92045 7.76339 5.28457 8.23223 4.81573C8.70107 4.34689 9.33696 4.0835 10 4.0835ZM10 10.6668C11.6667 10.6668 15 11.5752 15 13.2335C14.4527 14.0586 13.7097 14.7354 12.8373 15.2036C11.9649 15.6718 10.9901 15.9169 10 15.9169C9.00988 15.9169 8.03515 15.6718 7.16273 15.2036C6.2903 14.7354 5.54731 14.0586 5 13.2335C5 11.5752 8.33333 10.6668 10 10.6668Z" fill={c}/>
    </svg>
  )
}

function IconGatekeepers({ active }: { active: boolean }) {
  const c = active ? '#022C51' : '#64748B'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M6.66699 9.16667C7.55105 9.16667 8.39889 8.81548 9.02401 8.19036C9.64914 7.56523 10.0003 6.71739 10.0003 5.83333C10.0003 4.94928 9.64914 4.10143 9.02401 3.47631C8.39889 2.85119 7.55105 2.5 6.66699 2.5C5.78294 2.5 4.93509 2.85119 4.30997 3.47631C3.68485 4.10143 3.33366 4.94928 3.33366 5.83333C3.33366 6.71739 3.68485 7.56523 4.30997 8.19036C4.93509 8.81548 5.78294 9.16667 6.66699 9.16667ZM14.167 9.16667C14.83 9.16667 15.4659 8.90327 15.9348 8.43443C16.4036 7.96559 16.667 7.32971 16.667 6.66667C16.667 6.00363 16.4036 5.36774 15.9348 4.8989C15.4659 4.43006 14.83 4.16667 14.167 4.16667C13.504 4.16667 12.8681 4.43006 12.3992 4.8989C11.9304 5.36774 11.667 6.00363 11.667 6.66667C11.667 7.32971 11.9304 7.96559 12.3992 8.43443C12.8681 8.90327 13.504 9.16667 14.167 9.16667ZM3.54199 10.8333C3.04471 10.8333 2.5678 11.0309 2.21617 11.3825C1.86454 11.7341 1.66699 12.2111 1.66699 12.7083V12.9167C1.66699 12.9167 1.66699 16.6667 6.66699 16.6667C7.82533 16.6667 8.71533 16.4658 9.39866 16.1558C9.24453 15.6459 9.16647 15.116 9.16699 14.5833C9.16699 13.2025 9.68366 11.9425 10.5337 10.9858C10.2997 10.8839 10.0471 10.832 9.79199 10.8333H3.54199ZM19.167 14.5833C19.167 15.7989 18.6841 16.9647 17.8246 17.8242C16.965 18.6838 15.7992 19.1667 14.5837 19.1667C13.3681 19.1667 12.2023 18.6838 11.3428 17.8242C10.4832 16.9647 10.0003 15.7989 10.0003 14.5833C10.0003 13.3678 10.4832 12.202 11.3428 11.3424C12.2023 10.4829 13.3681 10 14.5837 10C15.7992 10 16.965 10.4829 17.8246 11.3424C18.6841 12.202 19.167 13.3678 19.167 14.5833ZM15.0462 12.0167C15.0176 11.9161 14.9569 11.8275 14.8735 11.7645C14.79 11.7014 14.6883 11.6673 14.5837 11.6673C14.4791 11.6673 14.3773 11.7014 14.2939 11.7645C14.2104 11.8275 14.1498 11.9161 14.1212 12.0167L13.657 13.5067H12.1545C11.6828 13.5067 11.4878 14.135 11.8687 14.4233L13.0837 15.3442L12.6195 16.8333C12.4737 17.3008 12.987 17.69 13.3687 17.4008L14.5837 16.4808L15.7987 17.4008C16.1803 17.69 16.6937 17.3008 16.5478 16.8342L16.0837 15.3442L17.2987 14.4242C17.6803 14.135 17.4845 13.5067 17.0128 13.5067H15.5103L15.0462 12.0167Z" fill={c}/>
    </svg>
  )
}

function IconCertifications({ active }: { active: boolean }) {
  const c = active ? '#022C51' : '#64748B'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="7.5" r="5" stroke={c} strokeWidth="1.8" />
      <path d="M7.2 11.6 6.2 18l3.8-1.9 3.8 1.9-1-6.4" stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function IconResources({ active }: { active: boolean }) {
  const c = active ? '#022C51' : '#64748B'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M15.8337 17.5H4.16699C3.22866 17.5 2.56199 17.0908 2.15699 16.5283C1.84204 16.0806 1.67111 15.5474 1.66699 15V5C1.66699 4.33696 1.93038 3.70107 2.39923 3.23223C2.86807 2.76339 3.50395 2.5 4.16699 2.5H12.5003C13.1634 2.5 13.7993 2.76339 14.2681 3.23223C14.7369 3.70107 15.0003 4.33696 15.0003 5V9.16667H17.5003C17.7213 9.16667 17.9333 9.25446 18.0896 9.41074C18.2459 9.56702 18.3337 9.77899 18.3337 10V15C18.3337 15.4108 18.217 16.0092 17.8437 16.5283C17.4378 17.0917 16.7712 17.5 15.8337 17.5ZM16.667 11.6667C16.667 11.4457 16.5792 11.2337 16.4229 11.0774C16.2666 10.9211 16.0547 10.8333 15.8337 10.8333C15.6126 10.8333 15.4007 10.9211 15.2444 11.0774C15.0881 11.2337 15.0003 11.4457 15.0003 11.6667V15C15.0003 15.221 15.0881 15.433 15.2444 15.5893C15.4007 15.7455 15.6126 15.8333 15.8337 15.8333C16.0547 15.8333 16.2666 15.7455 16.4229 15.5893C16.5792 15.433 16.667 15.221 16.667 15V11.6667Z" fill={c}/>
    </svg>
  )
}

function IconAnnouncements({ active }: { active: boolean }) {
  const c = active ? '#022C51' : '#64748B'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M10.6253 0.208496C10.4043 0.208496 10.1924 0.296293 10.0361 0.452574C9.87979 0.608854 9.79199 0.820816 9.79199 1.04183V2.29183C9.79199 2.51284 9.87979 2.7248 10.0361 2.88109C10.1924 3.03737 10.4043 3.12516 10.6253 3.12516C10.8463 3.12516 11.0583 3.03737 11.2146 2.88109C11.3709 2.7248 11.4587 2.51284 11.4587 2.29183V1.04183C11.4587 0.820816 11.3709 0.608854 11.2146 0.452574C11.0583 0.296293 10.8463 0.208496 10.6253 0.208496ZM3.54199 8.9585C3.32098 8.9585 3.10902 8.8707 2.95274 8.71442C2.79646 8.55814 2.70866 8.34618 2.70866 8.12516C2.70866 7.90415 2.79646 7.69219 2.95274 7.53591C3.10902 7.37963 3.32098 7.29183 3.54199 7.29183H4.79199C5.01301 7.29183 5.22497 7.37963 5.38125 7.53591C5.53753 7.69219 5.62533 7.90415 5.62533 8.12516C5.62533 8.34618 5.53753 8.55814 5.38125 8.71442C5.22497 8.8707 5.01301 8.9585 4.79199 8.9585H3.54199ZM17.7087 8.9585C17.9297 8.9585 18.1416 8.8707 18.2979 8.71442C18.4542 8.55814 18.542 8.34618 18.542 8.12516C18.542 7.90415 18.4542 7.69219 18.2979 7.53591C18.1416 7.37963 17.9297 7.29183 17.7087 7.29183H16.4587C16.2376 7.29183 16.0257 7.37963 15.8694 7.53591C15.7131 7.69219 15.6253 7.90415 15.6253 8.12516C15.6253 8.34618 15.7131 8.55814 15.8694 8.71442C16.0257 8.8707 16.2376 8.9585 16.4587 8.9585H17.7087ZM5.02699 3.70641C4.87074 3.5501 4.78298 3.33812 4.78302 3.1171C4.78305 2.89608 4.87089 2.68413 5.0272 2.52787C5.18352 2.37161 5.3955 2.28385 5.61652 2.28389C5.83754 2.28393 6.04949 2.37177 6.20574 2.52808L7.08949 3.41141C7.16692 3.48878 7.22835 3.58065 7.27027 3.68176C7.31219 3.78287 7.33379 3.89124 7.33383 4.0007C7.33387 4.11016 7.31235 4.21855 7.2705 4.31969C7.22864 4.42083 7.16728 4.51274 7.08991 4.59016C7.01254 4.66759 6.92068 4.72902 6.81957 4.77094C6.71846 4.81286 6.61008 4.83446 6.50062 4.8345C6.39117 4.83454 6.28277 4.81302 6.18163 4.77116C6.08049 4.72931 5.98859 4.66795 5.91116 4.59058L5.02699 3.70641ZM16.2228 2.52808C16.3791 2.68435 16.4668 2.89628 16.4668 3.11725C16.4668 3.33822 16.3791 3.55014 16.2228 3.70641L15.3387 4.59016C15.2618 4.66975 15.1698 4.73324 15.0682 4.77691C14.9665 4.82059 14.8571 4.84358 14.7465 4.84454C14.6358 4.8455 14.5261 4.82441 14.4237 4.78251C14.3213 4.74061 14.2282 4.67874 14.15 4.60049C14.0718 4.52225 14.0099 4.4292 13.968 4.32679C13.9261 4.22438 13.905 4.11464 13.906 4.00399C13.9069 3.89335 13.9299 3.784 13.9736 3.68233C14.0173 3.58066 14.0807 3.4887 14.1603 3.41183L15.0441 2.52808C15.1215 2.45066 15.2133 2.38925 15.3145 2.34735C15.4156 2.30545 15.524 2.28388 15.6335 2.28388C15.7429 2.28388 15.8513 2.30545 15.9524 2.34735C16.0536 2.38925 16.1454 2.45066 16.2228 2.52808ZM10.4374 4.1835C10.5597 4.07168 10.7215 4.01303 10.8871 4.02045C11.0526 4.02788 11.2085 4.10076 11.3203 4.22308L11.3216 4.22433L11.3228 4.226L11.327 4.23016L11.3395 4.24433L11.3812 4.29308C11.4173 4.33475 11.4684 4.39683 11.5345 4.47933C11.6674 4.646 11.8616 4.89933 12.117 5.26016C12.6274 5.981 13.3845 7.13141 14.3862 8.86683C15.3882 10.6018 16.0057 11.8322 16.3749 12.6356C16.5117 12.9301 16.6401 13.2284 16.7599 13.5302C16.7971 13.6249 16.8324 13.7203 16.8657 13.8164L16.8716 13.8343L16.8737 13.8402L16.8745 13.8431V13.8439C16.9225 14.0004 16.9073 14.1695 16.832 14.3148C16.7567 14.4602 16.6274 14.5702 16.4719 14.6212C16.3163 14.6723 16.147 14.6602 16.0002 14.5877C15.8534 14.5152 15.741 14.388 15.687 14.2335C15.1682 14.4077 14.6412 14.5793 14.1112 14.7472C13.9453 14.3433 13.7707 13.9431 13.5874 13.5468C13.0741 12.4404 12.5114 11.3575 11.9012 10.3014C11.292 9.24492 10.6358 8.21625 9.93449 7.2185C9.68315 6.86206 9.42406 6.51114 9.15741 6.166C9.56783 5.791 9.97991 5.42016 10.3903 5.05808C10.282 4.93521 10.2262 4.77473 10.2351 4.61116C10.2439 4.4476 10.3165 4.29403 10.4374 4.1835ZM12.8582 14.9877C12.8771 15.0318 12.8956 15.076 12.9137 15.1202C12.0637 15.3806 11.2178 15.6302 10.4003 15.8643L10.5157 16.2943C10.7043 16.9979 10.6056 17.7475 10.2414 18.3783C9.87725 19.0091 9.27741 19.4693 8.57387 19.6579C7.87033 19.8464 7.12071 19.7477 6.48992 19.3835C5.85914 19.0194 5.39885 18.4195 5.21033 17.716L5.09949 17.3027C4.69116 17.4068 4.34116 17.4956 4.062 17.5652C3.37491 17.7368 2.62658 17.5052 2.18574 16.906C2.02741 16.6902 1.85033 16.4352 1.70783 16.1877C1.5661 15.9372 1.43813 15.6792 1.32449 15.4147C1.02616 14.7335 1.19949 13.9693 1.69199 13.4602C2.77949 12.3352 5.39699 9.66183 8.23533 7.01683L8.32158 7.12933C8.46116 7.3135 8.66408 7.58683 8.91283 7.93933C9.59238 8.90621 10.2283 9.90305 10.8187 10.9268C11.41 11.95 11.9553 12.9991 12.4528 14.071C12.6341 14.4627 12.7695 14.7752 12.8587 14.9877H12.8582ZM6.71241 16.8818L6.82033 17.2843C6.85699 17.4213 6.92026 17.5496 7.00653 17.6621C7.0928 17.7746 7.20038 17.869 7.32313 17.9399C7.44588 18.0108 7.58139 18.0568 7.72193 18.0753C7.86246 18.0939 8.00527 18.0845 8.1422 18.0479C8.27913 18.0112 8.4075 17.9479 8.51998 17.8617C8.63246 17.7754 8.72684 17.6678 8.79774 17.5451C8.86864 17.4223 8.91467 17.2868 8.93321 17.1463C8.95174 17.0057 8.9424 16.8629 8.90574 16.726L8.79616 16.3168C8.05158 16.5231 7.34949 16.7127 6.71241 16.8818Z" fill={c}/>
    </svg>
  )
}

function IconEvents({ active }: { active: boolean }) {
  const c = active ? '#022C51' : '#64748B'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4.16667 18.3337C3.70833 18.3337 3.31611 18.1706 2.99 17.8445C2.66389 17.5184 2.50056 17.1259 2.5 16.667V5.00033C2.5 4.542 2.66333 4.14977 2.99 3.82366C3.31667 3.49755 3.70889 3.33422 4.16667 3.33366H5V2.50033C5 2.26422 5.08 2.06644 5.24 1.907C5.4 1.74755 5.59778 1.66755 5.83333 1.667C6.06889 1.66644 6.26694 1.74644 6.4275 1.907C6.58806 2.06755 6.66778 2.26533 6.66667 2.50033V3.33366H13.3333V2.50033C13.3333 2.26422 13.4133 2.06644 13.5733 1.907C13.7333 1.74755 13.9311 1.66755 14.1667 1.667C14.4022 1.66644 14.6003 1.74644 14.7608 1.907C14.9214 2.06755 15.0011 2.26533 15 2.50033V3.33366H15.8333C16.2917 3.33366 16.6842 3.49699 17.0108 3.82366C17.3375 4.15033 17.5006 4.54255 17.5 5.00033V16.667C17.5 17.1253 17.3369 17.5178 17.0108 17.8445C16.6847 18.1712 16.2922 18.3342 15.8333 18.3337H4.16667ZM4.16667 16.667H15.8333V8.33366H4.16667V16.667ZM6.66667 11.667C6.43056 11.667 6.23278 11.587 6.07333 11.427C5.91389 11.267 5.83389 11.0692 5.83333 10.8337C5.83278 10.5981 5.91278 10.4003 6.07333 10.2403C6.23389 10.0803 6.43167 10.0003 6.66667 10.0003H13.3333C13.5694 10.0003 13.7675 10.0803 13.9275 10.2403C14.0875 10.4003 14.1672 10.5981 14.1667 10.8337C14.1661 11.0692 14.0861 11.2673 13.9267 11.4278C13.7672 11.5884 13.5694 11.6681 13.3333 11.667H6.66667ZM6.66667 15.0003C6.43056 15.0003 6.23278 14.9203 6.07333 14.7603C5.91389 14.6003 5.83389 14.4026 5.83333 14.167C5.83278 13.9314 5.91278 13.7337 6.07333 13.5737C6.23389 13.4137 6.43167 13.3337 6.66667 13.3337H10.8333C11.0694 13.3337 11.2675 13.4137 11.4275 13.5737C11.5875 13.7337 11.6672 13.9314 11.6667 14.167C11.6661 14.4026 11.5861 14.6006 11.4267 14.7612C11.2672 14.9217 11.0694 15.0014 10.8333 15.0003H6.66667Z" fill={c}/>
    </svg>
  )
}

function IconPermissions({ active }: { active: boolean }) {
  const c = active ? '#022C51' : '#64748B'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M5.83366 5.83366C5.83366 3.53199 7.69866 1.66699 10.0003 1.66699C12.302 1.66699 14.167 3.53199 14.167 5.83366V8.33366H14.5003C15.2337 8.33366 15.8337 8.93366 15.8337 9.66699V15.5003C15.8337 16.6003 14.9337 17.5003 13.8337 17.5003H6.16699C5.06699 17.5003 4.16699 16.6003 4.16699 15.5003V9.66699C4.16699 8.93366 4.76699 8.33366 5.50033 8.33366H5.83366V5.83366ZM12.5003 5.83366V8.33366H7.50033V5.83366C7.50033 4.45199 8.61866 3.33366 10.0003 3.33366C11.382 3.33366 12.5003 4.45199 12.5003 5.83366ZM10.0003 10.2087C9.66894 10.2083 9.34732 10.3208 9.08844 10.5277C8.82955 10.7346 8.64884 11.0235 8.57607 11.3467C8.5033 11.67 8.54281 12.0085 8.68809 12.3063C8.83337 12.6042 9.07575 12.8436 9.37533 12.9853V15.0003C9.37533 15.1661 9.44117 15.3251 9.55838 15.4423C9.67559 15.5595 9.83457 15.6253 10.0003 15.6253C10.1661 15.6253 10.3251 15.5595 10.4423 15.4423C10.5595 15.3251 10.6253 15.1661 10.6253 15.0003V12.9853C10.9249 12.8436 11.1673 12.6042 11.3126 12.3063C11.4578 12.0085 11.4974 11.67 11.4246 11.3467C11.3518 11.0235 11.1711 10.7346 10.9122 10.5277C10.6533 10.3208 10.3317 10.2083 10.0003 10.2087Z" fill={c}/>
    </svg>
  )
}

function IconBell() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2a6 6 0 00-6 6v3l-1.5 2.5h15L16 11V8a6 6 0 00-6-6z"
        stroke="#9CA3AF" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 16a2 2 0 004 0" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ── Nav item config ────────────────────────────────────────────────────────────

type NavCfg = {
  href: string
  label: string
  Icon: React.FC<{ active: boolean }>
  exact?: boolean
}

const SUPER_ADMIN_NAV: NavCfg[] = [
  { href: '/super-admin',               label: 'Dashboard',     Icon: IconDashboard,     exact: true },
  { href: '/super-admin/clubs',         label: 'Clubs',         Icon: IconClubs },
  { href: '/super-admin/champions',     label: 'Champions',     Icon: IconChampions },
  { href: '/super-admin/gatekeepers',   label: 'Gatekeepers',   Icon: IconGatekeepers },
  { href: '/super-admin/certifications', label: 'Certifications', Icon: IconCertifications },
  { href: '/super-admin/resources',     label: 'Resources',     Icon: IconResources },
  { href: '/super-admin/announcements', label: 'Announcements', Icon: IconAnnouncements },
  { href: '/super-admin/events',        label: 'Events',        Icon: IconEvents },
  { href: '/super-admin/permissions',   label: 'Permissions',   Icon: IconPermissions },
]

const CHAMPION_NAV: NavCfg[] = [
  { href: '/champion', label: 'Dashboard', Icon: IconDashboard, exact: true },
  { href: '/champion/gatekeepers', label: 'Gatekeepers', Icon: IconGatekeepers },
  { href: '/champion/certifications', label: 'Certifications', Icon: IconCertifications },
  { href: '/champion/events', label: 'Events', Icon: IconEvents },
  { href: '/champion/announcements', label: 'Announcements', Icon: IconAnnouncements },
  { href: '/champion/resources', label: 'Resources', Icon: IconResources },
]

function SideNavItem({ href, label, Icon, exact, collapsed }: NavCfg & { collapsed: boolean }) {
  const pathname = usePathname()
  const active = exact ? pathname === href : pathname.startsWith(href)

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-bold tracking-[0.04px] transition-all ${
        collapsed ? 'justify-center' : ''
      } ${
        active
          ? 'bg-[rgba(245,206,129,0.26)] text-[#022C51]'
          : 'font-medium text-[#64748B] hover:bg-gray-50 hover:text-[#0F172A]'
      }`}
    >
      <Icon active={active} />
      {!collapsed && label}
    </Link>
  )
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function ProfileMenu({ fullName, roleLabel, initials, profileHref }: { fullName: string; roleLabel: string; initials: string; profileHref: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-lg group"
      >
        <div className="text-right">
          <div className="text-[13px] font-bold text-[#0F172A] group-hover:text-[#F5A623] transition-colors">{fullName}</div>
          <div className="mt-0.5 flex justify-end">
            <span className="rounded-full bg-[#F4AC1E] px-1.5 py-[1px] text-[8px] font-extrabold uppercase tracking-wide text-[#022C51]">
              {roleLabel}
            </span>
          </div>
        </div>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#012C51] text-xs font-bold text-white shadow-[0_0_0_2px_#DBEAFE] group-hover:bg-[#F5A623] transition-colors">
          {initials}
        </div>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-48 overflow-hidden rounded-lg border border-[#E2E8F0] bg-white py-1.5 shadow-lg"
        >
          <Link
            href={profileHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-gray-50"
          >
            My Profile
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={isPending}
            onClick={() => startTransition(() => logoutAction())}
            className="flex w-full items-center px-4 py-2 text-left text-sm font-medium text-[#0F172A] hover:bg-gray-50 disabled:opacity-50"
          >
            {isPending ? 'Logging out…' : 'Logout'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DashboardClientLayout({
  children,
  profile,
}: {
  children: React.ReactNode
  profile: Profile
}) {
  const [showWarning, setShowWarning] = useState(false)
  const [, startTransition]  = useTransition()
  const [collapsed, setCollapsed] = useState(false)

  // Story 1.4 Sc04: timeout must redirect to /login?error=session_expired
  const handleTimeout = useCallback(() => {
    startTransition(() => sessionTimeoutLogoutAction())
  }, [])

  const { reset } = useSessionTimeout({
    timeoutMs:        TIMEOUT_MS,
    warningMs:        WARNING_MS,
    onWarning:        () => setShowWarning(true),
    onDismissWarning: () => setShowWarning(false),
    onTimeout:        handleTimeout,
  })

  const handleStayActive = useCallback(() => {
    setShowWarning(false)
    reset()
  }, [reset])

  const navItems = profile.role === 'super_admin' ? SUPER_ADMIN_NAV : CHAMPION_NAV

  const roleLabel = profile.role === 'super_admin' ? 'Super Admin' : 'Champion'
  const initials  = getInitials(profile.full_name)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar ── */}
      <aside
        className={`flex flex-shrink-0 flex-col border-r border-[#E2E8F0] bg-white font-[family-name:var(--font-inter)] transition-[width] duration-200 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Logo block */}
        <div className={`flex items-center border-b border-[#E2E8F0] px-4 py-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <Image src="/logo.png" alt="Healing Minds Matter" width={140} height={48} className="h-12 w-auto rounded-xl object-contain" priority />
          )}
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="ml-2 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Role/status chip */}
        {!collapsed && (
          <div className="p-4 pb-0">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[#DBEAFE] bg-gradient-to-r from-[rgba(239,246,255,0.8)] to-[rgba(255,251,235,0.5)] px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-[#022C51]">
                  <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
                    <path d="M5 0 9.5 1.8v3.6c0 2.9-1.9 5.4-4.5 6.1C2.4 10.8.5 8.3.5 5.4V1.8L5 0Z" fill="white"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-bold tracking-[0.025em] text-[#022C51]">{roleLabel.toUpperCase()}</p>
                  <p className="text-[10px] text-[#64748B]">Command Matrix</p>
                </div>
              </div>
              <span className="flex-shrink-0 rounded-full bg-[rgba(13,130,117,0.1)] px-1.5 py-0.5 text-[10px] font-bold text-[#0D8275]">Active</span>
            </div>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map(item => (
            <SideNavItem key={item.href} {...item} collapsed={collapsed} />
          ))}
        </nav>
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header className="flex flex-shrink-0 items-center justify-between gap-6 border-b border-gray-100 bg-white/95 px-8 py-4 backdrop-blur font-[family-name:var(--font-inter)]">
          {/* Left: global search (presentational — not wired to a search backend yet).
              No page title here — matches Figma exactly; each page is expected to carry
              its own heading going forward, the way Dashboard's "Executive Overview" does. */}
          <div className="flex min-w-0 max-w-lg flex-1 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F9F9F9] px-4 py-2.5">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0" aria-hidden="true">
              <circle cx="6" cy="6" r="5" stroke="#64748B" strokeWidth="1.3" />
              <path d="M13 13 9.5 9.5" stroke="#64748B" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search Champions, QPR records, clubs…"
              className="w-full min-w-0 bg-transparent text-[13px] text-[#0F172A] placeholder:text-[#64748B] focus:outline-none"
            />
          </div>

          {/* Right: help + notifications + divider + name/role/avatar */}
          <div className="flex flex-shrink-0 items-center gap-3">
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Help" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-50 transition-colors">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/help-circle.svg" alt="" width={15} height={15} />
              </button>
              <button type="button" aria-label="Notifications" className="relative flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-50 transition-colors">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/notification-bell.svg" alt="" width={11} height={15} />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#DC2626] shadow-[0_0_0_2px_white]" />
              </button>
            </div>
            <div className="h-6 w-px bg-[#E2E8F0]" />
            <ProfileMenu
              fullName={profile.full_name}
              roleLabel={roleLabel}
              initials={initials}
              profileHref={profile.role === 'super_admin' ? '/super-admin/profile' : '/champion/profile'}
            />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto bg-[#F5F7FA]">
          {children}
        </main>
      </div>

      {showWarning && (
        <SessionTimeoutModal
          warningMs={WARNING_MS}
          onStayActive={handleStayActive}
          onTimeout={handleTimeout}
        />
      )}
    </div>
  )
}
