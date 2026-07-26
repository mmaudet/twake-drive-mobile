import React from 'react'
import { CozyProvider } from 'cozy-client'

import { useAuth } from '@/auth/useAuth'
import { PendingShareProvider } from '@/share/PendingShareProvider'
import { DevResetButton } from '@/ui/DevResetButton'

// PendingShareProvider wraps the ENTIRE client conditional (rather than
// living inside `children`) so its position in the tree never changes when
// `client` flips null -> object. That transition happens on every login
// and even on cold start with a saved session (see useAuth's bootstrap
// effect) — if PendingShareProvider sat inside the conditional, the
// element type at this return position would change (bare children <->
// CozyProvider), forcing React to unmount/remount the whole subtree and
// wipe the staged share before it could be resumed after login.
//
// This wiring is extracted out of app/_layout.tsx into its own file so it
// can be rendered directly in a test (app/_AppProviderTree.test.tsx). A
// test that only renders PendingShareProvider in isolation can't observe a
// regression where someone re-nests it inside the conditional below —
// exercising this exact component is what makes that bug catchable.
export const AppProviderTree = ({
  children
}: {
  children: React.ReactNode
}): React.ReactElement => {
  const { client } = useAuth()
  return (
    <PendingShareProvider>
      {client ? (
        <CozyProvider client={client}>
          {children}
          <DevResetButton />
        </CozyProvider>
      ) : (
        children
      )}
    </PendingShareProvider>
  )
}
