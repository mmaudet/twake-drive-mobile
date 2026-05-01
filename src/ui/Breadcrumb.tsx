import React, { useEffect, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'
import { useQuery } from 'cozy-client'

import { fileByIdQuery, fileByIdQueryAs } from '@/client/queries'

export interface BreadcrumbSegment {
  id: string
  name?: string
}

interface Props {
  segments: BreadcrumbSegment[]
  onSegmentPress: (index: number) => void
}

export const Breadcrumb = ({ segments, onSegmentPress }: Props) => {
  const theme = useTheme()
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 0)
    return () => clearTimeout(id)
  }, [segments])

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1
          const isFirst = index === 0
          return (
            <View key={segment.id} style={styles.segmentWrapper}>
              <BreadcrumbItem
                segment={segment}
                isLast={isLast}
                isFirst={isFirst}
                onPress={() => onSegmentPress(index)}
              />
              {!isLast ? (
                <Text style={[styles.separator, { color: theme.colors.onSurfaceVariant }]}>/</Text>
              ) : null}
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

interface ItemProps {
  segment: BreadcrumbSegment
  isLast: boolean
  isFirst: boolean
  onPress: () => void
}

const BreadcrumbItem = ({ segment, isLast, isFirst, onPress }: ItemProps) => {
  const theme = useTheme()
  const lookup = useQuery(fileByIdQuery(segment.id), {
    as: fileByIdQueryAs(segment.id),
    enabled: !isFirst
  })
  const fetchedName = isFirst
    ? null
    : ((lookup.data as { name?: string } | null | undefined)?.name ?? null)
  const name = segment.name ?? fetchedName ?? segment.id

  return (
    <Pressable disabled={isLast} onPress={onPress} accessibilityRole="button">
      <Text
        variant="bodyMedium"
        style={[
          styles.segment,
          isLast ? styles.current : null,
          { color: isLast ? theme.colors.onSurface : theme.colors.primary }
        ]}
      >
        {name}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8, paddingHorizontal: 16 },
  segmentWrapper: { flexDirection: 'row', alignItems: 'center' },
  segment: { paddingHorizontal: 4 },
  current: { fontWeight: '700' },
  separator: { paddingHorizontal: 4 }
})
