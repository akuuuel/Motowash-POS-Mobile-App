import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './themed-text';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type AlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

interface SweetAlertButton {
  text: string;
  onPress?: () => void;
  style?: 'confirm' | 'cancel' | 'danger';
}

interface SweetAlertProps {
  visible: boolean;
  type?: AlertType;
  title: string;
  message?: string;
  buttons?: SweetAlertButton[];
  onDismiss?: () => void;
  autoClose?: number; // ms, 0 = manual close only
}

const TYPE_CONFIG: Record<
  AlertType,
  { color: string; bgLight: string; icon: any; iconColor: string }
> = {
  success: {
    color: '#059669',
    bgLight: '#ECFDF5',
    icon: 'checkmark-circle',
    iconColor: '#059669',
  },
  error: {
    color: '#DC2626',
    bgLight: '#FEF2F2',
    icon: 'close-circle',
    iconColor: '#DC2626',
  },
  warning: {
    color: '#D97706',
    bgLight: '#FFFBEB',
    icon: 'warning',
    iconColor: '#D97706',
  },
  info: {
    color: '#2563EB',
    bgLight: '#EFF6FF',
    icon: 'information-circle',
    iconColor: '#2563EB',
  },
  confirm: {
    color: '#7C3AED',
    bgLight: '#F5F3FF',
    icon: 'help-circle',
    iconColor: '#7C3AED',
  },
};

export function SweetAlert({
  visible,
  type = 'info',
  title,
  message,
  buttons,
  onDismiss,
  autoClose = 0,
}: SweetAlertProps) {
  const config = TYPE_CONFIG[type];

  // Animated values
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Animate in
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 60,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Icon bounce after card appears
        Animated.sequence([
          Animated.spring(iconScale, {
            toValue: 1.2,
            tension: 80,
            friction: 4,
            useNativeDriver: true,
          }),
          Animated.spring(iconScale, {
            toValue: 1,
            tension: 100,
            friction: 5,
            useNativeDriver: true,
          }),
        ]).start();
      });

      // Auto close
      if (autoClose > 0) {
        const timer = setTimeout(() => {
          handleDismiss();
        }, autoClose);
        return () => clearTimeout(timer);
      }
    } else {
      // Reset for next time
      scaleAnim.setValue(0.7);
      opacityAnim.setValue(0);
      backdropOpacity.setValue(0);
      iconScale.setValue(0);
      iconRotate.setValue(0);
    }
  }, [visible]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss?.();
    });
  };

  // Default single OK button
  const resolvedButtons: SweetAlertButton[] =
    buttons && buttons.length > 0
      ? buttons
      : [{ text: 'OK', onPress: onDismiss, style: 'confirm' }];

  const getButtonStyle = (btnStyle: SweetAlertButton['style']) => {
    switch (btnStyle) {
      case 'cancel':
        return styles.btnCancel;
      case 'danger':
        return [styles.btnConfirm, { backgroundColor: '#DC2626' }];
      default:
        return [styles.btnConfirm, { backgroundColor: config.color }];
    }
  };

  const getButtonTextStyle = (btnStyle: SweetAlertButton['style']) => {
    switch (btnStyle) {
      case 'cancel':
        return styles.btnCancelText;
      default:
        return styles.btnConfirmText;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={type !== 'confirm' ? handleDismiss : undefined}
        />

        <Animated.View
          style={[
            styles.card,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Top accent bar */}
          <View style={[styles.accentBar, { backgroundColor: config.color }]} />

          {/* Icon Container */}
          <Animated.View
            style={[
              styles.iconCircle,
              { backgroundColor: config.bgLight, transform: [{ scale: iconScale }] },
            ]}
          >
            <Ionicons name={config.icon} size={44} color={config.iconColor} />
          </Animated.View>

          {/* Title */}
          <ThemedText style={styles.title}>{title}</ThemedText>

          {/* Message */}
          {!!message && (
            <ThemedText style={styles.message}>{message}</ThemedText>
          )}

          {/* Buttons */}
          <View
            style={[
              styles.btnRow,
              resolvedButtons.length === 1 && styles.btnRowCenter,
            ]}
          >
            {resolvedButtons.map((btn, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.btnBase,
                  resolvedButtons.length === 1 && styles.btnFull,
                  getButtonStyle(btn.style),
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  handleDismiss();
                  btn.onPress?.();
                }}
              >
                <ThemedText style={getButtonTextStyle(btn.style)}>
                  {btn.text}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// =========================================
// HOOK: useSweetAlert
// =========================================
interface AlertOptions {
  type?: AlertType;
  title: string;
  message?: string;
  buttons?: SweetAlertButton[];
  autoClose?: number;
}

interface SweetAlertState extends AlertOptions {
  visible: boolean;
}

export function useSweetAlert() {
  const [alertState, setAlertState] = React.useState<SweetAlertState>({
    visible: false,
    title: '',
  });

  const showAlert = (opts: AlertOptions) => {
    setAlertState({ ...opts, visible: true });
  };

  const hideAlert = () => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  };

  const alert = (title: string, message?: string, type: AlertType = 'info') => {
    showAlert({ title, message, type });
  };

  const success = (title: string, message?: string) => {
    showAlert({ title, message, type: 'success', autoClose: 2500 });
  };

  const error = (title: string, message?: string) => {
    showAlert({ title, message, type: 'error' });
  };

  const warning = (title: string, message?: string) => {
    showAlert({ title, message, type: 'warning' });
  };

  const confirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = 'Lanjutkan',
    cancelText = 'Batal'
  ) => {
    showAlert({
      title,
      message,
      type: 'confirm',
      buttons: [
        { text: cancelText, style: 'cancel', onPress: hideAlert },
        { text: confirmText, style: 'danger', onPress: onConfirm },
      ],
    });
  };

  const AlertComponent = () => (
    <SweetAlert
      visible={alertState.visible}
      type={alertState.type}
      title={alertState.title}
      message={alertState.message}
      buttons={alertState.buttons}
      autoClose={alertState.autoClose}
      onDismiss={hideAlert}
    />
  );

  return { showAlert, hideAlert, alert, success, error, warning, confirm, AlertComponent };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    alignItems: 'center',
    paddingTop: 0,
    paddingBottom: 24,
    paddingHorizontal: 20,
    elevation: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    overflow: 'hidden',
  },
  accentBar: {
    width: '100%',
    height: 5,
    marginBottom: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 4,
  },
  btnRowCenter: {
    justifyContent: 'center',
  },
  btnBase: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFull: {
    flex: 1,
  },
  btnConfirm: {
    backgroundColor: '#2563EB',
  },
  btnCancel: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  btnConfirmText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  btnCancelText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 14,
  },
});
