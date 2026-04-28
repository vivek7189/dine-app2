'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  ActivityIndicator, RefreshControl, Platform, Animated, TextInput, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
let Location = null;
try {
  Location = require('expo-location');
} catch (e) {
  console.log('expo-location not available, attendance will work without GPS');
}
import apiClient, { WEB_BASE_URL } from '../../services/api';
import { useResponsive } from '../../hooks/useResponsive';
import { useOffline } from '../../hooks/useOffline';
import { Colors, Spacing } from '../../constants/Theme';
import { WebView } from 'react-native-webview';

// ── Helpers ──────────────────────────────────────────────────

function formatTime(iso) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function formatHours(h) {
  if (!h && h !== 0) return '--';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

function formatTimerDisplay(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function getTomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// Haversine distance in meters (for geofence UI)
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const STATUS_CONFIG = {
  present: { label: 'Present', color: '#10b981', bg: '#d1fae5', icon: 'checkmark-circle' },
  absent: { label: 'Absent', color: '#ef4444', bg: '#fee2e2', icon: 'close-circle' },
  half_day: { label: 'Half Day', color: '#f59e0b', bg: '#fef3c7', icon: 'time' },
  leave: { label: 'On Leave', color: '#3b82f6', bg: '#dbeafe', icon: 'umbrella' },
  holiday: { label: 'Holiday', color: '#6b7280', bg: '#f3f4f6', icon: 'sunny' },
};

const LEAVE_STATUS = {
  pending: { label: 'Pending', color: '#f59e0b', bg: '#fef3c7', icon: 'time-outline' },
  approved: { label: 'Approved', color: '#10b981', bg: '#d1fae5', icon: 'checkmark-circle' },
  rejected: { label: 'Rejected', color: '#ef4444', bg: '#fee2e2', icon: 'close-circle' },
};

const DEFAULT_LEAVE_TYPES = [
  { key: 'CL', label: 'Casual Leave' },
  { key: 'SL', label: 'Sick Leave' },
  { key: 'EL', label: 'Earned Leave' },
];

// ── Pulse Animation for active clock ──────────────────────

function PulseDot({ color, size = 12 }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <View style={{ position: 'relative', width: size, height: size }}>
      <Animated.View
        style={{
          position: 'absolute', top: 0, left: 0, width: size, height: size,
          borderRadius: size / 2, backgroundColor: color, opacity: 0.3,
          transform: [{ scale: pulseAnim }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ── Animated Circle Button ──────────────────────────────────

function CircleActionButton({ icon, color, glowColor, label, onPress, loading, disabled }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.6, duration: 1500, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 1500, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.9, useNativeDriver: true, friction: 5 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  };

  return (
    <View style={s.circleButtonWrap}>
      {/* Glow ring */}
      <Animated.View style={[s.circleGlow, {
        backgroundColor: glowColor || color,
        opacity: glowAnim,
      }]} />
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          style={[s.circleButton, { backgroundColor: color }]}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled || loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Ionicons name={icon} size={32} color="#fff" />
          )}
        </TouchableOpacity>
      </Animated.View>
      <Text style={[s.circleLabel, { color: disabled ? '#9ca3af' : '#6b7280' }]}>{label}</Text>
    </View>
  );
}

// ── Main Component ──────────────────────────────────────────

export default function AttendanceScreen() {
  const router = useRouter();
  const { r, isTablet } = useResponsive();
  const { effectivelyOffline } = useOffline();

  const [user, setUser] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clockingIn, setClockingIn] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);

  // Attendance state
  const [todayRecord, setTodayRecord] = useState(null);
  const [todayData, setTodayData] = useState(null);
  const [recentHistory, setRecentHistory] = useState([]);
  const [leaveConfig, setLeaveConfig] = useState(null);
  const [leaveBalances, setLeaveBalances] = useState(null);

  // Leave state
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [showApplyLeave, setShowApplyLeave] = useState(false);
  const [applyingLeave, setApplyingLeave] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leaveType: 'CL',
    startDate: '',
    endDate: '',
    isHalfDay: false,
    halfDayType: 'first_half',
    reason: '',
  });

  // Tabs: 'attendance', 'leave', 'dashboard' (admin only)
  const [activeTab, setActiveTab] = useState('attendance');
  const [toast, setToast] = useState(null);
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false);

  // Live timer state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);

  // Location/geofence state
  const [currentLocation, setCurrentLocation] = useState(null);
  const [geoStatus, setGeoStatus] = useState(null); // { inside: bool, distance: number }

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const isAdmin = user && ['owner', 'admin', 'manager'].includes(user.role?.toLowerCase());

  // ── Live Timer ──────────────────────────────────────────

  useEffect(() => {
    if (todayRecord?.clockIn && !todayRecord?.clockOut) {
      // Start timer
      const clockInTime = new Date(todayRecord.clockIn).getTime();
      const updateTimer = () => {
        const now = Date.now();
        setElapsedSeconds(Math.floor((now - clockInTime) / 1000));
      };
      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);
      return () => clearInterval(timerRef.current);
    } else {
      clearInterval(timerRef.current);
      setElapsedSeconds(0);
    }
  }, [todayRecord?.clockIn, todayRecord?.clockOut]);

  // ── Load Data ──────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }
      setUser(userData);
      const rid = userData.restaurantId || userData.restaurant?.id;
      setRestaurantId(rid);

      if (!rid) return;

      // Load today's attendance
      const today = await apiClient.getAttendanceToday(rid);
      setTodayData(today);

      // Find current user's record
      const myRecord = (today?.attendance || []).find(a => a.staffId === userData.id);
      setTodayRecord(myRecord || null);

      // Load recent history (last 7 days)
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const endDate = now.toISOString().split('T')[0];
      const startDate = weekAgo.toISOString().split('T')[0];
      const history = await apiClient.getAttendanceHistory(rid, {
        staffId: userData.id,
        startDate,
        endDate,
      });
      setRecentHistory(history?.records || []);

      // Load leave config, balances & requests
      try {
        const config = await apiClient.getLeaveConfig(rid);
        setLeaveConfig(config);
        const bal = await apiClient.getLeaveBalances(rid, userData.id);
        setLeaveBalances(bal?.balances || null);
        const lr = await apiClient.getLeaveRequests(rid, { staffId: userData.id });
        setLeaveRequests(lr?.requests || []);
      } catch (e) {
        // Leave config might not exist yet
      }
    } catch (err) {
      console.error('Attendance load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // ── Location Helper ──────────────────────────────────────

  const getCurrentLocation = async () => {
    if (!Location) return null;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast('Location permission is required for clock-in/out', 'error');
        return null;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 10000,
      });
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch (err) {
      console.error('Location error:', err);
      return null;
    }
  };

  // ── Request location on mount & check geofence ──────────

  useEffect(() => {
    (async () => {
      if (!Location) return;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeout: 10000,
        });
        const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        setCurrentLocation(coords);
      } catch (e) {
        // Silently fail — location is optional
      }
    })();
  }, []);

  // Check geofence status when we have location + config
  useEffect(() => {
    if (!currentLocation || !leaveConfig) return;
    const gf = leaveConfig.geoFenceLocation || leaveConfig.geoFence;
    const radius = leaveConfig.geoFenceRadius || 150;
    const enabled = leaveConfig.geoFenceEnabled;
    if (!enabled || !gf?.lat || !gf?.lng) {
      setGeoStatus(null);
      return;
    }
    const dist = haversineDistance(currentLocation.lat, currentLocation.lng, gf.lat, gf.lng);
    setGeoStatus({ inside: dist <= radius, distance: Math.round(dist), radius });
  }, [currentLocation, leaveConfig]);

  // ── Clock In ──────────────────────────────────────────

  const handleClockIn = async () => {
    if (clockingIn || !user || !restaurantId) return;
    setClockingIn(true);
    try {
      const location = await getCurrentLocation();
      const result = await apiClient.clockIn(restaurantId, {
        staffId: user.id,
        staffName: user.name || user.displayName || '',
        location,
      });
      setTodayRecord(result);
      showToast(`Clocked in at ${formatTime(result.clockIn)}${result.lateBy > 0 ? ` (Late by ${result.lateBy} min)` : ''}`, 'success');
      loadData();
    } catch (err) {
      const msg = err.message || 'Could not clock in. Please try again.';
      // Enhance geofence error messages
      if (msg.includes('too far') && geoStatus) {
        showToast(`You're ${geoStatus.distance}m from workplace. Please clock in within ${geoStatus.radius}m.`, 'error');
      } else {
        showToast(msg, 'error');
      }
    } finally {
      setClockingIn(false);
    }
  };

  // ── Clock Out ──────────────────────────────────────────

  const handleClockOut = () => {
    if (clockingOut || !user || !restaurantId) return;
    setShowClockOutConfirm(true);
  };

  const confirmClockOut = async () => {
    setShowClockOutConfirm(false);
    setClockingOut(true);
    try {
      const location = await getCurrentLocation();
      const result = await apiClient.clockOut(restaurantId, {
        staffId: user.id,
        location,
      });
      setTodayRecord(prev => ({ ...prev, ...result }));
      showToast(`Clocked out. Total: ${formatHours(result.totalHours)}`, 'success');
      loadData();
    } catch (err) {
      showToast(err.message || 'Could not clock out. Please try again.', 'error');
    } finally {
      setClockingOut(false);
    }
  };

  // ── Apply Leave ──────────────────────────────────────────

  const openApplyLeave = (prefillDate) => {
    setLeaveForm({
      leaveType: 'CL',
      startDate: prefillDate || getTomorrowDate(),
      endDate: '',
      isHalfDay: false,
      halfDayType: 'first_half',
      reason: '',
    });
    setShowApplyLeave(true);
  };

  const handleApplyLeave = async () => {
    if (!user || !restaurantId || applyingLeave) return;
    if (!leaveForm.startDate) {
      showToast('Please select a start date', 'error');
      return;
    }
    setApplyingLeave(true);
    try {
      await apiClient.applyLeave(restaurantId, {
        staffId: user.id,
        staffName: user.name || user.displayName || '',
        leaveType: leaveForm.leaveType,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate || leaveForm.startDate,
        isHalfDay: leaveForm.isHalfDay,
        halfDayType: leaveForm.isHalfDay ? leaveForm.halfDayType : null,
        reason: leaveForm.reason,
      });
      showToast('Leave request submitted!', 'success');
      setShowApplyLeave(false);
      setLeaveForm({ leaveType: 'CL', startDate: '', endDate: '', isHalfDay: false, halfDayType: 'first_half', reason: '' });
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to apply leave', 'error');
    } finally {
      setApplyingLeave(false);
    }
  };

  // ── Computed State ──────────────────────────────────────

  const isClockedIn = todayRecord?.clockIn && !todayRecord?.clockOut;
  const isClockedOut = todayRecord?.clockIn && todayRecord?.clockOut;
  const hasNotClockedIn = !todayRecord?.clockIn;

  const hasLeaveRequestForDate = (date) => {
    return leaveRequests.some(lr => {
      const start = lr.startDate;
      const end = lr.endDate || lr.startDate;
      return date >= start && date <= end;
    });
  };

  const availableLeaveTypes = leaveConfig?.leaveTypes
    ? Object.entries(leaveConfig.leaveTypes).map(([key, val]) => ({ key, label: val.name || key }))
    : DEFAULT_LEAVE_TYPES;

  // ── Render ──────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color="#ef4444" />
          <Text style={s.loadingText}>Loading attendance...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Toast Notification */}
      {toast && (
        <View style={[s.toast, toast.type === 'success' ? s.toastSuccess : toast.type === 'error' ? s.toastError : s.toastInfo]}>
          <Ionicons
            name={toast.type === 'success' ? 'checkmark-circle' : toast.type === 'error' ? 'close-circle' : 'information-circle'}
            size={18}
            color={toast.type === 'success' ? '#059669' : toast.type === 'error' ? '#dc2626' : '#2563eb'}
          />
          <Text style={[s.toastText, { color: toast.type === 'success' ? '#065f46' : toast.type === 'error' ? '#991b1b' : '#1e40af' }]}>{toast.message}</Text>
          <TouchableOpacity onPress={() => setToast(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={16} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      )}

      {/* Clock Out Confirmation Modal */}
      <Modal visible={showClockOutConfirm} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalIconWrap}>
              <View style={s.modalIconCircle}>
                <Ionicons name="log-out-outline" size={28} color="#ef4444" />
              </View>
            </View>
            <Text style={s.modalTitle}>End Your Shift?</Text>
            <Text style={s.modalDesc}>
              You've been working for {formatTimerDisplay(elapsedSeconds)}. Clock out now?
            </Text>
            <View style={s.modalBtns}>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnCancel]} onPress={() => setShowClockOutConfirm(false)}>
                <Text style={s.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnConfirm]} onPress={confirmClockOut}>
                <Ionicons name="log-out-outline" size={18} color="#fff" />
                <Text style={s.modalBtnConfirmText}>Clock Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Apply Leave Modal */}
      <ApplyLeaveModal
        visible={showApplyLeave}
        onClose={() => setShowApplyLeave(false)}
        leaveForm={leaveForm}
        setLeaveForm={setLeaveForm}
        onSubmit={handleApplyLeave}
        submitting={applyingLeave}
        leaveTypes={availableLeaveTypes}
        offline={effectivelyOffline}
      />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Attendance</Text>
          <Text style={s.headerDate}>{formatDate(new Date().toISOString())}</Text>
        </View>
        {geoStatus && (
          <View style={[s.geoChip, geoStatus.inside ? s.geoChipInside : s.geoChipOutside]}>
            <Ionicons
              name={geoStatus.inside ? 'location' : 'location-outline'}
              size={14}
              color={geoStatus.inside ? '#059669' : '#dc2626'}
            />
            <Text style={[s.geoChipText, { color: geoStatus.inside ? '#059669' : '#dc2626' }]}>
              {geoStatus.inside ? 'At workplace' : `${geoStatus.distance}m away`}
            </Text>
          </View>
        )}
      </View>

      {/* Tab Bar */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tab, activeTab === 'attendance' && s.tabActive]}
          onPress={() => setActiveTab('attendance')}
        >
          <Ionicons name="time-outline" size={15} color={activeTab === 'attendance' ? '#fff' : '#6b7280'} />
          <Text style={[s.tabText, activeTab === 'attendance' && s.tabTextActive]}>Attendance</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, activeTab === 'leave' && s.tabActive]}
          onPress={() => setActiveTab('leave')}
        >
          <Ionicons name="calendar-outline" size={15} color={activeTab === 'leave' ? '#fff' : '#6b7280'} />
          <Text style={[s.tabText, activeTab === 'leave' && s.tabTextActive]}>Leave</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity
            style={[s.tab, activeTab === 'dashboard' && s.tabActive]}
            onPress={() => setActiveTab('dashboard')}
          >
            <Ionicons name="stats-chart-outline" size={15} color={activeTab === 'dashboard' ? '#fff' : '#6b7280'} />
            <Text style={[s.tabText, activeTab === 'dashboard' && s.tabTextActive]}>Dashboard</Text>
          </TouchableOpacity>
        )}
      </View>

      {activeTab === 'dashboard' && isAdmin ? (
        <AttendanceWebView user={user} restaurantId={restaurantId} />
      ) : activeTab === 'leave' ? (
        <LeaveTab
          leaveBalances={leaveBalances}
          leaveRequests={leaveRequests}
          onApplyLeave={() => openApplyLeave()}
          refreshing={refreshing}
          onRefresh={onRefresh}
          offline={effectivelyOffline}
        />
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ef4444" />}
        >
          {/* ═══ CLOCK CARD ═══ */}
          <View style={[s.clockCard, {
            backgroundColor: isClockedIn ? '#ecfdf5' : isClockedOut ? '#f8fafc' : '#fef2f2',
          }]}>
            {/* Status row */}
            <View style={s.clockStatusRow}>
              {hasNotClockedIn && (
                <>
                  <PulseDot color="#ef4444" />
                  <Text style={[s.clockStatusText, { color: '#ef4444' }]}>Not Clocked In</Text>
                </>
              )}
              {isClockedIn && (
                <>
                  <PulseDot color="#10b981" />
                  <Text style={[s.clockStatusText, { color: '#059669' }]}>Clocked In</Text>
                  <Text style={s.clockSinceText}>since {formatTime(todayRecord.clockIn)}</Text>
                </>
              )}
              {isClockedOut && (
                <>
                  <Ionicons name="checkmark-circle" size={14} color="#6b7280" />
                  <Text style={[s.clockStatusText, { color: '#6b7280' }]}>Day Complete</Text>
                </>
              )}
            </View>

            {/* Live Timer (clocked in) */}
            {isClockedIn && (
              <View style={s.timerWrap}>
                <Text style={s.timerText}>{formatTimerDisplay(elapsedSeconds)}</Text>
                <Text style={s.timerLabel}>hours on shift</Text>
              </View>
            )}

            {/* Checkmark circle (day complete) */}
            {isClockedOut && (
              <View style={s.completeCircleWrap}>
                <View style={s.completeCircle}>
                  <Ionicons name="checkmark" size={36} color="#10b981" />
                </View>
              </View>
            )}

            {/* Circle Action Button */}
            {hasNotClockedIn && (
              <CircleActionButton
                icon="log-in-outline"
                color="#10b981"
                glowColor="#10b981"
                label="Tap to Clock In"
                onPress={handleClockIn}
                loading={clockingIn}
                disabled={effectivelyOffline}
              />
            )}
            {isClockedIn && (
              <CircleActionButton
                icon="log-out-outline"
                color="#ef4444"
                glowColor="#ef4444"
                label="Tap to Clock Out"
                onPress={handleClockOut}
                loading={clockingOut}
                disabled={effectivelyOffline}
              />
            )}

            {/* Time summary row */}
            {todayRecord && (
              <View style={s.timeSummaryRow}>
                <View style={s.timeSummaryItem}>
                  <Ionicons name="log-in-outline" size={16} color="#10b981" />
                  <Text style={s.timeSummaryLabel}>In</Text>
                  <Text style={s.timeSummaryValue}>{formatTime(todayRecord.clockIn)}</Text>
                </View>
                <View style={s.timeSummaryDivider} />
                <View style={s.timeSummaryItem}>
                  <Ionicons name="log-out-outline" size={16} color="#ef4444" />
                  <Text style={s.timeSummaryLabel}>Out</Text>
                  <Text style={s.timeSummaryValue}>{formatTime(todayRecord.clockOut)}</Text>
                </View>
                <View style={s.timeSummaryDivider} />
                <View style={s.timeSummaryItem}>
                  <Ionicons name="hourglass-outline" size={16} color="#f59e0b" />
                  <Text style={s.timeSummaryLabel}>Total</Text>
                  <Text style={[s.timeSummaryValue, { color: '#f59e0b' }]}>
                    {todayRecord.totalHours != null
                      ? formatHours(todayRecord.totalHours)
                      : isClockedIn
                        ? formatHours(elapsedSeconds / 3600)
                        : '--'}
                  </Text>
                </View>
              </View>
            )}

            {/* Late / Overtime badges */}
            {(todayRecord?.lateBy > 0 || todayRecord?.overtimeHours > 0) && (
              <View style={s.badgesRow}>
                {todayRecord?.lateBy > 0 && (
                  <View style={s.badgeLate}>
                    <Ionicons name="warning-outline" size={13} color="#f59e0b" />
                    <Text style={s.badgeLateText}>Late by {todayRecord.lateBy} min</Text>
                  </View>
                )}
                {todayRecord?.overtimeHours > 0 && (
                  <View style={s.badgeOvertime}>
                    <Ionicons name="trending-up-outline" size={13} color="#3b82f6" />
                    <Text style={s.badgeOvertimeText}>OT: {formatHours(todayRecord.overtimeHours)}</Text>
                  </View>
                )}
              </View>
            )}

            {effectivelyOffline && (
              <Text style={s.offlineNote}>You are offline. Clock in/out requires internet.</Text>
            )}
          </View>

          {/* ═══ RECENT HISTORY ═══ */}
          {recentHistory.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Recent History</Text>
              <View style={s.historyList}>
                {recentHistory.map(record => {
                  const st = STATUS_CONFIG[record.status] || STATUS_CONFIG.absent;
                  const isAbsent = record.status === 'absent';
                  const canApplyLeave = isAbsent && record.date && !hasLeaveRequestForDate(record.date);
                  return (
                    <View key={record.id || record.date} style={s.historyCard}>
                      <View style={s.historyLeft}>
                        <Text style={s.historyDate}>{formatDate(record.date + 'T00:00:00')}</Text>
                        <Text style={s.historyTime}>
                          {record.clockIn ? formatTime(record.clockIn) : '--'} - {record.clockOut ? formatTime(record.clockOut) : '--'}
                          {record.totalHours != null ? ` (${formatHours(record.totalHours)})` : ''}
                        </Text>
                      </View>
                      <View style={s.historyRight}>
                        {canApplyLeave && (
                          <TouchableOpacity
                            style={s.applyLeaveSmall}
                            onPress={() => openApplyLeave(record.date)}
                            disabled={effectivelyOffline}
                          >
                            <Ionicons name="add-circle-outline" size={14} color="#3b82f6" />
                          </TouchableOpacity>
                        )}
                        <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                          <Ionicons name={st.icon} size={12} color={st.color} />
                          <Text style={[s.statusBadgeText, { color: st.color }]}>{st.label}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ═══ TEAM SUMMARY (admin) ═══ */}
          {isAdmin && todayData && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Today's Team</Text>
              <View style={s.summaryRow}>
                <View style={[s.summaryCard, s.summaryCardPresent]}>
                  <View style={s.summaryCardIcon}>
                    <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                  </View>
                  <Text style={[s.summaryNum, { color: '#059669' }]}>{todayData.presentCount || 0}</Text>
                  <Text style={s.summaryLabel}>Present</Text>
                </View>
                <View style={[s.summaryCard, s.summaryCardAbsent]}>
                  <View style={s.summaryCardIcon}>
                    <Ionicons name="close-circle" size={18} color="#ef4444" />
                  </View>
                  <Text style={[s.summaryNum, { color: '#dc2626' }]}>{todayData.absentCount || 0}</Text>
                  <Text style={s.summaryLabel}>Absent</Text>
                </View>
                <View style={[s.summaryCard, s.summaryCardTotal]}>
                  <View style={s.summaryCardIcon}>
                    <Ionicons name="people" size={18} color="#6b7280" />
                  </View>
                  <Text style={[s.summaryNum, { color: '#374151' }]}>{todayData.staffCount || 0}</Text>
                  <Text style={s.summaryLabel}>Total</Text>
                </View>
              </View>

              {(todayData.attendance || []).map(record => {
                const st = STATUS_CONFIG[record.status] || STATUS_CONFIG.absent;
                return (
                  <View key={record.staffId} style={s.teamRow}>
                    <View style={s.teamAvatar}>
                      <Text style={s.teamAvatarText}>
                        {(record.staffName || 'S').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={s.teamInfo}>
                      <Text style={s.teamName}>{record.staffName || 'Staff'}</Text>
                      <Text style={s.teamTime}>
                        {record.clockIn ? formatTime(record.clockIn) : '--:--'}
                        {' \u2192 '}
                        {record.clockOut ? formatTime(record.clockOut) : '--:--'}
                      </Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[s.statusBadgeText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Leave Tab Component ──────────────────────────────────────

function LeaveTab({ leaveBalances, leaveRequests, onApplyLeave, refreshing, onRefresh, offline }) {
  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ef4444" />}
    >
      {/* Leave Balances */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Leave Balance</Text>
        {leaveBalances && Object.keys(leaveBalances).length > 0 ? (
          <View style={s.leaveGrid}>
            {Object.entries(leaveBalances).map(([key, bal]) => {
              const total = bal.total ?? 0;
              const remaining = bal.remaining ?? 0;
              const used = bal.used ?? 0;
              const pct = total > 0 ? remaining / total : 0;
              return (
                <View key={key} style={s.leaveCard}>
                  {/* Mini progress ring */}
                  <View style={s.leaveRingWrap}>
                    <View style={[s.leaveRingBg, { borderColor: '#e5e7eb' }]}>
                      <View style={[s.leaveRingFill, {
                        borderColor: pct > 0.5 ? '#10b981' : pct > 0.2 ? '#f59e0b' : '#ef4444',
                        borderTopColor: 'transparent',
                        transform: [{ rotate: `${pct * 360}deg` }],
                      }]} />
                    </View>
                    <Text style={s.leaveRingNum}>{remaining}</Text>
                  </View>
                  <Text style={s.leaveType}>{key.toUpperCase()}</Text>
                  <Text style={s.leaveUsedLabel}>{used} used / {total} total</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={s.emptyState}>
            <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
            <Text style={s.emptyText}>No leave balance configured yet</Text>
            <Text style={s.emptySubtext}>Ask your manager to set up leave policy</Text>
          </View>
        )}
      </View>

      {/* Apply Button */}
      <TouchableOpacity
        style={s.applyLeaveBtn}
        onPress={onApplyLeave}
        activeOpacity={0.8}
        disabled={offline}
      >
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <Text style={s.applyLeaveBtnText}>Apply for Leave</Text>
      </TouchableOpacity>

      {offline && (
        <Text style={s.offlineNote}>You are offline. Leave requests require internet.</Text>
      )}

      {/* My Requests */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>My Requests</Text>
        {leaveRequests.length > 0 ? (
          leaveRequests.map(req => {
            const ls = LEAVE_STATUS[req.status] || LEAVE_STATUS.pending;
            const dateRange = req.startDate === req.endDate
              ? formatDateShort(req.startDate)
              : `${formatDateShort(req.startDate)} - ${formatDateShort(req.endDate)}`;
            return (
              <View key={req.id} style={s.leaveReqCard}>
                <View style={s.leaveReqTop}>
                  <View style={s.leaveReqTypeBadge}>
                    <Text style={s.leaveReqTypeText}>{req.leaveType?.toUpperCase()}</Text>
                  </View>
                  <Text style={s.leaveReqDate}>{dateRange}</Text>
                  {req.isHalfDay && (
                    <View style={s.halfDayBadge}>
                      <Text style={s.halfDayText}>Half Day</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }} />
                  <View style={[s.leaveStatusBadge, { backgroundColor: ls.bg }]}>
                    <Ionicons name={ls.icon} size={12} color={ls.color} />
                    <Text style={[s.leaveStatusText, { color: ls.color }]}>{ls.label}</Text>
                  </View>
                </View>
                {req.reason ? (
                  <Text style={s.leaveReqReason} numberOfLines={2}>{req.reason}</Text>
                ) : null}
                {req.totalDays ? (
                  <Text style={s.leaveReqDays}>{req.totalDays} day{req.totalDays !== 1 ? 's' : ''}</Text>
                ) : null}
              </View>
            );
          })
        ) : (
          <View style={s.emptyState}>
            <Ionicons name="document-text-outline" size={32} color="#d1d5db" />
            <Text style={s.emptyText}>No leave requests yet</Text>
            <Text style={s.emptySubtext}>Tap "Apply for Leave" to submit one</Text>
          </View>
        )}
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ── Apply Leave Modal ──────────────────────────────────────

function ApplyLeaveModal({ visible, onClose, leaveForm, setLeaveForm, onSubmit, submitting, leaveTypes, offline }) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.modalOverlay}>
        <View style={[s.modalBox, { maxWidth: 400 }]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Apply for Leave</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {/* Leave Type */}
            <Text style={s.formLabel}>Leave Type</Text>
            <View style={s.leaveTypePicker}>
              {leaveTypes.map(lt => (
                <TouchableOpacity
                  key={lt.key}
                  style={[s.leaveTypeChip, leaveForm.leaveType === lt.key && s.leaveTypeChipActive]}
                  onPress={() => setLeaveForm(f => ({ ...f, leaveType: lt.key }))}
                >
                  <Text style={[s.leaveTypeChipText, leaveForm.leaveType === lt.key && s.leaveTypeChipTextActive]}>
                    {lt.key}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Start Date */}
            <Text style={s.formLabel}>Start Date</Text>
            <TextInput
              style={s.formInput}
              value={leaveForm.startDate}
              onChangeText={v => setLeaveForm(f => ({ ...f, startDate: v }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9ca3af"
              keyboardType="numbers-and-punctuation"
            />

            {/* End Date */}
            <Text style={s.formLabel}>End Date (optional, for multi-day)</Text>
            <TextInput
              style={s.formInput}
              value={leaveForm.endDate}
              onChangeText={v => setLeaveForm(f => ({ ...f, endDate: v }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9ca3af"
              keyboardType="numbers-and-punctuation"
            />

            {/* Half Day Toggle */}
            <View style={s.switchRow}>
              <Text style={s.formLabel}>Half Day</Text>
              <Switch
                value={leaveForm.isHalfDay}
                onValueChange={v => setLeaveForm(f => ({ ...f, isHalfDay: v }))}
                trackColor={{ false: '#e5e7eb', true: '#bfdbfe' }}
                thumbColor={leaveForm.isHalfDay ? '#3b82f6' : '#9ca3af'}
              />
            </View>

            {leaveForm.isHalfDay && (
              <View style={s.halfDayPicker}>
                <TouchableOpacity
                  style={[s.halfDayOption, leaveForm.halfDayType === 'first_half' && s.halfDayOptionActive]}
                  onPress={() => setLeaveForm(f => ({ ...f, halfDayType: 'first_half' }))}
                >
                  <Text style={[s.halfDayOptionText, leaveForm.halfDayType === 'first_half' && s.halfDayOptionTextActive]}>First Half</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.halfDayOption, leaveForm.halfDayType === 'second_half' && s.halfDayOptionActive]}
                  onPress={() => setLeaveForm(f => ({ ...f, halfDayType: 'second_half' }))}
                >
                  <Text style={[s.halfDayOptionText, leaveForm.halfDayType === 'second_half' && s.halfDayOptionTextActive]}>Second Half</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Reason */}
            <Text style={s.formLabel}>Reason</Text>
            <TextInput
              style={[s.formInput, { height: 80, textAlignVertical: 'top' }]}
              value={leaveForm.reason}
              onChangeText={v => setLeaveForm(f => ({ ...f, reason: v }))}
              placeholder="Reason for leave..."
              placeholderTextColor="#9ca3af"
              multiline
            />
          </ScrollView>

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, (submitting || offline) && { opacity: 0.6 }]}
            onPress={onSubmit}
            disabled={submitting || offline}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.submitBtnText}>Submit Leave Request</Text>
            )}
          </TouchableOpacity>

          {offline && (
            <Text style={[s.offlineNote, { marginTop: 8 }]}>You are offline.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── WebView Dashboard (Admin) ──────────────────────────────

function AttendanceWebView({ user, restaurantId }) {
  const [webUrl, setWebUrl] = useState(null);

  useEffect(() => {
    (async () => {
      const token = await apiClient.getToken();
      if (!token || !restaurantId) return;

      const baseUrl = WEB_BASE_URL || 'https://app.dineopen.com';
      const u = new URL(`${baseUrl}/attendance`);
      u.searchParams.set('token', token);
      u.searchParams.set('restaurantId', restaurantId);
      setWebUrl(u.toString());
    })();
  }, [restaurantId]);

  if (!webUrl) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#ef4444" />
      </View>
    );
  }

  const injectedJS = `
    (function() {
      try {
        localStorage.setItem('token', '${webUrl.split('token=')[1]?.split('&')[0] || ''}');
        localStorage.setItem('selectedRestaurantId', '${restaurantId}');
        localStorage.setItem('user', '${JSON.stringify(user).replace(/'/g, "\\'")}');
        window.__DINEOPEN_MOBILE_EMBED__ = true;
      } catch(e) {}
    })();
    true;
  `;

  return (
    <WebView
      source={{ uri: webUrl }}
      injectedJavaScriptBeforeContentLoaded={injectedJS}
      javaScriptEnabled
      domStorageEnabled
      cacheEnabled
      startInLoadingState
      renderLoading={() => (
        <View style={[s.centered, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff' }]}>
          <ActivityIndicator size="large" color="#ef4444" />
        </View>
      )}
      style={{ flex: 1 }}
    />
  );
}

// ── Styles ──────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#9ca3af' },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  headerDate: { fontSize: 13, color: '#9ca3af', fontWeight: '500', marginTop: 2 },

  // Geo chip
  geoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  geoChipInside: { backgroundColor: '#d1fae5' },
  geoChipOutside: { backgroundColor: '#fee2e2' },
  geoChipText: { fontSize: 12, fontWeight: '600' },

  // Tab bar
  tabBar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6',
  },
  tabActive: { backgroundColor: '#ef4444' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#fff' },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },

  // ═══ CLOCK CARD ═══
  clockCard: {
    borderRadius: 20, overflow: 'hidden', paddingBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  clockStatusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  clockStatusText: { fontSize: 16, fontWeight: '700' },
  clockSinceText: { fontSize: 13, color: '#6b7280', marginLeft: 4 },

  // Live timer
  timerWrap: { alignItems: 'center', paddingVertical: 16 },
  timerText: {
    fontSize: 44, fontWeight: '200', color: '#111827',
    letterSpacing: 2, fontVariant: ['tabular-nums'],
  },
  timerLabel: { fontSize: 13, color: '#6b7280', marginTop: 4, fontWeight: '500' },

  // Complete circle
  completeCircleWrap: { alignItems: 'center', paddingVertical: 20 },
  completeCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#d1fae5',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#10b981',
  },

  // Circle button
  circleButtonWrap: { alignItems: 'center', paddingVertical: 12 },
  circleGlow: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    top: 12,
  },
  circleButton: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  circleLabel: { fontSize: 13, fontWeight: '600', marginTop: 10 },

  // Time summary row
  timeSummaryRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 14, padding: 14,
  },
  timeSummaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  timeSummaryLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },
  timeSummaryValue: { fontSize: 14, fontWeight: '700', color: '#111827' },
  timeSummaryDivider: { width: 1, height: 28, backgroundColor: 'rgba(0,0,0,0.08)' },

  // Badges
  badgesRow: {
    flexDirection: 'row', gap: 8, marginHorizontal: 20, marginTop: 10, flexWrap: 'wrap',
  },
  badgeLate: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#fef3c7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  badgeLateText: { fontSize: 12, fontWeight: '600', color: '#f59e0b' },
  badgeOvertime: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#dbeafe', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  badgeOvertimeText: { fontSize: 12, fontWeight: '600', color: '#3b82f6' },

  offlineNote: { fontSize: 12, color: '#f59e0b', textAlign: 'center', marginTop: 8 },

  // ═══ SECTIONS ═══
  section: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },

  // ═══ HISTORY ═══
  historyList: { gap: 8 },
  historyCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 14,
  },
  historyLeft: { flex: 1 },
  historyDate: { fontSize: 14, fontWeight: '600', color: '#111827' },
  historyTime: { fontSize: 12, color: '#9ca3af', marginTop: 3 },
  historyRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  applyLeaveSmall: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#eff6ff',
    alignItems: 'center', justifyContent: 'center',
  },

  // Status badge
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  // ═══ TEAM SUMMARY ═══
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryCard: {
    flex: 1, borderRadius: 14, padding: 14, alignItems: 'center',
    borderLeftWidth: 4,
  },
  summaryCardPresent: { backgroundColor: '#ecfdf5', borderLeftColor: '#10b981' },
  summaryCardAbsent: { backgroundColor: '#fef2f2', borderLeftColor: '#ef4444' },
  summaryCardTotal: { backgroundColor: '#f3f4f6', borderLeftColor: '#6b7280' },
  summaryCardIcon: { marginBottom: 6 },
  summaryNum: { fontSize: 24, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '600', color: '#6b7280', marginTop: 2 },

  teamRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  teamAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  teamAvatarText: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  teamInfo: { flex: 1 },
  teamName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  teamTime: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  // ═══ LEAVE TAB ═══
  leaveGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  leaveCard: {
    flex: 1, minWidth: 90, backgroundColor: '#f8fafc', borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#f3f4f6',
  },
  leaveRingWrap: {
    width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  leaveRingBg: {
    position: 'absolute', width: 48, height: 48, borderRadius: 24,
    borderWidth: 4, borderColor: '#e5e7eb',
  },
  leaveRingFill: {
    position: 'absolute', width: 48, height: 48, borderRadius: 24,
    borderWidth: 4, borderBottomColor: 'transparent', borderLeftColor: 'transparent',
  },
  leaveRingNum: { fontSize: 16, fontWeight: '800', color: '#111827' },
  leaveType: { fontSize: 11, fontWeight: '700', color: '#6b7280', marginBottom: 2 },
  leaveUsedLabel: { fontSize: 10, color: '#9ca3af' },

  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 14, fontWeight: '600', color: '#9ca3af', marginTop: 8 },
  emptySubtext: { fontSize: 12, color: '#d1d5db', marginTop: 4 },

  applyLeaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#3b82f6', paddingVertical: 14, borderRadius: 14,
  },
  applyLeaveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  leaveReqCard: {
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6',
  },
  leaveReqTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leaveReqTypeBadge: {
    backgroundColor: '#111827', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  leaveReqTypeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  leaveReqDate: { fontSize: 13, fontWeight: '600', color: '#374151' },
  halfDayBadge: {
    backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  halfDayText: { fontSize: 10, fontWeight: '600', color: '#f59e0b' },
  leaveStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  leaveStatusText: { fontSize: 11, fontWeight: '700' },
  leaveReqReason: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  leaveReqDays: { fontSize: 11, color: '#9ca3af', marginTop: 4 },

  // ═══ MODALS ═══
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalBox: {
    backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '100%', maxWidth: 340,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  modalIconWrap: { alignItems: 'center', marginBottom: 16 },
  modalIconCircle: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#fee2e2',
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827', textAlign: 'center' },
  modalDesc: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 20 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: 14,
  },
  modalBtnCancel: { backgroundColor: '#f3f4f6' },
  modalBtnCancelText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  modalBtnConfirm: { backgroundColor: '#ef4444' },
  modalBtnConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Form
  formLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6 },
  formInput: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#111827',
  },
  leaveTypePicker: { flexDirection: 'row', gap: 8 },
  leaveTypeChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  leaveTypeChipActive: { backgroundColor: '#111827', borderColor: '#111827' },
  leaveTypeChipText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  leaveTypeChipTextActive: { color: '#fff' },

  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12,
  },
  halfDayPicker: { flexDirection: 'row', gap: 8, marginTop: 8 },
  halfDayOption: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  halfDayOptionActive: { backgroundColor: '#dbeafe', borderColor: '#3b82f6' },
  halfDayOptionText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  halfDayOptionTextActive: { color: '#3b82f6' },

  submitBtn: {
    backgroundColor: '#3b82f6', paddingVertical: 14, borderRadius: 12,
    alignItems: 'center', marginTop: 16,
  },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Toast
  toast: {
    position: 'absolute', top: 8, left: 16, right: 16, zIndex: 1000,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 5,
  },
  toastSuccess: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#bbf7d0' },
  toastError: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca' },
  toastInfo: { backgroundColor: '#dbeafe', borderWidth: 1, borderColor: '#93c5fd' },
  toastText: { flex: 1, fontSize: 14, fontWeight: '600' },
});
