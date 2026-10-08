import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, TextInput as PaperTextInput, RadioButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useSettingsStore } from '../state/useSettingsStore';
import { getProviderList } from '../ai/providers';

/**
 * AI Assistant settings section, rendered inside SettingsScreen. Reads/
 * writes the aiProvider/aiApiKey/aiApiBaseUrl/aiModel fields that have
 * existed in useSettingsStore since Part 1 — this is simply the first
 * real UI for them.
 *
 * The API key field is masked via react-native-paper's TextInput
 * secureTextEntry (with a show/hide eye toggle), is never logged, and
 * is only ever read at request time by aiService.js to attach directly
 * to the configured provider's own request headers — see
 * src/ai/aiService.js and the provider adapters for exactly where it's
 * used.
 */
export default function AIProviderSettings() {
  const theme = useCodeForgeTheme();
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const aiApiKey = useSettingsStore((s) => s.aiApiKey);
  const aiApiBaseUrl = useSettingsStore((s) => s.aiApiBaseUrl);
  const aiModel = useSettingsStore((s) => s.aiModel);
  const setSetting = useSettingsStore((s) => s.setSetting);

  const [keyVisible, setKeyVisible] = useState(false);

  const providers = getProviderList();
  const currentProvider = providers.find((p) => p.id === aiProvider) || providers[0];

  const handleSelectProvider = (providerId) => {
    setSetting('aiProvider', providerId);
    // Pre-fill sensible defaults for the newly-selected provider only if
    // the fields are currently empty or still holding the previous
    // provider's defaults — never silently overwrite something the user
    // has actually typed in.
    const nextProvider = providers.find((p) => p.id === providerId);
    if (nextProvider) {
      if (!aiApiBaseUrl || providers.some((p) => p.defaultBaseUrl === aiApiBaseUrl)) {
        setSetting('aiApiBaseUrl', nextProvider.defaultBaseUrl);
      }
      if (!aiModel || providers.some((p) => p.defaultModel === aiModel)) {
        setSetting('aiModel', nextProvider.defaultModel);
      }
    }
  };

  return (
    <View>
      <Text
        variant="bodySmall"
        style={{ color: theme.palette.onSurfaceDim, paddingHorizontal: 16, paddingBottom: 8 }}
      >
        Configure the provider used by Chat and the code actions (Explain, Generate, Fix, Refactor,
        Comment, Continue). Your API key is sent only to the endpoint below — never to CodeForge's own
        servers, and never to extensions.
      </Text>

      <View style={styles.section}>
        <Text style={{ color: theme.palette.onSurfaceVariant, fontSize: 13, marginBottom: 4 }}>Provider</Text>
        <RadioButton.Group onValueChange={handleSelectProvider} value={aiProvider}>
          {providers.map((p) => (
            <Pressable key={p.id} onPress={() => handleSelectProvider(p.id)} style={styles.radioRow}>
              <RadioButton value={p.id} color={theme.palette.primary} />
              <Text style={{ color: theme.palette.onSurface, fontSize: 14 }}>{p.label}</Text>
            </Pressable>
          ))}
        </RadioButton.Group>
      </View>

      <View style={styles.section}>
        <Text style={{ color: theme.palette.onSurfaceVariant, fontSize: 13, marginBottom: 6 }}>API Key</Text>
        <PaperTextInput
          mode="outlined"
          value={aiApiKey}
          onChangeText={(v) => setSetting('aiApiKey', v)}
          placeholder={currentProvider.apiKeyRequired ? 'Required' : 'Optional for local servers'}
          secureTextEntry={!keyVisible}
          autoCapitalize="none"
          autoCorrect={false}
          dense
          style={{ backgroundColor: theme.palette.surfaceContainer }}
          right={
            <PaperTextInput.Icon
              icon={keyVisible ? 'eye-off-outline' : 'eye-outline'}
              onPress={() => setKeyVisible((v) => !v)}
              forceTextInputFocus={false}
            />
          }
        />
      </View>

      <View style={styles.section}>
        <Text style={{ color: theme.palette.onSurfaceVariant, fontSize: 13, marginBottom: 6 }}>Base URL</Text>
        <PaperTextInput
          mode="outlined"
          value={aiApiBaseUrl}
          onChangeText={(v) => setSetting('aiApiBaseUrl', v)}
          placeholder={currentProvider.defaultBaseUrl || 'e.g. http://localhost:11434/v1/chat/completions'}
          autoCapitalize="none"
          autoCorrect={false}
          dense
          style={{ backgroundColor: theme.palette.surfaceContainer }}
        />
        <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 11, marginTop: 4 }}>
          Leave blank to use {currentProvider.label}'s default endpoint. Point this at Groq, Together,
          Ollama, LM Studio, or any other OpenAI-compatible server when using the "OpenAI-compatible
          (custom)" provider.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={{ color: theme.palette.onSurfaceVariant, fontSize: 13, marginBottom: 6 }}>Model</Text>
        <PaperTextInput
          mode="outlined"
          value={aiModel}
          onChangeText={(v) => setSetting('aiModel', v)}
          placeholder={currentProvider.defaultModel || 'e.g. llama3'}
          autoCapitalize="none"
          autoCorrect={false}
          dense
          style={{ backgroundColor: theme.palette.surfaceContainer }}
        />
      </View>

      <View style={[styles.noticeRow, { backgroundColor: theme.palette.surfaceContainer }]}>
        <MaterialCommunityIcons name="shield-lock-outline" size={16} color={theme.palette.onSurfaceDim} />
        <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 11.5, marginLeft: 8, flex: 1 }}>
          Your API key is stored on-device and is not visible to extensions or written to any log.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, marginBottom: 16 },
  radioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
  },
});
