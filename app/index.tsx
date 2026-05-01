import React from 'react'
import { Redirect } from 'expo-router'

import { LoadingState } from '@/ui/LoadingState'
import { useAuth } from '@/auth/useAuth'

export default function Index() {
  const { status } = useAuth()
  if (status === 'loading') return <LoadingState />
  if (status === 'authenticated') return <Redirect href="/(drive)/files" />
  return <Redirect href="/(auth)/welcome" />
}
