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

// Re-export formatter types & utilities for backward compatibility
export { ReceiptData, SlipGajiData } from './receiptFormatter';

/**
 * Request runtime Bluetooth permissions on Android
 * (Menangani izin BLUETOOTH_CONNECT & BLUETOOTH_SCAN pada Android 12+)
 */
export const requestBluetoothPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;

  try {
    if (Platform.Version >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      ]);

      const isConnectGranted =
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;

      if (!isConnectGranted) {
        Alert.alert(
          'Izin Bluetooth Ditolak',
          'Izin Bluetooth diperlukan untuk mencari dan menghubungkan printer. Silakan izinkan di Pengaturan HP Anda.'
        );
        return false;
      }
      return true;
    } else {
      // Android 11 kebawah memerlukan ACCESS_FINE_LOCATION untuk pemindaian BT
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        // Lokasi opsional untuk paired device, abaikan bila ditolak namun return true jika Bluetooth aktif
        return true;
      }
      return true;
    }
  } catch (err) {
    console.warn('Bluetooth permission request error:', err);
    return false;
  }
};

/**
 * Mendapatkan Daftar Device Bluetooth Thermal yang Sudah Di-Pairing di HP
 */
export const getNativePairedDevices = async (): Promise<BluetoothDeviceInfo[]> => {
  if (Platform.OS === 'android' && BluetoothPrinterModule?.getPairedDevices) {
    const hasPerms = await requestBluetoothPermissions();
    if (!hasPerms) return [];

    try {
      const devices = await BluetoothPrinterModule.getPairedDevices();
      return devices || [];
    } catch (e: any) {
      console.log('Error fetching native paired devices:', e);
      Alert.alert('Info Bluetooth', e?.message || 'Gagal mengambil daftar perangkat Bluetooth.');
    }
  }
  return [];
};

/**
 * Membuka Halaman Pengaturan Bluetooth HP Android Secara Langsung
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
 * Membuka Halaman Pengaturan Layanan Cetak Bawaan HP Android
 */
export const openAndroidPrintSettings = async () => {
  if (Platform.OS === 'android') {
    try {
      await Linking.sendIntent('android.settings.ACTION_PRINT_SETTINGS');
    } catch (e) {
      await openBluetoothSettings();
    }
  } else {
    await Linking.openSettings();
  }
};

/**
 * Membuka Halaman Download Driver Bluetooth Printer RawBT di Play Store
 */
export const openRawBTPlayStore = () => {
  Linking.openURL('market://details?id=ru.a414.rawbt').catch(() => {
    Linking.openURL('https://play.google.com/store/apps/details?id=ru.a414.rawbt');
  });
};

/**
 * Fungsi Utama Pengiriman Byte Raw ke Native Bluetooth Module dengan Penanganan Error Ramah Pengguna
 */
const sendToNativePrinter = async (macAddress: string, base64Data: string): Promise<boolean> => {
  if (Platform.OS !== 'android' || !BluetoothPrinterModule?.printRawBytes) {
    throw new Error('Sistem cetak Bluetooth Native hanya tersedia di Android.');
  }

  const hasPerms = await requestBluetoothPermissions();
  if (!hasPerms) {
    throw new Error('Izin Bluetooth diperlukan untuk menghubungkan printer.');
  }

  try {
    await BluetoothPrinterModule.printRawBytes(macAddress, base64Data);
    return true;
  } catch (error: any) {
    console.error('Native printer socket error:', error);
    // Terjemahkan pesan error teknis menjadi pesan ramah pengguna Indonesia
    const code = error?.code || '';
    const message = error?.message || '';

    if (code === 'BLUETOOTH_DISABLED' || message.includes('Bluetooth belum dinyalakan')) {
      throw new Error('Bluetooth belum dinyalakan. Silakan aktifkan Bluetooth HP Anda.');
    }
    if (code === 'PRINTER_NOT_PAIRED' || message.includes('tidak ditemukan pada daftar')) {
      throw new Error('Printer belum dipasangkan dengan HP ini. Silakan pair printer di Pengaturan Bluetooth HP.');
    }
    if (code === 'INVALID_MAC' || message.includes('tidak valid')) {
      throw new Error('Alamat MAC printer tidak valid. Silakan pilih printer kembali di Pengaturan.');
    }
    if (code === 'CONNECTION_FAILED' || message.includes('Tidak dapat terhubung')) {
      throw new Error('Tidak dapat terhubung ke printer. Pastikan printer menyala dan berada dalam jangkauan Bluetooth.');
    }

    throw new Error(message || 'Gagal terhubung ke printer thermal.');
  }
};

/**
 * FITUR REKOMENDASI: Tes Cetak Struk (Test Print)
 * Menguji apakah printer terpilih terhubung dan dapat mencetak dengan lancar.
 */
export const testPrintThermal = async (targetMacAddress?: string): Promise<boolean> => {
  const storeSettings = useSettingsStore.getState();
  const mac = targetMacAddress || storeSettings.printerMacAddress;

  if (!mac) {
    Alert.alert(
      'Printer Belum Dipilih',
      'Silakan pilih printer terlebih dahulu di menu Pengaturan Printer.'
    );
    return false;
  }

  try {
    const rawEscPosString = buildTestPrintBytes(storeSettings.businessName);
    const bytes = stringToBytes(rawEscPosString);
    const base64Data = bytesToBase64(bytes);

    await sendToNativePrinter(mac, base64Data);
    Alert.alert('Sukses Test Print', 'Printer berhasil terhubung dan mencetak struk tes!');
    return true;
  } catch (e: any) {
    Alert.alert('Gagal Test Print', e.message || 'Gagal melakukan uji coba cetak.');
    return false;
  }
};

/**
 * Mengirim berkas Struk ESC/POS ke fitur "Share via Bluetooth" Bawaan HP Android (Fallback)
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
        dialogTitle: 'Kirim Ke Printer Bluetooth (Fitur Bawaan HP)',
      });
    }
  } catch (error) {
    console.error('Share to Bluetooth printer error:', error);
  }
};

/**
 * Mengirim berkas Slip Gaji ESC/POS ke fitur "Share via Bluetooth" Bawaan HP Android (Fallback)
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
        dialogTitle: 'Kirim Ke Printer Bluetooth (Fitur Bawaan HP)',
      });
    }
  } catch (error) {
    console.error('Share to Bluetooth printer error:', error);
  }
};

/**
 * Mencetak Struk Transaksi secara 100% Murni Native via Bluetooth Socket Aplikasi Koko Motowash
 */
export const printReceiptThermal = async (data: ReceiptData, overrideMacAddress?: string) => {
  const rawEscPosString = buildReceiptBytes(data);
  const bytes = stringToBytes(rawEscPosString);
  const base64Data = bytesToBase64(bytes);

  // Ambil MAC Address printer yang tersimpan di pengaturan lokal
  const storeSettings = useSettingsStore.getState();
  let targetMac = overrideMacAddress || storeSettings.printerMacAddress;

  // Jika belum ada printer tersimpan di pengaturan, coba cari printer paired otomatis
  if (!targetMac && Platform.OS === 'android') {
    const paired = await getNativePairedDevices();
    if (paired && paired.length > 0) {
      const thermalDevice =
        paired.find((d) => /print|pos|58|thermal|goojpr|mpt|rpp|vsc|panda/i.test(d.name)) || paired[0];
      targetMac = thermalDevice.address;
    }
  }

  // Jika tetap belum ada printer yang terpilih/ditemukan:
  if (!targetMac) {
    Alert.alert(
      'Printer Belum Dipilih',
      'Silakan pilih printer terlebih dahulu di menu Pengaturan Printer.'
    );
    return;
  }

  // 1. UTAMA: Cetak MURNI Native Bluetooth Socket (Direct Connection)
  if (Platform.OS === 'android' && BluetoothPrinterModule?.printRawBytes) {
    try {
      await sendToNativePrinter(targetMac, base64Data);
      return;
    } catch (nativeErr: any) {
      console.log('Native Bluetooth Socket error, mencoba fallback RawBT/System Print:', nativeErr);
      // Tampilkan error ramah pengguna jika penyebab utamanya adalah Bluetooth mati / Belum pair
      if (
        nativeErr.message.includes('Bluetooth belum dinyalakan') ||
        nativeErr.message.includes('belum dipasangkan') ||
        nativeErr.message.includes('tidak valid')
      ) {
        Alert.alert('Gagal Cetak', nativeErr.message);
        return;
      }
    }
  }

  // 2. Fallback: RawBT Driver Intent (Jikalau terpasang)
  try {
    const rawBtUrl = `rawbt:base64,${base64Data}`;
    await Linking.openURL(rawBtUrl);
    return;
  } catch (err) {
    // RawBT tidak terpasang
  }

  // 3. Fallback: Cetak 58mm via Layanan Cetak Sistem HP (Expo Print)
  try {
    const html = buildReceiptHtml(data);
    await Print.printAsync({
      html,
      width: 164.4, // 164.4 points = Tepat Kertas 58mm Thermal
    });
  } catch (e) {
    // Fallback Terakhir: Kirim via Bluetooth Share HP Bawaan
    await shareToBluetoothPrinter(data);
  }
};

/**
 * Mencetak Slip Gaji secara 100% Murni Native via Bluetooth Socket Aplikasi Koko Motowash
 */
export const printSlipGajiThermal = async (data: SlipGajiData, overrideMacAddress?: string) => {
  const rawEscPosString = buildSlipGajiBytes(data);
  const bytes = stringToBytes(rawEscPosString);
  const base64Data = bytesToBase64(bytes);

  const storeSettings = useSettingsStore.getState();
  let targetMac = overrideMacAddress || storeSettings.printerMacAddress;

  if (!targetMac && Platform.OS === 'android') {
    const paired = await getNativePairedDevices();
    if (paired && paired.length > 0) {
      const thermalDevice =
        paired.find((d) => /print|pos|58|thermal|goojpr|mpt|rpp|vsc|panda/i.test(d.name)) || paired[0];
      targetMac = thermalDevice.address;
    }
  }

  if (!targetMac) {
    Alert.alert(
      'Printer Belum Dipilih',
      'Silakan pilih printer terlebih dahulu di menu Pengaturan Printer.'
    );
    return;
  }

  // 1. UTAMA: Cetak MURNI Native Bluetooth Socket (Direct Connection)
  if (Platform.OS === 'android' && BluetoothPrinterModule?.printRawBytes) {
    try {
      await sendToNativePrinter(targetMac, base64Data);
      return;
    } catch (nativeErr: any) {
      console.log('Native Bluetooth Socket error:', nativeErr);
      if (
        nativeErr.message.includes('Bluetooth belum dinyalakan') ||
        nativeErr.message.includes('belum dipasangkan') ||
        nativeErr.message.includes('tidak valid')
      ) {
        Alert.alert('Gagal Cetak', nativeErr.message);
        return;
      }
    }
  }

  // 2. Fallback: RawBT Driver Intent (Jikalau terpasang)
  try {
    const rawBtUrl = `rawbt:base64,${base64Data}`;
    await Linking.openURL(rawBtUrl);
    return;
  } catch (err) {
    // RawBT tidak terpasang
  }

  // 3. Fallback: Cetak 58mm via Layanan Cetak Sistem HP
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
