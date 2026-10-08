import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, PanResponder } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { useTerminalStore } from '../../state/useTerminalStore';
import { useSettingsStore } from '../../state/useSettingsStore';
import * as TermuxBridge from '../../terminal/termuxBridge';
import TerminalLine from './TerminalLine';
import TerminalInputBar from './TerminalInputBar';

/**
 * The integrated terminal panel — VS Code's bottom-panel layout: a tab
 * strip for multiple sessions, a scrollback view, and an input bar.
 * Each session independently toggles between 'virtual' mode (the
 * built-in command interpreter from this Part, operating on the real
 * workspace) and 'termux' mode (dispatches to a real installed Termux
 * via termuxBridge.js). The mode toggle is per-session so a user can
 * keep a virtual tab for quick file operations and a Termux tab for
 * running a dev server side by side.
 */
export default function TerminalPanel() {
  const theme = useCodeForgeTheme();
  const terminalFontSize = useSettingsStore((s) => s.terminalFontSize);
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const panelVisible = useTerminalStore((s) => s.panelVisible);
  const panelHeight = useTerminalStore((s) => s.panelHeight);
  const createSession = useTerminalStore((s) => s.createSession);
  const closeSession = useTerminalStore((s) => s.closeSession);
  const setActiveSession = useTerminalStore((s) => s.setActiveSession);
  const togglePanel = useTerminalStore((s) => s.togglePanel);
  const setPanelHeight = useTerminalStore((s) => s.setPanelHeight);
  const setSessionMode = useTerminalStore((s) => s.setSessionMode);

  const scrollRef = useRef(null);
  const [termuxStatus, setTermuxStatus] = useState('unknown'); // 'unknown' | 'available' | 'unavailable'

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  useEffect(() => {
    if (activeSession?.mode === 'termux' && termuxStatus === 'unknown') {
      TermuxBridge.isTermuxInstalled().then((result) => {
        setTermuxStatus(result === true ? 'available' : result === false ? 'unavailable' : 'unknown');
      });
    }
  }, [activeSession?.mode, termuxStatus]);

  useEffect(() => {
    // Auto-scroll to bottom whenever the active session's scrollback grows.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd?.({ animated: false }));
  }, [activeSession?.scrollback.length]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        setPanelHeight(panelHeight - gestureState.dy);
      },
    })
  ).current;

  const handleTermuxCommand = useCallback(async (sessionId, line) => {
    const result = await TermuxBridge.runShellLine(line, undefined);
    if (result.dispatched) {
      useTerminalStore.getState().appendLine(sessionId, {
        type: 'system',
        text: 'Command dispatched to Termux. Tap the open-in-new icon above to see its output in Termux.',
      });
    } else {
      useTerminalStore.getState().appendLine(sessionId, { type: 'error', text: result.error });
    }
  }, []);

  if (!panelVisible) return null;

  return (
    <View style={[styles.container, { height: panelHeight, backgroundColor: theme.palette.surfaceContainerLow, borderTopColor: theme.palette.outline }]}>
      <View {...panResponder.panHandlers} style={styles.resizeHandle}>
        <View style={[styles.resizeGrip, { backgroundColor: theme.palette.outlineVariant }]} />
      </View>

      <View style={[styles.tabBar, { borderBottomColor: theme.palette.outlineVariant }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          {sessions.map((session) => (
            <Pressable
              key={session.id}
              onPress={() => setActiveSession(session.id)}
              style={[
                styles.tab,
                {
                  backgroundColor: session.id === activeSessionId ? theme.palette.surface : 'transparent',
                  borderBottomColor: session.id === activeSessionId ? theme.palette.primary : 'transparent',
                },
              ]}
            >
              <MaterialCommunityIcons
                name={session.mode === 'termux' ? 'console-network' : 'console'}
                size={13}
                color={session.id === activeSessionId ? theme.palette.primary : theme.palette.onSurfaceVariant}
              />
              <Text
                style={{
                  color: session.id === activeSessionId ? theme.palette.onSurface : theme.palette.onSurfaceVariant,
                  fontSize: 12,
                  marginLeft: 6,
                }}
              >
                {session.title}
              </Text>
              <Pressable onPress={() => closeSession(session.id)} hitSlop={8} style={{ marginLeft: 8 }}>
                <MaterialCommunityIcons name="close" size={13} color={theme.palette.onSurfaceDim} />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>

        <IconButton icon="plus" size={16} onPress={createSession} accessibilityLabel="New terminal" />
        {activeSession && activeSession.mode === 'termux' && (
          <IconButton
            icon="open-in-new"
            size={16}
            iconColor={theme.palette.primary}
            onPress={() => TermuxBridge.openTermuxApp()}
            accessibilityLabel="Open Termux"
          />
        )}
        {activeSession && (
          <IconButton
            icon={activeSession.mode === 'termux' ? 'console-network' : 'console'}
            size={16}
            iconColor={activeSession.mode === 'termux' ? theme.palette.primary : theme.palette.onSurfaceVariant}
            onPress={() => {
              const nextMode = activeSession.mode === 'termux' ? 'virtual' : 'termux';
              setSessionMode(activeSession.id, nextMode);
              setTermuxStatus('unknown');
              if (nextMode === 'termux') {
                Toast.show({ type: 'info', text1: 'Termux mode', text2: 'Commands now dispatch to Termux for real execution.' });
              }
            }}
            accessibilityLabel="Toggle Termux mode"
          />
        )}
        <IconButton icon="chevron-down" size={16} onPress={togglePanel} accessibilityLabel="Hide terminal" />
      </View>

      {activeSession?.mode === 'termux' && termuxStatus === 'unavailable' && (
        <View style={[styles.warningBanner, { backgroundColor: theme.palette.errorContainer }]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color={theme.palette.onErrorContainer} />
          <Text style={{ color: theme.palette.onErrorContainer, fontSize: 11, marginLeft: 6, flex: 1 }}>
            Termux not detected. Install it from F-Droid, or switch this tab back to the built-in terminal.
          </Text>
        </View>
      )}

      {activeSession ? (
        <>
          <ScrollView ref={scrollRef} style={styles.scrollback} contentContainerStyle={{ padding: 8 }}>
            {activeSession.scrollback.map((line) => (
              <TerminalLine key={line.id} line={line} theme={theme} fontSize={terminalFontSize} />
            ))}
          </ScrollView>
          <TerminalInputBar
            sessionId={activeSession.id}
            theme={theme}
            cwdDisplayPath={activeSession.cwd.displayPath}
            isRunning={activeSession.isRunning}
            onSubmitOverride={activeSession.mode === 'termux' ? (line) => handleTermuxCommand(activeSession.id, line) : undefined}
            fontSize={terminalFontSize}
          />
        </>
      ) : (
        <View style={styles.emptyState}>
          <Text style={{ color: theme.palette.onSurfaceDim }}>No terminal sessions</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 1 },
  resizeHandle: { height: 8, alignItems: 'center', justifyContent: 'center' },
  resizeGrip: { width: 36, height: 3, borderRadius: 1.5 },
  tabBar: { flexDirection: 'row', alignItems: 'center', height: 32, borderBottomWidth: 1 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 32,
    borderBottomWidth: 2,
  },
  warningBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4 },
  scrollback: { flex: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
