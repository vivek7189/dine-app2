import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import apiClient from '../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/Theme';

export default function VoiceOrderModal({ visible, onClose, onItemsAdded, restaurantId }) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) {
      // Reset state when modal closes
      setIsListening(false);
      setTranscript('');
      setError('');
      setProcessing(false);
    }
  }, [visible]);

  const startListening = async () => {
    try {
      setIsListening(true);
      setError('');
      setTranscript('Listening...');
      
      // Note: For production, you'll need to use a proper speech recognition library
      // This is a placeholder - you may need to use expo-speech or a native module
      // For now, we'll simulate with a prompt
      
      // In a real implementation, you would:
      // 1. Use expo-speech or react-native-voice for speech recognition
      // 2. Get the transcript from the recognition service
      // 3. Process it with the API
      
      // For demo purposes, we'll show an alert to enter text
      Alert.prompt(
        'Voice Order',
        'Enter your order (e.g., "2 biryani, 1 coke")',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setIsListening(false);
              setTranscript('');
            },
          },
          {
            text: 'Process',
            onPress: (text) => {
              if (text) {
                processVoiceCommand(text);
              } else {
                setIsListening(false);
                setTranscript('');
              }
            },
          },
        ],
        'plain-text'
      );
    } catch (err) {
      console.error('Error starting voice recognition:', err);
      setError('Failed to start voice recognition. Please try again.');
      setIsListening(false);
    }
  };

  const stopListening = () => {
    setIsListening(false);
    setTranscript('');
  };

  const processVoiceCommand = async (voiceText) => {
    if (!voiceText || !restaurantId) {
      setError('Invalid input or restaurant ID');
      return;
    }

    setProcessing(true);
    setError('');
    setTranscript(voiceText);

    try {
      const response = await apiClient.processVoiceOrder(voiceText, restaurantId);

      if (response.items && response.items.length > 0) {
        // Add items to cart
        onItemsAdded(response.items);
        
        // Speak confirmation
        Speech.speak(`Added ${response.items.length} item(s) to cart`, {
          language: 'en',
        });
      } else {
        setError('No items found. Please try again with clearer pronunciation.');
      }
    } catch (err) {
      console.error('Voice processing error:', err);
      setError(err.message || 'Failed to process voice command. Please try again.');
    } finally {
      setProcessing(false);
      setIsListening(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Voice Order</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textDark} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {!isListening && !processing && (
              <View style={styles.instructionContainer}>
                <Ionicons name="mic-outline" size={64} color={Colors.primary} />
                <Text style={styles.instructionText}>
                  Tap the microphone to start voice ordering
                </Text>
                <Text style={styles.instructionSubtext}>
                  Say items like "2 biryani, 1 coke" or "one pizza and two drinks"
                </Text>
              </View>
            )}

            {isListening && (
              <View style={styles.listeningContainer}>
                <View style={styles.listeningIndicator}>
                  <View style={[styles.pulse, styles.pulse1]} />
                  <View style={[styles.pulse, styles.pulse2]} />
                  <View style={[styles.pulse, styles.pulse3]} />
                  <Ionicons name="mic" size={48} color="#fff" style={styles.micIcon} />
                </View>
                <Text style={styles.listeningText}>Listening...</Text>
                <Text style={styles.transcriptText}>{transcript}</Text>
              </View>
            )}

            {processing && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.processingText}>Processing your order...</Text>
                {transcript && (
                  <Text style={styles.transcriptText}>{transcript}</Text>
                )}
              </View>
            )}

            {error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={24} color={Colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {!isListening && !processing ? (
              <TouchableOpacity
                style={styles.startButton}
                onPress={startListening}
              >
                <Ionicons name="mic" size={24} color="#fff" />
                <Text style={styles.startButtonText}>Start Voice Order</Text>
              </TouchableOpacity>
            ) : isListening ? (
              <TouchableOpacity
                style={styles.stopButton}
                onPress={stopListening}
              >
                <Ionicons name="stop" size={24} color="#fff" />
                <Text style={styles.stopButtonText}>Stop</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.backgroundWhite,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h2.fontWeight,
    color: Colors.textDark,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionContainer: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  instructionText: {
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
    color: Colors.textDark,
    textAlign: 'center',
  },
  instructionSubtext: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textMedium,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  listeningContainer: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  listeningIndicator: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  pulse: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primary,
    opacity: 0.3,
  },
  pulse1: {
    animation: 'pulse 2s infinite',
  },
  pulse2: {
    animation: 'pulse 2s infinite 0.5s',
  },
  pulse3: {
    animation: 'pulse 2s infinite 1s',
  },
  micIcon: {
    zIndex: 1,
  },
  listeningText: {
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
    color: Colors.primary,
    marginTop: Spacing.md,
  },
  transcriptText: {
    fontSize: Typography.body.fontSize,
    color: Colors.textMedium,
    textAlign: 'center',
    marginTop: Spacing.sm,
    fontStyle: 'italic',
  },
  processingContainer: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  processingText: {
    fontSize: Typography.body.fontSize,
    color: Colors.textDark,
    marginTop: Spacing.md,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    gap: Spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: Typography.caption.fontSize,
    color: Colors.error,
  },
  actions: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  startButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    gap: Spacing.sm,
  },
  startButtonText: {
    color: '#fff',
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
  },
  stopButton: {
    backgroundColor: Colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    gap: Spacing.sm,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
  },
});
