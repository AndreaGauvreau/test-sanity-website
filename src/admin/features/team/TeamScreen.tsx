import type { ReactNode } from 'react'

import {
  Avatar,
  ButtonContent,
  Callout,
  ContentArea,
  EmptyState,
  ListItem,
  SectionHeader,
  Tag,
  buttonClassName,
  initialsOf,
} from '@/admin/ui'

import type { TeamState } from './data'
import { InviteControl } from './InviteControl'
import styles from './team.module.css'

export type TeamScreenProps = {
  state: TeamState
  siteName: string
  /** Gestion des membres sur sanity.io. */
  manageUrl: string
}

const KUARTZ_NOTE =
  'Kuartz members are Developers: they can change code and settings, not remove the project. Their seats are paid on the client’s Sanity Growth plan.'

function ExternalLink({ href, children, variant = 'secondary' }: { href: string; children: ReactNode; variant?: 'secondary' | 'ghost' }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClassName({ variant, size: 'small' })}>
      <ButtonContent size="small" iconRight="external">
        {children}
      </ButtonContent>
      <span className="kz-visually-hidden"> (opens in a new tab)</span>
    </a>
  )
}

/**
 * B4 · Site Settings › Team (Figma 359:838). Server Component : membres du projet Sanity, rôles, « invited by »,
 * tag KUARTZ ; invitation par l'API si l'utilisateur est Administrator, sinon lien « Invite in Sanity ↗ ».
 */
export function TeamScreen({ state, siteName, manageUrl }: TeamScreenProps) {
  const canInvite = state.kind === 'ok' && state.canInvite
  const action = canInvite ? (
    <div className={styles.actions}>
      <InviteControl />
      <ExternalLink href={manageUrl} variant="ghost">
        Manage in Sanity
      </ExternalLink>
    </div>
  ) : (
    <ExternalLink href={manageUrl}>Invite in Sanity</ExternalLink>
  )

  return (
    <ContentArea gap={24}>
      <h1 className="kz-visually-hidden">Site settings</h1>
      <SectionHeader
        title="Team"
        description={`Members of the Sanity project “${siteName}”, owned by ${siteName}. Invitations and roles are managed in Sanity.`}
        action={action}
      />
      <TeamBody state={state} manageUrl={manageUrl} />
      <Callout tone="info">{KUARTZ_NOTE}</Callout>
    </ContentArea>
  )
}

function TeamBody({ state, manageUrl }: { state: TeamState; manageUrl: string }) {
  if (state.kind === 'no-token') {
    return (
      <div className={styles.panel}>
        <EmptyState
          icon="sanity"
          title="Sign in with Sanity to manage the team"
          description="This development session has no Sanity account, so the project members can’t be read. Sign in with your own Sanity account, or manage members directly in Sanity."
          action={
            <form action="/admin/api/auth/logout" method="post">
              <button type="submit" className={buttonClassName({ variant: 'secondary', size: 'small' })}>
                <ButtonContent size="small">Sign in with Sanity</ButtonContent>
              </button>
            </form>
          }
        />
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className={styles.panel}>
        <EmptyState
          icon="warning"
          title={state.code === 'forbidden' ? 'Your Sanity role can’t list the members' : 'Couldn’t load the team'}
          description={state.message}
          action={
            state.code === 'forbidden' ? (
              <ExternalLink href={manageUrl}>Open Sanity</ExternalLink>
            ) : (
              <a href="/admin/settings/team" className={buttonClassName({ variant: 'secondary', size: 'small' })}>
                <ButtonContent size="small">Reload</ButtonContent>
              </a>
            )
          }
        />
      </div>
    )
  }

  if (state.members.length === 0 && state.pending.length === 0) {
    return (
      <div className={styles.panel}>
        <EmptyState icon="team" title="No members yet" description="Invite people in Sanity: they appear here once they accept." />
      </div>
    )
  }

  return (
    <div className={styles.members}>
      <ul className={styles.list} aria-label="Members">
        {state.members.map((member) => (
          <li key={member.id}>
            <ListItem
              title={
                <>
                  {member.name}
                  {member.isCurrentUser ? <span className={styles.you}> (you)</span> : null}
                </>
              }
              subtitle={member.email}
              meta={member.meta}
              tag={member.kuartz ? <Tag tone="info">KUARTZ</Tag> : undefined}
              avatar={
                <Avatar
                  size={28}
                  name={member.name}
                  initials={initialsOf(member.name).slice(0, 1)}
                  src={member.imageUrl}
                  tone={member.kuartz ? 'blue' : 'green'}
                  decorative
                />
              }
            />
          </li>
        ))}
      </ul>
      {state.pending.length > 0 ? (
        <>
          <h2 className={styles.pendingTitle} id="team-pending">
            Pending invitations
          </h2>
          <ul className={styles.list} aria-labelledby="team-pending">
            {state.pending.map((invite) => (
              <li key={invite.id}>
                <ListItem
                  title={invite.email}
                  subtitle="Invitation not accepted yet"
                  meta={invite.meta}
                  tag={invite.kuartz ? <Tag tone="info">KUARTZ</Tag> : <Tag tone="neutral">PENDING</Tag>}
                  avatar={<Avatar size={28} name={invite.email} initials={invite.email[0]?.toUpperCase()} tone="neutral" decorative />}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
