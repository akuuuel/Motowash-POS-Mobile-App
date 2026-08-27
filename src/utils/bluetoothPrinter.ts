import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking, Alert, Platform, NativeModules, PermissionsAndroid } from 'react-native';
import { useSettingsStore } from '../store/useSettingsStore';
import {
  ReceiptData,
  SlipGajiData,
  buildReceiptBytes,
  buildSlipGajiBytes,
  buildTestPrintBytes,
  buildReceiptHtml,
  buildSlipGajiHtml,
  stringToBytes,
  bytesToBase64,
} from './receiptFormatter';

const { BluetoothPrinterModule } = NativeModules;

export interface BluetoothDeviceInfo {
  name: string;
  address: string;
}

export { ReceiptData, SlipGajiData } from './receiptFormatter';

/**
 * Meminta Izin Akses Bluetooth di Android secara Profesional
 */
export const requestBluetoothPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;

  try {
    if (Platform.Version >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      const connectStatus = granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT];

      if (connectStatus !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert(
          'Izin Bluetooth Diperlukan',
          'Aplikasi membutuhkan izin Bluetooth untuk terhubung ke printer thermal Anda. Silakan izinkan di Pengaturan HP.',
          [
            { text: 'Batal', style: 'cancel' },
            { text: 'Buka Pengaturan', onPress: () => Linking.openSettings() },
          ]
        );
        return false;
      }
      return true;
    } else {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return true;
    }
  } catch (err) {
    console.warn('[BT] Permission error:', err);
    return true;
  }
};

/**
 * Mendapatkan Daftar Device Bluetooth Thermal yang Dipasangkan (Paired) di HP
 */
export const getNativePairedDevices = async (): Promise<BluetoothDeviceInfo[]> => {
  if (Platform.OS !== 'android') return [];

  if (!BluetoothPrinterModule || !BluetoothPrinterModule.getPairedDevices) {
    return [];
  }

  const hasPerms = await requestBluetoothPermissions();
  if (!hasPerms) return [];

  try {
    const devices = await BluetoothPrinterModule.getPairedDevices();
    return devices || [];
  } catch (e: any) {
    console.error('[BT] getPairedDevices error:', e);
  }
  return [];
};

/**
 * Membuka Halaman Pengaturan Bluetooth HP Android
 */
export const openBluetoothSettings = async () => {
  if (Platform.OS === 'android') {
    try {
      await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
    } catch (e) {
      await Linking.openSettings();
    }
  } else {
    await Linking.openSettings();
  }
};

/**
 * Fungsi Pengiriman Data ESC/POS ke Printer Thermal via Bluetooth Direct Socket Native
 */
const sendToNativePrinter = async (macAddress: string, base64Data: string): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    throw new Error('Sistem cetak Bluetooth Direct Socket hanya mendukung sistem operasi Android.');
  }

  if (!BluetoothPrinterModule || !BluetoothPrinterModule.printRawBytes) {
    throw new Error('Modul koneksi printer tidak siap. Silakan nyalakan ulang aplikasi.');
  }

  const hasPerms = await requestBluetoothPermissions();
  if (!hasPerms) {
    throw new Error('Izin Bluetooth belum diberikan. Aktifkan izin Bluetooth pada Pengaturan HP.');
  }

  try {
    await BluetoothPrinterModule.printRawBytes(macAddress, base64Data);
    return true;
  } catch (error: any) {
    const message = error?.message || '';

    if (message.includes('Bluetooth belum dinyalakan')) {
      throw new Error('Bluetooth HP dalam keadaan mati. Silakan aktifkan Bluetooth terlebih dahulu.');
    }
    if (message.includes('tidak ditemukan')) {
      throw new Error('Printer tidak dapat ditemukan. Pastikan printer dalam keadaan menyala dan dekat dengan HP.');
    }

    throw new Error(message || 'Gagal terhubung ke printer thermal.');
  }
};

/**
 * Tes Cetak Struk (Test Print)
 */
export const testPrintThermal = async (
  targetMacAddress?: string,
  alertHandler?: {
    success?: (title: string, message: string) => void;
    error?: (title: string, message: string) => void;
    warning?: (title: string, message: string) => void;
  }
): Promise<boolean> => {
  const storeSettings = useSettingsStore.getState();
  const mac = targetMacAddress || storeSettings.printerMacAddress;

  if (!mac) {
    if (alertHandler?.warning) {
      alertHandler.warning('Printer Belum Dipilih', 'Silakan pilih printer terlebih dahulu di menu Pengaturan Printer.');
    } else {
      Alert.alert(
        'Printer Belum Dipilih',
        'Silakan pilih printer terlebih dahulu di menu Pengaturan Printer.'
      );
    }
    return false;
  }

  try {
    const rawEscPosString = buildTestPrintBytes(storeSettings.businessName);
    const bytes = stringToBytes(rawEscPosString);
    const base64Data = bytesToBase64(bytes);

    await sendToNativePrinter(mac, base64Data);
    if (alertHandler?.success) {
      alertHandler.success('Tes Cetak Berhasil', 'Printer thermal berhasil terhubung dan mencetak struk percobaan!');
    } else {
      Alert.alert('Tes Cetak Berhasil', 'Printer thermal berhasil terhubung dan mencetak struk percobaan!');
    }
    return true;
  } catch (e: any) {
    if (alertHandler?.error) {
      alertHandler.error('Gagal Cetak', e.message || 'Printer tidak merespon koneksi.');
    } else {
      Alert.alert('Gagal Cetak', e.message || 'Printer tidak merespon koneksi.');
    }
    return false;
  }
};

/**
 * Fallback Berkas Struk ke Berbagi Bluetooth HP
 */
export const shareToBluetoothPrinter = async (data: ReceiptData) => {
  try {
    const rawEscPosString = buildReceiptBytes(data);
    const fileName = `Struk_${data.transactionNumber.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, rawEscPosString, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: 'Kirim Struk Ke Printer Bluetooth',
      });
    }
  } catch (error) {
    console.error('Share printer error:', error);
  }
};

/**
 * Fallback Berkas Slip Gaji ke Berbagi Bluetooth HP
 */
export const shareSlipGajiToBluetoothPrinter = async (data: SlipGajiData) => {
  try {
    const rawEscPosString = buildSlipGajiBytes(data);
    const fileName = `SlipGaji_${data.payoutNumber.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, rawEscPosString, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: 'Kirim Slip Gaji Ke Printer Bluetooth',
      });
    }
  } catch (error) {
    console.error('Share slip gaji error:', error);
  }
};

/**
 * Mencetak Struk Transaksi secara Otomatis (Direct Native / System Print Fallback)
 */
export const printReceiptThermal = async (data: ReceiptData, overrideMacAddress?: string) => {
  const storeSettings = useSettingsStore.getState();
  let targetMac = overrideMacAddress || storeSettings.printerMacAddress;

  if (!targetMac && Platform.OS === 'android') {
    try {
      const paired = await getNativePairedDevices();
      if (paired && paired.length > 0) {
        const thermalDevice =
          paired.find((d) => /print|pos|58|thermal|goojpr|mpt|rpp|vsc|panda/i.test(d.name)) || paired[0];
        targetMac = thermalDevice.address;
      }
    } catch (e) {
      // Ignore paired device fetch errors silently
    }
  }

  // Jika ada MAC Address printer yang valid, coba cetak direct via Bluetooth
  if (targetMac && Platform.OS === 'android' && BluetoothPrinterModule?.printRawBytes) {
    try {
      const rawEscPosString = buildReceiptBytes(data);
      const bytes = stringToBytes(rawEscPosString);
      const base64Data = bytesToBase64(bytes);
      await sendToNativePrinter(targetMac, base64Data);
      return;
    } catch (nativeErr: any) {
      console.log('[BT] Direct print error, falling back to system print:', nativeErr);
    }
  }

  // Fallback Otomatis Tanpa Alert: Cetak via Dokumen Sistem / PDF Preview HP
  try {
    const html = buildReceiptHtml(data);
    await Print.printAsync({
      html,
      width: 164.4,
    });
  } catch (e) {
    await shareToBluetoothPrinter(data);
  }
};

/**
 * Mencetak Slip Gaji Karyawan secara Otomatis (Direct Native / System Print Fallback)
 */
export const printSlipGajiThermal = async (data: SlipGajiData, overrideMacAddress?: string) => {
  const storeSettings = useSettingsStore.getState();
  let targetMac = overrideMacAddress || storeSettings.printerMacAddress;

  if (!targetMac && Platform.OS === 'android') {
    try {
      const paired = await getNativePairedDevices();
      if (paired && paired.length > 0) {
        const thermalDevice =
          paired.find((d) => /print|pos|58|thermal|goojpr|mpt|rpp|vsc|panda/i.test(d.name)) || paired[0];
        targetMac = thermalDevice.address;
      }
    } catch (e) {
      // Ignore paired device fetch errors silently
    }
  }

  if (targetMac && Platform.OS === 'android' && BluetoothPrinterModule?.printRawBytes) {
    try {
      const rawEscPosString = buildSlipGajiBytes(data);
      const bytes = stringToBytes(rawEscPosString);
      const base64Data = bytesToBase64(bytes);
      await sendToNativePrinter(targetMac, base64Data);
      return;
    } catch (nativeErr: any) {
      console.log('[BT] Direct slip print error, falling back to system print:', nativeErr);
    }
  }

  try {
    const html = buildSlipGajiHtml(data);
    await Print.printAsync({
      html,
      width: 164.4,
    });
  } catch (e) {
    await shareSlipGajiToBluetoothPrinter(data);
  }
};
