import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

/**
 * Thin animated indeterminate progress bar shown when background sync is active.
 * Place below the header in each tab screen.
 */
export default function SyncIndicator({ visible, color = '#ef4444' }) {
  const position = useRef(new Animated.Value(-SCREEN_WIDTH * 0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const animRef = useRef(null);

  useEffect(() => {
    if (visible) {
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      const loop = Animated.loop(
        Animated.timing(position, {
          toValue: SCREEN_WIDTH,
          duration: 1200,
          useNativeDriver: true,
        })
      );
      animRef.current = loop;
      loop.start();
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      if (animRef.current) {
        animRef.current.stop();
        animRef.current = null;
        position.setValue(-SCREEN_WIDTH * 0.4);
      }
    }
    return () => {
      if (animRef.current) {
        animRef.current.stop();
      }
    };
  }, [visible]);

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.bar,
            {
              backgroundColor: color,
              width: SCREEN_WIDTH * 0.4,
              transform: [{ translateX: position }],
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 3,
    overflow: 'hidden',
  },
  track: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  bar: {
    height: '100%',
    borderRadius: 2,
  },
});
