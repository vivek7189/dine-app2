import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/Theme';
import apiClient from '../services/api';

/**
 * DiscountApprovalModal
 *
 * Shows PIN or OTP input when a staff member needs approval to apply a discount.
 * Communicates with /api/discount-approval endpoints.
 *
 * Props:
 *   visible (bool) - whether modal is open
 *   onClose (func) - dismiss without approval
 *   onApproved (func) - called when discount is approved
 *   restaurantId (string)
 *   discountData (object) - { discountType, discountValue, discountAmount, subtotal, orderId }
 *   userRole (string) - current user's role
 *   userName (string) - current user's display name
 */
export default function DiscountApprovalModal({
  visible,
  onClose,
  onApproved,
  restaurantId,
  discountData,
  userRole,
  userName,
}) {
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState(null); // 'pin' | 'otp' | null
  const [approvalId, setApprovalId] = useState(null);
  const [sentTo, setSentTo] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef([]);

  const codeLength = method === 'pin' ? 4 : 6;

  // Request approval on open
  useEffect(() => {
    if (!visible || !restaurantId || !discountData) return;
    requestApproval();
  }, [visible, restaurantId]);

  const requestApproval = async () => {
    setLoading(true);
    setError('');
    setCode(['', '', '', '', '', '']);
    try {
      const res = await apiClient.requestDiscountApproval(restaurantId, {
        ...discountData,
        requestedByName: userName || '',
        requestedByRole: userRole || 'staff',
      });

      if (res.approved) {
        // No approval needed
        onApproved?.();
        return;
      }

      setApprovalId(res.approvalId);
      setMethod(res.method);
      setSentTo(res.sentTo || '');
      setExpiresAt(res.expiresAt ? new Date(res.expiresAt) : null);

      if (res.method === 'otp' && res.expiresAt) {
        const secs = Math.max(0, Math.floor((new Date(res.expiresAt) - Date.now()) / 1000));
        setCountdown(secs);
      }
    } catch (err) {
      setError(err.message || 'Failed to request approval');
    } finally {
      setLoading(false);
    }
  };

  // Countdown timer for OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleCodeChange = (index, value) => {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError('');

    // Auto-focus next input
    if (value && index < codeLength - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    const fullCode = newCode.slice(0, codeLength).join('');
    if (fullCode.length === codeLength && newCode.slice(0, codeLength).every(d => d !== '')) {
      handleVerify(fullCode);
    }
  };

  const handleKeyPress = (index, key) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
    }
  };

  const handleVerify = async (fullCode) => {
    if (!approvalId) return;
    setVerifying(true);
    setError('');

    try {
      const body = { approvalId };
      if (method === 'pin') body.pin = fullCode;
      else body.otp = fullCode;

      const res = await apiClient.verifyDiscountApproval(restaurantId, body);
      if (res.approved) {
        onApproved?.();
      } else {
        setError(res.message || 'Invalid code');
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError(err.message || 'Verification failed');
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResendCooldown(30);
    await requestApproval();
  };

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="shield-checkmark" size={28} color={Colors.primary} />
            <Text style={styles.title}>Discount Approval</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Discount info */}
          {discountData && (
            <View style={styles.discountInfo}>
              <Text style={styles.discountLabel}>
                {discountData.discountType === 'percentage'
                  ? `${discountData.discountValue}% discount`
                  : `Flat ${discountData.discountValue} discount`}
              </Text>
              <Text style={styles.discountAmount}>
                Amount: {discountData.discountAmount || 0}
              </Text>
            </View>
          )}

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Requesting approval...</Text>
            </View>
          ) : (
            <>
              {/* Instructions */}
              <Text style={styles.instructions}>
                {method === 'pin'
                  ? 'Ask your manager to enter their 4-digit PIN'
                  : `OTP sent to ${sentTo}`}
              </Text>

              {/* Code input boxes */}
              <View style={styles.codeContainer}>
                {Array.from({ length: codeLength }).map((_, i) => (
                  <TextInput
                    key={i}
                    ref={ref => (inputRefs.current[i] = ref)}
                    style={[styles.codeInput, error ? styles.codeInputError : null]}
                    value={code[i]}
                    onChangeText={v => handleCodeChange(i, v)}
                    onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
                    keyboardType="number-pad"
                    maxLength={1}
                    secureTextEntry={method === 'pin'}
                    autoFocus={i === 0}
                    selectTextOnFocus
                  />
                ))}
              </View>

              {/* Error */}
              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : null}

              {/* Verifying spinner */}
              {verifying && (
                <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 8 }} />
              )}

              {/* OTP extras: countdown + resend */}
              {method === 'otp' && (
                <View style={styles.otpExtras}>
                  {countdown > 0 && (
                    <Text style={styles.countdown}>
                      Expires in {formatCountdown(countdown)}
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={handleResend}
                    disabled={resendCooldown > 0}
                    style={[styles.resendBtn, resendCooldown > 0 && styles.resendBtnDisabled]}
                  >
                    <Text style={[styles.resendText, resendCooldown > 0 && styles.resendTextDisabled]}>
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeBtn: {
    padding: 4,
  },
  discountInfo: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  discountLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#991b1b',
  },
  discountAmount: {
    fontSize: 12,
    color: '#b91c1c',
    marginTop: 2,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 12,
  },
  instructions: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  codeInput: {
    width: 44,
    height: 52,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  codeInputError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 4,
  },
  otpExtras: {
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  countdown: {
    fontSize: 12,
    color: '#9ca3af',
  },
  resendBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  resendBtnDisabled: {
    opacity: 0.5,
  },
  resendText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary || '#ef4444',
  },
  resendTextDisabled: {
    color: '#9ca3af',
  },
});
