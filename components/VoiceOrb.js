// The Voice Ticket orb: a glowing sphere that breathes when idle, ripples with the staff's voice,
// swells with the assistant's voice, and shows dots while thinking. Levels come from a getter
// (mic metering / WebRTC stats) polled here — the screen never re-renders for animation.
import React, { useEffect } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, withDelay, Easing, cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

const ACTIVE = ['listening', 'hearing', 'speaking', 'thinking', 'connecting'];

export default function VoiceOrb({ size = 220, state = 'idle', getLevels, onPress, disabled, done = false }) {
  const you = useSharedValue(0);
  const ai = useSharedValue(0);
  const breathe = useSharedValue(0);
  const spin = useSharedValue(0);
  const active = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.sin) }), -1, true);
    spin.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1, false);
    return () => { cancelAnimation(breathe); cancelAnimation(spin); };
  }, [breathe, spin]);

  useEffect(() => { active.value = withTiming(ACTIVE.includes(state) ? 1 : 0, { duration: 350 }); }, [state, active]);

  useEffect(() => {
    if (!getLevels) return undefined;
    const t = setInterval(() => {
      const l = getLevels() || {};
      you.value = withTiming(Math.max(0, Math.min(1, l.you || 0)), { duration: 90 });
      ai.value = withTiming(Math.max(0, Math.min(1, l.ai || 0)), { duration: 90 });
    }, 70);
    return () => clearInterval(t);
  }, [getLevels, you, ai]);

  const core = size * 0.76;
  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + you.value * 0.07 + ai.value * 0.09 + (1 - active.value) * breathe.value * 0.035 }],
  }));
  const auraStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + active.value * 0.35 + ai.value * 0.3,
    transform: [{ rotate: `${spin.value * 360}deg` }, { scale: 0.92 + ai.value * 0.3 + you.value * 0.18 + breathe.value * 0.03 }],
  }));
  const r1 = useAnimatedStyle(() => ({ opacity: active.value * 0.55, transform: [{ scale: 1 + you.value * 0.16 + ai.value * 0.1 }] }));
  const r2 = useAnimatedStyle(() => ({ opacity: active.value * 0.42, transform: [{ scale: 1 + you.value * 0.28 + ai.value * 0.1 }] }));
  const r3 = useAnimatedStyle(() => ({ opacity: active.value * 0.29, transform: [{ scale: 1 + you.value * 0.4 + ai.value * 0.1 }] }));

  const thinking = state === 'thinking' || state === 'connecting';
  const waving = state === 'listening' || state === 'hearing' || state === 'speaking';

  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={ACTIVE.includes(state) ? 'Stop' : 'Start talking'}
      style={{ width: size * 1.25, height: size * 1.25, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, auraStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="ga" cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor="#FF6B5B" stopOpacity="0.55" /><Stop offset="1" stopColor="#FF6B5B" stopOpacity="0" /></RadialGradient>
            <RadialGradient id="gb" cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor="#FFB4A3" stopOpacity="0.6" /><Stop offset="1" stopColor="#FFB4A3" stopOpacity="0" /></RadialGradient>
          </Defs>
          <Ellipse cx="44" cy="46" rx="40" ry="34" fill="url(#ga)" />
          <Ellipse cx="58" cy="56" rx="34" ry="38" fill="url(#gb)" />
        </Svg>
      </Animated.View>
      {[r3, r2, r1].map((st, i) => (
        <Animated.View key={i} pointerEvents="none" style={[styles.ring, { width: core + (2 - i) * 22 + 14, height: core + (2 - i) * 22 + 14, borderRadius: (core + (2 - i) * 22 + 14) / 2 }, st]} />
      ))}
      <Animated.View style={[{ width: core, height: core, borderRadius: core / 2 }, styles.coreShadow, coreStyle, disabled && { opacity: 0.6 }]}>
        <Svg width={core} height={core} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="gc" cx="34%" cy="28%" r="78%">
              {done ? (
                <>
                  <Stop offset="0" stopColor="#7FE0A8" /><Stop offset="0.55" stopColor="#1F9D5B" /><Stop offset="1" stopColor="#0F7A43" />
                </>
              ) : (
                <>
                  <Stop offset="0" stopColor={state === 'speaking' ? '#FFB3A6' : '#FF9A8A'} /><Stop offset="0.4" stopColor="#F0463A" /><Stop offset="0.68" stopColor="#D92D20" /><Stop offset="1" stopColor="#9F1F14" />
                </>
              )}
            </RadialGradient>
          </Defs>
          <Circle cx={core / 2} cy={core / 2} r={core / 2} fill="url(#gc)" />
        </Svg>
        <View style={styles.center}>
          {done ? <Ionicons name="checkmark" size={core * 0.32} color="#fff" />
            : thinking ? <Dots />
              : waving ? <Bars you={you} ai={ai} idle={state === 'listening'} h={core * 0.34} />
                : <Ionicons name="mic" size={core * 0.3} color="#fff" />}
        </View>
      </Animated.View>
    </Pressable>
  );
}

function Bars({ you, ai, idle, h }) {
  return (
    <View style={styles.bars}>
      {[0.55, 0.85, 1, 0.75, 0.5].map((k, i) => <Bar key={i} k={k} i={i} you={you} ai={ai} idle={idle} h={h} />)}
    </View>
  );
}
function Bar({ k, i, you, ai, idle, h }) {
  const wobble = useSharedValue(0);
  useEffect(() => {
    wobble.value = withDelay(i * 110, withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(wobble);
  }, [wobble, i]);
  const st = useAnimatedStyle(() => ({ height: 10 + Math.min(1, you.value + ai.value) * k * h + (idle ? wobble.value * 8 : 0) }));
  return <Animated.View style={[styles.bar, st]} />;
}

function Dots() {
  return <View style={styles.dots}>{[0, 1, 2].map((i) => <Dot key={i} i={i} />)}</View>;
}
function Dot({ i }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(i * 150, withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0, { duration: 320 })), -1, false));
    return () => cancelAnimation(y);
  }, [y, i]);
  const st = useAnimatedStyle(() => ({ opacity: 0.5 + y.value * 0.5, transform: [{ translateY: -y.value * 9 }] }));
  return <Animated.View style={[styles.dot, st]} />;
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(217,45,32,0.35)' },
  coreShadow: { shadowColor: '#D92D20', shadowOpacity: 0.55, shadowRadius: 26, shadowOffset: { width: 0, height: 16 }, elevation: 12, overflow: 'visible' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bar: { width: 7, borderRadius: 4, backgroundColor: '#fff' },
  dots: { flexDirection: 'row', gap: 9 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' },
});
