import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useWindowDimensions } from 'react-native';
import { useOmniPost } from '../../context/OmniPostContext';

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const { palette, activeJobsCount, unansweredInboxCount } = useOmniPost();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.text,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: isDesktop
          ? { display: 'none' }
          : {
              backgroundColor: palette.surface,
              borderTopColor: palette.border,
              borderTopWidth: 1,
              height: 62,
              paddingBottom: 6,
              paddingTop: 5,
            },
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          lineHeight: 14,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'New post',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'add-circle' : 'add-circle-outline'}
              size={21}
              color={typeof color === 'string' ? color : palette.text}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Queue',
          tabBarBadge: activeJobsCount > 0 ? activeJobsCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: palette.accent,
            color: '#FFF',
            fontSize: 10,
            fontWeight: '700',
          },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'albums' : 'albums-outline'}
              size={20}
              color={typeof color === 'string' ? color : palette.text}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarBadge:
            unansweredInboxCount > 0 ? unansweredInboxCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: palette.accent,
            color: '#FFF',
            fontSize: 10,
            fontWeight: '700',
          },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
              size={19}
              color={typeof color === 'string' ? color : palette.text}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'bar-chart' : 'bar-chart-outline'}
              size={19}
              color={typeof color === 'string' ? color : palette.text}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: 'Accounts',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={20}
              color={typeof color === 'string' ? color : palette.text}
            />
          ),
        }}
      />
    </Tabs>
  );
}
